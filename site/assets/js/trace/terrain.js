// The ground's heights under a calibrated map, for « Analyse solo »'s 3D view (2026-10-24) and Cartographier's contours: a
// regular grid laid over the map image (its nodes at map pixels, so the image is the mesh's texture as it is), each node's
// height from
// - IGN's RGE ALTI in France (Géoplateforme's elevation service: 5,000 points a request at most, about one request a second
//   asked — three at a time here; CORS open; its 1 m model read at the grid's nodes),
// - a national LiDAR model elsewhere where one is open and readable from the browser (2026-11-06; GeoTIFF / COG read with
//   geotiff.js, the nodes projected by proj4js, both vendored): Switzerland swissALTI3D (swisstopo, 2 m tiles of 1 km found
//   through its STAC), the USA 3DEP (USGS, its ImageServer's float TIFF at the grid's step, 1 m where flown), Canada HRDEM
//   (NRCan, the LiDAR projects' 1 m COGs found through its STAC, newest first), New Zealand (LINZ's national 1 m DEM, one COG
//   a Topo50 sheet on its public S3 bucket); a source that covers under half the nodes gives way to the next,
//   else, or when they fail,
// - the AWS open terrain tiles (« Terrarium » PNGs, the height in the colour: R × 256 + G + B / 256 − 32768; SRTM's 30 m
//   and better national models where Mapzen had them), read at the zoom whose pixel is the grid's step, 15 at most.
// Only the nodes' coordinates (or the area's box) leave the browser, never the trace. The grid is kept in IndexedDB
// (« ocn-analyse », the analyses' own base; keys « dem:… », the last DEM_KEEP grids) so that the view opens at once the next
// time.

import { GEOTIFF, PROJ4 } from "../vendor.js";

const IGN = "https://data.geopf.fr/altimetrie/1.0/calcul/alti/rest/elevation.json";
const IGN_MAX = 4900, IGN_PAR = 3;
const TILES = (z, x, y) => `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${z}/${x}/${y}.png`;
const MAX_NODES = 40000, MIN_STEP = 5, MAX_SIDE = 320;
const DB = "ocn-analyse", STORE = "files", DEM_KEEP = 12;

/** The sources' credits, shown in the view. */
export const CREDIT = {
  ign: { text: "IGN – RGE ALTI®", url: "https://geoservices.ign.fr/rgealti" },
  tiles: { text: "Terrain Tiles (Mapzen, AWS Open Data: SRTM, GMTED, EU-DEM, USGS 3DEP…)", url: "https://github.com/tilezen/joerd/blob/master/docs/attribution.md" },
};
Object.assign(CREDIT, {
  swisstopo: { text: "© swisstopo – swissALTI3D", url: "https://www.swisstopo.admin.ch/en/height-model-swissalti3d" },
  usgs: { text: "USGS – 3D Elevation Program (3DEP)", url: "https://www.usgs.gov/3d-elevation-program" },
  nrcan: { text: "NRCan – HRDEM (Open Government Licence – Canada)", url: "https://open.canada.ca/data/en/dataset/957782bf-847c-4644-a757-e383c0057995" },
  linz: { text: "© LINZ – New Zealand LiDAR 1 m DEM (CC BY 4.0)", url: "https://data.linz.govt.nz/" },
});
for (const k of ["ign", "swisstopo", "usgs", "nrcan", "linz"]) CREDIT[`${k}+tiles`] = { text: `${CREDIT[k].text}, Terrain Tiles`, url: CREDIT[k].url };

/**
 * The grid over a map of W × H pixels whose pixels map to metres by toM(px, py): about MAX_NODES nodes, a step of 5 m at
 * least, no side over MAX_SIDE nodes. Returns { nx, ny, step } (step in metres, along the longer side). o: other limits
 * ({ maxNodes, minStep, maxSide }: the Tracer's elevation model of a whole event, kept with it, is finer).
 */
export function gridPlan(W, H, toM, o = {}) {
  const d = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  const wm = d(toM(0, 0), toM(W, 0)), hm = d(toM(0, 0), toM(0, H));
  const maxNodes = o.maxNodes || MAX_NODES, minStep = o.minStep || MIN_STEP, maxSide = o.maxSide || MAX_SIDE;
  let step = Math.max(minStep, Math.sqrt((wm * hm) / maxNodes));
  step = Math.max(step, Math.max(wm, hm) / (maxSide - 1));
  return { nx: Math.max(2, Math.round(wm / step) + 1), ny: Math.max(2, Math.round(hm / step) + 1), step, wm, hm };
}

/** Whether a place is where IGN's model has data: metropolitan France, Corsica and the overseas départements. */
export function inFrance(lat, lon) {
  const boxes = [[41.2, 51.2, -5.5, 9.8], [15.8, 16.6, -61.9, -60.9], [14.3, 14.9, -61.3, -60.7], [2.0, 5.9, -54.7, -51.5], [-21.5, -20.8, 55.1, 55.9], [-13.1, -12.6, 44.9, 45.4]];
  return boxes.some(([a, b, c, d]) => lat >= a && lat <= b && lon >= c && lon <= d);
}

