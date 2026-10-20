-- 目標をやる時間には量を持たない（設計の正= docs/design.md 4-14・2026-10-21 本人要望「何ページやるかはこっちで決めたい・タイトルだけ入れてほしい」）。
-- 量は記録するときに決める。
ALTER TABLE goal_plans DROP COLUMN amount;
