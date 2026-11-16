// « Organisation › Tracer » (#/orga-tracer): course setting in the browser, as Purple Pen does it (owner, 2026-10-15). The
// editor (tracer/editor.js) opens at once, empty, drawn in the page under the site's menus as the analyses are, and a start
// screen over it offers the three ways in (owner, 2026-10-17): a new event (a competition of one's club from the agenda, or a
// training) with its map (an OCAD or Mapper file, a PDF or an image); an event imported from an Ozimut file (.ozmt, or .ocnt before 2026-10-19, which holds
// its map) or a Purple Pen file (.ppen) with its map; or one of one's events (those one created or whose team one belongs
// to). « Événements » in the editor, and the Fichier menu, bring the start screen back. « ⤢ » the whole window (Échap or « ⤡ »
// back), « ↗ » a tab of its own (?fen=1; fullwin.js). A link naming an event (?id=) opens it straight away.
// Courses stay secret: only the event's team opens it (functions/api/tracer).

import { html, raw, fmtDate } from "../util.js";
import * as auth from "../auth.js";
import * as data from "../data.js";
import { getProv } from "./provisional.js";
import * as declare from "../declare.js";
import * as S from "../tracer/store.js";
import * as M from "../tracer/model.js";
import { readPpen } from "../tracer/ppen.js";
import { readOcn, isOcnFile, ACCEPT as OCN_ACCEPT } from "../tracer/ocnfile.js";
import { openMap, isMapFile, mimeOf, imageDpi, isPdf, isVectorMap, MAP_ACCEPT } from "../tracer/mapsrc.js";
import { geoFromWorld } from "../tracer/geo.js";
import { where } from "../agendamap.js";
import { dropHtml, dropZone } from "../tracer/dialogs.js";
import { centreOnMap } from "../tracer/calage.js";
import * as OFF from "../tracer/offline.js";
import { bindFull, setFull, leaveFull, inOwnTab } from "../fullwin.js";
import { betaNotice } from "../beta.js";
import { t, tn, lang, locale } from "../tracer/lang.js";

const today = () => new Date().toISOString().slice(0, 10);
const listHash = () => (inOwnTab() ? "#/orga-tracer?fen=1" : "#/orga-tracer");
const orgCode = (org) => { const m = /^\s*(\d{3,4})\b/.exec(String(org || "")); return m ? m[1].padStart(4, "0") : null; };
let current = null, pageMain = null, leaving = false;

// the event of Orga the page was opened from (its « Tracé » tab, ?ev=<id>; owner, 2026-11-12): a new course setting is that
// event's — its competition, or its name and day for a training — and tied to it (functions/api/tracer `event`)
let forEvent = null;
/** The OCAD / Mapper files the event's analysis kept from its circuits' import (owner, 2026-11-12: no second upload), as Files. */
async function analysisFiles(aid) {
  const get = async (p) => {
    const r = await fetch(`api/analyses/${encodeURIComponent(aid)}/source${p}`, { credentials: "same-origin", cache: "no-store" });
    if (!r.ok) throw Object.assign(new Error(`http ${r.status}`), { code: (await r.json().catch(() => null))?.error });
    return r;
  };
  const { files } = await (await get("")).json();
  if (!files?.length) throw Object.assign(new Error("none"), { code: "none" });
  return Promise.all(files.map(async (x) => new File([await (await get(`/${x.i}`)).blob()], x.name || `file-${x.i}.ocd`)));
}
async function loadOrgaEvent(id) {
  try {
    const r = await fetch(`api/events/${encodeURIComponent(id)}`, { credentials: "same-origin", cache: "no-store" });
    const d = r.ok ? await r.json() : null;
    return d?.event && (d.member || d.admin) ? d.event : null;
  } catch (e) { return null; }
}

export async function render(main, r) {
  pageMain = main; leaving = false;
  forEvent = r.query.ev ? await loadOrgaEvent(r.query.ev) : null;
  bindFull();
  if (inOwnTab()) setFull(true);                         // a tab opened alone by « ↗ »: the Tracer without the site's bar
  // the editor at once, empty; the beta notice over it (beta.js; owner, 2026-10-16); then the event a link names, else the start screen
  const notice = betaNotice("tracer");
  await openBlank();
  notice.then(async () => {
    if (leaving) return;
    if (r.query.id && r.query.invite) await joinByInvite(r.query.id, r.query.invite);
    if (r.query.id) openEvent(r.query.id);
    else if (forEvent && r.query.nouveau) choose("new");
    else if (forEvent && r.query.importer) choose("import");
    else if (forEvent?.analysis && r.query.depuis === "analyse") analysisFiles(forEvent.analysis).then((f) => choose("import", f))
      .catch((e) => { alertBox(t("trc.page.fromAnalysisErr", { err: e.code || e.message })); startScreen(); });        // Orga's « Importer les fichiers des circuits »
    // a map handed over by Cartographier (« Créer un événement du tracé sur cette carte »): a new event on it (pwa.js inbox)
    else if (r.query.recu) import("../pwa.js").then((m) => m.takeInbox()).then((f) => (f.length ? choose("new", f) : startScreen())).catch(() => startScreen());
    else startScreen();
  });
  return { title: t("trc.page.title"), cleanup: () => { leaving = true; document.querySelector(".tr-start")?.remove(); window.__tracer?.close?.(); leaveFull(); } };
}

// ---- the editor: empty, or an event; switching closes the open one first (saved, its lock released) ---------------------------
let switching = false;
async function closeEditor() {
  const E = window.__tracer;
  if (!E) return;
  switching = true;
  try { await E.close(); } finally { switching = false; }
}
/** The editor closed by itself (« ↗ » moved the event to a tab of its own): the empty editor and the start screen here. */
function onClose() {
  if (leaving || switching) return;
  history.replaceState(null, "", listHash());
  openBlank().then(() => startScreen());
}
/** The start screen's choices, from the editor (« Événements », the Fichier menu, files dropped on an empty editor). */
function onStart(kind = "", files = null) {
  if (files?.length && (kind === "new" || kind === "import")) { choose(kind, files); return; }
  startScreen(kind);
}
async function openBlank() {
  const { openEditor } = await import("../tracer/editor.js");
  if (leaving) return;
  await closeEditor();
  if (leaving) return;
  pageMain.innerHTML = "";
  await openEditor({ container: pageMain, blank: true, meta: { id: null, title: "" }, role: "viewer", you: null, ev: M.newEvent({ lang: lang() }), version: 0,
    mapSrc: null, onStart, onClose });
}
/** After a dialog given up: the start screen again when no event is open. */
const backToStart = () => { if (!leaving && window.__tracer?.blank && !document.querySelector(".tr-modal")) startScreen(); };
async function choose(kind, files = null) {
  closeStart();
  const id = kind === "new" ? await newEvent(pageMain, files) : await importEvent(pageMain, files || []);
  if (!id) backToStart();
}

