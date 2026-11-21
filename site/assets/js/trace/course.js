// Reading the course printed on the map — the purple overprint: the control circles, the finish's double circle, the
// start triangle, the leg lines — by image analysis in the browser, nothing sent anywhere.
// 1. The ink of the overprint (read at 1800 px at most, smaller when its lines come out wider than 3 px), not its hue:
//    each pixel's optical density over the local background (a closing of each channel over 9 px, which removes the
//    thin lines), and the overprint's ink = the green it absorbs beyond the mean of red and blue. Densities add and
//    the lighting divides out, so the overprint reads the same over white, yellow or green and in an uneven light;
//    black absorbs the three alike (0), brown, yellow, green and blue score below 0. On a phone's photo the overprint
//    comes out a pale greyish lavender, its colour smeared by the JPEG and one side faded by blur, which a hue test
//    loses (2026-10-31: 6 of the 16 controls of the owner's Fougères photo). The mask: ink above a tenth of the map's
//    strongest (the 95th percentile), red and blue absorbed alike (brown and red text absorb blue far more).
// 2. Circles by a Hough vote: every purple pixel votes, at 24 angles, for the centres at each of 20 radii, on a grid
//    of 4 px; the peaks are refined at full resolution by the share of the ring that is purple (72 samples, a pixel of
//    tolerance), and a ring must be hollow inside and clear outside — a small circle laid on a thick line would pass
//    otherwise; radii below 2.5 line widths are not tried; and it must be the overprint's colour and empty of ink
//    inside (a magenta hatching's grid makes rings). The control radius r* is the radius the good circles share; the
//    finish is the larger circle concentric with one of them.
// 3. The leg lines: a purple pixel through which a straight purple run of 2.2 r* passes (12 directions) is a line
//    pixel — the run need not be centred on it, so the lines' ends count. A control is a circle a line reaches; a
//    circle of the right size that no line reaches (a digit's loop, a logo) is dropped when enough are reached. With
//    the rings and lines removed, the purple blobs of the triangle's size are scored against an equilateral triangle
//    (orientation, size and centre searched), as are the circles' centres (the start is often drawn in the finish):
//    the best one is the start.
// 4. The rings the mask missed, on the continuous ink field, at r*: a ridge of ink along the circle (more ink on it
//    than 4 px inside and outside) in most of its sectors, in long arcs, of the colour the controls found share, empty
//    inside and with no straight line across. Measured 2026-10-31 (the Fougères photo; the « Entrainement Gif »
//    course drawn on its scanned map, clean and as two phone photos; the synthetic test maps; two maps without a
//    course): 13/16, 24/24, 24/24 and 12/24 against 6, 24, 3 and 0, no false control on any (3 on the scan before).
// 5. Without colour (2026-11-17, three photos of sprint maps sent through a messaging app, 960 x 1280: the course's
//    lines a pixel wide, the JPEG's colour that of the olive green or the paving around them — nothing purple left but
//    the title's letters, which were read as the controls): the same steps on what is darker than its surroundings and
//    thin. A ring must be all but complete (0.9 with a pixel of tolerance, 0.7 without), 8 px at least; the control
//    radius weighs the rings by their size (letters and tree dots are many and small); a control is reached by a line,
//    is not a hatching's ring, and is alone within 1.2 r*; the finish's two rings 1.15 times apart or more. The start
//    is not read (its triangle is joined to the town's lines, and triangles of dark lines are everywhere); the
//    course's order is read back from the finish along the legs, as far as they lead. Measured: 24/24, 17/18 and 17/17
//    controls and the three finishes, against none; the order of the last 8, the last 6 and all 17 controls.
// Positions come back in the image's own pixels.

const RADII = [6, 7, 8, 9, 10, 11, 12, 13, 15, 17, 19, 21, 23, 26, 29, 32, 36, 40, 45, 50];
/** The reading's version, kept with a calibration: one made by an earlier reading says a better one exists. 2026-10-31:
 *  the ink; 2026-11-01: the course's order and the controls found along the legs; 2026-11-17: the colour-blind reading;
 *  2026-11-18: the passes chosen by how well their legs are inked (align.visitOrder); 2026-11-19: clean scans (a channel its
 *  background absorbs left out of the colour tests, the control radius weighed by size, the description table's boxes);
 *  2026-11-20: on a solid colour reading only the circles a printed leg reaches, and the probes likewise; then every ring all
 *  but whole on the ink field in the course's colour, and on a sharp image only those; 2026-11-21: the start found at the open
 *  end of a leg when no triangle was read. */
export const READER = 8;
const ANGLES = 24, STRIDE = 4;
const DARK_T = 0.4, IN_DARK = 0.45, LEG = 0.75;
/** A channel whose background is under this level (of 256) is already absorbed there: blue over yellow or olive green. */
const DIM = 40;

/** The page given the time to draw: after its next frame when it is in view (a timer would be slowed to one a second
 *  in a tab left in the background, where nothing is drawn anyway: a message then). */
function breathe() {
  return new Promise((done) => {
    const next = () => { const c = new MessageChannel(); c.port1.onmessage = () => { c.port1.close(); done(); }; c.port2.postMessage(0); };
    if (typeof document !== "undefined" && document.visibilityState === "visible" && typeof requestAnimationFrame === "function") requestAnimationFrame(next);
    else next();
  });
}

/**
 * The course printed on the map. Read by the overprint's colour first; when that finds no course whose circles the
 * leg lines join — fewer than three circles, or under 60 % of them joined to another — the map is read again without
 * colour (`dark`: dark thin rings of one size), and that reading is taken when it finds five circles or more, at least
 * 80 % of them joined by legs (a map without a course makes rings here and there, which no straight line joins). A
 * colour reading none of whose circles a leg reaches is letters or a logo: nothing is returned for it.
 * `progress(share, pass)`: called as the reading goes (share 0 to 1, pass 1 the colour reading, 2 the one without),
 * the page left to draw between two steps — the reading takes seconds, and half a minute when both are needed.
 */
