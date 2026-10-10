import type { Plugin } from "vite";
import type { IncomingMessage, ServerResponse } from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import {
  AI_MODELS,
  AI_STYLES,
  CUTOUT,
  buildPrompt,
  estimateUsd,
  findModel,
  findStyle,
  type AiItem,
  type AiRequest,
  type AiRun,
} from "../src/lib/ai.ts";

// fal.ai image generation for the dev server. The key never reaches the browser: it is read
// here, and every paid route only accepts same-origin JSON posts (or curl without Origin), so
// another open tab cannot spend money through localhost.

// Set from the Vite root in configureServer.
let ROOT = process.cwd();
let OUT = path.join(ROOT, ".generations");
let LOG = path.join(OUT, "history.jsonl");
const DAILY_LIMIT = Number(process.env.ICONY_DAILY_LIMIT_USD ?? 3);
const TIMEOUT_MS = 180_000;

type Key = { value: string; source: string } | null;

function readEnvFile(file: string): string | null {
  try {
    for (const line of fs.readFileSync(file, "utf8").split("\n")) {
      const m = line.match(/^\s*(?:export\s+)?FAL_KEY\s*=\s*(.*)\s*$/);
      if (m) {
        const v = m[1].replace(/^["']|["']$/g, "").trim();
        if (v) return v;
      }
    }
  } catch {
    /* missing file */
  }
  return null;
}

/** Lookup order: shell env, project .env.local, project .env, then ~/.hermes/.env (shared with Hermes). */
function loadKey(): Key {
  if (process.env.FAL_KEY) return { value: process.env.FAL_KEY, source: "FAL_KEY environment variable" };
  const files = [path.join(ROOT, ".env.local"), path.join(ROOT, ".env"), path.join(os.homedir(), ".hermes", ".env")];
  for (const f of files) {
    const v = readEnvFile(f);
    if (v) return { value: v, source: f.replace(os.homedir(), "~") };
  }
  return null;
}

function send(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(body));
}

function sameOrigin(req: IncomingMessage) {
  const origin = req.headers.origin;
  if (!origin) return true; // curl and other CLI tools
  return URL.parse(origin)?.host === req.headers.host;
}

async function readJson<T>(req: IncomingMessage, limit = 20 * 1024 * 1024): Promise<T> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const c of req) {
    size += (c as Buffer).length;
    if (size > limit) throw new Error("request body too large");
    chunks.push(c as Buffer);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as T;
}

