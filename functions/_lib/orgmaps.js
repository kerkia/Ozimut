// The club's map library (docs/clubs/design.md §2, migration 0030: org_maps, org_map_versions): who may do what with a club's
// map, its storage keys, its quota, and the uses the tools record. Shared by /api/orgmaps and the tools that take a club map —
// the Tracer (api/tracer), the map analyses (api/analyses) and Pixel's events (api/virtual/events).
//
// R2 (cn-state):
//   orgmaps/<org>/<map>/v<version>/<file>   the files of a version, byte for byte (OCAD, Mapper, PDF, an image and its world
//                                           file and .prj, a KMZ)
//   orgmaps/<org>/<map>/view                its viewing copy (2 560 px at most, WebP or JPEG, made by the browser as « Mes cartes »)
//   orgmaps/<org>/<map>/thumb               its thumbnail (480 px)
//   orgmaps/<org>/<map>/uses.json           the events using it: [{ tool, ref, title, version, by, name, at }]
// Club maps never enter the administrators' collection (_lib/maplib.js): the tools that keep a copy mark it (the Tracer's
// mapPrivate, an analysis circuit's orgMap, a Pixel event's orgMap).
//
// The rights (the contract's table): manager everything; mapper see, download, edit, new version, and set the rights, embargo and
// access of the maps it added; organiser see the viewing copy and use the map for an event (lent: no download); member the list
// and the thumbnail. `access` overrides per map the levels of organisers and members ({ organiser, member }: one of LEVELS).
// An embargo (embargo_until, a day still to come) leaves to those who may not edit only the map's name and its end day, but the
// teams of the events in embargo_ok may use it. Rights written down (`rights`: tracer, analyses, pixel, thumb — each
// { by, name, at }): a tool takes a club map only when its use is written down; `thumb` serves the thumbnail to every account.

import { isAdmin, nowIso, parisToday } from "./api.js";
import { rolesOf, rightsOf } from "./orgs.js";
import { bytesOf, capOf } from "./plans.js";

export const PFX = "orgmaps/";
export const key = (org, map, rest) => `${PFX}${org}/${map}/${rest}`;
export const fileKey = (org, map, v, name) => key(org, map, `v${v}/${name}`);
/** The levels a role may get: each includes the ones before it. */
export const LEVELS = ["list", "thumb", "view", "use", "download"];
export const USES = ["tracer", "analyses", "pixel"];
export const WRITTEN = ["tracer", "analyses", "pixel", "thumb"];
export const STATES = ["current", "revising", "outdated"];
/** A club's quota (every version's files; the viewing copies and thumbnails are Ozimut's), in bytes: 3 GB, env ORGMAPS_QUOTA_MB. */
export const quota = (env) => Math.max(1, Number(env.ORGMAPS_QUOTA_MB) || 3072) * 1024 * 1024;
/** The org's own quota in bytes (null: none): the capability « orgmapsMB » of its plan (_lib/plans.js; ORGMAPS_QUOTA_MB stands
 *  for the free value when set). */
export async function orgQuota(env, orgId) {
  try { return await bytesOf(env, "orgmapsMB", await capOf(env, null, "orgmapsMB", { org: orgId }), env.ORGMAPS_QUOTA_MB); }
  catch (e) { return quota(env); }
}

export const parse = (s, d) => { try { const v = JSON.parse(s || ""); return v ?? d; } catch (e) { return d; } };
const at = (lvl, l) => LEVELS.indexOf(lvl) >= LEVELS.indexOf(l);

/** Is the map under embargo today (its end day still to come)? */
export const embargoed = (m) => !!m.embargo_until && m.embargo_until >= parisToday();

/**
 * What the account may do with a map: { list, thumb, view, use, download, edit, govern, member, embargoed, viaEvent }.
 * `R` the account's rights in the map's org (_lib/orgs.js rightsOf), else read here. A use also needs the use written down
 * (`mayUse`).
 */
