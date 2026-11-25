// GET /api/account/me -> the logged-in user (also tells the browser the server still accepts the session).
import { json, publicUser, withUser } from "../../_lib/api.js";
import { memberships } from "../../_lib/countries.js";
import { autoShow } from "../../_lib/modules.js";
import { syncFederation } from "../../_lib/orgs.js";
import { entCaps } from "../../_lib/plans.js";

// the account's existing work shows its creators' modules, looked at once (_lib/modules.js autoShow)
// and, once a Paris day, its club in France from its licence (_lib/orgs.js syncFederation: at once when already done today)
export const onRequestGet = withUser(async ({ env, request }, user) => {
  await syncFederation(env, request, user);
  const u = await autoShow(env, user);
  // its entitlements (_lib/plans.js: `ent` always; `billing`, `plan`, `trial` only when billing is on for the account)
  return json({ ...publicUser(env, u, await memberships(env, u.id)), ...(await entCaps(env, u, { request })) });
});
