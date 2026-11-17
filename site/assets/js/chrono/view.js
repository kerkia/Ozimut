// The race as lists: every runner judged, ranked by class and by course, with the places at each control; the problems
// that wait for someone; the figures of the status line. Pure: state in, plain objects out (docs/chrono/design.md).

import { judge, readsByRunner, holders, FINAL } from "./judge.js";
import { rulesOf } from "./rules/index.js";

const ORDER = ["ok", "nc", "mp", "dnf", "ot", "dsq", "dns", "run", "wait"];
const byName = (a, b) => String(a.name).localeCompare(String(b.name), undefined, { numeric: true });

function rowOf(st, r, j) {
  const club = st.clubs[r.club], k = st.classes[r.cls];
  return {
    id: r.id, family: r.family || "", given: r.given || "", club: club?.name || "", clubCode: club?.code || "", clubId: r.club || null,
    lic: r.lic || "", card: r.card || null, cat: r.cat || "", sex: r.sex || "", birth: r.birth || "", bib: r.bib ?? "", nat: r.nat || "",
    cls: r.cls || null, clsName: k?.name || "", course: j.course, start: j.start, finish: j.finish, time: j.time, status: j.status, auto: j.auto,
    manual: !!r.status, adj: r.adj || 0, splits: j.splits.map((s) => ({ ...s })), missing: j.missing, extra: j.extra,
    points: j.points, gross: j.gross, penalty: j.penalty, read: j.read?.id || null, rent: r.rent || 0, leg: r.leg || 0, team: r.team || null,
    place: null, behind: null,
  };
}

/** Places among the classified (equal results share a place), then the others in the rules' order of statuses. */
export function rank(rows, { score = false, tenths = false, order = ORDER } = {}) {
  const key = (r) => (tenths ? r.time : Math.floor(r.time));
  const ok = rows.filter((r) => r.status === "ok" && r.time != null);
  ok.sort(score ? (a, b) => (b.points ?? 0) - (a.points ?? 0) || key(a) - key(b) : (a, b) => key(a) - key(b));
  let place = 0;
  ok.forEach((r, i) => {
    const p = ok[i - 1];
    if (!p || key(r) !== key(p) || (score && r.points !== p.points)) place = i + 1;
    r.place = place;
    r.behind = score ? null : key(r) - key(ok[0]);
  });
  const at = (s) => { const i = order.indexOf(s); return i < 0 ? 99 : i; };
  const rest = rows.filter((r) => !ok.includes(r)).sort((a, b) => at(a.status) - at(b.status)
    || (a.status === "run" || a.status === "wait" ? (a.start ?? 1e9) - (b.start ?? 1e9) : 0)
    || a.family.localeCompare(b.family) || a.given.localeCompare(b.given));
  for (const r of rest) { r.place = null; r.behind = null; }
  return ok.concat(rest);
}

/** Each control's places: on the time from the start (`p`, `g`) and on the leg into it (`lp`, `lg`). */
function splitPlaces(rows) {
  const n = Math.max(0, ...rows.map((r) => r.splits.length));
  for (let i = 0; i < n; i++) {
    for (const [f, p, g] of [["t", "p", "g"], ["leg", "lp", "lg"]]) {
      const have = rows.filter((r) => r.splits[i] && r.splits[i][f] != null && r.splits[i][f] >= 0).sort((a, b) => a.splits[i][f] - b.splits[i][f]);
      let place = 0;
      have.forEach((r, x) => {
        const s = r.splits[i];
        if (!x || s[f] !== have[x - 1].splits[i][f]) place = x + 1;
        s[p] = place;
        s[g] = Math.round((s[f] - have[0].splits[i][f]) * 10) / 10;
      });
    }
  }
}

const courseOut = (c) => (c ? { id: c.id, name: c.name, length: c.length ?? null, climb: c.climb ?? null, controls: (c.controls || []).map(Number), score: !!c.score } : null);
const clone = (r) => ({ ...r, splits: r.splits.map((s) => ({ ...s })) });

function relayTeams(st, k, rowsById, opt) {
  const legs = k.legs.length, teams = [];
  for (const tm of Object.values(st.teams)) {
    if (tm.cls !== k.id) continue;
    const members = (tm.runners || []).map((id) => rowsById.get(id) || null);
    let status = "ok", time = 0, done = 0;
    for (let i = 0; i < legs; i++) {
      const r = members[i];
      if (!r) { if (status === "ok") status = "wait"; continue; }
      if (r.status === "ok" && r.time != null) { time += r.time; done++; } else if (status === "ok") status = r.status;
    }
    if (status === "ok" && done < legs) status = "run";
    const club = st.clubs[tm.club];
    teams.push({ id: tm.id, name: tm.name || club?.name || "", club: club?.name || "", clubCode: club?.code || "", bib: tm.bib ?? "", family: tm.name || "", given: "",
      status, time: status === "ok" ? Math.round(time * 10) / 10 : null, done, legs: members, place: null, behind: null });
  }
  return rank(teams, opt);
}

