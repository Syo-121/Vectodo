import dayjs from 'dayjs';

export interface UrgencyConfig {
    level: number; // 90, 70, 50, 20 for compatibility
    label: string;
    color: string;
    icon: 'alert' | 'flame' | 'warning' | 'none';
}

/**
 * Calculates urgency based on remaining days until deadline.
 * Uses "days before deadline" (残り日数) logic.
 * 
 * @param deadline - ISO date string or null
 * @param status - Task status (DONE tasks get low urgency)
 * @returns UrgencyConfig object
 */
export const calculateUrgencyFromDeadline = (
    deadline: string | null | undefined,
    status?: string | null
): UrgencyConfig => {
    // Done tasks always get low urgency
    if (status?.toUpperCase() === 'DONE') {
        return {
            level: 20,
            label: '低',
            color: 'gray',
            icon: 'none',
        };
    }

    // No deadline = low urgency
    if (!deadline) {
        return {
            level: 20,
            label: '低',
            color: 'gray',
            icon: 'none',
        };
    }

    // Calculate remaining days (純粋な日付の差分)
    const now = dayjs().startOf('day');
    const deadlineDate = dayjs(deadline).startOf('day');
    const remainingDays = deadlineDate.diff(now, 'day');

    // Highest: Overdue or today (≤0 days)
    if (remainingDays <= 0) {
        return {
            level: 95, // Highest
            label: '最高',
            color: 'red',
            icon: 'alert',
        };
    }

    // High: Tomorrow (1 day)
    if (remainingDays === 1) {
        return {
            level: 80,
            label: '高',
            color: 'orange',
            icon: 'flame',
        };
    }

    // Medium: 2-3 days before
    if (remainingDays === 2 || remainingDays === 3) {
        return {
            level: 50,
            label: '中',
            color: 'yellow',
            icon: 'warning',
        };
    }

    // Low: 4+ days before
    return {
        level: 20,
        label: '低',
        color: 'gray',
        icon: 'none',
    };
};
