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

let collectionsCache: Promise<CollectionMeta[]> | null = null;
export function fetchCollections() {
  if (!collectionsCache) collectionsCache = fetch("/api/collections").then((r) => r.json());
  return collectionsCache;
}

export async function fetchSet(prefix: string, q: string, offset: number, limit = 400): Promise<SetPage> {
  const u = new URLSearchParams({ q, offset: String(offset), limit: String(limit) });
  const r = await fetch(`/api/set/${prefix}?${u}`);
  if (!r.ok) throw new Error("set fetch failed");
  return r.json();
}

export async function fetchIcon(prefix: string, name: string): Promise<IconData> {
  const r = await fetch(`/api/icon/${prefix}/${name}`);
  if (!r.ok) throw new Error("icon fetch failed");
  return r.json();
}

export async function searchAll(q: string, limit = 300): Promise<{ total: number; results: IconData[] }> {
  const r = await fetch(`/api/search?${new URLSearchParams({ q, limit: String(limit) })}`);
  return r.json();
}

export function iconSvg(d: { body: string; width: number; height: number }, color = "currentColor") {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${d.width} ${d.height}" width="100%" height="100%" style="color:${color}">${d.body}</svg>`;
}
