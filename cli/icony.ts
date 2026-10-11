// icony CLI: search the icon library, export store-ready icon sets, serve MCP.
// Built with `pnpm build:cli` into dist-cli/icony.js.

import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import pkg from "../package.json" with { type: "json" };
import { collections, licenseOf, search } from "../plugins/iconify-core.ts";
import { exportIcon, PLATFORMS, PRESET_IDS, type ExportBody } from "../plugins/export-core.ts";
import { lib } from "./lib.ts";

export const VERSION: string = pkg.version;
export const DESCRIPTION = "Store-ready app icon sets for iOS, Android, web and macOS from 370k open-source icons, text or your own image";
export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

class UsageError extends Error {
  help: string;
  constructor(message: string, help: string) {
    super(message);
    this.help = help;
  }
}

let json = false;

function print(data: unknown, lines: string[]) {
  if (json) console.log(JSON.stringify(data, null, 2));
  else console.log(lines.join("\n"));
}

const tilde = (p: string) => (p.startsWith(os.homedir()) ? "~" + p.slice(os.homedir().length) : p);

/** Runs a strict parseArgs; unknown or malformed flags become a usage error (exit 2). */
function guard<T>(fn: () => T, usage: string): T {
  try {
    return fn();
  } catch (e) {
    throw new UsageError((e as Error).message.split("\n")[0].split(". To specify")[0], usage);
  }
}

function home() {
  const sets = Object.values(collections).filter((c) => !c.hidden);
  const total = sets.reduce((n, c) => n + c.total, 0);
  print(
    { bin: tilde(process.argv[1]), description: DESCRIPTION, version: VERSION, sets: sets.length, icons: total },
    [
      `bin: ${tilde(process.argv[1])}`,
      `description: ${DESCRIPTION}`,
      `library: ${total.toLocaleString("en-US")} icons in ${sets.length} sets`,
      "help:",
      '  icony search "<words>"                       find icon ids',
      "  icony export --icon <id> --out <dir>         build the icon set zip",
      "  icony mcp                                    serve these tools to an agent over MCP (stdio)",
    ],
  );
}

const SEARCH_USAGE = 'icony search "<words>" [--limit 20] [--json]';

function searchCmd(args: string[]) {
  const { values, positionals } = guard(
    () => parseArgs({ args, allowPositionals: true, strict: true, options: { json: { type: "boolean" }, limit: { type: "string", default: "20" } } }),
    SEARCH_USAGE,
  );
  const query = positionals.join(" ").trim();
  if (query.length < 2) throw new UsageError("search needs at least 2 characters", SEARCH_USAGE);
  const limit = Number(values.limit);
  if (!Number.isInteger(limit) || limit < 1 || limit > 200) throw new UsageError("--limit must be 1-200", SEARCH_USAGE);
  const r = search(query, limit);
  const hits = r.results.map((x) => ({ id: `${x.prefix}:${x.name}`, license: licenseOf(x.prefix).spdx || licenseOf(x.prefix).title }));
  const lines = [`icons: ${hits.length} of ${r.total} matches for "${query}"`];
  for (const h of hits) lines.push(`  ${h.id}  (${h.license})`);
  if (hits.length === 0) lines.push("help: names are English and literal; try a synonym (e.g. cart, basket, bag)");
  else lines.push(`help: icony export --icon ${hits[0].id} --out <dir>`);
  print({ query, shown: hits.length, total: r.total, results: hits }, lines);
}

const EXPORT_USAGE = "icony export (--icon <id> | --text <t> | --image <png|svg>) [--preset ink] [--background #hex] [--shape squircle] [--platforms ios,android,web] [--out <dir>] [--json]";

