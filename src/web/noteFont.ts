// ノートを開いたときの文字の大きさ（design 7-13）。端末ごとに設定画面で選ぶ（スマホと PC で別々）。

import { useLocalState } from './storage.ts';

export type NoteFont = 's' | 'm' | 'l';

/** 本文（とチェックリストの項目）とタイトルの大きさ（px） */
export const NOTE_FONTS: [NoteFont, string, { body: number; title: number }][] = [
  ['s', '小', { body: 14, title: 17 }],
  ['m', '中', { body: 15, title: 18 }],
  ['l', '大', { body: 17, title: 20 }],
];

export const useNoteFont = () => useLocalState<NoteFont>('notes.fontSize', 'm');

export function noteFontPx(f: NoteFont): { body: number; title: number } {
  return (NOTE_FONTS.find(([k]) => k === f) ?? NOTE_FONTS[1]!)[2];
}
