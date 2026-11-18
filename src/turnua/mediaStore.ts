/* Media library files. Seed photos live in /public; uploads are kept as blobs
   in this browser's IndexedDB so images and videos survive a reload without
   filling localStorage. Only the metadata goes in the main store. */
import type { MediaItem } from "./types";

const DB_NAME = "turnua-os-media";
const STORE = "files";
let dbp: Promise<IDBDatabase> | null = null;
function open(): Promise<IDBDatabase> {
  if (dbp) return dbp;
  dbp = new Promise((res, rej) => {
    const r = indexedDB.open(DB_NAME, 1);
    r.onupgradeneeded = () => { r.result.createObjectStore(STORE); };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
  return dbp;
}
export async function putBlob(key: string, blob: Blob): Promise<void> {
  const db = await open();
  await new Promise<void>((res, rej) => { const tx = db.transaction(STORE, "readwrite"); tx.objectStore(STORE).put(blob, key); tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); });
}
export async function getBlob(key: string): Promise<Blob | null> {
  const db = await open();
  return new Promise((res, rej) => { const tx = db.transaction(STORE, "readonly"); const q = tx.objectStore(STORE).get(key); q.onsuccess = () => res((q.result as Blob) || null); q.onerror = () => rej(q.error); });
}
export async function delBlob(key: string): Promise<void> {
  const db = await open();
  await new Promise<void>((res) => { const tx = db.transaction(STORE, "readwrite"); tx.objectStore(STORE).delete(key); tx.oncomplete = () => res(); tx.onerror = () => res(); });
}

const urls = new Map<string, string>();
/** A URL the browser can load for a library item, or null if the file is gone. */
export async function urlOf(m: Pick<MediaItem, "src">): Promise<string | null> {
  if (!m.src.startsWith("idb:")) return m.src;
  const key = m.src.slice(4);
  if (urls.has(key)) return urls.get(key)!;
  try {
    const b = await getBlob(key);
    if (!b) return null;
    const u = URL.createObjectURL(b);
    urls.set(key, u);
    return u;
  } catch { return null; }
}
export function cachedUrl(m: Pick<MediaItem, "src">): string | null {
  return m.src.startsWith("idb:") ? urls.get(m.src.slice(4)) || null : m.src;
}

/** Load a library item into an element the canvas can draw. */
export async function loadElement(m: MediaItem): Promise<{ el: HTMLImageElement | HTMLVideoElement; w: number; h: number; url: string } | null> {
  const url = await urlOf(m);
  if (!url) return null;
  if (m.kind === "image") {
    return new Promise((res) => { const i = new Image(); i.onload = () => res({ el: i, w: i.naturalWidth, h: i.naturalHeight, url }); i.onerror = () => res(null); i.src = url; });
  }
  return new Promise((res) => {
    const v = document.createElement("video");
    v.muted = true; v.playsInline = true; v.preload = "auto"; v.src = url;
    v.onloadeddata = () => { v.currentTime = Math.min(1, (v.duration || 2) / 3); };
    v.onseeked = () => { v.onseeked = null; res({ el: v, w: v.videoWidth, h: v.videoHeight, url }); };
    v.onerror = () => res(null);
  });
}

/** Read a dropped or chosen file: images over 2400px are scaled down first. */
export async function ingest(file: File): Promise<{ blob: Blob; kind: "image" | "video"; w: number; h: number } | null> {
  if (file.type.startsWith("image/")) {
    const url = URL.createObjectURL(file);
    const img = await new Promise<HTMLImageElement | null>((res) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = url; });
    if (!img) return null;
    const max = 2400;
    const s = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    if (s === 1) return { blob: file, kind: "image", w: img.naturalWidth, h: img.naturalHeight };
    const c = document.createElement("canvas");
    c.width = Math.round(img.naturalWidth * s); c.height = Math.round(img.naturalHeight * s);
    c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
    const blob = await new Promise<Blob | null>((res) => c.toBlob(res, "image/jpeg", 0.9));
    URL.revokeObjectURL(url);
    return blob ? { blob, kind: "image", w: c.width, h: c.height } : null;
  }
  if (file.type.startsWith("video/")) {
    const url = URL.createObjectURL(file);
    const dims = await new Promise<{ w: number; h: number }>((res) => { const v = document.createElement("video"); v.preload = "metadata"; v.onloadedmetadata = () => res({ w: v.videoWidth, h: v.videoHeight }); v.onerror = () => res({ w: 1080, h: 1920 }); v.src = url; });
    URL.revokeObjectURL(url);
    return { blob: file, kind: "video", ...dims };
  }
  return null;
}
