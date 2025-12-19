import { Fragment, useMemo } from 'react';
import { Group, Text, ActionIcon } from '@mantine/core';
import { Home } from 'lucide-react';
import { useTaskStore } from '../stores/taskStore';

export function Breadcrumb() {
    const { tasks, currentProjectId, setCurrentProject } = useTaskStore();

    // Generate path from currentProjectId to root
    const path = useMemo(() => {
        const result: typeof tasks = [];
        let currentId = currentProjectId;

        while (currentId) {
            const task = tasks.find(t => t.id === currentId);
            if (!task) break;
            result.unshift(task); // Add to beginning
            currentId = task.parent_id;
        }

        return result;
    }, [tasks, currentProjectId]);

    // Don't show breadcrumb if at root
    if (!currentProjectId) return null;

    return (
        <Group gap="xs">
            <ActionIcon
                variant="subtle"
                size="sm"
                onClick={() => setCurrentProject(null)}
                title="ホームに戻る"
            >
                <Home size={16} />
            </ActionIcon>
            {path.map((task, index) => (
                <Fragment key={task.id}>
                    <Text c="dimmed" size="sm">/</Text>
                    <Text
                        size="sm"
                        style={{ cursor: 'pointer' }}
                        c={index === path.length - 1 ? 'blue' : 'dimmed'}
                        onClick={() => setCurrentProject(task.id)}
                    >
                        {task.title}
                    </Text>
                </Fragment>
            ))}
        </Group>
    );
}
