class SummariesPage {
  constructor() {
    this.summaries = [];
    this.offset = 0;
    this.limit = 20;
    this.apiBaseUrl = window.location.origin; // Dynamic API server
    this.filters = {
      sentiment: null,
      intent: null,
      resolution: null,
    };

    this.init();
  }

  init() {
    this.bindElements();
    this.bindEvents();
    this.loadSummaries();
    this.loadStatistics();
  }

  bindElements() {
    this.container = document.getElementById("summaries-container");
    this.btnLoadMore = document.getElementById("btn-load-more");
    this.filterChips = document.getElementById("filter-chips");
    this.searchInput = document.getElementById("search-input");

    // Stats elements
    this.statTotal = document.getElementById("stat-total");
    this.statDuration = document.getElementById("stat-duration");
    this.statResolved = document.getElementById("stat-resolved");
    this.statFrustration = document.getElementById("stat-frustration");
  }

  bindEvents() {
    this.btnLoadMore?.addEventListener("click", () => this.loadMore());

    // Smart Filter Chips
    this.filterChips?.addEventListener("click", (e) => {
      const chip = e.target.closest(".chip");
      if (!chip) return;

      // Toggle active class
      this.filterChips
        .querySelectorAll(".chip")
        .forEach((c) => c.classList.remove("active"));
      chip.classList.add("active");

      const filterType = chip.dataset.filter;
      this.applySmartFilter(filterType);
    });

    // Real-time Search
    this.searchInput?.addEventListener("input", (e) => {
      this.searchTerm = e.target.value.toLowerCase();
      this.refresh(); // In a real app, optimize this to client-side filter if data is loaded
    });
  }

  applySmartFilter(filterType) {
    this.filters = {
      sentiment: null,
      intent: null,
      resolution: null,
    };

    switch (filterType) {
      case "frustrated":
        this.filters.sentiment = "frustrated";
        break;
      case "unresolved":
        this.filters.resolution = "unresolved";
        break;
      case "escalated":
        this.filters.resolution = "escalated";
        break;
      case "positive":
        this.filters.sentiment = "positive";
        break;
      case "all":
      default:
        // No filters
        break;
    }
    this.refresh();
  }

  async loadSummaries() {
    try {
      const paramObj = {
        limit: this.limit,
        offset: this.offset,
      };

      if (this.filters.sentiment) paramObj.sentiment = this.filters.sentiment;
      if (this.filters.intent) paramObj.intent = this.filters.intent;
      if (this.filters.resolution)
        paramObj.resolution = this.filters.resolution;

      const params = new URLSearchParams(paramObj);

      const response = await fetch(
        `${this.apiBaseUrl}/api/summaries?${params}`,
      );
      const data = await response.json();

      if (this.offset === 0) {
        this.summaries = data.summaries;
        this.renderSummaries();
      } else {
        this.summaries.push(...data.summaries);
        this.appendSummaries(data.summaries);
      }

      // Show/hide Load More button
      if (data.pagination.hasMore) {
        this.btnLoadMore.style.display = "block";
      } else {
        this.btnLoadMore.style.display = "none";
      }
    } catch (error) {
      console.error("Failed to load summaries:", error);
      this.showError("Failed to load summaries");
    }
  }

  async loadStatistics() {
    try {
      const response = await fetch(`${this.apiBaseUrl}/api/summaries?limit=0`);
      const data = await response.json();

      this.statTotal.textContent = data.stats.total_calls || 0;
      this.statDuration.textContent = this.formatDuration(
        data.stats.avg_duration,
      );

      const resolvedPct =
        data.stats.total_calls > 0
          ? Math.round(
              (data.stats.resolved_count / data.stats.total_calls) * 100,
            )
          : 0;
      this.statResolved.textContent = `${resolvedPct}%`;

      this.statFrustration.textContent = `${Math.round(data.stats.avg_frustration || 0)}%`;
    } catch (error) {
      console.error("Failed to load statistics:", error);
    }
  }

