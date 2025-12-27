import { create } from 'zustand';
import { supabase } from '../lib/supabaseClient';
import type { Tables } from '../supabase-types';
import { createGoogleEvent, updateGoogleEvent, deleteGoogleEvent } from '../utils/googleCalendarSync';
import { useToastStore } from './useToastStore';
import { calculateNextDueDate, type Recurrence } from '../utils/recurrence';

// Helper function to get current user ID
const getCurrentUserId = async (): Promise<string> => {
    const { data: { user }, error } = await supabase.auth.getUser();

    if (error || !user) {
        throw new Error('ユーザー認証が必要です。ログインしてください。');
    }

    return user.id;
};

type Task = Tables<'tasks'>;

export interface TaskData {
    title: string;
    project_id: string;
    estimate_minutes?: number | null;
    deadline?: string | null;
    importance?: number | null;
    urgency?: number | null;
    description?: string | null;
    parent_id?: string | null;
    planned_start?: string | null;
    planned_end?: string | null;
    recurrence?: Recurrence | null;
}

export interface TaskDependency {
    predecessor_id: string;
    successor_id: string;
}

interface TaskStore {
    tasks: Task[];
    dependencies: TaskDependency[];
    loading: boolean;
    error: string | null;
    activeTaskId: string | null;
    timerStartTime: string | null;
    showCompletedTasks: boolean;
    currentProjectId: string | null;
    targetCalendarId: string;
    doneFilterDays: number | null;
    fetchTasks: () => Promise<void>;
    fetchDependencies: () => Promise<void>;
    addTask: (taskData: TaskData) => Promise<void>;
    updateTask: (taskId: string, updates: Partial<TaskData>) => Promise<void>;
    updateTaskStatus: (taskId: string, status: string | null) => Promise<void>;
    updateTaskImportance: (taskId: string, importance: number | null) => Promise<void>;
    updateTaskUrgency: (taskId: string, urgency: number | null) => Promise<void>;
    updateTaskPriority: (taskId: string, importance: number | null) => Promise<void>; // Alias for backward compatibility
    deleteTask: (taskId: string) => Promise<void>;
    startTimer: (taskId: string) => Promise<void>;
    stopTimer: () => Promise<void>;
    getCurrentTimerElapsed: () => number;
    toggleShowCompletedTasks: () => void;
    setCurrentProject: (id: string | null) => void;
    setTargetCalendarId: (id: string) => void;
    setDoneFilterDays: (days: number | null) => void;
    addDependency: (predecessorId: string, successorId: string) => Promise<void>;
    removeDependency: (predecessorId: string, successorId: string) => Promise<void>;
    deleteTasks: (ids: string[]) => Promise<void>;
    completeTasks: (ids: string[], isCompleted: boolean) => Promise<void>;
}

// Load timer state from localStorage
const loadTimerState = () => {
    try {
        const saved = localStorage.getItem('vectodo-timer');
        if (saved) {
            const { activeTaskId, timerStartTime } = JSON.parse(saved);
            return { activeTaskId, timerStartTime };
        }
    } catch (error) {
        console.error('Failed to load timer state:', error);
    }
    return { activeTaskId: null, timerStartTime: null };
};

// Save timer state to localStorage
const saveTimerState = (activeTaskId: string | null, timerStartTime: string | null) => {
    try {
        if (activeTaskId && timerStartTime) {
            localStorage.setItem('vectodo-timer', JSON.stringify({ activeTaskId, timerStartTime }));
        } else {
            localStorage.removeItem('vectodo-timer');
        }
    } catch (error) {
        console.error('Failed to save timer state:', error);
    }
};

// Load show completed tasks setting from localStorage
const loadShowCompletedSetting = () => {
    try {
        const saved = localStorage.getItem('vectodo-show-completed');
        return saved ? JSON.parse(saved) : false;
    } catch (error) {
        console.error('Failed to load show completed setting:', error);
        return false;
    }
};

// Save show completed tasks setting to localStorage
const saveShowCompletedSetting = (value: boolean) => {
    try {
        localStorage.setItem('vectodo-show-completed', JSON.stringify(value));
    } catch (error) {
        console.error('Failed to save show completed setting:', error);
    }
};

const initialTimerState = loadTimerState();
const initialShowCompleted = loadShowCompletedSetting();

