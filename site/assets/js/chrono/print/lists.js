// Lists as HTML pages: results (with or without split times), start lists, the list by club — for a printer, a wall
// screen or a file to post. No text of its own: the labels come from the caller, `L` = { title, place, name, club, cat,
// time, behind, start, card, bib, status: {…}, runners, km, climb, controls, printed, points }.

import { clock, span } from "../times.js";

const e = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const CSS = `body{font:12px/1.35 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:#111;margin:14px}h1{font-size:18px;margin:0 0 2px}
.sub{color:#555;margin:0 0 12px}h2{font-size:14px;margin:16px 0 4px;border-bottom:2px solid #e8590c;padding-bottom:2px;break-after:avoid}h2 small{font-weight:400;color:#555;margin-left:8px}
table{border-collapse:collapse;width:100%;break-inside:auto}th{text-align:left;font-weight:600;color:#555;border-bottom:1px solid #bbb;padding:2px 6px}
td{padding:2px 6px;border-bottom:1px solid #eee;vertical-align:top}tr{break-inside:avoid}.n{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
.mb td{border-bottom:0;color:#333;font-size:11px;padding-top:0}.tm td{font-weight:600}.heats{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:4px 18px}.heats h3{font-size:12px;margin:8px 0 2px}.up td{font-weight:600}
.sp{font-size:10px;color:#333}.sp b{color:#e8590c}.st{color:#b02a37;font-weight:600}.tv{font-size:20px}.tv h1{font-size:30px}.tv h2{font-size:24px}
@media print{body{margin:0}.noprint{display:none}}`;

const page = (title, sub, body, cls = "") => `<!doctype html><html><head><meta charset="utf-8"><title>${e(title)}</title><style>${CSS}</style></head><body class="${cls}"><h1>${e(title)}</h1><p class="sub">${e(sub)}</p>${body}</body></html>`;
const courseLine = (c, L) => (c ? [c.length != null ? `${(c.length / 1000).toFixed(1)} ${L.km}` : "", c.climb != null ? `${Math.round(c.climb)} ${L.climb}` : "", c.controls?.length ? `${c.controls.length} ${L.controls}` : ""].filter(Boolean).join(" · ") : "");
const who = (r) => `${e(r.given)} ${e(r.family)}`.trim();

/** Results: `view` a view of the engine (its `classes` or `courses` as `groups`), `opt` { splits, tv, cat (show the class column) }. */
export function resultsHtml(view, groups, L, opt = {}) {
  const body = groups.filter((g) => g.rows.length).map((g) => {
    const c = g.course || (g.controls ? g : null), score = !!c?.score;
    if (g.teams) return teamBlock(g, L, opt);
    const rows = g.rows.filter((r) => r.status !== "wait" || !opt.final).map((r) => {
      const res = r.status === "ok" || (r.status === "nc" && r.time != null) ? span(r.time) : `<span class="st">${e(L.status[r.status] || r.status)}</span>`;
      let line = `<tr><td class="n">${r.place ?? ""}</td><td>${who(r)}</td><td>${e(r.club)}</td>${opt.cat ? `<td>${e(r.clsName || r.cat)}</td>` : ""}`
        + `${score ? `<td class="n">${r.points ?? ""}</td>` : ""}<td class="n">${res}</td><td class="n">${r.behind ? `+${span(r.behind)}` : ""}</td></tr>`;
      if (opt.splits && r.splits.length && r.read) {
        line += `<tr><td></td><td colspan="${5 + (opt.cat ? 1 : 0) + (score ? 1 : 0)}" class="sp">${r.splits.map((s, i) => `${i + 1}(${s.code}) ${s.t == null ? "—" : `${span(s.t)}${s.p === 1 ? "<b>*</b>" : ""}`}`).join(" &nbsp; ")}</td></tr>`;
      }
      return line;
    }).join("");
    return `<h2>${e(g.name)}<small>${e(courseLine(c, L))}${c ? " · " : ""}${g.rows.length} ${e(L.runners)}</small></h2><table><thead><tr><th class="n">${e(L.place)}</th><th>${e(L.name)}</th><th>${e(L.club)}</th>`
      + `${opt.cat ? `<th>${e(L.cat)}</th>` : ""}${score ? `<th class="n">${e(L.points)}</th>` : ""}<th class="n">${e(L.time)}</th><th class="n">${e(L.behind)}</th></tr></thead><tbody>${rows}</tbody></table>`;
  }).join("");
  return page(`${view.event.name || ""} — ${L.title}`, [view.event.date, L.printed].filter(Boolean).join(" · "), body, opt.tv ? "tv" : "");
}

