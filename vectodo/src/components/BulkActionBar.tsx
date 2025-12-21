import { Paper, Group, Text, Button, ActionIcon, Affix, Divider } from '@mantine/core';
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
        <Affix position={{ bottom: 32, left: '50%' }} style={{ transform: 'translateX(-50%)' }}>
            <Paper
                className="bulk-action-bar"
                shadow="md"
                p="md"
                radius="xl"
                withBorder
                style={{
                    animation: 'slideUp 0.3s ease-out',
                }}
            >
                <style>
                    {`
                        @keyframes slideUp {
                            from {
                                opacity: 0;
                                transform: translateY(20px);
                            }
                            to {
                                opacity: 1;
                                transform: translateY(0);
                            }
                        }
                    `}
                </style>

                <Group gap="md" wrap="nowrap">
                    {/* Selection Count */}
                    <Text size="sm" fw={500}>
                        {selectedIds.size}件選択中
                    </Text>

                    <Divider orientation="vertical" />

                    {/* Complete Button */}
                    <Button
                        leftSection={<CheckCircle size={16} />}
                        size="sm"
                        variant="filled"
                        color="green"
                        onClick={onComplete}
                    >
                        完了にする
                    </Button>

                    {/* Delete Button */}
                    <Button
                        leftSection={<Trash size={16} />}
                        size="sm"
                        variant="filled"
                        color="red"
                        onClick={onDelete}
                    >
                        削除する
                    </Button>

                    <Divider orientation="vertical" />

                    {/* Close Button */}
                    <ActionIcon
                        variant="subtle"
                        color="gray"
                        onClick={onCancel}
                        size="lg"
                    >
                        <X size={18} />
                    </ActionIcon>
                </Group>
            </Paper>
        </Affix>
    );
}