async function exportCmd(args: string[]) {
  const { values, positionals } = guard(
    () =>
      parseArgs({
        args,
        allowPositionals: true,
        strict: true,
        options: {
          json: { type: "boolean" },
          icon: { type: "string" },
          text: { type: "string" },
          image: { type: "string" },
          preset: { type: "string" },
          background: { type: "string" },
          "glyph-color": { type: "string" },
          shape: { type: "string" },
          size: { type: "string" },
          platforms: { type: "string" },
          filename: { type: "string" },
          "app-name": { type: "string" },
          out: { type: "string", default: "." },
        },
      }),
    EXPORT_USAGE,
  );
  if (positionals.length) throw new UsageError(`unexpected argument: ${positionals[0]}`, EXPORT_USAGE);
  const sources = [values.icon, values.text, values.image].filter(Boolean);
  if (sources.length !== 1) throw new UsageError("give exactly one of --icon, --text, --image", EXPORT_USAGE);
  if (values.preset && !(PRESET_IDS as readonly string[]).includes(values.preset))
    throw new UsageError(`unknown preset ${values.preset}`, `presets: ${PRESET_IDS.join(", ")}`);
  const hex = /^#[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/;
  for (const k of ["background", "glyph-color"] as const)
    if (values[k] && !hex.test(values[k]!)) throw new UsageError(`--${k} must be a hex color like #111111`, EXPORT_USAGE);
  if (values.shape && !["squircle", "rounded", "circle", "square"].includes(values.shape))
    throw new UsageError(`unknown shape ${values.shape}`, "shapes: squircle, rounded, circle, square");
  const platforms = values.platforms?.split(",").map((p) => p.trim()).filter(Boolean);
  const bad = platforms?.find((p) => !(PLATFORMS as readonly string[]).includes(p));
  if (bad) throw new UsageError(`unknown platform ${bad}`, `platforms: ${PLATFORMS.join(", ")}`);
  const size = values.size === undefined ? undefined : Number(values.size);
  if (size !== undefined && !(size >= 10 && size <= 100)) throw new UsageError("--size must be 10-100 (% of the canvas)", EXPORT_USAGE);

  const body: ExportBody = {
    icon: values.icon,
    text: values.text,
    image_path: values.image,
    preset: values.preset,
    background: values.background,
    glyph_color: values["glyph-color"],
    shape: values.shape as ExportBody["shape"],
    size,
    platforms: platforms ?? ["ios", "android", "web"],
    filename: values.filename,
    app_name: values["app-name"],
    out_dir: values.out,
  };
  let r;
  try {
    r = await exportIcon(lib, body, { root: ROOT, defaultOut: "." });
  } catch (e) {
    const msg = (e as Error).message;
    if (msg.startsWith("icon not found")) throw new UsageError(msg, 'icony search "<words>"');
    if (msg.startsWith("file not found")) throw new UsageError(msg, EXPORT_USAGE);
    throw e;
  }
  const lines = [`zip: ${tilde(r.zip)}`, `preview: ${tilde(r.preview)}`, `files: ${r.files} (${r.platforms.join(", ")})`];
  if (r.license) {
    lines.push(`license: ${r.license.spdx || r.license.title}${r.license.url ? " " + r.license.url : ""}`);
    if (/^CC-BY|^GPL|^unknown/i.test(r.license.spdx || r.license.title)) lines.push("note: this icon set's license has conditions (attribution or copyleft); check it before shipping");
  }
  print(r, lines);
}

export async function main(argv: string[]): Promise<number> {
  json = argv.includes("--json");
  const [cmd, ...rest] = argv;
  try {
    if (cmd === "--version" || cmd === "-v" || cmd === "version") {
      console.log(VERSION);
      return 0;
    }
    if (cmd === undefined || cmd === "--json") {
      home();
      return 0;
    }
    if (cmd === "--help" || cmd === "-h" || cmd === "help") {
      console.log([`icony ${VERSION}: ${DESCRIPTION}`, "", `  ${SEARCH_USAGE}`, `  ${EXPORT_USAGE}`, "  icony mcp", "  icony --version"].join("\n"));
      return 0;
    }
    if (cmd === "search") return searchCmd(rest), 0;
    if (cmd === "export") return await exportCmd(rest), 0;
    if (cmd === "mcp") {
      const { runMcp } = await import("./mcp.ts");
      await runMcp();
      return -1; // keep running
    }
    throw new UsageError(`unknown command ${cmd}`, "icony --help");
  } catch (e) {
    const help = e instanceof UsageError ? e.help : "";
    const message = (e as Error).message;
    if (json) console.log(JSON.stringify(help ? { error: message, help } : { error: message }, null, 2));
    else console.log(`error: ${message}` + (help ? `\nhelp: ${help}` : ""));
    return e instanceof UsageError ? 2 : 1;
  }
}

const code = await main(process.argv.slice(2));
if (code >= 0) process.exitCode = code;
