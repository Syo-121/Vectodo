// AI（MCP）向けの1行表記。トークンを食わないよう短く、でも日付は年まで書く（年またぎで誤読しないため）。

import { formatTaskCode } from '../shared/ids.ts';
import { PRIORITY_LABEL, STATUS_LABEL, isOpen } from '../shared/schemas.ts';
import { NEXT_COUNT, nextReason } from '../shared/next.ts';
import { isContainer, isFinishedSeries } from '../shared/series.ts';
import { anchorLabel, flatten, offsetLabel } from '../shared/templates.ts';
import { fmtAmount, goalRuleText, periodCounter, progressText } from '../shared/goals.ts';
import type { Category, Goal, GoalDetail, GoalPlan, Memo, Note, Recurrence, Task, TaskDetail, Template, TodayView } from '../shared/types.ts';

const WEEKDAY = ['', '月', '火', '水', '木', '金', '土', '日'];

function minutes(m: number): string {
  if (m % 60 === 0) return `${m / 60}h`;
  return m > 60 ? `${Math.floor(m / 60)}h${m % 60}m` : `${m}m`;
}

export function recurrenceText(r: Recurrence): string {
  const base =
    r.kind === 'weekly'
      ? `毎週${(r.weekdays ?? []).map((w) => WEEKDAY[w]).join('・')}`
      : r.kind === 'monthly'
        ? `毎月${r.monthDay}日`
        : r.kind === 'interval'
          ? `${r.intervalDays}日ごと`
          : `完了から${r.intervalDays}日後`;
  return `${base}（${r.anchor === 'do' ? 'やる日' : '締切'}基準${r.active ? '' : '・停止中'}）`;
}

/**
 * 1件1行。子が残っている親は「シリーズ 0/7」（steps を渡すと「次:T-155」＝いま着手できる子も・無ければ「次:なし」）、
 * 子が全部終わった親は「子3/3 全部済」（design 4-3）
 */
