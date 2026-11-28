// Pixel's keys of one's own (owner, 2026-11-28; docs/pixel/competitions.md §4): every keyboard action of the game
// (games/virtually.js) with its default physical keys (KeyboardEvent.code, so that a game's « WASD » stays where the fingers are
// on any layout), the bindings in use — the defaults, merged with what the player chose in Avatar › Commandes (games/vkeysui.js),
// kept in this browser (localStorage ocn.vt.keys) —, and the letter each key prints on the player's own keyboard (the browser's
// Keyboard Map where there is one, else a guess from the site's language). Escape (pause, back to the scene) and Enter (« Partir »)
// stay fixed; the mouse's and a touch screen's gestures are not configurable.
import { t, loadArea, lang } from "../i18n.js";

await loadArea("vplay");

const STORE = "ocn.vt.keys";
export const MAX_KEYS = 2;                                     // keys an action
/** Keys that cannot be bound: fixed by the game (Escape, Enter), or the system's own. */
export const FIXED = new Set(["Escape", "Enter", "NumpadEnter", "MetaLeft", "MetaRight", "OSLeft", "OSRight", "ContextMenu"]);

/** The actions, in the order the « Commandes » page lists them. `also` (keys by their printed character, KeyboardEvent.key) and
 *  `show` (what the lists write) only while the action keeps its default keys: today's « M by its letter » (on an AZERTY keyboard
 *  M's key is « Semicolon », and KeyM prints « , ») and « ? » for the help. */
export const ACTIONS = [
  { id: "faster", group: "run", keys: ["ArrowUp", "KeyW"] },
  { id: "slower", group: "run", keys: ["ArrowDown", "KeyS"] },
  { id: "left", group: "run", keys: ["ArrowLeft", "KeyA"] },
  { id: "right", group: "run", keys: ["ArrowRight", "KeyD"] },
  { id: "stepL", group: "run", keys: ["KeyQ"] },
  { id: "stepR", group: "run", keys: ["KeyE"] },
  { id: "punch", group: "run", keys: ["Space"] },
  { id: "lv0", group: "run", keys: ["Digit0", "Numpad0"] },
  { id: "lv1", group: "run", keys: ["Digit1", "Numpad1"] },
  { id: "lv2", group: "run", keys: ["Digit2", "Numpad2"] },
  { id: "lv3", group: "run", keys: ["Digit3", "Numpad3"] },
  { id: "pos", group: "run", keys: [] },
  { id: "pause", group: "run", keys: [] },
  { id: "map", group: "map", keys: ["KeyM"], also: ["m", "M"], show: ["M"] },
  { id: "mapL", group: "map", keys: ["Comma"] },
  { id: "mapR", group: "map", keys: ["Period"] },
  { id: "oRun", group: "map", keys: ["KeyR"] },
  { id: "oLeg", group: "map", keys: ["KeyT"] },
  { id: "oNorth", group: "map", keys: ["KeyN"] },
  { id: "frame", group: "map", keys: [] },
  { id: "compline", group: "map", keys: ["KeyB"] },
  { id: "views", group: "view", keys: ["Tab"] },
  { id: "sheet", group: "view", keys: ["KeyC"] },
  { id: "person", group: "view", keys: ["KeyV"] },
  { id: "help", group: "view", keys: ["KeyH"], also: ["?"] },
  { id: "full", group: "view", keys: [] },
];
export const GROUPS = ["run", "map", "view"];
const BY_ID = new Map(ACTIONS.map((a) => [a.id, a]));
export const actionOf = (id) => BY_ID.get(id) || null;
const CODE = /^[A-Za-z][A-Za-z0-9]{0,30}$/;

/** The bindings in use: { <action id>: [codes] }, the defaults merged with the kept ones; bad data ignored. A default key another
 *  action now uses is left out of its default. */
export function loadKeys() {
  let kept = null;
  try { kept = JSON.parse(localStorage.getItem(STORE) || "null"); } catch (e) { kept = null; }
  const own = {};
  if (kept && typeof kept === "object" && !Array.isArray(kept)) {
    for (const a of ACTIONS) {
      const v = kept[a.id];
      if (Array.isArray(v) && v.every((c) => typeof c === "string" && CODE.test(c) && !FIXED.has(c))) own[a.id] = [...new Set(v)].slice(0, MAX_KEYS);
    }
  }
  const used = new Set(), out = {};
  for (const a of ACTIONS) if (own[a.id]) { own[a.id] = own[a.id].filter((c) => !used.has(c)); own[a.id].forEach((c) => used.add(c)); }
  for (const a of ACTIONS) out[a.id] = own[a.id] || a.keys.filter((c) => !used.has(c));
  return out;
}

