// Pixel › Orga (pages/virtually.js; owner, 2026-11-11, then 2026-11-28: « this is not about adding new trainings, but about
// creating competitions » — docs/pixel/competitions.md §6): an organiser makes a competition from their own map and courses, as
// for a real race. « Nouvelle compétition » starts from the files — the OCAD map and the courses (an OCAD course-setting file or
// an IOF XML; one OCAD map holding its course setting is enough), read here before anything is sent to tell which is which —, the
// event is created, the files sent, and its page opens: name, dates (from – to, both needed to publish), format, whether ghosts may
// show rivals' routes, the conditions (season, weather, time of day, a night's lamp), terrain photos laid over the 3D scene, then
// « Construire » (on GitHub: virtually.yml, tools/virtually/ci.py, its progress shown here), the courses to try, « Publier ».
// Training events (Trois Pignons…) are played in Training and never listed here.
// The server: functions/api/virtual/events/[[path]].js (its header lists the routes).
import { html, raw, $, $$, fmt, fmtDate, pct, touchScreen, fileAccept } from "../util.js";
import { t, tn } from "../i18n.js";
import { bar, setBar, elapsed, leftOf, about } from "../waitbar.js";
import { confirmBox, alertBox } from "../askbox.js";
import * as auth from "../auth.js";
import * as offers from "../offers.js";
import * as W from "../games/vweather.js";
import { bindPicker, sourceOf } from "../orgmapuse.js";

const API = "/api/virtual/events";
const MAX_MB = { "map.ocd": 40, "courses.ocd": 40, "courses.xml": 5 };
const FORMATS = ["", "ld", "md", "sprint"];
const SEASONS = W.SEASONS || ["", "spring", "summer", "autumn", "winter"];

async function call(url, opts = {}) {
  const r = await fetch(url, { credentials: "same-origin", cache: "no-store", ...opts });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(d.error || String(r.status)), { status: r.status, body: d });
  return d;
}
const post = (url, body, method = "POST") => call(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body || {}) });
/** A file sent with its progress (fetch says nothing of an upload's): onFrac(bytes sent). */
function upload(url, file, onSent) {
  return new Promise((resolve, reject) => {
    const x = new XMLHttpRequest();
    x.open("PUT", url);
    x.withCredentials = true;
    x.setRequestHeader("Content-Type", "application/octet-stream");
    x.upload.onprogress = (e) => onSent?.(e.loaded);
    x.onload = () => {
      let d = {};
      try { d = JSON.parse(x.responseText || "{}"); } catch (e) { d = {}; }
      if (x.status >= 200 && x.status < 300) resolve(d);
      else reject(Object.assign(new Error(d.error || String(x.status)), { status: x.status, body: d }));
    };
    x.onerror = () => reject(new Error("network"));
    x.send(file);
  });
}
const errKey = (e) => `vo.err.${String(e?.message || "").replace(/ /g, "_")}`;
const errText = (e) => (t(errKey(e)) !== errKey(e)
  ? t(errKey(e), { mb: fmt((e?.body?.max || 0) / 1e6, 1) })
  : t("vo.err.any", { e: e?.message || String(e) }));
const baseName = (n) => String(n || "").split(/[\\/]/).pop();
const stem = (n) => baseName(n).replace(/\.[^.]+$/, "").replace(/[_]+/g, " ").trim();

/**
 * One file dropped or chosen, read here: { f, kind: "ocd" | "xml", names (its courses), objs (map objects), holds (a map of its
 * own), scale, tpl (the background map its course setting names) } or { f, bad: "size" | "xml" | "ocd" | "file", mb }. The same
 * readers as the Tracer and the map analyses' OCAD import (tracer/circuits.js readCourseFiles), loaded only when needed.
 */
