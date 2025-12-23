import { useState } from 'react';
import {
    Box, TextInput, Text, Badge, Checkbox,
    Drawer, Stack, Group, Button, Textarea,
    Select, ActionIcon, Table, ScrollArea, Tooltip
} from '@mantine/core';
import { DatePickerInput } from '@mantine/dates';
import { Search, Calendar, Filter, Clock, Repeat } from 'lucide-react';
import dayjs from 'dayjs';
import { useTaskStore } from '../../stores/taskStore';
import { getStatusConfig, getImportanceConfig } from '../../utils/taskUtils';
import type { Tables } from '../../supabase-types';
import { IconFolder, IconPencil } from '@tabler/icons-react';

type Task = Tables<'tasks'>;

export interface MobileListProps {
    currentViewId: string | null;
    setCurrentViewId: (id: string | null) => void;
}

export function MobileList({ currentViewId, setCurrentViewId }: MobileListProps) {
    // --- Store & State ---
    const {
        tasks,
        updateTask,
    } = useTaskStore();

    // Local filter state (search)
    const [searchQuery, setSearchQuery] = useState('');

    // Drawer state
    const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
    const [editForm, setEditForm] = useState<Task | null>(null);

    // --- Derived Data ---
    const displayTasks = tasks.filter(task => {
        // 1. Hierarchy Check
        const isChildOfCurrent = currentViewId
            ? task.parent_id === currentViewId
            : task.parent_id === null;

        if (!isChildOfCurrent && !searchQuery) return false;

        // If searching, we enforce hierarchy first as per requirement
        if (!isChildOfCurrent) return false;

        // 2. Search Check
        if (searchQuery && !task.title.toLowerCase().includes(searchQuery.toLowerCase())) {
            return false;
        }

        return true;
    });

    // Helper to check if task has children
    const hasChildren = (taskId: string) => {
        return tasks.some(t => t.parent_id === taskId);
    };

    // --- Handlers ---
    const handleTaskClick = (task: Task) => {
        setCurrentViewId(task.id);
    };

    const handleEditClick = (e: React.MouseEvent, task: Task) => {
        e.stopPropagation();
        setActiveTaskId(task.id);
        setEditForm({ ...task });
    };

    const handleSave = async () => {
        if (!editForm || !editForm.id) return;

        try {
            await updateTask(editForm.id, {
                title: editForm.title,
                description: editForm.description,
                importance: editForm.importance,
                deadline: editForm.deadline,
                estimate_minutes: editForm.estimate_minutes,
                planned_start: editForm.planned_start,
                planned_end: editForm.planned_end,
                status: editForm.status,
            });

            // Check status change strictly
            const originalTask = tasks.find(t => t.id === editForm.id);
            if (originalTask && editForm.status && originalTask.status !== editForm.status) {
                await useTaskStore.getState().updateTaskStatus(editForm.id, editForm.status);
            }

            setActiveTaskId(null);
            setEditForm(null);
        } catch (error) {
            console.error('Failed to update task:', error);
        }
    };

    const handleToggleComplete = async (e: React.MouseEvent, task: Task) => {
        e.stopPropagation();
        const newStatus = task.status === 'DONE' ? 'TODO' : 'DONE';
        await useTaskStore.getState().updateTaskStatus(task.id, newStatus);
    };

    // Helper for formatting
    const formatDate = (dateStr?: string | null) => {
        if (!dateStr) return '-';
        return dayjs(dateStr).format('MM/DD HH:mm');
    };

    return (
        <Box style={{ height: 'calc(100vh - 130px)', display: 'flex', flexDirection: 'column', backgroundColor: '#1A1B1E' }}>
            {/* 1. Fixed Header (Search & Filter) */}
            <Box p="md" style={{ borderBottom: '1px solid #2C2E33', backgroundColor: '#1A1B1E' }}>
                <Group gap="xs">
                    <TextInput
                        placeholder="検索..."
                        leftSection={<Search size={16} />}
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.currentTarget.value)}
                        style={{ flex: 1 }}
                        styles={{ input: { backgroundColor: '#25262B', borderColor: '#373A40', color: '#C1C2C5' } }}
                    />
                    <ActionIcon variant="light" color="gray" size="lg" radius="md">
                        <Filter size={20} />
                    </ActionIcon>
                </Group>
            </Box>

            {/* 2. Scrollable Table Area */}
            <ScrollArea style={{ flex: 1 }} type="never">
                <Table
                    withTableBorder={false}
                    withColumnBorders={false}
                    horizontalSpacing="md"
                    verticalSpacing="sm"
                    stickyHeader
                    style={{ minWidth: 1000 }} // Ensure horizontal scroll
                >
                    <Table.Thead bg="#1A1B1E">
                        <Table.Tr>
                            <Table.Th w={6} p={0} />
                            <Table.Th w={40} />
                            <Table.Th style={{ minWidth: 200, color: '#909296' }}>Task</Table.Th>
                            <Table.Th style={{ color: '#909296' }}>Imp</Table.Th>
                            <Table.Th style={{ color: '#909296' }}>Urg</Table.Th>
                            <Table.Th style={{ color: '#909296' }}>Status</Table.Th>
                            <Table.Th style={{ color: '#909296' }}>Est</Table.Th>
                            <Table.Th style={{ color: '#909296' }}>Deadline</Table.Th>
                            <Table.Th style={{ color: '#909296' }}>Plan Start</Table.Th>
                            <Table.Th style={{ color: '#909296' }}>Plan End</Table.Th>
                            <Table.Th style={{ color: '#909296' }}>Repeat</Table.Th>
                            <Table.Th w={50} />
                        </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                        {displayTasks.map((task) => {
                            const isDone = task.status === 'DONE' || task.status === 'done';
                            const importanceConfig = getImportanceConfig(task.importance || 0);
                            const statusConfig = getStatusConfig(task.status || 'todo');
                            const isFolder = hasChildren(task.id);

                            // Urgency Color
                            const urgency = task.urgency || 0;
                            let urgencyColor = 'gray';
                            if (urgency >= 80) urgencyColor = 'red';
                            else if (urgency >= 50) urgencyColor = 'orange';
                            else if (urgency >= 20) urgencyColor = 'blue';

                            return (
                                <Table.Tr
                                    key={task.id}
                                    onClick={() => handleTaskClick(task)}
                                    style={{
                                        cursor: 'pointer',
                                        backgroundColor: isDone ? 'rgba(0,0,0,0.2)' : undefined,
                                        transition: 'background-color 0.2s',
                                        '&:hover': { backgroundColor: '#25262B' }
                                    }}
                                >
                                    {/* 1. Color Bar */}
                                    <Table.Td p={0} w={6}>
                                        <Box w={6} h={40} bg={statusConfig.color} style={{ borderRadius: '0 4px 4px 0' }} />
                                    </Table.Td>

                                    {/* 2. Checkbox */}
                                    <Table.Td w={40} pl="xs">
                                        <Checkbox
                                            checked={isDone}
                                            onChange={() => { }}
                                            onClick={(e) => handleToggleComplete(e, task)}
                                            color="green"
                                            radius="xl"
                                            size="sm"
                                            style={{ cursor: 'pointer' }}
                                        />
                                    </Table.Td>

                                    {/* 3. Task Title & Folder Icon */}
                                    <Table.Td>
                                        <Group gap="xs" wrap="nowrap">
                                            <IconFolder
                                                size={18}
                                                fill={isFolder ? "#FFD43B" : "none"}
                                                color={isFolder ? "#FAB005" : "#5c5f66"}
                                            />
                                            <Text
                                                c="#C1C2C5"
                                                fw={500}
                                                size="sm"
                                                lineClamp={2}
                                                td={isDone ? 'line-through' : undefined}
                                                opacity={isDone ? 0.6 : 1}
                                            >
                                                {task.title}
                                            </Text>
                                        </Group>
                                    </Table.Td>

                                    {/* 4. Importance */}
                                    <Table.Td>
                                        <Badge
                                            color={importanceConfig.color}
                                            variant="light"
                                            size="sm"
                                        >
                                            {importanceConfig.label}
                                        </Badge>
                                    </Table.Td>

                                    {/* 5. Urgency (NEW) */}
                                    <Table.Td>
                                        <Badge
                                            color={urgencyColor}
                                            variant="outline"
                                            size="sm"
                                        >
                                            {urgency}
                                        </Badge>
                                    </Table.Td>

                                    {/* 6. Status */}
                                    <Table.Td>
                                        <Badge
                                            color={statusConfig.color}
                                            variant="outline"
                                            size="sm"
                                        >
                                            {statusConfig.label}
                                        </Badge>
                                    </Table.Td>

                                    {/* 7. Estimate (NEW) */}
                                    <Table.Td>
                                        <Group gap={4}>
                                            <Clock size={14} color="#5c5f66" />
                                            <Text size="sm" c="dimmed">
                                                {task.estimate_minutes ? `${task.estimate_minutes}min` : '-'}
                                            </Text>
                                        </Group>
                                    </Table.Td>

                                    {/* 8. Deadline */}
                                    <Table.Td>
                                        <Group gap={4}>
                                            <Calendar size={14} color="#5c5f66" />
                                            <Text size="sm" c="dimmed">
                                                {formatDate(task.deadline)}
                                            </Text>
                                        </Group>
                                    </Table.Td>

                                    {/* 9. Plan Start (NEW) */}
                                    <Table.Td>
                                        <Text size="sm" c="dimmed">
                                            {formatDate(task.planned_start)}
                                        </Text>
                                    </Table.Td>

                                    {/* 10. Plan End (NEW) */}
                                    <Table.Td>
                                        <Text size="sm" c="dimmed">
                                            {formatDate(task.planned_end)}
                                        </Text>
                                    </Table.Td>

                                    {/* 11. Recurrence (NEW) */}
                                    <Table.Td>
                                        {task.recurrence ? (
                                            <Repeat size={16} color="#74c0fc" />
                                        ) : (
                                            <Text size="sm" c="dimmed">-</Text>
                                        )}
                                    </Table.Td>

                                    {/* 12. Action (Edit) */}
                                    <Table.Td w={50} align="right">
                                        <ActionIcon
                                            variant="subtle"
                                            color="gray"
                                            onClick={(e) => handleEditClick(e, task)}
                                        >
                                            <IconPencil size={18} />
                                        </ActionIcon>
                                    </Table.Td>
                                </Table.Tr>
                            );
                        })}
                        {displayTasks.length === 0 && (
                            <Table.Tr>
                                <Table.Td colSpan={12}>
                                    <Text ta="center" c="dimmed" py="xl">
                                        タスクがありません
                                    </Text>
                                </Table.Td>
                            </Table.Tr>
                        )}
                    </Table.Tbody>
                </Table>
            </ScrollArea>

            {/* Edit Drawer */}
            <Drawer
                opened={!!activeTaskId}
                onClose={() => {
                    setActiveTaskId(null);
                    setEditForm(null);
                }}
                position="bottom"
                size="90%"
                title={<Text fw={700} c="#C1C2C5">タスク編集</Text>}
                padding="md"
                zIndex={2000}
                styles={{
                    content: { backgroundColor: '#1A1B1E', color: '#C1C2C5' },
                    header: { backgroundColor: '#1A1B1E', color: '#C1C2C5' }
                }}
            >
                {editForm && (
                    <Stack gap="md" pb={50}>
                        <TextInput
                            label="タイトル"
                            value={editForm.title}
                            onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                            styles={{ input: { backgroundColor: '#25262B', borderColor: '#373A40', color: '#C1C2C5' }, label: { color: '#C1C2C5' } }}
                        />

                        <Textarea
                            label="詳細"
                            value={editForm.description || ''}
                            onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                            minRows={2}
                            styles={{ input: { backgroundColor: '#25262B', borderColor: '#373A40', color: '#C1C2C5' }, label: { color: '#C1C2C5' } }}
                        />

                        <Group grow>
                            <Select
                                label="ステータス"
                                value={editForm.status || 'TODO'}
                                onChange={(val) => val && setEditForm({ ...editForm, status: val as any })}
                                data={['TODO', 'DOING', 'DONE']}
                                styles={{ input: { backgroundColor: '#25262B', borderColor: '#373A40', color: '#C1C2C5' }, label: { color: '#C1C2C5' } }}
                            />
                            <Select
                                label="重要度"
                                value={(editForm.importance || 0) >= 80 ? 'high' : (editForm.importance || 0) >= 50 ? 'medium' : 'low'}
                                onChange={(val) => {
                                    let numVal = 50;
                                    if (val === 'high') numVal = 80;
                                    if (val === 'medium') numVal = 50;
                                    if (val === 'low') numVal = 20;
                                    setEditForm({ ...editForm, importance: numVal });
                                }}
                                data={[
                                    { value: 'high', label: 'High' },
                                    { value: 'medium', label: 'Medium' },
                                    { value: 'low', label: 'Low' }
                                ]}
                                styles={{ input: { backgroundColor: '#25262B', borderColor: '#373A40', color: '#C1C2C5' }, label: { color: '#C1C2C5' } }}
                            />
                        </Group>

                        <Group grow>
                            <TextInput
                                label="見積(分)"
                                type="number"
                                value={editForm.estimate_minutes || ''}
                                onChange={(e) => setEditForm({ ...editForm, estimate_minutes: e.target.value ? Number(e.target.value) : null })}
                                styles={{ input: { backgroundColor: '#25262B', borderColor: '#373A40', color: '#C1C2C5' }, label: { color: '#C1C2C5' } }}
                            />
                        </Group>

                        <DatePickerInput
                            label="期限"
                            value={editForm.deadline ? new Date(editForm.deadline) : null}
                            onChange={(date: Date | null) => setEditForm({ ...editForm, deadline: date ? date.toISOString() : null })}
                            leftSection={<Calendar size={16} />}
                            clearable
                            styles={{ input: { backgroundColor: '#25262B', borderColor: '#373A40', color: '#C1C2C5' }, label: { color: '#C1C2C5' } }}
                        />

                        <DatePickerInput
                            label="開始予定"
                            value={editForm.planned_start ? new Date(editForm.planned_start) : null}
                            onChange={(date: Date | null) => setEditForm({ ...editForm, planned_start: date ? date.toISOString() : null })}
                            leftSection={<Calendar size={16} />}
                            clearable
                            styles={{ input: { backgroundColor: '#25262B', borderColor: '#373A40', color: '#C1C2C5' }, label: { color: '#C1C2C5' } }}
                        />

                        <DatePickerInput
                            label="終了予定"
                            value={editForm.planned_end ? new Date(editForm.planned_end) : null}
                            onChange={(date: Date | null) => setEditForm({ ...editForm, planned_end: date ? date.toISOString() : null })}
                            leftSection={<Calendar size={16} />}
                            clearable
                            styles={{ input: { backgroundColor: '#25262B', borderColor: '#373A40', color: '#C1C2C5' }, label: { color: '#C1C2C5' } }}
                        />

                        <Button fullWidth onClick={handleSave} mt="md">
                            保存する
                        </Button>
                    </Stack>
                )}
            </Drawer>
        </Box>
    );
}
