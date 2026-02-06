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

IMPORTANT: You are in voice conversation mode. Speak naturally and directly to the customer.
Do NOT include any internal thoughts, meta-commentary, or markdown formatting in your speech.
Just speak your response naturally as if talking to a person in English.

Example:
❌ BAD: "**Addressing the greeting** I've acknowledged..."
✅ GOOD: "Hello! How can I help you today?"

Note: Always respond in English. If you detect non-English input, respond naturally in English without commenting on the language.
`;
    // Buffer for accumulating transcription chunks
    this.transcriptionBuffer = "";
  }

  /**
   * Initialize the Gemini Live session (WebSocket connection)
   */
  async initialize() {
    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.uri);

        this.ws.on("open", () => {
          logger.info("[Gemini Live] ✅ Connected to Live API (v1beta)");
          this.isActive = true;
          this.setupSession();
          resolve(true);
        });

        this.ws.on("message", (data) => {
          this.handleMessage(data);
        });

        this.ws.on("error", (error) => {
          logger.error(
            `[Gemini Live] WebSocket error: ${error.message || error}`,
          );
          logger.error(`[Gemini Live] Error details:`, error);
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

    // Echo detection: Track recent AI responses to filter out speaker echo
    this.recentAIResponses = [];

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
        // Enable transcriptions
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
   * Clean transcript by removing internal thoughts and formatting
   * @param {string} text - Raw transcript text
   * @returns {string} - Cleaned text
   */
  cleanTranscript(text) {
    if (!text) return "";

    let cleaned = text;

    // Remove markdown bold markers (**text**)
    cleaned = cleaned.replace(/\*\*([^*]+)\*\*/g, "$1");

    // Remove thought markers and meta-commentary
    // Patterns like "**Something** description" or "*thinking* text"
    cleaned = cleaned.replace(/\*[^*]+\*/g, "");

    // Remove common meta-phrases that indicate internal thoughts
    const metaPhrases = [
      /\*\*[^*]+\*\*\s*/g, // Any **bold** text
      /^.*?(acknowledg|address|formulat|maintain|focus|believe|plan).{0,100}?\.\s*/gi,
      /^I've .{0,50}?\.\s*/gi,
      /^My .{0,50}?\.\s*/gi,
      /^Now,?\s*I\s+(am|will).{0,50}?\.\s*/gi,
    ];

    metaPhrases.forEach((pattern) => {
      cleaned = cleaned.replace(pattern, "");
    });

    // Trim and clean up multiple spaces
    cleaned = cleaned.trim().replace(/\s+/g, " ");

    return cleaned;
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

      // DEBUG: Log what we receive from Gemini
      logger.info(
        `[DEBUG] Response top-level keys: ${Object.keys(response).join(", ")}`,
      );
      if (response.serverContent) {
        const contentKeys = Object.keys(response.serverContent);
        logger.info(`[DEBUG] Gemini response keys: ${contentKeys.join(", ")}`);
        // If we see inputTranscription, dump it fully
        if (response.serverContent.inputTranscription) {
          logger.info(
            `[DEBUG] *** INPUT TRANSCRIPTION FOUND: ${JSON.stringify(response.serverContent.inputTranscription)}`,
          );
        }
      }

      // ... (rest of handleMessage) ...

      // Handle ServerContent (Audio/Text)
      if (response.serverContent) {
        const content = response.serverContent;

        // Handle Model Turn (Output)
        if (content.modelTurn) {
          const parts = content.modelTurn.parts;

          for (const part of parts) {
            // Handle regular text (with filtering)
            if (part.text) {
              const cleanedText = this.cleanTranscript(part.text);
              if (cleanedText) {
                logger.info(`AI Text: "${cleanedText.substring(0, 100)}..."`);
                this.emit("response", { type: "text", content: cleanedText });
              }
            }

            // Handle Audio
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

          // Flush any remaining transcription buffer
          if (this.transcriptionBuffer && this.transcriptionBuffer.trim()) {
            let finalText = this.cleanTranscript(
              this.transcriptionBuffer.trim(),
            );

            if (finalText) {
              logger.info(`AI Response (final): "${finalText}"`);
              this.emit("response", {
                type: "text",
                content: finalText,
              });
            }
            this.transcriptionBuffer = "";
          }

          this.emit("turn_complete");
        }

        // Handle output transcription (accumulate chunks into sentences)
        if (content.outputTranscription) {
          const chunk = content.outputTranscription.text;
          if (chunk) {
            this.transcriptionBuffer += chunk;

            // Check if we have a complete sentence (ends with . ! ?)
            const sentenceMatch =
              this.transcriptionBuffer.match(/^(.*?[.!?])\s*/);

            if (sentenceMatch) {
              let completeSentence = sentenceMatch[1].trim();

              // Filter out internal thoughts and meta-commentary
              completeSentence = this.cleanTranscript(completeSentence);

              if (completeSentence) {
                logger.info(`AI Response: "${completeSentence}"`);

                // Store AI response for echo detection (keep for 10 seconds)
                this.recentAIResponses.push({
                  text: completeSentence
                    .toLowerCase()
                    .replace(/[.,!?;:'"()-]/g, "")
                    .trim(),
                  timestamp: Date.now(),
                });
                // Clean old entries (older than 10 seconds)
                const now = Date.now();
                this.recentAIResponses = this.recentAIResponses.filter(
                  (r) => now - r.timestamp < 10000,
                );

                this.emit("response", {
                  type: "text",
                  content: completeSentence,
                });
              }

              // Remove the emitted sentence from buffer
              this.transcriptionBuffer = this.transcriptionBuffer
                .substring(sentenceMatch[0].length)
                .trim();
            }
          }
        }

        // ... (Input transcription handling remains same) ...
        // DEBUG: Check all keys in content for inputTranscription
        if (
          Object.keys(content).some(
            (k) =>
              k.toLowerCase().includes("input") ||
              k.toLowerCase().includes("transcript"),
          )
        ) {
          logger.info(
            `[DEBUG] Found input-related key in content: ${Object.keys(content).join(", ")}`,
          );
        }
        if (content.inputTranscription) {
          const customerText = content.inputTranscription.text;
          logger.info(`[TRANSCRIPTION] Received: "${customerText}"`);

          // Only process English text - reject Hindi/Gujarati/etc.
          if (customerText && isEnglishText(customerText)) {
            logger.info(
              `[TRANSCRIPTION] Passed English check: "${customerText}"`,
            );
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
                  // Echo detection: Check if this matches any recent AI response
                  const normalizedInput = completeText
                    .toLowerCase()
                    .replace(/[.,!?;:'"()-]/g, "")
                    .trim();
                  const isEcho = this.recentAIResponses.some((aiResp) => {
                    // Check if customer input contains AI response or vice versa (partial match)
                    return (
                      normalizedInput.includes(aiResp.text) ||
                      aiResp.text.includes(normalizedInput)
                    );
                  });

                  if (isEcho) {
                    logger.info(
                      `[ECHO DETECTED] Skipping AI echo from customer input: "${completeText.substring(0, 50)}..."`,
                    );
                  } else {
                    logger.info(`Customer (English): "${completeText}"`);
                    this.emit("input_transcription", { text: completeText });
                  }
                } else {
                  logger.debug(
                    `Rejected non-English sentence: "${completeText.substring(0, 50)}..."`,
                  );
                }
                this.pendingInputTranscription = "";
              }
            }, 400);
          } else {
            logger.warn(
              `[TRANSCRIPTION] Failed English check: "${customerText}"`,
            );
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
