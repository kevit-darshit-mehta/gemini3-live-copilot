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
    this.model = "gemini-2.5-flash-native-audio-latest";
    this.host = "generativelanguage.googleapis.com";
    // Switch to v1beta as v1alpha might not support output_audio_transcription for this model
    this.uri = `wss://${this.host}/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${this.apiKey}`;

    this.systemInstruction = `You are Kora, a friendly and professional customer support AI assistant.

CRITICAL OUTPUT RULE:
You are in AUDIO-ONLY mode.
To display your words to the user, you MUST use the "log_message" tool.
For EVERY response, call "log_message" with the exact text you are speaking.

EXAMPLE:
User: "Hi"
You Call Tool: log_message({ message: "Hello! How can I help?" })
(Then you speak "Hello! How can I help?")

Do NOT output loose text. ONLY use the tool.
`;
    this.aiTextBuffer = "";
    this.lastEmittedText = "";
  }

  /**
   * Initialize the Gemini Live session (WebSocket connection)
   */
  async initialize() {
    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.uri);

        this.ws.on("open", () => {
          logger.info("Connected to Live API (v1beta)");
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
          response_modalities: ["AUDIO"], // Revert to stable AUDIO-only
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
        tools: [
          {
            function_declarations: [
              {
                name: "log_message",
                description: "Logs the spoken text for the transcript.",
                parameters: {
                  type: "OBJECT",
                  properties: {
                    message: { type: "STRING" },
                  },
                  required: ["message"],
                },
              },
            ],
          },
        ],
        // Enable transcription
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
            parts: [
              {
                text:
                  text +
                  "\n\n(SYSTEM: Remember to use the THOUGHT/SPEECH format. Start with SPEECH: ...)",
              },
            ],
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

      // ... (rest of handleMessage) ...

      // Handle ServerContent (Audio/Text)
      if (response.serverContent) {
        const content = response.serverContent;

        // Handle Model Turn (Output)
        if (content.modelTurn) {
          const parts = content.modelTurn.parts;

          for (const part of parts) {
            // 1. Handle Function Calls (The Correct Way)
            if (part.functionCall) {
              this.handleToolCall(part.functionCall);
              continue;
            }

            // 2. Handle Text (Fallback logging)
            if (part.text) {
              // logger.debug(`AI Raw Text: "${part.text.substring(0, 50)}..."`);
            }

            // 3. Handle Audio
            if (
              part.inlineData &&
              part.inlineData.mimeType.startsWith("audio/")
            ) {
              this.emit("audio", part.inlineData.data);
            }
          }
        }

        // Handle turn completion
        if (content.turnComplete) {
          logger.info("Turn complete");
          this.emit("turn_complete");
        }

        // ... (outputAudioTranscription can stay as backup, though likely unused) ...

        // Handle audio transcription (text version of what AI speaks)
        // NOTE: This doesn't seem to work with current Gemini Live API config
        if (content.outputAudioTranscription) {
          const transcriptionText = content.outputAudioTranscription.text;
          if (transcriptionText) {
            logger.info(
              `AI Transcription: "${transcriptionText.substring(0, 100)}..."`,
            );
            this.emit("response", { type: "text", content: transcriptionText });
          }
        }

        // ... (Input transcription handling remains same) ...
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

            // Set a debounce timeout - emit after 400ms of no new words (faster feedback)
            this.transcriptionTimeout = setTimeout(() => {
              if (this.pendingInputTranscription) {
                const completeText = this.pendingInputTranscription.trim();
                // Final English check before emitting
                if (isEnglishText(completeText)) {
                  logger.info(`Customer (English): "${completeText}"`);
                  this.emit("input_transcription", { text: completeText });
                } else {
                  logger.debug(
                    `Rejected non-English sentence: "${completeText.substring(0, 50)}..."`,
                  );
                }
                this.pendingInputTranscription = "";
              }
            }, 400);
          }
        }

        // Handle turn completion
        if (content.turnComplete) {
          logger.info("Turn complete");
          this.emit("turn_complete");
        }
      }

      // Handle setup complete
      if (response.setupComplete) {
        logger.info("Gemini session setup complete");
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
