// « Accueil » and « Départ »: the two posts that meet the runners before the race. The desk finds or makes an entry, takes
// a card's number from the reader, the fee, the rented cards; the start calls the minutes and ticks who is there.

import { t, tn } from "../../i18n.js";
import { confirmBox } from "../../askbox.js";
import { html, raw, icon, printHtml } from "./kit.js";
import { clock, span } from "../times.js";
import { searchRunners } from "../model.js";
import { holders } from "../judge.js";
import { minutesHtml, clubsHtml } from "../print/lists.js";
import { runnerDialog } from "./dialogs.js";
import { listLabels } from "./prepare.js";

const who = (r) => `${r.given || ""} ${r.family || ""}`.trim();

const desk = {
  ribbon(ctx) {
    return [{ label: t("chr.post.desk"), items: [
      { icon: "plus", label: t("chr.run.new"), primary: true, on: () => runnerDialog(ctx, null) },
      { icon: "users", label: t("chr.sta.prClub"), tip: t("chr.desk.clubTip"), on: () => printHtml(clubsHtml(ctx.view(), listLabels(t("chr.lst.clubs")))) },
      ...(Object.values(ctx.st().classes).some((k) => k.legs?.length || k.team) ? [{ icon: "users", label: t("chr.team.new"), on: async () => (await import("./teams.js")).teamDialog(ctx, null) }] : []),
      { icon: "coins", label: t("chr.inv.open"), tip: t("chr.inv.openTip"), on: async () => (await import("./invoices.js")).invoicesDialog(ctx) },
    ] }];
  },
  /** A card shown at the desk: an empty one finds its holder (or starts an entry); one that ran goes to the race as usual. */
  card(ctx, read) {
    if (read.finish || (read.punches || []).length > 1) return false;
    const h = holders(ctx.st(), read.card);
    if (h.length === 1) { runnerDialog(ctx, h[0].id); return true; }
    runnerDialog(ctx, null, { card: read.card, rent: undefined });
    return true;
  },
  mount(ctx, el) {
    el.innerHTML = html`<div class="chr-desk"><div class="chr-card"><h3>${t("chr.desk.find")}</h3>
      <input type="search" id="chr-desk-q" class="chr-big-q" placeholder="${t("chr.desk.search")}" autocomplete="off" autofocus><div id="chr-desk-l" class="chr-picks tall"></div>
      <p class="chr-dim">${t("chr.desk.hint")}</p></div><div id="chr-desk-side"></div></div>`.toString();
    const q = el.querySelector("#chr-desk-q"), list = el.querySelector("#chr-desk-l"), side = el.querySelector("#chr-desk-side");
    const drawList = () => {
      const st = ctx.st(), found = searchRunners(st, q.value, 14);
      list.innerHTML = q.value.trim() && !found.length ? html`<p class="chr-empty">${t("chr.noMatch")} <button type="button" class="btn btn-sm" id="chr-desk-new">${t("chr.run.new")}</button></p>`.toString()
        : found.map((r) => html`<button type="button" class="chr-pick" data-id="${r.id}"><b>${who(r)}</b><span>${st.clubs[r.club]?.name || ""}</span><span>${st.classes[r.cls]?.name || html`<i class="chr-warn">—</i>`}</span>
          <span class="num">${r.card || html`<i class="chr-warn">${t("chr.desk.noCard")}</i>`}</span><span class="num">${clock(r.start)}</span>${r.fee > 0 && !r.paid ? html`<span class="chr-chip bad">${r.fee}</span>` : ""}</button>`).join("");
      list.querySelectorAll("[data-id]").forEach((b) => b.addEventListener("click", () => runnerDialog(ctx, b.dataset.id)));
      list.querySelector("#chr-desk-new")?.addEventListener("click", () => { const parts = q.value.trim().split(/\s+/); runnerDialog(ctx, null, { family: parts.slice(1).join(" ") || parts[0], given: parts.length > 1 ? parts[0] : "" }); });
    };
    q.addEventListener("input", drawList);
    q.addEventListener("keydown", (e) => { if (e.key === "Enter") list.querySelector("[data-id]")?.click(); });
    const drawSide = () => {
      const st = ctx.st(), R = Object.values(st.runners).filter((r) => r.status !== "dns");
      const lists = [["noCard", R.filter((r) => !r.card)], ["unpaid", R.filter((r) => r.fee > 0 && !r.paid)], ["rent", R.filter((r) => r.rent === 1)], ["noCls", R.filter((r) => !st.classes[r.cls])]];
      const due = R.reduce((s, r) => s + (r.fee > 0 && !r.paid ? Number(r.fee) : 0), 0), got = R.reduce((s, r) => s + (r.fee > 0 && r.paid ? Number(r.fee) : 0), 0);
      side.innerHTML = html`<div class="chr-tiles"><div><b>${R.length}</b><span>${t("chr.desk.entries")}</span></div><div><b>${got}</b><span>${t("chr.desk.got")}</span></div><div class="${due ? "warn" : ""}"><b>${due}</b><span>${t("chr.desk.due")}</span></div></div>
        ${lists.map(([k, rows]) => (rows.length ? html`<div class="chr-card"><h3>${t(`chr.desk.${k}`)} <small>${rows.length}</small></h3><div class="chr-picks">${rows.slice(0, 30).map((r) => html`<div class="chr-pick" data-id="${r.id}"><b>${who(r)}</b>
          <span>${st.clubs[r.club]?.name || ""}</span><span>${st.classes[r.cls]?.name || ""}</span>${k === "unpaid" ? html`<button type="button" class="btn btn-sm" data-paid="${r.id}">${t("chr.desk.pay", { fee: r.fee })}</button>` : ""}
          ${k === "rent" ? html`<span class="num">${r.card || ""}</span>` : ""}</div>`)}</div></div>` : ""))}`.toString();
      side.querySelectorAll("[data-paid]").forEach((b) => b.addEventListener("click", (e) => { e.stopPropagation(); ctx.put("runners", b.dataset.paid, { paid: 1 }); }));
      side.querySelectorAll(".chr-pick[data-id]").forEach((d) => d.addEventListener("click", () => runnerDialog(ctx, d.dataset.id)));
    };
    drawList(); drawSide();
    return { update() { drawList(); drawSide(); } };
  },
};

