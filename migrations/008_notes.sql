-- ノート（Google Keep のような自由なメモ・設計の正= docs/design.md 3-6e・7-13・2026-10-14 本人要望）
-- 受信箱のクイックメモ（振り分けて「済」にするもの）とは別に、残しておく自由なメモ。
CREATE TABLE notes (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  title      TEXT    NOT NULL DEFAULT '',
  body       TEXT    NOT NULL DEFAULT '',                                -- 文章のノートの本文
  kind       TEXT    NOT NULL DEFAULT 'text' CHECK (kind IN ('text', 'list')),
  items      TEXT    NOT NULL DEFAULT '[]',                              -- チェックリスト [{"text": "牛乳", "done": false}]
  color      TEXT,                                                       -- 色の名前（NULL＝なし）
  labels     TEXT    NOT NULL DEFAULT '[]',                              -- ラベル ["買い物", ...]
  pinned     INTEGER NOT NULL DEFAULT 0,
  archived   INTEGER NOT NULL DEFAULT 0,
  created_at TEXT    NOT NULL,
  updated_at TEXT    NOT NULL
);
CREATE INDEX idx_notes_archived ON notes(archived, pinned);
