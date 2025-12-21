import { useEffect, useMemo } from 'react';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import type { DropResult } from '@hello-pangea/dnd';
import { Paper, Stack, Text, Badge, Group, Box, ScrollArea, Loader, Center, useMantineColorScheme, useMantineTheme, Menu, ActionIcon } from '@mantine/core';
import { Circle, Play, Pause, CheckCircle, Settings } from 'lucide-react';
import { useTaskStore } from '../../stores/taskStore';
import { KanbanCard } from './KanbanCard';
import type { Tables, TaskStatus } from '../../supabase-types';
import './kanban.css';

type Task = Tables<'tasks'>;

interface KanbanBoardProps {
    onEdit: (task: Task) => void;
}

interface Column {
    id: TaskStatus;
    title: string;
    color: string;
    icon: React.ReactNode;
}

const columns: Column[] = [
    {
        id: 'todo',
        title: 'To Do',
        color: 'gray',
        icon: <Circle size={18} />,
    },
    {
        id: 'in_progress',
        title: 'In Progress',
        color: 'blue',
        icon: <Play size={18} />,
    },
    {
        id: 'pending',
        title: 'Pending',
        color: 'yellow',
        icon: <Pause size={18} />,
    },
    {
        id: 'done',
        title: 'Done',
        color: 'green',
        icon: <CheckCircle size={18} />,
    },
];

