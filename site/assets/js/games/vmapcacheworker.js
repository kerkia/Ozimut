// i18n-ignore-file (no text of the interface here)
// games/vmapcache.js's writer, in a worker: a drawn map (an ImageBitmap) encoded as a PNG and kept in IndexedDB
// « ocn-virtually », the oldest beyond `keep` dropped — the encoding of a 16-megapixel map took 2.5 s of the page's thread.
self.onmessage = async (e) => {
  const { key, bm, ppm, db: name, store, keep } = e.data;
  try {
    const c = new OffscreenCanvas(bm.width, bm.height);
    c.getContext("2d").drawImage(bm, 0, 0); bm.close?.();
    const blob = await c.convertToBlob({ type: "image/png" });          // exact (a lossless WebP of 16 megapixels took far longer)
    const db = await new Promise((res, rej) => {
      const q = indexedDB.open(name, 1);
      q.onupgradeneeded = () => q.result.createObjectStore(store);
      q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error);
    });
    await new Promise((res, rej) => {
      const t = db.transaction(store, "readwrite"), s = t.objectStore(store), all = [];
      s.openCursor().onsuccess = (ev) => {
        const cur = ev.target.result;
        if (cur) { all.push([cur.key, cur.value?.at || 0]); cur.continue(); return; }
        all.sort((a, b) => b[1] - a[1]);
        for (const [k] of all.slice(keep - 1)) s.delete(k);
        s.put({ blob, ppm, at: Date.now() }, key);
      };
      t.oncomplete = res; t.onerror = () => rej(t.error); t.onabort = () => rej(t.error);
    });
    db.close();
    self.postMessage({ ok: true, bytes: blob.size });
  } catch (err) { self.postMessage({ ok: false, error: String(err) }); }
  self.close();
};
