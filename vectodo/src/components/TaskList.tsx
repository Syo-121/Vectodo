import { useEffect, useMemo, useState, useRef } from 'react';
import { Stack, Text, Loader, Alert, Center, SimpleGrid, Checkbox } from '@mantine/core';
import { AlertCircle, CheckSquare } from 'lucide-react';
import SelectionArea from '@simonwep/selection-js';
import { useTaskStore } from '../stores/taskStore';
import { TaskCard } from './TaskCard';
import { BulkActionBar } from './BulkActionBar';
import '../selection.css';
import type { Tables } from '../supabase-types';

type Task = Tables<'tasks'>;

interface TaskListProps {
    onTaskClick?: (task: Task) => void;
}

export function TaskList({ onTaskClick }: TaskListProps) {
    const { tasks, loading, error, fetchTasks, showCompletedTasks, currentProjectId, deleteTasks, completeTasks } = useTaskStore();
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const selectionRef = useRef<SelectionArea | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const lastDragTimeRef = useRef<number>(0);

    useEffect(() => {
        fetchTasks();
    }, [fetchTasks]);

    // Filter with AND condition: hierarchy scope AND completion status
    const displayTasks = useMemo(() => {
        return tasks.filter(task => {
            // 1. Hierarchy scope check
            const isCorrectScope = currentProjectId
                ? task.parent_id === currentProjectId
                : task.parent_id === null;

            // 2. Completion status check
            const isVisibleStatus = showCompletedTasks || (task.status !== 'DONE' && task.status !== 'done');

            // Both conditions must be true
            return isCorrectScope && isVisibleStatus;
        });
    }, [tasks, currentProjectId, showCompletedTasks]);

    // Handle selection toggle
    const toggleSelection = (taskId: string) => {
        setSelectedIds(prev => {
            const newSet = new Set(prev);
            if (newSet.has(taskId)) {
                newSet.delete(taskId);
            } else {
                newSet.add(taskId);
            }
            return newSet;
        });
    };

    // Handle bulk operations
    const handleBulkComplete = async () => {
        await completeTasks(Array.from(selectedIds), true);
        setSelectedIds(new Set());
    };

    const handleBulkDelete = async () => {
        await deleteTasks(Array.from(selectedIds));
        setSelectedIds(new Set());
    };

    const handleCancelSelection = () => {
        setSelectedIds(new Set());
    };

    // Clear selection when clicking empty area (but not immediately after drag)
    const handleContainerClick = (e: React.MouseEvent) => {
        const target = e.target as HTMLElement;
        const isTaskCard = target.closest('.task-card');
        const isCheckbox = target.closest('.mantine-Checkbox-root');

        console.log('[Click] Target:', target.className, 'IsTaskCard:', !!isTaskCard, 'IsCheckbox:', !!isCheckbox);

        // Don't clear if clicked on task or checkbox
        if (isTaskCard || isCheckbox) {
            console.log('[Click] Clicked on task/checkbox - keeping selection');
            return;
        }

        // Don't clear if this click is within 200ms of a drag operation
        const timeSinceDrag = Date.now() - lastDragTimeRef.current;
        if (timeSinceDrag < 200) {
            console.log('[Selection] Ignoring click - drag just completed');
            return;
        }

        // Clear selection
        if (selectedIds.size > 0) {
            console.log('[Selection] Clearing selection - clicked empty area');
            setSelectedIds(new Set());
            document.querySelectorAll('.task-card.selected').forEach(el => {
                el.classList.remove('selected');
            });
        }
    };

    // Initialize Selection.js for drag-to-select
    useEffect(() => {
        // Wait for container to be available
        const timer = setTimeout(() => {
            if (!containerRef.current) {
                console.warn('[Selection] Container not ready');
                return;
            }

            console.log('[Selection] Initializing Selection.js');

            const selection = new SelectionArea({
                selectables: ['.task-card'],
                boundaries: ['body'], // Allow drag from anywhere on the page
            })
                .on('start', ({ event }) => {
                    console.log('[Selection] Start event', event);
                    // Clear selection if not holding Shift key
                    if (!(event as any)?.shiftKey) {
                        setSelectedIds(new Set());
                        // Clear visual selection
                        document.querySelectorAll('.task-card.selected').forEach(el => {
                            el.classList.remove('selected');
                        });
                    }
                })
                .on('move', ({ store: { changed: { added, removed } } }) => {
                    console.log('[Selection] Move - Added:', added.length, 'Removed:', removed.length);

                    // Add selected elements
                    for (const el of added) {
                        const taskId = el.getAttribute('data-id');
                        if (taskId) {
                            el.classList.add('selected');
                            setSelectedIds(prev => {
                                const newSet = new Set(prev);
                                newSet.add(taskId);
                                return newSet;
                            });
                        }
                    }

                    // Remove deselected elements
                    for (const el of removed) {
                        const taskId = el.getAttribute('data-id');
                        if (taskId) {
                            el.classList.remove('selected');
                            setSelectedIds(prev => {
                                const newSet = new Set(prev);
                                newSet.delete(taskId);
                                return newSet;
                            });
                        }
                    }
                })
                .on('stop', ({ store }) => {
                    console.log('[Selection] Stop - Selected:', store.stored.length);
                    // Record when drag finished
                    lastDragTimeRef.current = Date.now();
                });

            selectionRef.current = selection;

            return () => {
                console.log('[Selection] Destroying Selection.js');
                selection.destroy();
            };
        }, 100); // Small delay to ensure DOM is ready

        return () => clearTimeout(timer);
    }, [displayTasks]); // Re-initialize when tasks change

    // Document-wide click handler to clear selection when clicking outside task area
    useEffect(() => {
        const handleDocumentClick = (e: MouseEvent) => {
            const target = e.target as HTMLElement;
            const isTaskCard = target.closest('.task-card');
            const isCheckbox = target.closest('.mantine-Checkbox-root');
            const isBulkActionBar = target.closest('.bulk-action-bar');

            // Don't clear if clicked on task, checkbox, or bulk action bar
            if (isTaskCard || isCheckbox || isBulkActionBar) {
                return;
            }

            // Don't clear if this click is within 200ms of a drag operation
            const timeSinceDrag = Date.now() - lastDragTimeRef.current;
            if (timeSinceDrag < 200) {
                return;
            }

            // Clear selection
            if (selectedIds.size > 0) {
                console.log('[Selection] Clearing selection - clicked outside');
                setSelectedIds(new Set());
                document.querySelectorAll('.task-card.selected').forEach(el => {
                    el.classList.remove('selected');
                });
            }
        };

        document.addEventListener('click', handleDocumentClick);
        return () => document.removeEventListener('click', handleDocumentClick);
    }, [selectedIds]);

    if (loading && tasks.length === 0) {
        return (
            <Center h={300}>
                <Loader size="lg" />
            </Center>
        );
    }

    if (error) {
        return (
            <Alert
                icon={<AlertCircle size={16} />}
                title="エラーが発生しました"
                color="red"
                variant="light"
            >
                {error}
            </Alert>
        );
    }

    if (displayTasks.length === 0) {
        return (
            <Center h={300}>
                <Stack align="center" gap="md">
                    <CheckSquare size={48} strokeWidth={1.5} opacity={0.3} />
                    <Text c="dimmed" size="lg">
                        タスクがありません
                    </Text>
                    <Text c="dimmed" size="sm">
                        「新規タスク作成」ボタンでタスクを作成してみましょう
                    </Text>
                </Stack>
            </Center>
        );
    }

    return (
        <>
            <Stack
                gap="md"
                ref={containerRef}
                className="task-list-container"
                onClick={handleContainerClick}
            >
                <Text size="sm" c="dimmed">
                    {displayTasks.length}件のタスク
                </Text>
                <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="md">
                    {displayTasks.map((task) => (
                        <div
                            key={task.id}
                            className="task-card"
                            data-id={task.id}
                            style={{ position: 'relative' }}
                        >
                            {/* Selection Checkbox */}
                            <Checkbox
                                checked={selectedIds.has(task.id)}
                                onChange={() => toggleSelection(task.id)}
                                style={{
                                    position: 'absolute',
                                    top: '8px',
                                    left: '8px',
                                    zIndex: 10,
                                }}
                                size="sm"
                            />
                            <div style={{
                                opacity: selectedIds.has(task.id) ? 0.8 : 1,
                                border: selectedIds.has(task.id) ? '2px solid #5c7cfa' : undefined,
                                borderRadius: '8px',
                            }}>
                                <TaskCard
                                    task={task}
                                    onEdit={() => onTaskClick?.(task)}
                                />
                            </div>
                        </div>
                    ))}
                </SimpleGrid>
            </Stack>

            {/* Bulk Action Bar */}
            <BulkActionBar
                selectedIds={selectedIds}
                onComplete={handleBulkComplete}
                onDelete={handleBulkDelete}
                onCancel={handleCancelSelection}
            />
        </>
    );
}
