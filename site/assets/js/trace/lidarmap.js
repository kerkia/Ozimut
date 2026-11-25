// Generated orienteering maps for « Analyse solo » (a prototype, 2026-11-01; administrators only): a trace without a map
// gets one made from the country's open LiDAR by karttapullautin, with OpenStreetMap's roads, paths, buildings and water over
// it (mapgen/run.py, made on GitHub by lidarmap.yml, kept in R2 as 1 km tiles; functions/api/lidarmap/[[path]].js). The page
// asks for the tiles its trace's area touches — the area only, never the trace —, waits for them, and puts them together
// into one image with its world file and .prj: files the page then takes as if they had been dropped, so that everything
// else (the calibration, the files kept for the visit, « ↗ ») works as for any georeferenced map. The tiles' heights (every
// 2 m) give the 3D view its relief (`lidarGrid`).
//
// The grids (2026-11-06; mapgen/grids.py, keep the two in step): France's IGN tiles, "0391_6819", Lambert 93, named by their
// west and NORTH edges in km; Switzerland's "ch_2583_1219" (LV95, swisstopo's own tiles), New Zealand's "nz_1571_5172"
// (NZTM2000), the United States' "us_13_0475_4427" and Canada's "ca_18_0433_5038" (UTM zone on WGS 84), named by their west and
// SOUTH edges in km. `countryAt` tells which grid a place is in, `tileIdsFor` the tiles round points in a grid. A map put
// together beyond France carries its world file in a transverse Mercator georef.js reads (UTM, NZTM; Switzerland's LV95, an
// oblique Mercator georef.js does not know, as UTM 32 with the small rotation between them, exact to a few centimetres over
// the map), and its name its tiles (`gridOfName`): `lidarGrid` and `creditOf` read the grid from it.

import { elapsed } from "../waitbar.js";
import { t as tr, tn } from "../i18n.js";
import { LAMBERT93, projector } from "./georef.js";

export const PX = 0.4233333333333334;      // a tile's pixel, m: karttapullautin's 600 dpi at 1:10 000
const SIZE = 2362, DEM_STEP = 2, DEM_N = 500;
export const MAX_TILES = 12;
const MAX_PIXELS = 30e6;                    // the image put together: beyond, every second pixel
const API = "/api/lidarmap";
export const PREFIX = "ozimut-lidar-";
export const isGenerated = (name) => typeof name === "string" && name.startsWith(PREFIX);
/** The credit of France's point clouds (kept for the pages that show it; `creditOf` gives any country's). */
export const CREDIT_LIDAR = { text: "IGN – LiDAR HD®", url: "https://geoservices.ign.fr/lidarhd" };
/** Each country's point clouds in a word, for the progress shown while they are read (mapgen/grids.py SOURCES). */
export const SOURCE_SHORT = { fr: "IGN", ch: "swisstopo", us: "USGS 3DEP", ca: "NRCan", nz: "LINZ" };
/** Each country's point clouds, to be credited wherever a generated map or its relief shows (mapgen/grids.py SOURCES). */
export const CREDITS = {
  fr: { text: "IGN – LiDAR HD® (Licence Ouverte 2.0)", url: CREDIT_LIDAR.url },
  ch: { text: "© swisstopo – swissSURFACE3D", url: "https://www.swisstopo.admin.ch/en/height-model-swisssurface3d" },
  us: { text: "USGS – 3D Elevation Program", url: "https://www.usgs.gov/3d-elevation-program" },
  ca: { text: "NRCan – CanElevation (OGL-Canada 2.0)", url: "https://open.canada.ca/data/en/dataset/7069387e-9986-4297-9f55-0288e9676947" },
  nz: { text: "LINZ (CC BY 4.0), via OpenTopography", url: "https://www.linz.govt.nz/products-services/data/types-linz-data/elevation-data" },
};

const PRJ = 'PROJCS["RGF93_Lambert_93",GEOGCS["GCS_RGF_1993",DATUM["D_RGF_1993",SPHEROID["GRS_1980",6378137.0,298.257222101]],'
  + 'PRIMEM["Greenwich",0.0],UNIT["Degree",0.0174532925199433]],PROJECTION["Lambert_Conformal_Conic"],PARAMETER["False_Easting",700000.0],'
  + 'PARAMETER["False_Northing",6600000.0],PARAMETER["Central_Meridian",3.0],PARAMETER["Standard_Parallel_1",49.0],'
  + 'PARAMETER["Standard_Parallel_2",44.0],PARAMETER["Latitude_Of_Origin",46.5],UNIT["Meter",1.0]]';
/** A transverse Mercator .prj (ESRI's WKT, as pyproj writes it) that georef.js crsFromWkt reads. */
const tmPrj = (name, geog, tm) => `PROJCS["${name}",${geog},PROJECTION["Transverse_Mercator"],PARAMETER["False_Easting",${tm.fe.toFixed(1)}],`
  + `PARAMETER["False_Northing",${tm.fn.toFixed(1)}],PARAMETER["Central_Meridian",${tm.lon0.toFixed(1)}],PARAMETER["Scale_Factor",${tm.k0}],`
  + 'PARAMETER["Latitude_Of_Origin",0.0],UNIT["Meter",1.0]]';
const GEOG_WGS84 = 'GEOGCS["GCS_WGS_1984",DATUM["D_WGS_1984",SPHEROID["WGS_1984",6378137.0,298.257223563]],PRIMEM["Greenwich",0.0],UNIT["Degree",0.0174532925199433]]';
const GEOG_NZGD = 'GEOGCS["GCS_NZGD_2000",DATUM["D_NZGD_2000",SPHEROID["GRS_1980",6378137.0,298.257222101]],PRIMEM["Greenwich",0.0],UNIT["Degree",0.0174532925199433]]';

// ---- Lambert 93, forward (georef.js inverts it) ---------------------------------------------------------------------------
const A = 6378137, F = 1 / 298.257222101, E2 = F * (2 - F), E = Math.sqrt(E2), rad = (d) => (d * Math.PI) / 180;
const mOf = (p) => Math.cos(p) / Math.sqrt(1 - E2 * Math.sin(p) ** 2);
const tOf = (p) => Math.tan(Math.PI / 4 - p / 2) / Math.pow((1 - E * Math.sin(p)) / (1 + E * Math.sin(p)), E / 2);
const L = LAMBERT93, P1 = rad(L.lat1), P2 = rad(L.lat2);
const N = Math.log(mOf(P1) / mOf(P2)) / Math.log(tOf(P1) / tOf(P2)), FC = mOf(P1) / (N * Math.pow(tOf(P1), N)), RHO0 = A * FC * Math.pow(tOf(rad(L.lat0)), N);
/** [lat, lon] in degrees -> [X, Y], Lambert 93 metres. */
export function toLambert93(lat, lon) {
  const rho = A * FC * Math.pow(tOf(rad(lat)), N), th = N * rad(lon - L.lon0);
  return [L.fe + rho * Math.sin(th), L.fn + RHO0 - rho * Math.cos(th)];
}

