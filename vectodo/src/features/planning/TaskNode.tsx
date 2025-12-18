import { memo } from 'react';
import { Handle, Position, type NodeProps } from 'reactflow';
import { Paper, Text, Badge, Stack, useMantineColorScheme } from '@mantine/core';

interface TaskNodeData {
    title: string;
    status?: string | null;
    importance?: number | null;
}

export const TaskNode = memo(({ data }: NodeProps<TaskNodeData>) => {
    const { colorScheme } = useMantineColorScheme();
    const isDark = colorScheme === 'dark';

    const getStatusColor = (status: string | null | undefined): string => {
        switch (status) {
            case 'done':
            case 'completed':
                return 'gray';
            case 'in_progress':
                return 'blue';
            default:
                return 'cyan';
        }
    };

    const getImportanceSize = (importance: number | null | undefined): string => {
        if (!importance) return 'sm';
        return importance >= 4 ? 'md' : 'sm';
    };

    const importance = data.importance || 0;
    const isHighImportance = importance >= 4;

    // Theme-aware colors
    const bgColor = isDark ? '#fff' : '#2c2e33';
    const textColor = isDark ? '#000' : '#fff';
    const borderColor = isHighImportance
        ? '#228be6'
        : isDark ? '#dee2e6' : '#495057';

    return (
        <Paper
            shadow="sm"
            p="xs"
            withBorder
            style={{
                minWidth: 150,
                maxWidth: 200,
                border: `2px solid ${borderColor}`,
                backgroundColor: bgColor,
                color: textColor,
                cursor: 'pointer',
            }}
        >
            <Handle type="target" position={Position.Left} />

            <Stack gap={4}>
                <Text
                    size={getImportanceSize(importance)}
                    fw={isHighImportance ? 700 : 500}
                    lineClamp={2}
                    c={textColor}
                >
                    {data.title}
                </Text>

                {data.status && (
                    <Badge size="xs" color={getStatusColor(data.status)}>
                        {data.status}
                    </Badge>
                )}

                {importance > 0 && (
                    <Badge size="xs" color="orange" variant="light">
                        重要度: {importance}
                    </Badge>
                )}
            </Stack>

            <Handle type="source" position={Position.Right} />
        </Paper >
    );
});

TaskNode.displayName = 'TaskNode';
