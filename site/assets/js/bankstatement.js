// The bank's statement file read in the browser (docs/clubs/design.md §4 « References and states »; owner, 2026-11-22): a
// treasurer or an event's team drops the file their bank gives — CSV (French, English or German headings: date, libellé /
// description / Verwendungszweck, montant / amount / Betrag or débit / crédit, Soll / Haben columns; « ; », « , » or tabs,
// decimal commas), OFX, or CAMT.053 XML —, the credits are read, a line carrying an Ozimut reference (« OZ-7K3F » an entry's,
// « OZ-0109-1234567 » a member's year-end bill) is matched, the others are proposed by amount and name. Nothing of the file
// leaves the browser: only the lines ticked are sent, as references marked paid (POST /api/entries/<event>/pay, or
// /api/accounts/<org>/pay across a club's events). Used by pages/entriesorg.js (« Relevé bancaire ») and pages/clubaccounts.js.
//
// The parsing and matching are pure (parseStatement, matchLines: no DOM), the dialog (openBankDialog) loads the page's helpers
// when it opens.

// ---- reading the file ---------------------------------------------------------------------------------------------------
/** The file's text: UTF-8 when it is valid UTF-8, else Windows-1252 (most banks' CSV exports). */
export function decode(bytes) {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  try { return new TextDecoder("utf-8", { fatal: true }).decode(u8).replace(/^﻿/, ""); }
  catch (e) { return new TextDecoder("windows-1252").decode(u8); }
}

/** « 1 234,56 », « 1.234,56 », « 1,234.56 », « -12,50 € », « (12.50) », « 12,50- » -> cents, or null. */
export function parseAmount(s) {
  let x = String(s ?? "").trim();
  if (!x) return null;
  let neg = /^\(.*\)$/.test(x) || /^-|-$|^−/.test(x.replace(/\s/g, ""));
  x = x.replace(/[^\d.,]/g, "");
  if (!x || !/\d/.test(x)) return null;
  const lc = x.lastIndexOf(","), ld = x.lastIndexOf(".");
  let dec = "";
  if (lc > -1 && ld > -1) dec = lc > ld ? "," : ".";
  else if (lc > -1) dec = x.length - lc - 1 <= 2 ? "," : "";
  else if (ld > -1) dec = x.length - ld - 1 <= 2 && (x.match(/\./g) || []).length === 1 ? "." : "";
  const [int, frac = ""] = dec ? [x.slice(0, x.lastIndexOf(dec)), x.slice(x.lastIndexOf(dec) + 1)] : [x, ""];
  const n = Number(int.replace(/[.,]/g, "") || "0") * 100 + Number((frac + "00").slice(0, 2));
  if (!Number.isFinite(n)) return null;
  if (neg && n === 0) neg = false;
  return neg ? -n : n;
}

/** « 23/11/2026 », « 23.11.26 », « 2026-11-23 », « 20261123 », « 23-11-2026 » -> « 2026-11-23 », or "". */
export function parseDate(s) {
  const x = String(s ?? "").trim();
  let m = /^(\d{4})-?(\d{2})-?(\d{2})/.exec(x);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = /^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{2,4})/.exec(x);
  if (m) { const y = m[3].length === 2 ? `20${m[3]}` : m[3]; return `${y}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`; }
  return "";
}