export async function detectCourse(image, opts = {}) {
  const say = opts.progress || null;
  const a = await readCourse(image, { ...opts, progress: say && ((f) => say(0.5 * f, 1)) });
  // judged on the circles read before those no leg reaches were dropped (`read`): the drop would make any reading look joined
  const n = a.controls.length, n0 = a.read ?? n;
  if (n >= 3 && a.legged >= Math.max(3, 0.6 * n0)) { say?.(1, 1); return a; }
  const b = await readCourse(image, { ...opts, dark: true, progress: say && ((f) => say(0.5 + 0.5 * f, 2)) });
  say?.(1, 2);
  // (the colour reading's figures kept with the other, for support: `window.anDebug().course.first`)
  b.first = { n, read: n0, legged: a.legged, r: a.r, lw: a.lw };
  // a colour-blind reading that holds is taken unless the colour one joins more controls by legs (a clean scan whose colour
  // reading missed the test by one: 14 joined against the colour-blind reading's 6, the Auray MD scan, 2026-11-20)
  if (b.controls.length >= 5 && b.legged >= 0.8 * b.controls.length && b.legged >= a.legged) return b;
  if (n >= 3 && a.legged >= Math.max(3, b.legged)) return a;
  if (b.controls.length >= 5 && b.legged >= 0.8 * b.controls.length) return b;
  return n >= 3 && !a.legged ? { ...a, controls: [], start: null, finish: null, sequence: null, order: () => null } : a;
}
async function readCourse(image, { maxSide = 1800, debug = false, dark = false, progress = null } = {}) {
  // a step done: said, and the page given a moment to draw it (nothing waits when nobody listens)
  const step = progress ? (f) => { progress(f); return breathe(); } : () => null;
  const W = image.width, H = image.height;
  let s = Math.min(1, maxSide / Math.max(W, H)), w, h, full, lw, lum, ink, tInk, dens, pix;
  // a sharp, large image — read at under 0.6 of its size: a 300 dpi scan — gets the tests a phone's blur would fail
  const sharp = s <= 0.6;
  const canvas = (cw, ch) => (typeof OffscreenCanvas !== "undefined" ? new OffscreenCanvas(cw, ch) : Object.assign(document.createElement("canvas"), { width: cw, height: ch }));
  const read = () => {
    w = Math.max(1, Math.round(W * s)); h = Math.max(1, Math.round(H * s));
    // shrunk by halves to within twice the size, then once: a browser's drawImage samples rather than averages, and a
    // scan's print dots shrunk 2.3 times at once came out as noise — ten false controls on the Quiberon scan (2026-11-20)
    let src = image, sw = W, sh = H;
    while (sw >= 2 * w && sh >= 2 * h) {
      const hw = Math.ceil(sw / 2), hh = Math.ceil(sh / 2), c2 = canvas(hw, hh);
      c2.getContext("2d").drawImage(src, 0, 0, sw, sh, 0, 0, hw, hh);
      src = c2; sw = hw; sh = hh;
    }
    const cv = canvas(w, h);
    const g = cv.getContext("2d", { willReadFrequently: true });
    g.drawImage(src, 0, 0, sw, sh, 0, 0, w, h);
    const data = (pix = g.getImageData(0, 0, w, h).data);
    ({ m: full, M: ink, t: tInk, D: dens } = (dark ? darkMask : inkMask)(data, w, h));
    lw = lineWidth(full, w, h);
    lum = new Uint8Array(w * h);                                          // the lightness, for the finish's rings
    for (let i = 0, p = 0; i < lum.length; i++, p += 4) lum[i] = (299 * data[p] + 587 * data[p + 1] + 114 * data[p + 2]) / 1000;
  };
  await step(0.02);
  read();
  await step(0.22);
  // the reading is made for an overprint line about 3 px wide (its tolerances are in pixels): a sharper image — a
  // phone's photo of the whole map, 4000 px — is read smaller, else the title's letters come out as rings (2026-10-14)
  if (lw > 3) { s *= 3 / lw; read(); await step(0.3); }
  // thick purple — a title, the class names, a logo — is not the course: keep what is thinner than three line widths
  let mask = thinOnly(full, w, h, Math.max(1, Math.round(1.5 * lw)));
  const grid = mask;                                                      // a table's thin grid lines kept for the grid tests
  // on a sharp image, nothing thinner than 2 px: over olive green a scan's brown contours (0.14 mm, under a pixel here) are the
  // course's colour, not its 0.35 mm (2 px) — their loops read as circles and triangles (the Auray scans, 2026-11-20)
  if (sharp && !dark) mask = open2(mask, w, h);
  const dil = dilate(mask, w, h);
  await step(0.34);
  // a ring of the course is the overprint's colour and empty inside (a hatching's grid of lines makes rings too)
  // (the colour-blind reading: any dark ring, and a town's map leaves more inside a circle)
  const coloured = dark ? () => true : (c) => purpleRing(c.cr !== undefined ? c : ringColour(ink, dens, w, h, c.x, c.y, c.r));
  const IN = dark ? IN_DARK : 0.3;
  const genuine = dark ? () => true : (c) => coloured(c) && inkInside(ink, w, h, c.x, c.y, c.r, tInk) <= IN;
  const { circles, rStar, found } = await findCircles(mask, dil, w, h, lw, genuine, dark, (f) => step(0.34 + 0.4 * f), grid);
  let controls = [], finish = null, start = null, startCands = null, added = null;
  if (rStar) {
    controls = circles.filter((c) => c.r >= (dark ? 0.85 : 0.75) * rStar && c.r <= (dark ? 1.18 : 1.25) * rStar);
    // the finish: two concentric rings, the outer 1.25 to 1.6 times the inner — ISOM draws them 5 and 7 mm across
    // around 6 mm control circles, so both come out near a control's size (2026-10-14); else the larger circle
    // concentric with a control-sized one, or alone if clearly a ring
    let pair = null;
    for (const a of circles) for (const b of circles) {
      if (b.r <= a.r || b.r > 1.6 * a.r || b.r < (dark ? 1.15 : 1.25) * a.r || a.r < 0.6 * rStar || b.r > 1.9 * rStar || (dark && b.r < 0.95 * rStar) || Math.hypot(a.x - b.x, a.y - b.y) > 0.3 * a.r) continue;
      const sc = Math.min(a.score, b.score);
      if (!pair || sc > pair.sc) pair = { a, b, sc };
    }
    if (pair) {
      finish = { x: (pair.a.x + pair.b.x) / 2, y: (pair.a.y + pair.b.y) / 2, r1: pair.a.r, r2: pair.b.r, score: pair.sc };
      controls = controls.filter((c) => c !== pair.a && c !== pair.b);
    }
    for (const o of finish ? [] : circles.filter((c) => c.r > 1.25 * rStar && c.r <= 1.8 * rStar).sort((a, b) => b.score - a.score)) {
      const inner = controls.find((c) => Math.hypot(c.x - o.x, c.y - o.y) < 0.35 * rStar);
      if (inner || (o.score >= 0.8 && o.raw >= 0.5)) {
        finish = { x: inner ? (o.x + inner.x) / 2 : o.x, y: inner ? (o.y + inner.y) / 2 : o.y, r1: inner ? inner.r : null, r2: o.r, score: o.score };
        if (inner) controls = controls.filter((c) => c !== inner);
        break;
      }
    }
    await step(0.76);
    const lines = markLines(mask, dil, w, h, rStar, 2.2);
    await step(0.82);
    const longLines = markLines(mask, dil, w, h, rStar, 2.9);              // a triangle's side (2.1 r*) must survive
    await step(0.88);
    // a control circle never overlaps the finish's circles or the start triangle: what is found there is their own
    const nearSymbol = (c) => (finish && Math.hypot(c.x - finish.x, c.y - finish.y) < 1.2 * rStar);
    controls = controls.filter((c) => !nearSymbol(c));
    // a control is where the leg lines go: a circle of the right size that no line reaches (the loop of a digit, a
    // logo) is dropped when enough circles are reached — the lines end at the circles' edges, in a thin ring around
    for (const c of controls) c.touch = ringTouch(lines, w, h, c.x, c.y, c.r);
    const oneEnd = lw * (Math.max(6, 0.5 * rStar) - 2);                  // the line pixels one leg's end leaves in the ring
    // a perfect ring is a control whatever its lines look like (a photo breaks them); a lesser one needs a line
    const reached = controls.filter((c) => c.touch >= Math.max(3, 0.2 * oneEnd) || (!dark && c.score >= 0.75 && c.raw >= 0.5));
    if (reached.length >= 3) controls = reached;
    // colour-blind, the start is not read: a town's lines join the triangle to everything, and where a leg ends many
    // triangles of dark lines score as well as the real one (the page takes the start from the trace, or by hand)
    start = dark ? null
      : findStart(mask, dil, longLines, lines, circles, w, h, rStar, [...controls, ...(finish ? [finish] : [])], debug ? (startCands = []) : null, sharp, grid);
    if (start) controls = controls.filter((c) => Math.hypot(c.x - start.x, c.y - start.y) >= 1.2 * rStar);
    // the course's own ink, and empty inside: not a grey building on olive green, a brown knoll or a magenta hatching
    for (const c of controls) Object.assign(c, ringColour(ink, dens, w, h, c.x, c.y, c.r));
    if (!dark) controls = controls.filter((c) => coloured(c) && inkInside(ink, w, h, c.x, c.y, c.r, tInk) <= IN);
    else {
      // colour-blind: not a ring of a hatching or a texture (as much ink inside and around as on it), and one circle a
      // place — a ring read twice, a pixel or two smaller, is the same control
      controls = controls.filter((c) => !(c.inner >= 0.9 && c.outer >= 0.65));
      const one = [];
      for (const c of [...controls].sort((a, b) => b.score + b.raw - a.score - a.raw)) if (!one.some((k) => Math.hypot(k.x - c.x, k.y - c.y) < 1.2 * rStar)) one.push(c);
      controls = one;
    }
    // the finish likewise — the start triangle may be drawn inside it, so a little more ink is allowed there
    if (finish && (!coloured({ x: finish.x, y: finish.y, r: finish.r2 })
      || (!dark && inkInside(ink, w, h, finish.x, finish.y, finish.r1 ?? finish.r2, tInk) > (finish.r1 ? 0.45 : IN)))) finish = null;
    // the rings the first pass missed — a side faded by a photo's blur, an arc cut by ISOM, over yellow or green —
    // read on the continuous ink field once three controls say what the course looks like: its radius and its ink
    if (controls.length >= 3 && !dark) {
      const known = [...controls, ...(finish ? [{ ...finish, r: finish.r2 }] : []), ...(start ? [{ ...start, r: start.R }] : [])];
      const med = (v) => [...v].sort((p, q) => p - q)[v.length >> 1];
      const cr = med(controls.map((c) => c.cr ?? 0.5)), cb = med(controls.map((c) => c.cb ?? 0.5));
      const free = (c) => !known.some((k) => Math.hypot(k.x - c.x, k.y - c.y) < 1.8 * rStar);   // ISOM: controls never overlap
      if (debug) added = [];
      for (const c0 of ringCandidates(ink, w, h, rStar, tInk)) {
        if (!free(c0)) continue;
        const q = ridgeRing(ink, w, h, c0.x, c0.y, rStar, tInk);
        if (q.score + q.arcs < 0.9) continue;                                // nothing like a ring here: not worth refining
        const c = bestRidge(ink, w, h, c0.x, c0.y, rStar, tInk);
        if (!free(c) || c.score < 0.55 || c.arcs < 0.4 || c.score + c.arcs < 1.3) continue;
        Object.assign(c, ringColour(ink, dens, w, h, c.x, c.y, c.r));
        // a ring all but whole on the ink field, once five controls say what the course looks like, is judged by their colour
        // alone, and a line across it is allowed: a black line or a crossing leg cuts a control's circle, and a ring's
        // own colour over olive green or a grey building is no printer's purple (the Morbihan scans, 2026-11-20: four of
        // their 59 circles — all four found here with near-perfect rings — refused for it). Not redder than the course's,
        // whose blue it shares: a brown contour absorbs red and green alike, and blue
        const fine = controls.length >= 5 && c.score >= 0.85 && c.arcs >= 0.6;
        const ok = (fine || coloured(c))
          && (dark || (fine ? c.cr <= cr + 0.2 && Math.abs(c.cb - cb) <= 0.3 : Math.abs(c.cr - cr) <= 0.3 && Math.abs(c.cb - cb) <= 0.3))
          && inkInside(ink, w, h, c.x, c.y, c.r, tInk) <= IN && (lineAcross(ink, w, h, c.x, c.y, c.r, tInk) < 0.8 || (fine && c.score >= 0.9 && c.arcs >= 0.65));
        if (debug) added.push({ ...c, ok });
        if (ok) { known.push(c); controls.push({ x: c.x, y: c.y, r: c.r, score: c.score, raw: c.arcs, ridge: true }); }
      }
    }
  }
  if (!dark) {
    // a table's boxes: four sides, or three beside another box of three in the same row or column
    const sides = controls.map((c) => boxed(ink, w, h, c.x, c.y, c.r, tInk)), tan6 = Math.tan((6 * Math.PI) / 180);
    const row = (a, b) => { const dx = Math.abs(a.x - b.x), dy = Math.abs(a.y - b.y); return Math.hypot(dx, dy) <= 3 * Math.max(a.r, b.r) && Math.min(dx, dy) <= tan6 * Math.max(dx, dy); };
    controls = controls.filter((c, i) => (sides[i] < 3 || (sides[i] === 3 && !controls.some((o, j) => j !== i && sides[j] >= 3 && row(c, o))))
      && !inGrid(ink, w, h, c.x, c.y, c.r, tInk));
  }
  controls = offTables(controls);
  // the course's own colour, for the probes: the controls' median density ratios; `solid` once the legs join most controls
  let courseCol = null, solid = false;
  if (!dark && controls.length >= 5) {
    const med = (v) => [...v].sort((p, q) => p - q)[v.length >> 1], cs0 = controls.filter((c) => c.cr != null);
    if (cs0.length >= 5) courseCol = { cr: med(cs0.map((c) => c.cr)), cb: med(cs0.map((c) => c.cb)) };
  }
  if (!controls.length) start = null;                                    // no course on this map
  const back = (p) => (p ? { ...p, x: p.x / s, y: p.y / s, r: p.r != null ? p.r / s : undefined } : null);
  /** A ring of the control's size near an image point (within `radius` px), or null. For the page: once the trace is
   *  laid, its sharp turns say where to look for rings the first passes missed; a click in the manual mode says it more
   *  surely (`loose`: weaker evidence is enough). The ridge reading on the ink field first, the mask's rings second. */
  const probe = (X, Y, radius, { loose = false } = {}) => {
    if (!rStar) return null;
    // a sharp image's solid colour reading has read the course's rings: where the trace turns, a scan's town offers corners and pavement
    // lines that pass for faint rings (2026-11-20, the Quiberon scan: 5 such, none a control); a click still probes
    if (solid && sharp && !loose) return null;
    const x0 = X * s, y0 = Y * s, R = Math.max(4, radius * s);
    // the course's ink, empty inside, no line across it; for a click, a faint ring only right under it — two
    // overlapping circles cut where they meet (the Fougères photo's 15 and 16, 2026-10-31) took a click 18 px away
    // and, once five controls say what the course looks like, of their colour and no table's box (a clean scan's town: a corner
    // where the trace turns took 13 rings that were not controls, 2026-11-19)
    const ofCourse = (c) => { if (!courseCol) return true; const q = ringColour(ink, dens, w, h, c.x, c.y, c.r); return q.cr == null || (Math.abs(q.cr - courseCol.cr) <= 0.3 && Math.abs(q.cb - courseCol.cb) <= 0.3); };
    const plain = (c, v) => coloured({ x: c.x, y: c.y, r: c.r }) && inkInside(ink, w, h, c.x, c.y, c.r, tInk) <= IN && lineAcross(ink, w, h, c.x, c.y, c.r, tInk) < 0.8
      && (loose || (ofCourse(c) && boxed(ink, w, h, c.x, c.y, c.r, tInk) < 3 && (!solid || joinedByLeg(c))))
      && (!loose || v >= 1.1 || Math.hypot(c.x - x0, c.y - y0) <= 0.5 * rStar);
    let best = null;
    if (dark) {                                                           // colour-blind: an all but complete ring only
      for (let r = Math.max(4, Math.round(rStar) - 1); r <= Math.round(rStar) + 1; r++) {
        for (let y = Math.round(y0 - R); y <= y0 + R; y += 2) for (let x = Math.round(x0 - R); x <= x0 + R; x += 2) {
          const sc = ringScore(dil, w, h, x, y, r, 48);
          if (!best || sc > best.score) best = { x, y, r, score: sc };
        }
      }
      const c = best && refineCircle(mask, dil, w, h, best.x, best.y, best.r);
      return c && c.score >= (loose ? 0.8 : 0.9) && c.raw >= (loose ? 0.55 : 0.7) && !(c.inner >= 0.9 && c.outer >= 0.65) ? back(c) : null;
    }
    for (let y = Math.round(y0 - R); y <= y0 + R; y += 2) for (let x = Math.round(x0 - R); x <= x0 + R; x += 2) {
      if ((x - x0) ** 2 + (y - y0) ** 2 > R * R) continue;
      const q = ridgeRing(ink, w, h, x, y, rStar, tInk);
      if (!best || q.score + q.arcs > best.v) best = { x, y, v: q.score + q.arcs };
    }
    if (best && best.v >= 0.7) {
      const c = bestRidge(ink, w, h, best.x, best.y, rStar, tInk);
      if (c.score + c.arcs >= (loose ? 0.8 : 1.1) && c.score >= (loose ? 0.4 : 0.55) && c.arcs >= (loose ? 0.25 : 0.35) && plain(c, c.score + c.arcs))
        return back({ x: c.x, y: c.y, r: c.r, score: c.score, raw: c.arcs });
    }
    best = null;
    for (let r = Math.max(4, Math.round(rStar) - 2); r <= Math.round(rStar) + 2; r++) {
      for (let y = Math.round(y0 - R); y <= y0 + R; y += 2) for (let x = Math.round(x0 - R); x <= x0 + R; x += 2) {
        const sc = ringScore(dil, w, h, x, y, r, 48);
        if (!best || sc > best.score) best = { x, y, r, score: sc };
      }
    }
    const c = best && refineCircle(mask, dil, w, h, best.x, best.y, best.r);
    return c && c.score >= (loose ? 0.4 : 0.45) && c.raw >= (loose ? 0.25 : 0.3) && c.inner <= (loose ? 0.4 : 0.35) && (loose || c.outer <= 0.5) && plain(c, c.score + c.raw) ? back(c) : null;
  };
  /**
   * The finish's double circle near an image point (within `radius` px), read from the lightness, not the colour: the
   * overprint over yellow comes out brown, over water dark blue, and a black line or a building may cover a part of it
   * (the owner's photo, 2026-10-14). Along each of 36 rays from a candidate centre the lightness must go light (inside),
   * dark (inner ring), light (between), dark (outer ring), light (outside); a ray crossed by something dark fails. A
   * map's texture (concentric contours round a knoll, vegetation) passes rays here and there: the rings must hold on
   * half the rays and on three quarters of the circle at least (each quarter with 40 % of its rays). The inner ring 0.7
   * to 1.05 r*, the outer 1.3 to 1.5 times it. Returns { x, y, r1, r2, score }. Meant for a small area — where
   * the trace ends: elsewhere a map's texture can pass as well.
   */
  const probeFinish = (X, Y, radius) => {
    if (!rStar) return null;
    const x0 = X * s, y0 = Y * s, R = Math.max(4, radius * s), N = 36, D = 22;
    const cs = Array.from({ length: N }, (_, k) => Math.cos((2 * Math.PI * k) / N)), sn = cs.map((_, k) => Math.sin((2 * Math.PI * k) / N));
    const L = (x, y) => lum[Math.round(y) * w + Math.round(x)];
    const score = (cx, cy, r1, r2) => {
      const rm = (r1 + r2) / 2, rin = 0.5 * r1, rout = r2 + (r2 - r1) / 2;
      if (cx - rout - 2 < 0 || cy - rout - 2 < 0 || cx + rout + 2 >= w || cy + rout + 2 >= h) return 0;
      let ok = 0;
      const quarter = [0, 0, 0, 0];
      for (let k = 0; k < N; k++) {
        const c = cs[k], d = sn[k];
        const dark = (r) => Math.min(L(cx + c * (r - 1), cy + d * (r - 1)), L(cx + c * r, cy + d * r), L(cx + c * (r + 1), cy + d * (r + 1)));
        const light = (r) => Math.max(L(cx + c * (r - 1), cy + d * (r - 1)), L(cx + c * r, cy + d * r), L(cx + c * (r + 1), cy + d * (r + 1)));
        const a = dark(r1), b = light(rm), e = dark(r2);
        if (b - a >= D && b - e >= D && light(rout) - e >= D && light(rin) - a >= D) { ok++; quarter[(4 * k / N) | 0]++; }
      }
      const quarters = quarter.filter((q) => q >= 0.4 * (N / 4)).length;
      return quarters >= 3 ? ok / N : 0;
    };
    let best = null;
    const radii = [];
    for (let r1 = Math.max(3, Math.round(0.7 * rStar)); r1 <= Math.round(1.05 * rStar); r1++) for (const q of [1.3, 1.4, 1.5]) radii.push([r1, r1 * q]);
    // a 2 px grid, then the best spot refined to the pixel
    for (let cy = Math.round(y0 - R); cy <= y0 + R; cy += 2) for (let cx = Math.round(x0 - R); cx <= x0 + R; cx += 2) {
      for (const [r1, r2] of radii) { const sc = score(cx, cy, r1, r2); if (!best || sc > best.score) best = { x: cx, y: cy, r1, r2, score: sc }; }
    }
    if (!best || best.score < 0.3) return null;
    const c0 = best;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) for (const [r1, r2] of radii) {
      if (Math.abs(r1 - c0.r1) > 1) continue;
      const sc = score(c0.x + dx, c0.y + dy, r1, r2);
      if (sc > best.score) best = { x: c0.x + dx, y: c0.y + dy, r1, r2, score: sc };
    }
    return best.score >= 0.5 ? { x: best.x / s, y: best.y / s, r1: best.r1 / s, r2: best.r2 / s, score: best.score } : null;
  };
  /**
   * The start, when its triangle was not read (the colour-blind reading): on the leg printed into the first control,
   * where the runner waited. `first` [x, y] the first control, `before` the trace before it, [x, y, t] in image pixels
   * and seconds (the page's, once the trace is laid). From the control's circle, every straight inked run leaving it
   * (80 % inked, two radii long at least) that leads to no symbol read is a leg the start may be at the end of — the
   * run itself often goes on past the triangle, along a town's other lines —; on each, the stretches of one radius
   * where the runner stood eight seconds or more within a radius of the line (a runner waits at the start; elsewhere
   * they pass in three or four). The run with the most time waited wins, and on it the last wait: a runner called up
   * a minute early waits further back first (the third photo: a minute 40 m behind the triangle, then nine seconds
   * at it). Returns { x, y, wait } or null; `all` lists the runs.
   */
  const probeStart = (first, before, all = null) => {
    if (!rStar || !before || before.length < 2) return null;
    const from = { x: first[0] * s, y: first[1] * s }, P = before.map((q) => [q[0] * s, q[1] * s, q[2]]);
    const syms = [...controls.map((c) => ({ x: c.x, y: c.y, r: rStar })), ...(finish ? [{ x: finish.x, y: finish.y, r: finish.r2 }] : [])]
      .filter((q) => Math.hypot(q.x - from.x, q.y - from.y) > 0.5 * rStar);
    const r0 = 1.25 * rStar;
    const runs = [];
    for (let deg = 0; deg < 360; deg += 1) {
      const ux = Math.cos((deg * Math.PI) / 180), uy = Math.sin((deg * Math.PI) / 180);
      let f0 = -1, last = -1, on = 0;
      for (let d = r0; d <= 80 * rStar; d += 1) {
        if (inkNear(from.x + d * ux, from.y + d * uy, ux, uy)) { if (f0 < 0) f0 = d; last = d; on++; }
        else if (f0 >= 0 && d - last > 0.6 * rStar) break;
        else if (f0 < 0 && d - r0 > 0.5 * rStar) break;
      }
      if (f0 < 0 || last - f0 < 2 * rStar || on < 0.8 * (last - f0 + 1)) continue;
      if (syms.some((q) => { const vx = q.x - from.x, vy = q.y - from.y, a = vx * ux + vy * uy; return a > 0 && a < last + 2.5 * rStar && Math.abs(vx * uy - vy * ux) < 1.1 * Math.max(rStar, q.r); })) continue;
      // the time spent beside the line, by stretches of half a radius; the best pair of neighbours
      const far = last + 1.5 * rStar, n = Math.ceil(far / (0.5 * rStar)) + 1, wait = new Float32Array(n), sum = new Float32Array(n), when = new Float64Array(n);
      for (let k = 0; k + 1 < P.length; k++) {
        const vx = P[k][0] - from.x, vy = P[k][1] - from.y, a = vx * ux + vy * uy;
        if (a < 3 * rStar || a > far || Math.abs(vx * uy - vy * ux) > rStar) continue;
        const dt = Math.min(5, Math.max(0, P[k + 1][2] - P[k][2])), b = Math.floor(a / (0.5 * rStar));
        wait[b] += dt; sum[b] += dt * a; when[b] += dt * P[k][2];
      }
      const waits = [];
      for (let b = 0; b + 1 < n; b++) {
        const v = wait[b] + wait[b + 1];
        if (v >= 8) { const a = (sum[b] + sum[b + 1]) / v; waits.push({ x: from.x + a * ux, y: from.y + a * uy, wait: v, t: (when[b] + when[b + 1]) / v }); }
      }
      if (!waits.length) continue;
      const c = { deg, f0, last, len: last - f0, total: Math.max(...waits.map((q) => q.wait)), waits };
      runs.push(c);
      if (all) all.push({ deg, len: c.len / s, total: c.total, waits: waits.map((q) => ({ ...q, x: q.x / s, y: q.y / s })) });
    }
    if (!runs.length) return null;
    // the run that saw the most waiting, with the runs a degree or three from it (one printed line): its last wait
    const top = runs.reduce((p, q) => (q.total > p.total ? q : p));
    const pool = runs.filter((q) => Math.min(Math.abs(q.deg - top.deg), 360 - Math.abs(q.deg - top.deg)) <= 3).flatMap((q) => q.waits);
    const best = pool.reduce((p, q) => (q.t > p.t + 1 || (q.t > p.t - 1 && q.wait > p.wait) ? q : p));
    // the triangle itself, now that the place is narrow (owner, 2026-11-17): on that line, from the wait toward the
    // first control, a tip pointing at the control
    const tri = triangleOnLeg(from, best, legColour(from, top), all && (all.tri = []));
    return tri ? { x: tri.x / s, y: tri.y / s, R: tri.R / s, wait: best.wait, triangle: true } : { x: best.x / s, y: best.y / s, wait: best.wait };
  };
  /** A start triangle on the line from `at` (where the runner waited) to the first control `from`: an equilateral
   *  triangle of 0.55 to 0.9 r* (measured on three town sprints: 0.6-0.8), one tip toward the control (± 12°), its centre within half a radius of the line, from
   *  two radii behind the wait to ten before it (the start line may lie well before the triangle, along a marked
   *  route), never within 2.5 r* of the control. Each side read on the mask (the share inked, a pixel of tolerance);
   *  the weakest side counts, the middle must not be filled (a line across it is fine: the magnetic north lines), the same
   *  triangle half as large again must find little ink — lines of a town meet in triangles, a drawn
   *  triangle stands alone —, and the nearest to the wait wins among those nearly as good. */
  /** The colour of the printed leg a run follows: the ink pixels along it, their red and blue less their green (the
   *  overprint's purple keeps them apart from the map's black and grey lines whatever the light), the median of each. */
  function legColour(from, run) {
    const ux = Math.cos((run.deg * Math.PI) / 180), uy = Math.sin((run.deg * Math.PI) / 180), rb = [], bg = [];
    for (let d = run.f0; d <= run.last; d += 0.5) for (let o = -1; o <= 1; o++) {
      const x = Math.round(from.x + d * ux - o * uy), y = Math.round(from.y + d * uy + o * ux);
      if (x < 0 || y < 0 || x >= w || y >= h || !full[y * w + x]) continue;
      const p = 4 * (y * w + x); rb.push(pix[p] - pix[p + 1]); bg.push(pix[p + 2] - pix[p + 1]);
    }
    if (rb.length < 10) return null;
    const med = (a) => a.sort((p, q) => p - q)[a.length >> 1];
    return [med(rb), med(bg)];
  }
  function triangleOnLeg(from, at, colour, list = null) {
    const L = Math.hypot(at.x - from.x, at.y - from.y);
    if (L < 3 * rStar) return null;
    const ux = (at.x - from.x) / L, uy = (at.y - from.y) / L, back0 = Math.atan2(-uy, -ux);
    // the leg's colour, when it has one (its red and blue above its green): a side's point counts only when an ink pixel
    // within a pixel of it shares that colour — a town's black and grey lines meet in triangles everywhere
    const cn = colour && Math.hypot(colour[0], colour[1]) >= 8 ? Math.hypot(colour[0], colour[1]) : 0;
    const like = (x, y) => {
      if (!cn) return dil[y * w + x];
      for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
        const X = x + i, Y = y + j;
        if (X < 0 || Y < 0 || X >= w || Y >= h || !full[Y * w + X]) continue;
        const p = 4 * (Y * w + X), a = pix[p] - pix[p + 1], b = pix[p + 2] - pix[p + 1];
        if ((a * colour[0] + b * colour[1]) / cn >= 0.5 * cn) return 1;
      }
      return 0;
    };
    const side = (ax, ay, bx, by) => { let n = 0; for (let q = 0; q < 16; q++) { const f = (q + 0.5) / 16, x = Math.round(ax + f * (bx - ax)), y = Math.round(ay + f * (by - ay)); if (x >= 0 && y >= 0 && x < w && y < h && like(x, y)) n++; } return n / 16; };
    const tri = (cx, cy, R, th) => {
      const V = [0, 1, 2].map((m) => [cx + R * Math.cos(th + (2 * Math.PI * m) / 3), cy + R * Math.sin(th + (2 * Math.PI * m) / 3)]);
      return Math.min(side(V[0][0], V[0][1], V[1][0], V[1][1]), side(V[1][0], V[1][1], V[2][0], V[2][1]), side(V[2][0], V[2][1], V[0][0], V[0][1]));
    };
    const filled = (cx, cy, r) => { let n = 0, k = 0; for (let y = Math.floor(cy - r); y <= cy + r; y++) for (let x = Math.floor(cx - r); x <= cx + r; x++) if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r && x >= 0 && y >= 0 && x < w && y < h) { k++; if (full[y * w + x]) n++; } return k ? n / k : 1; };
    const found = [];
    for (let a = Math.max(2.5 * rStar, L - 10 * rStar); a <= L + 2 * rStar; a += 1) for (let o = -0.5 * rStar; o <= 0.5 * rStar; o += 1) {
      const cx = from.x + a * ux - o * uy, cy = from.y + a * uy + o * ux;
      for (const k of [0.55, 0.6, 0.65, 0.7, 0.75, 0.8, 0.85, 0.9]) for (let da = -12; da <= 12; da += 4) {
        const R = k * rStar, th = back0 + (da * Math.PI) / 180;
        const weak = tri(cx, cy, R, th);
        if (weak < 0.8) continue;
        if (filled(cx, cy, 0.35 * R) > 0.5) continue;      // filled: no triangle's hollow (a line across it is fine)
        // a drawn triangle, not lines of the map that happen to meet: the same shape smaller and larger finds no ink
        const score = weak - tri(cx, cy, 1.5 * R, th);
        if (score < 0.4) continue;
        const c = { x: cx, y: cy, R, weak, score, far: Math.abs(a - L) };
        if (list) list.push({ x: cx / s, y: cy / s, R: R / s, k, weak: score, far: c.far / s });
        found.push(c);
      }
    }
    if (!found.length) return null;
    const top = Math.max(...found.map((c) => c.score));
    return found.filter((c) => c.score >= top - 0.07).reduce((p, q) => (q.far < p.far ? q : p));
  }
  /** The share of the straight way between two symbols (image points, each left at 1.3 r*) inked with the
   *  overprint, within a pixel and a half of the line: a leg printed from one to the other comes near 1 (ISOM cuts it
   *  here and there), two symbols no leg joins near 0. For the page: the legs say which controls follow each other. */
  const leg = (A, B) => (rStar ? legIn(A[0] * s, A[1] * s, B[0] * s, B[1] * s, 1.3 * rStar, 1.3 * rStar) : 0);
  function legIn(ax, ay, bx, by, ma, mb, skip = null) {
    const L = Math.hypot(bx - ax, by - ay);
    if (L < ma + mb + 4) return 0;
    const ux = (bx - ax) / L, uy = (by - ay) / L;
    let n = 0, on = 0;
    for (let u = ma; u <= L - mb; u += 1) {
      const x = ax + u * ux, y = ay + u * uy;
      // (`skip`: other symbols the way crosses — ISOM cuts a leg where it passes through another circle)
      if (skip && skip.some((q) => Math.hypot(q.x - x, q.y - y) < 1.3 * q.r)) continue;
      n++; if (inkNear(x, y, ux, uy)) on++;
    }
    return n ? on / n : 0;
  }
  // ink at a point of a straight way, within a pixel and a half across it
  function inkNear(x, y, ux, uy) {
    for (const o of [-1.5, 0, 1.5]) {
      const X = Math.round(x - o * uy), Y = Math.round(y + o * ux);
      if (X >= 0 && Y >= 0 && X < w && Y < h && ink[Y * w + X] >= tInk / 2) return true;
    }
    return false;
  }
  // the course in its order, read as a runner reads the map — not from the trace (owner, 2026-11-01: the trace had
  // numbered 8 before 5, 6, 7): from the start triangle along the legs, and back from the finish along them; where a
  // leg leads to no circle found, the circle is looked for at its end (the photo's 15 and 16, 2026-11-01)
  // a solid colour reading — ten controls or more, half of them at least, joined to another by a printed leg (a clean scan) —
  // keeps only the circles a leg reaches: the rest are a town's rings (the outlines' colour fringes, a box, a corner), which
  // the trace then took for controls (2026-11-19, the Quiberon scan: 15 false beside 20 true); the probes likewise
  // (the reading is solid on legs inked over LEG of their way; a circle is kept when half its way is: ISOM cuts a leg at the
  // features it crosses, and a ring no leg reaches has next to none)
  function joinedByLeg(a, q = 0.5) {
    const others = [...controls, ...(start ? [{ x: start.x, y: start.y, r: start.R }] : [])];
    return others.some((b) => b !== a && Math.hypot(b.x - a.x, b.y - a.y) > 0.5 * rStar && legIn(a.x, a.y, b.x, b.y, 1.3 * rStar, 1.3 * rStar) >= q)
      || (finish && legIn(a.x, a.y, finish.x, finish.y, 1.3 * rStar, 1.1 * finish.r2) >= q);
  }
  const med = (v) => (v.length ? [...v].sort((p, q) => p - q)[v.length >> 1] : null);
  /** The width of a ring's line in the image's own pixels (x, y, r too): the ink across it at 72 points, read on a crop at full
   *  resolution — the width where the ink stays over half its peak, the median of the rays that cross a line; null when
   *  under a third of them do. */
  function ringWidth(x, y, r) {
    const R = Math.ceil(r + 12), x0 = Math.max(0, Math.round(x - R)), y0 = Math.max(0, Math.round(y - R));
    const cw = Math.min(W - x0, 2 * R), ch = Math.min(H - y0, 2 * R);
    if (cw < R || ch < R) return null;
    const g = canvas(cw, ch).getContext("2d", { willReadFrequently: true });
    g.drawImage(image, x0, y0, cw, ch, 0, 0, cw, ch);
    const { M, t } = inkMask(g.getImageData(0, 0, cw, ch).data, cw, ch), cx = x - x0, cy = y - y0, out = [];
    const at = (X, Y) => { X = Math.round(X); Y = Math.round(Y); return X >= 0 && Y >= 0 && X < cw && Y < ch ? M[Y * cw + X] : 0; };
    for (let k = 0; k < 72; k++) {
      const a = (2 * Math.PI * k) / 72, c = Math.cos(a), sn = Math.sin(a), v = [];
      for (let d = r - 9; d <= r + 9; d += 0.5) v.push(at(cx + d * c, cy + d * sn));
      let p = 0;
      for (let j = 1; j < v.length; j++) if (v[j] > v[p]) p = j;
      if (v[p] < t) continue;
      let a0 = p, b0 = p;
      while (a0 > 0 && v[a0 - 1] >= 0.5 * v[p]) a0--;
      while (b0 < v.length - 1 && v[b0 + 1] >= 0.5 * v[p]) b0++;
      if (a0 === 0 || b0 === v.length - 1) continue;                   // a broad patch, no line
      out.push((b0 - a0 + 1) * 0.5);
    }
    return out.length >= 24 ? med(out) : null;
  }
  const nRead = controls.length;
  if (!dark && rStar && controls.length) {
    const nl = controls.filter((c) => joinedByLeg(c, LEG)).length;
    if (nl >= 10 && nl >= 0.5 * controls.length) {
      solid = true;
      // and as thick as the course's: over olive green a scan's brown contour (0.14 mm) is the purple's colour, not its
      // 0.35 mm — its loops passed for circles on the Auray scan (2026-11-20); the ink across the ring against the joined ones'
      const joined = controls.filter((c) => joinedByLeg(c, LEG)), ref = joined.map((c) => ringInk(ink, w, h, c.x, c.y, c.r)).sort((p, q) => p - q)[joined.length >> 1];
      controls = controls.filter((c) => joinedByLeg(c) && ringInk(ink, w, h, c.x, c.y, c.r) >= 0.55 * ref);
      if (sharp) {
        // a sharp image's controls are rings all but whole on the ink field: its circles read here and there by the mask's vote
        // that are not — a pink area's edge beside a leg, brown contours over olive green, an olive edge (one on each Morbihan
        // scan, 2026-11-20) — score 1.44 to 1.59 where the true ones score 1.63 at least (1.68 on a blurred phone photo)
        const ridge = controls.map((c) => { const q = bestRidge(ink, w, h, Math.round(c.x), Math.round(c.y), Math.round(rStar), tInk); return q.score + q.arcs; });
        // and, short of a ring all but perfect, drawn with the course's line, read at the image's own resolution: over olive
        // green a brown contour (0.14 mm) is the course's colour, and at the reading's scale both lines are under 2 px; on a
        // 300 dpi scan the overprint is 4 px wide, a contour under 2 (the Auray scan's contour loop beside two legs, 2026-11-20;
        // a control's circle over yellow, cut by a fence, reads 2 px wide too, and its ring 1.86)
        const wid = controls.map((c) => ringWidth(c.x / s, c.y / s, c.r / s)), ref = med(wid.filter((v, i) => v != null && ridge[i] >= 1.75));
        controls = controls.filter((c, i) => ridge[i] >= 1.55 && (ridge[i] >= 1.75 || !ref || wid[i] == null || wid[i] >= 0.65 * ref));
      }
      // a control read inside a second ring, 1.25 to 1.6 times larger, is the finish's inner circle (the Auray scan's finish,
      // its outer ring cut by a fence and missed by the vote, 2026-11-20)
      if (!finish) for (const c of controls) {
        let o = null;
        for (const k of [1.3, 1.4, 1.5]) { const q = bestRidge(ink, w, h, Math.round(c.x), Math.round(c.y), Math.round(k * c.r), tInk); if (!o || q.v > o.v) o = q; }
        if (o.score + o.arcs >= 1.4) { finish = { x: (c.x + o.x) / 2, y: (c.y + o.y) / 2, r1: c.r, r2: o.r, score: o.score }; controls = controls.filter((q) => q !== c); break; }
      }
      // a start no leg leaves is a symbol of the description sheet (the Auray scan's)
      if (start && !controls.some((c) => legIn(start.x, start.y, c.x, c.y, 1.1 * start.R, 1.3 * rStar) >= 0.5)) start = null;
      // no start read: it is at the end of a leg that leads to no other symbol — the triangle's blob joined to the course's
      // other lines, or a side of it run on by the leg, was too large a piece for the blob search (the three Morbihan scans,
      // 2026-11-21: all three triangles, plainly drawn, missed). Each control's straight inked runs that end in the open, a
      // triangle looked for just past their end
      if (!start) start = startOnLeg();
    }
  }
  /** The start triangle at the open end of a leg: from every control, each straight run of the overprint (80 % inked, two radii
   *  at least) that ends 1.5 radii away from any symbol read, a triangle of 1-1.45 radii looked for around the point half a
   *  radius past its end (the leg stops at the triangle's side, its centre beyond). The best above 0.7, hollow. */
  function startOnLeg() {
    const syms = [...controls.map((c) => ({ x: c.x, y: c.y, r: rStar })), ...(finish ? [{ x: finish.x, y: finish.y, r: finish.r2 }] : [])];
    let best = null;
    for (const c of controls) for (let deg = 0; deg < 360; deg += 2) {
      const ux = Math.cos((deg * Math.PI) / 180), uy = Math.sin((deg * Math.PI) / 180), r0 = 1.25 * rStar;
      let f0 = -1, last = -1, on = 0;
      for (let d = r0; d <= 40 * rStar; d += 1) {
        if (inkNear(c.x + d * ux, c.y + d * uy, ux, uy)) { if (f0 < 0) f0 = d; last = d; on++; }
        else if (f0 >= 0 && d - last > 0.6 * rStar) break;
        else if (f0 < 0 && d - r0 > 0.5 * rStar) break;
      }
      if (f0 < 0 || last - f0 < 2 * rStar || on < 0.8 * (last - f0 + 1)) continue;
      const ex = c.x + last * ux, ey = c.y + last * uy;
      if (syms.some((q) => q !== c && Math.hypot(q.x - ex, q.y - ey) < q.r + 1.5 * rStar)) continue;
      for (const k of [0.3, 0.6, 0.9]) {
        const tri = triangleAt(dil, w, h, ex + k * rStar * ux, ey + k * rStar * uy, rStar, sharp);
        if (tri && tri.score >= 0.7 && !inGrid(grid, w, h, tri.x, tri.y, 1.1 * tri.R, 1) && (!best || tri.score > best.score)) best = { ...tri, onLeg: true };
      }
    }
    return best;
  }
  await step(0.95);
  const sequence = rStar && controls.length >= 2 ? (start ? followCourse(finish) : dark || solid ? chainBack(finish) : null) : null;
  // the controls a printed leg joins to another one (or to the finish): a course's circles are, a texture's rings are not
  const legged = !rStar ? 0 : controls.filter((a) => controls.some((b) => b !== a && legIn(a.x, a.y, b.x, b.y, 1.3 * rStar, 1.3 * rStar) >= LEG)
    || (finish && legIn(a.x, a.y, finish.x, finish.y, 1.3 * rStar, 1.1 * finish.r2) >= LEG)).length;
  /** The course's order again, with a finish placed by the page (where the trace ends: a finish over water is not read
   *  from the map) — `finish` [x, y] in the image's pixels. */
  const order = ({ finish: F = null } = {}) => {
    if (!rStar || controls.length < 2 || (!start && !dark && !solid)) return null;
    const q = (start ? followCourse : chainBack)(F ? { x: F[0] * s, y: F[1] * s, r2: finish?.r2 ?? 1.4 * rStar } : finish);
    return q ? { ...q, points: q.points.map(back) } : null;
  };
  // without a start (the colour-blind reading): back from the finish along the legs, each time to a control not placed
  // yet that a leg joins; the controls in the course's order, then the finish. It stops where no leg leads on: the
  // controls before are left to the page, which places them by the trace
  function chainBack(fin) {
    if (!fin) return null;
    const left = controls.map((c) => ({ kind: "control", x: c.x, y: c.y, r: rStar }));
    const seq = [{ kind: "finish", x: fin.x, y: fin.y, r: fin.r2 ?? 1.4 * rStar }];
    for (let p = seq[0]; left.length;) {
      // the leg inked the most (a chance run of a town's lines joins two controls at 0.75, a printed leg near 1);
      // between two alike, the nearer; no leg is drawn between two symbols that all but touch (the last control
      // beside the finish)
      // (the circles the way crosses left out: ISOM cuts a leg where it passes through another control's circle)
      const others = (q) => [...controls.map((c) => ({ x: c.x, y: c.y, r: rStar })), { x: fin.x, y: fin.y, r: fin.r2 ?? 1.4 * rStar }]
        .filter((o) => Math.hypot(o.x - p.x, o.y - p.y) > 0.5 * rStar && Math.hypot(o.x - q.x, o.y - q.y) > 0.5 * rStar);
      const joined = left.map((q) => ({ q, d: Math.hypot(q.x - p.x, q.y - p.y), v: legIn(p.x, p.y, q.x, q.y, (p.kind === "control" ? 1.3 : 1.1) * p.r, 1.3 * q.r, others(q)) }))
        .map((z) => (z.d < 2.2 * rStar + p.r ? { ...z, v: 1 } : z)).filter((z) => z.v >= LEG);
      const top = Math.max(0, ...joined.map((z) => z.v));
      joined.splice(0, joined.length, ...joined.filter((z) => z.v >= top - 0.08).sort((a, b) => a.d - b.d).map((z) => z.q));
      if (!joined.length) break;
      const q = joined[0];
      left.splice(left.indexOf(q), 1); seq.push(q); p = q;
    }
    if (seq.length < 3) return null;
    return { points: seq.reverse().map((q) => ({ kind: q.kind, x: q.x, y: q.y })), complete: !left.length, reversible: false };
  }
  function followCourse(fin) {
    const syms = [{ kind: "start", x: start.x, y: start.y, r: start.R }, ...controls.map((c) => ({ kind: "control", x: c.x, y: c.y, r: rStar, c })),
      ...(fin ? [{ kind: "finish", x: fin.x, y: fin.y, r: fin.r2 }] : [])];
    const used = new Set();
    const margin = (p) => (p.kind === "control" ? 1.3 : 1.1) * p.r;
    const linked = (a, b) => legIn(a.x, a.y, b.x, b.y, margin(a), margin(b));
    // ISOM: the start triangle points at the first control — a leg leaving it off its tips is the finish's, when the
    // start is drawn in the finish circle (the synthetic maps)
    const tip = (from, p) => {
      if (from.kind !== "start" || start.ang == null) return 0;
      const b = Math.atan2(p.y - from.y, p.x - from.x);
      let d = Math.PI;
      for (let k = 0; k < 3; k++) { let x = Math.abs(b - start.ang - (2 * Math.PI * k) / 3) % (2 * Math.PI); d = Math.min(d, x, 2 * Math.PI - x); }
      return Math.max(0, 1 - d / ((20 * Math.PI) / 180));                     // the closest to a tip wins
    };
    // the next symbol along a leg from `from`: one joined by a printed leg, else a circle at the end of a leg leaving it
    // a leg ends at its next symbol, but the line seems to go on to any symbol beyond it: the nearest one joined (the
    // start's tip first), and a circle not read yet on the way is the next one (the photo's 16, between its finish and 15)
    const add = (c) => { const q = { kind: "control", x: c.x, y: c.y, r: rStar, c }; syms.push(q); controls.push(c); return q; };
    const joinedTo = (from, cands, onWay) => {
      let best = null;
      for (const p of cands) {
        if (linked(from, p) < 0.6) continue;
        const k = [p.kind === "finish" ? 1 : 0, -tip(from, p), Math.hypot(p.x - from.x, p.y - from.y)];   // controls first
        if (!best || k[0] < best.k[0] || (k[0] === best.k[0] && (k[1] < best.k[1] - 0.1 || (Math.abs(k[1] - best.k[1]) <= 0.1 && k[2] < best.k[2])))) best = { p, k };
      }
      if (!best) return null;
      // a symbol placed on the way, its own end of the leg faint (the photo's 15, over yellow): it comes first
      const L = Math.hypot(best.p.x - from.x, best.p.y - from.y), ux = (best.p.x - from.x) / L, uy = (best.p.y - from.y) / L;
      const onWayTo = cands.filter((q) => q !== best.p && q.kind === "control").map((q) => ({ q, a: (q.x - from.x) * ux + (q.y - from.y) * uy, o: Math.abs((q.x - from.x) * uy - (q.y - from.y) * ux) }))
        .filter((z) => z.a > 0 && z.a < L - rStar && z.o < 0.6 * rStar).sort((p1, p2) => p1.a - p2.a)[0];
      if (onWayTo) return onWayTo.q;
      const c = onWay ? ringOnWay(from, best.p, [...used]) : null;
      return c ? add(c) : best.p;
    };
    const next = (from, kinds, onWay = false) => {
      const p = joinedTo(from, syms.filter((q) => !used.has(q) && kinds.includes(q.kind)), onWay);
      if (p) return p;
      const c = alongLeg(from, [...used], syms.filter((q) => !used.has(q) && kinds.includes(q.kind)));
      return c ? (c.sym || add(c)) : null;
    };
    const twoFromStart = syms.filter((p) => p.kind === "control" && linked(syms[0], p) >= 0.6).length >= 2;
    const fwd = [syms[0]]; used.add(syms[0]);
    for (let p = syms[0]; ;) {
      const q = next(p, ["control", "finish"]);
      if (!q) break;
      fwd.push(q); used.add(q); p = q;
      if (q.kind === "finish") break;
    }
    // back from the finish until the two ways meet: a leg, or two circles so close that no leg is drawn between them
    const end = fwd[fwd.length - 1], close = (p) => Math.hypot(p.x - end.x, p.y - end.y) < 2.5 * rStar;
    const rev = [];
    let met = false;
    if (fin && end.kind !== "finish") {
      const f = syms.find((p) => p.kind === "finish");
      rev.push(f); used.add(f);
      for (let p = f; !(met = close(p));) {
        const q = joinedTo(p, [...syms.filter((x) => !used.has(x) && x.kind === "control"), end], true) || ((c) => (c ? c.sym || add(c) : null))(alongLeg(p, [...used], [...syms.filter((x) => !used.has(x) && x.kind === "control"), end]));
        if (!q) break;
        if (q === end) { met = true; break; }
        rev.push(q); used.add(q); p = q;
      }
    }
    const seq = [...fwd, ...rev.reverse()];
    const missing = syms.filter((p) => p.kind === "control" && !seq.includes(p)).length;
    return { points: seq.map((p) => ({ kind: p.kind, x: p.x, y: p.y })), complete: !missing && seq[seq.length - 1].kind === "finish" && (!rev.length || met),
      // the start drawn in the finish circle (two legs leave it): the triangle's tips may not tell the way round (the
      // trace will)
      reversible: (!!fin && Math.hypot(fin.x - start.x, fin.y - start.y) < 2 * rStar) || twoFromStart };
  }
  // a leg leaving `from` that no symbol ends: the straight inked run starting at its edge (gaps of up to 0.6 r*, 60 %
  // inked, a radius long at least), not toward a symbol already placed; the ring of the control's size beyond its end
  function alongLeg(from, placed, known = []) {
    const r0 = from.kind === "control" ? 1.25 * rStar : 1.05 * from.r, gapMax = 0.6 * rStar, far = 30 * rStar;
    let best = null;
    for (let deg = 0; deg < 360; deg += 2) {
      const ux = Math.cos((deg * Math.PI) / 180), uy = Math.sin((deg * Math.PI) / 180);
      let first = -1, last = -1, on = 0;
      for (let d = r0; d <= far; d += 1) {
        if (inkNear(from.x + d * ux, from.y + d * uy, ux, uy)) { if (first < 0) first = d; last = d; on++; }
        else if (first >= 0 && d - last > gapMax) break;
        else if (first < 0 && d - r0 > 0.5 * rStar) break;                  // a leg starts at the symbol's edge
      }
      if (first < 0 || last - first < rStar || on < 0.6 * (last - first + 1)) continue;
      // not the leg that came in, nor one toward a symbol placed: no placed symbol near the way out to its end
      const toward = placed.some((p) => { const vx = p.x - from.x, vy = p.y - from.y, a = vx * ux + vy * uy, d = Math.hypot(vx, vy);
        if (p === from || a <= 0) return false;
        if (a < last + 2 * rStar && Math.abs(vx * uy - vy * ux) < Math.max(0.8 * rStar, 0.8 * p.r)) return true;
        return Math.acos(Math.min(1, a / d)) < Math.atan2(rStar, d) + (4 * Math.PI) / 180;   // along the leg that came in
      });
      if (toward) continue;
      const len = (last - first) * (on / (last - first + 1));
      if (!best || len > best.len) best = { ux, uy, last, len };
    }
    if (!best) return null;
    // a symbol already read that the leg points at, its own end of the leg too faint to join them (the photo's 15)
    const hit = known.map((q) => ({ q, a: (q.x - from.x) * best.ux + (q.y - from.y) * best.uy, o: Math.abs((q.x - from.x) * best.uy - (q.y - from.y) * best.ux) }))
      .filter((z) => z.a > 0 && z.a < best.last + 2 * rStar && z.o < 0.6 * Math.max(rStar, z.q.r)).sort((p1, p2) => p1.a - p2.a)[0];
    // the first ring met along the leg (it points at the circle's centre): beyond its end, or on the way when the ink
    // runs on through the circle (two overlapping circles, the photo's 15 and 16) — before the symbol it points at, if any
    const stop = hit ? hit.a - 1.2 * rStar : best.last + 1.8 * rStar;
    let ring = null;
    for (let d = Math.max(r0 + rStar, 2 * rStar); d <= stop && !(ring && d > ring.d + rStar); d += 1) {
      for (const lat of [-0.3, -0.15, 0, 0.15, 0.3]) {
        const x = from.x + d * best.ux - lat * rStar * best.uy, y = from.y + d * best.uy + lat * rStar * best.ux;
        const q = ridgeRing(ink, w, h, x, y, rStar, tInk), v = q.score + q.arcs;
        if (v >= 0.8 && (!ring || v > ring.v)) ring = { x, y, v, d };
      }
    }
    const c = ring ? legRing(ring, placed) : null;
    return c || (hit ? { sym: hit.q } : null);
  }
  // a circle not read yet on the leg from `a` to `b`: the best ring on the way between their margins
  function ringOnWay(a, b, placed) {
    const L = Math.hypot(b.x - a.x, b.y - a.y), ux = (b.x - a.x) / L, uy = (b.y - a.y) / L, ma = (a.kind === "control" ? 1.3 : 1.1) * a.r;
    const mb = (b.kind === "control" ? 1.3 : 1.1) * b.r;
    let ring = null;
    for (let d = ma + 0.8 * rStar; d <= L - mb - 0.8 * rStar; d += 1) for (const lat of [-0.3, -0.15, 0, 0.15, 0.3]) {
      const x = a.x + d * ux - lat * rStar * uy, y = a.y + d * uy + lat * rStar * ux;
      const q = ridgeRing(ink, w, h, x, y, rStar, tInk), v = q.score + q.arcs;
      if (v >= 0.8 && (!ring || v > ring.v)) ring = { x, y, v };
    }
    return ring ? legRing(ring, [...placed, b]) : null;
  }
  // a ring where a leg says a control is: weaker evidence than anywhere else on the map, the course's colour, empty
  // inside, no line across it (a leg stops at a control's circle), apart from the symbols placed
  function legRing(ring, placed) {
    if (solid && sharp) return null;          // a sharp image's solid colour reading has read its rings; a scan's town has more ring-like shapes
    const c = bestRidge(ink, w, h, Math.round(ring.x), Math.round(ring.y), rStar, tInk);
    if (c.score + c.arcs < 0.8 || c.score < 0.45 || c.arcs < 0.25 || !coloured({ x: c.x, y: c.y, r: c.r })
      || inkInside(ink, w, h, c.x, c.y, c.r, tInk) > IN || lineAcross(ink, w, h, c.x, c.y, c.r, tInk) >= 0.8
      || placed.concat(controls).some((p) => Math.hypot(p.x - c.x, p.y - c.y) < 1.2 * rStar)) return null;
    return { x: c.x, y: c.y, r: c.r, score: c.score, raw: c.arcs, alongLeg: true };
  }
  return { W, H, s, r: rStar ? rStar / s : null, controls: controls.map(back), probe, probeFinish, probeStart, leg,
    sequence: sequence && { ...sequence, points: sequence.points.map(back) }, order,
    finish: finish && { ...back(finish), r1: finish.r1 == null ? null : finish.r1 / s, r2: finish.r2 / s },
    start: start && { ...back(start), R: start.R / s }, nCircles: circles.length, lw, dark, legged, read: nRead,
    found: debug ? found.map(back) : undefined, added: debug && added ? added.map(back) : undefined, startCands: debug && startCands ? startCands.map(back) : undefined };
}

