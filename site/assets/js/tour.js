// The site in pictures, on the home page under the hero (owner, 2026-10-19: the presentation shown to Swiss Orienteering,
// published on the site, in French and English). A course through the site: a purple line from the start triangle, through
// numbered controls (the sections), to the finish. The screenshots (assets/tour/<lang>/*.webp) were taken on a scrambled
// copy of the data — invented names, licences and clubs, times shifted — so this public page shows nobody's real results
// (the public page never shows real results or names); « En direct » and the notifications are drawn mockups.
// Since 2026-10-30 (owner) the page follows the four modules: an overview (what Ozimut is, on phones, the pledges and the
// account), then each module its own course — its start beside its introduction, its controls numbered from 1, its finish
// holding the way in —, then who sees what; a rule between them, each a link of the bar (#/?s=overview|arena|…|features). The analysis's phone picture (phone-analysis) is the invented run of assets/reel-trace.webp on a phone.

import { html, raw, $, $$, fmt } from "./util.js";
import { t, lang } from "./i18n.js";

const LEGS = [
  { id: "races", who: ["r"], main: "agenda-start", side: ["race", "@live"], row: ["dark-splits", "@notif", "past"] },
  { id: "analysis", who: ["r", "c", "o"], dp: ["@trace", "phone-analysis"] },
  // Analyse multi (owner, 2026-10-30): the replay and the gaps, on the reel's invented map, every name invented
  { id: "multi", who: ["r", "c"], pair: ["multi", "multi-gaps"] },
  { id: "runner", who: ["r"], main: "runner-calc", side: ["dark-progress", "compare"], row: ["runner-map", "runner-network", "runner-seasons"] },
  { id: "ranking", who: ["r", "c"], main: "ranking", side: ["categories", "courses"], strip: ["stats-territories", "stats-ages", "stats-participation", "stats-leaders"] },
  { id: "method", who: ["r", "l"], duel: true, long: 3, pair: ["docs", "docs-top"] },
  { id: "clubs", who: ["c", "l"], main: "relays", side: ["club", "clubcompare"], pair: ["clubs", "ia"] },
  { id: "training", who: ["r", "c"], main: "game-forestroute", side: ["descriptions", "vma"], row: ["game-photo", "game-contour", "game-maze"] },
  { id: "orga", who: ["o", "c"], main: "@tracer", side: ["orga-starts", "orga-results"], pair: ["orga-competitions", "orga-direct"] },
  // Ozimut Carto (owner, 2026-11-12; pictures 2026-11-17): maps made from open data only (IGN, OpenStreetMap, swisstopo), never a club's
  { id: "carto", who: ["o", "c"], main: "carto-editor", side: ["carto-bern", "carto-new"] },
  // Ozimut Pixel (owner, 2026-11-17: on the home page too): the LiDAR race of Autrans and the invented forests, no club's map
  { id: "pixel", who: ["r", "c"], main: "pixel-race", side: ["pixel-map", "pixel-maps"] },
  { id: "phones", who: ["all"], phones: ["phone-hub", "phone-agenda", "phone-race", "phone-ranking", "phone-runner"] },
];
// the four modules (owner, 2026-10-30): each a section of the page, its introduction then its legs; the bar's links lead to
// them (#/?s=arena…), and to the table of who sees what (#/?s=features)
export const MODS = [
  { id: "arena", legs: ["races"] },
  { id: "stats", legs: ["runner", "ranking", "method", "clubs"] },
  { id: "coach", legs: ["analysis", "multi", "training"] },
  { id: "orga", legs: ["orga"] },
  { id: "carto", legs: ["carto"] },
  { id: "pixel", legs: ["pixel"] },
];
// who sees what (owner, 2026-10-30): the modules as columns, the access levels as rows — without an account, with one, with
// the Orga and Carto modules (owner, 2026-11-17: the creators' modules, one row) —, each level adding to the one above; in each
// cell the capabilities it adds (`tour.f.<key>`). What only a
// federation's licensee sees (France: an FFCO licence checked; keys `<module>.fed.<n>`) has no row of its own (owner,
// 2026-10-31): it sits in the row it opens from, marked with an asterisk that the note under the table explains
const LEVELS = ["guest", "account", "orga"];
const seq = (k, n) => Array.from({ length: n }, (_, i) => `${k}.${i + 1}`);
const CAPS = {
  arena: { guest: seq("arena.guest", 10), account: [...seq("arena.account", 3), ...seq("arena.fed", 4)], orga: [] },
  stats: { guest: seq("stats.guest", 5), account: seq("stats.fed", 11), orga: [] },
  coach: { guest: seq("coach.guest", 8), account: [...seq("coach.account", 5), "coach.fed.1"], orga: [] },
  orga: { guest: [], account: ["orga.account.1"], orga: ["orga.orga.1", "orga.fed.1", ...seq("orga.orga", 9).slice(1)] },
  carto: { guest: [], account: [], orga: seq("carto.account", 4) },
  pixel: { guest: [], account: seq("pixel.account", 4), orga: [] },
};
const MAIL = "contact@ozimut.com";       // i18n-ignore
const src = (name) => (name === "@trace" ? "assets/reel-trace.webp" : name === "@tracer" ? "assets/reel-tracer.webp"
  : `assets/tour/${lang() === "fr" ? "fr" : "en"}/${name}.webp`);
