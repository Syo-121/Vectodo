import { useState, useMemo, useRef, useEffect } from 'react';
import {
    Paper, Text, Badge, Group, Stack, Box, ActionIcon, Center, Slider
} from '@mantine/core';
import { useTaskStore } from '../../stores/taskStore';
import { getStatusConfig, getImportanceConfig } from '../../utils/taskUtils';
import type { Tables } from '../../supabase-types';
import { IconFolder, IconPencil } from '@tabler/icons-react';

type Task = Tables<'tasks'>;

export interface MobileFlowProps {
    currentViewId: string | null;
    setCurrentViewId: (id: string | null) => void;
    onEditTask: (task: Task) => void;
}

interface LayoutNode {
    task: Task;
    x: number;
    y: number;
    width: number;
    height: number;
    level: number;
}

// --- Constants ---
const CARD_WIDTH = 150;
const CARD_HEIGHT = 100;
const GAP_X = 30;
const GAP_Y = 80;
const PADDING = 50;

export function MobileFlow({ currentViewId, setCurrentViewId, onEditTask }: MobileFlowProps) {
    // --- Store & State ---
    const {
        tasks,
        dependencies, // Fetch dependencies separately
        fetchDependencies
    } = useTaskStore();

    useEffect(() => {
        // Ensure dependencies are loaded
        fetchDependencies();
    }, [fetchDependencies]);

    // Canvas State
    const [offset, setOffset] = useState({ x: 0, y: 0 });
    const [scale, setScale] = useState(0.8);
    const [isDragging, setIsDragging] = useState(false);
    const dragStartRef = useRef<{ x: number, y: number } | null>(null);
    const lastOffsetRef = useRef<{ x: number, y: number }>({ x: 0, y: 0 });
    const hasMovedRef = useRef(false);

    // --- Derived Data (Filtered for Hierarchy) ---
    const visibleTasks = useMemo(() => {
        return tasks.filter(task => {
            if (currentViewId) return task.parent_id === currentViewId;
            return task.parent_id === null;
        });
    }, [tasks, currentViewId]);

    // Helper to find predecessors for a task
    const getPredecessors = useMemo(() => {
        // Create a map for fast lookup: successor_id -> predecessor_ids[]
        const map = new Map<string, string[]>();
        if (dependencies) {
            dependencies.forEach(d => {
                if (!map.has(d.successor_id)) map.set(d.successor_id, []);
                map.get(d.successor_id)?.push(d.predecessor_id);
            });
        }
        return (taskId: string) => map.get(taskId) || [];
    }, [dependencies]);

    // --- Layout Calculation ---
    const layout = useMemo(() => {
        if (visibleTasks.length === 0) return { nodes: [], edges: [], width: 0, height: 0 };

        const nodeMap = new Map<string, Task>();
        visibleTasks.forEach(t => nodeMap.set(t.id, t));
        const visibleIds = new Set(visibleTasks.map(t => t.id));

        // Calculate levels (Local graph only)
        const levels = new Map<string, number>();
        const calcLevel = (id: string, visited = new Set<string>()): number => {
            if (visited.has(id)) return 0; // Cycle detection
            if (levels.has(id)) return levels.get(id)!;

            visited.add(id);
            const task = nodeMap.get(id);
            if (!task) return 0;

            const preds = getPredecessors(id);
            // Only consider dependencies that are ALSO in the current view
            const localDependencies = preds.filter(depId => visibleIds.has(depId));

            if (localDependencies.length === 0) {
                levels.set(id, 0);
                return 0;
            }

            const maxParentLevel = Math.max(...localDependencies.map(dep => calcLevel(dep, visited)));
            const level = maxParentLevel + 1;
            levels.set(id, level);
            return level;
        };

        visibleTasks.forEach(t => calcLevel(t.id));

        // Group by level
        const nodesByLevel: Record<number, Task[]> = {};
        let maxLevel = 0;
        visibleTasks.forEach(t => {
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

        // Create Edges (Local graph only)
        layoutNodes.forEach(node => {
            const preds = getPredecessors(node.task.id);
            const localDependencies = preds.filter(depId => visibleIds.has(depId));

            localDependencies.forEach(depId => {
                const parent = nodePositionMap.get(depId);
                if (parent) {
                    edges.push({ from: parent, to: node });
                }
            });
        });

        return {
            nodes: layoutNodes,
            edges,
            width: maxRowWidth + PADDING * 2,
            height: (maxLevel + 1) * (CARD_HEIGHT + GAP_Y) + PADDING * 2
        };
    }, [visibleTasks, getPredecessors]);

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

    // Drill down
    const handleCardClick = (task: Task) => {
        if (hasMovedRef.current) return;
        setCurrentViewId(task.id);
    };

    const handleEditClick = (e: React.MouseEvent, task: Task) => {
        e.stopPropagation();
        onEditTask(task);
    };

    // Drawing Helpers
    const createPath = (from: LayoutNode, to: LayoutNode) => {
        const fromX = from.x + from.width / 2;
        const fromY = from.y + from.height;
        const toX = to.x + to.width / 2;
        const toY = to.y;

        const midY = (fromY + toY) / 2;
        return `M ${fromX} ${fromY} C ${fromX} ${midY}, ${toX} ${midY}, ${toX} ${toY}`;
    };

    return (
        <Box
            style={{
                width: '100%',
                height: 'calc(100vh - 130px)',
                overflow: 'hidden',
                position: 'relative',
                backgroundColor: '#1A1B1E',
                cursor: isDragging ? 'grabbing' : 'grab',
                userSelect: 'none',
                touchAction: 'none'
            }}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerLeave={handlePointerUp}
            onWheel={(e) => {
                if (e.ctrlKey || e.metaKey) {
                    e.preventDefault();
                    const newScale = Math.min(Math.max(scale - e.deltaY * 0.001, 0.1), 2);
                    setScale(newScale);
                }
            }}
        >
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

            {visibleTasks.length === 0 && (
                <Center h="100%" style={{ pointerEvents: 'none' }}>
                    <Text c="dimmed">タスクがありません</Text>
                </Center>
            )}

            <div style={{
                transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
                transformOrigin: '0 0',
                width: '100%',
                height: '100%'
            }}>
                <svg
                    style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        width: Math.max(layout.width, 2000),
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
                            fill="none"
                            stroke="#5c5f66"
                            strokeWidth="2"
                            markerEnd="url(#flow-arrow)"
                        />
                    ))}
                </svg>

                {layout.nodes.map(node => {
                    const statusConfig = getStatusConfig(node.task.status || 'todo');
                    const importanceConfig = getImportanceConfig(node.task.importance || 0);

                    return (
                        <Paper
                            key={node.task.id}
                            shadow="sm"
                            p="xs"
                            radius="md"
                            withBorder
                            onClick={() => handleCardClick(node.task)}
                            style={{
                                position: 'absolute',
                                left: node.x,
                                top: node.y,
                                width: node.width,
                                height: node.height,
                                cursor: 'pointer',
                                zIndex: 2,
                                backgroundColor: '#25262B',
                                borderColor: statusConfig.color,
                                borderWidth: '1px'
                            }}
                        >
                            <Stack gap={4} h="100%">
                                <Group wrap="nowrap" align="start" justify="space-between" gap={4}>
                                    <Group gap={4} wrap="nowrap" style={{ flex: 1, overflow: 'hidden' }}>
                                        <IconFolder size={14} color="#FAB005" style={{ flexShrink: 0 }} />
                                        <Text size="xs" fw={700} lineClamp={2} c="#C1C2C5" lh={1.2}>
                                            {node.task.title}
                                        </Text>
                                    </Group>
                                    <ActionIcon
                                        size="xs"
                                        variant="subtle"
                                        color="gray"
                                        onClick={(e) => handleEditClick(e, node.task)}
                                    >
                                        <IconPencil size={12} />
                                    </ActionIcon>
                                </Group>

                                <Group gap={4} mt="auto">
                                    <Badge size="xs" color={statusConfig.color} variant="dot">
                                        {statusConfig.label}
                                    </Badge>
                                    <Badge size="xs" color={importanceConfig.color} variant="outline">
                                        {importanceConfig.label}
                                    </Badge>
                                </Group>
                            </Stack>
                        </Paper>
                    );
                })}
            </div>

            <Paper
                shadow="sm"
                p="xs"
                style={{
                    position: 'absolute',
                    bottom: 20,
                    left: 20,
                    zIndex: 10,
                    backgroundColor: '#25262B',
                    border: '1px solid #373A40',
                    color: '#C1C2C5'
                }}
            >
                <Group gap="xs">
                    <Text size="xs">Zoom</Text>
                    <Slider
                        w={100}
                        min={0.1}
                        max={2}
                        step={0.1}
                        value={scale}
                        onChange={setScale}
                        size="sm"
                    />
                    <Text size="xs">{Math.round(scale * 100)}%</Text>
                </Group>
            </Paper>

        </Box>
    );
}
