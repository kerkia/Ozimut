// This Source Code Form is subject to the terms of the Mozilla Public License, v. 2.0. If a copy of the MPL was not
// distributed with this file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The start draw: start times for the runners of some classes. Pure: returns the rows to write, `[["runners", id, { start }]]`.
// By class (each class a block of its own; classes on one course follow one another, never the same minute) or by course
// (every runner of the course in one sequence). Runners of one club are kept `gap` places apart where the field allows it.

/** A small seeded generator (mulberry32): the same seed gives the same draw. */
export function rng(seed) {
  let a = (seed >>> 0) || 1;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
export function shuffle(list, rand) {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

/** An order where no two of a club are within `gap` places, as far as the clubs' sizes allow. */
export function separate(runners, gap, rand) {
  if (!gap) return shuffle(runners, rand);
  const groups = new Map();
  for (const r of shuffle(runners, rand)) { const k = r.club || `-${r.id}`; (groups.get(k) || groups.set(k, []).get(k)).push(r); }
  const out = [], recent = [];
  while (out.length < runners.length) {
    const left = [...groups.entries()].filter(([, g]) => g.length);
    const free = left.filter(([k]) => !recent.includes(k));
    const pool = free.length ? free : left;
    const most = Math.max(...pool.map(([, g]) => g.length));
    const top = pool.filter(([, g]) => g.length === most);
    const [k, g] = top[Math.floor(rand() * top.length)];
    out.push(g.pop());
    recent.push(k);
    if (recent.length > gap) recent.shift();
  }
  return out;
}

/**
 * `opt`: `{ classes: [ids] (all when absent), first (s), step (s), by "class"|"course", gap (places between two of a club),
 * vacant (free places kept at the end of each block), seed, keep (true: runners who have a start time keep it) }`.
 * Returns `{ rows, blocks: [{ name, first, last, n }], last }`.
 */
export function draw(st, opt = {}) {
  const rand = rng(opt.seed ?? Date.now()), step = opt.step || 120, gap = opt.gap ?? 0, vacant = opt.vacant || 0;
  const wanted = new Set(opt.classes?.length ? opt.classes : Object.keys(st.classes));
  const classes = Object.values(st.classes).filter((k) => wanted.has(k.id) && !k.legs?.length)
    .sort((a, b) => String(a.name).localeCompare(String(b.name), undefined, { numeric: true }));
  // the members of a pair or a patrol leave together: one of them is drawn, the others take their time
  const mates = new Map();
  const of = (k) => {
    const all = Object.values(st.runners).filter((r) => r.cls === k.id && r.status !== "dns" && !(opt.keep && r.start != null));
    if (!k.team) return all;
    const seen = new Map(), out = [];
    for (const r of all.sort((a, b) => (a.leg || 0) - (b.leg || 0))) {
      const lead = r.team && st.teams[r.team] ? seen.get(r.team) : null;
      if (lead) mates.get(lead.id).push(r.id);
      else { out.push(r); mates.set(r.id, []); if (r.team) seen.set(r.team, r); }
    }
    return out;
  };
  const rows = [], blocks = [];
  const byCourse = new Map();
  for (const k of classes) { const c = k.course || `-${k.id}`; (byCourse.get(c) || byCourse.set(c, []).get(c)).push(k); }
  let last = opt.first ?? st.event.zero ?? 0;
  for (const [cid, ks] of byCourse) {
    let t = opt.first ?? st.event.zero ?? 0;
    // places already taken on this course by runners who keep their time
    const taken = new Set();
    if (opt.keep) for (const k of ks) for (const r of Object.values(st.runners)) if (r.cls === k.id && r.start != null) taken.add(r.start);
    const next = () => { while (taken.has(t)) t += step; const s = t; t += step; return s; };
    const lay = (name, list) => {
      if (!list.length && !vacant) return;
      const first = t;
      let end = t;
      for (const r of separate(list, gap, rand)) { end = next(); rows.push(["runners", r.id, { start: end }]); for (const id of mates.get(r.id) || []) rows.push(["runners", id, { start: end }]); }
      t += vacant * step;
      blocks.push({ name, first, last: end, n: list.length });
      if (end > last) last = end;
    };
    if (opt.by === "course") lay(st.courses[cid]?.name || ks.map((k) => k.name).join(" + "), ks.flatMap(of));
    else for (const k of ks) lay(k.name, of(k));
  }
  return { rows, blocks, last };
}

/** What a start list should not have: `[{ kind "club"|"same"|"none", runners: [ids], course }]`. */
export function checkStarts(st, { gap = 1 } = {}) {
  const out = [], byCourse = new Map();
  for (const r of Object.values(st.runners)) {
    const k = st.classes[r.cls];
    if (!k || k.legs?.length || r.status === "dns") continue;
    if (r.start == null) { out.push({ kind: "none", runners: [r.id] }); continue; }
    if (k.team && r.team && st.teams[r.team]?.runners?.[0] !== r.id && st.runners[st.teams[r.team].runners[0]]?.start === r.start) continue;   // beside their team-mate
    const c = r.course || k.course || `-${k.id}`;
    (byCourse.get(c) || byCourse.set(c, []).get(c)).push(r);
  }
  for (const [course, list] of byCourse) {
    list.sort((a, b) => a.start - b.start);
    for (let i = 1; i < list.length; i++) {
      if (list[i].start === list[i - 1].start) out.push({ kind: "same", runners: [list[i - 1].id, list[i].id], course });
      else if (gap) for (let j = Math.max(0, i - gap); j < i; j++) {
        if (list[i].club && list[i].club === list[j].club && list[j].start !== list[i].start) { out.push({ kind: "club", runners: [list[j].id, list[i].id], course }); break; }
      }
    }
  }
  return out;
}
