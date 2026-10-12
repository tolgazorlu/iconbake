import { useEffect, useMemo, useState } from "react";
import { AI_STYLES, buildPrompt, estimateUsd, findModel, type AiItem, type AiMode, type AiModel, type AiPalette, type AiRequest, type AiRun } from "../lib/ai";
import { useStore } from "../lib/store";
import { PanelHead } from "./Panels";
import { Disclosure, Row, Seg } from "./ui";
import { useFileDrop } from "./useFileDrop";

type Status = {
  configured: boolean;
  keySource: string | null;
  spend: { today: number; total: number; limit: number };
  models: AiModel[];
  folder: string;
};

const usd = (n: number) => `$${n < 0.1 ? n.toFixed(3) : n.toFixed(2)}`;

async function post<T>(route: string, body: unknown): Promise<T> {
  const r = await fetch(`/api/ai/${route}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
  return j as T;
}

async function toDataUrl(url: string): Promise<{ dataUrl: string; w: number; h: number }> {
  const blob = await (await fetch(url)).blob();
  const dataUrl = await new Promise<string>((ok) => {
    const r = new FileReader();
    r.onload = () => ok(String(r.result));
    r.readAsDataURL(blob);
  });
  const img = new Image();
  await new Promise<void>((ok, err) => {
    img.onload = () => ok();
    img.onerror = () => err(new Error("image decode failed"));
    img.src = dataUrl;
  });
  return { dataUrl, w: img.naturalWidth || 1024, h: img.naturalHeight || 1024 };
}

// Form state survives switching panels.
let draft: Omit<AiRequest, "refImage"> & { advanced: string } = {
  subject: "",
  style: "monolith",
  mode: "full",
  model: "nb2",
  n: 2,
  palette: "auto",
  brand: "#0a84ff",
  backdrop: "",
  advanced: "",
};

export function GeneratePanel({ flash }: { flash: (m: string) => void }) {
  const [status, setStatus] = useState<Status | null>(null);
  const [form, setFormState] = useState(draft);
  const [ref, setRef] = useState<string | null>(null);
  const [runs, setRuns] = useState<AiRun[]>([]);
  const [running, setRunning] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [selected, setSelected] = useState<{ item: AiItem; run: AiRun } | null>(null);
  const [instruction, setInstruction] = useState("");
  const [error, setError] = useState<string | null>(null);
  const replace = useStore((s) => s.replace);

  const setForm = (p: Partial<typeof form>) => {
    const next = { ...form, ...p };
    draft = next;
    setFormState(next);
  };

  const refresh = () =>
    Promise.all([fetch("/api/ai/status").then((r) => r.json()), fetch("/api/ai/history?limit=40").then((r) => r.json())])
      .then(([s, h]) => {
        setStatus(s);
        setRuns((h.runs as AiRun[]).filter((r) => r.items.length));
      })
      .catch(() => setStatus(null));

  useEffect(() => {
    refresh();
  }, []);

  useEffect(() => {
    if (!running) return;
    const t0 = Date.now();
    const i = setInterval(() => setElapsed(Math.round((Date.now() - t0) / 1000)), 500);
    return () => clearInterval(i);
  }, [running]);

  const model = findModel(form.model);
  const style = AI_STYLES.find((s) => s.id === form.style)!;
  const vectorBlocked = model.vector && (form.mode === "glyph" || !!ref);
  const request: AiRequest = { ...form, prompt: form.advanced || undefined, refImage: ref ?? undefined };
  const cost = estimateUsd(request);
  const compiled = useMemo(() => buildPrompt({ ...request, prompt: undefined }), [form.subject, form.style, form.mode, form.palette, form.brand, form.backdrop, ref]); // eslint-disable-line react-hooks/exhaustive-deps
  const refDrop = useFileDrop((dataUrl) => setRef(dataUrl));

  const run = async (label: string, fn: () => Promise<{ run: AiRun }>) => {
    setRunning(label);
    setElapsed(0);
    setError(null);
    try {
      const { run } = await fn();
      setRuns((r) => [run, ...r]);
      if (run.items[0]) setSelected({ item: run.items[0], run });
      flash(`${run.items.length} image${run.items.length === 1 ? "" : "s"} · ${usd(run.usd)}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRunning(null);
      refresh();
    }
  };

  const generate = () => run("Generating", () => post("generate", request));
  const refine = () =>
    selected &&
    run("Refining", () => post("refine", { item: selected.item.id, instruction, model: model.editEndpoint ? model.id : "nb2", mode: selected.run.mode }));
  const cutout = () => selected && run("Removing background", () => post("cutout", { item: selected.item.id }));

  const use = async (item: AiItem, mode: AiMode) => {
    try {
      const { dataUrl, w, h } = await toDataUrl(item.url);
      const s = useStore.getState().state;
      if (mode === "full") {
        replace({ ...s, fg: { ...s.fg, source: { kind: "none" } }, bg: { ...s.bg, type: "image", image: { dataUrl }, texture: "none" } });
      } else {
        replace({
          ...s,
          fg: { ...s.fg, source: { kind: "image", dataUrl, natural: { w, h } }, colorEnabled: false, padding: 14, effect: "none" },
          bg: s.bg.type === "image" && s.fg.source.kind === "none" ? { ...s.bg, type: "color" } : s.bg,
        });
      }
      flash(mode === "full" ? "Applied as full icon" : "Applied as glyph");
    } catch (e) {
      flash(`Could not apply: ${(e as Error).message}`);
    }
  };

  const spend = status?.spend;

  return (
    <>
      <PanelHead title="Generate" right={spend && <span className="meta" title={`Total ${usd(spend.total)} · daily limit ${usd(spend.limit)}`}>{usd(spend.today)} today</span>} />
      <div className="panel-b">
        {status && !status.configured && (
          <div className="note">
            <b>fal key missing.</b> Add <code>FAL_KEY=…</code> to <code>.env.local</code> in the project folder. It is read on every request. The key stays on the dev server; the browser never sees it.
          </div>
        )}

        <Row label="Describe">
          <textarea
            className="input"
            rows={3}
            value={form.subject}
            placeholder="A triangular A-frame bungalow with a glowing glass front"
            onChange={(e) => setForm({ subject: e.target.value.slice(0, 600) })}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && !running && status?.configured) generate();
            }}
          />
          <div className="hint">One concrete object and, if you want, one action. A single subject reads at 60 px; a whole scene does not.</div>
        </Row>

        <Row label="Output">
          <Seg<AiMode>
            block
            value={form.mode}
            onChange={(m) => setForm({ mode: m })}
            options={[
              { value: "full", label: "Full icon" },
              { value: "glyph", label: "Glyph only" },
            ]}
          />
          <div className="hint">
            {form.mode === "full"
              ? "The artwork fills the icon, background included."
              : "Just the object on a transparent background, placed on your Style background. Best for Android adaptive and tinted icons."}
          </div>
        </Row>

        <Row label="Style">
          <div className="styles">
            {AI_STYLES.map((s) => (
              <button
                key={s.id}
                type="button"
                className="style-opt"
                aria-pressed={s.id === form.style}
                title={s.hint}
                onClick={() => setForm({ style: s.id, model: s.model })}
              >
                {s.label}
              </button>
            ))}
          </div>
          <div className="hint">{style.hint}.</div>
        </Row>

        <Row label="Model">
          <select className="input" value={form.model} onChange={(e) => setForm({ model: e.target.value })}>
            {(status?.models ?? []).map((m) => (
              <option key={m.id} value={m.id}>
                {m.label} · {usd(m.usd)}
              </option>
            ))}
          </select>
          <div className="hint">
            {model.note}
            {model.id !== style.model && ` Recommended for ${style.label}: ${findModel(style.model).label}.`}
          </div>
        </Row>

        <Row label="Variants">
          <Seg
            value={String(form.n)}
            onChange={(v) => setForm({ n: Number(v) })}
            options={["1", "2", "3", "4"].map((v) => ({ value: v, label: v }))}
          />
        </Row>

        <Row label="Palette">
          <div className="inline">
            <Seg<AiPalette>
              value={form.palette ?? "auto"}
              onChange={(p) => setForm({ palette: p })}
              options={[
                { value: "auto", label: "Auto" },
                { value: "neutral", label: "Neutral" },
                { value: "brand", label: "Brand" },
              ]}
            />
            {form.palette === "brand" && (
              <span className="swatch" style={{ background: form.brand }}>
                <input type="color" value={form.brand} onChange={(e) => setForm({ brand: e.target.value })} aria-label="Brand color" />
              </span>
            )}
          </div>
        </Row>

        <Disclosure title="Reference and prompt">
          <Row label="Style ref">
            <div {...refDrop.props} style={{ minHeight: 64 }}>
              <input {...refDrop.inputProps} />
              {ref ? <img src={ref} alt="" /> : <span>Drop an image whose look you want to copy</span>}
            </div>
            {ref && (
              <button type="button" className="btn small" onClick={() => setRef(null)}>
                Remove reference
              </button>
            )}
            <div className="hint">Only its rendering is copied, never its subject. Uses the model's edit endpoint.</div>
          </Row>
          {form.mode === "full" && (
            <Row label="Backdrop">
              <input className="input" value={form.backdrop} placeholder={style.backdrop} onChange={(e) => setForm({ backdrop: e.target.value })} />
            </Row>
          )}
          <Row label="Prompt">
            <textarea className="input mono" rows={6} value={form.advanced || compiled} onChange={(e) => setForm({ advanced: e.target.value === compiled ? "" : e.target.value })} />
            <div className="hint">
              Sent as is. {form.advanced ? (
                <button type="button" className="link" onClick={() => setForm({ advanced: "" })}>
                  Reset to the built prompt
                </button>
              ) : (
                "Edit it to take full control."
              )}
            </div>
          </Row>
        </Disclosure>

        {error && <div className="note error">{error}</div>}
        {vectorBlocked && <div className="note">The vector model makes full icons only and takes no reference image.</div>}

        <button
          type="button"
          className="btn primary wide"
          disabled={!!running || !status?.configured || (!form.subject.trim() && !form.advanced) || vectorBlocked}
          onClick={generate}
        >
          {running ? `${running}… ${elapsed}s` : `Generate ${form.n > 1 ? `${form.n} ` : ""}· ~${usd(cost)}`}
        </button>

        {selected && (
          <div className="ai-selected">
            <img src={selected.item.url} alt="" className="checker" />
            <div className="btn-grid two">
              {(selected.run.mode === "glyph" ? (["glyph", "full"] as const) : (["full", "glyph"] as const)).map((m, i) => (
                <button key={m} type="button" className={`btn ${i === 0 ? "primary" : ""}`} onClick={() => use(selected.item, m)}>
                  {m === "full" ? "Use as icon" : "Use as glyph"}
                </button>
              ))}
            </div>
            <div className="refine">
              <input
                className="input"
                value={instruction}
                placeholder="Refine: warmer light, thicker outline…"
                onChange={(e) => setInstruction(e.target.value.slice(0, 300))}
                onKeyDown={(e) => e.key === "Enter" && instruction.trim() && !running && refine()}
              />
              <button type="button" className="btn" disabled={!instruction.trim() || !!running} onClick={refine} title={`~${usd(findModel(model.editEndpoint ? model.id : "nb2").usd)}`}>
                Refine
              </button>
            </div>
            <div className="ai-meta">
              <button type="button" className="link" disabled={!!running} onClick={cutout} title={`~${usd(0.002)}`}>
                Remove background
              </button>
              <a className="link" href={selected.item.url} target="_blank" rel="noreferrer">
                Open {selected.item.format.toUpperCase()}
              </a>
              <span title={selected.run.prompt}>{findModel(selected.run.model).label}</span>
            </div>
          </div>
        )}

        {runs.length > 0 && (
          <section className="section">
            <h3 className="section-h">
              <span>History</span>
              <span className="meta">{status?.folder.replace(/^.*\/(?=[^/]+\/\.generations)/, "")}</span>
            </h3>
            <div className="ai-grid">
              {runs.flatMap((r) =>
                r.items.map((it) => (
                  <button
                    key={it.id}
                    type="button"
                    className="ai-thumb checker"
                    aria-pressed={selected?.item.id === it.id}
                    title={`${r.kind} · ${r.subject || r.prompt.slice(0, 80)}`}
                    onClick={() => setSelected({ item: it, run: r })}
                  >
                    <img src={it.url} alt="" loading="lazy" />
                  </button>
                )),
              )}
            </div>
          </section>
        )}
      </div>
    </>
  );
}
