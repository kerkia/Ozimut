// « Suivi GPS » (Coach; 2026-11-21, docs/track/design.md): runners without a GPS watch and children followed live by their
// parents. Three tabs — « Suivre » (the accounts one may follow and their run under way), « Mes traces » (the runs kept,
// imported from a file, a health app or Polar, handed to the analyses) and « Famille et appareils » (children's accounts,
// devices paired, watchers chosen) — and a watch page per followed account (#/suivi/<id>): its track on a base map, replayed
// smoothly `batch + 10` seconds behind, its state, battery and alerts. Recording is the Ozimut app's (or a watch's, or
// Traccar Client's); this page never asks for the browser's position to track.
// Addresses: #/suivi (Suivre), #/mes-traces, #/famille, #/suivi/<id> or #/suivi/moi; the codes a parent or a watcher is sent:
// #/famille?suivre=<code> (become a watcher), ?parent=<code> (become a child's second guardian), ?rattacher=<code> (an
// under-15's own account asks a parent), ?reprendre=<token> (a child account taken over by the young person).

import { html, raw, $, $$, fmt, fmtDate, fmtTime, dateFormat, fileAccept, pctN } from "../util.js";
import { t, loadArea } from "../i18n.js";
import * as auth from "../auth.js";
import { pageTabs, bindPageTabs, tabFrom } from "../ui.js";
import { confirmBox, alertBox } from "../askbox.js";
import * as bridge from "../appbridge.js";
import * as TM from "../trackmap.js";
import { qrSvg } from "../phonelink.js";

await loadArea("track");

const COLOURS = ["#d4561a", "#1f6fd1", "#2f9e44", "#9c36b5", "#c92a2a", "#0b7285"];
const TABS = () => [["suivi", t("trk.tab.follow")], ["traces", t("trk.tab.runs")], ["famille", t("trk.tab.family")]];

async function api(path, body, method) {
  const opts = { credentials: "same-origin", cache: "no-store", method: method || (body ? "POST" : "GET") };
  if (body) { opts.body = JSON.stringify(body); opts.headers = { "Content-Type": "application/json" }; }
  try {
    const r = await fetch(`api/track/${path}`, opts);
    let data = null;
    try { data = await r.json(); } catch (e) { /* not JSON */ }
    return { ok: r.ok, status: r.status, data: data || {} };
  } catch (e) { return { ok: false, status: 0, data: {} }; }
}
const ERRORS = new Set(["code", "rate", "too many", "forbidden", "fields", "birthYear", "email", "email_taken", "password", "under15",
  "token", "self", "not ready", "login required"]);
const errText = (r) => (r.status === 0 ? t("trk.err.network") : ERRORS.has(r.data?.error)
  ? t(`trk.err.${r.data.error.replace(/\s+(\w)/g, (m, c) => c.toUpperCase())}`) : t("trk.err.generic"));
const clock = (iso) => (iso ? dateFormat({ hour: "2-digit", minute: "2-digit" }).format(new Date(iso)) : "—");
const dayTime = (iso) => (iso ? `${fmtDate(iso.slice(0, 10))} ${clock(iso)}` : "—");
const km = (m) => t("trk.km", { n: fmt((m || 0) / 1000, 2) });
const ago = (ms) => {
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
  return s < 60 ? t("trk.ago.s", { n: s }) : s < 3600 ? t("trk.ago.m", { n: Math.round(s / 60) }) : t("trk.ago.h", { n: fmt(s / 3600, 1) });
};
/** The trace form (deltas, millionths of a degree) -> [[t, lat, lon, acc]] in degrees. */
function decode(rec) {
  const out = [];
  if (!rec?.dt) return out;
  let tt = rec.t0 || 0, la = 0, lo = 0;
  for (let i = 0; i < rec.dt.length; i++) {
    tt += rec.dt[i]; la += rec.la[i]; lo += rec.lo[i];
    out.push([tt, la / 1e6, lo / 1e6, rec.ac ? rec.ac[i] : 0]);
  }
  return out;
}
/** Points [{ ms, lat, lon, ele }] -> the trace form the server keeps. */
function encode(pts) {
  const rec = { v: 1, t0: Math.round(pts[0].ms / 1000), dt: [], la: [], lo: [], ac: [] };
  let pt = null, pla = 0, plo = 0;
  for (const p of pts) {
    const tt = Math.round(p.ms / 1000), la = Math.round(p.lat * 1e6), lo = Math.round(p.lon * 1e6);
    if (pt != null && tt <= pt) continue;
    rec.dt.push(pt == null ? 0 : tt - pt); rec.la.push(pt == null ? la : la - pla); rec.lo.push(pt == null ? lo : lo - plo); rec.ac.push(0);
    pt = tt; pla = la; plo = lo;
  }
  return rec;
}
function dialog(inner) {
  const d = document.createElement("dialog");
  d.className = "trk-dlg";
  d.innerHTML = `<form method="dialog" class="trk-dlg-x"><button class="btn btn-sm" aria-label="${t("trk.close")}">✕</button></form>${inner}`;
  document.body.append(d);
  d.addEventListener("close", () => d.remove());
  window.addEventListener("hashchange", () => { if (d.open) d.close(); }, { once: true });     // never left over another page
  d.addEventListener("click", (e) => { if (e.target === d) d.close(); });
  d.showModal();
  return d;
}
/** A line of text asked in the page (never the browser's prompt: CLAUDE.md « No confirm() or alert() »). -> the text or null */
function askText(title, value = "", { max = 80 } = {}) {
  const d = dialog(html`<h3>${title}</h3><form method="dialog" class="trk-form trk-ask"><input name="v" maxlength="${max}" value="${value}" required>
    <button class="btn btn-primary" value="ok">${t("trk.ok")}</button></form>`.s);
  const inp = $(".trk-ask input", d);
  inp.focus(); inp.select();
  return new Promise((ok) => d.addEventListener("close", () => ok(d.returnValue === "ok" ? inp.value.trim() : null)));
}
/** A code to hand over: its QR code, its link, a copy button. */
async function showCode(title, text, url, code = null) {
  const d = dialog(html`<h3>${title}</h3><p>${text}</p>
    <div class="trk-qr">${raw(await qrSvg(url).catch(() => ""))}</div>
    ${code ? html`<p class="trk-code">${code}</p>` : ""}
    <div class="trk-copy"><input type="text" readonly value="${url}"><button type="button" class="btn btn-sm">${t("trk.copy")}</button></div>
    ${navigator.share ? html`<p><button type="button" class="btn btn-sm trk-share">${t("trk.share")}</button></p>` : ""}`.s);
  const inp = $("input", d);
  $(".trk-copy button", d).addEventListener("click", async () => {
    try { await navigator.clipboard.writeText(url); } catch (e) { inp.select(); document.execCommand("copy"); }
    $(".trk-copy button", d).textContent = t("trk.copied");
  });
  $(".trk-share", d)?.addEventListener("click", () => navigator.share({ title, text, url }).catch(() => {}));
}