// ---- the cache -----------------------------------------------------------------------------------------------------------
function idb() {
  return new Promise((res, rej) => {
    const q = indexedDB.open(DB, 1);
    q.onupgradeneeded = () => q.result.createObjectStore(STORE);
    q.onsuccess = () => res(q.result);
    q.onerror = () => rej(q.error);
  });
}
async function idbDo(fn) {
  const db = await idb();
  try { return await new Promise((res, rej) => { const tx = db.transaction(STORE, "readwrite"); const out = fn(tx.objectStore(STORE)); tx.oncomplete = () => res(out?.result); tx.onerror = () => rej(tx.error); }); }
  finally { db.close(); }
}
async function cached(key) { try { return await idbDo((s) => s.get(key)); } catch (e) { return null; } }
async function keep(key, value) {
  try {
    const index = ((await cached("dem:index")) || []).filter((k) => k !== key);
    index.push(key);
    const drop = index.splice(0, Math.max(0, index.length - DEM_KEEP));
    await idbDo((s) => { s.put(value, key); s.put(index, "dem:index"); for (const k of drop) s.delete(k); });
  } catch (e) { /* not kept: fetched again next time */ }
}

// ---- the sources ---------------------------------------------------------------------------------------------------------
/** IGN's heights at the points [[lat, lon]…]: NaN where it has none (-99999). Throws when the service fails. */
async function fromIgn(pts, onProgress) {
  const z = new Float32Array(pts.length).fill(NaN), chunks = [];
  for (let i = 0; i < pts.length; i += IGN_MAX) chunks.push(i);
  let done = 0, next = 0;
  const one = async (from) => {
    const part = pts.slice(from, from + IGN_MAX);
    const body = JSON.stringify({ lon: part.map((p) => p[1].toFixed(6)).join("|"), lat: part.map((p) => p[0].toFixed(6)).join("|"), resource: "ign_rge_alti_wld", zonly: "true", delimiter: "|" });
    for (let attempt = 0; ; attempt++) {
      const r = await fetch(IGN, { method: "POST", headers: { "Content-Type": "application/json" }, body, credentials: "omit", referrerPolicy: "no-referrer" });
      if (r.ok) {
        const j = await r.json();
        // France's lowest land is a few metres below the sea: deeper values are the model's sea (−522 m by Monaco)
        (j.elevations || []).forEach((v, k) => { const h = typeof v === "number" ? v : v?.z; z[from + k] = Number.isFinite(h) && h > -50 ? h : NaN; });
        break;
      }
      if (attempt >= 2 || (r.status !== 429 && r.status < 500)) throw new Error(`IGN ${r.status}`);
      await new Promise((ok) => setTimeout(ok, 1500 * (attempt + 1)));
    }
    onProgress?.(++done / chunks.length);
  };
  await Promise.all(Array.from({ length: Math.min(IGN_PAR, chunks.length) }, async () => { while (next < chunks.length) await one(chunks[next++]); }));
  return z;
}

/** The terrain tiles' heights at the points, read bilinearly at the zoom whose pixel is about `step` metres. */
async function fromTiles(pts, step, onProgress) {
  let la0 = Infinity, la1 = -Infinity, lo0 = Infinity, lo1 = -Infinity;
  for (const [la, lo] of pts) { la0 = Math.min(la0, la); la1 = Math.max(la1, la); lo0 = Math.min(lo0, lo); lo1 = Math.max(lo1, lo); }
  const merc = (lat, lon, z) => { const n = 2 ** z, s = Math.sin((lat * Math.PI) / 180); return [((lon + 180) / 360) * n * 256, (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * n * 256]; };
  const cosLat = Math.cos((((la0 + la1) / 2) * Math.PI) / 180);
  let z = 15;
  while (z > 8 && (156543.03 * cosLat) / 2 ** (z - 1) <= step) z--;            // the coarsest zoom still finer than the step
  let tx0, tx1, ty0, ty1;
  for (; ; z--) {
    const [ax, ay] = merc(la1, lo0, z), [bx, by] = merc(la0, lo1, z);
    tx0 = Math.floor(ax / 256); tx1 = Math.floor(bx / 256); ty0 = Math.floor(ay / 256); ty1 = Math.floor(by / 256);
    if ((tx1 - tx0 + 1) * (ty1 - ty0 + 1) <= 36 || z <= 8) break;
  }
  const tw = tx1 - tx0 + 1, th = ty1 - ty0 + 1, W = tw * 256, H = th * 256;
  const hgt = new Float32Array(W * H).fill(NaN);
  const c = document.createElement("canvas"); c.width = c.height = 256;
  const g = c.getContext("2d", { willReadFrequently: true });
  let done = 0;
  const jobs = [];
  for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) jobs.push([tx, ty]);
  let next = 0;
  const one = async ([tx, ty]) => {
    const r = await fetch(TILES(z, tx, ty), { credentials: "omit", referrerPolicy: "no-referrer" });
    if (!r.ok) throw new Error(`tiles ${r.status}`);
    const bmp = await createImageBitmap(await r.blob(), { colorSpaceConversion: "none", premultiplyAlpha: "none" });
    g.clearRect(0, 0, 256, 256); g.drawImage(bmp, 0, 0);
    const d = g.getImageData(0, 0, 256, 256).data, ox = (tx - tx0) * 256, oy = (ty - ty0) * 256;
    for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) { const k = 4 * (y * 256 + x); hgt[(oy + y) * W + ox + x] = d[k] * 256 + d[k + 1] + d[k + 2] / 256 - 32768; }
    onProgress?.(++done / jobs.length);
  };
  await Promise.all(Array.from({ length: Math.min(4, jobs.length) }, async () => { while (next < jobs.length) await one(jobs[next++]); }));
  const out = new Float32Array(pts.length);
  pts.forEach(([la, lo], i) => {
    const [mx, my] = merc(la, lo, z), x = Math.max(0, Math.min(W - 1.001, mx - tx0 * 256 - 0.5)), y = Math.max(0, Math.min(H - 1.001, my - ty0 * 256 - 0.5));
    const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0, at = (xx, yy) => hgt[yy * W + xx];
    out[i] = (1 - fy) * ((1 - fx) * at(x0, y0) + fx * at(x0 + 1, y0)) + fy * ((1 - fx) * at(x0, y0 + 1) + fx * at(x0 + 1, y0 + 1));
  });
  return { z: out, zoom: z, tiles: jobs.length };
}