// ---- transverse Mercator, forward (Snyder; georef.js projector inverts it), on WGS 84 / GRS80 -------------------------------
function tmForward(tm) {
  const e2 = E2, ep2 = e2 / (1 - e2), k0 = tm.k0;
  const arc = (p) => A * ((1 - e2 / 4 - (3 * e2 ** 2) / 64 - (5 * e2 ** 3) / 256) * p - ((3 * e2) / 8 + (3 * e2 ** 2) / 32 + (45 * e2 ** 3) / 1024) * Math.sin(2 * p)
    + ((15 * e2 ** 2) / 256 + (45 * e2 ** 3) / 1024) * Math.sin(4 * p) - ((35 * e2 ** 3) / 3072) * Math.sin(6 * p));
  return (lat, lon) => {
    const p = rad(lat), s = Math.sin(p), c = Math.cos(p), t = Math.tan(p);
    const Nn = A / Math.sqrt(1 - e2 * s * s), T = t * t, C = ep2 * c * c, Aa = c * rad(lon - tm.lon0);
    const x = k0 * Nn * (Aa + ((1 - T + C) * Aa ** 3) / 6 + ((5 - 18 * T + T * T + 72 * C - 58 * ep2) * Aa ** 5) / 120);
    const y = k0 * (arc(p) + Nn * t * ((Aa * Aa) / 2 + ((5 - T + 9 * C + 4 * C * C) * Aa ** 4) / 24 + ((61 - 58 * T + T * T + 600 * C - 330 * ep2) * Aa ** 6) / 720));
    return [tm.fe + x, tm.fn + y];
  };
}

// ---- Switzerland's LV95 (swisstopo's approximate formulas, ~1 m: enough to choose tiles and to place a map) ---------------
function toLV95(lat, lon) {
  const p = (lat * 3600 - 169028.66) / 10000, l = (lon * 3600 - 26782.5) / 10000;
  return [2600072.37 + 211455.93 * l - 10938.51 * l * p - 0.36 * l * p * p - 44.54 * l ** 3,
    1200147.07 + 308807.95 * p + 3745.25 * l * l + 76.63 * p * p - 194.56 * l * l * p + 119.79 * p ** 3];
}
/** LV95 → [lat, lon]: swisstopo's approximate inverse, then refined so that it inverts toLV95 exactly (the two approximate
 * formulas disagree by up to 2 m; a map and its heights must go there and back the same way). */
function fromLV95(X, Y) {
  const y = (X - 2600000) / 1e6, x = (Y - 1200000) / 1e6;
  const l = 2.6779094 + 4.728982 * y + 0.791484 * y * x + 0.1306 * y * x * x - 0.0436 * y ** 3;
  const p = 16.9023892 + 3.238272 * x - 0.270978 * y * y - 0.002528 * x * x - 0.0447 * y * y * x - 0.014 * x ** 3;
  let lat = (p * 100) / 36, lon = (l * 100) / 36;
  for (let k = 0; k < 3; k++) {
    const [E0, N0] = toLV95(lat, lon), h = 1e-5, [E1, N1] = toLV95(lat + h, lon), [E2, N2] = toLV95(lat, lon + h);
    const a11 = (E1 - E0) / h, a12 = (E2 - E0) / h, a21 = (N1 - N0) / h, a22 = (N2 - N0) / h, det = a11 * a22 - a12 * a21;
    const dE = X - E0, dN = Y - N0;
    lat += (a22 * dE - a12 * dN) / det;
    lon += (a11 * dN - a21 * dE) / det;
  }
  return [lat, lon];
}

const utmTm = (zone) => ({ kind: "tm", lon0: zone * 6 - 183, k0: 0.9996, lat0: 0, fe: 500000, fn: 0, name: `UTM ${zone}` });
const NZTM = { kind: "tm", lon0: 173, k0: 0.9996, lat0: 0, fe: 1600000, fn: 10000000, name: "NZTM2000" };
const utmZone = (lon) => Math.max(1, Math.min(60, Math.floor((lon + 180) / 6) + 1));
const pad4 = (n) => String(n).padStart(4, "0");

/**
 * A grid: { country, zone, epsg, fwd(lat, lon) → [X, Y], inv(X, Y) → [lat, lon], idAt(X, Y) the tile holding a point,
 * corner(id) → [x0, y1] its north-west corner, file: { prj, wf(world file in the grid) → the world file written } }.
 */
export function gridOf(country = "fr", zone = null) {
  if (country === "fr") {
    const inv = projector(LAMBERT93);
    return { country, zone: null, epsg: 2154, fwd: toLambert93, inv, prj: PRJ,
      idAt: (X, Y) => `${pad4(Math.floor(X / 1000))}_${pad4(Math.ceil(Y / 1000))}`,
      corner: (id) => { const [x, y] = id.split("_").map(Number); return [x * 1000, y * 1000]; }, fileWf: (wf) => wf };
  }
  const sw = (id) => { const p = id.split("_"), x = +p[p.length - 2], y = +p[p.length - 1]; return [x * 1000, y * 1000 + 1000]; };
  const pre = country === "us" || country === "ca" ? `${country}_${zone}_` : `${country}_`;
  const idAt = (X, Y) => `${pre}${pad4(Math.floor(X / 1000))}_${pad4(Math.floor(Y / 1000))}`;
  if (country === "ch") {
    // the map's world file in UTM 32 (georef.js has no oblique Mercator): the affine LV95 → UTM fitted on the map's corners
    const utm = utmTm(32), toUtm = tmForward(utm);
    const fileWf = (wf, W, H) => wfThrough(wf, W, H, (X, Y) => toUtm(...fromLV95(X, Y)));
    return { country, zone: null, epsg: 2056, fwd: toLV95, inv: fromLV95, prj: tmPrj("WGS_1984_UTM_Zone_32N", GEOG_WGS84, utm), idAt, corner: sw, fileWf };
  }
  if (country === "nz") return { country, zone: null, epsg: 2193, fwd: tmForward(NZTM), inv: projector(NZTM),
    prj: tmPrj("NZGD_2000_New_Zealand_Transverse_Mercator", GEOG_NZGD, NZTM), idAt, corner: sw, fileWf: (wf) => wf };
  const tm = utmTm(zone);
  return { country, zone, epsg: 32600 + zone, fwd: tmForward(tm), inv: projector(tm),
    prj: tmPrj(`WGS_1984_UTM_Zone_${zone}N`, GEOG_WGS84, tm), idAt, corner: sw, fileWf: (wf) => wf };
}
/** The world file of an image W × H whose world file wf is in one system, in another (to(X, Y) → [X', Y']): the affine
 * fitted by least squares on the image's corners, middles and centre. */
function wfThrough(wf, W, H, to) {
  const [a, d, b, e, c, f] = wf, cw = (W - 1) / 2, ch = (H - 1) / 2, rows = [], xs = [], ys = [];
  for (const u of [0, 0.5, 1]) for (const v of [0, 0.5, 1]) {
    const col = u * (W - 1), row = v * (H - 1), [X, Y] = to(a * col + b * row + c, d * col + e * row + f);
    rows.push([col - cw, row - ch, 1]); xs.push(X); ys.push(Y);
  }
  const solve = (t) => {            // least squares by the normal equations (3 × 3), the pixels centred on the image
    const M = [[0, 0, 0], [0, 0, 0], [0, 0, 0]], r = [0, 0, 0];
    rows.forEach((q, i) => { for (let j = 0; j < 3; j++) { r[j] += q[j] * t[i]; for (let k = 0; k < 3; k++) M[j][k] += q[j] * q[k]; } });
    for (let i = 0; i < 3; i++) for (let j = i + 1; j < 3; j++) {
      const m = M[j][i] / M[i][i];
      for (let k = i; k < 3; k++) M[j][k] -= m * M[i][k];
      r[j] -= m * r[i];
    }
    const x = [0, 0, 0];
    for (let i = 2; i >= 0; i--) { let s = r[i]; for (let k = i + 1; k < 3; k++) s -= M[i][k] * x[k]; x[i] = s / M[i][i]; }
    return x;
  };
  const [A1, B1, C1] = solve(xs), [D1, E1, F1] = solve(ys);
  return [A1, D1, B1, E1, C1 - A1 * cw - B1 * ch, F1 - D1 * cw - E1 * ch];
}

