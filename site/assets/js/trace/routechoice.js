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
const I_PURPLE = 20, I_BLACK = 21, I_GREY = 22, I_BROWN = 23, I_BLUE = 24, I_OLIVE = 25, I_ERASED = 26, I_MIXED = 27, I_LILAC = 28;
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
/** The time multipliers under the course's own printed lines on an image (G.inkBand): crossed, not followed — a circle's [1]
 *  more than a leg's [2], a route through another control's circle being the blend's way through its gardens (the Quiberon
 *  photo's control 3), a leg's line crossed by every route along a street. */
export const INK_SLOW = [1, 5, 2];

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
  // a dark reddish brown is ink of the course (a photo whose purple went dark: the Quiberon and Auray sprint photos, 90-130 at
  // their brightest) or a contour, never a black wall or path: read as black, the course's legs and circles were walls that cut
  // the streets, and opening the black under them opened the fences and walls they cross (2026-11-18). The same photos print the
  // walls and fences darker (under 60), with the same red cast
  if (max >= 75 && max < 140 && r === max && r - (g > b ? g : b) > 0.3 * max) return I_BROWN;
  if (max < 95 && span < 60) return I_BLACK;
  if (span < 24) return min > 220 ? A.WHITE : max < 95 ? I_BLACK : I_GREY;
  let hue = max === r ? 60 * ((g - b) / span) : max === g ? 60 * ((b - r) / span + 2) : 60 * ((r - g) / span + 4);
  if (hue < 0) hue += 360;
  if (hue >= 170 && hue < 260) return I_BLUE;
  if (hue >= 70 && hue < 170) {                        // the greens by their depth: the lighter red and blue, the lighter green
    // a sprint map's buildings photographed among the olive come out a green-tinted grey, which the paper's levelling tints
    // further (the Quiberon photo: 127 143 130 → 152 181 162): read as vegetation, passable, the routes ran through the houses
    // (2026-11-18). On a sprint map a green of little colour is grey; the map's own greens are strong (≥ 0.3 of their brightness)
    if (ol?.sprint && span < 0.22 * max) return min > 220 ? A.WHITE : I_GREY;
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
      // on a sprint map read from a scan a colour both greener and much brighter than its own olive is its pale green (vegetation,
      // slow running): nearer olive than yellow on hue alone, it shut a pale green strip of the third Auray scan (209 215 102, 63°
      // where its olive is 57° and 174 bright; 2026-11-23). Not on a photo: the light falls unevenly there, and a lit olive is
      // brighter than that (the Auray photos' olive went pale green and their routes ran through the gardens)
      if (ol.sharp && hue >= ol.oh + 5 && max >= ol.om + 35) return A.G1;
      // and one far brighter than its olive, whatever its hue, is a yellow (open land, rough open): a pale yellow of olive's hue
      // (247 240 125, 57° on the second Auray scan, 72 above its olive) shut the metre-wide passage down to control 14
      // (and, on a scan, one as bright as the paper and yellower than its olive: olive ink is never that bright on a scan — the
      // Quiberon scan's olive is 217 bright, its open land 255 226 54 at 51° came nearer olive than its yellows and shut the strip
      // where control 13 stands, 2026-11-25)
      if (ol.sharp && (max >= ol.om + 50 || (max >= 245 && hue < ol.oh - 3))) { const y = (max - b) / max; return y > 0.55 ? A.OPEN : y > 0.15 ? A.ROUGH : A.WHITE; }
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
  // a sprint map's pale lilac tint is the organisers' out-of-bounds area printed solid (the Quiberon photo's, 234 187 222 once
  // levelled): an ink of its own, an area once thick (classify); the course's purple is strong (2026-11-18)
  if (ol?.sprint && min >= 165) return I_LILAC;
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
    const c2 = s.map((q, k) => (q[2] ? [q[0] / q[2], q[1] / q[2], q[2]] : c[k]));
    const same = c2.every((q, k) => q[0] === c[k][0] && q[1] === c[k][1] && q[2] === c[k][2]);
    c = c2;
    if (same) break;                                   // settled: the passes left would change nothing
  }
  const [y, o] = c[0][1] >= c[1][1] ? c : [c[1], c[0]];
  // (or two colours well apart in hue, the greener one the darker: a scan whose olive is light — 60° and 217 bright against a
  // yellow at 42° and 225 on the first Auray scan — failed the brightness test, and its gardens, judged by fixed limits, read
  // as open land wherever the scan was a little lighter: 2026-11-24)
  if (((o[1] < 205 && y[1] - o[1] >= 40) || (o[0] - y[0] >= 10 && o[1] < 230)) && o[2] >= 0.1 * H.length && y[2] >= 0.1 * H.length) Object.assign(out, { oh: o[0], om: o[1], yh: y[0], ym: y[1] });
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

/** Erosion (all) or dilation (any) of a binary mask by a (2k + 1) square, separable (outside = 0): the rows by their runs
 *  of ones — a run loses k at each end, or gains them —, the columns in one pass down the image, a count per column (the ones in
 *  a row above each pixel for the erosion, the last row with a one for the dilation). The same result as counting each
 *  window, a third of the time (a 300 dpi scan asks for it fifty times). */
function morph(m, w, h, k, erode) {
  const tmp = new Uint8Array(w * h), out = new Uint8Array(w * h), win = 2 * k + 1;
  // four pixels at a time where the mask is empty (most masks are: one ink's thick parts)
  const m32 = m.byteOffset % 4 === 0 ? new Uint32Array(m.buffer, m.byteOffset, (w * h) >> 2) : null;
  for (let y = 0; y < h; y++) {
    const r = y * w, end = r + w;
    for (let i = r; i < end; i++) {
      if (!m[i]) { if (m32 && !(i & 3)) { let q = i; while (q + 8 <= end && !m32[q >> 2]) q += 4; if (q > i) i = q - 1; } continue; }
      let j = i + 1;
      while (j < end && m[j]) j++;                     // a run of ones [i, j)
      if (erode) { if (j - i >= win) tmp.fill(1, i + k, j - k); }
      else tmp.fill(1, Math.max(r, i - k), Math.min(end, j + k));
      i = j;
    }
  }
  if (erode) {
    const run = new Int32Array(w);                     // the ones in a row above (and at) each pixel of the current row
    for (let y = 0; y < h; y++) {
      const r = y * w, o = (y - k) * w;
      if (y >= win - 1) { for (let x = 0; x < w; x++) { const n = tmp[r + x] ? run[x] + 1 : 0; run[x] = n; if (n >= win) out[o + x] = 1; } }
      else for (let x = 0; x < w; x++) run[x] = tmp[r + x] ? run[x] + 1 : 0;
    }
    return out;
  }
  const last = new Int32Array(w).fill(-win - 1);       // the last row (up to y + k) with a one, per column
  for (let y = -k; y < h; y++) {
    const yr = y + k;
    if (yr < h) for (let x = 0, r = yr * w; x < w; x++) if (tmp[r + x]) last[x] = yr;
    if (y >= 0) { const lim = y - k; for (let x = 0, o = y * w; x < w; x++) if (last[x] >= lim) out[o + x] = 1; }
  }
  return out;
}

/** Connected components (8-neighbours) of a binary mask: labels (0 = none) and, per label, size, bounding box and, with
 *  `moments`, the sums of x, y, x², y², xy (for its main direction). */
