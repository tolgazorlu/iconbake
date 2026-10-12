// Iconbake MCP server (stdio), started by `iconbake mcp`.
// Free tools (search, export) run in-process. Paid AI tools are a thin client of the Iconbake dev
// server: every guard (fal key, origin check, daily cap, single run) stays in the Vite plugins.
// Starts `vite` in the background when a paid tool needs it and nothing answers on ICONBAKE_URL.

import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { licenseOf, search } from "../plugins/iconify-core.ts";
import { exportIcon, PRESET_IDS, type ExportBody } from "../plugins/export-core.ts";
import { lib } from "./lib.ts";
import pkg from "../package.json" with { type: "json" };

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BASE = (process.env.ICONBAKE_URL ?? "http://localhost:4100").replace(/\/$/, "");

type Json = Record<string, unknown>;

async function alive() {
  try {
    const r = await fetch(`${BASE}/api/ai/status`, { signal: AbortSignal.timeout(1500) });
    return r.ok;
  } catch {
    return false;
  }
}

let starting: Promise<void> | null = null;
async function ensureServer() {
  if (await alive()) return;
  starting ??= (async () => {
    const vite = path.join(ROOT, "node_modules", "vite", "bin", "vite.js");
    const port = new URL(BASE).port || "4100";
    const child = spawn(process.execPath, [vite, "--port", port, "--strictPort"], { cwd: ROOT, detached: true, stdio: "ignore" });
    child.unref();
    for (let i = 0; i < 40; i++) {
      await new Promise((r) => setTimeout(r, 500));
      if (await alive()) return;
    }
    throw new Error(`Iconbake dev server did not start on ${BASE}`);
  })();
  try {
    await starting;
  } finally {
    starting = null;
  }
}

