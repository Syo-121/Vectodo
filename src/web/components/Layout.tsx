// 共通の枠（design 7-1）: タブ（スマホは下・PC は上）・右下の＋ボタン・n キーで即追加（m キーでメモ）・トースト・詳細パネル。

import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router';
import { useCategories, useInbox, useMemos } from '../api.ts';
import { updateApp, useLatestBuild } from '../appVersion.ts';
import { useWideScreen } from '../media.ts';
import { fmtSaved, useOffline } from '../offline.ts';
import { flushOutbox, outboxLabel, useOutbox } from '../outbox.ts';
import { SIDE_PANEL_ID, useSidePanelActive } from '../sidePanel.ts';
import { useLocalState } from '../storage.ts';
import { dismiss, toast, useToasts } from '../toast.ts';
import { CARD, cx } from '../util.ts';
import { Logo } from './Logo.tsx';
import { QuickAdd, type QuickAddMode } from './QuickAdd.tsx';
import { TaskDrawer, TaskPane } from './TaskDrawer.tsx';

const TABS = [
  { to: '/today', label: '今日', icon: '☀︎' },
  { to: '/board', label: 'ボード', icon: '▦' },
  { to: '/list', label: '一覧', icon: '☰' },
  { to: '/inbox', label: '受信箱', icon: '📥' },
  { to: '/notes', label: 'ノート', icon: '🗒' },
  { to: '/settings', label: '設定', icon: '⚙︎' },
];

