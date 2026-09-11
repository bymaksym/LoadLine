import { pct, type UiStrings } from './ui-strings';

/**
 * Spanish UI strings. The contract they fill is `UiStrings`.
 *
 * The bundler's own vocabulary stays in English in both languages — chunk, bundle, bootstrap,
 * eager, lazy, budget, tree-shaking, source map, barrel file, build — because that is how it is
 * written in the esbuild and Angular documentation the reader will search next. Everything around
 * it (pantalla, compartido, cobertura, señal) is translated.
 */
export const ES: UiStrings = {
    verdictGood: 'Bien',
    verdictOk: 'Normal',
    verdictBad: 'Mal',
    verdictRule: (ok, bad) => `Bien hasta ${ok} · Normal hasta ${bad} · Mal por encima`,
    verdictRuleCoverage: (wide, global) =>
        `Poco compartido por debajo del ${wide} % de las pantallas · Muy compartido hasta el ${global} % · En la práctica bootstrap a partir del ${global} %`,
    tabCriteria: 'Criterios',
    tabCompare: 'Comparar',
    secCompare: 'Varias aplicaciones',
    secCompareSub:
        'Suelta el stats.json de cada una y mira qué envían dos veces: el framework, los paquetes y tu propio código.',
    howToCompare:
        '<p>Para microfrontends, y para quien tiene cinco portales salidos del mismo repositorio. Cada compilación pasa exactamente por el mismo análisis que el informe de las otras pestañas; esto cruza los resultados.</p><p><strong>La cifra de arriba es el techo de lo que ahorraría un paquete compartido.</strong> Suma todas las copias por encima de la más grande de cada cosa: una copia de una dependencia no sobra, es la dependencia — lo que ahorraría compartir son las demás.</p><p>Las cifras son bytes en crudo. Un stats.json llega sin su carpeta al lado, así que no hay nada que comprimir, y comparar una compilación comprimida contra una en crudo enseñaría un ahorro que no ha pasado.</p>',
    compareAdd: 'Añadir ficheros stats.json',
    compareAddCurrent: 'Añadir la compilación en pantalla',
    compareClear: 'Vaciar',
    compareRemove: 'Quitar',
    compareEmpty: 'Todavía no hay nada que comparar. Añade el stats.json de dos o más aplicaciones.',
    compareNeedsTwo: 'Una aplicación no es una comparación. Añade al menos otra.',
    compareBuild: 'Aplicación',
    compareTotal: 'Compilación entera',
    compareRaw:
        'Bytes en crudo. Un stats.json llega sin su carpeta al lado, así que no hay nada que comprimir, y una compilación comprimida contra una en crudo se leería como un ahorro que no ha pasado.',
    compareIn: 'En',
    compareOfN: (n, total) => `${n} de ${total}`,
    compareCost: 'Copias de más',
    compareCostHelp:
        'Todas las copias por encima de la más grande, sumadas. Una copia de una dependencia no sobra: es la dependencia. Esto es lo que un paquete compartido quitaría del total de verdad.',
    compareInBootHelp:
        'En cuántas de las aplicaciones que lo llevan cae en el arranque, que es donde una copia la paga cada visita en vez de las pantallas que la abren.',
    compareDuplicatedLead: builds => `se envían más de una vez entre estas ${builds} aplicaciones`,
    compareDuplicatedHelp:
        'Paquetes y ficheros tuyos, todas las copias por encima de la más grande. Es el techo de lo que ahorraría un paquete compartido, no una promesa: compartir tiene su propio coste, y esta es la cifra contra la que pesarlo.',
    compareFrameworks: 'El framework, más de una vez',
    compareFrameworksNote:
        'El caso caro. Una fila en rojo es el mismo framework en dos versiones distintas, que es el que no se puede compartir sin decidir antes qué versión gana.',
    comparePackages: 'Paquetes en más de una',
    compareNoShared: 'Nada de lo que envían dos veces pesa lo bastante como para nombrarlo.',
    compareOwn: 'Tu propio código, en más de una',
    compareNoOwn: 'Ningún fichero tuyo viaja en más de una de estas compilaciones.',
    compareRest: n => `y ${n} más, más ligeras que estas.`,
    compareVersions: 'Versiones',
    compareVersionsHelp:
        'Se leen de la ruta de instalación, y la versión ahí solo la escribe pnpm. Con npm o yarn la columna sale vacía porque no se ha podido leer nada — que no es lo mismo que decir que las versiones coinciden.',
    compareVersionUnknown: 'no se puede leer',
    compareVersionsNote:
        'Ninguna ruta de instalación traía la versión, así que no se han podido leer. Eso es un hueco en lo que dicen estos ficheros, no un hallazgo de que todo coincide: pnpm escribe la versión en la ruta, npm y yarn no.',
    compareRejected: files =>
        `No es una compilación: ${files.join(', ')}. Cada fichero tiene que ser un stats.json (un metafile de esbuild).`,
    secCriteria: 'Criterios de valoración',
    secCriteriaSub: 'Con qué umbrales se dice «bien», «normal» o «mal», y cuándo salta cada señal. Se pueden cambiar.',
    howToCriteria:
        '<p>Cada cifra valorada del informe se compara con dos umbrales: hasta el primero es <strong>bien</strong>, hasta el segundo <strong>normal</strong>, por encima <strong>mal</strong>. Los criterios de la segunda y tercera sección son los que disparan las señales.</p><p><strong>De dónde salen los recomendados.</strong> Con cifras comprimidas, 170 kB de JavaScript inicial es el presupuesto habitual para que una página responda en pocos segundos en un móvil medio; 350 kB es el doble. Con cifras en crudo, 500 kB y 1 MB son los valores que Angular CLI escribe por defecto en <code>angular.json</code>. Los de pantalla y de código propio son múltiplos de esos. Los de las señales que son proporciones —cobertura, número de importadores— no dependen de la unidad. Los que son tamaños sí: un mínimo de 50 kB aplicado a cifras comprimidas es tres veces más estricto que el mismo mínimo en crudo, así que bajan con la misma proporción que los demás.</p><p>Lo que cambies se guarda en este navegador, por separado para crudo y comprimido, y se aplica al momento a las valoraciones y a las señales. Un valor igual al recomendado deja de contar como personalizado.</p>',
    criteriaModeNote: mode => {
        if (mode === 'brotli') {
            return 'Estás editando los criterios para cifras en brotli, las reales de los ficheros .br de la carpeta. Son más bajos que los de gzip en la misma proporción en que brotli comprime mejor.';
        }
        if (mode === 'gzip') {
            return 'Estás editando los criterios para cifras comprimidas en gzip (hay carpeta de build cargada).';
        }
        return 'Estás editando los criterios para cifras en crudo. Con la carpeta de build cargada se aplican otros: el bootstrap, por ejemplo, pasa a 170 / 350 kB.';
    },
    criteriaFigures: 'Cifras',
    criteriaGzipBtn: 'gzip',
    criteriaBrotliBtn: 'brotli',
    criteriaBrotliMissing:
        'Son cifras gzip. Si tu servidor sirve brotli, lo que se descarga es entre un 15 % y un 20 % menos, así que un rojo justo por encima del umbral puede no serlo en producción. Con los .js.br en la carpeta de build, Loadline usa la cifra real.',
    criteriaRecommended: value => `recomendado: ${value}`,
    criteriaReset: 'Restablecer los recomendados',
    criteriaStatusRec: 'criterios recomendados',
    criteriaStatusCustom: n => (n === 1 ? '1 criterio personalizado' : `${n} criterios personalizados`),
    criteriaEdit: 'editar',
    critGroupSizes: 'Tamaños',
    critGroupShared: 'Chunks compartidos',
    critGroupSignals: 'Señales',
    critGroupShape: 'Forma del troceado',
    critGroupContext: 'Línea base y contexto del proyecto',
    critOkUpTo: 'bien hasta',
    critBadAbove: 'mal por encima de',
    blastTitle: 'Si tocas este fichero',
    blastBody: (chunks, screens, everyone) =>
        `Se ${chunks === 1 ? 'invalida 1 chunk' : `invalidan ${chunks} chunks`}, y ${
            everyone
                ? 'los vuelve a descargar todo el que tuviera la versión anterior'
                : `los vuelven a descargar ${screens} ${screens === 1 ? 'pantalla' : 'pantallas'}`
        }:`,
    blastCascade: (chunks, screens, everyone, share) =>
        `${chunks === 1 ? 'Otro chunk lleva' : `Otros ${chunks} chunks llevan`} dentro el nombre de alguno de esos, así que ${chunks === 1 ? 'su hash cambia' : 'sus hashes cambian'} también${
            everyone
                ? ', y eso alcanza a todas las pantallas'
                : screens > 0
                  ? `, y alcanza a ${screens} ${screens === 1 ? 'pantalla más' : 'pantallas más'}`
                  : ''
        }. Entre todo se vuelve a descargar el ${share} del build:`,
    blastCascadeHelp:
        'Un bundler escribe el nombre con hash de cada chunk que importa como una cadena dentro del chunk que lo importa, así que tocar un fichero cambia el nombre de su chunk, lo que cambia todos los chunks que lo nombran, y así hacia fuera. Es cómo se emiten los especificadores, no algo que hayas hecho mal. La forma suele ser un hub y no una cadena —un chunk compartido que importan todas las rutas y que a la vez las alcanza— y por eso la cifra da un salto en vez de crecer con la profundidad. Los import maps sacan los especificadores al HTML, romper el hub con manualChunks se paga con una primera carga mayor, y la compresión con diccionario abarata la redescarga en vez de hacerla menos frecuente. Ojo a la tensión: la cascada empuja hacia chunks más finos y tanto el diccionario compartido como el coste por petición empujan hacia chunks más gruesos.',
    blastHub: (file, names) =>
        `${file} lleva dentro los nombres de otros ${names} chunks, así que cualquier cosa que mueva uno de ellos mueve también este fichero, y este fichero moviéndose mueve todo lo que lo importa.`,
    historyTitle: 'Mediciones guardadas en este navegador',
    historyNote:
        'Una cifra contra una línea base compara dos puntos y no dice nada de la forma que hay entre ellos. 950 → 1.017 es información; 820, 790, 910, 1.200, 970 es una historia, y enseña en qué semana entró el problema. Se guarda solo en ESTE navegador —sin cuenta y sin servidor—, así que la forma de compartirla es exportar el fichero.',
    historyEmpty: 'Todavía no hay nada guardado. «Guardar esta» añade la medición que hay en pantalla.',
    historyKeep: 'Guardar esta',
    historyExport: 'Exportar la historia',
    historyForget: 'Olvidarlo todo',
    historySignals: (high, mid) => `${high} importantes · ${mid} para revisar`,
    historyScreenPick: 'Y una pantalla:',
    historyScreenNone: 'ninguna — solo el arranque',
    historyScreenAbsent: 'esta pantalla no estaba en esa compilación',
    actionsTitle: 'Qué arreglo primero',
    actionsNote: 'Es un orden sobre las señales de abajo, no una selección: todas siguen estando.',
    effortLabel: { config: 'configuración', import: 'un import', refactor: 'refactor', none: '' },
    actionsTotal: count => `Aplicando las ${count} se quitarían`,
    actionsTotalAfter: 'de la primera carga y quedaría en unos',
    actionsTotalNote:
        'Bytes minificados en crudo dentro del chunk, y no se suman: el grafo se recorre una vez quitando de golpe todos los ficheros nombrados arriba, así que lo que se alcanza por dos caminos se cuenta una vez.',
    thExclusive: 'Exclusivo',
    helpExclusive:
        'Lo que perdería la primera carga sin esta fila: la parte de su peso que no entra por ninguna otra vía. Es la cifra que dice si quitarla compensa una tarde —chart.js pesando 310 kB son 70 cuando 240 de ellos son d3, que además meten otras tres cosas—. Bytes minificados en crudo, dentro del chunk.',
    helpExclusiveOf: percent =>
        percent >= 100
            ? 'Nada más mete esto: si se va la fila, se va todo.'
            : `Solo el ${percent} % de esta fila no tiene otra vía de entrada. El resto entra igual por otro sitio, así que quitar esta fila no lo quita.`,
    critLabel: {
        bootOk: 'Bootstrap (declarado y efectivo)',
        bootBad: 'Bootstrap',
        screenOk: 'Total por pantalla',
        screenBad: 'Total por pantalla',
        ownOk: 'Código propio de una pantalla',
        ownBad: 'Código propio de una pantalla',
        sharedRatio: 'Cobertura para contar como bootstrap efectivo',
        wideRatio: 'Cobertura para «muy compartido»',
        sharedMinBytes: 'Tamaño mínimo de un chunk casi global para ser señal',
        bootPackageMinBytes: 'Tamaño mínimo de un paquete del bootstrap para ser señal',
        bootPackageMaxImporters: 'Máximo de ficheros importadores para ser «de una pantalla»',
        heavyScreenFactor: 'Pantalla cara: veces la mediana de código propio',
        heavyScreenMinBytes: 'Pantalla cara: mínimo de código propio',
        growthRatio: 'Crecimiento desde la línea base para ser señal',
        growthMinBytes: 'Crecimiento mínimo en tamaño para ser señal',
        budgetSlackFactor: 'Budget demasiado alto: veces el bootstrap actual',
        theirsRatio: 'Parte de la primera carga que puede ser código de otros',
        latencyMs: 'Ida y vuelta en móvil lento, para la estimación de tiempo',
        screenFilesMax: 'Ficheros por pantalla a partir de los cuales mirar el troceado',
        screenWavesMax: 'Idas y vueltas de una pantalla a partir de las cuales merece una línea',
        dominantRatio: 'Parte de un chunk que lo convierte en «básicamente eso»',
        ownFolderMinBytes: 'Peso mínimo de tus carpetas retenidas en el bootstrap',
        bigOwnFileBytes: 'A partir de este tamaño se nombra un fichero tuyo del bootstrap',
        heavyScreenMinScreens: 'Pantallas necesarias para comparar contra la mediana',
        tinyChunkBytes: 'Por debajo de esto, un fichero es sobre todo el coste de pedirlo',
        minTinyChunks: 'Cuántos de esos tienen que llegar juntos',
        minLocales: 'Idiomas de una librería para contar como «todos»',
        shippedMinBytes: 'Peso mínimo de lo que viaja sin ser código de una pantalla',
        barrelMinBytes: 'Peso exclusivo desde el que un barrel file es una señal',
        paidTwiceMinBytes: 'Desde este tamaño se nombra un módulo que está en dos chunks',
        crumbMaxBytes: 'Por debajo de esto un chunk es una migaja',
        manyCrumbs: 'Migajas en una zona para que sea un patrón',
        concentratedRatio: 'Parte de una zona en un chunk que hace que la zona sea ese chunk',
        heavyInZoneRatio: 'Parte de su zona a partir de la cual se marca una fila',
        heavyShareRatio: 'Parte de una descarga que cuenta como «casi todo»',
        grouperMaxBytes: 'Lo que puede pesar un fichero que solo agrupa rutas',
        sharedGrowthTolerance: 'Cuánto se parecen dos crecimientos para culpar a un chunk compartido',
        sharedGrowthMinScreens: 'Pantallas creciendo igual para que sea un chunk compartido',
    },
    critHelp: {
        bootOk: 'Lo que se descarga antes de pintar nada. Es lo que más pesa en el tiempo hasta que la aplicación responde.',
        bootBad: '',
        screenOk: 'Bootstrap + compartido + propio: lo que descarga quien entra directo a una pantalla.',
        screenBad: '',
        ownOk: 'Chunks que solo carga esa pantalla. Por encima, suele ser una librería pesada que merece un bloque lazy.',
        ownBad: '',
        sharedRatio:
            'Si un chunk lazy lo cargan al menos este porcentaje de pantallas, se descarga en la práctica siempre y se suma al bootstrap efectivo.',
        wideRatio: 'Por debajo del umbral anterior pero por encima de este, el chunk se etiqueta como muy compartido.',
        sharedMinBytes:
            'Un chunk casi global más pequeño que esto no genera señal: la diferencia entraría dentro de la variación entre dos builds.',
        bootPackageMinBytes:
            'Paquetes del bootstrap más pequeños que esto no se examinan para la señal «bootstrap para una pantalla lazy».',
        bootPackageMaxImporters:
            'Si más ficheros tuyos que esto importan el paquete, es una base común y no se señala.',
        heavyScreenFactor:
            'Una pantalla es cara si su código propio multiplica por esto la mediana de todas las pantallas…',
        heavyScreenMinBytes: '…y además supera este tamaño.',
        growthRatio:
            'Con una línea base cargada, el bootstrap o una pantalla han crecido si suben al menos este porcentaje…',
        growthMinBytes: '…y al menos este tamaño, para que doblar una pantalla de 2 kB no salte.',
        budgetSlackFactor:
            'Un budget de error de angular.json que multiplique por esto el bootstrap actual (en crudo) se señala como inalcanzable.',
        theirsRatio:
            'Por encima de esta parte, el informe dice cuánto de la primera carga no lo has escrito tú. No es un fallo por sí mismo —un framework también es código de otros—, así que lo que sale es contexto y no un problema.',
        latencyMs:
            'Los tres perfiles de conexión escalan con ella, así que moverla los mueve todos en vez de aplanarlos en un solo número. Es lo único editable de la estimación de tiempo. El ancho de banda y el coste de parseo son de un dispositivo; la latencia es de dónde están tus usuarios, y se paga una vez por ida y vuelta pese lo que pese comprimido. Todo lo que sale de aquí es una estimación y se etiqueta como tal.',
        screenFilesMax:
            'Cuántos ficheros necesita una pantalla antes de que merezca la pena mirar cómo está troceada. Es contexto, no una puerta: bajo multiplexado un conteo no separa sesenta ficheros bien dimensionados de sesenta migas, y lo que sí los separa es el umbral de granularidad de abajo. Bajo HTTP/1.1 sí cuesta segundos, y lo que dice si está pasando es una medición pegada.',
        screenWavesMax:
            'Cuántas idas y vueltas seguidas cuesta una pantalla antes de merecer una línea. Es el único umbral de aquí con primeros principios detrás: cada ida y vuelta es al menos una latencia, ninguna compresión la toca y el multiplexado tampoco — lo que limita es el descubrimiento secuencial, no el transporte. Vale igual bajo HTTP/1.1, HTTP/2 y HTTP/3, y la cifra que hay que leer es este número por tu latencia.',
        dominantRatio:
            'Cuando un paquete o una carpeta son al menos esta parte de un chunk compartido, el chunk se describe como esa cosa y el consejo apunta a ella.',
        ownFolderMinBytes:
            'Carpetas tuyas que una pantalla lazy mantiene en el bootstrap, sumadas. Por debajo de esto el acoplamiento existe pero no merece una línea.',
        bigOwnFileBytes:
            'Un fichero tuyo dentro del bootstrap por encima de este tamaño se lista uno a uno. Suele ser una tabla de constantes que entra entera.',
        heavyScreenMinScreens:
            'Con menos pantallas que esto no hay una mediana de código propio que signifique nada, así que ninguna se llama cara.',
        tinyChunkBytes:
            'Por debajo de este tamaño, las cabeceras, la entrada de caché y el envoltorio de módulo son comparables al contenido.',
        minTinyChunks:
            'Un puñado de ficheros diminutos llegando juntos es la forma de un troceado que ha ido más allá de lo que ayuda. Dos o tres no significan nada.',
        minLocales:
            'Por debajo de estos ficheros de idioma, la librería no viaja entera: son el idioma o dos que alguien registró.',
        shippedMinBytes: 'Los idiomas de una librería y los datos incrustados como código se avisan desde este peso.',
        barrelMinBytes:
            'Exclusivo, no total: un barrel delante de código que además entra por otros cinco imports no cuesta nada, y aquí solo se cuenta lo que no tiene otra vía de entrada.',
        paidTwiceMinBytes:
            'El mismo módulo copiado en dos chunks. Una copia se iba a descargar igual; esto pesa el resto.',
        crumbMaxBytes:
            'Los chunks por debajo de esto se cuentan aparte en la pestaña Árbol y en la forma de cada pantalla.',
        manyCrumbs: 'Menos migajas que esto en una zona no es un patrón, son dos ficheros.',
        concentratedRatio:
            'Cuando el chunk más grande de una zona es al menos esta parte de ella, la zona es en realidad ese chunk, y la pestaña lo dice.',
        heavyInZoneRatio:
            'Un chunk que tiene al menos esta parte de su zona se marca como el sitio donde está ese peso.',
        heavyShareRatio:
            'Cuánto de una descarga tienen que cubrir los ficheros más grandes para describirlos como casi toda ella.',
        grouperMaxBytes:
            'Un fichero que solo lista rutas compila a caminos y funciones flecha. Por encima de esto lleva algo propio y cuenta como pantalla.',
        sharedGrowthTolerance:
            'Las pantallas que crecen dentro de este margen entre sí se leen como un chunk compartido creciendo debajo de todas, en vez de como muchas pantallas sueltas.',
        sharedGrowthMinScreens: 'Menos pantallas que esto creciendo igual es una casualidad, no un chunk compartido.',
    },
    critScale: {
        chunk: 'en la unidad del informe',
        file: 'siempre en bytes crudos',
        request: 'el coste de una petición',
    },
    critFrom: {
        external: 'cifra publicada',
        derived: 'derivado aquí',
        convention: 'convención',
    },
    critFromHelp: {
        external:
            'Una cifra que publicó otro y que aquí se copia, para que se pueda comprobar contra su fuente en vez de creerla. El par de la primera carga en crudo es lo que Angular CLI escribe por defecto en angular.json; la latencia es el perfil móvil al que estrangula Lighthouse. Es un valor por defecto publicado, no una medición de tu build ni de tu audiencia.',
        derived:
            'Aritmética sobre otro umbral de esta lista: un múltiplo del presupuesto de la primera carga, o el mismo presupuesto en otra unidad. No tiene justificación propia — se mueve cuando se mueve el número del que sale, y vale exactamente lo que valga aquel.',
        convention:
            'Había que trazar una raya en algún sitio y se trazó aquí. No se midió nada para llegar al número y no hay fuente que lo respalde. Casi toda esta lista son convenciones, y decirlo es más útil que inventar una justificación a posteriori: si tu proyecto tiene un motivo para otro número, ese motivo gana a este.',
    },
    criteriaExport: 'Descargar criterios',
    criteriaExportHelp:
        'Guarda lo que hay aquí como el fichero JSON que lee el comando con --criteria, para que el pipeline juzgue el build con los mismos umbrales que esta página.',
    unitKb: 'kB',
    unitPct: '%',
    unitTimes: '×',
    unitFiles: 'ficheros',
    unitChunks: 'chunks',
    unitScreens: 'pantallas',
    unitLangs: 'idiomas',
    unitImporters: 'ficheros',
    unitTrips: 'idas y vueltas',
    unitMs: 'ms',
    treePin: 'Fijar este trozo arriba, para compararlo con otro',
    treeUnpin: 'Dejar de fijarlo arriba',

    tagline: 'peso por pantalla',
    lede: 'Qué descarga quien abre cada pantalla de tu aplicación, cuánto de eso lo paga también todo el mundo, y qué conviene mover de sitio.',
    themeBtn: 'Cambiar tema',
    densityCompact: 'Compacto',
    densityComfortable: 'Cómodo',
    densityHelp:
        'Filas más juntas, para leer tablas largas en una pantalla ancha. Cambia el espaciado y nada más: no se va ninguna columna, ninguna cifra ni ningún color.',
    columnsBtn: (shown, total) => `Columnas ${shown}/${total}`,
    copyRow: 'Copiar esta fila',
    copyRowHelp: 'Esta pantalla en una línea de texto, para pegarla en el hilo donde se discute.',
    explainBtn: 'De dónde sale esta cifra',
    paletteTitle: 'Ir a',
    palettePlaceholder: 'Una pestaña, una pantalla, un paquete, un fichero…',
    paletteNone: 'Nada con ese nombre.',
    paletteTab: 'pestaña',
    paletteAction: 'acción',
    paletteCount: (shown, total) =>
        total > shown ? `${shown} de ${total} — la pestaña Buscar las nombra todas` : `${total}`,
    paletteKeysHint: '? para los atajos',
    keysTitle: 'Teclado',
    keyJump: 'Ir a una pestaña, una pantalla o un paquete',
    keySearch: 'Lo mismo, desde cualquier sitio que no sea un campo',
    keyMove: 'Moverse por la lista y coger lo que está marcado',
    keyClose: 'Cerrar esto, y cerrar una explicación abierta',
    keyHelp: 'Esta lista',
    keyTabs: 'Entre pestañas, con una pestaña enfocada',

    drop1Title: '1 · Suelta aquí tu stats.json',
    drop1Body:
        'Lo genera tu bundler con <code>ng build --stats-json</code> (Angular) o como <code>metafile</code> de esbuild. Se procesa en tu navegador: no sale de tu equipo.',
    drop1Btn: 'Elegir stats.json',
    sampleBtn: 'Ver un ejemplo',
    sampleLoaded: outputs => `Compilación de ejemplo · ${outputs} salidas · no es tu proyecto`,
    sampleRemove: 'Cerrar el ejemplo',
    diagnosticsBtn: 'Copiar diagnóstico',
    diagnosticsCopied: 'Copiado',
    diagnosticsHint:
        'Unas treinta líneas con la forma de esta compilación y lo que Loadline decidió sobre ella. Los nombres de paquete van tal cual; cada ruta de tu propio código se sustituye por un hash estable. Pégalo en un issue.',
    drop2Title: '2 · Opcional: la carpeta de build',
    drop2Body:
        'Añade la carpeta <code>browser/</code> y las cifras pasan a ser <strong>comprimidas</strong>, que es lo que se descarga. Sin ella se muestran bytes en crudo. Si la carpeta trae los <code>.js.map</code>, además se lee de ellos lo que pesa cada fichero dentro de cada chunk, como <strong>segunda medición</strong> de lo que ya dice el metafile.',
    drop2Btn: 'Elegir carpeta',
    statsRemove: 'Quitar stats.json',
    distRemove: 'Quitar carpeta',
    projectNameHelp:
        'El proyecto que estás analizando, leído del package.json o del angular.json que hayas cargado como contexto.',
    statsIdle: 'Sin cargar',
    distIdle: 'Sin cargar · cifras en crudo',
    statsLoaded: (name, outputs) => `${name} · ${outputs} salidas`,
    statsFromFolder: (name, outputs) => `${name} · ${outputs} trozos · grafo leído de la carpeta`,
    statsError: message => `No se ha podido leer: ${message}`,
    distNoFiles: 'Esa carpeta no tiene ficheros de build',
    distNoApi: 'Tu navegador no puede comprimir aquí; se mantienen las cifras en crudo',
    distWorking: (done, total) => `Comprimiendo ${done} de ${total} ficheros…`,
    distReading: 'Leyendo el grafo de imports…',
    distLoaded: files => `${files} ficheros · cifras comprimidas`,
    distLoadedMaps: (files, maps) => `${files} ficheros · cifras comprimidas · ${maps} source maps leídos`,
    distLoadedBrotli: 'brotli real de los .br',
    distLoadedIndex: 'index.html leído',
    splitExact: 'reparto de los source maps',
    splitApprox: 'reparto del metafile',
    serverIgnored: n => `${n === 1 ? '1 salida de servidor' : `${n} salidas de servidor`} fuera del análisis`,
    serverIgnoredHelp:
        'El build trae también el bundle de servidor (renderizado en servidor). Nadie lo descarga y suele ser el más grande de los dos, así que se analiza solo la parte de navegador.',
    blocksNote: n =>
        `${n === 1 ? '1 bloque lazy' : `${n} bloques lazy`} dentro de pantallas, que no cuentan como pantalla:`,
    blocksHelp:
        'Un @defer de Angular, o un lazy() dentro de un componente, produce un chunk lazy igual que una ruta. No es una pantalla: nadie entra en él, se carga cuando se dispara dentro de la pantalla que lo contiene. Contarlo como pantalla subiría el número de pantallas y bajaría la mediana con algo que nadie abre. Lo que el grafo no puede decir es CUÁNDO se dispara: un bloque detrás de un botón son bytes que nadie paga hasta pulsarlo, mientras que uno que se importa al montar la pantalla baja con la primera pintura, y entonces la pantalla pesa más de lo que dice su fila. Aquí los dos son idénticos. La pestaña Medido es la que lo resuelve.',
    groupersNote: n =>
        `${n === 1 ? '1 entrada lazy que solo agrupa rutas' : `${n} entradas lazy que solo agrupan rutas`}, que tampoco cuentan como pantalla:`,
    groupersHelp:
        'Un fichero que no aporta prácticamente nada propio a su chunk y solo tiene importaciones dinámicas está agrupando rutas, se llame como se llame. Lo que carga son las pantallas; él no es una. Eso se mide, no se lee del nombre del fichero, así que vale también en un proyecto que no nombre sus ficheros como Angular.',
    dataNote: n =>
        `${n === 1 ? '1 entrada lazy que es datos' : `${n} entradas lazy que son datos`}, no código al que se navegue:`,
    dataHelp:
        'Un fichero de idioma, una tabla de países, un diccionario: un import() de un .json produce un chunk lazy igual que una ruta. Nadie navega a uno, y una aplicación que carga cincuenta idiomas bajo demanda saldría con cincuenta pantallas. Lo que hay que decidir con estos no es si son pantalla, sino si esos datos tienen que viajar dentro del bundle.',
    markScreen: 'Contar como pantalla',
    markScreenHelp:
        'Mete esta entrada en la tabla como pantalla propia. Distinguir una pantalla de un trozo de pantalla se hace en parte leyendo nombres de fichero, y no hay juego de nombres que valga para todos los proyectos: esta es la salida que no obliga a Loadline a aprenderse el tuyo.',
    markBlock: 'No es una pantalla',
    markBlockHelp:
        'Saca esta fila de la tabla: es un trozo de otra pantalla, no un sitio al que se navegue. Pasa a la lista de entradas que no son pantallas, arriba.',
    marksNote: n => `${n === 1 ? '1 entrada reclasificada' : `${n} entradas reclasificadas`} a mano.`,
    marksReset: 'Volver a las reglas',
    splitHelp:
        'Cuánto pesa cada fichero dentro de un chunk. Normalmente sale del metafile, y con esbuild esa cifra ya está minificada: comparada con los source maps de un build real, las dos coinciden dentro del 1 %. Si la carpeta trae los .js.map se usa la de los mapas, que es la misma cosa medida sobre el fichero generado.',
    intakeCompressed: unit => `cifras ${unit}`,
    intakeRaw: 'cifras en crudo (bytes en disco)',
    intakeAddDist: 'Añadir carpeta browser/ para ver cifras comprimidas',
    rereadBtn: 'Releer la carpeta',
    rereadHelp:
        'Vuelve a leer la misma carpeta de compilación, para después de recompilar. Solo sale donde el navegador puede quedarse con una carpeta, que no es desde una página file:// ni en todos los navegadores; en el resto, se vuelve a soltar la carpeta.',
    intakeChangeStats: 'Cambiar stats.json',
    intakeShow: 'Ver zonas de carga',
    intakeHide: 'Ocultar zonas de carga',
    intakeAddBaseline: 'Añadir línea base para comparar',
    intakeAddContext: 'Añadir angular.json y pipeline',

    drop3Title: '3 · Opcional: la medición anterior',
    drop3Body:
        'El <code>stats.json</code> del build anterior, un análisis exportado desde Loadline, o la carpeta <code>browser/</code> anterior entera (con su <code>stats.json</code>) para comparar cifras comprimidas. Cada pantalla enseña cuánto ha cambiado y salta una señal si algo ha crecido o ha entrado en el bootstrap.',
    drop3Btn: 'Elegir línea base',
    drop3BtnDist: 'Elegir carpeta anterior',
    baselineNoStats: 'La carpeta no contiene ningún stats.json.',
    baselineWorking: 'Comprimiendo la carpeta anterior…',
    drop4Title: '4 · Opcional: el contexto del proyecto',
    drop4Body:
        '<code>angular.json</code>, <code>package.json</code> y el fichero del pipeline (<code>.gitlab-ci.yml</code> o el workflow de GitHub). Con ellos se comprueba dónde está el budget de tamaño y si la configuración que compila el pipeline lo aplica.',
    drop4Btn: 'Elegir ficheros',
    baselineIdle: 'Sin cargar · sin comparación',
    baselineLoaded: (name, mode, screens) => `${name} · ${mode} · ${screens} pantallas`,
    baselineError: message => `No se ha podido leer: ${message}`,
    baselineShort: name => `línea base: ${name}`,
    baselineModeMismatch:
        'La línea base tiene cifras comprimidas y el informe actual está en crudo: añade la carpeta de build para comparar.',
    baselineRemove: 'Quitar línea base',
    contextIdle: 'Sin cargar',
    contextLoaded: files => files.join(' · '),
    contextIgnored: files => `No reconocido: ${files.join(', ')}`,
    contextShort: n => (n === 1 ? 'contexto: 1 fichero' : `contexto: ${n} ficheros`),
    contextRemove: 'Quitar contexto',
    restorePrompt: (name, date) => `Este navegador guarda la última medición: ${name} · ${date}`,
    restoreBtn: 'Restaurar',
    restoreForget: 'Olvidar',

    exportJson: 'Exportar análisis (JSON)',
    exportMarkdown: 'Copiar tabla (Markdown)',
    exportCopied: 'Copiada',
    exportHint:
        'El JSON guarda el bootstrap, sus paquetes y el coste por pantalla: sirve como línea base en la próxima medición. La tabla en Markdown se pega en una incidencia o un acta.',

    colDelta: 'Δ',
    helpDelta: baseline => `Cambio del total respecto a la línea base (${baseline}).`,
    deltaRaw: 'Δ en crudo: la línea base no tiene cifras comprimidas.',
    tileBootDelta: (diff, percent, baseline) => `${diff} (${percent} %) respecto a ${baseline}`,
    tileBootSame: baseline => `igual que en ${baseline}`,
    compareNewScreens: n => (n === 1 ? '1 pantalla nueva' : `${n} pantallas nuevas`),
    compareGoneScreens: n => (n === 1 ? '1 pantalla que ya no está' : `${n} pantallas que ya no están`),
    compareNew: 'nueva',

    tabProject: 'Proyecto',
    secProject: 'Contexto del proyecto',
    secProjectSub: 'Dónde están los budgets de tamaño, qué compila el pipeline y si el budget se aplica.',
    howToProject:
        '<p>Angular solo comprueba los budgets de tamaño (<code>budgets</code>) de la configuración con la que se compila. Si el budget está en <code>production</code> y el pipeline compila <code>preproduction</code>, el budget no se aplica nunca. Esta pestaña cruza las dos cosas: los budgets de cada configuración de <code>angular.json</code> y los comandos de build del pipeline, siguiendo los scripts de <code>package.json</code> (<code>pnpm run build:pre</code> → <code>ng build --configuration=preproduction</code>).</p><p>La comparación con el bootstrap se hace en crudo y solo con JavaScript, que es lo que mide Angular. Un budget de error a más del doble del bootstrap actual no salta nunca.</p>',
    projectEmpty:
        'Suelta angular.json, package.json y el fichero del pipeline en la zona de carga para ver dónde están los budgets y si se aplican.',
    projectEmptyBtn: 'Elegir ficheros del proyecto',
    projectBudgets: project => `Budgets del bootstrap por configuración · proyecto ${project}`,
    projectPick: 'Aplicación',
    projectPickHelp: n =>
        `angular.json declara ${n} aplicaciones. Los budgets de abajo son los de la seleccionada; elige aquella de la que salió tu stats.json.`,
    projectNoBudgets: 'angular.json no declara ninguna configuración de build.',
    thConfiguration: 'Configuración',
    thWarning: 'Aviso',
    thError: 'Error',
    thBuiltBy: 'La compila el pipeline',
    thAgainstBoot: 'Frente al bootstrap actual',
    helpBuiltBy: 'Jobs del pipeline cuyo comando de build resuelve a esta configuración.',
    helpAgainstBoot: 'Cuánto margen deja el budget de error respecto al bootstrap actual en crudo (solo JavaScript).',
    builtByNone: 'nadie',
    builtByUnknown: 'sin pipeline cargado',
    budgetNoneRow: 'sin budget',
    budgetInherited: 'de options',
    budgetDefaultTag: 'por defecto',
    budgetOver: percent => `ya lo supera en un ${percent} %`,
    budgetHeadroom: percent => `margen del ${percent} %`,
    projectPipeline: file => `Comandos de build en ${file}`,
    projectNoBuilds: 'No se ha encontrado ningún comando de build en este fichero.',
    thJob: 'Job',
    thCommand: 'Comando',
    thResolvesTo: 'Compila',
    buildDefaultConfig: name => `${name} (por defecto)`,
    buildUnresolved: 'no se ha podido seguir hasta ng build',
    projectZone: 'Detección de cambios',
    zoneYes: 'con zone.js',
    zoneNo: 'sin zone.js (zoneless): el material sobre ciclos de detección de cambios no aplica',
    zoneUnknown: 'sin datos: carga angular.json o package.json',
    projectAngular: version => `Angular ${version}`,
    projectBootRaw: size => `Bootstrap actual en crudo (solo JavaScript): ${size}`,

    headLeadGzip: 'Antes de ver nada se descargan (en gzip)',
    headLeadRaw: 'Antes de ver nada se descargan (sin comprimir)',
    headFigure: (size, files) => `${size} · ${files} ficheros`,
    headNote: (s, unit) =>
        `La pantalla más cara es <strong>${s.label}</strong>, con ${s.total} en ${s.files} ficheros — de los cuales ${s.shared} los comparte con otras pantallas y solo ${s.own} son suyos. Cifras ${unit}.`,
    unitGzip: 'comprimidas en gzip',
    unitRaw: 'en crudo',
    unitBrotli: 'comprimidas en brotli',
    headLeadBrotli: 'Antes de ver nada se descargan (en brotli)',

    howToAct: 'Qué se puede hacer con estas cifras',
    howToActBody:
        '<p><strong>Primero, quién lo paga.</strong> Una cifra alta solo importa si alguien la descarga. El bootstrap lo descarga todo el mundo, entre por donde entre; un chunk de una pantalla solo lo descarga quien abre esa pantalla. Sacar 100 kB del bootstrap reduce más descarga total que quitar 100 kB de una pantalla en la que entra el 5 % de la gente.</p>' +
        '<p><strong>Las cuatro formas de bajarlo, de la más barata a la más cara.</strong></p>' +
        '<ol>' +
        '<li><strong>Moverlo a donde se usa.</strong> Un paquete que solo necesita una pantalla sale del bootstrap cambiando dónde se registra, sin cambiar lo que hace. Es la que más reduce con menos riesgo, y es la que proponen casi todas las señales.</li>' +
        '<li><strong>Quitarlo.</strong> La dependencia que ya no usa nadie, la segunda copia de la misma librería, o el barrel file que reexporta una carpeta entera y hace que importar una cosa incluya veinte.</li>' +
        '<li><strong>Sustituirlo.</strong> Cambiar una librería pesada por una pequeña o por veinte líneas propias. Cuesta pruebas y revisión, así que se justifica por el tamaño: si la fila no está entre las primeras de la tabla, casi nunca compensa.</li>' +
        '<li><strong>Partirlo.</strong> Separar un fichero o un chunk en dos. La última, porque es la que más toca el código y la que más veces no reduce nada: si las dos mitades acaban cargándose igual, solo han cambiado los nombres de los ficheros.</li>' +
        '</ol>' +
        '<p><strong>Cómo saber si compensa antes de tocar nada.</strong> Mira cuánto se mueve y a cuánta gente le llega. Unos pocos kB entran dentro de la variación normal entre dos builds: si la ganancia no se ve al comparar contra una línea base, tampoco se podrá defender. Y compara siempre en la misma unidad, mejor en comprimido, que es lo que se descarga.</p>' +
        '<p><strong>Cuándo dejar de optimizar.</strong> Cuatro casos que se repiten:</p>' +
        '<ul>' +
        '<li>El chunk compartido lo cargan casi todas las pantallas. Repartirlo no reduce lo que se descarga: el contenido cambia de fichero y se sigue descargando.</li>' +
        '<li>Lo que está en rojo lo trae una dependencia de otra dependencia. No se puede mover desde tu código: hay que ir a quien lo importa, y a veces no hay alternativa.</li>' +
        '<li>La cifra ya está en verde. Bajar el siguiente kB cuesta bastante más esfuerzo que el anterior y no cambia lo que nota quien abre la página.</li>' +
        '<li>Estás partiendo en chunks cada vez más pequeños. Cada chunk es una petición más, y pasado cierto punto veinte ficheros pequeños tardan más que dos grandes.</li>' +
        '</ul>' +
        '<p><strong>Y comprobarlo.</strong> Guarda este build como línea base, haz el cambio y vuelve a medir. Si no baja donde esperabas, la causa era otra, y saberlo también sirve.</p>',
    adviceBoot:
        'Baja sacando del bootstrap lo que solo se usa en algunas pantallas. La pestaña Bootstrap lo lista por peso y marca en rojo los paquetes cuyo único consumidor está en una pantalla lazy: por ahí se empieza.',
    adviceEffective:
        'La diferencia con el bootstrap declarado son chunks que el bundler marca como lazy y descarga casi todo el mundo. No se corrige en el bootstrap, sino en esos chunks: pestaña Compartidos.',
    adviceScreens:
        'Es bootstrap + compartido + propio. Si la pantalla típica sale cara pero su código propio es pequeño, lo que hay que mirar es el bootstrap: bajarlo baja todas las pantallas a la vez.',
    adviceShared:
        'Un chunk que cargan casi todas las pantallas no mejora solo con partirlo. Compensa sacar de él lo que use una sola pantalla; lo que usan todas se seguirá descargando esté donde esté.',
    adviceFindings:
        'Cada señal trae qué hacer y qué no, con los ficheros concretos. Las importantes son las que afectan al bootstrap, o sea a lo que se descarga siempre; las de repasar son de una pantalla concreta o de un tamaño que puede estar justificado.',

    tileBoot: 'Bootstrap declarado',
    tileBootCss: (size, files, total) =>
        `+ ${size} de CSS que la página pide${files > 1 ? ` en ${files} hojas` : ''} · ${total} antes de pintar`,
    tileBootSub: files => `lo que el bundler marca como inicial · ${files} ficheros`,
    tileEffective: 'Bootstrap efectivo',
    tileEffectiveSub: (extra, chunks, ratio) =>
        `+${extra} en ${chunks === 1 ? 'un chunk marcado como lazy' : `${chunks} chunks marcados como lazy`} que cargan al menos el ${pct(ratio)} de las pantallas`,
    tileEffectiveSame: 'igual al declarado: ningún chunk lazy es casi global',
    tileScreens: 'Pantallas lazy',
    tileScreensTypical: 'la típica cuesta',
    tileScreensTop: (label, size) => `· la más cara es ${label} · ${size}`,
    tileScreensNone: 'toda la aplicación entra en el bootstrap',
    tileShared: 'Chunks compartidos',
    tileSharedSub: (global, partial) =>
        `${global} casi ${global === 1 ? 'global' : 'globales'} · ${partial} ${partial === 1 ? 'parcial' : 'parciales'}`,
    tileSharedNone: 'ningún chunk lazy lo comparten dos pantallas',
    tileFindings: 'Señales',
    tileFindingsSub: (high, mid) => `${high} ${high === 1 ? 'importante' : 'importantes'} · ${mid} a revisar`,
    tileFindingsNone: 'no hay ninguna señal en el reparto',

    tabFindings: 'Señales',
    tabScreens: 'Pantallas',
    tabBoot: 'Bootstrap',
    tabShared: 'Compartidos',
    tabTree: 'Árbol',
    howTo: 'Cómo leer esta pestaña',
    howToFindings:
        '<p>Cada señal es un patrón concreto encontrado en <strong>tu</strong> grafo de importaciones, con su umbral y su arreglo. No son reglas genéricas de rendimiento.</p><p><strong>Importante</strong> significa que hay peso que paga todo el mundo sin necesidad. <strong>A revisar</strong> señala algo que merece una mirada pero puede tener explicación. El botón de cada señal lleva a la fila del informe de la que sale.</p>',
    howToScreens:
        '<p>Cada fila es una pantalla lazy, y la barra es lo que descarga quien entra <strong>directamente</strong> a ella: <strong>bootstrap</strong> (gris, igual en todas), <strong>compartido</strong> (naranja: chunks lazy que también cargan otras pantallas) y <strong>propio</strong> (verde: solo esta). Las barras comparten escala, así que si el tramo naranja mide lo mismo en todas las filas, el problema está en ese chunk común y no en las pantallas.</p><p>Estas cifras se <strong>calculan</strong> recorriendo el grafo de importaciones, no se miden. Suelen quedarse algo cortas: al entrar por la raíz, el router puede cargar chunks de una zona antes de que un guard la rechace. Para la cifra definitiva, sirve la carpeta de build y mira la pestaña de red del navegador.</p>',
    howToBoot:
        '<p>El bootstrap es lo que llega antes de que se pinte nada, agrupado por paquete de npm y por carpeta de tu proyecto. La columna <strong>quién lo importa</strong> dice cuántos ficheros tuyos usan cada paquete directamente y dónde están: si todos están en pantallas lazy, ese paquete no debería estar aquí.</p><p>Despliega un paquete para ver <strong>cómo entra en el bootstrap</strong>: la cadena de imports desde el punto de entrada hasta él, y qué ficheros tuyos lo importan. El último fichero tuyo de la cadena es el import que hay que mover.</p><p>Un paquete al que «nadie importa directamente» entra porque otro paquete lo importa: no se quita desde tu código, se quita desde el paquete que lo trae. La etiqueta <strong>CommonJS</strong> marca los paquetes a los que el bundler no puede aplicar tree-shaking.</p><p>El color de la barra dice de qué es la fila: gris un paquete de npm, verde una carpeta de tu código, rojo un paquete con pocos importadores y alguno de ellos en una pantalla lazy. La leyenda está encima de la tabla, y pasando el ratón por una cifra, una barra o una etiqueta sale qué significa.</p>',
    howToShared:
        '<p>Un chunk compartido es uno que el bundler marca como lazy pero que cargan varias pantallas. La <strong>cobertura</strong> dice cuántas: por encima del 60 % se descarga en la práctica siempre, aunque la tabla del bundler lo clasifique como lazy. Eso es lo que enseña esta pestaña.</p><p>Despliega una fila para ver qué pantallas exactamente lo cargan y qué paquetes lleva dentro. Lo que compensa sacar de un chunk así son los componentes que use una sola pantalla; lo que usan casi todas seguirá descargándose, esté donde esté.</p>',
    howToTree:
        '<p>Cada chunk que genera el bundler, abierto por paquete o carpeta y luego por fichero. La barra mide el tamaño frente al chunk mayor; el color dice quién lo paga: gris bootstrap, naranja compartido, verde de una sola pantalla.</p><p>Sirve para contestar «¿qué hay dentro de este fichero exactamente?» cuando una señal o una fila de la tabla te ha llevado hasta un nombre.</p>',

    secFindings: 'Qué conviene mirar',
    secFindingsSub: 'Señales calculadas sobre tu grafo de dependencias, no reglas genéricas.',
    secScreens: 'Coste por pantalla',
    secScreensSub: 'Pulsa una fila para ver qué la compone. Las barras comparten escala.',
    secTree: 'El bundle por dentro',
    secTreeSub: 'Chunk, paquete y fichero. Filtra por zona para ver solo lo que paga todo el mundo.',
    secBoot: 'Qué hay en el bootstrap',
    secBootSub: 'Lo que se descarga antes de ver nada, agrupado por paquete y por carpeta tuya.',
    secShared: 'Chunks compartidos',
    secSharedSub: 'Lazy según el bundler; según tus pantallas, no tanto.',

    sevHigh: 'Importante',
    sevMid: 'A revisar',
    sevOk: 'Todo en orden',
    sevInfo: 'Para saber',
    seeInShared: 'Ver el chunk',
    seeInBoot: 'Ver en el bootstrap',
    seeInScreens: 'Ver la pantalla',
    seeInProject: 'Ver el proyecto',
    seeInMeasured: 'Ver la medición',
    seeInSituation: 'Ver las respuestas',
    findingsRest: 'Contexto',
    findingsSee: 'Vista',
    findingsUnsee: 'Vista ✓',
    findingsSeenHelp: 'Marcar como vista: baja al final de la lista y deja de pedir atención.',
    findingsSeenCount: n => (n === 1 ? '1 vista' : `${n} vistas`),
    findingsSeenReset: 'Ninguna vista',
    findingsNoneHere: 'Ninguna señal de este tipo.',
    fixLabel: 'Qué hacer',

    legBoot: 'Bootstrap · se descarga siempre',
    legShared: 'Compartido · lo pagan varias pantallas',
    legOwn: 'Propio de esta pantalla',
    screensCaveat: 'Estas cifras se <strong>calculan</strong> recorriendo el grafo de importaciones, no se miden.',
    filterBoot: 'Filtrar paquetes',
    filterShared: 'Filtrar trozos',
    filterScreens: 'Filtrar pantallas por nombre…',
    sortByColumn: 'Ordenar por esta columna; otra vez, al revés',
    shownCount: (shown, total) => (shown === total ? `${total} pantallas` : `${shown} de ${total} pantallas`),
    shownRows: (shown, total) => (shown === total ? `${total} filas` : `${shown} de ${total} filas`),
    noMatch: 'Ninguna pantalla coincide con el filtro.',
    colScreen: 'Pantalla',
    colShared: 'Compartido',
    colOwn: 'Propio',
    colTotal: 'Total',
    helpTotal: 'Bootstrap + compartido + propio: lo que descarga quien entra directamente a esta pantalla.',
    helpOwnCol: 'Chunks que solo carga esta pantalla. Si es mucho, incluye una librería para ella sola.',
    helpSharedCol: 'Chunks lazy que esta pantalla comparte con al menos otra.',
    whichScreens: 'qué pantallas lo cargan',
    screenParts: 'De dónde sale',
    screenShape: n => {
        const heavy = `${n.files} ficheros, y ${n.heavy} de ellos son el ${n.share} % del peso`;
        return n.crumbs > 0 ? `${heavy}. ${n.crumbs} no llegan a ${n.crumbMax} (${n.crumbSize}).` : `${heavy}.`;
    },
    origin: 'Fichero de origen',
    filesCount: n => (n === 1 ? '1 fichero' : `${n} ficheros`),
    measureFromScreens: 'Medirlo de verdad',

    // --- eager, lazy and round trips ---
    tagDelivery: { eager: 'eager', lazy: 'lazy' },
    helpDelivery: {
        eager: 'Eager: se descarga con la primera carga, entre quien entre y por donde entre.',
        lazy: 'Lazy: no se descarga hasta que un import dinámico lo pide. Cuántas pantallas lo piden es la cifra de al lado.',
    },
    colWaves: 'Vueltas',
    helpWaves:
        'El navegador no sabe que un chunk existe hasta que ha descargado y leído el que lo importa. Dos idas y vueltas significa que una parte de la pantalla espera a que llegue la otra: los mismos bytes, más tarde.',
    screenWaves: n => (n <= 1 ? 'Llega en una ida y vuelta' : `Llega en ${n} idas y vueltas, una detrás de otra`),
    startupNote: startup => {
        if (!startup) {
            return 'Idas y vueltas de la primera carga: no se sabe. Suelta la carpeta browser/ con su index.html y Loadline lee qué chunks anuncia esa página.';
        }
        if (startup.late === 0) {
            const all =
                startup.chunks === 1 ? 'el único chunk del bootstrap' : `los ${startup.chunks} chunks del bootstrap`;
            return `index.html anuncia ${all}: la primera carga es una sola ida y vuelta.`;
        }
        const late = startup.late === 1 ? '1 chunk' : `${startup.late} chunks`;
        return `La primera carga son ${startup.waves} idas y vueltas: index.html no anuncia ${late} del bootstrap, así que el navegador ${startup.late === 1 ? 'lo' : 'los'} encuentra al leer los demás.`;
    },
    startupHelp:
        'Un chunk que index.html nombra —el script de entrada o un enlace modulepreload— se pide de inmediato. Uno que no, solo aparece cuando ha llegado el chunk que lo importa, y eso es otra ida y vuelta.',

    // --- measured tab ---
    tabMeasured: 'Medido',
    secMeasured: 'Lo que descarga el navegador',
    secMeasuredSub:
        'La única cifra de la herramienta que se mide en vez de calcularse. Pega aquí lo que descargó tu navegador y Loadline dice en qué se diferencia.',
    howToMeasured:
        '<p>El resto del informe <strong>calcula</strong>: recorre el grafo de importaciones estáticas y suma. Esta pestaña <strong>mide</strong>, y las dos cifras no dan lo mismo.</p><p>Al entrar por la raíz, el router carga el chunk de una zona para poder emparejar la ruta y solo después el guard comprueba la sesión y redirige. Ese chunk ya se descargó, y el cálculo no lo cuenta. Por eso lo calculado se queda corto.</p><p>Lo que se compara aquí es <strong>qué chunks se descargaron</strong>, no cuántos bytes dijo cada lado: el conjunto de chunks no depende de la unidad, así que un informe en gzip y un navegador que informa en bytes de red siguen comparándose bien. La diferencia se valora luego con las cifras de Loadline.</p>',
    measureStep1:
        'Sirve el build que cargaste y abre la aplicación por donde entra la gente: la raíz, no la ruta directa. Desactiva la caché en la pestaña de red.',
    measureStep2: 'Con la pantalla ya cargada, pega esto en la consola del navegador:',
    measureStep3: 'Pega aquí lo que te devuelva.',
    measureCopy: 'Copiar',
    measureCopied: 'Copiado',
    measurePlaceholder:
        'Pega aquí el resultado. También vale una lista de nombres de fichero copiada de la pestaña de red.',
    measureRun: 'Contrastar',
    measureClear: 'Olvidar la medición',
    measureErrEmpty: 'No hay nada pegado.',
    measureErrNoFiles: 'No se reconoce ningún nombre de fichero en lo pegado.',
    measureErrNoMatch:
        'Ningún fichero de lo pegado coincide con este build. Los nombres llevan hash y cambian en cada build: mide el mismo que cargaste.',
    measureStale: 'La medición guardada no coincide con este stats.json: son de builds distintos.',
    measureScreen: 'Pantalla medida',
    measureAuto: 'deducida de los chunks que se descargaron',
    measurePicked: 'elegida a mano',
    measureRootOnly: 'Solo el bootstrap: no se descargó ningún chunk de pantalla.',
    measureFrom: url => `Medido en ${url}`,
    measureComputed: 'Calculado',
    measureMeasured: 'Medido',
    measureDiff: 'Diferencia',
    measureSame: 'Sin diferencia',
    measureTransfer: 'Bytes por la red',
    measureTransferHelp:
        'Lo que el navegador dijo que costó la descarga, tal cual. Las otras cifras van en la unidad del informe, así que estas dos columnas solo coinciden si el informe está en comprimido.',
    measureFiles: n => (n === 1 ? '1 fichero' : `${n} ficheros`),
    measureExtra: 'Chunks descargados que no estaban previstos',
    measureExtraHelp:
        'El cálculo solo sigue importaciones estáticas. Lo que sale aquí llegó por otra vía: el router, una precarga, o un fichero que no es de este build.',
    measureExtraNone: 'Ninguno: se descargó exactamente lo previsto.',
    measureMissing: 'Chunks previstos que no se descargaron',
    measureMissingHelp:
        'O la medición se tomó antes de que la pantalla terminara de cargar, o vinieron de la caché sin aparecer en la lista, o el router no llega a pedirlos nunca.',
    measureMissingNone: 'Ninguno.',
    measureForeign: n =>
        n === 1 ? 'Un fichero descargado no es de este build.' : `${n} ficheros descargados no son de este build.`,
    measureOther: n =>
        `${n} descargas más (CSS, tipografías, imágenes) que no se cuentan: las cifras de Loadline son de JavaScript.`,
    measureBelongs: 'De quién es',
    measureNobody: 'De ninguna pantalla',
    measureZone: { boot: 'bootstrap', shared: 'compartido', own: 'de una pantalla' },
    measureNotes: 'Lo pegado se queda en este navegador, como todo lo demás.',

    measureObserved: 'Entorno observado',
    measureObservedHelp:
        'Lo que este pegado dice del despliegue: lo que se sirve, no lo que se construyó. Describe la máquina donde se ejecutó el snippet, con la conexión que tenía, el día que se ejecutó — no la de tus usuarios. Nada de esto mueve ningún umbral del informe.',
    measureTakenAt: date => `tomado el ${date}`,
    measureStaleFact: days => `tiene más de ${days} días — conviene volver a medir`,
    measureProtocol: 'Protocolo',
    measureRtt: 'Ida y vuelta',
    measureTtfb: 'Documento (viaje cero)',
    measureCompression: 'Compresión servida',
    measureCompressionOff: n => (n === 1 ? '1 fichero sin comprimir' : `${n} ficheros sin comprimir`),
    measureCacheState: 'Qué hizo la caché',
    measureCacheSplit: (fromCache, revalidated, network) =>
        `${fromCache} de caché · ${revalidated} revalidados · ${network} descargados`,
    measureConnections: 'Conexiones abiertas',
    measureThird: 'Terceros',
    measureThirdValue: (requests, origins) =>
        `${requests} peticiones a ${origins === 1 ? '1 host' : `${origins} hosts`}`,
    measureSw: 'Service worker',
    measureSwOn: 'controla esta carga',
    measureSwOff: 'no controla esta carga',
    measurePreloads: 'Etiquetas modulepreload',
    measureBatches: 'Tandas medidas',
    measureBatchesValue: (batches, widest) => `${batches} · la más ancha trae ${widest}`,
    measureUnknown: 'el pegado no lo dice',
    dataSource: {
        measured: 'medido',
        derived: 'del build',
        declared: 'lo contestaste tú',
        unknown: 'nadie lo miró',
    },
    dataSourceHelp: {
        measured: 'Lo informó un navegador. Uno, una vez, desde una máquina: es una medición real y es estrecha.',
        derived:
            'Calculado del build: el grafo de importaciones, los tamaños de los chunks, los nombres de fichero. Exacto sobre lo que se construyó y mudo sobre lo que se sirve.',
        declared: 'Alguien contestó una pregunta. Vale más que una suposición y menos que una medición.',
        unknown:
            'Nadie lo miró. Esto nunca se convierte en una media: una cifra que se supone por ti es una cifra que nadie puede comprobar.',
    },

    // --- situation tab ---
    tabSituation: 'Situación',
    secSituation: 'Cinco preguntas que el build no puede contestar',
    secSituationSub:
        'Cuatro afirmaciones de este informe están en gris a propósito, porque lo que las decidiría no está en ninguna carpeta. Está aquí.',
    howToSituation:
        '<p>El resto del informe sale de dos sitios: lo que dice el build y lo que midió un navegador. Hay un tercero que ninguno de los dos tiene, y es <strong>cómo trabaja tu equipo y quién usa esto</strong>. Sin él, la herramienta enseña el hecho crudo y se niega a ponerle color, que es lo correcto y no es gratis: una cascada que reinvalida el 87 % del build se queda como un número gris.</p><p>Estas cinco preguntas son ese tercer sitio. Se contestan una vez, se guardan en <span class="mono">loadline.json</span> y las lee también el comando, para que la terminal y esta página no digan cosas distintas del mismo build.</p><p><strong>Lo que una respuesta puede hacer es subir una severidad, y lo que no puede es bajarla.</strong> Si contestar optimista apagara señales, la forma barata de tener un informe limpio sería contestar optimista. Y «no lo sé» no ablanda nada: deja el informe exactamente donde estaba.</p>',
    sitQuestion: {
        navigation: '¿Cómo se mueve la gente por la aplicación?',
        deploys: '¿Cada cuánto sale una versión nueva a producción?',
        returning: 'De quien abre la aplicación un día cualquiera, ¿cuánta gente ya la había abierto esta semana?',
        connection: '¿Desde dónde y con qué se conecta?',
        priority: '¿Qué es peor: que tarde la primera pantalla, o que tarde ir de una a otra?',
    },
    sitOption: {
        navigation: {
            inAndOut: 'Entran, hacen una cosa concreta y se van',
            allDay: 'Pasan el día dentro, saltando entre secciones',
            profiles: 'Depende, hay dos o tres perfiles distintos',
            unknown: 'No lo sé',
        },
        deploys: {
            daily: 'Varias veces al día',
            weekly: 'Cada semana más o menos',
            monthly: 'Cada varias semanas',
            unknown: 'No lo sé',
        },
        returning: {
            most: 'Casi toda, es herramienta de trabajo',
            few: 'Casi nadie, la mayoría llega de fuera',
            half: 'Mitad y mitad',
            unknown: 'No lo sé',
        },
        connection: {
            office: 'Oficina, portátil, red buena',
            mobile: 'Móvil, en la calle, cobertura irregular',
            worldwide: 'Repartido por el mundo, lejos del servidor',
            unknown: 'No lo sé',
        },
        priority: {
            firstScreen: 'La primera, ahí decide la gente si se queda',
            navigation: 'La navegación, quien entra ya se queda',
            both: 'Igual de malo las dos',
        },
    },
    sitTechnical: {
        navigation: 'Mediana de pantallas distintas por sesión.',
        deploys: 'Despliegues por semana.',
        returning: 'Proporción de recurrentes, o tasa de caché caliente.',
        connection: 'RTT p75 y clase de dispositivo.',
        priority: 'LCP de entrada frente a latencia de transición de ruta.',
    },
    sitHowTo: {
        navigation: 'Cómo saberlo: eventos de cambio de ruta por sesión, en la analítica.',
        deploys: 'Cómo saberlo: los tags o releases del último trimestre.',
        returning: 'Cómo saberlo: la proporción de usuarios recurrentes de la analítica.',
        connection:
            'Esta es la que más va a mentir: la gente responde como le gustaría que fuera. Si tenéis RUM, no la contestéis — importadla.',
        priority: 'Esta no se busca en ningún sitio: es qué espera prefiere pagar el equipo, y hay que decidirla.',
    },
    sitPanel: 'Los mandos en crudo',
    sitPanelHelp:
        'La misma respuesta con menos redondeo, para quien la tenga a mano. Si escribes aquí, esta cifra manda sobre la opción de arriba.',
    sitRawLabel: {
        screensPerSession: 'Pantallas distintas por sesión',
        deploysPerWeek: 'Despliegues por semana',
        returningPct: 'Recurrentes',
    },
    sitRawUnit: { screensPerSession: 'pantallas', deploysPerWeek: 'por semana', returningPct: '%' },
    sitRawEmpty: '—',
    sitOpen: 'sin contestar',
    sitLatency: ms =>
        `El informe convierte bytes en segundos con ${ms} ms de ida y vuelta. Esa es la cifra que contesta esta pregunta de verdad, y se edita en Criterios.`,
    sitLatencyGo: 'Editar la latencia',
    sitNoRaw:
        'Sin equivalente en crudo: su unidad son dos medidas que esta herramienta no toma. Es una decisión, no un dato.',
    sitRum: 'Tenemos RUM',
    sitRumHelp:
        'Si medís sesiones reales, la p75 de protocolo y de ida y vuelta sale de ahí y no de un pegado de consola ni de una opción de esta lista. Marcarlo retira la cuarta pregunta y deja la latencia como lo que hay que traer de vuestros datos.',
    sitRumOn: 'La cuarta pregunta no se contesta: se importa de vuestro RUM.',
    sitWho: 'Quién contesta',
    sitWhoPlaceholder: 'un nombre o un handle',
    sitWhen: 'Fecha',
    sitStale: days =>
        `Estas respuestas tienen más de ${days} días. La cadencia de despliegue es justo lo que cambia cuando un equipo se pasa a entrega continua: repásalas antes de fiarte de la cifra.`,
    sitNoDate: 'Sin fecha no hay forma de saber cuándo dejaron de ser verdad.',
    sitAnswered: (answered, total) =>
        answered === 0 ? 'Sin contestar' : `${answered} de ${total} preguntas contestadas`,
    sitReset: 'Borrar las respuestas',
    sitExport: 'Descargar loadline.json',
    sitExportHelp:
        'El bloque de situación como fichero, para commitearlo junto al código. El comando lo lee, así que la terminal deja de discrepar con esta página.',
    sitCost: (deploys, returning, perWeek) =>
        `${deploys} despliegues por semana × ${returning} que vuelve = cada persona paga la actualización ${perWeek} veces por semana`,
    sitCostNone:
        'Faltan las dos respuestas que convierten el porcentaje de invalidación en un coste: cada cuánto despliegas y qué proporción vuelve.',
    sitExposure: {
        high: 'la cascada de hashes es una de las líneas caras de este informe',
        moderate: 'la cascada se paga, ni todas las semanas ni en balde',
        low: 'la cascada apenas se paga: casi todos se lo descargan entero de todas formas',
        unknown: 'sin las dos respuestas, el hecho se enseña entero y el color se retiene',
    },
    sitBreadth: {
        narrow: 'sesiones de una pantalla: la cobertura de un chunk diferido significa lo que parece',
        wide: 'sesiones que recorren la aplicación: un chunk compartido lo descarga casi todo el mundo',
        mixed: 'dos o tres perfiles: la mediana no describe a ninguno, y las coberturas hay que leerlas por perfil',
        unknown: 'sin saber la amplitud de las sesiones, la cobertura de un chunk diferido no es interpretable',
    },
    sitAsymmetry: 'Contestar puede subir la severidad de una señal. No puede bajarla, y «no lo sé» no ablanda nada.',
    sitDeclared: 'declarado',

    thSource: 'Origen',
    thSize: 'Tamaño',
    thChunk: 'Chunk',
    thScreens: 'Pantallas',
    chunkNoContent: 'sin contenido propio que atribuir',
    thMain: 'Contenido principal',
    thOwn: 'Propio de esta pantalla',
    thSharedWith: 'Compartido con otras',
    thCoverage: 'Cobertura',
    thImporters: 'Quién lo importa',
    helpScreens: 'En cuántas pantallas lazy aparece este chunk.',
    helpSize: 'Tamaño del fichero tal y como se descarga: en crudo o comprimido, según lo que hayas cargado.',
    helpMain: 'El fichero fuente que más pesa dentro del chunk. Sirve para reconocerlo.',
    helpCoverage:
        'Cuántas de tus pantallas cargan este chunk. Por encima del 60 % se descarga, en la práctica, siempre.',
    helpImporters: 'Ficheros de tu código que importan este paquete directamente, y si están todos en pantallas lazy.',
    helpSource: 'Paquete de npm o carpeta de tu proyecto.',

    covGlobal: 'en la práctica, bootstrap',
    covWide: 'muy compartido',
    covNarrow: 'poco compartido',
    coverageOf: (n, total) => `${n} de ${total}`,
    loadedBy: n => `Lo cargan estas ${n} pantallas`,
    contents: 'Qué lleva dentro',
    pathRawHelp:
        'El desglose por fichero siempre va sin comprimir. Gzip comprime el fichero entero aprovechando repeticiones que cruzan de un módulo a otro, así que no existe «lo que pesa este módulo comprimido».',
    pathUnattributed: size => `${size} sin atribuir`,
    pathUnattributedHelp:
        'Lo que el chunk pesa de más que la suma de sus ficheros: el código que añade el propio bundler (el envoltorio de los módulos, las cabeceras). No es de ningún fichero de entrada, así que no se le reparte a nadie.',
    treeRawHelp:
        'El mismo chunk sin comprimir, que es la unidad del desglose de dentro y la que enseñan otras herramientas de bundle.',
    pathExpandAll: 'Desplegar todo',
    pathCollapseAll: 'Plegar todo',
    worthTitle: 'Cuánto cuesta y de dónde viene',
    worthTagSmall: 'Por debajo del umbral',
    worthTagOwn: 'Código tuyo',
    worthTagPackage: importers =>
        importers === 1 ? '1 paquete · 1 fichero tuyo' : `1 paquete · ${importers} ficheros tuyos`,
    worthTagCommon: 'Sin origen dominante',
    worthCost: (cost, share, without) =>
        `Suma ${cost} a la carga típica, un ${share} % de lo que se descarga hoy antes de ver nada. Si desapareciera del todo, esa carga se quedaría en ${without}: ese es el máximo que se puede ganar aquí.`,
    worthSmall: min =>
        `Está por debajo de ${min}, que es el mínimo a partir del cual la diferencia se nota: la ganancia entraría dentro de la variación normal entre dos builds.`,
    worthOwn: (label, share) =>
        `El ${share} % es código tuyo (${label}), así que el cambio depende de ti. El caso típico es un barrel file que reexporta toda una carpeta: importar una cosa incluye el resto, y basta con importar del fichero concreto.`,
    worthPackage: (pkg, share, importers) =>
        `El ${share} % es ${pkg}, y ${importers === 1 ? 'solo lo importa 1 fichero tuyo' : `solo lo importan ${importers} ficheros tuyos`}: hay un sitio concreto donde comprobar si esas pantallas lo necesitan o si se puede cargar solo donde hace falta.`,
    worthCommon:
        'Ningún grupo llega a la mitad del chunk, o el que llega lo importa una gran parte de la aplicación: no hay un fichero concreto al que señalar. Las dos salidas que quedan son usar menos esa librería o cambiarla por una más pequeña.',
    worthNoSplit:
        'Partirlo no ahorra nada: el bundler agrupa los ficheros por qué pantallas los alcanzan, así que las dos mitades las cargarían exactamente las mismas. Lo único que baja esta cifra es que menos pantallas lo importen, o que pese menos.',
    worthTriage: n =>
        `De los ${n.namedN + n.spreadN + n.smallN} chunks compartidos: ${n.namedN} con un origen concreto (${n.namedCost} de la carga típica) · ${n.spreadN} sin origen dominante (${n.spreadCost}) · ${n.smallN} por debajo de ${n.min}.`,

    sharedSum: (size, chunks, ratio) =>
        `${chunks === 1 ? 'El chunk casi global suma' : `Los ${chunks} chunks casi globales suman`} <strong>${size}</strong>: quien entra a casi cualquier pantalla lo descarga junto al bootstrap. Cobertura mínima para contar: ${pct(ratio)}.`,
    sharedSumNone: ratio =>
        `Ningún chunk compartido llega al ${pct(ratio)} de cobertura: lo lazy se descarga solo cuando hace falta.`,

    bootPackages: 'Paquetes de npm',
    bootOwnCode: 'Código tuyo',
    entriesCount: n => `${n} entradas`,
    importersCount: n => (n === 1 ? '1 fichero tuyo' : `${n} ficheros tuyos`),
    importersNone: 'nadie directamente · lo importa otro paquete',
    importersLazyOnly: (lazy, total) => `${lazy} de ${total} en pantallas lazy`,
    ownCodeRow: 'carpeta del proyecto',
    legBootPkg: 'Paquete de npm',
    legBootOwn: 'Carpeta de tu código',
    legBootBad: 'Pocos importadores y alguno en pantalla lazy',
    helpBootPackages:
        'Código de terceros que entra en el bootstrap. Para bajarlo hay que dejar de importarlo desde el bootstrap o pasarlo a una pantalla lazy.',
    helpBootOwnCode:
        'Código tuyo, agrupado por carpeta del proyecto. No hay paquete que quitar: aquí decides qué se queda y qué pasa a lazy.',
    helpBootSplit: (pkg, own) => `${pkg} en paquetes de npm · ${own} en código tuyo`,
    helpBootPercent: 'Parte del bootstrap que ocupa esta entrada.',
    helpBootOfBoot: 'del bootstrap',
    helpBootLazyOnly: max =>
        `Lo importan ${max} ficheros tuyos como mucho y al menos uno está en una pantalla lazy, así que se pueden mirar uno a uno. Si al abrirlos resulta que todos son lazy, este paquete se descarga en el bootstrap para gente que quizá no llegue nunca a esa pantalla.`,
    helpImportersNone:
        'Ningún fichero tuyo lo importa directamente: lo importa otro paquete. No se quita desde tu código, sino desde el paquete que lo trae.',
    bootChain: 'Cómo entra en el bootstrap',
    bootChainNone: 'No se ha podido seguir desde el punto de entrada siguiendo imports estáticos.',
    tagCommonJs: 'CommonJS',
    helpCommonJs:
        'Publicado en CommonJS: el bundler no puede aplicarle tree-shaking y cada fichero importado entra entero.',
    loadedFrom: 'Se carga desde',

    treeAll: 'Todo',
    treeBoot: 'Bootstrap',
    treeLazy: 'Lazy',
    treeShared: 'Compartido',
    treeOwn: 'De una pantalla',
    treeScreens: n => (n === 1 ? '1 pantalla' : `${n} pantallas`),
    filterTree: 'Filtrar por chunk, paquete o carpeta…',
    treeCrumbs: (n, total, line) => `${n} trozos por debajo de ${line} · ${total} entre todos`,
    treeNoMatch: 'Nada coincide con el filtro.',
    shapeTitle: 'Cómo está repartido',
    treeShare: (share, zone) =>
        zone === 'boot'
            ? `${share} % del bootstrap`
            : zone === 'shared'
              ? `${share} % de lo compartido`
              : `${share} % de lo que carga una sola pantalla`,
    treeShareHelp:
        'Cuánto pesa este chunk dentro de su zona. Se marca a partir del 25 %: es donde está el peso, y por tanto lo que hay que mirar antes que las filas de abajo.',
    shapeSplit: eager => `El ${eager} % se descarga en cada carga; el resto solo cuando algo lo pide.`,
    shapeBoot: 'Lo paga todo el mundo',
    shapeShared: 'Lo pagan varias pantallas',
    shapeOwn: 'Lo paga una sola pantalla',
    shapeNote: n => {
        const of = { boot: 'del bootstrap', shared: 'de lo compartido', own: 'de una sola pantalla' }[n.zone];
        // The second half does not repeat the zone when the first one has already named it.
        const heavy = n.heavy ? `el ${n.share} % ${of} está en un solo fichero` : '';
        const which = heavy ? '' : ` ficheros ${of}`;
        const crumbs =
            n.crumbs > 0 ? `${n.crumbs} de los ${n.files}${which} no llegan a ${n.crumbMax} (${n.crumbSize})` : '';
        return `${[heavy, crumbs].filter(Boolean).join(', y ')}.`;
    },
    helpZoneAll: 'Todos los chunks que genera el bundler, sea quien sea el que los pague.',
    helpZoneBoot: 'Bootstrap (gris): se descarga siempre, entre quien entre y por donde entre.',
    helpZoneShared: 'Compartido (naranja): lo cargan varias pantallas lazy, así que lo paga más de una.',
    helpZoneOwn: 'De una pantalla (verde): solo lo descarga quien entra en esa pantalla.',
    helpTreeBar: percent => `Ocupa el ${percent} % del chunk más grande de la lista.`,

    tabSearch: 'Buscar',
    secSearch: 'Buscar en el bundle',
    secSearchSub: 'Escribe el nombre de un paquete o de un fichero y sale dónde está y qué lo importa.',
    howToSearch:
        '<p>El resto del informe contesta <strong>qué pesa</strong>. Aquí se contesta la pregunta contraria: <strong>¿está esto dentro?</strong> Se escribe un nombre y sale en qué chunks aparece, cuánto pesa en cada uno, qué pantallas lo pagan y por qué cadena de imports entra.</p><p>Los ficheros de <code>node_modules</code> salen agrupados por paquete, que es la unidad sobre la que se decide algo; los ficheros del proyecto salen uno por uno, que es la unidad que se edita. Un paquete también coincide por el nombre de sus ficheros, así que buscar <code>md5</code> encuentra <code>crypto-js</code>.</p><p>Si no sale nada, ese nombre no está en el bundle.</p>',
    searchPlaceholder: 'Nombre de paquete o de fichero…',
    searchHeaviest: (shown, total) => `Los ${shown} nombres más pesados, de ${total} que hay en este build.`,
    searchTooShort: 'Escribe al menos dos letras.',
    searchNoMatch: query => `No hay nada llamado «${query}» en el bundle. No entra en el build.`,
    searchFound: (shown, total) => (shown === total ? `${total} coincidencias` : `${shown} de ${total} coincidencias`),
    searchKindPackage: 'paquete',
    searchKindFile: 'fichero del proyecto',
    searchInBoot: 'en el bootstrap · lo paga toda carga de la aplicación',
    searchPartlyBoot: size => `${size} de esto está en el bootstrap, y eso lo paga toda carga`,
    searchScreensCount: n => (n === 1 ? 'lo carga 1 pantalla' : `lo cargan ${n} pantallas`),
    searchMatchedIn: n => (n === 1 ? 'coincide en 1 fichero' : `coincide en ${n} ficheros`),
    searchCopiesTag: n => `${n} copias`,
    searchChain: 'Por dónde entra',
    searchChainNone: 'No se ha podido seguir desde el punto de entrada.',
    whyHere: 'Por qué está esto aquí',
    whyHereOf: name => `Por qué está aquí ${name}`,
    whyHereNone:
        'Nada de lo que se alcanza desde el punto de entrada lo importa. Está en la compilación, y no hay cadena de imports que lleve hasta él.',
    searchPlaces: 'En qué chunks está',
    thZone: 'En qué zona está',
    helpZone:
        'El bootstrap lo paga todo el mundo; lo compartido, las pantallas que lo cargan; lo de una pantalla, solo ella.',
    searchTwice: 'Está en más de un chunk: se paga una vez por chunk.',
    seeInSearch: 'Buscarlo en el bundle',

    dupCopy: copy =>
        copy.version ? `versión ${copy.version}` : copy.under ? `copia dentro de ${copy.under}` : 'copia principal',
    dupZone: { boot: 'en el bootstrap', shared: 'en un chunk compartido', own: 'en una sola pantalla' },
    dupBroughtBy: 'Entra por',
    dupImportedBy: 'La importan',
    dupNobody: 'nadie de tu código directamente',

    noScreens: 'No se han detectado pantallas lazy. Toda la aplicación entra en el bootstrap.',
    noShared: 'Ningún chunk lazy lo comparten dos pantallas.',
    noExclusive: 'Nada exclusivo.',
    noSharedRow: 'Nada compartido.',
    footerSummary: '¿De dónde salen estas cifras?',
    footer: 'Todo se calcula en tu navegador a partir del metafile: nada se sube a ningún sitio. Las cifras en crudo son bytes en disco; las comprimidas se calculan con gzip sobre los ficheros reales, que es lo que paga quien usa la aplicación. El navegador no sabe comprimir en brotli, así que esa cifra solo sale si la carpeta trae los .js.br ya comprimidos; si no los trae, cuenta con que en brotli sea entre un 15 % y un 20 % menos que el gzip que ves. Pulsa ? para ver los atajos de teclado.',

    errNoEntries: 'El fichero no parece un metafile de esbuild: no hay puntos de entrada.',
    errNoMain: 'No se ha podido identificar el punto de entrada principal.',
    errNoOutputs: 'El JSON tiene forma de metafile pero no trae la clave "outputs".',
    errNotMetafile: 'El JSON no es un metafile de ninguno de los formatos que se reconocen.',
    errExpected:
        'Se espera el stats.json que escribe `ng build --stats-json` (un objeto con "outputs" e "inputs"), o la carpeta browser/ entera, que Loadline lee sola.',
    errNotEsmGraph:
        'los trozos de esta carpeta son salida de webpack o de Turbopack, no módulos ES: sus importaciones son números que resuelve el cargador en tiempo de ejecución, así que no hay grafo dentro de los ficheros que leer. Eso es Next.js, Create React App y Angular 16 o anterior. Para ese formato está Statoscope, que lo hace mejor.',
    errNoPage:
        'La carpeta no trae un index.html que nombre el script por el que arranca la aplicación, y sin él no hay forma de distinguir el trozo de entrada de uno compartido: el compilador escribe el código común dentro del trozo de entrada, así que la entrada acaba importada por sus propios hijos. Añade la página a la carpeta, o carga el stats.json del build.',
    errWebpackStats:
        'no es un metafile de esbuild, sino un stats.json de webpack. Con Angular 17 en adelante lo genera el builder application (`ng build --stats-json`); si el proyecto sigue con el builder browser, esa es la razón. Loadline no lee el formato de webpack a propósito: para eso está Statoscope, que hace ese trabajo mejor.',
    errViteManifest:
        'no es un metafile de esbuild, sino el manifest.json de Vite. No hace falta: suelta la carpeta compilada y Loadline lee el grafo de los propios trozos, que es donde Vite lo escribe de verdad.',
    errVisualizer:
        'no es un metafile de esbuild, sino la salida de rollup-plugin-visualizer. Loadline lee el metafile de esbuild, que es otra cosa.',
};
