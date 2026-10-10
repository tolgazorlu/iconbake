import { zipSync, strToU8 } from "fflate";
import { compose, composeGlyph } from "./compose";
import type { Background, IconState, Platform } from "./types";

export async function svgToPng(svg: string, size: number): Promise<Uint8Array> {
  const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.decoding = "async";
    await new Promise<void>((ok, err) => {
      img.onload = () => ok();
      img.onerror = () => err(new Error("svg decode failed"));
      img.src = url;
    });
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(img, 0, 0, size, size);
    const out = await new Promise<Blob>((ok, err) =>
      canvas.toBlob((b) => (b ? ok(b) : err(new Error("toBlob failed"))), "image/png"),
    );
    return new Uint8Array(await out.arrayBuffer());
  } finally {
    URL.revokeObjectURL(url);
  }
}

// Fonts in <text> inside an <img>-decoded SVG are only available when the font is installed or
// embedded; we rely on installed system fonts (local tool) which works for Image decode.

type Files = Record<string, Uint8Array>;

const ANDROID_DENSITIES: [string, number][] = [
  ["mdpi", 1],
  ["hdpi", 1.5],
  ["xhdpi", 2],
  ["xxhdpi", 3],
  ["xxxhdpi", 4],
];

async function androidFiles(state: IconState, name: string): Promise<Files> {
  const files: Files = {};
  const bgSvg = compose(state, { platform: "android", layer: "background", size: 432 }).svg;
  const fgSvg = compose(state, { platform: "android", layer: "foreground", size: 432 }).svg;
  const monoSvg = compose(state, { platform: "android", layer: "monochrome", size: 432 }).svg;
  const legacy = compose({ ...state, shape: "circle" }, { platform: "android", size: 192 }).svg;
  const legacySq = compose({ ...state, shape: "rounded", radius: 12 }, { platform: "android", size: 192 }).svg;

  for (const [d, m] of ANDROID_DENSITIES) {
    const full = Math.round(108 * m);
    const leg = Math.round(48 * m);
    files[`android/res/mipmap-${d}/${name}_foreground.png`] = await svgToPng(fgSvg, full);
    files[`android/res/mipmap-${d}/${name}_background.png`] = await svgToPng(bgSvg, full);
    files[`android/res/mipmap-${d}/${name}_monochrome.png`] = await svgToPng(monoSvg, full);
    files[`android/res/mipmap-${d}/${name}.png`] = await svgToPng(legacySq, leg);
    files[`android/res/mipmap-${d}/${name}_round.png`] = await svgToPng(legacy, leg);
  }
  const xml = `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@mipmap/${name}_background"/>
    <foreground android:drawable="@mipmap/${name}_foreground"/>
    <monochrome android:drawable="@mipmap/${name}_monochrome"/>
</adaptive-icon>
`;
  files[`android/res/mipmap-anydpi-v26/${name}.xml`] = strToU8(xml);
  files[`android/res/mipmap-anydpi-v26/${name}_round.xml`] = strToU8(xml);
  files[`android/play_store_512.png`] = await svgToPng(compose({ ...state, shape: "square" }, { platform: "android", size: 512 }).svg, 512);
  // Vector drawables for layers (SVG kept for reference; AS can import)
  files[`android/svg/${name}_foreground.svg`] = strToU8(fgSvg);
  files[`android/svg/${name}_background.svg`] = strToU8(bgSvg);
  files[`android/svg/${name}_monochrome.svg`] = strToU8(monoSvg);
  return files;
}

