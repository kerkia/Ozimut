// Pixel › Compétitions (owner, 2026-11-28; docs/pixel/competitions.md §6, behind games/vnext.js): the competitions — the week's,
// invented by the site (« Compétition de la semaine », games/vweek.js), and the organisers' (their map and courses) —, played
// once, on one course, without a pause.
// - The list: « En cours », « À venir », « Terminées », a card each (name, kind, format, dates, conditions, entrants, one's own
//   state), from /api/virtual/comp (§3.1). A card chosen (?c=<id>) shows its detail under the list — on a phone right under its
//   card, as Training's maps.
// - The detail: a week's world made in this browser first (its courses are known only then; the same world for everyone, its
//   signature `sig` sent with the registration and the run), then the courses — figures, an estimate of the time needed without a
//   break (the race clock runs twice the wall clock: play time = race time ÷ 2), entrants —; « S'inscrire sur ce circuit », changed
//   or withdrawn while not started; « Prendre le départ » once registered and open: a confirmation (one attempt, no pause, about
//   how long, a tab closed or « Abandonner » = abandoned), then the game in place (games/virtually.js mount: countdown, noPause,
//   beforeStart = POST start, onFinish = POST runs, onAbandon = POST runs { dnf }).
// - Its results under it (times only while it runs), read again every 30 s while shown; once over, « Analyser » (Analyse).
// A run under way: leaving the page or closing the tab warns first, and counts as abandoned (the server also counts a start
// without a run for 6 hours as one).

import { html, raw, $, $$, fmt, fmtDate, displayName } from "../util.js";
import { t, tn } from "../i18n.js";
import { envText } from "../games/vweather.js";
import { confirmBox } from "../askbox.js";
import { courseSig } from "./virtuallysrc.js";

const API = "/api/virtual/comp";
const ERRORS = ["bad request", "closed", "not registered", "started", "already run", "other course", "not found"];
const WEEK_COLOUR = { a: "#8e3fbf", b: "#f08a1c", c: "#e2bd12" };
const SECTIONS = ["open", "soon", "over"];
const REFRESH_MS = 30000;

