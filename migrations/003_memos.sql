-- クイックメモ（設計の正= docs/design.md 3-6b）
CREATE TABLE memos (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  body         TEXT    NOT NULL CHECK (length(trim(body)) > 0),
  status       TEXT    NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'done')),
  destination  TEXT,                                          -- 振り分け先の一言
  task_id      INTEGER REFERENCES tasks(id) ON DELETE SET NULL, -- タスクにしたとき
  created_at   TEXT    NOT NULL,
  updated_at   TEXT    NOT NULL,
  processed_at TEXT
);
CREATE INDEX idx_memos_status ON memos(status, created_at);