export async function accessOf(env, user, m, R = null) {
  const admin = user && isAdmin(env, user);
  if (!R) R = user ? rightsOf(await rolesOf(env, user.id, m.org_id).catch(() => null)) : {};
  const acc = parse(m.access, {});
  const out = { list: false, thumb: false, view: false, use: false, download: false, edit: false, govern: false, member: !!R.member, embargoed: embargoed(m), viaEvent: false };
  const rights = parse(m.rights, {});
  if (admin || R.manage) Object.assign(out, { list: true, thumb: true, view: true, use: true, download: true, edit: true, govern: true });
  else if (R.map) Object.assign(out, { list: true, thumb: true, view: true, use: true, download: true, edit: true, govern: Number(m.created_by) === Number(user?.id) });
  else {
    let lvl = null;
    if (R.organise) lvl = LEVELS.includes(acc.organiser) ? acc.organiser : "use";
    else if (R.member) lvl = LEVELS.includes(acc.member) ? acc.member : "thumb";
    if (lvl) for (const l of LEVELS) out[l] = at(lvl, l);
    if (rights.thumb && user) out.thumb = true;                        // a public thumbnail: every account
    if (out.embargoed) {
      // members see that it exists and its end day; the teams of the events allowed meanwhile may use it
      Object.assign(out, { thumb: false, view: false, use: false, download: false });
      const ok = parse(m.embargo_ok, []);
      if (user && ok.length) {
        const ids = ok.map(String).slice(0, 50);
        const r = await env.DB.prepare(`SELECT 1 FROM event_members WHERE user_id = ? AND event_id IN (${ids.map(() => "?").join(",")}) LIMIT 1`)
          .bind(user.id, ...ids).first().catch(() => null);
        if (r) Object.assign(out, { list: true, thumb: true, view: true, use: true, viaEvent: true });
      }
    }
  }
  return out;
}
/** May the account use the map in a tool (tracer | analyses | pixel)? Its access, and that use written down. */
export function mayUse(A, m, tool) {
  return !!A.use && USES.includes(tool) && !!parse(m.rights, {})[tool];
}

/** The map row, or null (removed ones too with `all`). */
export async function mapRow(env, id, { all = false } = {}) {
  if (!Number.isInteger(Number(id)) || Number(id) <= 0) return null;
  const m = await env.DB.prepare("SELECT * FROM org_maps WHERE id = ?").bind(Number(id)).first();
  return m && (all || m.status === "active") ? m : null;
}

/** What a club's library holds, in bytes: every version's files of its active maps. */
export async function used(env, orgId) {
  const { results } = await env.DB.prepare(`SELECT v.files FROM org_map_versions v JOIN org_maps m ON m.id = v.map_id
    WHERE m.org_id = ? AND m.status = 'active'`).bind(Number(orgId)).all();
  let n = 0;
  for (const r of results) for (const f of parse(r.files, [])) n += Number(f.size) || 0;
  return n;
}

/**
 * A tool's source checked (`{ org, map, version }` sent by the browser): the map exists in that org, the account may use it in
 * that tool. -> { ok: true, src: { org, map, version, name }, lent: !download } or { ok: false, error }.
 */
export async function checkSource(env, user, src, tool) {
  const org = Number(src?.org), id = Number(src?.map);
  const m = await mapRow(env, id);
  if (!m || m.org_id !== org) return { ok: false, error: "orgmap" };
  const A = await accessOf(env, user, m);
  if (!mayUse(A, m, tool)) return { ok: false, error: "orgmap" };
  const v = Number(src.version) > 0 && Number(src.version) <= m.version ? Math.round(Number(src.version)) : m.version;
  return { ok: true, src: { org, map: id, version: v, name: String(m.name).slice(0, 120) }, lent: !A.download };
}
/** May the account download the map's files (a tool's lent flag: those who may not)? */
export async function mayDownload(env, user, src) {
  const m = await mapRow(env, src?.map);
  return !!m && (await accessOf(env, user, m)).download;
}

/** A use recorded on the map (the events using it, shown on its page): the same tool and reference once, the latest 200. */
export async function recordUse(env, src, { tool, ref, title }, user) {
  if (!env.BUCKET || !src?.org || !src?.map) return;
  try {
    const k = key(src.org, src.map, "uses.json");
    const o = await env.BUCKET.get(k);
    const list = o ? await o.json().catch(() => []) : [];
    const clean = (s, n) => String(s ?? "").replace(/[\u0000-\u001f<>]/g, " ").trim().slice(0, n);
    const next = (Array.isArray(list) ? list : []).filter((x) => !(x.tool === tool && x.ref === String(ref)));
    next.push({ tool, ref: clean(ref, 40), title: clean(title, 140), version: Number(src.version) || 1, by: user?.id || null,
      name: clean(user?.display_name || `${user?.first_name || ""} ${user?.last_name || ""}`, 80), at: nowIso() });
    await env.BUCKET.put(k, JSON.stringify(next.slice(-200)), { httpMetadata: { contentType: "application/json" } });
  } catch (e) { /* a use not recorded is no failure of the tool */ }
}
/** The map's uses. */
export async function usesOf(env, m) {
  try { const o = await env.BUCKET.get(key(m.org_id, m.id, "uses.json")); const l = o ? await o.json() : []; return Array.isArray(l) ? l : []; }
  catch (e) { return []; }
}