/** One's events (those one created or whose team one belongs to); without network, those kept on this device. */
async function loadEvents() {
  try { const d = await S.api(""); current = { club: d.club }; return d.events; }
  catch (e) {
    const kept = e.status ? [] : await OFF.keptEvents().catch(() => []);
    if (!kept.length) throw e;
    return kept.map((x) => ({ ...x, mine: false, offline: true }));
  }
}

// ---- the start screen: over the editor, the three ways in, each saying what it does and what it needs ------------------------------
function closeStart() {
  const el = document.querySelector(".tr-start");
  if (el) { el._off?.(); el.remove(); }
}
function startScreen(focus = "") {
  const E = window.__tracer;
  if (!E || leaving) return;
  closeStart();
  const el = document.createElement("div");
  el.className = "tr-start";
  el.setAttribute("role", "dialog"); el.setAttribute("aria-modal", "true"); el.setAttribute("aria-labelledby", "tr-start-h");
  const ico = (k) => `<span class="tr-start-ico" aria-hidden="true">${{ new: "＋", import: "⇩", open: "▤" }[k]}</span>`;
  el.innerHTML = html`<div class="tr-start-box">
    <div class="tr-start-head"><h2 id="tr-start-h">${t("trc.page.startQ")}</h2>
      <button type="button" class="tr-start-x" data-start-close title="${t("trc.page.closeEsc")}" aria-label="${t("trc.page.close")}">×</button></div>
    <div class="tr-start-cards">
      <section class="tr-start-card" data-k="new">
        <h3>${raw(ico("new"))}${t("trc.page.newEvent")}</h3>
        <p>${t("trc.page.newDesc")}</p>
        <p class="tr-start-need">${raw(t("trc.page.newNeed"))}</p>
        <button type="button" class="btn btn-primary" data-start="new">${t("trc.page.createBtn")}</button>
      </section>
      <section class="tr-start-card" data-k="import">
        <h3>${raw(ico("import"))}${t("trc.page.importEvent")}</h3>
        <p>${t("trc.page.importDesc")}</p>
        <p class="tr-start-need">${raw(t("trc.page.importNeed"))}</p>
        <button type="button" class="btn" data-start="import">${t("trc.page.importBtn")}</button>
      </section>
      <section class="tr-start-card tr-start-open" data-k="open">
        <h3>${raw(ico("open"))}${t("trc.page.openEvent")}</h3>
        <p>${t("trc.page.openDesc")}</p>
        <div class="tr-start-list" id="tr-start-list"><div class="muted">${t("trc.page.loading")}</div></div>
      </section>
    </div>
    <p class="tr-start-foot">${t("trc.page.startFoot")}</p>
  </div>`;
  E.root.appendChild(el);
  el.querySelectorAll("[data-start]").forEach((b) => b.addEventListener("click", () => choose(b.dataset.start)));
  el.querySelector("[data-start-close]").addEventListener("click", closeStart);
  el.addEventListener("pointerdown", (e) => { if (e.target === el) closeStart(); });
  const onKey = (e) => { if (e.key === "Escape" && !document.querySelector(".tr-modal")) { e.stopPropagation(); e.preventDefault(); closeStart(); } };
  document.addEventListener("keydown", onKey, true);
  el._off = () => document.removeEventListener("keydown", onKey, true);
  // files dropped on it: a map alone, a new event; a .ozmt (or .ocnt), or a .ppen with or without its map, an import
  el.addEventListener("dragover", (e) => { if ([...(e.dataTransfer?.types || [])].includes("Files")) { e.preventDefault(); e.stopPropagation(); el.classList.add("over"); } });
  el.addEventListener("dragleave", (e) => { if (e.target === el) el.classList.remove("over"); });
  el.addEventListener("drop", (e) => {
    const files = [...(e.dataTransfer?.files || [])];
    el.classList.remove("over");
    if (!files.length) return;
    e.preventDefault(); e.stopPropagation();
    choose(files.some((f) => isPpenFile(f) || isOcnFile(f)) ? "import" : "new", files);
  });
  if (focus) el.querySelector(`[data-k="${focus}"]`)?.classList.add("focus");
  (el.querySelector(`[data-k="${focus}"] button`) || el.querySelector("[data-start='new']"))?.focus({ preventScroll: true });
  fillOpenList(el);
}
async function fillOpenList(el) {
  const box = el.querySelector("#tr-start-list");
  let events;
  try { events = await loadEvents(); }
  catch (e) { box.innerHTML = html`<div class="tr-err">${t("trc.page.listErr", { err: e.code || e.message })}</div>`; return; }
  if (!document.contains(box)) return;
  const openId = window.__tracer?.blank ? null : window.__tracer?.meta?.id;
  // one's own events can be deleted here (owner, 2026-11-04: there was no way to); the team's are its owner's to delete
  box.innerHTML = events.length ? html`<ul>${events.map((e) => html`<li><button type="button" data-open="${e.id}" ${raw(e.id === openId ? 'aria-current="true"' : "")}>
      <span class="tr-start-t">${e.title}${e.encrypted ? " 🔒" : ""}</span>
      <span class="tr-start-m">${fmtDate(e.date, "short")} · ${e.kind === "race" ? t("trc.page.kindRace") : t("trc.page.kindTraining")}${e.mine ? "" : ` · ${e.ownerName || t("trc.page.team")}`}${e.offline ? ` · ${t("trc.page.tagOffline")}` : ""}${e.pending ? ` · ${t("trc.page.tagPending")}` : ""}${e.id === openId ? ` · ${t("trc.page.tagOpen")}` : ""}</span>
    </button>${e.mine ? html`<button type="button" class="tr-start-del" data-del="${e.id}" title="${t("trc.page.del", { title: e.title })}" aria-label="${t("trc.page.del", { title: e.title })}">🗑</button>` : ""}</li>`)}</ul>`
    : html`<div class="muted">${t("trc.page.noEvents")}</div>`;
  box.querySelectorAll("[data-open]").forEach((b) => b.addEventListener("click", () => {
    closeStart();
    if (b.dataset.open === openId) return;
    history.replaceState(null, "", `#/orga-tracer?id=${b.dataset.open}${inOwnTab() ? "&fen=1" : ""}`);
    openEvent(b.dataset.open);
  }));
  box.querySelectorAll("[data-del]").forEach((b) => b.addEventListener("click", () => deleteEvent(el, events.find((e) => e.id === b.dataset.del), openId)));
}
/** An event deleted for good, by its owner: its card, map, versions, comments, photos (the server's DELETE), and this device's
 *  offline copy; an analysis published from it stays (it is Orga's). The event open here gives way to the empty editor. */