async function readFile(f) {
  const low = f.name.toLowerCase();
  if (low.endsWith(".xml")) {
    if (f.size > MAX_MB["courses.xml"] * 1e6) return { f, bad: "size", mb: MAX_MB["courses.xml"] };
    try {
      const text = await f.text(), io = await import("../tracer/iofin.js"), kind = io.iofKind(text);
      if (kind !== "coursedata3" && kind !== "coursedata2") return { f, bad: "xml" };
      let names = [];
      try { names = io.readIof(text).courses.filter((c) => !c.score).map((c) => c.name).filter(Boolean); } catch (e) { names = []; }
      return { f, kind: "xml", names };
    } catch (e) { return { f, bad: "xml" }; }
  }
  if (low.endsWith(".ocd")) {
    if (f.size > MAX_MB["map.ocd"] * 1e6) return { f, bad: "size", mb: MAX_MB["map.ocd"] };
    try {
      const { readOcad, holdsMap, isOcad } = await import("../tracer/vmap/ocad.js");
      const bytes = new Uint8Array(await f.arrayBuffer());
      if (!isOcad(bytes)) return { f, bad: "ocd" };
      const { map } = readOcad(bytes);
      const tpl = (map.templates || []).find((x) => /\.(ocd|omap|xmap)$/i.test(x.file || ""));
      return { f, kind: "ocd", objs: map.mapObjects || 0, holds: holdsMap(map), scale: map.scale || 0,
        names: (map.courseSetting?.courses || []).map((c) => c.name).filter(Boolean), tpl: tpl ? baseName(tpl.file) : "" };
    } catch (e) { return { f, bad: "ocd" }; }
  }
  return { f, bad: "file" };
}

/**
 * What the files read say (as readCourseFiles decides): the courses file is the OCAD file whose course setting has courses (the
 * one with the fewest map objects); the map the OCAD file its course setting names as background, else the one holding most of a
 * map, else the courses file itself when it holds a map; an IOF XML wins over an OCAD course file. { map, courses, inMap, missing,
 * unused, ignored, scale }.
 */
function understand(items) {
  const ocds = items.filter((x) => x.kind === "ocd"), xml = items.filter((x) => x.kind === "xml").pop() || null;
  const courseOcd = ocds.filter((x) => x.names.length).sort((a, b) => a.objs - b.objs)[0] || null;
  const others = ocds.filter((x) => x !== courseOcd).sort((a, b) => b.objs - a.objs);
  let map = null;
  if (courseOcd) {
    map = (courseOcd.tpl && others.find((x) => baseName(x.f.name).toLowerCase() === courseOcd.tpl.toLowerCase()))
      || others.find((x) => x.objs > courseOcd.objs) || null;
    if (!map && courseOcd.holds) map = courseOcd;
  } else map = others[0] || null;
  const courses = xml || (courseOcd && courseOcd !== map ? courseOcd : null);
  const inMap = !courses && !!map && map === courseOcd;
  const missing = [];
  if (!map) missing.push(courseOcd?.tpl ? t("vo.miss.mapNamed", { name: courseOcd.tpl }) : t("vo.miss.map"));
  if (!courses && !inMap) missing.push(t("vo.miss.courses"));
  const used = new Set([map, courses].filter(Boolean));
  if (inMap) used.add(courseOcd);
  return { map, courses, inMap, missing, scale: map?.scale || 0,
    unused: items.filter((x) => !x.bad && !used.has(x)), ignored: items.filter((x) => x.bad) };
}

