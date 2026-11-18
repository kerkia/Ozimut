// node tools/chrono/t_peers.mjs — the arena's computers find each other (chrono-app/peers.mjs through the hub): three hubs
// on this computer, each saying who it is to the others' discovery ports. One makes an event (it gets a code); a second
// joins it with the code and gets everything; a third, joined through the second, is in step with both; a wrong code is
// refused; a hub given by its address and key links without discovery. Needs `ws`: cd chrono-app && npm install --omit=dev
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import { fileURLToPath } from "node:url";

let startHub;
try { ({ startHub } = await import("../../chrono-app/hub.mjs")); } catch (e) {
  console.log(`peers: cannot load the hub (${e.code || e.message}) — run « npm install --omit=dev » in chrono-app`);
  process.exit(1);
}

let fails = 0, n = 0;
const ok = (cond, what) => { n++; if (!cond) { fails++; console.log("FAIL", what); } };
const eq = (a, b, what) => ok(JSON.stringify(a) === JSON.stringify(b), `${what}: ${JSON.stringify(a)} != ${JSON.stringify(b)}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (cond, ms = 12000) => { for (const t0 = Date.now(); !(await cond());) { if (Date.now() - t0 > ms) return false; await sleep(50); } return true; };

const here = path.dirname(fileURLToPath(import.meta.url));
const assets = path.join(here, "..", "..", "site", "assets"), www = path.join(here, "..", "..", "chrono-app", "www");
const D = [28401, 28402, 28403, 28404];                 // each hub's discovery port; each says who it is to the others'
const to = (i) => D.filter((_, j) => j !== i).map((port) => ({ host: "127.0.0.1", port }));
const hubs = [];
const start = async (i, name, extra = {}) => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), "ozchrono-peer-"));
  // no trust given to this computer: a hub here proves it knows the code, as from another laptop
  const h = await startHub({ port: 0, sirapPort: null, folder, assets, www, name, trustLoopback: false, discovery: { port: D[i], to: to(i) }, ...extra });
  hubs.push(h);
  return h;
};
const get = (port, url, token) => new Promise((done, fail) => {
  const r = http.request({ host: "127.0.0.1", port, path: url, headers: token ? { "X-Hub-Token": token } : {}, agent: false }, (res) => {
    const parts = []; res.on("data", (c) => parts.push(c)); res.on("end", () => done({ status: res.statusCode, body: Buffer.concat(parts).toString("utf8") }));
  });
  r.on("error", fail); r.end();
});
const info = async (h) => JSON.parse((await get(h.port, "/hub/info", h.token)).body);
const state = (h, ev) => JSON.stringify(h.open(ev, { quiet: true }).state);

const EV = "regionale-essai";
const A = await start(0, "PC-Arrivee"), B = await start(1, "PC-Depart"), C = await start(2, "PC-Speaker");

// A makes the event: its page writes it, and the hub gives it a code
const la = A.open(EV);
la.add("ev", { p: { name: "Régionale d'essai", date: "2026-11-22" } }, "Camille");
la.add("put", { c: "runners", id: "r1", p: { family: "Martin", given: "Camille", card: 501 } }, "Camille");
await until(() => !!la.state.event.lan, 2000);
const code = la.state.event.lan;
ok(/^[A-Z2-9]{6}$/.test(code || ""), `the event got a code: ${code}`);

// B hears of it on the network
ok(await until(async () => (await info(B)).peers.network.some((e) => e.ev === EV)), "B hears of A's event");
const net = (await info(B)).peers.network.find((e) => e.ev === EV);
eq([net.name, net.date, net.from], ["Régionale d'essai", "2026-11-22", ["PC-Arrivee"]], "what B hears: its name, day and who holds it");
ok(!JSON.stringify(await info(B)).includes(code), "the code is never said on the network");

// a wrong code is refused; the right one joins (asked through the hub's own page: here, the hub's join itself)
eq(await B.peers.join(EV, "AAAAAA"), "code", "a wrong code is refused");
ok(!B.events().some((e) => e.ev === EV), "nothing of the event reached B");
eq(await B.peers.join(EV, code.toLowerCase()), "ok", "the right code (typed in lower case) joins");
ok(await until(() => state(B, EV) === state(A, EV)), "B holds the same event as A");
eq(B.open(EV, { quiet: true }).state.event.lan, code, "B learnt the event's code from its log");

// C joins through whichever hub it reaches; then all three stay in step, whoever writes
eq(await C.peers.join(EV, code), "ok", "C joins too");
ok(await until(() => state(C, EV) === state(A, EV)), "C holds the same event");
C.open(EV).add("put", { c: "runners", id: "r2", p: { family: "Roux", given: "Sacha", card: 502 } }, "Sacha");
ok(await until(() => state(A, EV) === state(C, EV) && state(B, EV) === state(C, EV)), "what C adds reaches A and B");
B.open(EV).add("read", { r: { id: "x1", card: 501, sys: "si", at: 1, start: null, finish: 39000, check: null, clear: null, punches: [], runner: "r1" } }, "Dominique");
ok(await until(() => state(A, EV) === state(B, EV) && state(C, EV) === state(B, EV)), "a card read at B reaches A and C");

// one link between two hubs, whoever dialled
const links = (await info(A)).peers.links.filter((l) => l.ev === EV && l.state === "on");
ok(links.length >= 1 && links.length <= 2, `A is linked to the others once each: ${links.map((l) => `${l.name}/${l.way}`).join(", ")}`);

// a hub that goes away and comes back catches up by itself, with no one typing anything
const folderB = B.folder;
await B.close(); hubs.splice(hubs.indexOf(B), 1);
A.open(EV).add("put", { c: "runners", id: "r3", p: { family: "Petit", given: "Lou", card: 503 } }, "Camille");
const B2 = await start(1, "PC-Depart", { folder: folderB });
ok(await until(() => state(B2, EV) === state(A, EV)), "B, started again, catches up by itself");

// a computer that does not hear the broadcasts (a network that drops them) links by the address and key it is given
const E = await start(3, "PC-Isole", { discovery: false });
eq(await E.peers.addStatic("127.0.0.1", A.port, A.token, EV), "ok", "an address and a key link without discovery");
ok(await until(() => state(E, EV) === state(A, EV)), "it holds the event");
ok(!(await info(A)).peers.hubs.some((h) => h.name === "PC-Isole"), "a hub without discovery is not heard of");
// a wrong key is refused
const F = await start(3, "PC-Faux", { discovery: false, folder: fs.mkdtempSync(path.join(os.tmpdir(), "ozchrono-peer-")) }).catch(() => null);
if (F) eq(await F.peers.addStatic("127.0.0.1", A.port, "wrong", EV), "code", "a wrong key is refused");

// /hub/join and /hub/peer answer this computer's own page only
eq((await get(A.port, `/hub/join?ev=${EV}&code=${code}`, A.token)).status, 403, "/hub/join: not from another computer, even with the key");

for (const h of hubs) await h.close();
console.log(fails ? `peers: ${fails} of ${n} checks FAILED` : `peers: ${n} checks passed`);
process.exit(fails ? 1 : 0);
