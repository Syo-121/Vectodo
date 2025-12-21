export interface StatusConfig {
    color: string;
    label: string;
}

export interface LevelConfig {
    color: string;
    label: string;
    icon: 'up' | 'right' | 'down';
}

/**
 * Returns the color and label for a given task status.
 * Standardizes colors across List, Kanban, and Flow views.
 */
export const getStatusConfig = (status: string | null | undefined): StatusConfig => {
    const s = status?.toUpperCase();
    if (s === 'DONE') return { color: 'green', label: 'Done' };
    if (s === 'DOING' || s === 'IN_PROGRESS') return { color: 'blue', label: 'In Progress' };
    if (s === 'PENDING') return { color: 'orange', label: 'Pending' }; // Standardizing on orange (was yellow in List)
    return { color: 'gray', label: 'To Do' };
};

/**
 * Returns configuration for Importance levels.
 * Thresholds: High >= 80, Medium >= 50, Low < 50
 */
export const getImportanceConfig = (val: number | null | undefined): LevelConfig => {
    if (val === null || val === undefined) return { color: 'gray', label: '-', icon: 'down' };
    if (val >= 80) return { color: 'violet', label: '高', icon: 'up' };
    if (val >= 50) return { color: 'grape', label: '中', icon: 'right' };
    return { color: 'indigo', label: '低', icon: 'down' };
};

/**
 * Returns configuration for Urgency levels.
 * Thresholds: High >= 80, Medium >= 50, Low < 50
 */
export const getUrgencyConfig = (val: number | null | undefined): LevelConfig => {
    if (val === null || val === undefined) return { color: 'gray', label: '-', icon: 'down' };
    if (val >= 80) return { color: 'red', label: '高', icon: 'up' };
    if (val >= 50) return { color: 'orange', label: '中', icon: 'right' };
    return { color: 'yellow', label: '低', icon: 'down' };
};
