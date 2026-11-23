// « Virtually » › Orga (pages/virtually.js's tab; owner, 2026-11-11): an organiser makes a virtual race from their own OCAD map —
// a training (every account, played as often as one likes) or a competition (accounts only, once each, between its dates; only
// competitions count in the ranking) —, its courses their own (the OCAD course setting or an IOF XML) or six proposed; an
// administrator also from the LiDAR alone (the generated map, no OCAD). The race is built on GitHub (virtually.yml,
// tools/virtually/ci.py), its progress shown here; the organiser then tries it, publishes it, or deletes it.
// The server: functions/api/virtual/events/[[path]].js (its header lists the routes).
import { html, raw, $, $$, fmt, fmtDate, pct } from "../util.js";
import { t } from "../i18n.js";
import { bar, setBar, elapsed } from "../waitbar.js";
import { confirmBox, alertBox } from "../askbox.js";
import * as auth from "../auth.js";
import { WEATHERS, TIMES, LAMPS, envOf, envText } from "../games/vweather.js";
import { LAYERS, mapOptOf, mapOptText } from "../games/vmapopt.js";
import { bindPicker, sourceOf } from "../orgmapuse.js";

const API = "/api/virtual/events";
const MAX_MB = { "map.ocd": 40, "courses.ocd": 40, "courses.xml": 5 };

async function call(url, opts = {}) {
  const r = await fetch(url, { credentials: "same-origin", cache: "no-store", ...opts });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(d.error || String(r.status)), { status: r.status, body: d });
  return d;
}
const post = (url, body, method = "POST") => call(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body || {}) });
const errKey = (e) => `vo.err.${String(e?.message || "").replace(/ /g, "_")}`;
const errText = (e) => (t(errKey(e)) !== errKey(e) ? t(errKey(e)) : t("vo.err.any", { e: e?.message || String(e) }));