function dilate(m, w, h) {
  const d = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!m[y * w + x]) continue;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const X = x + dx, Y = y + dy;
      if (X >= 0 && Y >= 0 && X < w && Y < h) d[Y * w + X] = 1;
    }
  }
  return d;
}
/** The share of N points of the ring (x, y, r) that are purple (a pixel of tolerance). */
function ringScore(dil, w, h, x, y, r, N) {
  let hit = 0;
  for (let k = 0; k < N; k++) {
    const a = (2 * Math.PI * k) / N, X = Math.round(x + r * Math.cos(a)), Y = Math.round(y + r * Math.sin(a));
    if (X >= 0 && Y >= 0 && X < w && Y < h && dil[Y * w + X]) hit++;
  }
  return hit / N;
}
function refineCircle(mask, dil, w, h, x0, y0, r0) {
  // the tolerant score (a pixel of tolerance) says whether this is a ring; the strict one (the raw mask) pins its
  // radius and centre, so that two concentric rings (the finish) do not blur into one of a radius between theirs
  const all = [];
  let bestTol = 0;
  for (let r = Math.max(4, r0 - 2); r <= r0 + 2; r++) for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
    const tol = ringScore(dil, w, h, x0 + dx, y0 + dy, r, 72);
    all.push([tol, x0 + dx, y0 + dy, r]);
    if (tol > bestTol) bestTol = tol;
  }
  if (bestTol < 0.5) return null;
  const plateau = all.filter((a) => a[0] >= bestTol - 0.03).map((a) => [...a, ringScore(mask, w, h, a[1], a[2], a[3], 72)]);
  const bestRaw = Math.max(...plateau.map((a) => a[4]));
  const top = plateau.filter((a) => a[4] >= bestRaw - 0.1);
  const c = { x: top.reduce((s, a) => s + a[1], 0) / top.length, y: top.reduce((s, a) => s + a[2], 0) / top.length, r: top.reduce((s, a) => s + a[3], 0) / top.length, score: bestTol, raw: bestRaw };
  c.inner = ringScore(dil, w, h, c.x, c.y, Math.max(2, c.r * 0.55), 36);
  c.outer = ringScore(dil, w, h, c.x, c.y, c.r * 1.45, 48);
  return c;
}
/** The overprint's line width: the lower quartile, over the purple pixels, of the shorter straight run through
 *  each (the median would follow a big title or a thick class name, not the course's lines). */
