// QR codes on the course maps (owner, 2026-11-16, after the OCAD study): a special object, a square of black modules drawn as
// vectors with the course — on the screen, in the PDFs and the images — that takes the runner from the paper to a page: the
// race's results or start times on Ozimut, the event's analyses (« send your trace »), or any address. The code is made in
// the browser by the vendored qrcode-generator (the one of « Depuis mon téléphone »); nothing is asked of any service.

import { QRCODE } from "../vendor.js";
import { modal, field } from "./dialogs.js";
import { t } from "./lang.js";

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
let lib = null, loading = null;
const cache = new Map();
/** The library, loaded once; the editor lays its objects out again when it comes (the fonts' event). */
export function loadQr() {
  return (loading ||= import(QRCODE).then((m) => { lib = m.qrcode || m.default; window.dispatchEvent(new CustomEvent("tr-fonts")); return lib; }).catch((e) => { loading = null; throw e; }));
}
/** A text's code: { n (modules a side), dark(row, col) }, or null while the library loads (or the text is too long). */
export function qrMatrix(text) {
  const s = String(text || "").trim();
  if (!s) return null;
  if (cache.has(s)) return cache.get(s);
  if (!lib) { loadQr().catch(() => {}); return null; }
  let out = null;
  try { const q = lib(0, "M"); q.addData(s, "Byte"); q.make(); const n = q.getModuleCount(); out = { n, dark: (r, c) => q.isDark(r, c) }; } catch (e) { out = null; }
  cache.set(s, out);
  return out;
}
/** The drawing of a code in a box [l, b, r, t] (map mm): a white square (the quiet zone, two modules), then the dark modules as
 *  one filled path — rows of adjoining modules as single rectangles. → items for draw.js. */
export function qrItems(box, text) {
  const [l, b, r, tp] = box, side = Math.min(r - l, tp - b), x0 = l + (r - l - side) / 2, y1 = tp - (tp - b - side) / 2;
  const sq = (x, y, w, h) => [["M", x, y], ["L", x + w, y], ["L", x + w, y - h], ["L", x, y - h], ["Z"]];
  const items = [{ t: "path", d: sq(x0, y1, side, side), fill: true, color: "white" }];
  const m = qrMatrix(text);
  if (!m) { items.push({ t: "path", d: sq(x0, y1, side, side), stroke: 0.2, cap: "butt", join: "miter", color: "black" }); return items; }
  const q = 2, u = side / (m.n + 2 * q), d = [];
  for (let row = 0; row < m.n; row++) {
    let c = 0;
    while (c < m.n) {
      if (!m.dark(row, c)) { c++; continue; }
      let e = c; while (e + 1 < m.n && m.dark(row, e + 1)) e++;
      d.push(...sq(x0 + (q + c) * u, y1 - (q + row) * u, (e - c + 1) * u, u));
      c = e + 1;
    }
  }
  items.push({ t: "path", d, fill: true, color: "black" });
  return items;
}
/** The addresses a code may hold for this event: [[key, label, url]…] — the race's results and start times when the event is a
 *  competition's, the analyses of the event's name, and « another address ». */
export function qrChoices(E) {
  const origin = /^https?:\/\/(localhost|127\.)/.test(location.origin) ? "https://ozimut.com" : location.origin, race = E.meta?.race || "";
  const out = [];
  if (race) { out.push(["results", t("trc.qr.results"), `${origin}/#/resultats?course=${encodeURIComponent(race)}`]); out.push(["starts", t("trc.qr.starts"), `${origin}/#/horaire?course=${encodeURIComponent(race)}`]); }
  out.push(["analysis", t("trc.qr.analysis"), `${origin}/#/analyses?q=${encodeURIComponent((E.ev.title || "").replace(/\|/g, " ").slice(0, 60))}`]);
  return out;
}
/** The dialog of a QR code (a new one: id null): what it leads to; then(look) with { text, qr: the choice's key }. */
export async function qrProps(E, id, then) {
  const sp = id ? E.ev.specials[id] : null, choices = qrChoices(E);
  const cur = sp ? (choices.find((c) => c[0] === sp.qr && c[2] === sp.text)?.[0] || "other") : choices[0][0];
  const v = await modal(E, { title: t("trc.qr.title"), body: `
    <p>${esc(t("trc.qr.intro"))}</p>
    ${choices.map(([k, label, url]) => `<label class="tr-check"><input type="radio" name="k" value="${k}" ${cur === k ? "checked" : ""}> ${esc(label)}<br><small>${esc(url)}</small></label>`).join("")}
    <label class="tr-check"><input type="radio" name="k" value="other" ${cur === "other" ? "checked" : ""}> ${esc(t("trc.qr.other"))}</label>
    ${field(t("trc.qr.url"), `<input name="url" value="${esc(cur === "other" && sp ? sp.text : "")}" placeholder="https://…" maxlength="300">`)}
    <p class="tr-hint">${esc(t("trc.qr.hint"))}</p>`,
  validate: (o) => (o.k === "other" && !/^https?:\/\/\S+\.\S+/.test(o.url.trim()) ? t("trc.qr.badUrl") : null) });
  if (!v) return;
  await loadQr().catch(() => {});
  const c = choices.find((x) => x[0] === v.k);
  then({ text: c ? c[2] : v.url.trim(), qr: c ? c[0] : "other" });
}