export function Layout() {
  const [adding, setAdding] = useState(false);
  // タスク／メモのどちらで開くか（前回の選択を覚える）
  const [mode, setMode] = useLocalState<QuickAddMode>('quickadd.mode', 'task');
  const { data: inbox } = useInbox();
  const { data: memos } = useMemos('open');
  const inboxCount = (inbox?.length ?? 0) + (memos?.length ?? 0);
  const { data: categories = [] } = useCategories();
  const toasts = useToasts();
  const path = useLocation().pathname;
  const wideScreen = useWideScreen();
  // 今日の流れの「置く」パネルが右の欄を借りている間は、詳細を隠す
  const sideBusy = useSidePanelActive();
  // 広い画面の今日・一覧・未整理は「左に一覧、右に詳細」。ボードは幅いっぱい使うので詳細は重ねて出す
  const split = wideScreen && !path.startsWith('/board') && !path.startsWith('/settings') && !path.startsWith('/notes');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el.closest('input, textarea, select, [contenteditable]')) return;
      if ((e.key === 'n' || e.key === 'm') && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        setMode(e.key === 'm' ? 'memo' : 'task');
        setAdding(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setMode]);

  const tab = ({ isActive }: { isActive: boolean }) =>
    cx(
      'relative flex flex-1 flex-col items-center gap-1 pt-2 pb-1.5 text-[11px] md:flex-none md:flex-row md:gap-1.5 md:rounded-md md:px-3 md:py-1.5 md:text-sm',
      isActive ? 'text-indigo-600 dark:text-indigo-400 md:bg-indigo-50 md:dark:bg-indigo-950' : 'text-zinc-500',
    );

  return (
    <div className="min-h-dvh">
      {/* 幅は全ページ共通（ページを移ってもタブの位置が動かない） */}
      <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-zinc-200 bg-white/95 backdrop-blur md:sticky md:top-0 md:border-t-0 md:border-b dark:border-zinc-800 dark:bg-zinc-900/95">
        <div className="pb-safe mx-auto flex max-w-6xl md:h-[49px] md:items-center md:gap-1 md:px-4 md:pb-0">
          <Link to="/today" className="mr-4 hidden self-center md:block" aria-label="Vectodo（今日へ）">
            <Logo />
          </Link>
          {TABS.map((t) => (
            <NavLink key={t.to} to={t.to} className={tab}>
              <span className="text-lg leading-none md:text-sm">{t.icon}</span>
              {t.label}
              {t.to === '/inbox' && inboxCount > 0 && (
                <span className="absolute top-0.5 left-1/2 ml-2 rounded-full bg-red-500 px-1.5 text-[10px] leading-4 text-white md:static md:ml-0">
                  {inboxCount}
                </span>
              )}
            </NavLink>
          ))}
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="ml-auto hidden rounded-md bg-indigo-600 px-3 py-1 text-sm text-white md:block"
            title="n キーでタスク、m キーでメモ"
          >
            ＋ 追加
          </button>
        </div>
      </nav>

      <OfflineBanner />
      <UpdateBanner />

      {/* 2列のときは右の詳細が画面の高さぴったりなので、下の余白を足さない（足すと要らないスクロールが出る） */}
      {/* スマホは最後の行が右下の＋ボタンに隠れないだけ余白を取る */}
      <main className={cx('mx-auto max-w-6xl pb-40', split ? 'md:pb-0' : 'md:pb-12')}>
        {split ? (
          <div className="grid grid-cols-[minmax(0,1fr)_26rem] gap-4 pr-4">
            <div className="min-w-0">
              <Outlet />
            </div>
            <aside className="scroll-hidden sticky top-[49px] h-[calc(100dvh-49px)] overflow-y-auto border-x border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
              <div id={SIDE_PANEL_ID} />
              {!sideBusy && <TaskPane />}
            </aside>
          </div>
        ) : (
          <Outlet />
        )}
      </main>

      <button
        type="button"
        onClick={() => setAdding(true)}
        aria-label="タスクを追加"
        className="bottom-safe fixed right-4 z-20 flex size-14 items-center justify-center rounded-full bg-indigo-600 text-3xl leading-none text-white shadow-lg active:scale-95 md:hidden"
      >
        ＋
      </button>

      {adding && (
        <QuickAdd categories={categories} mode={mode} onModeChange={setMode} onClose={() => setAdding(false)} />
      )}
      {!split && <TaskDrawer />}

      {/* 入力シートを開いている間は、入力欄に被らないようお知らせを上に出す */}
      <div
        className={cx(
          'pointer-events-none fixed inset-x-0 z-50 flex flex-col items-center gap-2 px-4',
          adding ? 'top-[max(1rem,env(safe-area-inset-top))]' : 'bottom-safe md:bottom-6',
        )}
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            className={cx(
              'pointer-events-auto flex max-w-md flex-wrap items-center gap-x-3 gap-y-1.5 rounded-lg px-4 py-2 text-sm text-white shadow-lg',
              t.kind === 'error' ? 'bg-red-600' : 'bg-zinc-800',
            )}
          >
            <span>{t.text}</span>
            {t.actions.length > 0 && (
              <span className="flex flex-wrap items-center gap-1.5">
                {t.actions.map((a) => (
                  <button
                    key={a.label}
                    type="button"
                    className={cx(
                      a.chip
                        ? 'rounded-md border border-zinc-500 px-2 py-0.5 text-xs text-zinc-100 hover:bg-zinc-700'
                        : 'ml-1 font-medium text-indigo-300',
                    )}
                    onClick={() => {
                      a.run();
                      dismiss(t.id);
                    }}
                  >
                    {a.label}
                  </button>
                ))}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// 余白の決まり: ページの左右は 16px（px-4）。行のまとまりは角丸のカード（CARD・左右 16px あけ）に入れ、
// 見出しはカードの中身（完了ボタン）の位置にそろえる（px-7）。

/**
 * つながっていないとき・送信待ちがあるときの帯。つながっていない間は端末に残しておいた中身を見せていて、
 * メモ・タスクの追加・ノートのチェックは端末に溜める（outbox.ts）。20秒ごと・電波が戻った合図・ボタンで、
 * つながったか確かめて（印のない返事が来たら帯が消える）溜めたものを送る
 */
function OfflineBanner() {
  const off = useOffline();
  const pending = useOutbox();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const retry = () => {
    if (off) void qc.invalidateQueries();
    void flushOutbox((label, message) => toast(`送れなかった: ${label}（${message}）`, 'error')).then((n) => {
      if (n === 0) return;
      toast(`溜めていた ${n} 件を送った`);
      void qc.invalidateQueries();
    });
  };
  const retryRef = useRef(retry);
  retryRef.current = retry;
  useEffect(() => {
    if (!off && pending.length === 0) return;
    // つながっていると分かっていて溜まっている（開いたとき・つながったと分かったとき）→ すぐ送る
    if (!off) retryRef.current();
    const tick = () => retryRef.current();
    const t = window.setInterval(tick, 20_000);
    window.addEventListener('online', tick);
    return () => {
      clearInterval(t);
      window.removeEventListener('online', tick);
    };
  }, [off, pending.length]);
  if (!off && pending.length === 0) return null;
  return (
    <div className="sticky top-0 z-10 border-b border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900 md:top-[49px] dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
      <div className="flex items-center gap-2">
        <span className="min-w-0">
          {off ? `📴 つながっていない${off.savedAt ? `（${fmtSaved(off.savedAt)} の内容）` : ''}` : '⏳ 送っている'}
          {pending.length > 0 && (
            <button type="button" onClick={() => setOpen(!open)} className="ml-1.5 underline underline-offset-2">
              送信待ち {pending.length} 件
            </button>
          )}
        </span>
        <button
          type="button"
          onClick={retry}
          className="ml-auto shrink-0 rounded-md border border-amber-300 px-2 py-0.5 text-xs dark:border-amber-800"
        >
          {off ? 'つなぎ直す' : '今すぐ送る'}
        </button>
      </div>
      {off && <p className="mt-0.5 text-xs opacity-80">メモ・タスクの追加とノートのチェックは溜めて、つながったら送る</p>}
      {open && pending.length > 0 && (
        <ul className="mt-1 space-y-0.5 text-xs">
          {pending.map((e) => (
            <li key={e.id}>{outboxLabel(e)}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * 新しい版の画面が出ているとき（design 7-9）。ホーム画面のアプリは読み込み直さないので、戻ってきたときに知らせて
 * ［更新］で入れ替える。「あとで」はその版のあいだ出さない（次の版が出たらまた出す）
 */
function UpdateBanner() {
  const { latest, hasUpdate } = useLatestBuild();
  const [dismissed, setDismissed] = useLocalState<string | null>('update.dismissed', null);
  const [busy, setBusy] = useState(false);
  if (!hasUpdate || latest === dismissed) return null;
  const run = () => {
    setBusy(true);
    void updateApp().then((ok) => {
      if (!ok) {
        setBusy(false);
        toast('つながっていないので更新できない', 'error');
      }
    });
  };
  return (
    <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-indigo-200 bg-indigo-50 px-4 py-2 text-sm text-indigo-900 md:top-[49px] dark:border-indigo-900 dark:bg-indigo-950 dark:text-indigo-200">
      <span className="min-w-0">✨ 新しい版がある</span>
      <button type="button" onClick={() => setDismissed(latest)} className="ml-auto shrink-0 px-2 py-0.5 text-xs opacity-70">
        あとで
      </button>
      <button
        type="button"
        onClick={run}
        disabled={busy}
        className="shrink-0 rounded-md bg-indigo-600 px-3 py-1 text-xs text-white disabled:opacity-60"
      >
        {busy ? '更新中…' : '更新'}
      </button>
    </div>
  );
}

export function PageHeader({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 px-4 pt-6 pb-3 md:pt-5">
      <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
      <div className="ml-auto flex items-center gap-2">{children}</div>
    </div>
  );
}

export function Section({ title, count, tone, children }: { title: string; count: number; tone?: 'red'; children: React.ReactNode }) {
  if (count === 0) return null;
  return (
    <section className="mt-6">
      <h2
        className={cx(
          'px-7 pb-2 text-xs font-semibold tracking-wide',
          tone === 'red' ? 'text-red-600 dark:text-red-400' : 'text-zinc-500',
        )}
      >
        {title}（{count}）
      </h2>
      <div className={CARD}>{children}</div>
    </section>
  );
}
