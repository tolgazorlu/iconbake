// Iconify library access shared by the dev server plugin, the CLI and the MCP server.
// Node only: reads @iconify/json from disk, no Vite.
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";

const require = createRequire(import.meta.url);

export type Collection = {
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

export type IconSet = {
  prefix: string;
  width?: number;
  height?: number;
  icons: Record<string, { body: string; width?: number; height?: number; hidden?: boolean }>;
  aliases?: Record<string, { parent: string; hidden?: boolean }>;
  categories?: Record<string, string[]>;
};

const jsonDir = path.dirname(require.resolve("@iconify/json/collections.json"));
export const collections: Record<string, Collection> = require("@iconify/json/collections.json");

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

export function loadSet(prefix: string): IconSet | null {
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
export type IndexedSet = {
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

export function buildIndex() {
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

export function readIcon(entry: IndexedSet, i: number, fd: number) {
  const len = entry.end[i] - entry.start[i];
  const buf = Buffer.alloc(len);
  fs.readSync(fd, buf, 0, len, entry.start[i]);
  return JSON.parse(buf.toString("utf8")) as { body: string; width?: number; height?: number };
}

export type IconData = { prefix: string; name: string; width: number; height: number; body: string };

/** One icon by prefix and name (aliases resolved), or null. */
export function getIcon(prefix: string, name: string): IconData | null {
  const set = loadSet(prefix);
  if (!set) return null;
  let key = name;
  if (!set.icons[key] && set.aliases?.[key]) key = set.aliases[key].parent;
  const icon = set.icons[key];
  if (!icon) return null;
  return { prefix: set.prefix, name, width: icon.width ?? set.width ?? 16, height: icon.height ?? set.height ?? 16, body: icon.body };
}

/** The license of an icon set, e.g. { spdx: "MIT" }. Callers must surface it: some sets need attribution. */
export function licenseOf(prefix: string) {
  const l = collections[prefix]?.license;
  return { title: l?.title ?? "unknown", spdx: l?.spdx ?? "", url: l?.url ?? "" };
}

/** Name search across every visible set: exact, then prefix, then substring matches. */
export function search(query: string, limit: number): { total: number; results: IconData[] } {
  const q = query.toLowerCase().trim();
  if (q.length < 2) return { total: 0, results: [] };
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
      return { prefix: set.prefix, name: set.names[i], width: icon.width ?? set.width, height: icon.height ?? set.height, body: icon.body };
    });
    return { total: all.length, results };
  } finally {
    for (const fd of fds.values()) fs.closeSync(fd);
  }
}