// =====================================================================================================================

export async function render(main, { arg = null, query = {}, path = "" } = {}) {
  const me = auth.session();
  if (!me) { main.innerHTML = html`<section class="card"><p>${t("trk.needAccount")}</p><p><a class="btn btn-primary" href="#/?s=login">${t("trk.signIn")}</a></p></section>`.s; return; }
  if (arg) return watchPage(main, arg === "moi" ? me.uid : Number(arg));
  main.innerHTML = html`<div class="spinner"></div>`.s;
  const st = await api("me");
  if (!st.ok) {
    main.innerHTML = html`<section class="card"><p>${st.status === 403 ? t("trk.notOpen") : st.status === 503 ? t("trk.notReady") : errText(st)}</p></section>`.s;
    return;
  }
  try { localStorage.setItem("ocn.track.seen", "1"); } catch (e) { /* this visit */ }
  const S = st.data;
  if (await takeCodes(query)) return render(main, { query: {}, path });
  const head = (path || location.hash).split("?")[0];
  const tabs = TABS();
  const cur = /mes-traces/.test(head) ? "traces" : /famille/.test(head) ? "famille" : tabFrom(tabs, query);
  main.innerHTML = html`<div class="page-head"><h1>${t("trk.title")}</h1><p class="lede">${t("trk.lede")}</p></div>
    ${S.me.guardianWanted ? html`<div class="trk-banner" id="trk-attach">${t("trk.attach.banner")}
      <button type="button" class="btn btn-sm btn-primary">${t("trk.attach.ask")}</button></div>` : ""}
    ${pageTabs(tabs, cur)}
    <div data-panel="suivi" id="trk-follow"></div><div data-panel="traces" id="trk-runs"></div><div data-panel="famille" id="trk-family"></div>`.s;
  $("#trk-attach button", main)?.addEventListener("click", async () => {
    const r = await api("attach-code", {});
    if (!r.ok) return alertBox(errText(r));
    showCode(t("trk.attach.title"), t("trk.attach.text"), r.data.url);
  });
  const drawn = {};
  bindPageTabs(main, tabs, cur, (k) => {
    if (drawn[k]) return;
    drawn[k] = true;
    if (k === "suivi") followTab($("#trk-follow", main), S);
    if (k === "traces") runsTab($("#trk-runs", main), S, query);
    if (k === "famille") familyTab($("#trk-family", main), S, () => { drawn.famille = false; render(main, { query: { onglet: "famille" }, path: "#/famille" }); });
  });
}

/** The codes an address carries (an invitation, a parent's code, a take-over link): asked, then taken. -> true when one was. */
async function takeCodes(q) {
  const ask = async (code, msg, path, body) => {
    if (!code) return false;
    history.replaceState(null, "", location.hash.split("?")[0]);
    if (!(await confirmBox(msg, { ok: t("trk.accept") }))) return true;
    const r = await api(path, body || { code });
    await alertBox(r.ok ? t(`trk.ok.${path.split("/")[0]}`, { name: r.data.account?.name || r.data.child?.name || "" }) : errText(r));
    return true;
  };
  return (await ask(q.suivre, t("trk.ask.watch"), "invite/accept"))
    || (await ask(q.parent, t("trk.ask.guardian"), "guardian/accept"))
    || (await ask(q.rattacher, t("trk.ask.attach"), "attach/accept"))
    || (await ask(q.reprendre, t("trk.ask.takeover"), "takeover/confirm", { token: q.reprendre }));
}

// ---- Suivre ---------------------------------------------------------------------------------------------------------

