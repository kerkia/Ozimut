// A club as a group on a document's team (docs/clubs/design.md §1, owner 2026-11-22): « les organisateurs du club » on a course
// setting of the Tracer, « les cartographes du club » on a map of Cartographier. The team dialogs of both tools draw this block
// (the clubs the account belongs to, each a tick box) and send the boxes ticked as `orgGroups`; the servers resolve the groups at
// read time (functions/_lib/orgs.js inGroups): a member holding the club's role gets the tool's editing role.

import { esc } from "./util.js";
import { loadArea, t } from "./i18n.js";

/** The account's clubs (members in force), or [] (before migration 0030, offline). */
async function myOrgs() {
  try {
    const r = await fetch("api/orgs", { credentials: "same-origin", cache: "no-store" });
    if (!r.ok) return [];
    return ((await r.json()).orgs || []).filter((o) => o.rights?.member);
  } catch (e) { return []; }
}

/**
 * The block's HTML: one box a club the account belongs to, and a line for each group already on the team of a club it does not
 * belong to (kept as it is). `role`: "organiser" (the Tracer) or "mapper" (Cartographier). Empty when there is nothing to show.
 */
export async function groupsBlock(current = [], role = "organiser") {
  await loadArea("club").catch(() => {});
  const orgs = await myOrgs();
  const cur = (Array.isArray(current) ? current : []).filter((g) => g.role === role);
  const others = cur.filter((g) => !orgs.some((o) => o.id === Number(g.org)));
  if (!orgs.length && !others.length) return "";
  const label = (name) => t(role === "mapper" ? "mc.grp.mappers" : "mc.grp.organisers", { club: name });
  return `<div class="mc-groups" data-role="${esc(role)}"><h3>${esc(t("mc.grp.title"))}</h3>
    <p><small>${esc(t(role === "mapper" ? "mc.grp.hint.mapper" : "mc.grp.hint.organiser"))}</small></p>
    ${orgs.map((o) => `<label class="tr-check"><input type="checkbox" data-org-group="${o.id}" ${cur.some((g) => Number(g.org) === o.id) ? "checked" : ""}> ${esc(label(o.name))}</label>`).join("")}
    ${others.map((g) => `<label class="tr-check"><input type="checkbox" data-org-group="${Number(g.org)}" checked> ${esc(label(g.name || `#${g.org}`))}</label>`).join("")}</div>`;
}

/** The groups ticked in a form holding the block: [{ org, role }], or undefined when the block is not there. */
export function readGroups(form) {
  const box = form?.querySelector?.(".mc-groups");
  if (!box) return undefined;
  const role = box.dataset.role || "organiser";
  return [...box.querySelectorAll("[data-org-group]")].filter((c) => c.checked).map((c) => ({ org: Number(c.dataset.orgGroup), role }));
}
