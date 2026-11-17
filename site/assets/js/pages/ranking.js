// Ranking: the national ranking at a date, with FFCO-style filters, a row of
// figures per method, the list with the distributions beside it, and
// multi-select into the comparison.

import { html, raw, $, $$, fmt, fmtSigned, fmtDate, ord, displayName, normalise, summary, quantile, downloadCsv, debounce, pctN, fmtCat } from "../util.js";
import { t } from "../i18n.js";
import * as store from "../store.js";
import * as data from "../data.js";
import { distributionChart, cdfChart, methodColor, css } from "../charts.js";
import {
  methodChips, bindMethodChips, chartCard, bindChartCard, legend, dataTable, tile, methodLabel, methodShort, filterFold,
  pageTabs, tabFrom, bindPageTabs,
} from "../ui.js";
import { link, replaceQuery, terrainField } from "../app.js";
import * as auth from "../auth.js";
import * as country from "../country.js";
import * as cfqual from "../cfqual.js";
// the country's own word for its regions when the catalogues have one (Canada: its provinces), else « regional federation »
const regionWord = () => { const k = `f.region.${data.loadedCountry()}`; return t(k) !== k ? t(k) : t("f.region"); };

export const AGES = ["10", "12", "14", "16", "18", "20", "21", "35", "40", "45", "50", "55", "60", "65", "70", "75", "80", "85", "90"];
const BIN = 250;

/** Everything the ranking needs at one date, shared with the compare and club pages. */
export async function loadRanking(methods, terrain, month) {
  const year = Number(month.slice(0, 4));
  const prevMonth = data.monthYearBefore(month);
  const [attrs, ...maps] = await Promise.all([
    data.attrsAt(year),
    ...methods.map((m) => data.cnAt(m, terrain, month)),
  ]);
  const prev = prevMonth
    ? await Promise.all(methods.map((m) => data.cnAt(m, terrain, prevMonth)))
    : methods.map(() => new Map());
  const byMethod = Object.fromEntries(methods.map((m, i) => [m, maps[i]]));
  const prevBy = Object.fromEntries(methods.map((m, i) => [m, prev[i]]));
  // overall rank per method, before any filter
  const overall = {};
  for (const m of methods) {
    const sorted = [...byMethod[m].entries()].sort((a, b) => b[1] - a[1]);
    const rk = new Map();
    let last = null, pos = 0;
    sorted.forEach(([lic, cn], i) => { if (cn !== last) { pos = i + 1; last = cn; } rk.set(lic, pos); });
    overall[m] = rk;
  }
  const lics = new Set();
  methods.forEach((m) => byMethod[m].forEach((_, lic) => lics.add(lic)));
  const rows = [];
  for (const lic of lics) {
    const r = data.runner(lic);
    const a = attrs.get(lic) || [r?.cat, r?.club];
    const club = a[1] || "";
    const parts = data.clubParts(club);
    const cn = {}, delta = {}, rank = {};
    for (const m of methods) {
      cn[m] = byMethod[m].get(lic) ?? null;
      const p = prevBy[m].get(lic);
      delta[m] = cn[m] != null && p != null ? cn[m] - p : null;
      rank[m] = overall[m].get(lic) ?? null;
    }
    rows.push({
      lic, nom: r?.nom || lic, name: displayName(r?.nom || lic), key: normalise(r?.nom),
      cat: a[0] || "", sexe: (a[0] || "")[0] || r?.sexe || "", age: (a[0] || "").slice(1),
      club, clubCode: parts.code, dept: parts.dept, ligue: parts.ligue,
      nRaces: r?.nBy[terrain], cn, delta, rank, pct: {},
    });
  }
  // each runner's percentile in their category (owner, 2026-10-15): the share of the category's ranked runners of all of
  // France whose CN is lower (percent_rank; 100 = the category's best, equal CNs share their value), before any filter
  for (const m of methods) {
    const byCat = new Map();
    for (const r of rows) if (r.cn[m] != null && r.cat) { if (!byCat.has(r.cat)) byCat.set(r.cat, []); byCat.get(r.cat).push(r); }
    for (const list of byCat.values()) {
      list.sort((a, b) => a.cn[m] - b.cn[m]);
      let below = 0;
      list.forEach((r, i) => { if (i && list[i - 1].cn[m] < r.cn[m]) below = i; r.pct[m] = list.length > 1 ? (100 * below) / (list.length - 1) : 100; });
    }
  }
  return { rows, attrs, prevMonth };
}

