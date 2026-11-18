// Ozimut Chrono, the app (docs/chrono/design.md): Electron's main process. It starts the hub (hub.mjs: the page, the
// assets, the stations' sockets, the journals, the radio listener) and opens a window on the hub's own page — the page the
// other computers and phones open at this computer's address —, so the window is one more station. What a page cannot do
// is given to it through the preload (window.chronoApp): the printers and silent printing, saving a file, the data
// folder. The card reader is the page's own, over Web Serial: this process only says which port.

import { app, BrowserWindow, Menu, dialog, ipcMain, shell } from "electron";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { startHub, saneOps } from "./hub.mjs";
import { strings, fill } from "./strings.mjs";
import { fromFile } from "../site/assets/js/chrono/store.js";
import { choosePort, portLabel, keyOf, ROLES } from "./ports.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const PORT = 8377, MORE_PORTS = 10, SIRAP_PORT = 10000;
const EVENT_FILE = /\.ozchrono(\.jsonl)?$/i, JOURNAL = /^([A-Za-z0-9_-]{1,64})\.ozchrono\.jsonl$/;
const MM = 96 / 25.4;                                       // CSS pixels in a millimetre

// `--smoke` (or CHRONO_SMOKE=1): the launch checked without anyone watching — see smoke() below
const SMOKE_DOC = process.argv.includes("--smoke-doc");      // the same, then Help › Documentation's window opened and drawn
const SMOKE = SMOKE_DOC || process.argv.includes("--smoke") || process.env.CHRONO_SMOKE === "1", SMOKE_S = 60;

let S = strings("en"), hub = null, win = null, docWin = null, origin = "", assets = "";
let waiting = null;                                         // a file asked for (macOS) before the hub is up
let smokeDir = "";

// ---- settings: the hub's token, the data folder when it is not the usual one, where files were last saved ----
const settingsFile = () => path.join(app.getPath("userData"), "settings.json");
const settings = () => {
  try { const s = JSON.parse(fs.readFileSync(settingsFile(), "utf8")); return s && typeof s === "object" ? s : {}; } catch (e) { return {}; }
};
const saveSettings = (s) => {
  try { fs.mkdirSync(path.dirname(settingsFile()), { recursive: true }); fs.writeFileSync(settingsFile(), JSON.stringify(s, null, 2)); } catch (e) { /* kept for this run only */ }
};

const ours = (url) => { try { return new URL(url).origin === origin; } catch (e) { return false; } };
const web = (url) => /^https?:\/\//i.test(url);
const box = (o) => (win ? dialog.showMessageBox(win, o) : dialog.showMessageBox(o));
const show = () => { if (!win) return; if (win.isMinimized()) win.restore(); win.show(); win.focus(); };
const fileIn = (argv) => argv.slice(1).find((a) => EVENT_FILE.test(a) && fs.existsSync(a)) || null;

async function start() {
  S = strings(app.getLocale());
  const set = settings();
  if (!set.token) { set.token = crypto.randomBytes(12).toString("base64url"); saveSettings(set); }
  let docs;
  try { docs = app.getPath("documents"); } catch (e) { docs = app.getPath("home"); }
  // a smoke run keeps away from the user's events and from the ports of an app that is open: its own folder, any free port
  const folder = SMOKE ? path.join(smokeDir, "events") : set.folder || path.join(docs, "Ozimut Chrono");
  assets = app.isPackaged ? path.join(process.resourcesPath, "site", "assets") : path.join(here, "..", "site", "assets");
  try {
    hub = await startHub({ port: SMOKE ? 0 : PORT, tries: MORE_PORTS + 1, sirapPort: SMOKE ? null : SIRAP_PORT, folder, assets, www: path.join(here, "www"),
      token: set.token, name: os.hostname(), version: app.getVersion() });
  } catch (e) {
    if (SMOKE) return smokeEnd([`hub: ${e?.stack || e}`]);
    dialog.showErrorBox(S.startTitle, e.code === "EADDRINUSE" ? fill(S.startPorts, { a: PORT, b: PORT + MORE_PORTS }) : `${fill(S.startFolder, { folder })}\n${e.message}`);
    app.exit(1);
    return;
  }
  origin = `http://127.0.0.1:${hub.port}`;
  menu();
  handlers();
  createWindow(SMOKE ? null : fileIn(process.argv) || waiting);
  if (SMOKE) smoke();
}

