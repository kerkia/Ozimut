// What the app gives the page beyond a browser's means (docs/chrono/design.md): `window.chronoApp`. The page runs
// isolated, without Node; everything here is a question to the main process (main.mjs), which answers the hub's own page
// only. CommonJS: a sandboxed preload cannot be a module.

const { contextBridge, ipcRenderer } = require("electron");

const flag = "--chrono-version=";
const version = (process.argv.find((a) => a.startsWith(flag)) || flag).slice(flag.length);
// a Blob does not cross to the main process: its bytes do
const bytes = async (data) => (typeof Blob !== "undefined" && data instanceof Blob ? new Uint8Array(await data.arrayBuffer()) : data);

contextBridge.exposeInMainWorld("chronoApp", {
  version,
  /** `{ port, token, addresses: [IPv4…], name, folder, sirapPort }`: other stations open `http://<address>:<port>/?k=<token>`. */
  hub: () => ipcRenderer.invoke("chrono:hub"),
  /** `[{ name, isDefault }]`. */
  printers: () => ipcRenderer.invoke("chrono:printers"),
  /** Prints a page of HTML: `{ printer?, silent? (true), widthMm? (a receipt's roll) }` → `{ ok, error? }`. */
  print: (html, opts) => {
    const o = opts || {};
    return ipcRenderer.invoke("chrono:print", String(html), { printer: o.printer, silent: o.silent, widthMm: o.widthMm });
  },
  /** Asks where, then writes `data` (text, bytes or a Blob): the path, or null when given up. */
  saveFile: async (name, data) => ipcRenderer.invoke("chrono:save", String(name), await bytes(data)),
  /** Opens the data folder in the system's file manager. */
  openFolder: () => ipcRenderer.invoke("chrono:folder"),
});
