import '@mantine/core/styles.css';
import '@mantine/dates/styles.css';
import { useState } from 'react';
import { MantineProvider, AppShell, Stack, Button, Tabs } from '@mantine/core';
import { ModalsProvider } from '@mantine/modals';
import { Plus, List, Calendar, Network } from 'lucide-react';
import { Header } from './components/Header';
import { TaskList } from './components/TaskList';
import { TaskFormModal } from './components/TaskFormModal';
import { ActiveTaskWidget } from './components/ActiveTaskWidget';
import { SchedulingTab } from './features/calendar/SchedulingTab';
import { PlanningTab } from './features/planning/PlanningTab';
import type { Tables } from './supabase-types';

type Task = Tables<'tasks'>;

function App() {
  const [activeTab, setActiveTab] = useState<string | null>('list');
  const [formModalOpened, setFormModalOpened] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);

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

  return (
    <MantineProvider defaultColorScheme="auto">
      <ModalsProvider>
        <AppShell header={{ height: 70 }} padding="md">
          <AppShell.Header>
            <Header />
          </AppShell.Header>

          <AppShell.Main>
            <Stack gap="lg" px="xl" py="md">
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
      </ModalsProvider>
    </MantineProvider>
  );
}

export default App;
