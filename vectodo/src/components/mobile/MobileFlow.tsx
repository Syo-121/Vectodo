import { useMemo } from 'react';
import { Paper, Text, Badge, Group, Stack, Box, ScrollArea } from '@mantine/core';
import { Calendar, AlertCircle, Repeat } from 'lucide-react';
import dayjs from 'dayjs';

interface TaskNode {
    id: string;
    title: string;
    status: 'TODO' | 'DOING' | 'DONE';
    importance?: number | null;
    deadline?: string | null;
    estimate_minutes?: number | null;
    recurrence?: boolean;
    dependencies: string[];
}

interface LayoutNode {
    task: TaskNode;
    x: number;
    y: number;
    width: number;
    height: number;
}

// Mock data with complex dependencies for scrolling test
const mockTasks: TaskNode[] = [
    {
        id: 'A',
        title: 'タスクA：要件定義',
        status: 'DONE',
        importance: 80,
        deadline: '2025-12-20T23:59:00',
        estimate_minutes: 120,
        dependencies: [], // Root
    },
    {
        id: 'B1',
        title: 'B1：UIデザイン',
        status: 'DONE',
        importance: 70,
        deadline: '2025-12-21T23:59:00',
        estimate_minutes: 180,
        dependencies: ['A'],
    },
    {
        id: 'B2',
        title: 'B2：DB設計',
        status: 'DOING',
        importance: 90,
        deadline: '2025-12-21T23:59:00',
        estimate_minutes: 120,
        dependencies: ['A'],
    },
    {
        id: 'B3',
        title: 'B3：API仕様策定',
        status: 'TODO',
        importance: 60,
        deadline: '2025-12-22T23:59:00',
        estimate_minutes: 90,
        dependencies: ['A'],
    },
    {
        id: 'B4',
        title: 'B4：環境構築',
        status: 'TODO',
        importance: 50,
        deadline: '2025-12-22T23:59:00',
        dependencies: ['A'],
    },
    {
        id: 'C',
        title: '実装フェーズ',
        status: 'TODO',
        importance: 90,
        deadline: '2025-12-25T23:59:00',
        estimate_minutes: 600,
        dependencies: ['B1', 'B2', 'B3', 'B4'], // Merges all
    },
];