async function call(path, { method = "GET", body, keepalive = false } = {}) {
  let r;
  try {
    r = await fetch(`${API}${path}`, { method, credentials: "same-origin", cache: "no-store", keepalive,
      headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
  } catch (e) { return { ok: false, status: 0, error: "network" }; }
  let data = null;
  try { data = await r.json(); } catch (e) { data = null; }
  return { ok: r.ok, status: r.status, data, error: r.ok ? null : data?.error || String(r.status) };
}
/** An error's words, by the server's code (§3.1), else a plain one. */
const errText = (code) => (ERRORS.includes(code) ? t(`vc.err.${code.replace(/ /g, "_")}`) : code === "network" ? t("vc.err.network") : t("vc.err.other"));
const sumOf = (o) => Object.values(o || {}).reduce((a, n) => a + (Number(n) || 0), 0);
const nControls = (c) => (Array.isArray(c.controls) ? Math.max(0, c.controls.length - 2) : Number(c.controls) || 0);
/** Minutes, rounded as one says them: to the minute under 10, else to 5. */
const r5 = (x) => (x < 10 ? Math.max(1, Math.round(x)) : Math.round(x / 5) * 5);
/** The play time a course needs without a break, a range in minutes (an estimate): the race time of the fastest — forest 7.5 min a
 *  km and 1 min a 10 m of climb, sprint 5 min a km — up to twice that for most runners; the race clock runs twice the wall clock. */
export function estimate(course, sprint) {
  const km = (course.length || 0) / 1000, climb = course.climb || 0;
  // a week's course carries the generator's own estimate (`min`: race minutes at the game's x1, games/vgenworker.js)
  const fast = course.min > 0 ? course.min : (sprint ? 5 : 7.5) * km + climb / 10;
  return [r5(fast / 2), r5(fast)];
}

/**
 * Draw Compétitions in `el`; returns the cleanup. ctx (pages/virtually.js): mapName(id), weekName(id), courseName(course), swatch(id),
 * clock(s), mySeed() → Promise of the account's seed, savedView(), setView(v), ghostCount(), setGhostCount(n), GHOSTS_MAX, levels,
 * noteComps(list), weekWorld(id, onStep) → Promise of the week's race ({ id, sig, format, race: { scale, courses }, load }),
 * changed() (runs or registrations changed), analyse(id) (the Analyse page on it), setQuery(q), getQuery().
 */
export async function renderComp(el, ctx) {
  let alive = true, list = [], sel = ctx.getQuery().c || null, pick = null, game = null, running = null, timer = 0, results = null, saving = null;
  const worlds = new Map();                          // the weeks' races made (resolved), by id
  const fails = new Set();                           // the weeks whose world could not be made
  const busy = new Map();                            // the weeks being made: { step, f }

  // ---- a run under way: leaving warns, and counts as abandoned ----------------------------------------------------------
  const onBeforeUnload = (e) => { if (!running) return; e.preventDefault(); e.returnValue = ""; };
  const onPageHide = () => { if (running) abandon(true); };
  addEventListener("beforeunload", onBeforeUnload);
  addEventListener("pagehide", onPageHide);
  async function abandon(keepalive = false) {
    const r = running;
    running = null;
    if (!r) return;
    await call(`/${encodeURIComponent(r.c.id)}/runs`, { method: "POST", body: { course: r.course.id, dnf: true }, keepalive });
    ctx.changed();
  }
  const stopGame = () => { try { game?.stop(); } catch (e) { /* gone */ } game = null; };

  // ---- the list -----------------------------------------------------------------------------------------------------------
  el.innerHTML = html`<div class="boot"><div class="spinner"></div></div>`;
  async function load() {
    const r = await call("");
    if (!r.ok) throw Object.assign(new Error(r.error), { status: r.status, code: r.error });
    list = Array.isArray(r.data?.comps) ? r.data.comps : [];
    ctx.noteComps(list);
  }
  try { await load(); } catch (e) {
    el.innerHTML = html`<div class="card"><div class="empty">${e.code === "closed" || e.status === 403 ? t("vc.closedAll") : t("vc.err.load")}</div></div>`;
    return cleanup;
  }
  if (sel && !list.some((c) => c.id === sel)) sel = null;

  const compName = (c) => (c.kind === "week" ? ctx.weekName(c.id) : c.name || c.id);
  const fmtName = (c) => (["ld", "md", "sprint"].includes(c.format) ? t(`vc.fmt.${c.format}`) : "");
  const datesText = (c) => (c.from && c.to ? (c.from === c.to ? fmtDate(c.from) : t("vc.dates", { from: fmtDate(c.from), to: fmtDate(c.to) })) : "");
  const stateText = (c) => (c.state === "soon" ? t("vc.state.soon", { date: fmtDate(c.from) }) : c.state === "over" ? t("vc.state.over", { date: fmtDate(c.to) })
    : t("vc.state.open", { date: fmtDate(c.to) }));
  const coursesOf = (c) => (c.kind === "week" ? worlds.get(c.id)?.race?.courses || [] : c.courses || []);
  const courseLabel = (c, course) => (c.kind === "week" ? t(`vc.course.${course.id}`) : ctx.courseName(course));
  const swatchOf = (c, id) => (c.kind === "week" ? html`<span class="vtp-sw" style="background:${WEEK_COLOUR[id] || "#888"}"></span>` : ctx.swatch(id));
  const isSprint = (c) => c.format === "sprint" || (c.kind === "week" ? (worlds.get(c.id)?.race?.scale || 10000) <= 5000 : (c.scale || 10000) <= 5000);
  const courseById = (c, id) => coursesOf(c).find((x) => x.id === id) || (id ? { id, name: id } : null);
  /** One's own state in a competition: registered, run, abandoned, started. */
  const myText = (c) => {
    const m = c.my;
    if (!m || !m.course) return "";
    const course = courseById(c, m.course), name = course ? courseLabel(c, course) : m.course;
    if (m.done) return t("vc.my.done", { course: name, time: ctx.clock(m.t) });
    if (m.dnf) return t("vc.my.dnf", { course: name });
    if (m.started) return t("vc.my.started", { course: name });
    return t("vc.my.reg", { course: name });
  };

  function card(c) {
    const pressed = c.id === sel, thumb = c.kind === "week"
      ? html`<span class="vtp-genthumb ${raw(c.format === "sprint" ? "vtp-genthumb-sday" : "")}" aria-hidden="true"></span>`
      : c.thumb && c.base ? html`<img src="${c.base}thumb.webp" alt="" loading="lazy">` : html`<span class="vtp-nothumb"></span>`;
    const n = sumOf(c.entrants), env = envText(t, c.env), mine = myText(c);
    return html`<button type="button" class="vtp-map card vcp-card" data-c="${c.id}" aria-pressed="${pressed}">${thumb}
      <b>${compName(c)}</b>
      <span><span class="tag ${raw(c.kind === "week" ? "vcp-week" : "vo-comp")}">${c.kind === "week" ? t("vc.kind.week") : c.org || t("vc.kind.orga")}</span>${fmtName(c) ? html` <span class="muted">${fmtName(c)}</span>` : ""}</span>
      <span class="muted">${datesText(c)}</span>
      ${env ? html`<span class="vtp-env">${env}</span>` : ""}
      ${c.state !== "soon" || n ? html`<span class="muted">${tn("vc.entrants", n)}</span>` : ""}
      ${mine ? html`<span class="vcp-mine">${mine}</span>` : ""}</button>`;
  }
  function drawList() {
    if (!alive) return;
    const narrow = matchMedia("(max-width: 640px)").matches;
    // a past week nobody entered is not listed (the eight weeks before would fill « Terminées » with empty cards)
    const ran = (c) => !!c.my || Object.values(c.entrants || {}).some((n) => n > 0);
    const byState = (s) => list.filter((c) => (c.state || "open") === s && (s !== "over" || c.kind !== "week" || ran(c)));
    el.innerHTML = html`<p class="muted vtp-intro">${t("vc.intro")}</p>
      ${list.length ? "" : html`<div class="card"><div class="empty">${t("vc.none")}</div></div>`}
      ${SECTIONS.map((s) => { const cs = byState(s); return cs.length ? html`<h2 class="vtp-h">${t(`vc.sec.${s}`)}</h2>
        <div class="vtp-maps vcp-cards">${cs.map((c) => html`${card(c)}${narrow && c.id === sel ? raw('<div class="vtp-inline vcp-inline"></div>') : ""}`)}</div>` : ""; })}
      <div class="vcp-detail" id="vcp-detail"></div>`;
    const host = $("#vcp-detail", el);
    if (narrow && sel) $(".vcp-inline", el)?.append(host);
    $$(".vcp-card", el).forEach((b) => b.addEventListener("click", () => {
      sel = b.dataset.c === sel ? null : b.dataset.c; pick = null; results = null;
      ctx.setQuery({ c: sel });
      drawList();
      if (sel) requestAnimationFrame(() => $("#vcp-detail", el)?.scrollIntoView({ block: "nearest", behavior: "smooth" }));
    }));
    if (sel) drawDetail();
  }

  // ---- a competition chosen -----------------------------------------------------------------------------------------------
  function drawDetail() {
    const host = $("#vcp-detail", el), c = list.find((x) => x.id === sel);
    if (!host || !c) return;
    const env = envText(t, c.env);
    const head = html`<h2 class="vtp-h">${compName(c)}</h2>
      <p class="muted vcp-line">${[c.kind === "week" ? t("vc.kind.weekLong") : c.org ? t("vc.byOrg", { org: c.org }) : "", fmtName(c), datesText(c), env].filter(Boolean).join(" · ")}</p>
      <p class="vcp-state"><b>${stateText(c)}</b>${c.ghosts ? html` · <span class="muted">${t("vc.ghostsOn")}</span>` : ""}</p>`;
    // a week's courses: its world made here first (the week to come: its name and format only)
    if (c.kind === "week" && c.state === "soon") {
      host.innerHTML = html`<div class="card vcp-box">${head}<p class="muted">${t("vc.week.soon")}</p></div>`;
      return;
    }
    if (c.kind === "week" && !worlds.has(c.id)) {
      const b = busy.get(c.id);
      host.innerHTML = html`<div class="card vcp-box">${head}
        ${fails.has(c.id) ? html`<p class="vtg-err">${t("vc.week.err")}</p><button type="button" class="btn btn-primary" id="vcp-make">${t("vc.week.retry")}</button>`
          : html`<p class="muted">${t("vc.week.making")}</p><div class="vtg-busy" id="vcp-busy"><progress class="wait-bar" max="1" ${raw(b ? `value="${b.f}"` : "")}></progress>
            <span class="muted">${b ? t(`vtg.step.${b.step}`) : t("vtg.step.relief")}</span></div>`}</div>`;
      $("#vcp-make", host)?.addEventListener("click", () => { fails.delete(c.id); makeWorld(c); drawDetail(); });
      if (!fails.has(c.id)) makeWorld(c);
      return;
    }
    const courses = coursesOf(c), m = c.my || null, started = !!(m && (m.started || m.done || m.dnf));
    if (pick == null || !courses.some((x) => x.id === pick)) pick = m?.course && courses.some((x) => x.id === m.course) ? m.course : null;
    const sprint = isSprint(c), lines = c.kind === "week" && ["ld", "md", "sprint"].includes(c.format);
    host.innerHTML = html`<div class="card vcp-box">${head}
      <h3 class="vtp-h3">${t("vc.courses")}</h3>
      ${courses.length ? html`<div class="vtp-courses">${courses.map((x) => { const [a, b] = estimate(x, sprint), n = Number(c.entrants?.[x.id]) || 0;
        return html`<button type="button" class="vtp-course vcp-course" data-course="${x.id}" aria-pressed="${x.id === pick}" ${raw(started || c.state === "over" ? "disabled" : "")}>
          ${swatchOf(c, x.id)}<b>${courseLabel(c, x)}${m?.course === x.id ? html` <span class="tag">${t("vc.myCourse")}</span>` : ""}</b>
          <span>${t("vt.tr.courseLine", { km: fmt((x.length || 0) / 1000, 1), climb: fmt(x.climb || 0), n: nControls(x) })}</span>
          ${lines ? html`<span class="muted">${t(`vc.cl.${c.format}.${x.id}`)}</span>` : ""}
          <span class="muted">${t("vc.est", { a: fmt(a), b: fmt(b) })}</span>
          <span class="muted">${tn("vc.entrants", n)}</span></button>`; })}</div>` : html`<p class="muted">${t("vc.noCourse")}</p>`}
      <div class="vtp-go vcp-actions">${actions(c, courses)}</div>
      <p class="vcp-msg" id="vcp-msg" role="status"></p>
      <h3 class="vtp-h3">${t("vc.results")}</h3><div id="vcp-res"><div class="boot"><div class="spinner"></div></div></div></div>`;
    $$(".vcp-course", host).forEach((b) => b.addEventListener("click", () => { pick = b.dataset.course; drawDetail(); }));
    $("#vcp-reg", host)?.addEventListener("click", () => register(c));
    $("#vcp-unreg", host)?.addEventListener("click", () => unregister(c));
    $("#vcp-start", host)?.addEventListener("click", () => start(c));
    $("#vcp-an", host)?.addEventListener("click", () => ctx.analyse(c.id));
    $("#vcp-view", host)?.addEventListener("change", (e) => ctx.setView(e.target.value));
    $("#vcp-ghosts", host)?.addEventListener("change", (e) => ctx.setGhostCount(Number(e.target.value)));
    if (results?.id === c.id) drawResults(c); else refreshResults(c);
  }
  /** The buttons by one's state: register, change, withdraw, start; once over, analyse. */
  function actions(c, courses) {
    const m = c.my || null, mine = myText(c);
    const status = mine ? html`<span class="vcp-mine">${mine}</span>` : "";
    if (c.state === "over") return html`${status}<button type="button" class="btn btn-primary" id="vcp-an">${t("vc.analyse")}</button>`;
    if (m && (m.started || m.done || m.dnf)) return html`${status}${m.done || m.dnf ? html`<span class="muted">${t("vc.oneAttempt")}</span>` : ""}`;
    if (!courses.length) return status;
    if (m?.course) {
      const other = pick && pick !== m.course;
      return html`${status}
        ${other ? html`<button type="button" class="btn" id="vcp-reg">${t("vc.change")}</button>` : ""}
        <button type="button" class="btn" id="vcp-unreg">${t("vc.unregister")}</button>
        ${c.state === "open" && !other ? html`${choosers(c)}<button type="button" class="btn btn-primary" id="vcp-start">${t("vc.start")}</button>` : ""}
        ${c.state !== "open" ? html`<span class="muted">${t("vc.notYet", { date: fmtDate(c.from) })}</span>` : ""}`;
    }
    return html`<button type="button" class="btn btn-primary" id="vcp-reg" ${raw(pick ? "" : "disabled")}>${t("vc.register")}</button>
      <span class="muted">${pick ? t("vc.regHint") : t("vc.pickCourse")}</span>`;
  }
  /** The view the race starts in, and the ghosts when the organiser allowed them. */
  function choosers(c) {
    const v = ctx.savedView(), g = ctx.ghostCount();
    return html`<label class="vtp-ghosts" title="${t("vt.view.tip")}">${t("vt.view.label")}
      <select id="vcp-view">${["third", "first"].map((x) => html`<option value="${x}" ${raw(x === v ? "selected" : "")}>${t(`vt.view.opt.${x}`)}</option>`)}</select></label>
      ${c.ghosts ? html`<label class="vtp-ghosts" title="${t("vc.ghostsTip")}">${t("vt.gh.label")}
        <select id="vcp-ghosts">${Array.from({ length: ctx.GHOSTS_MAX + 1 }, (_, i) => html`<option value="${i}" ${raw(i === g ? "selected" : "")}>${i ? fmt(i) : t("vt.gh.none")}</option>`)}</select></label>` : ""}`;
  }
  const say = (text, bad = false) => { const p = $("#vcp-msg", el); if (p) { p.textContent = text || ""; p.classList.toggle("vtg-err", !!bad); } };

  function makeWorld(c) {
    if (busy.has(c.id) || worlds.has(c.id)) return;
    busy.set(c.id, { step: "relief", f: 0 });
    let last = 0;
    const onStep = async (step, f) => {
      let share = f;
      try { share = (await import("./virtuallygen.js")).progressOf(step, f, c.format === "sprint"); } catch (e) { /* the raw share */ }
      busy.set(c.id, { step, f: share });
      const now = performance.now(); if (now - last < 120) return; last = now;
      const box = alive && sel === c.id && $("#vcp-busy", el);
      if (box) { box.querySelector("progress").value = share; box.querySelector("span").textContent = t(`vtg.step.${step}`); }
    };
    ctx.weekWorld(c.id, onStep).then((w) => {
      worlds.set(c.id, w);
      busy.delete(c.id);
      if (alive && sel === c.id && !game) drawDetail();
    }).catch((e) => {
      console.error(e);
      busy.delete(c.id); fails.add(c.id);
      if (alive && sel === c.id && !game) drawDetail();
    });
  }

  // ---- registration -------------------------------------------------------------------------------------------------------
  /** Read the list again (one's state, the entrants), the competition chosen kept. */
  async function reload() {
    try { await load(); } catch (e) { /* the list as it was */ }
    if (alive && !game) drawList();
  }
  async function register(c) {
    if (!pick) return;
    const body = { course: pick, ...(c.kind === "week" ? { sig: worlds.get(c.id)?.sig || "" } : {}) };
    say(t("vc.saving"));
    const r = await call(`/${encodeURIComponent(c.id)}/register`, { method: "POST", body });
    if (!r.ok) { say(errText(r.error), true); return; }
    if (r.data?.my) c.my = r.data.my;
    results = null;
    ctx.changed();
    await reload();
    say(t("vc.registered"));
  }
  async function unregister(c) {
    if (!(await confirmBox(t("vc.unregisterQ"), { ok: t("vc.unregister") }))) return;
    const r = await call(`/${encodeURIComponent(c.id)}/register`, { method: "DELETE" });
    if (!r.ok) { say(errText(r.error), true); return; }
    c.my = null; pick = null; results = null;
    ctx.changed();
    await reload();
    say(t("vc.unregistered"));
  }

  // ---- the run --------------------------------------------------------------------------------------------------------------
  async function start(c) {
    const course = courseById(c, c.my?.course);
    if (!course) return;
    const [a, b] = estimate(course, isSprint(c));
    const ok = await confirmBox(t("vc.start.confirm", { course: courseLabel(c, course), a: fmt(a), b: fmt(b) }), { ok: t("vc.start.go") });
    if (!ok || !alive) return;
    stopTimer();
    const title = `${compName(c)} · ${courseLabel(c, course)}`;
    el.innerHTML = html`<p class="vtp-back"><b>${title}</b> <span class="muted">${t("vc.oneAttempt")}</span></p>
      <div class="g-root card vtp-game"><div class="card-body"></div></div>`;
    const w = c.kind === "week" ? worlds.get(c.id) : null;
    const back = async () => { stopGame(); results = null; await reload(); startTimer(); };
    let mount;
    try { ({ mount } = await import("../games/virtually.js")); } catch (e) { console.error(e); await back(); say(t("vt.error"), true); return; }
    if (!alive) return;
    const seed = ctx.mySeed();
    const tex = c.kind !== "week" && c.base && Array.isArray(c.tex) && c.tex.length ? Object.fromEntries(c.tex.map((role) => [role, `${c.base}tex-${role}.webp`])) : undefined;
    game = mount($(".vtp-game .card-body", el), c.id, {
      course: course.id, title,
      base: c.kind !== "week" ? c.base : undefined,
      race: w ? w.race : { id: c.id, scale: c.scale, std: c.std, source: c.source === "lidar" ? "lidaronly" : "lidar", lonlat: c.lonlat, courses: c.courses || [] },
      load: w ? w.load : undefined,
      env: c.env || undefined, tex,
      map: null,                                          // a competition: the whole map
      view: ctx.savedView(),
      countdown: true, noPause: true,
      ghosts: c.ghosts ? rivals(c, course) : [],
      beforeStart: async () => {
        const r = await call(`/${encodeURIComponent(c.id)}/start`, { method: "POST", body: { course: course.id, ...(c.kind === "week" ? { sig: worlds.get(c.id)?.sig || "" } : {}) } });
        if (!r.ok) return errText(r.error);
        running = { c, course };
        ctx.changed();
        return true;
      },
      onFinish: (run) => (saving = (async () => {
        const note = () => $("#vt-saved", el);
        const body = { course: course.id, t: run.t, sp: run.sp, d: run.d, route: run.route, cs: Array.isArray(course.controls) ? courseSig(course) : "", seed: await seed,
          ...(c.kind === "week" ? { sig: w?.sig || "" } : {}) };
        let r = await call(`/${encodeURIComponent(c.id)}/runs`, { method: "POST", body });
        if (!r.ok && r.status === 0) r = await call(`/${encodeURIComponent(c.id)}/runs`, { method: "POST", body });   // the network: once more
        running = null;
        ctx.changed();
        if (note()) note().textContent = r.ok ? t("vt.saved") : `${t("vt.notSaved")} ${errText(r.error)}`;
        results = null;
      })()),
      onAbandon: async () => { await abandon(); await back(); say(t("vc.abandoned")); },
      navs: ["results"], resultsLabel: t("vt.toResults"),
      onNav: async () => { await saving; await back(); },
      onExit: async () => { if (running) await abandon(); await back(); },
    });
  }
  /** The rivals' finished runs of the course replayed beside the runner (an organiser allowed it): the fastest, then those nearest
   *  the field's median, their routes read one by one. */
  async function rivals(c, course) {
    const n = ctx.ghostCount();
    if (!n) return [];
    const r = await call(`/${encodeURIComponent(c.id)}/results`);
    const rows = (r.data?.courses?.[course.id] || []).filter((x) => x.state === "ok" && x.run && !x.mine && x.t > 0).sort((a, b) => a.t - b.t);
    const mid = rows[Math.floor(rows.length / 2)]?.t;
    const chosen = rows.length ? [rows[0], ...rows.slice(1).sort((a, b) => Math.abs(a.t - mid) - Math.abs(b.t - mid))].slice(0, n) : [];
    const got = await Promise.all(chosen.map(async (x) => {
      try {
        const q = await fetch(`/api/virtual/runs/${encodeURIComponent(c.id)}/${encodeURIComponent(x.run)}`, { credentials: "same-origin", cache: "no-store" });
        if (!q.ok) return null;
        const d = await q.json();
        return { name: displayName(x.name), t: x.t, mine: false, route: d.route || [] };
      } catch (e) { return null; }
    }));
    return got.filter((g) => g && g.route.length > 1);
  }

  // ---- the results ------------------------------------------------------------------------------------------------------------
  async function refreshResults(c) {
    const r = await call(`/${encodeURIComponent(c.id)}/results`);
    if (!alive || sel !== c.id) return;
    results = { id: c.id, ok: r.ok, over: !!r.data?.over, courses: r.data?.courses || {}, error: r.error };
    if (!game) drawResults(c);
  }
  function drawResults(c) {
    const box = $("#vcp-res", el);
    if (!box || !results) return;
    if (!results.ok) { box.innerHTML = String(html`<p class="muted">${errText(results.error)}</p>`); return; }
    const known = coursesOf(c).map((x) => x.id), ids = [...known, ...Object.keys(results.courses).filter((k) => !known.includes(k))];
    const blocks = ids.map((id) => {
      const rows = results.courses[id] || [];
      if (!rows.length) return "";
      const ok = rows.filter((x) => x.state === "ok" && x.t > 0).sort((a, b) => a.t - b.t);
      ok.forEach((x, i) => { x._place = i && x.t === ok[i - 1].t ? ok[i - 1]._place : i + 1; });
      const rest = [...rows.filter((x) => x.state === "running"), ...rows.filter((x) => x.state === "dnf")];
      const best = ok[0]?.t, course = courseById(c, id);
      return html`<h4 class="vcp-rh">${swatchOf(c, id)} ${course ? courseLabel(c, course) : id} <span class="muted">· ${tn("vc.ranked", ok.length)}</span></h4>
        <div class="table-wrap"><table class="data vcp-res"><thead><tr><th class="num">${t("vt.col.place")}</th><th>${t("vt.col.runner")}</th>
          <th class="num">${t("vt.col.time")}</th><th class="num">${t("vt.col.gap")}</th></tr></thead>
        <tbody>${ok.map((x) => html`<tr class="${x.mine ? "vtp-me" : ""}"><td class="num">${x._place}</td><td>${displayName(x.name)}${x.mine ? html` <span class="tag">${t("vt.me")}</span>` : ""}</td>
          <td class="num"><b>${ctx.clock(x.t)}</b></td><td class="num">${x._place > 1 && best != null ? `+${ctx.clock(x.t - best)}` : ""}</td></tr>`)}
          ${rest.map((x) => html`<tr class="${x.mine ? "vtp-me" : ""}"><td class="num"></td><td>${displayName(x.name)}${x.mine ? html` <span class="tag">${t("vt.me")}</span>` : ""}</td>
          <td class="num"><span class="dim">${t(x.state === "running" ? "vc.res.running" : "vc.res.dnf")}</span></td><td></td></tr>`)}</tbody></table></div>`;
    }).filter((b) => String(b));
    box.innerHTML = String(blocks.length ? html`${raw(blocks.map(String).join(""))}${results.over ? "" : html`<p class="muted vcp-note">${t("vc.res.live")}</p>`}`
      : html`<p class="muted">${t("vc.res.none")}</p>`);
  }
  function startTimer() {
    stopTimer();
    timer = setInterval(() => {
      if (!alive || game || document.hidden || !sel) return;
      const c = list.find((x) => x.id === sel);
      if (c && c.state !== "soon" && (c.kind !== "week" || worlds.has(c.id))) refreshResults(c);
    }, REFRESH_MS);
  }
  function stopTimer() { if (timer) clearInterval(timer); timer = 0; }

  function cleanup() {
    alive = false;
    stopTimer();
    if (running) abandon(true);                       // the page left during the run: abandoned (as a tab closed)
    stopGame();
    removeEventListener("beforeunload", onBeforeUnload);
    removeEventListener("pagehide", onPageHide);
  }
  drawList();
  startTimer();
  return cleanup;
}