async function iosFiles(state: IconState): Promise<Files> {
  // iOS 18+ / Xcode 15+: single 1024 icon in AppIcon.appiconset, plus dark and tinted variants.
  const files: Files = {};
  const square = { ...state, shape: "square" as const };
  const svg = compose(square, { platform: "png", size: 1024 }).svg;
  files["ios/AppIcon.appiconset/AppIcon.png"] = await svgToPng(svg, 1024);
  // Dark: same icon on a deepened background. Flat, gradient and mesh fills are all darkened;
  // an image background is left as is because there is no color to shift.
  const darkState: IconState = { ...square, bg: darkenBackground(state.bg) };
  files["ios/AppIcon.appiconset/AppIcon-Dark.png"] = await svgToPng(compose(darkState, { platform: "png", size: 1024 }).svg, 1024);
  // Tinted: white glyph on transparent (the system applies the tint). A full-artwork icon has no
  // glyph to lift out, so it ships as a grayscale copy of the artwork instead.
  const tintedSvg =
    state.fg.source.kind === "none"
      ? compose(square, { platform: "png", size: 1024, tone: "gray" }).svg
      : compose(
          { ...square, bg: { ...state.bg, type: "none", border: { ...state.bg.border, width: 0 } }, badge: "", fg: { ...state.fg, color: "#ffffff", colorEnabled: true, effect: "none" } },
          { platform: "png", size: 1024, tone: "white" },
        ).svg;
  files["ios/AppIcon.appiconset/AppIcon-Tinted.png"] = await svgToPng(tintedSvg, 1024);
  files["ios/AppIcon.appiconset/Contents.json"] = strToU8(
    JSON.stringify(
      {
        images: [
          { filename: "AppIcon.png", idiom: "universal", platform: "ios", size: "1024x1024" },
          { appearances: [{ appearance: "luminosity", value: "dark" }], filename: "AppIcon-Dark.png", idiom: "universal", platform: "ios", size: "1024x1024" },
          { appearances: [{ appearance: "luminosity", value: "tinted" }], filename: "AppIcon-Tinted.png", idiom: "universal", platform: "ios", size: "1024x1024" },
        ],
        info: { author: "icony", version: 1 },
      },
      null,
      2,
    ),
  );
  // Expo convenience
  files["ios/expo/icon.png"] = files["ios/AppIcon.appiconset/AppIcon.png"];
  files["ios/expo/icon-dark.png"] = files["ios/AppIcon.appiconset/AppIcon-Dark.png"];
  files["ios/expo/icon-tinted.png"] = files["ios/AppIcon.appiconset/AppIcon-Tinted.png"];
  return files;
}

async function macosFiles(state: IconState): Promise<Files> {
  const files: Files = {};
  const sizes = [16, 32, 64, 128, 256, 512, 1024];
  const svg = compose(state, { platform: "macos", size: 1024 }).svg;
  const images: unknown[] = [];
  for (const s of sizes) {
    const pt = s <= 512 ? s : 512;
    const scale = s === 1024 ? 2 : s === 16 || s === 32 || s === 128 || s === 256 || s === 512 ? 1 : 2;
    const base = scale === 2 ? s / 2 : s;
    const fn = `icon_${base}x${base}${scale === 2 ? "@2x" : ""}.png`;
    files[`macos/AppIcon.appiconset/${fn}`] = await svgToPng(svg, s);
    images.push({ filename: fn, idiom: "mac", scale: `${scale}x`, size: `${base}x${base}` });
    void pt;
  }
  // Apple requires both 1x and 2x for 16/32/128/256/512; fill the missing ones.
  for (const base of [16, 32, 128, 256, 512]) {
    for (const scale of [1, 2]) {
      const fn = `icon_${base}x${base}${scale === 2 ? "@2x" : ""}.png`;
      if (!files[`macos/AppIcon.appiconset/${fn}`]) {
        files[`macos/AppIcon.appiconset/${fn}`] = await svgToPng(svg, base * scale);
        images.push({ filename: fn, idiom: "mac", scale: `${scale}x`, size: `${base}x${base}` });
      }
    }
  }
  files["macos/AppIcon.appiconset/Contents.json"] = strToU8(JSON.stringify({ images, info: { author: "icony", version: 1 } }, null, 2));
  return files;
}

