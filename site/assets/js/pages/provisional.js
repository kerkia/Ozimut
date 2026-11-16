// Récemment: the results organisers publish, often before FFCO does, for the races of the last 30 days — found on
// liveresultat, WinSplits and the clubs' own websites (ffco_scraper/prov) — race by race, with the provisional scores
// and CNs of each method. For a race FFCO has since published, its own figures sit next to them as a check.
// The data (site/data/prov/) is served to the accounts that joined France; the others read its copy without CNs, scores or
// licences (prov/pub/, auth.provDir).

import { html, raw, $, $$, fmt, fmtDate, fmtFormat, fmtRegion, pctN, fmtCat } from "../util.js";
import { t, tn, locale } from "../i18n.js";
import * as auth from "../auth.js";
import * as data from "../data.js";
import { available, arenaMethod } from "../store.js";
import { methodShort, seg, dataTable, scoreCell, subHead, cnLabel, scoreLabel, freezeAttrs } from "../ui.js";
import { raceFilters } from "../racefilters.js";
import { link, replaceQuery } from "../app.js";
import * as country from "../country.js";
import { oChecklist, saveOChecklist } from "../startchecks.js";
import * as tracking from "../tracking.js";
import { bindRunnerPop } from "../runnerpop.js";
import { raceTabs, raceHref, isScoreRace, isScoreClass, scoreRanking } from "../arenatabs.js";

const SOURCE = { ffco: t("prov.official"), upload: t("src.upload"), liveresultat: "liveresultat", winsplits: "WinSplits", heyries: "Orientation Data", site: t("src.site"), livelox: "Livelox",
  helga: "Helga", olive: "O'Live", meosdjango: "MeOSDjango", oreplay: "O-Replay", sportident: "SPORTident Center", oresults: "OResults", direct: t("src.direct") };
const KIND = Object.fromEntries(["empty", "refused", "platform", "unparsed", "startlist", "startfile", "registration", "announcement", "coursedata"]
  .map((k) => [k, t(`kind.${k}`)]));
export const STATUS = { ok: "", mp: t("status.pm"), dnf: t("status.abandon"), dsq: t("status.disqualifie"), ot: t("status.hors_delai"), dns: t("status.dns"), nc: t("status.nc"), start: "" };
/** A results source as readers see it: who published it, and what it gives (« avec temps intermédiaires »). */
const sourceName = (d) => {
  const who = { site: t("src.siteLong"), upload: t("src.uploadLong"), liveresultat: t("src.liveLong"), winsplits: "WinSplits",
    heyries: "Orientation Data", helga: "Helga", direct: t("src.directLong") }[d.source] || SOURCE[d.source] || d.source;
  const what = d.kind === "startlist" ? t("kind.startlist") : d.classes?.some((k) => k.runners.some((r) => r.splits)) ? t("kind.splits")
    : d.by === "category" ? t("kind.byCategory") : t("kind.byCircuit");
  return `${who} · ${what}`;
};
/** A runner's club: the file's, else — a file without clubs — that of the runner recognised, from the CN data. */
const clubOf = (r) => {
  if (r.club_code) return { code: r.club_code, name: r.club || data.clubName(r.club_code) };
  const own = r.lic ? data.runner(r.lic)?.club : null, code = own ? data.clubParts(own).code : null;
  return code ? { code, name: data.clubName(own) } : { code: null, name: r.club || "" };
};
const TERRAIN_CODE = { "Forêt": "For", Sprint: "Spr", VTT: "VTT", Ski: "Ski" };     // the data's names (i18n-ignore)
/** A start time (seconds after midnight) as 10:42 or 10:42:30. */
const startClock = (s) => (s == null ? "" : `${String(Math.floor(s / 3600)).padStart(2, "0")}:${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}${
  Math.round(s % 60) ? `:${String(Math.round(s % 60)).padStart(2, "0")}` : ""}`);

