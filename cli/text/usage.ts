/**
 * `loadline --help`, in both languages of the report. `--lang es --help` printed it in English, the
 * one page of the command somebody reads before anything else.
 *
 * The flags, the formats and the commands are the same in both: they are what is typed.
 */

import { type Lang } from '../../src/app/core/i18n/ui-strings';

const EN = `Loadline — weight per screen, from the terminal.

Usage
  loadline <build root|stats.json|browser folder> [options]

  The root of an Angular build — dist/<app> — is enough: browser-stats.json (Angular 22.2+) or
  stats.json, and the browser/ folder next to it, are found on their own.

  A build folder works on its own too: its chunks carry the import graph, so anything that emits ES
  modules — Vite, Rollup, Rolldown, esbuild — is read without a stats file. It has to hold the
  index.html of the build, which is what names the chunk the application starts at.

Reading the build
  --dist <folder>          The build output (the "browser" folder). Gives gzip figures, brotli when
                           it carries .br files, and exact per-file weights when it carries .js.map.
                           Not needed when the folder is what is being analysed.
  --entry <script>         A script the application starts at, when the page starts it in a way
                           this does not read: "client.*.js", with * for the hash. Repeatable; the
                           same as build.entries of loadline.json, for one run.
  --baseline <file>        A previous stats.json or a Loadline export, to compare against.
  --export <file>          Write this build's snapshot there, to be the --baseline of a later run.
                           The other half of --baseline, and the only one a build that writes no
                           stats.json has: a folder read as a graph could be compared against a
                           baseline and never produce one.
  --lock <file>            pnpm-lock.yaml, package-lock.json or yarn.lock. Says which packages you
                           did not ask for directly and what pulls each one in, reading what the
                           project asks for from the package.json next to it.
  --audit <file.json>      The output of "pnpm audit --json", "npm audit --json" or "yarn audit
                           --json". Crossed with what actually ships: "3 of your 47 are in the
                           first load" instead of "you have 47". Nothing is fetched — both files
                           are ones you already have.
  --project <folder>       Where angular.json, package.json and the pipeline file live. Adds the
                           budget checks. Not read unless asked for.
  --mode raw|gzip|brotli   Which figure the report is in. Default: the best --dist allows.
  --criteria <file.json>   Thresholds replacing the recommended ones. The Criteria tab of the page
                           writes this file with its "Download criteria" button.
  --config <file.json>     loadline.json: the thresholds, the gates and the signals the team has
                           decided to live with, kept next to the code. Without the flag, a
                           loadline.json in the working directory is read if there is one. Flags on
                           the command line win over the file.
  --print-config           Print that loadline.json with everything it "extends" joined in, and
                           stop: which threshold won, without reading three files. Needs no build.
                           The page cannot follow "extends"; drop what this prints on it instead.

Output
  --format <format>             text, summary, json, markdown, pr-comment, sarif, agent or badge.
                                Default: text.
                                summary is the whole report in a dozen lines — the figures, what to
                                fix first and nothing else — for a pipeline step that runs next to
                                twenty others and should not bury them.
                                pr-comment writes the comment a bot leaves on a merge request, with
                                an HTML marker so the next run edits it instead of adding a
                                sixteenth one. sarif anchors each signal to a file, which is what
                                GitHub's code scanning reads. agent is for a coding agent or a
                                script: the five actions worth most, each with its file or package,
                                import chain and saving, as fixed key=value lines and no prose.
                                badge is an SVG of the first load — "first load | 133 kB", with the
                                change when there is a --baseline — coloured by its verdict, to
                                commit next to a README or attach to a pull request.
  --html <file>                 Also write the page — treemap, search, every chunk — with this build
                                already loaded into it. One self-contained file: nothing to drag in,
                                nothing fetched, opens offline.
  --open                        Open what --html wrote.
  --lang en|es                  Default: en.
  --no-color                    Never emit colour. It is off already when stdout is not a terminal.
  --no-cache                    Do not remember this run. By default each run is kept in
                                node_modules/.cache/loadline and the next one says what moved —
                                "bootstrap 156 kB → 129 kB" — without a --baseline.

Failing the build
  --max-boot <size>        Fail when the bootstrap is over it.
  --max-screen <size>      Fail when the total download of a screen is over it.
  --max-own <size>         Fail when the own code of a screen is over it.
  --max-growth <size>      With --baseline: fail when the bootstrap or a screen grows by more.
  --max-growth-pct <n>     The same, as a percentage.
  --fail-on high|mid|none  Fail when a signal of that severity is raised. Default: none.
  --fail-on-new-package    Fail when a package enters the bootstrap that was not in the baseline,
                           or that the "packages" list of loadline.json does not name.

Asking what if
  --what-if <name>         What the first load would weigh without that package, folder or file —
                           the figure to have BEFORE spending the afternoon. Exact: the graph is
                           walked without those files, and what stops being reachable is what stops
                           being downloaded. It does not re-chunk the build, so the round trips and
                           the per-screen totals are not recomputed and the output says so.
                           Repeatable.
  --why <name>             Why that package, folder or file is in the first load: the chain of
                           imports from the entry point, the file of yours where an import()
                           would take it out, and what that would save. Repeatable.

Checking the tool itself
  --self-check             Work the bootstrap out twice — once by walking the import graph, once
                           by closing what index.html announces — and fail when the two disagree.
                           It says nothing about the bundle: it catches the build changing shape
                           under Loadline, which is how the figures go wrong without an error.
                           Needs the index.html, so pass the build folder or add --dist. Prints
                           the check and nothing else.

Exit codes
  0  ran, nothing broke a gate.
  1  a gate broke.
  2  the arguments or the files could not be used.

Examples
  loadline dist/app
  loadline dist/app --html loadline.html --open
  loadline dist/app/browser
  loadline dist/app/stats.json --dist dist/app/browser
  loadline dist/app/stats.json --dist dist/app/browser --max-boot 350kB --fail-on high
  loadline dist/app/stats.json --baseline prev/stats.json --max-growth 20kB --format json
  loadline dist --export loadline-baseline.json
  loadline dist --baseline loadline-baseline.json --max-growth 20kB
  loadline dist/app/stats.json --dist dist/app/browser --self-check
`;

