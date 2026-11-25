// The purchase gate's pages (docs/billing/design.md §9): #/tarifs, #/conditions-de-vente, #/changements. All they draw is
// offers.js's (and its billing/ modules'); this module only hands the router's call over. Billing not on for the visitor (or
// the Ozimut app): the address leads home.

import * as offers from "../offers.js";

export const render = (main, r) => offers.page(main, r);
