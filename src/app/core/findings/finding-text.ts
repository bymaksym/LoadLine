import { formatCount } from '../format/format.utils';
import {
    type AssetOriginData,
    type BootLazyData,
    type CommonJsItem,
    type DupeCopyData,
    type DupesData,
    type MeasuredExtraData,
    type ObservedChannelData,
    type SituationAskedData,
    type SituationMissingData,
    type SituationPriorityData,
} from './finding.types';
import { mono } from './finding-html';

/** A share as a percentage, for the answers that arrive as a fraction of one. */
const pct = (share: number): string => `${Math.round(share * 100)} %`;

/**
 * Every signal in both languages. Kept apart from `i18n.ts` because they are the opinionated part:
 * when it fires, what it means and what to do, including what NOT to do.
 *
 * The bundler's vocabulary — chunk, bundle, bootstrap, eager, lazy, budget, tree-shaking, source
 * map, barrel file, build — reads the same in both languages, so a reader switching between them
 * finds the same word for the same thing.
 */
export const TEXT = {
    es: {
        /** What the entry through the root is called when the measurement matches no screen. */
        rootScreen: 'la raíz',
        shared: (d: { size: string; screens: number; total: number; chunk: string; top: string }) => ({
            chip: 'código común marcado como lazy',
            title: `${d.size} que se descargan en ${d.screens} de tus ${d.total} pantallas`,
            body: `El chunk ${mono(d.chunk)} sale en la lista de lazy del bundler, así que parece que solo lo paga quien abre esa pantalla. Lo importan <strong>${d.screens} pantallas</strong>: en la práctica se descarga siempre. Su contenido principal es ${mono(d.top)}.`,
            fix: 'Suele ser un barrel file que reexporta una carpeta entera de interfaz y que importan todas las pantallas. Antes de partirlo entero, mira el reparto: si la mayor parte la usan casi todas, repartirlo solo la mueve a otro fichero. Lo que sí compensa es sacar los componentes que use una sola pantalla.',
        }),
        bootLazy: (d: BootLazyData) => ({
            chip: 'bootstrap para una pantalla lazy',
            title: `${d.pkg} pesa ${d.size} en el bootstrap, y quien lo usa es una pantalla lazy`,
            body: `Lo descarga <strong>toda carga de la aplicación</strong>, aunque su pantalla sea lazy y mucha gente no llegue a abrirla nunca. El consumidor real está en ${d.screens}, y son ${d.files} ficheros los que lo importan en total.${
                d.chain
                    ? ` Entra en el bootstrap por ${d.chain}${d.entry ? `: el import que lo trae es el de ${mono(d.entry)}` : ''}.`
                    : ''
            }`,
            fix: `Mueve su registro de la configuración de bootstrap a los proveedores de esa ruta${
                d.routes
                    ? `, en ${d.routes}, que es donde se carga la pantalla`
                    : ', dentro de un fichero de rutas lazy'
            }. Un efecto secundario a tener en cuenta: si tienes guards que comparan contra ${mono('routeConfig.path')}, deja el guard en la ruta padre, porque al anidar el hijo pasa a tener ${mono("path: ''")} y el guard deja de reconocerla.`,
        }),
        commonJs: (d: { count: number; size: string; items: CommonJsItem[] }) => ({
            chip: 'paquete en CommonJS',
            title:
                d.count === 1
                    ? `Un paquete en formato CommonJS (${d.size}): el bundler no puede aplicarle tree-shaking`
                    : `${d.count} paquetes en formato CommonJS (${d.size}): el bundler no puede aplicarles tree-shaking`,
            body: `Un paquete en CommonJS no se puede analizar durante el build, así que cada fichero suyo que se importa entra entero aunque se use una sola función. Es lo que Angular avisa con «CommonJS or AMD dependencies can cause optimization bailouts». Tamaños en crudo, dentro del chunk: ${d.items
                .map(item => {
                    const where =
                        item.zone === 'boot'
                            ? 'en el bootstrap'
                            : item.zone === 'shared'
                              ? `en un chunk compartido por ${item.screens} pantallas`
                              : 'en una sola pantalla';
                    const who =
                        item.importers.length > 0
                            ? `; lo importa ${item.importers.map(file => mono(file)).join(', ')}`
                            : item.via.length > 0
                              ? `; lo importa ${item.via.map(pkg => mono(pkg)).join(', ')}`
                              : '';
                    return `${mono(item.name)} (${item.size}, ${where}${who})`;
                })
                .join(' · ')}.`,
            fix: `Comprueba si el paquete publica una versión en módulos ES o si hay una alternativa que la tenga. Si no, importa solo el fichero que necesitas (${mono('crypto-js/md5')} en vez de ${mono('crypto-js')}) para que entre lo mínimo. Añadirlo a ${mono('allowedCommonJsDependencies')} en ${mono('angular.json')} solo apaga el aviso: el peso sigue ahí.`,
        }),
        bigFile: (d: { count: number; each: string; name: string; size: string; list: string }) => ({
            chip: d.count === 1 ? 'fichero propio grande' : 'ficheros propios grandes',
            title:
                d.count === 1
                    ? `${d.name} ocupa ${d.size} del bootstrap`
                    : `${d.count} ficheros tuyos ocupan ${d.size} del bootstrap, cada uno de más de ${d.each}`,
            body: `Un fichero tuyo de este tamaño suele ser una tabla de constantes —claves de traducción, catálogos, rutas— que entra entera porque se referencia desde todas partes. ${d.list}`,
            fix: 'Comprueba cuánto es comprimido antes de tocarlo: el texto repetitivo baja mucho y puede no compensar. Si crece con cada entrada nueva, al menos vigílalo con un budget de tamaño.',
        }),
        dupeZone: { boot: 'en el bootstrap', shared: 'en un chunk compartido', own: 'en una sola pantalla' },
        dupeCopy: (d: DupeCopyData) =>
            `<strong>${d.version ? `versión ${d.version}` : d.under ? `copia anidada en ${mono(d.under)}` : 'copia principal'}</strong> · ${d.size} · ${d.zone}. ${
                d.chain ? `Entra por ${d.chain}` : 'No se ha podido seguir desde el punto de entrada'
            }${d.own ? `; la importa tu código en ${d.own}` : d.via ? `; la importa ${d.via}` : ''}.`,
        dupes: (d: DupesData) => ({
            chip: 'copias duplicadas',
            title: `${d.count} paquete${d.count > 1 ? 's' : ''} que viaja${d.count > 1 ? 'n' : ''} más de una vez en el bundle`,
            body: `Se paga el peso dos veces porque dos dependencias piden rangos incompatibles.${
                d.inBoot
                    ? ' Una de las copias está en el bootstrap, así que ese peso de más lo descarga todo el mundo.'
                    : ''
            } ${d.list}`,
            fix: d.viaDependency
                ? `Al menos una de las copias no la pides tú: la importa otra dependencia, así que alinear tu ${mono('package.json')} no basta. Fuerza la resolución con ${mono('pnpm.overrides')}, ${mono('overrides')} (npm) o ${mono('resolutions')} (yarn), y comprueba que la versión que dejas vale para las dos.`
                : `Las dos copias entran por dependencias que pides tú directamente: alinea las versiones en ${mono('package.json')} y vuelve a medir.`,
        }),
        heavy: (d: { count: number; label: string; own: string; median: string; list: string }) => ({
            chip: d.count === 1 ? 'pantalla cara' : 'pantallas caras',
            title:
                d.count === 1
                    ? `${d.label} incluye ${d.own} que no usa nadie más`
                    : `${d.count} pantallas traen mucho más código propio que el resto; la peor es ${d.label} con ${d.own}`,
            body: `La pantalla media tiene ${d.median} de código propio. ${d.count === 1 ? 'Esta tiene' : `${d.label} tiene`} ${d.own}, así que trae una librería pesada solo para ella.${
                d.list ? ` Detrás van ${d.list}.` : ''
            }`,
            fix: 'Si esa librería solo hace falta al abrir algo dentro de la pantalla (un visor, un editor, una gráfica), muévela a un bloque lazy para que no la pague quien solo pasa por ahí. Con varias pantallas en la lista, mira antes si es la misma librería en todas: entonces el arreglo es uno, no cinco.',
        }),
        ownInBoot: (d: { count: number; name: string; size: string; list: string }) => ({
            chip: 'código tuyo en el bootstrap para una pantalla lazy',
            title:
                d.count === 1
                    ? `La carpeta ${d.name} pesa ${d.size} en el bootstrap, y quien la usa son pantallas lazy`
                    : `${d.count} carpetas tuyas suman ${d.size} en el bootstrap, y quien las usa son pantallas lazy`,
            body: `Lo mismo que pasa con un paquete de npm, pero con código tuyo: lo descarga toda carga de la aplicación aunque su consumidor sea una pantalla lazy. ${d.list}.`,
            fix: 'Mira la lista entera de lo que lo mantiene en el bootstrap, no solo el primero: si mueves uno y los otros lo siguen importando, no baja nada. El caso típico es una capa de infraestructura que depende en tiempo de build de una capa de negocio, por ejemplo un proveedor registrado en la configuración de bootstrap que importa los servicios de casi todas las entidades. Se corrige registrando eso en los proveedores de la ruta, o cortando la dependencia entre capas. Y si el fichero de bootstrap que lo importa lo necesita, no hay nada que mover: entonces la señal solo informa.',
        }),
        ownInBootKept: (keeping: string, screens: number) =>
            `lo mantienen en el bootstrap ${keeping}; lo usan ${screens === 1 ? '1 pantalla lazy' : `${screens} pantallas lazy`}`,
        manyRequests: (d: {
            files: number;
            tiny: number;
            tinySize: string;
            max: number;
            worstLabel: string;
            worstFiles: number;
            small: number;
            smallSize: string;
        }) => ({
            chip: 'granularidad del troceado',
            title: `${d.tiny} de los ${d.files} ficheros que descarga junta la pantalla típica están por debajo de ${d.tinySize}`,
            body: `El titular es la granularidad, no el conteo, y el cambio es deliberado: <strong>un umbral de cantidad no distingue el caso bueno del malo</strong>. Bajo multiplexado, sesenta ficheros bien dimensionados están bien y sesenta migas no, y ${d.max} no separa los dos. Lo que sí separa es esto: por debajo de ${d.tinySize} pedir el fichero cuesta más o menos lo que trae. Se cuenta lo que <strong>llega junto</strong> —el bootstrap más lo que esa pantalla trae—, no la lista de chunks del build: un chunk pequeño que casi nadie carga está haciendo su trabajo. La pantalla más partida es ${mono(d.worstLabel)}, con ${d.worstFiles} ficheros. Bajo HTTP/1.1 el conteo sí cuesta segundos, y entonces lo dice otra señal: la que ve el pool de conexiones agotarse en una medición de verdad.`,
            fix: `Bajo HTTP/2 y HTTP/3 el coste real de una miga no son bytes —las cabeceras HPACK/QPACK de un fichero del mismo origen son cientos de bytes, así que 1 kB sigue saliendo a cuenta—: son entradas de caché, registros en el module map y, sobre todo, <strong>síntoma de que las fronteras del troceado no coinciden con las del uso</strong>. Esa es la frase que importa. El troceado tampoco lo ha decidido nadie: el bundler crea un chunk por cada conjunto distinto de pantallas que alcanzan un módulo, así que muchos chunks significa muchas combinaciones de «esto lo usan estas pantallas y no aquellas», y se reducen quitando combinaciones —un barrel file importado por unas cuantas pantallas genera un chunk por combinación, e importar del fichero concreto las reduce—.${
                d.small > 0
                    ? ` Si quieres ir por el otro lado: tienes ${d.small} chunks por debajo de ${d.smallSize} en crudo, y ${mono('experimentalMinChunkSize')} de Rollup existe justo para eso. Cuántos fusiona de verdad solo lo sabrás ejecutándolo — solo fusiona chunks con relaciones de dependencia compatibles, y su umbral se mide antes de minificar, así que esos ${d.small} son una <strong>cota superior</strong>, no una predicción.`
                    : ''
            } Y la regla que va con esto: donde haya tensión, las dos magnitudes encima de la mesa —arranque en ms frente a caché retenida en kB— y ninguna recomendación automática de fusionar. Un chunk grande que junta lo que cambia con lo que no se invalida entero en cada despliegue.`,
        }),
        bootWaves: (d: {
            waves: number;
            count: number;
            next: number;
            list: string;
            critical: string;
            criticalBytes: string;
            offPath: number;
            width: number;
        }) => ({
            chip: 'el arranque en varias idas y vueltas',
            title: `La primera carga tarda ${d.waves} idas y vueltas antes de pintar nada`,
            body: `Un trozo que ${mono('index.html')} nombra —el script de entrada o un ${mono('modulepreload')}— se pide de inmediato; uno que no, solo se descubre cuando ha llegado y se ha leído el que lo importa. ${d.count === 1 ? 'Queda 1 trozo del arranque sin nombrar' : `Quedan ${d.count} trozos del arranque sin nombrar`}: ${d.list}. Son los mismos bytes una ida y vuelta más tarde, y caen justo en el momento que paga todo el mundo.${d.count === 1 ? '' : d.next === d.count ? ' Los descubre todos de una vez, así que entre todos cuestan una ida y vuelta, no una cada uno.' : ` De esos, ${d.next === 1 ? '1 se descubre' : `${d.next} se descubren`} en la ida y vuelta siguiente y el resto va detrás: eso es una cadena, y cada nivel cuesta su propio viaje.`}`,
            fix: `${
                d.critical
                    ? `La cadena que cuesta viajes de verdad es ${d.critical} (${d.criticalBytes}): esos son los que, nombrados en la página, quitan una espera.${d.offPath > 0 ? ` Los otros ${d.offPath} llegan en un viaje que ya se paga de todos modos, así que una etiqueta para ellos no adelanta nada y sí compite por el ancho de banda.` : ''} `
                    : ''
            }Nombrar en la página lo que hoy se descubre leyendo es lo que quita la espera, y <strong>la cantidad de etiquetas es parte del coste, no de la solución</strong>. ${d.count === 1 ? 'Aquí es una etiqueta.' : d.next === d.count ? `Aquí hacen falta las ${d.count}: comparten viaje, así que poner algunas y no todas no adelanta nada.` : `Aquí ${d.next === 1 ? 'la del trozo del viaje siguiente acorta' : `las ${d.next} del viaje siguiente acortan`} la cadena en un nivel; llegar a una sola ida y vuelta pide las ${d.count}.`} Casi ningún proyecto las escribe a mano: Angular las escribe para los trozos iniciales y Vite tiene ${mono('build.modulePreload')} —si está apagado, esta es la factura—. Lo que no conviene es tomarlo como costumbre: una página con decenas de ${mono('modulepreload')} compite por el ancho de banda con el CSS que bloquea el pintado, y hay equipos que han medido el primer pintado <strong>peor</strong> después de añadirlos. Ponlas <strong>después</strong> de los ${mono('&lt;link rel="stylesheet"&gt;')}, para que la hoja de estilos no pierda su prioridad, y solo para el arranque: un trozo de una ruta a la que nadie ha navegado todavía se precarga por intención o en reposo, nunca con un ${mono('modulepreload')} que paga todo el mundo. Y si resulta que no hacen falta antes de pintar, la otra salida es diferirlos, y entonces la primera carga además pesa menos.`,
        }),
        slowScreens: (d: {
            count: number;
            max: number;
            worstLabel: string;
            worstWaves: number;
            worstWidth: number;
            latencyMs: number;
            worstMs: number;
            list: string;
        }) => ({
            chip: 'profundidad de descubrimiento',
            title: `${d.worstLabel} tarda ${d.worstWaves} idas y vueltas en estar completa: ${d.worstMs} ms de espera pura`,
            body: `El navegador no sabe que un trozo existe hasta que ha descargado y leído el que lo importa, así que una pantalla repartida en varios niveles de importaciones estáticas cuesta esas peticiones <strong>en serie</strong>, pese lo que pese. <strong>El umbral aquí es una fórmula, no un número:</strong> cada ida y vuelta es al menos una latencia, así que ${d.worstWaves} × ${d.latencyMs} ms = ${d.worstMs} ms que ninguna cifra de tamaño enseña. Y vale igual en todos los protocolos: ninguna compresión toca una ida y vuelta, y el multiplexado tampoco, porque lo que limita no es el transporte sino el descubrimiento secuencial. ${d.count === 1 ? 'Una pantalla llega' : `${d.count} pantallas llegan`} en ${d.max} o más: ${d.list}. ${
                d.worstWidth <= 1
                    ? 'Su viaje más ancho trae un solo fichero: es una cadena de punta a punta, y cada nivel que se aplane quita una espera entera.'
                    : `Su viaje más ancho trae ${d.worstWidth} ficheros: profundidad y anchura son problemas distintos y el número de viajes los cuenta igual. Los ${d.worstWidth} de ese viaje cuestan uno entre todos; lo que cuesta viajes es lo que va detrás de ellos.`
            }`,
            fix: 'Mira la cadena en la tabla de Pantallas: cada nivel es un fichero que importa a otro de forma estática. Se acorta importando desde la pantalla lo que hoy le llega a través de un intermediario, o —si el bundler lo permite— haciendo que el cargador pida la lista entera de golpe, que es lo que hace Vite con su lista de precarga. No es una cuestión de tamaño: fusionar chunks no la arregla si la cadena sigue teniendo la misma profundidad.',
        }),
        locales: (d: { packages: { name: string; files: number; size: string }[]; size: string; boot: boolean }) => ({
            chip: 'todos los idiomas de una librería',
            title: `${d.size} en ficheros de idioma: ${d.packages.map(p => `${p.name} incluye ${p.files}`).join(', ')}`,
            body: `Una librería que guarda sus idiomas en una carpeta ${mono('locale/')} los incluye todos si se importa por su raíz, y luego se usa uno. ${d.packages
                .map(p => `${mono(p.name)}: ${p.files} ficheros, ${p.size}`)
                .join(' · ')}.${d.boot ? ' Están en el bootstrap, así que los descarga todo el mundo.' : ''}`,
            fix: 'Importa el idioma que uses en vez de la raíz del paquete, y carga los demás cuando alguien cambie de idioma. En date-fns y dayjs es un import por idioma; en moment hay que excluir la carpeta en la configuración del bundler. Comprueba antes cuántos idiomas soporta la aplicación: si es uno, esto es todo ganancia.',
        }),
        dataAsCode: (d: { count: number; size: string; items: { name: string; size: string }[]; boot: boolean }) => ({
            chip: 'datos incluidos como código',
            title: `${d.size} de datos incrustados en el bundle (${d.count === 1 ? '1 fichero' : `${d.count} ficheros`} .json)`,
            body: `Un import de un fichero de datos no es una referencia: el contenido acaba dentro de un chunk de JavaScript, y se descarga y se parsea con él. ${d.items
                .map(i => `${mono(i.name)} (${i.size})`)
                .join(' · ')}.${d.boot ? ' Y está en el bootstrap.' : ''}`,
            fix: 'Los datos se piden con una petición en vez de importarse: sácalos a la carpeta de recursos y tráelos con un fetch. Así se cachean aparte, no retrasan el bootstrap, y cambiarlos no invalida el JavaScript. Si de verdad hacen falta antes de pintar, al menos que no se descarguen junto a todo lo demás.',
        }),
        unreachable: (d: { count: number; total: number; size: string; most: boolean; list: string }) => ({
            chip: d.most ? 'la mayor parte del build no entra en el informe' : 'trozos que el informe no alcanza',
            title: d.most
                ? `${d.count} de tus ${d.total} trozos (${d.size}) no salen en ningún número de aquí`
                : `${d.count} trozo${d.count > 1 ? 's' : ''} (${d.size}) que no alcanza nada desde la entrada`,
            body: `Nada de lo que se llega desde donde arranca la aplicación importa ${d.count > 1 ? 'estos ficheros' : 'este fichero'}, ni de forma estática ni diferida: ${d.list}. Puede ser <strong>el lado servidor</strong> de un build con render —una compilación escribe los dos lados en el mismo ${mono('stats.json')}, y sin la carpeta no hay forma de saber cuál es cuál—, un service worker —que no es parte de la primera carga—, un ${mono('import()')} cuya ruta se construye en tiempo de ejecución —VitePress escribe uno por página, y entonces esto es casi todo el sitio— o lo que dejó una compilación anterior en una carpeta que nadie limpia.`,
            fix: `Si tu aplicación tiene render en servidor, suelta también la carpeta del navegador —${mono('--dist')} en el comando— y los dos lados se separan solos: sin ella el informe puede estar describiendo el bundle del servidor, que suele ser el más grande de los dos. Si son service workers, no hay nada que hacer. Si el sitio genera una página por ruta, esos trozos se descargan al navegar y este informe solo describe lo que alcanza la entrada: léelo como lo que cuesta entrar, no como el tamaño del sitio. Y si no es ninguna, limpia la carpeta antes de compilar: los restos son peso muerto en el servidor y hacen que todas las cifras de aquí se queden cortas.`,
        }),
        prefetched: (d: { count: number; size: string; list: string }) => ({
            chip: 'pantallas que se piden antes de que nadie las abra',
            title: `La página se trae por adelantado ${d.count === 1 ? '1 chunk' : `${d.count} chunks`} (${d.size}) de una pantalla que nadie ha abierto`,
            body: `Un ${mono('&lt;link rel="prefetch"&gt;')} no es parte de la primera carga y este informe no lo cuenta como tal. Pero se descarga en esta visita igual: medido en un navegador, todos bajaron mientras se cargaba la primera página, con prioridad baja y por la misma conexión. Lo que cambia es cómo leer la tabla de arriba —una pantalla que el visitante ya tiene no cuesta lo que dice su fila, y una que no abre nunca se la ha pagado entera para nada—. ${d.list}.`,
            fix: `Casi nunca lo escribe nadie a mano. Nuxt hace prefetch de todas las rutas que encuentra y de cada enlace que entra en pantalla (${mono('experimental.defaults.nuxtLink.prefetch')}, o ${mono('prefetch={false}')} en el enlace); SvelteKit tiene ${mono('data-sveltekit-preload-data')}; Next.js lo hace con cada ${mono('&lt;Link&gt;')} visible. En un sitio de tres rutas es un buen trato. En uno de cuarenta significa que todo el mundo se descarga la aplicación entera para mirar la portada, y apagarlo —o dejarlo solo en los enlaces que de verdad son el paso siguiente— es una línea de configuración.`,
        }),
        noSourceMaps: (d: { unnamed: number }) => ({
            chip: d.unnamed > 0 ? 'pantallas sin nombre' : 'carpeta sin source maps',
            title:
                d.unnamed > 0
                    ? `Tus ${d.unnamed} pantallas salen con el nombre de su chunk, así que la tabla de arriba no se puede leer`
                    : 'Esta carpeta no trae ficheros .map, y eso recorta el informe',
            body: `${d.unnamed > 0 ? `Cada fila de la tabla de pantallas es un hash de contenido —${mono('chunk-Brh4_81T')} en vez de ${mono('orders')}— porque esta carpeta no trae ficheros ${mono('.map')}. Las cifras de al lado son correctas; qué pantalla es cada una, este informe no lo puede decir. ` : ''}Sin ellos se sabe lo que pesa cada chunk y no lo que hay dentro: las pantallas salen con el nombre de su fichero de chunk —${mono('0fPdmq0U.js')} en vez de ${mono('orders')}— y no hay desglose por paquete ni cadena desde la entrada. Los tamaños, las pantallas, los chunks compartidos y las idas y vueltas sí salen enteros.`,
            fix: `Compila con source maps —${mono('sourcemap: true')} en Vite, ${mono('"sourceMap": true')} en Angular— y vuelve a soltar la carpeta; no hace falta desplegarlos. Con Angular 17 o posterior, soltar además el ${mono('stats.json')} de ${mono('ng build --stats-json')} da lo mismo sin compilar dos veces.`,
        }),
        splitDrift: (d: {
            percent: number;
            off: number;
            high: boolean;
            chunks: number;
            file: string;
            measured: string;
        }) => ({
            chip: 'el desglose no cuadra con el fichero',
            title: `El desglose por fichero suma un ${d.percent} % de lo que pesan los chunks que describe`,
            body: `Hay dos medidas del mismo chunk y tendrían que dar lo mismo: lo que pesa el fichero (${d.file}) y lo que suman los pesos por fichero de dentro (${d.measured}), sobre ${d.chunks === 1 ? '1 chunk' : `${d.chunks} chunks`}. No lo dan, así que lo que el ${mono('stats.json')} dice que hay dentro de un chunk no es una descripción del fichero que se sirve. <strong>Por qué difieren no se sabe desde aquí</strong> —algo cambió la salida después de escribirlo— y no hace falta saberlo para leer la consecuencia. Las cifras de arriba —el arranque, cada pantalla, las idas y vueltas— salen del fichero y son exactas. Las que se miden <strong>dentro</strong> de un chunk —el reparto por paquete, la columna exclusiva, lo que ahorraría un ${mono('--what-if')}— salen de esta suma, así que van un ${d.off} % ${d.high ? 'altas' : 'bajas'}.`,
            fix: `Compila con source maps —${mono('"sourceMap": true')} en Angular, ${mono('sourcemap: true')} en Vite— y suelta la carpeta: cuando hay ${mono('.map')} el reparto se mide sobre el fichero generado y esta diferencia desaparece. No hace falta desplegarlos. Mientras tanto, léelas como una cota superior: el orden de la lista es correcto —todas están infladas igual— y la cifra absoluta no lo es.`,
        }),
        sourceMaps: (d: { count: number }) => ({
            chip: 'source maps en la carpeta',
            title: `La carpeta de build trae ${d.count === 1 ? '1 source map' : `${d.count} source maps`}`,
            body: 'Un source map reconstruye tu fuente a partir de lo compilado. No pesa en la descarga —el navegador solo lo pide si abres las herramientas—, pero si esta carpeta es la que subes, cualquiera que conozca la URL tiene tu código.',
            fix: `Con ${mono('"sourceMap": { "scripts": true, "hidden": true }')} se generan sin enlazarlos desde el bundle, que es lo que quieres para subirlos a tu herramienta de errores. Que el bundle deje de enlazarlos no impide que el servidor los siga sirviendo: si los .map acaban en el servidor, siguen ahí para quien conozca la URL.`,
        }),
        clean: (d: { unit: string }) => ({
            chip: 'sin señales',
            title: 'No sale ninguna señal clara en el reparto',
            body: `No hay chunks compartidos desproporcionados, ni paquetes pesados en el bootstrap con pocos consumidores, ni paquetes que viajen dos veces. Cifras ${d.unit}.`,
            fix: 'Guarda esta medición como línea base y vuelve a compararla en la próxima entrega. A partir de aquí lo que se vigila es que la cifra no crezca.',
        }),

        // --- what the same graph already knew (IDEAS §A) ---
        mixedImport: (d: { count: number; name: string; size: string; inBoot: boolean; list: string }) => ({
            chip: 'import estático y dinámico a la vez',
            title:
                d.count === 1
                    ? `${d.name} se importa de las dos formas: el import() no aplaza nada`
                    : `${d.count} módulos (${d.size}) se importan estática y dinámicamente a la vez`,
            body: `Alguien escribió un ${mono('import()')} creyendo que difería ese módulo, y otro fichero lo importa de forma estática, así que viaja igual con quien lo importa.${
                d.inBoot ? ' Y acaba en el bootstrap, o sea que lo descarga todo el mundo antes de ver nada.' : ''
            } Este es el fallo silencioso clásico del code splitting y no lo enseña ningún analizador, porque todos miran chunks y esto vive en las aristas del grafo. Cada módulo con quién lo importa de forma estática: ${d.list}.`,
            fix: `El ${mono('import()')} no sirve de nada mientras quede un import estático del mismo módulo. Busca ese import —muchas veces es un tipo, y entonces basta con ${mono('import type')}, que desaparece al compilar— o una constante suelta que se podría duplicar. Si el import estático hace falta de verdad, quita el dinámico: da la impresión de un ahorro que no existe.`,
        }),
        ownBarrel: (d: {
            count: number;
            name: string;
            pulls: number;
            size: string;
            importers: string;
            list: string;
        }) => ({
            chip: 'barrel file propio en el bootstrap',
            title:
                d.count === 1
                    ? `${d.name} mete ${d.pulls} ficheros (${d.size}) en el bootstrap`
                    : `${d.count} barrel files tuyos meten código en el bootstrap; el peor es ${d.name} con ${d.size}`,
            body: `Un ${mono('index.ts')} que reexporta una carpeta entera entra entero: quien importa una función se lleva todo lo que el barrel nombra, porque nada aguas abajo puede saber qué se quería. Lo importa ${d.importers || 'código del bootstrap'}. La cifra es el peso <strong>exclusivo</strong>: lo que no entra por ninguna otra vía. ${d.list}.`,
            fix: `Importa del fichero concreto (${mono("from '@app/shared/format-money'")}) en vez de la raíz de la carpeta. Es el arreglo más barato que hay en este informe y el que menos se hace, porque el barrel es cómodo de escribir. Si el barrel es la API pública de una librería interna, déjalo para fuera y que el código de dentro importe directo.`,
        }),
        packageBarrel: (d: {
            count: number;
            name: string;
            files: number;
            entryPoints: number;
            size: string;
            importers: string;
            list: string;
        }) => ({
            chip: 'paquete que entra entero',
            title: `${d.name} mete ${d.files} ficheros (${d.size}) y solo ${d.entryPoints === 1 ? 'uno se importa' : `${d.entryPoints} se importan`} desde fuera`,
            body: `El metafile dice qué fichero de un paquete importa algo de fuera: ${mono('lodash/debounce')} y ${mono('lodash')} se distinguen sin adivinar nada. Aquí entran ${d.files} ficheros por ${d.entryPoints === 1 ? 'una sola puerta' : `${d.entryPoints} puertas`}. Lo importa ${d.importers || 'otra dependencia'}. Lo que <strong>no</strong> se puede decir desde aquí es cuánto de lo que entró se usa: eso necesitaría la tabla de símbolos, y esta herramienta no inventa cifras. ${d.list}.`,
            fix: `Importa el submódulo en vez de la raíz (${mono("from 'lodash/debounce'")}, ${mono("from 'date-fns/format'")}) y vuelve a medir: la diferencia entre las dos mediciones es la única cifra honesta del ahorro. Si el paquete no publica submódulos, mira si tiene una versión en módulos ES o una alternativa que la tenga.`,
        }),
        cycles: (d: {
            files: number;
            folders: number;
            worst: string;
            inBoot: boolean;
            folderList: string;
            fileList: string;
        }) => ({
            chip: 'ciclos de importación',
            title:
                d.folders > 0
                    ? `${d.folders} ciclo${d.folders > 1 ? 's' : ''} entre carpetas tuyas: ${d.worst}`
                    : `${d.files} ciclo${d.files > 1 ? 's' : ''} de importación entre ficheros tuyos`,
            body: `Un ciclo alarga las cadenas de importación —o sea, las idas y vueltas que este informe ya cuenta— y bloquea el tree-shaking, porque el bundler no puede demostrar qué mitad del bucle hace falta primero.${
                d.inBoot ? ' Alguno está en el bootstrap.' : ''
            } Es de las pocas cosas de arquitectura que se pueden <strong>medir</strong> en vez de opinar, y sale del mismo grafo que los bytes.${
                d.folderList ? ` Entre carpetas: ${d.folderList}.` : ''
            }${d.fileList ? ` Entre ficheros: ${d.fileList}.` : ''}`,
            fix: `Se rompe por el import más raro del bucle, que casi siempre es uno solo: una capa de abajo que importa un tipo o una constante de una de arriba. Si es un tipo, ${mono('import type')} lo corta sin mover nada. Si no, el sitio de esa constante compartida es un tercer fichero que no es de ninguno de los dos. La versión por carpetas es la que conviene convertir en regla de lint, porque sobrevive a los renombrados.`,
        }),
        paidTwice: (d: { count: number; size: string; list: string }) => ({
            chip: 'bytes pagados dos veces',
            title: `${d.size} del bundle son el mismo módulo copiado en varios chunks`,
            body: `Distinto de un paquete que viaja en dos versiones, que ya sale aparte: aquí las dos copias son el mismo código byte a byte, y el reparto las metió en dos sitios porque dos conjuntos de pantallas lo alcanzan y ninguno contiene al otro. ${d.count === 1 ? 'Un módulo' : `${d.count} módulos`}: ${d.list}.`,
            fix: `Si las dos copias caen en chunks que se descargan juntos, no hay nada que ganar. Cuando no, se junta el módulo en un chunk compartido que importen los dos: con ${mono('manualChunks')} en Rollup y Vite, o en general importándolo desde un sitio común en vez de desde los dos. Comprueba antes cuánto es comprimido: un módulo repetitivo copiado dos veces comprime mucho mejor de lo que sugiere esta cifra.`,
        }),
        twinScreens: (d: { count: number; a: string; b: string; pct: number; apart: string; list: string }) => ({
            chip: 'pantallas gemelas',
            title: `${d.a} y ${d.b} comparten el ${d.pct} % de lo que cargan`,
            body: `Solo ${d.apart} separan a las dos. O les falta un chunk compartido —el mismo código copiado en las dos— o son la misma pantalla escrita dos veces. ${d.count === 1 ? '' : `Hay ${d.count} parejas así: ${d.list}.`}`,
            fix: 'Mira primero si de verdad son dos pantallas. Si lo son y su código es casi el mismo, lo normal es que una sea una variante de la otra y quepan en una ruta con un parámetro. Si son distintas y lo que comparten es infraestructura, el bundler debería estar sacando un chunk común: mira si un barrel file lo está impidiendo.',
        }),
        theirs: (d: { pct: number; theirs: string; yours: string; list: string }) => ({
            chip: 'de quién es la primera carga',
            title: `El ${d.pct} % de tu arranque no lo escribiste tú`,
            body: `${d.theirs} de paquetes contra ${d.yours} de código tuyo. No es un fallo: un framework también es código de otros. Lo que cambia es dónde mirar, porque «optimizar mi código» y «revisar mis dependencias» son dos semanas distintas y los kilobytes suelen estar en la segunda. ${d.list}.`,
            fix: 'Antes de tocar nada tuyo, recorre esa lista con la columna de peso exclusivo delante: es la única que dice cuánto baja de verdad quitando cada uno. Un paquete cuyo peso exclusivo es una fracción de su peso total comparte casi todo con otro, y quitarlo no ahorra lo que parece.',
        }),

        // --- what the folder holds and nobody read (IDEAS §C) ---
        fonts: (d: {
            families: number;
            files: number;
            size: string;
            superseded: string;
            preloaded: string;
            list: string;
        }) => ({
            chip: 'tipografías',
            title:
                d.superseded === ''
                    ? `${d.size} de tipografías: ${d.files} ficheros en ${d.families} ${d.families === 1 ? 'familia' : 'familias'}`
                    : `${d.size} de tipografías, y algunas viajan dos veces en dos formatos`,
            body: `Ningún analizador de bundle enseña esto porque todos paran en el JavaScript, y siete pesos de una familia para usar dos es un hallazgo de trescientos kilobytes. ${d.list}.${
                d.superseded ? ` En un formato que otro de la misma carpeta ya sustituye: ${d.superseded}.` : ''
            }${d.preloaded ? ` La página precarga ${d.preloaded}, así que esos entran en la primera carga.` : ''}`,
            fix: `Cuenta los pesos que la interfaz usa de verdad —normalmente son dos, regular y bold— y borra el resto de la configuración de fuentes. Si hay un ${mono('.woff2')} al lado de un ${mono('.ttf')} de la misma cara, el segundo solo lo necesita un navegador que ya no usa nadie: quítalo de la lista de formatos. Y precarga solo lo que hace falta antes de pintar: un ${mono('preload')} por peso convierte la lista entera en primera carga.`,
        }),
        media: (d: {
            count: number;
            size: string;
            inPage: number;
            outdated: number;
            outdatedList: string;
            list: string;
        }) => ({
            chip: 'imágenes y vídeo',
            title: `${d.size} en ${d.count} ${d.count === 1 ? 'fichero' : 'ficheros'} de imagen o vídeo${d.inPage > 0 ? `, ${d.inPage} de ellos pedidos por la página` : ''}`,
            body: `Aquí no se recomprime nada: prometer «esto en AVIF pesaría 310 kB» sería inventarse una cifra. Se dice lo que pesa, en qué formato llega y si el ${mono('index.html')} lo pide de entrada.${
                d.outdated > 0
                    ? ` ${d.outdated === 1 ? 'Un fichero llega' : `${d.outdated} ficheros llegan`} en un formato antiguo teniendo el moderno al lado en la misma carpeta: ${d.outdatedList}.`
                    : ''
            } ${d.list}.`,
            fix: `Lo que sí se puede afirmar es lo de los formatos duplicados: si el moderno ya está en la carpeta, el antiguo solo lo pide un navegador que casi nadie usa, y se sirve con un ${mono('<picture>')} o dejando que el servidor negocie. Para el resto, mide antes de convertir: una captura de pantalla y una foto no ganan lo mismo, y una imagen que la página pide de entrada pesa más en el tiempo hasta pintar que en el total.`,
        }),
        duplicateAssets: (d: { count: number; size: string; list: string }) => ({
            chip: 'el mismo fichero con dos nombres',
            title: `${d.size} en ${d.count === 1 ? 'un fichero que viaja' : `${d.count} ficheros que viajan`} dos veces con nombres distintos`,
            body: `El contenido es idéntico byte a byte —se ha comparado, no se ha supuesto por el tamaño— y aun así son entradas de caché separadas, así que quien visita la página los descarga los dos. ${d.list}.`,
            fix: 'Casi siempre es el mismo recurso importado desde dos sitios con rutas distintas, o una copia que quedó de una migración. Unifica el import y borra la copia. Si los dos nombres los genera el build, mira si un plugin está copiando la carpeta de recursos además de procesarla.',
        }),
        unreferencedAssets: (d: { count: number; size: string; list: string }) => ({
            chip: 'ficheros que no alcanza nadie',
            title: `${d.size} en ${d.count === 1 ? '1 fichero que no nombra' : `${d.count} ficheros que no nombra`} ni el HTML, ni el CSS, ni ningún chunk`,
            body: `Es la misma idea que la señal de trozos inalcanzables, un nivel más afuera: se ha buscado cada nombre de fichero en el texto de los demás y estos no salen en ninguno. En una carpeta que nadie limpia suele haber megabytes de despliegues anteriores. ${d.list}.`,
            fix: `Antes de borrar nada, ten en cuenta lo que esta búsqueda no ve: una ruta construida en tiempo de ejecución (${mono('/assets/ + name + .png')}), un fichero que pide el service worker o algo que referencia el servidor y no el bundle. Lo que quede después de descartar eso son restos: limpia la carpeta antes de compilar, porque ocupan sitio en el servidor y ensucian cualquier medida de la carpeta.`,
        }),
        inlinedData: (d: { count: number; size: string; types: string; list: string }) => ({
            chip: 'ficheros incrustados como data URI',
            title: `${d.size} del bundle son en realidad ${d.count === 1 ? 'un fichero incrustado' : `${d.count} ficheros incrustados`} como data URI`,
            body: `El compilador mete en línea lo que baja de cierto umbral, y cuarenta iconos pequeños suman. Esos bytes no se cachean aparte, no se pueden diferir y no aparecen en ninguna lista de recursos: están escondidos dentro de la cifra que más importa. Tipos encontrados: ${d.types}. ${d.list}.`,
            fix: `Baja el umbral de inline del bundler (${mono('build.assetsInlineLimit')} en Vite, ${mono('assetsInlineLimit')} en Angular) para que esos ficheros salgan aparte y se cacheen solos. Con iconos, lo que suele compensar es un sprite SVG o una fuente de iconos en vez de cuarenta data URI. Y ten en cuenta que base64 añade un tercio al tamaño del fichero original.`,
        }),

        // --- what the update costs, not the primera visita (IDEAS §D) ---
        updateWeight: (d: {
            size: string;
            fresh: string;
            pct: number;
            reused: number;
            count: number;
            list: string;
            removed: string;
            roots: number;
            rootSize: string;
            carried: number;
            carriedSize: string;
            rootList: string;
            /** What the five questions said about how often this gets paid. */
            exposure: 'high' | 'moderate' | 'low' | 'unknown';
            /** Invalidations per person per week. `null` while the two answers behind it are missing. */
            perWeek: number | null;
        }) => ({
            chip: 'peso de la actualización',
            title: `Quien ya tenía la versión anterior descarga ${d.size} (el ${d.pct} % del build)`,
            body: `Esta es la mitad del coste real que no mira nadie: casi todas las visitas a una aplicación en marcha son de alguien que ya tenía la versión de ayer, y lo que descarga no es el bundle, es lo que ha cambiado de nombre. Una visita nueva descarga ${d.fresh}. ${d.reused} ficheros conservan su nombre y no se piden otra vez. Cambian o entran ${d.count}: ${d.list}.${d.removed ? ` Y desaparecen ${d.removed}.` : ''}${
                d.carried > 0 && d.roots > 0
                    ? ` <strong>De los que cambian, ${d.roots === 1 ? 'solo 1 no nombra' : `solo ${d.roots} no nombran`} a ningún otro que también cambiara (${d.rootSize}): ${d.rootList}.</strong> Ahí cayó la edición. ${d.carried === 1 ? 'El otro lleva' : `Los otros ${d.carried} llevan`} dentro el nombre con hash de alguno de esos, así que ${d.carried === 1 ? 'su hash se movió' : 'sus hashes se movieron'} sin que su contenido tuviera por qué: ${d.carriedSize} de cascada. Sin ella este despliegue habría costado ${d.rootSize}.`
                    : d.carried > 0
                      ? ` <strong>En cuál de ellos cayó la edición no se puede decir desde aquí.</strong> Todos los ficheros que cambiaron llevan dentro el nombre con hash de otro que también cambió, así que el grafo de nombres entre ellos se cierra sobre sí mismo y no queda ninguno cuyo hash solo se pueda haber movido por su propio contenido. Eso no es un hueco en la lectura, es la forma: es lo que se ve cuando hay un eje del que los chunks diferidos vuelven a importar, que es el reparto por defecto de Vite y de Rollup y lo que mide la señal de cascada de más abajo. Así que los ${d.carriedSize} son el coste de un despliegue y el reparto entre la edición y su consecuencia no está disponible —que no es lo mismo que decir que la edición no pesa nada—.`
                      : ''
            }`,
            fix: `El nombre con hash es lo que decide: si un fichero conserva el suyo, el navegador no lo pide. Cuando el porcentaje es alto, casi siempre es porque un chunk mezcla ${mono('node_modules')} con código tuyo —las dependencias no cambian en meses, tu código cambia a diario, y el fichero que junta las dos cosas se invalida entero cada día—. La señal de al lado dice cuáles son. Si tu build no pone hash en los nombres, esta cifra es el build entero y el arreglo es anterior a todo lo demás.${d.carried > 0 ? ' La parte de cascada es otra cosa y no se arregla igual: el bundler escribe el nombre con hash de cada chunk dentro del que lo importa, así que no es un fallo tuyo, es cómo se emiten los especificadores. Se ataca sacando los especificadores del JavaScript (import maps) o rompiendo el chunk que hace de eje, y eso último se paga con una primera carga mayor. Las dos cifras están arriba justo para que decidas tú, porque tiran en direcciones opuestas.' : ''} ${
                d.exposure === 'unknown'
                    ? `<strong>Esta señal se queda en informativa a propósito.</strong> Si el ${d.pct} % es caro o da igual lo deciden dos hechos que ni el build ni la carpeta pueden decir: cada cuánto despliegas, y qué proporción de quien abre la aplicación mañana ya la tenía abierta hoy. Con despliegue diario y gente que vuelve cada mañana, esta es la línea más cara del informe; con una release trimestral y visitantes nuevos, no importa. Las dos están en la pestaña de situación de la página, y en el bloque ${mono('situation')} de ${mono('loadline.json')} para el comando. Contestarlas es lo que le pone color a este número.`
                    : d.exposure === 'high'
                      ? `<strong>Y ahora hay con qué ponerle precio.</strong> Con lo que se ha contestado sobre la situación, cada persona paga esto ${d.perWeek === null ? 'varias veces por semana' : `${formatCount(d.perWeek)} veces por semana`}: el ${d.pct} % del build, con esa frecuencia, por cabeza. Eso es lo que convierte esta línea en una de las caras del informe, y por eso ha dejado de ser informativa.`
                      : d.exposure === 'moderate'
                        ? `Con lo que se ha contestado sobre la situación, cada persona paga esto ${d.perWeek === null ? 'de vez en cuando' : `${formatCount(d.perWeek)} veces por semana`}. Ni es la línea más cara del informe ni es gratis, así que la señal se queda informativa — ahora por una razón que se puede leer, y no por falta de datos.`
                        : `Con lo que se ha contestado sobre la situación, cada persona paga esto ${d.perWeek === null ? 'muy de tarde en tarde' : `${formatCount(d.perWeek)} veces por semana`}: a esa frecuencia el ${d.pct} % es un número cierto y poco importante, porque casi todo el que abre la aplicación se la descarga entera de todas formas. El coste sigue calculado y sigue aquí; no es donde está tu problema.`
            } Y hay una premisa más que este número da por buena: caché caliente e ${mono('immutable')}. Eso solo se comprueba midiendo, en la pestaña de medición; hasta entonces léelo como no verificado.`,
        }),
        unstableChunk: (d: {
            count: number;
            name: string;
            pct: number;
            size: string;
            inBoot: boolean;
            list: string;
        }) => ({
            chip: 'chunk que mezcla lo que cambia con lo que no',
            title:
                d.count === 1
                    ? `${d.name} es ${d.pct} % código de terceros y se invalida con cada cambio tuyo`
                    : `${d.count} chunks mezclan dependencias y código tuyo: ${d.size} se reinvalidan en cada despliegue`,
            body: `Las dependencias no cambian en meses y tu código cambia a diario. Un chunk que junta las dos cosas cambia de hash cada vez que tocas una línea, y todo lo que lleva dentro de terceros se vuelve a descargar para nada.${
                d.inBoot ? ' Y está en el bootstrap, así que lo paga toda visita de vuelta.' : ''
            } ${d.list}.`,
            fix: `Sepáralos: en Rollup y Vite con una regla de ${mono('manualChunks')} que mande todo lo de ${mono('node_modules')} a su propio chunk; Angular ya lo hace por defecto y si aquí sale algo, mira si un import estático está arrastrando una dependencia a un chunk tuyo. Ojo con el extremo contrario: un único chunk de vendor gigantesco se invalida entero cuando actualizas una sola librería, así que lo que se busca es separar por frecuencia de cambio, no por origen.`,
        }),
        unhashable: (d: { count: number; inPage: number; size: string; query: string; list: string }) => ({
            chip: 'nombres que no se pueden cachear',
            title:
                d.query === ''
                    ? `${d.count} ${d.count === 1 ? 'fichero no lleva' : 'ficheros no llevan'} hash en el nombre`
                    : `Hay ficheros con la versión en la query (${d.query}): se revalidan en cada visita`,
            body: `Un fichero sin hash en el nombre no se puede cachear para siempre: el navegador tiene que preguntar si ha cambiado en cada visita, y esa pregunta cuesta una ida y vuelta aunque la respuesta sea que no. ${d.inPage > 0 ? `${d.inPage} de ellos los pide la página de entrada (${d.size}).` : 'Ninguno lo pide la página de entrada.'} ${d.list}.`,
            fix: `Casi siempre es informativo: un ${mono('favicon.ico')} o un ${mono('manifest.webmanifest')} no llevan hash y no hace falta que lo lleven. Cuando salta por algo grande que pide la página, ponle hash en el nombre desde la configuración del build. La versión en la query (${mono('?v=3')}) es el caso que casi siempre es un error: cambia la URL de todos los ficheros a la vez en cada despliegue, que es justo lo contrario de lo que hace un hash por fichero.`,
        }),

        // --- lo que dice leer el texto del build (IDEAS §F) ---
        secrets: (d: { count: number; serious: number; kinds: string; list: string }) => ({
            chip: 'secretos o direcciones internas en el bundle',
            title:
                d.serious > 0
                    ? `${d.serious === 1 ? 'Una credencial con forma de credencial viaja' : `${d.serious} credenciales con forma de credencial viajan`} en el bundle`
                    : `${d.count} ${d.count === 1 ? 'coincidencia' : 'coincidencias'} de secreto o dirección interna en el bundle`,
            body: `Cada patrón de aquí identifica un formato concreto por su prefijo y su longitud —${mono('AKIA')} y dieciséis caracteres es una clave de AWS y no otra cosa—, a propósito: no hay ninguna regla del tipo «cadena larga cerca de la palabra key», que es la que encuentra las de verdad y también cien nombres de variable minificados. Tipos: ${d.kinds}. Nada se imprime entero: este informe se pega en incidencias, y una herramienta que imprime una clave viva la ha publicado por segunda vez. ${d.list}.`,
            fix: `Si alguna es real, lo primero es <strong>rotarla</strong>, no borrarla del código: lo que está desplegado ya lo tiene cualquiera que sepa la URL, y quitarla del siguiente build no revoca nada. Después, mira cómo entró: casi siempre es un ${mono('.env')} que el bundler incrusta porque la variable no empieza por el prefijo público del framework, o una constante de configuración con la clave de servidor en vez de la de cliente. Una dirección interna no es una credencial pero sí es topología: dice qué hay dentro y cómo se llama.`,
        }),
        devLeftovers: (d: { count: number; broken: boolean; unattributed: boolean; list: string }) => ({
            chip: d.unattributed ? 'marcas de desarrollo en la compilación' : 'restos de desarrollo en producción',
            title: d.broken
                ? 'Esta compilación es de desarrollo, así que el resto del informe no describe lo que se despliega'
                : d.unattributed
                  ? `${d.count === 1 ? 'Queda una marca' : `Quedan ${d.count} marcas`} de desarrollo en la compilación, sin saber de quién`
                  : `${d.count === 1 ? 'Queda un resto' : `Quedan ${d.count} restos`} de desarrollo en la compilación`,
            body: `${
                d.broken
                    ? 'La compilación de desarrollo de una librería no está minificada, lleva los avisos dentro y pesa varias veces lo que la de producción. Antes de mirar ninguna cifra de aquí: esta no es la carpeta que se despliega, o el pipeline está compilando con la configuración equivocada.'
                    : d.unattributed
                      ? `Estos chunks no llevan mapa de fuentes al lado, así que la posición de cada coincidencia no se puede devolver al fichero donde se escribió — y un ${mono('console.log')} tuyo es idéntico al que hay dentro de ${mono('@angular/core')}, que publica un servicio de consola y mete uno en todas las compilaciones de Angular que existen. Las coincidencias son reales; de quién son, aquí no se sabe.`
                      : 'Ninguno de estos rompe nada por sí solo, pero todos son cosas que nadie quiso desplegar. Cada uno se ha seguido por los mapas de fuentes hasta un fichero tuyo, así que ninguno es de tu framework.'
            } ${d.list}.`,
            fix: d.broken
                ? 'El arreglo es anterior a todo lo demás: compila con la configuración de producción y vuelve a medir, porque ninguna cifra de este informe describe lo que descargan tus usuarios.'
                : d.unattributed
                  ? 'Con esto solo, no hay nada que hacer. Para saber si alguna es tuya, compila una vez con los mapas de fuentes activados: el mismo informe cuenta entonces solo las coincidencias que salen de ficheros tuyos. Donde resulten serlo, la opción de <em>drop</em> del minificador las quita.'
                  : `Con ficheros de prueba dentro, mira los globs del build: casi siempre es un ${mono('include')} demasiado ancho. Y los ${mono('console.log')} son ruido barato de quitar con la opción de <em>drop</em> del minificador.`,
        }),
        sourceExposed: (d: { files: number; maps: number; env: number; list: string }) => ({
            chip: 'tu código fuente está publicado',
            title: `${d.files} ficheros de tu código fuente se reconstruyen desde los ${d.maps} source maps de esta carpeta`,
            body: `El informe ya avisaba de que los ${mono('.map')} están aquí, y esa frase se ignora porque suena a detalle de configuración. Esto es lo mismo dicho de forma que no se pueda ignorar: los mapas llevan el texto original dentro, así que cualquiera que conozca la URL tiene tus ficheros, tus rutas internas y tus comentarios.${d.env > 0 ? ` Dentro hay ${d.env} referencias a variables de entorno.` : ''} Rutas: ${d.list}.`,
            fix: `Si esta es la carpeta que subes, o no despliegas los mapas o los generas con ${mono('"sourceMap": { "scripts": true, "hidden": true }')} y los subes solo a tu herramienta de errores. Ten en cuenta que dejar de enlazarlos desde el bundle no impide que el servidor los siga sirviendo: si los ficheros acaban en el servidor, siguen ahí. Y si esta es una carpeta local, aquí no hay nada que arreglar; el informe no puede distinguir las dos cosas, así que lo dice en vez de acusar.`,
        }),
        thirdParty: (d: { count: number; size: string; total: string; list: string }) => ({
            chip: 'servicios de terceros',
            title: `${d.size} de tu arranque son analítica, publicidad, soporte o captura de errores`,
            body: `${d.count} paquetes que no son ni tuyos ni de tu framework, ${d.total} en total contando lo que está fuera del arranque. La lista sale de un catálogo de nombres incrustado en la herramienta —unas sesenta líneas— y no de preguntarle a nadie: consultar el registro de npm sería sacar a la red la lista de dependencias de una aplicación privada. Por eso es incompleto a propósito y se actualiza en un commit. ${d.list}.`,
            fix: `Esta es la lista que se lleva a la reunión donde se decide si el grabador de sesiones sigue. Lo que conviene mirar de cada uno es si hace falta antes de pintar: casi ninguno lo hace, y casi todos ofrecen una forma de cargarse tarde —un script con ${mono('async')}, un import diferido detrás de la aceptación de cookies—. Mover uno del arranque a después del primer pintado no cambia lo que hace y sí lo que cuesta.`,
        }),
        licences: (d: { count: number; worst: string; list: string; permissive: string }) => ({
            chip: 'licencias con condiciones',
            title: `${d.count === 1 ? 'Una licencia con condiciones viaja' : `${d.count} licencias con condiciones viajan`} en la compilación, la más estricta ${d.worst}`,
            body: `Sale de los comentarios legales que el propio bundle lleva dentro: los minificadores los conservan a propósito, así que esto no necesita ni ${mono('node_modules')} ni red. ${d.list}.${d.permissive ? ` Además hay permisivas: ${d.permissive}.` : ''} <strong>La cobertura es parcial</strong>, y conviene decirlo así: un paquete cuya licencia no viene en un comentario no sale aquí, y eso no significa que no esté.`,
            fix: `Es una pregunta que en empresa se hace y que hoy se contesta a mano. Para la lista completa hace falta leer los ${mono('package.json')} de ${mono('node_modules')}, que es lo que hace ${mono('license-checker')}; esto da la parte que viaja de verdad en el bundle, que suele ser la mitad que importa. Copyleft fuerte en una aplicación web que se distribuye tiene condiciones reales: consúltalo antes de que llegue a producción, no después.`,
        }),

        // --- lo que dicen el lock file y el audit, cruzados con lo que viaja (IDEAS §37) ---
        vulnerable: (d: {
            shipped: number;
            total: number;
            inBoot: number;
            worst: string;
            list: string;
            elsewhere: string;
        }) => ({
            chip: 'vulnerabilidades que sí viajan',
            title:
                d.inBoot > 0
                    ? `${d.inBoot} de tus ${d.total} vulnerabilidades están en el arranque y las descarga todo el mundo`
                    : `${d.shipped} de tus ${d.total} vulnerabilidades viajan de verdad en el bundle`,
            body: `«Tienes ${d.total} vulnerabilidades» es ruido; esto es la parte accionable. Ni el audit ni este informe pueden decirlo solos: uno sabe cuáles hay y nada de qué descarga un navegador, el otro al revés. ${d.list}.${
                d.elsewhere
                    ? ` Las que no viajan en el bundle —reales, pero no lo que descarga nadie— son ${d.elsewhere}.`
                    : ''
            } Nada de esto ha salido a la red: los dos ficheros los has soltado tú.`,
            fix: 'Empieza por las del arranque, que es donde el coste es de todos. Ten en cuenta lo que aquí <strong>no</strong> se comprueba: una vulnerabilidad se atribuye a un paquete por su nombre, no por su rango de versiones, porque hacerlo bien necesita una implementación de semver y acertar «más o menos» sobre si alguien es vulnerable es peor que decir qué se sabe y qué no. Comprueba la versión que tienes contra el rango del aviso antes de actuar.',
        }),
        transitive: (d: { count: number; size: string; worst: string; worstSize: string; list: string }) => ({
            chip: 'paquetes que no pides tú',
            title: `${d.size} del bundle son paquetes que no están en tu package.json; el mayor es ${d.worst} con ${d.worstSize}`,
            body: `El lock file convierte «quién mete esto» de una suposición en una respuesta: cada uno sale con la cadena de dependencias que lo trae. Que un paquete sea transitivo no es un problema —así funciona npm—, pero sí cambia el arreglo: alinear tu ${mono('package.json')} no mueve nada, y lo que hace falta es una resolución forzada o quitar la dependencia que lo pide. ${d.list}.`,
            fix: `Si alguno pesa lo bastante como para importar, mira la cadena: casi siempre hay un paquete intermedio con una alternativa más ligera, o una versión más nueva que ya no lo arrastra. Cuando el que lo mete es una dependencia que no vas a cambiar, la salida es ${mono('pnpm.overrides')}, ${mono('overrides')} (npm) o ${mono('resolutions')} (yarn) — y comprobar después que la aplicación sigue funcionando, porque forzar una resolución es exactamente saltarse lo que esa dependencia pedía.`,
        }),

        // --- against a baseline ---
        bootGrew: (d: { diff: string; pct: number; before: string; after: string; baseline: string }) => ({
            chip: 'el bootstrap ha crecido',
            title: `El bootstrap ha crecido ${d.diff} (${d.pct} %) desde la línea base`,
            body: `Antes ${mono(d.before)}, ahora ${mono(d.after)}. Lo paga toda carga de la aplicación, entre a donde entre. Línea base: ${mono(d.baseline)}.`,
            fix: 'Mira en la pestaña de bootstrap qué paquetes son nuevos o han crecido. Si el crecimiento viene de una funcionalidad nueva que solo usa una pantalla, muévela a los proveedores de esa ruta.',
        }),
        bootNewPackages: (d: { count: number; list: string; baseline: string }) => ({
            chip: 'paquete nuevo en el bootstrap',
            title:
                d.count === 1
                    ? 'Un paquete ha entrado en el bootstrap desde la última medición'
                    : `${d.count} paquetes han entrado en el bootstrap desde la última medición`,
            body: `No estaban en el bootstrap de ${mono(d.baseline)} y ahora sí: ${d.list}. Cada uno lo descarga todo el mundo antes de ver nada.`,
            fix: 'Comprueba quién los importa (columna «quién lo importa» del bootstrap). Si el consumidor es una pantalla lazy, el registro va en los proveedores de esa ruta, no en la configuración de bootstrap.',
        }),
        screensGrew: (d: { count: number; top: string; diff: string; pct: number; list: string }) => ({
            chip: 'pantalla que ha crecido',
            title:
                d.count === 1
                    ? `${d.top} ha crecido ${d.diff} (${d.pct} %) en lo que carga aparte del bootstrap`
                    : `${d.count} pantallas han crecido en lo que cargan aparte del bootstrap; la que más, ${d.top} (${d.diff}, ${d.pct} %)`,
            body: `Se compara compartido + propio, sin el bootstrap, para que un bootstrap más grande no marque todas las pantallas a la vez. ${d.list}`,
            fix: 'Abre la pantalla en su pestaña y mira qué chunk ha crecido: si es uno compartido, el crecimiento es de todas las pantallas que lo cargan y conviene tratarlo ahí.',
        }),

        signalsChanged: (d: {
            fixed: number;
            added: number;
            fixedList: string;
            addedList: string;
            baseline: string;
        }) => ({
            chip: 'señales nuevas y resueltas',
            title:
                d.added === 0
                    ? `Se han resuelto ${d.fixed} señales desde ${d.baseline} y no ha entrado ninguna`
                    : `${d.fixed === 0 ? 'No se ha resuelto ninguna señal' : `Se han resuelto ${d.fixed}`} y ${d.added === 1 ? 'ha entrado 1' : `han entrado ${d.added}`} desde ${d.baseline}`,
            body: `Los bytes dicen si el bundle ha crecido; esto dice si el trabajo se ha notado.${
                d.fixedList ? ` Ya no salen: ${d.fixedList}.` : ''
            }${d.addedList ? ` Han entrado: ${d.addedList}.` : ''}`,
            fix: 'Si ha entrado una señal en este cambio, es más barato mirarla ahora que dentro de tres semanas, cuando nadie recuerde qué la metió. Y si has resuelto alguna, guarda esta medición como línea base para que la siguiente comparación parta de aquí.',
        }),
        sharedGrew: (d: { count: number; total: number; diff: string }) => ({
            chip: 'chunk compartido que ha crecido',
            title: `${d.count} de tus ${d.total} pantallas han crecido casi lo mismo (~${d.diff}): lo que ha crecido es un chunk compartido`,
            body: 'Cuando casi todas las pantallas suben la misma cantidad, el crecimiento no está en las pantallas sino en un chunk que cargan todas. Se descarga en la práctica siempre, aunque el bundler lo clasifique como lazy.',
            fix: 'Ve a la pestaña de compartidos y abre los chunks casi globales: el paquete o fichero nuevo estará dentro de uno de ellos. Si lo usa una sola pantalla, sácalo de ahí.',
        }),

        // --- project context ---
        budgetNotBuilt: (d: {
            config: string;
            figure: string;
            built: { name: string; error: string | null; warning: string | null }[];
        }) => ({
            chip: 'budget que el pipeline no aplica',
            title: `El budget más estricto está en ${d.config} (${d.figure}), que el pipeline no compila`,
            body: `Angular solo comprueba los <span class="mono">budgets</span> de la configuración con la que compila. El pipeline compila ${d.built
                .map(item => {
                    if (item.error) {
                        return `${mono(item.name)} (error a ${item.error})`;
                    }
                    return item.warning
                        ? `${mono(item.name)} (solo aviso a ${item.warning})`
                        : `${mono(item.name)} (sin budget)`;
                })
                .join(', ')}. El budget de ${mono(d.config)} no salta nunca, aunque parezca que existe.`,
            fix: 'Mueve el budget a las <span class="mono">options</span> del build de <span class="mono">angular.json</span>, que aplican a todas las configuraciones, o cópialo a la configuración que compila el pipeline.',
        }),
        budgetNone: (d: { configs: string }) => ({
            chip: 'sin budget de tamaño',
            title: 'Ninguna configuración declara un budget de tamaño para el bootstrap',
            body: `<span class="mono">angular.json</span> no tiene ningún <span class="mono">budget</span> de tipo <span class="mono">initial</span> con cifra (${d.configs}). Nada avisa cuando el bootstrap crece.`,
            fix: 'Declara uno en las <span class="mono">options</span> del build con un aviso algo por encima del bootstrap actual y un error que no quieras cruzar. Lo que importa es que exista un budget, más que la cifra exacta.',
        }),
        budgetTooHigh: (d: { configs: string; count: number; error: string; boot: string; factor: number }) => ({
            chip: 'budget demasiado alto',
            title: `${d.count === 1 ? 'El budget' : 'Los budgets'} de ${d.configs} ${d.count === 1 ? 'está' : 'están'} en ${d.error} y el bootstrap pesa ${d.boot}: no puede saltar`,
            body: `Es más de ${d.factor} veces el bootstrap actual (solo JavaScript, en crudo, que es lo que mide Angular). Un budget así no vigila nada: para llegar a él la aplicación tendría que multiplicar su tamaño.`,
            fix: 'Baja el error a algo que no quieras cruzar (por ejemplo, un 25 % por encima del bootstrap actual) y el aviso algo por debajo. Súbelo solo cuando alguien decida a sabiendas que el bootstrap tiene que crecer.',
        }),
        budgetWarnOnly: (d: { configs: string; count: number; warning: string }) => ({
            chip: 'budget que solo avisa',
            title: `${d.count === 1 ? 'El budget' : 'Los budgets'} de ${d.configs} solo ${d.count === 1 ? 'avisa' : 'avisan'} (${d.warning}): el build nunca falla por tamaño`,
            body: `${d.count === 1 ? 'Tiene' : 'Tienen'} <span class="mono">maximumWarning</span> pero no <span class="mono">maximumError</span>. Un aviso no detiene el build: solo aparece en la salida, entre el resto de líneas.`,
            fix: 'Añade un <span class="mono">maximumError</span>. Es el único que detiene el pipeline y obliga a decidir.',
        }),
        zoneless: () => ({
            chip: 'sin zone.js',
            title: 'La aplicación no usa zone.js',
            body: 'La detección de cambios va por señales, no por ciclos disparados desde zone.js. Eso reduce el peso del bootstrap y el trabajo en ejecución.',
            fix: 'Ten en cuenta que el material sobre «ciclos de detección de cambios», <span class="mono">NgZone</span> y <span class="mono">runOutsideAngular</span> no aplica a este proyecto: no hay nada que cambiar en ese punto.',
        }),

        cascadeShape: (d: {
            risk: 'low' | 'mid' | 'high';
            hub: string;
            names: number;
            named: number;
            size: string;
            chunks: number;
            /** How often the shape above actually gets paid for, as the five questions said. */
            exposure: 'high' | 'moderate' | 'low' | 'unknown';
            perWeek: number | null;
        }) => ({
            chip:
                d.risk === 'high'
                    ? 'cascada de hashes: riesgo alto'
                    : d.risk === 'low'
                      ? 'cascada de hashes: riesgo bajo'
                      : 'cascada de hashes: riesgo medio',
            title:
                d.risk === 'high'
                    ? `${d.hub} nombra a ${d.names} chunks y lo importan ${d.named}: tocar cualquier hoja mueve el build entero`
                    : d.risk === 'low'
                      ? `Los nombres están concentrados en ${d.hub}, que pesa ${d.size}: la cascada apenas se propaga`
                      : `Los nombres están repartidos: ${d.hub} es el que más lleva, ${d.names} de ${d.chunks}`,
            body: `Un bundler escribe el nombre con hash de cada chunk que importa dentro del chunk que lo importa, así que un cambio viaja por esas aristas. Lo que decide cuánto viaja no es qué bundler es, es la topología, y por eso se mide en vez de citarse. ${
                d.risk === 'low'
                    ? `Aquí ${mono(d.hub)} pesa ${d.size} y concentra ${d.names} nombres: es la forma del <em>runtime chunk</em>, que es exactamente lo que hace webpack y lo que evita en gran parte el problema. <strong>Con un matiz que suele caerse:</strong> ese chunk cambia en cada despliegue, así que tiene que ser diminuto y estar inlineado en el HTML. Si se sirve como fichero cacheable aparte, se ha quedado el coste y se ha perdido el beneficio.`
                    : d.risk === 'high'
                      ? `Aquí ${mono(d.hub)} nombra ${d.names} de los ${d.chunks} chunks del build <strong>y</strong> lo importan ${d.named}: es la forma hub-and-spoke. Cambia una hoja → cambia el hub → cambia todo lo que importa el hub, que aquí es casi todo. No crece con la profundidad: da un salto.`
                      : `Aquí no hay un fichero que lo concentre todo: ${mono(d.hub)} nombra ${d.names} de ${d.chunks}. Un cambio viaja, pero no alcanza al build entero.`
            }`,
            fix: `${
                d.risk === 'low'
                    ? `Comprueba que ${mono(d.hub)} va inlineado en ${mono('index.html')} y no como fichero aparte con hash: es lo único que hay que vigilar en esta forma.`
                    : 'Las salidas tienen todas un precio y ninguna es automática: los import maps sacan los especificadores al HTML (a cambio de un HTML no cacheable, que normalmente ya lo es), romper el hub con <span class="mono">manualChunks</span> se paga con una primera carga mayor —lo avisa la propia documentación de Rollup—, y la compresión con diccionario abarata la redescarga en vez de hacerla menos frecuente.'
            } Y una cita que conviene leer entera: los tests de tooling.report dicen que Rollup no debería tener este problema, y cubren un caso de dos niveles. Una aplicación real con un chunk compartido que todas las rutas importan falla igual. La cita es correcta y no significa lo que parece.${
                d.exposure === 'unknown'
                    ? ' Lo que aquí no se dice es si esta forma importa: eso depende de cada cuánto despliegas y de qué proporción vuelve, que son dos de las cinco preguntas sobre la situación. Hasta que estén contestadas, la topología se enseña y el color se retiene.'
                    : d.exposure === 'high'
                      ? ` Y con lo que se ha contestado sobre la situación, esta forma se paga ${d.perWeek === null ? 'varias veces por semana' : `${formatCount(d.perWeek)} veces por semana`} y por persona, que es lo que la saca de ser una curiosidad topológica.`
                      : d.exposure === 'moderate'
                        ? ` Con lo que se ha contestado sobre la situación, esta forma se paga ${d.perWeek === null ? 'de vez en cuando' : `${formatCount(d.perWeek)} veces por semana`} y por persona: es un coste real y no el mayor que tienes.`
                        : ` Con lo que se ha contestado sobre la situación, esta forma casi no se paga: ${d.perWeek === null ? 'se despliega poco o vuelve poca gente' : `sale a ${formatCount(d.perWeek)} veces por semana y persona`}. La topología es la que es, y merece la pena saberlo antes de que cambie la cadencia de despliegue.`
            }`,
        }),

        // --- de dónde sale la primera carga ---
        assetOrigin: (d: AssetOriginData) => ({
            chip: 'los assets salen de otro host',
            title:
                d.origins.length === 1
                    ? `${d.scripts} ficheros de JavaScript de la primera carga se sirven desde ${d.origins[0]}, no desde el origen de la página`
                    : `El JavaScript de la primera carga se reparte entre ${d.origins.length} hosts que no son el de la página`,
            body: `${d.origins.map(origin => mono(origin)).join(', ')} — ${d.scripts} ficheros de JavaScript y ${d.files} ficheros en total. Antes del primer byte del primer chunk hay una resolución DNS, una conexión TCP y un handshake TLS contra ese host (o un handshake QUIC), y eso es tiempo que ninguna cifra de peso de este informe ve: el conteo de viajes empieza a contar cuando la conexión ya existe.${
                d.base
                    ? ` Además hay un ${mono('<base href>')} apuntando a ${mono(d.base)}, así que no es un fichero suelto: todas las URLs relativas de la página se resuelven ahí.`
                    : ''
            } Y tiene el lado contrario, que conviene decir en la misma frase: bajo HTTP/1.1 un segundo origen es un segundo pool de seis conexiones, así que la misma decisión que añade un handshake quita cola de peticiones.`,
            fix:
                d.cold.length > 0
                    ? `Sin precalentar: ${d.cold.map(origin => mono(origin)).join(', ')}. Un ${mono('<link rel="preconnect">')} en el ${mono('<head>')} paga ese handshake mientras el navegador todavía está parseando la página, en vez de al descubrir el primer chunk. Es una etiqueta y no cambia el reparto de chunks. Con moderación: cada conexión abierta compite por el mismo ancho de banda, así que a partir de dos o tres orígenes precalentados deja de ayudar.${
                          d.warmed.length > 0
                              ? ` Ya está hecho para ${d.warmed.map(origin => mono(origin)).join(', ')}.`
                              : ''
                      }`
                    : `La página ya precalienta esos orígenes con ${mono('preconnect')} o ${mono('dns-prefetch')}, que es lo que se puede hacer sin mover los ficheros. No hay nada más que arreglar aquí: queda como contexto para leer el conteo de viajes, que no incluye el handshake.`,
        }),

        // --- lo que se sirve, frente a lo que se construyó ---
        servedUncompressed: (d: { count: number; size: string; ratio: number | null; list: string }) => ({
            chip: 'JavaScript servido sin comprimir',
            title:
                d.count === 1
                    ? `Un fichero de JavaScript (${d.size}) llega sin comprimir`
                    : `${d.count} ficheros de JavaScript (${d.size}) llegan sin comprimir`,
            body: `El navegador informa de que el cuerpo codificado y el descodificado pesan casi lo mismo, así que no hubo ni gzip ni brotli por medio: ${d.list}.${
                d.ratio ? ` El resto del build sí comprime, a razón de ${d.ratio.toFixed(1)}:1.` : ''
            } Que en la carpeta haya un ${mono('.br')} dice qué se <strong>construyó</strong>, no qué se <strong>sirve</strong>: esto es lo segundo, y por eso no lo puede ver ningún analizador de bundles.`,
            fix: 'Es configuración del servidor o del CDN, no del build: activa la compresión para <span class="mono">application/javascript</span> y <span class="mono">text/javascript</span>. Si el pipeline ya genera <span class="mono">.br</span> y <span class="mono">.gz</span>, lo que falta es la negociación de contenido que los sirva. Vale más que cualquier reparto de chunks de esta lista.',
        }),

        // --- el cálculo contra el waterfall ---
        measuredWaves: (d: {
            computed: number;
            measured: number;
            screen: string;
            widest: number;
            queued: boolean;
            list: string;
        }) => ({
            chip: d.measured > d.computed ? 'más tandas de las calculadas' : 'calculado y medido coinciden',
            title:
                d.measured > d.computed
                    ? `El grafo predice ${d.computed} viajes para ${d.screen} y el navegador hizo ${d.measured} tandas`
                    : `Las ${d.measured} tandas medidas al abrir ${d.screen} son los viajes que predice el grafo`,
            body: `Tandas medidas, con cuántos ficheros trae cada una y cuándo arranca — ${d.list}. La más ancha trae ${d.widest} ficheros. La cifra calculada es la profundidad del bootstrap más la de la pantalla, porque son secuenciales: el router no puede pedir el chunk de la pantalla hasta que ha llegado y ejecutado el bootstrap que lo contiene. <strong>Una tanda no es exactamente un viaje del grafo</strong>: el grafo cuenta descubrimiento —un chunk del que el navegador no puede saber hasta parsear otro— y una tanda cuenta lo que pasó, que también se parte cuando se acaba el pool de conexiones.`,
            fix:
                d.measured > d.computed
                    ? `${
                          d.queued
                              ? 'En esta carga se agotó el pool de conexiones, así que parte de la diferencia es cola y no profundidad: bajo HTTP/1.1 el séptimo fichero arranca cuando termina el primero. '
                              : ''
                      }El resto está en algo que el grafo de importaciones estáticas no ve: una petición hecha desde código, un import dinámico que dispara otro, o una redirección. Mira qué ficheros caen en las tandas de más — el grafo no los predice, y esa es una respuesta sobre el cálculo, no sobre el build.`
                    : 'No hay nada que corregir. Es la validación que hace creíbles las demás cifras de viajes del informe: el cálculo estático y el waterfall real dicen lo mismo.',
        }),

        // --- la conexión, observada ---
        poolExhausted: (d: { opened: number; lastAt: number | null; protocol: string }) => ({
            chip: 'se agotó el pool de conexiones',
            title: `El navegador abrió ${d.opened} conexiones para esta carga, sobre ${d.protocol}`,
            body: `Bajo HTTP/1.1 un navegador mantiene unas seis conexiones por origen, así que la petición número siete espera a que termine una anterior.${
                d.lastAt === null ? '' : ` La última conexión se abrió a los ${Math.round(d.lastAt)} ms.`
            } Esto es el problema de HTTP/1.1 <strong>medido</strong>, no inferido del protocolo: aquí el conteo de ficheros se convierte en segundos de verdad.`,
            fix: 'Lo que arregla esto de raíz es el protocolo: con HTTP/2 o HTTP/3 una conexión lleva todas las peticiones y el conteo deja de tener este coste. Mientras siga en HTTP/1.1, menos ficheros en la primera carga sí ayuda — y es el único caso del informe en el que fusionar chunks tiene un argumento claro a favor.',
        }),

        thirdPartyLoad: (d: {
            requests: number;
            total: number;
            origins: string;
            count: number;
            multiplexed: boolean;
            max: number;
        }) => ({
            chip: 'peticiones a terceros en la misma carga',
            title: `${d.requests} de las ${d.total} peticiones de esta carga van a ${d.count === 1 ? 'otro host' : `${d.count} hosts`}`,
            body: `${d.origins}. Es el denominador que le falta al conteo de ficheros: ${d.max} ficheros de JavaScript significan una cosa en una página que hace treinta y pico peticiones y otra distinta en una que hace ciento diez.${
                d.multiplexed
                    ? ' Bajo HTTP/2 y HTTP/3 los terceros no comparten la conexión de la página, así que cada origen es un handshake propio, y el multiplexado no los cubre.'
                    : ' Bajo HTTP/1.1 cada origen trae además su propio pool de seis conexiones, que ayuda, y su propio handshake, que no.'
            }`,
            fix: 'Este informe es sobre tu build y no puede decidir por ti qué terceros valen lo que cuestan. Lo que sí cambia es cómo leer el resto: el umbral de ficheros por pantalla habla solo de tu JavaScript, y esta cifra es el resto de la factura.',
        }),

        revalidated: (d: { revalidated: number; fromCache: number; network: number }) => ({
            chip: 'ficheros con hash que se revalidan',
            title: `${d.revalidated} ficheros volvieron a preguntar al servidor en vez de servirse de la caché`,
            body: `Cabeceras de vuelta y cuerpo no: eso es un 304, y el viaje de ida y vuelta se paga igual. En esta carga: ${d.fromCache} servidos desde la caché sin preguntar, ${d.revalidated} revalidados y ${d.network} descargados enteros. <strong>Toda la sección de coste de actualización de este informe supone caché caliente e <span class="mono">immutable</span></strong>, y con revalidaciones esa premisa no se cumple: las cifras de visita recurrente son entonces optimistas.`,
            fix: 'Un fichero con hash en el nombre puede servirse con <span class="mono">Cache-Control: public, max-age=31536000, immutable</span>. Sin <span class="mono">immutable</span> el navegador revalida al recargar aunque el <span class="mono">max-age</span> sea largo. Es una cabecera del servidor o del CDN, y hasta que esté puesta el análisis de visita recurrente hay que leerlo como no verificado.',
        }),

        swControlling: (d: { caches: number }) => ({
            chip: 'un service worker controla esta carga',
            title: 'Hay un service worker al mando de la página',
            body: `No es que esté en el build: está <strong>controlando</strong> esta carga${d.caches > 0 ? `, y ve ${d.caches} cachés` : ''}. Conviene decir qué ablanda y qué no, porque es fácil leerlo al revés: ablanda <strong>solo</strong> el análisis de visita recurrente. La primera visita paga la red íntegra y además la instalación del worker descarga el precaché entero, y con cascada de hashes las entradas del manifiesto que cambian son casi todas en cada despliegue. Un service worker no hace que las peticiones den igual: <strong>sube</strong> el precio de la cascada.`,
            fix: 'Nada que cambiar por esto solo. Léelo así: las señales de conteo y de viajes siguen valiendo tal cual para quien entra por primera vez, y la cifra que se ablanda es la de quien vuelve. Si el coste de actualización de este informe sale alto, con un service worker sale más alto todavía, no menos.',
        }),

        measuredOrigin: (d: { origins: string; count: number }) => ({
            chip: 'el código vino de otro host',
            title:
                d.count === 1
                    ? 'El JavaScript de este build se descargó de otro host'
                    : `El JavaScript de este build se descargó de ${d.count} hosts distintos del de la página`,
            body: `${d.origins}, según las direcciones que informó el navegador. Esto es más fuerte que leerlo del ${mono('index.html')}: una página escrita entera con URLs relativas y servida desde un CDN no nombra ningún otro host en su marcado, y aun así sus bytes vienen de otro sitio. La factura es la misma que la de la señal del ${mono('index.html')} — DNS, TCP y TLS antes del primer byte del primer chunk — y también su lado bueno bajo HTTP/1.1.`,
            fix: `Si el ${mono('index.html')} no lo dice y esto sí, lo está poniendo el despliegue: una reescritura de rutas, un ${mono('<base href>')} inyectado o el propio CDN. Merece la pena saberlo, porque el conteo de viajes de este informe empieza a contar cuando la conexión ya existe, y aquí no existía.`,
        }),

        // --- el canal, con sus límites al lado ---
        observedChannel: (d: ObservedChannelData) => ({
            chip: 'entorno observado',
            title: `Medido ${d.protocol ? `sobre ${d.protocol}` : 'una vez'}${d.rttMs === null ? '' : `, con ${d.rttMs} ms de ida y vuelta`}${d.takenAt ? ` el ${d.takenAt.slice(0, 10)}` : ''}`,
            body: `${d.protocol ? `Protocolo negociado: ${mono(d.protocol)}.` : 'El pegado no dice el protocolo.'}${
                d.mixed ? ` Y no todo llegó igual: ${d.mixed}.` : ''
            }${d.rttMs === null ? '' : ` Ida y vuelta medida: ${d.rttMs} ms, contra los ${d.latencyMs} ms con los que este informe calcula sus segundos.`}${
                d.ttfbMs === null
                    ? ''
                    : ` El documento tardó ${d.ttfbMs} ms en dar su primer byte: ese es el viaje cero, y el conteo de viajes empieza a contar después.`
            }${d.modulepreloads === null ? '' : ` La página emite ${d.modulepreloads} etiquetas ${mono('modulepreload')}.`}${d.timed ? '' : ' El pegado no traía tiempos, así que aquí falta media respuesta: ni ida y vuelta, ni tandas, ni conexiones abiertas. El snippet de esta pestaña sí los pide.'} Esto describe <strong>la máquina de quien pegó el snippet</strong>, no la de tus usuarios.`,
            fix: `${
                d.stale
                    ? `Esta medición tiene más de ${d.freshDays} días: vuelve a tomarla antes de apoyar nada en ella. `
                    : ''
            }Ni una sola de estas cifras mueve un umbral de este informe, a propósito. Un ${mono('h3')} medido desde una máquina es sistemáticamente optimista: la primera conexión de un visitante nuevo suele ser ${mono('h2')} porque el ${mono('Alt-Svc')} tiene que estar cacheado antes, y en redes corporativas los proxies que tiran UDP lo degradan en masa. Si tenéis RUM, la distribución p75 de protocolo y de latencia sale de ahí y no de un pegado de consola.`,
        }),

        // --- against a browser measurement ---
        measuredExtra: (d: MeasuredExtraData) => ({
            chip: 'medido por encima de lo calculado',
            title: `Abrir ${d.screen} descarga ${d.diff} más de lo que dice el cálculo`,
            body: `Calculado ${mono(d.computed)} en ${d.computedFiles} ficheros; medido ${mono(d.measured)} en ${d.measuredFiles}. Se descargan ${d.count} chunks que el grafo de importaciones estáticas no predice: ${d.list}.`,
            fix: 'La cifra que paga quien entra es la medida. Mira de quién son esos chunks: si pertenecen a otra pantalla, alguien los está cargando antes de tiempo; si no son de este build, hay algo sirviendo ficheros viejos.',
        }),
        measuredEager: (d: { screen: string; size: string; list: string }) => ({
            chip: 'el router carga una zona antes de que el guard la rechace',
            title: `Abrir ${d.screen} descarga ${d.size} que son de otras pantallas`,
            body: `Se descargan chunks que solo usan ${d.list}. Al entrar por la raíz, el router carga el chunk de la zona para poder emparejar la ruta, y solo después el guard comprueba la sesión y redirige. Para entonces ya se ha descargado.`,
            fix: 'Haz que la comprobación ocurra antes de la carga: un <span class="mono">canMatch</span> descarta la ruta sin pedir su chunk, mientras que un <span class="mono">canActivate</span> se ejecuta cuando ya se ha descargado. Con canMatch esa zona deja de pagarse en cada carga de la aplicación.',
        }),
        measuredShort: (d: { screen: string; count: number; size: string; list: string }) => ({
            chip: 'medido por debajo de lo calculado',
            title: `Faltan ${d.count} chunks de ${d.screen} en la medición (${d.size})`,
            body: `El cálculo los da por descargados y el navegador no los pidió: ${d.list}. Lo normal es que la medición se tomara antes de llegar del todo a la pantalla, o que un chunk se sirviera desde la caché sin aparecer en la lista.`,
            fix: 'Vuelve a medir con la caché desactivada y con la pantalla ya abierta. Si aun así no se descargan, esos chunks son código que el router no llega a pedir nunca.',
        }),
        measuredMatch: (d: { screen: string; size: string }) => ({
            chip: 'calculado y medido coinciden',
            title: `Lo que descarga el navegador al abrir ${d.screen} es lo que dice el cálculo: ${d.size}`,
            body: 'Los chunks descargados son exactamente los que el grafo de importaciones predice. En esta pantalla la cifra calculada no se queda corta.',
            fix: 'No hay nada que corregir aquí. Merece la pena repetir la medición entrando por la raíz y no directo a la ruta: es ahí donde suelen aparecer las diferencias.',
        }),

        // --- lo que contestó el equipo ---------------------------------------------------------
        /**
         * Cada pregunta en una cláusula, para poder nombrarla dentro de una frase. No es el
         * enunciado: ese está en la pestaña, entero y con sus opciones.
         */
        situationAsks: {
            navigation: 'cómo se mueve la gente por la aplicación',
            deploys: 'cada cuánto sale una versión nueva a producción',
            returning: 'qué proporción de quien la abre ya la había abierto esta semana',
            connection: 'desde dónde y con qué se conectan',
            priority: 'qué es peor, que tarde la primera pantalla o ir de una a otra',
        },
        situationAsked: (d: SituationAskedData) => ({
            chip: 'la situación, contestada',
            title:
                d.perWeek === null
                    ? `${d.answered} de ${d.total} preguntas contestadas sobre la situación`
                    : `Con ${formatCount(d.deploys ?? 0)} despliegues por semana y un ${pct(d.returning ?? 0)} que vuelve, cada persona paga la actualización ${formatCount(d.perWeek)} veces por semana`,
            body: `Esto es <strong>declarado</strong>: lo contestó alguien${d.by ? ` (${d.by})` : ''}${d.at ? `, el ${d.at}` : ''}. Vale más que una suposición y menos que una medición, y por eso no se mezcla en la misma frase con lo que reportó un navegador.${
                d.perWeek === null
                    ? ' Faltan las dos respuestas que convierten el porcentaje de invalidación en un coste: cada cuánto despliegas y qué proporción vuelve. Sin las dos, el porcentaje se queda como está, enseñado entero y sin color.'
                    : ` La cifra de arriba es una multiplicación y se enseña entera a propósito: ${formatCount(d.deploys ?? 0)} despliegues por semana × ${pct(d.returning ?? 0)} que llega con la caché caliente. Si no te cuadra, el desacuerdo está en uno de los dos factores y se ve en cuál.`
            }${
                d.exposure === 'high'
                    ? ' <strong>A esa frecuencia la cascada de hashes se paga de verdad</strong>, y donde este informe mida una, deja de enseñarse como un dato sin color.'
                    : d.exposure === 'moderate'
                      ? ' Es una frecuencia intermedia: la cascada se paga, ni todas las semanas ni en balde. Las señales que la miden se quedan informativas, ahora por una razón que se puede leer en vez de por falta de datos.'
                      : d.exposure === 'low'
                        ? ' A esa frecuencia la cascada apenas se paga: casi todo el que abre la aplicación la descarga entera de todas formas. La sección de coste de actualización sigue ahí y sigue siendo cierta; simplemente no es lo más caro que tienes.'
                        : ''
            }${
                d.breadth === 'narrow'
                    ? ' Y con sesiones de una sola pantalla, la cobertura de un chunk diferido significa lo que parece: un chunk que alcanza a media aplicación lo descarga poca gente.'
                    : d.breadth === 'wide'
                      ? ' Y con sesiones que recorren la aplicación, un chunk compartido por media aplicación lo descarga casi todo el mundo: su cobertura se lee como peso de arranque, no como peso de una pantalla.'
                      : d.breadth === 'mixed'
                        ? ' Con dos o tres perfiles distintos, la mediana de pantallas por sesión no describe a ninguno de ellos, y eso también es un dato: las cifras de cobertura de este informe hay que leerlas por perfil.'
                        : ''
            }${d.rum ? ` Tenéis RUM, así que la cuarta pregunta no se contesta de memoria: la p75 de protocolo y de ida y vuelta sale de ahí. La latencia con la que este informe convierte bytes en segundos es de ${d.latencyMs} ms; cámbiala por la vuestra si no coincide.` : ''}`,
            fix: `${
                d.stale
                    ? `<strong>Estas respuestas tienen más de ${d.freshDays} días.</strong> La cadencia de despliegue es justo lo que cambia cuando un equipo se pasa a entrega continua, y una respuesta anterior a ese cambio es un dato falso con el nombre de una persona al lado. Vuelve a pasar por las preguntas antes de fiarte de la cifra. `
                    : ''
            }Lo que estas respuestas pueden hacer es <strong>subir</strong> la severidad de una señal, y lo que no pueden es bajarla. La asimetría es a propósito, y aquí más que en ningún otro sitio porque esta es la evidencia más blanda de las tres que maneja el informe: si contestar optimista pudiera apagar señales, la forma barata de tener un informe limpio sería contestar optimista. Lo más que compra una respuesta optimista es un párrafo diciendo que el coste se calculó y salió pequeño.${d.at ? '' : ' Falta ponerles fecha: sin ella no hay forma de saber cuándo dejaron de ser verdad.'}`,
        }),
        situationPriority: (d: SituationPriorityData) => ({
            chip: 'qué espera prefiere pagar el equipo',
            title:
                d.priority === 'firstScreen'
                    ? 'Contestado: importa más la primera pantalla que la navegación'
                    : d.priority === 'navigation'
                      ? 'Contestado: importa más ir de una pantalla a otra que la primera carga'
                      : 'Contestado: las dos esperas importan igual',
            body: `Es la única de las cinco preguntas que ningún fichero puede contestar, y la que resuelve una tensión que el resto del informe se niega a resolver: diferir código abarata la primera pantalla y encarece la navegación, y precargarlo hace lo contrario. Las dos magnitudes están sobre la mesa en las señales de granularidad y de viajes, sin recomendación automática, precisamente porque nada en una carpeta de build sabe cuál de las dos duele más aquí.${
                d.priority === 'both'
                    ? ' Contestar «las dos» no es dejar de contestar: es decir que no hay margen para cambiar una por la otra, y eso descarta las salidas fáciles de las dos señales.'
                    : ''
            }`,
            fix:
                d.priority === 'firstScreen'
                    ? `Entonces el informe puede decir la dirección, que en todo lo demás se calla: <strong>diferir agresivamente</strong>. Todo lo que no necesite la primera pantalla sale del bootstrap aunque eso multiplique los ficheros de las siguientes.${d.prefetching ? ' Y hay una señal de prefetch en este informe: mira si el framework está precargando rutas en la primera carga, porque eso es exactamente lo contrario de lo que acabas de decir que quieres.' : ''} La carga de las siguientes pantallas se compra aparte, con prefetch en ${mono('idle')} o al pasar el ratón por encima del enlace, que no compite con la primera carga porque ocurre después.`
                    : d.priority === 'navigation'
                      ? `Entonces la dirección es la contraria y también se puede decir: <strong>precargar por intención</strong>, y no partir tan fino que ir a una pantalla cueste una cadena de descubrimientos. La profundidad de descubrimiento es la métrica que mide eso —cada nivel es una ida y vuelta que ninguna compresión toca— y es la que hay que mirar antes que el peso.${d.waves ? ' Este informe tiene señales de profundidad: son esas.' : ''} Cuidado con la salida fácil: fusionar chunks para acortar la cadena abarata la navegación y encarece la primera carga y la caché, que es justo el intercambio que acabas de decir que aceptas. Dilo en la revisión en vez de dejarlo implícito.`
                      : 'Con las dos igual de importantes no hay intercambio que hacer, así que las dos salidas fáciles quedan descartadas: ni fusionar para acortar la navegación ni diferir hasta llenar de viajes la primera pantalla. Lo que queda son los arreglos que no cambian una cosa por la otra —quitar peso que no usa nadie, romper el chunk que mezcla lo que cambia con lo que no, arreglar la compresión— y son los que este informe pone arriba.',
        }),
        situationMissing: (d: SituationMissingData) => ({
            chip: 'preguntas que cambiarían este informe',
            title:
                d.keys.length === 1
                    ? 'Hay una pregunta sin contestar que cambiaría lo que dice este informe'
                    : `Hay ${d.keys.length} preguntas sin contestar que cambiarían lo que dice este informe`,
            body: `${d.started ? 'De las cinco, siguen abiertas' : 'Nadie ha contestado todavía, y de las cinco preguntas estas son las que le hacen falta a <strong>este</strong> informe'}: ${d.asks.map(ask => `<strong>${ask}</strong>`).join('; ')}. No salen aquí porque falte rellenar un formulario: cada una está en la lista porque hay una señal en este mismo informe cuya lectura depende de ella. Las que no cambiarían nada no se piden.`,
            fix: `Se contestan en la pestaña de situación de la página, o a mano en el bloque ${mono('situation')} de ${mono('loadline.json')}, que es de donde las lee el comando. Son opciones en vez de números, y cada una dice al lado dónde mirar cuando la respuesta no se sabe de memoria: eventos de cambio de ruta por sesión, los tags del último trimestre, la proporción de recurrentes de la analítica. <strong>Y una que conviene no contestar de memoria</strong>: la de la conexión es la que más miente, porque se contesta como a uno le gustaría que fuera. Si tenéis RUM, esa no se contesta, se importa. Mientras sigan abiertas no pasa nada malo: el informe enseña los hechos crudos y retiene el color, que es lo que ha venido haciendo hasta ahora.`,
        }),
    },
    en: {
        /** What the entry through the root is called when the measurement matches no screen. */
        rootScreen: 'the root',
        shared: (d: { size: string; screens: number; total: number; chunk: string; top: string }) => ({
            chip: 'common code marked as lazy',
            title: `${d.size} downloaded by ${d.screens} of your ${d.total} screens`,
            body: `The chunk ${mono(d.chunk)} shows up in your bundler’s lazy list, so it looks like only the screens that need it pay for it. <strong>${d.screens} screens</strong> import it: in practice it always downloads. Its main contents are ${mono(d.top)}.`,
            fix: 'This is usually one barrel file re-exporting a whole UI folder that every screen imports. Before splitting the whole thing, check the breakdown: if most of the weight really is used everywhere, splitting only moves it elsewhere. What does pay off is pulling out the components a single screen uses.',
        }),
        bootLazy: (d: BootLazyData) => ({
            chip: 'bootstrap for a lazy screen',
            title: `${d.pkg} weighs ${d.size} in the bootstrap, and the code using it is in a lazy screen`,
            body: `<strong>Every load of the app</strong> downloads it, even though its screen is lazy and many people never open it. The real consumer is in ${d.screens}, and ${d.files} files import it in total.${
                d.chain
                    ? ` It enters the bootstrap through ${d.chain}${d.entry ? `: the import to look at is the one in ${mono(d.entry)}` : ''}.`
                    : ''
            }`,
            fix: `Move its registration out of the bootstrap config and into that route’s providers${
                d.routes ? `, in ${d.routes}, where the screen is loaded from` : ', inside a lazy routes file'
            }. One side effect to keep in mind: if you have guards comparing against ${mono('routeConfig.path')}, keep the guard on the parent route, because once nested the child gets ${mono("path: ''")} and the guard stops recognising it.`,
        }),
        commonJs: (d: { count: number; size: string; items: CommonJsItem[] }) => ({
            chip: 'CommonJS package',
            title:
                d.count === 1
                    ? `One package shipped as CommonJS (${d.size}): the bundler cannot tree-shake it`
                    : `${d.count} packages shipped as CommonJS (${d.size}): the bundler cannot tree-shake them`,
            body: `A CommonJS package cannot be analysed at build time, so every file of it you import comes in whole, even for a single function. It is what Angular warns about with “CommonJS or AMD dependencies can cause optimization bailouts”. Raw sizes, inside the chunk: ${d.items
                .map(item => {
                    const where =
                        item.zone === 'boot'
                            ? 'in the bootstrap'
                            : item.zone === 'shared'
                              ? `in a chunk shared by ${item.screens} screens`
                              : 'in a single screen';
                    const who =
                        item.importers.length > 0
                            ? `; imported by ${item.importers.map(file => mono(file)).join(', ')}`
                            : item.via.length > 0
                              ? `; imported by ${item.via.map(pkg => mono(pkg)).join(', ')}`
                              : '';
                    return `${mono(item.name)} (${item.size}, ${where}${who})`;
                })
                .join(' · ')}.`,
            fix: `Check whether the package ships an ES modules build or whether an alternative does. If not, import only the file you need (${mono('crypto-js/md5')} instead of ${mono('crypto-js')}) so the minimum comes in. Adding it to ${mono('allowedCommonJsDependencies')} in ${mono('angular.json')} only silences the warning: the weight stays.`,
        }),
        bigFile: (d: { count: number; each: string; name: string; size: string; list: string }) => ({
            chip: d.count === 1 ? 'large source file' : 'large source files',
            title:
                d.count === 1
                    ? `${d.name} takes ${d.size} of the bootstrap`
                    : `${d.count} files of yours take ${d.size} of the bootstrap, each above ${d.each}`,
            body: `A file of yours this heavy is usually a constants table — translation keys, catalogues, routes — that comes in whole because it is referenced from everywhere. ${d.list}`,
            fix: 'Check the compressed size before touching it: repetitive text compresses very well and the change may not pay off. If it grows with every new entry, at least put a size budget on it.',
        }),
        dupeZone: { boot: 'in the bootstrap', shared: 'in a shared chunk', own: 'in a single screen' },
        dupeCopy: (d: DupeCopyData) =>
            `<strong>${d.version ? `version ${d.version}` : d.under ? `copy nested inside ${mono(d.under)}` : 'top-level copy'}</strong> · ${d.size} · ${d.zone}. ${
                d.chain ? `Comes in through ${d.chain}` : 'Could not be followed from the entry point'
            }${d.own ? `; your own code imports it in ${d.own}` : d.via ? `; ${d.via} imports it` : ''}.`,
        dupes: (d: DupesData) => ({
            chip: 'duplicate copies',
            title: `${d.count} package${d.count > 1 ? 's' : ''} shipped more than once`,
            body: `You pay the weight twice because two dependencies ask for incompatible ranges.${
                d.inBoot ? ' One of the copies is in the bootstrap, so everybody downloads that extra weight.' : ''
            } ${d.list}`,
            fix: d.viaDependency
                ? `At least one copy is not one you asked for: another dependency imports it, so aligning your ${mono('package.json')} is not enough. Force the resolution with ${mono('pnpm.overrides')}, ${mono('overrides')} (npm) or ${mono('resolutions')} (yarn), and check that the version you keep works for both.`
                : `Both copies come in through dependencies you ask for directly: align the versions in ${mono('package.json')} and measure again.`,
        }),
        heavy: (d: { count: number; label: string; own: string; median: string; list: string }) => ({
            chip: d.count === 1 ? 'expensive screen' : 'expensive screens',
            title:
                d.count === 1
                    ? `${d.label} includes ${d.own} that nothing else uses`
                    : `${d.count} screens carry far more code of their own than the rest, worst of them ${d.label} with ${d.own}`,
            body: `The median screen carries ${d.median} of its own code. ${d.count === 1 ? 'This one carries' : `${d.label} carries`} ${d.own}, so it pulls a heavy library just for itself.${
                d.list ? ` Behind it come ${d.list}.` : ''
            }`,
            fix: 'If that library is only needed once you open something inside the screen (a viewer, an editor, a chart), move it into a lazy block so people who merely pass through do not pay for it. With several screens on the list, check first whether it is the same library in all of them: then there is one fix, not five.',
        }),
        ownInBoot: (d: { count: number; name: string; size: string; list: string }) => ({
            chip: 'your own code in the bootstrap for a lazy screen',
            title:
                d.count === 1
                    ? `The ${d.name} folder weighs ${d.size} in the bootstrap, and the code using it is in lazy screens`
                    : `${d.count} folders of yours add ${d.size} to the bootstrap, and the code using them is in lazy screens`,
            body: `The same thing an npm package does, with your own code: every load of the application downloads it although its consumer is a lazy screen. ${d.list}.`,
            fix: 'Read the whole list of what keeps it in the bootstrap, not just the first one: moving one while the others still import it changes nothing. The usual case is an infrastructure layer depending at build time on a business layer, for instance a provider registered in the bootstrap configuration that imports the API services of nearly every entity. It is fixed by registering that in the route providers, or by cutting the dependency between layers. And if the bootstrap file importing it genuinely needs it, there is nothing to move: the signal is then informative only.',
        }),
        ownInBootKept: (keeping: string, screens: number) =>
            `kept in the bootstrap by ${keeping}; used by ${screens === 1 ? '1 lazy screen' : `${screens} lazy screens`}`,
        manyRequests: (d: {
            files: number;
            tiny: number;
            tinySize: string;
            max: number;
            worstLabel: string;
            worstFiles: number;
            small: number;
            smallSize: string;
        }) => ({
            chip: 'granularity of the split',
            title: `${d.tiny} of the ${d.files} files the typical screen downloads together are under ${d.tinySize}`,
            body: `The headline is the granularity, not the count, and the change is deliberate: <strong>a threshold on a count does not separate the good case from the bad one</strong>. Under multiplexing, sixty well-sized files are fine and sixty crumbs are not, and ${d.max} does not tell them apart. What does tell them apart is this: below ${d.tinySize}, asking for the file costs about what it brings. What is counted is what arrives <strong>together</strong> — the bootstrap plus whatever that screen brings in — not the build's chunk list: a small chunk hardly anybody loads is doing its job. The most split screen is ${mono(d.worstLabel)}, with ${d.worstFiles} files. Under HTTP/1.1 the count does cost seconds, and then a different signal says so: the one that watches the connection pool actually run out in a measurement.`,
            fix: `Under HTTP/2 and HTTP/3 the real cost of a crumb is not bytes — the HPACK/QPACK headers of a same-origin file are a few hundred bytes, so 1 kB is still a net gain — it is cache entries, module-map records and, above all, <strong>a symptom that the split's boundaries do not match the usage boundaries</strong>. That is the sentence that matters. Nobody decided this split either: the bundler makes one chunk per distinct set of screens that reach a module, so many chunks means many combinations of "these screens and not those use this", and they come down by removing combinations — a barrel file imported by a handful of screens produces one chunk per combination, and importing from the actual file reduces them.${
                d.small > 0
                    ? ` If you want to go the other way: you have ${d.small} chunks under ${d.smallSize} raw, and Rollup's ${mono('experimentalMinChunkSize')} exists for exactly this. How many it actually merges you will only know by running it — it only merges chunks with compatible dependency relations, and its threshold is measured before minification, so those ${d.small} are an <strong>upper bound</strong>, not a prediction.`
                    : ''
            } And the rule that goes with it: where there is a trade-off, both magnitudes on the table — startup in ms against retained cache in kB — and no automatic recommendation to merge. A large chunk mixing what changes with what does not is invalidated whole on every deploy.`,
        }),
        bootWaves: (d: {
            waves: number;
            count: number;
            next: number;
            list: string;
            critical: string;
            criticalBytes: string;
            offPath: number;
            width: number;
        }) => ({
            chip: 'bootstrap in several round trips',
            title: `The first load takes ${d.waves} round trips before anything is painted`,
            body: `A chunk ${mono('index.html')} names — the entry script or a ${mono('modulepreload')} link — is asked for straight away; one it does not name is only discovered once the chunk importing it has arrived and been parsed. ${d.count === 1 ? '1 bootstrap chunk is not named' : `${d.count} bootstrap chunks are not named`}: ${d.list}. Same bytes, one round trip later, in the one moment every visitor pays for.${d.count === 1 ? '' : d.next === d.count ? ' They are all discovered at the same moment, so between them they cost one round trip, not one each.' : ` ${d.next === 1 ? '1 of them is' : `${d.next} of them are`} discovered on the very next trip and the rest sit behind ${d.next === 1 ? 'it' : 'them'}: that is a chain, and every level costs a trip of its own.`}`,
            fix: `${
                d.critical
                    ? `The chain that actually costs round trips is ${d.critical} (${d.criticalBytes}): those are the ones that, named in the page, remove a wait.${d.offPath > 0 ? ` The other ${d.offPath} arrive on a trip that is being paid anyway, so a tag for them buys nothing and still competes for bandwidth.` : ''} `
                    : ''
            }Naming in the page what is currently discovered by parsing is what removes the wait, and <strong>the number of tags is part of the cost, not part of the fix</strong>. ${d.count === 1 ? 'Here that is one tag.' : d.next === d.count ? `Here that means all ${d.count}: they share a trip, so naming some but not all of them buys nothing.` : `Here the ${d.next === 1 ? 'one on the next trip shortens' : `${d.next} on the next trip shorten`} the chain by a level; getting to a single round trip asks for all ${d.count}.`} Almost nobody writes them by hand: Angular emits them for the initial chunks and Vite has ${mono('build.modulePreload')} — if it is switched off, this is the bill. What is worth avoiding is making it a habit: a page carrying dozens of ${mono('modulepreload')} tags competes for bandwidth with the CSS that blocks rendering, and teams have measured first paint getting <strong>worse</strong> after adding them. Put the tags <strong>after</strong> the ${mono('&lt;link rel="stylesheet"&gt;')} lines so the stylesheet keeps its priority, and keep them to the bootstrap: a chunk for a route nobody has navigated to yet wants prefetching on intent or in idle time, never a ${mono('modulepreload')} every visitor pays for. And if it turns out they are not needed before the first paint, the other way out is to defer them, and then the first load weighs less as well.`,
        }),
        slowScreens: (d: {
            count: number;
            max: number;
            worstLabel: string;
            worstWaves: number;
            worstWidth: number;
            latencyMs: number;
            worstMs: number;
            list: string;
        }) => ({
            chip: 'discovery depth',
            title: `${d.worstLabel} takes ${d.worstWaves} round trips to be complete: ${d.worstMs} ms of pure waiting`,
            body: `A browser does not know a chunk exists until it has downloaded and parsed the one importing it, so a screen split across several levels of static imports costs that many requests <strong>in a row</strong>, however little it weighs. <strong>The threshold here is a formula, not a number:</strong> every round trip is at least one latency, so ${d.worstWaves} × ${d.latencyMs} ms = ${d.worstMs} ms that no size figure shows. And it holds under every protocol: no compression touches a round trip, and neither does multiplexing, because what limits this is sequential discovery rather than transport. ${d.count === 1 ? 'One screen takes' : `${d.count} screens take`} ${d.max} or more: ${d.list}. ${
                d.worstWidth <= 1
                    ? 'Its widest trip brings a single file: it is a chain end to end, and every level flattened removes a whole wait.'
                    : `Its widest trip brings ${d.worstWidth} files: depth and width are different problems and a count of trips reports them as one. Those ${d.worstWidth} cost one trip between them; what costs trips is whatever sits behind them.`
            }`,
            fix: 'Look at the chain in the Screens tab: each level is one file statically importing another. It shortens by importing from the screen what reaches it today through an intermediary, or — where the bundler allows it — by having the loader ask for the whole list at once, which is what Vite does with its preload list. This is not a question of size: merging chunks does not fix it while the chain is as deep.',
        }),
        locales: (d: { packages: { name: string; files: number; size: string }[]; size: string; boot: boolean }) => ({
            chip: 'every language of a library',
            title: `${d.size} in language files: ${d.packages.map(p => `${p.name} ships ${p.files}`).join(', ')}`,
            body: `A library that keeps its languages in a ${mono('locale/')} folder ships all of them when imported from its root, and then one gets used. ${d.packages
                .map(p => `${mono(p.name)}: ${p.files} files, ${p.size}`)
                .join(' · ')}.${d.boot ? ' They are in the bootstrap, so everybody downloads them.' : ''}`,
            fix: 'Import the language you use instead of the package root, and load the others when somebody switches. In date-fns and dayjs that is one import per language; in moment the folder has to be excluded in the bundler config. Check first how many languages the app really supports: if it is one, this is all gain.',
        }),
        dataAsCode: (d: { count: number; size: string; items: { name: string; size: string }[]; boot: boolean }) => ({
            chip: 'data shipped as code',
            title: `${d.size} of data embedded in the bundle (${d.count === 1 ? '1 .json file' : `${d.count} .json files`})`,
            body: `An import of a data file is not a reference: the content ends up inside a JavaScript chunk, and downloads and parses with it. ${d.items
                .map(i => `${mono(i.name)} (${i.size})`)
                .join(' · ')}.${d.boot ? ' And it is in the bootstrap.' : ''}`,
            fix: 'Data is requested rather than imported: move it to the assets folder and fetch it. It then caches on its own, does not delay the bootstrap, and changing it does not invalidate your JavaScript. If it really is needed before painting, at least keep it from downloading with everything else.',
        }),
        unreachable: (d: { count: number; total: number; size: string; most: boolean; list: string }) => ({
            chip: d.most ? 'most of this build is not in this report' : 'chunks this report cannot reach',
            title: d.most
                ? `${d.count} of your ${d.total} chunks (${d.size}) are in no figure here`
                : `${d.count} chunk${d.count > 1 ? 's' : ''} (${d.size}) that nothing reaches from the entry point`,
            body: `Nothing reachable from where the application starts imports ${d.count > 1 ? 'these files' : 'this file'}, statically or lazily: ${d.list}. It can be <strong>the server side</strong> of a rendered build — one build writes both halves into the same ${mono('stats.json')}, and without the folder there is nothing to tell them apart by — a service worker, which is not part of the first load, an ${mono('import()')} whose path is built at run time, which VitePress writes one of per page and then this is most of the site, or what a previous build left in a folder nobody cleans.`,
            fix: `If your application renders on the server, drop the browser folder as well — ${mono('--dist')} on the command line — and the two sides separate on their own: without it this report may be describing the server bundle, which is usually the bigger of the two. If they are service workers, there is nothing to do. If the site writes a page per route, those chunks download on navigation and this report only describes what the entry reaches: read it as the cost of arriving, not as the size of the site. And if it is none of those, clean the folder before building: leftovers are dead weight on the server and make every figure here read low.`,
        }),
        prefetched: (d: { count: number; size: string; list: string }) => ({
            chip: 'screens fetched before anybody asks',
            title: `The page prefetches ${d.count === 1 ? '1 chunk' : `${d.count} chunks`} (${d.size}) for a screen nobody has opened`,
            body: `A ${mono('&lt;link rel="prefetch"&gt;')} is not part of the first load and this report does not count it as one. It is still fetched on this visit: measured in a browser, all of them came down while the first page was loading, at low priority but over the same connection. What it changes is how to read the table above — a screen the visitor already holds does not cost what its row says, and one they never open cost them the whole thing for nothing. ${d.list}.`,
            fix: `It is almost never written by hand. Nuxt prefetches every route it finds and every link that scrolls into view (${mono('experimental.defaults.nuxtLink.prefetch')}, or ${mono('prefetch={false}')} on the link); SvelteKit has ${mono('data-sveltekit-preload-data')}; Next.js prefetches every ${mono('&lt;Link&gt;')} in the viewport. On a site with three routes it is a good trade. On one with forty it means every visitor downloads the whole application to look at the home page, and turning it off — or narrowing it to the links that really are the next step — is a line of configuration.`,
        }),
        noSourceMaps: (d: { unnamed: number }) => ({
            chip: d.unnamed > 0 ? 'screens with no name' : 'folder without source maps',
            title:
                d.unnamed > 0
                    ? `All ${d.unnamed} of your screens are named after their chunk, so the table above cannot be read`
                    : 'This folder carries no .map files, and that cuts the report short',
            body: `${d.unnamed > 0 ? `Every row of the screens table is a content hash — ${mono('chunk-Brh4_81T')} rather than ${mono('orders')} — because this folder carries no ${mono('.map')} files. The figures next to them are right; which screen each one is, this report cannot say. ` : ''}Without them the weight of each chunk is known and what is inside it is not: screens come out named after their chunk file — ${mono('0fPdmq0U.js')} instead of ${mono('orders')} — and there is no breakdown by package and no chain from the entry point. Sizes, screens, shared chunks and round trips all still come out in full.`,
            fix: `Build with source maps — ${mono('sourcemap: true')} in Vite, ${mono('"sourceMap": true')} in Angular — and drop the folder again; they do not have to be deployed. On Angular 17 or later, dropping the ${mono('stats.json')} from ${mono('ng build --stats-json')} alongside gives the same thing without building twice.`,
        }),
        splitDrift: (d: {
            percent: number;
            off: number;
            high: boolean;
            chunks: number;
            file: string;
            measured: string;
        }) => ({
            chip: 'the breakdown does not add up to the file',
            title: `The per-file breakdown adds up to ${d.percent} % of what the chunks it describes weigh`,
            body: `There are two measurements of the same chunk and they are supposed to agree: what the file weighs (${d.file}) and what the per-file weights inside it add up to (${d.measured}), over ${d.chunks === 1 ? '1 chunk' : `${d.chunks} chunks`}. They do not, so what the ${mono('stats.json')} says is inside a chunk is not an account of the file being served. <strong>Why they differ cannot be told from here</strong> — something changed the output after it was written — and it does not have to be known to read the consequence. The figures above — the bootstrap, each screen, the round trips — come from the file and are exact. The ones measured <strong>inside</strong> a chunk — the breakdown by package, the exclusive column, what a ${mono('--what-if')} would save — come from this sum, so they read ${d.off} % ${d.high ? 'high' : 'low'}.`,
            fix: `Build with source maps — ${mono('"sourceMap": true')} in Angular, ${mono('sourcemap: true')} in Vite — and drop the folder: with ${mono('.map')} files the split is measured on the generated file itself and this difference goes away. They do not have to be deployed. Until then, read those figures as an upper bound: the order of the list is right — all of them are inflated by the same ratio — and the absolute number is not.`,
        }),
        sourceMaps: (d: { count: number }) => ({
            chip: 'source maps in the folder',
            title: `The build folder carries ${d.count === 1 ? '1 source map' : `${d.count} source maps`}`,
            body: 'A source map reconstructs your source from the compiled output. It does not weigh on the download — the browser only asks for it if you open the tools — but if this is the folder you deploy, anybody who knows the URL has your code.',
            fix: `With ${mono('"sourceMap": { "scripts": true, "hidden": true }')} they are generated without being linked from the bundle, which is what you want in order to upload them to your error tool. The bundle no longer linking them does not stop the server from serving them: if the .map files end up on the server, they are still there for whoever knows the URL.`,
        }),
        clean: (d: { unit: string }) => ({
            chip: 'no signals',
            title: 'Nothing stands out in the breakdown',
            body: `No disproportionate shared chunks, no heavy bootstrap packages with few consumers, no package shipped twice. Figures are ${d.unit}.`,
            fix: 'Save this as your baseline and compare it on the next release. From here on, what to watch is that the figure does not grow.',
        }),

        // --- what the same graph already knew (IDEAS §A) ---
        mixedImport: (d: { count: number; name: string; size: string; inBoot: boolean; list: string }) => ({
            chip: 'imported both statically and dynamically',
            title:
                d.count === 1
                    ? `${d.name} is imported both ways: the import() defers nothing`
                    : `${d.count} modules (${d.size}) are imported statically and dynamically at once`,
            body: `Somebody wrote an ${mono('import()')} believing it deferred that module, and another file imports it statically, so it travels with whoever imports it anyway.${
                d.inBoot ? ' And it lands in the bootstrap, so everybody downloads it before seeing anything.' : ''
            } This is the classic silent failure of code splitting and no analyser shows it, because they all look at chunks and this lives on the edges of the graph. Each module with what imports it statically: ${d.list}.`,
            fix: `The ${mono('import()')} buys nothing while a static import of the same module is left. Find that import — often it is a type, and then ${mono('import type')} is enough, since it disappears at compile time — or a lone constant that could be duplicated. If the static import is genuinely needed, drop the dynamic one: it reads as a saving that does not exist.`,
        }),
        ownBarrel: (d: {
            count: number;
            name: string;
            pulls: number;
            size: string;
            importers: string;
            list: string;
        }) => ({
            chip: 'barrel file of your own in the bootstrap',
            title:
                d.count === 1
                    ? `${d.name} brings ${d.pulls} files (${d.size}) into the bootstrap`
                    : `${d.count} barrel files of yours put code in the bootstrap; the worst is ${d.name} with ${d.size}`,
            body: `An ${mono('index.ts')} re-exporting a whole folder comes in whole: whoever imports one function gets everything the barrel names, because nothing downstream can tell which one was wanted. It is imported by ${d.importers || 'bootstrap code'}. The figure is the <strong>exclusive</strong> weight: what has no other way in. ${d.list}.`,
            fix: `Import from the actual file (${mono("from '@app/shared/format-money'")}) instead of the folder root. It is the cheapest fix in this report and the one least often done, because the barrel is convenient to write. If the barrel is the public API of an internal library, keep it for the outside and have the code inside import directly.`,
        }),
        packageBarrel: (d: {
            count: number;
            name: string;
            files: number;
            entryPoints: number;
            size: string;
            importers: string;
            list: string;
        }) => ({
            chip: 'package that comes in whole',
            title: `${d.name} ships ${d.files} files (${d.size}) and only ${d.entryPoints === 1 ? 'one of them is' : `${d.entryPoints} of them are`} imported from outside`,
            body: `The metafile records which file of a package something outside it imported, so ${mono('lodash/debounce')} and ${mono('lodash')} are told apart without guessing. Here ${d.files} files come in through ${d.entryPoints === 1 ? 'a single door' : `${d.entryPoints} doors`}. Imported by ${d.importers || 'another dependency'}. What <strong>cannot</strong> be said from here is how much of what arrived is used: that would need the symbol table, and this tool does not invent figures. ${d.list}.`,
            fix: `Import the submodule instead of the root (${mono("from 'lodash/debounce'")}, ${mono("from 'date-fns/format'")}) and measure again: the difference between the two measurements is the only honest figure for the saving. If the package publishes no submodules, check whether it ships an ES modules build or whether an alternative does.`,
        }),
        cycles: (d: {
            files: number;
            folders: number;
            worst: string;
            inBoot: boolean;
            folderList: string;
            fileList: string;
        }) => ({
            chip: 'import cycles',
            title:
                d.folders > 0
                    ? `${d.folders} cycle${d.folders > 1 ? 's' : ''} between folders of yours: ${d.worst}`
                    : `${d.files} import cycle${d.files > 1 ? 's' : ''} between files of yours`,
            body: `A cycle lengthens import chains — the round trips this report already counts — and blocks tree-shaking, because the bundler cannot prove which half of the loop is needed first.${
                d.inBoot ? ' At least one of them is in the bootstrap.' : ''
            } It is one of the few things about architecture that can be <strong>measured</strong> rather than argued about, and it comes out of the same graph as the bytes.${
                d.folderList ? ` Between folders: ${d.folderList}.` : ''
            }${d.fileList ? ` Between files: ${d.fileList}.` : ''}`,
            fix: `A cycle breaks at its odd import, and there is almost always exactly one: a lower layer importing a type or a constant from an upper one. If it is a type, ${mono('import type')} cuts it without moving anything. If it is not, that shared constant belongs in a third file neither of them owns. The folder version is the one worth turning into a lint rule, because it survives renames.`,
        }),
        paidTwice: (d: { count: number; size: string; list: string }) => ({
            chip: 'bytes paid for twice',
            title: `${d.size} of the bundle is the same module copied into several chunks`,
            body: `Different from a package shipped in two versions, which the report names separately: here both copies are the same code byte for byte, and the split put it in two places because two sets of screens reach it and neither contains the other. ${d.count === 1 ? 'One module' : `${d.count} modules`}: ${d.list}.`,
            fix: `If the two copies land in chunks that download together, there is nothing to win. Otherwise the module goes into one shared chunk both import: ${mono('manualChunks')} in Rollup and Vite, or in general importing it from one common place instead of from both. Check the compressed size first: a repetitive module copied twice compresses far better than this figure suggests.`,
        }),
        twinScreens: (d: { count: number; a: string; b: string; pct: number; apart: string; list: string }) => ({
            chip: 'twin screens',
            title: `${d.a} and ${d.b} share ${d.pct} % of what they load`,
            body: `Only ${d.apart} separates the two. Either a shared chunk is missing — the same code copied into both — or they are one screen written twice. ${d.count === 1 ? '' : `There are ${d.count} such pairs: ${d.list}.`}`,
            fix: 'Check first whether they really are two screens. If they are and their code is nearly the same, one is usually a variant of the other and the two fit in one route with a parameter. If they are genuinely different and what they share is infrastructure, the bundler should be pulling a common chunk out: check whether a barrel file is preventing it.',
        }),
        theirs: (d: { pct: number; theirs: string; yours: string; list: string }) => ({
            chip: 'whose first load this is',
            title: `${d.pct} % of your first load is code you did not write`,
            body: `${d.theirs} of packages against ${d.yours} of your own code. It is not a fault: a framework is somebody else's code too. What it changes is where to look, because "optimise my code" and "review my dependencies" are different weeks of work and the kilobytes are usually in the second. ${d.list}.`,
            fix: 'Before touching anything of yours, go down that list with the exclusive-weight column in front of you: it is the only one that says what each package really costs. A package whose exclusive weight is a fraction of its total shares nearly everything with something else, and removing it saves less than it looks.',
        }),

        // --- what the folder holds and nobody read (IDEAS §C) ---
        fonts: (d: {
            families: number;
            files: number;
            size: string;
            superseded: string;
            preloaded: string;
            list: string;
        }) => ({
            chip: 'fonts',
            title:
                d.superseded === ''
                    ? `${d.size} of fonts: ${d.files} files across ${d.families} ${d.families === 1 ? 'family' : 'families'}`
                    : `${d.size} of fonts, and some of them ship twice in two formats`,
            body: `No bundle analyser shows this, because they all stop at the JavaScript, and seven weights of one family to use two is a three-hundred-kilobyte finding. ${d.list}.${
                d.superseded ? ` In a format another file in the same folder already supersedes: ${d.superseded}.` : ''
            }${d.preloaded ? ` The page preloads ${d.preloaded}, so those are part of the first load.` : ''}`,
            fix: `Count the weights the interface actually uses — usually two, regular and bold — and drop the rest from the font configuration. Where a ${mono('.woff2')} sits next to a ${mono('.ttf')} of the same face, the second is only wanted by a browser nobody runs any more: take it out of the format list. And preload only what is needed before the first paint: one ${mono('preload')} per weight turns the whole list into first-load bytes.`,
        }),
        media: (d: {
            count: number;
            size: string;
            inPage: number;
            outdated: number;
            outdatedList: string;
            list: string;
        }) => ({
            chip: 'images and video',
            title: `${d.size} across ${d.count} image or video ${d.count === 1 ? 'file' : 'files'}${d.inPage > 0 ? `, ${d.inPage} of them asked for by the page` : ''}`,
            body: `Nothing here is recompressed: promising "this would be 310 kB in AVIF" would be inventing a figure. What is said is what it weighs, what format it arrives in, and whether ${mono('index.html')} asks for it up front.${
                d.outdated > 0
                    ? ` ${d.outdated === 1 ? 'One file arrives' : `${d.outdated} files arrive`} in an old format with the modern one sitting in the same folder: ${d.outdatedList}.`
                    : ''
            } ${d.list}.`,
            fix: `The duplicate-format half can be stated outright: where the modern file is already in the folder, the old one is only asked for by a browser hardly anybody runs, and it is served with a ${mono('<picture>')} or by letting the server negotiate. For the rest, measure before converting: a screenshot and a photograph do not gain the same, and an image the page asks for up front costs more in time-to-paint than it does in the total.`,
        }),
        duplicateAssets: (d: { count: number; size: string; list: string }) => ({
            chip: 'the same file under two names',
            title: `${d.size} in ${d.count === 1 ? 'a file that ships' : `${d.count} files that ship`} twice under different names`,
            body: `The content is identical byte for byte — it was compared, not assumed from the size — and they are still separate cache entries, so a visitor downloads both. ${d.list}.`,
            fix: 'Almost always the same asset imported from two places by different paths, or a copy left over from a migration. Unify the import and delete the copy. If the build generates both names, check whether a plugin is copying the assets folder as well as processing it.',
        }),
        unreferencedAssets: (d: { count: number; size: string; list: string }) => ({
            chip: 'files nothing reaches',
            title: `${d.size} in ${d.count === 1 ? '1 file named by' : `${d.count} files named by`} neither the HTML, nor the CSS, nor any chunk`,
            body: `The same idea as the unreachable-chunks signal, one level further out: every file name was searched for in the text of the others, and these appear in none of them. A folder nobody cleans usually holds megabytes of previous deploys. ${d.list}.`,
            fix: `Before deleting anything, keep in mind what this search cannot see: a path built at run time (${mono('/assets/ + name + .png')}), a file the service worker asks for, or something the server references rather than the bundle. What is left after discarding those is leftovers: clean the folder before building, because they take space on the server and skew any measurement of the folder.`,
        }),
        inlinedData: (d: { count: number; size: string; types: string; list: string }) => ({
            chip: 'files embedded as data URIs',
            title: `${d.size} of the bundle is really ${d.count === 1 ? 'one file embedded' : `${d.count} files embedded`} as a data URI`,
            body: `The compiler inlines whatever falls under a threshold, and forty small icons add up. Those bytes are not cached separately, cannot be deferred and appear in no asset list: they are hidden inside the figure that matters most. Types found: ${d.types}. ${d.list}.`,
            fix: `Lower the bundler's inline threshold (${mono('build.assetsInlineLimit')} in Vite, ${mono('assetsInlineLimit')} in Angular) so those files come out separately and cache on their own. With icons, what usually pays off is an SVG sprite or an icon font instead of forty data URIs. And keep in mind that base64 adds about a third to the size of the original file.`,
        }),

        // --- what the update costs, not the first visit (IDEAS §D) ---
        updateWeight: (d: {
            size: string;
            fresh: string;
            pct: number;
            reused: number;
            count: number;
            list: string;
            removed: string;
            roots: number;
            rootSize: string;
            carried: number;
            carriedSize: string;
            rootList: string;
            /** What the five questions said about how often this gets paid. */
            exposure: 'high' | 'moderate' | 'low' | 'unknown';
            /** Invalidations per person per week. `null` while the two answers behind it are missing. */
            perWeek: number | null;
        }) => ({
            chip: 'weight of the update',
            title: `Somebody who already had the previous version downloads ${d.size} (${d.pct} % of the build)`,
            body: `This is the half of the real cost nobody looks at: almost every visit to a running application is somebody who already had yesterday's version, and what they download is not the bundle, it is whatever changed name. A first visit downloads ${d.fresh}. ${d.reused} files keep their name and are not asked for again. ${d.count} change or arrive: ${d.list}.${d.removed ? ` And ${d.removed} are gone.` : ''}${
                d.carried > 0 && d.roots > 0
                    ? ` <strong>Of the ones that changed, ${d.roots === 1 ? 'only 1 names' : `only ${d.roots} name`} no other file that also changed (${d.rootSize}): ${d.rootList}.</strong> That is where the edit landed. ${d.carried === 1 ? 'The other one carries' : `The other ${d.carried} carry`} the hashed name of one of those inside, so ${d.carried === 1 ? 'its hash' : 'their hashes'} moved without their content having to: ${d.carriedSize} of cascade. Without it this deploy would have cost ${d.rootSize}.`
                    : d.carried > 0
                      ? ` <strong>Which of them the edit landed in cannot be told from here.</strong> Every file that changed carries the hashed name of another one that also changed, so the naming graph among them closes on itself and there is no file left whose hash can only have moved for its own sake. That is not a gap in the reading, it is the shape: it is what a hub the lazy chunks import back from looks like, which is the default layout in Vite and Rollup and what the cascade signal below measures. So the ${d.carriedSize} is one deploy's cost and the split into the edit and its consequence is unavailable — which is not the same as the edit being nothing.`
                      : ''
            }`,
            fix: `The hashed name is what decides: a file that keeps its name is a file the browser does not request. When the share is high it is almost always because a chunk mixes ${mono('node_modules')} with your own code — dependencies do not change for months, your code changes daily, and one file holding both is invalidated whole every day. The signal next to this one says which. If your build does not hash its names at all, this figure is the whole build and that is the thing to fix before anything else here.${d.carried > 0 ? ' The cascade part is a different thing and does not respond to the same fix: the bundler writes the hashed name of every chunk into the one importing it, so this is not something you did wrong, it is how the specifiers are emitted. It is attacked by moving the specifiers out of the JavaScript (import maps) or by breaking up the chunk acting as the hub, and the second is paid for with a bigger first load. Both figures are above precisely so you decide, because they pull in opposite directions.' : ''} ${
                d.exposure === 'unknown'
                    ? `<strong>This signal stays informative on purpose.</strong> Whether ${d.pct} % is expensive or irrelevant is decided by two facts neither the build nor the folder can supply: how often you deploy, and what share of the people opening the app tomorrow had it open today. With daily deploys and an audience that returns every morning this is the most expensive line in the report; with a quarterly release to first-time visitors it does not matter. Both are in the situation tab of the page, and in the ${mono('situation')} block of ${mono('loadline.json')} for the command. Answering them is what gives this number a colour.`
                    : d.exposure === 'high'
                      ? `<strong>And now there is something to price it with.</strong> Going by the answers about the situation, one person pays this ${d.perWeek === null ? 'several times a week' : `${formatCount(d.perWeek)} times a week`}: ${d.pct} % of the build, at that rate, each. That is what makes this one of the expensive lines in the report, and why it has stopped being informative.`
                      : d.exposure === 'moderate'
                        ? `Going by the answers about the situation, one person pays this ${d.perWeek === null ? 'now and then' : `${formatCount(d.perWeek)} times a week`}. It is neither the dearest line in the report nor free, so the signal stays informative — now for a reason somebody can read, rather than for lack of data.`
                        : `Going by the answers about the situation, one person pays this ${d.perWeek === null ? 'very rarely' : `${formatCount(d.perWeek)} times a week`}: at that rate ${d.pct} % is a true and unimportant number, because nearly everybody opening the application downloads all of it anyway. The cost is still computed and still here; it is not where your problem is.`
            } And there is one more premise this number takes for granted: a warm cache and ${mono('immutable')}. That is only checkable by measuring, in the Measured tab; until then, read it as unverified.`,
        }),
        unstableChunk: (d: {
            count: number;
            name: string;
            pct: number;
            size: string;
            inBoot: boolean;
            list: string;
        }) => ({
            chip: 'chunk mixing what changes with what does not',
            title:
                d.count === 1
                    ? `${d.name} is ${d.pct} % third-party code and is invalidated by every change of yours`
                    : `${d.count} chunks mix dependencies with your own code: ${d.size} is re-invalidated on every deploy`,
            body: `Dependencies do not change for months and your code changes daily. A chunk holding both gets a new hash every time you touch a line, and everything third-party inside it is downloaded again for nothing.${
                d.inBoot ? ' And it is in the bootstrap, so every returning visit pays for it.' : ''
            } ${d.list}.`,
            fix: `Split them: in Rollup and Vite with a ${mono('manualChunks')} rule sending everything from ${mono('node_modules')} to its own chunk. Angular already does this by default, so if something shows up here, look for a static import dragging a dependency into a chunk of yours. Watch the opposite extreme: one enormous vendor chunk is invalidated whole when a single library is updated, so what is wanted is a split by how often things change, not by where they came from.`,
        }),
        unhashable: (d: { count: number; inPage: number; size: string; query: string; list: string }) => ({
            chip: 'names that cannot be cached',
            title:
                d.query === ''
                    ? `${d.count} ${d.count === 1 ? 'file carries' : 'files carry'} no hash in the name`
                    : `Some files carry the version in the query (${d.query}): they revalidate on every visit`,
            body: `A file without a hash in its name cannot be cached for good: the browser has to ask whether it changed on every visit, and that question costs a round trip even when the answer is no. ${d.inPage > 0 ? `${d.inPage} of them are asked for by the page itself (${d.size}).` : 'None of them is asked for by the page itself.'} ${d.list}.`,
            fix: `Almost always informative: a ${mono('favicon.ico')} or a ${mono('manifest.webmanifest')} carry no hash and do not need one. When it fires on something large the page asks for, hash the name in the build configuration. The version-in-the-query case (${mono('?v=3')}) is the one that is nearly always a mistake: it changes the URL of every file at once on every deploy, which is the opposite of what a per-file hash does.`,
        }),

        // --- what reading the text of the build says (IDEAS §F) ---
        secrets: (d: { count: number; serious: number; kinds: string; list: string }) => ({
            chip: 'secrets or internal addresses in the bundle',
            title:
                d.serious > 0
                    ? `${d.serious === 1 ? 'A string shaped like a credential ships' : `${d.serious} strings shaped like credentials ship`} in the bundle`
                    : `${d.count} ${d.count === 1 ? 'match' : 'matches'} for a secret or an internal address in the bundle`,
            body: `Every pattern here identifies a specific format by its own prefix and length — ${mono('AKIA')} plus sixteen characters is an AWS key and nothing else — deliberately: there is no rule for "a long string near the word key", which is the one that finds the real ones and also a hundred minified variable names. Kinds: ${d.kinds}. Nothing is printed whole: this report gets pasted into issues, and a tool that prints a live credential in full has published it a second time. ${d.list}.`,
            fix: `If any of them is real, the first move is to <strong>rotate</strong> it, not to delete it from the code: what is deployed is already in the hands of anybody who knows the URL, and taking it out of the next build revokes nothing. Then look at how it got in: almost always a ${mono('.env')} the bundler inlines because the variable does not start with the framework's public prefix, or a configuration constant holding the server key instead of the client one. An internal address is not a credential, but it is topology: it says what is inside and what it is called.`,
        }),
        devLeftovers: (d: { count: number; broken: boolean; unattributed: boolean; list: string }) => ({
            chip: d.unattributed ? 'development markers in the build' : 'development leftovers in production',
            title: d.broken
                ? 'This is a development build, so the rest of this report does not describe what gets deployed'
                : d.unattributed
                  ? `${d.count === 1 ? 'One development marker' : `${d.count} development markers`} in the build, author unknown`
                  : `${d.count === 1 ? 'One development leftover' : `${d.count} development leftovers`} in the build`,
            body: `${
                d.broken
                    ? 'The development build of a library is not minified, carries its warnings inside it and weighs several times what the production one does. Before reading any figure here: this is not the folder that gets deployed, or the pipeline is building with the wrong configuration.'
                    : d.unattributed
                      ? `These chunks carry no source map, so the position of each match cannot be traced back to the file it was written in — and a ${mono('console.log')} of yours looks exactly like the one inside ${mono('@angular/core')}, which ships a console service and puts one in every Angular build there is. The matches are real; whose they are is not known here.`
                      : 'None of these breaks anything on its own, but every one of them is something nobody meant to deploy. Each one was traced through the source maps to a file of yours, so none of them is your framework’s.'
            } ${d.list}.`,
            fix: d.broken
                ? 'The fix comes before everything else: build with the production configuration and measure again, because no figure in this report describes what your users download.'
                : d.unattributed
                  ? 'Nothing to do on this alone. To find out whether any of them is yours, build once with source maps on: the same report then counts only the matches that come from your own files. Where they turn out to be yours, the minifier’s drop option removes them.'
                  : `With test files inside, look at the build globs: almost always an ${mono('include')} that is too wide. And ${mono('console.log')} calls are cheap noise to remove with the minifier's drop option.`,
        }),
        sourceExposed: (d: { files: number; maps: number; env: number; list: string }) => ({
            chip: 'your source code is published',
            title: `${d.files} files of your source can be reconstructed from the ${d.maps} source maps in this folder`,
            body: `The report already said the ${mono('.map')} files are here, and that sentence gets ignored because it sounds like a configuration nicety. This is the same fact put in a way that cannot be: the maps carry the original text inside them, so anybody who knows the URL has your files, your internal paths and your comments.${d.env > 0 ? ` Inside them are ${d.env} references to environment variables.` : ''} Paths: ${d.list}.`,
            fix: `If this is the folder you upload, either do not deploy the maps or generate them with ${mono('"sourceMap": { "scripts": true, "hidden": true }')} and upload them only to your error tool. Keep in mind that no longer linking them from the bundle does not stop the server from serving them: if the files end up on the server, they are still there. And if this is a local folder, there is nothing to fix; the report cannot tell the two apart, so it says so rather than accusing.`,
        }),
        thirdParty: (d: { count: number; size: string; total: string; list: string }) => ({
            chip: 'third-party services',
            title: `${d.size} of your first load is analytics, ads, support chat or error capture`,
            body: `${d.count} packages that are neither yours nor your framework's, ${d.total} in total counting what sits outside the first load. The list comes from a catalogue of names embedded in the tool — about sixty lines — and not from asking anybody: querying the npm registry would mean sending the dependency list of a private application out to the network. That is why it is deliberately incomplete and updatable in one commit. ${d.list}.`,
            fix: `This is the list somebody takes to the meeting where it is decided whether the session recorder stays. What is worth checking about each is whether it is needed before the first paint: almost none of them is, and almost all of them offer a way to load late — an ${mono('async')} script, a deferred import behind the cookie banner. Moving one out of the first load does not change what it does, only what it costs.`,
        }),
        licences: (d: { count: number; worst: string; list: string; permissive: string }) => ({
            chip: 'licences with conditions',
            title: `${d.count === 1 ? 'One licence with conditions ships' : `${d.count} licences with conditions ship`} in the build, the strictest ${d.worst}`,
            body: `It comes from the legal comments the bundle carries inside it: minifiers keep those on purpose, so this needs neither ${mono('node_modules')} nor the network. ${d.list}.${d.permissive ? ` There are permissive ones too: ${d.permissive}.` : ''} <strong>Coverage is partial</strong>, and it is worth saying so plainly: a package whose licence is not in a comment does not appear here, and that does not mean it is not there.`,
            fix: `This is a question that gets asked in a company and today gets answered by hand. For the complete list the ${mono('package.json')} files under ${mono('node_modules')} have to be read, which is what ${mono('license-checker')} does; this gives the part that actually ships in the bundle, which is usually the half that matters. Strong copyleft in a distributed web application carries real conditions: check it before it reaches production, not after.`,
        }),

        // --- what the lock file and the audit say, crossed with what ships (IDEAS §37) ---
        vulnerable: (d: {
            shipped: number;
            total: number;
            inBoot: number;
            worst: string;
            list: string;
            elsewhere: string;
        }) => ({
            chip: 'vulnerabilities that actually ship',
            title:
                d.inBoot > 0
                    ? `${d.inBoot} of your ${d.total} vulnerabilities are in the first load and everybody downloads them`
                    : `${d.shipped} of your ${d.total} vulnerabilities really do ship in the bundle`,
            body: `"You have ${d.total} vulnerabilities" is noise; this is the actionable part of it. Neither the audit nor this report can say it alone: one knows which ones exist and nothing about what a browser downloads, the other the other way round. ${d.list}.${
                d.elsewhere
                    ? ` The ones that do not ship — real, and not what anybody downloads — are ${d.elsewhere}.`
                    : ''
            } None of this went out to the network: both files are ones you dropped.`,
            fix: "Start with the ones in the first load, where the cost is everybody's. Keep in mind what is <strong>not</strong> checked here: an advisory is attributed to a package by name, not by version range, because doing that properly needs a semver implementation and being approximately right about whether somebody is vulnerable is worse than being explicit about what is known. Check the version you have against the advisory's range before acting.",
        }),
        transitive: (d: { count: number; size: string; worst: string; worstSize: string; list: string }) => ({
            chip: 'packages you did not ask for',
            title: `${d.size} of the bundle is packages that are not in your package.json; the largest is ${d.worst} at ${d.worstSize}`,
            body: `The lock file turns "who brings this in" from a guess into an answer: each one comes with the dependency chain that pulls it. Being transitive is not a problem in itself — that is how npm works — but it changes the fix: aligning your ${mono('package.json')} moves nothing, and what is needed is a forced resolution or dropping the dependency that asks for it. ${d.list}.`,
            fix: `Where one weighs enough to matter, read the chain: there is usually an intermediate package with a lighter alternative, or a newer version that no longer drags it in. When the thing pulling it is a dependency you are not going to change, the way out is ${mono('pnpm.overrides')}, ${mono('overrides')} (npm) or ${mono('resolutions')} (yarn) — and then checking the application still works, because forcing a resolution is exactly overriding what that dependency asked for.`,
        }),

        // --- against a baseline ---
        bootGrew: (d: { diff: string; pct: number; before: string; after: string; baseline: string }) => ({
            chip: 'bootstrap has grown',
            title: `The bootstrap has grown ${d.diff} (${d.pct} %) since the baseline`,
            body: `Before ${mono(d.before)}, now ${mono(d.after)}. Every load of the app pays for it, whatever screen it lands on. Baseline: ${mono(d.baseline)}.`,
            fix: 'Check the bootstrap tab for packages that are new or have grown. If the growth comes from a new feature only one screen uses, move it to that route’s providers.',
        }),
        bootNewPackages: (d: { count: number; list: string; baseline: string }) => ({
            chip: 'new package in the bootstrap',
            title:
                d.count === 1
                    ? 'A package has entered the bootstrap since the last measurement'
                    : `${d.count} packages have entered the bootstrap since the last measurement`,
            body: `Not in the bootstrap of ${mono(d.baseline)}, in it now: ${d.list}. Everyone downloads each of them before seeing anything.`,
            fix: 'Check who imports them (the “imported by” column of the bootstrap). If the consumer is a lazy screen, the registration belongs in that route’s providers, not in the bootstrap config.',
        }),
        screensGrew: (d: { count: number; top: string; diff: string; pct: number; list: string }) => ({
            chip: 'screen has grown',
            title:
                d.count === 1
                    ? `${d.top} has grown ${d.diff} (${d.pct} %) in what it loads beyond the bootstrap`
                    : `${d.count} screens have grown in what they load beyond the bootstrap; the most, ${d.top} (${d.diff}, ${d.pct} %)`,
            body: `Shared + own is compared, without the bootstrap, so a bigger bootstrap does not flag every screen at once. ${d.list}`,
            fix: 'Open the screen in its tab and see which chunk grew: if it is a shared one, the growth belongs to every screen loading it and is best dealt with there.',
        }),

        signalsChanged: (d: {
            fixed: number;
            added: number;
            fixedList: string;
            addedList: string;
            baseline: string;
        }) => ({
            chip: 'signals fixed and new',
            title:
                d.added === 0
                    ? `${d.fixed} signals have been fixed since ${d.baseline} and none have come in`
                    : `${d.fixed === 0 ? 'No signal was fixed' : `${d.fixed} fixed`} and ${d.added === 1 ? '1 new one' : `${d.added} new ones`} since ${d.baseline}`,
            body: `The bytes say whether the bundle grew; this says whether the work showed.${
                d.fixedList ? ` No longer raised: ${d.fixedList}.` : ''
            }${d.addedList ? ` New: ${d.addedList}.` : ''}`,
            fix: 'A signal that came in with this change is cheaper to look at now than in three weeks, when nobody remembers what introduced it. And if you fixed one, save this measurement as the baseline so the next comparison starts from here.',
        }),
        sharedGrew: (d: { count: number; total: number; diff: string }) => ({
            chip: 'shared chunk has grown',
            title: `${d.count} of your ${d.total} screens have grown by about the same (~${d.diff}): what grew is a shared chunk`,
            body: 'When almost every screen goes up by the same amount, the growth is not in the screens but in a chunk they all load. It downloads on practically every visit, even though the bundler classifies it as lazy.',
            fix: 'Go to the shared tab and open the near-global chunks: the new package or file will be inside one of them. If a single screen uses it, pull it out of there.',
        }),

        // --- project context ---
        budgetNotBuilt: (d: {
            config: string;
            figure: string;
            built: { name: string; error: string | null; warning: string | null }[];
        }) => ({
            chip: 'budget the pipeline never applies',
            title: `The strictest budget is in ${d.config} (${d.figure}), which the pipeline does not build`,
            body: `Angular only checks the <span class="mono">budgets</span> of the configuration it builds with. The pipeline builds ${d.built
                .map(item => {
                    if (item.error) {
                        return `${mono(item.name)} (error at ${item.error})`;
                    }
                    return item.warning
                        ? `${mono(item.name)} (warning only, at ${item.warning})`
                        : `${mono(item.name)} (no budget)`;
                })
                .join(', ')}. The ${mono(d.config)} budget never fires, even though it looks like it exists.`,
            fix: 'Move the budget to the build <span class="mono">options</span> of <span class="mono">angular.json</span>, which apply to every configuration, or copy it into the configuration the pipeline builds.',
        }),
        budgetNone: (d: { configs: string }) => ({
            chip: 'no size budget',
            title: 'No configuration declares a size budget for the bootstrap',
            body: `<span class="mono">angular.json</span> has no <span class="mono">budget</span> of type <span class="mono">initial</span> with a figure (${d.configs}). Nothing warns when the bootstrap grows.`,
            fix: 'Declare one in the build <span class="mono">options</span>, with a warning a little above the current bootstrap and an error you do not want to cross. What matters is that a budget exists, more than the exact figure.',
        }),
        budgetTooHigh: (d: { configs: string; count: number; error: string; boot: string; factor: number }) => ({
            chip: 'budget too high',
            title: `The ${d.configs} ${d.count === 1 ? 'budget is' : 'budgets are'} ${d.error} and the bootstrap weighs ${d.boot}: ${d.count === 1 ? 'it' : 'they'} cannot fire`,
            body: `That is more than ${d.factor} times the current bootstrap (JavaScript only, raw, which is what Angular measures). A budget like that watches nothing: the app would have to multiply its size to reach it.`,
            fix: 'Lower the error to something you do not want to cross (say 25 % above the current bootstrap) and the warning a little below. Raise it only when someone knowingly decides the bootstrap has to grow.',
        }),
        budgetWarnOnly: (d: { configs: string; count: number; warning: string }) => ({
            chip: 'budget that only warns',
            title: `The ${d.configs} ${d.count === 1 ? 'budget only warns' : 'budgets only warn'} (${d.warning}): the build never fails on size`,
            body: `${d.count === 1 ? 'It has' : 'They have'} <span class="mono">maximumWarning</span> but no <span class="mono">maximumError</span>. A warning does not stop the build: it only appears in the output, among the rest of the lines.`,
            fix: 'Add a <span class="mono">maximumError</span>. It is the only one that stops the pipeline and forces a decision.',
        }),
        zoneless: () => ({
            chip: 'no zone.js',
            title: 'The app does not use zone.js',
            body: 'Change detection runs on signals, not on cycles triggered from zone.js. That reduces the bootstrap weight and the work done at runtime.',
            fix: 'Keep in mind that material about “change detection cycles”, <span class="mono">NgZone</span> and <span class="mono">runOutsideAngular</span> does not apply to this project: there is nothing to change on that front.',
        }),

        cascadeShape: (d: {
            risk: 'low' | 'mid' | 'high';
            hub: string;
            names: number;
            named: number;
            size: string;
            chunks: number;
            /** How often the shape above actually gets paid for, as the five questions said. */
            exposure: 'high' | 'moderate' | 'low' | 'unknown';
            perWeek: number | null;
        }) => ({
            chip:
                d.risk === 'high'
                    ? 'hash cascade: high risk'
                    : d.risk === 'low'
                      ? 'hash cascade: low risk'
                      : 'hash cascade: medium risk',
            title:
                d.risk === 'high'
                    ? `${d.hub} names ${d.names} chunks and is imported by ${d.named}: touching any leaf moves the whole build`
                    : d.risk === 'low'
                      ? `The names are concentrated in ${d.hub}, which weighs ${d.size}: the cascade barely travels`
                      : `The names are spread about: ${d.hub} carries the most, ${d.names} of ${d.chunks}`,
            body: `A bundler writes the hashed name of every chunk it imports inside the importing chunk, so a change travels along those edges. What decides how far it travels is not which bundler it is, it is the topology — which is why this is measured rather than quoted. ${
                d.risk === 'low'
                    ? `Here ${mono(d.hub)} weighs ${d.size} and holds ${d.names} names: that is the <em>runtime chunk</em> shape, which is exactly what webpack does and what largely avoids the problem. <strong>With a footnote that usually gets dropped:</strong> that chunk changes on every deploy, so it has to be tiny and inlined into the HTML. Served as a separate cacheable file, the cost is kept and the benefit is lost.`
                    : d.risk === 'high'
                      ? `Here ${mono(d.hub)} names ${d.names} of the build's ${d.chunks} chunks <strong>and</strong> is imported by ${d.named}: that is the hub-and-spoke shape. Change a leaf → the hub changes → everything importing the hub changes, which here is nearly everything. It does not grow with depth: it jumps.`
                      : `Here no single file concentrates the names: ${mono(d.hub)} names ${d.names} of ${d.chunks}. A change travels, but it does not reach the whole build.`
            }`,
            fix: `${
                d.risk === 'low'
                    ? `Check that ${mono(d.hub)} is inlined into ${mono('index.html')} rather than served as a separate hashed file: that is the only thing to watch in this shape.`
                    : 'Every way out has a price and none is automatic: import maps move the specifiers into the HTML (at the cost of an uncacheable HTML, which it usually already is), breaking the hub with <span class="mono">manualChunks</span> is paid for with a bigger first load — Rollup’s own documentation says so — and compression dictionaries make the re-download cheap rather than rarer.'
            } And one citation worth reading in full: tooling.report's tests say Rollup should not have this problem, and they cover a two-level case. A real application with one shared chunk every route imports fails all the same. The citation is correct and does not mean what it looks like.${
                d.exposure === 'unknown'
                    ? ' What is not said here is whether this shape matters: that depends on how often you deploy and how many people come back, which are two of the five questions about the situation. Until they are answered, the topology is shown and the colour withheld.'
                    : d.exposure === 'high'
                      ? ` And going by the answers about the situation, this shape is paid for ${d.perWeek === null ? 'several times a week' : `${formatCount(d.perWeek)} times a week`} per person, which is what takes it out of being a topological curiosity.`
                      : d.exposure === 'moderate'
                        ? ` Going by the answers about the situation, this shape is paid for ${d.perWeek === null ? 'now and then' : `${formatCount(d.perWeek)} times a week`} per person: a real cost, and not the largest one you have.`
                        : ` Going by the answers about the situation, this shape is barely paid for: ${d.perWeek === null ? 'you deploy rarely, or few people come back' : `it works out at ${formatCount(d.perWeek)} times a week per person`}. The topology is what it is, and it is worth knowing before the deploy cadence changes.`
            }`,
        }),

        // --- where the first load comes from ---
        assetOrigin: (d: AssetOriginData) => ({
            chip: 'assets served from another host',
            title:
                d.origins.length === 1
                    ? `${d.scripts} JavaScript files of the first load are served from ${d.origins[0]}, not from the page's own origin`
                    : `The JavaScript of the first load is spread across ${d.origins.length} hosts that are not the page's own`,
            body: `${d.origins.map(origin => mono(origin)).join(', ')} — ${d.scripts} JavaScript files and ${d.files} files in total. Before the first byte of the first chunk there is a DNS lookup, a TCP connection and a TLS handshake against that host (or a QUIC handshake), and that is time no weight figure in this report can see: the round-trip count starts once the connection already exists.${
                d.base
                    ? ` There is also a ${mono('<base href>')} pointing at ${mono(d.base)}, so this is not one stray file: every relative URL of the page resolves there.`
                    : ''
            } And it cuts the other way, which belongs in the same sentence: under HTTP/1.1 a second origin is a second pool of six connections, so the same decision that adds a handshake takes away queueing.`,
            fix:
                d.cold.length > 0
                    ? `Not warmed: ${d.cold.map(origin => mono(origin)).join(', ')}. A ${mono('<link rel="preconnect">')} in the ${mono('<head>')} pays that handshake while the browser is still parsing the page, rather than when it discovers the first chunk. It is one tag and it changes nothing about the split. Sparingly: every open connection competes for the same bandwidth, so past two or three warmed origins it stops helping.${
                          d.warmed.length > 0
                              ? ` Already done for ${d.warmed.map(origin => mono(origin)).join(', ')}.`
                              : ''
                      }`
                    : `The page already warms those origins with ${mono('preconnect')} or ${mono('dns-prefetch')}, which is what can be done without moving the files. There is nothing else to fix here: it stays as context for reading the round-trip count, which does not include the handshake.`,
        }),

        // --- what is served, against what was built ---
        servedUncompressed: (d: { count: number; size: string; ratio: number | null; list: string }) => ({
            chip: 'JavaScript served uncompressed',
            title:
                d.count === 1
                    ? `One JavaScript file (${d.size}) arrives uncompressed`
                    : `${d.count} JavaScript files (${d.size}) arrive uncompressed`,
            body: `The browser reports the encoded and decoded bodies at almost the same size, so no gzip and no brotli were involved: ${d.list}.${
                d.ratio ? ` The rest of the build does compress, at about ${d.ratio.toFixed(1)}:1.` : ''
            } A ${mono('.br')} sitting in the folder says what was <strong>built</strong>, not what is <strong>served</strong>: this is the second one, which is why no bundle analyser can see it.`,
            fix: 'This is server or CDN configuration, not the build: turn compression on for <span class="mono">application/javascript</span> and <span class="mono">text/javascript</span>. If the pipeline already emits <span class="mono">.br</span> and <span class="mono">.gz</span>, what is missing is the content negotiation that serves them. It is worth more than any chunk-splitting item on this list.',
        }),

        // --- the computation against the waterfall ---
        measuredWaves: (d: {
            computed: number;
            measured: number;
            screen: string;
            widest: number;
            queued: boolean;
            list: string;
        }) => ({
            chip: d.measured > d.computed ? 'more batches than computed' : 'computed and measured agree',
            title:
                d.measured > d.computed
                    ? `The graph predicts ${d.computed} round trips for ${d.screen} and the browser took ${d.measured} batches`
                    : `The ${d.measured} batches measured opening ${d.screen} are the round trips the graph predicts`,
            body: `Measured batches, with how many files each brings and when it starts — ${d.list}. The widest brings ${d.widest} files. The computed figure is the bootstrap's depth plus the screen's, because they are sequential: the router cannot ask for a screen's chunk until the bootstrap holding it has arrived and run. <strong>A batch is not quite a round trip of the graph</strong>: the graph counts discovery — a chunk the browser cannot know about until it has parsed another — and a batch counts what happened, which also splits when the connection pool runs out.`,
            fix:
                d.measured > d.computed
                    ? `${
                          d.queued
                              ? 'The connection pool ran out during this load, so part of the difference is queueing rather than depth: under HTTP/1.1 the seventh file starts when the first finishes. '
                              : ''
                      }The rest is something the static import graph cannot see: a request made from code, a dynamic import that triggers another, or a redirect. Look at which files land in the extra batches — the graph does not predict them, and that is an answer about the computation, not about the build.`
                    : 'Nothing to fix. This is the validation that makes every other round-trip figure in the report believable: the static computation and the real waterfall say the same thing.',
        }),

        // --- the connection, observed ---
        poolExhausted: (d: { opened: number; lastAt: number | null; protocol: string }) => ({
            chip: 'the connection pool ran out',
            title: `The browser opened ${d.opened} connections for this load, over ${d.protocol}`,
            body: `Under HTTP/1.1 a browser keeps about six connections per origin, so the seventh request waits for an earlier one to finish.${
                d.lastAt === null ? '' : ` The last connection was opened at ${Math.round(d.lastAt)} ms.`
            } This is the HTTP/1.1 problem <strong>measured</strong> rather than inferred from the protocol: it is where a count of files turns into actual seconds.`,
            fix: 'What fixes this at the root is the protocol: over HTTP/2 or HTTP/3 one connection carries every request and the count stops costing this. While it stays on HTTP/1.1, fewer files in the first load really does help — and it is the one case in this report where merging chunks has a clear argument for it.',
        }),

        thirdPartyLoad: (d: {
            requests: number;
            total: number;
            origins: string;
            count: number;
            multiplexed: boolean;
            max: number;
        }) => ({
            chip: 'third-party requests in the same load',
            title: `${d.requests} of this load's ${d.total} requests go to ${d.count === 1 ? 'another host' : `${d.count} hosts`}`,
            body: `${d.origins}. This is the denominator the file count never had: ${d.max} JavaScript files means one thing on a page making thirty-odd requests and another on a page making a hundred and ten.${
                d.multiplexed
                    ? ' Over HTTP/2 and HTTP/3 third parties do not share the page’s connection, so each origin is a handshake of its own and multiplexing does not cover them.'
                    : ' Under HTTP/1.1 each origin also brings its own pool of six connections, which helps, and its own handshake, which does not.'
            }`,
            fix: 'This report is about your build and cannot decide for you which third parties are worth what they cost. What it does change is how to read the rest: the per-screen file threshold is only about your JavaScript, and this figure is the rest of the bill.',
        }),

        revalidated: (d: { revalidated: number; fromCache: number; network: number }) => ({
            chip: 'hashed files being revalidated',
            title: `${d.revalidated} files went back to the server instead of being served from the cache`,
            body: `Headers back and no body: that is a 304, and the round trip is paid all the same. In this load: ${d.fromCache} served from the cache without asking, ${d.revalidated} revalidated and ${d.network} downloaded in full. <strong>The whole update-cost section of this report assumes a warm cache and <span class="mono">immutable</span></strong>, and with revalidations that premise does not hold: the repeat-visit figures are optimistic then.`,
            fix: 'A file with a hash in its name can be served with <span class="mono">Cache-Control: public, max-age=31536000, immutable</span>. Without <span class="mono">immutable</span> the browser revalidates on reload however long the <span class="mono">max-age</span> is. It is a server or CDN header, and until it is set the repeat-visit analysis has to be read as unverified.',
        }),

        swControlling: (d: { caches: number }) => ({
            chip: 'a service worker controls this load',
            title: 'A service worker is in charge of the page',
            body: `Not shipped in the build: <strong>controlling</strong> this load${d.caches > 0 ? `, and it can see ${d.caches} caches` : ''}. It is worth saying what that softens and what it does not, because it is easy to read backwards: it softens <strong>only</strong> the repeat-visit analysis. A first visit pays the network in full and the worker's install downloads the whole precache on top, and with a hash cascade nearly every entry of the manifest changes on every deploy. A service worker does not make requests stop mattering: it <strong>raises</strong> the price of the cascade.`,
            fix: 'Nothing to change on account of this alone. Read it this way: the counting and round-trip signals hold exactly as written for a first-time visitor, and the figure that softens is the returning one. If the update cost in this report is high, a service worker makes it higher, not lower.',
        }),

        measuredOrigin: (d: { origins: string; count: number }) => ({
            chip: 'the code came from another host',
            title:
                d.count === 1
                    ? "This build's JavaScript was downloaded from another host"
                    : `This build's JavaScript was downloaded from ${d.count} hosts that are not the page's`,
            body: `${d.origins}, from the addresses the browser reported. This is stronger than reading it from ${mono('index.html')}: a page written entirely with relative URLs and served from a CDN names no other host anywhere in its markup, and its bytes still come from somewhere else. The bill is the same as the ${mono('index.html')} signal's — DNS, TCP and TLS before the first byte of the first chunk — and so is its good side under HTTP/1.1.`,
            fix: `If ${mono('index.html')} does not say this and the measurement does, the deployment is adding it: a path rewrite, an injected ${mono('<base href>')}, or the CDN itself. Worth knowing, because this report's round-trip count starts once the connection exists, and here it did not.`,
        }),

        // --- the channel, with its limits attached ---
        observedChannel: (d: ObservedChannelData) => ({
            chip: 'observed environment',
            title: `Measured ${d.protocol ? `over ${d.protocol}` : 'once'}${d.rttMs === null ? '' : `, at ${d.rttMs} ms round trip`}${d.takenAt ? ` on ${d.takenAt.slice(0, 10)}` : ''}`,
            body: `${d.protocol ? `Negotiated protocol: ${mono(d.protocol)}.` : 'The paste does not say which protocol.'}${
                d.mixed ? ` And not everything arrived the same way: ${d.mixed}.` : ''
            }${d.rttMs === null ? '' : ` Measured round trip: ${d.rttMs} ms, against the ${d.latencyMs} ms this report computes its seconds with.`}${
                d.ttfbMs === null
                    ? ''
                    : ` The document took ${d.ttfbMs} ms to give its first byte: that is wave zero, and the round-trip count starts after it.`
            }${d.modulepreloads === null ? '' : ` The page emits ${d.modulepreloads} ${mono('modulepreload')} tags.`}${d.timed ? '' : ' The paste carried no timings, so half the answer is missing here: no round trip, no batches, no connections opened. The snippet on this tab does ask for them.'} This describes <strong>the machine of whoever pasted the snippet</strong>, not your users'.`,
            fix: `${
                d.stale
                    ? `This measurement is more than ${d.freshDays} days old: take it again before resting anything on it. `
                    : ''
            }Not one of these figures moves a threshold in this report, deliberately. An ${mono('h3')} measured from one machine is systematically optimistic: a new visitor's first connection is usually ${mono('h2')}, because ${mono('Alt-Svc')} has to be cached first, and on corporate networks proxies that drop UDP degrade it wholesale. If you have RUM, the p75 distribution of protocol and latency comes from there and not from a console paste.`,
        }),

        // --- against a browser measurement ---
        measuredExtra: (d: MeasuredExtraData) => ({
            chip: 'measured above computed',
            title: `Opening ${d.screen} downloads ${d.diff} more than the computation says`,
            body: `Computed ${mono(d.computed)} across ${d.computedFiles} files; measured ${mono(d.measured)} across ${d.measuredFiles}. ${d.count} chunks download that the static import graph does not predict: ${d.list}.`,
            fix: 'The figure people actually pay is the measured one. Look at who owns those chunks: if they belong to another screen, something is loading them ahead of time; if they are not from this build, something is serving stale files.',
        }),
        measuredEager: (d: { screen: string; size: string; list: string }) => ({
            chip: 'the router loads an area the guard then rejects',
            title: `Opening ${d.screen} downloads ${d.size} belonging to other screens`,
            body: `Chunks only ${d.list} use are downloaded. Entering through the root, the router loads the area's chunk in order to match the route, and only afterwards does the guard check the session and redirect. By then it is already downloaded.`,
            fix: 'Make the check happen before the load: a <span class="mono">canMatch</span> guard discards the route without requesting its chunk, while a <span class="mono">canActivate</span> runs once it is already down. With canMatch that area stops being paid for on every start.',
        }),
        measuredShort: (d: { screen: string; count: number; size: string; list: string }) => ({
            chip: 'measured below computed',
            title: `${d.count} chunks of ${d.screen} are missing from the measurement (${d.size})`,
            body: `The computation counts them as downloaded and the browser never asked for them: ${d.list}. Usually the measurement was taken before the screen finished loading, or a chunk came from the cache without showing up in the list.`,
            fix: 'Measure again with the cache disabled and the screen already open. If they still do not download, that is code the router never gets to request.',
        }),
        measuredMatch: (d: { screen: string; size: string }) => ({
            chip: 'computed and measured agree',
            title: `What the browser downloads when opening ${d.screen} is what the computation says: ${d.size}`,
            body: 'The chunks downloaded are exactly the ones the import graph predicts. On this screen the computed figure does not fall short.',
            fix: 'Nothing to correct here. It is worth measuring again entering through the root rather than straight into the route: that is where the differences usually show up.',
        }),

        // --- what the team answered ------------------------------------------------------------
        /**
         * Each question as a clause, so it can be named inside a sentence. Not the question itself:
         * that lives in the tab, whole and with its options.
         */
        situationAsks: {
            navigation: 'how people move around the application',
            deploys: 'how often a new version reaches production',
            returning: 'how many of the people opening it had already opened it this week',
            connection: 'where they connect from and on what',
            priority: 'which is worse, a slow first screen or a slow move between screens',
        },
        situationAsked: (d: SituationAskedData) => ({
            chip: 'the situation, answered',
            title:
                d.perWeek === null
                    ? `${d.answered} of ${d.total} questions about the situation answered`
                    : `At ${formatCount(d.deploys ?? 0)} releases a week with ${pct(d.returning ?? 0)} of visitors returning, one person pays the update ${formatCount(d.perWeek)} times a week`,
            body: `This is <strong>declared</strong>: somebody answered it${d.by ? ` (${d.by})` : ''}${d.at ? `, on ${d.at}` : ''}. It is worth more than a guess and less than a measurement, which is why it never shares a sentence with something a browser reported.${
                d.perWeek === null
                    ? ' The two answers that turn an invalidation percentage into a cost are missing: how often you deploy, and how many people come back. Without both, the percentage stays as it is — shown in full, and with no colour claimed.'
                    : ` The figure above is a multiplication and it is shown whole on purpose: ${formatCount(d.deploys ?? 0)} releases a week × ${pct(d.returning ?? 0)} arriving with a warm cache. If it does not match your experience, the disagreement is with one of the two factors, and you can see which.`
            }${
                d.exposure === 'high'
                    ? ' <strong>At that rate the hash cascade really is paid for</strong>, and wherever this report measures one, it stops being shown as a fact with no colour.'
                    : d.exposure === 'moderate'
                      ? ' That is a middling rate: the cascade does get paid for, neither every week nor for nothing. The signals that measure it stay informative, now for a reason somebody can read rather than for lack of data.'
                      : d.exposure === 'low'
                        ? ' At that rate the cascade is barely paid for: nearly everybody opening the application downloads all of it anyway. The update-cost section is still there and still true; it is simply not the most expensive thing you have.'
                        : ''
            }${
                d.breadth === 'narrow'
                    ? ' And with single-screen sessions, a deferred chunk’s coverage means what it looks like it means: a chunk reaching half the application is downloaded by few people.'
                    : d.breadth === 'wide'
                      ? ' And with sessions that move around the application, a chunk shared by half of it is downloaded by nearly everybody: its coverage reads as startup weight, not as one screen’s weight.'
                      : d.breadth === 'mixed'
                        ? ' With two or three distinct profiles, the median screens per session describes none of them, and that is a fact too: the coverage figures in this report have to be read per profile.'
                        : ''
            }${d.rum ? ` You have RUM, so the fourth question is not answered from memory: the p75 of protocol and round trip comes from there. The latency this report turns bytes into seconds with is ${d.latencyMs} ms — swap it for yours if they differ.` : ''}`,
            fix: `${
                d.stale
                    ? `<strong>These answers are more than ${d.freshDays} days old.</strong> Deploy cadence is exactly what changes when a team moves to continuous delivery, and an answer from before that is a false fact with somebody’s name attached. Go through the questions again before trusting the figure. `
                    : ''
            }What these answers can do is <strong>raise</strong> a signal’s severity; what they cannot do is lower one. The asymmetry is deliberate, and it matters here more than anywhere else because this is the softest of the three kinds of evidence the report handles: if answering optimistically could switch signals off, the cheap way to get a clean report would be to answer optimistically. The most an optimistic answer buys is a paragraph saying the cost was worked out and came out small.${d.at ? '' : ' They need a date: without one there is no way to know when they stopped being true.'}`,
        }),
        situationPriority: (d: SituationPriorityData) => ({
            chip: 'which wait the team would rather pay',
            title:
                d.priority === 'firstScreen'
                    ? 'Answered: the first screen matters more than moving between screens'
                    : d.priority === 'navigation'
                      ? 'Answered: moving between screens matters more than the first load'
                      : 'Answered: both waits matter equally',
            body: `It is the only one of the five questions no file anywhere can answer, and the one that settles a tension the rest of the report refuses to settle: deferring code makes the first screen cheaper and navigation dearer, and preloading it does the opposite. Both magnitudes are put on the table by the granularity and round-trip signals, with no automatic recommendation, precisely because nothing in a build folder knows which of the two hurts more here.${
                d.priority === 'both'
                    ? ' Answering “both” is not a failure to answer: it says there is no room to trade one for the other, and that rules out the easy way out of either signal.'
                    : ''
            }`,
            fix:
                d.priority === 'firstScreen'
                    ? `Then the report can name the direction it stays quiet about everywhere else: <strong>defer aggressively</strong>. Anything the first screen does not need leaves the bootstrap, even if that multiplies the files the later ones need.${d.prefetching ? ' And there is a prefetch signal in this report: check whether the framework is preloading routes during the first load, because that is the exact opposite of what you have just said you want.' : ''} The later screens are bought separately, with a prefetch on ${mono('idle')} or on hover over the link, which does not compete with the first load because it happens afterwards.`
                    : d.priority === 'navigation'
                      ? `Then the direction is the other one, and it can be named too: <strong>prefetch on intent</strong>, and do not split so finely that reaching a screen costs a chain of discoveries. Discovery depth is the metric for that — every level is a round trip no compression touches — and it is the one to read before the weight.${d.waves ? ' This report has depth signals: those are the ones.' : ''} Watch the easy way out: merging chunks to shorten the chain makes navigation cheaper and the first load and the cache dearer, which is exactly the trade you have just said you accept. Say so in the review rather than leaving it implicit.`
                      : 'With both equally important there is no trade to make, so both easy ways out are ruled out: no merging to shorten navigation, and no deferring until the first screen is full of round trips. What is left are the fixes that do not swap one for the other — dropping weight nobody uses, breaking up the chunk that mixes what changes with what does not, fixing compression — and those are the ones this report puts at the top.',
        }),
        situationMissing: (d: SituationMissingData) => ({
            chip: 'questions that would change this report',
            title:
                d.keys.length === 1
                    ? 'One unanswered question would change what this report says'
                    : `${d.keys.length} unanswered questions would change what this report says`,
            body: `${d.started ? 'Of the five, these are still open' : 'Nobody has answered yet, and of the five questions these are the ones <strong>this</strong> report needs'}: ${d.asks.map(ask => `<strong>${ask}</strong>`).join('; ')}. They are not here because a form is waiting to be filled in: each one is on the list because there is a signal in this very report whose reading depends on it. The ones that would change nothing are not asked.`,
            fix: `They are answered in the situation tab of the page, or by hand in the ${mono('situation')} block of ${mono('loadline.json')}, which is where the command reads them from. They are options rather than numbers, and each one says where to look when nobody knows it off the top of their head: route-change events per session, the tags of the last quarter, the returning-visitor share in your analytics. <strong>And one worth not answering from memory</strong>: the connection question is the one that lies most, because people answer it the way they would like it to be. If you have RUM, that one is not answered, it is imported. Nothing bad happens while they stay open: the report shows the raw facts and withholds the colour, which is what it has been doing all along.`,
        }),
    },
} as const;