const ES = `Loadline — el peso de cada pantalla, desde la terminal.

Uso
  loadline <raíz del build|stats.json|carpeta browser> [opciones]

  Basta con la raíz de un build de Angular — dist/<app> —: browser-stats.json (Angular 22.2+) o
  stats.json, y la carpeta browser/ de al lado, se encuentran solos.

  Una carpeta de build también sirve sola: sus chunks llevan el grafo de imports, así que todo lo
  que emite módulos ES — Vite, Rollup, Rolldown, esbuild — se lee sin fichero de stats. Tiene que
  traer el index.html del build, que es lo que nombra el chunk por el que arranca la aplicación.

Leer el build
  --dist <carpeta>         La salida del build (la carpeta "browser"). Da las cifras gzip, brotli si
                           trae ficheros .br, y el peso exacto de cada fichero si trae .js.map. No
                           hace falta cuando la carpeta es lo que se analiza.
  --entry <script>         Un script por el que arranca la aplicación, cuando la página lo arranca
                           de una forma que esto no lee: "client.*.js", con * para el hash.
                           Repetible; lo mismo que build.entries de loadline.json, para una vez.
  --baseline <fichero>     Un stats.json anterior o una exportación de Loadline, para comparar.
  --export <fichero>       Escribe ahí la foto de este build, para ser la --baseline de otra
                           ejecución. La otra mitad de --baseline, y la única que tiene un build
                           que no escribe stats.json: una carpeta leída como grafo podía compararse
                           con una baseline y nunca producir una.
  --lock <fichero>         pnpm-lock.yaml, package-lock.json o yarn.lock. Dice qué paquetes no
                           pediste tú directamente y qué trae cada uno, leyendo lo que pide el
                           proyecto del package.json de al lado.
  --audit <fichero.json>   La salida de "pnpm audit --json", "npm audit --json" o "yarn audit
                           --json", cruzada con lo que de verdad se envía: "3 de tus 47 están en
                           la primera carga" en vez de "tienes 47". No se descarga nada: los dos
                           ficheros ya los tienes.
  --project <carpeta>      Donde están angular.json, package.json y el fichero del pipeline. Añade
                           las comprobaciones de budgets. No se lee si no se pide.
  --mode raw|gzip|brotli   En qué cifra va el informe. Por defecto: la mejor que permita --dist.
  --criteria <fichero.json>
                           Umbrales que sustituyen a los recomendados. La pestaña Criterios de la
                           página escribe este fichero con su botón "Descargar criterios".
  --config <fichero.json>  loadline.json: los umbrales, los gates y las señales que el equipo ha
                           decidido aceptar, junto al código. Sin la opción, se lee el
                           loadline.json del directorio de trabajo si lo hay. Las opciones de la
                           línea de comandos ganan al fichero.
  --print-config           Muestra ese loadline.json con todo lo que hereda con "extends" ya
                           unido, y para: qué umbral ha ganado, sin leer tres ficheros. No necesita
                           build. La página no puede seguir "extends"; suéltale lo que esto escribe.

Salida
  --format <formato>            text, summary, json, markdown, pr-comment, sarif, agent o badge.
                                Por defecto: text.
                                summary es el informe entero en una docena de líneas — las cifras,
                                qué arreglar primero y nada más —, para un paso del pipeline que
                                va junto a otros veinte y no debe taparlos.
                                pr-comment escribe el comentario que deja un bot en una merge
                                request, con una marca HTML para que la siguiente ejecución lo
                                edite en vez de añadir el decimosexto. sarif ancla cada señal a un
                                fichero, que es lo que lee el code scanning de GitHub. agent es
                                para un agente de código o un script: las cinco acciones que más
                                valen, cada una con su fichero o paquete, cadena de imports y
                                ahorro, en líneas clave=valor fijas y sin prosa.
                                badge es un SVG de la primera carga — "first load | 133 kB", con el
                                cambio si hay --baseline —, coloreado según el veredicto, para
                                ponerlo junto a un README o adjuntarlo a una pull request.
  --html <fichero>              Escribe también la página — treemap, búsqueda, cada chunk — con
                                este build ya cargado. Un único fichero autocontenido: nada que
                                arrastrar, nada que descargar, se abre sin conexión.
  --open                        Abre lo que ha escrito --html.
  --lang en|es                  Por defecto: en.
  --no-color                    Nunca escribe color. Ya va sin él cuando stdout no es una terminal.
  --no-cache                    No recuerda esta ejecución. Por defecto cada ejecución se guarda en
                                node_modules/.cache/loadline y la siguiente dice qué se ha movido —
                                "bootstrap 156 kB → 129 kB" — sin --baseline.

Romper el build
  --max-boot <tamaño>      Falla si el bootstrap lo supera.
  --max-screen <tamaño>    Falla si la descarga total de una pantalla lo supera.
  --max-own <tamaño>       Falla si el código propio de una pantalla lo supera.
  --max-growth <tamaño>    Con --baseline: falla si el bootstrap o una pantalla crece más que eso.
  --max-growth-pct <n>     Lo mismo, en porcentaje.
  --fail-on high|mid|none  Falla si sale una señal de esa gravedad. Por defecto: none.
  --fail-on-new-package    Falla si entra en el bootstrap un paquete que no estaba en la baseline,
                           o que no nombra la lista "packages" de loadline.json.

Preguntar qué pasaría
  --what-if <nombre>       Cuánto pesaría la primera carga sin ese paquete, carpeta o fichero: la
                           cifra que conviene tener ANTES de dedicarle la tarde. Exacta: se recorre
                           el grafo sin esos ficheros, y lo que deja de alcanzarse es lo que deja
                           de descargarse. No vuelve a trocear el build, así que las idas y vueltas
                           y los totales por pantalla no se recalculan, y la salida lo dice.
                           Repetible.
  --why <nombre>           Por qué ese paquete, carpeta o fichero está en la primera carga: la
                           cadena de imports desde el punto de entrada, el fichero tuyo donde un
                           import() lo sacaría, y cuánto ahorraría. Repetible.

Comprobar la propia herramienta
  --self-check             Calcula el bootstrap dos veces — recorriendo el grafo de imports y
                           cerrando lo que anuncia el index.html — y falla si no coinciden. No dice
                           nada del bundle: detecta que el build ha cambiado de forma por debajo de
                           Loadline, que es como las cifras se equivocan sin dar error. Necesita el
                           index.html, así que pasa la carpeta del build o añade --dist. Imprime la
                           comprobación y nada más.

Códigos de salida
  0  se ha ejecutado y no se ha roto ningún gate.
  1  se ha roto un gate.
  2  no se han podido usar los argumentos o los ficheros.

Ejemplos
  loadline dist/app
  loadline dist/app --html loadline.html --open
  loadline dist/app/browser
  loadline dist/app/stats.json --dist dist/app/browser
  loadline dist/app/stats.json --dist dist/app/browser --max-boot 350kB --fail-on high
  loadline dist/app/stats.json --baseline prev/stats.json --max-growth 20kB --format json
  loadline dist --export loadline-baseline.json
  loadline dist --baseline loadline-baseline.json --max-growth 20kB
  loadline dist/app/stats.json --dist dist/app/browser --self-check
`;

export const USAGE: Record<Lang, string> = { en: EN, es: ES };
