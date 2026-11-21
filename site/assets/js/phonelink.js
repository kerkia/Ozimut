// phonelink.js — « Depuis mon téléphone » (owner, 2026-11-03): on a computer, a photo of the map or a trace file taken from the
// phone. The computer shows a QR code; the phone that scans it opens #/envoi/<id>.<key> (pages/phonesend.js) and sends its
// photo or file; the computer, asking every few seconds (/api/phone), takes each file as one dropped on the page (onFiles).
// The file passes through the server for the transfer only: deleted once taken, and the link when the dialog closes.
// Offered on computers only: a phone has its own camera button.

import { html, raw, $ } from "./util.js";
import { t } from "./i18n.js";
import { QRCODE } from "./vendor.js";
import { bar } from "./waitbar.js";

const POLL_MS = 2000;
let qrP = null;
const qrLib = () => (qrP ||= import(QRCODE).catch((e) => { qrP = null; throw e; }));

/** May this device show the QR code? A computer: a phone or a tablet takes the photo itself. */
export const offered = () => !matchMedia("(pointer: coarse)").matches;

/** The button, or nothing on a phone. */
export const button = (id, { cls = "btn btn-sm" } = {}) => (offered()
  ? html`<button type="button" class="${cls} ph-btn" id="${id}" title="${t("ph.btn.tip")}">📱 ${t("ph.btn")}</button>` : "");

/** The button found in root (or the document) opens the dialog. */
export function bind(id, opts, root = document) {
  const b = root.querySelector(`#${id}`);
  if (b) b.addEventListener("click", () => open(opts));
}

/** The QR code of text as an SVG, black on white whatever the theme (a phone's camera reads dark on light). */
export async function qrSvg(text) {
  const { qrcode } = await qrLib();
  const q = qrcode(0, "M");
  q.addData(text, "Byte");
  q.make();
  const n = q.getModuleCount(), m = 4, s = n + 2 * m;
  let d = "";
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.isDark(r, c)) d += `M${c + m} ${r + m}h1v1h-1z`;
  return `<svg class="ph-qr" viewBox="0 0 ${s} ${s}" shape-rendering="crispEdges" role="img" aria-label="${t("ph.qr.alt")}">`
    + `<rect width="${s}" height="${s}" fill="#fff"/><path d="${d}" fill="#000"/></svg>`;
}

const hhmm = (ms) => new Date(ms).toLocaleTimeString(document.documentElement.lang || undefined, { hour: "2-digit", minute: "2-digit" });

/**
 * Opens the dialog: kind "map" (a photo of the map), "trace" (a trace file) or "any"; onFiles(files) gets each file as it
 * comes; multiple false closes the dialog after the first.
 */
