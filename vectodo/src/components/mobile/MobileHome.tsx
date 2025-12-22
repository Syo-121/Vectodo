import { useState } from 'react';
import { Stack, Text, Group, Badge, Checkbox, Card, Switch, Alert, Box } from '@mantine/core';
import { AlertCircle, PartyPopper, Clock } from 'lucide-react';

interface MockTask {
    id: string;
    title: string;
    deadline: string;
    importance: 'high' | 'medium' | 'low' | null;
    completed: boolean;
    scheduledStart?: string;
    scheduledEnd?: string;
}

const mockTasks: MockTask[] = [
    // 期限切れ
    {
        id: '1',
        title: '緊急レポート提出',
        deadline: '2025-12-21T23:59:00',
        importance: 'high',
        completed: false,
    },
    // 今日の未完了
    {
        id: '2',
        title: 'チーム会議の準備',
        deadline: '2025-12-22T14:00:00',
        importance: 'high',
        completed: false,
        scheduledStart: '2025-12-22T13:00:00',
        scheduledEnd: '2025-12-22T14:00:00',
    },
    {
        id: '3',
        title: 'メールチェック',
        deadline: '2025-12-22T18:00:00',
        importance: 'low',
        completed: false,
    },
    // 今日の完了済み
    {
        id: '4',
        title: '朝のストレッチ',
        deadline: '2025-12-22T10:00:00',
        importance: 'medium',
        completed: true,
    },
    // 明日
    {
        id: '5',
        title: 'プロジェクト資料作成',
        deadline: '2025-12-23T17:00:00',
        importance: 'medium',
        completed: false,
    },
];

export function MobileHome() {
    const [showCompleted, setShowCompleted] = useState(false);
    const [tasks, setTasks] = useState<MockTask[]>(mockTasks);

    const handleTaskToggle = (taskId: string) => {
        setTasks(prev =>
            prev.map(task =>
                task.id === taskId ? { ...task, completed: !task.completed } : task
            )
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

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const dayAfterTomorrow = new Date(tomorrow);
    dayAfterTomorrow.setDate(dayAfterTomorrow.getDate() + 1);

    const filterTasks = (tasks: MockTask[]) => {
        return showCompleted ? tasks : tasks.filter(t => !t.completed);
    };

    const overdueTasks = filterTasks(
        tasks.filter(t => new Date(t.deadline) < today)
    );
    const todayTasks = filterTasks(
        tasks.filter(t => {
            const deadline = new Date(t.deadline);
            return deadline >= today && deadline < tomorrow;
        })
    );
    const tomorrowTasks = filterTasks(
        tasks.filter(t => {
            const deadline = new Date(t.deadline);
            return deadline >= tomorrow && deadline < dayAfterTomorrow;
        })
    );

    const remainingTodayCount = todayTasks.filter(t => !t.completed).length;

    const getPriorityColor = (importance: 'high' | 'medium' | 'low' | null) => {
        switch (importance) {
            case 'high':
                return 'red';
            case 'medium':
                return 'yellow';
            case 'low':
                return 'blue';
            default:
                return 'gray';
        }
    };

    const getPriorityLabel = (importance: 'high' | 'medium' | 'low' | null) => {
        switch (importance) {
            case 'high':
                return '高';
            case 'medium':
                return '中';
            case 'low':
                return '低';
            default:
                return null;
        }
    };

    const formatTime = (dateString: string) => {
        return new Date(dateString).toLocaleTimeString('ja-JP', {
            hour: '2-digit',
            minute: '2-digit',
        });
    };

    const TaskCard = ({ task }: { task: MockTask }) => (
        <Card
            shadow="sm"
            padding="sm"
            radius="md"
            withBorder
            style={{
                opacity: task.completed ? 0.6 : 1,
                transition: 'opacity 0.2s',
            }}
        >
            <Group align="flex-start" wrap="nowrap">
                <Checkbox
                    checked={task.completed}
                    onChange={() => handleTaskToggle(task.id)}
                    size="md"
                    style={{ marginTop: 2 }}
                />
                <Stack gap={4} style={{ flex: 1 }}>
                    <Text
                        size="sm"
                        fw={500}
                        style={{
                            textDecoration: task.completed ? 'line-through' : 'none',
                            color: task.completed ? 'var(--mantine-color-dimmed)' : undefined,
                        }}
                    >
                        {task.title}
                    </Text>
                    <Group gap="xs">
                        {task.scheduledStart && task.scheduledEnd && (
                            <Badge
                                size="xs"
                                variant="light"
                                color="cyan"
                                leftSection={<Clock size={10} />}
                            >
                                {formatTime(task.scheduledStart)} - {formatTime(task.scheduledEnd)}
                            </Badge>
                        )}
                        {task.importance && (
                            <Badge
                                size="xs"
                                variant="light"
                                color={getPriorityColor(task.importance)}
                            >
                                {getPriorityLabel(task.importance)}
                            </Badge>
                        )}
                    </Group>
                </Stack>
            </Group>
        </Card>
    );

    return (
        <Stack gap="lg" p="md" pb={100}>
            {/* ヘッダーエリア */}
            <Box>
                <Group gap="xs" mb="xs">
                    <Clock size={20} />
                    <Text size="lg" fw={600}>
                        {getFormattedDate()}
                    </Text>
                </Group>
                <Text c="dimmed" size="sm">
                    今日の残りタスク: {remainingTodayCount}件
                </Text>
            </Box>

            {/* フィルタコントロール */}
            <Group justify="space-between" align="center">
                <Text size="lg" fw={600}>
                    今日のタスク
                </Text>
                <Switch
                    label="完了済みを表示"
                    checked={showCompleted}
                    onChange={(event) => setShowCompleted(event.currentTarget.checked)}
                    size="sm"
                />
            </Group>

            {/* 期限切れセクション */}
            {overdueTasks.length > 0 && (
                <Stack gap="sm">
                    <Alert
                        icon={<AlertCircle size={16} />}
                        title="期限切れ"
                        color="red"
                        variant="light"
                    >
                        <Stack gap="sm" mt="xs">
                            {overdueTasks.map(task => (
                                <TaskCard key={task.id} task={task} />
                            ))}
                        </Stack>
                    </Alert>
                </Stack>
            )}

            {/* 今日のタスクセクション */}
            <Stack gap="sm">
                {todayTasks.length === 0 ? (
                    <Card shadow="sm" padding="xl" radius="md" withBorder>
                        <Stack align="center" gap="md">
                            <PartyPopper size={48} strokeWidth={1.5} />
                            <Text size="lg" fw={500} ta="center">
                                今日のタスクはありません！🎉
                            </Text>
                            <Text size="sm" c="dimmed" ta="center">
                                素晴らしい！今日は予定がクリアです
                            </Text>
                        </Stack>
                    </Card>
                ) : (
                    todayTasks.map(task => <TaskCard key={task.id} task={task} />)
                )}
            </Stack>

            {/* 明日のタスクセクション */}
            {tomorrowTasks.length > 0 && (
                <Stack gap="sm" mt="md">
                    <Text size="sm" fw={500} c="dimmed">
                        明日
                    </Text>
                    {tomorrowTasks.map(task => (
                        <Box key={task.id} style={{ opacity: 0.7 }}>
                            <TaskCard task={task} />
                        </Box>
                    ))}
                </Stack>
            )}
        </Stack>
    );
}
