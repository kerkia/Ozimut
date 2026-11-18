// Route choices computed on a map image (a prototype, administrators only; 2026-10-24, the reading and the search redone on
// 2026-11-01): the fastest ways between two controls, the distinct choices among them, each with its length, climb and an
// estimated time, and the time lost going through any point. Pure functions, run in a worker (trace/routeworker.js), steered by
// trace/routeplan.js.
//
// 1. The map read by colour (`classify`). The paper is made white first (`flatten`: a photo's paper is grey, unevenly lit, and
//    was read as bare rock all over), then each pixel is an area (white forest, open land, rough open, the three greens, out of
//    bounds) or an ink (purple overprint, black, grey, brown, blue). The magnetic north lines — long straight lines, parallel,
//    evenly spaced — are taken out (`northLines`). Inks are lines drawn over an area, so they are split by thickness: an
//    opening by a square some 7-10 m across (`THICK`, in metres: the map's own line width, measured, was a pixel on photos
//    and scans, so that every path came out a « thick » area); what survives is an area of its own (black: a building or a big
//    cliff, grey: a building in sprint or bare rock, brown: a paved area, blue: water). The thin black lines become a network
//    (`lineNetwork`): each piece's ends and direction from its skeleton, the dashes of a dashed path joined end to end across
//    their gaps when they face each other, a chain 30 m long a path — a track (solid and wide, or long wide dashes), a path, or
//    a small path (short dashes) —; dots, triangles and isolated short lines are none. Blue thin lines are streams and marshes;
//    the rest (contours, the course, text, dots) is painted over with the nearest area. The organisers' purple overprint
//    printed over a coloured area comes out red on paper (`overprint`): its hatched areas are out of bounds, its bands of
//    crosses along a road forbidden routes (crossed, not followed); near the course's own controls (their circles and numbers
//    over yellow are as red) it is released, within 75 m (`releaseAround`).
// 2. Cells of about 1.5 m: each the most frequent area of its pixels, the fastest path kind, a share of blue lines (`cells`).
// 3. A cost per cell from the settings (`costs`): the time multiplier of its terrain against white runnable forest, blocked
//    when impassable, and a navigation weight — off the handrails (paths, streams, vegetation and open-land edges, water's
//    banks), deep in the forest, a careful runner slows down; the « prudence » setting scales it.
// 4. Two complete shortest-path trees over an ellipse around the leg, one grown from the start and one from the control
//    (`legSearch`); their sum at a cell is the cost of the best route through it. The choices: the best route, then the long
//    stretches both trees agree on (« plateaus »: a track followed for long is one) and the separate valleys of that sum
//    across the leg (« cuts »: where do the good routes cross it?), each kept when distinct from those kept and locally
//    optimal; each pulled tight off the grid's 16 directions (`tighten`). The sum, against the best, is the decision map.
// 6. A tour through many controls (the Tracer's « Tournée des postes », 2026-11-07): the costs from each control to its nearest
//    ones by a Dijkstra stopped once they are reached (`costsFrom`), the best route of each leg alone (`bestPath`), the setter's
//    out-of-bounds areas and boundaries closed on the cells (`forbidCells`).
// Documented in content/guide.*.js « routes ».

export const A = { WHITE: 0, OPEN: 1, ROUGH: 2, G1: 3, G2: 4, G3: 5, WATER: 6, SHALLOW: 7, PAVED: 8, OOB: 9, BUILDING: 10, GREY: 11, MARSH: 12 };
export const N_CLASSES = 13;
const UNKNOWN = 255;
// pixel kinds: the areas are their class; the inks above them; a north line's pixel taken out
const I_PURPLE = 20, I_BLACK = 21, I_GREY = 22, I_BROWN = 23, I_BLUE = 24, I_OLIVE = 25, I_ERASED = 26, I_MIXED = 27;
export const INK = { PURPLE: I_PURPLE, BLACK: I_BLACK, GREY: I_GREY, BROWN: I_BROWN, BLUE: I_BLUE, OLIVE: I_OLIVE };
/** The path layer's kinds; BRIDGE marks the pixels drawn across a dashed path's gaps. */
export const PATH = { SMALL: 1, PATH: 2, TRACK: 3, BRIDGE: 4 };
/** A sprint map's distances against a forest map's (1:4 000 against 1:10 000): the overprint's tests, the course's release. */
export const SPRINT_SCALE = 0.4;
/** The half width of the thickness test, metres: an ink wider than about twice this is an area. */
export const THICK = { forest: 3.5, sprint: 2 };

/** The default settings: speeds in % of white runnable forest's, the climb's cost in flat metres per metre up. */
export const DEFAULTS = {
  map: "forest",            // "forest" | "sprint"
  black: "auto",            // what thin black lines are: "auto" (paths in forest, obstacles in sprint), "paths", "neutral", "obstacles"
  risk: 20,                 // navigation caution, 0-100 %
  climb: 8,                 // 1 m climbed costs as many metres on the flat
  variants: 3,              // routes shown per leg, 1-4
  extra: 25,                // a variant is kept up to this % slower than the best
  pace: 0,                  // seconds per km in white runnable forest on the flat; 0 = automatic
  calib: true,              // the speeds on paths and the climb's cost calibrated on the runners' own legs (routeplan.calibrate)
  relief: "contours",       // the heights: "contours" (the map's contour lines, levelled on the model) or "dem" (the model only)
  interval: 5,              // the map's contour interval, metres
  cross: 10,                // seconds to get over a passable line of an OCAD map (earth bank, passable cliff, wall, fence), at CROSS_PACE
  // in % of white forest; slow1-3: an OCAD map's stony or sandy ground (slow running, walk, fight), over what grows there
  speeds: { track: 130, path: 125, small: 110, open: 110, rough: 100, g1: 75, g2: 45, g3: 20, marsh: 65, paved: 120, grey: 80, shallow: 30, slow1: 70, slow2: 40, slow3: 15 },
};
/** The pace (s/m of white forest on the flat, 6:00 min/km) at which a crossing takes `cross` seconds: the model's times are in
 *  metres of white forest, a runner's pace scales them all, the crossings with them. */
export const CROSS_PACE = 0.36;

// ---- 1. pixels ---------------------------------------------------------------------------------------------------------
/** A colour's kind: an area (A.*) or an ink (INK.*). ol: the image's olive and yellow (oliveModel()'s, for a photo or a scan;
 *  null: a map's own colours, every dark yellow-green olive). */
export function kindOf(r, g, b, ol = null) {
  const max = r > g ? (r > b ? r : b) : (g > b ? g : b), min = r < g ? (r < b ? r : b) : (g < b ? g : b), span = max - min;
  // the course's purple, as trace/course.js reads it (the dark plum of a photo included)
  if (max >= 40 && g === min && span) {
    const hue = max === r ? 360 - (60 * (b - g)) / span : max === b ? 240 + (60 * (r - g)) / span : 0;
    if (hue >= 255 && hue <= 345 && ((max >= 60 && span >= 0.3 * max) || (max <= 150 && r - g >= 12 && b - g >= 6 && r - g >= 0.2 * max))) return I_PURPLE;
  }
  if (max < 95 && span < 60) return I_BLACK;
  if (span < 24) return min > 220 ? A.WHITE : max < 95 ? I_BLACK : I_GREY;
  let hue = max === r ? 60 * ((g - b) / span) : max === g ? 60 * ((b - r) / span + 2) : 60 * ((r - g) / span + 4);
  if (hue < 0) hue += 360;
  if (hue >= 170 && hue < 260) return I_BLUE;
  if (hue >= 70 && hue < 170) {                        // the greens by their depth: the lighter red and blue, the lighter green
    const t = (255 - (r + b) / 2) / 255;
    return t < 0.12 ? A.WHITE : t < 0.36 ? A.G1 : t < 0.52 ? A.G2 : A.G3;
  }
  if (hue >= 36 && hue < 70) {
    // olive green (out of bounds: an area once thick): a dark colour of the olive's hue on that image (oliveModel's from); a darker one of
    // a lower hue is a blend — olive against a street's pink, the course's purple over olive — which its neighbours decide
    // (I_MIXED, an ink no area claims: as olive it narrowed every street and lane by a cell each side, 2026-11-17). A photo lights
    // one part of the map and not another, so a lit olive is told from yellow by its hue, 50-60° where yellow's is 38-46° (the
    // Auray sprint photo: olive 52-55° up to 214 bright, read as open land; the Fougères photo's white balance puts its olive at
    // 42-44°, dark: the hue decides only among the brighter pixels); the brightest stay yellow whatever their hue (lemon yellow)
    // When the image shows both olive and yellow, a coloured pixel is the one whose colour it is nearer — hue weighing a 4° step
    // as much as 40 of brightness (2026-11-18: the Quiberon photo's lit olive, 53° and 231 bright once the paper is levelled,
    // was read as open land by the rule below, and its routes ran through the gardens).
    if (span > 50 && span >= 0.45 * max && ol?.oh) {      // strong colours only: a pale lit street has olive's hue too
      const dO = ((hue - ol.oh) / 4) ** 2 + ((max - ol.om) / 40) ** 2, dY = ((hue - ol.yh) / 4) ** 2 + ((max - ol.ym) / 40) ** 2;
      if (dO < dY) return max < 200 && hue < ol.oh - 6 ? I_MIXED : I_OLIVE;
      if (max >= 200) { const y = (max - b) / max; return y > 0.55 ? A.OPEN : y > 0.15 ? A.ROUGH : A.WHITE; }
      return I_MIXED;
    }
    if (span > 50 && (max < 200 ? hue >= (ol?.from || 0) : max < 225 && hue >= 50)) return I_OLIVE;
    if (max >= 200) { const y = (max - b) / max; return y > 0.55 ? A.OPEN : y > 0.15 ? A.ROUGH : A.WHITE; }
    return span > 50 ? I_MIXED : I_GREY;
  }
  if (hue < 36) return min > 215 ? A.WHITE : I_BROWN;
  return I_PURPLE;                                       // pinks and violets the test above missed: the overprint's edges
}

/**
 * The image's olive and yellow: { from } — 6° under the peak of the dark, coloured pixels of 36-70° (olive's, wherever the white
 * balance put it: 52° on the Auray photo, 43° on the Fougères one, 51° on the Gif scan; 0, every one, when too few) — and, when
 * the coloured pixels of 30-72° fall in two groups, a darker one (olive, under 205 bright) and a brighter one 40 above it
 * (yellow), their centres { oh, om, yh, ym } (hue, brightness; 2-means, a 6° step of hue weighing as 30 of brightness). The three
 * Morbihan photos: yellow 39-41° 235, olive 51-52° 156-164; Fougères 41° 212 and 47° 135; the Gif scan 47° 244 and 50° 171;
 * Purple Pen's SampleEvent one group only (no olive).
 */
function oliveModel(rgba, w, h) {
  const hist = new Float64Array(72), step = Math.max(1, Math.floor(Math.sqrt((w * h) / 400000)));
  const H = [], M = [];
  let n = 0, all = 0;
  for (let y = 0; y < h; y += step) for (let x = 0; x < w; x += step) {
    const p = 4 * (y * w + x), r = rgba[p], g = rgba[p + 1], b = rgba[p + 2];
    all++;
    const max = Math.max(r, g, b), min = Math.min(r, g, b), span = max - min;
    if (span <= 50 || b === max) continue;
    const hue = max === r ? 60 * ((g - b) / span) : 60 * ((b - r) / span + 2);
    if (hue >= 30 && hue < 72) { H.push(hue); M.push(max); }
    if (max >= 200) continue;
    if (hue >= 36 && hue < 70) { hist[Math.floor(hue)]++; n++; }
  }
  const out = { from: 0 };
  if (n >= 0.005 * all) {
    let best = 0, peak = 0;
    for (let k = 38; k < 68; k++) { const v = hist[k - 2] + hist[k - 1] + hist[k] + hist[k + 1] + hist[k + 2]; if (v > best) { best = v; peak = k; } }
    out.from = Math.max(36, peak - 6);
  }
  if (H.length < 0.01 * all) return out;
  let c = [[45, 240, 0], [55, 170, 0]];
  for (let it = 0; it < 30; it++) {
    const s = [[0, 0, 0], [0, 0, 0]];
    for (let i = 0; i < H.length; i++) {
      const d0 = ((H[i] - c[0][0]) / 6) ** 2 + ((M[i] - c[0][1]) / 30) ** 2, d1 = ((H[i] - c[1][0]) / 6) ** 2 + ((M[i] - c[1][1]) / 30) ** 2, k = d0 <= d1 ? 0 : 1;
      s[k][0] += H[i]; s[k][1] += M[i]; s[k][2]++;
    }
    c = s.map((q, k) => (q[2] ? [q[0] / q[2], q[1] / q[2], q[2]] : c[k]));
  }
  const [y, o] = c[0][1] >= c[1][1] ? c : [c[1], c[0]];
  if (o[1] < 205 && y[1] - o[1] >= 40 && o[2] >= 0.1 * H.length && y[2] >= 0.1 * H.length) Object.assign(out, { oh: o[0], om: o[1], yh: y[0], ym: y[1] });
  return out;
}

/**
 * The paper made white: a photo's paper is grey, warmer or colder, darker in a corner. Its colour is the median of the
 * brightest nearly grey pixels; in blocks of ~50 m, its level per channel is the 92nd percentile of the pixels of that colour
 * (a block of green or yellow has none: it takes its neighbours'), smoothed, and each pixel is divided by it. A clean export,
 * already white, is returned as it is.
 */