async function followTab(el, S) {
  el.innerHTML = html`<div class="spinner"></div>`.s;
  const r = await api("live");
  if (!r.ok) { el.innerHTML = html`<p>${errText(r)}</p>`.s; return; }
  const list = r.data.accounts;
  const card = (a) => {
    const run = a.run;
    const st = !run ? "none" : run.state;
    return html`<a class="card trk-acc trk-${st}" href="#/suivi/${a.id}">
      <div class="trk-acc-name">${a.rel === "me" ? t("trk.me") : a.name}${a.rel === "child" ? html` <span class="tag">${t("trk.child")}</span>` : ""}</div>
      <div class="trk-acc-state">${st === "none" ? t("trk.state.none") : st === "end" ? t("trk.state.endAt", { at: dayTime(run.end || run.last) })
        : st === "lost" ? t("trk.state.lostAt", { at: dayTime(run.last) }) : t(`trk.state.${st}`)}</div>
      ${run && st !== "none" ? html`<div class="trk-acc-sub">${km(run.distance)} · ${t("trk.since", { at: clock(run.start) })}</div>` : ""}
    </a>`;
  };
  const others = list.filter((a) => a.rel !== "me");
  el.innerHTML = html`<div class="trk-grid">${list.map(card)}</div>
    ${!others.length ? html`<section class="card trk-help"><h3>${t("trk.start.title")}</h3><p>${t("trk.start.text")}</p>
      <p><a class="btn btn-sm" href="#/famille">${t("trk.tab.family")}</a></p></section>` : ""}
    ${S.me.child ? "" : await startHelp()}`.s;
  $("[data-act=tracker]", el)?.addEventListener("click", () => bridge.call("openTracker").catch(() => {}));
}
/** How to record: the app (its tracker), else how to get it. */
async function startHelp() {
  const inApp = bridge.inApp(), info = inApp ? await bridge.info() : null;
  if (info?.paired) return html`<section class="card"><h3>${t("trk.rec.title")}</h3><p>${t("trk.rec.app")}</p>
    <p><button type="button" class="btn btn-primary" data-act="tracker">${t("trk.rec.open")}</button></p></section>`;
  if (inApp) return html`<section class="card"><h3>${t("trk.rec.title")}</h3><p>${t("trk.rec.pairFirst")}</p>
    <p><a class="btn btn-sm" href="#/famille">${t("trk.tab.family")}</a></p></section>`;
  return html`<section class="card"><h3>${t("trk.rec.title")}</h3><p>${t("trk.rec.noApp")}</p></section>`;
}

// ---- the watch page -------------------------------------------------------------------------------------------------

