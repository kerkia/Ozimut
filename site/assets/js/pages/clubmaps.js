// « Mon club › Cartes » (docs/clubs/design.md §2; drawn by pages/monclub.js: render(panel, org, me)): the club's map library — its
// maps as cards (thumbnail, name, place, scale, year, state, embargo), a map's page (its card, versions, the rights written down,
// the embargo, the events using it, the files to download or the map to use, by right), « Ajouter une carte » (the files read in
// the browser as « Mes cartes » reads them: the viewing copy and thumbnail made here, the place from the georeference) or a
// Cartographier document linked, and a folder of maps imported at once (trace/mymapsimport.js `plan`). A map shared by a link
// opens with sharedPage(main, token) (#/monclub?carte=<token>). The server: functions/api/orgmaps/[[path]].js.

import { html, raw, $, $$, fmt, fmtDate } from "../util.js";
import { t, tn, loadArea } from "../i18n.js";
import * as country from "../country.js";
import { confirmBox, alertBox } from "../askbox.js";
import * as offers from "../offers.js";
import { replaceQuery } from "../app.js";

const STATES = ["current", "revising", "outdated"];
const STANDARDS = ["ISOM2017-2", "ISSprOM2019-2", "ISMTBOM2022", "ISSkiOM2019", "ISOM2000"];
const WRITTEN = ["tracer", "analyses", "pixel", "thumb"];
const LEVELS = ["list", "thumb", "view", "use", "download"];
const MAP_EXT = /\.(jpe?g|png|webp|gif|bmp|tiff?|pdf|kmz|ocd|omap|xmap)$/i;
const SIDE = /\.(jgw|pgw|tfw|gfw|bpw|wld|jpgw|pngw|tifw|wf|prj)$/i;
const ACCEPT = ".ocd,.omap,.xmap,.pdf,.kmz,.jpg,.jpeg,.png,.webp,.gif,.bmp,.tif,.tiff,.jgw,.pgw,.tfw,.gfw,.wld,.prj,image/*,application/pdf";

async function api(path, { method = "GET", body, raw: bytes, type } = {}) {
  const r = await fetch(`api/${path}`, { method, credentials: "same-origin", cache: "no-store",
    headers: bytes ? { "Content-Type": type || bytes.type || "application/octet-stream" } : body ? { "Content-Type": "application/json" } : {},
    body: bytes || (body ? JSON.stringify(body) : undefined) });
  const j = await r.json().catch(() => ({}));
  if (r.status === 401) window.dispatchEvent(new Event("cnx:unauthorised"));
  if (!r.ok) throw Object.assign(new Error(j.error || String(r.status)), { code: j.error || String(r.status), status: r.status, data: j });
  return j;
}
const errText = (e) => { const k = `om.err.${String(e?.code || e?.message || "").replace(/\s+/g, "_")}`; return t(k) !== k ? t(k) : t("om.err.other"); };
const mb = (n) => t("om.mb", { n: fmt((n || 0) / 1048576, 1) });
const base = (org, id) => `api/orgmaps/${org}/maps/${id}`;
const stamp = (m) => encodeURIComponent(m.updated || "");
const queryOf = () => Object.fromEntries(new URLSearchParams((location.hash.split("?")[1] || "")));
let FR = null;
const france = async () => FR || (FR = await (await import("../trace/mymapsplace.js")).france());

/** Where a map is: its département (France: « 01 Ain »), its region, its country. */
function placeText(m) {
  const dept = m.country === "FR" && FR ? (FR.depts.find((d) => d.code === m.dept) ? `${m.dept} ${FR.depts.find((d) => d.code === m.dept).name}` : m.dept) : m.dept;
  return [dept, m.region && m.region !== dept ? m.region : "", m.country ? country.name(m.country) : ""].filter(Boolean).join(" · ");
}
const scaleText = (m) => (m.scale ? `1:${fmt(m.scale)}` : "");
const yearText = (m) => m.revised || m.surveyed || "";
const thumbOf = (org, m, cls = "om-thumb") => (m.may?.thumb && !m.hidden
  ? html`<span class="${cls}"><img loading="lazy" alt="" src="${base(org, m.id)}/thumb?u=${stamp(m)}" onerror="this.parentNode.classList.add('om-none');this.remove()"></span>`
  : html`<span class="${cls} om-none"></span>`);
const embargoTag = (m) => (m.embargo?.until && (m.embargo.on !== false) ? html`<span class="tag om-embargo">${t("om.embargo.until", { d: fmtDate(m.embargo.until) })}</span>` : "");
const stateTag = (m) => (m.state && m.state !== "current" ? html`<span class="tag om-state-${m.state}">${t(`om.state.${m.state}`)}</span>` : "");

