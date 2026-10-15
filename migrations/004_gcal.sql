-- v2: Google カレンダーへの一方向同期（設計の正= docs/design.md 3-8・4-7）
-- アプリが作った予定を1件1行で覚える。タスクを消しても行は残す（予定を片付けるために要る）ので外部キーは張らない。

CREATE TABLE gcal_events (
  task_id     INTEGER NOT NULL,
  slot        TEXT    NOT NULL CHECK (slot = 'due' OR slot LIKE 'do:____-__-__'),  -- 締切 or やる日1日分
  date        TEXT    NOT NULL,                                                    -- いまの予定の日付 YYYY-MM-DD
  calendar_id TEXT    NOT NULL,
  event_id    TEXT    NOT NULL,
  sent        TEXT    NOT NULL,   -- 最後に送った中身（JSON）。変わったときだけ送り直す。'' は「次で必ず送り直す」
  synced_at   TEXT    NOT NULL,
  PRIMARY KEY (task_id, slot)
);