function components(m, w, h, moments = false) {
  const N = w * h, lab = new Int32Array(N), stack = new Int32Array(N), comps = [null];
  for (let s = 0; s < N; s++) {
    if (!m[s] || lab[s]) continue;
    const id = comps.length;
    let top = 0, n = 0, x0 = w, y0 = h, x1 = 0, y1 = 0, sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0;
    stack[top++] = s; lab[s] = id;
    while (top) {
      const i = stack[--top], x = i % w, y = (i - x) / w;
      n++; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      if (moments) { sx += x; sy += y; sxx += x * x; syy += y * y; sxy += x * y; }
      const l = x > 0, r = x < w - 1;
      let j;
      if (y > 0) {
        j = i - w;
        if (l && m[j - 1] && !lab[j - 1]) { lab[j - 1] = id; stack[top++] = j - 1; }
        if (m[j] && !lab[j]) { lab[j] = id; stack[top++] = j; }
        if (r && m[j + 1] && !lab[j + 1]) { lab[j + 1] = id; stack[top++] = j + 1; }
      }
      if (l && m[i - 1] && !lab[i - 1]) { lab[i - 1] = id; stack[top++] = i - 1; }
      if (r && m[i + 1] && !lab[i + 1]) { lab[i + 1] = id; stack[top++] = i + 1; }
      if (y < h - 1) {
        j = i + w;
        if (l && m[j - 1] && !lab[j - 1]) { lab[j - 1] = id; stack[top++] = j - 1; }
        if (m[j] && !lab[j]) { lab[j] = id; stack[top++] = j; }
        if (r && m[j + 1] && !lab[j + 1]) { lab[j + 1] = id; stack[top++] = j + 1; }
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
function northLines(kind, rgba, w, h, mpp, nmask, inks = [I_BLUE, I_BLACK]) {
  const found = [];
  const maxRun = Math.max(3, Math.round(4 / mpp)), hw = Math.ceil(maxRun / 2) + 1;   // up to 4 m: 0.27 mm at 1:10 000 drawn smooth
  const NA = 161, deg = Math.PI / 180, cs = new Float64Array(NA), sn = new Float64Array(NA);
  for (let a = 0; a < NA; a++) { const th = (-16 + 0.2 * a) * deg; cs[a] = Math.cos(th); sn[a] = Math.sin(th); }
  const R0 = Math.ceil(h * Math.sin(16 * deg)) + 3, NR = w + 2 * R0;
  const xAt = (a, rho, y) => (rho - R0 + y * sn[a]) / cs[a];
  // a photo's blue north lines are often so pale that most of their pixels read as paper: the vote takes any bluish pixel
  const bluish = (i) => { const p = 4 * i, r = rgba[p], g = rgba[p + 1], b = rgba[p + 2]; return b >= r + 8 && b >= g + 3 && b - Math.min(r, g) <= 0.75 * b; };
  for (const ink of inks) {
    if (found.length) break;
    const acc = new Int32Array(NA * NR);
    // the ink's pixels, once (and `near`: those with ink within hw along their row — what a line's search asks at each row)
    const onM = new Uint8Array(w * h), near = new Uint8Array(w * h);
    if (ink === I_BLUE) { for (let i = 0; i < onM.length; i++) if (kind[i] === I_BLUE || (kind[i] < 20 && bluish(i))) onM[i] = 1; }
    else for (let i = 0; i < onM.length; i++) if (kind[i] === I_BLACK) onM[i] = 1;
    const on = (i) => onM[i] === 1;
    for (let y = 0; y < h; y++) {
      const row = y * w, end = row + w;
      for (let i = row; i < end; i++) {
        if (!onM[i]) continue;
        let j = i + 1;
        while (j < end && onM[j]) j++;
        near.fill(1, Math.max(row, i - hw), Math.min(end, j + hw));
        i = j;
      }
    }
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
    // each line's ink along it: the rows where it is there, and how far apart the first and the last (kept by line: the family's
    // search asks for the same lines again and again — 25 s on a scan)
    const seen = new Map();
    const along = (p) => {
      if (p.n != null) return p;
      const key = p.a * NR + p.r, got = seen.get(key);
      if (got) { p.n = got.n; p.span = got.span; return p; }
      let n = 0, y0 = -1, y1 = -1;
      for (let y = 0; y < h; y++) {
        const xc = Math.round(xAt(p.a, p.r, y));
        let hit = false;
        if (xc >= 0 && xc < w) hit = near[y * w + xc] === 1;
        else for (let x = Math.max(0, xc - hw); x <= Math.min(w - 1, xc + hw) && !hit; x++) if (onM[y * w + x]) hit = true;
        if (hit) { n++; if (y0 < 0) y0 = y; y1 = y; }
      }
      p.n = n; p.span = y1 - y0;
      seen.set(key, { n, span: p.span });
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
    // on a sprint map only a strong purple: the pink blends of a dark course line with a lilac lane were closed into an
    // out-of-bounds block across it (the Quiberon photo's start, 2026-11-18)
    if (kind[i] === I_PURPLE) { if (sc >= 1 || Math.max(r, g, b) - Math.min(r, g, b) >= 0.35 * Math.max(r, g, b)) O[i] = 1; }
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
  const ol = { ...oliveModel(rgba, w, h), sprint: opt.map === "sprint", sharp: opt.map === "sprint" && 1.6 / mpp >= 4 };
  for (let i = 0, p = 0; i < N; i++, p += 4) kind[i] = rgba[p + 3] < 128 ? A.WHITE : kindOf(rgba[p], rgba[p + 1], rgba[p + 2], ol);
  progress(0.3);
  const north = new Uint8Array(N);
  // one family of north lines a map, blue ones first, upright then across the page (a map printed or scanned on its side: the
  // Auray scan, its blue lines left in cut every lane they cross — 2026-11-22), black ones only where there is no blue: a scan's
  // walls and outlines that happen to line up made « families » of black lines 65-77 m apart, upright, whose erasure cut walls all
  // down the page and kept the blue lines across it from being looked for (the three Morbihan scans; a park's wall the routes went
  // through, 2026-11-23)
  let nlines = [], kt = null, rt = null;
  const across = (inks) => {
    if (!kt) {
      kt = new Uint8Array(N); rt = new Uint8ClampedArray(4 * N);
      for (let y = 0; y < h; y++) for (let x = 0, i = y * w; x < w; x++, i++) { const j = x * h + y, p = 4 * i, q = 4 * j; kt[j] = kind[i]; rt[q] = rgba[p]; rt[q + 1] = rgba[p + 1]; rt[q + 2] = rgba[p + 2]; rt[q + 3] = rgba[p + 3]; }
    }
    const nt = new Uint8Array(N), got = northLines(kt, rt, h, w, mpp, nt, inks);
    if (got.length) for (let y = 0; y < h; y++) for (let x = 0, i = y * w; x < w; x++, i++) { const j = x * h + y; if (nt[j]) { kind[i] = kt[j]; north[i] = 1; } }
    return got.map((l) => ({ ...l, across: true }));
  };
  for (const ink of [I_BLUE, I_BLACK]) {
    nlines = northLines(kind, rgba, w, h, mpp, north, [ink]);
    if (!nlines.length) nlines = across([ink]);
    if (nlines.length) break;
  }
  // a dark brown read on the levelled photo is told from a wall on the photo as taken: the levelling lifts a wall's 51 above the
  // course ink's threshold (kindOf), and the walls of the Auray MD photo came out course ink, with gaps the routes went through
  if (rgba !== rgba0) for (let i = 0, p = 0; i < N; i++, p += 4) if (kind[i] === I_BROWN && Math.max(rgba0[p], rgba0[p + 1], rgba0[p + 2]) < 70) kind[i] = I_BLACK;
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
  const thickOf = (test, decide, keep = null, kk = k, least = minArea, edges = false) => {   // keep: the kinds that take the area (default: all the test's)
    const m = new Uint8Array(N);
    for (let i = 0; i < N; i++) if (test(kind[i], i)) m[i] = 1;
    const open = morph(morph(m, w, h, kk, true), w, h, kk, false);
    for (let i = 0; i < N; i++) open[i] &= m[i];
    const { lab, comps } = components(open, w, h);
    // pixels, black ones, red, purple ones, green, blue, olive ones; with `edges`, its edge's pixels, those within 2 px of a dark one
    // and those within 4 px of a house's grey
    const stats = comps.map(() => [0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    for (let i = 0; i < N; i++) if (lab[i]) { const s = stats[lab[i]]; s[0]++; if (kind[i] === I_BLACK) s[1]++; s[2] += rgba[4 * i]; if (kind[i] === I_PURPLE) s[3]++; s[4] += rgba[4 * i + 1]; s[5] += rgba[4 * i + 2]; if (kind[i] === I_OLIVE) s[6]++; }
    if (edges) for (let y = 2; y < h - 2; y++) for (let x = 2; x < w - 2; x++) {
      const i = y * w + x, id = lab[i];
      if (!id || (lab[i - 1] === id && lab[i + 1] === id && lab[i - w] === id && lab[i + w] === id)) continue;
      const s = stats[id];
      s[7]++;
      let dark = false, house = false;
      // (dark: a black line blended with the yellow beside it reads dark brown)
      for (let dy = -2; dy <= 2 && !dark; dy++) for (let dx = -2; dx <= 2; dx++) { const q = 4 * (i + dy * w + dx); if (Math.max(rgba[q], rgba[q + 1], rgba[q + 2]) < 130) { dark = true; break; } }
      for (let dy = -4; dy <= 4 && !house && y + dy >= 0 && y + dy < h; dy++) for (let dx = -4; dx <= 4; dx++) { const X = x + dx; if (X >= 0 && X < w && kind[i + dy * w + dx] === I_GREY) { house = true; break; } }
      if (dark) s[8]++;
      if (house) s[9]++;
    }
    const cls = comps.map((c, id) => (id && c.n >= least ? decide(stats[id], c) : UNKNOWN));
    for (let i = 0; i < N; i++) if (lab[i] && cls[lab[i]] !== UNKNOWN && (!keep || keep(kind[i]))) area[i] = cls[lab[i]];
    return open;
  };
  // a forest map's grey is bare rock, a dark grey; a lighter one is the photo's shade on the paper (a crease, a corner): nothing
  const shade = opt.map === "sprint" ? 256 : 165;
  // on a sprint map the course's line drawn across a building is part of it: a control circle cut the houses inside it in two,
  // halves too thin to be read as buildings (Quiberon's control 3, 2026-11-18); mostly purple, it is the overprint's own
  const sprintInk = opt.map === "sprint";
  // where the image shows a line's width (a scan: sprintObjects' rule), a building is grey however small: a shed of 4 x 5 m, a
  // house 4 m wide failed the test made for photos (2 m of half-width, 6 x 6 m: a photo's grey is also the blur of its black
  // lines) and took the ground beside them — half a garden, half a street: the lane along them was one open patch with them, no
  // lane at all for the route grid (the Auray scan's 12-13, 2026-11-22). A metre wide, 2 x 2 m
  const sharp = sprintInk && 1.6 / mpp >= 4;
  const darkThick = thickOf((v) => v === I_BLACK || v === I_GREY || (sprintInk && v === I_PURPLE),
    (s) => (s[3] > 0.4 * s[0] ? UNKNOWN : s[1] > 0.5 * s[0] ? A.BUILDING : s[2] / s[0] > shade ? UNKNOWN : A.GREY), (v) => v !== I_PURPLE,
    sharp ? Math.max(2, Math.round(0.5 / mpp)) : k, sharp ? Math.max(9, (2 / mpp) ** 2) : minArea);
  // a paved area is a light brown; a dark one is ink — the course's legs on a photo that lost their purple come out dark brown,
  // blurred thick enough for the test, and were paved corridors across the gardens (the Quiberon photo, 2026-11-18)
  thickOf((v, i) => v === I_BROWN && rgba[4 * i] >= 170, () => A.PAVED);
  // a sprint map's light pink is a street whatever its width: the 2-3 px lane past controls 16 and 15 of the Quiberon photo,
  // too thin for the test, took the gardens' olive beside it and the runner's way was shut (2026-11-18)
  if (sprintInk) for (let i = 0, p = 0; i < N; i++, p += 4) if (kind[i] === I_BROWN && area[i] === UNKNOWN && rgba[p] >= 200 && Math.min(rgba[p + 1], rgba[p + 2]) >= 150) area[i] = A.ROUGH;
  thickOf((v) => v === I_BLUE, (s) => (s[2] / s[0] > 150 ? A.SHALLOW : A.WATER));
  // on a sprint map a garden is olive however narrow: a wedge cut by a road and the course's line (the Quiberon photo's control
  // 3) failed the 2 m test, read open land, and the routes crossed the gardens; a metre wide (2026-11-19; a window of 2 m, 7 px
  // on a 300 dpi scan, until 2026-11-21: the Auray scans' gardens between walls, 1.5 m, were crossed)
  // (and on a sharp image however small, as a building: a garden of 4 x 6 m between two houses read as the street beside it;
  // and three pixels wide, not five: a garden's strip 1.1 m wide between a house and a lane's outline read as the yellow beside
  // it, a way through the gardens of the Quiberon scan's 4-5 once its blue north line was taken out, 2026-11-23; its blends at
  // the edges, the contours over it, left it 69 % olive: 60 % for a strip between two outlines)
  // there too the blends (a contour, the course's line over the olive: I_MIXED) count with it for the thickness — a garden
  // crossed by two contours was three strips, each too thin or too small —, the olive alone taking the area
  // — a small one (under 6 x 6 m) only when nearly all olive, of the olive's own hue rather than the yellow's: the dark rim of
  // open land along a black line, the blend round a tree's green circle on yellow made small « gardens » along the streets
  const oliveHue = (s) => {
    const least = ol.oh ? (ol.oh + ol.yh) / 2 : ol.from ? ol.from + 3 : 0;    // (the olive's peak is 6° above `from`)
    if (!least) return true;
    const r = s[2] / s[0], g = s[4] / s[0], b = s[5] / s[0], mx = Math.max(r, g, b), sp = mx - Math.min(r, g, b);
    return sp > 0 && mx !== b && (mx === r ? 60 * ((g - b) / sp) : 60 * ((b - r) / sp + 2)) >= least;
  };
  // a strip 8 m long or more with outlines along both its sides (three quarters of its edge within 2 px of a dark pixel), a house
  // along one (a quarter of its edge within 4 px of its grey), is a garden between the house and a lane — not the blend along an
  // outline over the yellow (the third scan's strip by 8, where the runners ran), the dots of rough open land between a fence and
  // a path, nor a sliver where a lane leaves a street (the third scan's way to 8)
  const between = (s, c) => sharp && s[7] > 0 && s[8] >= 0.75 * s[7] && s[9] >= 0.25 * s[7] && Math.max(c.x1 - c.x0, c.y1 - c.y0) * mpp >= 8;
  thickOf(sharp ? (v) => v === I_OLIVE || v === I_MIXED : (v) => v === I_OLIVE, (s, c) => (s[0] >= minArea || (s[6] >= (between(s, c) ? 0.6 : 0.85) * s[0] && oliveHue(s)) ? A.OOB : UNKNOWN), sharp ? (v) => v === I_OLIVE : null,
    sharp ? 1 : opt.map === "sprint" ? Math.max(1, Math.round(0.5 / mpp)) : k, sharp ? Math.max(9, (2 / mpp) ** 2) : minArea, sharp);
  // a sprint map's out-of-bounds tint (kindOf), the course's lines and their blends printed over it counting with it for the
  // thickness (the lilac strip by the Quiberon photo's start), the lilac alone taking the area
  // (2026-11-22: that solid pale pink is these maps' canopy — ISSprOM 522, a roof one runs under: the runners of the Auray
  // scans ran through every one, and two controls stand at their edge. Passable, as paving; the organisers' out-of-bounds
  // overprint is hatched or a strong purple, read by overprint())
  // (2026-11-24: but not a large one — the pink the setter lays over a square, a quay or a car park closed to the race has no
  // outline of its own and covers hundreds of square metres: out of bounds, where the second route to the Auray scan's 10 ran.
  // A canopy is drawn with its thin black outline, and small: under 300 m², or outlined along 70 % of its edge and under 1 500)
  thickOf((v, i) => v === I_LILAC || (sprintInk && (v === I_PURPLE || v === I_MIXED || (v === I_BROWN && rgba[4 * i] < 170))),
    // (2026-11-25: on a scan, where the outline shows, a small one too when nothing black outlines it — a pink square edged in
    // the course's purple is the setter's, out of bounds, from 3 x 3 m: the Quiberon scan's best route to 10 crossed one of 30 m²,
    // owner)
    (st) => { const m2 = st[0] * mpp * mpp, lined = st[7] > 0 && st[8] >= 0.7 * st[7]; return (m2 < 300 && (!sharp || lined)) || (m2 < 1500 && lined) ? A.PAVED : A.OOB; }, (v) => v === I_LILAC, k, sharp ? Math.max(9, (3 / mpp) ** 2) : minArea, true);
  // open land is never a line: a full yellow streak narrower than the thickness test is a blend — the course's leg printed across
  // olive comes out yellow on a photo, a passable corridor through the gardens (the Quiberon photo, 2026-11-18) — and takes its
  // neighbours' area, as a thin ink does. On a sprint map only: a forest map's open rides and rough open land are narrow or
  // dotted (Lincoln Park lost a third of its open land to the test). The greens likewise, each depth on its own: a sprint map's
  // vegetation is parks and hedges drawn as areas, and a thin green is the teal fringe of a blue north line or a blend — across
  // the Quiberon photo a north line left a green streak through every garden and house it crossed (2026-11-18); the depths
  // together, a park's pixels being of one depth or the next
  if (opt.map === "sprint") {
    const green = (v) => v === A.G1 || v === A.G2 || v === A.G3;
    for (const test of [(v) => v === A.OPEN, green]) {               // full yellow only: a pale street reads as rough open
      const m = new Uint8Array(N);
      let any = 0;
      for (let i = 0; i < N; i++) if (test(area[i])) { m[i] = 1; any++; }
      if (!any) continue;
      // (on a sharp image a metre wide, as the other areas: a patch of open land 4 m across is one — the corner of a park
      // where the Auray scan's control 6 stands took the gardens' olive from beside it)
      // (and open land three pixels wide: a scan's blends are a pixel, and the terrace of the Auray scan's control 14, 4-6 px of
      // yellow between walls with blends among them, was cleared and taken by the walls, 2026-11-25)
      const kk = sharp ? (test === green ? Math.max(2, Math.round(0.5 / mpp)) : 1) : k, open = morph(morph(m, w, h, kk, true), w, h, kk, false);
      for (let i = 0; i < N; i++) if (m[i] && !open[i]) area[i] = UNKNOWN;
    }
    // (on a sharp image a round patch of green under 3 m across is a point symbol — a prominent tree or bush in its white ring,
    // ISSprOM 417-419 —, not a thicket: one runs round its trunk. Read as the dark green, two trees shut the terrace at the foot
    // of the Auray scan's control 14, owner 2026-11-25)
    if (sharp) {
      const m = new Uint8Array(N);
      for (let i = 0; i < N; i++) if (green(area[i])) m[i] = 1;
      const { lab, comps } = components(m, w, h);
      const pt = comps.map((c) => c && c.n * mpp * mpp <= 7 && Math.max(c.x1 - c.x0 + 1, c.y1 - c.y0 + 1) * mpp <= 3 && c.n >= 0.5 * (c.x1 - c.x0 + 1) * (c.y1 - c.y0 + 1));
      for (let i = 0; i < N; i++) if (lab[i] && pt[lab[i]]) area[i] = UNKNOWN;
    }
  }
  // the overprint's white outline (round the control numbers, the course's texts) is ink, not white forest: its pixels take
  // their neighbours' area as the purple does — in the gardens of the Quiberon photo each number left a white island by its
  // control, which the release round the controls opened (2026-11-18)
  let inkNear = null;
  {
    const m = new Uint8Array(N);
    let any = 0;
    for (let i = 0; i < N; i++) if (kind[i] === I_PURPLE) { m[i] = 1; any = 1; }
    if (any) {
      inkNear = morph(m, w, h, 2, false);
      // (on a sharp image the outline alone, which is white: a street's own colour beside the line stays the street's — a leg
      // printed along a street 2 m wide left nothing of it, and the houses on both sides closed it: the Auray scan's 12-13)
      for (let i = 0; i < N; i++) if (inkNear[i] && (area[i] === A.WHITE || (!sharp && (area[i] === A.OPEN || area[i] === A.ROUGH)))) area[i] = UNKNOWN;
    }
  }
  // a photographed sprint map's paper — its margin, the legend's box — is no white forest: the routes of the Quiberon photo ran
  // along the margin and across the legend (2026-11-18). The paper is read on the photo as taken (the levelling makes the pink
  // streets as white as it): a bright, cool or neutral white, where the streets are warm; an expanse of it that reaches the
  // photo's edge, or 3 % of the photo, its text included, is outside the map. A forest map's white is its forest: left alone
  if (opt.map === "sprint" && rgba !== rgba0) {
    const m = new Uint8Array(N);
    for (let i = 0, p = 0; i < N; i++, p += 4) {
      const r = rgba0[p], g = rgba0[p + 1], b = rgba0[p + 2];
      if (Math.min(r, g, b) >= 190 && b >= r - 8 && Math.max(r, g, b) - Math.min(r, g, b) <= 40) m[i] = 1;
    }
    const shut = morph(morph(m, w, h, 1, false), w, h, 1, true);       // its text and lines closed in
    const { lab, comps } = components(shut, w, h);
    const out = comps.map((c, id) => id && (c.n >= 0.03 * N || c.x0 === 0 || c.y0 === 0 || c.x1 === w - 1 || c.y1 === h - 1) && c.n >= 0.002 * N);
    for (let i = 0; i < N; i++) if (lab[i] && out[lab[i]]) area[i] = A.OOB;
  }
  // on a sprint map the overprint's ink (and its outline) takes the ground found on both sides of it — left and right, else above
  // and below — before the nearest: a control's number printed across a narrow street (the Quiberon photo's 4) filled from the
  // gardens above and the house below shut the street; the ground on both sides of a line is what lies under it (2026-11-18).
  // The sides across the line: of the four ways through the pixel (across, down, both diagonals) those finding one ground on both
  // sides, the shortest — looking along the line runs on its ink to the ground at its far ends: a control's circle drawn across a
  // lane between two gardens took the gardens' olive from left and right, and shut the lane (the Auray scan's leg 21-22,
  // 2026-11-23). On a sharp image only: a photo's blurred lines found nearer, wrong ground by the diagonals (the Auray photo's
  // 3-4 lost); there left and right, else above and below, as before
  if (sprintInk && inkNear) {
    const D = Math.max(8, Math.round(30 / mpp)), fill = [];
    let lt = 0;
    const look = (x, y, dx, dy) => {
      for (let t = 1; t <= D; t++) {
        const X = x + dx * t, Y = y + dy * t;
        if (X < 0 || Y < 0 || X >= w || Y >= h) return -1;
        const v = area[Y * w + X];
        if (v !== UNKNOWN) { lt = t * (dx && dy ? Math.SQRT2 : 1); return v; }
      }
      return -1;
    };
    for (let i = 0; i < N; i++) {
      if (!inkNear[i] || area[i] !== UNKNOWN || (kind[i] !== I_PURPLE && kind[i] >= 20)) continue;   // a wall beside it stays a line
      const x = i % w, y = (i - x) / w;
      let best = -1, bd = Infinity, cross = Infinity;
      for (const [dx, dy] of sharp ? [[1, 0], [0, 1], [1, 1], [1, -1]] : [[1, 0], [0, 1]]) {
        const a = look(x, y, -dx, -dy), ta = lt;
        if (a < 0) continue;
        const b = look(x, y, dx, dy), tb = lt;
        if (b >= 0 && b !== a && (a === A.GREY || a === A.BUILDING || b === A.GREY || b === A.BUILDING)) cross = Math.min(cross, ta + tb);
        if (b === a && ta + tb < bd) { bd = ta + tb; best = a; }
        if (!sharp && best >= 0) break;
      }
      // (on a sharp image, a line lying on a house's edge — a control's circle printed over it, the street beyond its
      // outline, the house's grey inside — has two grounds across it, near: the same ground far along the line, at both ends of the
      // arc, is not what lies under it. The nearest then decides: the circle round the Quiberon scan's 10 gave the street's ground
      // to a strip of the house, and the routes to 11 cut its corner, owner 2026-11-26. A house's edge only: a leg printed along a
      // stairway between gardens, two grounds across it too, closed the stairway to the Auray scan's 6)
      if (best >= 0 && sharp && cross < Infinity && bd > 2 * cross + 2) best = -1;
      if (best >= 0) fill.push(i, best);
    }
    for (let j = 0; j < fill.length; j += 2) area[fill[j]] = fill[j + 1];
  }
  progress(0.6);
  // the thin black lines: the paths' network (and also fences, walls, long cliffs — what they are is the settings' choice)
  // (a sprint map's black lines are read as objects afterwards — sprintObjects, sprintLayers: walls, never paths — so its
  // network is not traced: two seconds of a scan's reading, 2026-11-22)
  const path = new Uint8Array(N);
  let lines = { chains: 0 };
  if (opt.map !== "sprint") {
    const thin = new Uint8Array(N), black = new Uint8Array(N);
    const darkGrey = (i) => { const p = 4 * i, mx = Math.max(rgba[p], rgba[p + 1], rgba[p + 2]); return mx < 170 && mx - Math.min(rgba[p], rgba[p + 1], rgba[p + 2]) < 24; };
    for (let i = 0; i < N; i++) if ((kind[i] === I_BLACK || (kind[i] === I_GREY && darkGrey(i))) && !darkThick[i] && area[i] === UNKNOWN) { thin[i] = 1; black[i] = kind[i] === I_BLACK ? 1 : 0; }
    lines = lineNetwork(thin, black, w, h, mpp, path);
  }
  progress(0.85);
  const blue = new Uint8Array(N);
  for (let i = 0; i < N; i++) if (kind[i] === I_BLUE && area[i] === UNKNOWN) blue[i] = 1;
  // the inks painted over: each unknown pixel takes the nearest area (a breadth-first fill from every known pixel). On a sharp
  // image open ground wins a tie with closed ground (the fill goes out from it first): the ink of a thin line across a lane's
  // mouth between two houses was as near the lane as the houses, and took the grey of the house on the row above it — the
  // first in the fill's order —, which shut the lane (the Auray scan's leg to 5, 2026-11-23)
  const q = new Int32Array(N);
  let qh = 0, qt = 0;
  if (sharp) {
    const closedA = (v) => v === A.GREY || v === A.BUILDING || v === A.OOB || v === A.WATER || v === A.G3;
    for (let i = 0; i < N; i++) if (area[i] !== UNKNOWN && !closedA(area[i])) q[qt++] = i;
    for (let i = 0; i < N; i++) if (area[i] !== UNKNOWN && closedA(area[i])) q[qt++] = i;
  } else for (let i = 0; i < N; i++) if (area[i] !== UNKNOWN) q[qt++] = i;
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
  // the course's reddish ink (sprintObjects: the course's own lines are no walls)
  let redInk = null;
  if (opt.map === "sprint") { redInk = new Uint8Array(N); for (let i = 0; i < N; i++) if (kind[i] === I_PURPLE || (kind[i] === I_BROWN && rgba[4 * i] < 170)) redInk[i] = 1; }
  return { area, path, blue, north, over, kind, redInk, lw, k, lines, northLines: nlines, olive: ol, ms: Date.now() - t0 };
}

// ---- 1b. a sprint photo as objects (2026-11-19) ----------------------------------------------------------------------------
// A photographed sprint map read as an OCAD map is: its black lines traced into objects, each told by what lies on its two sides
// — the outline of a building, olive, water or an out-of-bounds area (it is that area's), the course's own leg or circle (on the
// course, in its reddish ink: nothing), else a wall or a fence —, walls whose ends face each other across a break joined, and the
// walls given to the route engine as a vector map's are (`block`: impassable lines, handrails), the lanes between houses kept
// (`lane`: a cell of two pixels keeps the open pixel of a 1-2 px lane). Measured on the three Morbihan sprint photos against the
// runners' 59 legs (work/route-bench): every leg a route; the runner's track laid on the map on 48 legs against 42 with the pixel
// reading; dark lines crossed squarely by the best routes 63 against 89; olive crossed 126 m against 246. Lines a pixel or two
// wide cannot be told one symbol
// from another (an impassable wall is 1.4 m wide at 1:4 000, a fence 0.6 m: 1.5 and 0.6 px on those photos), so every free line
// is a wall; a scan's 3 px a metre would let the symbols be named.

const D8 = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];

/**
 * The underpasses of a sprint map read from a sharp image (ISSprOM 512.2 and 512.3: the passage under a road or a bridge drawn
 * between two dotted black lines across it, white stripes between them where both levels are run). Read as the symbol is drawn:
 * the image's dark dots (0.6 to 1.7 m across, round, not among many: sandy ground is a field of dots), three or more in a row evenly spaced (1.3 to 2.6 m: the dots at a row's
 * ends run into the road's edges), two such rows side by side — parallel within 12°, 3 to 14 m apart, end to end within a third
 * of their length —, and between the rows the stripes: pure white in 6 to 60 % of the band (a road's beige has none, the paper
 * of a legend or a control description table is all white). Each end is then walked outward along the passage until the dark
 * line that closes it there (the road's edge, the bridge's triangles) is passed: the mouths. Returns [{ a, b (the mouths, px),
 * wide (px), dots }]. Two levels: the passage is the lower one, a link between its mouths (context()); what it goes under stays
 * as read (owner, 2026-11-22: the routes of the Auray scan went round a bridge the runners ran under).
 */
export function underpasses(rgba, w, h, mpp) {
  if (!rgba || !(mpp > 0) || mpp > 0.6) return [];     // a dot under a pixel and a half is not told from noise
  const N = w * h, m = new Uint8Array(N);
  for (let i = 0, q = 0; i < N; i++, q += 4) if (rgba[q] < 130 && rgba[q + 1] < 130 && rgba[q + 2] < 130) m[i] = 1;
  const { comps } = components(m, w, h, true);
  const lo = Math.max(2, 0.6 / mpp), hi = 1.7 / mpp, dots = [];
  for (let id = 1; id < comps.length; id++) {
    const c = comps[id], bw = c.x1 - c.x0 + 1, bh = c.y1 - c.y0 + 1;
    if (bw < lo || bh < lo || bw > hi || bh > hi || Math.max(bw, bh) > 1.7 * Math.min(bw, bh) || c.n < 0.5 * bw * bh) continue;
    dots.push({ x: c.sx / c.n, y: c.sy / c.n, used: false });
  }
  const B = Math.max(4, Math.round(3 / mpp)), bx = Math.ceil(w / B), grid = new Map();
  dots.forEach((d, i) => { const k = Math.floor(d.y / B) * bx + Math.floor(d.x / B); if (!grid.has(k)) grid.set(k, []); grid.get(k).push(i); });
  const nearTo = (x, y, r) => {
    let best = -1, bd = r;
    const cx = Math.floor(x / B), cy = Math.floor(y / B);
    for (let j = cy - 1; j <= cy + 1; j++) for (let i = cx - 1; i <= cx + 1; i++) for (const q of grid.get(j * bx + i) || []) {
      const d = Math.hypot(dots[q].x - x, dots[q].y - y);
      if (d < bd) { bd = d; best = q; }
    }
    return best;
  };
  const dMin = 1.3 / mpp, dMax = 2.6 / mpp, chains = [];
  // a dot among many (sandy ground's pattern, a legend's dotted screen) is no row's: more than three others within a step
  for (const p of dots) {
    let near = 0;
    const cx = Math.floor(p.x / B), cy = Math.floor(p.y / B);
    for (let j = cy - 1; j <= cy + 1; j++) for (let i = cx - 1; i <= cx + 1; i++) for (const q of grid.get(j * bx + i) || []) if (dots[q] !== p && Math.hypot(dots[q].x - p.x, dots[q].y - p.y) <= dMax) near++;
    p.crowd = near > 3;
  }
  for (const p of dots) if (p.crowd) p.used = true;
  for (let i = 0; i < dots.length; i++) {
    const p = dots[i];
    if (p.used) continue;
    let bestC = null;
    const cx = Math.floor(p.x / B), cy = Math.floor(p.y / B);
    for (let j = cy - 1; j <= cy + 1; j++) for (let ii = cx - 1; ii <= cx + 1; ii++) for (const q of grid.get(j * bx + ii) || []) {
      if (q === i || dots[q].used) continue;
      const dx = dots[q].x - p.x, dy = dots[q].y - p.y, d = Math.hypot(dx, dy);
      if (d < dMin || d > dMax) continue;
      const walk = (from, sx, sy) => {                  // the row on from a dot, a step at a time
        const out = [];
        let x = dots[from].x, y = dots[from].y, last = from;
        for (;;) {
          const k = nearTo(x + sx, y + sy, 0.35 * d);
          if (k < 0 || k === last || dots[k].used || out.includes(k) || k === i || k === q) break;
          out.push(k); x = dots[k].x; y = dots[k].y; last = k;
        }
        return out;
      };
      const c = [...walk(i, -dx, -dy).reverse(), i, q, ...walk(q, dx, dy)];
      if (c.length >= 3 && (!bestC || c.length > bestC.length)) bestC = c;
    }
    if (!bestC) continue;
    for (const k of bestC) dots[k].used = true;
    const A = dots[bestC[0]], Z = dots[bestC[bestC.length - 1]], L = Math.hypot(Z.x - A.x, Z.y - A.y);
    chains.push({ ax: A.x, ay: A.y, L, ux: (Z.x - A.x) / L, uy: (Z.y - A.y) / L, n: bestC.length, step: L / (bestC.length - 1), paired: false });
  }
  const white = (x, y) => { const q = 4 * (Math.round(y) * w + Math.round(x)); return rgba[q] > 225 && rgba[q + 1] > 225 && rgba[q + 2] > 225; };
  const inside = (x, y) => x >= 1 && y >= 1 && x < w - 1 && y < h - 1;
  const out = [];
  for (let i = 0; i < chains.length; i++) {
    const c = chains[i];
    if (c.paired) continue;
    let best = null;
    for (let j = 0; j < chains.length; j++) {
      const e = chains[j];
      if (j === i || e.paired) continue;
      const dot = c.ux * e.ux + c.uy * e.uy;
      if (Math.abs(dot) < Math.cos((12 * Math.PI) / 180) || Math.min(c.L, e.L) < 0.6 * Math.max(c.L, e.L)) continue;
      const ex = e.ax + e.ux * e.L, ey = e.ay + e.uy * e.L;
      const ta = (e.ax - c.ax) * c.ux + (e.ay - c.ay) * c.uy, tz = (ex - c.ax) * c.ux + (ey - c.ay) * c.uy;
      const sa = (e.ax - c.ax) * -c.uy + (e.ay - c.ay) * c.ux, sz = (ex - c.ax) * -c.uy + (ey - c.ay) * c.ux, s = (sa + sz) / 2;
      if (Math.abs(s) < 3 / mpp || Math.abs(s) > 14 / mpp) continue;
      const t1 = Math.min(ta, tz), t2 = Math.max(ta, tz);
      if (Math.abs(t1) > c.L / 3 + c.step || Math.abs(t2 - c.L) > c.L / 3 + c.step) continue;
      // the stripes between the two rows
      let n = 0, wh = 0;
      for (let t = 0; t <= c.L; t += 1) for (let v = 0.15; v <= 0.85; v += 0.05) {
        const x = c.ax + c.ux * t - c.uy * s * v, y = c.ay + c.uy * t + c.ux * s * v;
        if (!inside(x, y)) continue;
        n++; if (white(x, y)) wh++;
      }
      if (!n || wh < 0.06 * n || wh > 0.6 * n) continue;
      if (!best || Math.abs(s) < Math.abs(best.s)) best = { j, s, t1: Math.min(0, t1), t2: Math.max(c.L, t2) };
    }
    if (!best) continue;
    c.paired = chains[best.j].paired = true;
    // each end walked outward along the centre line: past the dark lines that close the band there (a double line, a bridge's
    // triangles: dark again within a metre and a half), a metre and a half further. They are the upper level's edge where the
    // passage comes out from under it (a bridge's side, the road's edge over a tunnel's mouth): a drop, never a way between the
    // two levels — their ink over the passage's width and 2 m on each side is kept (`edge`, the pixels)
    const gapT = 1.5 / mpp;
    // (a walk counts only when it meets dark within 4 m of the band's end and leaves it again: one running along a wall is no
    // crossing)
    const walk = (t0, dir, v, seeds) => {
      let at = null, last = -1;
      const mine = [];
      for (let t = 0; t <= 10 / mpp; t += 0.5) {
        const x = c.ax + c.ux * (t0 + dir * t) - c.uy * v, y = c.ay + c.uy * (t0 + dir * t) + c.ux * v;
        if (!inside(x, y) || (!at && t > 4 / mpp)) return null;
        const k = Math.round(y) * w + Math.round(x);
        if (m[k]) { if (!at) at = [x, y]; last = t; mine.push(k); }
        else if (at && t - last >= gapT) { for (const q of mine) seeds.push(q); return { at, pt: [x, y] }; }
      }
      return null;
    };
    const mouth = (t0, dir) => {
      const seeds = [], mid = walk(t0, dir, best.s / 2, seeds);
      if (!mid) return null;
      const { pt } = mid, sg = Math.sign(best.s) || 1;
      // (across the whole width and 2 m beyond: the edge's line is broken here and there — by the band's own dots, a gap)
      for (let v = -2 / mpp; v <= Math.abs(best.s) + 2 / mpp; v += 1) walk(t0, dir, sg * v, seeds);
      // the ink crossed (the walks a pixel apart) and the paper between its lines: the white inside a double line was a corridor
      // from the lower road up onto the bridge. Only what the walks cross: the lines the edge meets beyond the mouth (the far side
      // of a lane leaving it) are the lower level's own
      const edge = new Set();
      for (const k of seeds) { const kx = k % w, ky = (k - kx) / w; for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) { const X = kx + dx, Y = ky + dy; if (X >= 0 && Y >= 0 && X < w && Y < h) edge.add(Y * w + X); } }
      return { pt, edge };
    };
    const a = mouth(best.t1, -1), b = mouth(best.t2, 1);
    if (a && b) out.push({ a: a.pt, b: b.pt, wide: Math.abs(best.s), dots: c.n + chains[best.j].n, edge: [...a.edge, ...b.edge] });
  }
  return out;
}

/** Zhang-Suen thinning of a binary mask (a copy). */
function thin1(m, w, h) {
  const s = m.slice(), del = [];
  // the pixels still set, in the image's order (the passes walk them, not the whole image: a scan's thinning took 2 s)
  let n = 0;
  for (let y = 1; y < h - 1; y++) for (let x = 1, i = y * w + 1; x < w - 1; x++, i++) if (s[i]) n++;
  const act = new Int32Array(n);
  n = 0;
  for (let y = 1; y < h - 1; y++) for (let x = 1, i = y * w + 1; x < w - 1; x++, i++) if (s[i]) act[n++] = i;
  for (let changed = true; changed;) {
    changed = false;
    for (const pass of [0, 1]) {
      del.length = 0;
      for (let k = 0; k < n; k++) {
        const i = act[k];
        if (!s[i]) continue;
        const p0 = s[i - w], p1 = s[i - w + 1], p2 = s[i + 1], p3 = s[i + w + 1], p4 = s[i + w], p5 = s[i + w - 1], p6 = s[i - 1], p7 = s[i - w - 1];
        const B = p0 + p1 + p2 + p3 + p4 + p5 + p6 + p7;
        if (B < 2 || B > 6) continue;
        const A2 = (!p0 && p1) + (!p1 && p2) + (!p2 && p3) + (!p3 && p4) + (!p4 && p5) + (!p5 && p6) + (!p6 && p7) + (!p7 && p0);
        if (A2 !== 1) continue;
        if (pass === 0 ? (p0 && p2 && p4) || (p2 && p4 && p6) : (p0 && p2 && p6) || (p0 && p4 && p6)) continue;
        del.push(i);
      }
      for (const i of del) s[i] = 0;
      if (del.length) changed = true;
    }
    let q = 0;
    for (let k = 0; k < n; k++) if (s[act[k]]) act[q++] = act[k];
    n = q;
  }
  return s;
}
/** A skeleton's polylines, traced from each end or junction to the next (closed loops too): [[x, y], …]. */
function skeletonLines(s, w, h) {
  const deg = new Uint8Array(w * h);
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const i = y * w + x;
    if (!s[i]) continue;
    let n = 0;
    for (const [dx, dy] of D8) if (s[i + dy * w + dx]) n++;
    deg[i] = n;
  }
  const used = new Set(), out = [], key = (a, b) => (a < b ? a * 4194304 + b : b * 4194304 + a);
  const walk = (start, next) => {
    const line = [start, next];
    used.add(key(start, next));
    let prev = start, cur = next;
    while (deg[cur] === 2) {
      let nx = -1;
      for (const [dx, dy] of D8) { const j = cur + dy * w + dx; if (s[j] && j !== prev && !used.has(key(cur, j))) { nx = j; break; } }
      if (nx < 0) break;
      used.add(key(cur, nx)); line.push(nx); prev = cur; cur = nx;
    }
    return line;
  };
  for (const loops of [false, true]) for (let i = 0; i < w * h; i++) {
    if (!s[i] || (deg[i] === 2) !== loops) continue;
    for (const [dx, dy] of D8) { const j = i + dy * w + dx; if (s[j] && !used.has(key(i, j))) { out.push(walk(i, j)); if (loops) break; } }
  }
  return out.map((l) => l.map((i) => [i % w, (i - (i % w)) / w]));
}

/**
 * A sharp image's solid black as thick as an impassable line (ISSprOM: 0.40 mm, 1.6 m at 1:4000 — three pixels across and
 * more) and 4 m long at least: closed along its whole length, whatever the reading made of each stretch. An impassable fence
 * read as a « building » strip where it is thickest and as a wall further on left a cell open where the two readings met, and
 * every route to the Vannes scan's 9 went through it (owner, 2026-11-24). A tunnel's dots, a boulder, a letter are shorter.
 * Returns a mask of those pixels, or null.
 */
function thickBlack(rgba, w, h, mpp) {
  const N = w * h, dark = new Uint8Array(N), core = new Uint8Array(N);
  for (let i = 0, p = 0; i < N; i++, p += 4) if (Math.max(rgba[p], rgba[p + 1], rgba[p + 2]) < 85) dark[i] = 1;
  let any = false;
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const i = y * w + x;
    if (dark[i] && dark[i - 1] && dark[i + 1] && dark[i - w] && dark[i + w] && dark[i - w - 1] && dark[i - w + 1] && dark[i + w - 1] && dark[i + w + 1]) { core[i] = 1; any = true; }
  }
  if (!any) return null;
  const out = new Uint8Array(N), seen = new Uint8Array(N), st = [], minLen = 4 / mpp;
  for (let s0 = 0; s0 < N; s0++) {
    if (!core[s0] || seen[s0]) continue;
    const comp = []; let x0 = w, y0 = h, x1 = 0, y1 = 0;
    seen[s0] = 1; st.push(s0);
    while (st.length) {
      const j = st.pop(), x = j % w, y = (j - x) / w;
      comp.push(j);
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      for (const [dx, dy] of D8) { const X = x + dx, Y = y + dy; if (X < 0 || Y < 0 || X >= w || Y >= h) continue; const q = Y * w + X; if (core[q] && !seen[q]) { seen[q] = 1; st.push(q); } }
    }
    if (Math.hypot(x1 - x0 + 1, y1 - y0 + 1) < minLen) continue;
    for (const j of comp) out[j] = 2;
  }
  const solid = new Uint8Array(N);                        // the black itself, to its edge: no way runs through it
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const i = y * w + x;
    if (out[i] !== 2) continue;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const q = i + dy * w + dx; if (dark[q]) solid[q] = 1; }
  }
  // carried on under what is printed over it — the course's line, a circle, a tree's dot: there the black shows through dark
  // (under 130) though not black, as wide as before; up to 3 m from each side (the leg into the Auray scan's 14 crossed its
  // enclosure's wall where the leg's own line is printed over it). An opening shows the ground's colour: not carried across
  const dim = new Uint8Array(N), wide = new Uint8Array(N);
  for (let i = 0, p = 0; i < N; i++, p += 4) if (Math.max(rgba[p], rgba[p + 1], rgba[p + 2]) < 130) dim[i] = 1;
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const i = y * w + x;
    if (dim[i] && dim[i - 1] && dim[i + 1] && dim[i - w] && dim[i + w] && dim[i - w - 1] && dim[i - w + 1] && dim[i + w - 1] && dim[i + w + 1]) wide[i] = 1;
  }
  let front = [];
  for (let i = 0; i < N; i++) if (out[i] === 2) front.push(i);
  for (let step = Math.round(3 / mpp); step > 0 && front.length; step--) {
    const next = [];
    for (const j of front) { const x = j % w, y = (j - x) / w; for (const [dx, dy] of D8) { const X = x + dx, Y = y + dy; if (X < 1 || Y < 1 || X >= w - 1 || Y >= h - 1) continue; const q = Y * w + X; if (wide[q] && !out[q]) { out[q] = 2; next.push(q); } } }
    front = next;
  }
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const i = y * w + x;
    if (out[i] !== 2) continue;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const q = i + dy * w + dx; if (dim[q] && !out[q]) out[q] = 1; }
  }
  // and across a point symbol printed on it with its white mask — a tree's green dot in its white ring cuts the line on paper,
  // not on the ground (the corner of that enclosure, where the best route went in): two pieces of thick black joined through
  // such a symbol's pixels (white, or the trees' green) when under 2 m of them lie between (value 3: a line, any pixel closing)
  const sym = new Uint8Array(N), lab = new Int32Array(N);
  for (let i = 0, p = 0; i < N; i++, p += 4) {
    const r = rgba[p], g = rgba[p + 1], b = rgba[p + 2];
    if (!out[i] && (Math.min(r, g, b) >= 232 || (g >= r + 30 && g >= b + 30))) sym[i] = 1;
  }
  let nl = 0;
  for (let s0 = 0; s0 < N; s0++) {
    if (!out[s0] || lab[s0]) continue;
    nl++; lab[s0] = nl; st.push(s0);
    while (st.length) { const j = st.pop(), x = j % w, y = (j - x) / w; for (const [dx, dy] of D8) { const X = x + dx, Y = y + dy; if (X < 0 || Y < 0 || X >= w || Y >= h) continue; const q = Y * w + X; if (out[q] && !lab[q]) { lab[q] = nl; st.push(q); } } }
  }
  const own = new Int32Array(N), from = new Int32Array(N).fill(-1), reach = Math.max(2, Math.round(1 / mpp));
  front = [];
  for (let i = 0; i < N; i++) if (out[i]) { own[i] = lab[i]; front.push(i); }
  const mark = (j) => { for (let k = j; k >= 0 && !out[k]; k = from[k]) out[k] = 3; };
  // (only a wall carried on under the symbol: the bridge runs along both pieces at its ends — two parallel walls with a tree
  // between them, a terrace's, are not one wall: the trees on the Auray scan's terrace by 14 shut it, owner 2026-11-25)
  const origin = (k) => { while (k >= 0 && !out[k]) k = from[k]; return k; };
  const dirAt = (p, id) => {
    const px = p % w, py = (p - px) / w, R = 4;
    let n = 0, sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0;
    for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
      const X = px + dx, Y = py + dy;
      if (X < 0 || Y < 0 || X >= w || Y >= h || lab[Y * w + X] !== id) continue;
      n++; sx += dx; sy += dy; sxx += dx * dx; syy += dy * dy; sxy += dx * dy;
    }
    if (n < 4) return null;
    const mx = sx / n, my = sy / n, xx = sxx / n - mx * mx, yy = syy / n - my * my, xy = sxy / n - mx * my;
    if (Math.abs(xx - yy) < 0.3 && Math.abs(xy) < 0.3) return null;      // a blob, no direction
    const th = 0.5 * Math.atan2(2 * xy, xx - yy);
    return [Math.cos(th), Math.sin(th)];
  };
  const along = (q, j) => {
    const a = origin(q), b = origin(j);
    if (a < 0 || b < 0) return true;
    const ax = a % w, ay = (a - ax) / w, bx = b % w, by = (b - bx) / w, L = Math.hypot(bx - ax, by - ay);
    if (L < 2) return true;
    const ux = (bx - ax) / L, uy = (by - ay) / L;
    // (a piece with no direction there — a wall's corner, a blob of black — carries nothing on: the corner of the terrace by 14)
    for (const [p, id] of [[a, lab[a]], [b, lab[b]]]) { const d = dirAt(p, id); if (!d || Math.abs(d[0] * ux + d[1] * uy) < Math.cos((40 * Math.PI) / 180)) return false; }
    return true;
  };
  for (let step = reach; step > 0 && front.length; step--) {
    const next = [];
    for (const j of front) {
      const x = j % w, y = (j - x) / w;
      for (const [dx, dy] of D8) {
        const X = x + dx, Y = y + dy;
        if (X < 0 || Y < 0 || X >= w || Y >= h) continue;
        const q = Y * w + X;
        if (own[q]) { if (own[q] !== own[j] && (sym[q] || sym[j]) && along(q, j)) { mark(q); mark(j); } continue; }
        if (!sym[q]) continue;
        own[q] = own[j]; from[q] = j; next.push(q);
      }
    }
    front = next;
  }
  for (let i = 0; i < N; i++) if (solid[i]) out[i] = 4;
  return out;
}
/**
 * The objects of a sprint photo read by classify(): its area with the outlines merged into what they bound, and the candidate
 * walls (the free black lines, each with the share of its pixels in the course's reddish ink). The course is not known here:
 * sprintLayers() leaves its lines out.
 */
