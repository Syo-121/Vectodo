-- カテゴリごとの「先の分を隠す」（設計の正= docs/design.md 4-9・2026-10-14 本人要望）
-- hide_after_days: 締切（無ければやる日）が今日から N 日より先の未完了を、一覧・カンバン・重要×緊急・計画待ちで隠す（NULL＝隠さない）
-- hide_from_plan:  ボードの「計画待ち」に出さない（バイトの予習のように、やる日を付けない決まりのもの）
ALTER TABLE categories ADD COLUMN hide_after_days INTEGER CHECK (hide_after_days IS NULL OR hide_after_days >= 0);
ALTER TABLE categories ADD COLUMN hide_from_plan INTEGER NOT NULL DEFAULT 0;
