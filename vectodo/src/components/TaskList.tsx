import { useEffect, useMemo } from 'react';
import { Stack, Text, Loader, Alert, Center, SimpleGrid } from '@mantine/core';
import { AlertCircle, CheckSquare } from 'lucide-react';
import { useTaskStore } from '../stores/taskStore';
import { TaskCard } from './TaskCard';
import type { Tables } from '../supabase-types';

type Task = Tables<'tasks'>;

interface TaskListProps {
    onTaskClick?: (task: Task) => void;
}

export function TaskList({ onTaskClick }: TaskListProps) {
    const { tasks, loading, error, fetchTasks, showCompletedTasks } = useTaskStore();

    useEffect(() => {
        fetchTasks();
    }, [fetchTasks]);

    // Filter out completed tasks if showCompletedTasks is false
    const displayTasks = useMemo(() => {
        if (showCompletedTasks) {
            return tasks;
        }
        return tasks.filter(task =>
            task.status !== 'DONE' && task.status !== 'done'
        );
    }, [tasks, showCompletedTasks]);

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
        <Stack gap="md">
            <Text size="sm" c="dimmed">
                {displayTasks.length}件のタスク
            </Text>
            <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="md">
                {displayTasks.map((task) => (
                    <TaskCard
                        key={task.id}
                        task={task}
                        onClick={() => onTaskClick?.(task)}
                    />
                ))}
            </SimpleGrid>
        </Stack>
    );
}
