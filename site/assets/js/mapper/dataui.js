// Cartographier's « Données »: open data brought in as objects the mapper can edit — contours from the terrain model (IGN's
// RGE ALTI in France, else the world's terrain tiles), OpenStreetMap's roads, paths, buildings, water and fences, and the
// LiDAR's contours, cliffs, knolls and pits (karttapullautin's results, the tiles made by the « lidarmap » workflow) with its
// vegetation as a background. Everything comes in a part of its own, « Brouillon », each object marked with its source
// (`src`) and `draft`, never mixed silently with what was surveyed: « Accepter » moves it into the map, « Rejeter » drops it.
// The area: the print area, else what is on the screen. Owner, 2026-11-06: the Tracer's « Générer une carte » moved here.
// « Plan de ville (sprint) » (2026-11-12): a sprint map's town made by tools/virtually/town_map.py on GitHub (the townmap
// workflow: LiDAR, BD TOPO, BD ORTHO, cadastre, OpenStreetMap), one engine with Pixel's town races; « Nouvelle carte » sprint in
// France uses it in place of the separate national, OpenStreetMap and contour imports.

import * as G from "./geom.js";
import { modal, field, sel } from "../tracer/dialogs.js";
import { setBar } from "../waitbar.js";
import { t, tn, locale } from "./lang.js";
import { areaCoords as areaCoordsOf, bezier as bezierOf, lineCoords as lineCoordsOf } from "./data/frame.js";

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const DRAFT = "draft", HELP_PART = "lidarhelp";

/** The rectangle (map mm) the data is asked for: the one chosen, else the print area, else the screen. */
function areaOf(E) { return E.dataArea || E.doc.printArea || E.view.visibleRect(); }
const styleOf = (E) => (/ISSprOM/i.test(E.doc.standard || "") || E.doc.scale <= 5000 ? "sprint" : "forest");
/** A draft contour from an import (101-103: contours, index contours, form lines, their slope lines), by its source. */
const CONTOUR_SRC = new Set(["dem", "town", "lidar"]);
const isDraftContour = (o) => o.draft && CONTOUR_SRC.has(o.src) && Math.floor(o.sym / 1000) >= 101 && Math.floor(o.sym / 1000) <= 103;
const isContourSym = (sym) => Math.floor(sym / 1000) >= 101 && Math.floor(sym / 1000) <= 103;
/**
 * One set of contours in the draft (owner, 2026-11-12: the terrain model's, the town plan's and the LiDAR's came in together, « un
 * million de courbes »): before an import brings contours from `src` ("dem", "town", "lidar"), draft contours already there from an
 * earlier import are offered for replacement. Resolves true when the new contours are to come in (the old ones then removed, or
 * none there), false when the old ones are kept (the import then brings no contours).
 */
async function oneContourSet(E, src) {
  const old = E.doc.objects.filter(isDraftContour);
  if (!old.length) return true;
  const from = [...new Set(old.map((o) => o.src))].map((k) => t(`map.data.csrc.${k}`)).join(", ");
  const { confirmBox } = await import("../askbox.js");
  const yes = await confirmBox(tn("map.data.contoursReplace", old.length, { from, to: t(`map.data.csrc.${src}`) }),
    { ok: t("map.data.contoursReplaceOk"), cancel: t("map.data.contoursKeep") });
  if (!yes) return false;
  E.live.transact(t("map.undo.reject"), () => { for (const o of old) E.live.remove(o.id); });
  E.sel?.clear?.(); E.selChanged?.();
  return true;
}
function draftPart(E) {
  if (!E.doc.parts.some((p) => p.id === DRAFT)) E.live.setDocField("parts", [...E.doc.parts, { id: DRAFT, name: t("map.parts.draft"), hidden: false, locked: false }]);
  return DRAFT;
}
/** The LiDAR's helper contours' part (2026-11-12): apart from the draft, never « accepted » into the map, hidden at will. */
function helpPart(E) {
  if (!E.doc.parts.some((p) => p.id === HELP_PART)) E.live.setDocField("parts", [...E.doc.parts, { id: HELP_PART, name: t("map.parts.lidarHelp"), hidden: false, locked: false }]);
  return HELP_PART;
}
/** Objects from a data module into the document, in the draft part (opts.helpers: the helper contours' part, not drafts);
 *  symbols the map lacks are named and their objects left out.
 *  ISOM 2017-2's revision 6 numbered 105, 203 and 513 as 105.1, 203.1 and 513.1 and added .2 forms: a map made with the set of
 *  before takes them on its plain number, and a plain number finds its .1. */
