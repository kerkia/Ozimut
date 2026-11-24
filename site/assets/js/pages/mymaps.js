// « Mes cartes » (Coach; owner, 2026-11-01): each account's archive of its maps and the routes it ran on them, as DOMA keeps
// them — a gallery, each map with its runs drawn on it. A run comes from « Analyse solo » (« Enregistrer dans Mes cartes »,
// trace/mymapsave.js), from QuickRoute's JPEG files or Ozimut's own (a JPEG carrying the map and its runs: trace/mymaps.js),
// one by one or in a zip. Private: a link to the whole archive or to one map shares it with whoever holds it
// (#/mes-cartes?partage=<token>[&carte=<id>]; a visitor without an account too). Every map goes out as Ozimut's file, one
// or all in a zip, and comes back the same. DOMA: no import yet — its button asks the Ozimut team to turn it on for the
// account, a message ready to send. No quota for now (owner).
//
// The library (owner, 2026-11-06): its figures (maps, share with a track, countries, regions) for the whole library and for
// each folder; filters by country, region and département; a map of where the maps are (agendamap.js, the Agenda's: the
// mouse over a dot names its maps, a click opens one); the maps grouped in folders by place (country › region ›
// département › place) or by date (year › month), each folder unfolded in place or entered, a breadcrumb leading back;
// on each card, under the mouse, the icons of « Rejouer », « Renommer », « Commenter » and « Supprimer » — the same icons
// before the same actions on the map's own page. « Nouvelle carte »: a map in any format, a GPS track if one wishes, the
// name, date and place asked when the files do not give them. « Importer un dossier »: a folder of maps sorted by
// country / region / département / place (trace/mymapsimport.js), its format shown, each file that does not follow it named
// with the reason. A library holds 1 GB (originals and runs; the server says, st.quota). The map's page draws its viewing copy
// (2 560 px at most) and reads the original only to zoom in closely (owner, 2026-11-06).
// The administrators' view (`?vue=toutes`, administrators only): every map sent to Ozimut — the collection of
// functions/_lib/maplib.js (Analyse solo, the map analyses, the Tracer) and every account's library —, each tagged with where
// it came from and whose it is, filtered and grouped by account or club too; read only.

import { html, raw, $, $$, fmt, fmtDate, fmtTime, fileAccept, pctN } from "../util.js";
import { t, tn, loadArea, lang } from "../i18n.js";
import * as auth from "../auth.js";
import { replaceQuery } from "../app.js";
import * as MM from "../trace/mymaps.js";
import * as MP from "../trace/mymapsplace.js";
import * as MI from "../trace/mymapsimport.js";
import { bar, setBar } from "../waitbar.js";
import * as phone from "../phonelink.js";
import { alertBox, confirmBox } from "../askbox.js";

await loadArea("mymaps");

const SKEY = "ocn.mm.prefs";
// with their runs: QuickRoute's and Ozimut's JPEGs, a zip of them
const ACCEPT_TRACE = ".jpg,.jpeg,.zip,image/jpeg,application/zip";
const prefs = (() => { try { return JSON.parse(localStorage.getItem(SKEY) || "{}") || {}; } catch (e) { return {}; } })();
const keepPrefs = () => { try { localStorage.setItem(SKEY, JSON.stringify(prefs)); } catch (e) { /* this visit */ } };
const km = (m) => (m == null ? "—" : t("mm.km", { n: fmt(m / 1000, 1) }));
const pace = (dur, dist) => (dur && dist ? `${fmtTime(Math.round((dur / dist) * 1000))} ${t("mm.perKm")}` : "—");
const size = (b) => (b < 1024 * 1024 ? t("mm.kb", { n: fmt(Math.max(1, b / 1024)) }) : t("mm.mb", { n: fmt(b / 1024 / 1024, 1) }));
/** A map's year: its date's, else one its name or place gives (« Ball-Trap S 2019 »). */
const yearOf = (m) => (m.day || "").slice(0, 4) || MI.yearIn(m.title) || MI.yearIn(m.place);
const inviteUrl = (token) => `${location.origin}${location.pathname}#/mes-cartes?invitation=${token}`;
const shareUrl = (token, map) => `${location.origin}${location.pathname}#/mes-cartes?partage=${token}${map ? `&carte=${map}` : ""}`;
const wide = () => matchMedia("(min-width: 980px)").matches;

// the actions' icons: the same on a card (under the mouse) and before the same buttons on the map's page
const PATHS = {
  replay: '<path d="M8 5v14l11-7z" fill="currentColor" stroke="none"/>',
  rename: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>',
  note: '<path d="M4 5h16v11H10l-5 4v-4H4z"/><path d="M8 9h8M8 12h5"/>',
  delete: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  edit: '<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>',
  add: '<path d="M12 5v14M5 12h14"/>',
  track: '<path d="M5 19c3-1 3-5 6-6s4 2 7-1"/><circle cx="5" cy="19" r="1.6"/><circle cx="18" cy="12" r="1.6"/>',
  folder: '<path d="M3 6h6l2 2h10v11H3z"/>',
  import: '<path d="M3 6h6l2 2h10v11H3z"/><path d="M12 11v6M9 14l3 3 3-3"/>',
  share: '<circle cx="6" cy="12" r="2.2"/><circle cx="17" cy="6" r="2.2"/><circle cx="17" cy="18" r="2.2"/><path d="M8 11l7-4M8 13l7 4"/>',
  export: '<path d="M12 4v11M8 11l4 4 4-4M5 19h14"/>',
};
const icon = (k) => raw(`<svg class="mm-ic" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${PATHS[k]}</svg>`);