/**
 * The whole race: `{ event, rules, classes: [{ id, name, course, rows, teams? }], courses: [{ id, name, …, rows }],
 * loose: [reads given to nobody], counts, byRunner: Map(id → row) }`. `now`: seconds after midnight.
 */
export function buildView(st, { now = null } = {}) {
  const rules = rulesOf(st), { by, loose } = readsByRunner(st);
  const opt = { tenths: !!st.event.tenths, order: rules.order || ORDER };
  const rows = new Map();
  // relay legs take their start from the leg before: judge the teams' runners in leg order
  const hint = new Map();
  const list = Object.values(st.runners).sort((a, b) => (a.leg || 0) - (b.leg || 0));
  for (const r of list) {
    const j = judge(st, r, by.get(r.id) || null, now, hint.get(r.id) ?? null);
    const row = rowOf(st, r, j);
    rows.set(r.id, row);
    const tm = r.team && st.teams[r.team];
    if (tm && r.leg && j.finish != null) { const next = tm.runners?.[r.leg]; if (next) hint.set(next, j.finish); }
  }
  const classes = [];
  for (const k of Object.values(st.classes).sort(byName)) {
    const mine = [...rows.values()].filter((r) => r.cls === k.id);
    const course = st.courses[k.course] || null, score = !!course?.score;
    const out = { id: k.id, name: k.name, course: courseOut(course), nc: !!k.nc, rows: rank(mine, { ...opt, score }) };
    if (!k.pool?.length && !k.legs?.length && !score) splitPlaces(out.rows);
    if (k.legs?.length) out.teams = relayTeams(st, k, rows, opt);
    classes.push(out);
  }
  const none = [...rows.values()].filter((r) => !r.cls || !st.classes[r.cls]);
  if (none.length) classes.push({ id: null, name: "", course: null, rows: rank(none, opt) });
  const courses = [];
  for (const c of Object.values(st.courses).sort(byName)) {
    const mine = [...rows.values()].filter((r) => r.course === c.id).map(clone);
    if (!mine.length && !Object.values(st.classes).some((k) => k.course === c.id)) continue;
    const out = { ...courseOut(c), rows: rank(mine, { ...opt, score: !!c.score }) };
    if (!c.score) splitPlaces(out.rows);
    courses.push(out);
  }
  const all = [...rows.values()], n = (f) => all.filter(f).length;
  const counts = {
    entries: all.length, read: n((r) => r.read), out: n((r) => r.status === "run"), wait: n((r) => r.status === "wait"),
    ok: n((r) => r.status === "ok"), mp: n((r) => r.status === "mp"), dnf: n((r) => r.status === "dnf"), dns: n((r) => r.status === "dns"),
    dsq: n((r) => r.status === "dsq"), ot: n((r) => r.status === "ot"), nc: n((r) => r.status === "nc"), loose: loose.length,
    done: n((r) => FINAL.has(r.status)),
  };
  return { event: st.event, rules, classes, courses, loose, counts, byRunner: rows };
}

/**
 * What waits for someone, the most pressing first: `[{ kind, level "stop"|"warn"|"info", read?, runner?, runners?, code?, n? }]`.
 * Kinds: unknown (a card nobody holds), doubt (a card several hold), nofinish, nostart, mp (to check), reread, dupcard,
 * nocls, nocourse, clock (a unit's clock off), out (still out after the closing time), rent (a rented card not handed back), unpaid.
 */