// ---- which grid a place is in ------------------------------------------------------------------------------------------------
// Switzerland's and the contiguous United States' borders, simplified (mapgen/grids.py borders, from site/assets/geo): rings of
// lon, lat pairs
const BORDERS = {"ch":[[10.454,46.864,10.445,46.823,10.417,46.799,10.429,46.756,10.4,46.736,10.394,46.701,10.369,46.672,10.396,46.639,10.459,46.624,10.466,46.578,10.444,46.538,10.295,46.551,10.235,46.575,10.234,46.618,10.192,46.627,10.088,46.604,10.071,46.564,10.033,46.533,10.028,46.484,10.044,46.467,10.026,46.446,10.141,46.403,10.092,46.338,10.105,46.309,10.159,46.262,10.118,46.231,10.043,46.221,10.032,46.26,9.978,46.298,9.964,46.356,9.918,46.371,9.855,46.367,9.768,46.339,9.72,46.351,9.708,46.312,9.674,46.292,9.537,46.299,9.503,46.321,9.483,46.357,9.444,46.375,9.435,46.498,9.385,46.466,9.331,46.502,9.263,46.485,9.238,46.437,9.261,46.417,9.275,46.331,9.225,46.231,9.181,46.204,9.163,46.172,9.091,46.138,9.072,46.119,9.059,46.062,9.002,46.039,9.016,45.993,8.98,45.964,9.011,45.927,9.052,45.916,9.063,45.899,9.034,45.848,9.002,45.821,8.94,45.835,8.9,45.826,8.912,45.883,8.871,45.947,8.768,45.983,8.834,46.066,8.809,46.09,8.747,46.094,8.724,46.109,8.678,46.096,8.602,46.123,8.51,46.208,8.438,46.235,8.423,46.276,8.446,46.412,8.428,46.449,8.399,46.452,8.316,46.434,8.287,46.405,8.297,46.388,8.281,46.37,8.242,46.354,8.193,46.309,8.087,46.272,8.073,46.254,8.13,46.196,8.132,46.159,8.111,46.127,8.025,46.091,8.011,46.03,7.986,45.999,7.898,45.982,7.873,45.959,7.87,45.94,7.85,45.94,7.831,45.914,7.706,45.926,7.643,45.966,7.541,45.984,7.504,45.957,7.362,45.908,7.287,45.913,7.154,45.877,7.067,45.89,7.015,45.933,6.988,45.993,6.915,46.049,6.851,46.05,6.849,46.085,6.869,46.112,6.774,46.135,6.766,46.152,6.775,46.186,6.828,46.27,6.75,46.346,6.782,46.379,6.787,46.414,6.763,46.429,6.614,46.456,6.483,46.449,6.398,46.408,6.302,46.395,6.214,46.316,6.238,46.268,6.276,46.263,6.281,46.24,6.108,46.139,6.028,46.148,5.959,46.13,5.983,46.171,5.955,46.2,5.958,46.212,6.043,46.243,6.09,46.246,6.101,46.301,6.136,46.359,6.108,46.397,6.054,46.419,6.068,46.434,6.064,46.471,6.146,46.552,6.118,46.584,6.266,46.68,6.429,46.761,6.433,46.786,6.417,46.802,6.447,46.858,6.428,46.909,6.443,46.944,6.599,46.986,6.665,47.021,6.688,47.044,6.676,47.062,6.69,47.078,6.746,47.104,6.745,47.121,6.775,47.128,6.888,47.211,6.956,47.245,6.959,47.291,7.037,47.33,7.044,47.34,7.004,47.368,6.867,47.354,6.884,47.383,6.925,47.406,6.926,47.425,6.991,47.452,6.973,47.489,7.01,47.499,7.181,47.488,7.163,47.46,7.168,47.444,7.238,47.417,7.406,47.438,7.429,47.465,7.414,47.49,7.467,47.482,7.484,47.493,7.477,47.515,7.501,47.517,7.505,47.533,7.483,47.542,7.55,47.575,7.637,47.595,7.66,47.597,7.646,47.572,7.61,47.565,7.683,47.544,7.767,47.556,7.82,47.595,7.898,47.588,7.912,47.561,8.042,47.561,8.087,47.567,8.179,47.616,8.233,47.622,8.289,47.616,8.306,47.592,8.354,47.581,8.449,47.584,8.462,47.606,8.522,47.622,8.561,47.589,8.581,47.6,8.58,47.639,8.602,47.633,8.607,47.656,8.568,47.663,8.458,47.64,8.391,47.666,8.392,47.7,8.438,47.723,8.464,47.764,8.552,47.779,8.542,47.795,8.558,47.801,8.602,47.795,8.617,47.757,8.644,47.791,8.682,47.759,8.713,47.757,8.72,47.747,8.7,47.724,8.717,47.695,8.77,47.695,8.762,47.701,8.771,47.721,8.798,47.72,8.856,47.691,8.838,47.681,8.882,47.656,8.945,47.654,9.017,47.679,9.183,47.67,9.197,47.656,9.273,47.65,9.547,47.535,9.585,47.481,9.65,47.452,9.64,47.395,9.601,47.361,9.587,47.328,9.505,47.244,9.487,47.21,9.485,47.176,9.512,47.108,9.477,47.064,9.561,47.052,9.669,47.056,9.858,47.016,9.856,47.004,9.871,46.999,9.862,46.94,9.875,46.927,10.111,46.847,10.201,46.867,10.235,46.923,10.296,46.923,10.314,46.964,10.379,46.995,10.459,46.937]],"us":[[-122.75,48.99,-95.18,48.99,-95.16,49.37,-94.84,49.31,-94.59,48.73,-93.88,48.64,-93.76,48.52,-92.98,48.62,-92.65,48.54,-92.72,48.46,-92.49,48.43,-92.37,48.22,-92.07,48.35,-91.58,48.05,-90.87,48.23,-90.75,48.08,-90.12,48.12,-89.92,47.99,-89.36,47.98,-88.38,48.3,-84.88,46.9,-84.57,46.46,-84.11,46.53,-83.97,46.06,-83.61,46.12,-83.46,46.01,-83.64,45.77,-82.55,45.34,-82.15,43.58,-82.53,42.62,-83.08,42.3,-83.16,42.05,-83.07,41.85,-82.67,41.67,-82.42,41.68,-81.28,42.21,-80.25,42.37,-79.02,42.8,-78.91,42.93,-79.17,43.47,-78.75,43.62,-76.84,43.63,-76.33,44.18,-74.9,45.01,-71.5,45.01,-71.33,45.29,-70.99,45.35,-70.89,45.23,-70.26,45.92,-70.28,46.21,-70.01,46.7,-69.24,47.46,-69.07,47.43,-68.91,47.19,-68.3,47.37,-67.81,47.08,-67.81,45.71,-67.43,45.6,-67.47,45.27,-67.18,45.18,-67.04,44.97,-67.2,44.91,-66.98,44.82,-67.2,44.64,-67.55,44.64,-67.6,44.53,-67.83,44.58,-68.06,44.33,-68.2,44.52,-68.41,44.41,-68.48,44.49,-68.54,44.24,-68.82,44.31,-68.7,44.41,-68.82,44.4,-68.8,44.56,-69.19,43.95,-69.36,44.06,-69.55,43.84,-69.53,44.02,-69.59,43.81,-69.63,44.03,-69.76,43.76,-69.78,44.06,-69.83,43.7,-69.87,43.87,-70.03,43.74,-70.0,43.86,-70.29,43.65,-70.2,43.56,-70.73,43.12,-70.86,42.83,-70.6,42.63,-71.05,42.32,-70.74,42.24,-70.59,42.02,-70.72,42.0,-70.33,41.72,-70.0,41.82,-70.1,42.04,-70.25,42.06,-70.08,42.06,-69.94,41.67,-70.66,41.52,-70.71,41.75,-71.19,41.47,-71.11,41.8,-71.26,41.65,-71.39,41.82,-71.5,41.37,-72.91,41.3,-73.89,40.8,-73.98,41.29,-73.92,40.93,-74.28,40.5,-73.98,40.45,-74.09,39.78,-74.12,40.0,-74.41,39.36,-74.64,39.31,-74.95,38.93,-74.91,39.18,-75.15,39.19,-75.56,39.61,-75.02,40.02,-75.59,39.65,-75.39,39.06,-75.08,38.8,-75.06,38.63,-75.14,38.69,-75.21,38.57,-75.06,38.61,-75.05,38.42,-75.08,38.34,-75.06,38.46,-75.18,38.41,-75.1,38.32,-75.95,37.12,-75.94,37.58,-75.63,37.96,-75.88,37.95,-75.74,38.11,-75.94,38.13,-75.84,38.4,-76.04,38.23,-76.32,38.47,-76.17,38.57,-76.28,38.62,-75.97,38.61,-76.29,38.78,-76.34,38.67,-76.31,38.82,-76.17,38.76,-76.11,38.88,-76.25,38.95,-76.38,38.84,-76.31,39.03,-76.2,38.98,-76.06,39.15,-76.24,39.03,-76.17,39.32,-75.84,39.37,-76.03,39.39,-75.83,39.58,-76.0,39.45,-75.94,39.6,-76.08,39.56,-76.21,39.37,-76.23,39.48,-76.28,39.31,-76.4,39.39,-76.45,39.2,-76.62,39.26,-76.39,39.02,-76.57,39.04,-76.38,38.38,-76.45,38.32,-76.64,38.47,-76.68,38.68,-76.67,38.49,-76.37,38.3,-76.32,38.04,-76.46,38.21,-76.52,38.13,-76.8,38.25,-76.88,38.4,-76.92,38.29,-77.03,38.48,-77.25,38.39,-77.01,38.7,-77.07,38.9,-77.05,38.72,-77.23,38.66,-77.34,38.35,-77.04,38.4,-76.95,38.21,-76.61,38.15,-76.25,37.9,-76.31,37.64,-76.5,37.66,-77.13,38.17,-76.55,37.63,-76.28,37.57,-76.39,37.53,-76.27,37.52,-76.26,37.34,-76.42,37.44,-76.37,37.29,-76.5,37.25,-76.8,37.5,-76.27,37.07,-76.42,36.97,-76.86,37.32,-76.93,37.24,-77.27,37.32,-76.67,37.19,-76.52,36.86,-76.0,36.93,-75.52,35.79,-75.95,36.72,-75.9,36.5,-76.05,36.59,-76.04,36.5,-75.79,36.08,-75.96,36.31,-75.91,36.16,-76.2,36.32,-76.06,36.16,-76.29,36.21,-76.22,36.1,-76.46,36.21,-76.31,36.1,-76.58,36.01,-76.73,36.32,-76.73,35.95,-76.05,35.98,-76.04,35.7,-76.14,35.7,-76.04,35.65,-75.85,35.98,-75.72,35.83,-75.78,35.58,-75.89,35.64,-76.15,35.35,-76.37,35.34,-76.42,35.47,-76.5,35.39,-76.58,35.5,-76.46,35.54,-76.65,35.52,-76.6,35.4,-77.05,35.53,-76.47,35.27,-76.76,34.99,-77.08,35.16,-76.94,34.98,-76.54,34.93,-76.45,35.07,-76.46,34.94,-76.27,34.97,-76.35,34.88,-76.51,34.73,-76.62,34.82,-76.63,34.71,-76.69,34.8,-77.09,34.68,-77.13,34.76,-77.34,34.56,-77.44,34.75,-77.38,34.53,-77.73,34.32,-77.94,33.93,-77.96,34.19,-78.02,33.9,-78.38,33.95,-78.76,33.78,-79.18,33.22,-79.19,33.44,-79.28,33.36,-79.18,33.18,-79.39,33.02,-79.58,33.01,-79.83,32.76,-79.94,32.85,-79.89,32.69,-80.27,32.62,-80.32,32.49,-80.67,32.52,-80.48,32.48,-80.55,32.35,-80.43,32.41,-80.55,32.28,-80.86,32.54,-80.68,32.22,-80.82,32.11,-80.79,32.24,-80.96,31.88,-81.12,31.91,-81.11,31.74,-81.27,31.77,-81.33,31.35,-81.49,31.37,-81.27,31.26,-81.39,31.14,-81.45,31.21,-81.53,30.85,-81.29,29.89,-80.53,28.47,-80.45,27.87,-80.62,28.21,-80.6,28.6,-80.77,28.61,-80.85,28.79,-80.83,28.66,-80.04,26.81,-80.13,25.77,-80.14,25.9,-80.31,25.62,-80.4,25.19,-80.57,25.25,-81.1,25.12,-81.13,25.34,-80.92,25.25,-81.14,25.39,-81.35,25.82,-81.73,25.92,-81.86,26.45,-82.01,26.48,-81.78,26.71,-82.04,26.53,-82.1,26.91,-81.98,27.0,-82.16,26.93,-82.27,27.02,-82.15,26.8,-82.31,26.85,-82.73,27.52,-82.59,27.5,-82.42,27.92,-82.53,27.82,-82.69,28.04,-82.72,27.93,-82.56,27.89,-82.65,27.7,-82.81,27.83,-82.72,27.66,-82.84,27.83,-82.63,28.89,-82.8,29.18,-83.04,29.18,-83.68,29.92,-84.21,30.11,-84.47,29.99,-84.38,29.89,-85.35,29.68,-85.36,29.89,-85.68,30.13,-85.39,30.06,-85.72,30.2,-85.59,30.33,-85.85,30.27,-85.72,30.13,-86.51,30.41,-86.12,30.38,-86.21,30.5,-87.19,30.36,-86.89,30.44,-87.03,30.61,-87.08,30.45,-87.18,30.59,-87.33,30.32,-87.53,30.28,-87.35,30.43,-87.43,30.48,-87.59,30.27,-88.03,30.22,-87.76,30.28,-88.03,30.74,-88.14,30.32,-88.93,30.44,-89.33,30.38,-89.6,30.16,-90.19,30.39,-90.41,30.22,-90.41,30.11,-90.17,30.02,-89.67,30.16,-89.84,30.01,-89.67,29.88,-89.49,30.08,-89.37,30.05,-89.34,29.79,-89.6,29.73,-89.48,29.63,-89.7,29.71,-89.62,29.63,-89.76,29.63,-89.54,29.4,-89.2,29.35,-89.01,29.18,-89.13,29.0,-89.25,29.11,-89.41,28.93,-89.28,29.16,-89.38,29.09,-89.45,29.25,-89.82,29.32,-89.82,29.47,-90.18,29.58,-90.02,29.3,-90.23,29.09,-90.43,29.36,-90.6,29.31,-90.64,29.14,-90.88,29.13,-91.33,29.3,-91.22,29.38,-91.11,29.27,-91.23,29.61,-91.3,29.48,-91.56,29.54,-91.64,29.74,-91.86,29.72,-91.85,29.83,-92.2,29.76,-92.03,29.63,-92.31,29.53,-93.2,29.77,-93.83,29.7,-93.85,29.99,-93.88,29.68,-94.76,29.37,-94.49,29.57,-94.78,29.53,-94.73,29.78,-94.92,29.66,-95.05,29.75,-94.82,29.37,-95.17,29.21,-95.16,29.05,-96.22,28.49,-95.99,28.64,-96.23,28.59,-96.19,28.69,-96.35,28.64,-96.44,28.76,-96.37,28.63,-96.49,28.58,-96.65,28.73,-96.55,28.47,-96.4,28.43,-96.65,28.32,-96.79,28.48,-96.88,28.15,-96.91,28.26,-96.97,28.13,-97.17,28.16,-97.15,28.01,-97.02,28.1,-97.18,27.84,-97.52,27.87,-97.26,27.7,-97.41,27.34,-97.54,27.29,-97.49,27.4,-97.63,27.3,-97.77,27.47,-97.76,27.28,-97.43,27.26,-97.56,26.84,-97.26,26.0,-97.15,26.07,-97.14,25.98,-97.37,25.84,-97.66,26.03,-98.22,26.07,-99.11,26.42,-99.46,27.06,-99.52,27.59,-100.28,28.28,-100.67,29.12,-101.41,29.78,-102.32,29.89,-102.69,29.74,-102.86,29.23,-103.12,29.0,-103.39,29.03,-104.52,29.65,-104.93,30.61,-106.21,31.48,-106.39,31.75,-108.22,31.78,-108.22,31.33,-111.07,31.33,-114.82,32.5,-114.72,32.71,-117.12,32.53,-117.51,33.34,-118.12,33.74,-118.41,33.74,-118.51,34.02,-119.13,34.1,-119.56,34.41,-120.45,34.44,-120.64,34.56,-120.64,35.14,-120.88,35.22,-120.89,35.43,-121.29,35.66,-121.9,36.3,-121.98,36.58,-121.76,36.72,-121.8,36.84,-122.34,37.12,-122.52,37.53,-122.41,37.81,-122.37,37.6,-122.03,37.46,-122.37,38.01,-121.69,38.01,-121.61,38.1,-121.44,38.0,-121.6,38.11,-121.78,38.04,-121.68,38.15,-122.13,38.04,-122.4,38.15,-122.53,37.82,-122.92,38.06,-123.03,37.99,-123.0,38.24,-122.83,38.1,-123.73,38.92,-123.85,39.83,-124.36,40.26,-124.41,40.44,-124.09,40.83,-124.23,40.77,-124.07,41.54,-124.26,41.78,-124.2,41.97,-124.57,42.83,-124.4,43.31,-124.14,43.38,-124.21,43.45,-124.33,43.37,-124.07,43.71,-124.2,43.68,-123.87,45.7,-124.02,46.23,-123.8,46.1,-123.86,46.19,-123.54,46.23,-123.18,46.18,-123.69,46.3,-124.08,46.27,-124.06,46.66,-123.96,46.38,-123.84,46.42,-123.96,46.62,-123.76,46.68,-124.09,46.74,-124.13,46.9,-124.02,46.83,-123.81,46.96,-124.12,47.04,-124.18,46.93,-124.73,48.39,-123.97,48.17,-123.11,48.18,-122.87,47.99,-122.77,48.14,-122.62,47.88,-122.8,47.68,-122.86,47.83,-123.16,47.36,-122.84,47.43,-123.11,47.41,-122.57,47.82,-122.61,47.95,-122.53,47.91,-122.47,47.76,-122.66,47.73,-122.59,47.58,-122.7,47.62,-122.51,47.52,-122.57,47.26,-122.63,47.41,-122.77,47.17,-122.81,47.4,-123.08,47.13,-122.72,47.09,-122.54,47.32,-122.33,47.36,-122.4,47.8,-122.19,48.03,-122.38,48.21,-122.47,48.18,-122.35,48.05,-122.51,48.15,-122.39,48.3,-122.68,48.43,-122.63,48.52,-122.49,48.45,-122.57,48.59,-122.44,48.58,-122.51,48.76,-122.67,48.73],[-132.7,54.7,-133.15,54.95,-133.17,55.24],[-130.96,55.59,-131.19,55.19,-131.31,55.24,-131.21,55.41,-131.3,55.28,-131.46,55.29,-131.27,55.45,-131.35,55.65,-131.32,55.45,-131.46,55.33,-131.51,55.5,-131.53,55.3,-131.82,55.46,-131.52,55.73,-131.71,55.74,-131.48,55.78,-131.69,55.83,-131.28,55.97],[-133.61,56.08,-133.28,56.15,-133.31,56.0,-133.7,55.9,-133.79,55.94],[-132.55,56.3,-132.4,56.35,-132.48,56.2,-132.09,56.11,-132.2,56.09,-132.13,55.93,-132.65,56.06,-132.7,56.22],[-131.98,54.83,-132.0,54.69,-132.28,54.72,-132.38,55.02,-132.44,54.92,-132.59,54.97,-132.47,55.05,-132.61,55.06,-132.64,55.26,-132.7,55.15,-132.8,55.27,-133.21,55.28,-133.21,55.38,-132.85,55.35,-133.13,55.48,-132.91,55.63,-133.38,55.63,-133.14,55.88,-133.26,56.15,-133.57,56.19,-133.62,56.35,-133.18,56.33,-133.08,56.06,-132.51,55.83,-132.44,55.63,-132.14,55.47,-132.52,55.62,-132.68,55.45,-132.28,55.45,-132.48,55.41,-132.16,55.37,-132.09,55.27,-132.24,55.2,-131.99,55.27,-132.0,55.1,-132.22,54.99,-131.96,55.03],[-132.61,56.4,-132.82,56.24,-133.06,56.34,-132.92,56.45],[-132.0,56.34,-131.93,56.2,-132.07,56.12,-132.34,56.26,-132.38,56.49],[-132.96,56.79,-132.53,56.58,-132.92,56.51],[-133.88,56.49,-133.95,56.09,-134.05,56.32,-134.19,56.18,-134.1,56.01,-134.22,56.08,-134.16,56.31,-134.28,56.36,-134.18,56.44,-134.05,56.37,-134.03,56.48,-134.31,56.56,-134.09,56.65,-134.4,56.73,-134.39,56.87,-134.11,56.85,-134.26,56.94,-133.94,56.81,-133.99,56.64,-133.86,56.81,-133.72,56.77,-133.74,56.57,-133.92,56.62],[-133.91,57.08,-133.26,56.92,-133.3,57.01,-133.05,56.98,-132.94,56.63,-133.35,56.84,-133.08,56.53,-133.62,56.44,-133.68,56.85,-134.02,57.02],[-134.62,56.74,-134.63,56.26,-134.67,56.17,-134.76,56.22,-135.05,56.54,-134.85,56.69,-135.11,56.6,-135.0,56.76,-135.19,56.68,-135.12,56.83,-135.37,56.83,-135.16,57.04,-135.38,57.09,-135.33,57.25,-135.67,57.35,-135.47,57.35,-135.61,57.39,-135.51,57.52,-135.33,57.54,-135.41,57.45,-135.18,57.48,-134.91,57.34],[-152.16,57.63,-152.36,57.43,-152.97,57.52,-153.04,57.43,-152.8,57.47,-152.6,57.37,-152.66,57.3,-153.18,57.35,-152.96,57.26,-153.54,57.18,-153.5,57.07,-153.76,57.05,-153.56,56.99,-153.99,56.74,-154.13,56.79,-153.74,57.13,-154.1,56.97,-153.96,57.12,-154.5,57.11,-154.1,57.11,-154.31,56.86,-154.53,56.99,-154.6,57.26,-154.8,57.29,-154.63,57.51,-154.22,57.68,-154.02,57.65,-154.11,57.55,-153.63,57.27,-153.85,57.56,-153.68,57.55,-153.88,57.65,-153.59,57.62,-153.93,57.81,-153.66,57.9,-153.51,57.63,-153.5,57.76,-153.32,57.73,-153.45,57.85,-153.18,57.71,-153.24,57.9,-153.05,57.83,-153.28,58.01,-152.81,57.91,-152.89,57.73,-152.82,57.86,-152.49,57.91,-152.33,57.83,-152.55,57.7],[-135.85,57.39,-136.07,57.61,-135.95,57.62,-136.42,57.83,-136.31,58.0,-136.03,57.85,-136.41,58.08,-136.27,58.11,-136.36,58.22,-136.1,58.06,-136.14,58.22,-135.55,58.2,-135.52,58.1,-135.78,58.04,-135.66,57.95,-135.39,58.14,-134.93,58.03,-134.92,57.85,-135.2,57.94,-135.01,57.79,-135.89,58.0,-135.36,57.73,-134.91,57.76,-134.81,57.5,-135.06,57.47,-135.81,57.76,-135.55,57.47],[-134.35,57.09,-134.62,57.01,-134.63,57.22,-134.46,57.31,-134.56,57.4,-134.31,57.39,-134.57,57.49,-134.35,57.55,-134.65,57.6,-134.73,58.18,-134.78,58.11,-134.91,58.2,-134.95,58.41,-134.69,58.17,-134.18,58.16,-133.79,57.59,-134.31,58.1,-134.29,57.84,-133.84,57.46,-134.07,57.51,-133.87,57.35,-134.18,57.39,-134.09,57.26],[-151.97,58.33,-152.12,58.15,-152.28,58.26,-152.27,58.13,-152.55,58.09,-152.58,58.21,-152.81,57.99,-153.23,58.17,-152.91,58.17,-153.11,58.27,-152.77,58.26,-152.88,58.41,-152.65,58.48,-152.42,58.32,-152.35,58.42,-152.12,58.4,-152.14,58.23],[-147.11,60.29,-146.92,60.31,-147.49,59.86,-147.91,59.79,-147.2,60.24,-147.19,60.36,-147.01,60.35],[-146.19,60.4,-146.6,60.24,-146.68,60.29,-146.49,60.36,-146.72,60.39,-146.59,60.48],[-71.92,41.06,-73.58,40.58,-74.04,40.62,-73.49,40.95,-72.63,40.98,-72.28,41.16,-72.62,40.91]]};
const inRing = (lon, lat, r) => {
  let c = false;
  for (let i = 0, j = r.length - 2; i < r.length; j = i, i += 2) {
    const x1 = r[i], y1 = r[i + 1], x2 = r[j], y2 = r[j + 1];
    if ((y1 > lat) !== (y2 > lat) && lon < x1 + ((lat - y1) * (x2 - x1)) / (y2 - y1)) c = !c;
  }
  return c;
};
const inBorder = (cc, lat, lon) => BORDERS[cc].some((r) => inRing(lon, lat, r));
/** The country whose LiDAR a place can have a generated map from: "fr" | "ch" | "us" | "ca" | "nz", or null. */
export function countryAt(lat, lon) {
  if (lat > 45.7 && lat < 47.95 && lon > 5.9 && lon < 10.65 && inBorder("ch", lat, lon)) return "ch";
  if (lat >= 41.2 && lat <= 51.2 && lon >= -5.5 && lon <= 9.8) return "fr";              // IGN's LiDAR HD: France and Corsica
  if (lat > 24 && lat < 50 && lon > -125 && lon < -66 && inBorder("us", lat, lon)) return "us";
  if ((lat > 51 && lat < 72 && lon < -141 && lon > -180) || (lat > 18.5 && lat < 22.5 && lon > -160.5 && lon < -154.5)) return "us";   // Alaska, Hawaii
  if (lat > 41.6 && lat < 84 && lon > -141.1 && lon < -52) return "ca";
  if (lat > -48 && lat < -34 && lon > 165.5 && lon < 179) return "nz";
  return null;
}
/** Where a generated map can be made. */
export const covered = (lat, lon) => countryAt(lat, lon) !== null;

