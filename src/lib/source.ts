import { useStore } from "./store";
import type { IconSource } from "./types";

/** Switching the glyph source keeps the background; leaving an artwork icon brings back a plain fill. */
export function applySource(source: IconSource, colorEnabled: boolean) {
  const { state, replace } = useStore.getState();
  const fromArtwork = state.fg.source.kind === "none" && state.bg.type === "image";
  replace({
    ...state,
    fg: { ...state.fg, source, colorEnabled, padding: source.kind === "image" ? Math.min(state.fg.padding, 16) : state.fg.padding },
    bg: fromArtwork ? { ...state.bg, type: "color" } : state.bg,
  });
}

export function useSetSource() {
  return applySource;
}
