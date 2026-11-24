// A map file read in the browser, for the Analyse pages: an image (PNG, JPEG, WebP, GIF, BMP) as an ImageBitmap, or a
// PDF's first page rendered on a canvas by pdf.js (served from /assets/vendor, loaded only when a PDF comes). imageBlob() gives the
// map back as a file to store, never degraded: the original image when it is one, else a lossless PNG of the rendering.

import { PDFJS, PDFJS_WORKER } from "../vendor.js";
const MAX_SIDE = 4200;                                 // a PDF page rendered at most this wide or high

export const isImage = (f) => /\.(png|jpe?g|webp|gif|bmp|pdf)$/i.test(f.name) || f.type.startsWith("image/") || f.type === "application/pdf";

/** The map as an ImageBitmap (an image) or a canvas (a PDF's first page). Throws "pdf" or "map". */
export async function readMap(file) {
  if (/\.pdf$/i.test(file.name) || file.type === "application/pdf") {
    let pdfjs;
    try { pdfjs = await import(/* webpackIgnore: true */ PDFJS); } catch (e) { throw new Error("pdf"); }
    try {
      pdfjs.GlobalWorkerOptions.workerSrc = PDFJS_WORKER;
      const pdf = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
      const page = await pdf.getPage(1);
      const v1 = page.getViewport({ scale: 1 });
      const scale = Math.min(MAX_SIDE / v1.width, MAX_SIDE / v1.height, 6);
      const vp = page.getViewport({ scale });
      const c = document.createElement("canvas");
      c.width = Math.round(vp.width); c.height = Math.round(vp.height);
      await page.render({ canvasContext: c.getContext("2d"), viewport: vp }).promise;
      // a scanned page — one image filling it, nothing else drawn — also at the scan's own pixels (`native`, a canvas): drawn
      // at another size the browser enlarges the scan without smoothing, blocks of pixels, and the routes' reading of its
      // metre-wide lanes and thin walls suffered (owner, 2026-11-24); the map shown, read for its course and kept stays `c`
      try {
        const ops = await page.getOperatorList(), O = pdfjs.OPS;
        const drawn = new Set([O.paintImageXObject, O.paintInlineImageXObject, O.paintImageMaskXObject, O.paintImageXObjectRepeat, O.constructPath, O.showText, O.showSpacedText, O.shadingFill, O.paintFormXObjectBegin].filter((v) => v != null));
        const marks = ops.fnArray.map((f, i) => [f, ops.argsArray[i]]).filter(([f]) => drawn.has(f));
        if (marks.length === 1 && marks[0][0] === O.paintImageXObject) {
          const iw = Number(marks[0][1]?.[1]), ih = Number(marks[0][1]?.[2]), s = iw / v1.width;
          if (iw > 0 && ih > 0 && Math.abs(ih / (v1.height * s) - 1) < 0.005 && s >= 1 && s <= 12 && iw * ih <= 40e6 && Math.abs(s - scale) > 0.01) {
            const vn = page.getViewport({ scale: s }), n = document.createElement("canvas");
            n.width = Math.round(vn.width); n.height = Math.round(vn.height);
            await page.render({ canvasContext: n.getContext("2d"), viewport: vn }).promise;
            c.native = n;
          }
        }
      } catch (e) { /* the page as drawn serves */ }
      return c;
    } catch (e) { throw new Error("pdf"); }
  }
  try { return await createImageBitmap(file); } catch (e) { throw new Error("map"); }
}

/** An image file's type, from its name when the system gave none. */
const typeOf = (f) => f.type || ({ png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp" })[(f.name.split(".").pop() || "").toLowerCase()] || "";

/**
 * The map as a file to keep, at its full resolution and quality (owner, 2026-10-14: a stored map is never degraded):
 * a JPEG or WebP image exactly as it came; a PNG, and anything else — a PDF's page as rendered, a GIF, a BMP — as a lossless
 * WebP when the browser makes one whose every pixel is the same and which is smaller (owner, 2026-11-06: « WebP to store all
 * images, if the impact on quality is non-existent »), else as a PNG (the PNG as it came). Returns a Blob with its type.
 */
export async function imageBlob(file, image) {
  const type = file ? typeOf(file) : "";
  if (/^image\/(jpeg|webp)$/.test(type)) return file.type === type ? file : new Blob([file], { type });
  const png = type === "image/png" ? (file.type === type ? file : new Blob([file], { type })) : null;
  const c = document.createElement("canvas");
  c.width = image.width; c.height = image.height;
  c.getContext("2d").drawImage(image, 0, 0);
  const webp = await losslessWebp(c).catch(() => null);
  if (webp && (!png || webp.size < png.size)) return webp;
  if (png) return png;
  const b = await new Promise((res) => c.toBlob((x) => res(x), "image/png"));
  if (!b) throw new Error("map");
  return b;
}

const WEBP_MAX = 64e6;                                 // pixels: beyond, two canvases of it would strain a browser
/**
 * A canvas as a lossless WebP, checked: decoded again and compared with the canvas pixel for pixel, in bands of rows — null
 * when the browser makes no WebP (Safari makes a PNG), makes a lossy one, or any pixel differs.
 */
export async function losslessWebp(c) {
  if (c.width * c.height > WEBP_MAX) return null;
  const b = await new Promise((res) => c.toBlob((x) => res(x), "image/webp", 1));
  if (!b || b.type !== "image/webp") return null;
  const back = await createImageBitmap(b);
  try {
    if (back.width !== c.width || back.height !== c.height) return null;
    const d = document.createElement("canvas");
    d.width = c.width; d.height = c.height;
    const g2 = d.getContext("2d", { willReadFrequently: true }), g1 = c.getContext("2d", { willReadFrequently: true });
    g2.drawImage(back, 0, 0);
    const band = Math.max(1, Math.floor(4e6 / c.width));
    for (let y = 0; y < c.height; y += band) {
      const h = Math.min(band, c.height - y), a = g1.getImageData(0, y, c.width, h).data, z = g2.getImageData(0, y, c.width, h).data;
      for (let i = 0; i < a.length; i++) if (a[i] !== z[i]) return null;
    }
    return b;
  } finally { back.close?.(); }
}
