// « Clôturer »: the race is over — what is still open, the results out (the federation's file, IOF XML, MeOS, a page),
// published on Ozimut, the card numbers remembered for next time, the event's file put away.

import { t, tn } from "../../i18n.js";
import { confirmBox, alertBox } from "../../askbox.js";
import { html, raw, icon, download, printHtml } from "./kit.js";
import { exportView } from "../view.js";
import { writeResults } from "../io/iofxml.js";
import { writeOeCsv, latin1, preflight } from "../io/oecsv.js";
import { resultsHtml } from "../print/lists.js";
import { toFile, eventFileName, kvGet, kvSet } from "../store.js";
import { listLabels } from "./prepare.js";
import { problemLine, bindProblems } from "./finish.js";
import { seriesDialog, knockoutPage, hasKnockout, formatLabels } from "./formats.js";
import { groupsOf } from "./follow.js";
import { invoicesDialog } from "./invoices.js";
import { savedItems } from "./designer.js";

const slug = (s) => String(s || "chrono").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\w-]+/g, "-").replace(/^-|-$/g, "").slice(0, 50) || "chrono";

/** The results sent to Ozimut's « Résultats » as the organiser's file (a signed-in page, an event tied to a competition). */
async function publish(ctx) {
  const e = ctx.st().event, xml = writeResults(exportView(ctx.view(), "class"), { status: "Complete" });
  const r = await fetch("/api/upload", { method: "POST", credentials: "same-origin", body: new Blob([xml], { type: "application/xml" }),
    headers: { "X-Upload": encodeURIComponent(JSON.stringify({ race: e.race, filename: `${slug(e.name)}-chrono.xml`, consent: true, organiser: true })) } });
  if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error(j.error || String(r.status)); }
  ctx.log.add("note", { x: { kind: "publish" } }, ctx.by);
}