export async function render(main, { query = {} } = {}) {
  const me = auth.session();
  // an invitation to someone's library (owner, 2026-11-24): accepted by the account that opens it, then that library's tab
  if (query.invitation) {
    if (!me) {
      main.innerHTML = html`<div class="mm"><div class="card"><div class="card-body"><p>${t("mm.grant.inviteAccount")}</p></div></div></div>`;
      return { title: t("mm.title") };
    }
    try {
      const r = await MM.acceptInvite(String(query.invitation));
      query = { de: String(r.owner) };
      alertBox(t("mm.grant.accepted", { name: r.name }));
    } catch (e) {
      query = {};
      alertBox(t(e.message === "self" ? "mm.grant.inviteSelf" : e.message === "demo" ? "mm.grant.inviteDemo" : e.status === 503 ? "mm.err.notReady"
        : e.status === 410 ? "mm.grant.inviteGone" : "mm.err.load"));
    }
    history.replaceState(null, "", query.de ? `#/mes-cartes?de=${query.de}` : "#/mes-cartes");
  }
  const link = /^[a-z2-9]{8,40}$/.test(query.partage || "") ? query.partage : null;
  // a library another account shares with this one (owner, 2026-11-24: a tab of its own beside « Ma bibliothèque »)
  const owner = !link && me && /^\d{1,12}$/.test(query.de || "") ? String(query.de) : null;
  const token = link || (owner ? `u${owner}` : null);                    // what the maps are read through (trace/mymaps.js via)
  const srcQ = link ? { partage: link } : owner ? { de: owner } : {};
  const srcHash = link ? `partage=${link}` : owner ? `de=${owner}` : "";
  const all = !token && !!me?.admin && query.vue === "toutes";          // the administrators' view of every map
  let st = { maps: [], links: { archive: null, maps: {}, sets: [] }, name: "", archive: false };
  let q = query.q || "", year = query.annee || "";
  const flt = { country: query.pays || "", region: query.region || "", dept: query.dep || "", src: query.src || "", uid: query.qui || "", club: query.club || "" };
  const GROUPS = all ? ["lieu", "date", "compte", "club", "aucun"] : ["lieu", "date", "aucun"];
  let group = GROUPS.includes(query.groupe) ? query.groupe : GROUPS.includes(prefs.libGroup) ? prefs.libGroup : "lieu";
  let path = query.dossier ? String(query.dossier).split("~").filter(Boolean) : [];
  main.innerHTML = html`<div class="mm" id="mm"><div class="empty">${t("mm.loading")}</div></div>`;
  if (!token && !me) {
    $("#mm").innerHTML = html`<div class="card"><div class="card-body"><p>${t("mm.needAccount")}</p></div></div>`;
    return { title: t("mm.title") };
  }
  let fr, shares = { to: [], from: [], invites: [] };
  const sharesP = me && !link ? MM.shares().then((s) => { shares = s; }).catch(() => {}) : null;
  try {
    [st, fr] = await Promise.all([token ? MM.shared(token).then((s) => ({ ...s, links: { archive: null, maps: {}, sets: [] } })) : all ? adminLibrary() : MM.list(), MP.france(), sharesP]);
  } catch (e) {
    await sharesP;
    $("#mm").innerHTML = html`${libTabs()}<div class="card"><div class="card-body"><p>${t(owner ? "mm.grant.gone" : token ? "mm.shared.gone" : e.status === 503 ? "mm.err.notReady" : "mm.err.load")}</p></div></div>`;
    return { title: t("mm.title") };
  }
  // a georeferenced map without a place (kept before its place was asked, 2026-11-06, or a map of the administrators'
  // collection, which has its position only): in France its département and région from its centre, elsewhere its country
  async function enrich(maps) {
    const abroad = [];
    for (const m of maps) {
      if (m.country || !Number.isFinite(m.lat) || !Number.isFinite(m.lon)) continue;
      const a = MP.frAt(fr, m.lat, m.lon);
      if (a) Object.assign(m, { country: "FR", region: a.region, dept: a.dept });
      else abroad.push(m);
    }
    await Promise.all(abroad.map(async (m) => { const cc = await MP.countryAt(m.lat, m.lon); if (cc) m.country = cc; }));
  }
  await enrich(st.maps);
  const mine = !token && !all;
  const traces = all || !token || st.traces !== false;
  const byId = (id) => st.maps.find((m) => m.id === id);
  let viewer = null, mapCtl = null, mapEl = null, mapCc = "", mapGen = 0, mapWorld = false;
  const sel = new Set();                     // the maps ticked in the gallery (one's own): what the selection's actions act on
  const deptOf = (m) => MP.deptLabel(fr, m.country, m.dept);
  const nRuns = (m) => m.nRuns ?? m.runs.length;
  /** Where a part of a map is read: an administrator's view has its own addresses (m.urls), else one's own or a link's. */
  const urlOf = (m, part) => (m.urls ? `${m.urls}/${part}` : MM.mapUrl(m.id, part, token));
  const whereOf = (m) => [m.place, deptOf(m), m.region && m.region !== m.dept ? m.region : "", MP.countryName(m.country)].filter(Boolean);

  function draw() {
    viewer?.close(); viewer = null;
    const id = query.carte || (token && !st.archive ? st.maps[0]?.id : null);
    if (id && byId(id)) return openMap(byId(id));
    drawList();
  }
  const address = () => replaceQuery({ partage: link, de: owner, vue: all ? "toutes" : null, q: q || null, annee: year || null, pays: flt.country || null, region: flt.region || null,
    dep: flt.dept || null, src: flt.src || null, qui: flt.uid || null, club: flt.club || null,
    groupe: group === (prefs.libGroup || "lieu") ? null : group, dossier: group !== "aucun" && path.length ? path.join("~") : null });

  // ---- the library -----------------------------------------------------------------------------------------------------
  // (owner, 2026-11-01) the ways of adding a map, one a line; (2026-11-06) « Nouvelle carte » and « Importer un dossier » in the
  // head, the others folded under them
  const ways = (open) => html`<details class="card mm-ways" ${raw(open ? "open" : "")}><summary>${t("mm.add.title")}</summary><div class="card-body">
      <div class="mm-way mm-way-best"><div><b>${t("mm.add.solo")}</b> <span class="mm-best">${t("mm.add.best")}</span>
        <p>${t("mm.add.solo.text")}</p></div><a class="btn btn-sm btn-primary" href="#/analyse-solo">${t("mm.add.solo.go")}</a></div>
      <div class="mm-way"><div><b>${t("mm.add.new")}</b><p>${t("mm.add.new.text")}</p></div>
        <button type="button" class="btn btn-sm" data-act="new">${icon("add")} ${t("mm.new")}</button></div>
      <div class="mm-way"><div><b>${t("mm.add.folder")}</b><p>${t("mm.add.folder.text")}</p></div>
        <button type="button" class="btn btn-sm" data-act="folder">${icon("import")} ${t("mm.folder")}</button></div>
      <div class="mm-way"><div><b>${t("mm.add.trace")}</b><p>${t("mm.add.trace.text")}
        <button type="button" class="linklike" id="mm-doma">${t("mm.add.doma")}</button></p></div>
        <label class="btn btn-sm" for="mm-files">${t("mm.add.trace.go")}</label><input type="file" id="mm-files" multiple hidden accept="${fileAccept(ACCEPT_TRACE)}"></div>
      ${phone.offered() ? html`<div class="mm-way"><div><b>${t("ph.mm.title")}</b><p>${t("ph.mm.text")}</p></div>${phone.button("mm-phone")}</div>` : ""}
      <p class="muted mm-drop-hint">${t("mm.add.drop")}</p></div></details>`;

  function drawList() {
    if (!$("#mm")) return;                             // the page left meanwhile (a dialog closed as another page opened)
    for (const id of [...sel]) if (!byId(id)) sel.delete(id);
    const empty = !st.maps.length;
    $("#mm").innerHTML = html`${libTabs()}
      <div class="page-head"><div><h1>${token ? t("mm.shared.title", { name: st.name }) : all ? t("mm.adm.title") : t("mm.title")}</h1>
        <p class="lede">${owner ? t(st.traces ? "mm.grant.lede" : "mm.grant.ledeMap") : token ? t(st.traces ? "mm.shared.lede" : "mm.shared.ledeMap") : all ? t("mm.adm.lede", { n: fmt(st.gone || 0) }) : t("mm.lede")}</p></div>
        ${owner ? html`<div class="mm-acts"><button type="button" class="btn btn-sm btn-ghost" id="mm-leave">${t("mm.grant.leave")}</button></div>` : ""}
        ${mine ? html`<div class="mm-acts"><button type="button" class="btn btn-sm btn-primary" data-act="new">${icon("add")} ${t("mm.new")}</button>
          <button type="button" class="btn btn-sm" data-act="folder">${icon("import")} ${t("mm.folder")}</button>
          <button type="button" class="btn btn-sm" id="mm-share">${icon("share")} ${st.links.archive || shares.to.length || shares.invites?.length ? t("mm.shareLib.on") : t("mm.shareLib")}</button></div>` : ""}</div>
      ${mine ? ways(empty) : ""}
      ${empty ? (mine ? html`<div class="card"><div class="card-body prose mm-empty"><p>${t("mm.empty")}</p></div></div>`
        : html`<div class="card"><div class="card-body prose mm-empty">${t("mm.shared.none")}</div></div>`) : html`
        <div class="mm-stats" id="mm-stats"></div>
        <div class="filters mm-filters">
          <input type="search" id="mm-q" placeholder="${t("mm.search")}" value="${q}" aria-label="${t("mm.search")}">
          <span class="mm-fsel" id="mm-fsel"></span>${all ? html`<span class="muted" id="mm-sync"></span>` : ""}
          <span class="mm-group"><span class="muted">${t("mm.group")}</span><span class="seg" role="group" aria-label="${t("mm.group")}">
            ${GROUPS.map((g) => html`<button type="button" data-mmgroup="${g}" aria-pressed="${group === g}">${t(`mm.group.${g}`)}</button>`)}</span></span>
          ${mine ? html`<button type="button" class="btn btn-ghost btn-sm" id="mm-selall">${t("mm.sel.all")}</button>` : ""}</div>
        ${mine ? html`<div class="mm-selbar" id="mm-selbar" role="toolbar" aria-label="${t("mm.sel.bar")}" hidden><b id="mm-sel-n"></b>
          <button type="button" class="btn btn-sm btn-primary" id="mm-sel-export">${icon("export")} ${t("mm.sel.export")}</button>
          <button type="button" class="btn btn-sm" id="mm-sel-share">${icon("share")} ${t("mm.sel.share")}</button>
          <button type="button" class="btn btn-sm mm-danger" id="mm-sel-del">${icon("delete")} ${t("mm.sel.delete")}</button>
          <button type="button" class="btn btn-ghost btn-sm" id="mm-sel-none">${t("mm.sel.none")}</button></div>` : ""}
        <div class="mm-lib" id="mm-lib"><div class="mm-lib-main" id="mm-main"></div>
          <aside class="mm-lib-side"><div id="mm-libmap" class="mm-libmap"></div></aside></div>`}`;
    mapCtl?.destroy?.(); mapCtl = null; mapEl = null;
    const page = $("#mm");                       // (the site's header has its own [data-group] menu items: every query here stays in the page)
    $$("[data-act=new]", page).forEach((b) => b.addEventListener("click", () => newMapDialog()));
    $$("[data-act=folder]", page).forEach((b) => b.addEventListener("click", () => folderDialog()));
    $("#mm-q")?.addEventListener("input", (e) => { q = e.target.value; refresh(); });
    $$("[data-mmgroup]", page).forEach((b) => b.addEventListener("click", () => {
      group = prefs.libGroup = b.dataset.mmgroup; keepPrefs(); path = [];
      $$("[data-mmgroup]", page).forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
      refresh();
    }));
    const lib = $("#mm-lib");
    if (lib) bindLib(lib);
    if (all && !empty) syncCollection();
    if (mine) {
      $("#mm-selall")?.addEventListener("click", () => { const all = scope().every((m) => sel.has(m.id)); scope().forEach((m) => (all ? sel.delete(m.id) : sel.add(m.id))); marks(); });
      $("#mm-sel-none")?.addEventListener("click", () => { sel.clear(); marks(); });
      $("#mm-sel-export")?.addEventListener("click", () => exportDialog(st.maps.filter((m) => sel.has(m.id))));
      $("#mm-sel-share")?.addEventListener("click", () => shareDialog(sel.size === 1 ? { map: byId([...sel][0]) } : { ids: [...sel] }));
      $("#mm-sel-del")?.addEventListener("click", deleteSelection);
      $("#mm-files").addEventListener("change", (e) => { const f = [...e.target.files]; e.target.value = ""; if (f.length) importFiles(f); });
      // a photo or a file from the phone (phonelink.js): the new map's dialog takes it
      phone.bind("mm-phone", { kind: "map", multiple: false, onFiles: (f) => newMapDialog(f) });
      $("#mm-doma").addEventListener("click", domaDialog);
      $("#mm-share").addEventListener("click", () => shareDialog({}));
      dropZone($("#mm"));
      // a map handed over by Cartographier (« Envoyer vers Mes cartes »): the new map's dialog takes it (pwa.js inbox)
      if (query.recu) import("../pwa.js").then((m) => m.takeInbox()).then((f) => { if (f.length) newMapDialog(f); }).catch(() => {});
    }
    $("#mm-leave")?.addEventListener("click", async () => {
      if (!(await confirmBox(t("mm.grant.leaveAsk", { name: st.name }), { ok: t("mm.grant.leave") }))) return;
      try { await MM.leaveShare(Number(owner)); location.hash = "#/mes-cartes"; } catch (e) { alertBox(t("mm.err.save")); }
    });
    if (!empty) refresh();
  }

  // the maps the filters keep, then those of the folder shown
  const filtered = () => {
    const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return st.maps.filter((m) => (!year || yearOf(m) === year)
      && (!flt.src || m.src === flt.src) && (!flt.uid || m.uid === flt.uid) && (!flt.club || m.club === flt.club)
      && (!flt.country || m.country === flt.country) && (!flt.region || MP.fold(m.region) === MP.fold(flt.region)) && (!flt.dept || MP.fold(m.dept) === MP.fold(flt.dept))
      && words.every((w) => [m.title, m.place, m.notes, m.region, deptOf(m), MP.countryName(m.country), m.user, m.club, ...m.runs.map((r) => r.title)].join(" ").toLowerCase().includes(w)));
  };
  let tree = null, node = null;
  const scope = () => (node ? node.maps : filtered());

  // ---- folders ----------------------------------------------------------------------------------------------------------
  const coll = new Intl.Collator(lang(), { numeric: true, sensitivity: "base" });
  const monthLabel = (day) => { const s = fmtDate(`${day.slice(0, 7)}-01`, "month"); return s.charAt(0).toUpperCase() + s.slice(1); };
  const LEVELS = {
    lieu: [(m) => (m.country ? { k: m.country, label: MP.countryName(m.country) } : null),
      (m) => (m.region ? { k: MP.fold(m.region), label: m.region } : null),
      (m) => (m.dept ? { k: MP.fold(m.dept), label: deptOf(m) } : null),
      (m) => (m.place ? { k: MP.fold(m.place), label: m.place } : null)],
    date: [(m) => { const y = yearOf(m); return y ? { k: y, label: y } : null; },
      (m) => (m.day ? { k: m.day.slice(0, 7), label: monthLabel(m.day) } : null)],
    compte: [(m) => (m.uid ? { k: m.uid, label: m.user || `#${m.uid}` } : null)],
    club: [(m) => (m.club ? { k: m.club, label: m.club } : null)],
  };
  // the folder of maps without a place / date / club / account: its key must never hold "~", which joins a folder's path
  const NONE = "_none";
  /** The folders of maps: { key, label, maps (all below), kids: [node], direct: [map], depth }. */
  function build(maps) {
    const L = LEVELS[group];
    const grow = (n, d) => {
      n.kids = []; n.direct = [];
      if (!L || d >= L.length || n.key === NONE) { n.direct = n.maps; return; }
      const kids = new Map();
      for (const m of n.maps) {
        let g = L[d](m);
        if (!g && d === 0) g = { k: NONE, label: t(group === "date" ? "mm.lib.noDate" : group === "lieu" ? "mm.lib.noPlace" : group === "club" ? "mm.adm.noClub" : "mm.adm.noUser") };
        if (!g) { n.direct.push(m); continue; }
        if (!kids.has(g.k)) kids.set(g.k, { key: g.k, label: g.label, maps: [], depth: d + 1 });
        kids.get(g.k).maps.push(m);
      }
      n.kids = [...kids.values()].sort((a, b) => (a.key === NONE) - (b.key === NONE) || (group === "date" ? b.key.localeCompare(a.key) : coll.compare(a.label, b.label)));
      for (const k of n.kids) grow(k, d + 1);
    };
    const root = { key: "", label: token ? t("mm.shared.title", { name: st.name }) : t("mm.lib.root"), maps, depth: 0 };
    // the levels a filter fixes are not folders (France chosen: its regions at the top)
    grow(root, group === "lieu" ? (flt.dept ? 3 : flt.region ? 2 : flt.country ? 1 : 0) : 0);
    return root;
  }
  const at = (root, p) => { let n = root; const trail = [root]; for (const k of p) { const c = n.kids.find((x) => x.key === k); if (!c) break; n = c; trail.push(c); } return trail; };

  // a set of maps in figures: maps, share with a track, countries, regions (owner, 2026-11-06)
  const figures = (maps) => {
    const n = maps.length, withRuns = maps.filter((m) => nRuns(m)).length;
    return { n, pct: n ? Math.round((100 * withRuns) / n) : 0, countries: new Set(maps.map((m) => m.country).filter(Boolean)).size,
      regions: new Set(maps.filter((m) => m.region).map((m) => `${m.country}|${MP.fold(m.region)}`)).size };
  };
  const figLine = (maps, depth) => {
    const f = figures(maps), loc = group === "lieu";
    return [tn("mm.count.maps", f.n), traces ? t("mm.fig.pctLine", { n: f.pct }) : "",
      !(loc && depth >= 1) && f.countries ? tn("mm.fig.countries", f.countries) : "", !(loc && depth >= 2) && f.regions ? tn("mm.fig.regions", f.regions) : ""].filter(Boolean).join(" · ");
  };
  function drawStats(maps, label) {
    const f = figures(maps), runs = maps.reduce((s, m) => s + nRuns(m), 0), bytes = maps.reduce((n, m) => n + m.bytes + m.runs.reduce((k, r) => k + (r.bytes || 0), 0), 0);
    const tile = (v, k, sub = "") => html`<div class="mm-stat"><b>${v}</b><span>${k}</span>${sub ? html`<small class="muted">${sub}</small>` : ""}</div>`;
    $("#mm-stats").innerHTML = html`<span class="mm-stats-h muted">${label}</span>
      ${tile(fmt(f.n), tn("mm.fig.maps", f.n), mine ? size(bytes) : "")}
      ${traces ? tile(pctN(f.pct), t("mm.fig.pct"), tn("mm.count.runs", runs)) : ""}
      ${tile(fmt(f.countries), tn("mm.fig.countriesK", f.countries))}
      ${tile(fmt(f.regions), tn("mm.fig.regionsK", f.regions))}
      ${all ? tile(fmt(new Set(maps.map((m) => m.uid).filter(Boolean)).size), t("mm.adm.accounts"), size(bytes)) : ""}
      ${mine && st.quota?.limit ? html`<div class="mm-stat mm-quota"><b>${size(st.quota.used)}</b><span>${t("mm.quota.of", { n: size(st.quota.limit) })}</span>
        ${raw(bar(Math.min(1, st.quota.used / st.quota.limit), st.quota.used > 0.9 * st.quota.limit ? "mm-quota-high" : ""))}</div>` : ""}`;
  }

  // the filters: country, then its regions, then their départements (each list from the maps kept)
  function drawFilters() {
    const opts = (vals, cur, label, allKey, name) => html`<select data-f="${name}" aria-label="${label}"><option value="">${t(allKey)}</option>
      ${vals.map(([v, l]) => html`<option value="${v}" ${raw(MP.fold(v) === MP.fold(cur) ? "selected" : "")}>${l}</option>`)}</select>`;
    const countries = [...new Set(st.maps.map((m) => m.country).filter(Boolean))].map((c) => [c, MP.countryName(c)]).sort((a, b) => coll.compare(a[1], b[1]));
    const inC = st.maps.filter((m) => !flt.country || m.country === flt.country);
    const regions = [...new Map(inC.filter((m) => m.region).map((m) => [MP.fold(m.region), [m.region, m.region]])).values()].sort((a, b) => coll.compare(a[1], b[1]));
    const inR = inC.filter((m) => !flt.region || MP.fold(m.region) === MP.fold(flt.region));
    const depts = [...new Map(inR.filter((m) => m.dept).map((m) => [MP.fold(m.dept), [m.dept, deptOf(m)]])).values()].sort((a, b) => coll.compare(a[1], b[1]));
    const years = [...new Set(st.maps.map(yearOf).filter(Boolean))].sort().reverse();
    const pairs = (k, l) => [...new Map(st.maps.filter((m) => m[k]).map((m) => [m[k], [m[k], l(m)]])).values()].sort((a, b) => coll.compare(a[1], b[1]));
    $("#mm-fsel").innerHTML = html`${all ? html`${opts(["mymaps", "solo", "analysis", "tracer"].filter((x) => st.maps.some((m) => m.src === x)).map((x) => [x, t(`mm.adm.src.${x}`)]),
        flt.src, t("mm.adm.f.src"), "mm.adm.allSrc", "src")}
      ${opts(pairs("uid", (m) => m.user || `#${m.uid}`), flt.uid, t("mm.adm.f.user"), "mm.adm.allUsers", "uid")}
      ${opts(pairs("club", (m) => m.club), flt.club, t("mm.adm.f.club"), "mm.adm.allClubs", "club")}` : ""}
      ${countries.length ? opts(countries, flt.country, t("mm.f.country"), "mm.allCountries", "country") : ""}
      ${regions.length ? opts(regions, flt.region, t("mm.f.region"), "mm.allRegions", "region") : ""}
      ${depts.length ? opts(depts, flt.dept, t("mm.f.dept"), "mm.allDepts", "dept") : ""}
      ${years.length ? opts(years.map((y) => [y, y]), year, t("mm.year"), "mm.allYears", "year") : ""}`;
    $$("[data-f]", $("#mm-fsel")).forEach((s) => s.addEventListener("change", () => {
      const k = s.dataset.f;
      if (k === "year") year = s.value;
      else { flt[k] = s.value; if (k === "country") { flt.region = ""; flt.dept = ""; } if (k === "region") flt.dept = ""; }
      path = [];
      refresh();
    }));
  }

  function refresh() {
    if (!st.maps.length) return drawList();
    if (!$("#mm-main")) return;
    drawFilters();
    tree = build(filtered());
    const trail = group === "aucun" ? [tree] : at(tree, path);
    node = trail.at(-1);
    path = trail.slice(1).map((n) => n.key);
    address();
    drawStats(node.maps, node === tree ? (filtered().length === st.maps.length ? t("mm.fig.all") : t("mm.fig.filtered")) : t("mm.fig.folder", { name: node.label }));
    const crumbs = html`<nav class="mm-crumbs" aria-label="${t("mm.lib.crumbs")}">${trail.map((n, i) => (i === trail.length - 1
      ? html`<b>${i ? icon("folder") : ""}${n.label}</b>` : html`<a href="#" data-to="${i}">${i ? icon("folder") : ""}${n.label}</a><span class="sep">›</span>`))}</nav>`;
    $("#mm-main").innerHTML = html`${trail.length > 1 ? crumbs : ""}${content(node, path)}${node.maps.length ? "" : html`<div class="empty">${t("mm.none.filter")}</div>`}`;
    marks();
    drawMap(node.maps);
  }
  const folderRow = (n, p) => html`<details class="mm-folder" data-path="${p.join("~")}"><summary>
      <span class="mm-fold-ic">${icon("folder")}</span><b class="mm-fold-name">${n.label}</b><span class="muted mm-fold-st">${figLine(n.maps, n.depth)}</span>
      <a href="#" class="btn btn-ghost btn-sm mm-enter" data-enter="${p.join("~")}" title="${t("mm.lib.enter.tip")}">${t("mm.lib.enter")} ›</a></summary><div class="mm-fold-body"></div></details>`;
  const content = (n, p) => html`${n.kids.length ? html`<div class="mm-folders">${n.kids.map((k) => folderRow(k, [...p, k.key]))}</div>` : ""}
    ${n.direct.length ? html`<div class="mm-grid">${n.direct.map(card)}</div>` : ""}`;
  const nodeAt = (p) => at(tree, p).at(-1);

  // one listener for the whole library: cards, their icons, ticks, folders unfolded or entered, the breadcrumb
  function bindLib(lib) {
    lib.addEventListener("toggle", (e) => {
      const d = e.target.closest?.(".mm-folder");
      if (!d || !d.open || d.dataset.filled) return;
      const p = d.dataset.path.split("~"), body = $(".mm-fold-body", d);
      body.innerHTML = String(content(nodeAt(p), p));
      d.dataset.filled = "1";
      marks();
    }, true);
    lib.addEventListener("click", (e) => {
      const to = e.target.closest("[data-to]");
      if (to) { e.preventDefault(); path = path.slice(0, Number(to.dataset.to)); refresh(); window.scrollTo({ top: Math.min(window.scrollY, $("#mm-stats").offsetTop - 80) }); return; }
      const en = e.target.closest("[data-enter]");
      if (en) { e.preventDefault(); e.stopPropagation(); path = en.dataset.enter.split("~"); refresh(); return; }
      const qa = e.target.closest("[data-q]");
      if (qa) { e.preventDefault(); e.stopPropagation(); quick(qa.dataset.q, byId(qa.closest(".mm-card").dataset.id), qa); return; }
      if (e.target.closest(".mm-pick")) return;
      const c = e.target.closest(".mm-card");
      if (c) { e.preventDefault(); go(c.dataset.id); }
    });
    lib.addEventListener("change", (e) => {
      const c = e.target.closest(".mm-pick input");
      if (!c) return;
      if (c.checked) sel.add(c.dataset.id); else sel.delete(c.dataset.id);
      marks();
    });
    // the card under the mouse marked on the map, and the map's dot under the mouse marks its card
    lib.addEventListener("mouseover", (e) => { const c = e.target.closest(".mm-card"); if (c) mapCtl?.hover(c.dataset.id); });
    lib.addEventListener("mouseout", (e) => { const c = e.target.closest(".mm-card"); if (c && !c.contains(e.relatedTarget)) mapCtl?.hover(null); });
  }
  // a tick changes the marks and the selection's bar only: the cards (and their pictures) stay
  function marks() {
    if (!mine) return;
    $$(".mm-card").forEach((c) => { const on = sel.has(c.dataset.id); c.classList.toggle("picked", on); const i = $(".mm-pick input", c); if (i) i.checked = on; });
    $("#mm-lib")?.classList.toggle("picking", sel.size > 0);
    const b = $("#mm-selbar");
    if (b) { b.hidden = !sel.size; $("#mm-sel-n").textContent = tn("mm.sel.count", sel.size); }
  }

  // ---- the map of the library (a computer: the Agenda's map, agendamap.js) ------------------------------------------------
  async function drawMap(maps) {
    const el = $("#mm-libmap"), gen = ++mapGen;
    if (!el || !wide()) return;
    const evs = [];
    for (const m of maps) {
      const p = await MP.position(m, fr);
      if (!p) continue;
      evs.push({ key: m.id, name: m.title || t("mm.untitled"), place: whereOf(m)[0] || m.title, date: m.day || null, ...(p[2] ? { pos: [p[0], p[1], 1] } : { gps: [p[0], p[1]] }) });
    }
    if (gen !== mapGen) return;
    const ccs = new Set(maps.map((m) => m.country).filter(Boolean));
    const cc = ccs.size === 1 && maps.every((m) => m.country) ? [...ccs][0] : "xw";
    if (!mapCtl || mapEl !== el || mapCc !== cc) {
      mapCtl?.destroy?.();
      const AM = await import("../agendamap.js");
      const opts = { onPick: (k) => go(k), onHover: (k) => $$(".mm-card").forEach((c) => c.classList.toggle("hot", c.dataset.id === k)), area: "mm.map.approx", missing: "mm.map.missing" };
      mapCtl = await AM.mount(el, cc, opts);
      mapWorld = cc === "xw" || !mapCtl;
      if (!mapCtl && cc !== "xw") mapCtl = await AM.mount(el, "xw", opts);      // (a country without an outline: the world's)
      mapEl = el; mapCc = cc;
      if (gen !== mapGen) return;
    }
    mapCtl?.show(evs, null);
    if (mapWorld) mapCtl?.fitDots();
  }

  // ---- the cards and their actions --------------------------------------------------------------------------------------
  const thumb = (m) => (m.thumb ? urlOf(m, "thumb") : m.urls ? "" : MM.mapUrl(m.id, "map", token));
  const qbtn = (k, label) => html`<button type="button" class="mm-q" data-q="${k}" title="${label}" aria-label="${label}">${icon(k)}</button>`;
  const card = (m) => {
    const dur = m.runs.reduce((s, r) => s + (r.dur || 0), 0), dist = m.runs.reduce((s, r) => s + (r.dist || 0), 0);
    const w = whereOf(m);
    if (all) {
      return html`<a class="mm-card" href="#/mes-cartes?vue=toutes&carte=${m.id}" data-id="${m.id}">
        <span class="mm-thumb">${thumb(m) ? html`<img src="${thumb(m)}" alt="" loading="lazy">` : html`<span class="mm-nothumb">${icon("folder")}</span>`}
          <span class="mm-src-tag mm-src-${m.src}">${t(`mm.adm.src.${m.src}`)}</span></span>
        <b>${m.title || t("mm.untitled")}</b>
        <span class="muted">${[m.day ? fmtDate(m.day) : "", w.slice(0, 2).join(", ")].filter(Boolean).join(" · ")}</span>
        <span class="mm-from">${t(m.src === "mymaps" ? "mm.adm.libraryOf" : "mm.adm.sentBy", { name: m.user || `#${m.uid || "?"}` })}${m.club ? html` <span class="muted">· ${m.club}</span>` : ""}</span>
        ${nRuns(m) ? html`<span class="muted">${tn("mm.count.runs", nRuns(m))}</span>` : ""}</a>`;
    }
    return html`<a class="mm-card" href="#/mes-cartes?${raw(srcHash ? `${srcHash}&` : "")}carte=${m.id}" data-id="${m.id}">
      <span class="mm-thumb"><img src="${thumb(m)}" alt="" loading="lazy">${mine && (st.links.maps[m.id] || m.private)
        ? html`<span class="mm-tag">${m.private ? html`<span title="${t("mm.f.privateTip")}">🔒</span>` : ""}${st.links.maps[m.id] ? html`<span title="${t("mm.shared.on")}">🔗</span>` : ""}</span>` : ""}
        ${mine ? html`<label class="mm-pick" title="${t("mm.sel.one")}"><input type="checkbox" data-id="${m.id}" aria-label="${t("mm.sel.one")}"></label>` : ""}
        <span class="mm-quick">${traces && m.runs.length ? qbtn("replay", t("mm.replay")) : ""}${mine ? html`${qbtn("rename", t("mm.rename"))}${qbtn("note", t("mm.note.map"))}${qbtn("delete", t("mm.delete"))}` : ""}</span>
        ${m.notes ? html`<span class="mm-has-note" title="${m.notes}">${icon("note")}</span>` : ""}</span>
      <b>${m.title || t("mm.untitled")}</b>
      <span class="muted">${[m.day ? fmtDate(m.day) : "", w.slice(0, 2).join(", ")].filter(Boolean).join(" · ")}</span>
      <span class="muted">${!traces ? (w[w.length - 1] || "") : m.runs.length ? html`${tn("mm.count.runs", m.runs.length)}${dist ? ` · ${km(dist)}` : ""}${dur ? ` · ${fmtTime(Math.round(dur))}` : ""}` : t("mm.mapOnly")}</span></a>`;
  };
  // the icons' actions — the same as the buttons of the map's page
  async function quick(k, m, btn) {
    if (!m) return;
    if (k === "replay") return replayLast(m, btn);
    if (k === "rename") return renameMap(m, () => refresh());
    if (k === "note") return noteDialog(m, () => refresh());
    if (k === "delete") return deleteMap(m, () => refresh());
  }
  async function replayLast(m, btn) {
    const r = [...m.runs].sort((a, b) => (b.start || 0) - (a.start || 0))[0];
    if (!r) return;
    if (btn) btn.disabled = true;
    try { await MM.replay(m, r, r.title || m.title || t("mm.untitledRun"), token); }
    catch (e) { console.error(e); if (btn) btn.disabled = false; alert(t("mm.replay.err")); }
  }
  async function renameMap(m, after) {
    const v = prompt(t("mm.rename.mapAsk"), m.title || "");
    if (v == null) return;
    try { Object.assign(m, (await MM.updateMap(m.id, { title: v.trim() })).map); after(); } catch (e) { alert(t("mm.err.save")); }
  }
  async function deleteMap(m, after) {
    if (!confirm(t("mm.delete.ask", { title: m.title || t("mm.untitled") }))) return;
    try { await MM.deleteMap(m.id); st.maps = st.maps.filter((x) => x.id !== m.id); sel.delete(m.id); after(); } catch (e) { alert(t("mm.err.save")); }
  }
  function noteDialog(m, after) {
    const d = dialog(html`${dlgHead(t("mm.note.map"))}<form class="stack mm-form" method="dialog">
      <p class="muted">${m.title || t("mm.untitled")}</p>
      <textarea name="notes" rows="6" maxlength="4000" placeholder="${t("mm.note.mapPh")}">${m.notes}</textarea>
      <div class="row"><button class="btn btn-primary" type="submit">${t("mm.save")}</button><button class="btn" type="button" data-close>${t("mm.cancel")}</button></div></form>`);
    $("textarea", d).focus();
    $("form", d).addEventListener("submit", async (e) => {
      e.preventDefault();
      try { Object.assign(m, (await MM.updateMap(m.id, { notes: new FormData(e.target).get("notes") })).map); d.close(); after(); } catch (err) { alert(t("mm.err.save")); }
    });
  }
  const keepScroll = (fn) => { const y = window.scrollY; fn(); window.scrollTo(0, y); };
  async function deleteSelection() {
    const ids = [...sel];
    if (!ids.length || !confirm(tn("mm.sel.deleteAsk", ids.length))) return;
    let failed = 0;
    for (const id of ids) { try { await MM.deleteMap(id); st.maps = st.maps.filter((m) => m.id !== id); sel.delete(id); } catch (e) { failed++; } }
    keepScroll(refresh);
    if (failed) alert(t("mm.err.save"));
  }
  function go(id) {
    query = { ...query, carte: id };
    replaceQuery({ ...srcQ, vue: all ? "toutes" : null, carte: id });
    draw();
    window.scrollTo(0, 0);
  }
  function back() {
    query = { ...query, carte: null };
    draw();
  }

  // ---- one map: drawn with its runs -------------------------------------------------------------------------------------
  function openMap(m) {
    mapCtl?.destroy?.(); mapCtl = null;
    const hidden = new Set();
    let colourBy = prefs.colour === "pace" ? "pace" : "run";
    $("#mm").innerHTML = html`
      ${!token || st.archive ? html`<p class="mm-back"><a href="#/mes-cartes${raw(srcHash ? `?${srcHash}` : all ? "?vue=toutes" : "")}" id="mm-back">‹ ${token ? t("mm.shared.back", { name: st.name }) : all ? t("mm.adm.title") : t("mm.title")}</a></p>` : ""}
      <div class="page-head"><div><h1>${m.title || t("mm.untitled")}</h1>
        <p class="lede meta">${[m.day ? fmtDate(m.day) : "", ...whereOf(m), m.w ? `${fmt(m.w)} × ${fmt(m.h)} px` : "", token ? t("mm.shared.by", { name: st.name }) : "",
          mine && m.private ? `🔒 ${t("mm.f.private")}` : "",
          all ? `${t(`mm.adm.src.${m.src}`)} — ${t(m.src === "mymaps" ? "mm.adm.libraryOf" : "mm.adm.sentBy", { name: m.user || `#${m.uid || "?"}` })}${m.club ? ` (${m.club})` : ""}` : ""].filter(Boolean).join(" · ")}</p></div>
        <div class="mm-acts">${all ? html`<a class="btn btn-sm" href="${urlOf(m, "map")}" download>${icon("export")} ${t("mm.adm.original")}</a>` : ""}${traces && m.runs.length ? html`<button type="button" class="btn btn-sm btn-primary" id="mm-replay">${icon("replay")} ${t("mm.replay")}</button>` : ""}
          ${mine ? html`<button type="button" class="btn btn-sm" id="mm-ren">${icon("rename")} ${t("mm.rename")}</button>
          <button type="button" class="btn btn-sm" id="mm-note">${icon("note")} ${t("mm.note.map")}</button>
          <button type="button" class="btn btn-sm" id="mm-edit">${icon("edit")} ${t("mm.edit")}</button>
          <label class="btn btn-sm" for="mm-addtrack" title="${t("mm.addTrack.tip")}">${icon("track")} ${t("mm.addTrack")}</label><input type="file" id="mm-addtrack" hidden accept="${fileAccept(MI.ACCEPT_TRACK)}">
          <button type="button" class="btn btn-sm" id="mm-mshare">${icon("share")} ${st.links.maps[m.id] ? t("mm.shared.on") : t("mm.shareMap")}</button>` : ""}
          ${all ? "" : html`<button type="button" class="btn btn-sm" id="mm-mexport">${icon("export")} ${t("mm.exportMap")}</button>`}
          ${mine ? html`<button type="button" class="btn btn-sm mm-danger" id="mm-del">${icon("delete")} ${t("mm.delete")}</button>` : ""}</div></div>
      ${m.notes ? html`<p class="mm-notes">${m.notes}</p>` : ""}
      <div class="mm-view">
        <div class="mm-map"><canvas id="mm-canvas"></canvas>
          <div class="an-tools mm-tools"><button type="button" class="btn btn-sm" id="mm-zin" title="+">+</button><button type="button" class="btn btn-sm" id="mm-zout" title="−">−</button>
            <button type="button" class="btn btn-sm" id="mm-fit" title="${t("mm.fit")}">⤢</button></div>
          <div class="mm-legend" id="mm-legend" hidden></div></div>
        <aside class="mm-side card"><div class="card-body">
          <div class="mm-side-h"><b>${t("mm.runs")}</b>
            <select id="mm-colour" aria-label="${t("mm.colour")}"><option value="run">${t("mm.colour.run")}</option><option value="pace" ${raw(colourBy === "pace" ? "selected" : "")}>${t("mm.colour.pace")}</option></select></div>
          <ul class="mm-runs" id="mm-runs"></ul>
          ${m.runs.length ? "" : all ? html`<p class="muted">${nRuns(m) ? tn("mm.adm.runsThere", nRuns(m)) : t("mm.noRuns.shared")}</p>`
            : html`<p class="muted">${t(token ? (st.traces ? "mm.noRuns.shared" : "mm.shared.noTraces") : "mm.noRuns")}</p>`}
        </div></aside>
      </div>`;
    $("#mm-back")?.addEventListener("click", (e) => { e.preventDefault(); back(); });
    const cv = $("#mm-canvas"), g = cv.getContext("2d");
    let image = null, view = null, runs = new Map();          // run id -> decoded
    // the map's size in its own pixels (what the runs are drawn in): the original's, whatever image is drawn
    let W = m.w || 0, H = m.h || 0, full = false, fetching = false;
    const colours = new Map(m.runs.map((r, i) => [r.id, MM.COLOURS[i % MM.COLOURS.length]]));
    let noteOpen = null;                                  // the run whose comment is being written
    const drawSide = () => {
      $("#mm-runs").innerHTML = html`${m.runs.map((r) => html`<li class="mm-run ${raw(hidden.has(r.id) ? "off" : "")}" data-id="${r.id}">
        <label><input type="checkbox" ${raw(hidden.has(r.id) ? "" : "checked")} data-show="${r.id}"><span class="mm-sw" style="background:${colours.get(r.id)}"></span>
          <b>${r.title || t("mm.untitledRun")}</b></label>
        <span class="muted">${[r.day ? fmtDate(r.day) : "", r.dur ? fmtTime(Math.round(r.dur)) : "", km(r.dist), pace(r.dur, r.dist)].filter((x) => x && x !== "—").join(" · ")}</span>
        <span class="muted mm-src">${t(`mm.src.${r.source}`) !== `mm.src.${r.source}` ? t(`mm.src.${r.source}`) : ""}${r.personal ? ` · ${t("mm.personal.kept")}` : ""}</span>
        ${r.note && noteOpen !== r.id ? html`<p class="mm-run-note">${r.note}</p>` : ""}
        ${mine && noteOpen === r.id ? html`<div class="mm-note-edit"><textarea id="mm-note-ta" rows="3" maxlength="1000" placeholder="${t("mm.note.ph")}">${r.note || ""}</textarea>
          <span><button type="button" class="btn btn-sm btn-primary" data-note-save="${r.id}">${t("mm.note.save")}</button> <button type="button" class="btn btn-sm" data-note-cancel>${t("mm.note.cancel")}</button></span></div>` : ""}
        <span class="mm-run-acts"><button type="button" class="btn btn-sm" data-replay="${r.id}" title="${t("mm.replay.tip")}">${icon("replay")} ${t("mm.replay")}</button>
        ${mine ? html`<button type="button" class="btn btn-ghost btn-sm" data-ren="${r.id}">${icon("rename")} ${t("mm.rename")}</button>
          <button type="button" class="btn btn-ghost btn-sm" data-note="${r.id}">${icon("note")} ${t(r.note ? "mm.note.edit" : "mm.note.add")}</button>
          <button type="button" class="btn btn-ghost btn-sm" data-rm="${r.id}">${icon("delete")} ${t("mm.remove")}</button>` : ""}</span></li>`)}`;
      // « Rejouer » (owner, 2026-11-04): the map and the run handed to « Analyse solo », played at once (MM.replayGpx)
      $$("[data-replay]").forEach((b) => b.addEventListener("click", async () => {
        const r = m.runs.find((x) => x.id === b.dataset.replay);
        b.disabled = true;
        try { await MM.replay(m, r, r.title || m.title || t("mm.untitledRun"), token); }
        catch (e) { console.error(e); b.disabled = false; alert(t("mm.replay.err")); }
      }));
      $$("[data-show]").forEach((b) => b.addEventListener("change", () => { if (b.checked) hidden.delete(b.dataset.show); else hidden.add(b.dataset.show); drawSide(); paint(); }));
      $$("[data-ren]").forEach((b) => b.addEventListener("click", async () => {
        const r = m.runs.find((x) => x.id === b.dataset.ren), v = prompt(t("mm.rename.ask"), r.title || "");
        if (v == null) return;
        try { Object.assign(r, (await MM.updateRun(r.id, { title: v.trim() })).run); drawSide(); } catch (e) { alert(t("mm.err.save")); }
      }));
      $$("[data-note]").forEach((b) => b.addEventListener("click", () => { noteOpen = b.dataset.note; drawSide(); $("#mm-note-ta")?.focus(); }));
      $("[data-note-cancel]")?.addEventListener("click", () => { noteOpen = null; drawSide(); });
      $("[data-note-save]")?.addEventListener("click", async (e) => {
        const r = m.runs.find((x) => x.id === e.currentTarget.dataset.noteSave);
        try { Object.assign(r, (await MM.updateRun(r.id, { note: $("#mm-note-ta").value })).run); noteOpen = null; drawSide(); }
        catch (err) { alert(t(err.status === 503 ? "mm.err.notReady" : "mm.err.save")); }
      });
      $$("[data-rm]").forEach((b) => b.addEventListener("click", async () => {
        if (!confirm(t("mm.remove.ask"))) return;
        try { await MM.deleteRun(b.dataset.rm); m.runs = m.runs.filter((x) => x.id !== b.dataset.rm); runs.delete(b.dataset.rm); drawSide(); paint(); } catch (e) { alert(t("mm.err.save")); }
      }));
    };
    drawSide();
    $("#mm-colour").addEventListener("change", (e) => { colourBy = prefs.colour = e.target.value; keepPrefs(); paint(); });

    // the canvas: the map at the view's zoom, the runs over it; dragged, wheeled, pinched
    const dpr = () => window.devicePixelRatio || 1;
    function sizeCv() {
      const box = cv.parentElement.getBoundingClientRect();
      cv.width = Math.round(box.width * dpr()); cv.height = Math.round(box.height * dpr());
    }
    function fit() {
      if (!image) return;
      const w = cv.width / dpr(), h = cv.height / dpr(), k = Math.min(w / W, h / H) * 0.98;
      view = { k, ox: (w - W * k) / 2, oy: (h - H * k) / 2 };
    }
    function paint() {
      if (!image || !view) return;
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.fillStyle = getComputedStyle(cv).getPropertyValue("--plane") || "#ddd";
      g.clearRect(0, 0, cv.width, cv.height);
      g.setTransform(dpr() * view.k, 0, 0, dpr() * view.k, dpr() * view.ox, dpr() * view.oy);
      g.imageSmoothingQuality = "high";
      g.drawImage(image, 0, 0, W, H);
      const shown = m.runs.filter((r) => !hidden.has(r.id) && runs.get(r.id));
      const lw = 3.2 / view.k;
      for (const r of shown) {
        const d = runs.get(r.id);
        for (const c of d.ctl) {
          g.strokeStyle = "rgba(164, 33, 160, .9)"; g.lineWidth = 2.2 / view.k;
          g.beginPath(); g.arc(c.x, c.y, 13 / view.k, 0, 2 * Math.PI); g.stroke();
        }
      }
      if (colourBy === "pace") for (const r of shown) paceRun(runs.get(r.id), lw);
      else MM.drawRuns(g, shown.map((r) => ({ ...runs.get(r.id), colour: colours.get(r.id) })), { width: lw, alpha: 0.85 });
      $("#mm-legend").hidden = colourBy !== "pace";
    }
    const PACE = ["#1a9850", "#66bd63", "#a6d96a", "#fee08b", "#fdae61", "#f46d43", "#d73027"];
    function paceRun(d, lw) {
      // each stretch of ~10 s by its speed against the run's own (fast green, slow red): read on pixels, so whatever the scale
      const sp = [];
      for (let i = 1; i < d.n; i++) { const dt = (d.ms[i] - d.ms[i - 1]) / 1000; sp.push(dt > 0 && !d.br.has(i) ? Math.hypot(d.x[i] - d.x[i - 1], d.y[i] - d.y[i - 1]) / dt : null); }
      const sm = sp.map((_, i) => { let s = 0, n = 0; for (let k = Math.max(0, i - 5); k <= Math.min(sp.length - 1, i + 5); k++) if (sp[k] != null) { s += sp[k]; n++; } return n ? s / n : null; });
      const sorted = sm.filter((v) => v != null).sort((a, b) => a - b);
      if (!sorted.length) return;
      const lo = sorted[Math.floor(sorted.length * 0.1)], hi = sorted[Math.floor(sorted.length * 0.9)] || lo + 1;
      g.save(); g.lineWidth = lw; g.lineCap = "round"; g.lineJoin = "round"; g.globalAlpha = 0.9;
      for (let i = 1; i < d.n; i++) {
        if (d.br.has(i) || sm[i - 1] == null) continue;
        const f = Math.max(0, Math.min(1, (hi - sm[i - 1]) / (hi - lo || 1)));
        g.strokeStyle = PACE[Math.round(f * (PACE.length - 1))];
        g.beginPath(); g.moveTo(d.x[i - 1], d.y[i - 1]); g.lineTo(d.x[i], d.y[i]); g.stroke();
      }
      g.restore();
    }
    $("#mm-legend").innerHTML = html`<span>${t("mm.pace.fast")}</span>${PACE.map((c) => html`<i style="background:${c}"></i>`)}<span>${t("mm.pace.slow")}</span>`;
    const zoomAt = (f, sx, sy) => {
      if (!view) return;
      const k = Math.max(0.02, Math.min(40, view.k * f)), r = k / view.k;
      view = { k, ox: sx - (sx - view.ox) * r, oy: sy - (sy - view.oy) * r };
      paint();
      // closer than the viewing copy shows: the original, read once
      if (!full && !fetching && image && view.k * dpr() * (W / image.width) > 1.3) {
        fetching = true;
        loadImage(urlOf(m, "map")).then((img) => { image = img; full = true; paint(); }).catch(() => { fetching = false; });
      }
    };
    cv.addEventListener("wheel", (e) => { e.preventDefault(); const b = cv.getBoundingClientRect(); zoomAt(Math.exp(-e.deltaY * 0.0015), e.clientX - b.left, e.clientY - b.top); }, { passive: false });
    const ptrs = new Map();
    let pinch = null;
    cv.addEventListener("pointerdown", (e) => { cv.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, [e.clientX, e.clientY]); pinch = null; });
    cv.addEventListener("pointermove", (e) => {
      if (!ptrs.has(e.pointerId) || !view) return;
      const [px, py] = ptrs.get(e.pointerId);
      ptrs.set(e.pointerId, [e.clientX, e.clientY]);
      if (ptrs.size === 2) {
        const [a, b] = [...ptrs.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]), r = cv.getBoundingClientRect();
        if (pinch) zoomAt(d / pinch, (a[0] + b[0]) / 2 - r.left, (a[1] + b[1]) / 2 - r.top);
        pinch = d;
        return;
      }
      view.ox += e.clientX - px; view.oy += e.clientY - py;
      paint();
    });
    const up = (e) => { ptrs.delete(e.pointerId); pinch = null; };
    cv.addEventListener("pointerup", up); cv.addEventListener("pointercancel", up);
    $("#mm-zin").addEventListener("click", () => zoomAt(1.4, cv.width / dpr() / 2, cv.height / dpr() / 2));
    $("#mm-zout").addEventListener("click", () => zoomAt(1 / 1.4, cv.width / dpr() / 2, cv.height / dpr() / 2));
    $("#mm-fit").addEventListener("click", () => { fit(); paint(); });
    const ro = new ResizeObserver(() => { const had = !!view; sizeCv(); if (!had) fit(); paint(); });
    ro.observe(cv.parentElement);
    viewer = { close: () => ro.disconnect() };
    sizeCv();

    (async () => {
      try {
        // the viewing copy (a map over 2 560 px), else the original — then its viewing copy made for next time (one's own, an
        // administrator's)
        const big = !W || Math.max(W, H) > MM.VIEW_MAX;
        if (big) image = await loadImage(urlOf(m, "view")).catch(() => null);
        if (!image) {
          image = await loadImage(urlOf(m, "map"), m.name);
          full = true;
          if (Math.max(image.width, image.height) > MM.VIEW_MAX && (mine || all)) {
            MM.viewCopy(image).then((v) => v && MM.putPart(m.urls ? `${m.urls}/view` : `${MM.API}/maps/${m.id}/view`, v)).catch(() => {});
          }
        }
        if (!W) { W = image.width; H = image.height; }
        fit(); paint();
      } catch (e) { $(".mm-map").insertAdjacentHTML("beforeend", html`<div class="empty">${t("mm.err.load")}</div>`.toString()); }
      await Promise.all(m.runs.map(async (r) => { try { runs.set(r.id, MM.decodeRun(await MM.getRun(r.id, token))); } catch (e) { /* drawn without it */ } }));
      paint();
    })();

    $("#mm-replay")?.addEventListener("click", (e) => replayLast(m, e.currentTarget));
    if (mine) {
      $("#mm-ren").addEventListener("click", () => renameMap(m, () => openMap(m)));
      $("#mm-note").addEventListener("click", () => noteDialog(m, () => openMap(m)));
      $("#mm-edit").addEventListener("click", () => editDialog(m));
      $("#mm-mshare").addEventListener("click", () => shareDialog({ map: m }));
      $("#mm-del").addEventListener("click", () => deleteMap(m, back));
      $("#mm-addtrack").addEventListener("change", (e) => { const f = e.target.files[0]; e.target.value = ""; if (f) addTrack(m, f); });
    }
    $("#mm-mexport")?.addEventListener("click", () => exportDialog([m]));
  }
  /** An image read from an address: a picture, else (a Tracer's PDF or OCAD map) drawn by the analyses' readers. */
  async function loadImage(url, name = "") {
    const r = await fetch(url, { credentials: "same-origin" });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const blob = await r.blob();
    try { return await createImageBitmap(blob); }
    catch (e) { return (await MI.readMap(new File([blob], name || "map", { type: blob.type })))[0].image; }
  }

  // ---- the administrators' view ---------------------------------------------------------------------------------------------
  // the libraries' tabs (owner, 2026-11-24): one's own, then each library shared with this account, then the administrators' view
  function libTabs() {
    if (link || !me || (!me.admin && !shares.from.length)) return "";
    return html`<div class="seg mm-viewswitch" role="group" aria-label="${t("mm.adm.switch")}">
      <a href="#/mes-cartes" role="button" aria-pressed="${!all && !owner}">${t("mm.adm.mine")}</a>
      ${shares.from.map((x) => html`<a href="#/mes-cartes?de=${x.uid}" role="button" aria-pressed="${owner === String(x.uid)}" title="${t("mm.grant.tab.tip", { name: x.name })}">${x.name}</a>`)}
      ${me.admin ? html`<a href="#/mes-cartes?vue=toutes" role="button" aria-pressed="${all}">${t("mm.adm.all")}</a>` : ""}</div>`;
  }
  /** Every map sent to Ozimut, in the library's shape: the collection's (c-<etag>) and the accounts' libraries' (u-<id>). */
  async function adminLibrary() {
    const r = await fetch("api/admin/maplib", { credentials: "same-origin", cache: "no-store" });
    if (!r.ok) { const e = new Error(`HTTP ${r.status}`); e.status = r.status; throw e; }
    const d = await r.json(), P = d.people || {};
    const who = (uid) => P[uid] || {};
    const maps = [
      ...d.library.map((m) => ({ ...m, id: `u-${m.id}`, uid: String(m.uid), nRuns: m.runs, runs: [], src: "mymaps", user: who(m.uid).name || "", club: who(m.uid).club || "",
        urls: `api/admin/maplib/u/${m.id}` })),
      ...d.collection.map((c) => {
        const x = c.meta || {}, p = String(x.pos || "").split(",").map(Number), ok = p.length === 2 && p.every(Number.isFinite);
        return { id: `c-${c.etag}`, title: x.title || "", day: x.day || x.up || null, place: "", notes: "", country: "", region: "", dept: "",
          lat: ok ? p[0] : null, lon: ok ? p[1] : null, w: Number(x.w) || 0, h: Number(x.h) || 0, bytes: c.size, thumb: c.thumb, runs: [], nRuns: Number(x.runs) || 0,
          src: x.src || "", uid: x.uid || "", user: x.user || who(x.uid).name || "", club: x.club || who(x.uid).club || "", name: x.name || "",
          urls: `api/admin/maplib/c/${c.etag}` };
      }),
    ];
    return { maps, gone: d.gone, links: { archive: null, maps: {}, sets: [] }, name: "" };
  }
  /** The collection brought up to date (a few maps a step), then the thumbnails the sources had none of, made here. */
  let syncing = false;
  async function syncCollection() {
    if (syncing) return;
    syncing = true;
    try {
      let left = 1, copied = 0;
      for (let i = 0; left && i < 50; i++) {
        const r = await fetch("api/admin/maplib", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ op: "sync", budget: 4 }) });
        if (!r.ok) break;
        const d = await r.json();
        left = d.left; copied += d.copied + d.gone;
        const n = $("#mm-sync");
        if (n) n.textContent = left ? t("mm.adm.syncing", { n: fmt(left) }) : "";
      }
      // what changed drawn again (the page's head says how many maps were left out); the sync is not started again (`syncing`)
      if (copied && $("#mm-lib") && !$("#mm-canvas")) { st = await adminLibrary(); await enrich(st.maps); keepScroll(drawList); }
      for (const m of st.maps.filter((x) => !x.thumb && x.urls)) {
        if (!$("#mm-lib")) break;
        try {
          const img = await loadImage(`${m.urls}/map`, m.name);
          const th = await MM.thumbnail(img);
          if ((await MM.putPart(`${m.urls}/thumb`, th)).ok) {
            m.thumb = true;
            const el = $(`.mm-card[data-id="${m.id}"] .mm-thumb`);
            if (el) { const n = $(".mm-nothumb", el); if (n) n.outerHTML = `<img src="${m.urls}/thumb" alt="">`; }
          }
          const v = await MM.viewCopy(img);
          if (v) await MM.putPart(`${m.urls}/view`, v);
          img.close?.();
        } catch (e) { console.warn("thumbnail", m.id, e); }
      }
    } finally { syncing = false; }
  }

  // « Ajouter une trace »: on a georeferenced map the track is placed at once; else « Analyse solo » calibrates it, and its
  // « Export › Enregistrer dans Mes cartes » adds it to this map (the same image: the same map)
  async function addTrack(m, file) {
    let tr;
    try { tr = await MI.readTrack(file); } catch (e) { alert(t(e.message === "time" ? "mm.track.time" : "mm.track.bad")); return; }
    if (m.geo) {
      try {
        const run = MI.runOn(tr.track, m.geo, m.w, m.h, file.name.replace(/\.[a-z0-9]+$/i, ""));
        const personal = run.personal && confirm(t("mm.track.personalAsk"));
        const { runs } = await saveRuns(m, [run], personal);
        m.runs.push(...runs);
        if (!m.day) m.day = run.day;
        openMap(m);
      } catch (e) { alert(t(e.message === "outside" ? "mm.track.outside" : e.message === "quota" ? "mm.quota.full" : "mm.err.save")); }
      return;
    }
    if (!confirm(t("mm.track.calibrate"))) return;
    const blob = await (await fetch(MM.mapUrl(m.id, "map", token), { credentials: "same-origin" })).blob();
    const ext = /png/.test(blob.type) ? "png" : /webp/.test(blob.type) ? "webp" : "jpg";
    await (await import("../pwa.js")).toSolo([new File([blob], MM.fileName(m.title, m.day, ext), { type: blob.type }), file]);
  }
  /** Runs added to a map kept: through MM.save, which finds the map by its image. */
  async function saveRuns(m, runs, personal) {
    const blob = await (await fetch(MM.mapUrl(m.id, "map"), { credentials: "same-origin" })).blob();
    const image = await createImageBitmap(blob);
    try { return await MM.save({ blob, name: `map.${blob.type.split("/")[1] || "jpg"}`, image, title: m.title, day: m.day, geo: m.geo, runs }, { personal }); }
    finally { image.close?.(); }
  }

  // ---- dialogs -----------------------------------------------------------------------------------------------------------
  function dialog(inner, { wide: w = false } = {}) {
    const d = document.createElement("dialog");
    d.className = `mm-dlg${w ? " wide" : ""}`;
    d.innerHTML = String(inner);
    document.body.append(d);
    d.addEventListener("close", () => d.remove());
    d.addEventListener("click", (e) => { if (e.target === d && !d.dataset.busy) d.close(); });
    d.addEventListener("cancel", (e) => { if (d.dataset.busy) e.preventDefault(); });
    $$("[data-close]", d).forEach((b) => b.addEventListener("click", () => d.close()));
    d.showModal();
    return d;
  }
  /** « Carte privée » (owner, 2026-11-06): nobody else sees the map, the administrators included; off by default. */
  const privBox = (on, id = "", label = "mm.f.private") => (st.privateReady === false ? "" : html`<label class="mm-check" title="${t("mm.f.privateTip")}"><input type="checkbox" name="private" ${raw(id ? `id="${id}"` : "")} ${raw(on ? "checked" : "")}>
    <span>${t(label)} <span class="muted">— ${t("mm.f.privateTip")}</span></span></label>`);
  const dlgHead = (title) => html`<div class="mm-dlg-h"><b>${title}</b><button type="button" class="btn btn-ghost btn-sm" data-close aria-label="${t("mm.close")}">✕</button></div>`;

  /**
   * The place's fields — country, then region and département: in France the régions and départements as lists (a
   * département chosen sets its région), elsewhere names typed, those of the library offered — in `box`. -> { value() }.
   */
  function placeFields(box, init = {}) {
    const v = { country: init.country || "", region: init.region || "", dept: init.dept || "" };
    const known = (k) => [...new Set(st.maps.filter((m) => m.country === v.country && m[k]).map((m) => m[k]))].sort(coll.compare);
    const draw = () => {
      const isFr = v.country === "FR";
      const depts = isFr ? fr.depts.filter((d) => !v.region || d.region === v.region || d.code === v.dept) : [];
      box.innerHTML = html`<label class="field"><span>${t("mm.f.country")}</span><select name="country"><option value="">—</option>
          ${MP.countryList().map(([c, n]) => html`<option value="${c}" ${raw(c === v.country ? "selected" : "")}>${n}</option>`)}</select></label>
        <div class="mm-row2"><label class="field"><span>${t("mm.f.region")}</span>${isFr
          ? html`<select name="region"><option value="">—</option>${fr.regions.map((r) => html`<option ${raw(r.name === v.region ? "selected" : "")}>${r.name}</option>`)}</select>`
          : html`<input name="region" maxlength="120" value="${v.region}" list="mm-dl-region"><datalist id="mm-dl-region">${known("region").map((x) => html`<option value="${x}">`)}</datalist>`}</label>
        <label class="field"><span>${t("mm.f.dept")}</span>${isFr
          ? html`<select name="dept"><option value="">—</option>${depts.map((d) => html`<option value="${d.code}" ${raw(d.code === v.dept ? "selected" : "")}>${d.code} ${d.name}</option>`)}</select>`
          : html`<input name="dept" maxlength="120" value="${v.dept}" list="mm-dl-dept"><datalist id="mm-dl-dept">${known("dept").map((x) => html`<option value="${x}">`)}</datalist>`}</label></div>`;
      $("[name=country]", box).addEventListener("change", (e) => { v.country = e.target.value; v.region = ""; v.dept = ""; draw(); });
      $("[name=region]", box).addEventListener(isFr ? "change" : "input", (e) => { v.region = e.target.value; if (isFr) { if (v.dept && fr.depts.find((d) => d.code === v.dept)?.region !== v.region) v.dept = ""; draw(); } });
      $("[name=dept]", box).addEventListener(isFr ? "change" : "input", (e) => {
        v.dept = e.target.value;
        if (isFr && v.dept) { v.region = fr.depts.find((d) => d.code === v.dept)?.region || v.region; draw(); }
      });
    };
    draw();
    return { value: () => ({ ...v }), set: (o) => { Object.assign(v, o); draw(); } };
  }

  function editDialog(m) {
    const d = dialog(html`${dlgHead(t("mm.edit"))}<form class="stack mm-form" method="dialog">
      <label class="field"><span>${t("mm.f.title")}</span><input name="title" maxlength="200" value="${m.title}"></label>
      <label class="field"><span>${t("mm.f.day")}</span><input name="day" type="date" value="${m.day || ""}"></label>
      <label class="field"><span>${t("mm.f.place")}</span><input name="place" maxlength="200" value="${m.place}" placeholder="${t("mm.f.place.ph")}"></label>
      <div class="stack mm-form" id="mm-ed-place"></div>
      <label class="field"><span>${t("mm.f.notes")}</span><textarea name="notes" rows="4" maxlength="4000">${m.notes}</textarea></label>
      ${privBox(m.private)}
      <div class="row"><button class="btn btn-primary" type="submit">${t("mm.save")}</button><button class="btn" type="button" data-close>${t("mm.cancel")}</button></div></form>`);
    const pl = placeFields($("#mm-ed-place", d), m);
    $("form", d).addEventListener("submit", async (e) => {
      e.preventDefault();
      const f = new FormData(e.target);
      try {
        const { map } = await MM.updateMap(m.id, { title: f.get("title"), day: f.get("day") || null, place: f.get("place"), notes: f.get("notes"), ...pl.value(), private: !!f.get("private") });
        Object.assign(m, map); d.close(); openMap(m);
      } catch (err) { alert(t("mm.err.save")); }
    });
  }

  // ---- « Nouvelle carte » (owner, 2026-11-06): a map in any format, a GPS track if one wishes, what the files do not say asked
  function newMapDialog(given = []) {
    const d = dialog(html`${dlgHead(t("mm.new.title"))}<form class="stack mm-form" id="mm-nf" novalidate>
      <p class="muted">${t("mm.new.text")}</p>
      <div class="mm-pickers">
        <div class="mm-drop2" data-drop="map"><b>${t("mm.new.map")}</b><span class="muted" id="mm-nf-map">${t("mm.new.map.hint")}</span>
          <label class="btn btn-sm" for="mm-nf-mapin">${t("mm.new.choose")}</label><input type="file" id="mm-nf-mapin" hidden multiple accept="${fileAccept(`${MI.ACCEPT},.jgw,.pgw,.tfw,.wld,.prj`)}"></div>
        <div class="mm-drop2" data-drop="track"><b>${t("mm.new.track")}</b><span class="muted" id="mm-nf-track">${t("mm.new.track.hint")}</span>
          <label class="btn btn-sm" for="mm-nf-trackin">${t("mm.new.choose")}</label><input type="file" id="mm-nf-trackin" hidden accept="${fileAccept(MI.ACCEPT_TRACK)}"></div>
      </div>
      <div class="mm-nf-prev" id="mm-nf-prev" hidden><canvas id="mm-nf-cv"></canvas><span class="muted" id="mm-nf-info"></span></div>
      <label class="field"><span>${t("mm.f.title")} *</span><input name="title" maxlength="200" required></label>
      <div class="mm-row2"><label class="field"><span>${t("mm.f.day")}</span><input name="day" type="date"></label>
        <label class="field"><span>${t("mm.f.place")}</span><input name="place" maxlength="200" placeholder="${t("mm.f.place.ph")}"></label></div>
      <div class="stack mm-form" id="mm-nf-place"></div>
      <label class="field"><span>${t("mm.f.notes")}</span><textarea name="notes" rows="2" maxlength="4000"></textarea></label>
      ${privBox(false)}
      <label class="mm-check" id="mm-nf-pers" hidden><input type="checkbox" name="personal"> ${t("mm.personal.ask")}</label>
      <div class="notice" id="mm-nf-err" hidden></div>
      <div class="row"><button class="btn btn-primary" type="submit" id="mm-nf-go" disabled>${t("mm.new.save")}</button><button class="btn" type="button" data-close>${t("mm.cancel")}</button>
        <span class="muted" id="mm-nf-state"></span></div></form>`, { wide: true });
    const f = $("#mm-nf", d), err = $("#mm-nf-err", d);
    const pl = placeFields($("#mm-nf-place", d), { country: prefs.country || "" });
    let entry = null, track = null;
    const say = (k, vars) => { err.textContent = k ? t(k, vars) : ""; err.hidden = !k; };
    const fill = (name, val) => { const i = f.elements[name]; if (i && !i.value && val) i.value = val; };
    const located = (lat, lon) => {
      const cur = pl.value();
      if (cur.region || cur.dept) return;
      const at = MP.frAt(fr, lat, lon);
      if (at) pl.set({ country: "FR", region: at.region, dept: at.dept });
    };
    async function takeMap(files) {
      say(null);
      const main = files.find((x) => MI.MAP_EXT.test(x.name)) || files[0];
      if (!main) return;
      $("#mm-nf-map", d).textContent = t("mm.imp.reading");
      try {
        const world = files.find((x) => /\.(jgw|pgw|tfw|gfw|bpw|wld|jpgw|pngw|tifw)$/i.test(x.name)), prj = files.find((x) => /\.prj$/i.test(x.name));
        const es = await MI.readMap(main, { world, prj });
        entry = es[0];
        const dn = MI.dayIn(entry.title);
        fill("title", dn?.rest || entry.title); fill("day", entry.day || dn?.day); fill("place", entry.place);
        $("#mm-nf-map", d).textContent = `${main.name} · ${fmt(entry.image.width)} × ${fmt(entry.image.height)} px`;
        $("#mm-nf-info", d).textContent = [t(entry.geo ? "mm.new.geo" : "mm.new.noGeo"), entry.runs?.length ? tn("mm.count.runs", entry.runs.length) : ""].filter(Boolean).join(" · ");
        const cv = $("#mm-nf-cv", d), k = Math.min(1, 280 / entry.image.width, 200 / entry.image.height);
        cv.width = Math.round(entry.image.width * k); cv.height = Math.round(entry.image.height * k);
        cv.getContext("2d").drawImage(entry.image, 0, 0, cv.width, cv.height);
        $("#mm-nf-prev", d).hidden = false;
        if (entry.geo) { const c = MM.toLatLon(entry.geo, entry.image.width / 2, entry.image.height / 2); located(c.lat, c.lon); }
      } catch (e) {
        entry = null;
        $("#mm-nf-map", d).textContent = main.name;
        if (e.message === "newer") say("mm.imp.newer");
        else if (["unknown", "map", "pdf"].includes(e.message)) say("mm.new.badMap");
        else { err.textContent = e.message; err.hidden = false; }          // (a TIFF's own message)
      }
      check();
    }
    async function takeTrack(file) {
      say(null);
      try {
        track = { file, ...(await MI.readTrack(file)) };
        $("#mm-nf-track", d).textContent = `${file.name} · ${fmtDate(track.day)} · ${km(track.track.cum[track.track.n - 1])}`;
        fill("day", track.day);
        located(track.start[0], track.start[1]);
        $("#mm-nf-pers", d).hidden = !Object.keys(track.track.ch).some((c) => ["hr", "ele", "cad"].includes(c));
      } catch (e) { track = null; $("#mm-nf-track", d).textContent = file.name; say(e.message === "time" ? "mm.track.time" : "mm.track.bad"); }
      check();
    }
    const check = () => { $("#mm-nf-go", d).disabled = !entry; };
    $("#mm-nf-mapin", d).addEventListener("change", (e) => { const fs = [...e.target.files]; e.target.value = ""; if (fs.length) takeMap(fs); });
    $("#mm-nf-trackin", d).addEventListener("change", (e) => { const x = e.target.files[0]; e.target.value = ""; if (x) takeTrack(x); });
    // files dropped on the dialog: the tracks to the track, the rest to the map
    d.addEventListener("dragover", (e) => { if ([...(e.dataTransfer?.types || [])].includes("Files")) e.preventDefault(); });
    d.addEventListener("drop", (e) => {
      e.preventDefault();
      const fs = [...(e.dataTransfer?.files || [])], tr = fs.find((x) => MI.TRACK_EXT.test(x.name)), rest = fs.filter((x) => x !== tr);
      if (rest.length) takeMap(rest);
      if (tr) takeTrack(tr);
    });
    if (given.length) {
      const tr = given.find((x) => MI.TRACK_EXT.test(x.name)), rest = given.filter((x) => x !== tr);
      if (rest.length) takeMap(rest);
      if (tr) takeTrack(tr);
    }
    f.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (!entry) return;
      const fd = new FormData(f), place = pl.value();
      if (!String(fd.get("title") || "").trim()) { say("mm.new.needTitle"); f.elements.title.focus(); return; }
      if (!place.country) { say("mm.new.needCountry"); $("[name=country]", d).focus(); return; }
      const runs = [...(entry.runs || [])];
      let pos = null, late = false;
      if (track) {
        if (entry.geo) {
          try { runs.push(MI.runOn(track.track, entry.geo, entry.image.width, entry.image.height, String(fd.get("title")))); }
          catch (er) { say("mm.track.outside"); return; }
        } else { pos = track.start; late = true; }
      }
      const btn = $("#mm-nf-go", d);
      btn.disabled = true; d.dataset.busy = "1";
      $("#mm-nf-state", d).innerHTML = `${bar(null)} ${t("mm.new.saving")}`;
      try {
        const r = await MM.save({ ...entry, title: String(fd.get("title")).trim(), day: fd.get("day") || null, place: String(fd.get("place") || ""), notes: String(fd.get("notes") || ""),
          ...place, pos, runs, private: !!fd.get("private") }, { personal: !!fd.get("personal") });
        prefs.country = place.country; keepPrefs();
        st = await MM.list();
        delete d.dataset.busy;
        if (late && confirm(t("mm.track.calibrate"))) {
          d.close();
          const ext = /png/.test(entry.blob.type) ? "png" : /webp/.test(entry.blob.type) ? "webp" : "jpg";
          await (await import("../pwa.js")).toSolo([new File([entry.blob], MM.fileName(String(fd.get("title")), fd.get("day"), ext), { type: entry.blob.type }), track.file]);
          return;
        }
        d.close();
        go(r.map.id);
      } catch (er) {
        delete d.dataset.busy; btn.disabled = false; $("#mm-nf-state", d).textContent = "";
        say(er.message === "quota" ? "mm.quota.full" : er.status === 413 ? "mm.err.size" : er.status === 503 ? "mm.err.notReady" : "mm.err.save");
      }
    });
  }

  // ---- « Importer un dossier » (owner, 2026-11-06) ------------------------------------------------------------------------
  const FORMAT_TREE = () => [
    [0, t("mm.fmt.root"), t("mm.fmt.root.n")],
    [1, "France/", t("mm.fmt.country")],
    [2, "77 - Seine-et-Marne/", t("mm.fmt.frDept")],
    [3, "Fontainebleau/", t("mm.fmt.place")],
    [4, "Apremont N.png", t("mm.fmt.map")],
    [4, "Apremont N.gpx", t("mm.fmt.track")],
    [3, "Bois Rond 2023-05-14.pdf", t("mm.fmt.date")],
    [1, `${MP.countryName("ES")}/`, t("mm.fmt.country2")],
    [2, "Madrid/", t("mm.fmt.region")],
    [3, "La Cabrera.jpg", t("mm.fmt.map2")],
  ];
  const formatHtml = () => html`<div class="mm-fmt"><b>${t("mm.fmt.title")}</b>
    <div class="mm-tree">${FORMAT_TREE().map(([lv, name, note]) => html`<div class="mm-tree-l" style="padding-left:${lv * 18}px"><code>${name}</code><span class="muted">${note}</span></div>`)}</div>
    <ul class="mm-rules">${["country", "level2", "deeper", "name", "track", "formats"].map((k) => html`<li>${t(`mm.fmt.rule.${k}`)}</li>`)}</ul></div>`;
  function folderDialog(list = null) {
    const d = dialog(html`${dlgHead(t("mm.folder.title"))}<div class="stack mm-form" id="mm-fd">
      <p>${t("mm.folder.text")}</p>
      ${formatHtml()}
      <div class="mm-drop2 mm-drop-folder"><b>${t("mm.folder.pick")}</b><span class="muted">${t("mm.folder.pick.hint")}</span>
        <label class="btn btn-primary btn-sm" for="mm-fd-in">${icon("folder")} ${t("mm.folder.choose")}</label>
        <input type="file" id="mm-fd-in" hidden webkitdirectory directory multiple></div>
      <div id="mm-fd-out"></div></div>`, { wide: true });
    const out = $("#mm-fd-out", d);
    $("#mm-fd-in", d).addEventListener("change", (e) => { const fs = MI.filesOfInput(e.target.files); e.target.value = ""; if (fs.length) review(fs); });
    d.addEventListener("dragover", (e) => { if ([...(e.dataTransfer?.types || [])].includes("Files")) e.preventDefault(); });
    d.addEventListener("drop", async (e) => { e.preventDefault(); if (d.dataset.busy) return; const fs = await MI.filesOfDrop(e.dataTransfer); if (fs.length) review(fs); });
    if (list) review(list);

    // what the folder holds, read from its paths: the maps ready, each file that does not follow the format and why
    function review(files) {
      const p = MI.plan(files, fr);
      const known = new Set(st.maps.map((m) => m.sha));
      const byCountry = new Map();
      for (const m of p.maps) byCountry.set(m.country, (byCountry.get(m.country) || 0) + 1);
      const withTracks = p.maps.filter((m) => m.tracks.length).length;
      const groups = new Map();
      for (const e of p.errors) { const k = `${e.code}|${e.arg || ""}`; if (!groups.has(k)) groups.set(k, { ...e, paths: [] }); groups.get(k).paths.push(e.path); }
      const errText = (g) => t(`mm.folder.err.${g.code}`, { name: g.arg || "" });
      const errHelp = (g) => t(`mm.folder.fix.${g.code}`, { name: g.arg || "" });
      const pathList = (paths) => html`<ul class="mm-paths">${paths.slice(0, 12).map((x) => html`<li>${x}</li>`)}${paths.length > 12 ? html`<li class="muted">${t("mm.folder.more", { n: fmt(paths.length - 12) })}</li>` : ""}</ul>`;
      const big = p.maps.filter((m) => m.file.size > 80 * 1024 * 1024);
      const ready = p.maps.filter((m) => !big.includes(m));
      const bytes = ready.reduce((s, m) => s + m.file.size, 0);
      out.innerHTML = html`
        ${p.root ? html`<p class="muted">${t("mm.folder.root", { name: p.root })}</p>` : ""}
        ${st.quota?.limit && bytes > st.quota.limit - st.quota.used ? html`<div class="notice">${t("mm.quota.folder", { size: size(bytes), left: size(Math.max(0, st.quota.limit - st.quota.used)) })}</div>` : ""}
        ${ready.length ? html`<div class="mm-ok"><b>✓ ${tn("mm.folder.ready", ready.length)}</b> <span class="muted">(${size(bytes)}${withTracks ? ` · ${tn("mm.folder.withTracks", withTracks)}` : ""})</span>
          <div class="muted">${[...byCountry].sort((a, b) => b[1] - a[1]).map(([c, n]) => `${MP.countryName(c)} ${fmt(n)}`).join(" · ")}</div></div>`
        : html`<div class="notice">${t("mm.folder.none")}</div>`}
        ${groups.size || big.length ? html`<div class="mm-errs"><b>✗ ${tn("mm.folder.errors", p.errors.length + big.length)}</b>
          ${[...groups.values()].map((g) => html`<details class="mm-err"><summary><b>${errText(g)}</b> <span class="muted">— ${tn("mm.folder.files", g.paths.length)}</span></summary>
            <p>${errHelp(g)}</p>${pathList(g.paths)}</details>`)}
          ${big.length ? html`<details class="mm-err"><summary><b>${t("mm.folder.err.big")}</b> <span class="muted">— ${tn("mm.folder.files", big.length)}</span></summary>
            <p>${t("mm.folder.fix.big")}</p>${pathList(big.map((m) => m.path))}</details>` : ""}</div>` : ""}
        ${p.dups.length ? html`<details class="mm-err mm-ign"><summary>${tn("mm.folder.dups", p.dups.length)}</summary><p class="muted">${t("mm.folder.dups.why")}</p>${pathList(p.dups)}</details>` : ""}
        ${p.ignored.length ? html`<details class="mm-err mm-ign"><summary>${tn("mm.folder.ignored", p.ignored.length)}</summary><p class="muted">${t("mm.folder.ignored.why")}</p>${pathList(p.ignored)}</details>` : ""}
        ${ready.length ? html`${privBox(false, "mm-fd-priv", "mm.folder.private")}${withTracks ? html`<label class="mm-check"><input type="checkbox" id="mm-fd-pers"> ${t("mm.personal.ask")}</label>` : ""}
          <div class="row"><button type="button" class="btn btn-primary" id="mm-fd-go">${tn("mm.folder.go", ready.length)}</button>
          <button type="button" class="btn" data-close>${t("mm.cancel")}</button></div>` : ""}`;
      $$("[data-close]", out).forEach((b) => b.addEventListener("click", () => d.close()));
      $("#mm-fd-go", out)?.addEventListener("click", () => run(ready, known, !!$("#mm-fd-pers", out)?.checked, p.errors.length + big.length, !!$("#mm-fd-priv", out)?.checked));
    }

    // the maps sent one after the other, a bar, « Arrêter »; then what was done and what was not, file by file
    async function run(list2, known, personal, refused, priv = false) {
      d.dataset.busy = "1";
      let stop = false;
      const res = { saved: 0, known: 0, failed: [], notes: [] };
      out.innerHTML = html`<div class="stack mm-form"><div>${raw(bar(0, "mm-fd-bar"))}</div><span id="mm-fd-now" class="muted"></span>
        <div class="row"><button type="button" class="btn" id="mm-fd-stop">${t("mm.folder.stop")}</button></div></div>`;
      $("#mm-fd-stop", out).addEventListener("click", () => { stop = true; $("#mm-fd-stop", out).disabled = true; });
      for (const [i, m] of list2.entries()) {
        if (stop) break;
        $("#mm-fd-now", out).textContent = t("mm.folder.now", { i: fmt(i + 1), n: fmt(list2.length), path: m.path });
        setBar($(".mm-fd-bar", out), i / list2.length);
        try {
          const r = await MI.importOne(m, known, { personal, priv });
          if (r.status === "known") res.known++; else { res.saved++; if (r.map?.sha) known.add(r.map.sha); }
          for (const n of r.notes) res.notes.push({ path: m.path, ...n });
        } catch (e) {
          console.error(m.path, e);
          res.failed.push({ path: m.path, why: e.message === "quota" ? t("mm.quota.full") : e.status === 413 ? t("mm.err.size") : e.status === 429 ? t("mm.folder.rate") : e.status === 503 ? t("mm.err.notReady")
            : ["unknown", "map", "pdf"].includes(e.message) ? t("mm.folder.unreadable") : e.status ? t("mm.err.save") : e.message || t("mm.folder.unreadable") });
          if (e.status === 429 || e.status === 503 || e.message === "quota") break;
        }
      }
      delete d.dataset.busy;
      st = await MM.list().catch(() => st);
      const noteText = (n) => t(`mm.folder.note.${n.code}`, { file: n.file });
      out.innerHTML = html`<div class="stack mm-form">
        <div class="mm-ok"><b>${tn("mm.folder.done", res.saved)}</b>${res.known ? html` <span class="muted">· ${tn("mm.folder.known", res.known)}</span>` : ""}
          ${stop ? html` <span class="muted">· ${t("mm.folder.stopped")}</span>` : ""}${refused ? html` <span class="muted">· ${tn("mm.folder.refused", refused)}</span>` : ""}</div>
        ${res.failed.length ? html`<div class="mm-errs"><b>✗ ${tn("mm.folder.failed", res.failed.length)}</b><ul class="mm-paths">${res.failed.map((x) => html`<li>${x.path} — ${x.why}</li>`)}</ul></div>` : ""}
        ${res.notes.length ? html`<div class="mm-errs mm-warn"><b>${tn("mm.folder.notes", res.notes.length)}</b><ul class="mm-paths">${res.notes.map((n) => html`<li>${n.path} — ${noteText(n)}</li>`)}</ul></div>` : ""}
        <div class="row"><button type="button" class="btn btn-primary" data-close>${t("mm.close")}</button></div></div>`;
      $$("[data-close]", out).forEach((b) => b.addEventListener("click", () => d.close()));
      d.addEventListener("close", () => { if (!$("#mm-canvas")) drawList(); }, { once: true });
    }
  }

  // A link (owner, 2026-11-01): to the whole library ({}), one map ({ map }) or a selection ({ ids }); it shares the maps with the
  // routes run on them or the maps alone, chosen before the link is made and changed on the link kept (same address). The
  // library's dialog also lists the other links made, each to copy or delete.
  const sameSet = (a, b) => a.length === b.length && [...a].sort().join() === [...b].sort().join();
  /** The library's dialog: the accounts it is shared with (each with or without the routes, removed), the invitations waiting, and
   *  a new invitation — a link for one person, used once, valid 7 days (owner, 2026-11-24: invitations, not a search of accounts). */
  function bindPeople(d) {
    const label = (x) => html`<span><b>${x.name}</b>${x.club ? html` <span class="muted">· ${x.club}</span>` : ""}</span>`;
    const what = (on) => t(on ? "mm.links.withTraces" : "mm.links.mapOnly");
    let made = null;                                   // the link just made: shown until the dialog closes
    const draw = () => {
      $("#mm-grants", d).innerHTML = html`${shares.to.map((g) => html`<li>${label(g)}<span class="row">
          <select data-gtr="${g.uid}" aria-label="${t("mm.share.what")}"><option value="1">${what(true)}</option>
            <option value="0" ${raw(g.traces ? "" : "selected")}>${what(false)}</option></select>
          <button type="button" class="btn btn-ghost btn-sm mm-danger" data-gdel="${g.uid}">${t("mm.grant.remove")}</button></span></li>`)}
        ${(shares.invites || []).map((v) => html`<li><span>${t("mm.grant.pending")} <span class="muted">· ${what(v.traces)} · ${t("mm.grant.until", { date: fmtDate(v.expires.slice(0, 10)) })}</span></span>
          <button type="button" class="btn btn-ghost btn-sm mm-danger" data-gcancel="${v.id}">${t("mm.grant.cancel")}</button></li>`)}
        ${!shares.to.length && !(shares.invites || []).length ? html`<li class="muted">${t("mm.grant.none")}</li>` : ""}`;
      $("#mm-inv", d).innerHTML = made ? html`<div class="mm-link"><input readonly value="${inviteUrl(made)}" id="mm-inv-url" aria-label="${t("mm.grant.made")}">
          <button type="button" class="btn btn-sm btn-primary" id="mm-inv-copy">${t("mm.copy")}</button></div><p class="muted">${t("mm.grant.made")}</p>
          <div class="row"><button type="button" class="btn btn-sm" id="mm-inv-again">${t("mm.grant.another")}</button></div>`
        : html`<div class="row"><select id="mm-inv-tr" aria-label="${t("mm.share.what")}"><option value="1">${what(true)}</option><option value="0">${what(false)}</option></select>
          <button type="button" class="btn btn-sm btn-primary" id="mm-inv-make">${t("mm.grant.invite")}</button></div>`;
      $$("[data-gtr]", d).forEach((x) => x.addEventListener("change", () => act(() => MM.setShare(Number(x.dataset.gtr), true, x.value === "1"))));
      $$("[data-gdel]", d).forEach((b) => b.addEventListener("click", () => act(() => MM.setShare(Number(b.dataset.gdel), false))));
      $$("[data-gcancel]", d).forEach((b) => b.addEventListener("click", () => act(() => MM.cancelInvite(b.dataset.gcancel))));
      $("#mm-inv-make", d)?.addEventListener("click", () => act(async () => {
        const r = await MM.invite($("#mm-inv-tr", d).value === "1");
        made = r.token;
        return r;
      }));
      $("#mm-inv-again", d)?.addEventListener("click", () => { made = null; draw(); });
      $("#mm-inv-copy", d)?.addEventListener("click", async (e) => {
        try { await navigator.clipboard.writeText($("#mm-inv-url", d).value); e.currentTarget.textContent = t("mm.copied"); } catch (err) { $("#mm-inv-url", d).select(); }
      });
    };
    const act = async (fn) => {
      try { const r = await fn(); if (r.to) shares.to = r.to; if (r.from) shares.from = r.from; if (r.invites) shares.invites = r.invites; draw(); }
      catch (e) { alertBox(t(e.status === 503 ? "mm.err.notReady" : e.status === 409 ? "mm.grant.tooMany" : "mm.err.save")); }
    };
    draw();
  }
  function shareDialog(target) {
    const m = target.map || null, ids = target.ids || null;
    const cur = () => (m ? st.links.maps[m.id] : ids ? st.links.sets.find((x) => sameSet(x.maps, ids)) : st.links.archive);
    let withTraces = cur()?.traces ?? true;
    const scopeMaps = m ? [m] : ids ? ids.map(byId).filter(Boolean) : st.maps;
    // a QuickRoute map carries its route in the picture itself: shared alone, the route still shows
    const painted = scopeMaps.some((x) => x.runs.some((r) => r.source === "quickroute"));
    const lib = !m && !ids;
    // the whole library with the accounts one invites (owner, 2026-11-24), then by a link
    const d = dialog(html`${dlgHead(t(m ? "mm.shareMap" : ids ? "mm.sel.share" : "mm.shareLib"))}${lib ? html`<div class="stack mm-form mm-people">
        <b>${t("mm.grant.title")}</b><p class="muted">${t("mm.grant.text")}</p>
        <ul class="mm-grants" id="mm-grants"></ul>
        <div class="stack" id="mm-inv"></div></div>
      <div class="mm-sep"><b>${t("mm.grant.byLink")}</b></div>` : ""}<div class="stack mm-form" id="mm-sh"></div>`);
    if (lib) bindPeople(d);
    const body = () => (m ? { map: m.id } : ids ? { maps: ids } : { map: null });
    const keep = (r) => {
      const v = r.token ? { token: r.token, traces: r.traces } : null;
      if (m) { if (v) st.links.maps[m.id] = v; else delete st.links.maps[m.id]; }
      else if (ids) { st.links.sets = st.links.sets.filter((x) => !sameSet(x.maps, ids)); if (v) st.links.sets.push({ ...v, maps: [...ids] }); }
      else st.links.archive = v;
    };
    const copyBtn = (url) => html`<button type="button" class="btn btn-sm" data-copy="${url}">${t("mm.copy")}</button>`;
    const others = () => {
      if (m || ids) return "";
      const rows = [...Object.entries(st.links.maps).filter(([id]) => byId(id)).map(([id, l]) => ({ l, url: shareUrl(l.token, id), what: t("mm.links.map", { title: byId(id).title || t("mm.untitled") }) })),
        ...st.links.sets.map((l) => ({ l, url: shareUrl(l.token), what: tn("mm.links.set", l.maps.filter(byId).length) }))];
      return rows.length ? html`<div class="mm-others"><b>${t("mm.links.others")}</b><ul>${rows.map((r) => html`<li><span>${r.what}
        <span class="muted">· ${t(r.l.traces ? "mm.links.withTraces" : "mm.links.mapOnly")}</span></span>
        <span class="row">${copyBtn(r.url)}<button type="button" class="btn btn-ghost btn-sm mm-danger" data-revoke="${r.l.token}">${t("mm.share.off")}</button></span></li>`)}</ul></div>` : "";
    };
    const fill = () => {
      const link = cur();
      $("#mm-sh", d).innerHTML = html`<p>${m ? t("mm.share.mapText") : ids ? tn("mm.share.selText", ids.length) : t("mm.share.allText")}</p>
        <fieldset class="mm-what"><legend>${t("mm.share.what")}</legend>
          <label class="mm-check"><input type="radio" name="mm-what" value="1" ${raw(withTraces ? "checked" : "")}> <span>${t("mm.share.withTraces")}</span></label>
          <label class="mm-check"><input type="radio" name="mm-what" value="0" ${raw(withTraces ? "" : "checked")}> <span>${t("mm.share.mapOnly")}</span></label>
          ${painted ? html`<p class="muted">${t("mm.share.qrNote")}</p>` : ""}</fieldset>
        ${link ? html`<div class="mm-link"><input readonly value="${shareUrl(link.token, m?.id)}" id="mm-url"><button type="button" class="btn btn-sm btn-primary" id="mm-copy">${t("mm.copy")}</button></div>
          <p class="muted">${t(link.traces ? "mm.share.who" : "mm.share.whoMap")}</p>
          <div class="row"><button type="button" class="btn btn-sm mm-danger" id="mm-off">${t("mm.share.off")}</button></div>`
        : html`<p class="muted">${t("mm.share.private")}</p><div class="row"><button type="button" class="btn btn-primary" id="mm-on">${t("mm.share.make")}</button></div>`}
        ${others()}`;
      const copy = async (b, text) => { try { await navigator.clipboard.writeText(text); b.textContent = t("mm.copied"); } catch (e) { /* select it by hand */ } };
      $("#mm-copy", d)?.addEventListener("click", (e) => copy(e.currentTarget, $("#mm-url", d).value));
      $$("[data-copy]", d).forEach((b) => b.addEventListener("click", () => copy(b, b.dataset.copy)));
      const set = async (on) => {
        try { keep(await MM.setLink({ ...body(), on, traces: withTraces })); fill(); } catch (e) { alert(t("mm.err.save")); }
      };
      $$('input[name="mm-what"]', d).forEach((r) => r.addEventListener("change", () => { withTraces = r.value === "1"; if (cur()) set(true); }));
      $("#mm-on", d)?.addEventListener("click", () => set(true));
      $("#mm-off", d)?.addEventListener("click", () => set(false));
      $$("[data-revoke]", d).forEach((b) => b.addEventListener("click", async () => {
        try {
          await MM.setLink({ token: b.dataset.revoke, on: false });
          for (const [id, l] of Object.entries(st.links.maps)) if (l.token === b.dataset.revoke) delete st.links.maps[id];
          st.links.sets = st.links.sets.filter((x) => x.token !== b.dataset.revoke);
          fill();
        } catch (e) { alert(t("mm.err.save")); }
      }));
    };
    fill();
    d.addEventListener("close", () => (m && query.carte ? openMap(m) : keepScroll(drawList)));
  }

  function exportDialog(maps) {
    const anyPersonal = mine && maps.some((m) => m.runs.some((r) => r.personal));
    const d = dialog(html`${dlgHead(t(maps.length > 1 ? "mm.sel.export" : "mm.exportMap"))}<div class="stack mm-form">
      <p>${t(maps.length > 1 ? "mm.export.allText" : "mm.export.text")}</p>
      ${anyPersonal ? html`<label class="mm-check"><input type="checkbox" id="mm-xp"> ${t("mm.export.personal")}</label>` : ""}
      <div class="row"><button type="button" class="btn btn-primary" id="mm-xgo">${t("mm.export.go")}</button><span class="muted" id="mm-xstate"></span></div></div>`);
    $("#mm-xgo", d).addEventListener("click", async () => {
      const personal = !!$("#mm-xp", d)?.checked, btn = $("#mm-xgo", d), state = $("#mm-xstate", d);
      btn.disabled = true;
      try {
        const out = [];
        for (const [i, m] of maps.entries()) {
          state.textContent = maps.length > 1 ? t("mm.export.progress", { i: i + 1, n: maps.length }) : t("mm.export.making");
          const blob = await (await fetch(MM.mapUrl(m.id, "map", token), { credentials: "same-origin" })).blob();
          const image = await createImageBitmap(blob);
          const runs = await Promise.all(m.runs.map(async (r) => ({ ...r, rec: await MM.getRun(r.id, token) })));
          out.push({ name: MM.fileName(m.title, m.day), blob: await MM.ozimutFile(m, blob, image, runs, { personal }) });
          image.close?.();
        }
        if (out.length === 1) MM.download(out[0].blob, out[0].name);
        else MM.download(await MM.zipOf(out), `${t("mm.export.zipName")}.zip`);
        d.close();
      } catch (e) { console.error(e); state.textContent = t("mm.err.export"); btn.disabled = false; }
    });
  }

  // ---- imports -----------------------------------------------------------------------------------------------------------
  // files dropped on the page: a folder opens the folder import; QuickRoute's and Ozimut's JPEGs (or a zip of them) their
  // import; any other map « Nouvelle carte »
  function dropZone(el) {
    el.addEventListener("dragover", (e) => { if ([...(e.dataTransfer?.types || [])].includes("Files") && !document.querySelector(".mm-dlg")) { e.preventDefault(); el.classList.add("mm-drop"); } });
    el.addEventListener("dragleave", (e) => { if (!el.contains(e.relatedTarget)) el.classList.remove("mm-drop"); });
    el.addEventListener("drop", async (e) => {
      if (document.querySelector(".mm-dlg")) return;
      e.preventDefault(); el.classList.remove("mm-drop");
      if (MI.dropHasFolder(e.dataTransfer)) { const fs = await MI.filesOfDrop(e.dataTransfer); if (fs.length) folderDialog(fs); return; }
      const f = [...(e.dataTransfer?.files || [])];
      if (!f.length) return;
      if (f.some((x) => /\.zip$/i.test(x.name)) || (f.length > 1 && f.every((x) => /\.jpe?g$/i.test(x.name)))) importFiles(f);
      else if (f.length === 1 && /\.jpe?g$/i.test(f[0].name)) importFiles(f);
      else newMapDialog(f);
    });
  }
  async function importFiles(files) {
    const d = dialog(html`${dlgHead(t("mm.import"))}<div class="stack mm-form" id="mm-imp"><p class="muted">${t("mm.imp.reading")}</p></div>`, { wide: true });
    const box = $("#mm-imp", d), entries = [], failed = [];
    for (const f of files) {
      try { for (const e of await MM.readFile(f)) entries.push({ ...e, file: f.name, sha: await MM.sha256(e.blob), on: true }); }
      catch (e) { failed.push([f.name, e.message === "newer" ? "mm.imp.newer" : "mm.imp.unknown"]); }
    }
    // a lone image that is neither QuickRoute's nor Ozimut's: « Nouvelle carte », which asks for its name and place
    if (files.length === 1 && entries.length === 1 && entries[0].from === "image") { d.close(); newMapDialog(files); return; }
    const shaKnown = new Map(st.maps.map((m) => [m.sha, m]));
    for (const e of entries) {
      const old = shaKnown.get(e.sha);
      e.newRuns = e.runs.filter((r) => !old?.runs.some((o) => o.start === r.start));
      if (old && !e.newRuns.length) e.on = false;
    }
    const personal = entries.some((e) => e.runs.some((r) => r.personal));
    box.innerHTML = html`
      ${entries.length ? html`<p>${t("mm.imp.found")}</p><ul class="mm-imp">${entries.map((e, i) => html`<li><label>
        <input type="checkbox" data-i="${i}" ${raw(e.on ? "checked" : "")} ${raw(shaKnown.has(e.sha) && !e.newRuns.length ? "disabled" : "")}>
        <b>${e.title || e.file}</b> <span class="muted">${[e.day ? fmtDate(e.day) : "", e.runs.length ? tn("mm.count.runs", e.runs.length) : t("mm.mapOnly"), t(`mm.from.${e.from}`)].filter(Boolean).join(" · ")}</span>
        ${shaKnown.has(e.sha) ? html` <span class="mm-tag-s">${e.newRuns.length ? t("mm.imp.addRuns") : t("mm.imp.already")}</span>` : ""}</label></li>`)}</ul>` : ""}
      ${failed.length ? html`<div class="notice">${failed.map(([n, k]) => html`<div><b>${n}</b> — ${t(k)}</div>`)}</div>` : ""}
      ${entries.some((e) => e.from === "quickroute") ? html`<p class="muted">${t("mm.imp.qrNote")}</p>` : ""}
      ${personal ? html`<label class="mm-check"><input type="checkbox" id="mm-ip"> ${t("mm.personal.ask")}</label><p class="muted">${t("mm.personal.why")}</p>` : ""}
      ${entries.length ? privBox(false, "mm-ip-priv") : ""}
      ${entries.length ? html`<div class="stack mm-form" id="mm-ip-place"><p class="muted">${t("mm.imp.placeAll")}</p></div>` : ""}
      <div class="row">${entries.length ? html`<button type="button" class="btn btn-primary" id="mm-igo">${t("mm.imp.go")}</button>` : ""}
        <button type="button" class="btn" data-close>${t("mm.cancel")}</button><span class="muted" id="mm-istate"></span></div>`;
    const pl = entries.length ? placeFields($("#mm-ip-place", box).appendChild(document.createElement("div")), { country: prefs.country || "" }) : null;
    $$("[data-close]", box).forEach((b) => b.addEventListener("click", () => d.close()));
    $$("[data-i]", box).forEach((c) => c.addEventListener("change", () => { entries[c.dataset.i].on = c.checked; }));
    $("#mm-igo", box)?.addEventListener("click", async () => {
      const goList = entries.filter((e) => e.on), keep = !!$("#mm-ip", box)?.checked, btn = $("#mm-igo", box), state = $("#mm-istate", box);
      btn.disabled = true;
      let done = 0, errors = 0;
      for (const e of goList) {
        state.textContent = t("mm.imp.progress", { i: done + 1, n: goList.length });
        try {
          let place = pl.value();
          if (!place.country && e.geo) { const c = MM.toLatLon(e.geo, e.image.width / 2, e.image.height / 2), a = MP.frAt(fr, c.lat, c.lon); if (a) place = { country: "FR", ...a }; }
          await MM.save({ ...e, ...place, runs: e.newRuns, private: !!$("#mm-ip-priv", box)?.checked }, { personal: keep });
        } catch (err) { console.error(err); errors++; }
        done++;
      }
      st = await MM.list();
      d.close();
      drawList();
      if (errors) alert(tn("mm.imp.errors", errors));
    });
  }

  // ---- DOMA: not open yet; a message asks the Ozimut team to turn it on (owner, 2026-11-01) -------------------------------
  function domaDialog() {
    const d = dialog(html`${dlgHead(t("mm.doma.title"))}<form class="stack mm-form" id="mm-df">
      <p>${t("mm.doma.text")}</p>
      <label class="field"><span>${t("mm.doma.url")}</span><input name="url" type="url" required placeholder="https://doma.example.org/" autocomplete="url"></label>
      <label class="field"><span>${t("mm.doma.user")}</span><input name="user" maxlength="100" placeholder="${t("mm.doma.user.ph")}"></label>
      <label class="field"><span>${t("mm.doma.note")}</span><textarea name="note" rows="3" maxlength="2000"></textarea></label>
      <p class="muted">${t("mm.doma.reply", { email: me?.email || "" })}</p>
      <div class="notice" id="mm-derr" hidden></div>
      <div class="row"><button class="btn btn-primary" type="submit">${t("mm.doma.send")}</button><button class="btn" type="button" data-close>${t("mm.cancel")}</button></div></form>`);
    $("#mm-df", d).addEventListener("submit", async (e) => {
      e.preventDefault();
      const f = new FormData(e.target), url = String(f.get("url") || "").trim(), err = $("#mm-derr", d);
      if (!/^https?:\/\/[^\s/]+\.[^\s]+/i.test(url)) { err.textContent = t("mm.doma.badUrl"); err.hidden = false; return; }
      const lines = [t("mm.doma.msg.intro"), "", `${t("mm.doma.msg.url")} ${url}`, `${t("mm.doma.msg.user")} ${String(f.get("user") || "").trim() || "—"}`,
        `${t("mm.doma.msg.account")} ${me?.nom || ""} (${me?.email || ""}, #${me?.uid ?? ""})`, `${t("mm.doma.msg.lang")} ${lang()}`,
        `${t("mm.doma.msg.maps")} ${st.maps.length}`];
      const note = String(f.get("note") || "").trim();
      if (note) lines.push("", note);
      const text = lines.join("\n");
      const htmlBody = text.split("\n").map((l) => `<p>${l.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c])}</p>`).join("");
      const btn = $("button[type=submit]", d);
      btn.disabled = true;
      const res = await auth.api("api/contact", { category: "aide", subject: t("mm.doma.subject"), text, html: htmlBody, from: "#/mes-cartes", browser: navigator.userAgent, attachments: [] });
      btn.disabled = false;
      if (!res.ok) { err.textContent = t(res.status === 429 ? "mm.doma.rate" : "mm.doma.fail"); err.hidden = false; return; }
      $("#mm-df", d).innerHTML = html`<p>${t("mm.doma.sent")}</p><div class="row"><button class="btn btn-primary" type="button" data-close>${t("mm.close")}</button></div>`;
      $$("[data-close]", d).forEach((b) => b.addEventListener("click", () => d.close()));
    });
  }

  draw();
  return { title: t("mm.title"), cleanup: () => { viewer?.close(); mapCtl?.destroy?.(); $$(".mm-dlg").forEach((d) => d.close()); } };
}
