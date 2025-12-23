import { useMemo } from 'react';
import { Stack, Text, Group, Badge, Card, Box, Alert } from '@mantine/core';
import { AlertCircle, Calendar } from 'lucide-react';
import { useTaskStore } from '../../stores/taskStore';
import { getImportanceConfig } from '../../utils/taskUtils';
import type { Tables } from '../../supabase-types';
import { IconFolder } from '@tabler/icons-react';

type Task = Tables<'tasks'>;

interface MobileHomeProps {
    onEditTask: (task: Task) => void;
}

export function MobileHome({ onEditTask }: MobileHomeProps) {
    const { tasks } = useTaskStore();

    // --- Derived Data ---
    const { overdueTasks, todayTasks, tomorrowTasks } = useMemo(() => {
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);
        const dayAfterTomorrow = new Date(tomorrow);
        dayAfterTomorrow.setDate(dayAfterTomorrow.getDate() + 1);

        const notCompleted = tasks.filter(t => t.status !== 'DONE' && t.status !== 'done');

        const overdue: Task[] = [];
        const todayList: Task[] = [];
        const tomorrowList: Task[] = [];

        notCompleted.forEach(task => {
            if (!task.deadline) return;
            const deadline = new Date(task.deadline);

            if (deadline < today) {
                overdue.push(task);
            } else if (deadline >= today && deadline < tomorrow) {
                todayList.push(task);
            } else if (deadline >= tomorrow && deadline < dayAfterTomorrow) {
                tomorrowList.push(task);
            }
        });

        // Sort by importance (high first) then deadline
        const sorter = (a: Task, b: Task) => {
            const impA = a.importance || 0;
            const impB = b.importance || 0;
            if (impA !== impB) return impB - impA;
            const dA = a.deadline ? new Date(a.deadline).getTime() : 0;
            const dB = b.deadline ? new Date(b.deadline).getTime() : 0;
            return dA - dB;
        };

        return {
            overdueTasks: overdue.sort(sorter),
            todayTasks: todayList.sort(sorter),
            tomorrowTasks: tomorrowList.sort(sorter),
        };
    }, [tasks]);

    // Helper to get parent name
    const getParentName = (parentId: string | null) => {
        if (!parentId) return null;
        const parent = tasks.find(t => t.id === parentId);
        return parent ? parent.title : null;
    };

    // --- Components ---
    const TaskCard = ({ task, showTime = true }: { task: Task; showTime?: boolean }) => {
        const importanceConfig = getImportanceConfig(task.importance || 0);
        const parentName = getParentName(task.parent_id);

        return (
            <Card
                shadow="sm"
                padding="sm"
                radius="md"
                withBorder
                onClick={() => onEditTask(task)}
                style={{
                    backgroundColor: '#25262B',
                    borderColor: '#373A40',
                    cursor: 'pointer'
                }}
            >
                <Stack gap="xs">
                    {/* Header: Importance & Time */}
                    <Group justify="space-between">
                        <Badge
                            color={importanceConfig.color}
                            variant="light"
                            size="xs"
                        >
                            {importanceConfig.label}
                        </Badge>
                        {showTime && task.deadline && (
                            <Group gap={4}>
                                <Calendar size={12} color="#909296" />
                                <Text size="xs" c="dimmed">
                                    {new Date(task.deadline).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}
                                </Text>
                            </Group>
                        )}
                    </Group>

                    {/* Context / Parent Name */}
                    {parentName && (
                        <Group gap={4} mb={-4}>
                            <IconFolder size={12} color="#5c5f66" />
                            <Text size="xs" c="dimmed">
                                {parentName}
                            </Text>
                        </Group>
                    )}

                    {/* Title */}
                    <Text fw={500} size="sm" c="#C1C2C5" lineClamp={2}>
                        {task.title}
                    </Text>
                </Stack>
            </Card>
        );
    };

    const getFormattedDate = () => {
        const now = new Date();
        return now.toLocaleDateString('ja-JP', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            weekday: 'short',
        });
    };

    return (
        <Stack gap="lg" p="md" pb={100} style={{ backgroundColor: '#1A1B1E', minHeight: '100%' }}>
            {/* Header Date */}
            <Box>
                <Text size="sm" c="dimmed" fw={500}>
                    {getFormattedDate()}
                </Text>
                <Text size="xl" fw={700} c="#C1C2C5">
                    今日のタスク
                </Text>
            </Box>

            {/* Overdue Section */}
            {overdueTasks.length > 0 && (
                <Stack gap="sm">
                    <Alert
                        icon={<AlertCircle size={16} />}
                        title={`期限切れ (${overdueTasks.length})`}
                        color="red"
                        variant="light"
                        styles={{ root: { backgroundColor: 'rgba(250, 82, 82, 0.1)' } }}
                    >
                        消化しましょう！
                    </Alert>
                    {overdueTasks.map(task => (
                        <TaskCard key={task.id} task={task} />
                    ))}
                </Stack>
            )}

            {/* Today Section */}
            <Stack gap="sm">
                <Text fw={600} c="#C1C2C5">今日</Text>
                {todayTasks.length === 0 ? (
                    <Text c="dimmed" size="sm" ta="center" py="xl">
                        今日のタスクはありません 🎉
                    </Text>
                ) : (
                    todayTasks.map(task => (
                        <TaskCard key={task.id} task={task} />
                    ))
                )}
            </Stack>

            {/* Tomorrow Section */}
            {tomorrowTasks.length > 0 && (
                <Stack gap="sm">
                    <Text fw={600} c="dimmed">明日</Text>
                    {tomorrowTasks.map(task => (
                        <TaskCard key={task.id} task={task} showTime={false} />
                    ))}
                </Stack>
            )}
        </Stack>
    );
}
