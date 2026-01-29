import { WebSocket } from "ws";
import { EventEmitter } from "events";
import { Logger } from "@gemini-copilot/shared";

const logger = new Logger("GeminiLive");

/**
 * Check if text is English-only (Latin characters, numbers, punctuation)
 * Returns false if text contains Devanagari, Gujarati, or other non-Latin scripts
 */
function isEnglishText(text) {
  if (!text) return false;

  // Regex pattern for non-English scripts (Devanagari, Gujarati, etc.)
  // This matches Hindi, Gujarati, Bengali, Tamil, Telugu, and other Indic scripts
  const nonLatinPattern =
    /[\u0900-\u097F\u0A80-\u0AFF\u0980-\u09FF\u0B00-\u0B7F\u0C00-\u0C7F\u0C80-\u0CFF\u0D00-\u0D7F]/;

  // If text contains non-Latin characters, reject it
  if (nonLatinPattern.test(text)) {
    logger.debug(`Rejected non-English text: "${text.substring(0, 50)}..."`);
    return false;
  }

  // Also check if at least 50% of the text is Latin letters
  const latinChars = text.match(/[a-zA-Z]/g) || [];
  const totalChars = text.replace(/\s/g, "").length;

  if (totalChars > 0 && latinChars.length / totalChars < 0.3) {
    logger.debug(`Rejected low-Latin text: "${text.substring(0, 50)}..."`);
    return false;
  }

  return true;
}

export class GeminiLiveSession extends EventEmitter {
  constructor(apiKey) {
    super();
    this.apiKey = apiKey;
    this.ws = null;
    this.isActive = false;
    this.isPaused = false;
    this.model = "gemini-3-flash-preview";
    this.host = "generativelanguage.googleapis.com";
    this.uri = `wss://${this.host}/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent?key=${this.apiKey}`;

    this.systemInstruction = `You are Kora, a friendly and professional customer support AI assistant.

CRITICAL OUTPUT RULES (MUST FOLLOW):
- You are SPEAKING directly to a customer via voice.
- Output ONLY the words you want the customer to HEAR.
- NEVER include thoughts, reasoning, actions, or metadata in your output.
- NEVER use formatting like "**Acknowledge**", "[Action]", "My next step is...", or "I will...".
- NEVER explain what you are doing or thinking.
- Just speak naturally as if you are on a phone call.

LANGUAGE: Always respond in English only.

EXAMPLE OF WRONG OUTPUT (DO NOT DO THIS):
"**Acknowledge and Prompt** I'm noting the user's Hello. I will offer assistance."

EXAMPLE OF CORRECT OUTPUT (DO THIS):
"Hello! How can I help you today?"

YOUR BEHAVIOR:
- Be warm, helpful, and patient.
- Ask clarifying questions when needed.
- Keep responses concise and conversational.
- If you don't know something, say so politely.
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
          logger.info("Connected to Live API");
          this.isActive = true;
          this.setupSession();
          resolve(true);
        });

        this.ws.on("message", (data) => {
          this.handleMessage(data);
        });

        this.ws.on("error", (error) => {
          logger.error("WebSocket error:", error);
          this.emit("error", error);
          reject(error);
        });

        this.ws.on("close", (code, reason) => {
          logger.info(`Disconnected: ${code} - ${reason}`);
          this.isActive = false;
          this.emit("closed");
        });
      } catch (error) {
        logger.error("Connection failed:", error);
        reject(error);
      }
    });
  }

  /**
   * Send initial setup message (Handshake)
   */
  setupSession() {
    // Buffer to aggregate partial transcriptions
    this.pendingInputTranscription = "";
    this.transcriptionTimeout = null;

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
        // Enable transcription at setup level
        input_audio_transcription: {},
        output_audio_transcription: {},
      },
    };

    logger.info("Sending setup message to Gemini Live API");
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

      // Handle ServerContent (Audio/Text)
      if (response.serverContent) {
        const content = response.serverContent;

        // Handle Model Turn (Output)
        if (content.modelTurn) {
          const parts = content.modelTurn.parts;
          for (const part of parts) {
            // Handle inline text (if sent)
            if (part.text) {
              logger.info(`AI Text: "${part.text.substring(0, 100)}..."`);
              this.emit("response", { type: "text", content: part.text });
            }
            // Handle audio data
            if (
              part.inlineData &&
              part.inlineData.mimeType.startsWith("audio/")
            ) {
              logger.debug(`Audio chunk: ${part.inlineData.data.length} bytes`);
              this.emit("audio", part.inlineData.data);
            }
          }
        }

        // Handle audio transcription (text version of what AI speaks)
        if (content.outputAudioTranscription) {
          const transcriptionText = content.outputAudioTranscription.text;
          if (transcriptionText) {
            logger.info(
              `AI Transcription: "${transcriptionText.substring(0, 100)}..."`,
            );
            this.emit("response", { type: "text", content: transcriptionText });
          }
        }

        // Handle input transcription (customer's speech transcribed by Gemini)
        // Buffer partial transcriptions to form complete sentences
        if (content.inputTranscription) {
          const customerText = content.inputTranscription.text;
          // Only process English text - reject Hindi/Gujarati/etc.
          if (customerText && isEnglishText(customerText)) {
            // Append to pending transcription buffer
            if (this.pendingInputTranscription) {
              this.pendingInputTranscription += " " + customerText;
            } else {
              this.pendingInputTranscription = customerText;
            }

            // Clear existing timeout
            if (this.transcriptionTimeout) {
              clearTimeout(this.transcriptionTimeout);
            }

            // Set a debounce timeout - emit after 800ms of no new words
            this.transcriptionTimeout = setTimeout(() => {
              if (this.pendingInputTranscription) {
                const completeText = this.pendingInputTranscription.trim();
                // Final English check before emitting
                if (isEnglishText(completeText)) {
                  logger.info(`Customer (English): "${completeText}"`);
                  this.emit("input_transcription", { text: completeText });
                } else {
                  logger.info(
                    `Rejected non-English sentence: "${completeText.substring(0, 50)}..."`,
                  );
                }
                this.pendingInputTranscription = "";
              }
            }, 800);
          }
        }

        if (content.turnComplete) {
          logger.info("Turn complete");
          // Flush any pending transcription on turn complete
          if (this.pendingInputTranscription) {
            const completeText = this.pendingInputTranscription.trim();
            // Final English check before emitting
            if (isEnglishText(completeText)) {
              logger.info(`Customer (flushed): "${completeText}"`);
              this.emit("input_transcription", { text: completeText });
            } else {
              logger.info(
                `Rejected non-English (flushed): "${completeText.substring(0, 50)}..."`,
              );
            }
            this.pendingInputTranscription = "";
            if (this.transcriptionTimeout) {
              clearTimeout(this.transcriptionTimeout);
              this.transcriptionTimeout = null;
            }
          }
          this.emit("turn_complete");
        }
      }

      // Handle setup complete
      if (response.setupComplete) {
        logger.info("Gemini session setup complete");
      }

      // Handle Tool Calls (Not implemented for this demo but good for future)
      if (response.toolCall) {
        logger.info("Tool call received:", response.toolCall);
      }
    } catch (error) {
      logger.error("Error parsing message:", error);
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
    logger.info("Injecting context:", contextMessage);
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