const capKey = (name) => name.replace(/^@/, "");
// each picture's size (the reel's drawn views 1400 × 750, the screenshots 1400 × 875, a phone's 560 × 1212)
const dims = (name) => (name.startsWith("@") ? 'width="1400" height="750"' : 'width="1400" height="875"');
const PHONE_DIMS = 'width="560" height="1212"';

const cap = (name) => {
  const k = capKey(name), b = t(`tour.cap.${k}.b`), rest = t(`tour.cap.${k}`);
  return html`<figcaption><b>${b}</b>${rest ? html` ${rest}` : ""}</figcaption>`;
};
const shot = (name, { small = false } = {}) => {
  if (name === "@live") return live();
  if (name === "@notif") return notif();
  return html`<figure><div class="tour-shot"><img src="${src(name)}" ${raw(dims(name))} alt="${t(`tour.cap.${capKey(name)}.b`)}" loading="lazy" decoding="async"
    tabindex="0" title="${t("tour.zoom")}"></div>${small ? html`<figcaption><b>${t(`tour.cap.${capKey(name)}.b`)}</b>${t(`tour.cap.${capKey(name)}`) ? html` ${t(`tour.cap.${capKey(name)}`)}` : ""}</figcaption>` : cap(name)}</figure>`;
};
// the mockups: a live results table and a phone's lock screen, invented
function live() {
  const rows = [[1, "Lucas Fontaine", "14:52", 2], [2, "Hugo Mercier", "15:03", 5, true], [3, "Antoine Girard", "15:11", 1], [4, "Théo Rousseau", "15:40", 3]];   // i18n-ignore
  return html`<figure class="tour-mock"><div class="tour-mock-head">${t("tour.live.title")} <em>${t("tour.live.badge")}</em></div>
    <table><thead><tr><th>${t("tour.live.pl")}</th><th>${t("tour.live.runner")}</th><th class="num">${t("tour.live.time")}</th><th class="num">${t("tour.live.expected")}</th></tr></thead>
    <tbody>${rows.map(([p, n, tm, ex, nw]) => html`<tr class="${nw ? "new" : ""}"><td>${p}</td><td>${n}${nw ? html` <span class="tour-new">${t("tour.live.new")}</span>` : ""}</td>
      <td class="num">${tm}</td><td class="num">${ex}</td></tr>`)}</tbody></table>
    <figcaption><b>${t("tour.cap.live.b")}</b> ${t("tour.cap.live")} <i>${t("tour.mockup")}</i></figcaption></figure>`;
}
const logo = `<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M16 8 L24 16 L16 16 Z" fill="#e8641c"/><path d="M8 16 L16 24 L16 16 Z" fill="#18201b"/><circle cx="16" cy="16" r="13.7" fill="none" stroke="#18201b" stroke-width="1.9"/><path d="M16 3.4 V5.6 M28.6 16 H26.4 M16 28.6 V26.4 M3.4 16 H5.6" fill="none" stroke="#18201b" stroke-width="2" stroke-linecap="round"/></svg>`;
function notif() {
  const n = (i) => html`<div class="tour-notif">${raw(logo)}<b>${t(`tour.notif.${i}.t`)}</b><span>${t(`tour.notif.${i}.b`)}</span><small>${t(`tour.notif.${i}.s`)}</small></div>`;
  return html`<figure><div class="tour-phone"><div class="tour-lock" role="img" aria-label="${t("tour.cap.notif.b")}">
      <div class="tour-clock num">07:42</div><div class="tour-day">${t("tour.notif.day")}</div>${n(1)}${n(2)}</div></div>
    <figcaption><b>${t("tour.cap.notif.b")}</b> ${t("tour.cap.notif")} <i>${t("tour.mockup")}</i></figcaption></figure>`;
}

