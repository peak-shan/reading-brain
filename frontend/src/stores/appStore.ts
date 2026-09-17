import { create } from "zustand";

interface AppState {
  /** Global loading flag */
  loading: boolean;
  setLoading: (v: boolean) => void;
}

export const useAppStore = create<AppState>((set) => ({
  loading: false,
  setLoading: (v) => set({ loading: v }),
}));
