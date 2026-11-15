// « Palmarès » (« Relais » until 2026-11-05, owner; #/relais-nationaux, Stats' menu): France's national relays and, since
// 2026-11-05, its individual championships (CFMD, CFLD, CFS, CFN — champs.py builds fr/champs.json and fr/champs/*.json from the
// results database, 2011 on: tabs « Champions », « Éditions championnats », « Classements championnats »).
//
// The relays (2026-10-26): the history of France's
// two club relays — the Championnat de France des Clubs (CFC, since 1999; its first division, D1 then N1, and its youth relay,
// the Trophée Thierry Gueorgiou) and the Critérium National des Équipes (CNE, since 2006: men, women, youth, mini-relay) —
// every team of every edition found in the archives (relays.py builds fr/relays.json).
//
// Four tabs: « Palmarès » (the clubs ranked over a period by points from their place each year, or by medals), « Classements »
// (one edition's complete ranking), « Club » (a club's places year by year) and « Éditions » (venues, field sizes, winners).
// A club's place in an edition is that of its best team among the clubs' teams: open, mixed, military and foreign teams keep
// their place in the ranking but take no club place, and a club's second team none either (CFC's official podiums skip
// a club's lower team too). Points: the World Cup's old scale, 100 for the first down to 1 for the 30th.

import { html, raw, $, $$, fmt, ord, fmtDate, fmtCat } from "../util.js";
import { t, tn } from "../i18n.js";
import * as data from "../data.js";
import * as auth from "../auth.js";
import { lineChart, slotColor } from "../charts.js";
import { dataTable, pageTabs, tabFrom, bindPageTabs, seg, tile } from "../ui.js";
import { link, replaceQuery } from "../app.js";

const POINTS = [100, 80, 60, 50, 45, 40, 36, 32, 29, 26, 24, 22, 20, 18, 16, 15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1];
const pointsOf = (p) => (p && p <= POINTS.length ? POINTS[p - 1] : 0);
const MAIN = ["cfc1", "ttg", "cneH", "cneD", "cneJ", "cneM", "crs"];      // the categories of the palmarès
// the CFC, the CNE and, since 2026-11-05, the Championnat de France de Relais Sprint (one mixed relay, since 2017)
const COMP = { cfc: ["cfc1", "cfc2", "cfc3", "cfc4", "ttg"], cne: ["cneH", "cneD", "cneJ", "cneM"], crs: ["crs"] };
const COMPS = Object.keys(COMP);
const compOf = (cat) => (cat === "crs" ? "crs" : cat.startsWith("cne") ? "cne" : "cfc");
// the palmarès' choices: every category, CNE's four, or one
const GROUPS = { all: MAIN, cne: COMP.cne, ...Object.fromEntries(MAIN.map((c) => [c, [c]])) };
const PAGE = "#/relais-nationaux";
// the individual championships, and the categories' groups of their palmarès
// a championship's key is its discipline (f on foot, v VTT, s ski) and its format (champs.py), « fmd » … « ssp »
const DISCS = ["f", "v", "s"], FMTS = ["md", "ld", "sp", "nu"];
const CHAMPS = DISCS.flatMap((d) => FMTS.filter((m) => d === "f" || m !== "nu").map((m) => d + m));
const ageOf = (cat) => Number(/\d+/.exec(cat || "")?.[0] || 0);
const CGROUPS = { all: () => true, elite: (c) => ageOf(c) === 21, young: (c) => ageOf(c) <= 20, vet: (c) => ageOf(c) >= 35 };

