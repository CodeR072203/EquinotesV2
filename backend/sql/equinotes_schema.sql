-- backend/sql/equinotes_schema.sql

-- Make sure you're using the correct DB first:
-- USE equinotes;

CREATE TABLE IF NOT EXISTS agents (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(64) NOT NULL UNIQUE,
  display_name VARCHAR(120),

  -- Company or personal email
  email VARCHAR(255) UNIQUE,
  email_verified BOOLEAN NOT NULL DEFAULT FALSE,

  password_hash VARCHAR(255) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB
  DEFAULT CHARSET = utf8mb4
  COLLATE = utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS calls (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,        -- callId
  agent_id BIGINT NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'active',  -- active | saved | discarded

  start_time DATETIME NOT NULL,
  end_time DATETIME NULL,
  duration_sec INT NULL,

  client_transcript LONGTEXT NULL,
  agent_transcript LONGTEXT NULL,
  combined_transcript LONGTEXT NULL,

  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  INDEX idx_calls_agent_time (agent_id, start_time),
  INDEX idx_calls_status (status),

  CONSTRAINT fk_calls_agent
    FOREIGN KEY (agent_id)
    REFERENCES agents(id)
    ON UPDATE CASCADE
    ON DELETE RESTRICT
) ENGINE=InnoDB
  DEFAULT CHARSET = utf8mb4
  COLLATE = utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS call_events (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  call_id BIGINT NOT NULL,
  channel VARCHAR(8) NOT NULL,    -- client | agent
  seq BIGINT NOT NULL,            -- monotonic per call
  ts DATETIME NOT NULL,
  text TEXT NOT NULL,

  UNIQUE KEY uq_call_events_call_seq (call_id, seq),
  INDEX idx_call_events_call_ts (call_id, ts),

  CONSTRAINT fk_call_events_call
    FOREIGN KEY (call_id)
    REFERENCES calls(id)
    ON UPDATE CASCADE
    ON DELETE CASCADE
) ENGINE=InnoDB
  DEFAULT CHARSET = utf8mb4
  COLLATE = utf8mb4_unicode_ci;