/** A window on the hub's pages: it stays on them, any other address opens in the computer's browser. */
function hubWindow(o) {
  const w = new BrowserWindow({
    minWidth: 720, minHeight: 480, title: "Ozimut Chrono", backgroundColor: "#f9f9f7", show: !SMOKE, ...o,
    ...(process.platform === "darwin" ? {} : { icon: path.join(assets, "icon-512.png") }),
    webPreferences: { preload: path.join(here, "preload.cjs"), contextIsolation: true, nodeIntegration: false, sandbox: true,
      additionalArguments: [`--chrono-version=${app.getVersion()}`] },
  });
  w.webContents.setWindowOpenHandler(({ url }) => {
    if (ours(url)) return { action: "allow" };
    if (web(url)) shell.openExternal(url);
    return { action: "deny" };
  });
  w.webContents.on("will-navigate", (e, url) => {
    if (ours(url)) return;
    e.preventDefault();
    if (web(url)) shell.openExternal(url);
  });
  return w;
}

function createWindow(file) {
  win = hubWindow({ width: 1360, height: 860 });
  serial(win.webContents.session);
  win.on("closed", () => { win = null; if (docWin) docWin.close(); });
  if (file) openFile(file); else go();
}
/** The window on the hub's page, on an event when one is named. */
function go(ev = "") {
  if (win) win.loadURL(`${origin}/${ev ? `?ev=${encodeURIComponent(ev)}` : ""}`).catch(() => { /* the window shows what failed */ });
}

/** The documentation (www/doc.html, served by the hub as the page is), in a window of its own beside the timing. */
function openDoc() {
  if (docWin) { if (docWin.isMinimized()) docWin.restore(); docWin.show(); docWin.focus(); return; }
  docWin = hubWindow({ width: 980, height: 820, title: `Ozimut Chrono — ${S.doc}` });
  docWin.setMenuBarVisibility(false);
  docWin.on("closed", () => { docWin = null; });
  docWin.loadURL(`${origin}/doc.html`).catch(() => { /* the window shows what failed */ });
}

// ---- the smoke test: `electron . --smoke`, or the packaged app with `--smoke` ----
// The hub on a free port with a folder of its own, the window hidden. Passed once the page has drawn its home
// (standalone.js: `.chr-home`), the preload has given it `chronoApp` with the app's version and the main process has
// answered it, with no error of the page and no file refused by the hub. Prints « SMOKE OK <version> » and exits 0,
// or what went wrong and exits 1 (after SMOKE_S seconds at most). CHRONO_SMOKE_OUT names a file that gets the same
// lines: a packaged Windows app has no console to print to.
let smokeOver = false;
function smokeEnd(errors, notes = []) {
  if (smokeOver) return;
  smokeOver = true;
  const ok = !errors.length;
  const lines = [...notes.map((n) => `note: ${n}`), ...errors.map((e) => `error: ${e}`), ok ? `SMOKE OK ${app.getVersion()}` : `SMOKE FAILED ${app.getVersion()}`];
  const text = lines.join("\n") + "\n";
  try { if (process.env.CHRONO_SMOKE_OUT) fs.writeFileSync(process.env.CHRONO_SMOKE_OUT, text); } catch (e) { /* the console has it */ }
  try { process.stdout.write(text); } catch (e) { /* no console */ }
  const h = hub;
  hub = null;
  Promise.resolve(h?.close()).catch(() => {}).finally(() => {
    try { if (smokeDir) fs.rmSync(smokeDir, { recursive: true, force: true }); } catch (e) { /* the temp folder's sweep will */ }
    app.exit(ok ? 0 : 1);
  });
}
function smoke() {
  const errors = [], notes = [], t0 = Date.now();
  let done = false, failedAt = 0, busy = false, doc = false;
  const end = () => { if (done) return; done = true; clearInterval(tick); smokeEnd(errors, notes); };
  const watch = (wc, what) => {
    wc.on("console-message", (e) => { if (e.level === "error") errors.push(`${what}: ${e.message}${e.sourceId ? ` (${e.sourceId}:${e.lineNumber})` : ""}`); });
    wc.on("did-fail-load", (e, code, why, url, main) => { if (main) errors.push(`${what}: ${why} (${code}) ${url}`); });
    wc.on("preload-error", (e, file, err) => errors.push(`${what}'s preload: ${err?.message || err}`));
    wc.on("render-process-gone", (e, d) => { errors.push(`${what}: renderer gone (${d.reason})`); end(); });
  };
  watch(win.webContents, "page");
  const ses = win.webContents.session;
  ses.webRequest.onCompleted((d) => { if (d.statusCode >= 400 && ours(d.url)) errors.push(`${d.statusCode} ${d.url}`); });
  ses.webRequest.onErrorOccurred((d) => { if (ours(d.url)) errors.push(`${d.error} ${d.url}`); });
  const look = `(async () => ({ home: !!document.querySelector(".chr-home"), app: typeof window.chronoApp, version: window.chronoApp?.version || "",
    port: (await window.chronoApp?.hub?.())?.port || 0, modules: performance.getEntriesByType("resource").filter((r) => /\\.js(\\?|$)/.test(r.name)).length }))()`;
  const ask = async (wc, js) => { try { return wc.isLoading() ? null : await wc.executeJavaScript(js); } catch (e) { return null; } };      // null: between two pages
  const tick = setInterval(async () => {
    if (done || busy) return;
    if (Date.now() - t0 > SMOKE_S * 1000) { errors.push(`timeout: ${doc ? "the documentation was not drawn" : "no home page"} after ${SMOKE_S} s`); return end(); }
    if (errors.length && !failedAt) failedAt = Date.now();
    if (failedAt && Date.now() - failedAt > 5000) return end();     // what failed will not mend: no need to wait the minute out
    busy = true;
    if (!doc) {
      const s = await ask(win.webContents, look);
      if (s?.home) {
        if (s.app !== "object") errors.push("preload: window.chronoApp is missing");
        else if (s.version !== app.getVersion()) errors.push(`preload: chronoApp.version is « ${s.version} », the app's ${app.getVersion()}`);
        else if (s.port !== hub.port) errors.push(`ipc: chronoApp.hub() gave port ${s.port}, the hub listens on ${hub.port}`);
        notes.push(`${app.isPackaged ? "packaged" : "development"} app, Electron ${process.versions.electron}, hub on ${origin}, ${s.modules} modules loaded in ${Date.now() - t0} ms`);
        if (!SMOKE_DOC) return setTimeout(end, 300);       // an error just raised has the time to be heard
        doc = true;
        openDoc();
        watch(docWin.webContents, "documentation");
      }
    } else if (await ask(docWin.webContents, `document.getElementById("doc")?.childElementCount > 0`)) {
      notes.push(`documentation drawn after ${Date.now() - t0} ms`);
      return setTimeout(end, 300);
    }
    busy = false;
  }, 250);
}

