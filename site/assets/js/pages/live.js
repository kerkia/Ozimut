// « En direct » (#/direct[/<race>[/<class>]], every account): the races liveresultat shows,
// then one race live, from Ozimut's live relay (live/, Worker « ocn-live »: one reader per race, changes pushed over a WebSocket),
// reached through this site's Functions (/api/live/list, /ws/<race>). What it adds: each runner recognised
// (name + club) and linked to their page, their CN (Top and official) in the race's discipline, and the place their
// CN predicts. Times are liveresultat's hundredths of a second.
import { html, raw, $, $$, fmt, fmtDate, normalise, fmtCat, ord, pctN, addDays, dateFormat } from "../util.js";
import { loadRanking } from "./ranking.js";
import { t, tn, lang, locale } from "../i18n.js";
import * as data from "../data.js";
import * as cn from "../cn.js";
import { nameKey, sees, session, myClub } from "../auth.js";
import { scoreCell, subHead, cnLabel, scoreLabel } from "../ui.js";
import * as store from "../store.js";
import { link, replaceQuery } from "../app.js";
import * as country from "../country.js";
import { LIVE_KEY, hasSplits } from "../livesplits.js";
import { raceFilters, provFacts } from "../racefilters.js";
import { getProv } from "./provisional.js";
import * as tracking from "../tracking.js";

// the list (/api/live/list) and the live connections (/ws/<race>), on this site; a developer may point them at another
// server (localStorage « ocn.liveBase »)
const devBase = (() => { try { return localStorage.getItem("ocn.liveBase"); } catch (e) { return null; } })();
export const LIVE = devBase || "";               // this site
const STATUS = { 1: "dns", 2: "dnf", 3: "mp", 4: "dsq", 5: "ot", 11: "dns", 12: "nc" };
// the states of a runner who came to the finish all the same (PM, disqualified, over time)
const ARRIVED = new Set([3, 4, 5]);
const ST_LABEL = { dns: t("status.dns"), dnf: t("status.abandon"), mp: t("status.pm"), dsq: t("status.disqualifie"), ot: t("status.hors_delai"), nc: t("status.nc") };
// the CN that values a method's circuits (Top: the Fit of the same mean; official: itself)
const VALUER = { official: "official", top6w: "fair", fair: "fair" };
// how recent a finish or a punch is (owner, 2026-10-22): green within 3 min, yellow within 9; the punches' table lists 15 min
const R3 = 3 * 6000, R9 = 9 * 6000, WINDOW = 15 * 6000, AHEAD = 6000;          // hundredths
const recent = (at, now) => (at == null || now == null || now - at < -AHEAD ? "" : now - at <= R3 ? "lv-r3" : now - at <= R9 ? "lv-r9" : "");
const parseTod = (s) => { const m = /^(\d{1,2}):(\d{2}):(\d{2})$/.exec(String(s || "")); return m ? (Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3])) * 100 : null; };
// a runner's last event, as a time of day: the finish, else the last radio control passed
const lastAt = (r) => {
  const [, , , result, status, , , start, splits] = r;
  if (start == null) return null;
  if (status === 0 && result != null) return start + result;
  const s = splits?.filter(Boolean).pop();
  return s ? start + s[0] : null;
};

export async function render(main, { path = "", query = {} } = {}) {
  const parts = path.split("/").filter(Boolean).slice(1);          // #/direct/<race>/<class> | ~club/<club> | ~passages/<all|mine>
  const dec = (s) => (s ? decodeURIComponent(s) : null);
  return parts[0] && /^\d+$/.test(parts[0]) ? race(main, parts[0], dec(parts[1]), dec(parts[2])) : list(main, query);
}

// ---- the races ----------------------------------------------------------------------------------------------------
// the site's country's races (country.js, the header's menu; owner, 2026-10-21: the page's own « Pays » field repeated it);
// a line says whose they are and opens that menu (owner, 2026-10-23: the other countries' chips here, which Agenda and
// Résultats did not have, are gone); a search looks in every country. The filters are the lists of races' (racefilters.js, owner,
// 2026-10-23); a live race's region and runners are those of the same race on « Résultats » (its start list or results), when
// it is there — same day, same name words
const countryName = (() => {
  let dn = null;
  try { dn = new Intl.DisplayNames([lang()], { type: "region" }); } catch (e) { /* codes then */ }
  return (c) => (c === "?" ? t("lv.country.unknown") : dn?.of(c) || c);
})();

const nameWords = (s) => normalise(String(s || "")).split(/[^a-z0-9]+/).filter(Boolean);
/** Two names of one race: one's words all in the other's (two words at least, unless a name has one). */
function sameRace(a, b) {
  const x = nameWords(a), y = nameWords(b);
  const [short, long] = x.length <= y.length ? [x, y] : [y, x];
  return short.length > 0 && short.length >= Math.min(2, long.length) && short.every((w) => long.includes(w));
}

async function list(main, query) {
  const cur = country.current();
  main.innerHTML = html`<div class="page-head"><div><h1>${t("lv.title")}</h1><p class="lede">${t("lv.lede")}</p></div></div>
    <div id="lv-filters"></div>
    ${country.hint()}
    <div id="lv-now"></div>
    <div id="lv-org"></div>
    <section class="card"><div class="table-wrap" id="lv-list"><div class="empty">${t("lv.loading")}</div></div></section>
    <p class="muted" style="font-size:12.5px;margin:10px 2px 0">${t("lv.source")}</p>`;
  let comps = [], liveS = 1800, own = [];
  const [, idx] = await Promise.all([
    fetch(`${LIVE}/api/live/list`, { cache: "no-cache" }).then((r) => r.json()).then((j) => { ({ comps = [], liveS = 1800 } = j); country.noteLive(comps); country.hintList(comps.map((c) => c[5])); }).catch(() => { /* shown empty */ }),
    getProv("index.json").catch(() => null)]);
  const prov = idx?.races || [];
  const twins = new Map(comps.map((c) => [c[0], prov.find((r) => r.date_iso === c[3] && sameRace(r.name, c[1])) || null]));
  const facts = (c) => {
    const r = twins.get(c[0]);
    const x = r ? provFacts(r) : { region: "", lics: [] };
    return { ...x, spec: (r && x.spec) || terrainOf(c[1], ""), text: `${c[1]} ${c[2]} ${c[7] || ""}` };
  };
  const F = await raceFilters({ id: "lv", query, races: comps.filter((c) => (c[5] || "?") === cur), facts, onChange: () => draw() });
  $("#lv-filters").innerHTML = F.html;
  // live now (owner, 2026-10-22): a race whose last punch is under liveS old (the relay's directory reads today's races'
  // last passings: c[6], the age in seconds), a broadcast that sent something in that time
  const isLive = (c) => c[6] != null && c[6] <= liveS;
  // the races organisers feed from their timing software (« Organisation › Direct »), of the last 3 days: those that sent
  // something, and one's own before their first send (every one to administrators)
  {
    try {
      own = ((await (await fetch("/api/live/broadcasts", { credentials: "same-origin" })).json()).broadcasts || [])
        .filter((b) => b.date >= new Date(Date.now() - 3 * 86400e3).toLocaleDateString("sv-SE") && (b.last || b.mine || session()?.admin));
      if (own.length) $("#lv-org").innerHTML = html`<section class="card"><div class="card-head"><div><h2>${t("lv.org.title")}</h2>
        <div class="hint">${t("lv.org.hint")}</div></div></div>
        <div class="table-wrap"><table class="data compact"><tbody>${own.map((b) => html`<tr><td>${fmtDate(b.date)}</td>
          <td><a href="#/direct/${b.id}">${b.name}</a>${b.last && Date.now() - b.last <= liveS * 1000 ? html` <span class="lv-badge">${t("lv.badge")}</span>` : ""}</td><td class="muted">${b.organizer || ""}</td>
          <td class="muted">${b.last ? t("lv.org.last", { t: new Date(b.last).toLocaleTimeString(locale(), { hour: "2-digit", minute: "2-digit" }) }) : t("lv.org.none")}</td></tr>`)}</tbody></table></div></section>`;
    } catch (e) { /* none shown */ }
  }
  const today = new Date().toLocaleDateString("sv-SE");
  const draw = () => {
    const n = F.searching();
    const kept = comps.filter((c) => (n || (c[5] || "?") === cur) && F.keep(c))
      .sort((a, b) => isLive(b) - isLive(a) || (a[3] === today ? -1 : b[3] === today ? 1 : 0) || Math.abs(Date.parse(a[3]) - Date.parse(today)) - Math.abs(Date.parse(b[3]) - Date.parse(today)));
    // the box on top: the races live now (the country's, or the search's), the latest punch first
    const now = kept.filter(isLive).sort((a, b) => a[6] - b[6]);
    $("#lv-now").innerHTML = now.length ? html`<section class="card lv-now"><div class="card-head"><div><h2><span class="lv-dot" aria-hidden="true"></span>${t("lv.now.title")}</h2>
        <div class="hint">${t("lv.now.hint", { m: Math.round(liveS / 60) })}</div></div></div>
      <div class="lv-now-list">${now.map(([id, name, org, , , cc, , via]) => html`<a class="lv-now-item" href="#/direct/${id}"><b>${name}</b>
        <span class="muted">${[org, via].filter(Boolean).join(" · ")}${(cc || "?") !== cur ? ` · ${countryName(cc || "?")}` : ""}</span></a>`)}</div></section>` : "";
    $("#lv-list").innerHTML = kept.length ? html`<table class="data compact"><thead><tr><th>${t("f.date")}</th><th>${t("prov.race")}</th><th>${t("lv.org")}</th></tr></thead>
      <tbody>${kept.map((c) => { const [id, name, org, date, , cc, , via] = c; return html`<tr${raw(date === today ? ' class="selected"' : "")}><td class="num">${fmtDate(date, "short")}</td>
        <td><a href="#/direct/${id}">${name}</a>${isLive(c) ? html` <span class="lv-badge">${t("lv.badge")}</span>` : ""}</td><td style="font-size:12.5px">${org}${via ? html` <span class="muted">${org ? "· " : ""}${via}</span>` : ""}${(cc || "?") !== cur ? html` <span class="muted">· ${countryName(cc || "?")}</span>` : ""}</td></tr>`; })}</tbody></table>`
      : html`<div class="empty">${t(!comps.length ? "lv.unavailable" : n ? "lv.none" : F.filtered() ? "rf.emptyLive" : "lv.noneCountry", { c: countryName(cur) })}</div>`;
  };
  F.bind();
  draw();
  return { title: t("lv.title") };
}