export function flatten(src, w, h, mpp) {
  const N = w * h, stride = Math.max(1, Math.floor(Math.sqrt(N / 250000)));
  const sums = [], rs = [], gs = [], bs = [];
  for (let y = 0; y < h; y += stride) for (let x = 0; x < w; x += stride) {
    const p = 4 * (y * w + x), r = src[p], g = src[p + 1], b = src[p + 2];
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    if (src[p + 3] >= 128 && mx >= 60 && mx - mn <= 0.3 * mx) { sums.push(r + g + b); rs.push(r); gs.push(g); bs.push(b); }
  }
  if (sums.length < 500) return src;
  const thr = [...sums].sort((p, q) => p - q)[Math.floor(0.8 * sums.length)];
  const cr = [], cg = [], cb = [];
  let P = 0, nP = 0;
  sums.forEach((s, i) => { if (s >= thr && s > 0) { cr.push(rs[i] / s); cg.push(gs[i] / s); cb.push(bs[i] / s); P += s; nP++; } });
  const med = (a) => a.sort((p, q) => p - q)[a.length >> 1];
  const kr = med(cr), kg = med(cg), kb = med(cb);
  P /= nP;
  const paper = (r, g, b) => { const s = r + g + b; return s >= 0.7 * P && Math.abs(r / s - kr) < 0.035 && Math.abs(g / s - kg) < 0.035 && Math.abs(b / s - kb) < 0.035; };
  const B = Math.max(16, Math.round(50 / mpp)), bx = Math.ceil(w / B), by = Math.ceil(h / B), NB2 = bx * by;
  const lev = [new Float32Array(NB2), new Float32Array(NB2), new Float32Array(NB2)], known = new Uint8Array(NB2);
  const hist = [new Uint32Array(256), new Uint32Array(256), new Uint32Array(256)];
  const floor = [0.7 * P * kr, 0.7 * P * kg, 0.7 * P * kb];
  for (let j = 0; j < by; j++) for (let i = 0; i < bx; i++) {
    for (const H of hist) H.fill(0);
    let n = 0, all = 0;
    for (let y = j * B; y < Math.min(h, (j + 1) * B); y += 2) for (let x = i * B; x < Math.min(w, (i + 1) * B); x += 2) {
      const p = 4 * (y * w + x), r = src[p], g = src[p + 1], b = src[p + 2];
      all++;
      if (!paper(r, g, b)) continue;
      hist[0][r]++; hist[1][g]++; hist[2][b]++; n++;
    }
    if (n < Math.max(12, 0.03 * all)) continue;
    const k = j * bx + i;
    known[k] = 1;
    for (let c = 0; c < 3; c++) {
      let acc = 0, v = 255;
      for (let q = 255; q >= 0; q--) { acc += hist[c][q]; if (acc >= 0.08 * n) { v = q; break; } }
      lev[c][k] = Math.max(floor[c], v);
    }
  }
  // the blocks without paper take the mean of their known neighbours, ring after ring
  let left = NB2 - known.reduce((s, v) => s + v, 0);
  if (left === NB2) return src;
  while (left > 0) {
    const fill = [];
    for (let j = 0; j < by; j++) for (let i = 0; i < bx; i++) {
      const k = j * bx + i;
      if (known[k]) continue;
      let n = 0;
      const s = [0, 0, 0];
      for (let b = -1; b <= 1; b++) for (let a = -1; a <= 1; a++) {
        const I = i + a, J = j + b;
        if (I < 0 || J < 0 || I >= bx || J >= by || !known[J * bx + I]) continue;
        for (let c = 0; c < 3; c++) s[c] += lev[c][J * bx + I];
        n++;
      }
      if (n) fill.push([k, s[0] / n, s[1] / n, s[2] / n]);
    }
    for (const [k, r, g, b] of fill) { lev[0][k] = r; lev[1][k] = g; lev[2][k] = b; known[k] = 1; }
    left -= fill.length;
    if (!fill.length) break;
  }
  const sm = lev.map((L) => { const M = new Float32Array(NB2); for (let j = 0; j < by; j++) for (let i = 0; i < bx; i++) { let s = 0, n = 0; for (let b = -1; b <= 1; b++) for (let a = -1; a <= 1; a++) { const I = i + a, J = j + b; if (I >= 0 && J >= 0 && I < bx && J < by) { s += L[J * bx + I]; n++; } } M[j * bx + i] = s / n; } return M; });
  let low = 255;
  for (let c = 0; c < 3; c++) for (const v of sm[c]) low = Math.min(low, v);
  if (low >= 246) return src;                              // white already
  const out = new Uint8ClampedArray(src.length);
  for (let y = 0; y < h; y++) {
    const fy = Math.min(by - 1, Math.max(0, (y + 0.5) / B - 0.5)), j0 = Math.floor(fy), j1 = Math.min(by - 1, j0 + 1), ty = fy - j0;
    for (let x = 0; x < w; x++) {
      const fx = Math.min(bx - 1, Math.max(0, (x + 0.5) / B - 0.5)), i0 = Math.floor(fx), i1 = Math.min(bx - 1, i0 + 1), tx = fx - i0, p = 4 * (y * w + x);
      for (let c = 0; c < 3; c++) {
        const L = sm[c], v = (L[j0 * bx + i0] * (1 - tx) + L[j0 * bx + i1] * tx) * (1 - ty) + (L[j1 * bx + i0] * (1 - tx) + L[j1 * bx + i1] * tx) * ty;
        out[p + c] = (src[p + c] * 250) / v;
      }
      out[p + 3] = src[p + 3];
    }
  }
  return out;
}

/** The width of the mask's lines in pixels: the lower quartile of the shorter run through its pixels (as course.js). */
function lineWidth(mask, w, h, value) {
  const runs = [];
  for (let i = 0; i < mask.length; i += 7) {
    if (mask[i] !== value) continue;
    const x = i % w, y = (i - x) / w;
    let a = x, b = x, c = y, d = y;
    while (a > 0 && mask[i - (x - a) - 1] === value) a--;
    while (b < w - 1 && mask[i + (b - x) + 1] === value) b++;
    while (c > 0 && mask[i - (y - c) * w - w] === value) c--;
    while (d < h - 1 && mask[i + (d - y) * w + w] === value) d++;
    runs.push(Math.min(b - a + 1, d - c + 1));
    if (runs.length > 20000) break;
  }
  if (!runs.length) return 2;
  runs.sort((p, q) => p - q);
  return Math.max(1, runs[Math.floor(runs.length / 4)]);
}

/** Erosion (all) or dilation (any) of a binary mask by a (2k + 1) square, separable, with running counts (outside = 0). */
function morph(m, w, h, k, erode) {
  const tmp = new Uint8Array(w * h), out = new Uint8Array(w * h), win = 2 * k + 1;
  const pass = (src, dst, len, count, at) => {
    for (let line = 0; line < count; line++) {
      let n = 0;
      for (let x = 0; x < Math.min(k, len); x++) n += src[at(line, x)];
      for (let x = 0; x < len; x++) {
        if (x + k < len) n += src[at(line, x + k)];
        if (x - k - 1 >= 0) n -= src[at(line, x - k - 1)];
        dst[at(line, x)] = erode ? (n === win ? 1 : 0) : n > 0 ? 1 : 0;
      }
    }
  };
  pass(m, tmp, w, h, (y, x) => y * w + x);
  pass(tmp, out, h, w, (x, y) => y * w + x);
  return out;
}

/** Connected components (8-neighbours) of a binary mask: labels (0 = none) and, per label, size, bounding box and, with
 *  `moments`, the sums of x, y, x², y², xy (for its main direction). */
function components(m, w, h, moments = false) {
  const lab = new Int32Array(w * h), stack = new Int32Array(w * h), comps = [null];
  for (let s = 0; s < m.length; s++) {
    if (!m[s] || lab[s]) continue;
    const id = comps.length;
    let top = 0, n = 0, x0 = w, y0 = h, x1 = 0, y1 = 0, sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0;
    stack[top++] = s; lab[s] = id;
    while (top) {
      const i = stack[--top], x = i % w, y = (i - x) / w;
      n++; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      if (moments) { sx += x; sy += y; sxx += x * x; syy += y * y; sxy += x * y; }
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const X = x + dx, Y = y + dy;
        if (X < 0 || Y < 0 || X >= w || Y >= h) continue;
        const j = Y * w + X;
        if (m[j] && !lab[j]) { lab[j] = id; stack[top++] = j; }
      }
    }
    comps.push(moments ? { n, x0, y0, x1, y1, sx, sy, sxx, syy, sxy } : { n, x0, y0, x1, y1 });
  }
  return { lab, comps };
}

/**
 * The magnetic north lines taken out of the kinds (into I_ERASED; nmask marks them): for the blue ink, then the black, a Hough
 * vote of the thin runs of each row over lines within 16° of the vertical; a family of three lines or more, parallel within
 * 0.4°, evenly spaced (a line may be missing) at 80 m or more (75 m counted, rounding), each running over most of the map's height. Long straight
 * paths and rides are not evenly spaced, nor that long. Returns the lines found [{ ink, x (at mid-height), angle (°) }].
 */
function northLines(kind, rgba, w, h, mpp, nmask) {
  const found = [];
  const maxRun = Math.max(3, Math.round(4 / mpp)), hw = Math.ceil(maxRun / 2) + 1;   // up to 4 m: 0.27 mm at 1:10 000 drawn smooth
  const NA = 161, deg = Math.PI / 180, cs = new Float64Array(NA), sn = new Float64Array(NA);
  for (let a = 0; a < NA; a++) { const th = (-16 + 0.2 * a) * deg; cs[a] = Math.cos(th); sn[a] = Math.sin(th); }
  const R0 = Math.ceil(h * Math.sin(16 * deg)) + 3, NR = w + 2 * R0;
  const xAt = (a, rho, y) => (rho - R0 + y * sn[a]) / cs[a];
  // a photo's blue north lines are often so pale that most of their pixels read as paper: the vote takes any bluish pixel
  const bluish = (i) => { const p = 4 * i, r = rgba[p], g = rgba[p + 1], b = rgba[p + 2]; return b >= r + 8 && b >= g + 3 && b - Math.min(r, g) <= 0.75 * b; };
  for (const ink of [I_BLUE, I_BLACK]) {
    const acc = new Int32Array(NA * NR);
    const on = ink === I_BLUE ? (i) => kind[i] === I_BLUE || (kind[i] < 20 && bluish(i)) : (i) => kind[i] === I_BLACK;
    for (let y = 0; y < h; y++) {
      const row = y * w;
      for (let x = 0; x < w;) {
        if (!on(row + x)) { x++; continue; }
        let e = x;
        while (e < w && on(row + e)) e++;
        if (e - x <= maxRun) { const xc = (x + e - 1) / 2; for (let a = 0; a < NA; a++) acc[a * NR + Math.round(xc * cs[a] - y * sn[a]) + R0]++; }
        x = e;
      }
    }
    const S = new Int32Array(NA * NR);
    for (let a = 0; a < NA; a++) for (let r = 1; r < NR - 1; r++) { const k = a * NR + r; S[k] = acc[k - 1] + acc[k] + acc[k + 1]; }
    const peaks = [];
    for (let a = 0; a < NA; a++) for (let r = 1; r < NR - 1; r++) {
      const v = S[a * NR + r];
      if (v < 0.12 * h) continue;
      let top = true;
      for (let b = Math.max(0, a - 3); b <= Math.min(NA - 1, a + 3) && top; b++) for (let q = Math.max(1, r - 4); q <= Math.min(NR - 2, r + 4); q++) {
        const u = S[b * NR + q];
        if (u > v || (u === v && (b < a || (b === a && q < r)))) { top = false; break; }
      }
      if (top) peaks.push({ a, r, v, x: xAt(a, r, h / 2) });
    }
    peaks.sort((p, q) => q.v - p.v);
    peaks.length = Math.min(peaks.length, 200);
    // each line's ink along it: the rows where it is there, and how far apart the first and the last
    const along = (p) => {
      if (p.n != null) return p;
      let n = 0, y0 = -1, y1 = -1;
      for (let y = 0; y < h; y++) {
        const xc = Math.round(xAt(p.a, p.r, y));
        let hit = false;
        for (let x = Math.max(0, xc - hw); x <= Math.min(w - 1, xc + hw) && !hit; x++) if (on(y * w + x)) hit = true;
        if (hit) { n++; if (y0 < 0) y0 = y; y1 = y; }
      }
      p.n = n; p.span = y1 - y0;
      return p;
    };
    // a family: three strong lines (ink on 40 % of the rows, over 60 % of the height) parallel and evenly spaced; then every
    // line of its spacing across the map that is there on a fifth of the rows
    const strong = peaks.filter((p) => { along(p); return p.n >= 0.4 * h && p.span >= 0.6 * h; });
    let best = [];
    for (const seed of strong) {
      const fam = strong.filter((p) => Math.abs(p.a - seed.a) <= 2).sort((p, q) => p.x - q.x);
      const uniq = [];
      for (const p of fam) if (!uniq.length || p.x - uniq[uniq.length - 1].x > 8) uniq.push(p);
      for (let i = 1; i < uniq.length; i++) for (let j = 0; j < i; j++) {
        const g = uniq[i].x - uniq[j].x;
        if (g * mpp < 75) continue;                                     // a sprint map's 80 m (20 mm at 1:4000), pixels rounded
        const fits = uniq.filter((p) => { const f = (p.x - uniq[j].x) / g; return Math.abs(f - Math.round(f)) < 0.06; });
        if (fits.length < 3 || fits.length < best.length) continue;
        const ext = [];
        for (let m = Math.floor(-uniq[j].x / g) - 1; uniq[j].x + m * g <= w + g; m++) {
          const x = uniq[j].x + m * g;
          let p = null;
          for (let a = Math.max(0, seed.a - 2); a <= Math.min(NA - 1, seed.a + 2); a++) for (let dx = -4; dx <= 4; dx++) {
            const q = along({ a, r: Math.round((x + dx) * cs[a] - (h / 2) * sn[a] + R0), x: x + dx });
            if (!p || q.n > p.n) p = q;
          }
          if (p && p.n >= 0.2 * h && p.span >= 0.5 * h) ext.push(p);
        }
        if (ext.length > best.length) best = ext;
      }
    }
    // each line fitted through its rows' runs (least squares): a wide line leaves the vote's angle loose — a generated map's
    // 0.27 mm at 1:10 000, 6 px, was voted 0.4° off and its lower half left unerased
    const fit = (p) => {
      let n = 0, sy = 0, sx = 0, syy = 0, sxy = 0;
      for (let y = 0; y < h; y += 2) {
        const xc = Math.round(xAt(p.a, p.r, y));
        let x0 = -1, x1 = -1;
        for (let x = Math.max(0, xc - 2 * hw); x <= Math.min(w - 1, xc + 2 * hw); x++) if (on(y * w + x)) { if (x0 < 0) x0 = x; x1 = x; }
        if (x0 >= 0 && x1 - x0 < maxRun + 2) { const c = (x0 + x1) / 2; n++; sy += y; sx += c; syy += y * y; sxy += y * c; }
      }
      if (n < 0.1 * h) return { at: (y) => xAt(p.a, p.r, y), angle: -16 + 0.2 * p.a };
      const sl = (n * sxy - sy * sx) / (n * syy - sy * sy), b0 = (sx - sl * sy) / n;
      return { at: (y) => b0 + sl * y, angle: (Math.atan(sl) * 180) / Math.PI };
    };
    for (const p of best) {
      const L = fit(p);
      found.push({ ink: ink === I_BLUE ? "blue" : "black", x: Math.round(L.at(h / 2)), angle: Math.round(L.angle * 10) / 10 });
      for (let y = 0; y < h; y++) {
        const xc = Math.round(L.at(y));
        for (let x = Math.max(0, xc - hw); x <= Math.min(w - 1, xc + hw); x++) { const i = y * w + x; if (kind[i] === ink) { kind[i] = I_ERASED; nmask[i] = 1; } }
      }
    }
  }
  return found;
}

