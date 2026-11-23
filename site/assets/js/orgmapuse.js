// « Une carte du club » in the tools (docs/clubs/design.md §2): the Tracer's « Nouvel événement », the map analysis's circuits and
// Pixel's « Nouvel événement » offer, beside sending a file, the maps of the account's clubs it may use there — its right to
// organise or to map, and the map's use written down (tracer, analyses, pixel; functions/api/orgmaps `usable`). A map chosen is
// fetched (GET …/file/<name>?use=<tool>) and handed to the tool as if its files had been dropped, with its source { org, map,
// version, name, lent, files } for the tool to record (the event's meta, the analysis's circuit, the Pixel event). A map lent
// (the account may not download it) is said so: the Tracer then neither prints nor exports it. A map linked to a Cartographier
// document (`carto`) has no stored file: the document is written as an OCAD file here (`cartoFile`, mapper/ocadout.js), as it
// is the day the tool takes it.

import { html, $, fmt } from "./util.js";
import { t, loadArea } from "./i18n.js";

const cache = new Map();
/** The maps the account may use in a tool (read once a minute). */
export async function usable(tool) {
  const c = cache.get(tool);
  if (c && Date.now() - c.at < 60e3) return c.maps;
  let maps = [];
  try {
    const r = await fetch(`api/orgmaps/usable?use=${encodeURIComponent(tool)}`, { credentials: "same-origin", cache: "no-store" });
    maps = r.ok ? (await r.json()).maps || [] : [];
  } catch (e) { maps = []; }
  cache.set(tool, { at: Date.now(), maps });
  return maps;
}
async function gunzip(buf) {
  const a = new Uint8Array(buf);
  if (!(a[0] === 0x1f && a[1] === 0x8b)) return new TextDecoder().decode(a);
  return await new Response(new Blob([a]).stream().pipeThrough(new DecompressionStream("gzip"))).text();
}
/**
 * A club map linked to a Cartographier document, written as an OCAD file in the browser, as Cartographier's own « Envoyer au
 * tracé » writes it (mapper/ocadout.js: the OCAD file it came from carried through, else OCAD 2018). `org`, `id` the club map;
 * `tool` the use asked (tracer | analyses | pixel), none for a download or the card's pictures. -> File « <name>.ocd ».
 */
export async function cartoFile(org, id, name, tool = "") {
  const b = `api/orgmaps/${org}/maps/${id}/carto`, q = tool ? `?use=${encodeURIComponent(tool)}` : "";
  const get = (w) => fetch(`${b}/${w}${q}`, { credentials: "same-origin", cache: "no-store" });
  const [d, s] = await Promise.all([get("doc"), get("source")]);
  if (!d.ok) throw Object.assign(new Error("orgmap"), { code: d.status === 404 ? "carto_gone" : "orgmap" });
  const doc = JSON.parse(await gunzip(await d.arrayBuffer()));
  const source = s.ok ? new Uint8Array(await s.arrayBuffer()) : null;
  const { writeOcadDoc } = await import("./mapper/ocadout.js");
  const bytes = writeOcadDoc(doc, source, { version: source && doc.ocad?.version >= 9 ? doc.ocad.version : 2018 });
  const base = String(name || "map").replace(/[\u0000-\u001f"<>|*?:\\/]+/g, "_").trim().slice(0, 100) || "map";
  return new File([bytes], `${base}.ocd`, { type: "application/x-ocad" });
}

/** A map's files fetched for the tool, as Files. `only`: a test on the file's name (Pixel: its OCAD file). */
export async function filesOf(m, tool, only = null) {
  if (m.carto) return [await cartoFile(m.org, m.id, m.name, tool)];
  const out = [];
  for (const f of m.files) {
    if (only && !only(f.name)) continue;
    const r = await fetch(`api/orgmaps/${m.org}/maps/${m.id}/file/${encodeURIComponent(f.name)}?use=${encodeURIComponent(tool)}&v=${m.version}`,
      { credentials: "same-origin", cache: "no-store" });
    if (!r.ok) throw Object.assign(new Error("orgmap"), { code: "orgmap" });
    out.push(new File([await r.blob()], f.name, { type: f.type && f.type !== "application/octet-stream" ? f.type : "" }));
  }
  return out;
}

/**
 * The picker drawn into `box` (hidden while the account has no club map for this tool): a menu of the maps, « Prendre cette carte »,
 * a line about the map lent. onFiles(files, src) receives the files and the source. `only`: the files to take (and the maps
 * that hold one).
 */
export async function bindPicker(box, tool, onFiles, { only = null } = {}) {
  if (!box) return;
  await loadArea("orgmaps").catch(() => {});
  const maps = (await usable(tool)).filter((m) => !only || m.files.some((f) => only(f.name)));
  if (!maps.length || !box.isConnected) { box.hidden = true; return; }
  const label = (m) => [m.orgName, m.name, m.scale ? `1:${fmt(m.scale)}` : "", m.carto ? t("om.carto.tag") : "", m.lent ? t("om.pick.lentTag") : ""].filter(Boolean).join(" · ");
  box.hidden = false;
  box.innerHTML = html`<div class="om-pick-row"><span class="om-pick-l">${t("om.pick.label")}</span>
    <select class="om-pick-sel">${maps.map((m, i) => html`<option value="${i}">${label(m)}</option>`)}</select>
    <button type="button" class="btn btn-sm om-pick-go">${t("om.pick.take")}</button></div>
    <p class="muted om-pick-msg">${t("om.pick.hint")}</p>`;
  const msg = $(".om-pick-msg", box);
  $(".om-pick-go", box).addEventListener("click", async (e) => {
    const m = maps[Number($(".om-pick-sel", box).value)];
    if (!m) return;
    e.target.disabled = true;
    msg.textContent = t("om.pick.loading", { name: m.name });
    try {
      const files = await filesOf(m, tool, only);
      const src = { org: m.org, map: m.id, version: m.version, name: m.name, lent: !!m.lent, files: files.map((f) => f.name) };
      msg.textContent = m.lent ? t("om.pick.lent", { name: m.name }) : t("om.pick.taken", { name: m.name });
      await onFiles(files, src);
    } catch (err) { msg.textContent = t(err?.code === "carto_gone" ? "om.pick.cartoGone" : "om.pick.err"); }
    e.target.disabled = false;
  });
}
/** The source as the server keeps it (without what the browser needs only). */
export const sourceOf = (src) => (src ? { org: src.org, map: src.map, version: src.version } : null);