/** A CSV line split by `sep`, quotes kept apart. */
function cells(line, sep) {
  const out = [];
  let cur = "", q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) { if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c; }
    else if (c === '"') q = true;
    else if (c === sep) { out.push(cur.trim()); cur = ""; }
    else cur += c;
  }
  out.push(cur.trim());
  return out;
}
const fold = (s) => String(s ?? "").normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
// the headings banks write, folded (French, English, German)
const H = {
  date: /^(date( (de )?(l'?)?(operation|comptabilisation|valeur|transaction|booking|posting))?|date op\.?|booking date|transaction date|posting date|value date|buchungs(tag|datum)|valuta(datum)?|wertstellung|datum)$/,
  label: /^(libelle( (de l'?)?operation| simplifie| complet)?|libelle operation|description|details|memo|narrative|reference|reference de l'operation|communication|motif|verwendungszweck|buchungstext|beschreibung|name|nom|tiers|payee|payer|counterparty|beneficiary|auftraggeber.*|empfanger.*|zahlungspflichtige.*|beguenstigter.*|begunstigter.*|zahlungsempfanger.*|informations complementaires|detail)$/,
  amount: /^(montant( \(?eur\)?| en euros?)?|amount( \(?eur\)?)?|betrag( \(?eur\)?)?|umsatz|value|somme)$/,
  debit: /^(debit( \(?eur\)?| euros?)?|debits?|soll|ausgang|withdrawals?|money out|paid out)$/,
  credit: /^(credit( \(?eur\)?| euros?)?|credits?|haben|eingang|deposits?|money in|paid in)$/,
  sign: /^(s\/h|soll\/haben|debit\/credit|sens|type)$/,
};
function readCsv(text) {
  const lines = text.split(/\r\n|\n|\r/).filter((l) => l.trim());
  for (let i = 0; i < Math.min(lines.length, 40); i++) {
    for (const sep of [";", "\t", ",", "|"]) {
      const head = cells(lines[i], sep).map(fold);
      if (head.length < 2) continue;
      const col = (re) => head.findIndex((h) => re.test(h.replace(/[*:]+$/, "").trim()));
      const c = { date: col(H.date), amount: col(H.amount), debit: col(H.debit), credit: col(H.credit), sign: col(H.sign) };
      const labels = head.map((h, k) => (H.label.test(h.replace(/[*:]+$/, "").trim()) ? k : -1)).filter((k) => k >= 0);
      if (c.date < 0 || (c.amount < 0 && c.credit < 0)) continue;
      const out = [];
      for (const l of lines.slice(i + 1)) {
        const r = cells(l, sep);
        if (r.length < 2) continue;
        const date = parseDate(r[c.date]);
        if (!date) continue;
        let amount = null;
        if (c.amount >= 0 && r[c.amount] !== "") amount = parseAmount(r[c.amount]);
        if (amount == null && c.credit >= 0 && r[c.credit]) amount = Math.abs(parseAmount(r[c.credit]) ?? 0) || null;
        if (amount == null && c.debit >= 0 && r[c.debit]) amount = -Math.abs(parseAmount(r[c.debit]) ?? 0) || null;
        if (amount == null) continue;
        if (c.sign >= 0 && /^(s|d|debit|soll)/i.test(r[c.sign] || "")) amount = -Math.abs(amount);
        const label = (labels.length ? labels.map((k) => r[k]) : r.filter((_, k) => k !== c.date && k !== c.amount && k !== c.credit && k !== c.debit))
          .filter((x) => x && !/^[-+\d.,\s€]+$/.test(x)).join(" · ");
        out.push({ date, amount, label });
      }
      if (out.length) return out;
    }
  }
  return null;
}

/** An XML or SGML element's text (namespace prefixes allowed), the first one inside `s`. */
const tag = (s, name) => {
  const m = new RegExp(`<(?:[\\w-]+:)?${name}\\b[^>]*>([^<]*)`, "i").exec(s);
  return m ? m[1].replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&apos;/g, "'").replace(/&quot;/g, '"').trim() : "";
};
const blocks = (s, name) => {
  const re = new RegExp(`<(?:[\\w-]+:)?${name}\\b[^>]*>([\\s\\S]*?)</(?:[\\w-]+:)?${name}>`, "gi");
  return [...s.matchAll(re)].map((m) => m[1]);
};
function readOfx(text) {
  // SGML (OFX 1) leaves elements unclosed: each transaction runs to the next <STMTTRN> or </STMTTRN>
  const parts = text.split(/<STMTTRN>/i).slice(1).map((p) => p.split(/<\/STMTTRN>/i)[0]);
  return parts.map((p) => {
    const amount = parseAmount(tag(p, "TRNAMT"));
    return { date: parseDate(tag(p, "DTPOSTED")), amount, label: [tag(p, "NAME"), tag(p, "MEMO"), tag(p, "PAYEE")].filter(Boolean).join(" · ") };
  }).filter((x) => x.date && x.amount != null);
}
function readCamt(text) {
  return blocks(text, "Ntry").map((n) => {
    const amt = parseAmount(tag(n, "Amt"));
    const credit = /CRDT/i.test(tag(n, "CdtDbtInd"));
    const date = parseDate(tag(blocks(n, "BookgDt")[0] || "", "Dt") || tag(blocks(n, "BookgDt")[0] || "", "DtTm") || tag(blocks(n, "ValDt")[0] || "", "Dt"));
    const ustrd = blocks(n, "Ustrd").map((x) => x.trim());
    const refs = [tag(blocks(n, "Strd")[0] || "", "Ref"), tag(n, "EndToEndId")].filter((x) => x && !/^NOTPROVIDED$/i.test(x));
    const who = tag(blocks(n, "Dbtr")[0] || "", "Nm") || tag(blocks(n, "UltmtDbtr")[0] || "", "Nm");
    const label = [who, ...ustrd, ...refs, tag(n, "AddtlNtryInf")].filter(Boolean).join(" · ");
    return { date, amount: amt == null ? null : credit ? Math.abs(amt) : -Math.abs(amt), label };
  }).filter((x) => x.date && x.amount != null);
}

/**
 * The statement's lines: { format: "csv" | "ofx" | "camt", lines: [{ date, amount (cents, credits positive), label }] }, or
 * { format: null, lines: [] } when the file is none of them.
 */
export function parseStatement(input) {
  const text = typeof input === "string" ? input : decode(input);
  if (/<(?:[\w-]+:)?BkToCstmrStmt\b|camt\.05[234]/i.test(text)) return { format: "camt", lines: readCamt(text) };
  if (/<OFX>|OFXHEADER|<STMTTRN>/i.test(text)) return { format: "ofx", lines: readOfx(text) };
  const csv = readCsv(text);
  return csv ? { format: "csv", lines: csv } : { format: null, lines: [] };
}

// ---- matching -------------------------------------------------------------------------------------------------------------
const squash = (s) => String(s ?? "").toUpperCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^A-Z0-9]/g, "");
const words = (s) => fold(s).split(/[^a-z]+/).filter((w) => w.length >= 3);

/**
 * The credits matched to the open references. `candidates`: [{ kind: "entry" | "bill", ref, due (cents), names: [..], eventName,
 * date, ... }]. -> [{ line, match: candidate | null, exact: bool (the amount is the amount due), proposals: [candidate…] }] —
 * a reference found in the line matches it (the longest references first, so a bill's « OZ-2345-… » is never read as an
 * entry's « OZ-2345 »); a line without one gets the candidates of its amount and those sharing a word of their names.
 */
export function matchLines(lines, candidates) {
  const cands = candidates.map((c) => ({ c, key: squash(c.ref) })).filter((x) => x.key.length >= 6).sort((a, b) => b.key.length - a.key.length);
  return lines.filter((l) => l.amount > 0).map((line) => {
    let text = squash(line.label);
    let match = null;
    for (const { c, key } of cands) {
      const i = text.indexOf(key);
      if (i < 0) continue;
      // the label's separators are gone (« OZ 7K3F », « OZ7K3F »): a bill's longer reference was tried first, and what is
      // matched is taken out of the text
      match = c;
      text = text.slice(0, i) + text.slice(i + key.length);
      break;
    }
    if (match) return { line, match, exact: match.due === line.amount, proposals: [] };
    const lw = new Set(words(line.label));
    const scored = candidates.map((c) => {
      const named = (c.names || []).some((n) => words(n).filter((w) => lw.has(w)).length >= Math.min(2, words(n).length));
      const some = (c.names || []).some((n) => words(n).some((w) => lw.has(w)));
      return { c, s: (c.due === line.amount ? 2 : 0) + (named ? 2 : some ? 1 : 0) };
    }).filter((x) => x.s >= 2).sort((a, b) => b.s - a.s);
    const seen = /OZ[\s._-]?([A-HJ-NP-Z2-9]{4})(?![A-Z0-9])/.exec(String(line.label).toUpperCase());
    return { line, match: null, exact: false, proposals: scored.slice(0, 5).map((x) => x.c), seen: seen ? `OZ-${seen[1]}` : "" };
  });
}

// ---- the dialog --------------------------------------------------------------------------------------------------------------
/**
 * Opens the reader: `load()` -> the open references (candidates); `send(picked)` with picked [{ candidate, line }] -> { ok, text }
 * (the page's words for what was marked); `cur` the currency. Resolves true when something was sent.
 */
export async function openBankDialog({ load, send, cur = "EUR", title = "" }) {
  const [{ html, $ }, { t, tn, loadArea, locale }, { fmtMoney }] = await Promise.all([import("./util.js"), import("./i18n.js"), import("./entryprice.js")]);
  await loadArea("accounts");
  const money = (c) => fmtMoney(c, cur, locale());
  const d = document.createElement("dialog");
  d.className = "ask-dlg ac-bank";
  const st = { cands: null, rows: [], format: null, name: "", sent: false, err: "" };
  const draw = () => {
    const matched = st.rows.filter((r) => r.pick), credits = st.rows.length;
    d.innerHTML = html`<div class="ac-bank-head"><h2>${title || t("acc.bank.title")}</h2><button type="button" class="icon-btn" data-close="1" aria-label="${t("acc.close")}">✕</button></div>
      <p class="muted ac-small">${t("acc.bank.lede")}</p>
      <label class="ac-drop" tabindex="0"><input type="file" accept=".csv,.txt,.ofx,.qfx,.xml,.sta,text/csv,application/xml,text/xml" hidden>
        <span>${st.name ? html`<b>${st.name}</b> · ${t(`acc.bank.fmt.${st.format || "none"}`)}` : t("acc.bank.drop")}</span></label>
      ${st.err ? html`<div class="notice">${st.err}</div>` : ""}
      ${st.cands == null ? html`<div class="spinner"></div>` : ""}
      ${credits ? html`<p class="ac-small">${tn("acc.bank.read", credits, { n: credits })} · ${tn("acc.bank.matched", st.rows.filter((r) => r.match).length, { n: st.rows.filter((r) => r.match).length })}</p>
        <div class="table-wrap ac-bank-table"><table class="data compact"><thead><tr><th></th><th>${t("acc.col.date")}</th><th>${t("acc.bank.label")}</th>
          <th class="r">${t("acc.col.amount")}</th><th>${t("acc.bank.match")}</th></tr></thead><tbody>
          ${st.rows.map((r, i) => html`<tr class="${r.pick ? "ac-picked" : ""}"><td><input type="checkbox" data-pick="${i}" ${r.pick ? "checked" : ""} ${r.pick || r.match || r.proposals.length ? "" : "disabled"}></td>
            <td class="num">${r.line.date}</td><td class="ac-label">${r.line.label}</td><td class="r num">${money(r.line.amount)}</td>
            <td>${r.match ? html`<b class="num">${r.match.ref}</b> ${r.match.eventName ? html`<span class="muted">${r.match.eventName}</span>` : ""}
                <span class="muted">· ${(r.match.names || []).slice(0, 3).join(", ")}</span>
                ${r.exact ? html` <span class="tag tag-in">${t("acc.bank.exact")}</span>` : html` <span class="tag tag-warn">${t("acc.bank.differs", { due: money(r.match.due) })}</span>`}`
              : r.proposals.length ? html`<select data-prop="${i}"><option value="">${t("acc.bank.propose")}</option>${r.proposals.map((c, k) => html`<option value="${k}" ${r.pickIdx === k ? "selected" : ""}>${c.ref} · ${money(c.due)} · ${(c.names || []).slice(0, 2).join(", ")}</option>`)}</select>`
                : html`<span class="muted">${r.seen ? t("acc.bank.closed", { ref: r.seen }) : t("acc.bank.none")}</span>`}</td></tr>`)}</tbody></table></div>`
        : st.name ? html`<div class="empty">${t("acc.bank.noCredit")}</div>` : ""}
      ${st.sent ? html`<div class="notice ok">${st.sent}</div>` : ""}
      <div class="ask-btns"><button type="button" class="btn" data-close="1">${t("acc.close")}</button>
        <button type="button" class="btn btn-primary" data-send="1" ${matched.length ? "" : "disabled"}>${tn("acc.bank.send", matched.length, { n: matched.length })}</button></div>`;
  };
  const take = async (file) => {
    if (!file) return;
    st.name = file.name; st.err = ""; st.sent = "";
    try {
      const p = parseStatement(new Uint8Array(await file.arrayBuffer()));
      st.format = p.format;
      if (!p.format) st.err = t("acc.bank.unread");
      st.rows = matchLines(p.lines, st.cands || []).map((r) => ({ ...r, pick: !!r.match, pickIdx: null }));
    } catch (e) { st.err = t("acc.bank.unread"); st.rows = []; }
    draw();
  };
  let done = false;
  const result = new Promise((resolve) => {
    const finish = () => { if (done) return; done = true; try { d.close(); } catch (e) { /* closed */ } d.remove(); resolve(!!st.sentAny); };
    d.addEventListener("cancel", (e) => { e.preventDefault(); finish(); });
    d.addEventListener("click", async (e) => {
      if (e.target.closest("[data-close]")) return finish();
      if (e.target.closest("[data-send]")) {
        const picked = st.rows.filter((r) => r.pick).map((r) => ({ line: r.line, candidate: r.match || r.proposals[r.pickIdx] })).filter((x) => x.candidate);
        e.target.disabled = true;
        try {
          const y = await send(picked);
          st.sent = y?.text || ""; st.sentAny = st.sentAny || !!y?.ok;
          if (y?.ok) st.rows = st.rows.filter((r) => !r.pick);
        } catch (err) { st.err = String(err?.message || err); }
        draw();
      }
    });
    d.addEventListener("change", (e) => {
      const p = e.target.dataset.pick, q = e.target.dataset.prop;
      if (p != null) { const r = st.rows[Number(p)]; r.pick = e.target.checked && (!!r.match || r.pickIdx != null); if (e.target.checked && !r.match && r.pickIdx == null) e.target.checked = false; draw(); }
      if (q != null) { const r = st.rows[Number(q)]; r.pickIdx = e.target.value === "" ? null : Number(e.target.value); r.pick = r.pickIdx != null; draw(); }
      if (e.target.type === "file") take(e.target.files?.[0]);
    });
    d.addEventListener("dragover", (e) => { e.preventDefault(); });
    d.addEventListener("drop", (e) => { e.preventDefault(); take(e.dataTransfer?.files?.[0]); });
    d.addEventListener("keydown", (e) => { if (e.key === "Enter" && e.target.closest(".ac-drop")) $("input[type=file]", d)?.click(); });
  });
  draw();
  document.body.append(d);
  try { d.showModal(); } catch (e) { d.setAttribute("open", ""); }
  try { st.cands = await load(); } catch (e) { st.cands = []; st.err = t("acc.err.other"); }
  if (st.rows.length) st.rows = matchLines(st.rows.map((r) => r.line), st.cands).map((r) => ({ ...r, pick: !!r.match, pickIdx: null }));
  draw();
  return result;
}
