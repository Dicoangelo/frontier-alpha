import { create } from 'zustand';

interface DataSourceState {
  isUsingMockData: boolean;
  setMockData: (isMock: boolean) => void;
}

/**
 * Tracks whether the current session is operating on mock/simulated data.
 * Updated by the API client interceptor on every response that includes
 * an X-Data-Source header.
 */
export const useDataSourceStore = create<DataSourceState>((set) => ({
  isUsingMockData: false,
  setMockData: (isMock: boolean) => set({ isUsingMockData: isMock }),
}));