// ---- the library ------------------------------------------------------------------------------------------------------------
export async function render(panel, org, me) {
  await loadArea("orgmaps");
  panel.innerHTML = html`<div class="boot"><div class="spinner"></div></div>`;
  let L;
  try { L = await api(`orgmaps/${org.id}`); }
  catch (e) { panel.innerHTML = html`<div class="notice">${e.status === 503 ? t("om.notReady") : errText(e)}</div>`; return; }
  if (!L.member) { panel.innerHTML = html`<div class="notice info">${t("om.notMember")}</div>`; return; }
  france().catch(() => null);
  const q = queryOf();
  if (q.om && L.maps.some((m) => String(m.id) === String(q.om))) return mapPage(panel, org, Number(q.om), () => render(panel, org, me));
  const st = { state: "", q: "" };
  panel.innerHTML = html`<section class="card"><div class="card-head"><div><h2>${t("om.title")}</h2><div class="hint">${t("om.hint")}</div></div>
      ${L.may.add ? html`<div class="row" style="gap:6px"><button type="button" class="btn btn-sm btn-primary" id="om-add">${t("om.add")}</button>
        <label class="btn btn-sm">${t("om.folder")}<input type="file" id="om-folder" webkitdirectory multiple hidden></label></div>` : ""}</div>
    <div class="card-body stack" style="gap:10px">
      ${L.quota ? html`<div class="om-quota"><progress max="${L.quota.limit}" value="${L.quota.used}"></progress><span class="muted">${t("om.quota", { used: mb(L.quota.used), limit: mb(L.quota.limit) })}</span></div>` : ""}
      ${L.maps.length ? html`<div class="filters om-filters">
        <label class="field"><span>${t("om.f.state")}</span><select id="om-fstate"><option value="">${t("om.f.all")}</option>${STATES.map((s) => html`<option value="${s}">${t(`om.state.${s}`)}</option>`)}</select></label>
        <label class="field" style="flex:1 1 220px"><span>${t("om.f.search")}</span><input type="search" id="om-fq" autocomplete="off"></label></div>` : ""}
      <div id="om-work"></div>
      <div id="om-grid"></div></div></section>`;
  const grid = $("#om-grid", panel);
  const draw = () => {
    const f = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
    const shown = L.maps.filter((m) => (!st.state || m.state === st.state) && (!st.q || f([m.name, m.region, m.dept, m.mappers].join(" ")).includes(f(st.q))));
    grid.innerHTML = !L.maps.length ? html`<div class="empty">${t(L.may.add ? "om.none.add" : "om.none")}</div>`
      : !shown.length ? html`<div class="empty">${t("om.none.filter")}</div>`
      : html`<div class="om-grid">${shown.map((m) => html`<button type="button" class="om-card" data-om="${m.id}">${thumbOf(org.id, m)}
          <b>${m.name}</b>
          ${m.hidden ? html`<span class="muted">${t("om.embargo.hidden")}</span>` : html`<span class="muted">${placeText(m) || "—"}</span>
          <span class="muted">${[scaleText(m), yearText(m), m.carto ? t("om.carto.tag") : ""].filter(Boolean).join(" · ")}</span>`}
          <span class="om-tags">${stateTag(m)}${embargoTag(m)}</span></button>`)}</div>`;
    $$("[data-om]", grid).forEach((b) => b.addEventListener("click", () => {
      const m = L.maps.find((x) => String(x.id) === b.dataset.om);
      if (m?.hidden) { alertBox(t("om.embargo.closed", { d: fmtDate(m.embargo.until) })); return; }
      replaceQuery({ ...queryOf(), om: b.dataset.om });
      mapPage(panel, org, Number(b.dataset.om), () => render(panel, org, me));
    }));
  };
  draw();
  france().then(draw).catch(() => {});
  $("#om-fstate", panel)?.addEventListener("change", (e) => { st.state = e.target.value; draw(); });
  $("#om-fq", panel)?.addEventListener("input", (e) => { st.q = e.target.value.trim(); draw(); });
  $("#om-add", panel)?.addEventListener("click", () => addForm($("#om-work", panel), org, () => render(panel, org, me)));
  $("#om-folder", panel)?.addEventListener("change", (e) => { folderImport($("#om-work", panel), org, [...e.target.files], () => render(panel, org, me)); e.target.value = ""; });
}

// ---- reading a map's files, as « Mes cartes » does ------------------------------------------------------------------------------
/** The main file, its georeference's companions, the rendered image and georeference: { main, image, geo, blob, title }. */
async function readFiles(files) {
  const main = files.find((f) => MAP_EXT.test(f.name));
  if (!main) throw Object.assign(new Error("nomap"), { code: "nomap" });
  const world = files.find((f) => SIDE.test(f.name) && !/\.prj$/i.test(f.name)), prj = files.find((f) => /\.prj$/i.test(f.name));
  const MI = await import("../trace/mymapsimport.js");
  let entries;
  try { entries = await MI.readMap(main, { world, prj }); } catch (e) { throw Object.assign(new Error("read"), { code: "read" }); }
  const e = entries[0];
  return { main, image: e.image, geo: e.geo || null, blob: e.blob, title: e.title || main.name.replace(/\.[^.]+$/, "") };
}
/** [lat, lon] of the image's centre, from its georeference (lon, lat → px). */
function centre(g, w, h) {
  if (!g) return null;
  const det = g.a * g.e - g.b * g.d, x = w / 2 - g.c, y = h / 2 - g.f;
  if (!det) return null;
  const lat = (g.a * y - g.d * x) / det, lon = (g.e * x - g.b * y) / det;
  return Math.abs(lat) <= 90 && Math.abs(lon) <= 180 ? [lat, lon] : null;
}
/** The place a georeference gives: { lat, lon, country, region, dept } (France's from its outlines). */
async function placeOf(read) {
  const c = centre(read.geo, read.image.width, read.image.height);
  if (!c) return {};
  const out = { lat: c[0], lon: c[1] };
  try { const MP = await import("../trace/mymapsplace.js"); const h = MP.frAt(await france(), c[0], c[1]); if (h) Object.assign(out, { country: "FR", dept: h.dept, region: h.region }); } catch (e) { /* none */ }
  return out;
}
/** The viewing copy and thumbnail made and sent. */
async function sendPictures(org, id, read) {
  const MM = await import("../trace/mymaps.js");
  const v = (await MM.viewCopy(read.image).catch(() => null)) || (/^image\/(jpeg|webp|png)$/.test(read.blob?.type || "") ? read.blob : null);
  if (v) await api(`orgmaps/${org}/maps/${id}/view`, { method: "PUT", raw: v, type: v.type }).catch(() => null);
  const th = await MM.thumbnail(read.image).catch(() => null);
  if (th) await api(`orgmaps/${org}/maps/${id}/thumb`, { method: "PUT", raw: th, type: th.type }).catch(() => null);
}
/**
 * A map linked to a Cartographier document: the document written as an OCAD file in this browser (orgmapuse.js cartoFile), read
 * as any map file, its viewing copy and thumbnail sent; its georeference and place kept when the card has none (`card`: the
 * card's fields as they are). Returns the file.
 */
