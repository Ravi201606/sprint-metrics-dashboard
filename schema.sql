CREATE TABLE issues (
  key TEXT PRIMARY KEY,
  summary TEXT,
  status TEXT,
  issuetype TEXT,
  assignee TEXT,
  priority TEXT,
  created TEXT,
  updated TEXT,
  resolutiondate TEXT,
  project TEXT,
  raw_json TEXT
);

CREATE TABLE worklogs (
  id TEXT PRIMARY KEY,
  issue_key TEXT REFERENCES issues(key),
  author TEXT,
  started TEXT,
  time_spent_seconds INTEGER,
  comment TEXT
);

CREATE TABLE status_transitions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  issue_key TEXT REFERENCES issues(key),
  from_status TEXT,
  to_status TEXT,
  changed_at TEXT
);

CREATE TABLE issue_sprints (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  issue_key TEXT REFERENCES issues(key),
  sprint_id TEXT,
  sprint_name TEXT,
  sprint_state TEXT,
  sprint_start_date TEXT,
  sprint_end_date TEXT,
  added_at TEXT,
  removed_at TEXT
);

CREATE TABLE sync_state (
  scope TEXT PRIMARY KEY,
  last_synced_at TEXT
);

CREATE INDEX idx_worklogs_issue_key ON worklogs(issue_key);
CREATE INDEX idx_status_transitions_issue_key ON status_transitions(issue_key);
CREATE INDEX idx_issue_sprints_issue_key ON issue_sprints(issue_key);
CREATE INDEX idx_issue_sprints_sprint_name ON issue_sprints(sprint_name);
