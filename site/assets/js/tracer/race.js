// The Tracer's tools that use the race's data or another service:
//  - competitor loads from FFCO's registration counts per circuit (the agenda's reg.circuits);
//  - the climb of each course from IGN's elevations (Géoplateforme, RGE ALTI) along its legs as drawn;
//  - winning times estimated from Ozimut's results: the winners' pace on recent races of the same discipline and format,
//    against their CN, gives a course's time for the expected winner's level, and the length for a target time;
//  - the pick-up plan: when each control may be collected (the last start of each course using it and a slow runner's
//    pace), in that order, with the controls nearby;
//  - the review after the race, from the published split times (« Résultats »): per leg, the best and median times, the
//    share of runners who made a mistake (lost ≥ 20 % and ≥ 10 s against their own pace, as « Temps intermédiaires »),
//    and the mispunches per control;
//  - the publication of the courses to « Analyse multi » (after the race: the courses stay secret before).

import * as M from "./model.js";
import * as S from "./store.js";
import * as G from "./geo.js";
import { modal, field, num, download, fileName } from "./dialogs.js";
import { ctrlName, csv } from "./reports.js";
import { where } from "./ribbon-data.js";
import { t, tn, locale } from "./lang.js";
import { provDir, sees } from "../auth.js";
import { current as siteCountry } from "../country.js";
import { bar, setBar } from "../waitbar.js";

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const nf = (v, d = 0) => new Intl.NumberFormat(locale(), { minimumFractionDigits: d, maximumFractionDigits: d }).format(v);
const mmss = (s) => { if (!Number.isFinite(s)) return ""; s = Math.round(s); const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60; return h ? `${h}:${String(m).padStart(2, "0")}:${String(x).padStart(2, "0")}` : `${m}:${String(x).padStart(2, "0")}`; };
const hhmm = (s) => { if (!Number.isFinite(s)) return ""; const m = Math.round(s / 60); return `${String(Math.floor(m / 60) % 24).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`; };
const norm = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\b(circuit|parcours)\b/g, "").replace(/[^a-z0-9]+/g, " ").trim();
// (the provisional results from this account's folder: without France, the copy without CNs — auth.provDir; the rest is
// France's: its agenda, competitions and races, in data/fr/ since 2026-10-22)
const getData = async (path) => {
  const r = await fetch(path.startsWith("prov/") ? `${provDir()}${path.slice(5)}` : `data/fr/${path}`, { credentials: "same-origin", cache: "no-store" });
  return r.ok ? r.json().catch(() => null) : null;
};
const courseList = (ev) => M.courseIds(ev, false).filter((id) => ev.courses[id].kind !== "score");

/** The race of the event: its agenda entry and its « Résultats » entry, when they exist. */
async function raceInfo(E) {
  const key = E.meta?.race || "";
  const out = { key, agenda: null, prov: null, provKey: null };
  if (!key) return out;
  const [ag, idx] = await Promise.all([getData("agenda.json"), getData("prov/index.json")]);
  const agId = key.startsWith("a") ? Number(key.slice(1)) : null;
  const p = (idx?.races || []).find((r) => r.key === key || (agId && r.agenda_id === agId));
  if (p) { out.prov = p; out.provKey = p.key; }
  const id = agId || p?.agenda_id;
  if (id) out.agenda = (ag?.events || []).find((e) => e.id === id) || null;
  return out;
}
/** A course of the event for a circuit's name (« A », « Circuit A », « A - Jaune »…). */
function matchCourse(ev, name, ids = courseList(ev)) {
  const n = norm(name);
  if (!n) return 0;
  let id = ids.find((c) => norm(ev.courses[c].name) === n);
  if (id) return id;
  id = ids.find((c) => { const m = norm(ev.courses[c].name); return m && (n.split(" ")[0] === m.split(" ")[0]) && m.split(" ")[0].length <= 3; });
  return id || 0;
}

// ---- loads from the registrations ---------------------------------------------------------------------------------------------
/** { courseId: registrants } from FFCO's registration list (races of the next three weeks), or null. */
export async function registrationLoads(E) {
  const r = await raceInfo(E);
  const circuits = r.agenda?.reg?.circuits;
  if (!circuits?.length) { E.toast(r.agenda ? t("trc.race.noRegYet") : t("trc.race.notInAgenda")); return null; }
  const out = {}, missed = [], classes = {};
  for (const [name, n, cats] of circuits) {
    const id = matchCourse(E.ev, name, M.courseIds(E.ev));
    if (!id) { missed.push(`${name} (${n})`); continue; }
    out[id] = (out[id] || 0) + n;
    // the registration's categories (« D20/35, H40/45 ») become the course's classes when it has none yet
    if (cats && !E.ev.courses[id].secondary) classes[id] = String(cats).replace(/\s+/g, " ").trim().slice(0, 200);
  }
  if (Object.keys(classes).length) E.change((x) => { for (const [id, t] of Object.entries(classes)) if (x.courses[id] && !x.courses[id].secondary) x.courses[id].secondary = t; }, t("trc.race.undoClasses"));
  E.toast(tn("trc.race.loadsFilled", Object.keys(out).length, { reg: tn("trc.race.nRegCourses", circuits.length),
    classes: Object.keys(classes).length ? t("trc.race.loadsClasses", { n: Object.keys(classes).length }) : "",
    missed: missed.length ? t("trc.race.loadsMissed", { list: missed.join(", ") }) : "" }), 8000);
  return out;
}

// ---- climb from IGN -----------------------------------------------------------------------------------------------------------
const IGN = "https://data.geopf.fr/altimetrie/1.0/calcul/alti/rest/elevationLine.json";
/** Elevations every ~step metres along a polyline of [lat, lon]: IGN's profile (simple mode), in one or more requests. */
async function profile(latlon, lengthM, step = 10) {
  const n = Math.max(2, Math.min(4000, Math.round(lengthM / step) + 1));
  const u = new URLSearchParams({ lon: latlon.map((p) => p[1].toFixed(6)).join("|"), lat: latlon.map((p) => p[0].toFixed(6)).join("|"),
    resource: "ign_rge_alti_wld", delimiter: "|", indent: "false", measures: "false", zonly: "false", profile_mode: "simple", sampling: String(n) });
  const r = await fetch(`${IGN}?${u}`);
  if (!r.ok) throw new Error(`IGN ${r.status}`);
  const j = await r.json();
  return (j.elevations || []).map((e) => (typeof e === "number" ? e : e.z)).filter((z) => Number.isFinite(z) && z > -1000);
}
/** The same profile from the open terrain tiles (SRTM's 30 m and the national models Mapzen gathered; the 3D view's source,
 *  trace/terrain.js): outside France, where IGN has no model — the advanced level (owner, 2026-10-24). */