/** The terrain tiles' heights at points [[lat, lon]…] (the Tracer's climb outside France, 2026-10-24): a Float32Array. */
export async function tileHeights(pts, step = 10) { return (await fromTiles(pts, step)).z; }

// ---- the national sources (2026-11-06) ------------------------------------------------------------------------------------
const CH_STAC = "https://data.geo.admin.ch/api/stac/v1/collections/ch.swisstopo.swissalti3d/items";
const CH_MAX_TILES = 64;                     // 1 km tiles of ~250 KB: 16 MB at most
const US_3DEP = "https://elevation.nationalmap.gov/arcgis/rest/services/3DEPElevation/ImageServer/exportImage";
const US_MAX_SIDE = 4000;
const CA_STAC = "https://datacube.services.geo.ca/stac/api/search";
const CA_MAX_ITEMS = 4;
const NZ_DEM = "https://nz-elevation.s3.ap-southeast-2.amazonaws.com/new-zealand/new-zealand/dem_1m/2193";
const NZ_MAX_SHEETS = 4;
const PAR = 4;
/** The grids the sources are in (proj4 texts). */
const CRS = {
  2154: "+proj=lcc +lat_0=46.5 +lon_0=3 +lat_1=49 +lat_2=44 +x_0=700000 +y_0=6600000 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs",
  27700: "+proj=tmerc +lat_0=49 +lon_0=-2 +k=0.9996012717 +x_0=400000 +y_0=-100000 +ellps=airy +towgs84=446.448,-125.157,542.06,0.15,0.247,0.842,-20.489 +units=m +no_defs",
  3006: "+proj=utm +zone=33 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs",
  31370: "+proj=lcc +lat_0=90 +lon_0=4.36748666666667 +lat_1=51.1666672333333 +lat_2=49.8333339 +x_0=150000.013 +y_0=5400088.438 +ellps=intl +towgs84=-106.8686,52.2978,-103.7239,0.3366,-0.457,1.8422,-1.2747 +units=m +no_defs",
  3812: "+proj=lcc +lat_0=50.797815 +lon_0=4.35921583333333 +lat_1=49.8333333333333 +lat_2=51.1666666666667 +x_0=649328 +y_0=665262 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs",
  28992: "+proj=sterea +lat_0=52.1561605555556 +lon_0=5.38763888888889 +k=0.9999079 +x_0=155000 +y_0=463000 +ellps=bessel +towgs84=565.4171,50.3319,465.5524,1.9342,-1.6677,9.1019,4.0725 +units=m +no_defs",
  2056: "+proj=somerc +lat_0=46.9524055555556 +lon_0=7.43958333333333 +k_0=1 +x_0=2600000 +y_0=1200000 +ellps=bessel +towgs84=674.374,15.056,405.346,0,0,0,0 +units=m +no_defs",
  3979: "+proj=lcc +lat_0=49 +lon_0=-95 +lat_1=49 +lat_2=77 +x_0=0 +y_0=0 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs",
  2193: "+proj=tmerc +lat_0=0 +lon_0=173 +k=0.9996 +x_0=1600000 +y_0=10000000 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs",
};
// NAD83(CSRS) UTM zones by EPSG code (HRDEM projects not in EPSG:3979)
const CSRS_UTM = { 2955: 11, 2956: 12, 2957: 13, 2958: 17, 2959: 18, 2960: 19, 2961: 20, 2962: 21, 3154: 7, 3155: 8, 3156: 9, 3157: 10, 3158: 14, 3159: 15, 3160: 16, 3761: 22, 9709: 23 };
/** A grid's proj4 text by its EPSG code, or null. */
export function crsDef(epsg) {
  epsg = Number(epsg);
  if (CRS[epsg]) return CRS[epsg];
  if (epsg >= 32601 && epsg <= 32660) return `+proj=utm +zone=${epsg - 32600} +datum=WGS84 +units=m +no_defs`;
  if (epsg >= 32701 && epsg <= 32760) return `+proj=utm +zone=${epsg - 32700} +south +datum=WGS84 +units=m +no_defs`;
  if (epsg >= 25828 && epsg <= 25838) return `+proj=utm +zone=${epsg - 25800} +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs`;
  if (epsg >= 26901 && epsg <= 26923) return `+proj=utm +zone=${epsg - 26900} +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs`;
  if (CSRS_UTM[epsg]) return `+proj=utm +zone=${CSRS_UTM[epsg]} +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs`;
  return null;
}

