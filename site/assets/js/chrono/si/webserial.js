// This Source Code Form is subject to the terms of the Mozilla Public License, v. 2.0. If a copy of the MPL was not
// distributed with this file, You can obtain one at https://mozilla.org/MPL/2.0/.

// Web Serial as a reader's transport (`{ open({ baud }), write(bytes), onData(cb), close() }`): a SPORTident station's USB
// port (Silicon Labs CP210x, 10C4:800A), or any serial port — an Emit unit, a station on a serial adapter, a radio dongle.
// 8 data bits, no parity, 1 stop bit, no flow control, as GecoSI and lool-ing/sportident open the port.
// Nothing here runs at import: the module is also loaded under Node by the tests.

export const SI_USB = { usbVendorId: 0x10C4, usbProductId: 0x800A };

const serial = () => (typeof navigator !== "undefined" && navigator.serial) || null;
const isSi = (port) => { const i = port.getInfo?.() || {}; return i.usbVendorId === SI_USB.usbVendorId && i.usbProductId === SI_USB.usbProductId; };
/** `requestPort("emit")`, `requestPort({ any: true })`: every port; `requestPort()`, `requestPort("si")`: SPORTident's. */
const wantsAny = (what) => (typeof what === "string" ? what !== "si" : !!what?.any);

/** True where the browser (or the app) has Web Serial. */
export const serialSupported = () => !!serial();

/** The user picks a port (a click must have led here); null when they give up. */
export async function requestPort(what) {
  const s = serial();
  if (!s) return null;
  try { return await s.requestPort(wantsAny(what) ? {} : { filters: [SI_USB] }); }
  catch (e) { if (e?.name === "NotFoundError" || e?.name === "AbortError") return null; throw e; }
}

/** The ports this site was already allowed: SPORTident's first; with `{ any: false }` those alone. */
export async function knownPorts(what = { any: true }) {
  const s = serial();
  if (!s) return [];
  const ports = await s.getPorts();
  return wantsAny(what) ? [...ports.filter(isSi), ...ports.filter((p) => !isSi(p))] : ports.filter(isSi);
}

/**
 * A port as a transport. `open` may be called again after `close` (another speed). Beside the four methods:
 * `onClose(cb)` — the port went away (unplugged) —, and `port`.
 */
export function transportOf(port) {
  let onData = null, onGone = null, reader = null, loop = null, open = false;
  async function pump() {
    try {
      while (open && port.readable) {
        reader = port.readable.getReader();
        try {
          for (;;) {
            const { value, done } = await reader.read();
            if (done) break;
            if (value?.length && onData) { try { onData(value); } catch (e) { /* the listener's own business */ } }
          }
        } catch (e) { /* a framing or overrun error: `readable` is replaced, read on */ }
        finally { try { reader.releaseLock(); } catch (e) { /* released */ } reader = null; }
        if (!open) break;
      }
    } finally { if (open) { open = false; try { onGone?.(); } catch (e) { /* listener */ } } }
  }
  return {
    port,
    async open({ baud = 38400 } = {}) {
      if (open) await this.close();
      await port.open({ baudRate: baud, dataBits: 8, stopBits: 1, parity: "none", flowControl: "none", bufferSize: 4096 });
      open = true;
      loop = pump();
    },
    async write(data) {
      if (!open || !port.writable) throw new Error("closed");
      const w = port.writable.getWriter();
      try { await w.write(data instanceof Uint8Array ? data : Uint8Array.from(data)); } finally { w.releaseLock(); }
    },
    onData(cb) { onData = cb; },
    onClose(cb) { onGone = cb; },
    async close() {
      if (!open) return;
      open = false;
      try { await reader?.cancel(); } catch (e) { /* nothing was being read */ }
      try { await loop; } catch (e) { /* ended */ }
      try { await port.close(); } catch (e) { /* unplugged */ }
    },
  };
}
