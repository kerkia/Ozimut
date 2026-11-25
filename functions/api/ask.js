// POST /api/ask — « IA » (pages/ask.js; owner 2026-10-15, every account since 2026-10-16): a question in, one
// DuckDB query and how to show it out. The language model runs on Workers AI (binding AI, the account's free daily
// allowance of 10 000 neurons; past it the calls fail until the next day, nothing is billed on the free plan). The browser
// runs the query on the published files (site_ask.py), so the model never sees the data. Nothing is stored.
// Body: { question, method, terrain, lang ("fr" | "en": the answer's titles and columns), previous?: { question, sql },
// failed?: { sql, error }, model? (administrators: a test), promptOnly? }. Errors carry a `code` (quota, hour, day with n,
// model with detail, unreadable) the page words in its language, and a French `error` for older pages. With promptOnly the model is not called: the answer is the messages themselves, for the browser to send to a
// model of the user's own choosing, with their own key (pages/ask.js, askbyok.js; owner, 2026-10-15) - the key never comes here.
import { allow, isAdmin, json, LANGS, readBody, withUser } from "../_lib/api.js";
import { entitlementsOf, needOf, refusal } from "../_lib/plans.js";
import { DEFAULT_MODEL, MODELS, NEURONS_PER_DOLLAR, parseAnswer, systemPrompt, userPrompt } from "../_lib/ask.js";

const PER_HOUR = 40, PER_HOUR_ADMIN = 200;      // questions an hour per account: a runaway loop cannot eat the day's quota
// and a day (UTC) per account on the free model, so that a few accounts cannot use up the whole site's allowance (~90 a
// day); administrators apart, and nothing counted for a model of one's own (promptOnly)
// (15 today: the capability « aiPerDay » of the pack in force, _lib/plans.js)

export const onRequestPost = withUser(async ({ request, env }, user) => {
  const admin = isAdmin(env, user);
  const b = await readBody(request);
  const question = String(b?.question || "").trim().slice(0, 1000);
  if (!question) return json({ error: "question required" }, 400);
  const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Paris" });
  const messages = [
    { role: "system", content: systemPrompt({ licence: /^\d+$/.test(String(user.licence || "")) ? Number(user.licence) : null, today, method: b.method, terrain: b.terrain,
      lang: LANGS.includes(b.lang) ? b.lang : "fr" }) },
    { role: "user", content: userPrompt({ question, previous: b.previous, failed: b.failed }) },
  ];
  if (b.promptOnly) return json({ messages });            // the user's own model: no call here, no quota used
  if (!env.AI) return json({ error: "ai not bound" }, 500);
  if (!(await allow(env, `ask:${user.id}`, admin ? PER_HOUR_ADMIN : PER_HOUR, 3600))) return json({ error: "Trop de questions cette heure-ci.", code: "hour" }, 429);
  // the day's questions: the capability « aiPerDay » (_lib/plans.js; PER_DAY under today's pack), null: no daily limit
  const ent = admin ? null : await entitlementsOf(env, user);
  const perDay = admin ? null : ent.caps.aiPerDay;
  if (perDay !== null && !(await allow(env, `askday:${user.id}`, perDay, 86400))) {
    return json({ error: `Vous avez posé ${perDay} questions aujourd'hui au modèle gratuit d'Ozimut : réessayez demain, ou utilisez votre propre clé d'API.`,
      code: "day", n: perDay, cap: "aiPerDay", need: needOf("aiPerDay") }, 429);
  }
  // another model than the default: the administrators' tests, and the accounts holding « aiStrong »
  if (b.model && MODELS[b.model] && b.model !== DEFAULT_MODEL && !admin && !ent.caps.aiStrong) return refusal("aiStrong");
  const model = b.model && MODELS[b.model] ? b.model : DEFAULT_MODEL;
  const t0 = Date.now();
  let out;
  try {
    // gpt-oss reasons before it answers: « low » is enough for one query and halves the wait (administrators may test others)
    const effort = admin && ["low", "medium", "high"].includes(b.effort) ? b.effort : "low";
    out = await env.AI.run(model, { messages, max_tokens: 2500, temperature: 0.1, ...(model.includes("gpt-oss") ? { reasoning: { effort } } : {}) });
  } catch (e) {
    const msg = String(e?.message || e);
    const quota = /neuron|quota|limit|429|capacity/i.test(msg);
    return json(quota ? { error: "Le quota gratuit du jour est atteint : réessayez demain.", code: "quota" }
      : { error: `Le modèle n'a pas répondu (${msg.slice(0, 200)}).`, code: "model", detail: msg.slice(0, 200) }, quota ? 429 : 502);
  }
  const text = out?.choices?.[0]?.message?.content ?? out?.response ?? (typeof out === "string" ? out : "");
  const answer = parseAnswer(typeof text === "string" ? text : JSON.stringify(text));
  const u = out?.usage || {};
  const price = MODELS[model];                             // null: no price published, so no neuron count
  const dollars = price ? ((u.prompt_tokens || 0) * price[0] + (u.completion_tokens || 0) * price[1]) / 1e6 : null;
  const usage = { model, ms: Date.now() - t0, tokensIn: u.prompt_tokens ?? null, tokensOut: u.completion_tokens ?? null,
    neurons: dollars == null ? null : Math.round(dollars * NEURONS_PER_DOLLAR) };
  if (!answer) return json({ error: "La réponse du modèle n'a pas pu être lue.", code: "unreadable", raw: String(text).slice(0, 2000), usage }, 502);
  return json({ answer, usage });
});
