// This Source Code Form is subject to the terms of the Mozilla Public License, v. 2.0. If a copy of the MPL was not
// distributed with this file, You can obtain one at https://mozilla.org/MPL/2.0/.

// Lists an organiser composes (what OE calls report layouts): which rows, grouped how, which columns, sorted how — as
// groups of rows, as a page for a printer or a wall screen, as a table for a spreadsheet. A list's definition is kept on
// the event under its own key « list.<id> », so two stations changing different lists never overwrite each other.
// Pure: no DOM, no text of its own. `L` = the labels of lists.js ({ title, status: {…}, runners, km, climb, controls,
// printed }) plus { cols: { column key: label }, splits, empty, noClub, money(n) → text }.

import { clock, span } from "../times.js";
import { feeOf, csvCell } from "./invoices.js";

export const KINDS = ["results", "starts", "entries"];
export const GROUPS = ["class", "course", "club", "none"];
export const SIZES = ["s", "m", "l"];
export const STATUSES = ["ok", "mp", "dnf", "dns", "dsq", "ot", "nc", "run", "wait"];
const ORDER = ["ok", "nc", "mp", "dnf", "ot", "dsq", "dns", "run", "wait"];

const e = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const cmp = (a, b) => String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: "base" });
const entry = (st, r) => st?.runners?.[r.id] || {};
const timed = (r) => (r.status === "ok" || r.status === "nc") && r.time != null;
const label = (L, s) => L?.status?.[s] || s || "";
const tick = (v, csv) => (v ? (csv ? "1" : "✓") : "");
const money = (n, L) => (n == null ? "" : L?.money ? L.money(n) : Number(n).toFixed(2));
const ALL = KINDS, RES = ["results"];

/**
 * Every column: `kinds` the lists it applies to, `num` right-aligned, `get(row, st)` its value (what a sort compares),
 * `text(row, st, L, csv)` what is written (the value itself when absent), `sort(row, st)` another value to sort by,
 * `flag(row)` true when the cell is a status to stress, `box` an empty box to tick or sign.
 */
export const COLUMNS = Object.freeze({
  place: { kinds: RES, num: true, get: (r) => r.place },
  bib: { kinds: ALL, num: true, get: (r) => (r.bib === "" ? null : r.bib) },
  name: { kinds: ALL, get: (r) => `${r.given} ${r.family}`.trim(), sort: (r) => `${r.family} ${r.given}`.trim() },
  family: { kinds: ALL, get: (r) => r.family },
  given: { kinds: ALL, get: (r) => r.given },
  club: { kinds: ALL, get: (r) => r.club },
  clubCode: { kinds: ALL, get: (r) => r.clubCode },
  cls: { kinds: ALL, get: (r) => r.clsName },
  cat: { kinds: ALL, get: (r) => r.cat },
  course: { kinds: ALL, get: (r, st) => st?.courses?.[r.course]?.name || "" },
  card: { kinds: ALL, num: true, get: (r) => r.card },
  lic: { kinds: ALL, get: (r) => r.lic },
  birth: { kinds: ALL, get: (r) => r.birth },
  sex: { kinds: ALL, get: (r) => r.sex },
  nat: { kinds: ALL, get: (r) => r.nat },
  start: { kinds: ALL, num: true, get: (r) => r.start, text: (r) => clock(r.start) },
  finish: { kinds: RES, num: true, get: (r) => r.finish, text: (r) => clock(r.finish) },
  time: { kinds: RES, num: true, get: (r) => (timed(r) ? r.time : null), text: (r, st, L) => (timed(r) ? span(r.time) : label(L, r.status)), flag: (r) => !timed(r) },
  behind: { kinds: RES, num: true, get: (r) => r.behind, text: (r) => (r.behind ? `+${span(r.behind)}` : "") },
  status: { kinds: ["results", "entries"], get: (r) => r.status, text: (r, st, L) => label(L, r.status), sort: (r) => { const i = ORDER.indexOf(r.status); return i < 0 ? null : i; }, flag: (r) => r.status !== "ok" },
  points: { kinds: RES, num: true, get: (r) => r.points },
  rent: { kinds: ALL, get: (r) => (r.rent ? 1 : null), text: (r, st, L, csv) => tick(r.rent, csv) },
  fee: { kinds: ALL, num: true, get: (r, st) => (st?.runners?.[r.id] && !st.runners[r.id].of ? feeOf(st, st.runners[r.id]) : null), text: (r, st, L) => money(COLUMNS.fee.get(r, st), L) },
  paid: { kinds: ALL, get: (r, st) => (entry(st, r).paid ? 1 : null), text: (r, st, L, csv) => tick(entry(st, r).paid, csv) },
  note: { kinds: ALL, get: (r, st) => entry(st, r).note || "" },
  sign: { kinds: ALL, box: true, get: () => "" },
});
const isCol = (k, kind) => typeof k === "string" && Object.hasOwn(COLUMNS, k) && COLUMNS[k].kinds.includes(kind);
/** The columns a kind of list may show, in the order above. */
export const columnsOf = (kind) => Object.keys(COLUMNS).filter((k) => isCol(k, kind));

