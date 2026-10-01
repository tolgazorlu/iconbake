import { useEffect, useMemo, useRef, useState } from "react";
import { fetchCollections, fetchSet, iconSvg, searchAll, type CollectionMeta, type IconData } from "../lib/api";
import { useStore } from "../lib/store";
import { Icons } from "./ui";

const PAGE = 300;
const FEATURED = [
  "lucide", "material-symbols", "mdi", "tabler", "ph", "heroicons", "solar", "hugeicons", "fluent", "carbon",
  "ri", "bi", "iconoir", "mingcute", "uil", "fa7-solid", "simple-icons", "logos", "fluent-emoji", "noto", "twemoji", "openmoji",
];

export function IconPicker() {
  const source = useStore((s) => s.state.fg.source);
  const setFg = useStore((s) => s.setFg);
  const [collections, setCollections] = useState<CollectionMeta[]>([]);
  const [prefix, setPrefix] = useState("lucide");
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  const [scope, setScope] = useState<"set" | "all">("set");
  const [icons, setIcons] = useState<IconData[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(false);
  const gridRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchCollections().then(setCollections);
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim().toLowerCase()), 180);
    return () => clearTimeout(t);
  }, [q]);

  // Reset paging when inputs change.
  useEffect(() => {
    setOffset(0);
    gridRef.current?.scrollTo({ top: 0 });
  }, [prefix, debounced, scope]);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    const run = async () => {
      if (scope === "all") {
        if (debounced.length < 2) {
          if (alive) {
            setIcons([]);
            setTotal(0);
            setLoading(false);
          }
          return;
        }
        const r = await searchAll(debounced, 600);
        if (!alive) return;
        setIcons(r.results);
        setTotal(r.total);
      } else {
        const page = await fetchSet(prefix, debounced, offset, PAGE);
        if (!alive) return;
        const list = Object.entries(page.icons).map(([name, d]) => ({
          prefix: page.prefix,
          name,
          width: d.width ?? page.width,
          height: d.height ?? page.height,
          body: d.body,
        }));
        setIcons((prev) => (offset === 0 ? list : [...prev, ...list]));
        setTotal(page.total);
      }
      setLoading(false);
    };
    run().catch(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [prefix, debounced, offset, scope]);

  const meta = useMemo(() => collections.find((c) => c.prefix === prefix), [collections, prefix]);
  const grouped = useMemo(() => {
    const byCat = new Map<string, CollectionMeta[]>();
    for (const c of collections) {
      const k = c.category;
      if (!byCat.has(k)) byCat.set(k, []);
      byCat.get(k)!.push(c);
    }
    for (const v of byCat.values()) v.sort((a, b) => b.total - a.total);
    return [...byCat.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [collections]);

  const totalIcons = useMemo(() => collections.reduce((n, c) => n + c.total, 0), [collections]);

  const pick = (d: IconData) => {
    const palette = collections.find((c) => c.prefix === d.prefix)?.palette ?? false;
    setFg({
      source: { kind: "clipart", prefix: d.prefix, name: d.name, body: d.body, width: d.width, height: d.height },
      colorEnabled: !palette,
    });
  };

  const random = async () => {
    const c = collections[Math.floor(Math.random() * collections.length)];
    const page = await fetchSet(c.prefix, "", Math.floor(Math.random() * Math.max(1, c.total - 1)), 1);
    const [name, d] = Object.entries(page.icons)[0] ?? [];
    if (name) pick({ prefix: c.prefix, name, width: d.width ?? page.width, height: d.height ?? page.height, body: d.body });
  };

  const selected = source.kind === "clipart" ? `${source.prefix}:${source.name}` : "";

  return (
    <div className="picker">
      <div className="picker-search">
        {Icons.search}
        <input
          className="input"
          placeholder={scope === "all" ? `Search ${totalIcons.toLocaleString()} icons in ${collections.length} sets` : `Search ${meta?.name ?? ""}`}
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>
      <div className="setbar">
        <div className="seg">
          <button type="button" aria-pressed={scope === "set"} onClick={() => setScope("set")}>
            Set
          </button>
          <button type="button" aria-pressed={scope === "all"} onClick={() => setScope("all")}>
            All
          </button>
        </div>
        {scope === "set" && (
          <select className="input" value={prefix} onChange={(e) => setPrefix(e.target.value)}>
            <optgroup label="Featured">
              {FEATURED.filter((f) => collections.some((c) => c.prefix === f)).map((f) => {
                const c = collections.find((x) => x.prefix === f)!;
                return (
                  <option key={f} value={f}>
                    {c.name} · {c.total.toLocaleString()}
                  </option>
                );
              })}
            </optgroup>
            {grouped.map(([cat, list]) => (
              <optgroup key={cat} label={cat}>
                {list.map((c) => (
                  <option key={c.prefix} value={c.prefix}>
                    {c.name} · {c.total.toLocaleString()}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        )}
        <button type="button" className="btn icon" title="Random icon" onClick={random}>
          {Icons.shuffle}
        </button>
      </div>
      <div className="grid" ref={gridRef}>
        {icons.length === 0 && !loading && (
          <div className="empty">{scope === "all" && debounced.length < 2 ? "Type at least 2 characters" : "No icons"}</div>
        )}
        {icons.map((d) => {
          const key = `${d.prefix}:${d.name}`;
          return (
            <button
              key={key}
              type="button"
              title={key}
              aria-pressed={key === selected}
              onClick={() => pick(d)}
              style={{ position: "relative" }}
              dangerouslySetInnerHTML={{
                __html:
                  iconSvg(d) + (scope === "all" ? `<span class="search-result-tag">${d.prefix.slice(0, 6)}</span>` : ""),
              }}
            />
          );
        })}
        {scope === "set" && icons.length < total && (
          <button type="button" className="more" disabled={loading} onClick={() => setOffset(icons.length)}>
            {loading ? "Loading…" : `Show more (${icons.length.toLocaleString()} / ${total.toLocaleString()})`}
          </button>
        )}
        {scope === "all" && total > icons.length && <div className="more">Showing {icons.length} of {total.toLocaleString()}, refine your search</div>}
      </div>
      {meta && scope === "set" && (
        <div className="setinfo">
          <span>
            {meta.author} · {meta.license}
          </span>
          {meta.licenseUrl && (
            <a href={meta.licenseUrl} target="_blank" rel="noreferrer">
              License
            </a>
          )}
        </div>
      )}
    </div>
  );
}
