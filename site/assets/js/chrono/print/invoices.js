// This Source Code Form is subject to the terms of the Mozilla Public License, v. 2.0. If a copy of the MPL was not
// distributed with this file, You can obtain one at https://mozilla.org/MPL/2.0/.

// What each club owes: its runners' entry fees and rented cards, as figures, as one page a club for a printer, and as
// tables for a spreadsheet. Pure: the state in, plain objects and text out. No text of its own — the labels come from the
// caller, `L` = { title, number, date, club, code, runner, cls, fee, rent, total, paid, due, runners, fees, rents, lic,
// status: {…}, dec (the decimal sign of the tables, "." by default) }.

const e = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const cmp = (a, b) => String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: "base" });
/** An amount in cents, rounded half up (10.005 is 1001 cents, whatever its binary form). */
const cents = (n) => { const x = Number(n); return Number.isFinite(x) ? Math.round(Number((x * 100).toPrecision(12))) : 0; };
const units = (c) => c / 100;

/** A runner's entry fee: their own when set, else their class's, else 0; a copy made for a knockout round owes nothing. */
export function feeOf(st, r) {
  if (!r || r.of) return 0;
  const own = r.fee, f = own !== undefined && own !== null && own !== "" ? own : st.classes?.[r.cls]?.fee;
  return units(cents(f));
}

/**
 * Every club's account: `{ event: { name, date }, clubs: [{ id, name, code, rank, lines: [{ runner, name, family, given,
 * lic, cls, fee, rent, total, paid, due, status }], n, fees, rent, total, paid, due }], total: { n, fees, rent, total,
 * paid, due } }`. `opt` { rent (the price of a rented card), noClub (the name of the group of runners without a club),
 * skipDns (leave out the runners marked absent) }. Clubs by name, the runners without a club last; lines by class, then name.
 */
export function invoiceData(st, opt = {}) {
  const rent = Math.max(0, cents(opt.rent)), by = new Map();
  for (const r of Object.values(st.runners || {})) {
    if (!r || r.of) continue;
    if (opt.skipDns && r.status === "dns") continue;
    const club = r.club && st.clubs?.[r.club] ? st.clubs[r.club] : null, id = club ? String(club.id ?? r.club) : "";
    let g = by.get(id);
    if (!g) { g = { id, name: club ? club.name || club.code || "" : opt.noClub || "", code: club?.code || "", lines: [] }; by.set(id, g); }
    const fee = cents(feeOf(st, r)), card = r.rent ? rent : 0, total = fee + card, paid = r.paid ? total : 0;
    g.lines.push({ runner: r.id, name: `${r.given || ""} ${r.family || ""}`.trim(), family: r.family || "", given: r.given || "", lic: r.lic || "",
      cls: st.classes?.[r.cls]?.name || "", fee, rent: card, total, paid, due: total - paid, status: r.status || "" });
  }
  const sum = (lines) => { const s = { n: lines.length, fees: 0, rent: 0, total: 0, paid: 0, due: 0 }; for (const l of lines) for (const k of ["fees", "rent", "total", "paid", "due"]) s[k] += l[k === "fees" ? "fee" : k]; return s; };
  const clubs = [...by.values()].sort((a, b) => (a.id === "") - (b.id === "") || cmp(a.name, b.name) || cmp(a.code, b.code));
  const all = [];
  clubs.forEach((g, i) => {
    g.lines.sort((a, b) => cmp(a.cls, b.cls) || cmp(a.family, b.family) || cmp(a.given, b.given));
    all.push(...g.lines);
    Object.assign(g, sum(g.lines), { rank: i + 1 });
  });
  const total = sum(all);
  const out = (o) => { for (const k of ["fee", "fees", "rent", "total", "paid", "due"]) if (k in o) o[k] = units(o[k]); return o; };
  for (const g of clubs) { g.lines.forEach(out); out(g); }
  return { event: { name: st.event?.name || "", date: st.event?.date || "" }, clubs, total: out(total) };
}

const CSS = `body{font:12px/1.4 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:#111;margin:14px}
.inv{max-width:760px;margin:0 auto 28px}.pb{break-before:page}.top{display:flex;justify-content:space-between;gap:24px;align-items:flex-start;margin-bottom:18px}
.org{white-space:pre-wrap;color:#333}.meta{text-align:right}h1{font-size:20px;margin:0 0 4px}.meta p{margin:0;color:#555}
.ev{margin:0 0 12px;color:#555}.to{margin:0 0 14px;padding:8px 10px;border-left:4px solid #e8590c;background:#f6f6f6;font-size:14px}.to small{color:#555;margin-left:6px}
table{border-collapse:collapse;width:100%;break-inside:auto}th{text-align:left;font-weight:600;color:#555;border-bottom:1px solid #bbb;padding:2px 6px}
td{padding:2px 6px;border-bottom:1px solid #eee;vertical-align:top}tr{break-inside:avoid}.n{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
td small{color:#b02a37;margin-left:6px}.sum{width:auto;margin:12px 0 0 auto;break-inside:avoid}.sum td{border:0;padding:2px 6px}.sum tr.due td{font-weight:700;font-size:14px;border-top:2px solid #e8590c}
.foot{white-space:pre-wrap;margin-top:22px;padding-top:8px;border-top:1px solid #bbb;color:#333;break-inside:avoid}
@media print{body{margin:0}.inv{max-width:none;margin:0}}`;