function bring(E, objects, label, opts = {}) {
  const have = new Set(E.doc.symbols.map((s) => s.sym)), missing = new Map();
  const symIn = (sym) => {
    if (have.has(sym)) return sym;
    const base = sym - (sym % 1000);
    return sym % 1000 ? (have.has(base) ? base : sym) : have.has(base + 1) ? base + 1 : sym;
  };
  let n = 0;
  E.live.transact(label, () => {
    const part = opts.helpers ? helpPart(E) : draftPart(E), draft = !opts.helpers;
    for (const o of objects) {
      const sym = symIn(o.sym);
      if (!have.has(sym)) { missing.set(o.sym, (missing.get(o.sym) || 0) + 1); continue; }
      E.live.add({ ang: 0, col: 0, lineWidth: 0, diamFlags: 0, ...o, sym, part, draft });
      n++;
    }
  });
  if (missing.size) E.say(t("map.data.missing", { list: [...missing.keys()].map((s) => `${Math.floor(s / 1000)}${s % 1000 ? "." + (s % 1000) : ""}`).join(", ") }), "bad");
  return n;
}
async function frameOrSay(E) {
  const f = E.frame || (await import("./data/frame.js").then((F) => F.frameOf(E.doc)).catch(() => null));
  if (!f?.geo) { E.say(t("map.data.nogeo"), "bad"); return null; }
  return f;
}
/** A progress bar in the toast (waitbar.js: the browser's own <progress>, none while the share is unknown). */
function progress(E) {
  const el = E.$("#mp-toast");
  return (msg, frac = null) => { el.hidden = false; el.className = "mp-toast busy"; el.innerHTML = `${esc(msg)} ${setBar ? "" : ""}<progress class="wait-bar" max="1"${frac != null ? ` value="${frac}"` : ""}></progress>`; };
}

export async function act(E, act) {
  if (act === "data-area") return chooseArea(E);
  if (act === "data-contours") return contours(E);
  if (act === "data-osm") return osm(E);
  if (act === "data-bdtopo" || act === "data-national") return national(E);
  if (act === "data-town") return townDialog(E);
  if (act === "data-lidar") return lidar(E);
  if (act === "draft-accept") return accept(E, false);
  if (act === "draft-acceptKind") return accept(E, true);
  if (act === "draft-reject") return reject(E);
}
async function chooseArea(E) {
  const v = await modal(E, { title: t("map.rib.data-area"), ok: t("map.ok.apply"), body: field(t("map.data.area"), sel("a", [["screen", t("map.data.area.screen")], ["print", t("map.data.area.print")], ["map", t("map.data.area.map")]], "screen")) });
  if (!v) return;
  E.dataArea = v.a === "print" ? E.doc.printArea : v.a === "map" ? E.live.bounds() : E.view.visibleRect();
  E.say(t("map.data.areaSet"));
}
/** The middle of the area the data is read for, [lat, lon], and what Cartographier supports there (support.js). */
async function placeOf(E, f) {
  const b = areaOf(E), [lat, lon] = f.toLatLon((b[0] + b[2]) / 2, (b[1] + b[3]) / 2);
  const SP = await import("./support.js");
  return { lat, lon, s: await SP.at(lat, lon), SP };
}
/** The map's buildings (521 areas, the town plan's included) as rings [[x, y]…] in map mm: where a sprint map's contours stop. */
function buildingRings(E) {
  return E.doc.objects.filter((o) => o.otp === 3 && Math.floor(o.sym / 1000) === 521)
    .map((o) => G.partsOf(o.coords).map((p) => G.flatten(p.pts, 0.05).map(([x, y]) => [x, y])));
}
/**
 * Where a sprint map already has its own relief, as covered(x, y) in map mm: 25 m cells under a town plan's objects (their boxes)
 * or near contours not from karttapullautin (two cells round each line's points). karttapullautin's contours and knolls are left
 * out there (owner, 2026-11-12: its dense lines over the town plan's own).
 */
