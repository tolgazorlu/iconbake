import type { Plugin, ViteDevServer } from "vite";
import type { IncomingMessage, ServerResponse } from "node:http";
import fs from "node:fs";
import path from "node:path";
import { Resvg } from "@resvg/resvg-js";
import { zipSync } from "fflate";

// Headless export: builds the same zip as the Download button, rasterized with resvg instead of a
// browser canvas, so agents (curl, the MCP server) get store-ready icons without opening the UI.

type Body = {
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
  out_dir?: string; // default <root>/.generations/exports
  state?: Record<string, unknown>; // full IconState override (advanced)
};

function send(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(body));
}

async function readJson<T>(req: IncomingMessage): Promise<T> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}") as T;
}

function rasterize(svg: string, size: number): Promise<Uint8Array> {
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

// The app modules are loaded through Vite (ssrLoadModule) so they always match the running UI.
// Their types are DOM-flavoured and not part of the node tsconfig, so keep a loose local shape.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type State = any;
type Preset = { id: string; apply: (s: State) => State };
type ExportMod = { setRasterizer: (fn: typeof rasterize) => void; collectFiles: (s: State) => Promise<Record<string, Uint8Array>> };
type ComposeMod = { compose: (s: State, o: { platform: string; size: number; id: string }) => { svg: string } };

async function buildState(server: ViteDevServer, root: string, b: Body) {
  const { DEFAULT_STATE } = (await server.ssrLoadModule("/src/lib/types.ts")) as { DEFAULT_STATE: State };
  const { PRESETS } = (await server.ssrLoadModule("/src/lib/presets.ts")) as { PRESETS: Preset[] };
  let s: State = structuredClone(DEFAULT_STATE);
  if (b.state) s = { ...s, ...b.state };

  if (b.icon) {
    const [prefix, name] = b.icon.split(":");
    const port = server.config.server.port ?? 4100;
    const r = await fetch(`http://localhost:${port}/api/icon/${prefix}/${name}`);
    if (!r.ok) throw new Error(`icon not found: ${b.icon}`);
    const ic = (await r.json()) as { body: string; width: number; height: number };
    s.fg.source = { kind: "clipart", prefix, name, body: ic.body, width: ic.width, height: ic.height };
    s.fg.colorEnabled = true;
  } else if (b.text) {
    s.fg.source = { kind: "text", text: b.text, font: b.font ?? "-apple-system, system-ui", weight: 700, italic: false };
    s.fg.colorEnabled = true;
  } else if (b.ai_item || b.image_path) {
    const file = b.ai_item ? path.join(root, ".generations", b.ai_item) : path.resolve(b.image_path!);
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
    const p = PRESETS.find((x: Preset) => x.id === b.preset);
    if (!p) throw new Error(`unknown preset ${b.preset}; use one of ${PRESETS.map((x: Preset) => x.id).join(", ")}`);
    const keepArtwork = s.fg.source.kind === "none";
    if (!keepArtwork) s = p.apply(s);
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

export function exportApi(): Plugin {
  return {
    name: "icony:export-api",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url ?? "/", "http://localhost");
        if (url.pathname !== "/api/export") return next();
        if (req.method !== "POST") return send(res, 405, { error: "POST JSON" });
        const origin = req.headers.origin;
        if (origin && URL.parse(origin)?.host !== req.headers.host) return send(res, 403, { error: "cross-origin request refused" });
        try {
          const body = await readJson<Body>(req);
          const root = server.config.root;
          const state = await buildState(server, root, body);
          const exp = (await server.ssrLoadModule("/src/lib/export.ts")) as ExportMod;
          const { compose } = (await server.ssrLoadModule("/src/lib/compose.ts")) as ComposeMod;
          exp.setRasterizer(rasterize);
          const files = await exp.collectFiles(state);
          const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
          const outDir = path.resolve(body.out_dir ?? path.join(root, ".generations", "exports"));
          const base = `${state.filename || "icon"}-${stamp}`;
          fs.mkdirSync(outDir, { recursive: true });
          const zip = path.join(outDir, `${base}.zip`);
          fs.writeFileSync(zip, zipSync(files, { level: 6 }));
          // A 512 px preview (iOS mask) so the caller can look at the result before shipping it.
          const preview = path.join(outDir, `${base}-preview.png`);
          fs.writeFileSync(preview, await rasterize(compose(state, { platform: "ios", size: 512, id: "pv" }).svg, 512));
          return send(res, 200, { zip, preview, files: Object.keys(files).length, platforms: state.platforms, source: state.fg.source.kind });
        } catch (e) {
          return send(res, 400, { error: (e as Error).message });
        }
      });
    },
  };
}
