// End-to-end tests: drive the built CLI (dist-cli/icony.js) the way a script or agent does.
// Run with `pnpm test` (builds first).
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const BIN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../dist-cli/icony.js");
const run = (...args) => {
  const r = spawnSync(process.execPath, [BIN, ...args], { encoding: "utf8" });
  return { out: r.stdout, code: r.status };
};
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "icony-test-"));

test("home view shows the library and next steps", () => {
  const { out, code } = run();
  assert.equal(code, 0);
  assert.match(out, /^bin: /m);
  assert.match(out, /library: [\d,]+ icons in \d+ sets/);
  assert.match(out, /icony export --icon/);
});

test("version is bare", () => {
  for (const f of ["--version", "-v", "version"]) {
    const { out, code } = run(f);
    assert.equal(code, 0);
    assert.match(out.trim(), /^\d+\.\d+\.\d+$/);
  }
});

test("search returns ids with licenses, and JSON", () => {
  const { out, code } = run("search", "leaf", "--limit", "3", "--json");
  assert.equal(code, 0);
  const r = JSON.parse(out);
  assert.equal(r.shown, 3);
  assert.ok(r.total >= 3);
  assert.match(r.results[0].id, /^[a-z0-9-]+:[a-z0-9-]+$/);
  assert.ok(r.results[0].license);
});

test("search with no hits says so", () => {
  const { out, code } = run("search", "zzqqxxnotanicon");
  assert.equal(code, 0);
  assert.match(out, /icons: 0 of 0 matches/);
});

test("export writes a 51-file zip and a preview for the default platforms", () => {
  const dir = tmp();
  const { out, code } = run("export", "--icon", "mdi:leaf", "--preset", "ink", "--out", dir, "--json");
  assert.equal(code, 0, out);
  const r = JSON.parse(out);
  assert.equal(r.files, 51);
  assert.deepEqual(r.platforms, ["ios", "android", "web"]);
  assert.equal(r.license.spdx, "Apache-2.0");
  assert.ok(fs.statSync(r.zip).size > 10_000);
  assert.equal(fs.readFileSync(r.preview).subarray(1, 4).toString(), "PNG");
  fs.rmSync(dir, { recursive: true });
});

test("usage errors exit 2 with a help line", () => {
  const cases = [
    [["export", "--out", "."], /exactly one of --icon, --text, --image/],
    [["export", "--icon", "mdi:no-such-icon-x"], /icon not found/],
    [["export", "--text", "A", "--platforms", "ios,watch"], /unknown platform watch/],
    [["export", "--text", "A", "--background", "red"], /hex color/],
    [["search", "leaf", "--stat"], /Unknown option '--stat'/],
    [["frobnicate"], /unknown command/],
  ];
  for (const [args, re] of cases) {
    const { out, code } = run(...args);
    assert.equal(code, 2, `${args.join(" ")}: ${out}`);
    assert.match(out, re);
    assert.match(out, /^help: /m);
  }
});

test("mcp serves search and export in-process, without the dev server", async () => {
  const dir = tmp();
  // A dead ICONY_URL proves the free tools never call the dev server.
  const child = spawn(process.execPath, [BIN, "mcp"], { env: { ...process.env, ICONY_URL: "http://127.0.0.1:9" } });
  const replies = new Map();
  let buf = "";
  child.stdout.on("data", (d) => {
    buf += d;
    let i;
    while ((i = buf.indexOf("\n")) >= 0) {
      const msg = JSON.parse(buf.slice(0, i));
      buf = buf.slice(i + 1);
      if (msg.id) replies.set(msg.id, msg);
    }
  });
  const send = (m) => child.stdin.write(JSON.stringify(m) + "\n");
  const wait = async (id) => {
    for (let t = 0; t < 200 && !replies.has(id); t++) await new Promise((r) => setTimeout(r, 50));
    return replies.get(id);
  };
  try {
    send({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "test", version: "1" } } });
    assert.equal((await wait(1)).result.serverInfo.name, "icony");
    send({ jsonrpc: "2.0", method: "notifications/initialized" });
    send({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "search_icons", arguments: { query: "barcode", limit: 3 } } });
    const s = JSON.parse((await wait(2)).result.content[0].text);
    assert.equal(s.ids.length, 3);
    send({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "export_icon", arguments: { icon: s.ids[0], out_dir: dir } } });
    const e = await wait(3);
    assert.ok(!e.result.isError, e.result.content[0].text);
    assert.ok(fs.existsSync(JSON.parse(e.result.content[0].text).zip));
  } finally {
    child.kill();
    fs.rmSync(dir, { recursive: true });
  }
});
