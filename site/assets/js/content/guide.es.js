// The Documentation's guide to the site, in Spanish (guide.fr.js is the reference: the same structure, the same chapters).
// build(X) receives the page's helpers and returns « El sitio » (the documentation's home) and the guides of Arena, Coach and
// Orga and Carto. A page is named as the Spanish menu names it, with a link.
export function build(X) {
  const { html, raw, subTabs, fr = true, admin = false, owner = false } = X;
  // a page of the site, as the menus name it
  const P = (href, label) => html`<a href="${href}">${label}</a>`;
  // a module's documentation
  const M = (mod, label) => html`<a href="#/documentation?module=${mod}">${label}</a>`;
  // a tab of the module's documentation shown (Orga: « El trazado »)
  const D = (tab, label, goto) => html`<a href="#/documentation?onglet=${tab}${goto ? `&voir=${goto}` : ""}" data-tab-link="${tab}"${raw(goto ? ` data-goto="${goto}"` : "")}>${label}</a>`;
  const chapters = (list, CH) => raw(subTabs(list, list[0][0]).s.replace(/<div data-subpanel="([a-z]+)"( hidden)?><\/div>/g, (m0, k, hid) =>
    `<div data-subpanel="${k}"${hid || ""}>${CH[k]().s}</div>`));
  const slide = (kicker, title, body, id) => html`<section class="mx-slide"${raw(id ? ` id="${id}"` : "")}><p class="mx-kicker">${kicker}</p><h2>${title}</h2>${body}</section>`;
  const list = (items) => html`<ul class="mx-list">${items.filter(Boolean).map((i) => html`<li><span>${i}</span></li>`)}</ul>`;

  // what each documentation says under its title
  const LEDE = {
    home: html`Ozimut en pocas palabras y, después, la documentación de cada módulo: elige el que te interese.`,
    arena: html`Las competiciones: el calendario, los resultados de los organizadores, el directo y el análisis de los tiempos parciales.`,
    coach: owner ? html`Entrenar: los análisis de tracks GPS, las descripciones de control, los símbolos del mapa, los juegos y la VAM.`
      : html`Entrenar: los análisis de tracks GPS, los juegos y la VAM.`,
    orga: html`Los eventos del organizador, una carrera o un entrenamiento cada uno: el trazado de recorridos, las salidas, el directo, los resultados, el análisis y el equipo.`,
    carto: html`Dibujar y actualizar mapas de orientación en el navegador: archivos OCAD y Mapper, datos abiertos y LiDAR, trabajo de campo con el móvil, impresión, trabajo en equipo.`,
  };

  // ======================================================================================================
  // El sitio: the documentation's home, short
  // ======================================================================================================
  function site() {
    return html`
      ${slide("El sitio", "Los módulos y la cuenta", html`
        <p>Ozimut tiene varios módulos, Arena, Stats, Coach, Orga y Carto: la página de módulos, a la que llegas al entrar, te propone elegir uno,
          y la barra superior muestra entonces solo sus páginas. El logotipo de Ozimut te devuelve a ella en cualquier momento. Orga y Carto, los módulos de
          los organizadores y los cartógrafos, solo aparecen a quienes los usan: márcalos al registrarte, en Ajustes › Módulos o al pie de la página
          de módulos, o deja que lleguen solos: aparecen en cuanto te unes al equipo de un evento, de un trazado o de un mapa, o empiezas uno. Arena,
          Stats y Coach se ocultan en Ajustes › Módulos. Un módulo oculto sigue abriéndose desde un enlace; Orga se usa en ordenador, Carto también
          en el móvil.</p>
        ${list([
          html`<b>Sin cuenta</b>, Ozimut muestra lo que es público: Arena, Coach salvo la comparación con los demás corredores, y en Stats el corredor, la clasificación y las
            carreras del periodo que la federación publica libremente.`,
          html`<b>Una cuenta</b> se abre con una dirección de correo electrónico y una contraseña, y después los países donde corres (${P("#/reglages?onglet=pays", "Ajustes › Mis países")}).
            Para Francia, el nombre y el número de licencia se comprueban con la lista de federados: es lo que abre ${fr ? "las clasificaciones y tu página de corredor" : "las clasificaciones francesas"}.
            La cuenta solo guarda lo necesario; ${P("#/compte/confidentialite", "Normas del sitio y privacidad")} explica qué, dónde y durante cuánto tiempo.`,
          html`Bajo tu nombre: la página de módulos, esta documentación, los ${P("#/reglages", "Ajustes")}, «Contacto» y cerrar sesión. Las páginas
            todavía en pruebas llevan la mención «beta».`,
        ])}`, "menus")}
      ${slide("El sitio", "País, idioma y tema", html`
        ${list([
          html`<b>El país</b>, arriba, elige las competiciones que ves: el calendario de una treintena de países, leído cada mañana en su federación,
            sus resultados y su directo, abiertos a todos. Las clasificaciones solo existen donde Ozimut tiene los resultados de la federación: Francia
            (${fr ? "el CN oficial y " : ""}el índice Ozimut) y España (el índice Ozimut).`,
          html`<b>El idioma</b> —español, alemán, francés o inglés— cambia en este dispositivo y, con la sesión iniciada, para la cuenta (los correos lo siguen).`,
          html`<b>El tema</b>, bajo la luna: Día, Claro, Bosque, Sotobosque o Noche; por defecto, claro en un ordenador y oscuro en un móvil.`,
        ])}`, "pays")}
      ${slide("El sitio", "Las alertas", html`
        <p>En los ${P("#/reglages", "Ajustes")}, cada alerta llega por correo electrónico, por notificación o por ambos: <b>una de mis carreras está en línea</b>${fr ? "" : " (con una licencia francesa)"},
          <b>mi hora de salida está publicada</b>, <b>una nueva carrera en mis regiones</b> y <b>se acerca el cierre de inscripciones</b>. Las
          notificaciones se configuran dispositivo por dispositivo; los correos de alerta se habilitan cuenta por cuenta, ya que el número de envíos del sitio es limitado.</p>`, "compte")}
      ${slide("El sitio", "En el móvil", html`
        ${list([
          html`<b>La aplicación</b>: «Instalar la aplicación» en el menú bajo tu nombre (Chrome, Edge, Android); en iPhone, Compartir › «Añadir a pantalla de
            inicio», que es también la única forma de recibir allí las notificaciones.`,
          html`<b>Compartir un track</b> desde el reloj o el móvil con Ozimut abre el ${P("#/analyse-solo", "Análisis individual")} con el archivo; no se
            envía nada.`,
        ])}`, "telephone")}`;
  }

  // ======================================================================================================
  // Arena
  // ======================================================================================================
  const ARENA = [["competitions", "Las competiciones"], ["resultats", "Resultados"], ["direct", "En directo"], ["analyse", "Análisis"]];
  function arena() {
    return chapters(ARENA, {
      competitions: () => html`
        ${slide("Arena", "Una página, todas las competiciones", html`
          <p>Arena es una sola página, las ${P("#/agenda", "Competiciones")} del país elegido: tres casillas eligen las de hoy, las próximas y las de los
            últimos 60 días. El calendario llega cada mañana del de la federación: las carreras, y también los entrenamientos, concentraciones y
            cursos. Se puede filtrar por fecha, disciplina, región${fr ? ", departamento y por las carreras que cuentan para el CN" : ""}; en un ordenador, un mapa
            muestra dónde se celebran.${fr ? " Los campeonatos y nacionales de las próximas temporadas también vienen del calendario nacional, a menudo provisional, antes de que su organizador los inscriba en la agenda: aparecen como «provisional», y su fecha y su organización aún pueden cambiar." : ""}</p>
          ${list([
            html`<b>Una competición próxima</b> se abre junto a la lista: el lugar y cómo llegar, el anuncio, ${fr ? "el número de inscritos por recorrido, " : ""}el
              cierre de inscripciones y botones cuando existen: la lista de salida${fr ? " (con el CN de cada uno y el puesto que permite esperar)" : ""},
              «Seguir en directo», el seguimiento GPS.`,
            html`<b>Una competición pasada</b> abre su página: los resultados en la primera pestaña y, cuando se publican los tiempos parciales, cada vista
              de su análisis. «‹ Competiciones» te devuelve a la lista donde la dejaste.`,
          ])}`)}`,
      resultats: () => html`
        ${slide("Arena", "Los resultados de los organizadores", html`
          <p>Los resultados de los últimos 60 días aparecen tal como los publican los organizadores, a menudo esa misma tarde, días antes que la federación.
            Ozimut los busca por sí mismo varias veces al día, y cada 20 minutos los sábados y domingos por la tarde:</p>
          ${list([
            html`en las <b>plataformas</b> de resultados: liveresultat, WinSplits, Helga, O'Live, SPORTident Center, OResults, los sitios MeOSDjango (entre ellos Orientation Data);`,
            html`en la <b>web del club</b> organizador: sus páginas y sus archivos (HTML de OE o de MeOS, IOF XML, PDF);`,
            html`en las <b>subidas</b> de los organizadores y sus <b>emisiones en directo</b> (consulta la documentación de ${M("orga", "Orga")}).`,
          ])}
          <p>Una carrera en curso lo indica («en curso») mientras haya corredores en el terreno. Cuando existen varios documentos, Ozimut muestra el mejor:
            el del organizador antes que los de las plataformas, y los resultados en directo en último lugar (no se corrigen después). Los corredores se
            reconocen por su nombre y su club.</p>`)}
        ${!fr ? "" : html`
        <section class="mx-slide">
          <p class="mx-kicker">Resultados</p>
          <h2>Puntuaciones y CN provisionales</h2>
          <p>El sitio calcula puntuaciones provisionales con las reglas de cada método, para los corredores reconocidos.</p>
          ${list([
            html`<b>Oficial</b>: el CN oficial de cada corredor reconocido, 15 días antes de la carrera, y la regla de la FFCO (media ordinaria sobre los dos
              tercios más rápidos).`,
            html`<b>Ozimut</b>: el nivel habitual de cada corredor reconocido, 15 días antes de la carrera, el valor Ozimut del recorrido (la
              media de nivel × tiempo de los más rápidos: el 90 % del pelotón en bosque, dos tercios en sprint) y el factor de reescalado del día. El índice Ozimut
              provisional tras la carrera sigue la regla de las plazas.`,
            html`Solo se puntúan las listas <b>por recorrido</b>. Una lista por categoría se puntúa recorrido por recorrido una vez que se sabe qué categorías
              corrían en qué recorrido (según las listas por recorrido de la misma carrera, la lista de inscripción de la FFCO o el anuncio de la prueba). Los
              corredores no reconocidos se quedan sin CN.`,
            html`Estos valores son provisionales hasta que la FFCO los publique: los valores definitivos pueden diferir si se corrigen resultados
              o se añaden corredores.`,
          ])}
        </section>`}`,
      direct: () => html`
        ${slide("Arena", "En directo", html`
          <p>El día de la carrera, «Seguir en directo» retransmite los resultados publicados durante la carrera en liveresultat, O'Live, SPORTident Center, OResults, un
            sitio MeOSDjango, o enviados por el organizador desde su programa de cronometraje. Una competición en la que un control o la meta ha registrado
            una picada en la última media hora se marca «en directo».</p>
          ${list([
            html`<b>Por recorrido o por categoría</b>: puesto, tiempo, diferencia, hora de salida${fr ? ", el CN de cada uno y el puesto que permite esperar, y la puntuación de su tiempo" : ""}.
              Un corredor que sigue en el terreno tiene una hora de llegada estimada a partir de sus controles de radio y del tiempo de los que ya han llegado.`,
            html`<b>Seguir</b>: «Mi club» (los corredores de tu club, todas las categorías), «Aún en carrera», «Todos los pasos» de los últimos 15
              minutos, y los de tu club, que pueden hacer vibrar y sonar el móvil en cada paso.`,
            html`<b>Las picadas recientes</b> aparecen en verde (menos de 3 minutos) y luego en amarillo (menos de 9); una búsqueda encuentra un corredor o un club.`,
            html`En cuanto llega un tiempo parcial, «Análisis» analiza la carrera en directo.`,
          ])}`)}`,
      analyse: () => html`
        ${slide("Arena", "Análisis", html`
          <p>Cuando se publican los tiempos parciales, la página de una carrera los analiza recorrido por recorrido, en varias vistas: Tabla, Diferencias,
            Pasos, Tramos, Perfil, Cara a cara, Grupos, Autonomía, Regularidad y Balance.</p>`)}
        <section class="mx-slide">
          <p class="mx-kicker">Tiempos parciales</p>
          <h2>El tiempo perdido y los errores</h2>
          ${list([
            html`En cada tramo entre dos controles, el <b>tiempo perdido</b> es la diferencia entre el tiempo del corredor y el que su ritmo habitual
              en esta carrera permitía prever. Es negativo cuando el corredor va más rápido de lo habitual. El tiempo de referencia de un tramo es la
              media de los tiempos más rápidos (el sexto más rápido, sin el ganador), y el ritmo habitual, el tiempo del corredor en los tramos corridos
              sin error en relación con sus tiempos de referencia: un tramo largo cuenta más que uno corto, como en MeOS.`,
            html`Un <b>error</b> es un tramo en el que el corredor ha perdido al menos el 20 % del tiempo del tramo <b>y</b> al menos 10 segundos; ambos
              umbrales se pueden ajustar. Las columnas «Perdido» y «Sin tiempo perdido» solo cuentan los errores.`,
            html`Las <b>diferencias</b> se miden respecto al «superman», un corredor imaginario que tendría el mejor tiempo en cada tramo, entre todos los
              corredores o entre los que se comparan.`,
            html`Los <b>grupos</b> detectan a los corredores que pasan por los mismos controles con pocos segundos de diferencia, control tras control.`,
          ])}
        </section>
        <section class="mx-slide">
          <p class="mx-kicker">Tiempos parciales</p>
          <h2>Pasos, autonomía, regularidad, control de tiempos</h2>
          ${list([
            html`El <b>gráfico de pasos</b> sitúa a cada corredor a la hora en que pica cada control (su hora de salida más su tiempo acumulado):
              las líneas que se juntan son corredores que van juntos; una línea más inclinada es un corredor que alcanza a otros.`,
            html`<b>Autonomía</b>, quién siguió a quién: en cada tramo, dos corredores del recorrido que salieron del mismo control con menos de 20 segundos de
              diferencia se comparan a lo largo de todo el tramo, suponiendo que cada uno avanza a velocidad constante entre los dos controles. A menos de
              7 segundos el uno del otro, corren juntos; de 7 a 20 segundos, cada vez menos. El que pasa en segundo lugar sigue al otro. El índice de
              seguidor es el tiempo corrido detrás menos el tiempo corrido delante, en relación con el tiempo de carrera: positivo para un seguidor,
              negativo para una liebre. Seguir hace ganar tiempo (el otro lee el mapa y abre camino), de ahí el interés de detectarlo; ambos umbrales se
              pueden ajustar.`,
            html`<b>Regularidad</b>: en cada tramo, el índice de rendimiento es el tiempo de referencia (la media del mejor cuarto de los tiempos)
              dividido entre el tiempo del corredor: 100 % si va tan rápido como los mejores. La irregularidad es la desviación típica de estos índices, cada
              tramo ponderado por su tiempo de referencia, en relación con el índice medio del corredor: un corredor regular mantiene el mismo ritmo de un
              tramo a otro, un corredor irregular alterna buenos tramos y dudas. La dispersión de un tramo, dejando aparte el nivel de cada uno, muestra
              aquellos en los que todo el mundo ha variado: los tramos trampa. Solo cuentan los corredores que llegaron con todos sus tiempos.`,
            html`El <b>control de tiempos</b> revisa los propios tiempos parciales. Un tramo con tiempo negativo en el mismo control para al menos dos
              corredores delata una base mal sincronizada (la de ese control o la del anterior): desplaza a todos los que pican en ella. Un tramo negativo
              aislado delata una pinza sin borrar, que conserva las picadas de una carrera anterior. Un corredor clasificado sin un control que los demás
              han picado probablemente lo picó antes de su salida, y el programa descartó esa picada. El organizador lo ve al subir sus resultados, antes
              de publicarlos; el lector, encima de los análisis, y las casillas afectadas aparecen enmarcadas en la tabla.`,
          ])}
        </section>`,
    });
  }

  // ======================================================================================================
  // Coach
  // ======================================================================================================
  const COACH = [["carte", "Análisis"], ["solo", "Análisis individual"], ["multi", "Comparar con los demás corredores"], ["cartes", "Mis mapas"], ...(owner ? [["definitions", "Descripciones de control"], ["symboles", "Símbolos del mapa"]] : []),     // (the accounts named Le Helloco only, auth.owner)
    ["jeux", "Juegos"], ["vma", "VAM"], ["routes", "Rutas calculadas"]];     // (every account's since 2026-11-04)
  function coach() {
    return chapters(COACH, {
      carte: () => html`
        ${slide("Coach", "Análisis", html`
          <p>El ${P("#/analyses", "Análisis")} se abre con la lista de las competiciones y entrenamientos cuyo organizador ha publicado el mapa y los recorridos.</p>
          ${list([
            html`<b>La lista</b> se filtra por periodo, por país (encima de la lista), por tipo (competiciones o entrenamientos), por club organizador y por nombre;
              en un ordenador, el mapa del país está al lado, y el mapa del evento aparece en miniatura bajo el ratón.`,
            html`<b>Un evento elegido</b> ofrece tres entradas: <b>Ver con todos los corredores</b> (los tracks compartidos, reproducidos juntos), <b>Añadir mi track y
              comparar</b> (tu track se une a los de los demás, con tu consentimiento) o <b>Analizar mi track solo sobre este mapa</b> (el Análisis individual sobre
              el mapa del organizador: solo sueltas tu track, se coloca solo y no se envía nada). Añadir un track requiere una cuenta, y el organizador puede
              cerrar cualquiera de las entradas.`,
            html`<b>Añadir mi propio evento</b> abre el Análisis individual con tu mapa y tu track, para un entrenamiento o cualquier salida. Si el track es de una
              carrera con resultados publicados, o de un evento cuyo organizador ha publicado el mapa, la página lo propone.`,
          ])}`)}`,
      solo: () => html`
        ${slide("Coach", "Análisis individual", html`
          <p>El ${P("#/analyse-solo", "Análisis individual")} reproduce tu carrera sobre tu mapa con tu track GPS. Se entra desde el ${P("#/analyses", "Análisis")}:
            «Añadir mi propio evento» (un entrenamiento, cualquier salida, o una competición cuyo mapa tienes: la página propone sus tiempos parciales
            publicados cuando el track es de ella), o el mapa que publicó el organizador, sin mapa que aportar ni calibración que hacer.</p>
          ${list([
            html`<b>Los archivos</b>: el mapa (imagen, PDF, KMZ, o el propio archivo OCAD o Mapper), el track (GPX, FIT o TCX) y, si los tienes, la
              calibración del mapa (KMZ, archivo de georreferenciación) y los recorridos en IOF XML. En un móvil, «Fotografiar el mapa».`,
            html`<b>La calibración</b> se hace sola: el recorrido se lee en el mapa y el track se coloca encima; si la lectura se equivoca, unos clics la corrigen.`,
            html`<b>La carrera</b> se reproduce después, a pantalla completa si quieres, tramo a tramo, con el tiempo perdido, el ritmo y las gráficas del
              reloj (frecuencia cardiaca, cadencia, altitud…).`,
            html`<b>El track</b> se colorea por ritmo, frecuencia cardiaca, altitud, pendiente, cadencia o potencia (lo que registró el reloj), con su
              leyenda; puedes recortar el principio y el final (el calentamiento, la vuelta) y <b>exportar una imagen</b> del mapa con el track, un título
              y la leyenda, guardada en tu dispositivo.`,
            html`<b>¿Sin track GPS?</b> « Dibujar mi ruta »: haz clic en tu ruta sobre el mapa, control tras control; los parciales publicados (o los que
              escribas, al menos el de meta) la hacen correr como el track de un reloj; « Ajustar a los caminos » coloca luego cada tramo sobre el paso más cercano que lee el mapa.
              Una ruta dibujada no sirve para compararse con los demás corredores. <b>📏</b> mide una distancia en el mapa, y « Orientación del mapa »
              puede girar el tramo en curso hacia arriba.`,
          ])}
          <p>El mapa y el track se leen en tu navegador y no salen de él; solo se guarda la calibración de los controles, para recuperar el análisis tal como
            lo dejaste.</p>`)}`,
      multi: () => html`
        ${slide("Coach", "Comparar con los demás corredores", html`
          <p>«${P("#/analyses", "Comparar con los demás corredores")}» muestra lado a lado los tracks de todos los que corrieron una competición o un entrenamiento,
            sobre el mapa que preparó el organizador (consulta la documentación de ${M("orga", "Orga")}). Elige la carrera, añade tu track —solo guarda las
            posiciones y las horas— y compara. Necesitas una cuenta.</p>
          ${list([
            html`<b>La reproducción</b>, como en Livelox: hora real, salida en masa, espera en los controles, un tramo cada vez.`,
            html`<b>A la izquierda del mapa</b>, la pestaña «Tramos» (abierta desde el principio) detalla los tramos de un corredor, y la pestaña «Análisis» los tiempos parciales (los publicados en una competición), las diferencias, las variantes de ruta y, en un
              entrenamiento, los ejercicios del organizador (pasillo, rumbo).`,
            html`<b>El acceso</b>: todas las cuentas, los miembros de un club (y sus invitados, con el código que les da el organizador) o una contraseña. Tu propio archivo muestra además tus gráficas junto al mapa,
              solo para ti.`,
            html`Cada uno puede <b>comentar</b> su carrera (« Mi comentario »), que leen todos los que ven
              los tracks. El organizador puede abrir el análisis <b>a los visitantes sin cuenta</b>: solo ven los tracks de los corredores que lo aceptaron.
              Un recorrido <b>score</b> (controles en cualquier orden) muestra el orden de cada uno.`,
          ])}`)}`,
      cartes: () => html`
        ${slide("Coach", "Mis mapas", html`
          <p>${P("#/mes-cartes", "Mis mapas")} guarda tus mapas y los recorridos que hiciste en ellos, como un DOMA propio: una galería para buscar por título,
            lugar o año, y cada mapa con sus carreras dibujadas encima, de un color cada una o según el ritmo. Necesitas una cuenta.</p>
          ${list([
            html`<b>Añadir una carrera</b>: en el Análisis individual, una vez calibrada la carrera, «Guardar en Mis mapas». Se guarda el mapa tal como lo diste
              y el recorrido tal como está dibujado (posiciones en el mapa y horas, controles), nunca el archivo GPS. El mismo mapa se guarda una sola vez: otra
              carrera en él se le añade.`,
            html`<b>Importar</b>: los JPEG que exporta QuickRoute (los que guarda DOMA), los archivos de Ozimut, uno a uno o en un zip, o soltados en la página.
              La importación directa desde un DOMA aún no está abierta: su botón envía al equipo de Ozimut una solicitud lista para activarla.`,
            html`<b>Exportar</b>: cada mapa se convierte en un JPEG que cualquiera puede abrir (el mapa con tus recorridos), que contiene también el mapa original
              y las carreras; Ozimut lo vuelve a leer tal cual. Varios mapas marcados se exportan juntos en un zip, se comparten con un mismo enlace o se eliminan de una vez.`,
            html`<b>Datos personales</b>: la frecuencia cardiaca, la altitud y la cadencia solo se guardan si marcas la casilla (sin marcar por defecto).`,
            html`<b>Compartir</b>: tus mapas son privados. Un enlace a todos tus mapas, o a uno, los muestra a quien lo reciba, incluso sin cuenta, sin los datos
              personales; eliminar el enlace pone fin al uso compartido.`,
          ])}`)}`,
      definitions: () => html`
        ${slide("Coach", "Descripciones de control", html`
          <p>Las ${P("#/definitions", "Descripciones de control")} presentan los símbolos de la IOF columna por columna, cada uno con su equivalente en el mapa,
            sus nombres en 23 idiomas y una búsqueda. «Leer una línea de descripciones» detalla un ejemplo columna por columna. Para repasar, puedes ocultar
            los nombres, adivinar la descripción a partir del mapa, o el mapa a partir del símbolo.</p>`)}`,
      symboles: () => html`
        ${slide("Coach", "Símbolos del mapa", html`
          <p>Los ${P("#/symboles", "Símbolos del mapa")} son la leyenda completa de un mapa de bosque (ISOM 2017-2), color por color: cada símbolo con
            su número, su nombre y lo que significa, y señalados los que está prohibido cruzar. «Lo que dicen los colores» explica cuánto se puede correr
            según el verde. Para repasar, puedes ocultar los nombres o los dibujos.</p>
          <p>Estas dos páginas son dos pestañas de ${P("#/apprendre", "Aprender")}, con una tercera, «Entrenamiento»: una foto del terreno y cuatro círculos de
            control en el mapa, ¿cuál está sobre el elemento? Veinte preguntas de diez segundos por defecto; su número, su tiempo y lo que muestra la
            pregunta (foto, nombre, descripción) se ajustan; los cuatro extractos de cada pregunta se agrupan como en el cuestionario.</p>`)}`,
      jeux: () => html`
        ${slide("Coach", "Trece juegos de lectura de mapa", html`
          <p>Los ${P("#/jeux", "Juegos")} se juegan sobre mapas que el sitio dibuja en cada partida —un bosque con su relieve y su vegetación, una
            ciudad, un laberinto— y «fotos» del terreno dibujadas del mismo modo. No se envía nada; si estás conectado, tus partidas entran en la «Clasificación» de cada juego (tus 20 mejores, las 20 mejores de todos).</p>
          ${list([
            html`<b>Elección de ruta</b>: Ruta rápida (dibujar la más corta), Elección de recorrido (20 segundos de mapa, 5 para elegir), Variante más
              rápida, Elección de ruta entre tres o cuatro trazados.`,
            html`<b>Lectura del relieve y del terreno</b>: Curvas de nivel, ¿Subida o bajada?, Mapas idénticos, Encuentra el error, Trail'O.`,
            html`<b>Memoria</b>: Memoria de mapa, Memoria fotográfica y el Laberinto, visto en primera persona.`,
            html`<b>Descripciones</b>: ¿Qué control?, el entrenamiento de «Aprender» en dos niveles —Principiante, los grupos del cuestionario; Avanzado, extractos sorteados— (una foto del terreno, el círculo de control correcto en el mapa).`,
          ])}`)}`,
      vma: () => html`
        ${slide("Coach", "La VAM", html`
          <p>La página ${P("#/vma", "VAM")} presenta los tests (en laboratorio, VAMEVAL, Léger-Boucher, medio Cooper, Cooper, Course Navette, 45-15), calcula la
            velocidad aeróbica máxima a partir de un medio Cooper (6 minutos) o de un Cooper (12 minutos) —la calle de la pista cuenta, igual que la última
            vuelta incompleta—, deduce de ella los ritmos de entrenamiento y propone aplicaciones gratuitas para hacer los tests.</p>`)}`,
      routes: () => html`
        ${slide("Coach · prueba", "Las rutas calculadas", html`
          <p>En los dos análisis GPS, Ozimut propone, para cada tramo, las rutas más rápidas sobre el mapa,
            con su longitud, su desnivel y un tiempo estimado, y mide con el mismo modelo la ruta que tomó cada corredor.
            En el ${P("#/analyse-solo", "Análisis individual")} se calculan todos los tramos y la pestaña «Rutas», a la izquierda del mapa, los recoge tramo a tramo (los ajustes están en la pestaña «Cálculo de ruta», a la derecha); en
            «${P("#/analyse-club", "Comparar con los demás corredores")}», el tramo mostrado, con la lista de corredores. Es un prototipo: las rutas siguen
            el mapa tal como Ozimut lo lee, y esa lectura puede equivocarse. El cálculo arranca solo; se detiene en la pestaña «Cálculo de ruta», y el organizador
            de un análisis puede cerrarlo para su evento.</p>`)}
        ${slide("Coach · prueba", "1. Leer el mapa por sus colores", html`
          <p>El mapa es una imagen: Ozimut solo conoce sus colores. Cada punto se clasifica: el blanco (bosque por el que se corre bien), el amarillo
            (terreno abierto, más o menos claro), los tres verdes según su intensidad, el oliva (zona prohibida) y las «tintas» impresas encima: el
            negro, el gris, el marrón, el azul y el violeta del recorrido.</p>
          ${list([
            html`<b>Primero el papel</b>: en una foto es gris, más cálido o más frío, más oscuro en una esquina. Ozimut encuentra su color (los puntos
              claros y casi grises), lo mide por cuadrados de unos cincuenta metros y lo devuelve al blanco en todas partes; un mapa exportado, ya
              blanco, se queda como está. Una sombra más clara que el gris de la roca desnuda no es roca.`,
            html`<b>Las líneas de norte</b> —largas, rectas, paralelas y espaciadas con regularidad— se retiran (en cian en «Ver el terreno tal como se ha
              leído»): si no, formaban franjas de agua o de pantano a través del mapa.`,
            html`Una tinta es una <b>línea</b> o una <b>superficie</b> según su grosor, medido en metros: lo que queda cuando se borran las líneas de
              menos de 7 a 10 m de ancho (4 a 5 m en sprint) es una superficie. El negro grueso es un edificio o un gran cortado (infranqueable), el gris
              oscuro un edificio en sprint o roca desnuda en bosque, el marrón grueso una zona pavimentada, el azul grueso agua.`,
            html`<b>Los caminos</b>: las líneas negras finas (o gris oscuro, como en un escaneo) forman una red. Ozimut sigue cada línea, sus dos extremos y
              su dirección, y une por los extremos los trazos de un camino discontinuo cuando se miran por encima de su hueco. Una cadena de al menos
              30 m es un camino, de uno de tres tipos según sus trazos comparados con los demás caminos del mapa: carretera o pista (trazo continuo y más
              grueso, o trazos largos y gruesos), sendero, senda pequeña (trazos cortos). Los puntos, los triángulos y un trazo corto aislado no lo son.`,
            html`<b>La sobreimpresión de la organización</b>: el violeta impreso sobre amarillo, naranja o verde sale rojo en el papel. Sus zonas rayadas
              están prohibidas; sus bandas de cruces a lo largo de una carretera son rutas prohibidas: se cruzan, no se siguen; cerca de los controles del
              recorrido (sus círculos y números) se ignora. Los muros y vallas infranqueables, en cambio, no se distinguen de un camino en una foto: sus
              pequeños trazos son demasiado finos.`,
            html`Las <b>líneas azules finas</b> son los arroyos y, muy juntas, los pantanos. Las curvas de nivel, el recorrido, el texto y los puntos se
              borran: cada punto toma el color del terreno más cercano debajo.`,
            html`Después, el mapa se divide en celdas de unos 1,5 m, cada una con el terreno más presente. «Ver el terreno tal como se ha leído» muestra
              esas celdas sobre el mapa, con su leyenda: es lo primero que hay que comprobar. Ozimut avisa cuando la lectura parece errónea (mucha roca
              desnuda o edificios en bosque, un solo terreno casi en todas partes, ningún camino).`,
          ])}
          <p>Límites conocidos: la zona prohibida rayada en violeta se borra con el recorrido; los cortados infranqueables finos, los muros y las vallas
            son líneas negras como los caminos (el ajuste «Líneas negras finas» indica qué son).</p>`)}
        ${slide("Coach · prueba", "1 bis. Mejor: el mapa OCAD o Mapper", html`
          <p>El archivo del propio mapa —OCAD (.ocd) u OpenOrienteering Mapper (.omap, .xmap)— describe el terreno sin adivinar: Ozimut lo lee
            en tu navegador con el motor del trazado de recorridos y dibuja cada símbolo en su lugar exacto.</p>
          ${list([
            html`Las <b>superficies</b> según su color de relleno (o de rayado: azul para un pantano, oliva o violeta para una zona prohibida), capa por
              capa como en el mapa: un verde sobre un amarillo prevalece. El color mejor que el número, salvo cuando el número dice más: vegetación, andar, buena
              visibilidad (409), pantano infranqueable (307; 309 en ISOM 2000), vegetación infranqueable (411 en ISSprOM).`,
            html`Las <b>líneas</b> según su número, en la norma del mapa, reconocida por sus símbolos (ISOM 2017 e ISSprOM, ISOM 2000 e ISSOM 2007):
              carreteras y pistas (501 a 504), senderos (505), sendas pequeñas y cortafuegos (506 a 508) son los tres tipos de camino, continuos
              incluso cuando el mapa los dibuja discontinuos; los cortados, muros y vallas infranqueables (201, 515, 518; 201, 521 y 524 en ISOM
              2000) detienen la carrera, salvo en un punto de paso (519; 525 en ISOM 2000); los muros y vallas franqueables y los límites de
              vegetación son pasamanos; las líneas azules, arroyos.`,
            html`Las <b>líneas que cruzar</b>: taludes, muros de tierra y cárcavas (104 a 108), cortados franqueables (202), muros y vallas franqueables
              (513, 514, 516, 517 — en ISOM 2000: 106 a 110, 203, 519, 520, 522, 523) cuestan cada una un tiempo de cruce, 10 s por defecto para un
              corredor a 6:00 min/km (en proporción al ritmo), calibrado con los tiempos de los corredores cuando sus itinerarios cruzan al menos 5
              en 3 tramos; donde un camino las atraviesa, nada. Así, los itinerarios las rodean cuando el rodeo cuesta menos.`,
            html`El <b>terreno lento</b>: las superficies de zona de bloques densa (209), terreno pedregoso (210 carrera lenta, 211 andar, 212
              progresión difícil) y terreno arenoso (213) frenan la carrera además de la vegetación (70, 40 y 15 % del bosque limpio por defecto);
              una zona de bloques (208) no frena, como dice la ISOM. Un terreno pedregoso dibujado con puntos sueltos, muy por debajo de la
              densidad de la norma, no cuenta. Los análisis de mapa publicados antes del 10 de noviembre de 2026 solo tienen estas líneas y este
              terreno una vez publicados de nuevo.`,
            html`Las curvas de nivel, los símbolos puntuales, los textos y el recorrido se dejan de lado.`,
          ])}
          <p>En el Análisis individual, un archivo OCAD o Mapper soltado solo <b>es</b> el mapa: se dibuja aquí y el track se calibra por su
            georreferenciación. Soltado con una imagen del mapa —o elegido en el recuadro «Rutas calculadas», en los dos análisis—, sirve para
            las rutas, colocado sobre la imagen por su georreferenciación: debe tenerla y cubrir el mapa mostrado.</p>
          <p>Un análisis publicado desde el trazado de recorridos, o cuyos recorridos vienen de un proyecto OCAD (pestaña «Análisis» de un evento, en Orga), conserva lo que el mapa OCAD del organizador dice del terreno: sus itinerarios leen sus símbolos sin ningún archivo que
            soltar, y las zonas prohibidas y los límites que no se deben cruzar que el trazador dibujó en el recorrido forman parte de ello.
            Solo ese dibujo del terreno se envía con el recorrido, nunca el archivo OCAD.</p>`)}
        ${slide("Coach · prueba", "2. El tiempo de un paso", html`
          <p>El tiempo para ir de una celda a su vecina es la distancia, multiplicada por la lentitud del terreno y por la de la pendiente:</p>
          ${list([
            html`<b>El terreno</b>: su velocidad como porcentaje de la del bosque blanco: carretera o pista 130 %, sendero 125 %, senda pequeña 110 %, terreno abierto 110 %, semiabierto
              100 %, los tres verdes 75, 45 y 20 %, pantano 65 %, zona pavimentada 120 %. El agua, los edificios, la zona prohibida (y el gris
              en sprint) son infranqueables. Todo se ajusta en «Velocidad por terreno».`,
            html`<b>La pendiente</b>, leída en las curvas de nivel del mapa —levantadas sobre el terreno por su cartógrafo—, cada una a su altitud según el relieve del IGN (RGE ALTI, en Francia) o de los «Terrain Tiles» en otros lugares, que también rellena el espacio entre ellas («Relieve: solo el modelo» prescinde de ellas; una curva mal leída produce un escalón): en subida, cada metro
              ascendido cuesta tanto como 8 m en llano (el ajuste «1 m de subida equivale, en llano, a»); en bajada suave se va algo más rápido (hasta un 9 % más
              con un 15 % de pendiente), y más empinado se frena (al 30 %, un 29 % más lento que en llano).`,
            html`Los pasos van en 16 direcciones (las ocho vecinas y los saltos de caballo), lo que sigue una línea recta con un margen del 3 %.`,
          ])}
          <p>Ese tiempo corresponde a un ritmo de referencia en bosque blanco llano: 6:00 min/km por defecto, o el que escribas, o —si no escribes nada—
            el del corredor: en el Análisis individual, la mediana, sobre sus tramos, de su tiempo real dividido entre el tiempo del modelo en su propia
            ruta; en «Comparar con los demás corredores», la mediana de los corredores en el tramo.</p>`)}
        ${slide("Coach · prueba", "3. La prudencia de navegación", html`
          <p>Lo más corto no siempre es lo más seguro: lejos de cualquier referencia, en medio del bosque, se lee el mapa más a menudo, se va más despacio
            y uno se equivoca. Ozimut llama <b>pasamanos</b> a los caminos, los arroyos, los lindes entre terrenos distintos y los bordes de lo que
            detiene (agua, edificios). La prudencia añade al coste de un paso una parte de su tiempo que crece con la distancia al pasamanos más
            cercano, plena a 50 m:</p>
          <p class="mx-eq">coste = tiempo × (1 + prudencia × visibilidad × min(1, distancia / 50 m))</p>
          <p>La visibilidad pesa 1 en bosque blanco, de 1,2 a 1,4 en los verdes, 0,3 en terreno abierto y 0 en un camino. Al 20 % (el ajuste por
            defecto), cruzar un bosque sin referencias cuesta hasta una quinta parte más; al 0 %, se corre en línea recta como un corredor que nunca se
            equivoca. La prudencia elige la ruta; los tiempos mostrados siguen siendo los de la carrera sola, sin ella.</p>`)}
        ${slide("Coach · prueba", "4. Las variantes y el mapa de decisiones", html`
          <p>Ozimut hace crecer dos árboles de caminos más cortos en una elipse alrededor del tramo (lo bastante ancha para rodear un lago o ir a buscar
            una pista algo apartada): uno desde la salida y otro desde el control. Su suma en un punto es el coste de la mejor ruta que pasa por ese
            punto; la más baja da A, la más rápida, exacta en la cuadrícula. Las elecciones se leen en esa suma:</p>
          ${list([
            html`las <b>mesetas</b>: los tramos en los que los dos árboles coinciden; un camino seguido durante mucho tiempo es una;`,
            html`los <b>valles</b>: a lo largo de líneas que cruzan el tramo, en cada décima parte, cada hueco de la suma separado de los demás por una
              cresta (al menos un 1,5 % del tiempo de A) es un paso propio: ¿por dónde cortan el tramo las buenas rutas?`,
          ])}
          <p>Una propuesta se conserva si no cuesta más que A más el margen elegido (25 % por defecto), se aparta de las rutas conservadas en al menos
            una quinta parte de su trazado, y o bien corta el tramo por un valle que ninguna de ellas toma (ningún segmento del 30 % de su longitud
            puede acortarse más de un 1 %), o bien se aparta de ellas en un 30 % y sigue siendo <b>localmente óptima</b> en la mitad de su longitud. Un
            arco a través de un bosque uniforme no es una elección; el recto junto a una pista, un rodeo por un camino o alrededor de un verde sí lo
            son. Por último, cada ruta se tensa en líneas rectas, fuera de las 16 direcciones de la cuadrícula, y se mide como el track de un corredor.</p>
          <p>El <b>mapa de decisiones</b> colorea cada punto según el tiempo perdido al pasar por él: verde oscuro en una de las mejores rutas, luego
            verde claro, amarillo y naranja hasta el margen de las variantes; más allá, nada. Muestra de un vistazo los pasillos de las buenas
            elecciones y lo que cuesta salirse de ellos.</p>
          <p>Cada variante indica si pasa por la izquierda, por la derecha o recto respecto a la línea entre los controles.</p>`)}
        ${slide("Coach · prueba", "5. Tu ruta", html`
          <p>Un track GPS pasa a unos metros del camino que sigue (el error del GPS y el de la calibración): medido tal cual, iría por el bosque y
            costaría más que el camino. Por eso Ozimut lo coloca sobre el mapa: el camino más rápido del modelo que se mantiene dentro de su margen de
            error (de 12 a 25 m, según la calibración), sobre el camino cuando el track lo sigue. Luego mide la parte de esa ruta que sigue cada ruta
            calculada. Si sigue una en al menos el 80 % de su longitud, esa es la <b>ruta tomada</b> y cuenta su tiempo; si no, la lista muestra la parte
            de cada una («A 60 % · B 35 %») y cuenta el tiempo del track colocado.</p>
          ${list([
            html`<b>Elección</b>: el tiempo de la ruta tomada menos el de la ruta A: nulo cuando tomaste A;`,
            html`<b>Ejecución</b>: tu tiempo real menos el tiempo de la ruta tomada: lo que ha costado la propia carrera (dudas, errores, terreno
              más lento de lo que dice el mapa).`,
          ])}
          <p>Con el ritmo automático, la ejecución es nula en la mediana: indica qué tramos fueron más lentos o más rápidos de lo habitual.</p>`)}
        ${slide("Coach · prueba", "6. La calibración con los tramos corridos", html`
          <p>Las velocidades por defecto son las de un corredor medio. Los tramos cuya ruta se conoce dicen lo que valen para este corredor: se sabe
            cuántos metros corrió por un camino, fuera de él, en subida, y en cuánto tiempo. Ozimut saca de ellos tres números (la casilla «Calibrar
            las velocidades con los tramos corridos», marcada por defecto):</p>
          ${list([
            html`su <b>ritmo</b> en bosque limpio y llano;`,
            html`su <b>velocidad en los caminos</b> frente al bosque: solo si al menos dos tramos se corren sobre todo por caminos y dos sobre todo
              fuera de ellos;`,
            html`el <b>coste de la subida</b>: solo si la subida pesa un 4 % del tiempo en al menos seis tramos.`,
          ])}
          <p>Con pocos tramos, estos valores se mueven poco: solo se apartan de los valores por defecto si los tramos lo dicen claramente. Los tramos
            a más de un 25 % del modelo (un error, una parada, un mapa mal leído) se dejan de lado antes de un segundo ajuste: la calibración no debe
            absorber los errores que la ejecución quiere mostrar. Después, las rutas se recalculan con esas velocidades: A es la mejor ruta <i>para
            este corredor</i>, la elección se mide frente a ella y la ejecución frente a sus velocidades habituales. En «Comparar con los demás corredores», la
            velocidad en los caminos y la subida se calibran con todo el grupo (todos los tramos de todos los corredores), y cada uno conserva su
            ritmo.</p>`)}`,
    });
  }

  // ======================================================================================================
  // Orga (« El trazado », its other tab, is content/methods.*.js' tracerDoc)
  // ======================================================================================================
  const ORGA = [["qui", "Mis eventos"], ["evenement", "Crear un evento"], ["trace", "Trazado"], ["horaires", "Salidas"], ["direct", "Directo"],
    ["resultats", "Resultados"], ["analyses", "Análisis"], ["equipe", "El equipo"]];
  function orga() {
    return chapters(ORGA, {
      qui: () => html`
        ${slide("Orga", "Tus eventos", html`
          <p>Orga sirve a los clubes que organizan; aparece en cuanto te unes al equipo de un evento o creas uno, o si lo marcas, y se usa en ordenador.
            Es una sola página, ${P("#/orga", "Mis eventos")}: tus eventos pasados, de hoy y próximos —una carrera o un entrenamiento cada uno—, cada
            uno con las herramientas del organizador, en pestañas según su tipo:</p>
          ${list([
            html`<b>Competición individual</b> y <b>Score</b>: Trazado, Salidas, Directo, Resultados, Análisis, Equipo.`,
            html`<b>Relevos</b>: Trazado, Directo, Análisis, Equipo (los resultados y la lista de salida de un relevo aún no se pueden subir).`,
            html`<b>Entrenamiento</b>: Trazado, Análisis, Equipo.`,
          ])}
          <p>Un evento se abre en la pestaña que corresponde a su fecha: Salidas antes de la carrera, Directo el mismo día, Resultados después; un
            entrenamiento, en su trazado antes de su fecha y en su análisis después.</p>
          <p>El mapa en sí se dibuja en ${M("carto", "Carto")}, un módulo aparte, abierto a cualquier cuenta: un mapa sirve para muchos eventos, y
            también se trabaja en él sobre el terreno, con el móvil.</p>
          <p>Solo el equipo de un evento —y los administradores de Ozimut— actúa como organizador de la competición que lleva: lista de salida,
            reserva de horarios, directo, enlace del seguimiento GPS, resultados, recorridos enviados desde el trazado, análisis de mapa. Una
            competición que ningún evento lleva no tiene organizador en Ozimut: para serlo, crea su evento, o pide unirte al equipo del evento que la
            lleva.</p>`)}`,
      evenement: () => html`
        ${slide("Orga", "Crear un evento", html`
          <p>«Crear un evento», arriba en la página, se hace en tres pasos:</p>
          <div class="mx-steps">
            <div class="mx-step"><b>Tipo, país y fecha</b>Competición individual, Score (los controles en el orden que se quiera, clasificados por
              puntos), Relevos o Entrenamiento; un país al que te hayas unido; una fecha dentro de los últimos 60 días o los próximos 400.</div>
            <div class="mx-step"><b>¿En el calendario de la federación?</b>En Francia, una competición se vincula a su entrada en el calendario de la
              federación: la página propone las competiciones del día elegido, las de tu club primero, o «No está en el calendario».</div>
            <div class="mx-step"><b>El evento</b>Su nombre, lugar, club, disciplina, formato y sitio web, tomados del calendario cuando la competición
              figura en él.</div>
          </div>
          ${list([
            html`<b>La vinculación</b>: si eres miembro del club organizador de la competición —el club de tu última carrera conocida—, se hace en el
              acto. Si no, la confirma un administrador de Ozimut; mientras tanto el equipo puede formarse, pero las herramientas de la competición
              siguen cerradas.`,
            html`<b>Una competición, un evento</b>: una competición del calendario la lleva un solo evento como máximo. Si un equipo ya la gestiona, la
              página lo dice y propone pedir unirse a él. En cuanto un evento la lleva, los corredores ya no pueden subir archivos de resultados de
              ella: sus resultados son los de su equipo.`,
            html`<b>Fuera del calendario</b>: una competición que no figura en él, o todavía no, se crea sin vincular; aparece entonces en Arena con las
              competiciones de su país (un relevo, todavía no), sin que se publique quién la creó. Puede vincularse más tarde, mientras no se haya
              publicado nada con su propio nombre.`,
            html`«✎ Modificar», en la cabecera del evento, cambia su descripción, lo vincula al calendario o lo desvincula, o lo elimina.`,
          ])}`)}`,
      equipe: () => html`
        ${slide("Orga", "El equipo", html`
          <p>Cada evento tiene su equipo, y todos sus miembros tienen los mismos derechos: gestionan todo el evento, aceptan o retiran miembros, lo
            vinculan al calendario o lo desvinculan, y pueden eliminarlo. Quien crea el evento es su primer miembro. El trazado de recorridos tiene un equipo propio (ver «Trazado»).</p>
          ${list([
            html`<b>Nadie es añadido por otros</b>, ni por su nombre, ni por su licencia, ni por su correo electrónico: una persona pide entrar, en
              «Unirse a un equipo» (arriba en la página) o abriendo la dirección del evento, que la pestaña «Equipo» da para compartir. Puede
              añadir unas palabras para el equipo.`,
            html`<b>Un miembro responde</b>: cualquiera de ellos acepta o rechaza la solicitud, en la pestaña «Equipo». Los miembros reciben una
              notificación de cada solicitud, y la persona, de la respuesta.`,
            html`<b>Quién ve qué</b>: los miembros ven los nombres y los clubes de los demás y de quienes piden entrar; fuera del equipo solo se ven el
              nombre de pila y la inicial del apellido de dos miembros como máximo.`,
            html`<b>Salir</b>: un miembro deja el equipo cuando quiere; el último miembro elimina el evento en su lugar. En una competición del
              calendario, lo publicado se queda; una competición creada en Ozimut desaparece de Arena con lo que publicó allí.`,
          ])}`)}`,
      trace: () => html`
        ${slide("Orga", "Trazado: los recorridos del evento", html`
          <p>La pestaña «Trazado» vincula el evento con su trazado de recorridos. Todo lo que se hace en el trazado se explica en la pestaña
            ${D("tracer", "El trazado")} de esta documentación.</p>
          ${list([
            html`<b>Empezar el trazado</b> abre la página «Trazado» con un trazado nuevo preparado para el evento —su competición, o el nombre y la
              fecha del entrenamiento— y vinculado a él: solo falta dar el mapa. <b>Abrir el trazado</b> lo retoma después.`,
            html`<b>Un equipo propio</b>: el trazado conserva su equipo y sus roles —trazadores, controlador, lectores, invitados por un enlace— y,
              si quieres, su cifrado. Así los recorridos siguen siendo confidenciales hasta la carrera.`,
            html`<b>Los demás miembros del evento</b> solo ven que existe un trazado, quién lo empezó y cuántas personas hay en su equipo de
              trazado; para trabajar en él, piden que los inviten.`,
            html`Después de la carrera, el trazado publica sus recorridos, mapa incluido, en el análisis del evento (pestaña «Análisis»).`,
          ])}`)}`,
      horaires: () => html`
        ${slide("Orga", "Salidas: los horarios", html`
          <p>La pestaña «Salidas» de una próxima competición publica su lista de salida, hasta el día de la carrera. Archivos que se leen: IOF XML
            «StartList» (lo mejor), CSV, una tabla con un par de columnas por recorrido, HTML, PDF de OE o de MeOS, o un enlace de Google Sheets
            compartido.</p>
          ${list([
            html`El archivo se lee y se comprueba primero en tu navegador: dos corredores del mismo club seguidos, un minuto de salida compartido,
              corredores sin hora, sin pinza o sin recorrido, los intervalos y los huecos libres.`,
            html`«Comprobar y exportar» escribe también el archivo de salida para la aplicación O Checklist.`,
            html`«Abrir la reserva» sustituye a la tabla compartida en la que los corredores se apuntan a una hora: fijas los recorridos (primera y
              última salida, intervalo), la separación entre dos corredores del mismo club, el cierre; cada corredor reserva en Ozimut con su cuenta,
              para sí y para otros (su familia, federados o no, de cualquier club o sin club); una hoja de Google Sheets ya rellenada se importa con
              todas sus pestañas. Al cierre, las reservas pasan a ser la lista de salida publicada, y descargas el CSV o el IOF XML para MeOS u OE.`,
            html`Una vez publicada, la lista aparece en Arena (la lista de salida de la competición), y cada corredor que lo ha pedido recibe su hora de
              salida por notificación o por correo electrónico.`,
          ])}`)}`,
      direct: () => html`
        ${slide("Orga", "Emitir en directo", html`
          <p>La pestaña «Directo» hace aparecer tus resultados en directo en Arena sin pasar por liveresultat. Allí se abre una emisión, vinculada desde
            el principio a la competición del evento. Después, a elegir:</p>
          <div class="mx-grid">
            <div class="mx-box" style="--c:var(--s1)"><h3>Desde MeOS</h3><p>El servicio «Resultados en línea» de MeOS envía él mismo sus resultados a
              la dirección, el número y la contraseña que indica la página; los tiempos parciales de los controles de radio llegan también.</p></div>
            <div class="mx-box" style="--c:var(--s3)"><h3>Desde un archivo</h3><p>Tu programa exporta la lista de resultados cada pocos segundos
              (IOF XML, HTML de OE o de MeOS); la página, abierta en el ordenador de la arena en Chrome o Edge, vuelve a leer ese archivo y envía lo que cambia.</p></div>
          </div>
          <p>La emisión se conserva después de la carrera: sus resultados, sus tiempos parciales y su lista de salida se quedan en Arena. Todavía es
            una versión de prueba: pruébala primero en un entrenamiento, o junto al directo habitual.</p>
          <p><b>El seguimiento GPS</b>: Ozimut no sigue a ningún corredor por GPS. Si tu competición usa un servicio de seguimiento (Loggator,
            GPSSeuranta, TracTrac, Livelox, Routechoices…), indica su enlace en esa misma pestaña: aparece en la competición en Arena, con sus
            resultados y su directo. Solo se publica el enlace.</p>`)}`,
      resultats: () => html`
        ${slide("Orga", "Subir los resultados", html`
          <p>La pestaña «Resultados» se abre el día de la carrera; «Subir los resultados» añade allí tu archivo, en tres pasos:</p>
          <div class="mx-steps">
            <div class="mx-step"><b>El archivo</b>Una exportación IOF XML de tu programa (la mejor opción: incluye los recorridos y los tiempos parciales),
              o el HTML de OE o de MeOS, o un PDF; comprimido en zip o no, 30 MB como máximo.</div>
            <div class="mx-step"><b>La comprobación</b>El archivo se lee en tu navegador, no se envía nada: resumen, resultados recorrido por recorrido,
              control de tiempos (bases mal sincronizadas, pinzas sin borrar) y todas las vistas del análisis.</div>
            <div class="mx-step"><b>La publicación</b>«Publicar» lo envía: la carrera aparece en Arena en pocos minutos, marcada como subida por el
              organizador, y ya no se busca en otros sitios. Una nueva subida sustituye a la anterior.</div>
          </div>`)}`,
      analyses: () => html`
        ${slide("Orga", "Preparar el análisis", html`
          <p>La pestaña «Análisis» abre por sí sola el análisis de mapa del evento y después sirve para gestionarlo. Se prepara
            recorrido por recorrido:</p>
          ${list([
            html`<b>El mapa</b>: una imagen, un PDF o un KMZ, guardado tal cual, sin pérdida de calidad.`,
            html`<b>Su calibración</b>: a partir de un KMZ, de un archivo de georreferenciación, de un IOF XML con coordenadas o de tu propio track.`,
            html`<b>El recorrido</b>: leído en el mapa, con el orden de los controles tomado del IOF XML de los recorridos, de tu track o de tus clics.`,
            html`<b>El acceso</b>: todas las cuentas, los miembros del club —y, si quieres, tus invitados de otros clubes o sin club, con un código; las demás cuentas ven el análisis en la lista, con la invitación a pedirte ese código— o una contraseña. «Ver como los corredores» muestra la página tal como ellos la
              verán.`,
          ])}
          <p>La página del análisis sirve para gestionarlo, no para analizar: la lista de recorridos, el mapa del elegido con su trazado para
            comprobarlo, la publicación (un análisis nuevo queda en borrador, que solo ven los organizadores; «Guardar sin publicar» lo deja así, «Guardar y
            publicar» lo abre a los corredores, «Guardar y publicar más tarde» lo abre solo el día y a la hora elegidos; los recorridos de un
            archivo OCAD depositado se añaden con esos mismos botones), lo que pueden hacer
            los corredores (añadir su track, «Análisis individual» sobre tu mapa, «Mis mapas», comentarios, variantes, vista 3D, vídeo, rutas
            calculadas) y el uso: las cuentas que lo han abierto, los tracks por recorrido, quienes lo han reproducido en solitario sin compartir
            track — solo números, nunca quién.</p>
          <p>Los corredores lo encuentran en Coach («Análisis › Comparar con los demás corredores»). El trazado también puede publicar sus recorridos, mapa incluido, en un análisis de
            mapa (en el caso de una competición, después de la carrera).</p>`)}`,
    });
  }

  // ======================================================================================================
  // Carto (« Cartographier », the map editor: a module of its own since 2026-11-12)
  // ======================================================================================================
  const CARTO = [["carte", "El mapa"], ["donnees", "Los datos"], ["terrain", "Sobre el terreno"], ["imprimer", "Imprimir y compartir"],
    ["equipe", "En equipo"]];
  function carto() {
    return chapters(CARTO, {
      carte: () => html`
        ${slide("Carto", "Un mapa en el navegador", html`
          <p>${P("#/carto", "Carto")} dibuja y actualiza mapas de orientación en el navegador, como OCAD u OpenOrienteering Mapper: nada que instalar.
            Basta con una cuenta, sin activar Orga, en ordenador y en móvil. Todavía es una versión beta: guarda una copia de tus archivos.</p>
          <p>La pantalla del mapa se abre enseguida, vacía, y encima tres opciones:</p>
          ${list([
            html`<b>Mapa nuevo</b>: sprint o bosque, con el juego de símbolos de la IOF adecuado (ISSprOM 2019-2 o ISOM 2017-2), colocado en el lugar
              elegido —unas coordenadas o tu posición— en la cuadrícula del país.`,
            html`<b>Importar un mapa</b>: un archivo OCAD (versiones 6 a 2018), OpenOrienteering Mapper (.omap, .xmap) u Ozimut (.ozmap). Guardado de
              nuevo en OCAD, el archivo conserva idéntico todo lo que no has modificado; lo que un formato no sabe conservar se indica al importar y
              al exportar.`,
            html`<b>Abrir un mapa</b>: los tuyos y aquellos de cuyo equipo formas parte.`,
          ])}
          <p>La cinta sigue el trabajo: Dibujar, Editar, Fondos, Datos, Terreno, Comprobar, Maquetación, Imprimir, Equipo. Los símbolos están a la
            izquierda, dibujados como en el mapa. Dibujas en líneas rectas, en curvas o a mano alzada, ajustándote a los puntos y líneas cercanos;
            rellenas una superficie con un clic entre las líneas que la rodean, cortas, unes, suavizas. Los símbolos y los colores, tintas planas
            incluidas, se editan en «Maquetación». «Comprobar» señala lo que queda por debajo de los tamaños mínimos de la IOF, y «Generalizar» te guía,
            paso a paso, hacia otra escala.</p>`)}`,
      donnees: () => html`
        ${slide("Carto", "Partir de los datos abiertos", html`
          <p>Un mapa nuevo no tiene que empezar de cero. En «Datos», Carto busca para la zona del mapa:</p>
          ${list([
            html`<b>Las curvas de nivel</b>, según el modelo del terreno del país (el IGN en Francia, swisstopo en Suiza, el USGS en Estados Unidos,
              NRCan en Canadá, LINZ en Nueva Zelanda), y en otros lugares según un modelo mundial.`,
            html`<b>OpenStreetMap</b>: carreteras, caminos, edificios, agua, muros y vallas, clasificados en los símbolos del mapa.`,
            html`<b>Los datos nacionales</b>: la BD TOPO del IGN en Francia, swissTLM3D en Suiza, las carreteras, el agua y los edificios de The
              National Map en Estados Unidos.`,
            html`<b>El plano urbano (sprint)</b>, para un mapa de sprint en Francia: el mapa que el generador de las carreras de Pixel hace a partir
              del LiDAR del IGN, su BD TOPO, la foto aérea y su infrarrojo, el catastro y OpenStreetMap, según las reglas de un cartógrafo — el
              espacio viario público pavimentado hasta los límites de las parcelas, el borde de las zonas pavimentadas y los bordillos, aceras y
              carriles bici como líneas a su anchura, escaleras a su anchura, la red de caminos conectada, los edificios adosados unidos, la
              vegetación y los árboles aislados leídos del LiDAR, muros y vallas franqueables o no según su altura, los jardines privados en oliva
              con un « límite por confirmar » (995, violeta, nunca impreso) donde no se conoce ningún muro, valla ni seto, las instalaciones
              deportivas y curvas de nivel cortadas solo en los edificios. Se calcula en los servidores de Ozimut en varios minutos: puedes seguir
              trabajando o cerrar la página, llega como borrador la próxima vez que abras el mapa. Los objetos de OpenStreetMap se guardan en
              símbolos ocultos (990, 991). Un « Mapa nuevo » de sprint lo usa en Francia; en otros lugares, OpenStreetMap.`,
            html`<b>El LiDAR</b>, donde hay un LiDAR nacional abierto (Francia, Suiza, Estados Unidos, Canadá, Nueva Zelanda): el relieve, los
              cortados y la vegetación que karttapullautin saca de él, a la equidistancia del mapa, con curvas de ayuda densas si se desea (ver más
              abajo). Las teselas se calculan a petición, en unos minutos; una barra indica cómo va el cálculo.`,
          ])}
          <p>Todo llega <b>como borrador</b>, en una parte aparte: aceptas lo que está bien y rechazas el resto, objeto por objeto o de una vez. Los
            datos abiertos son un punto de partida; el terreno se levanta sobre el sitio. Donde un país aún no tiene sus datos, Carto lo dice y
            propone pedir que se añadan.</p>
          <p>Los <b>fondos</b> se colocan bajo el mapa: una foto aérea o un mapa en línea según el país, una imagen o un PDF georreferenciado, un
            track GPS.</p>`)}
        ${slide("Carto", "El LiDAR y karttapullautin", html`
          <p>El relieve, los cortados y la vegetación del LiDAR los calcula <b>karttapullautin</b>, el software libre (licencia GPL-3) de Jarkko
            Ryyppö, el de MapAnt. Ozimut lo descarga de su propia publicación y lo ejecuta tal cual en servidores de cálculo, tesela de 1 km a
            tesela; cada tesela se calcula una vez y luego sirve a todos los cartógrafos
            (<a href="https://github.com/karttapullautin/karttapullautin" target="_blank" rel="noopener">github.com/karttapullautin</a>).</p>
          ${list([
            html`<b>La equidistancia</b> sigue la norma del mapa: 2 o 2,5 m para un mapa de sprint (ISSprOM), 2,5 o 5 m para un mapa de bosque
              (ISOM). A 5 m, karttapullautin añade curvas auxiliares a media equidistancia donde el relieve las pide.`,
            html`<b>Las curvas de ayuda</b>: las curvas «basemap» de karttapullautin, cada 0,5 m (cada metro bajo curvas de 5 m), llegan en violeta
              claro a una parte propia, «Curvas de ayuda (LiDAR)», que se oculta a voluntad, y nunca se imprimen (símbolo 996, un auxiliar).
              Muestran las formas entre dos curvas: sobre ellas se dibujan a mano las curvas auxiliares, los pequeños montículos y las pequeñas
              depresiones.`,
            html`<b>Los puntos leídos</b>: karttapullautin conserva una parte de los puntos de la nube (<code>thinfactor</code>), ajustada a su
              densidad para conservar unos 6 por m², del 15 al 20 % de los puntos del IGN. Medido en dos teselas del IGN (la ciudad y los bosques de
              Gif-sur-Yvette, el bosque de Fontainebleau): la misma vegetación, las mismas curvas, algunos cortados pequeños menos, y una tesela
              calculada en 20 a 45 s en lugar de 40 a 70 s (la lectura del archivo LiDAR sigue).`,
            html`<b>Los demás ajustes</b> son los de karttapullautin 2.15.4; la ventana «LiDAR» los enumera con lo que hacen: suavizado y
              acentuación de las curvas, selección de los montículos, pendiente de un cortado franqueable (1,15 m por metro) e infranqueable (2 m
              por metro), alturas del terreno abierto y de la vegetación, umbral de las rayas de sotobosque. No se cambian en Carto, ya que una
              tesela sirve a todos; karttapullautin también se puede usar en el propio ordenador, con ajustes propios.`,
          ])}`)}`,
      terrain: () => html`
        ${slide("Carto", "Sobre el terreno, con el móvil", html`
          <p>En un móvil o una tableta, Carto se abre en la pestaña «Terreno», con botones del tamaño del dedo:</p>
          ${list([
            html`<b>«Mi posición»</b>, encima de los botones de zoom: tu posición GPS en el mapa y su precisión (abajo, «GPS ± 6 m»). El mapa la
              sigue hasta que lo mueves, y vuelve a ella con un toque en el botón; la pantalla sigue encendida mientras se muestra. La brújula
              gira el mapa como el terreno que tienes delante;`,
            html`<b>el track</b> de tu recorrido («Grabar el track»), con su longitud a la vista mientras se graba, guardado como fondo GPX;`,
            html`<b>fotos y notas</b> fijadas en el mapa, donde estás; un toque en una chincheta vuelve a abrir la nota, para marcarla «Hecho» o
              eliminarla;`,
            html`<b>dibujar con el dedo</b>: un toque elige un objeto, un dedo mueve el mapa, dos dedos hacen zoom. Mientras dibujas, una barra al
              pie del mapa ofrece «Deshacer punto», «Descartar» y «Terminar» — lo que hacen Retroceso, Escape e Intro en un teclado; con la
              herramienta de vértices, un punto tocado se quita o cambia de esquina a curva del mismo modo. El símbolo en mano aparece en el
              botón de la lista de símbolos, que se cierra en cuanto se elige un símbolo;`,
            html`<b>una copia sin conexión</b> del mapa: sin red sigues dibujando, y lo guardado se envía en cuanto vuelve la red.`,
          ])}`)}`,
      imprimer: () => html`
        ${slide("Carto", "Imprimir y compartir", html`
          ${list([
            html`<b>La maquetación</b>: la zona impresa, las líneas del norte magnético, la escala gráfica, la leyenda, los logotipos, los créditos,
              un código QR.`,
            html`<b>Imprimir</b>: un PDF vectorial en CMYK; para una imprenta offset, las tintas planas del mapa y las separaciones, una página por
              plancha con sus marcas de registro —el mismo motor que el del trazado de recorridos—.`,
            html`<b>Exportar</b>: OCAD, OpenOrienteering Mapper, .ozmap (el formato de Ozimut, que conserva todo lo necesario para volver a OCAD),
              una imagen PNG con su archivo de georreferenciación, un KMZ.`,
            html`<b>Hacia las otras herramientas</b>: el mapa pasa con un clic al trazado de recorridos o a ${P("#/mes-cartes", "Mis mapas")}.`,
          ])}`)}`,
      equipe: () => html`
        ${slide("Carto", "Cartografiar en equipo", html`
          <p>Un mapa tiene su equipo: se invita por un enlace, como cartógrafo (que dibuja) o como lector; a nadie se le busca por su nombre o su
            dirección de correo. Varios cartógrafos trabajan a la vez: cada uno ve dónde están los demás y se reserva un <b>sector</b>, un
            rectángulo que los demás no modifican; los cambios hechos a la vez se fusionan objeto por objeto.</p>
          <p>Cada 30 minutos de trabajo, o cuando le das un nombre, se guarda una versión que se puede restaurar; los comentarios se fijan en el
            mapa. Una cuenta eliminada cede sus mapas al primer cartógrafo de su equipo.
            ${P("#/compte/confidentialite", "Normas del sitio y privacidad")} dice qué se guarda.</p>`)}`,
    });
  }

  const LABELS = { site: "El sitio", arena: "Las competiciones", coach: "Coach", orga: "Las herramientas", carto: "Carto" };
  return { LABELS, LEDE, ARENA, COACH, ORGA, CARTO, site, arena, coach, orga, carto };
}
