// The rules by country: one pack each, the engine knows none of them by name.
import fr from "./fr.js";
import ca from "./ca.js";
import iof from "./iof.js";

export const RULES = { fr, ca, iof };
/** The pack an event runs under: the one it names, else its country's, else the neutral one. */
export const rulesOf = (st) => RULES[st?.event?.rules] || RULES[String(st?.event?.country || "").toLowerCase()] || iof;
export const packFor = (country) => RULES[String(country || "").toLowerCase()] || iof;
