/**
 * API Endpoints Test Suite
 * Tests REST API endpoints for health, sessions, coaching, analysis, and summaries
 */

import { config } from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load .env from apps/api directory
config({ path: join(__dirname, "../apps/api/.env") });

const API_BASE_URL = "http://localhost:3000";

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

/**
 * Test Health Endpoint
 */
async function testHealthEndpoint() {
  log(colors.blue, "\n=== Testing Health Endpoint ===");
  try {
    const response = await fetch(`${API_BASE_URL}/api/health`);
    const data = await response.json();

    if (response.ok && data.status === "healthy") {
      log(colors.green, "✓ Health check passed");
      console.log("  Response:", data);
      return true;
    } else {
      log(colors.red, "✗ Health check failed");
      console.log("  Response:", data);
      return false;
    }
  } catch (error) {
    log(colors.red, "✗ Health check error:", error.message);
    return false;
  }
}

/**
 * Test Sessions Endpoint
 */
async function testSessionsEndpoint() {
  log(colors.blue, "\n=== Testing Sessions Endpoint ===");
  try {
    const response = await fetch(`${API_BASE_URL}/api/sessions`);
    const data = await response.json();

    if (response.ok && Array.isArray(data)) {
      log(colors.green, "✓ Sessions endpoint working");
      console.log(`  Found ${data.length} active session(s)`);
      if (data.length > 0) {
        console.log("  Sample session:", data[0]);
      }
      return true;
    } else {
      log(colors.red, "✗ Sessions endpoint failed");
      return false;
    }
  } catch (error) {
    log(colors.red, "✗ Sessions endpoint error:", error.message);
    return false;
  }
}

/**
 * Test Coaching Endpoint
 */
async function testCoachingEndpoint() {
  log(colors.blue, "\n=== Testing Coaching Endpoint ===");
  
  // First, create a mock session by getting active sessions
  try {
    const sessionsResponse = await fetch(`${API_BASE_URL}/api/sessions`);
    const sessions = await sessionsResponse.json();

    if (sessions.length === 0) {
      log(colors.yellow, "⚠ No active sessions to test coaching");
      return null;
    }

    const sessionId = sessions[0].id;
    const response = await fetch(`${API_BASE_URL}/api/coaching`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId,
        customerMessage: "I'm having trouble with my order",
      }),
    });

    const data = await response.json();

    if (response.ok) {
      log(colors.green, "✓ Coaching endpoint working");
      console.log("  Coaching response:", data);
      return true;
    } else {
      log(colors.red, "✗ Coaching endpoint failed");
      console.log("  Error:", data);
      return false;
    }
  } catch (error) {
    log(colors.red, "✗ Coaching endpoint error:", error.message);
    return false;
  }
}

/**
 * Test Analysis Endpoint
 */
async function testAnalysisEndpoint() {
  log(colors.blue, "\n=== Testing Analysis Endpoint ===");
  
  try {
    const sessionsResponse = await fetch(`${API_BASE_URL}/api/sessions`);
    const sessions = await sessionsResponse.json();

    if (sessions.length === 0) {
      log(colors.yellow, "⚠ No active sessions to test analysis");
      return null;
    }

    const sessionId = sessions[0].id;
    const response = await fetch(`${API_BASE_URL}/api/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId }),
    });

    const data = await response.json();

    if (response.ok) {
      log(colors.green, "✓ Analysis endpoint working");
      console.log("  Analysis:", data);
      return true;
    } else {
      log(colors.red, "✗ Analysis endpoint failed");
      console.log("  Error:", data);
      return false;
    }
  } catch (error) {
    log(colors.red, "✗ Analysis endpoint error:", error.message);
    return false;
  }
}

/**
 * Test Summary Endpoint
 */
async function testSummaryEndpoint() {
  log(colors.blue, "\n=== Testing Summary Endpoint ===");
  
  try {
    const sessionsResponse = await fetch(`${API_BASE_URL}/api/sessions`);
    const sessions = await sessionsResponse.json();

    if (sessions.length === 0) {
      log(colors.yellow, "⚠ No active sessions to test summary");
      return null;
    }

    const sessionId = sessions[0].id;
    const response = await fetch(`${API_BASE_URL}/api/summary`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId }),
    });

    const data = await response.json();

    if (response.ok) {
      log(colors.green, "✓ Summary endpoint working");
      console.log("  Summary:", data);
      return true;
    } else {
      log(colors.red, "✗ Summary endpoint failed");
      console.log("  Error:", data);
      return false;
    }
  } catch (error) {
    log(colors.red, "✗ Summary endpoint error:", error.message);
    return false;
  }
}

/**
 * Test Summaries List Endpoint
 */
async function testSummariesListEndpoint() {
  log(colors.blue, "\n=== Testing Summaries List Endpoint ===");
  try {
    const response = await fetch(`${API_BASE_URL}/api/summaries?limit=10`);
    const data = await response.json();

    if (response.ok && data.summaries && Array.isArray(data.summaries)) {
      log(colors.green, "✓ Summaries list endpoint working");
      console.log(`  Found ${data.summaries.length} summary record(s)`);
      if (data.stats) {
        console.log("  Statistics:", data.stats);
      }
      return true;
    } else {
      log(colors.red, "✗ Summaries list endpoint failed");
      return false;
    }
  } catch (error) {
    log(colors.red, "✗ Summaries list endpoint error:", error.message);
    return false;
  }
}

/**
 * Run all tests
 */
async function runAllTests() {
  log(colors.blue, "\n╔══════════════════════════════════════╗");
  log(colors.blue, "║  API Test Suite - Starting...       ║");
  log(colors.blue, "╚══════════════════════════════════════╝");

  const results = {
    health: await testHealthEndpoint(),
    sessions: await testSessionsEndpoint(),
    summariesList: await testSummariesListEndpoint(),
    coaching: await testCoachingEndpoint(),
    analysis: await testAnalysisEndpoint(),
    summary: await testSummaryEndpoint(),
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