let watching = null;
function watchPage(main, id) {
  watching?.stop();
  main.innerHTML = html`<div class="trk-watch">
    <div class="trk-wbar"><a href="#/suivi" class="btn btn-sm">‹ ${t("trk.title")}</a><h1 id="trk-wname">…</h1>
      <span id="trk-wstate" class="trk-pill"></span></div>
    <div class="trk-wbody"><div id="trk-map" class="trk-map"></div>
      <aside class="trk-side card">
        <dl class="trk-facts" id="trk-facts"></dl>
        <div class="trk-acts" id="trk-acts"></div>
        <h4>${t("trk.alerts")}</h4><ul class="trk-alerts" id="trk-alerts"><li class="dim">${t("trk.noAlerts")}</li></ul>
        <p class="dim trk-delay" id="trk-delay"></p>
      </aside></div></div>`.s;
  const W = { id, fixes: [], run: null, state: null, batch: 30, bat: null, lp: false, name: "", lastAt: 0, alerts: [], manage: false, live: false };
  const map = TM.mount($("#trk-map", main), { onMove: (on) => drawActs() });
  let ws = null, poll = 0, tick = 0, stopped = false;
  const facts = $("#trk-facts", main), acts = $("#trk-acts", main);

  const delayS = () => W.batch + 10;
  function at(clockS) {              // the position at a moment, between two fixes
    const F = W.fixes;
    if (!F.length) return null;
    if (clockS >= F[F.length - 1][0] || W.state === "end") return F[F.length - 1];
    let i = F.length - 1;
    while (i > 0 && F[i][0] > clockS) i--;
    const a = F[i], b = F[Math.min(F.length - 1, i + 1)];
    if (b[0] <= a[0] || clockS <= a[0]) return a;
    const k = (clockS - a[0]) / (b[0] - a[0]);
    return [clockS, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k, a[3]];
  }
  function frame() {
    const c = W.state === "end" ? Infinity : Date.now() / 1000 - delayS();
    const p = at(c);
    const shown = W.fixes.filter((f) => f[0] <= c).map((f) => [f[1], f[2]]);
    if (p) shown.push([p[1], p[2]]);
    map.setRunners(p ? [{ pts: shown, at: [p[1], p[2]], acc: p[3], label: W.name, colour: COLOURS[0], help: W.state === "help" }] : []);
    const F = W.fixes, dist = F.reduce((s, f, i) => (i ? s + dist2(F[i - 1], f) : 0), 0);
    facts.innerHTML = html`
      <dt>${t("trk.f.state")}</dt><dd>${W.run ? t(`trk.state.${W.state || "run"}`) : t("trk.state.none")}</dd>
      ${F.length ? html`<dt>${t("trk.f.since")}</dt><dd>${fmtTime(Math.max(0, Math.round((W.state === "end" ? F[F.length - 1][0] : Date.now() / 1000) - F[0][0])))}</dd>
      <dt>${t("trk.f.dist")}</dt><dd>${km(dist)}</dd>
      <dt>${t("trk.f.last")}</dt><dd>${W.lastAt ? ago(W.lastAt) : "—"}</dd>` : ""}
      ${W.bat != null ? html`<dt>${t("trk.f.bat")}</dt><dd class="${W.bat < 15 ? "delta-down" : ""}">${pctN(W.bat)}${W.lp ? html` · ${t("trk.lowPower")}` : ""}</dd>` : ""}`.s;
    const pill = $("#trk-wstate", main);
    pill.textContent = W.run ? t(`trk.state.${W.state || "run"}`) : t("trk.state.none");
    pill.className = `trk-pill trk-${W.state || "none"}`;
    $("#trk-delay", main).textContent = W.state && W.state !== "end" ? t("trk.delay", { n: delayS() }) : "";
  }
  function drawActs() {
    acts.innerHTML = html`
      ${!map.following() ? html`<button type="button" class="btn btn-sm" data-a="follow">${t("trk.recentre")}</button>` : ""}
      ${W.manage && W.run && W.state !== "end" ? html`<button type="button" class="btn btn-sm" data-a="stop">${t("trk.stopRun")}</button>` : ""}
      ${W.run && W.fixes.length > 1 ? html`<button type="button" class="btn btn-sm" data-a="solo">${t("trk.toSolo")}</button>` : ""}`.s;
    $("[data-a=follow]", acts)?.addEventListener("click", () => { map.follow(true); drawActs(); });
    $("[data-a=stop]", acts)?.addEventListener("click", async () => {
      if (!(await confirmBox(t("trk.stopAsk", { name: W.name }), { ok: t("trk.stopRun") }))) return;
      const r = await api(`runs/${W.run}/stop?account=${id}`, {});
      if (!r.ok) alertBox(errText(r)); else { W.state = "end"; frame(); drawActs(); }
    });
    $("[data-a=solo]", acts)?.addEventListener("click", () => toSolo(W.run, id));
  }
  function alertsDraw() {
    $("#trk-alerts", main).innerHTML = W.alerts.length ? W.alerts.slice(-12).reverse().map((a) =>
      html`<li class="trk-al-${a.kind}">${clock(new Date(a.at).toISOString())} · ${t(`trk.al.${a.kind}`)}</li>`.s).join("") : html`<li class="dim">${t("trk.noAlerts")}</li>`.s;
  }
  function take(msg) {
    if (msg.t === "hello") {
      W.live = true;
      W.batch = msg.batch || 30;
      // the relay holds only the run under way; with none, what the server listed stays
      if (msg.run) {
        W.run = msg.run; W.state = msg.state || "run"; W.fixes = decode(msg.fixes); W.name = msg.name || W.name;
        W.bat = msg.bat; W.lp = msg.lp; W.lastAt = msg.last || W.lastAt;
      }
      if (W.fixes.length) map.fit(W.fixes.map((f) => [f[1], f[2]]));
    } else if (msg.t === "fixes") {
      if (msg.run !== W.run) { W.run = msg.run; W.fixes = []; W.state = "run"; W.alerts = []; }
      W.fixes.push(...decode(msg)); W.bat = msg.bat; W.lp = msg.lp; W.lastAt = msg.at;
    } else if (msg.t === "state") {
      W.state = msg.state === "stop" ? "end" : msg.state;
    } else if (msg.t === "alert") {
      W.alerts.push(msg); alertsDraw();
      if (msg.kind === "help") W.state = "help";
    }
    frame(); drawActs();
  }
  async function loadPolled() {
    const r = await api(`runs?account=${id}`);
    if (!r.ok) return;
    W.manage = r.data.mine;
    W.name = r.data.account.name;
    $("#trk-wname", main).textContent = W.name;
    const last = r.data.runs[0];
    if (!last) { frame(); drawActs(); return; }
    const full = await api(`runs/${last.id}?account=${id}`);
    if (!full.ok) return;
    const first = !W.fixes.length;
    W.run = last.id; W.state = last.state === "lost" ? "end" : last.state;
    W.fixes = decode(full.data.trace); W.lastAt = Date.parse(last.last || last.start);
    if (first && W.fixes.length) map.fit(W.fixes.map((f) => [f[1], f[2]]));
    frame(); drawActs();
  }
  function connect() {
    try {
      ws = new WebSocket(`${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws/track/${id}`);
    } catch (e) { ws = null; }
    if (!ws) { poll ||= setInterval(loadPolled, 20000); return; }
    const opened = setTimeout(() => { if (!W.live) poll ||= setInterval(loadPolled, 20000); }, 6000);
    ws.onmessage = (e) => { try { take(JSON.parse(e.data)); } catch (x) { /* not ours */ } };
    ws.onclose = () => {
      clearTimeout(opened);
      if (stopped) return;
      // the relay unreachable (not deployed yet, or a network change): read the run every 20 s, try the socket again later
      poll ||= setInterval(loadPolled, 20000);
      setTimeout(() => { if (!stopped) connect(); }, 30000);
    };
  }
  watching = { stop() { stopped = true; clearInterval(poll); clearInterval(tick); try { ws?.close(); } catch (e) { /* closed */ } map.destroy(); } };
  loadPolled().then(connect);
  tick = setInterval(frame, 1000);
  const off = () => { if (!document.body.contains(main.querySelector(".trk-watch"))) { watching?.stop(); watching = null; window.removeEventListener("hashchange", off); } };
  window.addEventListener("hashchange", off);
}
function dist2(a, b) {
  const r = Math.PI / 180, dla = (b[1] - a[1]) * r, dlo = (b[2] - a[2]) * r;
  const h = Math.sin(dla / 2) ** 2 + Math.cos(a[1] * r) * Math.cos(b[1] * r) * Math.sin(dlo / 2) ** 2;
  const d = 12742000 * Math.asin(Math.min(1, Math.sqrt(h)));
  return d / Math.max(1, b[0] - a[0]) < 100 ? d : 0;
}
async function toSolo(run, account) {
  const res = await fetch(`api/track/runs/${run}/gpx?account=${account}`, { credentials: "same-origin" });
  if (!res.ok) return alertBox(t("trk.err.generic"));
  const file = new File([await res.blob()], `ozimut-${run}.gpx`, { type: "application/gpx+xml" });
  api(`runs/${run}/keep?account=${account}`, {});
  const { toSolo: go } = await import("../pwa.js");
  go([file]);
}

// ---- Mes traces -----------------------------------------------------------------------------------------------------

