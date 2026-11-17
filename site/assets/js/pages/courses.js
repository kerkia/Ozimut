// Courses: every competition of the selected discipline, as a tree —
// competition → its circuits → the results. Three modes: all competitions,
// those a runner took part in, those a club took part in. Selecting a circuit
// moves the tree to the left and shows its results, with category toggles.

import { html, raw, $, $$, fmt, fmtDate, fmtTime, displayName, normalise, debounce, ord, fmtFormat, fmtCat } from "../util.js";
import { xyChart, regressionChart, linreg, methodColor } from "../charts.js";
import { t } from "../i18n.js";
import * as store from "../store.js";
import * as data from "../data.js";
import { R, C, C_SCORE, C_CNJ15 } from "../data.js";
import {
  methodChips, bindMethodChips, seg, runnerSearch, bindRunnerSearch, dataTable, methodShort, statusLabel, terrainTag, scoreCell, subHead,
  chartCard, bindChartCard, legend, tile, filterFold, pageTabs, tabFrom, bindPageTabs, cnLabel, scoreLabel,
} from "../ui.js";
import * as auth from "../auth.js";
import { link, replaceQuery, terrainSeg, terrainChoice } from "../app.js";

const MODES = ["all", "runner", "club"];
const LEVELS = ["A", "B1", "B2", "C1", "C2", "D"];
const MAX_CATS = 6;
const SCORE = C_SCORE;

