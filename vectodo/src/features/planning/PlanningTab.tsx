import { useCallback, useMemo, useState, useEffect } from 'react';
import ReactFlow, {
    Controls,
    Background,
    MarkerType,
    useNodesState,
    useEdgesState,
    addEdge,
    applyEdgeChanges,
    type Node,
    type Edge,
    type Connection,
    type EdgeChange,
} from 'reactflow';
import { Button, Stack, Text } from '@mantine/core';
import { Layout } from 'lucide-react';
import { useTaskStore } from '../../stores/taskStore';
import { TaskNode } from './TaskNode';
import { getLayoutedElements } from './layoutUtils';
import { TaskFormModal } from '../../components/TaskFormModal';
import type { Tables } from '../../supabase-types';
import 'reactflow/dist/style.css';

type Task = Tables<'tasks'>;

const nodeTypes = {
    taskNode: TaskNode,
};

export function PlanningTab() {
    const { tasks, dependencies, addDependency, removeDependency, currentProjectId, showCompletedTasks, setCurrentProject } = useTaskStore();
    const [selectedTask, setSelectedTask] = useState<Task | null>(null);
    const [taskFormModalOpened, setTaskFormModalOpened] = useState(false);

    // Filter tasks by current scope and completion status
    const scopedTasks = useMemo(() => {
        return tasks.filter(task => {
            // 1. Hierarchy scope check
            const isCorrectScope = currentProjectId
                ? task.parent_id === currentProjectId
                : task.parent_id === null;

            // 2. Completion status check
            const isVisibleStatus = showCompletedTasks || (task.status !== 'DONE' && task.status !== 'done');

            return isCorrectScope && isVisibleStatus;
        });
    }, [tasks, currentProjectId, showCompletedTasks]);

    // Filter dependencies to only those within scope
    const scopedDependencies = useMemo(() => {
        const scopedTaskIds = new Set(scopedTasks.map(t => t.id));
        return dependencies.filter(dep =>
            scopedTaskIds.has(dep.predecessor_id) && scopedTaskIds.has(dep.successor_id)
        );
    }, [scopedTasks, dependencies]);

    // Load saved DAG positions from localStorage (project-specific)
    const loadDagPositions = useCallback((): Record<string, { x: number; y: number }> => {
        try {
            const key = `vectodo-flow-positions-${currentProjectId || 'default'}`;
            const saved = localStorage.getItem(key);
            return saved ? JSON.parse(saved) : {};
        } catch (error) {
            console.error('[Flow] Failed to load positions:', error);
            return {};
        }
    }, [currentProjectId]);

    // Save DAG positions to localStorage (project-specific)
    const saveDagPositions = useCallback((positions: Record<string, { x: number; y: number }>) => {
        try {
            const key = `vectodo-flow-positions-${currentProjectId || 'default'}`;
            localStorage.setItem(key, JSON.stringify(positions));
            console.log(`[Flow] Saved positions for project ${currentProjectId || 'default'}:`, Object.keys(positions).length, 'nodes');
        } catch (error) {
            console.error('[Flow] Failed to save positions:', error);
        }
    }, [currentProjectId]);

    // Convert scoped tasks to nodes with saved positions
    const initialNodes: Node[] = useMemo(() => {
        const savedPositions = loadDagPositions();

        return scopedTasks.map((task, index) => {
            // Use saved position if available, otherwise use auto-layout position
            const position = savedPositions[task.id] || { x: index * 250, y: index * 100 };

            return {
                id: task.id,
                type: 'taskNode',
                position,
                data: {
                    title: task.title,
                    status: task.status,
                    importance: task.importance,
                    deadline: task.deadline,
                    estimate_minutes: task.estimate_minutes,
                    recurrence: task.recurrence,
                },
            };
        });
    }, [scopedTasks]);

    // Convert scoped dependencies to edges
    const initialEdges: Edge[] = useMemo(() => {
        return scopedDependencies.map((dep) => ({
            id: `${dep.predecessor_id}-${dep.successor_id}`,
            source: dep.predecessor_id,
            target: dep.successor_id,
            type: 'bezier',  // Smooth bezier curves for horizontal layout
            markerEnd: { type: MarkerType.ArrowClosed },
            animated: false,
        }));
    }, [scopedDependencies]);

    const [nodes, setNodes, onNodesChange] = useNodesState([]);
    const [edges, setEdges] = useEdgesState([]);

    // Handle node drag stop - save position to localStorage
    const onNodeDragStop = useCallback(
        (_event: React.MouseEvent, node: Node) => {
            const savedPositions = loadDagPositions();
            savedPositions[node.id] = node.position;
            saveDagPositions(savedPositions);
            console.log(`[Flow] Saved position for node ${node.id}:`, node.position);
        },
        [loadDagPositions, saveDagPositions]
    );

    // Update nodes and edges when tasks or dependencies change
    useEffect(() => {
        if (scopedTasks.length === 0) {
            setNodes([]);
            setEdges([]);
            return;
        }

        console.log('[DAG] Regenerating layout...');

        // Step 1: Get auto-layout positions
        const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(
            initialNodes,
            initialEdges
        );

        // Step 2: Load saved positions
        const savedPositions = loadDagPositions();
        const savedCount = Object.keys(savedPositions).length;
        console.log(`[DAG] Loaded ${savedCount} saved positions from localStorage`);

        // Step 3: Merge - prioritize saved positions over auto-layout
        const finalNodes = layoutedNodes.map(node => {
            const savedPos = savedPositions[node.id];
            if (savedPos) {
                console.log(`[DAG] Restoring saved position for ${node.id}:`, savedPos);
                return { ...node, position: savedPos };
            }
            // Use auto-layout position if no saved position
            return node;
        });

        setNodes(finalNodes);
        setEdges(layoutedEdges);
    }, [initialNodes, initialEdges, setNodes, setEdges]);

    // Handle connection creation
    const onConnect = useCallback(
        (connection: Connection) => {
            if (!connection.source || !connection.target) return;

            // Prevent self-loops
            if (connection.source === connection.target) {
                console.warn('Cannot connect task to itself');
                return;
            }

            // Add to database
            addDependency(connection.source, connection.target);

            // Optimistically add to UI
            setEdges((eds) =>
                addEdge(
                    {
                        ...connection,
                        type: 'bezier',
                        markerEnd: { type: MarkerType.ArrowClosed },
                    },
                    eds
                )
            );
        },
        [addDependency, setEdges]
    );

    // Handle edge deletion
    const onEdgesDelete = useCallback(
        (edgesToDelete: Edge[]) => {
            edgesToDelete.forEach((edge) => {
                removeDependency(edge.source, edge.target);
            });
        },
        [removeDependency]
    );

    // Custom edge change handler to catch deletions
    const handleEdgesChange = useCallback(
        (changes: EdgeChange[]) => {
            const removedEdges = changes
                .filter((change) => change.type === 'remove')
                .map((change) => edges.find((e) => e.id === change.id))
                .filter((edge): edge is Edge => edge !== undefined);

            if (removedEdges.length > 0) {
                onEdgesDelete(removedEdges);
            }

            setEdges((eds) => applyEdgeChanges(changes, eds));
        },
        [edges, onEdgesDelete, setEdges]
    );

    // Auto-layout handler
    const onLayout = useCallback(() => {
        const layouted = getLayoutedElements(nodes, edges);

        setNodes(layouted.nodes);
        setEdges(layouted.edges);

        // Save the new positions after auto-layout
        const newPositions: Record<string, { x: number; y: number }> = {};
        layouted.nodes.forEach(node => {
            newPositions[node.id] = node.position;
        });
        saveDagPositions(newPositions);
        console.log('[Flow] Saved auto-layout positions');
    }, [nodes, edges, setNodes, setEdges, saveDagPositions]);

    // Node click handler
    // Handle node click - drill down into task hierarchy
    const onNodeClick = useCallback(
        (_event: React.MouseEvent, node: Node) => {
            // Navigate into the clicked task (drill-down)
            setCurrentProject(node.id);
        },
        [setCurrentProject]
    );

    if (tasks.length === 0) {
        return (
            <Stack align="center" justify="center" h="calc(100vh - 200px)">
                <Text c="dimmed">タスクがありません。タスクを作成してください。</Text>
            </Stack>
        );
    }

    return (
        <div style={{ width: '100%', height: 'calc(100vh - 200px)', position: 'relative' }}>
            <div style={{
                position: 'absolute',
                top: '20px',
                right: '20px',
                zIndex: 1000,
                display: 'flex',
                gap: '10px'
            }}>
                <Button
                    leftSection={<Layout size={16} />}
                    onClick={onLayout}
                    variant="filled"
                    color="blue"
                    size="md"
                >
                    自動整列
                </Button>
            </div>

            <ReactFlow
                nodes={nodes}
                edges={edges}
                onNodesChange={onNodesChange}
                onNodeDragStop={onNodeDragStop}
                onEdgesChange={handleEdgesChange}
                onConnect={onConnect}
                onNodeClick={onNodeClick}
                nodeTypes={nodeTypes}
                defaultEdgeOptions={{
                    type: 'bezier',
                    style: { strokeWidth: 2 },
                }}
                fitView
                // Multi-selection features
                selectionOnDrag={true}           // Enable box selection by dragging
                panOnDrag={[1, 2]}              // Pan with middle/right mouse button only
                multiSelectionKeyCode="Control"  // Ctrl/Cmd for multi-select
                deleteKeyCode="Delete"           // Delete key to remove selected nodes
            >
                <Background />
                <Controls />
            </ReactFlow>

            <TaskFormModal
                opened={taskFormModalOpened}
                onClose={() => {
                    setTaskFormModalOpened(false);
                    setSelectedTask(null);
                }}
                task={selectedTask}
            />
        </div>
    );
}
