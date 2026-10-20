import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router';
import { Layout } from './components/Layout.tsx';
import './index.css';
import { BoardPage } from './pages/BoardPage.tsx';
import { GoalDetailPage } from './pages/GoalDetailPage.tsx';
import { GoalsPage } from './pages/GoalsPage.tsx';
import { InboxPage } from './pages/InboxPage.tsx';
import { ListPage } from './pages/ListPage.tsx';
import { NotesPage } from './pages/NotesPage.tsx';
import { SettingsPage } from './pages/SettingsPage.tsx';
import { TodayPage } from './pages/TodayPage.tsx';
import { initTheme } from './theme.ts';

initTheme();

const queryClient = new QueryClient({
  defaultOptions: {
    // AI（MCP）が裏で書き換えることがあるので、画面に戻ったら取り直す。
    // 電波がなくても読み取りは投げる（sw.js が端末に残しておいた中身を返す）。書き込みは React Query に溜めさせない
    // （メモ・タスクの追加・ノートのチェック・目標の記録は web/outbox.ts が端末に溜める。それ以外はその場で失敗を知らせる）
    queries: { staleTime: 5_000, refetchOnWindowFocus: true, retry: 1, networkMode: 'offlineFirst' },
    mutations: { networkMode: 'always' },
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/today" element={<TodayPage />} />
            <Route path="/board" element={<BoardPage />} />
            <Route path="/list" element={<ListPage />} />
            <Route path="/inbox" element={<InboxPage />} />
            <Route path="/notes" element={<NotesPage />} />
            <Route path="/goals" element={<GoalsPage />} />
            <Route path="/goals/:id" element={<GoalDetailPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="*" element={<Navigate to="/today" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  void navigator.serviceWorker.register('/sw.js');
}
