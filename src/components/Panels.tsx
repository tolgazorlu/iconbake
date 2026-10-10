import { compose } from "../lib/compose";
import { FONTS, PRESETS, fontLabel } from "../lib/presets";
import { useStore } from "../lib/store";
import { useSetSource } from "../lib/source";
import type { BgType, Effect, IconSource, Platform, Shape, Texture } from "../lib/types";
import { IconPicker } from "./IconPicker";
import { useFileDrop } from "./useFileDrop";
import { Color, Disclosure, Icons, Row, Section, Seg, Slider, Toggle } from "./ui";

// ---------- shared ----------

export function PanelHead({ title, right }: { title: string; right?: React.ReactNode }) {
  return (
    <header className="panel-h">
      <h2>{title}</h2>
      {right}
    </header>
  );
}

function Svg({ html, className }: { html: string; className?: string }) {
  return <span className={className} dangerouslySetInnerHTML={{ __html: html.replace(/width="\d+" height="\d+"/, 'width="100%" height="100%"') }} />;
}

// ---------- library ----------

export function LibraryPanel() {
  return (
    <>
      <PanelHead title="Icon library" />
      <div className="panel-b fill">
        <IconPicker />
      </div>
    </>
  );
}

// ---------- text ----------

export function TextPanel() {
  const fg = useStore((s) => s.state.fg);
  const setFg = useStore((s) => s.setFg);
  const setSource = useSetSource();
  const src = fg.source.kind === "text" ? fg.source : null;
  const up = (p: Partial<Extract<IconSource, { kind: "text" }>>) => src && setFg({ source: { ...src, ...p } });
  return (
    <>
      <PanelHead title="Text" />
      <div className="panel-b">
        {!src ? (
          <div className="empty-card">
            <p>Use letters, a monogram or an emoji as the glyph.</p>
            <button type="button" className="btn primary" onClick={() => setSource({ kind: "text", text: "Ic", font: FONTS[0], weight: 700, italic: false }, true)}>
              Use text
            </button>
          </div>
        ) : (
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
        )}
      </div>
    </>
  );
}

// ---------- upload ----------

export function UploadPanel() {
  const fg = useStore((s) => s.state.fg);
  const setSource = useSetSource();
  const drop = useFileDrop((dataUrl, w, h) => setSource({ kind: "image", dataUrl, natural: { w, h } }, false));
  const has = fg.source.kind === "image" && fg.source.dataUrl;
  return (
    <>
      <PanelHead title="Upload" />
      <div className="panel-b">
        <div {...drop.props}>
          <input {...drop.inputProps} />
          {has ? <img src={(fg.source as { dataUrl: string }).dataUrl} alt="" /> : <span>Drop an SVG or PNG, or click to choose</span>}
        </div>
        <div className="hint">Becomes the glyph on your background. Transparent PNG or SVG works best. For a full-bleed picture use Style → Background → Image.</div>
      </div>
    </>
  );
}

// ---------- style ----------

export function StylePanel() {
  const state = useStore((s) => s.state);
  const set = useStore((s) => s.set);
  const setFg = useStore((s) => s.setFg);
  const setBg = useStore((s) => s.setBg);
  const replace = useStore((s) => s.replace);
  const { fg, bg } = state;
  const kind = fg.source.kind;
  const artwork = kind === "none";
  const recolorable = kind === "clipart" || kind === "text";
  const bgDrop = useFileDrop((dataUrl) => setBg({ image: { dataUrl } }));

  return (
    <>
      <PanelHead title="Style" />
      <div className="panel-b">
        {!artwork && (
          <Section title="Looks">
            <div className="looks">
              {PRESETS.map((pr) => {
                const s = pr.apply(state);
                return (
                  <button key={pr.id} type="button" className="look" onClick={() => replace(s)} title={pr.label}>
                    <Svg html={compose(s, { platform: "png", size: 96, id: `p-${pr.id}` }).svg} className="look-thumb" />
                    <span>{pr.label}</span>
                  </button>
                );
              })}
            </div>
          </Section>
        )}

        {artwork ? (
          <div className="note">This icon is a full artwork. Pick a glyph from the library, text or upload to draw on top of it.</div>
        ) : (
          <Section
            title="Glyph"
            right={
              recolorable && (
                <label className="inline-toggle">
                  Recolor <Toggle checked={fg.colorEnabled} onChange={(v) => setFg({ colorEnabled: v })} />
                </label>
              )
            }
          >
            {fg.colorEnabled && recolorable && (
              <Row label="Color">
                <Color value={fg.color} onChange={(c) => setFg({ color: c })} />
              </Row>
            )}
            <Row label="Size">
              <Slider value={100 - fg.padding * 2} onChange={(v) => setFg({ padding: (100 - v) / 2 })} min={10} max={100} unit="%" />
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
                  { value: "emboss", label: "Emboss" },
                ]}
              />
            </Row>
          </Section>
        )}

        <Section title="Background">
          <Row label="Fill">
            <Seg<BgType>
              block
              value={bg.type}
              onChange={(t) => setBg({ type: t })}
              options={[
                { value: "color", label: "Solid" },
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
            </>
          )}
          {bg.type === "mesh" && (
            <>
              <Row label="Colors">
                <div className="mesh-colors">
                  {bg.mesh.colors.map((c, i) => (
                    <span key={i} className="swatch" style={{ background: c }}>
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
                  ))}
                  <button type="button" className="btn icon" title="Shuffle" onClick={() => setBg({ mesh: { ...bg.mesh, seed: Math.floor(Math.random() * 99) + 1 } })}>
                    {Icons.shuffle}
                  </button>
                </div>
              </Row>
            </>
          )}
          {bg.type === "image" && (
            <Row full>
              <div {...bgDrop.props}>
                <input {...bgDrop.inputProps} />
                {bg.image ? <img src={bg.image.dataUrl} alt="" /> : <span>Drop a background image</span>}
              </div>
            </Row>
          )}
        </Section>

        <Section title="Shape">
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
          {state.shape === "rounded" && (
            <Row label="Radius">
              <Slider value={state.radius} onChange={(v) => set({ radius: v })} min={0} max={50} unit="%" />
            </Row>
          )}
          <div className="hint">iOS and macOS always use Apple's mask. This shape is for Android legacy, web and PNG.</div>
        </Section>

        <Disclosure title="Fine-tune">
          {!artwork && (
            <>
              <Row label="Rotate">
                <Slider value={fg.rotate} onChange={(v) => setFg({ rotate: v })} min={-180} max={180} unit="°" />
              </Row>
              <Row label="Move X">
                <Slider value={fg.offsetX} onChange={(v) => setFg({ offsetX: v })} min={-25} max={25} />
              </Row>
              <Row label="Move Y">
                <Slider value={fg.offsetY} onChange={(v) => setFg({ offsetY: v })} min={-25} max={25} />
              </Row>
              <Row label="Opacity">
                <Slider value={Math.round(fg.opacity * 100)} onChange={(v) => setFg({ opacity: v / 100 })} min={10} max={100} unit="%" />
              </Row>
              {kind === "clipart" && (
                <Row label="Stroke">
                  <div className="inline">
                    <Toggle checked={fg.strokeWidth != null} onChange={(v) => setFg({ strokeWidth: v ? 2 : null })} />
                    {fg.strokeWidth != null && <Slider value={fg.strokeWidth} onChange={(v) => setFg({ strokeWidth: v })} min={0.5} max={4} step={0.25} />}
                  </div>
                </Row>
              )}
              <Row label="Flip">
                <button type="button" className="btn icon" onClick={() => setFg({ scaleX: fg.scaleX * -1 })} title="Flip horizontally">
                  {Icons.flip}
                </button>
              </Row>
            </>
          )}
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
            <div className="inline">
              <Slider value={bg.border.width} onChange={(v) => setBg({ border: { ...bg.border, width: v } })} min={0} max={12} step={0.5} unit="%" />
              <span className="swatch" style={{ background: bg.border.color }}>
                <input type="color" value={bg.border.color} onChange={(e) => setBg({ border: { ...bg.border, color: e.target.value } })} aria-label="Border color" />
              </span>
            </div>
          </Row>
        </Disclosure>
      </div>
    </>
  );
}

