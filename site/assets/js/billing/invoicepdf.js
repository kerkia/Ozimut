// An invoice, a credit note or a quote of Ozimut's as a PDF, drawn in the browser from the stored record (docs/billing/
// design.md §6; loaded only through ../offers.js — as pages/clubaccounts.js draws the clubs' year-end bills: pdf-lib, the PDF's
// standard Helvetica). Everything printed comes from the record: the seller and the buyer as they were when it was issued, its
// number, dates, lines and totals; nothing is invented here — a legal mention the record lacks is simply not printed.
// A record: functions/_lib/invoices.js `parsed`.

import { t, locale } from "../i18n.js";
import { fmtDate } from "../util.js";
import { PDFLIB } from "../vendor.js";

let pdfLibP = null;
const pdfLib = () => (pdfLibP ||= new Promise((res, rej) => {
  if (window.PDFLib) return res(window.PDFLib);
  const s = document.createElement("script");
  s.src = PDFLIB; s.onload = () => res(window.PDFLib); s.onerror = () => { pdfLibP = null; rej(new Error("pdf-lib")); };
  document.head.append(s);
}));
// Helvetica writes Windows-1252 alone: other letters lose their accents, the rest becomes « ? »
const WIN = new Set("€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ");      // i18n-ignore (Windows-1252's characters above 127)
const winSafe = (s) => [...String(s ?? "").replace(/[   ]/g, " ")].map((c) => {
  const n = c.charCodeAt(0);
  if ((n >= 32 && n < 127) || (n >= 160 && n < 256) || WIN.has(c)) return c;
  if (c === "→" || c === "↦") return "–";         // a period « from → to » (the record's lines)
  if (c === "−" || c === "‐" || c === "‑") return "-";
  const d = c.normalize("NFKD").replace(/[̀-ͯ]/g, "");
  return /^[\x20-\x7e]+$/.test(d) ? d : "?";
}).join("");
const money = (cents, currency) => {
  const n = (Number(cents) || 0) / 100;
  try { return new Intl.NumberFormat(locale(), { style: "currency", currency: String(currency || "eur").toUpperCase(), minimumFractionDigits: 2 }).format(n); }
  catch (e) { return `${n.toFixed(2)} ${String(currency || "EUR").toUpperCase()}`; }
};
const day = (iso) => (iso ? fmtDate(String(iso).slice(0, 10), "long") : "");
const iban = (s) => String(s || "").replace(/\s+/g, "").replace(/(.{4})/g, "$1 ").trim();
const lines = (s) => String(s || "").split(/\r?\n|,\s*(?=\d{4,5}\s)/).map((x) => x.trim()).filter(Boolean);
export const fileName = (rec) => `${rec.kind === "quote" ? `ozimut-${t("bill.pdf.file.quote")}-${rec.id}` : rec.number || `ozimut-${rec.id}`}.pdf`;

