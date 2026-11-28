// « Virtually »'s look (games/vworld.js): everything drawn here is procedural — canvases and geometry made in the browser,
// no image or model from anywhere else. Leaf and needle cards for the crowns, bark, the forest floor's litter and its relief
// (a normal map), grass tufts, a sky dome with the sun's glow, the wind's sway, and impostors (a tree rendered once to a
// texture, drawn as two crossed cards) for the trees far from the runner. (Owner, 2026-11-11: « a lot more realistic ».)

/** A seeded generator (mulberry32). */
export function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

const canvas = (w, h = w) => { const c = document.createElement("canvas"); c.width = w; c.height = h; return [c, c.getContext("2d")]; };
const grey = (v, a = 1) => `rgba(${v | 0},${v | 0},${v | 0},${a})`;

/** A cluster of broad leaves on a transparent ground, grey (the instance's colour tints it), darker inside. */
function leafCanvas(seed) {
  const S = 256, [c, g] = canvas(S), r = rng(seed);
  for (let k = 0; k < 520; k++) {
    // denser toward the middle, the cluster's edge ragged
    const a = r() * 6.283, d = Math.sqrt(r()) * 0.46 * S * (0.75 + 0.25 * Math.sin(a * 5 + seed));
    const x = S / 2 + Math.cos(a) * d, y = S / 2 + Math.sin(a) * d * 0.92;
    const L = 9 + r() * 10, W = L * (0.42 + r() * 0.16), ang = r() * 6.283;
    const v = 120 + (1 - d / (0.5 * S)) * -40 + r() * 135;
    g.save(); g.translate(x, y); g.rotate(ang);
    g.fillStyle = grey(Math.min(255, v)); g.beginPath(); g.ellipse(0, 0, L / 2, W / 2, 0, 0, 6.283); g.fill();
    g.strokeStyle = grey(Math.min(255, v) * 0.72, 0.8); g.lineWidth = 0.8; g.beginPath(); g.moveTo(-L / 2, 0); g.lineTo(L / 2, 0); g.stroke();
    g.restore();
  }
  // a few twigs
  g.strokeStyle = grey(70, 0.9); g.lineWidth = 1.6;
  for (let k = 0; k < 6; k++) { const a = r() * 6.283; g.beginPath(); g.moveTo(S / 2, S / 2); g.lineTo(S / 2 + Math.cos(a) * S * 0.3, S / 2 + Math.sin(a) * S * 0.3); g.stroke(); }
  return c;
}

/** A conifer's branch seen from the side: a spray of needles, drooping. */
function needleCanvas(seed) {
  const S = 256, [c, g] = canvas(S), r = rng(seed);
  g.lineCap = "round";
  for (let b = 0; b < 7; b++) {
    const y0 = S * (0.2 + b * 0.1), len = S * (0.42 - Math.abs(b - 3) * 0.04);
    let x = S / 2, y = y0;
    const steps = 16;
    for (let s = 0; s < steps; s++) {
      const side = b % 2 ? 1 : -1, nx = x + side * len / steps, ny = y + (s * 0.35) * (len / steps) / 6;
      g.strokeStyle = grey(80 + r() * 30); g.lineWidth = 2.2 * (1 - s / steps) + 0.8;
      g.beginPath(); g.moveTo(x, y); g.lineTo(nx, ny); g.stroke();
      for (let n = 0; n < 9; n++) {
        const t = r(), px = x + (nx - x) * t, py = y + (ny - y) * t, a = (r() - 0.5) * 2.2 + (side > 0 ? 0.6 : 2.5), l = 7 + r() * 9 * (1 - s / steps * 0.5);
        g.strokeStyle = grey(140 + r() * 115); g.lineWidth = 1.3;
        g.beginPath(); g.moveTo(px, py); g.lineTo(px + Math.cos(a) * l, py + Math.sin(a) * l + 3); g.stroke();
      }
      x = nx; y = ny;
    }
  }
  return c;
}

/** Bark: vertical furrows and plates, grey (tinted by the instance). */
function barkCanvas(seed) {
  const [c, g] = canvas(64, 256), r = rng(seed);
  g.fillStyle = grey(170); g.fillRect(0, 0, 64, 256);
  for (let k = 0; k < 90; k++) {
    const x = r() * 64, y = r() * 256, h = 20 + r() * 70;
    g.strokeStyle = grey(70 + r() * 60, 0.8); g.lineWidth = 1 + r() * 2.5;
    g.beginPath(); g.moveTo(x, y); g.bezierCurveTo(x + (r() - 0.5) * 6, y + h / 3, x + (r() - 0.5) * 6, y + 2 * h / 3, x + (r() - 0.5) * 4, y + h); g.stroke();
    if (r() < 0.3) { g.fillStyle = grey(200 + r() * 55, 0.5); g.fillRect(x - 3, y, 4 + r() * 4, 6 + r() * 12); }
  }
  return c;
}