/** The tiles a box (X0, Y0, X1, Y1, in the grid's metres) touches, north to south: { box, ids, km2, grid }. */
function boxArea(grid, X0, Y0, X1, Y1) {
  const ids = [];
  for (let ky = Math.floor(Y1 / 1000); ky >= Math.floor(Y0 / 1000); ky--) {
    if (ky * 1000 >= Y1 || (ky + 1) * 1000 <= Y0) continue;
    for (let kx = Math.floor(X0 / 1000); kx < Math.ceil(X1 / 1000); kx++) ids.push(grid.idAt(kx * 1000 + 1, ky * 1000 + 1));
  }
  return { box: [X0, Y0, X1, Y1], ids, km2: ((X1 - X0) * (Y1 - Y0)) / 1e6, grid, country: grid.country, zone: grid.zone, epsg: grid.epsg };
}
/**
 * The tiles round points [[lat, lon]…] with a margin (m), in a country's grid (UTM: the points' middle zone unless given):
 * { box, ids, km2, grid, country, zone, epsg }. mapgen/grids.py ids_for computes the same ids.
 */
export function tileIdsFor(country, pts, margin = 150, zone = null) {
  if ((country === "us" || country === "ca") && zone == null) zone = utmZone(pts.reduce((s, p) => s + p[1], 0) / pts.length);
  const grid = gridOf(country, zone);
  let X0 = Infinity, Y0 = Infinity, X1 = -Infinity, Y1 = -Infinity;
  for (const [la, lo] of pts) {
    const [x, y] = grid.fwd(la, lo);
    X0 = Math.min(X0, x); Y0 = Math.min(Y0, y); X1 = Math.max(X1, x); Y1 = Math.max(Y1, y);
  }
  return boxArea(grid, X0 - margin, Y0 - margin, X1 + margin, Y1 + margin);
}
const middle = (pts) => [pts.reduce((s, p) => s + p[0], 0) / pts.length, pts.reduce((s, p) => s + p[1], 0) / pts.length];
/** The area a trace needs: its extent with a margin, in the grid of the country it lies in (France when none). */
export function areaOf(track, margin = 150) {
  const pts = [];
  const step = Math.max(1, Math.floor(track.n / 4000));
  for (let i = 0; i < track.n; i += step) pts.push([track.lat0 - track.y[i] / track.ky, track.lon0 + track.x[i] / track.kx]);
  return tileIdsFor(countryAt(...middle(pts)) || "fr", pts, margin);
}
/** The area round points [[lat, lon]…] with a margin (m), in a country's grid ("fr" unless given: Cartographier's vectors
 * are placed in Lambert 93; "auto" for the country the points lie in). */
