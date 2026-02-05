class SummariesPage {
  constructor() {
    this.summaries = [];
    this.offset = 0;
    this.limit = 20;
    this.apiBaseUrl = "http://localhost:3000"; // API server
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
    this.btnRefresh = document.getElementById("btn-refresh");
    this.filterSentiment = document.getElementById("filter-sentiment");
    this.filterIntent = document.getElementById("filter-intent");
    this.filterResolution = document.getElementById("filter-resolution");

    // Stats elements
    this.statTotal = document.getElementById("stat-total");
    this.statDuration = document.getElementById("stat-duration");
    this.statResolved = document.getElementById("stat-resolved");
    this.statFrustration = document.getElementById("stat-frustration");
  }

  bindEvents() {
    this.btnLoadMore?.addEventListener("click", () => this.loadMore());
    this.btnRefresh?.addEventListener("click", () => this.refresh());

    this.filterSentiment?.addEventListener("change", (e) => {
      this.filters.sentiment = e.target.value || null;
      this.refresh();
    });

    this.filterIntent?.addEventListener("change", (e) => {
      this.filters.intent = e.target.value || null;
      this.refresh();
    });

    this.filterResolution?.addEventListener("change", (e) => {
      this.filters.resolution = e.target.value || null;
      this.refresh();
    });
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
    const keyTopics = JSON.parse(summary.key_topics || "[]");
    const actionItems = JSON.parse(summary.action_items || "[]");

    return `
      <div class="summary-card" data-session-id="${summary.session_id}">
        <div class="summary-header">
          <div class="summary-meta">
            <span class="summary-id">#${summary.session_id.substring(0, 8)}</span>
            <span class="summary-time">${timestamp}</span>
            <span class="summary-duration">⏱️ ${duration}</span>
          </div>
          <div class="summary-badges">
            <span class="badge badge-${summary.overall_sentiment}">${summary.overall_sentiment}</span>
            <span class="badge badge-${summary.resolution_status}">${summary.resolution_status.replace(/_/g, " ")}</span>
          </div>
        </div>
        
        <div class="summary-content">
          <div class="summary-section">
            <h4 style="font-size: 0.875rem; color: var(--color-text-secondary); margin-bottom: 0.5rem; text-transform: uppercase; letter-spacing: 0.05em;">Summary</h4>
            <p>${summary.full_summary}</p>
          </div>
          
          <div class="summary-metrics">
            <div class="metric">
              <label>Intent</label>
              <value style="font-size: 1rem;">${summary.intent}</value>
            </div>
            <div class="metric">
              <label>Avg Frustration</label>
              <value>${summary.frustration_avg}%</value>
            </div>
            <div class="metric">
              <label>Max Frustration</label>
              <value>${summary.frustration_max}%</value>
            </div>
            <div class="metric">
              <label>Interventions</label>
              <value>${summary.supervisor_interventions}</value>
            </div>
          </div>
          
          ${
            keyTopics.length > 0
              ? `
            <div class="summary-section">
              <h4 style="font-size: 0.875rem; color: var(--color-text-secondary); margin-bottom: 0.5rem; text-transform: uppercase; letter-spacing: 0.05em;">Key Topics</h4>
              <ul class="topic-list">
                ${keyTopics.map((t) => `<li>${t}</li>`).join("")}
              </ul>
            </div>
          `
              : ""
          }
          
          ${
            actionItems.length > 0
              ? `
            <div class="summary-section">
              <h4 style="font-size: 0.875rem; color: var(--color-text-secondary); margin-bottom: 0.5rem; text-transform: uppercase; letter-spacing: 0.05em;">Action Items</h4>
              <ul class="action-list">
                ${actionItems.map((a) => `<li>${a}</li>`).join("")}
              </ul>
            </div>
          `
              : ""
          }

          ${
            summary.insights
              ? `
            <div class="summary-section" style="margin-top: 1rem; padding: 0.75rem; background: rgba(139, 92, 246, 0.1); border-left: 3px solid var(--color-accent); border-radius: 0.25rem;">
              <h4 style="font-size: 0.75rem; color: var(--color-accent); margin-bottom: 0.5rem;">💡 Insights</h4>
              <p style="font-size: 0.875rem;">${summary.insights}</p>
            </div>
          `
              : ""
          }
        </div>
        
        <div class="summary-actions" style="display: flex; gap: 0.5rem; padding-top: 1rem; border-top: 1px solid var(--border-color); margin-top: 1rem;">
          <button class="btn btn-ghost btn-sm" onclick="summariesPage.viewTranscript('${summary.session_id}')">
            View Transcript
          </button>
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

  async viewTranscript(sessionId) {
    try {
      const response = await fetch(
        `${this.apiBaseUrl}/api/summary/${sessionId}`,
      );
      const summary = await response.json();
      const transcript = JSON.parse(summary.transcript);

      // Show transcript in modal
      this.showTranscriptModal(transcript, summary);
    } catch (error) {
      console.error("Failed to load transcript:", error);
      this.showError("Failed to load transcript");
    }
  }

  showTranscriptModal(transcript, summary) {
    const modal = document.createElement("div");
    modal.className = "modal";
    modal.innerHTML = `
      <div class="modal-content">
        <div class="modal-header">
          <h3>Call Transcript - #${summary.session_id.substring(0, 8)}</h3>
          <button class="modal-close" onclick="this.closest('.modal').remove()">✕</button>
        </div>
        <div class="modal-body">
          <div style="margin-bottom: 1rem; padding: 1rem; background: var(--bg-secondary); border-radius: 0.5rem;">
            <strong>Duration:</strong> ${this.formatDuration(summary.duration)} | 
            <strong>Sentiment:</strong> ${summary.overall_sentiment} | 
            <strong>Intent:</strong> ${summary.intent}
          </div>
          <div class="transcript">
            ${transcript
              .map(
                (m) => `
              <div class="message">
                <div class="message-role">${m.role === "customer" ? "👤 Customer" : "🤖 AI"}</div>
                <div class="message-content">${m.content}</div>
                <div class="message-time">${new Date(m.timestamp).toLocaleTimeString()}</div>
              </div>
            `,
              )
              .join("")}
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    // Close on background click
    modal.addEventListener("click", (e) => {
      if (e.target === modal) {
        modal.remove();
      }
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
