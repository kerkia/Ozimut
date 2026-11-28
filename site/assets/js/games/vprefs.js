// Virtuoz's settings kept with the account (owner, 2026-11-28): one's keys (games/vkeys.js) and one's avatar (games/vavatar.js)
// come back at the next sign-in, on any device. The browser's copy (localStorage) is what the game reads; the account's
// (GET|PUT /api/virtual/prefs, each setting with its own time of change) is written a moment after each change and read once a
// visit: for each setting the later of the two wins (`<store>.at`, this browser's time of change); what was chosen before this
// existed is sent up. Nothing here needs the texts: any page may import it.
const PREFS = "/api/virtual/prefs";
// setting → its localStorage key and the name of its time in the server's answer
const ITEMS = { keys: { store: "ocn.vt.keys", at: "at" }, avatar: { store: "ocn.vt.avatar", at: "avatarAt" } };
const WAIT = 700;                                              // ms after the last change (a colour picker dragged fires many)

const read = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
const stamp = (name, at) => { try { localStorage.setItem(`${ITEMS[name].store}.at`, String(at)); } catch (e) { /* not kept */ } };
const stampOf = (name) => Number(read(`${ITEMS[name].store}.at`)) || 0;

const waiting = new Map();                                     // name → { value, timer }
async function put(name, value) {
  try {
    const r = await fetch(PREFS, { method: "PUT", credentials: "same-origin", keepalive: true, headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [name]: value }) });
    const j = r.ok ? await r.json() : null;
    if (j?.at && !waiting.has(name)) stamp(name, j.at);
    return r.ok;
  } catch (e) { return false; }
}
const flush = (name) => { const w = waiting.get(name); if (!w) return; clearTimeout(w.timer); waiting.delete(name); put(name, w.value); };

/** Keep a setting with the account (null: back to the default). The browser's copy is the caller's to write. */
export function keep(name, value) {
  if (!ITEMS[name]) return;
  stamp(name, Date.now());
  const w = waiting.get(name);
  if (w) clearTimeout(w.timer);
  waiting.set(name, { value, timer: setTimeout(() => flush(name), WAIT) });
}
// a change still waiting when the page goes is sent at once
if (typeof addEventListener === "function") addEventListener("pagehide", () => { for (const n of [...waiting.keys()]) flush(n); });

let synced = null;
/** The account's settings brought to this browser (or this browser's to the account), once a visit; resolves with the names it
 *  took from the account ([] for none). Never rejects; 1.5 s at most. */
export function sync() {
  return (synced ||= Promise.race([new Promise((r) => setTimeout(() => r([]), 1500)), (async () => {
    const took = [];
    try {
      const r = await fetch(PREFS, { credentials: "same-origin" });
      if (!r.ok) return took;
      const j = await r.json();
      for (const [name, it] of Object.entries(ITEMS)) {
        const theirs = Number(j[it.at]) || 0, mine = stampOf(name), local = read(it.store);
        if (theirs > mine) {
          try { if (j[name]) localStorage.setItem(it.store, JSON.stringify(j[name])); else localStorage.removeItem(it.store); } catch (e) { continue; }
          stamp(name, theirs);
          took.push(name);
        } else if (local && (mine > theirs || !theirs)) {
          try { stamp(name, mine || Date.now()); put(name, JSON.parse(local)); } catch (e) { /* at the next change */ }
        }
      }
    } catch (e) { /* offline: the browser's copy */ }
    return took;
  })()]));
}