function reliefCover(E) {
  const c = 25000 / E.doc.scale, cells = new Set(), key = (i, j) => `${i},${j}`;
  for (const o of E.doc.objects) {
    const n = Math.floor(o.sym / 1000), town = o.src === "town", contour = n >= 101 && n <= 103 && o.src !== "lidar";
    if (!town && !contour) continue;
    const xs = o.coords.map(G.mmX), ys = o.coords.map(G.mmY);
    if (town) {
      const lo = (v) => v.reduce((m, x) => (x < m ? x : m), Infinity), hi = (v) => v.reduce((m, x) => (x > m ? x : m), -Infinity);
      const i0 = Math.floor(lo(xs) / c), i1 = Math.floor(hi(xs) / c), j0 = Math.floor(lo(ys) / c), j1 = Math.floor(hi(ys) / c);
      if ((i1 - i0 + 1) * (j1 - j0 + 1) > 40000) continue;
      for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) cells.add(key(i, j));
    } else for (let k = 0; k < xs.length; k++) {
      const i = Math.floor(xs[k] / c), j = Math.floor(ys[k] / c);
      for (let di = -2; di <= 2; di++) for (let dj = -2; dj <= 2; dj++) cells.add(key(i + di, j + dj));
    }
  }
  return cells.size ? (x, y) => cells.has(key(Math.floor(x / c), Math.floor(y / c))) : null;
}
async function contours(E) {
  const f = await frameOrSay(E); if (!f) return;
  const P = await placeOf(E, f).catch(() => null);
  const sprint = styleOf(E) === "sprint";
  const v = await modal(E, { title: t("map.rib.data-contours"), ok: t("map.ok.add"), body: field(t("map.data.interval"), sel("i", [["2.5", "2,5 m"], ["5", "5 m"], ["10", "10 m"]], sprint ? "2.5" : "5")) + `<p class="mp-hint">${esc(t("map.data.contoursHint"))}</p>` + (sprint ? `<p class="mp-hint">${esc(t("map.data.contoursSprint"))}</p>` : "") + (P ? P.SP.noteHtml(P.s, P.lat, P.lon, ["dem"]) : "") });
  if (!v) return;
  if (!(await oneContourSet(E, "dem"))) return;
  const say = progress(E);
  say(t("map.data.loadingDem"));
  const C = await import("./data/contours.js");
  // a sprint map's: the town plan's rules, cut at the map's buildings (owner, 2026-11-12: the raw isolines followed every kerb)
  const r = await C.loadContours(f, areaOf(E), { interval: Number(v.i), onProgress: (x) => say(t("map.data.loadingDem"), x), ...(sprint ? { sprint: true, buildings: buildingRings(E) } : {}) });
  const n = bring(E, r.objects, t("map.undo.data"));
  E.say(tn("map.data.brought", n) + (r.credit ? ` · ${r.credit.text || r.credit}` : ""));
}
async function osm(E) {
  const f = await frameOrSay(E); if (!f) return;
  const style = styleOf(E);
  const say = progress(E);
  const O = await import("./data/osm.js");
  say(t("map.data.osm.asking"));
  const r = await O.loadOsm(f, areaOf(E), style, { onStage: (k) => say(t(k)) });
  const n = bring(E, r.objects, t("map.undo.data"));
  E.say(tn("map.data.brought", n) + ` · ${r.attribution}`);
}
/** The country's own vectors (buildings, roads, paths, water…): IGN's BD TOPO in France, swisstopo's swissTLM3D in Switzerland,
 *  The National Map in the USA (data/bdtopo.js, ch.js, us.js); elsewhere OpenStreetMap is the source. */
