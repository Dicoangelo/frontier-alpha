import { useRef, useState } from 'react';
import type { KeyboardEvent, PointerEvent } from 'react';
import { GripVertical } from 'lucide-react';

interface PanelResizeHandleProps {
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  defaultValue: number;
}

export function PanelResizeHandle({ value, onChange, min, max, defaultValue }: PanelResizeHandleProps) {
  const drag = useRef<{ pointerId: number; startX: number; startValue: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const clamp = (size: number) => Math.min(max, Math.max(min, Math.round(size)));
  const current = clamp(Number.isFinite(value) ? value : defaultValue);

  const stop = (event: PointerEvent<HTMLDivElement> | KeyboardEvent<HTMLDivElement>) => {
    const start = drag.current;
    if (!start || ('pointerId' in event && event.pointerId !== start.pointerId)) return;
    drag.current = null;
    setDragging(false);
    if (event.currentTarget.hasPointerCapture(start.pointerId)) {
      event.currentTarget.releasePointerCapture(start.pointerId);
    }
  };

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize navigation"
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={current}
      aria-valuetext={`${current} pixels`}
      tabIndex={0}
      title="Drag to resize. Arrow keys adjust width; double-click resets."
      className={`workspace-resize-handle${dragging ? ' is-dragging' : ''}`}
      onPointerDown={(event) => {
        if (event.button !== 0 || !event.isPrimary || drag.current) return;
        event.preventDefault();
        event.currentTarget.focus();
        event.currentTarget.setPointerCapture(event.pointerId);
        drag.current = { pointerId: event.pointerId, startX: event.clientX, startValue: current };
        setDragging(true);
      }}
      onPointerMove={(event) => {
        const start = drag.current;
        if (!start || event.pointerId !== start.pointerId) return;
        event.preventDefault();
        onChange(clamp(start.startValue + event.clientX - start.startX));
      }}
      onPointerUp={stop}
      onPointerCancel={stop}
      onLostPointerCapture={() => { drag.current = null; setDragging(false); }}
      onDoubleClick={() => onChange(clamp(defaultValue))}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && drag.current) {
          event.preventDefault();
          onChange(drag.current.startValue);
          stop(event);
          return;
        }
        const step = event.shiftKey ? 30 : 10;
        const next = event.key === 'Home' ? min
          : event.key === 'End' ? max
          : event.key === 'ArrowLeft' ? current - step
          : event.key === 'ArrowRight' ? current + step
          : null;
        if (next !== null) {
          event.preventDefault();
          onChange(clamp(next));
        }
      }}
    >
      <GripVertical size={13} aria-hidden="true" />
    </div>
  );
}
