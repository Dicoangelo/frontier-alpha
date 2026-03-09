import { useRef, useState, useEffect, useCallback } from 'react';

interface ScrollableTableProps {
  children: React.ReactNode;
  className?: string;
}

export function ScrollableTable({ children, className = '' }: ScrollableTableProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const checkOverflow = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 0);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 1);
  }, []);

  useEffect(() => {
    checkOverflow();
    const el = scrollRef.current;
    if (!el) return;

    el.addEventListener('scroll', checkOverflow, { passive: true });
    const observer = new ResizeObserver(checkOverflow);
    observer.observe(el);

    return () => {
      el.removeEventListener('scroll', checkOverflow);
      observer.disconnect();
    };
  }, [checkOverflow]);

  return (
    <div className={`relative ${className}`}>
      {/* Left shadow */}
      {canScrollLeft && (
        <div
          className="absolute left-0 top-0 bottom-0 w-4 z-10 pointer-events-none"
          style={{
            background: 'linear-gradient(to right, var(--color-bg), transparent)',
          }}
        />
      )}

      <div
        ref={scrollRef}
        className="overflow-x-auto"
        style={{ WebkitOverflowScrolling: 'touch' }}
      >
        {children}
      </div>

      {/* Right shadow */}
      {canScrollRight && (
        <div
          className="absolute right-0 top-0 bottom-0 w-4 z-10 pointer-events-none"
          style={{
            background: 'linear-gradient(to left, var(--color-bg), transparent)',
          }}
        />
      )}
    </div>
  );
}
