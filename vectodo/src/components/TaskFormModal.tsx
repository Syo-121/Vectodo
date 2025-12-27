import '@mantine/core/styles.css';
import '@mantine/dates/styles.css';
import { useEffect, useState, useMemo } from 'react';
import {
    Modal,
    TextInput,
    NumberInput,
    Select,
    Textarea,
    Button,
    Stack,
    Group,
    SimpleGrid,
    SegmentedControl,
    Text,
    Divider,
    Chip,
} from '@mantine/core';
import { DateInput, DateTimePicker } from '@mantine/dates';
import { useForm } from '@mantine/form';
import { modals } from '@mantine/modals';
import { Save, Trash2, Clock, Zap, Repeat } from 'lucide-react';
import { useTaskStore, type TaskData } from '../stores/taskStore';
import { useToastStore } from '../stores/useToastStore';
import { TEST_PROJECT_ID } from '../lib/constants';
import type { Tables } from '../supabase-types';
import dayjs from 'dayjs';
import { type Recurrence } from '../utils/recurrence';

type Task = Tables<'tasks'>;

interface TaskFormModalProps {
    opened: boolean;
    onClose: () => void;
    task?: Task | null;
    onUnschedule?: () => void;
    initialParentId?: string | null;
    isMobile?: boolean;
}

