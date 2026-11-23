// « Organisation › Horaires » (#/orga-horaires, owner 2026-10-18): an organiser publishes the start list of a coming
// competition of their club. The page lists the club's competitions of the agenda for the next ORG_DAYS days (all of them
// for an administrator) with what the site has of their start list; a race opens its deposit (?course=a<agenda id>):
// 1. a file — IOF XML StartList, CSV (our layout, OE's, MeOS'), HTML, a PDF of OE or MeOS — or a Google Sheets link (read
// as CSV through functions/api/sheet.js); 2. it is read in the browser (localstart.js, the server's reader ported) and shown,
// circuit by circuit, with what deserves a look; 3. consent, then functions/api/upload.js ({ kind: "startlist" }): the next
// collection run publishes it (ffco_scraper/prov/sources/upload.py) on the race's page and in the agenda, and it replaces
// the start lists the site would find elsewhere. A deposit replaces the previous one; « Retirer » takes it off.
// The draw is checked (2026-10-22, startchecks.js: a club's runners one after the other, a start minute shared, a category
// in several blocks on its circuit, what is missing, the interval and its gaps), and the list, read or deposited, gives the
// start's O Checklist file.

import { html, raw, $, $$, fmt, fmtDate, fmtCat, addDays } from "../util.js";
import { t, tn } from "../i18n.js";
import * as auth from "../auth.js";
import * as data from "../data.js";
import { getProv } from "./provisional.js";
import * as declare from "../declare.js";
import { betaTag, betaNote } from "../beta.js";
import { parse as readStarts } from "../localstart.js";
import { check as drawChecks, oChecklist, saveOChecklist } from "../startchecks.js";
import { sheetTabs } from "../sheettabs.js";

