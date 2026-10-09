/** Both languages of the command's own words. See `text.types.ts` for why they are kept apart. */

import { type Lang } from '../../src/app/core/i18n/ui-strings';
import { type CliStrings } from './text.types';

/** "Fixing both", not "acting on all 2": the line under the ranked signals, as the page words it. */
const fixingEn = (count: number): string => {
    if (count === 1) {
        return 'Fixing it';
    }
    return count === 2 ? 'Fixing both' : `Fixing all ${count}`;
};

const fixingEs = (count: number): string => {
    if (count === 1) {
        return 'Arreglándola';
    }
    return count === 2 ? 'Arreglando las dos' : `Arreglando las ${count}`;
};

const EN: CliStrings = {
    lead: (stats, unit, tool) => `${stats} · figures ${unit}${tool ? ` · ${tool}` : ''}`,
    against: (baseline, date) => `compared against ${baseline} (${date})`,
    pageCss: (size, files, total) =>
        `Plus ${size} of CSS in ${files === 1 ? 'the stylesheet' : `${files} stylesheets`} the same page asks for, ` +
        `which block the paint and are not in the figure above: ${total} really comes down first. ` +
        'This report breaks down JavaScript only.',
    tripInline: size => `(${size} of it inline in the page)`,
    firstTrip: (total, files, parts) =>
        `The whole first trip is ${total} across ${files} ${files === 1 ? 'file' : 'files'} — ${parts} — ` +
        'counting everything index.html asks for before anything appears. The figure above is the ' +
        'JavaScript half, which is the half this report can break down.',
    htmlWritten: file => `The page with this build loaded: ${file}`,
    severity: { high: 'high', mid: 'mid', ok: 'ok', info: 'info' },
    exportWritten: file => `This build's snapshot, to be the --baseline of a later run: ${file}`,
    htmlInsideBuild: folder =>
        `It is inside ${folder}, which the next build empties: write it somewhere else to keep it.`,
    located: files => `found ${files}`,
    alsoFound: folders => `the newest build was read; also found ${folders}: pass one of them to read it instead`,
    lastRunUnchanged: 'nothing moved',
    tripFonts: 'fonts',
    tripImages: 'images',
    componentStyles: count =>
        `${count} component ${count === 1 ? 'stylesheet' : 'stylesheets'} of the metafile ${count === 1 ? 'is' : 'are'} ` +
        'inside the JavaScript: Angular inlines them, so they are not files in the folder and are already in the figures.',
    offPageLeftOut: ({ legacy, serviceWorker, server, ignored }) =>
        `${[
            legacy > 0 &&
                `${legacy === 1 ? '1 file is' : `${legacy} files are`} the copy for browsers without ES modules (nomodule)`,
            serviceWorker > 0 &&
                `${serviceWorker === 1 ? '1 file is' : `${serviceWorker} files are`} the service worker and what it imports`,
            server > 0 && `${server === 1 ? '1 file runs' : `${server} files run`} only on the server (FastBoot)`,
            ignored > 0 && `${ignored === 1 ? '1 file is' : `${ignored} files are`} in build.ignore of loadline.json`,
        ]
            .filter(Boolean)
            .join('; ')}: left out, because no screen downloads them on a current browser.`,
    sinceLast: (date, change, branch) =>
        `since the last run (${date}${branch ? `, on branch ${branch}` : ''}): ${change}`,
    serverLeftOut: count =>
        `${count === 1 ? '1 output of this build is' : `${count} outputs of this build are`} not in the browser folder ` +
        '(the server side of a rendered build, or a file renamed after it was built, as Angular 8 does with its es5 polyfills): left out, because nobody downloads them under that name.',
    blocked: (baseline, now) =>
        `The baseline was measured in ${baseline} and this build in ${now}: nothing is compared. ${
            baseline === 'raw'
                ? 'Pass --mode raw.'
                : `Pass --mode ${baseline}, with the build folder that has those files.`
        }`,
    exactSplit: 'weight per file read from the source maps',
    opaqueSome: (chunks, count) =>
        `${count === 1 ? 'One bootstrap chunk carries' : `${count} bootstrap chunks carry`} no source map, so what is inside ${count === 1 ? 'it' : 'them'} is not known: ${chunks}.`,
    opaque:
        'No source maps in this folder: what each chunk weighs is known, what is inside it is not. ' +
        'Screens carry their chunk name, and no saving per package or file can be measured.',

    headBoot: 'Bootstrap',
    headScreens: 'Screens',
    headSignals: 'Signals',
    headGates: 'Gates',
    headActions: 'What to fix first',
    headTime: 'Estimated time',
    headBudget: 'Suggested budget',

    actionsNote: 'An order over the signals below, not a selection: every one of them is still there.',
    colAction: 'Signal',
    colSaving: 'Off the first load',
    colEffort: 'Effort',
    effortLabel: {
        config: 'configuration',
        import: 'one import',
        refactor: 'refactor',
        none: '',
    },
    savingCell: saving => saving || '—',
    totalSaving: (bytes, after, count, estimated) =>
        `${fixingEn(count)} would take ${bytes} off the first load, leaving it at about ${after}. ${
            estimated
                ? 'Compressed figures are an estimate: the raw bytes taken out, at the ratio the bootstrap ' +
                  'compresses by, since a single module has no compressed size of its own. '
                : 'The figures are raw minified bytes inside the chunk. '
        }They are not added up: the graph is walked once with every file named above taken out ` +
        'together, so bytes reachable two ways are counted once.',

    profileName: { slow4g: 'slow 4G', fast4g: '4G', cable: 'cable' },
    timeNote:
        'An estimate, not a measurement: a model over the bytes, the round trips and three standard ' +
        'connection profiles. Transfer and latency go by what travels; parse and compile go by raw ' +
        'bytes, because that is what the engine works on. Latency is editable in the criteria.',
    timeColumns: { profile: 'Connection', transfer: 'Transfer', latency: 'Latency', script: 'Parse', total: 'Total' },

    budgetNote: (warning, error, current) =>
        `Nothing here writes a file. The initial load is ${current} raw (JavaScript and the CSS the page ` +
        `asks for, which is what Angular's initial budget counts), so a warning at ${warning} and an ` +
        `error at ${error} leaves room for a feature and still stops a pipeline.`,

    bootSummary: (files, screens) =>
        `${files} ${files === 1 ? 'file' : 'files'}, downloaded before anything appears · ${screens} ${screens === 1 ? 'screen' : 'screens'}`,
    noScreens: 'No lazy screens: everything is in the bootstrap.',
    notScreens: parts => `Loaded lazily and not counted as screens: ${parts.join('; ')}.`,
    notScreensPart: {
        blocks: (count, list) => `${count} ${count === 1 ? 'block' : 'blocks'} deferred inside a screen (${list})`,
        groupers: (count, list) =>
            `${count} route ${count === 1 ? 'file' : 'files'}, paid by the screens behind ${count === 1 ? 'it' : 'them'} (${list})`,
        packages: (count, list) => `${count} ${count === 1 ? 'package' : 'packages'} loaded on demand (${list})`,
        data: (count, list) => `${count} data ${count === 1 ? 'chunk' : 'chunks'} (${list})`,
        workers: (count, list) => `${count} web ${count === 1 ? 'worker' : 'workers'} (${list})`,
        onDemand: (count, list) =>
            `${count} ${count === 1 ? 'chunk' : 'chunks'} of yours no route opens: components, tabs, language files (${list})`,
    },
    noRouteTable:
        'No route table was found in the code, so every chunk loaded lazily counts as a screen: some of these may be tabs or components inside a page rather than places somebody navigates to.',
    routeCss: (count, list) =>
        `Screens also load ${count === 1 ? 'a stylesheet' : `${count} stylesheets`} of their own (${list}), not in their totals: the figures here are JavaScript.`,
    fix: 'Fix',

    passed: 'Every gate passed.',
    failed: count => `${count} ${count === 1 ? 'gate' : 'gates'} broken.`,
    noGates: 'No gate was asked for: this run reports and never fails.',

    overBoot: (actual, limit) => `Bootstrap is ${actual}, over the ${limit} allowed.`,
    overScreen: (screen, actual, limit) => `Screen ${screen} downloads ${actual}, over the ${limit} allowed.`,
    screenLimitUnmatched: (name, screens) =>
        `loadline.json: "gates.screens" has a limit for "${name}", and no screen has that name, so it guards nothing. ` +
        `The screens are: ${screens.join(', ') || 'none'}.`,
    growthUnchecked: 'The growth gates cannot run, and a gate that cannot run would pass.',
    newPackageUnchecked:
        '--fail-on-new-package needs something to say what was there before: a --baseline, or a "packages" list in loadline.json.',
    configGrowthSkipped:
        'loadline.json: the growth gates need a --baseline, and this run has none, so they were not checked.',
    configNewPackageSkipped:
        'loadline.json: "gates.failOnNewPackage" needs a --baseline or a "packages" list, and this run has neither, so it was not checked.',
    overOwn: (screen, actual, limit) => `Own code of ${screen} is ${actual}, over the ${limit} allowed.`,
    growthBoot: (diff, limit) => `Bootstrap grew ${diff}, over the ${limit} allowed.`,
    growthScreen: (screen, diff, limit) => `Screen ${screen} grew ${diff}, over the ${limit} allowed.`,
    growthPctBoot: (percent, limit) => `Bootstrap grew ${percent} %, over the ${limit} % allowed.`,
    growthPctScreen: (screen, percent, limit) => `Screen ${screen} grew ${percent} %, over the ${limit} % allowed.`,
    signalsRaised: (count, level) =>
        `${count} ${count === 1 ? 'signal' : 'signals'} of severity ${level === 'mid' ? 'medium' : 'high'} or above.`,
    signalRaised: (kind, count) =>
        `The ${kind} signal was raised${count === 1 ? '' : ` ${count} times`}, and "gates.failOnSignals" fails on it.`,
    newPackages: names =>
        `${names.length} ${names.length === 1 ? 'package has' : 'packages have'} entered the bootstrap: ${names.join(', ')}.`,
    configRead: file => `thresholds and accepted signals from ${file}`,
    configProblem: (file, problem) => `${file}: ${problem}`,
    accepted: (kind, why, who, until) =>
        `${kind} — ${why}${who ? ` (${who})` : ''}${until ? `, until ${until}` : ', with no end date'}`,
    acceptedExpired: (kind, until) =>
        `${kind} was accepted until ${until}. That date has passed, so it is raised again.`,
    acceptedGrew: (kind, was, now) =>
        `${kind} was accepted at ${was} and is now ${now}. What was agreed to is not what is here, so it is raised again.`,
    headAccepted: 'Accepted, and set aside',

    prFixed: count => `${count} fixed`,
    prNew: count => `${count} new`,
    prDetails: 'The whole report',
    prCut: '(cut to fit a comment: --format text has all of it)',

    screenBudgetNote: (warning, file, size) =>
        'And one per file. "anyScript" applies to every script the build emits — the bootstrap ones too — ' +
        'which is what makes it usable when the names carry content hashes and a per-bundle budget cannot ' +
        `name anything. So it goes above the largest script there is today, ${file} at ${size}, or it fails ` +
        `the next build on a file nobody touched — ${warning}:`,
    headWhatIf: 'What if it were deferred',
    whatIfNote:
        'The saving is exact: the graph is walked without those files, and what stops being ' +
        'reachable is what stops being downloaded. What is NOT recomputed is the split — which ' +
        'files end up in which chunk is the bundler’s decision, and a simulated one would produce ' +
        'round trips and per-screen totals that look measured and are not. So those are unchanged ' +
        'above, and the last column says who would be paying for it instead.',
    whatIfNobody: 'nothing lazy uses it',
    whatIfEstimated:
        'In compressed figures those are the exact raw bytes at the ratio the bootstrap compresses by: ' +
        'the right size, not the exact one, hence the ≈.',
    whatIfNotHere: format =>
        `--what-if is not part of the ${format} format: run it again with --format text, summary, json or agent to see the answer.`,
    colWhatIf: 'Deferred',
    headWhy: 'Why it is here',
    whyReach: {
        boot: 'in the first load, through',
        lazy: 'not in the first load: it already arrives behind an import(), through',
        unreached: 'in the build, and nothing reachable from the entry point imports it',
        absent: 'not in this build: no package, folder or file goes by that name',
        unknown: 'cannot be known: without source maps nothing inside a chunk has a name',
        unchained:
            'in the first load, and nothing in this build says which file brings it in: a build folder records which chunk holds what, not which file imports which, and no source of the project in its maps names it',
        sourced:
            'in the first load. A build folder does not record which file imports which, but the sources inside its maps do',
        deferred: 'not in the first load: it arrives later, with whatever asks for it',
    },
    whyCutSourced: (files, what, upTo) =>
        `${files.length === 1 ? `${files[0]} imports it` : `${files.length} files of yours in the first load import it — ${files.join(', ')}`}. ` +
        `An import() of ${what} there would take up to ${upTo} off the first load: what it weighs in it, and less if part of it also arrives another way.`,
    whyCut: (file, what, saved, through, payers) =>
        `${through ? `It comes in through ${what}. ` : ''}Cut here: an import() of ${what} in ${file} would take ${saved} ` +
        `off the first load${payers ? `, and ${payers} would pay for it instead` : ''}.`,
    whyCutAlso: (file, others, everywhere) =>
        `Cutting it in ${file} alone saves nothing: ${others.length === 1 ? `${others[0]} imports it too` : `${others.length} more files of the first load import it too — ${others.join(', ')}`}. ` +
        `An import() in every one of them would take ${everywhere} off the first load.`,
    whyCutShared: file =>
        `Cutting it in ${file} alone saves nothing: it also arrives another way. The figure under --what-if says how much once every way is cut.`,
    whyNoCut: 'The entry point imports it itself: the import() would go in the entry file.',
    whyNotHere: format =>
        `--why is not part of the ${format} format: run it again with --format text, json or agent to see the answer.`,
    whatIfUnknown: 'cannot be measured',
    whatIfAbsent: 'not in this build',
    whatIfUnknownWhy:
        'Where it says "cannot be measured": a build folder records which chunk holds what and not which file imports which, so what would stop being downloaded cannot be walked. The Size column is the most it could be; the stats.json of the build, or the page with it, gives the exact figure.',
    savingUnknown: 'A dash here means "not known", not "nothing": without source maps no saving can be measured.',
    colSize: 'In the bootstrap',
    colAfter: 'Bootstrap after',
    colWhoPays: 'Would then be paid by',
};

