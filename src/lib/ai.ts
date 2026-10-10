// Shared by the browser UI and the dev-server fal plugin: models, styles and the prompt builder.
// Keep this file free of DOM and Node APIs.

export type AiMode = "full" | "glyph";

export interface AiModel {
  id: string; // key used by the UI and the API
  label: string;
  endpoint: string; // fal model id for text-to-image
  editEndpoint: string | null; // fal model id that accepts image_urls (refine / style reference)
  usd: number; // estimated cost per image, from fal's llms.txt pricing (checked 2026-10-10)
  note: string;
  vector?: boolean; // returns SVG
  nativeTransparent?: boolean; // can return a transparent background without a cut-out pass
}

export const AI_MODELS: AiModel[] = [
  {
    id: "draft",
    label: "FLUX.2 Klein",
    endpoint: "fal-ai/flux-2/klein/9b",
    editEndpoint: "fal-ai/flux-2/klein/9b/edit",
    usd: 0.007,
    note: "Draft quality, under a second. Use it to explore ideas cheaply.",
  },
  {
    id: "nb2",
    label: "Nano Banana 2",
    endpoint: "fal-ai/nano-banana-2",
    editEndpoint: "fal-ai/nano-banana-2/edit",
    usd: 0.08,
    note: "Good default. Strong prompt following and clean icon compositions.",
  },
  {
    id: "nbpro",
    label: "Nano Banana Pro",
    endpoint: "fal-ai/nano-banana-pro",
    editEndpoint: "fal-ai/nano-banana-pro/edit",
    usd: 0.15,
    note: "Best finish for painterly and 3D styles. Slowest and most expensive.",
  },
  {
    id: "gpt",
    label: "GPT Image 1.5",
    endpoint: "fal-ai/gpt-image-1.5",
    editEndpoint: "fal-ai/gpt-image-1.5/edit",
    usd: 0.04,
    note: "Medium quality. Native transparent background for glyph mode.",
    nativeTransparent: true,
  },
  {
    id: "vector",
    label: "Recraft V3 vector",
    endpoint: "fal-ai/recraft/v3/text-to-image",
    editEndpoint: null,
    usd: 0.08,
    note: "Returns SVG. Only for the flat and line styles.",
    vector: true,
  },
];

/** Background removal used for glyph mode on models without native transparency. */
export const CUTOUT = { endpoint: "fal-ai/birefnet/v2", usd: 0.002 };

export interface AiStyle {
  id: string;
  label: string;
  hint: string; // one line shown in the UI
  render: string; // rendering style sentence
  backdrop: string; // default background for full mode
  model: string; // recommended model id
  recraft?: string; // Recraft substyle when the vector model is used
  vectorOnly?: boolean;
}

// Each style names a material and a light, not a vibe: concrete looks hold up across subjects.
// Toy, painterly and monolith came out of real icon rounds (Bricky Builders, Bungalove, neutral
// house taste); the rest follow what current icon generators and store charts lean on.
export const AI_STYLES: AiStyle[] = [
  {
    id: "monolith",
    label: "Monolith",
    hint: "One matte object, soft studio light, near-black",
    render:
      "a single sculpted object made of matte soft-touch material, rendered like a premium product photo, soft studio key light from the top left, gentle rim light, subtle ambient occlusion, restrained detail",
    backdrop: "solid near-black charcoal (#111111) with a faint soft glow behind the subject and a slight vignette",
    model: "nb2",
  },
  {
    id: "porcelain",
    label: "Porcelain",
    hint: "Glossy white ceramic on warm grey",
    render:
      "a single object made of glossy white porcelain with tiny reflections, smooth rounded edges, soft diffused daylight, calm and premium, almost monochrome",
    backdrop: "flat warm light grey (#E9E7E2) with a soft contact shadow under the object",
    model: "nb2",
  },
  {
    id: "glass",
    label: "Frosted glass",
    hint: "iOS-style glass object over a vivid backdrop",
    render:
      "a single object made of thick frosted glass with crisp specular edge highlights and gentle refraction, the main symbol stays opaque and sharp, depth like an iOS 26 Liquid Glass icon",
    backdrop: "one saturated smooth gradient that shows through the glass, no other objects",
    model: "nbpro",
  },
  {
    id: "toy",
    label: "Glossy toy",
    hint: "Casual-game 3D, chunky and shiny",
    render:
      "chunky ultra-glossy 3D toy render like candy or polished plastic, strong white highlights on edges, soft ambient occlusion, thin darker outline around the silhouette, very saturated colours, high contrast, in the style of top-grossing casual mobile game icons",
    backdrop: "one flat bright colour with a soft lighter glow behind the subject and a slight dark vignette",
    model: "nbpro",
  },
  {
    id: "clay",
    label: "Clay",
    hint: "Hand-made plasticine, visible fingerprints",
    render:
      "hand-made plasticine clay model, soft rounded forms, subtle fingerprints and tool marks, matte surface, warm soft light, playful stop-motion look",
    backdrop: "flat pastel colour that complements the clay, soft shadow under the model",
    model: "nb2",
  },
  {
    id: "painterly",
    label: "Painterly",
    hint: "Hand-painted anime background art",
    render:
      "hand-painted anime illustration like Studio Ghibli background art, soft painterly shading, brownish ink linework of varying weight, textured brush strokes, warm cinematic light",
    backdrop: "simple dusk sky gradient, painted, kept low in detail so the subject reads first",
    model: "nbpro",
  },
  {
    id: "paper",
    label: "Paper cut",
    hint: "Layered paper with real depth shadows",
    render:
      "layered paper-cut craft, three to five stacked layers of matte coloured card with clean cut edges and soft drop shadows between layers, subtle paper fibre texture",
    backdrop: "the deepest paper layer in a darker shade of the main colour",
    model: "nb2",
  },
  {
    id: "diorama",
    label: "Diorama",
    hint: "Isometric miniature on a tile",
    render:
      "isometric miniature diorama on a small square tile, tilt-shift macro photo look, tiny handcrafted details, soft daylight, crisp shadows",
    backdrop: "flat soft colour, the tile floats in the centre",
    model: "nbpro",
  },
  {
    id: "enamel",
    label: "Enamel pin",
    hint: "Gold outline, flat glossy enamel fills",
    render:
      "hard enamel pin, polished gold metal outlines, flat glossy enamel colour fills, a small specular glint, photographed straight on",
    backdrop: "flat matte fabric-like colour",
    model: "nb2",
  },
  {
    id: "metal",
    label: "Metal",
    hint: "Brushed aluminium with an engraved symbol",
    render:
      "precision machined brushed aluminium with a deeply engraved and slightly inset symbol, chamfered edges catching light, skeuomorphic tool-like realism",
    backdrop: "dark graphite gradient, studio lit",
    model: "nbpro",
  },
  {
    id: "riso",
    label: "Risograph",
    hint: "Two-ink print, grain and misregistration",
    render:
      "two-colour risograph print, flat ink shapes, visible grain and halftone, slight misregistration between inks, bold simple forms",
    backdrop: "uncoated off-white paper (#F4F1EA)",
    model: "nb2",
  },
  {
    id: "pixel",
    label: "Pixel",
    hint: "Crisp 32×32 pixel art",
    render: "crisp 32x32 pixel art upscaled with hard edges, limited 8-colour palette, no anti-aliasing, retro game sprite",
    backdrop: "flat single colour",
    model: "nb2",
  },
  {
    id: "flat",
    label: "Flat mark",
    hint: "Bold geometric mark, two or three colours (SVG)",
    render: "bold flat vector mark built from simple geometric shapes, two or three solid colours, no gradients, no outlines, generous negative space",
    backdrop: "flat solid colour",
    model: "vector",
    recraft: "vector_illustration/roundish_flat",
  },
  {
    id: "line",
    label: "Line mark",
    hint: "Single-weight monoline symbol (SVG)",
    render: "monoline vector symbol, one consistent thick stroke weight, rounded caps and joins, no fills, geometric and balanced",
    backdrop: "flat solid colour",
    model: "vector",
    recraft: "vector_illustration/line_art",
  },
];

