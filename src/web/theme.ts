// 表示テーマ（システムに合わせる／ライト／ダーク）。端末ごとに localStorage に覚える。
// 最初の描画前の適用は index.html の先頭のスクリプトが行う（一瞬白く光るのを防ぐ）。ここはその後の切り替え担当。

import { useSyncExternalStore } from 'react';

export type ThemePref = 'system' | 'light' | 'dark';

const KEY = 'task-app.theme';
const media = () => window.matchMedia('(prefers-color-scheme: dark)');

function read(): ThemePref {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '"system"') as unknown;
    return v === 'light' || v === 'dark' ? v : 'system';
  } catch {
    return 'system';
  }
}

let pref: ThemePref = read();
const listeners = new Set<() => void>();

function apply(): void {
  const dark = pref === 'dark' || (pref === 'system' && media().matches);
  document.documentElement.classList.toggle('dark', dark);
  document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
}

export function setThemePref(next: ThemePref): void {
  pref = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // 保存できなくてもこの画面の間は効く
  }
  apply();
  for (const l of listeners) l();
}

/** 「システムに合わせる」のとき、OS 側の切り替えにも追従する */
export function initTheme(): void {
  apply();
  media().addEventListener('change', () => pref === 'system' && apply());
}

export function useThemePref(): ThemePref {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => pref,
  );
}
