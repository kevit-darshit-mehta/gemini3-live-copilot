import express from "express";
import { createServer } from "http";
import { WebSocketServer } from "ws";
import { config } from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import crypto from "crypto";
import { GeminiLiveSession } from "./gemini-live.js";
import { GeminiTextAPI } from "./gemini-text.js";
import { ConversationManager } from "./conversation-manager.js";
import { Logger } from "@gemini-copilot/shared";
import databaseManager from "./database-manager.js";

// Load environment variables
config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const logger = new Logger("Server");
const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });

// Conversation manager for handling active sessions
const conversationManager = new ConversationManager();

// Gemini 3 API for enhanced analysis (coaching, analytics, summarization)
const gemini3Api = new GeminiTextAPI(process.env.GEMINI_API_KEY);

// Middleware
app.use(express.json());

// CORS Middleware
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS, PUT, DELETE");
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }
  next();
});

app.use(express.static(join(__dirname, "../public")));

// API Routes
app.get("/api/health", (req, res) => {
  res.json({
    status: "healthy",
    timestamp: new Date().toISOString(),
    activeSessions: conversationManager.getActiveSessionCount(),
  });
});

app.get("/api/sessions", (req, res) => {
  res.json(conversationManager.getAllSessions());
});

app.get("/api/sessions/:id", (req, res) => {
  const session = conversationManager.getSession(req.params.id);
  if (!session) {
    return res.status(404).json({ error: "Session not found" });
  }

  // Create serializable copy without WebSocket/Gemini objects (which have circular refs)
  const serializableSession = {
    id: session.id,
    mode: session.mode,
    transcript: session.transcript,
    sentimentScore: session.sentimentScore,
    frustrationLevel: session.frustrationLevel,
    createdAt: session.createdAt,
    lastActivity: session.lastActivity,
  };

  res.json(serializableSession);
});

// GET /api/summaries - Get all call summaries with pagination and filters
app.get("/api/summaries", async (req, res) => {
  try {
    const options = {
      limit: parseInt(req.query.limit) || 50,
      offset: parseInt(req.query.offset) || 0,
      sentiment: req.query.sentiment,
      intent: req.query.intent,
      resolution: req.query.resolution,
      sortBy: req.query.sortBy || "created_at",
      sortOrder: req.query.sortOrder || "DESC",
    };

    const summaries = await databaseManager.getAllSummaries(options);
    const stats = await databaseManager.getStatistics();

    res.json({
      summaries,
      stats,
      pagination: {
        limit: options.limit,
        offset: options.offset,
        hasMore: summaries.length === options.limit,
      },
    });
  } catch (error) {
    logger.error("Error fetching summaries:", error);
    res.status(500).json({ error: "Failed to fetch summaries" });
  }
});

// GET /api/summary/:sessionId - Get single summary by ID
app.get("/api/summary/:sessionId", async (req, res) => {
  try {
    const summary = await databaseManager.getSummary(req.params.sessionId);
    if (!summary) {
      return res.status(404).json({ error: "Summary not found" });
    }
    res.json(summary);
  } catch (error) {
    logger.error("Error fetching summary:", error);
    res.status(500).json({ error: "Failed to fetch summary" });
  }
});

// ========================================
// Gemini 3 Enhanced Features API Endpoints
// ========================================

/**
 * Get AI coaching suggestions for supervisor
 */
app.post("/api/coaching", async (req, res) => {
  try {
    const { sessionId, customerMessage } = req.body;
    const session = conversationManager.getSession(sessionId);

    if (!session) {
      return res.status(404).json({ error: "Session not found" });
    }

    const coaching = await gemini3Api.getSupervisorCoaching(
      session.transcript,
      customerMessage,
    );

    res.json(coaching);
  } catch (error) {
    logger.error("Coaching API error:", error);
    res.status(500).json({ error: "Failed to get coaching suggestions" });
  }
});

/**
 * Analyze conversation for insights (powered by Gemini 3)
 */