function lineWidth(mask, w, h) {
  const runs = [];
  for (let i = 0; i < mask.length; i += 7) {
    if (!mask[i]) continue;
    const x = i % w, y = (i - x) / w;
    let a = x, b = x, c = y, d = y;
    while (a > 0 && mask[i - (x - a) - 1]) a--;
    while (b < w - 1 && mask[i + (b - x) + 1]) b++;
    while (c > 0 && mask[i - (y - c) * w - w]) c--;
    while (d < h - 1 && mask[i + (d - y) * w + w]) d++;
    runs.push(Math.min(b - a + 1, d - c + 1));
  }
  if (!runs.length) return 2;
  runs.sort((p, q) => p - q);
  return Math.max(1, runs[Math.floor(runs.length / 4)]);
}
/** The mask's opening by a 2 x 2 square: the pixels of some 2 x 2 block all in the mask (lines a pixel wide go). */
function open2(m, w, h) {
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h - 1; y++) for (let x = 0; x < w - 1; x++) {
    const i = y * w + x;
    if (m[i] && m[i + 1] && m[i + w] && m[i + w + 1]) out[i] = out[i + 1] = out[i + w] = out[i + w + 1] = 1;
  }
  return out;
}
/** The pixels of the mask thinner than 2k + 1: the mask less its opening by a (2k + 1) square. */
function thinOnly(m, w, h, k) {
  const er = new Uint8Array(w * h), out = m.slice();
  for (let y = k; y < h - k; y++) for (let x = k; x < w - k; x++) {
    if (!m[y * w + x]) continue;
    let all = true;
    for (let dy = -k; dy <= k && all; dy++) for (let dx = -k; dx <= k; dx++) if (!m[(y + dy) * w + x + dx]) { all = false; break; }
    if (all) er[y * w + x] = 1;
  }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!er[y * w + x]) continue;
    for (let dy = -k - 1; dy <= k + 1; dy++) for (let dx = -k - 1; dx <= k + 1; dx++) {
      const X = x + dx, Y = y + dy;
      if (X >= 0 && Y >= 0 && X < w && Y < h) out[Y * w + X] = 0;
    }
  }
  return out;
}
async function findCircles(mask, dil, w, h, lw, genuine, dark = false, said = () => null, grid = mask) {
  const px = [];
  for (let i = 0; i < mask.length; i++) if (mask[i]) px.push(i);
  if (!px.length) return { circles: [], rStar: null, found: [] };
  const step = Math.max(1, Math.ceil(px.length / 250000));            // a purple-tinted photo: a sample of its pixels
  const cw = Math.ceil(w / STRIDE), ch = Math.ceil(h / STRIDE), acc = new Uint16Array(cw * ch);
  const found = [];
  for (const [ri, r] of RADII.entries()) {
    await said(ri / RADII.length);
    if (r * 2 > Math.min(w, h)) break;
    if (r < 2.5 * lw || (dark && r < 8)) continue;                   // a circle this small lies within a line
    acc.fill(0);
    const dx = new Int16Array(ANGLES), dy = new Int16Array(ANGLES);
    for (let a = 0; a < ANGLES; a++) { dx[a] = Math.round(r * Math.cos((2 * Math.PI * a) / ANGLES)); dy[a] = Math.round(r * Math.sin((2 * Math.PI * a) / ANGLES)); }
    for (let k = 0; k < px.length; k += step) {
      const i = px[k], x = i % w, y = (i - x) / w;
      for (let a = 0; a < ANGLES; a++) {
        const cx = x + dx[a], cy = y + dy[a];
        if (cx < 0 || cy < 0 || cx >= w || cy >= h) continue;
        acc[((cy / STRIDE) | 0) * cw + ((cx / STRIDE) | 0)]++;
      }
    }
    let top = 0;
    for (let i = 0; i < acc.length; i++) if (acc[i] > top) top = acc[i];
    const floor = Math.max(4, top * 0.08), cands = [];
    for (let cy = 1; cy < ch - 1; cy++) for (let cx = 1; cx < cw - 1; cx++) {
      const k = cy * cw + cx, v = acc[k];
      if (v < floor) continue;
      if (v < acc[k - 1] || v < acc[k + 1] || v < acc[k - cw] || v < acc[k + cw] || v < acc[k - cw - 1] || v < acc[k - cw + 1] || v < acc[k + cw - 1] || v < acc[k + cw + 1]) continue;
      cands.push([v, cx, cy]);
    }
    cands.sort((a, b) => b[0] - a[0]);
    for (const [, cx, cy] of cands.slice(0, 160)) {
      const c = refineCircle(mask, dil, w, h, cx * STRIDE + STRIDE / 2, cy * STRIDE + STRIDE / 2, r);
      if (c && c.score >= 0.55 && c.raw >= 0.3) found.push(c);
    }
  }
  // a ring: hollow inside and clear outside; those give the control radius r*. Then, of a control's size or the
  // finish's, a nearly complete ring whatever sits inside it (a start triangle drawn in the finish's circles, the
  // finish's inner circle) — never a small circle, which a thick purple patch would fill
  // a ring: nearly complete with a pixel of tolerance (a photo blurs the line), or crisp though partly hidden —
  // a small circle where a line meets a ring scores 0.6 to 0.7 tolerant and less raw; hollow inside, clear outside
  // colour-blind, on a town's map nothing is hollow or clear (buildings, kerbs, trees inside and around): the ring
  // itself must be all but complete — the letters, tree dots and digits' loops that are too are far smaller than the
  // controls, and fewer once weighed by their size
  const strict = dark ? (c) => c.score >= 0.9 && c.raw >= 0.7
    : (c) => ((c.score >= 0.8 && c.raw >= 0.3) || (c.score >= 0.55 && c.raw >= 0.5)) && c.inner <= 0.3 && c.outer <= 0.4;
  // a table's boxes left out before the control radius is chosen (they outnumber a course's circles on a scan's
  // description sheet): two sides on grid lines running on, read on the thin mask
  const kept = offTables(suppress(found.filter(strict)).filter(genuine)).filter((c) => dark || !inGrid(grid, w, h, c.x, c.y, c.r, 1));
  // the control radius weighed by size in colour too: a clean scan's black outlines leave small rings of colour fringe along
  // the buildings, many more than the controls (2026-11-19: r* half the controls' on the Quiberon scan)
  const rStar = controlRadius(kept, true);
  if (!rStar || dark) return { circles: kept, rStar, found };
  const more = found.filter((c) => !strict(c) && c.score >= 0.85 && c.raw >= 0.6 && c.outer <= 0.6 && c.inner <= 0.75 && c.r >= 0.75 * rStar && c.r <= 1.8 * rStar);
  return { circles: offTables(suppress([...kept, ...more.filter((c) => !inGrid(grid, w, h, c.x, c.y, c.r, 1))])), rStar, found };
}
/** The circles of a table left out: the control descriptions printed in the course's colour (a grid of 6 mm boxes, its
 *  symbols' circles and the finish's double circle in them) read as a hundred controls on a clean scan (2026-11-19, the Auray
 *  scan). Circles of one size 1.5 to 2.6 radii apart along the page's axes (within 6°), or 1.5 to 4.6 apart on one row or
 *  column to 0.15 r (a box or two between them), four or more joined so, are a table's
 *  (before the control radius is chosen, which the table's hundred circles would decide; and again once the rings the ink
 *  field shows are added): a course's controls are never in rows and columns. */
