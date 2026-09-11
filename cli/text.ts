/** Both languages of the command's own words. See `text.types.ts` for why they are kept apart. */

import { type Lang } from '../src/app/core/i18n/ui-strings';
import { type CliStrings } from './text.types';

const EN: CliStrings = {
    lead: (stats, unit) => `${stats} · figures ${unit}`,
    against: (baseline, date) => `compared against ${baseline} (${date})`,
    pageCss: (size, files, total) =>
        `Plus ${size} of CSS in ${files === 1 ? 'the stylesheet' : `${files} stylesheets`} the same page asks for, ` +
        `which block the paint and are not in the figure above: ${total} really comes down first. ` +
        'This report breaks down JavaScript only.',
    firstTrip: (total, files, parts) =>
        `The whole first trip is ${total} across ${files} ${files === 1 ? 'file' : 'files'} — ${parts} — ` +
        'counting everything index.html asks for before anything appears. The figure above is the ' +
        'JavaScript half, which is the half this report can break down.',
    serverLeftOut: count =>
        `${count} output${count === 1 ? '' : 's'} of this build are not in the browser folder ` +
        '(the server side of a rendered build): left out, because nobody downloads them.',
    blocked: 'The baseline was measured in another unit: nothing is compared. Pass --dist, or --mode raw.',
    exactSplit: 'weight per file read from the source maps',

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
    totalSaving: (bytes, after, count) =>
        `Acting on all ${count} would take ${bytes} off the first load, leaving it at about ${after}. ` +
        'The figures are raw minified bytes inside the chunk, and they are not added up: the graph is ' +
        'walked once with every file named above taken out together, so bytes reachable two ways are ' +
        'counted once.',
    nothingToSave: 'No signal here names a saving that can be measured.',

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
    fix: 'Fix',

    passed: 'Every gate passed.',
    failed: count => `${count} ${count === 1 ? 'gate' : 'gates'} broken.`,
    noGates: 'No gate was asked for: this run reports and never fails.',

    overBoot: (actual, limit) => `Bootstrap is ${actual}, over the ${limit} allowed.`,
    overScreen: (screen, actual, limit) => `Screen ${screen} downloads ${actual}, over the ${limit} allowed.`,
    overOwn: (screen, actual, limit) => `Own code of ${screen} is ${actual}, over the ${limit} allowed.`,
    growthBoot: (diff, limit) => `Bootstrap grew ${diff}, over the ${limit} allowed.`,
    growthScreen: (screen, diff, limit) => `Screen ${screen} grew ${diff}, over the ${limit} allowed.`,
    growthPctBoot: (percent, limit) => `Bootstrap grew ${percent} %, over the ${limit} % allowed.`,
    growthPctScreen: (screen, percent, limit) => `Screen ${screen} grew ${percent} %, over the ${limit} % allowed.`,
    signalsRaised: (count, level) =>
        `${count} ${count === 1 ? 'signal' : 'signals'} of severity ${level === 'mid' ? 'medium' : 'high'} or above.`,
    newPackages: names =>
        `${names.length} ${names.length === 1 ? 'package has' : 'packages have'} entered the bootstrap: ${names.join(', ')}.`,
    configRead: file => `thresholds and accepted signals from ${file}`,
    configProblem: problem => `loadline.json: ${problem}`,
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

    screenBudgetNote: warning =>
        'And one for the screens. "anyScript" applies to every file the build emits, which is what ' +
        'makes it usable when the names carry content hashes and a per-bundle budget cannot name ' +
        "anything. It is based on the heaviest screen's own code rather than the average, or it " +
        `fires on the screen that was already the largest the day it was written — ${warning}:`,
    headWhatIf: 'What if it were deferred',
    whatIfNote:
        'The saving is exact: the graph is walked without those files, and what stops being ' +
        'reachable is what stops being downloaded. What is NOT recomputed is the split — which ' +
        'files end up in which chunk is the bundler’s decision, and a simulated one would produce ' +
        'round trips and per-screen totals that look measured and are not. So those are unchanged ' +
        'above, and the last column says who would be paying for it instead.',
    whatIfNobody: 'nothing lazy uses it',
    colWhatIf: 'Deferred',
    colSize: 'In the bootstrap',
    colAfter: 'Bootstrap after',
    colWhoPays: 'Would then be paid by',
};

