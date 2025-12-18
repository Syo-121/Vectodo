import { Breadcrumbs, Anchor } from '@mantine/core';
import { Home } from 'lucide-react';
import { useTaskStore } from '../stores/taskStore';

export function Breadcrumb() {
    const { currentProjectId, setCurrentProject, getProjectPath } = useTaskStore();
    const path = getProjectPath(currentProjectId);

    return (
        <Breadcrumbs separator="›">
            <Anchor
                onClick={() => setCurrentProject(null)}
                style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}
                c={currentProjectId === null ? 'blue' : 'dimmed'}
            >
                <Home size={16} />
                <span>ホーム</span>
            </Anchor>
            {path.map((task, index) => (
                <Anchor
                    key={task.id}
                    onClick={() => setCurrentProject(task.id)}
                    style={{ cursor: 'pointer' }}
                    c={index === path.length - 1 ? 'blue' : 'dimmed'}
                >
                    {task.title}
                </Anchor>
            ))}
        </Breadcrumbs>
    );
}
