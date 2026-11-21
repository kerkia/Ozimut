// The live tracking's map (pages/track.js): a base map of Web Mercator tiles (onlinemaps.js: OpenStreetMap everywhere, IGN's
// plan in France), never an orienteering map (docs/track/design.md), with each followed runner's track and dot. Drag or one
// finger to move, the wheel or two fingers to zoom. Tiles are fetched by the reader's browser from each service.

import { ONLINE, tileUrl, tileOf, latLonOfTile } from "./onlinemaps.js";

const TILE = 256;

export function mount(host, { layer = "osm", onMove = null } = {}) {
  host.classList.add("tm");
  host.innerHTML = `<canvas class="tm-c"></canvas><div class="tm-credit"></div>
    <div class="tm-zoom"><button type="button" class="tm-in" aria-label="+">+</button><button type="button" class="tm-out" aria-label="−">−</button></div>`;
  const cv = host.querySelector("canvas"), g = cv.getContext("2d"), credit = host.querySelector(".tm-credit");
  const tiles = new Map();
  let L = ONLINE[layer] || ONLINE.osm;
  let z = 14, cx = 0, cy = 0;               // centre in tile units at zoom z
  let runners = [], dirty = true, frame = 0, follow = true;
  const dpr = () => Math.min(2, window.devicePixelRatio || 1);
  credit.textContent = L.credit;

  function setLayer(k) { if (ONLINE[k]) { L = ONLINE[k]; tiles.clear(); credit.textContent = L.credit; draw(); } }
  function size() {
    const r = host.getBoundingClientRect(), d = dpr();
    if (cv.width !== Math.round(r.width * d) || cv.height !== Math.round(r.height * d)) { cv.width = Math.round(r.width * d); cv.height = Math.round(r.height * d); }
    return { w: r.width, h: r.height, d };
  }
  const toPx = (lat, lon, w, h) => { const [x, y] = tileOf(lat, lon, z); return [(x - cx) * TILE + w / 2, (y - cy) * TILE + h / 2]; };
  function tile(zz, x, y) {
    const n = 2 ** zz, k = `${zz}/${x}/${y}`;
    if (y < 0 || y >= n) return null;
    let t = tiles.get(k);
    if (!t) {
      t = new Image();
      t.onload = () => draw();
      t.src = tileUrl(L, zz, ((x % n) + n) % n, y);
      tiles.set(k, t);
      if (tiles.size > 400) tiles.delete(tiles.keys().next().value);
    }
    return t.complete && t.naturalWidth ? t : null;
  }
  function draw() { dirty = true; if (!frame) frame = requestAnimationFrame(paint); }
  function paint() {
    frame = 0;
    if (!dirty) return;
    dirty = false;
    const { w, h, d } = size();
    g.setTransform(d, 0, 0, d, 0, 0);
    g.fillStyle = "#e8e6df"; g.fillRect(0, 0, w, h);
    const zi = Math.min(L.max || 19, Math.max(0, Math.round(z))), s = 2 ** (z - zi) * TILE;
    const cxi = cx / 2 ** (z - zi), cyi = cy / 2 ** (z - zi);
    const x0 = Math.floor(cxi - w / 2 / s), x1 = Math.floor(cxi + w / 2 / s), y0 = Math.floor(cyi - h / 2 / s), y1 = Math.floor(cyi + h / 2 / s);
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) {
      const t = tile(zi, x, y);
      if (t) g.drawImage(t, (x - cxi) * s + w / 2, (y - cyi) * s + h / 2, s + 0.5, s + 0.5);
    }
    for (const r of runners) {
      if (!r.pts?.length) continue;
      g.lineJoin = "round"; g.lineCap = "round";
      g.beginPath();
      r.pts.forEach((p, i) => { const [x, y] = toPx(p[0], p[1], w, h); if (i) g.lineTo(x, y); else g.moveTo(x, y); });
      g.strokeStyle = "rgba(255,255,255,.85)"; g.lineWidth = 6; g.stroke();
      g.strokeStyle = r.colour || "#d4561a"; g.lineWidth = 3; g.stroke();
      const at = r.at || r.pts[r.pts.length - 1];
      const [x, y] = toPx(at[0], at[1], w, h);
      if (r.acc) {                       // the fix's accuracy, metres → pixels
        const mpp = 156543.03392 * Math.cos((at[0] * Math.PI) / 180) / 2 ** z;
        g.beginPath(); g.arc(x, y, r.acc / mpp, 0, 2 * Math.PI); g.fillStyle = "rgba(30,110,220,.12)"; g.fill();
      }
      g.beginPath(); g.arc(x, y, 8, 0, 2 * Math.PI);
      g.fillStyle = r.help ? "#d01c1c" : r.colour || "#d4561a"; g.fill();
      g.lineWidth = 2.5; g.strokeStyle = "#fff"; g.stroke();
      if (r.label) {
        g.font = "600 13px system-ui, sans-serif";
        const tw = g.measureText(r.label).width;
        g.fillStyle = "rgba(255,255,255,.9)"; g.fillRect(x + 11, y - 22, tw + 8, 18);
        g.fillStyle = "#1b2430"; g.fillText(r.label, x + 15, y - 9);
      }
    }
  }
  function centreOn(lat, lon, zz = z) { z = zz; [cx, cy] = tileOf(lat, lon, z); draw(); }
  function fit(points, maxZ = 17) {
    if (!points.length) return;
    let a = 90, b = -90, c = 180, e = -180;
    for (const [la, lo] of points) { a = Math.min(a, la); b = Math.max(b, la); c = Math.min(c, lo); e = Math.max(e, lo); }
    const { w, h } = size();
    let zz = maxZ;
    for (; zz > 2; zz--) {
      const [x0, y0] = tileOf(b, c, zz), [x1, y1] = tileOf(a, e, zz);
      if ((x1 - x0) * TILE < w - 60 && (y1 - y0) * TILE < h - 60) break;
    }
    centreOn((a + b) / 2, (c + e) / 2, zz);
  }
  function zoomAt(f, px, py) {
    const { w, h } = size();
    const nz = Math.max(3, Math.min((L.max || 19) + 1, z + f));
    const k = 2 ** (nz - z);
    const mx = cx + (px - w / 2) / TILE, my = cy + (py - h / 2) / TILE;
    cx = mx * k - (px - w / 2) / TILE; cy = my * k - (py - h / 2) / TILE; z = nz;
    draw();
  }
  // moving and zooming by hand: the view stops following the runner
  const pts = new Map();
  let pinch = 0;
  cv.addEventListener("pointerdown", (e) => { cv.setPointerCapture(e.pointerId); pts.set(e.pointerId, [e.clientX, e.clientY]); });
  cv.addEventListener("pointermove", (e) => {
    const p = pts.get(e.pointerId);
    if (!p) return;
    if (pts.size === 2) {
      const [a, b] = [...pts.values()];
      const d0 = Math.hypot(a[0] - b[0], a[1] - b[1]);
      pts.set(e.pointerId, [e.clientX, e.clientY]);
      const [c, d] = [...pts.values()];
      const d1 = Math.hypot(c[0] - d[0], c[1] - d[1]);
      const r = cv.getBoundingClientRect();
      if (d0 > 0) { pinch += Math.log2(d1 / d0); if (Math.abs(pinch) > 0.02) { zoomAt(pinch, (c[0] + d[0]) / 2 - r.left, (c[1] + d[1]) / 2 - r.top); pinch = 0; } }
    } else {
      cx -= (e.clientX - p[0]) / TILE; cy -= (e.clientY - p[1]) / TILE;
      pts.set(e.pointerId, [e.clientX, e.clientY]);
      draw();
    }
    if (follow) { follow = false; onMove?.(false); }
  });
  const up = (e) => pts.delete(e.pointerId);
  cv.addEventListener("pointerup", up); cv.addEventListener("pointercancel", up);
  cv.addEventListener("wheel", (e) => {
    e.preventDefault();
    const r = cv.getBoundingClientRect();
    zoomAt(e.deltaY < 0 ? 0.5 : -0.5, e.clientX - r.left, e.clientY - r.top);
  }, { passive: false });
  host.querySelector(".tm-in").addEventListener("click", () => { const { w, h } = size(); zoomAt(1, w / 2, h / 2); });
  host.querySelector(".tm-out").addEventListener("click", () => { const { w, h } = size(); zoomAt(-1, w / 2, h / 2); });
  const ro = new ResizeObserver(draw);
  ro.observe(host);

  return {
    setRunners(list) {
      runners = list;
      if (follow) {
        const at = list.map((r) => r.at || r.pts?.[r.pts.length - 1]).filter(Boolean);
        if (at.length === 1) { [cx, cy] = tileOf(at[0][0], at[0][1], z); }
        else if (at.length > 1) fit(at);
      }
      draw();
    },
    fit, centreOn, setLayer,
    follow(on) { follow = on; if (on) this.setRunners(runners); },
    following: () => follow,
    destroy() { ro.disconnect(); cancelAnimationFrame(frame); host.innerHTML = ""; },
  };
}

/** The base layer for a place: IGN's plan in France, OpenStreetMap elsewhere. */
export const layerFor = (lat, lon) => (lat > 41.2 && lat < 51.2 && lon > -5.3 && lon < 9.7 ? "plan" : "osm");
export { latLonOfTile };
