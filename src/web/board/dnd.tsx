// ドラッグの共通部品（dnd-kit）。PC はマウスで 6px 動かしたらつかむ、スマホは長押し 250ms でつかむ。
// 長押しにしているのは、普通のスワイプで列やページをスクロールできるようにするため。

import {
  DndContext,
  DragOverlay,
  MouseSensor,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { useState, type ReactNode } from 'react';
import { cx } from '../util.ts';

export function BoardDnd({ children, onDrop }: { children: ReactNode; onDrop: (dragId: string, dropId: string) => void }) {
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
  );
  const [preview, setPreview] = useState<ReactNode>(null);
  return (
    <DndContext
      sensors={sensors}
      onDragStart={(e) => setPreview((e.active.data.current?.preview as ReactNode) ?? null)}
      onDragEnd={(e) => {
        setPreview(null);
        if (e.over) onDrop(String(e.active.id), String(e.over.id));
      }}
      onDragCancel={() => setPreview(null)}
    >
      {children}
      <DragOverlay dropAnimation={null}>
        {preview && <div className="w-64 rotate-2 opacity-90 shadow-xl">{preview}</div>}
      </DragOverlay>
    </DndContext>
  );
}

export function Droppable({
  id,
  disabled,
  className,
  children,
}: {
  id: string;
  disabled?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id, disabled });
  return (
    <div ref={setNodeRef} className={cx(className, isOver && 'bg-indigo-50 ring-2 ring-indigo-400 dark:bg-indigo-950/40')}>
      {children}
    </div>
  );
}

export function Draggable({ id, disabled, children }: { id: string; disabled?: boolean; children: ReactNode }) {
  const { setNodeRef, listeners, attributes, isDragging } = useDraggable({ id, disabled, data: { preview: children } });
  return (
    <div
      ref={setNodeRef}
      {...(disabled ? {} : listeners)}
      {...(disabled ? {} : attributes)}
      // 長押しでつかむので、iPhone の文字選択・コピーのメニューが出ないようにする
      className={cx('select-none', isDragging && 'opacity-30')}
      style={{ touchAction: 'manipulation', WebkitTouchCallout: 'none' }}
    >
      {children}
    </div>
  );
}
