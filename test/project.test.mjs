// Unit tests for the untrusted-project sanitizer and the HTTP path confinement.
// Node strips the types itself, so the source modules are imported directly.
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { sanitizeProject } from "../src/lib/project.ts";
import { DEFAULT_STATE } from "../src/lib/types.ts";
import { confine } from "../plugins/export-core.ts";

const project = (over = {}) => structuredClone({ ...DEFAULT_STATE, ...over });

test("a plain project passes and is merged over the defaults", () => {
  const s = sanitizeProject({ fg: DEFAULT_STATE.fg, bg: DEFAULT_STATE.bg, filename: "myapp" });
  assert.equal(s.filename, "myapp");
  assert.deepEqual(s.platforms, DEFAULT_STATE.platforms);
});

test("non-projects are rejected", () => {
  for (const bad of [null, 1, "x", [], {}, { fg: {} }, { bg: {} }]) assert.equal(sanitizeProject(bad), null);
});

test("clipart body from the file is dropped so the UI re-fetches it from the library", () => {
  const p = project();
  p.fg.source = { kind: "clipart", prefix: "mdi", name: "home", body: '<image href="x" onerror="alert(1)"/>', width: 24, height: 24 };
  const s = sanitizeProject(p);
  assert.equal(s.fg.source.body, "");
  assert.equal(s.fg.source.prefix, "mdi");
  p.fg.source.prefix = "mdi<script>";
  assert.equal(sanitizeProject(p), null);
});

test("strings that could break out of an SVG attribute are rejected", () => {
  for (const color of ['#fff" onload="alert(1)', "<x>", 'a"b']) {
    const p = project();
    p.bg.color = color;
    assert.equal(sanitizeProject(p), null, color);
  }
  const p = project();
  p.fg.source = { kind: "text", text: '<b>"quoted" & more</b>', font: "system-ui", weight: 700, italic: false };
  p.appName = 'Tom & "Jerry"';
  assert.ok(sanitizeProject(p), "free text is kept, it is escaped when rendered");
});

test("image data URLs must be base64 data:image", () => {
  const p = project();
  p.fg.source = { kind: "image", dataUrl: 'data:image/png;base64,AAAA', natural: { w: 1, h: 1 } };
  assert.ok(sanitizeProject(p));
  for (const url of ['javascript:alert(1)', 'data:text/html;base64,AAAA', 'data:image/png;base64,AA" onload="x']) {
    p.fg.source.dataUrl = url;
    assert.equal(sanitizeProject(p), null, url);
  }
});

test("filename cannot carry path segments into zip entry names", () => {
  assert.equal(sanitizeProject(project({ filename: "../../etc/passwd" })).filename, "etcpasswd");
  assert.equal(sanitizeProject(project({ filename: "///" })).filename, DEFAULT_STATE.filename);
});

test("prototype keys are ignored", () => {
  const s = sanitizeProject(JSON.parse('{"fg":{},"bg":{},"__proto__":{"polluted":true}}'));
  assert.equal(s.polluted, undefined);
  assert.equal({}.polluted, undefined);
});

test("confine keeps HTTP paths inside the root", () => {
  const root = path.resolve("/tmp/iconpress-root");
  assert.equal(confine(root, "exports/a.zip", "out_dir"), path.join(root, "exports/a.zip"));
  assert.equal(confine(root, root, "out_dir"), root);
  for (const p of ["../x", "/etc/passwd", root + "-other/x", "exports/../../x"]) assert.throws(() => confine(root, p, "out_dir"), /must stay inside/, p);
});
