// The Agenda's map (owner, 2026-10-25: « on a computer, a map of the chosen country, the competition's place shown as soon
// as the mouse is over it in the table, all the more once it is selected»). The country's outline is
// site/assets/geo/<cc>.json (tools/countrymaps.py, Natural Earth): no map service is asked anything. An event is placed by
// its GPS coordinates (`gps`, the organiser's), else by `pos` — its town ([lat, lon]) or, when the town is unknown, its
// département's or region's centre ([lat, lon, 1], drawn hollow) — from GeoNames (countries/agenda.py `add_positions`); a World
// Ranking Event the IOF's calendar alone gives, by a town of its name, else its country's centre (countries/wre.py; « IOF WRE »'s
// own map is the world's, geo/xw.json).
// Every event of the table is a dot; the one under the mouse, and the one selected, in the control flag's orange with its
// place's name. Wheel or buttons to zoom, drag to move; a click on a dot selects its event.

import { html, fmtDate } from "./util.js";
import { t, tn } from "./i18n.js";

const SVG = "http://www.w3.org/2000/svg";
const cache = new Map();
const outline = (cc) => {
  // (« Tous les pays », XA, on IOF WRE's world map)
  if (!cache.has(cc)) cache.set(cc, fetch(`/assets/geo/${cc === "XA" ? "xw" : cc.toLowerCase()}.json`).then((r) => (r.ok ? r.json() : null)).catch(() => null));
  return cache.get(cc);
};

/** An event's position: [lat, lon, approximate?] or null. */
export const where = (e) => (e.gps ? [e.gps[0], e.gps[1], false] : e.pos ? [e.pos[0], e.pos[1], e.pos.length > 2] : null);

/**
 * The map in `el` for country `cc`. Returns { show(events, selected), hover(key), select(key) } — or null when the country
 * has no outline. onPick(key): a dot clicked; onHover(key | null): the mouse over a dot; levels: { dept, region }, the
 * country's units' names (« département », « canton »…) for the legend; area, missing: the legend's keys (« Mes cartes » has
 * its own: maps, not competitions).
 */
