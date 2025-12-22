import { useState } from 'react';
import {
    Box, TextInput, Text, Badge, Checkbox,
    Drawer, Stack, Group, Button, Textarea,
    Select, MultiSelect, ActionIcon, Table, ScrollArea
} from '@mantine/core';
import { DatePickerInput } from '@mantine/dates';
import { Search, Calendar, Filter } from 'lucide-react';
import dayjs from 'dayjs';

// --- Types ---
interface TaskNode {
    id: string;
    title: string;
    description?: string;
    status: 'TODO' | 'DOING' | 'DONE';
    importance: 'high' | 'medium' | 'low';
    deadline?: Date | null;
    startDate?: Date | null;
    project?: string;
    tags?: string[];
    dependencies: string[];
}

// --- Mock Data ---
const mockTasks: TaskNode[] = [
    {
        id: '1',
        title: '要件定義書の作成とレビュー',
        description: 'クライアントとのミーティングを含み、最終合意を得る',
        status: 'DONE',
        importance: 'high',
        deadline: new Date('2025-12-20'),
        project: 'Project Alpha',
        tags: ['Document', 'Meeting'],
        dependencies: []
    },
    {
        id: '2',
        title: 'UIデザインプロトタイプ作成',
        description: 'Figmaを使用して画面遷移図とコンポーネントを作成',
        status: 'DOING',
        importance: 'medium',
        deadline: new Date('2025-12-22'),
        project: 'Project Alpha',
        tags: ['Design', 'UI/UX'],
        dependencies: ['1']
    },
    {
        id: '3',
        title: 'データベーススキーマ設計',
        description: 'Supabaseのテーブル定義とRLSポリシーの策定',
        status: 'TODO',
        importance: 'high',
        deadline: new Date('2025-12-23'),
        project: 'Backend',
        tags: ['DB', 'SQL'],
        dependencies: ['1']
    },
    {
        id: '4',
        title: '認証機能の実装 (OAuth)',
        description: 'Googleログインとメール認証の実装',
        status: 'TODO',
        importance: 'high',
        deadline: new Date('2025-12-24'),
        project: 'Backend',
        tags: ['Auth', 'Security'],
        dependencies: ['3']
    },
    {
        id: '5',
        title: 'メインダッシュボード実装',
        description: 'タスク一覧、カレンダー、ガントチャートの表示',
        status: 'TODO',
        importance: 'medium',
        deadline: new Date('2025-12-25'),
        project: 'Frontend',
        tags: ['React', 'Mantine'],
        dependencies: ['2']
    },
    {
        id: '6',
        title: 'モバイルレスポンシブ対応',
        description: 'スマートフォンでの表示崩れを修正',
        status: 'DOING',
        importance: 'low',
        deadline: new Date('2025-12-26'),
        project: 'Frontend',
        tags: ['CSS', 'Mobile'],
        dependencies: ['5']
    },
    {
        id: '7',
        title: 'APIエンドポイントのテスト',
        description: 'JestとSupertestを使用した結合テスト',
        status: 'TODO',
        importance: 'high',
        deadline: new Date('2025-12-27'),
        project: 'QA',
        tags: ['Test', 'CI/CD'],
        dependencies: ['4']
    },
    {
        id: '8',
        title: 'パフォーマンスチューニング',
        description: 'レンダリング最適化とクエリ改善',
        status: 'TODO',
        importance: 'medium',
        deadline: new Date('2025-12-28'),
        project: 'Optimization',
        tags: ['Performance'],
        dependencies: []
    },
    {
        id: '9',
        title: 'ユーザーマニュアル作成',
        description: '操作方法をまとめたドキュメント',
        status: 'TODO',
        importance: 'low',
        deadline: new Date('2025-12-29'),
        project: 'Documentation',
        tags: ['Doc'],
        dependencies: ['1', '2']
    },
    {
        id: '10',
        title: 'v1.0 リリース作業',
        description: '本番環境へのデプロイと最終確認',
        status: 'TODO',
        importance: 'high',
        deadline: new Date('2025-12-30'),
        project: 'Release',
        tags: ['Deploy', 'Ops'],
        dependencies: ['7', '8']
    },
];

