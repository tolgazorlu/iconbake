import { useRef, useState, type DragEvent } from "react";
import { useStore } from "../lib/store";
import { FONTS, fontLabel } from "../lib/presets";
import type { BgType, Effect, Shape, Texture } from "../lib/types";
import { IconPicker } from "./IconPicker";
import { Color, Icons, Row, Section, Seg, Slider, Toggle } from "./ui";

export function Sidebar() {
  const state = useStore((s) => s.state);
  const set = useStore((s) => s.set);
  const setFg = useStore((s) => s.setFg);
  const setBg = useStore((s) => s.setBg);
  const { fg, bg } = state;
  const kind = fg.source.kind;

  return (
    <aside className="sidebar">
      <Section title="Icon">
        <Row label="Source">
          <Seg
            value={kind}
            onChange={(k) => {
              if (k === kind) return;
              if (k === "clipart") setFg({ source: { kind: "clipart", prefix: "lucide", name: "rocket", body: "", width: 24, height: 24 }, colorEnabled: true });
              if (k === "text") setFg({ source: { kind: "text", text: "Ic", font: FONTS[0], weight: 700, italic: false }, colorEnabled: true });
              if (k === "image") setFg({ source: { kind: "image", dataUrl: "", natural: { w: 1, h: 1 } }, colorEnabled: false });
            }}
            options={[
              { value: "clipart", label: "Clipart" },
              { value: "text", label: "Text" },
              { value: "image", label: "Image" },
            ]}
          />
        </Row>
        {kind === "clipart" && <IconPicker />}
        {kind === "text" && fg.source.kind === "text" && <TextSource />}
        {kind === "image" && fg.source.kind === "image" && <ImageSource />}
      </Section>

      <Section
        title="Glyph"
        right={
          kind !== "image" && (
            <span style={{ display: "flex", gap: 6, alignItems: "center", textTransform: "none", letterSpacing: 0, fontWeight: 400 }}>
              Recolor <Toggle checked={fg.colorEnabled} onChange={(v) => setFg({ colorEnabled: v })} />
            </span>
          )
        }
      >
        {fg.colorEnabled && kind !== "image" && (
          <Row label="Color">
            <Color value={fg.color} onChange={(c) => setFg({ color: c })} />
          </Row>
        )}
        <Row label="Padding">
          <Slider value={fg.padding} onChange={(v) => setFg({ padding: v })} min={0} max={45} unit="%" />
        </Row>
        <Row label="Rotate">
          <Slider value={fg.rotate} onChange={(v) => setFg({ rotate: v })} min={-180} max={180} unit="°" />
        </Row>
        <Row label="Offset">
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <Slider value={fg.offsetX} onChange={(v) => setFg({ offsetX: v })} min={-25} max={25} />
            <Slider value={fg.offsetY} onChange={(v) => setFg({ offsetY: v })} min={-25} max={25} />
          </div>
        </Row>
        {kind === "clipart" && (
          <Row label="Stroke">
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <Toggle checked={fg.strokeWidth != null} onChange={(v) => setFg({ strokeWidth: v ? 2 : null })} />
              {fg.strokeWidth != null && <Slider value={fg.strokeWidth} onChange={(v) => setFg({ strokeWidth: v })} min={0.5} max={4} step={0.25} />}
            </div>
            <div className="hint">Only affects stroke-based sets (Lucide, Tabler, Phosphor…)</div>
          </Row>
        )}
        <Row label="Opacity">
          <Slider value={Math.round(fg.opacity * 100)} onChange={(v) => setFg({ opacity: v / 100 })} min={10} max={100} unit="%" />
        </Row>
        <Row label="Effect">
          <Seg<Effect>
            block
            value={fg.effect}
            onChange={(e) => setFg({ effect: e })}
            options={[
              { value: "none", label: "None" },
              { value: "drop", label: "Shadow" },
              { value: "cast", label: "Long" },
              { value: "score", label: "Score" },
              { value: "emboss", label: "Emboss" },
            ]}
          />
        </Row>
        <Row label="Flip">
          <button type="button" className="btn icon" onClick={() => setFg({ scaleX: fg.scaleX * -1 })} title="Flip horizontally">
            {Icons.flip}
          </button>
        </Row>
      </Section>

      <Section title="Background">
        <Row label="Type">
          <Seg<BgType>
            block
            value={bg.type}
            onChange={(t) => setBg({ type: t })}
            options={[
              { value: "color", label: "Color" },
              { value: "gradient", label: "Gradient" },
              { value: "mesh", label: "Mesh" },
              { value: "image", label: "Image" },
              { value: "none", label: "None" },
            ]}
          />
        </Row>
        {bg.type === "color" && (
          <Row label="Color">
            <Color value={bg.color} onChange={(c) => setBg({ color: c })} />
          </Row>
        )}
        {bg.type === "gradient" && (
          <>
            <Row label="From">
              <Color value={bg.gradient.from} onChange={(c) => setBg({ gradient: { ...bg.gradient, from: c } })} swatches={false} />
            </Row>
            <Row label="To">
              <Color value={bg.gradient.to} onChange={(c) => setBg({ gradient: { ...bg.gradient, to: c } })} swatches={false} />
            </Row>
            <Row label="Kind">
              <Seg
                value={bg.gradient.kind}
                onChange={(k) => setBg({ gradient: { ...bg.gradient, kind: k } })}
                options={[
                  { value: "linear", label: "Linear" },
                  { value: "radial", label: "Radial" },
                ]}
              />
            </Row>
            {bg.gradient.kind === "linear" && (
              <Row label="Angle">
                <Slider value={bg.gradient.angle} onChange={(v) => setBg({ gradient: { ...bg.gradient, angle: v } })} min={0} max={360} unit="°" />
              </Row>
            )}
            <Row label="">
              <button type="button" className="btn" onClick={() => setBg({ gradient: { ...bg.gradient, from: bg.gradient.to, to: bg.gradient.from } })}>
                Swap colors
              </button>
            </Row>
          </>
        )}
        {bg.type === "mesh" && (
          <>
            <Row label="Colors">
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {bg.mesh.colors.map((c, i) => (
                  <span key={i} className="color">
                    <span className="swatch" style={{ background: c }}>
                      <input
                        type="color"
                        value={c}
                        onChange={(e) => {
                          const colors = [...bg.mesh.colors];
                          colors[i] = e.target.value;
                          setBg({ mesh: { ...bg.mesh, colors } });
                        }}
                        aria-label={`Mesh color ${i + 1}`}
                      />
                    </span>
                  </span>
                ))}
              </div>
            </Row>
            <Row label="Seed">
              <div style={{ display: "flex", gap: 8 }}>
                <Slider value={bg.mesh.seed} onChange={(v) => setBg({ mesh: { ...bg.mesh, seed: v } })} min={1} max={99} />
                <button type="button" className="btn icon" title="Shuffle" onClick={() => setBg({ mesh: { ...bg.mesh, seed: Math.floor(Math.random() * 99) + 1 } })}>
                  {Icons.shuffle}
                </button>
              </div>
            </Row>
          </>
        )}
        {bg.type === "image" && <BgImage />}
        {bg.type !== "none" && bg.type !== "image" && (
          <>
            <Row label="Texture">
              <select className="input" value={bg.texture} onChange={(e) => setBg({ texture: e.target.value as Texture })}>
                {(["none", "polka", "grid", "stripes", "cross", "halftone", "waves", "concentric", "noise"] as Texture[]).map((t) => (
                  <option key={t} value={t}>
                    {t[0].toUpperCase() + t.slice(1)}
                  </option>
                ))}
              </select>
            </Row>
            {bg.texture !== "none" && (
              <Row label="Strength">
                <Slider value={Math.round(bg.textureOpacity * 100)} onChange={(v) => setBg({ textureOpacity: v / 100 })} min={2} max={60} unit="%" />
              </Row>
            )}
          </>
        )}
        <Row label="Border">
          <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8, alignItems: "center" }}>
            <Slider value={bg.border.width} onChange={(v) => setBg({ border: { ...bg.border, width: v } })} min={0} max={12} step={0.5} unit="%" />
            <span className="color">
              <span className="swatch" style={{ background: bg.border.color }}>
                <input type="color" value={bg.border.color} onChange={(e) => setBg({ border: { ...bg.border, color: e.target.value } })} aria-label="Border color" />
              </span>
            </span>
          </div>
        </Row>
      </Section>

      <Section title="Shape">
        <Row label="Mask">
          <Seg<Shape>
            block
            value={state.shape}
            onChange={(s) => set({ shape: s })}
            options={[
              { value: "squircle", label: "Squircle" },
              { value: "rounded", label: "Rounded" },
              { value: "circle", label: "Circle" },
              { value: "square", label: "Square" },
            ]}
          />
        </Row>
        {state.shape === "rounded" && (
          <Row label="Radius">
            <Slider value={state.radius} onChange={(v) => set({ radius: v })} min={0} max={50} unit="%" />
          </Row>
        )}
        <div className="hint">iOS and macOS always use Apple's mask; this shape applies to Android legacy, Web and PNG.</div>
      </Section>

      <Section title="Export">
        <Row label="App name">
          <input className="input" value={state.appName} placeholder={state.filename} onChange={(e) => set({ appName: e.target.value })} />
        </Row>
        <Row label="Filename">
          <input className="input" value={state.filename} onChange={(e) => set({ filename: e.target.value.replace(/[^a-zA-Z0-9_-]/g, "") })} spellCheck={false} />
        </Row>
        <Row label="Badge">
          <input className="input" value={state.badge} placeholder="DEV, BETA…" maxLength={8} onChange={(e) => set({ badge: e.target.value })} />
        </Row>
        <Row label="Targets">
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {(
              [
                ["android", "Android"],
                ["ios", "iOS"],
                ["macos", "macOS"],
                ["web", "Web"],
                ["png", "PNG + SVG"],
              ] as const
            ).map(([p, label]) => {
              const on = state.platforms.includes(p);
              return (
                <button
                  key={p}
                  type="button"
                  className="btn"
                  aria-pressed={on}
                  style={on ? { background: "var(--tint)", color: "var(--on-tint)" } : undefined}
                  onClick={() => set({ platforms: on ? state.platforms.filter((x) => x !== p) : [...state.platforms, p] })}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </Row>
      </Section>
    </aside>
  );
}

function TextSource() {
  const fg = useStore((s) => s.state.fg);
  const setFg = useStore((s) => s.setFg);
  if (fg.source.kind !== "text") return null;
  const src = fg.source;
  const up = (p: Partial<typeof src>) => setFg({ source: { ...src, ...p } });
  return (
    <>
      <Row label="Text">
        <textarea className="input" value={src.text} onChange={(e) => up({ text: e.target.value.slice(0, 40) })} rows={2} />
        <div className="hint">Line breaks make multi-line marks. Emoji work too.</div>
      </Row>
      <Row label="Font">
        <select className="input" value={src.font} onChange={(e) => up({ font: e.target.value })} style={{ fontFamily: src.font }}>
          {FONTS.map((f) => (
            <option key={f} value={f} style={{ fontFamily: f }}>
              {fontLabel(f)}
            </option>
          ))}
        </select>
        <input className="input" style={{ marginTop: 6 }} placeholder="or any installed font name" onBlur={(e) => e.target.value && up({ font: e.target.value })} />
      </Row>
      <Row label="Weight">
        <Slider value={src.weight} onChange={(v) => up({ weight: v })} min={100} max={900} step={100} />
      </Row>
      <Row label="Italic">
        <Toggle checked={src.italic} onChange={(v) => up({ italic: v })} />
      </Row>
    </>
  );
}

function useFileDrop(onFile: (dataUrl: string, w: number, h: number) => void) {
  const [over, setOver] = useState(false);
  const ref = useRef<HTMLInputElement>(null);
  const handle = (file: File | undefined) => {
    if (!file) return;
    const r = new FileReader();
    r.onload = () => {
      const url = String(r.result);
      const img = new Image();
      img.onload = () => onFile(url, img.naturalWidth, img.naturalHeight);
      img.src = url;
    };
    r.readAsDataURL(file);
  };
  return {
    over,
    ref,
    props: {
      className: `drop ${over ? "over" : ""}`,
      onClick: () => ref.current?.click(),
      onDragOver: (e: DragEvent) => {
        e.preventDefault();
        setOver(true);
      },
      onDragLeave: () => setOver(false),
      onDrop: (e: DragEvent) => {
        e.preventDefault();
        setOver(false);
        handle(e.dataTransfer.files[0]);
      },
    },
    inputProps: {
      ref,
      type: "file" as const,
      accept: "image/*",
      onChange: (e: React.ChangeEvent<HTMLInputElement>) => handle(e.target.files?.[0]),
    },
  };
}

function ImageSource() {
  const fg = useStore((s) => s.state.fg);
  const setFg = useStore((s) => s.setFg);
  const drop = useFileDrop((dataUrl, w, h) => setFg({ source: { kind: "image", dataUrl, natural: { w, h } } }));
  const has = fg.source.kind === "image" && fg.source.dataUrl;
  return (
    <Row full>
      <div {...drop.props}>
        <input {...drop.inputProps} />
        {has ? <img src={(fg.source as { dataUrl: string }).dataUrl} alt="" /> : <span>Drop an SVG or PNG, or click to choose</span>}
      </div>
      <div className="hint">SVG keeps its own colors; use Padding to fit. Transparent PNGs work best.</div>
    </Row>
  );
}

function BgImage() {
  const bg = useStore((s) => s.state.bg);
  const setBg = useStore((s) => s.setBg);
  const drop = useFileDrop((dataUrl) => setBg({ image: { dataUrl } }));
  return (
    <Row full>
      <div {...drop.props}>
        <input {...drop.inputProps} />
        {bg.image ? <img src={bg.image.dataUrl} alt="" /> : <span>Drop a background image</span>}
      </div>
    </Row>
  );
}