// ---- one race -------------------------------------------------------------------------------------------------------
const hs = (h) => {
  if (h == null) return "";
  const s = Math.floor(h / 100);
  return s >= 3600 ? `${Math.floor(s / 3600)}:${String(Math.floor(s / 60) % 60).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`
    : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};
function nowAt(info) {
  const tz = info?.timezone || "Europe/Stockholm";
  let p;
  try { p = dateFormat({ timeZone: tz, hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }, "en-GB").formatToParts(new Date()); }
  catch (e) { p = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(new Date()); }
  const v = (k) => Number(p.find((x) => x.type === k)?.value || 0);
  return ((v("hour") * 3600 + v("minute") * 60 + v("second")) + (info?.timezone ? 0 : (info?.timediff || 0) * 3600)) * 100;
}
/** The race's discipline, from its name and the class: sprint, VTT, ski, else forest. */
const TERRAINS = ["For", "Spr", "VTT", "Ski"];
const terrainOf = (name, cls) => {
  const s = normalise(`${name} ${cls}`);
  return /\b(vtt|mtbo|mtb)\b/.test(s) ? "VTT" : /\bski\b/.test(s) ? "Ski" : /sprint/.test(s) ? "Spr" : "For";
};

// The views of a race (owner, 2026-10-22): a course; a club's runners across the courses (one's own club by default) or
// everyone still out; the latest punches (everyone's or one's club's), as a table. Three selectors side by side, the one in
// use marked; one search for a runner (opens their course, the row marked and scrolled to the middle) or a club.
const PASS_VIEW = "~passages", CLUB_VIEW = "~club";
// a class named as a category (« H21 », « D16 », « M45 »): its runners' category says nothing more
const CAT_CLASS = /^\s*[HDMW]\s?\d{2}/i;
const clubKey = (s) => normalise(String(s || "")).replace(/[^a-z0-9]+/g, " ").trim();
// a time of day (hundredths since midnight) as 10:34, with its seconds when it has some
const tod = (h) => {
  if (h == null || h < 0) return "";
  const s = Math.floor(h / 100) % 86400;
  return `${Math.floor(s / 3600)}:${String(Math.floor(s / 60) % 60).padStart(2, "0")}${s % 60 ? `:${String(s % 60).padStart(2, "0")}` : ""}`;
};
// the control symbols: a circle for a radio control, the double circle for the finish
const RADIO_ICON = '<svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true"><circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>';
const FINISH_ICON = '<svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true"><circle cx="8" cy="8" r="6.6" fill="none" stroke="currentColor" stroke-width="1.5"/><circle cx="8" cy="8" r="3.6" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>';

