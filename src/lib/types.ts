export type Platform = "android" | "ios" | "web" | "macos" | "png";

export type IconSource =
  | { kind: "clipart"; prefix: string; name: string; body: string; width: number; height: number }
  | { kind: "text"; text: string; font: string; weight: number; italic: boolean }
  | { kind: "image"; dataUrl: string; natural: { w: number; h: number } };

export type Effect = "none" | "drop" | "cast" | "score" | "emboss";
export type BgType = "color" | "gradient" | "mesh" | "image" | "none";
export type Shape = "square" | "squircle" | "circle" | "rounded";
export type Texture =
  | "none"
  | "polka"
  | "grid"
  | "stripes"
  | "halftone"
  | "waves"
  | "noise"
  | "concentric"
  | "cross";

export interface Foreground {
  source: IconSource;
  color: string;
  colorEnabled: boolean; // false → keep original colors (palette sets, images)
  padding: number; // % of canvas, 0–45
  rotate: number; // deg
  scaleX: number; // 1 or -1 (flip)
  strokeWidth: number | null; // null → leave as authored
  opacity: number; // 0–1
  effect: Effect;
  offsetX: number; // % nudge
  offsetY: number;
}

export interface Background {
  type: BgType;
  color: string;
  gradient: { from: string; to: string; angle: number; kind: "linear" | "radial" };
  mesh: { seed: number; colors: string[] };
  image: { dataUrl: string } | null;
  texture: Texture;
  textureOpacity: number;
  border: { width: number; color: string };
}

export interface IconState {
  fg: Foreground;
  bg: Background;
  shape: Shape;
  radius: number; // % for "rounded", 0–50
  badge: string;
  filename: string;
  platforms: Platform[];
  activePlatform: Platform;
  theme: "dark" | "light";
}

export const DEFAULT_STATE: IconState = {
  fg: {
    source: {
      kind: "clipart",
      prefix: "lucide",
      name: "rocket",
      body: "",
      width: 24,
      height: 24,
    },
    color: "#ffffff",
    colorEnabled: true,
    padding: 22,
    rotate: 0,
    scaleX: 1,
    strokeWidth: null,
    opacity: 1,
    effect: "none",
    offsetX: 0,
    offsetY: 0,
  },
  bg: {
    type: "color",
    color: "#111111",
    gradient: { from: "#1c1c1e", to: "#48484a", angle: 135, kind: "linear" },
    mesh: { seed: 7, colors: ["#1c1c1e", "#636366", "#2c2c2e", "#8e8e93"] },
    image: null,
    texture: "none",
    textureOpacity: 0.12,
    border: { width: 0, color: "#ffffff" },
  },
  shape: "squircle",
  radius: 22,
  badge: "",
  filename: "ic_launcher",
  platforms: ["android", "ios", "web"],
  activePlatform: "ios",
  theme: "dark",
};
