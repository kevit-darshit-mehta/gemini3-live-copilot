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
- **Server**: Express.js + `ws` (WebSocket) (Backend)
- **AI Model**: `gemini-2.5-flash-native-audio-latest`
- **Frontend**: Vanilla JS (ES6+), HTML5 AudioContext
- **Styling**: Native CSS (Glassmorphism, Dark Mode) - _No framework_
- **Architecture**: Monorepo with NPM Workspaces

## 3. Project Structure

```text
/
├── apps/
│   ├── api/                  # Backend Service (Express + WebSocket)
│   │   ├── index.js          # Entry point
│   │   └── gemini-live.js    # Gemini Session Logic
│   └── web/                  # Frontend UI (Static Files)
│       ├── customer.html     # Customer Interface
│       └── index.html        # Supervisor Dashboard
├── packages/
│   └── shared/               # Shared Utilities (Logger, Types)
└── package.json              # Workspace Root
```

## 4. Development Standards

- **Logging**: **MUST** use `Logger` from `@gemini-copilot/shared`. **DO NOT** use `console.log`.
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
- **Mechanism**: `server/sentiment-analyzer.js` (in api)
- **Logic**:
  - Scores transcript text (-5 to +5).
  - Triggers `escalation_alert` if frustration > 80% or persistent negativity.

### C. Human Supervisor (Controller)

- **Role**: Escalation Handler
- **Actions**:
  - `takeover`: Pauses AI, routes audio to human.
  - `handback`: Resumes AI, injects context summary.
