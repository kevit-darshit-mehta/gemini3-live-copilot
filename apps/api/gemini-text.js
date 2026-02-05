import { GoogleGenerativeAI } from "@google/generative-ai";
import { Logger } from "@gemini-copilot/shared";

const logger = new Logger("Gemini3");

/**
 * Gemini 3 Text API client for enhanced conversation analysis
 * Uses gemini-3-flash-preview for intelligent coaching, analytics, and summarization
 */
export class GeminiTextAPI {
  constructor(apiKey) {
    this.genAI = new GoogleGenerativeAI(apiKey);
    this.model = this.genAI.getGenerativeModel({
      model: "gemini-3-flash-preview",
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 1024,
      },
    });
    logger.info(
      "Gemini 3 Flash API initialized (model: gemini-3-flash-preview)",
    );
  }

  /**
   * Analyze conversation for sentiment, intent, and key issues
   * @param {Array} transcript - Array of {role, content} messages
   * @returns {Object} Analysis results
   */
  async analyzeConversation(transcript) {
    if (!transcript || transcript.length === 0) {
      return {
        sentiment: "neutral",
        sentimentScore: 50,
        intent: "unknown",
        keyIssues: [],
        escalationRisk: "low",
      };
    }

    const conversationText = transcript
      .map((m) => `${m.role}: ${m.content}`)
      .join("\n");

    const prompt = `Analyze this customer service conversation and respond in JSON format only:

CONVERSATION:
${conversationText}

Respond with ONLY this JSON structure (no markdown, no explanation):
{
  "sentiment": "positive" | "neutral" | "negative" | "frustrated",
  "sentimentScore": 0-100 (0=very negative, 100=very positive),
  "intent": "complaint" | "inquiry" | "support" | "purchase" | "cancellation" | "feedback" | "other",
  "keyIssues": ["issue1", "issue2"],
  "escalationRisk": "low" | "medium" | "high",
  "summary": "One sentence summary of the issue"
}`;

    try {
      const result = await this.model.generateContent(prompt);
      let responseText = result.response.text();

      logger.info(
        `Analytics raw response: ${responseText.substring(0, 500)}...`,
      );

      // Remove markdown code blocks if present
      responseText = responseText
        .replace(/```json\s*/g, "")
        .replace(/```\s*/g, "")
        .trim();

      // Try to parse JSON from response
      let parsed;
      try {
        // First try: parse the entire response as-is
        parsed = JSON.parse(responseText);
      } catch (directParseError) {
        // Second try: extract JSON object with regex
        let jsonMatch = responseText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          try {
            parsed = JSON.parse(jsonMatch[0]);
          } catch (regexParseError) {
            logger.error("JSON parse error:", regexParseError.message);
            logger.error(
              "Failed to parse JSON:",
              jsonMatch[0].substring(0, 500),
            );
          }
        }
      }

      if (parsed) {
        logger.info(
          `Analytics parsed: intent=${parsed.intent}, sentiment=${parsed.sentiment}`,
        );
        return parsed;
      }

      logger.warn(
        "Could not parse analysis response. Full response:",
        responseText.substring(0, 500),
      );
      return {
        sentiment: "neutral",
        sentimentScore: 50,
        intent: "unknown",
        keyIssues: [],
        escalationRisk: "low",
      };
    } catch (error) {
      logger.error("Error analyzing conversation:", error.message);
      return {
        sentiment: "neutral",
        sentimentScore: 50,
        intent: "unknown",
        keyIssues: [],
        escalationRisk: "low",
      };
    }
  }

  /**
   * Real-time sentiment analysis for frustration detection (Powered by Gemini 3)
   * Much more accurate than keyword-based detection
   * @param {string} text - Latest customer message
   * @param {Array} recentMessages - Recent messages for context
   * @returns {Object} { frustrationLevel: 0-100, sentiment, shouldEscalate }
   */
  async analyzeSentiment(text, recentMessages = []) {
    if (!text || text.trim().length === 0) {
      return {
        frustrationLevel: 0,
        sentiment: "neutral",
        shouldEscalate: false,
      };
    }

    const context = recentMessages
      .slice(-3)
      .map((m) => `${m.role}: ${m.content}`)
      .join("\n");

    const prompt = `Analyze the customer's emotional state in this message. Consider tone, word choice, and context.

${context ? `RECENT CONTEXT:\n${context}\n\n` : ""}CURRENT MESSAGE: "${text}"

IMPORTANT: Detect frustration even from subtle cues like:
- Complaints about speed, waiting, delays
- Expressions like "slow", "frustrating", "annoyed", "ridiculous"
- Repeated issues or follow-ups
- Capitalization or exclamation marks

Respond with ONLY this JSON (no markdown):
{
  "frustrationLevel": 0-100 (0=calm, 50=slightly annoyed, 75=frustrated, 100=very angry),
  "sentiment": "positive" | "neutral" | "frustrated" | "angry",
  "shouldEscalate": true if frustration >= 70 or customer requests manager,
  "reason": "Brief explanation of detected emotion"
}`;

    try {
      const result = await this.model.generateContent(prompt);
      const responseText = result.response.text();

      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        logger.info(
          `Sentiment: ${parsed.sentiment}, Frustration: ${parsed.frustrationLevel}%`,
        );
        return parsed;
      }

      return {
        frustrationLevel: 0,
        sentiment: "neutral",
        shouldEscalate: false,
      };
    } catch (error) {
      logger.error("Error analyzing sentiment:", error.message);
      return {
        frustrationLevel: 0,
        sentiment: "neutral",
        shouldEscalate: false,
      };
    }
  }

  /**
   * Get real-time coaching suggestions for supervisor during takeover
   * @param {Array} transcript - Conversation transcript
   * @param {string} customerMessage - Latest customer message
   * @returns {Object} Coaching suggestions
   */
  async getSupervisorCoaching(transcript, customerMessage) {
    const conversationContext = transcript
      .slice(-5) // Last 5 messages for context
      .map((m) => `${m.role}: ${m.content}`)
      .join("\n");

    const prompt = `You are a customer service coach. Based on this conversation, suggest 3 appropriate responses for the supervisor.

RECENT CONVERSATION:
${conversationContext}

CUSTOMER JUST SAID:
"${customerMessage}"

Respond with ONLY this JSON structure (no markdown):
{
  "coachingTip": "Brief tip for handling this situation",
  "suggestedResponses": [
    "Response option 1",
    "Response option 2", 
    "Response option 3"
  ],
  "tone": "empathetic" | "professional" | "apologetic" | "solution-focused",
  "priority": "low" | "medium" | "high"
}`;

    try {
      const result = await this.model.generateContent(prompt);
      const responseText = result.response.text();

      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }

      return {
        coachingTip: "Listen actively and show empathy",
        suggestedResponses: [
          "I understand your concern...",
          "Let me help you with that...",
          "I apologize for the inconvenience...",
        ],
        tone: "empathetic",
        priority: "medium",
      };
    } catch (error) {
      logger.error("Error getting coaching:", error.message);
      return {
        coachingTip: "Listen actively and show empathy",
        suggestedResponses: [
          "I understand...",
          "Let me help...",
          "I apologize...",
        ],
        tone: "empathetic",
        priority: "medium",
      };
    }
  }

  /**
   * Generate call summary when session ends
   * @param {Array} transcript - Full conversation transcript
   * @returns {Object} Call summary
   */
  async generateSummary(transcript) {
    if (!transcript || transcript.length === 0) {
      return {
        sentiment: "neutral",
        intent: "unknown",
        resolutionStatus: "unresolved",
        keyTopics: [],
        actionItems: [],
        frustrationTrend: "stable",
        fullText: "No conversation recorded",
        insights: "",
      };
    }

    const conversationText = transcript
      .map((m) => `${m.role}: ${m.content}`)
      .join("\n");

    const prompt = `Generate a comprehensive call summary for this customer service conversation.

CONVERSATION:
${conversationText}

Respond with ONLY this JSON structure (no markdown, no explanation):
{
  "sentiment": "positive" | "neutral" | "negative" | "frustrated",
  "intent": "complaint" | "inquiry" | "support" | "purchase" | "cancellation" | "feedback" | "other",
  "resolutionStatus": "resolved" | "partially_resolved" | "unresolved" | "escalated",
  "keyTopics": ["topic1", "topic2", "topic3"],
  "actionItems": ["action1", "action2"],
  "frustrationTrend": "increasing" | "stable" | "decreasing",
  "fullText": "2-3 sentence comprehensive summary of the entire call",
  "insights": "Key observation or recommendation for future interactions"
}`;

    try {
      const result = await this.model.generateContent(prompt);
      let responseText = result.response.text();

      // Remove markdown code blocks if present
      responseText = responseText
        .replace(/```json\s*/g, "")
        .replace(/```\s*/g, "")
        .trim();

      let parsed;
      try {
        parsed = JSON.parse(responseText);
      } catch (e) {
        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          parsed = JSON.parse(jsonMatch[0]);
        }
      }

      if (parsed) {
        logger.info(
          `Call summary generated: ${parsed.sentiment}, ${parsed.resolutionStatus}`,
        );
        return parsed;
      }

      return {
        sentiment: "neutral",
        intent: "unknown",
        resolutionStatus: "unresolved",
        keyTopics: [],
        actionItems: [],
        frustrationTrend: "stable",
        fullText: "Call completed",
        insights: "",
      };
    } catch (error) {
      logger.error("Error generating summary:", error.message);
      return {
        sentiment: "neutral",
        intent: "unknown",
        resolutionStatus: "unresolved",
        keyTopics: [],
        actionItems: [],
        frustrationTrend: "stable",
        fullText: "Call completed",
        insights: "",
      };
    }
  }
}