function offTables(circles) {
  const n = circles.length, up = circles.map((_, i) => i), root = (i) => (up[i] === i ? i : (up[i] = root(up[i])));
  const tan6 = Math.tan((6 * Math.PI) / 180);
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
    const dx = Math.abs(circles[j].x - circles[i].x), dy = Math.abs(circles[j].y - circles[i].y), d = Math.hypot(dx, dy), r = (circles[i].r + circles[j].r) / 2;
    if (Math.abs(circles[i].r - circles[j].r) > 0.3 * r) continue;
    // neighbouring boxes (1.5-2.6 r, along the axes); or boxes of one row or column a few cells apart, on its line to 0.15 r
    const near = d >= 1.5 * r && d <= 2.6 * r && Math.min(dx, dy) <= tan6 * Math.max(dx, dy);
    const aligned = Math.max(dx, dy) >= 1.5 * r && Math.max(dx, dy) <= 4.6 * r && Math.min(dx, dy) <= 0.15 * r;
    if (near || aligned) up[root(i)] = root(j);
  }
  const size = new Map();
  for (let i = 0; i < n; i++) size.set(root(i), (size.get(root(i)) || 0) + 1);
  return circles.filter((_, i) => size.get(root(i)) < 4);
}
/** How many sides of a ring are a box's (the control descriptions' cells, read as rings on a clean scan): a straight line of ink
 *  along a side, parallel to the page, within 0.85-1.35 r of the centre and inked over 80 % of 1.6 r. A course's circle has its
 *  legs leaving it, and rarely more than two straight lines beside it. */
