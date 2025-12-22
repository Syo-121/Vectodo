import { useState, useMemo, useRef } from 'react';
import {
    Paper, Text, Badge, Group, Stack, Box, Drawer,
    TextInput, Textarea, Select, MultiSelect, Button, Slider
} from '@mantine/core';
import { DatePickerInput } from '@mantine/dates';
import { Calendar } from 'lucide-react';
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
    estimate_minutes?: number | null;
    dependencies: string[];
}

interface LayoutNode {
    task: TaskNode;
    x: number;
    y: number;
    width: number;
    height: number;
    level: number;
}

// --- Mock Data ---

const initialTasks: TaskNode[] = [
    // Level 0
    {
        id: 'root',
        title: 'Project Alpha Kickoff',
        description: 'プロジェクトの全体像を確認し、チームのアサインを完了する',
        status: 'DONE',
        importance: 'high',
        deadline: new Date('2025-11-01T10:00:00'),
        dependencies: [],
    },
    // Level 1
    {
        id: 'req_def',
        title: '要件定義完了',
        description: 'クライアント要望をドキュメント化',
        status: 'DONE',
        importance: 'high',
        deadline: new Date('2025-11-05T18:00:00'),
        dependencies: ['root'],
    },
    {
        id: 'market_res',
        title: '市場調査',
        description: '競合アプリの分析と差別化ポイントの明確化',
        status: 'DONE',
        importance: 'medium',
        deadline: new Date('2025-11-04T18:00:00'),
        dependencies: ['root'],
    },
    // Level 2 (Wide - Branching)
    {
        id: 'design_ui',
        title: 'UI/UXデザイン',
        description: 'Figmaでプロトタイプ作成',
        status: 'DONE',
        importance: 'high',
        deadline: new Date('2025-11-15T18:00:00'),
        dependencies: ['req_def'],
    },
    {
        id: 'design_db',
        title: 'DBスキーマ設計',
        description: 'ER図の作成と正規化',
        status: 'DONE',
        importance: 'high',
        deadline: new Date('2025-11-12T18:00:00'),
        dependencies: ['req_def'],
    },
    {
        id: 'tech_select',
        title: '技術選定',
        description: 'フレームワークとインフラ構成の決定',
        status: 'DONE',
        importance: 'medium',
        deadline: new Date('2025-11-10T18:00:00'),
        dependencies: ['req_def'],
    },
    // Level 3 (Wider - Testing Horizontal Scroll)
    {
        id: 'impl_fe_1',
        title: 'FE: 認証機能',
        description: 'ログイン、サインアップ、パスワードリセット',
        status: 'DOING',
        importance: 'high',
        deadline: new Date('2025-11-20T18:00:00'),
        dependencies: ['design_ui', 'tech_select'],
    },
    {
        id: 'impl_fe_2',
        title: 'FE: ダッシュボード',
        description: 'メイン画面の実装',
        status: 'TODO',
        importance: 'medium',
        deadline: new Date('2025-11-25T18:00:00'),
        dependencies: ['design_ui'],
    },
    {
        id: 'impl_be_1',
        title: 'BE: API実装 Phase 1',
        description: 'ユーザーCRUDと認証API',
        status: 'DOING',
        importance: 'high',
        deadline: new Date('2025-11-18T18:00:00'),
        dependencies: ['design_db', 'tech_select'],
    },
    {
        id: 'impl_infra',
        title: 'AWS環境構築',
        description: 'VPC, ECS, RDSのTerraform化',
        status: 'DOING',
        importance: 'high',
        deadline: new Date('2025-11-15T18:00:00'),
        dependencies: ['tech_select'],
    },
    // Level 4 (Merging)
    {
        id: 'test_integ',
        title: '結合テスト',
        description: 'FEとBEを繋ぎこんで動作確認',
        status: 'TODO',
        importance: 'high',
        deadline: new Date('2025-12-05T18:00:00'),
        dependencies: ['impl_fe_1', 'impl_fe_2', 'impl_be_1', 'impl_infra'],
    },
    // Level 5
    {
        id: 'release',
        title: 'v1.0 リリース',
        description: '本番環境へのデプロイ',
        status: 'TODO',
        importance: 'high',
        deadline: new Date('2025-12-10T18:00:00'),
        dependencies: ['test_integ'],
    },
];

// --- Constants ---

