// The documentation of Ozimut Chrono's desktop application, in Spanish (chronoapp.fr.js is the reference: the same
// sections under the same ids). Plain data read by the application's own page (chrono/ui/appdoc.js) and by Orga's
// documentation on the site (content/guide.es.js, chapter « chrono-app »).
export default {
  title: "La aplicación Ozimut Chrono",
  lede: "El cronometraje de Ozimut instalado en un ordenador: sin Internet, varios puestos conectados, tiques impresos sin ventana. Esta guía es la misma en la aplicación (Ayuda › Documentación) y en la documentación de Orga en ozimut.com.",
  sections: [
    { id: "what", title: "Para qué sirve la aplicación", html: `
      <p>La aplicación Ozimut Chrono muestra las mismas pantallas que la pestaña «Chrono» de un evento de Orga, en ozimut.com. Además hace
        lo que una pestaña de navegador no puede hacer:</p>
      <ul>
        <li>funciona <b>sin Internet</b>;</li>
        <li>sirve de <b>concentrador</b>: los demás ordenadores y los teléfonos de la red local abren su dirección en el navegador y
          trabajan en la misma carrera;</li>
        <li>escribe cada operación en un <b>registro</b>, un archivo por evento en una carpeta del ordenador;</li>
        <li>imprime los tiques <b>sin ventana de impresión</b>;</li>
        <li>recibe las <b>picadas por radio</b> de los repetidores (protocolo SIRAP).</li>
      </ul>
      <p><b>La pestaña sola basta</b> cuando cronometra un único ordenador, o cuando todos los puestos tienen Internet: entonces se
        mantienen al día por la copia en Ozimut. Para conectar un lector de tarjetas hace falta Chrome o Edge.</p>
      <p><b>En pruebas.</b> Como el propio Chrono, la aplicación nunca se ha usado todavía con estaciones SPORTident o Emit reales, ni con
        una impresora de tiques, ni en una competición real. Pruébala en un entrenamiento o junto a tu programa habitual.</p>` },
    { id: "install", title: "Descargar e instalar", html: `
      <p>Los archivos se descargan desde Ozimut: Orga › Mis eventos › un evento › pestaña «Chrono» › Preparar › Conexiones › «Descargar la
        aplicación».</p>
      <table>
        <thead><tr><th>Sistema</th><th>Archivo</th><th>Qué es</th></tr></thead>
        <tbody>
          <tr><td>Windows</td><td><code>Ozimut-Chrono-Setup.exe</code></td><td>El instalador, recomendado (unos 100 MB). Instala la
            aplicación para tu propia cuenta, sin derechos de administrador.</td></tr>
          <tr><td>Windows</td><td><code>Ozimut-Chrono-Portable.exe</code></td><td>La versión portátil: un solo programa, no se instala nada.
            Se ejecuta desde donde quieras, por ejemplo desde una memoria USB.</td></tr>
          <tr><td>macOS</td><td><code>Ozimut-Chrono.dmg</code></td><td>Una sola imagen de disco para todos los Mac, con chip de Apple o
            Intel: ábrela y arrastra la aplicación a Aplicaciones.</td></tr>
          <tr><td>Linux</td><td><code>Ozimut-Chrono.AppImage</code></td><td>Un solo archivo (64 bits). Hazlo ejecutable — Propiedades ›
            Permisos, o <code>chmod +x Ozimut-Chrono.AppImage</code> — y ejecútalo.</td></tr>
        </tbody>
      </table>
      <p><b>Mientras la aplicación no esté firmada</b>, el sistema desconfía de ella en el primer arranque:</p>
      <ul>
        <li><b>Windows</b> muestra «Windows protegió su PC»: elige «Más información» y luego «Ejecutar de todas formas».</li>
        <li><b>macOS</b> se niega primero a abrirla. En las versiones recientes: Ajustes del Sistema › Privacidad y seguridad, y luego
          «Abrir igualmente». En las versiones anteriores: clic derecho en la aplicación, «Abrir», y confirma.</li>
      </ul>` },
    { id: "first", title: "Primer arranque", html: `
      <p>La ventana se abre en el inicio: la lista «Eventos» y la tarjeta «Nuevo evento» (un nombre, una fecha, las reglas del país —
        Francia, Canadá o reglas de la IOF — y «Crear»). Con el evento abierto, todo funciona como en la pestaña: los puestos Preparar,
        Secretaría, Salida, Meta, Seguimiento, Speaker, Juez, Controles y Cerrar, descritos en la documentación de Orga, capítulo
        «Chrono».</p>
      <ul>
        <li><b>La carpeta de los eventos</b> es «Ozimut Chrono», en tus Documentos; la aplicación la crea. Archivo › «Abrir la carpeta de
          datos» la muestra.</li>
        <li><b>Un archivo de evento</b> (.ozchrono) se abre con doble clic (con la versión instalada), o con Archivo › «Abrir un archivo
          de evento…»: sus operaciones se añaden a ese evento en la aplicación, sin duplicar nada, y el evento se abre.</li>
        <li><b>Una sola aplicación a la vez</b>: arrancarla una segunda vez trae la ventana ya abierta.</li>
        <li><b>El cortafuegos</b>: en el primer arranque, Windows puede preguntar si deja que otros ordenadores alcancen la aplicación.
          Acéptalo para las redes privadas si otros puestos tienen que conectarse.</li>
        <li><b>El menú</b>: Archivo (abrir un archivo, abrir la carpeta, salir), Edición, Ver (recargar, zoom, pantalla completa), Ayuda ›
          «Documentación» (<kbd>F1</kbd>) y «Acerca de Ozimut Chrono», que da la versión, las direcciones para los demás puestos, el
          puerto de las picadas por radio y la carpeta de datos.</li>
      </ul>` },
    { id: "hub", title: "Conectar otros ordenadores y teléfonos", html: `
      <p>La aplicación es un concentrador: todos los aparatos de la misma red local — basta un punto de acceso wifi o un simple router,
        sin Internet — pueden trabajar en la misma carrera.</p>
      <ol>
        <li>En el ordenador de la aplicación, abre Ayuda › «Acerca de Ozimut Chrono»: la ventana da la dirección que hay que abrir, del
          tipo <code>http://192.168.1.20:8377/?k=…</code>. Lo que sigue a <code>?k=</code> es la <b>clave</b> del concentrador.</li>
        <li>En el otro ordenador o en el teléfono, abre esa dirección en el navegador. Sin la clave, la página la pide en un campo
          marcado con una llave.</li>
        <li>Elige el evento en la lista. Este puesto ve la carrera en unos instantes y escribe en ella como los demás.</li>
      </ol>
      <p>Un puesto que pierde la red sigue solo y se vuelve a conectar por sí mismo cuando vuelve; no se pierde nada.</p>
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
      <h3>Los lectores de tarjetas en los demás puestos</h3>
      <p>Un navegador solo deja que una página hable con un lector de tarjetas, o con una impresora de tiques en puerto serie, si la
        página viene de un sitio seguro o del propio ordenador. Por eso, una página abierta en la dirección del concentrador desde otro
        ordenador no puede leer tarjetas: sirve para la secretaría sin lector, la salida, el seguimiento, el speaker, el juez. Para un
        segundo puesto de lectura:</p>
      <ul>
        <li>con Internet: abre en ese ordenador la pestaña «Chrono» del evento en ozimut.com, en Chrome o Edge; se mantiene al día por
          la copia en Ozimut;</li>
        <li>sin Internet: instala también allí la aplicación, abre en ella el archivo del evento (.ozchrono) guardado en el primer
          ordenador y después, en Preparar › Conexiones, indica la dirección del primero (<code>192.168.1.20:8377</code>) y la «Clave del
          concentrador», y «Conectar». Hay que repetirlo cuando se reinicia la aplicación.</li>
      </ul>` },
    { id: "tab", title: "Conectar la pestaña de Ozimut con la aplicación", html: `
      <p>En el ordenador de la aplicación, abre también la pestaña «Chrono» del evento en ozimut.com (Chrome o Edge) y luego Preparar ›
        Conexiones › «Buscar la aplicación en este ordenador». La pestaña se conecta con la aplicación, y la barra superior muestra
        «Concentrador». Desde ese momento, el evento de la pestaña está también en la aplicación, con su registro en la carpeta.</p>
      <p>Para qué sirve: la pestaña tiene la sesión iniciada en Ozimut — la copia en Ozimut, los resultados en directo, «Publicar en
        Ozimut» —, y la aplicación conecta los puestos de la zona de competición sin Internet. En la pestaña, «Dar acceso a los demás
        puestos» crea una clave que viaja con la carrera: los puestos de la aplicación intercambian entonces también con Ozimut cuando
        tienen Internet.</p>
      <p>Si la pestaña responde «No se ha encontrado la aplicación Ozimut Chrono en este ordenador»: comprueba que está en marcha y, si
        el navegador pide permiso para acceder a los dispositivos de la red local, concédelo.</p>` },
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
          reabrir el evento (una última línea cortada por un corte de corriente se ignora). El archivo <code>hub.json</code>, al lado,
          recuerda la identidad del concentrador y el último evento abierto.</li>
        <li><b>Hacer una copia de seguridad</b> es copiar esa carpeta. Un registro se abre en otro ordenador con Archivo › «Abrir un
          archivo de evento…».</li>
        <li><b>Los ajustes</b>: <code>settings.json</code>, en la carpeta de ajustes de la aplicación (<code>%APPDATA%\\Ozimut Chrono</code>
          en Windows): la clave del concentrador y la última carpeta de guardado. Una línea <code>"folder"</code>, añadida a mano con la
          aplicación cerrada, pone los eventos en otra carpeta.</li>
        <li><b>La aplicación en sí no envía nada a ningún sitio.</b> Un evento solo intercambia con Ozimut si la copia se ha preparado
          desde la pestaña de Ozimut («Dar acceso a los demás puestos»).</li>
        <li>El registro contiene nombres, clubes, números de licencia y de tarjeta: guarda esa carpeta como guardas tus archivos de
          resultados.</li>
      </ul>` },
    { id: "update", title: "Actualizar, desinstalar", html: `
      <ul>
        <li><b>La versión</b> está en Ayuda › «Acerca de Ozimut Chrono».</li>
        <li><b>Actualizar</b>: la aplicación no se actualiza sola. Descarga el archivo nuevo en el mismo sitio y ejecútalo; el instalador
          sustituye la versión instalada. Para la versión portátil y el AppImage, sustituye el archivo. Los eventos y los ajustes se
          conservan.</li>
        <li>Un archivo de evento procedente de una versión más reciente se rechaza con un mensaje: actualiza la aplicación para abrirlo.</li>
        <li><b>Desinstalar</b>: en Windows, Configuración › Aplicaciones › Ozimut Chrono › Desinstalar (versión portátil: borra el
          archivo); en macOS, mueve la aplicación a la Papelera; en Linux, borra el AppImage. La carpeta de los eventos y los ajustes
          se quedan: bórralos a mano si lo deseas.</li>
      </ul>` },
    { id: "trouble", title: "Si algo va mal", html: `
      <table>
        <thead><tr><th>Qué pasa</th><th>Qué hacer</th></tr></thead>
        <tbody>
          <tr><td>«Ozimut Chrono no puede arrancar»: los puertos 8377 a 8387 están todos ocupados.</td><td>La aplicación toma el puerto
            8377 o, si está ocupado, el primero libre hasta el 8387. Cierra el programa que los ocupa. Si el puerto no es el 8377, la
            dirección que hay que dar a los demás puestos cambia: «Acerca de» da la correcta.</td></tr>
          <tr><td>«No se puede usar la carpeta de datos».</td><td>No se puede escribir en la carpeta «Ozimut Chrono» de Documentos (carpeta
            protegida o en plena sincronización): libérala, o indica otra carpeta en <code>settings.json</code>.</td></tr>
          <tr><td>Otro ordenador o un teléfono no abre la dirección.</td><td>Comprueba que está en la misma red; que el cortafuegos del
            ordenador de la aplicación deja alcanzarla (permite «Ozimut Chrono» en las redes privadas); que la red wifi no aísla los
            aparatos entre sí, como hacen las redes públicas; que la dirección es la de «Acerca de».</td></tr>
          <tr><td>La página pide una clave.</td><td>Escribe lo que sigue a <code>?k=</code> en la dirección que da «Acerca de».</td></tr>
          <tr><td>Windows o el antivirus bloquea la aplicación.</td><td>Todavía no está firmada: consulta «Descargar e instalar».</td></tr>
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
