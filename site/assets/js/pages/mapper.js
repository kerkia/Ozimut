// « Orga › Cartographier » (#/orga-carto; owner, 2026-11-06): drawing and updating orienteering maps in the browser, as OCAD
// and OpenOrienteering Mapper do, with the Tracer's ribbon. As the Tracer (owner, 2026-11-07), the page opens the editor at once,
// empty, and over it the start screen: a new map (sprint or forest, its place, the IOF's symbol set, open data to start from), a
// map file (OCAD 6-2018, Mapper, Ozimut's .ozmap) imported, or one of one's maps (those one created or whose team one joined).
// The editor's « Mes cartes » button and Fichier › Nouvelle / Ouvrir / Importer bring it back. A link naming a map (?id=) opens
// it; with ?invite= the account joins its team first. The editor is mapper/editor.js; the document mapper/doc.js
// (docs/mapper/model.md). The start screen has the Tracer's look (.tr-start).

import { html, raw } from "../util.js";
import * as S from "../mapper/store.js";
import { bindFull, leaveFull, inOwnTab, setFull } from "../fullwin.js";
import { betaNotice } from "../beta.js";
import { t, tn, locale } from "../mapper/lang.js";

let pageMain = null, leaving = false, reopening = false, switching = false;
const when = (s) => (s ? new Date(s).toLocaleDateString(locale(), { dateStyle: "medium" }) : "");
const listHash = () => (inOwnTab() ? "#/orga-carto?fen=1" : "#/orga-carto");
const isMapFile = (f) => /\.(ocd|omap|xmap|ozmap)$/i.test(f?.name || "");

export async function render(main, r) {
  pageMain = main; leaving = false;
  bindFull();
  if (inOwnTab()) setFull(true);
  // the editor at once, empty; the beta notice over it; then the map a link names, else the start screen
  const notice = betaNotice("mapper");
  await openBlank();
  notice.then(async () => {
    if (leaving) return;
    if (r.query.id && r.query.invite) { try { await S.join(r.query.id, r.query.invite); } catch (e) { toastErr(e); } history.replaceState(null, "", `#/orga-carto?id=${r.query.id}`); }
    if (r.query.id) await openMap(r.query.id); else startScreen();
  });
  return { title: t("map.page.title"), cleanup: () => { leaving = true; closeStart(); window.__mapper?.close?.(); leaveFull(); } };
}
function toastErr(e) {
  const E = window.__mapper;
  if (E?.say) { E.say(e?.message || String(e), "bad"); return; }
  const p = document.createElement("p"); p.className = "mp-err"; p.textContent = e?.message || String(e); pageMain?.prepend(p);
}

// ---- the editor: empty, or a map; switching closes the open one first (saved) -----------------------------------------------
async function closeEditor() {
  const E = window.__mapper;
  if (!E) return;
  switching = true;
  try { await E.close(); } finally { switching = false; }
}
async function openBlank() {
  if (leaving) return;
  const [{ openEditor: open }, D] = await Promise.all([import("../mapper/editor.js"), import("../mapper/doc.js")]);
  await closeEditor();
  if (leaving) return;
  pageMain.innerHTML = "";
  await open({ container: pageMain, blank: true, id: null, card: null, role: "viewer", doc: D.blank({ scale: 15000 }), version: 0, onStart, onClose });
}
/** The editor closed by itself (Fichier › Fermer): the empty editor and the start screen. */
function onClose() {
  if (leaving || switching || reopening) return;
  history.replaceState(null, "", listHash());
  openBlank().then(() => startScreen());
}
/** The start screen's choices, from the editor (« Mes cartes », Fichier, files dropped on an empty editor). */
function onStart(kind = "", arg = null) {
  if (kind === "reopen") { reopen(arg); return; }
  const files = Array.isArray(arg) ? arg : null;
  if (files?.length && kind === "import") { const f = files.find(isMapFile); if (f) { closeStart(); importFile(f); return; } }
  startScreen(kind);
}
/** A version restored, or the teammate's save kept after a conflict: the editor opened again on it. */
async function reopen(arg) {
  reopening = true;
  try {
    const source = window.__mapper?.source || null;
    await closeEditor();
    const c2 = await S.card(arg.id);
    await openEditor(arg.id, { doc: arg.doc, version: c2.map.version, source, isNew: !!arg.restored });
  } finally { reopening = false; }
}
/** After a dialog given up: the start screen again when no map is open. */
const backToStart = () => { if (!leaving && window.__mapper?.blank && !document.querySelector(".tr-modal")) startScreen(); };

