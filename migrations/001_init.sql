-- v1 の初期スキーマ（設計の正= docs/design.md 3章）

CREATE TABLE categories (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  name             TEXT    NOT NULL UNIQUE CHECK (length(trim(name)) > 0),
  color            TEXT    NOT NULL DEFAULT '#8a8a8a',
  position         REAL    NOT NULL DEFAULT 0,
  archived         INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1)),
  gcal_calendar_id TEXT                                   -- v2 で使う
);

CREATE TABLE recurrences (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  kind          TEXT    NOT NULL CHECK (kind IN ('weekly', 'monthly', 'interval', 'after_done')),
  weekdays      TEXT,                                     -- weekly: ISO 曜日番号のカンマ区切り（1=月…7=日）
  month_day     INTEGER CHECK (month_day BETWEEN 1 AND 31),
  interval_days INTEGER CHECK (interval_days >= 1),
  anchor        TEXT    NOT NULL DEFAULT 'do' CHECK (anchor IN ('do', 'due')),
  active        INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1))
);

CREATE TABLE tasks (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  parent_id     INTEGER REFERENCES tasks(id) ON DELETE CASCADE,
  position      REAL    NOT NULL DEFAULT 0,
  title         TEXT    NOT NULL CHECK (length(trim(title)) > 0),
  status        TEXT    NOT NULL DEFAULT 'todo'
                CHECK (status IN ('todo', 'doing', 'waiting', 'done', 'canceled')),
  category_id   INTEGER REFERENCES categories(id) ON DELETE SET NULL,
  priority      INTEGER CHECK (priority IN (1, 2, 3)),    -- 1=高 2=中 3=低 NULL=未設定
  due_date      TEXT,                                     -- YYYY-MM-DD
  due_time      TEXT,                                     -- HH:MM
  estimate_min  INTEGER CHECK (estimate_min > 0),
  notes         TEXT    NOT NULL DEFAULT '',
  recurrence_id INTEGER REFERENCES recurrences(id) ON DELETE SET NULL,
  legacy_id     TEXT,
  created_at    TEXT    NOT NULL,
  updated_at    TEXT    NOT NULL,
  completed_at  TEXT,
  CHECK (parent_id IS NULL OR parent_id <> id)
);
CREATE INDEX idx_tasks_parent     ON tasks(parent_id);
CREATE INDEX idx_tasks_status     ON tasks(status);
CREATE INDEX idx_tasks_due        ON tasks(due_date);
CREATE INDEX idx_tasks_recurrence ON tasks(recurrence_id);

CREATE TABLE task_dates (
  task_id       INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  date          TEXT    NOT NULL,                         -- YYYY-MM-DD
  minutes       INTEGER CHECK (minutes > 0),
  gcal_event_id TEXT,                                     -- v2 で使う
  PRIMARY KEY (task_id, date)
);
CREATE INDEX idx_task_dates_date ON task_dates(date);

CREATE TABLE dependencies (
  task_id       INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,  -- 後にやる
  depends_on_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,  -- 先にやる
  PRIMARY KEY (task_id, depends_on_id),
  CHECK (task_id <> depends_on_id)
);
CREATE INDEX idx_dependencies_on ON dependencies(depends_on_id);