export function TaskFormModal({ opened, onClose, task, onUnschedule, initialParentId, isMobile = false }: TaskFormModalProps) {
    const { addTask, updateTask, deleteTask, loading, tasks, updateTaskStatus } = useTaskStore();
    const { addToast } = useToastStore();

    // Helper function to get all descendants of a task (recursive)
    const descendants = useMemo(() => {
        if (!task) return new Set<string>();

        const result = new Set<string>();
        const addChildren = (id: string) => {
            const children = tasks.filter(t => t.parent_id === id);
            children.forEach(child => {
                result.add(child.id);
                addChildren(child.id); // Recursive call for grandchildren
            });
        };
        addChildren(task.id);
        return result;
    }, [task, tasks]);

    // Get available parent options (excluding self and descendants)
    const parentOptions = useMemo(() => {
        return [
            { value: '', label: 'Root (最上位階層)' },
            ...tasks
                .filter(t => {
                    if (task && t.id === task.id) return false;
                    if (task) {
                        if (descendants.has(t.id)) return false;
                    }
                    return true;
                })
                .map(t => ({
                    value: t.id,
                    label: t.title,
                })),
        ];
    }, [tasks, task, descendants]);

    const form = useForm({
        initialValues: {
            title: '',
            description: '',
            estimate_minutes: null as number | null,
            deadline: null as Date | null,
            importance: '20' as string, // Default: Low (20)
            status: 'TODO' as string,
            planned_start: null as Date | null,
            planned_end: null as Date | null,
            parent_id: '',
            recurrencePreset: 'none' as string,
            customInterval: 1,
            customType: 'daily' as 'daily' | 'weekly' | 'monthly',
            customDaysOfWeek: [] as number[],
        },
        validate: {
            title: (value) => (!value || value.trim() === '' ? 'タイトルは必須です' : null),
            estimate_minutes: (value) =>
                value !== null && value < 0 ? '見積時間は0以上である必要があります' : null,
        },
        validateInputOnChange: true,
    });

    const [showCustomRecurrence, setShowCustomRecurrence] = useState(false);

    // Handler for mobile recurrence warning
    const handleMobileRecurrenceClick = () => {
        if (isMobile) {
            addToast('繰り返し機能は現在モバイル版では対応しておりません。PC版でのご利用をお願いいたします。', 'warning');
        }
    };


    // Reset form when task changes
    useEffect(() => {
        if (opened) {
            let preset = 'none';
            let customInterval = 1;
            let customType: 'daily' | 'weekly' | 'monthly' = 'daily';
            let customDaysOfWeek: number[] = [];

            if (task?.recurrence) {
                const rec = task.recurrence as unknown as Recurrence;
                // Try to match preset patterns
                if (rec.type === 'daily' && rec.interval === 1) {
                    preset = 'daily';
                } else if (rec.type === 'weekly' && rec.interval === 1) {
                    if (rec.days_of_week && JSON.stringify([...rec.days_of_week].sort()) === JSON.stringify([1, 2, 3, 4, 5])) {
                        preset = 'weekdays';
                    } else {
                        preset = 'weekly';
                    }
                } else if (rec.type === 'monthly' && rec.interval === 1) {
                    preset = 'monthly';
                } else {
                    preset = 'custom';
                }

                customInterval = rec.interval;
                customType = rec.type;
                customDaysOfWeek = rec.days_of_week || [];
            }

            form.setValues({
                title: task?.title || '',
                description: task?.description || '',
                estimate_minutes: task?.estimate_minutes || null,
                deadline: task?.deadline ? new Date(task.deadline) : null,
                importance: task?.importance ? task.importance.toString() : '20',
                status: task?.status || 'TODO',
                planned_start: task?.planned_start ? new Date(task.planned_start) : null,
                planned_end: task?.planned_end ? new Date(task.planned_end) : null,
                parent_id: task?.parent_id || initialParentId || '', // Use initialParentId if creating new task
                recurrencePreset: preset,
                customInterval,
                customType,
                customDaysOfWeek,
            });
            setShowCustomRecurrence(preset === 'custom');
        }
    }, [task, opened, initialParentId]);

    const handleSubmit = async (values: typeof form.values) => {
        try {
            // Build recurrence object based on preset or custom settings
            let recurrence: Recurrence | null = null;

            // On mobile, preserve existing recurrence without allowing changes
            if (isMobile && task?.recurrence) {
                recurrence = task.recurrence as unknown as Recurrence;
            } else if (!isMobile) {
                // PC version: allow full recurrence management
                if (values.recurrencePreset === 'daily') {
                    recurrence = { type: 'daily', interval: 1 };
                } else if (values.recurrencePreset === 'weekdays') {
                    recurrence = { type: 'weekly', interval: 1, days_of_week: [1, 2, 3, 4, 5] };
                } else if (values.recurrencePreset === 'weekly') {
                    // Default to current day of week if deadline is set
                    const dayOfWeek = values.deadline ? values.deadline.getDay() : new Date().getDay();
                    recurrence = { type: 'weekly', interval: 1, days_of_week: [dayOfWeek] };
                } else if (values.recurrencePreset === 'monthly') {
                    recurrence = { type: 'monthly', interval: 1 };
                } else if (values.recurrencePreset === 'custom') {
                    recurrence = {
                        type: values.customType,
                        interval: values.customInterval,
                    };
                    // Add days_of_week only for weekly custom recurrence
                    if (values.customType === 'weekly' && values.customDaysOfWeek.length > 0) {
                        recurrence.days_of_week = values.customDaysOfWeek;
                    }
                }
            }

            const taskData: TaskData = {
                title: values.title,
                project_id: TEST_PROJECT_ID,
                description: values.description || null,
                estimate_minutes: values.estimate_minutes,
                deadline: values.deadline ? dayjs(values.deadline).toISOString() : null,
                importance: parseInt(values.importance),
                planned_start: values.planned_start ? dayjs(values.planned_start).toISOString() : null,
                planned_end: values.planned_end ? dayjs(values.planned_end).toISOString() : null,
                recurrence,
            };

            if (task) {
                // Update existing task
                await updateTask(task.id, {
                    ...taskData,
                    parent_id: values.parent_id || null,
                });

                // Update status separately if changed (since updateTask might not handle it or for consistency)
                if (values.status !== task.status) {
                    await updateTaskStatus(task.id, values.status);
                }
            } else {
                // Create new task
                // Note: addTask logic in store creates with default 'TODO' status.
                // If we want to support creating in other statuses, we might need to update addTask or call updateTaskStatus after.
                // For now, let's assume standard flow (starts as TODO/IN_PROGRESS usually).
                await addTask(taskData);
                // If status is not TODO, update it after creation?
                // Ideally addTask should accept status, but TaskData definition might not include it explicitly for insert.
                // Let's keep it simple for now, 'TODO' is default.
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
            overlayProps={{
                backgroundOpacity: 0.55,
                blur: 3,
            }}
        >
            <form onSubmit={form.onSubmit(handleSubmit)}>
                <Stack gap="lg">
                    {/* Header: Title */}
                    <TextInput
                        placeholder="タスク名を入力"
                        size="lg"
                        required
                        data-autofocus
                        {...form.getInputProps('title')}
                        styles={{
                            input: {
                                fontSize: '1.25rem',
                                fontWeight: 600,
                            }
                        }}
                    />

                    {/* Status Segmented Control */}
                    <Stack gap="xs">
                        <Text size="sm" fw={500} c="dimmed">ステータス</Text>
                        <SegmentedControl
                            fullWidth
                            size="sm"
                            data={[
                                { label: 'To Do', value: 'TODO' },
                                { label: 'In Progress', value: 'DOING' }, // Or 'IN_PROGRESS' depending on DB
                                { label: 'Pending', value: 'PENDING' },
                                { label: 'Done', value: 'DONE' },
                            ]}
                            {...form.getInputProps('status')}
                        // Assuming 'DOING' maps to 'In Progress' in your DB logic
                        />
                    </Stack>


                    <SimpleGrid cols={2} spacing="lg">
                        {/* Left Column: Schedule & Description */}
                        <Stack gap="md">
                            <Text size="sm" fw={500} c="dimmed" display="flex" style={{ gap: '6px', alignItems: 'center' }}>
                                <Clock size={16} /> スケジュール
                            </Text>

                            <DateTimePicker
                                label="開始日時"
                                placeholder="日時を選択"
                                valueFormat="YYYY/MM/DD HH:mm"
                                clearable
                                size="sm"
                                {...form.getInputProps('planned_start')}
                            />

                            <DateTimePicker
                                label="終了日時"
                                placeholder="日時を選択"
                                valueFormat="YYYY/MM/DD HH:mm"
                                clearable
                                size="sm"
                                {...form.getInputProps('planned_end')}
                            />
                            <DateInput
                                label="期限 (Deadline)"
                                placeholder="日付を選択"
                                valueFormat="YYYY/MM/DD"
                                clearable
                                size="sm"
                                {...form.getInputProps('deadline')}
                            />

                            <NumberInput
                                label="見積時間 (分)"
                                placeholder="例: 60"
                                min={0}
                                size="sm"
                                {...form.getInputProps('estimate_minutes')}
                            />
                        </Stack>

                        {/* Right Column: Matrix & Details */}
                        <Stack gap="md">
                            <Text size="sm" fw={500} c="dimmed" display="flex" style={{ gap: '6px', alignItems: 'center' }}>
                                <Zap size={16} /> マトリクス
                            </Text>

                            <Stack gap="xs">
                                <Text size="sm">⚡ 重要度 (Importance)</Text>
                                <SegmentedControl
                                    fullWidth
                                    color="violet"
                                    data={[
                                        { label: '低', value: '20' },
                                        { label: '中', value: '50' },
                                        { label: '高', value: '90' },
                                    ]}
                                    {...form.getInputProps('importance')}
                                />
                            </Stack>

                            <Divider my="xs" label="詳細" labelPosition="center" />

                            {/* Parent Project Selector */}
                            {task && (
                                <Select
                                    label="親タスク"
                                    placeholder="親タスクを選択"
                                    clearable
                                    searchable
                                    data={parentOptions}
                                    {...form.getInputProps('parent_id')}
                                    size="sm"
                                />
                            )}

                            <Textarea
                                label="説明"
                                placeholder="詳細な説明..."
                                minRows={4}
                                autosize
                                size="sm"
                                {...form.getInputProps('description')}
                            />
                        </Stack>
                    </SimpleGrid>

                    <Divider my="md" />

                    {/* Recurrence Settings */}
                    <Stack gap="md">
                        <Text size="sm" fw={500} c="dimmed" display="flex" style={{ gap: '6px', alignItems: 'center' }}>
                            <Repeat size={16} /> 繰り返し
                        </Text>

                        {isMobile ? (
                            <div
                                onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    handleMobileRecurrenceClick();
                                }}
                                style={{
                                    cursor: 'pointer',
                                    position: 'relative'
                                }}
                            >
                                <Select
                                    placeholder="繰り返しパターンを選択"
                                    data={[
                                        { value: 'none', label: 'なし' },
                                        { value: 'daily', label: '毎日' },
                                        { value: 'weekdays', label: '平日 (月〜金)' },
                                        { value: 'weekly', label: '毎週' },
                                        { value: 'monthly', label: '毎月' },
                                        { value: 'custom', label: 'カスタム...' },
                                    ]}
                                    value={form.values.recurrencePreset}
                                    onChange={() => { }}
                                    allowDeselect={false}
                                    size="sm"
                                    readOnly
                                    styles={{
                                        input: {
                                            cursor: 'pointer',
                                            opacity: 0.6,
                                            pointerEvents: 'none'
                                        }
                                    }}
                                />
                            </div>
                        ) : (
                            <Select
                                placeholder="繰り返しパターンを選択"
                                data={[
                                    { value: 'none', label: 'なし' },
                                    { value: 'daily', label: '毎日' },
                                    { value: 'weekdays', label: '平日 (月〜金)' },
                                    { value: 'weekly', label: '毎週' },
                                    { value: 'monthly', label: '毎月' },
                                    { value: 'custom', label: 'カスタム...' },
                                ]}
                                value={form.values.recurrencePreset}
                                onChange={(value) => {
                                    form.setFieldValue('recurrencePreset', value || 'none');
                                    setShowCustomRecurrence(value === 'custom');
                                }}
                                allowDeselect={false}
                                size="sm"
                            />
                        )}


                        {showCustomRecurrence && !isMobile && (
                            <Stack gap="md" p="md" style={{ backgroundColor: 'var(--mantine-color-dark-6)', borderRadius: '8px' }}>
                                <Group grow>
                                    <NumberInput
                                        label="間隔"
                                        placeholder="1"
                                        min={1}
                                        max={100}
                                        {...form.getInputProps('customInterval')}
                                        size="sm"
                                    />
                                    <Select
                                        label="単位"
                                        data={[
                                            { value: 'daily', label: '日' },
                                            { value: 'weekly', label: '週' },
                                            { value: 'monthly', label: '月' },
                                        ]}
                                        {...form.getInputProps('customType')}
                                        size="sm"
                                    />
                                </Group>

                                {form.values.customType === 'weekly' && (
                                    <div>
                                        <Text size="sm" fw={500} mb="xs">曜日を選択</Text>
                                        <Chip.Group
                                            multiple
                                            value={form.values.customDaysOfWeek.map(String)}
                                            onChange={(values) => {
                                                form.setFieldValue('customDaysOfWeek', values.map(Number));
                                            }}
                                        >
                                            <Group gap="xs">
                                                <Chip value="0" size="xs">日</Chip>
                                                <Chip value="1" size="xs">月</Chip>
                                                <Chip value="2" size="xs">火</Chip>
                                                <Chip value="3" size="xs">水</Chip>
                                                <Chip value="4" size="xs">木</Chip>
                                                <Chip value="5" size="xs">金</Chip>
                                                <Chip value="6" size="xs">土</Chip>
                                            </Group>
                                        </Chip.Group>
                                    </div>
                                )}
                            </Stack>
                        )}
                    </Stack>

                    <Divider />

                    <Group justify="space-between" mt="xs">
                        {task ? (
                            <Button
                                variant="light"
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

                        <Group>
                            {onUnschedule && task?.planned_start && (
                                <Button
                                    variant="subtle"
                                    color="orange"
                                    onClick={onUnschedule}
                                    disabled={loading}
                                >
                                    スケジュール解除
                                </Button>
                            )}
                            <Button variant="default" onClick={handleClose} disabled={loading}>
                                キャンセル
                            </Button>
                            <Button
                                type="submit"
                                leftSection={<Save size={16} />}
                                loading={loading}
                            >
                                {task ? '更新' : '保存'}
                            </Button>
                        </Group>
                    </Group>
                </Stack>
            </form>
        </Modal>
    );
}