/** "4:45:39" or "45:39" → seconds; null when not a time. */
function secs(s) {
  const m = /^(?:(\d+):)?(\d{1,3}):(\d{2})$/.exec(s || "");
  return m ? (Number(m[1] || 0) * 60 + Number(m[2])) * 60 + Number(m[3]) : null;
}
const clock = (s) => {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60;
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(x).padStart(2, "0")}` : `${m}:${String(x).padStart(2, "0")}`;
};

/** Every edition's club places: cat → year → { rows (with cplace), clubs: Map(club → {place, cplace, team}) }. */
function index(file) {
  const out = {};
  for (const [cat, years] of Object.entries(file.rows)) {
    out[cat] = {};
    for (const [y, rows] of Object.entries(years)) {
      const clubs = new Map();
      const list = rows.map(([place, team, club, time, st]) => {
        const r = { place, team, club, time, st, cplace: null };
        if (place && club && !clubs.has(club)) {
          r.cplace = clubs.size + 1;
          clubs.set(club, r);
        }
        return r;
      });
      out[cat][y] = { rows: list, clubs };
    }
  }
  return out;
}

export async function render(main, { query }) {
  main.innerHTML = html`<div class="loading">${t("misc.loading")}</div>`;
  const [rel, champs0] = await Promise.all([data.relays().catch(() => null), data.champs().catch(() => null)]);
  // a file of the first version (foot only, keyed cfmd…; a browser keeps a data file 5 minutes) is not read
  const champs = champs0?.v >= 2 ? champs0 : null;
  if (!rel?.rows && !champs?.editions) {
    main.innerHTML = html`<div class="notice">${t("rh.none")}</div>`;
    return;
  }
  const file = rel?.rows ? rel : { rows: {}, clubs: {}, editions: { cfc: {}, cne: {} } };
  const ix = index(file);
  const short = (c) => file.clubs[c]?.[0] || c;
  const full = (c) => file.clubs[c]?.[1] || "";
  const years = [...new Set(Object.entries(file.rows).filter(([c]) => !c.startsWith("rc")).flatMap(([, ys]) => Object.keys(ys)))].map(Number).sort((a, b) => a - b);
  const allYears = [];
  for (let y = years[0]; y <= years[years.length - 1]; y++) allYears.push(y);
  const myClub = auth.myClub();
  const catLabel = (cat) => t(`rh.cat.${cat}`);
  const divName = (cat, y) => file.editions.cfc[y]?.div?.[cat];
  const clubLink = (c) => (c ? html`<a href="${PAGE}?onglet=club&club=${c}" data-club="${c}" title="${full(c)}">${short(c)}</a>` : "");
  const legend = (series) => html`<div class="rh-legend">${series.map((s) =>
    html`<span><i style="background:${s.color}"></i>${s.name}</span>`)}</div>`;
  const medal = (p) => (p && p <= 3 ? html`<span class="rh-med rh-med-${p}" aria-hidden="true"></span>` : "");

  const hasRc = Object.keys(file.rows).some((c) => c.startsWith("rc"));
  const TABS = [...(rel?.rows ? [["palmares", t("rh.tab.palmares")], ["annee", t("rh.tab.year")], ["editions", t("rh.tab.editions")], ["club", t("rh.tab.club")]] : []),
    ...(hasRc ? [["rcat", t("rh.tab.rcat")]] : []),
    ...(champs?.editions ? [["champ", t("rh.tab.champ")], ["ceds", t("rh.tab.ceds")], ["crank", t("rh.tab.crank")]] : [])];
  const tab0 = tabFrom(TABS, query);
  const f = {
    group: GROUPS[query.cat] ? query.cat : "cfc1",
    from: years.includes(Number(query.de)) ? Number(query.de) : years[0],
    to: years.includes(Number(query.a)) ? Number(query.a) : years[years.length - 1],
    scale: query.bareme === "med" ? "med" : "pts",
    comp: COMPS.includes(query.comp) ? query.comp : "cfc",
    year: Number(query.annee) || null,
    cat: query.rcat || null,
    club: file.clubs[query.club] ? query.club : null,
    ecomp: COMPS.includes(query.ecomp) ? query.ecomp : "cfc",
    // the individual championships' tabs
    cd: DISCS.includes(query.cd) ? query.cd : "all", cf: FMTS.includes(query.cf) ? query.cf : "all", cg: CGROUPS[query.cg] ? query.cg : "all", cs: ["H", "D"].includes(query.cs) ? query.cs : "",
    cw: query.cw === "clubs" ? "clubs" : "runners", cde: Number(query.cde) || null, ca: Number(query.ca) || null,
    cc: CHAMPS.includes(query.cc) ? query.cc : "fmd", rc: CHAMPS.includes(query.rc) ? query.rc : "fmd", ry: Number(query.ry) || null, rk: query.rk || null,
    // the relay championship by category's tab
    qv: ["rank", "eds"].includes(query.qv) ? query.qv : "palm", qg: query.qg || "all", qs: ["H", "D"].includes(query.qs) ? query.qs : "",
    qde: Number(query.qde) || null, qa: Number(query.qa) || null, qb: query.qb === "med" ? "med" : "pts", qy: Number(query.qy) || null, qk: query.qk || null,
  };
  const sync = () => replaceQuery({
    cat: f.group === "cfc1" ? null : f.group, de: f.from === years[0] ? null : f.from, a: f.to === years[years.length - 1] ? null : f.to,
    bareme: f.scale === "pts" ? null : f.scale, comp: f.comp === "cfc" ? null : f.comp, annee: f.year, rcat: f.cat,
    club: f.club, ecomp: f.ecomp === "cfc" ? null : f.ecomp,
    cd: f.cd === "all" ? null : f.cd, cf: f.cf === "all" ? null : f.cf, cg: f.cg === "all" ? null : f.cg, cs: f.cs || null, cw: f.cw === "runners" ? null : f.cw,
    cde: f.cde && f.cde !== chYears[0] ? f.cde : null, ca: f.ca && f.ca !== chYears[chYears.length - 1] ? f.ca : null, cc: f.cc === "fmd" ? null : f.cc, rc: f.rc === "fmd" ? null : f.rc, ry: f.ry, rk: f.rk,
    qv: f.qv === "palm" ? null : f.qv, qg: f.qg === "all" ? null : f.qg, qs: f.qs || null, qb: f.qb === "pts" ? null : f.qb,
    qde: f.qde && f.qde !== rcYears[0] ? f.qde : null, qa: f.qa && f.qa !== rcYears[rcYears.length - 1] ? f.qa : null,
    qy: f.qv === "rank" ? f.qy : null, qk: f.qv === "rank" ? f.qk : null,
  });

  main.innerHTML = html`
    <div class="page-head"><div><h1>${t("rh.title")}</h1><p class="lede">${t("rh.lede")}</p></div></div>
    ${pageTabs(TABS, tab0)}
    <div data-panel="palmares"></div>
    <div data-panel="annee"></div>
    <div data-panel="club"></div>
    <div data-panel="editions"></div>
    <div data-panel="rcat"></div>
    <div data-panel="champ"></div>
    <div data-panel="ceds"></div>
    <div data-panel="crank"></div>
    <p class="hint rh-sources">${rel?.rows ? t("rh.sources") : ""} ${champs?.editions ? t("ch.sources") : ""}</p>`;
  const draw = {};
  let show = null;

  // ---- Palmarès ------------------------------------------------------------------------------------------------------
  /** The clubs over the period for the categories chosen: [{club, pts, byCat, gold, silver, bronze, top10, starts, best}]. */
  function standings(cats, from, to) {
    const by = new Map();
    const get = (c) => {
      if (!by.has(c)) by.set(c, { club: c, pts: 0, byCat: {}, gold: 0, silver: 0, bronze: 0, top10: 0, starts: 0, best: null, seasons: new Set() });
      return by.get(c);
    };
    for (const cat of cats) {
      for (const [y, ed] of Object.entries(ix[cat] || {})) {
        if (Number(y) < from || Number(y) > to) continue;
        for (const [c, r] of ed.clubs) {
          const s = get(c), p = r.cplace, pts = pointsOf(p);
          s.pts += pts;
          s.byCat[cat] = (s.byCat[cat] || 0) + pts;
          if (p === 1) s.gold++; else if (p === 2) s.silver++; else if (p === 3) s.bronze++;
          if (p <= 10) s.top10++;
          s.starts++;
          s.seasons.add(y);
          s.best = s.best == null ? p : Math.min(s.best, p);
        }
      }
    }
    return [...by.values()];
  }
  /** The longest run of consecutive titles over the period (cancelled years do not break it). */
  function streaks(cats, from, to) {
    let best = null;
    for (const cat of cats) {
      const eds = Object.keys(ix[cat] || {}).map(Number).filter((y) => y >= from && y <= to).sort((a, b) => a - b);
      let cur = null;
      for (const y of eds) {
        const w = [...ix[cat][y].clubs.entries()].find(([, r]) => r.cplace === 1)?.[0];
        cur = w && cur?.club === w ? { ...cur, n: cur.n + 1, to: y } : w ? { club: w, n: 1, from: y, to: y, cat } : null;
        if (cur && (!best || cur.n > best.n)) best = cur;
      }
    }
    return best;
  }

  draw.palmares = () => {
    const el = $('[data-panel="palmares"]', main);
    const cats = GROUPS[f.group];
    const rows = standings(cats, f.from, f.to);
    const medalSort = (r) => r.gold * 1e6 + r.silver * 1e3 + r.bronze + r.pts / 1e6;
    rows.sort((a, b) => (f.scale === "med" ? medalSort(b) - medalSort(a) : b.pts - a.pts));
    rows.forEach((r, i) => { r.rank = i + 1; });
    const champs = rows.filter((r) => r.gold).sort((a, b) => b.gold - a.gold);
    const st = streaks(cats, f.from, f.to);
    const nEds = cats.reduce((n, c) => n + Object.keys(ix[c] || {}).filter((y) => y >= f.from && y <= f.to).length, 0);
    const yearOpts = (v) => years.map((y) => html`<option value="${y}" ${raw(y === v ? "selected" : "")}>${y}</option>`);
    el.innerHTML = html`
      <div class="filters">
        <label class="field"><span>${t("rh.f.cat")}</span><select id="rh-group">
          ${Object.keys(GROUPS).map((g) => html`<option value="${g}" ${raw(g === f.group ? "selected" : "")}>${t(`rh.group.${g}`)}</option>`)}</select></label>
        <label class="field"><span>${t("rh.f.from")}</span><select id="rh-from">${yearOpts(f.from)}</select></label>
        <label class="field"><span>${t("rh.f.to")}</span><select id="rh-to">${yearOpts(f.to)}</select></label>
        <div class="field"><span>${t("rh.f.scale")}</span>${seg("rhs", [["pts", t("rh.scale.pts")], ["med", t("rh.scale.med")]], f.scale)}</div>
      </div>
      <div class="tiles" style="margin-bottom:16px">
        ${tile(t("rh.tile.editions"), fmt(nEds))}
        ${tile(t("rh.tile.champions"), fmt(champs.length))}
        ${champs[0] ? tile(t("rh.tile.most"), short(champs[0].club), tn("rh.titles", champs[0].gold)) : ""}
        ${st && st.n > 1 ? tile(t("rh.tile.streak"), short(st.club), tn("rh.streak", st.n, { a: st.from, b: st.to, cat: catLabel(st.cat) })) : ""}
      </div>
      <section class="card" style="margin-bottom:16px">
        <div class="card-head"><div><h2>${t("rh.palm.title", { cat: t(`rh.group.${f.group}`), a: f.from, b: f.to })}</h2>
          <div class="hint">${f.scale === "med" ? t("rh.palm.hint.med") : t("rh.palm.hint.pts")}</div></div></div>
        <div id="rh-palm"></div>
      </section>
      <section class="card">
        <div class="card-head"><div><h2>${t("rh.chart.title")}</h2><div class="hint">${t("rh.chart.hint")}</div></div></div>
        <div class="card-body"><div id="rh-chart" style="height:340px"></div></div>
      </section>`;
    $("#rh-group", el).addEventListener("change", (e) => { f.group = e.target.value; sync(); draw.palmares(); });
    $("#rh-from", el).addEventListener("change", (e) => { f.from = Math.min(Number(e.target.value), f.to); sync(); draw.palmares(); });
    $("#rh-to", el).addEventListener("change", (e) => { f.to = Math.max(Number(e.target.value), f.from); sync(); draw.palmares(); });
    $$('[data-seg="rhs"]', el).forEach((b) => b.addEventListener("click", () => { f.scale = b.dataset.value; sync(); draw.palmares(); }));
    const num = (v) => (v ? fmt(v) : html`<span class="dim">·</span>`);
    dataTable($("#rh-palm", el), {
      rows, sortKey: "rank", sortDir: 1,
      rowClass: (r) => (myClub && r.club === myClub ? "me" : ""),
      columns: [
        { key: "rank", label: t("rh.col.rank"), cls: "rank num", sort: (r) => r.rank, defaultDir: 1 },
        { key: "club", label: t("rh.col.club"), sort: (r) => short(r.club).toLowerCase(), defaultDir: 1, render: (r) => clubLink(r.club) },
        { key: "pts", label: t("rh.col.pts"), align: "r", cls: "num", sort: (r) => r.pts, render: (r) => html`<b>${fmt(r.pts)}</b>` },
        ...(cats.length > 1 ? cats.map((c) => ({ key: `p_${c}`, label: html`<span title="${catLabel(c)}">${t(`rh.short.${c}`)}</span>`,
          align: "r", cls: "num dim", sort: (r) => r.byCat[c] || 0, render: (r) => num(r.byCat[c]) })) : []),
        { key: "gold", label: html`${medal(1)}<span class="sr-only">${t("rh.col.gold")}</span>`, align: "r", cls: "num", sort: (r) => r.gold, render: (r) => num(r.gold) },
        { key: "silver", label: html`${medal(2)}<span class="sr-only">${t("rh.col.silver")}</span>`, align: "r", cls: "num", sort: (r) => r.silver, render: (r) => num(r.silver) },
        { key: "bronze", label: html`${medal(3)}<span class="sr-only">${t("rh.col.bronze")}</span>`, align: "r", cls: "num", sort: (r) => r.bronze, render: (r) => num(r.bronze) },
        { key: "top10", label: t("rh.col.top10"), align: "r", cls: "num", sort: (r) => r.top10, render: (r) => num(r.top10) },
        { key: "starts", label: html`<span title="${t("rh.col.starts.tip")}">${t("rh.col.starts")}</span>`, align: "r", cls: "num", sort: (r) => r.starts },
        { key: "best", label: t("rh.col.best"), align: "r", cls: "num", sort: (r) => -r.best, render: (r) => html`${medal(r.best)}${ord(r.best)}` },
      ],
    });
    // the leaders' points, accumulated year by year
    const top = rows.slice(0, 8);
    const span = allYears.filter((y) => y >= f.from && y <= f.to);
    const series = top.map((r, i) => {
      let sum = 0;
      return { name: short(r.club), color: slotColor(i), data: span.map((y) => {
        for (const c of cats) sum += pointsOf(ix[c]?.[y]?.clubs.get(r.club)?.cplace);
        return sum;
      }) };
    });
    $("#rh-chart", el).insertAdjacentHTML("beforebegin", legend(series));
    lineChart($("#rh-chart", el), { categories: span.map(String), series, yName: t("rh.col.pts") });
  };

  // ---- Classements ---------------------------------------------------------------------------------------------------
  draw.annee = () => {
    const el = $('[data-panel="annee"]', main);
    const yrs = [...new Set(COMP[f.comp].flatMap((c) => Object.keys(file.rows[c] || {})))].map(Number).sort((a, b) => b - a);
    if (!yrs.includes(f.year)) f.year = yrs[0];
    const cats = COMP[f.comp].filter((c) => file.rows[c]?.[f.year]);
    if (!cats.includes(f.cat)) f.cat = cats[0];
    sync();
    const ed = ix[f.cat][f.year];
    const info = file.editions[f.comp][f.year] || {};
    const label = (c) => (f.comp === "cfc" && c !== "ttg" ? divName(c, f.year) || catLabel(c) : catLabel(c));
    const win = secs(ed.rows.find((r) => r.place === 1)?.time);
    el.innerHTML = html`
      <div class="filters">
        <div class="field"><span>${t("rh.f.comp")}</span>${seg("rhc", COMPS.map((c) => [c, t(`rh.compShort.${c}`)]), f.comp)}</div>
        <label class="field"><span>${t("rh.f.year")}</span><select id="rh-year">
          ${yrs.map((y) => html`<option value="${y}" ${raw(y === f.year ? "selected" : "")}>${y}</option>`)}</select></label>
        <div class="field"><span>${t("rh.f.cat")}</span>${seg("rhk", cats.map((c) => [c, label(c)]), f.cat)}</div>
      </div>
      <section class="card">
        <div class="card-head"><div><h2>${t(`rh.comp.${f.comp}`)} ${f.year} · ${label(f.cat)}</h2>
          <div class="hint">${info.at ? t("rh.at", { at: info.at, dep: info.dep }) : ""} · ${tn("rh.teams", ed.rows.length)}
            ${info.st && info.st !== "full" ? html` · <b>${t(`rh.st.${info.st}`)}</b>` : ""}
            ${/^cfc[234]$/.test(f.cat) ? html`<br>${t("rh.lowerDiv")}` : ""}</div></div></div>
        <div id="rh-year-list"></div>
      </section>`;
    $$('[data-seg="rhc"]', el).forEach((b) => b.addEventListener("click", () => { f.comp = b.dataset.value; f.cat = null; draw.annee(); }));
    $$('[data-seg="rhk"]', el).forEach((b) => b.addEventListener("click", () => { f.cat = b.dataset.value; draw.annee(); }));
    $("#rh-year", el).addEventListener("change", (e) => { f.year = Number(e.target.value); draw.annee(); });
    const rows = ed.rows.map((r, i) => ({ ...r, i, gap: win && secs(r.time) != null && r.place ? secs(r.time) - win : null }));
    dataTable($("#rh-year-list", el), {
      rows, sortKey: "i", sortDir: 1,
      rowClass: (r) => (myClub && r.club === myClub ? "me" : ""),
      columns: [
        { key: "i", label: t("rh.col.place"), cls: "rank num", sort: (r) => r.i, defaultDir: 1,
          render: (r) => (r.place ? html`${medal(r.place)}${r.place}` : html`<span class="dim">${t(`rh.status.${r.st || "nc"}`)}</span>`) },
        { key: "team", label: t("rh.col.team"), sort: (r) => r.team.toLowerCase(), defaultDir: 1 },
        { key: "club", label: t("rh.col.club"), sort: (r) => short(r.club).toLowerCase(), defaultDir: 1,
          render: (r) => (r.club ? clubLink(r.club) : html`<span class="dim">${t("rh.noClub")}</span>`) },
        { key: "time", label: t("rh.col.time"), align: "r", cls: "num", sort: (r) => secs(r.time) ?? 1e9, defaultDir: 1, render: (r) => r.time || "" },
        { key: "gap", label: t("rh.col.gap"), align: "r", cls: "num dim", sort: (r) => r.gap ?? 1e9, defaultDir: 1,
          render: (r) => (r.gap ? `+${clock(r.gap)}` : "") },
        ...(MAIN.includes(f.cat) ? [
          { key: "cplace", label: html`<span title="${t("rh.col.cplace.tip")}">${t("rh.col.cplace")}</span>`, align: "r", cls: "num",
            sort: (r) => r.cplace ?? 1e9, defaultDir: 1, render: (r) => r.cplace || "" },
          { key: "pts", label: t("rh.col.pts"), align: "r", cls: "num", sort: (r) => pointsOf(r.cplace), render: (r) => (r.cplace && pointsOf(r.cplace) ? fmt(pointsOf(r.cplace)) : "") },
        ] : []),
      ],
    });
  };

  // ---- Club ----------------------------------------------------------------------------------------------------------
  draw.club = () => {
    const el = $('[data-panel="club"]', main);
    const all = standings(MAIN, years[0], years[years.length - 1]).sort((a, b) => b.pts - a.pts);
    if (!f.club) f.club = (myClub && all.some((r) => r.club === myClub) ? myClub : all[0]?.club) || null;
    sync();
    const me = all.find((r) => r.club === f.club);
    const opts = [...all].sort((a, b) => short(a.club).localeCompare(short(b.club)));
    const cats = MAIN.filter((c) => Object.values(ix[c] || {}).some((ed) => ed.clubs.has(f.club)));
    const span = allYears.filter((y) => cats.some((c) => ix[c]?.[y]?.clubs.has(f.club)));
    const span2 = span.length ? allYears.filter((y) => y >= span[0] && y <= span[span.length - 1]) : [];
    const inFfco = data.clubName(f.club) !== f.club;
    el.innerHTML = html`
      <div class="filters">
        <label class="field"><span>${t("rh.col.club")}</span><select id="rh-club">
          ${opts.map((r) => html`<option value="${r.club}" ${raw(r.club === f.club ? "selected" : "")}>${short(r.club)}</option>`)}</select></label>
        ${full(f.club) ? html`<span class="hint">${full(f.club)}</span>` : ""}
        ${inFfco ? html`<a class="btn" href="${link.club(f.club)}">${t("rh.clubPage")}</a>` : ""}
      </div>
      ${me ? html`
      <div class="tiles" style="margin-bottom:16px">
        ${tile(t("rh.tile.rank"), ord(all.indexOf(me) + 1), t("rh.clubRank", { n: fmt(all.length), pts: fmt(me.pts) }))}
        ${tile(t("rh.tile.titles"), fmt(me.gold))}
        ${tile(t("rh.tile.podiums"), fmt(me.gold + me.silver + me.bronze))}
        ${tile(t("rh.tile.top10"), fmt(me.top10))}
        ${tile(t("rh.tile.starts"), fmt(me.starts), tn("rh.tile.seasons", me.seasons.size))}
      </div>
      <section class="card" style="margin-bottom:16px">
        <div class="card-head"><div><h2>${t("rh.club.chart")}</h2><div class="hint">${t("rh.club.chart.hint")}</div></div></div>
        <div class="card-body"><div id="rh-club-chart" style="height:320px"></div></div>
      </section>
      <section class="card">
        <div class="card-head"><div><h2>${t("rh.club.table")}</h2><div class="hint">${t("rh.club.table.hint")}</div></div></div>
        <div id="rh-club-list"></div>
      </section>` : html`<div class="notice">${t("rh.none")}</div>`}`;
    $("#rh-club", el).addEventListener("change", (e) => { f.club = e.target.value; draw.club(); });
    if (!me) return;
    const series = cats.map((c) => ({ name: catLabel(c), color: slotColor(MAIN.indexOf(c)),
      data: span2.map((y) => ix[c]?.[y]?.clubs.get(f.club)?.cplace ?? null) }));
    $("#rh-club-chart", el).insertAdjacentHTML("beforebegin", legend(series));
    lineChart($("#rh-club-chart", el), {
      categories: span2.map(String), inverse: true, fmtY: (v) => (v >= 1 ? ord(v) : ""), series,
    });
    const rows = [...span].reverse().map((y) => ({ y, ...Object.fromEntries(cats.map((c) => [c, ix[c]?.[y]?.clubs.get(f.club) || null])) }));
    const cell = (r, c) => {
      const x = r[c];
      if (!x) return html`<span class="dim">·</span>`;
      return html`<a href="${PAGE}?onglet=annee&comp=${compOf(c)}&annee=${r.y}&rcat=${c}" data-year="${r.y}" data-cat="${c}"
        title="${x.team} · ${ord(x.place)}${x.time ? ` · ${x.time}` : ""}">${medal(x.cplace)}${ord(x.cplace)}</a>`;
    };
    dataTable($("#rh-club-list", el), {
      rows, sortKey: "y", sortDir: -1,
      columns: [
        { key: "y", label: t("rh.col.year"), cls: "num", sort: (r) => r.y },
        ...cats.map((c) => ({ key: c, label: catLabel(c), align: "r", cls: "num", sort: (r) => -(r[c]?.cplace ?? 1e9), render: (r) => cell(r, c) })),
      ],
    });
    $$("a[data-year]", el).forEach((a) => a.addEventListener("click", (e) => {
      e.preventDefault();
      f.comp = compOf(a.dataset.cat); f.year = Number(a.dataset.year); f.cat = a.dataset.cat;
      show("annee");
    }));
  };

  // ---- Éditions ------------------------------------------------------------------------------------------------------
  draw.editions = () => {
    const el = $('[data-panel="editions"]', main);
    sync();
    const comp = f.ecomp;
    const cats = comp === "cfc" ? ["cfc1", "ttg"] : COMP[comp];
    const eds = Object.entries(file.editions[comp]).map(([y, e]) => ({ y: Number(y), ...e })).sort((a, b) => b.y - a.y);
    const winner = (c, y) => {
      const w = [...(ix[c]?.[y]?.clubs.values() || [])].find((r) => r.cplace === 1);
      return w ? clubLink(w.club) : html`<span class="dim">—</span>`;
    };
    const count = (c, y) => ix[c]?.[y]?.rows.length || 0;
    el.innerHTML = html`
      <div class="filters">
        <div class="field"><span>${t("rh.f.comp")}</span>${seg("rhe", COMPS.map((c) => [c, t(`rh.compShort.${c}`)]), comp)}</div>
      </div>
      <section class="card">
        <div class="card-head"><div><h2>${t(`rh.comp.${comp}`)}</h2><div class="hint">${t(`rh.ed.hint.${comp}`)}</div></div></div>
        <div id="rh-eds"></div>
      </section>`;
    $$('[data-seg="rhe"]', el).forEach((b) => b.addEventListener("click", () => { f.ecomp = b.dataset.value; draw.editions(); }));
    const teams = (e) => (comp === "cfc"
      ? ["cfc1", "cfc2", "cfc3", "cfc4"].map((c) => count(c, e.y)).filter(Boolean).join(" · ")
      : COMP[comp].map((c) => count(c, e.y) || "–").join(" · "));
    dataTable($("#rh-eds", el), {
      rows: eds, sortKey: "y", sortDir: -1,
      columns: [
        { key: "y", label: t("rh.col.year"), cls: "num", sort: (r) => r.y },
        { key: "at", label: t("rh.col.at"), sort: (r) => r.at, render: (r) => (r.at ? `${r.at} (${r.dep})` : "") },
        { key: "st", label: t("rh.col.archive"), sort: (r) => r.st, render: (r) => (r.st === "full" ? t("rh.st.full")
          : html`<span class="${r.st === "cancelled" ? "dim" : ""}">${t(`rh.st.${r.st}`)}</span>`) },
        { key: "teams", label: html`<span title="${t(`rh.col.teams.tip.${comp}`)}">${t("rh.col.teams")}</span>`, align: "r", cls: "num dim",
          sort: (r) => count(cats[0], r.y), render: teams },
        ...cats.map((c) => ({ key: c, label: catLabel(c), sort: (r) => short([...(ix[c]?.[r.y]?.clubs.keys() || [])][0] || "~"),
          render: (r) => winner(c, r.y) })),
      ],
    });
  };


  // ---- Relais par catégorie ------------------------------------------------------------------------------------------
  // the Championnat de France de Relais par catégorie (owner, 2026-11-15): one relay a category, each team of one club. Its own
  // tab, three views: the clubs' palmarès over a period (points or medals; a category, a group of them, a sex), one edition's
  // ranking of a category, the editions.
  const RC = Object.keys(file.rows).filter((c) => c.startsWith("rc"));
  const rcCat = (c) => fmtCat(c.slice(2));
  const rcSex = (c) => c[2], rcAge = (c) => ageOf(c);
  RC.sort((a, b) => rcSex(b).localeCompare(rcSex(a)) || rcAge(a) - rcAge(b));
  const rcYears = [...new Set(RC.flatMap((c) => Object.keys(file.rows[c])))].map(Number).sort((a, b) => a - b);
  const RCG = { all: () => true, elite: (c) => rcAge(c) === 21, young: (c) => rcAge(c) <= 20, vet: (c) => rcAge(c) >= 35 };
  const rcIn = (g) => (RCG[g] ? RC.filter(RCG[g]) : RC.filter((c) => c === g));
  const clubSpan = (c) => html`<span title="${full(c)}">${short(c)}</span>`;
  draw.rcat = () => {
    const el = $('[data-panel="rcat"]', main);
    if (!rcYears.includes(f.qde)) f.qde = rcYears[0];
    if (!rcYears.includes(f.qa)) f.qa = rcYears[rcYears.length - 1];
    if (!RCG[f.qg] && !RC.includes(f.qg)) f.qg = "all";
    const yearOpts = (ys, v) => ys.map((y) => html`<option value="${y}" ${raw(y === v ? "selected" : "")}>${y}</option>`);
    const views = html`<div class="field"><span>${t("rhrc.f.view")}</span>${seg("rcv", [["palm", t("rhrc.v.palm")], ["rank", t("rhrc.v.rank")], ["eds", t("rhrc.v.eds")]], f.qv)}</div>`;
    const num = (v) => (v ? fmt(v) : html`<span class="dim">·</span>`);
    if (f.qv === "palm") {
      sync();
      const cats = rcIn(f.qg).filter((c) => !f.qs || rcSex(c) === f.qs);
      const rows = standings(cats, f.qde, f.qa);
      const medalSort = (r) => r.gold * 1e6 + r.silver * 1e3 + r.bronze + r.pts / 1e6;
      rows.sort((a, b) => (f.qb === "med" ? medalSort(b) - medalSort(a) : b.pts - a.pts));
      rows.forEach((r, i) => {
        r.rank = i + 1;
        r.won = cats.filter((c) => Object.entries(ix[c] || {}).some(([y, ed]) => Number(y) >= f.qde && Number(y) <= f.qa && ed.clubs.get(r.club)?.cplace === 1));
      });
      const champs = rows.filter((r) => r.gold).sort((a, b) => b.gold - a.gold);
      const nEds = rcYears.filter((y) => y >= f.qde && y <= f.qa && cats.some((c) => file.rows[c][y])).length;
      el.innerHTML = html`
        <div class="filters">${views}
          <label class="field"><span>${t("rh.f.cat")}</span><select id="rc-group">
            ${Object.keys(RCG).map((g) => html`<option value="${g}" ${raw(g === f.qg ? "selected" : "")}>${t(`ch.grp.${g}`)}</option>`)}
            <optgroup label="${t("rhrc.oneCat")}">${RC.map((c) => html`<option value="${c}" ${raw(c === f.qg ? "selected" : "")}>${rcCat(c)}</option>`)}</optgroup></select></label>
          <div class="field"><span>${t("ch.f.sex")}</span>${seg("rcs", [["", t("ch.sex.all")], ["H", t("ch.sex.H")], ["D", t("ch.sex.D")]], f.qs)}</div>
          <label class="field"><span>${t("rh.f.from")}</span><select id="rc-from">${yearOpts(rcYears, f.qde)}</select></label>
          <label class="field"><span>${t("rh.f.to")}</span><select id="rc-to">${yearOpts(rcYears, f.qa)}</select></label>
          <div class="field"><span>${t("rh.f.scale")}</span>${seg("rcb", [["pts", t("rh.scale.pts")], ["med", t("rh.scale.med")]], f.qb)}</div>
        </div>
        <div class="tiles" style="margin-bottom:16px">
          ${tile(t("rh.tile.editions"), fmt(nEds))}
          ${tile(t("rh.tile.champions"), fmt(champs.length))}
          ${champs[0] ? tile(t("rh.tile.most"), short(champs[0].club), tn("rh.titles", champs[0].gold)) : ""}
        </div>
        <section class="card">
          <div class="card-head"><div><h2>${t("rhrc.palm.title", { a: f.qde, b: f.qa })}</h2>
            <div class="hint">${f.qb === "med" ? t("rh.palm.hint.med") : t("rh.palm.hint.pts")} ${t("rhrc.palm.hint")}</div></div></div>
          <div id="rc-list"></div>
        </section>`;
      dataTable($("#rc-list", el), {
        rows, sortKey: "rank", sortDir: 1,
        rowClass: (r) => (myClub && r.club === myClub ? "me" : ""),
        columns: [
          { key: "rank", label: t("rh.col.rank"), cls: "rank num", sort: (r) => r.rank, defaultDir: 1 },
          { key: "club", label: t("rh.col.club"), sort: (r) => short(r.club).toLowerCase(), defaultDir: 1, render: (r) => clubSpan(r.club) },
          { key: "pts", label: t("rh.col.pts"), align: "r", cls: "num", sort: (r) => r.pts, render: (r) => html`<b>${fmt(r.pts)}</b>` },
          { key: "gold", label: html`${medal(1)}<span class="sr-only">${t("rh.col.gold")}</span>`, align: "r", cls: "num", sort: (r) => r.gold, render: (r) => num(r.gold) },
          { key: "silver", label: html`${medal(2)}<span class="sr-only">${t("rh.col.silver")}</span>`, align: "r", cls: "num", sort: (r) => r.silver, render: (r) => num(r.silver) },
          { key: "bronze", label: html`${medal(3)}<span class="sr-only">${t("rh.col.bronze")}</span>`, align: "r", cls: "num", sort: (r) => r.bronze, render: (r) => num(r.bronze) },
          { key: "top10", label: t("rh.col.top10"), align: "r", cls: "num", sort: (r) => r.top10, render: (r) => num(r.top10) },
          { key: "starts", label: html`<span title="${t("rh.col.starts.tip")}">${t("rh.col.starts")}</span>`, align: "r", cls: "num", sort: (r) => r.starts },
          { key: "best", label: t("rh.col.best"), align: "r", cls: "num", sort: (r) => -r.best, render: (r) => html`${medal(r.best)}${ord(r.best)}` },
          { key: "won", label: t("rhrc.col.titles"), sort: (r) => r.won.length, render: (r) => r.won.map(rcCat).join(", ") },
        ],
      });
      $("#rc-group", el).addEventListener("change", (e) => { f.qg = e.target.value; draw.rcat(); });
      $$('[data-seg="rcs"]', el).forEach((b) => b.addEventListener("click", () => { f.qs = b.dataset.value; draw.rcat(); }));
      $$('[data-seg="rcb"]', el).forEach((b) => b.addEventListener("click", () => { f.qb = b.dataset.value; draw.rcat(); }));
      $("#rc-from", el).addEventListener("change", (e) => { f.qde = Math.min(Number(e.target.value), f.qa); draw.rcat(); });
      $("#rc-to", el).addEventListener("change", (e) => { f.qa = Math.max(Number(e.target.value), f.qde); draw.rcat(); });
    } else if (f.qv === "rank") {
      const yrs = [...rcYears].reverse();
      if (!yrs.includes(f.qy)) f.qy = yrs[0];
      const cats = RC.filter((c) => file.rows[c][f.qy]);
      if (!cats.includes(f.qk)) f.qk = cats.includes("rcH21") ? "rcH21" : cats[0];
      sync();
      const ed = ix[f.qk][f.qy];
      const info = file.editions.rc?.[f.qy] || {};
      const win = secs(ed.rows.find((r) => r.place === 1)?.time);
      el.innerHTML = html`
        <div class="filters">${views}
          <label class="field"><span>${t("rh.f.year")}</span><select id="rc-year">${yearOpts(yrs, f.qy)}</select></label>
          <label class="field"><span>${t("rh.f.cat")}</span><select id="rc-cat">
            ${cats.map((c) => html`<option value="${c}" ${raw(c === f.qk ? "selected" : "")}>${rcCat(c)} (${ix[c][f.qy].rows.length})</option>`)}</select></label>
        </div>
        <section class="card">
          <div class="card-head"><div><h2>${t("rh.comp.rc")} ${f.qy} · ${rcCat(f.qk)}</h2>
            <div class="hint">${info.at ? html`${t("rh.at", { at: info.at, dep: info.dep })} · ` : ""}${tn("rh.teams", ed.rows.length)}
              ${info.st && info.st !== "full" ? html` · <b>${t(`rh.st.${info.st}`)}</b>` : ""}</div></div></div>
          <div id="rc-list"></div>
        </section>`;
      const rows = ed.rows.map((r, i) => ({ ...r, i, gap: win && secs(r.time) != null && r.place ? secs(r.time) - win : null }));
      dataTable($("#rc-list", el), {
        rows, sortKey: "i", sortDir: 1,
        rowClass: (r) => (myClub && r.club === myClub ? "me" : ""),
        columns: [
          { key: "i", label: t("rh.col.place"), cls: "rank num", sort: (r) => r.i, defaultDir: 1,
            render: (r) => (r.place ? html`${medal(r.place)}${r.place}` : html`<span class="dim">${t(`rh.status.${r.st || "nc"}`)}</span>`) },
          { key: "team", label: t("rh.col.team"), sort: (r) => r.team.toLowerCase(), defaultDir: 1 },
          { key: "club", label: t("rh.col.club"), sort: (r) => short(r.club).toLowerCase(), defaultDir: 1,
            render: (r) => (r.club ? clubSpan(r.club) : html`<span class="dim">${t("rh.noClub")}</span>`) },
          { key: "time", label: t("rh.col.time"), align: "r", cls: "num", sort: (r) => secs(r.time) ?? 1e9, defaultDir: 1, render: (r) => r.time || "" },
          { key: "gap", label: t("rh.col.gap"), align: "r", cls: "num dim", sort: (r) => r.gap ?? 1e9, defaultDir: 1, render: (r) => (r.gap ? `+${clock(r.gap)}` : "") },
          { key: "cplace", label: html`<span title="${t("rh.col.cplace.tip")}">${t("rh.col.cplace")}</span>`, align: "r", cls: "num",
            sort: (r) => r.cplace ?? 1e9, defaultDir: 1, render: (r) => r.cplace || "" },
          { key: "pts", label: t("rh.col.pts"), align: "r", cls: "num", sort: (r) => pointsOf(r.cplace),
            render: (r) => (r.cplace && pointsOf(r.cplace) ? fmt(pointsOf(r.cplace)) : "") },
        ],
      });
      $("#rc-year", el).addEventListener("change", (e) => { f.qy = Number(e.target.value); draw.rcat(); });
      $("#rc-cat", el).addEventListener("change", (e) => { f.qk = e.target.value; draw.rcat(); });
    } else {
      sync();
      const known = file.editions.rc || {};
      const eds = Object.entries(known).map(([y, e]) => ({ y: Number(y), ...e }))
        .concat(rcYears.filter((y) => !known[y]).map((y) => ({ y, st: "full" }))).sort((a, b) => b.y - a.y);
      const winner = (c, y) => {
        const w = [...(ix[c]?.[y]?.clubs.values() || [])].find((r) => r.cplace === 1);
        return w ? clubSpan(w.club) : html`<span class="dim">—</span>`;
      };
      const teams = (y) => RC.reduce((n, c) => n + (ix[c]?.[y]?.rows.length || 0), 0);
      const ncat = (y) => RC.filter((c) => ix[c]?.[y]).length;
      el.innerHTML = html`
        <div class="filters">${views}</div>
        <section class="card">
          <div class="card-head"><div><h2>${t("rh.comp.rc")}</h2><div class="hint">${t("rh.ed.hint.rc")}</div></div></div>
          <div id="rc-list"></div>
        </section>`;
      dataTable($("#rc-list", el), {
        rows: eds, sortKey: "y", sortDir: -1,
        columns: [
          { key: "y", label: t("rh.col.year"), cls: "num", sort: (r) => r.y,
            render: (r) => (ncat(r.y) ? html`<a href="#" data-rc-year="${r.y}">${r.y}</a>` : String(r.y)) },
          { key: "at", label: t("rh.col.at"), sort: (r) => r.at || "", render: (r) => (r.at ? `${r.at}${r.dep ? ` (${r.dep})` : ""}` : "") },
          { key: "st", label: t("rh.col.archive"), sort: (r) => r.st, render: (r) => (r.st === "full" ? t("rh.st.full")
            : html`<span class="${r.st === "cancelled" ? "dim" : ""}">${t(`rh.st.${r.st}`)}</span>`) },
          { key: "ncat", label: t("rhrc.col.cats"), align: "r", cls: "num", sort: (r) => ncat(r.y), render: (r) => (ncat(r.y) ? fmt(ncat(r.y)) : "") },
          { key: "teams", label: t("rh.col.teams"), align: "r", cls: "num dim", sort: (r) => teams(r.y), render: (r) => (teams(r.y) ? fmt(teams(r.y)) : "") },
          ...["rcH21", "rcD21"].filter((c) => RC.includes(c)).map((c) => ({ key: c, label: rcCat(c),
            sort: (r) => short([...(ix[c]?.[r.y]?.clubs.keys() || [])][0] || "~"), render: (r) => winner(c, r.y) })),
        ],
      });
      $$("a[data-rc-year]", el).forEach((a) => a.addEventListener("click", (e) => {
        e.preventDefault();
        f.qv = "rank"; f.qy = Number(a.dataset.rcYear); f.qk = null;
        draw.rcat();
      }));
    }
    $$('[data-seg="rcv"]', el).forEach((b) => b.addEventListener("click", () => { f.qv = b.dataset.value; draw.rcat(); }));
  };

  // ---- The individual championships ----------------------------------------------------------------------------------
  const chName = (c) => `${t(`ch.disc.${c[0]}`)} · ${t(`ch.fmt.${c.slice(1)}`)}`;
  const chEds = (c) => Object.entries(champs?.editions?.[c] || {}).map(([y, e]) => ({ y: Number(y), ...e }));
  const chYears = [...new Set(CHAMPS.flatMap((c) => chEds(c).map((e) => e.y)))].sort((a, b) => a - b);
  const who = (lic, name) => (lic ? html`<a href="${link.runner(lic)}">${name}</a>` : name);
  const clubOf = (code) => (code ? data.clubName(code) : "");
  const has = (c) => chEds(c).length > 0;
  // a discipline, then its formats that have editions; `all` adds « every » to both
  const discSeg = (id, v, all) => seg(id, [...(all ? [["all", t("ch.allDisc")]] : []), ...DISCS.filter((d) => FMTS.some((m) => has(d + m))).map((d) => [d, t(`ch.disc.${d}`)])], v);
  const fmtSeg = (id, d, v, all) => seg(id, [...(all ? [["all", t("ch.allFmt")]] : []),
    ...FMTS.filter((m) => (d === "all" ? DISCS.some((x) => has(x + m)) : has(d + m))).map((m) => [m, t(`ch.fmt.${m}`)])], v);
  const pickKey = (d, m) => (has(d + m) ? d + m : FMTS.map((x) => d + x).find(has) || d + m);
  const edFiles = new Map();
  const edition = (c, y) => {
    const k = `${c}-${y}`;
    if (!edFiles.has(k)) edFiles.set(k, data.champEdition(k).catch(() => null));
    return edFiles.get(k);
  };

  // « Champions »: the runners (or their clubs) by their titles and medals over the period
  draw.champ = () => {
    const el = $('[data-panel="champ"]', main);
    if (!f.cde || !chYears.includes(f.cde)) f.cde = chYears[0];
    if (!f.ca || !chYears.includes(f.ca)) f.ca = chYears[chYears.length - 1];
    sync();
    const chs = CHAMPS.filter((c) => (f.cd === "all" || c[0] === f.cd) && (f.cf === "all" || c.slice(1) === f.cf));
    const okCat = (c) => CGROUPS[f.cg](c) && (!f.cs || c.startsWith(f.cs));
    const by = new Map(), clubs = new Map();
    let nEds = 0;
    const add = (map, key, base, p, ch, cat, y) => {
      if (!map.has(key)) map.set(key, { ...base, gold: 0, silver: 0, bronze: 0, cats: new Set(), chs: new Set(), from: y, to: y });
      const r = map.get(key);
      if (p === 1) r.gold++; else if (p === 2) r.silver++; else r.bronze++;
      r.cats.add(cat); r.chs.add(ch); r.from = Math.min(r.from, y); r.to = Math.max(r.to, y);
      if (y >= (r.clubY || 0)) { r.club = base.club; r.clubY = y; }
    };
    for (const ch of chs) {
      for (const e of chEds(ch)) {
        if (e.y < f.cde || e.y > f.ca) continue;
        nEds++;
        for (const [cat, rows] of Object.entries(e.cats)) {
          if (!okCat(cat)) continue;
          for (const [p, lic, name, club] of rows) {
            add(by, lic ? `l${lic}` : `n${name}`, { lic, name, club }, p, ch, cat, e.y);
            if (club) add(clubs, club, { club }, p, ch, cat, e.y);
          }
        }
      }
    }
    const medals = (r) => r.gold * 1e6 + r.silver * 1e3 + r.bronze;
    const rows = [...(f.cw === "clubs" ? clubs : by).values()].sort((a, b) => medals(b) - medals(a));
    rows.forEach((r, i) => { r.rank = i + 1; r.total = r.gold + r.silver + r.bronze; });
    const champions = [...by.values()].filter((r) => r.gold);
    const top = [...champions].sort((a, b) => b.gold - a.gold)[0];
    const yearOpts = (v) => chYears.map((y) => html`<option value="${y}" ${raw(y === v ? "selected" : "")}>${y}</option>`);
    el.innerHTML = html`
      <div class="filters">
        <div class="field"><span>${t("ch.f.disc")}</span>${discSeg("chd", f.cd, true)}</div>
        <div class="field"><span>${t("ch.f.fmt")}</span>${fmtSeg("chf", f.cd, f.cf, true)}</div>
        <label class="field"><span>${t("rh.f.cat")}</span><select id="ch-group">
          ${Object.keys(CGROUPS).map((g) => html`<option value="${g}" ${raw(g === f.cg ? "selected" : "")}>${t(`ch.grp.${g}`)}</option>`)}</select></label>
        <div class="field"><span>${t("ch.f.sex")}</span>${seg("chs", [["", t("ch.sex.all")], ["H", t("ch.sex.H")], ["D", t("ch.sex.D")]], f.cs)}</div>
        <label class="field"><span>${t("rh.f.from")}</span><select id="ch-from">${yearOpts(f.cde)}</select></label>
        <label class="field"><span>${t("rh.f.to")}</span><select id="ch-to">${yearOpts(f.ca)}</select></label>
        <div class="field"><span>${t("ch.f.who")}</span>${seg("chw", [["runners", t("ch.who.runners")], ["clubs", t("ch.who.clubs")]], f.cw)}</div>
      </div>
      <div class="tiles" style="margin-bottom:16px">
        ${tile(t("rh.tile.editions"), fmt(nEds))}
        ${tile(t("ch.tile.champions"), fmt(champions.length))}
        ${top ? tile(t("rh.tile.most"), top.name, tn("rh.titles", top.gold)) : ""}
      </div>
      <section class="card">
        <div class="card-head"><div><h2>${f.cd === "all" ? t("ch.allDisc") : t(`ch.disc.${f.cd}`)} · ${f.cf === "all" ? t("ch.allFmt") : t(`ch.fmt.${f.cf}`)} · ${f.cde}–${f.ca}</h2>
          <div class="hint">${t(f.cw === "clubs" ? "ch.palm.hint.clubs" : "ch.palm.hint")}</div></div></div>
        <div id="ch-palm"></div>
      </section>`;
    $$('[data-seg="chd"]', el).forEach((b) => b.addEventListener("click", () => {
      f.cd = b.dataset.value;
      if (f.cd !== "all" && f.cf !== "all" && !has(f.cd + f.cf)) f.cf = "all";
      draw.champ();
    }));
    $$('[data-seg="chf"]', el).forEach((b) => b.addEventListener("click", () => { f.cf = b.dataset.value; draw.champ(); }));
    $$('[data-seg="chs"]', el).forEach((b) => b.addEventListener("click", () => { f.cs = b.dataset.value; draw.champ(); }));
    $$('[data-seg="chw"]', el).forEach((b) => b.addEventListener("click", () => { f.cw = b.dataset.value; draw.champ(); }));
    $("#ch-group", el).addEventListener("change", (e) => { f.cg = e.target.value; draw.champ(); });
    $("#ch-from", el).addEventListener("change", (e) => { f.cde = Math.min(Number(e.target.value), f.ca); draw.champ(); });
    $("#ch-to", el).addEventListener("change", (e) => { f.ca = Math.max(Number(e.target.value), f.cde); draw.champ(); });
    const num = (v) => (v ? fmt(v) : html`<span class="dim">·</span>`);
    const clubs_ = f.cw === "clubs";
    dataTable($("#ch-palm", el), {
      rows, sortKey: "rank", sortDir: 1,
      rowClass: (r) => (myClub && r.club === myClub ? "me" : ""),
      columns: [
        { key: "rank", label: t("rh.col.rank"), cls: "rank num", sort: (r) => r.rank, defaultDir: 1 },
        ...(clubs_ ? [] : [{ key: "name", label: t("ch.col.runner"), sort: (r) => (r.name || "").toLowerCase(), defaultDir: 1, render: (r) => who(r.lic, r.name) }]),
        { key: "club", label: t("rh.col.club"), sort: (r) => clubOf(r.club).toLowerCase(), defaultDir: 1, render: (r) => clubOf(r.club) },
        { key: "gold", label: html`${medal(1)}<span class="sr-only">${t("rh.col.gold")}</span>`, align: "r", cls: "num", sort: (r) => r.gold, render: (r) => num(r.gold) },
        { key: "silver", label: html`${medal(2)}<span class="sr-only">${t("rh.col.silver")}</span>`, align: "r", cls: "num", sort: (r) => r.silver, render: (r) => num(r.silver) },
        { key: "bronze", label: html`${medal(3)}<span class="sr-only">${t("rh.col.bronze")}</span>`, align: "r", cls: "num", sort: (r) => r.bronze, render: (r) => num(r.bronze) },
        { key: "total", label: t("ch.col.total"), align: "r", cls: "num", sort: (r) => r.total },
        ...(clubs_ ? [] : [{ key: "cats", label: t("ch.col.cats"), sort: (r) => [...r.cats].join(), render: (r) => [...r.cats].sort().map(fmtCat).join(", ") }]),
        { key: "chs", label: t("ch.col.champs"), sort: (r) => [...r.chs].join(), render: (r) => CHAMPS.filter((c) => r.chs.has(c)).map(chName).join(", ") },
        { key: "years", label: t("ch.col.years"), cls: "num", sort: (r) => r.from, render: (r) => (r.from === r.to ? String(r.from) : `${r.from}–${r.to}`) },
      ],
    });
  };

  // « Éditions championnats »: each edition's place, day, field and élite winners
  draw.ceds = () => {
    const el = $('[data-panel="ceds"]', main);
    sync();
    const eds = chEds(f.cc).sort((a, b) => b.y - a.y);
    const win = (e, cat) => {
      const w = e.cats?.[cat]?.find((r) => r[0] === 1);
      return w ? who(w[1], w[2]) : html`<span class="dim">—</span>`;
    };
    el.innerHTML = html`
      <div class="filters"><div class="field"><span>${t("ch.f.disc")}</span>${discSeg("ched", f.cc[0], false)}</div>
        <div class="field"><span>${t("ch.f.fmt")}</span>${fmtSeg("chef", f.cc[0], f.cc.slice(1), false)}</div></div>
      <section class="card">
        <div class="card-head"><div><h2>${chName(f.cc)}</h2><div class="hint">${t("ch.ed.hint")}</div></div></div>
        <div id="ch-eds"></div>
      </section>`;
    $$('[data-seg="ched"]', el).forEach((b) => b.addEventListener("click", () => { f.cc = pickKey(b.dataset.value, f.cc.slice(1)); draw.ceds(); }));
    $$('[data-seg="chef"]', el).forEach((b) => b.addEventListener("click", () => { f.cc = f.cc[0] + b.dataset.value; draw.ceds(); }));
    dataTable($("#ch-eds", el), {
      rows: eds, sortKey: "y", sortDir: -1,
      columns: [
        { key: "y", label: t("rh.col.year"), cls: "num", sort: (r) => r.y,
          render: (r) => html`<a href="${PAGE}?onglet=crank&rc=${f.cc}&ry=${r.y}" data-ry="${r.y}">${r.y}</a>` },
        { key: "at", label: t("rh.col.at"), sort: (r) => r.at || "" },
        { key: "date", label: t("ch.col.date"), cls: "num", sort: (r) => r.date, render: (r) => fmtDate(r.date) },
        { key: "n", label: t("ch.col.finishers"), align: "r", cls: "num dim", sort: (r) => r.n, render: (r) => fmt(r.n) },
        { key: "cats", label: t("ch.col.ncats"), align: "r", cls: "num dim", sort: (r) => Object.keys(r.cats).length, render: (r) => fmt(Object.keys(r.cats).length) },
        { key: "wH", label: t("ch.col.winner", { cat: fmtCat("H21") }), sort: (r) => r.cats?.H21?.[0]?.[2] || "~", render: (r) => win(r, "H21") },
        { key: "wD", label: t("ch.col.winner", { cat: fmtCat("D21") }), sort: (r) => r.cats?.D21?.[0]?.[2] || "~", render: (r) => win(r, "D21") },
      ],
    });
    $$("a[data-ry]", el).forEach((a) => a.addEventListener("click", (e) => { e.preventDefault(); f.rc = f.cc; f.ry = Number(a.dataset.ry); f.rk = null; show("crank"); }));
  };

  // « Classements championnats »: one edition's ranking, category by category
  draw.crank = async () => {
    const el = $('[data-panel="crank"]', main);
    const eds = chEds(f.rc).map((e) => e.y).sort((a, b) => b - a);
    if (!eds.includes(f.ry)) f.ry = eds[0];
    const ed = champs.editions[f.rc]?.[f.ry];
    const cats = Object.keys(ed?.cats || {});
    if (!cats.includes(f.rk)) f.rk = cats.includes("H21") ? "H21" : cats[0];
    sync();
    el.innerHTML = html`
      <div class="filters">
        <div class="field"><span>${t("ch.f.disc")}</span>${discSeg("chrd", f.rc[0], false)}</div>
        <div class="field"><span>${t("ch.f.fmt")}</span>${fmtSeg("chrf", f.rc[0], f.rc.slice(1), false)}</div>
        <label class="field"><span>${t("rh.f.year")}</span><select id="ch-year">
          ${eds.map((y) => html`<option value="${y}" ${raw(y === f.ry ? "selected" : "")}>${y}</option>`)}</select></label>
        <label class="field"><span>${t("ch.col.cat")}</span><select id="ch-cat">
          ${cats.map((c) => html`<option value="${c}" ${raw(c === f.rk ? "selected" : "")}>${fmtCat(c)}</option>`)}</select></label>
      </div>
      <section class="card">
        <div class="card-head"><div><h2>${chName(f.rc)} ${f.ry} · ${fmtCat(f.rk)}</h2>
          <div class="hint">${ed?.at || ""}${ed?.date ? ` · ${fmtDate(ed.date)}` : ""}</div></div></div>
        <div id="ch-rank"><div class="loading">${t("misc.loading")}</div></div>
      </section>`;
    $$('[data-seg="chrd"]', el).forEach((b) => b.addEventListener("click", () => { f.rc = pickKey(b.dataset.value, f.rc.slice(1)); draw.crank(); }));
    $$('[data-seg="chrf"]', el).forEach((b) => b.addEventListener("click", () => { f.rc = f.rc[0] + b.dataset.value; draw.crank(); }));
    $("#ch-year", el).addEventListener("change", (e) => { f.ry = Number(e.target.value); draw.crank(); });
    $("#ch-cat", el).addEventListener("change", (e) => { f.rk = e.target.value; draw.crank(); });
    const body = ed ? await edition(f.rc, f.ry) : null;
    const box = $("#ch-rank", el);
    if (!box) return;
    const list = body?.cats?.[f.rk] || [];
    if (!list.length) { box.innerHTML = html`<div class="empty">${t("ch.none")}</div>`; return; }
    const w = secs(list.find((r) => r[0] === 1)?.[4]);
    const rows = list.map(([place, lic, name, club, time, st], i) => ({ i, place, lic, name, club, time, st,
      gap: place && w != null && secs(time) != null ? secs(time) - w : null }));
    dataTable(box, {
      rows, sortKey: "i", sortDir: 1,
      rowClass: (r) => (myClub && r.club === myClub ? "me" : ""),
      columns: [
        { key: "i", label: t("rh.col.place"), cls: "rank num", sort: (r) => r.i, defaultDir: 1,
          render: (r) => (r.place ? html`${medal(r.place)}${r.place}` : html`<span class="dim">${t(`ch.status.${r.st || "nc"}`)}</span>`) },
        { key: "name", label: t("ch.col.runner"), sort: (r) => (r.name || "").toLowerCase(), defaultDir: 1, render: (r) => who(r.lic, r.name) },
        { key: "club", label: t("rh.col.club"), sort: (r) => clubOf(r.club).toLowerCase(), defaultDir: 1, render: (r) => clubOf(r.club) },
        { key: "time", label: t("rh.col.time"), align: "r", cls: "num", sort: (r) => secs(r.time) ?? 1e9, defaultDir: 1, render: (r) => r.time || "" },
        { key: "gap", label: t("rh.col.gap"), align: "r", cls: "num dim", sort: (r) => r.gap ?? 1e9, defaultDir: 1, render: (r) => (r.gap ? `+${clock(r.gap)}` : "") },
      ],
    });
  };
  show = bindPageTabs(main, TABS, tab0, (k) => draw[k]());
  // a club's name anywhere opens its tab
  main.addEventListener("click", (e) => {
    const a = e.target.closest("a[data-club]");
    if (!a) return;
    e.preventDefault();
    f.club = a.dataset.club;
    show("club");
  });
}
