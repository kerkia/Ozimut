// Chrono's window: the bar (the event, the devices' state, the clock), the rail of posts, the ribbon of the post in hand,
// its screen, the status line. One window per station; every post reads the same log and writes operations to it.
// The same code runs in an Orga event's tab on Ozimut and in the desktop app's page (ui/standalone.js).

import { t, tn, locale } from "../../i18n.js";
import { html, raw, icon, toast } from "./kit.js";
import { Log } from "../log.js";
import { openEvent, kvGet } from "../store.js";
import { buildView, problems } from "../view.js";
import { rulesOf } from "../rules/index.js";
import { takeRead, nowS } from "../model.js";
import { clock } from "../times.js";
import { makeDevices } from "./devices.js";
import { makeNet } from "./net.js";

const POSTS = [
  { id: "prepare", icon: "wand", load: () => import("./prepare.js") },
  { id: "desk", icon: "desk", load: () => import("./desk.js") },
  { id: "start", icon: "go", load: () => import("./desk.js") },
  { id: "finish", icon: "flag", load: () => import("./finish.js") },
  { id: "follow", icon: "eye", load: () => import("./follow.js") },
  { id: "speaker", icon: "mic", load: () => import("./follow.js") },
  { id: "referee", icon: "scale", load: () => import("./follow.js") },
  { id: "units", icon: "box", load: () => import("./follow.js") },
  { id: "close", icon: "lock", load: () => import("./close.js") },
];
export const ROLES = { all: POSTS.map((p) => p.id), desk: ["desk"], start: ["start"], finish: ["finish", "follow"], speaker: ["speaker", "follow"], referee: ["referee", "follow"] };

function beep(kind) {
  try {
    const A = beep.ctx || (beep.ctx = new (window.AudioContext || window.webkitAudioContext)()), o = A.createOscillator(), g = A.createGain();
    o.frequency.value = kind === "ok" ? 880 : 220; o.type = kind === "ok" ? "sine" : "square";
    g.gain.setValueAtTime(0.12, A.currentTime); g.gain.exponentialRampToValueAtTime(0.001, A.currentTime + (kind === "ok" ? 0.15 : 0.5));
    o.connect(g).connect(A.destination); o.start(); o.stop(A.currentTime + (kind === "ok" ? 0.16 : 0.5));
  } catch (e) { /* no sound */ }
}

/**
 * `opt`: `{ ev (the event's id), seed ({ name, date, country, type, club, race, place }: an Orga event's own description),
 * session (signed in on Ozimut), base, hubUrl, role, user (the operator's name) }`. Resolves to `{ ctx, stop() }`.
 */
