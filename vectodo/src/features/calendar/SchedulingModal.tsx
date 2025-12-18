import { useState } from 'react';
import { Modal, Select, Button, Stack, Text, Group, Badge } from '@mantine/core';
import { Clock } from 'lucide-react';
import { useTaskStore, getUnscheduledTasks } from '../../stores/taskStore';

interface SchedulingModalProps {
    opened: boolean;
    onClose: () => void;
    timeSlot: { start: Date; end: Date } | null;
}

export function SchedulingModal({ opened, onClose, timeSlot }: SchedulingModalProps) {
    const { updateTask, loading } = useTaskStore();
    const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);

    const unscheduledTasks = getUnscheduledTasks();

    const handleSchedule = async () => {
        if (!selectedTaskId || !timeSlot) return;

        await updateTask(selectedTaskId, {
            planned_start: timeSlot.start.toISOString(),
            planned_end: timeSlot.end.toISOString(),
        });

        setSelectedTaskId(null);
        onClose();
    };

    const handleClose = () => {
        setSelectedTaskId(null);
        onClose();
    };

    const formatTime = (date: Date) => {
        return date.toLocaleString('ja-JP', {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        });
    };

    return (
        <Modal
            opened={opened}
            onClose={handleClose}
            title="タスクをスケジュール"
            size="md"
        >
            <Stack gap="md">
                {timeSlot && (
                    <Group gap="xs">
                        <Clock size={16} />
                        <Text size="sm" c="dimmed">
                            {formatTime(timeSlot.start)} 〜 {formatTime(timeSlot.end)}
                        </Text>
                    </Group>
                )}

                {unscheduledTasks.length === 0 ? (
                    <Text c="dimmed" ta="center" py="md">
                        スケジュール可能なタスクがありません
                    </Text>
                ) : (
                    <>
                        <Select
                            label="タスクを選択"
                            placeholder="タスクを選んでください"
                            data={unscheduledTasks.map(task => ({
                                value: task.id,
                                label: task.title,
                            }))}
                            value={selectedTaskId}
                            onChange={setSelectedTaskId}
                            searchable
                        />

                        {selectedTaskId && (
                            <Stack gap="xs">
                                {(() => {
                                    const task = unscheduledTasks.find(t => t.id === selectedTaskId);
                                    if (!task) return null;

                                    return (
                                        <>
                                            {task.description && (
                                                <Text size="sm" c="dimmed">
                                                    {task.description}
                                                </Text>
                                            )}
                                            <Group gap="xs">
                                                {task.estimate_minutes && (
                                                    <Badge variant="light" color="blue">
                                                        見積: {task.estimate_minutes}分
                                                    </Badge>
                                                )}
                                                {task.urgency !== null && task.importance !== null && (
                                                    <Badge variant="light" color="orange">
                                                        U{task.urgency}/I{task.importance}
                                                    </Badge>
                                                )}
                                            </Group>
                                        </>
                                    );
                                })()}
                            </Stack>
                        )}
                    </>
                )}

                <Group justify="flex-end" mt="md">
                    <Button variant="subtle" onClick={handleClose}>
                        キャンセル
                    </Button>
                    <Button
                        onClick={handleSchedule}
                        disabled={!selectedTaskId || loading}
                        loading={loading}
                    >
                        決定
                    </Button>
                </Group>
            </Stack>
        </Modal>
    );
}
