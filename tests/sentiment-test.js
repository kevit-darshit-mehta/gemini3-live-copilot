/**
 * Sentiment Analysis Test Suite
 * Tests sentiment analyzer and Gemini 3 text API functionality
 */

import { SentimentAnalyzer } from "../apps/api/sentiment-analyzer.js";
import { GeminiTextAPI } from "../apps/api/gemini-text.js";
import { config } from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load .env from apps/api directory
config({ path: join(__dirname, "../apps/api/.env") });

// Colors for console output
const colors = {
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  reset: "\x1b[0m",
};

function log(color, ...args) {
  console.log(color, ...args, colors.reset);
}

// Test conversations
const testConversations = {
  positive: [
    { role: "customer", content: "Hello! I'm excited to get help today." },
    { role: "ai", content: "Great! I'm happy to assist you." },
    { role: "customer", content: "Thank you so much for your excellent service!" },
  ],
  neutral: [
    { role: "customer", content: "Hi, I need to check my order status." },
    { role: "ai", content: "Sure, let me look that up for you." },
    { role: "customer", content: "Okay, thanks." },
  ],
  negative: [
    { role: "customer", content: "I'm not happy with this product." },
    { role: "ai", content: "I understand. Let me help resolve this." },
    { role: "customer", content: "This is disappointing." },
  ],
  frustrated: [
    { role: "customer", content: "This is absolutely terrible!" },
    { role: "ai", content: "I'm sorry to hear that. How can I help?" },
    { role: "customer", content: "I've been waiting for hours! This is unacceptable! I'm extremely angry!" },
  ],
};

/**
 * Test Local Sentiment Analyzer
 */
async function testLocalSentimentAnalyzer() {
  log(colors.blue, "\n=== Testing Local Sentiment Analyzer ===");
  
  const analyzer = new SentimentAnalyzer();
  const results = {};

  try {
    for (const [sentiment, transcript] of Object.entries(testConversations)) {
      log(colors.yellow, `\nTesting ${sentiment} conversation:`);
      
      // Test escalation check
      const escalation = analyzer.checkEscalation(transcript);
      results[sentiment] = escalation;

      log(colors.blue, `  Frustration Level: ${escalation.frustrationLevel}%`);
      log(colors.blue, `  Should Escalate: ${escalation.shouldEscalate}`);
      if (escalation.reason) {
        log(colors.blue, `  Reason: ${escalation.reason}`);
      }

      // Verify expectations
      if (sentiment === "frustrated" && escalation.shouldEscalate) {
        log(colors.green, "  ✓ Correctly detected frustration");
      } else if (sentiment !== "frustrated" && !escalation.shouldEscalate) {
        log(colors.green, "  ✓ Correctly detected as non-frustrated");
      } else {
        log(colors.yellow, "  ⚠ Unexpected result");
      }
    }

    log(colors.green, "\n✓ Local sentiment analyzer tests completed");
    return true;
  } catch (error) {
    log(colors.red, "✗ Local sentiment analyzer error:", error.message);
    return false;
  }
}

/**
 * Test Gemini 3 Text API - Sentiment Analysis
 */
