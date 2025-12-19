import { Group, Title, ActionIcon, useMantineColorScheme, Switch } from '@mantine/core';
import { CheckSquare, Sun, Moon } from 'lucide-react';
import { useTaskStore } from '../stores/taskStore';
import { Breadcrumb } from './Breadcrumb';

export function Header() {
    const { colorScheme, toggleColorScheme } = useMantineColorScheme();
    const { showCompletedTasks, toggleShowCompletedTasks } = useTaskStore();

    return (
        <Group
            h={60}
            px="md"
            justify="space-between"
            style={(theme) => ({
                borderBottom: `1px solid ${theme.colors.dark[4]}`,
            })}
        >
            <Group>
                <CheckSquare size={32} strokeWidth={2} />
                <Title order={1} size="h2">
                    Vectodo
                </Title>
            </Group>

            <Breadcrumb />

            <Group gap="md">
                <Switch
                    label="完了済みを表示"
                    checked={showCompletedTasks}
                    onChange={toggleShowCompletedTasks}
                    size="sm"
                />
                <ActionIcon
                    variant="subtle"
                    onClick={() => toggleColorScheme()}
                    size="lg"
                    title={`Switch to ${colorScheme === 'dark' ? 'light' : 'dark'} mode`}
                >
                    {colorScheme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
                </ActionIcon>
            </Group>
        </Group>
    );
}
