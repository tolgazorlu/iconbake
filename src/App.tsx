import { useEffect, useRef, useState } from "react";
import { Sidebar } from "./components/Sidebar";
import { Stage } from "./components/Stage";
import { Icons } from "./components/ui";
import { buildZip, copyPng, downloadBlob, downloadSingle } from "./lib/export";
import { useStore } from "./lib/store";
import { DEFAULT_STATE, type IconState } from "./lib/types";

export default function App() {
  const state = useStore((s) => s.state);
  const set = useStore((s) => s.set);
  const undo = useStore((s) => s.undo);
  const redo = useStore((s) => s.redo);
  const reset = useStore((s) => s.reset);
  const replace = useStore((s) => s.replace);
  const canUndo = useStore((s) => s.history.length > 0);
  const canRedo = useStore((s) => s.future.length > 0);
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [menu, setMenu] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    document.documentElement.dataset.theme = state.theme;
  }, [state.theme]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      const tag = (e.target as HTMLElement)?.tagName;
      if (["INPUT", "TEXTAREA", "SELECT"].includes(tag)) return;
      if (mod && e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if (mod && (e.key === "Z" || (e.key === "z" && e.shiftKey) || e.key === "y")) {
        e.preventDefault();
        redo();
      } else if (mod && e.key === "s") {
        e.preventDefault();
        download();
      } else if (mod && e.key === "c") {
        e.preventDefault();
        copy();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const flash = (m: string) => {
    setToast(m);
    setTimeout(() => setToast(null), 1800);
  };

  const download = async () => {
    if (busy) return;
    try {
      const blob = await buildZip(state, (l) => setBusy(l));
      downloadBlob(blob, `${state.filename || "icon"}-icony.zip`);
      flash("Zip downloaded");
    } catch (e) {
      flash(`Export failed: ${(e as Error).message}`);
    } finally {
      setBusy(null);
    }
  };

  const copy = async () => {
    try {
      await copyPng(state, 512);
      flash("PNG copied to clipboard");
    } catch {
      flash("Clipboard blocked");
    }
  };

  const saveProject = () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
    downloadBlob(blob, `${state.filename || "icon"}.icony.json`);
  };

  const loadProject = (f: File | undefined) => {
    if (!f) return;
    f.text().then((t) => {
      try {
        const s = JSON.parse(t) as IconState;
        if (s && s.fg && s.bg) {
          replace({ ...DEFAULT_STATE, ...s });
          // Older exports stripped uploaded images from the project file.
          const missing = (s.fg.source.kind === "image" && !s.fg.source.dataUrl) || (s.bg.type === "image" && !s.bg.image?.dataUrl);
          flash(missing ? "Project loaded, but its uploaded image is missing: upload it again" : "Project loaded");
        } else {
          flash("Invalid project file");
        }
      } catch {
        flash("Invalid project file");
      }
    });
  };

  return (
    <div className="app" onClick={() => menu && setMenu(false)}>
      <header className="topbar">
        <div className="brand">
          <span className="mark">{Icons.logo}</span>
          icony
          <small>app icon generator</small>
        </div>
        <div style={{ flex: 1 }} />
        <button type="button" className="btn icon" onClick={undo} disabled={!canUndo} title="Undo (⌘Z)">
          {Icons.undo}
        </button>
        <button type="button" className="btn icon" onClick={redo} disabled={!canRedo} title="Redo (⇧⌘Z)">
          {Icons.redo}
        </button>
        <button type="button" className="btn icon" onClick={() => set({ theme: state.theme === "dark" ? "light" : "dark" })} title="Toggle theme">
          {state.theme === "dark" ? Icons.sun : Icons.moon}
        </button>
        <button type="button" className="btn" onClick={copy} title="Copy 512px PNG (⌘C)">
          {Icons.copy} Copy PNG
        </button>
        <div style={{ position: "relative" }}>
          <button
            type="button"
            className="btn"
            onClick={(e) => {
              e.stopPropagation();
              setMenu((m) => !m);
            }}
          >
            More
          </button>
          {menu && (
            <div
              style={{
                position: "absolute",
                right: 0,
                top: 36,
                minWidth: 200,
                background: "var(--bg-elev)",
                borderRadius: 12,
                padding: 6,
                boxShadow: "0 12px 40px rgba(0,0,0,.4), 0 0 0 1px var(--sep)",
                display: "grid",
                zIndex: 5,
              }}
            >
              {[
                ["Download PNG 1024", () => downloadSingle(state, "png", 1024)],
                ["Download SVG", () => downloadSingle(state, "svg")],
                ["Save project (.json)", saveProject],
                ["Open project…", () => fileRef.current?.click()],
                ["Reset to defaults", reset],
              ].map(([label, fn]) => (
                <button
                  key={label as string}
                  type="button"
                  className="btn"
                  style={{ justifyContent: "flex-start", background: "transparent" }}
                  onClick={() => {
                    (fn as () => void)();
                    setMenu(false);
                  }}
                >
                  {label as string}
                </button>
              ))}
            </div>
          )}
          <input ref={fileRef} type="file" accept=".json" style={{ display: "none" }} onChange={(e) => loadProject(e.target.files?.[0])} />
        </div>
        <button type="button" className="btn primary" onClick={download} disabled={!!busy || state.platforms.length === 0} title="Download zip (⌘S)">
          {Icons.download} {busy ? `${busy}…` : "Download"}
        </button>
      </header>
      <Sidebar />
      <Stage />
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
