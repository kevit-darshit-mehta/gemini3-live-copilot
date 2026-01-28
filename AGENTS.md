# 🤖 Gemini 3 Live Copilot - Agent Guidelines

> **Significance**: This file serves as the source of truth for AI agents (and humans) working on this codebase. Read this before making changes.

## 1. Project Context

**Mission**: Create a next-generation customer support voice agent using Gemini 2.0 Flash Multimodal Live API. The system handles real-time voice conversations, detects customer frustration via sentiment analysis, and allows human supervisors to "take over" calls instantly.

**Key Features**:

- **Bi-directional Low-Latency Voice**: 16kHz input / 24kHz output.
- **Sentiment Analysis**: Real-time frustration metering.
- **Human-in-the-Loop**: Seamless supervisor takeover and context-aware handback.

## 2. Tech Stack Setup

- **Runtime**: Node.js (v20+)
- **Server**: Express.js + `ws` (WebSocket)
- **AI Model**: `gemini-2.5-flash-native-audio-latest`
- **Frontend**: Vanilla JS (ES6+), HTML5 AudioContext
- **Styling**: Native CSS (Glassmorphism, Dark Mode) - _No framework_

## 3. Project Structure

```text
/
├── server/
│   ├── index.js              # Main entry point, WebSocket routing
│   ├── gemini-live.js        # Gemini API session handler
│   ├── sentiment-analyzer.js # Sentiment logic & escalation rules
│   ├── conversation-manager.js # Session state management
│   └── logger.js             # Structured logging utility
├── public/
│   ├── customer.html         # Customer voice interface
│   ├── index.html            # Supervisor dashboard
│   └── js/                   # Frontend logic (audio-manager, app)
└── tests/                    # End-to-end verification scripts
```

## 4. Development Standards

- **Logging**: **MUST** use `server/logger.js`. **DO NOT** use `console.log` in server code.
  - usage: `logger.info("message")`, `logger.error("msg", err)`
- **Error Handling**: All async operations (especially API calls/WebSockets) must be wrapped in `try/catch`.
- **Formatting**: Use Prettier standard.
- **Comments**: Add JSDoc to all exported classes and major functions.

## 5. System Architecture

This project utilizes a multi-agent orchestration pattern:

### A. Gemini Voice Agent (Primary)

- **Role**: Customer Support Representative
- **Input/Output**: Native Audio (WebSocket stream)
- **Personality**: "Kore" - Warm, professional, and empathetic.
- **Constraints**:
  - **NO internal monologue** in output.
  - Must stop speaking immediately when interrupted (handled by server).

### B. Sentiment Supervisor Agent (Secondary)

- **Role**: Quality Assurance
- **Mechanism**: `server/sentiment-analyzer.js`
- **Logic**:
  - Scores transcript text (-5 to +5).
  - Triggers `escalation_alert` if frustration > 80% or persistent negativity.

### C. Human Supervisor (Controller)

- **Role**: Escalation Handler
- **Actions**:
  - `takeover`: Pauses AI, routes audio to human.
  - `handback`: Resumes AI, injects context summary.
