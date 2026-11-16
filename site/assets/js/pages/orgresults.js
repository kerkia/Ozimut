// « Organisation › Résultats » (#/orga-resultats, owner 2026-10-15): the competitions of the last 60 days organised by
// one's club (all of them for an administrator), each with what « Résultats » shows of it, and a way to deposit its
// results — and split times, if any — as its organiser: a race opens its deposit here (#/orga-resultats?course=…, the
// three steps of pages/deposit.js; owner, 2026-10-15: depositing is the organisers' alone, « Courses › Résultats » is the
// runners'), the server checks the account belongs to the organising club (functions/api/upload.js), and the race is then no
// longer looked for on the club's site or the platforms (ffco_scraper/prov/sources/upload.py): its organiser's file is
// used as it is. An organiser is a member of the race's organising club, from the account's latest race; outside France,
// the account that declared the competition (declare.js, owner 2026-10-20), its declared competitions listed with the club's.

import { html, raw, $, fmtDate } from "../util.js";
import { betaTag, betaNote } from "../beta.js";
import { t } from "../i18n.js";
import * as auth from "../auth.js";
import { getProv } from "./provisional.js";
import * as declare from "../declare.js";

const orgCode = (org) => { const m = /^\s*(\d{3,4})\b/.exec(String(org || "")); return m ? m[1].padStart(4, "0") : null; };
const norm = (s) => (s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
const SOURCE = { upload: t("src.uploadShort"), site: t("src.site"), winsplits: "WinSplits", heyries: "Orientation Data", helga: "Helga", liveresultat: "liveresultat", meosdjango: "MeOSDjango", olive: "O'Live", oreplay: "O-Replay", sportident: "SPORTident Center", oresults: "OResults", direct: t("src.direct") };

export async function render(main, { query = {} } = {}) {
  const me = auth.session(), club = auth.myClub();
  const today = new Date().toISOString().slice(0, 10);
  const idx = await getProv("index.json");
  const all = (idx?.races || []).filter((r) => !r.soon && r.date_iso <= today)
    .sort((a, b) => b.date_iso.localeCompare(a.date_iso) || a.name.localeCompare(b.name, "fr"));
  const byClub = me?.admin ? all : all.filter((r) => club && orgCode(r.org) === club);
  // the competitions the account declared (outside France), run already: as the list has them, else as declared
  const D = await declare.load();
  const known = new Map(all.map((r) => [r.key, r]));
  const mine = [...byClub, ...D.competitions.filter((d) => d.date <= today && !byClub.some((r) => r.key === d.key))
    .map((d) => known.get(d.key) || declare.asRace(d))].sort((a, b) => b.date_iso.localeCompare(a.date_iso) || a.name.localeCompare(b.name));
  // a race: its deposit, here (the organiser's flow, not « Résultats »)
  if (query.course) {
    const race = mine.find((r) => r.key === query.course);
    if (!race) {
      main.innerHTML = html`<div class="card"><div class="empty">${t("or.notMine")}</div></div>`;
      return { title: t("or.title") };
    }
    const dep = await import("./deposit.js");
    return dep.render(main, { query: { ...query, orga: "1" }, organiser: race });
  }
  main.innerHTML = html`
    <div class="page-head"><div><h1>${t("or.title")} ${raw(betaTag())}</h1><p class="lede">${t("or.lede")}</p></div></div>
    ${raw(betaNote("results"))}
    <div id="dc-card"></div>
    ${me?.admin ? html`<div class="filters"><label class="field"><span>${t("sh.org.filter")}</span><input id="or-filter" placeholder="${t("sh.org.filter.ph")}" style="width:240px"></label></div>` : ""}
    <section class="card"><div class="table-wrap" id="or-list"></div></section>
    <p class="muted" style="font-size:12.5px;margin:10px 2px 0">${t("or.hint")}</p>`;
  const draw = (q = "") => {
    const list = q ? mine.filter((r) => norm(`${r.name} ${r.org || ""} ${r.place || ""}`).includes(norm(q))) : mine;
    $("#or-list").innerHTML = list.length ? html`<table class="data compact"><thead><tr><th>${t("f.date")}</th><th>${t("prov.race")}</th><th>${t("sh.org.col.org")}</th>
        <th>${t("or.col.now")}</th><th></th></tr></thead>
      <tbody>${list.map((r) => html`<tr><td class="num">${fmtDate(r.date_iso, "short")}</td>
        <td><a href="#/orga-resultats?course=${encodeURIComponent(r.key)}">${r.name}</a>${r.place ? html` <span class="muted">· ${r.place}</span>` : ""}</td>
        <td class="muted">${r.org || "—"}</td>
        <td>${r.docs ? html`${t("or.now", { n: r.runners || 0 })}${r.splits ? ` · ${t("or.splits")}` : ""} <span class="muted">(${(r.sources || []).map((s) => SOURCE[s] || s).join(", ")})</span>` : html`<span class="muted">${t("or.nothing")}</span>`}</td>
        <td class="r"><a class="btn btn-sm btn-primary" href="#/orga-resultats?course=${encodeURIComponent(r.key)}">${t("or.deposit")}</a></td></tr>`)}</tbody></table>`
      : html`<div class="empty">${club || me?.admin ? t("or.none", { club: club || "—" }) : !auth.sees("FR") ? t("sh.org.noCountry") : t("sh.org.noclub")}</div>`;
  };
  draw();
  $("#or-filter")?.addEventListener("input", (e) => draw(e.target.value));
  declare.card($("#dc-card"), { onChange: () => render(main, { query }) });
  return { title: t("or.title") };
}