const DEFAULTS = {
  results: { by: "class", cols: ["place", "name", "club", "time", "behind"] },
  starts: { by: "class", cols: ["start", "bib", "name", "club", "card"] },
  entries: { by: "club", cols: ["name", "cls", "card", "lic", "start"] },
};
const ID = /^[A-Za-z0-9_-]{1,40}$/;
/** A new list's id (letters and digits: it ends an event key). */
export function newListId() {
  const A = "abcdefghjkmnpqrstuvwxyz23456789";
  let s = "";
  for (let i = 0; i < 9; i++) s += A[Math.floor(Math.random() * A.length)];
  return s;
}

/** A list of a kind as it starts: `name` is the caller's (a text of the catalogue). */
export function defaultList(kind = "results", name = "") {
  const k = KINDS.includes(kind) ? kind : "results";
  return { id: newListId(), name: String(name || ""), kind: k, by: DEFAULTS[k].by, cols: [...DEFAULTS[k].cols], sort: "", desc: false, classes: null, statuses: null, top: null,
    splits: false, breaks: false, size: "m", landscape: false, head: "", foot: "" };
}

const text = (v, max) => (typeof v === "string" ? v.slice(0, max) : typeof v === "number" && Number.isFinite(v) ? String(v) : "");
const strings = (v, max, ok = () => true) => (Array.isArray(v) ? [...new Set(v.filter((x) => (typeof x === "string" || typeof x === "number") && ok(String(x))).map(String))].slice(0, max) : null);

/**
 * A definition made safe: only the known fields, each of its type, the columns the kind has (the kind's own when none is
 * left) — definitions come from a log other stations write, and from files.
 */
export function normalise(def) {
  const d = def && typeof def === "object" && !Array.isArray(def) ? def : {};
  const get = (k) => (Object.hasOwn(d, k) ? d[k] : undefined);
  const kind = KINDS.includes(get("kind")) ? get("kind") : "results";
  const cols = (strings(get("cols"), 100, (k) => isCol(k, kind)) || []).slice(0, 40);
  const tv = get("top"), top = typeof tv === "number" || typeof tv === "string" ? Number(tv) : NaN;
  return {
    id: typeof get("id") === "string" && ID.test(get("id")) ? get("id") : newListId(),
    name: text(get("name"), 80).trim(),
    kind,
    by: GROUPS.includes(get("by")) ? get("by") : DEFAULTS[kind].by,
    cols: cols.length ? cols : [...DEFAULTS[kind].cols],
    sort: isCol(get("sort"), kind) ? get("sort") : "",
    desc: get("desc") === true || get("desc") === 1,
    classes: strings(get("classes"), 1000, (x) => x.length <= 60),
    statuses: strings(get("statuses"), 20, (x) => STATUSES.includes(x)),
    top: kind === "results" && Number.isFinite(top) && top >= 1 ? Math.min(999, Math.floor(top)) : null,
    splits: kind === "results" && (get("splits") === true || get("splits") === 1),
    breaks: get("breaks") === true || get("breaks") === 1,
    size: SIZES.includes(get("size")) ? get("size") : "m",
    landscape: get("landscape") === true || get("landscape") === 1,
    head: text(get("head"), 2000),
    foot: text(get("foot"), 2000),
  };
}

/** The lists saved with the event (its keys « list.<id> »), by name. */
export function savedLists(st) {
  const out = [];
  for (const [k, v] of Object.entries(st?.event || {})) {
    if (!k.startsWith("list.") || !v || typeof v !== "object" || Array.isArray(v)) continue;
    const id = k.slice(5);
    if (ID.test(id)) out.push(normalise({ ...v, id }));
  }
  return out.sort((a, b) => cmp(a.name, b.name) || cmp(a.id, b.id));
}