export function applyFilters(rows, f, sortMethod) {
  let out = rows.filter((r) =>
    (!f.sexe || r.sexe === f.sexe) &&
    (!f.cat || r.age === f.cat) &&
    (!f.club || r.clubCode === f.club) &&
    (!f.dept || r.dept === f.dept) &&
    (!f.ligue || r.ligue === f.ligue) &&
    (!f.q || normalise(f.q).split(/\s+/).every((w) => r.key.includes(w))));
  if (f.podium) {
    const byCat = new Map();
    for (const r of out) {
      if (r.cn[sortMethod] == null) continue;
      if (!byCat.has(r.cat)) byCat.set(r.cat, []);
      byCat.get(r.cat).push(r);
    }
    out = [];
    for (const list of byCat.values()) {
      list.sort((a, b) => b.cn[sortMethod] - a.cn[sortMethod]);
      out.push(...list.slice(0, 3));
    }
  }
  return out;
}

export function bins(values) {
  const counts = new Map();
  for (const v of values) {
    const b = Math.floor(v / BIN) * BIN + BIN / 2;
    counts.set(b, (counts.get(b) || 0) + 1);
  }
  if (!counts.size) return [];
  const keys = [...counts.keys()];
  const lo = Math.min(...keys), hi = Math.max(...keys);
  const out = [];
  for (let b = lo; b <= hi; b += BIN) out.push([b, counts.get(b) || 0]);
  return out;
}

export function dateControls(month) {
  const months = data.months();
  const years = [...new Set(months.map((m) => m.slice(0, 4)))].reverse();
  const y = month.slice(0, 4);
  const ms = months.filter((m) => m.startsWith(y));
  return html`<label class="field"><span>${t("f.date")}</span>
    <div class="row" style="gap:6px">
      <select id="f-year" aria-label="${t("f.year")}">${years.map((yy) => html`<option value="${yy}" ${raw(yy === y ? "selected" : "")}>${yy}</option>`)}</select>
      <select id="f-month" aria-label="${t("f.month")}">${ms.map((m) => html`<option value="${m}" ${raw(m === month ? "selected" : "")}>${fmtDate(m, "month").replace(/\s\d{4}$/, "")}</option>`)}</select>
    </div></label>`;
}
export function bindDateControls(root, onChange) {
  $("#f-year", root).addEventListener("change", (e) => {
    const y = e.target.value;
    const ms = data.months().filter((m) => m.startsWith(y));
    const cur = $("#f-month", root).value.slice(5, 7);
    onChange(ms.find((m) => m.slice(5, 7) === cur) || ms[ms.length - 1]);
  });
  $("#f-month", root).addEventListener("change", (e) => onChange(e.target.value));
}

/** One row of headline figures per selected method. */
export function statRows(methods, rowsFor) {
  return html`<div class="statrows">${methods.map((m) => {
    const s = summary(rowsFor(m));
    return html`<div class="statrow${methods.length > 1 ? "" : " single"}">
      ${methods.length > 1 ? html`<div class="statrow-label"><span class="key" style="background:${raw(methodColor(m))}"></span>${methodLabel(m)}</div>` : ""}
      ${tile(t("st.ranked"), s ? fmt(s.n) : "—")}
      ${tile(t("st.mean"), s ? fmt(s.mean) : "—")}
      ${tile(t("st.p90"), s ? fmt(s.p90) : "—")}
      ${tile(t("st.max"), s ? fmt(s.max) : "—")}
    </div>`;
  })}</div>`;
}

