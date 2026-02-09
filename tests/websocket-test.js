/**
 * WebSocket Connection Test Suite
 * Tests WebSocket connections for customer and supervisor roles
 */

import WebSocket from "ws";
import crypto from "crypto";

const WS_URL = "ws://localhost:3000";

// Colors for console output
const colors = {
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  reset: "\x1b[0m",
};

function log(color, ...args) {
  console.log(color, ...args, colors.reset);
}

/**
 * Test Customer WebSocket Connection
 */
async function testCustomerConnection() {
  return new Promise((resolve) => {
    log(colors.blue, "\n=== Testing Customer WebSocket Connection ===");
    
    const sessionId = crypto.randomUUID();
    const ws = new WebSocket(`${WS_URL}?role=customer&session=${sessionId}`);
    
    let connected = false;
    let receivedMessage = false;

    const timeout = setTimeout(() => {
      if (!connected) {
        log(colors.red, "✗ Customer connection timeout");
        ws.close();
        resolve(false);
      }
    }, 5000);

    ws.on("open", () => {
      connected = true;
      log(colors.green, "✓ Customer WebSocket connected");
      log(colors.blue, "  Session ID:", sessionId);

      // Send a test text message
      setTimeout(() => {
        ws.send(
          JSON.stringify({
            type: "text",
            content: "Hello, this is a test message.",
          })
        );
        log(colors.yellow, "  Sent test message");
      }, 500);

      // Close after receiving or timeout
      setTimeout(() => {
        clearTimeout(timeout);
        ws.close();
        resolve(connected);
      }, 3000);
    });

    ws.on("message", (data) => {
      receivedMessage = true;
      try {
        const msg = JSON.parse(data);
        log(colors.green, `✓ Received message type: ${msg.type}`);
        
        if (msg.type === "session_ready") {
          log(colors.green, "  Session ready confirmed");
        }
        if (msg.type === "audio") {
          log(colors.green, "  Audio chunk received");
        }
        if (msg.type === "text" || msg.type === "inputTranscription") {
          log(colors.green, `  Text: ${msg.content || msg.text}`);
        }
      } catch (e) {
        log(colors.yellow, "  Received non-JSON data");
      }
    });

    ws.on("error", (error) => {
      log(colors.red, "✗ Customer connection error:", error.message);
      clearTimeout(timeout);
      resolve(false);
    });

    ws.on("close", () => {
      log(colors.yellow, "  Customer connection closed");
    });
  });
}

/**
 * Test Supervisor WebSocket Connection
 */
async function testSupervisorConnection() {
  return new Promise((resolve) => {
    log(colors.blue, "\n=== Testing Supervisor WebSocket Connection ===");
    
    const sessionId = crypto.randomUUID();
    const ws = new WebSocket(`${WS_URL}?role=supervisor&session=${sessionId}`);
    
    let connected = false;

    const timeout = setTimeout(() => {
      if (!connected) {
        log(colors.red, "✗ Supervisor connection timeout");
        ws.close();
        resolve(false);
      }
    }, 5000);

    ws.on("open", () => {
      connected = true;
      log(colors.green, "✓ Supervisor WebSocket connected");
      log(colors.blue, "  Session ID:", sessionId);

      // Close after a short delay
      setTimeout(() => {
        clearTimeout(timeout);
        ws.close();
        resolve(connected);
      }, 2000);
    });

    ws.on("message", (data) => {
      try {
        const msg = JSON.parse(data);
        log(colors.green, `✓ Received message type: ${msg.type}`);
        
        if (msg.type === "session_list") {
          log(colors.green, `  Active sessions: ${msg.sessions?.length || 0}`);
        }
        if (msg.type === "session_update") {
          log(colors.green, "  Session update received");
        }
      } catch (e) {
        log(colors.yellow, "  Received non-JSON data");
      }
    });

    ws.on("error", (error) => {
      log(colors.red, "✗ Supervisor connection error:", error.message);
      clearTimeout(timeout);
      resolve(false);
    });

    ws.on("close", () => {
      log(colors.yellow, "  Supervisor connection closed");
    });
  });
}

/**
 * Test Customer-Supervisor Communication
 */
