import { useEffect, useState } from 'react';
import { X, CheckCircle, AlertCircle, Info, AlertTriangle } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

export interface ToastAction {
  label: string;
  onClick: () => void;
}

interface ToastProps {
  id: string;
  type: ToastType;
  title: string;
  message?: string;
  duration?: number;
  action?: ToastAction;
  onClose: (id: string) => void;
}

const icons = {
  success: CheckCircle,
  error: AlertCircle,
  info: Info,
  warning: AlertTriangle,
};

const colors = {
  success: {
    rail: 'before:bg-[var(--color-positive)]',
    icon: 'text-[var(--color-positive)]',
    glow: 'shadow-[0_18px_60px_-20px_rgba(16,185,129,0.45)]',
  },
  error: {
    rail: 'before:bg-[var(--color-danger)]',
    icon: 'text-[var(--color-danger)]',
    glow: 'shadow-[0_18px_60px_-20px_rgba(239,68,68,0.45)]',
  },
  info: {
    rail: 'before:bg-[image:var(--gradient-sovereign)]',
    icon: 'text-[var(--color-accent)]',
    glow: 'shadow-[0_18px_60px_-20px_rgba(123,44,255,0.45)]',
  },
  warning: {
    rail: 'before:bg-[var(--color-warning)]',
    icon: 'text-[var(--color-warning)]',
    glow: 'shadow-[0_18px_60px_-20px_rgba(245,158,11,0.45)]',
  },
};

function Toast({ id, type, title, message, duration = 4000, action, onClose }: ToastProps) {
  const [isExiting, setIsExiting] = useState(false);
  const Icon = icons[type];
  const colorScheme = colors[type];

  useEffect(() => {
    if (duration > 0) {
      const timer = setTimeout(() => {
        setIsExiting(true);
        setTimeout(() => onClose(id), 300);
      }, duration);
      return () => clearTimeout(timer);
    }
  }, [id, duration, onClose]);

  const handleClose = () => {
    setIsExiting(true);
    setTimeout(() => onClose(id), 300);
  };

  return (
    <div
      className={`
        glass-slab-floating relative overflow-hidden
        rounded-xl pl-5 pr-4 py-4 max-w-sm w-full
        ${colorScheme.glow}
        before:content-[''] before:absolute before:left-0 before:top-0 before:bottom-0 before:w-[3px]
        ${colorScheme.rail}
        transition-[opacity,transform] duration-300 ease-out
        ${isExiting ? 'opacity-0 translate-x-4' : 'opacity-100 translate-x-0 animate-slide-in-right'}
      `}
      role="alert"
    >
      <div className="flex items-start gap-3">
        <Icon className={`w-5 h-5 flex-shrink-0 mt-0.5 ${colorScheme.icon}`} />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-theme">{title}</p>
          {message && (
            <p className="text-sm mt-1 text-theme-secondary leading-relaxed">{message}</p>
          )}
          {action && (
            <button
              onClick={() => {
                action.onClick();
                handleClose();
              }}
              className={`text-sm font-medium mt-2 ${colorScheme.icon} hover:opacity-80 transition-opacity animate-press`}
            >
              {action.label}
            </button>
          )}
        </div>
        <button
          onClick={handleClose}
          className="flex-shrink-0 text-theme-muted hover:text-theme transition-colors animate-press"
          aria-label="Close notification"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

// Toast container and state management
interface ToastItem {
  id: string;
  type: ToastType;
  title: string;
  message?: string;
  duration?: number;
  action?: ToastAction;
}

let toastListeners: ((toasts: ToastItem[]) => void)[] = [];
let toastState: ToastItem[] = [];

function notifyListeners() {
  toastListeners.forEach(listener => listener([...toastState]));
}

// eslint-disable-next-line react-refresh/only-export-components
export const toast = {
  show: (options: Omit<ToastItem, 'id'>) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    toastState = [...toastState, { ...options, id }];
    notifyListeners();
    return id;
  },
  success: (title: string, message?: string) => {
    return toast.show({ type: 'success', title, message });
  },
  error: (title: string, message?: string) => {
    return toast.show({ type: 'error', title, message, duration: 8000 });
  },
  info: (title: string, message?: string) => {
    return toast.show({ type: 'info', title, message });
  },
  warning: (title: string, message?: string) => {
    return toast.show({ type: 'warning', title, message, duration: 6000 });
  },
  dismiss: (id: string) => {
    toastState = toastState.filter(t => t.id !== id);
    notifyListeners();
  },
  dismissAll: () => {
    toastState = [];
    notifyListeners();
  },
};

export function ToastContainer() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  useEffect(() => {
    const listener = (newToasts: ToastItem[]) => setToasts(newToasts);
    toastListeners.push(listener);
    return () => {
      toastListeners = toastListeners.filter(l => l !== listener);
    };
  }, []);

  const handleClose = (id: string) => {
    toast.dismiss(id);
  };

  if (toasts.length === 0) return null;

  return (
    <div
      className="fixed top-4 right-4 z-50 flex flex-col gap-2"
      aria-live="polite"
      aria-label="Notifications"
    >
      {toasts.map(item => (
        <Toast
          key={item.id}
          {...item}
          onClose={handleClose}
        />
      ))}
    </div>
  );
}