const inBox = (lat, lon, [a, b, c, d]) => lat >= a && lat <= b && lon >= c && lon <= d;
const BOX = {
  CH: [[45.8, 47.82, 5.95, 10.5]],
  NZ: [[-47.4, -34.3, 166.3, 178.7]],
  CA: [[41.6, 83.2, -141.1, -52.5]],
  // the lower 48, Alaska (and the Aleutians across 180°), Hawaii, Puerto Rico and the Virgin Islands
  US: [[24.4, 49.4, -125, -66.9], [51, 71.5, -180, -129.9], [51, 55, 172, 180], [18.8, 22.4, -160.4, -154.7], [17.6, 18.6, -68, -64.5]],
};
const inAny = (cc, lat, lon) => BOX[cc].some((b) => inBox(lat, lon, b));
// Switzerland's outline, coarsely (its box also holds bits of France, Germany, Italy and Austria)
const CH_LINE = [[6.0, 46.15], [6.8, 46.0], [7.0, 45.85], [7.9, 45.95], [8.4, 46.45], [8.9, 45.85], [9.05, 45.9], [9.3, 46.5], [10.1, 46.25],
  [10.5, 46.55], [10.45, 46.95], [9.6, 47.05], [9.55, 47.55], [8.6, 47.8], [7.6, 47.6], [7.0, 47.5], [6.1, 46.95], [6.0, 46.15]];
// the US-Canada border south of 49° N, as a latitude by longitude, west to east (a rough line: it orders the sources only,
// their coverage deciding near it); Alaska's border is the 141st meridian, its panhandle left to the coverage too
const BORDER = [[-125, 48.4], [-123.25, 48.25], [-123.1, 48.6], [-123.0, 49.0], [-95.2, 49.0], [-94.6, 48.7], [-93.0, 48.6], [-91.5, 48.1],
  [-89.6, 48.0], [-88.4, 48.3], [-84.8, 46.9], [-84.1, 46.5], [-83.5, 46.0], [-82.4, 45.2], [-82.4, 43.0], [-83.1, 42.3], [-82.5, 41.7],
  [-79.8, 42.5], [-79.0, 43.3], [-76.3, 44.2], [-75.3, 45.0], [-71.5, 45.0], [-71.1, 45.3], [-70.6, 45.6], [-70.0, 46.7], [-69.2, 47.45],
  [-68.2, 47.35], [-67.8, 47.07], [-67.8, 45.7], [-67.4, 45.2], [-67.0, 44.8]];
function inCanada(lat, lon) {
  if (lon < -141) return false;
  if (lat > 49.4 || lon < BORDER[0][0]) return lat > 48.4;
  for (let i = 1; i < BORDER.length; i++) {
    const [x0, y0] = BORDER[i - 1], [x1, y1] = BORDER[i];
    if (lon <= x1) return lat > (x1 === x0 ? Math.max(y0, y1) : y0 + ((y1 - y0) * (lon - x0)) / (x1 - x0));
  }
  return lat > BORDER[BORDER.length - 1][1];
}
function inRing(lat, lon, ring) {
  let c = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > lat) !== (yj > lat) && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}

/**
 * The country whose national data an area is likely in: "CH", "FR", "US", "CA", "NZ" or null — a rough guess by boxes, a
 * coarse outline of Switzerland and a line for the US-Canada border, used to offer a country's layers, never to refuse data.
 */
export function countryAt(lat, lon) {
  if (inAny("CH", lat, lon) && inRing(lat, lon, CH_LINE)) return "CH";
  if (inFrance(lat, lon)) return "FR";
  if (inAny("NZ", lat, lon)) return "NZ";
  const us = inAny("US", lat, lon), ca = inAny("CA", lat, lon);
  if (us && ca) return inCanada(lat, lon) ? "CA" : "US";
  return us ? "US" : ca ? "CA" : null;
}

/** The sources to try, in order, for an area centred at (lat, lon), of "swisstopo", "ign", "linz", "nrcan", "usgs". */
export function sourcesAt(lat, lon) {
  const out = [];
  if (inAny("CH", lat, lon)) out.push("swisstopo");
  if (inFrance(lat, lon)) out.push("ign");
  if (inAny("NZ", lat, lon)) out.push("linz");
  const us = inAny("US", lat, lon), ca = inAny("CA", lat, lon);
  // both: Canada first north of the border (3DEP has 30 m heights over southern Canada; HRDEM nothing south of it)
  if (us && ca) out.push(...(inCanada(lat, lon) ? ["nrcan", "usgs"] : ["usgs", "nrcan"]));
  else if (us) out.push("usgs");
  else if (ca) out.push("nrcan");
  return out;
}