/** Histogram (frequency polygons) of CN values, with its table twin. */
export function drawDistribution(id, series) {
  $(`#${id}-legend`).innerHTML = series.length > 1 ? legend(series.map((x) => ({ color: x.color, label: x.name }))) : "";
  distributionChart($(`#${id}`), { series, binSize: BIN });
  const allBins = [...new Set(series.flatMap((x) => x.bins.map((b) => b[0])))].sort((a, b) => a - b);
  $(`#${id}-table`).innerHTML = html`<table class="data compact"><thead><tr><th>${t("col.cn")}</th>${series.map((x) => html`<th class="r">${x.name}</th>`)}</tr></thead>
    <tbody>${allBins.map((b) => html`<tr><td class="num">${fmt(b - BIN / 2)} – ${fmt(b + BIN / 2)}</td>${series.map((x) => html`<td class="r num">${fmt(x.bins.find((y) => y[0] === b)?.[1] || 0)}</td>`)}</tr>`)}</tbody></table>`;
}

/**
 * One-point-per-runner CDF. groups: [{ name, color, rows: [{lic, name, value}] }];
 * highlight (optional): { name, lics:Set, of: index of the group it sits on }.
 */
export function drawCdf(id, groups, { highlight, onClick } = {}) {
  const pos = [];
  const cdf = groups.map((g, gi) => {
    const sorted = g.rows.filter((r) => r.value != null).sort((a, b) => a.value - b.value);
    const n = sorted.length;
    pos[gi] = new Map();
    const pts = sorted.map((r, i) => { const p = [r.value, (100 * (i + 1)) / n, r.lic, r.name]; pos[gi].set(r.lic, p); return p; });
    return { name: g.name, color: g.color, data: pts, values: sorted.map((r) => r.value) };
  });
  const hl = highlight && highlight.lics.size
    ? [{ name: highlight.name, color: css("--ink"), highlight: true,
        data: [...highlight.lics].map((l) => pos[highlight.of]?.get(l)).filter(Boolean) }]
    : [];
  $(`#${id}-legend`).innerHTML = legend([
    ...cdf.map((x) => ({ color: x.color, label: x.name, dot: true })),
    ...hl.map((x) => ({ color: x.color, label: `${x.name} (${fmt(x.data.length)})`, dot: true })),
  ]);
  cdfChart($(`#${id}`), { series: [...cdf, ...hl], onClick });
  const qs = [10, 25, 50, 75, 90, 95, 99];
  $(`#${id}-table`).innerHTML = html`<table class="data compact"><thead><tr><th>${t("rk.cdf.pct")}</th>${cdf.map((x) => html`<th class="r">${x.name}</th>`)}</tr></thead>
    <tbody>${qs.map((q) => html`<tr><td>${pctN(q)}</td>${cdf.map((x) => html`<td class="r num">${fmt(quantile(x.values, q / 100))}</td>`)}</tr>`)}
    <tr><td>${t("st.ranked")}</td>${cdf.map((x) => html`<td class="r num">${fmt(x.values.length)}</td>`)}</tr></tbody></table>`;
}