/**
 * The organisers' overprint (owner, 2026-11-01: routes through the hatched grounds of a château, along roads marked with
 * crosses): the purple, and purple printed over yellow, orange or green, which comes out red on paper — much red, little green
 * and blue. Its pixels closed by ~12 m (the gaps between hatch lines, between crosses); a closed piece of 600 m² whose ink fills
 * at most 60 % of it (a leg, a circle's arc fills it all) is overprint. What an opening of ~20 m keeps of it is an out-of-bounds
 * area when it covers 1 500 m² (hatching; a course's number beside its circle is released near its control); the rest, thin, red and 60 m long at least, a forbidden
 * route. Distances and areas for a forest map at about 1:10 000; sc scales them (SPRINT_SCALE: a sprint map's symbols are
 * drawn 2.5 times smaller on the ground, and at 12 m the course's own legs, closed where they converge, made areas out of bounds
 * across the streets of the Auray sprint photo, 2026-11-17). Returns per pixel 1 (area), 2 (route), else 0.
 */
function overprint(rgba, kind, w, h, mpp, sc = 1) {
  const N = w * h, O = new Uint8Array(N), R = new Uint8Array(N);
  const red = (r, g, b) => r > 60 && g < 0.55 * r && b < 0.45 * r;
  // the map's own brown when it is red enough to pass (mapBrown), its anti-aliased edges with it: never the overprint
  const brown = mapBrown(rgba, w, h, mpp, red);
  let notRed = null;
  if (brown) {
    const m = new Uint8Array(N);
    for (let i = 0, p = 0; i < N; i++, p += 4) if (red(rgba[p], rgba[p + 1], rgba[p + 2]) && brown(rgba[p], rgba[p + 1], rgba[p + 2])) m[i] = 1;
    notRed = morph(m, w, h, 1, false);
  }
  let any = 0;
  for (let i = 0, p = 0; i < N; i++, p += 4) {
    const r = rgba[p], g = rgba[p + 1], b = rgba[p + 2];
    if (kind[i] === I_PURPLE) O[i] = 1;
    else if (red(r, g, b) && !notRed?.[i]) { O[i] = R[i] = 1; any++; }
  }
  const out = new Uint8Array(N);
  const kc = Math.max(2, Math.round((12 * sc) / mpp)), ko = Math.max(2, Math.round((10 * sc) / mpp));
  const C = morph(morph(O, w, h, kc, false), w, h, kc, true);
  const { lab, comps } = components(C, w, h);
  const ink = new Int32Array(comps.length);
  for (let i = 0; i < N; i++) if (lab[i] && O[i]) ink[lab[i]]++;
  const keep = comps.map((c, id) => id > 0 && c.n * mpp * mpp >= 600 * sc * sc && ink[id] <= 0.6 * c.n);
  const cand = new Uint8Array(N);
  for (let i = 0; i < N; i++) if (lab[i] && keep[lab[i]]) cand[i] = 1;
  const areas = morph(morph(cand, w, h, ko, true), w, h, ko, false);
  // an area of 1 500 m² at least (a symbol, a number away from its circle are smaller)
  const al = components(areas, w, h), big = al.comps.map((c) => !!c && c.n * mpp * mpp >= 1500 * sc * sc);
  for (let i = 0; i < N; i++) if (al.lab[i] && !big[al.lab[i]]) areas[i] = 0;
  const near = morph(areas, w, h, ko, false);
  const band = new Uint8Array(N);
  // a band is the red crosses' (over a road's colours): the course's own legs over white are no forbidden route
  const redC = any ? morph(morph(R, w, h, kc, false), w, h, kc, true) : R;
  for (let i = 0; i < N; i++) { if (areas[i] && cand[i]) out[i] = 1; else if (cand[i] && !near[i] && redC[i]) band[i] = 1; }
  const bl = components(band, w, h);
  const long = bl.comps.map((c) => (c ? Math.hypot(c.x1 - c.x0 + 1, c.y1 - c.y0 + 1) * mpp >= 60 * sc : false));
  for (let i = 0; i < N; i++) if (bl.lab[i] && long[bl.lab[i]]) out[i] = 2;
  return out;
}

/**
 * The map's own brown, when it passes for the overprint's red (owner, 2026-11-05: the brown of a map exported from OCAD,
 * rgb(209, 66, 0), and of Purple Pen's sample maps is red enough, and their contours, closed into one piece, put a whole forest
 * out of bounds — 17 % of the Desquinemarre map, no route left on its legs): the most frequent colour among the red pixels (g/r,
 * b/r by 0.04, r by 16, the bins around it counted), taken as the brown when it lies all over the map — in a quarter of the ~50 m
 * blocks holding ink — as contours do; a hatched area or a band of crosses is local. Returns a test (r, g, b) → of the brown's
 * hue (within 10°: a map's browns, their tints and their edges over white or yellow share it), or null. On a photo the brown is
 * pale and seldom red: nothing changes there (the Fougères photo, the Gif scan: no brown found). Left: a map whose brown is both
 * red and everywhere, and whose overprint over yellow has the brown's hue, would lose its hatching.
 */
function mapBrown(rgba, w, h, mpp, red) {
  const B = Math.max(8, Math.round(50 / mpp)), bx = Math.ceil(w / B), NB = bx * Math.ceil(h / B);
  const bins = new Map(), key = (r, g, b) => (Math.round(g / r / 0.04) * 64 + Math.round(b / r / 0.04)) * 32 + Math.round(r / 16);
  const inked = new Uint8Array(NB);
  for (let y = 0; y < h; y += 2) for (let x = 0; x < w; x += 2) {
    const p = 4 * (y * w + x), r = rgba[p], g = rgba[p + 1], b = rgba[p + 2];
    if (Math.min(r, g, b) < 200) inked[Math.floor(y / B) * bx + Math.floor(x / B)] = 1;
    if (red(r, g, b)) { const k = key(r, g, b); bins.set(k, (bins.get(k) || 0) + 1); }
  }
  if (!bins.size) return null;
  let best = null, bestN = 0;
  for (const k of bins.keys()) {
    const r = k % 32, gb = (k - r) / 32, bb = gb % 64, gg = (gb - bb) / 64;
    let n = 0;
    for (let a = -1; a <= 1; a++) for (let c = -1; c <= 1; c++) for (let d = -1; d <= 1; d++) n += bins.get(((gg + a) * 64 + bb + c) * 32 + r + d) || 0;
    if (n > bestN) { bestN = n; best = [gg * 0.04, bb * 0.04, r * 16]; }
  }
  const [g0, b0, r0] = best;
  const near = (r, g, b) => Math.abs(g / r - g0) <= 0.07 && Math.abs(b / r - b0) <= 0.07 && Math.abs(r - r0) <= 36;
  const seen = new Uint8Array(NB);
  for (let y = 0; y < h; y += 2) for (let x = 0; x < w; x += 2) {
    const p = 4 * (y * w + x), r = rgba[p], g = rgba[p + 1], b = rgba[p + 2];
    if (red(r, g, b) && near(r, g, b)) seen[Math.floor(y / B) * bx + Math.floor(x / B)] = 1;
  }
  let s = 0, t = 0;
  for (let i = 0; i < NB; i++) if (inked[i]) { t++; s += seen[i]; }
  if (!(t && s / t >= 0.25)) return null;
  const hueOf = (r, g, b) => { const sp = r - Math.min(r, g, b); return sp > 0 ? (60 * (g - b)) / sp : 0; };   // red's side, green above blue
  const h0 = hueOf(r0, g0 * r0, b0 * r0);
  return (r, g, b) => g >= b && Math.abs(hueOf(r, g, b) - h0) <= 10;
}

/** Zhang-Suen thinning of the mask's pixels `list` (the mask is changed): the skeleton's pixels. */
function thinning(m, w, h, list) {
  const inner = (i) => { const x = i % w; return x > 0 && x < w - 1 && i >= w && i < w * h - w; };
  let alive = list.filter(inner);
  for (const i of list) if (!inner(i)) m[i] = 0;          // the image's border: no skeleton there
  for (let changed = true; changed;) {
    changed = false;
    for (let pass = 0; pass < 2; pass++) {
      const del = [];
      for (const i of alive) {
        if (!m[i]) continue;
        const p2 = m[i - w], p3 = m[i - w + 1], p4 = m[i + 1], p5 = m[i + w + 1], p6 = m[i + w], p7 = m[i + w - 1], p8 = m[i - 1], p9 = m[i - w - 1];
        const B = p2 + p3 + p4 + p5 + p6 + p7 + p8 + p9;
        if (B < 2 || B > 6) continue;
        const T = (!p2 && p3) + (!p3 && p4) + (!p4 && p5) + (!p5 && p6) + (!p6 && p7) + (!p7 && p8) + (!p8 && p9) + (!p9 && p2);
        if (T !== 1) continue;
        if (pass === 0 ? p2 * p4 * p6 || p4 * p6 * p8 : p2 * p4 * p8 || p2 * p6 * p8) continue;
        del.push(i);
      }
      for (const i of del) m[i] = 0;
      if (del.length) changed = true;
    }
    alive = alive.filter((i) => m[i]);
  }
  return alive;
}

/**
 * The thin black lines as a network of paths, into `path` (PATH kinds; the gaps bridged | PATH.BRIDGE). thin: the mask of the
 * thin black or dark neutral grey pixels (a scan's black lines are dark grey, the edges of a photo's too); black: those black. Each piece: its skeleton, its ends (a skeleton pixel with one neighbour) and the direction it leaves them
 * by (the piece's own axis for a dash, the last 5 m of skeleton for a longer line). Two ends of different pieces are joined when
 * they face each other across a gap (both within 30° of the gap's direction, the two pieces within 45° of one line) of at most
 * 0.8 × the shorter piece, 3 to 15 m, the closest pairs first, an end joined once. A chain of pieces 30 m long in all is a path;
 * its kind from its dashes against the map's other dashed paths: solid and wider, or long and wide dashes, a track; short
 * dashes a small path. Returns { chains, dash, width } (the map's typical dash length and stroke width, metres).
 */
