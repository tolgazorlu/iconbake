import { useEffect, useMemo, useState } from "react";
import { compose } from "../lib/compose";
import { fetchIcon } from "../lib/api";
import { useStore } from "../lib/store";
import type { Platform } from "../lib/types";
import { Icons, Seg } from "./ui";

function Svg({ html, size, className, style }: { html: string; size?: number; className?: string; style?: React.CSSProperties }) {
  return (
    <div
      className={className}
      style={{ width: size, height: size, lineHeight: 0, ...style }}
      dangerouslySetInnerHTML={{ __html: html.replace(/width="\d+" height="\d+"/, 'width="100%" height="100%"') }}
    />
  );
}

export function Stage({ busy, onDownload }: { busy: string | null; onDownload: () => void }) {
  const state = useStore((s) => s.state);
  const set = useStore((s) => s.set);
  const setFg = useStore((s) => s.setFg);
  const undo = useStore((s) => s.undo);
  const redo = useStore((s) => s.redo);
  const canUndo = useStore((s) => s.history.length > 0);
  const canRedo = useStore((s) => s.future.length > 0);

  // Hydrate clipart body on first load (persisted state carries prefix/name; body may be empty on reset).
  useEffect(() => {
    const src = state.fg.source;
    if (src.kind === "clipart" && !src.body) {
      fetchIcon(src.prefix, src.name)
        .then((d) => setFg({ source: { ...src, body: d.body, width: d.width, height: d.height } }))
        .catch(() => {});
    }
  }, [state.fg.source, setFg]);

  const p = state.activePlatform;
  const main = useMemo(() => compose(state, { platform: p, size: 512, id: "main" }).svg, [state, p]);
  const src = state.fg.source;
  const label =
    src.kind === "clipart" ? `${src.prefix}:${src.name}` : src.kind === "text" ? "Text" : src.kind === "image" ? "Picture glyph" : "Artwork";

  return (
    <main className="stage">
      <header className="stage-h">
        <Seg<Platform>
          value={p}
          onChange={(v) => set({ activePlatform: v })}
          options={[
            { value: "png", label: "Icon" },
            { value: "ios", label: "iOS" },
            { value: "android", label: "Android" },
            { value: "macos", label: "macOS" },
            { value: "web", label: "Web" },
          ]}
        />
        <div className="grow" />
        <button type="button" className="btn icon ghost" onClick={undo} disabled={!canUndo} title="Undo (⌘Z)" aria-label="Undo">
          {Icons.undo}
        </button>
        <button type="button" className="btn icon ghost" onClick={redo} disabled={!canRedo} title="Redo (⇧⌘Z)" aria-label="Redo">
          {Icons.redo}
        </button>
        <button type="button" className="btn primary" onClick={onDownload} disabled={!!busy || state.platforms.length === 0} title="Download zip (⌘S)">
          {Icons.download} {busy ? `${busy}…` : "Download"}
        </button>
      </header>

      <div className="stage-body">
        {p === "png" && <IconPreview svg={main} />}
        {p === "ios" && <IosPreview svg={main} />}
        {p === "android" && <AndroidPreview />}
        {p === "macos" && <MacPreview svg={main} />}
        {p === "web" && <WebPreview svg={main} />}
      </div>

      <footer className="stage-f">
        <span className="mono">{label}</span>
        <span>{state.platforms.length ? state.platforms.map((x) => (x === "png" ? "PNG" : x === "ios" ? "iOS" : x === "macos" ? "macOS" : x[0].toUpperCase() + x.slice(1))).join(" · ") : "No export targets"}</span>
      </footer>
    </main>
  );
}

/** Default view: the icon large, then the sizes where icons actually fail (home screen, favicon). */
function IconPreview({ svg }: { svg: string }) {
  const state = useStore((s) => s.state);
  const name = state.appName || state.filename || "App";
  const small = (n: number) => compose(state, { platform: "png", size: n, id: `s${n}` }).svg;
  const ios = compose({ ...state, shape: "squircle" }, { platform: "ios", size: 120, id: "hs" }).svg;
  return (
    <div className="icon-view">
      <Svg html={svg} size={300} className="hero" />
      <div className="at-size">
        {(["dark", "light"] as const).map((t) => (
          <div key={t} className={`wall ${t}`}>
            <div className="hs-tile">
              <Svg html={ios} size={60} />
              <span>{name}</span>
            </div>
          </div>
        ))}
        <div className="favs">
          {[32, 16].map((n) => (
            <figure key={n}>
              <Svg html={small(n * 2)} size={n} />
              <figcaption>{n}</figcaption>
            </figure>
          ))}
        </div>
      </div>
      <p className="hint center">If the subject still reads at 60 and 16 px, the icon works.</p>
    </div>
  );
}

