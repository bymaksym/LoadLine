import { pct, type UiStrings } from './ui-strings';

/**
 * English UI strings. The contract they fill is `UiStrings`.
 *
 * The bundler's own vocabulary — chunk, bundle, bootstrap, eager, lazy, budget, tree-shaking,
 * source map, barrel file, build — is used verbatim here and in `es.ts`, so both languages name
 * the same thing the same way.
 */
export const EN: UiStrings = {
    verdictGood: 'Good',
    verdictOk: 'Fair',
    verdictBad: 'Bad',
    verdictRule: (ok, bad) => `Good up to ${ok} · Fair up to ${bad} · Bad above that`,
    verdictRuleCoverage: (wide, global) =>
        `Lightly shared below ${wide} % of screens · Widely shared up to ${global} % · Effectively bootstrap from ${global} %`,
    tabCriteria: 'Criteria',
    tabCompare: 'Compare',
    secCompare: 'Several applications',
    secCompareSub:
        'Drop the stats.json of each one and see what they ship twice: the framework, the packages, and your own code.',
    howToCompare:
        '<p>For microfrontends, and for anybody with five portals built from the same repository. Each build goes through exactly the same analysis as the report on the other tabs; this crosses the results.</p><p><strong>The figure at the top is the ceiling on a shared package.</strong> It adds up every copy past the largest one of each thing: one copy of a dependency is not waste, it is the dependency — what a shared package would save is the others.</p><p>Figures are raw bytes. A stats.json comes without the folder next to it, so there is nothing to compress, and comparing a compressed build against a raw one would show a saving that never happened.</p>',
    compareAdd: 'Add stats.json files',
    compareAddCurrent: 'Add the build on screen',
    compareClear: 'Clear',
    compareRemove: 'Remove',
    compareState: builds =>
        builds === 0 ? 'no application yet · needs two' : `${builds} of 2 applications · needs one more`,
    compareEmptyTitle: 'See what several applications ship twice',
    compareEmpty: 'Nothing to compare yet. Add the stats.json of two or more applications.',
    compareNeedsTwo: 'One application is not a comparison. Add at least one more.',
    compareBuild: 'Application',
    compareTotal: 'Whole build',
    compareRaw:
        'Raw bytes. A stats.json arrives without the folder next to it, so there is nothing to compress, and a compressed build against a raw one would read as a saving that never happened.',
    compareIn: 'In',
    compareOfN: (n, total) => `${n} of ${total}`,
    compareCost: 'Extra copies',
    compareCostHelp:
        'Every copy past the largest one, added up. One copy of a dependency is not waste — it is the dependency. This is what a shared package would actually take off the total.',
    compareInBootHelp:
        'In how many of the applications that ship it, it lands in the bootstrap — where a copy is paid by every visit rather than by the screens that open it.',
    compareDuplicatedLead: builds => `shipped more than once across these ${builds} applications`,
    compareDuplicatedHelp:
        'Packages and your own files, every copy past the largest one. It is the ceiling on what a shared package could save, not a promise: sharing has its own cost, and this is the number to weigh it against.',
    compareFrameworks: 'The framework, more than once',
    compareFrameworksNote:
        'The expensive case. A row in red is the same framework in two different versions, which is the one that cannot be shared without deciding which version wins.',
    comparePackages: 'Packages in more than one of them',
    compareNoShared: 'Nothing they ship twice weighs anything worth naming.',
    compareOwn: 'Your own code, in more than one of them',
    compareNoOwn: 'No file of your own ships in more than one of these builds.',
    compareRest: n => `and ${n} more, lighter than these.`,
    compareVersions: 'Versions',
    compareVersionsHelp:
        'Read from the installed path, which only pnpm writes the version into. With npm or yarn the column is empty because nothing could be read — which is not the same as the versions agreeing.',
    compareVersionUnknown: 'not readable',
    compareVersionsNote:
        'No installed path carried a version, so the versions could not be read at all. That is a gap in what these files say, not a finding that everything agrees: pnpm writes the version into the path, npm and yarn do not.',
    compareRejected: files =>
        `Not a build: ${files.join(', ')}. Each file has to be a stats.json (an esbuild metafile or webpack's stats).`,
    secCriteria: 'Rating criteria',
    secCriteriaSub:
        'The thresholds behind “good”, “fair” and “bad”, and the ones that fire each signal. You can change them.',
    howToCriteria:
        '<p>Every rated figure in the report is compared against two thresholds: up to the first it is <strong>good</strong>, up to the second <strong>fair</strong>, above that <strong>bad</strong>. The criteria in the second and third sections are the ones that fire the signals.</p><p><strong>Where the recommended values come from.</strong> With compressed figures, 170 kB of initial JavaScript is the usual budget for a page to become responsive within a few seconds on a mid-range phone; 350 kB is twice that. With raw figures, 500 kB and 1 MB are the values Angular CLI writes by default into <code>angular.json</code>. Per-screen and own-code values are multiples of those. Signal thresholds that are proportions — coverage, number of importers — do not depend on the unit. The ones that are sizes do: a 50 kB minimum applied to compressed figures is three times stricter than the same minimum in raw, so they scale down with everything else.</p><p>Whatever you change is stored in this browser, separately for raw and compressed, and applies immediately to ratings and signals. A value equal to the recommended one stops counting as custom.</p>',
    criteriaModeNote: mode => {
        if (mode === 'brotli') {
            return 'You are editing the criteria for brotli figures, the real ones from the .br files in the folder. They are lower than the gzip ones by the same margin brotli compresses better.';
        }
        return mode === 'gzip'
            ? 'You are editing the criteria for gzip-compressed figures (a build folder is loaded).'
            : 'You are editing the criteria for raw figures. With the build folder loaded a different set applies: the bootstrap, for instance, becomes 170 / 350 kB.';
    },
    criteriaFigures: 'Figures',
    criteriaGzipBtn: 'gzip',
    criteriaBrotliBtn: 'brotli',
    criteriaBrotliMissing:
        'These are gzip figures. If your server serves brotli, what people download is 15 % to 20 % less, so a red just above the threshold may not be red in production. With the .js.br files in the build folder, Loadline uses the real figure.',
    criteriaRecommended: value => `recommended: ${value}`,
    criteriaReset: 'Restore recommended',
    criteriaStatusRec: 'recommended criteria',
    criteriaStatusCustom: n => (n === 1 ? '1 custom criterion' : `${n} custom criteria`),
    criteriaEdit: 'edit',
    critGroupSizes: 'Sizes',
    critGroupShared: 'Shared chunks',
    critGroupSignals: 'Signals',
    critGroupShape: 'Shape of the split',
    critGroupContext: 'Baseline and project context',
    critOkUpTo: 'good up to',
    critBadAbove: 'bad above',
    critColThreshold: 'Threshold · source',
    blastTitle: 'If you change this file',
    blastBody: (chunks, screens, everyone) =>
        `${chunks === 1 ? '1 chunk is' : `${chunks} chunks are`} invalidated, and ${
            everyone ? 'every visitor who had the previous build' : `${screens} ${screens === 1 ? 'screen' : 'screens'}`
        } downloads again:`,
    blastCascade: (chunks, screens, everyone, share) =>
        `${chunks === 1 ? '1 more chunk carries' : `${chunks} more chunks carry`} the name of one of those inside, so ${chunks === 1 ? 'its hash' : 'their hashes'} move too${
            everyone
                ? ', and that reaches every screen'
                : screens > 0
                  ? `, reaching ${screens} more ${screens === 1 ? 'screen' : 'screens'}`
                  : ''
        }. Together that is ${share} of the build re-downloaded:`,
    blastCascadeHelp:
        'A bundler writes the hashed file name of every chunk it imports as a string inside the importing chunk, so changing a file changes the name of its chunk, which changes every chunk naming it, and so on outwards. It is how the specifiers are emitted, not something you did wrong. The shape is usually a hub rather than a chain — one shared chunk every route imports and that reaches every route back — which is why the figure jumps rather than growing with depth. Import maps move the specifiers into the HTML, breaking up the hub with manualChunks trades this against a bigger first load, and compression dictionaries make the re-download cheap rather than rarer. Note the tension: the cascade argues for finer chunks and the shared-dictionary and request-cost arguments both argue for coarser ones.',
    blastHub: (file, names) =>
        `${file} carries the names of ${names} other chunks inside it, so anything that moves one of them moves this file too, and this file moving moves everything that imports it.`,
    historyTitle: 'Measurements kept in this browser',
    historyNote:
        'One figure against one baseline compares two points and says nothing about the shape between them. 950 → 1.017 is information; 820, 790, 910, 1.200, 970 is a story, and it shows which week the problem walked in. It is kept in THIS browser only — no account, no server — so the way to share it is to export the file.',
    historyEmpty: 'nothing kept yet',
    historyKeep: 'Keep this one',
    historyExport: 'Export the history',
    historyForget: 'Forget it all',
    historySignals: (high, mid) => `${high} important · ${mid} to review`,
    historyScreenPick: 'And one screen:',
    historyScreenNone: 'none — the bootstrap only',
    historyScreenAbsent: 'this screen was not in that build',
    effortLabel: { config: 'configuration', import: 'one import', refactor: 'refactor', none: '' },
    actionsTotal: count => {
        if (count === 1) {
            return 'Fixing it would take';
        }
        return count === 2 ? 'Fixing both would take' : `Fixing all ${count} would take`;
    },
    actionsTotalAfter: 'off the first load, leaving it at about',
    actionsTotalNote:
        'Raw minified bytes inside the chunk, and not added up: the graph is walked once with every file named above taken out together, so bytes reachable two ways are counted once.',
    actionsTotalNoteEstimated:
        'An estimate in compressed bytes: the raw bytes taken out, at the ratio the bootstrap compresses by, since a single module has no compressed size of its own. Not added up: the graph is walked once with every file named above taken out together, so bytes reachable two ways are counted once.',
    thExclusive: 'Exclusive',
    helpExclusive:
        'What the first load would lose without this row: the part of its weight that has no other way in. It is the figure that says whether removing it is worth an afternoon — chart.js weighing 310 kB means 70 when 240 of those are d3, which three other things also pull in. Raw minified bytes inside the chunk.',
    helpExclusiveOf: percent =>
        percent >= 100
            ? 'Nothing else brings any of this in: all of it goes if this does.'
            : `Only ${percent} % of this row has no other way in. The rest arrives anyway through something else, so removing this row does not take it off.`,
    critLabel: {
        bootOk: 'Bootstrap (declared and effective)',
        bootBad: 'Bootstrap',
        screenOk: 'Total per screen',
        screenBad: 'Total per screen',
        ownOk: 'A screen’s own code',
        ownBad: 'A screen’s own code',
        sharedRatio: 'Coverage to count as effective bootstrap',
        wideRatio: 'Coverage for “widely shared”',
        sharedMinBytes: 'Minimum size of a near-global chunk to be a signal',
        bootPackageMinBytes: 'Minimum size of a bootstrap package to be a signal',
        bootPackageMaxImporters: 'Maximum importing files to count as “single screen”',
        heavyScreenFactor: 'Expensive screen: times the median own code',
        heavyScreenMinBytes: 'Expensive screen: minimum own code',
        growthRatio: 'Growth since the baseline to be a signal',
        growthMinBytes: 'Minimum growth in size to be a signal',
        budgetSlackFactor: 'Budget too high: times the current bootstrap',
        theirsRatio: 'Share of the first load that can be somebody else’s code',
        latencyMs: 'Round trip on a slow mobile connection, for the time estimate',
        screenFilesMax: 'Files per screen from which the split is worth a look',
        screenWavesMax: 'Round trips a screen takes before it is worth a line',
        dominantRatio: 'Share of a chunk that makes it “that thing, basically”',
        ownFolderMinBytes: 'Minimum weight of your folders held in the bootstrap',
        bigOwnFileBytes: 'From this size, an own file in the bootstrap is named',
        heavyScreenMinScreens: 'Screens needed before comparing against the median',
        tinyChunkBytes: 'Under this, a file is mostly the cost of asking for it',
        minTinyChunks: 'How many of those have to arrive together',
        minLocales: 'Languages of a library before it counts as “all of them”',
        shippedMinBytes: 'Minimum weight for what ships without being screen code',
        barrelMinBytes: 'Exclusive weight from which a barrel file is a signal',
        paidTwiceMinBytes: 'From this size, a module in two chunks is named',
        crumbMaxBytes: 'Under this a chunk is a crumb',
        manyCrumbs: 'Crumbs in a zone before it is a pattern',
        concentratedRatio: 'Share of a zone in one chunk that makes the zone that chunk',
        heavyInZoneRatio: 'Share of its zone from which a row is marked',
        heavyShareRatio: 'Share of a download that counts as “most of it”',
        grouperMaxBytes: 'What a file that only groups routes may weigh',
        sharedGrowthTolerance: 'How alike two screens grow to blame one shared chunk',
        sharedGrowthMinScreens: 'Screens growing alike before it is a shared chunk',
    },
    critHelp: {
        bootOk: 'What downloads before anything is painted. It weighs most on the time until the app responds.',
        bootBad: '',
        screenOk: 'Bootstrap + shared + own: what someone landing directly on a screen downloads.',
        screenBad: '',
        ownOk: 'Chunks only that screen loads. Above this it is usually a heavy library that deserves a lazy block.',
        ownBad: '',
        sharedRatio:
            'If at least this share of screens loads a lazy chunk, it downloads on practically every visit and is added to the effective bootstrap.',
        wideRatio: 'Below the previous threshold but above this one, the chunk is labelled widely shared.',
        sharedMinBytes:
            'A near-global chunk smaller than this raises no signal: the difference would fall within the variation between two builds.',
        bootPackageMinBytes:
            'Bootstrap packages smaller than this are not examined for the “bootstrap for a lazy screen” signal.',
        bootPackageMaxImporters:
            'If more of your files than this import the package, it works as shared groundwork and is not flagged.',
        heavyScreenFactor: 'A screen is expensive if its own code is this many times the median of all screens…',
        heavyScreenMinBytes: '…and also exceeds this size.',
        growthRatio: 'With a baseline loaded, the bootstrap or a screen has grown if it is up by at least this share…',
        growthMinBytes: '…and by at least this size, so a 2 kB screen doubling does not fire.',
        budgetSlackFactor:
            'An error budget in angular.json this many times the current (raw) bootstrap is flagged as unreachable.',
        theirsRatio:
            'Above this share, the report says how much of the first load nobody here wrote. It is never a fault on its own — a framework is somebody else’s code too — so what it raises is context, not a problem.',
        latencyMs:
            'The three connection profiles scale with it, so moving it moves all of them instead of flattening them into one number. The only editable part of the time estimate. Throughput and parse cost belong to a device; latency belongs to where your users are, and they pay it once per round trip whatever the bytes compress to. Everything derived from it is an estimate and is labelled as one.',
        screenFilesMax:
            'How many files a screen needs before the split is worth looking at. It is context rather than a gate: under multiplexing a count cannot separate sixty well-sized files from sixty crumbs, and what does separate them is the granularity threshold below. It costs real seconds under HTTP/1.1, and a pasted measurement is what says whether that is happening.',
        screenWavesMax:
            'How many sequential round trips a screen takes before it is worth a line. The one threshold here with a first principle behind it: every round trip is at least one latency, no compression touches it, and multiplexing does not either — what limits it is sequential discovery, not transport. So it holds the same under HTTP/1.1, HTTP/2 and HTTP/3, and the figure to read is this number times your latency.',
        dominantRatio:
            'When one package or folder is at least this much of a shared chunk, the chunk is described as that thing and the advice points at it.',
        ownFolderMinBytes:
            'Folders of yours held in the bootstrap by a lazy screen, added up. Below this the coupling is real but not worth a line.',
        bigOwnFileBytes:
            'A file of yours inside the bootstrap above this size is listed one by one. It is usually a table of constants that comes in whole.',
        heavyScreenMinScreens:
            'With fewer screens than this there is no meaningful median own code, so no screen is called expensive.',
        tinyChunkBytes: 'Headers, a cache entry and the module wrapper are comparable to the content below this size.',
        minTinyChunks:
            'A handful of tiny files arriving together is the shape of a split that went further than it helps. Two or three mean nothing.',
        minLocales:
            'Below this many language files, the library was not shipped whole: it is the one or two somebody registered.',
        shippedMinBytes: 'Languages of a library and data embedded as code are only reported from this weight up.',
        barrelMinBytes:
            'Exclusive, not total: a barrel in front of code that also arrives through five other imports costs nothing, and only what has no other way in is counted here.',
        paidTwiceMinBytes:
            'The same module copied into two chunks. One copy was going to be downloaded anyway; this weighs the rest.',
        crumbMaxBytes: 'Chunks under this are counted apart in the Tree tab and in each screen’s shape.',
        manyCrumbs: 'Fewer crumbs than this in one zone is not a pattern, it is two files.',
        concentratedRatio:
            'When the largest chunk of a zone is at least this much of it, the zone is really that chunk and the tab says so.',
        heavyInZoneRatio: 'A chunk holding at least this much of its zone is marked as where that weight is.',
        heavyShareRatio:
            'How much of a download the largest files have to cover before they are described as most of it.',
        grouperMaxBytes:
            'A file that only lists routes compiles to paths and arrow functions. Above this it carries something of its own and counts as a screen.',
        sharedGrowthTolerance:
            'Screens growing within this much of each other are read as one shared chunk growing under all of them, instead of as many separate screens.',
        sharedGrowthMinScreens: 'Fewer screens than this growing alike is a coincidence, not a shared chunk.',
    },
    critScale: {
        chunk: 'in the unit of the report',
        file: 'always raw bytes',
        request: 'the cost of one request',
    },
    critFrom: {
        external: 'published figure',
        derived: 'derived here',
        convention: 'convention',
    },
    critFromHelp: {
        external:
            'A number somebody else published, copied here so it can be checked against its source rather than taken on trust. The raw first-load pair is what Angular CLI writes into angular.json by default; the round-trip time is the mobile profile Lighthouse throttles to. It is a published default, not a measurement of your build or your audience.',
        derived:
            'Arithmetic on another threshold in this list — a multiple of the first-load budget, or the same budget expressed in another unit. It has no independent justification: it moves when the number it comes from moves, and it is only as good as that one.',
        convention:
            'A line had to be drawn somewhere and this is where it was drawn. Nothing was measured to arrive at the number, and no source backs it. Most of this list is conventions, and saying so is more useful than inventing a justification after the fact — if your project has a reason for a different number, that reason beats this one.',
    },
    criteriaExport: 'Download criteria',
    criteriaExportHelp:
        'Saves what is set here as the JSON file the command reads with --criteria, so the pipeline judges the build by the same thresholds as this page.',
    unitKb: 'kB',
    unitPct: '%',
    unitTimes: '×',
    unitFiles: 'files',
    unitChunks: 'chunks',
    unitScreens: 'screens',
    unitLangs: 'languages',
    unitImporters: 'files',
    unitTrips: 'round trips',
    unitMs: 'ms',
    treePin: 'Keep this chunk at the top, to compare it against another',
    treeUnpin: 'Stop keeping it at the top',

    tagline: 'weight per screen',
    lede: 'What someone opening each screen of your app downloads, how much of it everyone else pays too, and what is worth moving.',
    themeBtn: 'Switch theme',
    themeToDark: 'Dark',
    themeToLight: 'Light',
    searchBtn: 'Search',
    searchKeys: 'Ctrl K',
    homeAria: 'Loadline: change what is loaded',
    buildChipHelp: 'Change what is loaded',
    intakeRequired: 'required · one of the two',
    intakeOptional: 'Optional · each one adds detail, now or later',
    intakeBack: 'Back to the report',
    contextRawNote: 'Raw figures: bytes on disk, not what travels',
    contextAddDetail: 'Add detail:',
    contextAddDist: 'browser/ folder → compressed figures',
    contextAddBaseline: 'baseline → compare',
    contextAddContext: 'package.json + angular.json → name, budgets',
    heroCaptionBoot: boot => `${boot} the bundler marks as initial`,
    heroCaptionExtra: (extra, chunks, ratio) =>
        `${extra} in ${chunks === 1 ? 'one chunk' : `${chunks} chunks`} marked lazy that at least ${pct(ratio)} of the screens load anyway.`,
    heroCaptionSame: 'No lazy chunk is loaded by enough screens to add to it.',
    kpiWorst: 'worst',
    provenanceTitle: 'Where these figures come from',
    dataSourceShort: {
        measured: 'a browser reported it',
        derived: 'walked from the import graph',
        declared: 'an answer you gave',
        unknown: 'grey on purpose',
    },
    densityCompact: 'Compact',
    densityComfortable: 'Comfortable',
    densityHelp:
        'Tighter rows, for reading long tables on a wide screen. It changes the spacing and nothing else: no column, no figure and no colour goes away.',
    columnsBtn: (shown, total) => `Columns ${shown}/${total}`,
    copyRow: 'Copy this row',
    copyRowHelp: 'This screen as one line of text, for pasting into a thread about it.',
    explainBtn: 'Where this figure comes from',
    paletteTitle: 'Jump to',
    palettePlaceholder: 'A tab, a screen, a package, a file…',
    paletteNone: 'Nothing by that name.',
    paletteTab: 'tab',
    paletteAction: 'action',
    paletteCount: (shown, total) =>
        total > shown ? `${shown} of ${total} — the Search tab names every one of them` : String(total),
    paletteKeysHint: '↵ open · esc close · ? shortcuts',
    keysTitle: 'Keyboard',
    keyJump: 'Jump to a tab, a screen or a package',
    keySearch: 'The same thing, from anywhere that is not a field',
    keyMove: 'Move through the list and take what is on',
    keyClose: 'Close this, and close an open explanation',
    keyHelp: 'This list',
    keyTabs: 'Between tabs, with a tab focused',

    drop1Title: 'Drop your build folder or its stats.json here',
    drop1Body:
        'The build folder is enough for anything that emits ES modules — Vite, Rollup, SvelteKit, Nuxt, Astro, esbuild — because its chunks carry the import graph. Angular writes a <code>stats.json</code> with <code>ng build --stats-json</code>, esbuild a <code>metafile</code> and webpack its stats with <code>--json</code> — Angular 16 or earlier, Create React App, Vue CLI — and any of them is more exact than the folder alone. It is processed in your browser: nothing leaves your machine.',
    drop1Btn: 'Choose stats.json',
    drop1FolderBtn: 'Choose build folder',
    sampleBtn: 'See an example',
    sampleLoaded: outputs => `Example build · ${outputs} outputs · not your project`,
    sampleRemove: 'Close the example',
    diagnosticsBtn: 'Copy diagnostics',
    diagnosticsCopied: 'Copied',
    diagnosticsHint:
        'About thirty lines describing the shape of this build and what Loadline decided about it. Package names are real; every path of your own code is replaced by a stable hash. Paste it into an issue.',
    drop2Title: 'The build folder',
    drop2Body:
        'Add the <code>browser/</code> folder and every figure becomes <strong>compressed</strong>, which is what gets downloaded. Without it you get raw bytes. If the folder carries the <code>.js.map</code> files, they are also read to get what each file weighs inside each chunk, as a <strong>second measurement</strong> of what the metafile already says.',
    drop2Btn: 'Choose folder',
    statsRemove: 'Remove stats.json',
    distRemove: 'Remove folder',
    projectNameHelp: 'The project being analysed, read from the package.json or angular.json loaded as context.',
    statsIdle: 'Nothing loaded',
    distIdle: 'Nothing loaded · raw figures',
    statsLoaded: (name, outputs) => `${name} · ${outputs} outputs`,
    statsFromFolder: (name, outputs, opaque) =>
        `${name} · ${outputs} chunks · graph read from the folder${opaque ? ' · no source maps: what is inside each chunk, and so any saving, cannot be measured' : ''}`,
    statsError: message => `Could not read it: ${message}`,
    distNoFiles: 'That folder has no build output in it',
    distNoApi: 'Your browser cannot compress here; keeping raw figures',
    distWorking: (done, total) => `Compressing ${done} of ${total} files…`,
    distReading: 'Reading the import graph…',
    distLoaded: files => `${files} files · compressed figures`,
    distLoadedMaps: (files, maps) => `${files} files · compressed figures · ${maps} source maps read`,
    distLoadedBrotli: 'real brotli from the .br files',
    distLoadedIndex: 'index.html read',
    distTextUnread:
        'restored without the text of the chunks: drop the folder again to search it for secrets and leftovers',
    splitExact: 'split from the source maps',
    splitApprox: 'split from the metafile',
    serverIgnored: n => `${n === 1 ? '1 server output' : `${n} server outputs`} left out`,
    serverIgnoredHelp:
        'Outputs of the build that are not in the browser folder: almost always the server bundle (server-side rendering), which nobody downloads and is usually the larger of the two, so only the browser side is analysed. It can also be a file renamed after it was built, like the es5 polyfills of Angular 8, which nobody downloads under that name.',
    offPageIgnored: ({ legacy, serviceWorker, server, ignored }) =>
        `${[
            legacy > 0 && `${legacy === 1 ? '1 file' : `${legacy} files`} for browsers without ES modules`,
            serviceWorker > 0 && (serviceWorker === 1 ? 'the service worker' : `${serviceWorker} service worker files`),
            server > 0 && `${server === 1 ? '1 file' : `${server} files`} only the server runs`,
            ignored > 0 && `${ignored === 1 ? '1 file' : `${ignored} files`} loadline.json ignores`,
        ]
            .filter(Boolean)
            .join(' and ')} left out`,
    offPageIgnoredHelp:
        'Only a browser that cannot run ES modules downloads the nomodule copy, a service worker runs beside the page rather than as part of a screen, the files of FastBoot run on the server, and build.ignore in loadline.json names what the team says no screen downloads. None of them is in any figure here, so every figure is what a current browser downloads.',
    notScreensLabel: 'Not counted as screens:',
    notScreenKind: {
        block: 'lazy block inside a screen',
        grouper: 'route group',
        data: 'data',
        package: 'package on demand',
        worker: 'web worker',
        onDemand: 'no route opens it',
    },
    blocksHelp:
        'An Angular @defer, or a lazy() inside a component, produces a lazy chunk exactly like a route does. It is not a screen: nobody enters it, it loads when its trigger fires inside the screen holding it. Counting it as a screen would raise the screen count and lower the median with something nobody opens. What the graph cannot say is WHEN that trigger fires: a block behind a button really is bytes nobody pays for until they press it, while one imported as the screen mounts comes down with the first paint, and then the screen weighs more than its row says. Both look identical here. The Measured tab is what settles it.',
    groupersHelp:
        'A file that adds practically nothing of its own to its chunk and holds nothing but dynamic imports is grouping routes, whatever it is called. What it loads are the screens; it is not one of them. That is measured rather than read off the file name, so it also holds in a project that does not name its files the Angular way.',
    dataHelp:
        'A language file, a table of countries, a dictionary: an import() of a .json produces a lazy chunk exactly like a route does. Nobody navigates to one, and an application that lazy-loads fifty languages would otherwise report fifty screens. What to do about these is not "is this a screen" but whether the data has to travel inside the bundle at all.',
    packagesHelp:
        "A package with an import() of its own: a diagram renderer, a formula typesetter. Nobody navigates to it, and when it is asked for is what the graph cannot say, so it is in no screen's total.",
    workersHelp:
        'Code started with new Worker(): it runs off the page, in a chunk of its own, when the page starts it. Not a screen and not in any total.',
    onDemandHelp:
        'The code carries a route table, and no route of it imports this chunk: it is a component, a tab or a language file loaded inside a page, not a place somebody navigates to. If it is a route all the same, count it as a screen.',
    noRouteTable:
        'No route table was found in the code, so every chunk loaded lazily counts as a screen: some of these may be tabs or components inside a page rather than places somebody navigates to.',
    routeCss: (count, list) =>
        `Screens also load ${count === 1 ? 'a stylesheet' : `${count} stylesheets`} of their own (${list}), not in their totals: the figures here are JavaScript.`,
    markScreen: 'Count as a screen',
    markScreenHelp:
        'Puts this entry in the table as a screen of its own. Telling a screen from a piece of one is partly read off file names, and no set of names fits every project: this is the way out that does not need Loadline to learn yours.',
    markBlock: 'Not a screen',
    markBlockHelp:
        'Takes this row out of the table: it is a piece of another screen, not somewhere anybody navigates to. It moves to the list of entries that are not screens, above.',
    marksNote: n => `${n === 1 ? '1 entry' : `${n} entries`} reclassified by hand.`,
    marksReset: 'Back to the rules',
    splitHelp:
        'How much each file weighs inside a chunk. It normally comes from the metafile, and with esbuild that figure is already minified: checked against the source maps of a real build, the two agree within 1 %. If the folder brings the .js.map files, the figure from the maps is used instead — the same thing, measured on the generated file itself.',
    intakeCompressed: unit => `${unit} figures`,
    intakeRaw: 'raw figures (bytes on disk)',
    rereadBtn: 'Read the folder again',
    rereadHelp:
        'Reads the same build folder again, for after a rebuild. It is offered only where the browser can hold on to a folder, which is not from a file:// page and not in every browser; everywhere else, drop the folder again.',

    drop3Title: 'The previous measurement',
    drop3Body:
        'The <code>stats.json</code> of the previous build, an analysis exported from Loadline, or the whole previous <code>browser/</code> folder — with its <code>stats.json</code> or without one, the way the build on screen is read — to compare compressed figures. Every screen shows how much it changed, and a signal fires if something grew or entered the bootstrap.',
    drop3Btn: 'Choose baseline',
    drop3BtnDist: 'Choose previous folder',
    baselineWorking: 'Compressing the previous folder…',
    drop4Title: 'The project context',
    drop4Body:
        '<code>package.json</code> names the project and says what it asks for directly, which tells a package you chose from one that came along. On an Angular project, <code>angular.json</code> and the pipeline file (<code>.gitlab-ci.yml</code> or the GitHub workflow) also say where the size budget is and whether the configuration the pipeline builds applies it.',
    drop4Btn: 'Choose files',
    baselineIdle: 'Nothing loaded · no comparison',
    baselineLoaded: (name, mode, screens) => `${name} · ${mode} · ${screens} screens`,
    baselineError: message => `Could not read it: ${message}`,
    baselineShort: name => `baseline: ${name}`,
    baselineModeMismatch:
        'The baseline has compressed figures and the current report is raw: add the build folder to compare.',
    baselineRemove: 'Remove baseline',
    contextIdle: 'Nothing loaded',
    contextLoaded: files => files.join(' · '),
    contextIgnored: files => `Not recognised: ${files.join(', ')}`,
    contextShort: n => (n === 1 ? 'context: 1 file' : `context: ${n} files`),
    configExtends: names => `loadline.json extends ${names}, which the page cannot read`,
    configExtendsHelp:
        'The page has no disk to follow "extends" on, so it applies only what this file says itself. Run npx @bymaksym/loadline --print-config and drop what it prints here instead: that is the file with everything it extends joined in.',
    contextRemove: 'Remove context',
    restorePrompt: (name, date) => `This browser kept the last measurement: ${name} · ${date}`,
    restoreBtn: 'Restore',
    restoreForget: 'Forget',

    exportJson: 'Export analysis (JSON)',
    exportMarkdown: 'Copy table (Markdown)',
    exportCopied: 'Copied',
    exportHint:
        'The JSON keeps the bootstrap, its packages and the cost per screen: it serves as the baseline on the next measurement. The Markdown table pastes into an issue or meeting notes.',

    colDelta: 'Δ',
    helpDelta: baseline => `Change of the total against the baseline (${baseline}).`,
    deltaRaw: 'Δ in raw bytes: the baseline has no compressed figures.',
    tileBootDelta: (diff, percent, baseline) => `${diff} (${percent} %) against ${baseline}`,
    tileBootSame: baseline => `same as in ${baseline}`,
    compareNewScreens: n => (n === 1 ? '1 new screen' : `${n} new screens`),
    compareGoneScreens: n => (n === 1 ? '1 screen no longer there' : `${n} screens no longer there`),
    compareNew: 'new',

    tabProject: 'Project',
    secProject: 'Project context',
    secProjectSub: 'Where the size budgets are, what the pipeline builds and whether the budget applies.',
    howToProject:
        '<p>Angular only checks the size budgets (<code>budgets</code>) of the configuration it builds with. If the budget is in <code>production</code> and the pipeline builds <code>preproduction</code>, the budget never applies. This tab crosses the two: the budgets of every configuration in <code>angular.json</code> and the build commands of the pipeline, following the scripts of <code>package.json</code> (<code>pnpm run build:pre</code> → <code>ng build --configuration=preproduction</code>).</p><p>The comparison with the bootstrap is raw and JavaScript only, which is what Angular measures. An error budget above twice the current bootstrap never fires.</p>',
    projectState: 'unknown · no project files loaded',
    projectEmptyTitle: 'Where your size budgets are, and whether they apply',
    projectEmpty:
        'Add angular.json, package.json and the pipeline file. Loadline checks which configuration the pipeline builds and whether its budget covers it.',
    projectEmptyBtn: 'Choose project files',
    projectBudgets: project => `Bootstrap budgets by configuration · project ${project}`,
    projectPick: 'Application',
    projectPickHelp: n =>
        `angular.json declares ${n} applications. The budgets below are the ones of the selected application; pick the one your stats.json came from.`,
    projectNoBudgets: 'angular.json declares no build configuration.',
    thConfiguration: 'Configuration',
    thWarning: 'Warning',
    thError: 'Error',
    thBuiltBy: 'Built by the pipeline',
    thAgainstBoot: 'Against the current bootstrap',
    helpBuiltBy: 'Pipeline jobs whose build command resolves to this configuration.',
    helpAgainstBoot: 'How much headroom the error budget leaves over the current raw bootstrap (JavaScript only).',
    builtByNone: 'nobody',
    builtByUnknown: 'no pipeline loaded',
    budgetNoneRow: 'no budget',
    budgetInherited: 'from options',
    budgetDefaultTag: 'default',
    budgetOver: percent => `already over by ${percent} %`,
    budgetHeadroom: percent => `${percent} % headroom`,
    projectPipeline: file => `Build commands in ${file}`,
    projectNoBuilds: 'No build command found in this file.',
    thJob: 'Job',
    thCommand: 'Command',
    thResolvesTo: 'Builds',
    buildDefaultConfig: name => `${name} (default)`,
    buildUnresolved: 'could not be followed to ng build',
    projectZone: 'Change detection',
    zoneYes: 'with zone.js',
    zoneNo: 'without zone.js (zoneless): material about change detection cycles does not apply',
    zoneUnknown: 'no data: load angular.json or package.json',
    projectAngular: version => `Angular ${version}`,
    projectBootRaw: size => `Current raw bootstrap (JavaScript only): ${size}`,

    headLeadGzip: 'Before anything appears, people download (gzip)',
    headLeadRaw: 'Before anything appears, people download (uncompressed)',
    unitGzip: 'gzip-compressed',
    unitRaw: 'raw',
    unitBrotli: 'brotli-compressed',
    headLeadBrotli: 'Before anything appears, people download (brotli)',

    howToAct: 'What can be done about these figures',
    howToActBody:
        '<p><strong>First, who pays for it.</strong> A high figure only matters if somebody downloads it. Everybody downloads the bootstrap, whichever screen they land on; a chunk of one screen is only downloaded by whoever opens that screen. Getting 100 kB out of the bootstrap removes more total download than removing 100 kB from a screen 5 % of people ever open.</p>' +
        '<p><strong>The four ways to bring it down, cheapest first.</strong></p>' +
        '<ol>' +
        '<li><strong>Move it to where it is used.</strong> A package only one screen needs leaves the bootstrap by changing where it is registered, not what it does. It removes the most for the least risk, and it is what almost every signal proposes.</li>' +
        '<li><strong>Remove it.</strong> The dependency nobody uses any more, the second copy of the same library, or the barrel file that re-exports a whole folder and turns one import into twenty.</li>' +
        '<li><strong>Replace it.</strong> Swap a heavy library for a small one, or for twenty lines of your own. It costs tests and review, so size has to justify it: if the row is not near the top of the table, it rarely pays off.</li>' +
        '<li><strong>Split it.</strong> Break a file or a chunk in two. Last, because it touches the code the most and is the one that most often removes nothing: if both halves end up loading together anyway, all that changed was the file names.</li>' +
        '</ol>' +
        '<p><strong>Telling whether it is worth it, before touching anything.</strong> Look at how much moves and how many people it reaches. A few kB fall within the normal variation between any two builds: if the gain does not show up against a baseline, it cannot be defended either. And always compare in the same unit, preferably compressed, which is what gets downloaded.</p>' +
        '<p><strong>When to stop optimising.</strong> Four cases that keep coming up:</p>' +
        '<ul>' +
        '<li>Almost every screen does load that shared chunk. Splitting it does not reduce what gets downloaded: the contents change file and still download.</li>' +
        '<li>What is in red is brought in by a dependency of a dependency. It cannot be moved from your code: it has to be handled where it is imported, and sometimes there is no alternative.</li>' +
        '<li>The figure is already green. Bringing down the next kB costs considerably more effort than the last one and changes nothing for the person opening the page.</li>' +
        '<li>You are splitting into ever smaller chunks. Each chunk is one more request, and past a point twenty small files take longer than two large ones.</li>' +
        '</ul>' +
        '<p><strong>And check it.</strong> Save this build as the baseline, make the change and measure again. If it does not drop where you expected, the cause was another one, and knowing that helps too.</p>',
    adviceBoot:
        'It comes down by taking out of the bootstrap what only some screens use. The Bootstrap tab lists it by weight and marks in red the packages whose only consumer is in a lazy screen: start there.',
    adviceEffective:
        'The gap against the declared bootstrap is chunks the bundler marks as lazy and almost everybody downloads. It is not corrected in the bootstrap but in those chunks: the Shared tab.',
    adviceShared:
        'A chunk almost every screen loads does not improve by splitting it alone. Taking out what a single screen uses pays off; what all of them use will download wherever it lives.',
    adviceFindings:
        'Each signal carries what to do and what not to do, with the actual files. The important ones are those affecting the bootstrap, that is, what always downloads; the ones to review are about one screen, or a size that may be justified.',

    tileBoot: 'Declared bootstrap',
    tileBootCss: (size, files, total) =>
        `+ ${size} of CSS the page asks for${files > 1 ? ` in ${files} sheets` : ''} · ${total} before the first paint`,
    bootSplitRaw: total =>
        `Packages and your code are split in raw bytes, ${total} in all: a compressed file cannot be divided by what is inside it.`,
    bootSplitUnknown:
        'How much of it is packages and how much is your code is not known: the folder carries no source maps, so a chunk is a weight with nothing named inside. Build with source maps, or add the stats.json, to see the split.',
    tileBootSub: files => `what the bundler marks as initial · ${files === 1 ? '1 file' : `${files} files`}`,
    tileScreens: 'Lazy screens',
    tileScreensTypical: 'the typical one costs',
    tileScreensTop: (label, size) => `· the most expensive is ${label} · ${size}`,
    tileScreensNone: 'the whole app is in the bootstrap',
    tileShared: 'Shared chunks',
    tileSharedSub: (global, partial) => `${global} near-global · ${partial} partial`,
    tileSharedNone: 'no lazy chunk is shared by two screens',
    tileFindings: 'Signals',
    tileFindingsSub: (high, mid, context) => `${high} important · ${mid} to review · ${context} context`,
    tileFindingsNone: 'no signal in the split',

    tabFindings: 'Signals',
    tabScreens: 'Screens',
    tabBoot: 'Bootstrap',
    tabShared: 'Shared',
    tabTree: 'Tree',
    tabMap: 'Map',
    howTo: 'How to read this tab',
    howToFindings:
        '<p>Each signal is a concrete pattern found in <strong>your</strong> import graph, with its threshold and its fix. They are not generic performance rules.</p><p><strong>Important</strong> means weight everyone pays without needing to. <strong>To review</strong> flags something worth a look that may have a reason. The button on each signal leads to the report row it comes from.</p>',
    howToScreens:
        '<p>Each row is a lazy screen, and the bar is what someone landing <strong>directly</strong> on it downloads: <strong>bootstrap</strong> (grey, identical everywhere), <strong>shared</strong> (orange: lazy chunks other screens also load) and <strong>own</strong> (green: this screen only). Bars share one scale, so if the orange segment is the same width on every row, the problem is in that common chunk, not in the screens.</p><p>These figures are <strong>computed</strong> by walking the import graph, not measured. They usually run a little low: entering at the root, the router may load an area’s chunks before a guard rejects it. For the definitive number, serve the build folder and watch the browser’s network tab.</p>',
    howToBoot:
        '<p>The bootstrap is what arrives before anything is painted, grouped by npm package and by folder of your project. The <strong>imported by</strong> column says how many of your files use each package directly and where they are: if all of them are in lazy screens, that package should not be here.</p><p>Expand a package to see <strong>how it enters the bootstrap</strong>: the import chain from the entry point down to it, and which files of yours import it. The last file of yours in the chain holds the import to move.</p><p>A package “nobody imports directly” gets in because another package imports it: it is not removed from your code but from the package that brings it. The <strong>CommonJS</strong> tag marks packages the bundler cannot tree-shake.</p><p>The colour of the bar says what the row is: grey an npm package, green a folder of your own code, red a package with few importers, at least one of them in a lazy screen. The legend sits above the table, and hovering any figure, bar or tag says what it means.</p>',
    howToShared:
        '<p>A shared chunk is one the bundler marks as lazy but several screens load. <strong>Coverage</strong> says how many: above 60 % it downloads on practically every visit, even though the bundler’s table classifies it as lazy. That is what this tab shows.</p><p>Expand a row to see exactly which screens load it and which packages it carries. What pays off in a chunk like this is pulling out the components a single screen uses; what nearly every screen uses will keep downloading wherever it lives.</p>',
    howToTree:
        '<p>Every chunk the bundler produced, opened by package or folder and then by file. The bar measures size against the largest chunk; the colour says who pays for it: grey bootstrap, orange shared, green single screen.</p><p>Use it to answer “what exactly is inside this file?” once a signal or a table row has led you to a name.</p>',

    secFindings: 'Worth a look',
    secFindingsSub: 'Signals computed from your dependency graph, not generic rules.',
    secScreens: 'Cost per screen',
    secScreensSub: 'Click a row to see what makes it up. The bars share a scale.',
    secTree: 'Inside the bundle',
    secTreeSub: 'Chunk, package and file. Filter by zone to see only what everybody pays for.',

    howToMap:
        '<p>Each rectangle is a chunk, and its <strong>area is what it weighs in the report’s unit</strong>: compressed when the folder was read. Inside each chunk you see what fills it, by package and by folder of yours. The colour says who pays for it: grey the bootstrap, orange what screens share, green what one screen loads alone. Striped is your own code; plain, packages.</p><p><strong>Inside a chunk the split is raw</strong>, because gzip compresses the file as a whole and the compressed weight of one package inside it does not exist. So the area inside is each part’s share of the chunk, not an invented compressed figure.</p><p>Click a rectangle to go into it and use the crumbs above to come back. With the keyboard: Tab walks the rectangles largest first, Enter goes in and Escape goes up a level. Whatever you type in the search lights up, inside the chunks that carry it too.</p>',
    secMap: 'Bundle map',
    secMapSub: 'Open a chunk and see at a glance what fills it.',
    mapRoot: 'The whole build',
    mapSearch: 'Light up a package, folder or file…',
    mapMatches: hits => (hits === 1 ? '1 matches' : `${hits} match`),
    mapUnattributed: 'unattributed (bundler code)',
    mapRest: count => `${count} smaller ones`,
    mapKind: {
        chunk: 'chunk',
        package: 'package',
        folder: 'folder of yours',
        file: 'file',
        rest: 'group of small ones',
        unattributed: 'unattributed',
        build: 'every chunk',
    },
    mapAreaRoot: unit => `Area: what each chunk weighs, figures ${unit}.`,
    mapAreaInside: 'Area: the share of the chunk each part takes, raw.',
    mapShareOfParent: (percent, parent) => `${percent} of ${parent}`,
    mapShareOfAll: percent => `${percent} of all the JavaScript`,
    mapRawInside: raw => `${raw} raw inside the chunk`,
    mapContents: 'What takes the most',
    mapOpen: 'Go in',
    mapUp: 'Up',
    mapFindIt: 'Find where else it is',
    mapHint: 'Enter goes in · Escape goes up',
    mapLegendPackage: 'package',
    mapLegendOwn: 'your code',
    mapEmpty: 'Nothing to draw with this filter.',
    mapPick: 'Hover a rectangle, or Tab through them, to see what it is.',
    secBoot: 'What is in the bootstrap',
    secBootSub: 'What downloads before anything appears, grouped by package and by your own folders.',
    secShared: 'Shared chunks',
    secSharedSub: 'Lazy according to the bundler; according to your screens, not so much.',

    sevHigh: 'Important',
    sevMid: 'To review',
    sevOk: 'All good',
    sevInfo: 'Good to know',
    seeInShared: 'See the chunk',
    seeInBoot: 'See in bootstrap',
    seeInScreens: 'See the screen',
    seeInProject: 'See the project',
    seeInMeasured: 'See the measurement',
    seeInSituation: 'See the answers',
    findingsRest: 'Context',
    findingsSee: 'Mark as seen',
    findingsUnsee: 'Seen ✓',
    findingsSeenHelp: 'Tick it off: it drops to the end of the list and stops asking for attention.',
    findingsSeenCount: n => (n === 1 ? '1 ticked off' : `${n} ticked off`),
    findingsSeenReset: 'None ticked off',
    findingsNoneHere: 'No signals of this kind.',
    findingsColSignal: 'Signal · in the order worth fixing',
    findingsColOff: 'Off load',
    findingsColFix: 'Fix',
    fixLabel: 'What to do',

    legBoot: 'Bootstrap · always downloaded',
    legOwn: 'This screen only',
    screensCaveat: 'Computed by walking the import graph, not measured.',
    filterBoot: 'Filter packages',
    filterShared: 'Filter chunks',
    filterScreens: 'Filter screens by name…',
    sortByColumn: 'Sort by this column; again, the other way round',
    shownCount: (shown, total) => (shown === total ? `${total} screens` : `${shown} of ${total} screens`),
    shownRows: (shown, total) => (shown === total ? `${total} rows` : `${shown} of ${total} rows`),
    noMatch: 'No screen matches the filter.',
    colScreen: 'Screen',
    colShared: 'Shared',
    colOwn: 'Own',
    colTotal: 'Total',
    helpTotal: 'Bootstrap + shared + own: what someone landing directly on this screen downloads.',
    helpOwnCol: 'Chunks only this screen loads. If it is large, the screen includes a library just for itself.',
    helpSharedCol: 'Lazy chunks this screen shares with at least one other.',
    whichScreens: 'which screens load it',
    screenParts: 'Where it comes from',
    screenShape: n => {
        const heavy = `${n.files} files, and ${n.heavy} of them are ${n.share} % of the weight`;
        return n.crumbs > 0 ? `${heavy}. ${n.crumbs} are under ${n.crumbMax} (${n.crumbSize}).` : `${heavy}.`;
    },
    origin: 'Source file',
    filesCount: n => (n === 1 ? '1 file' : `${n} files`),
    measureFromScreens: 'Measure it for real',

    // --- eager, lazy and round trips ---
    tagDelivery: { eager: 'eager', lazy: 'lazy' },
    helpDelivery: {
        eager: 'Eager: it downloads with the first load, whichever screen somebody lands on.',
        lazy: 'Lazy: nothing downloads it until a dynamic import asks for it. How many screens do that is the figure next to it.',
    },
    colWaves: 'Trips',
    helpWaves:
        'The browser does not know a chunk exists until it has downloaded and parsed the one importing it. Two round trips means one part of this screen waits for the other to arrive first — the same bytes, later.',
    screenWaves: n => (n <= 1 ? 'Arrives in one round trip' : `Arrives in ${n} round trips, one after the other`),
    startupNote: startup => {
        if (!startup) {
            return 'Round trips of the first load: unknown. Drop the browser/ folder with its index.html and Loadline reads which chunks that page announces.';
        }
        if (startup.late === 0) {
            const all = startup.chunks === 1 ? 'the only bootstrap chunk' : `all ${startup.chunks} bootstrap chunks`;
            return `index.html announces ${all}: the first load is a single round trip.`;
        }
        const late = startup.late === 1 ? '1 chunk' : `${startup.late} chunks`;
        return `The first load takes ${startup.waves} round trips: index.html does not announce ${late} of the bootstrap, so the browser only finds ${startup.late === 1 ? 'it' : 'them'} after parsing.`;
    },
    startupHelp:
        'A chunk named by index.html — the entry script or a modulepreload link — is asked for straight away. One that is not is only discovered once the chunk importing it has arrived, which is another round trip.',

    // --- measured tab ---
    tabMeasured: 'Measured',
    secMeasured: 'What the browser downloads',
    secMeasuredSub:
        'The only figure in the tool that is measured rather than computed. Paste what your browser downloaded and Loadline says where the two differ.',
    howToMeasured:
        "<p>The rest of the report <strong>computes</strong>: it walks the graph of static imports and adds up. This tab <strong>measures</strong>, and the two figures do not match.</p><p>Entering through the root, the router loads an area's chunk in order to match the route, and only afterwards does the guard check the session and redirect. That chunk is already downloaded, and the computation does not count it. That is why the computed figure falls short.</p><p>What gets compared here is <strong>which chunks came down</strong>, not how many bytes either side reported: the set of chunks does not depend on the unit, so a gzip report and a browser reporting transfer bytes still compare cleanly. The difference is then priced with Loadline's own figures.</p>",
    measureState: 'not measured yet · every figure in the report is derived',
    measureTitle: 'Measure what the browser actually downloads',
    measureStep1:
        'Serve the build you loaded and open the app the way people do: through the root, not straight into the route. Disable the cache in the network tab.',
    measureStep2: 'With the screen loaded, run the snippet in the browser console.',
    measureStep3: 'Paste what it gives you back below.',
    measureCopy: 'Copy console snippet',
    measureShowCode: 'Show the code',
    measureHideCode: 'Hide the code',
    measureGain: 'What you get',
    measureGainCompare:
        'The only measured figure in the report, set beside the computed one, with every chunk where the two disagree.',
    measureGainServed:
        'What is served rather than what was built: protocol, round trip, compression and what the cache did — from one machine, once.',
    measureCopied: 'Copied',
    measurePlaceholder: 'Paste the result here. A list of file names copied from the network tab works too.',
    measureRun: 'Contrast',
    measureClear: 'Forget the measurement',
    measureErrEmpty: 'Nothing was pasted.',
    measureErrNoFiles: 'No file name is recognisable in what was pasted.',
    measureErrNoMatch:
        'None of the pasted files belongs to this build. Names are hashed and change on every build: measure the same one you loaded.',
    measureStale: 'The saved measurement does not match this stats.json: they are from different builds.',
    measureScreen: 'Screen measured',
    measureAuto: 'worked out from the chunks that came down',
    measurePicked: 'picked by hand',
    measureRootOnly: 'Bootstrap only: no screen chunk came down.',
    measureFrom: url => `Measured at ${url}`,
    measureComputed: 'Computed',
    measureMeasured: 'Measured',
    measureDiff: 'Difference',
    measureSame: 'No difference',
    measureTransfer: 'Bytes over the wire',
    measureTransferHelp:
        "What the browser said the download cost, as it said it. The other figures are in the report's unit, so these two columns only agree when the report is compressed.",
    measureFiles: n => (n === 1 ? '1 file' : `${n} files`),
    measureExtra: 'Chunks that came down without being predicted',
    measureExtraHelp:
        'The computation only follows static imports. Anything here arrived some other way: the router, a preload, or a file that is not from this build.',
    measureExtraNone: 'None: exactly what was predicted came down.',
    measureMissing: 'Predicted chunks that never came down',
    measureMissingHelp:
        'Either the measurement was taken before the screen finished loading, or they came from the cache without showing up in the list, or the router never gets to request them.',
    measureMissingNone: 'None.',
    measureForeign: n =>
        n === 1 ? 'One downloaded file is not from this build.' : `${n} downloaded files are not from this build.`,
    measureOther: n => `${n} more downloads (CSS, fonts, images) are not counted: Loadline's figures are JavaScript.`,
    measureBelongs: 'Whose it is',
    measureNobody: 'No screen',
    measureZone: { boot: 'bootstrap', shared: 'shared', own: 'single screen' },
    measureNotes: 'What you paste stays in this browser, like everything else.',

    measureObserved: 'Observed environment',
    measureObservedHelp:
        'What this one paste says about the deployment: what is served rather than what was built. It describes the machine that ran the snippet, on the connection it was on, on the day it ran — not your users. None of it moves a threshold in this report.',
    measureTakenAt: date => `taken on ${date}`,
    measureStaleFact: days => `more than ${days} days old — worth taking again`,
    measureProtocol: 'Protocol',
    measureRtt: 'Round trip',
    measureTtfb: 'Document (wave zero)',
    measureCompression: 'Compression served',
    measureCompressionOff: n => (n === 1 ? '1 file uncompressed' : `${n} files uncompressed`),
    measureCacheState: 'What the cache did',
    measureCacheSplit: (fromCache, revalidated, network) =>
        `${fromCache} from cache · ${revalidated} revalidated · ${network} downloaded`,
    measureConnections: 'Connections opened',
    measureThird: 'Third parties',
    measureThirdValue: (requests, origins) =>
        `${requests} requests to ${origins === 1 ? '1 host' : `${origins} hosts`}`,
    measureSw: 'Service worker',
    measureSwOn: 'controlling this load',
    measureSwOff: 'not controlling this load',
    measurePreloads: 'modulepreload tags',
    measureBatches: 'Batches measured',
    measureBatchesValue: (batches, widest) => `${batches} · widest brings ${widest}`,
    measureUnknown: 'the paste does not say',
    dataSource: {
        measured: 'measured',
        derived: 'from the build',
        declared: 'you told us',
        unknown: 'nobody looked',
    },
    dataSourceHelp: {
        measured: 'A browser reported this. One browser, once, from one machine — a real measurement and a narrow one.',
        derived:
            'Computed from the build: the import graph, the chunk sizes, the file names. Exact about what was built, silent about what is served.',
        declared: 'Somebody answered a question. Worth more than a guess and less than a measurement.',
        unknown:
            'Nobody looked. This never becomes an average: a figure assumed on your behalf is one nobody can check.',
    },

    // --- situation tab ---
    tabSituation: 'Situation',
    secSituation: 'Five questions the build cannot answer',
    secSituationSub:
        'Four claims in this report are grey on purpose, because what would settle them is in no folder anywhere. It is here.',
    howToSituation:
        '<p>The rest of the report comes from two places: what the build says and what a browser measured. There is a third one neither of them has, and it is <strong>how your team works and who uses this</strong>. Without it the tool shows the raw fact and refuses to claim a colour, which is right and is not free: a cascade re-invalidating 87 % of the build stays a grey number.</p><p>These five questions are that third place. They are answered once, kept in <span class="mono">loadline.json</span> and read by the command too, so that the terminal and this page cannot say different things about the same build.</p><p><strong>What an answer can do is raise a severity; what it cannot do is lower one.</strong> If answering optimistically switched signals off, the cheap way to a clean report would be to answer optimistically. And “I don’t know” softens nothing: it leaves the report exactly where it was.</p>',
    sitQuestion: {
        navigation: 'How do people move around the application?',
        deploys: 'How often does a new version reach production?',
        returning: 'Of the people who open it on a given day, how many had already opened it this week?',
        connection: 'Where do they connect from, and on what?',
        priority: 'Which is worse: a slow first screen, or a slow move from one screen to another?',
    },
    sitOption: {
        navigation: {
            inAndOut: 'They come in, do one thing and leave',
            allDay: 'They spend the day inside, moving between sections',
            profiles: 'It depends — there are two or three distinct profiles',
            unknown: 'I don’t know',
        },
        deploys: {
            daily: 'Several times a day',
            weekly: 'Weekly, more or less',
            monthly: 'Every few weeks',
            unknown: 'I don’t know',
        },
        returning: {
            most: 'Nearly all of them — it is a work tool',
            few: 'Almost none — most arrive from outside',
            half: 'About half and half',
            unknown: 'I don’t know',
        },
        connection: {
            office: 'Office, laptop, good network',
            mobile: 'Mobile, out and about, patchy coverage',
            worldwide: 'Spread around the world, far from the server',
            unknown: 'I don’t know',
        },
        priority: {
            firstScreen: 'The first one — that is where people decide whether to stay',
            navigation: 'Navigation — whoever gets in is staying anyway',
            both: 'Both equally bad',
        },
    },
    sitTechnical: {
        navigation: 'Median distinct screens per session.',
        deploys: 'Releases per week.',
        returning: 'Share of returning visitors, or warm-cache rate.',
        connection: 'p75 round-trip time and device class.',
        priority: 'Entry LCP against route-transition latency.',
    },
    sitHowTo: {
        navigation: 'Where to look: route-change events per session, in your analytics.',
        deploys: 'Where to look: the tags or releases of the last quarter.',
        returning: 'Where to look: the returning-visitor share in your analytics.',
        connection:
            'This is the one that lies most: people answer it the way they would like it to be. If you have RUM, do not answer it — import it.',
        priority:
            'This one is not looked up anywhere: it is which wait the team would rather pay, and it has to be decided.',
    },
    sitPanel: 'The raw controls',
    sitPanelHelp:
        'The same answer with less rounding, for whoever has it to hand. A figure typed here wins over the option above it.',
    sitRawLabel: {
        screensPerSession: 'Distinct screens per session',
        deploysPerWeek: 'Releases per week',
        returningPct: 'Returning',
    },
    sitRawUnit: { screensPerSession: 'screens', deploysPerWeek: 'per week', returningPct: '%' },
    sitRawEmpty: '—',
    sitRawOr: 'or exactly',
    sitOpen: 'unanswered',
    sitLatency: ms =>
        `The report turns bytes into seconds with a ${ms} ms round trip. That is the figure that really answers this question, and it is edited in Criteria.`,
    sitLatencyGo: 'Edit the latency',
    sitNoRaw: 'No raw equivalent: its unit is two measurements this tool does not take. It is a decision, not a datum.',
    sitRum: 'We have RUM',
    sitRumHelp:
        'If you measure real sessions, the p75 of protocol and round trip comes from there rather than from a console paste or an option in this list. Ticking it retires the fourth question and leaves the latency as the thing to bring over from your own data.',
    sitRumOn: 'The fourth question is not answered: it is imported from your RUM.',
    sitWho: 'Answered by',
    sitWhoPlaceholder: 'a name or a handle',
    sitWhen: 'Date',
    sitWhenPlaceholder: 'yyyy-mm-dd',
    sitWhenInvalid: 'That is not a day of the calendar: write it as yyyy-mm-dd. The date kept is the previous one.',
    sitStale: days =>
        `These answers are more than ${days} days old. Deploy cadence is exactly what changes when a team moves to continuous delivery: go through them again before trusting the figure.`,
    sitNoDate: 'Without a date there is no way to know when they stopped being true.',
    sitAnswered: (answered, total) => `${answered} of ${total} answered`,
    sitReset: 'Clear the answers',
    sitExport: 'Download loadline.json',
    sitExportHelp:
        'The situation block as a file, to commit next to the code. The command reads it, so the terminal stops disagreeing with this page.',
    sitCost: (deploys, returning, perWeek) =>
        `${deploys} releases a week × ${returning} returning = one person pays the update ${perWeek} times a week`,
    sitCostNone:
        'The two answers that turn an invalidation percentage into a cost are missing: how often you deploy, and how many people come back.',
    sitExposure: {
        high: 'the hash cascade is one of the expensive lines in this report',
        moderate: 'the cascade does get paid for, neither every week nor for nothing',
        low: 'the cascade is barely paid for: nearly everybody downloads all of it anyway',
        unknown: 'without both answers, the fact is shown in full and the colour withheld',
    },
    sitBreadth: {
        narrow: 'single-screen sessions: a deferred chunk’s coverage means what it looks like',
        wide: 'sessions that move around: a shared chunk is downloaded by nearly everybody',
        mixed: 'two or three profiles: the median describes none of them, and coverage has to be read per profile',
        unknown: 'without knowing how wide sessions are, a deferred chunk’s coverage is not interpretable',
    },
    sitAsymmetry: 'Answering can raise a signal’s severity. It cannot lower one, and “I don’t know” softens nothing.',
    sitDeclared: 'declared',

    thSource: 'Source',
    thSize: 'Size',
    thChunk: 'Chunk',
    thScreens: 'Screens',
    chunkNoContent: 'nothing of its own to attribute',
    thMain: 'Main contents',
    thOwn: 'This screen only',
    thSharedWith: 'Shared with others',
    thCoverage: 'Coverage',
    thImporters: 'Imported by',
    helpScreens: 'How many lazy screens this chunk appears in.',
    helpSize: 'Size of the file as downloaded: raw or compressed, depending on what you loaded.',
    helpMain: 'The heaviest source file inside the chunk. Helps you recognise it.',
    helpCoverage: 'How many of your screens load this chunk. Above 60 % it downloads on practically every visit.',
    helpImporters: 'Files of your own code importing this package directly, and whether they are all in lazy screens.',
    helpSource: 'npm package or folder of your project.',

    covGlobal: 'effectively bootstrap',
    covWide: 'widely shared',
    covNarrow: 'lightly shared',
    coverageOf: (n, total) => `${n} of ${total}`,
    loadedBy: n => `Loaded by these ${n} screens`,
    contents: 'What it carries',
    pathRawHelp:
        'The per-file breakdown is always uncompressed. Gzip compresses the whole file, using repetitions that cross from one module into the next, so “the compressed weight of this module” does not exist.',
    pathUnattributed: size => `${size} unattributed`,
    pathUnattributedHelp:
        'How much more the chunk weighs than its files add up to: the code the bundler itself adds (the module wrapper, the banners). It belongs to no input file, so it is not shared out among them.',
    treeRawHelp: 'The same chunk uncompressed: the unit of the breakdown inside it, and what other bundle tools show.',
    pathExpandAll: 'Expand all',
    pathCollapseAll: 'Collapse all',
    worthTitle: 'What it costs and where it comes from',
    worthTagSmall: 'Below the threshold',
    worthTagOwn: 'Your own code',
    worthTagPackage: importers =>
        importers === 1 ? '1 package · 1 file of yours' : `1 package · ${importers} files of yours`,
    worthTagCommon: 'No dominant source',
    worthCost: (cost, share, without) =>
        `It adds ${cost} to a typical visit, ${share} % of what people download today before seeing anything. If it disappeared entirely that visit would come down to ${without}: that is the most that can be gained here.`,
    worthSmall: min =>
        `It is below ${min}, the point from which the difference shows: the gain would fall within the normal variation between two builds.`,
    worthOwn: (label, share) =>
        `${share} % of it is your own code (${label}), so the change is yours to make. The usual case is a barrel file re-exporting a whole folder: importing one thing includes the rest, and importing from the actual file is enough.`,
    worthPackage: (pkg, share, importers) =>
        `${share} % of it is ${pkg}, and ${importers === 1 ? 'only 1 file of yours imports it' : `only ${importers} files of yours import it`}: there is one concrete place to check whether those screens need it, or whether it can load only where it is used.`,
    worthCommon:
        'No group reaches half the chunk, or the one that does is imported from a large part of the application: there is no single file to point at. The two ways out left are using less of that library or swapping it for a smaller one.',
    worthNoSplit:
        'Splitting it saves nothing: the bundler groups files by which screens reach them, so both halves would be loaded by exactly the same screens. The only things that bring this figure down are fewer screens importing it, or it weighing less.',
    worthTriage: n =>
        `Of the ${n.namedN + n.spreadN + n.smallN} shared chunks: ${n.namedN} with a named source (${n.namedCost} of a typical visit) · ${n.spreadN} with no dominant source (${n.spreadCost}) · ${n.smallN} below ${n.min}.`,

    sharedSum: (size, chunks, ratio, wide) =>
        `${chunks === 1 ? 'The near-global chunk adds up to' : `The ${chunks} near-global chunks add up to`} <strong>${size}</strong>: whoever opens almost any screen downloads it along with the bootstrap. It counts as bootstrap from <strong>${pct(ratio)}</strong> coverage; widely shared from <strong>${pct(wide)}</strong>.`,
    sharedSumNone: (ratio, wide) =>
        `No shared chunk reaches <strong>${pct(ratio)}</strong> coverage: what is lazy only downloads when it is needed. Widely shared from <strong>${pct(wide)}</strong>.`,

    bootPackages: 'npm packages',
    bootOwnCode: 'Your code',
    entriesCount: n => `${n} entries`,
    importersCount: n => (n === 1 ? '1 file of yours' : `${n} files of yours`),
    importersNone: 'nobody directly · another package imports it',
    importersLazyOnly: (lazy, total) => `${lazy} of ${total} in lazy screens`,
    ownCodeRow: 'project folder',
    legBootPkg: 'npm package',
    legBootOwn: 'Folder of your code',
    legBootBad: 'Few importers, at least one a lazy screen',
    helpBootPackages:
        'Third-party code that ends up in the bootstrap. Getting it down means not importing it from the bootstrap, or moving it into a lazy screen.',
    helpBootOwnCode:
        'Your own code, grouped by project folder. There is no package to remove here: you decide what stays and what becomes lazy.',
    helpBootSplit: (pkg, own) => `${pkg} in npm packages · ${own} in your own code`,
    helpBootPercent: 'The share of the bootstrap this entry takes.',
    helpBootOfBoot: 'of the bootstrap',
    helpBootLazyOnly: max =>
        `At most ${max} files of yours import it and at least one is in a lazy screen, so they can be checked one by one. If they all turn out to be lazy, this package downloads on the first load for people who may never reach that screen.`,
    helpImportsUnknown:
        'Not known: a build folder says what each chunk carries, not which file imports which. The stats.json says it.',
    helpImportersNone:
        'No file of yours imports it directly: another package imports it. It is not removed from your code but from the package that brings it.',
    bootChain: 'How it enters the bootstrap',
    bootChainNone: 'Could not be followed from the entry point over static imports.',
    tagCommonJs: 'CommonJS',
    helpCommonJs: 'Shipped as CommonJS: the bundler cannot tree-shake it and every imported file comes in whole.',
    loadedFrom: 'Loaded from',

    treeAll: 'Everything',
    treeBoot: 'Bootstrap',
    treeLazy: 'Lazy',
    treeShared: 'Shared',
    treeOwn: 'Single screen',
    treeScreens: n => (n === 1 ? '1 screen' : `${n} screens`),
    filterTree: 'Filter by chunk, package or folder…',
    treeCrumbs: (n, total, line) => `${n} chunks below ${line} · ${total} between them`,
    treeNoMatch: 'Nothing matches the filter.',
    shapeTitle: 'How it is divided',
    treeShare: (share, zone) =>
        zone === 'boot'
            ? `${share} % of the bootstrap`
            : zone === 'shared'
              ? `${share} % of what is shared`
              : `${share} % of what one screen loads`,
    treeShareHelp:
        'How much of its zone this one chunk holds. Marked from 25 %: that is where the weight is, and therefore what to look at before the rows below it.',
    shapeSplit: eager => `${eager} % of it downloads on every load; the rest only when something asks for it.`,
    shapeZone: { boot: 'Eager · everybody pays', shared: 'Lazy, several screens', own: 'Lazy, one screen' },
    shapeNote: n => {
        const of = { boot: 'of the bootstrap', shared: 'of what is shared', own: 'of what one screen loads' }[n.zone];
        // The second half does not repeat the zone when the first one has already named it.
        const heavy = n.heavy ? `${n.share} % ${of} sits in a single file` : '';
        const which = heavy ? '' : ` files ${of}`;
        const crumbs =
            n.crumbs > 0 ? `${n.crumbs} of the ${n.files}${which} are under ${n.crumbMax} (${n.crumbSize})` : '';
        return `${[heavy, crumbs].filter(Boolean).join(', and ')}.`;
    },
    helpZoneAll: 'Every chunk the bundler produces, whoever ends up paying for it.',
    helpZoneBoot: 'Bootstrap (grey): downloaded always, by everyone, whichever screen they land on.',
    helpZoneShared: 'Shared (orange): several lazy screens load it, so more than one pays for it.',
    helpZoneOwn: 'One screen (green): only somebody entering that screen downloads it.',
    helpTreeBar: percent => `It takes ${percent} % of the largest chunk in the list.`,

    tabSearch: 'Search',
    secSearch: 'Search the bundle',
    secSearchSub: 'Type the name of a package or a file and see where it is and what imports it.',
    howToSearch:
        '<p>The rest of the report answers <strong>what is heavy</strong>. This answers the other question: <strong>is this in there?</strong> Type a name and see which chunks carry it, how much in each one, which screens pay for it and the chain of imports that brings it in.</p><p>Files of <code>node_modules</code> are grouped by package, because that is the unit a decision is taken about; project files stay one per file, because that is the unit that gets edited. A package also matches on the names of its files, so searching <code>md5</code> finds <code>crypto-js</code>.</p><p>If nothing comes up, that name is not in the bundle.</p>',
    searchPlaceholder: 'Package or file name…',
    searchHeaviest: (shown, total) => `The ${shown} heaviest names, out of ${total} in this build.`,
    searchTooShort: 'Type at least two letters.',
    searchNoMatch: query => `Nothing called “${query}” is in the bundle. It does not enter the build.`,
    searchFound: (shown, total) => (shown === total ? `${total} matches` : `${shown} of ${total} matches`),
    searchKindPackage: 'package',
    searchKindFile: 'project file',
    searchInBoot: 'every load of the app pays for it',
    searchPartlyBoot: size => `${size} of it is in the bootstrap, and that every load pays for`,
    searchScreensCount: n => (n === 1 ? 'loaded by 1 screen' : `loaded by ${n} screens`),
    searchMatchedIn: n => (n === 1 ? 'matches in 1 file' : `matches in ${n} files`),
    searchCopiesTag: n => `${n} copies`,
    searchChain: 'How it gets in',
    searchChainNone: 'Could not be followed from the entry point.',
    whyHere: 'Why is this here',
    whyHereOf: name => `Why ${name} is here`,
    whyHereNone:
        'Nothing reachable from the entry point imports it. It is in the build, and no chain of imports leads to it.',
    searchPlaces: 'Which chunks carry it',
    thZone: 'Which zone it is in',
    helpZone:
        'The bootstrap is paid by everyone; a shared chunk by the screens loading it; an own one only by its screen.',
    searchTwice: 'It is in more than one chunk: paid once per chunk.',
    seeInSearch: 'Search it in the bundle',

    dupCopy: copy =>
        copy.version ? `version ${copy.version}` : copy.under ? `copy inside ${copy.under}` : 'top-level copy',
    dupZone: { boot: 'in the bootstrap', shared: 'in a shared chunk', own: 'in a single screen' },
    dupBroughtBy: 'Comes in through',
    dupImportedBy: 'Imported by',
    dupNobody: 'nothing of yours directly',

    noScreens: 'No lazy screens found. The whole app is in the bootstrap.',
    noShared: 'No lazy chunk is shared by two screens.',
    footer: 'Everything is computed in your browser from the metafile: nothing is uploaded anywhere. Raw figures are bytes on disk; compressed ones are gzipped from the real files, which is what your users actually pay. The browser cannot compress in brotli, so that figure only appears when the folder brings the pre-compressed .js.br files; without them, count on brotli being 15 % to 20 % below the gzip you see. Press ? for the keyboard shortcuts.',

    // --- three views drawn from figures the report already has ---
    diffTitle: 'What changed in the bootstrap',
    diffSub: (before, after, diff, baseline) =>
        `${before} → ${after} (${diff}) against ${baseline}. Each area is what the part weighs now; its colour, how it moved.`,
    diffChange: { new: 'new', grew: 'grew', shrank: 'shrank', same: 'unchanged', gone: 'gone' },
    diffOwn: 'your code',
    diffGone: 'No longer in the bootstrap',
    diffEstimated:
        'The changes are raw weights at the ratio the bootstrap compresses by: the right size, not the exact one, hence the ≈.',
    diffPackagesOnly:
        'Packages only: the baseline was exported before the folders of your own code were recorded, so they are drawn without a change.',
    diffTile: (name, size, change) => `${name}, ${size}, ${change}`,
    gridTitle: 'Screens × packages',
    gridSub:
        'What each screen downloads from each package. A column full from top to bottom is something every screen pays for, whether or not it uses it.',
    gridBoot: 'In the bootstrap',
    gridLazy: 'Loaded with the screen',
    gridOwn: 'your code',
    gridRest: 'the rest',
    gridTotal: 'Screen total',
    gridCell: (screen, size, what) => `${screen} carries ${size} of ${what}, raw, inside its chunks`,
    gridScale: { less: 'less', more: 'more' },
    gridRaw: 'Raw minified bytes inside the chunks; the total is in the report’s unit.',
    tripsTitle: 'How it loads, trip by trip',
    tripsNote:
        'An estimate, not a measurement: the report’s round trips laid out on a time axis, with a standard connection profile. Each gap is a round trip spent waiting before the first byte.',
    tripsProfile: { slow4g: 'slow 4G', fast4g: '4G', cable: 'cable' },
    tripsBoot: 'first load',
    tripsScreen: 'this screen',
    tripLabel: index => `trip ${index}`,
    tripsWait: 'waiting',
    tripsParse: 'parse',
    tripsTotal: (time, trips) => `≈ ${time} to have everything, in ${trips} ${trips === 1 ? 'trip' : 'trips'}`,
    tripsAssumed:
        'Without index.html the first load is drawn as one trip: the graph alone cannot tell which of its chunks the page names.',
    tripBar: (index, wait, transfer, size, files) =>
        `Trip ${index}: ${wait} waiting, ${transfer} transferring ${size} in ${files} ${files === 1 ? 'file' : 'files'}`,

    errNoEntries: 'This does not look like an esbuild metafile: no entry points found.',
    errNoMain: 'Could not identify the main entry point.',
    errNoOutputs: 'The JSON is shaped like a metafile but has no "outputs" key.',
    errNotMetafile: 'The JSON is not a metafile in any format this reads.',
    errExpected:
        'What is expected is the build folder, the one holding the index.html — enough for anything that emits ES modules: Vite, Rollup, SvelteKit, Nuxt, Astro — or a stats file: the metafile Angular 17 or later writes with `ng build --stats-json` (an object with "outputs" and "inputs"), or the stats.json of webpack (`webpack --json`).',
    errNotEsmGraph:
        "The chunks of this folder are webpack or Turbopack output, not ES modules: their imports are numbers resolved at run time by the loader, so there is no graph in the files to read. The build's stats file has it, and Loadline reads it: `ng build --stats-json` on Angular 16 or earlier, `webpack --json > stats.json`, `react-scripts build --stats` on Create React App, `vue-cli-service build --report-json` on Vue CLI. Put it in the folder, or drop it with the folder, and the figures stay compressed. Next.js with Turbopack writes no such file.",
    entryLabel: 'The script the application starts at, with * for the hash:',
    entryBtn: 'Read the folder with it',
    errNoPage:
        'No index.html in the folder names a script of the folder the application starts at — no <script src>, no import() and no file name in an inline script — and without it there is no way to tell the entry chunk from a shared one: a bundler writes the shared code into the entry chunk, so the entry ends up imported by its own children. Add the page to the folder, load the stats.json of the build, or name the script it starts at: --entry "main.*.js" in the command, the field under this message in the page, or { "build": { "entries": ["main.*.js"] } } in loadline.json.',
    errFolderUnreadable:
        'The browser would not let this page read the folder dropped on it. Chrome does that to a page opened from the disk (file://): the folder arrives, and listing what is inside it fails. Choose the same folder with "Choose build folder", which it does allow, or write the page with the build already in it: npx @bymaksym/loadline <folder> --html loadline.html --open.',
    errWebpackStats:
        'This is a webpack stats.json with no chunk in it that writes a script, so there is nothing to analyse: it was written with `chunks` or `assets` turned off. Write it again with the defaults — `webpack --json > stats.json`, `ng build --stats-json` — which carry chunks, modules and the reasons each module is in.',
    errViteManifest:
        'This is not an esbuild metafile but a Vite manifest.json. It is not needed: drop the build folder itself and Loadline reads the graph out of the chunks, which is where Vite actually writes it.',
    errVisualizer:
        'This is not an esbuild metafile but rollup-plugin-visualizer output. Loadline reads the esbuild metafile, which is a different thing.',
};
