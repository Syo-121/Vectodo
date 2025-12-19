import '@mantine/core/styles.css';
import '@mantine/dates/styles.css';
import './notifications.css';
import { useState, useEffect } from 'react';
import { MantineProvider, AppShell, Stack, Button, Tabs, Loader, Center } from '@mantine/core';
import { ModalsProvider } from '@mantine/modals';
import { Notifications } from '@mantine/notifications';
import { Plus, List, Calendar, Network } from 'lucide-react';
import { Header } from './components/Header';
import { TaskList } from './components/TaskList';
import { TaskFormModal } from './components/TaskFormModal';
import { ActiveTaskWidget } from './components/ActiveTaskWidget';
import { SchedulingTab } from './features/calendar/SchedulingTab';
import { PlanningTab } from './features/planning/PlanningTab';
import { ToastContainer } from './components/ToastContainer';
import { LoginScreen } from './features/auth/LoginScreen';
import { supabase } from './lib/supabaseClient';
import type { Tables } from './supabase-types';
import type { Session } from '@supabase/supabase-js';

type Task = Tables<'tasks'>;

function App() {
  const [activeTab, setActiveTab] = useState<string | null>('list');
  const [formModalOpened, setFormModalOpened] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  // Authentication state management
  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      console.log('[Auth] Initial session:', session ? 'logged in' : 'not logged in');
      setSession(session);
      setLoading(false);
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      console.log('[Auth] Auth state changed:', _event, session ? 'logged in' : 'not logged in');
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleNewTask = () => {
    setEditingTask(null);
    setFormModalOpened(true);
  };

  const handleTaskClick = (task: Task) => {
    setEditingTask(task);
    setFormModalOpened(true);
  };

  const handleModalClose = () => {
    setFormModalOpened(false);
    setEditingTask(null);
  };

  // Show loading screen while checking auth
  if (loading) {
    return (
      <MantineProvider defaultColorScheme="auto">
        <Center style={{ minHeight: '100vh' }}>
          <Loader size="xl" />
        </Center>
      </MantineProvider>
    );
  }

  // Show login screen if not authenticated
  if (!session) {
    return (
      <MantineProvider defaultColorScheme="auto">
        <Notifications
          position="top-right"
          zIndex={10000}
          containerWidth={420}
          limit={5}
        />
        <LoginScreen />
      </MantineProvider>
    );
  }

  // Show main app if authenticated
  return (
    <MantineProvider defaultColorScheme="auto">
      {/* Notifications at top level for proper z-index layering */}
      <Notifications
        position="top-right"
        zIndex={10000}
        containerWidth={420}
        limit={5}
      />
      <ModalsProvider>
        <AppShell
          header={{ height: 60 }}
          padding={0}
        >
          <AppShell.Header>
            <Header />
          </AppShell.Header>

          <AppShell.Main>
            <Stack gap="lg" p="md">
              <Button
                leftSection={<Plus size={20} />}
                onClick={handleNewTask}
                size="md"
                style={{ maxWidth: '200px' }}
              >
                新規タスク作成
              </Button>

              <Tabs value={activeTab} onChange={setActiveTab}>
                <Tabs.List>
                  <Tabs.Tab value="list" leftSection={<List size={16} />}>
                    リスト
                  </Tabs.Tab>
                  <Tabs.Tab value="calendar" leftSection={<Calendar size={16} />}>
                    カレンダー
                  </Tabs.Tab>
                  <Tabs.Tab value="planning" leftSection={<Network size={16} />}>
                    Planning
                  </Tabs.Tab>
                </Tabs.List>

                <Tabs.Panel value="list" pt="md">
                  <TaskList onTaskClick={handleTaskClick} />
                </Tabs.Panel>

                <Tabs.Panel value="calendar" pt="md">
                  <SchedulingTab />
                </Tabs.Panel>

                <Tabs.Panel value="planning" pt="md">
                  <PlanningTab />
                </Tabs.Panel>
              </Tabs>

              {/* Active Task Widget (always visible when timer is running) */}
              <ActiveTaskWidget />
            </Stack>
          </AppShell.Main>
        </AppShell>

        <TaskFormModal
          opened={formModalOpened}
          onClose={handleModalClose}
          task={editingTask}
        />

        {/* Toast Notifications */}
        <ToastContainer />
      </ModalsProvider>
    </MantineProvider>
  );
}

export default App;