async function cartoPictures(org, m, say, card = m) {
  const { cartoFile } = await import("../orgmapuse.js");
  say?.(t("om.carto.converting"));
  const file = await cartoFile(org, m.id, m.name);
  const read = await readFiles([file]);
  say?.(t("om.pictures"));
  await sendPictures(org, m.id, read);
  if (read.geo) {
    const extra = await placeOf(read), patch = { geo: read.geo };
    if (card.lat == null && extra.lat != null) Object.assign(patch, { lat: extra.lat, lon: extra.lon });
    if (!card.country && extra.country) Object.assign(patch, { country: extra.country, region: card.region || extra.region || "", dept: card.dept || extra.dept || "" });
    await api(`orgmaps/${org}/maps/${m.id}`, { method: "PUT", body: patch }).catch(() => null);
  }
  return file;
}
/** A file handed to the browser to save. */
function save(file) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(file);
  a.download = file.name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 60e3);
}
/** The files sent to the map's current version, one by one. */
async function sendFiles(org, id, files, say) {
  const list = files.filter((f) => MAP_EXT.test(f.name) || SIDE.test(f.name));
  for (let i = 0; i < list.length; i++) {
    say?.(t("om.sending", { i: i + 1, n: list.length, name: list[i].name }));
    await api(`orgmaps/${org}/maps/${id}/files?name=${encodeURIComponent(list[i].name)}`, { method: "PUT", raw: list[i], type: list[i].type || "application/octet-stream" });
  }
}

// ---- the card's fields ---------------------------------------------------------------------------------------------------------
const opt = (v, cur, label) => html`<option value="${v}" ${raw(String(v) === String(cur ?? "") ? "selected" : "")}>${label}</option>`;
function cardFields(m = {}) {
  const countries = country.MEMBERS.map((c) => [c, country.name(c)]).sort((a, b) => a[1].localeCompare(b[1]));
  return html`<div class="om-fields">
    <label class="field om-wide"><span>${t("om.c.name")}</span><input name="name" maxlength="120" value="${m.name || ""}" required></label>
    <label class="field"><span>${t("om.c.country")}</span><select name="country"><option value="">—</option>${countries.map(([c, n]) => opt(c, m.country, n))}</select></label>
    <label class="field"><span>${t("om.c.region")}</span><input name="region" maxlength="120" value="${m.region || ""}"></label>
    <label class="field"><span>${t("om.c.dept")}</span><input name="dept" maxlength="120" value="${m.dept || ""}"></label>
    <label class="field"><span>${t("om.c.scale")}</span><input name="scale" inputmode="numeric" placeholder="10000" value="${m.scale || ""}"></label>
    <label class="field"><span>${t("om.c.standard")}</span><select name="standard"><option value="">—</option>${STANDARDS.map((s) => opt(s, m.standard, s))}</select></label>
    <label class="field"><span>${t("om.c.surveyed")}</span><input name="surveyed" inputmode="numeric" maxlength="4" value="${m.surveyed || ""}"></label>
    <label class="field"><span>${t("om.c.revised")}</span><input name="revised" inputmode="numeric" maxlength="4" value="${m.revised || ""}"></label>
    <label class="field"><span>${t("om.c.area")}</span><input name="area_km2" inputmode="decimal" value="${m.area_km2 ?? ""}"></label>
    <label class="field"><span>${t("om.c.state")}</span><select name="state">${STATES.map((s) => opt(s, m.state || "current", t(`om.state.${s}`)))}</select></label>
    <label class="field om-wide"><span>${t("om.c.mappers")}</span><input name="mappers" maxlength="300" value="${m.mappers || ""}"></label></div>`;
}
function readCard(box) {
  const v = (n) => $(`[name="${n}"]`, box)?.value?.trim() ?? "";
  const num = (s) => (s === "" ? null : Number(String(s).replace(",", ".")));
  return { name: v("name"), country: v("country"), region: v("region"), dept: v("dept"), scale: num(v("scale").replace(/\D/g, "")),
    standard: v("standard"), surveyed: v("surveyed"), revised: v("revised"), area_km2: num(v("area_km2")), state: v("state"), mappers: v("mappers") };
}
function fillCard(box, c) {
  for (const [k, v] of Object.entries(c)) { const el = $(`[name="${k}"]`, box); if (el && v != null && v !== "" && !el.value) el.value = String(v); }
}

