import { useState } from 'react';
import {
    Box, TextInput, Text, Badge, Checkbox,
    Group, ActionIcon, Table, ScrollArea
} from '@mantine/core';
import { Search, Filter, Clock, Repeat, Calendar } from 'lucide-react';
import dayjs from 'dayjs';
import { useTaskStore } from '../../stores/taskStore';
import { getStatusConfig, getImportanceConfig } from '../../utils/taskUtils';
import type { Tables } from '../../supabase-types';
import { IconFolder, IconPencil } from '@tabler/icons-react';

type Task = Tables<'tasks'>;

export interface MobileListProps {
    currentViewId: string | null;
    setCurrentViewId: (id: string | null) => void;
    onEditTask: (task: Task) => void;
}

export function MobileList({ currentViewId, setCurrentViewId, onEditTask }: MobileListProps) {
    // --- Store & State ---
    const {
        tasks,
    } = useTaskStore();

    // Local filter state (search)
    const [searchQuery, setSearchQuery] = useState('');

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
        onEditTask(task);
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
        </Box>
    );
}
