import { create } from "zustand";
import { persist } from "zustand/middleware";
import { DEFAULT_STATE, type Background, type Foreground, type IconState } from "./types";

interface Store {
  state: IconState;
  history: IconState[];
  future: IconState[];
  set: (patch: Partial<IconState>) => void;
  setFg: (patch: Partial<Foreground>) => void;
  setBg: (patch: Partial<Background>) => void;
  replace: (s: IconState) => void;
  undo: () => void;
  redo: () => void;
  reset: () => void;
}

const MAX = 60;

export const useStore = create<Store>()(
  persist(
    (set, get) => ({
      state: DEFAULT_STATE,
      history: [],
      future: [],
      set: (patch) => {
        const { state, history } = get();
        set({ state: { ...state, ...patch }, history: [...history.slice(-MAX), state], future: [] });
      },
      setFg: (patch) => {
        const { state, history } = get();
        set({ state: { ...state, fg: { ...state.fg, ...patch } }, history: [...history.slice(-MAX), state], future: [] });
      },
      setBg: (patch) => {
        const { state, history } = get();
        set({ state: { ...state, bg: { ...state.bg, ...patch } }, history: [...history.slice(-MAX), state], future: [] });
      },
      replace: (s) => {
        const { state, history } = get();
        set({ state: s, history: [...history.slice(-MAX), state], future: [] });
      },
      undo: () => {
        const { state, history, future } = get();
        if (!history.length) return;
        const prev = history[history.length - 1];
        set({ state: prev, history: history.slice(0, -1), future: [state, ...future] });
      },
      redo: () => {
        const { state, history, future } = get();
        if (!future.length) return;
        const [next, ...rest] = future;
        set({ state: next, history: [...history, state], future: rest });
      },
      reset: () => set({ state: DEFAULT_STATE, history: [], future: [] }),
    }),
    {
      name: "icony:v1",
      partialize: (s) => ({ state: s.state }),
    },
  ),
);

export function useIcon() {
  return useStore((s) => s.state);
}