// ---- the start screen: over the editor, the three ways in, each saying what it does and what it needs ------------------------
function closeStart() {
  const el = document.querySelector(".tr-start");
  if (el) { el._off?.(); el.remove(); }
}
function startScreen(focus = "") {
  const E = window.__mapper;
  if (!E || leaving) return;
  closeStart();
  const el = document.createElement("div");
  el.className = "tr-start mp-start";
  el.setAttribute("role", "dialog"); el.setAttribute("aria-modal", "true"); el.setAttribute("aria-labelledby", "mp-start-h");
  const ico = (k) => `<span class="tr-start-ico" aria-hidden="true">${{ new: "＋", import: "⇩", open: "▤" }[k]}</span>`;
  el.innerHTML = html`<div class="tr-start-box">
    <div class="tr-start-head"><h2 id="mp-start-h">${t("map.start.q")}</h2>
      <button type="button" class="tr-start-x" data-start-close title="${t("map.start.closeEsc")}" aria-label="${t("map.start.close")}">×</button></div>
    <div class="tr-start-cards">
      <section class="tr-start-card" data-k="new">
        <h3>${raw(ico("new"))}${t("map.start.new")}</h3>
        <p>${t("map.start.newDesc")}</p>
        <p class="tr-start-need">${raw(t("map.start.newNeed"))}</p>
        <button type="button" class="btn btn-primary" data-start="new">${t("map.start.newBtn")}</button>
      </section>
      <section class="tr-start-card" data-k="import">
        <h3>${raw(ico("import"))}${t("map.start.import")}</h3>
        <p>${t("map.start.importDesc")}</p>
        <p class="tr-start-need">${raw(t("map.start.importNeed"))}</p>
        <button type="button" class="btn" data-start="import">${t("map.start.importBtn")}</button>
        <input type="file" id="mp-file" accept=".ocd,.omap,.xmap,.ozmap" hidden>
      </section>
      <section class="tr-start-card tr-start-open" data-k="open">
        <h3>${raw(ico("open"))}${t("map.start.open")}</h3>
        <p>${t("map.start.openDesc")}</p>
        <div class="tr-start-list" id="mp-list"><div class="muted">${t("map.start.loading")}</div></div>
      </section>
    </div>
    <p class="tr-start-foot">${t("map.start.foot")}</p>
  </div>`;
  E.root.appendChild(el);
  const input = el.querySelector("#mp-file");
  input.addEventListener("change", () => { const f = input.files[0]; if (f) { closeStart(); importFile(f); } });
  el.querySelector("[data-start=new]").addEventListener("click", () => { closeStart(); newMap(); });
  el.querySelector("[data-start=import]").addEventListener("click", () => input.click());
  el.querySelector("[data-start-close]").addEventListener("click", closeStart);
  el.addEventListener("pointerdown", (e) => { if (e.target === el) closeStart(); });
  const onKey = (e) => { if (e.key === "Escape" && !document.querySelector(".tr-modal")) { e.stopPropagation(); e.preventDefault(); closeStart(); } };
  document.addEventListener("keydown", onKey, true);
  el._off = () => document.removeEventListener("keydown", onKey, true);
  // a map's file dropped on it: imported
  el.addEventListener("dragover", (e) => { if ([...(e.dataTransfer?.types || [])].includes("Files")) { e.preventDefault(); e.stopPropagation(); el.classList.add("over"); } });
  el.addEventListener("dragleave", (e) => { if (e.target === el) el.classList.remove("over"); });
  el.addEventListener("drop", (e) => {
    el.classList.remove("over");
    if (!e.dataTransfer?.files?.length) return;
    e.preventDefault(); e.stopPropagation();
    const f = [...e.dataTransfer.files].find(isMapFile);
    if (f) { closeStart(); importFile(f); } else el.querySelector('[data-k="import"]')?.classList.add("focus");
  });
  if (focus) el.querySelector(`[data-k="${focus}"]`)?.classList.add("focus");
  // as the Tracer's: the card asked for (Fichier › Nouvelle carte / Importer) marked and focused, nothing opened before a click
  (el.querySelector(`[data-k="${focus}"] button`) || el.querySelector("[data-start='new']"))?.focus({ preventScroll: true });
  fillList(el);
}
async function fillList(el) {
  const box = el.querySelector("#mp-list");
  let maps = [];
  try { maps = (await S.list()).maps; }
  catch (e) { const F = await import("../mapper/field.js"); maps = await F.keptMaps().catch(() => []); }
  if (!document.contains(box)) return;
  const openId = window.__mapper?.blank ? null : window.__mapper?.id;
  box.innerHTML = maps.length ? html`<ul>${maps.map((m) => html`<li><button type="button" data-open="${m.id}" ${raw(m.id === openId ? 'aria-current="true"' : "")}>
      <span class="tr-start-t">${m.title || t("map.untitled")}</span>
      <span class="tr-start-m">${[m.scale ? `1:${new Intl.NumberFormat(locale()).format(m.scale)}` : "", m.standard, m.objects ? tn("map.start.objects", m.objects) : "", m.mine === false ? t("map.start.shared", { name: m.ownerName || "" }) : "", m.offline ? t("map.start.offline") : "", when(m.updated), m.id === openId ? t("map.start.tagOpen") : ""].filter(Boolean).join(" · ")}</span>
    </button>${m.mine ? html`<button type="button" class="tr-start-del" data-del="${m.id}" title="${t("map.start.delete")}" aria-label="${t("map.start.delete")}">🗑</button>` : ""}</li>`)}</ul>`
    : html`<div class="muted">${t("map.start.none")}</div>`;
  box.querySelectorAll("[data-open]").forEach((b) => b.addEventListener("click", () => {
    closeStart();
    if (b.dataset.open === openId) return;
    history.replaceState(null, "", `#/orga-carto?id=${b.dataset.open}${inOwnTab() ? "&fen=1" : ""}`);
    openMap(b.dataset.open);
  }));
  box.querySelectorAll("[data-del]").forEach((b) => b.addEventListener("click", async () => {
    const { modal } = await import("../tracer/dialogs.js");
    const ok = await modal(null, { title: t("map.start.delete"), body: `<p>${t("map.start.deleteQ")}</p>`, ok: t("map.start.delete") });
    if (!ok) return;
    try { await S.remove(b.dataset.del); } catch (e) { toastErr(e); return; }
    if (b.dataset.del === openId) { history.replaceState(null, "", listHash()); await openBlank(); startScreen("open"); return; }
    fillList(el);
  }));
}

