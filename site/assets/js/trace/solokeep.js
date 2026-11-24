// The solo analyses an account keeps (owner, 2026-11-05): « Analyse solo »'s « Enregistrer l'analyse », beside « Voir la
// course », keeps the map and the run as the playback draws it — positions in the map's pixels and times, the controls placed,
// never the watch's other channels. Since 2026-11-24 (owner: « solo analyses should be treated the same way, going into the same
// store ») they are runs of « Mes cartes » (trace/mymaps.js): the map once per account, the run of kind « solo », « drawn » or
// « orga » (on an organiser's map); the analyses kept before in /api/solo are moved there once (`moveOld`, POST
// /api/mymaps/from-solo). « Analyse de carte » lists them (pages/mapanalysis.js), replays one (`#/analyse-solo?analyse=<run id>`:
// pages/analysis.js opens it straight on the playback through `load`), renames or deletes it (the run; the map stays in
// « Mes cartes »). No text here.

import { imageBlob } from "./mapfile.js";
import * as MM from "./mymaps.js";
import { runOf } from "./mymapsave.js";

/** The runs of the library that are analyses (an analysis's playback saved them), not files imported. */
export const KINDS = ["solo", "drawn", "orga"];

// the analyses kept in /api/solo before 2026-11-24 moved into the library, once a visit; this browser's notes of the trace each was
// kept for (pages/analysis.js `ocn.an.kept.<trace>`) follow them to their run's id
let moving = null;
export function moveOld() {
  if (!moving) {
    moving = (async () => {
      for (let i = 0; i < 100; i++) {
        const r = await MM.fromSolo();
        if (r.moved) {
          try {
            for (const k of Object.keys(localStorage)) {
              if (!k.startsWith("ocn.an.kept.")) continue;
              const v = JSON.parse(localStorage.getItem(k) || "null");
              if (v?.id && r.ids[v.id]) localStorage.setItem(k, JSON.stringify({ ...v, id: r.ids[v.id] }));
            }
          } catch (e) { /* the page checks the list anyway */ }
        }
        if (!r.left) break;
      }
    })().catch((e) => { console.warn("solo analyses not moved", e); moving = null; });
  }
  return moving;
}

/** The account's kept analyses, the latest first: [{ id (the run's), map, title, day, geo, w, h, dur, dist, source, thumb }]. */
export async function list() {
  await moveOld();
  const { maps = [] } = await MM.list();
  const out = [];
  for (const m of maps) {
    for (const r of m.runs || []) {
      if (!KINDS.includes(r.source)) continue;
      out.push({ id: r.id, map: m.id, title: r.title || m.title || "", day: r.day || m.day || "", geo: m.geo, w: m.w, h: m.h,
        dur: r.dur, dist: r.dist, source: r.source, thumb: !!m.thumb, start: r.start });
    }
  }
  return out.sort((a, b) => (b.day || "").localeCompare(a.day || "") || (b.start || 0) - (a.start || 0));
}
/** An analysis deleted (its run; its map stays in « Mes cartes »), and this browser's note of the trace it was kept for. */
export async function remove(id) {
  await MM.deleteRun(id);
  try {
    for (const k of Object.keys(localStorage)) if (k.startsWith("ocn.an.kept.") && JSON.parse(localStorage.getItem(k) || "null")?.id === id) localStorage.removeItem(k);
  } catch (e) { /* the page checks the list anyway */ }
}
/** Its map's thumbnail (a summary of `list`). */
export const thumbUrl = (a) => MM.mapUrl(a.map, a.thumb ? "thumb" : "map");
/** An analysis renamed. */
export const rename = (id, title) => MM.updateRun(id, { title });

/**
 * Keep the analysis of state s (trace/mymapsave.js `mount`'s state) in « Mes cartes »: { id (the run's), map }. id: the one kept
 * before for this trace, replaced (a calibration made again). extra: { title (empty: the name it has), source, priv }.
 */
export async function save(s, { id = null, title = "", source = "solo", priv = false } = {}) {
  await moveOld();
  const run = runOf(s, false);
  const blob = await imageBlob(s.file || null, s.image);          // the map as it came; a PDF's or a generated map's page as a PNG
  const { map, runs } = await MM.save({ blob, name: s.file?.name || "", image: s.image, title: title || s.title || "", day: run.day, geo: s.geo || null,
    private: !!priv, runs: [{ title, day: run.day, source, start: run.start, dur: run.dur, dist: run.dist, rec: run.rec, replace: id }] });
  return { id: runs[0].id, map: map.id };
}

/**
 * A kept analysis read back to be played: { a: { title, day }, files: [the map, the run as a GPX] } — the GPX of « Mes cartes »'
 * « Rejouer » (mymaps.replayGpx), so that « Analyse solo » lays the run through the georeference and controls kept.
 */
export async function load(id) {
  await moveOld();
  const { maps = [] } = await MM.list();
  const m = maps.find((x) => (x.runs || []).some((r) => r.id === id));
  if (!m) { const e = new Error("not found"); e.status = 404; throw e; }
  const r = m.runs.find((x) => x.id === id), title = r.title || m.title || "";
  const gpx = MM.replayGpx(m, MM.decodeRun(await MM.getRun(id)), title, r);
  if (!gpx) throw new Error("geo");
  const res = await fetch(MM.mapUrl(m.id, "map"), { credentials: "same-origin" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const blob = await res.blob();
  const ext = /png/.test(blob.type) ? "png" : /webp/.test(blob.type) ? "webp" : "jpg";
  return { a: { title, day: r.day || m.day }, files: [new File([blob], MM.fileName(title, r.day || m.day, ext), { type: blob.type }),
    new File([gpx], MM.fileName(title, r.day || m.day, "gpx"), { type: "application/gpx+xml" })] };
}