app.post("/api/analyze", async (req, res) => {
  try {
    const { sessionId } = req.body;
    const session = conversationManager.getSession(sessionId);

    if (!session) {
      return res.status(404).json({ error: "Session not found" });
    }

    const analysis = await gemini3Api.analyzeConversation(session.transcript);
    res.json(analysis);
  } catch (error) {
    logger.error("Analysis API error:", error);
    res.status(500).json({ error: "Failed to analyze conversation" });
  }
});

/**
 * Generate call summary (powered by Gemini 3)
 */
app.post("/api/summary", async (req, res) => {
  try {
    const { sessionId } = req.body;
    const session = conversationManager.getSession(sessionId);

    if (!session) {
      return res.status(404).json({ error: "Session not found" });
    }

    const summary = await gemini3Api.generateSummary(session.transcript);
    res.json(summary);
  } catch (error) {
    logger.error("Summary API error:", error);
    res.status(500).json({ error: "Failed to generate summary" });
  }
});

// WebSocket handling
wss.on("connection", (ws, req) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const role = url.searchParams.get("role") || "customer";
  const sessionId = url.searchParams.get("session") || crypto.randomUUID();

  logger.info(`New connection: role=${role}, session=${sessionId}`);

  // Handle different connection types
  if (role === "customer") {
    handleCustomerConnection(ws, sessionId);
  } else if (role === "supervisor") {
    handleSupervisorConnection(ws, sessionId);
  } else {
    ws.close(1008, "Invalid role");
    return;
  }
});

// Sentiment Analyzer
import { SentimentAnalyzer } from "./sentiment-analyzer.js";
const sentimentAnalyzer = new SentimentAnalyzer();

// ... (existing imports/setup)

/**
 * Handle customer WebSocket connection
 */
