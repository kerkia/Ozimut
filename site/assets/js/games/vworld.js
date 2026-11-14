// « Virtually »'s 3D world (games/virtually.js): a race package (functions/api/virtual: heights, ground classes, vegetation
// densities, the ground's colours, the LiDAR's trees, rocks, walls and features, made offline from the OCAD map, the worldwide
// relief and a national LiDAR where there is one) turned into a forest streamed around the runner, 64 m a chunk.
// World frame: the map's paper frame in metres, x to the map's right, z to its bottom; the map's north is -z.

const CH = 64;                     // chunk size (m)
const NEAR = 250;                  // chunks within this distance of the runner are built
const FAR = NEAR + 2 * CH;         // and dropped beyond this one

import { rng, textures, cardCrown, cardConifer, cardUmbrella, crossed, sway, sky, impostor, loadPhotos, photoTextures, PHOTO_GAIN, bakeAO } from "./vforest.js";

/** A PNG's pixels, exact (no colour management). */
async function pixels(blob) {
  const bm = await createImageBitmap(blob, { colorSpaceConversion: "none", premultiplyAlpha: "none" });
  const c = document.createElement("canvas"); c.width = bm.width; c.height = bm.height;
  const g = c.getContext("2d", { willReadFrequently: true }); g.drawImage(bm, 0, 0);
  return { w: bm.width, h: bm.height, d: g.getImageData(0, 0, bm.width, bm.height).data };
}

/** The race package's files: { race, h, cls, veg, groundImg, feats, trees, ocd }. onFile(name) as each arrives. */
// a rock lower than this (m) is climbed over, not walked round (owner, 2026-11-12)
const STEP_OVER = 1.2;
// a tree no longer stops the runner (owner, 2026-11-14: « les arbres doivent être traversables, mais plus lentement pour inciter à
// contourner »): within its trunk and the body's width the runner goes at this share of their speed
const TREE_SLOW = 0.3;

export async function loadRace(base, onFile = () => {}) {
  const get = async (f, kind) => {
    const r = await fetch(base + f, { credentials: "same-origin" });
    if (!r.ok) throw Object.assign(new Error(`${f}: ${r.status}`), { status: r.status });
    const v = kind === "json" ? await r.json() : kind === "buf" ? await r.arrayBuffer() : await r.blob();
    onFile(f);
    return v;
  };
  const raceP = get("race.json", "json");
  // the photo textures of the race's set (its biome's « textures »), beside the package
  const photos = raceP.then((r) => loadPhotos(r.biome?.textures)).catch(() => ({}));
  const race = await raceP;
  // the player's map: the club's OCAD file, or (a race from the LiDAR alone, tools/virtually/lidarrace.py) the generated map's image
  const webp = race.map === "webp";
  const [hb, cb, vb, gb, feats, trees, ocd] = await Promise.all([get("h.png"), get("cls.png"), get("veg.png"), get("ground.jpg"),
    get("feats.json", "json"), race.lidarTrees ? get("trees.bin", "buf") : null, webp ? get("map.webp") : get("map.ocd", "buf")]);
  const [hp, cp, vp] = await Promise.all([pixels(hb), pixels(cb), pixels(vb)]);
  const W = race.W, H = race.H, n = W * H, h = new Float32Array(n), cls = new Uint8Array(n), veg = new Uint8Array(n * 3);
  for (let i = 0; i < n; i++) {
    h[i] = race.base + (hp.d[i * 4] * 256 + hp.d[i * 4 + 1]) / 100;
    cls[i] = cp.d[i * 4];
    veg[i * 3] = vp.d[i * 4]; veg[i * 3 + 1] = vp.d[i * 4 + 1]; veg[i * 3 + 2] = vp.d[i * 4 + 2];
  }
  const groundImg = await createImageBitmap(gb);
  // a sprint race's town (games/vtown.js: buildings, walls, street furniture), when the package has one
  let town = null;
  if (race.town) { const V = await import("./vtown.js"); town = { ...(await V.loadTown(base, race.town, onFile)), Town: V.Town }; }
  return { race, W, H, h, cls, veg, groundImg, feats, trees: trees ? new DataView(trees) : null, photos: await photos,
    ocd: webp ? null : new Uint8Array(ocd), mapImage: webp ? await createImageBitmap(ocd) : null, town };
}

const DETAIL = 95;                 // m: chunks nearer than this draw the trees whole, the others as impostors
const LOW_R = 85;                  // m: the low vegetation (grass, ferns) only nearer than this
const SHADOW_R = 80;               // m: and only those cast shadows (the shadow's box is 100 m)

export class World {
  constructor(THREE, data, scene, renderer) {
    this.T = THREE; this.d = data; this.scene = scene;
    const { race, W, H } = data;
    this.W = W; this.H = H; this.race = race;
    this.speedOf = Float32Array.from(race.speed);
    this.C = Object.fromEntries(race.classes.map((n, i) => [n, i]));
    // the ways no tree, bush or log stands on (owner, 2026-11-14: « interdis les arbres sur les chemins »)
    // (a town's street trees stand on its paved ground: there only the footpaths and tracks)
    this.pathCls = new Set((race.town ? ["path", "small_path", "track"] : ["path", "small_path", "track", "road", "paved", "stairs"])
      .map((n) => this.C[n]).filter((v) => v != null));
    const B = race.biome || {};
    this.B = B;
    // the relief exaggerated for the eye (owner, 2026-11-14: « le 3D est bcp trop plat, le dénivelé très insuffisamment visible »):
    // the ground's heights × VX about the race's base — 1.5 in a forest, the biome's or the race's « relief » if it says, none
    // in a town (buildings, stairs and kerbs stand on the true ground); the trees, rocks and the runner keep their sizes, the
    // runner's speed reads the true grade (virtually.js divides by VX), the map and the times are unchanged
    const sprint = !!race.town || /ISSprOM/i.test(race.std || "") || (race.scale && race.scale <= 5000);
    this.VX = sprint ? 1 : Math.max(1, Math.min(2, B.relief ?? race.relief ?? 1.5));
    const base = race.base || 0;
    this.h = this.VX === 1 ? data.h : data.h.map((v) => base + (v - base) * this.VX);
    const col = (c) => new THREE.Color(c);
    this.leaf = (B.leaf || ["#5d7d3a"]).map(col); this.pine = (B.coniferLeaf || ["#33532d"]).map(col);
    this.bushC = (B.bush || ["#4f6a33"]).map(col); this.lowC = (B.low || ["#7a7a48"]).map(col); this.rockC = (B.rock || ["#9a968e"]).map(col);
    this.trunk = col(B.trunk || "#6e665c"); this.trunk2 = col(B.trunk2 || B.trunk || "#6e665c");
    this.trunkP = B.trunkPine ? col(B.trunkPine) : null;        // the conifers' own (a Scots pine's reddish bark), else trunk2
    this.chunks = new Map();
    this.queue = [];
    this.trunks = new Map();                       // 8 m cell -> [[x, z, r]]
    this.wind = { value: 0 };
    this.t0 = performance.now();
    this.atmosphere(renderer);
    this.makeMaterials(renderer);
    this.bucketFeatures();
    this.town = data.town ? new data.town.Town(THREE, this, data.town) : null;
  }

  /** The sky, the haze and the lights (the scene's own, set by virtually.js, tuned here). */
  atmosphere(renderer) {
    const T = this.T, B = this.B, scene = this.scene;
    const sunDir = new T.Vector3(...(B.sun || [-0.5, 0.6, 0.6])).normalize();
    const haze = new T.Color(B.fog || "#c9d3d6"), zenith = new T.Color(B.zenith || "#6f98c4");
    scene.background = haze;
    scene.fog = new T.FogExp2(haze, B.fogDensity || 0.0075);
    this.skyMesh = sky(T, sunDir, haze, zenith); scene.add(this.skyMesh);
    renderer.toneMappingExposure = B.exposure || 1.0;
    scene.traverse((o) => {
      if (o.isHemisphereLight) { o.color.set(B.skyLight || "#dfe8f2"); o.groundColor.set(B.groundLight || "#5a4c36"); o.intensity = 1.55; }
      if (o.isDirectionalLight) { o.color.set(B.sunLight || "#fff1dc"); o.intensity = 1.9; o.shadow.radius = 4.5; o.shadow.bias = -0.0005; }
    });
    this.sunDir = sunDir;
  }