export const post = {
  ribbon(ctx) {
    const e = ctx.st().event, by = e.type === "relay" ? "class" : ctx.rules().resultsBy, name = slug(e.name), L = () => formatLabels({ ...listLabels(t("chr.lst.results")), teams: t("chr.lst.teams") });
    const groups = () => groupsOf(ctx, by);
    return [{ label: t("chr.cl.files"), items: [
      { icon: "down", label: t("chr.cl.fed", { fed: ctx.rules().federation || "OE" }), primary: true, tip: t("chr.cl.fedTip"), on: () => download(`${name}.csv`, latin1(writeOeCsv(exportView(ctx.view(), by), { lang: ctx.rules().id === "fr" ? "fr" : "en" })), "text/csv") },
      { icon: "down", label: "IOF XML", tip: t("chr.cl.iofTip"), on: () => download(`${name}.xml`, writeResults(exportView(ctx.view(), "class")), "application/xml") },
      { icon: "down", label: "MeOS", tip: t("chr.cl.meosTip"), on: async () => { const m = await import("../io/meosxml.js"); download(`${name}.meosxml`, m.writeMeos(ctx.st(), exportView(ctx.view(), "class")), "application/xml"); } },
      { icon: "file", label: t("chr.cl.page"), tip: t("chr.cl.pageTip"), on: () => download(`${name}.html`, resultsHtml(ctx.view(), groups(), L(), { cat: by === "course", splits: true, final: true }), "text/html") },
      { icon: "print", label: t("chr.lst.results"), on: () => printHtml(resultsHtml(ctx.view(), groups(), L(), { cat: by === "course", final: true })) },
    ] }, { label: t("chr.dsg.mine"), items: savedItems(ctx) }, { label: t("chr.rb.formats"), items: [
      { icon: "list", label: t("chr.ser.short"), tip: t("chr.ser.tip"), on: () => seriesDialog(ctx) },
      ...(hasKnockout(ctx) ? [{ icon: "swap", label: t("chr.ko.page"), tip: t("chr.ko.pageTip"), on: () => printHtml(knockoutPage(ctx, { ...L(), title: t("chr.ko.page") })) }] : []),
      { icon: "coins", label: t("chr.inv.open"), tip: t("chr.inv.openTip"), on: () => invoicesDialog(ctx) },
    ] }, { label: "Ozimut", items: [
      { icon: "up", label: t("chr.cl.publish"), tip: e.race ? t("chr.cl.publishTip") : t("chr.cl.publishNo"), disabled: !ctx.net.signedIn || !e.race || e.type === "relay" || ctx.sandbox(), on: async () => {
        if (!(await confirmBox(t("chr.cl.publishAsk"), { ok: t("chr.cl.publish") }))) return;
        try { await publish(ctx); ctx.toast(t("chr.cl.published"), "ok"); } catch (err) { await alertBox(t("chr.cl.publishFail", { why: err.message })); }
      } },
      { icon: "card", label: t("chr.cl.learn"), tip: t("chr.cl.learnTip"), on: async () => {
        const key = `archive:${ctx.rules().id}`, arch = (await kvGet(key)) || [], by2 = new Map(arch.map((p) => [String(p.lic), p]));
        let n = 0;
        for (const r of ctx.view().byRunner.values()) {
          if (!r.lic || !r.card || !r.read || r.rent) continue;
          const p = by2.get(String(r.lic));
          if (p) { if (Number(p.card) !== Number(r.card)) { p.card = r.card; delete p.k; n++; } }
          else { arch.push({ lic: String(r.lic), family: r.family, given: r.given, club: r.club, clubCode: r.clubCode, card: r.card, sex: r.sex, birth: r.birth, cat: r.cat }); n++; }
        }
        await kvSet(key, arch.map(({ k, ...p }) => p));
        ctx.archive = arch;
        ctx.toast(tn("chr.cl.learnt", n), "ok");
      } },
    ] }, { label: t("chr.net.file"), items: [
      { icon: "file", label: t("chr.net.fileOut"), on: () => download(eventFileName(ctx.log, ctx.ev), toFile(ctx.log, ctx.ev), "application/json") },
    ] }];
  },
  mount(ctx, el) {
    el.innerHTML = html`<div class="chr-close"><div class="chr-card"><h3>${t("chr.cl.state")}</h3><div id="chr-cl-state"></div></div>
      <div class="chr-card"><h3>${t("chr.cl.fedCheck", { fed: ctx.rules().federation || "OE" })}</h3><div id="chr-cl-pre"></div></div>
      <div class="chr-card"><h3>${t("chr.fin.todo")}</h3><ul id="chr-cl-pb" class="chr-pbs"></ul></div></div>`.toString();
    function draw() {
      const v = ctx.view(), c = v.counts, st = ctx.st(), R = Object.values(st.runners);
      const rent = R.filter((r) => r.rent === 1).length, due = R.filter((r) => r.fee > 0 && !r.paid && r.status !== "dns").length;
      const line = (ok, text) => html`<li class="${ok ? "ok" : "bad"}">${icon(ok ? "check" : "alert", 16)} <span>${text}</span></li>`;
      el.querySelector("#chr-cl-state").innerHTML = html`<ul class="chr-chk">
        ${line(!c.out, c.out ? tn("chr.cl.out", c.out) : t("chr.cl.allIn"))}${line(!c.wait, c.wait ? tn("chr.cl.wait", c.wait) : t("chr.cl.noWait"))}
        ${line(!c.loose, c.loose ? tn("chr.cl.loose", c.loose) : t("chr.cl.noLoose"))}${line(!rent, rent ? tn("chr.cl.rent", rent) : t("chr.cl.noRent"))}${line(!due, due ? tn("chr.cl.due", due) : t("chr.cl.noDue"))}</ul>
        <p class="chr-dim">${t("chr.cl.sum", { ok: c.ok, mp: c.mp, dnf: c.dnf, dns: c.dns, dsq: c.dsq, ot: c.ot })}</p>
        ${c.wait ? html`<p><button type="button" class="btn" id="chr-cl-dns">${t("chr.cl.markDns")}</button></p>` : ""}`.toString();
      el.querySelector("#chr-cl-dns")?.addEventListener("click", async () => {
        const rows = [...v.byRunner.values()].filter((r) => r.status === "wait" || r.status === "run").map((r) => ["runners", r.id, { status: "dns" }]);
        if (rows.length && await confirmBox(tn("chr.cl.markDnsAsk", rows.length), { ok: t("chr.cl.markDns") })) ctx.log.add("many", { rows }, ctx.by);
      });
      const pf = preflight(v, { licence: ctx.rules().licence, needLic: ctx.rules().id === "fr" }), kinds = {};
      for (const p of pf) (kinds[p.kind] ||= []).push(p);
      el.querySelector("#chr-cl-pre").innerHTML = Object.keys(kinds).length ? html`<ul class="chr-chk">${Object.entries(kinds).map(([k, list]) => html`<li class="${list[0].level === "stop" ? "bad" : "warn"}">${icon("alert", 16)} <span>${tn(`chr.pre.${k}`, list[0].n ?? list.length)}</span>
        ${list[0].runner ? html`<i class="chr-dim">${list.slice(0, 6).map((p) => { const r = v.byRunner.get(p.runner); return r ? `${r.given} ${r.family}` : ""; }).join(", ")}${list.length > 6 ? "…" : ""}</i>` : ""}</li>`)}</ul>`.toString()
        : html`<p class="chr-okc">${icon("check", 16)} ${t("chr.pre.fine")}</p>`.toString();
      const pb = ctx.problems();
      el.querySelector("#chr-cl-pb").innerHTML = pb.length ? pb.slice(0, 60).map((p) => problemLine(ctx, p)).join("") : html`<li class="chr-pb none">${icon("check", 16)}<span>${t("chr.fin.nothing")}</span></li>`.toString();
      bindProblems(ctx, el);
    }
    draw();
    return { update: draw };
  },
};