export function areaOfPoints(pts, margin = 150, country = "fr") {
  return tileIdsFor(country === "auto" ? countryAt(...middle(pts)) || "fr" : country, pts, margin);
}
/** The area w × h metres centred on [lat, lon], in the grid of the country it lies in (France when none). */
export function areaAround(lat, lon, w, h) {
  const cc = countryAt(lat, lon) || "fr", g = gridOf(cc, cc === "us" || cc === "ca" ? utmZone(lon) : null);
  const [x, y] = g.fwd(lat, lon);
  return boxArea(g, x - w / 2, y - h / 2, x + w / 2, y + h / 2);
}
/** The grid of a generated map from its file name (its tiles' ids, ozimut-lidar-[sprint-]<id>[-<id>]), France's else. */
export function gridOfName(name) {
  const m = /^ozimut-lidar-(?:sprint-)?(?:(us|ca)_(\d{1,2})_|(ch|nz)_)?\d{4}_\d{4}/.exec(name || "");
  if (!m) return gridOf("fr");
  return m[1] ? gridOf(m[1], +m[2]) : m[3] ? gridOf(m[3]) : gridOf("fr");
}
/** The credit of a generated map's point clouds, from its file name: { text, url }. */
export const creditOf = (name) => CREDITS[gridOfName(name).country] || CREDIT_LIDAR;