/** A class run in teams: each team's line, its members under it (a relay's legs with their times, a pair's two runners). */
function teamBlock(g, L, opt) {
  const res = (r) => (r.status === "ok" || (r.status === "nc" && r.time != null) ? span(r.time) : `<span class="st">${e(L.status[r.status] || r.status)}</span>`);
  const rows = g.teams.filter((x) => x.status !== "wait" || !opt.final).map((x) => {
    const mem = x.members.map((r, i) => (r ? `<tr class="mb"><td></td><td class="n">${x.kind === "relay" ? i + 1 : ""}</td><td>${who(r)}</td><td></td><td class="n">${r.read || r.manual ? res(r) : ""}${r.restart ? " *" : ""}</td><td></td></tr>` : "")).join("");
    return `<tr class="tm"><td class="n">${x.place ?? ""}</td><td class="n">${e(x.bib)}</td><td>${e(x.name)}</td><td>${e(x.club)}</td><td class="n">${x.status === "run" || x.status === "wait" ? "" : res(x)}</td><td class="n">${x.behind ? `+${span(x.behind)}` : ""}</td></tr>${mem}`;
  }).join("");
  return `<h2>${e(g.name)}<small>${g.teams.length} ${e(L.teams || L.runners)}</small></h2><table><thead><tr><th class="n">${e(L.place)}</th><th class="n">${e(L.bib)}</th><th>${e(L.team || L.name)}</th><th>${e(L.club)}</th>`
    + `<th class="n">${e(L.time)}</th><th class="n">${e(L.behind)}</th></tr></thead><tbody>${rows}</tbody></table>`;
}

/**
 * A knockout: each round's heats side by side (those who go on in bold), then the final ranking.
 * `tree`: knockout.koTree's, each with its `ranking` (knockout.koRanking's). `L` adds `heat`, `final`, `round`.
 */
export function koHtml(view, tree, L) {
  const body = tree.map((b) => {
    const rounds = b.rounds.map((r) => `<h2>${e(r.label || `${L.round} ${r.round}`)}</h2><div class="heats">${r.heats.map((h) => `<div><h3>${e(h.name)}${h.first != null ? ` · ${clock(h.first)}` : ""}</h3><table><tbody>${h.rows.map((x) =>
      `<tr class="${x.place && x.place <= (h.ko?.up || 0) ? "up" : ""}"><td class="n">${x.place ?? ""}</td><td>${who(x)}</td><td>${e(x.club)}</td><td class="n">${x.status === "ok" ? span(x.time) : x.read || x.manual ? `<span class="st">${e(L.status[x.status] || x.status)}</span>` : ""}</td></tr>`).join("")}</tbody></table></div>`).join("")}</div>`).join("");
    const rank = b.ranking?.length ? `<h2>${e(b.name)} — ${e(L.final)}</h2><table><tbody>${b.ranking.map((x) => `<tr><td class="n">${x.place}</td><td>${who(x)}</td><td>${e(x.club)}</td><td>${e(x.label || "")}</td></tr>`).join("")}</tbody></table>` : "";
    return rounds + rank;
  }).join("");
  return page(`${view.event.name || ""} — ${L.title}`, [view.event.date, L.printed].filter(Boolean).join(" · "), body);
}

/** The totals over several days (series.totals'): a table a class, a column a stage. `L` adds `total`, `stage`, `pts`. */
export function totalsHtml(event, tot, L) {
  const cell = (r) => (!r ? "" : r.status !== "ok" ? `<span class="st">${e(L.status[r.status] || r.status)}</span>` : tot.mode === "points" ? `${r.pts}` : span(r.time));
  const body = tot.classes.filter((c) => c.rows.length).map((c) => `<h2>${e(c.name)}<small>${c.rows.length} ${e(L.runners || "")}</small></h2><table><thead><tr><th class="n">${e(L.place)}</th><th>${e(L.name)}</th><th>${e(L.club)}</th>`
    + `${tot.stages.map((s, i) => `<th class="n" title="${e(s.name)}">${e(L.stage)} ${i + 1}</th>`).join("")}<th class="n">${e(L.total)}</th><th class="n">${e(L.behind)}</th></tr></thead><tbody>${c.rows.map((r) =>
      `<tr><td class="n">${r.place ?? ""}</td><td>${who(r)}</td><td>${e(r.club)}</td>${r.res.map((x) => `<td class="n">${cell(x)}</td>`).join("")}<td class="n"><b>${r.total == null ? "" : tot.mode === "points" ? r.total : span(r.total)}</b></td>`
      + `<td class="n">${r.behind ? (tot.mode === "points" ? `−${r.behind}` : `+${span(r.behind)}`) : ""}</td></tr>`).join("")}</tbody></table>`).join("");
  const sub = [tot.stages.map((s, i) => `${i + 1}. ${s.name || ""}${s.date ? ` (${s.date})` : ""}`).join(" · "), L.printed].filter(Boolean).join(" — ");
  return page(`${event.name || ""} — ${L.title}`, sub, body);
}
/** The same as text, « ; » between cells. */
export function totalsCsv(tot, L) {
  const q = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const lines = [[L.cat || "", L.place, L.name, L.club, ...tot.stages.map((s, i) => `${L.stage} ${i + 1}`), L.total].map(q).join(";")];
  for (const c of tot.classes) for (const r of c.rows) lines.push([c.name, r.place ?? "", `${r.given} ${r.family}`.trim(), r.club, ...r.res.map((x) => (!x ? "" : x.status !== "ok" ? (L.status[x.status] || x.status) : tot.mode === "points" ? x.pts : span(x.time))),
    r.total == null ? "" : tot.mode === "points" ? r.total : span(r.total)].map(q).join(";"));
  return lines.join("\r\n");
}