async function runsTab(el, S, query) {
  const accounts = [{ ...S.me, label: t("trk.me") }, ...S.children.map((c) => ({ ...c, label: c.name })),
    ...S.following.map((c) => ({ ...c, label: c.name, watch: true }))];
  let who = Number(query.compte) || S.me.id;
  const draw = async () => {
    const acc = accounts.find((a) => a.id === who) || accounts[0];
    el.innerHTML = html`<div class="trk-runs-head">
      ${accounts.length > 1 ? html`<label>${t("trk.account")} <select id="trk-who">${accounts.map((a) => html`<option value="${a.id}" ${raw(a.id === who ? "selected" : "")}>${a.label}</option>`)}</select></label>` : ""}
      ${acc.watch ? "" : html`<label class="btn btn-sm">${t("trk.import")}<input type="file" id="trk-file" hidden accept="${fileAccept(".gpx,.tcx,.fit")}" multiple></label>`}
      ${!acc.watch && (await bridge.has("health")) ? html`<button type="button" class="btn btn-sm" id="trk-health">${t("trk.health")}</button>` : ""}
      ${acc.id === S.me.id && S.polar.available ? (S.polar.linked
        ? html`<button type="button" class="btn btn-sm" id="trk-polar-off">${t("trk.polar.unlink")}</button>`
        : html`<a class="btn btn-sm" href="api/track/polar/connect">${t("trk.polar.link")}</a>`) : ""}
      </div><p class="dim">${t("trk.runs.keep")}</p><div id="trk-list"><div class="spinner"></div></div>`.s;
    $("#trk-who", el)?.addEventListener("change", (e) => { who = Number(e.target.value); draw(); });
    $("#trk-file", el)?.addEventListener("change", (e) => importFiles([...e.target.files], who).then(draw));
    $("#trk-health", el)?.addEventListener("click", () => importHealth(who).then(draw));
    $("#trk-polar-off", el)?.addEventListener("click", async () => { await api("polar", null, "DELETE"); S.polar.linked = false; draw(); });
    const r = await api(`runs?account=${who}`);
    const list = $("#trk-list", el);
    if (!r.ok) { list.innerHTML = html`<p>${errText(r)}</p>`.s; return; }
    if (!r.data.runs.length) { list.innerHTML = html`<p>${t("trk.runs.none")}</p>`.s; return; }
    list.innerHTML = html`<div class="table-wrap"><table class="data"><thead><tr><th>${t("trk.col.start")}</th><th>${t("trk.col.name")}</th>
      <th>${t("trk.col.source")}</th><th>${t("trk.col.time")}</th><th>${t("trk.col.dist")}</th><th>${t("trk.col.share")}</th><th></th></tr></thead><tbody>
      ${r.data.runs.map((x) => html`<tr data-run="${x.id}"><td>${dayTime(x.start)}</td><td>${x.name || ""}</td>
        <td>${t(`trk.src.${x.source}`)}${x.state !== "end" ? html` <span class="tag">${t(`trk.state.${x.state}`)}</span>` : ""}</td>
        <td>${x.end ? fmtTime(Math.round((Date.parse(x.end) - Date.parse(x.start)) / 1000)) : "—"}</td><td>${km(x.distance)}</td>
        <td>${x.share === "private" ? t("trk.private") : t("trk.shared")}</td>
        <td class="trk-row-acts"><a class="btn btn-sm" href="#/suivi/${who}">${t("trk.see")}</a>
          <button type="button" class="btn btn-sm" data-a="solo">${t("trk.toSolo")}</button>
          <a class="btn btn-sm" href="api/track/runs/${x.id}/gpx?account=${who}" download>GPX</a>
          ${r.data.mine ? html`<button type="button" class="btn btn-sm" data-a="name">${t("trk.rename")}</button>
            <button type="button" class="btn btn-sm" data-a="del" aria-label="${t("trk.delete")}">✕</button>` : ""}</td></tr>`)}
      </tbody></table></div>`.s;
    $$("tr[data-run]", list).forEach((tr) => {
      const id = tr.dataset.run;
      $("[data-a=solo]", tr).addEventListener("click", () => toSolo(id, who));
      $("[data-a=name]", tr)?.addEventListener("click", async () => {
        const name = await askText(t("trk.rename"), $("td:nth-child(2)", tr).textContent);
        if (name == null) return;
        await api(`runs/${id}?account=${who}`, { name }, "PUT");
        draw();
      });
      $("[data-a=del]", tr)?.addEventListener("click", async () => {
        if (!(await confirmBox(t("trk.delAsk"), { ok: t("trk.delete") }))) return;
        await api(`runs/${id}?account=${who}`, null, "DELETE");
        draw();
      });
    });
  };
  draw();
}
async function importFiles(files, who) {
  const { parseTrace } = await import("../trace/track.js");
  let done = 0, fail = 0;
  for (const f of files) {
    try {
      const tr = parseTrace(f.name, await f.arrayBuffer());
      const pts = [];
      for (let i = 0; i < tr.n; i++) pts.push({ ms: tr.ms0 + tr.t[i] * 1000, lat: tr.lat0 - tr.y[i] / tr.ky, lon: tr.lon0 + tr.x[i] / tr.kx });
      const r = await api("runs/import", { account: who, name: f.name.replace(/\.[^.]+$/, ""), source: "file", trace: encode(pts) });
      if (r.ok) done++; else fail++;
    } catch (e) { fail++; }
  }
  await alertBox(fail ? t("trk.import.some", { n: done, k: fail }) : t("trk.import.ok", { n: done }));
}
async function importHealth(who) {
  let list = [];
  try { list = await bridge.call("healthRoutes", { days: 90 }); } catch (e) { return alertBox(t("trk.health.none")); }
  if (!list?.length) return alertBox(t("trk.health.none"));
  const d = dialog(html`<h3>${t("trk.health")}</h3><p>${t("trk.health.pick")}</p><ul class="trk-pick">${list.map((w) =>
    html`<li><label><input type="checkbox" value="${w.id}"> ${dayTime(w.start)} · ${km(w.distance)} · ${w.source || ""}</label></li>`)}</ul>
    <p><button type="button" class="btn btn-primary">${t("trk.import")}</button></p>`.s);
  await new Promise((ok) => {
    $(".btn-primary", d).addEventListener("click", async () => {
      const ids = $$("input:checked", d).map((i) => i.value);
      d.close();
      const files = [];
      for (const id of ids) {
        try { const r = await bridge.call("healthRoute", { id }); files.push(new File([r.gpx], `${r.name || "sante"}.gpx`, { type: "application/gpx+xml" })); } catch (e) { /* skipped */ }
      }
      if (files.length) await importFiles(files, who);
      ok();
    });
    d.addEventListener("close", ok);
  });
}