export function sprintObjects(P, w, h, mpp, rgba = null) {
  const N = w * h, area = P.area.slice(), kind = P.kind;
  // the warm ground of the photo as taken (a street's or a lane's pink and beige), sprintLayers' lanes: the light seam between two
  // houses is a neutral grey
  // (and the paper, light and neutral — its white, or its blend with a line —: a gap drawn between two houses, sprintLayers)
  // (and pale, white or nearly: a stairway's treads, sprintLayers)
  const warm = new Uint8Array(N), light = new Uint8Array(N), pale = new Uint8Array(N);
  if (rgba) for (let i = 0, p = 0; i < N; i++, p += 4) {
    const r = rgba[p], g = rgba[p + 1], b = rgba[p + 2], mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    if (r >= b + 12 && r >= 150) warm[i] = 1;
    else if (mx >= 190 && mx - mn <= 30) light[i] = 1;
    if (mn >= 170 && mx >= 215) pale[i] = 1;
  }
  const closed = (v) => v === A.GREY || v === A.BUILDING || v === A.OOB || v === A.WATER;
  const m = new Uint8Array(N);
  for (let i = 0; i < N; i++) if (kind[i] === I_BLACK && !closed(area[i])) m[i] = 1;
  const sk = thin1(m, w, h), lines = skeletonLines(sk, w, h);
  // each skeleton piece's extent: a wall cut into short branches by its junctions is as long as its whole piece
  const comp = new Int32Array(N), ext = [0], st = [];
  for (let i = 0, id = 0; i < N; i++) {
    if (!sk[i] || comp[i]) continue;
    id++; let x0 = w, y0 = h, x1 = 0, y1 = 0; comp[i] = id; st.push(i);
    while (st.length) {
      const j = st.pop(), x = j % w, y = (j - x) / w;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      for (const [dx, dy] of D8) { const X = x + dx, Y = y + dy; if (X < 0 || Y < 0 || X >= w || Y >= h) continue; const q = Y * w + X; if (sk[q] && !comp[q]) { comp[q] = id; st.push(q); } }
    }
    ext[id] = Math.hypot(x1 - x0 + 1, y1 - y0 + 1);
  }
  // a point beside the line: `off` px to its left (sgn 1) or right (-1)
  const beside = (line, k, sgn, off) => {
    const a = line[Math.max(0, k - 2)], b = line[Math.min(line.length - 1, k + 2)], dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1;
    const x = Math.round(line[k][0] - (sgn * dy * off) / L), y = Math.round(line[k][1] + (sgn * dx * off) / L);
    return x < 0 || y < 0 || x >= w || y >= h ? -1 : y * w + x;
  };
  const side = (line, sgn) => {
    let c = 0, n = 0;
    for (let k = 0; k < line.length; k++) for (const off of [2, 3]) { const i = beside(line, k, sgn, off); if (i < 0) continue; n++; if (closed(P.area[i])) c++; }
    return n ? c / n : 0;
  };
  // a line's width, where the image shows it: ISSprOM draws the impassable wall, fence and line feature 0.40 mm wide (515, 518,
  // 529), the passable ones 0.21 mm (513, 516), a building's outline 0.14 mm, a paving's edge 0.10 mm — at 1:4000, 1.6 m on the
  // ground against 0.84, 0.56 and 0.40 m. A phone's photo of the map (about a metre a pixel) draws them all a pixel or two wide;
  // a 300 dpi scan (a third of a metre) draws them 5, 2-3 and 1-2 px wide, and its thin lines (passable walls, kerbs, steps, the
  // outlines a fill does not reach) shut the controls in when taken for walls (2026-11-19: 12 legs without a route on the three
  // Morbihan scans). Read where an impassable line is 4 px wide or more: a free line under 1.15 m is passable (1:3000's
  // impassable is 1.2 m, its passable 0.63 m)
  const WIDE = 1.15, widthTold = 1.6 / mpp >= 4;
  // a width read where the course's overprint covers the line's edge says nothing (null): printed over a wall, opaque, it left
  // the wall a pixel or two of black and the wall was taken for a passable line (the Auray scan's control 3, 2026-11-21). A line
  // whose width the overprint hides mostly is a wall when it carries on a wall, else passable
  const over = (i) => kind[i] === I_PURPLE || kind[i] === I_LILAC || P.redInk?.[i] === 1;
  const across = (line, k) => {
    const a = line[Math.max(0, k - 3)], b = line[Math.min(line.length - 1, k + 3)], dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1;
    let wd = 1;
    for (const sg of [1, -1]) for (let e = 1; e <= 12; e++) {
      const x = Math.round(line[k][0] - (sg * dy * e) / L), y = Math.round(line[k][1] + (sg * dx * e) / L);
      if (x < 0 || y < 0 || x >= w || y >= h) break;
      if (kind[y * w + x] !== I_BLACK) { if (over(y * w + x)) return null; break; }
      wd++;
    }
    return wd;
  };
  const widthOf = (line) => {
    const v = [];
    for (let k = 0; k < line.length; k += 2) { const a = across(line, k); if (a != null) v.push(a); }
    if (!v.length || v.length < 0.5 * Math.ceil(line.length / 2)) return null;
    v.sort((p, q) => p - q);
    return v[v.length >> 1] * mpp;
  };
  const walls = [], toArea = [], minLen = 2 / mpp, hidden = [];
  const addWall = (line) => {
    let red = 0;
    for (const [x, y] of line) { const i = y * w + x; if (P.redInk?.[i] || P.redInk?.[i + 1] || P.redInk?.[i - 1] || P.redInk?.[i + w] || P.redInk?.[i - w]) red++; }
    walls.push({ pts: line, red: red / line.length });
  };
  let thinLines = 0;
  for (const line of lines) {
    const L = side(line, 1), R = side(line, -1);
    if (Math.max(L, R) >= 0.5) {
      // an outline belongs to what it bounds: its centreline takes that area (read 2-4 px off it, on the closed side)
      const sgn = L >= R ? 1 : -1;
      for (let k = 0; k < line.length; k++) for (const off of [2, 3, 4]) { const i = beside(line, k, sgn, off); if (i >= 0 && closed(P.area[i])) { toArea.push(line[k][1] * w + line[k][0], P.area[i]); break; } }
      continue;
    }
    if (ext[comp[line[0][1] * w + line[0][0]]] < minLen) continue;
    if (widthTold) {
      const wd = widthOf(line);
      if (wd == null) { hidden.push(line); continue; }
      if (wd < WIDE) { thinLines++; continue; }
    }
    addWall(line);
  }
  if (hidden.length) {
    const on = new Uint8Array(N);
    for (const l of walls) for (const [x, y] of l.pts) on[y * w + x] = 1;
    const touches = (x, y) => { for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) { const X = x + dx, Y = y + dy; if (X >= 0 && Y >= 0 && X < w && Y < h && on[Y * w + X]) return true; } return false; };
    for (let round = 0; round < 3; round++) {
      let more = false;
      for (let k = hidden.length - 1; k >= 0; k--) {
        const l = hidden[k], a = l[0], b = l[l.length - 1];
        if (!touches(a[0], a[1]) && !touches(b[0], b[1])) continue;
        addWall(l); for (const [x, y] of l) on[y * w + x] = 1; hidden.splice(k, 1); more = true;
      }
      if (!more) break;
    }
    thinLines += hidden.length;
  }
  for (let j = 0; j < toArea.length; j += 2) area[toArea[j]] = toArea[j + 1];
  return { w, h, mpp, area, walls, thinLines, warm: rgba ? warm : null, light: rgba ? light : null, pale: rgba ? pale : null, under: rgba ? underpasses(rgba, w, h, mpp) : [],
    thick: rgba && 1.6 / mpp >= 4 ? thickBlack(rgba, w, h, mpp) : null };
}

