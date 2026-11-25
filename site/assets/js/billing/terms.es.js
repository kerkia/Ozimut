// Condiciones de venta en español (docs/billing/design.md §9; solo las carga ./pages.js): una traducción de terms.fr.js,
// que prevalece, artículo por artículo. La identidad del vendedor viene de su ficha (`f(campo)`: el campo, o un
// « [por completar] » bien visible). BORRADOR: debe revisarlo un abogado antes de poner nada a la venta.

export function body(X) {
  const { site, f, seller: S } = X;
  return `
<p class="bl-draft"><b>Borrador del 25 de noviembre de 2026.</b> Este texto es un borrador: debe revisarlo un abogado antes de vender nada, y todavía no es un contrato. Prevalece la versión francesa.</p>
<p>Estas condiciones se aplican a lo que vende el propio ${site}: el plan individual «Ozimut Plus», el plan «Ozimut Club» y los acuerdos con ligas regionales o federaciones, y lo que se vende por unidad (un evento, mapas generados más allá de lo incluido). Las inscripciones a las carreras y las cuentas de los clubes son pagos entre personas y clubes: ${site} no cobra nada de ellos y estas condiciones no les afectan.</p>

<h2>1. El vendedor</h2>
<p>${f("name")}${S.form ? `, ${f("form")}` : ""}${S.capital ? `, con un capital de ${f("capital")}` : ""}<br>
Dirección: ${f("address")}${S.country ? ` (${f("country")})` : ""}<br>
SIREN / SIRET (número de empresa francés): ${S.siret ? f("siret") : f("siren")}${S.rcs ? ` — RCS ${f("rcs")}` : ""}<br>
Correo electrónico: ${f("email")}<br>
${S.vatNote ? f("vatNote") : `IVA: ${X.gap}`}</p>

<h2>2. Lo que se vende</h2>
<p>${site} se puede seguir usando gratis. Los planes abren más funciones y límites más altos, descritos en la página <a href="#/tarifs">Planes e importes</a>; lo que cuenta es lo que esa página describe el día del pedido. Los cambios futuros se anuncian en la página <a href="#/changements">Lo que cambia</a>.</p>
<p>Los importes se indican en euros. ${S.vatNote ? f("vatNote") + "." : ""}</p>

<h2>Parte A — Particulares: Ozimut Plus</h2>

<h3>3. La prueba</h3>
<p>Una cuenta puede probar Ozimut Plus durante ${X.trialDays} días, una sola vez, sin medio de pago. Al acabar la prueba no se cobra nada ni pasa nada: la cuenta vuelve al uso gratuito, salvo que te suscribas.</p>

<h3>4. El pedido y el pago</h3>
<p>La suscripción es anual: ${X.plus} al año al importe vigente, pagado por adelantado para el año, con tarjeta o adeudo SEPA. El pago lo gestiona Stripe; ${site} no ve ni guarda tu número de tarjeta ni tu IBAN. El importe pagado es el mostrado al hacer el pedido; un importe de lanzamiento, cuando se ofrece, se mantiene en cada renovación mientras la suscripción no se interrumpa.</p>
<p>Recibes por correo electrónico la confirmación del pedido, con estas condiciones. Tus facturas y tu medio de pago están disponibles en todo momento en Ajustes › Suscripción.</p>

<h3>5. Duración y renovación</h3>
<p>La suscripción se contrata por un año y se renueva cada año por la misma duración, al importe vigente entonces para ti, salvo que la canceles antes del vencimiento. Te escribimos antes de cada vencimiento, no antes de tres meses ni después de un mes antes de la fecha límite, para recordarte la fecha, el importe y cómo no renovar. Si ese recordatorio no se te envió en esos plazos, puedes poner fin a la suscripción sin coste en cualquier momento a partir de la fecha de renovación.</p>

<h3>6. Derecho de desistimiento (14 días)</h3>
<p>Si eres consumidor, puedes desistir sin dar motivo durante catorce días desde tu pedido. Para ejercerlo: el botón «Desistir» de Ajustes › Suscripción, o cualquier declaración inequívoca enviada a ${f("email")} — por ejemplo el formulario reproducido al final de estas condiciones, que no es obligatorio.</p>
<p>Al hacer el pedido pides expresamente que la suscripción empiece de inmediato. Si después desistes, pagas solo la parte del año ya transcurrida el día de tu desistimiento; el resto se te reembolsa, por el medio de pago usado en el pedido, a más tardar catorce días después de que se nos informe de tu decisión.</p>

<h3>7. La cancelación</h3>
<p>Puedes cancelar en cualquier momento, en línea y en tres clics: Ajustes › Suscripción › «Cancelar», el resumen y «Confirmar la cancelación». La cancelación surte efecto al final del periodo ya pagado: la suscripción sigue hasta entonces y no se renueva. El periodo en curso no se reembolsa, salvo desistimiento y salvo los casos que prevé la ley. Mientras el periodo no termine puedes cambiar de opinión («Reanudar la suscripción»).</p>
<p>Si falla un pago de renovación, te avisamos y te dejamos tiempo para actualizar tu medio de pago; de lo contrario, la suscripción termina.</p>

<h3>8. Cambios de importe o de contenido</h3>
<p>Un cambio de importe, o un cambio que quite algo a un plan, se anuncia con al menos dos meses de antelación en la página «Lo que cambia» y por correo electrónico a los suscriptores. Solo se aplica a tu suscripción desde su siguiente renovación, y puedes cancelar antes.</p>

<h3>9. Qué pasa con tus datos</h3>
<p>El fin de un plan o de una prueba no borra nada. Lo que has guardado sigue siendo consultable, exportable y eliminable; más allá de los límites del uso gratuito, simplemente ya no puedes añadir. El tratamiento de tus datos personales se describe en las <a href="#/compte/confidentialite">reglas del sitio</a>.</p>

<h3>10. El servicio, las garantías, la responsabilidad</h3>
<p>${site} es un servicio en línea prestado con cuidado, sin garantía de estar disponible en todo momento; pueden producirse interrupciones por mantenimiento o fallos de nuestros alojadores. ${site} no es una herramienta de seguridad: sus mapas, sus rutas calculadas y sus resultados no sustituyen el criterio del organizador ni el del corredor.</p>
<p>Si eres consumidor, te ampara la garantía legal de conformidad aplicable a los contenidos y servicios digitales; nada en estas condiciones la limita, ni limita los derechos que la ley de tu país de residencia te da de forma imperativa.</p>

<h3>11. Reclamaciones y mediación</h3>
<p>Una pregunta, una reclamación: ${f("email")}, o la página «Escríbenos». Si eres consumidor y no hemos respondido a tu reclamación escrita de un modo que te satisfaga, puedes acudir gratuitamente al mediador de consumo del que dependemos: ${f("mediator")}${S.mediatorUrl ? ` — ${f("mediatorUrl")}` : ""}.</p>

<h2>Parte B — Clubes, ligas regionales, comités y federaciones: Ozimut Club</h2>

<h3>12. El pedido</h3>
<p>El plan Ozimut Club se pide en Mi club › Plan, por un gestor o un tesorero del club, que declara tener capacidad para obligarlo. Antes puede pedirse un presupuesto, válido sesenta días. El pedido emite de inmediato una factura, y el plan empieza de inmediato.</p>

<h3>13. El importe</h3>
<p>${X.club} al año${X.clubSmall ? `; ${X.clubSmall} al año para un club de ${X.smallMax} miembros o menos` : ""}, según el número de miembros del club en ${site} el día del pedido. ${S.vatNote ? f("vatNote") + "." : ""}</p>

<h3>14. El pago</h3>
<p>La factura se paga por transferencia bancaria, a treinta días de su fecha de emisión, indicando su número como referencia. No se concede descuento por pronto pago. Para los profesionales, todo retraso en el pago da lugar de pleno derecho a penalizaciones de demora al triple del tipo de interés legal francés, y a una indemnización fija por gastos de cobro de ${X.indemnity}. Si la factura no se paga a su vencimiento, el plan puede suspenderse hasta el pago.</p>
<p>Una factura emitida no se modifica: un error se corrige con una factura rectificativa de abono y después una nueva factura. Escríbenos.</p>

<h3>15. La duración</h3>
<p>El plan dura un año desde el día del pedido. No se renueva por sí solo: recordamos el vencimiento al club, que hace un nuevo pedido si lo desea. Al terminar el plan no se borra nada de lo que el club ha guardado (artículo 9).</p>

<h3>16. Un evento por unidad</h3>
<p>Un club sin plan puede abrir lo que aporta el plan para un solo evento. ${X.perEntry ? `El importe es de ${X.perEntry} por inscrito, con un máximo de ${X.eventCap} por evento; ` : ""}la factura se emite después del evento, según el número de inscritos, y se paga como en el artículo 14.</p>

<h3>17. Acuerdos de liga regional y de federación</h3>
<p>Una liga regional, un comité o una federación puede abrir el plan a sus clubes, o a sus clubes y a sus federados, mediante un acuerdo escrito que fija su alcance, su importe y su duración. Estas condiciones se le aplican en lo demás.</p>

<h2>Disposiciones comunes</h2>
<h3>18. Ley aplicable</h3>
<p>Estas condiciones se rigen por el derecho francés. Un consumidor conserva la protección de las disposiciones imperativas de la ley del país donde reside, y puede acudir a los tribunales de ese país.</p>

<h2>Anexo — Modelo de formulario de desistimiento</h2>
<p><i>(Completa y envía este formulario solo si deseas desistir del contrato.)</i></p>
<div class="bl-form-model">
<p>A la atención de ${f("name")}, ${f("address")} — ${f("email")}:</p>
<p>Por la presente le comunico que desisto de mi contrato de prestación del siguiente servicio: suscripción Ozimut Plus.</p>
<p>Pedido el: …<br>Nombre del consumidor: …<br>Dirección del consumidor: …<br>Correo electrónico de la cuenta de ${site}: …<br>Fecha: …<br>Firma (solo si este formulario se envía en papel): …</p>
</div>`;
}
