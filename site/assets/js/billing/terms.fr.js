// Conditions de vente (docs/billing/design.md §9 ; chargé seulement par ./pages.js, donc par ../offers.js). Le texte français
// fait référence ; terms.en.js, terms.de.js et terms.es.js le suivent, article par article. Tout ce qui identifie le vendeur
// vient de sa fiche (GET /api/billing/offer `seller`) : `f(champ)` écrit le champ, ou « [à compléter] » bien visible tant
// qu'il est vide. Rien n'est affirmé ici de la société qui ne vienne de cette fiche.
// PROJET : à faire relire par un avocat avant la mise en vente (la première ligne du texte le dit).

export function body(X) {
  const { site, f, seller: S } = X;
  return `
<p class="bl-draft"><b>Projet du 25 novembre 2026.</b> Ce texte est un projet : il doit être relu par un avocat avant toute mise en vente, et ne vaut pas encore conditions contractuelles.</p>
<p>Ces conditions s'appliquent à ce que ${site} vend lui-même : la formule individuelle « Ozimut Plus », la formule « Ozimut Club » et les accords de ligue ou de fédération, et ce qui se vend à l'unité (un événement, des cartes générées au-delà de ce qui est inclus). Les inscriptions aux courses et les comptes des clubs sont des paiements entre les personnes et les clubs : ${site} n'en encaisse rien et ces conditions ne les concernent pas.</p>

<h2>1. Le vendeur</h2>
<p>${f("name")}${S.form ? `, ${f("form")}` : ""}${S.capital ? ` au capital de ${f("capital")}` : ""}<br>
Adresse : ${f("address")}${S.country ? ` (${f("country")})` : ""}<br>
SIREN / SIRET : ${S.siret ? f("siret") : f("siren")}${S.rcs ? ` — RCS ${f("rcs")}` : ""}<br>
Courriel : ${f("email")}<br>
${S.vatNote ? f("vatNote") : `TVA : ${X.gap}`}</p>

<h2>2. Ce qui est vendu</h2>
<p>${site} reste utilisable gratuitement. Les formules ouvrent des fonctions et des limites supplémentaires, décrites sur la page <a href="#/tarifs">Formules et tarifs</a> ; ce qui fait foi est ce que cette page décrit le jour de la commande. Les changements à venir sont annoncés sur la page <a href="#/changements">Ce qui change</a>.</p>
<p>Les prix sont indiqués en euros. ${S.vatNote ? f("vatNote") + "." : ""}</p>

<h2>Partie A — Particuliers : Ozimut Plus</h2>

<h3>3. L'essai</h3>
<p>Un compte peut essayer Ozimut Plus pendant ${X.trialDays} jours, une seule fois, sans moyen de paiement. À la fin de l'essai, rien n'est prélevé et rien ne se passe : le compte revient à l'usage gratuit, sauf si vous vous abonnez.</p>

<h3>4. La commande et le paiement</h3>
<p>L'abonnement est annuel : ${X.plus} par an au tarif en vigueur, payé d'avance pour l'année, par carte bancaire ou prélèvement SEPA. Le paiement est traité par Stripe ; ${site} ne voit ni ne conserve votre numéro de carte ou votre IBAN. Le prix payé est celui affiché au moment de la commande ; un tarif de lancement, quand il est proposé, est conservé aux renouvellements tant que l'abonnement n'est pas interrompu.</p>
<p>Vous recevez par courriel la confirmation de la commande, avec ces conditions. Vos factures et votre moyen de paiement sont accessibles à tout moment dans Réglages › Abonnement.</p>

<h3>5. La durée et le renouvellement</h3>
<p>L'abonnement est conclu pour un an et se renouvelle chaque année pour la même durée, au tarif alors en vigueur pour vous, sauf si vous le résiliez avant l'échéance. Nous vous écrivons avant chaque échéance, au plus tôt trois mois et au plus tard un mois avant la date limite, pour vous rappeler la date, le montant et la manière de ne pas renouveler. Si ce rappel ne vous a pas été adressé dans ces délais, vous pouvez mettre fin à l'abonnement sans frais à tout moment à compter de la date de renouvellement.</p>

<h3>6. Le droit de rétractation (14 jours)</h3>
<p>Si vous êtes un consommateur, vous pouvez vous rétracter sans donner de motif pendant quatorze jours à compter de votre commande. Pour l'exercer : le bouton « Me rétracter » de Réglages › Abonnement, ou toute déclaration dénuée d'ambiguïté envoyée à ${f("email")} — par exemple le formulaire reproduit à la fin de ces conditions, qui n'est pas obligatoire.</p>
<p>À la commande, vous demandez expressément que l'abonnement commence tout de suite. Si vous vous rétractez ensuite, vous payez seulement la part de l'année déjà écoulée au jour de votre rétractation ; le reste vous est remboursé, par le moyen de paiement utilisé à la commande, au plus tard quatorze jours après que nous avons été informés de votre décision.</p>

<h3>7. La résiliation</h3>
<p>Vous pouvez résilier à tout moment, en ligne et en trois clics : Réglages › Abonnement › « Résilier », le récapitulatif, puis « Confirmer la résiliation ». La résiliation prend effet à la fin de la période déjà payée : l'abonnement continue jusque-là, puis ne se renouvelle pas. La période en cours n'est pas remboursée, hors rétractation et hors les cas où la loi le prévoit. Tant que la période n'est pas terminée, vous pouvez revenir sur votre décision (« Reprendre l'abonnement »).</p>
<p>Si un paiement de renouvellement échoue, nous vous en informons et vous laissons le temps de mettre à jour votre moyen de paiement ; à défaut, l'abonnement prend fin.</p>

<h3>8. Les changements de prix ou de contenu</h3>
<p>Un changement de prix, ou un changement qui retire quelque chose à une formule, est annoncé au moins deux mois à l'avance sur la page « Ce qui change » et par courriel aux abonnés. Il ne s'applique à votre abonnement qu'à partir de son prochain renouvellement, et vous pouvez résilier avant.</p>

<h3>9. Ce que deviennent vos données</h3>
<p>La fin d'une formule ou d'un essai ne supprime rien. Ce que vous avez enregistré reste consultable, exportable et supprimable ; au-delà des limites de l'usage gratuit, vous ne pouvez simplement plus ajouter. Le traitement de vos données personnelles est décrit dans les <a href="#/compte/confidentialite">règles du site</a>.</p>

<h3>10. Le service, les garanties, la responsabilité</h3>
<p>${site} est un service en ligne fourni avec soin, sans garantie d'être disponible à tout instant ; des interruptions pour maintenance ou des pannes de nos hébergeurs peuvent survenir. ${site} n'est pas un outil de sécurité : ses cartes, ses itinéraires calculés et ses résultats ne remplacent ni le jugement de l'organisateur ni celui du coureur.</p>
<p>Si vous êtes un consommateur, vous bénéficiez de la garantie légale de conformité applicable aux contenus et services numériques ; rien dans ces conditions ne la limite, ni ne limite les droits que la loi de votre pays de résidence vous donne impérativement.</p>

<h3>11. Les réclamations et la médiation</h3>
<p>Une question, une réclamation : ${f("email")}, ou la page « Nous écrire ». Si vous êtes un consommateur et que nous n'avons pas répondu à votre réclamation écrite d'une manière qui vous satisfait, vous pouvez saisir gratuitement le médiateur de la consommation dont nous relevons : ${f("mediator")}${S.mediatorUrl ? ` — ${f("mediatorUrl")}` : ""}.</p>

<h2>Partie B — Clubs, ligues, comités et fédérations : Ozimut Club</h2>

<h3>12. La commande</h3>
<p>La formule Ozimut Club se commande dans Mon club › Formule, par un gestionnaire ou un trésorier du club, qui déclare avoir qualité pour l'engager. Un devis peut être demandé au préalable ; il est valable soixante jours. La commande émet aussitôt une facture, et la formule commence aussitôt.</p>

<h3>13. Le prix</h3>
<p>${X.club} par an${X.clubSmall ? ` ; ${X.clubSmall} par an pour un club de ${X.smallMax} membres ou moins` : ""}, selon le nombre de membres du club sur ${site} le jour de la commande. ${S.vatNote ? f("vatNote") + "." : ""}</p>

<h3>14. Le paiement</h3>
<p>La facture est payable par virement bancaire, à trente jours de sa date d'émission, en rappelant son numéro comme référence. Aucun escompte n'est accordé pour paiement anticipé. Pour les professionnels, tout retard de paiement entraîne de plein droit des pénalités de retard au taux de trois fois le taux d'intérêt légal, ainsi qu'une indemnité forfaitaire pour frais de recouvrement de ${X.indemnity}. Si la facture n'est pas réglée à son échéance, la formule peut être suspendue jusqu'au paiement.</p>
<p>Une facture émise ne se modifie pas : une erreur se corrige par un avoir, puis une nouvelle facture. Écrivez-nous.</p>

<h3>15. La durée</h3>
<p>La formule court un an à compter du jour de la commande. Elle ne se renouvelle pas d'elle-même : nous rappelons l'échéance au club, qui passe une nouvelle commande s'il le souhaite. À la fin de la formule, rien de ce que le club a enregistré n'est supprimé (article 9).</p>

<h3>16. Un événement à l'unité</h3>
<p>Un club sans formule peut ouvrir ce que la formule apporte pour un seul événement. ${X.perEntry ? `Le prix est de ${X.perEntry} par inscrit, plafonné à ${X.eventCap} par événement ; ` : ""}la facture est établie après l'événement, d'après le nombre d'inscrits, et se règle comme à l'article 14.</p>

<h3>17. Les accords de ligue et de fédération</h3>
<p>Une ligue, un comité ou une fédération peut ouvrir la formule à ses clubs, ou à ses clubs et à leurs licenciés, par un accord écrit qui en fixe l'étendue, le prix et la durée. Ces conditions s'y appliquent pour le reste.</p>

<h2>Dispositions communes</h2>
<h3>18. Le droit applicable</h3>
<p>Ces conditions sont soumises au droit français. Un consommateur conserve la protection des dispositions impératives de la loi du pays où il réside, et peut saisir les tribunaux de ce pays.</p>

<h2>Annexe — Modèle de formulaire de rétractation</h2>
<p><i>(À compléter et à nous renvoyer seulement si vous souhaitez vous rétracter du contrat.)</i></p>
<div class="bl-form-model">
<p>À l'attention de ${f("name")}, ${f("address")} — ${f("email")} :</p>
<p>Je vous notifie par la présente ma rétractation du contrat portant sur la prestation de service ci-dessous : abonnement Ozimut Plus.</p>
<p>Commandé le : …<br>Nom du consommateur : …<br>Adresse du consommateur : …<br>Adresse électronique du compte ${site} : …<br>Date : …<br>Signature (seulement si ce formulaire est envoyé sur papier) : …</p>
</div>`;
}