// ---- the libraries, loaded once (classic scripts setting window.GeoTIFF and window.proj4; already there in tests) ----------
let gtP = null, p4P = null;
function script(src, name) {
  return new Promise((res, rej) => {
    if (globalThis[name]) { res(globalThis[name]); return; }
    if (typeof document === "undefined") { rej(new Error(name)); return; }
    const s = document.createElement("script"); s.src = src;
    s.onload = () => (globalThis[name] ? res(globalThis[name]) : rej(new Error(name)));
    s.onerror = () => rej(new Error(name));
    document.head.appendChild(s);
  });
}
const geotiff = () => (gtP ||= script(GEOTIFF, "GeoTIFF").catch((e) => { gtP = null; throw e; }));
const proj4js = () => (p4P ||= script(PROJ4, "proj4").catch((e) => { p4P = null; throw e; }));
/** The points [[lat, lon]…] in a grid (EPSG code): [[X, Y]…]. */
async function project(pts, epsg) {
  const p4 = await proj4js(), f = p4("WGS84", crsDef(epsg));
  return pts.map(([la, lo]) => f.forward([lo, la]));
}
const boxOf = (P) => {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of P) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  return [x0, y0, x1, y1];
};
const llBox = (pts) => boxOf(pts.map(([la, lo]) => [lo, la]));          // [w, s, e, n]
async function fetchOk(url, opts = {}, tries = 3) {
  for (let attempt = 0; ; attempt++) {
    let r = null;
    try { r = await fetch(url, { credentials: "omit", referrerPolicy: "no-referrer", ...opts }); } catch (e) { if (attempt >= tries - 1) throw e; }
    if (r?.ok) return r;
    if (r && (attempt >= tries - 1 || (r.status !== 429 && r.status < 500))) throw new Error(`${new URL(url).host} ${r.status}`);
    await new Promise((ok) => setTimeout(ok, 1500 * (attempt + 1)));
  }
}
async function pool(jobs, fn, n = PAR) {
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(n, jobs.length) }, async () => { while (next < jobs.length) { const k = next++; await fn(jobs[k], k); } }));
}

/**
 * A window of a GeoTIFF / COG (a URL read by HTTP range, or the file's bytes) over the box [x0, y0, x1, y1] in its grid, from
 * the coarsest of its images whose pixel is at most `res` (its overviews): { data, w, h, x0, y0, rx, ry, nodata }, the
 * window's top-left corner at (x0, y0), pixels rx × ry (ry negative). null when the box misses the image.
 */
export async function readWindow(src, box, res = 0) {
  const GT = await geotiff();
  const tif = typeof src === "string" ? await GT.fromUrl(src, { allowFullFile: false }) : await GT.fromArrayBuffer(src);
  const im0 = await tif.getImage(0), W0 = im0.getWidth(), H0 = im0.getHeight();
  const [ox, oy] = im0.getOrigin(), [rx0, ry0] = im0.getResolution();
  let im = im0;
  if (res > Math.abs(rx0) * 1.5) {
    const n = await tif.getImageCount();
    for (let i = 1; i < n; i++) {
      const o = await tif.getImage(i);
      if ((o.fileDirectory.NewSubfileType || 0) & 4) continue;              // a mask, not an overview
      if (Math.abs(rx0) * (W0 / o.getWidth()) <= res * 1.01) im = o; else break;
    }
  }
  const W = im.getWidth(), H = im.getHeight(), rx = rx0 * (W0 / W), ry = ry0 * (H0 / H);
  const c0 = Math.max(0, Math.floor((box[0] - ox) / rx) - 1), c1 = Math.min(W, Math.ceil((box[2] - ox) / rx) + 1);
  const r0 = Math.max(0, Math.floor((box[3] - oy) / ry) - 1), r1 = Math.min(H, Math.ceil((box[1] - oy) / ry) + 1);
  if (c1 <= c0 || r1 <= r0) return null;
  const [data] = await im.readRasters({ window: [c0, r0, c1, r1], samples: [0] });
  return { data, w: c1 - c0, h: r1 - r0, x0: ox + c0 * rx, y0: oy + r0 * ry, rx, ry, nodata: im0.getGDALNoData() ?? null };
}

/**
 * One's own elevation model (owner, 2026-11-16: the Tracer's « Modèle d'altitude »): heights at the points [[lat, lon]…] from a
 * file — a GeoTIFF with its georeference (its EPSG code read from its keys: a projected grid, or degrees), or an ESRI ASCII
 * grid (.asc: ncols, nrows, xllcorner | xllcenter, yll…, cellsize, NODATA_value), whose grid is `epsg` (asked of the user).
 * defOf(code): the grid's proj4 text when this module does not know it (the Tracer's table of EPSG codes). Returns { z (NaN
 * where the file has no height), info: { epsg, res (the file's pixel, in its unit), w, h } }; throws "epsg" when the grid is
 * not known, "format" when the file is neither.
 */
