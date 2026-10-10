import type { Background, Foreground, IconState, Platform, Texture } from "./types";
import { shapePath, type ShapeKind } from "./shapes";

// ---------- helpers ----------

function esc(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
}

function mulberry(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h.padEnd(6, "0").slice(0, 6);
  const n = parseInt(full, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function luminance(hex: string) {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function shade(hex: string, amt: number) {
  const [r, g, b] = hexToRgb(hex);
  const f = (v: number) => Math.max(0, Math.min(255, Math.round(v + 255 * amt)));
  return `#${[f(r), f(g), f(b)].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

// ---------- background ----------

function texture(t: Texture, size: number, opacity: number, id: string): { defs: string; fill: string } {
  if (t === "none") return { defs: "", fill: "" };
  const u = size / 16; // tile unit
  const stroke = `stroke="#fff" stroke-opacity="${opacity}"`;
  const fillA = `fill="#fff" fill-opacity="${opacity}"`;
  let pattern = "";
  let pw = u;
  let ph = u;
  switch (t) {
    case "polka":
      pattern = `<circle cx="${u / 2}" cy="${u / 2}" r="${u * 0.14}" ${fillA}/>`;
      break;
    case "grid":
      pattern = `<path d="M${u} 0V${u}M0 ${u}H${u}" ${stroke} stroke-width="${size / 400}"/>`;
      break;
    case "stripes":
      pattern = `<path d="M0 ${u}L${u} 0" ${stroke} stroke-width="${u * 0.25}"/>`;
      break;
    case "cross":
      pattern = `<path d="M${u / 2} ${u * 0.3}V${u * 0.7}M${u * 0.3} ${u / 2}H${u * 0.7}" ${stroke} stroke-width="${size / 300}" stroke-linecap="round"/>`;
      break;
    case "halftone": {
      // radial size falloff from the top-left
      const rows: string[] = [];
      const n = 10;
      for (let y = 0; y < n; y++)
        for (let x = 0; x < n; x++) {
          const d = Math.hypot(x, y) / Math.hypot(n, n);
          const r = (size / n) * 0.42 * (1 - d);
          if (r > 0.3) rows.push(`<circle cx="${(x + 0.5) * (size / n)}" cy="${(y + 0.5) * (size / n)}" r="${r.toFixed(2)}" ${fillA}/>`);
        }
      return { defs: "", fill: rows.join("") };
    }
    case "waves": {
      const rows: string[] = [];
      const amp = size / 40;
      const step = size / 12;
      for (let y = -step; y < size + step; y += step) {
        let d = `M0 ${y}`;
        for (let x = 0; x <= size; x += size / 8) d += ` Q${x + size / 16} ${y - amp} ${x + size / 8} ${y}`;
        rows.push(`<path d="${d}" fill="none" ${stroke} stroke-width="${size / 200}"/>`);
      }
      return { defs: "", fill: rows.join("") };
    }
    case "concentric": {
      const rows: string[] = [];
      for (let r = size / 20; r < size; r += size / 20)
        rows.push(`<circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" ${stroke} stroke-width="${size / 250}"/>`);
      return { defs: "", fill: rows.join("") };
    }
    case "noise": {
      return {
        defs: `<filter id="${id}-noise"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="3" stitchTiles="stitch"/><feColorMatrix values="0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 ${opacity * 2} 0"/></filter>`,
        fill: `<rect width="${size}" height="${size}" filter="url(#${id}-noise)"/>`,
      };
    }
  }
  return {
    defs: `<pattern id="${id}-tex" width="${pw}" height="${ph}" patternUnits="userSpaceOnUse">${pattern}</pattern>`,
    fill: `<rect width="${size}" height="${size}" fill="url(#${id}-tex)"/>`,
  };
}

function background(bg: Background, size: number, id: string): { defs: string; body: string } {
  let defs = "";
  let fill = "";
  switch (bg.type) {
    case "none":
      return { defs: "", body: "" };
    case "color":
      fill = bg.color;
      break;
    case "gradient": {
      const { from, to, angle, kind } = bg.gradient;
      if (kind === "linear") {
        const a = ((angle - 90) * Math.PI) / 180;
        const x1 = 50 - Math.cos(a) * 50;
        const y1 = 50 - Math.sin(a) * 50;
        const x2 = 50 + Math.cos(a) * 50;
        const y2 = 50 + Math.sin(a) * 50;
        defs += `<linearGradient id="${id}-g" x1="${x1}%" y1="${y1}%" x2="${x2}%" y2="${y2}%"><stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/></linearGradient>`;
      } else {
        defs += `<radialGradient id="${id}-g" cx="50%" cy="50%" r="72%"><stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/></radialGradient>`;
      }
      fill = `url(#${id}-g)`;
      break;
    }
    case "mesh": {
      const rnd = mulberry(bg.mesh.seed);
      const blobs = bg.mesh.colors
        .map((c, i) => {
          const cx = (rnd() * 0.9 + 0.05) * size;
          const cy = (rnd() * 0.9 + 0.05) * size;
          const r = (rnd() * 0.35 + 0.45) * size;
          defs += `<radialGradient id="${id}-m${i}" cx="${cx}" cy="${cy}" r="${r}" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="${c}"/><stop offset="1" stop-color="${c}" stop-opacity="0"/></radialGradient>`;
          return `<rect width="${size}" height="${size}" fill="url(#${id}-m${i})"/>`;
        })
        .join("");
      return {
        defs,
        body: `<rect width="${size}" height="${size}" fill="${bg.mesh.colors[0]}"/>${blobs}`,
      };
    }
    case "image":
      if (!bg.image) {
        fill = bg.color;
        break;
      }
      return {
        defs: "",
        body: `<image href="${bg.image.dataUrl}" width="${size}" height="${size}" preserveAspectRatio="xMidYMid slice"/>`,
      };
  }
  return { defs, body: `<rect width="${size}" height="${size}" fill="${fill}"/>` };
}

// ---------- foreground ----------

export interface FgRender {
  defs: string;
  body: string;
}

function recolorBody(body: string, color: string, strokeWidth: number | null) {
  let out = body;
  if (strokeWidth != null) out = out.replace(/stroke-width="[^"]*"/g, `stroke-width="${strokeWidth}"`);
  // Many sets author with currentColor; some with hard-coded fills. We wrap in a group with color
  // and also override explicit hex fills/strokes when color is enabled.
  out = out.replace(/(fill|stroke)="(#[0-9a-fA-F]{3,8}|black|white|rgb[^"]*)"/g, `$1="${color}"`);
  return out;
}