// Load current project from localStorage
const loadCurrentProject = (): string | null => {
    try {
        const saved = localStorage.getItem('vectodo-current-project');
        return saved || null;
    } catch (error) {
        console.error('Failed to load current project:', error);
        return null;
    }
};

// Save current project to localStorage
const saveCurrentProject = (id: string | null) => {
    try {
        if (id) {
            localStorage.setItem('vectodo-current-project', id);
        } else {
            localStorage.removeItem('vectodo-current-project');
        }
    } catch (error) {
        console.error('Failed to save current project:', error);
    }
};

const initialCurrentProject = loadCurrentProject();

// Load target calendar ID from localStorage
const loadTargetCalendarId = (): string => {
    try {
        const saved = localStorage.getItem('vectodo-target-calendar');
        return saved || 'primary';
    } catch (error) {
        console.error('Failed to load target calendar:', error);
        return 'primary';
    }
};

// Save target calendar ID to localStorage
const saveTargetCalendarId = (id: string) => {
    try {
        localStorage.setItem('vectodo-target-calendar', id);
    } catch (error) {
        console.error('Failed to save target calendar:', error);
    }
};

const initialTargetCalendar = loadTargetCalendarId();

// Load done filter days from localStorage
const loadDoneFilterDays = (): number | null => {
    try {
        const saved = localStorage.getItem('vectodo-done-filter-days');
        return saved ? JSON.parse(saved) : null;
    } catch (error) {
        console.error('Failed to load done filter days:', error);
        return null;
    }
};

// Save done filter days to localStorage
const saveDoneFilterDays = (days: number | null) => {
    try {
        if (days !== null) {
            localStorage.setItem('vectodo-done-filter-days', JSON.stringify(days));
        } else {
            localStorage.removeItem('vectodo-done-filter-days');
        }
    } catch (error) {
        console.error('Failed to save done filter days:', error);
    }
};

const initialDoneFilterDays = loadDoneFilterDays();

