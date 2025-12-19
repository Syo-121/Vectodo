import { create } from 'zustand';
import { supabase } from '../lib/supabaseClient';
import type { Tables } from '../supabase-types';

type Task = Tables<'tasks'>;

export interface TaskData {
    title: string;
    project_id: string;
    estimate_minutes?: number | null;
    deadline?: string | null;
    importance?: number | null;
    description?: string | null;
    planned_start?: string | null;
    planned_end?: string | null;
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
    fetchTasks: () => Promise<void>;
    fetchDependencies: () => Promise<void>;
    addTask: (taskData: TaskData) => Promise<void>;
    updateTask: (taskId: string, updates: Partial<TaskData>) => Promise<void>;
    updateTaskStatus: (taskId: string, status: string | null) => Promise<void>;
    deleteTask: (taskId: string) => Promise<void>;
    startTimer: (taskId: string) => Promise<void>;
    stopTimer: () => Promise<void>;
    getCurrentTimerElapsed: () => number;
    toggleShowCompletedTasks: () => void;
    setCurrentProject: (id: string | null) => void;
    addDependency: (predecessorId: string, successorId: string) => Promise<void>;
    removeDependency: (predecessorId: string, successorId: string) => Promise<void>;
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
        return localStorage.getItem('vectodo-current-project');
    } catch (error) {
        console.error('Failed to load current project:', error);
        return null;
    }
};

const initialCurrentProject = loadCurrentProject();

export const useTaskStore = create<TaskStore>((set, get) => ({
    tasks: [],
    dependencies: [],
    loading: false,
    error: null,
    activeTaskId: initialTimerState.activeTaskId,
    timerStartTime: initialTimerState.timerStartTime,
    showCompletedTasks: initialShowCompleted,
    currentProjectId: initialCurrentProject,

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
            // Generate unique slug based on global maximum across ALL tasks
            const allTasks = get().tasks;
            const maxSlug = allTasks.reduce((max, task) => {
                const slugNum = parseInt(task.slug, 10);
                return (!isNaN(slugNum) && slugNum > max) ? slugNum : max;
            }, 0);
            const newSlug = String(maxSlug + 1);

            console.log('Creating task with slug:', newSlug);

            const { currentProjectId } = get();
            const { data, error } = await supabase
                .from('tasks')
                .insert({
                    title: taskData.title,
                    slug: newSlug,
                    project_id: taskData.project_id,
                    parent_id: currentProjectId,
                    estimate_minutes: taskData.estimate_minutes,
                    deadline: taskData.deadline,
                    importance: taskData.importance,
                    description: taskData.description,
                })
                .select()
                .single();

            if (error) {
                console.error('Supabase error details:', error);
                throw error;
            }

            console.log('Task created successfully:', data);

            // Add the new task to the beginning of the list
            set((state) => ({
                tasks: [data, ...state.tasks],
                loading: false,
            }));
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
        }
    },

    updateTask: async (taskId: string, updates: Partial<Task>) => {
        set({ loading: true, error: null });
        try {
            console.log('Updating task:', taskId, updates);

            const { data, error } = await supabase
                .from('tasks')
                .update(updates)
                .eq('id', taskId)
                .select()
                .single();

            if (error) {
                console.error('Supabase error details:', error);
                throw error;
            }

            console.log('Task updated successfully:', data);

            // Update the task in the list
            set((state) => ({
                tasks: state.tasks.map((task) =>
                    task.id === taskId ? data : task
                ),
                loading: false,
            }));
        } catch (error: any) {
            const errorMessage = error?.message || 'Failed to update task';
            const errorDetails = error?.details || '';
            const errorHint = error?.hint || '';

            const fullError = `${errorMessage}${errorDetails ? ` - ${errorDetails}` : ''}${errorHint ? ` (ヒント: ${errorHint})` : ''}`;

            console.error('Full error:', fullError, error);

            set({
                error: fullError,
                loading: false
            });
        }
    },

    deleteTask: async (taskId: string) => {
        set({ loading: true, error: null });
        try {
            console.log('Deleting task:', taskId);

            const { error } = await supabase
                .from('tasks')
                .delete()
                .eq('id', taskId);

            if (error) {
                console.error('Supabase error details:', error);
                throw error;
            }

            console.log('Task deleted successfully');

            // Remove the task from the list
            set((state) => ({
                tasks: state.tasks.filter((task) => task.id !== taskId),
                loading: false,
            }));
        } catch (error: any) {
            const errorMessage = error?.message || 'Failed to delete task';
            const errorDetails = error?.details || '';
            const errorHint = error?.hint || '';

            const fullError = `${errorMessage}${errorDetails ? ` - ${errorDetails}` : ''}${errorHint ? ` (ヒント: ${errorHint})` : ''}`;

            console.error('Full error:', fullError, error);

            set({
                error: fullError,
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

            const { error } = await supabase
                .from('task_dependencies')
                .insert({
                    predecessor_id: predecessorId,
                    successor_id: successorId,
                });

            if (error) throw error;

            // Update local state
            set((state) => ({
                dependencies: [
                    ...state.dependencies,
                    { predecessor_id: predecessorId, successor_id: successorId },
                ],
            }));
        } catch (error) {
            console.error('Failed to add dependency:', error);
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
        try {
            const { error } = await supabase
                .from('tasks')
                .update({ status })
                .eq('id', taskId);

            if (error) {
                console.error('[TaskStore] Failed to update status in DB:', error);
                throw error;
            }

            console.log('[TaskStore] Status updated in DB successfully');

            // Update local state
            set((state) => ({
                tasks: state.tasks.map(task =>
                    task.id === taskId ? { ...task, status } : task
                ),
            }));

            console.log('[TaskStore] Local state updated');

            // Refresh tasks to ensure consistency
            await get().fetchTasks();
        } catch (error) {
            console.error('[TaskStore] Failed to update task status:', error);
        }
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
        // Persist to localStorage
        try {
            if (id) {
                localStorage.setItem('vectodo-current-project', id);
            } else {
                localStorage.removeItem('vectodo-current-project');
            }
        } catch (error) {
            console.error('Failed to save current project:', error);
        }
    },
}));

// Export a helper to get unscheduled tasks
export const getUnscheduledTasks = () => {
    const tasks = useTaskStore.getState().tasks;
    return tasks.filter(task => !task.planned_start || !task.planned_end);
};
