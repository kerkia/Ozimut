// GET /api/account/status -> { registration, world, track, turnstile } so the login page knows whether to offer sign-up:
// world — registration without France (WORLD_OPEN, until the site's access follows the countries); turnstile — the site key
// of the registration form's widget, null when the check is off (_lib/turnstile.js).
import { json } from "../../_lib/api.js";
import { turnstileOn } from "../../_lib/turnstile.js";
import { billingMode } from "../../_lib/plans.js";

export const onRequestGet = ({ env }) => json({
  registration: env.REGISTRATION_OPEN === "1" && !!env.DB, world: env.WORLD_OPEN === "1",
  // the GPS tracking open to every account (TRACK_OPEN): the form then asks the year of birth (nobody under 15 alone)
  track: env.TRACK_OPEN === "1",
  turnstile: turnstileOn(env) ? env.TURNSTILE_SITE_KEY : null,
  // (docs/billing/design.md §1: said only once the switch is « live »)
  ...(billingMode(env) === "live" ? { billing: true } : {}),
});
