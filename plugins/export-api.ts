import { isLocalRequest } from "./guard.ts";
import type { Plugin, ViteDevServer } from "vite";
import type { IncomingMessage, ServerResponse } from "node:http";
import path from "node:path";
import { exportIcon, type ExportBody, type Lib } from "./export-core.ts";

// POST /api/export: the dev server face of export-core (used by curl and older MCP setups).

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

// Loaded through Vite (ssrLoadModule) so the export always matches the running UI.
async function loadLib(server: ViteDevServer): Promise<Lib> {
  const [types, presets, exp, comp, proj] = await Promise.all([
    server.ssrLoadModule("/src/lib/types.ts"),
    server.ssrLoadModule("/src/lib/presets.ts"),
    server.ssrLoadModule("/src/lib/export.ts"),
    server.ssrLoadModule("/src/lib/compose.ts"),
    server.ssrLoadModule("/src/lib/project.ts"),
  ]);
  return { DEFAULT_STATE: types.DEFAULT_STATE, PRESETS: presets.PRESETS, setRasterizer: exp.setRasterizer, collectFiles: exp.collectFiles, compose: comp.compose, sanitizeProject: proj.sanitizeProject } as Lib;
}

export function exportApi(): Plugin {
  return {
    name: "iconpress:export-api",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url ?? "/", "http://localhost");
        if (url.pathname !== "/api/export") return next();
        if (req.method !== "POST") return send(res, 405, { error: "POST JSON" });
        if (!isLocalRequest(req)) return send(res, 403, { error: "cross-origin request refused" });
        try {
          const body = await readJson<ExportBody>(req);
          const root = server.config.root;
          return send(res, 200, await exportIcon(await loadLib(server), body, { root, defaultOut: path.join(root, ".generations", "exports"), confineTo: root }));
        } catch (e) {
          return send(res, 400, { error: (e as Error).message });
        }
      });
    },
  };
}