export function MobileFlow() {
    // Configuration constants
    const CARD_WIDTH = 170;
    const CARD_HEIGHT = 80;
    const GAP_X = 16;       // Horizontal space between cards
    const GAP_Y = 60;       // Vertical space between levels
    const PADDING_X = 20;   // Container padding

    const layoutData = useMemo(() => {
        // 1. Calculate Levels (Depth)
        const levels: Record<string, number> = {};

        const calculateLevel = (taskId: string): number => {
            if (taskId in levels) return levels[taskId];

            const task = mockTasks.find(t => t.id === taskId);
            if (!task || task.dependencies.length === 0) {
                levels[taskId] = 0;
                return 0;
            }

            const maxParentLevel = Math.max(
                ...task.dependencies.map(depId => calculateLevel(depId))
            );
            levels[taskId] = maxParentLevel + 1;
            return levels[taskId];
        };

        mockTasks.forEach(task => calculateLevel(task.id));

        // 2. Group by Level
        const tasksByLevel: Record<number, TaskNode[]> = {};
        let maxLevel = 0;
        mockTasks.forEach(task => {
            const level = levels[task.id];
            if (!tasksByLevel[level]) tasksByLevel[level] = [];
            tasksByLevel[level].push(task);
            maxLevel = Math.max(maxLevel, level);
        });

        // 3. Calculate Layout Coordinates
        // We need to determine the maximum width of the graph to center everything
        let maxRowWidth = 0;
        const levelWidths: Record<number, number> = {};

        Object.keys(tasksByLevel).forEach(levelStr => {
            const level = parseInt(levelStr);
            const count = tasksByLevel[level].length;
            const rowWidth = count * CARD_WIDTH + (count - 1) * GAP_X;
            levelWidths[level] = rowWidth;
            maxRowWidth = Math.max(maxRowWidth, rowWidth);
        });

        const containerWidth = Math.max(320, maxRowWidth + PADDING_X * 2);

        const nodes: LayoutNode[] = [];
        const levelY: Record<number, number> = {};

        Object.keys(tasksByLevel).forEach(levelStr => {
            const level = parseInt(levelStr);
            const tasksInLevel = tasksByLevel[level];
            const rowWidth = levelWidths[level];

            // Center the row
            const startX = (containerWidth - rowWidth) / 2;
            const y = PADDING_X + level * (CARD_HEIGHT + GAP_Y);
            levelY[level] = y;

            tasksInLevel.forEach((task, index) => {
                const x = startX + index * (CARD_WIDTH + GAP_X);
                nodes.push({
                    task,
                    x,
                    y,
                    width: CARD_WIDTH,
                    height: CARD_HEIGHT,
                });
            });
        });

        const totalHeight = (maxLevel + 1) * (CARD_HEIGHT + GAP_Y) + PADDING_X * 2;

        // 4. Calculate Edges
        const edges: Array<{ from: LayoutNode; to: LayoutNode }> = [];
        nodes.forEach(node => {
            node.task.dependencies.forEach(depId => {
                const fromNode = nodes.find(n => n.task.id === depId);
                if (fromNode) {
                    edges.push({ from: fromNode, to: node });
                }
            });
        });

        return { nodes, edges, containerWidth, totalHeight };
    }, []);

    const getStatusConfig = (status: string) => {
        switch (status) {
            case 'TODO': return { label: 'TODO', color: 'gray' };
            case 'DOING': return { label: 'DOING', color: 'blue' };
            case 'DONE': return { label: 'DONE', color: 'green' };
            default: return { label: 'TODO', color: 'gray' };
        }
    };

    const getEstimateText = (minutes: number | null | undefined) => {
        if (!minutes) return null;
        if (minutes < 60) return { val: minutes, unit: 'm' };
        return { val: Math.round(minutes / 60 * 10) / 10, unit: 'h' };
    };

    const createBezierPath = (from: LayoutNode, to: LayoutNode) => {
        const fromX = from.x + from.width / 2;
        const fromY = from.y + from.height; // Bottom of source
        const toX = to.x + to.width / 2;
        const toY = to.y; // Top of target

        const midY = (fromY + toY) / 2;
        // Adjust control points for smoother curves
        return `M ${fromX} ${fromY} C ${fromX} ${midY}, ${toX} ${midY}, ${toX} ${toY}`;
    };

    return (
        <ScrollArea
            type="auto"
            style={{
                width: '100%',
                height: '100%',
                backgroundColor: 'var(--mantine-color-body)',
            }}
        >
            <Box
                style={{
                    position: 'relative',
                    width: `${layoutData.containerWidth}px`,
                    height: `${layoutData.totalHeight}px`,
                }}
            >
                {/* 1. Edges Layer (Bottom) */}
                <svg
                    style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        width: '100%',
                        height: '100%',
                        pointerEvents: 'none',
                        zIndex: 1,
                    }}
                >
                    <defs>
                        <marker
                            id="arrowhead-flow"
                            markerWidth="10"
                            markerHeight="7"
                            refX="9"
                            refY="3.5"
                            orient="auto"
                        >
                            <polygon
                                points="0 0, 10 3.5, 0 7"
                                fill="var(--mantine-color-gray-4)"
                            />
                        </marker>
                    </defs>
                    {layoutData.edges.map((edge, i) => (
                        <path
                            key={`edge-${i}`}
                            d={createBezierPath(edge.from, edge.to)}
                            stroke="var(--mantine-color-gray-4)"
                            strokeWidth="2"
                            fill="none"
                            markerEnd="url(#arrowhead-flow)"
                        />
                    ))}
                </svg>

                {/* 2. Nodes Layer (Top) */}
                {layoutData.nodes.map(({ task, x, y, width, height }) => {
                    const statusConfig = getStatusConfig(task.status);
                    const deadline = task.deadline ? dayjs(task.deadline) : null;
                    const isOverdue = deadline ? deadline.isBefore(dayjs(), 'day') : false;
                    const deadlineText = deadline ? deadline.format('M/D') : null;
                    const estimate = getEstimateText(task.estimate_minutes);

                    return (
                        <Paper
                            key={task.id}
                            shadow="sm"
                            withBorder
                            p="xs"
                            radius="md"
                            style={{
                                position: 'absolute',
                                left: `${x}px`,
                                top: `${y}px`,
                                width: `${width}px`,
                                height: `${height}px`, // Fixed height for consistency
                                borderLeft: `5px solid var(--mantine-color-${statusConfig.color}-filled)`,
                                zIndex: 10,
                                backgroundColor: 'var(--mantine-color-paper)',
                            }}
                        >
                            <Stack gap={4} justify="space-between" h="100%">
                                {/* Top Row: Title */}
                                <Text
                                    size="xs"
                                    fw={700}
                                    lineClamp={2}
                                    lh={1.2}
                                    title={task.title}
                                >
                                    {task.title}
                                </Text>

                                {/* Bottom Row: Meta Info */}
                                <Group justify="space-between" align="end" gap={4} wrap="nowrap">
                                    <Group gap={4}>
                                        <Badge
                                            size="xs"
                                            radius="sm"
                                            color={statusConfig.color}
                                            variant="light"
                                            px={4}
                                            style={{ textTransform: 'none', fontSize: '10px', height: '18px' }}
                                        >
                                            {statusConfig.label}
                                        </Badge>

                                        {deadlineText && (
                                            <Group gap={2}>
                                                <Calendar size={10} color={isOverdue ? 'var(--mantine-color-red-6)' : 'var(--mantine-color-dimmed)'} />
                                                <Text
                                                    size="xs"
                                                    c={isOverdue ? 'red' : 'dimmed'}
                                                    fw={isOverdue ? 700 : 500}
                                                    style={{ fontSize: '10px' }}
                                                >
                                                    {deadlineText}
                                                </Text>
                                            </Group>
                                        )}
                                    </Group>

                                    {estimate && (
                                        <Text
                                            size="sm"
                                            fw={700}
                                            style={{ lineHeight: 1 }}
                                            c="dimmed"
                                        >
                                            {estimate.val}
                                            <Text span size="xs" fw={500} style={{ fontSize: '9px' }}>
                                                {estimate.unit}
                                            </Text>
                                        </Text>
                                    )}
                                </Group>
                            </Stack>
                        </Paper>
                    );
                })}
            </Box>
        </ScrollArea>
    );
}