  // ---- the ground's values ---------------------------------------------------------------------------------------------------
  hRaw(i, j) { const { W, H } = this; i = i < 0 ? 0 : i >= H ? H - 1 : i; j = j < 0 ? 0 : j >= W ? W - 1 : j; return this.h[i * W + j]; }
  heightAt(x, z) {
    const fx = x - 0.5, fz = z - 0.5, j = Math.floor(fx), i = Math.floor(fz), a = fx - j, b = fz - i;
    return this.hRaw(i, j) * (1 - a) * (1 - b) + this.hRaw(i, j + 1) * a * (1 - b) + this.hRaw(i + 1, j) * (1 - a) * b + this.hRaw(i + 1, j + 1) * a * b;
  }
  classAt(x, z) {
    const j = Math.floor(x), i = Math.floor(z);
    if (i < 0 || j < 0 || i >= this.H || j >= this.W) return this.C.outside;
    return this.d.cls[i * this.W + j];
  }
  /** Is (x, z), or a point d metres from it along the axes, on a path, track or road? */
  onPath(x, z, d = 1) {
    const P = this.pathCls;
    return P.has(this.classAt(x, z)) || P.has(this.classAt(x + d, z)) || P.has(this.classAt(x - d, z)) || P.has(this.classAt(x, z + d)) || P.has(this.classAt(x, z - d));
  }
  /** The terrain's speed factor (0: impassable). */
  terrainSpeed(x, z) { return this.speedOf[this.classAt(x, z)] || 0; }
  className(x, z) { return this.race.classes[this.classAt(x, z)]; }
  /** Is a body of radius r at (x, z) against a trunk or a rock too tall to step over? */
  hits(x, z, r = 0.3) {
    if (this.town?.hits(x, z, r)) return true;
    const ci = Math.floor(x / 8), cj = Math.floor(z / 8);
    for (let a = ci - 1; a <= ci + 1; a++) for (let b = cj - 1; b <= cj + 1; b++) {
      const list = this.trunks.get(`${a},${b}`);
      if (list) for (const [tx, tz, tr, low] of list) if (!low && (tx - x) ** 2 + (tz - z) ** 2 < (tr + r) ** 2) return true;
    }
    return false;
  }
  /** Over a rock low enough to step over (owner, 2026-11-12: « blocked by very little rocks »): the speed's factor there, else 1. */
  rough(x, z) {
    const ci = Math.floor(x / 8), cj = Math.floor(z / 8);
    let f = 1;
    for (let a = ci - 1; a <= ci + 1; a++) for (let b = cj - 1; b <= cj + 1; b++) {
      const list = this.trunks.get(`${a},${b}`);
      if (list) for (const [tx, tz, tr, low] of list) if (low && (tx - x) ** 2 + (tz - z) ** 2 < tr * tr) f = Math.min(f, low);
    }
    return f;
  }