export function KanbanBoard({ onEdit }: KanbanBoardProps) {
    const { tasks, loading, fetchTasks, updateTaskStatus, currentProjectId, showCompletedTasks, doneFilterDays, setDoneFilterDays, setCurrentProject } = useTaskStore();
    const { colorScheme } = useMantineColorScheme();
    const theme = useMantineTheme();
    const isDark = colorScheme === 'dark';

    useEffect(() => {
        fetchTasks();
    }, [fetchTasks]);

    // Handle drill-down into task hierarchy
    const handleDrillDown = (task: Task) => {
        setCurrentProject(task.id);
    };

    // Filter tasks by current project and completion status
    const displayTasks = useMemo(() => {
        return tasks.filter(task => {
            // 1. Hierarchy scope check
            const isCorrectScope = currentProjectId
                ? task.parent_id === currentProjectId
                : task.parent_id === null;

            // 2. Completion status check
            const isVisibleStatus = showCompletedTasks || task.status !== 'done';

            return isCorrectScope && isVisibleStatus;
        });
    }, [tasks, currentProjectId, showCompletedTasks]);

    // Group tasks by status
    const tasksByStatus = useMemo(() => {
        const grouped: Record<TaskStatus, Task[]> = {
            todo: [],
            in_progress: [],
            pending: [],
            done: [],
        };

        displayTasks.forEach(task => {
            // Normalize status to lowercase and handle legacy values
            const status = task.status?.toLowerCase();

            if (status === 'todo' || !status) {
                grouped.todo.push(task);
            } else if (status === 'in_progress' || status === 'doing') {
                grouped.in_progress.push(task);
            } else if (status === 'pending') {
                grouped.pending.push(task);
            } else if (status === 'done') {
                grouped.done.push(task);
            } else {
                // Default to todo for unknown statuses
                grouped.todo.push(task);
            }
        });

        return grouped;
    }, [displayTasks]);

    // Filter done tasks based on doneFilterDays setting
    const filterDoneTasks = (tasks: Task[]) => {
        if (doneFilterDays === null) return tasks;

        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - doneFilterDays);

        return tasks.filter(task => {
            // Show tasks without completed_at (legacy data)
            if (!task.completed_at) return true;
            // Show tasks completed after cutoff date
            return new Date(task.completed_at) > cutoffDate;
        });
    };

    const handleDragEnd = async (result: DropResult) => {
        const { destination, source, draggableId } = result;

        console.log('[Kanban] Drag end event:', {
            draggableId,
            source: source.droppableId,
            destination: destination?.droppableId,
        });

        // Dropped outside a droppable area
        if (!destination) {
            console.log('[Kanban] Dropped outside - no action');
            return;
        }

        // Dropped in the same position
        if (
            destination.droppableId === source.droppableId &&
            destination.index === source.index
        ) {
            console.log('[Kanban] Same position - no action');
            return;
        }

        // Map kanban column ID to database status value
        const statusMap: Record<TaskStatus, string> = {
            'todo': 'TODO',
            'in_progress': 'DOING',
            'pending': 'PENDING',
            'done': 'DONE',
        };

        const columnId = destination.droppableId as TaskStatus;
        const newStatus = statusMap[columnId];

        console.log('[Kanban] 🚀 Updating task', draggableId, 'from', source.droppableId, 'to', newStatus, '(column:', columnId, ')');

        try {
            await updateTaskStatus(draggableId, newStatus);
            console.log('[Kanban] ✅ Status update completed');
        } catch (error) {
            console.error('[Kanban] ❌ Status update failed:', error);
        }
    };

    if (loading && tasks.length === 0) {
        return (
            <Center h={400}>
                <Loader size="lg" />
            </Center>
        );
    }

    return (
        <DragDropContext onDragEnd={handleDragEnd}>
            <ScrollArea className="kanban-board">
                <Group align="flex-start" gap="md" wrap="nowrap" style={{ minHeight: '600px' }}>

                    {columns.map(column => {
                        const columnTasks = tasksByStatus[column.id];
                        // Apply filter only to Done column
                        const displayColumnTasks = column.id === 'done'
                            ? filterDoneTasks(columnTasks)
                            : columnTasks;

                        const getColumnBgColor = () => {
                            if (isDark) {
                                // Dark mode: mix status color into dark background
                                const baseColor = theme.colors.dark[8];
                                switch (column.id) {
                                    case 'todo':
                                        // Gray/neutral
                                        return `rgba(255, 255, 255, 0.03)`;
                                    case 'in_progress':
                                        // Blue tint
                                        return `color-mix(in srgb, ${theme.colors.blue[6]} 8%, ${baseColor})`;
                                    case 'pending':
                                        // Yellow tint
                                        return `color-mix(in srgb, ${theme.colors.yellow[6]} 8%, ${baseColor})`;
                                    case 'done':
                                        // Green tint
                                        return `color-mix(in srgb, ${theme.colors.green[6]} 8%, ${baseColor})`;
                                    default:
                                        return baseColor;
                                }
                            }
                            // Light mode: use colorful tints
                            switch (column.id) {
                                case 'todo': return '#f8f9fa';
                                case 'in_progress': return '#e7f5ff';
                                case 'pending': return '#fff9db';
                                case 'done': return '#f4fce3';
                                default: return '#f8f9fa';
                            }
                        };

                        const getHeaderTextColor = () => {
                            if (!isDark) return undefined; // Use default in light mode
                            // Dark mode: use bright status colors for header
                            switch (column.id) {
                                case 'todo': return theme.colors.gray[4];
                                case 'in_progress': return theme.colors.blue[3];
                                case 'pending': return theme.colors.yellow[3];
                                case 'done': return theme.colors.green[3];
                                default: return theme.colors.gray[4];
                            }
                        };

                        return (
                            <Paper
                                key={column.id}
                                shadow="sm"
                                p="md"
                                radius="md"
                                withBorder
                                style={{
                                    minWidth: '280px',
                                    width: '280px',
                                    flexShrink: 0,
                                    backgroundColor: getColumnBgColor(),
                                    borderColor: isDark ? theme.colors.dark[4] : undefined,
                                }}
                            >
                                <Stack gap="md">
                                    {/* Column Header */}
                                    <Group justify="space-between" wrap="nowrap">
                                        <Group gap="xs">
                                            <Box c={isDark ? getHeaderTextColor() : column.color}>
                                                {column.icon}
                                            </Box>
                                            <Text fw={600} size="sm" c={getHeaderTextColor()}>
                                                {column.title}
                                            </Text>
                                        </Group>
                                        <Group gap="xs">
                                            <Badge color={column.color} variant="light" size="sm">
                                                {displayColumnTasks.length}
                                            </Badge>
                                            {/* Settings menu for Done column */}
                                            {column.id === 'done' && (
                                                <Menu shadow="md" width={200}>
                                                    <Menu.Target>
                                                        <ActionIcon
                                                            size="sm"
                                                            variant="subtle"
                                                            c={isDark ? theme.colors.gray[5] : theme.colors.gray[6]}
                                                        >
                                                            <Settings size={16} />
                                                        </ActionIcon>
                                                    </Menu.Target>
                                                    <Menu.Dropdown>
                                                        <Menu.Label>完了タスクの表示</Menu.Label>
                                                        <Menu.Item
                                                            onClick={() => setDoneFilterDays(null)}
                                                            c={doneFilterDays === null ? 'blue' : undefined}
                                                        >
                                                            全て表示
                                                        </Menu.Item>
                                                        <Menu.Item
                                                            onClick={() => setDoneFilterDays(1)}
                                                            c={doneFilterDays === 1 ? 'blue' : undefined}
                                                        >
                                                            1日以内
                                                        </Menu.Item>
                                                        <Menu.Item
                                                            onClick={() => setDoneFilterDays(3)}
                                                            c={doneFilterDays === 3 ? 'blue' : undefined}
                                                        >
                                                            3日以内
                                                        </Menu.Item>
                                                        <Menu.Item
                                                            onClick={() => setDoneFilterDays(7)}
                                                            c={doneFilterDays === 7 ? 'blue' : undefined}
                                                        >
                                                            1週間以内
                                                        </Menu.Item>
                                                    </Menu.Dropdown>
                                                </Menu>
                                            )}
                                        </Group>
                                    </Group>

                                    {/* Droppable Area */}
                                    <Droppable droppableId={column.id}>
                                        {(provided, snapshot) => (
                                            <Box
                                                ref={provided.innerRef}
                                                {...provided.droppableProps}
                                                style={{
                                                    minHeight: '400px',
                                                    backgroundColor: snapshot.isDraggingOver
                                                        ? (isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.05)')
                                                        : 'transparent',
                                                    borderRadius: '8px',
                                                    padding: '4px',
                                                    transition: 'background-color 0.2s',
                                                }}
                                            >
                                                {displayColumnTasks.map((task, index) => (
                                                    <Draggable
                                                        key={task.id}
                                                        draggableId={task.id}
                                                        index={index}
                                                    >
                                                        {(provided, snapshot) => (
                                                            <div
                                                                ref={provided.innerRef}
                                                                {...provided.draggableProps}
                                                                {...provided.dragHandleProps}
                                                                className="kanban-card"
                                                                style={{
                                                                    ...provided.draggableProps.style,
                                                                    opacity: snapshot.isDragging ? 0.8 : 1,
                                                                }}
                                                            >
                                                                <KanbanCard
                                                                    task={task}
                                                                    onDrillDown={handleDrillDown}
                                                                    onEdit={onEdit}
                                                                />
                                                            </div>
                                                        )}
                                                    </Draggable>
                                                ))}
                                                {provided.placeholder}
                                            </Box>
                                        )}
                                    </Droppable>
                                </Stack>
                            </Paper>
                        );
                    })}
                </Group>
            </ScrollArea>
        </DragDropContext>
    );
}
