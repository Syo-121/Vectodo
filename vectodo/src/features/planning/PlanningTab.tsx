import { useCallback, useMemo, useState } from 'react';
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
    const { tasks, dependencies, addDependency, removeDependency } = useTaskStore();
    const [selectedTask, setSelectedTask] = useState<Task | null>(null);
    const [taskFormModalOpened, setTaskFormModalOpened] = useState(false);

    // Convert tasks to nodes
    const initialNodes: Node[] = useMemo(() => {
        return tasks.map((task, index) => ({
            id: task.id,
            type: 'taskNode',
            position: { x: index * 250, y: index * 100 },
            data: {
                title: task.title,
                status: task.status,
                importance: task.importance,
            },
        }));
    }, [tasks]);

    // Convert dependencies to edges
    const initialEdges: Edge[] = useMemo(() => {
        return dependencies.map((dep) => ({
            id: `${dep.predecessor_id}-${dep.successor_id}`,
            source: dep.predecessor_id,
            target: dep.successor_id,
            markerEnd: { type: MarkerType.ArrowClosed },
            animated: false,
        }));
    }, [dependencies]);

    const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
    const [edges, setEdges] = useEdgesState(initialEdges);

    // Update nodes and edges when tasks or dependencies change
    useMemo(() => {
        setNodes(initialNodes);
        setEdges(initialEdges);
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
    }, [nodes, edges, setNodes, setEdges]);

    // Node click handler
    const onNodeClick = useCallback(
        (_event: React.MouseEvent, node: Node) => {
            const task = tasks.find(t => t.id === node.id);
            if (task) {
                setSelectedTask(task);
                setTaskFormModalOpened(true);
            }
        },
        [tasks]
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
                onEdgesChange={handleEdgesChange}
                onConnect={onConnect}
                onNodeClick={onNodeClick}
                nodeTypes={nodeTypes}
                fitView
                deleteKeyCode="Delete"
            >
                <Controls />
                <Background />
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
