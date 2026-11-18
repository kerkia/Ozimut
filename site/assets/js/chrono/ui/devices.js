// What is plugged into a station: card readers (SPORTident, Emit — over Web Serial, in a page as in the app) and a printer
// for receipts (a thermal printer on a serial or Bluetooth port, the system's printer, or the app's silent printing).
// The choices are this computer's (`localStorage oz.chrono.dev`); nothing here knows about posts.

import { t } from "../../i18n.js";
import { receipt, escpos, receiptHtml } from "../print/receipt.js";
import { printHtml } from "./kit.js";

const KEY = "oz.chrono.dev";
const load = () => { try { return JSON.parse(localStorage.getItem(KEY) || "{}"); } catch (e) { return {}; } };
const save = (v) => { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch (e) { /* this visit only */ } };

export const serialOk = () => typeof navigator !== "undefined" && "serial" in navigator;
/** A port's USB ids, as Web Serial gives them. */
const idOf = (port) => { const i = port?.getInfo?.() || {}; return { vid: i.usbVendorId ?? null, pid: i.usbProductId ?? null }; };
const SI_IDS = { vid: 0x10C4, pid: 0x800A };

/** The labels a receipt needs, from the catalogue. */
export function receiptLabels(ev) {
  const st = {};
  for (const s of ["ok", "mp", "dnf", "dns", "dsq", "ot", "nc", "run", "wait"]) st[s] = t(`chr.st.${s}`);
  return { card: t("chr.rc.card"), start: t("chr.rc.start"), finish: t("chr.rc.finish"), time: t("chr.rc.time"), place: t("chr.rc.place"), behind: t("chr.rc.behind"),
    pace: t("chr.rc.pace"), missing: t("chr.rc.missing"), extra: t("chr.rc.extra"), points: t("chr.rc.points"), penalty: t("chr.rc.penalty"), status: st,
    cols: [t("chr.rc.n"), t("chr.rc.code"), t("chr.rc.time"), t("chr.rc.leg"), t("chr.rc.pl")], finishRow: t("chr.rc.fin"), rent: t("chr.rc.rent"),
    footer: [ev?.footer || t("chr.rc.footer")] };
}

/**
 * `on`: `{ card(raw, reader), punch(p, reader), change() }`. Returns the station's devices:
 * `{ readers, printer, connect(sys), disconnect(id), setClock(id), setPrinter(patch), pickPrinterPort(), printReceipt(row, ctx), test() }`.
 */