async function deleteEvent(el, e, openId) {
  if (!e) return;
  const ok = await modal({ title: t("trc.page.delTitle", { title: e.title }), ok: t("trc.page.delOk"), body: `<p>${escA(t("trc.page.delBody"))}</p>` });
  if (!ok) return;
  try { await S.api(`/${e.id}`, { method: "DELETE" }); }
  catch (err) { alertBox(t("trc.page.delErr", { err: err.code || err.message })); return; }
  await OFF.dropEvent(e.id).catch(() => {});
  if (e.id === openId) {
    history.replaceState(null, "", listHash());
    await openBlank();
    startScreen("open");
    return;
  }
  fillOpenList(el);
}

// ---- a modal outside the editor (same look) -------------------------------------------------------------------------------
async function modal(opts) { return (await import("../tracer/dialogs.js")).modal(null, opts); }
const field = (label, input, hint = "") => `<label class="tr-field"><span>${label}</span>${input}${hint ? `<small>${hint}</small>` : ""}</label>`;
const escA = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

/** The competitions the account runs on Ozimut (« Orga › Gérer », 2026-11-11: its events' competitions, the agenda's place
 *  beside them); before migration 0026 (the API answers 503), as before: the club's, and those the account declared. */
async function clubRaces() {
  // opened from an event of Orga: that event's competition alone (a training: none, the training's fields filled from it)
  if (forEvent) return forEvent.type !== "training" && forEvent.race && forEvent.linkState !== "pending"
    ? [{ key: forEvent.race, date: forEvent.date, name: forEvent.name, place: forEvent.place || "", org: forEvent.club || "", epr: forEvent.epreuve || "" }] : [];
  const r = await fetch("api/events", { credentials: "same-origin", cache: "no-store" }).catch(() => null);
  if (r?.ok) {
    const evs = ((await r.json()).events || []).filter((e) => e.type !== "training" && e.race && e.linkState !== "pending");
    let ag = null;
    try { ag = await data.agenda(); } catch (e) { /* no agenda */ }
    return evs.map((e) => {
      const a = ag?.events?.find((x) => `a${x.id}` === e.race);
      return { key: e.race, date: e.date, name: e.name, place: e.place || "", org: e.club || "", epr: e.epreuve || a?.epr || "", spec: a?.spec || "", ...(a ? { ll: where(a) } : {}) };
    }).sort((a, b) => a.date.localeCompare(b.date));
  }
  if (!current) await loadEvents().catch(() => {});
  const me = auth.session(), club = current?.club;
  const out = [];
  try {
    const ag = await data.agenda();
    for (const e of ag.events || []) if (e.kind === "c" && e.id && e.date >= today() && (me?.admin || orgCode(e.org) === club)) out.push({ key: `a${e.id}`, date: e.date, name: e.name, place: e.place, org: e.org, epr: e.epr || "", spec: e.spec || "", ll: where(e) });
  } catch (e) { /* no agenda */ }
  try {
    const idx = await getProv("index.json");
    for (const x of idx?.races || []) if (x.date_iso < today() && (me?.admin || orgCode(x.org) === club) && !out.some((o) => o.key === x.key))
      out.push({ key: x.key, date: x.date_iso, name: x.name, place: x.place || "", org: x.org, epr: x.epreuve || "" });
  } catch (e) { /* no results */ }
  for (const d of (await declare.load()).competitions) if (!out.some((o) => o.key === d.key))
    out.push({ key: d.key, date: d.date, name: d.name, place: d.place || "", org: d.club, epr: d.epreuve || "" });
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

// ---- what the event is: a competition of one's club, or a training ------------------------------------------------------------
function kindFields(races, title = forEvent?.name || "") {
  // the event of « Orga › Gérer » the Tracer was opened for: said, not asked (owner, 2026-11-16)
  if (forEvent && forEvent.linkState !== "pending") {
    const race = forEvent.type !== "training" ? races.find((x) => x.key === forEvent.race) : null;
    if (race) return `<input type="hidden" name="kind" value="race"><input type="hidden" name="race" value="${escA(race.key)}">
      <p class="tr-hint">${escA(t("trc.page.forEvent", { name: race.name, date: fmtDate(race.date) }))}</p>`;
    if (forEvent.type === "training" && (forEvent.name || "").trim().length >= 3) return `<input type="hidden" name="kind" value="training">
      <input type="hidden" name="title" value="${escA(forEvent.name)}"><input type="hidden" name="date" value="${escA(forEvent.date || today())}">
      <p class="tr-hint">${escA(t("trc.page.forEvent", { name: forEvent.name, date: fmtDate(forEvent.date || today()) }))}</p>`;
  }
  return `<div class="tr-checks"><label class="tr-check"><input type="radio" name="kind" value="race" ${races.length ? "checked" : "disabled"}> ${escA(t("trc.page.kindRaceOpt"))}</label>
    <label class="tr-check"><input type="radio" name="kind" value="training" ${races.length ? "" : "checked"}> ${escA(t("trc.page.kindTrainingOpt"))}</label></div>
    <div data-k="race">${field(escA(t("trc.page.kindRace")), `<select name="race">${races.map((x) => `<option value="${x.key}">${escA(fmtDate(x.date, "short"))} — ${escA(x.name)}${x.place ? ` (${escA(x.place)})` : ""}</option>`).join("")}</select>`,
      escA(races.length ? t("trc.page.racesHint") : t("trc.page.noRaces")))}</div>
    <div data-k="training" hidden>${field(escA(t("trc.page.titleLabel")), `<input name="title" placeholder="${escA(t("trc.page.titlePh"))}" value="${escA(title)}">`)}${field(escA(t("trc.page.dateLabel")), `<input name="date" type="date" value="${forEvent?.date || today()}">`)}</div>`;
}
function bindKind(f, races) {
  const sync = () => { const k = f.elements.kind.value; f.querySelectorAll("[data-k]").forEach((d) => { d.hidden = d.dataset.k !== k; }); };
  f.querySelectorAll("input[name=kind]").forEach((x) => x.addEventListener("change", sync)); sync();
  const sprint = () => { const r = races.find((x) => x.key === f.elements.race?.value); if (r && /sprint/i.test(r.epr) && f.elements.std) { f.elements.std.value = "Spr2019"; f.elements.scale.value = "4000"; } };
  f.elements.race?.addEventListener("change", sprint);
  if (f.elements.race?.type === "hidden") sprint();
}
const kindProblem = (o) => (o.kind === "race" && !o.race ? t("trc.page.needRace") : o.kind === "training" && (o.title || "").trim().length < 3 ? t("trc.page.needTitle") : null);
/** « Carte privée » (owner, 2026-11-06): the map left out of the administrators' collection; off by default. */
const privField = (on = false) => `<label class="tr-check" title="${escA(t("trc.priv.tip"))}"><input type="checkbox" name="priv"${on ? " checked" : ""}> ${escA(t("trc.priv.label"))}</label>`;
async function createEvent(v, races) {
  const race = v.kind === "race" ? races.find((x) => x.key === v.race) : null;
  const body = { ...(race ? { kind: "race", race: race.key, title: race.name, date: race.date } : { kind: "training", title: v.title.trim(), date: v.date || today() }), mapPrivate: !!v.priv,
    ...(forEvent ? { event: forEvent.id } : {}) };
  try { return { id: (await S.api("", { method: "POST", body })).id, title: body.title }; }
  catch (e) { alertBox(e.code === "not organiser" ? t("trc.page.notOrganiser") : t("trc.page.createErr", { err: e.code || e.message })); return null; }
}
const isPpenFile = (f) => /\.(ppen|xml)$/i.test(f.name);
/** An OCAD file's course setting (OCAD's « Course Setting » projects; owner, 2026-11-04): the event its courses make — controls
 *  with their descriptions, courses, a finish where a course ends at its start —, its map's name (the file itself when it holds
 *  a map, else the background map OCAD shows under the courses, its first OCAD or Mapper template), or null when it has no
 *  course. Classes, the advanced level's, for administrators only. */
async function ocadCourses(file) {
  if (!/\.ocd$/i.test(file.name)) return null;
  let map, holdsMap;
  try { const O = await import("../tracer/vmap/ocad.js"); holdsMap = O.holdsMap; ({ map } = O.readOcad(new Uint8Array(await file.arrayBuffer()))); } catch (e) { return null; }
  const cs = map.courseSetting;
  if (!cs?.courses.length) return null;
  const iof = await import("../tracer/iofin.js");
  await (await import("../tracer/symbols.js")).loadSymbols().catch(() => {});
  const got = iof.fromOcad(cs);
  const ev = M.newEvent({ lang: lang(), map: { kind: "none", scale: map.scale || 10000 } });
  ev.title = file.name.replace(/\.ocd$/i, "");
  iof.importInto(ev, got, { fileMm: false });
  const self = holdsMap(map);
  // its layout images (logos): drawn with the map when the file is the map, else image objects of the event where OCAD shows them
  const logos = self ? 0 : await iof.addLayoutImages(ev, map, { fileMm: false });
  const tpl = (map.templates || []).find((x) => /\.(ocd|omap|xmap)$/i.test(x.file));
  ev.map.file = self ? file.name : tpl ? tpl.file.split(/[\\/]/).pop() : "";
  return { ev, self, forked: got.forked, logos };
}
const fmtN = (v) => new Intl.NumberFormat(locale(), { maximumFractionDigits: 0 }).format(v);
/** « 48.3912, -1.1734 » (or with decimal commas and « ; ») → [lat, lon], or null. */
function osmPlace(text) {
  const m = String(text || "").trim().match(/^(-?\d{1,2}(?:[.,]\d+)?)\s*[;,\s]\s*(-?\d{1,3}(?:[.,]\d+)?)$/);
  if (!m) return null;
  const lat = Number(m[1].replace(",", ".")), lon = Number(m[2].replace(",", "."));
  return Math.abs(lat) <= 85 && Math.abs(lon) <= 180 ? [lat, lon] : null;
}
/** A file's size in megabytes, one decimal, in the interface's language. */
const fmtMb = (bytes) => t("trc.page.mb", { n: new Intl.NumberFormat(locale(), { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(bytes / 1e6) });
/** An OCAD or Mapper map opened as soon as it is chosen: its scale, size and georeference shown before the event is made. */
async function openVectorFile(file) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let err = null;
  const src = await openMap(bytes, mimeOf(file.name, file.type), file.name).catch((e) => { err = e; return null; });
  if (!src) return { err };
  src.bytes = bytes;
  src.geoInfo = await (await import("../tracer/vmap/georef.js")).geoFromVector(src.vmap, src).catch(() => null);
  return { src };
}
const vectorLabel = (src) => `${src.format === "oom" ? "OpenOrienteering Mapper" : `OCAD ${src.version}`}, 1:${fmtN(src.scale)}, ${fmtN(src.w)} × ${fmtN(src.h)} mm${src.geoInfo ? `, ${t("trc.page.georef", { name: src.geoInfo.name })}` : ""}`;
const baseName = (n) => String(n || "").split(/[\\/]/).pop().replace(/\.[^.]+$/, "").toLowerCase();

// ---- a new event: its map, dropped or chosen ----------------------------------------------------------------------------------
async function newEvent(main, files = null) {
  const races = await clubRaces();
  let mapFile = null, vec = null, handed = false;
  const v = await modal({ title: t("trc.page.newEvent"), wide: true, ok: t("trc.page.create"), body: `
    ${kindFields(races)}
    ${dropHtml("tr-new-drop", t("trc.page.newDrop"), MAP_ACCEPT, false)}
    <p class="tr-hint" id="tr-new-map">${escA(t("trc.page.newMapHint"))}</p>
    ${privField()}
    <p class="tr-hint">${t("trc.gen.toMapper")}</p>
    <div class="tr-grid2">${field(escA(t("trc.page.scaleLabel")), '<input name="scale" value="10000" inputmode="numeric">')}
    ${field(escA(t("trc.page.dpiLabel")), `<input name="dpi" inputmode="numeric" placeholder="${escA(t("trc.page.dpiPh"))}">`, escA(t("trc.page.dpiHint")))}
    ${field(escA(t("trc.page.stdLabel")), `<select name="std"><option value="2017">${escA(t("trc.page.stdForest"))}</option><option value="Spr2019">${escA(t("trc.page.stdSprint"))}</option></select>`)}</div>
    <details class="tr-details" id="tr-new-osm"><summary>${escA(t("trc.osm.summary"))}</summary>
      <p class="tr-hint">${escA(t("trc.osm.intro"))}</p>
      <div class="tr-grid2">${field(escA(t("trc.osm.where")), '<input name="osmll" placeholder="48.3912, -1.1734" inputmode="decimal">', escA(t("trc.osm.whereHint")))}
      ${field(escA(t("trc.osm.sheet")), `<select name="osmsheet"><option value="210x297">A4 ${escA(t("trc.osm.portrait"))}</option><option value="297x210">A4 ${escA(t("trc.osm.landscape"))}</option><option value="297x420">A3 ${escA(t("trc.osm.portrait"))}</option><option value="420x297">A3 ${escA(t("trc.osm.landscape"))}</option></select>`)}</div>
      <p><button type="button" class="btn btn-sm" id="tr-osm-here">${escA(t("trc.osm.here"))}</button> <span class="tr-hint" id="tr-osm-msg"></span></p>
    </details>`,
  onOpen: (f, done) => {
    bindKind(f, races);
    const show = (html, bad = false) => { const p = f.querySelector("#tr-new-map"); p.innerHTML = html; p.classList.toggle("tr-bad", bad); };
    const take = async (list) => {
      if (list.some((x) => isPpenFile(x) || isOcnFile(x))) { handed = true; done(null); importEvent(main, list).then((id) => { if (!id) backToStart(); }); return; }   // the import
      const file = list.find(isMapFile);
      if (!file) { show(t("trc.page.notMap", { name: escA(list[0].name) }), true); return; }
      mapFile = file; vec = null;
      if (isVectorMap(file.name)) {
        show(t("trc.page.reading", { name: escA(file.name) }));
        // an OCAD file holding courses, dropped here with its map or alone: an import (its courses, on itself or on the map it names)
        for (const x of list) if (/\.ocd$/i.test(x.name) && await ocadCourses(x)) { handed = true; done(null); importEvent(main, list).then((id) => { if (!id) backToStart(); }); return; }
        const r = await openVectorFile(file);
        if (mapFile !== file) return;                        // another file chosen meanwhile
        if (!r.src) { mapFile = null; show(escA(mapError(r.err)), true); return; }
        vec = r.src;
        f.elements.scale.value = String(vec.scale);
        show(t("trc.page.mapOk", { name: escA(file.name), info: escA(vectorLabel(vec)) }));
        return;
      }
      show(t("trc.page.mapOk", { name: escA(file.name), info: escA(`${isPdf(file.name, file.type) ? "PDF" : t("trc.page.image")}, ${fmtMb(file.size)}`) }));
      if (!isPdf(file.name, file.type)) { const dpi = imageDpi(await file.arrayBuffer()); if (dpi && !f.elements.dpi.value) f.elements.dpi.value = String(dpi); }
    };
    dropZone(f.querySelector("#tr-new-drop"), take);
    if (files?.length) take(files);
    // no map: the event set on OpenStreetMap, at a place typed or the device's
    f.querySelector("#tr-osm-here").addEventListener("click", () => {
      const msg = f.querySelector("#tr-osm-msg");
      if (!navigator.geolocation) { msg.textContent = t("trc.osm.noGps"); return; }
      msg.textContent = t("trc.osm.locating");
      navigator.geolocation.getCurrentPosition((p) => { f.elements.osmll.value = `${p.coords.latitude.toFixed(5)}, ${p.coords.longitude.toFixed(5)}`; msg.textContent = ""; }, () => { msg.textContent = t("trc.osm.noGps"); }, { enableHighAccuracy: false, timeout: 15000 });
    });
  },
  validate: (o) => kindProblem(o) || (!mapFile && osmPlace(o.osmll) ? (!(Number(o.scale) > 100) ? t("trc.page.badScale") : null) : !mapFile && String(o.osmll || "").trim() ? t("trc.osm.badPlace") : !mapFile ? t("trc.page.needMap") : isVectorMap(mapFile.name) && !vec ? t("trc.page.mapReading") : !(Number(o.scale) > 100) ? t("trc.page.badScale")
    : !isPdf(mapFile.name, mapFile.type) && !vec && o.dpi && !(Number(o.dpi) > 10) ? t("trc.page.badDpi") : null) });
  if (!v) return handed ? "import" : null;               // a .ppen, .ozmt or .ocnt dropped here went on to the import
  // no map file: an event set on OpenStreetMap (owner, 2026-11-16) — a blank sheet at the scale chosen, georeferenced round the
  // place given, north up; OpenStreetMap shows under the courses and prints in the map's place (tracer/backdrop.js)
  if (!mapFile) {
    const [lat, lon] = osmPlace(v.osmll), [w, h] = String(v.osmsheet || "210x297").split("x").map(Number), scale = Number(v.scale), mPerMm = scale / 1000;
    const created0 = await createEvent(v, races);
    if (!created0) return null;
    const ev0 = M.newEvent({ title: created0.title, lang: lang(), standard: v.std, map: { kind: "none", scale, w, h } });
    if (v.std === "Spr2019") ev0.appearance.itemScaling = "RelativeTo15000";
    const p = (lat * Math.PI) / 180, mLat = 111132.92 - 559.82 * Math.cos(2 * p) + 1.175 * Math.cos(4 * p), mLon = 111412.84 * Math.cos(p) - 93.5 * Math.cos(3 * p);
    const kx = mLon / mPerMm, ky = mLat / mPerMm;         // map mm per degree east and north
    ev0.geo = { a: kx, b: 0, c: w / 2 - kx * lon, d: 0, e: ky, f: h / 2 - ky * lat };
    ev0.printBg = "osm";
    await S.saveEvent(created0.id, ev0, null, 0);
    history.replaceState(null, "", `#/orga-tracer?id=${created0.id}${inOwnTab() ? "&fen=1" : ""}`);
    openEvent(created0.id);
    return created0.id;
  }
  const bytes = vec?.bytes || new Uint8Array(await mapFile.arrayBuffer()), type = mimeOf(mapFile.name, mapFile.type);
  let err = null;
  const src = vec || await openMap(bytes, type, mapFile.name, Number(v.dpi) || 0).catch((e) => { err = e; return null; });
  if (!src) { alertBox(mapError(err)); return null; }
  const created = await createEvent(v, races);
  if (!created) return null;
  const dpi = src.kind === "bitmap" ? src.dpi || 300 : 0;
  const ev = M.newEvent({ title: created.title, lang: lang(), standard: v.std, map: { kind: src.kind === "vector" ? "ocad" : src.kind, file: mapFile.name, scale: Number(v.scale), dpi,
    w: src.kind === "bitmap" ? (src.pxW * 25.4) / dpi : src.w, h: src.kind === "bitmap" ? (src.pxH * 25.4) / dpi : src.h, ox: src.ox, oy: src.oy } });
  if (v.std === "Spr2019") ev.appearance.itemScaling = "RelativeTo15000";
  if (src.world) { const g = geoFromWorld(ev, src.world.wf, null, src.pxW, src.pxH, src.world.crs); if (g) ev.geo = g; }   // a GeoTIFF
  if (src.geoInfo) ev.geo = src.geoInfo.geo;                 // an OCAD or Mapper map's own
  await S.saveMap(created.id, bytes, type, null);
  await S.api(`/${created.id}`, { method: "PUT", body: { map: { name: mapFile.name, type, size: bytes.length } } });
  await S.saveEvent(created.id, ev, null, 0);
  history.replaceState(null, "", `#/orga-tracer?id=${created.id}${inOwnTab() ? "&fen=1" : ""}`);
  openEvent(created.id);
  return created.id;
}

// ---- an imported event: an Ozimut file (.ozmt or .ocnt, which holds its map), or a Purple Pen file (.ppen) and its map, dropped together or one after the other
async function importEvent(main, files = []) {
  const races = await clubRaces();
  const st = { ppen: null, ocn: null, ocad: null, iof: false, ev: null, map: null, mapFromOcn: false, notes: [] };
  const v = await modal({ title: t("trc.page.importEvent"), wide: true, ok: t("trc.page.import"), body: `
    <p>${t("trc.page.importBody")}</p>
    ${dropHtml("tr-imp-drop", t("trc.page.importDrop"), `${OCN_ACCEPT},.ppen,.xml,${MAP_ACCEPT}`)}
    <ul class="tr-files" id="tr-imp-files"></ul>
    ${privField()}
    <h3>${escA(t("trc.page.theEvent"))}</h3>
    ${kindFields(races)}`,
  onOpen: (f) => {
    bindKind(f, races);
    const render = () => {
      const ev = st.ev, expected = ev?.map?.file || "", ocad = /\.(ocd|omap|xmap)$/i.test(expected) || ev?.map?.kind === "ocad";
      const lines = [];
      // the event file's line: its name, title, courses and controls, and its map
      const fileVars = (name, inside) => ({ name: escA(name), title: escA(ev.title || t("trc.page.untitled")),
        courses: tn("trc.page.nCourses", Object.keys(ev.courses).length), controls: tn("trc.page.nControls", Object.values(ev.controls).filter((c) => c.kind === "normal").length),
        map: `${expected ? t("trc.page.itsMap", { file: escA(expected), scale: ev.map.scale }) : ""}${inside ? t("trc.page.mapInside") : ""}` });
      if (st.ocn && ev) lines.push(`<li class="ok">${t("trc.page.ocnLine", fileVars(st.ocn.name, st.mapFromOcn))}</li>`);
      else if (st.ocad && ev) {
        const self = st.ocad.self && st.map === st.ppen;
        lines.push(`<li class="ok">${t("trc.page.ocadLine", { ...fileVars(st.ppen.name, self), map: self ? t("trc.page.mapInside") : expected ? t("trc.page.itsMap", { file: escA(expected), scale: ev.map.scale }) : "" })}</li>`);
        if (st.ocad.logos) lines.push(`<li class="ok">${tn("trc.page.ocadLogos", st.ocad.logos)}</li>`);
        if (st.ocad.forked.length) lines.push(`<li class="warn">${t("trc.page.ocadForked", { list: escA(st.ocad.forked.join(", ")) })}</li>`);
      }
      else if (st.ppen && ev) lines.push(`<li class="ok">${t("trc.page.ppenLine", fileVars(st.ppen.name, false))}</li>`);
      else lines.push(`<li class="todo">${escA(t("trc.page.fileTodo"))}</li>`);
      if (st.map && (st.mapFromOcn || (st.ocad && st.map === st.ppen))) { /* the file's own map: said on its line */ }
      else if (st.map && st.ocad && !expected) lines.push(`<li class="ok">${t("trc.page.mapLine", { name: escA(st.map.name), info: escA(`${isVectorMap(st.map.name) ? t("trc.page.ocadOrMapper") : isPdf(st.map.name, st.map.type) ? "PDF" : t("trc.page.image")}, ${fmtMb(st.map.size)}`) })}</li>`);
      else if (st.map) {
        const vec = isVectorMap(st.map.name), same = !expected || baseName(expected) === baseName(st.map.name);
        lines.push(`<li class="ok">${t("trc.page.mapLine", { name: escA(st.map.name), info: escA(`${vec ? t("trc.page.ocadOrMapper") : isPdf(st.map.name, st.map.type) ? "PDF" : t("trc.page.image")}, ${fmtMb(st.map.size)}`) })}</li>`);
        if (vec && ocad && !same) lines.push(`<li class="ok">${t(st.ocad ? "trc.page.ocadOtherMap" : "trc.page.otherVersion", { file: escA(expected) })}</li>`);
        else if (!same || (vec && !ocad && ev)) lines.push(`<li class="warn">${t(st.ocad ? "trc.page.ocadNotMap" : "trc.page.notPpenMap", { file: escA(expected) })}</li>`);
      } else lines.push(`<li class="todo">${st.ocad && expected ? t("trc.page.mapTodoOcadCs", { file: escA(expected) }) : ocad ? t("trc.page.mapTodoOcad", { file: escA(expected) }) : expected ? t("trc.page.mapTodoFile", { file: escA(expected) }) : escA(t("trc.page.mapTodo"))}</li>`);
      for (const n of st.notes) lines.push(`<li class="bad">${n}</li>`);
      f.querySelector("#tr-imp-files").innerHTML = lines.join("");
    };
    const take = async (list) => {
      st.notes = [];
      for (const file of list) {
        if (isOcnFile(file)) {
          try {
            const r = await readOcn(await file.arrayBuffer());
            st.ev = r.ev; st.ocn = file; st.ppen = null; st.ocad = null;
            if (r.map) { st.map = new File([r.map.bytes], r.map.name, { type: r.map.type || mimeOf(r.map.name, "") }); st.mapFromOcn = true; }
            st.extra = r.extra || []; st.dem = r.dem || null;
            if (f.elements.title && !f.elements.title.value) f.elements.title.value = st.ev.title || "";
          } catch (e) { st.notes.push(t("trc.page.fileErr", { name: escA(file.name), err: escA(e.message) })); }
        } else if (isPpenFile(file)) {
          const text = await file.text();
          try { st.ev = readPpen(text); st.ppen = file; st.ocn = null; st.ocad = null; st.iof = false; if (st.mapFromOcn) { st.map = null; st.mapFromOcn = false; } if (f.elements.title && !f.elements.title.value) f.elements.title.value = st.ev.title || ""; }
          catch (e) {
            // an IOF XML CourseData (Condes, OCAD, MeOS…): the advanced level's import, every account's since 2026-11-08
            const iof = /\.xml$/i.test(file.name) ? await import("../tracer/iofin.js") : null;
            const kind = iof?.iofKind(text);
            if (kind === "coursedata3" || kind === "coursedata2") {
              const data = iof.readIof(text), ev = M.newEvent({ lang: lang(), map: { kind: "none", scale: data.scale || 10000 } });
              ev.title = file.name.replace(/\.xml$/i, "");
              iof.importInto(ev, data, { fileMm: false });
              st.ev = ev; st.ppen = file; st.ocn = null; st.ocad = null; st.iof = true; if (st.mapFromOcn) { st.map = null; st.mapFromOcn = false; }
              if (f.elements.title && !f.elements.title.value) f.elements.title.value = ev.title;
            } else st.notes.push(t("trc.page.badPpen", { name: escA(file.name) }));
          }
        } else if (isMapFile(file)) {
          // an OCAD course-setting file: the event (its courses), and its own map when it holds one
          const oc = /\.ocd$/i.test(file.name) ? await ocadCourses(file) : null;
          if (oc) {
            const wasSelf = st.ocad?.self && st.map === st.ppen;
            st.ev = oc.ev; st.ppen = file; st.ocad = oc; st.ocn = null; st.iof = true;
            if (st.mapFromOcn || wasSelf) { st.map = null; st.mapFromOcn = false; }
            if (oc.self) st.map = file;
            if (f.elements.title && !f.elements.title.value) f.elements.title.value = oc.ev.title;
          } else { st.map = file; st.mapFromOcn = false; }
        }
        else st.notes.push(t("trc.page.badFile", { name: escA(file.name) }));
      }
      render();
    };
    dropZone(f.querySelector("#tr-imp-drop"), take);
    render();
    if (files?.length) take(files);
  },
  validate: (o) => (!st.ev ? t("trc.page.needFile") : !st.map ? t("trc.page.needImpMap") : kindProblem(o)) });
  if (!v) return null;
  const ev = st.ev, file = st.map, bytes = new Uint8Array(await file.arrayBuffer()), type = mimeOf(file.name, file.type);
  // an Ozimut file on its own map (inside it, or the same file): the event as it was, in its own frame — nothing to align
  if (st.ocn && (st.mapFromOcn || baseName(file.name) === baseName(ev.map.file))) {
    let err0 = null;
    const src = await openMap(bytes, type, file.name, ev.map.dpi || 0, ev.map.kind === "ocad" ? ev.map : null).catch((e) => { err0 = e; return null; });
    if (!src) { alertBox(mapError(err0)); return null; }
    const created = await createEvent(v, races);
    if (!created) return null;
    ev.map.file = file.name;
    if (src.kind === "vector" && ev.map.kind === "ocad") { ev.map.w = src.w; ev.map.h = src.h; }
    if (!ev.title) ev.title = created.title;
    await S.saveMap(created.id, bytes, type, null);
    for (const m of st.extra || []) await S.saveExtraMap(created.id, m.id, m.bytes, m.type || mimeOf(m.name, ""), null).catch(() => null);
    if (st.dem) await S.saveDem(created.id, st.dem, null).catch(() => null);          // the file's elevation model (relief.js)
    await S.api(`/${created.id}`, { method: "PUT", body: { map: { name: file.name, type, size: bytes.length } } });
    await S.saveEvent(created.id, ev, null, 0);
    history.replaceState(null, "", `#/orga-tracer?id=${created.id}${inOwnTab() ? "&fen=1" : ""}`);
    openEvent(created.id);
    return created.id;
  }
  // another file than the .ppen's own (an OCAD map's PDF or image, a scan): the controls are aligned on it once opened; an OCAD or
  // Mapper map for a .ppen made on one keeps the controls' coordinates (Purple Pen keeps the map file's own millimetres)
  // an IOF XML's positions: the map file's own mm on an OCAD or Mapper map (as OCAD, Condes and Purple Pen write them), the
  // sheet's from its bottom left otherwise
  const vector = isVectorMap(file.name, bytes), ppenOcad = st.iof ? vector : ev.map.kind === "ocad" || /\.(ocd|omap|xmap)$/i.test(ev.map.file || "");
  // an Ozimut file on another map than its own: aligned like a .ppen on another map (its coordinates are its own frame's)
  const differs = st.ocn ? true : vector ? !ppenOcad : ppenOcad || (!!ev.map.file && baseName(ev.map.file) !== baseName(file.name));
  let err = null;
  const src = await openMap(bytes, type, file.name, ev.map.dpi || 0).catch((e) => { err = e; return null; });
  if (!src) { alertBox(mapError(err)); return null; }
  const created = await createEvent(v, races);
  if (!created) return null;
  if (src.kind === "bitmap") {
    const dpi = ev.map.kind === "bitmap" && ev.map.dpi ? ev.map.dpi : src.dpi || 300;
    Object.assign(ev.map, { kind: "bitmap", file: file.name, dpi, w: (src.pxW * 25.4) / dpi, h: (src.pxH * 25.4) / dpi });
  } else if (src.kind === "vector") {
    Object.assign(ev.map, { kind: "ocad", file: file.name, dpi: 0, w: src.w, h: src.h, ox: src.ox, oy: src.oy, scale: ev.map.scale || src.scale });
    if (!differs) M.transformAll(ev, [1, 0, 0, 1, -src.ox, -src.oy]);
    if (!ev.geo) { const g = await (await import("../tracer/vmap/georef.js")).geoFromVector(src.vmap, src).catch(() => null); if (g) ev.geo = g.geo; }
  } else Object.assign(ev.map, { kind: "pdf", file: file.name, dpi: 0, w: src.w, h: src.h });
  if (!ev.title) ev.title = created.title;
  if (src.world && !ev.geo) { const g = geoFromWorld(ev, src.world.wf, null, src.pxW, src.pxH, src.world.crs); if (g) ev.geo = g; }
  if (differs) centreOnMap(ev);                              // most controls off the sheet: a first guess, the course on the map's middle
  await S.saveMap(created.id, bytes, type, null);
  await S.api(`/${created.id}`, { method: "PUT", body: { map: { name: file.name, type, size: bytes.length } } });
  await S.saveEvent(created.id, ev, null, 0);
  history.replaceState(null, "", `#/orga-tracer?id=${created.id}${inOwnTab() ? "&fen=1" : ""}`);
  openEvent(created.id, { align: differs });
  return created.id;
}

const mapError = (e) => (e?.message && e.message !== "map" ? t("trc.page.mapErr", { err: e.message }) : t("trc.page.mapErr0"));
/** The event as kept on this device, opened without the network (offline.js); false when there is none. */
async function openLocal(id, onClose) {
  const card = (await OFF.keptEvents().catch(() => [])).find((x) => x.id === id);
  if (!card) return false;
  let key = card.encrypted ? await S.keyFor(id) : null;
  if (card.encrypted && !key) {
    const v = await modal({ title: t("trc.page.encrypted"), ok: t("trc.page.open"), body: field(escA(t("trc.page.passphrase")), '<input name="p" type="password" autocomplete="current-password">'),
      validate: async (o) => ((await S.unlock(id, card.encrypted, o.p)) ? null : t("trc.page.badPass")) });
    if (!v) return true;
    key = await S.keyFor(id);
  }
  const rec = await OFF.localEvent(id, key);
  if (!rec || rec.locked) return false;
  const mapSrc = rec.map?.bytes ? await openMap(rec.map.bytes, rec.map.type || rec.meta.map?.type || "", rec.meta.map?.name || rec.ev.map.file, rec.ev.map.dpi, rec.ev.map.kind === "ocad" ? rec.ev.map : null).catch(() => null) : null;
  if (mapSrc && rec.ev.map.kind === "bitmap" && rec.ev.map.dpi) mapSrc.dpi = rec.ev.map.dpi;
  const { openEditor } = await import("../tracer/editor.js");
  if (leaving) return true;
  await closeEditor();
  pageMain.innerHTML = "";
  await openEditor({ container: pageMain, meta: rec.meta, role: rec.role, you: rec.you, ev: rec.ev, version: rec.baseVersion, mapSrc, key, readOnly: rec.role === "viewer", offline: true, dem: rec.dem || null, onClose, onStart });
  return true;
}
function alertBox(text) { return modal({ title: t("trc.page.title"), body: `<p>${escA(text)}</p>`, cancel: null }); }

// ---- opening ----------------------------------------------------------------------------------------------------------------
/** An invitation link (« Équipe et partage »): join the event's team, then the address keeps only the event. */
async function joinByInvite(id, token) {
  try {
    const r = await S.api(`/${id}/join`, { method: "POST", body: { token } });
    if (r?.joined) toastJoin(t("trc.page.joined"));
  } catch (e) {
    await alertBox(e.status === 410 ? t("trc.page.inviteGone") : e.status === 403 ? t("trc.page.inviteDemo") : t("trc.page.openErr", { err: e.code || e.message }));
  }
  history.replaceState(null, "", `${listHash()}${listHash().includes("?") ? "&" : "?"}id=${encodeURIComponent(id)}`);
}
const toastJoin = (text) => { const n = document.createElement("div"); n.className = "tr-loading"; n.innerHTML = `<p>${escA(text)}</p>`; document.body.appendChild(n); setTimeout(() => n.remove(), 2200); };

async function openEvent(id, { align = false } = {}) {
  const loading = document.createElement("div");
  loading.className = "tr-loading"; loading.innerHTML = `<div class="spinner"></div><p>${escA(t("trc.page.opening"))}</p>`;
  document.body.appendChild(loading);
  let info;
  try { info = await S.api(`/${id}`); }
  catch (e) {
    // no network: the copy kept on this device, if any (offline.js)
    if (!e.status) { loading.remove(); if (await openLocal(id, onClose)) return; }
    loading.remove();
    history.replaceState(null, "", listHash());
    await alertBox(e.status === 403 ? t("trc.page.notTeam") : e.status === 404 ? t("trc.page.notFound") : !e.status ? t("trc.page.noNetwork") : t("trc.page.openErr", { err: e.code || e.message }));
    backToStart();
    return;
  }
  try {
    let key = null;
    if (info.event.encrypted) {
      key = await S.keyFor(id);
      if (!key) {
        loading.remove();
        const v = await modal({ title: t("trc.page.encrypted"), ok: t("trc.page.open"), body: field(escA(t("trc.page.passphrase")), '<input name="p" type="password" autocomplete="current-password">'),
          validate: async (o) => ((await S.unlock(id, info.event.encrypted, o.p)) ? null : t("trc.page.badPass")) });
        if (!v) { history.replaceState(null, "", listHash()); backToStart(); return; }
        key = await S.keyFor(id);
        document.body.appendChild(loading);
      }
    }
    const [evR, mapR] = await Promise.all([S.loadJson(id, "event", key), S.loadMap(id, key)]);
    let ev = evR?.data || M.newEvent({ title: info.event.title, lang: lang() }), dirty = false;
    // changes made offline and not sent yet: sent now — or, if the team saved meanwhile, the user chooses
    const pend = await OFF.pendingOf(id, key).catch(() => null);
    if (pend) {
      if (pend.baseVersion === (evR?.version || 0)) { ev = pend.ev; dirty = true; }
      else {
        loading.remove();
        const v = await modal({ title: t("trc.page.pendTitle"), ok: t("trc.page.continue"), body: `<p>${escA(t("trc.page.pendBody", { date: new Date(pend.at).toLocaleString(locale(), { dateStyle: "short", timeStyle: "short" }) }))}</p>
          <label class="tr-check"><input type="radio" name="w" value="mine" checked> ${escA(t("trc.page.pendMine"))}</label>
          <label class="tr-check"><input type="radio" name="w" value="team"> ${escA(t("trc.page.pendTeam"))}</label>`, cancel: null });
        document.body.appendChild(loading);
        if (v?.w === "team") await OFF.clearPending(id);
        else { await S.saveVersion(id, ev, key, t("trc.page.pendVersion"), "").catch(() => {}); ev = pend.ev; dirty = true; }
      }
    }
    const mapType = info.event.map?.type || mapR?.type || "";
    const mapSrc = mapR ? await openMap(mapR.bytes, mapType, info.event.map?.name || ev.map.file, ev.map.dpi, ev.map.kind === "ocad" ? ev.map : null).catch(() => null) : null;
    if (mapSrc && ev.map.kind === "bitmap" && ev.map.dpi) { mapSrc.dpi = ev.map.dpi; }
    loading.remove();
    const { openEditor } = await import("../tracer/editor.js");
    if (leaving) return;                                  // the user went to another page meanwhile
    await closeEditor();
    if (leaving) return;
    pageMain.innerHTML = "";
    await openEditor({ container: pageMain, meta: info.event, role: info.role, you: info.you, ev, version: evR?.version || 0, mapSrc, key, readOnly: info.role === "viewer", lent: !!info.lent, align, dirty,
      lockHolder: info.lock, onClose, onStart });
  } catch (e) {
    loading.remove();
    history.replaceState(null, "", listHash());
    await alertBox(e.status === 403 ? t("trc.page.notTeam") : e.status === 404 ? t("trc.page.notFound") : t("trc.page.openErr", { err: e.code || e.message }));
    backToStart();
  }
}