export async function nationalSource(E, f) {
  const b = areaOf(E), [la, lo] = f.toLatLon((b[0] + b[2]) / 2, (b[1] + b[3]) / 2);
  const { countryAt } = await import("../trace/terrain.js");
  const cc = countryAt(la, lo) || (f.epsg === 2154 ? "FR" : null);
  return { FR: "bdtopo", CH: "swisstopo", US: "tnm" }[cc] || null;
}
async function national(E) {
  const f = await frameOrSay(E); if (!f) return;
  const src = await nationalSource(E, f);
  if (!src) {
    // no national data here yet: OpenStreetMap offered, and the way to ask Ozimut for that country
    const P = await placeOf(E, f).catch(() => null);
    if (P) await P.SP.explain(E, P.s, P.lat, P.lon, ["vectors"]); else E.say(t("map.data.national.none"), "bad");
    return;
  }
  const say = progress(E);
  let r;
  try {
    const onStage = (layer, i, n) => say(t(`map.data.national.reading.${src}`), n ? i / n : null);
    if (src === "bdtopo") r = await (await import("./data/bdtopo.js")).loadBdtopo(f, areaOf(E), styleOf(E), { onStage });
    else if (src === "swisstopo") r = await (await import("./data/ch.js")).loadSwissTlm(f, areaOf(E), styleOf(E), { onStage });
    else r = await (await import("./data/us.js")).loadTnm(f, areaOf(E), styleOf(E), { onStage });
  } catch (e) { E.say(e.message === "nogeo" ? t("map.data.nogeo") : /toolarge/i.test(e.message) ? t("map.data.tooLarge") : e.message, "bad"); return; }
  if (!r.objects.length) { E.say(t("map.data.bdtopo.none"), "bad"); return; }
  const n = bring(E, r.objects, t("map.undo.data"));
  E.say(tn("map.data.brought", n) + ` · ${t({ bdtopo: "map.lay.creditBdtopo", swisstopo: "map.lay.creditSwisstopo", tnm: "map.lay.creditTnm" }[src])}`);
}
// ---- a town's sprint map -------------------------------------------------------------------------------------------------------
/** The ISSprOM set's symbols the town's map uses that a document made before them lacks (501.4, 501.6-501.9, 532.1-532.6, 990,
 *  991, 995), added from the set at the map's scale. */
