import { DEFAULT_STATE, type IconState } from "./types.ts";

/**
 * Turns an untrusted project object (a dropped `.iconbake.json`, a `state` posted to /api/export)
 * into an IconState that is safe to render. Strings from the file end up inside SVG attributes
 * and zip entry names, so anything that could break out of those is dropped or rejected:
 *
 * - clipart `body` is discarded; the UI re-fetches it from the library by prefix/name
 * - `dataUrl` must be a base64 `data:image/...` URL
 * - `filename` is reduced to [A-Za-z0-9_-]
 * - free text (`text`, `appName`, `badge`) is kept as is; it is escaped at render time
 * - every other string must not contain `<`, `>` or `"`
 *
 * Returns null when the input is not a project at all or when a string fails the check.
 */
export function sanitizeProject(raw: unknown): IconState | null {
  if (!isRecord(raw) || !isRecord(raw.fg) || !isRecord(raw.bg)) return null;
  const clean = walk(raw, "");
  if (clean === INVALID) return null;
  const s = clean as Record<string, unknown>;
  const fg = s.fg as Record<string, unknown>;
  const src = isRecord(fg.source) ? fg.source : null;
  if (src?.kind === "clipart") {
    if (!isId(src.prefix) || !isId(src.name)) return null;
    src.body = "";
  }
  if (typeof s.filename === "string") s.filename = s.filename.replace(/[^a-zA-Z0-9_-]/g, "") || DEFAULT_STATE.filename;
  return { ...DEFAULT_STATE, ...(s as Partial<IconState>) };
}

const INVALID = Symbol("invalid");
const FREE_TEXT = new Set(["text", "appName", "badge"]);
const DATA_IMAGE = /^data:image\/(png|jpeg|jpg|gif|webp|svg\+xml);base64,[A-Za-z0-9+/=\s]+$/;
const isId = (v: unknown): v is string => typeof v === "string" && /^[a-z0-9-]+$/.test(v);
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

function walk(v: unknown, key: string): unknown {
  if (typeof v === "string") {
    if (key === "dataUrl") return DATA_IMAGE.test(v) ? v : INVALID;
    if (FREE_TEXT.has(key) || key === "body") return v;
    return /[<>"]/.test(v) ? INVALID : v;
  }
  if (Array.isArray(v)) {
    const out = v.map((x) => walk(x, key));
    return out.includes(INVALID) ? INVALID : out;
  }
  if (isRecord(v)) {
    const out: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v)) {
      if (k === "__proto__" || k === "constructor" || k === "prototype") continue;
      const c = walk(x, k);
      if (c === INVALID) return INVALID;
      out[k] = c;
    }
    return out;
  }
  return v;
}