/** The organisers' tab: their events and a new one. onPlay(event, course) tries an event in the game. */
export async function renderOrga(el, { onPlay, onChange } = {}) {
  let stopPoll = null;
  const admin = !!auth.session()?.admin;
  const list = async () => {
    stopPoll?.(); stopPoll = null;
    el.innerHTML = html`<div class="boot"><div class="spinner"></div></div>`;
    let d;
    try { d = await call(API); } catch (e) { el.innerHTML = html`<div class="card"><div class="empty">${errText(e)}</div></div>`; return; }
    const mine = d.events.filter((e) => e.mine);
    el.innerHTML = html`<p class="muted vtp-intro">${t("vo.intro")}</p>
      <div class="vo-head"><h2 class="vtp-h">${t("vo.mine")}</h2><button type="button" class="btn btn-primary" id="vo-new">${t("vo.new")}</button></div>
      ${mine.length ? html`<div class="vo-list">${mine.map((e) => html`<button type="button" class="card vo-ev" data-id="${e.id}">
          <b>${e.name}</b>
          <span class="tag ${e.type === "competition" ? "vo-comp" : ""}">${t(`vo.type.${e.type}`)}</span>
          <span class="muted">${t(`vo.status.${e.status}`)}${e.published ? html` · ${t("vo.published")}` : ""}${e.source === "lidar" ? html` · ${t("vo.src.lidar")}` : ""}</span>
          <span class="muted">${e.courses.length ? t("vo.nCourses", { n: e.courses.length }) : ""}${e.from || e.to ? html` · ${dates(e)}` : ""}</span>
          ${envText(t, e.env) ? html`<span class="vtp-env">${envText(t, e.env)}</span>` : ""}
          ${mapOptText(t, e.mapOpt) ? html`<span class="vtp-env">${mapOptText(t, e.mapOpt)}</span>` : ""}</button>`)}</div>`
        : html`<div class="card"><div class="empty">${t("vo.none")}</div></div>`}
      <details class="vtp-how"><summary>${t("vo.how.title")}</summary>${raw(t("vo.how.body"))}</details>`;
    $("#vo-new", el).addEventListener("click", () => form());
    $$(".vo-ev", el).forEach((b) => b.addEventListener("click", () => detail(b.dataset.id)));
  };
  // the race's conditions (owner, 2026-11-12): weather, dusk or night, a night's headlamp; drawn by games/vweather.js, no rebuild
  const envFields = (env) => {
    const E = envOf(env), opt = (v, cur, label) => html`<option value="${v}" ${raw(v === cur ? "selected" : "")}>${label}</option>`;
    return html`<fieldset class="vo-env"><legend>${t("vo.f.env")}</legend>
      <label>${t("vo.f.weather")} <select id="vo-weather">${WEATHERS.map((w) => opt(w, E.weather, t(`vt.env.w.${w}`)))}</select></label>
      <label>${t("vo.f.time")} <select id="vo-time">${TIMES.map((x) => opt(x, E.time, t(`vt.env.t.${x}`)))}</select></label>
      <label class="vo-lamp" ${raw(E.time === "night" ? "" : "hidden")}>${t("vo.f.lamp")} <select id="vo-lamp">${LAMPS.map((l) => opt(l, E.lamp, t(`vt.env.lamp.${l}`)))}</select></label>
      <p class="muted">${t("vo.f.envHint")}</p></fieldset>`;
  };
  const readEnv = () => ({ weather: $("#vo-weather", el).value, time: $("#vo-time", el).value, lamp: $("#vo-lamp", el).value });
  // the map options (owner, 2026-11-12; games/vmapopt.js): fixed by the creator, the same for every runner; a race from the LiDAR
  // alone has an image for its map, so « map at the controls only » alone applies there
  const moFields = (o, lidar) => {
    const M = mapOptOf(o);
    return html`<fieldset class="vo-env vo-mo"><legend>${t("vo.f.mapOpt")}</legend>
      <label class="vo-layer" ${raw(lidar ? "hidden" : "")}>${t("vt.mo.layer")} <select id="vo-layer">${LAYERS.map((l) => html`<option value="${l}" ${raw(l === M.layer ? "selected" : "")}>${t(`vt.mo.l.${l}`)}</option>`)}</select></label>
      <label class="vo-radio"><input type="checkbox" id="vo-memory" ${raw(M.memory ? "checked" : "")}> ${t("vt.mo.memory")}</label>
      <p class="muted">${t("vo.f.mapOptHint")}</p><p class="muted vo-mo-lidar" ${raw(lidar ? "" : "hidden")}>${t("vt.mo.imageOnly")}</p></fieldset>`;
  };
  const readMo = () => ({ layer: $("#vo-layer", el)?.value || "full", memory: !!$("#vo-memory", el)?.checked });
  const bindEnv = () => $("#vo-time", el).addEventListener("change", (e) => { $(".vo-lamp", el).hidden = e.target.value !== "night"; });
  const dates = (e) => (e.from && e.to ? t("vo.dates", { from: fmtDate(e.from), to: fmtDate(e.to) }) : e.from ? t("vo.from", { d: fmtDate(e.from) }) : t("vo.until", { d: fmtDate(e.to) }));

  // ---- a new event ---------------------------------------------------------------------------------------------------------
  function form() {
    el.innerHTML = html`<p class="vtp-back"><button type="button" class="btn btn-sm" id="vo-back">${t("vo.back")}</button></p>
      <div class="card"><div class="card-body vo-form">
        <h2>${t("vo.new")}</h2>
        <label>${t("vo.f.name")} <input type="text" id="vo-name" maxlength="80" required></label>
        <fieldset><legend>${t("vo.f.type")}</legend>
          <label class="vo-radio"><input type="radio" name="vo-type" value="training" checked> <b>${t("vo.type.training")}</b> <span class="muted">${t("vo.type.trainingHint")}</span></label>
          <label class="vo-radio"><input type="radio" name="vo-type" value="competition"> <b>${t("vo.type.competition")}</b> <span class="muted">${t("vo.type.competitionHint")}</span></label>
        </fieldset>
        <div class="vo-dates" hidden><label>${t("vo.f.from")} <input type="date" id="vo-from"></label><label>${t("vo.f.to")} <input type="date" id="vo-to"></label></div>
        <fieldset><legend>${t("vo.f.source")}</legend>
          <label class="vo-radio"><input type="radio" name="vo-src" value="ocad" checked> <b>${t("vo.src.ocad")}</b> <span class="muted">${t("vo.src.ocadHint")}</span></label>
          ${admin ? html`<label class="vo-radio"><input type="radio" name="vo-src" value="lidar"> <b>${t("vo.src.lidar")}</b> <span class="muted">${t("vo.src.lidarHint")}</span></label>` : ""}
        </fieldset>
        <div class="vo-lidar" hidden>
          <label>${t("vo.f.place")} <input type="text" id="vo-ll" placeholder="48.3894, 2.5272"></label>
          <label>${t("vo.f.size")} <select id="vo-size">${[1000, 1500, 2000, 2500, 3000].map((s) => html`<option value="${s}" ${raw(s === 2000 ? "selected" : "")}>${fmt(s / 1000, 1)} km</option>`)}</select></label>
          <p class="muted">${t("vo.f.lidarNote")}</p>
        </div>
        <fieldset class="vo-coursesf"><legend>${t("vo.f.courses")}</legend>
          <label class="vo-radio"><input type="radio" name="vo-courses" value="proposed" checked> <b>${t("vo.courses.proposed")}</b> <span class="muted">${t("vo.courses.proposedHint")}</span></label>
          <label class="vo-radio"><input type="radio" name="vo-courses" value="file"> <b>${t("vo.courses.file")}</b> <span class="muted">${t("vo.courses.fileHint")}</span></label>
        </fieldset>
        ${envFields(null)}
        ${moFields(null, false)}
        <p class="vo-err" id="vo-err" hidden></p>
        <div class="vtp-go"><button type="button" class="btn btn-primary" id="vo-create">${t("vo.create")}</button></div>
      </div></div>`;
    const val = (n) => $(`input[name="${n}"]:checked`, el)?.value;
    const sync = () => {
      $(".vo-dates", el).hidden = val("vo-type") !== "competition";
      $(".vo-lidar", el).hidden = val("vo-src") !== "lidar";
      $(".vo-coursesf", el).hidden = val("vo-src") === "lidar";
      $(".vo-layer", el).hidden = val("vo-src") === "lidar"; $(".vo-mo-lidar", el).hidden = val("vo-src") !== "lidar";
    };
    $$("input[type=radio]", el).forEach((r) => r.addEventListener("change", sync));
    $("#vo-back", el).addEventListener("click", list);
    $("#vo-create", el).addEventListener("click", async () => {
      const err = $("#vo-err", el), say = (m) => { err.textContent = m; err.hidden = !m; };
      const body = { name: $("#vo-name", el).value.trim(), type: val("vo-type"), source: val("vo-src"), courses: val("vo-courses"), env: readEnv(), mapOpt: readMo() };
      if (!body.name) return say(t("vo.err.name"));
      if (body.type === "competition") { body.from = $("#vo-from", el).value; body.to = $("#vo-to", el).value; }
      if (body.source === "lidar") {
        const m = /(-?\d+(?:[.,]\d+)?)\s*[,; ]\s*(-?\d+(?:[.,]\d+)?)/.exec($("#vo-ll", el).value);
        if (!m) return say(t("vo.err.area"));
        body.area = { lat: +m[1].replace(",", "."), lon: +m[2].replace(",", "."), size: +$("#vo-size", el).value };
      }
      try { const ev = await post(API, body); detail(ev.id); } catch (e) { say(errText(e)); }
    });
    sync(); bindEnv();
  }

  // ---- one event -----------------------------------------------------------------------------------------------------------
  async function detail(id) {
    stopPoll?.(); stopPoll = null;
    el.innerHTML = html`<div class="boot"><div class="spinner"></div></div>`;
    let ev;
    try { ev = await call(`${API}/${id}`); } catch (e) { el.innerHTML = html`<div class="card"><div class="empty">${errText(e)}</div></div>`; return; }
    const building = ["queued", "building"].includes(ev.status) || (ev.build && ev.build.stage && ev.build.stage !== "done");
    const ready = ["ready", "stale"].includes(ev.status);
    const files = ev.files || {};
    el.innerHTML = html`<p class="vtp-back"><button type="button" class="btn btn-sm" id="vo-back">${t("vo.back")}</button></p>
      <div class="card"><div class="card-body vo-form">
        <h2>${ev.name} <span class="tag ${ev.type === "competition" ? "vo-comp" : ""}">${t(`vo.type.${ev.type}`)}</span></h2>
        <p class="muted">${t(`vo.status.${ev.status}`)}${ev.published ? html` · ${t("vo.published")}` : ""}${ev.error ? html` — <span class="vo-errline">${ev.error}</span>` : ""}</p>
        ${ev.source === "ocad" ? html`
          <h3>${t("vo.files")}</h3>
          <div class="vo-files">
            ${fileRow("map.ocd", t("vo.file.map"), files["map.ocd"], ".ocd")}
            ${ev.orgMap ? html`<p class="muted">${t("om.pick.pixelUsed", { name: ev.orgMap.name })}</p>` : ""}
            <div class="om-pick" id="vo-club" hidden></div>
            ${ev.coursesFrom === "file" ? html`${fileRow("courses.xml", t("vo.file.xml"), files["courses.xml"], ".xml")}${fileRow("courses.ocd", t("vo.file.cocd"), files["courses.ocd"], ".ocd")}
              <p class="muted">${t("vo.file.coursesNote")}</p>` : ""}
          </div>
          <p class="muted">${t("vo.privacy")}</p>` : html`<p class="muted">${t("vo.lidarArea", { lat: fmt(ev.area?.lat ?? 0, 5), lon: fmt(ev.area?.lon ?? 0, 5), km: fmt((ev.area?.size || 0) / 1000, 1) })}</p>
          ${ev.lidarOcd ? html`<h3>${t("vo.lidarOcd.title")}</h3>
            <p><a class="btn btn-sm" href="${API}/${ev.id}/file/lidar.ocd" download>${t("vo.lidarOcd.get")}</a></p>
            <p class="muted">${t(files["map.ocd"] ? "vo.lidarOcd.using" : "vo.lidarOcd.hint")}</p>
            <div class="vo-files">${fileRow("map.ocd", t("vo.lidarOcd.edited"), files["map.ocd"], ".ocd")}</div>` : ""}`}
        <div id="vo-build">${building ? progressHtml(ev.build) : ""}</div>
        <div class="vtp-go vo-actions">
          <button type="button" class="btn ${ready ? "" : "btn-primary"}" id="vo-buildbtn" ${raw(building || (ev.source === "ocad" && !files["map.ocd"]) ? "disabled" : "")}>${t(ready ? "vo.rebuild" : "vo.build")}</button>
          ${ready ? html`<button type="button" class="btn btn-primary" id="vo-pub">${t(ev.published ? "vo.unpublish" : "vo.publish")}</button>` : ""}
          <button type="button" class="btn" id="vo-del">${t("vo.delete")}</button>
        </div>
        ${ready && ev.courses.length ? html`<h3>${t("vo.courses")}</h3><div class="vtp-courses">${ev.courses.map((c) => html`<button type="button" class="vtp-course" data-course="${c.id}">
            <b>${c.name || t(`vt.lvl.${c.id}`)}</b><span>${t("vt.tr.courseLine", { km: fmt(c.length / 1000, 1), climb: fmt(c.climb || 0), n: c.controls.length - 2 })}</span>
            <span class="muted">${t("vo.try")}</span></button>`)}</div>` : ""}
        <h3>${t("vo.settings")}</h3>
        <label>${t("vo.f.name")} <input type="text" id="vo-name" maxlength="80" value="${ev.name}"></label>
        <label>${t("vo.f.type")} <select id="vo-type"><option value="training" ${raw(ev.type === "training" ? "selected" : "")}>${t("vo.type.training")}</option>
          <option value="competition" ${raw(ev.type === "competition" ? "selected" : "")}>${t("vo.type.competition")}</option></select></label>
        <div class="vo-dates" ${raw(ev.type === "competition" ? "" : "hidden")}><label>${t("vo.f.from")} <input type="date" id="vo-from" value="${ev.from}"></label><label>${t("vo.f.to")} <input type="date" id="vo-to" value="${ev.to}"></label></div>
        ${ev.source === "ocad" ? html`<label>${t("vo.f.courses")} <select id="vo-courses"><option value="proposed" ${raw(ev.coursesFrom !== "file" ? "selected" : "")}>${t("vo.courses.proposed")}</option>
          <option value="file" ${raw(ev.coursesFrom === "file" ? "selected" : "")}>${t("vo.courses.file")}</option></select></label>` : ""}
        ${envFields(ev.env)}
        ${moFields(ev.mapOpt, ev.source === "lidar")}
        <p class="vo-err" id="vo-err" hidden></p>
        <div class="vtp-go"><button type="button" class="btn" id="vo-save">${t("vo.save")}</button><span class="muted" id="vo-saved"></span></div>
      </div></div>`;
    const err = $("#vo-err", el), say = (m) => { err.textContent = m; err.hidden = !m; };
    $("#vo-back", el).addEventListener("click", list);
    $("#vo-type", el).addEventListener("change", (e) => { $(".vo-dates", el).hidden = e.target.value !== "competition"; });
    bindEnv();
    $$(".vo-file input[type=file]", el).forEach((inp) => inp.addEventListener("change", async () => {
      const f = inp.files?.[0], name = inp.dataset.file; if (!f) return;
      if (f.size > MAX_MB[name] * 1e6) return say(t("vo.err.size", { mb: MAX_MB[name] }));
      const row = inp.closest(".vo-file"), st = $(".vo-fstate", row);
      st.innerHTML = bar(null);
      try {
        await call(`${API}/${id}/file/${name}`, { method: "PUT", headers: { "Content-Type": "application/octet-stream" }, body: f });
        detail(id);
      } catch (e) { st.textContent = ""; say(errText(e)); }
    }));
    // « Une carte du club » (docs/clubs/design.md §2): its OCAD file sent as the event's map, its source kept (rights.pixel)
    bindPicker($("#vo-club", el), "pixel", async (list, src) => {
      const f = list[0];
      if (f.size > MAX_MB["map.ocd"] * 1e6) return say(t("vo.err.size", { mb: MAX_MB["map.ocd"] }));
      try {
        await call(`${API}/${id}/file/map.ocd`, { method: "PUT", headers: { "Content-Type": "application/octet-stream" }, body: f });
        await post(`${API}/${id}`, { orgMap: sourceOf(src) }, "PUT");
        detail(id);
      } catch (e) { say(errText(e)); }
    }, { only: (n) => /\.ocd$/i.test(n) });
    $("#vo-buildbtn", el)?.addEventListener("click", async () => {
      try { const r = await post(`${API}/${id}/build`); if (!r.started) say(t("vo.notStarted")); detail(id); } catch (e) { say(errText(e)); }
    });
    $("#vo-pub", el)?.addEventListener("click", async () => {
      try { await post(`${API}/${id}`, { published: !ev.published }, "PUT"); onChange?.(); detail(id); } catch (e) { say(errText(e)); }
    });
    $("#vo-del", el).addEventListener("click", async () => {
      if (!(await confirmBox(t("vo.confirmDelete", { name: ev.name }), { ok: t("vo.delete") }))) return;
      try { await call(`${API}/${id}`, { method: "DELETE" }); onChange?.(); list(); } catch (e) { alertBox(errText(e)); }
    });
    $("#vo-save", el).addEventListener("click", async () => {
      const body = { name: $("#vo-name", el).value.trim(), type: $("#vo-type", el).value, from: $("#vo-from", el).value, to: $("#vo-to", el).value, env: readEnv(), mapOpt: readMo() };
      if ($("#vo-courses", el)) body.courses = $("#vo-courses", el).value;
      try { await post(`${API}/${id}`, body, "PUT"); onChange?.(); detail(id); } catch (e) { say(errText(e)); }
    });
    $$(".vtp-course[data-course]", el).forEach((b) => b.addEventListener("click", () => onPlay?.(ev, ev.courses.find((c) => c.id === b.dataset.course))));
    if (building) poll(id);
  }
  const fileRow = (name, label, size, accept) => html`<div class="vo-file"><span>${label}</span>
    <span class="vo-fstate muted">${size ? t("vo.file.sent", { mb: fmt(size / 1e6, 1) }) : t("vo.file.none")}</span>
    <label class="btn btn-sm">${t(size ? "vo.file.replace" : "vo.file.choose")}<input type="file" accept="${accept}" data-file="${name}" hidden></label></div>`;
  const progressHtml = (b) => html`<div class="vo-prog">${raw(bar(b && b.frac > 0 ? b.frac : null))}
    <span class="muted" id="vo-stage">${stageText(b)}</span></div>`;
  const stageText = (b) => {
    if (!b) return t("vo.stage.queued");
    const since = b.at ? (Date.now() - Date.parse(b.at)) / 1000 : 0;
    return `${t(`vo.stage.${b.stage || "queued"}`)}${b.frac ? ` · ${pct(b.frac)}` : ""}${since > 0 ? ` · ${t("vo.stage.since", { t: elapsed(since) })}` : ""}`;
  };
  function poll(id) {
    let on = true, timer = 0;
    const tick = async () => {
      if (!on || !el.isConnected) return;
      try {
        const ev = await call(`${API}/${id}`);
        if (!["queued", "building"].includes(ev.status) && !(ev.build && ev.build.stage)) { detail(id); return; }
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
