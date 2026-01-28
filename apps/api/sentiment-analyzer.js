import Sentiment from "sentiment";

export class SentimentAnalyzer {
  constructor() {
    this.sentiment = new Sentiment();
    this.historyStartSize = 5; // Look at last 5 messages for trend
    this.thresholds = {
      frstrated: -2,
      angry: -4,
    };
  }

  /**
   * Analyze a single text segment
   * @param {string} text
   * @returns {Object} { score, comparative, tokens, words }
   */
  analyze(text) {
    return this.sentiment.analyze(text);
  }

  /**
   * Calculate frustration level (0-100) based on sentiment score
   * @param {number} score Raw sentiment score
   * @returns {number} Frustration level 0-100
   */
  calculateFrustration(score) {
    // Map score:
    // >= 0: 0% frustration
    // -1: 20%
    // -2: 40%
    // -3: 60%
    // -4: 80%
    // <= -5: 100%

    if (score >= 0) return 0;
    return Math.min(100, Math.abs(score) * 20);
  }

  /**
   * Analyze a conversation history to determine escalation need
   * @param {Array} transcript Array of { role, content }
   * @returns {Object} { shouldEscalate, frustrationLevel, reason }
   */
  checkEscalation(transcript) {
    if (!transcript || transcript.length === 0) {
      return { shouldEscalate: false, frustrationLevel: 0 };
    }

    // Get last user messages
    const userMessages = transcript
      .filter((m) => m.role === "customer" || m.role === "user")
      .slice(-this.historyStartSize);

    if (userMessages.length === 0) {
      return { shouldEscalate: false, frustrationLevel: 0 };
    }

    let totalScore = 0;
    let negativeCount = 0;
    let lastMessageScore = 0;

    userMessages.forEach((msg, index) => {
      const result = this.analyze(msg.content);
      totalScore += result.score;
      if (result.score < 0) negativeCount++;

      if (index === userMessages.length - 1) {
        lastMessageScore = result.score;
      }
    });

    const avgScore = totalScore / userMessages.length;
    const frustrationLevel = this.calculateFrustration(
      lastMessageScore < avgScore ? lastMessageScore : avgScore,
    );

    // Escalation Rules
    // 1. Immediate anger (single message very negative)
    // 2. Persistent frustration (majority of recent messages negative)

    if (lastMessageScore <= this.thresholds.angry) {
      return {
        shouldEscalate: true,
        frustrationLevel,
        reason: "Customer detected as angry",
      };
    }

    if (userMessages.length >= 3 && negativeCount >= userMessages.length - 1) {
      return {
        shouldEscalate: true,
        frustrationLevel,
        reason: "Persistent negative sentiment detected",
      };
    }

    return { shouldEscalate: false, frustrationLevel };
  }
}