async function call(method: "GET" | "POST", route: string, body?: unknown): Promise<Json> {
  await ensureServer();
  const r = await fetch(`${BASE}${route}`, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const j = (await r.json()) as Json;
  if (!r.ok) throw new Error(String(j.error ?? `HTTP ${r.status}`));
  return j;
}

const ok = (data: unknown) => ({ content: [{ type: "text" as const, text: typeof data === "string" ? data : JSON.stringify(data, null, 2) }] });
const fail = (e: unknown) => ({ isError: true, content: [{ type: "text" as const, text: (e as Error).message }] });
const tool =
  <A,>(fn: (a: A) => Promise<unknown>) =>
  async (a: A) => {
    try {
      return ok(await fn(a));
    } catch (e) {
      return fail(e);
    }
  };

function dataUri(file: string) {
  const ext = path.extname(file).slice(1).toLowerCase();
  const mime = ext === "svg" ? "image/svg+xml" : ext === "jpg" || ext === "jpeg" ? "image/jpeg" : ext === "webp" ? "image/webp" : "image/png";
  return `data:${mime};base64,${fs.readFileSync(path.resolve(file)).toString("base64")}`;
}

const STYLE_IDS = ["monolith", "porcelain", "glass", "toy", "clay", "painterly", "paper", "diorama", "enamel", "metal", "riso", "pixel", "flat", "line"] as const;
const MODEL_IDS = ["draft", "gpt", "nb2", "nbpro", "vector"] as const;

export async function runMcp() {
const server = new McpServer({ name: "iconbake", version: pkg.version });

server.registerTool(
  "status",
  {
    description:
      "Iconbake state: whether a fal key is configured and which file it comes from, money spent today/total vs the daily cap, the AI models with $/image and the AI styles. Free. Call this before any paid tool.",
    inputSchema: {},
  },
  tool(async () => {
    const s = await call("GET", "/api/ai/status");
    const models = (s.models as Json[]).map((m) => ({ id: m.id, label: m.label, usd_per_image: m.usd, note: m.note }));
    const styles = (s.styles as Json[]).map((x) => ({ id: x.id, label: x.label, hint: x.hint, recommended_model: x.model }));
    return { ai_ready: s.configured, key_source: s.keySource, spend_usd: s.spend, models, styles, generations_folder: s.folder };
  }),
);

server.registerTool(
  "search_icons",
  {
    description:
      "Search ~370k open-source icons (Iconify, 220+ sets) by English name. Returns ids like 'lucide:leaf' for export_icon and each set's license. Name match only, so try synonyms. Free, local.",
    inputSchema: { query: z.string().min(2), limit: z.number().int().min(1).max(60).default(20) },
  },
  tool(async ({ query, limit }: { query: string; limit: number }) => {
    const r = search(query, limit);
    return { total: r.total, ids: r.results.map((x) => `${x.prefix}:${x.name}`), licenses: Object.fromEntries([...new Set(r.results.map((x) => x.prefix))].map((p) => [p, licenseOf(p).spdx || licenseOf(p).title])) };
  }),
);

const genShape = {
  subject: z.string().min(2).max(600).describe("One concrete object, optionally one action. e.g. 'an A-frame bungalow with a glowing glass front'"),
  style: z.enum(STYLE_IDS).default("monolith"),
  mode: z.enum(["full", "glyph"]).default("full").describe("full: artwork fills the icon. glyph: one object on transparent, placed on an Iconbake background (best for Android themed / iOS tinted)."),
  model: z.enum(MODEL_IDS).default("nb2"),
  n: z.number().int().min(1).max(4).default(2),
  palette: z.enum(["auto", "neutral", "brand"]).default("auto"),
  brand: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  backdrop: z.string().max(300).optional().describe("Overrides the style's background in full mode"),
  prompt: z.string().max(2000).optional().describe("Full prompt override; skips the built prompt"),
  reference_image_path: z.string().optional().describe("Local image whose rendering style to copy (not its subject)"),
};

server.registerTool(
  "preview_prompt",
  { description: "Show the exact prompt and estimated USD for a generate call without spending anything.", inputSchema: genShape },
  tool(async (a: Json) => call("POST", "/api/ai/prompt", { ...a, refImage: a.reference_image_path ? "ref" : undefined })),
);

server.registerTool(
  "generate",
  {
    description:
      "PAID. Generate app icon images with fal.ai. Tell the user the estimated cost (preview_prompt) and which key pays (status.key_source) before the first call. max_usd must cover the estimate or the call is refused. Returns image ids and absolute file paths; look at them before choosing.",
    inputSchema: { ...genShape, max_usd: z.number().positive().describe("Budget for this call in USD; refused if the estimate is higher") },
  },
  tool(async (a: Json & { max_usd: number; reference_image_path?: string }) => {
    const body: Json = { ...a, refImage: a.reference_image_path ? dataUri(a.reference_image_path) : undefined };
    delete body.reference_image_path;
    delete body.max_usd;
    const est = (await call("POST", "/api/ai/prompt", body)).usd as number;
    if (est > a.max_usd) throw new Error(`Estimated $${est.toFixed(3)} exceeds max_usd $${a.max_usd}. Ask the user before raising it.`);
    const r = await call("POST", "/api/ai/generate", body);
    const run = r.run as Json;
    return { usd: run.usd, spend_usd: r.spend, items: (run.items as Json[]).map((i) => ({ id: i.id, file: i.file, format: i.format })), mode: run.mode, prompt: run.prompt };
  }),
);

server.registerTool(
  "refine",
  {
    description: "PAID (one image at the model price). Edit a generated image with an instruction, keeping composition and style.",
    inputSchema: {
      item: z.string().describe("Image id from generate/history"),
      instruction: z.string().min(2).max(300),
      model: z.enum(["draft", "gpt", "nb2", "nbpro"]).default("nb2"),
      mode: z.enum(["full", "glyph"]).default("full"),
      max_usd: z.number().positive(),
    },
  },
  tool(async (a: Json & { max_usd: number; model: string }) => {
    const price: Record<string, number> = { draft: 0.007, gpt: 0.04, nb2: 0.08, nbpro: 0.15 };
    if ((price[a.model] ?? 0.15) > a.max_usd) throw new Error(`Refine with ${a.model} costs ~$${price[a.model]}, above max_usd.`);
    const { max_usd: _ignored, ...body } = a;
    void _ignored;
    const r = await call("POST", "/api/ai/refine", body);
    const run = r.run as Json;
    return { usd: run.usd, items: (run.items as Json[]).map((i) => ({ id: i.id, file: i.file })) };
  }),
);

server.registerTool(
  "remove_background",
  { description: "PAID (~$0.002). Cut a generated image out to a transparent PNG (BiRefNet).", inputSchema: { item: z.string() } },
  tool(async ({ item }: { item: string }) => {
    const r = await call("POST", "/api/ai/cutout", { item });
    const run = r.run as Json;
    return { usd: run.usd, items: (run.items as Json[]).map((i) => ({ id: i.id, file: i.file })) };
  }),
);

server.registerTool(
  "history",
  { description: "Recent AI runs with prompts, cost and image files. Free.", inputSchema: { limit: z.number().int().min(1).max(100).default(10) } },
  tool(async ({ limit }: { limit: number }) => {
    const r = await call("GET", `/api/ai/history?limit=${limit}`);
    const runs = (r.runs as Json[]).map((x) => ({
      at: x.at,
      kind: x.kind,
      mode: x.mode,
      model: x.model,
      style: x.style,
      subject: x.subject,
      usd: x.usd,
      error: x.error,
      items: (x.items as Json[]).map((i) => ({ id: i.id, file: i.file })),
    }));
    return { spend_usd: r.spend, runs };
  }),
);

server.registerTool(
  "export_icon",
  {
    description:
      "Free, local. Build the store-ready icon set (iOS AppIcon.appiconset with dark/tinted, Android adaptive + monochrome, web favicons + manifest, macOS, PNG) as a zip, plus a 512 px preview PNG. Pick exactly one source: icon (library id), text, ai_item (+ ai_as), or image_path.",
    inputSchema: {
      icon: z.string().optional().describe("Library id, e.g. 'lucide:leaf'"),
      text: z.string().max(40).optional(),
      ai_item: z.string().optional().describe("Image id from generate"),
      ai_as: z.enum(["full", "glyph"]).default("full").optional(),
      image_path: z.string().optional().describe("Local PNG/SVG used as the glyph"),
      preset: z.enum(PRESET_IDS).optional(),
      background: z.string().regex(/^#[0-9a-fA-F]{3,6}$/).optional(),
      gradient: z.tuple([z.string(), z.string()]).optional(),
      glyph_color: z.string().regex(/^#[0-9a-fA-F]{3,6}$/).optional(),
      size: z.number().min(10).max(100).optional().describe("Glyph size in % of the canvas"),
      shape: z.enum(["squircle", "rounded", "circle", "square"]).optional(),
      platforms: z.array(z.enum(["ios", "android", "web", "macos", "png"])).default(["ios", "android", "web"]),
      filename: z.string().default("ic_launcher"),
      app_name: z.string().optional(),
      badge: z.string().max(8).optional(),
      out_dir: z.string().optional().describe("Default: iconbake/.generations/exports"),
    },
  },
  tool(async (a: Json) => exportIcon(lib, a as ExportBody, { root: ROOT, defaultOut: path.join(ROOT, ".generations", "exports") })),
);

await server.connect(new StdioServerTransport());
}