function history(): AiRun[] {
  if (!fs.existsSync(LOG)) return [];
  return fs
    .readFileSync(LOG, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((l) => {
      try {
        return JSON.parse(l) as AiRun;
      } catch {
        return null;
      }
    })
    .filter((r): r is AiRun => !!r);
}

function spent(runs: AiRun[]) {
  const today = new Date().toISOString().slice(0, 10);
  let day = 0;
  let total = 0;
  for (const r of runs) {
    total += r.usd;
    if (r.at.slice(0, 10) === today) day += r.usd;
  }
  return { today: round(day), total: round(total), limit: DAILY_LIMIT };
}

const round = (n: number) => Math.round(n * 1000) / 1000;

// ---------- fal queue client ----------

type FalImage = { url: string; width?: number; height?: number; content_type?: string; file_name?: string };

async function falRun(key: string, endpoint: string, input: Record<string, unknown>): Promise<{ images?: FalImage[]; image?: FalImage }> {
  const auth = { Authorization: `Key ${key}`, "Content-Type": "application/json" };
  const sub = await fetch(`https://queue.fal.run/${endpoint}`, { method: "POST", headers: auth, body: JSON.stringify(input) });
  if (!sub.ok) throw new Error(`fal ${endpoint}: ${sub.status} ${(await sub.text()).slice(0, 300)}`);
  const q = (await sub.json()) as { status_url: string; response_url: string; cancel_url: string };
  const started = Date.now();
  for (;;) {
    await new Promise((r) => setTimeout(r, 1000));
    if (Date.now() - started > TIMEOUT_MS) {
      // A slow job is still billed if it finishes, so cancel it instead of waiting forever. No retry.
      await fetch(q.cancel_url, { method: "PUT", headers: auth }).catch(() => {});
      throw new Error(`fal ${endpoint}: timed out after ${TIMEOUT_MS / 1000}s, cancelled`);
    }
    const st = await fetch(q.status_url, { headers: auth });
    if (!st.ok) continue;
    const s = (await st.json()) as { status: string };
    if (s.status === "COMPLETED") break;
  }
  const out = await fetch(q.response_url, { headers: auth });
  const body = await out.text();
  if (!out.ok) throw new Error(`fal ${endpoint}: ${out.status} ${body.slice(0, 300)}`);
  return JSON.parse(body);
}

function pngSize(buf: Buffer) {
  if (buf.length > 24 && buf.toString("ascii", 1, 4) === "PNG") return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  return { width: 1024, height: 1024 };
}

async function save(img: FalImage, runId: string, i: number): Promise<AiItem> {
  const r = await fetch(img.url);
  if (!r.ok) throw new Error(`download failed: ${r.status}`);
  const buf = Buffer.from(await r.arrayBuffer());
  const type = img.content_type ?? r.headers.get("content-type") ?? "";
  const format: AiItem["format"] = type.includes("svg") || img.url.endsWith(".svg") ? "svg" : type.includes("jpeg") ? "jpeg" : type.includes("webp") ? "webp" : "png";
  const day = new Date().toISOString().slice(0, 10);
  fs.mkdirSync(path.join(OUT, day), { recursive: true });
  const id = `${day}/${runId}-${i}.${format}`;
  fs.writeFileSync(path.join(OUT, id), buf);
  const size = format === "png" ? pngSize(buf) : { width: img.width ?? 1024, height: img.height ?? 1024 };
  return { id, url: `/api/ai/file/${id}`, file: path.join(OUT, id), format, ...size };
}

function images(out: { images?: FalImage[]; image?: FalImage }) {
  return out.images ?? (out.image ? [out.image] : []);
}

// ---------- request handling ----------

let busy = false;

function modelInput(r: AiRequest, prompt: string, editing: boolean, imageUrls: string[]) {
  const m = findModel(r.model);
  const n = Math.max(1, Math.min(4, Math.round(r.n || 1)));
  const input: Record<string, unknown> = { prompt, num_images: n };
  if (editing) input.image_urls = imageUrls;
  switch (m.id) {
    case "draft":
      input.image_size = "square_hd";
      input.output_format = "png";
      break;
    case "nb2":
    case "nbpro":
      input.aspect_ratio = "1:1";
      input.resolution = "1K";
      input.output_format = "png";
      input.limit_generations = true;
      break;
    case "gpt":
      input.image_size = "1024x1024";
      input.quality = "medium";
      input.output_format = "png";
      if (r.mode === "glyph") input.background = "transparent";
      break;
    case "vector": {
      const style = findStyle(r.style);
      input.image_size = "square_hd";
      input.style = style.recraft ?? "vector_illustration";
      delete input.num_images; // Recraft returns one image per call
      break;
    }
  }
  return { m, n, input };
}

async function cutout(key: string, runId: string, i: number, sourceUrl: string): Promise<AiItem> {
  const out = await falRun(key, CUTOUT.endpoint, { image_url: sourceUrl, output_format: "png", refine_foreground: true });
  const img = images(out)[0];
  if (!img) throw new Error("background removal returned no image");
  return save(img, `${runId}-cut`, i);
}

/** Paid calls already happened when a later step fails: log the cost anyway, then rethrow. */
function recordFailure(base: Omit<AiRun, "at" | "items">, items: AiItem[], err: unknown): never {
  if (base.usd > 0) record({ ...base, at: new Date().toISOString(), items, error: (err as Error).message });
  throw err;
}

function dataUri(file: string) {
  const ext = path.extname(file).slice(1);
  const mime = ext === "svg" ? "image/svg+xml" : ext === "jpeg" || ext === "jpg" ? "image/jpeg" : ext === "webp" ? "image/webp" : "image/png";
  return `data:${mime};base64,${fs.readFileSync(file).toString("base64")}`;
}

function safeItemPath(id: string) {
  const p = path.normalize(path.join(OUT, id));
  if (!p.startsWith(OUT + path.sep) || !fs.existsSync(p)) return null;
  return p;
}

function guard(res: ServerResponse, key: Key, usd: number) {
  if (!key) {
    send(res, 412, { error: "FAL_KEY is not set. Add FAL_KEY=... to icony/.env.local (or ~/.hermes/.env) and restart pnpm dev." });
    return false;
  }
  const s = spent(history());
  if (s.today + usd > DAILY_LIMIT) {
    send(res, 429, { error: `Daily limit reached: $${s.today.toFixed(2)} spent today, this run needs ~$${usd.toFixed(2)}, limit $${DAILY_LIMIT.toFixed(2)} (ICONY_DAILY_LIMIT_USD).` });
    return false;
  }
  if (busy) {
    send(res, 409, { error: "Another generation is still running." });
    return false;
  }
  return true;
}

function record(run: AiRun) {
  fs.mkdirSync(OUT, { recursive: true });
  fs.appendFileSync(LOG, JSON.stringify(run) + "\n");
}

async function generate(r: AiRequest, key: string): Promise<AiRun> {
  const runId = randomUUID().slice(0, 8);
  const prompt = buildPrompt(r);
  const editing = !!r.refImage;
  const { m, n, input } = modelInput(r, prompt, editing, r.refImage ? [r.refImage] : []);
  if (editing && !m.editEndpoint) throw new Error(`${m.label} cannot take a reference image`);
  if (m.vector && r.mode === "glyph") throw new Error("The vector model only supports full icons");
  const endpoint = editing ? m.editEndpoint! : m.endpoint;

  // Recraft returns one image per call; the others take num_images.
  const calls = m.vector ? n : 1;
  const raw: FalImage[] = [];
  const items: AiItem[] = [];
  const base = { id: runId, kind: "generate" as const, mode: r.mode, model: m.id, style: r.style, subject: r.subject, prompt, usd: 0 };
  try {
    for (let c = 0; c < calls; c++) {
      raw.push(...images(await falRun(key, endpoint, input)));
      base.usd = round(m.usd * raw.length);
    }
    for (const [i, img] of raw.entries()) {
      if (r.mode === "glyph" && !m.nativeTransparent) {
        await save(img, runId, i); // keep the uncut original next to the cut-out
        items.push(await cutout(key, runId, i, img.url));
        base.usd = round(base.usd + CUTOUT.usd);
      } else items.push(await save(img, runId, i));
    }
  } catch (e) {
    recordFailure(base, items, e);
  }
  const run: AiRun = { ...base, at: new Date().toISOString(), items };
  record(run);
  return run;
}

async function refine(body: { item: string; instruction: string; model: string; mode: AiRequest["mode"] }, key: string): Promise<AiRun> {
  const file = safeItemPath(body.item);
  if (!file) throw new Error("unknown item");
  const m = findModel(body.model);
  if (!m.editEndpoint) throw new Error(`${m.label} cannot refine images`);
  const glyph = body.mode === "glyph";
  const prompt = [
    "Edit this app icon. Keep the same subject, composition, framing and rendering style unless asked otherwise.",
    `Change: ${body.instruction.trim()}.`,
    glyph ? "Keep a single isolated object on a plain pure white background." : "Keep it a square full-bleed icon.",
    "No text, no letters, no border, no rounded corners.",
  ].join(" ");
  const runId = randomUUID().slice(0, 8);
  const { input } = modelInput({ subject: "", style: "", mode: body.mode, model: m.id, n: 1 }, prompt, true, [dataUri(file)]);
  const base = { id: runId, kind: "refine" as const, mode: body.mode, model: m.id, style: "", subject: body.instruction, prompt, usd: 0, parent: body.item };
  const items: AiItem[] = [];
  try {
    const raw = images(await falRun(key, m.editEndpoint, input));
    base.usd = round(m.usd * raw.length);
    for (const [i, img] of raw.entries()) {
      if (glyph && !m.nativeTransparent) {
        await save(img, runId, i);
        items.push(await cutout(key, runId, i, img.url));
        base.usd = round(base.usd + CUTOUT.usd);
      } else items.push(await save(img, runId, i));
    }
  } catch (e) {
    recordFailure(base, items, e);
  }
  const run: AiRun = { ...base, at: new Date().toISOString(), items };
  record(run);
  return run;
}

async function cutoutRoute(body: { item: string }, key: string): Promise<AiRun> {
  const file = safeItemPath(body.item);
  if (!file) throw new Error("unknown item");
  const runId = randomUUID().slice(0, 8);
  const item = await cutout(key, runId, 0, dataUri(file));
  const run: AiRun = {
    id: runId,
    at: new Date().toISOString(),
    kind: "cutout",
    mode: "glyph",
    model: "cutout",
    style: "",
    subject: "",
    prompt: "",
    usd: CUTOUT.usd,
    items: [item],
    parent: body.item,
  };
  record(run);
  return run;
}

export function falApi(): Plugin {
  return {
    name: "icony:fal-api",
    configureServer(server) {
      ROOT = server.config.root;
      OUT = path.join(ROOT, ".generations");
      LOG = path.join(OUT, "history.jsonl");
      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url ?? "/", "http://localhost");
        if (!url.pathname.startsWith("/api/ai/")) return next();
        const route = url.pathname.slice("/api/ai/".length);

        if (route === "status" && req.method === "GET") {
          const key = loadKey();
          return send(res, 200, {
            configured: !!key,
            keySource: key?.source ?? null,
            spend: spent(history()),
            busy,
            models: AI_MODELS,
            styles: AI_STYLES,
            folder: OUT,
          });
        }

        if (route === "history" && req.method === "GET") {
          const limit = Number(url.searchParams.get("limit") ?? 30);
          const runs = history().reverse().slice(0, limit);
          return send(res, 200, { runs, spend: spent(history()) });
        }

        if (route.startsWith("file/") && req.method === "GET") {
          const file = safeItemPath(decodeURIComponent(route.slice(5)));
          if (!file) return send(res, 404, { error: "not found" });
          const ext = path.extname(file).slice(1);
          res.setHeader("Content-Type", ext === "svg" ? "image/svg+xml" : `image/${ext === "jpg" ? "jpeg" : ext}`);
          res.setHeader("Cache-Control", "private, max-age=31536000, immutable");
          return fs.createReadStream(file).pipe(res);
        }

        if (route === "prompt" && req.method === "POST") {
          // Free: shows the compiled prompt and cost before anything is spent.
          try {
            const body = await readJson<AiRequest>(req);
            return send(res, 200, { prompt: buildPrompt(body), usd: estimateUsd(body) });
          } catch (e) {
            return send(res, 400, { error: (e as Error).message });
          }
        }

        if (["generate", "refine", "cutout"].includes(route) && req.method === "POST") {
          if (!sameOrigin(req)) return send(res, 403, { error: "cross-origin request refused" });
          if (!String(req.headers["content-type"] ?? "").includes("application/json")) {
            return send(res, 415, { error: "send JSON" });
          }
          let body: AiRequest & { item: string; instruction: string };
          try {
            body = await readJson(req);
          } catch (e) {
            return send(res, 400, { error: (e as Error).message });
          }
          const key = loadKey();
          const usd =
            route === "generate"
              ? estimateUsd(body)
              : route === "refine"
                ? estimateUsd({ model: body.model, mode: body.mode, n: 1 })
                : CUTOUT.usd;
          if (route === "generate" && (!body.subject?.trim() && !body.prompt?.trim())) return send(res, 400, { error: "describe the icon first" });
          if (route === "refine" && !body.instruction?.trim()) return send(res, 400, { error: "say what to change" });
          if ((body.subject?.length ?? 0) > 600 || (body.prompt?.length ?? 0) > 2000) return send(res, 400, { error: "prompt too long" });
          if (!guard(res, key, usd)) return;
          busy = true;
          try {
            const run =
              route === "generate" ? await generate(body, key!.value) : route === "refine" ? await refine(body, key!.value) : await cutoutRoute(body, key!.value);
            return send(res, 200, { run, spend: spent(history()) });
          } catch (e) {
            return send(res, 502, { error: (e as Error).message });
          } finally {
            busy = false;
          }
        }

        return send(res, 404, { error: "not found" });
      });
    },
  };
}
