// Pixel › Analyse (owner, 2026-11-14: « change pixel analyses so they are like coach analyses … producing a GPS trace for each
// runner in order to reuse the same components, as users will fully expect the same functionalities and ergonomy »): a Pixel map
// and its runs served to Coach's map analysis (pages/shared.js) as one of its analyses, read in the browser, nothing stored.
// - The analysis: the map, a circuit per course — the map drawn from its package (an OCAD file, a LiDAR map's image, an
//   invented forest made again in the browser), the controls in the image's pixels, a georeference from the map's centre (the
//   package's lonlat; an invented forest gets a place of its own in the ocean, so that no relief is read for it).
// - The traces: each runner once a circuit — one's own run chosen in the address, else one's best; the others' best runs, the
//   100 most recent runners (owner, 2026-11-14) — their routes [[t, x, z]] (world metres, the map's frame) turned into one
//   position a second in latitude and longitude, from the run's start (its saving time less its race time).
// - Read only: nothing is added, commented or removed there (the analysis's `readonly`, its runners' switches off).
// shared.js asks it through `api()` for the paths of an analysis « px~<race> »: /<id>, /<id>?poll=1, /<id>/map/<n>, /<id>/traces/<n>.

const API = "/api/virtual/";
const CAP = 100;                                             // the other runners of a circuit, the most recent
const OCEAN = [-30, 40];                                     // an invented forest's place: [lon, lat], no land, no relief read
const R_EARTH = 6371000;

async function getJson(url) {
  const r = await fetch(url, { credentials: "same-origin", cache: "no-store" });
  if (!r.ok) throw Object.assign(new Error(`${url}: ${r.status}`), { status: r.status });
  return r.json();
}
/** The position ([x, z]) of a route at time s, interpolated; its ends outside. */
function posAt(route, s) {
  if (s <= route[0][0]) return [route[0][1], route[0][2]];
  let lo = 0, hi = route.length - 1;
  if (s >= route[hi][0]) return [route[hi][1], route[hi][2]];
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (route[m][0] <= s) lo = m; else hi = m; }
  const [ta, xa, za] = route[lo], [tb, xb, zb] = route[hi], f = (s - ta) / (tb - ta || 1);
  return [xa + (xb - xa) * f, za + (zb - za) * f];
}
const notFound = () => Object.assign(new Error("not found"), { status: 404, code: "not found" });

/**
 * The analysis of one Pixel map as shared.js reads one: { id, api(path, { method }) }.
 * race: the page's map ({ id, race: { courses, … }, event?, gen? }); runs: every run of the map the page knows
 * ({ id, race, u, name, course, t, at, kind, help, mine }); pick: one's own run to show (its id), else one's best of each circuit;
 * canSee(run): whether this account may see another's run; mapOf(race) → { canvas, ppm, k, W, H, lonlat }; title, courseName(c).
 */