export function problems(st, view, { now = null } = {}) {
  const out = [], rows = [...view.byRunner.values()];
  for (const r of view.loose) out.push({ kind: holders(st, r.card).length > 1 ? "doubt" : "unknown", level: "stop", read: r.id, card: r.card });
  const perRunner = new Map();
  for (const r of Object.values(st.reads)) if (r.runner && st.runners[r.runner]) perRunner.set(r.runner, (perRunner.get(r.runner) || 0) + 1);
  for (const r of rows) {
    if (r.read && r.finish == null && !r.manual) out.push({ kind: "nofinish", level: "stop", runner: r.id, read: r.read });
    else if (r.read && r.start == null && !r.manual) out.push({ kind: "nostart", level: "stop", runner: r.id, read: r.read });
    else if (r.read && r.auto === "mp" && !r.manual && !st.reads[r.read]?.ed?.seen) out.push({ kind: "mp", level: "warn", runner: r.id, read: r.read });
    if ((perRunner.get(r.id) || 0) > 1) out.push({ kind: "reread", level: "info", runner: r.id, n: perRunner.get(r.id) });
    if (!r.cls) out.push({ kind: "nocls", level: "warn", runner: r.id });
    if (st.event.close != null && now != null && now > st.event.close && r.status === "run") out.push({ kind: "out", level: "stop", runner: r.id });
    if (r.rent && r.read && st.runners[r.id]?.rent === 1) out.push({ kind: "rent", level: "info", runner: r.id });
    const e = st.runners[r.id];
    if (e?.fee > 0 && !e.paid) out.push({ kind: "unpaid", level: "info", runner: r.id });
  }
  const cards = new Map();
  for (const r of Object.values(st.runners)) if (r.card) (cards.get(Number(r.card)) || cards.set(Number(r.card), []).get(Number(r.card))).push(r.id);
  for (const [card, ids] of cards) if (ids.length > 1) out.push({ kind: "dupcard", level: "warn", card, runners: ids });
  for (const k of Object.values(st.classes)) {
    const used = rows.some((r) => r.cls === k.id);
    if (used && !k.course && !k.pool?.length && !k.legs?.length) out.push({ kind: "nocourse", level: "warn", cls: k.id });
  }
  // a unit whose clock is off: the leg into it (or out of it) negative for two runners or more
  const neg = new Map();
  for (const c of view.courses) for (const r of c.rows) r.splits.forEach((s) => { if (s.leg != null && s.leg < 0) neg.set(s.code, (neg.get(s.code) || 0) + 1); });
  for (const [code, n] of neg) if (n >= 2) out.push({ kind: "clock", level: "warn", code, n });
  const lv = { stop: 0, warn: 1, info: 2 };
  return out.sort((a, b) => lv[a.level] - lv[b.level]);
}

const LIVE = { ok: 0, dns: 1, dnf: 2, mp: 3, dsq: 4, ot: 5, run: 9, wait: 10, nc: 12 };
const cs = (s) => (s == null ? null : Math.round(s * 100));

/** The lists in the compact form « En direct » reads (liveresultat's): hundredths of a second. */
export function toLive(view, by = "class") {
  const out = { order: [], classes: {} };
  for (const g of by === "course" ? view.courses : view.classes) {
    if (!g.rows.length) continue;
    let name = g.name || "?";
    while (out.classes[name]) name += " ";
    const c = by === "course" ? g : g.course;
    const codes = c && !c.score ? c.controls || [] : [];
    const fine = codes.length && g.rows.every((r) => !r.read || r.splits.length === codes.length);
    out.classes[name] = {
      controls: fine ? codes.map((c, i) => [String(c), String(i + 1)]) : [],
      rows: g.rows.map((r) => {
        const done = r.status === "ok" && r.time != null;
        return [r.place, [r.given, r.family].filter(Boolean).join(" "), r.club, done ? cs(r.time) : null, LIVE[r.status] ?? 12,
          done && r.behind != null ? cs(r.behind) : null, null, cs(r.start),
          fine && r.read ? r.splits.map((s) => (s.t == null || s.p == null ? null : [cs(s.t), s.p, cs(s.g)])) : null];
      }),
    };
    out.order.push(name);
  }
  return out;
}

/** The view exporters take (design.md): by class, or by course with the classes merged. */
export function exportView(view, by = "class") {
  return {
    event: view.event,
    classes: (by === "course" ? view.courses : view.classes).filter((g) => g.rows.length).map((g) => ({
      id: g.id, name: g.name, course: by === "course" ? { name: g.name, length: g.length, climb: g.climb, controls: g.controls } : g.course,
      rows: g.rows.map((r) => ({ place: r.place, family: r.family, given: r.given, club: r.club, clubCode: r.clubCode, lic: r.lic, card: r.card, cat: r.cat || r.clsName,
        sex: r.sex, birth: r.birth, bib: r.bib, nat: r.nat, start: r.start, finish: r.finish, time: r.time, status: r.status, points: r.points,
        splits: r.splits.map((s) => ({ code: s.code, t: s.t })), cls: r.clsName, rent: r.rent })),
    })),
  };
}
