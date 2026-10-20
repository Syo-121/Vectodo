-- 目標をやる時間（設計の正= docs/design.md 3-6f・4-14・2026-10-20 本人要望）
-- タスクにはしない。時間割（今日の流れ・ボードの日・週）や月で「置く」ときに目標を選ぶと入る。
-- 記録するとその記録と結ばれて「済」になる（記録を消すと結びが外れて元に戻る）。
CREATE TABLE goal_plans (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  goal_id    INTEGER NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
  date       TEXT    NOT NULL,
  start_time TEXT,                                                     -- HH:MM（NULL＝時刻なし＝終日の段）
  minutes    INTEGER CHECK (minutes IS NULL OR minutes > 0),
  amount     REAL    CHECK (amount IS NULL OR amount > 0),             -- この時間にやる量（NULL＝決めていない）
  log_id     INTEGER REFERENCES goal_logs(id) ON DELETE SET NULL,
  created_at TEXT    NOT NULL,
  updated_at TEXT    NOT NULL
);
CREATE INDEX idx_goal_plans_date ON goal_plans(date);
CREATE INDEX idx_goal_plans_goal ON goal_plans(goal_id, date);

-- Google に書き出した予定の表に「目標をやる時間」（task_id 0・slot goal:<id>）も入れられるよう、slot の決まりを広げる。
-- SQLite は CHECK を書き換えられないので作り直す（中身はそのまま写す）。
CREATE TABLE gcal_events_new (
  task_id     INTEGER NOT NULL,
  slot        TEXT    NOT NULL CHECK (slot = 'due' OR slot LIKE 'do:____-__-__' OR slot GLOB 'goal:[0-9]*'),  -- 締切・やる日1日分・目標をやる時間
  date        TEXT    NOT NULL,
  calendar_id TEXT    NOT NULL,
  event_id    TEXT    NOT NULL,
  sent        TEXT    NOT NULL,
  synced_at   TEXT    NOT NULL,
  PRIMARY KEY (task_id, slot)
);
INSERT INTO gcal_events_new SELECT task_id, slot, date, calendar_id, event_id, sent, synced_at FROM gcal_events;
DROP TABLE gcal_events;
ALTER TABLE gcal_events_new RENAME TO gcal_events;
