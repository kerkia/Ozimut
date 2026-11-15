// Statistiques › « Les plus actifs » (owner, 2026-11-15): the runners who race the most, every type of race together, with
// the count of each type (forest LD, MD and night, sprint, VTT, ski), their category and club — as a palmarès: over every
// season, the last one and the current one. The counts come from site_extras.most_races (mostraces.json): each period's
// first runners of each sex and group of categories, ranked here again within the filters.

import { html, raw, $, $$, fmt, fmtCat, fmtDate, displayName } from "../util.js";
import { t, tn } from "../i18n.js";
import * as data from "../data.js";
import * as auth from "../auth.js";
import { dataTable, seg, tile, filterFold } from "../ui.js";
import { link, replaceQuery } from "../app.js";
import { netHead } from "./netmodes.js";

const ageOf = (cat) => Number(/\d+/.exec(cat || "")?.[0] || 0);
const GROUPS = { all: () => true, elite: (c) => ageOf(c) === 21, young: (c) => ageOf(c) > 0 && ageOf(c) <= 20, vet: (c) => ageOf(c) >= 35 };
const medal = (p) => (p && p <= 3 ? html`<span class="rh-med rh-med-${p}" aria-hidden="true"></span>` : "");

export async function render(main, query) {
  main.innerHTML = html`${netHead("most", t("nw.mode.most"), t("mr.lede"))}<div class="loading">${t("misc.loading")}</div>`;
  const file = await data.mostRaces().catch(() => null);
  if (!file?.periods?.all) {
    main.innerHTML = html`<div class="notice">${t("mr.none")}</div>`;
    return;
  }
  const types = file.types;
  const keys = Object.keys(file.periods).sort((a, b) => (a === "all" ? -1 : b === "all" ? 1 : Number(b) - Number(a)));
  const current = String(Math.max(...keys.filter((k) => k !== "all").map(Number)));
  const fr = data.loadedCountry() === "FR";
  const myId = auth.myId();
  const f = {
    p: keys.includes(query.p) ? query.p : "all",
    sex: ["H", "D"].includes(query.sexe) ? query.sexe : "",
    grp: GROUPS[query.grp] ? query.grp : "all",
  };
  const periodName = (k) => (k === "all" ? `${t("mr.period.all")} (${file.periods.all.from}–${file.periods.all.to})`
    : t(k === current ? "mr.period.current" : "mr.period.season", { y: k }));
  const clubCell = (club) => {
    const p = data.clubParts(club);
    if (!p.code) return club ? data.clubName(club) || club : "";
    return fr ? html`<a href="${link.club(p.code)}" title="${data.clubName(club)}">${p.code}</a>`
      : html`<a href="${link.club(p.code)}">${data.clubName(club)}</a>`;
  };

  function draw() {
    replaceQuery({ vue: "actifs", p: f.p === "all" ? null : f.p, sexe: f.sex || null, grp: f.grp === "all" ? null : f.grp });
    const per = file.periods[f.p];
    const rows = per.rows
      .map(([lic, n, counts, cat, club, seasons, first, last]) => {
        const r = data.runner(lic);
        return { lic, n, counts, cat, club, seasons, first, last, name: r ? displayName(r.nom) : lic, code: data.clubParts(club).code };
      })
      .filter((r) => (!f.sex || r.cat.startsWith(f.sex)) && GROUPS[f.grp](r.cat));
    // the rank: equal counts share a place, as on a podium
    rows.forEach((r, i) => { r.rank = i && rows[i - 1].n === r.n ? rows[i - 1].rank : i + 1; });
    const used = types.map((_, k) => rows.some((r) => r.counts[k]));      // a type nobody ran in the period has no column
    const top = rows[0];
    const el = $("#mr-view", main);
    el.innerHTML = html`
      ${filterFold(html`<div class="filters">
        <div class="field"><span>${t("mr.f.period")}</span>${seg("mrp", keys.map((k) => [k, k === "all" ? t("mr.period.all") : k]), f.p)}</div>
        <div class="field"><span>${t("ch.f.sex")}</span>${seg("mrs", [["", t("ch.sex.all")], ["H", t("ch.sex.H")], ["D", t("ch.sex.D")]], f.sex)}</div>
        <label class="field"><span>${t("rh.f.cat")}</span><select id="mr-grp">
          ${Object.keys(GROUPS).map((g) => html`<option value="${g}" ${raw(g === f.grp ? "selected" : "")}>${t(`ch.grp.${g}`)}</option>`)}</select></label>
      </div>`)}
      <div class="tiles" style="margin-bottom:16px">
        ${tile(t("mr.tile.runners"), fmt(per.runners))}
        ${tile(t("mr.tile.results"), fmt(per.results))}
        ${tile(t("mr.tile.mean"), fmt(per.runners ? per.results / per.runners : 0, 1))}
        ${top ? tile(t("mr.tile.most"), top.name, tn("mr.races", top.n)) : ""}
      </div>
      <section class="card">
        <div class="card-head"><div><h2>${t("mr.card", { period: periodName(f.p) })}</h2>
          <div class="hint">${t("mr.hint", { n: fmt(file.top || 200) })}</div></div></div>
        <div id="mr-list"></div>
      </section>`;
    const num = (v) => (v ? fmt(v) : html`<span class="dim">·</span>`);
    dataTable($("#mr-list", el), {
      rows, sortKey: "rank", sortDir: 1,
      rowClass: (r) => (myId && String(r.lic) === String(myId) ? "me" : ""),
      columns: [
        { key: "rank", label: t("rh.col.rank"), cls: "rank num", sort: (r) => r.rank, defaultDir: 1, render: (r) => html`${medal(r.rank)}${r.rank}` },
        { key: "name", label: t("ch.col.runner"), sort: (r) => r.name.toLowerCase(), defaultDir: 1,
          render: (r) => html`<a class="name" href="${link.runner(r.lic)}">${r.name}</a>` },
        { key: "cat", label: t("mr.col.cat"), sort: (r) => r.cat, defaultDir: 1, render: (r) => fmtCat(r.cat) },
        { key: "club", label: t("rh.col.club"), sort: (r) => (fr ? r.code : data.clubName(r.club)) || "~", defaultDir: 1, render: (r) => clubCell(r.club) },
        { key: "n", label: t("mr.col.total"), align: "r", cls: "num", sort: (r) => r.n, render: (r) => html`<b>${fmt(r.n)}</b>` },
        ...types.map((ty, k) => (used[k] ? { key: `t${k}`, label: html`<span title="${t(`mr.tip.${ty}`)}">${t(`mr.type.${ty}`)}</span>`,
          align: "r", cls: "num", sort: (r) => r.counts[k], render: (r) => num(r.counts[k]) } : null)).filter(Boolean),
        ...(f.p === "all" ? [{ key: "seasons", label: t("mr.col.seasons"), align: "r", cls: "num", sort: (r) => r.seasons }] : []),
        { key: "span", label: t("mr.col.span"), cls: "num dim", sort: (r) => r.first, defaultDir: 1,
          render: (r) => (f.p === "all" ? (r.first.slice(0, 4) === r.last.slice(0, 4) ? r.first.slice(0, 4) : `${r.first.slice(0, 4)}–${r.last.slice(0, 4)}`)
            : `${fmtDate(r.first, "short")} – ${fmtDate(r.last, "short")}`) },
      ],
    });
    $$('[data-seg="mrp"]', el).forEach((b) => b.addEventListener("click", () => { f.p = b.dataset.value; draw(); }));
    $$('[data-seg="mrs"]', el).forEach((b) => b.addEventListener("click", () => { f.sex = b.dataset.value; draw(); }));
    $("#mr-grp", el).addEventListener("change", (e) => { f.grp = e.target.value; draw(); });
  }
  main.innerHTML = html`${netHead("most", t("nw.mode.most"), t("mr.lede"))}<div id="mr-view"></div>`;
  draw();
  return { title: `${t("nav.network")} · ${t("nw.mode.most")}` };
}