export async function mountChrono(root, opt) {
  const store = await openEvent(opt.ev, { name: opt.seed?.name || "", date: opt.seed?.date || "" });
  const role = ROLES[opt.role] ? opt.role : "all";
  const posts = POSTS.filter((p) => ROLES[role].includes(p.id));
  let ready = false;
  let real = store.log, sand = null, cache = null, pcache = null, cardTaker = null, cur = null, curMod = null, timer = null, queued = false, off = null;
  const ui = (() => { try { return JSON.parse(localStorage.getItem(`oz.chrono.ui.${opt.ev}`) || "{}"); } catch (e) { return {}; } })();
  const keepUi = () => { try { localStorage.setItem(`oz.chrono.ui.${opt.ev}`, JSON.stringify({ post: ui.post, name: ui.name })); } catch (e) { /* this visit only */ } };

  const ctx = {
    ev: opt.ev, root, ui, role, lastRead: null, archive: [],
    get log() { return sand || real; },
    get by() { return ui.name || opt.user || ""; },
    st: () => (sand || real).state,
    rules: () => rulesOf((sand || real).state),
    now: () => nowS((sand || real).state),
    sandbox: () => !!sand,
    view() {
      const log = sand || real, tick = Math.floor(Date.now() / 15000);
      if (!cache || cache.log !== log || cache.rev !== log.rev || cache.tick !== tick) { cache = { log, rev: log.rev, tick, v: buildView(log.state, { now: nowS(log.state) }) }; pcache = null; }
      return cache.v;
    },
    problems() { const v = ctx.view(); return (pcache ||= problems(ctx.st(), v, { now: ctx.now() })); },
    put: (c, id, p) => ctx.log.add("put", { c, id, p }, ctx.by),
    setEvent: (p) => ctx.log.add("ev", { p }, ctx.by),
    toast: (m, kind) => toast(root, m, kind),
    journal: (dir) => store.journal(dir),
    refresh() { if (queued) return; queued = true; setTimeout(() => { queued = false; draw(); }, 40); },     // a timer, not a frame: a window in the background still follows the race
    change() { ctx.refresh(); },
    go(id) { if (posts.some((p) => p.id === id)) show(id); },
    /** The next card read goes to `fn(number)` instead of the race (a card's number wanted in a form); null: as usual. */
    cardInto(fn) { cardTaker = fn; },
    /** A rehearsal: a copy of the log that is never saved nor sent. */
    enterSandbox() { if (sand) return; sand = new Log(`try-${real.station}`, real.ops); bindLog(); ctx.net.leaveHub(true); ctx.refresh(); },
    leaveSandbox() { if (!sand) return; sand = null; bindLog(); ctx.net.relink(); ctx.lastRead = null; ctx.refresh(); },
    /** A card as a reader gives it: kept, judged, printed. Returns what `takeRead` says. */
    card(raw, reader = null) {
      if (cardTaker) { try { if (cardTaker(raw.card) !== false) { beep("ok"); return null; } } catch (e) { /* the form is gone */ } cardTaker = null; }
      if (curMod?.card?.(ctx, raw, reader)) return null;
      const res = takeRead(ctx.log, raw, ctx.by);
      ctx.lastRead = { id: res.read.id, dup: res.dup, at: Date.now() };
      const row = res.runner ? ctx.view().byRunner.get(res.runner) : null;
      beep(row && row.status === "ok" ? "ok" : "bad");
      if (row && !res.dup && ctx.devices.printer.auto) ctx.printReceipt(row.id);
      if (cur !== "finish") ctx.toast(row ? t("chr.readToast", { name: `${row.given} ${row.family}`.trim(), status: t(`chr.st.${row.status}`) }) : t("chr.readUnknown", { n: raw.card }), row?.status === "ok" ? "ok" : "warn");
      ctx.refresh();
      return res;
    },
    async printReceipt(runnerId) {
      const v = ctx.view(), base = v.byRunner.get(runnerId);
      if (!base) return false;
      const course = v.courses.find((c) => c.id === base.course) || null, row = course?.rows.find((r) => r.id === runnerId) || base;
      const done = await ctx.devices.printReceipt(row, { event: v.event, course, of: course ? course.rows.filter((r) => r.place).length : 0 });
      if (!done && ctx.devices.printer.mode !== "none") ctx.toast(t("chr.printFail"), "stop");
      return done;
    },
  };
  ctx.devices = makeDevices({ card: (rawRead, rd) => ctx.card(rawRead, rd), punch: (p) => ctx.log.add("punch", { p: { ...p, s: p.s ?? p.t ?? null, src: p.src || "reader" } }, ctx.by), change: () => ctx.refresh() });
  ctx.net = makeNet(ctx, { session: !!opt.session, base: opt.base || "", hubUrl: opt.hubUrl || "", name: ctx.by });
  function bindLog() { off?.(); off = ctx.log.on(() => ctx.refresh()); cache = null; }
  bindLog();

  // a new event takes the Orga event's description; the rules follow its country
  if (opt.session) await ctx.net.sync();
  if (opt.seed && !real.state.event.name) {
    const s = opt.seed;
    real.add("ev", { p: { id: opt.ev, name: s.name || "", date: s.date || "", country: s.country || "FR", rules: String(s.country || "fr").toLowerCase(), type: s.type === "training" ? "individual" : s.type || "individual",
      club: s.club || "", place: s.place || "", race: s.race || null, timing: "si", startMode: "list", zero: 36000 } }, ctx.by);
  }
  ctx.archive = (await kvGet(`archive:${ctx.rules().id}`)) || [];

  root.classList.add("chr");
  root.innerHTML = html`
    <header class="chr-bar"><div class="chr-title"><strong id="chr-name"></strong><span id="chr-sub"></span></div>
      <div class="chr-dev" id="chr-dev"></div><div class="chr-clock" id="chr-clock"></div></header>
    <div class="chr-sand" id="chr-sand" hidden>${icon("alert")} <span>${t("chr.sand.on")}</span> <button type="button" class="btn btn-sm" id="chr-sand-off">${t("chr.sand.leave")}</button></div>
    <div class="chr-main"><nav class="chr-rail" id="chr-rail" aria-label="${t("chr.posts")}"></nav>
      <div class="chr-col"><div class="chr-ribbon" id="chr-ribbon" role="toolbar"></div><section class="chr-body" id="chr-body"></section></div></div>
    <footer class="chr-status" id="chr-status"></footer>`.toString();
  const $ = (s) => root.querySelector(s);
  ready = true;
  $("#chr-sand-off").addEventListener("click", () => ctx.leaveSandbox());

  function drawRail() {
    const pb = ctx.problems(), stop = pb.filter((p) => p.level === "stop").length;
    $("#chr-rail").innerHTML = posts.map((p) => html`<button type="button" role="tab" aria-selected="${p.id === cur}" data-post="${p.id}" title="${t(`chr.post.${p.id}.tip`)}">${icon(p.icon, 22)}<span>${t(`chr.post.${p.id}`)}</span>
      ${p.id === "finish" && stop ? html`<i class="chr-badge">${stop}</i>` : ""}</button>`).join("");
    $("#chr-rail").querySelectorAll("button").forEach((b) => b.addEventListener("click", () => show(b.dataset.post)));
  }
  function drawRibbon() {
    const groups = curMod?.ribbon?.(ctx) || [];
    const el = $("#chr-ribbon");
    if (el.contains(document.activeElement) && document.activeElement.tagName === "SELECT") return;
    el.innerHTML = groups.map((g, gi) => html`<div class="chr-rg"><div class="chr-rg-items">${g.items.map((it, ii) => html`<button type="button" class="chr-rb ${it.primary ? "primary" : ""}" data-g="${gi}" data-i="${ii}"
      title="${it.tip || it.label}" aria-pressed="${it.pressed == null ? raw("false") : String(!!it.pressed)}" ${it.disabled ? raw("disabled") : ""}>${icon(it.icon, it.primary ? 24 : 18)}<span>${it.label}</span></button>`)}</div><div class="chr-rg-name">${g.label}</div></div>`).join("");
    el.querySelectorAll("button").forEach((b) => b.addEventListener("click", async () => {
      try { await groups[b.dataset.g].items[b.dataset.i].on?.(); } catch (e) { ctx.toast(e?.message === "noserial" ? t("chr.dev.noSerial") : `${t("chr.failed")} ${e?.message || e}`, "stop"); }
      ctx.refresh();
    }));
  }
  function drawBar() {
    const e = ctx.st().event, D = ctx.devices, N = ctx.net;
    $("#chr-name").textContent = e.name || t("chr.untitled");
    $("#chr-sub").textContent = [e.date ? new Date(`${e.date}T12:00:00`).toLocaleDateString(locale(), { weekday: "short", day: "numeric", month: "long", year: "numeric" }) : "", e.place, e.club].filter(Boolean).join(" · ");
    const rd = D.readers.length ? D.readers.map((r) => `${r.label}${r.state === "ready" || r.state === "removed" ? "" : ` (${t(`chr.dev.st.${["opening", "error", "card", "reading"].includes(r.state) ? r.state : "ready"}`)})`}`).join(", ") : t("chr.dev.noReader");
    const cloud = N.cloud.state, cl = cloud === "ok" ? (N.pending() ? "warn" : "ok") : cloud === "off" ? "off" : cloud === "sync" || cloud === "idle" ? "ok" : "bad";
    const chip = (ic, label, cls, tip, act) => html`<button type="button" class="chr-chipb ${cls}" title="${tip}" data-act="${act}">${icon(ic, 16)}<span>${label}</span></button>`;
    $("#chr-dev").innerHTML = [
      chip("card", rd, D.readers.some((r) => r.state === "error") ? "bad" : D.readers.length ? "ok" : "off", t("chr.dev.readerTip"), "kit"),
      chip("print", t(`chr.dev.pr.${D.printer.mode}`), D.lastError ? "bad" : D.printer.mode === "none" ? "off" : "ok", D.lastError || t("chr.dev.printerTip"), "kit"),
      chip("cloud", t(`chr.net.${cloud}`), cl, N.cloud.error || t("chr.net.tip"), "net"),
      N.hub.state !== "off" ? chip("link", t(`chr.hub.${N.hub.state}`), N.hub.state === "on" ? "ok" : "bad", N.hub.url, "net") : "",
    ].join("");
    $("#chr-dev").querySelectorAll("button").forEach((b) => b.addEventListener("click", () => { ui.prepStep = b.dataset.act === "kit" ? "kit" : "net"; show(posts.some((p) => p.id === "prepare") ? "prepare" : cur, true); }));
    $("#chr-sand").hidden = !sand;
  }
  function drawStatus() {
    const c = ctx.view().counts, pb = ctx.problems(), stop = pb.filter((p) => p.level === "stop").length, warn = pb.filter((p) => p.level === "warn").length;
    $("#chr-status").innerHTML = html`<span>${tn("chr.cnt.entries", c.entries)}</span><span>${t("chr.cnt.out", { n: c.out })}</span><span>${t("chr.cnt.read", { n: c.read })}</span>
      <span>${t("chr.cnt.ok", { n: c.ok })}</span>${c.mp + c.dnf + c.dsq + c.ot ? html`<span>${t("chr.cnt.bad", { n: c.mp + c.dnf + c.dsq + c.ot })}</span>` : ""}
      <span class="grow"></span>${stop ? html`<span class="chr-s-stop">${icon("alert", 14)} ${tn("chr.cnt.stop", stop)}</span>` : ""}${warn ? html`<span class="chr-s-warn">${tn("chr.cnt.warn", warn)}</span>` : ""}
      <span class="chr-dim">${t("chr.station", { id: ctx.log.station })}${ctx.by ? ` · ${ctx.by}` : ""}</span>${store.failed ? html`<span class="chr-s-stop">${t("chr.saveFail")}</span>` : ""}`.toString();
  }
  function draw() {
    if (!ready) return;                                 // the log may move (a first exchange with the cloud) before the window is built
    if (!root.isConnected) { stop(); return; }
    drawBar(); drawRail(); drawRibbon(); drawStatus();
    try { cur && mounted?.update?.(); } catch (e) { console.error(e); }
  }
  let mounted = null;
  async function show(id, again = false) {
    if (id === cur && !again) return;
    try { mounted?.unmount?.(); } catch (e) { /* gone */ }
    cur = id; ui.post = id; keepUi();
    const p = posts.find((x) => x.id === id) || posts[0];
    const m = await p.load();
    curMod = m.posts ? m.posts[p.id] : m.post;
    const body = $("#chr-body");
    body.innerHTML = ""; body.dataset.post = p.id;
    mounted = curMod.mount(ctx, body) || null;
    draw();
  }

  timer = setInterval(() => {
    const el = $("#chr-clock");
    if (!el) return;
    el.textContent = clock(ctx.now());
    if (Math.floor(Date.now() / 1000) % 15 === 0) ctx.refresh();
  }, 1000);
  const onKey = (e) => { if (e.altKey && /^[1-9]$/.test(e.key) && posts[Number(e.key) - 1] && root.isConnected) { e.preventDefault(); show(posts[Number(e.key) - 1].id); } };
  document.addEventListener("keydown", onKey);
  const onLeave = (e) => { if (store.failed) { e.preventDefault(); e.returnValue = ""; } };
  window.addEventListener("beforeunload", onLeave);

  function stop() {
    clearInterval(timer); off?.(); ctx.net.stop(); ctx.devices.close();
    document.removeEventListener("keydown", onKey); window.removeEventListener("beforeunload", onLeave);
    return store.stop();
  }
  window.chronoDebug = () => ctx;                      // for support and scripted checks, as the analyses' anDebug
  ctx.net.start();
  ctx.devices.reconnect();
  const first = posts.some((p) => p.id === ui.post) ? ui.post : (Object.keys(real.state.runners).length && posts.some((p) => p.id === "finish") ? "finish" : posts[0].id);
  await show(first);
  return { ctx, stop };
}
