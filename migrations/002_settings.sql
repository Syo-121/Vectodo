-- アプリの設定（キーと値・値は JSON）。既定値はコード側（src/server/settings.ts）が持つ。
CREATE TABLE settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