// ---- a new map ------------------------------------------------------------------------------------------------------------------
async function newMap() {
  const { modal, field } = await import("../tracer/dialogs.js");
  const v = await modal(null, { title: t("map.new.title"), wide: true, ok: t("map.start.newBtn"), body: `
    ${field(t("map.new.name"), `<input name="title" required maxlength="140">`)}
    <fieldset class="mp-choice"><legend>${t("map.new.kind")}</legend>
      <label><input type="radio" name="kind" value="sprint" required> ${t("map.new.sprint")}</label>
      <label><input type="radio" name="kind" value="forest" required> ${t("map.new.forest")}</label></fieldset>
    <fieldset class="mp-choice" data-fscale style="display:none"><legend>${t("map.new.scale")}</legend>
      <label><input type="radio" name="fscale" value="15000" checked> ${t("map.new.scale15")}</label>
      <label><input type="radio" name="fscale" value="10000"> ${t("map.new.scale10")}</label></fieldset>
    ${field(t("map.new.place"), `<input name="place" placeholder="48.3512, -1.2038">`, t("map.new.placeHint"))}
    <p><button type="button" class="btn btn-sm" data-here>${t("map.new.here")}</button></p>
    ${field(t("map.new.size"), `<select name="size">${[0.5, 1, 2, 3].map((a) => `<option value="${a}" ${a === 1 ? "selected" : ""}>${t("map.new.sizeOpt", { a: new Intl.NumberFormat(locale()).format(a) })}</option>`).join("")}</select>`)}
    <fieldset class="mp-choice"><legend>${t("map.new.data")}</legend>
      ${dataBox("bdtopo", true, "map.new.national", "map.new.nationalTip")}
      ${dataBox("osm", false, "map.new.osm", "map.new.osmTip")}
      ${dataBox("dem", true, "map.new.dem", "map.new.demTip")}
      ${dataBox("lidar", false, "map.new.lidar", "map.new.lidarTip")}</fieldset>
    <div data-support></div>`,
    onOpen: (form) => {
      // what Cartographier has at the place typed; where something is missing, the way to ask Ozimut for that country
      let tick = 0;
      const support = async () => {
        const my = ++tick, p = parsePlace(form.place.value), box = form.querySelector("[data-support]");
        if (!p) { box.innerHTML = ""; return; }
        const SP = await import("../mapper/support.js"), s = await SP.at(...p);
        if (my === tick) box.innerHTML = SP.noteHtml(s, ...p);
      };
      form.place.addEventListener("input", support);
      // the forest map's scale: ISOM's own 1:15 000 by default, 1:10 000 its 150 % enlargement
      form.querySelectorAll("[name=kind]").forEach((r) => r.addEventListener("change", () => { form.querySelector("[data-fscale]").style.display = form.kind.value === "forest" ? "" : "none"; }));
      // ⓘ: the source in a tooltip; a tap (no hover on a phone) shows it under the line
      form.querySelectorAll("[data-tip]").forEach((b) => b.addEventListener("click", () => { const p = b.parentElement.querySelector(".mp-tip"); p.style.display = p.style.display === "none" ? "block" : "none"; }));
      // one set of contours: the LiDAR's replace the terrain model's
      // (a forest map: a sprint map's contours follow the town plan's rules, and the LiDAR's stay out where they lie)
      const contoursBox = () => { const on = form.lidar.checked && form.kind.value === "forest"; if (on) form.dem.checked = false; form.dem.disabled = on; form.dem.closest("label").title = on ? t("map.new.demByLidar") : ""; };
      form.lidar.addEventListener("change", contoursBox);
      form.querySelectorAll("[name=kind]").forEach((r) => r.addEventListener("change", contoursBox));
      form.querySelector("[data-here]").addEventListener("click", () => navigator.geolocation?.getCurrentPosition((p) => { form.place.value = `${p.coords.latitude.toFixed(5)}, ${p.coords.longitude.toFixed(5)}`; support(); }, () => {}, { enableHighAccuracy: true, timeout: 15000 }));
    },
    validate: (x) => (!x.kind ? t("map.new.needKind") : x.place && !parsePlace(x.place) ? t("map.new.badPlace") : null) });
  if (!v) { backToStart(); return; }
  const sprint = v.kind === "sprint", scale = sprint ? 4000 : Number(v.fscale) === 10000 ? 10000 : 15000, standard = sprint ? "ISSprOM2019-2" : "ISOM2017-2";
  const L = await import("../mapper/layout.js"), D = await import("../mapper/doc.js");
  const set = await L.loadSet(sprint ? "issprom2019-2" : "isom2017-2");
  const doc = D.blank({ title: v.title, scale, standard, colors: set.colors, symbols: L.scaled(set, scale).map((s) => ({ ...s, set: sprint ? "issprom2019-2" : "isom2017-2" })) });
  const place = parsePlace(v.place);
  if (place) doc.realWorld = await realWorldAt(place, scale);
  const { id } = await S.create({ title: v.title, scale, standard, place: place ? { lat: place[0], lon: place[1] } : null });
  history.pushState(null, "", `#/orga-carto?id=${id}`);
  const E = await openEditor(id, { doc, version: 0, isNew: true });
  if (place && E) {
    const half = (Number(v.size) * 1e6) / scale / 2;                 // the square's half side, map mm
    E.dataArea = [-half, -half, half, half];
    E.live.transact("", () => E.live.setDocField("printArea", [-half, -half, half, half]));
    E.view.fit(E.dataArea);
    // the country's own vectors (BD TOPO, swissTLM3D, The National Map), finer than OpenStreetMap there; elsewhere OpenStreetMap
    const D = await import("../mapper/dataui.js");
    const nat = E.frame?.geo ? await D.nationalSource(E, E.frame) : null;
    if (v.bdtopo && !nat) v.osm = true;
    // one set of contours (owner, 2026-11-12: three came in together): a forest map the LiDAR's when it is asked for, else the
    // terrain model's; a sprint map the town plan's or the terrain model's by the town plan's rules, the LiDAR's only where those
    // are not (dataui.js reliefCover)
    if (sprint && nat === "bdtopo" && (v.bdtopo || v.osm)) {
      // a sprint map in France: the town map of the generator Pixel's races use (LiDAR, BD TOPO, BD ORTHO, cadastre,
      // OpenStreetMap; the townmap workflow, several minutes), its contours with it — one engine, not the separate imports
      await D.town(E, { contours: !!v.dem });
      if (v.lidar) await E.act("data-lidar");
    } else for (const [k, act] of [["dem", "data-contours"], ["bdtopo", "data-national"], ["osm", "data-osm"], ["lidar", "data-lidar"]]) {
      if (k === "dem" && v.lidar && !sprint) continue;            // a forest map: the LiDAR's contours, not the terrain model's
      if (v[k] && (k !== "bdtopo" || nat)) await E.act(act);
    }
  }
}
/** A data checkbox with its ⓘ (outside the label, so that a tap on it does not tick the box). */
const dataBox = (name, on, label, tip) => `<span style="flex-basis:100%"><label><input type="checkbox" name="${name}" ${on ? "checked" : ""}> ${t(label)}</label> <button type="button" class="muted" style="border:0;background:none;padding:0 2px;cursor:help;font:inherit" data-tip title="${t(tip).replace(/"/g, "&quot;")}" aria-label="${t(tip).replace(/"/g, "&quot;")}">ⓘ</button><span class="mp-tip muted" style="display:none;font-size:12.5px">${t(tip)}</span></span>`;
const parsePlace = (s) => { const m = /^\s*(-?\d+(?:[.,]\d+)?)\s*[,; ]\s*(-?\d+(?:[.,]\d+)?)\s*$/.exec(String(s || "")); if (!m) return null; const la = Number(m[1].replace(",", ".")), lo = Number(m[2].replace(",", ".")); return Math.abs(la) <= 90 && Math.abs(lo) <= 180 ? [la, lo] : null; };
/** The map's grid at a place: Lambert 93 in metropolitan France, the national grid in Switzerland and New Zealand, else UTM. */
async function realWorldAt([lat, lon], scale) {
  const F = await import("../mapper/data/frame.js");
  const { countryAt } = await import("../trace/terrain.js");
  const cc = countryAt(lat, lon);
  if (cc === "FR") { const [x, y] = F.toL93(lat, lon); return { x, y, angle: 0, grid: 0, paperGrid: 0, on: true, zone: 0, epsg: 2154, gridScale: 1 }; }
  // Switzerland in LV95, New Zealand in NZTM2000, the USA and Canada in NAD83 / UTM (their agencies' own), elsewhere WGS 84 / UTM
  const zone = Math.floor((lon + 180) / 6) + 1;
  const epsg = cc === "CH" ? 2056 : cc === "NZ" ? 2193 : (cc === "US" || cc === "CA") && lat >= 0 ? 26900 + zone : (lat >= 0 ? 32600 : 32700) + zone;
  const p4 = await F.proj4lib(), table = await F.crsTable();
  const def = table.epsg?.[String(epsg)] || `+proj=utm +zone=${zone}${lat < 0 ? " +south" : ""} +datum=WGS84 +units=m`;
  const [x, y] = p4("WGS84", def, [lon, lat]);
  void scale;
  return { x, y, angle: 0, grid: 0, paperGrid: 0, on: true, zone: 0, epsg, gridScale: 1 };
}

