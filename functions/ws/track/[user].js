// /ws/track/<user id> — a watch page's live connection to one followed account (docs/track/design.md « Watch pages »),
// handed to that account's LiveTrack object on the live relay (binding LIVE_TRACK). The account itself, a managing parent
// or a watcher it allowed only; the login gate passes the handshake on untouched (_middleware.js).
import { currentUser } from "../../_lib/api.js";
import { canWatch, liveTrack, trackAllowed } from "../../_lib/track.js";

export async function onRequest({ request, env, params }) {
  if (!/^\d{1,9}$/.test(params.user || "")) return new Response("Bad account", { status: 400 });
  if (request.headers.get("Upgrade") !== "websocket") return new Response("WebSocket expected", { status: 426 });
  const me = await currentUser(request, env);
  if (!me) return new Response("Login required", { status: 401 });
  if (!(await trackAllowed(env, me)) || !(await canWatch(env, me, Number(params.user)))) return new Response("Forbidden", { status: 403 });
  const lt = liveTrack(env, Number(params.user));
  if (!lt) return new Response("Live server not bound", { status: 503 });
  return lt.fetch(request);
}