async function tileProfile(latlon, lengthM, step = 10) {
  const n = Math.max(2, Math.min(4000, Math.round(lengthM / step) + 1));
  const cum = [0];
  for (let i = 1; i < latlon.length; i++) {
    const [a, b] = [latlon[i - 1], latlon[i]], k = Math.cos((a[0] * Math.PI) / 180);
    cum.push(cum[i - 1] + Math.hypot(b[0] - a[0], (b[1] - a[1]) * k));
  }
  const total = cum[cum.length - 1] || 1, pts = [];
  for (let s = 0, j = 1; s < n; s++) {
    const d = (total * s) / (n - 1);
    while (j < cum.length - 1 && cum[j] < d) j++;
    const f = (d - cum[j - 1]) / Math.max(1e-12, cum[j] - cum[j - 1]), a = latlon[j - 1], b = latlon[j];
    pts.push([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]);
  }
  const { tileHeights } = await import("../trace/terrain.js");
  return [...(await tileHeights(pts, step))].filter((z) => Number.isFinite(z) && z > -1000);
}
/** Climb of a profile: the rises, after a light smoothing that removes the model's noise (a 3-point median then mean). */
function rises(z) {
  const m = z.map((_, i) => { const w = z.slice(Math.max(0, i - 1), i + 2).slice().sort((a, b) => a - b); return w[Math.floor(w.length / 2)]; });
  const s = m.map((_, i) => { const w = m.slice(Math.max(0, i - 1), i + 2); return w.reduce((a, b) => a + b, 0) / w.length; });
  let up = 0, down = 0;
  for (let i = 1; i < s.length; i++) { const d = s[i] - s[i - 1]; if (d > 0) up += d; else down -= d; }
  return { up, down, min: Math.min(...s), max: Math.max(...s), z: s };
}
/** The legs of a designator as one polyline of map mm (controls and bends). */
function coursePolyline(ev, cd) {
  const ids = M.ccIds(ev, cd), pts = [];
  for (let i = 0; i + 1 < ids.length; i++) {
    const a = ev.courseControls[ids[i]].control, b = ev.courseControls[ids[i + 1]].control;
    const leg = M.legRoutePoints(ev, a, b);             // the drawn route when there is one
    pts.push(...(pts.length ? leg.slice(1) : leg));
  }
  return pts;
}
export async function climb(E) {
  const ev = E.ev;
  if (!G.hasGeo(ev)) { E.toast(t("trc.race.climbNeedsGeo", { where: where("georef") })); return; }
  const ids = courseList(ev);
  if (!ids.length) { E.toast(t("trc.race.noLineCourse")); return; }
  const rows = [], profiles = [];
  E.status(t("trc.race.ignBusy"), "busy");
  // IGN's model in France; elsewhere (the advanced level) the open terrain tiles
  const c0 = Object.values(ev.controls)[0], here = c0 ? G.toLatLon(ev, c0.x, c0.y) : null;
  const { inFrance } = await import("../trace/terrain.js");
  const tiles = E.pro && here && !inFrance(here[0], here[1]);
  try {
    for (const [n, id] of ids.entries()) {
      E.status(t("trc.race.ignBusy"), "busy", n / ids.length);
      const des = M.hasVariations(ev, id) ? M.allVariations(ev, id).map((x) => ({ cd: M.cdCourse(id, -1, x.path), code: x.code })) : [{ cd: M.cdCourse(id), code: "" }];
      let best = null;
      for (const d of des.slice(0, 12)) {
        const pts = coursePolyline(ev, d.cd);
        if (pts.length < 2) continue;
        const len = M.mmToM(ev, M.pathLength(pts));
        const ll = pts.map((p) => G.toLatLon(ev, p[0], p[1]));
        const z = tiles ? await tileProfile(ll, len) : await profile(ll, len);
        if (z.length < 2) continue;
        const r = { ...rises(z), len, code: d.code };
        if (!best || r.up > best.up) best = r;
      }
      if (!best) continue;
      rows.push({ id, ...best });
      profiles.push({ id, ...best });
    }
  } catch (err) {
    E.status(t("trc.race.ready"), "ok");
    E.toast(t("trc.race.ignDown", { why: err.message }), 7000);
    return;
  }
  E.status(t("trc.race.ready"), "ok");
  if (!rows.length) { E.toast(t("trc.race.nothingToMeasure")); return; }
  const spark = (r) => {
    const W = 220, H = 40, n = r.z.length, lo = r.min, hi = Math.max(r.max, lo + 1);
    return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" aria-hidden="true"><polyline fill="none" stroke="currentColor" stroke-width="1.2" points="${r.z.map((z, i) => `${((i / (n - 1)) * W).toFixed(1)},${(H - 2 - ((z - lo) / (hi - lo)) * (H - 4)).toFixed(1)}`).join(" ")}"/></svg>`;
  };
  const v = await modal(E, { title: t("trc.race.climbTitle"), wide: true, ok: t("trc.race.climbOk"), body: `
    <p>${t("trc.race.climbIntro")}</p>
    <div class="table-wrap"><table class="tr-table"><thead><tr><th></th><th>${t("trc.race.thCourse")}</th><th class="r">${t("trc.race.thLength")}</th><th class="r">${t("trc.race.thUp")}</th><th class="r">${t("trc.race.thDown")}</th><th class="r">m/km</th><th>${t("trc.race.thProfile")}</th><th class="r">${t("trc.race.thCurrent")}</th><th class="r">${t("trc.race.thToCopy")}</th></tr></thead><tbody>
    ${rows.map((r) => `<tr><td><input type="checkbox" name="u${r.id}" checked aria-label="${esc(t("trc.race.copy"))}"></td><td>${esc(ev.courses[r.id].name)}${r.code ? ` <small>${t("trc.race.steepestVar", { code: esc(r.code) })}</small>` : ""}</td>
      <td class="r">${nf(r.len / 1000, 1)} km</td><td class="r">${Math.round(r.up)} m</td><td class="r">${Math.round(r.down)} m</td><td class="r">${nf(r.up / (r.len / 1000))}</td><td>${spark(r)}</td>
      <td class="r">${ev.courses[r.id].climb >= 0 ? `${ev.courses[r.id].climb} m` : "—"}</td><td class="r"><input name="c${r.id}" value="${Math.round(r.up / 5) * 5}" size="5" inputmode="numeric"> m</td></tr>`).join("")}</tbody></table></div>
    <p class="tr-hint">${tiles ? t("trc.race.tilesCredit") : t("trc.race.ignCredit")}</p>` });
  if (!v) return;
  E.change((x) => { for (const r of rows) if (v[`u${r.id}`]) { const c = Math.round(num(v[`c${r.id}`])); if (c >= 0) x.courses[r.id].climb = c; } }, t("trc.race.undoClimb"));
}

