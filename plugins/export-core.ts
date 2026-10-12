// Headless export shared by the dev server plugin, the CLI and the MCP server: builds the same zip
// as the Download button, rasterized with resvg instead of a browser canvas.
//
// The app modules (src/lib) are passed in as `lib`: the dev server loads them through Vite so they
// match the running UI, the CLI bundles them. Their types are DOM-flavoured, so keep a loose shape.

import fs from "node:fs";
import path from "node:path";
import { Resvg } from "@resvg/resvg-js";
import { zipSync } from "fflate";
import { getIcon, licenseOf } from "./iconify-core.ts";

export type ExportBody = {
  icon?: string; // "prefix:name" from the Iconify library
  text?: string;
  font?: string;
  ai_item?: string; // id from /api/ai/generate
  ai_as?: "full" | "glyph";
  image_path?: string; // local PNG/SVG used as the glyph
  preset?: string; // PRESETS id: ink, paper, graphite, ...
  background?: string; // hex, flat background
  gradient?: [string, string];
  glyph_color?: string;
  size?: number; // glyph size in % of the canvas, 10-100
  shape?: "squircle" | "rounded" | "circle" | "square";
  platforms?: string[];
  filename?: string;
  app_name?: string;
  badge?: string;
  out_dir?: string;
  state?: Record<string, unknown>; // full IconState override (advanced)
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type State = any;
type Preset = { id: string; apply: (s: State) => State };
export type Lib = {
  DEFAULT_STATE: State;
  PRESETS: Preset[];
  setRasterizer: (fn: typeof rasterize) => void;
  collectFiles: (s: State) => Promise<Record<string, Uint8Array>>;
  compose: (s: State, o: { platform: string; size: number; id: string }) => { svg: string };
  sanitizeProject: (raw: unknown) => State | null;
};

/** Resolves `p` and throws unless it stays inside `root` (used for paths that arrive over HTTP). */
export function confine(root: string, p: string, what: string): string {
  const abs = path.resolve(root, p);
  if (abs !== root && !abs.startsWith(root + path.sep)) throw new Error(`${what} must stay inside ${root}`);
  return abs;
}

export type ExportResult = {
  zip: string;
  preview: string;
  files: number;
  platforms: string[];
  source: string;
  license?: { title: string; spdx: string; url: string };
};

export function rasterize(svg: string, size: number): Promise<Uint8Array> {
  const png = new Resvg(svg, { fitTo: { mode: "width", value: size }, font: { loadSystemFonts: svg.includes("<text") }, background: "rgba(0,0,0,0)" }).render().asPng();
  return Promise.resolve(new Uint8Array(png));
}

function mime(file: string) {
  const ext = path.extname(file).slice(1).toLowerCase();
  return ext === "svg" ? "image/svg+xml" : ext === "jpg" || ext === "jpeg" ? "image/jpeg" : ext === "webp" ? "image/webp" : "image/png";
}

function imageSize(buf: Buffer, file: string) {
  if (buf.toString("ascii", 1, 4) === "PNG") return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
  if (file.endsWith(".svg")) {
    const vb = buf.toString("utf8").match(/viewBox="[\d.-]+ [\d.-]+ ([\d.]+) ([\d.]+)"/);
    if (vb) return { w: Number(vb[1]), h: Number(vb[2]) };
  }
  return { w: 1024, h: 1024 };
}

const asDataUri = (file: string) => `data:${mime(file)};base64,${fs.readFileSync(file).toString("base64")}`;

export const PRESET_IDS = ["ink", "paper", "graphite", "sunset", "ocean", "mint", "candy", "aurora", "ember", "dots", "blueprint", "outline", "halftone", "glyph"] as const;
export const PLATFORMS = ["ios", "android", "web", "macos", "png"] as const;

function buildState(lib: Lib, root: string, b: ExportBody, confineTo?: string) {
  let s: State = structuredClone(lib.DEFAULT_STATE);
  if (b.state) {
    // A full state can carry anything into SVG attributes and zip entry names; clean it first.
    s = lib.sanitizeProject({ ...s, ...b.state });
    if (!s) throw new Error("state contains unsafe values");
    const src = s.fg.source;
    if (src.kind === "clipart") {
      const ic = getIcon(src.prefix, src.name);
      if (!ic) throw new Error(`icon not found: ${src.prefix}:${src.name}`);
      src.body = ic.body;
    }
  }

  if (b.icon) {
    const [prefix, name] = b.icon.split(":");
    const ic = prefix && name ? getIcon(prefix, name) : null;
    if (!ic) throw new Error(`icon not found: ${b.icon}`);
    s.fg.source = { kind: "clipart", prefix, name, body: ic.body, width: ic.width, height: ic.height };
    s.fg.colorEnabled = true;
  } else if (b.text) {
    s.fg.source = { kind: "text", text: b.text, font: b.font ?? "-apple-system, system-ui", weight: 700, italic: false };
    s.fg.colorEnabled = true;
  } else if (b.ai_item || b.image_path) {
    const file = b.ai_item ? path.join(root, ".generations", b.ai_item) : confineTo ? confine(confineTo, b.image_path!, "image_path") : path.resolve(b.image_path!);
    if (b.ai_item && !path.normalize(file).startsWith(path.join(root, ".generations") + path.sep)) throw new Error("bad ai_item");
    if (!fs.existsSync(file)) throw new Error(`file not found: ${b.ai_item ?? b.image_path}`);
    const dataUrl = asDataUri(file);
    if (b.ai_as === "full") {
      s.fg.source = { kind: "none" };
      s.bg = { ...s.bg, type: "image", image: { dataUrl }, texture: "none" };
    } else {
      const { w, h } = imageSize(fs.readFileSync(file), file);
      s.fg.source = { kind: "image", dataUrl, natural: { w, h } };
      s.fg.colorEnabled = false;
      s.fg.padding = 14;
    }
  }

  if (b.preset) {
    const p = lib.PRESETS.find((x) => x.id === b.preset);
    if (!p) throw new Error(`unknown preset ${b.preset}; use one of ${lib.PRESETS.map((x) => x.id).join(", ")}`);
    if (s.fg.source.kind !== "none") s = p.apply(s);
  }
  if (b.background) s.bg = { ...s.bg, type: "color", color: b.background };
  if (b.gradient) s.bg = { ...s.bg, type: "gradient", gradient: { ...s.bg.gradient, from: b.gradient[0], to: b.gradient[1] } };
  if (b.glyph_color) s.fg = { ...s.fg, color: b.glyph_color, colorEnabled: true };
  if (b.size) s.fg.padding = Math.max(0, Math.min(45, (100 - b.size) / 2));
  if (b.shape) s.shape = b.shape;
  if (b.platforms) s.platforms = b.platforms;
  if (b.filename) s.filename = b.filename.replace(/[^a-zA-Z0-9_-]/g, "");
  if (b.app_name) s.appName = b.app_name;
  if (b.badge !== undefined) s.badge = b.badge;
  return s;
}

/**
 * Writes <filename>-<stamp>.zip and a 512 px preview PNG into out_dir (default defaultOut).
 * `confineTo` keeps image_path and out_dir inside that directory; the HTTP route sets it because
 * a request can come from any page served by the dev server, the CLI and MCP leave it unset.
 */
export async function exportIcon(lib: Lib, b: ExportBody, opts: { root: string; defaultOut: string; confineTo?: string }): Promise<ExportResult> {
  const sources = (["icon", "text", "ai_item", "image_path"] as const).filter((k) => b[k]);
  if (sources.length !== 1) throw new Error("give exactly one source: icon, text, ai_item or image_path");
  const state = buildState(lib, opts.root, b, opts.confineTo);
  lib.setRasterizer(rasterize);
  const files = await lib.collectFiles(state);
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const outDir = opts.confineTo ? confine(opts.confineTo, b.out_dir ?? opts.defaultOut, "out_dir") : path.resolve(b.out_dir ?? opts.defaultOut);
  const base = `${state.filename || "icon"}-${stamp}`;
  fs.mkdirSync(outDir, { recursive: true });
  const zip = path.join(outDir, `${base}.zip`);
  fs.writeFileSync(zip, zipSync(files, { level: 6 }));
  // A 512 px preview (iOS mask) so the caller can look at the result before shipping it.
  const preview = path.join(outDir, `${base}-preview.png`);
  fs.writeFileSync(preview, await rasterize(lib.compose(state, { platform: "ios", size: 512, id: "pv" }).svg, 512));
  const out: ExportResult = { zip, preview, files: Object.keys(files).length, platforms: state.platforms, source: state.fg.source.kind };
  if (b.icon) out.license = licenseOf(b.icon.split(":")[0]);
  return out;
}