/** The forest floor: dead leaves, needles, twigs and moss over a mottled ground, grey (multiplies the ground's colours),
 *  with its heights for the normal map. */
function litterCanvas(seed) {
  const S = 512, [c, g] = canvas(S), r = rng(seed);
  const img = g.createImageData(S, S);
  // a mottled base: a few octaves of value noise
  const oct = [[8, 0.5], [32, 0.3], [128, 0.2]].map(([n, a]) => { const v = new Float32Array(n * n); for (let i = 0; i < v.length; i++) v[i] = r(); return [n, a, v]; });
  const at = (v, n, x, y) => { const fx = x * n / S, fy = y * n / S, i = Math.floor(fx), j = Math.floor(fy), u = fx - i, w = fy - j, I = (p, q) => v[((q % n) + n) % n * n + ((p % n) + n) % n];
    return (I(i, j) * (1 - u) + I(i + 1, j) * u) * (1 - w) + (I(i, j + 1) * (1 - u) + I(i + 1, j + 1) * u) * w; };
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    let v = 0; for (const [n, a, t] of oct) v += a * at(t, n, x, y);
    const q = (y * S + x) * 4, k = 120 + v * 90; img.data[q] = img.data[q + 1] = img.data[q + 2] = k; img.data[q + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  // wrapped drawing (the texture tiles)
  const wrap = (f) => { for (const dx of [-S, 0, S]) for (const dy of [-S, 0, S]) { g.save(); g.translate(dx, dy); f(); g.restore(); } };
  for (let k = 0; k < 1400; k++) {
    const x = r() * S, y = r() * S, a = r() * 6.283, L = 5 + r() * 9, v = 90 + r() * 165;
    wrap(() => { g.save(); g.translate(x, y); g.rotate(a); g.fillStyle = grey(v, 0.85); g.beginPath(); g.ellipse(0, 0, L / 2, L / 4, 0, 0, 6.283); g.fill(); g.restore(); });
  }
  for (let k = 0; k < 160; k++) {
    const x = r() * S, y = r() * S, a = r() * 6.283, L = 14 + r() * 40, v = 50 + r() * 40;
    wrap(() => { g.strokeStyle = grey(v, 0.9); g.lineWidth = 1 + r() * 2; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * L, y + Math.sin(a) * L); g.stroke(); });
  }
  return c;
}

