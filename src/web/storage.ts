// 画面の好み（並べ方・畳んだ親など）だけを localStorage に覚える。使えなくても動く。

import { useState } from 'react';

export function useLocalState<T>(key: string, initial: T): [T, (v: T) => void] {
  const [v, setV] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(`task-app.${key}`);
      return raw === null ? initial : (JSON.parse(raw) as T);
    } catch {
      return initial;
    }
  });
  const set = (next: T) => {
    setV(next);
    try {
      localStorage.setItem(`task-app.${key}`, JSON.stringify(next));
    } catch {
      // 保存できなくても画面は動く
    }
  };
  return [v, set];
}