async function race(main, id, wanted, arg) {
  const st = { info: null, classes: [], counts: {}, all: new Map(), cn: {}, openTeams: new Set(), openLegs: new Set(), punch: new Map(), punchAsked: new Map(), view: "cls", cls: null, club: "mine", pf: "all",
    sub: null, pass: [], seen: new Set(), mark: null, markScroll: false, ws: null, up: false, tries: 0, gone: false,
    buzz: (() => { try { return localStorage.getItem("ocn.live.buzz") === "1"; } catch (e) { return false; } })(), buzzSeen: null };
  if (wanted === PASS_VIEW) { st.view = "pass"; st.pf = arg === "mine" ? "mine" : "all"; }
  else if (wanted === CLUB_VIEW) { st.view = "club"; st.club = arg || "mine"; }
  else st.cls = wanted;
  // the way to the split-time analysis beside the race's name, as « Analyse de course » has its way back (owner, 2026-10-24)
  main.innerHTML = html`<div class="lv-head"><div class="lv-hl"><div class="lv-tl"><h1 id="lv-title">…</h1>
        <a class="btn btn-sm" id="lv-an" hidden title="${t("lv.analyse.tip")}">${t("lv.analyse")} →</a></div><div class="lv-sub" id="lv-sub"></div></div>
      <div class="lv-hr"><span class="lv-status" id="lv-status">${t("lv.connecting")}</span><span id="lv-trk"></span></div></div>
    <div class="lv-layout">
      <aside class="lv-side"><div class="lv-list" id="lv-chips"></div></aside>
      <div class="lv-main">
        <div id="lv-pass"></div>
        <div class="lv-picks" id="lv-picks"></div>
        <div class="lv-find"><input type="search" id="lv-find" autocomplete="off" placeholder="${t("lv.find")}" aria-label="${t("lv.find.label")}">
          <div class="lv-find-list" id="lv-find-list" hidden></div></div>
        <div class="lv-note muted" id="lv-note" hidden></div>
        <div id="lv-buzzbar"></div>
        <section class="card lv-card"><div class="table-wrap" id="lv-rows"><div class="empty">${t("lv.loading")}</div></div></section>
      </div>
    </div>`;

  // runners of this site by name, to recognise them: [runner…] per name key
  await data.bootPrivate({ fr: sees("FR") });
  const byName = new Map();
  for (const r of data.runners().list) {
    const k = nameKey(r.nom);
    (byName.get(k) || byName.set(k, []).get(k)).push(r);
  }
  const who = (name, club) => {
    const c = byName.get(nameKey(name));
    if (!c) return null;
    if (c.length === 1) return c[0];
    const code = String(club || "").match(/\b(\d{4})/)?.[1];
    return c.find((r) => code && String(r.club || "").startsWith(code)) || null;
  };
  // one's club: France's runners of one's club (by name; the punches carry no club), and the club names the race writes
  // for them; else the club typed in one's countries
  const mine = myClub();
  const mates = mine ? new Set(data.runners().list.filter((r) => data.clubParts(r.club).code === mine).map((r) => nameKey(r.nom))) : new Set();
  const myKeys = new Set((session()?.countries || []).map((c) => clubKey(c.club)).filter(Boolean));
  const hasClub = () => !!mine || myKeys.size > 0;
  const isMine = (x) => (mine && x.me && data.clubParts(x.me.club).code === mine) || myKeys.has(clubKey(x.r[2]));
  // the CNs shown and used: the official one 15 days before the race (as FFCO uses it; the monthly snapshot before
  // that day), today's Top, and the strength (Fit) one at J-15 that values the circuit for the Top score
  // without France (owner, 2026-10-20): the race as liveresultat gives it, no CN, score or expected place
  const FR = sees("FR");
  // one line per runner, the table scrolling sideways (owner, 2026-10-24: a preview for the accounts the server names, see
  // users.preview, _lib/api.js previewOf; everyone else keeps two lines a runner): each two-line cell split into two columns
  const ONE = (session()?.preview || []).includes("live1line");
  const two = (a, b) => html`<div>${a}</div>${b ? html`<div class="lv-2">${b}</div>` : ""}`;
  // a pair of values: one cell of two lines, or two cells (the second's class `cls2`)
  const pair = (cls, a, b, cls2 = "r num lv-2") => (ONE ? html`<td class="${cls}">${a}</td><td class="${cls2}">${b || ""}</td>`
    : html`<td class="${cls}">${two(a, b)}</td>`);
  const pairHead = (a, b, title = "", cls = "r") => (ONE ? html`<th class="${cls}" title="${title}">${a}</th><th class="${cls}" title="${title}">${b}</th>`
    : html`<th class="${cls}" title="${title}">${subHead(a, b)}</th>`);
  // the ranking shown is the one chosen in Stats (owner, 2026-10-30: Arena offers no choice of its own)
  async function cnFor(terrain) {
    if (!FR) return { shown: new Map(), valuer: new Map(), monthJ15: null };
    const m = store.arenaMethod(), k = `${terrain}|${m}`;
    if (st.cn[k]) return st.cn[k];
    const day = st.info?.date || new Date().toISOString().slice(0, 10);
    const j15 = new Date(Date.parse(day) - 15 * 86400e3).toISOString().slice(0, 10);
    const mJ15 = data.meta().months.filter((x) => x <= j15).pop() || data.latestMonth();
    // the official CN on the race's J-15 when the site was built 15 days before (owner, 2026-10-26: the month-end before
    // J-15 could be weeks off FFCO's CN and the runner page's), else at the month-end before J-15
    const exact = async () => {
      const f = await data.officialJ15();
      return f?.cn && Math.abs(Date.parse(f.date) - Date.parse(j15)) <= 3 * 86400e3 ? new Map(Object.entries(f.cn[terrain] || {})) : null;
    };
    const at = async (mm, month) => (mm === "official" && (await exact())) || data.cnAt(mm, terrain, month);
    const [shown, valuer] = await Promise.all([at(m, m === "official" ? mJ15 : data.latestMonth()), at(VALUER[m], mJ15)]);
    st.cn[k] = { shown, valuer, monthJ15: mJ15 };
    return st.cn[k];
  }
  /** A class's estimated race scores: circuit value = the method's mean of CN × time over its sample of the finishers
   *  holding a CN (FFCO: the arithmetic mean over the fastest ⌈2N/3⌉; the Top: its Fit's rule in the discipline),
   *  score = circuit value ÷ time; null below 3 such finishers. key: the CN that values the circuit. */
  function scores(finishers, key, terrain) {
    const held = finishers.filter((x) => x.cnv[key] && x.time > 0);
    if (held.length < 3) return () => null;
    const m = store.arenaMethod();
    const p = m === "official" ? {} : cn.paramsFor(data.meta(), VALUER[m], terrain);
    const cv = cn.circuitValue(held.map((x) => [x.cnv[key], x.time]), { ...p, min_ranked: 3 });
    return (x) => (cv != null && x.time > 0 ? Math.round(cv / x.time) : null);
  }
  // a class's runners with what Ozimut adds: the runner recognised, their CN, the score their time earns, the place their
  // CN predicts (kept per class data and method)
  const enriched = new WeakMap();
  async function enrich(cls) {
    const d = st.all.get(cls);
    if (!d) return null;
    const m = store.arenaMethod(), hit = enriched.get(d);
    if (hit && hit.m === m) return hit.rows;
    const terrain = terrainOf(st.info?.name || "", cls);
    const c = await cnFor(terrain);
    const rows = d.rows.map((r) => {
      const me = who(r[1], r[2]);
      const get = (k) => (me ? c[k].get(me.lic) ?? null : null);
      return { r, cls, d, me, key: `${r[1]}|${r[2]}`, time: r[4] === 0 && r[3] != null ? r[3] / 100 : null, cn: get("shown"), cnv: { v: get("valuer") } };
    });
    // (a relay's legs are not one circuit: no score, no expected place)
    if (!d.relay) {
      const fin = rows.filter((x) => x.time), score = scores(fin, "v", terrain);
      for (const x of fin) x.score = score(x);
      rows.filter((x) => x.cn != null).sort((a, b) => b.cn - a.cn).forEach((x, i) => { x.expected = i + 1; });
    }
    for (const x of rows) if (mine && x.me && data.clubParts(x.me.club).code === mine && x.r[2]) myKeys.add(clubKey(x.r[2]));
    enriched.set(d, { m, rows });
    return rows;
  }
  const kindOf = (x, now) => {
    const [, , , result, status, , , start] = x.r;
    // liveresultat's own word first (9: started, 10: entered, not started), then the start time against the clock
    return status === 0 && result != null ? "fin" : STATUS[status] ? "out" : status === 9 ? "run" : status === 10 ? "wait"
      : start != null && start <= now ? "run" : "wait";
  };

  // ---- the connection: one subscription, a course or the whole race ----
  const wantSub = () => (st.view === "cls" && !st.wantAll ? st.cls : "*");
  function subscribe() {
    const s = wantSub();
    if (!s || s === st.sub || st.ws?.readyState !== 1) return;
    st.sub = s;
    st.ws.send(JSON.stringify({ sub: s }));
  }
  function connect() {
    if (st.gone) return;
    const ws = new WebSocket(`${(LIVE || location.origin).replace(/^http/, "ws")}/ws/${id}`);
    st.ws = ws;
    ws.onopen = () => { st.up = true; st.tries = 0; st.heard = Date.now(); st.sub = null; subscribe(); status(); };
    ws.onmessage = (e) => { st.heard = Date.now(); if (e.data !== "pong") on(JSON.parse(e.data)); };
    ws.onclose = () => {
      st.up = false; st.sub = null; status();
      if (!st.gone && !document.hidden) setTimeout(connect, [1000, 2000, 5000, 10000, 30000][Math.min(st.tries++, 4)]);
    };
  }
  // heartbeat: a « ping » every 25 s, answered by the relay without waking it; nothing heard for a minute (a phone's
  // connection dead without a word: network change, sleep) — drop it and connect again
  function heartbeat() {
    const ws = st.ws;
    if (!ws || ws.readyState !== 1) return;
    if (Date.now() - (st.pinged || 0) > 25000) { st.pinged = Date.now(); try { ws.send("ping"); } catch (e) { /* closing */ } }
    if (Date.now() - (st.heard || Date.now()) > 65000) { ws.onclose = null; ws.close(); st.up = false; st.sub = null; status(); connect(); }
  }
  // the punches the relay sends (its last 30) added up over the visit, the newest first
  function addPass(items) {
    const fresh = (items || []).filter((p) => { const k = p.slice(0, 4).join("|"); return !st.seen.has(k) && st.seen.add(k); });
    st.pass = [...fresh, ...st.pass].slice(0, 300);
  }
  let later = null;
  const soon = () => { clearTimeout(later); later = setTimeout(draw, 120); };
  // the live GPS tracking its organiser linked (« Organisation › Direct »): the competition of the same day and name
  let trackAsked = false;
  async function trackLink() {
    if (trackAsked || !st.info?.name) return;
    trackAsked = true;
    const day = st.info.date || new Date().toLocaleDateString("sv-SE");
    const l = [...(await tracking.links()).values()].find((x) => x.date === day && sameRace(x.name, st.info.name));
    if (l) $("#lv-trk").innerHTML = tracking.button(l);
  }
  function on(m) {
    if (m.t === "hello") {
      st.info = m.info; st.classes = m.classes; st.counts = m.counts || st.counts;
      trackLink();
      $("#lv-title").textContent = m.info?.name || id;
      $("#lv-sub").textContent = [m.info?.organizer, m.info?.date && fmtDate(m.info.date)].filter(Boolean).join(" · ");
      if (m.pass) addPass(m.pass);
      // no class asked for: the one of the latest arrival, else the first
      if (!st.cls || !st.classes.includes(st.cls)) st.cls = st.pass.map((x) => x[2]).find((c) => st.classes.includes(c)) || st.classes[0] || null;
      address(); subscribe(); draw();
    } else if (m.t === "classes") { st.classes = m.classes; if (!st.cls) st.cls = st.classes[0] || null; subscribe(); soon(); }
    else if (m.t === "counts") { st.counts = m.counts || {}; pickers(); }
    else if (m.t === "class" && !m.missing) {
      st.all.set(m.c, m);
      // a relay runner's punches open: asked again as their class moves (the relay keeps them 20 s)
      for (const k of st.openLegs) if (k.startsWith(`${m.c}|`) && Date.now() - (st.punchAsked.get(k) || 0) > 20000) askPunch(m.c, k.slice(m.c.length + 1));
      if (st.view !== "cls" || m.c === st.cls) soon();
      if (st.finding) findList();
    } else if (m.t === "pass") { addPass(m.items); ticker(); status(); if (st.view === "pass") soon(); }
    else if (m.t === "punch") {
      const k = `${m.c}|${m.k}`;
      if (m.busy) { setTimeout(() => { if (st.openLegs.has(k)) askPunch(m.c, m.k); }, 1200); return; }
      st.punch.set(k, m); soon();
    }
  }
  // a relay runner's punches at the radio controls, asked of the relay (O'Live's card, read on demand)
  function askPunch(c, key) {
    st.punchAsked.set(`${c}|${key}`, Date.now());
    if (st.ws?.readyState === 1) st.ws.send(JSON.stringify({ punch: { c, k: key } }));
  }
  function address() {
    const tail = st.view === "pass" ? `${PASS_VIEW}/${st.pf}` : st.view === "club" ? `${CLUB_VIEW}/${encodeURIComponent(st.club)}` : encodeURIComponent(st.cls || "");
    replaceQuery({});
    history.replaceState(null, "", `#/direct/${id}/${tail}`);
  }
  // a view chosen: a course, a club (or everyone still out), the punches
  function show(view, v) {
    st.view = view;
    if (view === "cls") st.cls = v; else if (view === "club") st.club = v; else st.pf = v;
    st.wantAll = false;
    address(); subscribe(); draw();
  }

  // ---- what is drawn ----
  const countTxt = (c) => { const n = st.counts[c]; return n ? `${n[0]}/${n[1]}` : ""; };
  /** The clubs of the race (from the classes held), the most runners first: [[key, name, n]]. */
  function clubs() {
    const by = new Map();
    for (const d of st.all.values()) for (const r of d.rows) {
      const k = clubKey(r[2]);
      if (!k) continue;
      const e = by.get(k) || by.set(k, [k, r[2], 0]).get(k);
      e[2]++;
    }
    return [...by.values()].sort((a, b) => a[1].localeCompare(b[1], lang()));
  }
  function pickers() {
    const ph = (on, k) => (on ? "" : html`<option value="" selected>${t(k)}</option>`);
    const club = st.view === "club" ? st.club : null, cs = clubs();
    const picks = html`<label class="lv-pk lv-pk-c${st.view === "cls" ? " on" : ""}"><select id="lv-sel" aria-label="${t("prov.circuit")}">${ph(st.view === "cls", "lv.sel.circuit")}
        ${st.classes.map((c) => html`<option value="${c}" ${raw(st.view === "cls" && c === st.cls ? "selected" : "")}>${fmtCat(c)}${countTxt(c) ? ` · ${countTxt(c)}` : ""}</option>`)}</select></label>
      <label class="lv-pk${st.view === "club" ? " on" : ""}"><select id="lv-club" aria-label="${t("lv.sel.club")}">${ph(st.view === "club", "lv.sel.club")}
        ${hasClub() ? html`<option value="mine" ${raw(club === "mine" ? "selected" : "")}>${t("lv.club.mine")}</option>` : ""}
        <option value="run" ${raw(club === "run" ? "selected" : "")}>${t("lv.club.run")}</option>
        ${cs.length ? html`<optgroup label="${t("lv.sel.clubs")}">${cs.map(([k, n, c]) => html`<option value="${k}" ${raw(club === k ? "selected" : "")}>${n} (${c})</option>`)}</optgroup>` : ""}</select></label>
      <label class="lv-pk${st.view === "pass" ? " on" : ""}"><select id="lv-pf" aria-label="${t("lv.passView")}">${ph(st.view === "pass", "lv.passView")}
        <option value="all" ${raw(st.view === "pass" && st.pf === "all" ? "selected" : "")}>${t("lv.pass.all")}</option>
        ${hasClub() ? html`<option value="mine" ${raw(st.view === "pass" && st.pf === "mine" ? "selected" : "")}>${t("lv.pass.mine")}</option>` : ""}</select></label>`;
    // redrawn only when it changed, and never while one of them is open (owner, 2026-10-22: a selector opened on the phone
    // was replaced by the next update — counts, a class read — and the choice made in it was lost)
    const el = $("#lv-picks");
    if (picks !== st.picksHtml && !el.contains(document.activeElement)) {
      el.innerHTML = picks; st.picksHtml = picks; el.dataset.on = { cls: "c", club: "k", pass: "p" }[st.view];
    }
    else if (picks !== st.picksHtml) st.picksLate = true;
    // a wide screen's list: the views the phone's selectors offer first (owner, 2026-10-22: « Mon club » was missed there),
    // then the courses
    const vw = (view, v, k) => { const on = st.view === view && (view === "club" ? st.club : st.pf) === v;
      return html`<button type="button" class="lv-item${on ? " on" : ""}" aria-pressed="${on}" data-lv-v="${view}:${v}"><span>${t(k)}</span></button>`; };
    const side = html`<div class="lv-side-title">${t("lv.side.views")}</div>
      ${hasClub() ? vw("club", "mine", "lv.club.mine") : ""}${vw("club", "run", "lv.club.run")}
      ${vw("pass", "all", "lv.pass.all")}${hasClub() ? vw("pass", "mine", "lv.pass.mine") : ""}
      <div class="lv-side-title lv-side-sep">${t("prov.circuit")} <span class="muted" title="${t("lv.count.hint")}">${t("lv.count.head")}</span></div>
      ${st.classes.map((c) => { const on = st.view === "cls" && c === st.cls; return html`<button type="button" class="lv-item${on ? " on" : ""}" aria-pressed="${on}" data-c="${c}">
        <span>${fmtCat(c)}</span><span class="lv-cnt">${countTxt(c)}</span></button>`; })}`;
    if (side !== st.sideHtml) { $("#lv-chips").innerHTML = side; st.sideHtml = side; sideToOn(); }
  }
  // the course chosen brought into view within the list only (owner, 2026-10-24: scrollIntoView also scrolled the window, and
  // the page came back from « Analyse de course » scrolled down when the course was low in a long list)
  function sideToOn() {
    const box = $(".lv-side"), on = $("#lv-chips .on");
    if (!box || !on || box.scrollHeight <= box.clientHeight) return;
    const b = box.getBoundingClientRect(), r = on.getBoundingClientRect();
    if (r.top < b.top) box.scrollTop += r.top - b.top - 8;
    else if (r.bottom > b.bottom) box.scrollTop += r.bottom - b.bottom + 8;
  }
  function status() {
    const el = $("#lv-status");
    if (!el) return;                                     // (the page was left: the socket's close lands here)
    if (!st.up) { el.className = "lv-status"; el.textContent = st.info ? t("lv.offline") : t("lv.connecting"); return; }
    const p = st.pass[0]?.[0]?.match(/^(\d{1,2}):(\d{2}):(\d{2})$/);
    let age = p ? nowAt(st.info) / 100 - (Number(p[1]) * 3600 + Number(p[2]) * 60 + Number(p[3])) : null;
    if (age != null && (age < -60 || age > 12 * 3600)) age = null;
    const live = age != null && age < 300;
    // (a race of a day gone is over, whatever the clock of its last punch says: the CNE of the day before read « En direct »,
    // its punches' times of day compared with today's clock; owner, 2026-10-26)
    let today;
    try { today = new Intl.DateTimeFormat("sv-SE", { timeZone: st.info?.timezone || "Europe/Paris" }).format(new Date()); }
    catch (e) { today = new Date().toLocaleDateString("sv-SE"); }
    const over = !!st.info?.date && st.info.date < today;
    el.className = `lv-status${live && !over ? " live" : ""}`;
    el.textContent = over ? t("lv.over") : live ? t("lv.on") : age != null ? t("lv.idle", { m: Math.round(age / 60) }) : t("lv.connected");
  }
  const ctlOf = (ctl, ctlName) => (Number(ctl) === 1000 ? t("lv.ev.finish") : t("lv.ev.radio", { c: ctlName || ctl }));
  // a relay leg's end before the last is a handover (« Relais 2 », the runner's row in the class held), not the finish
  const legEnd = (cls, name) => {
    const d = st.all.get(cls), r = d?.relay ? d.rows.find((x) => x[1] === name) : null;
    return r?.[10] && r[10][1] < d.relay.legs ? r[10][1] : null;
  };
  const evLabel = (ctl, ctlName, cls, name) => { const l = Number(ctl) === 1000 ? legEnd(cls, name) : null; return l ? t("lv.ev.handover", { l }) : ctlOf(ctl, ctlName); };
  // the latest punches on one line, scrolling sideways; ▾ opens them as a table
  function ticker() {
    const el = $("#lv-pass");
    if (!el) return;
    if (st.view === "pass" || !st.pass.length) { el.innerHTML = ""; return; }
    const now = nowAt(st.info);
    el.innerHTML = html`<div class="lv-pass"><div class="lv-strip">${st.pass.slice(0, 30).map(([at, name, cls, ctl, ctlName, time]) => html`<button type="button" class="lv-pi ${recent(parseTod(at), now)}"
      data-go="${cls}" data-name="${name}" title="${at}"><b>${name}</b> · ${fmtCat(cls)} · ${evLabel(ctl, ctlName, cls, name)} ${time}</button>`)}</div>
      <button type="button" class="btn btn-sm lv-pexp" data-lv-view="pass" title="${t("lv.passView.tip")}" aria-label="${t("lv.passView.tip")}">▾</button></div>`;
  }
  function note() {
    const el = $("#lv-note"), held = st.classes.filter((c) => st.all.has(c)).length;
    const show = st.view !== "cls" && held < st.classes.length;
    el.hidden = !show;
    if (show) el.textContent = t("lv.loadingAll", { n: held, total: st.classes.length });
  }

  // the split-time analysis (« Analyse de course », 2026-10-23) once a split time has come: the course shown, else the first
  function analyseLink() {
    const el = $("#lv-an");
    if (!el) return;
    const any = [...st.all.values()].some(hasSplits) || st.pass.some((p) => Number(p[3]) !== 1000);
    el.hidden = !any;
    const i = st.view === "cls" ? st.classes.indexOf(st.cls) : -1;
    if (any) el.href = `#/analyse-course?course=${LIVE_KEY}${id}${i > 0 ? `&c=${i}` : ""}`;
  }

  let drawing = 0;
  async function draw() {
    const my = ++drawing;
    pickers(); ticker(); note(); buzzBar(); analyseLink();
    let out;
    if (st.view === "cls") out = await courseTable();
    else if (st.view === "club") out = await clubTable();
    else out = await passTable();
    if (my !== drawing || out == null) return;
    const a = st.mark && st.markScroll ? null : anchor();
    $("#lv-rows").innerHTML = out;
    st.tapped = null;
    if (st.mark && st.markScroll) {
      const tr = markedRow();
      if (tr) {
        st.markScroll = false;
        tr.scrollIntoView({ block: "center" });
        // (and again once the page has settled, if what was drawn above it since pushed it out of sight)
        setTimeout(() => { const r = markedRow()?.getBoundingClientRect(); if (r && (r.top < 0 || r.bottom > innerHeight)) markedRow().scrollIntoView({ block: "center" }); }, 400);
      }
    } else restore(a);
    popDraw();
  }
  const markedRow = () => [...$$("#lv-rows tr[data-k]", main)].find((x) => x.dataset.k === st.mark) || null;
  // what stays put on the screen when the table is drawn again (owner, 2026-10-25: a tap on a runner sometimes moved the
  // page): the row tapped, else the row marked, else the first row in sight
  function anchor() {
    const box = $("#lv-rows"), seen = (x) => { const r = x.getBoundingClientRect(); return r.bottom > 0 && r.top < innerHeight; };
    const el = [st.tapped?.isConnected ? st.tapped : null, st.mark ? markedRow() : null].find((x) => x && seen(x))
      || [...$$("tr[data-k], [data-team]", box)].find(seen);
    if (!el) return null;
    return { k: el.dataset.k, team: el.dataset.team, top: el.getBoundingClientRect().top };
  }
  function restore(a) {
    if (!a) return;
    const el = a.team != null ? [...$$("[data-team]", $("#lv-rows"))].find((x) => x.dataset.team === a.team)
      : [...$$("tr[data-k]", $("#lv-rows"))].find((x) => x.dataset.k === a.k);
    if (el) window.scrollBy(0, el.getBoundingClientRect().top - a.top);
  }

  // a class's usual times (2026-10-22): the finishers' median time and, at each radio control, the median of those finishers
  // who passed it — from 3 finishers on; a runner still out is expected at the finish at their time at the last radio control
  // scaled by them (the median time when they passed none)
  const usual = new WeakMap();
  function usualOf(d) {
    if (usual.has(d)) return usual.get(d);
    const fin = d.rows.filter((r) => r[4] === 0 && r[3] != null);
    const med = (a) => { const s = a.filter((v) => v > 0).sort((p, q) => p - q); return s.length ? s[Math.floor((s.length - 1) / 2)] : null; };
    const u = fin.length >= 3 ? { fin: med(fin.map((r) => r[3])), at: (d.controls || []).map((_, i) => med(fin.map((r) => r[8]?.[i]?.[0]))) } : null;
    usual.set(d, u);
    return u;
  }
  function eta(x) {
    const u = usualOf(x.d), start = x.r[7], splits = x.r[8];
    if (!u?.fin || start == null) return null;
    const last = splits ? splits.map((s, i) => (s && u.at[i] ? [i, s[0]] : null)).filter(Boolean).pop() : null;
    return start + Math.round((last ? last[1] / u.at[last[0]] : 1) * u.fin);
  }

  // one runner's line: place, name, [course,] [club,] [category,] start, time and gap, CN and expected place, score and gap
  function line(x, k, now, o) {
    const [place, name, club, result, status, timeplus, , start, splits, prel] = x.r;
    const rc = k === "fin" || k === "run" ? recent(lastAt(x.r), now) : "";
    const ctl = x.d.controls || [];
    let time = "", sub = "";
    if (k === "fin" && STATUS[status]) time = html`<span class="muted">${ST_LABEL[STATUS[status]]}</span>`;
    else if (k === "fin") {
      time = html`<b>${hs(result)}</b>`;
      // a finish a radio control recorded, before the card is read (MeOS's online results)
      sub = html`${timeplus ? `+${hs(timeplus)}` : ""}${prel ? html` <span class="lv-prel" title="${t("lv.prel.tip")}">${t("lv.prel")}</span>` : ""}`;
    } else if (k === "run") {
      const last = splits ? splits.map((s, i) => (s ? [i, s] : null)).filter(Boolean).pop() : null;
      time = html`<span class="muted" data-start="${start}">${now >= start ? hs(now - start) : ""}</span>`;
      const e = x.d.relay ? null : eta(x);
      sub = html`${last ? t("lv.atControl", { c: ctl[last[0]]?.[1] || "", p: last[1][1] ?? "–", d: last[1][2] ? `+${hs(last[1][2])}` : "+0:00" }) : ""}${
        e != null && e > now ? html`${last ? " · " : ""}<span class="lv-eta" title="${t("lv.eta.tip")}">${t("lv.eta", { t: tod(e) })}</span>` : ""}`;
    } else if (k === "out") time = html`<span class="muted">${ST_LABEL[STATUS[status]]}</span>`;
    if (sub && sub.s === "") sub = "";
    const cls = [rc, st.mark === x.key ? "lv-mark" : ""].filter(Boolean).join(" ");
    const g = x.score && x.cn ? x.score - x.cn : null;
    return html`<tr data-k="${x.key}"${raw(cls ? ` class="${cls}"` : "")}>
      <td class="r num"><b>${k === "fin" ? place ?? "" : ""}</b>${o.cat && x.me?.cat && !ONE ? html`<div class="lv-2 lv-m">${fmtCat(x.me.cat)}</div>` : ""}</td>
      <td class="lv-n"><div class="lv-clamp">${x.r[10] || o.course ? html`<button type="button" class="lv-link" data-go="${x.cls}" data-name="${name}"
        title="${t(x.r[10] ? "lv.toLeg" : "lv.toCourse")}">${name}</button>` : html`<button type="button" class="lv-link" data-pop="${x.key}"
        title="${t("lv.pop.tip")}">${name}</button>`}</div></td>
      ${o.course ? html`<td class="lv-c">${fmtCat(x.cls)}${
        x.r[10] ? html` <span class="muted">· ${t("lv.leg.n", { l: x.r[10][1] })}</span>` : ""}</td>` : ""}
      ${o.club ? html`<td class="lv-c"><div class="lv-clamp">${club}</div></td>` : ""}
      ${o.cat ? html`<td class="lv-cat${ONE ? "" : " lv-d"}">${x.me?.cat ? fmtCat(x.me.cat) : ""}</td>` : ""}
      <td class="r num lv-st">${tod(start)}</td>
      ${pair("r num lv-t", time, sub)}
      ${FR ? html`${pair("r num", x.cn != null ? fmt(x.cn) : html`<span class="muted">—</span>`, x.expected ? String(x.expected) : "")}
      ${ONE ? html`<td class="r num">${x.score == null ? "" : x.score ? fmt(x.score) : html`<span class="dim">0</span>`}</td>
        <td class="r num lv-sc">${g == null ? "" : html`<span class="gap ${g > 0 ? "delta-up" : g < 0 ? "delta-down" : "dim"}">${g > 0 ? "+" : g < 0 ? "−" : "±"}${fmt(Math.abs(g))}</span>`}</td>`
        : html`<td class="r num lv-sc">${x.score != null ? scoreCell(x.score, x.cn) : ""}</td>`}` : ""}</tr>`;
  }
  function table(groups, now, o) {
    const m = store.arenaMethod();
    const cols = 4 + (o.course ? 1 : 0) + (o.club ? 1 : 0) + (o.cat ? 1 : 0) + (FR ? 2 : 0) + (ONE ? 1 + (FR ? 2 : 0) : 0);
    const block = (k) => (groups[k]?.length ? html`<tr class="lv-sec"><td colspan="${cols}"><span class="lv-sec-l">${t(`lv.${k}`)} <span class="muted">${groups[k].length}</span></span></td></tr>
      ${groups[k].map((x) => line(x, k, now, o))}` : "");
    return html`<table class="data compact lv-table${ONE ? " lv-one" : ""}"><thead><tr><th class="r">${t("prov.place")}</th><th>${t("prov.name")}</th>
      ${o.course ? html`<th>${t("prov.circuit")}</th>` : ""}${o.club ? html`<th>${t("prov.club")}</th>` : ""}
      ${o.cat ? html`<th class="${ONE ? "" : "lv-d"}" title="${t("prov.catCn")}">${t("prov.cat")}</th>` : ""}<th class="r">${t("lv.start")}</th>
      ${pairHead(t("prov.time"), t("lv.behind"))}
      ${FR ? html`${pairHead(t(`cn.${m}.S`), t("lv.expected"), `${cnLabel(m)} — ${m === "official" ? `${t("lv.cnJ15.hint")} — ` : ""}${t("lv.expected.hint")}`)}
      ${pairHead(t("lv.score"), t(ONE ? "lv.gapCn" : "lv.gap"), `${scoreLabel(m)} — ${t("lv.score.hint")}`)}` : ""}</tr></thead>
      <tbody>${block("fin")}${block("run")}${block("wait")}${block("out")}</tbody></table>`;
  }
  const grouped = (rows, now) => {
    const g = { fin: [], run: [], out: [], wait: [] };
    for (const x of rows) g[kindOf(x, now)].push(x);
    return g;
  };
  // a relay's class (O'Live, 2026-10-25): a line per team — its place, name and bib, the leg it is on, its time so far and
  // gap — then a line per leg: the runner, the leg's start, their leg time with their place and gap on that leg, the team's
  // total at the handover with its place and gap to the first team there
  const placeGap = (p, d) => (p ? t("lv.placeGap", { p, d: d ? `+${hs(d)}` : "+0:00" }) : "");
  function relayTable(rows, d, now, cls) {
    const byTeam = new Map();
    for (const x of rows) (byTeam.get(x.r[10][0]) || byTeam.set(x.r[10][0], []).get(x.r[10][0])).push(x);
    const g = { fin: [], run: [], wait: [], out: [] };
    for (const tm of d.relay.teams) {
      const legs = (byTeam.get(tm[0]) || []).sort((a, b) => a.r[10][1] - b.r[10][1]);
      // a team one of whose runners is out of the race (PM, abandon, disqualified…) is not ranked, even while its next runners
      // still run: the list at the bottom (owner, 2026-10-25), under the first such runner's state
      const bad = legs.find((x) => STATUS[x.r[4]]);
      const k = bad || STATUS[tm[4]] ? "out" : tm[4] === 0 ? "fin" : legs.some((x) => kindOf(x, now) === "run") ? "run"
        : tm[6] || legs.some((x) => kindOf(x, now) !== "wait") ? "run" : "wait";
      // the leg being run: its runner's out, else the one after the last handover
      const cur = legs.find((x) => kindOf(x, now) === "run")?.r[10][1] ?? Math.min(tm[6] + 1, d.relay.legs);
      g[k].push({ tm, legs, cur, why: bad ? bad.r[4] : tm[4] });
    }
    // racing: grouped by the leg being run, the furthest first, then by the team's total shown on its line (O'Live's; a leg
    // run from a mass start carries a total of its own, below the team's: ROP at the CNE, 3:54:35 after 5:18:39)
    const last = (e) => e.tm[3] ?? [...e.legs].reverse().find((x) => x.r[10][2] != null)?.r[10][2] ?? 0;
    const byBib = (a, b) => String(a.tm[0]).localeCompare(String(b.tm[0]), undefined, { numeric: true });
    g.fin.sort((a, b) => (a.tm[2] ?? 1e9) - (b.tm[2] ?? 1e9) || byBib(a, b));
    g.run.sort((a, b) => b.cur - a.cur || last(a) - last(b) || byBib(a, b));
    g.wait.sort(byBib); g.out.sort(byBib);
    const cols = 7 + (FR ? 1 : 0) + (ONE ? 2 : 0);
    // each team one line, a button (owner, 2026-10-25): its rank — at the finish, else its place in the race (the furthest
    // leg, then the total at its last handover: the order above) —, its name, its time so far; pushed, its runners under it
    // (kept open over the updates; a runner searched for opens their team)
    const keyOf = (bib) => `${cls}|${bib}`;
    const finRank = Math.max(g.fin.length, ...g.fin.map((e) => e.tm[2] || 0));
    const isOpen = (e) => st.openTeams.has(keyOf(e.tm[0])) || (st.mark && e.legs.some((x) => x.key === st.mark));
    const team = (e, k, i) => {
      const [bib, name, place, total] = e.tm;
      // (the teams racing ranked after the last team in: owner, 2026-10-25)
      const rank = k === "fin" ? place : k === "run" ? finRank + i + 1 : null;
      // a team racing: its total at its last handover (with a mass start every team's time so far is the same clock); before
      // its first handover, its first runner's time, ticking
      const out = k === "run" && total == null ? e.legs.find((x) => kindOf(x, now) === "run" && x.r[7] != null) : null;
      const before = out ? (out.r[10][1] > 1 ? e.legs.find((x) => x.r[10][1] === out.r[10][1] - 1)?.r[10][2] : 0) : null;
      const from = out && before != null ? out.r[7] - before : null;
      const open = isOpen(e);
      return html`<tr class="lv-team"><td colspan="${cols}"><button type="button" class="lv-tbtn" data-team="${keyOf(bib)}" aria-expanded="${open}"
          title="${t(open ? "lv.team.close" : "lv.team.open")}"><span class="lv-tb-pl">${rank ?? ""}</span><span class="lv-tb-ch" aria-hidden="true">›</span>
          <span class="lv-tb-n">${name}</span><span class="lv-tb-t">${k === "out" ? html`<span class="muted">${ST_LABEL[STATUS[e.why]] || ""}</span>`
            : from != null ? html`<span class="lv-tb-run" data-start="${from}">${now >= from ? hs(now - from) : ""}</span>`
            : total != null ? hs(total) : ""}</span></button></td></tr>`;
    };
    const leg = (x) => {
      const [place, name, , result, status, timeplus, , start, , prel, [, l, cumul, tplace, tgap]] = x.r;
      const k = kindOf(x, now);
      const rc = k === "fin" || k === "run" ? recent(lastAt(x.r), now) : "";
      const cls_ = ["lv-leg", rc, st.mark === x.key ? "lv-mark" : ""].filter(Boolean).join(" ");
      const time = k === "fin" ? html`<b>${hs(result)}</b>` : k === "run" ? html`<span class="muted" data-start="${start}">${now >= start ? hs(now - start) : ""}</span>`
        : k === "out" ? html`<span class="muted">${ST_LABEL[STATUS[status]]}</span>` : "";
      const tsub = k === "fin" ? html`${placeGap(place, timeplus)}${prel ? html` <span class="lv-prel" title="${t("lv.prel.tip")}">${t("lv.prel")}</span>` : ""}` : "";
      // (owner, 2026-10-25: a runner's line opens their times at the radio controls, as O'Live does, not their page)
      const pk = `${cls}|${x.key}`, open = st.openLegs.has(pk);
      return html`<tr data-k="${x.key}" data-punch="${pk}" class="${cls_} lv-pick${open ? " lv-popen" : ""}" title="${t(open ? "lv.punch.hide" : "lv.punch.tip")}"
          aria-expanded="${open}" tabindex="0"><td class="r num muted">${l}</td>
        <td class="lv-n"><div class="lv-clamp">${name}</div></td>
        <td class="r num lv-st">${k === "wait" ? "" : tod(start)}</td>
        ${pair("r num lv-t", time, tsub)}
        ${pair("r num lv-t", cumul != null ? hs(cumul) : "", cumul == null ? "" : tgap ? `+${hs(tgap)}` : tplace ? "+0:00" : "")}
        <td class="r num lv-rk">${tplace ? html`<b>${t("lv.rank.n", { p: tplace })}</b>` : ""}</td>
        <td class="lv-cat" title="${t("prov.catCn")}">${x.me?.cat ? fmtCat(x.me.cat) : ""}</td>
        ${FR ? html`<td class="r num">${x.cn != null ? fmt(x.cn) : html`<span class="muted">—</span>`}</td>` : ""}</tr>
        ${open ? punchRow(pk, k) : ""}`;
    };
    // the runner's punches: each radio control (the finish last) with their split, their time from their start, their place
    // there and their time behind the first there
    const punchRow = (pk, k) => {
      const p = st.punch.get(pk);
      // (no card yet for a runner out: O'Live gives one once a radio control has seen them)
      const body = !p ? html`<span class="muted">${t("lv.loading")}</span>` : p.none ? html`<span class="muted">${t(k === "run" ? "lv.punch.empty" : "lv.punch.none")}</span>`
        : p.failed ? html`<span class="muted">${t("lv.punch.failed")}</span>` : !p.rows?.length ? html`<span class="muted">${t("lv.punch.empty")}</span>`
        : html`<div class="lv-pgrid"><span class="h">${t("lv.punch.ctl")}</span><span class="h">${t("lv.punch.leg")}</span><span class="h">${t("lv.punch.cum")}</span>
          <span class="h">${t("prov.place")}</span><span class="h">${t("lv.behind")}</span>
          ${p.rows.map(([code, legT, cum, , place, gap]) => html`<span>${/^arr/i.test(code) ? t("lv.ev.finish") : code}</span>
            <span>${legT != null ? hs(legT * 100) : ""}</span><span><b>${cum != null ? hs(cum * 100) : ""}</b></span>
            <span>${place ? t("lv.rank.n", { p: place }) : ""}</span><span>${gap ? `+${hs(gap * 100)}` : place === 1 ? "+0:00" : ""}</span>`)}</div>`;
      return html`<tr class="lv-punchrow"><td colspan="${cols}">${body}</td></tr>`;
    };
    // (racing teams under a line per leg being run: « Relais 3/7 »)
    const legHead = (e, i, list) => (i && list[i - 1].cur === e.cur ? "" : html`<tr class="lv-sec lv-legsec"><td colspan="${cols}"><span class="lv-sec-l">${
      t("lv.onLeg", { l: e.cur, n: d.relay.legs })} <span class="muted">${list.filter((x) => x.cur === e.cur).length}</span></span></td></tr>`);
    const block = (k) => (g[k].length ? html`<tr class="lv-sec"><td colspan="${cols}"><span class="lv-sec-l">${t(`lv.t${k}`)} <span class="muted">${g[k].length}</span></span></td></tr>
      ${g[k].map((e, i, list) => html`${k === "run" ? legHead(e, i, list) : ""}${team(e, k, i)}${isOpen(e) ? e.legs.map(leg) : ""}`)}` : "");
    const m = store.arenaMethod();
    return html`<table class="data compact lv-table lv-relay${ONE ? " lv-one" : ""}"><thead><tr><th class="r" title="${t("lv.legNo.tip")}">${t("prov.place")}</th>
      <th>${t("lv.teamRunner")}</th><th class="r">${t("lv.start")}</th>
      ${pairHead(t("lv.legTime"), t("lv.legPlace"), t("lv.legTime.tip"))}${pairHead(t("lv.cumul"), t("lv.behind"), t("lv.cumul.tip"))}<th class="r" title="${t("lv.rank.tip")}">${t("lv.rank")}</th><th title="${t("prov.catCn")}">${t("prov.cat")}</th>
      ${FR ? html`<th class="r" title="${cnLabel(m)}${m === "official" ? ` — ${t("lv.cnJ15.hint")}` : ""}">${t(`cn.${m}.S`)}</th>` : ""}</tr></thead>
      <tbody>${block("fin")}${block("run")}${block("wait")}${block("out")}</tbody></table>`;
  }
  async function courseTable() {
    if (!st.cls) return html`<div class="empty">${t(st.classes.length ? "lv.loading" : "lv.noClasses")}</div>`;
    const rows = await enrich(st.cls);
    if (!rows) return html`<div class="empty">${t("lv.loading")}</div>`;
    if (!rows.length) return html`<div class="empty">${t("lv.empty")}</div>`;
    const d = st.all.get(st.cls);
    if (d?.relay) return relayTable(rows.filter((x) => x.r[10]), d, nowAt(st.info), st.cls);
    const now = nowAt(st.info), g = grouped(rows, now);
    g.fin.sort((a, b) => (a.r[0] ?? 1e9) - (b.r[0] ?? 1e9));
    g.run.sort((a, b) => (a.r[7] ?? 0) - (b.r[7] ?? 0));
    g.wait.sort((a, b) => (a.r[7] ?? 1e9) - (b.r[7] ?? 1e9));
    // the runner's category when the class does not say it (a course: « Circuit A »), from their latest race in the data
    return table(g, now, { club: true, cat: !CAT_CLASS.test(st.cls) && rows.some((x) => x.me?.cat) });
  }
  // the classes held, enriched, in the race's order
  async function everyone() {
    const out = [];
    for (const c of st.classes) { const rows = await enrich(c); if (rows) out.push(...rows); }
    return out;
  }
  async function clubTable() {
    const all = await everyone(), now = nowAt(st.info), order = new Map(st.classes.map((c, i) => [c, i]));
    const pick = st.club === "run" ? (x) => kindOf(x, now) === "run" : st.club === "mine" ? isMine : (x) => clubKey(x.r[2]) === st.club;
    const rows = all.filter(pick);
    if (!rows.length) return st.all.size < st.classes.length ? html`<div class="empty">${t("lv.loading")}</div>`
      : html`<div class="empty">${t(st.club === "run" ? "lv.run.none" : "lv.club.none")}</div>`;
    const g = grouped(rows, now), byClass = (a, b) => order.get(a.cls) - order.get(b.cls);
    // a runner who came in with a mispunch, disqualified or over time has arrived: with the others in (owner, 2026-10-25),
    // after the classified of their course
    g.fin.push(...g.out.filter((x) => ARRIVED.has(x.r[4])));
    g.out = g.out.filter((x) => !ARRIVED.has(x.r[4]));
    g.fin.sort((a, b) => byClass(a, b) || (a.r[0] ?? 1e9) - (b.r[0] ?? 1e9));
    g.run.sort((a, b) => (a.r[7] ?? 0) - (b.r[7] ?? 0));
    g.wait.sort((a, b) => (a.r[7] ?? 1e9) - (b.r[7] ?? 1e9));
    g.out.sort(byClass);
    return table(g, now, { course: true, club: st.club === "run" || st.club === "mine" && !mine, cat: rows.some((x) => x.me?.cat) });
  }
  // every punch the race's results hold — each radio control passed and each finish, at its time of day — and those of the
  // relay's last 30 whose course is not held yet; the newest first (owner, 2026-10-22: all of the last 15 minutes, which the
  // relay's last 30 did not cover at a busy start)
  function events() {
    const out = [], have = new Set();
    for (const c of st.classes) {
      const d = st.all.get(c);
      if (!d) continue;
      for (const r of d.rows) {
        const start = r[7];
        if (start == null) continue;
        (r[8] || []).forEach((s, i) => {
          if (s) out.push({ at: start + s[0], cls: c, r, ctl: d.controls?.[i]?.[0], ctlName: d.controls?.[i]?.[1] || "", time: hs(s[0]), place: s[1], gap: s[2] });
        });
        if (r[4] === 0 && r[3] != null) out.push({ at: start + r[3], cls: c, r, ctl: 1000, ctlName: "", time: hs(r[3]), place: r[0], gap: r[5] });
      }
    }
    for (const e of out) have.add(`${e.cls}|${e.r[1]}|${Number(e.ctl) === 1000 ? 1000 : e.ctl}`);
    for (const [at, name, cls, ctl, ctlName, time] of st.pass) {
      if (!have.has(`${cls}|${name}|${Number(ctl) === 1000 ? 1000 : ctl}`)) out.push({ at: parseTod(at), cls, name, ctl, ctlName, time, r: null });
    }
    return out.sort((a, b) => (b.at ?? 0) - (a.at ?? 0));
  }
  const evKey = (e) => `${e.cls}|${e.r ? e.r[1] : e.name}|${e.ctl}`;
  // the punches as a table: time of day, what (radio control or finish), runner and club, course and category, the time
  // there and the gap, the place there, the start
  async function passTable() {
    const all = await everyone(), byKey = new Map(), now = nowAt(st.info);
    for (const x of all) byKey.set(`${x.cls}|${x.r[1]}`, x);
    const evs = events().map((e) => ({ ...e, x: e.r ? byKey.get(`${e.cls}|${e.r[1]}`) : null }))
      .filter((e) => st.pf === "all" || (e.x ? isMine(e.x) : mates.has(nameKey(e.r ? e.r[1] : e.name))));
    const inWindow = evs.filter((e) => e.at != null && now - e.at <= WINDOW && now - e.at >= -AHEAD);
    if (st.pf === "mine") buzzOn(inWindow);
    const shown = inWindow.length ? inWindow : evs.slice(0, 20);
    if (!shown.length) return html`<div class="empty">${t("lv.pf.none")}</div>`;
    return html`<div class="lv-pwin muted">${t(inWindow.length ? "lv.pass.window" : "lv.pass.quiet")}</div>
      <table class="data compact lv-table lv-ptable${ONE ? " lv-one" : ""}"><thead><tr><th>${t("lv.at")}</th><th>${t("lv.ev")}</th>
      ${ONE ? html`<th>${t("prov.name")}</th><th>${t("prov.club")}</th><th>${t("prov.circuit")}</th><th>${t("prov.cat")}</th>`
        : html`<th>${t("prov.name")}</th><th>${t("prov.circuit")}</th>`}
      ${pairHead(t("prov.time"), t("lv.behind"))}<th class="r">${t("prov.place")}</th><th class="r">${t("lv.start")}</th></tr></thead>
      <tbody>${shown.map((e) => {
        const name = e.r ? e.r[1] : e.name, fin = Number(e.ctl) === 1000;
        const gap = e.gap ? `+${hs(e.gap)}` : e.place === 1 ? "+0:00" : "";
        return html`<tr class="lv-prow ${recent(e.at, now)}" data-go="${e.cls}" data-name="${name}">
          <td class="num muted">${tod(e.at)}</td>
          <td><span class="lv-ev ${fin ? "lv-ev-fin" : "lv-ev-radio"}">${raw(fin ? FINISH_ICON : RADIO_ICON)} ${evLabel(e.ctl, e.ctlName, e.cls, name)}</span></td>
          ${pair("lv-n", html`<div class="lv-clamp"><b>${name}</b></div>`, e.r?.[2] || "", "lv-c")}
          ${pair("lv-c", fmtCat(e.cls), e.x?.me?.cat && !CAT_CLASS.test(e.cls) ? fmtCat(e.x.me.cat) : "", "lv-c")}
          ${pair("r num", html`<b>${e.time}</b>`, gap)}
          <td class="r num">${e.place ?? ""}</td><td class="r num">${e.r ? tod(e.r[7]) : ""}</td></tr>`;
      })}</tbody></table>`;
  }

  // ---- the alert at each punch of one's club (owner, 2026-10-22): the phone vibrates (where it can: not an iPhone) and
  // beeps, while « Passages de mon club » is shown and the box ticked; the screen is kept on meanwhile (Wake Lock) ----
  function buzzBar() {
    const want = st.view === "pass" && st.pf === "mine";
    const bar = want ? html`<label class="lv-buzz"><input type="checkbox" id="lv-buzz" ${raw(st.buzz ? "checked" : "")}> ${t("lv.buzz")}</label>
      <div class="muted lv-buzz-hint">${t("lv.buzz.hint")}</div>` : "";
    if (bar !== st.buzzHtml) { $("#lv-buzzbar").innerHTML = bar; st.buzzHtml = bar; }
    wake(want && st.buzz && !document.hidden);
  }
  function buzzOn(evs) {
    const keys = evs.map(evKey);
    // the first look, and while the courses are still arriving one by one: what is there is not news
    const ready = st.classes.every((c) => st.all.has(c));
    if (!st.buzz || !st.buzzSeen || !ready) { st.buzzSeen = new Set([...(st.buzzSeen || []), ...keys]); return; }
    const now = nowAt(st.info);
    const fresh = evs.filter((e) => !st.buzzSeen.has(evKey(e)) && now - e.at <= 2 * 6000);
    for (const k of keys) st.buzzSeen.add(k);
    if (fresh.length) ring();
  }
  function ring() {
    try { navigator.vibrate?.([220, 100, 220]); } catch (e) { /* no vibration here */ }
    const ac = st.ac;
    if (!ac) return;
    ac.resume?.();
    [0, 0.22].forEach((d, i) => {
      const o = ac.createOscillator(), g = ac.createGain(), t0 = ac.currentTime + d;
      o.frequency.value = i ? 1175 : 880; o.connect(g); g.connect(ac.destination);
      g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(0.4, t0 + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.18);
      o.start(t0); o.stop(t0 + 0.2);
    });
  }
  async function wake(on) {
    if (on && !st.lock && navigator.wakeLock) {
      st.lock = "asking";
      try { st.lock = await navigator.wakeLock.request("screen"); st.lock.addEventListener?.("release", () => { st.lock = null; }); }
      catch (e) { st.lock = null; }
    } else if (!on && st.lock && st.lock !== "asking") { try { await st.lock.release(); } catch (e) { /* gone */ } st.lock = null; }
  }

  // ---- the search: a runner (their course, the row marked and scrolled to the middle) or a club ----
  function findList() {
    const el = $("#lv-find-list"), q = normalise($("#lv-find").value.trim());
    if (!q) { el.hidden = true; return; }
    const cs = clubs().filter(([k, n]) => normalise(n).includes(q) || k.includes(q)).slice(0, 4);
    const rs = [];
    for (const c of st.classes) for (const r of st.all.get(c)?.rows || []) if (normalise(r[1]).includes(q) && rs.length < 12) rs.push([c, r]);
    const held = st.classes.filter((c) => st.all.has(c)).length;
    el.innerHTML = html`${cs.length ? html`<div class="lv-find-head">${t("lv.find.clubs")}</div>${cs.map(([k, n, c]) => html`<button type="button" class="lv-find-item" data-club="${k}">
        <b>${n}</b> <span class="muted">${c}</span></button>`)}` : ""}
      ${rs.length ? html`<div class="lv-find-head">${t("lv.find.runners")}</div>${rs.map(([c, r]) => html`<button type="button" class="lv-find-item" data-go="${c}" data-name="${r[1]}">
        <b>${r[1]}</b> <span class="muted">${r[2]} · ${fmtCat(c)}</span></button>`)}` : ""}
      ${!cs.length && !rs.length ? html`<div class="lv-find-empty muted">${t("lv.find.none")}</div>` : ""}
      ${held < st.classes.length ? html`<div class="lv-find-empty muted">${t("lv.loadingAll", { n: held, total: st.classes.length })}</div>` : ""}`;
    el.hidden = false;
  }
  function goRunner(cls, name) {
    const r = st.all.get(cls)?.rows.find((x) => x[1] === name);
    st.mark = r ? `${r[1]}|${r[2]}` : null; st.markScroll = !!r;
    show("cls", cls);
  }
  const closeFind = () => { st.finding = false; $("#lv-find-list").hidden = true; };

  // a runner of a circuit, tapped: who they are, in a window over the page, closed by ✕, « Fermer », Échap or a tap beside
  // it (owner, 2026-10-26: their page left « En direct » with no way back in the installed app; the window says what the
  // table does not — their CN and Ozimut index today with their place overall and in their category, their races and
  // mispunches over 12 months, their podiums over 3 years, in the race's discipline —, and their times at the radio
  // controls); kept up to date while open
  const rankings = new Map(), facts = new Map();
  const rankingOf = (terrain, m) => {
    const k = `${terrain}|${m}`;
    if (!rankings.has(k)) rankings.set(k, loadRanking([m], terrain, data.latestMonth()).catch(() => null));
    return rankings.get(k);
  };
  // every discipline the runner has a value in, or raced in over 3 years: the method chosen in the header only (owner,
  // 2026-10-26: the race's discipline was guessed from its name, and both rankings made the window long)
  function factsOf(lic, m) {
    const k = `${lic}|${m}`;
    if (!facts.has(k)) facts.set(k, (async () => {
      const [races, ...rks] = await Promise.all([data.runnerRaces(lic).catch(() => []), ...TERRAINS.map((tr) => rankingOf(tr, m))]);
      const month = data.latestMonth(), from3 = addDays(month, -3 * 365);
      const out = TERRAINS.map((terrain, i) => {
        const rk = rks[i], me = rk?.rows.find((r) => r.lic === String(lic)), cn = me?.cn[m] ?? null;
        const last3 = races.filter((r) => r[data.R.terrain] === terrain && r[data.R.date] > from3);
        if (cn == null && !last3.length) return null;
        const all = cn == null ? [] : rk.rows.filter((r) => r.cn[m] != null), cat = cn != null && me.cat ? all.filter((r) => r.cat === me.cat) : [];
        return { terrain, cn, rank: me?.rank[m] ?? null, n: all.length, cat: me?.cat || "", catRank: cat.length ? 1 + cat.filter((r) => r.cn[m] > cn).length : null,
          catN: cat.length, pm: data.pmRate(races, terrain, month), podiums: last3.filter((r) => r[data.R.place] && r[data.R.place] <= 3).length,
          wins: last3.filter((r) => r[data.R.place] === 1).length };
      }).filter(Boolean);
      return { month, out };
    })());
    return facts.get(k);
  }
  async function popHtml(x) {
    const [place, name, club, result, , timeplus, , , splits] = x.r;
    const now = nowAt(st.info), k = kindOf(x, now), ctl = x.d.controls || [];
    const terrain = terrainOf(st.info?.name || "", x.cls);
    // the runner: in each discipline, their value today and their places, their last 12 months and 3 years; the race's own
    // discipline (as guessed from its name) first
    let who = html`<p class="muted lv-pop-none">${t(FR ? "lv.pop.unknown" : "lv.pop.noRank")}</p>`;
    if (FR && x.me) {
      const m = store.arenaMethod(), f = await factsOf(x.me.lic, m);
      const list = [...f.out].sort((a, b) => (b.terrain === terrain) - (a.terrain === terrain));
      who = list.length ? html`<div class="lv-pop-sub muted">${t("lv.pop.asOf", { cn: cnLabel(m), d: fmtDate(f.month) })}</div>
        ${list.map((d) => html`<div class="lv-pop-d${d.terrain === terrain ? " here" : ""}">
          <div class="lv-pop-dh"><span>${t(`terrain.${d.terrain}`)}</span><b>${d.cn != null ? fmt(d.cn) : html`<span class="muted">${t("rn.unranked")}</span>`}</b></div>
          ${d.cn != null ? html`<div>${t("lv.pop.rank", { r: ord(d.rank), n: fmt(d.n) })}${d.catRank ? html` · ${t("lv.pop.catRank", { r: ord(d.catRank), n: fmt(d.catN), cat: fmtCat(d.cat) })}` : ""}</div>` : ""}
          <div class="muted">${tn("lv.pop.races", d.pm.n)}${d.pm.n ? ` · ${t("lv.pop.pm", { p: pctN((100 * d.pm.pm) / d.pm.n) })}` : ""} · ${tn("lv.pop.pods", d.podiums)}${
            d.wins ? ` ${tn("lv.pop.wins", d.wins)}` : ""}</div></div>`)}`
        : html`<p class="muted lv-pop-none">${t("lv.pop.nothing")}</p>`;
    }
    // the radio controls passed, then the finish: split, time from the start, place there, time behind the first there
    const pts = (splits || []).map((s, i) => (s ? [ctl[i]?.[1] || ctl[i]?.[0] || i + 1, s[0], s[1], s[2]] : null)).filter(Boolean);
    if (k === "fin" && pts.length) pts.push([t("lv.ev.finish"), result, place, timeplus]);
    let prev = 0;
    const grid = pts.length ? html`<div class="lv-pop-st">${t("lv.pop.splits")}</div><div class="lv-pgrid"><span class="h">${t("lv.punch.ctl")}</span><span class="h">${t("lv.punch.leg")}</span><span class="h">${t("lv.punch.cum")}</span>
      <span class="h">${t("prov.place")}</span><span class="h">${t("lv.behind")}</span>
      ${pts.map(([c, tm, p, gap]) => { const leg = tm - prev; prev = tm; return html`<span>${c}</span><span>${hs(leg)}</span><span><b>${hs(tm)}</b></span>
        <span>${p ? t("lv.rank.n", { p }) : ""}</span><span>${gap ? `+${hs(gap)}` : p === 1 ? "+0:00" : ""}</span>`; })}</div>` : "";
    return html`<div class="lv-pop-h"><div><div class="lv-pop-n">${name}</div><div class="muted">${club}${x.me?.cat ? ` · ${fmtCat(x.me.cat)}` : ""}</div></div>
        <button type="button" class="lv-pop-x" data-pop-close aria-label="${t("lv.pop.close")}" title="${t("lv.pop.close")}">✕</button></div>
      ${who}${grid}
      <div class="lv-pop-f">
        <button type="button" class="btn btn-sm btn-primary" data-pop-close>${t("lv.pop.close")}</button></div>`;
  }
  async function popDraw() {
    const dlg = $("#lv-pop");
    if (!st.pop || !dlg?.open) return;
    const want = st.pop, x = (await enrich(want.cls))?.find((y) => y.key === want.key);
    if (!x) return;
    const out = await popHtml(x);
    if (dlg.open && st.pop === want) dlg.querySelector(".lv-pop-in").innerHTML = out;
  }
  function openPop(cls, key) {
    let dlg = $("#lv-pop");
    if (!dlg) {
      dlg = document.createElement("dialog");
      dlg.id = "lv-pop"; dlg.className = "lv-pop";
      dlg.innerHTML = `<div class="lv-pop-in"></div>`;
      dlg.addEventListener("close", () => { st.pop = null; });
      // a tap beside the window (on the backdrop, the dialog itself) closes it
      dlg.addEventListener("click", (e) => { if (e.target === dlg || e.target.closest("[data-pop-close]")) dlg.close(); });
      main.append(dlg);
    }
    st.pop = { cls, key };
    dlg.querySelector(".lv-pop-in").innerHTML = html`<div class="lv-pop-h"><div class="lv-pop-n">${key.split("|")[0]}</div>
      <button type="button" class="lv-pop-x" data-pop-close aria-label="${t("lv.pop.close")}" title="${t("lv.pop.close")}">✕</button></div>
      <p class="muted">${t("lv.loading")}</p>`;
    if (!dlg.open) dlg.showModal();
    popDraw();
  }

  main.addEventListener("click", (e) => {
    // a relay's team: its runners shown or hidden
    const pr = e.target.closest("tr[data-punch]");
    if (pr) {
      st.tapped = pr;
      const k = pr.dataset.punch, cls = k.slice(0, k.indexOf("|"));
      if (st.openLegs.delete(k)) { draw(); return; }
      st.openLegs.add(k); askPunch(cls, k.slice(cls.length + 1)); draw(); return;
    }
    const tb = e.target.closest("[data-team]");
    if (tb) {
      st.tapped = tb;
      const k = tb.dataset.team;
      if (tb.getAttribute("aria-expanded") === "true") { st.openTeams.delete(k); st.mark = null; } else st.openTeams.add(k);
      draw(); return;
    }
    if (e.target.closest("[data-lv-view]")) { show("pass", "all"); window.scrollTo({ top: 0 }); return; }
    const sv = e.target.closest("[data-lv-v]");
    if (sv) { const [view, v] = sv.dataset.lvV.split(":"); st.mark = null; show(view, v); return; }
    const fc = e.target.closest("[data-club]");
    if (fc) { closeFind(); $("#lv-find").value = ""; show("club", fc.dataset.club); return; }
    if (e.target.closest("#lv-pop")) return;
    const pp = e.target.closest("[data-pop]");
    if (pp) { openPop(st.cls, pp.dataset.pop); return; }
    const go = e.target.closest("[data-go]");
    if (go && !e.target.closest("a")) { closeFind(); $("#lv-find").value = ""; goRunner(go.dataset.go, go.dataset.name); return; }
    if (e.target.closest("a, select, input")) return;
    const b = e.target.closest("[data-c]"); if (b) { st.mark = null; show("cls", b.dataset.c); }
  });
  main.addEventListener("change", (e) => {
    const v = e.target.value;
    if (e.target.closest("#lv-picks")) e.target.blur();              // (its redraw waits while it has the focus)
    if (!v) return;
    if (e.target.id === "lv-sel") { st.mark = null; show("cls", v); }
    else if (e.target.id === "lv-club") show("club", v);
    else if (e.target.id === "lv-pf") show("pass", v);
    else if (e.target.id === "lv-buzz") {
      st.buzz = e.target.checked;
      try { localStorage.setItem("ocn.live.buzz", st.buzz ? "1" : "0"); } catch (x) { /* this visit only */ }
      // the sound needs a tap to start (browsers' rule): this one; a first ring says it works
      if (st.buzz) { try { st.ac ||= new (window.AudioContext || window.webkitAudioContext)(); } catch (x) { st.ac = null; } st.buzzSeen = null; ring(); }
      buzzBar(); soon();
    }
  });
  // the club list and the search need every course: the whole race is watched from then on
  main.addEventListener("focusin", (e) => {
    if (e.target.id === "lv-club" || e.target.id === "lv-find") { st.wantAll = true; subscribe(); }
    if (e.target.id === "lv-find") { st.finding = true; findList(); }
  });
  main.addEventListener("focusout", (e) => {
    if (e.target.closest?.("#lv-picks")) setTimeout(() => { if (st.picksLate && !$("#lv-picks").contains(document.activeElement)) { st.picksLate = false; pickers(); } }, 0);
  });
  main.addEventListener("pointerdown", (e) => { if (e.target.closest("#lv-club, #lv-find")) { st.wantAll = true; subscribe(); } });
  main.addEventListener("input", (e) => { if (e.target.id === "lv-find") { st.wantAll = true; subscribe(); st.finding = true; findList(); } });
  main.addEventListener("keydown", (e) => {
    // (a relay runner's line: Enter or Space opens their punches, as a click)
    if ((e.key === "Enter" || e.key === " ") && e.target.matches?.("tr[data-punch]")) { e.preventDefault(); e.target.click(); return; }
    if (e.target.id !== "lv-find") return;
    if (e.key === "Escape") { closeFind(); e.target.blur(); }
    else if (e.key === "Enter") { e.preventDefault(); $("#lv-find-list .lv-find-item")?.click(); }
  });
  const away = (e) => { if (!e.target.closest(".lv-find")) closeFind(); };
  document.addEventListener("pointerdown", away);
  let ticks = 0;
  const tick = setInterval(() => {
    if (!main.isConnected) { cleanup(); return; }
    status();
    heartbeat();
    if (++ticks % 30 === 0) soon();                   // the colours of the recent ones fade, the 15 minutes move on
    const now = nowAt(st.info);
    $$("[data-start]", main).forEach((el) => { const s = Number(el.dataset.start); el.textContent = now >= s ? hs(now - s) : ""; });
  }, 1000);
  const vis = () => { if (!document.hidden && (!st.ws || st.ws.readyState > 1)) connect(); buzzBar(); };
  document.addEventListener("visibilitychange", vis);
  function cleanup() {
    st.gone = true; clearInterval(tick); clearTimeout(later); wake(false); st.ac?.close?.();
    document.removeEventListener("visibilitychange", vis);
    document.removeEventListener("pointerdown", away);
    st.ws?.close();
  }
  connect();
  return { title: t("lv.title"), cleanup };
}