// ---- « Ajouter une carte »: files, or a Cartographier document --------------------------------------------------------------------
function addForm(box, org, done) {
  let files = [], read = null, extra = {}, carto = "";
  box.innerHTML = html`<div class="card om-form"><div class="card-body stack" style="gap:10px">
    <h3 class="om-h3">${t("om.add.title")}</h3>
    <div class="chips" role="tablist"><button type="button" class="chip toggle" data-way="files" aria-pressed="true">${t("om.add.files")}</button>
      <button type="button" class="chip toggle" data-way="carto" aria-pressed="false">${t("om.add.carto")}</button></div>
    <div data-panel-way="files">
      <label class="dropzone om-drop" id="om-drop"><input type="file" id="om-in" multiple hidden accept="${ACCEPT}">
        <strong>${t("om.drop")}</strong><span class="muted">${t("om.drop.hint")}</span></label>
      <p class="muted" id="om-read"></p></div>
    <div data-panel-way="carto" hidden><label class="field"><span>${t("om.add.cartoPick")}</span><select id="om-carto"><option value="">…</option></select></label>
      <p class="muted">${t("om.add.cartoHint")}</p></div>
    ${cardFields()}
    <div class="row"><button type="button" class="btn btn-primary" id="om-save">${t("om.add.save")}</button>
      <button type="button" class="btn btn-sm" id="om-cancel">${t("om.cancel")}</button><span class="muted" id="om-note"></span></div></div></div>`;
  const note = (s) => { $("#om-note", box).textContent = s || ""; };
  let way = "files";
  $$("[data-way]", box).forEach((b) => b.addEventListener("click", async () => {
    way = b.dataset.way;
    $$("[data-way]", box).forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
    $$("[data-panel-way]", box).forEach((p) => { p.hidden = p.dataset.panelWay !== way; });
    if (way === "carto" && $("#om-carto", box).options.length < 2) {
      try {
        const { maps } = await api("mapper");
        $("#om-carto", box).innerHTML = html`<option value="">${maps.length ? "—" : t("om.add.cartoNone")}</option>${maps.map((m) => html`<option value="${m.id}" data-scale="${m.scale || ""}" data-std="${m.standard || ""}">${m.title}</option>`)}`;
      } catch (e) { note(errText(e)); }
    }
  }));
  $("#om-carto", box).addEventListener("change", (e) => {
    carto = e.target.value;
    const o = e.target.selectedOptions[0];
    if (carto) { $("[name=name]", box).value ||= o.textContent; fillCard(box, { scale: o.dataset.scale, standard: o.dataset.std }); }
  });
  const take = async (list) => {
    files = [...files.filter((f) => !list.some((x) => x.name === f.name)), ...list].slice(0, 12);
    $("#om-read", box).textContent = t("om.reading", { names: files.map((f) => f.name).join(", ") });
    try {
      read = await readFiles(files);
      extra = await placeOf(read);
      fillCard(box, { name: read.title, ...extra });
      $("#om-read", box).textContent = t("om.read.ok", { names: files.map((f) => f.name).join(", "), w: read.image.width, h: read.image.height })
        + (read.geo ? ` · ${t("om.read.geo")}` : ` · ${t("om.read.noGeo")}`);
    } catch (e) { read = null; $("#om-read", box).textContent = errText(e); }
  };
  bindDrop($("#om-drop", box), $("#om-in", box), take);
  $("#om-cancel", box).addEventListener("click", () => { box.innerHTML = ""; });
  $("#om-save", box).addEventListener("click", async (ev) => {
    const card = readCard(box);
    if (card.name.length < 2) return note(t("om.err.name"));
    if (way === "files" && !read) return note(t("om.err.nomap"));
    if (way === "carto" && !carto) return note(t("om.err.noCarto"));
    ev.target.disabled = true;
    try {
      note(t("om.saving"));
      const body = { ...card, ...(way === "carto" ? { carto_id: carto } : { lat: extra.lat, lon: extra.lon, geo: read.geo }) };
      const { map } = await api(`orgmaps/${org.id}/maps`, { method: "POST", body });
      if (way === "files") { await sendFiles(org.id, map.id, files, note); note(t("om.pictures")); await sendPictures(org.id, map.id, read); }
      else await cartoPictures(org.id, map, note, card).catch(() => null);   // its pictures and place, when the document can be read
      box.innerHTML = "";
      done();
    } catch (e) { if (!(await offers.refused(e))) note(errText(e)); ev.target.disabled = false; }
  });
}
function bindDrop(zone, input, take) {
  input.addEventListener("change", (e) => { const l = [...e.target.files]; e.target.value = ""; if (l.length) take(l); });
  zone.addEventListener("dragover", (e) => { e.preventDefault(); zone.classList.add("over"); });
  zone.addEventListener("dragleave", () => zone.classList.remove("over"));
  zone.addEventListener("drop", (e) => { e.preventDefault(); zone.classList.remove("over"); const l = [...e.dataTransfer.files]; if (l.length) take(l); });
}

