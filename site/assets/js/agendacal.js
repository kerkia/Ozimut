// The Agenda's calendar (owner, 2026-11-21: « below the map, a calendar view that shows all competitions by month / week, synced
// with the table and map »). Under the map on a computer: a month — each day its number, a dot per competition coloured by its
// discipline (a training hollow), how many, and a ground the darker the busier the day — or a week, each day's competitions by
// name. It shows what the table shows (the filters apply), and:
// - a day under the mouse lights its competitions in the table and on the map, a box lists them; a click opens its week and
//   brings the list to that day; a competition of the week chosen as a row of the table is;
// - the list scrolled by hand takes the calendar to the month (or week) of its first row in sight; ‹ › and « Aujourd'hui » take
//   the list to the first competition of the month (or week) shown;
// - a row under the mouse, or chosen, marks its day (the calendar moves to a competition chosen elsewhere).
// The view (month or week) and whether the calendar is folded are kept on the device.

import { html } from "./util.js";
import { t, tn, locale } from "./i18n.js";

const DAY = 86400e3;
const KEY = "ocn.agd.cal";
const msOf = (iso) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10));
const isoOf = (ms) => new Date(ms).toISOString().slice(0, 10);
const mondayOf = (ms) => ms - ((new Date(ms).getUTCDay() + 6) % 7) * DAY;
const monthStart = (ms) => { const d = new Date(ms); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1); };
const addMonths = (ms, n) => { const d = new Date(ms); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1); };
/** ISO 8601's week number. */
function weekNo(ms) {
  const thu = mondayOf(ms) + 3 * DAY;
  const w1 = mondayOf(Date.UTC(new Date(thu).getUTCFullYear(), 0, 4));
  return 1 + Math.round((thu - w1) / (7 * DAY));
}
const LONG_DAYS = 21;                    // a camp of weeks: its first three on the calendar
/** A competition's discipline as the calendar colours it. */
const discOf = (e) => (e.spec === "VTT" ? "mtbo" : e.spec === "Ski" ? "ski" : e.spec === "Trail-O" ? "trail"   // the data's values (i18n-ignore)
  : e.epr === "Sprint" ? "sprint" : e.spec === "Pédestre" ? "foot" : "other");                                  // (i18n-ignore)