  renderSummaries() {
    if (this.summaries.length === 0) {
      this.container.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">📋</div>
          <h3>No call summaries yet</h3>
          <p>Summaries will appear here after calls are completed</p>
        </div>
      `;
      return;
    }

    this.container.innerHTML = this.summaries
      .map((s) => this.renderSummaryCard(s))
      .join("");
  }

  appendSummaries(summaries) {
    const html = summaries.map((s) => this.renderSummaryCard(s)).join("");
    this.container.insertAdjacentHTML("beforeend", html);
  }

  renderSummaryCard(summary) {
    const duration = this.formatDuration(summary.duration);
    const timestamp = new Date(summary.created_at).toLocaleString();
    const transcript = JSON.parse(summary.transcript || "[]");

    // Generate Visual Timeline (Call DNA)
    // Create bars based on message roles and sentiment
    // Mocking logic: First 30% customer, middle mixed, end AI
    // In real implementation, map transcript to bars
    const timelineHTML = transcript
      .slice(0, 10)
      .map((msg) => {
        let type = "customer";
        if (msg.role === "ai") type = "ai";
        // Simple heuristic for frustration in DNA
        if (
          msg.role === "customer" &&
          (msg.content.includes("!") || msg.content.length > 50)
        )
          type = "frustrated";
        return `<div class="dna-bar ${type}" title="${msg.role}: ${msg.content.substring(0, 20)}..."></div>`;
      })
      .join("");

    return `
      <div class="premium-card" onclick="summariesPage.viewDetail('${summary.session_id}')">
        <!-- Header -->
        <div class="card-header">
          <div>
            <div class="session-id">ID: ${summary.session_id.substring(0, 8)}</div>
            <div class="session-time">${timestamp.split(",")[0]}</div>
          </div>
          <div style="text-align: right">
            <span style="font-size: 0.75rem; color: ${summary.resolution_status === "resolved" ? "var(--accent-success)" : "var(--accent-warning)"}">
              ${summary.resolution_status.toUpperCase()}
            </span>
          </div>
        </div>

        <!-- Call DNA -->
        <div class="call-dna" title="Conversation Timeline">
          ${timelineHTML}
          ${transcript.length > 10 ? '<div class="dna-bar" style="opacity: 0.3"></div>' : ""}
        </div>

        <!-- Insight -->
        <div class="card-insight">
          <div class="insight-box">
             <div class="metric-label" style="color: var(--accent-primary); margin-bottom: 0.5rem">AI SUMMARY</div>
            <p class="insight-text">${summary.full_summary}</p>
          </div>
        </div>

        <!-- Metrics Footer -->
        <div class="card-metrics">
          <div class="metric-box">
            <span class="metric-label">Duration</span>
            <div class="metric-value">${duration.split(" ")[0]}</div>
          </div>
          <div class="metric-box">
            <span class="metric-label">Msgs</span>
            <div class="metric-value">${transcript.length}</div>
          </div>
          <div class="metric-box">
            <span class="metric-label">Frustration</span>
            <div class="metric-value" style="color: ${summary.frustration_avg > 50 ? "var(--accent-danger)" : "#e2e8f0"}">
              ${Math.round(summary.frustration_avg || 0)}%
            </div>
          </div>
        </div>
      </div>
    `;
  }

  formatDuration(ms) {
    if (!ms) return "0m 0s";
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    return `${minutes}m ${seconds}s`;
  }

  async viewDetail(sessionId) {
    try {
      const response = await fetch(
        `${this.apiBaseUrl}/api/summary/${sessionId}`,
      );
      const summary = await response.json();
      const transcript = JSON.parse(summary.transcript);
      this.renderDetailModal(summary, transcript);
    } catch (error) {
      console.error("Failed to load detail:", error);
      this.showError("Failed to load case file");
    }
  }

  renderDetailModal(summary, transcript) {
    // Remove existing
    document.querySelector(".case-file-modal-container")?.remove();

    const modal = document.createElement("div");
    modal.className = "modal-backdrop case-file-modal-container";
    modal.style.cssText =
      "position: fixed; inset: 0; display: flex; align-items: center; justify-content: center; z-index: 1000;";

    modal.innerHTML = `
      <div class="case-file-modal">
        <!-- Sidebar -->
        <div class="case-sidebar">
          <h2 style="font-size: 1.25rem; font-weight: 700; color: #fff; margin-bottom: 2rem;">CASE FILE #${summary.session_id.substring(0, 6)}</h2>
          
          <div style="margin-bottom: 2rem;">
            <label class="metric-label">Primary Intent</label>
            <div style="font-size: 1.1rem; color: #fff;">${summary.intent || "Unknown"}</div>
          </div>

          <div style="margin-bottom: 2rem;">
            <label class="metric-label">Customer Sentiment</label>
            <div style="display: flex; align-items: center; gap: 0.5rem;">
               <div style="font-size: 1.5rem;">${summary.overall_sentiment === "positive" ? "😊" : summary.overall_sentiment === "frustrated" ? "😤" : "😐"}</div>
               <div style="font-size: 1.1rem; color: #fff; text-transform: capitalize;">${summary.overall_sentiment}</div>
            </div>
          </div>

          <div style="background: rgba(255,255,255,0.05); padding: 1rem; border-radius: 0.5rem; margin-bottom: 2rem;">
            <label class="metric-label">Supervisor Notes</label>
            <div style="font-size: 0.9rem; color: #94a3b8; font-style: italic;">
              ${summary.supervisor_interventions > 0 ? "Supervisor intervention recorded." : "No manual intervention required."}
            </div>
          </div>

          <button class="btn btn-primary" style="width: 100%; border-radius: 2rem;" onclick="summariesPage.exportSummary('${summary.session_id}')">
            Export Case Data (JSON)
          </button>
        </div>

        <!-- Main Content -->
        <div class="case-main">
          <div class="case-header">
            <div class="case-tabs">
              <button class="tab-btn active">TRANSCRIPT LOG</button>
              <button class="tab-btn">AI ANALYSIS</button>
              <button class="tab-btn">METRICS</button>
            </div>
            <button class="btn btn-ghost" onclick="document.querySelector('.case-file-modal-container').remove()">✕ CLOSE</button>
          </div>

          <div class="case-content">
            <div class="transcript" style="max-width: 800px; margin: 0 auto;">
              ${transcript
                .map(
                  (m) => `
                <div class="message" style="margin-bottom: 1.5rem; display: flex; flex-direction: column; align-items: ${m.role === "customer" ? "flex-start" : "flex-end"}">
                  <div style="font-size: 0.75rem; color: #64748b; margin-bottom: 0.25rem;">${m.role.toUpperCase()} • ${new Date(m.timestamp).toLocaleTimeString()}</div>
                  <div style="
                    padding: 1rem 1.5rem; 
                    background: ${m.role === "customer" ? "rgba(255,255,255,0.05)" : "rgba(59, 130, 246, 0.1)"}; 
                    border: 1px solid ${m.role === "customer" ? "rgba(255,255,255,0.1)" : "rgba(59, 130, 246, 0.2)"};
                    border-radius: 1rem; 
                    border-top-${m.role === "customer" ? "left" : "right"}-radius: 0;
                    max-width: 80%;
                    color: #e2e8f0;
                    line-height: 1.6;
                  ">
                    ${m.content}
                  </div>
                </div>
              `,
                )
                .join("")}
            </div>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    // Close on backdrop click
    modal.addEventListener("click", (e) => {
      if (e.target === modal) modal.remove();
    });
  }

  loadMore() {
    this.offset += this.limit;
    this.loadSummaries();
  }

  refresh() {
    this.offset = 0;
    this.summaries = [];
    this.loadSummaries();
    this.loadStatistics();
  }

  async exportSummary(sessionId) {
    try {
      const response = await fetch(
        `${this.apiBaseUrl}/api/summary/${sessionId}`,
      );
      const summary = await response.json();

      // Create downloadable JSON
      const dataStr = JSON.stringify(summary, null, 2);
      const dataBlob = new Blob([dataStr], { type: "application/json" });
      const url = URL.createObjectURL(dataBlob);

      const link = document.createElement("a");
      link.href = url;
      link.download = `call-summary-${sessionId.substring(0, 8)}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      this.showSuccess("Summary exported successfully");
    } catch (error) {
      console.error("Failed to export summary:", error);
      this.showError("Failed to export summary");
    }
  }

  showSuccess(message) {
    const successDiv = document.createElement("div");
    successDiv.style.cssText =
      "position: fixed; top: 1rem; right: 1rem; background: #10B981; color: white; padding: 1rem; border-radius: 0.5rem; z-index: 9999;";
    successDiv.textContent = message;
    document.body.appendChild(successDiv);
    setTimeout(() => successDiv.remove(), 3000);
  }

  showError(message) {
    // Simple error display
    const errorDiv = document.createElement("div");
    errorDiv.style.cssText =
      "position: fixed; top: 1rem; right: 1rem; background: #ef4444; color: white; padding: 1rem; border-radius: 0.5rem; z-index: 9999;";
    errorDiv.textContent = message;
    document.body.appendChild(errorDiv);
    setTimeout(() => errorDiv.remove(), 3000);
  }
}

// Initialize
const summariesPage = new SummariesPage();
