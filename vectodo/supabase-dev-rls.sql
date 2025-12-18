-- Phase 1 開発用: RLS ポリシーの設定
-- 注意: これは開発環境用の設定です。本番環境では適切な認証ベースのポリシーに置き換えてください。

-- tasksテーブルの既存のRLSポリシーを確認
-- Supabase Dashboard > Authentication > Policies で確認できます

-- 開発用: 匿名ユーザーによる全操作を許可するポリシー
-- オプション1: RLSを完全に無効化（最も簡単、開発環境のみ推奨）
ALTER TABLE tasks DISABLE ROW LEVEL SECURITY;
ALTER TABLE projects DISABLE ROW LEVEL SECURITY;

-- オプション2: RLSを有効にしたまま、匿名アクセスを許可するポリシーを作成
-- （より安全な開発用設定）
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;

-- tasks テーブル: 全ユーザーに SELECT/INSERT/UPDATE/DELETE を許可
CREATE POLICY "Allow anonymous access during development"
ON tasks
FOR ALL
TO anon
USING (true)
WITH CHECK (true);

-- projects テーブル: 全ユーザーに SELECT を許可
CREATE POLICY "Allow anonymous read during development"
ON projects
FOR SELECT
TO anon
USING (true);

-- 既存のポリシーがある場合は、まず削除してから上記を実行してください:
-- DROP POLICY IF EXISTS "policy_name" ON tasks;
