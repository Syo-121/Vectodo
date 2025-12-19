import { useState, useEffect } from 'react';
import { Group, Title, ActionIcon, useMantineColorScheme, Switch, Avatar, Menu, Text } from '@mantine/core';
import { CheckSquare, Sun, Moon, LogOut, User } from 'lucide-react';
import { useTaskStore } from '../stores/taskStore';
import { useToastStore } from '../stores/useToastStore';
import { Breadcrumb } from './Breadcrumb';
import { supabase } from '../lib/supabaseClient';
import type { User as SupabaseUser } from '@supabase/supabase-js';

export function Header() {
    const { colorScheme, toggleColorScheme } = useMantineColorScheme();
    const { showCompletedTasks, toggleShowCompletedTasks } = useTaskStore();
    const addToast = useToastStore(state => state.addToast);
    const [user, setUser] = useState<SupabaseUser | null>(null);

    useEffect(() => {
        // Get current user
        supabase.auth.getUser().then(({ data: { user } }) => {
            setUser(user);
        });

        // Listen for auth changes
        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
            setUser(session?.user ?? null);
        });

        return () => subscription.unsubscribe();
    }, []);

    const handleLogout = async () => {
        try {
            const { error } = await supabase.auth.signOut();
            if (error) {
                console.error('[Auth] Logout error:', error);
                addToast(`ログアウトエラー: ${error.message}`, 'error');
            } else {
                addToast('ログアウトしました', 'success');
            }
        } catch (error: any) {
            console.error('[Auth] Unexpected logout error:', error);
            addToast(`予期しないエラー: ${error.message}`, 'error');
        }
    };

    const userName = user?.user_metadata?.full_name || user?.email || 'ユーザー';
    const userAvatar = user?.user_metadata?.avatar_url;
    const userInitials = userName.substring(0, 2).toUpperCase();

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

                {/* User Menu */}
                {user && (
                    <Menu shadow="md" width={200}>
                        <Menu.Target>
                            <ActionIcon variant="subtle" size="lg">
                                <Avatar
                                    src={userAvatar}
                                    alt={userName}
                                    size="sm"
                                    radius="xl"
                                >
                                    {!userAvatar && userInitials}
                                </Avatar>
                            </ActionIcon>
                        </Menu.Target>

                        <Menu.Dropdown>
                            <Menu.Label>
                                <Group gap="xs">
                                    <User size={14} />
                                    <Text size="xs" truncate style={{ maxWidth: '150px' }}>
                                        {userName}
                                    </Text>
                                </Group>
                            </Menu.Label>
                            <Menu.Divider />
                            <Menu.Item
                                leftSection={<LogOut size={14} />}
                                onClick={handleLogout}
                                color="red"
                            >
                                ログアウト
                            </Menu.Item>
                        </Menu.Dropdown>
                    </Menu>
                )}
            </Group>
        </Group>
    );
}