async function ensureTownSymbols(E) {
  if (!/ISSprOM/i.test(E.doc.standard || "")) return;
  const want = [501004, 501006, 501007, 501008, 501009, 532001, 532002, 532003, 532004, 532005, 532006, 990000, 991000, 995000];
  const have = new Set(E.doc.symbols.map((s) => s.sym)), miss = want.filter((n) => !have.has(n));
  if (!miss.length) return;
  const L = await import("./layout.js");
  const set = await L.loadSet("issprom2019-2");
  const add = L.scaled(set, E.doc.scale).filter((s) => miss.includes(s.sym));
  E.live.transact(t("map.undo.data"), () => { for (const s of add) E.live.addSymbol({ ...s, set: "issprom2019-2" }); });
}
const TOWN_API = "/api/townmap", TOWN_MAX = 2000;           // metres a side (the workflow's limit)
/** The area asked for, in m², from the data area at the map's scale. */
function townArea(E) { const b = areaOf(E), k = (E.doc.scale || 4000) / 1000; return [(b[2] - b[0]) * k, (b[3] - b[1]) * k]; }
const townKey = (E) => `ocn.map.town.${E.id || "local"}`;
const readTown = (E) => { try { return JSON.parse(localStorage.getItem(townKey(E)) || "null"); } catch (e) { return null; } };
const keepTown = (E, v) => { try { if (v) localStorage.setItem(townKey(E), JSON.stringify(v)); else localStorage.removeItem(townKey(E)); } catch (e) { /* private window */ } };
async function townDialog(E) {
  const f = await frameOrSay(E); if (!f) return;
  if (styleOf(E) !== "sprint") { E.say(t("map.data.town.notSprint"), "bad"); return; }
  if ((await nationalSource(E, f)) !== "bdtopo") { E.say(t("map.data.town.notFrance"), "bad"); return; }
  const pending = readTown(E);
  if (pending) return waitTown(E, pending);
  const v = await modal(E, { title: t("map.rib.data-town"), ok: t("map.ok.add"), body: `<p class="mp-hint">${esc(t("map.data.town.hint"))}</p>
    <p class="mp-hint">${esc(t("map.data.town.time"))}</p>
    <label class="mp-row"><input type="checkbox" name="contours" checked> ${esc(t("map.data.town.src.contours"))}</label>` });
  if (!v) return;
  return town(E, { contours: !!v.contours });
}
/**
 * A town's sprint map (owner, 2026-11-12: one engine, the generator Pixel's town races use — tools/virtually/town_map.py on
 * IGN's LiDAR HD, BD TOPO, BD ORTHO's infrared, the cadastre and OpenStreetMap —, quality before speed): the area's centre and
 * size asked of /api/townmap, the GitHub workflow townmap.yml making it (several minutes), then its objects brought into the draft
 * part. o: { contours } — the contours kept. The request is kept in this browser (`ocn.map.town.<map>`): a page closed meanwhile
 * takes the map when the editor opens again (resumeTown).
 */
export async function town(E, o = {}) {
  const f = await frameOrSay(E); if (!f) return;
  if ((await nationalSource(E, f)) !== "bdtopo") { E.say(t("map.data.town.notFrance"), "bad"); return; }
  const b = areaOf(E), [w, h] = townArea(E);
  if (w > TOWN_MAX || h > TOWN_MAX) { E.say(t("map.data.town.tooLarge"), "bad"); return; }
  const [lat, lon] = f.toLatLon((b[0] + b[2]) / 2, (b[1] + b[3]) / 2);
  progress(E)(t("map.data.town.asking"));
  let r;
  try {
    const res = await fetch(TOWN_API, { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lat, lon, w: Math.round(w), h: Math.round(h) }) });
    r = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(res.status === 429 ? t("map.data.town.limit") : r.error === "not france" ? t("map.data.town.notFrance") : r.error || `HTTP ${res.status}`);
  } catch (e) { E.say(e.message, "bad"); return; }
  const pending = { req: r.req, contours: !!o.contours, at: Date.now() };
  keepTown(E, pending);
  return waitTown(E, pending);
}
/** A request made before this page was opened (kept in this browser), taken up again when the editor opens. */
export async function resumeTown(E) {
  const p = readTown(E);
  if (p && !E.blank) await waitTown(E, p);
}
/** Waits for the workflow (its stage, share and queue shown), then brings the map's objects in. */
async function waitTown(E, p) {
  if (E._townWait === p.req) return;
  E._townWait = p.req;
  const say = progress(E), t0 = p.at || Date.now();
  try {
    for (;;) {
      if (E.closed) return;
      const r = await fetch(`${TOWN_API}?req=${encodeURIComponent(p.req)}`, { credentials: "same-origin" }).then((x) => (x.ok ? x.json() : x.status === 404 ? { status: "gone" } : null)).catch(() => null);
      const waited = t("map.data.town.waited", { t: elapsedOf(t0) });
      if (r?.status === "done") break;
      if (r?.status === "failed" || r?.status === "gone") { keepTown(E, null); E.say(r.status === "gone" ? t("map.data.town.gone") : t("map.data.town.failed", { error: r.error || "" }), "bad"); return; }
      const pr = r?.progress;
      if (pr) say(`${townStage(pr, p)} · ${waited}`, pr.stage === "setup" ? null : pr.frac);
      // before the run reports its sources (GitHub starting a runner, the runner installing): « préparation », part of the making —
      // never « waiting for a server » (owner, 2026-11-12); only other users' requests ahead are a queue worth saying
      else say(`${r?.ahead ? tn("map.data.town.ahead", r.ahead) : preparing(p)} · ${waited}`);
      await new Promise((ok) => setTimeout(ok, 10000));
    }
    say(t("map.data.town.reading"));
    const res = await fetch(`${TOWN_API}/out/${encodeURIComponent(p.req)}`, { credentials: "same-origin" });
    if (!res.ok) { keepTown(E, null); E.say(t("map.data.town.gone"), "bad"); return; }
    const j = await res.json();
    const f = await frameOrSay(E); if (!f) return;
    await ensureTownSymbols(E);
    const objects = townObjects(j, f, { contours: p.contours && (await oneContourSet(E, "town")) });
    const n = bring(E, objects, t("map.undo.data"));
    keepTown(E, null);
    E.say(tn("map.data.brought", n) + ` · ${t("map.data.town.credit", { date: lidarYear(j) })}`);
  } finally { if (E._townWait === p.req) E._townWait = null; }
}
/** « Preparing », with the time to expect (a few minutes). */
const preparing = () => t("map.data.town.preparing");
/** What the workflow is doing (townmap_ci.py's progress, 2026-11-12): « setup » (the runner installing) said as the preparation, the
 *  sources still awaited while they download (read at the same time), the map's step while it is computed. */
