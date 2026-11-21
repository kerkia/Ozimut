// This Source Code Form is subject to the terms of the Mozilla Public License, v. 2.0. If a copy of the MPL was not
// distributed with this file, You can obtain one at https://mozilla.org/MPL/2.0/.

// Races over several days: each day's results kept as a « stage », the totals over the stages — the times added, or
// points —, and the chase start of the last day (the leader first, the others behind by their deficit). Pure.
// A stage is kept on the event under the key `stage.<id>` (one key a stage: two stations adding stages never overwrite
// each other), the settings under `series` = { name, mode "time"|"points", best (count the best N stages; 0: all),
// cur (the event's own race is a stage too; true unless false) }.

import { Log } from "./log.js";
import { importSet, norm } from "./model.js";
import { buildView } from "./view.js";

/** Who is who from one day to the next: the licence, else the name and the club. */
export const personKey = (r) => (r.lic ? `l:${String(r.lic).trim()}` : `n:${norm(r.family)}|${norm(r.given)}|${norm(r.club)}`);

/** A view's results as a stage: `{ id, name, date, classes: [{ name, rows: [{ k, family, given, club, lic, status, time, points }] }] }`. */
export function stageOf(view, { id = "", name = "", date = "" } = {}) {
  return { id, name: name || view.event.name || "", date: date || view.event.date || "",
    classes: view.classes.filter((k) => k.id && k.rows.length && !k.ko).map((k) => ({ name: k.name,
      rows: k.rows.filter((r) => !r.of).map((r) => ({ k: personKey(r), family: r.family, given: r.given, club: r.club, ...(r.lic ? { lic: r.lic } : {}), status: r.status,
        ...(r.time != null ? { time: r.time } : {}), ...(r.points != null ? { points: r.points } : {}) })) })) };
}

/** A stage from what a file gave (a set as the readers make them: an IOF XML result list, an OE file…) or from a log's operations. */
export function stageFromSet(set, meta = {}) {
  const log = new Log("stage", []);
  importSet(log, set);
  return stageOf(buildView(log.state), { name: set.event?.name || "", date: set.event?.date || "", ...meta });
}
export function stageFromOps(ops, meta = {}) {
  return stageOf(buildView(new Log("stage", ops).state), meta);
}

/** The stages kept on the event, the oldest first. */
export function stagesOf(st) {
  return Object.entries(st.event).filter(([k, v]) => k.startsWith("stage.") && v && Array.isArray(v.classes)).map(([k, v]) => ({ ...v, id: k.slice(6) }))
    .sort((a, b) => String(a.date).localeCompare(String(b.date)) || String(a.name).localeCompare(String(b.name)));
}

const done = (r) => r && r.status === "ok" && r.time != null;
const nameKey = (r) => `n:${norm(r.family)}|${norm(r.given)}|${norm(r.club)}`;
/** The key a row goes under: its licence's, unless the same name in the same club is known so far without a licence. */
function canon(alias, r) {
  const nk = nameKey(r);
  let c = alias.get(r.k);
  if (!c) { const byName = alias.get(nk); c = byName && (!r.k.startsWith("l:") || byName.startsWith("n:")) ? byName : r.k; }
  alias.set(r.k, c);
  if (!alias.has(nk)) alias.set(nk, c);
  return c;
}

/**
 * The totals: `{ mode, best, stages: [{ id, name, date }], classes: [{ name, rows: [{ k, family, given, club, res: [per
 * stage { status, time, points, pts }|null], n (stages classified), total, complete, place, behind }] }] }`.
 * By time: the times of the stages counted are added, a runner short of a stage ranks after those who have them all.
 * By points: each stage gives 1000 × the winner's time ÷ the runner's (a score race: × the runner's points ÷ the best),
 * the best stages are added. `view`: the event's own race, counted as the last stage unless `series.cur` is false.
 */