/** A normal map from a grey canvas (its value read as height). */
function normalCanvas(src, strength = 2.2) {
  const S = src.width, g0 = src.getContext("2d"), d = g0.getImageData(0, 0, S, S).data, [c, g] = canvas(S), img = g.createImageData(S, S);
  const h = (x, y) => d[((((y + S) % S) * S + ((x + S) % S)) * 4)] / 255;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const dx = (h(x + 1, y) - h(x - 1, y)) * strength, dy = (h(x, y + 1) - h(x, y - 1)) * strength, l = Math.hypot(dx, dy, 1), q = (y * S + x) * 4;
    img.data[q] = (-dx / l * 0.5 + 0.5) * 255; img.data[q + 1] = (dy / l * 0.5 + 0.5) * 255; img.data[q + 2] = (1 / l * 0.5 + 0.5) * 255; img.data[q + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return c;
}

/** Grass tufts: thin blades from the bottom, a few seed heads. */
function grassCanvas(seed) {
  const [c, g] = canvas(128), r = rng(seed);
  for (let k = 0; k < 46; k++) {
    const x0 = 20 + r() * 88, h = 50 + r() * 74, lean = (r() - 0.5) * 50, v = 140 + r() * 115;
    g.strokeStyle = grey(v); g.lineWidth = 1.2 + r() * 1.4;
    g.beginPath(); g.moveTo(x0, 128); g.quadraticCurveTo(x0 + lean * 0.3, 128 - h * 0.6, x0 + lean, 128 - h); g.stroke();
  }
  return c;
}

/** A fern frond spray (the former sprite, kept for ferns and bracken). */
function fernCanvas(seed) {
  const [c, g] = canvas(128), r = rng(seed);
  for (let f = 0; f < 11; f++) {
    const a = -1.25 + f * 0.25 + (r() - 0.5) * 0.2, L = 60 + r() * 60;
    g.strokeStyle = grey(200 + r() * 55); g.lineWidth = 2.2;
    let x = 64, y = 128;
    for (let s = 0; s < 12; s++) {
      const nx = x + Math.sin(a) * L / 12 * (1 + s * 0.06), ny = y - Math.cos(a) * L / 12;
      g.beginPath(); g.moveTo(x, y); g.lineTo(nx, ny); g.stroke();
      const w = (12 - s) * 1.1; g.beginPath(); g.moveTo(nx, ny); g.lineTo(nx + Math.cos(a) * w, ny + Math.sin(a) * w - 3); g.moveTo(nx, ny); g.lineTo(nx - Math.cos(a) * w, ny - Math.sin(a) * w - 3); g.stroke();
      x = nx; y = ny;
    }
  }
  return c;
}

/** Lichen and grain on stone. */
function stoneCanvas(seed) {
  const [c, g] = canvas(128), r = rng(seed);
  g.fillStyle = grey(175); g.fillRect(0, 0, 128, 128);
  for (let k = 0; k < 900; k++) { g.fillStyle = grey(110 + r() * 145, 0.5); g.fillRect(r() * 128, r() * 128, 1 + r() * 2, 1 + r() * 2); }
  for (let k = 0; k < 26; k++) { g.fillStyle = `rgba(${150 + r() * 60 | 0},${170 + r() * 50 | 0},${110 + r() * 40 | 0},0.45)`; g.beginPath(); g.arc(r() * 128, r() * 128, 2 + r() * 7, 0, 6.283); g.fill(); }
  return c;
}

export function textures(T, renderer) {
  const tex = (c, srgb = true, rep = false) => {
    const t = new T.CanvasTexture(c); if (srgb) t.colorSpace = T.SRGBColorSpace;
    if (rep) t.wrapS = t.wrapT = T.RepeatWrapping;
    t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy()); return t;
  };
  const lit = litterCanvas(11);
  return { leaf: [tex(leafCanvas(3)), tex(leafCanvas(17))], needle: tex(needleCanvas(5)), bark: tex(barkCanvas(7), true, true),
    litter: tex(lit, false, true), litterN: tex(normalCanvas(lit), false, true), grass: tex(grassCanvas(13)), fern: tex(fernCanvas(5)),
    stone: tex(stoneCanvas(19)) };
}

// ---- photo textures (CC0: Poly Haven, ambientCG; tools/virtually/textures.py and texsets.py, credits in
// /assets/textures/virtually/CREDITS.txt) ----
// Each photo's colours are normalised around mid-grey: the game's own colours (the map's classes, the biome's trunks, leaves and
// stones) tint them, the photo gives the grain. They are read as linear data and multiplied by 2 (`PHOTO_GAIN`).
const PHOTOS = ["ground-litter", "ground-litter-n", "ground-gravel", "bark", "bark-n", "stone", "stone-n", "leaves-a", "leaves-b"];
/** The texture sets: a race's biome names one (« textures »), whose roles replace the default files. The roles a set may add:
 *  the conifers' bark « pine-bark » (a trunk of their own), their needle sprays « needles », half the broadleaf crowns' leaves
 *  « leaves-tree », the grass tufts « grass », the low plants « low »; without one the default or drawn card stays. Owner,
 *  2026-11-13: photographed textures by terrain type, « a general solution for more realistic scenes in forest ». */
export const TEXTURE_SETS = {
  default: {},
  // Fontainebleau's sandstone massifs (Trois Pignons…): sand under pine needles, white sand on the paths, grey sandstone, Scots
  // pines, oaks
  sandpine: { "ground-litter": "sandpine-litter", "ground-litter-n": "sandpine-litter-n", "ground-gravel": "sand",
    stone: "sandstone", "stone-n": "sandstone-n", "pine-bark": "pine-bark", "pine-bark-n": "pine-bark-n", needles: "needles",
    "leaves-tree": "oak-leaves" },
};
export const PHOTO_GAIN = 2;
const BITMAP = { premultiplyAlpha: "none", colorSpaceConversion: "none" };
/** The photo textures' pictures (ImageBitmaps by role), fetched together; null for one that fails (the drawn one stands in).
 *  `tex` { <TEX_ROLES role>: url } an event's own terrain photos laid over the set's (overlayPhotos); a string there is the
 *  former second argument, the files' folder. */
