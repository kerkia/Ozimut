// Judging: one runner's card against their course. Pure functions on the state (docs/chrono/design.md).
// A course is a list of control codes in order. The card's punches are matched to it by the longest common subsequence,
// earliest punches first: what the course asks and the card lacks is « missing », what the card holds beyond is « extra ».
// A class may offer several courses (a pool: forked legs, relay variants): the course the card fits best is the runner's.
// A score course takes each of its controls once, in any order, for its points, less a penalty per started unit of time
// beyond the limit. Statuses: ok, mp (a control missing), dnf (no finish), dns, dsq, ot (over time), nc (not competing),
// run (out, no card read yet), wait (not started yet). A status set by hand wins over the card's.

export const STATUSES = ["ok", "mp", "dnf", "dns", "dsq", "ot", "nc", "run", "wait"];
export const FINAL = new Set(["ok", "mp", "dnf", "dns", "dsq", "ot", "nc"]);

/** The punches that count: the hand-corrected list when there is one. */
export const punchesOf = (read) => (read?.ed?.punches || read?.punches || []);
const codesOf = (st, code) => { const c = st.controls[code]; return c?.any?.length ? [Number(code), ...c.any.map(Number)] : [Number(code)]; };

/** Longest common subsequence of a course and a card: `at[i]` = the punch index matched to course control i, or -1. */
export function match(st, codes, punches) {
  const n = codes.length, m = punches.length;
  const ok = codes.map((c) => new Set(codesOf(st, c)));
  // L[i][j]: the most controls of codes[i..] matched in punches[j..]
  const L = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) {
    L[i][j] = ok[i].has(punches[j][0]) ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  }
  const at = new Array(n).fill(-1);
  for (let i = 0, j = 0; i < n && j < m;) {
    if (ok[i].has(punches[j][0]) && L[i][j] === L[i + 1][j + 1] + 1) { at[i] = j; i++; j++; }
    else if (L[i + 1][j] >= L[i][j + 1]) i++;
    else j++;
  }
  return { at, hit: L[0][0] };
}

/** The courses a runner may be on: the class's course, its pool, or a relay leg's. */
export function coursesFor(st, runner) {
  const k = st.classes[runner.cls];
  if (!k) return [];
  const leg = k.legs && runner.leg ? k.legs[runner.leg - 1] : null;
  const ids = leg ? (leg.pool?.length ? leg.pool : leg.course ? [leg.course] : []) : (k.pool?.length ? k.pool : k.course ? [k.course] : []);
  const fixed = runner.course && st.courses[runner.course] ? [runner.course] : ids;      // a variant given to the runner (a bib's fork)
  return fixed.map((id) => st.courses[id]).filter(Boolean);
}

function startOf(st, runner, read, hint) {
  const ev = st.event, k = st.classes[runner.cls];
  const leg = k?.legs && runner.leg ? k.legs[runner.leg - 1] : null;
  if (read?.rel) return 0;
  if (leg) return runner.start ?? leg.mass ?? hint ?? (runner.leg === 1 ? k.first ?? ev.zero : null) ?? read?.start ?? null;   // a relay leg: the handover
  if (ev.startMode === "punch") return read?.start ?? runner.start ?? null;
  if (ev.startMode === "mass") return runner.start ?? k?.first ?? ev.zero ?? read?.start ?? null;
  return runner.start ?? read?.start ?? null;
}

function finishOf(st, read, course) {
  if (!read) return null;
  if (!read.rel) return read.ed?.finish ?? read.finish ?? null;
  // an Emit card has no finish field: the last punch that is not a control of the course (the finish unit or the reader)
  const P = punchesOf(read), on = new Set((course?.controls || []).flatMap((c) => codesOf(st, c)));
  for (let j = P.length - 1; j > 0; j--) if (!on.has(P[j][0]) && P[j][0] !== 0) return P[j][1];
  return null;
}

function judgeScore(st, course, P, start, finish) {
  const seen = new Set(), taken = [];
  const any = new Map();
  for (const c of course.controls) for (const x of codesOf(st, c)) any.set(x, Number(c));
  for (const [code, s] of P) {
    const c = any.get(code);
    if (c == null || seen.has(c)) continue;
    seen.add(c);
    taken.push({ code: c, s, t: start != null ? s - start : null, pts: st.controls[c]?.pts ?? st.event.score?.pts ?? 1 });
  }
  const gross = taken.reduce((a, x) => a + x.pts, 0);
  const sc = st.event.score || {}, time = start != null && finish != null ? finish - start : null;
  const over = time != null && sc.limit ? Math.max(0, time - sc.limit) : 0;
  const penalty = over > 0 ? Math.ceil(over / (sc.per || 60)) * (sc.penalty ?? 1) : 0;
  return { taken, gross, penalty, points: Math.max(0, gross - penalty), over };
}

