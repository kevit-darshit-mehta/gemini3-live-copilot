-- Call summaries table
CREATE TABLE IF NOT EXISTS call_summaries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT UNIQUE NOT NULL,
  created_at INTEGER NOT NULL,
  ended_at INTEGER NOT NULL,
  duration INTEGER NOT NULL,
  
  -- Call metadata
  customer_name TEXT,
  customer_phone TEXT,
  
  -- AI Analysis results
  overall_sentiment TEXT NOT NULL,
  intent TEXT NOT NULL,
  resolution_status TEXT NOT NULL,
  
  -- Key information (JSON arrays)
  key_topics TEXT NOT NULL,
  action_items TEXT,
  
  -- Metrics
  frustration_avg INTEGER DEFAULT 0,
  frustration_max INTEGER DEFAULT 0,
  frustration_trend TEXT,
  
  -- Escalation tracking
  escalation_count INTEGER DEFAULT 0,
  escalation_alerts TEXT,
  
  -- Supervisor intervention
  supervisor_interventions INTEGER DEFAULT 0,
  supervisor_id TEXT,
  supervisor_takeover_duration INTEGER DEFAULT 0,
  
  -- AI-generated content
  full_summary TEXT NOT NULL,
  insights TEXT,
  
  -- Full conversation backup
  transcript TEXT NOT NULL,
  
  -- Timestamps
  first_message_at INTEGER,
  last_message_at INTEGER
);

-- Indexes for fast queries
CREATE INDEX IF NOT EXISTS idx_created_at ON call_summaries(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sentiment ON call_summaries(overall_sentiment);
CREATE INDEX IF NOT EXISTS idx_intent ON call_summaries(intent);
CREATE INDEX IF NOT EXISTS idx_resolution ON call_summaries(resolution_status);
CREATE INDEX IF NOT EXISTS idx_supervisor ON call_summaries(supervisor_id);

-- Analytics cache table (for real-time updates)
CREATE TABLE IF NOT EXISTS analytics_cache (
  session_id TEXT PRIMARY KEY,
  last_updated INTEGER NOT NULL,
  intent TEXT,
  sentiment TEXT,
  sentiment_score INTEGER,
  escalation_risk TEXT,
  key_issues TEXT,
  FOREIGN KEY (session_id) REFERENCES call_summaries(session_id)
);

-- Coaching cache table (for real-time updates)
CREATE TABLE IF NOT EXISTS coaching_cache (
  session_id TEXT PRIMARY KEY,
  last_updated INTEGER NOT NULL,
  tone TEXT,
  priority TEXT,
  coaching_tip TEXT,
  suggested_responses TEXT,
  FOREIGN KEY (session_id) REFERENCES call_summaries(session_id)
);
