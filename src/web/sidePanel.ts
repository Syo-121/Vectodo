// 広い画面の右の欄（ふだんはタスクの詳細）を、今日の流れの「置く」パネルが一時的に借りる（design 4-11）。
// 借りている間は詳細を隠し、パネルは右の欄の先頭（id = SIDE_PANEL_ID）へポータルで出す。

import { useEffect, useSyncExternalStore } from 'react';

export const SIDE_PANEL_ID = 'side-panel';

let claims = 0;
const listeners = new Set<() => void>();
const emit = () => {
  for (const l of listeners) l();
};

/** 右の欄を誰かが借りているか */
export function useSidePanelActive(): boolean {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => claims > 0,
  );
}

/** on の間だけ右の欄を借りる */
export function useClaimSidePanel(on: boolean): void {
  useEffect(() => {
    if (!on) return;
    claims++;
    emit();
    return () => {
      claims--;
      emit();
    };
  }, [on]);
}