export async function fileHeights(bytes, name, pts, { epsg = 0, defOf = null } = {}) {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const tiff = (u8[0] === 0x49 && u8[1] === 0x49) || (u8[0] === 0x4d && u8[1] === 0x4d);
  let raster = null, code = Number(epsg) || 0;
  if (tiff) {
    const GT = await geotiff();
    const tif = await GT.fromArrayBuffer(u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength)), im = await tif.getImage(0);
    const keys = im.getGeoKeys() || {};
    code = code || Number(keys.ProjectedCSTypeGeoKey) || Number(keys.GeographicTypeGeoKey) || 0;
    if (code === 32767) code = 0;                                         // « user defined »
  } else if (/\.asc$/i.test(name || "") || /^\s*ncols/i.test(new TextDecoder().decode(u8.subarray(0, 40)))) {
    const text = new TextDecoder().decode(u8), head = {}, lines = text.split(/\r?\n/);
    let i = 0;
    for (; i < lines.length; i++) { const m = /^\s*([a-z_]+)\s+(-?[\d.,eE+-]+)\s*$/i.exec(lines[i]); if (!m) break; head[m[1].toLowerCase()] = Number(m[2].replace(",", ".")); }
    const w = head.ncols, h = head.nrows, cs = head.cellsize;
    if (!(w > 1 && h > 1 && cs > 0)) throw new Error("format");
    const data = new Float32Array(w * h);
    let k = 0;
    for (; i < lines.length && k < w * h; i++) for (const tok of lines[i].trim().split(/\s+/)) { if (tok === "") continue; data[k++] = Number(tok.replace(",", ".")); if (k >= w * h) break; }
    const x0 = head.xllcenter != null ? head.xllcenter - cs / 2 : head.xllcorner, yb = head.yllcenter != null ? head.yllcenter - cs / 2 : head.yllcorner;
    raster = { data, w, h, x0, y0: yb + h * cs, rx: cs, ry: -cs, nodata: head.nodata_value ?? null };
  } else throw new Error("format");
  const geographic = code === 4326 || code === 4258 || code === 4269 || code === 4171 || code === 4979;
  let P;
  if (geographic) P = pts.map(([la, lo]) => [lo, la]);
  else {
    const def = (defOf && (await defOf(code))) || crsDef(code);
    if (!def) throw new Error("epsg");
    const p4 = await proj4js(), f = p4("WGS84", def);
    P = pts.map(([la, lo]) => f.forward([lo, la]));
  }
  if (!raster) raster = await readWindow(u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength), boxOf(P), 0);
  const z = new Float32Array(pts.length).fill(NaN);
  if (raster) sampleInto(z, P, [raster]);
  return { z, info: { epsg: code, res: raster ? Math.abs(raster.rx) : 0, w: raster?.w || 0, h: raster?.h || 0 } };
}

/** Heights at the points P [[X, Y]…] of a grid from rasters (readWindow's) in it, bilinear on the pixels' centres. */
function sampleInto(z, P, rasters, onlyHoles = false) {
  const bad = (v, nd) => !Number.isFinite(v) || (nd !== null && v === nd) || v < -1000 || v > 9000;
  P.forEach(([X, Y], i) => {
    if (onlyHoles && !Number.isNaN(z[i])) return;
    for (const r of rasters) {
      const fx = (X - r.x0) / r.rx - 0.5, fy = (Y - r.y0) / r.ry - 0.5;
      if (fx < -0.5 || fy < -0.5 || fx > r.w - 0.5 || fy > r.h - 0.5) continue;
      const x = Math.max(0, Math.min(r.w - 1.0001, fx)), y = Math.max(0, Math.min(r.h - 1.0001, fy));
      const i0 = Math.floor(x), j0 = Math.floor(y), ax = x - i0, ay = y - j0, d = r.data, w = r.w;
      let s = 0, sw = 0;
      for (const [a, b, wt] of [[i0, j0, (1 - ax) * (1 - ay)], [i0 + 1, j0, ax * (1 - ay)], [i0, j0 + 1, (1 - ax) * ay], [i0 + 1, j0 + 1, ax * ay]]) {
        const v = d[b * w + a];
        if (wt > 0 && !bad(v, r.nodata)) { s += v * wt; sw += wt; }
      }
      if (sw >= 0.5) { z[i] = s / sw; break; }
    }
  });
}
const nanShare = (z) => { let n = 0; for (const v of z) if (Number.isNaN(v)) n++; return n / z.length; };

/** swissALTI3D: the 2 m tiles of 1 km (LV95) under the points, each tile's latest year, read whole. null when not Swiss. */
async function fromSwiss(pts, step, onProgress) {
  const P = await project(pts, 2056), [x0, y0, x1, y1] = boxOf(P), want = new Set();
  for (let e = Math.floor(x0 / 1000); e <= Math.floor(x1 / 1000); e++) for (let n = Math.floor(y0 / 1000); n <= Math.floor(y1 / 1000); n++) want.add(`${e}-${n}`);
  if (want.size > CH_MAX_TILES) throw new Error("swisstopo: area too large");
  const best = new Map();                        // tile → { year, href }
  let url = `${CH_STAC}?bbox=${llBox(pts).map((v) => v.toFixed(5)).join(",")}&limit=100`;
  for (let page = 0; url && page < 8; page++) {
    const j = await (await fetchOk(url)).json();
    for (const f of j.features || []) {
      const m = /swissalti3d_(\d{4})_(\d+-\d+)/.exec(f.id || "");
      if (!m || !want.has(m[2])) continue;
      const a = Object.entries(f.assets || {}).find(([k]) => /_2_2056_\d+\.tif$/.test(k));
      if (a && (!best.has(m[2]) || best.get(m[2]).year < +m[1])) best.set(m[2], { year: +m[1], href: a[1].href });
    }
    url = (j.links || []).find((l) => l.rel === "next")?.href || null;
  }
  if (best.size < want.size / 2) return null;
  const rasters = [];
  let done = 0;
  await pool([...best.values()], async ({ href }) => {
    const r = await readWindow(await (await fetchOk(href)).arrayBuffer(), [-Infinity, -Infinity, Infinity, Infinity]);
    if (r) rasters.push(r);
    onProgress?.(++done / best.size);
  });
  const z = new Float32Array(pts.length).fill(NaN);
  sampleInto(z, P, rasters);
  return { z, info: { tiles: best.size, years: [...new Set([...best.values()].map((b) => b.year))].sort() } };
}