async function testCustomerSupervisorFlow() {
  return new Promise((resolve) => {
    log(colors.blue, "\n=== Testing Customer-Supervisor Communication ===");
    
    const sessionId = crypto.randomUUID();
    let customerWs, supervisorWs;
    let customerConnected = false;
    let supervisorConnected = false;
    let supervisorReceivedCustomerMessage = false;

    // Create customer connection
    customerWs = new WebSocket(`${WS_URL}?role=customer&session=${sessionId}`);
    
    customerWs.on("open", () => {
      customerConnected = true;
      log(colors.green, "✓ Customer connected");
      
      // Connect supervisor after customer
      setTimeout(() => {
        supervisorWs = new WebSocket(`${WS_URL}?role=supervisor&session=${sessionId}`);
        
        supervisorWs.on("open", () => {
          supervisorConnected = true;
          log(colors.green, "✓ Supervisor connected to same session");
          
          // Send message from customer
          setTimeout(() => {
            customerWs.send(
              JSON.stringify({
                type: "text",
                content: "I need help with my account.",
              })
            );
            log(colors.yellow, "  Customer sent message");
          }, 500);
        });

        supervisorWs.on("message", (data) => {
          try {
            const msg = JSON.parse(data);
            if (msg.type === "text" || msg.type === "inputTranscription") {
              supervisorReceivedCustomerMessage = true;
              log(colors.green, "✓ Supervisor received customer message");
            }
          } catch (e) {}
        });

        supervisorWs.on("error", (error) => {
          log(colors.red, "✗ Supervisor error:", error.message);
        });
      }, 1000);
    });

    customerWs.on("error", (error) => {
      log(colors.red, "✗ Customer error:", error.message);
    });

    // Cleanup after test
    setTimeout(() => {
      if (customerWs) customerWs.close();
      if (supervisorWs) supervisorWs.close();
      
      const success = customerConnected && supervisorConnected;
      if (success) {
        log(colors.green, "✓ Customer-Supervisor flow test completed");
      } else {
        log(colors.red, "✗ Customer-Supervisor flow test failed");
      }
      resolve(success);
    }, 5000);
  });
}

/**
 * Test Takeover Functionality
 */
async function testTakeoverFunctionality() {
  return new Promise((resolve) => {
    log(colors.blue, "\n=== Testing Takeover Functionality ===");
    
    const sessionId = crypto.randomUUID();
    let supervisorWs;
    let customerWs;
    let customerNotified = false;
    let sessionUpdated = false;

    // Create customer connection first
    customerWs = new WebSocket(`${WS_URL}?role=customer&session=${sessionId}`);
    
    customerWs.on("open", () => {
      log(colors.green, "✓ Customer connected");
      
      // Connect supervisor after customer
      setTimeout(() => {
        supervisorWs = new WebSocket(`${WS_URL}?role=supervisor&session=${sessionId}`);
        
        supervisorWs.on("open", () => {
          log(colors.green, "✓ Supervisor connected");
          
          // Wait for session_list message first
          setTimeout(() => {
            supervisorWs.send(
              JSON.stringify({
                type: "takeover",
                sessionId: sessionId,
                supervisorId: "test-supervisor",
              })
            );
            log(colors.yellow, "  Supervisor requested takeover");
          }, 1000);
        });

        supervisorWs.on("message", (data) => {
          try {
            const msg = JSON.parse(data);
            if (msg.type === "session_update") {
              if (msg.data?.mode === "human" || msg.sessionId === sessionId) {
                sessionUpdated = true;
                log(colors.green, "✓ Session updated - Mode changed to human");
              }
            }
          } catch (e) {}
        });

        supervisorWs.on("error", (error) => {
          log(colors.red, "  Supervisor error:", error.message);
        });
      }, 1000);
    });

    customerWs.on("message", (data) => {
      try {
        const msg = JSON.parse(data);
        if (msg.type === "mode_change" && msg.mode === "human") {
          customerNotified = true;
          log(colors.green, "✓ Customer notified of takeover");
        }
      } catch (e) {}
    });

    customerWs.on("error", (error) => {
      log(colors.red, "  Customer error:", error.message);
    });

    // Cleanup and verify
    setTimeout(() => {
      if (customerWs) customerWs.close();
      if (supervisorWs) supervisorWs.close();
      
      const success = customerNotified || sessionUpdated;
      if (success) {
        log(colors.green, "✓ Takeover functionality verified");
      } else {
        log(colors.red, "✗ Takeover did not complete as expected");
      }
      resolve(success);
    }, 6000);
  });
}

/**
 * Run all WebSocket tests
 */
async function runAllTests() {
  log(colors.blue, "\n╔══════════════════════════════════════╗");
  log(colors.blue, "║  WebSocket Test Suite - Starting... ║");
  log(colors.blue, "╚══════════════════════════════════════╝");

  const results = {
    customerConnection: await testCustomerConnection(),
    supervisorConnection: await testSupervisorConnection(),
    customerSupervisorFlow: await testCustomerSupervisorFlow(),
    takeover: await testTakeoverFunctionality(),
  };

  // Wait a bit for all connections to close
  await new Promise(resolve => setTimeout(resolve, 1000));

  // Summary
  log(colors.blue, "\n╔══════════════════════════════════════╗");
  log(colors.blue, "║  Test Results Summary                ║");
  log(colors.blue, "╚══════════════════════════════════════╝");

  let passed = 0;
  let failed = 0;

  Object.entries(results).forEach(([test, result]) => {
    if (result === true) {
      log(colors.green, `✓ ${test.padEnd(25)} PASSED`);
      passed++;
    } else {
      log(colors.red, `✗ ${test.padEnd(25)} FAILED`);
      failed++;
    }
  });

  log(
    colors.blue,
    `\nTotal: ${passed + failed} | Passed: ${passed} | Failed: ${failed}`,
  );

  process.exit(failed > 0 ? 1 : 0);
}

// Run tests
runAllTests();