const ES: CliStrings = {
    lead: (stats, unit, tool) => `${stats} · cifras ${unit}${tool ? ` · ${tool}` : ''}`,
    against: (baseline, date) => `comparado con ${baseline} (${date})`,
    pageCss: (size, files, total) =>
        `Más ${size} de CSS en ${files === 1 ? 'la hoja de estilos' : `${files} hojas de estilos`} que pide la misma ` +
        `página, que bloquean el pintado y no están en la cifra de arriba: ${total} es lo que baja de verdad antes ` +
        'de nada. Este informe desglosa solo el JavaScript.',
    tripInline: size => `(${size} de ello en línea en la página)`,
    firstTrip: (total, files, parts) =>
        `El primer viaje entero son ${total} en ${files} ${files === 1 ? 'fichero' : 'ficheros'} — ${parts} — ` +
        'contando todo lo que pide index.html antes de que aparezca nada. La cifra de arriba es la ' +
        'mitad de JavaScript, que es la que este informe sabe desglosar.',
    htmlWritten: file => `La página con este build cargado: ${file}`,
    severity: { high: 'alta', mid: 'media', ok: 'ok', info: 'info' },
    exportWritten: file => `La foto de este build, para ser la --baseline de otra ejecución: ${file}`,
    htmlInsideBuild: folder =>
        `Está dentro de ${folder}, que el siguiente build vacía: guárdala en otro sitio para conservarla.`,
    located: files => `encontrado ${files}`,
    alsoFound: folders => `se ha leído el build más reciente; también hay ${folders}: pasa uno de ellos para leerlo`,
    lastRunUnchanged: 'no se ha movido nada',
    tripFonts: 'de tipografías',
    tripImages: 'de imágenes',
    componentStyles: count =>
        `${count} ${count === 1 ? 'hoja de estilos de componente del metafile va' : 'hojas de estilos de componente del metafile van'} ` +
        'dentro del JavaScript: Angular las incrusta, así que no son ficheros de la carpeta y ya están en las cifras.',
    offPageLeftOut: ({ legacy, serviceWorker, server, ignored }) =>
        `${[
            legacy > 0 &&
                `${legacy === 1 ? '1 fichero es' : `${legacy} ficheros son`} la copia para navegadores sin módulos ES (nomodule)`,
            serviceWorker > 0 &&
                `${serviceWorker === 1 ? '1 fichero es' : `${serviceWorker} ficheros son`} el service worker y lo que importa`,
            server > 0 &&
                `${server === 1 ? '1 fichero corre' : `${server} ficheros corren`} solo en el servidor (FastBoot)`,
            ignored > 0 &&
                `${ignored === 1 ? '1 fichero está' : `${ignored} ficheros están`} en build.ignore de loadline.json`,
        ]
            .filter(Boolean)
            .join('; ')}: fuera, porque ninguna pantalla los descarga en un navegador actual.`,
    sinceLast: (date, change, branch) =>
        `desde la última ejecución (${date}${branch ? `, en la rama ${branch}` : ''}): ${change}`,
    serverLeftOut: count =>
        `${count} salida${count === 1 ? '' : 's'} de este build no ${count === 1 ? 'está' : 'están'} en la carpeta ` +
        'del navegador (el lado servidor de un build con render, o un fichero renombrado después de compilarlo, como hace Angular 8 con sus polyfills es5): fuera, porque nadie las descarga con ese nombre.',
    blocked: (baseline, now) =>
        `La línea base se midió en ${baseline} y este build en ${now}: no se compara nada. ${
            baseline === 'raw'
                ? 'Pasa --mode raw.'
                : `Pasa --mode ${baseline}, con la carpeta de build que tiene esos ficheros.`
        }`,
    exactSplit: 'peso por fichero leído de los source maps',
    opaqueSome: (chunks, count) =>
        `${count === 1 ? 'Un chunk del bootstrap no trae' : `${count} chunks del bootstrap no traen`} source map, así que no se sabe qué hay dentro: ${chunks}.`,
    opaque:
        'Esta carpeta no trae source maps: se sabe lo que pesa cada chunk y no lo que hay dentro. ' +
        'Las pantallas llevan el nombre de su chunk, y no se puede medir ningún ahorro por paquete o fichero.',

    headBoot: 'Bootstrap',
    headScreens: 'Pantallas',
    headSignals: 'Señales',
    headGates: 'Gates',
    headActions: 'Qué arreglo primero',
    headTime: 'Tiempo estimado',
    headBudget: 'Budget sugerido',

    actionsNote: 'Es un orden sobre las señales de abajo, no una selección: todas siguen estando.',
    colAction: 'Señal',
    colSaving: 'Fuera de la primera carga',
    colEffort: 'Esfuerzo',
    effortLabel: {
        config: 'configuración',
        import: 'un import',
        refactor: 'refactor',
        none: '',
    },
    savingCell: saving => saving || '—',
    totalSaving: (bytes, after, count, estimated) =>
        `${fixingEs(count)} se quitarían ${bytes} de la primera carga y quedaría en unos ${after}. ${
            estimated
                ? 'Las cifras comprimidas son una estimación: los bytes en crudo que se quitan, a la proporción ' +
                  'en que se comprime el bootstrap, porque un módulo suelto no tiene tamaño comprimido propio. '
                : 'Las cifras son bytes minificados en crudo dentro del chunk. '
        }No se suman: el grafo se recorre una vez quitando de golpe todos los ficheros nombrados arriba, ` +
        'así que lo que se alcanza por dos caminos se cuenta una vez.',

    profileName: { slow4g: '4G lento', fast4g: '4G', cable: 'cable' },
    timeNote:
        'Es una estimación, no una medición: un modelo sobre los bytes, las idas y vueltas y tres perfiles ' +
        'de conexión estándar. La transferencia y la latencia van por lo que viaja; el parseo y la ' +
        'compilación van por bytes en crudo, que es sobre lo que trabaja el motor. La latencia se edita ' +
        'en los criterios.',
    timeColumns: {
        profile: 'Conexión',
        transfer: 'Transferencia',
        latency: 'Latencia',
        script: 'Parseo',
        total: 'Total',
    },

    budgetNote: (warning, error, current) =>
        `Aquí no se escribe ningún fichero. La primera carga son ${current} en crudo (el JavaScript y el CSS ` +
        'que pide la página, que es lo que cuenta el budget initial de Angular), así que un aviso en ' +
        `${warning} y un error en ${error} deja sitio para una funcionalidad y sigue parando un pipeline.`,

    bootSummary: (files, screens) =>
        `${files} ${files === 1 ? 'fichero, descargado' : 'ficheros, descargados'} antes de que aparezca nada · ${screens} ${screens === 1 ? 'pantalla' : 'pantallas'}`,
    noScreens: 'No hay pantallas lazy: todo entra en el bootstrap.',
    notScreens: parts => `Se cargan en diferido y no cuentan como pantallas: ${parts.join('; ')}.`,
    notScreensPart: {
        blocks: (count, list) =>
            `${count} ${count === 1 ? 'bloque diferido' : 'bloques diferidos'} dentro de una pantalla (${list})`,
        groupers: (count, list) =>
            `${count} ${count === 1 ? 'fichero de rutas, que pagan las pantallas que hay detrás' : 'ficheros de rutas, que pagan las pantallas que hay detrás'} (${list})`,
        packages: (count, list) =>
            `${count} ${count === 1 ? 'paquete que se carga' : 'paquetes que se cargan'} cuando hace falta (${list})`,
        data: (count, list) => `${count} ${count === 1 ? 'chunk de datos' : 'chunks de datos'} (${list})`,
        workers: (count, list) => `${count} web ${count === 1 ? 'worker' : 'workers'} (${list})`,
        onDemand: (count, list) =>
            `${count} ${count === 1 ? 'chunk tuyo que no abre' : 'chunks tuyos que no abre'} ninguna ruta: componentes, pestañas, ficheros de idioma (${list})`,
    },
    noRouteTable:
        'No se ha encontrado una tabla de rutas en el código, así que cada chunk que se carga en diferido cuenta como pantalla: alguna puede ser una pestaña o un componente dentro de una página y no un sitio al que se navega.',
    routeCss: (count, list) =>
        `Las pantallas también cargan ${count === 1 ? 'una hoja de estilos propia' : `${count} hojas de estilos propias`} (${list}), que sus totales no cuentan: estas cifras son JavaScript.`,
    fix: 'Qué hacer',

    passed: 'No se ha superado ningún gate.',
    failed: count => `${count} ${count === 1 ? 'gate superado' : 'gates superados'}.`,
    noGates: 'No se ha pedido ningún gate: esta ejecución informa y nunca falla.',

    overBoot: (actual, limit) => `El bootstrap es de ${actual} y el límite está en ${limit}.`,
    overScreen: (screen, actual, limit) => `La pantalla ${screen} descarga ${actual} y el límite está en ${limit}.`,
    screenLimitUnmatched: (name, screens) =>
        `loadline.json: "gates.screens" tiene un límite para "${name}" y ninguna pantalla se llama así, así que no vigila nada. ` +
        `Las pantallas son: ${screens.join(', ') || 'ninguna'}.`,
    growthUnchecked: 'Los gates de crecimiento no pueden ejecutarse, y un gate que no se ejecuta pasaría.',
    newPackageUnchecked:
        '--fail-on-new-package necesita algo que diga qué había antes: una --baseline, o una lista "packages" en loadline.json.',
    configGrowthSkipped:
        'loadline.json: los gates de crecimiento necesitan una --baseline y esta ejecución no tiene, así que no se han comprobado.',
    configNewPackageSkipped:
        'loadline.json: "gates.failOnNewPackage" necesita una --baseline o una lista "packages" y esta ejecución no tiene ninguna, así que no se ha comprobado.',
    overOwn: (screen, actual, limit) => `El código propio de ${screen} es de ${actual} y el límite está en ${limit}.`,
    growthBoot: (diff, limit) => `El bootstrap ha crecido ${diff} y el límite está en ${limit}.`,
    growthScreen: (screen, diff, limit) => `La pantalla ${screen} ha crecido ${diff} y el límite está en ${limit}.`,
    growthPctBoot: (percent, limit) => `El bootstrap ha crecido un ${percent} % y el límite está en el ${limit} %.`,
    growthPctScreen: (screen, percent, limit) =>
        `La pantalla ${screen} ha crecido un ${percent} % y el límite está en el ${limit} %.`,
    signalsRaised: (count, level) =>
        `${count} ${count === 1 ? 'señal' : 'señales'} de gravedad ${level === 'mid' ? 'media' : 'alta'} o superior.`,
    signalRaised: (kind, count) =>
        `Ha saltado la señal ${kind}${count === 1 ? '' : ` ${count} veces`}, y "gates.failOnSignals" falla con ella.`,
    newPackages: names =>
        `${names.length === 1 ? 'Ha entrado 1 paquete' : `Han entrado ${names.length} paquetes`} en el bootstrap: ${names.join(', ')}.`,
    configRead: file => `umbrales y señales aceptadas desde ${file}`,
    configProblem: (file, problem) => `${file}: ${problem}`,
    accepted: (kind, why, who, until) =>
        `${kind} — ${why}${who ? ` (${who})` : ''}${until ? `, hasta ${until}` : ', sin fecha de caducidad'}`,
    acceptedExpired: (kind, until) =>
        `${kind} se aceptó hasta ${until}. Esa fecha ya ha pasado, así que vuelve a salir.`,
    acceptedGrew: (kind, was, now) =>
        `${kind} se aceptó con ${was} y ahora son ${now}. Lo que se acordó no es lo que hay, así que vuelve a salir.`,
    headAccepted: 'Aceptadas, y apartadas',

    prFixed: count => `${count} resueltas`,
    prNew: count => `${count} nuevas`,
    prDetails: 'El informe entero',
    prCut: '(recortado para caber en un comentario: --format text lo tiene entero)',

    screenBudgetNote: (warning, file, size) =>
        'Y otro por fichero. «anyScript» aplica a cada script que emite el build —también a los del ' +
        'arranque—, que es lo que lo hace usable cuando los nombres llevan hash y un budget por bundle no ' +
        `puede nombrar nada. Por eso va por encima del script más grande de hoy, ${file} con ${size}, o ` +
        `rompería el siguiente build por un fichero que nadie ha tocado — ${warning}:`,
    headWhatIf: 'Y si se difiriera',
    whatIfNote:
        'El ahorro es exacto: se recorre el grafo sin esos ficheros, y lo que deja de alcanzarse es ' +
        'lo que deja de descargarse. Lo que NO se recalcula es el troceado —qué ficheros acaban en ' +
        'qué chunk lo decide el bundler, y simularlo daría idas y vueltas y totales por pantalla que ' +
        'parecen medidos y no lo son—. Así que esos siguen igual arriba, y la última columna dice ' +
        'quién lo pagaría en su lugar.',
    whatIfNobody: 'no lo usa nada diferido',
    whatIfEstimated:
        'En cifras comprimidas son los bytes en crudo exactos a la proporción en que se comprime el ' +
        'bootstrap: el tamaño correcto, no el exacto, y por eso el ≈.',
    whatIfNotHere: format =>
        `--what-if no forma parte del formato ${format}: vuelve a lanzarlo con --format text, summary, json o agent para ver la respuesta.`,
    colWhatIf: 'Diferido',
    headWhy: 'Por qué está aquí',
    whyReach: {
        boot: 'en la primera carga, por',
        lazy: 'no está en la primera carga: ya llega detrás de un import(), por',
        unreached: 'está en el build, y nada de lo que se alcanza desde la entrada lo importa',
        absent: 'no está en este build: ningún paquete, carpeta ni fichero se llama así',
        unknown: 'no se puede saber: sin source maps nada de dentro de un chunk tiene nombre',
        unchained:
            'está en la primera carga, y nada en este build dice qué fichero lo trae: una carpeta de build guarda qué chunk lleva qué, no qué fichero importa a cuál, y ninguna fuente del proyecto en sus maps lo nombra',
        sourced:
            'está en la primera carga. Una carpeta de build no guarda qué fichero importa a cuál, pero las fuentes de dentro de sus maps sí',
        deferred: 'no está en la primera carga: llega después, con lo que lo pida',
    },
    whyCutSourced: (files, what, upTo) =>
        `${files.length === 1 ? `${files[0]} lo importa` : `${files.length} ficheros tuyos de la primera carga lo importan — ${files.join(', ')}`}. ` +
        `Un import() de ${what} ahí sacaría como mucho ${upTo} de la primera carga: lo que pesa en ella, y menos si parte llega también por otro camino.`,
    whyCut: (file, what, saved, through, payers) =>
        `${through ? `Llega a través de ${what}. ` : ''}Corta aquí: un import() de ${what} en ${file} sacaría ${saved} ` +
        `de la primera carga${payers ? `, y ${payers.includes(',') ? 'lo pagarían' : 'lo pagaría'} ${payers}` : ''}.`,
    whyCutAlso: (file, others, everywhere) =>
        `Cortarlo solo en ${file} no ahorra nada: ${others.length === 1 ? `${others[0]} también lo importa` : `otros ${others.length} ficheros de la primera carga también lo importan — ${others.join(', ')}`}. ` +
        `Un import() en todos ellos sacaría ${everywhere} de la primera carga.`,
    whyCutShared: file =>
        `Cortarlo solo en ${file} no ahorra nada: también llega por otro camino. La cifra de --what-if dice cuánto, una vez cortados todos.`,
    whyNoCut: 'Lo importa la propia entrada: el import() iría en el fichero de entrada.',
    whyNotHere: format =>
        `--why no forma parte del formato ${format}: vuelve a lanzarlo con --format text, json o agent para ver la respuesta.`,
    whatIfUnknown: 'no se puede medir',
    whatIfAbsent: 'no está en este build',
    whatIfUnknownWhy:
        'Donde dice «no se puede medir»: una carpeta de build guarda qué chunk lleva qué y no qué fichero importa a cuál, así que no se puede recorrer qué dejaría de descargarse. La columna del tamaño es lo máximo que podría ser; el stats.json del build, o la página con él, da la cifra exacta.',
    savingUnknown: 'Aquí «—» quiere decir «no se sabe», no «nada»: sin source maps no se puede medir ningún ahorro.',
    colSize: 'En el bootstrap',
    colAfter: 'Bootstrap después',
    colWhoPays: 'Lo pagaría',
};

export const CLI_TEXT: Record<Lang, CliStrings> = { es: ES, en: EN };