// ---- a folder of maps, imported at once (« Mes cartes »' folder format: trace/mymapsimport.js plan) ---------------------------------
async function folderImport(box, org, list, done) {
  const MI = await import("../trace/mymapsimport.js");
  const fr = await france();
  await loadArea("mymaps").catch(() => {});             // the folder's errors are worded as « Mes cartes »' import words them
  const P = MI.plan(MI.filesOfInput(list), fr);
  box.innerHTML = html`<div class="card om-form"><div class="card-body stack" style="gap:8px">
    <h3 class="om-h3">${t("om.folder.title")}</h3>
    <p>${tn("om.folder.found", P.maps.length)}${P.errors.length ? ` · ${tn("om.folder.errors", P.errors.length)}` : ""}</p>
    ${P.errors.length ? html`<details><summary>${t("om.folder.why")}</summary><ul class="om-errs">${P.errors.slice(0, 50).map((x) => html`<li><code>${x.path}</code> — ${t(`mm.folder.err.${x.code}`, { name: x.arg || "" })}</li>`)}</ul></details>` : ""}
    <p class="muted">${t("om.folder.format")}</p>
    <div class="row"><button type="button" class="btn btn-primary" id="om-fgo" ${raw(P.maps.length ? "" : "disabled")}>${tn("om.folder.go", P.maps.length)}</button>
      <button type="button" class="btn btn-sm" id="om-fstop">${t("om.cancel")}</button><span class="muted" id="om-fnote"></span></div></div></div>`;
  let stop = false;
  $("#om-fstop", box).addEventListener("click", () => { stop = true; box.innerHTML = ""; });
  $("#om-fgo", box).addEventListener("click", async (ev) => {
    ev.target.disabled = true;
    const say = (s) => { const n = $("#om-fnote", box); if (n) n.textContent = s; };
    let added = 0, failed = 0;
    for (let i = 0; i < P.maps.length && !stop; i++) {
      const m = P.maps[i], files = [m.file, m.world, m.prj].filter(Boolean);
      say(t("om.folder.busy", { i: i + 1, n: P.maps.length, name: m.title }));
      try {
        const read = await readFiles(files), extra = await placeOf(read);
        const { map } = await api(`orgmaps/${org.id}/maps`, { method: "POST", body: { name: m.title, country: m.country || extra.country || "", region: m.region || extra.region || "",
          dept: m.dept || extra.dept || "", surveyed: m.year || (m.day || "").slice(0, 4), lat: extra.lat, lon: extra.lon, geo: read.geo } });
        await sendFiles(org.id, map.id, files);
        await sendPictures(org.id, map.id, read);
        added++;
      } catch (e) {
        failed++;
        if (e.code === "quota") { if (!(await offers.refused(e))) say(errText(e)); break; }
      }
    }
    say(t("om.folder.done", { added, failed }));
    setTimeout(done, 1500);
  });
}

