// This Source Code Form is subject to the terms of the Mozilla Public License, v. 2.0. If a copy of the MPL was not
// distributed with this file, You can obtain one at https://mozilla.org/MPL/2.0/.

// Knockout rounds (a sprint by elimination): from a ranking — a qualification race, or the round before — the runners are
// spread over heats, each heat a class of its own started together; the first of each heat go on to the next round.
// Pure: state and view in, rows to write out (docs/design.md). A runner of a round is a copy of their entry
// (`of` = the entry it stands for) in the heat's class, with the same card: a card read goes to the one of its holders
// who has no read yet (judge.ownerOf), so each round's read finds its heat. A heat's class carries
// `ko` = { base (the class the knockout started from), round, heat, up (how many go on) }.

import { newId } from "./log.js";
import { personOf } from "./view.js";

/** A ranked list spread over `n` heats in a snake: 1 2 3 / 6 5 4 / 7 8 9…, so that the heats are of equal strength. */
export function snake(list, n) {
  const heats = Array.from({ length: Math.max(1, n) }, () => []);
  list.forEach((x, i) => { const row = Math.floor(i / heats.length), col = i % heats.length; heats[row % 2 ? heats.length - 1 - col : col].push(x); });
  return heats;
}

const byRank = (a, b) => (a.place ?? 1e9) - (b.place ?? 1e9) || (a.time ?? 1e9) - (b.time ?? 1e9);

/** The knockouts of the event: `[{ base, name, rounds: [{ round, label, up, heats: [class of the view] }] }]`, rounds in order. */
export function koTree(st, view) {
  const by = new Map();
  for (const k of view.classes) {
    const ko = k.id && st.classes[k.id]?.ko;
    if (!ko) continue;
    const b = by.get(ko.base) || by.set(ko.base, { base: ko.base, name: st.classes[ko.base]?.name || "", rounds: new Map() }).get(ko.base);
    const r = b.rounds.get(ko.round) || b.rounds.set(ko.round, { round: ko.round, label: ko.label || "", up: ko.up || 0, heats: [] }).get(ko.round);
    r.heats.push(k);
  }
  return [...by.values()].map((b) => ({ ...b, rounds: [...b.rounds.values()].sort((x, y) => x.round - y.round).map((r) => ({ ...r, heats: r.heats.sort((x, y) => st.classes[x.id].ko.heat - st.classes[y.id].ko.heat) })) }));
}

/**
 * Who a round is made from, the best first: the classified of the classes `from` (a qualification: by place, then time),
 * or, for a round after another (`prev` = that round of the knockout `base`), the first `up` of each of its heats — the
 * heats' winners first, then the seconds… —, then the `lucky` fastest of the others.
 */
export function qualified(st, view, { from = [], base = null, prev = null, lucky = 0 } = {}) {
  if (prev == null) {
    const rows = view.classes.filter((k) => from.includes(k.id)).flatMap((k) => k.rows.filter((r) => r.status === "ok" && r.place));
    return rows.sort(byRank);
  }
  const round = koTree(st, view).find((b) => b.base === base)?.rounds.find((r) => r.round === prev);
  if (!round) return [];
  const up = [], rest = [];
  for (const h of round.heats) {
    const n = st.classes[h.id].ko.up || 0;
    for (const r of h.rows) { if (r.status !== "ok" || !r.place) continue; (r.place <= n ? up : rest).push(r); }
  }
  up.sort(byRank);
  rest.sort((a, b) => (a.time ?? 1e9) - (b.time ?? 1e9));
  return up.concat(rest.slice(0, Math.max(0, lucky)));
}

/** The rows that take a round away (its heats' classes and their runners), or null when one of its runners has a card read. */
export function dropRound(st, base, round) {
  const ks = Object.values(st.classes).filter((k) => k.ko && k.ko.base === base && k.ko.round === round).map((k) => k.id);
  const mine = Object.values(st.runners).filter((r) => ks.includes(r.cls));
  const read = new Set(Object.values(st.reads).map((r) => r.runner));
  if (mine.some((r) => read.has(r.id))) return null;
  return mine.map((r) => ["runners", r.id, null]).concat(ks.map((id) => ["classes", id, null]));
}

/**
 * A round's heats as rows to write. `opt`: `{ base (the class the knockout belongs to), round (1, 2…), label (the round's
 * name, as shown: « Quart de finale »), from: [class ids] | prev: round, heats (how many), size (runners a heat at most),
 * up (how many of each heat go on), lucky, course (id), first (the first heat's start, s), gap (s between two heats),
 * name(label, i, n) → a heat's name }`. Returns `{ rows, heats: [[view rows]], left (qualified but without a place) }`.
 */
export function planRound(st, view, opt) {
  const list = qualified(st, view, opt), n = Math.max(1, opt.heats || 1), size = Math.max(1, opt.size || 6);
  const taken = list.slice(0, n * size), heats = snake(taken, n), rows = [];
  const baseName = st.classes[opt.base]?.name || "";
  const nameOf = opt.name || ((label, i, of) => [baseName, label, of > 1 ? String(i + 1) : ""].filter(Boolean).join(" "));
  heats.forEach((members, i) => {
    const id = newId(), start = opt.first != null ? opt.first + i * (opt.gap || 0) : null;
    rows.push(["classes", id, { name: nameOf(opt.label || "", i, n), course: opt.course || null, first: start,
      ko: { base: opt.base, round: opt.round, heat: i + 1, up: opt.up || 0, label: opt.label || "" } }]);
    members.forEach((row, seed) => {
      const src = st.runners[row.id];
      if (!src) return;
      const p = { cls: id, of: personOf(st, src.id), seed: seed + 1 };
      for (const f of ["family", "given", "club", "card", "lic", "cat", "sex", "birth", "nat", "bib", "kind"]) if (src[f] != null && src[f] !== "") p[f] = src[f];
      if (start != null) p.start = start;
      rows.push(["runners", newId(), p]);
    });
  });
  return { rows, heats, left: list.slice(n * size) };
}

/**
 * The knockout's final ranking: who went furthest first; within a round, the heats' places, then the times.
 * `[{ place, id (the entry), family, given, club, round, label, heatPlace, time, status }]`.
 */
export function koRanking(st, view, base) {
  const tree = koTree(st, view).find((b) => b.base === base);
  if (!tree) return [];
  const best = new Map();
  for (const r of tree.rounds) for (const h of r.heats) for (const row of h.rows) {
    const who = personOf(st, row.id), was = best.get(who);
    if (!was || was.round < r.round) best.set(who, { id: who, family: row.family, given: row.given, club: row.club, round: r.round, label: r.label, heatPlace: row.place, time: row.time, status: row.status });
  }
  const out = [...best.values()].sort((a, b) => b.round - a.round || (a.heatPlace ?? 1e9) - (b.heatPlace ?? 1e9) || (a.time ?? 1e9) - (b.time ?? 1e9));
  out.forEach((r, i) => { r.place = i + 1; });
  return out;
}
