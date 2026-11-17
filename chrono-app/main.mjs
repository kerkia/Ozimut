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

const here = path.dirname(fileURLToPath(import.meta.url));
const PORT = 8377, MORE_PORTS = 10, SIRAP_PORT = 10000;
const SPORTIDENT = 0x10C4;                                  // the USB vendor of SPORTident's stations
const EVENT_FILE = /\.ozchrono(\.jsonl)?$/i, JOURNAL = /^([A-Za-z0-9_-]{1,64})\.ozchrono\.jsonl$/;
const MM = 96 / 25.4;                                       // CSS pixels in a millimetre

let S = strings("en"), hub = null, win = null, origin = "", assets = "";
let waiting = null;                                         // a file asked for (macOS) before the hub is up

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
  const folder = set.folder || path.join(docs, "Ozimut Chrono");
  assets = app.isPackaged ? path.join(process.resourcesPath, "site", "assets") : path.join(here, "..", "site", "assets");
  try {
    hub = await startHub({ port: PORT, tries: MORE_PORTS + 1, sirapPort: SIRAP_PORT, folder, assets, www: path.join(here, "www"),
      token: set.token, name: os.hostname(), version: app.getVersion() });
  } catch (e) {
    dialog.showErrorBox(S.startTitle, e.code === "EADDRINUSE" ? fill(S.startPorts, { a: PORT, b: PORT + MORE_PORTS }) : `${fill(S.startFolder, { folder })}\n${e.message}`);
    app.exit(1);
    return;
  }
  origin = `http://127.0.0.1:${hub.port}`;
  menu();
  handlers();
  createWindow(fileIn(process.argv) || waiting);
}

function createWindow(file) {
  win = new BrowserWindow({
    width: 1360, height: 860, minWidth: 720, minHeight: 480, title: "Ozimut Chrono", backgroundColor: "#f9f9f7",
    ...(process.platform === "darwin" ? {} : { icon: path.join(assets, "icon-512.png") }),
    webPreferences: { preload: path.join(here, "preload.cjs"), contextIsolation: true, nodeIntegration: false, sandbox: true,
      additionalArguments: [`--chrono-version=${app.getVersion()}`] },
  });
  serial(win.webContents.session);
  win.on("closed", () => { win = null; });
  // the window stays on the hub's page: any other address opens in the computer's browser
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (ours(url)) return { action: "allow" };
    if (web(url)) shell.openExternal(url);
    return { action: "deny" };
  });
  win.webContents.on("will-navigate", (e, url) => {
    if (ours(url)) return;
    e.preventDefault();
    if (web(url)) shell.openExternal(url);
  });
  if (file) openFile(file); else go();
}
/** The window on the hub's page, on an event when one is named. */
function go(ev = "") {
  if (win) win.loadURL(`${origin}/${ev ? `?ev=${encodeURIComponent(ev)}` : ""}`).catch(() => { /* the window shows what failed */ });
}

// ---- the card reader's port (Web Serial) ----
// The page asks for a port (navigator.serial.requestPort); a browser would show its own list, Electron leaves the choice
// to this process: the only port; of several, SPORTident's; still several, the user says which.
const usbIds = (v) => { const s = String(v ?? ""); return [parseInt(s, 10), parseInt(s, 16)]; };     // written in decimal, or in hexadecimal
async function choosePort(ports) {
  if (ports.length < 2) return ports[0]?.portId || "";
  const si = ports.filter((p) => usbIds(p.vendorId).includes(SPORTIDENT)), list = (si.length ? si : ports).slice(0, 8);
  if (list.length === 1) return list[0].portId;
  const label = (p) => (p.displayName && p.displayName !== p.portName ? `${p.displayName} (${p.portName})` : p.portName || p.portId);
  const { response } = await box({ type: "question", title: S.portTitle, message: S.portAsk, buttons: [...list.map(label), S.cancel],
    cancelId: list.length, defaultId: 0, noLink: true });
  return response < list.length ? list[response].portId : "";
}
function serial(ses) {
  ses.on("select-serial-port", (event, ports, wc, done) => {
    event.preventDefault();
    choosePort(ports || []).then((id) => done(id), () => done(""));
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
    { label: S.help, submenu: [{ label: S.about, click: () => { about(); } }] },
  ]));
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
  app.whenReady().then(start).catch((e) => { dialog.showErrorBox(S.startTitle, String(e?.message || e)); app.exit(1); });
}