// ---- the serial ports (Web Serial): card readers and receipt printers ----
// The page says what it is about to connect (« chrono:portFor »: si, emit, printer); a browser would show its own list,
// Electron leaves the choice to this process: ports.mjs takes the port when it is sure, else asks, the likely ones first,
// and the port chosen is remembered for that use (settings.ports).
const asking = new Map();                                   // webContents id → { role, at }
async function pickPort(ports, wc) {
  const a = asking.get(wc?.id);
  asking.delete(wc?.id);
  const role = a && Date.now() - a.at < 30000 ? a.role : "";
  const kept = settings().ports || {};
  const r = choosePort(ports, role, kept);
  if (r.pick != null) return r.pick;
  const list = r.ask;
  const { response } = await box({ type: "question", title: role === "printer" ? S.portTitlePrinter : S.portTitle,
    message: { si: S.portAskSi, emit: S.portAskEmit, printer: S.portAskPrinter }[role] || S.portAsk,
    buttons: [...list.map(portLabel), S.cancel], cancelId: list.length, defaultId: 0, noLink: true });
  if (response >= list.length) return "";
  if (role) saveSettings({ ...settings(), ports: { ...kept, [role]: keyOf(list[response]) } });
  return list[response].portId;
}
function serial(ses) {
  ses.on("select-serial-port", (event, ports, wc, done) => {
    event.preventDefault();
    pickPort(ports || [], wc).then((id) => done(id), () => done(""));
  });
  // the hub's page may use what it asks for (serial ports among it, and those already chosen without asking again); no other page
  ses.setPermissionCheckHandler((wc, permission, requesting, details) => ours(requesting || details?.securityOrigin || wc?.getURL() || ""));
  ses.setPermissionRequestHandler((wc, permission, done, details) => done(ours(details?.requestingUrl || wc?.getURL() || "")));
  ses.setDevicePermissionHandler((details) => details.deviceType === "serial" && ours(details.origin));
}

