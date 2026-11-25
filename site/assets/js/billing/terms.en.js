// Terms of sale in English (docs/billing/design.md §9; loaded only by ./pages.js): a translation of terms.fr.js, which
// prevails, article by article. The seller's identity comes from its record (`f(field)`: the field, or a visible « [to be
// completed] »). DRAFT: to be reviewed by a lawyer before anything is sold.

export function body(X) {
  const { site, f, seller: S } = X;
  return `
<p class="bl-draft"><b>Draft of 25 November 2026.</b> This text is a draft: it must be reviewed by a lawyer before anything is sold, and is not yet a contract. The French version prevails.</p>
<p>These terms apply to what ${site} itself sells: the individual plan "Ozimut Plus", the "Ozimut Club" plan and the agreements with leagues or federations, and what is sold by the unit (one event, generated maps beyond what is included). Race entries and the clubs' accounts are payments between people and clubs: ${site} collects none of them and these terms do not cover them.</p>

<h2>1. The seller</h2>
<p>${f("name")}${S.form ? `, ${f("form")}` : ""}${S.capital ? `, share capital ${f("capital")}` : ""}<br>
Address: ${f("address")}${S.country ? ` (${f("country")})` : ""}<br>
SIREN / SIRET (French company number): ${S.siret ? f("siret") : f("siren")}${S.rcs ? ` — RCS ${f("rcs")}` : ""}<br>
E-mail: ${f("email")}<br>
${S.vatNote ? f("vatNote") : `VAT: ${X.gap}`}</p>

<h2>2. What is sold</h2>
<p>${site} can still be used free of charge. The plans open further features and higher limits, described on the page <a href="#/tarifs">Plans and prices</a>; what counts is what that page describes on the day of the order. Changes to come are announced on the page <a href="#/changements">What is changing</a>.</p>
<p>Prices are stated in euros. ${S.vatNote ? f("vatNote") + "." : ""}</p>

<h2>Part A — Individuals: Ozimut Plus</h2>

<h3>3. The trial</h3>
<p>An account may try Ozimut Plus for ${X.trialDays} days, once, without any means of payment. When the trial ends, nothing is charged and nothing happens: the account goes back to free use, unless you subscribe.</p>

<h3>4. Order and payment</h3>
<p>The subscription is yearly: ${X.plus} a year at the price in force, paid in advance for the year, by card or SEPA direct debit. Payment is handled by Stripe; ${site} neither sees nor keeps your card number or IBAN. The price paid is the one shown when you order; a launch price, when offered, is kept at each renewal as long as the subscription is not interrupted.</p>
<p>You receive the order's confirmation by e-mail, with these terms. Your invoices and your means of payment are available at any time in Settings › Subscription.</p>

<h3>5. Term and renewal</h3>
<p>The subscription is concluded for one year and renews each year for the same term, at the price then in force for you, unless you terminate it before the renewal date. We write to you before each renewal, no earlier than three months and no later than one month before the deadline, to remind you of the date, the amount and how not to renew. If that reminder was not sent to you within those times, you may end the subscription free of charge at any time from the renewal date.</p>

<h3>6. Right of withdrawal (14 days)</h3>
<p>If you are a consumer, you may withdraw without giving any reason within fourteen days of your order. To do so: the button "Withdraw" in Settings › Subscription, or any unambiguous statement sent to ${f("email")} — for instance the form reproduced at the end of these terms, which is not compulsory.</p>
<p>When ordering, you expressly ask for the subscription to start at once. If you then withdraw, you pay only the share of the year already elapsed on the day of your withdrawal; the rest is refunded to you, by the means of payment used for the order, no later than fourteen days after we were informed of your decision.</p>

<h3>7. Termination</h3>
<p>You may terminate at any time, online and in three clicks: Settings › Subscription › "Terminate", the summary, then "Confirm termination". Termination takes effect at the end of the period already paid: the subscription runs until then, and does not renew. The period under way is not refunded, withdrawal and the cases the law provides for aside. Until the period ends, you may change your mind ("Resume the subscription").</p>
<p>If a renewal payment fails, we tell you and leave you time to update your means of payment; failing that, the subscription ends.</p>

<h3>8. Changes of price or content</h3>
<p>A change of price, or a change that takes something away from a plan, is announced at least two months ahead on the page "What is changing" and by e-mail to subscribers. It applies to your subscription only from its next renewal, and you may terminate before.</p>

<h3>9. What happens to your data</h3>
<p>The end of a plan or of a trial deletes nothing. What you have stored stays readable, exportable and deletable; beyond the limits of free use, you simply can no longer add. How your personal data are handled is described in the <a href="#/compte/confidentialite">site's rules</a>.</p>

<h3>10. The service, warranties, liability</h3>
<p>${site} is an online service provided with care, without a guarantee of being available at every moment; interruptions for maintenance or failures of our hosts may occur. ${site} is not a safety tool: its maps, computed routes and results replace neither the organiser's judgement nor the runner's.</p>
<p>If you are a consumer, you benefit from the legal guarantee of conformity that applies to digital content and services; nothing in these terms limits it, nor the rights the law of your country of residence gives you mandatorily.</p>

<h3>11. Complaints and mediation</h3>
<p>A question, a complaint: ${f("email")}, or the page "Contact us". If you are a consumer and we have not answered your written complaint in a way that satisfies you, you may refer the matter, free of charge, to the consumer mediator we come under: ${f("mediator")}${S.mediatorUrl ? ` — ${f("mediatorUrl")}` : ""}.</p>

<h2>Part B — Clubs, leagues, committees and federations: Ozimut Club</h2>

<h3>12. The order</h3>
<p>The Ozimut Club plan is ordered in My club › Plan, by a manager or a treasurer of the club, who declares having the authority to commit it. A quote may be asked for beforehand; it is valid for sixty days. The order issues an invoice at once, and the plan starts at once.</p>

<h3>13. The price</h3>
<p>${X.club} a year${X.clubSmall ? `; ${X.clubSmall} a year for a club of ${X.smallMax} members or fewer` : ""}, by the club's number of members on ${site} on the day of the order. ${S.vatNote ? f("vatNote") + "." : ""}</p>

<h3>14. Payment</h3>
<p>The invoice is payable by bank transfer, thirty days from its date of issue, quoting its number as the reference. No discount is granted for early payment. For professionals, any late payment gives rise as of right to late-payment penalties at three times the French legal interest rate, and to a fixed indemnity for recovery costs of ${X.indemnity}. If the invoice is not paid when due, the plan may be suspended until payment.</p>
<p>An issued invoice is never modified: a mistake is corrected by a credit note, then a new invoice. Write to us.</p>

<h3>15. Term</h3>
<p>The plan runs for one year from the day of the order. It does not renew by itself: we remind the club of the end date, and the club places a new order if it wishes. When the plan ends, nothing the club has stored is deleted (article 9).</p>

<h3>16. One event, by the unit</h3>
<p>A club without the plan may open what the plan brings for a single event. ${X.perEntry ? `The price is ${X.perEntry} per entrant, capped at ${X.eventCap} per event; ` : ""}the invoice is drawn up after the event, from the number of entrants, and is paid as in article 14.</p>

<h3>17. League and federation agreements</h3>
<p>A league, a committee or a federation may open the plan to its clubs, or to its clubs and their licensees, by a written agreement setting its scope, price and term. These terms apply to it for the rest.</p>

<h2>Common provisions</h2>
<h3>18. Applicable law</h3>
<p>These terms are governed by French law. A consumer keeps the protection of the mandatory provisions of the law of the country where they live, and may bring a case before that country's courts.</p>

<h2>Annex — Model withdrawal form</h2>
<p><i>(Complete and return this form only if you wish to withdraw from the contract.)</i></p>
<div class="bl-form-model">
<p>To ${f("name")}, ${f("address")} — ${f("email")}:</p>
<p>I hereby give notice that I withdraw from my contract for the provision of the following service: Ozimut Plus subscription.</p>
<p>Ordered on: …<br>Name of consumer: …<br>Address of consumer: …<br>E-mail address of the ${site} account: …<br>Date: …<br>Signature (only if this form is sent on paper): …</p>
</div>`;
}