// ---- winning times -----------------------------------------------------------------------------------------------------------
const FORMATS = [["LD", t("trc.race.fmtLD")], ["MD", t("trc.race.fmtMD")], ["Sprint", t("trc.race.fmtSprint")], ["Nuit", t("trc.race.fmtNight")]];
const CACHE = new Map();
/** The winners of recent circuits of a discipline and format: [{ km, s (seconds), cn (official CN J-15), cat }]. */
async function winners(format) {
  if (CACHE.has(format)) return CACHE.get(format);
  if (!sees("FR")) return [];                    // the races' files are France's data (the login gate refuses them otherwise)
  const comps = await getData("competitions.json");
  if (!comps) return [];
  const col = Object.fromEntries(comps.cols.map((c, i) => [c, i]));
  const terrain = format === "Sprint" ? "Spr" : "For";
  const cutoff = new Date(Date.now() - 2 * 365 * 864e5).toISOString().slice(0, 10);
  const ids = Object.entries(comps.rows).filter(([, r]) => r[col.terrain] === terrain && r[col.epreuve] === format && r[col.date] >= cutoff && r[col.n] >= 40)
    .sort((a, b) => b[1][col.date].localeCompare(a[1][col.date])).slice(0, 90).map(([id]) => id);
  // c/: five competitions to a file by their id (meta.c_group; data.js course), each file read once
  const k = (await getData("meta.json"))?.c_group;
  const fileOf = (id) => (k ? `c/g${Math.floor(Number(id) / k)}.json` : `c/${id}.json`);
  const names = [...new Set(ids.map(fileOf))];
  const read = new Map();
  for (let i = 0; i < names.length; i += 10) {
    const part = names.slice(i, i + 10);
    (await Promise.all(part.map((n) => getData(n)))).forEach((f, j) => read.set(part[j], f));
  }
  const out = [];
  for (const id of ids) {
    const f = k ? read.get(fileOf(id))?.[id] : read.get(fileOf(id));
    for (const c of f?.circuits || []) {
      const w = c.rows?.[0];
      if (!c.dist || !w || w[1] !== 1 || w[3] !== "ok" || !(w[2] > 0) || c.rows.length < 5) continue;
      const pace = w[2] / c.dist;
      if (pace < 150 || pace > 1500) continue;                       // a length or a time misread
      out.push({ km: c.dist, s: w[2], cn: Number(w[7]) || null, cat: w[4] || "" });
    }
  }
  CACHE.set(format, out);
  return out;
}
/** ln(pace) = a + b ln(CN), least squares; and the median winner CN per category. */
function paceModel(data) {
  const pts = data.filter((d) => d.cn > 500);
  let sx = 0, sy = 0, sxx = 0, sxy = 0;
  for (const d of pts) { const x = Math.log(d.cn), y = Math.log(d.s / d.km); sx += x; sy += y; sxx += x * x; sxy += x * y; }
  const n = pts.length, b = n > 10 ? (n * sxy - sx * sy) / (n * sxx - sx * sx) : 0, a = n ? (sy - b * sx) / n : Math.log(400);
  const res = pts.map((d) => Math.log(d.s / d.km) - (a + b * Math.log(d.cn))).sort((x, y) => x - y);
  const spread = res.length > 10 ? [Math.exp(res[Math.floor(res.length * 0.25)]), Math.exp(res[Math.floor(res.length * 0.75)])] : [0.85, 1.15];
  const byCat = new Map();
  for (const d of pts) { if (!byCat.has(d.cat)) byCat.set(d.cat, []); byCat.get(d.cat).push(d.cn); }
  const catCn = new Map([...byCat].filter(([, v]) => v.length >= 3).map(([k, v]) => { v.sort((x, y) => x - y); return [k, v[Math.floor(v.length / 2)]]; }));
  return { pace: (cn) => Math.exp(a + b * Math.log(cn)), spread, n, catCn };
}
/**
 * The climb's effect on the winners' time: FFCO's results give no climb, the organisers' files often do (« Résultats »). On
 * those circuits, the winner's time against the pace the CN model expects for their level, regressed on the climb per km:
 * ln(time / expected) = a + b (m/km − mean). b is applied to a course's own climb; without 20 such circuits, nothing.
 */
async function climbEffect(format, model) {
  const idx = await getData("prov/index.json");
  if (!idx || !model.n) return { n: 0 };
  const forest = (r) => r.terrain === "Forêt" || r.terrain === "For";     // i18n-ignore
  const pick = (strict) => (idx.races || []).filter((r) => r.docs && !r.soon && (format === "Sprint" ? r.terrain === "Sprint" || r.terrain === "Spr" : forest(r) && (!strict || (r.epreuve || "") === format)));
  let races = pick(true);
  if (races.length < 15 && format !== "Sprint") races = pick(false);
  const pts = new Map();
  for (let i = 0; i < Math.min(races.length, 90); i += 10) {
    const files = await Promise.all(races.slice(i, i + 10).map((r) => getData(`prov/${r.key}.json`)));
    files.forEach((f, j) => {
      for (const doc of f?.docs || []) for (const k of doc.classes || []) {
        if (!(k.length_m > 500) || !(k.climb_m >= 0)) continue;
        const w = (k.runners || []).find((x) => x.place === 1 && x.status === "ok" && x.time_s > 0), cn = w?.cnj15?.official;
        if (!(cn > 500)) continue;
        const L = k.length_m / 1000, h = k.climb_m / L;
        if (h > 150) continue;
        pts.set(`${races[i + j].key}|${k.length_m}|${k.climb_m}|${w.time_s}`, { h, r: Math.log(w.time_s / (model.pace(cn) * L)) });
      }
    });
  }
  const v = [...pts.values()];
  if (v.length < 20) return { n: v.length };
  const hm = v.reduce((a, x) => a + x.h, 0) / v.length, rm = v.reduce((a, x) => a + x.r, 0) / v.length;
  let sxy = 0, sxx = 0;
  for (const x of v) { sxy += (x.h - hm) * (x.r - rm); sxx += (x.h - hm) ** 2; }
  const raw = sxx ? sxy / sxx : 0;
  const se = sxx ? Math.sqrt(v.reduce((a, x) => a + (x.r - rm - raw * (x.h - hm)) ** 2, 0) / Math.max(1, v.length - 2) / sxx) : Infinity;
  // shrunk toward the km-effort rule (100 m of climb = 1 km: 10 m/km more = +10 %), each by its precision: a noisy fit
  // (few circuits, climbs alike) stays near the rule, a sharp one moves away from it
  const b0 = Math.log(1.1) / 10, s0 = 0.004;
  const b = Math.max(0, (raw / se ** 2 + b0 / s0 ** 2) / (1 / se ** 2 + 1 / s0 ** 2));
  return { n: v.length, b, hm, raw, se };
}
export async function winningTimes(E) {
  const ev = E.ev, ids = courseList(ev);
  if (!ids.length) { E.toast(t("trc.race.noLineCourse")); return; }
  const info = await raceInfo(E).catch(() => ({}));
  let format = info.agenda?.epr || info.prov?.epreuve || (ev.appearance.mapStandard === "Spr2019" ? "Sprint" : "MD");
  if (!FORMATS.some((f) => f[0] === format)) format = "MD";
  E.status(t("trc.race.recentBusy"), "busy");
  let model = paceModel(await winners(format));
  let climbFit = await climbEffect(format, model).catch(() => ({ n: 0 }));
  E.status(t("trc.race.ready"), "ok");
  // a course's time: the pace for the CN over its length, corrected by its climb per km against the reference circuits'
  const climbK = (id, L) => { const H = ev.courses[id].climb; return climbFit.b && H >= 0 && L > 0 ? Math.exp(climbFit.b * (H / L - climbFit.hm)) : 1; };
  const lengthFor = (id, t, p) => { let L = t / p; for (let i = 0; i < 20; i++) L = t / (p * climbK(id, L)); return L; };
  const guessCn = (c) => {
    const cats = String(c.secondary || c.name || "").toUpperCase().match(/[HD]\s?\d{2}[A-Z]?/g) || [];
    const vals = cats.map((x) => model.catCn.get(x.replace(/\s/g, "")) || model.catCn.get(x.replace(/\s/g, "").slice(0, 3))).filter(Boolean);
    return vals.length ? Math.max(...vals) : null;
  };
  const len = (id) => { const v = M.view(ev, M.cdCourse(id), { specials: false, descriptions: false }); return v.totalMax / 1000; };
  const row = (id) => {
    const c = ev.courses[id], cn = guessCn(c);
    return `<tr data-id="${id}"><td>${esc(c.name)}</td><td class="r">${nf(len(id), 1)} km</td><td class="r">${c.climb >= 0 ? `${c.climb} m` : "—"}</td>
      <td><input name="cn${id}" value="${cn ? Math.round(cn / 50) * 50 : ""}" size="5" inputmode="numeric" placeholder="CN"></td><td class="r" data-est></td>
      <td><input name="t${id}" size="4" inputmode="numeric" placeholder="min"></td><td class="r" data-len></td></tr>`;
  };
  await modal(E, { title: t("trc.race.wtTitle"), wide: true, ok: null, cancel: t("trc.race.close"), body: `
    <div class="tr-row">${field(t("trc.race.format"), `<select name="fmt">${FORMATS.map(([k, l]) => `<option value="${k}" ${k === format ? "selected" : ""}>${l}</option>`).join("")}</select>`)}</div>
    <p class="tr-hint" id="tr-wt-info"></p>
    <div class="table-wrap"><table class="tr-table"><thead><tr><th>${t("trc.race.thCourse")}</th><th class="r">${t("trc.race.thLength")}</th><th class="r">${t("trc.race.thClimb")}</th><th>${t("trc.race.thWinnerCn")}</th><th class="r">${t("trc.race.thEstTime")}</th><th>${t("trc.race.thTarget")}</th><th class="r">${t("trc.race.thLenFor")}</th></tr></thead>
    <tbody>${ids.map(row).join("")}</tbody></table></div>
    <p class="tr-hint">${t(format === "Sprint" ? "trc.race.wtRefSprint" : "trc.race.wtRefForest")}
    ${t("trc.race.wtHint")}</p>`,
  onOpen: (f) => {
    const upd = () => {
      f.querySelector("#tr-wt-info").textContent = !model.n ? t("trc.race.wtNoRef")
        : `${tn("trc.race.wtRefN", model.n)} ${climbFit.b ? t("trc.race.wtClimb", { hm: nf(climbFit.hm), pct: nf((Math.exp(climbFit.b * 10) - 1) * 100, 1), n: nf(climbFit.n), raw: nf((Math.exp(climbFit.raw * 10) - 1) * 100, 1) })
          : tn("trc.race.wtNoClimb", climbFit.n)}`;
      for (const tr of f.querySelectorAll("tr[data-id]")) {
        const id = Number(tr.dataset.id), cn = num(f.elements[`cn${id}`].value), tm = num(f.elements[`t${id}`].value), L = len(id);
        const p = cn > 500 && model.n ? model.pace(cn) : null, est = p ? p * L * climbK(id, L) : null;
        tr.querySelector("[data-est]").textContent = est ? t("trc.race.wtRange", { est: mmss(est), lo: mmss(est * model.spread[0]), hi: mmss(est * model.spread[1]) }) : "";
        tr.querySelector("[data-len]").textContent = p && tm > 0 ? `${nf(lengthFor(id, tm * 60, p), 1)} km` : "";
      }
    };
    f.addEventListener("input", upd);
    f.elements.fmt.addEventListener("change", async () => { E.status(t("trc.race.recentBusy"), "busy"); model = paceModel(await winners(f.elements.fmt.value)); climbFit = await climbEffect(f.elements.fmt.value, model).catch(() => ({ n: 0 })); E.status(t("trc.race.ready"), "ok"); upd(); });
    upd();
  } });
}