// ---- an event file (.ozchrono, or a journal) opened with the app: its operations join the hub's log of that event ----
function openFile(file) {
  const fail = (message) => { box({ type: "error", title: "Ozimut Chrono", message, detail: file, buttons: [S.ok] }); if (win && !win.webContents.getURL()) go(); };
  let text, f;
  try { text = fs.readFileSync(file, "utf8"); } catch (e) { return fail(S.fileRead); }
  try { f = fromFile(text); } catch (e) { return fail(e.message === "version" ? S.fileNewer : S.fileBad); }
  const ev = f.ev || JOURNAL.exec(path.basename(file))?.[1] || "";
  try { hub.open(ev).merge(saneOps(f.ops)); } catch (e) { return fail(S.fileBad); }
  go(ev);                                                  // the page opens the event its address names
  show();
}
async function pickFile() {
  const o = { title: S.fileTitle, defaultPath: hub.folder, properties: ["openFile"], filters: [{ name: S.fileKind, extensions: ["ozchrono", "jsonl"] }] };
  const { canceled, filePaths } = await (win ? dialog.showOpenDialog(win, o) : dialog.showOpenDialog(o));
  if (!canceled && filePaths?.[0]) openFile(filePaths[0]);
}

// ---- printing ----
const run = (cmd, args) => new Promise((done) => {
  execFile(cmd, args, { timeout: 3000, windowsHide: true, env: { ...process.env, LC_ALL: "C" } }, (err, out) => done(err ? "" : String(out)));
});
/** The system's default printer (Electron's list no longer says which it is). */
async function defaultPrinter() {
  if (process.platform === "win32") {
    const out = await run("reg", ["query", "HKCU\\Software\\Microsoft\\Windows NT\\CurrentVersion\\Windows", "/v", "Device"]);
    return /Device\s+REG_SZ\s+(.+?),winspool/i.exec(out)?.[1] || "";
  }
  return /:\s*(\S+)\s*$/.exec((await run("lpstat", ["-d"])).trim())?.[1] || "";
}
async function printers(wc) {
  const list = await wc.getPrintersAsync();
  const def = list.find((p) => p.isDefault)?.name || await defaultPrinter();
  return list.map((p) => ({ name: p.name, isDefault: p.name === def }));
}
/**
 * A page printed without a word: loaded in a window nobody sees, sent to the printer named (the default one when none).
 * `widthMm`: a receipt — the page is as wide as the roll and as long as the text.
 */
async function print(html, { printer = "", silent = true, widthMm = 0 } = {}) {
  const w = Number(widthMm) > 0 ? Number(widthMm) : 0, quiet = silent !== false;
  const file = path.join(app.getPath("temp"), `ozimut-chrono-${crypto.randomBytes(6).toString("hex")}.html`);
  const page = new BrowserWindow({ show: false, useContentSize: true, width: w ? Math.max(Math.round(w * MM), 120) : 794, height: 1123,
    webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false } });
  try {
    fs.writeFileSync(file, String(html));
    await page.loadFile(file);
    const o = { silent: quiet, deviceName: String(printer || ""), printBackground: true, margins: { marginType: "default" } };   // the page's own @page margins hold
    if (w) {
      const px = await page.webContents.executeJavaScript("Math.ceil(document.documentElement.getBoundingClientRect().height)");
      o.pageSize = { width: Math.round(w * 1000), height: Math.round(Math.max(40, px / MM + 14) * 1000) };     // microns; 14 mm for the margins
    }
    return await new Promise((done) => {
      const late = quiet ? setTimeout(() => done({ ok: false, error: "timeout" }), 120000) : null;
      page.webContents.print(o, (ok, why) => { clearTimeout(late); done(ok ? { ok: true } : { ok: false, error: why || "failed" }); });
    });
  } catch (e) {
    return { ok: false, error: String(e?.message || e) };
  } finally {
    if (!page.isDestroyed()) page.destroy();
    fs.rm(file, { force: true }, () => {});
  }
}

