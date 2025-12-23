import { useState, useEffect } from 'react';
import { AppShell, Stack, ActionIcon, Group, Title, Avatar, Menu, Text, Breadcrumbs, Anchor, Box } from '@mantine/core';
import { Home, GitMerge, List, Settings, Plus, CheckSquare, LogOut } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { useToastStore } from '../../stores/useToastStore';
import { useTaskStore } from '../../stores/taskStore';
import type { User as SupabaseUser } from '@supabase/supabase-js';
import type { Tables } from '../../supabase-types';
import { MobileHome } from './MobileHome';
import { MobileFlow } from './MobileFlow';
import { MobileList } from './MobileList';
import { MobileSettings } from './MobileSettings';
import { TaskFormModal } from '../TaskFormModal';

type Task = Tables<'tasks'>;

export function MobileLayout() {
    const [activeTab, setActiveTab] = useState<string>('home');
    const [user, setUser] = useState<SupabaseUser | null>(null);
    const [currentViewId, setCurrentViewId] = useState<string | null>(null);
    const addToast = useToastStore(state => state.addToast);
    const { tasks, fetchTasks } = useTaskStore();

    // Centralized Modal State
    interface ModalState {
        opened: boolean;
        task?: Task | null;
        initialParentId?: string | null;
    }
    const [modalState, setModalState] = useState<ModalState>({ opened: false });

    useEffect(() => {
        fetchTasks();
    }, [fetchTasks]);

    // Handlers
    const handleCreateTask = () => {
        setModalState({
            opened: true,
            task: null,
            initialParentId: currentViewId
        });
    };

    const handleEditTask = (task: Task) => {
        setModalState({
            opened: true,
            task: task,
            initialParentId: null
        });
    };

    const handleCloseModal = () => {
        setModalState({ ...modalState, opened: false });
        // Delay clearing data slightly to allow close animation if needed, or clear immediately.
        // Clearing immediately is safer to avoid stale data on reopen.
    };

    // Helper to generate breadcrumbs path
    const getBreadcrumbs = () => {
        const crumbs = [
            { title: 'Home', id: null }
        ];

        if (!currentViewId) return crumbs;

        const path: { title: string, id: string }[] = [];
        let currentId: string | null = currentViewId;

        while (currentId) {
            const task = tasks.find(t => t.id === currentId);
            if (!task) break;
            path.unshift({ title: task.title, id: task.id });
            currentId = task.parent_id;
        }

        return [...crumbs, ...path];
    };

    const breadcrumbs = getBreadcrumbs().map((item, index) => (
        <Anchor key={index} size="xs" c="dimmed" onClick={() => setCurrentViewId(item.id)}>
            {item.title}
        </Anchor>
    ));

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

            {/* Breadcrumbs */}
            <Group px="md" py="xs" style={{ backgroundColor: '#1A1B1E', borderBottom: '1px solid #2C2E33', position: 'sticky', top: 60, zIndex: 99 }}>
                <Breadcrumbs separator=">">{breadcrumbs}</Breadcrumbs>
            </Group>

            {/* Main Content Area */}
            <AppShell.Main>
                <Stack p={0} style={{ paddingBottom: '90px' }}>
                    {activeTab === 'home' && (
                        <MobileHome
                            onEditTask={handleEditTask}
                        />
                    )}

                    {activeTab === 'flow' && (
                        <MobileFlow
                            currentViewId={currentViewId}
                            setCurrentViewId={setCurrentViewId}
                            onEditTask={handleEditTask}
                        />
                    )}

                    {activeTab === 'list' && (
                        <MobileList
                            currentViewId={currentViewId}
                            setCurrentViewId={setCurrentViewId}
                            onEditTask={handleEditTask}
                        />
                    )}

                    {activeTab === 'settings' && (
                        <MobileSettings />
                    )}
                </Stack>
            </AppShell.Main>

            {/* Floating Action Button (FAB) - Fixed Bottom Right */}
            <ActionIcon
                variant="filled"
                color="blue"
                size={56}
                radius="xl"
                style={{
                    position: 'fixed',
                    bottom: 95,
                    right: 24,
                    zIndex: 105,
                    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
                }}
                onClick={handleCreateTask}
            >
                <Plus size={28} />
            </ActionIcon>

            {/* Footer Navigation */}
            <AppShell.Footer p="md" style={{ backgroundColor: '#1A1B1E', borderTop: '1px solid #2C2E33' }}>
                <Group justify="space-around" style={{ position: 'relative' }}>

                    {/* Navigation Items */}
                    <Stack gap={4} align="center" style={{ cursor: 'pointer', zIndex: 102 }} onClick={() => setActiveTab('home')}>
                        <Home size={24} color={activeTab === 'home' ? '#339af0' : '#909296'} />
                        <Text size="xs" c={activeTab === 'home' ? 'blue' : 'dimmed'}>Home</Text>
                    </Stack>

                    <Stack gap={4} align="center" style={{ cursor: 'pointer', zIndex: 102 }} onClick={() => setActiveTab('flow')}>
                        <GitMerge size={24} color={activeTab === 'flow' ? '#339af0' : '#909296'} />
                        <Text size="xs" c={activeTab === 'flow' ? 'blue' : 'dimmed'}>Flow</Text>
                    </Stack>

                    <Stack gap={4} align="center" style={{ cursor: 'pointer', zIndex: 102 }} onClick={() => setActiveTab('list')}>
                        <List size={24} color={activeTab === 'list' ? '#339af0' : '#909296'} />
                        <Text size="xs" c={activeTab === 'list' ? 'blue' : 'dimmed'}>List</Text>
                    </Stack>

                    <Stack gap={4} align="center" style={{ cursor: 'pointer', zIndex: 102 }} onClick={() => setActiveTab('settings')}>
                        <Settings size={24} color={activeTab === 'settings' ? '#339af0' : '#909296'} />
                        <Text size="xs" c={activeTab === 'settings' ? 'blue' : 'dimmed'}>Settings</Text>
                    </Stack>
                </Group>
            </AppShell.Footer>

            {/* Global Task Modal */}
            <TaskFormModal
                opened={modalState.opened}
                onClose={handleCloseModal}
                task={modalState.task}
                initialParentId={modalState.initialParentId}
            />
        </AppShell >
    );
}