// ---- pick-up plan --------------------------------------------------------------------------------------------------------------
/** Last start (seconds after midnight) per course, from the race's start lists when « Résultats » has one. */
async function lastStarts(E) {
  const info = await raceInfo(E).catch(() => ({}));
  if (!info.provKey) return {};
  const race = await getData(`prov/${info.provKey}.json`);
  const out = {};
  for (const d of race?.docs || []) {
    if (d.kind !== "startlist" && !(d.classes || []).some((k) => (k.runners || []).some((r) => r.start_s))) continue;
    for (const k of d.classes || []) {
      let id = matchCourse(E.ev, k.circuit || k.name);
      if (!id) for (const c of courseList(E.ev)) if (String(E.ev.courses[c].secondary || "").toUpperCase().split(/[\s,;|]+/).includes(String(k.name).toUpperCase())) id = c;
      if (!id) continue;
      for (const r of k.runners || []) if (r.start_s > 0 && r.status !== "dns") out[id] = Math.max(out[id] || 0, r.start_s);
    }
  }
  return out;
}
export async function pickup(E) {
  const ev = E.ev, ids = courseList(ev);
  if (!ids.length) { E.toast(t("trc.race.noLineCourse")); return; }
  const starts = await lastStarts(E);
  const sprint = ev.appearance.mapStandard === "Spr2019" || ev.map.scale <= 5000;
  const v = await modal(E, { title: t("trc.race.puTitle"), wide: true, ok: t("trc.race.compute"), body: `
    <p>${t("trc.race.puIntro")}</p>
    <table class="tr-table"><thead><tr><th>${t("trc.race.thCourse")}</th><th>${t("trc.race.thLastStart")}</th></tr></thead><tbody>
    ${ids.map((id) => `<tr><td>${esc(ev.courses[id].name)}</td><td><input name="s${id}" value="${starts[id] ? hhmm(starts[id]) : ""}" size="6" placeholder="hh:mm"></td></tr>`).join("")}</tbody></table>
    ${Object.keys(starts).length ? `<p class="tr-hint">${t("trc.race.puStartsRead")}</p>` : ""}
    <div class="tr-grid2">${field(t("trc.race.puPace"), `<input name="pace" value="${sprint ? 9 : 15}" inputmode="decimal">`)}
    ${field(t("trc.race.puMargin"), '<input name="margin" value="15" inputmode="numeric">')}
    ${field(t("trc.race.puClose"), '<input name="close" placeholder="hh:mm">')}
    ${field(t("trc.race.puCollectors"), '<input name="n" value="2" inputmode="numeric">')}</div>`,
  validate: (o) => (ids.every((id) => !/^\d{1,2}[:h]\d{2}$/.test(o[`s${id}`].trim())) ? t("trc.race.puNeedStart") : !(num(o.pace) > 0) ? t("trc.race.puNeedPace") : null) });
  if (!v) return;
  const hms = (s) => { const m = /^(\d{1,2})[:h](\d{2})$/.exec(String(s).trim()); return m ? Number(m[1]) * 3600 + Number(m[2]) * 60 : null; };
  const pace = num(v.pace) * 60, margin = (num(v.margin) || 0) * 60, close = hms(v.close);
  const when = new Map(), courses = new Map();
  for (const id of ids) {
    const s0 = hms(v[`s${id}`]);
    if (s0 == null) continue;
    const des = M.hasVariations(ev, id) ? M.allVariations(ev, id).map((x) => M.cdCourse(id, -1, x.path)) : [M.cdCourse(id)];
    for (const cd of des) {
      let dist = 0, prev = null;
      for (const cc of M.ccIds(ev, cd)) {
        const c = ev.courseControls[cc].control;
        if (prev) dist += M.legLengthM(ev, prev, c);
        prev = c;
        if (ev.controls[c].kind !== "normal") continue;
        const at = s0 + (dist / 1000) * pace + margin;
        when.set(c, Math.max(when.get(c) || 0, at));
        if (!courses.has(c)) courses.set(c, new Set());
        courses.get(c).add(ev.courses[id].name);
      }
    }
  }
  if (!when.size) { E.toast(t("trc.race.puNothing")); return; }
  // sectors: the controls split among the collectors by place (k-means from the farthest controls), then in each sector
  // the next control is the one reached earliest (walking from the last, or waiting until it may be collected)
  const n = Math.max(1, Math.min(when.size, Math.round(num(v.n)) || 1));
  const finish = Object.values(ev.controls).find((c) => c.kind === "finish") || Object.values(ev.controls).find((c) => c.kind === "start");
  const all = [...when.keys()], P = (c) => [ev.controls[c].x, ev.controls[c].y];
  const centres = [P(all[0])];
  while (centres.length < n) centres.push(P(all.reduce((b, c) => (Math.min(...centres.map((q) => M.dist(P(c), q))) > Math.min(...centres.map((q) => M.dist(P(b), q))) ? c : b), all[0])));
  let group = new Map();
  for (let it = 0; it < 20; it++) {
    group = new Map(all.map((c) => [c, centres.reduce((bi, q, i) => (M.dist(P(c), q) < M.dist(P(c), centres[bi]) ? i : bi), 0)]));
    centres.forEach((_, i) => { const m = all.filter((c) => group.get(c) === i); if (m.length) centres[i] = [m.reduce((a, c) => a + P(c)[0], 0) / m.length, m.reduce((a, c) => a + P(c)[1], 0) / m.length]; });
  }
  const walk = sprint ? 6 * 60 : 10 * 60;                                       // s per km between controls
  const route = [], free = [];
  for (let k = 0; k < n; k++) {
    const left = new Set(all.filter((c) => group.get(c) === k)), r = [];
    let at = finish ? [finish.x, finish.y] : null, t0 = 0;
    while (left.size) {
      let best = null;
      for (const c of left) {
        const d = at ? M.mmToM(ev, M.dist(at, P(c))) : 0, arrive = Math.max(t0 + (d / 1000) * walk, when.get(c), close || 0);
        if (!best || arrive < best.arrive - 1 || (Math.abs(arrive - best.arrive) <= 1 && d < best.d)) best = { c, arrive, d };
      }
      r.push(best); t0 = best.arrive; at = P(best.c); left.delete(best.c);
    }
    if (finish && at) t0 += (M.mmToM(ev, M.dist(at, [finish.x, finish.y])) / 1000) * walk;
    route.push(r); free.push(t0);
  }
  const rep = { title: t("trc.race.puTitle"), intro: t("trc.race.puRepIntro", { pace: nf(num(v.pace), 1), margin: nf(margin / 60), speed: sprint ? 10 : 6 }),
    sections: route.map((r, k) => ({ title: tn("trc.race.puCollector", r.length, { k: k + 1, back: hhmm(free[k]) }),
      head: [t("trc.race.thOrder"), t("trc.race.thControl"), t("trc.race.thCollectable"), t("trc.race.thArrival"), t("trc.race.thFromPrev"), t("trc.race.thCourses")], align: "rlrrrl",
      rows: r.map((x, i) => [String(i + 1), ctrlName(ev, x.c), hhmm(when.get(x.c)), hhmm(x.arrive), `${Math.round(x.d)} m`, [...courses.get(x.c)].join(", ")]) })) };
  await showRep(E, rep, t("trc.race.slugPickup"));
}