/** Keep the bindings (only those that differ from the defaults are meaningful, all are written). */
export function saveKeys(b) {
  const out = {};
  for (const a of ACTIONS) if (Array.isArray(b?.[a.id])) out[a.id] = b[a.id].slice(0, MAX_KEYS);
  try { localStorage.setItem(STORE, JSON.stringify(out)); return true; } catch (e) { return false; }
}

/** Back to the defaults. */
export function resetKeys() {
  try { localStorage.removeItem(STORE); } catch (e) { /* nothing kept */ }
  return loadKeys();
}

/** Does the action keep its default keys? */
export const isDefault = (b, id) => { const a = BY_ID.get(id), v = b?.[id] || []; return !!a && v.length === a.keys.length && v.every((c, i) => c === a.keys[i]); };

/** Does key event `e` do action `id`? */
export function match(b, id, e) {
  if ((b?.[id] || []).includes(e.code)) return true;
  const a = BY_ID.get(id);
  return !!(a?.also && isDefault(b, id) && a.also.includes(e.key));
}

/** The action a code is bound to (except `but`), or null. */
export function boundTo(b, code, but = null) {
  for (const a of ACTIONS) if (a.id !== but && (b?.[a.id] || []).includes(code)) return a.id;
  return null;
}

// ---- the letters on the player's keyboard --------------------------------------------------------------------------------------
let layout = null;
/** Resolved once the browser's Keyboard Map is read (Chromium; none elsewhere), at most 400 ms. */
export const keysReady = (async () => {
  try {
    const kb = navigator.keyboard;
    if (!kb?.getLayoutMap) return;
    layout = await Promise.race([kb.getLayoutMap(), new Promise((r) => setTimeout(() => r(null), 400))]);
  } catch (e) { layout = null; }
})();

// Without the browser's map, a guess from the site's language: AZERTY in French, QWERTZ in German, QWERTY else
const AZERTY = { KeyQ: "A", KeyA: "Q", KeyW: "Z", KeyZ: "W", KeyM: ",", Semicolon: "M", Comma: ";", Period: ":", Slash: "!", Quote: "Ù", BracketLeft: "^", BracketRight: "$", Backquote: "²" };
const QWERTZ = { KeyY: "Z", KeyZ: "Y", Semicolon: "Ö", Quote: "Ä", BracketLeft: "Ü", BracketRight: "+", Slash: "-", Minus: "ß", Backquote: "^" };
const QWERTY = { Comma: ",", Period: ".", Semicolon: ";", Slash: "/", Quote: "'", BracketLeft: "[", BracketRight: "]", Backslash: "\\", Minus: "-", Equal: "=", Backquote: "`" };
const ARROWS = { ArrowUp: "↑", ArrowDown: "↓", ArrowLeft: "←", ArrowRight: "→" };
const WORDS = { Space: "space", Tab: "tab", ShiftLeft: "shift", ShiftRight: "shift", ControlLeft: "ctrl", ControlRight: "ctrl", AltLeft: "alt", AltRight: "altgr",
  Backspace: "backspace", Delete: "delete", CapsLock: "caps", Insert: "insert", Home: "home", End: "end", PageUp: "pgup", PageDown: "pgdn" };

/** What the key `code` prints (its letter, an arrow, a word from the catalogue); the code itself for anything unknown. */
export function keyLabel(code) {
  if (!code) return "";
  if (ARROWS[code]) return ARROWS[code];
  if (WORDS[code]) return t(`vk.key.${WORDS[code]}`);
  let m = /^Digit(\d)$/.exec(code);
  if (m) return m[1];
  if ((m = /^Numpad(\d)$/.exec(code))) return t("vk.key.numpad", { k: m[1] });
  if (/^F\d{1,2}$/.test(code)) return code;
  const own = layout?.get?.(code);
  if (own && own.trim()) return own.length === 1 ? own.toUpperCase() : own;
  const L = lang(), guess = (L === "fr" ? AZERTY : L === "de" ? QWERTZ : {})[code] ?? QWERTY[code];
  if (guess) return guess;
  if ((m = /^Key([A-Z])$/.exec(code))) return m[1];
  if ((m = /^Numpad(.+)$/.exec(code))) return t("vk.key.numpad", { k: m[1] });
  return code;
}

/** What the lists write for an action's keys: its labels (the `show` of an action keeping its defaults, plus its `also`). */
export function labelsOf(b, id) {
  const a = BY_ID.get(id);
  if (!a) return [];
  if (a.show && isDefault(b, id)) return a.show.slice();
  const out = (b?.[id] || []).map(keyLabel);
  // the characters an action keeping its defaults also answers to (« ? »; a letter's two cases are its key, already written)
  if (a.also && isDefault(b, id)) for (const k of a.also) if (k.toLowerCase() === k.toUpperCase() && !out.includes(k)) out.push(k);
  return out;
}