// ---- Famille et appareils -------------------------------------------------------------------------------------------

async function familyTab(el, S, redraw) {
  const app = bridge.inApp() ? await bridge.info() : null;
  const blocks = [];
  // this phone (in the app)
  if (app) {
    blocks.push(html`<section class="card"><h3>${t("trk.phone.title")}</h3>
      ${app.paired ? html`<p>${t("trk.phone.paired", { name: app.paired.name || "" })}</p>
        <p class="trk-btns"><button type="button" class="btn btn-primary" data-act="tracker">${t("trk.rec.open")}</button>
          <button type="button" class="btn btn-sm" data-act="test">${t("trk.phone.test")}</button>
          ${app.platform === "android" ? html`<button type="button" class="btn btn-sm" data-act="battery">${t("trk.phone.battery")}</button>` : ""}
          <button type="button" class="btn btn-sm" data-act="unpair">${t("trk.phone.unpair")}</button></p>`
        : html`<p>${t("trk.phone.none")}</p><p><button type="button" class="btn btn-primary" data-pairhere="${S.me.id}">${t("trk.phone.pairMe")}</button></p>`}
    </section>`);
  }
  if (S.me.child && S.me.canTakeOver) {
    blocks.push(html`<section class="card"><h3>${t("trk.take.title")}</h3><p>${t("trk.take.text")}</p>
      <form id="trk-take" class="trk-form"><label>${t("trk.email")} <input type="email" name="email" required autocomplete="email"></label>
        <label>${t("trk.password")} <input type="password" name="password" minlength="6" required autocomplete="new-password"></label>
        <button class="btn btn-primary">${t("trk.take.go")}</button></form></section>`);
  }
  if (!S.me.child) {
    blocks.push(html`<section class="card"><h3>${t("trk.kids.title")}</h3><p class="dim">${t("trk.kids.text")}</p>
      <div id="trk-kids">${S.children.map((c) => html`<details class="trk-kid" data-id="${c.id}"><summary>${c.name} ${c.last}
        ${c.birthYear ? html`<span class="dim">(${c.birthYear})</span>` : ""}</summary><div class="trk-kid-body"></div></details>`)}</div>
      <details class="trk-add"><summary>${t("trk.kids.add")}</summary>
        <form id="trk-kid-new" class="trk-form"><label>${t("trk.first")} <input name="first" required maxlength="60"></label>
          <label>${t("trk.last")} <input name="last" maxlength="60" value="${S.me.last}"></label>
          <label>${t("trk.birthYear")} <input name="birthYear" type="number" min="${new Date().getFullYear() - 25}" max="${new Date().getFullYear()}" required></label>
          <label>${t("trk.licence")} <input name="licence" maxlength="12"></label>
          <button class="btn btn-primary">${t("trk.kids.create")}</button></form></details></section>`);
  }
  blocks.push(html`<section class="card" data-acc="${S.me.id}"><h3>${t("trk.mine.title")}</h3><div class="trk-acc-body"></div></section>`);
  if (S.following.length) {
    blocks.push(html`<section class="card"><h3>${t("trk.following.title")}</h3><ul class="trk-list">${S.following.map((f) =>
      html`<li>${f.name} ${f.last} <a class="btn btn-sm" href="#/suivi/${f.id}">${t("trk.see")}</a>
        <button type="button" class="btn btn-sm" data-leave="${f.id}">${t("trk.leave")}</button></li>`)}</ul></section>`);
  }
  blocks.push(html`<section class="card"><h3>${t("trk.code.title")}</h3><p class="dim">${t("trk.code.text")}</p>
    <form id="trk-code" class="trk-form"><input name="code" required maxlength="80" placeholder="${t("trk.code.ph")}">
    <button class="btn btn-sm">${t("trk.accept")}</button></form></section>`);
  el.innerHTML = blocks.map((b) => b.s).join("");

  $("[data-act=tracker]", el)?.addEventListener("click", () => bridge.call("openTracker").catch(() => {}));
  $("[data-act=test]", el)?.addEventListener("click", () => bridge.call("selfTest").catch(() => {}));
  $("[data-act=battery]", el)?.addEventListener("click", () => bridge.call("openSettings", { which: "battery" }).catch(() => {}));
  $("[data-act=unpair]", el)?.addEventListener("click", async () => {
    if (!(await confirmBox(t("trk.phone.unpairAsk"), { ok: t("trk.phone.unpair") }))) return;
    await bridge.call("unpair").catch(() => {});
    redraw();
  });
  $$("[data-pairhere]", el).forEach((b) => b.addEventListener("click", () => pairHere(Number(b.dataset.pairhere), redraw)));
  $("#trk-take", el)?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const r = await api("takeover", { email: f.get("email"), password: f.get("password") });
    alertBox(r.ok ? t("trk.take.sent") : errText(r));
  });
  $("#trk-kid-new", el)?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target));
    const r = await api("children", f);
    if (!r.ok) return alertBox(errText(r));
    redraw();
  });
  $$("[data-leave]", el).forEach((b) => b.addEventListener("click", async () => {
    if (!(await confirmBox(t("trk.leaveAsk"), { ok: t("trk.leave") }))) return;
    await api("watchers", { account: Number(b.dataset.leave), watcher: S.me.id }, "DELETE");
    redraw();
  }));
  $("#trk-code", el).addEventListener("submit", async (e) => {
    e.preventDefault();
    const code = new FormData(e.target).get("code").trim();
    // a watcher's or a parent's code (long), else a watch's claim code is typed in the device part
    for (const p of ["invite/accept", "guardian/accept", "attach/accept"]) {
      const r = await api(p, { code });
      if (r.ok) { await alertBox(t(`trk.ok.${p.split("/")[0]}`, { name: r.data.account?.name || r.data.child?.name || "" })); return redraw(); }
    }
    alertBox(t("trk.err.code"));
  });
  // each account's parts, drawn when opened
  accountBody($(`[data-acc="${S.me.id}"] .trk-acc-body`, el), S.me, S, true, redraw);
  $$(".trk-kid", el).forEach((d) => d.addEventListener("toggle", () => {
    if (!d.open || d.dataset.drawn) return;
    d.dataset.drawn = "1";
    const c = S.children.find((x) => x.id === Number(d.dataset.id));
    accountBody($(".trk-kid-body", d), c, S, false, redraw);
  }));
}