function handleCustomerConnection(ws, sessionId) {
  // Create or get existing session
  let session = conversationManager.getSession(sessionId);

  if (!session) {
    session = conversationManager.createSession(sessionId);

    // Initialize Gemini Live session
    const geminiSession = new GeminiLiveSession(process.env.GEMINI_API_KEY);
    session.geminiSession = geminiSession;

    // Initialize session
    geminiSession.initialize().catch((err) => {
      logger.error("Failed to initialize Gemini session", err);
    });

    // Set up Gemini event handlers
    geminiSession.on("response", (data) => {
      // Forward AI response to customer
      if (session.customerWs?.readyState === 1 && data.type === "text") {
        session.customerWs.send(
          JSON.stringify({
            type: "ai_response",
            data: { type: "text", content: data.content },
          }),
        );
      }

      // Broadcast to ALL supervisors (not just session.supervisorWs)
      if (data.type === "text") {
        broadcastToSupervisors({
          type: "ai_response",
          sessionId: sessionId,
          data: { type: "text", content: data.content },
        });
      }

      // Store in transcript
      if (data.type === "text") {
        session.transcript.push({
          role: "ai",
          content: data.content,
          timestamp: Date.now(),
        });
      }
    });

    geminiSession.on("audio", (audioData) => {
      // Forward audio to customer
      if (session.customerWs?.readyState === 1) {
        session.customerWs.send(
          JSON.stringify({
            type: "audio",
            data: audioData,
          }),
        );
      }
    });

    // Handle customer speech transcribed by Gemini
    geminiSession.on("input_transcription", (data) => {
      // Forward to customer so they see their own speech
      if (session.customerWs?.readyState === 1) {
        session.customerWs.send(
          JSON.stringify({
            type: "customer_transcription",
            content: data.text,
          }),
        );
      }

      // Broadcast to supervisors
      broadcastToSupervisors({
        type: "customer_message",
        sessionId: sessionId,
        content: data.text,
      });

      // Store in transcript
      session.transcript.push({
        role: "customer",
        content: data.text,
        timestamp: Date.now(),
      });

      // TRIGGER SENTIMENT ANALYSIS (Gemini 3 Powered)
      gemini3Api
        .analyzeSentiment(data.text, session.transcript.slice(-5))
        .then((sentimentResult) => {
          conversationManager.updateSession(sessionId, {
            sentimentScore: sentimentResult.frustrationLevel,
            frustrationLevel: sentimentResult.frustrationLevel,
          });

          // Broadcast frustration update to supervisors
          broadcastToSupervisors({
            type: "frustration_update",
            sessionId: sessionId,
            frustrationLevel: sentimentResult.frustrationLevel,
            sentiment: sentimentResult.sentiment,
            reason: sentimentResult.reason,
          });

          if (sentimentResult.shouldEscalate) {
            broadcastToSupervisors({
              type: "escalation_alert",
              sessionId: sessionId,
              reason: sentimentResult.reason || "High frustration detected",
              frustrationLevel: sentimentResult.frustrationLevel,
            });
          }

          broadcastToSupervisors({
            type: "session_update",
            sessionId: sessionId,
            data: conversationManager.serializeSession(
              conversationManager.getSession(sessionId),
            ),
          });
        })
        .catch((err) => {
          logger.error("Sentiment analysis error:", err.message);
        });

      // ===== AUTO-UPDATE ANALYTICS (EVERY MESSAGE) =====
      gemini3Api
        .analyzeConversation(session.transcript)
        .then(async (analytics) => {
          // Cache in database
          try {
            await databaseManager.cacheAnalytics(sessionId, analytics);
          } catch (dbErr) {
            logger.error("Analytics cache error:", dbErr.message);
          }

          // Broadcast to supervisors
          broadcastToSupervisors({
            type: "analytics_update",
            sessionId: sessionId,
            data: analytics,
          });

          logger.info(
            `[Auto-Analytics] ${sessionId}: ${analytics.intent}, ${analytics.sentiment}`,
          );
        })
        .catch((err) => {
          logger.error("Analytics auto-update error:", err.message);
        });

      // ===== AUTO-UPDATE AI COACHING (EVERY MESSAGE) =====
      gemini3Api
        .getSupervisorCoaching(session.transcript, data.text)
        .then(async (coaching) => {
          // Cache in database
          try {
            await databaseManager.cacheCoaching(sessionId, coaching);
          } catch (dbErr) {
            logger.error("Coaching cache error:", dbErr.message);
          }

          // Broadcast to supervisors
          broadcastToSupervisors({
            type: "coaching_update",
            sessionId: sessionId,
            data: coaching,
          });

          logger.info(
            `[Auto-Coaching] ${sessionId}: ${coaching.tone}, ${coaching.priority}`,
          );
        })
        .catch((err) => {
          logger.error("Coaching auto-update error:", err.message);
        });
    });

    geminiSession.on("error", (error) => {
      logger.error(`Error in session ${sessionId}:`, error);
      // Notify supervisor
      if (session.supervisorWs?.readyState === 1) {
        session.supervisorWs.send(
          JSON.stringify({
            type: "error",
            sessionId: sessionId,
            message: error.message,
          }),
        );
      }
    });
  }

  session.customerWs = ws;
  conversationManager.updateSession(sessionId, {
    status: "active",
    customerConnected: true,
  });

  // Broadcast to supervisors
  broadcastToSupervisors({
    type: "session_update",
    sessionId: sessionId,
    data: conversationManager.serializeSession(
      conversationManager.getSession(sessionId),
    ),
  });

  // Handle incoming messages from customer
  ws.on("message", async (message) => {
    try {
      const data = JSON.parse(message);

      if (data.type === "audio") {
        // Forward audio to Gemini or human supervisor
        if (session.mode === "human") {
          // Forward to supervisor
          if (session.supervisorWs?.readyState === 1) {
            session.supervisorWs.send(
              JSON.stringify({
                type: "customer_audio",
                sessionId: sessionId,
                data: data.data,
              }),
            );
          }
        } else {
          // Forward to Gemini
          await session.geminiSession?.sendAudio(data.data);
        }
      } else if (data.type === "text") {
        // Handle text message
        session.transcript.push({
          role: "customer",
          content: data.content,
          timestamp: Date.now(),
        });

        // ----------------------------------------------------
        // SENTIMENT ANALYSIS START
        // ----------------------------------------------------
        const analysis = sentimentAnalyzer.analyze(data.content);
        const escalationCheck = sentimentAnalyzer.checkEscalation(
          session.transcript,
        );

        // Update session with new metrics
        conversationManager.updateSession(sessionId, {
          sentimentScore: analysis.score,
          frustrationLevel: escalationCheck.frustrationLevel,
        });

        // If escalation needed, notify supervisor
        if (escalationCheck.shouldEscalate) {
          logger.warn(
            `Escalation triggered for session ${sessionId}: ${escalationCheck.reason}`,
          );
          broadcastToSupervisors({
            type: "escalation_alert",
            sessionId: sessionId,
            reason: escalationCheck.reason,
            frustrationLevel: escalationCheck.frustrationLevel,
          });
        }

        // Broadcast standard update (metrics changed)
        broadcastToSupervisors({
          type: "session_update",
          sessionId: sessionId,
          data: conversationManager.serializeSession(
            conversationManager.getSession(sessionId),
          ),
        });
        // ----------------------------------------------------
        // SENTIMENT ANALYSIS END
        // ----------------------------------------------------

        if (session.mode === "human") {
          // Forward to supervisor
          if (session.supervisorWs?.readyState === 1) {
            session.supervisorWs.send(
              JSON.stringify({
                type: "customer_message",
                sessionId: sessionId,
                content: data.content,
              }),
            );
          }
        } else {
          // Send to Gemini
          await session.geminiSession?.sendText(data.content);
        }
      } else if (data.type === "transcript") {
        // Handle speech transcript (for sentiment/display only)
        // Do NOT send to Gemini as it already hears the audio

        session.transcript.push({
          role: "customer",
          content: data.content,
          timestamp: Date.now(),
        });

        // ----------------------------------------------------
        // GEMINI 3 POWERED SENTIMENT ANALYSIS (TRANSCRIPT)
        // Non-blocking to avoid delaying AI voice response
        // ----------------------------------------------------

        // Use Gemini 3 for intelligent sentiment detection (non-blocking)
        gemini3Api
          .analyzeSentiment(data.content, session.transcript.slice(-5))
          .then((sentimentResult) => {
            conversationManager.updateSession(sessionId, {
              sentimentScore: sentimentResult.frustrationLevel,
              frustrationLevel: sentimentResult.frustrationLevel,
            });

            // Broadcast frustration update to supervisors
            broadcastToSupervisors({
              type: "frustration_update",
              sessionId: sessionId,
              frustrationLevel: sentimentResult.frustrationLevel,
              sentiment: sentimentResult.sentiment,
              reason: sentimentResult.reason,
            });

            if (sentimentResult.shouldEscalate) {
              broadcastToSupervisors({
                type: "escalation_alert",
                sessionId: sessionId,
                reason: sentimentResult.reason || "High frustration detected",
                frustrationLevel: sentimentResult.frustrationLevel,
              });
            }

            broadcastToSupervisors({
              type: "session_update",
              sessionId: sessionId,
              data: conversationManager.serializeSession(
                conversationManager.getSession(sessionId),
              ),
            });
          })
          .catch((err) => {
            logger.error("Sentiment analysis error:", err.message);
          });

        // Auto-trigger analytics update (non-blocking)
        gemini3Api
          .analyzeConversation(session.transcript)
          .then((analytics) => {
            broadcastToSupervisors({
              type: "analytics_update",
              sessionId: sessionId,
              data: analytics,
            });
          })
          .catch(() => {});

        // If in human takeover mode, auto-trigger coaching suggestions
        if (session.mode === "human") {
          gemini3Api
            .getSupervisorCoaching(session.transcript, data.content)
            .then((coaching) => {
              broadcastToSupervisors({
                type: "coaching_update",
                sessionId: sessionId,
                data: coaching,
              });
            })
            .catch(() => {});
        }

        // Broadcast customer message to ALL supervisors
        broadcastToSupervisors({
          type: "customer_message",
          sessionId: sessionId,
          content: data.content,
        });
      }
    } catch (error) {
      logger.error("Error processing customer message:", error);
    }
  });

  ws.on("close", async () => {
    logger.info(`Customer disconnected from session ${sessionId}`);
    session.customerWs = null;
    conversationManager.updateSession(sessionId, { customerConnected: false });

    // ===== GENERATE & SAVE CALL SUMMARY =====
    if (session.transcript && session.transcript.length > 0) {
      try {
        // Generate summary using Gemini 3
        const summary = await gemini3Api.generateSummary(session.transcript);

        // Calculate frustration metrics from transcript
        const frustrations = session.transcript
          .filter((m) => m.frustrationLevel !== undefined)
          .map((m) => m.frustrationLevel);
        const frustrationAvg =
          frustrations.length > 0
            ? frustrations.reduce((a, b) => a + b, 0) / frustrations.length
            : session.frustrationLevel || 0;
        const frustrationMax =
          frustrations.length > 0
            ? Math.max(...frustrations)
            : session.frustrationLevel || 0;

        // Prepare session data with metrics
        const sessionData = {
          ...session,
          frustrationAvg: frustrationAvg,
          frustrationMax: frustrationMax,
          escalationCount: session.escalationCount || 0,
          escalationAlerts: session.escalationAlerts || [],
          supervisorInterventions: session.supervisorInterventions || 0,
          supervisorId: session.takenOverBy || null,
          supervisorTakeoverDuration: session.supervisorTakeoverDuration || 0,
        };

        // Save to database
        await databaseManager.saveCallSummary(sessionId, sessionData, summary);

        logger.info(`Call summary saved: ${sessionId}`);

        // Broadcast to supervisors
        broadcastToSupervisors({
          type: "call_ended",
          sessionId: sessionId,
          summary: summary,
        });
      } catch (error) {
        logger.error(`Failed to save call summary for ${sessionId}:`, error);
      }
    }

    broadcastToSupervisors({
      type: "session_update",
      sessionId: sessionId,
      data: conversationManager.serializeSession(
        conversationManager.getSession(sessionId),
      ),
    });
  });

  // Send session info to customer
  ws.send(
    JSON.stringify({
      type: "session_init",
      sessionId: sessionId,
      mode: session.mode,
    }),
  );
}