async function call(url, opts) {
  const r = await fetch(url, { credentials: "same-origin", ...opts });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) { const e = new Error(body.error || `http ${r.status}`); e.status = r.status; e.data = body; throw e; }
  return body;
}
/** The tiles' state in a style ("forest" | "sprint"), the missing ones asked for: { req?, tiles: { id: "ready" | "none" | "queued" }, started? }.
 *  opts: { interval (m, INTERVALS: the style's default when left out), helpers (the helper contours wanted too) }. */
export const ask = (ids, style = "forest", opts = {}) => call(API, { method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ tiles: ids, style, ...(opts.interval != null ? { interval: opts.interval } : {}), ...(opts.helpers ? { helpers: true } : {}) }) });
/** A request's state: { status: "queued" | "done" | "failed", result: { id: "done" | "none" | "error…" } }. */
export const poll = (req) => call(`${API}?req=${encodeURIComponent(req)}`);

const tileUrl = (id, ext) => `${API}/t/${id}${ext}`;
// each style's contour intervals, its default first (owner, 2026-11-12: ISSprOM 2 or 2.5 m, ISOM 2.5 or 5 m; mapgen/run.py
// INTERVALS), and a variant's version, as the server's (functions/api/lidarmap VARIANT_V): in its tiles' address, so that a
// browser does not keep a tile of the version before (they are cached a week)
export const INTERVALS = { sprint: [2.5, 2], forest: [5, 2.5] };
export const VARIANT_V = { forest: 1, "forest-25": 1, sprint: 3, "sprint-20": 1 };
const STYLE_V = { forest: VARIANT_V.forest, sprint: VARIANT_V.sprint };
/** A style at a contour interval: "forest", "forest-25", "sprint", "sprint-20" (the style's own name at its default). */
export const variantOf = (style, interval) => (interval == null || +interval === INTERVALS[style][0] ? style : `${style}-${Math.round(+interval * 10)}`);
/** The helper contours' interval under contours of `interval` m (mapgen/run.py help_interval). */
export const helpInterval = (interval) => (interval >= 5 ? 1 : 0.5);
async function bitmap(url) {
  const r = await fetch(url, { credentials: "same-origin" });
  if (!r.ok) throw new Error(`tile ${r.status}`);
  return createImageBitmap(await r.blob(), { colorSpaceConversion: "none", premultiplyAlpha: "none" });
}

