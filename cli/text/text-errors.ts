/**
 * What the command says when it cannot do what it was asked, and what the self-check answers, in
 * the language of the report.
 *
 * Apart from `text.ts` because none of it is a report: it is what is printed instead of one. Under
 * `--lang es` these were the last lines left in English, and they are the ones read when something
 * has already gone wrong. The flags and file names inside them stay as they are typed.
 */

import { type Lang } from '../../src/app/core/i18n/ui-strings';

export interface ErrorStrings {
    // The command line.
    needsValue: (flag: string) => string;
    badMode: (value: string) => string;
    badLang: (value: string) => string;
    badFormat: (value: string) => string;
    badFailOn: (value: string) => string;
    badPct: (value: string) => string;
    badSize: (flag: string, value: string) => string;
    /** `--max-boot 350`: a size small enough to be kilobytes typed without the unit. */
    bareSize: (flag: string, typed: string) => string;
    unknownFlag: (flag: string) => string;
    missingTarget: string;
    unexpected: (argument: string) => string;
    openNeedsHtml: string;
    seeHelp: string;

    // The files.
    distTwice: string;
    growthNeedsBaseline: string;
    cannotWrite: (path: string, why: string) => string;
    cannotRead: (path: string) => string;
    notJson: (path: string) => string;
    /** A name in `extends` that is neither a file nor an installed package with a `loadline.json`. */
    extendsNotFound: (name: string, from: string) => string;
    /** A file that ends up extending itself, with the chain that leads back to it. */
    extendsCycle: (chain: string[]) => string;
    /** `--print-config` with no `loadline.json` to print. */
    noConfigToPrint: string;
    cannotReadFolder: (folder: string) => string;
    noAssets: (folder: string) => string;
    notLock: (path: string) => string;
    notAudit: (path: string) => string;
    notStats: (path: string) => string;
    noProject: (folder: string) => string;
    /** `loadline .` in a project that holds no build yet. */
    projectNotBuilt: (folder: string) => string;
    notThresholds: (path: string) => string;
    needsBrotli: (by: string) => string;
    needsDist: (by: string) => string;
    /** Who asked for a mode, when it was the file and not the flag. */
    modeInConfig: (mode: string) => string;
    htmlMissing: string;

    // The self-check.
    selfNoPage: string;
    selfNoChunk: string;
    selfPassed: (agreed: number) => string;
    selfUnplaced: (count: number) => string;
    selfUnplacedWhy: string;
    selfPreloaded: (count: number) => string;
    selfPreloadedWhy: string;
    selfFailed: string;
    selfAgreed: (count: number) => string;
    selfOnlyGraph: string;
    selfOnlyPage: string;
    selfSuspect: string;
}

/** "chunk" is the word in both languages. */
const chunks = (count: number): string => (count === 1 ? '1 chunk' : `${count} chunks`);