/** 3DEP: one float TIFF of the area at the grid's step (its pixel in degrees), asked of USGS's ImageServer. */
async function fromUsgs(pts, step, onProgress) {
  const [lo0, la0, lo1, la1] = llBox(pts), cos = Math.cos((((la0 + la1) / 2) * Math.PI) / 180);
  let px = Math.max(1, step) / 111320;          // the pixel in degrees of latitude
  const side = () => [Math.ceil((lo1 - lo0) / (px / cos)) + 3, Math.ceil((la1 - la0) / px) + 3];
  while (Math.max(...side()) > US_MAX_SIDE) px *= 1.25;
  const [w, h] = side(), dlo = (w * px) / cos, dla = h * px, cx = (lo0 + lo1) / 2, cy = (la0 + la1) / 2;
  const q = new URLSearchParams({ bbox: [cx - dlo / 2, cy - dla / 2, cx + dlo / 2, cy + dla / 2].map((v) => v.toFixed(7)).join(","), bboxSR: "4326",
    imageSR: "4326", size: `${w},${h}`, format: "tiff", pixelType: "F32", noData: "-9999", compression: "LZ77",
    interpolation: "RSP_BilinearInterpolation", f: "image" });
  onProgress?.(0.1);
  const r = await fetchOk(`${US_3DEP}?${q}`);
  if (!/tiff/.test(r.headers.get("content-type") || "")) throw new Error("3DEP: not a TIFF");
  const ras = await readWindow(await r.arrayBuffer(), [-Infinity, -Infinity, Infinity, Infinity]);
  onProgress?.(1);
  const z = new Float32Array(pts.length).fill(NaN);
  if (ras) { ras.nodata = -9999; sampleInto(z, pts.map(([la, lo]) => [lo, la]), [ras]); }
  return { z, info: { size: [w, h], px: Math.round(px * 111320 * 10) / 10 } };
}

/** HRDEM: the LiDAR projects' DTM COGs over the area (Canada's STAC), newest first, each filling what the newer ones lack. */
async function fromCanada(pts, step, onProgress) {
  const bb = llBox(pts).map((v) => v.toFixed(5)).join(",");
  const j = await (await fetchOk(`${CA_STAC}?collections=hrdem-lidar&bbox=${bb}&limit=40`)).json();
  const items = (j.features || []).filter((f) => f.assets?.dtm?.href && crsDef(f.properties?.["proj:epsg"] || 3979))
    .sort((a, b) => String(b.properties?.datetime || "").localeCompare(String(a.properties?.datetime || "")));
  if (!items.length) return null;
  const z = new Float32Array(pts.length).fill(NaN), used = [], byCrs = new Map();
  const tried = items.slice(0, CA_MAX_ITEMS);
  for (let k = 0; k < tried.length; k++) {
    const f = tried[k], epsg = f.properties?.["proj:epsg"] || 3979;
    if (!byCrs.has(epsg)) byCrs.set(epsg, await project(pts, epsg));
    const P = byCrs.get(epsg), left = P.filter((_, i) => Number.isNaN(z[i]));   // the points still without a height
    if (!left.length) break;
    try {
      const r = await readWindow(f.assets.dtm.href, boxOf(left), step);
      if (r) { const before = nanShare(z); sampleInto(z, P, [r], true); if (nanShare(z) < before) used.push(f.id); }
    } catch (e) { console.warn(f.id, e); }
    onProgress?.((k + 1) / tried.length);
    if (nanShare(z) < 0.005) break;
  }
  return used.length ? { z, info: { projects: used } } : null;
}

/** NZ Topo50's sheet holding a point of NZTM (24 × 36 km): { code, box }, or null. */
const TOPO50_ROWS = "ABCDEFGHJKLMNPQRSTUVWXYZ";
export function topo50(E, N) {
  const c = Math.floor((E - 988000) / 24000), r = Math.floor((6810000 - N) / 36000);
  if (c < 1 || c > 99 || r < 0 || r >= 72) return null;
  return { code: `${"ABC"[Math.floor(r / 24)]}${TOPO50_ROWS[r % 24]}${String(c).padStart(2, "0")}`,
    box: [988000 + c * 24000, 6810000 - (r + 1) * 36000, 988000 + (c + 1) * 24000, 6810000 - r * 36000] };
}
/** LINZ's national 1 m DEM: one COG a Topo50 sheet, the sheets under the points read by HTTP range at the grid's step. */
async function fromLinz(pts, step, onProgress) {
  const P = await project(pts, 2193), [x0, y0, x1, y1] = boxOf(P), sheets = new Map();
  for (const [E, N] of [[x0, y0], [x1, y0], [x0, y1], [x1, y1]]) { const s = topo50(E, N); if (s) sheets.set(s.code, s); }
  if (!sheets.size || sheets.size > NZ_MAX_SHEETS) return null;
  const rasters = [];
  let done = 0;
  await pool([...sheets.values()], async (s) => {
    const box = [Math.max(x0, s.box[0]), Math.max(y0, s.box[1]), Math.min(x1, s.box[2]), Math.min(y1, s.box[3])];
    try { const r = await readWindow(`${NZ_DEM}/${s.code}.tiff`, box, step); if (r) rasters.push(r); }
    catch (e) { console.warn(s.code, e); }                     // a sheet at sea or without LiDAR: none
    onProgress?.(++done / sheets.size);
  });
  if (!rasters.length) return null;
  const z = new Float32Array(pts.length).fill(NaN);
  sampleInto(z, P, rasters);
  return { z, info: { sheets: [...sheets.keys()] } };
}
const NATIONAL = { swisstopo: fromSwiss, usgs: fromUsgs, nrcan: fromCanada, linz: fromLinz };
/** A national source's heights at the points [[lat, lon]…]: { z, info } (NaN where it has none), or null when it covers none. */
export async function nationalHeights(source, pts, step = 2, onProgress) { return NATIONAL[source](pts, step, onProgress); }