// ---- saving a file the page made (an export, a list) ----
async function saveFile(name, data) {
  const base = path.basename(String(name || "")).replace(/[<>:"/\\|?*\0-\x1f]/g, "_") || "chrono", ext = path.extname(base).slice(1);
  const set = settings(), dir = set.saveDir && fs.existsSync(set.saveDir) ? set.saveDir : hub.folder;
  const o = { title: S.saveTitle, defaultPath: path.join(dir, base), ...(ext ? { filters: [{ name: ext.toUpperCase(), extensions: [ext] }] } : {}) };
  const { canceled, filePath } = await (win ? dialog.showSaveDialog(win, o) : dialog.showSaveDialog(o));
  if (canceled || !filePath) return null;
  await fs.promises.writeFile(filePath, typeof data === "string" ? data : Buffer.from(data));
  if (path.dirname(filePath) !== set.saveDir) saveSettings({ ...settings(), saveDir: path.dirname(filePath) });
  return filePath;
}

// ---- what the preload asks (preload.cjs): only the hub's own page is answered ----
function handlers() {
  const mine = (e) => !!hub && ours(e.senderFrame?.url || "");
  ipcMain.handle("chrono:hub", (e) => (mine(e) ? { port: hub.port, token: hub.token, addresses: hub.addresses(), name: hub.name, folder: hub.folder, sirapPort: hub.sirapPort } : null));
  ipcMain.handle("chrono:printers", (e) => (mine(e) ? printers(e.sender) : []));
  ipcMain.handle("chrono:print", (e, html, opts) => (mine(e) ? print(html, opts && typeof opts === "object" ? opts : {}) : { ok: false, error: "refused" }));
  ipcMain.handle("chrono:save", (e, name, data) => (mine(e) ? saveFile(name, data) : null));
  ipcMain.handle("chrono:folder", (e) => { if (mine(e)) shell.openPath(hub.folder); });
  ipcMain.handle("chrono:portFor", (e, role) => { if (mine(e) && ROLES.includes(role)) asking.set(e.sender.id, { role, at: Date.now() }); return true; });
}

// ---- the menu ----
function about() {
  const urls = hub.addresses().map((a) => `http://${a}:${hub.port}/?k=${encodeURIComponent(hub.token)}`);
  box({ type: "info", title: S.about, message: `Ozimut Chrono — ${fill(S.aboutVersion, { v: app.getVersion() })}`, buttons: [S.ok],
    detail: [urls.length ? `${S.aboutStations}\n${urls.join("\n")}` : S.aboutNoNetwork,
      fill(hub.sirapPort ? S.aboutRadio : S.aboutNoRadio, { port: hub.sirapPort || SIRAP_PORT }), fill(S.aboutFolder, { folder: hub.folder })].join("\n\n") });
}
function menu() {
  const mac = process.platform === "darwin", line = { type: "separator" };
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    ...(mac ? [{ role: "appMenu" }] : []),
    { label: S.file, submenu: [
      { label: S.open, click: () => { pickFile(); } },
      { label: S.folder, click: () => { shell.openPath(hub.folder); } },
      line,
      mac ? { role: "close", label: S.close } : { role: "quit", label: S.quit },
    ] },
    { label: S.edit, submenu: [
      { role: "undo", label: S.undo }, { role: "redo", label: S.redo }, line,
      { role: "cut", label: S.cut }, { role: "copy", label: S.copy }, { role: "paste", label: S.paste }, { role: "selectAll", label: S.selectAll },
    ] },
    { label: S.view, submenu: [
      { role: "reload", label: S.reload }, line,
      { role: "zoomIn", label: S.zoomIn }, { role: "zoomOut", label: S.zoomOut }, { role: "resetZoom", label: S.zoomReset }, line,
      { role: "togglefullscreen", label: S.fullScreen }, { role: "toggleDevTools", label: S.devTools },
    ] },
    { label: S.help, submenu: [
      { label: S.doc, accelerator: "F1", click: () => { openDoc(); } },
      line,
      { label: S.about, click: () => { about(); } },
    ] },
  ]));
}

if (SMOKE) {
  // nothing of the user's is read or written: settings in a folder of its own, which also keeps this run apart from an
  // app that is open (the single-instance lock goes by that folder)
  smokeDir = fs.mkdtempSync(path.join(os.tmpdir(), "ozimut-chrono-smoke-"));
  app.setPath("userData", path.join(smokeDir, "user"));
  app.disableHardwareAcceleration();                       // a build machine has no graphics card to count on
  setTimeout(() => smokeEnd([`timeout: the app was not ready after ${SMOKE_S + 15} s`]), (SMOKE_S + 15) * 1000);
  process.on("uncaughtException", (e) => smokeEnd([`main: ${e?.stack || e}`]));
  process.on("unhandledRejection", (e) => smokeEnd([`main: ${e?.stack || e}`]));
}

// ---- one app at a time: a second launch (a file double-clicked) is handed to the first ----
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on("second-instance", (e, argv) => { const file = fileIn(argv); if (file && hub) openFile(file); show(); });
  app.on("open-file", (e, file) => { e.preventDefault(); if (hub) openFile(file); else waiting = file; });       // macOS
  app.on("window-all-closed", () => app.quit());
  // the journals are closed before the app goes
  app.on("will-quit", (e) => {
    if (!hub) return;
    e.preventDefault();
    const h = hub;
    hub = null;
    h.close().catch(() => {}).finally(() => app.quit());
  });
  app.whenReady().then(start).catch((e) => {
    if (SMOKE) return smokeEnd([`start: ${e?.stack || e}`]);
    dialog.showErrorBox(S.startTitle, String(e?.message || e));
    app.exit(1);
  });
}