// ---- after the race --------------------------------------------------------------------------------------------------------------
export async function afterRace(E) {
  const ev = E.ev;
  const info = await raceInfo(E).catch(() => ({}));
  E.status(t("trc.race.arBusy"), "busy");
  const race = info.provKey ? await getData(`prov/${info.provKey}.json`) : null;
  const docs = (race?.docs || []).filter((d) => (d.classes || []).some((k) => k.controls?.length && (k.runners || []).some((r) => r.splits)));
  const doc = docs[0] || null;
  const classes = doc ? (doc.by === "category" && doc.circuits?.length ? doc.circuits : doc.classes).filter((k) => k.controls?.length) : [];
  const sections = [], intro = [];
  if (doc) intro.push(t("trc.race.arSplits", { doc: doc.title || doc.source }));
  for (const k of classes) {
    // the course: same codes in the same order, else the name
    const codes = k.controls.map(String);
    let id = courseList(ev).find((c) => { const seq = M.ccIds(ev, M.cdCourse(c)).map((cc) => ev.controls[ev.courseControls[cc].control]).filter((x) => x.kind === "normal").map((x) => String(x.code)); return seq.length === codes.length && seq.every((x, i) => x === codes[i]); });
    if (!id) id = matchCourse(ev, k.name);
    const runners = (k.runners || []).filter((r) => r.splits && ["ok", "mp"].includes(r.status) && r.time_s > 0);
    if (runners.length < 3) continue;
    const n = codes.length + 1;
    const legs = runners.map((r) => { const cum = [...r.splits.slice(0, codes.length), r.status === "ok" ? r.time_s : null]; return cum.map((t, j) => (t != null && (j === 0 || cum[j - 1] != null) ? t - (j ? cum[j - 1] : 0) : null)); });
    const best = Array.from({ length: n }, (_, j) => Math.min(...legs.map((l) => l[j]).filter((x) => x > 0)));
    const perf = legs.map((l) => { const q = l.map((x, j) => (x > 0 && best[j] > 0 ? x / best[j] : null)).filter(Boolean).sort((a, b) => a - b); return q.length ? q[Math.floor(q.length / 2)] : null; });
    const rows = [];
    for (let j = 0; j < n; j++) {
      const ts = legs.map((l) => l[j]).filter((x) => x > 0).sort((a, b) => a - b);
      let mist = 0, cnt = 0, lost = [];
      legs.forEach((l, i) => { if (!(l[j] > 0) || !perf[i]) return; cnt++; const exp = best[j] * perf[i], loss = l[j] - exp; if (loss >= 10 && loss >= 0.2 * exp) { mist++; lost.push(loss); } });
      const missing = runners.filter((r) => j < codes.length && r.splits[j] == null).length;
      const from = j ? codes[j - 1] : t("trc.race.start"), to = j < codes.length ? codes[j] : t("trc.race.finish");
      const c1 = j ? M.findCode(ev, from) : Object.keys(ev.controls).map(Number).find((x) => ev.controls[x].kind === "start");
      const c2 = j < codes.length ? M.findCode(ev, to) : Object.keys(ev.controls).map(Number).find((x) => ev.controls[x].kind === "finish");
      const L = c1 && c2 ? M.legLengthM(ev, c1, c2) : null;
      rows.push([`${j + 1}`, `${from}–${to}`, L ? `${Math.round(L)} m` : "", mmss(best[j]), mmss(ts[Math.floor(ts.length / 2)]), L && best[j] > 0 ? `${nf(best[j] / 60 / (L / 1000), 1)}` : "",
        cnt ? t("trc.race.pct", { n: Math.round((100 * mist) / cnt) }) : "", lost.length ? mmss(lost.sort((a, b) => a - b)[Math.floor(lost.length / 2)]) : "", missing ? String(missing) : ""]);
    }
    sections.push({ title: id ? tn("trc.race.arSection", runners.length, { name: k.name, course: ev.courses[id].name }) : tn("trc.race.arSectionNone", runners.length, { name: k.name }),
      head: [t("trc.race.thLeg"), t("trc.race.thControls"), t("trc.race.thLength"), t("trc.race.thBest"), t("trc.race.thMedian"), t("trc.race.thPaceBest"), t("trc.race.thMistakes"), t("trc.race.thMedianLoss"), t("trc.race.thMissing")], align: "rlrrrrrrr", rows });
  }
  // the routes taken, from the GPS traces shared on the analysis published from this event (routes.js)
  try {
    const R = await import("./routes.js"), routes = await R.routesByLeg(E);
    if (routes?.length) {
      const { rows, meta } = R.routeRows(routes);
      if (rows.length) {
        sections.push({ title: t("trc.race.rtTitle"), head: [t("trc.race.thCourse"), t("trc.race.thLeg"), t("trc.race.thTracks"), t("trc.race.thRoutes"), t("trc.race.thGroups")], align: "llrrl", rows,
          rowAction: { label: t("trc.race.view"), fn: (i) => R.showLeg(E, routes, meta[i].course, meta[i].leg) } });
        intro.push(t("trc.race.rtIntro"));
      }
    }
  } catch (err) { console.error(err); }
  E.status(t("trc.race.ready"), "ok");
  if (!sections.length) {
    E.toast(info.provKey || E.meta?.published ? t("trc.race.arNothingYet") : t("trc.race.arNoResults"), 7000);
    return;
  }
  intro.push(t("trc.race.arReadNote"));
  await showRep(E, { title: t("trc.race.arTitle"), intro: intro.join("\n"), sections }, t("trc.race.slugReview"));
}

