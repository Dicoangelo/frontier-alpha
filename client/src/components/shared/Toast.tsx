import { useEffect, useState } from 'react';
import { X, CheckCircle, AlertCircle, Info, AlertTriangle } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

interface ToastProps {
  id: string;
  type: ToastType;
  title: string;
  message?: string;
  duration?: number;
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
    bg: 'bg-green-50',
    border: 'border-green-200',
    icon: 'text-green-500',
    title: 'text-green-800',
    message: 'text-green-600',
  },
  error: {
    bg: 'bg-red-50',
    border: 'border-red-200',
    icon: 'text-red-500',
    title: 'text-red-800',
    message: 'text-red-600',
  },
  info: {
    bg: 'bg-blue-50',
    border: 'border-blue-200',
    icon: 'text-blue-500',
    title: 'text-blue-800',
    message: 'text-blue-600',
  },
  warning: {
    bg: 'bg-amber-50',
    border: 'border-amber-200',
    icon: 'text-amber-500',
    title: 'text-amber-800',
    message: 'text-amber-600',
  },
};

function Toast({ id, type, title, message, duration = 5000, onClose }: ToastProps) {
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
        ${colorScheme.bg} ${colorScheme.border} border
        rounded-lg shadow-lg p-4 max-w-sm w-full
        transition-all duration-300 ease-out
        ${isExiting ? 'opacity-0 translate-x-4' : 'opacity-100 translate-x-0'}
        animate-slide-in-right
      `}
      role="alert"
    >
      <div className="flex items-start gap-3">
        <Icon className={`w-5 h-5 flex-shrink-0 ${colorScheme.icon}`} />
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-medium ${colorScheme.title}`}>{title}</p>
          {message && (
            <p className={`text-sm mt-1 ${colorScheme.message}`}>{message}</p>
          )}
        </div>
        <button
          onClick={handleClose}
          className={`flex-shrink-0 ${colorScheme.icon} hover:opacity-70 transition-opacity`}
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
}

let toastListeners: ((toasts: ToastItem[]) => void)[] = [];
let toastState: ToastItem[] = [];

function notifyListeners() {
  toastListeners.forEach(listener => listener([...toastState]));
}

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
