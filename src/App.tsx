import { useEffect, useRef, useState } from "react";
import { GeneratePanel } from "./components/GeneratePanel";
import { ExportPanel, LibraryPanel, StylePanel, TextPanel, UploadPanel } from "./components/Panels";
import { Stage } from "./components/Stage";
import { Icons, RailButton } from "./components/ui";
import { buildZip, copyPng, downloadBlob, downloadSingle } from "./lib/export";
import { useStore } from "./lib/store";
import { DEFAULT_STATE, type IconState } from "./lib/types";

type Panel = "generate" | "library" | "text" | "upload" | "style" | "export";

const PANELS: { id: Panel; label: string; icon: React.ReactNode }[] = [
  { id: "generate", label: "Generate with AI", icon: Icons.brush },
  { id: "library", label: "Icon library", icon: Icons.library },
  { id: "text", label: "Text", icon: Icons.text },
  { id: "upload", label: "Upload", icon: Icons.upload },
  { id: "style", label: "Style", icon: Icons.style },
  { id: "export", label: "Export", icon: Icons.box },
];

const PANEL_KEY = "icony:panel";

export default function App() {
  const state = useStore((s) => s.state);
  const set = useStore((s) => s.set);
  const undo = useStore((s) => s.undo);
  const redo = useStore((s) => s.redo);
  const reset = useStore((s) => s.reset);
  const replace = useStore((s) => s.replace);
  const [panel, setPanelState] = useState<Panel>(() => {
    const saved = localStorage.getItem(PANEL_KEY) as Panel | null;
    return saved && PANELS.some((p) => p.id === saved) ? saved : "library";
  });
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const toastTimer = useRef<number | undefined>(undefined);

  const setPanel = (p: Panel) => {
    localStorage.setItem(PANEL_KEY, p);
    setPanelState(p);
  };

  useEffect(() => {
    document.documentElement.dataset.theme = state.theme;
  }, [state.theme]);

  const flash = (m: string) => {
    setToast(m);
    clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 2200);
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
      } else if (mod && e.key === "c" && !window.getSelection()?.toString()) {
        // Copy the icon only when no text is selected, so ⌘C still copies selected text.
        e.preventDefault();
        copy();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

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
    <div className="app">
      <nav className="rail" aria-label="Tools">
        <div className="rail-mark" aria-label="icony">
          {Icons.logo}
        </div>
        {PANELS.map((p) => (
          <RailButton key={p.id} label={p.label} icon={p.icon} active={panel === p.id} onClick={() => setPanel(p.id)} />
        ))}
        <div className="rail-spacer" />
        <RailButton
          label={state.theme === "dark" ? "Light theme" : "Dark theme"}
          icon={state.theme === "dark" ? Icons.sun : Icons.moon}
          onClick={() => set({ theme: state.theme === "dark" ? "light" : "dark" })}
        />
      </nav>

      <aside className="panel">
        {panel === "generate" && <GeneratePanel flash={flash} />}
        {panel === "library" && <LibraryPanel />}
        {panel === "text" && <TextPanel />}
        {panel === "upload" && <UploadPanel />}
        {panel === "style" && <StylePanel />}
        {panel === "export" && (
          <ExportPanel
            busy={busy}
            onDownload={download}
            onCopy={copy}
            onPng={() => downloadSingle(state, "png", 1024)}
            onSvg={() => downloadSingle(state, "svg")}
            onSave={saveProject}
            onOpen={() => fileRef.current?.click()}
            onReset={() => {
              if (confirm("Reset the icon to defaults? Undo history is cleared.")) reset();
            }}
          />
        )}
        <input ref={fileRef} type="file" accept=".json" hidden onChange={(e) => loadProject(e.target.files?.[0])} />
      </aside>

      <Stage busy={busy} onDownload={download} />
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
