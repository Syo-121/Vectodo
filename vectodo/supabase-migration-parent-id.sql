-- =========================================================
-- Phase 7: Task Hierarchy Migration
-- =========================================================
-- This migration adds parent_id column to enable hierarchical task structure
-- WARNING: This is a breaking change. Existing tasks will become root tasks.

-- 1. Add parent_id column
ALTER TABLE public.tasks 
ADD COLUMN parent_id UUID REFERENCES public.tasks(id) ON DELETE CASCADE;

-- 2. Add index for better query performance
CREATE INDEX idx_tasks_parent_id ON public.tasks(parent_id);

-- 3. Add comment for documentation
COMMENT ON COLUMN public.tasks.parent_id IS 
'References parent task ID. NULL = root task (project), non-NULL = subtask';

-- 4. Verify migration
-- Run this to check if the column was added successfully:
-- SELECT column_name, data_type, is_nullable 
-- FROM information_schema.columns 
-- WHERE table_name = 'tasks' AND column_name = 'parent_id';

-- 5. Check existing data
-- All existing tasks will have parent_id = NULL (root tasks)
-- SELECT id, title, parent_id FROM tasks LIMIT 10;