// ---- a file imported -------------------------------------------------------------------------------------------------------------
async function importFile(file) {
  const IO = await import("../mapper/io.js");
  let got;
  try { got = await IO.openBytes(await file.arrayBuffer(), file.name); }
  catch (e) { toastErr(e); backToStart(); return; }
  const { doc, source, files } = got;
  if (!doc.title) doc.title = file.name.replace(/\.[^.]+$/, "");
  const { id } = await S.create({ title: doc.title, scale: doc.scale, standard: doc.standard || "" });
  if (source) { await S.saveSource(id, source); await S.setCard(id, { source: { name: file.name, kind: "ocad", version: doc.ocad?.version || 0 } }); }
  for (const [sha, f] of Object.entries(files || {})) await S.saveFile(id, f.bytes, f.type || "application/octet-stream").catch(() => {});
  history.pushState(null, "", `#/orga-carto?id=${id}`);
  const E = await openEditor(id, { doc, version: 0, source, isNew: true });
  if (E && doc.omap?.losses?.length) IO.sayLosses(E, doc.omap.losses);
}

// ---- opening a map ---------------------------------------------------------------------------------------------------------------
async function openMap(id) {
  let card, doc, version, source = null;
  try {
    card = await S.card(id);
    ({ doc, version } = await S.loadDoc(id));
    if (card.map.source) source = await S.loadSource(id);
    // changes made on this device without the network, newer than the server's
    const F = await import("../mapper/field.js");
    const pend = await F.pendingOf(id);
    if (pend && pend.base === version) { doc = pend.doc; await F.clearPending(id); }
  } catch (e) {
    // without the network: this device's copy
    const F = await import("../mapper/field.js");
    const kept = await F.keptMap(id);
    if (!kept) { toastErr(e); history.replaceState(null, "", listHash()); startScreen(); return; }
    const pend = await F.pendingOf(id);
    card = { map: kept.card?.map || kept.card, role: kept.role }; doc = pend?.doc || kept.doc; version = pend?.base ?? kept.version; source = kept.source;
    return openEditor(id, { doc, version, source, card, role: kept.role, files: kept.files, offline: true });
  }
  if (!doc) { toastErr(new Error(t("map.page.empty"))); history.replaceState(null, "", listHash()); startScreen(); return; }
  return openEditor(id, { doc, version, source, card });
}
async function openEditor(id, { doc, version, source = null, card = null, role = null, files = {}, isNew = false }) {
  if (leaving) return null;
  const { openEditor: open } = await import("../mapper/editor.js");
  closeStart();
  await closeEditor();
  if (leaving) return null;
  pageMain.innerHTML = "";
  const c = card || (await S.card(id).catch(() => null));
  const E = await open({ container: pageMain, id, card: c?.map || null, role: role || c?.role || "owner", doc, version, source, files, isNew, onClose, onStart });
  // a town map asked for before the page was left (« Plan de ville »): taken up again
  if (E && id && !isNew) import("../mapper/dataui.js").then((D) => D.resumeTown(E)).catch(() => {});
  return E;
}