export const getProv = async (path) => {
  const r = await fetch(`${auth.provDir()}${path}`, { credentials: "same-origin", cache: "no-store" });
  const out = r.ok && (r.headers.get("content-type") || "").includes("json") ? await r.json() : null;
  // the races of a country only the administrators see (Canada for now: the gate refuses their files to the others)
  if (out && Array.isArray(out.races)) out.races = out.races.filter((x) => !x.country || country.access(x.country) !== "admins" || auth.sees(x.country));
  return out;
};
export const clock = (s) => {
  if (s == null) return "—";
  if (s < 0) return `−${clock(-s)}`;       // a negative leg (a unit off the right time): « −11:17 »
  s = Math.round(s);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}` : `${m}:${String(sec).padStart(2, "0")}`;
};
// "Sprint · Sprint" (the format and the terrain) said once
const parts = (...xs) => [...new Set(xs.filter(Boolean))].join(" · ");
const runLine = (x) => `${when(x.at)}, ${x.looked} ${t("prov.run.of")} ${x.due}${x.cut ? ` (${t("prov.run.cut")})` : ""}`;
const when = (iso) => (iso ? new Date(iso).toLocaleString(locale(), { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—");

export async function render(main, { query = {} } = {}) {
  const idx = await getProv("index.json");
  if (!idx) {
    main.innerHTML = html`<div class="page-head"><div><h1>${t("prov.title")}</h1></div></div><div class="card"><div class="empty">${t("prov.none")}</div></div>`;
    return { title: t("prov.title") };
  }
  // an old « ?deposer=<race> » link: « Déposer » is its own page now
  if (query.deposer) { location.replace(`#/orga-resultats?course=${encodeURIComponent(query.deposer)}`); return { title: t("prov.title") }; }
  return query.course ? detail(main, idx, query) : list(main, idx, query);
}