export async function mount(el, cc, { onPick, onHover, levels = {}, area = "agd.map.area", missing: missingKey = "agd.map.missing" } = {}) {
  const geo = await outline(cc);
  if (!geo) { el.hidden = true; return null; }
  el.hidden = false;
  const [W, S, E, N] = geo.box;
  const cos = Math.cos(((S + N) / 2) * Math.PI / 180);
  const K = 1000 / Math.max((E - W) * cos, N - S);              // (the frame's longer side 1 000 units)
  const X = (lon) => (lon - W) * cos * K, Y = (lat) => (N - lat) * K;
  const full = { x: 0, y: 0, w: X(E), h: Y(S) };
  const path = (rings) => rings.map((r) => {
    let x = 0, y = 0, d = "";
    for (let i = 0; i < r.length; i += 2) {
      x += r[i]; y += r[i + 1];
      d += `${i ? "L" : "M"}${X(x / geo.q).toFixed(1)} ${Y(y / geo.q).toFixed(1)}`;
    }
    return `${d}Z`;
  }).join("");

  // (owner, 2026-10-30: the map, no frame of its own — its buttons and its legend over it)
  el.innerHTML = html`
    <div class="agm-box"><div class="agm-tools"><button type="button" class="btn btn-sm" data-z="in" title="${t("agd.map.in")}" aria-label="${t("agd.map.in")}">+</button><button type="button" class="btn btn-sm" data-z="out" title="${t("agd.map.out")}" aria-label="${t("agd.map.out")}">−</button><button type="button" class="btn btn-sm" data-z="all" title="${t("agd.map.all")}" aria-label="${t("agd.map.all")}">⤢</button></div>
      <svg class="agm" xmlns="${SVG}" viewBox="0 0 ${full.w} ${full.h}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="${t("agd.map.title")}">
      <rect class="agm-sea" x="-5000" y="-5000" width="${full.w + 10000}" height="${full.h + 10000}"/>
      <path class="agm-near" d="${path(geo.near)}"/>
      <path class="agm-land" d="${path(geo.land)}"/>
      <path class="agm-units" d="${path(geo.units)}"/>
      <path class="agm-edge" d="${path(geo.land)}"/>
      <g class="agm-dots"></g><g class="agm-hi"></g></svg>
      <div class="agm-tip" hidden></div>
    <div class="agm-foot"><span class="agm-key"><i class="agm-k-dot"></i>${t("agd.map.town")}</span>
      <span class="agm-key"><i class="agm-k-ring"></i>${t(area, levels)}</span><span class="agm-missing dim"></span>
      <span class="agm-credit dim">${t("agd.map.credit")}</span></div></div>`;
  const svg = el.querySelector("svg"), dotsG = el.querySelector(".agm-dots"), hiG = el.querySelector(".agm-hi");
  const tip = el.querySelector(".agm-tip"), box = el.querySelector(".agm-box");

  // ---- the view: a viewBox moved and scaled; the dots keep their size on screen
  let view = { ...full };
  // map units per screen pixel (the view fits the box: the tighter side decides)
  const scale = () => Math.max(view.w / Math.max(1, svg.clientWidth || 400), view.h / Math.max(1, svg.clientHeight || 300));
  function setView(v) {
    const minW = full.w / 40;
    const w = Math.min(full.w * 1.5, Math.max(minW, v.w)), h = w * (full.h / full.w);
    view = { x: v.x + (v.w - w) / 2, y: v.y + (v.h - h) / 2, w, h };
    svg.setAttribute("viewBox", `${view.x} ${view.y} ${view.w} ${view.h}`);
    resize();
  }
  function zoomAt(f, cx = view.x + view.w / 2, cy = view.y + view.h / 2) {
    const w = view.w / f, h = view.h / f;
    setView({ x: cx - (cx - view.x) / f, y: cy - (cy - view.y) / f, w, h });
  }
  const toMap = (ev) => { const p = svg.createSVGPoint(); p.x = ev.clientX; p.y = ev.clientY; return p.matrixTransform(svg.getScreenCTM().inverse()); };
  svg.addEventListener("wheel", (ev) => { ev.preventDefault(); const p = toMap(ev); zoomAt(ev.deltaY < 0 ? 1.25 : 0.8, p.x, p.y); }, { passive: false });
  let drag = null, dragged = false;                      // (a drag ends without selecting the dot under it)
  svg.addEventListener("pointerdown", (ev) => { if (ev.button === 0) drag = { x: ev.clientX, y: ev.clientY, v: { ...view }, moved: false }; });
  window.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", onUp);
  function onMove(ev) {
    if (!drag) return;
    const dx = ev.clientX - drag.x, dy = ev.clientY - drag.y;
    if (!drag.moved && Math.hypot(dx, dy) < 4) return;
    drag.moved = true;
    svg.classList.add("dragging");
    tip.hidden = true;
    const s = scale();
    setView({ ...drag.v, x: drag.v.x - dx * s, y: drag.v.y - dy * s });
  }
  function onUp() {
    if (drag?.moved) { dragged = true; setTimeout(() => { dragged = false; }, 0); }
    drag = null;
    svg.classList.remove("dragging");
  }
  el.querySelector(".agm-tools").addEventListener("click", (ev) => {
    const z = ev.target.closest("[data-z]")?.dataset.z;
    if (z === "in") zoomAt(1.6); else if (z === "out") zoomAt(1 / 1.6); else if (z === "all") setView(full);
  });

  // ---- the dots: one per place (the events at one place share it)
  let spots = [], byKey = new Map(), cur = { hover: null, selected: null, many: null };
  // `ghost(e)`: an event placed but drawn only while the mouse is over its row or it is selected (owner, 2026-10-30: today's
  // and the past competitions, the coming ones being the dots)
  function show(events, selected, ghost = () => false) {
    const at = new Map();
    let missing = 0, outside = 0;
    for (const e of events) {
      const g = !!ghost(e), w = where(e);
      if (!w) { if (!g) missing++; continue; }
      const x = X(w[1]), y = Y(w[0]);
      if (x < -full.w * 0.2 || x > full.w * 1.2 || y < -full.h * 0.2 || y > full.h * 1.2) { if (!g) outside++; continue; }   // (overseas)
      const k = `${x.toFixed(0)},${y.toFixed(0)},${w[2] ? 1 : 0},${g ? 1 : 0}`;
      if (!at.has(k)) at.set(k, { x, y, approx: w[2], ghost: g, events: [] });
      at.get(k).events.push(e);
    }
    spots = [...at.values()].sort((a, b) => b.approx - a.approx);        // (the hollow rings under the dots)
    byKey = new Map(spots.flatMap((s) => s.events.map((e) => [e.key, s])));
    dotsG.innerHTML = spots.map((s, i) => (s.ghost ? "" : `<circle data-i="${i}" class="${s.approx ? "agm-ring" : "agm-dot"}" cx="${s.x.toFixed(1)}" cy="${s.y.toFixed(1)}"/>`)).join("");
    const n = missing + outside;
    el.querySelector(".agm-missing").textContent = n ? tn(missingKey, n) : "";
    cur.selected = selected || null;
    resize();
    highlight();
  }
  function resize() {
    const s = scale();
    for (const c of dotsG.children) c.setAttribute("r", (c.classList.contains("agm-ring") ? 4.5 : 3.2) * s);
    dotsG.style.strokeWidth = `${1.2 * s}`;
    highlight();
  }
  // the event under the mouse (else the one selected): its dot in orange, its place's name beside it
  function highlight() {
    const key = cur.hover || cur.selected;
    const s = byKey.get(key), sel = byKey.get(cur.selected);
    const u = scale();
    const mark = (spot, strong) => {
      const e = spot.events.find((x) => x.key === key) || spot.events[0];
      const label = (e.place || e.name || "").split(/[,(]/)[0].trim().slice(0, 40);
      const lx = spot.x + 9 * u, ly = spot.y + 4 * u;
      return `<circle class="agm-hi-halo" cx="${spot.x}" cy="${spot.y}" r="${(strong ? 11 : 9) * u}"/>`
        + `<circle class="agm-hi-dot${spot.approx ? " approx" : ""}" cx="${spot.x}" cy="${spot.y}" r="${(strong ? 5.5 : 4.5) * u}" style="stroke-width:${1.6 * u}"/>`
        + (label ? `<text x="${lx}" y="${ly}" style="font-size:${12.5 * u}px;stroke-width:${3.5 * u}px">${esc(label)}</text>` : "");
    };
    // several competitions under the mouse (a day of the calendar): each one's place, without names
    const many = (cur.many || []).map((k) => byKey.get(k)).filter((x) => x && x !== s && x !== sel);
    const dots = [...new Set(many)].slice(0, 200).map((spot) => `<circle class="agm-hi-halo" cx="${spot.x}" cy="${spot.y}" r="${8 * u}"/>`
      + `<circle class="agm-hi-dot${spot.approx ? " approx" : ""}" cx="${spot.x}" cy="${spot.y}" r="${4 * u}" style="stroke-width:${1.4 * u}"/>`).join("");
    hiG.innerHTML = dots + (sel && sel !== s ? mark(sel, false) : "") + (s ? mark(s, true) : "");
  }
  const esc = (x) => String(x).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

  // the mouse over a dot: its events in a box; a click selects the first (the next one at a second click)
  let tipSpot = null;
  dotsG.addEventListener("mouseover", (ev) => {
    const c = ev.target.closest("circle[data-i]");
    if (!c) return;
    tipSpot = spots[Number(c.dataset.i)];
    const evs = tipSpot.events;
    tip.innerHTML = html`<b>${(evs[0].place || "").trim() || evs[0].name}</b>${tipSpot.approx ? html` <span class="dim">${t("agd.map.approx")}</span>` : ""}
      ${evs.slice(0, 6).map((e) => html`<div>${e.date ? `${fmtDate(e.date, "short")} · ` : ""}${e.name}</div>`)}${evs.length > 6 ? html`<div class="dim">${t("agd.map.more", { n: evs.length - 6 })}</div>` : ""}`;
    tip.hidden = false;
    const r = box.getBoundingClientRect(), cr = c.getBoundingClientRect();
    const left = Math.min(r.width - 250, Math.max(4, cr.left - r.left + 12)), top = cr.top - r.top + 12;
    tip.style.left = `${left}px`;
    tip.style.top = `${top > r.height - 90 ? Math.max(4, cr.top - r.top - tip.offsetHeight - 8) : top}px`;
    onHover?.(evs[0].key);
  });
  dotsG.addEventListener("mouseout", (ev) => {
    if (ev.relatedTarget?.closest?.("circle[data-i]")) return;
    tip.hidden = true; tipSpot = null;
    onHover?.(null);
  });
  dotsG.addEventListener("click", (ev) => {
    const c = ev.target.closest("circle[data-i]");
    if (!c || dragged) return;
    const evs = spots[Number(c.dataset.i)].events;
    const i = evs.findIndex((e) => e.key === cur.selected);
    onPick?.(evs[(i + 1) % evs.length].key);
  });

  // the selected event brought into view when it is outside it
  function select(key) {
    cur.selected = key || null;
    const s = byKey.get(key);
    if (s && (s.x < view.x || s.x > view.x + view.w || s.y < view.y || s.y > view.y + view.h)) setView({ ...view, x: s.x - view.w / 2, y: s.y - view.h / 2 });
    highlight();
  }
  /** The competition under the mouse elsewhere (a row), or several (`key` a list: a day of the calendar, its one named). */
  function hover(key) {
    const keys = Array.isArray(key) ? key : null;
    cur.many = keys && keys.length > 1 ? keys : null;
    cur.hover = (keys ? (keys.length === 1 ? keys[0] : null) : key) || null;
    highlight();
  }
  /** The view fitted on the dots (« Mes cartes »: the world's map closes in on where the maps are), else the whole frame. */
  function fitDots() {
    if (!spots.length) return setView(full);
    const xs = spots.map((s) => s.x), ys = spots.map((s) => s.y);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
    const w = Math.max(x1 - x0, full.w / 12) * 1.3, h = Math.max(y1 - y0, full.h / 12) * 1.3;
    const W = Math.max(w, h * (full.w / full.h)), H = W * (full.h / full.w);          // (setView keeps the frame's proportions)
    setView({ x: (x0 + x1) / 2 - W / 2, y: (y0 + y1) / 2 - H / 2, w: W, h: H });
  }
  const ro = new ResizeObserver(() => resize());
  ro.observe(svg);
  function destroy() { ro.disconnect(); window.removeEventListener("pointermove", onMove); window.removeEventListener("pointerup", onUp); }
  return { show, hover, select, destroy, fitDots, has: (key) => byKey.has(key) };
}
