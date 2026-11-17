// Cartographier's team (« Équipe »): a map is its team's — the owner and the accounts that joined by a link (« mapper » edits,
// « viewer » reads and comments); nobody is looked up by name or e-mail. Saved versions (one every half hour of work, and any
// named one) can be opened and restored; comments pinned on the map, with the field photos, are listed and ticked off.

import * as S from "./store.js";
import { modal, field, sel } from "../tracer/dialogs.js";
import { t, tn, locale } from "./lang.js";

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const when = (s) => (s ? new Date(s).toLocaleString(locale(), { dateStyle: "medium", timeStyle: "short" }) : "");

export async function act(E, act) {
  if (!E.id) { E.say(t("map.why.notSaved"), "bad"); return; }
  if (act === "invite") return invite(E);
  if (act === "members") return members(E);
  if (act === "version-save") return versionSave(E);
  if (act === "versions") return versions(E);
  if (act === "comments") return comments(E);
}
async function invite(E) {
  const v = await modal(E, { title: t("map.team.invite"), ok: t("map.ok.link"), body: field(t("map.team.role"), sel("role", [["mapper", t("map.team.mapper")], ["viewer", t("map.team.viewer")]], "mapper"))
    + field(t("map.team.days"), `<input name="days" type="number" min="1" max="30" value="7">`) + `<p class="mp-hint">${esc(t("map.team.inviteHint"))}</p>` });
  if (!v) return;
  const r = await S.invite(E.id, v.role, Number(v.days) || 7);
  const url = `${location.origin}/#/orga-carto?id=${E.id}&invite=${r.token}`;
  await modal(E, { title: t("map.team.link"), cancel: "", ok: t("map.dlg.close"),
    body: `<p>${esc(t("map.team.linkHint", { role: t(`map.team.${r.role}`), date: when(r.expires) }))}</p><p><input class="mp-link" readonly value="${esc(url)}" onclick="this.select()"></p>`,
    onOpen: (form) => { const i = form.querySelector(".mp-link"); i.select(); navigator.clipboard?.writeText(url).then(() => E.say(t("map.team.copied"))).catch(() => {}); } });
}
async function members(E) {
  const d = await S.card(E.id);
  const inv = await S.invites(E.id).catch(() => ({ invites: [] }));
  const m = d.map, mine = d.role === "owner";
  const v = await modal(E, { title: t("map.team.members"), wide: true, ok: mine ? t("map.dlg.save") : t("map.dlg.close"), cancel: mine ? t("map.dlg.cancel") : "",
    body: `<table class="data"><thead><tr><th>${esc(t("map.team.name"))}</th><th>${esc(t("map.team.role"))}</th></tr></thead><tbody>
      <tr><td>${esc(m.ownerName)}</td><td>${esc(t("map.team.owner"))}</td></tr>
      ${m.team.map((x, i) => `<tr><td>${esc(x.name)}</td><td>${mine ? sel(`r${i}`, [["mapper", t("map.team.mapper")], ["viewer", t("map.team.viewer")], ["", t("map.team.remove")]], x.role) : esc(t(`map.team.${x.role}`))}</td></tr>`).join("")}</tbody></table>
      ${inv.invites?.length ? `<h3>${esc(t("map.team.links"))}</h3><ul class="mp-list">${inv.invites.map((x) => `<li>${esc(t(`map.team.${x.role}`))} · ${esc(t("map.team.until", { date: when(x.expires) }))} <button type="button" class="btn btn-sm" data-revoke="${x.n}">${esc(t("map.team.revoke"))}</button></li>`).join("")}</ul>` : ""}`,
    onOpen: (form) => form.addEventListener("click", async (ev) => { const b = ev.target.closest("[data-revoke]"); if (b) { await S.revoke(E.id, b.dataset.revoke); b.closest("li").remove(); } }) });
  if (!v || !mine) return;
  const team = m.team.map((x, i) => ({ uid: x.uid, role: v[`r${i}`] })).filter((x) => x.role);
  await S.setCard(E.id, { team });
  E.say(t("map.team.saved"));
}
async function versionSave(E) {
  const v = await modal(E, { title: t("map.rib.version-save"), body: field(t("map.team.note"), `<input name="note" maxlength="200" placeholder="${esc(t("map.team.notePh"))}">`) });
  if (!v) return;
  await E.save(true);
  await S.saveVersion(E.id, E.live.toJSON(), v.note || "");
  E.say(t("map.team.versionSaved"));
}
async function versions(E) {
  const { versions: list } = await S.versions(E.id);
  if (!list.length) { E.say(t("map.team.noVersions")); return; }
  const v = await modal(E, { title: t("map.rib.versions"), wide: true, ok: t("map.team.restore"),
    body: `<p class="mp-hint">${esc(t("map.team.versionsHint"))}</p><ul class="mp-list mp-versions">${list.map((x, i) => `<li><label><input type="radio" name="n" value="${x.n}" ${i === 0 ? "checked" : ""}> ${esc(when(x.at))} · ${esc(x.by)}${x.note ? ` — ${esc(x.note)}` : ""}</label></li>`).join("")}</ul>` });
  if (!v?.n) return;
  const doc = await S.loadVersion(E.id, v.n);
  await E.save(true);
  await S.saveVersion(E.id, E.live.toJSON(), t("map.team.beforeRestore"));
  E.onStart("reopen", { id: E.id, doc, version: E.version, restored: true });
}
async function comments(E) {
  const list = await S.comments(E.id).catch(() => []);
  E.comments = list;
  if (!list.length) { E.say(t("map.comment.none")); return; }
  await modal(E, { title: t("map.rib.comments"), wide: true, cancel: "", ok: t("map.dlg.close"),
    body: `<ul class="mp-list mp-comments">${list.map((c, i) => `<li class="${c.done ? "done" : ""}"><div><b>${esc(c.by)}</b> · ${esc(when(c.at))}</div><div>${esc(c.text)}</div>
      ${c.photo ? `<a href="${S.photoUrl(E.id, c.photo)}" target="_blank" rel="noopener"><img src="${S.photoUrl(E.id, c.photo)}" alt="" loading="lazy" class="mp-photo"></a>` : ""}
      <div class="mp-btns"><button type="button" class="btn btn-sm" data-go="${i}">${esc(t("map.comment.go"))}</button><button type="button" class="btn btn-sm" data-done="${i}">${esc(t(c.done ? "map.comment.reopen" : "map.comment.done"))}</button></div></li>`).join("")}</ul>`,
    onOpen: (form) => form.addEventListener("click", async (ev) => {
      const g = ev.target.closest("[data-go]"); if (g) { const c = list[g.dataset.go]; E.view.centreOn(c.x, c.y); form.closest(".tr-modal")?.remove(); return; }
      const d = ev.target.closest("[data-done]"); if (d) { const c = list[d.dataset.done]; c.done = !c.done; await S.saveComments(E.id, list); d.closest("li").classList.toggle("done", c.done); d.textContent = t(c.done ? "map.comment.reopen" : "map.comment.done"); E.view.overlay(); }
    }) });
}
/** One note, opened from its pin on the map (editor.js): who, when, its text and photo; ticked off, taken up again or deleted. */
export async function openComment(E, c) {
  const can = E.role !== "viewer" && !!E.id;
  let del = false;
  const v = await modal(E, { title: t("map.comment.title"), cancel: t("map.dlg.close"), ok: can ? t(c.done ? "map.comment.reopen" : "map.comment.done") : "",
    extra: can ? `<button type="button" class="btn mp-del" data-del>${esc(t("map.comment.delete"))}</button>` : "",
    body: `<div class="mp-note"><div class="mp-hint"><b>${esc(c.by || "")}</b>${c.by ? " · " : ""}${esc(when(c.at))}</div>${c.text ? `<p>${esc(c.text)}</p>` : ""}
      ${c.photo ? `<a href="${S.photoUrl(E.id, c.photo)}" target="_blank" rel="noopener"><img src="${S.photoUrl(E.id, c.photo)}" alt="" class="mp-photo"></a>` : ""}</div>`,
    onOpen: (form) => form.querySelector("[data-del]")?.addEventListener("click", () => { del = true; form.querySelector("[data-x=cancel]").click(); }) });
  if (!can || (!v && !del)) return;
  const list = await S.comments(E.id).catch(() => E.comments || []);
  const i = list.findIndex((x) => x.id === c.id);
  if (i < 0) return;
  if (del) list.splice(i, 1); else list[i].done = !list[i].done;
  E.comments = list;
  await S.saveComments(E.id, list).catch(() => E.say(t("map.comment.later"), "bad"));
  E.view.overlay();
}
/** The comments' pins on the overlay (a flag, grey once done). */
export function drawPins(E, g) {
  const m = E.view.matrix(), dpr = E.view.dpr;
  for (const c of E.comments || []) {
    const x = m.x(c.x, c.y), y = m.y(c.x, c.y);
    g.fillStyle = c.done ? "#9e9e9e" : "#e65100"; g.strokeStyle = "#fff"; g.lineWidth = 1.5 * dpr;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x, y - 18 * dpr); g.lineTo(x + 11 * dpr, y - 13 * dpr); g.lineTo(x, y - 8 * dpr); g.closePath(); g.fill(); g.stroke();
  }
}