/** Holes (NaN) filled from their neighbours, repeatedly: a few nodes off IGN's model at a border. */
function fillHoles(z, nx, ny) {
  for (let pass = 0; pass < 50; pass++) {
    let left = 0;
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const k = j * nx + i;
      if (!Number.isNaN(z[k])) continue;
      let s = 0, n = 0;
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const a = i + di, b = j + dj; if (a >= 0 && b >= 0 && a < nx && b < ny && !Number.isNaN(z[b * nx + a])) { s += z[b * nx + a]; n++; } }
      if (n) z[k] = s / n; else left++;
    }
    if (!left) return true;
  }
  return false;
}

/**
 * The grid of heights: { z (Float32Array, row by row from the map's top), nx, ny, step, source ("ign", "swisstopo", "usgs",
 * "nrcan", "linz", "tiles", or one of the first five + "+tiles" when the tiles filled its holes), ms, cached }. node(i, j)
 * gives the node's [lat, lon]; key names the map and its placing (the cache's key).
 */
export async function loadGrid({ key, nx, ny, step, node, onProgress, fresh = false }) {
  const [la, lo] = node((nx - 1) / 2, (ny - 1) / 2);
  const order = sourcesAt(la, lo);
  // grids kept before the national sources (2026-11-06) were the tiles' outside France: a key of their own
  const national = order.some((s) => s !== "ign");
  const ck = `dem:${national ? "v3" : "v2"}:${key}:${nx}x${ny}`;
  const hit = fresh ? null : await cached(ck);
  if (hit?.z?.length === nx * ny) return { ...hit, cached: true, ms: 0 };
  const t0 = performance.now(), pts = [];
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) pts.push(node(i, j));
  let z = null, source = "tiles", info = {};
  for (const s of order) {
    try {
      if (s === "ign") {
        // a probe of 7 × 7 nodes first: a map mostly outside IGN's model (abroad near a border) asks for the tiles at once
        const probe = [];
        for (let b = 0; b < 7; b++) for (let a = 0; a < 7; a++) probe.push(node(Math.round((a / 6) * (nx - 1)), Math.round((b / 6) * (ny - 1))));
        const pz = await fromIgn(probe);
        if (pz.filter((v) => Number.isNaN(v)).length > 24) throw new Error("IGN: outside its model");
        z = await fromIgn(pts, onProgress);
        info = {};
      } else {
        const r = await NATIONAL[s](pts, step, onProgress);
        // a source covering under half the map gives way to the next one (a map across a border, a model not flown there)
        if (!r || nanShare(r.z) > 0.5) { if (r) console.warn(`${s}: covers ${Math.round(100 - 100 * nanShare(r.z))}% of the map`); continue; }
        z = r.z; info = { ...r.info };
      }
      source = s;
      break;
    } catch (e) { console.warn(e); z = null; }
  }
  if (z) {
    // the nodes the source has no height for (Monaco, the sea, across a border: 3 % of a map by Monaco, 2026-10-24) from the tiles
    const holes = [];
    z.forEach((v, k) => { if (Number.isNaN(v)) holes.push(k); });
    if (holes.length) {
      try { const r = await fromTiles(holes.map((k) => pts[k]), step); holes.forEach((k, q) => { z[k] = r.z[q]; }); source = `${source}+tiles`; info.holes = holes.length; }
      catch (e) { console.warn(e); }
      fillHoles(z, nx, ny);
    }
  }
  if (!z) { source = "tiles"; const r = await fromTiles(pts, step, onProgress); z = r.z; info = { zoom: r.zoom, tiles: r.tiles }; if (!fillHoles(z, nx, ny)) throw new Error("dem"); }
  const rec = { z, nx, ny, step, source, ...info, at: Date.now() };
  keep(ck, rec);
  return { ...rec, cached: false, ms: Math.round(performance.now() - t0) };
}

/** The grid's height at map pixel (px, py) of a W × H map, bilinear (the edge's height outside). */
export function heightAt(grid, W, H, px, py) {
  const { z, nx, ny } = grid;
  const x = Math.max(0, Math.min(nx - 1.0001, (px / W) * (nx - 1))), y = Math.max(0, Math.min(ny - 1.0001, (py / H) * (ny - 1)));
  const i = Math.floor(x), j = Math.floor(y), fx = x - i, fy = y - j, k = j * nx + i;
  return (1 - fy) * ((1 - fx) * z[k] + fx * z[k + 1]) + fy * ((1 - fx) * z[k + nx] + fx * z[k + nx + 1]);
}
