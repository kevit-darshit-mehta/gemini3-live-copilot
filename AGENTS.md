# 🤖 Gemini 3 Live Copilot - Agent Guidelines

> **Significance**: This file serves as the source of truth for AI agents (and humans) working on this codebase. Read this before making changes.

## 1. Project Context

**Mission**: Create a next-generation customer support voice agent using **Gemini 3** and **Gemini 2.5 Flash Native Audio**. The system handles real-time voice conversations, detects customer frustration via sentiment analysis, and allows human supervisors to "take over" calls instantly.

**Key Features**:

- **Bi-directional Low-Latency Voice**: 16kHz input / 24kHz output.
- **Sentiment Analysis**: Real-time frustration metering using Gemini 3.
- **Human-in-the-Loop**: Seamless supervisor takeover and context-aware handback.

## 2. Tech Stack Setup

- **Runtime**: Node.js (v20+)
- **Server**: Express.js + `ws` (WebSocket) (Backend)
- **AI Models**:
  - Voice: `gemini-2.5-flash-native-audio-latest` (Real-time Audio via v1beta API)
  - Analysis: `gemini-3-flash-preview` (Sentiment & Coaching)
- **Frontend**: Vanilla JS (ES6+), HTML5 AudioContext, AudioWorklet
- **Styling**: Native CSS (Glassmorphism, Dark Mode) - _No framework_
- **Database**: SQLite (sqlite3 + sqlite wrapper)
- **Architecture**: Monorepo with NPM Workspaces
- **Additional Dependencies**:
  - `sentiment` library for fallback sentiment analysis
  - `dotenv` for environment configuration

## 3. Project Structure

```text
/
├── apps/
│   ├── api/                  # Backend Service (Express + WebSocket)
│   │   ├── index.js          # Entry point (Server & WebSocket Logic)
│   │   ├── gemini-live.js    # Gemini Voice Session Logic
│   │   ├── gemini-text.js    # Gemini Text API (Sentiment/Coaching)
│   │   ├── sentiment-analyzer.js # Local Sentiment Analysis Fallback
│   │   ├── database-manager.js # SQLite Database Wrapper
│   │   ├── conversation-manager.js # Session State Management
│   │   └── database/         # SQLite Database & Schema
│   │       ├── schema.sql
│   │       └── copilot.db
│   └── web/                  # Frontend UI (Static Files)
│       ├── customer.html     # Customer Voice Interface
│       ├── index.html        # Supervisor Dashboard
│       ├── summaries.html    # Call Summaries Dashboard
│       ├── js/               # Frontend Logic
│       │   ├── app.js        # Supervisor Dashboard Controller
│       │   ├── audio-manager.js # Audio Recording/Playback
│       │   ├── audio-processor.js # AudioWorklet for PCM Processing
│       │   └── summaries.js  # Summaries Page Controller
│       ├── css/
│       │   └── styles.css    # Global Styles
│       └── assets/           # Static Assets
├── packages/
│   └── shared/               # Shared Utilities (Logger, Types)
│       └── src/
│           ├── index.js
│           └── logger.js
├── tests/                    # Testing Scripts
│   ├── customer-sim.js       # Customer Simulation Script
│   └── list-models.js        # Gemini Models Test Script
├── tools/                    # Development Tools
└── package.json              # Workspace Root
```

## 4. Development Standards

- **Logging**: **MUST** use `Logger` from `@gemini-copilot/shared`. **DO NOT** use `console.log` in backend code.
- **Error Handling**: All async operations (especially API calls/WebSockets) must be wrapped in `try/catch`.
- **Formatting**: Use Prettier standard.
- **Comments**: Add JSDoc to all exported classes and major functions.

## 5. System Architecture

This project utilizes a multi-agent orchestration pattern:

### A. Gemini Voice Agent (Primary)