function foreground(fg: Foreground, size: number, id: string): FgRender {
  const pad = (fg.padding / 100) * size;
  const box = size - pad * 2;
  const cx = size / 2 + (fg.offsetX / 100) * size;
  const cy = size / 2 + (fg.offsetY / 100) * size;
  let defs = "";
  let inner = "";

  if (fg.source.kind === "clipart") {
    const { body, width, height } = fg.source;
    const scale = box / Math.max(width, height);
    const w = width * scale;
    const h = height * scale;
    const content = fg.colorEnabled ? recolorBody(body, fg.color, fg.strokeWidth) : body;
    inner = `<g transform="translate(${cx - w / 2} ${cy - h / 2}) scale(${scale})" color="${fg.color}">${content}</g>`;
  } else if (fg.source.kind === "text") {
    const { text, font, weight, italic } = fg.source;
    const lines = text.split("\n");
    const fs = (box / Math.max(1, Math.max(...lines.map((l) => l.length)) * 0.62)) * 1;
    const fontSize = Math.min(fs, box / lines.length / 1.05);
    const lineH = fontSize * 1.05;
    const startY = cy - ((lines.length - 1) * lineH) / 2;
    inner = lines
      .map(
        (l, i) =>
          `<text x="${cx}" y="${startY + i * lineH}" text-anchor="middle" dominant-baseline="central" font-family="${esc(font)}" font-weight="${weight}" ${italic ? 'font-style="italic"' : ""} font-size="${fontSize.toFixed(2)}" fill="${fg.color}">${esc(l)}</text>`,
      )
      .join("");
  } else if (fg.source.kind === "image") {
    const { dataUrl, natural } = fg.source;
    const scale = box / Math.max(natural.w, natural.h);
    const w = natural.w * scale;
    const h = natural.h * scale;
    inner = `<image href="${dataUrl}" x="${cx - w / 2}" y="${cy - h / 2}" width="${w}" height="${h}"/>`;
  } else {
    return { defs: "", body: "" };
  }

  const t = `rotate(${fg.rotate} ${cx} ${cy}) translate(${cx} ${cy}) scale(${fg.scaleX} 1) translate(${-cx} ${-cy})`;
  let filter = "";
  switch (fg.effect) {
    case "drop":
      defs += `<filter id="${id}-fx" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="0" dy="${size / 60}" stdDeviation="${size / 50}" flood-opacity="0.35"/></filter>`;
      filter = `filter="url(#${id}-fx)"`;
      break;
    case "cast": {
      // Long shadow: stack offset copies toward bottom-right, fading.
      const copies: string[] = [];
      const n = 40;
      for (let i = n; i > 0; i--) {
        const d = (i / n) * size * 0.9;
        copies.push(`<g transform="translate(${d} ${d})" opacity="${(0.28 * (1 - i / n)).toFixed(3)}" style="color:#000">${inner.replace(new RegExp(fg.color, "g"), "#000")}</g>`);
      }
      inner = `<g clip-path="url(#${id}-clip)">${copies.join("")}</g>${inner}`;
      break;
    }
    case "score":
      // Lower half slightly darker via a clipped overlay (IconKitchen-style score line).
      defs += `<clipPath id="${id}-score"><rect x="0" y="${cy}" width="${size}" height="${size}"/></clipPath>`;
      inner = `${inner}<g clip-path="url(#${id}-score)" opacity="0.18">${inner.replace(new RegExp(fg.color, "g"), "#000")}</g>`;
      break;
    case "emboss":
      defs += `<filter id="${id}-fx" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="${-size / 220}" stdDeviation="0" flood-color="#fff" flood-opacity="0.45"/><feDropShadow dx="0" dy="${size / 220}" stdDeviation="0" flood-color="#000" flood-opacity="0.45"/></filter>`;
      filter = `filter="url(#${id}-fx)"`;
      break;
  }

  return { defs, body: `<g transform="${t}" opacity="${fg.opacity}" ${filter}>${inner}</g>` };
}

