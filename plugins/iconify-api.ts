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

const setCache = new Map<string, IconSet>();
function loadSet(prefix: string): IconSet | null {
  if (setCache.has(prefix)) return setCache.get(prefix)!;
  const file = path.join(jsonDir, "json", `${prefix}.json`);
  if (!fs.existsSync(file)) return null;
  const data = JSON.parse(fs.readFileSync(file, "utf8")) as IconSet;
  setCache.set(prefix, data);
  return data;
}

// Global name index for cross-set search: built lazily on first search.
let nameIndex: { prefix: string; name: string }[] | null = null;
function buildIndex() {
  if (nameIndex) return nameIndex;
  const out: { prefix: string; name: string }[] = [];
  for (const prefix of Object.keys(collections)) {
    if (collections[prefix].hidden) continue;
    const set = loadSet(prefix);
    if (!set) continue;
    for (const name of Object.keys(set.icons)) {
      if (!set.icons[name].hidden) out.push({ prefix, name });
    }
  }
  nameIndex = out;
  return out;
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
          const idx = buildIndex();
          const terms = q.split(/\s+/);
          const exact: typeof idx = [];
          const starts: typeof idx = [];
          const contains: typeof idx = [];
          for (const e of idx) {
            const n = e.name;
            if (!terms.every((t) => n.includes(t))) continue;
            if (n === q) exact.push(e);
            else if (n.startsWith(q)) starts.push(e);
            else contains.push(e);
          }
          const all = [...exact, ...starts, ...contains];
          const results = all.slice(0, limit).map((e) => {
            const set = loadSet(e.prefix)!;
            const icon = set.icons[e.name];
            return {
              prefix: e.prefix,
              name: e.name,
              width: icon.width ?? set.width ?? 16,
              height: icon.height ?? set.height ?? 16,
              body: icon.body,
            };
          });
          return send(res, 200, { total: all.length, results });
        }

        if (url.pathname === "/api/dump" && req.method === "POST") {
          // Dev-only helper: save a posted file to the scratch dir so exports can be verified from the CLI.
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
