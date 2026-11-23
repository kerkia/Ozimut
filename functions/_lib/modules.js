// The modules an account sees (owner, 2026-11-12; migration 0027). Arena, Stats, Coach and Pixel are the consumers' modules, shown
// unless the account hid one in Réglages (users.hidden_modules); Orga and Carto are the creators', shown only to the accounts
// that use them (users.orga, users.carto). Hiding never blocks: every module's addresses still open (site app.js).
// A creator's module is never hidden automatically, but it shows by itself:
//   - from the account's existing work, looked at once (users.modules_checked): an event's team, a booking opened, a map
//     analysis or a Tracer event it owns or belongs to → Orga; a map of Cartographier → Carto;
//   - from new work as it is made (`showModule`): an event created or joined, a Tracer or Cartographier invitation accepted,
//     a map analysis opened, an organiser's deposit, a broadcast, a competition declared…

export const CONSUMER = ["arena", "stats", "coach", "pixel"];
export const CREATOR = { orga: "orga", carto: "carto" };       // module → users column

/** The consumers' modules an account hid (users.hidden_modules). */
export const hiddenOf = (u) => String(u?.hidden_modules || "").split(",").filter((m) => CONSUMER.includes(m));

/** Turn a creator's module on for an account (never off). Quiet: before migration 0016/0027, or on any failure, nothing. */
export async function showModule(env, uid, mod) {
  const col = CREATOR[mod];
  if (!col || !uid || !env.DB) return;
  try { await env.DB.prepare(`UPDATE users SET ${col} = 1 WHERE id = ? AND ${col} = 0`).bind(uid).run(); } catch (e) { /* no column yet */ }
}

/** Every object of an R2 prefix, with its custom metadata. */
async function listAll(env, prefix) {
  const out = [];
  let cursor;
  do {
    const r = await env.BUCKET.list({ prefix, cursor, include: ["customMetadata"], limit: 1000 });
    out.push(...r.objects);
    cursor = r.truncated ? r.cursor : undefined;
  } while (cursor);
  return out;
}
const inTeam = (m, uid) => String(m?.owner) === String(uid) || String(m?.uids || "").split(",").includes(String(uid));

/** What the account already manages: { orga, carto } true where it has work there. */
async function existingWork(env, uid) {
  const has = { orga: false, carto: false };
  const one = async (sql) => { try { return !!(await env.DB.prepare(sql).bind(uid).first()); } catch (e) { return false; } };
  has.orga = (await one("SELECT 1 FROM event_members WHERE user_id = ? LIMIT 1"))
    || (await one("SELECT 1 FROM entry_forms WHERE created_by = ? LIMIT 1"))
    || (await one("SELECT 1 FROM org_members WHERE user_id = ? AND state = 'ok' AND (roles LIKE '%manager%' OR roles LIKE '%organiser%' OR roles LIKE '%treasurer%') LIMIT 1"));
  has.carto = await one("SELECT 1 FROM org_members WHERE user_id = ? AND state = 'ok' AND roles LIKE '%mapper%' LIMIT 1");
  if (env.BUCKET) {
    try {
      if (!has.orga) has.orga = (await listAll(env, "analyses-meta/")).some((o) => String(o.customMetadata?.owner) === String(uid));
      if (!has.orga) has.orga = (await listAll(env, "tracer-meta/")).some((o) => inTeam(o.customMetadata, uid));
      if (!has.carto) has.carto = (await listAll(env, "mapper-meta/")).some((o) => inTeam(o.customMetadata, uid));
    } catch (e) { /* R2 unreachable: looked at again next time */ return null; }
  }
  return has;
}

/**
 * Once per account (users.modules_checked 0): its existing work turns its creators' modules on. Returns the account's row,
 * read again when something changed. Before migration 0027 (no column), nothing.
 */
export async function autoShow(env, user) {
  if (!user || user.modules_checked !== 0 || user.demo_until) return user;
  const has = await existingWork(env, user.id);
  if (!has) return user;
  const sets = ["modules_checked = 1"];
  if (has.orga && user.orga !== 1) sets.push("orga = 1");
  if (has.carto && user.carto !== 1) sets.push("carto = 1");
  try {
    await env.DB.prepare(`UPDATE users SET ${sets.join(", ")} WHERE id = ?`).bind(user.id).run();
    return (await env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(user.id).first()) || user;
  } catch (e) { return user; }
}
