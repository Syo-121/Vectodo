-- ==========================================
-- RLS（Row Level Security）有効化マイグレーション
-- ==========================================
-- 目的: tasksとdependenciesテーブルにユーザー認証ベースのアクセス制御を導入
-- 実行日: 2025-12-22
-- ==========================================

-- ==========================================
-- STEP 1: user_id カラムの追加
-- ==========================================

-- tasks テーブルに user_id を追加
ALTER TABLE tasks 
ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- task_dependencies テーブルに user_id を追加
ALTER TABLE task_dependencies 
ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- ==========================================
-- STEP 2: デフォルト値の設定（新規レコード用）
-- ==========================================

-- tasks: 新規レコード作成時に自動的に現在のユーザーIDを設定
ALTER TABLE tasks 
ALTER COLUMN user_id SET DEFAULT auth.uid();

-- task_dependencies: 新規レコード作成時に自動的に現在のユーザーIDを設定
ALTER TABLE task_dependencies 
ALTER COLUMN user_id SET DEFAULT auth.uid();

-- ==========================================
-- STEP 3: 既存データの移行
-- ==========================================
-- 方針: 既存レコードを現在ログイン中のユーザーに割り当てる
-- 注意: SupabaseダッシュボードのSQLエディタから実行する場合、
--       実行者のauth.uid()が使用されます

-- 既存の tasks レコードに user_id を設定
-- オプションA: 現在のユーザーIDで埋める（推奨）
UPDATE tasks 
SET user_id = auth.uid() 
WHERE user_id IS NULL;

-- 既存の task_dependencies レコードに user_id を設定
UPDATE task_dependencies 
SET user_id = auth.uid() 
WHERE user_id IS NULL;

-- オプションB: 特定のユーザーIDで埋める場合（開発環境）
-- 自分のユーザーIDをダッシュボードで確認し、以下のように実行:
-- UPDATE tasks SET user_id = '<YOUR_USER_ID>' WHERE user_id IS NULL;
-- UPDATE task_dependencies SET user_id = '<YOUR_USER_ID>' WHERE user_id IS NULL;

-- ==========================================
-- STEP 4: user_id を NOT NULL に変更
-- ==========================================
-- 既存データの移行後、user_idを必須にする

ALTER TABLE tasks 
ALTER COLUMN user_id SET NOT NULL;

ALTER TABLE task_dependencies 
ALTER COLUMN user_id SET NOT NULL;

-- ==========================================
-- STEP 5: インデックスの追加（パフォーマンス最適化）
-- ==========================================

CREATE INDEX IF NOT EXISTS idx_tasks_user_id ON tasks(user_id);
CREATE INDEX IF NOT EXISTS idx_task_dependencies_user_id ON task_dependencies(user_id);

-- ==========================================
-- STEP 6: 既存のRLSポリシーを削除
-- ==========================================

-- tasks テーブルの開発用ポリシーを削除
DROP POLICY IF EXISTS "Allow anonymous access during development" ON tasks;
DROP POLICY IF EXISTS "Enable read access for all users" ON tasks;
DROP POLICY IF EXISTS "Enable insert for all users" ON tasks;
DROP POLICY IF EXISTS "Enable update for all users" ON tasks;
DROP POLICY IF EXISTS "Enable delete for all users" ON tasks;

-- task_dependencies テーブルの開発用ポリシーを削除（存在する場合）
DROP POLICY IF EXISTS "Allow anonymous access during development" ON task_dependencies;
DROP POLICY IF EXISTS "Enable read access for all users" ON task_dependencies;
DROP POLICY IF EXISTS "Enable insert for all users" ON task_dependencies;
DROP POLICY IF EXISTS "Enable update for all users" ON task_dependencies;
DROP POLICY IF EXISTS "Enable delete for all users" ON task_dependencies;

-- ==========================================
-- STEP 7: RLS（Row Level Security）の有効化
-- ==========================================

ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_dependencies ENABLE ROW LEVEL SECURITY;

-- ==========================================
-- STEP 8: RLSポリシーの作成
-- ==========================================

-- ==========================================
-- tasks テーブルのポリシー
-- ==========================================

-- SELECT: ユーザーは自分のタスクのみ閲覧可能
CREATE POLICY "users_can_select_own_tasks"
ON tasks
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- INSERT: ユーザーは自分のタスクのみ作成可能
CREATE POLICY "users_can_insert_own_tasks"
ON tasks
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

-- UPDATE: ユーザーは自分のタスクのみ更新可能
CREATE POLICY "users_can_update_own_tasks"
ON tasks
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- DELETE: ユーザーは自分のタスクのみ削除可能
CREATE POLICY "users_can_delete_own_tasks"
ON tasks
FOR DELETE
TO authenticated
USING (auth.uid() = user_id);

-- ==========================================
-- task_dependencies テーブルのポリシー
-- ==========================================

-- SELECT: ユーザーは自分の依存関係のみ閲覧可能
CREATE POLICY "users_can_select_own_dependencies"
ON task_dependencies
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- INSERT: ユーザーは自分の依存関係のみ作成可能
CREATE POLICY "users_can_insert_own_dependencies"
ON task_dependencies
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

-- UPDATE: ユーザーは自分の依存関係のみ更新可能
CREATE POLICY "users_can_update_own_dependencies"
ON task_dependencies
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- DELETE: ユーザーは自分の依存関係のみ削除可能
CREATE POLICY "users_can_delete_own_dependencies"
ON task_dependencies
FOR DELETE
TO authenticated
USING (auth.uid() = user_id);

-- ==========================================
-- STEP 9: 動作確認用のクエリ（オプション）
-- ==========================================

-- RLSが正しく有効化されているか確認
SELECT tablename, rowsecurity 
FROM pg_tables 
WHERE schemaname = 'public' 
  AND tablename IN ('tasks', 'task_dependencies');

-- ポリシーが正しく作成されているか確認
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual 
FROM pg_policies 
WHERE tablename IN ('tasks', 'task_dependencies')
ORDER BY tablename, policyname;

-- ==========================================
-- 実行手順
-- ==========================================
-- 1. Supabaseダッシュボードにログイン
-- 2. プロジェクトを選択
-- 3. SQL Editor を開く
-- 4. 新規クエリを作成
-- 5. このファイルの内容をコピー＆ペースト
-- 6. 実行（Run）ボタンをクリック
-- 7. エラーがないことを確認
-- 8. フロントエンドの修正を適用
-- 9. 動作確認

-- ==========================================
-- ロールバック手順（必要な場合）
-- ==========================================
-- RLSを無効化する場合:
-- ALTER TABLE tasks DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE task_dependencies DISABLE ROW LEVEL SECURITY;
--
-- user_id カラムを削除する場合:
-- ALTER TABLE tasks DROP COLUMN user_id;
-- ALTER TABLE task_dependencies DROP COLUMN user_id;