// ---- a map's page -----------------------------------------------------------------------------------------------------------------
async function mapPage(panel, org, id, back) {
  panel.innerHTML = html`<div class="boot"><div class="spinner"></div></div>`;
  let D;
  try { D = await api(`orgmaps/${org.id}/maps/${id}`); }
  catch (e) { panel.innerHTML = html`<div class="notice">${errText(e)}</div>`; return; }
  await france().catch(() => null);
  const m = D.map, may = m.may || {};
  const leave = () => { const q = queryOf(); delete q.om; replaceQuery(q); back(); };
  if (m.hidden) { panel.innerHTML = html`<p><button type="button" class="btn btn-sm" id="om-back">${t("om.back")}</button></p><div class="notice">${t("om.embargo.closed", { d: fmtDate(m.embargo.until) })}</div>`; $("#om-back", panel).addEventListener("click", leave); return; }
  const files = m.files || [];
  const dl = (v, f) => html`<a class="btn btn-sm" href="${base(org.id, m.id)}/file/${encodeURIComponent(f.name)}${v ? `?v=${v}` : ""}" download="${f.name}">${t("om.download")}</a>`;
  const fileList = (list, v = 0) => html`<ul class="om-files">${list.map((f) => html`<li><span>${f.name} <span class="muted">${mb(f.size)}</span></span>${may.download ? dl(v, f) : ""}</li>`)}</ul>`;
  const toolName = (k) => t(`om.use.${k}`);
  const uses = D.uses || [];
  panel.innerHTML = html`<p><button type="button" class="btn btn-sm" id="om-back">${t("om.back")}</button></p>
    <section class="card"><div class="card-head"><div><h2>${m.name}</h2>
      <div class="lede meta"><span>${placeText(m) || "—"}</span>${scaleText(m) ? html`<span>${scaleText(m)}</span>` : ""}${m.standard ? html`<span>${m.standard}</span>` : ""}
        <span>${t("om.version", { v: m.version })}</span></div></div>
      <span class="om-tags">${stateTag(m)}${embargoTag(m)}</span></div>
    <div class="card-body om-page">
      <div class="om-view">${m.carto && !may.view ? html`<div class="empty">${t("om.carto.is")}</div>`
        : may.view ? html`<a href="${base(org.id, m.id)}/view?u=${stamp(m)}" target="_blank" rel="noopener"><img alt="${m.name}" src="${base(org.id, m.id)}/view?u=${stamp(m)}" onerror="this.closest('.om-view').classList.add('om-none');this.remove()"></a>`
        : may.thumb ? html`<img alt="${m.name}" src="${base(org.id, m.id)}/thumb?u=${stamp(m)}">` : html`<div class="empty">${t("om.noView")}</div>`}</div>
      <div class="stack om-side" style="gap:12px">
        <dl class="om-dl">
          ${[["om.c.surveyed", m.surveyed], ["om.c.revised", m.revised], ["om.c.mappers", m.mappers], ["om.c.area", m.area_km2 != null ? t("om.km2", { n: fmt(m.area_km2, 2) }) : ""],
            ["om.c.state", t(`om.state.${m.state || "current"}`)], ["om.c.added", [D.by, m.created ? fmtDate(m.created.slice(0, 10)) : ""].filter(Boolean).join(", ")]]
            .filter(([, v]) => v).map(([k, v]) => html`<dt>${t(k)}</dt><dd>${v}</dd>`)}</dl>
        ${files.length ? html`<div><b class="om-h3">${t("om.files")}</b>${fileList(files)}${!may.download ? html`<p class="muted">${t(may.use ? "om.lentNote" : "om.noDownload")}</p>` : ""}</div>` : ""}
        ${m.carto ? html`<div class="stack" style="gap:6px"><b class="om-h3">${t("om.carto.tag")}</b><p class="muted om-small">${t("om.carto.linked")}</p>
          <div class="row" style="gap:6px"><a class="btn btn-sm" href="#/carto?id=${m.carto}">${t("om.carto.open")}</a>
            ${may.download ? html`<button type="button" class="btn btn-sm" id="om-cdl">${t("om.carto.download")}</button>` : ""}
            ${may.edit ? html`<button type="button" class="btn btn-sm" id="om-cpic">${t("om.carto.refresh")}</button>` : ""}</div>
          ${!may.download ? html`<p class="muted om-small">${t(may.use ? "om.lentNote" : "om.noDownload")}</p>` : ""}
          <span class="muted om-small" id="om-cmsg"></span></div>` : ""}
        <div><b class="om-h3">${t("om.rights")}</b><p class="muted om-small">${t("om.rights.hint")}</p>
          <ul class="om-rights">${WRITTEN.map((k) => { const r = m.rights?.[k]; return html`<li><label class="check"><input type="checkbox" data-right="${k}" ${raw(r ? "checked" : "")} ${raw(may.govern ? "" : "disabled")}>
            <span>${t(`om.right.${k}`)}</span></label>${r ? html`<span class="muted om-small">${t("om.right.by", { name: r.name || "?", d: fmtDate(String(r.at).slice(0, 10)) })}</span>` : ""}</li>`; })}</ul></div>
      </div></div></section>
    ${may.edit ? html`<section class="card"><div class="card-head"><h2>${t("om.edit")}</h2></div><div class="card-body stack" style="gap:10px" id="om-edit">
      ${cardFields(m)}<div class="row"><button type="button" class="btn btn-primary" id="om-esave">${t("om.save")}</button><span class="muted" id="om-enote"></span></div></div></section>` : ""}
    <section class="card"><div class="card-head"><div><h2>${t("om.versions")}</h2><div class="hint">${t("om.versions.hint")}</div></div></div><div class="card-body stack" style="gap:10px">
      <ul class="mc-list">${(D.versions || []).map((v) => html`<li><span><b>${t("om.version", { v: v.version })}</b>${v.version === m.version ? html` <span class="tag">${t("om.current")}</span>` : ""}
          <span class="muted"> · ${fmtDate(String(v.at).slice(0, 10))}${v.by ? ` · ${v.by}` : ""}</span>${v.note ? html`<br><span>${v.note}</span>` : ""}
          ${v.version !== m.version && v.files.length ? fileList(v.files, v.version) : ""}</span></li>`)}</ul>
      ${may.edit && !m.carto ? html`<details class="om-newv"><summary>${t("om.newVersion")}</summary><div class="stack" style="gap:8px;margin-top:8px">
        <label class="dropzone om-drop" id="om-vdrop"><input type="file" id="om-vin" multiple hidden accept="${ACCEPT}"><strong>${t("om.drop")}</strong><span class="muted">${t("om.drop.hint")}</span></label>
        <p class="muted" id="om-vread"></p>
        <label class="field"><span>${t("om.newVersion.note")}</span><input id="om-vnote" maxlength="300"></label>
        <div class="row"><button type="button" class="btn btn-primary" id="om-vgo">${t("om.newVersion.go")}</button><span class="muted" id="om-vmsg"></span></div></div></details>` : ""}
    </div></section>
    <section class="card"><div class="card-head"><div><h2>${t("om.uses")}</h2><div class="hint">${t("om.uses.hint")}</div></div></div><div class="card-body">
      ${uses.length ? html`<ul class="mc-list">${[...uses].reverse().map((u) => html`<li><span><b>${u.title || u.ref}</b> <span class="muted">· ${toolName(u.tool)} · ${t("om.version", { v: u.version })}${u.name ? ` · ${u.name}` : ""} · ${fmtDate(String(u.at).slice(0, 10))}</span>
          ${u.version < m.version ? html` <span class="tag om-old">${t("om.uses.old")}</span>` : ""}</span></li>`)}</ul>` : html`<div class="empty">${t("om.uses.none")}</div>`}</div></section>
    ${may.govern ? html`<section class="card"><div class="card-head"><div><h2>${t("om.gov")}</h2><div class="hint">${t("om.gov.hint")}</div></div></div><div class="card-body stack" style="gap:12px">
      <div><b class="om-h3">${t("om.access")}</b><p class="muted om-small">${t("om.access.hint")}</p><div class="row">
        ${["organiser", "member"].map((k) => html`<label class="field"><span>${t(`om.access.${k}`)}</span><select data-access="${k}"><option value="">${t(`om.access.default.${k}`)}</option>
          ${LEVELS.map((l) => opt(l, m.access?.[k], t(`om.level.${l}`)))}</select></label>`)}</div></div>
      <div><b class="om-h3">${t("om.embargo")}</b><p class="muted om-small">${t("om.embargo.hint")}</p>
        <div class="row"><label class="field"><span>${t("om.embargo.untilLabel")}</span><input type="date" id="om-euntil" value="${m.embargo?.until || ""}"></label>
          <label class="field" style="flex:1 1 220px"><span>${t("om.embargo.note")}</span><input id="om-enote2" maxlength="300" value="${m.embargo?.note || ""}"></label></div>
        <div id="om-eevents" class="om-small muted">${t("om.embargo.loading")}</div></div>
      <div class="row"><button type="button" class="btn btn-primary" id="om-gsave">${t("om.save")}</button><span class="muted" id="om-gnote"></span></div>
      <div><b class="om-h3">${t("om.links")}</b><p class="muted om-small">${t("om.links.hint")}</p>
        <div class="row" style="align-items:flex-end"><label class="check"><input type="checkbox" id="om-ldl"><span>${t("om.links.download")}</span></label>
          <label class="field"><span>${t("om.links.days")}</span><input type="number" id="om-ldays" min="1" max="365" value="30" style="width:80px"></label>
          <button type="button" class="btn btn-sm" id="om-lmake">${t("om.links.make")}</button></div>
        <div id="om-lnew"></div><div id="om-llist"></div></div>
      <div class="row"><button type="button" class="btn btn-sm btn-ghost" id="om-del">${t("om.delete")}</button></div></div></section>` : ""}`;
  $("#om-back", panel).addEventListener("click", leave);
  const reopen = () => mapPage(panel, org, id, back);
  // a Cartographier map: written as an OCAD file here, to download or to make its pictures again
  const cmsg = (s) => { const n = $("#om-cmsg", panel); if (n) n.textContent = s || ""; };
  const cartoErr = (e) => cmsg(t(e?.code === "carto_gone" ? "om.pick.cartoGone" : "om.err.other"));
  $("#om-cdl", panel)?.addEventListener("click", async (e) => {
    e.target.disabled = true; cmsg(t("om.carto.converting"));
    try { const { cartoFile } = await import("../orgmapuse.js"); save(await cartoFile(org.id, m.id, m.name)); cmsg(""); }
    catch (err) { cartoErr(err); }
    e.target.disabled = false;
  });
  $("#om-cpic", panel)?.addEventListener("click", async (e) => {
    e.target.disabled = true;
    try { await cartoPictures(org.id, m, cmsg); reopen(); }
    catch (err) { cartoErr(err); e.target.disabled = false; }
  });
  // the rights written down: a tick saved at once
  $$("[data-right]", panel).forEach((cb) => cb.addEventListener("change", async () => {
    try { await api(`orgmaps/${org.id}/maps/${id}`, { method: "PUT", body: { rights: { [cb.dataset.right]: cb.checked } } }); reopen(); }
    catch (e) { cb.checked = !cb.checked; alertBox(errText(e)); }
  }));
  $("#om-esave", panel)?.addEventListener("click", async (e) => {
    const card = readCard($("#om-edit", panel));
    if (card.name.length < 2) { $("#om-enote", panel).textContent = t("om.err.name"); return; }
    e.target.disabled = true;
    try { await api(`orgmaps/${org.id}/maps/${id}`, { method: "PUT", body: card }); reopen(); }
    catch (err) { $("#om-enote", panel).textContent = errText(err); e.target.disabled = false; }
  });
  // a new version
  if ($("#om-vdrop", panel)) {
    let vfiles = [], vread = null;
    bindDrop($("#om-vdrop", panel), $("#om-vin", panel), async (list) => {
      vfiles = [...vfiles.filter((f) => !list.some((x) => x.name === f.name)), ...list].slice(0, 12);
      $("#om-vread", panel).textContent = t("om.reading", { names: vfiles.map((f) => f.name).join(", ") });
      try { vread = await readFiles(vfiles); $("#om-vread", panel).textContent = t("om.read.ok", { names: vfiles.map((f) => f.name).join(", "), w: vread.image.width, h: vread.image.height }); }
      catch (err) { vread = null; $("#om-vread", panel).textContent = errText(err); }
    });
    $("#om-vgo", panel).addEventListener("click", async (e) => {
      const say = (s) => { $("#om-vmsg", panel).textContent = s; };
      if (!vread) return say(t("om.err.nomap"));
      if (uses.length && !(await confirmBox(tn("om.newVersion.uses", uses.length), { ok: t("om.newVersion.go") }))) return;
      e.target.disabled = true;
      try {
        await api(`orgmaps/${org.id}/maps/${id}/versions`, { method: "POST", body: { note: $("#om-vnote", panel).value } });
        await sendFiles(org.id, id, vfiles, say);
        say(t("om.pictures"));
        await sendPictures(org.id, id, vread);
        if (vread.geo) await api(`orgmaps/${org.id}/maps/${id}`, { method: "PUT", body: { geo: vread.geo } }).catch(() => null);
        reopen();
      } catch (err) { say(errText(err)); e.target.disabled = false; }
    });
  }
  if (!may.govern) return;
  // the club's events, for the embargo's exceptions
  let events = [];
  try { events = (await api(`events?org=${org.id}`)).events || []; } catch (e) { events = []; }
  const okIds = new Set((m.embargo?.ok || []).map(String));
  $("#om-eevents", panel).innerHTML = events.length ? html`<span>${t("om.embargo.events")}</span><div class="om-evlist">${events.map((ev) => html`<label class="check"><input type="checkbox" data-eok="${ev.id}" ${raw(okIds.has(String(ev.id)) ? "checked" : "")}>
      <span>${ev.name} <span class="muted">${fmtDate(ev.date, "short")}</span></span></label>`)}</div>` : html`<span>${t("om.embargo.noEvents")}</span>`;
  $("#om-gsave", panel).addEventListener("click", async (e) => {
    const access = Object.fromEntries($$("[data-access]", panel).map((s) => [s.dataset.access, s.value || null]));
    const until = $("#om-euntil", panel).value;
    const body = { access, embargo: until ? { until, note: $("#om-enote2", panel).value, ok: $$("[data-eok]:checked", panel).map((x) => x.dataset.eok) } : null };
    e.target.disabled = true;
    try { await api(`orgmaps/${org.id}/maps/${id}`, { method: "PUT", body }); reopen(); }
    catch (err) { $("#om-gnote", panel).textContent = errText(err); e.target.disabled = false; }
  });
  const drawLinks = async () => {
    const box = $("#om-llist", panel);
    try {
      const { links } = await api(`orgmaps/${org.id}/maps/${id}/links`);
      box.innerHTML = links.length ? html`<ul class="mc-list">${links.map((l) => html`<li><span>${t("om.links.until", { d: fmtDate(l.until) })}${l.download ? ` · ${t("om.links.download")}` : ""}<span class="muted">${l.by ? ` · ${l.by}` : ""}</span></span>
        <button type="button" class="btn btn-sm btn-ghost" data-lrev="${l.h}">${t("om.links.revoke")}</button></li>`)}</ul>` : "";
      $$("[data-lrev]", box).forEach((b) => b.addEventListener("click", async () => {
        b.disabled = true;
        try { await api(`orgmaps/${org.id}/maps/${id}/links/${b.dataset.lrev}`, { method: "DELETE" }); drawLinks(); } catch (err) { b.disabled = false; alertBox(errText(err)); }
      }));
    } catch (e) { box.innerHTML = ""; }
  };
  drawLinks();
  $("#om-lmake", panel).addEventListener("click", async (e) => {
    e.target.disabled = true;
    try {
      const j = await api(`orgmaps/${org.id}/maps/${id}/links`, { method: "POST", body: { download: $("#om-ldl", panel).checked, days: Number($("#om-ldays", panel).value) || 30 } });
      const box = $("#om-lnew", panel);
      box.innerHTML = html`<div class="row"><input type="text" readonly id="om-link" value="${j.link}" style="flex:1 1 320px"><button type="button" class="btn btn-sm" id="om-lcopy">${t("om.links.copy")}</button></div>
        <p class="muted om-small">${t("om.links.once")}</p>`;
      $("#om-lcopy", box).addEventListener("click", async (ev) => { try { await navigator.clipboard.writeText(j.link); ev.target.textContent = t("om.links.copied"); } catch (err) { $("#om-link", box).select(); } });
      drawLinks();
    } catch (err) { alertBox(errText(err)); }
    e.target.disabled = false;
  });
  $("#om-del", panel).addEventListener("click", async () => {
    if (!(await confirmBox(t("om.delete.confirm", { name: m.name }), { ok: t("om.delete") }))) return;
    try { await api(`orgmaps/${org.id}/maps/${id}`, { method: "DELETE" }); leave(); } catch (e) { alertBox(errText(e)); }
  });
}