/**
 * The course setter's crossing points (ISSprOM 710.1, ISOM 708): two bars of the overprint side by side across a line feature —
 * a wall, a fence, a road one shall not cross elsewhere —, the way over it between them. Read where the image shows the bars'
 * width (a scan): the course's purple off its legs and circles, pieces 0.8 to 2.4 m thick and straight, a bar cut by the line
 * it crosses put together again (in line, 3 m apart at most), two bars of 4 to 25 m parallel within 15°, 2.5 to 9 m apart, side
 * by side over most of their length, with black between them along the middle (the line crossed: digits side by side, a
 * description sheet's symbols, the pale overprint's areas have none). Returns [{ px }]: the pixels between the two bars.
 * The Auray scans hold dozens, across their streets (owner, 2026-11-23: « the course's crossing-point marks »).
 */
export function crossingMarks(P, w, h, mpp, pts = [], r = 0) {
  if (!(mpp > 0) || 1.4 / mpp < 3) return [];
  const N = w * h, m = new Uint8Array(N), out = [];
  const legs = [];
  for (let i = 0; i + 1 < pts.length; i++) {
    const [ax, ay] = pts[i], [bx, by] = pts[i + 1], L = Math.hypot(bx - ax, by - ay);
    if (L <= 2 * r) continue;
    const ux = (bx - ax) / L, uy = (by - ay) / L;
    legs.push([ax + ux * r, ay + uy * r, bx - ux * r, by - uy * r]);
  }
  // the circles' rings and the legs drawn once (a test per purple pixel against every one took most of a second)
  const legW = 1.2 / mpp, ringW = 1.5 / mpp, off = new Uint8Array(N);
  for (const [cx, cy] of pts) {
    const R1 = r + ringW;
    for (let y = Math.max(0, Math.floor(cy - R1)); y <= Math.min(h - 1, Math.ceil(cy + R1)); y++) for (let x = Math.max(0, Math.floor(cx - R1)); x <= Math.min(w - 1, Math.ceil(cx + R1)); x++) {
      if (Math.abs(Math.hypot(x - cx, y - cy) - r) < ringW) off[y * w + x] = 1;
    }
  }
  const W1 = Math.ceil(legW);
  for (const [ax, ay, bx, by] of legs) {
    const L = Math.hypot(bx - ax, by - ay);
    for (let t = 0; t <= L; t += 0.5) {
      const x0 = Math.round(ax + ((bx - ax) * t) / L), y0 = Math.round(ay + ((by - ay) * t) / L);
      for (let dy = -W1; dy <= W1; dy++) for (let dx = -W1; dx <= W1; dx++) {
        const x = x0 + dx, y = y0 + dy;
        if (x >= 0 && y >= 0 && x < w && y < h && dx * dx + dy * dy < legW * legW) off[y * w + x] = 1;
      }
    }
  }
  for (let i = 0; i < N; i++) if (P.kind[i] === I_PURPLE && !off[i]) m[i] = 1;
  const { lab, comps } = components(m, w, h, true), nC = comps.length;
  const ax = comps.map((c) => {
    if (!c || c.n < 6) return null;
    const mx = c.sx / c.n, my = c.sy / c.n, th = 0.5 * Math.atan2(2 * (c.sxy / c.n - mx * my), c.sxx / c.n - mx * mx - (c.syy / c.n - my * my));
    return { mx, my, ux: Math.cos(th), uy: Math.sin(th), lo: Infinity, hi: -Infinity, vl: Infinity, vh: -Infinity, n: c.n };
  });
  for (let i = 0; i < N; i++) {
    const a = ax[lab[i]];
    if (!a) continue;
    const x = i % w - a.mx, y = (i - (i % w)) / w - a.my, t = x * a.ux + y * a.uy, v = -x * a.uy + y * a.ux;
    if (t < a.lo) a.lo = t;
    if (t > a.hi) a.hi = t;
    if (v < a.vl) a.vl = v;
    if (v > a.vh) a.vh = v;
  }
  const cos15 = Math.cos((15 * Math.PI) / 180), bars = [];
  for (let id = 1; id < nC; id++) {
    const a = ax[id];
    if (!a) continue;
    const L = (a.hi - a.lo + 1) * mpp, thick = (a.n / (a.hi - a.lo + 1)) * mpp, wide = (a.vh - a.vl + 1) * mpp;
    if (L < 2 || L > 25 || thick < 0.8 || thick > 2.4 || wide > 0.3 * L + 2) continue;
    bars.push({ mx: a.mx, my: a.my, ux: a.ux, uy: a.uy, lo: a.lo, hi: a.hi });
  }
  // a bar cut by the line it crosses: its pieces in line, end to end
  const tOf = (A, x, y) => (x - A.mx) * A.ux + (y - A.my) * A.uy, nOf = (A, x, y) => (x - A.mx) * -A.uy + (y - A.my) * A.ux;
  const ends = (B) => [[B.mx + B.ux * B.lo, B.my + B.uy * B.lo], [B.mx + B.ux * B.hi, B.my + B.uy * B.hi]];
  for (let joined = true; joined;) {
    joined = false;
    for (let i = 0; i < bars.length && !joined; i++) for (let j = i + 1; j < bars.length && !joined; j++) {
      const A = bars[i], B = bars[j];
      if (Math.abs(A.ux * B.ux + A.uy * B.uy) < cos15 || Math.abs(nOf(A, B.mx, B.my)) * mpp > 1.2) continue;
      const tB = ends(B).map(([x, y]) => tOf(A, x, y)), b0 = Math.min(...tB), b1 = Math.max(...tB);
      if (Math.max(b0 - A.hi, A.lo - b1) * mpp > 3) continue;
      bars[i] = { ...A, lo: Math.min(A.lo, b0), hi: Math.max(A.hi, b1) };
      bars.splice(j, 1);
      joined = true;
    }
  }
  const long = bars.filter((B) => (B.hi - B.lo) * mpp >= 4 && (B.hi - B.lo) * mpp <= 25);
  for (let i = 0; i < long.length; i++) for (let j = i + 1; j < long.length; j++) {
    const A = long[i], B = long[j];
    if (Math.abs(A.ux * B.ux + A.uy * B.uy) < cos15) continue;
    const d = nOf(A, B.mx, B.my);
    if (Math.abs(d) * mpp < 2.5 || Math.abs(d) * mpp > 9) continue;
    const tB = ends(B).map(([x, y]) => tOf(A, x, y)), lo = Math.max(A.lo, Math.min(...tB)), hi = Math.min(A.hi, Math.max(...tB));
    const la = A.hi - A.lo, lb = Math.abs(tB[1] - tB[0]);
    if (hi - lo < 0.6 * Math.min(la, lb) || Math.min(la, lb) < 0.5 * Math.max(la, lb)) continue;
    // the line crossed: black along the middle between the bars, not all of it
    let n = 0, blk = 0;
    for (let t = lo; t <= hi; t += 0.5) {
      const x = Math.round(A.mx + A.ux * t - A.uy * d / 2), y = Math.round(A.my + A.uy * t + A.ux * d / 2);
      if (x < 0 || y < 0 || x >= w || y >= h) continue;
      n++; if (P.kind[y * w + x] === I_BLACK) blk++;
    }
    if (blk < 2 || blk > 0.6 * n) continue;
    const px = [], seen = new Set();
    for (let t = lo; t <= hi; t += 0.5) for (let v = 0; v <= 1; v += 0.5 / Math.abs(d)) {
      const x = Math.round(A.mx + A.ux * t - A.uy * d * v), y = Math.round(A.my + A.uy * t + A.ux * d * v), k = y * w + x;
      if (x >= 0 && y >= 0 && x < w && y < h && !seen.has(k)) { seen.add(k); px.push(k); }
    }
    out.push({ px, at: [Math.round(A.mx - A.uy * d / 2), Math.round(A.my + A.ux * d / 2)] });
  }
  return out;
}

/**
 * The layers of a sprint photo for cells(), as a vector map's: the objects' area and walls, the course's own lines left out
 * (pts: the course's controls in its order, start and finish included, map px; r: their circles' radius — a wall on a ring, a
 * straight leg, the start's triangle or the finish's circles, mostly in the course's reddish ink, is the course), the walls' facing ends joined across breaks of 2.5 m, the overprint as read.
 */
