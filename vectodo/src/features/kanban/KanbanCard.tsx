import { Card, Text, Badge, Stack, Group, useMantineColorScheme, useMantineTheme, ActionIcon, Menu, Tooltip } from '@mantine/core';
import { Clock, CheckCircle, Pencil, Zap, Flame, ArrowUp, ArrowRight, ArrowDown, Repeat } from 'lucide-react';
import type { Tables } from '../../supabase-types';
import { useTaskStore } from '../../stores/taskStore';
import { getImportanceConfig } from '../../utils/taskUtils';
import { calculateUrgencyFromDeadline } from '../../utils/urgency';

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

    const { updateTaskImportance } = useTaskStore();

    const handleImportanceChange = async (importance: number | null) => {
        await updateTaskImportance(task.id, importance);
    };





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
                    <Group gap="xs" style={{ flex: 1, minWidth: 0 }}>
                        <Text fw={600} size="sm" lineClamp={2} style={{ flex: 1 }}>
                            {task.title}
                        </Text>
                        {/* Recurrence indicator */}
                        {task.recurrence && (
                            <Tooltip label="繰り返しタスク">
                                <Repeat size={14} color="var(--mantine-color-blue-6)" style={{ flexShrink: 0 }} />
                            </Tooltip>
                        )}
                    </Group>
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

                {/* Metadata Row 1: Deadlines & Time */}
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

                    {/* Estimate time */}
                    {task.estimate_minutes !== null && task.estimate_minutes > 0 && (
                        <Badge size="xs" color="cyan" variant="light">
                            予定 {task.estimate_minutes}分
                        </Badge>
                    )}
                </Group>

                {/* Metadata Row 2: Matrix (Importance/Urgency) */}
                <Group gap="xs">
                    {/* Importance Indicator */}
                    <Menu shadow="md" width={150}>
                        <Menu.Target>
                            <Badge
                                size="xs"
                                variant="light"
                                color={task.importance ? getImportanceConfig(task.importance).color : 'gray'}
                                style={{ cursor: 'pointer', paddingLeft: 6, paddingRight: 8 }}
                                leftSection={<Zap size={10} fill={task.importance && task.importance >= 80 ? "currentColor" : "none"} />}
                                onClick={(e) => e.stopPropagation()}
                            >
                                {getImportanceConfig(task.importance).label}
                            </Badge>
                        </Menu.Target>
                        <Menu.Dropdown onClick={(e) => e.stopPropagation()}>
                            <Menu.Label>重要度 (Importance)</Menu.Label>
                            <Menu.Item leftSection={<ArrowUp size={14} />} onClick={() => handleImportanceChange(90)} color="violet">高 (High)</Menu.Item>
                            <Menu.Item leftSection={<ArrowRight size={14} />} onClick={() => handleImportanceChange(50)} color="grape">中 (Medium)</Menu.Item>
                            <Menu.Item leftSection={<ArrowDown size={14} />} onClick={() => handleImportanceChange(20)} color="indigo">低 (Low)</Menu.Item>
                            <Menu.Divider />
                            <Menu.Item onClick={() => handleImportanceChange(null)}>なし (None)</Menu.Item>
                        </Menu.Dropdown>
                    </Menu>

                    {/* Urgency Indicator (Auto-calculated) */}
                    <Badge
                        size="xs"
                        variant="light"
                        color={(() => {
                            const config = calculateUrgencyFromDeadline(task.deadline, task.status);
                            return config.color;
                        })()}
                        style={{ paddingLeft: 6, paddingRight: 8 }}
                        leftSection={<Flame size={10} fill={(() => {
                            const config = calculateUrgencyFromDeadline(task.deadline, task.status);
                            return config.level >= 80 ? "currentColor" : "none";
                        })()} />}
                    >
                        {calculateUrgencyFromDeadline(task.deadline, task.status).label}
                    </Badge>
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