export async function loadPhotos(set = "default", tex = null, base = "/assets/textures/virtually/") {
  if (typeof tex === "string") { base = tex; tex = null; }
  const roles = { ...Object.fromEntries(PHOTOS.map((n) => [n, n])), ...(TEXTURE_SETS[set] || {}) };
  const one = async ([role, n]) => {
    try {
      const r = await fetch(`${base}${n}.webp`);
      if (!r.ok) return [role, null];
      return [role, await createImageBitmap(await r.blob(), BITMAP)];
    } catch (e) { return [role, null]; }
  };
  const photos = Object.fromEntries(await Promise.all(Object.entries(roles).map(one)));
  return tex ? overlayPhotos(photos, tex) : photos;
}

// ---- an event's own terrain photos (owner, 2026-11-28; docs/pixel/competitions.md §3.3, §4) ---------------------------------
/** The roles an organiser may send a photo for (functions/api/virtual/events: tex-<role>.webp), each laid over the set's: the
 *  forest floor, the paths' gravel, the rocks, the trunks' bark (the conifers' too), the grass tufts and the broadleaf crowns. */
export const TEX_ROLES = ["floor", "path", "rock", "bark", "grass", "leaves"];
// a role's photo roles (PHOTOS, TEXTURE_SETS): the ones it replaces, and the normal maps dropped with them (made for the set's own
// photo: a drawn one stands in for the floor, none for the others)
const TEX_MAP = { floor: { to: ["ground-litter"], drop: ["ground-litter-n"] }, path: { to: ["ground-gravel"] },
  rock: { to: ["stone"], drop: ["stone-n"] }, bark: { to: ["bark", "pine-bark"], drop: ["bark-n", "pine-bark-n"] },
  grass: { to: ["grass"], card: "grass" }, leaves: { to: ["leaves-a", "leaves-b", "leaves-tree"], card: "leaves" } };

/** A card's photo (grass tufts, a leaf cluster: cut out, with transparency) from a square opaque photo: the card's shape — the set's
 *  own card, else the drawn one — filled with the photo's colours. */
function cardFrom(img, shape) {
  const w = shape.width || 256, h = shape.height || 256, [c, g] = canvas(w, h);
  g.drawImage(img, 0, 0, w, h);
  g.globalCompositeOperation = "destination-in"; g.drawImage(shape, 0, 0, w, h);
  return createImageBitmap(c, BITMAP);
}

/** Lay an event's photos `tex` { <role>: url } over `photos` (loadPhotos' pictures); a url that fails is left out. */
export async function overlayPhotos(photos, tex) {
  const out = { ...(photos || {}) };
  const got = await Promise.all(Object.entries(tex || {}).filter(([role, url]) => TEX_MAP[role] && typeof url === "string" && url).map(async ([role, url]) => {
    try {
      const r = await fetch(url, { credentials: "same-origin" });
      if (!r.ok) return null;
      return [role, await createImageBitmap(await r.blob(), BITMAP)];
    } catch (e) { return null; }
  }));
  for (const [role, img] of got.filter(Boolean)) {
    const m = TEX_MAP[role];
    for (const d of m.drop || []) out[d] = null;
    for (const to of m.to) {
      if (!m.card) { if (to !== "pine-bark" || out[to]) out[to] = img; continue; }   // the conifers' own bark: only a set's that has one
      if (to === "leaves-tree" && !out[to]) continue;           // only a set that has its own tree leaves
      const shape = out[to] || (m.card === "grass" ? grassCanvas(13) : leafCanvas(to === "leaves-b" ? 17 : 3));
      try { out[to] = await cardFrom(img, shape); } catch (e) { /* the set's card stays */ }
    }
  }
  return out;
}

/**
 * A photo chosen by an organiser made into an event's terrain texture: its central square at 512 × 512, its colours brought round
 * mid-grey per channel as the built-in photos are (tools/virtually/textures.py `normalised`: mean 128 a channel, 85 % of the
 * photo's own colour variation kept, the rest its lightness), made to tile (cross-faded with itself shifted half a tile, first
 * across, then down), then WebP (JPEG where the browser cannot write WebP). Returns a Blob.
 */
