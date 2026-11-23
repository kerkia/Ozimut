// Arena's tabs (owner, 2026-10-30). Today's and coming competitions and the past ones are the module's menu (app.js
// moduleMenus). A race's page: its results, then — when the race has split times — the analysis's views as more tabs
// (« Analyse de course », pages/splits.js).

import { html } from "./util.js";
import { t } from "./i18n.js";

/** The split-time analysis's views, in their order (pages/splits.js). */
export const SPLIT_VIEWS = ["table", "gaps", "clock", "legs", "profile", "h2h", "groups", "follow", "regular", "summary"];

/** A score race's views (owner, 2026-11-04: a rogaine's controls are taken in any order, so nothing compares legs): the
 * controls in the order each runner took them (« Tableau ») and their passages against the clock. */
export const SCORE_VIEWS = ["table", "clock"];

/** A control's points as liveresultat names them, « 206 (1p) »: { code, pts } (pts null without). */
export function scoreControl(c) {
  const m = /^(.*?)\s*\((\d+(?:[.,]\d+)?)\s*p\)\s*$/i.exec(String(c ?? ""));
  return m ? { code: m[1], pts: Number(m[2].replace(",", ".")) } : { code: String(c ?? ""), pts: null };
}

/** A class of a score race: its controls carry points (liveresultat), or most runners skip controls and take the others out
 * of the list's order (a unit off the right time breaks the order too, but skips nothing). */
export function isScoreClass(k) {
  const cs = k?.controls || [];
  if (cs.length >= 3 && cs.filter((c) => scoreControl(c).pts != null).length >= cs.length / 2) return true;
  const rs = (k?.runners || []).filter((r) => r.splits);
  let cells = 0, gaps = 0, many = 0, unordered = 0;
  for (const r of rs) {
    cells += r.splits.length;
    gaps += r.splits.filter((v) => v == null).length;
    const v = r.splits.filter((x) => x != null);
    if (v.length < 3) continue;
    many++;
    if (v.some((x, i) => i && x < v[i - 1])) unordered++;
  }
  return many >= 2 && gaps >= 0.3 * cells && unordered >= 0.5 * many;
}

/** A score race: its format says so, or every class with split times is one. */
export const isScoreRace = (race, docs = []) => /^score$/i.test(race?.epreuve || "")
  || (() => { const ks = docs.flatMap((d) => d.classes || []).filter((k) => k.runners?.some((r) => r.splits)); return ks.length > 0 && ks.every(isScoreClass); })();

/** A score class's own ranking (owner, 2026-11-04: the sources' places follow the time alone, liveresultat's among them): the
 * points of the controls taken — or their number when the controls carry no points —, then the time; runners on equal points
 * and time share a place, and only the finishers ("ok") have one. Late penalties are left out: they need the organiser's rules.
 * { withPts, of: Map(runner → { n, pts, place }) }. */
export function scoreRanking(k) {
  const cs = (k?.controls || []).map(scoreControl), withPts = cs.some((c) => c.pts != null);
  const of = new Map();
  for (const r of k?.runners || []) {
    const taken = (r.splits || []).slice(0, cs.length || undefined).map((s, i) => (s == null ? null : i)).filter((i) => i != null);
    of.set(r, { n: taken.length, pts: withPts ? taken.reduce((a, i) => a + (cs[i]?.pts || 0), 0) : taken.length, place: null });
  }
  const ok = [...of].filter(([r]) => r.status === "ok" && r.time_s != null);
  for (const [r, v] of ok) v.place = 1 + ok.filter(([y, w]) => w.pts > v.pts || (w.pts === v.pts && y.time_s < r.time_s)).length;
  return { withPts, of };
}

/** The analysis's views for a race or class. */
export const splitViews = (score) => (score ? SCORE_VIEWS : SPLIT_VIEWS);

/** A race's address: its results, or one of the analysis's views (q: doc, c). */
export function raceHref(key, view, q = {}) {
  const p = new URLSearchParams({ course: key });
  if (q.doc) p.set("doc", q.doc);
  if (q.c) p.set("c", q.c);
  if (view && view !== "results" && view !== "table") p.set("vw", view);
  return `#/${!view || view === "results" ? "resultats" : "analyse-course"}?${p}`;
}

/** The results tab, as a link (the analysis's own views are buttons the splits page binds). */
export const resultsTab = (key, cur) => html`<a role="tab" href="${raceHref(key, "results")}" aria-selected="${cur === "results"}">${t("arena.tab.results")}</a>`;

/** A race's tabs on its results page: the results (shown), then each view of the analysis when the race has split times (a score
 * race's own, `score`). */
// (a race without split times has its results alone: no bar of one tab — owner, 2026-11-23)
export const raceTabs = (key, withSplits, q = {}, score = false) => !withSplits ? "" : html`<nav class="page-tabs race-tabs" role="tablist">${resultsTab(key, "results")}${
  withSplits ? splitViews(score).map((v) => html`<a role="tab" data-view="${v}" href="${raceHref(key, v, q)}" aria-selected="false">${t(`spl.tab.${v}`)}</a>`) : ""}</nav>`;