/**
 * One page a club. `opt` { head (the organiser's block), foot (bank details, terms), num (a numbering prefix: none, no
 * number), date (the document's day, as the caller writes it), only (one club's id), dueOnly (only the clubs that still
 * owe something), money (n → text) }.
 */
export function invoicesHtml(data, L, opt = {}) {
  const money = opt.money || ((n) => Number(n).toFixed(2));
  let clubs = data.clubs;
  if (opt.only !== undefined && opt.only !== null) clubs = clubs.filter((c) => c.id === String(opt.only));
  if (opt.dueOnly) clubs = clubs.filter((c) => c.due > 0);
  const ev = [data.event?.name, data.event?.date].filter(Boolean).join(" — ");
  const body = clubs.map((c, i) => {
    const rows = c.lines.map((l) => `<tr><td>${e(l.name)}${l.status && L.status?.[l.status] ? `<small>${e(L.status[l.status])}</small>` : ""}</td><td>${e(l.cls)}</td>`
      + `<td class="n">${e(money(l.fee))}</td><td class="n">${l.rent ? e(money(l.rent)) : ""}</td><td class="n">${e(money(l.total))}</td></tr>`).join("");
    return `<section class="inv${i ? " pb" : ""}"><div class="top"><div class="org">${e(opt.head || "")}</div><div class="meta"><h1>${e(L.title)}</h1>`
      + `${opt.num ? `<p>${e(L.number)} ${e(opt.num)}${String(c.rank ?? i + 1).padStart(3, "0")}</p>` : ""}${opt.date ? `<p>${e(L.date)} ${e(opt.date)}</p>` : ""}</div></div>`
      + `${ev ? `<p class="ev">${e(ev)}</p>` : ""}<p class="to"><b>${e(c.name)}</b>${c.code ? `<small>${e(c.code)}</small>` : ""}</p>`
      + `<table><thead><tr><th>${e(L.runner)}</th><th>${e(L.cls)}</th><th class="n">${e(L.fee)}</th><th class="n">${e(L.rent)}</th><th class="n">${e(L.total)}</th></tr></thead><tbody>${rows}</tbody></table>`
      + `<table class="sum"><tbody><tr><td>${e(L.total)} (${c.n} ${e(L.runners)})</td><td class="n">${e(money(c.total))}</td></tr><tr><td>${e(L.paid)}</td><td class="n">${e(money(c.paid))}</td></tr>`
      + `<tr class="due"><td>${e(L.due)}</td><td class="n">${e(money(c.due))}</td></tr></tbody></table>${opt.foot ? `<div class="foot">${e(opt.foot)}</div>` : ""}</section>`;
  }).join("");
  return `<!doctype html><html><head><meta charset="utf-8"><title>${e([L.title, data.event?.name].filter(Boolean).join(" — "))}</title><style>${CSS}</style></head><body>${body}</body></html>`;
}

/** A table's cell: quoted when it holds the separator, a quote, a line break or outer spaces; a text a spreadsheet would run as a formula is disarmed. */
export function csvCell(v, text = true) {
  let s = String(v ?? "");
  if (text && (/^[=@\t\r]/.test(s) || /^[+-](?![\d.,:]*$)/.test(s))) s = `'${s}`;
  return /[";\r\n]/.test(s) || /^\s|\s$/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
const line = (cells) => cells.join(";");
const amount = (n, L) => Number(n).toFixed(2).replace(".", L.dec || ".");

/** The summary, a club a line, then the total (« ; » between cells; the caller adds the byte order mark). */
export function invoicesCsv(data, L) {
  const head = [L.code, L.club, L.runners, L.fees, L.rents, L.total, L.paid, L.due].map((x) => csvCell(x));
  const row = (c, code, name) => line([csvCell(code), csvCell(name), c.n, ...["fees", "rent", "total", "paid", "due"].map((k) => amount(c[k], L))]);
  return [line(head), ...data.clubs.map((c) => row(c, c.code, c.name)), row(data.total, "", L.total)].join("\r\n") + "\r\n";
}

/** Every line: a runner a line, with their club. */
export function invoiceLinesCsv(data, L) {
  const head = [L.code, L.club, L.runner, L.lic, L.cls, L.fee, L.rent, L.total, L.paid, L.due].map((x) => csvCell(x));
  const out = [line(head)];
  for (const c of data.clubs) for (const l of c.lines) out.push(line([csvCell(c.code), csvCell(c.name), csvCell(l.name), csvCell(l.lic), csvCell(l.cls), ...["fee", "rent", "total", "paid", "due"].map((k) => amount(l[k], L))]));
  return out.join("\r\n") + "\r\n";
}