function IosPreview({ svg }: { svg: string }) {
  const theme = useStore((s) => s.state.theme);
  const name = useStore((s) => s.state.appName || s.state.filename || "iconpress");
  const [t, setT] = useState(() => new Date());
  useEffect(() => {
    const i = setInterval(() => setT(new Date()), 30000);
    return () => clearInterval(i);
  }, []);
  const time = t.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const others = ["#1c1c1e", "#3a3a3c", "#636366", "#48484a", "#2c2c2e", "#8e8e93", "#aeaeb2"];
  return (
    <div className="phone">
      <div className={`screen ${theme === "light" ? "light" : ""}`}>
        <div className="time">{time}</div>
        <div className="apps">
          {others.slice(0, 3).map((c, i) => (
            <div className="hs-app" key={i}>
              <div className="ic ph" style={{ background: c }} />
              <span>App</span>
            </div>
          ))}
          <div className="hs-app">
            <Svg html={svg} className="ic" style={{ borderRadius: 0, overflow: "visible" }} />
            <span className="me">{name}</span>
          </div>
          {others.slice(3).map((c, i) => (
            <div className="hs-app" key={i}>
              <div className="ic ph" style={{ background: c }} />
              <span>App</span>
            </div>
          ))}
        </div>
        <div className="dock">
          {["#3a3a3c", "#636366"].map((c, i) => (
            <div key={i} className="ic ph" style={{ width: 56, height: 56, background: c }} />
          ))}
          <Svg html={svg} size={56} />
          <div className="ic ph" style={{ width: 56, height: 56, background: "#48484a" }} />
        </div>
      </div>
    </div>
  );
}

function AndroidPreview() {
  const state = useStore((s) => s.state);
  const [mask, setMask] = useState<"circle" | "squircle" | "rounded" | "square">("circle");
  const masked = compose({ ...state, shape: mask, radius: 18 }, { platform: "png", size: 512, id: "a" }).svg;
  const fg = compose(state, { platform: "android", layer: "foreground", size: 216, id: "afg" }).svg;
  const bg = compose(state, { platform: "android", layer: "background", size: 216, id: "abg" }).svg;
  const mono = compose(state, { platform: "android", layer: "monochrome", size: 216, id: "amo" }).svg;
  return (
    <div className="android-view">
      <Svg html={masked} size={220} />
      <Seg
        value={mask}
        onChange={setMask}
        options={[
          { value: "circle", label: "Circle" },
          { value: "squircle", label: "Squircle" },
          { value: "rounded", label: "Rounded" },
          { value: "square", label: "Square" },
        ]}
      />
      <div className="layers">
        {[
          ["Foreground", fg],
          ["Background", bg],
          ["Monochrome", mono],
        ].map(([label, s]) => (
          <figure key={label}>
            <div className="layer">
              <Svg html={s} size={96} className="checker" />
              {label === "Foreground" && <div aria-hidden className="safe" />}
            </div>
            <figcaption>{label}</figcaption>
          </figure>
        ))}
      </div>
      <p className="hint center">Adaptive layers are 108dp; launchers show the inner 72dp. Keep the glyph inside the dashed circle.</p>
    </div>
  );
}

function MacPreview({ svg }: { svg: string }) {
  const others = ["#3a3a3c", "#636366", "#48484a", "#8e8e93", "#2c2c2e"];
  return (
    <div className="mac">
      <div className="macdock">
        {others.slice(0, 2).map((c, i) => (
          <div key={i} className="ic ph" style={{ background: c }} />
        ))}
        <Svg html={svg} className="ic" />
        {others.slice(2).map((c, i) => (
          <div key={i} className="ic ph" style={{ background: c }} />
        ))}
      </div>
    </div>
  );
}

function WebPreview({ svg }: { svg: string }) {
  const state = useStore((s) => s.state);
  const name = state.appName || state.filename || "icon";
  const tiny = svg.replace(/width="\d+" height="\d+"/, 'width="16" height="16"');
  const maskable = compose({ ...state, shape: "square" }, { platform: "png", size: 512, id: "mask" }).svg;
  return (
    <div className="web-view">
      <div className="browser">
        <div className="tabs">
          <div className="tab">
            <span dangerouslySetInnerHTML={{ __html: tiny }} style={{ lineHeight: 0 }} />
            {name}
          </div>
          <div className="tab inactive">
            <span className="tab-ph" />
            Another tab
          </div>
        </div>
        <div className="addr">
          <div className="url">
            <span dangerouslySetInnerHTML={{ __html: tiny }} style={{ lineHeight: 0 }} />
            {state.filename || "example"}.app
          </div>
        </div>
      </div>
      <div className="web-icons">
        <figure>
          <Svg html={svg} size={160} />
          <figcaption>192 / 512</figcaption>
        </figure>
        <figure>
          <Svg html={maskable} size={120} style={{ borderRadius: "50%", overflow: "hidden" }} />
          <figcaption>maskable</figcaption>
        </figure>
      </div>
    </div>
  );
}
