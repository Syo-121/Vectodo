import { memo } from 'react';
import { Handle, Position, type NodeProps } from 'reactflow';
import { Paper, Text, Badge, Group, Stack, useMantineColorScheme, ThemeIcon } from '@mantine/core';
import { Calendar, AlertCircle } from 'lucide-react';
import dayjs from 'dayjs';

interface TaskNodeData {
    title: string;
    status?: string | null;
    importance?: number | null;
    deadline?: string | null;
    estimate_minutes?: number | null;
}

export const TaskNode = memo(({ data, selected }: NodeProps<TaskNodeData>) => {
    const { colorScheme } = useMantineColorScheme();
    const isDark = colorScheme === 'dark';

    // Status config
    const getStatusConfig = (status: string | null | undefined) => {
        const s = status?.toUpperCase();
        if (s === 'DONE') return { color: 'green', label: 'Done' };
        if (s === 'DOING' || s === 'IN_PROGRESS') return { color: 'blue', label: 'In Progress' };
        if (s === 'PENDING') return { color: 'orange', label: 'Pending' };
        return { color: 'gray', label: 'To Do' };
    };

    const statusConfig = getStatusConfig(data.status);
    const borderColor = statusConfig.color;

    // Deadline processing
    const deadline = data.deadline ? dayjs(data.deadline) : null;
    const isOverdue = deadline ? deadline.isBefore(dayjs(), 'day') : false;
    const deadlineText = deadline ? deadline.format('M/D') : null;

    // Estimate formatting helper
    const getEstimateText = (minutes: number | null | undefined) => {
        if (!minutes) return null;
        if (minutes < 60) return { val: minutes, unit: 'm' };
        return { val: Math.round(minutes / 60 * 10) / 10, unit: 'h' };
    };
    const estimate = getEstimateText(data.estimate_minutes);

    // Theme-aware styles
    // Use dark[5] for even better visibility against dark background
    const bgColor = isDark ? 'var(--mantine-color-dark-5)' : '#fff';
    const textColor = isDark ? '#fff' : '#000';

    return (
        <Paper
            shadow="sm"
            p="xs"
            radius="md"
            style={{
                minWidth: 220,
                maxWidth: 260, // Slightly wider to accommodate right-side time
                backgroundColor: bgColor,
                color: textColor,
                // Use outline for selection to avoid conflicting with the status border
                border: '1px solid transparent',
                borderLeft: `6px solid var(--mantine-color-${borderColor}-filled)`, // Status strip
                outline: selected ? '2px solid var(--mantine-color-blue-filled)' : 'none',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                position: 'relative',
            }}
        >
            {/* Input Handle */}
            <Handle
                type="target"
                position={Position.Left}
                style={{ background: isDark ? '#fff' : '#555', width: 8, height: 8 }}
            />

            <Group justify="space-between" align="center" gap="xs" wrap="nowrap">
                {/* Left Area: Title & Meta */}
                <Stack gap={4} style={{ flex: 1, minWidth: 0 }}>
                    <Text
                        size="sm"
                        fw={700}
                        lineClamp={2}
                        lh={1.3}
                        title={data.title}
                    >
                        {data.title}
                    </Text>

                    <Group gap={6} align="center">
                        {/* Status Badge */}
                        <Badge
                            size="xs"
                            variant="light"
                            color={statusConfig.color}
                            radius="sm"
                            styles={{ root: { textTransform: 'none', paddingLeft: 6, paddingRight: 6 } }}
                        >
                            {statusConfig.label}
                        </Badge>

                        {/* Deadline (icon + text) */}
                        {deadlineText && (
                            <Group gap={2} align="center">
                                {isOverdue && <AlertCircle size={10} color="var(--mantine-color-red-6)" />}
                                <ThemeIcon variant="transparent" size="xs" color={isOverdue ? 'red' : 'dimmed'}>
                                    <Calendar size={12} />
                                </ThemeIcon>
                                <Text
                                    size="xs"
                                    c={isOverdue ? 'red' : 'dimmed'}
                                    fw={isOverdue ? 700 : 500}
                                >
                                    {deadlineText}
                                </Text>
                            </Group>
                        )}
                    </Group>
                </Stack>

                {/* Right Area: Estimated Time */}
                {estimate && (
                    <Stack align="center" gap={0} ml="xs" style={{ minWidth: '40px' }}>
                        <Text
                            size="xl"
                            fw={700}
                            c={isDark ? 'white' : 'dark'}
                            style={{ lineHeight: 1 }}
                        >
                            {estimate.val}
                            <Text span size="xs" fw={500} ml={1} style={{ opacity: 0.9 }}>
                                {estimate.unit}
                            </Text>
                        </Text>
                    </Stack>
                )}
            </Group>

            {/* Output Handle */}
            <Handle
                type="source"
                position={Position.Right}
                style={{ background: isDark ? '#fff' : '#555', width: 8, height: 8 }}
            />
        </Paper>
    );
});

TaskNode.displayName = 'TaskNode';
