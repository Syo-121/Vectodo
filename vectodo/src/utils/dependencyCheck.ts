import type { Tables } from '../supabase-types';
import { type TaskDependency } from '../stores/taskStore';
import dayjs from 'dayjs';

type Task = Tables<'tasks'>;

export interface DependencyWarning {
    predecessorId: string;
    predecessorTitle: string;
    reason: string;
    type: 'schedule' | 'unplanned';
}

/**
 * Get all dependency warnings for a given task
 * Only checks time-based scheduling conflicts, NOT status
 */
export function getDependencyWarnings(
    task: Task,
    allTasks: Task[],
    allDependencies: TaskDependency[]
): DependencyWarning[] {
    const warnings: DependencyWarning[] = [];

    // Find all predecessor IDs for this task
    const predecessorIds = allDependencies
        .filter(dep => dep.successor_id === task.id)
        .map(dep => dep.predecessor_id);

    console.log(`[DependencyCheck] Checking task "${task.title}" (${task.id})`);
    console.log(`[DependencyCheck] Found ${predecessorIds.length} predecessors:`, predecessorIds);

    // Check each predecessor
    for (const predecessorId of predecessorIds) {
        const predecessor = allTasks.find(t => t.id === predecessorId);

        if (!predecessor) {
            console.warn(`[DependencyCheck] Predecessor ${predecessorId} not found!`);
            continue;
        }

        console.log(`[DependencyCheck] Checking predecessor "${predecessor.title}"`);
        console.log(`[DependencyCheck]   - Planned end: ${predecessor.planned_end}`);
        console.log(`[DependencyCheck]   - Current task planned start: ${task.planned_start}`);

        // Time-based check: Schedule conflict
        if (predecessor.planned_end && task.planned_start) {
            const predEnd = dayjs(predecessor.planned_end);
            const currStart = dayjs(task.planned_start);

            console.log(`[DependencyCheck]   - Predecessor ends: ${predEnd.format('YYYY-MM-DD HH:mm')}`);
            console.log(`[DependencyCheck]   - Current starts: ${currStart.format('YYYY-MM-DD HH:mm')}`);
            console.log(`[DependencyCheck]   - Predecessor ends after current starts? ${predEnd.isAfter(currStart)}`);

            // Warning if predecessor ends AFTER current task starts
            if (predEnd.isAfter(currStart)) {
                const warning: DependencyWarning = {
                    predecessorId: predecessor.id,
                    predecessorTitle: predecessor.title,
                    reason: `${predecessor.title} の終了予定(${predEnd.format('MM/DD HH:mm')})よりも前にスケジュールされています（開始: ${currStart.format('MM/DD HH:mm')}）`,
                    type: 'schedule'
                };
                warnings.push(warning);
                console.log(`[DependencyCheck]   ⚠️ SCHEDULE CONFLICT: ${warning.reason}`);
            } else {
                console.log(`[DependencyCheck]   ✓ Schedule is valid (predecessor ends before current starts)`);
            }
        } else if (!predecessor.planned_end && task.planned_start) {
            // Optional: Warn if predecessor has no schedule
            const warning: DependencyWarning = {
                predecessorId: predecessor.id,
                predecessorTitle: predecessor.title,
                reason: `${predecessor.title} のスケジュールが未定です`,
                type: 'unplanned'
            };
            warnings.push(warning);
            console.log(`[DependencyCheck]   ⚠️ UNPLANNED PREDECESSOR: ${warning.reason}`);
        } else {
            console.log(`[DependencyCheck]   - Skipping time check (missing planned times)`);
        }
    }

    console.log(`[DependencyCheck] Total warnings for "${task.title}": ${warnings.length}`);
    return warnings;
}

/**
 * Check if a task has any dependency warnings
 */
export function hasUnsatisfiedDependencies(
    task: Task,
    allTasks: Task[],
    allDependencies: TaskDependency[]
): boolean {
    return getDependencyWarnings(task, allTasks, allDependencies).length > 0;
}

/**
 * Legacy function for backward compatibility
 * Returns array of predecessor tasks that have warnings
 */
export function getUnsatisfiedPredecessors(
    taskId: string,
    tasks: Task[],
    dependencies: TaskDependency[]
): Task[] {
    const task = tasks.find(t => t.id === taskId);
    if (!task) return [];

    const warnings = getDependencyWarnings(task, tasks, dependencies);
    const unsatisfiedIds = [...new Set(warnings.map(w => w.predecessorId))];

    return tasks.filter(t => unsatisfiedIds.includes(t.id));
}
