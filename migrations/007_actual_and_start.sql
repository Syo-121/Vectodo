-- かかった時間と、やる日の時刻（設計の正= docs/design.md 4-12・4-11・2026-10-14 本人要望）
-- actual_min: 実際にかかった時間（分）。完了したときに画面のお知らせから1回押して残す（見積の補正に使う）
-- start_time: やる日の時刻 HH:MM（今日の流れの空きに置いたもの）。NULL＝時刻なし（その日のどこかでやる）
ALTER TABLE tasks ADD COLUMN actual_min INTEGER CHECK (actual_min IS NULL OR actual_min > 0);
ALTER TABLE task_dates ADD COLUMN start_time TEXT;
