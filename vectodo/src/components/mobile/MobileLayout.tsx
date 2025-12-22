import { useState, useEffect } from 'react';
import { AppShell, Stack, Tabs, ActionIcon, Group, Title, Avatar, Menu, Text } from '@mantine/core';
import { Home, GitMerge, List, Settings, Plus, CheckSquare, LogOut } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { useToastStore } from '../../stores/useToastStore';
import type { User as SupabaseUser } from '@supabase/supabase-js';
import { MobileHome } from './MobileHome';
import { MobileFlow } from './MobileFlow';
import { MobileList } from './MobileList';
import { MobileSettings } from './MobileSettings';

export function MobileLayout() {
    const [activeTab, setActiveTab] = useState<string>('home');
    const [user, setUser] = useState<SupabaseUser | null>(null);
    const addToast = useToastStore(state => state.addToast);

    useEffect(() => {
        const getUser = async () => {
            const { data: { user } } = await supabase.auth.getUser();
            setUser(user);
        };
        getUser();

        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
            setUser(session?.user ?? null);
        });

        return () => subscription.unsubscribe();
    }, []);

    const handleLogout = async () => {
        try {
            const { error } = await supabase.auth.signOut();
            if (error) throw error;
            addToast('ログアウトしました', 'success');
        } catch (error: any) {
            console.error('Logout failed:', error);
            addToast(`ログアウト失敗: ${error.message}`, 'error');
        }
    };

    const handleFabClick = () => {
        // TODO: Open task creation modal
        addToast('タスク作成機能（未実装）', 'info');
    };

    return (
        <AppShell
            header={{ height: 60 }}
            footer={{ height: 70 }}
            padding={0}
        >
            {/* Header */}
            <AppShell.Header style={{ backgroundColor: '#1A1B1E', borderBottom: '1px solid #2C2E33' }}>
                <Group h={60} px="md" justify="space-between" align="center">
                    <Group gap="xs">
                        <CheckSquare size={24} strokeWidth={2} color="#C1C2C5" />
                        <Title order={3} size="h3" c="#C1C2C5">
                            Vectodo
                        </Title>
                    </Group>

                    {/* User Profile Menu */}
                    {user && (
                        <Menu shadow="md" width={200} position="bottom-end">
                            <Menu.Target>
                                <Avatar
                                    src={user.user_metadata.avatar_url}
                                    alt={user.user_metadata.full_name || 'User'}
                                    radius="xl"
                                    color="blue"
                                    style={{ cursor: 'pointer' }}
                                >
                                    {(user.user_metadata.full_name?.[0] || user.email?.[0] || 'U').toUpperCase()}
                                </Avatar>
                            </Menu.Target>

                            <Menu.Dropdown>
                                <Menu.Label>アカウント</Menu.Label>
                                <Menu.Item>
                                    <Text size="sm" fw={500} lineClamp={1}>
                                        {user.user_metadata.full_name || 'ユーザー'}
                                    </Text>
                                    <Text size="xs" c="dimmed" lineClamp={1}>
                                        {user.email}
                                    </Text>
                                </Menu.Item>

                                <Menu.Divider />

                                <Menu.Item
                                    color="red"
                                    leftSection={<LogOut size={14} />}
                                    onClick={handleLogout}
                                >
                                    ログアウト
                                </Menu.Item>
                            </Menu.Dropdown>
                        </Menu>
                    )}
                </Group>
            </AppShell.Header>

            {/* Main Content Area */}
            <AppShell.Main>
                <Stack p={0} style={{ paddingBottom: '90px' }}>
                    {activeTab === 'home' && (
                        <MobileHome />
                    )}

                    {activeTab === 'flow' && (
                        <MobileFlow />
                    )}

                    {activeTab === 'list' && (
                        <MobileList />
                    )}

                    {activeTab === 'settings' && (
                        <MobileSettings />
                    )}
                </Stack>

                {/* Floating Action Button (FAB) */}
                <ActionIcon
                    size={56}
                    radius="xl"
                    variant="filled"
                    color="blue"
                    onClick={handleFabClick}
                    style={{
                        position: 'fixed',
                        bottom: '80px',
                        right: '16px',
                        zIndex: 1000,
                        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
                    }}
                >
                    <Plus size={28} />
                </ActionIcon>
            </AppShell.Main>

            {/* Bottom Navigation (Footer) */}
            <AppShell.Footer>
                <Tabs
                    value={activeTab}
                    onChange={(value) => setActiveTab(value as string)}
                    variant="default"
                    orientation="horizontal"
                    style={{ height: '100%' }}
                >
                    <Tabs.List grow style={{ height: '100%', border: 'none' }}>
                        <Tabs.Tab
                            value="home"
                            leftSection={<Home size={20} />}
                            style={{
                                flexDirection: 'column',
                                gap: '4px',
                                fontSize: '11px',
                                padding: '8px 4px',
                            }}
                        >
                            ホーム
                        </Tabs.Tab>
                        <Tabs.Tab
                            value="flow"
                            leftSection={<GitMerge size={20} />}
                            style={{
                                flexDirection: 'column',
                                gap: '4px',
                                fontSize: '11px',
                                padding: '8px 4px',
                            }}
                        >
                            フロー
                        </Tabs.Tab>
                        <Tabs.Tab
                            value="list"
                            leftSection={<List size={20} />}
                            style={{
                                flexDirection: 'column',
                                gap: '4px',
                                fontSize: '11px',
                                padding: '8px 4px',
                            }}
                        >
                            リスト
                        </Tabs.Tab>
                        <Tabs.Tab
                            value="settings"
                            leftSection={<Settings size={20} />}
                            style={{
                                flexDirection: 'column',
                                gap: '4px',
                                fontSize: '11px',
                                padding: '8px 4px',
                            }}
                        >
                            設定
                        </Tabs.Tab>
                    </Tabs.List>
                </Tabs>
            </AppShell.Footer>
        </AppShell>
    );
}