function lineNetwork(thin, black, w, h, mpp, path) {
  const { lab, comps } = components(thin, w, h, true);
  const nc = comps.length;
  // a piece is black when 3 % of it is: a scan's black lines are dark grey with a black core here and there
  const nBlack = new Int32Array(nc);
  for (let i = 0; i < thin.length; i++) if (lab[i] && black[i]) nBlack[lab[i]]++;
  const list = [];
  for (let i = 0; i < thin.length; i++) if (thin[i]) list.push(i);
  const sk = thinning(Uint8Array.from(thin), w, h, list);
  const skel = new Uint8Array(w * h);
  for (const i of sk) skel[i] = 1;
  const slen = new Float64Array(nc);
  for (const i of sk) slen[lab[i]] += mpp * 1.08;
  // each piece's axis (for a dash's direction) and stroke width
  const axis = comps.map((c) => {
    if (!c) return null;
    const mx = c.sx / c.n, my = c.sy / c.n, vxx = c.sxx / c.n - mx * mx, vyy = c.syy / c.n - my * my, vxy = c.sxy / c.n - mx * my;
    const tr = vxx + vyy, det = vxx * vyy - vxy * vxy, l1 = tr / 2 + Math.sqrt(Math.max(0, (tr * tr) / 4 - det)), l2 = Math.max(0.05, tr - l1);
    let ux = vxy, uy = l1 - vxx;
    if (Math.abs(ux) + Math.abs(uy) < 1e-9) { ux = vxx >= vyy ? 1 : 0; uy = vxx >= vyy ? 0 : 1; }
    const L = Math.hypot(ux, uy);
    return { mx, my, ux: ux / L, uy: uy / L, elong: l1 / l2 };
  });
  const ext = comps.map((c) => (c ? Math.hypot(c.x1 - c.x0 + 1, c.y1 - c.y0 + 1) * mpp : 0));
  const lenOf = (c) => Math.max(slen[c], ext[c] * 0.5);
  const lineLike = (c) => nBlack[c] >= Math.max(1, 0.03 * comps[c].n) && (ext[c] >= 30 || (ext[c] >= Math.max(3, 3 * mpp) && axis[c].elong >= 6));
  // the ends
  const ends = [];
  const NB8 = [-w - 1, -w, -w + 1, -1, 1, w - 1, w, w + 1];
  const nbrs = (i) => { const out = []; const x = i % w; for (const d of NB8) { const j = i + d, X = j % w; if (j >= 0 && j < w * h && Math.abs(X - x) <= 1 && skel[j]) out.push(j); } return out; };
  const walk = Math.max(3, Math.round(5 / mpp));
  for (const i of sk) {
    const c = lab[i];
    if (!lineLike(c)) continue;
    const nb = nbrs(i);
    if (nb.length !== 1) continue;
    const x = i % w, y = (i - x) / w;
    let dx, dy;
    if (ext[c] < 30) {
      const ax = axis[c], s = (x - ax.mx) * ax.ux + (y - ax.my) * ax.uy >= 0 ? 1 : -1;
      dx = s * ax.ux; dy = s * ax.uy;
    } else {
      let prev = i, cur = nb[0];
      for (let s = 1; s < walk; s++) { const nx2 = nbrs(cur).filter((j) => j !== prev); if (nx2.length !== 1) break; prev = cur; cur = nx2[0]; }
      const cx = cur % w, cy = (cur - cx) / w, L = Math.hypot(x - cx, y - cy);
      if (!L) continue;
      dx = (x - cx) / L; dy = (y - cy) / L;
    }
    ends.push({ i, x, y, c, dx, dy });
  }
  // the gaps: facing ends of different pieces
  const G = Math.max(3, Math.ceil(15 / mpp)), buckets = new Map(), key = (x, y) => Math.floor(x / G) * 65536 + Math.floor(y / G);
  ends.forEach((e, n) => { const k = key(e.x, e.y); if (!buckets.has(k)) buckets.set(k, []); buckets.get(k).push(n); });
  const pairs = [];
  ends.forEach((e, n) => {
    const bx = Math.floor(e.x / G), by = Math.floor(e.y / G);
    for (let a = bx - 1; a <= bx + 1; a++) for (let b = by - 1; b <= by + 1; b++) for (const m of buckets.get(a * 65536 + b) || []) {
      if (m <= n) continue;
      const f = ends[m];
      if (f.c === e.c) continue;
      const vx = f.x - e.x, vy = f.y - e.y, D = Math.hypot(vx, vy);
      const gap = Math.max(2.5, Math.min(15, Math.max(3, 0.8 * Math.min(lenOf(e.c), lenOf(f.c)))) / mpp);
      if (D > gap) continue;
      const facing = -(e.dx * f.dx + e.dy * f.dy);
      let c1 = 1, c2 = 1;
      if (D > 1.5) { c1 = (e.dx * vx + e.dy * vy) / D; c2 = -(f.dx * vx + f.dy * vy) / D; }
      if (facing < (D > 1.5 ? 0.707 : 0.5) || c1 < 0.866 || c2 < 0.866) continue;
      pairs.push({ n, m, s: D * mpp * (3 - c1 - c2 - facing + 0.5) });
    }
  });
  pairs.sort((p, q) => p.s - q.s);
  const used = new Uint8Array(ends.length), links = [];
  const parent = new Int32Array(nc).map((_, i) => i);
  const root = (i) => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
  for (const p of pairs) {
    if (used[p.n] || used[p.m]) continue;
    used[p.n] = used[p.m] = 1;
    links.push(p);
    parent[root(ends[p.n].c)] = root(ends[p.m].c);
  }
  // the chains: their length, pieces, dashes and stroke width
  const ch = new Map();
  const chainOf = (c) => { const r = root(c); if (!ch.has(r)) ch.set(r, { total: 0, pieces: [], n: 0, sk: 0, long: false }); return ch.get(r); };
  for (let c = 1; c < nc; c++) {
    if (!lineLike(c)) continue;
    const k = chainOf(c);
    k.pieces.push(c); k.total += lenOf(c); k.n += comps[c].n; k.sk += Math.max(1, slen[c] / (mpp * 1.08));
    if (ext[c] >= 30) k.long = true;
  }
  for (const l of links) { const e = ends[l.n], f = ends[l.m]; chainOf(e.c).total += Math.hypot(f.x - e.x, f.y - e.y) * mpp; }
  const chains = [...ch.values()].filter((k) => k.total >= 30);
  for (const k of chains) {
    const lens = k.pieces.map(lenOf).sort((a, b) => a - b), longest = lens[lens.length - 1];
    k.solid = longest >= 0.7 * k.total;
    k.dash = lens[lens.length >> 1];
    k.width = (k.n / k.sk) * mpp;
  }
  // the map's typical dashed path: the medians, by length, of its dashed chains
  const wmed = (arr, f) => { const s = arr.map((k) => [f(k), k.total]).sort((a, b) => a[0] - b[0]), T = s.reduce((t, x) => t + x[1], 0); let acc = 0; for (const [v, wt] of s) { acc += wt; if (acc >= T / 2) return v; } return null; };
  const dashed = chains.filter((k) => !k.solid && k.pieces.length >= 3);
  const Dm = dashed.length ? wmed(dashed, (k) => k.dash) : null, Wm = dashed.length ? wmed(dashed, (k) => k.width) : null;
  for (const k of chains) {
    k.kind = PATH.PATH;
    if (Dm != null) {
      if (!k.solid && k.dash < 0.6 * Dm) k.kind = PATH.SMALL;
      else if (k.solid ? k.width >= 1.15 * Wm : k.dash >= 1.3 * Dm && k.width >= 1.1 * Wm) k.kind = PATH.TRACK;
    }
  }
  const kindOfPiece = new Uint8Array(nc);
  for (const k of chains) for (const c of k.pieces) kindOfPiece[c] = k.kind;
  for (let i = 0; i < thin.length; i++) if (lab[i] && kindOfPiece[lab[i]]) path[i] = kindOfPiece[lab[i]];
  // the gaps drawn, as wide as the line
  for (const l of links) {
    const e = ends[l.n], f = ends[l.m], v = kindOfPiece[e.c];
    if (!v) continue;
    const r = Math.max(0, Math.floor((chainOf(e.c).width / mpp) / 2)), n = Math.ceil(Math.hypot(f.x - e.x, f.y - e.y) * 2);
    for (let s = 0; s <= n; s++) {
      const x = Math.round(e.x + ((f.x - e.x) * s) / n), y = Math.round(e.y + ((f.y - e.y) * s) / n);
      for (let b = -r; b <= r; b++) for (let a = -r; a <= r; a++) {
        const X = x + a, Y = y + b;
        if (X < 0 || Y < 0 || X >= w || Y >= h) continue;
        const i = Y * w + X;
        if (!path[i]) path[i] = v | PATH.BRIDGE;
      }
    }
  }
  return { chains: chains.length, links: links.length, dash: Dm, width: Wm };
}

/**
 * The map read: per pixel its area (A.*, inks painted over) and the line layers. rgba: the image's bytes; mpp: metres per
 * pixel; opt: { map ("forest" | "sprint": the thickness test's width), flat (false: the paper left as it is) }; progress(f):
 * how far it is. Returns { area, path (PATH kinds), blue, north (the north lines' pixels), over (the overprint: 1 out of bounds,
 * 2 a forbidden route), lw, k, lines, northLines, ms }.
 */
export function classify(rgba0, w, h, mpp, opt = {}, progress = () => {}) {
  const t0 = Date.now(), N = w * h;
  const rgba = opt.flat === false ? rgba0 : flatten(rgba0, w, h, mpp);
  progress(0.2);
  const kind = new Uint8Array(N);
  const ol = oliveModel(rgba, w, h);
  for (let i = 0, p = 0; i < N; i++, p += 4) kind[i] = rgba[p + 3] < 128 ? A.WHITE : kindOf(rgba[p], rgba[p + 1], rgba[p + 2], ol);
  progress(0.3);
  const north = new Uint8Array(N), nlines = northLines(kind, rgba, w, h, mpp, north);
  // a sprint map's buildings (grey) photographed under a cold light come out bluish grey, flecked with « blue » that made water
  // and shallow water (passable) inside them: on a sprint map a blue with little colour is grey (after the north lines, which
  // take any bluish pixel)
  if (opt.map === "sprint") for (let i = 0, p = 0; i < N; i++, p += 4) if (kind[i] === I_BLUE && Math.max(rgba[p], rgba[p + 1], rgba[p + 2]) - Math.min(rgba[p], rgba[p + 1], rgba[p + 2]) < 36) kind[i] = I_GREY;
  const over = overprint(rgba, kind, w, h, mpp, opt.map === "sprint" ? SPRINT_SCALE : 1);
  progress(0.45);
  const lw = lineWidth(kind, w, h, I_BLACK);
  const k = Math.max(1, Math.round((THICK[opt.map] ?? THICK.forest) / mpp));
  const minArea = Math.max(9, (6 / mpp) ** 2);           // an area of ink smaller than 6 × 6 m is a point symbol, not an area
  const area = new Uint8Array(N).fill(UNKNOWN);
  for (let i = 0; i < N; i++) if (kind[i] < 20) area[i] = kind[i];
  // the thick parts of each ink: areas of their own
  const thickOf = (test, decide) => {
    const m = new Uint8Array(N);
    for (let i = 0; i < N; i++) if (test(kind[i])) m[i] = 1;
    const open = morph(morph(m, w, h, k, true), w, h, k, false);
    for (let i = 0; i < N; i++) open[i] &= m[i];
    const { lab, comps } = components(open, w, h);
    const stats = comps.map(() => [0, 0, 0]);
    for (let i = 0; i < N; i++) if (lab[i]) { const s = stats[lab[i]]; s[0]++; if (kind[i] === I_BLACK) s[1]++; s[2] += rgba[4 * i]; }
    const cls = comps.map((c, id) => (id && c.n >= minArea ? decide(stats[id]) : UNKNOWN));
    for (let i = 0; i < N; i++) if (lab[i] && cls[lab[i]] !== UNKNOWN) area[i] = cls[lab[i]];
    return open;
  };
  // a forest map's grey is bare rock, a dark grey; a lighter one is the photo's shade on the paper (a crease, a corner): nothing
  const shade = opt.map === "sprint" ? 256 : 165;
  const darkThick = thickOf((v) => v === I_BLACK || v === I_GREY, (s) => (s[1] > 0.5 * s[0] ? A.BUILDING : s[2] / s[0] > shade ? UNKNOWN : A.GREY));
  thickOf((v) => v === I_BROWN, () => A.PAVED);
  thickOf((v) => v === I_BLUE, (s) => (s[2] / s[0] > 150 ? A.SHALLOW : A.WATER));
  thickOf((v) => v === I_OLIVE, () => A.OOB);
  // open land is never a line: a full yellow streak narrower than the thickness test is a blend — the course's leg printed across
  // olive comes out yellow on a photo, a passable corridor through the gardens (the Quiberon photo, 2026-11-18) — and takes its
  // neighbours' area, as a thin ink does. On a sprint map only: a forest map's open rides and rough open land are narrow or
  // dotted (Lincoln Park lost a third of its open land to the test)
  if (opt.map === "sprint") {
    const m = new Uint8Array(N);
    for (let i = 0; i < N; i++) if (area[i] === A.OPEN) m[i] = 1;      // full yellow: a pale street reads as rough open
    const open = morph(morph(m, w, h, k, true), w, h, k, false);
    for (let i = 0; i < N; i++) if (m[i] && !open[i]) area[i] = UNKNOWN;
  }
  progress(0.6);
  // the thin black lines: the paths' network (and also fences, walls, long cliffs — what they are is the settings' choice)
  const thin = new Uint8Array(N), black = new Uint8Array(N);
  const darkGrey = (i) => { const p = 4 * i, mx = Math.max(rgba[p], rgba[p + 1], rgba[p + 2]); return mx < 170 && mx - Math.min(rgba[p], rgba[p + 1], rgba[p + 2]) < 24; };
  for (let i = 0; i < N; i++) if ((kind[i] === I_BLACK || (kind[i] === I_GREY && darkGrey(i))) && !darkThick[i] && area[i] === UNKNOWN) { thin[i] = 1; black[i] = kind[i] === I_BLACK ? 1 : 0; }
  const path = new Uint8Array(N), lines = lineNetwork(thin, black, w, h, mpp, path);
  progress(0.85);
  const blue = new Uint8Array(N);
  for (let i = 0; i < N; i++) if (kind[i] === I_BLUE && area[i] === UNKNOWN) blue[i] = 1;
  // the inks painted over: each unknown pixel takes the nearest area (a breadth-first fill from every known pixel)
  const q = new Int32Array(N);
  let qh = 0, qt = 0;
  for (let i = 0; i < N; i++) if (area[i] !== UNKNOWN) q[qt++] = i;
  if (!qt) area.fill(A.WHITE);
  while (qh < qt) {
    const i = q[qh++], x = i % w, v = area[i];
    if (x > 0 && area[i - 1] === UNKNOWN) { area[i - 1] = v; q[qt++] = i - 1; }
    if (x < w - 1 && area[i + 1] === UNKNOWN) { area[i + 1] = v; q[qt++] = i + 1; }
    if (i >= w && area[i - w] === UNKNOWN) { area[i - w] = v; q[qt++] = i - w; }
    if (i + w < N && area[i + w] === UNKNOWN) { area[i + w] = v; q[qt++] = i + w; }
  }
  // the overprint's areas are out of bounds and on its forbidden routes no path is followed — both decided per cell by costs(),
  // since near the course's controls the overprint is the course's own circles and lines (releaseAround) and the ground under them,
  // kept here, is what counts (2026-11-17: it was overwritten, so a released cell became runnable forest: the routes of the Auray
  // sprint photo ran straight through the buildings and gardens round every control)
  progress(1);
  return { area, path, blue, north, over, lw, k, lines, northLines: nlines, olive: ol, ms: Date.now() - t0 };
}

// ---- 2. cells -----------------------------------------------------------------------------------------------------------
/**
 * The cells: cs × cs pixels each. Returns { cs, nx, ny, cls (most frequent area), path (the fastest path kind, gaps bridged
 * included), raw (the same without the bridged gaps), blue (share of blue line pixels, 0-255), north (a north line taken out
 * there) }, a cell full of marsh lines becoming A.MARSH.
 */
