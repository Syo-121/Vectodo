import { memo } from 'react';
import { Handle, Position, type NodeProps } from 'reactflow';
import { Paper, Text, Badge, Group, Stack, useMantineColorScheme, ThemeIcon, Tooltip } from '@mantine/core';
import { Calendar, AlertCircle, Repeat } from 'lucide-react';
import dayjs from 'dayjs';
import { getStatusConfig } from '../../utils/taskUtils';
import { calculateUrgencyFromDeadline } from '../../utils/urgency';

interface TaskNodeData {
    title: string;
    status?: string | null;
    importance?: number | null;
    deadline?: string | null;
    estimate_minutes?: number | null;
    recurrence?: any;
}

export const TaskNode = memo(({ data, selected }: NodeProps<TaskNodeData>) => {
    const { colorScheme } = useMantineColorScheme();
    const isDark = colorScheme === 'dark';



    const statusConfig = getStatusConfig(data.status);
    const borderColor = statusConfig.color;

    // Calculate urgency for highlighting
    const urgencyConfig = calculateUrgencyFromDeadline(data.deadline, data.status);
    const isHighUrgency = urgencyConfig.level >= 80; // High or Highest

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

    // Theme-aware styles with urgency highlight
    // Use dark[5] for even better visibility against dark background
    const bgColor = isDark ? 'var(--mantine-color-dark-5)' : '#fff';
    const textColor = isDark ? '#fff' : '#000';

    // Add subtle red/orange tint for high urgency tasks
    const urgencyOverlay = isHighUrgency
        ? (urgencyConfig.level >= 95 ? 'rgba(250, 82, 82, 0.15)' : 'rgba(253, 126, 20, 0.12)') // Red for highest, orange for high
        : 'transparent';

    return (
        <Paper
            shadow="sm"
            p="xs"
            radius="md"
            style={{
                minWidth: 220,
                maxWidth: 260, // Slightly wider to accommodate right-side time
                backgroundColor: bgColor,
                backgroundImage: `linear-gradient(${urgencyOverlay}, ${urgencyOverlay})`,
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

                        {/* Deadline (icon + text) + Recurrence */}
                        {(deadlineText || data.recurrence) && (
                            <Group gap={2} align="center">
                                {deadlineText && (
                                    <>
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
                                    </>
                                )}
                                {/* Recurrence indicator */}
                                {data.recurrence && (
                                    <Tooltip label="繰り返しタスク">
                                        <Repeat size={12} style={{ flexShrink: 0, opacity: 0.6 }} />
                                    </Tooltip>
                                )}
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