function townStage(pr, p) {
  if (pr.stage === "setup") return preparing(p);
  if (pr.stage === "fetch" && pr.pending?.length) {
    const names = pr.pending.map((k) => (k === "osm" && pr.osmTry > 1 ? t("map.data.town.src.osmTry", { n: pr.osmTry }) : t(`map.data.town.src.${k}`)));
    let list = names.join(", ");
    try { list = new Intl.ListFormat(locale(), { type: "conjunction" }).format(names); } catch (e) { /* an older browser */ }
    return t("map.data.town.stage.fetchList", { list });
  }
  if (pr.stage === "map" && pr.step === "legibility" && pr.pass) return t("map.data.town.stage.mapStep", { step: t("map.data.town.step.legibilityPass", { n: pr.pass }) });
  if (pr.stage === "map" && pr.step) return t("map.data.town.stage.mapStep", { step: t(`map.data.town.step.${pr.step}`) });
  return t(`map.data.town.stage.${pr.stage}`);
}
/** The LiDAR's year (its latest tile's acquisition), with its space, or nothing. */
const lidarYear = (j) => { const y = Object.values(j.lidar || {}).sort().pop()?.slice(0, 4); return y ? ` ${y}` : ""; };
const elapsedOf = (t0) => { const s = Math.max(0, Math.round((Date.now() - t0) / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };
/**
 * The generator's objects (town_map.py's map_objects.json: rings in map mm about `realWorld` in Lambert 93 at its scale) as the
 * document's: each point through Lambert 93 into the map's frame, lines marked `curve` as Bézier curves, the north lines left
 * out (« Mise en page » draws them), the contours too when not asked for.
 */
export function townObjects(j, f, { contours = true } = {}) {
  const k = (j.scale || 4000) / 1000, X0 = j.realWorld.x, Y0 = j.realWorld.y;
  const P = ([x, y]) => f.fromL93mm(X0 + x * k, Y0 + y * k);
  const out = [];
  for (const o of j.objects || []) {
    const n = Math.floor(o.sym / 1000);
    if (n === 601 || (!contours && n >= 101 && n <= 103)) continue;
    const rings = (o.rings || []).map((r) => r.map(P));
    if (!rings.length || !rings[0].length) continue;
    const coords = o.otp === 3 ? areaCoordsOf(rings) : o.otp === 2 ? (o.curve && rings[0].length >= 3 ? bezierOf(rings[0]) : lineCoordsOf(rings[0])) : lineCoordsOf([rings[0][0]]);
    if ((o.otp === 3 && coords.length < 4) || (o.otp === 2 && coords.length < 2)) continue;
    out.push({ sym: o.sym, otp: o.otp, ang: o.ang || 0, coords, ...(o.text ? { text: o.text } : {}), src: "town", draft: true });
  }
  return out;
}
/**
 * The LiDAR through karttapullautin (owner, 2026-11-12: no black box): the map's style (its standard, else its scale) decides the
 * intervals offered — ISSprOM 2 or 2.5 m, ISOM 2.5 or 5 m —, the helper contours (karttapullautin's dense « basemap » contours,
 * every 0.5 or 1 m) come into a part of their own in light violet, never printed, and the dialog names karttapullautin and lists
 * the settings the tiles are made with (data/lidar.js kpRows).
 */
async function lidar(E) {
  const f = await frameOrSay(E); if (!f) return;
  const P = await placeOf(E, f).catch(() => null);
  if (P && !P.s.lidar) { await P.SP.explain(E, P.s, P.lat, P.lon, ["lidar"]); return; }
  const L = await import("./data/lidar.js");
  // the style is the map's own (its standard, else its scale): not asked again (owner, 2026-11-12)
  const style = styleOf(E), [def, other] = L.INTERVALS[style];
  const prefKey = `ocn.map.lidar.${style}`;
  let pref = {};
  try { pref = JSON.parse(localStorage.getItem(prefKey) || "{}") || {}; } catch (e) { /* private window */ }
  const ivs = [def, other].sort((a, b) => a - b);
  const mFmt = (x) => t("map.data.lidar.m", { m: x.toLocaleString(locale()) });
  const table = (iv) => `<table class="mp-kp"><thead><tr><th>${esc(t("map.data.kp.setting"))}</th><th>${esc(t("map.data.kp.value"))}</th><th>${esc(t("map.data.kp.what"))}</th></tr></thead><tbody>${
    L.kpRows(style, iv).map(([k, v]) => `<tr><td><code>${esc(k)}</code></td><td>${esc(v === "auto" ? t("map.data.kp.auto") : v)}</td><td>${esc(t(`map.data.kp.${k}`, { iv: mFmt(iv), h: mFmt(L.helpInterval(iv)) }))}</td></tr>`).join("")}</tbody></table>`;
  const body = `<p><b>${esc(t(`map.data.kind.${style}`))}</b></p>`
    + field(t("map.data.lidar.interval"), sel("i", ivs.map((x) => [String(x), mFmt(x) + (x === def ? ` (${t("map.data.lidar.default")})` : "")]), String(pref.i ?? def)))
    + `<p class="mp-hint">${esc(t(`map.data.lidar.intervalHint.${style}`))}</p>`
    + `<label class="mp-row mp-check"><input type="checkbox" name="h"${pref.h === false ? "" : " checked"}> <span>${esc(t("map.data.lidar.helpers"))}</span></label>`
    + `<p class="mp-hint">${esc(t("map.data.lidarHint"))}</p>`
    + `<p class="mp-hint">${esc(t("map.data.lidar.credit"))} <a href="https://github.com/karttapullautin/karttapullautin" target="_blank" rel="noopener">github.com/karttapullautin</a></p>`
    + `<details class="mp-kpbox"><summary>${esc(t("map.data.kp.title"))}</summary><p class="mp-hint">${esc(t("map.data.kp.lede"))}</p><div data-kp>${table(+(pref.i ?? def))}</div></details>`;
  const v = await modal(E, { title: t("map.rib.data-lidar"), ok: t("map.ok.add"), body, wide: true, onOpen: (root) => {
    const s = root.querySelector('select[name="i"]'), box = root.querySelector("[data-kp]");
    s?.addEventListener("change", () => { box.innerHTML = table(+s.value); });
  } });
  if (!v) return;
  const interval = +v.i, helpers = !!v.h;
  try { localStorage.setItem(prefKey, JSON.stringify({ i: interval, h: helpers })); } catch (e) { /* private window */ }
  const say = progress(E);
  let r;
  // a sprint map: no cliffs (in a town karttapullautin's are every building's edge), no contours where the map has its own
  const town = style === "sprint" ? { cliffs: false, covered: reliefCover(E) } : {};
  try { r = await L.loadLidar(f, areaOf(E), style, { interval, helpers, say: (key, vars, frac) => say(t(key, { n: "", t: "", ...vars }), frac), progress: (key, vars, frac) => say(t(key, vars), frac), stop: () => E._stopData, ...town }); }
  catch (e) { E.say(e.message === "tooLarge" ? t("map.data.tooLarge") : e.message === "nogeo" ? t("map.data.nogeo") : e.message, "bad"); return; }
  if (!r) { E.say(""); return; }
  // a forest map: the LiDAR's contours replace another source's draft contours, if the mapper agrees, else they stay out (cliffs,
  // knolls and vegetation come all the same); a sprint map's own relief already keeps them out where it lies (reliefCover)
  const keepOld = style !== "sprint" && !(await oneContourSet(E, "lidar"));
  const n = bring(E, keepOld ? r.objects.filter((o) => !isContourSym(o.sym)) : r.objects, t("map.undo.data"));
  let nh = 0;
  if (r.helpers?.length) {
    const Lay = await import("./layout.js");
    await Lay.addSetSymbols(E, [L.HELP_SYM]).catch((e) => console.warn("helper symbol", e));
    nh = bring(E, r.helpers, t("map.undo.data"), { helpers: true });
  }
  if (r.backgrounds?.length) { const B = await import("./backgrounds.js"); await B.addUrls(E, r.backgrounds); }
  E.say(tn("map.data.brought", n) + (nh ? ` · ${tn("map.data.lidar.helpersIn", nh)}` : "") + ` · ${r.credit?.text || r.credit} · karttapullautin`
    + (r.tiles?.noVectors?.length ? ` · ${tn("map.data.noVectors", r.tiles.noVectors.length)}` : ""));
}
function accept(E, kind) {
  const sel = E.selected().filter((o) => o.draft);
  let list = sel.length ? sel : E.doc.objects.filter((o) => o.draft);
  if (kind && sel.length) { const syms = new Set(sel.map((o) => o.sym)); list = E.doc.objects.filter((o) => o.draft && syms.has(o.sym)); }
  E.live.transact(t("map.undo.accept"), () => { for (const o of list) E.live.update(o.id, { draft: false, part: E.part === DRAFT ? "p1" : E.part }); });
  E.say(tn("map.data.accepted", list.length));
  E.selChanged();
}
async function reject(E) {
  const sel = E.selected().filter((o) => o.draft);
  const list = sel.length ? sel : E.doc.objects.filter((o) => o.draft);
  // nothing chosen means the whole draft: asked first (owner, 2026-11-12: a map's 10 750 draft objects — the town plan and the
  // LiDAR — were gone in one click, then saved so)
  if (!sel.length && list.length > 1) {
    const { confirmBox } = await import("../askbox.js");
    if (!(await confirmBox(tn("map.data.rejectAll", list.length), { ok: t("map.rib.draft-reject") }))) return;
  }
  E.live.transact(t("map.undo.reject"), () => { for (const o of list) E.live.remove(o.id); });
  E.sel.clear(); E.selChanged();
  E.say(tn("map.data.rejected", list.length));
}
export { bring, styleOf };
void G;
