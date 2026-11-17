// The admin page's « Vitesse » tab (2026-11-17): how fast the site is, from what the page views say (app.js track,
// functions/_lib/perf.js, /api/admin/perf) — a page's time to show (the first of a visit, the others), the slowest reaction
// to a click, a tick or a key on a page, by page and by build of the code, and the texts a page had to load late.
import { $, html, raw, fmt, fmtDate, pct } from "../util.js";
import { t } from "../i18n.js";
import { dataTable } from "../ui.js";

const KINDS = ["first", "nav", "tap"];
// what counts as slow, as an index into the counts (b0 under 300 ms, b1 600 ms, b2 1.2 s, b3 2.5 s, b4 5 s, b5 beyond):
// a page shown in 2.5 s or more, a reaction of 300 ms or more
const SLOW_FROM = { first: 4, nav: 4, tap: 1 };
const sec = (ms) => (ms == null ? "—" : `${fmt(ms / 1000, 2)} s`);
const mean = (r) => (r && r.n ? r.ms / r.n : null);
const slow = (r, kind) => { if (!r || !r.n) return null; let s = 0; for (let i = SLOW_FROM[kind]; i <= 5; i++) s += r[`b${i}`] || 0; return s / r.n; };
const add = (a, r) => { a.n += r.n; a.ms += r.ms; for (let i = 0; i <= 5; i++) a[`b${i}`] += r[`b${i}`] || 0; return a; };
const zero = () => ({ n: 0, ms: 0, b0: 0, b1: 0, b2: 0, b3: 0, b4: 0, b5: 0 });

export async function draw(box) {
  let days = 30;
  box.innerHTML = html`<div class="filters"><label class="field"><span>${t("ad.pf.period")}</span><select id="pf-days">
      ${[7, 30, 90, 365].map((d) => html`<option value="${d}" ${raw(d === days ? "selected" : "")}>${t("ad.pf.days", { n: d })}</option>`)}</select></label></div>
    <div id="pf-out"><div class="empty">${t("misc.loading")}</div></div>`;
  $("#pf-days", box).addEventListener("change", (e) => { days = +e.target.value; load(); });
  async function load() {
    const out = $("#pf-out", box);
    let d = null;
    try { const r = await fetch(`api/admin/perf?days=${days}`, { credentials: "same-origin", cache: "no-store" }); d = r.ok ? await r.json() : null; } catch (e) { d = null; }
    if (!d) { out.innerHTML = html`<div class="notice">${t("ad.pf.error")}</div>`; return; }
    if (!d.ready) { out.innerHTML = html`<div class="notice">${t("ad.pf.notReady")}</div>`; return; }
    const total = Object.fromEntries(KINDS.map((k) => [k, zero()]));
    const byPage = new Map();
    for (const r of d.pages) {
      if (!KINDS.includes(r.kind)) continue;
      add(total[r.kind], r);
      if (!byPage.has(r.page)) byPage.set(r.page, { page: r.page });
      byPage.get(r.page)[r.kind] = r;
    }
    const byBuild = new Map();
    for (const r of d.builds) {
      if (!byBuild.has(r.build)) byBuild.set(r.build, { build: r.build, first_day: r.first, last_day: r.last });
      const b = byBuild.get(r.build);
      b[r.kind] = r;
      if (r.first < b.first_day) b.first_day = r.first;
      if (r.last > b.last_day) b.last_day = r.last;
    }
    const late = d.pages.filter((r) => r.kind === "late").sort((a, b) => b.n - a.n);
    const tile = (kind) => html`<div class="tile"><div class="tile-label">${t(`ad.pf.kind.${kind}`)}</div>
      <div class="tile-value">${sec(mean(total[kind]))}</div>
      <div class="tile-sub">${t(`ad.pf.slow.${kind === "tap" ? "tap" : "page"}`, { p: pct(slow(total[kind], kind)) })} · ${t("ad.pf.n", { n: fmt(total[kind].n) })}</div></div>`;
    out.innerHTML = html`<div class="tiles" style="margin-bottom:16px">${KINDS.map(tile)}</div>
      <p class="muted" style="font-size:12.5px;margin:0 2px 14px">${t("ad.pf.note")}</p>
      <section class="card"><h3>${t("ad.pf.byPage")}</h3><div id="pf-pages"></div></section>
      <section class="card" style="margin-top:16px"><h3>${t("ad.pf.byBuild")}</h3><p class="muted" style="font-size:12.5px">${t("ad.pf.byBuild.hint")}</p><div id="pf-builds"></div></section>
      <section class="card" style="margin-top:16px"><h3>${t("ad.pf.late")}</h3><p class="muted" style="font-size:12.5px">${t("ad.pf.late.hint")}</p>
        ${late.length ? html`<div class="table-wrap"><table class="data compact"><thead><tr><th>${t("ad.pf.col.key")}</th><th class="num">${t("ad.pf.col.n")}</th></tr></thead>
          <tbody>${late.map((r) => html`<tr><td><code>${r.page}</code></td><td class="num">${fmt(r.n)}</td></tr>`)}</tbody></table></div>` : html`<div class="empty">${t("ad.pf.late.none")}</div>`}</section>`;
    const cols = (first) => [first,
      ...KINDS.flatMap((k) => [
        { key: `${k}n`, label: t("ad.pf.col.count", { kind: t(`ad.pf.kind.${k}`) }), align: "num", sort: (r) => r[k]?.n ?? null, render: (r) => (r[k] ? fmt(r[k].n) : "—") },
        { key: `${k}m`, label: t("ad.pf.col.mean"), align: "num", sort: (r) => mean(r[k]), render: (r) => sec(mean(r[k])) },
        { key: `${k}s`, label: t(`ad.pf.col.slow.${k === "tap" ? "tap" : "page"}`), align: "num", sort: (r) => slow(r[k], k), render: (r) => (r[k] ? pct(slow(r[k], k)) : "—") },
      ])];
    dataTable($("#pf-pages", out), { columns: cols({ key: "page", label: t("ad.pf.col.page"), sort: (r) => r.page, render: (r) => r.page, defaultDir: 1 }),
      rows: [...byPage.values()], sortKey: "navn", sortDir: -1, compact: true, emptyText: t("ad.pf.none") });
    dataTable($("#pf-builds", out), { columns: cols({ key: "build", label: t("ad.pf.col.build"), sort: (r) => r.first_day,
      render: (r) => html`<code>${r.build || "—"}</code> <span class="muted">${fmtDate(r.first_day)}${r.last_day !== r.first_day ? html` → ${fmtDate(r.last_day)}` : ""}</span>` }),
      rows: [...byBuild.values()], sortKey: "build", sortDir: -1, compact: true, emptyText: t("ad.pf.none") });
  }
  load();
}