/** Categories of a circuit, most represented first: [[cat, n]]. */
function categories(circuit) {
  const n = new Map();
  for (const r of circuit.rows) if (r[C.cat]) n.set(r[C.cat], (n.get(r[C.cat]) || 0) + 1);
  return [...n.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

export async function render(main, { arg, query }) {
  if (arg && !query.id) query = { ...query, id: arg };      // old #/course/<id> links
  const myLic = auth.myId();            // one's own number in the loaded country's files
  // a race asked for by id (the e-mail digest's link, a runner's race) brings its own discipline, so that the list beside it is
  // that discipline's and holds it (owner, 2026-10-17: a sprint's link opened beside the forest list, the race not in it)
  const asked = query.id ? data.comp(query.id) : null;
  // (« Toutes » chosen: every discipline is listed, the race is in it)
  const all = terrainChoice() === "all";
  if (!all && asked && store.TERRAINS.includes(asked.terrain) && asked.terrain !== store.get().terrain) store.set({ terrain: asked.terrain });
  const terrain = store.get().terrain;
  const meta = data.meta();
  const seasons = [...meta.seasons].map(String).reverse();
  const st = {
    mode: MODES.includes(query.mode) ? query.mode : "all",
    runner: query.r || store.get().lastRunner || myLic,
    club: query.club || auth.myClub(),
    // a race asked for by id brings its own season, so it is in the list
    season: query.s === "all" ? "" : (seasons.includes(query.s) ? query.s
      : (query.id && data.comp(query.id) ? String(data.comp(query.id).season) : seasons[0])),
    level: LEVELS.includes(query.level) ? query.level : "",
    q: query.q || "",
    course: query.id || null,
    circuit: query.circ || null,
    cats: new Set((query.cats || "").split(",").filter(Boolean)),
    cnRef: "now",                               // CN on the x axis of the CN-vs-score chart: "now" | "race"
  };
  const open = new Set(st.course ? [st.course] : []);
  const files = new Map();                    // course id -> c file
  const loadCourse = async (id) => {
    if (!files.has(id)) files.set(id, await data.course(id));
    return files.get(id);
  };

  main.innerHTML = html`
    <div class="page-head"><div><h1>${t("cs.title")}</h1><p class="lede">${t("cs.lede")}</p></div></div>
    ${filterFold(html`<div class="filters" id="filters"></div>`)}
    <div class="courses-layout" id="layout">
      <section class="card tree-pane"><div class="card-body tree-modes" id="modes"></div>
        <div class="card-head" style="padding-top:0"><h2 id="tree-title"></h2>${terrainSeg()}</div><div id="tree" class="tree"></div></section>
      <section class="card results-pane" id="results"></section>
    </div>`;

  // ---- filters --------------------------------------------------------------------
  function drawFilters() {
    const clubs = Object.entries(meta.names.clubs).sort((a, b) => a[1].localeCompare(b[1]));
    const runner = data.runner(st.runner);
    $("#modes").innerHTML = html`
      ${seg("mode", MODES.map((m) => [m, t(`cs.mode.${m}`)]), st.mode)}
      ${st.mode === "runner" ? html`<div class="row" style="gap:8px;margin-top:10px"><span class="pill"><a href="${link.runner(st.runner)}">${displayName(runner?.nom || st.runner || "—")}</a></span>
        ${runnerSearch("cs-runner", t("rn.change"))}</div>` : ""}
      ${st.mode === "club" ? html`<select id="cs-club" style="margin-top:10px;width:100%">
        ${clubs.map(([c, n]) => html`<option value="${c}" ${raw(c === st.club ? "selected" : "")}>${n} (${c})</option>`)}</select>` : ""}`;
    $("#filters").innerHTML = html`<label class="field"><span>${t("f.season")}</span><select id="cs-season">
        <option value="all" ${raw(!st.season ? "selected" : "")}>${t("nw.allSeasons")}</option>
        ${seasons.map((y) => html`<option value="${y}" ${raw(y === st.season ? "selected" : "")}>${y}</option>`)}</select></label>
      <label class="field"><span>${t("co.level")}</span><select id="cs-level"><option value="">${t("f.allm")}</option>
        ${LEVELS.map((l) => html`<option value="${l}" ${raw(l === st.level ? "selected" : "")}>${l}</option>`)}</select></label>
      <label class="field"><span>${t("cs.search")}</span><input type="search" id="cs-q" value="${st.q}" style="width:180px" placeholder="${t("cs.search.ph")}"></label>`;
    $$('[data-seg="mode"]').forEach((b) => b.addEventListener("click", () => { st.mode = b.dataset.value; drawFilters(); refresh(); }));
    if (st.mode === "runner") {
      bindRunnerSearch($("#cs-runner"), { onPick: (l) => { st.runner = l; store.set({ lastRunner: l }); drawFilters(); refresh(); } });
    }
    $("#cs-club")?.addEventListener("change", (e) => { st.club = e.target.value; refresh(); });
    $("#cs-season").addEventListener("change", (e) => { st.season = e.target.value === "all" ? "" : e.target.value; refresh(); });
    $("#cs-level").addEventListener("change", (e) => { st.level = e.target.value; refresh(); });
    $("#cs-q").addEventListener("input", debounce((e) => { st.q = e.target.value; refresh(); }, 180));
    bindMethodChips(main, () => { drawFilters(); drawResults(); });
  }

  function sync() {
    replaceQuery({
      mode: st.mode === "all" ? null : st.mode,
      r: st.mode === "runner" && st.runner !== myLic ? st.runner : null,
      club: st.mode === "club" && st.club !== auth.myClub() ? st.club : null,
      s: st.season === seasons[0] ? null : (st.season || "all"), level: st.level || null, q: st.q || null,
      id: st.course, circ: st.circuit, cats: st.cats.size ? [...st.cats].join(",") : null,
    });
  }

  // ---- which competitions --------------------------------------------------------------
  let runnerRaces = new Map();                // course id -> [race rows] of the chosen runner
  let clubSet = new Set();
  async function scope() {
    if (st.mode === "runner" && st.runner) {
      runnerRaces = new Map();
      for (const r of await data.runnerRaces(st.runner)) {
        const id = String(r[R.course]);
        if (!runnerRaces.has(id)) runnerRaces.set(id, []);
        runnerRaces.get(id).push(r);
      }
    }
    if (st.mode === "club" && st.club) clubSet = new Set((await data.clubCourses(st.club)).map(String));
  }
  function list() {
    const qn = normalise(st.q);
    const out = [];
    for (const c of data.comps().values()) {
      if ((!all && c.terrain !== terrain) || !c.nCircuits) continue;
      if (st.season && String(c.season) !== st.season) continue;
      if (st.level && c.groupe !== st.level) continue;
      if (st.mode === "runner" && !runnerRaces.has(c.id)) continue;
      if (st.mode === "club" && !clubSet.has(c.id)) continue;
      if (qn && !normalise(`${c.title} ${c.location} ${c.organizer}`).includes(qn)) continue;
      out.push(c);
    }
    return out.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.title.localeCompare(b.title)));
  }

  // ---- the tree -----------------------------------------------------------------------
  async function drawTree() {
    const comps = list();
    $("#tree-title").textContent = `${fmt(comps.length)} ${t("cs.count")}`;
    const lic = st.mode === "runner" ? st.runner : null;
    const expanded = await Promise.all(comps.filter((c) => open.has(c.id)).map(async (c) => [c.id, await loadCourse(c.id)]));
    const fileOf = new Map(expanded);
    $("#tree").innerHTML = comps.length ? html`${comps.map((c) => {
      const isOpen = open.has(c.id);
      const mine = lic ? runnerRaces.get(c.id) || [] : [];
      return html`<div class="tree-comp ${isOpen ? "open" : ""} ${c.id === st.course ? "current" : ""}">
        <button type="button" class="tree-row" data-comp="${c.id}" aria-expanded="${isOpen}">
          <span class="caret" aria-hidden="true">${isOpen ? "▾" : "▸"}</span>
          <span class="tree-date num">${fmtDate(c.date, "short")}</span>
          <span class="tree-title"><b>${c.title}</b><span class="dim"> · ${c.location || ""}</span></span>
          <span class="tree-meta">${all ? terrainTag(c.terrain) : ""}${c.groupe ? html`<span class="tag">${c.groupe}</span>` : ""}
            <span class="tag">${fmtFormat(c.epreuve)}</span>
            ${mine.length ? html`<span class="tag tag-in">${mine.map((r) => (r[R.place] ? ord(r[R.place]) : t(`status.${r[R.status]}`) || "—")).join(" · ")}</span>` : ""}
            <span class="dim num">${fmt(c.n)}</span></span>
        </button>
        ${isOpen ? html`<div class="tree-circuits">${(fileOf.get(c.id)?.circuits || []).map((circ) => {
          const cats = categories(circ);
          const ran = mine.find((r) => String(r[R.cid]) === String(circ.id));
          const clubN = st.mode === "club" ? circ.rows.filter((r) => data.clubParts(r[C.club]).code === st.club).length : 0;
          return html`<button type="button" class="tree-circuit ${String(circ.id) === String(st.circuit) ? "current" : ""}" data-course="${c.id}" data-circ="${circ.id}">
            <span class="tree-cname">${ran ? html`<span class="me-mark" title="${t("cs.ran")}">●</span>` : ""}${circ.name}
              <span class="dim num">${circ.dist ? `${fmt(circ.dist, 1)} km · ` : ""}${fmt(circ.rows.length)}</span>
              ${clubN ? html`<span class="tag tag-in">${fmt(clubN)} ${t("cs.fromClub")}</span>` : ""}</span>
            <span class="cat-chips">${cats.slice(0, MAX_CATS).map(([k, n]) => html`<span class="cat-chip" title="${fmt(n)}">${k}</span>`)}${cats.length > MAX_CATS ? html`<span class="dim">+${cats.length - MAX_CATS}</span>` : ""}</span>
          </button>`;
        })}</div>` : ""}
      </div>`;
    })}` : html`<div class="empty">${t("cs.none")}</div>`;
    $$("[data-comp]").forEach((b) => b.addEventListener("click", () => {
      const id = b.dataset.comp;
      if (open.has(id)) open.delete(id); else open.add(id);
      drawTree();
    }));
    $$("[data-circ]").forEach((b) => b.addEventListener("click", () => {
      if (st.circuit !== b.dataset.circ) st.cats.clear();
      st.course = b.dataset.course; st.circuit = b.dataset.circ;
      drawTree(); drawResults();
    }));
  }

  // ---- the results of one circuit ---------------------------------------------------------
  async function drawResults() {
    sync();
    const pane = $("#results");
    $("#layout").classList.toggle("split", !!st.circuit);
    if (!st.circuit) { pane.innerHTML = ""; return; }
    const file = await loadCourse(st.course);
    const circ = file?.circuits.find((c) => String(c.id) === String(st.circuit));
    const comp = data.comp(st.course);
    if (!circ || !comp) { pane.innerHTML = html`<div class="empty">${t("err.notfound")}</div>`; return; }
    const cats = categories(circ);
    const toggles = cats.length <= MAX_CATS;
    const everyone = new Set(), clubsSeen = new Set();
    let finishers = 0;
    for (const c of file.circuits) for (const r of c.rows) {
      everyone.add(r[C.lic]);
      const code = data.clubParts(r[C.club]).code;
      if (code) clubsSeen.add(code);
      if (r[C.place]) finishers++;
    }
    const stats = { runners: everyone.size, finishers, clubs: clubsSeen.size };
    for (const k of [...st.cats]) if (!cats.some(([c]) => c === k)) st.cats.delete(k);
    const methods = store.get().methods;
    const shown = circ.rows.filter((r) => !st.cats.size || st.cats.has(r[C.cat]));
    let rank = 0;
    const rows = shown.map((r) => ({ r, rank: r[C.place] ? ++rank : null }));
    const hl = (r) => [
      r[C.lic] === myLic ? "me" : "",
      st.mode === "runner" && r[C.lic] === st.runner && st.runner !== myLic ? "selected" : "",
      st.mode === "club" && data.clubParts(r[C.club]).code === st.club ? "selected" : "",
    ].join(" ");
    // the circuit's results, then its two charts, as tabs (the one chosen stays from circuit to circuit)
    const rtabs = [["resultats", t("co.tab.results")], ["score", t("co.tab.score")], ["cn", t("co.tab.cn")]];
    const rtab = st.rtab || (st.rtab = tabFrom(rtabs, Object.fromEntries(new URLSearchParams(location.hash.split("?")[1] || ""))));
    pane.innerHTML = html`
      <div class="card-head">
        <div><button type="button" class="btn btn-ghost btn-sm back-to-list" id="back">← ${t("cs.back")}</button>
          <h2>${circ.name} <span class="dim" style="font-weight:500">· ${comp.title}</span></h2>
          <div class="hint">${fmtDate(comp.date)} · ${comp.location || ""} · ${terrainTag(comp.terrain)} ${comp.groupe ? html`<span class="tag">${comp.groupe}</span>` : ""}
            ${circ.dist ? ` · ${fmt(circ.dist, 1)} km` : ""} · ${fmt(circ.rows.length)} ${t("cs.runners")}</div></div>
        <div class="row"><a class="btn btn-sm" href="${data.officialCourseUrl(st.course)}" target="_blank" rel="noopener">${t("cs.officialComp")} ↗</a>
          <a class="btn btn-sm" href="${data.officialCircuitUrl(st.circuit)}" target="_blank" rel="noopener">${t("cs.officialCircuit")} ↗</a></div>
      </div>
      <div class="card-body" style="padding-bottom:0">${pageTabs(rtabs, rtab)}</div>
      <div class="card-body" style="padding-bottom:0">
        <div class="tiles tiles-compact">
          ${tile(t("co.circuitsT"), fmt(file.circuits.length), comp.organizer || "")}
          ${tile(t("co.participants"), fmt(stats.runners))}
          ${tile(t("co.finishers"), fmt(stats.finishers))}
          ${tile(t("nav.clubs"), fmt(stats.clubs))}
        </div>
        <div class="hint circuit-values" style="margin-top:10px">${t("ui.colon", { a: t("co.value") })}
          ${methods.map((m, i) => html`${i ? " · " : ""}<b class="num">${fmt(circ.value?.[m])}</b>`)}</div>
      </div>
      ${toggles && cats.length > 1 ? html`<div class="card-body" style="padding-bottom:0"><div class="chips" role="group" aria-label="${t("rk.col.cat")}">
        ${cats.map(([k, n]) => html`<button type="button" class="chip toggle" data-cat="${k}" aria-pressed="${st.cats.has(k)}">
          <span class="tick" aria-hidden="true"></span>${fmtCat(k)} <span class="dim num">${fmt(n)}</span></button>`)}
        ${st.cats.size ? html`<button type="button" class="btn btn-ghost btn-sm" id="cats-all">${t("cs.allCats")}</button>` : ""}
      </div></div>` : ""}
      <div data-panel="resultats"><div id="res-table"></div></div>
      <div data-panel="score" class="card-body">${chartCard({ id: "sbp", title: t("co.scoreByPlace"), hint: t("co.scoreByPlace.hint"), short: true })}</div>
      <div data-panel="cn" class="card-body">${chartCard({ id: "cvs", title: t("co.cnVsScore"), hint: t("co.cnVsScore.hint"), short: true,
        tools: seg("cnref", ["now", "race"].map((k) => [k, t(`co.cnRef.${k}`)]), st.cnRef) })}</div>`;
    bindPageTabs(pane, rtabs, rtab, (k) => { st.rtab = k; });
    bindChartCard(pane, "sbp");
    bindChartCard(pane, "cvs");
    $$('[data-seg="cnref"]', pane).forEach((b) => b.addEventListener("click", () => { st.cnRef = b.dataset.value; drawResults(); }));
    $("#back").addEventListener("click", () => { st.circuit = null; drawTree(); drawResults(); });
    $$("[data-cat]", pane).forEach((b) => b.addEventListener("click", () => {
      const k = b.dataset.cat;
      if (st.cats.has(k)) st.cats.delete(k); else st.cats.add(k);
      drawResults();
    }));
    $("#cats-all")?.addEventListener("click", () => { st.cats.clear(); drawResults(); });
    const cnOf = await cnGetter(comp, methods);
    if ($("#res-table") === null || $("#results") !== pane) return;     // redrawn while the CN were loading
    // score minus CN: positive = did better than the CN suggests
    const gap = (x, m) => {
      const cn = cnOf(m, x.r), s = x.r[SCORE[m]];
      return x.r[C.place] && cn && s ? s - cn : null;
    };
    dataTable($("#res-table"), {
      compact: true,                     // (a desktop shows every method's columns without a scrollbar)
      rows, sortKey: "place", sortDir: 1, rowClass: (x) => hl(x.r),
      columns: [
        { key: "place", label: t("col.place"), cls: "rank num", defaultDir: 1, sort: (x) => x.r[C.place] ?? 1e6,
          render: (x) => (x.r[C.place] ? html`${fmt(st.cats.size ? x.rank : x.r[C.place])}${st.cats.size ? html`<span class="dim"> (${fmt(x.r[C.place])})</span>` : ""}` : statusLabel(x.r[C.status])) },
        { key: "name", label: t("rk.col.name"), sort: (x) => data.runner(x.r[C.lic])?.nom, defaultDir: 1,
          render: (x) => html`<a class="name" href="${link.runner(x.r[C.lic])}">${displayName(data.runner(x.r[C.lic])?.nom || x.r[C.lic])}</a>` },
        { key: "cat", label: t("rk.col.cat"), sort: (x) => x.r[C.cat], defaultDir: 1, render: (x) => x.r[C.cat] || "" },
        { key: "club", label: t("rk.col.club"), cls: "num", sort: (x) => x.r[C.club], defaultDir: 1, render: (x) => {
          const code = data.clubParts(x.r[C.club]).code;
          return code ? html`<a href="${link.club(code)}" title="${data.clubName(x.r[C.club])}">${code}</a>` : x.r[C.club] || "";
        } },
        { key: "time", label: t("col.time"), align: "r", cls: "num", sort: (x) => x.r[C.time], defaultDir: 1, render: (x) => fmtTime(x.r[C.time]) },
        // per method: the CN, then the score with its gap to that CN (sorted by the gap: by score is by place)
        ...methods.flatMap((m) => [{
          key: `cn_${m}`, label: subHead(cnLabel(m), t(`co.cnSub.${st.cnRef}`)), align: "r", cls: "num",
          sort: (x) => cnOf(m, x.r), render: (x) => { const cn = cnOf(m, x.r); return cn ? fmt(cn) : html`<span class="dim">—</span>`; },
        }, {
          key: `s_${m}`, label: html`<span title="${t("res.score.hint")}">${subHead(scoreLabel(m), t("res.gap"))}</span>`, align: "r", cls: "num",
          sort: (x) => gap(x, m), render: (x) => scoreCell(x.r[C.place] ? x.r[SCORE[m]] || null : null, cnOf(m, x.r)),
        }]),
      ],
    });
    drawScoreChart(circ, rows);
    drawCnChart(rows, cnOf);
  }

  /** (method, result row) -> the runner's CN: today's, or the one 15 days before the race. */
  async function cnGetter(comp, methods) {
    const CNJ15 = C_CNJ15;
    if (st.cnRef !== "now") return (m, r) => r[CNJ15[m]];
    const now = Object.fromEntries(await Promise.all(methods.map(async (m) => [m, await data.cnAt(m, comp.terrain, data.latestMonth())])));
    return (m, r) => now[m].get(String(r[C.lic]));
  }

  /** CN of each ranked runner against the score of this race, with a regression line per method. */
  function drawCnChart(rows, cnOf) {
    const methods = store.get().methods;
    const ranked = rows.filter((x) => x.r[C.place]);
    const series = methods.map((m) => ({
      name: t("chart.cn"), color: methodColor(m), method: m,
      data: ranked.map((x) => {
        const cn = cnOf(m, x.r);
        const score = x.r[SCORE[m]];
        return cn && score ? [cn, score, x.r[C.lic], displayName(data.runner(x.r[C.lic])?.nom || x.r[C.lic])] : null;
      }).filter(Boolean),
    }));
    const fits = series.map((s) => linreg(s.data));
    $("#cvs-legend").innerHTML = legend(series.map((s, i) => ({
      label: fits[i] ? html`${s.name} <span class="dim num">· ${t("co.reg.slope")} ${fmt(fits[i].b, 2)} · R² ${fmt(fits[i].r2, 2)} · ${fmt(fits[i].n)} ${t("co.reg.n")}</span>` : s.name,
      color: s.color,
    })));
    regressionChart($("#cvs"), { series, xName: t(`co.cnVsScore.x.${st.cnRef}`), yName: t("rn.score") });
    $("#cvs-table").innerHTML = html`<table class="data compact"><thead><tr><th>${t("rk.col.name")}</th>
      ${series.map(() => html`<th class="r">${t(`co.cnVsScore.x.${st.cnRef}`)}</th><th class="r">${t("rn.score")}</th>`)}</tr></thead>
      <tbody>${ranked.map((x) => html`<tr><td>${displayName(data.runner(x.r[C.lic])?.nom || x.r[C.lic])}</td>
        ${series.map((s) => {
          const p = s.data.find((d) => d[2] === x.r[C.lic]);
          return html`<td class="r num">${p ? fmt(p[0]) : "—"}</td><td class="r num">${p ? fmt(p[1]) : "—"}</td>`;
        })}</tr>`)}</tbody></table>`;
  }

  function drawScoreChart(circ, rows) {
    const methods = store.get().methods;
    const ranked = rows.filter((x) => x.r[C.place]);
    const series = methods.map((m) => ({
      name: t("rn.score"), color: methodColor(m),
      data: ranked.filter((x) => x.r[SCORE[m]]).map((x) => [st.cats.size ? x.rank : x.r[C.place], x.r[SCORE[m]]]),
    }));
    $("#sbp-legend").innerHTML = "";
    xyChart($("#sbp"), { series, xName: t("col.place"), yName: t("rn.score"), xMin: 1 });
    $("#sbp-table").innerHTML = html`<table class="data compact"><thead><tr><th>${t("col.place")}</th>
      ${methods.map(() => html`<th class="r">${t("rn.score")}</th>`)}</tr></thead>
      <tbody>${ranked.map((x) => html`<tr><td class="num">${fmt(st.cats.size ? x.rank : x.r[C.place])}</td>
        ${methods.map((m) => html`<td class="r num">${fmt(x.r[SCORE[m]])}</td>`)}</tr>`)}</tbody></table>`;
  }

  async function refresh() {
    await scope();
    if (st.course && !st.circuit) {
      // a race without a circuit: the runner's circuit in runner mode, else the one the signed-in user ran (the digest's link
      // is about one's own new result), else the busiest
      const f = await loadCourse(st.course);
      const who = st.mode === "runner" ? st.runner : myLic;
      const ran = who ? f?.circuits.find((c) => c.rows.some((r) => r[C.lic] === who)) : null;
      const busiest = f?.circuits.reduce((b, c) => (!b || c.rows.length > b.rows.length ? c : b), null);
      st.circuit = ran ? String(ran.id) : busiest ? String(busiest.id) : null;
    }
    // in runner mode, open the competitions of the runner's latest race right away
    if (st.mode === "runner" && !open.size) {
      const first = list()[0];
      if (first) open.add(first.id);
    }
    await drawTree();
    await drawResults();
    $(".tree-comp.current")?.scrollIntoView({ block: "center" });
  }

  drawFilters();
  await refresh();
  return { title: t("cs.title") };
}
