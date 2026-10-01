import { useEffect, useMemo, useState } from "react";
import { compose } from "../lib/compose";
import { fetchIcon } from "../lib/api";
import { useStore } from "../lib/store";
import { PRESETS } from "../lib/presets";
import type { Platform } from "../lib/types";
import { Seg } from "./ui";

function Svg({ html, size, className, style }: { html: string; size?: number; className?: string; style?: React.CSSProperties }) {
  return (
    <div
      className={className}
      style={{ width: size, height: size, lineHeight: 0, ...style }}
      dangerouslySetInnerHTML={{ __html: html.replace(/width="\d+" height="\d+"/, 'width="100%" height="100%"') }}
    />
  );
}

export function Stage() {
  const state = useStore((s) => s.state);
  const set = useStore((s) => s.set);
  const setFg = useStore((s) => s.setFg);
  const replace = useStore((s) => s.replace);

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

  return (
    <main className="stage">
      <div className="stage-tabs">
        <Seg<Platform>
          value={p}
          onChange={(v) => set({ activePlatform: v })}
          options={[
            { value: "ios", label: "iOS" },
            { value: "android", label: "Android" },
            { value: "macos", label: "macOS" },
            { value: "web", label: "Web" },
            { value: "png", label: "Plain" },
          ]}
        />
        <div style={{ flex: 1 }} />
        <div className="presets" style={{ padding: 0 }}>
          {PRESETS.map((pr) => {
            const s = pr.apply(state);
            const thumb = compose(s, { platform: "png", size: 96, id: `p-${pr.id}` }).svg;
            return (
              <button key={pr.id} type="button" className="preset" onClick={() => replace(s)} title={pr.label}>
                <Svg html={thumb} className="thumb checker" />
              </button>
            );
          })}
        </div>
      </div>

      <div className="stage-body">
        {p === "ios" && <IosPreview svg={main} />}
        {p === "android" && <AndroidPreview />}
        {p === "macos" && <MacPreview svg={main} />}
        {p === "web" && <WebPreview svg={main} />}
        {p === "png" && <PlainPreview svg={main} />}
      </div>

      <div className="stage-foot">
        <span>
          {state.fg.source.kind === "clipart" && (
            <span style={{ fontFamily: "var(--mono)" }}>
              {state.fg.source.prefix}:{state.fg.source.name}
            </span>
          )}
        </span>
        <SizeStrip />
      </div>
    </main>
  );
}

function SizeStrip() {
  const state = useStore((s) => s.state);
  const sizes = [16, 32, 48, 64];
  return (
    <div className="sizes">
      {sizes.map((s) => (
        <figure key={s}>
          <Svg html={compose(state, { platform: "png", size: s, id: `s${s}` }).svg} size={s} />
          <figcaption>{s}</figcaption>
        </figure>
      ))}
    </div>
  );
}

function IosPreview({ svg }: { svg: string }) {
  const theme = useStore((s) => s.state.theme);
  const [t, setT] = useState(() => new Date());
  useEffect(() => {
    const i = setInterval(() => setT(new Date()), 30000);
    return () => clearInterval(i);
  }, []);
  const time = t.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const others = ["#1c1c1e", "#30d158", "#0a84ff", "#ff9f0a", "#5e5ce6", "#8e8e93", "#ff453a"];
  return (
    <div className="phone">
      <div className={`screen ${theme === "light" ? "light" : ""}`}>
        <div className="time">{time}</div>
        <div className="apps">
          {others.slice(0, 3).map((c, i) => (
            <div className="hs-app" key={i}>
              <div className="ic ph" style={{ background: c, opacity: 0.55 }} />
              <span style={{ opacity: 0.6 }}>App</span>
            </div>
          ))}
          <div className="hs-app">
            <Svg html={svg} className="ic" style={{ borderRadius: 0, overflow: "visible" }} />
            <span>icony</span>
          </div>
          {others.slice(3).map((c, i) => (
            <div className="hs-app" key={i}>
              <div className="ic ph" style={{ background: c, opacity: 0.55 }} />
              <span style={{ opacity: 0.6 }}>App</span>
            </div>
          ))}
        </div>
        <div className="dock">
          {["#30d158", "#0a84ff"].map((c, i) => (
            <div key={i} className="ic ph" style={{ width: 56, height: 56, background: c, opacity: 0.55 }} />
          ))}
          <Svg html={svg} size={56} />
          <div className="ic ph" style={{ width: 56, height: 56, background: "#ff9f0a", opacity: 0.55 }} />
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
    <div style={{ display: "grid", gap: 28, justifyItems: "center" }}>
      <Svg html={masked} size={240} />
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
      <div style={{ display: "flex", gap: 16 }}>
        {[
          ["Foreground", fg],
          ["Background", bg],
          ["Monochrome", mono],
        ].map(([label, s]) => (
          <figure key={label} style={{ margin: 0, display: "grid", gap: 6, justifyItems: "center", color: "var(--text-3)", fontSize: 11 }}>
            <Svg html={s} size={108} className="checker" style={{ borderRadius: 8, outline: "1px dashed var(--sep)" }} />
            <figcaption>{label}</figcaption>
          </figure>
        ))}
      </div>
      <div className="hint" style={{ textAlign: "center", maxWidth: 360 }}>
        Adaptive layers are 108dp; the launcher shows the inner 72dp. Dashed box is the full layer.
      </div>
    </div>
  );
}