export function sprintLayers(O, P, pts = [], r = 0) {
  const { w, h, mpp } = O, N = w * h, near = 0.1 * r + 2.5;
  const last = pts.length - 1;
  const onCourse = (x, y) => {
    for (let q = 0; q < pts.length; q++) {
      const d = Math.hypot(x - pts[q][0], y - pts[q][1]);
      if (Math.abs(d - r) <= near) return true;
      // the start's triangle (7 mm against a 6 mm circle) and the finish's two circles (5 and 7 mm) lie within 1.3 r of them
      if ((q === 0 || q === last) && d <= 1.3 * r + near) return true;
      if (q + 1 < pts.length) {
        const [ax, ay] = pts[q], [bx, by] = pts[q + 1], L2 = (bx - ax) ** 2 + (by - ay) ** 2;
        const t = L2 ? ((x - ax) * (bx - ax) + (y - ay) * (by - ay)) / L2 : 0;
        if (t > 0 && t < 1 && Math.hypot(x - ax - t * (bx - ax), y - ay - t * (by - ay)) <= near) return true;
      }
    }
    return false;
  };
  const walls = O.walls.filter((l) => {
    if (!(r > 0) || l.red < 0.3) return true;
    let oc = 0;
    for (const [x, y] of l.pts) if (onCourse(x, y)) oc++;
    return oc < 0.6 * l.pts.length;
  }).map((l) => l.pts);
  // the walls' facing ends joined: an end, the way it leaves, another wall's end within 2.5 m ahead of it (30°), facing it
  const ends = [];
  walls.forEach((l, id) => {
    if (l.length < 3) return;
    for (const [e, f] of [[0, Math.min(3, l.length - 1)], [l.length - 1, Math.max(0, l.length - 4)]]) {
      const [x, y] = l[e], [fx, fy] = l[f], L = Math.hypot(x - fx, y - fy) || 1;
      ends.push({ id, x, y, ux: (x - fx) / L, uy: (y - fy) / L });
    }
  });
  const gap = 2.5 / mpp, cos30 = Math.cos(Math.PI / 6), bridges = [];
  const grid = new Map(), ck = (x, y) => Math.floor(x / gap) * 65536 + Math.floor(y / gap);
  for (const e of ends) { const k = ck(e.x, e.y); if (!grid.has(k)) grid.set(k, []); grid.get(k).push(e); }
  for (const a of ends) {
    let best = null;
    for (let gx = -1; gx <= 1; gx++) for (let gy = -1; gy <= 1; gy++) for (const b of grid.get(ck(a.x + gx * gap, a.y + gy * gap)) || []) {
      if (b.id === a.id) continue;
      const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy);
      if (d < 1 || d > gap || (dx * a.ux + dy * a.uy) / d < cos30 || (-dx * b.ux - dy * b.uy) / d < cos30) continue;
      if (!best || d < best.d) best = { b, d };
    }
    if (best) bridges.push([[a.x, a.y], [best.b.x, best.b.y], a.id, best.b.id]);
  }
  // a dashed line is a path (ISSprOM 505, 506: black dashes 2-3 mm long, 0.25-0.5 mm apart), not a wall: three short pieces or
  // more chained end to end across short gaps, none longer than 3 mm of the map (12 m at 1:4000), are left out with their joins.
  // Where the image tells a line's width a dash is wide enough to read as a wall (2026-11-19: the Auray scan's control 8 shut in
  // by its path's dashes, joined into one wall)
  const lenOf = (l) => { let s = 0; for (let k = 1; k < l.length; k++) s += Math.hypot(l[k][0] - l[k - 1][0], l[k][1] - l[k - 1][1]); return s * mpp; };
  const up = walls.map((_, i) => i), root = (i) => (up[i] === i ? i : (up[i] = root(up[i])));
  // only across a real gap — the paper between two dashes: a wall drawn with ticks or meeting another line is cut into short
  // pieces at each junction, pieces whose ends touch through the ink, and was taken for dashes and left out (2026-11-21: the two
  // ticked walls the route to control 14 of the Auray scan crossed)
  const ink = (x, y) => { const i = Math.round(y) * w + Math.round(x); return P.kind[i] === I_BLACK; };
  for (const [[ax, ay], [bx, by], a, b] of bridges) {
    const d = Math.hypot(bx - ax, by - ay);
    if (d < 2) continue;
    let paper = 0, n = 0;
    for (let t = 0.25; t <= 0.75; t += 0.125) { n++; if (!ink(ax + t * (bx - ax), ay + t * (by - ay))) paper++; }
    if (paper >= 0.6 * n) up[root(a)] = root(b);
  }
  const size = new Map(), longest = new Map();
  walls.forEach((l, i) => { const r0 = root(i), L = lenOf(l); size.set(r0, (size.get(r0) || 0) + 1); longest.set(r0, Math.max(longest.get(r0) || 0, L)); });
  const dashed = (i) => size.get(root(i)) >= 3 && longest.get(root(i)) <= 12;
  const keep = walls.map((_, i) => !dashed(i));
  for (let i = walls.length - 1; i >= 0; i--) if (!keep[i]) walls.splice(i, 1);
  for (let i = bridges.length - 1; i >= 0; i--) if (!keep[bridges[i][2]]) bridges.splice(i, 1);
  const block = new Uint8Array(N);
  const draw = (x0, y0, x1, y1) => {
    const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 2));
    for (let t = 0; t <= n; t++) { const x = Math.round(x0 + ((x1 - x0) * t) / n), y = Math.round(y0 + ((y1 - y0) * t) / n); if (x >= 0 && y >= 0 && x < w && y < h) block[y * w + x] = 1; }
  };
  for (const l of walls) for (let k = 1; k < l.length; k++) draw(l[k - 1][0], l[k - 1][1], l[k][0], l[k][1]);
  for (const [[x0, y0], [x1, y1]] of bridges) draw(x0, y0, x1, y1);
  // the darkest green as a line (a hedge, ISSprOM 411): a pixel wide, it would lose its cell to the ground beside it
  for (let i = 0; i < N; i++) if (O.area[i] === A.G3) block[i] = 1;
  // ISSprOM draws no opening narrower than 0.4 mm (1.6 m at 1:4000) between impassable features: where the image is sharp enough
  // to tell (an impassable line 4 px wide or more: a scan), a wall's end near another wall, a building, olive, water or
  // a hedge is joined to it — two walls meeting at a corner, thinned into lines, left a gap of a metre at their junction that the
  // routes went through (the Auray MD scan's control 3, 2026-11-21)
  if (1.6 / mpp >= 4) {
    // a thinned wall's line runs down its middle and stops half its width short of its end (0.8 m): an opening of the least width
    // ISSprOM draws (1.6 m of paper) is 3.2 m from a line's end to the next wall's line, 2.4 m to a closed area's edge. What is
    // nearer than 2.7 m and 1.4 m, with under 0.6 m of paper between the inks, is a junction the thinning opened
    const rad = Math.max(2, Math.round(2.7 / mpp)), radA = 1.4 / mpp, mine = new Int32Array(N), PAPER = 0.6;
    walls.forEach((l, id) => { for (const [x, y] of l) mine[y * w + x] = id + 1; });
    const ar0 = (i) => { const v = O.area[i]; return v === A.GREY || v === A.BUILDING || v === A.OOB || v === A.WATER; };
    // first each end drawn on along its own ink, as wide as a wall, up to 3 m: a thinned junction loses its middle, and the walls
    // meeting there stopped short of it (a gap of 3 m at that corner)
    const wideEnough = (x, y, ux, uy) => {
      let wd = 1;
      for (const sg of [1, -1]) for (let e = 1; e <= 12; e++) { const X = Math.round(x - sg * uy * e), Y = Math.round(y + sg * ux * e); if (X < 0 || Y < 0 || X >= w || Y >= h || P.kind[Y * w + X] !== I_BLACK) break; wd++; }
      return wd * mpp >= 0.9;
    };
    const tip = new Map();
    walls.forEach((l, id) => {
      if (l.length < 4) return;
      for (const [e, f] of [[0, Math.min(4, l.length - 1)], [l.length - 1, Math.max(0, l.length - 5)]]) {
        const [x, y] = l[e], L = Math.hypot(x - l[f][0], y - l[f][1]) || 1, ux = (x - l[f][0]) / L, uy = (y - l[f][1]) / L;
        // and on under the course's overprint (a leg's line, 0.35 mm), when a wall's black is met beyond it (not an area: the overprint
        // takes the colour of what it crosses, a lane's yellow read as olive)
        const pend = [], over = (i) => { const k = P.kind[i]; return k === I_PURPLE || k === I_LILAC || k === I_GREY || P.redInk?.[i] === 1; };
        const commit = () => { for (const [j, X, Y] of pend) { block[j] = 1; mine[j] = id + 1; tip.set(id * 2 + (e ? 1 : 0), [X, Y]); } pend.length = 0; };
        for (let t = 1; t <= 3 / mpp; t++) {
          const X = Math.round(x + ux * t), Y = Math.round(y + uy * t);
          if (X < 0 || Y < 0 || X >= w || Y >= h) break;
          const i = Y * w + X;
          if (block[i] && mine[i] !== id + 1) { commit(); break; }
          if (ar0(i)) break;
          if (P.kind[i] === I_BLACK && (pend.length || wideEnough(X, Y, ux, uy))) { commit(); block[i] = 1; mine[i] = id + 1; tip.set(id * 2 + (e ? 1 : 0), [X, Y]); continue; }
          if (over(i) && pend.length < 2 / mpp) { pend.push([i, X, Y]); continue; }
          break;
        }
      }
    });
    // another wall's end straight ahead is a dash of a dashed line, or an opening in a wall: the facing ends' business above
    const endNear = new Int32Array(N);
    walls.forEach((l, id) => {
      if (l.length < 3) return;
      for (const e of [0, l.length - 1]) for (const [ex, ey] of [l[e], tip.get(id * 2 + (e ? 1 : 0)) || l[e]]) {
        for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) { const X = ex + dx, Y = ey + dy; if (X >= 0 && Y >= 0 && X < w && Y < h) endNear[Y * w + X] = id + 1; }
      }
    });
    const cos35 = Math.cos((35 * Math.PI) / 180);
    walls.forEach((l, id) => {
      if (l.length < 3) return;
      for (const e of [0, l.length - 1]) {
        const [x, y] = tip.get(id * 2 + (e ? 1 : 0)) || l[e];
        const f = e ? Math.max(0, l.length - 5) : Math.min(4, l.length - 1), L0 = Math.hypot(l[e][0] - l[f][0], l[e][1] - l[f][1]) || 1;
        const ux = (l[e][0] - l[f][0]) / L0, uy = (l[e][1] - l[f][1]) / L0;
        // what the end already reaches through the block, nearby, is its own (a thinned junction leaves short pieces round the
        // end, which the nearest target would be)
        const own = new Set([y * w + x]), fr = [y * w + x];
        for (let depth = 0; depth < 2 * rad + 2 && fr.length; depth++) {
          const nx = [];
          for (const j of fr) { const jx = j % w, jy = (j - jx) / w; for (const [dx, dy] of D8) { const X = jx + dx, Y = jy + dy; if (X < 0 || Y < 0 || X >= w || Y >= h) continue; const q = Y * w + X; if (block[q] && !own.has(q)) { own.add(q); nx.push(q); } } }
          fr.length = 0; fr.push(...nx);
        }
        const cand = [];
        for (let dy = -rad; dy <= rad; dy++) for (let dx = -rad; dx <= rad; dx++) {
          const d = Math.hypot(dx, dy), X = x + dx, Y = y + dy;
          if (d < 1.5 || d > rad || X < 0 || Y < 0 || X >= w || Y >= h) continue;
          const i = Y * w + X;
          if (own.has(i)) continue;
          if (endNear[i] && endNear[i] !== id + 1 && (dx * ux + dy * uy) / d > cos35) continue;
          if (block[i] || (d <= radA && ar0(i))) cand.push({ X, Y, d });
        }
        // the paper between the two inks, not the lines' distance: a wall's end beside a thin line (a passage's edge, an outline)
        // is 1.7 m of paper from it at 2.2 m, a passage the runners take (the Auray scan's leg to 6, 2026-11-21)
        cand.sort((p, q) => p.d - q.d);
        for (const c of cand) {
          let paper = 0;
          const n = Math.ceil(c.d * 2);
          for (let t = 1; t < n; t++) { const i = Math.round(y + ((c.Y - y) * t) / n) * w + Math.round(x + ((c.X - x) * t) / n); if (P.kind[i] < 20 && !block[i]) paper++; }
          if (paper * (c.d / n) * mpp <= PAPER) { draw(x, y, c.X, c.Y); break; }
        }
      }
    });
  }
  // the course's own lines make no area out of bounds: two legs converging or crossing at a narrow angle are closed together by
  // the overprint's reading (overprint(): its closing joins inks a few metres apart), and the ground between them — a street of
  // the Auray scan, legs 12-13 and 13-14 shut, 2026-11-23 — read as hatching. An area whose overprint ink lies on the course's
  // legs and circles for 80 % of it is the course's, not an area out of bounds (a hatched area holds ink all over it)
  let over = P.over;
  if (over && r > 0 && pts.length > 1) {
    // the course drawn once (onCourse's rings, the start's and finish's discs, the legs' bands), then each area of the overprint
    // (its pixels are few: labelled by a fill from each, not over the whole image)
    const course = new Uint8Array(N), lastQ = pts.length - 1;
    for (let q = 0; q < pts.length; q++) {
      const [px0, py0] = pts[q], end = q === 0 || q === lastQ, R = (end ? 1.3 * r : r) + near;
      const lo2 = Math.max(0, r - near) ** 2, hi2 = (r + near) ** 2, disc2 = (1.3 * r + near) ** 2;
      for (let y = Math.max(0, Math.floor(py0 - R)); y <= Math.min(h - 1, Math.ceil(py0 + R)); y++)
        for (let x = Math.max(0, Math.floor(px0 - R)); x <= Math.min(w - 1, Math.ceil(px0 + R)); x++) {
          const d2 = (x - px0) ** 2 + (y - py0) ** 2;
          if ((d2 >= lo2 && d2 <= hi2) || (end && d2 <= disc2)) course[y * w + x] = 1;
        }
      if (q === lastQ) continue;
      const [bx, by] = pts[q + 1], vx = bx - px0, vy = by - py0, L2 = vx * vx + vy * vy, n2 = near * near;
      if (!L2) continue;
      for (let y = Math.max(0, Math.floor(Math.min(py0, by) - near)); y <= Math.min(h - 1, Math.ceil(Math.max(py0, by) + near)); y++) {
        // the band's span on this row (a leg's box would hold many rows of nothing on a long diagonal leg)
        let xa = Math.min(px0, bx) - near, xb = Math.max(px0, bx) + near;
        if (Math.abs(vy) > 1e-9) { const t0 = (y - py0) / vy, sl = Math.abs(vx / vy), xc = px0 + t0 * vx, half = near * Math.hypot(1, sl); xa = Math.max(xa, xc - half); xb = Math.min(xb, xc + half); }
        for (let x = Math.max(0, Math.floor(xa)); x <= Math.min(w - 1, Math.ceil(xb)); x++) {
          const t = ((x - px0) * vx + (y - py0) * vy) / L2;
          if (t <= 0 || t >= 1) continue;
          const ex = x - px0 - t * vx, ey = y - py0 - t * vy;
          if (ex * ex + ey * ey <= n2) course[y * w + x] = 1;
        }
      }
    }
    // on a sharp image, the controls' numbers too (owner, 2026-11-23: the blobs a circle, its leg and its number closed together
    // put the ground round the Quiberon scan's 21, 23 and 24 and the third scan's 9 out of bounds, where the runners ran; the
    // release within 30 m of every control had hidden it, and let the routes through real hatching): a glyph of the course's ink off
    // its lines, as tall as a number is against the circle (0.5-2.4 r: 1.5-7 mm against 6 mm), not thinner than 0.2 r, a fifth to
    // two thirds filled, within 6 r of a control. A stripe of hatching is longer, a cross of a closed area smaller
    const sharpImg = 1.6 / mpp >= 4, inkAt = (i) => (P.redInk ? P.redInk[i] === 1 : P.kind[i] === I_PURPLE);
    const glyph = sharpImg ? new Uint8Array(N) : null;                    // 1 looked at, 2 a number's
    if (sharpImg) {
      const R6 = 6 * r, big = 2.4 * r, gs = [];
      for (const [cx, cy] of pts) for (let y = Math.max(0, Math.floor(cy - R6)); y <= Math.min(h - 1, Math.ceil(cy + R6)); y++)
        for (let x = Math.max(0, Math.floor(cx - R6)); x <= Math.min(w - 1, Math.ceil(cx + R6)); x++) {
          const i0 = y * w + x;
          if (glyph[i0] || course[i0] || !inkAt(i0)) continue;
          const comp = [i0];
          let x0 = x, x1 = x, y0 = y, y1 = y, tooBig = false;
          glyph[i0] = 1; gs.push(i0);
          while (gs.length) {
            const i = gs.pop(), ix = i % w, iy = (i - ix) / w;
            for (const [dx, dy] of D8) {
              const X = ix + dx, Y = iy + dy;
              if (X < 0 || Y < 0 || X >= w || Y >= h) continue;
              const q = Y * w + X;
              if (glyph[q] || course[q] || !inkAt(q)) continue;
              glyph[q] = 1; gs.push(q); comp.push(q);
              if (X < x0) x0 = X; if (X > x1) x1 = X; if (Y < y0) y0 = Y; if (Y > y1) y1 = Y;
              if (x1 - x0 > big || y1 - y0 > big) tooBig = true;
            }
          }
          const bw = x1 - x0 + 1, bh = y1 - y0 + 1, fill = comp.length / (bw * bh), mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
          if (tooBig || Math.max(bw, bh) < 0.5 * r || Math.min(bw, bh) < 0.2 * r || fill < 0.2 || fill > 0.67) continue;
          if (!pts.some(([px0, py0]) => Math.hypot(mx - px0, my - py0) <= R6)) continue;
          for (const i of comp) glyph[i] = 2;
        }
    }
    const seen = new Uint8Array(N), stack = [];
    for (let s0 = 0; s0 < N; s0++) {
      if (over[s0] !== 1 || seen[s0]) continue;
      const px = [s0];
      let ink = 0, on = 0;
      seen[s0] = 1; stack.push(s0);
      while (stack.length) {
        const i = stack.pop(), x = i % w;
        if (sharpImg ? inkAt(i) : P.kind[i] === I_PURPLE) { ink++; on += course[i] || glyph?.[i] === 2 ? 1 : 0; }
        if (x > 0 && !seen[i - 1] && over[i - 1] === 1) { seen[i - 1] = 1; stack.push(i - 1); px.push(i - 1); }
        if (x < w - 1 && !seen[i + 1] && over[i + 1] === 1) { seen[i + 1] = 1; stack.push(i + 1); px.push(i + 1); }
        if (i >= w && !seen[i - w] && over[i - w] === 1) { seen[i - w] = 1; stack.push(i - w); px.push(i - w); }
        if (i + w < N && !seen[i + w] && over[i + w] === 1) { seen[i + w] = 1; stack.push(i + w); px.push(i + w); }
      }
      if (ink && on >= 0.8 * ink) {
        if (over === P.over) over = over.slice();
        for (const i of px) over[i] = 0;
      } else if (sharpImg) {
        // the rest kept where the setter's own marks are — the area's ink off the course and its numbers (the stripes of hatching,
        // ISSprOM's 709 1 mm apart at most: 4 m at 1:4000; crosses) closed by 2 m, which fills between them and stops at the outer
        // ones: the closing that made the area spread it a few metres past them, over the street beside a number and the sidewalk
        // along a closed crossroads (the third scan's 16)
        if (over === P.over) over = over.slice();
        const mark = (i) => inkAt(i) && !course[i] && glyph[i] !== 2;
        const byBlack = (i) => { for (let j = -w; j <= w; j += w) for (let e = -1; e <= 1; e++) if (P.kind[i + j + e] === I_BLACK) return true; return false; };
        trimToInk(px, mark, Math.round(2 / mpp), over, w, Math.round(3 / mpp), (i) => mark(i) && (P.kind[i] === I_PURPLE || !byBlack(i)));
      }
    }
  }
  // the lanes: open ground a pixel or two wide between closed ground on both sides (across, along or slantwise), which a cell
  // of two pixels would lose to the houses beside it (the narrow path north of control 4 on the Auray photo: 1 px, 2026-11-19)
  const lane = new Uint8Array(N), ar = O.area;
  // a strip of ground right inside a building, no outline along either side: ink printed over the house, not ground — a brown
  // contour comes out pale orange over the grey, three pixels of « street » through the house, and the routes ran along it (the
  // Quiberon scan's route to 10, owner 2026-11-24). A building's edge is always drawn: a way between two houses has a black line
  // along one side at least. Up to 1.5 m wide, on a sharp image
  if (1.6 / mpp >= 4) {
    const inB = (i) => ar[i] === A.GREY || ar[i] === A.BUILDING, maxS = Math.max(2, Math.round(1.5 / mpp)), fill = [];
    const scan = (i0, st, n) => {
      for (let t = 1; t < n - 1; t++) {
        if (inB(i0 + t * st) || !inB(i0 + (t - 1) * st)) continue;
        let e = t;
        while (e < n - 1 && !inB(i0 + e * st)) e++;
        if (e < n - 1 && e - t <= maxS) {
          let edge = false;
          for (let u = Math.max(0, t - 2); u <= Math.min(n - 1, e + 1) && !edge; u++) { const q = i0 + u * st; if (P.kind[q] === I_BLACK || block[q] || ar[q] === A.OOB || ar[q] === A.WATER) edge = true; }
          if (!edge) for (let u = t; u < e; u++) fill.push(i0 + u * st);
        }
        t = e;
      }
    };
    for (let y = 0; y < h; y++) scan(y * w, 1, w);
    for (let x = 0; x < w; x++) scan(x, w, h);
    for (const i of fill) ar[i] = A.BUILDING;
  }
  // a gap drawn between two houses (a sharp image): a core — the paper, light and neutral, or its blend with the outlines (grey),
  // or the course's line printed across it — between two black outlines 2-5 px apart (0.7-1.7 m: a house is never that narrow),
  // houses beyond both: the houses' grey blurs over its edges and the gap was one block with them. A passage: its pixels open
  // ground, its core a narrow way's middle (lane 2: its cells open whatever outline shares them). The
  // Auray scan's lane to the stairway of 5-6, 1.3 m between its outlines (owner, 2026-11-23: « misses the choice going through
  // stairs »)
  if (1.6 / mpp >= 4 && O.light) {
    const inB = (i) => ar[i] === A.GREY || ar[i] === A.BUILDING, black = (i) => P.kind[i] === I_BLACK;
    const core = new Uint8Array(N), spans = new Map(), weak = new Map(), seed = new Set(), reachH = Math.round(2 / mpp);
    const ink = (v) => v === I_BLACK || v === I_BROWN || v === I_PURPLE || v === I_MIXED || v === I_LILAC;
    // a house: its grey fill; closed ground: a house, a garden's olive, an area out of bounds or water, or a line running on (no
    // ground within 2 m: a thick wall, the line across a passage's mouth)
    const house = (q) => q >= 0 && P.kind[q] === I_GREY && inB(q);
    const closedAt = (q) => q < 0 || house(q) || P.kind[q] === I_OLIVE || ar[q] === A.OOB || ar[q] === A.WATER;
    for (let y = 6; y < h - 6; y++) for (let x = 6; x < w - 6; x++) {
      const i = y * w + x, v = P.kind[i];
      if (!O.light[i] && v !== I_GREY && v !== I_PURPLE) continue;
      for (const st of [1, w]) {
        let a = 0, b = 0;
        for (let t = 1; t <= 3 && !a; t++) if (black(i - t * st)) a = t;
        for (let t = 1; t <= 3 && !b; t++) if (black(i + t * st)) b = t;
        if (!a || !b || a + b - 1 < 2 || a + b - 1 > 5) continue;
        // houses beyond both outlines (past the line's own pixels, their grey fill): a gap between buildings — not a white strip
        // between two lines, nor between two thick walls (read as building too, but black: a quay's terraces)
        let ea = a, eb = b;
        while (ea < 6 && black(i - (ea + 1) * st)) ea++;
        while (eb < 6 && black(i + (eb + 1) * st)) eb++;
        // (past the lines printed over the house's edge — a contour, the course's line —, within 2 m)
        const beyond = (k, d) => {
          for (let t = 0; t < reachH; t++) {
            const q = k + t * d, v = P.kind[q];
            if (!ink(v)) return q;
          }
          return -1;
        };
        const qa = beyond(i - (ea + 1) * st, -st), qb = beyond(i + (eb + 1) * st, st);
        if (house(qa) && house(qb)) { core[i] = 1; spans.set(i, [st, a, b]); break; }
        // closed ground beyond both, house or not (a garden, a wall, a line running on): the passage carried on past its houses
        if (!weak.has(i) && closedAt(qa) && closedAt(qb)) weak.set(i, [st, a, b]);
      }
    }
    // the passage carried on along its own line, up to 4 m past its houses: between a house and a garden, across the street's
    // edge drawn over its mouth (the Auray scan's lane to 5-6: its last metres between a house and a garden, the paved area's
    // edge across its mouth). A row missed here and there is bridged (two pixels' reach)
    {
      const grow = Math.round(4 / mpp), dist = new Map(), q = [];
      for (const i of spans.keys()) seed.add(i);
      for (const i of spans.keys()) { dist.set(i, 0); q.push(i); }
      for (let h0 = 0; h0 < q.length; h0++) {
        const i = q[h0], d = dist.get(i);
        if (d >= grow) continue;
        for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
          const k = i + dy * w + dx;
          if (!weak.has(k) || dist.has(k)) continue;
          dist.set(k, d + 1); q.push(k); core[k] = 1; spans.set(k, weak.get(k));
        }
      }
    }
    // a passage leads somewhere: 3 m long at least, open ground (no house, olive, water or line) within 4 m beyond each of its
    // ends along it — a lane on through a block. Terraced houses drawn apart, a hairline between them, lead from the street into
    // the gardens or nowhere (ISSprOM shows no passage narrower than 0.4 mm between buildings: such a hairline is no way)
    // (a core a row short here and there: grouped through a pixel's margin)
    const { lab, comps } = components(morph(core, w, h, 1, false), w, h, true);
    const openAt = (k) => !inB(k) && ar[k] !== A.OOB && ar[k] !== A.WATER && !black(k) && (O.warm?.[k] || O.light[k]);
    const ends = comps.map(() => null);
    // (3 m between houses: what was carried on past them does not count)
    const sb = comps.map(() => [Infinity, Infinity, -Infinity, -Infinity]);
    for (const i of seed) { const b = sb[lab[i]], x = i % w, y = (i - x) / w; if (!b) continue; b[0] = Math.min(b[0], x); b[1] = Math.min(b[1], y); b[2] = Math.max(b[2], x); b[3] = Math.max(b[3], y); }
    for (let id = 1; id < comps.length; id++) {
      const c = comps[id], b = sb[id];
      if (!(Math.hypot(b[2] - b[0], b[3] - b[1]) * mpp >= 3)) continue;
      const mx = c.sx / c.n, my = c.sy / c.n, xx = c.sxx / c.n - mx * mx, yy = c.syy / c.n - my * my, xy = c.sxy / c.n - mx * my;
      const th = 0.5 * Math.atan2(2 * xy, xx - yy);
      ends[id] = { mx, my, ux: Math.cos(th), uy: Math.sin(th), lo: Infinity, hi: -Infinity, pl: null, ph: null };
    }
    for (const i of spans.keys()) {
      const e = ends[lab[i]];
      if (!e) continue;
      const x = i % w, y = (i - x) / w, t = (x - e.mx) * e.ux + (y - e.my) * e.uy;
      if (t < e.lo) { e.lo = t; e.pl = [x, y]; }
      if (t > e.hi) { e.hi = t; e.ph = [x, y]; }
    }
    const side = Math.round(2 / mpp), reaches = ([x, y], dx, dy) => {
      for (let t = 1; t <= 4 / mpp; t++) for (let q = -side; q <= side; q++) {
        const X = Math.round(x + dx * t - dy * q), Y = Math.round(y + dy * t + dx * q);
        if (X >= 0 && Y >= 0 && X < w && Y < h && openAt(Y * w + X)) return true;
      }
      return false;
    };
    const keep = ends.map((e) => !!e && reaches(e.pl, -e.ux, -e.uy) && reaches(e.ph, e.ux, e.uy));
    for (const [i, [st, a, b]] of spans) {
      if (!keep[lab[i]]) continue;
      for (let t = 1 - a; t < b; t++) if (!black(i + t * st)) ar[i + t * st] = A.ROUGH;
      lane[i] = 2;
    }
  }
  // a stairway drawn as its treads (ISSprOM 532): a row of three or more small pale squares a step apart (1.2 to 2.6 m), a black
  // bar between each two (a dotted pattern has none), in line — its bars and edges were walls, and the way up to the street by
  // control 14 of the second Auray scan was shut at the top step (owner, 2026-11-23). Opened along its axis and 1.5 m beyond
  // each end, through the line that closes it there (its middle lane 2: the cell is the stair's ground whatever wall shares it)
  const stairs = new Uint8Array(w * h);                   // a stairway's own axis: open through its rungs, however thick
  if (O.pale && 1.6 / mpp >= 4) {
    const { comps: pc } = components(O.pale, w, h, true), big = 2.5 / mpp, tr = [];   // (a tread as wide as its stairway: 2 m and more)
    for (let id = 1; id < pc.length; id++) {
      const c = pc[id];
      if (c.n < 2 || c.x1 - c.x0 + 1 > big || c.y1 - c.y0 + 1 > big) continue;
      tr.push({ x: c.sx / c.n, y: c.sy / c.n, used: false });
    }
    const B = Math.max(4, Math.round(3 / mpp)), bx = Math.ceil(w / B), cell = new Map();
    tr.forEach((t, i) => { const k = Math.floor(t.y / B) * bx + Math.floor(t.x / B); if (!cell.has(k)) cell.set(k, []); cell.get(k).push(i); });
    const near = (x, y, r) => { const out = []; const cx = Math.floor(x / B), cy = Math.floor(y / B); for (let j = cy - 1; j <= cy + 1; j++) for (let i = cx - 1; i <= cx + 1; i++) for (const q of cell.get(j * bx + i) || []) if (Math.hypot(tr[q].x - x, tr[q].y - y) <= r) out.push(q); return out; };
    const barBetween = (a, b) => { for (let t = 0.2; t <= 0.8; t += 0.1) { const x = Math.round(a.x + (b.x - a.x) * t), y = Math.round(a.y + (b.y - a.y) * t); if (P.kind[y * w + x] === I_BLACK) return true; } return false; };
    const dMin = 1.2 / mpp, dMax = 2.6 / mpp;
    for (let i = 0; i < tr.length; i++) {
      if (tr[i].used) continue;
      let bestC = null;
      for (const j of near(tr[i].x, tr[i].y, dMax)) {
        if (j === i || tr[j].used) continue;
        const d = Math.hypot(tr[j].x - tr[i].x, tr[j].y - tr[i].y);
        if (d < dMin || !barBetween(tr[i], tr[j])) continue;
        const ux = (tr[j].x - tr[i].x) / d, uy = (tr[j].y - tr[i].y) / d;
        const walk = (from, sx, sy) => {
          const out = [];
          let cur = from;
          for (;;) {
            // (the next tread, else the one after it: a tread hidden under a thicker rung or another line's ink)
            let k = null;
            for (const m of [1, 2]) {
              const nx = tr[cur].x + sx * d * m, ny = tr[cur].y + sy * d * m, c0 = cur;
              k = near(nx, ny, 0.35 * d).find((q) => q !== c0 && !out.includes(q) && q !== i && q !== j && !tr[q].used);
              if (k != null) break;
            }
            if (k == null || !barBetween(tr[cur], tr[k])) break;
            out.push(k); cur = k;
          }
          return out;
        };
        const c = [...walk(i, -ux, -uy).reverse(), i, j, ...walk(j, ux, uy)];
        if (c.length >= 3 && (!bestC || c.length > bestC.length)) bestC = c;
      }
      if (!bestC) continue;
      for (const k of bestC) tr[k].used = true;
      const A0 = tr[bestC[0]], Z = tr[bestC[bestC.length - 1]], L = Math.hypot(Z.x - A0.x, Z.y - A0.y), ux = (Z.x - A0.x) / L, uy = (Z.y - A0.y) / L, ext = 1.5 / mpp;
      for (let t = -ext; t <= L + ext; t += 0.5) for (const v of [-1, 0, 1]) {
        const x = Math.round(A0.x + ux * t - uy * v), y = Math.round(A0.y + uy * t + ux * v);
        if (x < 0 || y < 0 || x >= w || y >= h) continue;
        const k = y * w + x;
        block[k] = 0; stairs[k] = 1;
        if (ar[k] === A.GREY || ar[k] === A.BUILDING || ar[k] === A.OOB) ar[k] = A.ROUGH;
        if (!v) lane[k] = 2;
      }
    }
  }
  const shut0 = (i) => ar[i] === A.GREY || ar[i] === A.BUILDING || ar[i] === A.OOB || ar[i] === A.WATER || block[i], shut = shut0;
  for (let y = 3; y < h - 3; y++) for (let x = 3; x < w - 3; x++) {
    const i = y * w + x;
    if (shut(i) || (O.warm && !O.warm[i])) continue;
    for (const [dx, dy] of [[1, 0], [0, 1], [1, 1], [1, -1]]) {
      let a = 0, b = 0;
      for (let t = 1; t <= 3 && !a; t++) if (shut(i - t * (dy * w + dx))) a = t;
      for (let t = 1; t <= 3 && !b; t++) if (shut(i + t * (dy * w + dx))) b = t;
      if (a && b && a + b <= 3) { lane[i] = 1; break; }
    }
  }
  // a strip of ground between two thick walls (thickBlack), 1-7 px wide (2.4 m, its blurred edges with it: where a passage
  // meets its stairway's landing) and 3 m long at least, some of it the ground's own warm
  // colour: a passage — the scan prints a metre-wide way between walls as two or three pixels of yellow, which the walls' blur
  // and the reading's fill gave to the walls (the Auray scan's control 14, at the foot of such a passage up to a stairway:
  // owner, 2026-11-25). Its pixels open ground and a narrow way's middle
  if (1.6 / mpp >= 4 && O.thick && O.warm) {
    const tk = (q) => O.thick[q] === 4 || O.thick[q] === 2, gap = new Uint8Array(N), runs = [];
    for (const [st, n0, n1, step] of [[1, h, w, w], [w, w, h, 1]]) {
      for (let a0 = 1; a0 < n0 - 1; a0++) {
        const base = a0 * step;
        for (let t = 2; t < n1 - 6; t++) {
          const i = base + t * st;
          if (tk(i) || !tk(i - st) || !tk(i - 2 * st)) continue;
          let e = 0;
          while (e < 8 && !tk(i + e * st)) e++;
          if (e === 8 || !tk(i + e * st) || !tk(i + (e + 1) * st)) continue;
          let warm = false;
          // (the ground's colour, or its blend with the walls: yellow over olive's hue, a mixed tint — not black, grey or ink)
          for (let u = 0; u < e; u++) { const q = i + u * st, v = P.kind[q]; if ((O.warm[q] && v !== I_BLACK) || v === I_OLIVE || v === I_MIXED || v < 20) warm = true; }
          if (warm) for (let u = 0; u < e; u++) gap[i + u * st] = 1;
          t += e;
        }
      }
    }
    // (a row missed here and there, where the strip's colour is lost in the walls': grouped through a pixel's margin)
    const { lab, comps } = components(morph(gap, w, h, 1, false), w, h, true);
    for (let i = 0; i < N; i++) {
      const id = lab[i];
      if (!id || !gap[i]) continue;
      const c = comps[id];
      if (Math.hypot(c.x1 - c.x0 + 1, c.y1 - c.y0 + 1) * mpp < 3) continue;
      lane[i] = 2; block[i] = 0;
      if (ar[i] === A.GREY || ar[i] === A.BUILDING || ar[i] === A.OOB) ar[i] = A.ROUGH;
    }
  }
  // where the image shows a line's width (a scan), the narrow ways too: open ground up to 3 m wide (with the lines drawn along it) between closed ground or
  // walls on both sides, 3 m long at least — a lane between a house and a garden wall, a passage between two walls. The route
  // grid's cell is as wide as they are and a wall beside them closes every cell it touches: the lane was lost, and the runners'
  // ways through the old town with it (the Auray scan's 12-13, 2026-11-22). Their middle is marked (lane 2: its cell is the
  // lane's ground, whatever wall shares it), and a thin bank (closed ground under two cells deep) is a wall, so that the cell
  // opened never lets through to what lies behind it. A break in a wall is shorter than 3 m: no lane
  if (1.6 / mpp >= 4) {
    const maxW = Math.round(3 / mpp), minLen = 3 / mpp, deep = cellSize(mpp, "sprint");
    // an area out of bounds is a way's side too: the sidewalk between a house and a closed crossroads (the third scan's 15-16,
    // 1.4 m: lost to the cells shared with the hatching)
    // (one side at least is closed ground itself: a gap between two stripes of hatching is no way)
    const shut = (i) => shut0(i) || over?.[i] === 1;
    const mark = new Uint8Array(N);
    // between two buildings a way has an outline along one side at least (a building's edge is always drawn): a light strip
    // right inside the grey is ink printed over the building — a brown contour comes out pale orange over grey, three pixels wide,
    // and was a « lane » through the house (the Quiberon scan's route to 10, owner 2026-11-24)
    const house = (i) => ar[i] === A.GREY || ar[i] === A.BUILDING;
    const edged = (a, b, st) => {
      if (!house(a - st) || !house(b)) return true;
      for (let t = -2; t <= 1; t++) if (P.kind[a + t * st] === I_BLACK || P.kind[b + t * st] === I_BLACK) return true;
      return false;
    };
    // the middle of a run's own ground (its warm pixels: the lines drawn along a way are in the run, and are not its middle)
    const middle = (from, to, st) => {
      if (!O.warm) return from + st * (((to - from) / st - 1) >> 1);
      let a = -1, b = -1;
      for (let k = from; k < to; k += st) if (O.warm[k]) { if (a < 0) a = k; b = k; }
      return a < 0 ? -1 : a + st * (((b - a) / st) >> 1);
    };
    for (let y = 1; y < h - 1; y++) {
      const row = y * w;
      for (let x = 1; x < w - 1; x++) {
        if (shut(row + x) || !shut(row + x - 1)) continue;
        let e = x;
        while (e < w - 1 && !shut(row + e)) e++;
        if (e < w - 1 && e - x >= 2 && e - x <= maxW && (shut0(row + x - 1) || shut0(row + e)) && edged(row + x, row + e, 1)) { const mid = middle(row + x, row + e, 1); if (mid >= 0) mark[mid] |= 1; }
        x = e;
      }
    }
    for (let x = 1; x < w - 1; x++) for (let y = 1; y < h - 1; y++) {
      if (shut(y * w + x) || !shut((y - 1) * w + x)) continue;
      let e = y;
      while (e < h - 1 && !shut(e * w + x)) e++;
      if (e < h - 1 && e - y >= 2 && e - y <= maxW && (shut0((y - 1) * w + x) || shut0(e * w + x)) && edged(y * w + x, e * w + x, w)) { const mid = middle(y * w + x, e * w + x, w); if (mid >= 0) mark[mid] |= 2; }
      y = e;
    }
    // a way pinched to one pixel for a metre or so (its light blended into the lines along it) runs on: a single open pixel
    // between closed ones, next to a way's middle, is its middle too — never a way by itself (a hairline between two houses).
    // The third scan's sidewalk between a house and a closed crossroads, 15-16: two pixels wide, then one, then two (2026-11-25)
    for (let pass = 0, grown = 1; pass < Math.ceil(1.5 / mpp) && grown; pass++) {
      const add = [];
      for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
        const i = y * w + x;
        if (!mark[i]) continue;
        for (let dy = -w; dy <= w; dy += w) for (let dx = -1; dx <= 1; dx++) {
          const q = i + dy + dx;
          if (mark[q] || shut(q)) continue;
          const bit = (shut(q - 1) && shut(q + 1) && (shut0(q - 1) || shut0(q + 1)) ? 1 : 0) | (shut(q - w) && shut(q + w) && (shut0(q - w) || shut0(q + w)) ? 2 : 0);
          if (bit) add.push(q, bit);
        }
      }
      for (let k = 0; k < add.length; k += 2) mark[add[k]] |= add[k + 1];
      grown = add.length;
    }
    // the pieces of a way: each with its line (its pixels' main direction) and its two ends. A contour, the course's line or a
    // north line printed across a way takes the ground of what lies beside it — the gardens — and cut it in two (the Auray
    // scan's lane between 11 and 13): two pieces end to end, in line, 4 m apart at most, with only such ink between them (no
    // wall, no building's grey: a thin black line across a way is a step or a kerb, as everywhere), are one way, and the ink
    // between is the way's ground
    const { lab, comps } = components(mark, w, h, true), banks = [], nC = comps.length;
    const end = comps.map((c) => (c ? { lo: Infinity, hi: -Infinity, a: -1, b: -1 } : null)), axis = comps.map((c) => {
      if (!c) return null;
      const mx = c.sx / c.n, my = c.sy / c.n, xx = c.sxx / c.n - mx * mx, yy = c.syy / c.n - my * my, xy = c.sxy / c.n - mx * my;
      const th = 0.5 * Math.atan2(2 * xy, xx - yy);
      return { mx, my, ux: Math.cos(th), uy: Math.sin(th), len: Math.hypot(c.x1 - c.x0 + 1, c.y1 - c.y0 + 1) };
    });
    for (let i = 0; i < N; i++) {
      const id = lab[i];
      if (!id) continue;
      const A = axis[id], x = i % w, t = (x - A.mx) * A.ux + ((i - x) / w - A.my) * A.uy, e = end[id];
      if (t < e.lo) { e.lo = t; e.a = i; }
      if (t > e.hi) { e.hi = t; e.b = i; }
    }
    const up = new Int32Array(nC).map((_, i) => i), root = (i) => { while (up[i] !== i) { up[i] = up[up[i]]; i = up[i]; } return i; };
    // (and the pale or greenish fringe a blue line leaves over a street: a ground colour, closed only because the reading gave
    // it its neighbours' — beside a blue or erased pixel)
    const blueBy = (k) => { for (let j = -2; j <= 2; j++) for (let i = -2; i <= 2; i++) { const v = P.kind[k + j * w + i]; if (v === I_BLUE || v === I_ERASED) return true; } return false; };
    const inkOnly = (k) => { const v = P.kind[k]; return !block[k] && (v === I_BROWN || v === I_PURPLE || v === I_BLUE || v === I_ERASED || v === I_MIXED || v === I_LILAC || v === I_BLACK || ((v < 20 || v === I_GREY) && blueBy(k))); };
    const ends = [];
    for (let id = 1; id < nC; id++) {
      if (comps[id].n < 3) continue;
      const A = axis[id], e = end[id];
      ends.push({ id, k: e.a, dx: -A.ux, dy: -A.uy }, { id, k: e.b, dx: A.ux, dy: A.uy });
    }
    // from each end, straight on (and up to 30° to either side): through such ink only, to open ground again within 4 m —
    // the way's next piece, or the street it leads to
    const reach = 4 / mpp, joins = [];
    for (const E of ends) {
      const x0 = E.k % w, y0 = (E.k - x0) / w;
      let best = null;
      for (const deg of [0, 15, -15, 30, -30]) {
        const c = Math.cos((deg * Math.PI) / 180), sn = Math.sin((deg * Math.PI) / 180), dx = E.dx * c - E.dy * sn, dy = E.dx * sn + E.dy * c, px = [];
        let ink = 0, hit = -1;
        for (let t = 1; t <= reach * 2; t++) {
          const x = Math.round(x0 + (dx * t) / 2), y = Math.round(y0 + (dy * t) / 2);
          if (x < 1 || y < 1 || x >= w - 1 || y >= h - 1) { hit = -2; break; }
          const k = y * w + x;
          if (px[px.length - 1] === k) continue;
          if (!shut(k)) { if (ink) { hit = k; break; } px.push(k); continue; }       // still the way's own end
          if (!inkOnly(k)) { hit = -2; break; }
          ink++; px.push(k);
        }
        // open all the way: the end is the way's mouth on a street or a square, and its last metres — no longer between two
        // banks, so not marked, yet sharing their cells with the walls beside them — are the way's too
        if (hit === -1 && !ink && !deg && px.length > 2) { best = { px: px.slice(0, Math.round(3 / mpp)), hit: px[px.length - 1] }; break; }
        if (hit >= 0 && (!best || px.length < best.px.length)) best = { px, hit };
      }
      if (!best) continue;
      joins.push({ px: best.px, from: E.k });
      const hx = best.hit % w, hy = (best.hit - hx) / w;
      for (let j = -2, done = false; j <= 2 && !done; j++) for (let i = -2; i <= 2; i++) {
        const o = lab[(hy + j) * w + hx + i];
        if (o && root(o) !== root(E.id)) { up[root(E.id)] = root(o); done = true; break; }
      }
    }
    const total = new Float64Array(nC);
    for (let id = 1; id < nC; id++) total[root(id)] += axis[id].len;
    for (const J of joins) total[root(lab[J.from])] += J.px.length / 2;
    for (let i = 0; i < N; i++) {
      if (!mark[i] || total[root(lab[i])] < minLen) continue;
      lane[i] = 2;
      for (const st of [mark[i] & 1 ? 1 : 0, mark[i] & 2 ? w : 0]) {
        if (!st) continue;
        for (const dir of [-st, st]) {
          let k = i;
          while (!shut(k)) k += dir;
          // a thin bank only (open ground again within two cells): a thick one closes its cells by itself, and walling it
          // closed the way's own mouth where it meets a street
          const strip = [];
          for (let t = 0; t < 2 * deep && k >= 0 && k < N && shut(k); t++, k += dir) strip.push(k);
          // (a thin line of ink alone beside a short way, the wall reading's walls apart, is crossed: no bank — a stairway's treads
          // read as narrow ways side by side, 6 m long at most (the stair's width), its rungs between them, which walled cut the
          // stairway of the Auray scan's 5-6, 2026-11-23. A long way's thin line is its side — the gap inside a street's double
          // line runs on with the street —, as is one with paper white right beyond it)
          if (O.light && total[root(lab[i])] * mpp <= 6 && strip.every((q) => P.kind[q] === I_BLACK && !block[q])) {
            let white = false;
            for (let f = 0, q = k; f < 2 && q >= 0 && q < N; f++, q += dir) if (O.light[q]) white = true;
            if (!white) continue;
          }
          if (strip.length < 2 * deep && k >= 0 && k < N) for (const q of strip) banks.push(q);
        }
      }
    }
    for (const J of joins) if (total[root(lab[J.from])] >= minLen) for (const k of J.px) { lane[k] = 2; ar[k] = ar[J.from]; }
    // a way running aslant: its middle steps corner to corner, and the route grid never slips between two closed cells that
    // touch by a corner — the corner pixel between two such steps is the way's too
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      if (lane[i] !== 2) continue;
      for (const dx of [1, -1]) {
        if (lane[i + w + dx] !== 2 || lane[i + dx] === 2 || lane[i + w] === 2) continue;
        const q = !shut(i + dx) ? i + dx : !shut(i + w) ? i + w : -1;
        if (q >= 0) lane[q] = 2;
      }
    }
    for (const k of banks) block[k] = 1;
  }
  // the two levels of an underpass: the upper level's edge at each mouth is a wall (underpasses: a drop; the passage itself is a
  // link between its mouths). The routes of the Auray scan's 14-15 came along the lower road to the mouth and stepped up onto
  // the viaduct there (owner, 2026-11-23: « jumps one level »)
  for (const u of O.under || []) for (const q of u.edge || []) { block[q] = 1; lane[q] = 0; }
  // solid black as thick as an impassable line (thickBlack): closed all along
  // — as closed ground, which takes a cell by its share of it (a line « any pixel of which closes the cell » shut the metre of
  // yellow between two thick walls on the way to the Auray scan's 14)
  // (4: the black itself — a narrow way's middle marked there is no way: one « carried on under the ink printed across it » ran
  // through the corner of a walled enclosure; beside it, blended dark by it, a way's middle keeps its cell)
  if (O.thick) for (let i = 0; i < N; i++) {
    const v = O.thick[i];
    if (!v || stairs[i]) continue;                         // (a rung joined to the wall beside it is thick black too: the foot of the
    if (v === 4) lane[i] = 0;                             // Auray scan's stairway to 6 was shut by one, 2026-11-24)
    if (lane[i] === 2) continue;
    if (v === 3) block[i] = 1; else O.area[i] = A.BUILDING;
  }
  // the course setter's crossing points (crossingMarks): the line between the two bars is crossed there, whatever it was read as
  // (a wall, the ink of a road's edge given the ground beside it). A road one shall not cross elsewhere is not known
  const marks = crossingMarks(P, w, h, mpp, pts, r);
  if (marks.length && over && over === P.over) over = over.slice();
  for (const c of marks) for (const q of c.px) {
    block[q] = 0;
    const v = P.kind[q];
    if ((ar[q] === A.GREY || ar[q] === A.BUILDING || ar[q] === A.OOB) && (v === I_BLACK || v === I_PURPLE || v === I_BROWN || v === I_MIXED || v === I_LILAC)) ar[q] = A.ROUGH;
    if (over && over[q]) over[q] = 0;
  }
  const z = () => new Uint8Array(N);
  return { area: O.area, path: z(), blue: P.blue, over, north: P.north, block, hand: block.slice(), cross: z(), slow: z(), lane,
    links: (O.under || []).map((u) => [u.a[0], u.a[1], u.b[0], u.b[1]]),
    lw: P.lw, ms: P.ms, lines: P.lines, northLines: P.northLines, objects: { walls: walls.length, under: (O.under || []).length, bridges: bridges.length } };
}