// ---- a map shared by a link (#/monclub?carte=<token>) ------------------------------------------------------------------------------
export async function sharedPage(main, token) {
  await loadArea("orgmaps");
  main.innerHTML = html`<div class="boot"><div class="spinner"></div></div>`;
  let D;
  try { D = await api(`orgmaps/s/${encodeURIComponent(token)}`); }
  catch (e) { main.innerHTML = html`<div class="page-head"><div><h1>${t("om.shared.title")}</h1></div></div><div class="notice">${e.status === 404 ? t("om.shared.gone") : errText(e)}</div>`; return { title: t("om.shared.title") }; }
  await france().catch(() => null);
  const m = D.map, u = `api/orgmaps/s/${encodeURIComponent(token)}`;
  main.innerHTML = html`<div class="page-head"><div><h1>${m.name}</h1><div class="lede meta"><span>${D.map.orgName}</span><span>${placeText(m) || "—"}</span>
      ${scaleText(m) ? html`<span>${scaleText(m)}</span>` : ""}<span>${t("om.links.until", { d: fmtDate(D.link.until) })}</span></div></div></div>
    <section class="card"><div class="card-body om-page"><div class="om-view"><img alt="${m.name}" src="${u}/view" onerror="this.closest('.om-view').classList.add('om-none');this.remove()"></div>
      <div class="stack om-side" style="gap:10px"><p class="muted">${t("om.shared.lede", { club: D.map.orgName })}</p>
      ${D.link.download && m.files?.length ? html`<ul class="om-files">${m.files.map((f) => html`<li><span>${f.name} <span class="muted">${mb(f.size)}</span></span>
        <a class="btn btn-sm" href="${u}/file/${encodeURIComponent(f.name)}" download="${f.name}">${t("om.download")}</a></li>`)}</ul>` : html`<p class="muted">${t("om.noDownload")}</p>`}</div></div></section>`;
  return { title: m.name };
}
