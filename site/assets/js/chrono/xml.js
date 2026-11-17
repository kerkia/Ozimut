// A small XML reader and writer for Chrono's formats (IOF XML, MeOS's files, MOP): no DOMParser, so that the same code runs
// in a page, in a worker and under Node. Prefixes are dropped (« iof:Person » is « Person »). Enough for data files; it is
// not a validating parser.

const ENT = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
const unent = (s) => (s.includes("&") ? s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => (e[0] !== "#" ? ENT[e] ?? m
  : String.fromCodePoint(e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : Number(e.slice(1))))) : s);

/** The root element as { name, attrs, text, kids }, or null. */
export function parseXml(s) {
  const top = { name: "", attrs: {}, text: "", kids: [] }, stack = [top];
  const re = /<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<!\[CDATA\[([\s\S]*?)\]\]>|<![^>]*>|<(\/?)([^\s>/]+)([^>]*?)(\/?)>|([^<]+)/g;
  for (const x of String(s).matchAll(re)) {
    const cur = stack[stack.length - 1];
    if (x[1] != null) cur.text += x[1];
    else if (x[6] != null) { if (stack.length > 1) cur.text += unent(x[6]); }
    else if (x[3]) {
      const name = x[3].replace(/^.*:/, "");
      if (x[2]) {
        const at = stack.map((e) => e.name).lastIndexOf(name);
        if (at > 0) stack.length = at;
        continue;
      }
      const el = { name, attrs: {}, text: "", kids: [] };
      for (const a of x[4].matchAll(/([^\s=]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) el.attrs[a[1].replace(/^.*:/, "")] = unent(a[2] ?? a[3]);
      cur.kids.push(el);
      if (!x[5]) stack.push(el);
    }
  }
  return top.kids[0] || null;
}

/** Bytes as text: UTF-8 unless the declaration (or the absence of valid UTF-8) says a Latin encoding. */
export function decodeText(bytes) {
  if (typeof bytes === "string") return bytes;
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const head = String.fromCharCode(...b.subarray(0, 200)).toLowerCase();
  const latin = () => { let s = ""; for (let i = 0; i < b.length; i += 8192) s += new TextDecoder("windows-1252").decode(b.subarray(i, i + 8192)); return s; };
  if (/encoding\s*=\s*["'](iso-8859-1|latin-?1|windows-1252|cp1252)/.test(head)) return latin();
  try { return new TextDecoder("utf-8", { fatal: true }).decode(b); } catch (e) { return latin(); }
}

export const kid = (el, name) => el?.kids.find((k) => k.name === name) || null;
export const kids = (el, name) => (el ? el.kids.filter((k) => k.name === name) : []);
/** The trimmed text of a child (or of a path of children), "" when absent. */
export function txt(el, ...path) {
  let e = el;
  for (const p of path) e = kid(e, p);
  return e ? e.text.trim() : "";
}

export const esc = (v) => (v == null ? "" : String(v).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])));
/** `x("Name", { id: 1 }, "text" | [children strings])`: one element as text; null and undefined children are left out. */
export function x(name, attrs, body) {
  if (attrs != null && (typeof attrs !== "object" || Array.isArray(attrs))) { body = attrs; attrs = null; }
  const a = attrs ? Object.entries(attrs).filter(([, v]) => v != null).map(([k, v]) => ` ${k}="${esc(v)}"`).join("") : "";
  if (body == null || body === "") return `<${name}${a}/>`;
  const inner = Array.isArray(body) ? body.filter((c) => c != null && c !== "").join("") : esc(body);
  return inner === "" ? `<${name}${a}/>` : `<${name}${a}>${inner}</${name}>`;
}
export const XML_HEAD = '<?xml version="1.0" encoding="UTF-8"?>\n';
