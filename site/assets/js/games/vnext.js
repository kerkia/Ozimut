// Pixel's next layout (owner, 2026-11-28; docs/pixel/competitions.md): the module's pages in the bar's menu, the competitions,
// the week's race in place of the « Carte du jour », the start's countdown, the keys of one's own — the administrators' only
// for now. Opening it to every account = this line (and the server's compAllowed, functions/_lib/virtual.js).
import * as auth from "../auth.js";

export const pixelNext = () => !!auth.session()?.admin;