export async function open({ kind = "any", multiple = true, onFiles }) {
  const d = document.createElement("dialog");
  d.className = "ph-dlg";
  document.body.append(d);
  let link = null, timer = 0, closed = false;
  const got = new Set(), names = [];
  const close = () => { if (d.open) d.close(); };
  d.addEventListener("close", () => {
    closed = true; clearTimeout(timer);
    if (link) fetch(`/api/phone/${link.id}`, { method: "DELETE", headers: { "X-Key": link.dk }, keepalive: true }).catch(() => {});
    d.remove();
  });
  d.addEventListener("click", (e) => { if (e.target === d) close(); });
  const head = html`<div class="ph-dlg-h"><b>${t("ph.title")}</b><button type="button" class="btn btn-ghost btn-sm" data-close aria-label="${t("ph.close")}">✕</button></div>`;
  const wire = () => d.querySelectorAll("[data-close]").forEach((b) => b.addEventListener("click", close));

  async function start() {
    clearTimeout(timer);
    if (link) fetch(`/api/phone/${link.id}`, { method: "DELETE", headers: { "X-Key": link.dk } }).catch(() => {});
    link = null;
    d.innerHTML = html`${raw(head)}<div class="ph-body"><div class="ph-qr-box">${raw(bar(null))}</div></div>`;
    wire();
    if (!d.open) d.showModal();
    let qr = "";
    try {
      const r = await fetch("/api/phone", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind }) });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      link = await r.json();
      qr = await qrSvg(`${location.origin}/#/envoi/${link.id}.${link.pk}`);
    } catch (e) {
      d.innerHTML = html`${raw(head)}<div class="ph-body"><p class="notice">${t("ph.err.create")}</p>
        <div class="row"><button type="button" class="btn btn-primary" id="ph-again">${t("ph.again")}</button></div></div>`;
      wire();
      $("#ph-again", d).addEventListener("click", start);
      return;
    }
    if (closed) return;
    const url = `${location.origin}/#/envoi/${link.id}.${link.pk}`;
    d.innerHTML = html`${raw(head)}<div class="ph-body">
      <p>${t(`ph.scan.${kind}`)}</p>
      <div class="ph-qr-box">${raw(qr)}</div>
      <p class="ph-state" id="ph-state" aria-live="polite">${raw(bar(null, "ph-wait"))} <span>${t("ph.wait")}</span></p>
      <ul class="ph-got" id="ph-got"></ul>
      <details class="ph-link"><summary>${t("ph.link")}</summary>
        <div class="row"><input readonly value="${url}" id="ph-url"><button type="button" class="btn btn-sm" id="ph-copy">${t("ph.copy")}</button></div></details>
      <p class="muted ph-note">${t("ph.until", { time: hhmm(link.exp) })} ${t("ph.private")}</p>
      <div class="row ph-foot"><button type="button" class="btn" data-close>${t("ph.close")}</button></div></div>`;
    wire();
    $("#ph-copy", d).addEventListener("click", async () => {
      try { await navigator.clipboard.writeText(url); } catch (e) { $("#ph-url", d).select(); document.execCommand("copy"); }
      $("#ph-copy", d).textContent = t("ph.copied");
    });
    poll();
  }

  const say = (text, waiting = true) => {
    const el = $("#ph-state", d);
    if (el) el.innerHTML = html`${waiting ? raw(bar(null, "ph-wait")) : ""} <span>${text}</span>`;
  };
  function expired() {
    say(t("ph.expired"), false);
    const foot = $(".ph-foot", d);
    if (foot && !$("#ph-again", d)) {
      foot.insertAdjacentHTML("afterbegin", html`<button type="button" class="btn btn-primary" id="ph-again">${t("ph.again")}</button>`);
      $("#ph-again", d).addEventListener("click", start);
    }
  }
  async function poll() {
    if (closed || !link) return;
    const me = link;
    try {
      const r = await fetch(`/api/phone/${me.id}`, { headers: { "X-Key": me.dk }, cache: "no-store" });
      if (r.status === 410) return expired();
      if (r.ok) {
        const { files = [], seen } = await r.json();
        for (const f of files) {
          if (got.has(f.n) || closed || link !== me) continue;
          got.add(f.n);
          say(t("ph.taking", { name: f.name }));
          const res = await fetch(`/api/phone/${me.id}/file/${f.n}`, { headers: { "X-Key": me.dk }, cache: "no-store" });
          if (!res.ok) { say(t("ph.err.get"), false); continue; }
          const file = new File([await res.blob()], f.name, { type: f.type || "", lastModified: Date.now() });
          names.push(f.name);
          $("#ph-got", d).innerHTML = names.map((n) => html`<li>✓ ${t("ph.got", { name: n })}</li>`).join("");
          try { await onFiles?.([file]); } catch (e) { console.error(e); }
          if (!multiple) { close(); return; }
        }
        if (names.length) say(t("ph.more"));
        else if (seen) say(t("ph.seen"));
      }
    } catch (e) { /* the network: asked again */ }
    if (Date.now() > me.exp) return expired();
    if (!closed && link === me) timer = setTimeout(poll, POLL_MS);
  }
  await start();
}