const start = {
  ribbon(ctx) {
    return [{ label: t("chr.post.start"), items: [
      { icon: "print", label: t("chr.sta.prMinute"), tip: t("chr.sta.prMinuteTip"), on: () => printHtml(minutesHtml(ctx.view(), listLabels(t("chr.lst.minutes")))) },
      { icon: "x", label: t("chr.go.absent"), tip: t("chr.go.absentTip"), on: async () => {
        const st = ctx.st(), now = ctx.now(), R = Object.values(st.runners), used = R.some((r) => r.here);
        const gone = R.filter((r) => r.start != null && r.start < now - 300 && !r.here && !r.status && !ctx.view().byRunner.get(r.id)?.read);
        if (!used) { ctx.toast(t("chr.go.noTicks"), "warn"); return; }
        if (!gone.length || !(await confirmBox(tn("chr.go.absentAsk", gone.length), { ok: t("chr.go.absent") }))) return;
        ctx.log.add("many", { rows: gone.map((r) => ["runners", r.id, { status: "dns" }]) }, ctx.by);
      } },
      ...(Object.values(ctx.st().classes).some((k) => k.legs?.length > 1) ? [{ icon: "clock", label: t("chr.rst.title"), tip: t("chr.rst.tip"), on: async () => (await import("./teams.js")).restartDialog(ctx) }] : []),
    ] }];
  },
  mount(ctx, el) {
    const S = { q: "", all: false };
    el.innerHTML = html`<div class="chr-go"><div class="chr-go-head"><div class="chr-go-clock" id="chr-go-clock"></div><div id="chr-go-next" class="chr-go-next"></div>
      <div class="chr-go-tools"><input type="search" id="chr-go-q" placeholder="${t("chr.search")}"><label class="chr-check"><input type="checkbox" id="chr-go-all"> ${t("chr.go.all")}</label></div></div>
      <div id="chr-go-list" class="chr-go-list"></div></div>`.toString();
    const list = el.querySelector("#chr-go-list");
    el.querySelector("#chr-go-q").addEventListener("input", (e) => { S.q = e.target.value; draw(); });
    el.querySelector("#chr-go-all").addEventListener("change", (e) => { S.all = e.target.checked; draw(); });
    function draw() {
      const st = ctx.st(), now = ctx.now(), mode = st.event.startMode || "list";
      el.querySelector("#chr-go-clock").textContent = clock(now);
      if (mode !== "list") { list.innerHTML = html`<p class="chr-note">${t(`chr.sta.mode.${mode}`)}</p>`.toString(); el.querySelector("#chr-go-next").textContent = ""; return; }
      let rows = S.q.trim() ? searchRunners(st, S.q, 40) : Object.values(st.runners);
      rows = rows.filter((r) => r.start != null && (S.all || S.q.trim() || r.start >= now - 180)).sort((a, b) => a.start - b.start || String(st.classes[a.cls]?.name).localeCompare(String(st.classes[b.cls]?.name)));
      const next = rows.find((r) => r.start > now);
      el.querySelector("#chr-go-next").innerHTML = next ? html`<span>${t("chr.go.next")}</span> <b>${clock(next.start)}</b> <i>${t("chr.go.in", { t: span(next.start - now) })}</i>`.toString() : html`<span>${t("chr.go.over")}</span>`.toString();
      let last = null;
      list.innerHTML = rows.slice(0, 150).map((r) => {
        const head = r.start !== last ? html`<div class="chr-go-min ${r.start <= now ? "past" : r.start - now <= 60 ? "now" : ""}">${clock(r.start)}</div>` : "";
        last = r.start;
        return html`${head}<div class="chr-go-row ${r.status === "dns" ? "dns" : r.here ? "here" : ""}" data-id="${r.id}"><span class="cls">${st.classes[r.cls]?.name || ""}</span><b>${who(r)}</b><span>${st.clubs[r.club]?.name || ""}</span>
          <span class="num">${r.card || html`<i class="chr-warn">${t("chr.desk.noCard")}</i>`}</span>
          <button type="button" class="chr-tick" data-here="${r.id}" aria-pressed="${String(!!r.here)}" title="${t("chr.go.here")}">${icon("check", 18)}</button>
          <button type="button" class="chr-tick no" data-dns="${r.id}" aria-pressed="${String(r.status === "dns")}" title="${t("chr.st.dns")}">${icon("x", 18)}</button></div>`;
      }).join("") || html`<p class="chr-empty">${t("chr.go.none")}</p>`.toString();
      list.querySelectorAll("[data-here]").forEach((b) => b.addEventListener("click", () => { const r = ctx.st().runners[b.dataset.here]; ctx.put("runners", r.id, { here: r.here ? null : 1, ...(r.status === "dns" ? { status: null } : {}) }); }));
      list.querySelectorAll("[data-dns]").forEach((b) => b.addEventListener("click", () => { const r = ctx.st().runners[b.dataset.dns]; ctx.put("runners", r.id, { status: r.status === "dns" ? null : "dns", here: null }); }));
      list.querySelectorAll(".chr-go-row").forEach((d) => d.addEventListener("dblclick", () => runnerDialog(ctx, d.dataset.id)));
    }
    draw();
    const tick = setInterval(() => { if (el.isConnected) { const c = el.querySelector("#chr-go-clock"); if (c) c.textContent = clock(ctx.now()); } }, 1000);
    return { update: draw, unmount: () => clearInterval(tick) };
  },
};

export const posts = { desk, start };