const courseLine = (c, L) => (c ? [c.length != null ? `${(c.length / 1000).toFixed(1)} ${L?.km || "km"}` : "", c.climb != null ? `${Math.round(c.climb)} ${L?.climb || "m"}` : "",
  c.controls?.length && L?.controls ? `${c.controls.length} ${L.controls}` : ""].filter(Boolean).join(" · ") : "");
const byName = (a, b) => cmp(a.family, b.family) || cmp(a.given, b.given);
const NATURAL = {
  starts: (a, b) => (a.start ?? 1e9) - (b.start ?? 1e9) || byName(a, b),
  entries: byName,
  // every class together: the classified by time (a score race: by points), then the others as the lists order them
  results: (a, b) => {
    const x = a.status === "ok" && a.time != null, y = b.status === "ok" && b.time != null;
    if (x !== y) return x ? -1 : 1;
    if (x) return (b.points ?? 0) - (a.points ?? 0) || a.time - b.time || byName(a, b);
    return ORDER.indexOf(a.status) - ORDER.indexOf(b.status) || byName(a, b);
  },
};

/**
 * The list's groups after its filters and its sort: `[{ id, name, sub, course, rows }]` (no empty group; one group
 * without a name when nothing groups). `sub`: the course's length, climb and controls, written with `L` when given.
 * « The first N » are the runners placed N or better in their class (in their course when grouped by course).
 */
export function listRows(st, view, def, L = null) {
  const d = normalise(def), only = d.classes ? new Set(d.classes) : null, stat = d.statuses ? new Set(d.statuses) : null;
  const keep = (r) => (!only || only.has(String(r.cls || ""))) && (!stat || stat.has(r.status)) && (!d.top || (r.place != null && r.place <= d.top));
  const flat = () => (view.classes || []).flatMap((k) => k.rows);
  let groups;
  if (d.by === "class") groups = (view.classes || []).map((k) => ({ id: k.id ?? "", name: k.name || "", course: k.course || null, rows: k.rows }));
  else if (d.by === "course") {
    groups = (view.courses || []).map((c) => ({ id: c.id, name: c.name || "", course: c, rows: c.rows }));
    const known = new Set(groups.map((g) => g.id)), rest = flat().filter((r) => !r.course || !known.has(r.course));
    if (rest.length) groups.push({ id: "", name: "", course: null, rows: rest });
  } else if (d.by === "club") {
    const by = new Map();
    for (const r of flat()) { const id = r.clubId || ""; (by.get(id) || by.set(id, { id, name: id ? r.club : L?.noClub || "", course: null, rows: [] }).get(id)).rows.push(r); }
    groups = [...by.values()].sort((a, b) => (a.id === "") - (b.id === "") || cmp(a.name, b.name));
  } else groups = [{ id: "", name: "", course: null, rows: flat() }];

  // a list in its natural order, reversed: by the same column the other way (the runners without a start time stay last)
  const key = d.sort || (d.desc ? { starts: "start", entries: "name" }[d.kind] || "" : "");
  const col = key ? COLUMNS[key] : null, val = col ? col.sort || col.get : null;
  const none = (v) => v === null || v === undefined || v === "";
  const out = [];
  for (const g of groups) {
    let rows = g.rows.filter(keep);
    if (!rows.length) continue;
    if (d.kind !== "results") rows.sort(NATURAL[d.kind]);
    else if (d.by === "none") rows.sort(NATURAL.results);
    else if (d.by === "club") { const at = new Map(rows.map((r, i) => [r, i])); rows.sort((a, b) => cmp(a.clsName, b.clsName) || at.get(a) - at.get(b)); }
    // (by class or course: the view's own ranking)
    if (val) {
      rows.sort((a, b) => {
        const x = val(a, st), y = val(b, st);
        if (none(x) || none(y)) return none(x) - none(y);         // nothing to compare: last, whichever way the sort goes
        const c = typeof x === "number" && typeof y === "number" ? x - y : cmp(x, y);
        return d.desc ? -c : c;
      });
    } else if (d.desc) rows.reverse();
    out.push({ id: g.id, name: g.name, sub: courseLine(g.course, L), course: g.course, rows });
  }
  return out;
}

const cell = (k, r, st, L, csv = false) => { const c = COLUMNS[k], v = c.text ? c.text(r, st, L, csv) : c.get(r, st); return v === null || v === undefined ? "" : String(v); };
const splitsOf = (r) => (r.read && r.splits?.length ? r.splits : []);