export function makeDevices(on) {
  const prefs = load();
  const D = {
    readers: [],                                                        // { id, sys, label, state, info, handle, port }
    printer: { mode: "none", width: 32, auto: false, baud: 9600, name: "", ...(prefs.printer || {}) },
    printerPort: null, lastError: "",
  };
  const keep = () => save({ ...load(), printer: D.printer, sys: undefined, readers: D.readers.map((r) => ({ sys: r.sys, kind: r.kind || "auto", ...idOf(r.port) })),
    printerPort: D.printerPort ? idOf(D.printerPort) : null });
  // in the app, the port asked for next is for this use: it then takes the right one, or asks the right question
  const tellApp = async (role) => { if (window.chronoApp?.portFor) { try { await window.chronoApp.portFor(role); } catch (e) { /* an older app */ } } };
  let seq = 0;

  async function attach(port, sys, kind) {
    const mod = sys === "emit" ? await import("../emit/reader.js") : await import("../si/reader.js");
    const ws = await import("../si/webserial.js");
    if (sys === "emit" && kind === "auto") kind = mod.kindOfPort(port.getInfo?.());   // the first eScan is known by its USB ids
    const r = { id: ++seq, sys, kind, label: sys === "emit" ? "Emit" : "SPORTident", state: "opening", info: null, port, handle: null };
    D.readers.push(r);
    on.change();
    try {
      r.handle = await mod.openReader(ws.transportOf(port), {
        kind,
        onCard: (raw) => on.card({ ...raw, sys: raw.sys || sys, at: raw.at || Date.now() }, r),
        onPunch: (p) => on.punch?.(p, r),
        onState: (s) => { r.state = typeof s === "string" ? s : s?.state || r.state; if (s?.info) r.info = s.info; on.change(); },
        onError: (e) => { r.state = "error"; r.error = e?.message || String(e); on.change(); },
      });
      r.info = (await r.handle.info?.()) || r.info;
      if (r.state === "opening") r.state = "ready";
    } catch (e) { r.state = "error"; r.error = e?.message || String(e); }
    on.change();
    return r;
  }

  /** The user picks a port; `sys`: "si" | "emit"; `kind` (Emit): "250" | "mtr4" | "escan" (an eScan2: its own speed) | "auto". */
  D.connect = async (sys = "si", kind = "auto") => {
    if (!serialOk()) throw new Error("noserial");
    const ws = await import("../si/webserial.js");
    await tellApp(sys === "emit" ? "emit" : "si");
    const port = await ws.requestPort(sys);
    if (!port) return null;
    const r = await attach(port, sys, kind);
    keep();
    return r;
  };
  /** The ports already allowed on this computer are opened again (after a reload). */
  D.reconnect = async () => {
    const want = prefs.readers || (prefs.sys || []).filter((s) => s === "si").map(() => ({ sys: "si", kind: "auto", ...SI_IDS }));
    const printer = D.printer.mode === "escpos" ? prefs.printerPort : null;
    if (!serialOk() || (!want.length && !printer)) return;
    try {
      const ws = await import("../si/webserial.js");
      const ports = await ws.knownPorts(), used = new Set();
      // each use takes a port of the USB ids it had; when ids are shared by two uses (an Emit reader and a printer on one
      // kind of cable), nothing is guessed: those are connected again by hand
      const uses = [...want.map((w) => ({ ...w, role: w.sys })), ...(printer ? [{ ...printer, role: "printer" }] : [])];
      const same = (p, w) => w.vid != null && idOf(p).vid === w.vid && idOf(p).pid === w.pid;
      for (const w of uses) {
        if (w.vid == null) continue;
        const roles = new Set(uses.filter((u) => u.vid === w.vid && u.pid === w.pid).map((u) => u.role));
        const free = ports.filter((p) => !used.has(p) && same(p, w));
        if (!free.length || (roles.size > 1 && free.length > 1)) continue;
        used.add(free[0]);
        if (w.role === "printer") { try { await free[0].open({ baudRate: D.printer.baud || 9600 }); D.printerPort = free[0]; } catch (e) { /* asked again by hand */ } }
        else await attach(free[0], w.sys, w.kind || "auto");
      }
      on.change();
    } catch (e) { /* asked again by hand */ }
  };
  D.disconnect = async (id) => {
    const i = D.readers.findIndex((r) => r.id === id);
    if (i < 0) return;
    const [r] = D.readers.splice(i, 1);
    try { await r.handle?.close(); } catch (e) { /* already gone */ }
    keep(); on.change();
  };
  /** The reader's clock set to this computer's. */
  D.setClock = async (id) => { const r = D.readers.find((x) => x.id === id); if (!r?.handle?.setTime) throw new Error("noclock"); await r.handle.setTime(new Date()); };

  D.setPrinter = (patch) => { Object.assign(D.printer, patch); keep(); on.change(); };
  D.pickPrinterPort = async () => {
    if (!serialOk()) throw new Error("noserial");
    await tellApp("printer");
    const port = await navigator.serial.requestPort();
    await port.open({ baudRate: D.printer.baud || 9600 });
    D.printerPort = port;
    D.setPrinter({ mode: "escpos" });
    keep();
    return true;
  };
  async function raw(bytes) {
    if (!D.printerPort) throw new Error("noprinter");
    const w = D.printerPort.writable.getWriter();
    try { await w.write(bytes); } finally { w.releaseLock(); }
  }
  /** A runner's receipt on the station's printer; `ctx`: { event, course, of }. Resolves to true when sent. */
  D.printReceipt = async (row, ctx) => {
    const p = D.printer;
    if (p.mode === "none") return false;
    const lines = receipt(row, { ...ctx, labels: receiptLabels(ctx.event) }, p.width);
    try {
      if (p.mode === "escpos") await raw(escpos(lines, p.width));
      else await printHtml(receiptHtml(lines, p.width), { silent: p.mode === "app", printer: p.name, widthMm: p.width >= 40 ? 80 : 58 });
      D.lastError = "";
      return true;
    } catch (e) { D.lastError = e?.message || String(e); on.change(); return false; }
  };
  D.close = async () => { for (const r of [...D.readers]) { try { await r.handle?.close(); } catch (e) { /* gone */ } } D.readers = []; try { await D.printerPort?.close(); } catch (e) { /* gone */ } };
  return D;
}

/**
 * A made-up card for a runner, as a reader would give it (the rehearsal, the demonstration): `fault` "" | "mp" (a control
 * skipped) | "dnf" (no finish) | "extra". Times from the runner's start, else from `from`, at about `pace` s a control.
 */
export function fakeRead(st, runner, { fault = "", from = null, pace = 240, rand = Math.random } = {}) {
  const k = st.classes[runner.cls], ids = k?.pool?.length ? k.pool : k?.course ? [k.course] : [];
  const course = st.courses[runner.course] || st.courses[ids[Math.floor(rand() * ids.length)]];
  let codes = (course?.controls || []).map(Number);
  if (course?.score) codes = codes.filter(() => rand() < 0.7).sort(() => rand() - 0.5);
  if (fault === "mp" && codes.length > 1) codes.splice(1 + Math.floor(rand() * (codes.length - 1)), 1);
  if (fault === "extra" && codes.length) codes.splice(1, 0, codes[codes.length - 1] + 100);
  const start = runner.start ?? from ?? st.event.zero ?? 36000;
  let s = start;
  const punches = codes.map((code) => { s += Math.round(pace * (0.6 + rand() * 0.9)); return { code, t: s }; });
  s += Math.round(30 + rand() * 60);
  return { sys: st.event.timing || "si", card: Number(runner.card) || 0, family: "sim", clear: { t: start - 900 }, check: { t: start - 600 },
    start: st.event.startMode === "punch" ? { t: start } : null, finish: fault === "dnf" ? null : { t: s }, punches, at: Date.now() };
}
