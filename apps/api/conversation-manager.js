/**
 * Conversation Manager
 * Manages active customer support sessions
 */

import { Logger } from "@gemini-copilot/shared";

const logger = new Logger("ConversationManager");

export class ConversationManager {
  constructor() {
    this.sessions = new Map();
    this.supervisors = new Set();
  }

  /**
   * Create a new session
   */
  createSession(sessionId) {
    const session = {
      id: sessionId,
      createdAt: Date.now(),
      status: "waiting",
      mode: "ai", // 'ai' or 'human'
      customerWs: null,
      supervisorWs: null,
      geminiSession: null,
      transcript: [],
      customerConnected: false,
      supervisorId: null,
      takenOverBy: null,
      takenOverAt: null,
      metadata: {},
      frustrationLevel: 0,
      sentimentScore: 0,
    };

    this.sessions.set(sessionId, session);
    logger.info(`Created session: ${sessionId}`);
    return session;
  }

  /**
   * Get a session by ID
   */
  getSession(sessionId) {
    return this.sessions.get(sessionId);
  }

  /**
   * Update session properties
   */
  updateSession(sessionId, updates) {
    const session = this.sessions.get(sessionId);
    if (session) {
      Object.assign(session, updates);
      return session;
    }
    return null;
  }

  /**
   * Delete a session
   */
  deleteSession(sessionId) {
    const session = this.sessions.get(sessionId);
    if (session) {
      // Close Gemini session if exists
      if (session.geminiSession) {
        session.geminiSession.close();
      }
      this.sessions.delete(sessionId);
      logger.info(`Deleted session: ${sessionId}`);
      return true;
    }
    return false;
  }

  /**
   * Get all sessions (serializable format for API)
   */
  getAllSessions() {
    const sessionsArray = [];
    this.sessions.forEach((session, id) => {
      sessionsArray.push(this.serializeSession(session));
    });
    return sessionsArray;
  }

  /**
   * Serialize session for transmission (removes WebSocket refs)
   */
  serializeSession(session) {
    return {
      id: session.id,
      createdAt: session.createdAt,
      status: session.status,
      mode: session.mode,
      customerConnected: session.customerConnected,
      supervisorId: session.supervisorId,
      takenOverBy: session.takenOverBy,
      takenOverAt: session.takenOverAt,
      transcriptLength: session.transcript.length,
      lastMessage:
        session.transcript.length > 0
          ? session.transcript[session.transcript.length - 1]
          : null,
      metadata: session.metadata,
      frustrationLevel: session.frustrationLevel || 0,
      sentimentScore: session.sentimentScore || 0,
    };
  }

  /**
   * Get active session count
   */
  getActiveSessionCount() {
    let count = 0;
    this.sessions.forEach((session) => {
      if (session.status === "active") count++;
    });
    return count;
  }

  /**
   * Add a supervisor WebSocket
   */
  addSupervisor(ws) {
    this.supervisors.add(ws);
    logger.info(`Supervisor added (total: ${this.supervisors.size})`);
  }

  /**
   * Remove a supervisor WebSocket
   */
  removeSupervisor(ws) {
    this.supervisors.delete(ws);
    logger.info(`Supervisor removed (total: ${this.supervisors.size})`);
  }

  /**
   * Get all supervisor WebSockets
   */
  getSupervisors() {
    return Array.from(this.supervisors);
  }

  /**
   * Get session transcript
   */
  getTranscript(sessionId) {
    const session = this.sessions.get(sessionId);
    return session ? session.transcript : [];
  }

  /**
   * Add message to transcript
   */
  addToTranscript(sessionId, message) {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.transcript.push({
        ...message,
        timestamp: message.timestamp || Date.now(),
      });
      return true;
    }
    return false;
  }
}