function leg(L, i) {
  const head = html`<div class="tour-ctrl" aria-hidden="true">${i + 1}</div>
    <div class="tour-leg-head"><div><div class="tour-eyebrow">${t(`tour.${L.id}.eyebrow`)}</div><h2>${t(`tour.${L.id}.title`)}</h2>
      <p class="tour-lede">${t(`tour.${L.id}.lede`)}</p></div>
      <div class="tour-who">${L.who.map((w) => html`<span class="tour-who-${w}">${t(`tour.who.${w}`)}</span>`)}</div></div>`;
  const duel = L.duel ? html`<div class="tour-duel">${["forest", "sprint"].map((d) => html`<div><h3>${t(`tour.method.${d}`)}</h3>
      <div class="tour-vs"><s>${t(`tour.method.${d}.a`)}</s><b>${t(`tour.method.${d}.b`)}</b></div><p>${t("tour.method.note")}</p></div>`)}</div>` : "";
  // the Ozimut index over the years (owner, 2026-10-30): what makes a runner's curve readable from end to end
  const long = L.long ? html`<div class="tour-long"><h3>${t(`tour.${L.id}.long`)}</h3><ul>${Array.from({ length: L.long }, (_, i) =>
    html`<li><b>${t(`tour.${L.id}.long.${i + 1}.b`)}</b> ${t(`tour.${L.id}.long.${i + 1}`)}</li>`)}</ul></div>` : "";
  const main = L.main ? html`<div class="tour-g-main">${shot(L.main)}<div class="tour-g-side">${L.side.map((s) => shot(s))}</div></div>` : "";
  const row = L.row ? html`<div class="tour-g-3">${L.row.map((s) => shot(s))}</div>` : "";
  const strip = L.strip ? html`<div class="tour-g-4">${L.strip.map((s) => shot(s, { small: true }))}</div>` : "";
  const pair = L.pair ? html`<div class="tour-g-2">${L.pair.map((s) => shot(s))}</div>` : "";
  const phones = L.phones ? html`<div class="tour-g-5">${L.phones.map((s) => html`<figure><div class="tour-phone"><img src="${src(s)}" ${raw(PHONE_DIMS)}
      alt="${t(`tour.cap.${s}.b`)}" loading="lazy" decoding="async" tabindex="0" title="${t("tour.zoom")}"></div><figcaption><b>${t(`tour.cap.${s}.b`)}</b></figcaption></figure>`)}</div>` : "";
  // a computer's picture beside the same page on a phone
  const dp = L.dp ? html`<div class="tour-g-dp">${shot(L.dp[0])}<figure><div class="tour-phone"><img src="${src(L.dp[1])}" ${raw(PHONE_DIMS)}
      alt="${t(`tour.cap.${L.dp[1]}.b`)}" loading="lazy" decoding="async" tabindex="0" title="${t("tour.zoom")}"></div>${cap(L.dp[1])}</figure></div>` : "";
  return html`<section class="tour-leg" id="tour-${L.id}">${head}${duel}${long}${main}${dp}${row}${strip}${pair}${phones}</section>`;
}

