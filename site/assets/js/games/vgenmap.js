// An invented world's orienteering map as an OCAD 2018 file (games/vgen.js's objects, ISOM 2017-2 at 1:10 000; an invented town's,
// games/vtowngen.js, ISSprOM 2019-2 at 1:4000), written with
// Cartographier's own writer, as tools/virtually/mkocd.mjs writes a town's map: the game draws it as any OCAD race's map, and
// the offline races keep it as their map.ocd. The world's metres (x right, z down) become map mm from the frame's top left:
// x / k, (H − z) / k, k = scale / 1000 m a mm (race.json's mm0 = [0, H / k]).

import { writeOcadDoc } from "../mapper/ocadout.js";
import { scaled } from "../mapper/symscale.js";

const sets = {};
const setOf = (name) => (sets[name] ||= fetch(new URL(`../mapper/sets/${name}.json`, import.meta.url)).then((r) => {
  if (!r.ok) throw new Error(`${name}.json: ${r.status}`); return r.json(); }).catch((e) => { delete sets[name]; throw e; }));
/** The ISOM 2017-2 symbol set (Cartographier's), fetched once in the browser. */
export const isomSet = () => setOf("isom2017-2");
/** The ISSprOM 2019-2 symbol set (Cartographier's, at 1:4000), fetched once. */
export const isprSet = () => setOf("issprom2019-2");

// OCAD's coordinate pair: hundredths of a mm shifted by 8 bits, the low byte the flags (y 2: the first point of a hole)
const ocad = (xmm, ymm, fy = 0) => ({ x: Math.round(xmm * 100) << 8, y: (Math.round(ymm * 100) << 8) | fy });

/** The OCAD file's bytes (Uint8Array) of a world from games/vgen.js. set: the ISOM set (isomSet()); title: the map's name. */
export function mapBytes(world, set, { scale = 10000, title = "", setId = "isom2017-2" } = {}) {
  const k = scale / 1000, H = world.H;
  const mm = ([x, z], fy = 0) => ocad(x / k, (H - z) / k, fy);
  const symbols = scaled(set, scale).map((s) => ({ ...s, set: setId }));
  const have = new Set(symbols.map((s) => s.sym));
  const objects = [];
  let id = 1;
  for (const o of world.objects) {
    if (!have.has(o.sym)) continue;
    let coords;
    if (o.otp === 3) {
      coords = [];
      o.rings.forEach((r, i) => { const pts = r[0][0] === r[r.length - 1][0] && r[0][1] === r[r.length - 1][1] ? r.slice(0, -1) : r; pts.forEach((p, j) => coords.push(mm(p, i && !j ? 2 : 0))); });
      if (coords.length < 3) continue;
    } else {
      coords = o.pts.map((p) => mm(p));
      if (o.otp === 2 && coords.length < 2) continue;
    }
    objects.push({ sym: o.sym, otp: o.otp, ang: o.ang || 0, coords, e: { objType: o.otp, status: 1, viewType: 0 }, id: id++, dirty: true });
  }
  const doc = { format: "ozmap", version: 1, title, ocad: null, scale, printScale: scale, printArea: null, realWorld: null, declination: 0,
    standard: set.standard || "ISOM2017-2", colors: JSON.parse(JSON.stringify(set.colors)), symbols, objects, params: [],
    parts: [{ id: "p1", name: "", hidden: false, locked: false }], backgrounds: [], layoutImages: [], dirty: {} };
  return writeOcadDoc(doc, null, { version: 2018 });
}