export async function prepareTexture(file) {
  const S = 512, KEEP = 0.85;
  const img = await createImageBitmap(file);
  const side = Math.min(img.width, img.height), sx = (img.width - side) / 2, sy = (img.height - side) / 2;
  // a large photo brought down in halves (one step from 4000 px to 512 aliases)
  let src = img, sw = side, sxx = sx, syy = sy;
  while (sw > S * 2) {
    const n = Math.ceil(sw / 2), [c, g] = canvas(n);
    g.imageSmoothingQuality = "high"; g.drawImage(src, sxx, syy, sw, sw, 0, 0, n, n);
    src = c; sw = n; sxx = 0; syy = 0;
  }
  const [c0, g0] = canvas(S);
  g0.imageSmoothingQuality = "high"; g0.drawImage(src, sxx, syy, sw, sw, 0, 0, S, S);
  img.close?.();
  const id = g0.getImageData(0, 0, S, S), d = id.data, N = S * S;
  // round mid-grey
  const mean = [0, 0, 0];
  for (let i = 0; i < N; i++) { mean[0] += d[i * 4]; mean[1] += d[i * 4 + 1]; mean[2] += d[i * 4 + 2]; }
  for (let k = 0; k < 3; k++) mean[k] = Math.max(1, mean[k] / N);
  const lum = new Float32Array(N); let lm = 0;
  for (let i = 0; i < N; i++) { lum[i] = (d[i * 4] + d[i * 4 + 1] + d[i * 4 + 2]) / 3; lm += lum[i]; }
  lm = Math.max(1, lm / N);
  const a = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) for (let k = 0; k < 3; k++) a[i * 3 + k] = (lum[i] / lm) * 128 * (1 - KEEP) + (d[i * 4 + k] / mean[k]) * 128 * KEEP;
  // tiling: across (x), then down (y), each a cross-fade with the picture shifted half a tile, its own weight sin² — 1 in the middle,
  // where the shifted copy has its seam, 0 at the edges, where the picture has its own
  const w = new Float32Array(S);
  for (let i = 0; i < S; i++) w[i] = Math.sin((Math.PI * (i + 0.5)) / S) ** 2;
  const fade = (across) => {
    const b = new Float32Array(N * 3), h = S >> 1;
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const q = (y * S + x) * 3, xs = across ? (x + h) % S : x, ys = across ? y : (y + h) % S, p = (ys * S + xs) * 3, f = across ? w[x] : w[y];
      for (let k = 0; k < 3; k++) b[q + k] = a[q + k] * f + a[p + k] * (1 - f);
    }
    a.set(b);
  };
  fade(true); fade(false);
  for (let i = 0; i < N; i++) { for (let k = 0; k < 3; k++) d[i * 4 + k] = Math.max(0, Math.min(255, Math.round(a[i * 3 + k]))); d[i * 4 + 3] = 255; }
  g0.putImageData(id, 0, 0);
  const blob = (type, q) => new Promise((r) => c0.toBlob(r, type, q));
  const webp = await blob("image/webp", 0.85);
  return webp && webp.type === "image/webp" ? webp : blob("image/jpeg", 0.88);
}
/** Textures of the photos: linear (they are factors), repeated, mipmapped. */
export function photoTextures(T, renderer, bm) {
  const out = {};
  for (const [n, img] of Object.entries(bm || {})) {
    if (!img) continue;
    const t = new T.Texture(img); t.colorSpace = T.NoColorSpace; t.flipY = false;
    t.wrapS = t.wrapT = T.RepeatWrapping; t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    t.generateMipmaps = true; t.minFilter = T.LinearMipmapLinearFilter; t.needsUpdate = true;
    out[n] = t;
  }
  return out;
}

// ---- geometries ----------------------------------------------------------------------------------------------------------------
/** Merge BufferGeometries (position, normal, uv, and colour when one has it; indexed or not). */
export function merge(T, parts) {
  const pos = [], nor = [], uv = [], col = [], idx = []; let base = 0;
  const anyCol = parts.some((g) => g.attributes.color);
  for (const g of parts) {
    const p = g.attributes.position, n = g.attributes.normal, u = g.attributes.uv, c = g.attributes.color;
    for (let k = 0; k < p.count; k++) {
      pos.push(p.getX(k), p.getY(k), p.getZ(k)); nor.push(n.getX(k), n.getY(k), n.getZ(k)); uv.push(u ? u.getX(k) : 0, u ? u.getY(k) : 0);
      if (anyCol) col.push(c ? c.getX(k) : 1, c ? c.getY(k) : 1, c ? c.getZ(k) : 1);
    }
    if (g.index) for (let k = 0; k < g.index.count; k++) idx.push(g.index.getX(k) + base); else for (let k = 0; k < p.count; k++) idx.push(k + base);
    base += p.count;
  }
  const g = new T.BufferGeometry(); g.setAttribute("position", new T.Float32BufferAttribute(pos, 3)); g.setAttribute("normal", new T.Float32BufferAttribute(nor, 3));
  g.setAttribute("uv", new T.Float32BufferAttribute(uv, 2)); if (anyCol) g.setAttribute("color", new T.Float32BufferAttribute(col, 3));
  g.setIndex(idx); return g;
}