// ---- 2. cells -----------------------------------------------------------------------------------------------------------
/**
 * The cells: cs × cs pixels each. Returns { cs, nx, ny, cls (most frequent area), path (the fastest path kind, gaps bridged
 * included), raw (the same without the bridged gaps), blue (share of blue line pixels, 0-255), north (a north line taken out
 * there) }, a cell full of marsh lines becoming A.MARSH.
 */
/**
 * The route grid's cell, in pixels of the image read: about 1.5 m, and on a sprint map read from a sharp image (0.6 m a pixel
 * or finer: a scan) 0.8 m — ISSprOM's narrowest opening, 1.6 m, then keeps a free cell between the walls on its sides, which
 * 1.5 m cells lost (the Auray scans' lanes and passages, 2026-11-22: the map read at the scan's pixel, the routes on a grid
 * fine enough for what the reading tells).
 */
export function cellSize(mpp, map = "forest") {
  return Math.max(1, Math.round((map === "sprint" && mpp <= 0.6 ? 1.0 : 1.5) / mpp));
}

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
    let p = 0, r = 0, b = 0, n = 0, bl = 0, ha = 0, no = 0, oa = 0, ob = 0, cr = 0, sn = 0, ss = 0, sb = 0, ps = 0, way = -1;
    if (slow) sl.fill(0);
    for (let y = j * cs; y < Math.min(h, (j + 1) * cs); y++) for (let x = i * cs; x < Math.min(w, (i + 1) * cs); x++) {
      const k = y * w + x, v = px.path[k];
      count[px.area[k]]++; b += px.blue[k]; n++;
      if (v) { const t = v & 3; if (t > p) p = t; if (!(v & PATH.BRIDGE) && t > r) r = t; }
      if (px.north?.[k]) no = 1;
      if (px.over) { if (px.over[k] === 1) oa++; else if (px.over[k] === 2) ob = 1; }
      if (vector) { bl |= px.block[k]; ha |= px.hand[k]; }
      if (px.lane && px.lane[k] === 2) way = px.area[k];
      if (cross) cr |= px.cross[k];
      if (slow && px.slow[k]) sl[px.slow[k]]++;
      if (speed && px.speed[k]) { sn++; if (px.speed[k] === 255) sb++; else ss += px.speed[k]; }
      if (pspeed && px.pspeed[k] > ps) ps = px.pspeed[k];
    }
    let best = 0;
    for (let c = 1; c < N_CLASSES; c++) if (count[c] > count[best]) best = c;
    if (px.lane && (best === A.GREY || best === A.BUILDING || best === A.OOB || best === A.WATER)) {
      // a lane through the cell (sprintLayers): the cell is its ground
      let open = -1;
      for (let y = j * cs; y < Math.min(h, (j + 1) * cs) && open < 0; y++) for (let x = i * cs; x < Math.min(w, (i + 1) * cs); x++) if (px.lane[y * w + x]) { open = px.area[y * w + x]; break; }
      if (open >= 0) best = open;
    }
    // a narrow way's middle (sprintLayers, lane 2): the cell is its ground, the wall beside it is not in the way
    if (way >= 0) { best = way; bl = 0; }
    const k = j * nx + i;
    cls[k] = best; path[k] = p; raw[k] = r; blue[k] = Math.round((255 * b) / Math.max(1, n)); north[k] = no;
    // (a narrow way's middle is open ground, whatever area out of bounds shares its cell: a sidewalk along a closed crossroads)
    over[k] = way >= 0 ? 0 : oa * 2 >= n ? 1 : ob ? 2 : 0;
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
  return { cs, nx, ny, cls, path, raw, blue, north, over, vector, block, hand, cross, slow, speed, pspeed, links: px.links || null };
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
  // a sprint map's darkest green is ISSprOM's 411, impassable vegetation (a hedge), or 410, fight (under 20 % of the running speed):
  // shut either way (2026-11-19; the hedge by control 16 of the Auray MD photo)
  if (s.map === "sprint") F[A.G3] = Infinity;
  const bm = G.vector ? "paths" : blackMode(s);                          // a vector map's paths are paths
  const FP = [1, inv(sp.small), inv(sp.path), inv(sp.track)], FS = [1, inv(sp.slow1), inv(sp.slow2), inv(sp.slow3)];
  const f = new Float32Array(M), hand = new Uint8Array(M), isPath = new Uint8Array(M);
  const ov = G.over, rel = G.release;
  // a sprint map's sharp image (a scan: its pixel a third of a metre or less, mpc / cs)
  const sharp = s.map === "sprint" && G.cs && 1.6 / (mpc / G.cs) >= 4;
  // the overprint's areas out of bounds (near a control it is the course's own circle or number: the ground under it counts).
  // Not on a sharp sprint image: there the course's own lines are told apart already (sprintLayers releases an area whose ink lies
  // on the legs and circles) and the release let the routes through the hatching beside the controls — 30 m round each (owner,
  // 2026-11-23: the Quiberon scan's routes to 10 and 20); a control shut in by a misread area is still freed (punchCell)
  const oob = (k) => ov?.[k] === 1 && (sharp || rel?.[k] !== 1);
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
    // under the course's own lines on a photo (courseInk's band one pixel wider: the line and its blend) a way is crossed, not
    // followed: the line blended with the olive and the roofs reads as open ground, and leg 1-2's route of the Quiberon photo ran
    // along control 3's circle between a house and a garden (2026-11-18). Closing such cells when closed ground lies on both sides
    // sealed the controls standing in a lane that leaves their circle aslant, and lanes a leg is drawn along
    if (G.inkBand?.[k] && v < Infinity) v *= INK_SLOW[G.inkBand[k]];
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
  // on a sprint map a runner keeps off walls and houses: a cell touching what is closed costs a little more (the cost alone, not
  // the time shown), so that a route runs down a street rather than along its edge — on the edge's cells, half wall and half
  // street, the line drawn between their centres clipped the outlines, the gardens' olive and the houses' corners (owner,
  // 2026-11-23, the Quiberon scan's 4, 10-11). A lane a cell wide costs that throughout, a little: it is still taken. On a sharp
  // image only: on the photos it moved the routes onto misread ground as often
  if (sharp) {
    const shut = (k) => !(f[k] < Infinity);
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const k = j * nx + i;
      if (shut(k)) continue;
      let by = false;
      for (let dj = -1; dj <= 1 && !by; dj++) for (let di = -1; di <= 1; di++) {
        const I = i + di, J = j + dj;
        if ((di || dj) && I >= 0 && J >= 0 && I < nx && J < ny && shut(J * nx + I)) { by = true; break; }
      }
      if (by) r[k] *= EDGE_COST;
    }
  }
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
export const RISK_DIST = 50;
const EDGE_COST = 1.15;                                  // a sprint map's cell beside a wall or a house: 15 % more to run along                              // metres from a handrail at which the risk is full
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

