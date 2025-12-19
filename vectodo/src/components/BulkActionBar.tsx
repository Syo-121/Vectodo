import { Paper, Group, Text, Button, ActionIcon } from '@mantine/core';
import { Trash, CheckCircle, X } from 'lucide-react';

interface BulkActionBarProps {
    selectedIds: Set<string>;
    onComplete: () => void;
    onDelete: () => void;
    onCancel: () => void;
}

export function BulkActionBar({ selectedIds, onComplete, onDelete, onCancel }: BulkActionBarProps) {
    if (selectedIds.size === 0) return null;

    return (
        <Paper
            className="bulk-action-bar"
            shadow="xl"
            p="md"
            radius="md"
            withBorder
            style={{
                position: 'fixed',
                bottom: '2rem',
                left: '50%',
                transform: 'translateX(-50%)',
                zIndex: 1000,
                minWidth: '400px',
                animation: 'slideUp 0.3s ease-out',
            }}
        >
            <style>
                {`
                    @keyframes slideUp {
                        from {
                            opacity: 0;
                            transform: translateX(-50%) translateY(20px);
                        }
                        to {
                            opacity: 1;
                            transform: translateX(-50%) translateY(0);
                        }
                    }
                `}
            </style>

            <Group justify="space-between">
                <Text size="sm" fw={500}>
                    {selectedIds.size}件を選択中
                </Text>

                <Group gap="xs">
                    <Button
                        leftSection={<CheckCircle size={16} />}
                        size="sm"
                        variant="filled"
                        color="green"
                        onClick={onComplete}
                    >
                        完了にする
                    </Button>

                    <Button
                        leftSection={<Trash size={16} />}
                        size="sm"
                        variant="filled"
                        color="red"
                        onClick={onDelete}
                    >
                        削除
                    </Button>

                    <ActionIcon
                        variant="subtle"
                        color="gray"
                        onClick={onCancel}
                        size="lg"
                    >
                        <X size={18} />
                    </ActionIcon>
                </Group>
            </Group>
        </Paper>
    );
}