const START = `<svg class="tour-start" viewBox="0 0 45 45" aria-hidden="true"><path d="M22.5 5 L41 37 L4 37 Z" fill="none" stroke="currentColor" stroke-width="3" stroke-linejoin="round"/></svg>`;
const FINISH = `<svg class="tour-ctrl tour-ctrl-finish" viewBox="0 0 45 45" aria-hidden="true"><circle cx="22.5" cy="22.5" r="20" stroke="currentColor" stroke-width="3"/><circle cx="22.5" cy="22.5" r="13" fill="none" stroke="currentColor" stroke-width="3"/></svg>`;

/** A module's section, a course of its own: its introduction at the start, its legs numbered from 1, its way in at the finish. */
function mod(M) {
  // Orga, Carto and Pixel need an account (Pixel keeps each run under its runner's name): no « try without an account »
  const cta = M.id === "orga" || M.id === "carto" || M.id === "pixel" ? html`<a class="btn btn-primary" href="#/compte/inscription">${t(`tour.mod.${M.id}.cta`)}</a>`
    : html`<button type="button" class="btn btn-primary" data-guest-enter="${M.id}">${t("tour.mod.try", { mod: t(`mod.${M.id}`) })}</button>`;
  return html`<div class="tour-sec tour-mod" id="mod-${M.id}" data-mod="${M.id}"><div class="tour-course">${raw(START)}
    <header class="tour-mod-head"><span class="tour-mod-badge">${t(`mod.${M.id}`)}</span><h2>${t(`tour.mod.${M.id}.title`)}</h2>
      <p class="tour-lede">${t(M.id === "coach" ? "tour.mod.coach.lede" : `tour.mod.${M.id}.lede`)}</p></header>
    ${M.legs.map((id, i) => leg(LEGS.find((L) => L.id === id), i))}
    <div class="tour-leg tour-mod-end">${raw(FINISH)}<div class="tour-mod-cta">${cta}</div></div></div></div>`;
}
/** Who sees what: the modules as columns, the access levels as rows, in each cell what that level adds. */
function features() {
  const cell = (m, l) => {
    const keys = CAPS[m][l];
    const star = (k) => (k.includes(".fed.") ? html`<span class="tour-star" title="${t("tour.feat.star")}">*</span>` : "");
    return html`<td data-mod="${m}"><span class="tour-feat-m">${t(`mod.${m}`)}</span>${keys.length ? html`<ul>${keys.map((k) => html`<li>${t(`tour.f.${k}`)}${star(k)}</li>`)}</ul>`
      : html`<span class="tour-no">${t(`tour.f.none.${l}`)}</span>`}</td>`;
  };
  return html`<section class="tour-sec tour-features" id="mod-features">
    <div class="tour-eyebrow">${t("tour.feat.eyebrow")}</div><h2>${t("tour.feat.title")}</h2><p class="tour-lede">${t("tour.feat.lede")}</p>
    <div class="tour-feat-grid"><table class="tour-feat-table"><thead><tr><th></th>${MODS.map((M) => html`<th data-mod="${M.id}">${t(`mod.${M.id}`)}<span>${t(M.id === "coach" ? "mod.coach.tag" : `mod.${M.id}.tag`)}</span></th>`)}</tr></thead>
      <tbody>${LEVELS.map((l) => html`<tr><th scope="row"><b>${t(`tour.lvl.${l}`)}</b><em class="tour-free">${t("tour.lvl.free")}</em><span>${t(`tour.lvl.${l}.sub`)}</span></th>${MODS.map((M) => cell(M.id, l))}</tr>`)}</tbody></table></div>
    <p class="muted tour-feat-note"><span class="tour-star">*</span> ${t("tour.feat.note")}</p><p class="muted tour-feat-note">${t("tour.note")}</p></section>`;
}