function MacPreview({ svg }: { svg: string }) {
  const others = ["#f2f2f7", "#0a84ff", "#30d158", "#ff9f0a", "#5e5ce6"];
  return (
    <div
      style={{
        width: 620,
        height: 400,
        borderRadius: 16,
        background: "radial-gradient(100% 120% at 30% 0%, #5b6b8a 0%, #2a3042 60%, #11141c 100%)",
        display: "grid",
        alignContent: "end",
        justifyItems: "center",
        paddingBottom: 14,
        boxShadow: "0 30px 80px rgba(0,0,0,.45)",
      }}
    >
      <div className="macdock">
        {others.slice(0, 2).map((c, i) => (
          <div key={i} className="ic" style={{ background: c, borderRadius: 14, opacity: 0.5, width: 52, height: 52, margin: "0 6px 6px" }} />
        ))}
        <Svg html={svg} className="ic" />
        {others.slice(2).map((c, i) => (
          <div key={i} className="ic" style={{ background: c, borderRadius: 14, opacity: 0.5, width: 52, height: 52, margin: "0 6px 6px" }} />
        ))}
      </div>
    </div>
  );
}

function WebPreview({ svg }: { svg: string }) {
  const name = useStore((s) => s.state.filename);
  const tiny = svg.replace(/width="\d+" height="\d+"/, 'width="16" height="16"');
  return (
    <div style={{ display: "grid", gap: 24, justifyItems: "center" }}>
      <div className="browser">
        <div className="tabs">
          <div className="tab">
            <span dangerouslySetInnerHTML={{ __html: tiny }} style={{ lineHeight: 0 }} />
            {name || "icon"} · Home
          </div>
          <div className="tab inactive">
            <span style={{ width: 16, height: 16, borderRadius: 3, background: "var(--fill-strong)", display: "inline-block" }} />
            Another tab
          </div>
        </div>
        <div className="addr">
          <div className="url">
            <span dangerouslySetInnerHTML={{ __html: tiny }} style={{ lineHeight: 0 }} />
            https://{name || "example"}.app
          </div>
        </div>
      </div>
      <div style={{ display: "flex", gap: 20, alignItems: "flex-end" }}>
        <Svg html={svg} size={192} />
        <figure style={{ margin: 0, display: "grid", gap: 6, justifyItems: "center", color: "var(--text-3)", fontSize: 11 }}>
          <Svg html={compose({ ...useStore.getState().state, shape: "square" }, { platform: "png", size: 512, id: "mask" }).svg} size={120} style={{ borderRadius: "50%", overflow: "hidden" }} />
          <figcaption>maskable (safe zone)</figcaption>
        </figure>
      </div>
    </div>
  );
}

function PlainPreview({ svg }: { svg: string }) {
  return <Svg html={svg} size={360} className="checker" style={{ borderRadius: 12 }} />;
}