export type AiPalette = "auto" | "neutral" | "brand";

export interface AiRequest {
  subject: string;
  style: string;
  mode: AiMode;
  model: string;
  n: number;
  palette?: AiPalette;
  brand?: string; // hex, when palette = brand
  backdrop?: string; // overrides the style backdrop in full mode
  prompt?: string; // full prompt override (advanced)
  refImage?: string; // data URI: style reference, switches to the edit endpoint
}

export function findModel(id: string) {
  return AI_MODELS.find((m) => m.id === id) ?? AI_MODELS[1];
}

export function findStyle(id: string) {
  return AI_STYLES.find((s) => s.id === id) ?? AI_STYLES[0];
}

/** Prompt formula: subject, style, palette, background, format rules. */
export function buildPrompt(r: AiRequest): string {
  if (r.prompt?.trim()) return r.prompt.trim();
  const style = findStyle(r.style);
  const subject = r.subject.trim() || "a simple recognisable object";
  const palette =
    r.palette === "neutral"
      ? "Palette: neutral only, black, white and greys, no hue."
      : r.palette === "brand" && r.brand
        ? `Palette: built around ${r.brand} with neutral support colours.`
        : "";
  const ref = r.refImage ? "Use the attached image only as a style reference: copy its rendering, palette mood and lighting, never its subject. " : "";
  const rules = "No text, no letters, no numbers, no logos, no watermark, no border, no frame, no rounded corners, no device mockup.";
  if (r.mode === "glyph") {
    return [
      `${ref}A single isolated object for an app icon: ${subject}.`,
      `Style: ${style.render}.`,
      palette,
      "Centred, front-facing, filling about 80% of a square canvas, one clear silhouette that still reads at 60 pixels.",
      "Plain pure white background (#FFFFFF), no ground shadow, no scenery, nothing else in the image.",
      rules,
    ]
      .filter(Boolean)
      .join(" ");
  }
  return [
    `${ref}Square 1:1 app icon artwork, full-bleed edge to edge. Subject: ${subject}.`,
    "One single subject, centred, about 65% of the canvas, front-facing, a clear silhouette that still reads at 60 pixels.",
    `Style: ${style.render}.`,
    palette,
    `Background: ${r.backdrop?.trim() || style.backdrop}.`,
    rules,
  ]
    .filter(Boolean)
    .join(" ");
}

export function estimateUsd(r: Pick<AiRequest, "model" | "mode" | "n">) {
  const m = findModel(r.model);
  const cut = r.mode === "glyph" && !m.nativeTransparent && !m.vector ? CUTOUT.usd : 0;
  return (m.usd + cut) * Math.max(1, Math.min(4, r.n));
}

export interface AiItem {
  id: string; // file name in the generations folder
  url: string; // served by the dev server
  file: string; // absolute path on disk
  width: number;
  height: number;
  format: "png" | "svg" | "jpeg" | "webp";
}

export interface AiRun {
  id: string;
  at: string; // ISO time
  kind: "generate" | "refine" | "cutout";
  mode: AiMode;
  model: string;
  style: string;
  subject: string;
  prompt: string;
  usd: number; // estimated
  items: AiItem[];
  parent?: string; // item id that was refined or cut out
  error?: string; // set when a paid call succeeded but a later step failed
}
