import type { Plugin } from "vite";
import fs from "node:fs";
import path from "node:path";
import { collections, getIcon, loadSet, search } from "./iconify-core.ts";

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
          if (!loadSet(one[1])) return send(res, 404, { error: "unknown set" });
          const icon = getIcon(one[1], one[2]);
          if (!icon) return send(res, 404, { error: "unknown icon" });
          return send(res, 200, icon);
        }

        if (url.pathname === "/api/search") {
          const limit = Math.min(Number(url.searchParams.get("limit") ?? 300), 1000);
          return send(res, 200, search(url.searchParams.get("q") ?? "", limit));
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
