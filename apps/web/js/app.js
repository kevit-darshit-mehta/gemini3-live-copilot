import { AudioManager } from "/js/audio-manager.js";

/**
 * Live Customer Support Co-Pilot - Supervisor Dashboard App
 * Main JavaScript application for the supervisor interface
 */
class SupervisorDashboard {
  constructor() {
    this.ws = null;
    this.sessions = new Map();
    this.selectedSessionId = null;
    this.isConnected = false;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;

    // Audio state
    this.audioManager = new AudioManager();

    this.init();
  }

  init() {
    this.bindElements();
    this.bindEvents();
    this.connectWebSocket();
    this.startDurationTimer();
  }

  bindElements() {
    // Header elements
    this.statActive = document.getElementById("stat-active");
    this.statWaiting = document.getElementById("stat-waiting");
    this.statHuman = document.getElementById("stat-human");
    this.connectionStatus = document.getElementById("connection-status");
    this.btnRefresh = document.getElementById("btn-refresh");

    // Sidebar elements
    this.sessionsList = document.getElementById("sessions-list");
    this.noSessions = document.getElementById("no-sessions");

    // Main content elements
    this.conversationView = document.getElementById("conversation-view");
    this.noSelection = document.getElementById("no-selection");
    this.sessionTitle = document.getElementById("session-title");
    this.modeIndicator = document.getElementById("mode-indicator");
    this.modeText = document.getElementById("mode-text");
    this.transcript = document.getElementById("transcript");
    this.btnTakeover = document.getElementById("btn-takeover");
    this.btnHandback = document.getElementById("btn-handback");
    this.btnMic = document.getElementById("btn-mic");
    this.audioControls = document.getElementById("audio-controls");
    this.audioVisualizer = document.getElementById("audio-visualizer");
    this.supervisorInput = document.getElementById("supervisor-input");
    this.messageInput = document.getElementById("message-input");
    this.btnSend = document.getElementById("btn-send");
    this.btnEnd = document.getElementById("btn-end");

    // Detail panel elements
    this.detailSessionId = document.getElementById("detail-session-id");
    this.detailStarted = document.getElementById("detail-started");
    this.detailDuration = document.getElementById("detail-duration");
    this.detailMode = document.getElementById("detail-mode");
    this.detailMessages = document.getElementById("detail-messages");
    this.detailCustomerStatus = document.getElementById(
      "detail-customer-status",
    );
    this.contextText = document.getElementById("context-text");
    this.btnInject = document.getElementById("btn-inject");

    this.frustrationBar = document.getElementById("frustration-bar");
    this.frustrationValue = document.getElementById("frustration-value");

    // Gemini 3 panel elements
    this.btnGetCoaching = document.getElementById("btn-get-suggestions");
    this.btnAnalyze = document.getElementById("btn-analyze");
    this.coachingTip = document.getElementById("coaching-tip");
    this.coachingTipText = document.getElementById("coaching-tip-text");
    this.coachingSuggestions = document.getElementById("coaching-suggestions");
    this.suggestionList = document.getElementById("suggestion-list");
    this.analyticsIntent = document.getElementById("analytics-intent");
    this.analyticsSentiment = document.getElementById("analytics-sentiment");
    this.analyticsRisk = document.getElementById("analytics-risk");
    this.analyticsIssues = document.getElementById("analytics-issues");
    this.issuesList = document.getElementById("issues-list");

    // Toast container
    this.toastContainer = document.getElementById("toast-container");
  }

  bindEvents() {
    this.btnRefresh?.addEventListener("click", () => this.refreshSessions());
    this.btnTakeover?.addEventListener("click", () => this.takeOver());
    this.btnHandback?.addEventListener("click", () => this.handBack());
    this.btnMic?.addEventListener("click", () => this.toggleMicrophone());
    this.btnInject?.addEventListener("click", () => this.injectContext());
    this.btnSend?.addEventListener("click", () => this.sendMessage());
    this.btnEnd?.addEventListener("click", () => this.endCall());
    this.btnGetCoaching?.addEventListener("click", () => this.getCoaching());
    this.btnAnalyze?.addEventListener("click", () =>
      this.analyzeConversation(),
    );
    this.messageInput?.addEventListener("keypress", (e) => {
      if (e.key === "Enter") this.sendMessage();
    });
  }

