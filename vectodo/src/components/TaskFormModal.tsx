import '@mantine/core/styles.css';
import '@mantine/dates/styles.css';
import { useEffect } from 'react';
import {
    Modal,
    TextInput,
    NumberInput,
    Select,
    Textarea,
    Button,
    Stack,
    Group,
} from '@mantine/core';
import { DateInput, DateTimePicker } from '@mantine/dates';
import { useForm } from '@mantine/form';
import { modals } from '@mantine/modals';
import { Save, Trash2 } from 'lucide-react';
import { useTaskStore, type TaskData } from '../stores/taskStore';
import { TEST_PROJECT_ID } from '../lib/constants';
import type { Tables } from '../supabase-types';
import dayjs from 'dayjs';

type Task = Tables<'tasks'>;

interface TaskFormModalProps {
    opened: boolean;
    onClose: () => void;
    task?: Task | null;
    onUnschedule?: () => void;
}

export function TaskFormModal({ opened, onClose, task, onUnschedule }: TaskFormModalProps) {
    const { addTask, updateTask, deleteTask, loading, tasks } = useTaskStore();

    // Helper function to get all descendants of a task (recursive)
    const getDescendants = (taskId: string): Set<string> => {
        const descendants = new Set<string>();
        const addChildren = (id: string) => {
            const children = tasks.filter(t => t.parent_id === id);
            children.forEach(child => {
                descendants.add(child.id);
                addChildren(child.id); // Recursive call for grandchildren
            });
        };
        addChildren(taskId);
        return descendants;
    };

    // Get available parent options (excluding self and descendants)
    const parentOptions = [
        { value: '', label: 'Root (最上位階層)' },
        ...tasks
            .filter(t => {
                // Exclude self when editing
                if (task && t.id === task.id) return false;
                // Exclude descendants to prevent circular reference
                if (task) {
                    const descendants = getDescendants(task.id);
                    if (descendants.has(t.id)) return false;
                }
                return true;
            })
            .map(t => ({
                value: t.id,
                label: t.title,
            })),
    ];

    const form = useForm({
        initialValues: {
            title: task?.title || '',
            description: task?.description || '',
            estimate_minutes: task?.estimate_minutes || null,
            deadline: task?.deadline ? new Date(task.deadline) : null,
            importance: task?.importance?.toString() || null,
            planned_start: task?.planned_start ? new Date(task.planned_start) : null,
            planned_end: task?.planned_end ? new Date(task.planned_end) : null,
            parent_id: task?.parent_id || '',
        },
        validate: {
            title: (value) => (!value || value.trim() === '' ? 'タイトルは必須です' : null),
            estimate_minutes: (value) =>
                value !== null && value < 0 ? '見積時間は0以上である必要があります' : null,
        },
        validateInputOnChange: true,
    });

    // Reset form when task changes
    useEffect(() => {
        if (opened) {
            form.setValues({
                title: task?.title || '',
                description: task?.description || '',
                estimate_minutes: task?.estimate_minutes || null,
                deadline: task?.deadline ? new Date(task.deadline) : null,
                importance: task?.importance?.toString() || null,
                planned_start: task?.planned_start ? new Date(task.planned_start) : null,
                planned_end: task?.planned_end ? new Date(task.planned_end) : null,
                parent_id: task?.parent_id || '',
            });
        }
    }, [task, opened]);

    const handleSubmit = async (values: typeof form.values) => {
        try {
            const taskData: TaskData = {
                title: values.title,
                project_id: TEST_PROJECT_ID,
                description: values.description || null,
                estimate_minutes: values.estimate_minutes,
                deadline: values.deadline ? dayjs(values.deadline).toISOString() : null,
                importance: values.importance ? parseInt(values.importance) : null,
                planned_start: values.planned_start ? dayjs(values.planned_start).toISOString() : null,
                planned_end: values.planned_end ? dayjs(values.planned_end).toISOString() : null,
            };

            if (task) {
                // Update existing task (including parent_id)
                await updateTask(task.id, {
                    ...taskData,
                    parent_id: values.parent_id || null,
                });
            } else {
                // Create new task (parent_id is handled automatically by store)
                await addTask(taskData);
            }

            onClose();
            setTimeout(() => {
                form.reset();
            }, 100);
        } catch (error) {
            console.error('Failed to save task:', error);
        }
    };

    const handleDelete = () => {
        if (!task) return;

        modals.openConfirmModal({
            title: 'タスクを削除',
            children: '本当にこのタスクを削除しますか？この操作は取り消せません。',
            labels: { confirm: '削除', cancel: 'キャンセル' },
            confirmProps: { color: 'red' },
            onConfirm: async () => {
                await deleteTask(task.id);
                onClose();
                setTimeout(() => {
                    form.reset();
                }, 100);
            },
        });
    };

    const handleClose = () => {
        onClose();
        setTimeout(() => {
            form.reset();
        }, 100);
    };

    return (
        <Modal
            opened={opened}
            onClose={handleClose}
            title={task ? 'タスクを編集' : '新規タスク作成'}
            size="lg"
            centered
        >
            <form onSubmit={form.onSubmit(handleSubmit)}>
                <Stack gap="md">
                    <TextInput
                        label="タイトル"
                        placeholder="タスク名を入力"
                        required
                        {...form.getInputProps('title')}
                    />

                    <Textarea
                        label="説明"
                        placeholder="タスクの詳細を入力（任意）"
                        minRows={3}
                        {...form.getInputProps('description')}
                    />

                    <NumberInput
                        label="見積時間（分）"
                        placeholder="例: 60"
                        min={0}
                        {...form.getInputProps('estimate_minutes')}
                    />

                    <DateInput
                        label="締め切り"
                        placeholder="日付を選択"
                        valueFormat="YYYY/MM/DD"
                        clearable
                        {...form.getInputProps('deadline')}
                    />

                    <Select
                        label="重要度"
                        placeholder="選択してください"
                        clearable
                        data={[
                            { value: '1', label: '1 - 低' },
                            { value: '2', label: '2' },
                            { value: '3', label: '3 - 中' },
                            { value: '4', label: '4' },
                            { value: '5', label: '5 - 高' },
                        ]}
                        {...form.getInputProps('importance')}
                    />

                    {/* Parent Project Selector - only show when editing */}
                    {task && (
                        <Select
                            label="親タスク"
                            placeholder="親タスクを選択（任意）"
                            clearable
                            searchable
                            data={parentOptions}
                            {...form.getInputProps('parent_id')}
                        />
                    )}

                    <DateTimePicker
                        label="開始日時 (Planned Start)"
                        placeholder="日時を選択"
                        valueFormat="YYYY/MM/DD HH:mm"
                        clearable
                        {...form.getInputProps('planned_start')}
                    />

                    <DateTimePicker
                        label="終了日時 (Planned End)"
                        placeholder="日時を選択"
                        valueFormat="YYYY/MM/DD HH:mm"
                        clearable
                        {...form.getInputProps('planned_end')}
                    />

                    <Group justify="space-between" mt="md">
                        {task ? (
                            <Button
                                variant="subtle"
                                color="red"
                                leftSection={<Trash2 size={16} />}
                                onClick={handleDelete}
                                disabled={loading}
                            >
                                削除
                            </Button>
                        ) : (
                            <div />
                        )}

                        {onUnschedule && task?.planned_start && (
                            <Button
                                color="orange"
                                variant="light"
                                onClick={onUnschedule}
                                disabled={loading}
                            >
                                スケジュール解除
                            </Button>
                        )}

                        <Group>
                            <Button variant="subtle" onClick={handleClose} disabled={loading}>
                                キャンセル
                            </Button>
                            <Button
                                type="submit"
                                leftSection={<Save size={16} />}
                                loading={loading}
                            >
                                保存
                            </Button>
                        </Group>
                    </Group>
                </Stack>
            </form>
        </Modal>
    );
}
