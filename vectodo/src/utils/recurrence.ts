/**
 * Recurrence utility for task management
 * Handles calculation of next due dates based on recurrence patterns
 */

export interface Recurrence {
    type: 'daily' | 'weekly' | 'monthly';
    interval: number; // e.g., 1 for every day/week/month, 2 for every 2 days/weeks/months
    days_of_week?: number[]; // 0=Sun, 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri, 6=Sat
}

/**
 * Calculate the next due date based on recurrence settings
 * 
 * @param currentDueDate - The current due date (reference date for calculation)
 * @param recurrence - Recurrence configuration
 * @returns The next due date
 * 
 * @example
 * // Daily recurrence
 * calculateNextDueDate(new Date('2025-12-22'), { type: 'daily', interval: 1 })
 * // Returns: 2025-12-23
 * 
 * @example
 * // Bi-weekly on Tuesday and Thursday
 * calculateNextDueDate(new Date('2025-12-24'), { type: 'weekly', interval: 2, days_of_week: [2, 4] })
 * // If current is Tuesday (2), returns next Thursday (2025-12-26)
 * // If current is Thursday (4), returns Tuesday 2 weeks later (2026-01-07)
 */
export function calculateNextDueDate(
    currentDueDate: Date,
    recurrence: Recurrence
): Date {
    const nextDate = new Date(currentDueDate);
    const { type, interval, days_of_week } = recurrence;

    // If type is weekly and days_of_week is specified, use day-of-week logic
    if (type === 'weekly' && days_of_week && days_of_week.length > 0) {
        return calculateNextDayOfWeek(nextDate, interval, days_of_week);
    }

    // Otherwise, use simple interval-based calculation
    switch (type) {
        case 'daily':
            nextDate.setDate(nextDate.getDate() + interval);
            break;
        case 'weekly':
            nextDate.setDate(nextDate.getDate() + (interval * 7));
            break;
        case 'monthly':
            nextDate.setMonth(nextDate.getMonth() + interval);
            break;
    }

    return nextDate;
}

/**
 * Calculate the next occurrence of a specific day of the week
 * Handles multiple days of week and interval (e.g., bi-weekly)
 * 
 * @param currentDate - Current reference date
 * @param interval - Week interval (1 = every week, 2 = bi-weekly, etc.)
 * @param daysOfWeek - Array of days (0=Sun, 1=Mon, ..., 6=Sat)
 * @returns Next occurrence date
 */
function calculateNextDayOfWeek(
    currentDate: Date,
    interval: number,
    daysOfWeek: number[]
): Date {
    const currentDay = currentDate.getDay();
    const sortedDays = [...daysOfWeek].sort((a, b) => a - b);

    // Find the next day in the same week
    const nextDayInWeek = sortedDays.find(day => day > currentDay);

    if (nextDayInWeek !== undefined) {
        // Next occurrence is in the same week
        const daysToAdd = nextDayInWeek - currentDay;
        const nextDate = new Date(currentDate);
        nextDate.setDate(nextDate.getDate() + daysToAdd);
        return nextDate;
    } else {
        // Next occurrence is in the next interval week
        // Go to the first day of week in the next interval
        const daysUntilNextWeek = 7 - currentDay; // Days until Sunday of next week
        const daysToFirstOccurrence = sortedDays[0]; // First day in the sorted list
        const totalDays = daysUntilNextWeek + daysToFirstOccurrence + ((interval - 1) * 7);

        const nextDate = new Date(currentDate);
        nextDate.setDate(nextDate.getDate() + totalDays);
        return nextDate;
    }
}

/**
 * Get a human-readable description of the recurrence pattern
 * 
 * @param recurrence - Recurrence configuration
 * @returns Human-readable string (in Japanese)
 */
export function getRecurrenceDescription(recurrence: Recurrence | null): string {
    if (!recurrence) return '繰り返しなし';

    const { type, interval, days_of_week } = recurrence;

    // Special cases for common patterns
    if (type === 'daily' && interval === 1) {
        return '毎日';
    }

    if (type === 'weekly' && interval === 1) {
        if (days_of_week && days_of_week.length > 0) {
            // Weekdays pattern (Mon-Fri)
            if (JSON.stringify([...days_of_week].sort()) === JSON.stringify([1, 2, 3, 4, 5])) {
                return '平日';
            }

            const dayNames = ['日', '月', '火', '水', '木', '金', '土'];
            const dayNamesStr = days_of_week.map(d => dayNames[d]).join('・');
            return `毎週 ${dayNamesStr}曜日`;
        }
        return '毎週';
    }

    if (type === 'monthly' && interval === 1) {
        return '毎月';
    }

    // Custom patterns
    const typeNames = { daily: '日', weekly: '週', monthly: '月' };
    const typeName = typeNames[type];

    if (type === 'weekly' && days_of_week && days_of_week.length > 0) {
        const dayNames = ['日', '月', '火', '水', '木', '金', '土'];
        const dayNamesStr = days_of_week.map(d => dayNames[d]).join('・');
        return `${interval}週間ごと (${dayNamesStr}曜日)`;
    }

    return `${interval}${typeName}ごと`;
}