export function cells(px, w, h, cs) {
  const nx = Math.ceil(w / cs), ny = Math.ceil(h / cs), M = nx * ny;
  const cls = new Uint8Array(M), path = new Uint8Array(M), raw = new Uint8Array(M), blue = new Uint8Array(M), north = new Uint8Array(M), over = new Uint8Array(M), count = new Int32Array(N_CLASSES);
  // a vector map's own layers (trace/vectorroutes.js): lines that block, handrails, passable lines slow to cross, slowing ground
  const vector = !!px.block, block = vector ? new Uint8Array(M) : null, hand = vector ? new Uint8Array(M) : null;
  const cross = px.cross ? new Uint8Array(M) : null, slow = px.slow ? new Uint8Array(M) : null, sl = [0, 0, 0, 0];
  // a table per symbol's speeds (the Tracer): an area's where it covers half the cell (impassable when most of that half is),
  // a line's the fastest in the cell
  const speed = px.speed ? new Uint8Array(M) : null, pspeed = px.pspeed ? new Uint8Array(M) : null;
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    count.fill(0);
    let p = 0, r = 0, b = 0, n = 0, bl = 0, ha = 0, no = 0, oa = 0, ob = 0, cr = 0, sn = 0, ss = 0, sb = 0, ps = 0;
    if (slow) sl.fill(0);
    for (let y = j * cs; y < Math.min(h, (j + 1) * cs); y++) for (let x = i * cs; x < Math.min(w, (i + 1) * cs); x++) {
      const k = y * w + x, v = px.path[k];
      count[px.area[k]]++; b += px.blue[k]; n++;
      if (v) { const t = v & 3; if (t > p) p = t; if (!(v & PATH.BRIDGE) && t > r) r = t; }
      if (px.north?.[k]) no = 1;
      if (px.over) { if (px.over[k] === 1) oa++; else if (px.over[k] === 2) ob = 1; }
      if (vector) { bl |= px.block[k]; ha |= px.hand[k]; }
      if (cross) cr |= px.cross[k];
      if (slow && px.slow[k]) sl[px.slow[k]]++;
      if (speed && px.speed[k]) { sn++; if (px.speed[k] === 255) sb++; else ss += px.speed[k]; }
      if (pspeed && px.pspeed[k] > ps) ps = px.pspeed[k];
    }
    let best = 0;
    for (let c = 1; c < N_CLASSES; c++) if (count[c] > count[best]) best = c;
    const k = j * nx + i;
    cls[k] = best; path[k] = p; raw[k] = r; blue[k] = Math.round((255 * b) / Math.max(1, n)); north[k] = no;
    over[k] = oa * 2 >= n ? 1 : ob ? 2 : 0;
    if (vector) { block[k] = bl; hand[k] = ha; }
    if (cross) cross[k] = cr;
    // the slowing ground where it covers half the cell: the strongest level reached by that half
    if (slow) { let c = 0; for (let lv = 3; lv >= 1; lv--) { c += sl[lv]; if (2 * c >= n) { slow[k] = lv; break; } } }
    if (speed && 2 * sn >= n) speed[k] = 2 * sb >= sn ? 255 : Math.max(1, Math.round(ss / Math.max(1, sn - sb)));
    if (pspeed) pspeed[k] = ps;
  }
  // a dashed path's last gaps: a cell between two path cells is one (the slower of the two)
  const fill = [];
  for (let j = 1; j < ny - 1; j++) for (let i = 1; i < nx - 1; i++) {
    const k = j * nx + i;
    if (path[k]) continue;
    for (const [u, v] of [[k - 1, k + 1], [k - nx, k + nx], [k - nx - 1, k + nx + 1], [k - nx + 1, k + nx - 1]]) if (path[u] && path[v]) { fill.push([k, Math.min(path[u], path[v])]); break; }
  }
  for (const [k, v] of fill) path[k] = v;
  // marsh: blue lines over a fifth of the 5 × 5 cells around
  const marsh = [];
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    let s = 0, n = 0;
    for (let b = Math.max(0, j - 2); b <= Math.min(ny - 1, j + 2); b++) for (let a = Math.max(0, i - 2); a <= Math.min(nx - 1, i + 2); a++) { s += blue[b * nx + a]; n++; }
    const k = j * nx + i;
    if (s / n > 0.2 * 255 && blue[k] && cls[k] <= A.G3) marsh.push(k);
  }
  for (const k of marsh) cls[k] = A.MARSH;
  return { cs, nx, ny, cls, path, raw, blue, north, over, vector, block, hand, cross, slow, speed, pspeed };
}

// ---- 3. costs -------------------------------------------------------------------------------------------------------------
const VIS = [1, 0.3, 0.5, 1.2, 1.4, 1.4, 0, 0.8, 0.2, 0, 0, 0.6, 0.8];        // how hard each area is to navigate in (risk weight)
const GROUP = [1, 2, 2, 1, 3, 3, 0, 0, 2, 0, 0, 2, 3];                        // visibility groups: their edges are handrails

/** The blackness setting resolved: what thin black lines are. */
export const blackMode = (s) => (s.black && s.black !== "auto" ? s.black : s.map === "sprint" ? "obstacles" : "paths");

/**
 * Per cell: f (time multiplier against white forest on the flat; Infinity = impassable) and r (navigation risk factor
 * ≥ 1). G: the cells (G.release, releaseAround's: 1 near the course's controls, 2 along its legs); mpc: metres
 * per cell.
 */
export function costs(G, s, mpc) {
  const { nx, ny, cls, path } = G, raw = G.raw || path, M = nx * ny, sp = { ...DEFAULTS.speeds, ...(s.speeds || {}) };
  const inv = (v) => 100 / Math.max(1, v);
  const F = new Float32Array(N_CLASSES);
  F[A.WHITE] = 1; F[A.OPEN] = inv(sp.open); F[A.ROUGH] = inv(sp.rough); F[A.G1] = inv(sp.g1); F[A.G2] = inv(sp.g2); F[A.G3] = inv(sp.g3);
  F[A.WATER] = Infinity; F[A.SHALLOW] = inv(sp.shallow); F[A.PAVED] = inv(sp.paved); F[A.OOB] = Infinity; F[A.BUILDING] = Infinity;
  F[A.GREY] = s.map === "sprint" ? Infinity : inv(sp.grey); F[A.MARSH] = inv(sp.marsh);
  const bm = G.vector ? "paths" : blackMode(s);                          // a vector map's paths are paths
  const FP = [1, inv(sp.small), inv(sp.path), inv(sp.track)], FS = [1, inv(sp.slow1), inv(sp.slow2), inv(sp.slow3)];
  const f = new Float32Array(M), hand = new Uint8Array(M), isPath = new Uint8Array(M);
  const ov = G.over, rel = G.release;
  // the overprint's areas out of bounds (near a control it is the course's own circle or number: the ground under it counts)
  const oob = (k) => ov?.[k] === 1 && rel?.[k] !== 1;
  for (let k = 0; k < M; k++) {
    const shut = oob(k);
    let v = G.block?.[k] || shut ? Infinity : F[cls[k]];
    // a table per symbol's own speed for the area (the Tracer): in the class's place
    const ts = G.speed?.[k];
    if (ts && !shut && !G.block?.[k]) v = ts === 255 ? Infinity : 100 / ts;
    if (G.slow?.[k]) v *= FS[G.slow[k]];                               // stony or sandy ground, over what grows there
    // a vector map's path crosses water or a building (a bridge, a passage), never an area out of bounds nor an impassable wall or
    // fence (its crossing points are holes in it: trace/vectorroutes.js); on an image a line read as a path opens nothing impassable
    // (the black edge of a building, of an area out of bounds), nor does a gap bridged
    if (bm === "paths" && path[k] && cls[k] !== A.OOB && !shut && !G.block?.[k] && (G.vector ? raw[k] || v < Infinity : v < Infinity)) { v = Math.min(v, G.pspeed?.[k] ? 100 / G.pspeed[k] : FP[path[k]]); isPath[k] = 1; }
    else if (bm === "obstacles" && raw[k]) v = Infinity;
    // a forbidden route is crossed, not followed: slow along it, its path no handrail
    if (ov?.[k] === 2 && !rel?.[k]) { v = Math.max(v, FORBIDDEN_ROUTE); isPath[k] = 0; }
    f[k] = v;
  }
  // the handrails: paths (or black lines), streams, the edges between areas seen differently, the banks of what blocks
  const groupOf = (k) => (oob(k) ? GROUP[A.OOB] : GROUP[cls[k]]);
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const k = j * nx + i;
    if (isPath[k] || (raw[k] && !oob(k)) || G.blue[k] > 25 || G.hand?.[k] || G.block?.[k]) { hand[k] = 1; continue; }
    const g = groupOf(k);
    if ((i < nx - 1 && groupOf(k + 1) !== g) || (j < ny - 1 && groupOf(k + nx) !== g)) { hand[k] = 1; if (i < nx - 1) hand[k + 1] = 1; if (j < ny - 1) hand[k + nx] = 1; }
  }
  // the distance to the nearest handrail (chamfer, two passes), in metres
  const d = new Float32Array(M).fill(1e9);
  for (let k = 0; k < M; k++) if (hand[k]) d[k] = 0;
  const D = Math.SQRT2;
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const k = j * nx + i;
    let v = d[k];
    if (i > 0) v = Math.min(v, d[k - 1] + 1);
    if (j > 0) { v = Math.min(v, d[k - nx] + 1); if (i > 0) v = Math.min(v, d[k - nx - 1] + D); if (i < nx - 1) v = Math.min(v, d[k - nx + 1] + D); }
    d[k] = v;
  }
  for (let j = ny - 1; j >= 0; j--) for (let i = nx - 1; i >= 0; i--) {
    const k = j * nx + i;
    let v = d[k];
    if (i < nx - 1) v = Math.min(v, d[k + 1] + 1);
    if (j < ny - 1) { v = Math.min(v, d[k + nx] + 1); if (i < nx - 1) v = Math.min(v, d[k + nx + 1] + D); if (i > 0) v = Math.min(v, d[k + nx - 1] + D); }
    d[k] = v;
  }
  const R = Math.max(0, Math.min(100, s.risk ?? DEFAULTS.risk)) / 100, r = new Float32Array(M);
  for (let k = 0; k < M; k++) r[k] = 1 + (isPath[k] ? 0 : R * VIS[cls[k]] * Math.min(1, (d[k] * mpc) / RISK_DIST));
  // the passable lines slow to cross (an OCAD map's): their cells, a path over them apart (a gate, a way through), and the time a
  // crossing takes in the model's units (metres of white forest; `cross` seconds at CROSS_PACE)
  const xp = G.cross ? Math.max(0, s.cross ?? DEFAULTS.cross) / CROSS_PACE : 0;
  let cross = null;
  if (xp > 0) {
    cross = new Uint8Array(M);
    for (let k = 0; k < M; k++) if (G.cross[k] && !isPath[k] && f[k] < Infinity) cross[k] = 1;
  }
  // the fastest ground of all (the searches' lower bound): a table per symbol may hold a faster one
  let fMin = Math.min(...FP.slice(1), ...[...F].filter((v) => v > 0));
  if (G.speed || G.pspeed) for (let k = 0; k < M; k++) if (f[k] < fMin) fMin = f[k];
  return { f, r, isPath, cross, xp, fMin };
}
/** Whether the step n from cell k to cell q gets over a passable line: it enters one of its cells, or passes between two of them
 *  (a diagonal) or over one (a knight's move); never from a cell of the line (a crossing counts once, on the way in). */
function crosses(cr, nx, k, q, n) {
  if (cr[k]) return false;
  if (cr[q]) return true;
  if (n < 4) return false;
  const dx = DX[n], dy = DY[n];
  if (n < 8) return cr[k + dx] === 1 && cr[k + dy * nx] === 1;
  const sx = dx > 0 ? 1 : -1, sy = dy > 0 ? 1 : -1, m1 = dx === 2 || dx === -2 ? k + sx : k + sy * nx;
  return cr[m1] === 1 || cr[k + sy * nx + sx] === 1;
}
export const RISK_DIST = 50;                              // metres from a handrail at which the risk is full
const FORBIDDEN_ROUTE = 2.5;                             // a forbidden route's cells: 40 % of white forest's speed (crossed, not followed)
/**
 * Where the overprint is the course itself (map px of its controls, in the course's order): 1 within `radius` metres of a control
 * (its circle, its number: neither out of bounds nor a forbidden route), 2 within radius / 6 of the straight leg between two
 * controls (the leg's line, red where it crosses yellow or olive, read as a forbidden route on a sprint photo, 2026-11-17: no
 * band there; an area out of bounds the leg crosses stays shut).
 */
export function releaseAround(G, em, pts, radius = 75) {
  const { nx, ny, cs } = G, M = nx * ny, out = new Uint8Array(M);
  const mpc = Math.min(Math.hypot(...em[0]), Math.hypot(...em[1])), R = Math.ceil(radius / mpc);
  const metres = (di, dj) => [di * em[0][0] + dj * em[1][0], di * em[0][1] + dj * em[1][1]];
  const cellsOf = pts.map(([x, y]) => [Math.floor(x / cs), Math.floor(y / cs)]);
  for (const [ci, cj] of cellsOf) {
    for (let j = Math.max(0, cj - R); j <= Math.min(ny - 1, cj + R); j++) for (let i = Math.max(0, ci - R); i <= Math.min(nx - 1, ci + R); i++) {
      if (Math.hypot(...metres(i - ci, j - cj)) <= radius) out[j * nx + i] = 1;
    }
  }
  const half = radius / 6, Rl = Math.ceil(half / mpc);
  for (let n = 0; n + 1 < cellsOf.length; n++) {
    const [ai, aj] = cellsOf[n], [bi, bj] = cellsOf[n + 1], [ux, uy] = metres(bi - ai, bj - aj), L2 = ux * ux + uy * uy;
    for (let j = Math.max(0, Math.min(aj, bj) - Rl); j <= Math.min(ny - 1, Math.max(aj, bj) + Rl); j++) {
      for (let i = Math.max(0, Math.min(ai, bi) - Rl); i <= Math.min(nx - 1, Math.max(ai, bi) + Rl); i++) {
        const k = j * nx + i;
        if (out[k]) continue;
        const [px, py] = metres(i - ai, j - aj), t = L2 ? Math.max(0, Math.min(1, (px * ux + py * uy) / L2)) : 0;
        if (Math.hypot(px - t * ux, py - t * uy) <= half) out[k] = 2;
      }
    }
  }
  return out;
}

/** The time multiplier of a grade (rise over run): uphill climb metres per metre; downhill faster when gentle, then slower. */
export function slopeFactor(g, climb) {
  if (g >= 0) return 1 + climb * g;
  const a = -g;
  return a <= 0.15 ? 1 - 0.6 * a : 0.91 + 2.5 * (a - 0.15);
}

// ---- 4. routes ------------------------------------------------------------------------------------------------------------
const NB = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1], [1, 2], [2, 1], [-1, 2], [-2, 1], [1, -2], [2, -1], [-1, -2], [-2, -1]];
const OPP = NB.map(([dx, dy]) => NB.findIndex(([x, y]) => x === -dx && y === -dy));

/** A binary heap of (key, value) in typed arrays, grown as needed (stale entries skipped by the caller). */
class Heap {
  constructor(n = 1 << 16) { this.k = new Float64Array(n); this.v = new Int32Array(n); this.n = 0; }
  push(key, val) {
    if (this.n === this.k.length) { const k = new Float64Array(this.n * 2), v = new Int32Array(this.n * 2); k.set(this.k); v.set(this.v); this.k = k; this.v = v; }
    let i = this.n++;
    const K = this.k, V = this.v;
    while (i > 0) { const p = (i - 1) >> 1; if (K[p] <= key) break; K[i] = K[p]; V[i] = V[p]; i = p; }
    K[i] = key; V[i] = val;
  }
  pop() {
    const K = this.k, V = this.v, top = V[0], key = K[--this.n], val = V[this.n];
    let i = 0;
    for (;;) { let c = 2 * i + 1; if (c >= this.n) break; if (c + 1 < this.n && K[c + 1] < K[c]) c++; if (K[c] >= key) break; K[i] = K[c]; V[i] = V[c]; i = c; }
    K[i] = key; V[i] = val;
    return top;
  }
}

