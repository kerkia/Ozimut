// i18n-ignore-file (no text of the interface here)
// « Virtually »'s drawn maps kept in the browser (owner, 2026-11-14: Gif's race took « an eternity » to load; drawing its
// 14 MB OCAD map takes 3-5 s on a computer, more on a phone): the image games/virtually.js drawMap makes, as a PNG (encoded by
// a worker, games/vmapcacheworker.js) in IndexedDB « ocn-virtually », keyed by the OCAD file's SHA-256, the drawing's settings
// and the site's build (a new renderer draws again). A second race on the same map shows it in a fraction of a second. The last few maps only (KEEP).

const DB = "ocn-virtually", STORE = "maps", KEEP = 6, VERSION = 1;
let buildP = null;
const build = () => (buildP ||= fetch("/assets/build.txt").then((r) => (r.ok ? r.text() : "")).then((s) => (/^[0-9a-f]{8,40}$/.test(s.trim()) ? s.trim() : "")).catch(() => ""));   // none on a local server

function open() {
  return new Promise((res, rej) => {
    const q = indexedDB.open(DB, 1);
    q.onupgradeneeded = () => q.result.createObjectStore(STORE);
    q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error);
  });
}
const tx = (db, mode, f) => new Promise((res, rej) => {
  const t = db.transaction(STORE, mode), s = t.objectStore(STORE), out = f(s);
  t.oncomplete = () => res(out?.result); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error);
});

/** The key of a map's drawing: its file's hash, the settings, the build. */
export async function mapKey(bytes, settings) {
  const h = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return `${VERSION}|${await build()}|${settings}|${[...h.slice(0, 16)].map((b) => b.toString(16).padStart(2, "0")).join("")}`;
}

/** The drawn map kept under `key`, as a canvas; null when there is none (or IndexedDB is not there). */
export async function getMap(key) {
  try {
    const db = await open(), rec = await tx(db, "readonly", (s) => s.get(key)); db.close();
    if (!rec?.blob) return null;
    const bm = await createImageBitmap(rec.blob);
    const c = document.createElement("canvas"); c.width = bm.width; c.height = bm.height;
    c.getContext("2d").drawImage(bm, 0, 0); bm.close?.();
    return { canvas: c, ppm: rec.ppm };
  } catch (e) { return null; }
}

/** Keep a drawn map, in the background (games/vmapcacheworker.js: encoded and stored off the page's thread). */
export async function putMap(key, canvas, ppm) {
  try {
    const bm = await createImageBitmap(canvas);
    const w = new Worker(new URL("./vmapcacheworker.js", import.meta.url));
    w.onmessage = () => w.terminate(); w.onerror = () => w.terminate();
    w.postMessage({ key, bm, ppm, db: DB, store: STORE, keep: KEEP }, [bm]);
  } catch (e) { /* not kept: drawn again next time */ }
}