- **Role**: Customer Support Representative
- **Model**: `gemini-2.5-flash-native-audio-latest`
- **API Version**: v1beta (WebSocket)
- **Input/Output**: Native Audio (WebSocket stream)
- **Personality**: "Kora" - Warm, professional, and empathetic voice
- **Audio Format**: 16kHz input / 24kHz output PCM
- **Response Modality**: AUDIO only (native audio models don't support TEXT mode)
- **Constraints**:
  - **NO internal monologue** in output
  - **English-only responses** (enforced via `isEnglishText()` filter)
  - Must stop speaking immediately when interrupted (handled by server)
  - System instruction prevents markdown/formatting in voice output

### B. Sentiment Supervisor Agent (Secondary)

- **Role**: Quality Assurance & Analytics
- **Models**: 
  - Primary: Gemini 3 (`gemini-3-flash-preview`) via REST API
  - Fallback: Local `sentiment` library for offline analysis
- **Mechanism**: `apps/api/gemini-text.js` + `apps/api/sentiment-analyzer.js`
- **Logic**:
  - Analyzes transcript text using Gemini 3 for sentiment & intent detection
  - Triggers `escalation_alert` if frustration > 70% or specific negative intents detected
  - Provides supervisor coaching suggestions in real-time
  - Generates post-call summaries with action items
- **Features**:
  - Real-time sentiment scoring (0-100 scale)
  - Intent classification (complaint, inquiry, support, purchase, cancellation)
  - Escalation risk assessment (low, medium, high)
  - Key issues extraction

### C. Human Supervisor (Controller)

- **Role**: Escalation Handler
- **Actions**:
  - `takeover`: Pauses AI, routes audio to human.
  - `handback`: Resumes AI, injects context summary.

## 6. Key Technical Details

### A. API Endpoints

**REST API:**
- `GET /api/health` - Health check with active session count
- `GET /api/sessions` - List all active sessions
- `GET /api/sessions/:id` - Get session details by ID
- `GET /api/summaries` - Get paginated call summaries with filters
- `GET /api/summary/:sessionId` - Get single summary by session ID
- `POST /api/coaching` - Get real-time supervisor coaching suggestions
- `POST /api/analyze` - Analyze conversation sentiment & escalation risk
- `POST /api/summary` - Generate and save post-call summary

**WebSocket Connections:**
- Customer: `ws://localhost:3000?role=customer&sessionId=<uuid>`
- Supervisor: `ws://localhost:3000?role=supervisor&sessionId=<uuid>`

### B. Audio Processing Pipeline

**Customer → AI:**
1. Browser captures microphone via `getUserMedia()`
2. AudioWorklet (`audio-processor.js`) converts to 16kHz PCM
3. WebSocket sends Int16Array chunks to backend
4. Backend forwards audio to Gemini Live API (Base64-encoded)
5. Gemini processes and generates response

**AI → Customer:**
1. Gemini sends 24kHz PCM audio chunks via WebSocket
2. Backend forwards to customer's WebSocket
3. Frontend decodes Base64 → Int16Array
4. AudioContext plays audio through speakers

### C. English-Only Response Filtering

The system includes `isEnglishText()` function in `gemini-live.js` that:
- Rejects responses containing Devanagari, Gujarati, or other non-Latin scripts
- Ensures at least 30% of characters are Latin letters
- Prevents non-English audio from being spoken to customers
- Logs rejected text for debugging

### D. Database Schema

**Tables:**
- `call_summaries` - Post-call analytics and summaries
  - Fields: session_id, sentiment, sentiment_score, intent, key_issues, resolution, action_items, escalation_risk, transcript, duration, timestamps

**Storage Location:** `apps/api/database/copilot.db`

### E. Session State Management

Managed by `ConversationManager` class:
- Tracks active sessions with unique session IDs
- Maintains session metadata (mode, status, connections)
- Stores real-time transcript and sentiment data
- Handles supervisor assignments and takeover state
- Provides session lifecycle management (create, update, delete)