/** The organisers' view: their competitions and a new one. onPlay(event, course) tries an event in the game (a training run). */
export async function renderOrga(el, { onPlay, onChange } = {}) {
  let stopPoll = null;
  const admin = !!auth.session()?.admin;
  const dates = (e) => (e.from && e.to ? t("vo.dates", { from: fmtDate(e.from), to: fmtDate(e.to) })
    : e.from ? t("vo.from", { d: fmtDate(e.from) }) : e.to ? t("vo.until", { d: fmtDate(e.to) }) : t("vo.noDates"));
  const stateOf = (e) => (e.published ? t("vo.state.published") : t(`vo.status.${e.status}`));
  // the conditions in words: the season, then what games/vweather.js says of the weather and the time of day
  const condText = (env) => {
    const s = env?.season ? t(`vo.season.${env.season}`) : "", w = W.envText(t, env);
    return [s && !w.includes(s) ? s : "", w].filter(Boolean).join(" · ");
  };

  const list = async () => {
    stopPoll?.(); stopPoll = null;
    el.innerHTML = html`<div class="boot"><div class="spinner"></div></div>`;
    let d;
    try { d = await call(API); } catch (e) { el.innerHTML = html`<div class="card"><div class="empty">${errText(e)}</div></div>`; return; }
    const mine = d.events.filter((e) => e.mine && e.type === "competition");    // trainings live in Training
    el.innerHTML = html`<p class="muted vtp-intro">${t("vo.intro")}</p>
      <div class="vo-head"><h2 class="vtp-h">${t("vo.mine")}</h2><button type="button" class="btn btn-primary" id="vo-new" ${raw(admin || offers.shown("pixelOwnMap") ? "" : "hidden")}>${t("vo.new")}</button></div>
      ${mine.length ? html`<div class="vo-list">${mine.map((e) => html`<button type="button" class="card vo-ev" data-id="${e.id}">
          <b>${e.name}</b>
          <span class="vo-ev-line">${dates(e)}${e.format ? html` · ${t(`vo.format.${e.format}`)}` : ""}</span>
          <span class="vo-ev-tags"><span class="tag ${e.published ? "vo-pub" : ""}">${stateOf(e)}</span>${e.ghosts ? html`<span class="tag">${t("vo.ghostsOn")}</span>` : ""}</span>
          <span class="muted">${e.courses.length ? tn("vo.nCoursesN", e.courses.length) : ""}</span>
          ${condText(e.env) ? html`<span class="vtp-env">${condText(e.env)}</span>` : ""}</button>`)}</div>`
        : html`<div class="card"><div class="empty">${t("vo.none")}</div></div>`}
      <details class="vtp-how"><summary>${t("vo.how.title")}</summary>${raw(t("vo.how.body"))}</details>`;
    $("#vo-new", el).addEventListener("click", () => form());
    $$(".vo-ev", el).forEach((b) => b.addEventListener("click", () => detail(b.dataset.id)));
  };

  // ---- a new competition: the files first -----------------------------------------------------------------------------------
  function form() {
    stopPoll?.(); stopPoll = null;
    const touch = touchScreen();
    let items = [], named = false, reading = 0;
    el.innerHTML = html`<p class="vtp-back"><button type="button" class="btn btn-sm" id="vo-back">${t("vo.back")}</button></p>
      <div class="card"><div class="card-body vo-form">
        <h2>${t("vo.new")} ${offers.mark("pixelOwnMap")}</h2>
        <p class="muted">${t("vo.drop.lede")}</p>
        ${touch ? html`<div class="vo-pick"><label class="btn btn-primary">${t("vo.drop.pick")}<input type="file" id="vo-files" multiple accept="${fileAccept(".ocd,.xml")}" hidden></label>
            <span class="muted">${t("vo.drop.hint")}</span></div>`
          : html`<label class="dropzone an-drop vo-drop"><input type="file" id="vo-files" multiple accept=".ocd,.xml" hidden>
            <strong>${t("vo.drop.title")}</strong><span class="muted">${t("vo.drop.hint")}</span>
            <span class="btn btn-sm">${t("vo.drop.pick")}</span></label>`}
        <div class="om-pick" id="vo-club" hidden></div>
        <div class="vo-got" id="vo-got" hidden></div>
        <label class="vo-namef" hidden>${t("vo.f.name")} <input type="text" id="vo-name" maxlength="80"></label>
        <div id="vo-send"></div>
        <p class="vo-err" id="vo-err" hidden></p>
        <div class="vtp-go"><button type="button" class="btn btn-primary" id="vo-create" disabled>${t("vo.create")}</button></div>
        <p class="muted">${t("vo.privacy")}</p>
      </div></div>`;
    const err = $("#vo-err", el), say = (m) => { err.textContent = m || ""; err.hidden = !m; };
    $("#vo-back", el).addEventListener("click", list);
    $("#vo-name", el).addEventListener("input", () => { named = true; });
    const show = () => {
      const plan = understand(items), got = $("#vo-got", el);
      const cl = (x) => (x.names.length ? t("vo.got.list", { n: tn("vo.nCoursesN", x.names.length), list: x.names.join(", ") }) : "");
      const lines = [];
      if (reading) lines.push(html`<p class="muted">${t("vo.drop.reading")}</p>`);
      if (plan.map) lines.push(html`<p class="vo-ok">✓ ${t("vo.got.map", { name: plan.map.f.name })}${plan.scale ? ` (1:${fmt(plan.scale)})` : ""}${plan.map.src ? html` · ${t("vo.got.club")}` : ""}</p>`);
      if (plan.courses) lines.push(html`<p class="vo-ok">✓ ${t("vo.got.courses", { name: plan.courses.f.name })}${cl(plan.courses) ? ` — ${cl(plan.courses)}` : ""}</p>`);
      else if (plan.inMap) lines.push(html`<p class="vo-ok">✓ ${t("vo.got.inMap")}${cl(plan.map) ? ` — ${cl(plan.map)}` : ""}</p>`);
      if (items.length && !reading) for (const m of plan.missing) lines.push(html`<p class="vo-miss">${m}</p>`);
      for (const x of plan.unused) lines.push(html`<p class="muted">${t("vo.bad.unused", { name: x.f.name })}</p>`);
      for (const x of plan.ignored) lines.push(html`<p class="muted">${t(`vo.bad.${x.bad}`, { name: x.f.name, mb: x.mb || 0 })}</p>`);
      if (items.length) lines.push(html`<p><button type="button" class="btn btn-sm" id="vo-clear">${t("vo.drop.clear")}</button></p>`);
      got.innerHTML = html`${lines}`;
      got.hidden = !lines.length;
      $("#vo-clear", el)?.addEventListener("click", () => { items = []; named = false; $("#vo-name", el).value = ""; $(".vo-namef", el).hidden = true; show(); });
      if (plan.map) {
        $(".vo-namef", el).hidden = false;
        if (!named) $("#vo-name", el).value = plan.map.src?.name || stem(plan.map.f.name);
      }
      $("#vo-create", el).disabled = !!reading || !plan.map || !!plan.missing.length;
      return plan;
    };
    const take = async (files, src = null) => {
      say("");
      const fresh = [...files];
      if (!fresh.length) return;
      reading++; show();
      for (const f of fresh) {
        const x = await readFile(f);
        if (src) x.src = src;
        items = items.filter((y) => y.f.name !== f.name);       // the same file again replaces it
        items.push(x);
      }
      reading--; show();
    };
    const inp = $("#vo-files", el);
    inp.addEventListener("change", () => { const fs = [...(inp.files || [])]; inp.value = ""; take(fs); });
    const drop = $(".vo-drop", el);
    drop?.addEventListener("dragover", (e) => { e.preventDefault(); drop.classList.add("over"); });
    drop?.addEventListener("dragleave", () => drop.classList.remove("over"));
    drop?.addEventListener("drop", (e) => { e.preventDefault(); drop.classList.remove("over"); take(e.dataTransfer?.files || []); });
    // « Une carte du club » (docs/clubs/design.md §2): its OCAD file read as if dropped, its source kept (rights.pixel)
    bindPicker($("#vo-club", el), "pixel", async (files, src) => take(files.slice(0, 1), src), { only: (n) => /\.ocd$/i.test(n) });

    $("#vo-create", el).addEventListener("click", async () => {
      const plan = understand(items);
      if (!plan.map || plan.missing.length) return say(plan.missing.join(" ") || t("vo.miss.map"));
      const name = $("#vo-name", el).value.trim();
      if (!name) return say(t("vo.err.name"));
      // an event on one's own map is a capability (docs/billing/design.md, pixelOwnMap): asked here, the files kept as read
      if (!(await offers.guard("pixelOwnMap", { el: $("#vo-create", el) }))) return;
      const btn = $("#vo-create", el);
      btn.disabled = true;
      const body = { name, type: "competition", source: "ocad", courses: "file" };
      if (plan.scale && plan.scale <= 5000) body.format = "sprint";        // a sprint map: 1:5000 or larger
      let ev;
      try { ev = await post(API, body); } catch (e) { say(errText(e)); btn.disabled = false; return; }
      onChange?.();
      const sends = [["map.ocd", plan.map.f]];
      if (plan.courses) sends.push([plan.courses.kind === "xml" ? "courses.xml" : "courses.ocd", plan.courses.f]);
      const total = sends.reduce((s, [, f]) => s + f.size, 0) || 1;
      const box = $("#vo-send", el);
      box.innerHTML = html`<div class="vo-prog">${raw(bar(0))}<span class="muted" id="vo-send-l"></span></div>`;
      const pbar = $("progress", box), label = $("#vo-send-l", box);
      let done = 0, failed = "";
      const sendAt = performance.now();
      for (const [file, f] of sends) {
        label.textContent = t("vo.sending", { name: f.name });
        try {
          await upload(`${API}/${ev.id}/file/${file}`, f, (n) => {
            const frac = (done + n) / total;
            setBar(pbar, frac);
            label.textContent = t("vo.sending", { name: f.name }) + leftText(sendAt, frac);
          });
          if (file === "map.ocd" && plan.map.src) await post(`${API}/${ev.id}`, { orgMap: sourceOf(plan.map.src) }, "PUT").catch(() => {});
        } catch (e) { failed = errText(e); break; }
        done += f.size; setBar(pbar, done / total);
      }
      detail(ev.id, { err: failed ? t("vo.sendFailed", { e: failed }) : "" });
    });
  }

  // ---- one competition ------------------------------------------------------------------------------------------------------
  async function detail(id, { err: noteErr = "", info = "", saved = false } = {}) {
    stopPoll?.(); stopPoll = null;
    el.innerHTML = html`<div class="boot"><div class="spinner"></div></div>`;
    let ev;
    try { ev = await call(`${API}/${id}`); } catch (e) { el.innerHTML = html`<div class="card"><div class="empty">${errText(e)}</div></div>`; return; }
    const building = ["queued", "building"].includes(ev.status) || (ev.build && ev.build.stage && ev.build.stage !== "done");
    const ready = ["ready", "stale"].includes(ev.status);
    const files = ev.files || {};
    const E = W.envOf(ev.env), season = SEASONS.includes(ev.env?.season) ? ev.env.season : "";
    const format = ev.format || (ev.scale && ev.scale <= 5000 ? "sprint" : "");
    const opt = (v, cur, label) => html`<option value="${v}" ${raw(v === cur ? "selected" : "")}>${label}</option>`;
    const cfile = files["courses.ocd"] ? "courses.ocd" : files["courses.xml"] ? "courses.xml" : "";
    el.innerHTML = html`<p class="vtp-back"><button type="button" class="btn btn-sm" id="vo-back">${t("vo.back")}</button></p>
      <div class="card"><div class="card-body vo-form">
        <h2>${ev.name} <span class="tag vo-comp">${t("vo.type.competition")}</span></h2>
        <p class="muted">${stateOf(ev)}${ev.status === "stale" && ev.published ? html` · ${t("vo.status.stale")}` : ""}${ev.error ? html` — <span class="vo-errline">${ev.error}</span>` : ""}</p>
        ${ev.published ? html`<p class="vo-note">${t("vo.pubWhere", { d: ev.from ? fmtDate(ev.from) : "—" })}</p>` : ""}
        ${noteErr ? html`<p class="vo-err">${noteErr}</p>` : ""}${info ? html`<p class="vo-note">${info}</p>` : ""}
        <div id="vo-build">${building ? progressHtml(ev.build) : ""}</div>

        <h3>${t("vo.files")}</h3>
        ${ev.source === "ocad" ? html`
          <div class="vo-files">
            ${fileRow("map.ocd", t("vo.file.map"), files["map.ocd"] ? t("vo.file.sent", { mb: fmt(files["map.ocd"] / 1e6, 1) }) : t("vo.file.none"), !!files["map.ocd"], fileAccept(".ocd"))}
            ${ev.orgMap ? html`<p class="muted">${t("om.pick.pixelUsed", { name: ev.orgMap.name })}</p>` : ""}
            <div class="om-pick" id="vo-club" hidden></div>
            ${fileRow("courses", t("vo.file.courses"), cfile ? t("vo.file.sentAs", { mb: fmt(files[cfile] / 1e6, 1), kind: t(cfile === "courses.xml" ? "vo.file.kindXml" : "vo.file.kindOcd") })
              : t(ev.coursesFrom === "file" ? "vo.file.inMap" : "vo.file.proposed"), !!cfile, fileAccept(".ocd,.xml"))}
            <p class="muted">${t("vo.file.coursesNote")}</p>
          </div>
          <p class="muted">${t("vo.privacy")}</p>` : html`<p class="muted">${t("vo.lidarArea", { lat: fmt(ev.area?.lat ?? 0, 5), lon: fmt(ev.area?.lon ?? 0, 5), km: fmt((ev.area?.size || 0) / 1000, 1) })}</p>
          ${ev.lidarOcd ? html`<h3>${t("vo.lidarOcd.title")}</h3>
            <p><a class="btn btn-sm" href="${API}/${ev.id}/file/lidar.ocd" download>${t("vo.lidarOcd.get")}</a></p>
            <p class="muted">${t(files["map.ocd"] ? "vo.lidarOcd.using" : "vo.lidarOcd.hint")}</p>
            <div class="vo-files">${fileRow("map.ocd", t("vo.lidarOcd.edited"), files["map.ocd"] ? t("vo.file.sent", { mb: fmt(files["map.ocd"] / 1e6, 1) }) : t("vo.file.none"), !!files["map.ocd"], fileAccept(".ocd"))}</div>` : ""}`}

        <h3>${t("vo.settings")}</h3>
        <label>${t("vo.f.name")} <input type="text" id="vo-name" maxlength="80" value="${ev.name}"></label>
        <fieldset class="vo-env"><legend>${t("vo.f.dates")}</legend>
          <label>${t("vo.f.from")} <input type="date" id="vo-from" value="${ev.from}"></label>
          <label>${t("vo.f.to")} <input type="date" id="vo-to" value="${ev.to}"></label>
          <p class="muted">${t("vo.f.datesHint")}</p></fieldset>
        <label>${t("vo.f.format")} <select id="vo-format">${FORMATS.map((f) => opt(f, format, t(`vo.format.${f || "none"}`)))}</select></label>
        <label class="vo-check"><input type="checkbox" id="vo-ghosts" ${raw(ev.ghosts ? "checked" : "")}> <span><b>${t("vo.f.ghosts")}</b>
          <span class="muted">${t("vo.f.ghostsHint")}</span></span></label>
        <fieldset class="vo-env"><legend>${t("vo.f.env")}</legend>
          <label>${t("vo.f.season")} <select id="vo-season">${SEASONS.map((s) => opt(s, season, t(`vo.season.${s || "none"}`)))}</select></label>
          <label>${t("vo.f.weather")} <select id="vo-weather">${W.WEATHERS.map((w) => opt(w, E.weather, t(`vt.env.w.${w}`)))}</select></label>
          <label>${t("vo.f.time")} <select id="vo-time">${W.TIMES.map((x) => opt(x, E.time, t(`vt.env.t.${x}`)))}</select></label>
          <label class="vo-lamp" ${raw(E.time === "night" ? "" : "hidden")}>${t("vo.f.lamp")} <select id="vo-lamp">${W.LAMPS.map((l) => opt(l, E.lamp, t(`vt.env.lamp.${l}`)))}</select></label>
          <p class="muted">${t("vo.f.envHint")}</p></fieldset>
        <div class="vtp-go"><button type="button" class="btn" id="vo-save">${t("vo.save")}</button><span class="muted" id="vo-saved">${saved ? `✓ ${t("vo.saved")}` : ""}</span></div>

        <div id="vo-tex" hidden></div>

        <h3>${t("vo.actions")}</h3>
        <div class="vtp-go vo-actions">
          <button type="button" class="btn ${ready ? "" : "btn-primary"}" id="vo-buildbtn" ${raw(building || (ev.source === "ocad" && !files["map.ocd"]) ? "disabled" : "")}>${t(ready ? "vo.rebuild" : "vo.build")}</button>
          ${ready ? html`<button type="button" class="btn btn-primary" id="vo-pub">${t(ev.published ? "vo.unpublish" : "vo.publish")}</button>` : ""}
          <button type="button" class="btn" id="vo-del">${t("vo.delete")}</button>
        </div>
        ${!ready && !building ? html`<p class="muted">${t("vo.buildHint")}</p>` : ""}
        <p class="vo-err" id="vo-err" hidden></p>
        ${ready && ev.courses.length ? html`<h3>${t("vo.courses")}</h3><p class="muted">${t("vo.try")}</p>
          <div class="vtp-courses">${ev.courses.map((c) => html`<button type="button" class="vtp-course" data-course="${c.id}">
            <b>${c.name || t(`vt.lvl.${c.id}`)}</b><span>${t("vt.tr.courseLine", { km: fmt(c.length / 1000, 1), climb: fmt(c.climb || 0), n: c.controls.length - 2 })}</span>
            <span class="muted">${t("vo.tryOne")}</span></button>`)}</div>` : ""}
      </div></div>`;
    const err = $("#vo-err", el), say = (m) => { err.textContent = m || ""; err.hidden = !m; if (m) err.scrollIntoView({ block: "nearest" }); };
    $("#vo-back", el).addEventListener("click", list);
    $("#vo-time", el).addEventListener("change", (e) => { $(".vo-lamp", el).hidden = e.target.value !== "night"; });
    const settings = () => ({ name: $("#vo-name", el).value.trim(), from: $("#vo-from", el).value, to: $("#vo-to", el).value,
      format: $("#vo-format", el).value, ghosts: $("#vo-ghosts", el).checked,
      env: { season: $("#vo-season", el).value, weather: $("#vo-weather", el).value, time: $("#vo-time", el).value, lamp: $("#vo-lamp", el).value } });
    const checkDates = (s, needed) => {
      if (needed && (!s.from || !s.to)) return t("vo.err.dates");
      if (s.from && s.to && s.from > s.to) return t("vo.err.datesOrder");
      return "";
    };

    // the files, replaced one at a time (read here first: a courses file must hold courses)
    $$(".vo-file input[type=file]", el).forEach((inp) => inp.addEventListener("change", async () => {
      const f = inp.files?.[0], slot = inp.dataset.file; inp.value = "";
      if (!f) return;
      say("");
      const row = inp.closest(".vo-file"), st = $(".vo-fstate", row), was = st.textContent;
      st.innerHTML = bar(null);
      const x = await readFile(f);
      let name = slot;
      if (x.bad) { st.textContent = was; return say(t(`vo.bad.${x.bad}`, { name: f.name, mb: x.mb || 0 })); }
      if (slot === "courses") {
        if (!x.names.length) { st.textContent = was; return say(t("vo.bad.noCourses", { name: f.name })); }
        name = x.kind === "xml" ? "courses.xml" : "courses.ocd";
      } else if (x.kind !== "ocd") { st.textContent = was; return say(t("vo.bad.ocd", { name: f.name })); }
      st.innerHTML = bar(0);
      try {
        const sendAt = performance.now();
        await upload(`${API}/${id}/file/${name}`, f, (n) => { const p = $("progress", st); setBar(p, n / (f.size || 1)); if (p) p.title = leftText(sendAt, n / (f.size || 1)).replace(/^ · /, ""); });
        detail(id);
      } catch (e) { st.textContent = was; say(errText(e)); }
    }));
    // « Une carte du club » (docs/clubs/design.md §2): its OCAD file sent as the event's map, its source kept (rights.pixel)
    bindPicker($("#vo-club", el), "pixel", async (fl, src) => {
      const f = fl[0];
      if (f.size > MAX_MB["map.ocd"] * 1e6) return say(t("vo.err.size", { mb: MAX_MB["map.ocd"] }));
      try {
        await upload(`${API}/${id}/file/map.ocd`, f);
        await post(`${API}/${id}`, { orgMap: sourceOf(src) }, "PUT");
        detail(id);
      } catch (e) { say(errText(e)); }
    }, { only: (n) => /\.ocd$/i.test(n) });

    $("#vo-save", el).addEventListener("click", async () => {
      const s = settings(), bad = checkDates(s, ev.published);
      if (!s.name) return say(t("vo.err.name"));
      if (bad) return say(bad);
      try {
        await post(`${API}/${id}`, s, "PUT"); onChange?.();
        detail(id, { saved: true });
      } catch (e) { say(errText(e)); }
    });
    $("#vo-buildbtn", el)?.addEventListener("click", async () => {
      try { const r = await post(`${API}/${id}/build`); detail(id, { info: r.started ? "" : t("vo.notStarted") }); } catch (e) { say(errText(e)); }
    });
    $("#vo-pub", el)?.addEventListener("click", async () => {
      try {
        if (ev.published) await post(`${API}/${id}`, { published: false }, "PUT");
        else {
          const s = settings(), bad = checkDates(s, true);
          if (!s.name) return say(t("vo.err.name"));
          if (bad) return say(bad);
          await post(`${API}/${id}`, { ...s, published: true }, "PUT");   // what is typed is saved with it
        }
        onChange?.(); detail(id);
      } catch (e) { say(errText(e)); }
    });
    $("#vo-del", el).addEventListener("click", async () => {
      if (!(await confirmBox(t("vo.confirmDelete", { name: ev.name }), { ok: t("vo.delete") }))) return;
      try { await call(`${API}/${id}`, { method: "DELETE" }); onChange?.(); list(); } catch (e) { alertBox(errText(e)); }
    });
    $$(".vtp-course[data-course]", el).forEach((b) => b.addEventListener("click", () => onPlay?.(ev, ev.courses.find((c) => c.id === b.dataset.course))));
    texBlock(ev, say);
    if (building) poll(id);
  }

  // ---- the terrain photos (docs/pixel/competitions.md §3.3, §4): one per role, prepared here, applied without a rebuild ----------
  async function texBlock(ev, say) {
    const box = $("#vo-tex", el);
    if (!box) return;
    const F = await import("../games/vforest.js").catch(() => null);
    if (!F?.TEX_ROLES?.length || typeof F.prepareTexture !== "function" || !box.isConnected) return;   // the game cannot use them yet
    const have = new Set(ev.tex || []), stamp = {};
    const draw = () => {
      box.hidden = false;
      box.innerHTML = html`<h3>${t("vo.tex.title")}</h3><p class="muted">${t("vo.tex.hint")}</p>
        <div class="vo-tex">${F.TEX_ROLES.map((r) => html`<div class="vo-tex-slot" data-role="${r}">
          <div class="vo-tex-img">${have.has(r) ? html`<img src="${API}/${ev.id}/pkg/tex-${r}.webp${stamp[r] ? `?v=${stamp[r]}` : ""}" alt="${t(`vo.tex.role.${r}`)}" loading="lazy">` : html`<span class="muted">${t("vo.tex.none")}</span>`}</div>
          <b>${t(`vo.tex.role.${r}`)}</b><span class="muted vo-tex-what">${t(`vo.tex.what.${r}`)}</span>
          <div class="vo-tex-btns"><label class="btn btn-sm">${t("vo.tex.choose")}<input type="file" accept="image/*" hidden></label>
            ${have.has(r) ? html`<button type="button" class="btn btn-sm vo-tex-rm">${t("vo.tex.remove")}</button>` : ""}</div>
          <span class="muted vo-tex-st"></span></div>`)}</div>`;
      $$(".vo-tex-slot", box).forEach((slot) => {
        const r = slot.dataset.role, st = $(".vo-tex-st", slot);
        $("input[type=file]", slot).addEventListener("change", async (e) => {
          const f = e.target.files?.[0]; e.target.value = "";
          if (!f) return;
          say("");
          try {
            st.textContent = t("vo.tex.preparing");
            const blob = await F.prepareTexture(f);
            st.textContent = t("vo.tex.sending");
            const d = await call(`${API}/${ev.id}/tex/${r}`, { method: "PUT", headers: { "Content-Type": "image/webp" }, body: blob });
            if (Array.isArray(d.tex)) { have.clear(); d.tex.forEach((x) => have.add(x)); } else have.add(r);
            stamp[r] = Date.now(); draw();
          } catch (err) { st.textContent = ""; say(err?.status ? errText(err) : t("vo.tex.bad")); }
        });
        $(".vo-tex-rm", slot)?.addEventListener("click", async () => {
          try {
            const d = await call(`${API}/${ev.id}/tex/${r}`, { method: "DELETE" });
            if (Array.isArray(d.tex)) { have.clear(); d.tex.forEach((x) => have.add(x)); } else have.delete(r);
            draw();
          } catch (err) { say(errText(err)); }
        });
      });
    };
    draw();
  }

  const fileRow = (name, label, state, has, accept) => html`<div class="vo-file"><span>${label}</span>
    <span class="vo-fstate muted">${state}</span>
    <label class="btn btn-sm">${t(has ? "vo.file.replace" : "vo.file.choose")}<input type="file" accept="${accept}" data-file="${name}" hidden></label></div>`;
  const progressHtml = (b) => html`<div class="vo-prog">${raw(bar(b && b.frac > 0 ? b.frac : null))}
    <span class="muted" id="vo-stage">${stageText(b)}</span></div>`;
  /** « · encore environ 40 s » for a wait begun at `at` (performance.now()) with `frac` done; "" while no fair estimate. */
  const leftText = (at, frac) => { const l = leftOf((performance.now() - at) / 1000, frac, null); return l != null && l >= 2 ? ` · ${t("wait.left", { t: about(l) })}` : ""; };
  const stageText = (b) => {
    if (!b) return t("vo.stage.queued");
    const since = b.at ? (Date.now() - Date.parse(b.at)) / 1000 : 0;
    // the build's time left only from a third done: its first stages (the downloads) say little about the rest
    const left = b.frac >= 1 / 3 && since > 20 ? leftOf(since, b.frac, null) : null;
    return `${t(`vo.stage.${b.stage || "queued"}`)}${b.frac ? ` · ${pct(b.frac)}` : ""}${since > 0 ? ` · ${t("vo.stage.since", { t: elapsed(since) })}` : ""}${left != null ? ` · ${t("wait.left", { t: about(left) })}` : ""}`;
  };
  function poll(id) {
    let on = true, timer = 0;
    const tick = async () => {
      if (!on || !el.isConnected) return;
      try {
        const ev = await call(`${API}/${id}`);
        if (!["queued", "building"].includes(ev.status) && !(ev.build && ev.build.stage && ev.build.stage !== "done")) { detail(id); return; }
        const p = $(".vo-prog progress", el); setBar(p, ev.build?.frac > 0 ? ev.build.frac : null);
        const s = $("#vo-stage", el); if (s) s.textContent = stageText(ev.build);
      } catch (e) { /* tried again */ }
      timer = setTimeout(tick, 5000);
    };
    timer = setTimeout(tick, 4000);
    stopPoll = () => { on = false; clearTimeout(timer); };
  }
  await list();
  return () => stopPoll?.();
}