/**
 * A runner's result: `{ status, auto (the card's own verdict), time, start, finish, course, splits: [{ code, s, t, leg }],
 * missing: [codes], extra: [[code, s]], points?, read }`. `now`: seconds after midnight, to tell « out » from « not started ».
 */
export function judge(st, runner, read, now = null, hint = null) {
  const out = { status: "wait", auto: null, time: null, start: null, finish: null, course: null, splits: [], missing: [], extra: [], read: read || null };
  const cands = coursesFor(st, runner);
  const P = read ? punchesOf(read) : [];
  let course = cands[0] || null, best = null;
  if (read) {
    for (const c of cands) {
      const m = c.score ? { at: [], hit: 0 } : match(st, c.controls, P);
      const miss = c.controls.length - m.hit;
      if (!best || miss < best.miss) { best = { c, m, miss }; if (!miss) break; }
    }
    if (best) course = best.c;
  }
  out.course = course?.id || null;
  out.start = read?.ed?.start ?? startOf(st, runner, read, hint);
  if (!read) {
    out.status = runner.status || (out.start != null && now != null && now >= out.start ? "run" : "wait");
    return out;
  }
  out.finish = finishOf(st, read, course);
  const raw = out.start != null && out.finish != null ? out.finish - out.start : null;
  out.time = raw != null ? Math.round((raw + (runner.adj || 0)) * 10) / 10 : null;
  if (course?.score) {
    const sc = judgeScore(st, course, P, out.start, out.finish);
    Object.assign(out, { points: sc.points, gross: sc.gross, penalty: sc.penalty });
    out.splits = sc.taken.map((x, i, a) => ({ code: x.code, s: x.s, t: x.t, leg: x.t != null ? x.t - (i ? a[i - 1].t ?? 0 : 0) : null, pts: x.pts }));
    out.auto = out.finish == null ? "dnf" : "ok";
  } else if (course) {
    const { at } = best.m, used = new Set(at.filter((j) => j >= 0));
    let prev = 0;
    course.controls.forEach((code, i) => {
      const j = at[i];
      if (j < 0) { out.missing.push(Number(code)); out.splits.push({ code: Number(code), s: null, t: null, leg: null }); return; }
      const s = P[j][1], t = out.start != null ? Math.round((s - out.start) * 10) / 10 : null;
      out.splits.push({ code: Number(code), s, t, leg: t != null ? Math.round((t - prev) * 10) / 10 : null });
      if (t != null) prev = t;
    });
    out.extra = P.filter((_, j) => !used.has(j));
    out.auto = out.finish == null ? "dnf" : out.missing.length ? "mp" : "ok";
  } else {
    out.auto = out.finish == null ? "dnf" : "ok";            // no course known: a time, nothing to check
    out.extra = P.slice();
  }
  // over time: the class's longest time, or the circuits' closing time on the clock
  const k = st.classes[runner.cls];
  if (out.auto === "ok" && ((k?.maxTime && out.time != null && out.time > k.maxTime)
    || (st.event.close != null && out.finish != null && !read.rel && out.finish > st.event.close))) out.auto = "ot";
  out.status = runner.status || (k?.nc && out.auto === "ok" ? "nc" : out.auto);
  return out;
}

/** The read that counts for each runner (the latest one given to them), and the reads given to nobody. */
export function readsByRunner(st) {
  const by = new Map(), loose = [];
  for (const r of Object.values(st.reads)) {
    if (r.runner === 0) continue;                              // set aside
    if (r.runner && st.runners[r.runner]) { const was = by.get(r.runner); if (!was || was.at <= r.at) by.set(r.runner, r); }
    else loose.push(r);
  }
  loose.sort((a, b) => a.at - b.at);
  return { by, loose };
}

/** The runners holding a card number today. */
export function holders(st, card) {
  const n = Number(card);
  return n ? Object.values(st.runners).filter((r) => Number(r.card) === n) : [];
}

/** Whose card is this, at the moment it is read: its only holder, else its one holder without a read yet; null when in doubt. */
export function ownerOf(st, card) {
  const all = holders(st, card);
  if (all.length === 1) return all[0].id;
  const { by } = readsByRunner(st);
  const free = all.filter((r) => !by.has(r.id));
  return free.length === 1 ? free[0].id : null;
}

/** A guess for an unknown card: the courses it fits best, the best first. */
export function guessCourse(st, read) {
  const P = punchesOf(read);
  return Object.values(st.courses).map((c) => {
    const hit = c.score ? P.filter(([code]) => c.controls.map(Number).includes(code)).length : match(st, c.controls, P).hit;
    return { id: c.id, name: c.name, hit, of: c.controls.length };
  }).filter((x) => x.hit > 0).sort((a, b) => (b.hit / b.of) - (a.hit / a.of) || b.hit - a.hit).slice(0, 3);
}
