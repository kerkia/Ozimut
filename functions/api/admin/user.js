// POST /api/admin/user { id, action: "disable" | "enable" | "delete" }
//                      { id, action: "right", right: "alerts", on: bool }
//                      { id, action: "nutrition", value: "" | "reader" | "author" }   « Nutrition » (migration 0017)
// A disabled account is refused at its next hourly check at the latest (see _middleware.js).
// Right: "alerts" allows the agenda e-mail alerts. (« En direct » had its own right until 2026-10-15, and "analyst" showed
// the analysis methods until 2026-10-19, when they went; the D1 columns users.live and users.analyst are no longer read.)
const RIGHTS = { alerts: "alerts_allowed" };
import { json, readBody, withUser } from "../../_lib/api.js";

export const onRequestPost = withUser(async ({ request, env }, admin) => {
  const b = await readBody(request);
  const id = Number(b?.id);
  if (!Number.isInteger(id) || !["disable", "enable", "delete", "right", "nutrition"].includes(b?.action)) return json({ error: "bad request" }, 400);
  if (b.action === "nutrition") {
    if (!["", "reader", "author"].includes(b.value)) return json({ error: "bad request" }, 400);
    const r = await env.DB.prepare("UPDATE users SET nutrition = ? WHERE id = ?").bind(b.value, id).run();
    return r.meta.changes ? json({ ok: true }) : json({ error: "not found" }, 404);
  }
  if (b.action === "right") {
    if (!RIGHTS[b.right] || typeof b.on !== "boolean") return json({ error: "bad request" }, 400);
    const r = await env.DB.prepare(`UPDATE users SET ${RIGHTS[b.right]} = ? WHERE id = ?`).bind(b.on ? 1 : 0, id).run();
    return r.meta.changes ? json({ ok: true }) : json({ error: "not found" }, 404);
  }
  if (id === admin.id && b.action !== "enable") return json({ error: "self" }, 400);        // never lock oneself out
  const target = await env.DB.prepare("SELECT id, email FROM users WHERE id = ?").bind(id).first();
  if (!target) return json({ error: "not found" }, 404);
  if (b.action === "delete") {
    if (env.BUCKET) await env.BUCKET.delete(`licencecheck/${id}.json`).catch(() => {});   // a word for a licence check
    // « Nutrition »'s articles stay, under the name they were published with
    try { await env.DB.prepare("UPDATE nut_posts SET author_id = NULL WHERE author_id = ?").bind(id).run(); } catch (e) {}
    try { await env.DB.prepare("DELETE FROM nut_likes WHERE user_id = ?").bind(id).run(); } catch (e) {}
    await env.DB.batch([
      env.DB.prepare("DELETE FROM notified WHERE user_id = ?").bind(id),
      env.DB.prepare("DELETE FROM user_countries WHERE user_id = ?").bind(id),
      env.DB.prepare("DELETE FROM tokens WHERE user_id = ?").bind(id),
      env.DB.prepare("DELETE FROM usage_daily WHERE user_id = ?").bind(id),
      env.DB.prepare("DELETE FROM mail_queue WHERE to_email = ?").bind(target.email),
      env.DB.prepare("DELETE FROM users WHERE id = ?").bind(id),
    ]);
  } else {
    await env.DB.prepare("UPDATE users SET status = ? WHERE id = ?").bind(b.action === "disable" ? "disabled" : "active", id).run();
  }
  return json({ ok: true });
}, { admin: true });