export function totals(st, view, { withCurrent = null } = {}) {
  const S = st.event.series || {}, mode = S.mode === "points" ? "points" : "time";
  const stages = stagesOf(st);
  if ((withCurrent ?? S.cur !== false) && view) stages.push({ ...stageOf(view), id: "*" });
  const need = S.best > 0 ? Math.min(S.best, stages.length) : stages.length;
  const classes = new Map();
  stages.forEach((sg, i) => {
    for (const c of sg.classes) {
      const key = norm(c.name), K = classes.get(key) || classes.set(key, { name: c.name, people: new Map(), alias: new Map() }).get(key);
      const ok = c.rows.filter(done), bestT = ok.length ? Math.min(...ok.map((r) => r.time)) : null, bestP = Math.max(0, ...c.rows.map((r) => r.points ?? 0));
      for (const r of c.rows) {
        const ck = canon(K.alias, r), p = K.people.get(ck) || K.people.set(ck, { k: ck, family: r.family, given: r.given, club: r.club, res: new Array(stages.length).fill(null) }).get(ck);
        const pts = !done(r) ? 0 : r.points != null && bestP > 0 ? Math.round(1000 * r.points / bestP) : bestT ? Math.round(1000 * bestT / r.time) : 0;
        p.res[i] = { status: r.status, time: r.time ?? null, points: r.points ?? null, pts };
        if (i === stages.length - 1 || !p.club) { p.family = r.family; p.given = r.given; p.club = r.club; }
      }
    }
  });
  const out = [];
  for (const K of classes.values()) {
    const rows = [...K.people.values()].map((p) => {
      const ok = p.res.filter(done);
      let total = null, complete = false;
      if (mode === "time") { complete = need > 0 && ok.length >= need; if (complete) total = Math.round(ok.map((r) => r.time).sort((a, b) => a - b).slice(0, need).reduce((a, b) => a + b, 0) * 10) / 10; }
      else { total = p.res.map((r) => r?.pts || 0).sort((a, b) => b - a).slice(0, need).reduce((a, b) => a + b, 0); complete = ok.length > 0; }
      return { ...p, n: ok.length, total, complete, place: null, behind: null };
    });
    const ranked = rows.filter((r) => r.complete).sort(mode === "time" ? (a, b) => a.total - b.total : (a, b) => b.total - a.total || b.n - a.n);
    let place = 0;
    ranked.forEach((r, i) => { if (!i || r.total !== ranked[i - 1].total) place = i + 1; r.place = place; r.behind = mode === "time" ? Math.round((r.total - ranked[0].total) * 10) / 10 : ranked[0].total - r.total; });
    const rest = rows.filter((r) => !r.complete).sort((a, b) => b.n - a.n || String(a.family).localeCompare(String(b.family)));
    out.push({ name: K.name, rows: ranked.concat(rest) });
  }
  out.sort((a, b) => String(a.name).localeCompare(String(b.name), undefined, { numeric: true }));
  return { mode, best: need, stages: stages.map((s) => ({ id: s.id, name: s.name, date: s.date })), classes: out };
}

/**
 * The chase start of the event's race, from the totals of the stages before it (by time): in each class the leader leaves
 * at `first`, the others behind by their deficit; beyond `cap` seconds (0: no limit), and those short of a stage, leave
 * together `step` seconds apart after the last. Returns `{ rows, chase, late, none (runners the stages do not know) }`.
 */
export function chaseStarts(st, { first, cap = 0, step = 30, classes = null } = {}) {
  const tot = totals(st, null, { withCurrent: false });
  const rows = [];
  let chase = 0, late = 0, none = 0;
  for (const k of Object.values(st.classes)) {
    if (classes && !classes.includes(k.id)) continue;
    if (k.legs?.length || k.ko) continue;
    const T = tot.classes.find((c) => norm(c.name) === norm(k.name));
    const mine = Object.values(st.runners).filter((r) => r.cls === k.id && !r.of && r.status !== "dns");
    if (!T || !mine.length) { none += mine.length; continue; }
    const by = new Map(T.rows.map((r) => [r.k, r]));
    for (const r of T.rows) if (!by.has(nameKey(r))) by.set(nameKey(r), r);
    const lead = T.rows.find((r) => r.complete)?.total ?? null;
    const behind = [];
    let last = first;
    for (const r of mine) {
      const me = { ...r, club: st.clubs[r.club]?.name || "" }, t = by.get(personKey(me)) || by.get(nameKey(me));
      if (!t) { none++; continue; }
      const gap = t.complete && lead != null ? t.total - lead : null;
      if (gap != null && (!cap || gap <= cap)) { const s = first + Math.round(gap); rows.push(["runners", r.id, { start: s }]); if (s > last) last = s; chase++; }
      else behind.push([t.complete ? 0 : 1, gap ?? 1e12, r.id]);
    }
    behind.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    let s = Math.max(last, cap ? first + cap : last);
    for (const [, , id] of behind) { s += step; rows.push(["runners", id, { start: s }]); late++; }
  }
  return { rows, chase, late, none };
}