// ---------- platform geometry ----------

export interface Composed {
  svg: string;
  size: number;
}

const PLATFORM_SHAPE: Record<Platform, ShapeKind | "state"> = {
  android: "state",
  ios: "ios",
  web: "state",
  macos: "macos",
  png: "state",
};

export interface ComposeOptions {
  size?: number;
  platform?: Platform;
  /** Android adaptive layers: render only fg or bg at the full 108dp canvas (icon in 72dp safe zone). */
  layer?: "foreground" | "background" | "monochrome";
  /** Recolor the result: white or black silhouette (tinted / themed icons) or grayscale. */
  tone?: "white" | "black" | "gray";
  /** Preview-only: clip and draw outside mask area. */
  previewMask?: boolean;
  id?: string;
}

export function compose(state: IconState, opts: ComposeOptions = {}): Composed {
  const size = opts.size ?? 512;
  const platform = opts.platform ?? state.activePlatform;
  const id = opts.id ?? "ic";
  const shapeKind = PLATFORM_SHAPE[platform] === "state" ? state.shape : (PLATFORM_SHAPE[platform] as ShapeKind);

  // Android adaptive layers render at 108 with content in the inner 72 (ratio 2/3); other platforms fill.
  const adaptive = platform === "android" && !!opts.layer;
  const contentScale = adaptive ? 72 / 108 : 1;
  const inset = (size * (1 - contentScale)) / 2;

  let defs = "";
  const parts: string[] = [];

  const bgR = background(state.bg, size, id);
  const tex = texture(state.bg.texture, size, state.bg.textureOpacity, id);
  const fgR = foreground(
    { ...state.fg, padding: state.fg.padding * contentScale + (1 - contentScale) * 50 },
    size,
    id,
  );
  defs += bgR.defs + tex.defs + fgR.defs;

  // Adaptive: bg layer = full bleed, no mask. fg layer = transparent + icon.
  if (adaptive) {
    if (opts.layer === "background") {
      // Launchers expect an opaque background layer; with no background, use a fill that
      // contrasts with the glyph instead of leaving it transparent.
      if (state.bg.type === "none") {
        const fill = luminance(state.fg.color) > 0.5 ? "#000000" : "#ffffff";
        parts.push(`<rect width="${size}" height="${size}" fill="${fill}"/>`);
      }
      parts.push(bgR.body, tex.fill);
    } else if (opts.layer === "foreground") {
      parts.push(fgR.body);
    } else {
      // monochrome: solid black silhouette (Android themed icons)
      const mono = foreground(
        { ...state.fg, color: "#000000", colorEnabled: true, effect: "none", padding: state.fg.padding * contentScale + (1 - contentScale) * 50 },
        size,
        id + "m",
      );
      // The filter turns any glyph, including uploaded or generated pictures, into a flat silhouette.
      defs += mono.defs + toneFilter(`${id}-mono`, "black");
      parts.push(`<g filter="url(#${id}-mono)">${mono.body}</g>`);
    }
    return { svg: wrap(size, defs, parts.join("")), size };
  }

  const path = shapePath(shapeKind, size, state.radius);
  defs += `<clipPath id="${id}-clip"><path d="${path}"/></clipPath>`;
  if (state.bg.type !== "none") {
    parts.push(`<g clip-path="url(#${id}-clip)">${bgR.body}${tex.fill}</g>`);
  }
  parts.push(`<g clip-path="url(#${id}-clip)">${fgR.body}</g>`);
  if (state.bg.border.width > 0) {
    const bw = (state.bg.border.width / 100) * size;
    parts.push(`<path d="${shapePath(shapeKind, size, state.radius)}" fill="none" stroke="${state.bg.border.color}" stroke-width="${bw * 2}" clip-path="url(#${id}-clip)"/>`);
  }
  if (state.badge.trim()) {
    const bh = size * 0.22;
    const fs = bh * 0.55;
    const txt = state.badge.trim().toUpperCase();
    parts.push(
      `<g clip-path="url(#${id}-clip)"><rect x="0" y="${size - bh}" width="${size}" height="${bh}" fill="#000" fill-opacity="0.72"/><text x="${size / 2}" y="${size - bh / 2}" text-anchor="middle" dominant-baseline="central" font-family="-apple-system, system-ui, sans-serif" font-weight="700" font-size="${fs}" letter-spacing="${fs * 0.08}" fill="#fff">${esc(txt)}</text></g>`,
    );
  }
  void inset;
  if (opts.tone) {
    defs += toneFilter(`${id}-tone`, opts.tone);
    return { svg: wrap(size, defs, `<g filter="url(#${id}-tone)">${parts.join("")}</g>`), size };
  }
  return { svg: wrap(size, defs, parts.join("")), size };
}

function toneFilter(id: string, tone: "white" | "black" | "gray") {
  const m =
    tone === "gray"
      ? "0.2126 0.7152 0.0722 0 0 0.2126 0.7152 0.0722 0 0 0.2126 0.7152 0.0722 0 0 0 0 0 1 0"
      : tone === "white"
        ? "0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 1 0"
        : "0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 1 0";
  return `<filter id="${id}" color-interpolation-filters="sRGB"><feColorMatrix type="matrix" values="${m}"/></filter>`;
}

function wrap(size: number, defs: string, body: string) {
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${defs ? `<defs>${defs}</defs>` : ""}${body}</svg>`;
}

/** Bare glyph, no background, no shape; for "SVG only" export. */
export function composeGlyph(state: IconState, size = 512): string {
  const fgR = foreground({ ...state.fg, effect: "none" }, size, "g");
  return wrap(size, fgR.defs, fgR.body);
}