const EN: ErrorStrings = {
    needsValue: flag => `${flag} needs a value.`,
    badMode: value => `--mode takes raw, gzip or brotli, not "${value}".`,
    badLang: value => `--lang takes en or es, not "${value}".`,
    badFormat: value =>
        `--format takes text, json, markdown, pr-comment, sarif, summary, agent or badge, not "${value}".`,
    badFailOn: value => `--fail-on takes high, mid or none, not "${value}".`,
    badPct: value => `--max-growth-pct takes a number, not "${value}".`,
    badSize: (flag, value) => `${flag} takes a size like 350kB, 1.5MB or a number of bytes, not "${value}".`,
    bareSize: (flag, typed) =>
        `${flag} ${typed} would be ${typed} bytes. Write ${typed}kB, or ${typed}B if bytes are meant.`,
    unknownFlag: flag => `Unknown flag: ${flag}`,
    missingTarget: 'Missing the stats.json or the build folder to analyse.',
    unexpected: argument => `Unexpected argument: ${argument}`,
    openNeedsHtml: '--open opens what --html writes: add --html <file>.',
    seeHelp: 'Run loadline --help to see the options.',

    distTwice: '--dist is the folder already being analysed; drop one of the two.',
    growthNeedsBaseline: '--max-growth and --max-growth-pct need a --baseline to compare against.',
    cannotWrite: (path, why) => `Could not write ${path}: ${why}`,
    cannotRead: path => `Could not read ${path}.`,
    notJson: path => `${path} is not valid JSON.`,
    extendsNotFound: (name, from) =>
        `${from} extends "${name}", and there is no such file, nor an installed package with a loadline.json. A package has to ship that file at its root, and list it in "exports" if it has them.`,
    extendsCycle: chain => `loadline.json extends itself: ${chain.join(' → ')}.`,
    noConfigToPrint: 'There is no loadline.json in this folder to print. Pass one with --config <file>.',
    cannotReadFolder: folder => `Could not read the folder ${folder}.`,
    noAssets: folder => `No .js or .css files under ${folder}. Is that the browser/ folder of the build?`,
    notLock: path => `${path} is not a package-lock.json, a pnpm-lock.yaml or a yarn.lock.`,
    notAudit: path => `${path} is not the JSON output of npm audit, pnpm audit or yarn audit.`,
    notStats: path => `${path} is neither a stats.json nor an analysis exported from Loadline.`,
    noProject: folder => `No angular.json, package.json or pipeline file under ${folder}.`,
    projectNotBuilt: folder =>
        `${folder} is a project, not a build, and no build was found inside it: no folder holding an index.html with ` +
        'scripts, nor a stats.json. Build it the way you deploy it (npm run build) and run this again, or pass the ' +
        'output folder itself: dist/, build/, www/ or wherever your tool writes it.',
    notThresholds: path => `${path} has to be an object of thresholds.`,
    needsBrotli: by => `${by} needs the .js.br files of the build in --dist.`,
    needsDist: by => `${by} needs the build folder in --dist.`,
    modeInConfig: mode => `"mode": "${mode}" in loadline.json`,
    htmlMissing: 'loadline.html is missing from this install, so --html has nothing to write. Run: pnpm build',

    selfNoPage:
        'Self-check needs the index.html of the build: it is the second, independent answer.\n' +
        'Pass the build folder as the target, or add --dist pointing at it.',
    selfNoChunk:
        'Self-check could not run: the index.html of the build names no chunk of it.\n' +
        'Either the page belongs to another build, or the output shape changed enough that\n' +
        'nothing lines up — which is the thing this check is for.',
    selfPassed: agreed => `Self-check passed: the import graph and index.html agree on all ${agreed} bootstrap chunks.`,
    selfUnplaced: count => `It also announces ${chunks(count)} the import graph cannot place:`,
    selfUnplacedWhy:
        'Usually a dynamic import whose path is built at run time — VitePress writes one per\n' +
        'page — which no reader of the files can follow. Too few to be the build changing shape.',
    selfPreloaded: count => `This page also announces ${chunks(count)} the graph attributes to a screen:`,
    selfPreloadedWhy:
        'That is a build with one page per route — index.html is the home route, not a shell —\n' +
        'so those are preloaded route chunks and not part of what every screen pays.',
    selfFailed: 'Self-check FAILED: the two ways of working out the bootstrap disagree.',
    selfAgreed: count => `Agreed on ${chunks(count)}.`,
    selfOnlyGraph: 'Called bootstrap by the import graph, never reached from index.html:',
    selfOnlyPage: 'Reached from index.html, not called bootstrap by the import graph:',
    selfSuspect:
        'One of the two readers is wrong about this build. Every per-screen figure is measured\n' +
        'against the bootstrap, so they are all suspect until this passes.',
};

