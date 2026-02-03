import { create } from 'zustand';
import type { RiskAlert } from '@/types';

interface AlertsState {
  alerts: RiskAlert[];
  unreadCount: number;
  addAlert: (alert: RiskAlert) => void;
  acknowledgeAlert: (id: string) => void;
  clearAll: () => void;
}

export const useAlertsStore = create<AlertsState>((set) => ({
  alerts: [],
  unreadCount: 0,
  addAlert: (alert) =>
    set((state) => ({
      alerts: [alert, ...state.alerts].slice(0, 50),
      unreadCount: state.unreadCount + 1,
    })),
  acknowledgeAlert: (id) =>
    set((state) => ({
      alerts: state.alerts.map((a) =>
        a.id === id ? { ...a, acknowledged: true } : a
      ),
      unreadCount: Math.max(0, state.unreadCount - 1),
    })),
  clearAll: () => set({ alerts: [], unreadCount: 0 }),
}));