function boxed(M, w, h, x, y, r, t, reach = 0.8) {
  let sides = 0;
  for (const [ax, ay] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    let best = 0;
    for (let k = 0.85; k <= 1.35; k += 0.05) {
      let n = 0, on = 0;
      for (let u = -reach * r; u <= reach * r; u += 1) {
        const X = Math.round(x + ax * k * r - ay * u), Y = Math.round(y + ay * k * r + ax * u);
        if (X < 0 || Y < 0 || X >= w || Y >= h) continue;
        n++; if (M[Y * w + X] >= t / 2) on++;
      }
      if (n && on / n > best) best = on / n;
    }
    if (best >= (reach > 1 ? 0.6 : 0.8)) sides++;
  }
  return sides;
}
/** The ink across a ring: the mean over 36 directions of the ink summed across its line (3 px either way of the radius) — a
 *  line's density times its width. */
function ringInk(M, w, h, x, y, r) {
  let sum = 0, n = 0;
  for (let k = 0; k < 36; k++) {
    const a = (2 * Math.PI * k) / 36, c = Math.cos(a), sn = Math.sin(a);
    let v = 0;
    for (let d = -3; d <= 3; d++) { const X = Math.round(x + (r + d) * c), Y = Math.round(y + (r + d) * sn); if (X >= 0 && Y >= 0 && X < w && Y < h && M[Y * w + X] > 0) v += M[Y * w + X]; }
    sum += v; n++;
  }
  return n ? sum / n : 0;
}
/** A ring in a grid: two of its sides along straight lines of ink that run on 3 r either way (inked over 60 %: a table's
 *  lines stop at its edges), as a table's lines do across its boxes (a course's legs stop at the circles they join). */
