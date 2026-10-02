import type { Plugin } from "vite";
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";

const require = createRequire(import.meta.url);

type Collection = {
  name: string;
  total: number;
  author?: { name: string; url?: string };
  license?: { title: string; spdx?: string; url?: string };
  samples?: string[];
  height?: number | number[];
  category?: string;
  tags?: string[];
  palette?: boolean;
  hidden?: boolean;
};

type IconSet = {
  prefix: string;
  width?: number;
  height?: number;
  icons: Record<string, { body: string; width?: number; height?: number; hidden?: boolean }>;
  aliases?: Record<string, { parent: string; hidden?: boolean }>;
  categories?: Record<string, string[]>;
};

const jsonDir = path.dirname(require.resolve("@iconify/json/collections.json"));
const collections: Record<string, Collection> = require("@iconify/json/collections.json");

// Parsed sets are large (the whole package is ~460 MB of JSON), so keep only a bounded LRU of
// recently used sets, sized by their file size on disk.
const CACHE_BUDGET = 64 * 1024 * 1024;
const setCache = new Map<string, { set: IconSet; bytes: number }>();
let cachedBytes = 0;

function setFile(prefix: string) {
  return path.join(jsonDir, "json", `${prefix}.json`);
}

function readSet(prefix: string): IconSet | null {
  const file = setFile(prefix);
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, "utf8")) as IconSet;
}

function loadSet(prefix: string): IconSet | null {
  const hit = setCache.get(prefix);
  if (hit) {
    setCache.delete(prefix);
    setCache.set(prefix, hit);
    return hit.set;
  }
  const set = readSet(prefix);
  if (!set) return null;
  const bytes = fs.statSync(setFile(prefix)).size;
  setCache.set(prefix, { set, bytes });
  cachedBytes += bytes;
  for (const [key, entry] of setCache) {
    if (cachedBytes <= CACHE_BUDGET || key === prefix) break;
    setCache.delete(key);
    cachedBytes -= entry.bytes;
  }
  return set;
}

// Global name index for cross-set search, built lazily on first search. Keeping parsed sets for all
// 390k icons costs ~700 MB, so the index stores only names plus the byte range of each icon's JSON
// object in its file; result bodies are read straight from disk.
type IndexedSet = {
  prefix: string;
  file: string;
  width: number;
  height: number;
  names: string[];
  start: Uint32Array;
  end: Uint32Array;
};
let nameIndex: IndexedSet[] | null = null;

const HIDDEN = /"hidden"\s*:\s*true/;
const QUOTE = 0x22, BSLASH = 0x5c, LBRACE = 0x7b, RBRACE = 0x7d, LBRACK = 0x5b, RBRACK = 0x5d, COLON = 0x3a;

/** Index of the byte after the JSON string starting at buf[i] (a quote). */
function skipString(buf: Buffer, i: number) {
  for (i++; i < buf.length; i++) {
    if (buf[i] === BSLASH) i++;
    else if (buf[i] === QUOTE) return i + 1;
  }
  return i;
}

/** Index of the byte after the JSON value starting at buf[i]. */
function skipValue(buf: Buffer, i: number) {
  if (buf[i] === QUOTE) return skipString(buf, i);
  if (buf[i] !== LBRACE && buf[i] !== LBRACK) {
    while (i < buf.length && buf[i] !== 0x2c && buf[i] !== RBRACE && buf[i] !== RBRACK) i++;
    return i;
  }
  let depth = 0;
  for (; i < buf.length; i++) {
    const c = buf[i];
    if (c === QUOTE) i = skipString(buf, i) - 1;
    else if (c === LBRACE || c === LBRACK) depth++;
    else if ((c === RBRACE || c === RBRACK) && --depth === 0) return i + 1;
  }
  return i;
}

/** Calls fn(key, valueStart, valueEnd) for each member of the object starting at buf[i]. */
function eachMember(buf: Buffer, i: number, fn: (key: string, start: number, end: number) => void) {
  for (i++; i < buf.length; i++) {
    const c = buf[i];
    if (c === RBRACE) return;
    if (c !== QUOTE) continue;
    const keyEnd = skipString(buf, i);
    const key = JSON.parse(buf.toString("utf8", i, keyEnd)) as string;
    i = buf.indexOf(COLON, keyEnd) + 1;
    while (buf[i] === 0x20 || buf[i] === 0x0a || buf[i] === 0x0d || buf[i] === 0x09) i++;
    const end = skipValue(buf, i);
    fn(key, i, end);
    i = end - 1;
  }
}

function indexSet(prefix: string): IndexedSet | null {
  const file = setFile(prefix);
  if (!fs.existsSync(file)) return null;
  const buf = fs.readFileSync(file);
  const names: string[] = [];
  const starts: number[] = [];
  const ends: number[] = [];
  let width = 16;
  let height = 16;
  eachMember(buf, buf.indexOf(LBRACE), (key, start, end) => {
    if (key === "width") width = Number(buf.toString("utf8", start, end));
    if (key === "height") height = Number(buf.toString("utf8", start, end));
    if (key !== "icons") return;
    eachMember(buf, start, (name, s, e) => {
      if (HIDDEN.test(buf.toString("utf8", s, e))) return;
      names.push(name);
      starts.push(s);
      ends.push(e);
    });
  });
  return { prefix, file, width, height, names, start: Uint32Array.from(starts), end: Uint32Array.from(ends) };
}

