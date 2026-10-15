// 画面下に数秒だけ出るお知らせ。どこからでも toast() で呼べる。

import { useSyncExternalStore } from 'react';

export interface ToastAction {
  label: string;
  run: () => void;
  /** 小さい枠つきのボタン（かかった時間の 15m・30m など） */
  chip?: boolean;
}

export interface Toast {
  id: number;
  text: string;
  kind: 'info' | 'error';
  actions: ToastAction[];
}

let items: Toast[] = [];
const listeners = new Set<() => void>();
let seq = 0;

function emit() {
  for (const l of listeners) l();
}

export function toast(
  text: string,
  kind: Toast['kind'] = 'info',
  action?: ToastAction | ToastAction[],
  ms = kind === 'error' ? 6000 : 3500,
): void {
  const t: Toast = { id: ++seq, text, kind, actions: action ? [action].flat() : [] };
  items = [...items.slice(-2), t];
  emit();
  setTimeout(() => dismiss(t.id), ms);
}

export function dismiss(id: number): void {
  items = items.filter((t) => t.id !== id);
  emit();
}

export function useToasts(): Toast[] {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => items,
  );
}