const CARD_WIDTH = 150;
const CARD_HEIGHT = 90; // 少し高さを確保
const GAP_X = 30;
const GAP_Y = 80;
const PADDING = 50;

// --- Helper Components & Functions ---

const getStatusColor = (status: string) => {
    switch (status) {
        case 'TODO': return 'gray';
        case 'DOING': return 'blue';
        case 'DONE': return 'green';
        default: return 'gray';
    }
};



export function MobileFlow() {
    // --- State ---
    const [tasks, setTasks] = useState<TaskNode[]>(initialTasks);

    // Canvas State
    const [offset, setOffset] = useState({ x: 0, y: 0 });
    const [scale, setScale] = useState(0.8); // Initial scale check
    const [isDragging, setIsDragging] = useState(false);
    const dragStartRef = useRef<{ x: number, y: number } | null>(null);
    const lastOffsetRef = useRef<{ x: number, y: number }>({ x: 0, y: 0 });
    const hasMovedRef = useRef(false);

    // Drawer State
    const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
    const [editForm, setEditForm] = useState<TaskNode | null>(null);

    // --- Layout Calculation ---
    const layout = useMemo(() => {
        const nodeMap = new Map<string, TaskNode>();
        tasks.forEach(t => nodeMap.set(t.id, t));

        // Calculate levels
        const levels = new Map<string, number>();
        const calcLevel = (id: string, visited = new Set<string>()): number => {
            if (visited.has(id)) return 0; // Cycle detection
            if (levels.has(id)) return levels.get(id)!;

            visited.add(id);
            const task = nodeMap.get(id);
            if (!task || task.dependencies.length === 0) {
                levels.set(id, 0);
                return 0;
            }

            const maxParentLevel = Math.max(...task.dependencies.map(dep => calcLevel(dep, visited)));
            const level = maxParentLevel + 1;
            levels.set(id, level);
            return level;
        };

        tasks.forEach(t => calcLevel(t.id));

        // Group by level
        const nodesByLevel: Record<number, TaskNode[]> = {};
        let maxLevel = 0;
        tasks.forEach(t => {
            const lvl = levels.get(t.id) || 0;
            if (!nodesByLevel[lvl]) nodesByLevel[lvl] = [];
            nodesByLevel[lvl].push(t);
            maxLevel = Math.max(maxLevel, lvl);
        });

        // Calculate maximum width for centering
        let maxRowWidth = 0;
        const levelWidths: Record<number, number> = {};
        Object.keys(nodesByLevel).forEach(lvlStr => {
            const lvl = Number(lvlStr);
            const count = nodesByLevel[lvl].length;
            const width = count * CARD_WIDTH + (count - 1) * GAP_X;
            levelWidths[lvl] = width;
            maxRowWidth = Math.max(maxRowWidth, width);
        });

        // Create Layout Nodes
        const layoutNodes: LayoutNode[] = [];
        const edges: { from: LayoutNode, to: LayoutNode }[] = [];
        const nodePositionMap = new Map<string, LayoutNode>();

        Object.keys(nodesByLevel).forEach(lvlStr => {
            const lvl = Number(lvlStr);
            const rowNodes = nodesByLevel[lvl];
            const rowWidth = levelWidths[lvl];
            const startX = (maxRowWidth - rowWidth) / 2;

            rowNodes.forEach((task, index) => {
                const x = startX + index * (CARD_WIDTH + GAP_X) + PADDING;
                const y = lvl * (CARD_HEIGHT + GAP_Y) + PADDING;

                const lNode: LayoutNode = {
                    task,
                    x,
                    y,
                    width: CARD_WIDTH,
                    height: CARD_HEIGHT,
                    level: lvl
                };
                layoutNodes.push(lNode);
                nodePositionMap.set(task.id, lNode);
            });
        });

        // Create Edges
        layoutNodes.forEach(node => {
            node.task.dependencies.forEach(depId => {
                const parent = nodePositionMap.get(depId);
                if (parent) {
                    edges.push({ from: parent, to: node });
                }
            });
        });

        return { nodes: layoutNodes, edges, width: maxRowWidth + PADDING * 2, height: (maxLevel + 1) * (CARD_HEIGHT + GAP_Y) + PADDING * 2 };
    }, [tasks]);

    // --- Event Handlers ---

    const handlePointerDown = (e: React.PointerEvent) => {
        setIsDragging(true);
        dragStartRef.current = { x: e.clientX, y: e.clientY };
        lastOffsetRef.current = { ...offset };
        hasMovedRef.current = false;
        e.currentTarget.setPointerCapture(e.pointerId);
    };

    const handlePointerMove = (e: React.PointerEvent) => {
        if (!isDragging || !dragStartRef.current) return;

        const dx = e.clientX - dragStartRef.current.x;
        const dy = e.clientY - dragStartRef.current.y;

        if (Math.abs(dx) > 5 || Math.abs(dy) > 5) {
            hasMovedRef.current = true;
        }

        setOffset({
            x: lastOffsetRef.current.x + dx,
            y: lastOffsetRef.current.y + dy
        });
    };

    const handlePointerUp = (e: React.PointerEvent) => {
        setIsDragging(false);
        dragStartRef.current = null;
        e.currentTarget.releasePointerCapture(e.pointerId);
    };

    const handleCardClick = (task: TaskNode) => {
        if (hasMovedRef.current) return; // Prevent click after drag
        setEditForm({ ...task }); // Clone for editing
        setActiveTaskId(task.id);
    };

    const handleSave = () => {
        if (!editForm) return;
        setTasks(prev => prev.map(t => t.id === editForm.id ? editForm : t));
        setActiveTaskId(null);
    };

    // --- Drawing Helpers ---

    const createPath = (from: LayoutNode, to: LayoutNode) => {
        const fromX = from.x + from.width / 2;
        const fromY = from.y + from.height;
        const toX = to.x + to.width / 2;
        const toY = to.y;

        const midY = (fromY + toY) / 2;
        // Bezier curve
        return `M ${fromX} ${fromY} C ${fromX} ${midY}, ${toX} ${midY}, ${toX} ${toY}`;
    };

    return (
        <Box
            style={{
                width: '100%',
                height: 'calc(100vh - 130px)', // Header 60px + Footer 70px
                overflow: 'hidden',
                position: 'relative',
                backgroundColor: '#1A1B1E', // Dark 7
                cursor: isDragging ? 'grabbing' : 'grab',
                userSelect: 'none',
                touchAction: 'none' // Prevent default touch actions like scroll
            }}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerLeave={handlePointerUp} // Safety net
            onWheel={(e) => {
                if (e.ctrlKey || e.metaKey) {
                    e.preventDefault();
                    const newScale = Math.min(Math.max(scale - e.deltaY * 0.001, 0.1), 2);
                    setScale(newScale);
                }
            }}
        >
            {/* Background Grid Pattern */}
            <div
                style={{
                    position: 'absolute',
                    inset: 0,
                    backgroundImage: 'radial-gradient(rgba(255, 255, 255, 0.05) 1px, transparent 1px)',
                    backgroundSize: `${20 * scale}px ${20 * scale}px`,
                    backgroundPosition: `${offset.x}px ${offset.y}px`,
                    pointerEvents: 'none'
                }}
            />

            {/* Content Container */}
            <div style={{
                transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
                transformOrigin: '0 0',
                width: '100%',
                height: '100%'
            }}>

                {/* SVG Layer */}
                <svg
                    style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        width: Math.max(layout.width, 2000), // Ensure large enough
                        height: Math.max(layout.height, 2000),
                        pointerEvents: 'none',
                        zIndex: 1
                    }}
                >
                    <defs>
                        <marker
                            id="flow-arrow"
                            markerWidth="10"
                            markerHeight="7"
                            refX="9"
                            refY="3.5"
                            orient="auto"
                        >
                            <polygon points="0 0, 10 3.5, 0 7" fill="#adb5bd" />
                        </marker>
                    </defs>
                    {layout.edges.map((edge, i) => (
                        <path
                            key={i}
                            d={createPath(edge.from, edge.to)}
                            stroke="#adb5bd"
                            strokeWidth="2"
                            fill="none"
                            markerEnd="url(#flow-arrow)"
                        />
                    ))}
                </svg>

                {/* Nodes Layer */}
                {layout.nodes.map(node => {
                    const statusColor = getStatusColor(node.task.status);
                    const deadlineText = node.task.deadline ? dayjs(node.task.deadline).format('M/D') : null;
                    const isOverdue = node.task.deadline && dayjs().isAfter(node.task.deadline);

                    return (
                        <Paper
                            key={node.task.id}
                            shadow="sm"
                            withBorder
                            p="xs"
                            radius="md"
                            onClick={(e) => {
                                e.stopPropagation(); // Prevent drag start logic if needed, but here we handled via hasMoved
                                handleCardClick(node.task);
                            }}
                            style={{
                                position: 'absolute',
                                left: node.x,
                                top: node.y,
                                width: node.width,
                                height: node.height,
                                borderLeft: `5px solid var(--mantine-color-${statusColor}-filled)`,
                                zIndex: 10,
                                cursor: 'pointer',
                                transition: 'transform 0.1s, box-shadow 0.1s',
                                backgroundColor: '#25262B', // Dark 6
                                color: '#C1C2C5',
                            }}
                        >
                            <Stack gap={4} h="100%" justify="space-between">
                                <Text size="xs" fw={700} lineClamp={2} lh={1.3} c="#C1C2C5">
                                    {node.task.title}
                                </Text>

                                <Group justify="space-between" align="end" gap={0}>
                                    <Badge
                                        color={getStatusColor(node.task.status)}
                                        variant="light"
                                        size="xs"
                                        radius="sm"
                                        px={4}
                                        h={18}
                                        style={{ fontSize: '10px' }}
                                    >
                                        {node.task.status}
                                    </Badge>

                                    {deadlineText && (
                                        <Group gap={2}>
                                            <Calendar size={10} color={isOverdue ? 'red' : 'gray'} />
                                            <Text size="xs" c={isOverdue ? 'red' : 'dimmed'} style={{ fontSize: '10px' }} fw={700}>
                                                {deadlineText}
                                            </Text>
                                        </Group>
                                    )}
                                </Group>
                            </Stack>
                        </Paper>
                    );
                })}
            </div>

            {/* Zoom Control */}
            <Paper
                shadow="md"
                p="xs"
                style={{
                    position: 'absolute',
                    bottom: 20,
                    left: 20,
                    zIndex: 100,
                    width: 150,
                    opacity: 0.9,
                    backgroundColor: '#25262B',
                    color: '#C1C2C5',
                    border: '1px solid #373A40'
                }}
            >
                <Text size="xs" mb={4} fw={500} c="#C1C2C5">Zoom: {Math.round(scale * 100)}%</Text>
                <Slider
                    value={scale}
                    onChange={setScale}
                    min={0.1}
                    max={1.5}
                    step={0.1}
                    size="sm"
                    label={null}
                />
            </Paper>

            {/* Edit Drawer */}
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
                            placeholder="タスク名を入力"
                            value={editForm.title}
                            onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                            required
                        />

                        <Textarea
                            label="詳細"
                            placeholder="詳細説明..."
                            value={editForm.description || ''}
                            onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                            minRows={2}
                        />

                        <Group grow>
                            <Select
                                label="ステータス"
                                value={editForm.status}
                                onChange={(val) => val && setEditForm({ ...editForm, status: val as any })}
                                data={[
                                    { value: 'TODO', label: 'TODO' },
                                    { value: 'DOING', label: 'DOING' },
                                    { value: 'DONE', label: 'DONE' },
                                ]}
                            />
                            <Select
                                label="重要度"
                                value={editForm.importance}
                                onChange={(val) => val && setEditForm({ ...editForm, importance: val as any })}
                                data={[
                                    { value: 'high', label: '高' },
                                    { value: 'medium', label: '中' },
                                    { value: 'low', label: '低' },
                                ]}
                            />
                        </Group>

                        <DatePickerInput
                            label="期限"
                            placeholder="日付を選択"
                            value={editForm.deadline || null}
                            onChange={(date) => setEditForm({ ...editForm, deadline: date })}
                            leftSection={<Calendar size={16} />}
                            clearable
                        />

                        <MultiSelect
                            label="前提タスク (依存関係)"
                            placeholder="依存するタスクを選択"
                            data={tasks
                                .filter(t => t.id !== editForm.id) // Exclude self
                                .map(t => ({ value: t.id, label: t.title }))
                            }
                            value={editForm.dependencies}
                            onChange={(vals) => setEditForm({ ...editForm, dependencies: vals })}
                            searchable
                            clearable
                        />

                        <Button fullWidth onClick={handleSave} mt="md" size="md">
                            保存する
                        </Button>
                    </Stack>
                )}
            </Drawer>
        </Box>
    );
}