const ORG_DAYS = 90;                     // as far ahead as the collection publishes an organiser's start list
const MAX = 10 * 1024 * 1024;            // functions/api/upload.js STARTS_MAX
const EXT = /\.(xml|html?|pdf|csv|txt)$/i;
const orgCode = (org) => { const m = /^\s*(\d{3,4})\b/.exec(String(org || "")); return m ? m[1].padStart(4, "0") : null; };
const isRelay = (e) => /relais|relay/i.test(`${e.name || ""} ${e.epr || ""}`);
const MAX_ITEMS = 8;                     // a check's first items listed, the others folded
const hm = (s) => (s == null ? "" : `${Math.floor(s / 3600)}:${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}${s % 60 ? `:${String(s % 60).padStart(2, "0")}` : ""}`);
const norm = (s) => (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();

export async function render(main, { query = {} } = {}) {
  const me = auth.session(), club = auth.myClub();
  const today = new Date().toISOString().slice(0, 10);
  const [agenda, idx] = await Promise.all([data.agenda().catch(() => null), getProv("index.json").catch(() => null)]);
  const prov = new Map((idx?.races || []).map((r) => [r.key, r]));
  const races = (agenda?.events || [])
    .filter((e) => e.kind === "c" && e.id && !e.cancelled && e.date >= today && e.date <= addDays(today, ORG_DAYS) && !isRelay(e))
    .map((e) => ({ key: `a${e.id}`, e, p: prov.get(`a${e.id}`) }))
    .sort((a, b) => a.e.date.localeCompare(b.e.date) || a.e.name.localeCompare(b.e.name));
  // with the coming competitions the account declared (outside France; declare.js)
  const D = await declare.load();
  const mine = [...(me?.admin ? races : races.filter((x) => club && orgCode(x.e.org) === club)),
    ...D.competitions.filter((d) => d.date >= today).map((d) => ({ key: d.key, e: { name: d.name, date: d.date, place: d.place, org: d.club },
      p: prov.get(d.key) }))].sort((a, b) => a.e.date.localeCompare(b.e.date) || a.e.name.localeCompare(b.e.name));
  if (query.course) {
    const race = mine.find((x) => x.key === query.course);
    if (!race) {
      main.innerHTML = html`<div class="card"><div class="empty">${t("os.notMine")}</div></div>`;
      return { title: t("os.title") };
    }
    return deposit(main, race);
  }
  main.innerHTML = html`
    <div class="page-head"><div><h1>${t("os.title")} ${raw(betaTag())}</h1><p class="lede">${t("os.lede", { n: ORG_DAYS })}</p></div></div>
    ${raw(betaNote("starts"))}
    <div id="dc-card"></div>
    ${me?.admin ? html`<div class="filters"><label class="field"><span>${t("sh.org.filter")}</span><input id="os-filter" placeholder="${t("sh.org.filter.ph")}" style="width:240px"></label></div>` : ""}
    <section class="card"><div class="table-wrap" id="os-list"></div></section>
    <p class="muted" style="font-size:12.5px;margin:10px 2px 0">${t("os.hint")}</p>`;
  // the competitions whose entries are open on Ozimut, or were (api/entries/open: the coming ones; 2026-11-22, the booking's heir)
  const booked = new Map(((await fetch("api/entries/open", { credentials: "same-origin", cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).catch(() => null))?.forms || [])
    .filter((x) => x.key).map((x) => [x.key, x.state === "open" ? "open" : "closed"]));
  const status = (x) => {
    const bk = booked.get(x.key);
    const tag = bk ? html` <span class="tag ${bk === "open" ? "tag-in" : ""}">${t(bk === "open" ? "os.bk.open" : "os.bk.closed")}</span>` : "";
    if (!x.p?.startlist) return html`<span class="muted">${t("os.st.none")}</span>${tag}`;
    const src = x.p.sources || [];
    return src.includes("upload") ? html`<span class="tag">${t("os.st.yours")}</span>${tag}`
      : html`${t("os.st.found")}${src.length ? html` <span class="muted">(${src.map((s) => (s === "site" ? t("src.site") : s === "direct" ? t("src.direct") : s)).join(", ")})</span>` : ""}${tag}`;
  };
  const draw = (q = "") => {
    const list = q ? mine.filter((x) => norm(`${x.e.name} ${x.e.org || ""} ${x.e.place || ""}`).includes(norm(q))) : mine;
    $("#os-list").innerHTML = list.length ? html`<table class="data compact"><thead><tr><th>${t("f.date")}</th><th>${t("prov.race")}</th>
        <th>${t("sh.org.col.org")}</th><th class="r">${t("os.col.reg")}</th><th>${t("os.col.now")}</th><th></th></tr></thead>
      <tbody>${list.map((x) => html`<tr><td class="num">${fmtDate(x.e.date, "short")}</td>
        <td class="os-race"><a href="#/orga-horaires?course=${encodeURIComponent(x.key)}">${x.e.name}</a>${x.e.place ? html` <span class="muted">· ${x.e.place}</span>` : ""}</td>
        <td class="muted os-org">${x.e.org || "—"}</td>
        <td class="r num">${x.e.reg?.count ? fmt(x.e.reg.count) : ""}</td>
        <td>${status(x)}</td>
        <td class="r" style="white-space:nowrap"><a class="btn btn-sm btn-primary" href="#/orga-horaires?course=${encodeURIComponent(x.key)}">${t("os.deposit")}</a>
          <a class="btn btn-sm" href="#/orga-horaires?course=${encodeURIComponent(x.key)}&resa=1" title="${t("os.bk.hint")}">${t(booked.has(x.key) ? "os.bk.manage" : "os.bk.btn")}</a></td></tr>`)}</tbody></table>`
      : html`<div class="empty">${club || me?.admin ? t("os.none", { club: club || "—", n: ORG_DAYS }) : !auth.sees("FR") ? t("sh.org.noCountry") : t("sh.org.noclub")}</div>`;
  };
  draw();
  $("#os-filter")?.addEventListener("input", (e) => draw(e.target.value));
  declare.card($("#dc-card"), { onChange: () => render(main, { query }) });
  return { title: t("os.title") };
}

// ---- one race: the file, the check, the publication ---------------------------------------------------------------
// `base` (« Orga › Gérer », 2026-11-11): drawn in an event's « Départs » tab — no head, the booking at base&resa=1
export async function deposit(main, race, { base = null } = {}) {
  const e = race.e;
  const resaHref = base ? `${base}&resa=1` : `#/orga-horaires?course=${encodeURIComponent(race.key)}&resa=1`;
  let file = null, read = null;
  main.innerHTML = html`
    <div class="page-head" ${raw(base ? "hidden" : "")}><div><h1>${e.name}</h1>
      <p class="lede meta"><span>${fmtDate(e.date)}</span>${e.place ? html`<span>${e.place}</span>` : ""}${e.org ? html`<span>${e.org}</span>` : ""}
        ${e.reg?.count ? html`<span>${tn("os.reg", e.reg.count, { n: fmt(e.reg.count) })}</span>` : ""}</p></div></div>
    <div id="os-current"></div>
    <section class="card os-bk" style="margin-bottom:16px"><div class="card-head"><div><h2>${t("os.bk.title")}</h2><div class="hint">${t("os.bk.hint")}</div></div>
      <a class="btn btn-sm btn-primary" href="${resaHref}">${t("os.bk.go")}</a></div></section>
    <section class="card" style="margin-bottom:16px"><div class="card-head"><h2>${t("os.step1")}</h2></div>
      <div class="card-body upload-grid">
        <div class="upload-form">
          <label class="dropzone" id="os-drop" style="min-height:150px">
            <input type="file" id="os-file" accept=".xml,.csv,.txt,.html,.htm,.pdf" hidden>
            <strong id="os-file-name">${t("os.drop")}</strong><span class="muted">${t("os.drop.hint")}</span></label>
          <div class="filters" style="margin:12px 0 0;padding:0;border:0;background:none">
            <label class="field" style="flex:1;min-width:220px"><span>${t("os.sheet")}</span>
              <input type="url" id="os-sheet" placeholder="https://docs.google.com/spreadsheets/d/…" style="width:100%"></label>
            <button type="button" class="btn btn-sm" id="os-sheet-read" style="align-self:flex-end">${t("os.sheet.read")}</button>
          </div>
          <div id="os-err"></div>
        </div>
        <div class="upload-help prose">${help()}</div>
      </div></section>
    <section class="card" id="os-check" style="margin-bottom:16px" hidden><div class="card-head"><div><h2>${t("os.step2")}</h2>
      <div class="hint" id="os-check-hint"></div></div><label class="field" style="flex-direction:row;align-items:center;gap:8px">
      <span>${t("col.circuit")}</span><select id="os-circuit"></select></label></div>
      <div class="card-body"><div class="tiles tiles-compact" id="os-tiles" style="margin-bottom:12px"></div><div id="os-warn"></div></div>
      <div class="table-wrap" id="os-table" style="max-height:420px"></div></section>
    <section class="card" id="os-oc" style="margin-bottom:16px" hidden><div class="card-head"><div><h2>${t("os.oc.title")}</h2>
      <div class="hint">${t("os.oc.hint")}</div></div></div><div class="card-body" id="os-oc-body"></div></section>
    <section class="card" id="os-send" hidden><div class="card-head"><h2>${t("os.step3")}</h2></div><div class="card-body">
      <label class="check"><input type="checkbox" id="os-consent"> ${t("os.consent")}</label>
      <div class="row" style="margin-top:10px;gap:10px;align-items:center"><button type="button" class="btn btn-primary" id="os-publish" disabled>${t("os.publish")}</button>
        <progress id="os-bar" max="100" value="0" hidden style="width:160px"></progress></div>
      <div id="os-msg" style="margin-top:10px"></div>
      <p class="muted" style="font-size:12px;margin:8px 0 0">${t("os.privacy")}</p></div></section>`;

  // what is published now: the organisers' deposits, each removable
  async function current() {
    const box = $("#os-current");
    const r = await fetch(`api/upload?race=${encodeURIComponent(race.key)}&kind=startlist`, { credentials: "same-origin", cache: "no-store" }).catch(() => null);
    const ups = r?.ok ? (await r.json()).uploads || [] : [];
    const found = race.p?.startlist && !(race.p.sources || []).includes("upload");
    box.innerHTML = ups.length ? html`<div class="notice info" style="margin-bottom:16px">${t("os.now.yours", { date: fmtDate(ups[0].created.slice(0, 10)), file: ups[0].filename })}
        <span>${t("os.now.see")}</span>
        <button type="button" class="btn btn-sm" id="os-recheck" style="margin-left:8px">${t("os.now.check")}</button>
        <button type="button" class="btn btn-sm" id="os-remove" style="margin-left:4px">${t("os.remove")}</button>
        <div class="muted" style="font-size:12.5px;margin-top:4px">${t("os.now.replace")}</div></div>`
      : found ? html`<div class="notice info" style="margin-bottom:16px">${t("os.now.found")}
        <span>${t("os.now.see")}</span></div>` : "";
    // the deposited file read again: its checks and its O Checklist file (nothing to publish)
    $("#os-recheck")?.addEventListener("click", async (ev) => {
      ev.target.disabled = true;
      const x = await fetch(`api/upload?race=${encodeURIComponent(race.key)}&kind=startlist&id=${ups[0].id}`, { credentials: "same-origin", cache: "no-store" }).catch(() => null);
      ev.target.disabled = false;
      if (!x?.ok) return err(t("up.err.other"));
      await take(new File([await x.arrayBuffer()], ups[0].filename), ups[0].filename, true);
      $("#os-check").scrollIntoView({ behavior: "smooth", block: "start" });
    });
    $("#os-remove")?.addEventListener("click", async () => {
      if (!confirm(t("os.remove.confirm"))) return;
      const x = await fetch("api/upload", { method: "DELETE", credentials: "same-origin", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: ups[0].id }) }).catch(() => null);
      box.innerHTML = html`<div class="notice ${x?.ok ? "ok" : ""}" style="margin-bottom:16px">${x?.ok ? t("os.removed") : t("up.err.other")}</div>`;
    });
  }
  current();

  const err = (msg) => { $("#os-err").innerHTML = msg ? html`<div class="notice" style="margin-top:10px">${msg}</div>` : ""; };
  async function take(f, label, deposited = false) {
    err("");
    if (f.size > MAX) return err(t("os.err.big"));
    if (!EXT.test(f.name)) return err(t("os.err.type"));
    $("#os-file-name").textContent = label || f.name;
    let d = null;
    try { d = await readStarts(new Uint8Array(await f.arrayBuffer()), f.name); } catch (x) { d = null; }
    if (!d) {
      $("#os-check").hidden = true; $("#os-send").hidden = true; $("#os-oc").hidden = true;
      return err(/\.pdf$/i.test(f.name) ? t("os.err.pdf") : t("os.err.read"));
    }
    file = deposited ? null : f; read = d;
    check();
    $("#os-send").hidden = deposited;
  }
  $("#os-file").addEventListener("change", (ev) => ev.target.files[0] && take(ev.target.files[0]));
  const drop = $("#os-drop");
  drop.addEventListener("dragover", (ev) => { ev.preventDefault(); drop.classList.add("over"); });
  drop.addEventListener("dragleave", () => drop.classList.remove("over"));
  drop.addEventListener("drop", (ev) => { ev.preventDefault(); drop.classList.remove("over"); if (ev.dataTransfer.files[0]) take(ev.dataTransfer.files[0]); });
  $("#os-sheet-read").addEventListener("click", async () => {
    const url = $("#os-sheet").value.trim();
    if (!/^https:\/\/docs\.google\.com\/spreadsheets\/d\//.test(url)) return err(t("os.sheet.bad"));
    const b = $("#os-sheet-read");
    b.disabled = true;
    const got = await sheetTabs(url);
    b.disabled = false;
    if (got.error) return err(got.error === "not shared" ? t("os.sheet.private") : got.error === "too many" ? t("up.err.many") : got.error === "read" ? t("os.err.read") : t("os.sheet.fail"));
    take(new File([got.csv], `horaires-${race.key}.csv`, { type: "text/csv" }), t("os.sheet.name"));
  });

  // 2. the check: the list as read, and what deserves a look
  function check() {
    const d = read, all = d.classes.flatMap((k) => k.runners);
    const starts = all.map((r) => r.start_s).filter((s) => s != null).sort((a, b) => a - b);
    $("#os-check").hidden = false; $("#os-send").hidden = false;
    $("#os-check-hint").textContent = t(d.by === "category" ? "os.by.cat" : "os.by.circuit");
    $("#os-tiles").innerHTML = html`
      <div class="tile"><div class="tile-label">${t("os.t.runners")}</div><div class="tile-value">${fmt(all.length)}</div></div>
      <div class="tile"><div class="tile-label">${t(d.by === "category" ? "os.t.cats" : "os.t.circuits")}</div><div class="tile-value">${fmt(d.classes.length)}</div></div>
      <div class="tile"><div class="tile-label">${t("os.t.first")}</div><div class="tile-value">${hm(starts[0])}</div></div>
      <div class="tile"><div class="tile-label">${t("os.t.last")}</div><div class="tile-value">${hm(starts.at(-1))}</div></div>`;
    const warn = [];
    const seen = new Map();
    const C = drawChecks(d);
    for (const r of all) { const k = norm(r.name).split(" ").sort().join(" "); seen.set(k, [...(seen.get(k) || []), r.name]); }
    const twice = [...seen.values()].filter((v) => v.length > 1).map((v) => v[0]);
    if (twice.length) warn.push(t("os.w.twice", { list: twice.slice(0, 5).join(", ") + (twice.length > 5 ? "…" : "") }));
    if (d.date && d.date !== e.date) warn.push(t("os.w.date", { file: fmtDate(d.date), race: fmtDate(e.date) }));
    if (e.reg?.count && Math.abs(e.reg.count - all.length) > Math.max(3, 0.15 * e.reg.count)) warn.push(t("os.w.reg", { reg: fmt(e.reg.count), file: fmt(all.length) }));
    // the categories in several blocks folded: most races mix them on a circuit on purpose
    const lines = (list, pre = "os.w") => list.map((c) => (c.code === "blocks"
      ? html`<li><details><summary>${t(`${pre}.${c.code}`, { n: fmt(c.items.length) })}</summary>${raw(items(c))}</details></li>`
      : html`<li>${t(`${pre}.${c.code}`, { n: fmt(c.items.length) })}${raw(items(c))}</li>`)).join("");
    $("#os-warn").innerHTML = (warn.length || C.warn.length ? html`<div class="notice">${t("os.w.title")}<ul style="margin:6px 0 0;padding-left:18px">${warn.map((w) => html`<li>${w}</li>`)}${raw(lines(C.warn))}</ul></div>`
      : html`<div class="notice info">${t("os.w.none")}</div>`)
      + (C.info.length ? html`<div class="notice info" style="margin-top:8px"><div>${t("os.i.title")}<ul style="margin:6px 0 0;padding-left:18px">${raw(lines(C.info, "os.i"))}</ul></div></div>` : "");
    const cards = all.some((r) => r.card), bibs = all.some((r) => r.bib);
    $("#os-circuit").innerHTML = d.classes.map((k, i) => html`<option value="${i}">${k.name} (${fmt(k.runners.length)})</option>`).join("");
    const table = () => {
      const k = d.classes[Number($("#os-circuit").value) || 0];
      $("#os-table").innerHTML = html`<table class="data compact"><thead><tr><th class="r">${t("os.c.start")}</th><th>${t("rk.col.name")}</th>
        <th>${t("rk.col.club")}</th><th>${t("rk.col.cat")}</th>${bibs ? html`<th class="r">${t("os.c.bib")}</th>` : ""}${cards ? html`<th class="r">${t("os.c.card")}</th>` : ""}
        <th>${t("os.c.check")}</th></tr></thead>
        <tbody>${[...k.runners].sort((a, b) => (a.start_s ?? 1e9) - (b.start_s ?? 1e9)).map((r) => html`<tr><td class="r num">${hm(r.start_s)}</td>
          <td>${r.name}</td><td class="muted">${r.club ? data.clubName(r.club) : ""}</td><td>${fmtCat(r.category)}</td>
          ${bibs ? html`<td class="r num">${r.bib || ""}</td>` : ""}${cards ? html`<td class="r num">${r.card || ""}</td>` : ""}
          <td>${(C.flags.get(r) || []).map((f) => html`<span class="tag tag-warn">${t(`os.f.${f}`)}</span> `)}</td></tr>`)}</tbody></table>`;
    };
    $("#os-circuit").onchange = table;
    table();
    ocCard(d);
    $("#os-consent").checked = false;
    $("#os-publish").disabled = true;
    $("#os-msg").innerHTML = "";
  }
  // a check's items: the runners concerned, a class at a time for what is missing
  const who = (rs) => rs.map((r) => r.name).join(", ");
  const dur = (s) => (s % 60 ? (s >= 60 ? t("os.dur.minsec", { m: Math.floor(s / 60), s: s % 60 }) : t("os.dur.sec", { s })) : t("os.dur.min", { m: s / 60 }));
  const clubOf = (c) => (/^\d{4}$/.test(String(c || "")) ? data.clubName(c) : c || "");
  function items(c) {
    let rows;
    if (["nostart", "nocard", "noclass"].includes(c.code)) {
      const by = new Map();
      for (const x of c.items) by.set(x.cls, [...(by.get(x.cls) || []), ...x.runners]);
      rows = [...by].map(([cls, rs]) => t("os.it.one", { cls, names: who(rs) }));
    } else {
      rows = c.items.map((x) => ({
        club: () => t("os.it.at", { cls: x.cls, time: hm(x.s), names: `${who(x.runners)} (${clubOf(x.club)})` }),
        minute: () => t("os.it.at", { cls: x.cls, time: hm(x.s), names: who(x.runners) }),
        blocks: () => t("os.it.one", { cls: x.cls, names: x.cats.map((c) => t("os.it.blocks", { cat: fmtCat(c.cat), n: c.n })).join(", ") }),
        uneven: () => t("os.it.uneven", { cls: x.cls, step: dur(x.step), n: x.n }),
        gaps: () => t("os.it.gaps", { cls: x.cls, step: dur(x.step), list: x.holes.slice(0, 6).map((h) => t("os.it.gap", { time: hm(h.s), gap: dur(h.gap) })).join(", ")
          + (x.holes.length > 6 ? "…" : "") }),
      })[c.code]());
    }
    const li = (xs) => xs.map((x) => html`<li>${x}</li>`).join("");
    return html`<ul class="muted" style="margin:2px 0 4px;padding-left:16px;font-size:12.5px">${raw(li(rows.slice(0, MAX_ITEMS)))}</ul>
      ${rows.length > MAX_ITEMS ? html`<details style="font-size:12.5px"><summary>${t("os.more", { n: fmt(rows.length - MAX_ITEMS) })}</summary>
        <ul class="muted" style="margin:2px 0 4px;padding-left:16px">${raw(li(rows.slice(MAX_ITEMS)))}</ul></details>` : ""}`;
  }

  // the start's O Checklist file: each runner's class (their category, or the list's), a start's name per class if wished
  function ocCard(d) {
    const cats = d.by !== "category" && d.classes.some((k) => k.runners.some((r) => r.category));
    $("#os-oc").hidden = false;
    $("#os-oc-body").innerHTML = html`
      ${cats ? html`<label class="field" style="margin-bottom:10px;max-width:320px"><span>${t("os.oc.class")}</span><select id="os-oc-class">
        <option value="category">${t("os.oc.class.cat")}</option><option value="list">${t("os.oc.class.circuit")}</option></select></label>` : ""}
      <details style="margin-bottom:12px"><summary>${t("os.oc.starts")}</summary>
        <p class="muted" style="font-size:12.5px;margin:6px 0">${t("os.oc.starts.hint")}</p>
        <div class="table-wrap" style="max-height:260px"><table class="data compact"><thead><tr><th>${t(d.by === "category" ? "rk.col.cat" : "col.circuit")}</th>
          <th>${t("os.oc.startName")}</th></tr></thead><tbody>${d.classes.map((k, i) => html`<tr><td>${k.name}</td>
          <td><input data-oc="${i}" placeholder="${t("os.oc.startName.ph")}" style="width:160px"></td></tr>`)}</tbody></table></div></details>
      <button type="button" class="btn btn-sm btn-primary" id="os-oc-dl">${t("os.oc.dl")}</button>
      <p class="muted" style="font-size:12px;margin:8px 0 0">${t(d.classes.some((k) => k.runners.some((r) => r.card)) ? "os.oc.note" : "os.oc.note.nocard")}</p>`;
    $("#os-oc-dl").addEventListener("click", () => {
      const starts = {};
      $$("[data-oc]").forEach((x) => { if (x.value.trim()) starts[d.classes[Number(x.dataset.oc)].name] = x.value.trim(); });
      saveOChecklist(e.name, oChecklist(d, { cls: $("#os-oc-class")?.value || "category", starts, club: (r) => clubOf(r.club) }));
    });
  }
  $("#os-consent").addEventListener("change", (ev) => { $("#os-publish").disabled = !ev.target.checked || !file; });

  // 3. the publication: the file as it is (a sheet: its CSV), to functions/api/upload.js
  $("#os-publish").addEventListener("click", () => {
    if (!file || !$("#os-consent").checked) return;
    const body = { race: race.key, filename: file.name, consent: true, kind: "startlist" };
    const bar = $("#os-bar"), msg = $("#os-msg"), btn = $("#os-publish");
    btn.disabled = true; bar.hidden = false; bar.value = 0; msg.innerHTML = "";
    const x = new XMLHttpRequest();
    x.open("POST", "/api/upload");
    x.setRequestHeader("X-Upload", encodeURIComponent(JSON.stringify(body)));
    x.setRequestHeader("Content-Type", file.type || "application/octet-stream");
    x.upload.onprogress = (ev) => { if (ev.lengthComputable) bar.value = (100 * ev.loaded) / ev.total; };
    x.onload = () => {
      bar.hidden = true;
      let r = {};
      try { r = JSON.parse(x.responseText); } catch (ex) { /* not JSON */ }
      if (x.status === 200 && r.ok) {
        msg.innerHTML = html`<div class="notice ok">${r.soon ? t("os.done.soon") : t("os.done.later")}
          <span>${t("os.now.see")}</span></div>`;
        current();
        return;
      }
      btn.disabled = false;
      const m = { "too big": t("os.err.big"), type: t("os.err.type"), "too many": t("up.err.many"), "not organiser": t("os.notMine"),
        past: t("os.err.past") }[r.error] || (x.status === 401 ? t("up.err.login") : t("up.err.other"));
      msg.innerHTML = html`<div class="notice">${m}</div>`;
    };
    x.onerror = () => { bar.hidden = true; btn.disabled = false; msg.innerHTML = html`<div class="notice">${t("up.err.other")}</div>`; };
    x.send(file);
  });
  return { title: `${t("os.title")} · ${e.name}` };
}

// ---- the formats: what is read, with an example -------------------------------------------------------------------
function help() {
  return html`<h3>${t("os.help.title")}</h3>
    <p><strong>${t("os.help.best")}</strong> ${t("os.help.best.text")}</p>
    <p><strong>${t("os.help.csv")}</strong> ${t("os.help.csv.text")}</p>
    <pre class="os-example">${t("os.help.csv.example")}</pre>
    <p class="muted" style="font-size:12.5px">${t("os.help.csv.notes")}</p>
    <p><strong>${t("os.help.sheet")}</strong> ${t("os.help.sheet.text")}</p>
    <pre class="os-example">${t("os.help.sheet.example")}</pre>
    <p><strong>${t("os.help.else")}</strong> ${t("os.help.else.text")}</p>`;
}
