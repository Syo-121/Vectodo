import { useEffect, useMemo, useState, useRef } from 'react';
import { Stack, Text, Loader, Alert, Center, Checkbox, Table, ActionIcon, Badge, Group, ScrollArea } from '@mantine/core';
import { AlertCircle, Pencil, Trash2 } from 'lucide-react';
import SelectionArea from '@simonwep/selection-js';
import { useTaskStore } from '../stores/taskStore';
import { BulkActionBar } from './BulkActionBar';
import '../selection.css';
import type { Tables } from '../supabase-types';

type Task = Tables<'tasks'>;

interface TaskListProps {
    onTaskClick?: (task: Task) => void;
}

export function TaskList({ onTaskClick }: TaskListProps) {
    const {
        tasks,
        loading,
        error,
        fetchTasks,
        showCompletedTasks,
        currentProjectId,
        deleteTasks,
        completeTasks,
        updateTaskStatus,
        setCurrentProject
    } = useTaskStore();
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

    // Handle bulk operations
    const handleBulkComplete = async () => {
        await completeTasks(Array.from(selectedIds), true);
        setSelectedIds(new Set());
    };

    const handleBulkDelete = async () => {
        await deleteTasks(Array.from(selectedIds));
        setSelectedIds(new Set());
    };

    // Handle status toggle (checkbox)
    const handleStatusToggle = async (taskId: string) => {
        const task = tasks.find(t => t.id === taskId);
        if (!task) return;
        const newStatus = task.status === 'DONE' ? 'TODO' : 'DONE';
        await updateTaskStatus(taskId, newStatus);
    };

    // Handle single task delete
    const handleDelete = async (taskId: string) => {
        if (confirm('このタスクを削除しますか？')) {
            await deleteTasks([taskId]);
        }
    };

    // Handle row click for drill-down
    const handleRowClick = (task: Task) => {
        setCurrentProject(task.id);
    };

    const handleCancelSelection = () => {
        setSelectedIds(new Set());
        // Clear Selection.js internal cache
        if (selectionRef.current) {
            selectionRef.current.clearSelection();
        }
        // Clear visual selection - updated for task-row
        document.querySelectorAll('.task-row.selected, .task-row.temp-selected').forEach(el => {
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
                selectables: ['.task-row'], // Updated for table rows
                boundaries: ['.task-list-container'], // Limit to task list container only
            })
                .on('start', ({ event }) => {
                    console.log('[Selection] Start event', event);
                    // Clear selection if not holding Shift key
                    if (!(event as any)?.shiftKey) {
                        setSelectedIds(new Set());
                        // Clear visual selection
                        document.querySelectorAll('.task-row.selected, .task-row.temp-selected').forEach(el => {
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
                        const taskId = el.getAttribute('data-task-id'); // Updated for table rows
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
                    <AlertCircle size={48} strokeWidth={1.5} opacity={0.3} />
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

                <ScrollArea>
                    <Table highlightOnHover verticalSpacing="sm" withTableBorder>
                        <Table.Thead style={{ position: 'sticky', top: 0, zIndex: 10, backgroundColor: 'var(--mantine-color-body)' }}>
                            <Table.Tr>
                                <Table.Th style={{ width: '60px' }}>状態</Table.Th>
                                <Table.Th>タイトル</Table.Th>
                                <Table.Th style={{ width: '100px' }}>優先度</Table.Th>
                                <Table.Th style={{ width: '120px' }}>期限</Table.Th>
                                <Table.Th style={{ width: '100px' }}>操作</Table.Th>
                            </Table.Tr>
                        </Table.Thead>
                        <Table.Tbody>
                            {displayTasks.map((task) => {
                                const isOverdue = task.deadline && new Date(task.deadline) < new Date();
                                const isSelected = selectedIds.has(task.id);

                                return (
                                    <Table.Tr
                                        key={task.id}
                                        className={`task-row ${isSelected ? 'selected' : ''}`}
                                        data-task-id={task.id}
                                        onClick={() => handleRowClick(task)}
                                        style={{
                                            cursor: 'pointer',
                                            opacity: isSelected ? 0.9 : 1,
                                        }}
                                    >
                                        {/* Status Checkbox */}
                                        <Table.Td onClick={(e) => e.stopPropagation()}>
                                            <Checkbox
                                                checked={task.status === 'DONE'}
                                                onChange={() => handleStatusToggle(task.id)}
                                                size="sm"
                                            />
                                        </Table.Td>

                                        {/* Title */}
                                        <Table.Td>
                                            <Text truncate style={{ maxWidth: '400px' }}>
                                                {task.title}
                                            </Text>
                                        </Table.Td>

                                        {/* Priority */}
                                        <Table.Td>
                                            {task.importance !== null && task.importance > 0 && (
                                                <Badge
                                                    color={
                                                        task.importance >= 80 ? 'red' :
                                                            task.importance >= 50 ? 'orange' : 'blue'
                                                    }
                                                    variant="light"
                                                    size="sm"
                                                >
                                                    {task.importance >= 80 ? '高' :
                                                        task.importance >= 50 ? '中' : '低'}
                                                </Badge>
                                            )}
                                        </Table.Td>

                                        {/* Due Date */}
                                        <Table.Td>
                                            {task.deadline && (
                                                <Text size="sm" c={isOverdue ? 'red' : 'dimmed'}>
                                                    {new Date(task.deadline).toLocaleDateString('ja-JP', {
                                                        month: 'short',
                                                        day: 'numeric',
                                                    })}
                                                </Text>
                                            )}
                                        </Table.Td>

                                        {/* Actions */}
                                        <Table.Td onClick={(e) => e.stopPropagation()}>
                                            <Group gap="xs">
                                                <ActionIcon
                                                    size="sm"
                                                    variant="subtle"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        onTaskClick?.(task);
                                                    }}
                                                >
                                                    <Pencil size={16} />
                                                </ActionIcon>
                                                <ActionIcon
                                                    size="sm"
                                                    variant="subtle"
                                                    color="red"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        handleDelete(task.id);
                                                    }}
                                                >
                                                    <Trash2 size={16} />
                                                </ActionIcon>
                                            </Group>
                                        </Table.Td>
                                    </Table.Tr>
                                );
                            })}
                        </Table.Tbody>
                    </Table>
                </ScrollArea>
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
