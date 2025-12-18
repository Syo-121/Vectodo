import { Group, Title, ActionIcon, useMantineColorScheme, Switch } from '@mantine/core';
import { CheckSquare, Sun, Moon } from 'lucide-react';
import { useTaskStore } from '../stores/taskStore';

export function Header() {
    const { colorScheme, toggleColorScheme } = useMantineColorScheme();
    const { showCompletedTasks, toggleShowCompletedTasks } = useTaskStore();

    return (
        <Group
            px="md"
            py="lg"
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