/**
 * Handle supervisor WebSocket connection
 */
function handleSupervisorConnection(ws, targetSessionId) {
  logger.info(
    `Supervisor connected, targeting session: ${targetSessionId || "all"}`,
  );

  // Add to supervisor list
  conversationManager.addSupervisor(ws);

  // Send current sessions list
  ws.send(
    JSON.stringify({
      type: "sessions_list",
      sessions: conversationManager.getAllSessions(),
    }),
  );

  ws.on("message", async (message) => {
    try {
      const data = JSON.parse(message);
      const session = conversationManager.getSession(data.sessionId);

      if (!session) {
        ws.send(
          JSON.stringify({
            type: "error",
            message: "Session not found",
          }),
        );
        return;
      }

      switch (data.type) {
        case "takeover":
          // Human takeover
          logger.info(`Taking over session ${data.sessionId}`);
          session.mode = "human";
          session.supervisorWs = ws;
          session.supervisorId = data.supervisorId;

          // Pause Gemini
          await session.geminiSession?.pause();

          // Notify customer
          if (session.customerWs?.readyState === 1) {
            session.customerWs.send(
              JSON.stringify({
                type: "mode_change",
                mode: "human",
                message: "A human agent has joined the conversation.",
              }),
            );
          }

          conversationManager.updateSession(data.sessionId, {
            mode: "human",
            takenOverBy: data.supervisorId,
            takenOverAt: Date.now(),
          });

          broadcastToSupervisors({
            type: "session_update",
            sessionId: data.sessionId,
            data: conversationManager.serializeSession(
              conversationManager.getSession(data.sessionId),
            ),
          });
          break;

        case "handback":
          // Hand back to AI
          logger.info(`Handing back session ${data.sessionId} to AI`);
          session.mode = "ai";
          session.supervisorWs = null;
          session.supervisorId = null;

          // Resume Gemini
          await session.geminiSession?.resume();

          // Inject context if provided
          if (data.context) {
            await session.geminiSession?.injectContext(data.context);
          }

          // Notify customer
          if (session.customerWs?.readyState === 1) {
            session.customerWs.send(
              JSON.stringify({
                type: "mode_change",
                mode: "ai",
                message: "You are now speaking with our AI assistant.",
              }),
            );
          }

          conversationManager.updateSession(data.sessionId, {
            mode: "ai",
            takenOverBy: null,
            handbackAt: Date.now(),
          });

          broadcastToSupervisors({
            type: "session_update",
            sessionId: data.sessionId,
            data: conversationManager.serializeSession(
              conversationManager.getSession(data.sessionId),
            ),
          });
          break;

        case "supervisor_audio":
          // Forward supervisor audio to customer
          if (session.customerWs?.readyState === 1) {
            session.customerWs.send(
              JSON.stringify({
                type: "audio",
                data: data.data,
              }),
            );
          }
          break;

        case "supervisor_message":
          // Forward supervisor text to customer
          session.transcript.push({
            role: "supervisor",
            content: data.content,
            timestamp: Date.now(),
          });

          if (session.customerWs?.readyState === 1) {
            session.customerWs.send(
              JSON.stringify({
                type: "supervisor_message",
                content: data.content,
              }),
            );
          }
          break;

        case "inject_context":
          // Inject context into Gemini session
          const targetSession = conversationManager.getSession(data.sessionId);

          if (!targetSession) {
            ws.send(
              JSON.stringify({
                type: "error",
                message: "Session not found",
              }),
            );
            break;
          }

          if (targetSession.mode !== "ai") {
            ws.send(
              JSON.stringify({
                type: "error",
                message: `Cannot inject context: session is in ${targetSession.mode} mode. Context injection only works in AI mode.`,
              }),
            );
            break;
          }

          if (!targetSession.geminiSession) {
            ws.send(
              JSON.stringify({
                type: "error",
                message:
                  "Cannot inject context: AI session not initialized yet. Please wait a moment and try again.",
              }),
            );
            break;
          }

          // All checks passed - inject context
          try {
            await targetSession.geminiSession.injectContext(data.context);

            // Store in transcript
            targetSession.transcript.push({
              role: "customer",
              content: data.context[0],
              timestamp: Date.now(),
            });

            // ===== TRIGGER AUTO-UPDATES (same as input_transcription) =====

            // TRIGGER SENTIMENT ANALYSIS
            gemini3Api
              .analyzeSentiment(
                data.context[0],
                targetSession.transcript.slice(-5),
              )
              .then((sentimentResult) => {
                conversationManager.updateSession(data.sessionId, {
                  sentimentScore: sentimentResult.frustrationLevel,
                  frustrationLevel: sentimentResult.frustrationLevel,
                });

                broadcastToSupervisors({
                  type: "frustration_update",
                  sessionId: data.sessionId,
                  frustrationLevel: sentimentResult.frustrationLevel,
                  sentiment: sentimentResult.sentiment,
                  reason: sentimentResult.reason,
                });

                if (sentimentResult.shouldEscalate) {
                  broadcastToSupervisors({
                    type: "escalation_alert",
                    sessionId: data.sessionId,
                    reason:
                      sentimentResult.reason || "High frustration detected",
                    frustrationLevel: sentimentResult.frustrationLevel,
                  });
                }

                broadcastToSupervisors({
                  type: "session_update",
                  sessionId: data.sessionId,
                  data: conversationManager.serializeSession(
                    conversationManager.getSession(data.sessionId),
                  ),
                });
              })
              .catch((err) => {
                logger.error("Sentiment analysis error:", err.message);
              });

            // AUTO-UPDATE ANALYTICS
            gemini3Api
              .analyzeConversation(targetSession.transcript)
              .then(async (analytics) => {
                try {
                  await databaseManager.cacheAnalytics(
                    data.sessionId,
                    analytics,
                  );
                } catch (dbErr) {
                  logger.error("Analytics cache error:", dbErr.message);
                }

                broadcastToSupervisors({
                  type: "analytics_update",
                  sessionId: data.sessionId,
                  data: analytics,
                });

                logger.info(
                  `[Auto-Analytics] ${data.sessionId}: ${analytics.intent}, ${analytics.sentiment}`,
                );
              })
              .catch((err) => {
                logger.error("Analytics auto-update error:", err.message);
              });

            // AUTO-UPDATE AI COACHING
            gemini3Api
              .getCoachingSuggestions(targetSession.transcript)
              .then(async (coaching) => {
                try {
                  await databaseManager.cacheCoaching(data.sessionId, coaching);
                } catch (dbErr) {
                  logger.error("Coaching cache error:", dbErr.message);
                }

                broadcastToSupervisors({
                  type: "coaching_update",
                  sessionId: data.sessionId,
                  data: coaching,
                });

                logger.info(
                  `[Auto-Coaching] ${data.sessionId}: ${coaching.tone}, ${coaching.priority}`,
                );
              })
              .catch((err) => {
                logger.error("Coaching auto-update error:", err.message);
              });

            // Broadcast customer message to supervisors
            broadcastToSupervisors({
              type: "customer_message",
              sessionId: data.sessionId,
              content: data.context[0],
            });

            ws.send(
              JSON.stringify({
                type: "context_injected",
                sessionId: data.sessionId,
                message: "Context injected successfully",
              }),
            );
            logger.info(`Context injected for session ${data.sessionId}`);
          } catch (error) {
            ws.send(
              JSON.stringify({
                type: "error",
                message: `Failed to inject context: ${error.message}`,
              }),
            );
            logger.error(
              `Context injection failed for session ${data.sessionId}:`,
              error,
            );
          }
          break;

        case "end_call":
          // End the customer call/session
          logger.info(`Ending session ${data.sessionId} by supervisor`);

          // Notify customer that call is ending
          if (session.customerWs?.readyState === 1) {
            session.customerWs.send(
              JSON.stringify({
                type: "session_ended",
                message: "The session has been ended by the supervisor.",
              }),
            );
            // Close customer WebSocket
            session.customerWs.close(1000, "Session ended by supervisor");
          }

          // Close Gemini session if active
          if (session.geminiSession) {
            await session.geminiSession.close();
          }

          // Update session status
          conversationManager.updateSession(data.sessionId, {
            status: "ended",
            endedAt: Date.now(),
            endedBy: "supervisor",
          });

          // Notify supervisor of success
          ws.send(
            JSON.stringify({
              type: "session_ended",
              sessionId: data.sessionId,
              message: "Session ended successfully",
            }),
          );

          // Broadcast to all supervisors
          broadcastToSupervisors({
            type: "session_update",
            sessionId: data.sessionId,
            data: {
              ...conversationManager.getSession(data.sessionId),
              status: "ended",
            },
          });
          break;
      }
    } catch (error) {
      logger.error("Error processing supervisor message:", error);
      ws.send(
        JSON.stringify({
          type: "error",
          message: error.message,
        }),
      );
    }
  });

  ws.on("close", () => {
    logger.info("Supervisor disconnected");
    conversationManager.removeSupervisor(ws);
  });
}