/** Start list, by class or course, in start order. */
export function startsHtml(view, groups, L, opt = {}) {
  const body = groups.filter((g) => g.rows.length).map((g) => {
    const c = g.course || (g.controls ? g : null);
    const rows = [...g.rows].sort((a, b) => (a.start ?? 1e9) - (b.start ?? 1e9) || a.family.localeCompare(b.family)).map((r) =>
      `<tr><td class="n">${clock(r.start)}</td><td class="n">${e(r.bib)}</td><td>${who(r)}</td><td>${e(r.club)}</td>${opt.cat ? `<td>${e(r.clsName || r.cat)}</td>` : ""}<td class="n">${r.card ?? ""}</td></tr>`).join("");
    return `<h2>${e(g.name)}<small>${e(courseLine(c, L))}${c ? " · " : ""}${g.rows.length} ${e(L.runners)}</small></h2><table><thead><tr><th class="n">${e(L.start)}</th><th class="n">${e(L.bib)}</th><th>${e(L.name)}</th><th>${e(L.club)}</th>`
      + `${opt.cat ? `<th>${e(L.cat)}</th>` : ""}<th class="n">${e(L.card)}</th></tr></thead><tbody>${rows}</tbody></table>`;
  }).join("");
  return page(`${view.event.name || ""} — ${L.title}`, [view.event.date, L.printed].filter(Boolean).join(" · "), body);
}

/** The start list minute by minute, for the start's officials: every runner leaving at each time, all courses together. */
export function minutesHtml(view, L) {
  const all = view.classes.flatMap((k) => k.rows).filter((r) => r.start != null).sort((a, b) => a.start - b.start || String(a.clsName).localeCompare(b.clsName));
  let last = null;
  const rows = all.map((r) => { const t = r.start !== last ? clock(r.start) : ""; last = r.start; return `<tr${t ? ' style="border-top:2px solid #999"' : ""}><td class="n"><b>${t}</b></td><td>${e(r.clsName)}</td><td class="n">${e(r.bib)}</td><td>${who(r)}</td><td>${e(r.club)}</td><td class="n">${r.card ?? ""}</td><td style="width:2em;border:1px solid #999"></td></tr>`; }).join("");
  return page(`${view.event.name || ""} — ${L.title}`, [view.event.date, L.printed].filter(Boolean).join(" · "),
    `<table><thead><tr><th class="n">${e(L.start)}</th><th>${e(L.cat)}</th><th class="n">${e(L.bib)}</th><th>${e(L.name)}</th><th>${e(L.club)}</th><th class="n">${e(L.card)}</th><th></th></tr></thead><tbody>${rows}</tbody></table>`);
}

/** By club: each club's runners with their class, start and result. */
export function clubsHtml(view, L) {
  const by = new Map();
  for (const r of view.classes.flatMap((k) => k.rows)) (by.get(r.club || "—") || by.set(r.club || "—", []).get(r.club || "—")).push(r);
  const body = [...by.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([club, rows]) => `<h2>${e(club)}<small>${rows.length} ${e(L.runners)}</small></h2><table><tbody>${rows
    .sort((a, b) => a.family.localeCompare(b.family)).map((r) => `<tr><td>${who(r)}</td><td>${e(r.clsName)}</td><td class="n">${clock(r.start)}</td><td class="n">${r.card ?? ""}</td><td class="n">${r.place ?? ""}</td>`
      + `<td class="n">${r.status === "ok" ? span(r.time) : r.read || r.manual ? e(L.status[r.status] || r.status) : ""}</td></tr>`).join("")}</tbody></table>`).join("");
  return page(`${view.event.name || ""} — ${L.title}`, [view.event.date, L.printed].filter(Boolean).join(" · "), body);
}