/**
 * The tiles put together over the area's box, in a style: { files, wf, W, H, px, grid } — the map image (PNG) with its world
 * file and .prj, as File objects named ozimut-lidar-[sprint-]<first tile>…, for a page to take as dropped files; wf the world
 * file's six numbers in the grid's system (Lambert 93, LV95, UTM, NZTM; the file written for Switzerland is in UTM 32, see
 * the head). onProgress(f) from 0 to 1.
 */
export async function compose(area, ids, style = "forest", onProgress) {
  const grid = area.grid || gridOf("fr");
  const [X0, Y0, X1, Y1] = area.box;
  // the image's pixel grid is the tiles' own (X = k × PX from a tile corner), every second pixel past MAX_PIXELS
  const k = (X1 - X0) * (Y1 - Y0) / (PX * PX) > MAX_PIXELS ? 2 : 1, px = PX * k;
  const ox = Math.floor(X0 / 1000) * 1000, oy = Math.ceil(Y1 / 1000) * 1000;           // a tile corner: the grid's origin
  const c0 = Math.floor((X0 - ox) / px), r0 = Math.floor((oy - Y1) / px);
  const W = Math.ceil((X1 - ox) / px) - c0, H = Math.ceil((oy - Y0) / px) - r0;
  const cv = document.createElement("canvas"); cv.width = W; cv.height = H;
  const g = cv.getContext("2d");
  g.fillStyle = "#fff"; g.fillRect(0, 0, W, H);
  g.imageSmoothingEnabled = k > 1;
  let done = 0;
  for (const id of ids) {
    const [x0, y1] = grid.corner(id);
    const dx = Math.round((x0 - ox) / px) - c0, dy = Math.round((oy - y1) / px) - r0, s = SIZE / k;
    if (dx + s > 0 && dy + s > 0 && dx < W && dy < H) {
      try { g.drawImage(await bitmap(`${tileUrl(id, style === "sprint" ? ".s.png" : ".png")}?v=${STYLE_V[style]}`), dx, dy, s, s); } catch (e) { console.warn(id, e); }
    }
    onProgress?.(++done / ids.length);
  }
  northLines(g, style, ox + c0 * px, px, W, H);
  const blob = await new Promise((res) => cv.toBlob(res, "image/png"));
  // the world file: the first pixel's centre
  const wf = [px, 0, 0, -px, ox + (c0 + 0.5) * px, oy - (r0 + 0.5) * px];
  const fileWf = grid.fileWf(wf, W, H);
  const base = `${PREFIX}${style === "sprint" ? "sprint-" : ""}${ids[0]}${ids.length > 1 ? `-${ids[ids.length - 1]}` : ""}`;
  const files = [new File([blob], `${base}.png`, { type: "image/png" }), new File([fileWf.map(String).join("\n")], `${base}.pgw`, { type: "text/plain" }),
    new File([grid.prj], `${base}.prj`, { type: "text/plain" })];
  composed.set(fileWf.join(","), grid);
  return { files, wf: fileWf, gridWf: wf, W, H, px, grid, credit: CREDITS[grid.country] };
}
/**
 * The magnetic north lines (ISOM 601.1 / ISSprOM 601.1, owner 2026-11-11: a map turned to the leg needs them), drawn when the
 * tiles are put together, so that every map has them, its tiles made before included: blue, 30 mm apart at the forest style's
 * 1:10 000 (300 m), 20 mm at the sprint style's 1:4000 (80 m), 0.27 mm wide (0.18 mm at 1:15 000 enlarged × 1.5) and 0.18 mm;
 * on the grid's round values, so that two maps of one area agree; parallel to the grid's north, as Virtually's maps (no
 * declination model here: the grid's north stands for the magnetic one, a few degrees apart). x0 the image's left edge in the
 * grid (m), px its pixel (m).
 */
function northLines(g, style, x0, px, W, H) {
  const sprint = style === "sprint", step = sprint ? 80 : 300, mPerMm = sprint ? 4 : 10;
  g.save();
  g.strokeStyle = "rgb(0, 152, 220)";
  g.lineWidth = Math.max(2, ((sprint ? 0.18 : 0.27) * mPerMm) / px);
  g.beginPath();
  for (let gx = Math.ceil(x0 / step) * step; gx <= x0 + W * px; gx += step) {
    const x = Math.round((gx - x0) / px);                           // on a pixel's edge: a sharp line
    g.moveTo(x, 0); g.lineTo(x, H);
  }
  g.stroke();
  g.restore();
}
/** The grids of the maps put together in this visit, by their world file (lidarGrid's way when it is given no name). */
const composed = new Map();