/**
 * The context of one map for the searches: G (cells), C (costs), h (height per cell, metres, or null), em: the metres of a
 * cell step [ex, ey] (vectors), s (settings).
 */
export function context(G, C, h, em, s) {
  const len = NB.map(([dx, dy]) => Math.hypot(dx * em[0][0] + dy * em[1][0], dx * em[0][1] + dy * em[1][1]));
  return { G, C, h, em, s, len, mpc: Math.min(Math.hypot(...em[0]), Math.hypot(...em[1])) };
}

/** The physical time (at 1 s per metre of white forest on the flat), the cost (with the navigation risk) of a step. */
function step(X, a, b, n) {
  const { f, r } = X.C;
  const fa = f[a], fb = f[b];
  if (!(fa < Infinity) || !(fb < Infinity)) return null;
  const L = X.len[n], g = X.h ? (X.h[b] - X.h[a]) / L : 0;
  const tm = L * ((fa + fb) / 2) * slopeFactor(g, X.s.climb ?? DEFAULTS.climb);
  const x = X.C.cross && crosses(X.C.cross, X.G.nx, a, b, n) ? X.C.xp : 0;
  return [tm + x, tm * ((r[a] + r[b]) / 2) + x];
}
/** Whether the step n from cell (i, j) squeezes between blocked cells: a diagonal between two, a knight's move over one. */
function squeezed(X, i, j, n) {
  const { nx } = X.G, f = X.C.f, [dx, dy] = NB[n];
  if (n >= 4 && n < 8) return !(f[j * nx + i + dx] < Infinity) && !(f[(j + dy) * nx + i] < Infinity);
  if (n >= 8) { const sx = Math.sign(dx), sy = Math.sign(dy), m1 = Math.abs(dx) === 2 ? j * nx + i + sx : (j + sy) * nx + i, m2 = (j + sy) * nx + i + sx; return !(f[m1] < Infinity) || !(f[m2] < Infinity); }
  return false;
}

/** A* from cell a to cell b within the region { i0, j0, i1, j1, rw, inside (per region cell) }. */
function astar(X, a, b, reg) {
  const { nx } = X.G, { i0, j0, i1, j1, rw } = reg, RN = rw * (j1 - j0 + 1);
  const loc = (k) => { const i = k % nx; return ((k - i) / nx - j0) * rw + (i - i0); };
  const g = new Float64Array(RN).fill(Infinity), from = new Int32Array(RN).fill(-1), done = new Uint8Array(RN);
  const bi = b % nx, bj = (b - bi) / nx, fmin = X.C.fMin * 0.9;
  const hOf = (k) => { const i = k % nx, j = (k - i) / nx, dx = bi - i, dy = bj - j; return fmin * Math.hypot(dx * X.em[0][0] + dy * X.em[1][0], dx * X.em[0][1] + dy * X.em[1][1]); };
  const H = new Heap();
  g[loc(a)] = 0; H.push(hOf(a), a);
  while (H.n) {
    const k = H.pop(), lk = loc(k);
    if (done[lk]) continue;
    done[lk] = 1;
    if (k === b) break;
    const i = k % nx, j = (k - i) / nx;
    for (let n = 0; n < 16; n++) {
      const [dx, dy] = NB[n], I = i + dx, J = j + dy;
      if (I < i0 || J < j0 || I > i1 || J > j1) continue;
      const q = J * nx + I, lq = (J - j0) * rw + (I - i0);
      if (done[lq] || !reg.inside[lq] || squeezed(X, i, j, n)) continue;
      const st = step(X, k, q, n);
      if (!st) continue;
      const v = g[lk] + st[1];
      if (v < g[lq]) { g[lq] = v; from[lq] = k; H.push(v + hOf(q), q); }
    }
  }
  if (!(g[loc(b)] < Infinity)) return null;
  const out = [];
  for (let k = b; k !== -1; k = from[loc(k)]) out.push(k);
  return out.reverse();
}

/** A complete shortest-path tree over the region from src (reverse: the costs of reaching src): per region cell its cost g and
 *  par, the next cell toward src. */
function tree(X, src, reg, reverse) {
  const { nx } = X.G, { i0, j0, i1, j1, rw } = reg, RN = rw * (j1 - j0 + 1);
  const loc = (k) => { const i = k % nx; return ((k - i) / nx - j0) * rw + (i - i0); };
  const g = new Float64Array(RN).fill(Infinity), par = new Int32Array(RN).fill(-1), done = new Uint8Array(RN);
  const H = new Heap();
  g[loc(src)] = 0; H.push(0, src);
  while (H.n) {
    const k = H.pop(), lk = loc(k);
    if (done[lk]) continue;
    done[lk] = 1;
    const i = k % nx, j = (k - i) / nx;
    for (let n = 0; n < 16; n++) {
      const [dx, dy] = NB[n], I = i + dx, J = j + dy;
      if (I < i0 || J < j0 || I > i1 || J > j1) continue;
      const q = J * nx + I, lq = (J - j0) * rw + (I - i0);
      if (done[lq] || !reg.inside[lq] || squeezed(X, i, j, n)) continue;
      const st = reverse ? step(X, q, k, OPP[n]) : step(X, k, q, n);
      if (!st) continue;
      const v = g[lk] + st[1];
      if (v < g[lq]) { g[lq] = v; par[lq] = k; H.push(v, q); }
    }
  }
  return { g, par, loc };
}

/** The cells of a route measured: time, cost, length, climb and descent, the share on paths; cum: the cost cell by cell. */
function measure(X, path) {
  const { nx } = X.G;
  let time = 0, cost = 0, len = 0, onPath = 0, up = 0, down = 0;
  const cum = new Float64Array(path.length);
  for (let q = 1; q < path.length; q++) {
    const a = path[q - 1], b = path[q], ai = a % nx, bi = b % nx, dx = bi - ai, dy = (b - bi) / nx - (a - ai) / nx;
    const n = NB.findIndex(([x, y]) => x === dx && y === dy);
    const st = step(X, a, b, n) || [X.len[n] * 4, X.len[n] * 4];
    time += st[0]; cost += st[1]; len += X.len[n]; cum[q] = cost;
    if (X.C.isPath[a] && X.C.isPath[b]) onPath += X.len[n];
  }
  if (X.h) {                                             // the climb on heights smoothed over ~5 cells (the model's noise)
    const hs = path.map((k, i) => { let s = 0, n = 0; for (let d = -2; d <= 2; d++) { const p = path[i + d]; if (p != null) { s += X.h[p]; n++; } } return s / n; });
    for (let i = 1; i < hs.length; i++) { const d = hs[i] - hs[i - 1]; if (d > 0) up += d; else down -= d; }
  }
  return { time, cost, len, up, down, onPath: len ? onPath / len : 0, cum };
}

/**
 * A straight line between two points in cell units (x, y; a cell's centre at i + 0.5) measured on the model, sampled every
 * half cell: { time, cost, len, onPath (metres), hs (the heights met), parts }; an impassable cell costs `cap` × white forest
 * (null: the line is refused). parts: the time on paths and off them on the flat, and what the slope adds — uphill (the climb
 * setting scales it) and downhill, and the crossings of passable lines (`cross`) — for the calibration on a runner's legs.
 */
function segment(X, x0, y0, x1, y1, cap) {
  const { nx, ny } = X.G, climb = X.s.climb ?? DEFAULTS.climb, f = X.C.f, r = X.C.r;
  const at = (x, y) => Math.min(ny - 1, Math.max(0, Math.floor(y))) * nx + Math.min(nx - 1, Math.max(0, Math.floor(x)));
  const u = x1 - x0, v = y1 - y0, d = Math.hypot(u * X.em[0][0] + v * X.em[1][0], u * X.em[0][1] + v * X.em[1][1]);
  const out = { time: 0, cost: 0, len: d, onPath: 0, hs: [], parts: { path: 0, off: 0, up: 0, down: 0, cross: 0, xn: 0 } };
  const cr = X.C.cross, xp = X.C.xp;
  if (!d) return out;
  const n = Math.max(1, Math.ceil(d / (X.mpc / 2))), L = d / n;
  let ka = at(x0, y0);
  for (let s = 1; s <= n; s++) {
    const kb = at(x0 + (u * s) / n, y0 + (v * s) / n);
    let fa = f[ka], fb = f[kb];
    if (!(fa < Infinity) || !(fb < Infinity)) { if (cap == null) return null; fa = Math.min(cap, fa); fb = Math.min(cap, fb); }
    const g = X.h ? Math.max(-1, Math.min(1, (X.h[kb] - X.h[ka]) / L)) : 0;
    const flat = L * ((fa + fb) / 2), tm = flat * slopeFactor(g, climb), onP = X.C.isPath[ka] && X.C.isPath[kb];
    out.time += tm; out.cost += tm * ((r[ka] + r[kb]) / 2);
    if (onP) { out.onPath += L; out.parts.path += flat; } else out.parts.off += flat;
    if (g >= 0) out.parts.up += tm - flat; else out.parts.down += tm - flat;
    // a passable line got over: entering it, or slipping between two of its cells at a corner
    if (cr && kb !== ka && !cr[ka]) {
      const di = (kb % nx) - (ka % nx), dj = Math.round((kb - ka - di) / nx);
      if (cr[kb] || (di && dj && cr[ka + di] && cr[ka + dj * nx])) { out.time += xp; out.cost += xp; out.parts.cross += xp; out.parts.xn++; }
    }
    if (X.h) out.hs.push(X.h[kb]);
    ka = kb;
  }
  return out;
}
/** A polyline in cell units measured: time, cost, len, up, down (heights smoothed over ~9 samples), onPath (share), parts
 *  (segment's, summed). */
function polyline(X, pts, cap) {
  let time = 0, cost = 0, len = 0, on = 0, up = 0, down = 0, hPrev = null;
  const hs = [], parts = { path: 0, off: 0, up: 0, down: 0, cross: 0, xn: 0 };
  for (let i = 1; i < pts.length; i++) {
    const s = segment(X, pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1], cap);
    if (!s) return null;
    time += s.time; cost += s.cost; len += s.len; on += s.onPath;
    for (const k in parts) parts[k] += s.parts[k];
    for (const v of s.hs) hs.push(v);
  }
  for (let i = 0; i < hs.length; i++) {
    let s = 0, n = 0;
    for (let d = -4; d <= 4; d++) { const v = hs[i + d]; if (v != null) { s += v; n++; } }
    const v = s / n;
    if (hPrev != null) { if (v > hPrev) up += v - hPrev; else down += hPrev - v; }
    hPrev = v;
  }
  return { time, cost, len, up, down, onPath: len ? on / len : 0, parts };
}

/** A route on the grid pulled tight, its zigzags between the 16 directions taken out: from each point kept, the farthest
 *  later cell reached by a straight line that costs no more than the grid's way there, crosses nothing impassable and keeps
 *  within two cells of it (a shortcut to another route is no tightening). Points in cell units. */
function tighten(X, path, cum) {
  const { nx } = X.G, P = path.map((k) => { const i = k % nx; return [i + 0.5, (k - i) / nx + 0.5]; });
  const close = (i, j) => {
    const [ax, ay] = P[i], [bx, by] = P[j], L = Math.hypot(bx - ax, by - ay) || 1;
    for (let m = i + 1; m < j; m++) if (Math.abs((bx - ax) * (ay - P[m][1]) - (ax - P[m][0]) * (by - ay)) / L > 2) return false;
    return true;
  };
  const out = [P[0]];
  let i = 0;
  while (i < P.length - 1) {
    let best = i + 1, misses = 0;
    for (let j = i + 2; j < P.length && misses < 16; j++) {
      const s = close(i, j) && segment(X, P[i][0], P[i][1], P[j][0], P[j][1], null);
      if (s && s.cost <= cum[j] - cum[i] + 0.05) { best = j; misses = 0; } else misses++;
    }
    out.push(P[best]);
    i = best;
  }
  return out;
}

/** Cells within r cells of the route's cells (a disc around each, the route sampled every r / 2). */
function near(X, path, r, into) {
  const { nx, ny } = X.G, rr = Math.ceil(r);
  for (let q = 0; q < path.length; q += Math.max(1, Math.floor(r / 2))) {
    const k = path[q], i = k % nx, j = (k - i) / nx;
    for (let b = Math.max(0, j - rr); b <= Math.min(ny - 1, j + rr); b++) for (let a = Math.max(0, i - rr); a <= Math.min(nx - 1, i + rr); a++) if ((a - i) ** 2 + (b - j) ** 2 <= r * r) into(b * nx + a);
  }
}

/** The metres between two cells. */
function cellMetres(X, a, b) {
  const { nx } = X.G, ai = a % nx, bi = b % nx, di = bi - ai, dj = (b - bi) / nx - (a - ai) / nx;
  return Math.hypot(di * X.em[0][0] + dj * X.em[1][0], di * X.em[0][1] + dj * X.em[1][1]);
}
/** A search region: the cells whose distances to a and b add up to 2 semi metres at most. */
function ellipse(X, a, b, semi) {
  const { nx, ny } = X.G, ai = a % nx, aj = (a - ai) / nx, bi = b % nx, bj = (b - bi) / nx;
  const mOf = (di, dj) => Math.hypot(di * X.em[0][0] + dj * X.em[1][0], di * X.em[0][1] + dj * X.em[1][1]);
  const R = Math.ceil(semi / X.mpc), ci = (ai + bi) / 2, cj = (aj + bj) / 2;
  const reg = { i0: Math.max(0, Math.floor(ci - R)), j0: Math.max(0, Math.floor(cj - R)), i1: Math.min(nx - 1, Math.ceil(ci + R)), j1: Math.min(ny - 1, Math.ceil(cj + R)) };
  reg.rw = reg.i1 - reg.i0 + 1;
  reg.inside = new Uint8Array(reg.rw * (reg.j1 - reg.j0 + 1));
  for (let j = reg.j0; j <= reg.j1; j++) for (let i = reg.i0; i <= reg.i1; i++) reg.inside[(j - reg.j0) * reg.rw + i - reg.i0] = mOf(i - ai, j - aj) + mOf(i - bi, j - bj) <= 2 * semi ? 1 : 0;
  return reg;
}
/** Whether a route is locally optimal: every stretch of `share` of its length (seven tested) costs at most 1 % (and 1 m) more
 *  than the best way between its ends — a sharp bend in open ground fails. cum: the route's cost, cell by cell. */
