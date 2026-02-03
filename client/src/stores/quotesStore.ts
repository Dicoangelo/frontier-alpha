import { create } from 'zustand';
import type { Quote } from '@/types';

interface QuotesState {
  quotes: Map<string, Quote>;
  lastUpdate: Date | null;
  isConnected: boolean;
  updateQuote: (quote: Quote) => void;
  setConnected: (connected: boolean) => void;
}

export const useQuotesStore = create<QuotesState>((set) => ({
  quotes: new Map(),
  lastUpdate: null,
  isConnected: false,
  updateQuote: (quote) =>
    set((state) => {
      const newQuotes = new Map(state.quotes);
      newQuotes.set(quote.symbol, quote);
      return { quotes: newQuotes, lastUpdate: new Date() };
    }),
  setConnected: (isConnected) => set({ isConnected }),
}));
