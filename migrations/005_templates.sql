-- テンプレート（親・子・依存の形を覚えて、まとめて作る。設計の正= docs/design.md 3-6d・4-8）
CREATE TABLE templates (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  name           TEXT    NOT NULL UNIQUE CHECK (length(trim(name)) > 0),
  body           TEXT    NOT NULL,                                    -- TemplateBody の JSON
  source_task_id INTEGER REFERENCES tasks(id) ON DELETE SET NULL,     -- どのタスクから保存したか
  created_at     TEXT    NOT NULL,
  updated_at     TEXT    NOT NULL
);
