// The privacy policy and legal notices, in Spanish — a translation for information; the French version (privacy.fr.js, the
// reference) prevails. Keep the two in step.
// world: registration open to every orienteer (privacy.fr.js, which prevails).
export const body = (SITE, { world = false, later = "" } = {}) => `
      <p class="muted"><i>Esta versión en español se ofrece a título informativo; prevalece la versión francesa.</i></p>
      <p>${SITE} es un sitio independiente, sin vínculo con la Federación Francesa de Orientación (Fédération française de course
        d'orientation, FFCO). Lo edita a título personal y sin ánimo de lucro <b>Yann Le Helloco</b>, responsable del tratamiento de
        los datos personales descritos a continuación en el sentido del Reglamento (UE) 2016/679 (RGPD). Contacto: <b>contact@ozimut.com</b>.</p>
      <h2 style="font-size:16px">Condiciones de uso</h2>
      <p>${SITE} funciona con recursos gratuitos y limitados, compartidos entre todos sus usuarios. Está destinado a ser
        consultado personalmente por ${world ? "sus usuarios" : "los federados"}, mediante un navegador. Salvo acuerdo previo del editor, quedan por tanto
        prohibidos: la recogida automatizada (robots, scripts, extracción de páginas o de archivos de datos), el uso de sus contenidos para entrenar, ajustar o alimentar modelos de inteligencia artificial, las descargas
        masivas, la reutilización de los datos con otros fines y cualquier uso que pueda sobrecargar el sitio en detrimento de los demás
        usuarios. Una cuenta que no respete estas reglas puede ser suspendida.</p>
      <p>Para una necesidad particular (un estudio, las necesidades de un club o de una liga regional, datos destinados a otra herramienta), puedes
        escribir al editor, desde la página «Contacto» o a contact@ozimut.com: la solicitud será examinada.</p>
      <h2 style="font-size:16px">Independencia y fuentes</h2>
      <p>${SITE} es independiente, no oficial y abierto a todos, sin vínculo con ninguna federación ni ningún organizador. Sus fuentes: para Francia,
        los resultados, la clasificación nacional (CN) y el calendario publicados por la Federación Francesa de Orientación (FFCO)
        en cn.ffcorientation.fr y ffcorientation.fr, que siguen siendo la referencia; para España, el calendario y las inscripciones
        publicados por la Federación Española de Orientación (FEDO) en sico.fedo.org, y los resultados publicados en O-Replay (oreplay.es); para
        todas las carreras, los resultados y horarios que publican los organizadores (su web, liveresultat, WinSplits, Helga,
        Orientation Data, O-Replay) o que suben a ${SITE}.</p>
      <p>El calendario de los demás países recoge los calendarios que publican sus federaciones, cada uno citado bajo la prueba («Ver
        en …»). La región y el departamento (o su equivalente) de una prueba se obtienen a partir de su lugar gracias a los
        nombres de lugares de GeoNames (<a href="https://www.geonames.org/" target="_blank" rel="noopener">geonames.org</a>), bajo
        licencia <a href="https://creativecommons.org/licenses/by/4.0/deed.fr" target="_blank" rel="noopener">Creative Commons
        Attribution 4.0</a>.</p>
      <p>Para España, ${SITE} recoge los resultados públicos de las carreras (nombre, club, categoría, tiempo, tiempos parciales) y el
        número de inscritos por categoría; para reconocer a un mismo corredor de una carrera a otra, lee también la lista pública
        de federados de la FEDO (nombre, club, federación autonómica, número de licencia y de pinza), de la que no muestra ningún número. Al ser públicos estos resultados,
        son visibles para todos, con o sin cuenta. Toda persona afectada puede pedir que deje de ser identificada en ellos (ver
        «Tus derechos»).</p>
      <h2 style="font-size:16px">Acceso e imágenes del sitio</h2>
      ${later ? `<p>${later}</p>` : ""}
      <p>Una parte del sitio se consulta sin cuenta; una cuenta da acceso a las alertas y a compartir
        tracks GPS, y el historial completo de la clasificación está reservado a los federados de la federación: en Francia, una cuenta que se ha unido
        a Francia, con su número de licencia FFCO verificado a partir del nombre. Los países cuyos resultados son todos públicos (España)
        están abiertos a todos.</p>
      <p>Las capturas de pantalla de la página de inicio se han tomado sobre una copia alterada de los datos: nombres, licencias, clubes y tiempos
        son inventados o modificados, y no corresponden a nadie. Los recuadros marcados «Maqueta» son ilustraciones.</p>
      <h2 style="font-size:16px">Datos de los resultados, incluidos los de los federados sin cuenta</h2>
      <p>Las clasificaciones, resultados y cálculos mostrados proceden de los resultados publicados por la FFCO en cn.ffcorientation.fr: nombre,
        club, categoría, número de licencia, tiempo y puesto de cada federado clasificado, tenga o no una cuenta en ${SITE},
        incluidos los federados menores de edad. ${SITE} obtiene de ellos CN recalculados, clasificaciones, comparaciones y estadísticas (clubes,
        territorios, pirámide de edades, corredores coincidentes en carrera). La página «Resultados» presenta además, para las carreras de los
        últimos 60 días, los resultados publicados por los propios organizadores (en su web, liveresultat, WinSplits, Helga, etc.)
        o subidos a ${SITE}, asociados a las licencias a partir del nombre y el club.</p>
      <p>Este tratamiento se basa en el interés legítimo del editor en informar a los federados y analizar la clasificación nacional a
        partir de resultados ya publicados. En ${SITE}, estos datos están abiertos en la medida en que la FFCO los publica ella misma: sin
        cuenta${world ? ", o con una cuenta que no se ha unido a Francia," : ""} se ven las carreras, los resultados y la clasificación de las
        temporadas que la FFCO muestra en su web sin pedir inicio de sesión, así como los resultados publicados por los organizadores (nombre,
        club, categoría, tiempo), sin CN ni puntuación. Las temporadas más antiguas, que la FFCO reserva a sus federados, y los historiales
        y estadísticas que se derivan de ellas solo son accesibles para las cuentas con sesión iniciada${world ? " que se han unido a Francia" : ""}, cuyo
        número de licencia FFCO se verifica a partir del nombre. Única excepción: el editor puede abrir,
        por un tiempo limitado, una cuenta de demostración a una entidad de orientación (federación, liga regional, club) que
        desee conocer el sitio; esa cuenta no está vinculada a ninguna licencia, no puede modificar ni subir nada y deja de
        funcionar en la fecha fijada. Toda persona afectada puede solicitar su rectificación o pedir que deje de ser identificada en ellos (ver
        «Tus derechos»); la fuente sigue siendo la web de la FFCO.</p>
      <h2 style="font-size:16px">Directorio de clubes, comités y ligas regionales</h2>
      <p>La pestaña «Directorio» de la página Clubes recoge, para cada liga regional, comité departamental y club, lo que la FFCO publica en
        sus páginas de estructuras y en su directorio de clubes: su número, su web y sus datos de contacto — los nombres y cargos de los
        miembros de su junta directiva (presidente, secretario, tesorero), su teléfono y su dirección de correo electrónico. La dirección postal no se
        recoge. Estos datos de contacto solo se muestran a las cuentas con sesión iniciada cuya licencia FFCO está verificada (no a los visitantes sin
        cuenta, ni a las cuentas de demostración), y se releen cada semana: lo que la FFCO retira desaparece de ${SITE} en la
        siguiente lectura. Base jurídica: el interés legítimo del editor en ayudar a los federados a contactar con las estructuras de su
        deporte, a partir de información que la FFCO publica ella misma. Toda persona afectada puede oponerse o solicitar su
        rectificación (ver «Tus derechos»); la fuente sigue siendo la web de la FFCO.</p>
      <h2 style="font-size:16px">Archivos de resultados y de horarios de salida subidos</h2>
      <p>Al subir un archivo de resultados, se registran la cuenta de quien lo sube, la carrera, el nombre y el tamaño del
        archivo y la fecha de subida. El archivo se conserva 60 días en el espacio de almacenamiento del sitio (Cloudflare) y después se
        borra; los resultados que contiene siguen mostrándose. El administrador ve quién ha subido cada archivo y puede retirar un
        archivo. Los horarios de salida que un organizador sube antes de la carrera (pestaña «Salidas» de un evento, en Orga) siguen las mismas
        reglas; solo se publican los nombres, clubes, categorías y horas de salida, y los organizadores de la carrera pueden
        retirarlos. Una competición que un organizador crea fuera del calendario de la federación (ver «Eventos de los organizadores») se publica en
        el Calendario con su nombre, fecha, lugar, club, disciplina y web, sin que se publique quién la creó. Un organizador también puede indicar el enlace del seguimiento GPS de su competición en otro
        servicio (pestaña «Directo» de su evento): solo se publica ese enlace, y la cuenta que lo indicó se guarda sin publicarse; Ozimut no
        recibe ninguna posición.</p>
      <h2 style="font-size:16px">Eventos de los organizadores (Orga)</h2>
      <p>Una cuenta que crea un evento —una carrera o un entrenamiento— en Orga forma su equipo. El sitio guarda: la
        descripción del evento (nombre, fecha, lugar, club, disciplina, formato, sitio web) y la cuenta que lo creó; su posible vinculación
        a una competición del calendario de la federación; su equipo (las cuentas miembros, la fecha en que entró cada una y el miembro que
        la aceptó); las solicitudes para unirse a él (la cuenta que lo pide, un mensaje opcional de 300 caracteres como máximo, la fecha, la
        respuesta y el miembro que la dio). Nadie es añadido a un equipo por su nombre, su licencia o su correo electrónico: se pide entrar,
        y un miembro acepta o rechaza; los miembros reciben una notificación de cada solicitud, y la persona, de la respuesta. Los miembros de
        un equipo ven los nombres y los clubes de los demás y de las personas que piden entrar; las demás cuentas solo ven de un equipo el
        nombre de pila y la inicial del apellido de dos de sus miembros como máximo. Los administradores del sitio ven los eventos y
        confirman las vinculaciones que piden cuentas que no son miembros del club organizador. Base jurídica: la ejecución del servicio
        solicitado. Al eliminar una cuenta, esta sale de sus equipos y sus solicitudes se borran; un evento del que era el último miembro
        queda en manos de los administradores, y lo que el evento publicó se mantiene. Un trazado de recorridos vinculado a un evento conserva su propio equipo (ver «Trazado de
        recorridos»): el equipo del evento solo ve que existe, el nombre de quien lo empezó y cuántas personas tiene su equipo de trazado.</p>
      <h2 style="font-size:16px">Análisis de tracks GPS</h2>
      <p>La página «Análisis individual» lee el mapa y el track GPS en tu navegador: no se transmite ningún dato al sitio, y esos
        archivos solo se conservan durante la visita.</p>
      <p>En el análisis de un entrenamiento o de una competición, el organizador sube los mapas y los recorridos, y cada
        participante puede añadir su propio track. Este se transmite entonces y se conserva en el espacio de almacenamiento del sitio
        (Cloudflare), con el nombre y el número de licencia del participante, reducido a las posiciones y horas situadas dentro de la superficie de
        el mapa (sin frecuencia cardiaca, cadencia ni trayecto fuera del mapa). Es visible para las personas autorizadas a abrir
        el análisis, según lo que elija el organizador: todos los federados con sesión iniciada, los miembros de su club o quienes tengan la
        contraseña. Cada participante puede retirar su track en cualquier momento; se borra con el análisis y con su cuenta. Los
        mapas de un análisis se conservan mientras este exista; si el organizador elimina su cuenta, el análisis se mantiene,
        sin su nombre. Los archivos OCAD o Mapper de los que proceden sus recorridos solo se guardan si el organizador lo elige («Ponerlos a disposición del trazado del evento», marcado por defecto): solo los organizadores del análisis tienen acceso a ellos, para el trazado del evento, y se eliminan con él. En el análisis de un evento, tus propias gráficas (ritmo, frecuencia cardiaca, cadencia, etc.) proceden de tu
        archivo, guardado en tu navegador en este dispositivo: no se transmite, y solo tú tienes acceso a él.</p>
      <p>El comentario que escribes sobre tu carrera lo ven
        las mismas personas que tu track; lo cambias o lo borras cuando quieras. Si el organizador abre el análisis a los visitantes sin
        cuenta, tu track y tu comentario solo se les muestran si lo aceptas (una casilla sin marcar por defecto), con tu nombre pero sin tu
        número de licencia; retiras ese acuerdo cuando quieras. En « Mis mapas », el comentario que escribes sobre una carrera se guarda
        con ella y sigue las mismas reglas.</p>
      <p>Para ayudar al organizador a decidir (publicar, abrir o cerrar una función), un análisis cuenta quién lo abre y quién
        reproduce un recorrido en solitario en «Análisis individual» sobre su mapa: el número de tu cuenta, el primer y el último día y
        el número de días, como mucho una vez al día; para los visitantes sin cuenta, solo un número por día. Los organizadores solo
        ven totales, nunca quién; a ellos no se les cuenta. Estos registros se borran con el análisis, con el recorrido afectado y con
        tu cuenta.</p>
      <h2 style="font-size:16px">Mis mapas</h2>
      <p>«Mis mapas» guarda los mapas que guardas allí (desde «Análisis individual») o importas (archivos JPEG de QuickRoute o de
        Ozimut), y los recorridos que hiciste en ellos, en el almacenamiento del sitio (Cloudflare): la imagen del mapa tal como la
        diste, su título, su fecha, su lugar y tus notas, y para cada carrera las posiciones en el mapa y las horas, nunca el archivo
        GPS en sí. La frecuencia cardiaca, la altitud y la cadencia solo se guardan si marcas la casilla prevista (sin marcar por
        defecto): son datos de salud, guardados con tu consentimiento, que retiras eliminando la carrera. Solo tú ves estos mapas. Si
        creas un enlace para compartir (a todos tus mapas o a uno), cualquiera que tenga el enlace los ve con tu nombre, incluso sin
        cuenta, pero nunca la frecuencia cardiaca ni los demás datos personales; eliminar el enlace pone fin al uso compartido. También puedes compartir toda tu biblioteca con cuentas de Ozimut que elijas: la ven en «Mis mapas», sin tus mapas privados ni tus datos personales, hasta que retires ese uso compartido. Para elegir esas cuentas, una cuenta puede buscar otras por su nombre: ve su nombre y su club, nada más. Puedes
        eliminar una carrera o un mapa en cualquier momento; todo se borra con tu cuenta. Una solicitud de importación desde DOMA es un
        mensaje enviado al equipo de Ozimut, como los de «Contacto».</p>
      <p>Si marcas «Guardar el análisis» junto a «Ver la carrera» en «Análisis individual» (marcado por defecto), el mapa y tu carrera — solo posiciones y horas, nada más del reloj — se guardan en tu cuenta, aparte de «Mis mapas»: solo tú los ves, en «Análisis», donde vuelves a reproducir o borras el análisis. Un mapa se guarda allí una sola vez y se va con el último análisis que lo muestra.</p>
      <p>Una biblioteca de «Mis mapas» guarda 1 GB como máximo (los mapas originales y las carreras). Los administradores del sitio pueden ver los mapas enviados a Ozimut — en «Mis mapas», «Análisis individual», los análisis de los organizadores y el trazado — y guardar una copia, salvo los que marques como «Mapa privado» al enviarlos en «Mis mapas», «Análisis individual» o el trazado; nunca tus carreras, tus comentarios ni los recorridos, ni el mapa de un evento cifrado. Estos mapas se quedan cuando se borra la cuenta, sin tu nombre.</p>
      <h2 style="font-size:16px">Seguimiento GPS y Mis trazas</h2>
      <p>El seguimiento GPS (en pruebas, abierto por ahora solo a los administradores del sitio, a algunos probadores y a las cuentas de niños que crean) registra la posición de una cuenta durante una carrera, una posición por segundo, con la aplicación Ozimut en un teléfono, un Apple Watch o un reloj Garmin, o la aplicación Traccar Client. No se registra nada fuera de una carrera iniciada por la persona (o por su padre o madre en su dispositivo). Se guardan: las posiciones, su hora y su precisión, la altitud cuando el dispositivo la da, la batería del dispositivo; para cada dispositivo, su tipo, su modelo, la versión de la aplicación, la fecha en que se vio por última vez y el identificador de notificaciones de su sistema (Google o Apple) para enviarle las alertas. Las posiciones se transmiten por paquetes y se guardan en el almacenamiento del sitio (Cloudflare, Unión Europea y Estados Unidos); una carrera se guarda 30 días en « Mis trazas », más tiempo solo si la abres en un análisis o la guardas en « Mis mapas ».</p>
      <p>Solo ven una carrera en directo y reciben sus alertas (salida, llegada, petición de ayuda, sin posición, inmóvil, batería baja, salida de la zona) las cuentas que la persona, o su padre o madre, ha autorizado expresamente mediante una invitación; esa autorización puede retirarse en cualquier momento. Una carrera marcada como privada no la ve nadie más. Las trazas importadas (archivo, Salud de Apple, Polar) siguen siendo privadas. Vincular Polar da a Ozimut acceso a tus entrenamientos de Polar hasta que lo retires; Ozimut solo guarda el recorrido GPS de cada uno.</p>
      <h2 style="font-size:16px">Ozitrac</h2>
      <p>La aplicación Ozitrac sigue un teléfono en directo sin cuenta. El teléfono seguido crea un « canal » en el relé de Ozimut, designado por un número aleatorio; cada teléfono que lo sigue se une escaneando un código y recibe una clave que el relé nunca ve. Las posiciones se cifran para cada uno de esos teléfonos: el relé no puede leerlas, ni los nombres intercambiados. Guarda la carrera en curso, sus horas de envío, el nivel de batería y el tipo de las alertas (salida, llegada, petición de ayuda, sin posición, batería baja, inmóvil, salida de la zona), borrados 24 horas después del final de la carrera o al empezar la siguiente, y, para enviar las notificaciones, el token de notificación de cada teléfono que sigue. Un canal sin usar durante 180 días se borra; « Borrar mis datos » en la aplicación lo borra en el acto. Cada carrera se guarda en el propio teléfono seguido. Vinculada con una cuenta de Ozimut, la aplicación también envía sus carreras a esa cuenta: se aplica entonces el apartado anterior.</p>
      <h2 style="font-size:16px">Cuentas de los niños</h2>
      <p>Cuando el seguimiento esté abierto a todos, nadie menor de 15 años creará una cuenta solo: el registro pide el año de nacimiento y, para un niño más pequeño, es su padre o su madre quien crea y gestiona la cuenta, sin dirección de correo electrónico ni contraseña. El padre o la madre vincula los dispositivos del niño, elige quién puede seguirlo y puede eliminar la cuenta en cualquier momento; puede añadirse un segundo padre o madre mediante una invitación. La cuenta de un niño solo guarda su nombre, sus apellidos, su año de nacimiento, en su caso su número de licencia, y sus trazas. Una cuenta personal ya abierta por un menor de 15 años espera a que se le vincule su padre o su madre: hasta entonces sus trazas siguen siendo privadas y no se envía ninguna alerta. A partir de los 15 años, el joven puede encargarse de su cuenta (su propia dirección y contraseña); sus trazas y su historial siguen siendo suyos, y sus padres pasan a ser personas que pueden seguirlo, lo que puede cambiar. Cuando un padre o una madre elimina su cuenta, la cuenta del niño del que era el único responsable se elimina con todas sus trazas.</p>
      <h2 style="font-size:16px">Cronometraje (Ozimut Chrono)</h2>
      <p>Ozimut Chrono, la herramienta de cronometraje de los organizadores (en pruebas, por ahora solo para los administradores del sitio), trabaja primero en el ordenador del organizador: los inscritos de una carrera (apellidos, nombre, club, categoría, número de licencia, número de tarjeta, hora de salida, cuota y pago), el contenido de las tarjetas leídas y las correcciones hechas a mano se guardan allí, en el navegador o en la aplicación. Cuando el puesto está conectado a Ozimut, estas operaciones se copian en Ozimut para que la carrera pueda retomarse en otro ordenador; solo los organizadores del evento acceden a ellas, y nada se publica sin su intervención (resultados en directo, publicación de los resultados). El archivo de federados y los números de tarjeta recordados de una carrera a otra se quedan en el ordenador del organizador: no se envían a Ozimut.</p>
      <h2 style="font-size:16px">Clubes (Mi club)</h2>
      <p>Un club, un comité o una federación territorial existe en Ozimut en cuanto una cuenta lo necesita. En Francia, una cuenta cuya
        licencia es la de un club (el club de su última carrera en los resultados publicados) es miembro de él automáticamente; en otros
        países, pides unirte a un club o te invitan con un enlace. Los miembros de un club ven los nombres de los demás miembros y sus
        funciones (responsable, organizador, cartógrafo, tesorero); sus responsables ven además las solicitudes pendientes. Un miembro de
        la junta que nombra el directorio de la federación (presidente, secretario, tesorero: se compara el nombre de la cuenta con el del
        directorio) pasa a ser responsable del club en el acto; cualquier otra persona, con el acuerdo de los administradores del sitio.
        Los ajustes del club (qué inscripciones paga, su cuenta bancaria, su dirección de contacto) solo los ven sus responsables y
        tesoreros; el titular y el IBAN de la cuenta solo se muestran a quienes se han inscrito en una carrera del club o le deben algo.</p>
      <h2 style="font-size:16px">Inscripciones a las carreras</h2>
      <p>Cuando los organizadores de un evento abren las inscripciones, una cuenta se inscribe a sí misma, a los corredores que añade a
        «Mis corredores» (familia, amigos, con o sin licencia: se compromete a hacerlo con su consentimiento) y a las cuentas de sus hijos.
        Una inscripción guarda el nombre, los apellidos, el club y su país, el número de licencia si se indica, el año de nacimiento, el
        sexo y la categoría de edad, la categoría elegida, el número de tarjeta o el alquiler de una tarjeta, las opciones, la hora de
        salida, el importe fijado al inscribirse, quién lo paga (el corredor o su club), su referencia de pago y su estado (pendiente,
        pagado, exento, y cómo). Una inscripción hecha sin cuenta crea una cuenta como el registro en el sitio; queda pendiente hasta
        que se confirma el correo y se anula a los tres días sin confirmación. El equipo del evento ve toda esta información; la lista
        pública de inscritos solo muestra el nombre, el club, la categoría y la hora de salida, nunca el número de licencia, la tarjeta, el
        año de nacimiento, el importe ni el pago. Los organizadores también pueden importar inscritos desde un archivo; responden de
        ello. Al cierre, las horas pasan a ser la lista de salida publicada de la competición. Cuando se elimina una cuenta, sus
        inscripciones y las que hizo para otros a carreras futuras se anulan; las de carreras pasadas conservan el nombre de los
        corredores en los registros de los organizadores, sin vínculo con la cuenta. «Mis corredores» se elimina con la cuenta.</p>
      <h2 style="font-size:16px">Cuentas de los clubes</h2>
      <p>Ningún pago pasa por Ozimut: las transferencias, el efectivo y los cheques se hacen entre las personas y los clubes, y Ozimut solo
        guarda lo que el equipo de un evento o el tesorero de un club marca como pagado. El importe de una inscripción y su estado los
        ven el corredor y la cuenta que lo inscribió, el equipo del evento, los tesoreros y responsables del club organizador y, cuando el
        club del corredor la paga, los tesoreros y responsables de ese club. Para cada miembro y cada temporada, un club guarda en sus
        cuentas lo que ha pagado, lo que el miembro ha devuelto y los resúmenes que le ha enviado; lo ven sus tesoreros y responsables, y
        cada miembro ve su propia cuenta. El resumen de fin de año y los recordatorios de pago se envían por correo (y como notificación,
        los recordatorios) en nombre del club, a petición de su tesorero, y las respuestas van a la dirección de contacto del club. El
        extracto bancario que deja un tesorero se lee en su navegador y nunca se envía a Ozimut: solo se envían las referencias reconocidas
        y marcadas, para marcar los pagos. La compensación entre dos clubes que la han aceptado ambos es solo informativa. Cuando se
        elimina una cuenta, las líneas de las cuentas de los clubes que le conciernen permanecen en esas cuentas, sin vínculo con la
        cuenta.</p>
      <h2 style="font-size:16px">Desde tu móvil</h2>
      <p>«Desde mi móvil» lleva una foto del mapa o un archivo (un track) de tu móvil a tu ordenador: el archivo espera en el almacenamiento del sitio (Cloudflare) con un enlace de un solo uso, válido 15 minutos, y se borra en cuanto el ordenador lo ha recibido o cierras la ventana del código; un archivo nunca recibido se borra como muy tarde al día siguiente. Ni el enlace ni el archivo llevan tu nombre, y no hace falta cuenta en el móvil.</p>
      <h2 style="font-size:16px">Salud: artículos y derechos de autor</h2>
      <p>La página «Salud», abierta a las cuentas que el editor autoriza, publica artículos escritos por sus autores. Un artículo se
        conserva en la base de datos del sitio (Cloudflare) con el nombre de su autor, que se muestra con él, y sus imágenes en el
        espacio de almacenamiento del sitio; se borra cuando su autor o el editor lo eliminan. Si el autor elimina su cuenta, sus
        artículos siguen publicados con su nombre, salvo que pida su retirada (contact@ozimut.com). Los «me gusta» se registran por
        cuenta; solo se muestra su número. Cada artículo se traduce automáticamente al inglés y al francés (salvo a su idioma original) con el modelo
        de lenguaje de Ozimut, ejecutado por Cloudflare (Workers AI), que no lo conserva; la traducción se conserva con el artículo y se
        indica como tal.</p>
      <p><b>Derechos de autor.</b> Cada autor conserva todos los derechos de autor sobre sus artículos (los textos y las imágenes que ha
        creado), incluido su derecho moral, y sigue libre de publicarlos en otro lugar, en la forma y con las condiciones que elija. Al
        publicar un artículo en ${SITE}, solo concede al editor una autorización gratuita y no exclusiva, mientras esté publicado, para
        conservarlo, mostrarlo a los lectores de la página «Salud», traducirlo automáticamente a los idiomas del sitio, usar su título,
        su resumen y sus primeras líneas en las listas y los avisos, y adaptar su presentación (maquetación, tamaño de las imágenes) sin
        cambiar su sentido. Esta autorización termina cuando se elimina el artículo; los avisos ya enviados no pueden recuperarse. El
        autor garantiza que los textos y las imágenes que publica son suyos o que tiene derecho a usarlos.</p>
      <p>Cualquier reproducción, comunicación o difusión de un artículo, total o parcial, por otra persona requiere el permiso previo de
        su autor, salvo las excepciones que prevé la ley, en particular las citas breves que mencionan al autor y la fuente (artículo
        L. 122-5 del Código de la propiedad intelectual francés). Las traducciones automáticas son adaptaciones del artículo y siguen las
        mismas reglas.</p>
      <h2 style="font-size:16px">Carto</h2>
      <p>Un mapa de Carto (el documento del mapa, el archivo de OCAD del que procede, sus fondos, sus versiones, los comentarios y las fotos del equipo) se guarda en el almacenamiento del sitio (Cloudflare) y solo su equipo puede abrirlo: su creador y las personas que se unen con un enlace de invitación (no se busca a nadie por nombre ni dirección de e-mail); su nombre y su cuenta se registran con su rol. Los fondos en línea (fotos aéreas y mapas del IGN, OpenStreetMap) se leen en cada apertura y no se guardan; para los datos abiertos (altitudes del IGN, OpenStreetMap, LiDAR), solo se envía la extensión de la zona a esos servicios. El plano urbano (sprint) lo calculan los servidores de Ozimut (GitHub), que solo reciben el centro y el tamaño de la zona; la solicitud, con el número de tu cuenta, y el mapa obtenido se guardan 30 días. La posición GPS del modo de campo se queda en tu navegador, salvo el track que decidas guardar como fondo. Cuando se elimina la cuenta, cada mapa que creó pasa al primer cartógrafo de su equipo; si no, se elimina con todo lo que contiene.</p>
      <h2 style="font-size:16px">Trazado de recorridos</h2>
      <p>Un evento de la página «Trazado» (sus recorridos, su mapa, sus versiones, los comentarios del equipo y los estados de los
        controles anotados en modo terreno) se conserva en el espacio de almacenamiento del sitio (Cloudflare) y solo es accesible para su equipo:
        su creador y las personas que se unen a él mediante un enlace de invitación que el equipo les ha enviado (nadie es
        buscado por su nombre, su licencia o su dirección de correo electrónico); su nombre, su cuenta y, para un federado FFCO, su licencia se
        registran con su función. Las
        versiones, los comentarios y los estados de los controles llevan el nombre de su autor. En modo terreno, el estado anotado en un control
        registra también la posición del teléfono en ese instante (para compararla con el mapa), visible para el equipo, y el equipo
        puede adjuntar fotos de los controles (pueden mostrar a personas: evítalo), borradas con el evento; la posición
        solo se lee durante ese modo, con el permiso del navegador. Si el equipo cifra el evento, estos datos se cifran
        en el navegador y son ilegibles para el sitio. El evento se conserva hasta que su creador lo elimina; si
        este elimina su cuenta, pasa al primer trazador (o, en su defecto, controlador) del equipo que tenga cuenta; si no, se
        elimina. El cálculo del desnivel envía al servicio de altitud del IGN (Géoplateforme, Francia) solo las coordenadas de los
        controles y de los vértices de los recorridos, sin nombre ni código.</p>
      <h2 style="font-size:16px">Clasificación de los juegos</h2>
      <p>Cuando estás conectado, cada partida terminada de un juego (« Juegos ») envía su resultado: se
        guarda con el nombre de tu cuenta si es uno de tus 20 mejores en ese juego, y se muestra a las demás cuentas si está entre los
        20 mejores de todos. Solo el resultado, sus ajustes y la fecha; no se guarda nada de las partidas de un visitante sin cuenta.
        Estos resultados se borran con tu cuenta.</p>
      <h2 style="font-size:16px">Pixel</h2>
      <p>Cada carrera que terminas en Pixel se guarda con el nombre de tu cuenta: su tiempo, sus tiempos parciales, la
        distancia recorrida y su recorrido por el bosque virtual, mostrados a las demás cuentas en los resultados, la clasificación y el
        análisis de ese recorrido; se te reconoce de una carrera a otra por una huella de tu cuenta, nunca por su número. No se guarda
        nada de las carreras de un visitante sin cuenta. Un organizador que crea un evento envía su mapa OCAD (y, si quiere, sus
        recorridos): se guarda en el almacenamiento del sitio, solo se muestra a los corredores del evento, en el juego, una vez que lo
        ha publicado, y sirve para construir la carrera en GitHub, donde no se conserva. Estas carreras, y los eventos con sus mapas y
        resultados, se borran con tu cuenta.</p>
      <h2 style="font-size:16px">Preguntas a la IA</h2>
      <p>En la página «IA», tu pregunta se envía al modelo de lenguaje que escribe la consulta, junto con la descripción de las tablas del
        sitio, la fecha del día, tu número de licencia y el método y la disciplina elegidos: por defecto el modelo de Ozimut, ejecutado
        por Cloudflare (Workers AI); ni el sitio ni Cloudflare conservan las preguntas. La consulta se ejecuta después en tu
        navegador, sobre los datos que publica el sitio: no se transmiten a ningún modelo. Si usas tu propia clave
        de API (Anthropic, OpenAI, Google u OpenRouter), tu navegador envía esos mismos elementos directamente a ese proveedor, con
        tu cuenta y según sus condiciones (con una clave gratuita, Google puede usar las preguntas para mejorar sus
        productos); la clave se queda en tu navegador y nunca se transmite a Ozimut.</p>
      <h2 style="font-size:16px">Datos de tu cuenta</h2>
      <ul>
        <li><b>Datos conservados:</b> la dirección de correo electrónico; el nombre y los apellidos introducidos; los países a los que te has unido, con, para cada uno, el club y el
          número de socio indicados, y para Francia el número de licencia, verificado a partir de los resultados publicados por la FFCO; la contraseña, en una forma cifrada irreversible; las fechas de registro
          y de último inicio de sesión; el idioma elegido para el sitio y los correos; los ajustes de las alertas (regiones elegidas) y la lista de
          carreras ya anunciadas por correo; para el
          simulador de relevos, los corredores añadidos (nombre, categoría, CN estimado) y los marcados como no disponibles, visibles solo para ti.
          Añade solo a personas que lo consientan.</li>
        <li><b>Finalidades y bases jurídicas:</b> la ejecución del servicio solicitado al crear la cuenta (reservar ${world
          ? "los datos de la FFCO a sus federados" : "el acceso a los federados de la FFCO"}, confirmar la dirección de correo, restablecer la contraseña); el interés legítimo del editor en detectar
          cuentas múltiples para una misma licencia; tu consentimiento para las alertas por correo o por notificación, que puedes retirar en cualquier
          momento en Ajustes.</li>
        <li><b>Plazo de conservación:</b> hasta la eliminación de la cuenta, que puedes realizar en cualquier momento en Ajustes. Un
          correo pendiente de envío se borra en cuanto se envía.</li>
        <li><b>Destinatarios:</b> el administrador del sitio y los proveedores técnicos mencionados más abajo. Ningún dato se
          vende ni se utiliza con fines publicitarios.</li>
      </ul>
      <p>Un mensaje enviado desde la página «Contacto» llega al editor por correo electrónico, acompañado de tu dirección, tu nombre y el
        navegador utilizado; se conserva en su buzón el tiempo necesario para tramitar la solicitud.</p>
      <h2 style="font-size:16px">La aplicación Ozimut</h2>
      <p>La aplicación Ozimut para teléfonos muestra este sitio y no sigue tu posición. Si activas en ella las notificaciones, el sitio conserva, para ese teléfono, el identificador de envío que le asigna el servicio de notificaciones del teléfono (Google en Android, Apple en iPhone) y el tipo de dispositivo; se borra cuando las desactivas, cierras sesión en la aplicación o eliminas tu cuenta. El mapa que escaneas, los archivos que compartes con ella y las rutas leídas en Salud (iPhone, con tu consentimiento, solo lectura) se quedan en el teléfono, como en el sitio, mientras no guardes ni compartas el análisis. En la aplicación no se crea ni se elimina ninguna cuenta: eso se hace en el sitio.</p>
      <h2 style="font-size:16px">Notificaciones</h2>
      <p>Si autorizas las notificaciones de Ozimut en un dispositivo, el sitio conserva, para ese dispositivo, la dirección de envío que le
        asigna el servicio de notificaciones de tu navegador (Google para Chrome y Android, Apple para Safari, Mozilla para
        Firefox, Microsoft para Edge), las claves que sirven para cifrar los mensajes y el tipo de dispositivo (por ejemplo
        «Chrome · Android»). Los mensajes (tu hora de salida, la publicación de tus resultados, las carreras del calendario,
        según tus ajustes) están cifrados de extremo a extremo: el servicio de notificaciones los entrega sin poder leerlos. El sitio
        conserva también la última hora de salida notificada para cada carrera, para no volver a enviarla salvo que cambie, y las
        notificaciones pendientes de envío, unos pocos días como máximo. Base jurídica: tu consentimiento, dado al autorizar las
        notificaciones y que puedes retirar en cualquier momento en Ajustes o en los ajustes de tu navegador. Estos datos se borran
        cuando desactivas las notificaciones en el dispositivo, cuando cierras sesión en ese dispositivo y con la cuenta.</p>
      <h2 style="font-size:16px">Estadísticas de uso</h2>
      <p>Para conocer el uso del sitio y mejorarlo (interés legítimo), el sitio registra, para cada cuenta, el número de
        páginas vistas por día y por sección (Clasificación, Corredor, Red, etc.) y el número de visitas. No se registra ningún otro dato
        con este fin: ni las búsquedas realizadas, ni la dirección IP. Estas estadísticas solo son accesibles para
        el administrador; se conservan 13 meses y se eliminan con la cuenta. Con cada página vista, el sitio anota además
        el tiempo que la página ha tardado en mostrarse y en reaccionar, para seguir su rapidez. Esos tiempos se cuentan por día,
        por página y por versión del sitio, sin vínculo con la cuenta.</p>
      <h2 style="font-size:16px">Seguridad</h2>
      <p>Para limitar los intentos repetidos (inicio de sesión, registro, contraseña olvidada), el sitio contabiliza los intentos por
        dirección IP y por dirección de correo (interés legítimo); estos contadores se borran al cabo de un día aproximadamente. El proveedor de alojamiento puede
        además tratar la dirección IP para servir las páginas y proteger el sitio contra ataques.</p>
      <h2 style="font-size:16px">Encargados del tratamiento y transferencias fuera de la Unión Europea</h2>
      <p>Los siguientes proveedores tratan datos por cuenta del editor:</p>
      <ul>
        <li><b>Cloudflare, Inc.</b> (Estados Unidos) aloja el sitio, su base de cuentas y su espacio de almacenamiento de archivos, y ejecuta
          el modelo de lenguaje de la página «IA» y el que traduce los artículos de la página «Salud»; en el registro y al entrar sin cuenta, su servicio Turnstile comprueba que quien usa el sitio es una
          persona y no un robot, examinando el navegador sin cookie publicitaria ni seguimiento entre sitios. Las
          transferencias a Estados Unidos se basan en el Marco de Privacidad de Datos UE-EE. UU. (Data Privacy Framework),
          al que Cloudflare se ha adherido.</li>
        <li><b>Resend</b> (Plus Five Five, Inc., Estados Unidos) se encarga del envío de los correos del sitio, lo que implica la dirección del
          destinatario y el contenido del mensaje. Las transferencias están amparadas por las cláusulas contractuales tipo de la Comisión
          Europea.</li>
        <li><b>Scaleway</b> (Scaleway SAS, Francia) envía los correos que el plan gratuito de Resend no puede asumir, lo que implica
          los mismos datos; permanecen en la Unión Europea (París).</li>
        <li><b>GitHub, Inc.</b> (Estados Unidos) ejecuta las actualizaciones automáticas del sitio; los resultados y los archivos subidos se
          tratan allí, con exclusión de los datos de cuenta. Las transferencias están amparadas por las cláusulas contractuales tipo.</li>
      </ul>
      <h2 style="font-size:16px">Cookies y almacenamiento local</h2>
      <p>El sitio instala una cookie estrictamente necesaria para su funcionamiento: mantiene tu sesión iniciada, durante 30 días
        como máximo; una visita sin cuenta recibe otra, que durante 12 horas acredita que se superó la comprobación contra robots y
        no contiene nada más. El navegador conserva también, en tu dispositivo, tus preferencias de visualización (idioma, tema, disciplina y
        método elegidos), lo que introduces en la calculadora de VAM o en el simulador de relevos y, para el trazado de recorridos, sus ajustes de visualización, la clave
        de un evento cifrado, obtenida de su frase de contraseña (mientras dure la pestaña), los estados del modo terreno pendientes de conexión y, si
        guardas un evento para trabajar sin conexión, su copia (recorridos y mapa, cifrados si el evento lo está) y los archivos del sitio, borrados al cerrar sesión;
        si usas tu propia clave de API en la página «IA», esa clave (mientras dure la pestaña, o en el dispositivo si lo pides;
        borrada al cerrar sesión). El sitio no utiliza ningún rastreador publicitario ni
        ninguna herramienta de medición de audiencia de terceros; por tanto, no se requiere ningún consentimiento.</p>
      <h2 style="font-size:16px">Tus derechos</h2>
      <p>De conformidad con el RGPD, tienes derecho de acceso, rectificación, supresión y portabilidad de tus datos,
        derecho a la limitación de su tratamiento y derecho de oposición a los tratamientos basados en el interés legítimo del
        editor.</p>
      <p>En particular, puedes pedir dejar de ser identificado en ${SITE}, salvo motivos legítimos imperiosos: tu nombre y
        tu número de licencia se sustituyen entonces, en todo el sitio, por una mención anónima («Corredor anónimo»). Tus
        tiempos y tus puestos se siguen teniendo en cuenta, sin tu nombre ni tu número de licencia, para que las clasificaciones de los demás
        federados no se modifiquen; la medida es reversible si lo solicitas. Una solicitud de supresión de los datos de resultados
        se atiende de la misma manera; una cuenta, en cambio, se elimina íntegramente. Los datos de un federado menor de edad se
        anonimizan, y su cuenta se elimina si la tiene, a simple solicitud de su representante legal, que ejerce estos derechos en su
        nombre.</p>
      <p>Puedes eliminar tú mismo tu cuenta en Ajustes. Las demás solicitudes deben dirigirse a contact@ozimut.com; se
        responden en el plazo de un mes. En caso de duda razonable sobre la identidad del solicitante, puede pedirse un justificante.
        Si consideras que tus derechos no se respetan, puedes presentar una reclamación ante la CNIL, la autoridad francesa de protección de datos
        (<a href="https://www.cnil.fr/fr/plaintes" target="_blank" rel="noopener">cnil.fr/fr/plaintes</a>).</p>
      <h2 style="font-size:16px">Aviso legal</h2>
      <p><b>Editor y director de la publicación:</b> Yann Le Helloco, particular, publicación a título no profesional;
        contacto: contact@ozimut.com.<br>
        <b>Proveedor de alojamiento:</b> Cloudflare, Inc., 101 Townsend Street, San Francisco, CA 94107, Estados Unidos; teléfono: +1 888 993 5273.</p>
      <p><b>Propiedad intelectual:</b> los textos, las ilustraciones, el diseño y el código del sitio están protegidos por los derechos
        de autor; salvo que se indique otra cosa, pertenecen al editor, y su reproducción requiere su permiso. Los artículos de la página
        «Salud» pertenecen a sus autores (véase «Salud: artículos y derechos de autor»). Los resultados, clasificaciones oficiales y
        calendarios que recoge el sitio siguen siendo los de sus fuentes (véase «Independencia y fuentes»); los elementos de terceros se
        citan a continuación.</p>
      <p><b>Créditos:</b> los símbolos y los textos de las descripciones de control (Coach › Descripciones de control, el trazado de recorridos)
        proceden de Purple Pen, de Peter Golde (<a href="https://github.com/petergolde/PurplePen" target="_blank" rel="noopener">github.com/petergolde/PurplePen</a>),
        bajo <a href="assets/tracer/LICENSE-PurplePen.txt" target="_blank" rel="noopener">licencia BSD</a>.</p>
      <p class="muted">Última actualización: 24 de noviembre de 2026.</p>
`;
