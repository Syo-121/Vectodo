import { useState } from 'react';
import { AppShell, Stack, Tabs, ActionIcon, Group, Title } from '@mantine/core';
import { Home, GitMerge, List, Settings, Plus, CheckSquare } from 'lucide-react';
import { useToastStore } from '../../stores/useToastStore';
import { MobileHome } from './MobileHome';
import { MobileFlow } from './MobileFlow';
import { MobileList } from './MobileList';
import { MobileSettings } from './MobileSettings';

export function MobileLayout() {
    const [activeTab, setActiveTab] = useState<string>('home');
    const addToast = useToastStore(state => state.addToast);

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
            <AppShell.Header>
                <Group h={60} px="md" align="center">
                    <CheckSquare size={24} strokeWidth={2} />
                    <Title order={2} size="h3">
                        Vectodo
                    </Title>
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