function locallyOptimal(X, path, cum, share = 0.3) {
  const total = cum[cum.length - 1], T = share * total;
  for (let w = 1; w <= 7; w++) {
    const mid = (w / 8) * total;
    let u = 0, v = path.length - 1;
    while (u < path.length - 1 && cum[u] < mid - T / 2) u++;
    while (v > 0 && cum[v] > mid + T / 2) v--;
    if (v - u < 4) continue;
    const reg = ellipse(X, path[u], path[v], 0.6 * cellMetres(X, path[u], path[v]) + 3 * X.mpc);
    const q = astar(X, path[u], path[v], reg);
    if (q && measure(X, q).cost * 1.01 + 1 < cum[v] - cum[u]) return false;
  }
  return true;
}

/**
 * The search of a leg between map pixels pa and pb: { routes, dec }. routes: up to s.variants, the best first, each { pts (map
 * px), time (s at 1 s/m), cost, len, up, down, onPath, side, how ("best", "plateau" or "cut") } — side: -1 left of the straight
 * line, 1 right, 0 along it; null when no way was found. dec: the decision map, { i0, j0, rw, rh, T (the cost of the best route
 * through each region cell, Infinity outside), best }.
 */
export function legSearch(X, pa, pb) {
  const { nx, ny, cs } = X.G;
  const cell = (p) => Math.min(ny - 1, Math.max(0, Math.floor(p[1] / cs))) * nx + Math.min(nx - 1, Math.max(0, Math.floor(p[0] / cs)));
  const a = cell(pa), b = cell(pb), L = cellMetres(X, a, b);
  // the region: an ellipse around the leg, wide enough for a detour round a lake or by a track some way off
  const reg = ellipse(X, a, b, 0.75 * L + 150);
  // the controls' own cells always passable: a control on a boulder, by a wall
  const saved = [];
  for (const k0 of [a, b]) near(X, [k0], 3, (k) => { if (!(X.C.f[k] < Infinity)) { saved.push([k, X.C.f[k]]); X.C.f[k] = 2; } });
  try {
    const wantN = Math.max(1, Math.min(4, X.s.variants ?? DEFAULTS.variants)), extra = 1 + (X.s.extra ?? DEFAULTS.extra) / 100;
    const F = tree(X, a, reg, false), B = tree(X, b, reg, true), loc = F.loc;
    const best = F.g[loc(b)];
    if (!(best < Infinity)) return { routes: null, dec: null };
    const { i0, j0, i1, j1, rw } = reg, rh = j1 - j0 + 1, RN = rw * rh;
    const T = new Float32Array(RN);
    for (let l = 0; l < RN; l++) T[l] = reg.inside[l] ? F.g[l] + B.g[l] : Infinity;
    const glob = (l) => (Math.floor(l / rw) + j0) * nx + (l % rw) + i0;
    // the plateaus: the steps u → v both trees take (F reaches v from u, B leaves u by v), chained; a long one is a route of
    // its own — every cell on it lies on the best route through itself
    const next = new Int32Array(RN).fill(-1), hasIn = new Uint8Array(RN);
    for (let l = 0; l < RN; l++) {
      if (!reg.inside[l]) continue;
      const u = F.par[l];
      if (u < 0) continue;
      const lu = loc(u);
      if (B.par[lu] === glob(l)) { next[lu] = l; hasIn[l] = 1; }
    }
    const minPlateau = Math.max(15, 0.1 * L), chains = [];
    for (let l = 0; l < RN; l++) {
      if (next[l] < 0 || hasIn[l]) continue;
      let len = 0, prev = glob(l), first = prev;
      for (let c = l; next[c] >= 0; c = next[c]) { const d = glob(next[c]); len += cellMetres(X, prev, d); prev = d; }
      if (len >= minPlateau && T[l] <= best * extra) chains.push({ cell: first, cost: T[l], len });
    }
    chains.sort((x, y) => y.len - x.len);
    // the cuts: along lines square to the leg at every tenth of it, each valley of the cost through a cell — prominent enough
    // that one must climb 1.5 % of the best (4 s at least) on both sides to reach a lower one — is a corridor of its own; the
    // ridges between them tell which valley a route crosses each line in
    const cuts = [], lines = [];
    const ai = a % nx, aj = (a - ai) / nx, bi = b % nx, bj = (b - bi) / nx, Lc = Math.hypot(bi - ai, bj - aj) || 1;
    const ux = (bi - ai) / Lc, uy = (bj - aj) / Lc, R = Math.ceil((0.75 * L + 150) / X.mpc), prom = Math.max(4, 0.015 * best);
    for (let fr = 0.1; fr < 0.95; fr += 0.1) {
      const cx = ai + fr * (bi - ai), cy = aj + fr * (bj - aj), V = [], K = [];
      for (let t = -R; t <= R; t++) {
        const I = Math.round(cx - uy * t), J = Math.round(cy + ux * t);
        let v = Infinity, k = -1;
        if (I >= i0 && J >= j0 && I <= i1 && J <= j1) { const l = (J - j0) * rw + (I - i0); if (reg.inside[l]) { v = T[l]; k = J * nx + I; } }
        V.push(v); K.push(k);
      }
      const mins = [];
      for (let t = 1; t < V.length - 1; t++) {
        const v = V[t];
        if (!(v <= best * extra) || !(v <= V[t - 1]) || !(v < V[t + 1])) continue;
        let left = v, right = v, lo = true, ro = true;
        for (let u = t - 1; u >= 0; u--) { if (V[u] < v) { lo = false; break; } left = Math.max(left, V[u]); }
        for (let u = t + 1; u < V.length; u++) { if (V[u] < v) { ro = false; break; } right = Math.max(right, V[u]); }
        if (Math.min(lo ? Infinity : left, ro ? Infinity : right) - v >= prom) { cuts.push({ cell: K[t], cost: v }); mins.push(t); }
      }
      const ridges = [];
      for (let m = 1; m < mins.length; m++) { let top = mins[m - 1]; for (let t = mins[m - 1]; t <= mins[m]; t++) if (!(V[t] <= V[top])) top = t; ridges.push(top); }
      if (ridges.length) lines.push({ fr, cx, cy, ridges });
    }
    // a route's valleys: on each line with more than one, the valley it crosses it in (its first crossing)
    const valleys = (q) => {
      const out = new Set();
      for (const ln of lines) {
        const s0 = Lc * ln.fr;
        let prev = null;
        for (const k of q) {
          const i = k % nx, j = (k - i) / nx, s = (i - ai) * ux + (j - aj) * uy;
          if (prev != null && prev < s0 && s >= s0) {
            const t = Math.round((i - ln.cx) * -uy + (j - ln.cy) * ux) + R;
            out.add(`${ln.fr.toFixed(1)}:${ln.ridges.filter((r) => r < t).length}`);
            break;
          }
          prev = s;
        }
      }
      return out;
    };
    // the best route through a cell: the forward tree back to the start, the backward tree on to the control
    const via = (k) => {
      const head = [];
      for (let c = k; c !== -1; c = F.par[loc(c)]) { head.push(c); if (c === a) break; }
      head.reverse();
      for (let c = B.par[loc(k)]; c !== -1; c = B.par[loc(c)]) { head.push(c); if (c === b) break; }
      return head;
    };
    const cands = [{ how: "best", cell: b }, ...chains.slice(0, 1).map((c) => ({ how: "plateau", ...c })),
      ...[...cuts.map((c) => ({ how: "cut", ...c })), ...chains.slice(1).map((c) => ({ how: "plateau", ...c }))].sort((x, y) => x.cost - y.cost)];
    // a choice is kept when it lies for a fifth of it away from the routes kept, and either crosses the leg in a valley none of
    // them crosses it in and is locally optimal over 30 % stretches, or lies for 30 % of it apart and is locally optimal over
    // half of it — the straight way beside a track is a choice, a mere arc through uniform forest (the best route's valley,
    // and a bend) is not
    const corridor = Math.max(20, 0.12 * L) / X.mpc, seen = new Uint8Array(nx * ny), found = [], used = new Set();
    const until = Date.now() + 20000;                   // the choices' checks stop after 20 s
    for (const c of cands) {
      if (found.length >= wantN || (found.length && Date.now() > until)) break;
      const q = via(c.cell), vs = valleys(q);
      let out = 0;
      for (const k of q) if (!seen[k]) out++;
      if (found.length && out / q.length < 0.2) continue;
      const m = measure(X, q);
      if (found.length && m.cost > best * extra) continue;
      const fresh = [...vs].some((v) => !used.has(v));
      if (found.length && !(fresh ? locallyOptimal(X, q, m.cum, 0.3) : out / q.length >= 0.3 && locallyOptimal(X, q, m.cum, 0.5))) continue;
      found.push({ cells: q, cum: m.cum, how: c.how });
      for (const v of vs) used.add(v);
      near(X, q, corridor, (k) => { seen[k] = 1; });
    }
    // each pulled tight and measured off the grid, as a runner's route is
    const routes = found.map((r) => {
      const P = tighten(X, r.cells, r.cum), m = polyline(X, P, 4);
      const pts = P.map(([x, y]) => [x * cs, y * cs]);
      pts[0] = [pa[0], pa[1]]; pts[pts.length - 1] = [pb[0], pb[1]];
      return { pts, ...m, how: r.how, side: sideOf(pts, pa, pb) };
    }).sort((x, y) => x.cost - y.cost);
    return { routes, dec: { i0, j0, rw, rh, T, best, cs } };
  } finally { for (const [k, v] of saved) X.C.f[k] = v; }
}
/** The routes alone (legSearch's). */
export const legRoutes = (X, pa, pb) => legSearch(X, pa, pb).routes;

/** The side a route passes the straight line on: the signed area between them against the leg's length squared. */
function sideOf(pts, pa, pb) {
  let area = 0, dev = 0;
  const ux = pb[0] - pa[0], uy = pb[1] - pa[1], l2 = ux * ux + uy * uy || 1;
  for (let i = 1; i < pts.length; i++) {
    const c1 = ((pts[i - 1][0] - pa[0]) * uy - (pts[i - 1][1] - pa[1]) * ux), c2 = ((pts[i][0] - pa[0]) * uy - (pts[i][1] - pa[1]) * ux);
    const t1 = ((pts[i - 1][0] - pa[0]) * ux + (pts[i - 1][1] - pa[1]) * uy) / l2, t2 = ((pts[i][0] - pa[0]) * ux + (pts[i][1] - pa[1]) * uy) / l2;
    area += ((c1 + c2) / 2) * (t2 - t1);
    dev = Math.max(dev, Math.abs(c2) / Math.sqrt(l2));
  }
  return dev < 0.08 * Math.sqrt(l2) || Math.abs(area) / l2 < 0.02 ? 0 : area > 0 ? -1 : 1;
}

/**
 * The decision map as an image, one pixel a region cell: the time lost going through each point against the best route —
 * dark green on a best route, through lighter green and yellow to orange at the variants' limit (extra, %), nothing beyond.
 */
export function decisionPicture(dec, extra) {
  const { rw, rh, T, best } = dec, out = new Uint8ClampedArray(rw * rh * 4), lim = Math.max(0.01, extra / 100);
  const stops = [[0, [0, 104, 55]], [0.15, [26, 152, 80]], [0.4, [166, 217, 106]], [0.7, [254, 224, 139]], [1, [244, 109, 67]]];
  for (let l = 0; l < rw * rh; l++) {
    const e = T[l] / best - 1;
    if (!(e <= lim)) continue;
    const t = Math.max(0, e / lim);
    let s = 1;
    while (s < stops.length - 1 && stops[s][0] < t) s++;
    const [t0, c0] = stops[s - 1], [t1, c1] = stops[s], f = Math.min(1, Math.max(0, (t - t0) / (t1 - t0)));
    for (let c = 0; c < 3; c++) out[4 * l + c] = c0[c] + f * (c1[c] - c0[c]);
    out[4 * l + 3] = 230 - 130 * t;
  }
  return out;
}

/**
 * Any route (a runner's, in map px) measured on the same model: time (s at 1 s/m), cost, len, up, down, onPath. An impassable
 * cell crossed (a misread colour, the GPS's noise) counts as four times white forest.
 */
export function lineRoute(X, pts) {
  const cs = X.G.cs;
  return polyline(X, pts.map(([x, y]) => [x / cs, y / cs]), 4);
}

/**
 * A runner's route on a leg as the model runs it (owner, 2026-11-01: a trace a few metres beside a track, the GPS's error and
 * the calibration's, was measured in the forest and cost 44 s more than the route it followed): the fastest way from control
 * pa to control pb within tolM metres of the trace pts (map px) — on the track when the trace runs along it. Then its share
 * along each of the leg's routes (their pts, map px): the share of its length within tolM of that route. Returns the route
 * measured as legSearch's are ({ pts, time, cost, len, up, down, onPath }) with shares [0-1 per route], or the trace itself
 * measured (snapped false) when no way keeps within the corridor.
 */
