// Shape paths are defined in a 0..1 unit square and scaled at render time.

export function squirclePath(size: number, n = 5, inset = 0): string {
  // iOS-style superellipse |x|^n + |y|^n = 1, sampled densely.
  const r = size / 2 - inset;
  const cx = size / 2;
  const cy = size / 2;
  const pts: string[] = [];
  const steps = 128;
  for (let i = 0; i < steps; i++) {
    const t = (i / steps) * Math.PI * 2;
    const c = Math.cos(t);
    const s = Math.sin(t);
    const x = Math.sign(c) * Math.pow(Math.abs(c), 2 / n) * r + cx;
    const y = Math.sign(s) * Math.pow(Math.abs(s), 2 / n) * r + cy;
    pts.push(`${i === 0 ? "M" : "L"}${x.toFixed(3)} ${y.toFixed(3)}`);
  }
  return pts.join("") + "Z";
}

export function roundedRectPath(size: number, radiusPct: number, inset = 0): string {
  const s = size - inset * 2;
  const r = Math.min(s / 2, (radiusPct / 100) * s);
  const x = inset;
  const y = inset;
  return `M${x + r} ${y}H${x + s - r}A${r} ${r} 0 0 1 ${x + s} ${y + r}V${y + s - r}A${r} ${r} 0 0 1 ${x + s - r} ${y + s}H${x + r}A${r} ${r} 0 0 1 ${x} ${y + s - r}V${y + r}A${r} ${r} 0 0 1 ${x + r} ${y}Z`;
}

export function circlePath(size: number, inset = 0): string {
  const r = size / 2 - inset;
  const c = size / 2;
  return `M${c - r} ${c}A${r} ${r} 0 1 0 ${c + r} ${c}A${r} ${r} 0 1 0 ${c - r} ${c}Z`;
}

export type ShapeKind = "square" | "squircle" | "circle" | "rounded" | "ios" | "macos";

export function shapePath(kind: ShapeKind, size: number, radiusPct = 22): string {
  switch (kind) {
    case "square":
      return roundedRectPath(size, 0);
    case "rounded":
      return roundedRectPath(size, radiusPct);
    case "squircle":
    case "ios":
      // Apple's icon mask is ~22.37% corner with continuous curvature.
      return squirclePath(size, 4.6);
    case "circle":
      return circlePath(size);
    case "macos":
      // macOS Big Sur+: rounded rect at 80.4% of canvas, radius ~22.5% of that.
      return roundedRectPath(size, 22.5, size * 0.098);
  }
}
