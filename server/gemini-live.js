/**
 * Gemini Live API Session Handler
 * Handles real-time audio/text communication with Gemini 2.0 via WebSocket
 */

import { WebSocket } from "ws";
import { EventEmitter } from "events";

export class GeminiLiveSession extends EventEmitter {
  constructor(apiKey) {
    super();
    this.apiKey = apiKey;
    this.ws = null;
    this.isActive = false;
    this.isPaused = false;
    this.model = "gemini-2.5-flash-native-audio-latest";
    this.host = "generativelanguage.googleapis.com";
    this.uri = `wss://${this.host}/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent?key=${this.apiKey}`;

    this.systemInstruction = `You are a helpful, professional customer support AI assistant.
      Your role is to:
      - Answer customer questions accurately and helpfully
      - Be friendly, patient, and empathic
      - Escalate complex issues to human supervisors when appropriate.
      - Speak clearly and concisely.
      - IMPORTANT: Do NOT output your internal thought process, monologue, or reasoning. Only output the final response to the user.
    `;
  }

  /**
   * Initialize the Gemini Live session (WebSocket connection)
   */
  async initialize() {
    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.uri);

        this.ws.on("open", () => {
          console.log("[Gemini] Connected to Live API");
          this.isActive = true;
          this.setupSession();
          resolve(true);
        });

        this.ws.on("message", (data) => {
          this.handleMessage(data);
        });

        this.ws.on("error", (error) => {
          console.error("[Gemini] WebSocket error:", error);
          this.emit("error", error);
          reject(error);
        });

        this.ws.on("close", (code, reason) => {
          console.log(`[Gemini] Disconnected: ${code} - ${reason}`);
          this.isActive = false;
          this.emit("closed");
        });
      } catch (error) {
        console.error("[Gemini] Connection failed:", error);
        reject(error);
      }
    });
  }

  /**
   * Send initial setup message (Handshake)
   */
  setupSession() {
    const setupMessage = {
      setup: {
        model: `models/${this.model}`,
        generation_config: {
          response_modalities: ["AUDIO"],
          speech_config: {
            voice_config: {
              prebuilt_voice_config: {
                voice_name: "Kore",
              },
            },
          },
        },
        system_instruction: {
          parts: [{ text: this.systemInstruction }],
        },
      },
    };

    this.sendJson(setupMessage);
  }

  /**
   * Send audio chunks to Gemini (16kHz PCM)
   * @param {string} base64Audio - Base64 encoded Int16 PCM audio
   */
  async sendAudio(base64Audio) {
    if (!this.isActive || this.isPaused || !this.ws) return;

    const audioMessage = {
      realtime_input: {
        media_chunks: [
          {
            mime_type: "audio/pcm",
            data: base64Audio,
          },
        ],
      },
    };

    this.sendJson(audioMessage);
  }

  /**
   * Send text to Gemini (inject context or user text)
   * @param {string} text
   */
  async sendText(text) {
    if (!this.isActive || this.isPaused || !this.ws) return;

    const textMessage = {
      client_content: {
        turns: [
          {
            role: "user",
            parts: [{ text: text }],
          },
        ],
        turn_complete: true,
      },
    };

    this.sendJson(textMessage);
  }

  /**
   * Handle incoming messages from Gemini
   */
  handleMessage(data) {
    if (this.isPaused) return;

    try {
      let response;
      if (data instanceof Buffer) {
        response = JSON.parse(data.toString());
      } else {
        response = JSON.parse(data);
      }

      // Handle ServeContent (Audio/Text)
      if (response.serverContent) {
        const content = response.serverContent;

        // Handle Model Turn (Output)
        if (content.modelTurn) {
          const parts = content.modelTurn.parts;
          for (const part of parts) {
            if (part.text) {
              this.emit("response", { type: "text", content: part.text });
            }
            if (
              part.inlineData &&
              part.inlineData.mimeType.startsWith("audio/")
            ) {
              // Emit audio data (Base64)
              console.log(
                `[Gemini] Received audio chunk: ${part.inlineData.data.length} bytes`,
              );
              this.emit("audio", part.inlineData.data);
            }
          }
        }

        if (content.turnComplete) {
          this.emit("turn_complete");
        }
      }

      // Handle Tool Calls (Not implemented for this demo but good for future)
      if (response.toolCall) {
        console.log("Tool call received:", response.toolCall);
      }
    } catch (error) {
      console.error("[Gemini] Error parsing message:", error);
    }
  }

  sendJson(object) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(object));
    }
  }

  /**
   * Inject context into the conversation (e.g. from Supervisor)
   */
  async injectContext(contextMessage) {
    console.log("[Gemini] Injecting context:", contextMessage);
    const contextPrompt = `
    [SYSTEM UPDATE - SUPERVISOR HANDOFF]
    The human supervisor has handed the conversation back to you with the following note:
    "${contextMessage}"
    
    Acknowledge this context implicitly and continue assisting the user.
    `;
    await this.sendText(contextPrompt);
  }

  async pause() {
    this.isPaused = true;
    // Potentially send a "stop generation" signal if API supports it
  }

  async resume() {
    this.isPaused = false;
    // Send a marker to indicate resumption if needed
  }

  async close() {
    this.isActive = false;
    if (this.ws) {
      this.ws.close();
    }
    this.emit("closed");
  }
}
