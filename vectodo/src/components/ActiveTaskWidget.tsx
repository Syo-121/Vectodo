import { useEffect, useState } from 'react';
import { Paper, Stack, Text, Group, Button, ActionIcon } from '@mantine/core';
import { Play, Square, Check } from 'lucide-react';
import { useTaskStore } from '../stores/taskStore';

export function ActiveTaskWidget() {
    const { tasks, activeTaskId, timerStartTime, stopTimer, updateTaskStatus } = useTaskStore();
    const [elapsed, setElapsed] = useState(0);

    // Find active task
    const activeTask = tasks.find(t => t.id === activeTaskId);

    // Update timer every second
    useEffect(() => {
        if (!timerStartTime) return;

        const interval = setInterval(() => {
            const elapsedMs = Date.now() - new Date(timerStartTime).getTime();
            setElapsed(Math.floor(elapsedMs / 1000));
        }, 1000);

        return () => clearInterval(interval);
    }, [timerStartTime]);

    // Handle complete (stop timer + mark as done)
    const handleComplete = async () => {
        if (!activeTaskId) return;
        await stopTimer();
        await updateTaskStatus(activeTaskId, 'done');
    };

    // Don't render if no active task
    if (!activeTask || !activeTaskId) {
        return null;
    }

    // Format seconds as MM:SS
    const formatTime = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    };

    return (
        <Paper
            shadow="lg"
            p="md"
            withBorder
            style={{
                position: 'fixed',
                bottom: 20,
                right: 20,
                minWidth: 280,
                zIndex: 1000,
            }}
        >
            <Stack gap="sm">
                <Group gap={8}>
                    <ActionIcon size="sm" color="green" variant="light">
                        <Play size={14} fill="currentColor" />
                    </ActionIcon>
                    <Text size="sm" fw={600} style={{ flex: 1 }}>
                        実行中のタスク
                    </Text>
                </Group>

                <Text size="sm" lineClamp={2}>
                    {activeTask.title}
                </Text>

                <Text size="xl" fw={700} ta="center" c="blue">
                    {formatTime(elapsed)}
                </Text>

                <Group grow gap="xs">
                    <Button
                        variant="outline"
                        color="gray"
                        size="sm"
                        leftSection={<Square size={14} />}
                        onClick={stopTimer}
                    >
                        停止
                    </Button>
                    <Button
                        color="green"
                        size="sm"
                        leftSection={<Check size={14} />}
                        onClick={handleComplete}
                    >
                        完了
                    </Button>
                </Group>
            </Stack>
        </Paper>
    );
}