/**
 * The wait for a request (ask()'s answer r) shown to the user (owner, 2026-11-01, then 2026-11-07: « a progress bar with
 * relevant information »): say(key, vars, frac) every 2 s with the catalogue key of what happens and its figures — while it
 * waits unstarted, the requests before it (an.gen.ahead), else the making (an.gen.queued); while the workflow makes it
 * (mapgen/run.py Progress, read every 10 s), the stage with the country's source, the tiles done of the tiles, the part of a
 * run over several grids — and vars.t, the time waited (« m:ss »); frac the share done × share (null while unknown: the bar
 * then shows an hourglass). Resolves { tiles: { id: "ready" | "none" | "failed" } } or null when stop() is true.
 */
export async function waitFor(r, tiles, say, stop = () => false, share = 1) {
  if (!r.req) return { tiles };
  const n = Object.values(tiles).filter((v) => v === "queued").length, t0 = performance.now();
  let p = null, lastPoll = performance.now();
  const show = () => {
    const t = elapsed((performance.now() - t0) / 1000), g = p?.progress;
    if (g?.stage) {
      const part = g.part ? ` · ${tr("an.gen.part", { i: g.part[0], k: g.part[1] })}` : "";
      // OpenStreetMap's Overpass can take minutes or fail and be tried again: said as such, the bar crawling meanwhile
      const key = g.stage === "osm" && g.try > 1 ? "osmRetry" : g.stage === "osm" && g.s > 120 ? "osmSlow" : g.stage;
      say(`an.gen.stage.${key}`, { n, t, part, src: SOURCE_SHORT[g.country] || "", tiles: tn("an.gen.tiles", g.tiles || n), done: g.done ?? 0,
        total: g.total ?? n, try: g.try || 1, server: g.server || "", st: elapsed(g.s || 0) }, share * (g.frac || 0));
    } else if (p?.ahead) say("an.gen.behind", { t, ahead: tn("an.gen.ahead", p.ahead) }, null);
    // before the run reports anything (GitHub starting a runner, the runner installing): part of the map's making, said as such —
    // never « waiting for a server » (owner, 2026-11-12: of no interest to the user); other users' requests ahead are said above
    else say("an.gen.queued", { n, t }, null);
  };
  show();
  for (;;) {
    await new Promise((res) => setTimeout(res, 2000));
    if (stop()) return null;
    if (performance.now() - lastPoll >= 10000) {
      lastPoll = performance.now();
      p = await poll(r.req).catch(() => p);
      if (p && p.status !== "queued") break;
    }
    show();
  }
  for (const [id, v] of Object.entries(p.result || {})) tiles[id] = v === "done" ? "ready" : v === "none" ? "none" : "failed";
  return { tiles };
}

/**
 * The whole way to a map, for the pages: the tiles asked for, waited for (waitFor: 92 % of the bar) and put together (the
 * rest, an.gen.composing). stop() true gives up (another request or a page left). Resolves { ...compose(), partial } or null
 * when stopped; throws Error("none") when there is no open LiDAR anywhere in the area, Error("failed") when no tile could be
 * made.
 */
export async function make(area, style, say, stop = () => false) {
  say("an.gen.asking", {}, null);
  const r = await ask(area.ids, style);
  const w = await waitFor(r, { ...r.tiles }, say, stop, 0.92);
  if (!w) return null;
  const tiles = w.tiles;
  const ready = area.ids.filter((id) => tiles[id] === "ready");
  if (!ready.length) throw new Error(Object.values(tiles).every((v) => v === "none") ? "none" : "failed");
  say("an.gen.composing", { p: 0 }, 0.92);
  const out = await compose(area, ready, style, (f) => say("an.gen.composing", { p: Math.round(100 * f) }, 0.92 + 0.08 * f));
  return stop() ? null : { ...out, partial: ready.length < area.ids.length };
}

/**
 * The 3D view's grid of heights over a generated map (W × H pixels, its world file wf as written with it), from the tiles'
 * heights every 2 m: the shape loadGrid (terrain.js) gives. name: the map's file name, which says its grid (without it, the
 * grid of the map put together in this visit with that world file, else France's; Switzerland's maps carry a UTM world
 * file, brought back to LV95 here). Nodes outside every tile take the nearest height.
 */
export async function lidarGrid({ wf, W, H, nx, ny, step, name }) {
  const t0 = performance.now();
  const grid = name ? gridOfName(name) : composed.get(wf.map(Number).join(",")) || gridOf("fr");
  const [a, , , e, c, f] = wf.map(Number), b = Number(wf[2]), d = Number(wf[1]);
  // a map pixel → the grid's metres (through lat/lon when the world file is in another system: Switzerland's UTM 32)
  const toGrid = grid.country === "ch" ? (() => { const inv = projector(utmTm(32)); return (X, Y) => toLV95(...inv(X, Y)); })() : (X, Y) => [X, Y];
  const at0 = (px, py) => toGrid(a * (px - 0.5) + b * (py - 0.5) + c, d * (px - 0.5) + e * (py - 0.5) + f);
  const corners = [at0(0, 0), at0(W, 0), at0(0, H), at0(W, H)];
  const xs = [Math.min(...corners.map((p) => p[0])), Math.max(...corners.map((p) => p[0]))];
  const ys = [Math.min(...corners.map((p) => p[1])), Math.max(...corners.map((p) => p[1]))];
  const ids = boxArea(grid, xs[0], ys[0], xs[1], ys[1]).ids;
  const dems = new Map();
  const cv = document.createElement("canvas"); cv.width = cv.height = DEM_N;
  const g = cv.getContext("2d", { willReadFrequently: true });
  for (const id of ids) {
    try {
      const bmp = await bitmap(tileUrl(id, ".dem.png"));
      g.clearRect(0, 0, DEM_N, DEM_N); g.drawImage(bmp, 0, 0);
      const px = g.getImageData(0, 0, DEM_N, DEM_N).data, z = new Float32Array(DEM_N * DEM_N);
      for (let i = 0; i < z.length; i++) z[i] = px[4 * i] * 256 + px[4 * i + 1] + px[4 * i + 2] / 256 - 32768;
      dems.set(id, z);
    } catch (err) { console.warn(id, err); }
  }
  if (!dems.size) throw new Error("dem");
  const at = (x, y) => {
    const id = grid.idAt(x, y), z = dems.get(id);
    if (!z) return NaN;
    const [x0, y1] = grid.corner(id);
    const u = Math.min(DEM_N - 1.001, (x - x0) / DEM_STEP), v = Math.min(DEM_N - 1.001, (y1 - y) / DEM_STEP);
    const i = Math.floor(u), j = Math.floor(v), fx = u - i, fy = v - j, q = j * DEM_N + i;
    return (1 - fy) * ((1 - fx) * z[q] + fx * z[q + 1]) + fy * ((1 - fx) * z[q + DEM_N] + fx * z[q + DEM_N + 1]);
  };
  const z = new Float32Array(nx * ny);
  let last = NaN;
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const v = at(...at0((i / (nx - 1)) * W, (j / (ny - 1)) * H));
    z[j * nx + i] = Number.isFinite(v) ? (last = v) : last;
  }
  if (z.some((v) => !Number.isFinite(v))) { const m = z.find(Number.isFinite) ?? 0; z.forEach((v, q) => { if (!Number.isFinite(v)) z[q] = m; }); }
  return { z, nx, ny, step, source: "lidar", credit: CREDITS[grid.country], cached: false, ms: Math.round(performance.now() - t0) };
}
