// node tools/chrono/t_hub.mjs — the app's hub alone under Node (chrono-app/hub.mjs): its page and assets, its sockets, the
// journal, a restart, the token, event ids, radio punches. Needs `ws`: cd chrono-app && npm install --omit=dev
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import net from "node:net";
import http from "node:http";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { Log } from "../../site/assets/js/chrono/log.js";
import { link } from "../../site/assets/js/chrono/sync.js";
import { fromFile } from "../../site/assets/js/chrono/store.js";

let startHub, WebSocket;
try {
  ({ startHub } = await import("../../chrono-app/hub.mjs"));
  ({ WebSocket } = createRequire(new URL("../../chrono-app/package.json", import.meta.url))("ws"));
} catch (e) {
  console.log(`hub: cannot load the hub (${e.code || e.message}) — run « npm install --omit=dev » in chrono-app`);
  process.exit(1);
}

let fails = 0, n = 0;
const ok = (cond, what) => { n++; if (!cond) { fails++; console.log("FAIL", what); } };
const eq = (a, b, what) => ok(JSON.stringify(a) === JSON.stringify(b), `${what}: ${JSON.stringify(a)} != ${JSON.stringify(b)}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (cond, ms = 4000) => { for (const t0 = Date.now(); !cond();) { if (Date.now() - t0 > ms) return false; await sleep(10); } return true; };

const here = path.dirname(fileURLToPath(import.meta.url));
const assets = path.join(here, "..", "..", "site", "assets"), www = path.join(here, "..", "..", "chrono-app", "www");
const folder = fs.mkdtempSync(path.join(os.tmpdir(), "ozchrono-hub-")), folder2 = fs.mkdtempSync(path.join(os.tmpdir(), "ozchrono-hub-"));
const TOKEN = "essai-jeton-0123";
const start = (o = {}) => startHub({ port: 0, sirapPort: 0, folder, assets, www, token: TOKEN, name: "Essai", version: "9.9.9", discovery: false, codes: false, ...o });

// a request as written: no client tidies the path up
const get = (port, url, headers = {}, method = "GET") => new Promise((done, fail) => {
  const r = http.request({ host: "127.0.0.1", port, path: url, method, headers, agent: false }, (res) => {
    const parts = [];
    res.on("data", (c) => parts.push(c));
    res.on("end", () => done({ status: res.statusCode, headers: res.headers, body: Buffer.concat(parts).toString("utf8") }));
  });
  r.on("error", fail);
  r.end();
});

// a station: a log tied to the hub by a socket; `code` is the socket's closing code
function station(port, ev, id, { k = "", log = new Log(id), headers = {}, where = "/hub" } = {}) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}${where}?ev=${encodeURIComponent(ev)}${k ? `&k=${encodeURIComponent(k)}` : ""}`, { headers });
  const st = { log, ws, peer: null, code: null, ready: false, failed: false };
  const l = link(log, (m) => { if (ws.readyState === 1) ws.send(JSON.stringify(m)); }, { ev, onPeer: (p) => { st.peer = p; } });
  ws.on("open", () => l.open());
  ws.on("message", (d) => { const m = JSON.parse(d.toString()); l.receive(m); if (m.t === "ready") st.ready = true; });
  ws.on("close", (code) => { st.code = code; l.close(); });
  ws.on("error", () => { st.failed = true; });
  return st;
}
const lines = (file) => fs.readFileSync(file, "utf8").split("\n").filter(Boolean);
const whole = (l) => { try { JSON.parse(l); return true; } catch (e) { return false; } };

