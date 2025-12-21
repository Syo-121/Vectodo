import { Card, Text, Badge, Stack, Group, useMantineColorScheme, useMantineTheme, ActionIcon } from '@mantine/core';
import { Clock, AlertCircle, CheckCircle, Pencil } from 'lucide-react';
import type { Tables } from '../../supabase-types';

type Task = Tables<'tasks'>;

interface KanbanCardProps {
    task: Task;
    onDrillDown: (task: Task) => void;
    onEdit: (task: Task) => void;
}

export function KanbanCard({ task, onDrillDown, onEdit }: KanbanCardProps) {
    const hasDeadline = task.deadline;
    const isOverdue = hasDeadline && new Date(task.deadline!) < new Date();
    const { colorScheme } = useMantineColorScheme();
    const theme = useMantineTheme();
    const isDark = colorScheme === 'dark';
    const isDone = task.status?.toUpperCase() === 'DONE';

    return (
        <Card
            shadow="sm"
            padding="md"
            radius="md"
            withBorder
            style={{
                cursor: 'pointer',
                transition: 'all 0.2s',
                marginBottom: '8px',
                backgroundColor: isDark ? theme.colors.dark[5] : theme.white,
            }}
            onMouseEnter={(e) => {
                if (isDark) {
                    e.currentTarget.style.backgroundColor = theme.colors.dark[4];
                }
            }}
            onMouseLeave={(e) => {
                if (isDark) {
                    e.currentTarget.style.backgroundColor = theme.colors.dark[5];
                }
            }}
            onClick={() => onDrillDown(task)}
            className="kanban-card"
        >
            <Stack gap="xs">
                {/* Title with Edit Button */}
                <Group justify="space-between" align="flex-start" wrap="nowrap">
                    <Text fw={600} size="sm" lineClamp={2} style={{ flex: 1 }}>
                        {task.title}
                    </Text>
                    <ActionIcon
                        size="sm"
                        variant="subtle"
                        color="gray"
                        onClick={(e) => {
                            e.stopPropagation();
                            onEdit(task);
                        }}
                        style={{ flexShrink: 0 }}
                    >
                        <Pencil size={14} />
                    </ActionIcon>
                </Group>

                {/* Description preview */}
                {task.description && (
                    <Text size="xs" c="dimmed" lineClamp={2}>
                        {task.description}
                    </Text>
                )}

                {/* Metadata */}
                <Group gap="xs" wrap="wrap">
                    {/* Deadline */}
                    {hasDeadline && (
                        <Badge
                            size="xs"
                            color={isOverdue ? 'red' : 'gray'}
                            variant="light"
                            leftSection={<Clock size={12} />}
                        >
                            {new Date(task.deadline!).toLocaleDateString('ja-JP', {
                                month: 'short',
                                day: 'numeric',
                            })}
                        </Badge>
                    )}

                    {/* Priority/Importance */}
                    {task.importance !== null && task.importance > 0 && (
                        <Badge
                            size="xs"
                            color={task.importance >= 80 ? 'red' : task.importance >= 50 ? 'orange' : 'blue'}
                            variant="light"
                            leftSection={<AlertCircle size={12} />}
                        >
                            重要度 {task.importance}
                        </Badge>
                    )}

                    {/* Estimate time */}
                    {task.estimate_minutes !== null && task.estimate_minutes > 0 && (
                        <Badge size="xs" color="cyan" variant="light">
                            予定 {task.estimate_minutes}分
                        </Badge>
                    )}

                    {/* Actual time */}
                    {task.actual_minutes !== null && task.actual_minutes > 0 && (
                        <Badge size="xs" color="green" variant="light">
                            実績 {task.actual_minutes}分
                        </Badge>
                    )}
                </Group>

                {/* Completed date for done tasks */}
                {isDone && task.completed_at && (
                    <Group gap={4}>
                        <CheckCircle size={12} color={theme.colors.green[6]} />
                        <Text size="xs" c="dimmed">
                            完了: {new Date(task.completed_at).toLocaleDateString('ja-JP', {
                                year: 'numeric',
                                month: 'short',
                                day: 'numeric',
                            })}
                        </Text>
                    </Group>
                )}
            </Stack>
        </Card>
    );
}