// ---------- export ----------

const TARGETS: [Platform, string, string][] = [
  ["ios", "iOS", "AppIcon.appiconset with dark and tinted, Expo copies"],
  ["android", "Android", "Adaptive layers per density, monochrome, Play 512"],
  ["web", "Web", "favicon.ico, SVG, apple-touch, manifest"],
  ["macos", "macOS", "AppIcon.appiconset 16 to 1024"],
  ["png", "PNG + SVG", "Loose sizes, composed SVG, bare glyph"],
];

export function ExportPanel({
  busy,
  onDownload,
  onCopy,
  onPng,
  onSvg,
  onSave,
  onOpen,
  onReset,
}: {
  busy: string | null;
  onDownload: () => void;
  onCopy: () => void;
  onPng: () => void;
  onSvg: () => void;
  onSave: () => void;
  onOpen: () => void;
  onReset: () => void;
}) {
  const state = useStore((s) => s.state);
  const set = useStore((s) => s.set);
  return (
    <>
      <PanelHead title="Export" />
      <div className="panel-b">
        <Row label="App name">
          <input className="input" value={state.appName} placeholder={state.filename} onChange={(e) => set({ appName: e.target.value })} />
        </Row>
        <Row label="File name">
          <input className="input" value={state.filename} onChange={(e) => set({ filename: e.target.value.replace(/[^a-zA-Z0-9_-]/g, "") })} spellCheck={false} />
        </Row>
        <Row label="Badge">
          <input className="input" value={state.badge} placeholder="DEV, BETA…" maxLength={8} onChange={(e) => set({ badge: e.target.value })} />
        </Row>

        <div className="targets">
          {TARGETS.map(([p, label, desc]) => {
            const on = state.platforms.includes(p);
            return (
              <button
                key={p}
                type="button"
                className="target"
                aria-pressed={on}
                onClick={() => set({ platforms: on ? state.platforms.filter((x) => x !== p) : [...state.platforms, p] })}
              >
                <span className="check">{on && Icons.check}</span>
                <span>
                  <b>{label}</b>
                  <small>{desc}</small>
                </span>
              </button>
            );
          })}
        </div>

        <button type="button" className="btn primary wide" onClick={onDownload} disabled={!!busy || state.platforms.length === 0}>
          {Icons.download} {busy ? `${busy}…` : "Download zip"}
          <span className="kbd">⌘S</span>
        </button>

        <div className="btn-grid">
          <button type="button" className="btn" onClick={onCopy}>
            Copy PNG
          </button>
          <button type="button" className="btn" onClick={onPng}>
            PNG 1024
          </button>
          <button type="button" className="btn" onClick={onSvg}>
            SVG
          </button>
          <button type="button" className="btn" onClick={onSave}>
            Save project
          </button>
          <button type="button" className="btn" onClick={onOpen}>
            Open project
          </button>
          <button type="button" className="btn danger" onClick={onReset}>
            Reset
          </button>
        </div>
      </div>
    </>
  );
}