export function matchRoute(X, pa, pb, pts, tolM, routes = []) {
  const { nx, ny, cs } = X.G;
  const cell = (p) => Math.min(ny - 1, Math.max(0, Math.floor(p[1] / cs))) * nx + Math.min(nx - 1, Math.max(0, Math.floor(p[0] / cs)));
  const a = cell(pa), b = cell(pb);
  // the trace's cells every half cell, from the start control to the finish control
  const line = [], seq = [pa, ...pts, pb];
  for (let i = 1; i < seq.length; i++) {
    const [x0, y0] = seq[i - 1], [x1, y1] = seq[i], n = Math.max(1, Math.ceil((Math.hypot(x1 - x0, y1 - y0) * 2) / cs));
    for (let s = 0; s <= n; s++) { const k = cell([x0 + ((x1 - x0) * s) / n, y0 + ((y1 - y0) * s) / n]); if (line[line.length - 1] !== k) line.push(k); }
  }
  const saved = [];
  for (const k0 of [a, b]) near(X, [k0], 3, (k) => { if (!(X.C.f[k] < Infinity)) { saved.push([k, X.C.f[k]]); X.C.f[k] = 2; } });
  let q = null;
  try {
    // the corridor, widened once if the trace crosses what the model takes for impassable
    for (const f of [1, 2]) { q = astar(X, a, b, around(X, line, (f * tolM) / X.mpc)); if (q) break; }
  } finally { for (const [k, v] of saved) X.C.f[k] = v; }
  let P, m, snapped = !!q;
  if (q) { P = tighten(X, q, measure(X, q).cum); m = polyline(X, P, 4); }
  else { P = seq.map(([x, y]) => [x / cs, y / cs]); m = polyline(X, P, 4); }
  const out = P.map(([x, y]) => [x * cs, y * cs]);
  // its share along each route: points every ~2 m, within tolM of the route's polyline
  const ppm = cs / X.mpc, tol = tolM * ppm;
  const samples = [];
  for (let i = 1; i < out.length; i++) {
    const [x0, y0] = out[i - 1], [x1, y1] = out[i], n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / (2 * ppm)));
    for (let s = 0; s < n; s++) samples.push([x0 + ((x1 - x0) * (s + 0.5)) / n, y0 + ((y1 - y0) * (s + 0.5)) / n]);
  }
  const dist = (p, poly) => {
    let d = Infinity;
    for (let i = 1; i < poly.length; i++) {
      const [ax, ay] = poly[i - 1], [bx, by] = poly[i], ux = bx - ax, uy = by - ay, l2 = ux * ux + uy * uy;
      const t = l2 ? Math.max(0, Math.min(1, ((p[0] - ax) * ux + (p[1] - ay) * uy) / l2)) : 0;
      d = Math.min(d, Math.hypot(ax + t * ux - p[0], ay + t * uy - p[1]));
    }
    return d;
  };
  const shares = routes.map((r) => (samples.length ? samples.filter((p) => dist(p, r) <= tol).length / samples.length : 0));
  return { pts: out, ...m, shares, snapped };
}
/** A search region: the cells within r cells of a route's cells. */
function around(X, path, r) {
  const { nx } = X.G, rr = Math.ceil(r);
  let i0 = Infinity, j0 = Infinity, i1 = -1, j1 = -1;
  for (const k of path) { const i = k % nx, j = (k - i) / nx; i0 = Math.min(i0, i); i1 = Math.max(i1, i); j0 = Math.min(j0, j); j1 = Math.max(j1, j); }
  const reg = { i0: Math.max(0, i0 - rr), j0: Math.max(0, j0 - rr), i1: Math.min(nx - 1, i1 + rr), j1: Math.min(X.G.ny - 1, j1 + rr) };
  reg.rw = reg.i1 - reg.i0 + 1;
  reg.inside = new Uint8Array(reg.rw * (reg.j1 - reg.j0 + 1));
  const step = Math.max(1, Math.floor(r / 2));
  for (let q = 0; q < path.length; q += step) {
    const k = path[q], ci = k % nx, cj = (k - ci) / nx;
    for (let j = Math.max(reg.j0, cj - rr); j <= Math.min(reg.j1, cj + rr); j++) for (let i = Math.max(reg.i0, ci - rr); i <= Math.min(reg.i1, ci + rr); i++) {
      if ((i - ci) ** 2 + (j - cj) ** 2 <= r * r) reg.inside[(j - reg.j0) * reg.rw + i - reg.i0] = 1;
    }
  }
  // the last cell too, whatever the step
  const k = path[path.length - 1], ci = k % nx, cj = (k - ci) / nx;
  for (let j = Math.max(reg.j0, cj - rr); j <= Math.min(reg.j1, cj + rr); j++) for (let i = Math.max(reg.i0, ci - rr); i <= Math.min(reg.i1, ci + rr); i++) if ((i - ci) ** 2 + (j - cj) ** 2 <= r * r) reg.inside[(j - reg.j0) * reg.rw + i - reg.i0] = 1;
  return reg;
}

// ---- 6. tours through many controls (the Tracer's controller's tour, 2026-11-07) -------------------------------------------
/** The cells within 3 cells of each given cell made passable for a while (a control on a boulder, by a wall); returns the undo. */
export function freeCells(X, list) {
  const saved = [];
  for (const k0 of list) near(X, [k0], 3, (k) => { if (!(X.C.f[k] < Infinity)) { saved.push([k, X.C.f[k]]); X.C.f[k] = 2; } });
  return () => { for (let i = saved.length - 1; i >= 0; i--) X.C.f[saved[i][0]] = saved[i][1]; };
}
/** A map pixel's cell. */
export function cellOf(X, p) {
  const { nx, ny, cs } = X.G;
  return Math.min(ny - 1, Math.max(0, Math.floor(p[1] / cs))) * nx + Math.min(nx - 1, Math.max(0, Math.floor(p[0] / cs)));
}
/**
 * The costs from one cell to others over the whole grid: a Dijkstra stopped once the targets of `want` (their indexes) are all
 * reached — those met on the way are kept too — or past `cap` (cost units: seconds at 1 s/m of white forest, the caution in).
 * targets: cells. Returns per target [cost, time] (Infinity: not reached). S: scratch arrays kept between calls.
 */
export function costsFrom(X, src, targets, want, cap, S) {
  const { nx, ny } = X.G, N = nx * ny;
  if (!S.g || S.g.length !== N) { S.g = new Float64Array(N).fill(Infinity); S.tm = new Float64Array(N); S.done = new Uint8Array(N); S.touched = new Int32Array(1 << 16); }
  const { g, tm, done } = S;
  let nt = 0;
  const at = new Map();
  targets.forEach((k, i) => { if (!at.has(k)) at.set(k, []); at.get(k).push(i); });
  const wanted = new Set(want), out = targets.map(() => [Infinity, Infinity]);
  // the step's cost written out (no array a step, no destructuring: this loop runs millions of times)
  const f = X.C.f, rk = X.C.r, h = X.h, len = X.len, climb = X.s.climb ?? DEFAULTS.climb, cr = X.C.cross, xp = X.C.xp;
  const H = new Heap();
  g[src] = 0; tm[src] = 0; S.touched[nt++] = src; H.push(0, src);
  while (H.n) {
    const k = H.pop();
    if (done[k]) continue;
    done[k] = 1;
    const gk = g[k];
    if (gk > cap) break;
    const hits = at.get(k);
    if (hits) for (const i of hits) { out[i] = [gk, tm[k]]; wanted.delete(i); }
    if (!wanted.size) break;
    const fa = f[k];
    if (!(fa < Infinity)) continue;
    const i = k % nx, j = (k - i) / nx;
    for (let n = 0; n < 16; n++) {
      const dx = DX[n], dy = DY[n], I = i + dx, J = j + dy;
      if (I < 0 || J < 0 || I >= nx || J >= ny) continue;
      const q = J * nx + I;
      if (done[q]) continue;
      const fb = f[q];
      if (!(fb < Infinity)) continue;
      // squeezing between blocked cells: a diagonal between two, a knight's move over one
      if (n >= 4) {
        if (n < 8) { if (!(f[k + dx] < Infinity) && !(f[k + dy * nx] < Infinity)) continue; }
        else {
          const sx = dx > 0 ? 1 : -1, sy = dy > 0 ? 1 : -1, m1 = dx === 2 || dx === -2 ? k + sx : k + sy * nx;
          if (!(f[m1] < Infinity) || !(f[k + sy * nx + sx] < Infinity)) continue;
        }
      }
      const L = len[n], t1 = L * ((fa + fb) / 2) * (h ? slopeFactor((h[q] - h[k]) / L, climb) : 1);
      const x = cr && !cr[k] && (cr[q] || n >= 4) && crosses(cr, nx, k, q, n) ? xp : 0;
      const v = gk + t1 * ((rk[k] + rk[q]) / 2) + x;
      if (v < g[q]) {
        if (g[q] === Infinity) { if (nt === S.touched.length) { const t2 = new Int32Array(nt * 2); t2.set(S.touched); S.touched = t2; } S.touched[nt++] = q; }
        g[q] = v; tm[q] = tm[k] + t1 + x; H.push(v, q);
      }
    }
  }
  for (let m = 0; m < nt; m++) { const k = S.touched[m]; g[k] = Infinity; done[k] = 0; }
  return out;
}
const DX = Int8Array.from(NB, (d) => d[0]), DY = Int8Array.from(NB, (d) => d[1]);
/**
 * The best route between two map pixels alone (no variants, no decision map: a tour has many legs): A* over an ellipse round
 * the leg, else over the whole grid, pulled tight and measured as legSearch's routes. { pts (map px), time, cost, len, up, down,
 * onPath } or null.
 */
export function bestPath(X, pa, pb) {
  const { nx, ny, cs } = X.G, a = cellOf(X, pa), b = cellOf(X, pb);
  if (a === b) return { pts: [pa, pb], time: 0, cost: 0, len: 0, up: 0, down: 0, onPath: 0 };
  let q = astar(X, a, b, ellipse(X, a, b, 0.75 * cellMetres(X, a, b) + 150));
  if (!q) {
    const reg = { i0: 0, j0: 0, i1: nx - 1, j1: ny - 1, rw: nx, inside: new Uint8Array(nx * ny).fill(1) };
    q = astar(X, a, b, reg);
  }
  if (!q) return null;
  const P = tighten(X, q, measure(X, q).cum), m = polyline(X, P, 4);
  if (!m) return null;
  return { pts: P.map(([x, y]) => [x * cs, y * cs]), time: m.time, cost: m.cost, len: m.len, up: m.up, down: m.down, onPath: m.onPath };
}
/**
 * The setter's own objects closed on the cells (map px): areas out of bounds (rings, filled even-odd) and lines not to be
 * crossed — the Tracer keeps them apart from the map, which an image map's colours cannot say.
 */
export function forbidCells(G, areas = [], lines = []) {
  const { nx, ny, cs } = G, M = nx * ny;
  for (const ring of areas) {
    if (!ring || ring.length < 3) continue;
    const P = ring.map(([x, y]) => [x / cs, y / cs]);
    const ys = P.map((p) => p[1]), j0 = Math.max(0, Math.floor(Math.min(...ys))), j1 = Math.min(ny - 1, Math.ceil(Math.max(...ys)));
    for (let j = j0; j <= j1; j++) {
      const y = j + 0.5, xs = [];
      for (let m = 0; m < P.length; m++) {
        const [x1, y1] = P[m], [x2, y2] = P[(m + 1) % P.length];
        if ((y1 <= y && y2 > y) || (y2 <= y && y1 > y)) xs.push(x1 + ((y - y1) * (x2 - x1)) / (y2 - y1));
      }
      xs.sort((u, v) => u - v);
      for (let m = 0; m + 1 < xs.length; m += 2) {
        for (let i = Math.max(0, Math.ceil(xs[m] - 0.5)); i <= Math.min(nx - 1, Math.floor(xs[m + 1] - 0.5)); i++) {
          const k = j * nx + i;
          G.cls[k] = A.OOB; G.path[k] = 0; if (G.raw) G.raw[k] = 0;
        }
      }
    }
  }
  if (lines.some((l) => l && l.length >= 2)) {
    if (!G.block) G.block = new Uint8Array(M);
    for (const l of lines) for (let m = 1; m < (l?.length || 0); m++) {
      const [x0, y0] = l[m - 1].map((v) => v / cs), [x1, y1] = l[m].map((v) => v / cs), n = Math.max(1, Math.ceil(2 * Math.hypot(x1 - x0, y1 - y0)));
      for (let s = 0; s <= n; s++) {
        const i = Math.floor(x0 + ((x1 - x0) * s) / n), j = Math.floor(y0 + ((y1 - y0) * s) / n);
        if (i >= 0 && j >= 0 && i < nx && j < ny) { const k = j * nx + i; G.block[k] = 1; G.path[k] = 0; if (G.raw) G.raw[k] = 0; }
      }
    }
  }
}

/** The colours of the terrain as read, for a picture of the cells (RGBA, one pixel a cell): the areas, the three path kinds,
 *  a black line that blocks, a north line taken out. */
export const CLASS_RGB = [[255, 255, 255], [255, 186, 54], [255, 228, 150], [196, 234, 180], [120, 200, 100], [40, 140, 60], [40, 120, 230], [140, 190, 245], [205, 160, 110], [130, 130, 20], [70, 40, 110], [150, 150, 150], [80, 170, 190]];
export const PATH_RGB = [null, [255, 120, 160], [230, 30, 60], [130, 0, 30]];
export const BLOCK_RGB = [0, 0, 0], NORTH_RGB = [0, 200, 220], BAND_RGB = [200, 0, 140], CROSS_RGB = [235, 110, 0];
export const SLOW_RGB = [null, [190, 165, 135], [150, 120, 90], [105, 80, 55]];
/** The legend: [key, rgb] — the areas' keys as the speeds' (routeplan.js words them). */
export const LEGEND = [["track", PATH_RGB[3]], ["path", PATH_RGB[2]], ["small", PATH_RGB[1]], ["block", BLOCK_RGB], ["white", CLASS_RGB[A.WHITE]],
  ["open", CLASS_RGB[A.OPEN]], ["rough", CLASS_RGB[A.ROUGH]], ["g1", CLASS_RGB[A.G1]], ["g2", CLASS_RGB[A.G2]], ["g3", CLASS_RGB[A.G3]],
  ["marsh", CLASS_RGB[A.MARSH]], ["water", CLASS_RGB[A.WATER]], ["shallow", CLASS_RGB[A.SHALLOW]], ["paved", CLASS_RGB[A.PAVED]],
  ["grey", CLASS_RGB[A.GREY]], ["building", CLASS_RGB[A.BUILDING]], ["oob", CLASS_RGB[A.OOB]], ["band", BAND_RGB], ["north", NORTH_RGB],
  ["cross", CROSS_RGB, "vector"], ["slow1", SLOW_RGB[1], "vector"], ["slow2", SLOW_RGB[2], "vector"], ["slow3", SLOW_RGB[3], "vector"]];
export function picture(X) {
  const { nx, ny, cls, path } = X.G, raw = X.G.raw || path, out = new Uint8ClampedArray(nx * ny * 4);
  for (let k = 0; k < nx * ny; k++) {
    const ov = X.G.over?.[k], rel = X.G.release?.[k];
    const c = ov === 2 && !rel ? BAND_RGB : ov === 1 && rel !== 1 ? CLASS_RGB[A.OOB] : X.C.isPath[k] ? PATH_RGB[path[k]] : (raw[k] || X.G.block?.[k]) && !(X.C.f[k] < Infinity) ? BLOCK_RGB
      : X.G.cross?.[k] ? CROSS_RGB : X.G.north?.[k] ? NORTH_RGB : X.G.slow?.[k] && cls[k] !== A.BUILDING && cls[k] !== A.WATER ? SLOW_RGB[X.G.slow[k]] : CLASS_RGB[cls[k]];
    out[4 * k] = c[0]; out[4 * k + 1] = c[1]; out[4 * k + 2] = c[2]; out[4 * k + 3] = 255;
  }
  return out;
}
