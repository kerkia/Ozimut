// This Source Code Form is subject to the terms of the Mozilla Public License, v. 2.0. If a copy of the MPL was not
// distributed with this file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The documentation of Ozimut Chrono's desktop application, in Spanish (app.fr.js is the reference: the same
// sections under the same ids). Plain data read by the application's own page (src/ui/appdoc.js) and by Orga's
// documentation on the site (content/guide.es.js, chapter « chrono-app »).
export default {
  title: "La aplicación Ozimut Chrono",
  lede: "El cronometraje de Ozimut instalado en un ordenador: sin Internet, los ordenadores de la arena enlazados entre sí, tiques impresos sin ventana. Esta guía es la misma en la aplicación (Ayuda › Documentación) y en la documentación de Orga en ozimut.com.",
  sections: [
    { id: "what", title: "Para qué sirve la aplicación", html: `
      <p>La aplicación Ozimut Chrono muestra las mismas pantallas que la pestaña «Chrono» de un evento de Orga, en ozimut.com. Además hace
        lo que una pestaña de navegador no puede hacer:</p>
      <ul>
        <li>funciona <b>sin Internet</b>;</li>
        <li><b>enlaza los ordenadores de la arena</b> entre sí: cada uno de los que la tienen guarda toda la carrera y la mantiene al día con
          los demás, sin ordenador principal; los teléfonos y las pantallas abren en su navegador la dirección de cualquiera de ellos;</li>
        <li>escribe cada operación en un <b>registro</b>, un archivo por evento en una carpeta del ordenador;</li>
        <li>imprime los tiques <b>sin ventana de impresión</b>;</li>
        <li>recibe las <b>picadas por radio</b> de los repetidores (protocolo SIRAP).</li>
      </ul>
      <p><b>La pestaña sola basta</b> cuando cronometra un único ordenador, o cuando todos los puestos tienen Internet: entonces se
        mantienen al día por la copia en Ozimut. Para conectar un lector de tarjetas hace falta Chrome o Edge. <b>Sin Internet</b>, instala
        la aplicación en cada ordenador que lea tarjetas o imprima tiques (consulta «Enlazar los ordenadores de la arena»).</p>
      <p><b>Software libre.</b> La aplicación se publica bajo la Licencia Pública de Mozilla 2.0 (MPL 2.0); su código fuente está en
        <a href="https://github.com/kerkia/ChronOzimut" target="_blank" rel="noopener">github.com/kerkia/ChronOzimut</a>. Funciona sin
        ozimut.com: sus enlaces con Ozimut — la copia del evento en Ozimut, la publicación de los resultados, los resultados en directo — son
        opcionales. «Ozimut» y «Ozimut Chrono» siguen siendo los nombres de su autor: una versión modificada que distribuyas a otros debe
        llevar otro nombre.</p>
      <p><b>En pruebas.</b> Como el propio Chrono, la aplicación nunca se ha usado todavía con estaciones SPORTident o Emit reales, ni con
        una impresora de tiques, ni en una competición real, y sus enlaces aún no se han probado entre ordenadores reales en la red de una
        arena. Pruébala en un entrenamiento o junto a tu programa habitual.</p>` },
    { id: "install", title: "Descargar, instalar, desinstalar", html: `
      <p>Los archivos se descargan desde la página de versiones del proyecto:
        <a href="https://github.com/kerkia/ChronOzimut/releases/latest" target="_blank" rel="noopener">github.com/kerkia/ChronOzimut/releases/latest</a>.
        El botón «Descargar la aplicación» de la pestaña «Chrono» de Ozimut (Preparar › Conexiones) lleva a los mismos archivos.</p>
      <table>
        <thead><tr><th>Sistema</th><th>Archivo</th><th>Qué es</th></tr></thead>
        <tbody>
          <tr><td>Windows</td><td><code>Ozimut-Chrono-Setup.exe</code></td><td>El instalador, recomendado (unos 100 MB). Instala la
            aplicación para tu propia cuenta, sin derechos de administrador, y <b>después se mantiene al día sola</b>.</td></tr>
          <tr><td>Windows</td><td><code>Ozimut-Chrono-Portable.exe</code></td><td>La versión portátil: un solo programa, no se instala nada.
            Se ejecuta desde donde quieras, por ejemplo desde una memoria USB. Avisa de las versiones nuevas, pero no se actualiza sola.</td></tr>
          <tr><td>macOS</td><td><code>Ozimut-Chrono.dmg</code></td><td>Una sola imagen de disco para todos los Mac, con chip de Apple o
            Intel: ábrela y arrastra la aplicación a Aplicaciones. Avisa de las versiones nuevas, que se instalan a mano.</td></tr>
          <tr><td>Linux</td><td><code>Ozimut-Chrono.AppImage</code></td><td>Un solo archivo (64 bits). Hazlo ejecutable — Propiedades ›
            Permisos, o <code>chmod +x Ozimut-Chrono.AppImage</code> — y ejecútalo. Se mantiene al día solo.</td></tr>
        </tbody>
      </table>
      <p><b>Mientras la aplicación no esté firmada</b>, el sistema desconfía de ella en el primer arranque:</p>
      <ul>
        <li><b>Windows</b> muestra «Windows protegió su PC»: elige «Más información» y luego «Ejecutar de todas formas».</li>
        <li><b>macOS</b> se niega primero a abrirla. En las versiones recientes: Ajustes del Sistema › Privacidad y seguridad, y luego
          «Abrir igualmente». En las versiones anteriores: clic derecho en la aplicación, «Abrir», y confirma.</li>
      </ul>
      <h3>Desinstalar</h3>
      <ul>
        <li><b>Windows</b> (instalador): Configuración › Aplicaciones › Ozimut Chrono › Desinstalar. <b>Versión portátil</b>: borra el
          archivo.</li>
        <li><b>macOS</b>: mueve la aplicación a la Papelera.</li>
        <li><b>Linux</b>: borra el archivo AppImage.</li>
      </ul>
      <p>Los eventos se quedan en su carpeta (Documentos › «Ozimut Chrono», consulta «Dónde están los datos»), y los ajustes en la carpeta
        de ajustes de la aplicación, hasta que los borres a mano.</p>` },
    { id: "first", title: "Primer arranque", html: `
      <p>La ventana se abre en el inicio: la lista «Eventos», la tarjeta «Nuevo evento» (un nombre, una fecha, las reglas del país —
        Francia, Canadá o reglas de la IOF — y «Crear») y la tarjeta «En la red», los eventos de los otros ordenadores de la arena, a los que
        te unes con su código (consulta «Enlazar los ordenadores de la arena»). Con el evento abierto, todo funciona como en la pestaña: los
        puestos Preparar, Secretaría, Salida, Meta, Seguimiento, Speaker, Juez, Controles y Cerrar, descritos en la documentación de Orga,
        capítulo «Chrono».</p>
      <ul>
        <li><b>El aspecto</b>: el inicio tiene una opción «Tema» — los cinco temas de ozimut.com, Día, Claro, Bosque, Sotobosque y Noche;
          Día para pleno sol, Noche para las carreras nocturnas — y una opción «Idioma». Por defecto, el tema sigue el ajuste claro u oscuro
          del sistema (Claro o Sotobosque), y el idioma el del ordenador; los menús de la ventana (Archivo, Ayuda…) siguen siempre
          el idioma del sistema. Cada aparato guarda su propia elección: un teléfono o una pantalla
          puede usar otro tema que el ordenador.</li>
        <li><b>Un portátil</b>: las pantallas de la aplicación están pensadas para el tamaño de un portátil. Los teléfonos y las tabletas
          sirven para las páginas que la aplicación les ofrece (speaker, resultados, juez; consulta «Teléfonos y pantallas»).</li>
        <li><b>La carpeta de los eventos</b> es «Ozimut Chrono», en tus Documentos; la aplicación la crea. Archivo › «Abrir la carpeta de
          datos» la muestra.</li>
        <li><b>Un archivo de evento</b> (.ozchrono) se abre con doble clic (con la versión instalada), o con Archivo › «Abrir un archivo
          de evento…»: sus operaciones se añaden a ese evento en la aplicación, sin duplicar nada, y el evento se abre.</li>
        <li><b>Una sola aplicación a la vez</b>: arrancarla una segunda vez trae la ventana ya abierta.</li>
        <li><b>El cortafuegos</b>: en el primer arranque, Windows pregunta si deja que Ozimut Chrono se comunique en la red. Acéptalo para las
          redes privadas: si no, los otros ordenadores de la arena no la encuentran y los teléfonos no pueden abrirla.</li>
        <li><b>El menú</b>: Archivo (abrir un archivo, abrir la carpeta, salir), Edición, Ver (recargar, zoom, pantalla completa), Ayuda ›
          «Documentación» (<kbd>F1</kbd>), «Buscar actualizaciones…» y «Mantener Ozimut Chrono al día» (consulta «Actualizar»), y «Acerca
          de Ozimut Chrono», que da la versión, la dirección que hay que abrir desde los teléfonos y los otros ordenadores (con la clave de
          la aplicación), el puerto de las picadas por radio y la carpeta de datos.</li>
      </ul>` },
    { id: "hub", title: "Enlazar los ordenadores de la arena", html: `
      <p>Todos los ordenadores en los que funciona la aplicación son iguales: no hay ordenador principal ni ordenador central que elegir.
        Cada uno guarda su copia completa de la carrera y su propio registro. Basta con que estén en la misma red local — un punto de acceso
        wifi o un simple router, sin Internet.</p>
      <h3>Cómo se encuentran</h3>
      <p>Cada pocos segundos, cada aplicación anuncia en la red local quién es, su versión y qué eventos tiene (su nombre y su fecha, nunca
        su código). Dos aplicaciones que tienen el mismo evento se enlazan solas y se mantienen al día la una a la otra. Los enlaces pasan por
        cualquiera de los ordenadores: basta con que cada uno alcance al menos a otro. Un ordenador que se va o se reinicia recupera solo, a
        su vuelta, lo que se ha hecho sin él.</p>
      <h3>El código del evento</h3>
      <p>Cada evento tiene un código de seis caracteres, letras y cifras que no se confunden (nunca O, 0, I, L ni 1). Aparece en grande en
        Preparar › Conexiones, tarjeta «Los otros ordenadores de la arena», bajo «Código del evento». Se crea solo con el evento, tanto en la
        aplicación como en la pestaña «Chrono» de Ozimut. Protege el evento: otro ordenador tiene que conocerlo para enlazarse, y nunca se
        anuncia en la red — una aplicación demuestra que lo conoce sin decirlo.</p>
      <h3>Unirse al evento desde otro ordenador</h3>
      <ol>
        <li>Instala la aplicación en ese ordenador y ábrela.</li>
        <li>Su inicio tiene una tarjeta «En la red»: los eventos de los otros ordenadores de la arena, cada uno con el ordenador que lo tiene
          («en PC-Meta»). Haz clic en el evento.</li>
        <li>Escribe su código, en mayúsculas o minúsculas, y luego «Unirse». El evento se abre y se llena en unos instantes. Un código
          erróneo se rechaza: «Ese no es el código de este evento.»</li>
      </ol>
      <p>El código solo se pide una vez: después, este ordenador se enlaza solo, en cada arranque, en cualquier red. No hay nada que repetir
        tras un reinicio.</p>
      <p>En Preparar › Conexiones, la tarjeta «Los otros ordenadores de la arena» da el código, los ordenadores enlazados («2 otros ordenadores
        enlazados: PC-Meta, PC-Secretaría», o «Ningún otro ordenador comparte aún este evento…») y las otras aplicaciones vistas en la red.
        La barra superior lo resume: «1 otro ordenador enlazado», «Ningún otro ordenador».</p>
      <h3>La misma versión en todas partes</h3>
      <p>Los ordenadores de un mismo equipo deben tener la misma versión de la aplicación. Cuando ordenadores enlazados, o vistos en la red,
        tienen otra versión, Preparar › Conexiones lo dice («Versiones distintas: … (este ordenador: …). Actualiza todos los ordenadores
        antes de la carrera.») y el indicador de los enlaces, en la barra superior, se vuelve naranja. No cronometres una carrera con
        versiones mezcladas: actualiza los ordenadores antes (consulta «Actualizar»).</p>
      <h3>¿No aparece un ordenador?</h3>
      <p>Algunas redes (wifi pública, red de un colegio) impiden que los ordenadores se encuentren. En Preparar › Conexiones, abre «¿No aparece
        un ordenador?», indica la dirección y la clave de la aplicación del otro ordenador y luego «Conectar». Su menú Ayuda › «Acerca de
        Ozimut Chrono» da una dirección del tipo <code>http://192.168.1.20:8377/?k=…</code>: la dirección es <code>192.168.1.20:8377</code>,
        la clave lo que sigue a <code>?k=</code>. Este enlace también se conserva de un arranque al siguiente.</p>
      <h3>Teléfonos y pantallas</h3>
      <p>Un teléfono, una tableta o una pantalla (speaker, resultados, juez, lista de salida) no tiene nada que instalar: su navegador abre la
        dirección de cualquier ordenador en el que funcione la aplicación. Preparar › Conexiones la da («Teléfonos y pantallas sin la
        aplicación (locutor, resultados, árbitro): abre <code>http://192.168.1.20:8377/?k=…</code>»), y Ayuda › «Acerca de Ozimut Chrono»
        también. Lo que sigue a <code>?k=</code> es la <b>clave</b> de esa aplicación; sin ella, la página la pide en un campo marcado con una
        llave. Elige el evento en la lista: este puesto ve la carrera en unos instantes y escribe en ella como los demás. Un puesto que pierde
        la red sigue solo y se vuelve a enlazar por sí mismo cuando vuelve; no se pierde nada.</p>
      <h3>Un puesto, un papel</h3>
      <p>Añade <code>&amp;role=</code> a la dirección para que un puesto solo muestre lo que le concierne, por ejemplo
        <code>http://192.168.1.20:8377/?k=…&amp;role=start</code>:</p>
      <table>
        <thead><tr><th>Papel</th><th>Puestos mostrados</th></tr></thead>
        <tbody>
          <tr><td><code>desk</code></td><td>Secretaría</td></tr>
          <tr><td><code>start</code></td><td>Salida</td></tr>
          <tr><td><code>finish</code></td><td>Meta y Seguimiento</td></tr>
          <tr><td><code>speaker</code></td><td>Speaker y Seguimiento</td></tr>
          <tr><td><code>referee</code></td><td>Juez y Seguimiento</td></tr>
          <tr><td>(sin papel)</td><td>Todos los puestos</td></tr>
        </tbody>
      </table>
      <p>Con el evento abierto, la dirección del navegador lo nombra (<code>&amp;ev=…</code>): guárdala en favoritos, vuelve a abrir
        directamente ese evento, con ese papel.</p>
      <h3>Los lectores de tarjetas y las impresoras de tiques</h3>
      <p>Un navegador solo deja que una página hable con un lector de tarjetas, o con una impresora de tiques en puerto serie, si la
        página viene de un sitio seguro o del propio ordenador. Por eso, una página abierta en la dirección de otro ordenador no puede leer
        tarjetas: sirve para la salida, el seguimiento, el speaker, el juez, la secretaría sin lector. <b>Cada ordenador que lee tarjetas o
        imprime tiques tiene la aplicación</b>, enlazada con los demás como se explica más arriba.</p>
      <h3>Lo que recomendamos</h3>
      <ul>
        <li><b>Uno o dos días antes de la carrera</b>, en casa y con Internet: abre la aplicación en cada uno de los ordenadores, para que
          todos tengan la misma versión.</li>
        <li><b>Sin Internet en la arena</b>: instala la aplicación en cada ordenador que lea tarjetas o imprima tiques; crea (o importa) el
          evento en uno de ellos; en cada uno de los demás, inicio › «En la red» › el evento › su código. Los teléfonos y las pantallas abren
          la dirección que da Preparar › Conexiones.</li>
        <li><b>Con Internet</b>: la pestaña «Chrono» de Ozimut en todas partes, o la aplicación, que añade la impresión silenciosa de los
          tiques — directamente en la impresora elegida, sin ventana de impresión — y una copia de la carrera en el disco del ordenador.</li>
      </ul>
      <p><b>Todavía sin probar en una arena real.</b> Los enlaces solo se han probado entre varias aplicaciones de un mismo ordenador, nunca
        todavía entre portátiles reales en la red de una arena. Algunas redes bloquean los anuncios: entonces sirve «¿No aparece un
        ordenador?».</p>` },
    { id: "tab", title: "Conectar la pestaña de Ozimut con la aplicación", html: `
      <p>La pestaña «Chrono» de un evento en ozimut.com sirve para preparar en casa y para cronometrar en una arena con Internet: los
        puestos abiertos en la pestaña se mantienen al día por la copia en Ozimut.</p>
      <p>En un ordenador en el que funciona la aplicación, la pestaña también puede enlazarse con ella: Preparar › Conexiones › «Buscar la
        aplicación en este ordenador» (Chrome o Edge). La barra superior muestra entonces «Aplicación» y después el número de otros
        ordenadores enlazados. Desde ese momento, el evento de la pestaña está también en la aplicación, con su registro en la carpeta, y los
        otros ordenadores de la arena pueden unirse a él con su código.</p>
      <p><b>La pestaña solo se enlaza con la aplicación de su propio ordenador</b>, nunca con la de otro: una página segura (https) no puede
        hablar con una página local no segura (http). Con Internet en la arena, todos pueden usar simplemente la pestaña; sin Internet, usa
        la aplicación en cada ordenador.</p>
      <p>Para qué sirve enlazar la pestaña con la aplicación: la pestaña tiene la sesión iniciada en Ozimut — la copia en Ozimut, los
        resultados en directo, «Publicar en Ozimut» —, y la aplicación enlaza los ordenadores de la arena sin Internet. En la pestaña, «Dar
        acceso a los demás puestos» crea una clave que viaja con la carrera: los ordenadores de la aplicación intercambian entonces también
        con Ozimut cuando tienen Internet.</p>
      <p>Si la pestaña responde «No se ha encontrado la aplicación Ozimut Chrono en este ordenador.»: comprueba que está en marcha y, si el
        navegador pide permiso para acceder a los dispositivos de la red local, concédelo.</p>` },
    { id: "print", title: "Imprimir los tiques sin ventana", html: `
      <p>En Preparar › Material › «Impresora de tiques», la aplicación añade una opción a «Imprimir en»: «La impresora elegida, sin
        ventana (aplicación)».</p>
      <ul>
        <li>«Impresora» lista las impresoras instaladas en el ordenador; la predeterminada lleva una estrella. Por tanto, la impresora
          de tiques tiene que estar antes instalada en el sistema, con su controlador.</li>
        <li>«Papel»: 58 mm u 80 mm. «Tique de prueba» lo comprueba todo.</li>
        <li>«Imprimir el tique en cuanto se lee una tarjeta» (o «Tique automático», en el puesto Meta) imprime sin preguntar nada.</li>
      </ul>
      <p>Las listas (resultados, listas de salida, facturas) pasan por la ventana de impresión del sistema. Los archivos exportados
        preguntan dónde guardarse: la carpeta de los eventos la primera vez, después la última carpeta usada.</p>` },
    { id: "readers", title: "Los lectores de tarjetas", html: `
      <p>Los botones son los de la pestaña: Preparar › Material › «SPORTident», «Emit» o «Emit eScan», o la cinta del puesto Meta. La
        aplicación elige el puerto ella misma: si solo hay un puerto serie, ese; si hay varios, el de la estación SPORTident; si siguen
        quedando varios, pregunta «¿Cuál es el del lector?».</p>
      <ul>
        <li>«Poner en hora» ajusta el lector a la hora del ordenador: comprueba antes la hora del ordenador.</li>
        <li><b>Emit</b>: el lector 250 y el MTR4. De un eScan o un eScan2 solo se reciben su estado y los pasos de emiTag, no el
          contenido de las tarjetas.</li>
      </ul>` },
    { id: "radio", title: "Las picadas por radio (SIRAP)", html: `
      <p>La aplicación escucha en el <b>puerto TCP 10000</b> las picadas que los repetidores de radio envían por el protocolo SIRAP.
        Ajusta el repetidor, o su programa, para que envíe a la dirección de este ordenador, puerto 10000.</p>
      <ul>
        <li>Las picadas van al <b>evento abierto en último lugar</b> en la aplicación.</li>
        <li>Aparecen en el puesto Speaker («Pasos por radio»). Marca «Control de radio» en la base, en el puesto «Controles».</li>
        <li>Una misma picada retransmitida dos veces cuenta una sola vez. Una tarjeta entera enviada por un repetidor se toma como una
          tarjeta leída.</li>
        <li>Si el puerto 10000 está ocupado por otro programa de cronometraje, la aplicación arranca sin la radio, y «Acerca de» lo
          dice. Cierra el otro programa y reinicia la aplicación.</li>
      </ul>` },
    { id: "data", title: "Dónde están los datos", html: `
      <ul>
        <li><b>Los eventos</b>: en Documentos › «Ozimut Chrono», un registro por evento, <code>&lt;evento&gt;.ozchrono.jsonl</code>. Cada
          operación se añade y se escribe en el disco en el momento en que ocurre; el archivo nunca se reescribe. Se vuelve a leer al
          reabrir el evento (una última línea cortada por un corte de corriente se ignora). Cada ordenador de la arena tiene el suyo,
          completo.</li>
        <li><b>El archivo <code>hub.json</code></b>, al lado, recuerda la identidad de este ordenador en la red, el último evento abierto, los
          códigos escritos para unirse a un evento y las direcciones añadidas a mano («¿No aparece un ordenador?»).</li>
        <li><b>Hacer una copia de seguridad</b> es copiar esa carpeta. Un registro se abre en otro ordenador con Archivo › «Abrir un
          archivo de evento…».</li>
        <li><b>Los ajustes</b>: <code>settings.json</code>, en la carpeta de ajustes de la aplicación — <code>%APPDATA%\\Ozimut Chrono</code>
          en Windows, <code>~/Library/Application Support/Ozimut Chrono</code> en macOS, <code>~/.config/Ozimut Chrono</code> en Linux: la
          clave de la aplicación (la que piden los teléfonos y los enlaces añadidos a mano), la última carpeta de guardado y, si la has
          desmarcado, la opción «Mantener Ozimut Chrono al día». Una línea <code>"folder"</code>, añadida a mano con la aplicación cerrada,
          pone los eventos en otra carpeta.</li>
        <li>El registro contiene nombres, clubes, números de licencia y de tarjeta, y el código del evento: guarda esa carpeta como guardas
          tus archivos de resultados.</li>
      </ul>
      <h3>Lo que sale del ordenador</h3>
      <p>Todo se queda en el ordenador, y en los ordenadores de la arena que enlaces. En la red local, la aplicación anuncia el nombre del
        ordenador, su versión, y el nombre y la fecha de sus eventos; solo intercambia una carrera con los ordenadores que conocen su código,
        o su clave. En Internet solo hace dos cosas: preguntar a GitHub si existe una versión nueva (consulta «Actualizar»; no se envía nada
        sobre el ordenador, sobre ti ni sobre tus eventos), y lo que tú le pidas con ozimut.com — un evento solo intercambia con Ozimut si la
        copia se ha preparado desde la pestaña de Ozimut («Dar acceso a los demás puestos»).</p>` },
    { id: "update", title: "Actualizar", html: `
      <p>Al arrancar, y después cada seis horas, la aplicación pregunta a GitHub si existe una versión más reciente. No se envía nada sobre
        el ordenador, sobre ti ni sobre tus eventos; sin Internet, no pasa nada. Lo que sigue depende de cómo se instaló la aplicación:</p>
      <ul>
        <li><b>Windows, instalada con <code>Ozimut-Chrono-Setup.exe</code>, y Linux (AppImage)</b>: la versión nueva se descarga en segundo
          plano y se instala <b>al cerrar la aplicación</b>. En la barra superior de un evento aparece entonces «Actualización x lista», y el
          menú Ayuda ofrece «Reiniciar e instalar la versión x». Reiniciar enseguida nunca es obligatorio; no lo hagas mientras se leen
          tarjetas, porque la aplicación se cierra un minuto.</li>
        <li><b>macOS y la versión portátil de Windows</b>: la aplicación solo avisa de que existe una versión nueva — «Versión x disponible»,
          y Ayuda › «Descargar la versión x…», que abre la página de descarga. Descárgala e instálala a mano, como la primera vez (consulta
          «Descargar, instalar, desinstalar»).</li>
        <li>Ayuda › «Buscar actualizaciones…» comprueba enseguida y da la respuesta. Ayuda › «Mantener Ozimut Chrono al día» (marcado por
          defecto) detiene o reanuda las comprobaciones.</li>
        <li><b>La versión</b> en uso está en Ayuda › «Acerca de Ozimut Chrono». Los eventos y los ajustes se conservan de una versión a
          otra.</li>
        <li>Un archivo de evento procedente de una versión más reciente se rechaza con un mensaje: actualiza la aplicación para abrirlo.</li>
      </ul>
      <h3>Antes de una carrera</h3>
      <p>Uno o dos días antes, abre la aplicación en casa, con Internet, <b>en cada uno de los ordenadores</b>, y deja que se actualice: así
        todos tendrán la misma versión. En la arena, sin Internet, los ordenadores enlazados en un evento avisan cuando sus versiones son
        distintas (Preparar › Conexiones, y el indicador de los enlaces se vuelve naranja): un equipo no debería cronometrar una carrera con
        versiones mezcladas.</p>
      <p>La aplicación todavía no está firmada: una versión descargada a mano provoca las mismas advertencias de Windows o de macOS que la
        primera vez (consulta «Descargar, instalar, desinstalar»).</p>` },
    { id: "trouble", title: "Si algo va mal", html: `
      <table>
        <thead><tr><th>Qué pasa</th><th>Qué hacer</th></tr></thead>
        <tbody>
          <tr><td>«Ozimut Chrono no puede arrancar»: los puertos 8377 a 8387 están todos ocupados.</td><td>La aplicación toma el puerto
            8377 o, si está ocupado, el primero libre hasta el 8387. Cierra el programa que los ocupa. Si el puerto no es el 8377, la
            dirección que hay que dar a los teléfonos cambia: Preparar › Conexiones y «Acerca de» dan la correcta.</td></tr>
          <tr><td>«No se puede usar la carpeta de datos».</td><td>No se puede escribir en la carpeta «Ozimut Chrono» de Documentos (carpeta
            protegida o en plena sincronización): libérala, o indica otra carpeta en <code>settings.json</code>.</td></tr>
          <tr><td>Otro ordenador no aparece en «En la red», la barra dice «Ningún otro ordenador», o «El otro ordenador no
            responde.»</td><td>Comprueba que está encendido, que la aplicación funciona en él y que está en la misma red. En el primer
            arranque, Windows pide una vez permitir Ozimut Chrono en las redes privadas: acéptalo (si no, permítelo en el cortafuegos de
            Windows). Algunas redes wifi aíslan los aparatos entre sí o bloquean los anuncios, como las redes públicas y las de los
            colegios: usa entonces «¿No aparece un ordenador?». Entre los ordenadores tienen que pasar el puerto UDP 8379 (los anuncios) y el
            puerto TCP 8377 (los enlaces y las páginas).</td></tr>
          <tr><td>«Ese no es el código de este evento.»</td><td>Vuelve a escribir el código que aparece en el otro ordenador, en Preparar ›
            Conexiones. Nunca contiene O, 0, I, L ni 1.</td></tr>
          <tr><td>«Versiones distintas: …», o el indicador de los enlaces está en naranja.</td><td>Los ordenadores enlazados no tienen la
            misma versión. Actualízalos todos con Internet antes de la carrera (consulta «Actualizar»); sin Internet en la arena, instala en
            cada uno el mismo archivo, descargado de antemano.</td></tr>
          <tr><td>Ayuda › «Buscar actualizaciones…» responde «No se puede contactar con el servidor de actualizaciones.»</td><td>El ordenador
            no tiene Internet, o GitHub no responde. No hay prisa: la aplicación vuelve a comprobarlo al arrancar y cada seis horas.</td></tr>
          <tr><td>Un teléfono no abre la dirección.</td><td>Comprueba que está en la misma red que el ordenador, que el cortafuegos de este
            deja pasar «Ozimut Chrono», que la wifi no aísla los aparatos entre sí, y que la dirección es la de Preparar › Conexiones o la de
            «Acerca de».</td></tr>
          <tr><td>La página pide una clave.</td><td>Escribe lo que sigue a <code>?k=</code> en la dirección que dan Preparar › Conexiones o
            «Acerca de».</td></tr>
          <tr><td>Windows o el antivirus bloquea la aplicación.</td><td>Todavía no está firmada: consulta «Descargar, instalar,
            desinstalar».</td></tr>
          <tr><td>No se ve el lector de tarjetas.</td><td>Comprueba el cable y el controlador USB del lector; cierra cualquier otro
            programa que tenga su puerto (otro programa de cronometraje, la herramienta de configuración de las estaciones, una pestaña
            de Chrono abierta en un navegador); desenchúfalo y vuelve a enchufarlo, y después «Desconectar» y vuelve a conectar el lector
            en Chrono.</td></tr>
          <tr><td>El tique no sale.</td><td>Imprime un «Tique de prueba»; comprueba la impresora elegida, el papel, y que la impresora
            imprime desde otro programa.</td></tr>
          <tr><td>Las picadas por radio no llegan.</td><td>«Acerca de» dice si el puerto 10000 está ocupado; comprueba la dirección y el
            puerto ajustados en el repetidor, y que el evento correcto se ha abierto en último lugar.</td></tr>
          <tr><td>La ventana se queda vacía o bloqueada.</td><td>Ver › «Recargar». No se pierde nada: la carrera está en el registro.</td></tr>
        </tbody>
      </table>` },
  ],
};
