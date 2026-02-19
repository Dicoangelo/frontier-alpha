import { useState, useRef, useEffect } from 'react';
import type { ReactNode } from 'react';
import { RefreshCw } from 'lucide-react';

interface PullToRefreshProps {
  onRefresh: () => Promise<void>;
  children: ReactNode;
  className?: string;
  threshold?: number;
  disabled?: boolean;
}

export function PullToRefresh({
  onRefresh,
  children,
  className = '',
  threshold = 80,
  disabled = false,
}: PullToRefreshProps) {
  const [pullDistance, setPullDistance] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isPulling, setIsPulling] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const startY = useRef(0);
  const currentY = useRef(0);

  const progress = Math.min(pullDistance / threshold, 1);
  const rotation = progress * 360;

  useEffect(() => {
    const container = containerRef.current;
    if (!container || disabled) return;

    const handleTouchStart = (e: TouchEvent) => {
      // Only activate when scrolled to top
      if (container.scrollTop > 0) return;

      startY.current = e.touches[0].clientY;
      setIsPulling(true);
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (!isPulling || isRefreshing) return;

      currentY.current = e.touches[0].clientY;
      const delta = currentY.current - startY.current;

      if (delta > 0 && container.scrollTop === 0) {
        // Apply resistance to pull
        const distance = Math.min(delta * 0.5, threshold * 1.5);
        setPullDistance(distance);

        // Prevent default scroll
        if (distance > 10) {
          e.preventDefault();
        }
      }
    };

    const handleTouchEnd = async () => {
      if (!isPulling) return;

      setIsPulling(false);

      if (pullDistance >= threshold && !isRefreshing) {
        setIsRefreshing(true);
        setPullDistance(threshold * 0.6); // Hold at refresh position

        try {
          await onRefresh();
        } catch (error) {
          console.error('Refresh failed:', error);
        } finally {
          setIsRefreshing(false);
          setPullDistance(0);
        }
      } else {
        setPullDistance(0);
      }
    };

    container.addEventListener('touchstart', handleTouchStart, { passive: true });
    container.addEventListener('touchmove', handleTouchMove, { passive: false });
    container.addEventListener('touchend', handleTouchEnd);

    return () => {
      container.removeEventListener('touchstart', handleTouchStart);
      container.removeEventListener('touchmove', handleTouchMove);
      container.removeEventListener('touchend', handleTouchEnd);
    };
  }, [isPulling, isRefreshing, pullDistance, threshold, onRefresh, disabled]);

  return (
    <div
      ref={containerRef}
      className={`relative overflow-y-auto overscroll-contain ${className}`}
    >
      {/* Pull indicator */}
      <div
        className={`
          absolute top-0 left-0 right-0 flex items-center justify-center
          transition-opacity duration-200
          ${pullDistance > 0 ? 'opacity-100' : 'opacity-0'}
        `}
        style={{
          height: pullDistance,
          transform: `translateY(-${Math.max(0, threshold * 0.6 - pullDistance)}px)`,
        }}
      >
        <div
          className={`
            w-10 h-10 rounded-full bg-[var(--color-bg)] shadow-lg
            flex items-center justify-center
            transition-transform duration-200
            ${isRefreshing ? 'animate-spin' : ''}
          `}
          style={{
            transform: isRefreshing ? undefined : `rotate(${rotation}deg)`,
          }}
        >
          <RefreshCw
            className={`w-5 h-5 ${
              progress >= 1 ? 'text-[var(--color-info)]' : 'text-[var(--color-text-muted)]'
            }`}
          />
        </div>
      </div>

      {/* Content */}
      <div
        style={{
          transform: `translateY(${pullDistance}px)`,
          transition: isPulling ? 'none' : 'transform 0.3s ease-out',
        }}
      >
        {children}
      </div>
    </div>
  );
}