export function pixelAnalysis({ race, runs, pick, canSee, mapOf, title, courseName }) {
  const id = `px~${race.id}`, courses = race.race.courses || [];
  // runners numbered for the analysis: the same number on every circuit (stable: by their hash)
  const us = [...new Set(runs.map((r) => r.u))].sort(), uidOf = new Map(us.map((u, i) => [u, i + 1]));
  const meU = runs.find((r) => r.mine)?.u;
  // a circuit's runs: a training's (a competition's on an event of that kind; the built-in maps' competitions are tests)
  const competition = race.event?.type === "competition";
  const circuitRuns = (c) => {
    const of = runs.filter((r) => r.course === c.id && r.t > 0 && (competition ? r.kind === "competition" || r.mine : r.kind !== "competition"));
    const best = new Map();
    for (const r of of) {
      if (!r.mine && !canSee(r)) continue;
      const b = best.get(r.u);
      if (r.mine && r.id === pick) { best.set(r.u, { ...r, pinned: true }); continue; }
      if (!b || (!b.pinned && r.t < b.t)) best.set(r.u, r);
    }
    const mine = meU ? best.get(meU) : null;
    const others = [...best.values()].filter((r) => r.u !== meU).sort((a, b) => b.at.localeCompare(a.at)).slice(0, CAP);
    return { list: [...(mine ? [mine] : []), ...others], total: best.size };
  };
  let map = null, meta = null;
  const routes = new Map();
  async function build() {
    if (meta) return meta;
    const m = await (map ||= mapOf(race));
    const s = m.ppm / m.k;                                    // image pixels a world metre
    const [lon0, lat0] = m.lonlat || OCEAN, xc = m.W / 2, zc = m.H / 2;
    const kx = (Math.PI / 180) * R_EARTH * Math.cos((lat0 * Math.PI) / 180), ky = (Math.PI / 180) * R_EARTH;
    const geo = { a: s * kx, b: 0, c: s * (xc - kx * lon0), d: 0, e: -s * ky, f: s * (zc + ky * lat0) };
    const frame = { lon0, lat0, kx, ky, xc, zc };
    const latest = runs.reduce((a, r) => (r.at > a ? r.at : a), "");
    meta = {
      id, kind: "club", readonly: true, via: "pixel", title, date: (latest || new Date().toISOString()).slice(0, 10), vis: "public",
      visitors: false, code: false, draft: false, owner: 0, ownerName: "", orgName: "",
      // read only: no trace added, no comment, no « Analyse solo » nor Mes cartes; the 3D view only on a real place's relief
      opts: { upload: false, solo: false, mymaps: false, notes: false, variants: true, view3d: !!m.lonlat, video: true, routes: true },
      courses: courses.map((c, n) => ({
        n, name: courseName(c), circuit: "", r: Math.round(3 * m.ppm), printed: false,
        map: { w: m.canvas.width, h: m.canvas.height, type: "image/webp", v: 1 }, geo,
        controls: c.controls.map((p, i) => ({ kind: p.kind || (i ? (i === c.controls.length - 1 ? "finish" : "control") : "start"),
          code: String(p.code || ""), x: Math.round(p.x * s * 10) / 10, y: Math.round(p.z * s * 10) / 10 })) })),
    };
    meta.frame = frame;
    return meta;
  }
  const traceList = () => courses.flatMap((c, n) => circuitRuns(c).list.map((r) => ({ course: n, uid: uidOf.get(r.u), name: r.name, lic: "", updated: r.at, size: 0 })));
  /** Routes of runs, read together (api/virtual runs/<race>/routes), kept for the visit. */
  async function routesOf(list) {
    const want = list.filter((r) => !routes.has(r.id)).map((r) => r.id);
    for (let i = 0; i < want.length; i += 101) {
      const got = await getJson(`${API}runs/${encodeURIComponent(race.id)}/routes?ids=${want.slice(i, i + 101).join(",")}`);
      for (const [k, v] of Object.entries(got)) routes.set(k, v?.route || []);
    }
    return list.map((r) => routes.get(r.id) || []);
  }
  /** A run as a shared trace: one point a second, millionths of a degree as deltas (trace/share.js encodeTrace's form). */
  function traceOf(r, route, n) {
    const { lon0, lat0, kx, ky, xc, zc } = meta.frame;
    const end = Math.floor(route[route.length - 1][0]), t0 = Math.round(Date.parse(r.at) / 1000 - (r.t || end));
    const dt = [], la = [], lo = [];
    let pla = 0, plo = 0;
    for (let sec = 0; sec <= end; sec++) {
      const [x, z] = posAt(route, sec);
      const ila = Math.round((lat0 - (z - zc) / ky) * 1e6), ilo = Math.round((lon0 + (x - xc) / kx) * 1e6);
      dt.push(sec ? 1 : 0); la.push(sec ? ila - pla : ila); lo.push(sec ? ilo - plo : ilo); pla = ila; plo = ilo;
    }
    return { v: 1, t0, dt, la, lo, uid: uidOf.get(r.u), name: r.name, lic: "", course: n, updated: r.at };
  }
  async function api(path, { method = "GET" } = {}) {
    if (method !== "GET") throw Object.assign(new Error("read only"), { status: 403, code: "forbidden" });
    const [p, q] = path.split("?"), parts = p.split("/").filter(Boolean);    // [id, sub, n]
    if (parts[0] !== id) throw notFound();
    await build();
    if (parts.length === 1) {
      const traces = traceList();
      if (/(^|&)poll=1/.test(q || "")) return { traces };
      return { analysis: meta, traces, you: { uid: meU ? uidOf.get(meU) : 0, organiser: false } };
    }
    const n = Number(parts[2]), c = courses[n];
    if (!c) throw notFound();
    if (parts[1] === "map") {
      const m = await map;
      return (m.blob ||= await new Promise((ok) => m.canvas.toBlob((b) => ok(b), "image/webp", 0.92)));
    }
    if (parts[1] === "traces") {
      const list = circuitRuns(c).list, rs = await routesOf(list);
      return list.map((r, i) => (rs[i].length > 1 ? traceOf(r, rs[i], n) : null)).filter(Boolean);
    }
    throw notFound();                                          // layers, extras…: none (the routes are read from the map's colours)
  }
  return { id, api, circuitN: (courseId) => courses.findIndex((c) => c.id === courseId), myUid: () => (meU ? uidOf.get(meU) : 0),
    counts: (courseId) => { const c = courses.find((x) => x.id === courseId); return c ? circuitRuns(c) : { list: [], total: 0 }; } };
}

/**
 * The map of a Pixel race, drawn as its analysis shows it: { canvas, ppm, k, W, H, lonlat }. A map's package
 * (/api/virtual/<id>/) or an event's (/api/virtual/events/<id>/pkg/): its race.json gives the frame, then its OCAD file or,
 * for a race from the LiDAR alone (race.map "webp"), the generated map's image; an invented forest its package made in the browser.
 */
export async function drawRaceMap(race) {
  const { drawMap } = await import("../games/virtually.js");
  if (race.gen) {
    const data = await race.load();
    return { ...(await drawMap(data)), k: data.race.k, W: data.race.W, H: data.race.H, lonlat: null };
  }
  const base = race.event ? `${API}events/${race.id}/pkg/` : `${API}${race.id}/`;
  const get = async (f) => {
    const r = await fetch(base + f, { credentials: "same-origin" });
    if (!r.ok) throw Object.assign(new Error(`${f}: ${r.status}`), { status: r.status });
    return r;
  };
  const full = await (await get("race.json")).json();
  const m = full.map === "webp"
    ? await drawMap({ race: full, mapImage: await createImageBitmap(await (await get("map.webp")).blob()) })
    : await drawMap({ race: full, ocd: new Uint8Array(await (await get("map.ocd")).arrayBuffer()) });
  return { ...m, k: full.k, W: full.W, H: full.H, lonlat: Array.isArray(full.lonlat) ? full.lonlat : null };
}
