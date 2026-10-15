// タスクを置くパネル（design 4-11）: 始める時刻と長さを決めて、候補を押すとその日のやる日にその時刻と長さが入る
// （持ち越しの過ぎた日は外す＝「今日やる」と同じ）。元に戻せる。予定に重ねる（ながら）ときも同じ。
// 時間割に重ならないように出す: 今日の画面の広い画面は右の欄（詳細の欄を借りる）・ボードの広い画面は時間割の右の列・それ以外は画面の下半分
// （背景を暗くしない＝時間割の選んだ時間が見えたまま）。

import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { fmtClock, PLACE_DEFAULT_MIN, toMin } from '../../shared/flow.ts';
import { nextReason } from '../../shared/next.ts';
import type { NextItem, Task } from '../../shared/types.ts';
import { api, useWrite } from '../api.ts';
import type { Draft, Slot } from '../grid.ts';
import { SIDE_PANEL_ID } from '../sidePanel.ts';
import { toast } from '../toast.ts';
import { cx, ESTIMATES, fmtDate, fmtMin, fmtSpan } from '../util.ts';
import { TaskPicker } from './TaskPicker.tsx';

const LENGTHS: [number | null, string][] = [[null, '見積どおり'], ...ESTIMATES.filter(([m]) => m <= 120)];
const SHOWN = 8;

/** 置こうとしている枠と、始める時刻・長さ（パネルと時間割で同じものを見る） */
export function usePlacing(today: string, now: number) {
  const [slot, setSlot] = useState<Slot | null>(null);
  const [draft, setDraft] = useState<Draft>({ start: 0, len: null });
  const [focus, setFocus] = useState(0);
  const open = (s: Slot) => {
    setSlot(s);
    // 今日のいまから始まる空きは、5分単位に切り上げた時刻から。時間割でドラッグして選んだ長さはそのまま使う
    const start = s.date === today && s.start === now ? Math.ceil(now / 5) * 5 : s.start;
    setDraft({ start, len: s.fixed ? s.end - s.start : null });
    setFocus((n) => n + 1);
  };
  const close = useCallback(() => setSlot(null), []);
  return { slot, draft, setDraft, focus, open, close, pending: slot && { ...draft, date: slot.date } };
}

