import { useEffect, useMemo, useState } from 'react';
import { Stack, Text, Loader, Alert, Center, SimpleGrid, Checkbox } from '@mantine/core';
import { AlertCircle, CheckSquare } from 'lucide-react';
import { useTaskStore } from '../stores/taskStore';
import { TaskCard } from './TaskCard';
import { BulkActionBar } from './BulkActionBar';
import type { Tables } from '../supabase-types';

type Task = Tables<'tasks'>;

interface TaskListProps {
    onTaskClick?: (task: Task) => void;
}

export function TaskList({ onTaskClick }: TaskListProps) {
    const { tasks, loading, error, fetchTasks, showCompletedTasks, currentProjectId, deleteTasks, completeTasks } = useTaskStore();
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

    useEffect(() => {
        fetchTasks();
    }, [fetchTasks]);

    // Filter with AND condition: hierarchy scope AND completion status
    const displayTasks = useMemo(() => {
        return tasks.filter(task => {
            // 1. Hierarchy scope check
            const isCorrectScope = currentProjectId
                ? task.parent_id === currentProjectId
                : task.parent_id === null;

            // 2. Completion status check
            const isVisibleStatus = showCompletedTasks || (task.status !== 'DONE' && task.status !== 'done');

            // Both conditions must be true
            return isCorrectScope && isVisibleStatus;
        });
    }, [tasks, currentProjectId, showCompletedTasks]);

    // Handle selection toggle
    const toggleSelection = (taskId: string) => {
        setSelectedIds(prev => {
            const newSet = new Set(prev);
            if (newSet.has(taskId)) {
                newSet.delete(taskId);
            } else {
                newSet.add(taskId);
            }
            return newSet;
        });
    };

    // Handle bulk operations
    const handleBulkComplete = async () => {
        await completeTasks(Array.from(selectedIds), true);
        setSelectedIds(new Set());
    };

    const handleBulkDelete = async () => {
        await deleteTasks(Array.from(selectedIds));
        setSelectedIds(new Set());
    };

    const handleCancelSelection = () => {
        setSelectedIds(new Set());
    };

    if (loading && tasks.length === 0) {
        return (
            <Center h={300}>
                <Loader size="lg" />
            </Center>
        );
    }

    if (error) {
        return (
            <Alert
                icon={<AlertCircle size={16} />}
                title="エラーが発生しました"
                color="red"
                variant="light"
            >
                {error}
            </Alert>
        );
    }

    if (displayTasks.length === 0) {
        return (
            <Center h={300}>
                <Stack align="center" gap="md">
                    <CheckSquare size={48} strokeWidth={1.5} opacity={0.3} />
                    <Text c="dimmed" size="lg">
                        タスクがありません
                    </Text>
                    <Text c="dimmed" size="sm">
                        「新規タスク作成」ボタンでタスクを作成してみましょう
                    </Text>
                </Stack>
            </Center>
        );
    }

    return (
        <>
            <Stack gap="md">
                <Text size="sm" c="dimmed">
                    {displayTasks.length}件のタスク
                </Text>
                <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="md">
                    {displayTasks.map((task) => (
                        <div key={task.id} style={{ position: 'relative' }}>
                            {/* Selection Checkbox */}
                            <Checkbox
                                checked={selectedIds.has(task.id)}
                                onChange={() => toggleSelection(task.id)}
                                style={{
                                    position: 'absolute',
                                    top: '8px',
                                    left: '8px',
                                    zIndex: 10,
                                }}
                                size="sm"
                            />
                            <div style={{
                                opacity: selectedIds.has(task.id) ? 0.8 : 1,
                                border: selectedIds.has(task.id) ? '2px solid #5c7cfa' : undefined,
                                borderRadius: '8px',
                            }}>
                                <TaskCard
                                    task={task}
                                    onEdit={() => onTaskClick?.(task)}
                                />
                            </div>
                        </div>
                    ))}
                </SimpleGrid>
            </Stack>

            {/* Bulk Action Bar */}
            <BulkActionBar
                selectedIds={selectedIds}
                onComplete={handleBulkComplete}
                onDelete={handleBulkDelete}
                onCancel={handleCancelSelection}
            />
        </>
    );
}