function buildIndex() {
  if (nameIndex) return nameIndex;
  const out: IndexedSet[] = [];
  for (const prefix of Object.keys(collections)) {
    if (collections[prefix].hidden) continue;
    const entry = indexSet(prefix);
    if (entry) out.push(entry);
  }
  nameIndex = out;
  return out;
}

function readIcon(entry: IndexedSet, i: number, fd: number) {
  const len = entry.end[i] - entry.start[i];
  const buf = Buffer.alloc(len);
  fs.readSync(fd, buf, 0, len, entry.start[i]);
  return JSON.parse(buf.toString("utf8")) as { body: string; width?: number; height?: number };
}

function send(res: any, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(body));
}

export function iconifyApi(): Plugin {
  return {
    name: "icony:iconify-api",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = new URL(req.url ?? "/", "http://localhost");
        if (!url.pathname.startsWith("/api/")) return next();

        if (url.pathname === "/api/collections") {
          const list = Object.entries(collections)
            .filter(([, c]) => !c.hidden)
            .map(([prefix, c]) => ({
              prefix,
              name: c.name,
              total: c.total,
              author: c.author?.name ?? "",
              license: c.license?.spdx ?? c.license?.title ?? "",
              licenseUrl: c.license?.url ?? "",
              category: c.category ?? "Other",
              palette: !!c.palette,
              samples: c.samples ?? [],
              height: Array.isArray(c.height) ? c.height[0] : c.height ?? 24,
            }));
          return send(res, 200, list);
        }

        const m = url.pathname.match(/^\/api\/set\/([a-z0-9-]+)$/);
        if (m) {
          const set = loadSet(m[1]);
          if (!set) return send(res, 404, { error: "unknown set" });
          const names = Object.keys(set.icons).filter((n) => !set.icons[n].hidden);
          const offset = Number(url.searchParams.get("offset") ?? 0);
          const limit = Math.min(Number(url.searchParams.get("limit") ?? 400), 2000);
          const q = (url.searchParams.get("q") ?? "").toLowerCase().trim();
          const filtered = q ? names.filter((n) => n.includes(q)) : names;
          const page = filtered.slice(offset, offset + limit);
          const icons: Record<string, unknown> = {};
          for (const n of page) icons[n] = set.icons[n];
          return send(res, 200, {
            prefix: set.prefix,
            width: set.width ?? 16,
            height: set.height ?? 16,
            total: filtered.length,
            categories: set.categories ? Object.keys(set.categories) : [],
            icons,
          });
        }

        const one = url.pathname.match(/^\/api\/icon\/([a-z0-9-]+)\/([a-z0-9-]+)$/);
        if (one) {
          const set = loadSet(one[1]);
          if (!set) return send(res, 404, { error: "unknown set" });
          let name = one[2];
          if (!set.icons[name] && set.aliases?.[name]) name = set.aliases[name].parent;
          const icon = set.icons[name];
          if (!icon) return send(res, 404, { error: "unknown icon" });
          return send(res, 200, {
            prefix: set.prefix,
            name: one[2],
            width: icon.width ?? set.width ?? 16,
            height: icon.height ?? set.height ?? 16,
            body: icon.body,
          });
        }

        if (url.pathname === "/api/search") {
          const q = (url.searchParams.get("q") ?? "").toLowerCase().trim();
          const limit = Math.min(Number(url.searchParams.get("limit") ?? 300), 1000);
          if (q.length < 2) return send(res, 200, { total: 0, results: [] });
          const terms = q.split(/\s+/);
          type Hit = { set: IndexedSet; i: number };
          const exact: Hit[] = [];
          const starts: Hit[] = [];
          const contains: Hit[] = [];
          for (const set of buildIndex()) {
            for (let i = 0; i < set.names.length; i++) {
              const n = set.names[i];
              if (!terms.every((t) => n.includes(t))) continue;
              const e = { set, i };
              if (n === q) exact.push(e);
              else if (n.startsWith(q)) starts.push(e);
              else contains.push(e);
            }
          }
          const all = [...exact, ...starts, ...contains];
          const fds = new Map<string, number>();
          try {
            const results = all.slice(0, limit).map(({ set, i }) => {
              let fd = fds.get(set.file);
              if (fd === undefined) fds.set(set.file, (fd = fs.openSync(set.file, "r")));
              const icon = readIcon(set, i, fd);
              return {
                prefix: set.prefix,
                name: set.names[i],
                width: icon.width ?? set.width,
                height: icon.height ?? set.height,
                body: icon.body,
              };
            });
            return send(res, 200, { total: all.length, results });
          } finally {
            for (const fd of fds.values()) fs.closeSync(fd);
          }
        }

        if (url.pathname === "/api/dump" && req.method === "POST") {
          // Dev-only helper: save a posted file to the scratch dir so exports can be verified from the CLI.
          // Any web page can fire a simple cross-origin POST at localhost, so only accept requests from
          // the app itself (or from tools that send no Origin, like curl).
          const origin = req.headers.origin;
          if (origin && URL.parse(origin)?.host !== req.headers.host) {
            return send(res, 403, { error: "cross-origin dump refused" });
          }
          const chunks: Buffer[] = [];
          req.on("data", (c: Buffer) => chunks.push(c));
          req.on("end", () => {
            const name = (url.searchParams.get("name") ?? "dump.bin").replace(/[^a-zA-Z0-9._-]/g, "_");
            const dir = process.env.TMPDIR ?? "/tmp";
            const file = path.join(dir, name);
            fs.writeFileSync(file, Buffer.concat(chunks));
            send(res, 200, { file });
          });
          return;
        }

        return send(res, 404, { error: "not found" });
      });
    },
  };
}