const ES: ErrorStrings = {
    needsValue: flag => `${flag} necesita un valor.`,
    badMode: value => `--mode acepta raw, gzip o brotli, no "${value}".`,
    badLang: value => `--lang acepta en o es, no "${value}".`,
    badFormat: value =>
        `--format acepta text, json, markdown, pr-comment, sarif, summary, agent o badge, no "${value}".`,
    badFailOn: value => `--fail-on acepta high, mid o none, no "${value}".`,
    badPct: value => `--max-growth-pct acepta un número, no "${value}".`,
    badSize: (flag, value) => `${flag} acepta un tamaño como 350kB, 1.5MB o un número de bytes, no "${value}".`,
    bareSize: (flag, typed) =>
        `${flag} ${typed} serían ${typed} bytes. Escribe ${typed}kB, o ${typed}B si de verdad son bytes.`,
    unknownFlag: flag => `Opción desconocida: ${flag}`,
    missingTarget: 'Falta el stats.json o la carpeta del build que analizar.',
    unexpected: argument => `Argumento de más: ${argument}`,
    openNeedsHtml: '--open abre lo que escribe --html: añade --html <fichero>.',
    seeHelp: 'Ejecuta loadline --help para ver las opciones.',

    distTwice: '--dist es la carpeta que ya se está analizando; quita una de las dos.',
    growthNeedsBaseline: '--max-growth y --max-growth-pct necesitan una --baseline con la que comparar.',
    cannotWrite: (path, why) => `No se pudo escribir ${path}: ${why}`,
    cannotRead: path => `No se pudo leer ${path}.`,
    notJson: path => `${path} no es un JSON válido.`,
    extendsNotFound: (name, from) =>
        `${from} hereda de "${name}", y no hay ningún fichero así ni un paquete instalado con un loadline.json. Un paquete tiene que llevar ese fichero en su raíz, y nombrarlo en "exports" si los tiene.`,
    extendsCycle: chain => `loadline.json hereda de sí mismo: ${chain.join(' → ')}.`,
    noConfigToPrint: 'No hay ningún loadline.json en esta carpeta que mostrar. Pásale uno con --config <fichero>.',
    cannotReadFolder: folder => `No se pudo leer la carpeta ${folder}.`,
    noAssets: folder => `No hay ficheros .js ni .css en ${folder}. ¿Es la carpeta browser/ del build?`,
    notLock: path => `${path} no es un package-lock.json, un pnpm-lock.yaml ni un yarn.lock.`,
    notAudit: path => `${path} no es la salida JSON de npm audit, pnpm audit ni yarn audit.`,
    notStats: path => `${path} no es un stats.json ni un análisis exportado de Loadline.`,
    noProject: folder => `No hay angular.json, package.json ni fichero de pipeline en ${folder}.`,
    projectNotBuilt: folder =>
        `${folder} es un proyecto, no un build, y dentro no hay ningún build: ninguna carpeta con un index.html y ` +
        'scripts, ni un stats.json. Compílalo como lo despliegas (npm run build) y vuelve a lanzarlo, o pasa la ' +
        'carpeta de salida directamente: dist/, build/, www/ o donde la escriba tu herramienta.',
    notThresholds: path => `${path} tiene que ser un objeto de umbrales.`,
    needsBrotli: by => `${by} necesita los ficheros .js.br del build en --dist.`,
    needsDist: by => `${by} necesita la carpeta del build en --dist.`,
    modeInConfig: mode => `"mode": "${mode}" de loadline.json`,
    htmlMissing:
        'Falta loadline.html en esta instalación, así que --html no tiene nada que escribir. Ejecuta: pnpm build',

    selfNoPage:
        'El self-check necesita el index.html del build: es la segunda respuesta, la independiente.\n' +
        'Pasa la carpeta del build como objetivo, o añade --dist apuntando a ella.',
    selfNoChunk:
        'El self-check no pudo ejecutarse: el index.html del build no nombra ningún chunk suyo.\n' +
        'O la página es de otro build, o la forma de la salida ha cambiado tanto que nada\n' +
        'encaja, que es justo lo que esta comprobación vigila.',
    selfPassed: agreed =>
        `Self-check correcto: el grafo de imports y el index.html coinciden en los ${agreed} chunks del arranque.`,
    selfUnplaced: count => `También anuncia ${chunks(count)} que el grafo de imports no sabe colocar:`,
    selfUnplacedWhy:
        'Suele ser un import dinámico cuya ruta se construye al ejecutarse (VitePress escribe uno por\n' +
        'página), que nadie que lea los ficheros puede seguir. Son muy pocos para que el build haya cambiado de forma.',
    selfPreloaded: count => `Esta página también anuncia ${chunks(count)} que el grafo asigna a una pantalla:`,
    selfPreloadedWhy:
        'Es un build con una página por ruta (el index.html es la ruta de inicio, no un shell),\n' +
        'así que son chunks de ruta precargados y no forman parte de lo que paga cada pantalla.',
    selfFailed: 'Self-check FALLIDO: las dos formas de calcular el arranque no coinciden.',
    selfAgreed: count => `Coinciden en ${chunks(count)}.`,
    selfOnlyGraph: 'El grafo de imports los llama arranque, pero el index.html nunca llega a ellos:',
    selfOnlyPage: 'El index.html llega a ellos, pero el grafo de imports no los llama arranque:',
    selfSuspect:
        'Uno de los dos lectores se equivoca con este build. Cada cifra por pantalla se mide contra\n' +
        'el arranque, así que todas son dudosas hasta que esto pase.',
};

export const ERROR_TEXT: Record<Lang, ErrorStrings> = { en: EN, es: ES };
