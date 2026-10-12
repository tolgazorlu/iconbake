import { create } from "zustand";
import { createJSONStorage, persist, type StateStorage } from "zustand/middleware";
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

/**
 * localStorage holds ~5 MB. A large uploaded image would make every later write throw
 * QuotaExceededError (breaking each setter), so fall back to saving the state without
 * embedded images, and give up silently if even that does not fit.
 */
const safeStorage: StateStorage = {
  getItem: (name) => localStorage.getItem(name),
  removeItem: (name) => localStorage.removeItem(name),
  setItem: (name, value) => {
    try {
      localStorage.setItem(name, value);
    } catch {
      try {
        const data = JSON.parse(value) as { state: { state: IconState } };
        const s = data.state.state;
        if (s.fg.source.kind === "image") s.fg.source = { ...s.fg.source, dataUrl: "" };
        if (s.bg.image) s.bg = { ...s.bg, image: null, type: s.bg.type === "image" ? "color" : s.bg.type };
        localStorage.setItem(name, JSON.stringify(data));
        console.warn("iconbake: uploaded image too large to persist; it will not survive a reload");
      } catch {
        console.warn("iconbake: state too large to persist");
      }
    }
  },
};

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
      name: "iconbake:v1",
      storage: createJSONStorage(() => safeStorage),
      partialize: (s) => ({ state: s.state }),
      // Fill fields added after the state was first persisted.
      merge: (persisted, current) => {
        const saved = (persisted as { state?: Partial<IconState> } | undefined)?.state;
        return saved ? { ...current, state: { ...DEFAULT_STATE, ...saved } } : current;
      },
    },
  ),
);

export function useIcon() {
  return useStore((s) => s.state);
}
