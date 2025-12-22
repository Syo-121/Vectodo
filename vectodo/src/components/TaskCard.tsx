import { Card, Text, Badge, Group, Stack, Checkbox, ActionIcon, Menu, Tooltip } from '@mantine/core';
import { Clock, AlertCircle, Play, Circle, Edit, Folder, Repeat } from 'lucide-react';
import { useTaskStore } from '../stores/taskStore';
import type { Tables } from '../supabase-types';

type Task = Tables<'tasks'>;

interface TaskCardProps {
    task: Task;
    onEdit?: () => void;
}

export function TaskCard({ task, onEdit }: TaskCardProps) {
    const { updateTaskStatus, startTimer, activeTaskId, setCurrentProject, tasks } = useTaskStore();
    const isDone = task.status === 'DONE' || task.status === 'done';
    const isActive = activeTaskId === task.id;

    // Count subtasks
    const subtaskCount = tasks.filter(t => t.parent_id === task.id).length;

    const getStatusColor = (status: string | null) => {
        const statusUpper = status?.toUpperCase();
        switch (statusUpper) {
            case 'TODO':
                return 'blue';
            case 'DOING':
                return 'yellow';
            case 'DONE':
                return 'green';
            case 'PENDING':
                return 'gray';
            default:
                return 'blue';
        }
    };

    const getStatusLabel = (status: string | null) => {
        const statusUpper = status?.toUpperCase();
        switch (statusUpper) {
            case 'TODO':
                return '未着手';
            case 'DOING':
                return '進行中';
            case 'DONE':
                return '完了';
            case 'PENDING':
                return '保留';
            default:
                return '未着手';
        }
    };

    const handlePlayClick = async (e: React.MouseEvent) => {
        e.stopPropagation();
        await startTimer(task.id);
    };

    const handleCardClick = () => {
        // Drill down into this task's hierarchy
        setCurrentProject(task.id);
    };

    const handleEditClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        onEdit?.();
    };

    return (
        <Card
            shadow="sm"
            padding="lg"
            radius="md"
            withBorder
            style={{
                cursor: 'pointer',
                opacity: isDone ? 0.7 : 1,
                transition: 'all 0.2s ease',
            }}
            onClick={handleCardClick}
        >
            <Group wrap="nowrap" align="flex-start">
                {/* Checkbox */}
                <div onClick={(e) => e.stopPropagation()}>
                    <Checkbox
                        checked={isDone}
                        onChange={async (event) => {
                            event.stopPropagation();
                            const newStatus = isDone ? 'TODO' : 'DONE';
                            await updateTaskStatus(task.id, newStatus);
                        }}
                        size="lg"
                        radius="xl"
                        styles={{
                            input: {
                                cursor: 'pointer',
                            },
                        }}
                    />
                </div>

                {/* Main Content */}
                <Stack gap="sm" style={{ flex: 1 }}>
                    <Group justify="space-between" align="flex-start">
                        <Group gap={8}>
                            {/* Play Button */}
                            {!isDone && !isActive && (
                                <ActionIcon
                                    variant="light"
                                    color="green"
                                    size="sm"
                                    onClick={handlePlayClick}
                                >
                                    <Play size={14} fill="currentColor" />
                                </ActionIcon>
                            )}
                            {isActive && (
                                <ActionIcon
                                    variant="filled"
                                    color="green"
                                    size="sm"
                                >
                                    <Circle size={14} fill="currentColor" />
                                </ActionIcon>
                            )}

                            {/* Title */}
                            <Group gap="xs">
                                <Text fw={500} size="lg" td={isDone ? 'line-through' : 'none'}>
                                    {task.title}
                                </Text>
                                {/* Recurrence indicator */}
                                {task.recurrence && (
                                    <Tooltip label="繰り返しタスク">
                                        <Repeat size={16} color="var(--mantine-color-blue-6)" />
                                    </Tooltip>
                                )}
                                {/* Subtask count badge */}
                                {subtaskCount > 0 && (
                                    <Badge
                                        color="blue"
                                        variant="light"
                                        size="sm"
                                        leftSection={<Folder size={12} />}
                                    >
                                        {subtaskCount}
                                    </Badge>
                                )}
                            </Group>
                        </Group>

                        <Group gap="xs">
                            {/* Edit Button */}
                            <ActionIcon
                                variant="subtle"
                                color="gray"
                                size="sm"
                                onClick={handleEditClick}
                                title="編集"
                            >
                                <Edit size={16} />
                            </ActionIcon>

                            {/* Status Badge */}
                            {!isDone && (
                                <div onClick={(e) => e.stopPropagation()}>
                                    <Menu position="bottom-end" withinPortal>
                                        <Menu.Target>
                                            <Badge
                                                color={getStatusColor(task.status)}
                                                variant="light"
                                                style={{ cursor: 'pointer' }}
                                            >
                                                {getStatusLabel(task.status)}
                                            </Badge>
                                        </Menu.Target>
                                        <Menu.Dropdown>
                                            <Menu.Item onClick={async (e) => {
                                                e.stopPropagation();
                                                await updateTaskStatus(task.id, 'TODO');
                                            }}>
                                                未着手
                                            </Menu.Item>
                                            <Menu.Item onClick={async (e) => {
                                                e.stopPropagation();
                                                await updateTaskStatus(task.id, 'DOING');
                                            }}>
                                                進行中
                                            </Menu.Item>
                                            <Menu.Item onClick={async (e) => {
                                                e.stopPropagation();
                                                await updateTaskStatus(task.id, 'DONE');
                                            }}>
                                                完了
                                            </Menu.Item>
                                            <Menu.Item onClick={async (e) => {
                                                e.stopPropagation();
                                                await updateTaskStatus(task.id, 'PENDING');
                                            }}>
                                                保留
                                            </Menu.Item>
                                        </Menu.Dropdown>
                                    </Menu>
                                </div>
                            )}
                        </Group>
                    </Group>

                    {task.description && (
                        <Text size="sm" c="dimmed" lineClamp={2}>
                            {task.description}
                        </Text>
                    )}

                    <Group gap="md">
                        {task.estimate_minutes && (
                            <Group gap="xs">
                                <Clock size={16} />
                                <Text size="sm" c="dimmed">
                                    予定: {task.estimate_minutes}分
                                </Text>
                            </Group>
                        )}

                        {task.actual_minutes && task.actual_minutes > 0 && (
                            <Group gap="xs">
                                <Clock size={16} />
                                <Text size="sm" c="dimmed">
                                    実績: {task.actual_minutes}分
                                </Text>
                            </Group>
                        )}

                        {task.importance !== null && task.importance > 0 && (
                            <Group gap="xs">
                                <AlertCircle size={16} />
                                <Text size="sm" c="dimmed">
                                    重要度: {task.importance}
                                </Text>
                            </Group>
                        )}
                    </Group>

                    {task.deadline && (
                        <Text size="xs" c="dimmed">
                            期限: {new Date(task.deadline).toLocaleDateString('ja-JP')}
                        </Text>
                    )}
                </Stack>
            </Group>
        </Card>
    );
}