export function PlacePanel({
  slot,
  draft,
  onDraft,
  now,
  today,
  candidates,
  mode,
  onClose,
}: {
  slot: Slot;
  draft: Draft;
  onDraft: (d: Draft) => void;
  /** いまの時刻（分） */
  now: number;
  today: string;
  candidates: NextItem[];
  /** portal: 右の欄（今日の画面）・inline: その場（ボードの右の列）・dock: 画面の下半分 */
  mode: 'portal' | 'inline' | 'dock';
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [all, setAll] = useState(false);
  const [searching, setSearching] = useState(false);
  const [target, setTarget] = useState<HTMLElement | null>(null);
  useEffect(() => setTarget(document.getElementById(SIDE_PANEL_ID)), [mode]);
  // Esc で閉じる（入力中は除く）
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !(e.target instanceof HTMLInputElement)) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const date = slot.date;
  const isToday = date === today;
  const selected = slot.end - slot.start;
  const lengths: [number | null, string][] =
    slot.fixed && !LENGTHS.some(([m]) => m === selected) ? [[selected, `選んだ ${fmtSpan(selected)}`], ...LENGTHS] : LENGTHS;
  const place = useWrite((p: { task: Task; dates: Task['doDates'] }) => api.setDates(p.task.id, p.dates));
  const lengthOf = (t: Task) =>
    draft.len ?? t.doDates.find((d) => d.date === date)?.minutes ?? t.estimateMin ?? PLACE_DEFAULT_MIN;
  const room = slot.end - draft.start;
  const fits = (t: Task) => lengthOf(t) <= room;
  // その枠に入りきるものを先に（同じなら次にやる順）
  const sorted = [...candidates.filter((n) => fits(n.task)), ...candidates.filter((n) => !fits(n.task))];
  const shown = all ? sorted : sorted.slice(0, SHOWN);
  const start = fmtClock(draft.start);
  const day = isToday ? '' : `${fmtDate(date, today)} `;

  const choose = (t: Task) => {
    const minutes = lengthOf(t);
    const before = t.doDates.map((d) => ({ ...d, start: d.start ?? null }));
    // 過ぎたやる日（持ち越し）とその日の分は置き換え、先の日は残す
    const dates = [...t.doDates.filter((d) => d.date > today && d.date !== date), { date, minutes, start }].sort((a, b) =>
      a.date.localeCompare(b.date),
    );
    place.mutate(
      { task: t, dates },
      {
        onSuccess: () => {
          onClose();
          toast(`${t.code} を ${day}${start}–${fmtClock(draft.start + minutes)} に置いた`, 'info', {
            label: '元に戻す',
            run: () => void api.setDates(t.id, before).then(() => qc.invalidateQueries({ queryKey: ['tasks'] })),
          });
        },
      },
    );
  };

  const body = (
    <div className={mode === 'dock' ? 'p-4' : 'p-5'}>
      <div className="flex items-baseline gap-2">
        <h2 className="min-w-0 text-base font-semibold">
          {slot.host ? '予定に重ねて置く（ながら）' : slot.fixed ? '選んだ時間に置く' : '空きにタスクを置く'}
        </h2>
        <button type="button" onClick={onClose} className="ml-auto shrink-0 rounded px-2 py-1 text-sm text-zinc-500">
          閉じる
        </button>
      </div>
      <p className="mt-0.5 truncate text-xs text-zinc-500">
        {!isToday && <span className="mr-1 font-medium text-zinc-700 dark:text-zinc-300">{fmtDate(date, today)}</span>}
        {slot.host && <span className="mr-1">「{slot.host}」</span>}
        {isToday && slot.start === now ? 'いま' : fmtClock(slot.start)}–{fmtClock(slot.end)}（{fmtSpan(selected)}）
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
        <label className="flex items-center gap-1.5">
          始める
          <input
            type="time"
            step={300}
            value={start}
            onChange={(e) => e.target.value && onDraft({ ...draft, start: toMin(e.target.value) })}
            className="rounded-md border border-zinc-300 bg-transparent px-2 py-1 text-sm dark:border-zinc-700"
          />
        </label>
        <div className="flex flex-wrap gap-1">
          {lengths.map(([m, label]) => (
            <button
              key={String(m)}
              type="button"
              onClick={() => onDraft({ ...draft, len: m })}
              className={cx(
                'rounded-md border px-2 py-1 text-xs',
                draft.len === m
                  ? 'border-indigo-500 bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300'
                  : 'border-zinc-300 text-zinc-600 dark:border-zinc-700 dark:text-zinc-300',
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <p className="mt-3 mb-1 text-xs text-zinc-500">どれを置く？（{fmtSpan(Math.max(0, room))}に入るものを先に・次にやる順）</p>
      {candidates.length === 0 && <p className="py-3 text-center text-sm text-zinc-400">次にやるものの候補が無い。下から探して置ける。</p>}
      <div className="divide-y divide-zinc-200/70 dark:divide-zinc-800">
        {shown.map((n) => {
          const m = lengthOf(n.task);
          return (
            <button
              key={n.task.id}
              type="button"
              disabled={place.isPending}
              onClick={() => choose(n.task)}
              className="flex w-full items-start gap-3 py-2.5 text-left disabled:opacity-50"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm">{n.task.title}</span>
                <span className="block truncate text-[11px] text-zinc-500">{nextReason(n, fmtClock(now))}</span>
              </span>
              <span className="shrink-0 text-right text-xs text-zinc-500 tabular-nums">
                {fmtMin(m)}
                {m > room && <span className="block text-[10px] text-amber-600 dark:text-amber-400">はみ出す</span>}
              </span>
            </button>
          );
        })}
      </div>
      <div className="mt-1 flex flex-wrap gap-3">
        {!all && candidates.length > SHOWN && (
          <button type="button" onClick={() => setAll(true)} className="py-1 text-xs text-indigo-600 dark:text-indigo-400">
            ほか {candidates.length - SHOWN} 件も出す
          </button>
        )}
        {!searching && (
          <button type="button" onClick={() => setSearching(true)} className="py-1 text-xs text-indigo-600 dark:text-indigo-400">
            ほかのタスクを探す
          </button>
        )}
      </div>
      {/* 候補に出ないもの（日付も優先度も無いもの など）は名前で探して置く */}
      {searching && (
        <div className="mt-2">
          <TaskPicker
            exclude={new Set()}
            placeholder="タスクの名前で探す"
            onPick={(id) => void api.get(id).then(choose)}
            onCancel={() => setSearching(false)}
          />
        </div>
      )}
    </div>
  );

  if (mode === 'portal') return target ? createPortal(body, target) : null;
  if (mode === 'inline')
    return (
      <div className="sticky top-[57px] max-h-[calc(100dvh-65px)] overflow-y-auto rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        {body}
      </div>
    );
  return (
    <div className="pb-safe fixed inset-x-0 bottom-0 z-40 max-h-[50dvh] overflow-y-auto rounded-t-2xl border-t border-zinc-200 bg-white shadow-[0_-12px_32px_-12px_rgba(0,0,0,0.3)] md:left-1/2 md:w-full md:max-w-xl md:-translate-x-1/2 md:border-x dark:border-zinc-800 dark:bg-zinc-900">
      <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-zinc-300 dark:bg-zinc-700" />
      {body}
    </div>
  );
}