// --- Helpers ---
const getStatusColor = (status: string) => {
    switch (status) {
        case 'TODO': return 'gray';
        case 'DOING': return 'blue';
        case 'DONE': return 'green';
        default: return 'gray';
    }
};

const getImportanceColor = (importance: string) => {
    switch (importance) {
        case 'high': return 'red';
        case 'medium': return 'yellow';
        case 'low': return 'blue';
        default: return 'gray';
    }
};

export function MobileList() {
    // --- State ---
    const [tasks, setTasks] = useState<TaskNode[]>(mockTasks);
    const [searchTerm, setSearchTerm] = useState('');

    // Drawer State
    const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
    const [editForm, setEditForm] = useState<TaskNode | null>(null);

    // Filter
    const filteredTasks = tasks.filter(t =>
        t.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        t.project?.toLowerCase().includes(searchTerm.toLowerCase())
    );

    // --- Handlers ---
    const handleTaskClick = (task: TaskNode) => {
        setEditForm({ ...task });
        setActiveTaskId(task.id);
    };

    const handleSave = () => {
        if (!editForm) return;
        setTasks(prev => prev.map(t => t.id === editForm.id ? editForm : t));
        setActiveTaskId(null);
    };

    const toggleComplete = (taskId: string, currentStatus: string) => {
        setTasks(prev => prev.map(t => {
            if (t.id === taskId) {
                return { ...t, status: currentStatus === 'DONE' ? 'TODO' : 'DONE' };
            }
            return t;
        }));
    };

    return (
        <Box style={{
            height: 'calc(100vh - 130px)',
            display: 'flex',
            flexDirection: 'column',
            backgroundColor: '#1A1B1E', // Canvas Background
        }}>
            {/* 1. Header Area (Fixed) */}
            <Box p="md" style={{ backgroundColor: '#1A1B1E', borderBottom: '1px solid #373A40', zIndex: 10 }}>
                <Group gap="xs">
                    <TextInput
                        placeholder="タスクを検索..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.currentTarget.value)}
                        leftSection={<Search size={16} />}
                        style={{ flex: 1 }}
                        styles={{
                            input: {
                                backgroundColor: '#25262B',
                                color: '#C1C2C5',
                                border: '1px solid #373A40'
                            }
                        }}
                    />
                    <ActionIcon variant="filled" color="dark" size="lg" radius="md">
                        <Filter size={20} />
                    </ActionIcon>
                </Group>
            </Box>

            {/* 2. Scrollable Table Area */}
            <ScrollArea
                style={{ flex: 1 }}
                type="auto"
                offsetScrollbars
                styles={{
                    scrollbar: {
                        borderRadius: 0,
                        '&:hover': { backgroundColor: 'transparent' },
                    },
                    thumb: { backgroundColor: '#373A40' }
                }}
            >
                <Table
                    horizontalSpacing="md"
                    verticalSpacing="sm"
                    withTableBorder={false}
                    withColumnBorders={false}
                    stickyHeader
                    highlightOnHover
                    style={{ minWidth: '800px' }} // Ensure horizontal scroll
                >
                    <Table.Thead
                        style={{
                            backgroundColor: '#1A1B1E',
                            zIndex: 5
                        }}
                    >
                        <Table.Tr style={{ backgroundColor: '#1A1B1E' }}>
                            <Table.Th style={{ width: '4px', padding: 0 }}></Table.Th>
                            <Table.Th style={{ width: '40px', color: '#909296' }}><Checkbox size="xs" color="gray" disabled checked={false} style={{ opacity: 0.5 }} /></Table.Th>
                            <Table.Th style={{ color: '#909296', minWidth: '200px' }}>タスク</Table.Th>
                            <Table.Th style={{ color: '#909296', minWidth: '80px' }}>重要度</Table.Th>
                            <Table.Th style={{ color: '#909296', minWidth: '80px' }}>ステータス</Table.Th>
                            <Table.Th style={{ color: '#909296', minWidth: '120px' }}>期限</Table.Th>
                        </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                        {filteredTasks.map((task) => {
                            const statusColor = getStatusColor(task.status);
                            const isDone = task.status === 'DONE';
                            const formattedDate = task.deadline ? dayjs(task.deadline).format('MM/DD HH:mm') : '-';

                            return (
                                <Table.Tr
                                    key={task.id}
                                    onClick={() => handleTaskClick(task)}
                                    style={{
                                        cursor: 'pointer',
                                        backgroundColor: '#1A1B1E',
                                        borderBottom: '1px solid #2C2E33',
                                        transition: 'background-color 0.2s'
                                    }}
                                >
                                    {/* 1. Color Bar */}
                                    <Table.Td style={{ padding: 0 }}>
                                        <Box
                                            style={{
                                                width: '4px',
                                                height: '40px',
                                                backgroundColor: `var(--mantine-color-${statusColor}-filled)`,
                                                borderRadius: '0 2px 2px 0'
                                            }}
                                        />
                                    </Table.Td>

                                    {/* 2. Checkbox */}
                                    <Table.Td>
                                        <Checkbox
                                            checked={isDone}
                                            onChange={() => toggleComplete(task.id, task.status)}
                                            color="green"
                                            onClick={(e) => e.stopPropagation()}
                                        />
                                    </Table.Td>

                                    {/* 3. Task Title */}
                                    <Table.Td>
                                        <Text
                                            c="#C1C2C5"
                                            fw={500}
                                            size="sm"
                                            lineClamp={2}
                                            td={isDone ? 'line-through' : undefined}
                                        >
                                            {task.title}
                                        </Text>
                                    </Table.Td>

                                    {/* 4. Importance */}
                                    <Table.Td>
                                        <Badge
                                            color={getImportanceColor(task.importance)}
                                            variant="light"
                                            size="sm"
                                        >
                                            {task.importance.toUpperCase()}
                                        </Badge>
                                    </Table.Td>

                                    {/* 5. Status */}
                                    <Table.Td>
                                        <Badge
                                            color={getStatusColor(task.status)}
                                            variant="outline"
                                            size="sm"
                                        >
                                            {task.status}
                                        </Badge>
                                    </Table.Td>

                                    {/* 6. Deadline */}
                                    <Table.Td>
                                        <Group gap={4}>
                                            <Calendar size={14} color="#5c5f66" />
                                            <Text size="sm" c="dimmed">
                                                {formattedDate}
                                            </Text>
                                        </Group>
                                    </Table.Td>
                                </Table.Tr>
                            );
                        })}
                    </Table.Tbody>
                </Table>
            </ScrollArea>

            {/* Edit Drawer (Same as MobileFlow) */}
            <Drawer
                opened={!!activeTaskId}
                onClose={() => setActiveTaskId(null)}
                position="bottom"
                size="90%"
                title={<Text fw={700}>タスク編集</Text>}
                padding="md"
                zIndex={2000}
            >
                {editForm && (
                    <Stack gap="md" pb={50}>
                        <TextInput
                            label="タイトル"
                            value={editForm.title}
                            onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                        />

                        <Textarea
                            label="詳細"
                            value={editForm.description || ''}
                            onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                            minRows={2}
                        />

                        <Group grow>
                            <Select
                                label="ステータス"
                                value={editForm.status}
                                onChange={(val) => val && setEditForm({ ...editForm, status: val as any })}
                                data={['TODO', 'DOING', 'DONE']}
                            />
                            <Select
                                label="重要度"
                                value={editForm.importance}
                                onChange={(val) => val && setEditForm({ ...editForm, importance: val as any })}
                                data={['high', 'medium', 'low']}
                            />
                        </Group>

                        <TextInput
                            label="プロジェクト"
                            value={editForm.project || ''}
                            onChange={(e) => setEditForm({ ...editForm, project: e.target.value })}
                        />

                        <DatePickerInput
                            label="期限"
                            value={editForm.deadline}
                            onChange={(date) => setEditForm({ ...editForm, deadline: date })}
                            leftSection={<Calendar size={16} />}
                            clearable
                        />

                        <MultiSelect
                            label="依存タスク"
                            data={tasks
                                .filter(t => t.id !== editForm.id)
                                .map(t => ({ value: t.id, label: t.title }))
                            }
                            value={editForm.dependencies}
                            onChange={(vals) => setEditForm({ ...editForm, dependencies: vals })}
                            searchable
                        />

                        <Button fullWidth onClick={handleSave} mt="md">
                            保存する
                        </Button>
                    </Stack>
                )}
            </Drawer>
        </Box>
    );
}