/** Baked ambient occlusion: each vertex's grey from its position (fn(x, y, z) → 0…1), as the geometry's vertex colours. */
export function bakeAO(T, g, fn) {
  const P = g.attributes.position, c = new Float32Array(P.count * 3);
  for (let i = 0; i < P.count; i++) { const v = fn(P.getX(i), P.getY(i), P.getZ(i)); c[i * 3] = c[i * 3 + 1] = c[i * 3 + 2] = v; }
  g.setAttribute("color", new T.BufferAttribute(c, 3));
  return g;
}

/** A crown of leaf cards inside the unit ellipsoid (x, z in −1…1, y in −1…1): each card faces out from the middle, its
 *  normals bent outward so that the crown is lit as one soft mass, not as flat cards. */
export function cardCrown(T, seed, n = 22, ry = 1, { wide = 1, lobes = 0 } = {}) {
  const r = rng(seed), parts = [];
  // a few lobes the cards gather round (an irregular crown: an oak's or an old beech's), else one mass
  const L = Array.from({ length: lobes }, () => { const a = r() * 6.283, u = r() * 1.2 - 0.4; return new T.Vector3(Math.cos(a) * 0.45 * wide, u * 0.4 * ry, Math.sin(a) * 0.45 * wide); });
  for (let k = 0; k < n; k++) {
    const u = r() * 2 - 1, a = r() * 6.283, s = Math.sqrt(1 - u * u), d = 0.35 + 0.55 * Math.cbrt(r());
    const c = new T.Vector3(Math.cos(a) * s * d * wide, u * d * ry, Math.sin(a) * s * d * wide), size = 0.85 + r() * 0.45;
    if (L.length) { c.multiplyScalar(0.6).add(L[k % L.length]); }
    const p = new T.PlaneGeometry(size, size);
    const out = c.lengthSq() > 1e-4 ? c.clone().normalize() : new T.Vector3(0, 1, 0);
    const q = new T.Quaternion().setFromUnitVectors(new T.Vector3(0, 0, 1), out.clone().lerp(new T.Vector3(r() - 0.5, r() - 0.5, r() - 0.5), 0.6).normalize());
    p.applyQuaternion(q); p.rotateZ(0); p.translate(c.x, c.y, c.z);
    const P = p.attributes.position, N = p.attributes.normal;
    for (let i = 0; i < P.count; i++) {
      const v = new T.Vector3(P.getX(i), P.getY(i) / ry, P.getZ(i)).normalize().lerp(new T.Vector3(0, 1, 0), 0.25).normalize();
      N.setXYZ(i, v.x, v.y, v.z);
    }
    parts.push(p);
  }
  // baked occlusion: the inside and the underside of the crown darker (light comes through and from above)
  return twoSided(T, bakeAO(T, merge(T, parts), (x, y, z) => {
    const rr = Math.min(1, Math.hypot(x / wide, y / ry, z / wide));
    return Math.min(1, 0.42 + 0.38 * rr + 0.28 * (y / ry + 1) / 2);
  }));
}