  // ---- materials and shapes -----------------------------------------------------------------------------------------------
  makeMaterials(renderer) {
    const T = this.T, { W, H } = this, X = textures(T, renderer), P = photoTextures(T, renderer, this.d.photos);
    this.X = X; this.P = P;
    const G = PHOTO_GAIN, gain = (k) => new T.Color(k, k, k);
    const tex = new T.Texture(this.d.groundImg); tex.colorSpace = T.SRGBColorSpace; tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
    tex.needsUpdate = true;
    // the ground: the package's colours with a photographed floor's grain (forest litter, or gravel on paths and stony ground,
    // `gm` per vertex: x the gravel's share, y the grain's strength), a broad variation over tens of metres, its relief as a
    // normal map; the canopy's shade and the hollows' occlusion in the vertices' colours
    const litter = P["ground-litter"] || X.litter, gravel = P["ground-gravel"] || litter, photo = !!P["ground-litter"];
    const nrm = P["ground-litter-n"] || X.litterN; nrm.repeat.set(W / 2.6, H / 2.6);
    this.groundMat = new T.MeshLambertMaterial({ map: tex, normalMap: nrm, normalScale: new T.Vector2(1.1, 1.1), vertexColors: true });
    const pathMask = this.pathMask();
    this.groundMat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, { litter: { value: litter }, gravel: { value: gravel }, rep: { value: new T.Vector2(W / 2.6, H / 2.6) }, gainD: { value: photo ? G : 1 }, pathMask: { value: pathMask } });
      sh.vertexShader = "attribute vec2 gm; varying vec2 vGm;\n" + sh.vertexShader.replace("#include <begin_vertex>", "#include <begin_vertex>\n vGm = gm;");
      sh.fragmentShader = "uniform sampler2D litter, gravel, pathMask; uniform vec2 rep; uniform float gainD; varying vec2 vGm;\n" + sh.fragmentShader.replace("#include <map_fragment>",
        `#include <map_fragment>
         vec2 q = vMapUv * rep;
         vec3 dL = texture2D(litter, q).rgb, dG = texture2D(gravel, q * 0.83 + 0.17).rgb;
         vec3 d = mix(dL, dG, vGm.x) * gainD;
         float m = texture2D(litter, q * 0.031 + 0.31).g * gainD, m2 = texture2D(gravel, q * 0.0071 + 0.6).g * gainD;
         vec2 pm = texture2D(pathMask, vMapUv).rg;
         float pk = pm.r * pm.g, pe = clamp(pm.r * (1.0 - pm.r) * 4.0, 0.0, 1.0) * pm.g;
         // a path over open land: a trodden band, smoother, paler and greyer, its edges worn darker (pathMask)
         vec3 grain = mix(mix(vec3(1.0), d, vGm.y), vec3(1.0), 0.6 * pk);
         diffuseColor.rgb *= grain * (0.82 + 0.18 * m) * (0.86 + 0.14 * m2);
         float lum = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));
         diffuseColor.rgb = mix(diffuseColor.rgb, vec3(lum) * vec3(1.04, 1.0, 0.94), 0.45 * pk) * (1.0 + 0.16 * pk) * (1.0 - 0.3 * pe);`);
    };
    const lam = (o = {}) => new T.MeshLambertMaterial({ color: 0xffffff, ...o });
    // leaves: the photographed clusters (grey, tinted by each tree's colour), else the drawn ones; the crowns' baked occlusion
    const leafA = P["leaves-a"] || X.leaf[0], leafB = P["leaves-b"] || X.leaf[1], leafGain = P["leaves-a"] ? 1.5 : 1.15;
    const leafT = P["leaves-tree"] || leafB;           // a set's own tree leaves (oaks) on half the crowns; the bushes keep theirs
    const leafMat = (map, g = leafGain) => sway(lam({ map, color: gain(g), vertexColors: true, alphaTest: 0.42, alphaToCoverage: true }), this.wind, 0.035, -0.3);
    const euc = this.B.crown === "eucalypt";
    // the crowns' shapes: round, tall and narrow, wide and flat, in lobes (old, irregular)
    const crowns = euc ? [cardCrown(T, 21, 16, 0.7), cardCrown(T, 33, 14, 0.6, { wide: 1.1, lobes: 3 }), cardCrown(T, 57, 15, 0.65, { lobes: 4 }), cardCrown(T, 88, 12, 0.55, { wide: 1.2 })]
      : [cardCrown(T, 3, 24, 1), cardCrown(T, 41, 20, 0.9, { lobes: 3 }), cardCrown(T, 19, 22, 1.35, { wide: 0.78 }), cardCrown(T, 64, 22, 0.75, { wide: 1.15, lobes: 4 })];
    const rock = (seed) => {
      const g = new T.IcosahedronGeometry(0.5, 2), p = g.attributes.position, r = rng(seed), off = new Map();
      for (let k = 0; k < p.count; k++) {
        const key = `${p.getX(k).toFixed(3)},${p.getY(k).toFixed(3)},${p.getZ(k).toFixed(3)}`;
        if (!off.has(key)) off.set(key, 0.78 + r() * 0.4 + 0.12 * Math.sin(p.getX(k) * 9 + seed));
        const f = off.get(key); p.setXYZ(k, p.getX(k) * f, Math.max(p.getY(k) * f, -0.25) + 0.25, p.getZ(k) * f);
      }
      g.computeVertexNormals();
      return bakeAO(T, g, (x, y) => 0.55 + 0.45 * Math.min(1, y / 0.38));                 // darker where it meets the ground
    };
    const bark = P.bark || X.bark, barkN = P["bark-n"] || null; bark.repeat.set(P.bark ? 2 : 3, P.bark ? 6 : 10); if (barkN) barkN.repeat.copy(bark.repeat);
    const barkMat = (o = {}) => lam({ map: bark, normalMap: barkN, color: gain(P.bark ? G : 1), vertexColors: true, ...o });
    const stone = P.stone || X.stone, stoneN = P["stone-n"] || null; if (P.stone) { stone.repeat.set(1.5, 1.5); stoneN?.repeat.set(1.5, 1.5); }
    const stoneMat = lam({ map: stone, normalMap: stoneN, color: gain(P.stone ? 1.6 : 1), vertexColors: true });
    // the trunk darker at its foot (the ground's and the undergrowth's shade)
    const trunkGeo = bakeAO(T, new T.CylinderGeometry(0.08, 0.2, 1, 7, 4).translate(0, 0.5, 0), (x, y) => 0.5 + 0.5 * Math.min(1, y / 0.14));
    const logGeo = bakeAO(T, new T.CylinderGeometry(1, 1, 1, 7, 1).rotateZ(Math.PI / 2), (x, y) => 0.62 + 0.38 * (y + 1) / 2);
    // the texture set's cards when it has them (photographed needle pairs, grass blades, heather), else the drawn ones
    const needleMap = P.needles || X.needle, needleGain = P.needles ? 1.3 : 1.15;
    const needle = () => sway(lam({ map: needleMap, vertexColors: true, alphaTest: 0.42, alphaToCoverage: true, color: gain(needleGain) }), this.wind, 0.025, 0.2);
    const card = (map, photo, amount) => sway(lam({ map, alphaTest: 0.45, alphaToCoverage: true, ...(photo ? { color: gain(1.25) } : {}) }), this.wind, amount, 0.2);
    // the conifers' bark: the set's (a pine's plates) on a trunk of their own, else the same as the others'
    const pBark = P["pine-bark"], pBarkN = P["pine-bark-n"] || null; if (pBark) { pBark.repeat.set(2, 5); pBarkN?.repeat.set(2, 5); }
    this.K = {
      trunk: { geo: trunkGeo, mat: barkMat(), shadow: true },
      crown: { geo: crowns[0], mat: leafMat(leafA), shadow: true },
      crown2: { geo: crowns[1], mat: leafMat(leafT), shadow: true },
      crown3: { geo: crowns[2], mat: leafMat(leafA), shadow: true },
      crown4: { geo: crowns[3], mat: leafMat(leafT), shadow: true },
      ...(pBark ? { trunkP: { geo: trunkGeo, mat: lam({ map: pBark, normalMap: pBarkN, color: gain(G), vertexColors: true }), shadow: true } } : {}),
      pine: { geo: cardConifer(T, 9), mat: needle(), shadow: true },
      pine2: { geo: cardUmbrella(T, 27), mat: needle(), shadow: true },                            // a Scots pine's umbrella
      young: { geo: cardConifer(T, 13, { whorls: 7, from: 0.02, shape: "young" }), mat: needle(), shadow: true },
      // the bushes cast no sun shadow (their cards' hard-edged shadows were black blots): a soft shade under them instead
      bush: { geo: cardCrown(T, 77, 10, 0.75), mat: leafMat(leafB), shadow: false },
      low: { geo: crossed(T, 3), mat: card(P.low || X.fern, !!P.low, 0.08), shadow: false },
      grass: { geo: crossed(T, 2), mat: card(P.grass || X.grass, !!P.grass, 0.1), shadow: false },
      log: { geo: logGeo, mat: barkMat(), shadow: true },
      rock0: { geo: rock(7), mat: stoneMat, shadow: true }, rock1: { geo: rock(91), mat: stoneMat, shadow: true }, rock2: { geo: rock(1234), mat: stoneMat, shadow: true },
      box: { geo: new T.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), mat: lam(), shadow: true },
    };
    // the trees far away: each kind rendered once, drawn as two crossed cards facing every way
    const light = () => { const s = new T.DirectionalLight(0xfff1dc, 1.9); s.position.set(-3, 6, 8); return [new T.HemisphereLight(0xdfe8f2, 0x5a4c36, 1.55), s]; };
    const model = (crown, crownMat, leafC, kind) => {
      const g = new T.Group(), h = 20, cr = 3.5;
      const tk = kind !== "leaf" && this.K.trunkP ? this.K.trunkP : this.K.trunk, tcol = kind !== "leaf" && this.trunkP ? this.trunkP : this.trunk2;
      const tm = new T.Mesh(trunkGeo, new T.MeshLambertMaterial({ map: tk.mat.map, color: tcol.clone().multiply(tk.mat.color), vertexColors: true }));
      tm.scale.set(1.3, kind === "pine2" ? h * 0.85 : kind === "pine" ? h * 0.75 : h * 0.66, 1.3); g.add(tm);
      const m = new T.Mesh(crown, new T.MeshLambertMaterial({ map: crownMat.map, alphaTest: 0.42, vertexColors: true, color: leafC.clone().multiply(crownMat.color) }));
      if (kind === "pine") { m.position.y = h * 0.3; m.scale.set(cr * 0.95, h * 0.7, cr * 0.95); }
      else if (kind === "pine2") { m.position.y = h * 0.66; m.scale.set(cr * 1.1, h * 0.34, cr * 1.1); }
      else { m.position.y = h * 0.7; m.scale.set(cr * 1.1, h * 0.3, cr * 1.1); }
      g.add(m); return g;
    };
    const imp = (tex) => new T.MeshBasicMaterial({ map: tex, alphaTest: 0.5, alphaToCoverage: true });
    this.IMP = { w: 8.4, h: 21 };
    const far = (kind, crown, mat, c) => ({ geo: crossed(T, 2), mat: imp(impostor(T, renderer, model(crown, mat, c, kind), this.IMP.w, this.IMP.h, light())), shadow: false });
    this.K.farLeaf = far("leaf", crowns[0], this.K.crown.mat, this.leaf[0]);
    this.K.farPine = far("pine", this.K.pine.geo, this.K.pine.mat, this.pine[0]);
    this.K.farPine2 = far("pine2", this.K.pine2.geo, this.K.pine2.mat, this.pine[0]);
    this.wallMat = new T.MeshLambertMaterial({ color: 0xffffff, vertexColors: true, side: T.DoubleSide });
    this.waterMat = new T.MeshPhongMaterial({ color: 0x3d5d6a, shininess: 90, specular: 0x8899aa, transparent: true, opacity: 0.88 });
  }

  /** Per ground class [the gravel's share, the grain's strength] (the ground shader's `gm`): paths, tracks and stony ground
   *  gravel, roads and paving a faint grain, open land a little gravel in the litter, the forest by its conifers' share. */
  groundKinds() {
    if (this._gm) return this._gm;
    const c = this.B.conifer || 0, out = { forest: [Math.min(0.75, c * 0.8), 1] };
    const set = (names, v) => { for (const n of names) if (this.C[n] != null) out[this.C[n]] = v; };
    set(["path", "small_path", "track", "stony", "bfield", "rock", "cliff", "rockface"], [1, 1]);
    set(["road", "paved", "building", "stairs", "block"], [1, 0.3]);
    set(["open", "open_t", "rough", "rough_t", "cultivated"], [0.3, 0.75]);
    set(["marsh", "marsh_x", "water", "shallow"], [0, 0.6]);
    for (let i = 0; i < this.race.classes.length; i++) if (!out[i]) out[i] = out.forest;
    return (this._gm = out);
  }

  // ---- what the package lists, by chunk ---------------------------------------------------------------------------------------
  bucketFeatures() {
    const by = (x, z) => `${Math.floor(x / CH)},${Math.floor(z / CH)}`;
    this.fb = new Map();
    const put = (k, kind, v) => { let b = this.fb.get(k); if (!b) this.fb.set(k, (b = { rocks: [], walls: [], points: [], trees: [] })); b[kind].push(v); };
    for (const r of this.d.feats.rocks || []) put(by(r[0], r[1]), "rocks", r);
    for (const w of this.d.feats.walls || []) {
      const p = w.pts;
      for (let k = 0; k < p.length - 1; k++) put(by((p[k][0] + p[k + 1][0]) / 2, (p[k][1] + p[k + 1][1]) / 2), "walls", [p[k], p[k + 1], w.kind, w.h]);
    }
    for (const p of this.d.feats.points || []) put(by(p.x, p.z), "points", p);
    const t = this.d.trees;
    if (t) for (let o = 0; o + 6 <= t.byteLength; o += 6) {
      const x = t.getUint16(o, true) / 10, z = t.getUint16(o + 2, true) / 10;
      put(by(x, z), "trees", [x, z, t.getUint8(o + 4) / 4, t.getUint8(o + 5) / 10]);
    }
  }

  // ---- chunks -------------------------------------------------------------------------------------------------------------
  /** Build the chunks around (x, z) and drop the far ones; at most `budget` new chunks a call. Each chunk shows its trees
   *  whole or as impostors, its low vegetation and its shadows by its distance. */
  update(x, z, budget = 2) {
    this.wind.value = (performance.now() - this.t0) / 1000;
    const ci = Math.floor(x / CH), cj = Math.floor(z / CH), r = Math.ceil(NEAR / CH);
    const want = [];
    for (let a = ci - r; a <= ci + r; a++) for (let b = cj - r; b <= cj + r; b++) {
      if (a < 0 || b < 0 || a * CH >= this.W || b * CH >= this.H) continue;
      const d = Math.hypot((a + 0.5) * CH - x, (b + 0.5) * CH - z);
      if (d <= NEAR + CH * 0.71 && !this.chunks.has(`${a},${b}`)) want.push([d, a, b]);
    }
    want.sort((p, q) => p[0] - q[0]);
    // the nearest missing chunk is always built, even on a slow frame, once it is within 140 m (the runner could reach its edge)
    if (!budget && want.length && want[0][0] < 140) budget = 1;
    for (const [, a, b] of want.slice(0, budget)) this.build(a, b);
    for (const [k, c] of this.chunks) {
      // the distance to the chunk's nearest point, not its middle
      const u = c.userData, dx = Math.max(u.x0 - x, 0, x - u.x1), dz = Math.max(u.z0 - z, 0, z - u.z1), d = Math.hypot(dx, dz);
      if (Math.hypot(u.cx - x, u.cz - z) > FAR) { this.drop(k); continue; }
      const near = d < SHADOW_R, detail = d < (u.detail ? DETAIL + 10 : DETAIL), low = d < LOW_R;
      if (u.near !== near) { u.near = near; c.traverse((o) => { if (o.userData.shadow) o.castShadow = near; }); }
      if (u.detail !== detail) { u.detail = detail; for (const o of c.children) { if (o.userData.lod === "near") o.visible = detail; else if (o.userData.lod === "far") o.visible = !detail; } }
      if (u.low !== low) { u.low = low; for (const o of c.children) if (o.userData.lod === "low") o.visible = low; }
    }
    return want.length;
  }
  drop(k) {
    const c = this.chunks.get(k); if (!c) return;
    c.traverse((o) => { if (o.isMesh && o.geometry && !Object.values(this.K).some((K) => K.geo === o.geometry)) o.geometry.dispose(); if (o.isInstancedMesh) o.dispose?.(); });
    this.scene.remove(c); this.chunks.delete(k);
    for (const key of c.userData.cells || []) this.trunks.delete(key);
  }
  build(a, b) {
    const T = this.T, k = `${a},${b}`, x0 = a * CH, z0 = b * CH, x1 = Math.min(x0 + CH, this.W), z1 = Math.min(z0 + CH, this.H);
    const g = new T.Group(); g.userData = { cx: (x0 + x1) / 2, cz: (z0 + z1) / 2, x0, x1, z0, z1, cells: [] };
    const nx = Math.round(x1 - x0) + 1, nz = Math.round(z1 - z0) + 1;
    // vegetation from the densities (the map's, or the LiDAR's undergrowth), trees from the LiDAR when the package has them
    const r = rng((a * 73856093) ^ (b * 19349663) ^ 0x5eed);
    const inst = Object.fromEntries(Object.keys(this.K).map((k) => [k, []]));
    const pick = (arr) => arr[Math.floor(r() * arr.length)];
    const [TK, BK, LK] = this.race.vegK;
    const conifer = this.B.conifer || 0, euc = this.B.crown === "eucalypt";
    // the canopy's shade on the ground (1: open sky), splatted round each tree, a little deeper by its trunk
    const shade = new Float32Array(nx * nz).fill(1);
    const shadeAt = (x, z, rad, s) => {
      const R = Math.ceil(rad);
      for (let i = Math.max(0, Math.floor(z - z0) - R); i <= Math.min(nz - 1, Math.floor(z - z0) + R); i++)
        for (let j = Math.max(0, Math.floor(x - x0) - R); j <= Math.min(nx - 1, Math.floor(x - x0) + R); j++) {
          const d = Math.hypot(x0 + j - x, z0 + i - z) / rad; if (d < 1) shade[i * nx + j] *= 1 - s * (1 - d * d);
        }
    };
    // each tree its own shade of its kind's colour (hue, saturation, lightness a little apart)
    const tint = (c, k = 1) => c.clone().offsetHSL((r() - 0.5) * 0.035 * k, (r() - 0.5) * 0.16 * k, (r() - 0.5) * 0.07 * k);
    const crownKinds = ["crown", "crown2", "crown3", "crown4"];
    const addTree = (x, z, h, cr) => {
      if (this.onPath(x, z, 1.2)) return;                       // the map's ways stay clear (a LiDAR tree there is left out)
      const y = this.heightAt(x, z), rot = r() * 6.283, isPine = r() < conifer;
      const bright = 0.85 + r() * 0.3;
      const tc = tint(isPine && this.trunkP ? this.trunkP : euc && r() < 0.7 ? this.trunk : this.trunk2, 0.6);
      if (isPine) {
        // spruce-like cones, and (tall ones, a third, or the biome's « pineShare » over its « pineMinH ») pines: a bare trunk
        // under a high, rounded crown
        // a young conifer (under the biome's « youngH », 7 m): a soft, rounded sapling down to the ground, lighter green
        const young = h < (this.B.youngH ?? 7);
        const pine = !young && h > (this.B.pineMinH ?? 14) && r() < (this.B.pineShare ?? 0.35), c = tint(pick(this.pine)).multiplyScalar(bright);
        if (young) {
          c.lerp(new T.Color(0x7f9a52), 0.25).multiplyScalar(1.12);
          inst[this.K.trunkP ? "trunkP" : "trunk"].push([x, y - 0.2, z, 0.7, h * 0.5, 0.7, rot, tc]);
          inst.young.push([x, y + h * 0.04, z, cr * 1.25, h * 0.94, cr * 1.25, rot, c]);
        } else {
          inst[this.K.trunkP ? "trunkP" : "trunk"].push([x, y - 0.2, z, 1 + h * 0.012, h * (pine ? 0.9 : 0.75), 1 + h * 0.012, rot, tc]);
          // a Scots pine's umbrella: high on the bare trunk, its width a little irregular
          if (pine) inst.pine2.push([x, y + h * 0.66, z, cr * 1.1 * (0.85 + r() * 0.3), h * 0.34, cr * 1.1 * (0.85 + r() * 0.3), rot, c]);
          else inst.pine.push([x, y + h * 0.3, z, cr * 0.95, h * 0.7, cr * 0.95, rot, c]);
        }
        inst[pine ? "farPine2" : "farPine"].push([x, y - 0.2, z, (cr / 3.5) * this.IMP.w * 0.9, (h / 20) * this.IMP.h, (cr / 3.5) * this.IMP.w * 0.9, rot, c]);
      } else {
        inst.trunk.push([x, y - 0.2, z, 1 + h * 0.014, h * 0.66, 1 + h * 0.014, rot, tc]);
        const leaf = tint(pick(this.leaf)).multiplyScalar(bright);
        if (this.B.leafDry && r() < this.B.leafDry) leaf.lerp(new T.Color(0xa08a5a), 0.45);
        inst[pick(crownKinds)].push([x, y + h * 0.7, z, cr * (euc ? 1.3 : 1.1), h * (euc ? 0.26 : 0.3), cr * (euc ? 1.3 : 1.1), rot, leaf]);
        inst.farLeaf.push([x, y - 0.2, z, (cr / 3.5) * this.IMP.w * (euc ? 1.15 : 1), (h / 20) * this.IMP.h, (cr / 3.5) * this.IMP.w, rot, leaf.clone().multiplyScalar(1.6)]);
      }
      shadeAt(x, z, cr * 1.15, 0.32); shadeAt(x, z, 1.4, 0.25);
      this.trunk_(g, x, z, 0.12 + h * 0.008 + 0.35, TREE_SLOW);     // crossed slowly, never a wall
    };
    const B_ = this.fb.get(k) || { rocks: [], walls: [], points: [], trees: [] };
    for (const [x, z, h, cr] of B_.trees) addTree(x, z, h, cr);
    for (let i = z0; i < z1; i += 2) for (let j = x0; j < x1; j += 2) {
      const q = (i * this.W + j) * 3, td = this.d.veg[q] / TK * 4;
      if (td > 0 && r() < td) { const h = 12 + r() * 12; addTree(j + r() * 2, i + r() * 2, h, Math.min(5.5, 0.9 + 0.13 * h) * (0.8 + r() * 0.4)); }
      // young trees under the old ones
      else if (td > 0 && r() < td * 0.18) { const h = 2.5 + r() * 4; addTree(j + r() * 2, i + r() * 2, h, 0.7 + 0.16 * h); }
      // a fallen log now and then where trees grow
      if (td > 0 && r() < 0.012) {
        const x = j + r() * 2, zz = i + r() * 2, L = 3 + r() * 6, rad = 0.12 + r() * 0.14, ang = r() * 6.283;
        if (this.onPath(x, zz, L * 0.5)) continue;
        inst.log.push([x, this.heightAt(x, zz) + rad * 0.5, zz, L, rad, rad, ang, this.trunk2.clone().multiplyScalar(0.75 + r() * 0.2)]);
        shadeAt(x, zz, L * 0.45, 0.18);
      }
    }
    const open = new Set(["open", "open_t", "rough", "rough_t", "cultivated", "marsh"].map((n) => this.C[n]).filter((v) => v != null));
    for (let i = z0; i < z1; i++) for (let j = x0; j < x1; j++) {
      const q = (i * this.W + j) * 3, bd = this.d.veg[q + 1] / BK, ld = this.d.veg[q + 2] / LK;
      if (bd > 0 && r() < bd) { const x = j + r(), z = i + r(), s = 0.7 + r() * 0.9; if (!this.onPath(x, z, 0.6)) inst.bush.push([x, this.heightAt(x, z) + 0.35, z, s, (0.9 + r() * 1.1) * 0.6, s, r() * 6.28, pick(this.bushC).clone().multiplyScalar(0.85 + r() * 0.3)]); shadeAt(x, z, s * 1.3, 0.22); }
      // stony ground and boulder fields strewn with stones (owner, 2026-11-14: « le terrain quand la carte indique pierrier est très
      // chelou, à peu près la même surface qu'un chemin »): low ones, stepped over, the class's own speed slowing the runner
      const c = this.d.cls[i * this.W + j], stony = c === this.C.stony ? 0.6 : c === this.C.bfield ? 0.75 : 0;
      if (stony && r() < stony) {
        const x = j + r(), z = i + r(), sz = stony > 0.7 ? 0.4 + r() * 0.8 : 0.25 + r() * 0.5;
        inst[pick(["rock0", "rock1", "rock2"])].push([x, this.heightAt(x, z) - sz * 0.15, z, sz, sz * (0.45 + r() * 0.35), sz * (0.7 + r() * 0.5), r() * 6.283, tint(pick(this.rockC), 0.8).multiplyScalar(0.8 + r() * 0.3)]);
        if (sz > 0.6) shadeAt(x, z, sz, 0.25);
      }
      // grass in open ground, ferns and low growth in the forest - none on the map's paths (owner, 2026-11-14: « les chemins dans
      // le jaune sont invisibles »: the tufts hid them)
      const grassy = open.has(c);
      if (this.pathCls.has(c)) continue;
      let n = ld; while (n > 0) { if (r() < n) { const x = j + r(), z = i + r(), s = 0.5 + r() * 0.6;
        (grassy ? inst.grass : inst.low).push([x, this.heightAt(x, z) - 0.05, z, s * (grassy ? 1.1 : 1.4), (0.35 + r() * 0.45) * (grassy ? 1.0 : 1.2), s * 1.4, r() * 6.28, pick(this.lowC).clone().multiplyScalar(0.85 + r() * 0.3)]); } n -= 1; }
    }
    for (const [x, z, s, h, rot, sink, solid] of B_.rocks) {
      let y = Infinity; for (const [dx, dz] of [[0, 0], [s / 2, 0], [-s / 2, 0], [0, s / 2], [0, -s / 2]]) y = Math.min(y, this.heightAt(x + dx, z + dz));
      inst[pick(["rock0", "rock1", "rock2"])].push([x, y - sink, z, s, h * 1.3, s * (0.8 + r() * 0.4), rot, tint(pick(this.rockC), 0.5)]);
      shadeAt(x, z, s * 0.9 + 0.4, 0.4);
      // a rock stops the runner only when it stands taller than a step over it (its top ≈ 0.96 × h less what is sunk: the
      // shape's top is ~0.74 of a unit, drawn × 1.3 h); a lower one is climbed over, slowly — the « solid » flag of build.py
      // took every boulder over 1.1 m across, knee-high ones too
      const top = 0.96 * h - sink;
      if (solid && top >= STEP_OVER) this.trunk_(g, x, z, s * 0.42);
      else if (top >= 0.35) this.trunk_(g, x, z, s * 0.42, top >= 0.7 ? 0.35 : 0.6);
    }
    for (const p of B_.points) {
      const y = this.heightAt(p.x, p.z);
      if (p.k === "bigtree" || p.k === "orchard") addTree(p.x, p.z, p.k === "bigtree" ? 24 : 7, p.k === "bigtree" ? 6 : 2.5);
      else if (p.k === "vegspec") inst.bush.push([p.x, y + 0.4, p.z, 1.2, 0.9, 1.2, 0, this.bushC[0]]);
      else if (p.k === "tower") { inst.box.push([p.x, y, p.z, 1.6, 6, 1.6, 0, new T.Color(0x7a6a58)]); this.trunk_(g, p.x, p.z, 1); }
      else if (p.k === "smallbuilding") { inst.box.push([p.x, y - 0.2, p.z, 4, 3, 4, (p.a || 0) * Math.PI / 180, new T.Color(0x9a8e80)]); this.trunk_(g, p.x, p.z, 2); }
      else if (p.k === "manmade") inst.box.push([p.x, y, p.z, 0.5, 1.2, 0.5, 0, new T.Color(0x8a8278)]);
    }
    // ground
    const pos = new Float32Array(nx * nz * 3), nor = new Float32Array(nx * nz * 3), uv = new Float32Array(nx * nz * 2), colr = new Float32Array(nx * nz * 3), gm = new Float32Array(nx * nz * 2), idx = [];
    const GM = this.groundKinds(), town = this.d.race.town ? 0.3 : 1;
    // the relief's shading baked into the ground (a hillshade, as a map's): the slopes facing the sun lighter, those facing away
    // darker, steep ground a little darker — over 6 m, so that the slopes read through the hemisphere's soft light and the canopy
    const sh = Math.hypot(this.sunDir.x, this.sunDir.z) || 1, SX = this.sunDir.x / sh, SZ = this.sunDir.z / sh, HS = town < 1 ? 0 : 1;
    for (let i = 0; i < nz; i++) for (let j = 0; j < nx; j++) {
      const x = x0 + j, z = z0 + i, q = i * nx + j, y = this.heightAt(x, z);
      pos[q * 3] = x; pos[q * 3 + 1] = y - (this.pathCls.has(this.classAt(x, z)) && !this.d.race.town ? 0.06 : 0); pos[q * 3 + 2] = z;   // a path trodden a little lower
      const ex = this.heightAt(x - 1, z) - this.heightAt(x + 1, z), ez = this.heightAt(x, z - 1) - this.heightAt(x, z + 1), l = Math.hypot(ex, 2, ez);
      nor[q * 3] = ex / l; nor[q * 3 + 1] = 2 / l; nor[q * 3 + 2] = ez / l;
      uv[q * 2] = x / this.W; uv[q * 2 + 1] = z / this.H;      // an ImageBitmap is never flipped: its first row (north) at v = 0
      // a hollow (lower than the ground 3 m around) darker, a crest a little lighter
      const hollow = (this.heightAt(x - 3, z) + this.heightAt(x + 3, z) + this.heightAt(x, z - 3) + this.heightAt(x, z + 3)) / 4 - y;
      const ao = Math.max(0.72, Math.min(1.06, 1 - 0.16 * hollow));
      const gx = (this.heightAt(x + 3, z) - this.heightAt(x - 3, z)) / 6, gz = (this.heightAt(x, z + 3) - this.heightAt(x, z - 3)) / 6;
      const sl = Math.hypot(gx, gz), face = sl > 1e-4 ? -(gx * SX + gz * SZ) / sl * Math.min(1, sl / 0.3) : 0;
      const relief = 1 + HS * (0.45 * face - 0.22 * Math.min(1, sl / 0.8));
      const s = (0.55 + 0.45 * Math.max(shade[q], 0.15)) * ao * relief;
      colr[q * 3] = s; colr[q * 3 + 1] = s * 1.01; colr[q * 3 + 2] = s * 0.98;
      const kd = GM[this.classAt(x, z)] || GM.forest; gm[q * 2] = kd[0]; gm[q * 2 + 1] = kd[1] * town;
    }
    for (let i = 0; i < nz - 1; i++) for (let j = 0; j < nx - 1; j++) { const q = i * nx + j; idx.push(q, q + nx, q + 1, q + 1, q + nx, q + nx + 1); }
    const geo = new T.BufferGeometry();
    geo.setAttribute("position", new T.BufferAttribute(pos, 3)); geo.setAttribute("normal", new T.BufferAttribute(nor, 3)); geo.setAttribute("uv", new T.BufferAttribute(uv, 2));
    geo.setAttribute("color", new T.BufferAttribute(colr, 3)); geo.setAttribute("gm", new T.BufferAttribute(gm, 2)); geo.setIndex(idx);
    const ground = new T.Mesh(geo, this.groundMat); ground.receiveShadow = true; g.add(ground);
    // water: a surface over the open water's cells
    const water = [];
    const wc = new Set([this.C.water, this.C.shallow, this.C.marsh_x].filter((v) => v != null));
    for (let i = z0; i < z1; i++) for (let j = x0; j < x1; j++) if (wc.has(this.d.cls[i * this.W + j])) water.push([j, i]);
    if (water.length) {
      const hs = water.map(([j, i]) => this.h[i * this.W + j]).sort((p, q) => p - q), lvl = hs[Math.floor(hs.length * 0.3)] + 0.12;
      const wp = [], wi = [];
      for (const [j, i] of water) { const v = wp.length / 3; wp.push(j, lvl, i, j + 1, lvl, i, j, lvl, i + 1, j + 1, lvl, i + 1); wi.push(v, v + 2, v + 1, v + 1, v + 2, v + 3); }
      const wg = new T.BufferGeometry(); wg.setAttribute("position", new T.Float32BufferAttribute(wp, 3)); wg.setIndex(wi); wg.computeVertexNormals();
      g.add(new T.Mesh(wg, this.waterMat));
    }
    const LOD = { trunk: "near", trunkP: "near", young: "near", crown: "near", crown2: "near", crown3: "near", crown4: "near", pine: "near", pine2: "near", farLeaf: "far", farPine: "far", farPine2: "far", low: "low", grass: "low", log: "near" };
    const M = new T.Matrix4(), Q = new T.Quaternion(), S = new T.Vector3(), P = new T.Vector3(), UP = new T.Vector3(0, 1, 0);
    for (const [kind, list] of Object.entries(inst)) {
      if (!list.length) continue;
      const K = this.K[kind], im = new T.InstancedMesh(K.geo, K.mat, list.length);
      list.forEach(([x, y, z, sx, sy, sz, rot, c], i) => { Q.setFromAxisAngle(UP, rot); im.setMatrixAt(i, M.compose(P.set(x, y, z), Q, S.set(sx, sy, sz))); im.setColorAt(i, c); });
      im.castShadow = false; im.userData.shadow = K.shadow; im.receiveShadow = kind !== "low" && kind !== "grass" && !kind.startsWith("far"); im.computeBoundingSphere();
      im.frustumCulled = true;
      if (LOD[kind]) { im.userData.lod = LOD[kind]; im.visible = LOD[kind] === "far"; }
      g.add(im);
    }
    g.userData.detail = false; g.userData.low = false;
    // walls, fences, cliffs: vertical strips along the map's lines
    if (B_.walls.length) {
      const wp = [], wcol = [], wi = [];
      const CO = { cliff: [0.62, 0.6, 0.56], rockface: [0.6, 0.58, 0.54], stonewall: [0.55, 0.54, 0.5], fence: [0.45, 0.38, 0.3], bank: [0.42, 0.36, 0.26] };
      for (const [[ax, az], [bx, bz], kind, hh] of B_.walls) {
        if (kind === "powerline" || kind === "bank") continue;
        const ya = this.heightAt(ax, az), yb = this.heightAt(bx, bz), v = wp.length / 3, c = CO[kind] || [0.5, 0.5, 0.5];
        const h = kind === "fence" ? Math.min(hh, 1.4) : hh;
        wp.push(ax, ya - 0.4, az, bx, yb - 0.4, bz, ax, ya + h, az, bx, yb + h, bz);
        for (let q = 0; q < 4; q++) wcol.push(...c);
        wi.push(v, v + 1, v + 2, v + 1, v + 3, v + 2);
      }
      if (wp.length) {
        const wg = new T.BufferGeometry(); wg.setAttribute("position", new T.Float32BufferAttribute(wp, 3)); wg.setAttribute("color", new T.Float32BufferAttribute(wcol, 3));
        wg.setIndex(wi); wg.computeVertexNormals();
        const m = new T.Mesh(wg, this.wallMat); m.receiveShadow = true; m.userData.shadow = true; g.add(m);
      }
    }
    this.town?.buildChunk(g, a, b);
    this.scene.add(g); this.chunks.set(k, g);
  }
  /** A trunk (or a large rock) for the collisions, kept with its chunk. */
  trunk_(g, x, z, r, low = 0) {
    const key = `${Math.floor(x / 8)},${Math.floor(z / 8)}`;
    let l = this.trunks.get(key); if (!l) { this.trunks.set(key, (l = [])); g.userData.cells.push(key); }
    l.push(low ? [x, z, r, low] : [x, z, r]);
  }

  // ---- the paths over open land, for the ground's shader --------------------------------------------------------------------
  /** A W x H texture: R the map's footpaths and tracks, G open land within 3 m (a trodden band shows there; in the forest the
   *  paths already stand out). None in a town. */
  pathMask() {
    const T = this.T, { W, H } = this, n = W * H, out = new Uint8Array(n * 4);
    if (!this.d.race.town) {
      const P = new Set(["path", "small_path", "track"].map((k) => this.C[k]).filter((v) => v != null));
      const O = new Set(["open", "open_t", "rough", "rough_t", "cultivated", "stony", "rock"].map((k) => this.C[k]).filter((v) => v != null));
      const cls = this.d.cls, a = new Uint8Array(n), b = new Uint8Array(n), R = 3;
      for (let i = 0; i < n; i++) a[i] = O.has(cls[i]) ? 1 : 0;
      for (let z = 0; z < H; z++) for (let x = 0; x < W; x++) { let v = 0; for (let k = Math.max(0, x - R); k <= Math.min(W - 1, x + R) && !v; k++) v = a[z * W + k]; b[z * W + x] = v; }
      for (let z = 0; z < H; z++) for (let x = 0; x < W; x++) {
        let v = 0; for (let k = Math.max(0, z - R); k <= Math.min(H - 1, z + R) && !v; k++) v = b[k * W + x];
        const i = z * W + x; out[i * 4] = P.has(cls[i]) ? 255 : 0; out[i * 4 + 1] = v ? 255 : 0;
      }
    }
    const t = new T.DataTexture(out, W, H, T.RGBAFormat);
    t.magFilter = T.LinearFilter; t.minFilter = T.LinearMipmapLinearFilter; t.generateMipmaps = true; t.needsUpdate = true;
    return t;
  }

  // ---- the start's corridor -----------------------------------------------------------------------------------------------
  /** A taped corridor to the start triangle (owner, 2026-11-14: « mets un couloir balisé vers le départ, par exemple 50 m, à moins
   *  de 90° de la direction du premier poste… c'est chelou de toujours regarder vers le nord au début »): ~50 m, its bearing drawn
   *  within ±60° of the start's to the first control by a seed of the course's own (everyone gets the same), on runnable ground -
   *  another bearing, else shorter. Drawn in the 3D only (the map unchanged); the runner starts at its far end facing the
   *  triangle. Returns { x, z, yaw, len } or null. */
  corridor(course) {
    const S = course[0], C1 = course[1];
    if (!S || !C1) return null;
    const base = Math.atan2(C1.x - S.x, -(C1.z - S.z));
    const r = rng((Math.round(S.x * 7 + S.z * 13 + C1.x * 17 + C1.z * 19) ^ 0x51a7) >>> 0);
    // runnable ground, and no rock of the package's features on it (the chunks, and their trunks, are not built yet)
    const rockAt = (x, z) => (this.fb.get(`${Math.floor(x / CH)},${Math.floor(z / CH)}`)?.rocks || []).some((q) => Math.hypot(q[0] - x, q[1] - z) < (q[2] || 1) * 0.62 + 0.4);
    const ok = (x, z) => x > 2 && z > 2 && x < this.W - 2 && z < this.H - 2 && this.terrainSpeed(x, z) > 0 && !this.hits(x, z, 0.5) && !rockAt(x, z);
    for (const len of [50, 40, 30, 20]) for (let k = 0; k < 14; k++) {
      const th = base + (r() * 2 - 1) * (Math.PI / 3), ux = Math.sin(th), uz = -Math.cos(th);
      let fine = true;
      for (let d = 2; d <= len && fine; d += 2) fine = ok(S.x - ux * d, S.z - uz * d) && ok(S.x - ux * d + uz * 1.4, S.z - uz * d - ux * 1.4) && ok(S.x - ux * d - uz * 1.4, S.z - uz * d + ux * 1.4);
      if (!fine) continue;
      this.drawCorridor(S, ux, uz, len);
      return { x: S.x - ux * len, z: S.z - uz * len, yaw: th, len };
    }
    return null;
  }
  /** Orange and white tape on stakes along both sides of the corridor, 1.4 m from its axis, at 0.85 m. */
  drawCorridor(S, ux, uz, len) {
    const T = this.T, c = document.createElement("canvas"); c.width = 64; c.height = 8;
    const g = c.getContext("2d");
    for (let k = 0; k < 4; k++) { g.fillStyle = k % 2 ? "#ffffff" : "#ff6a13"; g.fillRect(k * 16, 0, 16, 8); }
    const tex = new T.CanvasTexture(c); tex.colorSpace = T.SRGBColorSpace; tex.wrapS = T.RepeatWrapping;
    const pos = [], uv = [], idx = [], stakes = [];
    for (const side of [1, -1]) {
      const px = uz * 1.4 * side, pz = -ux * 1.4 * side;
      let prev = null;
      for (let d = 0; d <= len + 0.01; d += 4) {
        const x = S.x - ux * d + px, z = S.z - uz * d + pz, y = this.heightAt(x, z);
        stakes.push([x, y, z]);
        if (prev) {
          const v = pos.length / 3, top = 0.9, w = 0.08;
          for (const [qx, qy, qz, u] of [prev, [x, y, z, d]]) { pos.push(qx, qy + top, qz, qx, qy + top - w, qz); uv.push(u / 2, 1, u / 2, 0); }
          idx.push(v, v + 1, v + 2, v + 1, v + 3, v + 2);
        }
        prev = [x, y, z, d];
      }
    }
    const geo = new T.BufferGeometry();
    geo.setAttribute("position", new T.Float32BufferAttribute(pos, 3)); geo.setAttribute("uv", new T.Float32BufferAttribute(uv, 2)); geo.setIndex(idx);
    const tape = new T.Mesh(geo, new T.MeshBasicMaterial({ map: tex, side: T.DoubleSide }));
    const im = new T.InstancedMesh(new T.CylinderGeometry(0.02, 0.025, 1, 5).translate(0, 0.5, 0), new T.MeshLambertMaterial({ color: 0xcfc6b8 }), stakes.length);
    const M = new T.Matrix4();
    stakes.forEach(([x, y, z], i) => im.setMatrixAt(i, M.makeTranslation(x, y - 0.05, z)));
    this.scene.add(tape, im);
    this.corridorMeshes = [tape, im];
  }

  // ---- the course's flags -----------------------------------------------------------------------------------------------------
  /** A flag the package sets inside a rock (owner, 2026-11-14: « une balise invisible parce qu'elle est dans le rocher ! mets-la
   *  derrière ») stands at its foot, on the far side as one comes from the previous control: c.flagX / c.flagZ, and c.foot the
   *  side (« NE ») for the description's column G (« Pied NE », 11.14). The control's circle and its reach stay at c.x, c.z. */
  footOf(c, prev) {
    const near = [];
    const ci = Math.floor(c.x / CH), cj = Math.floor(c.z / CH);
    for (let a = ci - 1; a <= ci + 1; a++) for (let b = cj - 1; b <= cj + 1; b++) for (const r of this.fb.get(`${a},${b}`)?.rocks || []) near.push(r);
    let rock = null, best = Infinity;
    for (const r of near) {
      const d = Math.hypot(r[0] - c.x, r[1] - c.z), s = r[2] || 1;
      if (d < s * 0.62 + 0.3 && d < best) { best = d; rock = r; }
    }
    if (!rock) return;
    let dx = c.x - (prev?.x ?? c.x - 1), dz = c.z - (prev?.z ?? c.z);
    const L = Math.hypot(dx, dz) || 1; dx /= L; dz /= L;
    const out = (rock[2] || 1) * 0.62 + 0.35;
    c.flagX = rock[0] + dx * out; c.flagZ = rock[1] + dz * out;
    const SECT = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"], b = Math.atan2(dx, -dz);
    c.foot = SECT[((Math.round(b / (Math.PI / 4)) % 8) + 8) % 8];
  }
  /** Flags at the controls, the start's triangle, the finish's banner; flag(i) gives control i's group. */
  addCourse(course) {
    const T = this.T;
    const tex = (() => {
      const c = document.createElement("canvas"); c.width = c.height = 64; const g = c.getContext("2d");
      g.fillStyle = "#fff"; g.fillRect(0, 0, 64, 64); g.fillStyle = "#f26b1d"; g.beginPath(); g.moveTo(64, 0); g.lineTo(64, 64); g.lineTo(0, 64); g.fill();
      const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; return t;
    })();
    const plate = (code) => {
      const c = document.createElement("canvas"); c.width = 64; c.height = 32; const g = c.getContext("2d");
      g.fillStyle = "#fff"; g.fillRect(0, 0, 64, 32); g.fillStyle = "#111"; g.font = "bold 24px Arial"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(code, 32, 17);
      const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; return new T.MeshBasicMaterial({ map: t, side: T.DoubleSide });
    };
    this.flags = [];
    this.startPos = this.corridor(course);
    const ROCKY = new Set(["boulder", "bigboulder", "cluster", "rockface", "cave"]);
    course.forEach((c, i) => { if (ROCKY.has(c.feature)) this.footOf(c, course[i - 1]); });
    for (const c of course) {
      const fx = c.flagX ?? c.x, fz = c.flagZ ?? c.z;
      const g = new T.Group(), y = this.heightAt(fx, fz);
      g.position.set(fx, y, fz);
      if (c.kind === "start") {
        const tri = new T.Mesh(new T.CircleGeometry(0.45, 3), new T.MeshLambertMaterial({ color: 0xb5179e, side: T.DoubleSide }));
        tri.position.y = 1.4; tri.rotation.z = Math.PI / 2;
        const post = new T.Mesh(new T.CylinderGeometry(0.03, 0.03, 1.5, 5), new T.MeshLambertMaterial({ color: 0xdddddd })); post.position.y = 0.75;
        g.add(tri, post);
      } else {
        const mat = new T.MeshLambertMaterial({ map: tex, side: T.DoubleSide, emissive: 0x000000 });
        const prism = new T.Mesh(new T.CylinderGeometry(0.21, 0.21, 0.3, 3, 1, true), mat); prism.position.y = 0.75;
        const stake = new T.Mesh(new T.CylinderGeometry(0.012, 0.012, 1.0, 5), new T.MeshLambertMaterial({ color: 0xdddddd })); stake.position.y = 0.5;
        g.add(prism, stake);
        if (c.kind === "finish") {
          const pole = (dx) => { const p = new T.Mesh(new T.CylinderGeometry(0.04, 0.04, 2.6, 6), new T.MeshLambertMaterial({ color: 0xeeeeee })); p.position.set(dx, 1.3, 0); return p; };
          const ban = new T.Mesh(new T.PlaneGeometry(3, 0.5), new T.MeshLambertMaterial({ map: tex, side: T.DoubleSide })); ban.position.set(0, 2.45, 0);
          g.add(pole(-1.5), pole(1.5), ban);
        } else {
          const pl = new T.Mesh(new T.PlaneGeometry(0.16, 0.08), plate(c.code)); pl.position.set(0, 0.45, 0.02); g.add(pl);
          const pl2 = pl.clone(); pl2.rotation.y = Math.PI; pl2.position.z = -0.02; g.add(pl2);
        }
        // the cue: a light column and a ring, shown near the flag
        const beam = new T.Mesh(new T.CylinderGeometry(0.5, 0.5, 30, 16, 1, true), new T.MeshBasicMaterial({ color: 0xffb066, transparent: true, opacity: 0, depthWrite: false, side: T.DoubleSide }));
        beam.position.y = 15; beam.visible = false;
        const ring = new T.Mesh(new T.RingGeometry(1.6, 2.0, 40), new T.MeshBasicMaterial({ color: 0xff8a2b, transparent: true, opacity: 0, depthWrite: false, side: T.DoubleSide }));
        ring.rotation.x = -Math.PI / 2; ring.position.y = 0.08; ring.visible = false;
        g.add(beam, ring);
        g.userData = { mat, beam, ring };
      }
      g.traverse((o) => { if (o.isMesh && o.material?.map !== undefined) o.castShadow = true; });
      this.scene.add(g); this.flags.push(g);
    }
  }
  /** Control i's cue at strength s (0: none, 1: within reach), t the clock (s) for the pulse. */
  cue(i, s, t) {
    const u = this.flags[i]?.userData; if (!u?.mat) return;
    const pulse = 0.5 + 0.5 * Math.sin(t * 6);
    u.mat.emissive.setRGB(s * (0.55 + 0.45 * pulse), s * (0.25 + 0.2 * pulse), 0);
    u.beam.visible = u.ring.visible = s > 0;
    u.beam.material.opacity = 0.18 * s * (0.6 + 0.4 * pulse);
    u.ring.material.opacity = 0.85 * s;
    u.ring.scale.setScalar(1 + 0.15 * pulse);
  }
}