const CSS = `body{font:12px/1.35 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:#111;margin:14px}h1{font-size:18px;margin:0 0 2px}
.sub{color:#555;margin:0 0 12px}h2{font-size:14px;margin:16px 0 4px;border-bottom:2px solid #e8590c;padding-bottom:2px;break-after:avoid}h2 small{font-weight:400;color:#555;margin-left:8px}
table{border-collapse:collapse;width:100%;break-inside:auto}th{text-align:left;font-weight:600;color:#555;border-bottom:1px solid #bbb;padding:2px 6px}
td{padding:2px 6px;border-bottom:1px solid #eee;vertical-align:top}tr{break-inside:avoid}.n{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
.sp{font-size:10px;color:#333}.sp b{color:#e8590c}.st{color:#b02a37;font-weight:600}.hf{white-space:pre-wrap;margin:0 0 10px}.hf.foot{margin:14px 0 0}
td.box{min-width:5em;border:1px solid #999}.pb{break-before:page}
body.s{font-size:10px}.s h1{font-size:15px}.s h2{font-size:12px}.s .sp{font-size:8.5px}body.l{font-size:14.5px}.l h1{font-size:22px}.l h2{font-size:17px}.l .sp{font-size:12px}
@media print{body{margin:0}.noprint{display:none}}`;

/** The list as a complete page: its title, the free lines above and below, a table a group. */
export function listHtml(st, view, def, L) {
  const d = normalise(def), groups = listRows(st, view, d, L), n = d.cols.length;
  const head = d.cols.map((k) => `<th${COLUMNS[k].num ? ' class="n"' : ""}>${e(L.cols?.[k] ?? k)}</th>`).join("");
  const body = groups.map((g, i) => {
    const rows = g.rows.map((r) => {
      let line = `<tr>${d.cols.map((k) => { const c = COLUMNS[k]; if (c.box) return '<td class="box"></td>';
        const cls = [c.num ? "n" : "", c.flag?.(r) ? "st" : ""].filter(Boolean).join(" "); return `<td${cls ? ` class="${cls}"` : ""}>${e(cell(k, r, st, L))}</td>`; }).join("")}</tr>`;
      if (d.splits && splitsOf(r).length) {
        line += `<tr><td colspan="${n}" class="sp">${r.splits.map((s, x) => `${x + 1}(${e(s.code)}) ${s.t == null ? "—" : `${span(s.t)}${s.p === 1 ? "<b>*</b>" : ""}`}`).join(" &nbsp; ")}</td></tr>`;
      }
      return line;
    }).join("");
    const sub = [g.sub, `${g.rows.length} ${L.runners || ""}`.trim()].filter(Boolean).join(" · ");
    return `<section${d.breaks && i ? ' class="pb"' : ""}><h2>${e(g.name)}<small>${e(sub)}</small></h2><table><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table></section>`;
  }).join("") || `<p class="sub">${e(L.empty || "")}</p>`;
  const title = [view.event?.name, L.title || d.name].filter(Boolean).join(" — ");
  return `<!doctype html><html><head><meta charset="utf-8"><title>${e(title)}</title><style>${CSS}${d.landscape ? "@page{size:A4 landscape}" : ""}</style></head>`
    + `<body class="${d.size}"><h1>${e(title)}</h1><p class="sub">${e([view.event?.date, L.printed].filter(Boolean).join(" · "))}</p>`
    + `${d.head ? `<p class="hf">${e(d.head)}</p>` : ""}${body}${d.foot ? `<p class="hf foot">${e(d.foot)}</p>` : ""}</body></html>`;
}

/**
 * The list as a table: a header row, « ; » between cells, a first column naming the group unless one of the list's
 * columns already does, the split times in a last column when asked. The caller adds the byte order mark.
 */
export function listCsv(st, view, def, L) {
  const d = normalise(def), groups = listRows(st, view, d, L);
  const gcol = { class: "cls", course: "course", club: "club" }[d.by], lead = gcol && !d.cols.includes(gcol);
  const out = [[...(lead ? [L.cols?.[gcol] ?? gcol] : []), ...d.cols.map((k) => L.cols?.[k] ?? k), ...(d.splits ? [L.splits || "splits"] : [])].map((x) => csvCell(x)).join(";")];
  for (const g of groups) for (const r of g.rows) {
    const cells = d.cols.map((k) => csvCell(cell(k, r, st, L, true), !COLUMNS[k].num));
    if (lead) cells.unshift(csvCell(g.name));
    if (d.splits) cells.push(csvCell(splitsOf(r).map((s, x) => `${x + 1}(${s.code}) ${s.t == null ? "-" : span(s.t)}`).join(" ")));
    out.push(cells.join(";"));
  }
  return out.join("\r\n") + "\r\n";
}
