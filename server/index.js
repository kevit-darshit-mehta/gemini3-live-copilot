import express from "express";
import { createServer } from "http";
import { WebSocketServer } from "ws";
import { config } from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import crypto from "crypto";
import { GeminiLiveSession } from "./gemini-live.js";
import { ConversationManager } from "./conversation-manager.js";
import Logger from "./logger.js";

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

// Middleware
app.use(express.json());
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
  res.json(session);
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

      // Also forward to supervisor if connected
      if (session.supervisorWs?.readyState === 1 && data.type === "text") {
        session.supervisorWs.send(
          JSON.stringify({
            type: "ai_response",
            sessionId: sessionId,
            data: { type: "text", content: data.content },
          }),
        );
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
    data: conversationManager.getSession(sessionId),
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
          data: conversationManager.getSession(sessionId),
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
        // SENTIMENT ANALYSIS (TRANSCRIPT)
        // ----------------------------------------------------
        const analysis = sentimentAnalyzer.analyze(data.content);
        const escalationCheck = sentimentAnalyzer.checkEscalation(
          session.transcript,
        );

        conversationManager.updateSession(sessionId, {
          sentimentScore: analysis.score,
          frustrationLevel: escalationCheck.frustrationLevel,
        });

        if (escalationCheck.shouldEscalate) {
          broadcastToSupervisors({
            type: "escalation_alert",
            sessionId: sessionId,
            reason: escalationCheck.reason,
            frustrationLevel: escalationCheck.frustrationLevel,
          });
        }

        broadcastToSupervisors({
          type: "session_update",
          sessionId: sessionId,
          data: conversationManager.getSession(sessionId),
        });

        // Forward to supervisor so they can see what was said
        if (session.supervisorWs?.readyState === 1) {
          session.supervisorWs.send(
            JSON.stringify({
              type: "customer_message",
              sessionId: sessionId,
              content: data.content,
            }),
          );
        }
      }
    } catch (error) {
      logger.error("Error processing customer message:", error);
    }
  });

  ws.on("close", () => {
    logger.info(`Customer disconnected from session ${sessionId}`);
    session.customerWs = null;
    conversationManager.updateSession(sessionId, { customerConnected: false });

    broadcastToSupervisors({
      type: "session_update",
      sessionId: sessionId,
      data: conversationManager.getSession(sessionId),
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
            data: conversationManager.getSession(data.sessionId),
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
            data: conversationManager.getSession(data.sessionId),
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
          if (session.mode === "ai" && session.geminiSession) {
            await session.geminiSession.injectContext(data.context);
            ws.send(
              JSON.stringify({
                type: "context_injected",
                sessionId: data.sessionId,
              }),
            );
          }
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
  const messageStr = JSON.stringify(message);

  supervisors.forEach((ws) => {
    if (ws.readyState === 1) {
      ws.send(messageStr);
    }
  });
}

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  logger.info(`Server running on http://localhost:${PORT}`);
  logger.info(`WebSocket available at ws://localhost:${PORT}`);
});