// ---- the races -------------------------------------------------------------------------------------------------
async function list(main, idx, query) {
  // the races run so far (today's too): a coming race's start list is reached from « Agenda »
  const R = idx.races.filter((r) => !r.soon && country.of(r) === country.current());     // the site's country's (country.js)
  // a runner's races published by FFCO (their results are « Courses classées »'s): one's own races are those where one is
  // recognised in an organiser's list or in FFCO's (owner, 2026-10-17: the race of the day FFCO had published, with no
  // organiser's list read yet, was missing from one's own races)
  const ffcoOf = new Map();
  const ffcoSet = (lic) => {
    if (ffcoOf.has(lic)) return ffcoOf.get(lic);
    ffcoOf.set(lic, null);
    data.runnerRaces(lic).then((rows) => { ffcoOf.set(lic, new Set(rows.map((x) => String(x[data.R.course])))); },
      () => { ffcoOf.set(lic, new Set()); }).then(() => { if (document.contains(table)) draw(); });
    return null;
  };
  // the filters (racefilters.js, as on En direct and the analyses); « Afficher » is this page's, « pas encore publiées
  // officiellement » France's (another country's lists have no FFCO); the logged-in runner's races by default
  const fr = country.current() === "FR";
  const F = await raceFilters({ id: "pv", query, races: R, mine: true, onChange: () => draw(),
    show: [["all", t("prov.f.all")], ["found", t("prov.f.found")], ["missing", t("prov.f.missing")], ...(fr ? [["pending", t("prov.f.pending")]] : [])],
    ranBy: (r, lic) => { const s = ffcoSet(lic); return !!(s && r.ffco_id && s.has(String(r.ffco_id))); } });
  main.innerHTML = html`
    <div class="page-head"><div><h1>${t("prov.title")}</h1><p class="lede">${t("prov.lede")}</p></div></div>
    <div class="tiles tiles-compact" id="pv-tiles" style="margin-bottom:14px"></div>
    ${F.html}
    ${country.hint(idx.races.filter((r) => !r.soon).map(country.of))}
    <section class="card"><div class="table-wrap" id="pv-table"></div></section>
    <p class="muted" style="font-size:12.5px;margin:10px 2px 0">${t("prov.def")} ${t("prov.generated")} ${when(idx.generated)}.</p>
    ${idx.runs?.length ? html`<details class="muted" style="font-size:12.5px;margin:8px 2px 0"><summary>${t("ui.colon", { a: t("prov.runs") })} ${runLine(idx.runs[idx.runs.length - 1])}
        ${idx.due ? html` · ${t("prov.dueNow")} ${fmt(idx.due)}` : ""}</summary>
      <div class="table-wrap" style="margin-top:6px;max-width:640px"><table class="data compact"><thead><tr><th>${t("prov.run.at")}</th><th class="r">${t("prov.run.looked")}</th>
        <th class="r">${t("prov.run.changed")}</th><th class="r">${t("prov.run.requests")}</th><th class="r">${t("prov.run.seconds")}</th><th></th></tr></thead>
      <tbody>${[...idx.runs].reverse().map((x) => html`<tr><td class="num">${when(x.at)}</td><td class="r num">${fmt(x.looked)} / ${fmt(x.due)}</td>
        <td class="r num">${fmt(x.changed)}</td><td class="r num">${fmt(x.requests)}</td><td class="r num">${fmt(x.seconds)} / ${fmt(x.budget)}</td>
        <td>${x.cut ? html`<span class="tag">${t("prov.run.cut")}</span>` : ""}${x.failed ? html` <span class="tag">${fmt(x.failed)} ${t("prov.run.failed")}</span>` : ""}</td></tr>`)}</tbody></table></div></details>` : ""}`;
  const has = (r) => r.docs || r.ffco_id;              // results, an organiser's or FFCO's
  // an account without France reads the copy without licences (auth.provDir): nothing recognised, no CN (owner, 2026-10-20)
  const FR = auth.sees("FR");
  // the tiles: the races the filters keep — the runner, the specialité, the region, the search; not « Afficher »,
  // which would make « avec résultats » 100 %
  const drawTiles = (T) => {
    const found = T.filter((r) => r.docs).length, n = T.reduce((s, r) => s + r.runners, 0), m = T.reduce((s, r) => s + r.matched, 0);
    $("#pv-tiles").innerHTML = html`
      <div class="tile"><div class="tile-label">${t("prov.races")}</div><div class="tile-value">${fmt(T.length)}</div></div>
      <div class="tile"><div class="tile-label">${t("prov.withResults")}</div><div class="tile-value">${fmt(found)}</div>
        <div class="tile-sub">${pctN(T.length ? (100 * found) / T.length : 0)}</div></div>
      <div class="tile"><div class="tile-label">${t("prov.withSplits")}</div><div class="tile-value">${fmt(T.filter((r) => r.splits).length)}</div></div>
      ${FR ? html`<div class="tile"><div class="tile-label">${t("prov.matched")}</div><div class="tile-value">${n ? pctN((100 * m) / n) : "—"}</div>
        <div class="tile-sub">${t("prov.matched.hint")}</div></div>` : ""}`;
  };
  const table = $("#pv-table");
  function draw() {
    const one = F.runner();
    const filter = F.shown;
    const kept = R.filter(F.keep);
    drawTiles(kept.filter((r) => !r.soon));         // a coming race's start list is not a result
    const rows = kept.filter((r) => filter === "all" || (filter === "found" ? has(r) : filter === "missing" ? !has(r) : !r.ffco_id));
    $("#pv-table").innerHTML = rows.length ? html`<table class="data compact"${raw(freezeAttrs(2, 0))}><thead><tr>
      <th>${t("f.date")}</th><th>${t("prov.race")}</th><th>${t("prov.kind")}</th><th>${t("prov.sources")}</th>
      <th class="r">${t("prov.runners")}</th>${FR ? html`<th class="r">${t("prov.matchedShort")}</th>` : ""}<th class="c pv-wrap">${t("prov.splits")}</th>
      <th>${t("prov.official")}</th></tr></thead>
      <tbody>${rows.map((r) => html`<tr${raw(has(r) ? "" : ' class="pv-none"')}>
        <td class="num">${fmtDate(r.date_iso, "short")}</td>
        <td class="pv-race">${r.docs || r.startlist ? html`<a href="#/resultats?course=${encodeURIComponent(r.key)}${one ? `&r=${encodeURIComponent(one)}` : ""}">${r.name}</a>`
          : r.ffco_id ? html`<span>${r.name}</span> <span class="tag" title="${t("prov.ffcoResults")}">${t("prov.ffcoTag")}</span>` : html`<span>${r.name}</span>`}
          ${r.soon ? html` <span class="tag" style="color:var(--accent)">${t("prov.soon")}</span>` : ""}
          ${r.ongoing ? html` <span class="lv-badge" title="${t("prov.ongoing.tip")}">${t("prov.ongoing")}</span>` : ""}
          <div class="muted" style="font-size:12px">${[r.place, r.org, fmtRegion(r.region)].filter(Boolean).join(" · ")}</div></td>
        <td class="pv-wrap">${parts(fmtFormat(r.epreuve), fmtFormat(r.terrain))}${r.cn || !FR || country.of(r) !== "FR" ? "" : html` <span class="tag">${t("prov.notCn")}</span>`}</td>
        <td class="pv-wrap">${r.sources.length ? r.sources.map((s) => html`<span class="tag">${SOURCE[s] || s}</span> `)
          : r.ffco_id ? html`<span class="muted">—</span>` : html`<span>${r.refused ? t("prov.refusedOnly") : t("prov.noResult")}</span>`}
          ${r.site === false && country.of(r) === "FR" ? html`<div class="muted" style="font-size:11.5px" title="${t("prov.noSite.hint")}">${t("prov.noSite")}</div>` : ""}</td>
        <td class="r num">${r.runners ? fmt(r.runners) : "—"}</td>
        ${FR ? html`<td class="r num">${r.runners ? pctN((100 * r.matched) / r.runners) : "—"}</td>` : ""}
        <td class="c">${r.splits ? html`<a href="#/analyse-course?course=${encodeURIComponent(r.key)}" title="${t("nav.raceAnalysis")}">${t("prov.seeSplits")}</a>` : ""}</td>
        <td>${r.ffco_id ? html`<a href="https://cn.ffcorientation.fr/course/${r.ffco_id}/" target="_blank" rel="noopener">${t("prov.published")}</a>`
          : r.soon ? "" : html`<span class="muted">${t("prov.waiting")}</span>`}</td></tr>`)}</tbody></table>`
      : html`<div class="empty">${t(one ? "prov.emptyRunner" : "prov.empty")}</div>`;
  }
  F.bind();
  draw();
  return { title: t("prov.title") };
}

