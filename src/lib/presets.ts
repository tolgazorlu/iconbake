import type { IconState } from "./types";

export interface Preset {
  id: string;
  label: string;
  apply: (s: IconState) => IconState;
}

// Logofa.st-style one-click looks. Each preset only touches background, shape and glyph color;
// the chosen icon stays.
export const PRESETS: Preset[] = [
  {
    id: "ink",
    label: "Ink",
    apply: (s) => ({ ...s, shape: "squircle", fg: { ...s.fg, color: "#ffffff", effect: "none" }, bg: { ...s.bg, type: "color", color: "#0a0a0a", texture: "none", border: { width: 0, color: "#fff" } } }),
  },
  {
    id: "paper",
    label: "Paper",
    apply: (s) => ({ ...s, shape: "squircle", fg: { ...s.fg, color: "#0a0a0a", effect: "none" }, bg: { ...s.bg, type: "color", color: "#f5f5f0", texture: "none", border: { width: 0, color: "#fff" } } }),
  },
  {
    id: "graphite",
    label: "Graphite",
    apply: (s) => ({ ...s, shape: "squircle", fg: { ...s.fg, color: "#ffffff", effect: "emboss" }, bg: { ...s.bg, type: "gradient", gradient: { from: "#3a3a3c", to: "#1c1c1e", angle: 180, kind: "linear" }, texture: "none" } }),
  },
  {
    id: "sunset",
    label: "Sunset",
    apply: (s) => ({ ...s, shape: "squircle", fg: { ...s.fg, color: "#ffffff", effect: "drop" }, bg: { ...s.bg, type: "gradient", gradient: { from: "#ff6b3d", to: "#ff2d55", angle: 135, kind: "linear" }, texture: "none" } }),
  },
  {
    id: "ocean",
    label: "Ocean",
    apply: (s) => ({ ...s, shape: "squircle", fg: { ...s.fg, color: "#ffffff", effect: "none" }, bg: { ...s.bg, type: "gradient", gradient: { from: "#0a84ff", to: "#5e5ce6", angle: 160, kind: "linear" }, texture: "none" } }),
  },
  {
    id: "mint",
    label: "Mint",
    apply: (s) => ({ ...s, shape: "squircle", fg: { ...s.fg, color: "#0a2e1f", effect: "none" }, bg: { ...s.bg, type: "gradient", gradient: { from: "#a8ffdc", to: "#30d158", angle: 135, kind: "linear" }, texture: "none" } }),
  },
  {
    id: "candy",
    label: "Candy",
    apply: (s) => ({ ...s, shape: "squircle", fg: { ...s.fg, color: "#ffffff", effect: "cast" }, bg: { ...s.bg, type: "gradient", gradient: { from: "#ff9ac1", to: "#bf5af2", angle: 45, kind: "linear" }, texture: "none" } }),
  },
  {
    id: "aurora",
    label: "Aurora",
    apply: (s) => ({ ...s, shape: "squircle", fg: { ...s.fg, color: "#ffffff", effect: "drop" }, bg: { ...s.bg, type: "mesh", mesh: { seed: 11, colors: ["#1e1b4b", "#5e5ce6", "#30d158", "#0a84ff"] }, texture: "none" } }),
  },
  {
    id: "ember",
    label: "Ember",
    apply: (s) => ({ ...s, shape: "squircle", fg: { ...s.fg, color: "#fff7ed", effect: "none" }, bg: { ...s.bg, type: "mesh", mesh: { seed: 23, colors: ["#3b0a0a", "#ff453a", "#ff9f0a", "#7c2d12"] }, texture: "none" } }),
  },
  {
    id: "dots",
    label: "Dots",
    apply: (s) => ({ ...s, shape: "squircle", fg: { ...s.fg, color: "#ffffff", effect: "none" }, bg: { ...s.bg, type: "color", color: "#1c1c1e", texture: "polka", textureOpacity: 0.14 } }),
  },
  {
    id: "blueprint",
    label: "Blueprint",
    apply: (s) => ({ ...s, shape: "square", fg: { ...s.fg, color: "#ffffff", effect: "none" }, bg: { ...s.bg, type: "color", color: "#0b3d91", texture: "grid", textureOpacity: 0.2 } }),
  },
  {
    id: "outline",
    label: "Outline",
    apply: (s) => ({ ...s, shape: "circle", fg: { ...s.fg, color: "#0a0a0a", effect: "none" }, bg: { ...s.bg, type: "color", color: "#ffffff", texture: "none", border: { width: 3, color: "#0a0a0a" } } }),
  },
  {
    id: "halftone",
    label: "Halftone",
    apply: (s) => ({ ...s, shape: "squircle", fg: { ...s.fg, color: "#ffd60a", effect: "none" }, bg: { ...s.bg, type: "color", color: "#000000", texture: "halftone", textureOpacity: 0.18 } }),
  },
  {
    id: "glyph",
    label: "Clear",
    apply: (s) => ({ ...s, fg: { ...s.fg, effect: "none" }, bg: { ...s.bg, type: "none", texture: "none", border: { width: 0, color: "#fff" } } }),
  },
];

export const SWATCHES = [
  "#0a0a0a", "#1c1c1e", "#3a3a3c", "#8e8e93", "#f2f2f7", "#ffffff",
  "#ff453a", "#ff9f0a", "#ffd60a", "#30d158", "#64d2ff", "#0a84ff", "#5e5ce6", "#bf5af2", "#ff375f", "#ac8e68",
];

export const FONTS = [
  "-apple-system, system-ui, sans-serif",
  "ui-rounded, 'SF Pro Rounded', system-ui, sans-serif",
  "ui-serif, 'New York', Georgia, serif",
  "ui-monospace, 'SF Mono', Menlo, monospace",
  "'Helvetica Neue', Helvetica, Arial, sans-serif",
  "Futura, 'Trebuchet MS', sans-serif",
  "'Avenir Next', Avenir, sans-serif",
  "Georgia, serif",
  "'Bodoni 72', Didot, serif",
  "Impact, 'Arial Black', sans-serif",
  "'Chalkboard SE', 'Comic Sans MS', cursive",
  "'Marker Felt', fantasy",
];

export function fontLabel(f: string) {
  return f.split(",")[0].replace(/['"]/g, "").replace("-apple-system", "System").replace("ui-", "");
}