/** An account's devices, watchers and settings (mine, or a child's). */
async function accountBody(el, acc, S, mine, redraw) {
  el.innerHTML = html`<div class="spinner"></div>`.s;
  const q = `account=${acc.id}`;
  const [dv, wt, st] = await Promise.all([api(`devices?${q}`), api(`watchers?${q}`), api(`settings?${q}`)]);
  if (!dv.ok) { el.innerHTML = html`<p>${errText(dv)}</p>`.s; return; }
  const s = st.data, kid = !mine;
  const can = !S.me.child || !mine;           // a child's own page shows, its parents decide
  el.innerHTML = html`
    <h4>${t("trk.dev.title")}</h4>
    ${dv.data.devices.length ? html`<ul class="trk-list">${dv.data.devices.map((d) => html`<li>
      <b>${d.label || t(`trk.kind.${d.kind}`)}</b> <span class="dim">${t(`trk.kind.${d.kind}`)}${d.battery != null ? ` · ${pctN(d.battery)}` : ""} · ${d.lastSeen ? t("trk.seen", { at: dayTime(d.lastSeen) }) : t("trk.never")}</span>
      ${can ? html`<button type="button" class="btn btn-sm" data-rm="${d.id}">${t("trk.remove")}</button>` : ""}</li>`)}</ul>` : html`<p class="dim">${t("trk.dev.none")}</p>`}
    ${can ? html`<p class="trk-btns">
      ${bridge.inApp() ? html`<button type="button" class="btn btn-sm" data-a="here">${t(kid ? "trk.dev.pairHereKid" : "trk.dev.pairHere", { name: acc.name })}</button>` : ""}
      <button type="button" class="btn btn-sm" data-a="phone">${t("trk.dev.phone")}</button>
      <button type="button" class="btn btn-sm" data-a="watch">${t("trk.dev.watch")}</button>
      <button type="button" class="btn btn-sm" data-a="osmand">${t("trk.dev.traccar")}</button></p>` : ""}
    <h4>${t("trk.watchers.title")}</h4>
    ${wt.ok && (wt.data.guardians.length || wt.data.watchers.length) ? html`<ul class="trk-list">
      ${wt.data.guardians.filter((g) => g.id !== acc.id).map((g) => html`<li>${g.name} <span class="tag">${t("trk.parent")}</span></li>`)}
      ${wt.data.watchers.map((w) => html`<li>${w.name} ${can ? html`<button type="button" class="btn btn-sm" data-unwatch="${w.id}">${t("trk.remove")}</button>` : ""}</li>`)}
      </ul>` : html`<p class="dim">${t("trk.watchers.none")}</p>`}
    ${can ? html`<p class="trk-btns"><button type="button" class="btn btn-sm" data-a="invite">${t("trk.watchers.invite")}</button>
      ${kid ? html`<button type="button" class="btn btn-sm" data-a="parent">${t("trk.watchers.parent")}</button>` : ""}</p>` : ""}
    ${can ? html`<h4>${t("trk.set.title")}</h4><form class="trk-form trk-set">
      <label>${t("trk.set.batch")} <select name="batch">${[10, 20, 30, 45, 60].map((n) => html`<option value="${n}" ${raw(n === s.batch ? "selected" : "")}>${t("trk.set.sec", { n })}</option>`)}</select></label>
      <label>${t("trk.set.cap")} <select name="cap">${[1800, 3600, 5400, 7200, 9000, 10800, 14400, 21600].map((n) => html`<option value="${n}" ${raw(n === s.cap ? "selected" : "")}>${fmtTime(n)}</option>`)}</select></label>
      ${kid ? html`<label>${t("trk.set.call")} <input name="call" type="tel" maxlength="20" value="${s.call || ""}"></label>
        <label class="chk"><input type="checkbox" name="onlyTracker" ${raw(s.onlyTracker ? "checked" : "")}> ${t("trk.set.only")}</label>
        <fieldset><legend>${t("trk.set.area")}</legend><p class="dim">${t("trk.set.areaText")}</p>
          <label>${t("trk.set.lat")} <input name="alat" inputmode="decimal" value="${s.area?.lat ?? ""}"></label>
          <label>${t("trk.set.lon")} <input name="alon" inputmode="decimal" value="${s.area?.lon ?? ""}"></label>
          <label>${t("trk.set.radius")} <input name="ar" type="number" min="100" max="20000" step="50" value="${s.area?.r ?? ""}"></label>
          <button type="button" class="btn btn-sm" data-a="here-pos">${t("trk.set.herePos")}</button></fieldset>` : ""}
      <button class="btn btn-sm btn-primary">${t("trk.save")}</button></form>` : ""}
    ${kid ? html`<h4>${t("trk.kid.edit")}</h4><form class="trk-form trk-kidedit">
      <label>${t("trk.first")} <input name="first" value="${acc.name}" maxlength="60"></label>
      <label>${t("trk.last")} <input name="last" value="${acc.last}" maxlength="60"></label>
      <label>${t("trk.birthYear")} <input name="birthYear" type="number" value="${acc.birthYear || ""}"></label>
      <button class="btn btn-sm">${t("trk.save")}</button>
      <button type="button" class="btn btn-sm trk-danger" data-a="delkid">${t("trk.kid.delete")}</button></form>` : ""}`.s;

  const on = (sel, fn) => $$(sel, el).forEach((b) => b.addEventListener("click", fn));
  on("[data-rm]", async (e) => {
    if (!(await confirmBox(t("trk.dev.rmAsk"), { ok: t("trk.remove") }))) return;
    await api(`devices/${e.target.dataset.rm}`, null, "DELETE");
    accountBody(el, acc, S, mine, redraw);
  });
  on("[data-unwatch]", async (e) => {
    await api("watchers", { account: acc.id, watcher: Number(e.target.dataset.unwatch) }, "DELETE");
    accountBody(el, acc, S, mine, redraw);
  });
  on("[data-a=here]", () => pairHere(acc.id, redraw));
  on("[data-a=phone]", async () => {
    const r = await api("pair-code", { account: acc.id });
    if (!r.ok) return alertBox(errText(r));
    showCode(t("trk.pair.title", { name: acc.name }), t("trk.pair.text"), r.data.url, r.data.code);
  });
  on("[data-a=watch]", async () => {
    const code = await askText(t("trk.watch.ask"), "", { max: 6 });
    if (!code) return;
    const r = await api("devices/claim", { account: acc.id, code });
    await alertBox(r.ok ? t("trk.watch.ok") : errText(r));
    accountBody(el, acc, S, mine, redraw);
  });
  on("[data-a=osmand]", async () => {
    const r = await api("devices/osmand", { account: acc.id });
    if (!r.ok) return alertBox(errText(r));
    showCode(t("trk.traccar.title"), t("trk.traccar.text"), r.data.config);
    accountBody(el, acc, S, mine, redraw);
  });
  on("[data-a=invite]", async () => {
    const r = await api("invite-code", { account: acc.id });
    if (!r.ok) return alertBox(errText(r));
    showCode(t("trk.invite.title", { name: acc.name }), t("trk.invite.text"), r.data.url);
  });
  on("[data-a=parent]", async () => {
    const r = await api("guardian-code", { account: acc.id });
    if (!r.ok) return alertBox(errText(r));
    showCode(t("trk.parentCode.title", { name: acc.name }), t("trk.parentCode.text"), r.data.url);
  });
  on("[data-a=here-pos]", () => navigator.geolocation?.getCurrentPosition((p) => {
    $("[name=alat]", el).value = p.coords.latitude.toFixed(5); $("[name=alon]", el).value = p.coords.longitude.toFixed(5);
    if (!$("[name=ar]", el).value) $("[name=ar]", el).value = 1000;
  }, () => alertBox(t("trk.err.position")), { enableHighAccuracy: true, timeout: 15000 }));
  $(".trk-set", el)?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const body = { account: acc.id, batch: Number(f.get("batch")), cap: Number(f.get("cap")) };
    if (kid) {
      body.call = f.get("call"); body.onlyTracker = !!f.get("onlyTracker");
      const la = parseFloat(String(f.get("alat")).replace(",", ".")), lo = parseFloat(String(f.get("alon")).replace(",", ".")), r = Number(f.get("ar"));
      body.area = Number.isFinite(la) && Number.isFinite(lo) && r >= 100 ? { lat: la, lon: lo, r } : null;
    }
    const r = await api("settings", body, "PUT");
    alertBox(r.ok ? t("trk.saved") : errText(r));
  });
  $(".trk-kidedit", el)?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const r = await api(`children/${acc.id}`, Object.fromEntries(new FormData(e.target)), "PUT");
    if (!r.ok) return alertBox(errText(r));
    redraw();
  });
  on("[data-a=delkid]", async () => {
    if (!(await confirmBox(t("trk.kid.deleteAsk", { name: acc.name }), { ok: t("trk.kid.delete") }))) return;
    const r = await api(`children/${acc.id}`, null, "DELETE");
    if (!r.ok) return alertBox(errText(r));
    redraw();
  });
}

/** This phone (the Ozimut app) paired to an account: a code made here, handed to the native side. */
async function pairHere(account, redraw) {
  const r = await api("pair-code", { account });
  if (!r.ok) return alertBox(errText(r));
  try {
    await bridge.call("pair", { code: r.data.code }, { timeout: 30000 });
    await alertBox(t("trk.phone.done"));
    redraw();
  } catch (e) { alertBox(t("trk.phone.fail")); }
}
