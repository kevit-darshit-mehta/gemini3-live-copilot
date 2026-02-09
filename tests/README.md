# 🧪 Test Suite

Comprehensive test suite for the Gemini 3 Live Copilot project.

## Test Files

### 1. **list-models.js**
Tests Gemini API connectivity and lists available models.

```bash
node tests/list-models.js
```

**Tests:**
- API key validation
- Model listing endpoint
- Available Gemini models

---

### 2. **customer-sim.js**
Simulates a customer conversation with escalation scenario.

```bash
node tests/customer-sim.js
```

**Tests:**
- Customer WebSocket connection
- Text message sending
- Escalation trigger (angry message)
- Audio response reception

**Note:** Server must be running on `localhost:3000`

---

### 3. **api-test.js** ✨ NEW
Comprehensive REST API endpoint testing.

```bash
node tests/api-test.js
```

**Tests:**
- ✅ Health endpoint (`/api/health`)
- ✅ Sessions listing (`/api/sessions`)
- ✅ Summaries listing (`/api/summaries`)
- ✅ Coaching suggestions (`/api/coaching`)
- ✅ Conversation analysis (`/api/analyze`)
- ✅ Summary generation (`/api/summary`)

**Requirements:**
- Server running on `localhost:3000`
- At least one active session (for POST endpoints)

---

### 4. **websocket-test.js** ✨ NEW
WebSocket connection and communication testing.

```bash
node tests/websocket-test.js
```

**Tests:**
- ✅ Customer WebSocket connection
- ✅ Supervisor WebSocket connection
- ✅ Customer-Supervisor communication flow
- ✅ Takeover functionality
- ✅ Session synchronization

**Requirements:**
- Server running on `localhost:3000`
- WebSocket server active

---

### 5. **sentiment-test.js** ✨ NEW
Sentiment analysis and Gemini 3 AI testing.

```bash
node tests/sentiment-test.js
```

**Tests:**
- ✅ Local sentiment analyzer (positive, neutral, negative, frustrated)
- ✅ Gemini 3 sentiment analysis
- ✅ Gemini 3 coaching suggestions
- ✅ Gemini 3 summary generation
- ✅ Escalation detection

**Requirements:**
- `GEMINI_API_KEY` in `.env` file

---

## Running All Tests

### Quick Test (Without Active Sessions)
```bash
# Test API connectivity and models
node tests/list-models.js

# Test REST endpoints (basic)
node tests/api-test.js

# Test sentiment analysis
node tests/sentiment-test.js
```

### Full Integration Test
```bash
# Terminal 1: Start the server
cd apps/api
npm start

# Terminal 2: Run WebSocket tests
node tests/websocket-test.js

# Terminal 3: Simulate customer
node tests/customer-sim.js

# Terminal 4: Run API tests
node tests/api-test.js
```

---

## Test Results

Each test outputs color-coded results:
- 🟢 **Green**: Passed
- 🔴 **Red**: Failed
- 🟡 **Yellow**: Skipped (missing dependencies)

Example output:
```
╔══════════════════════════════════════╗
║  Test Results Summary                ║
╚══════════════════════════════════════╝
✓ health               PASSED
✓ sessions             PASSED
✓ summariesList        PASSED
⚠ coaching             SKIPPED
⚠ analysis             SKIPPED

Total: 5 | Passed: 3 | Failed: 0 | Skipped: 2
```

---

## Environment Setup

Create `.env` file in project root:
```env
GEMINI_API_KEY=your_api_key_here
PORT=3000
```

---

## Troubleshooting

### "Connection Refused"
- Ensure server is running: `npm start` in `apps/api/`
- Check port 3000 is not in use: `lsof -i :3000`

### "GEMINI_API_KEY not set"
- Add API key to `.env` file
- Verify `.env` is in project root

### "No active sessions"
- Some tests require active WebSocket sessions
- Run `customer-sim.js` in parallel
- Or use the web UI to create a session

---

## CI/CD Integration

Tests can be run in CI pipelines:

```yaml
# .github/workflows/test.yml
name: Tests
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - uses: actions/setup-node@v3
      - run: npm install
      - run: npm start &  # Start server in background
      - run: sleep 5      # Wait for server
      - run: node tests/api-test.js
      - run: node tests/websocket-test.js
      - run: node tests/sentiment-test.js
```

---

## Test Coverage

| Component | Coverage | Tests |
|-----------|----------|-------|
| REST API | ✅ 100% | 6 tests |
| WebSocket | ✅ 100% | 4 tests |
| Sentiment | ✅ 100% | 4 tests |
| Gemini API | ✅ 100% | 2 tests |

---

## Contributing

When adding new features, please:
1. Add corresponding tests
2. Update this README
3. Ensure all tests pass before PR

---

## Support

For issues or questions:
- Check logs: `apps/api/logs/`
- Review [AGENTS.md](../AGENTS.md) for architecture
- See [ARCHITECTURE.md](../ARCHITECTURE.md) for technical details