export const useTaskStore = create<TaskStore>((set, get) => ({
    tasks: [],
    dependencies: [],
    loading: false,
    error: null,
    activeTaskId: initialTimerState.activeTaskId,
    timerStartTime: initialTimerState.timerStartTime,
    showCompletedTasks: initialShowCompleted,
    currentProjectId: initialCurrentProject,
    targetCalendarId: initialTargetCalendar,
    doneFilterDays: initialDoneFilterDays,

    fetchTasks: async () => {
        set({ loading: true, error: null });
        try {
            const { data, error } = await supabase
                .from('tasks')
                .select('*')
                .order('created_at', { ascending: false });

            if (error) throw error;
            set({ tasks: data || [], loading: false });

            // Also fetch dependencies
            await useTaskStore.getState().fetchDependencies();
        } catch (error) {
            set({
                error: error instanceof Error ? error.message : 'Failed to fetch tasks',
                loading: false
            });
        }
    },

    fetchDependencies: async () => {
        try {
            const { data, error } = await supabase
                .from('task_dependencies')
                .select('predecessor_id, successor_id');

            if (error) throw error;
            set({ dependencies: data || [] });
        } catch (error) {
            console.error('Failed to fetch dependencies:', error);
        }
    },

    addTask: async (taskData: TaskData) => {
        set({ loading: true, error: null });
        try {
            // Get current user ID
            const userId = await getCurrentUserId();

            // Generate unique slug using timestamp + random suffix
            const timestamp = Date.now();
            const randomSuffix = Math.random().toString(36).substring(2, 7);
            const newSlug = `${timestamp}-${randomSuffix}`;

            console.log('Creating task with slug:', newSlug);

            const { currentProjectId } = get();
            const { data, error } = await supabase
                .from('tasks')
                .insert({
                    title: taskData.title,
                    slug: newSlug,
                    project_id: taskData.project_id,
                    parent_id: taskData.parent_id ?? currentProjectId, // Prefer taskData.parent_id
                    estimate_minutes: taskData.estimate_minutes,
                    deadline: taskData.deadline,
                    planned_start: taskData.planned_start, // Add planned_start
                    planned_end: taskData.planned_end,     // Add planned_end
                    importance: taskData.importance,
                    urgency: taskData.urgency,             // Add urgency
                    description: taskData.description,
                    recurrence: taskData.recurrence as any, // Cast to any for Json compatibility
                    user_id: userId, // Add user_id for RLS
                })
                .select()
                .single();

            if (error) {
                console.error('Supabase error details:', error);
                throw error;
            }

            console.log('Task created successfully:', data);

            // Google Calendar Sync - create event if date information exists
            console.log('🔄 [Task Store] Checking if Google sync is needed...');
            console.log('   Task dates:', {
                planned_start: data.planned_start,
                planned_end: data.planned_end,
                deadline: data.deadline,
            });

            // Track sync status for consolidated user feedback
            let syncStatus: 'success' | 'partial' | 'failed' = 'success';

            try {
                const { data: { session } } = await supabase.auth.getSession();
                console.log('   Session check:', {
                    hasSession: !!session,
                    hasToken: !!session?.provider_token,
                    provider: session?.user?.app_metadata?.provider,
                });

                if (session?.provider_token && (data.planned_start || data.planned_end || data.deadline)) {
                    console.log('📅 [Task Store] Date exists, starting Google sync...');
                    const { targetCalendarId } = get();
                    const googleEventId = await createGoogleEvent(data, targetCalendarId, session);

                    if (googleEventId) {
                        // Update task with google_event_id and google_calendar_id
                        const { error: updateError } = await supabase
                            .from('tasks')
                            .update({
                                google_event_id: googleEventId,
                                google_calendar_id: targetCalendarId
                            })
                            .eq('id', data.id);

                        if (!updateError) {
                            data.google_event_id = googleEventId;
                            data.google_calendar_id = targetCalendarId;
                            console.log('✅ [Task Store] Google sync successful! Event ID:', googleEventId);
                            syncStatus = 'success';
                        } else {
                            console.error('❌ [Task Store] Failed to save google_event_id:', updateError);
                            syncStatus = 'partial';
                        }
                    } else {
                        console.log('ℹ️ [Task Store] Google sync returned null (event not created)');
                        syncStatus = 'failed';
                    }
                } else {
                    if (!session?.provider_token) {
                        console.log('ℹ️ [Task Store] Google sync skipped: No provider token');
                    } else {
                        console.log('ℹ️ [Task Store] Google sync skipped: No date information');
                    }
                    // No sync needed, keep status as 'success'
                }
            } catch (syncError) {
                // Sync errors should not block task creation
                console.error('❌ [Task Store] Google Calendar sync failed:', syncError);
                syncStatus = 'failed';
            }

            // Add the new task to the beginning of the list
            set((state) => ({
                tasks: [data, ...state.tasks],
                loading: false,
            }));

            // Show consolidated toast based on sync status
            console.log('[DEBUG] Showing task creation toast with sync status:', syncStatus);
            if (syncStatus === 'success' && data.google_event_id) {
                useToastStore.getState().addToast('タスクを作成し、Googleカレンダーに同期しました', 'success');
            } else if (syncStatus === 'partial') {
                useToastStore.getState().addToast('タスクを作成しました（カレンダー同期は部分的に失敗）', 'warning');
            } else if (syncStatus === 'failed' && (data.planned_start || data.planned_end || data.deadline)) {
                useToastStore.getState().addToast('タスクを作成しました（カレンダー同期に失敗）', 'warning');
            } else {
                useToastStore.getState().addToast('タスクを作成しました', 'success');
            }
        } catch (error: any) {
            const errorMessage = error?.message || 'Failed to add task';
            const errorDetails = error?.details || '';
            const errorHint = error?.hint || '';

            const fullError = `${errorMessage}${errorDetails ? ` - ${errorDetails}` : ''}${errorHint ? ` (ヒント: ${errorHint})` : ''}`;

            console.error('Full error:', fullError, error);

            set({
                error: fullError,
                loading: false
            });

            // Show error toast
            console.log('[DEBUG] Showing error toast for task creation');
            useToastStore.getState().addToast(`エラー: ${errorMessage}`, 'error');
        }
    },

    updateTask: async (taskId: string, updates: Partial<TaskData>) => {
        set({ loading: true, error: null });
        try {
            console.log('Updating task:', taskId, updates);

            // Convert recurrence for database compatibility
            const dbUpdates: any = { ...updates };
            if (updates.recurrence !== undefined) {
                dbUpdates.recurrence = updates.recurrence as any;
            }

            const { data, error } = await supabase
                .from('tasks')
                .update(dbUpdates)
                .eq('id', taskId)
                .select()
                .single();

            if (error) throw error;

            console.log('Task updated successfully:', data);

            // Update task in store first
            set((state) => ({
                tasks: state.tasks.map((task) =>
                    task.id === taskId ? data : task
                ),
                loading: false,
            }));

            // Show success toast
            useToastStore.getState().addToast('タスクを更新しました', 'success');

            // Google Calendar Sync - handle all patterns
            console.log('🔄 [Task Store] Checking Google sync for updated task:', data.title);
            console.log('   Current state:', {
                has_google_event_id: !!data.google_event_id,
                google_event_id: data.google_event_id,
                planned_start: data.planned_start,
                planned_end: data.planned_end,
                deadline: data.deadline,
            });

            try {
                const { data: { session } } = await supabase.auth.getSession();

                if (!session?.provider_token) {
                    console.log('ℹ️ [Task Store] No provider token, skipping Google sync');
                    return;
                }

                const hasDate = !!(data.planned_start || data.planned_end || data.deadline);

                // Pattern A: New sync (no google_event_id but has date) - CREATE
                if (!data.google_event_id && hasDate) {
                    console.log('🆕 [Task Store] Task scheduled for first time. Creating Google event...');
                    const { targetCalendarId } = get();
                    const googleEventId = await createGoogleEvent(data, targetCalendarId, session);

                    if (googleEventId) {
                        console.log('✅ [Task Store] Event created! Saving ID:', googleEventId);

                        // Update DB with google_event_id and google_calendar_id
                        const { error: updateError } = await supabase
                            .from('tasks')
                            .update({
                                google_event_id: googleEventId,
                                google_calendar_id: targetCalendarId
                            })
                            .eq('id', taskId);

                        if (!updateError) {
                            // Update store
                            set((state) => ({
                                tasks: state.tasks.map((t) =>
                                    t.id === taskId ? { ...t, google_event_id: googleEventId, google_calendar_id: targetCalendarId } : t
                                ),
                            }));
                            console.log('✅ [Task Store] google_event_id saved successfully');
                        } else {
                            console.error('❌ [Task Store] Failed to save google_event_id:', updateError);
                        }
                    } else {
                        console.log('ℹ️ [Task Store] Event creation returned null');
                    }
                }
                // Pattern B: Update existing event (has google_event_id and has date) - UPDATE
                else if (data.google_event_id && hasDate) {
                    console.log('📝 [Task Store] Updating existing Google event...');
                    const calendarId = data.google_calendar_id || 'primary';
                    await updateGoogleEvent(data, data.google_event_id, calendarId, session);
                }
                // Pattern C: Delete event (has google_event_id but no date) - DELETE
                else if (data.google_event_id && !hasDate) {
                    console.log('🗑️ [Task Store] Date removed. Deleting Google event...');
                    const calendarId = data.google_calendar_id || 'primary';
                    await deleteGoogleEvent(data.google_event_id, calendarId, session);

                    // Clear google_event_id from DB
                    const { error: clearError } = await supabase
                        .from('tasks')
                        .update({ google_event_id: null, google_calendar_id: null })
                        .eq('id', taskId);

                    if (!clearError) {
                        // Update store
                        set((state) => ({
                            tasks: state.tasks.map((t) =>
                                t.id === taskId ? { ...t, google_event_id: null, google_calendar_id: null } : t
                            ),
                        }));
                        console.log('✅ [Task Store] google_event_id cleared');
                    } else {
                        console.error('❌ [Task Store] Failed to clear google_event_id:', clearError);
                    }
                }
                // Pattern D: No sync needed (no google_event_id and no date)
                else {
                    console.log('ℹ️ [Task Store] No Google sync needed (no event ID and no date)');
                }
            } catch (syncError) {
                console.error('❌ [Task Store] Google Calendar sync failed:', syncError);
                useToastStore.getState().addToast('Google同期に失敗しました', 'error');
            }
        } catch (error: any) {
            const errorMessage = error?.message || 'Failed to update task';
            console.error('Failed to update task:', error);
            set({ error: errorMessage, loading: false });
            useToastStore.getState().addToast(`エラー: ${errorMessage}`, 'error');
        }
    },

    deleteTask: async (taskId: string) => {
        set({ loading: true, error: null });
        try {
            console.log('Deleting task:', taskId);

            // Get task before deletion for Google sync
            const task = get().tasks.find(t => t.id === taskId);

            // Google Calendar Sync - delete event before DB deletion
            if (task?.google_event_id) {
                try {
                    const { data: { session } } = await supabase.auth.getSession();
                    if (session?.provider_token) {
                        console.log('[Task Store] Deleting event from Google Calendar...');
                        const calendarId = task.google_calendar_id || 'primary';
                        await deleteGoogleEvent(task.google_event_id, calendarId, session);
                    }
                } catch (syncError) {
                    console.error('[Task Store] Google Calendar sync failed:', syncError);
                }
            }

            const { error } = await supabase
                .from('tasks')
                .delete()
                .eq('id', taskId);

            if (error) throw error;

            console.log('Task deleted successfully');

            // Remove from state
            set((state) => ({
                tasks: state.tasks.filter((t) => t.id !== taskId),
                loading: false,
            }));

            // Show success toast
            useToastStore.getState().addToast('タスクを削除しました', 'success');
        } catch (error: any) {
            const errorMessage = error?.message || 'Failed to delete task';
            console.error('Delete error:', errorMessage, error);
            set({
                error: errorMessage,
                loading: false
            });
        }
    },

    addDependency: async (predecessorId: string, successorId: string) => {
        try {
            // Prevent self-loops
            if (predecessorId === successorId) {
                console.warn('Cannot create dependency to self');
                return;
            }

            // Get current user ID
            const userId = await getCurrentUserId();

            const { error } = await supabase
                .from('task_dependencies')
                .insert({
                    predecessor_id: predecessorId,
                    successor_id: successorId,
                    user_id: userId, // Add user_id for RLS
                });

            if (error) throw error;

            // Update local state
            set((state) => ({
                dependencies: [
                    ...state.dependencies,
                    { predecessor_id: predecessorId, successor_id: successorId },
                ],
            }));
        } catch (error: any) {
            console.error('Failed to add dependency:', error);
            useToastStore.getState().addToast(`エラー: ${error.message}`, 'error');
        }
    },

    removeDependency: async (predecessorId: string, successorId: string) => {
        try {
            const { error } = await supabase
                .from('task_dependencies')
                .delete()
                .eq('predecessor_id', predecessorId)
                .eq('successor_id', successorId);

            if (error) throw error;

            // Update local state
            set((state) => ({
                dependencies: state.dependencies.filter(
                    (dep) =>
                        !(dep.predecessor_id === predecessorId && dep.successor_id === successorId)
                ),
            }));
        } catch (error) {
            console.error('Failed to remove dependency:', error);
        }
    },

    updateTaskStatus: async (taskId: string, status: string | null) => {
        console.log('[TaskStore] Updating task status:', { taskId, status });

        // Store original state for rollback
        const originalTasks = get().tasks;
        const originalTask = originalTasks.find(t => t.id === taskId);

        if (!originalTask) {
            console.error('[TaskStore] Task not found:', taskId);
            return;
        }

        // Determine completed_at value based on status
        const completed_at = status === 'DONE' ? new Date().toISOString() : null;
        console.log('[TaskStore] Setting completed_at:', completed_at);

        try {
            // Optimistic update - update UI immediately
            set((state) => ({
                tasks: state.tasks.map(task =>
                    task.id === taskId ? { ...task, status, completed_at } : task
                ),
            }));
            console.log('[TaskStore] Optimistic update applied');

            // Update database with both status and completed_at
            const { error } = await supabase
                .from('tasks')
                .update({ status, completed_at })
                .eq('id', taskId);

            if (error) {
                console.error('[TaskStore] Failed to update status in DB:', error);
                // Rollback optimistic update
                set({ tasks: originalTasks });
                throw error;
            }

            console.log('[TaskStore] Status updated in DB successfully');

            // Handle recurrence: create next task if status is DONE and recurrence is set
            if (status === 'DONE' && originalTask.recurrence && originalTask.deadline) {
                try {
                    console.log('[TaskStore] Task has recurrence, creating next occurrence...');
                    const recurrence = originalTask.recurrence as unknown as Recurrence;
                    const currentDueDate = new Date(originalTask.deadline);
                    const nextDueDate = calculateNextDueDate(currentDueDate, recurrence);

                    console.log('[TaskStore] Next due date calculated:', nextDueDate);

                    // Create next task (duplicate with new deadline)
                    const nextTaskData: TaskData = {
                        title: originalTask.title,
                        project_id: originalTask.project_id,
                        description: originalTask.description,
                        estimate_minutes: originalTask.estimate_minutes,
                        importance: originalTask.importance,
                        deadline: nextDueDate.toISOString(),
                        recurrence: recurrence,
                        parent_id: originalTask.parent_id,
                        // Don't copy planned_start/planned_end - let user reschedule
                        planned_start: null,
                        planned_end: null,
                    };

                    await get().addTask(nextTaskData);
                    console.log('[TaskStore] ✅ Next recurring task created successfully');
                    useToastStore.getState().addToast('次回の繰り返しタスクを作成しました', 'success');
                } catch (recurrenceError) {
                    console.error('[TaskStore] Failed to create recurring task:', recurrenceError);
                    useToastStore.getState().addToast('繰り返しタスクの作成に失敗しました', 'error');
                }
            }

            // Show success notification
            useToastStore.getState().addToast('ステータスを更新しました', 'success');
        } catch (error) {
            console.error('[TaskStore] Failed to update task status:', error);
            useToastStore.getState().addToast('ステータスの更新に失敗しました', 'error');
        }
    },

    updateTaskImportance: async (taskId: string, importance: number | null) => {
        console.log('[TaskStore] Updating task importance:', { taskId, importance });

        // Store original state for rollback
        const originalTasks = get().tasks;

        try {
            // Optimistic update
            set((state) => ({
                tasks: state.tasks.map(task =>
                    task.id === taskId ? { ...task, importance } : task
                ),
            }));

            // Update database
            const { error } = await supabase
                .from('tasks')
                .update({ importance })
                .eq('id', taskId);

            if (error) {
                console.error('Failed to update importance:', error);
                set({ tasks: originalTasks }); // Rollback
                throw error;
            }

            useToastStore.getState().addToast('重要度を更新しました', 'success');
        } catch (error) {
            console.error('Failed to update importance:', error);
            useToastStore.getState().addToast('重要度の更新に失敗しました', 'error');
        }
    },

    updateTaskUrgency: async (taskId: string, urgency: number | null) => {
        console.log('[TaskStore] Updating task urgency:', { taskId, urgency });

        // Store original state for rollback
        const originalTasks = get().tasks;

        try {
            // Optimistic update
            set((state) => ({
                tasks: state.tasks.map(task =>
                    task.id === taskId ? { ...task, urgency } : task
                ),
            }));

            // Update database
            const { error } = await supabase
                .from('tasks')
                .update({ urgency })
                .eq('id', taskId);

            if (error) {
                console.error('Failed to update urgency:', error);
                set({ tasks: originalTasks }); // Rollback
                throw error;
            }

            useToastStore.getState().addToast('緊急度を更新しました', 'success');
        } catch (error) {
            console.error('Failed to update urgency:', error);
            useToastStore.getState().addToast('緊急度の更新に失敗しました', 'error');
        }
    },

    // Alias for backward compatibility (Kanban board support)
    updateTaskPriority: async (taskId: string, importance: number | null) => {
        return get().updateTaskImportance(taskId, importance);
    },

    startTimer: async (taskId: string) => {
        const timerStartTime = new Date().toISOString();

        // Update task status to 'DOING'
        await get().updateTaskStatus(taskId, 'DOING');

        // Set timer state
        set({ activeTaskId: taskId, timerStartTime });

        // Persist to localStorage
        saveTimerState(taskId, timerStartTime);
    },

    stopTimer: async () => {
        const { activeTaskId, timerStartTime, tasks } = get();

        if (!activeTaskId || !timerStartTime) return;

        // Calculate elapsed time in minutes
        const elapsedMs = Date.now() - new Date(timerStartTime).getTime();
        const elapsedMinutes = Math.round(elapsedMs / 1000 / 60);

        // Get current actual_minutes
        const task = tasks.find(t => t.id === activeTaskId);
        const currentActual = task?.actual_minutes || 0;
        const newActual = currentActual + elapsedMinutes;

        // Update actual_minutes in database
        try {
            const { error } = await supabase
                .from('tasks')
                .update({ actual_minutes: newActual })
                .eq('id', activeTaskId);

            if (error) throw error;

            // Update local state
            set((state) => ({
                tasks: state.tasks.map(t =>
                    t.id === activeTaskId ? { ...t, actual_minutes: newActual } : t
                ),
                activeTaskId: null,
                timerStartTime: null,
            }));

            // Clear localStorage
            saveTimerState(null, null);
        } catch (error) {
            console.error('Failed to update actual_minutes:', error);
        }
    },

    getCurrentTimerElapsed: () => {
        const { timerStartTime } = get();
        if (!timerStartTime) return 0;

        const elapsedMs = Date.now() - new Date(timerStartTime).getTime();
        return Math.floor(elapsedMs / 1000); // Return seconds
    },

    toggleShowCompletedTasks: () => {
        const newValue = !get().showCompletedTasks;
        set({ showCompletedTasks: newValue });
        saveShowCompletedSetting(newValue);
    },

    setCurrentProject: (id: string | null) => {
        set({ currentProjectId: id });
        saveCurrentProject(id);
    },

    setTargetCalendarId: (id: string) => {
        set({ targetCalendarId: id });
        saveTargetCalendarId(id);
    },

    setDoneFilterDays: (days: number | null) => {
        set({ doneFilterDays: days });
        saveDoneFilterDays(days);
    },

    // Bulk delete tasks
    deleteTasks: async (ids: string[]) => {
        if (ids.length === 0) return;

        set({ loading: true, error: null });
        try {
            console.log(`[Bulk Delete] Deleting ${ids.length} tasks:`, ids);

            const { error } = await supabase
                .from('tasks')
                .delete()
                .in('id', ids);

            if (error) throw error;

            // Remove from state
            set((state) => ({
                tasks: state.tasks.filter((t) => !ids.includes(t.id)),
                loading: false,
            }));

            // Show success toast
            useToastStore.getState().addToast(`${ids.length}件のタスクを削除しました`, 'success');
            console.log(`[Bulk Delete] Successfully deleted ${ids.length} tasks`);
        } catch (error: any) {
            const errorMessage = error?.message || 'Failed to delete tasks';
            console.error('[Bulk Delete] Error:', errorMessage, error);
            set({ error: errorMessage, loading: false });
            useToastStore.getState().addToast(`一括削除エラー: ${errorMessage}`, 'error');
        }
    },

    // Bulk complete/uncomplete tasks
    completeTasks: async (ids: string[], isCompleted: boolean) => {
        if (ids.length === 0) return;

        set({ loading: true, error: null });
        try {
            const newStatus = isCompleted ? 'DONE' : 'TODO';
            console.log(`[Bulk Complete] Setting ${ids.length} tasks to ${newStatus}:`, ids);

            const { error } = await supabase
                .from('tasks')
                .update({ status: newStatus })
                .in('id', ids);

            if (error) throw error;

            // Update state
            set((state) => ({
                tasks: state.tasks.map((t) =>
                    ids.includes(t.id) ? { ...t, status: newStatus } : t
                ),
                loading: false,
            }));

            // Show success toast
            const action = isCompleted ? '完了' : '未完了';
            useToastStore.getState().addToast(`${ids.length}件のタスクを${action}にしました`, 'success');
            console.log(`[Bulk Complete] Successfully updated ${ids.length} tasks to ${newStatus}`);
        } catch (error: any) {
            const errorMessage = error?.message || 'Failed to complete tasks';
            console.error('[Bulk Complete] Error:', errorMessage, error);
            set({ error: errorMessage, loading: false });
            useToastStore.getState().addToast(`一括更新エラー: ${errorMessage}`, 'error');
        }
    },
}));

// Export a helper to get unscheduled tasks
export const getUnscheduledTasks = () => {
    const tasks = useTaskStore.getState().tasks;
    return tasks.filter(task => !task.planned_start || !task.planned_end);
};
