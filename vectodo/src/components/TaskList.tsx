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
        // Clear Selection.js internal cache
        if (selectionRef.current) {
            selectionRef.current.clearSelection();
        }
        // Clear visual selection
        document.querySelectorAll('.task-card.selected, .task-card.temp-selected').forEach(el => {
            el.classList.remove('selected', 'temp-selected');
        });
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
                        document.querySelectorAll('.task-card.selected, .task-card.temp-selected').forEach(el => {
                            el.classList.remove('selected', 'temp-selected');
                        });
                    }
                })
                .on('move', ({ store: { changed: { added, removed } } }) => {
                    // PERFORMANCE OPTIMIZATION: Don't update state during drag!
                    // Only manipulate DOM classes for visual feedback

                    // Add temporary selection highlight
                    for (const el of added) {
                        el.classList.add('temp-selected');
                    }

                    // Remove temporary selection highlight
                    for (const el of removed) {
                        el.classList.remove('temp-selected');
                    }
                })
                .on('stop', ({ store }) => {
                    console.log('[Selection] Stop - Selected:', store.stored.length);

                    // Record when drag finished
                    lastDragTimeRef.current = Date.now();

                    // NOW update state with final selection (only once!)
                    const finalIds = new Set<string>();
                    store.stored.forEach(el => {
                        const taskId = el.getAttribute('data-id');
                        if (taskId) {
                            finalIds.add(taskId);
                            // Replace temp class with permanent selected class
                            el.classList.remove('temp-selected');
                            el.classList.add('selected');
                        }
                    });

                    setSelectedIds(finalIds);
                    console.log('[Selection] Final selection:', finalIds.size);
                })
                // Add beforestart event to handle clicks/taps and clear selection when clicking outside
                .on('beforestart', (evt) => {
                    const target = (evt as any).oe?.target as HTMLElement;
                    if (!target) return true; // Allow selection to proceed

                    console.log('[Selection] Beforestart - checking target:', target.className);

                    // Check if clicked on task card or bulk action bar
                    const isTaskCard = target.closest('.task-card');
                    const isBulkActionBar = target.closest('.bulk-action-bar');
                    const isCheckbox = target.closest('.mantine-Checkbox-root');

                    // If NOT clicking on task-related elements, clear selection
                    if (!isTaskCard && !isBulkActionBar && !isCheckbox) {
                        console.log('[Selection] ✅ Tap outside - clearing selection');
                        setSelectedIds(new Set());
                        selection.clearSelection();
                        document.querySelectorAll('.task-card.selected, .task-card.temp-selected').forEach(el => {
                            el.classList.remove('selected', 'temp-selected');
                        });
                        return false; // Prevent selection from starting
                    }

                    return true; // Allow selection to proceed
                });

            selectionRef.current = selection;

            return () => {
                console.log('[Selection] Destroying Selection.js');
                selection.destroy();
            };
        }, 100); // Small delay to ensure DOM is ready

        return () => clearTimeout(timer);
    }, [displayTasks]); // Re-initialize when tasks change

    // Window-level mousedown handler with capturing phase to intercept clicks early
    useEffect(() => {
        const handleMouseDown = (e: MouseEvent) => {
            const target = e.target as HTMLElement;

            // Only check for task-related elements
            const isTaskCard = target.closest('.task-card');
            const isBulkActionBar = target.closest('.bulk-action-bar');
            const isCheckbox = target.closest('.mantine-Checkbox-root');

            console.log('[MouseDown Capture]', {
                className: target.className,
                tagName: target.tagName,
                isTaskCard: !!isTaskCard,
                isBulkActionBar: !!isBulkActionBar,
                isCheckbox: !!isCheckbox,
                selectedCount: selectedIds.size,
            });

            // Don't clear if clicked on task card, bulk action bar, or checkbox
            if (isTaskCard || isBulkActionBar || isCheckbox) {
                console.log('[MouseDown] Ignoring - clicked on task element');
                return;
            }

            // Don't clear if this click is within 200ms of a drag operation
            const timeSinceDrag = Date.now() - lastDragTimeRef.current;
            if (timeSinceDrag < 200) {
                console.log('[MouseDown] Ignoring - drag just completed');
                return;
            }

            // Check if there are any visually selected tasks in the DOM
            const hasSelectedTasks = document.querySelectorAll('.task-card.selected, .task-card.temp-selected').length > 0;

            // Clear selection if there are selected tasks (check DOM, not just state)
            if (selectedIds.size > 0 || hasSelectedTasks) {
                console.log('[Selection] ✅ Clearing selection via mousedown capture', {
                    stateCount: selectedIds.size,
                    domCount: hasSelectedTasks,
                });
                setSelectedIds(new Set());

                // Clear Selection.js internal cache
                if (selectionRef.current) {
                    selectionRef.current.clearSelection();
                }

                // Clear both selected and temp-selected classes
                document.querySelectorAll('.task-card.selected, .task-card.temp-selected').forEach(el => {
                    el.classList.remove('selected', 'temp-selected');
                });
            } else {
                console.log('[MouseDown] No selection to clear');
            }
        };

        // Use capturing phase to intercept events early
        window.addEventListener('mousedown', handleMouseDown, true);
        return () => window.removeEventListener('mousedown', handleMouseDown, true);
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
                style={{ minHeight: '100%', flexGrow: 1 }}
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
