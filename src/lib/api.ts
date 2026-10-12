export interface CollectionMeta {
  prefix: string;
  name: string;
  total: number;
  author: string;
  license: string;
  licenseUrl: string;
  category: string;
  palette: boolean;
  samples: string[];
  height: number;
}

export interface IconData {
  prefix: string;
  name: string;
  width: number;
  height: number;
  body: string;
}

export interface SetPage {
  prefix: string;
  width: number;
  height: number;
  total: number;
  categories: string[];
  icons: Record<string, { body: string; width?: number; height?: number }>;
}

/**
 * Where icons come from. Unset: the Vite dev server's middleware over the bundled @iconify/json
 * (local use, ~400k icons on disk). Set to e.g. https://api.iconify.design: the public Iconify API,
 * which is what the static deployment uses; there is no server of our own in that mode, so the
 * paid AI panel is hidden too (see STATIC).
 */
export const ICONIFY_API: string | undefined = import.meta.env.VITE_ICONIFY_API || undefined;
export const STATIC = !!ICONIFY_API;

const api = (p: string) => `${ICONIFY_API}${p}`;

let collectionsCache: Promise<CollectionMeta[]> | null = null;
export function fetchCollections() {
  if (!collectionsCache) collectionsCache = STATIC ? remoteCollections() : fetch("/api/collections").then((r) => r.json());
  return collectionsCache;
}

export async function fetchSet(prefix: string, q: string, offset: number, limit = 400): Promise<SetPage> {
  if (STATIC) return remoteSet(prefix, q, offset, limit);
  const u = new URLSearchParams({ q, offset: String(offset), limit: String(limit) });
  const r = await fetch(`/api/set/${prefix}?${u}`);
  if (!r.ok) throw new Error("set fetch failed");
  return r.json();
}

export async function fetchIcon(prefix: string, name: string): Promise<IconData> {
  if (STATIC) {
    const [icon] = await remoteIcons(prefix, [name]);
    if (!icon) throw new Error("icon fetch failed");
    return icon;
  }
  const r = await fetch(`/api/icon/${prefix}/${name}`);
  if (!r.ok) throw new Error("icon fetch failed");
  return r.json();
}

export async function searchAll(q: string, limit = 300): Promise<{ total: number; results: IconData[] }> {
  if (STATIC) return remoteSearch(q, limit);
  const r = await fetch(`/api/search?${new URLSearchParams({ q, limit: String(limit) })}`);
  return r.json();
}

export function iconSvg(d: { body: string; width: number; height: number }, color = "currentColor") {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${d.width} ${d.height}" width="100%" height="100%" style="color:${color}">${d.body}</svg>`;
}

// ---------- public Iconify API (https://iconify.design/docs/api/) ----------

type RemoteCollection = {
  name: string;
  total: number;
  author?: { name?: string; url?: string };
  license?: { title?: string; spdx?: string; url?: string };
  category?: string;
  palette?: boolean;
  samples?: string[];
  height?: number | number[];
  hidden?: boolean;
};

async function remoteCollections(): Promise<CollectionMeta[]> {
  const r = await fetch(api("/collections"));
  if (!r.ok) throw new Error("collections fetch failed");
  const all = (await r.json()) as Record<string, RemoteCollection>;
  return Object.entries(all)
    .filter(([, c]) => !c.hidden)
    .map(([prefix, c]) => ({
      prefix,
      name: c.name,
      total: c.total,
      author: c.author?.name ?? "",
      license: c.license?.title ?? c.license?.spdx ?? "",
      licenseUrl: c.license?.url ?? "",
      category: c.category ?? "Other",
      palette: !!c.palette,
      samples: c.samples ?? [],
      height: Array.isArray(c.height) ? c.height[0] : (c.height ?? 24),
    }));
}

/** Icon names of one set, in the API's order; cached per prefix because the list never changes within a session. */
const setNames = new Map<string, Promise<{ names: string[]; categories: string[] }>>();
function remoteSetNames(prefix: string) {
  let p = setNames.get(prefix);
  if (!p) {
    p = fetch(api(`/collection?${new URLSearchParams({ prefix })}`)).then(async (r) => {
      if (!r.ok) throw new Error("set fetch failed");
      const d = (await r.json()) as { uncategorized?: string[]; categories?: Record<string, string[]> };
      const categories = Object.keys(d.categories ?? {});
      const names = [...(d.uncategorized ?? []), ...categories.flatMap((c) => d.categories![c])];
      return { names: [...new Set(names)], categories };
    });
    setNames.set(prefix, p);
  }
  return p;
}

async function remoteIcons(prefix: string, names: string[]): Promise<IconData[]> {
  if (!names.length) return [];
  const r = await fetch(api(`/${prefix}.json?${new URLSearchParams({ icons: names.join(",") })}`));
  if (!r.ok) throw new Error("icon fetch failed");
  const d = (await r.json()) as { width?: number; height?: number; icons: Record<string, { body: string; width?: number; height?: number }> };
  return names
    .filter((n) => d.icons[n])
    .map((name) => ({ prefix, name, body: d.icons[name].body, width: d.icons[name].width ?? d.width ?? 16, height: d.icons[name].height ?? d.height ?? 16 }));
}

async function remoteSet(prefix: string, q: string, offset: number, limit: number): Promise<SetPage> {
  const { names, categories } = await remoteSetNames(prefix);
  const needle = q.trim().toLowerCase();
  const matching = needle ? names.filter((n) => n.includes(needle)) : names;
  const page = matching.slice(offset, offset + limit);
  const icons = await remoteIcons(prefix, page);
  const first = icons[0];
  return {
    prefix,
    width: first?.width ?? 24,
    height: first?.height ?? 24,
    total: matching.length,
    categories,
    icons: Object.fromEntries(icons.map((i) => [i.name, { body: i.body, width: i.width, height: i.height }])),
  };
}

async function remoteSearch(q: string, limit: number): Promise<{ total: number; results: IconData[] }> {
  if (!q.trim()) return { total: 0, results: [] };
  const r = await fetch(api(`/search?${new URLSearchParams({ query: q, limit: String(Math.min(limit, 999)) })}`));
  if (!r.ok) throw new Error("search failed");
  const d = (await r.json()) as { icons: string[]; total: number };
  const byPrefix = new Map<string, string[]>();
  for (const id of d.icons) {
    const [prefix, name] = id.split(":");
    if (prefix && name) (byPrefix.get(prefix) ?? byPrefix.set(prefix, []).get(prefix)!).push(name);
  }
  const fetched = await Promise.all([...byPrefix].map(([prefix, names]) => remoteIcons(prefix, names)));
  const lookup = new Map(fetched.flat().map((i) => [`${i.prefix}:${i.name}`, i]));
  return { total: d.total, results: d.icons.map((id) => lookup.get(id)).filter((i): i is IconData => !!i) };
}
