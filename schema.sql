PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_name TEXT NOT NULL,
  run_ts TEXT NOT NULL,
  source_file TEXT,
  notes TEXT,

  -- New fields (metadata + thresholds + baseline)
  is_baseline INTEGER NOT NULL DEFAULT 0,
  release_name TEXT,
  environment TEXT,
  commit_sha TEXT,
  test_type TEXT,
  sla_avg_ms REAL,
  sla_max_ms REAL,
  regression_pct REAL,
  is_excluded INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS measurements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id INTEGER NOT NULL,
  users_load INTEGER NOT NULL,
  endpoint_name TEXT NOT NULL,
  avg_ms REAL NOT NULL,
  min_ms REAL NOT NULL,
  max_ms REAL NOT NULL,
  FOREIGN KEY(run_id) REFERENCES runs(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_measurements_run ON measurements(run_id);
CREATE INDEX IF NOT EXISTS idx_measurements_endpoint ON measurements(endpoint_name);
CREATE INDEX IF NOT EXISTS idx_measurements_load ON measurements(users_load);
