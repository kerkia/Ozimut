// Which serial port the page gets when it asks for one. A browser shows its own list; Electron leaves the choice to the
// app (main.mjs, « select-serial-port »). The page says first what it is connecting (preload `portFor`): a SPORTident
// reader, an Emit reader or a receipt printer. A port is taken without asking only when it is the only one plugged in,
// or the only one that is surely that device (by its USB ids), or the one chosen for that use last time; else the user
// says which, the likely ones first. Pure: no Electron here, so that the tests run under Node.

export const SPORTIDENT = 0x10C4;                // Silicon Labs, the USB chip of SPORTident's stations and radio dongles
export const SI_PRODUCT = 0x800A;                // SPORTident's own product id on that chip (other CP210x cables: EA60…)
export const FTDI = 0x0403;                      // the chip of Emit's 250 reader, MTR4 and eScan2 — and of many other cables
export const ESCAN = [0x2047, 0x0300];           // the first eScan (Texas Instruments)
export const ROLES = ["si", "emit", "printer"];

const ids = (v) => { const s = String(v ?? ""); return [parseInt(s, 10), parseInt(s, 16)]; };      // decimal, or hexadecimal
const has = (p, vendor, product = null) => ids(p.vendorId).includes(vendor) && (product == null || ids(p.productId).includes(product));
export const isSiStation = (p) => has(p, SPORTIDENT, SI_PRODUCT);

/** What surely is that device. A printer is never known by its ids: any cable may carry one. */
const SURE = {
  si: (p) => isSiStation(p),
  emit: (p) => has(p, ESCAN[0], ESCAN[1]),
  printer: () => false,
};
/** What may be that device. */
const MAYBE = {
  si: (p) => has(p, SPORTIDENT),
  emit: (p) => has(p, FTDI),
  printer: (p) => !isSiStation(p),
};

/** A port as the app remembers it: its USB ids and serial number, else its name. */
export const keyOf = (p) => [p.vendorId ?? "", p.productId ?? "", p.serialNumber || p.portName || p.portId || ""].join(":");

/**
 * `ports`: Electron's list ([{ portId, portName, displayName, vendorId, productId, serialNumber }]); `role`: "si" | "emit" |
 * "printer" | "" (the page did not say). `kept`: { role: key } the ports chosen before. Returns `{ pick }` (a portId) when
 * nothing needs asking, else `{ ask: [ports, the likely first] }`.
 */
export function choosePort(ports, role = "", kept = {}) {
  if (!ports.length) return { pick: "" };
  if (ports.length === 1) return { pick: ports[0].portId };
  if (!ROLES.includes(role)) return { ask: ports.slice(0, 8) };
  const sure = ports.filter(SURE[role]);
  if (sure.length === 1) return { pick: sure[0].portId };
  const maybe = ports.filter(MAYBE[role]);
  if (role === "si" && maybe.length === 1) return { pick: maybe[0].portId };
  const before = kept[role] ? ports.filter((p) => keyOf(p) === kept[role]) : [];
  if (before.length === 1 && (role !== "si" || MAYBE.si(before[0]))) return { pick: before[0].portId };
  // the likely ones first; another use's device last
  const rank = (p) => (SURE[role](p) ? 0 : MAYBE[role](p) ? 1 : ROLES.some((r) => r !== role && SURE[r](p)) ? 3 : 2);
  return { ask: [...ports].sort((a, b) => rank(a) - rank(b)).slice(0, 8) };
}

/** A port's name in the list the user chooses from. */
export const portLabel = (p) => (p.displayName && p.displayName !== p.portName ? `${p.displayName} (${p.portName})` : p.portName || p.portId);
