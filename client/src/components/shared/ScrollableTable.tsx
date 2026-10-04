import { useRef, useState, useEffect, useCallback, useId } from 'react';

interface ScrollableTableProps {
  children: React.ReactNode;
  className?: string;
  label?: string;
}

/** The same visible horizontal slider used by the Partnerships workspace. */
export function ScrollableTable({ children, className = '', label = 'Scroll table horizontally' }: ScrollableTableProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const id = useId();
  const [metrics, setMetrics] = useState({ maximum: 0, position: 0 });
  const synchronize = useCallback(() => {
    const node = scrollRef.current;
    if (!node) return;
    const maximum = Math.max(0, node.scrollWidth - node.clientWidth);
    const position = Math.max(0, Math.min(maximum, node.scrollLeft));
    setMetrics(previous => previous.maximum === maximum && previous.position === position ? previous : { maximum, position });
  }, []);

  useEffect(() => {
    const node = scrollRef.current;
    if (!node) return;
    synchronize();
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(synchronize) : null;
    observer?.observe(node);
    for (const child of node.children) observer?.observe(child);
    window.addEventListener('resize', synchronize);
    return () => { observer?.disconnect(); window.removeEventListener('resize', synchronize); };
  }, [children, synchronize]);

  return <div className={`workspace-table-scroll ${className}`}>
    {metrics.maximum > 1 && <div className="workspace-table-scroll-control">
      <span>More columns</span><input type="range" min={0} max={metrics.maximum} step={1} value={metrics.position} aria-label={label} aria-controls={id}
        aria-valuetext={`${Math.round(metrics.position / metrics.maximum * 100)}%`} onChange={event => {
          if (scrollRef.current) scrollRef.current.scrollLeft = Number(event.target.value);
          synchronize();
        }} />
    </div>}
    <div ref={scrollRef} id={id} className="workspace-table-viewport" tabIndex={metrics.maximum > 1 ? 0 : undefined} role="region" aria-label={label} onScroll={synchronize}>{children}</div>
  </div>;
}