/** The section, under the hero. counts: meta.json's { runners, competitions, results }. */
/** `world`: registration open to every orienteer (WORLD_OPEN): the pledge about who sees the results follows it. */
export function tourHtml(counts = {}, { world = false } = {}) {
  const fig = (v, k) => (v ? html`<div class="tour-fig"><b>${fmt(v)}</b><span>${t(k)}</span></div>` : "");
  const tick = `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="2"/><path d="M7 12.5l3.2 3L17 8.8" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  // the overview, a course too: what Ozimut is at the start, on phones (1), the pledges and the account at the finish
  return html`<section class="tour" aria-labelledby="tour-title">
    <div class="tour-sec tour-mod" id="mod-overview" data-mod="overview"><div class="tour-course">${raw(START)}
      <header class="tour-top"><div class="tour-eyebrow">${t("tour.eyebrow")}</div><h2 id="tour-title">${t("tour.title")}</h2>
        <p class="tour-lede">${t("tour.lede")}</p>
        <div class="tour-figs">${fig(counts.runners, "tour.fig.runners")}${fig(counts.competitions, "tour.fig.competitions")}${fig(counts.results, "tour.fig.results")}
          <div class="tour-fig"><b>4</b><span>${t("tour.fig.specs")}</span></div></div>
        <div class="tour-hub">${shot("hub")}</div></header>
      ${leg(LEGS.find((L) => L.id === "phones"), 0)}
      <section class="tour-leg tour-finish" id="tour-finish">${raw(FINISH)}
        <div class="tour-leg-head"><div><div class="tour-eyebrow">${t("tour.finish.eyebrow")}</div><h2>${t(world ? "tour.finish.title.world" : "tour.finish.title")}</h2></div></div>
        <div class="tour-finish-band">
          <ul class="tour-pledge">${[1, 2, 3, 4, 5].map((i) => { const w = world && i === 1 ? ".world" : "";
            return html`<li>${raw(tick)}<span><b>${t(`tour.pledge.${i}.b${w}`)}</b> ${t(`tour.pledge.${i}${w}`)}</span></li>`; })}</ul>
          <div class="tour-cta"><h3>${t("tour.cta.title")}</h3><p>${t("tour.cta.text")}</p>
            <div class="tour-cta-row"><a class="btn btn-primary" href="#/compte/inscription">${t("tour.cta.register")}</a></div>
            <p class="tour-cta-mail"><span>${t("tour.cta.mail")}</span> <b id="tour-mail">${MAIL}</b>
              <button type="button" class="btn btn-sm" id="tour-copy">${t("tour.cta.copy")}</button></p></div>
        </div>
      </section></div></div>
    ${MODS.map((M) => mod(M))}
    ${features()}
    <dialog class="tour-box" id="tour-box"><img alt=""><p></p></dialog>
  </section>`;
}

/** The screenshots open larger; the address copies. */
export function mountTour(root) {
  const box = $("#tour-box", root);
  if (!box) return;
  const img = $("img", box), cap = $("p", box);
  $$(".tour-shot img, .tour-phone img", root).forEach((el) => {
    const open = () => {
      img.src = el.currentSrc || el.src; img.alt = el.alt;
      cap.textContent = el.closest("figure")?.querySelector("figcaption")?.textContent || el.alt;
      try { box.showModal(); } catch (e) { box.setAttribute("open", ""); }
    };
    el.addEventListener("click", open);
    el.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); } });
  });
  box.addEventListener("click", () => box.close());
  const lines = () => $$(".tour-course", root).forEach((c) => {
    const end = $(":scope > .tour-leg:last-child .tour-ctrl-finish", c);
    if (!end || !c.offsetHeight) return;
    const e = end.getBoundingClientRect(), y = e.top + e.height / 2 - c.getBoundingClientRect().top;
    c.style.setProperty("--line", `${Math.max(0, Math.round(y - 30))}px`);
  });
  if (window.ResizeObserver) { const ro = new ResizeObserver(lines); $$(".tour-course", root).forEach((c) => ro.observe(c)); }
  lines();
  $("#tour-copy", root)?.addEventListener("click", (e) => {
    const b = e.currentTarget;
    navigator.clipboard?.writeText(MAIL).then(() => { b.textContent = t("tour.cta.copied"); }).catch(() => {
      const r = document.createRange(); r.selectNodeContents($("#tour-mail", root)); const s = getSelection(); s.removeAllRanges(); s.addRange(r);
    });
  });
}
