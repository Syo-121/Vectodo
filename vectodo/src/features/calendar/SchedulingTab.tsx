import { useState, useMemo } from 'react';
import FullCalendar from '@fullcalendar/react';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin, { type EventResizeDoneArg } from '@fullcalendar/interaction';
import type { DateSelectArg, EventContentArg, EventDropArg, EventClickArg } from '@fullcalendar/core';
import { Grid, Stack, Text, ScrollArea, Paper, Tooltip } from '@mantine/core';
import { useTaskStore } from '../../stores/taskStore';
import { SchedulingModal } from './SchedulingModal';
import { TaskFormModal } from '../../components/TaskFormModal';
import { getDependencyWarnings } from '../../utils/dependencyCheck';
import dayjs from 'dayjs';
import './calendar.css';

export function SchedulingTab() {
    const { tasks, dependencies, updateTask, fetchTasks, showCompletedTasks, currentProjectId } = useTaskStore();
    const [schedulingModalOpened, setSchedulingModalOpened] = useState(false);
    const [taskFormModalOpened, setTaskFormModalOpened] = useState(false);
    const [selectedTimeSlot, setSelectedTimeSlot] = useState<{ start: Date; end: Date } | null>(null);
    const [selectedTask, setSelectedTask] = useState<any>(null);

    // Left side list: unscheduled tasks in current scope only
    const unscheduledTasks = useMemo(() => {
        return tasks.filter(task => {
            // 1. Unscheduled check
            const isUnscheduled = !task.planned_start || !task.planned_end;

            // 2. Hierarchy scope check
            const isCorrectScope = currentProjectId
                ? task.parent_id === currentProjectId
                : task.parent_id === null;

            // 3. Completion status check
            const isVisibleStatus = showCompletedTasks || (task.status !== 'DONE' && task.status !== 'done');

            return isUnscheduled && isCorrectScope && isVisibleStatus;
        });
    }, [tasks, currentProjectId, showCompletedTasks]);

    // Calendar: scheduled tasks from all scopes (global view)
    const scheduledTasks = useMemo(() => {
        return tasks.filter(task => {
            // 1. Scheduled check
            const isScheduled = task.planned_start && task.planned_end;

            // 2. Completion status check (no scope filtering for calendar)
            const isVisibleStatus = showCompletedTasks || (task.status !== 'DONE' && task.status !== 'done');

            return isScheduled && isVisibleStatus;
        });
    }, [tasks, showCompletedTasks]);

    // Left sidebar: scheduled tasks in current scope only (for the list)
    const scopedScheduledTasks = useMemo(() => {
        return scheduledTasks.filter(task => {
            // Hierarchy scope check for sidebar list
            const isCorrectScope = currentProjectId
                ? task.parent_id === currentProjectId
                : task.parent_id === null;

            return isCorrectScope;
        });
    }, [scheduledTasks, currentProjectId]);

    // Map scheduled tasks to calendar events
    const events = useMemo(() => {
        return scheduledTasks.map(task => {
            // Check if task is in current scope
            const isInCurrentScope = currentProjectId
                ? task.parent_id === currentProjectId
                : task.parent_id === null;

            // Check task status
            const isDone = task.status === 'DONE' || task.status === 'done';
            const isDoing = task.status === 'DOING' || task.status === 'doing';

            // Check for dependency warnings with detailed reasons
            const warnings = getDependencyWarnings(task, tasks, dependencies);
            // Ignore warnings for completed tasks
            const hasWarning = warnings.length > 0 && !isDone;

            // Determine colors based on priority: DONE > warnings > DOING > TODO
            let backgroundColor: string;
            let borderColor: string;
            let textColor: string;
            const classNames: string[] = [];

            if (isDone) {
                // Completed tasks: gray, semi-transparent
                backgroundColor = '#868e96';
                borderColor = '#868e96';
                textColor = '#ffffff';
                classNames.push('fc-event-done');
            } else if (hasWarning) {
                // Tasks with warnings: yellow background
                backgroundColor = '#fff3cd';
                borderColor = '#ffec99';
                textColor = '#000000';
            } else if (isDoing) {
                // In-progress tasks: bright blue
                backgroundColor = '#1971c2';
                borderColor = '#1864ab';
                textColor = '#ffffff';
                classNames.push('fc-event-doing');
            } else {
                // Default TODO tasks: normal blue
                backgroundColor = getEventColor(task.status);
                borderColor = getEventColor(task.status);
                textColor = '#ffffff';
            }

            // Reduce opacity for out-of-scope tasks (40% opacity)
            if (!isInCurrentScope) {
                backgroundColor = backgroundColor + '66';
                borderColor = borderColor + '66';
            }

            return {
                id: task.id,
                title: task.title,
                start: task.planned_start!,
                end: task.planned_end!,
                backgroundColor,
                borderColor,
                textColor,
                classNames,
                extendedProps: {
                    status: task.status,
                    hasWarning,
                    warningMessages: warnings.map(w => w.reason),
                    isDone,
                    isDoing,
                    isInCurrentScope,
                },
            };
        });
    }, [scheduledTasks, tasks, dependencies, currentProjectId]);

    // Handle time slot selection (for scheduling unscheduled tasks)
    const handleSelect = (selectInfo: DateSelectArg) => {
        setSelectedTimeSlot({
            start: selectInfo.start,
            end: selectInfo.end,
        });
        setSchedulingModalOpened(true);
    };

    // Handle event drop (drag and drop)
    const handleEventDrop = async (dropInfo: EventDropArg) => {
        const taskId = dropInfo.event.id;
        const newStart = dayjs(dropInfo.event.start).toISOString();
        const newEnd = dayjs(dropInfo.event.end).toISOString();

        try {
            await updateTask(taskId, {
                planned_start: newStart,
                planned_end: newEnd,
            });
            // Refresh tasks to update dependency warnings
            await fetchTasks();
        } catch (error) {
            console.error('Failed to update task:', error);
            dropInfo.revert();
        }
    };

    // Handle event resize
    const handleEventResize = async (resizeInfo: EventResizeDoneArg) => {
        const taskId = resizeInfo.event.id;
        const newStart = dayjs(resizeInfo.event.start).toISOString();
        const newEnd = dayjs(resizeInfo.event.end).toISOString();

        try {
            await updateTask(taskId, {
                planned_start: newStart,
                planned_end: newEnd,
            });
            // Refresh tasks to update dependency warnings
            await fetchTasks();
        } catch (error) {
            console.error('Failed to update task:', error);
            resizeInfo.revert();
        }
    };

    // Handle event click (to view/edit task)
    const handleEventClick = (clickInfo: EventClickArg) => {
        const task = tasks.find(t => t.id === clickInfo.event.id);
        if (task) {
            setSelectedTask(task);
            setTaskFormModalOpened(true);
        }
    };

    // Handle unscheduling (remove planned dates)
    const handleUnschedule = async (taskId: string) => {
        try {
            await updateTask(taskId, {
                planned_start: null,
                planned_end: null,
            });
            setTaskFormModalOpened(false);
            setSelectedTask(null);
        } catch (error) {
            console.error('Failed to unschedule task:', error);
        }
    };

    return (
        <Grid gutter="md">
            {/* Left column: Task list */}
            <Grid.Col span={4}>
                <Stack gap="md" h="calc(100vh - 200px)">
                    <Paper withBorder p="md">
                        <Text fw={500} size="lg" mb="sm">
                            未スケジュールタスク
                        </Text>
                        <ScrollArea h="calc(50vh - 150px)">
                            <Stack gap="xs">
                                {unscheduledTasks.length === 0 ? (
                                    <Text c="dimmed" size="sm">未スケジュールのタスクはありません</Text>
                                ) : (
                                    unscheduledTasks.map((task) => (
                                        <Paper
                                            key={task.id}
                                            p="xs"
                                            withBorder
                                            style={{ cursor: 'pointer' }}
                                            onClick={() => {
                                                setSelectedTask(task);
                                                setTaskFormModalOpened(true);
                                            }}
                                        >
                                            <Text size="sm" fw={500}>{task.title}</Text>
                                            {task.deadline && (
                                                <Text size="xs" c="dimmed">
                                                    締切: {dayjs(task.deadline).format('YYYY/MM/DD')}
                                                </Text>
                                            )}
                                        </Paper>
                                    ))
                                )}
                            </Stack>
                        </ScrollArea>
                    </Paper>

                    <Paper withBorder p="md">
                        <Text fw={500} size="lg" mb="sm">
                            スケジュール済みタスク
                        </Text>
                        <ScrollArea h="calc(50vh - 150px)">
                            <Stack gap="xs">
                                {scopedScheduledTasks.length === 0 ? (
                                    <Text c="dimmed" size="sm">スケジュール済みのタスクはありません</Text>
                                ) : (
                                    scopedScheduledTasks.map((task) => (
                                        <Paper
                                            key={task.id}
                                            p="xs"
                                            withBorder
                                            style={{
                                                cursor: 'pointer',
                                                backgroundColor: getEventColor(task.status),
                                                color: 'white'
                                            }}
                                            onClick={() => {
                                                setSelectedTask(task);
                                                setTaskFormModalOpened(true);
                                            }}
                                        >
                                            <Text size="sm" fw={500}>{task.title}</Text>
                                            <Text size="xs">
                                                {dayjs(task.planned_start).format('MM/DD HH:mm')} - {dayjs(task.planned_end).format('HH:mm')}
                                            </Text>
                                        </Paper>
                                    ))
                                )}
                            </Stack>
                        </ScrollArea>
                    </Paper>
                </Stack>
            </Grid.Col>

            {/* Right column: Calendar */}
            <Grid.Col span={8}>
                <FullCalendar
                    plugins={[timeGridPlugin, interactionPlugin]}
                    initialView="timeGridWeek"
                    headerToolbar={{
                        left: 'prev,next today',
                        center: 'title',
                        right: 'timeGridWeek,timeGridDay'
                    }}
                    slotDuration="00:30:00"
                    slotMinTime="06:00:00"
                    slotMaxTime="24:00:00"
                    height="calc(100vh - 200px)"
                    editable={true}
                    selectable={true}
                    select={handleSelect}
                    eventDrop={handleEventDrop}
                    eventResize={handleEventResize}
                    eventClick={handleEventClick}
                    events={events}
                    eventContent={renderEventContent}
                    locale="ja"
                    buttonText={{
                        today: '今日',
                        week: '週',
                        day: '日'
                    }}
                    allDaySlot={false}
                />
            </Grid.Col>

            {/* Modals */}
            <SchedulingModal
                opened={schedulingModalOpened}
                onClose={() => setSchedulingModalOpened(false)}
                timeSlot={selectedTimeSlot}
            />

            <TaskFormModal
                opened={taskFormModalOpened}
                onClose={() => {
                    setTaskFormModalOpened(false);
                    setSelectedTask(null);
                }}
                task={selectedTask}
                onUnschedule={selectedTask?.planned_start ? () => handleUnschedule(selectedTask.id) : undefined}
            />
        </Grid>
    );
}

