# icony

Local app icon generator. IconKitchen's workflow plus Logofa.st's one-click looks,
with every free icon set that Iconify packages: **238 sets, ~380,000 icons**
(Material Symbols, Lucide, Tabler, Phosphor, Heroicons, Solar, Hugeicons, Fluent,
Carbon, Remix, Font Awesome, Simple Icons, Noto/Twemoji/Fluent emoji, logos, …).

Everything runs locally. Icons are served from `node_modules/@iconify/json` by a
Vite dev-server middleware; nothing leaves your machine.

## Run

```bash
pnpm install
pnpm dev        # http://localhost:4100
```

## What it does

- **Icon source**: AI generation (fal.ai, see below), clipart (any set, or search all
  380k at once), text (system fonts, weight, italic, multi-line, emoji), or an uploaded SVG/PNG.
- **Glyph**: recolor, padding, rotate, offset, flip, stroke width override,
  opacity, effects (drop shadow, long cast shadow, score, emboss).
- **Background**: flat, linear/radial gradient, mesh gradient (seeded), image,
  or none; textures (polka, grid, stripes, cross, halftone, waves, concentric,
  noise); border.
- **Shape**: squircle (Apple superellipse), rounded (radius), circle, square.
  iOS/macOS always use Apple's mask.
- **Presets**: 14 one-click looks; the chosen glyph stays.
- **Previews**: iOS home screen + dock, Android (all mask shapes + adaptive
  layer breakdown), macOS dock, browser tab + favicon, plain on checkerboard,
  and a 16/32/48/64 size strip.
- **Export** (one zip, `⌘S`):
  - Android: adaptive `foreground/background/monochrome` per density,
    legacy + round, `mipmap-anydpi-v26` XML, Play Store 512, layer SVGs.
  - iOS: `AppIcon.appiconset` with light, dark and tinted 1024 PNGs +
    `Contents.json`; Expo copies under `ios/expo/`.
  - macOS: full `AppIcon.appiconset` (16…512 @1x/@2x).
  - Web: favicon.ico (16/32/48), favicon.svg, apple-touch-icon, 192/512,
    maskable 512, `manifest.webmanifest`, HTML snippet.
  - PNG 64…1024, composed SVG, bare glyph SVG, and `icony.json` (the project).
- Copy 512 PNG to clipboard (`⌘C`), save/open project JSON, undo/redo, dark
  and light UI theme, state persists in localStorage.

## AI generation (fal.ai)

The **Generate** panel makes icons with fal.ai image models. Two outputs:

- **Full icon**: the artwork fills the icon, background included. Export uses it as the
  background layer; the iOS tinted variant becomes a grayscale copy and the Android themed
  (monochrome) layer is left out.
- **Glyph only**: one object on a transparent background (GPT Image returns it directly, other
  models go through BiRefNet cut-out), placed on your Style background. This is the mode that
  gives proper Android adaptive, monochrome and iOS tinted icons.

14 styles (Monolith, Porcelain, Frosted glass, Glossy toy, Clay, Painterly, Paper cut, Diorama,
Enamel pin, Metal, Risograph, Pixel, Flat mark, Line mark), 1 to 4 variants, palette lock
(auto, neutral, brand hex), optional style reference image, editable prompt, refine with an
instruction, and a history of every image.

Models and estimated cost per image (fal pricing, 2026-10): FLUX.2 Klein $0.007, GPT Image 1.5
medium $0.04, Nano Banana 2 $0.08, Recraft V3 vector $0.08 (SVG, full icons only), Nano Banana
Pro $0.15. Cut-out adds ~$0.002.

Setup: put `FAL_KEY=...` in `.env.local` (or the shell env). The panel
shows which file the key came from. The key is only read by the dev server.

Guards: paid routes accept same-origin JSON posts or curl (no `Origin`), one run at a time, max 4
images, no retries, a 180 s timeout that cancels the fal job, and a daily cap from
`ICONY_DAILY_LIMIT_USD` (default 3). Every run, including failed ones that were billed, is
logged with its estimated cost in `.generations/history.jsonl`; images are saved next to it.

### HTTP API (dev server)

| Call | Route |
|---|---|
| Key, spend, models, styles | `GET /api/ai/status` |
| Compiled prompt + cost, free | `POST /api/ai/prompt` |
| Generate | `POST /api/ai/generate` `{subject, style, mode: "full"\|"glyph", model, n, palette?, brand?, backdrop?, prompt?, refImage?}` |
| Refine an image | `POST /api/ai/refine` `{item, instruction, model, mode}` |
| Remove background | `POST /api/ai/cutout` `{item}` |
| History | `GET /api/ai/history?limit=30` |
| Image file | `GET /api/ai/file/<item id>` |

```bash
curl -s localhost:4100/api/ai/generate -H 'Content-Type: application/json' \
  -d '{"subject":"a paper plane","style":"monolith","mode":"glyph","model":"gpt","n":2}'
```

The response lists `run.items[].file` (absolute path) and `run.usd`.

## CLI and MCP (no browser, no dev server)

```bash
pnpm build:cli                     # once: bundles dist-cli/icony.js
node dist-cli/icony.js             # library size and next steps
node dist-cli/icony.js search "shopping cart" --limit 10
node dist-cli/icony.js export --icon mdi:barcode --preset ink --out ./assets/icon
```

`export` writes `<filename>-<stamp>.zip` (iOS `AppIcon.appiconset` with dark and tinted, Android
adaptive + monochrome, web favicons + manifest; add `macos` or `png` with `--platforms`) and a
512 px preview PNG. Sources: `--icon <id>`, `--text`, or `--image <png|svg>`. Styling: `--preset`,
`--background`, `--glyph-color`, `--size`, `--shape`. Every command takes `--json`; usage errors
exit 2 with a `help:` line. Library icons report their set's license: check sets that need
attribution (CC BY) before shipping.

`icony mcp` is a stdio MCP server. `search_icons` and `export_icon` run in-process; the paid AI
tools (`status`, `preview_prompt`, `generate`, `refine`, `remove_background`, `history`) go to the
dev server, which it starts itself when nothing answers on `ICONY_URL` (default
`http://localhost:4100`). Paid tools take a `max_usd` and refuse when the estimate is higher.

```bash
hermes mcp add icony --command node --args /path/to/icony/dist-cli/icony.js mcp
claude mcp add -s user icony -- node /path/to/icony/dist-cli/icony.js mcp
```

The dev server keeps the same export over HTTP (`POST /api/export` with `icon`, `text`, `ai_item`
+ `ai_as`, or `image_path`), used by the UI tooling and curl.

`pnpm test` builds the CLI and drives it end to end (search, export, usage errors, MCP).

## Notes

- Text rendering uses fonts installed on this Mac; exported PNGs match what
  you see because rasterization happens in the same browser.
- Each set's license is shown under the grid with a link. Most are MIT/Apache/
  CC BY; check before shipping brand logos (Simple Icons, Logos).
- `pnpm build` produces a static bundle, but the icon API lives in the dev
  middleware, so run it with `pnpm dev` (or add a tiny server if you want a
  production build).