/** A conifer of needle cards: whorls of branches drooping round the axis, shorter toward the top (unit height 0…1, radius 1). */
export function cardConifer(T, seed, { whorls = 9, from = 0.06, shape = "cone" } = {}) {
  const r = rng(seed), parts = [];
  for (let w = 0; w < whorls; w++) {
    const f = w / whorls, y = from + f * (0.92 - from);
    // a spruce's cone, a pine's crown (wide and rounded at the top of a bare trunk), or a young pine: an ovoid down to the ground,
    // dense, its top rounded (a sapling's narrow cone of thin cards read as a dark spike, owner 2026-11-13)
    const young = shape === "young";
    const rad = shape === "pine" ? (0.55 + 0.45 * Math.sin(Math.PI * (0.25 + 0.75 * f))) * (0.9 + r() * 0.25)
      : young ? (0.62 + 0.38 * Math.sin(Math.PI * (0.15 + 0.85 * f))) * (1 - 0.45 * f) * (0.9 + r() * 0.2) : (1 - f) * 0.95 + 0.08;
    const nb = young ? Math.max(5, Math.round(9 - w * 0.5)) : Math.max(3, Math.round((shape === "pine" ? 6 : 7) - w * 0.5));
    for (let b = 0; b < nb; b++) {
      const a = (b / nb) * 6.283 + r() * 0.5 + w;
      const p = new T.PlaneGeometry(rad * 1.15, (young ? 0.42 : 0.32) + rad * (young ? 0.2 : 0.12));
      p.translate(rad * 0.55, 0, 0); p.rotateZ(-0.12); p.rotateX((r() - 0.5) * 0.9); p.rotateY(-a); p.translate(0, y, 0);
      const N = p.attributes.normal, P = p.attributes.position;
      for (let i = 0; i < N.count; i++) { const v = new T.Vector3(P.getX(i), 0.5, P.getZ(i)).normalize(); N.setXYZ(i, v.x, v.y, v.z); }
      parts.push(p);
    }
  }
  // the top
  const top = new T.PlaneGeometry(0.22, 0.2).translate(0, 0.96, 0);
  parts.push(top, top.clone().rotateY(Math.PI / 2));
  // the inner branches and the lower ones in shade
  return twoSided(T, bakeAO(T, merge(T, parts), (x, y, z) => Math.min(1, 0.45 + 0.35 * Math.min(1, Math.hypot(x, z) / 0.7) + 0.3 * y)));
}

/** A Scots pine's crown (owner, 2026-11-13: « their real silhouette », not a spruce's cone): a flat, irregular umbrella of needle
 *  tufts at the top of the bare trunk, gaps of sky between them. Each tuft: a card lying nearly flat, tilted up toward the
 *  outside, and two upright crossed cards (seen from the side too); its normals bent outward and up, as one lit mass. Unit:
 *  y 0…1 the crown's depth, x and z −1…1. */
export function cardUmbrella(T, seed, tufts = 9) {
  const r = rng(seed), parts = [], tilt = new T.Vector3(), up = new T.Vector3(0, 1, 0);
  for (let k = 0; k < tufts; k++) {
    const a = (k / tufts) * 6.283 + r() * 0.8, d = k === 0 ? 0.08 : 0.3 + 0.62 * Math.sqrt(r());
    const cx = Math.cos(a) * d, cz = Math.sin(a) * d, cy = 0.45 + 0.4 * (1 - d * d) + (r() - 0.5) * 0.22, tw = 0.6 + r() * 0.4;
    const cards = [new T.PlaneGeometry(tw, tw * 0.75).rotateX(-Math.PI / 2 + 0.25 + r() * 0.45),
      new T.PlaneGeometry(tw * 0.9, tw * 0.5), new T.PlaneGeometry(tw * 0.9, tw * 0.5).rotateY(Math.PI / 2)];
    const turn = a + (r() - 0.5) * 0.8;
    for (const p of cards) {
      p.rotateY(-turn); p.translate(cx, cy, cz);
      const P = p.attributes.position, N = p.attributes.normal;
      for (let i = 0; i < N.count; i++) { tilt.set(P.getX(i), (P.getY(i) - 0.35) * 0.6, P.getZ(i)).normalize().lerp(up, 0.45).normalize(); N.setXYZ(i, tilt.x, tilt.y, tilt.z); }
      parts.push(p);
    }
  }
  // the tufts' undersides and the middle in shade
  return twoSided(T, bakeAO(T, merge(T, parts), (x, y, z) => Math.min(1, 0.42 + 0.42 * Math.min(1, (y - 0.25) / 0.7) + 0.22 * Math.min(1, Math.hypot(x, z)))));
}

/** Crossed cards, unit wide, standing on y = 0 (grass, ferns, impostors). */
export function crossed(T, n = 3, h = 1) {
  return twoSided(T, merge(T, Array.from({ length: n }, (_, k) => {
    const p = new T.PlaneGeometry(1, h).translate(0, h / 2, 0).rotateY((k * Math.PI) / n);
    const N = p.attributes.normal; for (let i = 0; i < N.count; i++) N.setXYZ(i, 0, 1, 0);   // lit as the ground under them
    return p;
  })));
}

/** Both faces of every triangle, the back one with the same normals (cards lit alike from either side; a material's
 *  DoubleSide would turn the normals of the face seen from behind and darken half the cards). */
