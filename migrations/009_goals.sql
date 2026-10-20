-- 目標と、その記録（設計の正= docs/design.md 3-6f・4-13・2026-10-20 本人要望）
-- 「週に2回」「1日に10ページ」のような期間ごとの目標（rate）と、「12/31 までに 300 ページ」のような期限までの総量（total）。
-- 記録は日付と量だけ持ち、進み具合（今の期間の合計・連続達成・ペース）は毎回計算する。
CREATE TABLE goals (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  title      TEXT    NOT NULL,
  kind       TEXT    NOT NULL CHECK (kind IN ('rate', 'total')),
  period     TEXT    CHECK (period IN ('day', 'week', 'month')),        -- rate のとき（1日・1週〈月曜はじまり〉・1か月ごと）
  target     REAL    NOT NULL CHECK (target > 0),
  unit       TEXT    NOT NULL DEFAULT '回',
  start_date TEXT    NOT NULL,                                          -- 数え始める日
  end_date   TEXT,                                                      -- total は期限（必須）・rate は終わる日（NULL＝ずっと）
  notes      TEXT    NOT NULL DEFAULT '',
  position   REAL    NOT NULL DEFAULT 0,
  archived   INTEGER NOT NULL DEFAULT 0,
  created_at TEXT    NOT NULL,
  updated_at TEXT    NOT NULL,
  CHECK ((kind = 'rate' AND period IS NOT NULL) OR (kind = 'total' AND end_date IS NOT NULL))
);

CREATE TABLE goal_logs (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  goal_id    INTEGER NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
  date       TEXT    NOT NULL,
  amount     REAL    NOT NULL CHECK (amount > 0),
  note       TEXT    NOT NULL DEFAULT '',
  created_at TEXT    NOT NULL
);
CREATE INDEX idx_goal_logs_goal ON goal_logs(goal_id, date);
