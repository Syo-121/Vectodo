// 詳細は URL の ?t=130 で開く（どの画面の上にも重ねられ、戻るボタンで閉じる）。

import { useCallback } from 'react';
import { useSearchParams } from 'react-router';

export function useOpenTaskId(): number | null {
  const [params] = useSearchParams();
  const t = Number(params.get('t'));
  return Number.isSafeInteger(t) && t > 0 ? t : null;
}

export function useOpenTask(): (id: number | null) => void {
  const [, setParams] = useSearchParams();
  return useCallback(
    (id: number | null) =>
      setParams(
        (p) => {
          const next = new URLSearchParams(p);
          if (id === null) next.delete('t');
          else next.set('t', String(id));
          return next;
        },
        { replace: id === null },
      ),
    [setParams],
  );
}