const inGrid = (M, w, h, x, y, r, t) => boxed(M, w, h, x, y, r, t, 3) >= 2;
/** One circle per place: the best-scoring of those within 0.6 r of each other with radii within 15 % (the finish's
 *  two circles differ by 35 %). */
function suppress(found) {
  const kept = [];
  for (const c of [...found].sort((a, b) => b.score - a.score)) {
    if (!kept.some((k) => Math.hypot(k.x - c.x, k.y - c.y) < 0.6 * Math.max(k.r, c.r) && Math.abs(k.r - c.r) <= 0.15 * Math.max(k.r, c.r))) kept.push(c);
  }
  return kept;
}
/** The radius the good circles share: the densest window of radii (± 30 %), weighted by the circles' scores. */
function controlRadius(circles, bySize = false) {
  if (!circles.length) return null;
  const cs = [...circles].sort((a, b) => a.r - b.r);
  let best = null;
  for (let i = 0; i < cs.length; i++) {
    let j = i, sum = 0;
    while (j < cs.length && cs[j].r <= cs[i].r * 1.3) { sum += cs[j].score * (bySize ? cs[j].r * cs[j].r : 1); j++; }
    if (!best || sum > best.sum) best = { sum, i, j };
  }
  const win = cs.slice(best.i, best.j);
  return win[Math.floor((win.length - 1) / 2)].r;
}
/** The leg lines' pixels: those a straight purple run of 2.2 r* passes through, in one of 12 directions (the run
 *  need not be centred on the pixel: the lines' ends count; a ring's longest chord and a triangle's side are shorter). */
function markLines(mask, dil, w, h, rStar, times = 2.2) {
  const need = Math.max(12, Math.round(times * rStar)), N = 12, lines = new Uint8Array(w * h), cs = [], sn = [];
  for (let d = 0; d < N; d++) { cs.push(Math.cos((Math.PI * d) / N)); sn.push(Math.sin((Math.PI * d) / N)); }
  const at = (x, y) => x >= 0 && y >= 0 && x < w && y < h && dil[y * w + x];
  const run = (x, y, d, sign, max) => {
    let n = 0;
    for (let k = 1; k <= max; k++) { if (!at(Math.round(x + sign * k * cs[d]), Math.round(y + sign * k * sn[d]))) break; n++; }
    return n;
  };
  for (let i = 0; i < mask.length; i++) {
    if (!mask[i]) continue;
    const x = i % w, y = (i - x) / w;
    for (let d = 0; d < N; d++) {
      const n1 = run(x, y, d, 1, need);
      if (n1 + 1 + run(x, y, d, -1, need - n1) >= need) { lines[i] = 1; break; }
    }
  }
  return lines;
}
/** The line pixels in the ring from r + 2 to r + 0.5 r around a circle: the leg lines' ends. */
function ringTouch(lines, w, h, cx, cy, r) {
  let n = 0;
  const R = r + Math.max(6, 0.5 * r);
  for (let y = Math.max(0, Math.floor(cy - R)); y <= Math.min(h - 1, Math.ceil(cy + R)); y++) {
    for (let x = Math.max(0, Math.floor(cx - R)); x <= Math.min(w - 1, Math.ceil(cx + R)); x++) {
      const d = Math.hypot(x - cx, y - cy);
      if (d >= r + 2 && d <= R && lines[y * w + x]) n++;
    }
  }
  return n;
}
/** The start: among the purple blobs left once rings and lines are gone, the one that best matches a triangle. */
function findStart(mask, dil, longLines, lines, circles, w, h, rStar, centres = [], debugList = null, sharp = false, grid = mask) {
  const res = new Uint8Array(w * h);
  for (let i = 0; i < mask.length; i++) res[i] = mask[i] && !longLines[i] ? 1 : 0;
  for (const c of circles) {
    const band = Math.max(3, 0.3 * c.r), R = c.r + band;
    for (let y = Math.max(0, Math.floor(c.y - R)); y <= Math.min(h - 1, Math.ceil(c.y + R)); y++) {
      for (let x = Math.max(0, Math.floor(c.x - R)); x <= Math.min(w - 1, Math.ceil(c.x + R)); x++) {
        if (Math.abs(Math.hypot(x - c.x, y - c.y) - c.r) <= band) res[y * w + x] = 0;
      }
    }
  }
  const seen = new Uint8Array(w * h), stack = [];
  const minB = 1.2 * rStar, maxB = 3.6 * rStar;
  // a triangle a leg line leaves counts for more than a stray one (the control descriptions' own start symbol)
  const rate = (tri) => { tri.touch = ringTouch(lines, w, h, tri.x, tri.y, tri.R); return { ...tri, rank: tri.score + (tri.touch >= 3 ? 0.25 : 0) }; };
  let best = null;
  for (let i0 = 0; i0 < res.length; i0++) {
    if (!res[i0] || seen[i0]) continue;
    let x0 = w, y0 = h, x1 = 0, y1 = 0, cnt = 0;
    stack.push(i0); seen[i0] = 1;
    while (stack.length) {
      const i = stack.pop(), x = i % w, y = (i - x) / w;
      cnt++;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const X = x + dx, Y = y + dy;
        if (X < 0 || Y < 0 || X >= w || Y >= h) continue;
        const j = Y * w + X;
        if (res[j] && !seen[j]) { seen[j] = 1; stack.push(j); }
      }
    }
    const bw = x1 - x0 + 1, bh = y1 - y0 + 1;
    if (bw < minB || bh < minB || bw > maxB || bh > maxB || cnt < 2 * rStar) continue;
    let tri = triangleAt(dil, w, h, (x0 + x1) / 2, (y0 + y1) / 2, rStar, sharp);
    // not the control descriptions' own start symbol, in its box of the table (a scan's Auray sheet, 2026-11-20)
    if (tri && inGrid(grid, w, h, tri.x, tri.y, 1.1 * tri.R, 1)) tri = null;
    if (tri) { tri = rate(tri); if (debugList) debugList.push({ ...tri, bw, bh, cnt }); if (!best || tri.rank > best.rank) best = tri; }
  }
  // the start drawn in the finish's circles, or on a control: its sides are cut by the rings above, so try the centres —
  // a whole triangle there (0.88: those drawn so score 0.92 to 1; a scan's control with map detail inside, 0.6 to 0.82, had
  // been taken for the start, 2026-11-20)
  for (const c of centres) {
    let tri = triangleAt(dil, w, h, c.x, c.y, rStar, sharp);
    if (tri && tri.score >= 0.88) { tri = rate(tri); if (!best || tri.rank > best.rank) best = tri; }
  }
  return best && best.score >= 0.62 ? best : null;
}
function triangleAt(dil, w, h, cx0, cy0, rStar, sharp = false) {
  let best = null;
  for (const k of [1.0, 1.15, 1.3, 1.45]) {
    const R = k * rStar;
    for (let th = 0; th < 120; th += 4) for (const [ox, oy] of [[0, 0], [-3, 0], [3, 0], [0, -3], [0, 3]]) {
      const cx = cx0 + ox, cy = cy0 + oy;
      const V = [0, 1, 2].map((m) => { const a = ((th + 120 * m) * Math.PI) / 180; return [cx + R * Math.cos(a), cy + R * Math.sin(a)]; });
      let hit = 0, tot = 0;
      for (let m = 0; m < 3; m++) {
        const A = V[m], B = V[(m + 1) % 3];
        for (let q = 0; q < 20; q++) {
          const f = (q + 0.5) / 20, x = Math.round(A[0] + f * (B[0] - A[0])), y = Math.round(A[1] + f * (B[1] - A[1]));
          tot++;
          if (x >= 0 && y >= 0 && x < w && y < h && dil[y * w + x]) hit++;
        }
      }
      const score = hit / tot;
      if (!best || score > best.score) best = { x: cx, y: cy, R, ang: (th * Math.PI) / 180, score };
    }
  }
  if (best && ringScore(dil, w, h, best.x, best.y, best.R * 0.3, 24) > 0.5) return null;      // not hollow
  // nor crossed inside, on a sharp image: a hatching's lines make triangles too (the course setter's purple out-of-bounds
  // hatching on the Auray MD scan, 2026-11-20); a start triangle is empty in its middle (0.3 R) — a phone's blurred one is not
  if (best && sharp) {
    let n = 0, on = 0;
    for (let dy = -0.3 * best.R; dy <= 0.3 * best.R; dy += 1) for (let dx = -0.3 * best.R; dx <= 0.3 * best.R; dx += 1) {
      if (dx * dx + dy * dy > 0.09 * best.R * best.R) continue;
      const X = Math.round(best.x + dx), Y = Math.round(best.y + dy);
      if (X < 0 || Y < 0 || X >= w || Y >= h) continue;
      n++; if (dil[Y * w + X]) on++;
    }
    if (n && on / n > 0.15) return null;
  }
  return best;
}

/** The closing of a channel (max then min over a (2k + 1) square, each separably), into `out`, `tmp` as scratch: the
 *  local background, without the dark lines thinner than the square. */
function closing(a, w, h, k, tmp, out) {
  const pass = (src, dst, isMax, horiz) => {
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const lo = horiz ? Math.max(0, x - k) : Math.max(0, y - k), hi = horiz ? Math.min(w - 1, x + k) : Math.min(h - 1, y + k);
      let v = isMax ? -1e9 : 1e9;
      for (let d = lo; d <= hi; d++) { const u = horiz ? src[y * w + d] : src[d * w + x]; v = isMax ? (u > v ? u : v) : (u < v ? u : v); }
      dst[y * w + x] = v;
    }
  };
  pass(a, tmp, true, true); pass(tmp, out, true, false); pass(out, tmp, false, true); pass(tmp, out, false, false);
  return out;
}
/** A 3 × 3 box blur, twice, in place (`tmp` as scratch). */
function blur(a, w, h, tmp) {
  for (let n = 0; n < 2; n++) {
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = y * w + x; tmp[i] = (a[x > 0 ? i - 1 : i] + a[i] + a[x < w - 1 ? i + 1 : i]) / 3; }
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = y * w + x; a[i] = (tmp[y > 0 ? i - w : i] + tmp[i] + tmp[y < h - 1 ? i + w : i]) / 3; }
  }
  return a;
}
/** The overprint's ink (see the head of this file): `D` the three channels' densities over the local background, `M`
 *  the ink (green absorbed beyond the mean of red and blue), `t` the mask's level, `m` the mask. */