const ES: CliStrings = {
    lead: (stats, unit) => `${stats} · cifras ${unit}`,
    against: (baseline, date) => `comparado con ${baseline} (${date})`,
    pageCss: (size, files, total) =>
        `Más ${size} de CSS en ${files === 1 ? 'la hoja de estilos' : `${files} hojas de estilos`} que pide la misma ` +
        `página, que bloquean el pintado y no están en la cifra de arriba: ${total} es lo que baja de verdad antes ` +
        'de nada. Este informe desglosa solo el JavaScript.',
    firstTrip: (total, files, parts) =>
        `El primer viaje entero son ${total} en ${files} ${files === 1 ? 'fichero' : 'ficheros'} — ${parts} — ` +
        'contando todo lo que pide index.html antes de que aparezca nada. La cifra de arriba es la ' +
        'mitad de JavaScript, que es la que este informe sabe desglosar.',
    serverLeftOut: count =>
        `${count} salida${count === 1 ? '' : 's'} de este build no ${count === 1 ? 'está' : 'están'} en la carpeta ` +
        'del navegador (el lado servidor de un build con render): fuera, porque nadie las descarga.',
    blocked: 'La línea base se midió en otra unidad: no se compara nada. Pasa --dist, o bien --mode raw.',
    exactSplit: 'peso por fichero leído de los source maps',

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
    totalSaving: (bytes, after, count) =>
        `Aplicando las ${count} se quitarían ${bytes} de la primera carga y quedaría en unos ${after}. ` +
        'Las cifras son bytes minificados en crudo dentro del chunk, y no se suman: el grafo se recorre ' +
        'una vez quitando de golpe todos los ficheros nombrados arriba, así que lo que se alcanza por dos ' +
        'caminos se cuenta una vez.',
    nothingToSave: 'Ninguna señal de aquí nombra un ahorro que se pueda medir.',

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
        `${files} ${files === 1 ? 'fichero' : 'ficheros'}, descargados antes de que aparezca nada · ${screens} ${screens === 1 ? 'pantalla' : 'pantallas'}`,
    noScreens: 'No hay pantallas lazy: todo entra en el bootstrap.',
    fix: 'Qué hacer',

    passed: 'No se ha superado ningún gate.',
    failed: count => `${count} ${count === 1 ? 'gate superado' : 'gates superados'}.`,
    noGates: 'No se ha pedido ningún gate: esta ejecución informa y nunca falla.',

    overBoot: (actual, limit) => `El bootstrap es de ${actual} y el límite está en ${limit}.`,
    overScreen: (screen, actual, limit) => `La pantalla ${screen} descarga ${actual} y el límite está en ${limit}.`,
    overOwn: (screen, actual, limit) => `El código propio de ${screen} es de ${actual} y el límite está en ${limit}.`,
    growthBoot: (diff, limit) => `El bootstrap ha crecido ${diff} y el límite está en ${limit}.`,
    growthScreen: (screen, diff, limit) => `La pantalla ${screen} ha crecido ${diff} y el límite está en ${limit}.`,
    growthPctBoot: (percent, limit) => `El bootstrap ha crecido un ${percent} % y el límite está en el ${limit} %.`,
    growthPctScreen: (screen, percent, limit) =>
        `La pantalla ${screen} ha crecido un ${percent} % y el límite está en el ${limit} %.`,
    signalsRaised: (count, level) =>
        `${count} ${count === 1 ? 'señal' : 'señales'} de gravedad ${level === 'mid' ? 'media' : 'alta'} o superior.`,
    newPackages: names =>
        `${names.length === 1 ? 'Ha entrado 1 paquete' : `Han entrado ${names.length} paquetes`} en el bootstrap: ${names.join(', ')}.`,
    configRead: file => `umbrales y señales aceptadas desde ${file}`,
    configProblem: problem => `loadline.json: ${problem}`,
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

    screenBudgetNote: warning =>
        'Y otro para las pantallas. «anyScript» aplica a cada fichero que emite el build, que es lo ' +
        'que lo hace usable cuando los nombres llevan hash y un budget por bundle no puede nombrar ' +
        'nada. Va sobre el código propio de la pantalla más pesada y no sobre la media, o saltaría ' +
        `con la que ya era la mayor el día que se escribió — ${warning}:`,
    headWhatIf: 'Y si se difiriera',
    whatIfNote:
        'El ahorro es exacto: se recorre el grafo sin esos ficheros, y lo que deja de alcanzarse es ' +
        'lo que deja de descargarse. Lo que NO se recalcula es el troceado —qué ficheros acaban en ' +
        'qué chunk lo decide el bundler, y simularlo daría idas y vueltas y totales por pantalla que ' +
        'parecen medidos y no lo son—. Así que esos siguen igual arriba, y la última columna dice ' +
        'quién lo pagaría en su lugar.',
    whatIfNobody: 'no lo usa nada diferido',
    colWhatIf: 'Diferido',
    colSize: 'En el bootstrap',
    colAfter: 'Bootstrap después',
    colWhoPays: 'Lo pagaría',
};

export const CLI_TEXT: Record<Lang, CliStrings> = { es: ES, en: EN };
