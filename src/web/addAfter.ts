// 即追加（＋ボタン）で保存したあと、シートを開いたままにするか閉じるか（design 7-2）。
// 端末ごとに設定画面で選ぶ（スマホと PC で別々）。タスクとメモに効く（テンプレは作ったら閉じる）。

import { useLocalState } from './storage.ts';

export type AddAfter = 'stay' | 'close';

export const ADD_AFTER: [AddAfter, string][] = [
  ['stay', '続けて入れる'],
  ['close', '1件で閉じる'],
];

export const useAddAfter = () => useLocalState<AddAfter>('quickAdd.after', 'stay');
