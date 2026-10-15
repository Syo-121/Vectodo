// 番号の表記（設計の正= docs/design.md 3-7）。
// 中身は整数なので上限はない。表示は最低3桁（T-060・T-999・T-1000）。

export function formatTaskCode(id: number): string {
  return `T-${String(id).padStart(3, '0')}`;
}

/** 'T-60'・'T-060'・'t60'・'60'・60 をすべて 60 として読む。読めなければ null。 */
export function parseTaskRef(ref: string | number): number | null {
  return parseRef(ref, 't');
}

/** メモの番号（M-001…）。規則はタスクと同じ */
export function formatMemoCode(id: number): string {
  return `M-${String(id).padStart(3, '0')}`;
}

export function parseMemoRef(ref: string | number): number | null {
  return parseRef(ref, 'm');
}

/** ノートの番号（N-001…）。規則はタスクと同じ */
export function formatNoteCode(id: number): string {
  return `N-${String(id).padStart(3, '0')}`;
}

export function parseNoteRef(ref: string | number): number | null {
  return parseRef(ref, 'n');
}

function parseRef(ref: string | number, prefix: string): number | null {
  if (typeof ref === 'number') return Number.isSafeInteger(ref) && ref > 0 ? ref : null;
  const m = new RegExp(`^\\s*(?:${prefix}-?)?(\\d+)\\s*$`, 'i').exec(ref);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}