export function twoSided(T, g) {
  const idx = g.index.array, n = idx.length, out = new Uint32Array(n * 2);
  out.set(idx);
  for (let i = 0; i < n; i += 3) { out[n + i] = idx[i]; out[n + i + 1] = idx[i + 2]; out[n + i + 2] = idx[i + 1]; }
  g.setIndex(new T.BufferAttribute(out, 1));
  return g;
}

// ---- the wind --------------------------------------------------------------------------------------------------------------
/** Sway a material's vertices with the wind: the higher the vertex (in its own unit), the more it moves; each instance in
 *  its own phase. `wind` is the shared { value: seconds } uniform. */
export function sway(material, wind, amount = 0.06, fromY = 0) {
  const prev = material.onBeforeCompile;
  material.onBeforeCompile = (sh, r) => {
    prev?.(sh, r);
    sh.uniforms.wTime = wind;
    sh.vertexShader = "uniform float wTime;\n" + sh.vertexShader.replace("#include <begin_vertex>", `#include <begin_vertex>
      #ifdef USE_INSTANCING
        vec2 wOrg = instanceMatrix[3].xz;
      #else
        vec2 wOrg = vec2(0.0);
      #endif
      float wK = max(position.y - ${fromY.toFixed(2)}, 0.0);
      float wPh = wTime * 1.3 + wOrg.x * 0.21 + wOrg.y * 0.17;
      transformed.x += (sin(wPh) + 0.4 * sin(wPh * 2.7 + 1.3)) * ${amount.toFixed(3)} * wK;
      transformed.z += cos(wPh * 0.8 + 0.7) * ${(amount * 0.7).toFixed(3)} * wK;`);
  };
  material.customProgramCacheKey = () => `sway${amount}${fromY}`;
  return material;
}

// ---- the sky ---------------------------------------------------------------------------------------------------------------
/** A dome following the camera: blue above, the haze's colour at the horizon (the fog's), the sun's disc and glow. */
export function sky(T, sunDir, horizon, zenith) {
  const mat = new T.ShaderMaterial({
    side: T.BackSide, depthWrite: false, fog: false,
    uniforms: { sunDir: { value: sunDir.clone().normalize() }, cH: { value: horizon.clone() }, cZ: { value: zenith.clone() } },
    vertexShader: "varying vec3 vDir; void main() { vDir = normalize(position); vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p.xyww; }",
    fragmentShader: `uniform vec3 sunDir; uniform vec3 cH; uniform vec3 cZ; varying vec3 vDir;
      void main() {
        float h = clamp(vDir.y, -0.1, 1.0);
        vec3 c = mix(cH, cZ, pow(max(h, 0.0), 0.55));
        float s = max(dot(normalize(vDir), sunDir), 0.0);
        c += vec3(1.0, 0.92, 0.75) * (pow(s, 600.0) * 2.5 + pow(s, 40.0) * 0.18 + pow(s, 6.0) * 0.08);
        gl_FragColor = vec4(c, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const m = new T.Mesh(new T.SphereGeometry(280, 32, 16), mat);
  m.frustumCulled = false; m.renderOrder = -1;
  m.onBeforeRender = (r, s, cam) => m.position.copy(cam.position);
  return m;
}

// ---- impostors -------------------------------------------------------------------------------------------------------------
/** Render a tree (a Group of meshes, standing on y = 0, `h` tall and `w` wide) to a texture from the side, lit as the scene. */
export function impostor(T, renderer, tree, w, h, lights) {
  const W = 128, H = Math.round((128 * h) / w / 2) * 2;
  const rt = new T.WebGLRenderTarget(W, Math.min(512, H), { samples: 4 });   // linear: drawn again through the scene's output
  const sc = new T.Scene(); sc.add(tree); for (const l of lights) sc.add(l);
  const cam = new T.OrthographicCamera(-w / 2, w / 2, h, 0, -50, 50); cam.position.set(0, 0, 10); cam.lookAt(0, 0, 0);
  const prev = { rt: renderer.getRenderTarget(), alpha: renderer.getClearAlpha(), color: renderer.getClearColor(new T.Color()), sh: renderer.shadowMap.enabled };
  renderer.setRenderTarget(rt); renderer.setClearColor(0x000000, 0); renderer.shadowMap.enabled = false; renderer.clear(); renderer.render(sc, cam);
  renderer.setRenderTarget(prev.rt); renderer.setClearColor(prev.color, prev.alpha); renderer.shadowMap.enabled = prev.sh;
  return rt.texture;
}