/**
 * The cells the course's own lines cover on a photo: the rings round the controls (pts, map px, in the course's order; r the
 * circles' radius, px) and the straight legs between them, as wide as the overprint's line (0.35 mm against a circle of 5-6 mm)
 * and the photo's blur, `wider` px more. costs() slows them (G.inkBand, INK_SLOW): the line blended with the gardens and roofs
 * reads as open ground, a way to be crossed, not followed. (2026-11-18, the Quiberon sprint photo; until the same day the black
 * there was no wall either, which opened the fences and walls the circles and legs cross: the course's dark ink is told by its
 * colour instead, kindOf.) Null without a radius, and on a sharp image (mpp: metres a pixel).
 */
export function courseInk(G, pts, r, wider = 0, mpp = 0) {
  // (a sharp image — a scan, where a line's width shows — tells the course's ink from the ground under it: nothing to slow;
  // slowed, a street a leg's line is printed along was avoided for its whole length — the Auray scan's 5-6, 2026-11-22)
  if (mpp > 0 && 1.6 / mpp >= 4) return null;
  if (!(r > 0) || !pts?.length) return null;
  const { nx, ny, cs } = G, out = new Uint8Array(nx * ny), half = 0.1 * r + 1.5 + wider;
  const mark = (x0, y0, x1, y1, test, v) => {
    for (let j = Math.max(0, Math.floor(y0 / cs)); j <= Math.min(ny - 1, Math.floor(y1 / cs)); j++)
      for (let i = Math.max(0, Math.floor(x0 / cs)); i <= Math.min(nx - 1, Math.floor(x1 / cs)); i++) if (test((i + 0.5) * cs, (j + 0.5) * cs) && out[j * nx + i] !== 1) out[j * nx + i] = v;
  };
  const reach = half + 0.5 * cs * Math.SQRT2;
  for (const [x, y] of pts) mark(x - r - reach, y - r - reach, x + r + reach, y + r + reach, (u, v) => Math.abs(Math.hypot(u - x, v - y) - r) <= reach, 1);
  for (let n = 0; n + 1 < pts.length; n++) {
    const [ax, ay] = pts[n], [bx, by] = pts[n + 1], L = Math.hypot(bx - ax, by - ay);
    if (L <= 2 * r) continue;
    const ux = (bx - ax) / L, uy = (by - ay) / L;
    mark(Math.min(ax, bx) - reach, Math.min(ay, by) - reach, Math.max(ax, bx) + reach, Math.max(ay, by) + reach, (u, v) => {
      const t = (u - ax) * ux + (v - ay) * uy;
      return t >= r && t <= L - r && Math.abs((u - ax) * uy - (v - ay) * ux) <= reach;
    }, 2);
  }
  return out;
}

/**
 * An RGBA image brought to W × H by a triangle filter as wide as the shrink (each output pixel the weighted mean of the pixels it
 * covers; an enlargement: bilinear) — the page's own reduction of a large map, the same in every browser. A canvas's drawImage
 * samples without that filter, each browser its own way, and the reading of a scan's metre-wide lanes and thin walls depended
 * on it (owner, 2026-11-24: lanes read on the bench, lost in the page).
 */
export function resample(src, w, h, W, H) {
  if (W === w && H === h) return src;
  const taps = (n, N) => {
    const sc = n / N, sup = Math.max(1, sc), out = new Array(N);
    for (let X = 0; X < N; X++) {
      const c = (X + 0.5) * sc, a = Math.max(0, Math.floor(c - sup)), b = Math.min(n - 1, Math.ceil(c + sup));
      const ws = []; let sum = 0;
      for (let x = a; x <= b; x++) { const wgt = Math.max(0, 1 - Math.abs(x + 0.5 - c) / sup); ws.push(wgt); sum += wgt; }
      out[X] = { a, ws: Float32Array.from(ws, (v) => v / sum) };
    }
    return out;
  };
  const tx = taps(w, W), ty = taps(h, H), mid = new Float32Array(W * h * 3), out = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < h; y++) {
    const row = y * w * 4, o = y * W * 3;
    for (let X = 0; X < W; X++) {
      const { a, ws } = tx[X]; let r = 0, g = 0, b = 0;
      for (let k = 0; k < ws.length; k++) { const p = row + (a + k) * 4, wg = ws[k]; r += src[p] * wg; g += src[p + 1] * wg; b += src[p + 2] * wg; }
      mid[o + X * 3] = r; mid[o + X * 3 + 1] = g; mid[o + X * 3 + 2] = b;
    }
  }
  for (let Y = 0; Y < H; Y++) {
    const { a, ws } = ty[Y];
    for (let X = 0; X < W; X++) {
      let r = 0, g = 0, b = 0;
      for (let k = 0; k < ws.length; k++) { const p = ((a + k) * W + X) * 3, wg = ws[k]; r += mid[p] * wg; g += mid[p + 1] * wg; b += mid[p + 2] * wg; }
      const q = (Y * W + X) * 4; out[q] = r + 0.5; out[q + 1] = g + 0.5; out[q + 2] = b + 0.5; out[q + 3] = 255;
    }
  }
  return out;
}

/**
 * A sharp image made ready to be read, W × H: enlarged to 1.2 times that size, then brought down to it (resample both ways) — a
 * softening of about a pixel, always the same. The reading's rules for a scan (lanes a metre wide, walls of 0.4 mm, a
 * stairway's treads) were set on images softened so; a PDF's scan drawn by the browser comes enlarged without any
 * smoothing, a JPEG as scanned, and each read differently (owner, 2026-11-24).
 */
export function condition(src, w, h, W, H) {
  const w1 = Math.round(1.2 * W), h1 = Math.round(1.2 * H);
  return resample(resample(src, w, h, w1, h1), w1, h1, W, H);
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
  const X = { G, C, h, em, s, len, mpc: Math.min(Math.hypot(...em[0]), Math.hypot(...em[1])), links: null, tun: null };
  // the underpasses (underpasses()): each a link between the open cells at its two mouths, run as the ground there — a lower
  // level of its own: the cells between are what passes over it (a road, a bridge), and a route on one level never steps onto
  // the other. `tun`: the cells under the link's line, with its ground's factor — where a route measured off the grid
  // (segment) passes what is closed above
  for (const [ax, ay, bx, by] of G.links || []) {
    const open = (x, y) => {
      const ci = Math.floor(x / G.cs), cj = Math.floor(y / G.cs);
      let best = -1, bd = Infinity;
      for (let j = cj - 2; j <= cj + 2; j++) for (let i = ci - 2; i <= ci + 2; i++) {
        if (i < 0 || j < 0 || i >= G.nx || j >= G.ny || !(C.f[j * G.nx + i] < Infinity)) continue;
        const d = (i - ci) ** 2 + (j - cj) ** 2;
        if (d < bd) { bd = d; best = j * G.nx + i; }
      }
      return best;
    };
    const a = open(ax, ay), b = open(bx, by);
    if (a < 0 || b < 0 || a === b) continue;
    const L = cellMetres(X, a, b), f = (C.f[a] + C.f[b]) / 2, cost = L * f;
    if (!X.links) { X.links = new Map(); X.tun = new Float32Array(G.nx * G.ny); }
    for (const [u, v] of [[a, b], [b, a]]) { if (!X.links.has(u)) X.links.set(u, []); X.links.get(u).push(v, cost, L); }
    const ai = a % G.nx, aj = (a - ai) / G.nx, bi = b % G.nx, bj = (b - bi) / G.nx, n = 2 * Math.max(Math.abs(bi - ai), Math.abs(bj - aj)) + 1;
    for (let q = 0; q <= n; q++) {
      const i = Math.round(ai + ((bi - ai) * q) / n), j = Math.round(aj + ((bj - aj) * q) / n);
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) { const I = i + di, J = j + dj; if (I >= 0 && J >= 0 && I < G.nx && J < G.ny) X.tun[J * G.nx + I] = f; }
    }
  }
  return X;
}
/** The cost and the length of the link from cell a to cell b (an underpass: context()), or null. */
function linkOf(X, a, b) {
  const L = X.links?.get(a);
  if (L) for (let t = 0; t < L.length; t += 3) if (L[t] === b) return [L[t + 1], L[t + 2]];
  return null;
}

/**
 * The slope of the step a → b (length L), taken over two steps when the path's cell before a (`prev`) or after b (`next`) is
 * known: a way running aslant across a hillside is a staircase of cells on the grid, each step a little up or a little down
 * — with climbing dear and descending cheap, a one-cell lane along a slope cost 68 s of « climb » for 2 m climbed, and the
 * stairway way to the Auray scan's 6 was never offered (owner, 2026-11-24). Over two steps the staircase cancels.
 */
function grade(X, a, b, L, prev, next) {
  const h = X.h, nx = X.G.nx;
  const far = (u, v) => { const ui = u % nx, vi = v % nx, n = NBN.get((vi - ui) * 8 + ((v - vi) - (u - ui)) / nx); return n == null ? 0 : X.len[n]; };
  if (prev >= 0) { const Lp = far(prev, a); if (Lp) return (h[b] - h[prev]) / (L + Lp); }
  if (next >= 0) { const Ln = far(b, next); if (Ln) return (h[next] - h[a]) / (L + Ln); }
  return (h[b] - h[a]) / L;
}
/** The physical time (at 1 s per metre of white forest on the flat), the cost (with the navigation risk) of a step. */
function step(X, a, b, n, prev = -1, next = -1) {
  const { f, r } = X.C;
  const fa = f[a], fb = f[b];
  if (!(fa < Infinity) || !(fb < Infinity)) return null;
  const L = X.len[n], g = X.h ? grade(X, a, b, L, prev, next) : 0;
  const tm = L * ((fa + fb) / 2) * slopeFactor(g, X.s.climb ?? DEFAULTS.climb);
  const x = X.C.cross && crosses(X.C.cross, X.G.nx, a, b, n) ? X.C.xp : 0;
  return [tm + x, tm * ((r[a] + r[b]) / 2) + x];
}
/** A step's cost alone (step()'s second value, the same arithmetic), -1 when either cell is closed: the searches' inner loop,
 *  where an array made per step was a third of their time. */
function stepCost(X, a, b, n, prev = -1, next = -1) {
  const f = X.C.f, fa = f[a], fb = f[b];
  if (!(fa < Infinity) || !(fb < Infinity)) return -1;
  const L = X.len[n], g = X.h ? grade(X, a, b, L, prev, next) : 0, r = X.C.r;
  const tm = L * ((fa + fb) / 2) * slopeFactor(g, X.s.climb ?? DEFAULTS.climb);
  const x = X.C.cross && crosses(X.C.cross, X.G.nx, a, b, n) ? X.C.xp : 0;
  return tm * ((r[a] + r[b]) / 2) + x;
}
const NBX = Int8Array.from(NB, (d) => d[0]), NBY = Int8Array.from(NB, (d) => d[1]);
const NBN = new Map(NB.map(([dx, dy], n) => [dx * 8 + dy, n]));                       // a step's number from its (dx, dy)
/** Whether the step n from cell (i, j) squeezes between blocked cells: a diagonal between two, a knight's move over one. */
function squeezed(X, i, j, n) {
  if (n < 4) return false;
  const { nx } = X.G, f = X.C.f, dx = NBX[n], dy = NBY[n];
  if (n < 8) {
    const p = j * nx + i + dx, q = (j + dy) * nx + i;
    if (f[p] < Infinity || f[q] < Infinity) return false;
    // a leg that found no way otherwise (X.loose) slips between two house corners — a lane read one cell wide, slantwise —, never
    // across a wall
    return !X.loose || !!(X.G.block?.[p] || X.G.block?.[q]);
  }
  { const sx = Math.sign(dx), sy = Math.sign(dy), m1 = Math.abs(dx) === 2 ? j * nx + i + sx : (j + sy) * nx + i, m2 = (j + sy) * nx + i + sx; return !(f[m1] < Infinity) || !(f[m2] < Infinity); }
  return false;
}

