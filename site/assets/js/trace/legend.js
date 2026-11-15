// The analyses' « Légende » (owner, 2026-11-06): the right panel's last tab says what each button and icon of the page does — a
// phone shows no tooltips, and on a computer it gathers them in one place. One list for « Analyse solo » and the map analysis
// (`multi`): the page says which of its parts it has.

import { html, raw } from "../util.js";
import { t } from "../i18n.js";
import { ICONS, PAN_ICON, drawers } from "./sidepanel.js";
import { EX_ICON, exLabel } from "./ex3dbtn.js";

const btn = (s) => `<span class="lg-btn">${s}</span>`;

/**
 * The legend's markup. o: { multi (the map analysis), modes: [[icon, mode]] (its start modes), add (a trace may be added),
 * video (the headcam's button) }.
 */
export function keyHtml(o = {}) {
  const phone = drawers(), cols = { col: t("sh.col.follow"), tab: t("sh.tab.circuits") };
  const groups = [];
  const top = [];
  if (o.multi) {
    top.push([ICONS.map, t("sh.pane.map"), t("lg.map.d")], [ICONS.times, t("sh.pane.splits"), t("lg.times.d")]);
    if (o.add) top.push([ICONS.add, t("sh.trace.add"), t("lg.add.d")]);
  }
  top.push([btn(ICONS.panelsOut), t("lg.mapOnly"), t("lg.mapOnly.d")], [btn("⤢"), t("lg.full"), t("lg.full.d")]);
  groups.push([t("lg.h.top"), top]);
  const bar = [];
  // the leg shown, at the bar's left (owner, 2026-11-08)
  bar.push([btn(`${ICONS.course}▾`), t("lg.legpick"), t("lg.legpick.d")]);
  if (o.multi && o.modes) {
    for (const [icon, m] of o.modes) bar.push([btn(icon), t(`sh.mode.${m}`), t(`sh.mode.${m}.hint`)]);
    bar.push([btn("▷"), t("lg.from"), t("lg.from.d", { mode: t("sh.mode.from") })]);
  }
  bar.push([btn(PAN_ICON), t("lg.pan"), t(o.multi ? "lg.pan.d.multi" : "lg.pan.d.solo", cols)],
    [`${btn("⏮")}${btn("⏭")}`, t("lg.legs"), t("lg.legs.d")],
    [btn("▶"), t("an.play"), t("lg.play.d")],
    [btn("×10"), t("an.speed"), t("lg.speed.d")]);
  groups.push([t("lg.h.bar"), bar]);
  groups.push([t("lg.h.map"), [
    [btn("3D"), t("an.v3.title"), t("an.v3.hint")],
    // the relief's exaggeration, shown under « 3D » while the 3D view is on (owner, 2026-11-15)
    [btn(`${EX_ICON}${exLabel(1.5)}`), t("an.v3.ex"), t("lg.ex3d.d", { display: t("an.display") })],
    [`${btn("+")}${btn("−")}`, t("lg.zoom"), t("lg.zoom.d")],
    [btn(ICONS.fit), t(o.multi ? "sh.fit" : "an.fitTrace"), t(o.multi ? "lg.fitc.d" : "lg.fitt.d")],
    [btn("▭"), t("an.fitMap"), t("lg.fitm.d")],
    [btn("📏"), t("lg.measure"), t("an.measure.hint")],
    ...(o.video ? [[btn("🎥"), t("sh.video.title"), t("lg.video.d")]] : []),
    // the leg at the map's bottom left (owner, 2026-11-07), and the map analysis's way back to the whole course beside it
    [btn("2 → 3"), t("lg.legchip"), t(o.multi ? "lg.legchip.d.multi" : "lg.legchip.d.solo")],
    [btn(ICONS.course), t("lg.whole"), t("lg.whole.d")],
  ]]);
  groups.push([t("lg.h.panels"), [
    phone ? [`${btn("›")}${btn("‹")}`, t("lg.handle"), t("lg.handle.d.phone")] : [`${btn("‹")}${btn("›")}`, t("lg.fold"), t("lg.fold.d")],
    [btn(`${phone ? "▴" : "▸"} ${t("sh.strip.title")}`), t("an.graph"), t("lg.strip.d")],
    ...(o.multi ? [[btn("⌖"), t("lg.follow", cols), t("lg.follow.d", cols)],
      // the runners' times: « ~ » = read on the track, not published
      [btn("~"), t("lg.timeEst"), t("lg.timeEst.d", { tab: cols.tab, col: t("prov.time") })]] : []),
  ]]);
  return html`<div class="lg">${groups.map(([head, items]) => html`<h4 class="lg-h">${head}</h4>
    <dl class="lg-list">${items.map(([ico, name, d]) => html`<div class="lg-row"><dt>${raw(ico)}</dt><dd><b>${name}</b><span>${d}</span></dd></div>`)}</dl>`)}</div>`;
}