async function showRep(E, rep, slug) {
  const html = `${rep.intro ? rep.intro.split("\n").map((t) => `<p class="tr-hint">${esc(t)}</p>`).join("") : ""}${rep.sections.map((s, si) => `<h3>${esc(s.title)}</h3>
    <div class="table-wrap"><table class="tr-table"><thead><tr>${s.head.map((h, i) => `<th class="${s.align[i] === "r" ? "r" : ""}">${esc(h)}</th>`).join("")}</tr></thead>
    <tbody>${s.rows.map((r, ri) => `<tr>${r.map((c, i) => `<td class="${s.align[i] === "r" ? "r" : ""}">${esc(c)}</td>`).join("")}${s.rowAction ? `<td><button type="button" class="btn btn-sm" data-row="${si}:${ri}">${esc(s.rowAction.label)}</button></td>` : ""}</tr>`).join("")}</tbody></table></div>`).join("")}`;
  await modal(E, { title: rep.title, wide: true, ok: null, cancel: t("trc.race.close"), body: `<div class="tr-report">${html}</div>`, extra: '<button type="button" class="btn" data-csv>CSV</button>',
    onOpen: (f, done) => {
      f.querySelector("[data-csv]").addEventListener("click", () => download(`${fileName(E.ev.title)} - ${slug}.csv`, csv(rep), "text/csv;charset=utf-8"));
      f.querySelectorAll("[data-row]").forEach((b) => b.addEventListener("click", () => { const [si, ri] = b.dataset.row.split(":").map(Number); done(null); rep.sections[si].rowAction.fn(ri); }));
    } });
}

// ---- the courses to « Résultats » ---------------------------------------------------------------------------------------------
/** The courses (IOF XML CourseData) sent to « Résultats » as an organisers' upload of kind « courses » (functions/api/upload.js,
 *  prov/parsers/coursedata.py): the race's results lists get each circuit's length, climb and controls when the organisers'
 *  files lack them. From the race day only (the courses are secret before), by the organising club. */