// ---- one race -------------------------------------------------------------------------------------------------
async function detail(main, idx, query) {
  const [race, tracks] = await Promise.all([getProv(`${encodeURIComponent(query.course)}.json`), tracking.links()]);
  if (!race) {
    main.innerHTML = html`<div class="notice">${t("prov.notFound")}</div>`;
    return { title: t("prov.title") };
  }
  const docs = race.docs.filter((d) => d.classes?.length);
  // France's CN and its runners' licences: for France's members, on a race of France (a declared race elsewhere has neither)
  const CN = auth.sees("FR") && country.of(race) === "FR";
  // the document shown first: the build's order (the organiser's files before the platforms, liveresultat last)
  const rank = (d) => d.prio ?? (d.by !== "category" ? 1e6 : 0) + d.classes.reduce((n, k) => n + k.runners.length, 0);
  let di = Math.max(0, Number.isInteger(Number(query.doc)) && docs[Number(query.doc)] ? Number(query.doc)
    : docs.indexOf([...docs].sort((a, b) => rank(b) - rank(a))[0]));
  let ci = Number(query.c) || 0;
  // both views of a list of results: by circuit (how it is scored) and by category — a list by category gets its
  // circuits (d.circuits) once known, a list by circuit giving runners' categories its categories (d.catview)
  let byCat = query.vue === "categorie";
  const views = (d) => (d.circuits?.length ? { circ: d.circuits, cat: d.classes } : d.catview?.length ? { circ: d.classes, cat: d.catview } : null);
  const groupsOf = (d) => (views(d) ? views(d)[byCat ? "cat" : "circ"] : d.classes);
  const who = query.r || null;
  // a runner named (r=…): their group, in the document asked for if any (a class number from another view means nothing)
  if (who && !groupsOf(docs[di])[ci]?.runners.some((r) => r.lic === who)) {
    const found = docs.flatMap((d, i) => groupsOf(d).map((k, j) => [i, j, k])).filter(([i, , k]) => k.runners.some((r) => r.lic === who)
      && (query.doc == null || i === di));
    const best = found.find(([i]) => docs[i].by !== "category" || docs[i].circuits?.length) || found[0];
    if (best) [di, ci] = best;
  }
  const M = [arenaMethod()];
  // the live GPS tracking its organiser linked (« Organisation › Direct »): by the race's key or its agenda event's
  const agendaId = race.agenda_id || idx?.races?.find((r) => r.key === race.key)?.agenda_id;
  const track = tracking.linkOf(tracks, race.key, agendaId && `a${agendaId}`);
  // the splits page lists only the documents with split times: its own indexes
  const withSplits = race.docs.filter((d) => d.classes?.some((k) => k.runners.some((r) => r.splits)));

  // the way back to Arena's list of competitions (owner, 2026-10-30), which comes back where it was (agenda.js memo)
  main.innerHTML = html`
    <a class="back-link arena-back" href="#/agenda">‹ ${t("arena.back")}</a>
    <div class="page-head race-head"><div><h1>${race.name}</h1>
      <p class="lede">${fmtDate(race.date_iso)} · ${parts(race.place, race.org, fmtFormat(race.epreuve), fmtFormat(race.terrain))}</p></div>
      <div class="row" style="gap:8px">${tracking.button(track)}
        ${race.site ? html`<a class="btn btn-sm" href="${race.site}" target="_blank" rel="noopener">${t("prov.site")} ↗</a>` : ""}
        ${race.ffco_id ? html`<a class="btn btn-sm" href="https://cn.ffcorientation.fr/course/${race.ffco_id}/" target="_blank" rel="noopener">${t("prov.officialPage")}</a>` : ""}</div></div>
    <div data-bar-tabs>${raceTabs(race.key, withSplits.length > 0, {}, isScoreRace(race, withSplits))}</div>
    ${race.ongoing ? html`<p class="beta-note">${tn("prov.ongoingNote", race.ongoing)}</p>` : ""}
    ${docs.length ? html`<div class="filters" id="pv-pick"></div><section class="card"><div class="card-head"><div>
      <div class="hint" id="pv-class-hint"></div></div></div><div id="pv-class"></div></section>
      ${CN ? html`<p class="muted" style="font-size:12.5px;margin:10px 2px 0">${t("prov.scoreDef")}</p>` : ""}` : html`<div class="card"><div class="empty">${t(race.ffco_id ? "prov.noDoc.ffco" : "prov.noDoc.org")}</div></div>`}
    ${auth.session()?.admin ? html`<details class="card" style="margin-top:16px"><summary class="card-head" style="cursor:pointer"><h2>${t("prov.sources.admin")}</h2></summary>
      <div class="table-wrap"><table class="data compact"><thead><tr><th>${t("prov.source")}</th><th>${t("prov.doc")}</th><th>${t("prov.format")}</th>
        <th class="r">${t("prov.classes")}</th><th>${t("prov.found")}</th><th>${t("prov.changed")}</th></tr></thead>
      <tbody>${race.docs.map((d) => html`<tr${raw(d.classes?.length ? "" : ' style="opacity:.65"')}>
        <td><span class="tag">${SOURCE[d.source] || d.source}</span></td>
        <td style="max-width:420px;overflow-wrap:anywhere">${d.source === "upload" || d.source === "direct" ? html`<span>${d.title || d.url.split("/").pop()}</span>`
          : html`<a href="${d.url}" target="_blank" rel="noopener">${d.title || d.note || decodeURIComponent(d.url.split("/").pop() || d.url)}</a>`}
          ${d.note && d.title ? html`<div class="muted" style="font-size:12px">${d.note}</div>` : ""}</td>
        <td>${KIND[d.kind] || d.kind}${d.by ? html` <span class="muted">· ${t(`prov.by.${d.by}`)}</span>` : ""}</td>
        <td class="r num">${d.classes ? fmt(d.classes.length) : "—"}</td>
        <td class="num" style="font-size:12px">${when(d.found)}</td><td class="num" style="font-size:12px">${when(d.changed)}</td></tr>`)}</tbody></table></div>
      ${race.docs.length ? "" : html`<div class="empty">${t("prov.noDoc")}</div>`}</details>` : ""}`;
  if (!docs.length) return { title: race.name };
  // a runner's name opens their window (runnerpop.js): Arena's pages never lead to Stats' runner page (owner, 2026-10-30)
  const raceTerrain = TERRAIN_CODE[race.terrain] || "For";
  const popName = (r) => html`<button type="button" class="name name-pop" data-runner-pop="${r.lic}" data-name="${r.name}"
    data-club="${clubOf(r).name || r.club || ""}" data-cat="${r.category || r.catCn || ""}" data-terrain="${raceTerrain}">${r.name}</button>`;
  bindRunnerPop(main);

  function draw() {
    const d = docs[di];
    const groups = groupsOf(d), asCircuits = !!views(d) && !byCat;
    ci = Math.min(ci, groups.length - 1);
    const k = groups[ci];
    replaceQuery({ course: race.key, doc: di || null, c: ci || null, r: who, vue: views(d) && byCat ? "categorie" : null });
    $("#pv-pick").innerHTML = html`
      ${docs.length > 1 && auth.session()?.admin ? html`<label class="field"><span>${t("prov.source")}</span><select id="pv-doc" style="max-width:420px">${docs.map((x, i) => html`<option value="${i}" ${raw(i === di ? "selected" : "")}>${sourceName(x)}</option>`)}</select></label>` : ""}
      ${views(d) ? html`<div class="field"><span>${t("prov.view")}</span>${seg("pvv", [["circ", t("prov.view.circ")], ["cat", t("prov.view.cat")]], byCat ? "cat" : "circ")}</div>` : ""}
      <label class="field"><select id="pv-c" aria-label="${(views(d) ? byCat : d.by === "category") ? t("prov.category") : t("prov.circuit")}">${groups.map((x, i) => html`<option value="${i}" ${raw(i === ci ? "selected" : "")}>${x.name}${asCircuits && x.categories?.length ? ` · ${x.categories.join(", ")}` : ""} (${x.runners.length})</option>`)}</select></label>
`;
    const si = withSplits.indexOf(d);
    $$(".race-tabs a[data-view]").forEach((a) => { a.href = raceHref(race.key, a.dataset.view, si >= 0 ? { doc: si || null, c: ci || null } : {}); });
    $("#pv-doc")?.addEventListener("change", (e) => {
      di = Number(e.target.value);
      ci = who ? Math.max(0, groupsOf(docs[di]).findIndex((g) => g.runners.some((r) => r.lic === who))) : 0;   // the runner's group
      draw();
    });
    $("#pv-c").addEventListener("change", (e) => { ci = Number(e.target.value); draw(); });
    $$('[data-seg="pvv"]').forEach((x) => x.addEventListener("click", () => {
      // the same runner's group in the other view: the circuit of the category shown, or the first category of the circuit
      const next = x.dataset.value === "cat";
      if (next === byCat) return;
      // (the runner named, if any, else the first category of the circuit, or the circuit of the category)
      const mine = who && k.runners.find((r) => r.lic === who);
      const name = next ? (mine?.category || mine?.catCn || k.categories?.[0] || k.runners.find((r) => r.category)?.category) : k.circuit;
      byCat = next;
      ci = Math.max(0, groupsOf(d).findIndex((g) => g.name === name || (who && g.runners.some((r) => r.lic === who))));
      draw();
    }));
    const v = k.values || {};
    // (no title: the circuit's selector above says its name and its runners — owner, 2026-10-31)
    $("#pv-class-hint").innerHTML = html`${[k.length_m ? `${fmt(k.length_m / 1000, 1)} km` : "", k.climb_m ? `${fmt(k.climb_m)} m D+` : "", k.controls ? `${k.controls.length} ${t("prov.controls")}` : ""].filter(Boolean).join(" · ")}
      ${!CN ? "" : d.by === "category" && !k.values ? html`<span>${t("prov.byCategory")}</span>` : html`${asCircuits && k.categories?.length ? html`${t("prov.circuitCats", { c: k.categories.join(", ") })} · ` : k.circuit ? html`${t("prov.circuitOf", { c: k.circuit })} · ` : ""}${t("prov.values")} ${M.filter((m) => m === "official" || v[m.replace("top6w3", "fair3").replace("top6w", "fair")] != null)
        .map((m) => fmt(m === "official" ? v.official : v[m === "top6w" ? "fair" : m])).join(" · ") || "—"}`}`;
    if (d.kind === "startlist") { startTable(k); return; }
    const scored = CN && (d.by !== "category" || !!k.values);      // no CN without France, nor on another country's race
    // the same table as a race's on « Courses »: per method the CN J-15, then the score with its gap to that CN; the
    // CN after the race in the score's tooltip; once the race is published, the published score below
    const ok = (r) => r.status === "ok";
    const gap = (r, m) => (ok(r) && r.scores?.[m] && r.cnj15?.[m] ? r.scores[m] - r.cnj15[m] : null);
    const pubLine = (r, m) => {
      const p = r.ffco?.[m], s = r.scores?.[m];
      return p ? html`<div class="pub">${t("prov.pub")} ${fmt(p.score)}${s != null && s !== p.score
        ? html` <span style="color:var(--bad)">(${s > p.score ? "+" : "−"}${fmt(Math.abs(s - p.score))})</span>` : ""}</div>` : "";
    };
    // a score race (a rogaine) with its split times: placed by the points of the controls taken (their number without points),
    // then the time (arenatabs.scoreRanking) — the sources' places follow the time alone; the late penalties are not known
    const sc = k.runners.some((r) => r.splits) && (/^score$/i.test(race.epreuve || "") || isScoreClass(k)) ? scoreRanking(k) : null;
    const rows = sc ? k.runners.map((r) => ({ ...r, ...sc.of.get(r) })) : k.runners;
    dataTable($("#pv-class"), {
      compact: true, rows, sortKey: "place", sortDir: 1, rowClass: (r) => (who && r.lic === who ? "selected" : ""),
      columns: [
        { key: "place", label: sc ? html`<span title="${t("spl.sc.rank")}">${t("col.place")}</span>` : t("col.place"), cls: "rank num", defaultDir: 1, sort: (r) => r.place ?? 1e6,
          render: (r) => (r.place != null ? fmt(r.place) : html`<span class="dim">${STATUS[r.status]}</span>`) },
        { key: "name", label: t("rk.col.name"), defaultDir: 1, sort: (r) => r.name,
          render: (r) => (r.lic ? popName(r)
            : CN ? html`<span title="${t("prov.unmatched")}">${r.name}</span> <span class="muted" style="font-size:11px">?</span>` : r.name) },
        { key: "cat", label: t("rk.col.cat"), defaultDir: 1, sort: (r) => r.category || r.catCn,
          render: (r) => fmtCat(r.category) || (r.catCn ? html`<span class="muted" title="${t("prov.catCn")}">${fmtCat(r.catCn)}</span>` : "") },
        { key: "club", label: t("rk.col.club"), cls: "num", defaultDir: 1, sort: (r) => clubOf(r).code || r.club,
          render: (r) => { const c = clubOf(r);
            return c.code ? html`<span title="${c.name}">${c.code}</span>` : html`<span style="font-size:12.5px">${r.club || ""}</span>`; } },
        { key: "time", label: t("col.time"), align: "r", cls: "num", defaultDir: 1, sort: (r) => (ok(r) ? r.time_s : null),
          render: (r) => (ok(r) ? clock(r.time_s) : "") },
        ...(sc ? [{ key: "n", label: t("sh.score.col.n"), align: "r", cls: "num", sort: (r) => r.n, render: (r) => fmt(r.n) },
          ...(sc.withPts ? [{ key: "pts", label: html`<span title="${t("spl.sc.pts.hint")}">${t("spl.sc.pts")}</span>`, align: "r", cls: "num", sort: (r) => r.pts, render: (r) => fmt(r.pts) }] : [])] : []),
        ...(scored ? M.flatMap((m) => [{
          key: `cn_${m}`, label: subHead(cnLabel(m), "J-15"), align: "r", cls: "num", sort: (r) => r.cnj15?.[m],
          render: (r) => (r.cnj15?.[m] ? fmt(r.cnj15[m]) : html`<span class="dim">—</span>`),
        }, {
          key: `s_${m}`, label: html`<span title="${t("res.score.hint")}">${subHead(scoreLabel(m), t("res.gap"))}</span>`,
          align: "r", cls: "num", sort: (r) => gap(r, m),
          render: (r) => scoreCell(ok(r) ? r.scores?.[m] ?? null : null, r.cnj15?.[m],
            { title: r.cnAfter?.[m] ? `${t("ui.colon", { a: t("rn.cnAfter") })} ${fmt(r.cnAfter[m])}` : "", below: pubLine(r, m) }),
        }]) : []),
      ],
    });
  }
  // a start list: the runners by start time, with their CN today (Top and official, in the race's discipline) and the
  // place the Top CN gives them among the circuit's runners
  let cnNow = null;
  async function startTable(k) {
    $("#pv-class-hint").innerHTML = html`${t(CN ? "prov.start.hint" : "prov.start.hintPlain")}`;
    // its organisers (and the administrators) take the whole list as the start's O Checklist file (2026-10-22)
    const club = auth.myClub(), org = /^\s*(\d{3,4})\b/.exec(String(race.org || ""));
    if (auth.session()?.admin || (club && org && org[1].padStart(4, "0") === club)) {
      $("#pv-class-hint").insertAdjacentHTML("beforeend", html` <button type="button" class="btn btn-sm" id="pv-oc" title="${t("prov.oc.hint")}">${t("prov.oc")}</button>`);
      $("#pv-oc").addEventListener("click", () => saveOChecklist(race.name, oChecklist(docs[di], { club: (r) => r.club || "" })));
    }
    const FR = CN;                              // without France, or another country's race: start times only
    if (!cnNow && !FR) cnNow = new Map();
    if (!cnNow) {
      const month = data.latestMonth(), tr = TERRAIN_CODE[race.terrain] || "For";
      cnNow = await data.cnAt(arenaMethod(), tr, month);      // Arena's method, today
    }
    const cn = (r) => (r.lic ? cnNow.get(String(r.lic)) ?? null : null);
    const rows = [...k.runners].sort((a, b) => (a.start_s ?? 1e9) - (b.start_s ?? 1e9) || a.name.localeCompare(b.name, "fr"));
    const ranked = rows.filter((r) => cn(r)).sort((a, b) => cn(b) - cn(a));
    const expected = new Map(ranked.map((r, i) => [r, i + 1]));
    $("#pv-class").innerHTML = html`<div class="table-wrap"><table class="data compact"${raw(freezeAttrs(2, 1))}><thead><tr>
      <th class="r">${t("prov.start")}</th><th>${t("prov.name")}</th><th>${t("prov.club")}</th><th>${t("prov.cat")}</th>
      ${FR ? html`<th class="r">${t("col.cn")}</th>
      <th class="r" title="${t("lv.expected.hint")}">${t("lv.expected")}</th>` : ""}</tr></thead>
      <tbody>${rows.map((r) => html`<tr${raw(who && r.lic === who ? ' style="background:color-mix(in srgb, var(--accent) 14%, transparent)"' : "")}>
        <td class="r num">${startClock(r.start_s)}${r.status !== "start" && r.status !== "ok" ? html` <span class="muted">${STATUS[r.status]}</span>` : ""}</td>
        <td>${r.lic ? popName(r) : CN ? html`<span title="${t("prov.unmatched")}">${r.name}</span> <span class="muted" style="font-size:11px">?</span>` : r.name}</td>
        <td style="font-size:12.5px">${clubOf(r).code ? html`<span title="${clubOf(r).name}">${clubOf(r).code}</span>` : r.club || ""}</td>
        <td>${fmtCat(r.category) || (r.catCn ? html`<span class="muted" title="${t("prov.catCn")}">${fmtCat(r.catCn)}</span>` : "")}</td>
        ${FR ? html`<td class="r num">${cn(r) ? fmt(cn(r)) : html`<span class="muted">—</span>`}</td>
        <td class="r num">${expected.get(r) ?? ""}</td>` : ""}</tr>`)}</tbody></table></div>`;
  }
  draw();
  return { title: race.name };
}
