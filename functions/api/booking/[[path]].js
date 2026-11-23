// /api/booking — the start-time booking of 2026-11-03 (migration 0023) became the entries' start times (owner, 2026-11-22;
// docs/clubs/design.md §3, api/entries). Every route answers 410 { error: "moved" }; a competition's address names the event
// holding it, whose entry form (#/inscription?ev=<event>) takes the start times now.

import { json } from "../../_lib/api.js";

export const onRequest = async ({ request, env, params }) => {
  const parts = [].concat(params.path || []).map(String);
  let event = null;
  if (request.method === "GET" && /^[ad][a-z0-9]{1,20}$/.test(parts[0] || "") && env.DB) {
    try { event = (await env.DB.prepare("SELECT id FROM events WHERE race_key = ? AND status = 'active'").bind(parts[0]).first())?.id || null; }
    catch (e) { /* before migration 0026 */ }
  }
  return json({ error: "moved", ...(event ? { event, url: `#/inscription?ev=${event}` } : {}) }, 410);
};