export async function sendCourses(E) {
  const ev = E.ev, today = new Date().toISOString().slice(0, 10);
  if (E.meta.kind !== "race" || !E.meta.race) { E.toast(t("trc.race.scNotRace")); return; }
  if (E.meta.date && E.meta.date > today) { E.toast(t("trc.race.scSecret", { date: E.meta.date }), 6000); return; }
  const ids = courseList(ev);
  const v = await modal(E, { title: t("trc.race.scTitle"), wide: true, ok: t("trc.race.send"), body: `
    <p>${t("trc.race.scIntro")}</p>
    <p class="tr-hint">${tn("trc.race.scList", ids.length, { list: ids.map((id) => esc(ev.courses[id].name)).join(", ") })}</p>
    <label class="tr-check"><input type="checkbox" name="consent"> ${t("trc.race.scConsent")}</label>`,
  validate: (o) => (o.consent ? null : t("trc.race.scNeedConsent")) });
  if (!v) return;
  const { iofXmlText } = await import("./exports.js");
  const xml = iofXmlText(ev, 3), name = `${fileName(ev.title)} - circuits.xml`;
  E.status(t("trc.race.sending"), "busy");
  try {
    const r = await fetch("api/upload", { method: "POST", credentials: "same-origin",
      headers: { "Content-Type": "application/xml", "X-Upload": encodeURIComponent(JSON.stringify({ kind: "courses", race: E.meta.race, filename: name, consent: true })) },
      body: new Blob([xml], { type: "application/xml" }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw Object.assign(new Error(j.error || `http ${r.status}`), { code: j.error });
    E.status(t("trc.race.ready"), "ok");
    E.toast(j.soon === false ? t("trc.race.scSentLater") : t("trc.race.scSentSoon"), 7000);
  } catch (err) {
    E.status(t("trc.race.failed"), "err");
    const why = { "not organiser": t("trc.race.scWhyNotOrg"), race: t("trc.race.whyUnknownRace"), "unknown race": t("trc.race.whyUnknownRace"), "too big": t("trc.race.whyTooBig"), consent: t("trc.race.whyConsent") }[err.code] || err.message;
    E.toast(t("trc.race.scFail", { why }), 7000);
  }
}

// ---- publication to the map analysis ------------------------------------------------------------------------------------------------
/** Each course (each variation of a forked one, up to 12 in all) as a circuit of the event's map analysis: its map with the course
 *  printed on it, the controls' positions on that image, the georeference — after the race only for a competition. One dialog holds
 *  every setting of the analysis (owner, 2026-11-05: the setter had to go to Orga to finish it): its title and date, who opens it,
 *  what the runners may do; « Publier » or « Enregistrer en brouillon »; a window follows at once with the work's progress, then the
 *  analysis opens from it. Publishing again updates the event's analysis (its circuits and settings), never a second one. */
const OPT_KEYS = ["upload", "solo", "mymaps", "export", "notes", "variants", "view3d", "video", "routes"];
export async function publish(E) {
  const ev = E.ev;
  if (!G.hasGeo(ev)) { E.toast(t("trc.race.pubNeedsGeo", { where: where("georef") })); return; }
  const today = new Date().toISOString().slice(0, 10), isRace = E.meta.kind === "race";
  if (isRace && E.meta.date && E.meta.date > today) { E.toast(t("trc.race.pubSecret", { date: E.meta.date }), 6000); return; }
  const info = isRace ? await raceInfo(E).catch(() => ({})) : {};
  if (isRace && !info.provKey) { E.toast(t("trc.race.pubNotInResults")); return; }
  const call = async (path, opts = {}) => {
    const h = { ...(opts.headers || {}) };
    let body = opts.body;
    if (body && !(body instanceof Blob)) { body = JSON.stringify(body); h["Content-Type"] = "application/json"; }
    const r = await fetch(`api/analyses${path}`, { method: opts.method || "GET", headers: h, body, credentials: "same-origin" });
    const j = await r.json().catch(() => null);
    if (!r.ok) { const e = new Error(j?.error || `http ${r.status}`); e.code = j?.error; throw e; }
    return j;
  };
  // the analyses already published from this event (owner, 2026-11-05: a second publication, under another name and date, had
  // replaced the first): the dialog's first choice says which one is updated, a new one by default. A competition has one, its own.
  const known = [];
  try {
    const p0 = E.meta.published || {};
    const ids = [...(p0.analyses || []), p0.analysis].filter(Boolean).reverse();
    if (isRace) { const own = ((await call("")).analyses || []).find((a) => a.kind === "race" && a.race === info.provKey && a.organiser)?.id; if (own) ids.unshift(own); }
    for (const id of new Set(ids)) {
      try {
        const a = (await call(`/${id}`)).analysis;
        if (a && (isRace ? a.kind === "race" && a.race === info.provKey : a.kind !== "race")) known.push(a);
      } catch (e) { /* deleted since */ }
    }
  } catch (e) { /* none known */ }
  if (isRace) known.splice(1);
  const targetOf = (o) => (isRace ? known[0] || null : known.find((a) => a.id === o?.target) || null);
  const { designs, circuitOf, circuitLayers, vectorMap } = await import("./circuits.js");
  const des = designs(ev);
  const provRace = info.provKey ? await getData(`prov/${info.provKey}.json`) : null;
  const circuitNames = [...new Set((provRace?.docs || []).filter((d) => d.by !== "category").flatMap((d) => (d.classes || []).map((k) => k.name)))];
  const day = (d) => (d ? new Date(`${d}T12:00:00`).toLocaleDateString(locale()) : "");
  const courseRows = `<h3 class="tr-h3">${t("trc.race.pubCourses")}</h3>
    <table class="tr-table"><thead><tr><th></th><th>${t("trc.race.thCourse")}</th>${circuitNames.length ? `<th>${t("trc.race.thResultsCourse")}</th>` : ""}</tr></thead><tbody>
    ${des.map((d, i) => `<tr><td><input type="checkbox" name="p${i}" ${i < 12 ? "checked" : ""}></td><td>${esc(d.name)}</td>
      ${circuitNames.length ? `<td><select name="k${i}"><option value="">—</option>${circuitNames.map((n) => `<option ${norm(n) === norm(d.name) || norm(n).split(" ")[0] === norm(d.name).split(" ")[0] ? "selected" : ""}>${esc(n)}</option>`).join("")}</select></td>` : ""}</tr>`).join("")}</tbody></table>
    ${field(t("trc.race.pubDpi"), '<input name="dpi" value="150" inputmode="numeric">', t("trc.race.pubDpiHint"))}`;
  // the settings shown: the chosen analysis's, else the event's
  const fill = (form, a) => {
    const f = form.elements;
    f.title.value = a?.title || E.meta.title || "";
    f.date.value = a?.date || E.meta.date || today;
    f.vis.value = a?.vis || (isRace ? "public" : "club");
    f.vis.dispatchEvent(new Event("change"));
    f.visitors.checked = !!(a?.visitors && f.vis.value === "public");
    f.pw.value = "";
    // a club's analysis: a code for its invitees too (owner, 2026-11-07)
    f.code.checked = !!(a?.code && f.vis.value === "club"); f.cv.value = "";
    f.cv.placeholder = t(a?.code ? "sh.pw.keep" : "sh.pw.ph");
    for (const k of OPT_KEYS) f[`o_${k}`].checked = (a?.opts || {})[k] !== false;
    const pwOld = a?.vis === "password";
    form.querySelector("[data-pw] .tr-field > span").textContent = t(pwOld ? "sh.pw.new" : "trc.race.pubPw");
    f.pw.placeholder = t(pwOld ? "sh.pw.keep" : "sh.pw.ph");
    form.querySelector("[data-again]").hidden = !a;
    form.closest(".tr-dialog").querySelector('[data-v="draft"]').textContent = t(a && !a.draft ? "sh.m.unpublish" : "trc.race.saveDraft");
  };
  // two ways to accept: published (the runners open it at once) or saved as a draft its organisers alone see
  const v = await modal(E, { title: t("trc.race.pubTitle"), wide: true, ok: t("trc.race.publish"), cancel: null,
    extra: `<small class="tr-pub-why">${esc(t("trc.race.pubButtons"))}</small><button type="button" class="btn" data-x="cancel">${esc(t("trc.dlg.cancel"))}</button>
      <button type="submit" class="btn" data-v="draft">${esc(t("trc.race.saveDraft"))}</button>`, body: `
    <p>${t(isRace ? "trc.race.pubIntroRace" : "trc.race.pubIntroTraining")} <span data-again hidden>${esc(t("trc.race.pubAgain"))}</span></p>
    ${!isRace && known.length ? field(t("trc.race.pubTarget"), `<select name="target"><option value="">${esc(t("trc.race.pubNew"))}</option>${known.map((a) =>
      `<option value="${esc(a.id)}">${esc(t("trc.race.pubUpdateOf", { name: a.title, date: day(a.date) }))}</option>`).join("")}</select>`, t("trc.race.pubTargetHint")) : ""}
    <h3 class="tr-h3">${t("sh.m.pub")}</h3>
    ${field(t("trc.race.pubName"), '<input name="title" maxlength="120">', t("trc.race.pubNameHint"))}
    ${field(t("f.date"), '<input name="date" type="date">')}
    ${field(t("sh.col.access"), `<select name="vis">${["public", "club", "password"].map((x) => `<option value="${x}">${esc(t(`sh.vis.${x}.long`))}</option>`).join("")}</select>`)}
    <div data-pw hidden>${field(t("trc.race.pubPw"), '<input name="pw" type="text" autocomplete="off">')}</div>
    <div data-code hidden class="tr-codeline"><label class="tr-check" title="${esc(t("sh.code.tip"))}"><input type="checkbox" name="code"> ${esc(t("sh.code"))}</label>
      <input name="cv" type="text" autocomplete="off" aria-label="${esc(t("ma.code"))}"></div>
    <label class="tr-check" data-visitors hidden title="${esc(t("sh.visitors.hint"))}"><input type="checkbox" name="visitors"> ${esc(t("sh.visitors"))}</label>
    <h3 class="tr-h3">${t("sh.m.opts")}</h3>
    <ul class="tr-pub-opts">${OPT_KEYS.map((k) => `<li><label class="tr-check"><input type="checkbox" name="o_${k}">
      <span><b>${esc(t(`sh.opt.${k}`))}</b> <small>${esc(t(`sh.opt.${k}.hint`))}</small></span></label></li>`).join("")}</ul>
    ${courseRows}`,
  onOpen: (form) => {
    const vis = form.elements.vis;
    vis.addEventListener("change", () => {
      form.querySelector("[data-pw]").hidden = vis.value !== "password";
      form.querySelector("[data-visitors]").hidden = vis.value !== "public";
      form.querySelector("[data-code]").hidden = vis.value !== "club";
      if (vis.value !== "public") form.elements.visitors.checked = false;
    });
    form.elements.cv.addEventListener("input", () => { if (form.elements.cv.value) form.elements.code.checked = true; });   // a code typed ticks its box
    form.elements.target?.addEventListener("change", () => fill(form, targetOf({ target: form.elements.target.value })));
    fill(form, targetOf({ target: "" }));
  },
  validate: (o) => {
    const n = des.filter((_, i) => o[`p${i}`]).length;
    if (!n) return t("trc.race.pubNeedOne");
    if (n > 12) return t("trc.race.pubMax");
    if ((o.title || "").trim().length < 3) return t("trc.race.pubTitleShort");
    // a password: needed when there is none yet, else kept when left empty
    if (o.vis === "password" && (o.pw || "").length < (targetOf(o)?.vis === "password" && !o.pw ? 0 : 2)) return t("trc.race.pubPwShort");
    if (o.vis === "club" && o.code && (o.cv || "").length < (targetOf(o)?.code && !o.cv ? 0 : 2)) return t("ma.code.short");
    return null;
  } });
  if (!v) return;
  const prev = targetOf(v), clubCode = v.vis === "club" && !!v.code;
  const pick = des.map((d, i) => ({ ...d, i })).filter((d) => v[`p${d.i}`]), live = v._submit !== "draft";
  // the window opens at once (owner, 2026-11-05: the wait came before any sign): each circuit is printed with its course, then sent
  const box = progressBox(E, t(live ? "trc.race.pubTitle" : "trc.race.saveDraft"));
  // an OCAD or Mapper map: each circuit also gets the route choices' layers, read from its symbols (circuits.circuitLayers)
  const vec = vectorMap(E), total = 2 + (vec ? 3 : 2) * pick.length + 2;
  let done = 0;
  const step = (msg) => { box.say(msg, done / total); E.status(msg, "busy", done / total); done++; };
  try {
    step(t("trc.race.pubCreating"));
    let aid = prev?.id || null, kind = prev?.kind || (isRace ? "race" : "club");
    if (!aid) {
      const created = await call("", { method: "POST", body: isRace ? { kind: "race", race: info.provKey, title: v.title, date: v.date || today, vis: v.vis, password: v.vis === "password" ? v.pw : clubCode ? v.cv : undefined, code: clubCode, via: "tracer" }
        : { kind: "club", title: v.title, date: v.date || today, vis: v.vis, password: v.vis === "password" ? v.pw : clubCode ? v.cv : undefined, code: clubCode, via: "tracer", country: siteCountry() } });
      aid = created.id;
    }
    step(t("trc.race.pubCreating"));
    const cur = await call(`/${aid}`);
    const courses = (cur.analysis?.courses || []).filter((c) => !pick.some((_, j) => c.n === j));
    const dpi = Math.max(72, Math.min(300, Math.round(num(v.dpi)) || 150));
    for (let j = 0; j < pick.length; j++) {
      const d = pick[j];
      step(t("trc.race.pubCourseBusy", { i: j + 1, n: pick.length, name: d.name }));
      const c = await circuitOf(E, d, dpi);
      step(t("trc.race.pubCourseSend", { i: j + 1, n: pick.length, name: d.name }));
      await call(`/${aid}/map/${j}`, { method: "PUT", body: c.blob, headers: { "Content-Type": "image/png" } });
      const mv = Date.now();
      let layers = null;
      if (vec) {
        step(t("trc.race.pubCourseLayers", { i: j + 1, n: pick.length, name: d.name }));
        try {
          const blob = await circuitLayers(E, d, c);
          if (blob) { await call(`/${aid}/layers/${j}`, { method: "PUT", body: blob, headers: { "Content-Type": "application/octet-stream" } }); layers = { map: mv, src: E.map.format }; }
        } catch (e) { console.warn(e); }                   // the routes then read the image's colours
      }
      courses.push({ n: j, name: d.name.slice(0, 60), circuit: v[`k${d.i}`] || "", r: c.r, map: { w: c.w, h: c.h, type: "image/png", v: mv }, geo: c.geo, controls: c.controls, printed: true, ...(layers ? { layers } : {}) });
    }
    // the circuits, then every setting of the dialog — published, or kept as a draft its organisers alone see
    step(t("trc.race.pubSaving"));
    await call(`/${aid}`, { method: "PUT", body: { courses: courses.sort((a, b) => a.n - b.n) } });
    const set = { title: v.title, date: v.date || today, vis: v.vis, visitors: v.vis === "public" && !!v.visitors, draft: !live,
      opts: Object.fromEntries(OPT_KEYS.map((k) => [k, !!v[`o_${k}`]])) };
    if (v.vis === "password" && v.pw) set.password = v.pw;
    if (v.vis === "club") { set.code = clubCode; if (clubCode && v.cv) set.password = v.cv; }
    step(t("trc.race.pubSaving"));
    await call(`/${aid}`, { method: "PUT", body: set });
    // the event's card remembers its analysis: « Bilan après la course » reads its shared traces, a new publication updates it
    // (and the list of all its analyses, offered for an update next time)
    const p0 = E.meta.published || {}, all = [...(p0.analyses || []), p0.analysis].filter((x) => x && x !== aid);
    try { const r = await S.api(`/${E.meta.id}`, { method: "PUT", body: { published: { analysis: aid, analyses: [...new Set(all), aid].slice(-20) } } }); if (r?.event) E.meta = r.event; } catch (e) { /* the review will not find it */ }
    E.status(t("trc.race.ready"), "ok");
    // opened from here (the setter's intent), in a tab of its own: the runners' view, or its organisers' page
    const view = `#/${kind === "race" ? "analyse-competition" : "analyse-club"}?id=${aid}`, manage = `#/orga-analyses?id=${aid}`;
    box.done(t(live ? "trc.race.published" : "trc.race.pubSaved"), `
      <p>${esc(tn(prev ? "trc.race.pubDoneUpdated" : "trc.race.pubDone", pick.length))} ${esc(t(live ? "trc.race.pubDoneLive" : "trc.race.pubDoneDraft"))}</p>
      <p class="tr-pub-go"><a class="btn btn-primary" href="${view}" target="_blank" rel="noopener">${esc(t("trc.race.pubOpen"))}</a>
        <a class="btn" href="${manage}" target="_blank" rel="noopener">${esc(t("trc.race.pubManage"))}</a></p>`);
  } catch (err) {
    E.status(t("trc.race.failed"), "err");
    const why = { "not organiser": t("trc.race.pubWhyNotOrg"), race: t("trc.race.pubWhyRace"), courses: t("trc.race.pubWhyCourses"), rate: t("trc.race.pubWhyRate"), "too many": t("trc.race.pubWhyRate"),
      noclub: t("trc.race.pubWhyNoClub"), password: t("trc.race.pubPwShort"), fields: t("trc.race.pubTitleShort") }[err.code] || err.message;
    box.done(t("trc.race.failed"), `<p class="tr-err">${esc(t("trc.race.pubFail", { why }))}</p>`);
  }
}
/** The publication's window: a line saying what is being done and a bar, then its outcome with « Fermer ». */
function progressBox(E, title) {
  const m = document.createElement("div");
  m.className = "tr-modal";
  m.innerHTML = `<div class="tr-dialog" role="dialog" aria-modal="true" aria-label="${esc(title)}"><h2>${esc(title)}</h2>
    <div data-body><p data-say></p>${bar(0)}<p class="muted"><small>${esc(t("trc.race.pubWait"))}</small></p></div>
    <div class="tr-dlg-btns"><button type="button" class="btn" data-x="close" hidden>${esc(t("trc.race.close"))}</button></div></div>`;
  (E.root || document.body).appendChild(m);
  const btn = m.querySelector("[data-x=close]"), close = () => m.remove();
  btn.addEventListener("click", close);
  m.addEventListener("keydown", (e) => { if (e.key === "Escape" && !btn.hidden) { e.stopPropagation(); close(); } });
  return {
    say(msg, frac) { m.querySelector("[data-say]").textContent = msg; setBar(m.querySelector("progress"), frac); },
    done(head, html) { m.querySelector("h2").textContent = head; m.querySelector("[data-body]").innerHTML = html; btn.hidden = false; btn.focus(); },
  };
}