/** The record's PDF (A4). -> Uint8Array. */
export async function make(rec) {
  const L = await pdfLib();
  const doc = await L.PDFDocument.create();
  const font = await doc.embedFont(L.StandardFonts.Helvetica), bold = await doc.embedFont(L.StandardFonts.HelveticaBold);
  const S = rec.seller || {}, B = rec.buyer || {}, c = rec.currency || "eur";
  const kind = ["invoice", "credit", "quote"].includes(rec.kind) ? rec.kind : "invoice";
  const title = t(`bill.pdf.title.${kind}`);
  doc.setTitle(winSafe(`${title} ${rec.number || ""} — ${S.name || "Ozimut"}`)); doc.setCreator("Ozimut"); doc.setProducer("Ozimut (pdf-lib)");
  const W = 595.28, H = 841.89, M = 50, ink = L.rgb(0.1, 0.1, 0.1), grey = L.rgb(0.35, 0.38, 0.42), rule = L.rgb(0.8, 0.82, 0.85), flag = L.rgb(0.83, 0.34, 0.1);
  let page = doc.addPage([W, H]), y = H - M;
  const width = (s, size, f = font) => f.widthOfTextAtSize(winSafe(s), size);
  const text = (s, x, yy, { size = 10, f = font, color = ink, right = false, max = 0 } = {}) => {
    let str = winSafe(s);
    if (max) while (str.length > 1 && f.widthOfTextAtSize(str, size) > max) str = `${str.slice(0, -2)}…`;
    page.drawText(str, { x: right ? x - f.widthOfTextAtSize(str, size) : x, y: yy, size, font: f, color });
  };
  /** A paragraph wrapped to `max`: the y under it. */
  const para = (s, x, yy, { size = 9, f = font, color = grey, max = W - 2 * M, lead = 1.35 } = {}) => {
    for (const piece of String(s || "").split(/\n/)) {
      let ln = "";
      for (const w of piece.split(/\s+/).filter(Boolean)) {
        if (ln && width(`${ln} ${w}`, size, f) > max) { text(ln, x, yy, { size, f, color }); yy -= size * lead; ln = w; } else ln = ln ? `${ln} ${w}` : w;
      }
      if (ln) { text(ln, x, yy, { size, f, color }); yy -= size * lead; }
    }
    return yy;
  };
  const hr = (yy) => page.drawLine({ start: { x: M, y: yy }, end: { x: W - M, y: yy }, thickness: 0.6, color: rule });
  const room = (need) => { if (y < M + need) { page = doc.addPage([W, H]); y = H - M; } };

  // ---- the head: the seller on the left, the document on the right ----
  text(S.name || "Ozimut", M, y, { size: 16, f: bold });
  text(title, W - M, y, { size: 18, f: bold, color: flag, right: true });
  let yl = y - 16, yr = y - 20;
  const sellerLines = [[S.form, S.capital ? t("bill.pdf.capital", { x: S.capital }) : ""].filter(Boolean).join(" — "), ...lines(S.address), S.country && !/^fr$/i.test(S.country) ? S.country : "",
    S.siret ? `SIRET ${S.siret}` : S.siren ? `SIREN ${S.siren}` : "", S.rcs ? `RCS ${S.rcs}` : "",
    S.vat_id || S.vatId ? t("bill.pdf.vatId", { x: S.vat_id || S.vatId }) : "", S.email || ""].filter(Boolean);
  for (const s of sellerLines) { text(s, M, yl, { size: 9, color: grey, max: 250 }); yl -= 12; }
  const meta = [rec.number ? [t("bill.pdf.number"), rec.number] : null,
    [t(kind === "quote" ? "bill.pdf.made" : "bill.pdf.issued"), day(rec.issued_at || rec.created_at)],
    kind === "quote" ? [t("bill.pdf.validUntil"), day(rec.due_at)] : kind === "invoice" ? [t("bill.pdf.due"), day(rec.due_at)] : null,
    kind === "credit" && rec.of_invoice ? [t("bill.pdf.cancels"), String(rec.of_number || rec.of_invoice_number || rec.of_invoice)] : null,
    rec.period_from && rec.period_to ? [t("bill.pdf.period"), `${fmtDate(rec.period_from, "short")} – ${fmtDate(rec.period_to, "short")}`] : null].filter(Boolean);
  for (const [k, v] of meta) { text(`${k} `, W - M - width(v, 10, bold), yr, { size: 9, color: grey, right: true }); text(v, W - M, yr, { size: 10, f: bold, right: true }); yr -= 14; }
  y = Math.min(yl, yr) - 14;

  // ---- the buyer ----
  text(t("bill.pdf.to"), W / 2 + 10, y, { size: 9, f: bold, color: grey }); y -= 14;
  text(B.name || "—", W / 2 + 10, y, { size: 11, f: bold, max: W / 2 - M - 10 }); y -= 14;
  for (const s of [...lines(B.address), B.country && !/^fr$/i.test(B.country) ? B.country : "", B.siret ? `SIRET ${B.siret}` : "", B.vat_id ? t("bill.pdf.vatId", { x: B.vat_id }) : ""].filter(Boolean)) {
    text(s, W / 2 + 10, y, { size: 10, max: W / 2 - M - 10 }); y -= 13;
  }
  y -= 22;

  // ---- the lines ----
  const X = { label: M, qty: W - M - 190, unit: W - M - 95, amount: W - M };
  const head = () => {
    text(t("bill.pdf.col.label"), X.label, y, { size: 9, f: bold, color: grey });
    text(t("bill.pdf.col.qty"), X.qty, y, { size: 9, f: bold, color: grey, right: true });
    text(t("bill.pdf.col.unit"), X.unit, y, { size: 9, f: bold, color: grey, right: true });
    text(t("bill.pdf.col.amount"), X.amount, y, { size: 9, f: bold, color: grey, right: true });
    y -= 5; hr(y); y -= 14;
  };
  head();
  for (const l of rec.lines || []) {
    room(140);
    const yy = para(l.label || "", X.label, y, { size: 10, color: ink, max: X.qty - 60 - M });
    if (l.qty != null) text(String(l.qty), X.qty, y, { size: 10, right: true });
    if (l.unit != null) text(money(l.unit, c), X.unit, y, { size: 10, right: true });
    text(money(l.amount ?? (Number(l.qty) || 1) * (Number(l.unit) || 0), c), X.amount, y, { size: 10, right: true });
    y = Math.min(yy, y - 14) - 3;
  }
  y += 4; hr(y); y -= 16;
  // ---- the totals ----
  const rate = Number(rec.vat_rate) || 0;
  const tot = [[t("bill.pdf.net"), rec.net], [rate ? t("bill.pdf.vat", { rate }) : t("bill.pdf.vat0"), rec.vat || 0]];
  for (const [k, v] of tot) { text(k, X.unit, y, { size: 10, right: true }); text(money(v, c), X.amount, y, { size: 10, right: true }); y -= 15; }
  text(t(kind === "credit" ? "bill.pdf.totalCredit" : "bill.pdf.total"), X.unit, y, { size: 11, f: bold, right: true }); text(money(rec.total, c), X.amount, y, { size: 11, f: bold, right: true }); y -= 16;
  if (!rate && S.vatNote) { text(S.vatNote, X.amount, y, { size: 9, color: grey, right: true }); y -= 14; }
  if (rec.status === "paid" && rec.paid_at) { text(t("bill.pdf.paid", { date: day(rec.paid_at) }), X.amount, y, { size: 10, f: bold, color: flag, right: true }); y -= 14; }
  y -= 12;
  if (rec.note) { room(60); y = para(rec.note, M, y, { size: 9 }) - 8; }

  // ---- how to pay, and the mentions the law asks for between professionals ----
  if (kind === "invoice" && rec.status !== "paid") {
    room(150);
    text(t("bill.pdf.pay"), M, y, { size: 10, f: bold }); y -= 15;
    text(t("bill.pdf.payBy", { date: day(rec.due_at) }), M, y, { size: 10 }); y -= 14;
    if (S.iban) {
      text(t("bill.pdf.holder", { x: S.name || "Ozimut" }), M, y, { size: 10 }); y -= 14;
      text(`IBAN ${iban(S.iban)}${S.bic ? `     BIC ${S.bic}` : ""}`, M, y, { size: 10, f: bold }); y -= 14;
    }
    text(t("bill.pdf.ref", { x: rec.ref || rec.number || "" }), M, y, { size: 10, f: bold }); y -= 20;
    y = para(t("bill.pdf.late"), M, y, { size: 8 }) - 4;
  } else if (kind === "quote") {
    room(80);
    y = para(t("bill.pdf.quoteNote", { date: day(rec.due_at) }), M, y, { size: 9 }) - 4;
  } else if (kind === "credit") {
    room(60);
    y = para(t("bill.pdf.creditNote"), M, y, { size: 9 }) - 4;
  }

  const foot = [S.name, [S.form, S.capital ? t("bill.pdf.capital", { x: S.capital }) : ""].filter(Boolean).join(" "), S.siret ? `SIRET ${S.siret}` : S.siren ? `SIREN ${S.siren}` : "", S.rcs ? `RCS ${S.rcs}` : ""].filter(Boolean).join(" · ");
  const pages = doc.getPages();
  pages.forEach((p, i) => {
    page = p;
    text(foot, M, 30, { size: 7.5, color: grey, max: W - 2 * M - 50 });
    if (pages.length > 1) text(`${i + 1} / ${pages.length}`, W - M, 30, { size: 7.5, color: grey, right: true });
  });
  return doc.save();
}

/** Makes the record's PDF and hands it to the reader. */
export async function save(rec) {
  const bytes = await make(rec);
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
  a.download = fileName(rec);
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 3000);
  return bytes;
}
