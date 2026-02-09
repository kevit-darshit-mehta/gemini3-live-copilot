import sqlite3 from "sqlite3";
import { open } from "sqlite";
import { promises as fs } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { Logger } from "@gemini-copilot/shared";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const logger = new Logger("DB");

class DatabaseManager {
  constructor() {
    this.db = null;
  }

  /**
   * Initialize database connection and create tables
   */
  async initialize() {
    const dbPath = join(__dirname, "database", "copilot.db");

    // Ensure directory exists
    await fs.mkdir(dirname(dbPath), { recursive: true });

    // Open database
    this.db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });

    // Read and execute schema
    const schemaPath = join(__dirname, "database", "schema.sql");
    const schema = await fs.readFile(schemaPath, "utf-8");
    await this.db.exec(schema);

    logger.info("Database initialized successfully");
  }

  /**
   * Save call summary
   */
  async saveCallSummary(sessionId, sessionData, summary) {
    const transcript = sessionData.transcript || [];
    const firstMessage = transcript.find((m) => m.role === "customer");
    const lastMessage = transcript[transcript.length - 1];

    await this.db.run(
      `
      INSERT INTO call_summaries (
        session_id, created_at, ended_at, duration,
        overall_sentiment, intent, resolution_status,
        key_topics, action_items,
        frustration_avg, frustration_max, frustration_trend,
        escalation_count, escalation_alerts,
        supervisor_interventions, supervisor_id, supervisor_takeover_duration,
        full_summary, insights,
        transcript,
        first_message_at, last_message_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
      [
        sessionId,
        sessionData.createdAt || Date.now(),
        Date.now(),
        sessionData.duration ||
          Date.now() - (sessionData.createdAt || Date.now()),
        summary.sentiment || "neutral",
        summary.intent || "unknown",
        summary.resolutionStatus || "unresolved",
        JSON.stringify(summary.keyTopics || []),
        JSON.stringify(summary.actionItems || []),
        Math.round(sessionData.frustrationAvg || 0),
        sessionData.frustrationMax || 0,
        summary.frustrationTrend || "stable",
        sessionData.escalationCount || 0,
        JSON.stringify(sessionData.escalationAlerts || []),
        sessionData.supervisorInterventions || 0,
        sessionData.supervisorId || null,
        sessionData.supervisorTakeoverDuration || 0,
        summary.fullText || "",
        summary.insights || "",
        JSON.stringify(transcript),
        firstMessage?.timestamp || firstMessage?.createdAt || null,
        lastMessage?.timestamp || lastMessage?.createdAt || null,
      ],
    );

    logger.info(`Call summary saved: ${sessionId}`);
  }

  /**
   * Get all call summaries (paginated)
   */
  async getAllSummaries(options = {}) {
    const {
      limit = 50,
      offset = 0,
      sentiment,
      intent,
      resolution,
      sortBy = "created_at",
      sortOrder = "DESC",
    } = options;

    let query = "SELECT * FROM call_summaries WHERE 1=1";
    const params = [];

    if (sentiment) {
      query += " AND overall_sentiment = ?";
      params.push(sentiment);
    }

    if (intent) {
      query += " AND intent = ?";
      params.push(intent);
    }

    if (resolution) {
      query += " AND resolution_status = ?";
      params.push(resolution);
    }

    query += ` ORDER BY ${sortBy} ${sortOrder} LIMIT ? OFFSET ?`;
    params.push(limit, offset);

    return await this.db.all(query, params);
  }

  /**
   * Get single summary by session ID
   */
  async getSummary(sessionId) {
    return await this.db.get(
      "SELECT * FROM call_summaries WHERE session_id = ?",
      [sessionId],
    );
  }

  /**
   * Get summary statistics
   */
  async getStatistics() {
    const stats = await this.db.get(`
      SELECT 
        COUNT(*) as total_calls,
        AVG(duration) as avg_duration,
        AVG(frustration_avg) as avg_frustration,
        SUM(supervisor_interventions) as total_interventions,
        COUNT(CASE WHEN resolution_status = 'resolved' THEN 1 END) as resolved_count,
        COUNT(CASE WHEN overall_sentiment = 'frustrated' THEN 1 END) as frustrated_count
      FROM call_summaries
    `);

    return stats;
  }

  /**
   * Cache analytics update for a session
   * @param {string} sessionId - Session ID
   * @param {Object} analytics - Analytics data object
   */
  async cacheAnalytics(sessionId, analytics) {
    await this.db.run(
      `
      INSERT OR REPLACE INTO analytics_cache (
        session_id, last_updated, intent, sentiment, 
        sentiment_score, escalation_risk, key_issues
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `,
      [
        sessionId,
        Date.now(),
        analytics.intent,
        analytics.sentiment,
        analytics.sentimentScore,
        analytics.escalationRisk,
        JSON.stringify(analytics.keyIssues || []),
      ],
    );
  }

  /**
   * Cache coaching update for a session
   * @param {string} sessionId - Session ID
   * @param {Object} coaching - Coaching data object
   */
  async cacheCoaching(sessionId, coaching) {
    await this.db.run(
      `
      INSERT OR REPLACE INTO coaching_cache (
        session_id, last_updated, tone, priority,
        coaching_tip, suggested_responses
      ) VALUES (?, ?, ?, ?, ?, ?)
    `,
      [
        sessionId,
        Date.now(),
        coaching.tone,
        coaching.priority,
        coaching.coachingTip,
        JSON.stringify(coaching.suggestedResponses || []),
      ],
    );
  }
}

export default new DatabaseManager();