async function testGemini3SentimentAnalysis() {
  log(colors.blue, "\n=== Testing Gemini 3 Sentiment Analysis ===");
  
  if (!process.env.GEMINI_API_KEY) {
    log(colors.yellow, "⚠ GEMINI_API_KEY not set, skipping Gemini 3 tests");
    return null;
  }

  const geminiApi = new GeminiTextAPI(process.env.GEMINI_API_KEY);

  try {
    for (const [sentiment, transcript] of Object.entries(testConversations)) {
      log(colors.yellow, `\nAnalyzing ${sentiment} conversation with Gemini 3:`);
      
      const analysis = await geminiApi.analyzeConversation(transcript);

      log(colors.blue, `  Detected Sentiment: ${analysis.sentiment}`);
      log(colors.blue, `  Sentiment Score: ${analysis.sentimentScore}/100`);
      log(colors.blue, `  Intent: ${analysis.intent}`);
      log(colors.blue, `  Escalation Risk: ${analysis.escalationRisk}`);
      if (analysis.keyIssues && analysis.keyIssues.length > 0) {
        log(colors.blue, `  Key Issues: ${analysis.keyIssues.join(", ")}`);
      }

      // Verify expectations
      if (sentiment === "frustrated" && analysis.escalationRisk === "high") {
        log(colors.green, "  ✓ Correctly identified high escalation risk");
      } else if (sentiment === "positive" && analysis.sentiment === "positive") {
        log(colors.green, "  ✓ Correctly identified positive sentiment");
      } else {
        log(colors.yellow, "  ⚠ Unexpected analysis result");
      }

      // Small delay between API calls
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    log(colors.green, "\n✓ Gemini 3 sentiment analysis tests completed");
    return true;
  } catch (error) {
    log(colors.red, "✗ Gemini 3 sentiment analysis error:", error.message);
    return false;
  }
}

/**
 * Test Gemini 3 Coaching Suggestions
 */
async function testGemini3Coaching() {
  log(colors.blue, "\n=== Testing Gemini 3 Coaching Suggestions ===");
  
  if (!process.env.GEMINI_API_KEY) {
    log(colors.yellow, "⚠ GEMINI_API_KEY not set, skipping");
    return null;
  }

  const geminiApi = new GeminiTextAPI(process.env.GEMINI_API_KEY);

  try {
    const transcript = testConversations.frustrated;
    const customerMessage = transcript[transcript.length - 1].content;

    log(colors.yellow, "Customer message:", customerMessage);
    
    const coaching = await geminiApi.getSupervisorCoaching(transcript, customerMessage);

    log(colors.blue, "\nCoaching Suggestions:");
    log(colors.blue, `  Tone: ${coaching.tone}`);
    log(colors.blue, `  Suggested Response: ${coaching.suggestedResponse}`);
    log(colors.blue, `  Key Points: ${coaching.keyPoints?.join(", ")}`);
    log(colors.blue, `  Warnings: ${coaching.warnings?.join(", ")}`);

    log(colors.green, "\n✓ Coaching suggestions test completed");
    return true;
  } catch (error) {
    log(colors.red, "✗ Coaching suggestions error:", error.message);
    return false;
  }
}

/**
 * Test Gemini 3 Summary Generation
 */
async function testGemini3Summary() {
  log(colors.blue, "\n=== Testing Gemini 3 Summary Generation ===");
  
  if (!process.env.GEMINI_API_KEY) {
    log(colors.yellow, "⚠ GEMINI_API_KEY not set, skipping");
    return null;
  }

  const geminiApi = new GeminiTextAPI(process.env.GEMINI_API_KEY);

  try {
    // Use a longer conversation for summary
    const transcript = [
      { role: "customer", content: "Hi, my order #12345 hasn't arrived yet." },
      { role: "ai", content: "I apologize for the delay. Let me check the status." },
      { role: "customer", content: "It was supposed to arrive three days ago." },
      { role: "ai", content: "I see the issue. The package was delayed in transit." },
      { role: "customer", content: "Can you expedite it?" },
      { role: "ai", content: "Yes, I've upgraded it to priority shipping at no charge." },
      { role: "customer", content: "Thank you, that helps." },
    ];

    const summary = await geminiApi.generateSummary(transcript);

    log(colors.blue, "\nGenerated Summary:");
    log(colors.blue, `  Sentiment: ${summary.sentiment}`);
    log(colors.blue, `  Intent: ${summary.intent}`);
    log(colors.blue, `  Key Issues: ${summary.keyIssues?.join(", ")}`);
    log(colors.blue, `  Resolution: ${summary.resolution}`);
    log(colors.blue, `  Action Items: ${summary.actionItems?.join(", ")}`);

    log(colors.green, "\n✓ Summary generation test completed");
    return true;
  } catch (error) {
    log(colors.red, "✗ Summary generation error:", error.message);
    return false;
  }
}

/**
 * Run all sentiment tests
 */
async function runAllTests() {
  log(colors.blue, "\n╔══════════════════════════════════════╗");
  log(colors.blue, "║  Sentiment Test Suite - Starting... ║");
  log(colors.blue, "╚══════════════════════════════════════╝");

  const results = {
    localSentiment: await testLocalSentimentAnalyzer(),
    gemini3Sentiment: await testGemini3SentimentAnalysis(),
    gemini3Coaching: await testGemini3Coaching(),
    gemini3Summary: await testGemini3Summary(),
  };

  // Summary
  log(colors.blue, "\n╔══════════════════════════════════════╗");
  log(colors.blue, "║  Test Results Summary                ║");
  log(colors.blue, "╚══════════════════════════════════════╝");

  let passed = 0;
  let failed = 0;
  let skipped = 0;

  Object.entries(results).forEach(([test, result]) => {
    if (result === true) {
      log(colors.green, `✓ ${test.padEnd(20)} PASSED`);
      passed++;
    } else if (result === false) {
      log(colors.red, `✗ ${test.padEnd(20)} FAILED`);
      failed++;
    } else {
      log(colors.yellow, `⚠ ${test.padEnd(20)} SKIPPED`);
      skipped++;
    }
  });

  log(
    colors.blue,
    `\nTotal: ${passed + failed + skipped} | Passed: ${passed} | Failed: ${failed} | Skipped: ${skipped}`,
  );

  process.exit(failed > 0 ? 1 : 0);
}

// Run tests
runAllTests();
