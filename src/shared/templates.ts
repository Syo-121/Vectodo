// テンプレートの小さな関数（design 4-8）。サーバ・MCP の文・画面で同じものを使う。

import type { TemplateBody, TemplateNode } from './types.ts';

const DATE_PREFIX = /^(\d{1,2})\/(\d{1,2})\s+/;

/** 「10/18 ブログ」→「ブログ」（日付で始まっていなければそのまま） */
export function stripDatePrefix(title: string): { title: string; datePrefix: boolean } {
  const m = DATE_PREFIX.exec(title);
  return m && title.length > m[0].length
    ? { title: title.slice(m[0].length), datePrefix: true }
    : { title, datePrefix: false };
}

/** 適用したときの親のタイトル。元が日付で始まっていたなら、基準日を M/D で付ける */
export function defaultTitle(body: TemplateBody, date: string | null | undefined): string {
  if (!body.datePrefix || !date) return body.root.title;
  const [, m, d] = date.split('-').map(Number);
  return `${m}/${d} ${body.root.title}`;
}

/** 親から順に、深さつきで平らにする */
export function flatten(n: TemplateNode, depth = 0): { node: TemplateNode; depth: number }[] {
  return [{ node: n, depth }, ...n.children.flatMap((c) => flatten(c, depth + 1))];
}

/** 0 → 基準日、-3 → 3日前、2 → 2日後 */
export function offsetLabel(n: number): string {
  return n === 0 ? '基準日' : n < 0 ? `${-n}日前` : `${n}日後`;
}

/** 基準日の呼び方（適用するときの入力欄の名前） */
export function anchorLabel(anchor: TemplateBody['anchor']): string {
  return anchor === 'due' ? '締切' : anchor === 'do' ? 'やる日' : '基準日';
}