export async function render(main, { query }) {
  const st = store.get();
  const f = {
    month: query.date ? data.monthFor(query.date) : data.latestMonth(),
    sexe: query.sexe || "", cat: query.cat || "", club: query.club || "", dept: query.dept || "",
    ligue: query.ligue || "", q: query.q || "", podium: query.podium === "1", cf: query.cf === "1",
  };
  const terrain = st.terrain;
  const me = auth.myId() ? auth.session() : null;      // one's own row: France's licence, in France's ranking only
  // the list is ranked by one method: the first selected, or the one whose column was clicked
  let sortMethod = st.method;
  let loaded = null, table = null, foundLic = null;       // foundLic: the runner picked in the search box

  function syncUrl() {
    replaceQuery({
      date: f.month.slice(0, 7) === data.latestMonth().slice(0, 7) ? null : f.month.slice(0, 7),
      sort: sortMethod === store.get().methods[0] ? null : sortMethod, sexe: f.sexe, cat: f.cat, club: f.club, dept: f.dept,
      ligue: f.ligue, q: f.q, podium: f.podium ? "1" : null, cf: f.cf && champs().length ? "1" : null,
    });
  }

  // a qualification's tooltip: the championship, the threshold of the runner's category, their official CN
  function cfTip(k, season, r) {
    const q = r.cf?.[k];
    const disc = t(`terrain.${cfqual.CHAMPS[k].terrain}`);
    const v = { champ: t(`rk.cf.name.${k}`), year: season.year, cat: fmtCat(r.cat), s: fmt(q?.s), cn: fmt(q?.cn), disc, day: fmtDate(season.cnDay) };
    const status = q?.st === "na" ? t("rk.cf.st.na", v) : q?.s === 0 ? "" : q?.st === "ok" ? t("rk.cf.st.ok", v)
      : q?.cn == null ? t("rk.cf.st.none", v) : t("rk.cf.st.no", v);
    const rule = q?.st === "na" ? "" : q.s === 0 ? t("rk.cf.ruleAll", v) : q.s === 1 ? t("rk.cf.ruleAny", v) : t("rk.cf.rule", v);
    return [`${v.champ} ${season.year}`, status, rule, q?.cn != null && q.st !== "na" ? t("rk.cf.yourCn", v) : ""].filter(Boolean).join("\n");
  }
  // France's three individual championships — MD and LD on the official forest CN, the sprint's on the official sprint CN —,
  // shown for every runner whatever the discipline listed: green at or above the threshold FFCO last published for that
  // month's season (cfqual.js), red below it; none before 2026
  let officialCn = null;                                  // { For: Map, Spr: Map } (licence -> official CN) of the month
  const champs = () => (data.loadedCountry() === "FR" ? cfqual.ALL_CHAMPS : [])
    .map((k) => ({ k, season: cfqual.seasonFor(k, f.month) })).filter((c) => c.season);
  const qualOf = (r) => Object.fromEntries(champs().map(({ k, season }) => {
    const cn = officialCn?.[cfqual.CHAMPS[k].terrain]?.get(r.lic) ?? null;
    return [k, { ...cfqual.standing(season, r.cat, cn), cn }];
  }));

  // France's licences and FFCO's club numbers; another country's runner numbers and club keys are Ozimut's own: not shown
  const fr = data.loadedCountry() === "FR";
  const fedName = country.info(data.loadedCountry())?.federation || "";
  // (the progressions compare a year with the one before: not from a country's public copy, data.isPublicCopy)
  const tabs = [["classement", t("rk.tab.list")], ["repartition", t("rk.tab.dist")], ...(data.isPublicCopy() ? [] : [["progres", t("rk.tab.progress")]]),
    // a country whose federation's ranking is a table of its own (Spain's FEDO; France's is the official CN, a method)
    ...(country.info(data.loadedCountry())?.official_table ? [["federation", t("rk.tab.fed", { f: fedName })]] : [])];
  const tab = tabFrom(tabs, query);
  main.innerHTML = html`
    <div class="page-head">
      <div><h1>${t("rk.title")}</h1><p class="lede">${t("rk.lede")}</p></div>
      <div class="row">
        <button class="btn csv-btn" type="button" id="export">${t("rk.export")}</button>
        <button class="btn" type="button" id="find-me" hidden></button>
        <a class="btn btn-primary" href="#/comparer" id="go-compare">${t("rk.compare")}</a>
      </div>
    </div>
    ${pageTabs(tabs, tab)}
    ${filterFold(html`<div class="filters" id="filters"></div>`)}
    <div id="notice"></div>
    <div id="stats"></div>
    <div data-panel="classement">
      <section class="card" id="list-card">
        <div class="card-head">
          <div><h2 id="list-title"></h2><div class="hint">${t("rk.sortHint")}</div><div class="hint" id="cf-hint" hidden></div></div>
        </div>
        <div id="list"></div>
      </section>
    </div>
    <div data-panel="repartition">
      <div class="grid grid-2" style="margin-bottom:16px">
        ${chartCard({ id: "dist", title: t("rk.dist"), hint: t("rk.dist.hint"), short: true })}
        ${chartCard({ id: "gdist", title: t("rk.gdist"), hint: t("rk.gdist.hint"), short: true })}
      </div>
      ${chartCard({ id: "cdf", title: t("rk.cdf"), hint: t("rk.cdf.hint") })}
    </div>
    <div data-panel="federation"><div id="fed"></div></div>
    <div data-panel="progres">
      <section class="card"><div class="card-head"><div><h2>${t("ov.progress")}</h2><div class="hint" id="prog-hint"></div></div></div>
        <div id="prog"></div></section>
    </div>`;
  ["dist", "gdist", "cdf"].forEach((id) => bindChartCard(main, id));

  function drawFilters(rows) {
    const clubs = new Map();
    rows.forEach((r) => { if (r.clubCode) clubs.set(r.clubCode, data.clubName(r.club)); });
    const clubOpts = [...clubs.entries()].sort((a, b) => a[1].localeCompare(b[1]));
    const ligues = [...new Set(rows.map((r) => r.ligue).filter(Boolean))].sort();
    const depts = [...new Set(rows.map((r) => r.dept).filter(Boolean))].sort();
    $("#filters").innerHTML = html`${terrainField()}
      ${dateControls(f.month)}
      <label class="field"><span>${t("f.sexe")}</span>
        <select id="f-sexe"><option value="">${t("sexe.all")}</option>
          <option value="H" ${raw(f.sexe === "H" ? "selected" : "")}>${t("sexe.H")}</option>
          <option value="D" ${raw(f.sexe === "D" ? "selected" : "")}>${t("sexe.D")}</option></select></label>
      <label class="field"><span>${t("f.cat")}</span>
        <select id="f-cat"><option value="">${t("f.all")}</option>${AGES.map((a) => html`<option value="${a}" ${raw(a === f.cat ? "selected" : "")}>${a}</option>`)}</select></label>
      <label class="field"><span>${t("f.club")}</span>
        <select id="f-club" style="max-width:230px"><option value="">${t("f.allm")}</option>${clubOpts.map(([c, n]) => html`<option value="${c}" ${raw(c === f.club ? "selected" : "")}>${fr ? `${c} - ${n}` : n}</option>`)}</select></label>
      ${fr && depts.length ? html`<label class="field"><span>${t("f.dept")}</span>
        <select id="f-dept" style="max-width:170px"><option value="">${t("f.allm")}</option>${depts.map((d) => html`<option value="${d}" ${raw(d === f.dept ? "selected" : "")}>${d} - ${data.deptName(d)}</option>`)}</select></label>` : ""}
      <label class="field"><span>${fr ? t("f.ligue") : regionWord()}</span>
        <select id="f-ligue" style="max-width:170px"><option value="">${t("f.all")}</option>${ligues.map((l) => html`<option value="${l}" ${raw(l === f.ligue ? "selected" : "")}>${l} - ${data.ligueName(l)}</option>`)}</select></label>
      <label class="field"><span>${t("f.name")}</span><input type="search" id="f-q" value="${f.q}" style="width:150px"></label>
      <label class="checkline"><input type="checkbox" id="f-podium" ${raw(f.podium ? "checked" : "")}>${t("f.podiums")}</label>
      ${champs().length ? html`<label class="checkline" title="${t("rk.cf.filterTip")}"><input type="checkbox" id="f-cf" ${raw(f.cf ? "checked" : "")}>${t("rk.cf.filter")}</label>` : ""}
      <button class="btn btn-ghost" type="button" id="f-reset">${t("f.reset")}</button>`;
    bindDateControls(main, (m) => { f.month = m; reload(); });
    for (const k of ["sexe", "cat", "club", "dept", "ligue"]) {
      $(`#f-${k}`)?.addEventListener("change", (e) => { f[k] = e.target.value; refresh(); });
    }
    $("#f-q").addEventListener("input", debounce((e) => { f.q = e.target.value; refresh(); }, 180));
    $("#f-podium").addEventListener("change", (e) => { f.podium = e.target.checked; refresh(); });
    $("#f-cf")?.addEventListener("change", (e) => { f.cf = e.target.checked; refresh(); });
    $("#f-reset").addEventListener("click", () => {
      Object.assign(f, { sexe: "", cat: "", club: "", dept: "", ligue: "", q: "", podium: false, cf: false });
      drawFilters(loaded.rows);
      refresh();
    });
  }

  async function reload() {
    foundLic = null;
    $("#list-card").classList.add("loading-veil");
    const ms = store.get().methods;
    // the qualification is FFCO's: the official CN of each championship's discipline, whichever method and discipline the list shows
    const cfTerrains = [...new Set(champs().map(({ k }) => cfqual.CHAMPS[k].terrain))];
    let maps;
    [loaded, ...maps] = await Promise.all([
      loadRanking(ms, terrain, f.month),
      ...cfTerrains.map((tr) => data.cnAt("official", tr, f.month)),
    ]);
    officialCn = Object.fromEntries(cfTerrains.map((tr, i) => [tr, maps[i]]));
    for (const r of loaded.rows) r.cf = qualOf(r);
    $("#list-card").classList.remove("loading-veil");
    drawFilters(loaded.rows);
    refresh();
  }

  function refresh() {
    const methods = store.get().methods;
    const cfs = champs();
    const rows = applyFilters(loaded.rows, f, sortMethod)
      .filter((r) => methods.some((m) => r.cn[m] != null))
      .filter((r) => !f.cf || !cfs.length || cfs.some(({ k }) => r.cf?.[k]?.st === "ok"));
    syncUrl();
    const year = Number(f.month.slice(0, 4));
    const notes = [];
    const foot = data.FOOT.includes(terrain);           // VTT and ski: one official ranking all along
    if (foot && methods.includes("official") && year < data.meta().split_year) notes.push(t("rk.noted2026"));
    if (foot && methods.includes("official") && year >= data.meta().split_year) notes.push(t("rk.official2026"));
    $("#notice").innerHTML = notes.map((n) => html`<div class="notice info">${n}</div>`).join("");

    $("#stats").innerHTML = statRows(methods, (m) => rows.map((r) => r.cn[m]));

    // charts beside the list: the filtered set, the whole field, and the CDF
    drawDistribution("dist", methods.map((m) => ({
      name: t("chart.cn"), color: methodColor(m), bins: bins(rows.map((r) => r.cn[m]).filter((v) => v != null)),
    })));
    drawDistribution("gdist", methods.map((m) => ({
      name: t("chart.cn"), color: methodColor(m), bins: bins(loaded.rows.map((r) => r.cn[m]).filter((v) => v != null)),
    })));
    const filteredSet = new Set(rows.filter((r) => r.cn[sortMethod] != null).map((r) => r.lic));
    const nAll = loaded.rows.filter((r) => r.cn[sortMethod] != null).length;
    drawCdf("cdf", methods.map((m) => ({
      name: t("chart.cn"), color: methodColor(m), rows: loaded.rows.map((r) => ({ lic: r.lic, name: r.name, value: r.cn[m] })),
    })), {
      highlight: filteredSet.size < nAll ? { name: t("rk.cdf.filtered"), lics: filteredSet, of: methods.indexOf(sortMethod) } : null,
      onClick: (lic) => { location.hash = link.runner(lic); },
    });

    // the list, ranked by sortMethod
    const ranked = [...rows].sort((a, b) => (b.cn[sortMethod] ?? -1) - (a.cn[sortMethod] ?? -1));
    ranked.forEach((r, i) => { r.pos = r.cn[sortMethod] != null ? i + 1 : null; });
    $("#list-title").textContent = `${fmt(ranked.filter((r) => r.pos).length)} ${t("rk.count")} — ${fmtDate(f.month)}`;
    $("#cf-hint").hidden = !cfs.length;
    if (cfs.length) {
      $("#cf-hint").textContent = t("rk.cf.hint", {
        list: cfs.map(({ k, season }) => t("rk.cf.hintOne", { s: t(`rk.cf.short.${k}`), champ: t(`rk.cf.name.${k}`), year: season.year, day: fmtDate(season.cnDay) })).join(" · "),
      });
    }
    const cols = [
      { key: "sel", label: raw('<span class="sr-only">✓</span>'), cls: "c", render: (r) => html`<input type="checkbox" data-sel="${r.lic}" ${raw(store.inCompare(r.lic) ? "checked" : "")} aria-label="${t("rn.addCompare")} ${r.name}">` },
      { key: "pos", label: t("rk.col.rank"), cls: "rank num", sort: (r) => r.pos, defaultDir: 1, render: (r) => r.pos ?? "" },
      { key: "name", label: t("rk.col.name"), sort: (r) => r.key, defaultDir: 1, render: (r) => html`<a class="name" href="${link.runner(r.lic)}">${r.name}</a>` },
      ...methods.map((m) => ({
        key: `cn_${m}`, align: "r", cls: "num",
        label: html`${t("col.cn")}${m === sortMethod ? html`<span class="arrow">▼</span>` : ""}`,
        sort: (r) => r.cn[m],
        render: (r) => r.cn[m] == null ? html`<span class="dim">—</span>`
          : html`<span class="${m === sortMethod ? "cn" : ""}">${fmt(r.cn[m])}</span>`,
      })),
      { key: "delta", label: t("rk.col.delta"), align: "r", cls: "num", sort: (r) => r.delta[sortMethod],
        render: (r) => { const d = r.delta[sortMethod]; return d == null ? html`<span class="dim">—</span>` : html`<span class="${d > 0 ? "delta-up" : d < 0 ? "delta-down" : ""}">${fmtSigned(d)}</span>`; } },
      ...(fr ? [{ key: "lic", label: t("rk.col.licence"), cls: "num dim", sort: (r) => Number(r.lic) || 0, defaultDir: 1, render: (r) => r.lic }] : []),
      { key: "cat", label: t("rk.col.cat"), sort: (r) => r.cat, defaultDir: 1 },
      { key: "pct", label: t("rk.col.pct"), align: "r", cls: "num", sort: (r) => r.pct[sortMethod],
        render: (r) => (r.pct[sortMethod] == null ? html`<span class="dim">—</span>`
          : html`<span title="${t("rk.pct.tip", { p: data.fmtPct(r.pct[sortMethod]), cat: fmtCat(r.cat) })}">${data.fmtPct(r.pct[sortMethod])}</span>`) },
      ...(cfs.length ? [{ key: "cf", label: html`<span title="${t("rk.cf.colTip")}">${t("rk.col.cf")}</span>`, cls: "nowrap",
        sort: (r) => cfs.filter(({ k }) => r.cf?.[k]?.st === "ok").length,
        render: (r) => html`${cfs.map(({ k, season }) => html`<span class="tag tag-cf tag-cf-${r.cf?.[k]?.st || "na"}" title="${cfTip(k, season, r)}">${t(`rk.cf.short.${k}`)}</span> `)}` }] : []),
      fr ? { key: "club", label: t("rk.col.club"), cls: "num", sort: (r) => r.clubCode, defaultDir: 1,
        render: (r) => r.clubCode ? html`<a href="${link.club(r.clubCode)}" title="${data.clubName(r.club)}">${r.clubCode}</a>` : "" }
        : { key: "club", label: t("rk.col.club"), sort: (r) => data.clubName(r.club), defaultDir: 1,
          render: (r) => r.clubCode ? html`<a href="${link.club(r.clubCode)}">${data.clubName(r.club)}</a>` : "" },
    ];
    const opts = {
      columns: cols, rows: ranked, sortKey: "pos", sortDir: 1,
      // clicking a method's column ranks the list by that method
      onSort: (key) => {
        if (!key.startsWith("cn_")) return true;
        sortMethod = key.slice(3);
        refresh();
        return false;
      },
      rowClass: (r) => [store.inCompare(r.lic) ? "selected" : "", r.lic === me?.lic ? "me" : "", r.lic === foundLic ? "found" : ""].join(" "),
      emptyText: "—",
      onRender(container) {
        $$("[data-sel]", container).forEach((cb) => cb.addEventListener("change", () => {
          const ok = store.toggleCompare(cb.dataset.sel);
          if (!ok) { cb.checked = false; alert(t("cp.max")); }
          cb.closest("tr").classList.toggle("selected", store.inCompare(cb.dataset.sel));
          updateCompareBtn();
        }));
      },
    };
    table = dataTable($("#list"), opts);
    const mine = ranked.find((r) => r.lic === me?.lic);
    $("#find-me").hidden = !mine?.pos;
    if (mine?.pos) $("#find-me").textContent = `${t("rk.findMe")} · ${ord(mine.pos)}`;

    // the biggest progressions over a year, within the current filters
    const prevMonth = loaded.prevMonth;
    $("#prog-hint").textContent = prevMonth
      ? `${fmtDate(prevMonth, "month")} → ${fmtDate(f.month, "month")}` : "";
    const prog = rows.filter((r) => r.delta[sortMethod] != null).sort((a, b) => b.delta[sortMethod] - a.delta[sortMethod]).slice(0, 10);
    dataTable($("#prog"), {
      rows: prog, sortKey: "d", sortDir: -1, emptyText: t("rk.noProgress"),
      rowClass: (r) => (r.lic === me?.lic ? "me" : ""),
      columns: [
        { key: "name", label: t("rk.col.name"), render: (r) => html`<a class="name" href="${link.runner(r.lic)}">${r.name}</a>` },
        { key: "cat", label: t("rk.col.cat") },
        { key: "cn", label: t("col.cn"), align: "r", cls: "num", render: (r) => fmt(r.cn[sortMethod]) },
        { key: "d", label: t("rk.col.delta"), align: "r", cls: "num", sort: (r) => r.delta[sortMethod],
          render: (r) => html`<b class="delta-up">${fmtSigned(r.delta[sortMethod])}</b>` },
      ],
    });
    updateCompareBtn();

    $("#export").onclick = () => downloadCsv(`cn_${terrain}_${f.month}.csv`,
      [t("csv.place"), t("csv.name"), ...(fr ? [t("csv.licence")] : []), t("csv.cat"), t("csv.club"), ...methods.map((m) => `cn_${m}`),
        ...cfs.map(({ k, season }) => `${t(`rk.cf.short.${k}`)} ${season.year}`)],
      table.rows().map((r) => [r.pos ?? "", r.nom, ...(fr ? [r.lic] : []), r.cat, fr ? r.club : data.clubName(r.club), ...methods.map((m) => r.cn[m] ?? ""),
        ...cfs.map(({ k }) => ({ ok: "1", no: "0" }[r.cf?.[k]?.st] ?? ""))]));
  }
  function updateCompareBtn() {
    const n = store.get().compare.length;
    $("#go-compare").textContent = n ? `${t("rk.compare")} (${n})` : t("rk.compare");
  }
  $("#find-me").addEventListener("click", () => {
    if (table?.goTo((r) => r.lic === me?.lic)) $("#list tr.me")?.scrollIntoView({ behavior: "smooth", block: "center" });
  });

  /** The search box chose a runner: bring them into view and highlight them (the page opens on a click on the name). */
  function pick(lic) {
    if (!table) return false;
    const r = loaded?.rows.find((x) => x.lic === lic) || data.runner(lic);
    const inList = table.goTo((x) => x.lic === lic);
    if (!inList) {
      const name = displayName(r?.nom || lic);
      $("#notice").innerHTML = html`<div class="notice">${name} ${t("rk.pick.absent")}
        <a href="${link.runner(lic)}">${t("rk.pick.open")}</a></div>`;
      return true;
    }
    foundLic = lic;
    $("#notice").innerHTML = "";
    $$("#list tr.found").forEach((tr) => tr.classList.remove("found"));
    const row = $(`#list [data-sel="${lic}"]`)?.closest("tr");
    row?.classList.add("found");
    row?.scrollIntoView({ block: "center", behavior: "smooth" });
    return true;
  }

  await reload();
  // the federation's table, drawn when its tab is first shown
  let fedDrawn = false;
  const showTab = bindPageTabs(main, tabs, tab, async (k) => {
    // the federation's table has its own choices: the Ozimut list's filters and figures give way to it
    for (const sel of ["#filters", "#stats", "#notice"]) {
      const el = $(sel)?.closest(".filters-fold") || $(sel);
      if (el) el.hidden = k === "federation";
    }
    if (k !== "federation" || fedDrawn) return;
    fedDrawn = true;
    (await import("./fedranking.js")).drawFederation($("#fed"), query);
  });
  return { title: t("rk.title"), onRunnerPick: (lic) => { showTab("classement"); return pick(lic); } };
}
