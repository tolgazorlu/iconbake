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
pnpm dev        # http://localhost:5178
```

## What it does

- **Icon source**: clipart (any set, or search all 380k at once), text (system
  fonts, weight, italic, multi-line, emoji), or an uploaded SVG/PNG.
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

## Notes

- Text rendering uses fonts installed on this Mac; exported PNGs match what
  you see because rasterization happens in the same browser.
- Each set's license is shown under the grid with a link. Most are MIT/Apache/
  CC BY; check before shipping brand logos (Simple Icons, Logos).
- `pnpm build` produces a static bundle, but the icon API lives in the dev
  middleware, so run it with `pnpm dev` (or add a tiny server if you want a
  production build).