function inkMask(data, w, h) {
  const K = 4, T = 0.1, n = w * h;
  const a = new Float32Array(n), tmp = new Float32Array(n), bg = new Float32Array(n), D = [], lit = [];
  for (let c = 0; c < 3; c++) {
    for (let i = 0; i < n; i++) a[i] = data[4 * i + c] + 1;
    closing(a, w, h, K, tmp, bg);
    const d = new Float32Array(n);
    for (let i = 0; i < n; i++) d[i] = bg[i] > a[i] ? Math.log(bg[i] / a[i]) : 0;
    D.push(d);
    if (c !== 1) { const l = new Uint8Array(n); for (let i = 0; i < n; i++) l[i] = bg[i] >= DIM; lit.push(l); }
  }
  const M = new Float32Array(n), hist = new Uint32Array(400);
  let cnt = 0;
  for (let i = 0; i < n; i++) {
    const r = lit[0][i], b = lit[1][i], ref = r && b ? 0.5 * (D[0][i] + D[2][i]) : r ? D[0][i] : b ? D[2][i] : D[1][i];
    const v = (M[i] = D[1][i] - ref); if (v > T) { hist[Math.min(399, (v * 100) | 0)]++; cnt++; }
  }
  let t = T;                                                              // a tenth and a half of the strongest ink
  for (let k = 399, acc = 0; k >= 0; k--) { acc += hist[k]; if (acc >= 0.05 * cnt) { t = Math.max(T, 0.15 * (k / 100)); break; } }
  // red and blue absorbed alike, read a little blurred: a phone's lens and the JPEG shift the channels by a pixel
  // a channel its background already absorbs says nothing (blue over yellow or olive green: its density is the noise of a
  // few levels; a clean scan's overprint over olive was refused for it, 2026-11-19): only the channels with light compared
  for (let i = 0; i < n; i++) a[i] = lit[0][i] && lit[1][i] ? D[2][i] - D[0][i] : 0;
  blur(a, w, h, tmp);
  bg.set(D[1]); blur(bg, w, h, tmp);
  const m = new Uint8Array(n);
  for (let i = 0; i < n; i++) if (M[i] > t && Math.abs(a[i]) < 0.45 * bg[i]) m[i] = 1;
  D.lit = lit;
  return { m, M, t, D };
}

/** The colour-blind ink: what is darker than its surroundings and thin — a small, strongly compressed photo keeps the
 *  darkness of a line a pixel wide and none of its colour (the JPEG's chroma is the surroundings'). `M` the lightness's
 *  density over the local background, `m` the mask at `DARK_T` of the strongest (the 95th percentile). */
function darkMask(data, w, h) {
  const K = 4, T = 0.1, n = w * h;
  const a = new Float32Array(n), tmp = new Float32Array(n), bg = new Float32Array(n), D = [];
  for (let c = 0; c < 3; c++) {
    for (let i = 0; i < n; i++) a[i] = data[4 * i + c] + 1;
    closing(a, w, h, K, tmp, bg);
    const d = new Float32Array(n);
    for (let i = 0; i < n; i++) d[i] = bg[i] > a[i] ? Math.log(bg[i] / a[i]) : 0;
    D.push(d);
  }
  for (let i = 0; i < n; i++) a[i] = (299 * data[4 * i] + 587 * data[4 * i + 1] + 114 * data[4 * i + 2]) / 1000 + 1;
  closing(a, w, h, K, tmp, bg);
  const M = new Float32Array(n), hist = new Uint32Array(400);
  let cnt = 0;
  for (let i = 0; i < n; i++) { const v = (M[i] = bg[i] > a[i] ? Math.log(bg[i] / a[i]) : 0); if (v > T) { hist[Math.min(399, (v * 100) | 0)]++; cnt++; } }
  let t = T;
  for (let k = 399, acc = 0; k >= 0; k--) { acc += hist[k]; if (acc >= 0.05 * cnt) { t = Math.max(T, DARK_T * (k / 100)); break; } }
  const m = new Uint8Array(n);
  for (let i = 0; i < n; i++) if (M[i] > t) m[i] = 1;
  return { m, M, t, D };
}

/** Where rings of radius about r may be, on the continuous ink field: a vote, at radius r only, of every pixel with a
 *  third of the mask's ink, on a 3 px grid; the local peaks with a quarter of a full ring's votes, strongest first. */
function ringCandidates(M, w, h, r, t) {
  const G = 3, cw = Math.ceil(w / G), ch = Math.ceil(h / G), acc = new Uint16Array(cw * ch), A = 36, dx = [], dy = [];
  for (let a = 0; a < A; a++) { dx.push(Math.round(r * Math.cos((2 * Math.PI * a) / A))); dy.push(Math.round(r * Math.sin((2 * Math.PI * a) / A))); }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (M[y * w + x] < t / 3) continue;
    for (let a = 0; a < A; a++) {
      const X = x + dx[a], Y = y + dy[a];
      if (X >= 0 && Y >= 0 && X < w && Y < h) acc[((Y / G) | 0) * cw + ((X / G) | 0)]++;
    }
  }
  const floor = 0.25 * (2 * Math.PI * r) * 2, out = [];                 // a quarter of a ring 2 px wide
  for (let cy = 1; cy < ch - 1; cy++) for (let cx = 1; cx < cw - 1; cx++) {
    const k = cy * cw + cx, v = acc[k];
    if (v < floor) continue;
    let peak = true;
    for (let j = -1; j <= 1 && peak; j++) for (let i = -1; i <= 1; i++) if ((i || j) && acc[k + j * cw + i] > v) { peak = false; break; }
    if (peak) out.push({ x: cx * G + 1, y: cy * G + 1, v });
  }
  return out.sort((a, b) => b.v - a.v).slice(0, 3000);
}
/** A ring read on the continuous ink field, at 72 points of the circle: at each, the ink on the circle (within a pixel
 *  and a half) less the ink 4 to 5 px inside and outside it — a ridge, which a line crossing the circle or a hatching
 *  does not make. `score`: the share of 24 sectors with a ridge of the mask's ink (a third of it counting half: a
 *  photo's blur makes a side pale); `arcs`: the share of the circle in inked arcs of 20° or more (ISOM cuts a circle in
 *  a few places; hatching and text cross it in many short dots). */
function ridgeRing(M, w, h, x, y, r, t) {
  const n = 72, at = (X, Y) => { X = Math.round(X); Y = Math.round(Y); return X >= 0 && Y >= 0 && X < w && Y < h ? M[Y * w + X] : 0; };
  const rd = new Float32Array(n), on = new Uint8Array(n);
  for (let k = 0; k < n; k++) {
    const a = (2 * Math.PI * k) / n, c = Math.cos(a), s = Math.sin(a);
    let v = 0, off = 0;
    for (const d of [-1.5, -0.75, 0, 0.75, 1.5]) v = Math.max(v, at(x + (r + d) * c, y + (r + d) * s));
    for (const d of [4, 5]) off = Math.max(off, at(x + (r - d) * c, y + (r - d) * s), at(x + (r + d) * c, y + (r + d) * s));
    rd[k] = v - off;
    on[k] = rd[k] >= 0.3 * t && v >= 0.5 * t ? 1 : 0;
  }
  let strong = 0, weak = 0;
  for (let q = 0; q < 24; q++) { const m = Math.max(rd[3 * q], rd[3 * q + 1], rd[3 * q + 2]); if (m >= t) strong++; else if (m >= 0.3 * t) weak++; }
  let arcs = 0;
  const z = on.indexOf(0);
  if (z < 0) arcs = n;
  else for (let k = 1, run = 0; k <= n; k++) { if (on[(z + k) % n]) run++; else { if (run >= 4) arcs += run; run = 0; } }
  return { score: (strong + 0.5 * weak) / 24, arcs: arcs / n };
}
/** The best ridge ring within two pixels and a pixel of radius of (x, y, r). */
function bestRidge(M, w, h, x0, y0, r0, t) {
  let best = null;
  for (let r = r0 - 1; r <= r0 + 1; r++) for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
    const q = ridgeRing(M, w, h, x0 + dx, y0 + dy, r, t), v = q.score + q.arcs;
    if (!best || v > best.v) best = { x: x0 + dx, y: y0 + dy, r, ...q, v };
  }
  return best;
}

/** The overprint's colour along a ring, as two density ratios: red and blue ink over green ink, read where the ring is
 *  inked (the point of most ink within a pixel and a half of the circle, at 72 points); medians. The overprint absorbs
 *  green and lets red and blue through: both ratios well under 1, and close to each other. */
function ringColour(M, D, w, h, x, y, r) {
  const A = [], B = [];
  for (let k = 0; k < 72; k++) {
    const a = (2 * Math.PI * k) / 72, c = Math.cos(a), s = Math.sin(a);
    let bi = -1, bv = 0;
    for (const d of [-1.5, -0.75, 0, 0.75, 1.5]) {
      const X = Math.round(x + (r + d) * c), Y = Math.round(y + (r + d) * s);
      if (X < 0 || Y < 0 || X >= w || Y >= h) continue;
      const i = Y * w + X;
      if (M[i] > bv) { bv = M[i]; bi = i; }
    }
    if (bi < 0 || D[1][bi] <= 0.05) continue;
    // a channel its background absorbs already (blue over olive green) takes the other's ratio: it says nothing itself
    const r0 = !D.lit || D.lit[0][bi], b0 = !D.lit || D.lit[1][bi];
    if (!r0 && !b0) continue;
    const ra = D[0][bi] / D[1][bi], rb = D[2][bi] / D[1][bi];
    A.push(r0 ? ra : rb); B.push(b0 ? rb : ra);
  }
  const med = (v) => { if (!v.length) return null; v.sort((p, q) => p - q); return v[v.length >> 1]; };
  return { cr: med(A), cb: med(B) };
}
/** The overprint's colour: red and blue let through alike (their density ratios within 0.4 of each other — a printer's purple
 *  absorbs a little more blue than red: 0.3 to 0.35 apart on the Morbihan scans, 2026-11-19), and both absorbed less than green.
 *  A grey building on olive green, a brown knoll or red text are not. */
function purpleRing(c) { return c.cr == null || (Math.abs(c.cr - c.cb) <= 0.4 && Math.max(c.cr, c.cb) <= 1); }
/** The share of a circle's inside (within 0.7 r, on a grid of about 60 points) inked at half the mask's level: a control's
 *  circle is empty inside, a hatching or a grid of lines is not. */
function inkInside(M, w, h, x, y, r, t) {
  const st = Math.max(1, (1.4 * r) / 9);
  let n = 0, on = 0;
  for (let dy = -0.7 * r; dy <= 0.7 * r; dy += st) for (let dx = -0.7 * r; dx <= 0.7 * r; dx += st) {
    if (dx * dx + dy * dy > 0.49 * r * r) continue;
    const X = Math.round(x + dx), Y = Math.round(y + dy);
    if (X < 0 || Y < 0 || X >= w || Y >= h) continue;
    n++; if (M[Y * w + X] >= t / 2) on++;
  }
  return n ? on / n : 0;
}
/** Whether a straight line crosses a circle's inside: of 84 chords (12 directions, through the centre and up to 0.6 r
 *  either side, within 0.75 r of it), the largest share inked at half the mask's level. Legs stop at a control's circle; a
 *  crossing of legs, or a hatching, runs through. */
function lineAcross(M, w, h, x, y, r, t) {
  let best = 0;
  for (let d = 0; d < 12; d++) {
    const c = Math.cos((Math.PI * d) / 12), s = Math.sin((Math.PI * d) / 12);
    for (const o of [-0.6, -0.4, -0.2, 0, 0.2, 0.4, 0.6]) {
      const half = Math.sqrt(0.5625 - o * o) * r;
      let n = 0, on = 0;
      for (let u = -half; u <= half; u += 1) {
        const X = Math.round(x + u * c - o * r * s), Y = Math.round(y + u * s + o * r * c);
        if (X < 0 || Y < 0 || X >= w || Y >= h) continue;
        n++;
        const i = Y * w + X;
        if (M[i] >= t / 2 || (X + 1 < w && M[i + 1] >= t / 2) || (Y + 1 < h && M[i + w] >= t / 2)) on++;
      }
      if (n && on / n > best) best = on / n;
    }
  }
  return best;
}