// ---- the page, the assets ----
let hub = await start();
const P = hub.port;
ok(P > 0 && /^hub[a-z0-9]{4}$/.test(hub.station) && Array.isArray(hub.addresses()), "the hub listens and has a station id");
let r = await get(P, "/");
ok(r.status === 200 && r.body.includes("id=\"chrono-root\"") && r.body.includes("/assets/js/chrono/ui/standalone.js") && /^text\/html/.test(r.headers["content-type"]), "/ is the standalone page");
eq(r.headers["cache-control"], "no-cache", "nothing is kept without asking again");
ok(!/https?:\/\//.test(r.body), "the page names no other host");
r = await get(P, "/assets/app.css");
ok(r.status === 200 && /^text\/css/.test(r.headers["content-type"]) && r.body.length > 1000, "an asset: the style sheet");
const tag = r.headers.etag;
r = await get(P, "/assets/js/chrono/log.js");
ok(r.status === 200 && /^text\/javascript/.test(r.headers["content-type"]) && r.body === fs.readFileSync(path.join(assets, "js", "chrono", "log.js"), "utf8"), "an asset: a module, byte for byte");
eq([(await get(P, "/assets/favicon.svg")).headers["content-type"], (await get(P, "/assets/icon-192.png")).headers["content-type"]], ["image/svg+xml", "image/png"], "MIME types");
r = await get(P, "/assets/app.css", { "If-None-Match": tag });
eq([r.status, r.body], [304, ""], "an asset not changed is not sent again");
r = await get(P, "/assets/app.css", {}, "HEAD");
ok(r.status === 200 && r.body === "" && Number(r.headers["content-length"]) > 1000, "HEAD");
eq([(await get(P, "/assets/nothing-here.js")).status, (await get(P, "/assets/js")).status, (await get(P, "/elsewhere")).status], [404, 404, 404], "what is not there");
eq([(await get(P, "/assets/../../chrono-app/hub.mjs")).status, (await get(P, "/assets/..%2f..%2fchrono-app%2fhub.mjs")).status, (await get(P, "/assets/js/..%5c..%5capp.css")).status,
  (await get(P, "/assets/%2e%2e/%2e%2e/chrono-app/package.json")).status, (await get(P, "/assets/app.css::$DATA")).status, (await get(P, "/assets/nul")).status], [403, 403, 403, 403, 403, 403], "no way out of the assets");
eq((await get(P, "/hub/info", {}, "POST")).status, 405, "only reads over HTTP");
r = await get(P, "/hub/info");
{ const j = JSON.parse(r.body); eq([r.status, j.name, j.version, j.events, j.token, j.port, j.peers], [200, "Essai", "9.9.9", [], TOKEN, P, { hubs: [], links: [], network: [] }], "/hub/info, no event yet"); }
// a page of another site calling 127.0.0.1 is not this computer's user
eq((await get(P, "/hub/info", { Origin: "https://elsewhere.example" })).status, 401, "another site's page is asked the token");
eq((await get(P, "/hub/info", { Host: `elsewhere.example:${P}` })).status, 401, "another name pointed at this computer is asked the token");
r = await get(P, "/hub/info", { Origin: "https://ozimut.com" });
eq([r.status, r.headers["access-control-allow-origin"]], [200, "https://ozimut.com"], "ozimut.com's page may ask its visitor's own hub");

// ---- two stations through the hub ----
const EV = "course-1";
const s1 = station(P, EV, "st1"), s2 = station(P, EV, "st2");
s1.log.add("ev", { p: { name: "Course d'essai", date: "2026-11-15" } });
ok(await until(() => s1.ready && s2.ready), "two stations are linked");
s1.log.add("put", { c: "runners", id: "a", p: { family: "Martin", given: "Camille" } });
s2.log.add("put", { c: "runners", id: "b", p: { family: "Roux", given: "Sacha" } });
const hubLog = hub.open(EV);
ok(await until(() => s1.log.ops.length === 3 && s2.log.ops.length === 3 && hubLog.ops.length === 3), "what one adds reaches the other");
eq([s2.log.state, hubLog.state], [s1.log.state, s1.log.state], "three logs, one state, through the hub");
ok(hub.open(EV) === hubLog && s1.peer?.station === hub.station && s1.peer?.name === "Essai", "one log per event; the hub is a station with a name");
eq(JSON.parse((await get(P, "/hub/info")).body).events, [{ ev: EV, name: "Course d'essai", date: "2026-11-15", ops: 3 }], "/hub/info lists the event");

// ---- the journal ----
const file = path.join(folder, `${EV}.ozchrono.jsonl`);
eq(lines(file).map((l) => { const o = JSON.parse(l); return `${o.s}:${o.n}:${o.k}`; }).sort(), ["st1:1:ev", "st1:2:put", "st2:1:put"], "the journal: one operation a line");
eq(new Log("x", fromFile(fs.readFileSync(file, "utf8")).ops).state, s1.log.state, "store.fromFile reads the journal");
eq(JSON.parse(fs.readFileSync(path.join(folder, "hub.json"), "utf8")), { station: hub.station, last: EV }, "hub.json: the station, the event last opened");

// ---- a station sending anything ----
s1.ws.send("not json {");
s1.ws.send(JSON.stringify([1, 2]));
s1.ws.send(Buffer.from([1, 2, 3]));
s1.ws.send(JSON.stringify({ t: "ops", ops: [null, 5, { s: 1 }, { s: "zz", n: 1, t: 5, k: "put", c: "runners", id: "__proto__", p: { polluted: 1 } },
  { s: "zz", n: 2, t: 6, k: "many", rows: 7 }, { s: "zz", n: 3, t: 7, k: "assign", id: "constructor", runner: "a" }, { s: "zz", n: 4, t: 8, k: "put", c: "__proto__", id: "x", p: {} }] }));
s1.ws.send(JSON.stringify({ t: "hello", ev: EV, station: 5, have: "x" }));
s1.log.add("put", { c: "runners", id: "a", p: { card: 9 } });
ok(await until(() => s2.log.state.runners.a?.card === 9), "after garbage, the hub still passes operations on");
ok(({}).polluted === undefined && !hubLog.ops.some((o) => o.s === "zz") && lines(file).length === 4, "operations that would harm are left out");

// ---- the hub stops; a station works on; the journal's last line is cut; the hub is back ----
await hub.close();
ok(await until(() => s1.code !== null && s2.code !== null), "stations see the hub go");
s2.log.add("put", { c: "runners", id: "b", p: { card: 7 } });
fs.appendFileSync(file, "{\"s\":\"st1\",\"n\":99,\"t\":");
hub = await start();
eq([hub.station, hub.events()], [s1.peer.station, [{ ev: EV, name: "Course d'essai", date: "2026-11-15", ops: 4 }]], "back: the same station, the journal read (its cut line apart)");
const s3 = station(hub.port, EV, "st3");
ok(await until(() => s3.ready && s3.log.ops.length === 4), "a new station catches up from the journal");
eq(s3.log.state, s1.log.state, "and holds what the others held");
const s2b = station(hub.port, EV, "st2", { log: s2.log });
ok(await until(() => s3.log.state.runners.b?.card === 7 && hub.open(EV).ops.length === 5), "the cut-off station's work arrives");
ok(await until(() => s2b.ready), "linked again");
const after = lines(file);
eq([after.length, after.filter(whole).length, new Log("x", fromFile(fs.readFileSync(file, "utf8")).ops).state], [6, 5, s3.log.state], "the cut line stays alone on its line; nothing after it is lost");
await hub.close();

// ---- the token, for a hub that trusts nobody ----
hub = await start({ trustLoopback: false });
const Q = hub.port;
eq([(await get(Q, "/hub/info")).status, (await get(Q, "/assets/app.css")).status, (await get(Q, "/hub/info?k=wrong")).status, (await get(Q, "/hub/info", { "X-Hub-Token": "x" })).status], [401, 401, 401, 401], "no token, no answer");
r = await get(Q, "/");
ok(r.status === 401 && r.body.includes("name=\"k\"") && !r.body.includes("chrono-root"), "the page asks for the token");
r = await get(Q, `/?k=${TOKEN}`);
const jar = String(r.headers["set-cookie"] || "").split(";")[0];
ok(r.status === 200 && r.body.includes("chrono-root") && /^ozk=/.test(jar) && /HttpOnly/.test(String(r.headers["set-cookie"])), "the token opens the page and leaves a cookie");
eq([(await get(Q, "/assets/app.css", { Cookie: jar })).status, (await get(Q, "/hub/info", { "X-Hub-Token": TOKEN })).status, (await get(Q, "/hub/info", { Cookie: "ozk=wrong" })).status], [200, 200, 401], "the cookie and the header give it too");
const t1 = station(Q, EV, "t1"), t2 = station(Q, EV, "t2", { k: "wrong" }), t3 = station(Q, EV, "t3", { k: TOKEN }), t4 = station(Q, EV, "t4", { headers: { Cookie: jar } });
ok(await until(() => t1.code !== null && t2.code !== null && t3.ready && t4.ready), "sockets answered");
eq([t1.code, t2.code, t3.code, t4.code, t1.log.ops.length, t3.log.ops.length, t4.log.ops.length], [4401, 4401, null, null, 0, 5, 5], "a socket without the token is closed with 4401 and learns nothing");

// ---- event ids ----
const bad = ["bad.id", "", "a b", "../x", "nul", "COURSE-1", "x".repeat(65)].map((ev) => station(Q, ev, "b", { k: TOKEN }));
ok(await until(() => bad.every((b) => b.code !== null)), "bad ids answered");
eq(bad.map((b) => b.code), bad.map(() => 4400), "an id that is none is refused with 4400 (one differing only by its case too)");
let threw = 0;
for (const ev of ["../x", "a/b", "", null, "x.y", "CON"]) { try { hub.open(ev); } catch (e) { if (e.message === "event") threw++; } }
eq(threw, 6, "open() refuses them");
ok(!fs.readdirSync(folder).some((f) => /^(bad|a b|nul|x{65})/i.test(f)) && fs.readdirSync(folder).filter((f) => f.endsWith(".jsonl")).length === 1, "and no file is made for them");
const lost = station(Q, EV, "w", { k: TOKEN, where: "/elsewhere" });
ok(await until(() => lost.failed) && !lost.ready, "no socket but on /hub");

// ---- radio punches over TCP (SIRAP) ----
let sirap = null;
try { sirap = await import("../../site/assets/js/chrono/io/sirap.js"); } catch (e) { console.log("hub: io/sirap.js is not there — radio punches not checked"); }
if (sirap) {
  ok(hub.sirapPort > 0, "the SIRAP listener is up");
  const tcp = net.connect(hub.sirapPort, "127.0.0.1");
  await new Promise((done) => tcp.once("connect", done));
  const one = sirap.buildPunch({ code: 71, card: 1234567, t: 36000.5 }), two = sirap.buildPunch({ code: 72, card: 1234567, t: 36125 });
  tcp.write(one.subarray(0, 7));                                        // a packet in two pieces
  await sleep(30);
  tcp.write(Buffer.concat([one.subarray(7), two, one]));                // the rest, another punch, and the first one again
  ok(await until(() => t3.log.state.radio.length === 2), "radio punches reach the stations of the event last opened");
  const [p1, p2] = t3.log.state.radio, op = t3.log.ops.find((o) => o.k === "punch");
  eq([p1.code, p1.card, p1.s, p1.src, p2.code, p2.s], [71, 1234567, 36000.5, "sirap", 72, 36125], "as punch operations: code, card, seconds after midnight");
  ok(op.s === hub.station && Math.abs(p1.at - Date.now()) < 60000 && t3.log.state.radio.length === 2, "added by the hub, dated on arrival, the same punch once");
  tcp.write(sirap.buildCard({ card: 2001, start: 36000, finish: 37500, punches: [[31, 36300], [32, 36900]] }));
  ok(await until(() => Object.keys(t3.log.state.reads).length === 1), "a whole card sent by a relay is a read");
  const read = Object.values(t3.log.state.reads)[0];
  eq([read.card, read.start, read.finish, read.punches], [2001, 36000, 37500, [[31, 36300], [32, 36900]]], "with its times");
  tcp.destroy();
  // after a restart, radio punches have their event before any station is back
  await hub.close();
  hub = await start({ trustLoopback: false });
  const tcp2 = net.connect(hub.sirapPort, "127.0.0.1");
  await new Promise((done) => tcp2.once("connect", done));
  tcp2.write(sirap.buildPunch({ code: 73, card: 1234567, t: 36300 }));
  ok(await until(() => hub.events()[0]?.ops === 9), "back: a punch goes to the event last opened, no station yet");
  eq(lines(file).filter(whole).length, 9, "and to its journal");
  tcp2.destroy();
}

// ---- the port taken ----
let taken = null;
try { await start({ port: hub.port, sirapPort: null, folder: folder2 }); } catch (e) { taken = e.code; }
eq(taken, "EADDRINUSE", "a taken port is said");
const next = await start({ port: hub.port, tries: 6, sirapPort: null, folder: folder2, token: "" });
ok(next.port > hub.port && next.port <= hub.port + 5 && next.sirapPort === null && next.token.length >= 12 && next.station !== hub.station, "the next free port is taken; no token given, one is made");
await next.close();
await hub.close();
ok(await until(() => [t3, t4].every((s) => s.code !== null), 2000), "all closed");
for (const d of [folder, folder2]) { try { fs.rmSync(d, { recursive: true, force: true }); } catch (e) { /* the temp folder is cleared anyway */ } }

console.log(fails ? `${fails} of ${n} checks failed` : `hub: ${n} checks passed`);
process.exit(fails ? 1 : 0);