// Custom event rendering
function renderEventContent(eventInfo: EventContentArg) {
    const { hasWarning, warningMessages, isDone } = eventInfo.event.extendedProps;
    const textColor = eventInfo.event.textColor || '#ffffff';

    return (
        <div style={{
            padding: '2px 4px',
            overflow: 'hidden',
            color: textColor,
            fontWeight: 500,
        }}>
            {hasWarning && (
                <Tooltip
                    label={
                        <div>
                            <div style={{ fontWeight: 600, marginBottom: 4 }}>依存関係の警告:</div>
                            {warningMessages && warningMessages.length > 0 ? (
                                warningMessages.map((msg: string, idx: number) => (
                                    <div key={idx} style={{ marginBottom: 2 }}>
                                        • {msg}
                                    </div>
                                ))
                            ) : (
                                <div>警告があります</div>
                            )}
                        </div>
                    }
                    position="top"
                    withinPortal
                    multiline
                    w={300}
                >
                    <span style={{ marginRight: 4 }}>⚠️</span>
                </Tooltip>
            )}
            <span style={{ fontSize: '0.875rem' }}>
                {eventInfo.event.title}
            </span>
        </div>
    );
}

// Get event color based on status
function getEventColor(status: string | null): string {
    switch (status) {
        case 'done':
        case 'completed':
            return '#868e96';
        case 'in_progress':
            return '#339af0';
        default:
            return '#22b8cf';
    }
}