/** A* from cell a to cell b within the region { i0, j0, i1, j1, rw, inside (per region cell) }. */
function astar(X, a, b, reg) {
  const { nx } = X.G, { i0, j0, i1, j1, rw } = reg, RN = rw * (j1 - j0 + 1);
  const loc = (k) => { const i = k % nx; return ((k - i) / nx - j0) * rw + (i - i0); };
  const g = new Float64Array(RN).fill(Infinity), from = new Int32Array(RN).fill(-1), done = new Uint8Array(RN);
  const bi = b % nx, bj = (b - bi) / nx, fmin = X.C.fMin * 0.9;
  const hOf = (k) => { const i = k % nx, j = (k - i) / nx, dx = bi - i, dy = bj - j; return fmin * Math.hypot(dx * X.em[0][0] + dy * X.em[1][0], dx * X.em[0][1] + dy * X.em[1][1]); };
  const H = new Heap(), links = X.links;
  g[loc(a)] = 0; H.push(hOf(a), a);
  while (H.n) {
    const k = H.pop(), lk = loc(k);
    if (done[lk]) continue;
    done[lk] = 1;
    if (k === b) break;
    const i = k % nx, j = (k - i) / nx;
    for (let n = 0; n < 16; n++) {
      const I = i + NBX[n], J = j + NBY[n];
      if (I < i0 || J < j0 || I > i1 || J > j1) continue;
      const q = J * nx + I, lq = (J - j0) * rw + (I - i0);
      if (done[lq] || !reg.inside[lq] || squeezed(X, i, j, n)) continue;
      const st = stepCost(X, k, q, n, from[lk]);
      if (st < 0) continue;
      const v = g[lk] + st;
      if (v < g[lq]) { g[lq] = v; from[lq] = k; H.push(v + hOf(q), q); }
    }
    const lk2 = links && links.get(k);
    if (lk2) for (let t = 0; t < lk2.length; t += 3) {
      const q = lk2[t], I = q % nx, J = (q - I) / nx;
      if (I < i0 || J < j0 || I > i1 || J > j1) continue;
      const lq = (J - j0) * rw + (I - i0);
      if (done[lq] || !reg.inside[lq]) continue;
      const v = g[lk] + lk2[t + 1];
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
function tree(X, src, reg, reverse, lim = Infinity, rest = null) {
  const { nx } = X.G, { i0, j0, i1, j1, rw } = reg, RN = rw * (j1 - j0 + 1);
  const loc = (k) => { const i = k % nx; return ((k - i) / nx - j0) * rw + (i - i0); };
  const g = new Float64Array(RN).fill(Infinity), par = new Int32Array(RN).fill(-1), done = new Uint8Array(RN);
  const H = new Heap(), f = X.C.f, links = X.links;
  g[loc(src)] = 0; H.push(0, src);
  while (H.n) {
    const k = H.pop(), lk = loc(k);
    if (done[lk]) continue;
    done[lk] = 1;
    // lim, rest(k): a cell through which no route costs lim or less (its cost so far and the least the rest costs) leads nowhere
    if (rest && g[lk] + rest(k) > lim) continue;
    const i = k % nx, j = (k - i) / nx;
    for (let n = 0; n < 16; n++) {
      const I = i + NBX[n], J = j + NBY[n];
      if (I < i0 || J < j0 || I > i1 || J > j1) continue;
      const q = J * nx + I, lq = (J - j0) * rw + (I - i0);
      if (done[lq] || !reg.inside[lq] || !(f[q] < Infinity) || squeezed(X, i, j, n)) continue;
      const st = reverse ? stepCost(X, q, k, OPP[n], -1, par[lk]) : stepCost(X, k, q, n, par[lk]);
      if (st < 0) continue;
      const v = g[lk] + st;
      if (v < g[lq]) { g[lq] = v; par[lq] = k; H.push(v, q); }
    }
    const lk2 = links && links.get(k);
    if (lk2) for (let t = 0; t < lk2.length; t += 3) {
      const q = lk2[t], I = q % nx, J = (q - I) / nx;
      if (I < i0 || J < j0 || I > i1 || J > j1) continue;
      const lq = (J - j0) * rw + (I - i0);
      if (done[lq] || !reg.inside[lq]) continue;
      const v = g[lk] + lk2[t + 1];
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
    if (n < 0) { const l = linkOf(X, a, b) || [0, 0]; time += l[0]; cost += l[0]; len += l[1]; cum[q] = cost; continue; }
    const st = step(X, a, b, n, q > 1 ? path[q - 2] : -1) || [X.len[n] * 4, X.len[n] * 4];
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
  const cr = X.C.cross, xp = X.C.xp, tun = X.tun;
  if (!d) return out;
  const n = Math.max(1, Math.ceil(d / (X.mpc / 2))), L = d / n;
  // the height at a point: between the cells' centres (a cell's own height read every half cell made a step of each boundary:
  // slopes of 60 % for half a metre, then none)
  const hgt = X.h, zAt = (x, y) => {
    const fx = Math.min(nx - 1, Math.max(0, x - 0.5)), fy = Math.min(ny - 1, Math.max(0, y - 0.5)), i = Math.min(nx - 2, Math.floor(fx)), j = Math.min(ny - 2, Math.floor(fy));
    if (i < 0 || j < 0) return hgt[at(x, y)];
    const a = fx - i, b = fy - j, k = j * nx + i;
    return (hgt[k] * (1 - a) + hgt[k + 1] * a) * (1 - b) + (hgt[k + nx] * (1 - a) + hgt[k + nx + 1] * a) * b;
  };
  // the slope over 2 m of the line at least (four half cells of a metre), as the searches take theirs over two steps
  const span = Math.max(1, Math.round(2 / X.mpc)) , zs = hgt ? Array.from({ length: n + 1 }, (_, s) => zAt(x0 + (u * s) / n, y0 + (v * s) / n)) : null;
  let ka = at(x0, y0);
  for (let s = 1; s <= n; s++) {
    const kb = at(x0 + (u * s) / n, y0 + (v * s) / n);
    let fa = f[ka], fb = f[kb];
    if (tun) { if (!(fa < Infinity) && tun[ka]) fa = tun[ka]; if (!(fb < Infinity) && tun[kb]) fb = tun[kb]; }
    if (!(fa < Infinity) || !(fb < Infinity)) { if (cap == null) return null; fa = Math.min(cap, fa); fb = Math.min(cap, fb); }
    const s0 = Math.max(0, s - 1 - span), s1 = Math.min(n, s + span);
    const g = zs ? Math.max(-1, Math.min(1, (zs[s1] - zs[s0]) / ((s1 - s0) * L))) : 0;
    const flat = L * ((fa + fb) / 2), tm = flat * slopeFactor(g, climb), onP = X.C.isPath[ka] && X.C.isPath[kb];
    out.time += tm; out.cost += tm * ((r[ka] + r[kb]) / 2);
    if (onP) { out.onPath += L; out.parts.path += flat; } else out.parts.off += flat;
    if (g >= 0) out.parts.up += tm - flat; else out.parts.down += tm - flat;
    // a passable line got over: entering it, or slipping between two of its cells at a corner
    if (cr && kb !== ka && !cr[ka]) {
      const di = (kb % nx) - (ka % nx), dj = Math.round((kb - ka - di) / nx);
      if (cr[kb] || (di && dj && cr[ka + di] && cr[ka + dj * nx])) { out.time += xp; out.cost += xp; out.parts.cross += xp; out.parts.xn++; }
    }
    if (zs) out.hs.push(zs[s]);
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

/**
 * A control's own cells made passable for a search (saved: the cells and their costs, to put back): those within 3 cells, when
 * the control stands on what reads as impassable (a boulder, a wall's corner, a house's) or is shut in a few cells (a small
 * feature's outline). A control on open ground beside a fence keeps the fence (the Quiberon photo's 6, on the beach side of
 * one, 5 px from it: every route stepped over it — 2026-11-18).
 */
function freeAround(X, k0, saved) {
  const f = X.C.f;
  if (wayOut(X, k0)) return;
  near(X, [k0], 3, (k) => { if (!(f[k] < Infinity)) { saved.push([k, f[k]]); f[k] = 2; } });
}
/** Whether cell k0 is open and not shut in: a way out to 6 cells, through passable cells. */
function wayOut(X, k0) {
  const { nx, ny } = X.G, f = X.C.f;
  if (!(f[k0] < Infinity)) return false;
  const i0 = k0 % nx, j0 = (k0 - i0) / nx, seen = new Set([k0]), q = [k0];
  for (let h = 0; h < q.length; h++) {
    const k = q[h], i = k % nx, j = (k - i) / nx;
    if (Math.abs(i - i0) >= 6 || Math.abs(j - j0) >= 6) return true;
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const I = i + di, J = j + dj, m = J * nx + I;
      if (I < 0 || J < 0 || I >= nx || J >= ny || seen.has(m) || !(f[m] < Infinity)) continue;
      seen.add(m); q.push(m);
    }
  }
  return false;
}
/**
 * Where a leg reaches the control at map px p: its own cell when open and not shut in; else the nearest open cell within 3 m
 * that is (the place beside the feature where the flag hangs: a wall's side, a house's corner) — the leg in and the leg out
 * reach the control at that one place, from the same side, never across what it stands on (owner, 2026-11-23: the routes
 * stepped over the wall beside the Auray scan's 6, 14 and 20, the cells within 3 m having been opened); else, as before, the
 * cells within 3 m opened (a control shut in by a misread outline). Returns the cell.
 */
function punchCell(X, p, saved, toward = null) {
  const cell = cellOf(X, p), side = toward ? null : X.sides?.get(cell);
  if (side != null && X.C.f[side] < Infinity) return side;
  const c = sideCandidates(X, p);
  if (!c.length) { freeAround(X, cell, saved); return cell; }
  // (a runner's track laid on the map: the side the track arrives on or leaves by)
  if (toward && c.length > 1) {
    const { nx, cs } = X.G, d = (k) => { const i = k % nx; return Math.hypot((i + 0.5) * cs - toward[0], ((k - i) / nx + 0.5) * cs - toward[1]); };
    return c.reduce((u, v) => (d(v) < d(u) ? v : u));
  }
  return c[0];
}
/**
 * The places a control at map px p can be reached at: its own cell when open and not shut in; else, for each separate stretch
 * of open ground within 3 m of it (a wall's two sides, the street and the yard by a house's corner — separate within 6 m round
 * it), its cell nearest the control, the nearest first, those under 1.5 m farther than the nearest only. [] when none.
 */
function sideCandidates(X, p) {
  const { nx, ny, cs } = X.G, f = X.C.f, cell = cellOf(X, p);
  if (wayOut(X, cell)) return [cell];
  const mPerPx = X.mpc / cs, R = Math.ceil(6 / X.mpc), ci = cell % nx, cj = (cell - ci) / nx;
  const dOf = (k) => { const i = k % nx; return Math.hypot((i + 0.5) * cs - p[0], ((k - i) / nx + 0.5) * cs - p[1]) * mPerPx; };
  const inWin = (i, j) => i >= Math.max(0, ci - R) && i <= Math.min(nx - 1, ci + R) && j >= Math.max(0, cj - R) && j <= Math.min(ny - 1, cj + R);
  const comp = new Map(), out = [];
  for (let j = Math.max(0, cj - R); j <= Math.min(ny - 1, cj + R); j++) for (let i = Math.max(0, ci - R); i <= Math.min(nx - 1, ci + R); i++) {
    const k0 = j * nx + i;
    if (comp.has(k0) || !(f[k0] < Infinity)) continue;
    const id = out.length, q = [k0];
    let best = -1, bd = Infinity;
    comp.set(k0, id);
    for (let h = 0; h < q.length; h++) {
      const k = q[h], I = k % nx, J = (k - I) / nx, d = dOf(k);
      if (d <= 3 && d < bd) { bd = d; best = k; }
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const A = I + di, B = J + dj, m = B * nx + A;
        if (!inWin(A, B) || comp.has(m) || !(f[m] < Infinity)) continue;
        comp.set(m, id); q.push(m);
      }
    }
    out.push(best >= 0 && wayOut(X, best) ? [bd, best] : null);
  }
  const c = out.filter(Boolean).sort((u, v) => u[0] - v[0]);
  return c.filter(([d]) => d <= c[0][0] + 1.5).map(([, k]) => k);
}
/**
 * Each control's side, from its two legs (owner, 2026-11-23: « the control description says what side of the wall the control
 * is »; the description is not read, the course is): of the places a control can be reached at (sideCandidates), the one from
 * which the previous control and the next cost least together — the leg in and the leg out then meet there. pts: the course's
 * controls (map px) in its order. Returns a Map, the control's cell → the cell to reach it at (punchCell reads it as X.sides).
 */
export function controlSides(X, pts) {
  const out = new Map(), S = {}, cand = pts.map((p) => sideCandidates(X, p));
  for (let i = 0; i < pts.length; i++) {
    const c = cand[i];
    if (c.length < 2) continue;
    const nb = [i - 1, i + 1].filter((j) => j >= 0 && j < pts.length).map((j) => cand[j][0] ?? cellOf(X, pts[j]));
    if (!nb.length) continue;
    const far = Math.max(...nb.map((k) => cellMetres(X, c[0], k)));
    let best = c[0], bc = Infinity;
    for (const k of c) {
      const r = costsFrom(X, k, nb, nb.map((_, q) => q), 6 * far + 600, S);
      const tot = r.reduce((a, [v]) => a + v, 0);
      if (tot < bc) { bc = tot; best = k; }
    }
    out.set(cellOf(X, pts[i]), best);
  }
  return out;
}

/** The metres between two cells. */
function cellMetres(X, a, b) {
  const { nx } = X.G, ai = a % nx, bi = b % nx, di = bi - ai, dj = (b - bi) / nx - (a - ai) / nx;
  return Math.hypot(di * X.em[0][0] + dj * X.em[1][0], di * X.em[0][1] + dj * X.em[1][1]);
}
/** A search region: the cells whose distances to a and b add up to 2 semi metres at most. */
function ellipse(X, a, b, semi) {
  const { nx, ny } = X.G, ai = a % nx, aj = (a - ai) / nx, bi = b % nx, bj = (b - bi) / nx;
  const R = Math.ceil(semi / X.mpc), ci = (ai + bi) / 2, cj = (aj + bj) / 2;
  const reg = { i0: Math.max(0, Math.floor(ci - R)), j0: Math.max(0, Math.floor(cj - R)), i1: Math.min(nx - 1, Math.ceil(ci + R)), j1: Math.min(ny - 1, Math.ceil(cj + R)) };
  reg.rw = reg.i1 - reg.i0 + 1;
  reg.inside = new Uint8Array(reg.rw * (reg.j1 - reg.j0 + 1));
  // (square roots, not Math.hypot: a fifth of a leg's search went into this mask)
  const e00 = X.em[0][0], e10 = X.em[1][0], e01 = X.em[0][1], e11 = X.em[1][1], two = 2 * semi;
  for (let j = reg.j0; j <= reg.j1; j++) {
    const ja = j - aj, jb = j - bj, row = (j - reg.j0) * reg.rw - reg.i0;
    for (let i = reg.i0; i <= reg.i1; i++) {
      const ia = i - ai, ib = i - bi, xa = ia * e00 + ja * e10, ya = ia * e01 + ja * e11, xb = ib * e00 + jb * e10, yb = ib * e01 + jb * e11;
      reg.inside[row + i] = Math.sqrt(xa * xa + ya * ya) + Math.sqrt(xb * xb + yb * yb) <= two ? 1 : 0;
    }
  }
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
  // a control is always reachable: when no way is found, the walls read inside the circles of its two ends are opened (a small
  // building's outline round a corner control, read as walls, shut the Auray scan's 10 in its courtyard, 2026-11-21), then the
  // slantwise lanes between two closed cells too (that courtyard's way out), then any cell within half a circle, and last any
  // closed ground that is no drawn wall, at a crawl: an area misread (the course's line across a narrow lane read as the gardens
  // beside it: the Auray scan's control 8, 2026-11-21) never leaves a control without a route; a wall still does
  // (q.fallback: how far down that list the leg had to go, 0 for none — a control shut in by a misreading shows there: the
  // Auray scan's 14, reached only « at a crawl » since 2026-11-24, which nothing measured)
  let q = legSearchOnce(X, pa, pb, 0), fallback = 0;
  for (let relax = 1; relax <= 4 && !q.routes?.length; relax++) {
    X.loose = relax >= 2; fallback = relax;
    try { q = legSearchOnce(X, pa, pb, relax === 3 ? 2 : relax === 4 ? 3 : 1); } finally { X.loose = false; }
  }
  q.fallback = fallback;
  return q;
}
function legSearchOnce(X, pa, pb, relax) {
  const { nx, ny, cs } = X.G;
  const cell = (p) => Math.min(ny - 1, Math.max(0, Math.floor(p[1] / cs))) * nx + Math.min(nx - 1, Math.max(0, Math.floor(p[0] / cs)));
  // each control reached at its place (punchCell: beside a wall or a house, the nearest open cell, from that side alone)
  const saved = [], a0 = cell(pa), b0 = cell(pb), a = punchCell(X, pa, saved), b = punchCell(X, pb, saved), L = cellMetres(X, a, b);
  // the region: an ellipse around the leg, wide enough for a detour round a lake or by a track some way off
  const reg = ellipse(X, a, b, 0.75 * L + 150);
  if (relax) {
    // the control circle's radius on the ground: 6 mm at 1:4000 in sprint, about 20 m in forest
    const R = ((X.s.map === "sprint" ? 12 : 20) * (relax === 1 ? 1 : 0.5)) / X.mpc, f = X.C.f;
    if (relax < 3) for (const k0 of [a, b]) near(X, [k0], R, (k) => { if (!(f[k] < Infinity) && (relax === 2 || X.G.block?.[k])) { saved.push([k, f[k]]); f[k] = 2; } });
    else for (let j = reg.j0; j <= reg.j1; j++) for (let i = reg.i0; i <= reg.i1; i++) { const k = j * nx + i; if (!(f[k] < Infinity) && !X.G.block?.[k]) { saved.push([k, f[k]]); f[k] = 15; } }
  }
  try {
    const wantN = Math.max(1, Math.min(4, X.s.variants ?? DEFAULTS.variants)), extra = 1 + (X.s.extra ?? DEFAULTS.extra) / 100;
    // the best way first (A*), then the two trees only as far as a route worth showing can reach: a cell whose best route
    // through it costs more than the slowest variant kept (and the valleys' prominence beyond it) is on none, nor on the way
    // of one — the forward tree stops where its cost and the least the rest can cost pass that, the backward one where the
    // two costs do. The same routes as from the whole region, in a fraction of its cells (2026-11-22: a scan's legs took 8-11 s)
    const first = astar(X, a, b, reg);
    if (!first) return { routes: null, dec: null };
    let c0 = 0;
    for (let q = 1; q < first.length; q++) { const u = first[q - 1], v = first[q], ui = u % nx, vi = v % nx, n = NBN.get((vi - ui) * 8 + (v - vi) / nx - (u - ui) / nx); c0 += n == null ? (linkOf(X, u, v) || [0])[0] : Math.max(0, stepCost(X, u, v, n, q > 1 ? first[q - 2] : -1)); }
    const lim = c0 * extra + Math.max(4, 0.015 * c0) + 1e-6 * c0 + 1;
    const bi0 = b % nx, bj0 = (b - bi0) / nx, fl = X.C.fMin * 0.9;
    const F = tree(X, a, reg, false, lim, (k) => { const i = k % nx, dx = bi0 - i, dy = bj0 - (k - i) / nx; return fl * Math.hypot(dx * X.em[0][0] + dy * X.em[1][0], dx * X.em[0][1] + dy * X.em[1][1]); });
    const loc = F.loc, B = tree(X, b, reg, true, lim, (k) => F.g[loc(k)]);
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
      // drawn to the circle's centre when it stands on open ground; else to the place beside the feature where the control is
      // reached, the point of its cell nearest the centre — a line on to the centre crossed the wall or the house the control
      // stands by, which the runner never does (owner, 2026-11-23: « the route crosses a wall to 6, next to the control »)
      if (a === a0) pts[0] = [pa[0], pa[1]]; else pts[0] = besideAt(X, a, pa);
      if (b === b0) pts[pts.length - 1] = [pb[0], pb[1]]; else pts[pts.length - 1] = besideAt(X, b, pb);
      return { pts, ...m, how: r.how, side: sideOf(pts, pa, pb) };
    }).sort((x, y) => x.cost - y.cost);
    return { routes, dec: { i0, j0, rw, rh, T, best, cs } };
  } finally { for (const [k, v] of saved) X.C.f[k] = v; }
}
/** An area's pixels (px, image indices, row width w) kept only where ink(i) closed by d px covers them (dilated, then eroded:
 *  the space between stripes filled, nothing past the outer ones): over set to 0 elsewhere. A square neighbourhood, on the area's
 *  box, what lies outside the box not eroding it. */
function trimToInk(px, ink, d, over, w, reach = 0, strong = null) {
  const done = () => { for (const i of px) { const x = i % w, y = (i - x) / w; if (!V[(y - y0) * bw + x - x0]) over[i] = 0; } };
  let x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1;
  for (const i of px) { const x = i % w, y = (i - x) / w; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  const bw = x1 - x0 + 1, bh = y1 - y0 + 1, H = new Uint8Array(bw * bh), V = new Uint8Array(bw * bh);
  // ink in the box (an area's own pixels or not: the hatching's edge lies on its border), then a running count along rows and columns
  for (let y = 0; y < bh; y++) {
    let run = 0;
    const row = (y + y0) * w + x0;
    for (let x = -d; x < bw; x++) {
      if (x + d < bw && ink(row + x + d)) run++;
      if (x - d - 1 >= 0 && ink(row + x - d - 1)) run--;
      if (x >= 0) H[y * bw + x] = run > 0 ? 1 : 0;
    }
  }
  for (let x = 0; x < bw; x++) {
    let run = 0;
    for (let y = -d; y < bh; y++) {
      if (y + d < bh && H[(y + d) * bw + x]) run++;
      if (y - d - 1 >= 0 && H[(y - d - 1) * bw + x]) run--;
      if (y >= 0) V[y * bw + x] = run > 0 ? 1 : 0;
    }
  }
  // eroded: a pixel stays when no pixel of the box within d is uncovered
  for (let y = 0; y < bh; y++) {
    let run = 0;
    for (let x = -d; x < bw; x++) {
      if (x + d < bw && !V[y * bw + x + d]) run++;
      if (x - d - 1 >= 0 && !V[y * bw + x - d - 1]) run--;
      if (x >= 0) H[y * bw + x] = run > 0 ? 0 : 1;
    }
  }
  for (let x = 0; x < bw; x++) {
    let run = 0;
    for (let y = -d; y < bh; y++) {
      if (y + d < bh && !H[(y + d) * bw + x]) run++;
      if (y - d - 1 >= 0 && !H[(y - d - 1) * bw + x]) run--;
      if (y >= 0) V[y * bw + x] = run > 0 ? 0 : 1;
    }
  }
  // and between the marks: ink within reach on both sides along a row, a column or a diagonal. A square closing also fills the
  // corner between two marks that lie aslant of each other — the sidewalk a metre wide between a house and the slanting edge of a
  // closed crossroads (the third scan's 15-16, 2026-11-25). `strong`, when given, says which ink counts there (a black line's
  // blend with the ground beside the area is the ink's colour too, and lies along the area's edge, on its far side as well)
  if (!reach) return done();
  const N = over.length, dg = Math.max(1, Math.round(reach / Math.SQRT2)), mark = strong || ink, seek = (i, st, n, xs) => {
    for (let t = 1, k = i + st, x = (i % w) + xs; t <= n && k >= 0 && k < N && x >= 0 && x < w; t++, k += st, x += xs) if (mark(k)) return true;
    return false;
  };
  for (const i of px) {
    const x = i % w, y = (i - x) / w;
    if (!V[(y - y0) * bw + x - x0]) { over[i] = 0; continue; }
    if (ink(i)) continue;
    if (!((seek(i, -1, reach, -1) && seek(i, 1, reach, 1)) || (seek(i, -w, reach, 0) && seek(i, w, reach, 0)) || (seek(i, -w - 1, dg, -1) && seek(i, w + 1, dg, 1)) || (seek(i, -w + 1, dg, 1) && seek(i, w - 1, dg, -1)))) over[i] = 0;
  }
}
/** The point of cell k (map px) nearest map px p, a quarter of a cell inside it. */
function besideAt(X, k, p) {
  const { nx, cs } = X.G, i = k % nx, j = (k - i) / nx, e = 0.25 * cs;
  return [Math.min((i + 1) * cs - e, Math.max(i * cs + e, p[0])), Math.min((j + 1) * cs - e, Math.max(j * cs + e, p[1]))];
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
  // the places each control can be reached at (sideCandidates): the runner's side is the one the track's corridor joins — GPS
  // puts the track a few metres off, on either side of a wall
  const saved = [], ends = [[pa, pts[0] || pb], [pb, pts[pts.length - 1] || pa]].map(([p, t]) => {
    const c = sideCandidates(X, p);
    if (!c.length) return [punchCell(X, p, saved)];
    const d = (k) => { const i = k % nx; return Math.hypot((i + 0.5) * cs - t[0], ((k - i) / nx + 0.5) * cs - t[1]); };
    return c.sort((u, v) => d(u) - d(v));
  });
  let a = ends[0][0], b = ends[1][0];
  // the trace's cells every half cell, from the start control to the finish control
  const line = [], seq = [pa, ...pts, pb];
  for (let i = 1; i < seq.length; i++) {
    const [x0, y0] = seq[i - 1], [x1, y1] = seq[i], n = Math.max(1, Math.ceil((Math.hypot(x1 - x0, y1 - y0) * 2) / cs));
    for (let s = 0; s <= n; s++) { const k = cell([x0 + ((x1 - x0) * s) / n, y0 + ((y1 - y0) * s) / n]); if (line[line.length - 1] !== k) line.push(k); }
  }
  let q = null;
  try {
    // the corridor, widened once if the trace crosses what the model takes for impassable, then the slantwise lanes between two
    // closed cells opened as for a leg that found no way (legSearch)
    const tryAll = (f) => {
      const reg = around(X, line, (f * tolM) / X.mpc);
      for (const u of ends[0]) for (const v of ends[1]) { const r = astar(X, u, v, reg); if (r) { a = u; b = v; return r; } }
      return null;
    };
    for (const f of [1, 2]) { q = tryAll(f); if (q) break; }
    if (!q) { X.loose = true; try { q = tryAll(2); } finally { X.loose = false; } }
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
  for (const k0 of list) freeAround(X, k0, saved);
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
    const c = ov === 2 && !rel ? BAND_RGB : ov === 1 && (rel !== 1 || !(X.C.f[k] < Infinity)) ? CLASS_RGB[A.OOB] : X.C.isPath[k] ? PATH_RGB[path[k]] : (raw[k] || X.G.block?.[k]) && !(X.C.f[k] < Infinity) ? BLOCK_RGB
      : X.G.cross?.[k] ? CROSS_RGB : X.G.north?.[k] ? NORTH_RGB : X.G.slow?.[k] && cls[k] !== A.BUILDING && cls[k] !== A.WATER ? SLOW_RGB[X.G.slow[k]] : CLASS_RGB[cls[k]];
    out[4 * k] = c[0]; out[4 * k + 1] = c[1]; out[4 * k + 2] = c[2]; out[4 * k + 3] = 255;
  }
  return out;
}