/**
 * Broadcast message to all connected supervisors
 */
function broadcastToSupervisors(message) {
  const supervisors = conversationManager.getSupervisors();

  try {
    const messageStr = JSON.stringify(message);

    supervisors.forEach((ws) => {
      if (ws.readyState === 1) {
        ws.send(messageStr);
      }
    });
  } catch (error) {
    logger.error("Error broadcasting to supervisors:", error.message);
    // Attempt to send a simplified message without circular refs
    try {
      const simplifiedMessage = {
        type: message.type,
        sessionId: message.sessionId,
        error: "Data serialization error",
      };
      const fallbackStr = JSON.stringify(simplifiedMessage);
      supervisors.forEach((ws) => {
        if (ws.readyState === 1) {
          ws.send(fallbackStr);
        }
      });
    } catch (fallbackError) {
      logger.error("Failed to send fallback message:", fallbackError.message);
    }
  }
}

// Start server
async function startServer() {
  try {
    // Initialize database
    await databaseManager.initialize();
    logger.info("Database ready");

    // Start HTTP server
    const PORT = process.env.PORT || 3000;
    server.listen(PORT, () => {
      logger.info(`Server running on http://localhost:${PORT}`);
      logger.info(`WebSocket available at ws://localhost:${PORT}`);
    });
  } catch (error) {
    logger.error("Failed to start server:", error);
    process.exit(1);
  }
}

startServer();
