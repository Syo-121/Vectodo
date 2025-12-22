import { useEffect, useMemo, useState } from 'react';
import { Stack, Text, Loader, Alert, Center, Checkbox, Table, ActionIcon, Badge, ScrollArea, Menu, TextInput, Group, Tooltip } from '@mantine/core';
import { DateTimePicker } from '@mantine/dates';
import { AlertCircle, Trash2, Circle, Play, Pause, CheckCircle, ArrowUp, ArrowRight, ArrowDown, FolderOpen, Pencil, Flame, Clock, Repeat } from 'lucide-react';
import { useTaskStore } from '../stores/taskStore';
import { BulkActionBar } from './BulkActionBar';
import type { Tables } from '../supabase-types';
import { getStatusConfig, getImportanceConfig } from '../utils/taskUtils';
import { calculateUrgencyFromDeadline } from '../utils/urgency';

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
        updateTaskImportance,
        setCurrentProject
    } = useTaskStore();
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
    const [editingTitle, setEditingTitle] = useState<string>('');

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
        if (!confirm(`${selectedIds.size}件のタスクを削除しますか？`)) {
            return;
        }
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

    // Handle status change from menu (supports all statuses)
    const handleStatusChange = async (taskId: string, newStatus: string) => {
        await updateTaskStatus(taskId, newStatus);
    };

    // Handle importance change
    const handleImportanceChange = async (taskId: string, importance: number | null) => {
        await updateTaskImportance(taskId, importance);
    };



    // Handle title inline editing
    const handleTitleUpdate = async (taskId: string, newTitle: string) => {
        if (!newTitle.trim()) {
            setEditingTaskId(null);
            setEditingTitle('');
            return;
        }

        const { supabase } = await import('../lib/supabaseClient');
        const { error } = await supabase
            .from('tasks')
            .update({ title: newTitle.trim() })
            .eq('id', taskId);

        if (error) {
            console.error('Failed to update title:', error);
        }

        setEditingTaskId(null);
        setEditingTitle('');
        await fetchTasks();
    };

    // Handle schedule start time change
    const handleScheduleStartChange = async (taskId: string, dateValue: string | null) => {
        const date = dateValue ? new Date(dateValue) : null;
        const { supabase } = await import('../lib/supabaseClient');
        const { error } = await supabase
            .from('tasks')
            .update({
                planned_start: date?.toISOString() ?? null,
                planned_end: null // Clear end when changing start independently
            })
            .eq('id', taskId);

        if (error) {
            console.error('Failed to update schedule:', error);
            return;
        }

        await fetchTasks();
    };

    // Handle schedule end time change
    const handleScheduleEndChange = async (taskId: string, dateValue: string | null) => {
        const date = dateValue ? new Date(dateValue) : null;
        const { supabase } = await import('../lib/supabaseClient');
        const { error } = await supabase
            .from('tasks')
            .update({ planned_end: date?.toISOString() ?? null })
            .eq('id', taskId);

        if (error) {
            console.error('Failed to update schedule end:', error);
            return;
        }

        await fetchTasks();
    };

    // Handle deadline change
    const handleDeadlineChange = async (taskId: string, dateValue: string | null) => {
        const date = dateValue ? new Date(dateValue) : null;
        const { supabase } = await import('../lib/supabaseClient');
        const { error } = await supabase
            .from('tasks')
            .update({ deadline: date?.toISOString() ?? null })
            .eq('id', taskId);

        if (error) {
            console.error('Failed to update deadline:', error);
            return;
        }

        await fetchTasks();
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

    // Handle selection checkbox toggle (separate from status)
    const handleToggleSelection = (taskId: string) => {
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

    // Handle select all / deselect all
    const handleToggleSelectAll = () => {
        if (selectedIds.size === displayTasks.length && displayTasks.length > 0) {
            // All selected, so deselect all
            setSelectedIds(new Set());
        } else {
            // Select all visible tasks
            setSelectedIds(new Set(displayTasks.map(t => t.id)));
        }
    };

    const handleCancelSelection = () => {
        setSelectedIds(new Set());
        // Clear visual selection - updated for task-row
        document.querySelectorAll('.task-row.selected').forEach(el => {
            el.classList.remove('selected');
        });
    };





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
                className="task-list-container"
                style={{ minHeight: '100%', flexGrow: 1 }}
            >
                <Text size="sm" c="dimmed">
                    {displayTasks.length}件のタスク
                </Text>

                <ScrollArea>
                    <Table
                        verticalSpacing="xs"
                        withTableBorder
                        styles={{
                            th: { paddingTop: '6px', paddingBottom: '6px', verticalAlign: 'middle' },
                            td: { paddingTop: '4px', paddingBottom: '4px', verticalAlign: 'middle' },
                            tr: {
                                transition: 'background-color 150ms ease',
                                ':hover:not(:has(input:focus))': {
                                    backgroundColor: 'light-dark(var(--mantine-color-gray-0), var(--mantine-color-dark-5))',
                                },
                            },
                        }}
                    >
                        <Table.Thead style={{ position: 'sticky', top: 0, zIndex: 10, backgroundColor: 'var(--mantine-color-body)' }}>
                            <Table.Tr>
                                <Table.Th style={{ width: '50px' }}>
                                    {/* Select All Checkbox */}
                                    <Checkbox
                                        checked={selectedIds.size === displayTasks.length && displayTasks.length > 0}
                                        indeterminate={selectedIds.size > 0 && selectedIds.size < displayTasks.length}
                                        onChange={handleToggleSelectAll}
                                        size="sm"
                                    />
                                </Table.Th>
                                <Table.Th style={{ width: '60px' }}>完了</Table.Th>
                                <Table.Th style={{ width: '120px' }}>ステータス</Table.Th>
                                <Table.Th style={{ width: '130px' }}>重要度</Table.Th>
                                <Table.Th style={{ width: '130px' }}>緊急度</Table.Th>
                                <Table.Th>タイトル</Table.Th>
                                <Table.Th style={{ width: '140px' }}>開始</Table.Th>
                                <Table.Th style={{ width: '140px' }}>終了</Table.Th>
                                <Table.Th style={{ width: '150px' }}>期限</Table.Th>
                                <Table.Th style={{ width: '100px' }}>操作</Table.Th>
                            </Table.Tr>
                        </Table.Thead>
                        <Table.Tbody>
                            {displayTasks.map((task) => {
                                const isOverdue = task.deadline && new Date(task.deadline) < new Date();
                                const isSelected = selectedIds.has(task.id);
                                const isDone = task.status === 'DONE';

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
                                        {/* Selection Checkbox (Square, Blue) */}
                                        <Table.Td onClick={(e) => e.stopPropagation()}>
                                            <Checkbox
                                                checked={isSelected}
                                                onChange={() => handleToggleSelection(task.id)}
                                                size="sm"
                                                radius="sm"
                                            />
                                        </Table.Td>

                                        {/* Status Checkbox (Circular, Green) */}
                                        <Table.Td onClick={(e) => e.stopPropagation()}>
                                            <Checkbox
                                                checked={isDone}
                                                onChange={() => handleStatusToggle(task.id)}
                                                size="sm"
                                                radius="xl"
                                                color={isDone ? 'green' : 'gray'}
                                            />
                                        </Table.Td>

                                        {/* Status Menu */}
                                        <Table.Td onClick={(e) => e.stopPropagation()}>
                                            <Menu shadow="md" width={180}>
                                                <Menu.Target>
                                                    <Badge
                                                        color={getStatusConfig(task.status).color}
                                                        variant="light"
                                                        size="sm"
                                                        style={{ cursor: 'pointer', minHeight: '22px', display: 'inline-flex', alignItems: 'center' }}
                                                    >
                                                        {getStatusConfig(task.status).label}
                                                    </Badge>
                                                </Menu.Target>
                                                <Menu.Dropdown>
                                                    <Menu.Item
                                                        leftSection={<Circle size={16} />}
                                                        onClick={() => handleStatusChange(task.id, 'TODO')}
                                                    >
                                                        To Do
                                                    </Menu.Item>
                                                    <Menu.Item
                                                        leftSection={<Play size={16} />}
                                                        onClick={() => handleStatusChange(task.id, 'DOING')}
                                                        color="blue"
                                                    >
                                                        In Progress
                                                    </Menu.Item>
                                                    <Menu.Item
                                                        leftSection={<Pause size={16} />}
                                                        onClick={() => handleStatusChange(task.id, 'PENDING')}
                                                        color="yellow"
                                                    >
                                                        Pending
                                                    </Menu.Item>
                                                    <Menu.Item
                                                        leftSection={<CheckCircle size={16} />}
                                                        onClick={() => handleStatusChange(task.id, 'DONE')}
                                                        color="green"
                                                    >
                                                        Done
                                                    </Menu.Item>
                                                </Menu.Dropdown>
                                            </Menu>
                                        </Table.Td>

                                        {/* Importance Menu */}
                                        <Table.Td onClick={(e) => e.stopPropagation()}>
                                            <Menu shadow="md" width={160}>
                                                <Menu.Target>
                                                    {task.importance !== null && task.importance > 0 ? (
                                                        <Badge
                                                            color={getImportanceConfig(task.importance).color}
                                                            variant="light"
                                                            size="sm"
                                                            style={{ cursor: 'pointer', minHeight: '22px', display: 'inline-flex', alignItems: 'center' }}
                                                            leftSection={
                                                                task.importance >= 80 ? <ArrowUp size={12} /> :
                                                                    task.importance >= 50 ? <ArrowRight size={12} /> :
                                                                        <ArrowDown size={12} />
                                                            }
                                                        >
                                                            {getImportanceConfig(task.importance).label}
                                                        </Badge>
                                                    ) : (
                                                        <Badge
                                                            color="gray"
                                                            variant="light"
                                                            size="sm"
                                                            style={{ cursor: 'pointer', minHeight: '22px', display: 'inline-flex', alignItems: 'center' }}
                                                        >
                                                            -
                                                        </Badge>
                                                    )}
                                                </Menu.Target>
                                                <Menu.Dropdown>
                                                    <Menu.Item
                                                        leftSection={<ArrowUp size={16} />}
                                                        onClick={() => handleImportanceChange(task.id, 90)}
                                                        color="violet"
                                                    >
                                                        緊急度: 高
                                                    </Menu.Item>
                                                    <Menu.Item
                                                        leftSection={<ArrowRight size={16} />}
                                                        onClick={() => handleImportanceChange(task.id, 50)}
                                                        color="grape"
                                                    >
                                                        緊急度: 中
                                                    </Menu.Item>
                                                    <Menu.Item
                                                        leftSection={<ArrowDown size={16} />}
                                                        onClick={() => handleImportanceChange(task.id, 20)}
                                                        color="indigo"
                                                    >
                                                        緊急度: 低
                                                    </Menu.Item>
                                                    <Menu.Divider />
                                                    <Menu.Item
                                                        onClick={() => handleImportanceChange(task.id, null)}
                                                        color="gray"
                                                    >
                                                        なし
                                                    </Menu.Item>
                                                </Menu.Dropdown>
                                            </Menu>
                                        </Table.Td>

                                        {/* Urgency Display (Auto-calculated) */}
                                        <Table.Td>
                                            {(() => {
                                                const urgencyConfig = calculateUrgencyFromDeadline(task.deadline, task.status);
                                                return (
                                                    <Badge
                                                        size="sm"
                                                        variant="light"
                                                        color={urgencyConfig.color}
                                                        style={{ cursor: 'default', minHeight: '22px', display: 'inline-flex', alignItems: 'center' }}
                                                        leftSection={
                                                            urgencyConfig.icon === 'alert' ? <AlertCircle size={12} /> :
                                                                urgencyConfig.icon === 'flame' ? <Flame size={12} /> :
                                                                    urgencyConfig.icon === 'warning' ? <Clock size={12} /> :
                                                                        null
                                                        }
                                                    >
                                                        {urgencyConfig.label}
                                                    </Badge>
                                                );
                                            })()}
                                        </Table.Td>

                                        {/* Title column: Folder icon + Input */}
                                        <Table.Td onClick={(e) => e.stopPropagation()}>
                                            <Group gap="xs" wrap="nowrap">
                                                <Tooltip label="このタスクを開く (階層移動)" openDelay={500}>
                                                    <ActionIcon
                                                        variant="subtle"
                                                        size="sm"
                                                        color="blue"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            setCurrentProject(task.id);
                                                        }}
                                                    >
                                                        <FolderOpen size={16} />
                                                    </ActionIcon>
                                                </Tooltip>

                                                <TextInput
                                                    value={editingTaskId === task.id ? editingTitle : task.title}
                                                    onChange={(e) => {
                                                        if (editingTaskId !== task.id) {
                                                            setEditingTaskId(task.id);
                                                            setEditingTitle(e.target.value);
                                                        } else {
                                                            setEditingTitle(e.target.value);
                                                        }
                                                    }}
                                                    onFocus={() => {
                                                        setEditingTaskId(task.id);
                                                        setEditingTitle(task.title);
                                                    }}
                                                    onBlur={() => {
                                                        if (editingTaskId === task.id && editingTitle !== task.title && editingTitle.trim()) {
                                                            handleTitleUpdate(task.id, editingTitle);
                                                        }
                                                        setEditingTaskId(null);
                                                        setEditingTitle('');
                                                        handleCancelSelection();
                                                    }}
                                                    onKeyDown={(e) => {
                                                        if (e.key === 'Enter') {
                                                            e.currentTarget.blur();
                                                        } else if (e.key === 'Escape') {
                                                            setEditingTaskId(null);
                                                            setEditingTitle('');
                                                            e.currentTarget.blur();
                                                        }
                                                    }}
                                                    variant="unstyled"
                                                    size="sm"
                                                    autoComplete="off"
                                                    style={{ maxWidth: '360px', flexGrow: 1 }}
                                                />
                                                {/* Recurrence indicator */}
                                                {task.recurrence && (
                                                    <Tooltip label="繰り返しタスク">
                                                        <Repeat size={14} color="var(--mantine-color-blue-6)" style={{ flexShrink: 0 }} />
                                                    </Tooltip>
                                                )}
                                            </Group>
                                        </Table.Td>


                                        {/* Schedule Start - Inline Editable */}
                                        <Table.Td onClick={(e) => e.stopPropagation()}>
                                            <DateTimePicker
                                                value={task.planned_start ? task.planned_start : null}
                                                onChange={(date) => handleScheduleStartChange(task.id, date)}
                                                clearable
                                                placeholder="未設定"
                                                size="xs"
                                                variant="unstyled"
                                                valueFormat="M月D日 HH:mm"
                                                style={{ width: '100%' }}
                                            />
                                        </Table.Td>

                                        {/* Schedule End - Inline Editable */}
                                        <Table.Td onClick={(e) => e.stopPropagation()}>
                                            <DateTimePicker
                                                value={task.planned_end ? task.planned_end : null}
                                                onChange={(date) => handleScheduleEndChange(task.id, date)}
                                                clearable
                                                placeholder="未設定"
                                                size="xs"
                                                variant="unstyled"
                                                valueFormat="M月D日 HH:mm"
                                                style={{ width: '100%' }}
                                            />
                                        </Table.Td>

                                        {/* Deadline - Inline Editable */}
                                        <Table.Td onClick={(e) => e.stopPropagation()}>
                                            <DateTimePicker
                                                value={task.deadline ? task.deadline : null}
                                                onChange={(date) => handleDeadlineChange(task.id, date)}
                                                clearable
                                                placeholder="未設定"
                                                size="xs"
                                                variant="unstyled"
                                                valueFormat="M月D日"
                                                style={{
                                                    width: '100%',
                                                    color: isOverdue && task.deadline ? 'var(--mantine-color-red-6)' : undefined
                                                }}
                                            />
                                        </Table.Td>

                                        {/* Actions: Edit & Delete */}
                                        <Table.Td onClick={(e) => e.stopPropagation()}>
                                            <Group gap={4} wrap="nowrap">
                                                <Tooltip label="詳細を編集" openDelay={500}>
                                                    <ActionIcon
                                                        size="sm"
                                                        variant="subtle"
                                                        color="gray"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            if (onTaskClick) onTaskClick(task);
                                                        }}
                                                    >
                                                        <Pencil size={16} />
                                                    </ActionIcon>
                                                </Tooltip>

                                                <Tooltip label="削除" openDelay={500}>
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
                                                </Tooltip>
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