const DISCS = ["foot", "sprint", "mtbo", "ski", "trail"];
const esc = (x) => String(x ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

/**
 * The calendar in `el`. Options: today (ISO day), name(e) (its name as the table writes it), flag(e) (an html prefix: the
 * country's flag where the list mixes countries), onPick(key), onHover(keys | null), onRange(fromIso, toIso) (the calendar was
 * moved by its own buttons: the list follows), onDay(iso) (a day opened). Returns { show(events, selected), hover(key),
 * select(key), follow(iso), destroy }.
 */
export function mount(el, { today, name = (e) => e.name, flag = () => "", onPick, onHover, onRange, onDay } = {}) {
  let kept = {};
  try { kept = JSON.parse(localStorage.getItem(KEY) || "{}") || {}; } catch (e) { /* the defaults */ }
  const st = { view: kept.view === "week" ? "week" : "month", fold: !!kept.fold, anchor: null, events: [], byDay: new Map(),
    byKey: new Map(), selected: null, hover: null, openDay: null };
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify({ view: st.view, fold: st.fold })); } catch (e) { /* this visit */ } };
  const todayMs = msOf(today);
  const fmtMonth = new Intl.DateTimeFormat(locale(), { month: "long", year: "numeric", timeZone: "UTC" });
  const fmtShort = new Intl.DateTimeFormat(locale(), { day: "numeric", month: "short", timeZone: "UTC" });
  const fmtDayLong = new Intl.DateTimeFormat(locale(), { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
  const wdNames = Array.from({ length: 7 }, (_, i) => new Intl.DateTimeFormat(locale(), { weekday: "narrow", timeZone: "UTC" }).format(Date.UTC(2024, 0, 1 + i)));

  el.hidden = false;
  el.innerHTML = html`<div class="agc-head">
      <h2 class="agc-h">${t("agd.cal.title")}</h2>
      <div class="agc-nav"><button type="button" class="btn btn-sm" data-nav="-1">‹</button><button type="button" class="btn btn-sm agc-today" data-nav="0">${t("agd.cal.today")}</button><button type="button" class="btn btn-sm" data-nav="1">›</button></div>
      <div class="seg agc-views" role="group" aria-label="${t("agd.cal.title")}"><button type="button" data-view="month">${t("agd.cal.month")}</button><button type="button" data-view="week">${t("agd.cal.week")}</button></div>
      <button type="button" class="btn btn-sm agc-fold" data-fold></button></div>
    <div class="agc-body"><div class="agc-title"></div><div class="agc-grid"></div>
      <div class="agc-legend">${DISCS.map((d) => html`<span class="agc-k"><i class="agc-dot d-${d}"></i>${t(`agd.cal.d.${d}`)}</span>`)}<span class="agc-k"><i class="agc-dot d-foot train"></i>${t("agd.cal.d.train")}</span></div></div>
    <div class="agc-tip" hidden></div>`;
  const grid = el.querySelector(".agc-grid"), title = el.querySelector(".agc-title"), tip = el.querySelector(".agc-tip");
  const prevTitle = t("agd.cal.prev"), nextTitle = t("agd.cal.next");

  // the days the view covers: a month's weeks, or one week
  const range = () => {
    if (st.view === "week") return [st.anchor, st.anchor + 6 * DAY];
    const first = mondayOf(st.anchor), next = addMonths(st.anchor, 1);
    return [first, mondayOf(next - DAY) + 6 * DAY];
  };
  const anchorFor = (ms) => (st.view === "week" ? mondayOf(ms) : monthStart(ms));
  const shownRange = () => (st.view === "week" ? range() : [st.anchor, addMonths(st.anchor, 1) - DAY]);
  const inView = (ms) => { const [a, b] = shownRange(); return ms >= a && ms <= b; };

  function index(events) {
    st.byDay = new Map();
    st.byKey = new Map();
    for (const e of events) {
      if (!e.date) continue;
      const a = msOf(e.date), b = Math.min(msOf(e.end || e.date), a + (LONG_DAYS - 1) * DAY);
      const days = [];
      for (let d = a; d <= b; d += DAY) {
        const k = isoOf(d);
        if (!st.byDay.has(k)) st.byDay.set(k, []);
        st.byDay.get(k).push(e);
        days.push(k);
      }
      st.byKey.set(e.key, days);
    }
  }

  const dot = (e) => `<i class="agc-dot d-${discOf(e)}${e.kind === "e" ? " train" : ""}${e.cancelled ? " off" : ""}"></i>`;
  function draw() {
    el.classList.toggle("folded", st.fold);
    const fold = el.querySelector("[data-fold]");
    fold.textContent = st.fold ? "▾" : "▴";
    fold.title = t(st.fold ? "agd.cal.unfold" : "agd.cal.fold");
    fold.setAttribute("aria-expanded", String(!st.fold));
    el.querySelectorAll("[data-view]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.view === st.view)));
    el.querySelector('[data-nav="-1"]').title = prevTitle;
    el.querySelector('[data-nav="1"]').title = nextTitle;
    if (st.fold) return;
    const [a, b] = range();
    if (st.view === "month") {
      title.textContent = fmtMonth.format(st.anchor);
      const month = new Date(st.anchor).getUTCMonth();
      let peak = 3;
      for (let d = a; d <= b; d += DAY) peak = Math.max(peak, (st.byDay.get(isoOf(d)) || []).length);
      let rows = "";
      for (let w = a; w <= b; w += 7 * DAY) {
        let cells = `<th class="agc-wk" scope="row">${weekNo(w)}</th>`;
        for (let d = w; d < w + 7 * DAY; d += DAY) {
          const k = isoOf(d), evs = st.byDay.get(k) || [];
          const cls = ["agc-d", new Date(d).getUTCMonth() !== month ? "out" : "", d === todayMs ? "today" : "", d < todayMs ? "past" : "", evs.length ? "has" : ""].filter(Boolean).join(" ");
          const dots = evs.slice(0, 6).map(dot).join("");
          cells += `<td class="${cls}" data-day="${k}" style="--heat:${(evs.length / peak).toFixed(2)}"${evs.length ? ` tabindex="0"` : ""}><span class="agc-n">${new Date(d).getUTCDate()}</span>${
            evs.length ? `<span class="agc-dots">${dots}</span><span class="agc-c">${evs.length}</span>` : ""}</td>`;
        }
        rows += `<tr>${cells}</tr>`;
      }
      grid.innerHTML = `<table class="agc-month"><thead><tr><th class="agc-wk" title="${esc(t("agd.cal.wkTip"))}">${esc(t("agd.cal.wk"))}</th>${
        wdNames.map((n) => `<th scope="col">${esc(n)}</th>`).join("")}</tr></thead><tbody>${rows}</tbody></table>`;
    } else {
      title.textContent = t("agd.cal.weekOf", { n: weekNo(a), a: fmtShort.format(a), b: fmtShort.format(b) });
      let out = "";
      for (let d = a; d <= b; d += DAY) {
        const k = isoOf(d), evs = st.byDay.get(k) || [];
        out += `<div class="agc-wd${d === todayMs ? " today" : ""}${d < todayMs ? " past" : ""}${k === st.openDay ? " open" : ""}" data-day="${k}"><div class="agc-wd-h">${esc(fmtDayLong.format(d))}${
          evs.length ? ` <span class="dim">· ${esc(tn("agd.count", evs.length))}</span>` : ""}</div>${
          evs.length ? evs.map((e) => `<button type="button" class="agc-ev${e.cancelled ? " off" : ""}" data-key="${esc(e.key)}" title="${esc([name(e), e.place].filter(Boolean).join(" · "))}">${dot(e)}${flag(e)}<span>${esc(name(e))}</span></button>`).join("")
            : `<div class="agc-none dim">—</div>`}</div>`;
      }
      grid.innerHTML = `<div class="agc-week">${out}</div>`;
      const open = st.openDay && grid.querySelector(`.agc-wd[data-day="${st.openDay}"]`);
      const wk = grid.querySelector(".agc-week");
      if (open && wk) wk.scrollTop = open.getBoundingClientRect().top - wk.getBoundingClientRect().top;
    }
    mark();
  }
  // the competition under the mouse in the table or on the map, and the one chosen: their days (month), their names (week)
  function mark() {
    if (st.fold) return;
    const sel = new Set(st.byKey.get(st.selected) || []), hov = new Set(st.byKey.get(st.hover) || []);
    grid.querySelectorAll(".agc-d[data-day]").forEach((c) => { c.classList.toggle("sel", sel.has(c.dataset.day)); c.classList.toggle("hl", hov.has(c.dataset.day)); });
    grid.querySelectorAll(".agc-ev").forEach((b) => { b.classList.toggle("sel", b.dataset.key === st.selected); b.classList.toggle("hl", b.dataset.key === st.hover); });
  }
  function moveTo(ms, tell) {
    st.anchor = anchorFor(ms);
    draw();
    if (tell) { const [a, b] = shownRange(); onRange?.(isoOf(a), isoOf(b)); }
  }

  el.addEventListener("click", (ev) => {
    const nav = ev.target.closest("[data-nav]"), view = ev.target.closest("[data-view]");
    if (nav) {
      const n = Number(nav.dataset.nav);
      st.openDay = null;
      if (!n) moveTo(todayMs, true);
      else moveTo(st.view === "week" ? st.anchor + n * 7 * DAY : addMonths(st.anchor, n), true);
      return;
    }
    if (view && view.dataset.view !== st.view) {
      // the week of the day chosen, else of today when it is in the month shown, else the month's first week
      const was = st.anchor;
      st.view = view.dataset.view;
      save();
      const pick = st.selected && st.byKey.get(st.selected)?.[0];
      const ms = st.view === "week" ? (pick && inMonth(msOf(pick), was) ? msOf(pick) : inMonth(todayMs, was) ? todayMs : was) : was + 3 * DAY;
      moveTo(ms, true);
      return;
    }
    if (ev.target.closest("[data-fold]")) { st.fold = !st.fold; save(); hideTip(); draw(); return; }
    const evb = ev.target.closest(".agc-ev[data-key]");
    if (evb) { onPick?.(evb.dataset.key); return; }
    const day = ev.target.closest(".agc-d[data-day]");
    if (day && (st.byDay.get(day.dataset.day) || []).length) openDay(day.dataset.day);
  });
  const inMonth = (ms, m) => ms >= m && ms < addMonths(m, 1);
  function openDay(k) {
    hideTip();
    st.view = "week";
    st.openDay = k;
    save();
    moveTo(msOf(k), false);
    onDay?.(k);
  }
  el.addEventListener("keydown", (ev) => {
    const day = ev.target.closest(".agc-d[data-day]");
    if (day && (ev.key === "Enter" || ev.key === " ")) { ev.preventDefault(); openDay(day.dataset.day); }
  });

  // a day under the mouse: its competitions lit in the table and on the map, listed in a box
  function hideTip() { tip.hidden = true; }
  grid.addEventListener("mouseover", (ev) => {
    const evb = ev.target.closest(".agc-ev[data-key]");
    if (evb) { onHover?.([evb.dataset.key]); return; }
    const c = ev.target.closest(".agc-d[data-day]");
    if (!c) return;
    const evs = st.byDay.get(c.dataset.day) || [];
    onHover?.(evs.length ? evs.map((e) => e.key) : null);
    if (!evs.length) { hideTip(); return; }
    tip.innerHTML = html`<b>${fmtDayLong.format(msOf(c.dataset.day))}</b>${evs.slice(0, 8).map((e) => html`<div>${e.cancelled ? html`<s>${name(e)}</s>` : name(e)}</div>`)}${
      evs.length > 8 ? html`<div class="dim">${t("agd.map.more", { n: evs.length - 8 })}</div>` : ""}<div class="dim">${t("agd.cal.open")}</div>`;
    tip.hidden = false;
    const r = el.getBoundingClientRect(), cr = c.getBoundingClientRect();
    tip.style.left = `${Math.min(r.width - 260, Math.max(4, cr.left - r.left))}px`;
    // (above the day in the month's lower half: the column under the calendar may cut it)
    const gr = grid.getBoundingClientRect();
    tip.style.top = cr.top - gr.top > gr.height / 2 ? `${cr.top - r.top - tip.offsetHeight - 4}px` : `${cr.bottom - r.top + 4}px`;
  });
  grid.addEventListener("mouseleave", () => { hideTip(); onHover?.(null); });

  return {
    /** The competitions the table shows (each with its `key`), and the one chosen. */
    show(events, selected) {
      st.events = events;
      index(events);
      st.selected = selected || null;
      if (st.anchor == null) {
        const pick = st.selected && st.byKey.get(st.selected)?.[0];
        st.anchor = anchorFor(pick ? msOf(pick) : todayMs);
      }
      draw();
    },
    hover(key) { st.hover = key || null; mark(); },
    /** A competition chosen elsewhere: the calendar goes to it when it is not in sight. */
    select(key) {
      st.selected = key || null;
      const days = st.byKey.get(st.selected) || [];
      // (a competition of several days in sight by one of them: the calendar stays)
      if (days.length && !days.some((d) => inView(msOf(d)))) { st.openDay = st.view === "week" ? days[0] : null; moveTo(msOf(days[0]), false); }
      else mark();
    },
    /** The list scrolled to this day: the calendar follows when it is not in sight. */
    follow(iso) {
      if (!iso || st.anchor == null || inView(msOf(iso))) return;
      st.openDay = null;
      moveTo(msOf(iso), false);
    },
    destroy() { el.innerHTML = ""; },
  };
}
