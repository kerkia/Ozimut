// « Analyse de course » (#/analyse-course, menu « Courses »; owner, 2026-10-23: the split-time analysis was buried under a
// race's page of « Résultats »): the races of the site's country whose organisers published split times, the latest first,
// each opening the analysis (pages/splits.js, #/analyse-course?course=<race>). On top, the races live now whose live results
// give split times (livesplits.js: rare — most lives give the finish only), analysed on the times received so far.

import { html, $, fmt, fmtDate, fmtFormat } from "../util.js";
import { t } from "../i18n.js";
import * as auth from "../auth.js";
import * as country from "../country.js";
import { raceFilters } from "../racefilters.js";
import { getProv } from "./provisional.js";
import { LIVE, LIVE_KEY, probe } from "../livesplits.js";

const parts = (...xs) => [...new Set(xs.filter(Boolean))].join(" · ");
const MAX_PROBE = 6;                       // live races looked at, at most (each a short connection to the relay)
export const analysisLink = (key, q = "") => `#/analyse-course?course=${encodeURIComponent(key)}${q}`;

export async function render(main, { query = {} } = {}) {
  const me = country.current() === "FR" ? auth.myId() : null;
  if (query.mes === "1" && me && !query.r) query = { ...query, r: me };      // « Mes courses seulement », before the filters
  const idx = await getProv("index.json");
  // O'Live's relays (owner, 2026-10-25: the CNE at Le Bessat) apart in the index: listed here alone, each leg a circuit
  const every = [...(idx?.races || []), ...(idx?.relays || []).map((r) => ({ ...r, relay: true }))].filter((r) => r.splits && !r.soon);
  const races = every.filter((r) => country.here(r))
    .sort((a, b) => b.date_iso.localeCompare(a.date_iso) || a.name.localeCompare(b.name));
  // the filters (racefilters.js, as on Résultats)
  const F = await raceFilters({ id: "ra", query, races, onChange: () => draw() });
  main.innerHTML = html`
    <div class="page-head"><div><h1>${t("nav.raceAnalysis")}</h1><p class="lede">${t("ra.lede")}</p></div></div>
    <div id="ra-live"></div>
    ${F.html}
    ${country.hint(every.map(country.of))}
    <section class="card"><div class="table-wrap" id="ra-table"></div></section>
    <p class="muted" style="font-size:12.5px;margin:10px 2px 0">${t("ra.def")}</p>`;
  liveNow();
  const draw = () => {
    const rows = races.filter(F.keep);
    // the format with the place and the organiser, under the name: one column less, for a phone
    $("#ra-table").innerHTML = rows.length ? html`<table class="data compact"><thead><tr><th>${t("f.date")}</th><th>${t("prov.race")}</th>
        <th class="r ra-n">${t("prov.runners")}</th></tr></thead>
      <tbody>${rows.map((r) => html`<tr><td class="num">${fmtDate(r.date_iso, "short")}</td>
        <td class="pv-race"><a href="${analysisLink(r.key)}">${r.name}</a>
          ${r.relay ? html` <span class="tag" title="${t("ra.relay.tip")}">${t("ra.relay.tag")}</span>` : ""}
          ${me && (r.lics || []).includes(me) ? html` <span class="tag" title="${t("ra.mine.tip")}">${t("ra.mine.tag")}</span>` : ""}
          ${r.ongoing ? html` <span class="lv-badge" title="${t("prov.ongoing.tip")}">${t("prov.ongoing")}</span>` : ""}
          <div class="muted" style="font-size:12px">${[parts(fmtFormat(r.epreuve), fmtFormat(r.terrain)), r.place, r.org].filter(Boolean).join(" · ")}</div></td>
        <td class="r num ra-n">${r.runners ? fmt(r.runners) : "—"}</td></tr>`)}</tbody></table>`
      : html`<div class="empty">${t(races.length ? "ra.emptyFilter" : "ra.empty")}</div>`;
  };
  F.bind();
  draw();
  return { title: t("nav.raceAnalysis") };
}

/** The races of the site's country live now (the relay's list: their last punch under liveS seconds old) whose live
 *  results give split times, as a box above the list; nothing when there are none. */
async function liveNow() {
  let comps = [], liveS = 1800;
  try { ({ comps = [], liveS = 1800 } = await (await fetch(`${LIVE}/api/live/list`, { cache: "no-cache" })).json()); } catch (e) { return; }
  const cur = country.current();
  const now = comps.filter((c) => (c[5] || "?") === cur && c[6] != null && c[6] <= liveS).sort((a, b) => a[6] - b[6]).slice(0, MAX_PROBE);
  if (!now.length) return;
  const ok = await Promise.all(now.map((c) => probe(c[0])));
  const kept = now.filter((c, i) => ok[i]);
  const box = $("#ra-live");
  if (!kept.length || !box) return;
  box.innerHTML = html`<section class="card lv-now"><div class="card-head"><div><h2><span class="lv-dot" aria-hidden="true"></span>${t("ra.live.title")}</h2>
      <div class="hint">${t("ra.live.hint")}</div></div></div>
    <div class="lv-now-list">${kept.map(([id, name, org, , , , , via]) => html`<a class="lv-now-item" href="${analysisLink(LIVE_KEY + id)}"><b>${name}</b>
      <span class="muted">${org}${via ? ` · ${via}` : ""}</span></a>`)}</div></section>`;
}