async function webFiles(state: IconState): Promise<Files> {
  const files: Files = {};
  const appName = state.appName?.trim() || state.filename;
  const themeColor = dominantColor(state.bg);
  const svg = compose(state, { platform: "web", size: 512 }).svg;
  const maskable = compose({ ...state, shape: "square", fg: { ...state.fg, padding: Math.max(state.fg.padding, 20) } }, { platform: "png", size: 512 }).svg;
  for (const s of [16, 32, 48, 180, 192, 512]) {
    files[`web/icon-${s}.png`] = await svgToPng(svg, s);
  }
  files["web/apple-touch-icon.png"] = await svgToPng(compose({ ...state, shape: "square" }, { platform: "png", size: 180 }).svg, 180);
  files["web/maskable-512.png"] = await svgToPng(maskable, 512);
  files["web/favicon.svg"] = strToU8(svg);
  files["web/favicon.ico"] = await ico([await svgToPng(svg, 16), await svgToPng(svg, 32), await svgToPng(svg, 48)], [16, 32, 48]);
  files["web/manifest.webmanifest"] = strToU8(
    JSON.stringify(
      {
        name: appName,
        short_name: appName,
        icons: [
          { src: "icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
        theme_color: themeColor,
        background_color: themeColor,
        display: "standalone",
      },
      null,
      2,
    ),
  );
  files["web/README.txt"] = strToU8(
    `<link rel="icon" href="/favicon.ico" sizes="48x48">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="manifest" href="/manifest.webmanifest">
`,
  );
  return files;
}

async function pngFiles(state: IconState): Promise<Files> {
  const files: Files = {};
  const svg = compose(state, { platform: "png", size: 1024 }).svg;
  for (const s of [64, 128, 256, 512, 1024]) files[`png/${state.filename}-${s}.png`] = await svgToPng(svg, s);
  files[`svg/${state.filename}.svg`] = strToU8(svg);
  files[`svg/${state.filename}-glyph.svg`] = strToU8(composeGlyph(state));
  return files;
}

/** Build a minimal .ico from PNG-encoded images (PNG-in-ICO is valid since Vista). */
async function ico(pngs: Uint8Array[], sizes: number[]): Promise<Uint8Array> {
  const headerLen = 6 + 16 * pngs.length;
  let total = headerLen;
  for (const p of pngs) total += p.length;
  const out = new Uint8Array(total);
  const dv = new DataView(out.buffer);
  dv.setUint16(0, 0, true);
  dv.setUint16(2, 1, true);
  dv.setUint16(4, pngs.length, true);
  let off = headerLen;
  pngs.forEach((p, i) => {
    const e = 6 + i * 16;
    out[e] = sizes[i] >= 256 ? 0 : sizes[i];
    out[e + 1] = sizes[i] >= 256 ? 0 : sizes[i];
    out[e + 2] = 0;
    out[e + 3] = 0;
    dv.setUint16(e + 4, 1, true);
    dv.setUint16(e + 6, 32, true);
    dv.setUint32(e + 8, p.length, true);
    dv.setUint32(e + 12, off, true);
    out.set(p, off);
    off += p.length;
  });
  return out;
}

/** The color that best stands for the background, for manifest theme/background colors. */
function dominantColor(bg: Background) {
  if (bg.type === "color") return bg.color;
  if (bg.type === "gradient") return bg.gradient.from;
  if (bg.type === "mesh") return bg.mesh.colors[0];
  return "#000000";
}

function darkenBackground(bg: Background): Background {
  return {
    ...bg,
    color: darken(bg.color),
    gradient: { ...bg.gradient, from: darken(bg.gradient.from), to: darken(bg.gradient.to) },
    mesh: { ...bg.mesh, colors: bg.mesh.colors.map(darken) },
  };
}

function darken(hex: string) {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16);
  const f = (v: number) => Math.max(0, Math.round(v * 0.55));
  return `#${[f((n >> 16) & 255), f((n >> 8) & 255), f(n & 255)].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

export async function buildZip(state: IconState, onProgress?: (label: string) => void): Promise<Blob> {
  let files: Files = {};
  const name = state.filename.trim() || "ic_launcher";
  const add = async (label: string, fn: () => Promise<Files>) => {
    onProgress?.(label);
    files = { ...files, ...(await fn()) };
  };
  const p = new Set<Platform>(state.platforms);
  if (p.has("android")) await add("Android", () => androidFiles(state, name));
  if (p.has("ios")) await add("iOS", () => iosFiles(state));
  if (p.has("macos")) await add("macOS", () => macosFiles(state));
  if (p.has("web")) await add("Web", () => webFiles(state));
  if (p.has("png")) await add("PNG/SVG", () => pngFiles(state));
  // Keep uploaded images embedded so the project reopens exactly as exported.
  files["icony.json"] = strToU8(JSON.stringify(state, null, 2));
  onProgress?.("Zipping");
  const zipped = zipSync(files, { level: 6 });
  return new Blob([zipped as BlobPart], { type: "application/zip" });
}

export async function downloadSingle(state: IconState, kind: "png" | "svg", size = 1024) {
  const svg = compose(state, { platform: "png", size }).svg;
  const name = state.filename.trim() || "icon";
  if (kind === "svg") {
    downloadBlob(new Blob([svg], { type: "image/svg+xml" }), `${name}.svg`);
  } else {
    const png = await svgToPng(svg, size);
    downloadBlob(new Blob([png as BlobPart], { type: "image/png" }), `${name}-${size}.png`);
  }
}

export async function copyPng(state: IconState, size = 512) {
  const svg = compose(state, { platform: "png", size }).svg;
  const png = await svgToPng(svg, size);
  await navigator.clipboard.write([new ClipboardItem({ "image/png": new Blob([png as BlobPart], { type: "image/png" }) })]);
}

export function downloadBlob(blob: Blob, filename: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