export function taskLine(t: Task, cats: Map<number, Category>, steps?: Map<number, string[]>): string {
  const parts = [t.code];
  if (t.categoryId !== null) parts.push(`[${cats.get(t.categoryId)?.name ?? `#${t.categoryId}`}]`);
  parts.push(t.title);
  if (t.dueDate) parts.push(`締切 ${t.dueDate}${t.dueTime ? ` ${t.dueTime}` : ''}`);
  if (t.doDates.length) {
    const day = (d: Task['doDates'][number]) =>
      d.date + (d.start ? ` ${d.start}〜` : '') + (d.minutes ? `(${minutes(d.minutes)})` : '');
    parts.push(`やる日 ${t.doDates.map(day).join(',')}`);
  }
  if (t.estimateMin) parts.push(`見積 ${minutes(t.estimateMin)}`);
  if (t.actualMin) parts.push(`実績 ${minutes(t.actualMin)}`);
  if (t.priority) parts.push(`優先:${PRIORITY_LABEL[t.priority]}`);
  parts.push(STATUS_LABEL[t.status]);
  const waitingOn = t.dependsOn.filter((d) => isOpen(d.status));
  if (waitingOn.length) parts.push(`依存待ち:${waitingOn.map((d) => d.code).join(',')}`);
  else if (isOpen(t.status) && t.waitVia) parts.push(`依存待ち:親${t.waitVia.code}`);
  if (isContainer(t)) {
    parts.push(`シリーズ${t.children.done}/${t.children.total}`);
    const next = steps?.get(t.id);
    if (next) parts.push(`次:${next.length ? next.join(',') : 'なし'}`);
  } else if (t.children.total) {
    parts.push(`子${t.children.done}/${t.children.total}${isFinishedSeries(t) ? ' 全部済' : ''}`);
  }
  if (t.parentId !== null) parts.push(`親:${formatTaskCode(t.parentId)}`);
  if (t.recurrence) parts.push('🔁');
  return parts.join(' ');
}

export function taskDetailText(t: TaskDetail, cats: Map<number, Category>): string {
  const lines = [taskLine(t, cats)];
  if (t.parentTitle) lines.push(`親: ${t.parentTitle}`);
  if (t.recurrence) lines.push(`繰り返し: ${recurrenceText(t.recurrence)}`);
  if (t.dependsOn.length) {
    lines.push(`先にやる: ${t.dependsOn.map((d) => `${d.code} ${d.title}（${STATUS_LABEL[d.status]}）`).join(' / ')}`);
  }
  if (t.dependents.length) {
    lines.push(`後にやる: ${t.dependents.map((d) => `${d.code} ${d.title}（${STATUS_LABEL[d.status]}）`).join(' / ')}`);
  }
  if (t.childTasks.length) {
    lines.push('子タスク:');
    for (const c of t.childTasks) lines.push(`  - ${taskLine(c, cats)}`);
  }
  if (t.legacyId) lines.push(`旧番号: ${t.legacyId}`);
  lines.push(`登録 ${t.createdAt.slice(0, 10)}${t.completedAt ? ` / 完了 ${t.completedAt.slice(0, 10)}` : ''}`);
  if (t.notes.trim()) lines.push('メモ:', t.notes.trim());
  return lines.join('\n');
}

/** メモは本文を全部出す（AI が振り分けに使うので省略しない） */
export function memoText(m: Memo): string {
  const at = `${m.createdAt.slice(0, 10)} ${m.createdAt.slice(11, 16)}`;
  const head =
    m.status === 'done'
      ? `${m.code}（${at}・済 ${m.processedAt?.slice(0, 10) ?? ''}${m.destination ? ` → ${m.destination}` : ''}）`
      : `${m.code}（${at}）`;
  return [head, ...m.body.split('\n').map((l) => `  ${l}`)].join('\n');
}

/** ノート（MCP 用）。中身は全部出す */
export function noteText(n: Note): string {
  const head = [n.code, n.pinned ? '📌' : '', ...n.labels.map((l) => `[${l}]`), n.title || '（タイトルなし）'].filter(Boolean).join(' ');
  const lines =
    n.kind === 'list'
      ? n.items.filter((i) => i.text.trim()).map((i) => `${i.done ? '☑' : '☐'} ${i.text}`)
      : n.body.split('\n');
  return [`${head}（更新 ${n.updatedAt.slice(0, 10)}${n.archived ? '・アーカイブ' : ''}）`, ...lines.map((l) => `  ${l}`)].join('\n');
}

export function todayText(v: TodayView, cats: Map<number, Category>): string {
  const section = (title: string, tasks: Task[], mark?: (t: Task) => string) =>
    tasks.length ? [`## ${title}（${tasks.length}）`, ...tasks.map((t) => `- ${mark?.(t) ?? ''}${taskLine(t, cats)}`)] : [];
  const next = v.ranked.slice(0, NEXT_COUNT);
  const steps = new Map(Object.entries(v.steps).map(([id, codes]) => [Number(id), codes]));
  return [
    `今日: ${v.today}`,
    ...(next.length
      ? [`## 次にやること（画面の「今日」の先頭と同じ順）`, ...next.map((n, i) => `${i + 1}. ${taskLine(n.task, cats)} ← ${nextReason(n, v.now)}`)]
      : []),
    ...section('期限切れ', v.overdue),
    ...section('今日やる', v.todo, (t) => ((t as Task & { carriedOver: boolean }).carriedOver ? '〔持ち越し〕' : '')),
    ...section('締切間近（7日以内）', v.dueSoon),
    ...(v.seriesDue.length
      ? [
          `## シリーズの締切（7日以内・過ぎたものも）（${v.seriesDue.length}）`,
          ...v.seriesDue.map((t) => `- ${taskLine(t, cats, steps)}`),
        ]
      : []),
    ...section('子が全部終わった（閉じる？）', v.closable),
    ...section('今日完了', v.doneToday),
  ].join('\n');
}

/** テンプレートの中身（MCP 用）。日付は基準日からの相対で書く */
export function templateText(t: Template, cats: Map<number, Category>): string {
  const { root, deps, anchor, datePrefix } = t.body;
  const nodes = flatten(root);
  const base = anchor ? `親の${anchorLabel(anchor)}` : 'なし（日付は覚えていない）';
  const head = `#${t.id} ${t.name}（${nodes.length}件・依存${deps.length}本・基準日=${base}${datePrefix ? '・親のタイトルに日付を付ける' : ''}）`;
  const titleOf = new Map(nodes.map(({ node }) => [node.key, node.title]));
  const lines = nodes.map(({ node: n, depth }) => {
    const parts = [`${'  '.repeat(depth)}- ${n.title}`];
    if (n.categoryId !== null) parts.push(`[${cats.get(n.categoryId)?.name ?? `#${n.categoryId}`}]`);
    if (n.dueOffset !== null) parts.push(`締切 ${offsetLabel(n.dueOffset)}${n.dueTime ? ` ${n.dueTime}` : ''}`);
    if (n.doOffsets.length) {
      const days = n.doOffsets.map((o) => `${offsetLabel(o.offset)}${o.minutes ? `(${minutes(o.minutes)})` : ''}`);
      parts.push(`やる日 ${days.join('・')}`);
    }
    if (n.priority) parts.push(`優先:${PRIORITY_LABEL[n.priority]}`);
    if (n.estimateMin) parts.push(`見積${minutes(n.estimateMin)}`);
    return parts.join(' ');
  });
  const order = deps.map(([after, before]) => `${titleOf.get(before)} → ${titleOf.get(after)}`);
  return [head, ...lines, ...(order.length ? [`依存（先 → 後）: ${order.join(' / ')}`] : [])].join('\n');
}

/** 目標の1行（design 4-13）: G-001 プール（週に2回・2026-10-19 から） 今週 1/2回 連続3週 達成 5/7週 累計 18回 */
export function goalLine(g: Goal): string {
  const p = g.progress;
  const parts = [g.code, `${g.title}（${goalRuleText(g)}・${g.startDate} から${g.kind === 'rate' && g.endDate ? ` ${g.endDate} まで` : ''}）`];
  parts.push(progressText(g, p));
  if (g.kind === 'rate' && g.period && !p.notStarted) {
    const c = periodCounter(g.period);
    if (p.streak > 0) parts.push(`連続${p.streak}${c}`);
    if (p.record.total > 0) parts.push(`達成 ${p.record.achieved}/${p.record.total}${c}`);
    parts.push(`累計 ${fmtAmount(p.sum, g.unit)}`);
  }
  if (g.kind === 'total' && p.perDay !== null) parts.push(`残り${p.daysLeft}日・1日 ${fmtAmount(p.perDay, g.unit)}`);
  if (p.todaySum > 0 && g.period !== 'day') parts.push(`今日 ${fmtAmount(p.todaySum, g.unit)}`);
  if (g.archived) parts.push('（アーカイブ）');
  return parts.join(' ');
}

/** 目標の詳細: 1行＋メモ＋記録（新しい順・limit 件まで） */
export function goalDetailText(g: GoalDetail, limit = 30): string {
  const logs = g.logs.slice(0, limit);
  return [
    goalLine(g),
    ...(g.notes.trim() ? ['メモ:', ...g.notes.trim().split('\n').map((l) => `  ${l}`)] : []),
    g.logs.length ? `記録（${g.logs.length}件${g.logs.length > limit ? `・新しい ${limit} 件` : ''}）:` : '記録: まだない',
    ...logs.map((l) => `- ${l.date} ${fmtAmount(l.amount, g.unit)}${l.note ? ` ${l.note}` : ''}`),
    ...goalPlansText(g.plans.filter((p) => !p.done)),
  ].join('\n');
}

/** やる時間の1行: - #12 2026-10-21 21:00〜(30m)（済） */
export function goalPlanLine(p: GoalPlan): string {
  const when = p.start ? ` ${p.start}〜${p.minutes ? `(${minutes(p.minutes)})` : ''}` : '（時刻なし）';
  return `- #${p.id} ${p.date}${when}${p.done ? '（済）' : ''}`;
}

function goalPlansText(plans: GoalPlan[]): string[] {
  return plans.length ? [`やる時間（まだのもの ${plans.length}件）:`, ...plans.map(goalPlanLine)] : [];
}