/** The runner: an articulated figure (hips, thighs, shins, feet; torso, upper arms, forearms, head) whose walk and run cycles
 *  blend with the speed — the cadence rising with it, the knees lifting, the elbows bent when running —, the body bobbing
 *  twice a stride, leaning forward with the speed and into the turns. The group's rotation.y is set by the game (its heading);
 *  userData.animate(speed m/s, dt s) moves the rest. The figure faces its local +z.
 *  `look` is the player's avatar (games/vavatar.js): sex "f" | "m", skin, hair, hairStyle "short" | "ponytail" | "bun", legs
 *  "knee" (forest: shorts down to the knee, socks up to it), "long" (trousers) or "sprint" (short shorts, low socks), and the
 *  colours of shirt, shorts, socks and shoes (a bare number: the shirt's colour, as before). */
export function runnerFigure(T, look = {}) {
  if (typeof look === "number") look = { shirt: look };
  const A = { sex: "m", skin: "#d9a07a", hair: "#3a2a1e", hairStyle: "short", legs: "knee", shirt: "#1f6fd1", shorts: "#1d232c",
    socks: "#1d232c", shoes: "#e0662a", ...look };
  const f = A.sex === "f";
  const g = new T.Group(), body = new T.Group(); g.add(body);
  if (f) body.scale.setScalar(0.95);
  const M = (color) => new T.MeshLambertMaterial({ color: new T.Color(color) });
  const shirt = M(A.shirt), skin = M(A.skin), shorts = M(A.shorts), socks = M(A.socks), shoe = M(A.shoes), sole = M(0xeeeeee), hair = M(A.hair);
  const legs = A.legs === "long" ? "long" : A.legs === "sprint" || A.legs === "shorts" ? "sprint" : "knee";
  // a limb's piece from y0 down to y1 (y1 < y0) in its joint's frame, a capsule of radius r
  const seg = (parent, r, y0, y1, mat, r1 = r) => {
    const L = Math.max(0.01, y0 - y1 - r - r1 * 0.2);
    const m = new T.Mesh(new T.CapsuleGeometry((r + r1) / 2, L, 4, 10).translate(0, (y0 + y1) / 2, 0), mat);
    parent.add(m); return m;
  };
  const joint = (parent, x, y, z = 0) => { const j = new T.Group(); j.position.set(x, y, z); parent.add(j); return j; };
  const hips = joint(body, 0, 0.96);
  hips.add(new T.Mesh(new T.SphereGeometry(0.15, 12, 8).scale(f ? 1.14 : 1.05, 0.75, 0.82), shorts));
  const torso = joint(hips, 0, 0.02);
  torso.add(new T.Mesh(new T.CapsuleGeometry(0.15, 0.3, 4, 12).scale(f ? 0.98 : 1.08, 1, f ? 0.76 : 0.72).translate(0, 0.28, 0), shirt));
  if (f) torso.add(new T.Mesh(new T.SphereGeometry(0.15, 12, 8).scale(0.88, 0.42, 0.62).translate(0, 0.36, 0.045), shirt));
  const neck = joint(torso, 0, 0.55); neck.add(new T.Mesh(new T.CylinderGeometry(0.043, 0.05, 0.08, 8).translate(0, 0.04, 0), skin));
  const head = joint(neck, 0, 0.08);
  head.add(new T.Mesh(new T.SphereGeometry(0.105, 14, 10).scale(0.92, 1.1, 1).translate(0, 0.1, 0), skin));
  head.add(new T.Mesh(new T.SphereGeometry(0.108, 14, 8, 0, Math.PI * 2, 0, Math.PI * (A.hairStyle === "short" && !f ? 0.5 : 0.58))
    .scale(0.95, 1.05, 1.05).translate(0, 0.12, -0.014), hair));
  let tail = null;
  if (A.hairStyle === "ponytail") {
    tail = joint(head, 0, 0.17, -0.1);
    tail.add(new T.Mesh(new T.SphereGeometry(0.03, 8, 6), hair));
    tail.add(new T.Mesh(new T.CapsuleGeometry(0.035, 0.16, 4, 8).scale(1, 1, 0.8).translate(0, -0.1, -0.02), hair));
  } else if (A.hairStyle === "bun") {
    head.add(new T.Mesh(new T.SphereGeometry(0.055, 10, 8).translate(0, 0.19, -0.085), hair));
  }
  const leg = (side) => {
    const hip = joint(hips, side * (f ? 0.1 : 0.095), -0.03);
    if (legs === "long") seg(hip, 0.074, 0.03, -0.45, shorts, 0.062);
    else if (legs === "knee") seg(hip, 0.078, 0.03, -0.43, shorts, 0.066);                    // down to the knee
    else { seg(hip, 0.076, 0.03, -0.16, shorts); seg(hip, 0.066, -0.13, -0.45, skin, 0.058); }
    const knee = joint(hip, 0, -0.45);
    if (legs === "long") { seg(knee, 0.058, 0.02, -0.33, shorts, 0.048); seg(knee, 0.048, -0.31, -0.44, socks, 0.044); }
    else if (legs === "knee") seg(knee, 0.06, 0.05, -0.44, socks, 0.046);                    // socks up to the knee
    else { seg(knee, 0.056, 0.02, -0.33, skin, 0.047); seg(knee, 0.048, -0.31, -0.44, socks, 0.044); }
    const ankle = joint(knee, 0, -0.44);
    ankle.add(new T.Mesh(new T.BoxGeometry(0.09, 0.07, 0.24).translate(0, -0.035, 0.05), shoe));
    ankle.add(new T.Mesh(new T.BoxGeometry(0.095, 0.02, 0.25).translate(0, -0.075, 0.05), sole));
    return { hip, knee, ankle };
  };
  const arm = (side) => {
    const sh = joint(torso, side * (f ? 0.18 : 0.2), 0.47);
    seg(sh, 0.05, 0.03, -0.14, shirt); seg(sh, 0.044, -0.12, -0.28, skin, 0.04); sh.rotation.z = side * 0.06;
    const el = joint(sh, 0, -0.28); seg(el, 0.04, 0.02, -0.25, skin, 0.034);
    el.add(new T.Mesh(new T.SphereGeometry(0.043, 8, 6).translate(0, -0.29, 0), skin));
    return { sh, el };
  };
  const L = leg(1), R = leg(-1), AL = arm(1), AR = arm(-1);
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  let ph = 0, amp = 0, run = 0, lastY = null, roll = 0, t = 0;
  g.userData.animate = (speed, dt) => {
    dt = Math.min(dt, 0.1); t += dt;
    // the blend toward the gait the speed asks for, eased so that a stop or a start is not a jump
    const k = 1 - Math.exp(-dt * 6);
    amp += (Math.min(1, speed / 1.1) - amp) * k;
    run += (smooth(1.7, 2.7, speed) - run) * k;
    // strides a second: ~0.9 walking at 1.4 m/s, ~1.45 running at 3.5 m/s
    const freq = speed < 0.05 ? 0 : (1 - run) * (0.55 + 0.25 * Math.min(speed, 2.2)) + run * Math.min(1.75, 0.95 + 0.15 * speed);
    ph = (ph + dt * freq * Math.PI * 2) % (Math.PI * 8);
    const pose = (Lg, Ar, phi) => {
      const s = Math.sin(phi), c = Math.cos(phi);
      const thighW = -0.42 * s, thighR = -(0.22 + 0.68 * s);
      const kneeW = 0.08 + 0.75 * Math.max(0, Math.cos(phi - 0.35)) ** 2, kneeR = 0.25 + 1.45 * Math.max(0, c) ** 1.4;
      const thigh = (thighW * (1 - run) + thighR * run) * amp, kn = (kneeW * (1 - run) + kneeR * run) * amp + 0.04;
      Lg.hip.rotation.x = thigh; Lg.knee.rotation.x = kn; Lg.ankle.rotation.x = -0.35 * (thigh + kn) + 0.15 * amp * s;
      // the arm swings against its own side's leg
      Ar.sh.rotation.x = (0.3 * (1 - run) + 0.62 * run) * s * amp + 0.05;
      Ar.el.rotation.x = -(0.2 * (1 - run) + (1.35 + 0.18 * s) * run) * Math.max(amp, 0.15) - 0.08;
    };
    pose(L, AL, ph); pose(R, AR, ph + Math.PI);
    // the body: lower and bobbing twice a stride (higher in a run's flight), leaning forward with the speed
    const bob = Math.cos(2 * ph);
    hips.position.y = 0.96 - 0.03 * run * amp + (0.018 * (1 - run) + 0.045 * run) * amp * bob + 0.004 * Math.sin(t * 2.2) * (1 - amp);
    torso.rotation.x = (0.05 + 0.16 * run) * amp; torso.rotation.y = (0.06 + 0.1 * run) * amp * Math.sin(ph);
    hips.rotation.y = -0.06 * amp * Math.sin(ph);
    head.rotation.x = -torso.rotation.x * 0.7; head.rotation.y = -torso.rotation.y * 0.8;
    // the ponytail swings with the stride and lifts with the bob
    if (tail) { tail.rotation.z = 0.35 * amp * Math.sin(ph); tail.rotation.x = 0.15 + 0.3 * run * amp + 0.15 * amp * bob; }
    // into the turns: the heading's rate of change (the game sets it), toward the inside
    if (lastY != null && dt > 0) {
      let dy = g.rotation.y - lastY; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      const target = Math.max(-0.28, Math.min(0.28, -(dy / dt) * 0.09 * Math.min(1, speed / 3)));
      roll += (target - roll) * (1 - Math.exp(-dt * 5));
    }
    lastY = g.rotation.y; body.rotation.z = roll;
  };
  g.userData.animate(0, 0);
  return g;
}