  connectWebSocket() {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    // Use explicit 3000 port for backend connection
    const host = window.location.hostname;
    const wsUrl = `${protocol}//${host}:3000?role=supervisor`;

    this.ws = new WebSocket(wsUrl);

    this.ws.onopen = () => {
      console.log("[WS] Connected to server");
      this.isConnected = true;
      this.reconnectAttempts = 0;
      this.updateConnectionStatus(true);
      this.showToast(
        "Connected",
        "Connected to server successfully",
        "success",
      );
    };

    this.ws.onclose = () => {
      console.log("[WS] Disconnected from server");
      this.isConnected = false;
      this.updateConnectionStatus(false);
      this.attemptReconnect();
    };

    this.ws.onerror = (error) => {
      console.error("[WS] WebSocket error:", error);
      this.showToast(
        "Connection Error",
        "Failed to connect to server",
        "error",
      );
    };

    this.ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        this.handleMessage(message);
      } catch (error) {
        console.error("[WS] Error parsing message:", error);
      }
    };
  }

  attemptReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      this.showToast(
        "Connection Lost",
        "Unable to reconnect. Please refresh the page.",
        "error",
      );
      return;
    }

    this.reconnectAttempts++;
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);

    setTimeout(() => {
      console.log(
        `[WS] Attempting reconnect (${this.reconnectAttempts}/${this.maxReconnectAttempts})`,
      );
      this.connectWebSocket();
    }, delay);
  }

  updateConnectionStatus(connected) {
    if (!this.connectionStatus) return;

    const dot = this.connectionStatus.querySelector(".status-dot");
    const text = this.connectionStatus.querySelector(".status-text");

    if (connected) {
      dot.style.backgroundColor = "var(--color-success)";
      text.textContent = "Connected";
    } else {
      dot.style.backgroundColor = "var(--color-danger)";
      text.textContent = "Disconnected";
    }
  }

  handleMessage(message) {

    switch (message.type) {
      case "sessions_list":
        this.updateSessionsList(message.sessions);
        break;

      case "session_update":
        this.updateSession(message.sessionId, message.data);
        break;

      case "ai_response":
        if (message.data.type === "text") {
          this.addMessageToTranscript(
            message.sessionId,
            "ai",
            message.data.content,
          );
        }
        break;

      case "customer_message":
        this.addMessageToTranscript(
          message.sessionId,
          "customer",
          message.content,
        );
        break;

      case "customer_input":
        // Handle customer's spoken input transcription
        this.addMessageToTranscript(
          message.sessionId,
          "customer",
          message.text,
        );
        break;

      case "customer_audio":
        // Handle incoming customer audio PCM
        this.handleCustomerAudio(message.sessionId, message.data);
        break;

      case "context_injected":
        this.showToast(
          "Context Injected",
          "AI will use the provided context",
          "success",
        );
        break;

      case "escalation_alert":
        this.showToast(
          "⚠️ High Frustration Alert",
          `Session ${message.sessionId}: ${message.reason}`,
          "warning",
        );
        // Play alert sound if possible
        break;

      case "frustration_update":
        // Auto-update frustration meter from Gemini 3 AI
        if (message.sessionId === this.selectedSessionId) {
          this.updateFrustrationMeter(message.frustrationLevel);

          // Also update analytics sentiment to match (keep them synchronized)
          if (this.analyticsSentiment) {
            const sentimentColors = {
              positive: "var(--color-success)",
              neutral: "var(--color-text-secondary)",
              negative: "var(--color-warning)",
              frustrated: "var(--color-danger)",
              angry: "var(--color-danger)",
            };
            this.analyticsSentiment.textContent = `${message.sentiment || "-"} (${message.frustrationLevel || 0}%)`;
            this.analyticsSentiment.style.color =
              sentimentColors[message.sentiment] || "inherit";
          }
        }
        break;

      case "analytics_update":
        // Auto-update analytics panel from Gemini 3
        if (message.sessionId === this.selectedSessionId && message.data) {
          this.updateAnalyticsPanel(message.data);
        }
        break;

      case "coaching_update":
        // Auto-update coaching suggestions during takeover
        if (message.sessionId === this.selectedSessionId && message.data) {
          this.updateCoachingPanel(message.data);
          this.showToast("💡 New Coaching", "AI suggestion updated", "info");
        }
        break;

      case "session_ended":
        this.showToast(
          "Session Ended",
          message.message || "The session has been terminated.",
          "info",
        );
        // Clear selection if this was the selected session
        if (message.sessionId === this.selectedSessionId) {
          this.selectedSessionId = null;
          this.showNoSelection();
        }
        // Refresh sessions list
        this.refreshSessions();
        break;

      case "error":
        this.showToast("Error", message.message, "error");
        break;
    }
  }

  updateFrustrationMeter(level) {
    if (!this.frustrationBar || !this.frustrationValue) return;

    const width = Math.min(100, Math.max(0, level));
    this.frustrationBar.style.width = `${width}%`;
    this.frustrationValue.textContent = `${width}%`;

    if (width < 30) {
      this.frustrationBar.style.backgroundColor = "var(--color-success)";
    } else if (width < 60) {
      this.frustrationBar.style.backgroundColor = "var(--color-warning)";
    } else {
      this.frustrationBar.style.backgroundColor = "var(--color-danger)";
    }
  }

  updateSessionsList(sessions) {
    this.sessions.clear();
    sessions.forEach((session) => {
      this.sessions.set(session.id, session);
    });
    this.renderSessionsList();
    this.updateStats();
  }

  updateSession(sessionId, data) {
    const session = this.sessions.get(sessionId) || {};
    this.sessions.set(sessionId, { ...session, ...data });
    this.renderSessionsList();
    this.updateStats();

    // Update selected session view
    if (sessionId === this.selectedSessionId) {
      this.renderSessionDetails(this.sessions.get(sessionId));
    }
  }

  renderSessionsList() {
    if (!this.sessionsList) return;

    // Clear existing sessions (keep empty state)
    const cards = this.sessionsList.querySelectorAll(".session-card");
    cards.forEach((card) => card.remove());

    // Filter out completed sessions (calls that have ended)
    const activeSessions = Array.from(this.sessions.values()).filter(
      (session) => session.status !== "completed",
    );

    if (activeSessions.length === 0) {
      this.noSessions.style.display = "flex";
      return;
    }

    this.noSessions.style.display = "none";

    // Sort sessions: human mode first, then by creation time
    const sortedSessions = activeSessions.sort((a, b) => {
      if (a.mode === "human" && b.mode !== "human") return -1;
      if (a.mode !== "human" && b.mode === "human") return 1;
      return b.createdAt - a.createdAt;
    });

    sortedSessions.forEach((session) => {
      const card = this.createSessionCard(session);
      this.sessionsList.appendChild(card);
    });
  }

  createSessionCard(session) {
    const card = document.createElement("div");
    card.className = `session-card ${session.id === this.selectedSessionId ? "selected" : ""} ${session.mode === "human" ? "human-takeover" : ""}`;
    card.dataset.sessionId = session.id;

    const statusClass =
      session.mode === "human"
        ? "human"
        : session.status === "active"
          ? "ai"
          : "waiting";
    const statusText =
      session.mode === "human"
        ? "Human"
        : session.status === "active"
          ? "AI Active"
          : "Waiting";

    const preview =
      session.lastMessage?.content?.substring(0, 50) || "No messages yet";
    const time = this.formatTime(session.createdAt);

    card.innerHTML = `
      <div class="session-header">
        <span class="session-id">${session.id.substring(0, 8)}...</span>
        <span class="session-status ${statusClass}">
          <span class="status-dot" style="width: 6px; height: 6px; border-radius: 50%; background: currentColor;"></span>
          ${statusText}
        </span>
      </div>
      <div class="session-preview">${this.escapeHtml(preview)}</div>
      <div class="session-meta">
        <span>${session.transcriptLength || 0} messages</span>
        <span>${time}</span>
      </div>
    `;

    card.addEventListener("click", () => this.selectSession(session.id));
    return card;
  }

  selectSession(sessionId) {
    this.selectedSessionId = sessionId;
    const session = this.sessions.get(sessionId);

    if (!session) return;

    // Update UI
    this.renderSessionsList();
    this.renderSessionDetails(session);

    // Show conversation view
    this.noSelection.style.display = "none";
    this.conversationView.style.display = "flex";
    this.conversationView.style.flexDirection = "column";

    // Fetch full transcript
    this.fetchTranscript(sessionId);
  }

  renderSessionDetails(session) {
    if (!session) return;

    // Show panel content
    const detailContent = document.getElementById("detail-content");
    if (detailContent) detailContent.style.display = "block";

    // Update header
    this.sessionTitle.textContent = `Session ${session.id.substring(0, 8)}`;

    // Update mode indicator
    const isHuman = session.mode === "human";
    this.modeIndicator.className = `mode-indicator ${isHuman ? "human" : "ai"}`;
    this.modeText.textContent = isHuman ? "Human Mode" : "AI Mode";

    // Update buttons
    this.btnTakeover.style.display = isHuman ? "none" : "inline-flex";
    this.btnHandback.style.display = isHuman ? "inline-flex" : "none";
    this.audioControls.style.display = isHuman ? "flex" : "none";
    this.supervisorInput.style.display = isHuman ? "block" : "none";

    // Update detail panel
    this.detailSessionId.textContent = session.id.substring(0, 12) + "...";
    this.detailStarted.textContent = new Date(
      session.createdAt,
    ).toLocaleTimeString();
    this.detailMode.textContent = isHuman ? "Human Supervisor" : "AI Assistant";
    this.detailMessages.textContent = session.transcriptLength || 0;
    this.detailCustomerStatus.textContent = session.customerConnected
      ? "Yes"
      : "No";

    this.updateFrustrationMeter(session.frustrationLevel || 0);
  }

  async fetchTranscript(sessionId) {
    try {
      const host = window.location.hostname;
      const response = await fetch(
        `http://${host}:3000/api/sessions/${sessionId}`,
      );
      if (!response.ok) throw new Error("Failed to fetch session");

      const session = await response.json();
      this.renderTranscript(session.transcript || []);
    } catch (error) {
      console.error("Error fetching transcript:", error);
      this.transcript.innerHTML =
        '<p style="color: var(--color-text-muted); text-align: center;">Failed to load transcript</p>';
    }
  }

  renderTranscript(messages) {
    this.transcript.innerHTML = "";

    messages.forEach((msg) => {
      this.addMessageElement(msg.role, msg.content, msg.timestamp);
    });

    this.transcript.scrollTop = this.transcript.scrollHeight;
  }

  addMessageToTranscript(sessionId, role, content) {
    if (sessionId !== this.selectedSessionId) return;

    this.addMessageElement(role, content, Date.now());
    this.transcript.scrollTop = this.transcript.scrollHeight;

    // Update message count
    const session = this.sessions.get(sessionId);
    if (session) {
      session.transcriptLength = (session.transcriptLength || 0) + 1;
      this.detailMessages.textContent = session.transcriptLength;
    }
  }

  addMessageElement(role, content, timestamp) {
    const div = document.createElement("div");
    div.className = `message ${role}`;

    const avatarIcon =
      role === "customer"
        ? '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>'
        : role === "ai"
          ? '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M12 1v6m0 6v10M4.22 4.22l4.24 4.24m7.08 7.08l4.24 4.24M1 12h6m6 0h10M4.22 19.78l4.24-4.24m7.08-7.08l4.24-4.24"/></svg>'
          : '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><path d="M20 8v6M23 11h-6"/></svg>';

    div.innerHTML = `
      <div class="message-avatar">${avatarIcon}</div>
      <div class="message-content">
        <div class="message-text">${this.escapeHtml(content)}</div>
        <div class="message-time">${this.formatTime(timestamp)}</div>
      </div>
    `;

    this.transcript.appendChild(div);
  }

  takeOver() {
    if (!this.selectedSessionId || !this.ws) return;

    this.ws.send(
      JSON.stringify({
        type: "takeover",
        sessionId: this.selectedSessionId,
        supervisorId: "supervisor-" + Date.now(),
      }),
    );

    this.showToast(
      "Taking Over",
      "You are now controlling this conversation",
      "info",
    );
  }

  handBack() {
    if (!this.selectedSessionId || !this.ws) return;

    const context = this.contextText?.value || "";

    this.ws.send(
      JSON.stringify({
        type: "handback",
        sessionId: this.selectedSessionId,
        context: context,
      }),
    );

    // Clear context textarea
    if (this.contextText) this.contextText.value = "";

    this.showToast(
      "Handing Back",
      "AI is now handling this conversation",
      "success",
    );
  }

  sendMessage() {
    if (!this.selectedSessionId || !this.ws || !this.messageInput) return;

    const content = this.messageInput.value.trim();
    if (!content) return;

    this.ws.send(
      JSON.stringify({
        type: "supervisor_message",
        sessionId: this.selectedSessionId,
        content: content,
      }),
    );

    // Add to local transcript
    this.addMessageToTranscript(this.selectedSessionId, "supervisor", content);

    // Clear input
    this.messageInput.value = "";
  }

  async toggleMicrophone() {
    if (this.audioManager.isRecording) {
      this.stopRecording();
    } else {
      await this.startRecording();
    }
  }

  async startRecording() {
    try {
      this.btnMic.classList.add("recording");
      this.audioVisualizer
        .querySelectorAll(".audio-bar")
        .forEach((bar) => bar.classList.add("active"));

      // Initialize Web Speech API for supervisor speech transcription
      const SpeechRecognition =
        window.SpeechRecognition || window.webkitSpeechRecognition;
      if (SpeechRecognition) {
        this.recognition = new SpeechRecognition();
        this.recognition.continuous = true;
        this.recognition.interimResults = false;
        this.recognition.lang = "en-US";

        this.recognition.onresult = (event) => {
          const transcript =
            event.results[event.results.length - 1][0].transcript;
          if (
            transcript &&
            transcript.trim() &&
            this.ws &&
            this.selectedSessionId
          ) {
            this.ws.send(
              JSON.stringify({
                type: "supervisor_speech",
                sessionId: this.selectedSessionId,
                text: transcript.trim(),
              }),
            );
            // Also add to local UI immediately
            this.addMessageToTranscript(
              this.selectedSessionId,
              "supervisor",
              transcript.trim(),
            );
          }
        };

        this.recognition.onerror = (event) => {
          console.warn("[Supervisor Speech] Recognition error:", event.error);
        };

        this.recognition.start();
      }

      await this.audioManager.startRecording((pcmData) => {
        if (
          this.ws &&
          this.ws.readyState === WebSocket.OPEN &&
          this.selectedSessionId
        ) {
          this.ws.send(
            JSON.stringify({
              type: "supervisor_audio",
              sessionId: this.selectedSessionId,
              data: this.int16ToBase64(pcmData),
            }),
          );
        }
      });
    } catch (error) {
      console.error("Error starting microphone:", error);
      this.showToast(
        "Microphone Error",
        "Unable to access microphone",
        "error",
      );
      // Reset UI
      this.stopRecording();
    }
  }

  stopRecording() {
    this.audioManager.stopRecording();

    // Stop speech recognition
    if (this.recognition) {
      this.recognition.stop();
      this.recognition = null;
    }

    // Update UI
    this.btnMic?.classList.remove("recording");
    this.audioVisualizer
      ?.querySelectorAll(".audio-bar")
      .forEach((bar) => bar.classList.remove("active"));
  }

  injectContext() {
    if (!this.selectedSessionId || !this.ws || !this.contextText) return;

    const context = this.contextText.value.trim();
    if (!context) {
      this.showToast(
        "No Context",
        "Please enter context text first",
        "warning",
      );
      return;
    }

    this.ws.send(
      JSON.stringify({
        type: "inject_context",
        sessionId: this.selectedSessionId,
        context: context,
      }),
    );

    // Clear the context text after sending
    this.contextText.value = "";
  }

  endCall() {
    if (!this.selectedSessionId || !this.ws) {
      this.showToast("No Session", "Please select a session first", "warning");
      return;
    }

    // Show custom confirmation modal
    this.showConfirmModal().then((confirmed) => {
      if (confirmed) {
        this.ws.send(
          JSON.stringify({
            type: "end_call",
            sessionId: this.selectedSessionId,
          }),
        );
      }
    });
  }

  showConfirmModal() {
    return new Promise((resolve) => {
      const modal = document.getElementById("confirm-modal");
      const cancelBtn = document.getElementById("modal-cancel");
      const confirmBtn = document.getElementById("modal-confirm");

      if (!modal) {
        // Fallback to native confirm if modal doesn't exist
        resolve(confirm("Are you sure you want to end this session?"));
        return;
      }

      modal.style.display = "flex";

      const cleanup = () => {
        modal.style.display = "none";
        cancelBtn.removeEventListener("click", onCancel);
        confirmBtn.removeEventListener("click", onConfirm);
        modal.removeEventListener("click", onOverlayClick);
      };

      const onCancel = () => {
        cleanup();
        resolve(false);
      };

      const onConfirm = () => {
        cleanup();
        resolve(true);
      };

      const onOverlayClick = (e) => {
        if (e.target === modal) {
          cleanup();
          resolve(false);
        }
      };

      cancelBtn.addEventListener("click", onCancel);
      confirmBtn.addEventListener("click", onConfirm);
      modal.addEventListener("click", onOverlayClick);
    });
  }

  // ========================================
  // Gemini 3 Enhanced Features
  // ========================================

  async getCoaching() {
    if (!this.selectedSessionId) {
      this.showToast("No Session", "Please select a session first", "warning");
      return;
    }

    this.btnGetCoaching.textContent = "Loading...";
    this.btnGetCoaching.disabled = true;

    try {
      const response = await fetch("http://localhost:3000/api/coaching", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: this.selectedSessionId,
          customerMessage: this.getLastCustomerMessage(),
        }),
      });

      const coaching = await response.json();

      // Show coaching tip
      if (this.coachingTip && coaching.coachingTip) {
        this.coachingTip.style.display = "block";
        this.coachingTipText.textContent = coaching.coachingTip;
      }

      // Show suggested responses
      if (this.coachingSuggestions && coaching.suggestedResponses) {
        this.coachingSuggestions.style.display = "block";
        this.suggestionList.innerHTML = coaching.suggestedResponses
          .map(
            (s, i) => `
            <button class="btn btn-ghost suggestion-btn" data-suggestion="${s.replace(/"/g, "&quot;")}" style="text-align: left; font-size: 0.75rem; padding: 0.5rem; white-space: normal; height: auto;">
              ${i + 1}. ${s}
            </button>
          `,
          )
          .join("");

        // Add event listeners to suggestion buttons
        this.suggestionList
          .querySelectorAll(".suggestion-btn")
          .forEach((btn) => {
            btn.addEventListener("click", () => {
              this.useSuggestion(btn.dataset.suggestion);
            });
          });
      }

      this.showToast(
        "AI Coaching Ready",
        `Tone: ${coaching.tone} | Priority: ${coaching.priority}`,
        "success",
      );
    } catch (error) {
      console.error("Coaching error:", error);
      this.showToast("Error", "Failed to get AI coaching", "error");
    } finally {
      this.btnGetCoaching.textContent = "Get AI Suggestions";
      this.btnGetCoaching.disabled = false;
    }
  }

  useSuggestion(text) {
    if (this.messageInput) {
      this.messageInput.value = text;
      this.messageInput.focus();
    }
  }

  getLastCustomerMessage() {
    // Get last customer message from transcript display
    const messages = this.transcript?.querySelectorAll(".message.customer");
    if (messages && messages.length > 0) {
      return messages[messages.length - 1].textContent || "";
    }
    return "";
  }

  async analyzeConversation() {
    if (!this.selectedSessionId) {
      this.showToast("No Session", "Please select a session first", "warning");
      return;
    }

    this.btnAnalyze.textContent = "Analyzing...";
    this.btnAnalyze.disabled = true;

    try {
      const response = await fetch("http://localhost:3000/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: this.selectedSessionId }),
      });

      const analysis = await response.json();

      // Update analytics display
      if (this.analyticsIntent) {
        this.analyticsIntent.textContent = analysis.intent || "-";
      }

      if (this.analyticsSentiment) {
        const sentimentColors = {
          positive: "var(--color-success)",
          neutral: "var(--color-text-secondary)",
          negative: "var(--color-warning)",
          frustrated: "var(--color-danger)",
        };
        this.analyticsSentiment.textContent = `${analysis.sentiment} (${analysis.sentimentScore}%)`;
        this.analyticsSentiment.style.color =
          sentimentColors[analysis.sentiment] || "inherit";
      }

      if (this.analyticsRisk) {
        const riskColors = {
          low: "var(--color-success)",
          medium: "var(--color-warning)",
          high: "var(--color-danger)",
        };
        this.analyticsRisk.textContent = analysis.escalationRisk || "-";
        this.analyticsRisk.style.color =
          riskColors[analysis.escalationRisk] || "inherit";
      }

      if (this.analyticsIssues && analysis.keyIssues?.length > 0) {
        this.analyticsIssues.style.display = "block";
        this.issuesList.innerHTML = analysis.keyIssues
          .map((issue) => `<li>${issue}</li>`)
          .join("");
      }

      this.showToast(
        "Analysis Complete",
        `Intent: ${analysis.intent} | Risk: ${analysis.escalationRisk}`,
        "info",
      );
    } catch (error) {
      console.error("Analysis error:", error);
      this.showToast("Error", "Failed to analyze conversation", "error");
    } finally {
      this.btnAnalyze.textContent = "Analyze Conversation";
      this.btnAnalyze.disabled = false;
    }
  }

  /**
   * Update analytics panel from WebSocket auto-update
   */
  updateAnalyticsPanel(analysis) {
    if (this.analyticsIntent) {
      this.analyticsIntent.textContent = analysis.intent || "-";
    }

    if (this.analyticsSentiment) {
      const sentimentColors = {
        positive: "var(--color-success)",
        neutral: "var(--color-text-secondary)",
        negative: "var(--color-warning)",
        frustrated: "var(--color-danger)",
      };
      this.analyticsSentiment.textContent = `${analysis.sentiment || "-"} (${analysis.sentimentScore || 0}%)`;
      this.analyticsSentiment.style.color =
        sentimentColors[analysis.sentiment] || "inherit";
    }

    if (this.analyticsRisk) {
      const riskColors = {
        low: "var(--color-success)",
        medium: "var(--color-warning)",
        high: "var(--color-danger)",
      };
      this.analyticsRisk.textContent = analysis.escalationRisk || "-";
      this.analyticsRisk.style.color =
        riskColors[analysis.escalationRisk] || "inherit";
    }

    if (this.analyticsIssues && analysis.keyIssues?.length > 0) {
      this.analyticsIssues.style.display = "block";
      this.issuesList.innerHTML = analysis.keyIssues
        .map((issue) => `<li>${issue}</li>`)
        .join("");
    }
  }

  /**
   * Update coaching panel from WebSocket auto-update (during takeover)
   */
  updateCoachingPanel(coaching) {
    // Show coaching tip
    if (this.coachingTip && coaching.coachingTip) {
      this.coachingTip.style.display = "block";
      this.coachingTipText.textContent = coaching.coachingTip;
    }

    // Show suggested responses
    if (this.coachingSuggestions && coaching.suggestedResponses) {
      this.coachingSuggestions.style.display = "block";
      this.suggestionList.innerHTML = coaching.suggestedResponses
        .map(
          (s, i) => `
          <button class="btn btn-ghost suggestion-btn" data-suggestion="${s.replace(/"/g, "&quot;")}" style="text-align: left; font-size: 0.75rem; padding: 0.5rem; white-space: normal; height: auto;">
            ${i + 1}. ${s}
          </button>
        `,
        )
        .join("");

      // Add event listeners to suggestion buttons
      this.suggestionList.querySelectorAll(".suggestion-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
          this.useSuggestion(btn.dataset.suggestion);
        });
      });
    }
  }

  handleCustomerAudio(sessionId, audioData) {
    if (sessionId === this.selectedSessionId) {
      try {
        const pcmData = this.base64ToInt16(audioData);
        this.audioManager.playAudio(pcmData);
      } catch (e) {
        console.error("Error playing customer audio:", e);
      }
    }
  }

  refreshSessions() {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: "get_sessions" }));
    }

    // Also fetch via REST from backend (Port 3000)
    const host = window.location.hostname;
    fetch(`http://${host}:3000/api/sessions`)
      .then((res) => res.json())
      .then((sessions) => this.updateSessionsList(sessions))
      .catch((err) => console.error("Error fetching sessions:", err));
  }

  updateStats() {
    let active = 0,
      waiting = 0,
      human = 0;

    this.sessions.forEach((session) => {
      // Skip completed sessions from stats
      if (session.status === "completed") return;

      if (session.mode === "human") human++;
      else if (session.status === "active") active++;
      else waiting++;
    });

    if (this.statActive) this.statActive.textContent = active;
    if (this.statWaiting) this.statWaiting.textContent = waiting;
    if (this.statHuman) this.statHuman.textContent = human;
  }

  startDurationTimer() {
    setInterval(() => {
      if (this.selectedSessionId) {
        const session = this.sessions.get(this.selectedSessionId);
        if (session) {
          const duration = Date.now() - session.createdAt;
          this.detailDuration.textContent = this.formatDuration(duration);
        }
      }
    }, 1000);
  }

  formatTime(timestamp) {
    return new Date(timestamp).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  formatDuration(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) {
      return `${hours}h ${minutes % 60}m`;
    }
    return `${minutes}m ${seconds % 60}s`;
  }

  escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }

  showNoSelection() {
    // Hide the session panel and show the empty state
    const sessionPanel = document.getElementById("session-panel");
    const noSelection = document.getElementById("no-selection");

    if (sessionPanel) sessionPanel.style.display = "none";
    if (noSelection) noSelection.style.display = "flex";

    // Clear transcript
    if (this.transcript) {
      this.transcript.innerHTML = "";
    }
  }

  showToast(title, message, type = "info") {
    if (!this.toastContainer) return;

    const toast = document.createElement("div");
    toast.className = `toast ${type}`;

    const icons = {
      success:
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>',
      error:
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
      warning:
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
      info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>',
    };

    toast.innerHTML = `
      <div class="toast-icon">${icons[type]}</div>
      <div class="toast-content">
        <div class="toast-title">${title}</div>
        <div class="toast-message">${message}</div>
      </div>
    `;

    this.toastContainer.appendChild(toast);

    // Auto remove after 5 seconds
    setTimeout(() => {
      toast.style.animation = "slideIn 0.3s ease reverse";
      setTimeout(() => toast.remove(), 300);
    }, 5000);
  }

  // Utils
  int16ToBase64(int16Array) {
    const bytes = new Uint8Array(int16Array.buffer);
    let binary = "";
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return window.btoa(binary);
  }

  base64ToInt16(base64) {
    const binary_string = window.atob(base64);
    const len = binary_string.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binary_string.charCodeAt(i);
    }
    return new Int16Array(bytes.buffer);
  }
}

// Initialize dashboard when DOM is ready
document.addEventListener("DOMContentLoaded", () => {
  window.dashboard = new SupervisorDashboard();
});

// Add connection status dot styling
const style = document.createElement("style");
style.textContent = `
  .connection-status {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.875rem;
    color: var(--color-text-secondary);
  }
  .status-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background-color: var(--color-warning);
    animation: pulse 2s infinite;
  }
  .btn-icon.recording {
    background-color: var(--color-danger);
    animation: pulse 1s infinite;
  }
`;
document.head.appendChild(style);
