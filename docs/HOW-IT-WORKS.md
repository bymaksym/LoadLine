# How Loadline works

[← Back to the README](../README.md)

---

## 1. The idea

The browser does not download your project. It downloads a handful of JavaScript files your bundler
built by fusing hundreds of source files together, and how it grouped them decides whether opening
the app costs 400 kB or 900 kB. Loadline reconstructs that grouping and reports it **per screen**
rather than per file.

There are two ways one file can reach another, and they mean opposite things:

```ts
import { thing } from './b'; // static: A and B always travel TOGETHER
const { thing } = await import('./b'); // dynamic: B travels separately
```

| Group                              | What it is                                        | When it downloads         |
| ---------------------------------- | ------------------------------------------------- | ------------------------- |
| **Bootstrap** (`initial`, `eager`) | Reachable from the entry point via static imports | Always                    |
| **Lazy**                           | Whatever hangs off a dynamic import               | When that code is reached |

In Angular, `loadComponent`, `loadChildren` and `@defer` are dynamic imports; everything else is
static.

**The blind spot.** When two lazy screens use the same thing, the bundler does not duplicate it — it
builds a third, shared chunk, which appears in the lazy list. If every screen imports that chunk, it
downloads every time anyway. Counting how many screens reach each chunk is what the rest of this
document is built on.

---

## 2. The algorithm

Everything comes from one graph: which source file ended up in which chunk, how many bytes each
contributes, and who imports whom. The esbuild metafile records it directly; a build folder is read
for it instead when there is no metafile (§5). From here on the two are the same thing — the
algorithm never learns which one it got.

### 2.1 Reachability over static imports

```js
const reach = start => {
    const seen = new Set();
    const stack = [start];
    while (stack.length) {
        const file = stack.pop();
        if (!file || seen.has(file) || !outputs[file]) continue;
        seen.add(file);
        for (const imp of outputs[file].imports || []) {
            if (imp.kind === 'import-statement') stack.push(imp.path); // <- static only
        }
    }
    return seen;
};
```

Filtering on `import-statement` is the whole trick. A `dynamic-import` is the lazy boundary:
following it would merge everything and report the entire bundle every time.

### 2.2 Finding the main entry

An output is a **lazy entry** when some other output has a `dynamic-import` pointing at it. The main
entry is one that is not. Several candidates can exist — some libraries emit a stray entry, such as a
worker — so the one reaching the most code wins:

```js
const mainChunk = rootCandidates.map(([k]) => [k, reach(k).size]).sort((a, b) => b[1] - a[1])[0][0];
const alsoStarted = rootCandidates.filter(([k]) => k !== mainChunk && announced.has(baseName(k)));
const initial = new Set([mainChunk, ...alsoStarted.map(([k]) => k)].flatMap(k => [...reach(k)]));
```

⚠️ **An application does not have to have one entry chunk.** Angular's polyfills are a second one and
SvelteKit starts two, its router and the application, from a script inside the page. Taking the main
one alone left real bootstrap chunks out of the figure everybody pays. What decides is the page: an
entry nobody announces is not downloaded on the first load and stays out, which is what keeps the
worker out.

### 2.3 Detecting screens

Lazy entries whose `entryPoint` is your own code:

```js
const routes = entries
    .filter(([k]) => lazyTargets.has(k))
    .filter(r => !/node_modules/.test(r.source)) // xlsx, pdf.js: not screens
    .filter(r => !/\.routes?\.(t|j)s$/.test(r.source)); // grouping files own nothing
```

⚠️ **Both filters came out of testing.** Without the first, `FileSaver.min` and `xlsx` showed up as
screens — an `await import('xlsx')` produces a lazy entry too. Without the second, routing files
clutter the list with rows that are nobody's screen.

Three more rules joined them:

- **A lazy entry that only views import lazily is a piece of a screen, not a screen.** This is the
  rule that keeps the table honest as `@defer` spreads; see §5.
- **A screen has to be reachable from where the application starts**, following both kinds of import.
  A folder nobody cleans still holds the previous build, and those old chunks were taking rows in the
  table while none of their bytes appeared in any figure.
- **Data is not a screen.** `import('./locales/ru-RU.json')` produces a lazy entry exactly like a
  route does. Excalidraw lazy-loads fifty languages, and its table came out with sixty-one rows for
  an application with one screen. Data entries are listed separately.

### 2.4 Splitting the cost

For each screen: what it reaches, minus the bootstrap, split into what only it loads and what it
shares.

```js
const lazy = [...r.set].filter(c => !initial.has(c));
const own = lazy.filter(c => routeCount.get(c) === 1);
const shared = lazy.filter(c => routeCount.get(c) > 1);
const total = bootBytes + sumOf(lazy);
```

`routeCount` — how many screens reach each chunk — is the figure the whole tool is built around.

### 2.5 Compressing

Each file in the build folder is gzipped in the browser with the native API:

```js
const stream = file.stream().pipeThrough(new CompressionStream('gzip'));
```

**At which level.** zlib's default, 6. `CompressionStream('gzip')` in the browser and `createGzip()`
in the command are the same library at the same setting, which is why the page and the terminal print
the same figure for the same file, and it is what nginx, Apache and most CDNs serve at by default. A
server tuned to 9 sends slightly less and one tuned to 1 slightly more — a few per cent, in the same
direction for every file, so it moves the headline and not the ordering.

**What is compressed is the file, never its parts.** Gzip works on the whole chunk, using repetitions
that cross from one module into the next, so "the compressed weight of `date-fns` inside this chunk"
is not a quantity that exists. The breakdown inside a chunk is therefore always raw, even while the
report is in compressed figures. To keep the two units from being confused, the chunk's row carries
its raw size under the compressed one, and the head of its file tree says `raw` and how much of the
chunk is unattributed. Those bytes are the bundler's own code — module wrapper, banners — which
belongs to no input file. The sum of the files plus that remainder is the raw size on the row, when
the two measurements agree, which is checked rather than assumed (§3.23). Other tools
(`esbuild-visualizer`, Sonda) show the raw figure as the chunk's headline, which is why their numbers
look nothing like Loadline's until both are read in the same unit.

**Brotli.** The browser cannot compress in brotli: `CompressionStream` offers gzip and deflate only.
`brotli-wasm` ships 1,057 kB of `.wasm`, almost three times the whole of Loadline, and in a
self-contained HTML file that is paid in base64 — measured and dropped. What works instead: when the
folder brings pre-compressed `main-ABC.js.br` files, their size on disk **is** the brotli figure, with
nothing to decompress. Both figures are then available and Criteria picks which drives the report;
the brotli thresholds are the gzip ones minus 15 %, which is how much more it compresses (measured on
this build: 0.865 and 0.856). Without `.br` in the folder, the Criteria tab warns that a red just
above the threshold may not be red in production.

### 2.6 Searching by name

The rest of the report answers _what is heavy_. The question that actually turns up is the other way
round — "are we still shipping `moment`?" — and it used to mean opening chunk after chunk.

The index is built once per analysis from what is already in memory: every file that ships bytes,
with the chunks it lands in. Files under `node_modules` are grouped by package, because that is the
unit a decision is taken about; project files stay one per file, because that is the unit that gets
edited. A package also matches on the names of its files, so `md5` finds `crypto-js`.

Each result says which chunks carry it, how much in each, which screens load it, and the import chain
that brings it in. Two details that came out of real use:

- **The zone is that of the heaviest chunk, not the worst one.** PrimeNG landed in five chunks of one
  app: 612 kB in a shared one and 145 kB in the bootstrap. Calling it "bootstrap" would say every load
  pays 772 kB for it, and it pays 145. It says "shared", and underneath, how much falls in the
  bootstrap.
- **Finding nothing is an answer.** "Nothing called _moment_ is in the bundle" could not previously be
  established without walking everything and still being unsure.

### 2.7 What a shared chunk costs, and where the cost comes from

A tab saying "58 kB across 44 of 47 screens" leaves the reader with the next question: is that as bad
as it looks, and which part of it is the weight? Three things can be computed for it
(`core/worth/worth.ts`).

**What it really costs: size × coverage.** 58 kB loaded by 44 of 47 screens costs 54 kB on a typical
visit; the same 58 kB loaded by 5 of them costs 6 kB. Same row in the size column, ten times the cost.
That weighted figure is what the report ranks and prices with, and next to it goes what a typical
visit would weigh with the chunk gone — the ceiling of any fix.

**Splitting a shared chunk saves nothing.** esbuild builds one chunk per distinct set of entry points
that reach a module, so every file inside a chunk is reached by exactly the same screens; cutting it
in two produces two chunks the same screens load. This follows from how the split is made, and it
retires the first idea most people have on seeing the tab. What lowers the figure is fewer screens
importing the thing, or the thing weighing less.

**Where the weight comes from** depends on what the chunk carries, and the analysis already groups it
by package and by project folder:

| What dominates it (≥ 50 %)            | Tag                    | Because                                                                 |
| ------------------------------------- | ---------------------- | ----------------------------------------------------------------------- |
| Nothing — the cost is under the floor | Below the threshold    | The gain is lost between any two builds                                 |
| A folder of your own code             | Your own code          | Nothing to negotiate: usually a barrel file re-exporting a whole folder |
| A package few of your files import    | 1 package · N of yours | Few importers is an address: one place to check whether it is needed    |
| A package imported from all over      | No dominant source     | No single file to point at; using less of it is the way out             |

The thresholds are the criteria already in the tool — the minimum size for a shared chunk to be a
signal, and the number of importers above which a package counts as infrastructure — so the tag moves
when the reader moves them.

**The tags describe the measurement, they do not rate the work.** An earlier version said "not worth
it" and "no easy fix": both are claims about somebody else's project, and a reader who knows better
can simply be right. "No dominant source" is a statement about the import graph, which the reader can
open and check. The cost figure ranks, the tag says where to look, the conclusion stays with whoever
draws it.

The tab totals them at the top: of the chunks almost everybody downloads, how many have a named
source and how much of a typical visit they account for.

### 2.8 The shape of the split

Every other figure judges one thing — this chunk, that screen, this package. After a list of a hundred
chunks, the question none of them answers is whether the build is **well divided**.

That is not a property of any row. More chunks is not better and fewer is not better: what matters is
that what a screen needs at once arrives in few pieces and what it may never need stays apart. So it
is measured on the distribution (`core/analysis/shape.ts`), with two numbers per zone:

- **Concentration**: how much of a zone sits in its largest chunk. Fifteen shared chunks where one
  holds 93 % is a different situation from fifteen even ones, and a list of fifteen rows hides it.
- **Crumbs**: how many pieces are under 5 kB, and what they add up to. One crumb is fine; many
  arriving together is a split that went further than it helps.

The same reading applies to a single download (`granularityOf`), which is what a screen's detail says:
"29 files, and 4 of them are 80 % of the weight. 19 are under 5 kB."

⚠️ **It never says a number of chunks is wrong.** A small chunk that is genuinely lazy is doing its
job (§3.14), so the block is descriptive on purpose: a few lines of fact above the list.

**How the block is ordered.** Two questions, nested: **when** each part comes down — eager or lazy,
the split every bundler reports — and, inside the lazy half, **who pays** for it. The three zones were
there first and are strictly finer, but reading "how much of this app is deferred at all" meant adding
two of the three rows in your head. So lazy is a line of its own with shared and own hanging from it,
and a bar above them carries the same three colours with a gap where eager ends. The filter buttons
follow the same order. In the tree, a chunk holding at least a quarter of its zone carries that figure
on its row — zone and size were already there, and the division of one by the other is what says
whether a row is where the weight is.

### 2.9 When a chunk arrives, and in how many round trips

**Eager or lazy** falls straight out of §2.1 and is a second name for what the report calls the
bootstrap. It is shown anyway because "lazy" is the word people arrive with, and putting it next to
"19 screens load it" is what makes the contradiction land.

**Round trips** is the part no bundler reports. A browser does not know a chunk exists until it has
downloaded and parsed the one importing it, so entering a screen costs at least two sequential
requests — the screen's chunk, then the shared chunks it imports — and three if one of those imports
another. Breadth-first from the screen's entry chunk over static imports, stopping at the bootstrap
because that is already there:

```js
const trips = wavesFrom(outputs, [screen.chunk], boot);
```

The distance is the shortest one, because the browser asks for a chunk as soon as the first parent
mentioning it is parsed. The count is per screen: the same shared chunk can be the second trip for one
screen and the third for another. It matters because two screens of 240 kB are not the same screen —
one trip at 200 ms of latency is 200 ms, three is 600 ms, and a table of bytes shows them as
identical.

**The first load is a separate calculation.** For the bootstrap the graph is not enough: Angular writes
the entry script and a `modulepreload` link per initial chunk into `index.html`, and everything that
page names is requested at once regardless of its depth in the graph. A bootstrap chunk it does not
name is discovered by parsing, which is another trip. So the figure only exists when the build folder
was loaded with that page; without it, Loadline says "not known" rather than printing a number derived
from the wrong thing. The page is read with regular expressions rather than `DOMParser`, so the
command and the browser read it the same way.

---

## 3. The signals

A number on its own is not a problem. What turns data into something worth touching is context: how
many people pay for it, who really uses it, and what fixing it costs.

### 3.1 Common code dressed as lazy

**Fires when** a chunk is imported by ≥ 60 % of screens and weighs more than 50 kB.

It is not lazy in any useful sense; it always downloads.

**What not to do**: split it on reflex. If most of the weight really is used by nearly every screen —
a table, form fields, the sidebar — splitting redistributes it rather than removing it. What pays off
is pulling out the components a **single** screen uses.

### 3.2 Bootstrap for a lazy screen

**Fires when** a package over 25 kB sits in the bootstrap, is imported by ≤ 4 files, **and at least
one of those files is a lazily loaded screen**.

⚠️ **That last condition is what makes the signal useful.** The obvious criterion — "few files import
it" — also flags your theme, which one file imports and which genuinely is needed before first paint.
What separates a real candidate is that its consumer lives in a lazy screen. The case that produced
it: a Microsoft sign-in library registered in the bootstrap config whose real consumer was the login
screen, downloaded by everyone including people who already had a session.

⚠️ **The label says "≤ 4 importers, at least one lazy", not "only lazy screens import it".** The
second is a stronger claim than the rule makes: a package with three bootstrap importers and one lazy
one matches too. The row carries the count (`2 of 3 in lazy screens: login, microsoft-callback`),
which is checkable and says which of the two cases the reader has.

**Where to touch**: the signal gives the import chain the package enters through and the routes file
that loads the screen. Both come from the metafile's `inputs` graph — the chain is the shortest path
over static imports from `main.ts` to the package (`main.ts › app.config.ts ›
core/config/msal.config.ts › @azure/msal-browser`), and the routes file is the one doing the
`import()` of the screen. The last file of yours in the chain holds the import to move; the routes
file is where the providers go.

### 3.3 Large source file

**Fires when** one of your own files exceeds 20 kB inside the bootstrap.

Usually a constants table — translation keys, catalogues, routes — pulled in whole because it is
referenced from everywhere. Check the compressed size before touching it: repetitive text compresses
enormously, and what looks like the second-biggest problem raw can be irrelevant.

### 3.4 Duplicate versions

**Fires when** the same package appears at two versions in the metafile paths.

You pay the weight twice because two dependencies ask for incompatible ranges. Knowing there are two
says nothing about what to do, so each copy is followed separately and reported with its import chain,
its size, whether it lands in the bootstrap and who imports it. With that, the fix is decided without
opening the lockfile: if both copies come in through dependencies you asked for, align the versions in
`package.json`; if one is dragged in by a dependency of a dependency, the resolution has to be forced.
In the application this was checked against, `@primeuix/utils` 0.7.2 came in through `primeng` and
0.6.4 through `@primeuix/styled`, neither asked for directly, so aligning `package.json` would have
moved nothing.

Only a copy that actually weighs something in some chunk counts: a version resolved but tree-shaken
away is not paid twice.

### 3.5 Expensive screen

**Fires when** a screen carries more than 6× the median of its own code, and over 100 kB.

It drags in a heavy library for itself alone. If that library is only needed once you open something
_inside_ the screen — a viewer, an editor, a chart — it belongs in a deferred block.

### 3.6 Against the previous measurement

These fire only with a baseline loaded: the previous build's `stats.json`, a Loadline export, or the
whole previous build folder. Both measurements are always compared in the same mode — a bare previous
`stats.json` is compared raw even if the report is compressed, and the table says so. For compressed
against compressed, give the previous folder with its `stats.json` inside.

- **The bootstrap has grown** — by 10 % and 10 kB or more, editable under Criteria.
- **A package has entered the bootstrap** — an npm package that was not in the baseline's. Project
  folders do not count: they change with every commit.
- **A screen has grown** — shared + own is compared, **without the bootstrap**. Comparing totals, a
  bigger bootstrap would flag all twenty screens at once.

⚠️ **One trap remains**: when a near-global shared chunk grows, every screen loading it goes up by the
same amount — in one real app, 19 screens at "+247 kB". So when most screens grow by about the same
amount, the signal changes: it says a shared chunk grew and sends you to that tab, not to 19 places.

### 3.7 The size budget that does not apply

These fire only with `angular.json` loaded; the pipeline ones also need `.gitlab-ci.yml` or the GitHub
workflow. With `package.json`, scripts are followed: `pnpm run build:pre` → `ng build
--configuration=preproduction`.

- **The strictest budget lives in a configuration the pipeline does not build.** Angular only checks
  the `budgets` of the configuration it builds. This is the failure that motivated the tool: in one
  app the 1.5 MB budget lived in `production` while the pipeline built `development` (no budget) and
  `preproduction` (3 MB).
- **The budget cannot fire** — `maximumError` is more than twice the current raw bootstrap.
- **The budget only warns** — a `maximumWarning` with no `maximumError`. A warning in the build output
  is read the first time and ignored the second.
- **No configuration declares a budget.**

Angular's budgets measure initial JS + CSS uncompressed; Loadline compares against the raw bootstrap
JS, and the difference is the few kB of `styles.css`.

### 3.8 No zone.js

Informational, not counted towards the verdict. Detected from the polyfills in `angular.json` or from
the absence of `zone.js` among the dependencies. It rules out the material about change detection
cycles, `NgZone` and `runOutsideAngular` up front: in a zoneless project there is nothing to optimise
there.

### 3.9 CommonJS package

**Fires when** a file under `node_modules` has `format: "cjs"` in the metafile. To review when the
package sits in the bootstrap, informational when only some screens load it.

A CommonJS package cannot be analysed at build time, so every file of it you import comes in whole
even for a single function. It is the same warning Angular prints ("CommonJS or AMD dependencies can
cause optimization bailouts"), with the size, the zone it lands in and who imports it — or which
package drags it in, when no file of yours imports it directly.

It comes from the metafile rather than the build output because esbuild records the format of every
file it processes: nothing to paste, no `package.json` under `node_modules` to read, and no false
positive from grepping `"type"` and hitting `"type": "git"`.

The size is raw and is what the file takes inside the chunk. Adding the package to
`allowedCommonJsDependencies` only silences the warning.

### 3.10 Against the browser's measurement

**Fires when** somebody pastes what their browser downloaded into the Measured tab. Three signals:
measured above computed, the router loading an area the guard then rejects, and measured below
computed (informational).

**What is compared** is the set of chunks, not the byte figure. A chunk that came down without being
predicted is a fact, whatever unit the report is in. Only afterwards is the difference priced with
Loadline's own figures.

**How it is attributed to a screen**: the one that best explains what came down — every chunk of its
own present counts, every one missing counts against — overridable by hand. If only the bootstrap came
down there is no screen, and that is the right answer.

**Where the guard signal comes from**: extra chunks exclusive to other screens. It is not "the
computation falls short", it is "this screen paid for that one". The fix is `canMatch` rather than
`canActivate`: the first discards the route without requesting its chunk, the second runs once it is
already down.

CSS, fonts and images are not counted — Loadline's figures are JavaScript. A downloaded `.js` that is
not from this build is shown separately: it almost always means a different deployment is being
measured.

### 3.11 Every language of a library

**Fires when** a package ships three or more distinct languages adding up to 10 kB or more. To review
in the bootstrap, informational otherwise.

A library that keeps its languages in a `locale/` folder ships all of them when imported from its
root, and then one gets used. It is the single largest cut reported in the field — one team went from
443 MB to 46 MB of build output by excluding locale files — and it hides well, because no individual
file is big.

**Why languages and not files**: `date-fns` splits one language across ten files under
`locale/en-US/_lib/`, so counting files would report ten languages where there is one. Distinct codes
are counted instead, looked for in the two places libraries put them: the file name
(`moment/locale/es.js`, `primelocale/es.json`) and the folder right after `locale/`
(`date-fns/locale/es/index.js`). There is no list of package names, because a list would be right for
the libraries in fashion today and wrong for next year's; the folder convention is older than any of
them.

### 3.12 Data travelling as code

**Fires when** `.json` files inside the bundle add up to 10 kB or more, once the ones already reported
as languages are taken out. To review in the bootstrap, informational otherwise.

An `import` of a data file is not a reference: the content ends up embedded in a chunk of JavaScript,
downloaded and parsed with it. A list of countries for a dropdown is the usual case. Fetched with a
request instead, it caches on its own, does not block startup, and changing it does not invalidate the
JavaScript.

### 3.13 Source maps in the folder you deploy

**Fires when** the build folder brings `.js.map` files. Informational always: Loadline cannot know
whether that folder is the one deployed, and says so instead of accusing.

A source map reconstructs your source from the compiled output. It does not weigh on the download —
the browser only asks for it if somebody opens the tools — but if those files reach the server,
whoever knows the URL has your code. `"sourceMap": { "scripts": true, "hidden": true }` generates them
without linking them from the bundle, which is what you want in order to upload them to an error
tracker; the part that gets forgotten is that not linking them is not the same as not serving them.

It is the one finding in the report that is not about size, and it costs nothing, since the folder is
already read for the compressed figures.

### 3.14 Many requests for one screen

**Fires when** the typical screen downloads more files than `screenFilesMax` (30 by default, editable)
**and** at least five of them are under 1 kB. To review.

The one figure in the report that is not about bytes. Each file is a request, a cache entry and a
module wrapper; below a kilobyte, asking for it costs about what it holds.

**Why two conditions**: a file count on its own says "your application is large", which is not a
finding. The two together say "this is split further than it helps", which is.

**Why what a screen loads and not the build's chunk list**: a small chunk is not a problem when it is
genuinely lazy. A 5 kB chunk for an admin screen hardly anybody opens is doing its job — those 5 kB
never download. Only code that arrives **together** counts, so the signal looks at the bootstrap plus
what that one screen pulls in.

**What it does not claim**: that chunks under 30 kB are bad, which is the shape this rule usually
takes and is wrong; or that more requests are worse, which over HTTP/2 and HTTP/3 they are not.

**What to do**: the split is nobody's decision. The bundler makes one chunk per distinct set of
screens reaching a module, so many chunks means many combinations. They come down by removing
combinations — a barrel file imported by a handful of screens produces one chunk per mix — and merging
by hand (`manualChunks`, `ngx-build`) can make caching worse.

### 3.15 Your own code in the bootstrap for a deferred screen

**Fires when** folders of your own code in the bootstrap, whose files are imported by at least one
deferred screen and held there by no more than four files that are not screens, add up to half of what
a package has to weigh to be named. To review.

The same question §3.2 asks of an npm package, asked of your code: a service imported by
`app.config.ts` and by one page downloads on every visit, while the page it was written for is
deferred.

**Why by folder and not by file.** Written per file first, it found nothing on a real build: the
business layer was in the bootstrap across thirty files of one to three kilobytes each, every one far
below any size worth naming and together a layer that should not be there. The folder is the unit the
problem has. The size floor applies to the **total** for the same reason one level up — one folder of
two kilobytes is noise, the same layer across six of them is a pattern — while the structural
condition is checked per folder.

**What it insists on**: the list of files keeping it in the bootstrap, all of them. Moving the first
and leaving the other two changes nothing, which is the mistake the signal exists to prevent. If the
bootstrap file that imports it genuinely needs it, there is nothing to move and the signal is a fact
rather than a task, which the text says.

### 3.16 The first load in several round trips

**Fires when** `index.html` was read and does not name every chunk of the bootstrap, so the browser
only discovers one of them after parsing another. To review.

What §3.5 says about a screen, said about the one load nobody skips. A chunk the page names — the
entry script or a `modulepreload` link — is requested straight away; one it does not name waits for
the chunk importing it to arrive and be parsed. Same bytes, one round trip later, in front of the
first paint.

**Why it has no threshold**, while everything else weighs something against a criterion: "how many
files is too many" is a judgement and this is not one. Either the page names the whole bootstrap or it
does not.

**What to do**: a `modulepreload` link for the missing chunks. Angular emits them for the initial
chunks and Vite has `build.modulePreload`; when that is switched off, this is the bill. If those
chunks turn out not to be needed before the first paint, deferring them is the better fix, because
then the first load also weighs less.

### 3.17 A folder without source maps

**Fires when** the graph was read from the folder and the folder carries no `.js.map`. Informational
always: not a problem with the build, a shorter report.

The weight of each chunk is known and what is inside it is not. Screens end up named after their chunk
file — `0fPdmq0U.js` rather than `orders` — and there is no breakdown by package and no chain from the
entry point. Everything else comes out in full. It exists because two real builds, elk and immich,
neither of which publishes maps, came out as a page of hashes with nothing to explain them.

### 3.18 What the report cannot reach

**Fires when** some JavaScript of the build is imported by nothing reachable from the entry point, by
either kind of import. A problem when those chunks are most of the bytes, informational otherwise.

The only signal about the report rather than about the build. Three things land here, with a different
answer each: a **service worker**, which is not part of any load a browser makes from the page; an
`import()` whose **path is built at run time**, which VitePress writes one of per page; and the
**leftovers of a previous build** in a folder nobody empties.

**Why the share decides the severity**: the Vue documentation site has 244 chunks and 233 of them —
9.2 MB — are page chunks reached that way. Describing the other eleven and saying nothing about those
is the report describing a corner of the build in the voice it uses for the whole of it. Two service
workers in a 45 MB folder are a footnote, and printing both the same way would bury the first.

### 3.19 The hash cascade

**Fires when** a chunk carries the hashed names of two or more others inside it, which is nearly
always. Informational by default — see §3.22 for what gives it a colour.

A bundler writes the hashed file name of every chunk it imports **into** the chunk importing it. So
changing a leaf changes the leaf's hash, which changes the text of whatever names it, which changes
that file's hash, and so on. The mental model to correct is that this travels upwards: the usual shape
in Vite and Rollup is **hub-and-spoke**, one shared chunk every route imports and that transitively
reaches them all. Change a leaf → the hub changes → everything importing the hub changes, which in a
single-page application is nearly everything. It does not grow with depth; it jumps.

**Measured rather than argued about.** The topology says how far a change travels, so it is read off
this build — which chunk names the most others, and how many name it — and reported as LOW, MID or
HIGH with the reason. LOW is the runtime-chunk shape, which is what webpack emits and what largely
avoids the problem, with the caveat that usually gets dropped: that chunk changes on every deploy and
has to be tiny and inlined, or the cost comes straight back.

**With a baseline it stops being a model.** Two builds diffed by file name _are_ the delta a browser
would pay. The changed files split into the ones where the edit landed and the ones that only moved
because a name inside them moved; the second group is the cascade, with its counterfactual next to it.

**Where there is no edit left to point at.** `roots` is the changed files that name no other changed
file. On the default Vite and Rollup layout there are none — the lazy chunks import back from the
entry chunk, so the naming graph among the changed files closes on itself — and eight of the nineteen
framework probes came out that way. The sentence read _"only 0 name no other file that also changed
(0 B): ."_, followed by "that is where the edit landed" and a counterfactual saying the deploy would
have cost nothing. All three false. It now says the split is unavailable and why, which is itself the
finding: a naming graph that closes on itself **is** the hub shape, and the case where the cascade
argument is strongest.

**Except where the name _is_ the hash.** SvelteKit, Nuxt and Rollup write chunks called `ChDGvcpR.js`,
and taking the hash off one of those leaves `.js`. Matching by name had nothing to work with, so every
chunk read as one file gone and another arrived: on the Nuxt probe, a one-line edit to a shared module
came out as **8 files removed and 8 added, 100 % of the build re-downloaded, and an empty
edit-versus-cascade split**. Those chunks are matched instead by the largest source file inside them,
which the analysis already works out — not a heuristic over the bytes, but what the chunk is made of,
read from the same metafile or source map the weights come from. A content key naming two chunks on
one side is not used, and where the build said nothing about its contents, matching falls back to the
name. The same edit now reads: **4 files changed, 94 %, and 339 B of it is the edit.**

**What not to do**: reach for coarser chunks. The two arguments point in opposite directions —
compression dictionaries make the re-download cheap rather than rarer, and a bigger chunk invalidates
more — so every way out is named with its price and none is recommended. Import maps move the
specifiers into the HTML, at the cost of an uncacheable HTML, which it usually already is. Breaking
the hub with `manualChunks` is paid for with a bigger first load, which Rollup's own documentation
says.

⚠️ **A citation worth reading in full**: tooling.report's tests say Rollup should not have this
problem, and they cover a two-level case. A real application with one shared chunk every route imports
fails all the same. The citation is correct and does not mean what it looks like.

### 3.20 What is served, rather than what was built

**Fires when** somebody pastes the browser measurement, which is the only source for anything in this
section.

Half the report reasons about round trips, compression and caching from the folder alone, which is
reasoning about what was _built_. A `.br` next to a `.js` says the pipeline made one; only
`encodedBodySize` against `decodedBodySize` says the server sent it. A hashed name says the file _can_
be cached forever; only a `transferSize` of zero says a returning visitor did not ask again.

| What it reads                         | What it tells you that the folder cannot                                  |
| ------------------------------------- | ------------------------------------------------------------------------- |
| `encoded` vs `decoded` body size      | JavaScript being served uncompressed. Worth more than any chunk split     |
| `transferSize` of 0, or a few hundred | Served from cache, or a 304 — the premise §3.19 assumed                   |
| `connectStart` on the n-th file       | The HTTP/1.1 pool running out, observed rather than inferred              |
| `responseStart − requestStart`        | A real round trip, better than asking somebody about their latency        |
| `responseStart` of the navigation     | The document's own TTFB: round trip zero, which the count starts after    |
| Every request, third parties too      | The denominator a count of JavaScript files never had                     |
| `serviceWorker.controller`            | A worker **controlling** this page, not just present in the folder        |
| `startTime`, sorted                   | The batches the browser really took, against the ones the graph predicted |

That last row needs both halves: the vendors with the waterfall have no module graph, the analysers
with the graph have no waterfall. Loadline can say "the graph predicted 3 round trips, you measured
4" — with the correction made while building it, that a measured batch is **not** a round trip of the
graph, because a batch also splits when the connection pool runs out. The copy says so and names the
queueing when there is any.

**None of it moves a threshold.** One paste describes one machine, on one connection, on one day. An
`h3` measured from a laptop on office fibre is a fact about that laptop: a new visitor's first
connection is usually `h2`, because `Alt-Svc` has to be cached first, and a corporate proxy that drops
UDP degrades it for a whole company. So the channel is reported with its date and its limits attached,
it goes stale after thirty days, and it is never written into the committed file.

### 3.21 Where the first load comes from

**Fires when** `index.html` names an absolute URL on another host, or the measurement reports one.

Before the first byte of the first chunk there is a DNS lookup, a TCP connection and a TLS handshake
against that host — time no weight figure in this report sees, because the round-trip count starts
once the connection exists. It has an opposite side, said in the same sentence: under HTTP/1.1 a
second origin is a second pool of six, so the decision that adds a handshake also removes queueing.

Both sources are read because a page written entirely with relative URLs and served from a CDN names
no other host in its markup; only the addresses the browser reported say where the bytes came from,
which makes the measured version the stronger of the two.

### 3.22 The five questions

**Fires when** somebody answers them, or — for the card listing what is still open — when a signal on
this report depends on an answer nobody has given.

Four claims in this report are grey on purpose: the update cost shows its percentage and withholds its
colour, the cascade names its topology and refuses to say whether it matters, and the granularity
signal puts two magnitudes on the table and declines to recommend a direction. The facts that would
settle them are facts about a team and its users, and no folder on disk contains them.

**The arithmetic**: `releases per week × the share arriving with a warm cache` = how many times a week
one person pays an invalidation. The report shows the multiplication rather than the result, so anyone
who disagrees can see which of the two numbers they disagree with. It is what turns "87 % of the build
is re-downloaded" into a cost: 87 % four times a week is the most expensive line in the report; 87 %
once a quarter to first-time visitors is nothing at all. Same build, same percentage.

**The rule, which is half the work**: an answer may **raise** a severity and may never lower one, and
`unknown` does nothing at all. A test walks all 768 combinations of the five answers against a build
with an expensive update and asserts that none takes a signal below where nobody having answered
leaves it, and that none makes a signal disappear. Without that guard, the cheapest way to a clean
report would be to answer optimistically, and the questionnaire would stop being evidence and become a
volume knob.

**Why the questions are words and the figures optional**: people know "we ship most days"; almost
nobody knows their releases per week without looking it up. Asking for the figure first produces
either an empty form or a guess typed with two decimal places, and the guess is worse, because it
arrives looking like a measurement. So the bands are the question, with three raw controls beside them
for whoever has the query open in another window; when a figure is there, it wins. Under every question
is the metric it stands for and where to find it, which is what keeps this from being a personality
quiz.

**Two questions are not like the others.** The fourth — where the audience connects from — is the one
people answer as they would like it to be, and it says so; ticking "we have RUM" removes it entirely,
because a p75 measured from real sessions beats a band picked from memory. It is also the only one
with no raw control of its own: its unit is round-trip time, the report already has exactly one of
those (`latencyMs`), and a second copy would be two numbers for one fact drifting apart. The fifth
offers no "I don't know" at all: it is not a fact to look up but which wait the team would rather pay.
It is also the only place the report names a **direction**, because it is the only place anything
ranks the two magnitudes.

**Only the questions that matter are asked.** The card listing what is still open names only the
questions some signal on this report depends on. Otherwise it would be five identical lines on every
report, which is the shape of text people learn to scroll past.

**"I don't know" is never drawn as a chosen answer.** `unknown` is the starting value of all five, so
a form nobody had touched came up with "I don't know" selected on every question, beside a counter
saying "unanswered". Both could not be true. No line of code downstream tells "nobody looked" from
"somebody said they do not know" — neither counts as answered, neither moves a colour — so the page
must not show them differently either. The button stays, as the way to take an answer back.

### 3.23 The breakdown that does not add up to the file

**Fires when** the per-file weights inside the chunks and the chunks' own weights disagree by more
than 5 % **and** by more than a kibibyte per chunk. `mid` from 15 % up, informational below it.

Both conditions, because they measure different things. The wrapper a bundler puts round each chunk —
module boilerplate, banners, the `sourceMappingURL` line — belongs to no input file and is a fixed cost
per chunk rather than a proportion of one. A plain esbuild build of five chunks weighing 90 to 330
bytes each comes out at **59 %**, which is 395 bytes of wrapper and nothing else; without the second
condition that was a `mid` on a build where nothing was wrong. The ratio says whether it matters, the
bytes say whether it is real.

There are two measurements of the same chunk and they are supposed to agree: `bytes` is what the file
weighs, and the sum of `bytesInOutput` over its inputs is what it is made of. Every figure taken from
**inside** a chunk — the bootstrap broken down by package, the exclusive column, what a `--what-if`
would save — is a sum of the second kind, while the headline weight printed next to it is the first.
When the two disagree, the whole of the first family is wrong by exactly that ratio and nothing else
in the report shows it.

Measured on four builds:

| Build                             | chunk bytes | sum of `bytesInOutput` | ratio      |
| --------------------------------- | ----------- | ---------------------- | ---------- |
| Angular 17 (probe)                | 230 774     | 228 020                | **0.988**  |
| Angular 22 (probe)                | 225 684     | 283 571                | **1.256**  |
| Angular 22 (a real application)   | 393 504     | 483 159                | **1.228**  |
| Angular 22 (Loadline's own build) | 791 012     | 790 569                | **0.9994** |

**The cause is not established, and the signal does not claim one.** The obvious reading — "Angular 22
writes the metafile before a later pass shrinks the output" — is contradicted by the fourth row, which
is Angular 22 on the same `@angular/build` 22.1.7 as the second and lands on the file exactly. What
separates them is not the version: the two that drift are chunks that are almost entirely `@angular/*`
framework code, and the one that does not is mostly this project's own. Extracted licences were
checked and are not it — the probe's excess is 57 887 bytes against a 16 954-byte
`3rdpartylicenses.txt`.

What **is** ruled out is esbuild itself. A plain esbuild build — no Angular, 40 modules, one 46 kB
shared chunk, `metafile: true`, `minify: true` — comes out at **0.9892**, and its biggest chunk at
**0.9975**: the deficit is the per-chunk wrapper, in the direction the overhead predicts. Whatever
moves the figure sits between esbuild's metafile and the folder Angular writes, on some of its builds.

**Why it is a signal and not a correction.** Scaling the breakdown down by the ratio would make the
totals reconcile and would be a model: it assumes every file moved by the same proportion, and nothing
here measures whether it did. There is an exact answer available instead, and the signal's fix is to
go and get it — build with source maps and drop the folder, and the split is measured on the generated
file itself. On the same Angular 22 probe, the graph walk over the metafile alone totals 280 153 bytes
against a 222 555-byte bootstrap (**+26 %**); with the maps alongside it, 221 555 (**−0.45 %**). It
does not fire on chunks a map covered, because for those there is nothing left to drift.

---

## 4. Traps found while building it

### 4.1 Computed is not measured

Loadline walks the graph; the browser measures. They do not match, and in a real case the gap was:

```
computed from the graph : 2389 kB across 21 files
measured in the browser : 2534 kB across 66 files
```

That is not a computation bug. Entering at the root, Angular's router loads the protected zone's chunk
in order to match the route, and only then does the guard find there is no session and redirect to
login — the chunk has already downloaded. So **opening the app at `/` costs more than going straight
to `/login`**. Both numbers are true and they answer different questions. The Measured tab (§3.10)
contrasts the two chunk by chunk, and what is left over is exactly the chunk the router loaded before
the guard did its job.

### 4.2 A static server does not know your routes

When verifying in the browser, `/login` returns 404 — the server is looking for a file. Enter at the
root and let the app redirect, or serve with a rewrite:

```bash
npx http-server dist/<app>/browser -p 8099 --proxy "http://localhost:8099?"
```

### 4.3 Analysis tools cache

At least one well-known analyser keeps the last report in browser storage and serves stale data
without saying so. Compare the `main-*.js` name it shows against the one on disk.

### 4.4 Nesting a route changes what guards see

Not Loadline's problem, but it is the trap in the fix Loadline recommends. Move a route under a parent
so you can declare lazily-loaded providers, and a guard that decides like this:

```ts
const url = (route.routeConfig?.path ?? '').toLowerCase();
```

…now sees a child with `path: ''`, stops recognising the route as public, and **redirects in a loop,
with the screen hung and no console error**. The fix: `title` and `canActivate` stay on the parent,
which keeps its `path`; only `providers` and `loadComponent` move down to the child.

---

## 5. Data format

Loadline reads the [esbuild metafile](https://esbuild.github.io/api/#metafile), written by Angular
with `--stats-json` and by plain esbuild with its metafile option. The keys it uses:

| Key                                | What for                                                                          |
| ---------------------------------- | --------------------------------------------------------------------------------- |
| `outputs[].entryPoint`             | Detecting entries and naming screens                                              |
| `outputs[].imports[].kind`         | `import-statement` vs `dynamic-import`: the entire split                          |
| `outputs[].bytes`                  | Raw chunk size                                                                    |
| `outputs[].inputs[].bytesInOutput` | Breakdown by package and by folder, and the search                                |
| `inputs[].imports[]`               | Who imports what: the import chain, §3.2, and which routes file loads each screen |
| `inputs[].format`                  | `cjs` marks CommonJS files, for §3.9                                              |

### The build folder, when there is no metafile

Vite, Rollup and Rolldown do not write a metafile, and Vite never compiled for production with esbuild
— it used Rollup, and since Vite 8 it uses Rolldown. So for everything built on them the graph is read
from the compiled folder itself (`core/intake/bundle-graph.ts`), which is possible because an ES
module bundle carries its graph in the code that ships:

| What is in the folder          | What it gives                                          |
| ------------------------------ | ------------------------------------------------------ |
| `import{a}from"./chunk-X.js"`  | A static edge: the two files travel together           |
| `import("./chunk-Y.js")`       | A lazy edge: the boundary the whole report is built on |
| The `<script>` of `index.html` | Which chunk the application starts at                  |
| `__vitePreload(…, [deps])`     | What Vite fetches in parallel with a lazy chunk        |
| `.js.map`                      | Which source files are inside each chunk, and how much |

- **No JavaScript parser.** Specifiers are found with regular expressions and a match is kept only if
  the file it points at exists in the folder, so a false positive points at nothing and drops out.
- **The page is required.** A bundler writes the shared code of an application into its entry chunk,
  so the entry ends up imported by its own children: there is no "chunk nobody imports" to find. Only
  `index.html` can name it. It does so in one of two ways — a `<script src>`, or an `import()` inside
  an inline script, which is how SvelteKit starts its application.
- **A folder of webpack or Turbopack chunks is refused.** Those builds have entry chunks and no graph:
  their imports are numbers the loader resolves at run time. Read as ES modules, a Next.js export came
  out as one bootstrap of seven files, zero screens and "nothing stands out" — confident, detailed and
  false. A folder whose entry carries that runtime **and** where nothing imports anything lazily is
  named for what it is. Both halves are needed: the marker alone would refuse an ES bundle carrying
  one webpack-built dependency, and no lazy edges alone is an ordinary application with every route
  eager.
- **Without `.js.map` the report loses the inside of each chunk**, and nothing else.

The preload lists are the one place a bundler's own behaviour changes a figure. Vite does not wait for
a lazy chunk to arrive and be parsed before fetching what it imports — it bakes the list into the call
and asks for the whole set at once. Angular does not. Without reading those lists, every screen of a
Vite application would be counted one round trip deeper than it is.

### What is not a metafile

Three files are commonly believed to be "the stats of my build". "Could not read it" would be a lie
about all three: the file is fine, it is another format, and Loadline says which.

| What                       | Where it comes from                                      | Why it is not read                                            |
| -------------------------- | -------------------------------------------------------- | ------------------------------------------------------------- |
| webpack `stats.json`       | Angular's `browser` builder (up to v16), Next.js, Rspack | Different shape: `chunks`/`modules`/`assets` arrays           |
| Vite `manifest.json`       | `build.manifest: true`                                   | Not needed: the folder itself says the same thing, and better |
| `rollup-plugin-visualizer` | its `--json` output                                      | A drawn tree, not the build's own record                      |

The Vite manifest was the obvious thing to read and it aged badly in a few months: with Rolldown as
the default it is a compatibility layer somebody has to switch on, while the folder is always there
and needs nobody to maintain a format.

### Two build shapes that are not a plain SPA

Both were analysed wrongly at first, and both are becoming more common (`core/analysis/entries.ts`).

**Server-side rendering writes one metafile with both sides in it.** Nobody downloads the server
bundle and it is usually the bigger of the two, so "the entry that reaches the most" would pick it and
the whole report would be about code no browser asks for. Everything under `server/` is left out —
unless there is nothing else, which is somebody analysing their server bundle on purpose — and the
report says how many outputs that was.

**A deferred block looks exactly like a route from the outside.** An Angular `@defer` or a `lazy()`
inside a component produces a lazy entry with an `entryPoint` of your own code, same as a route's. It
is not a screen: nobody enters it, it loads when its trigger fires inside the screen holding it, and
counting it as one inflates the screen count and drags the median down. The evidence has to be
positive: it is a block only when **every** file that lazily imports it is a view (`*.component.*`,
`*.page.*`, `*.view.*`, `*.container.*`) or is itself one of these lazy entries. A route file, a
service, an unknown importer: it stays a screen.

**A file that only groups routes is not a screen either.** What it holds is a list of
somewhere-elses. This is measured rather than read off the file name: it is a grouping file when it
adds under a kibibyte of its own to its chunk, holds **more than one** dynamic import and nothing
else, and produces a chunk nothing travels with. `*.routes.ts` still passes on the name alone, for the
routes file that imports a guard, but nothing depends on that name any more.

⚠️ **"More than one" is the condition a real build had to teach.** A Nuxt page that defers a single
widget matched every other criterion — small, no static imports, a chunk of its own — so the home
screen left the table and the widget took its row. With a single dynamic import there is nothing left
that tells a grouping file from a small screen deferring a piece of itself, and losing a screen is the
expensive direction to be wrong in.

Both lists sit under the screens table, so leaving an entry out is visible rather than silent. Every
line carries a **count as a screen** button, as every row of the table carries a **not a screen** one:
telling a screen from a piece of one is partly done by reading file names, and no set of names fits
every project. A reclassified entry is remembered with the session.

### The other files, all optional

| File                                       | What is read                                                                                                                                     |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `browser/` folder                          | Every `.js` and `.css` is gzipped with `CompressionStream` for real figures                                                                      |
| `.js.br` / `.css.br` in that folder        | Their size on disk **is** the brotli figure: read, never decompressed                                                                            |
| `.js.map` in that folder                   | A second measurement of what each file weighs inside each chunk                                                                                  |
| `index.html` in that folder                | Which chunks the page announces, for the round trips of the first load (§2.9)                                                                    |
| Previous `stats.json` or a Loadline export | Baseline: bootstrap, its packages, the cost per screen, the signals raised and every file name with what it weighs and what it is mostly made of |
| Previous build folder                      | Compressed baseline: its `stats.json` analysed with its `.js` files compressed here                                                              |
| `loadline.json`                            | Thresholds, gates, accepted signals and the five answers                                                                                         |
| `angular.json`                             | `budgets` in `options` and in each configuration, `defaultConfiguration`, `polyfills`                                                            |
| `package.json`                             | `scripts` (to follow the pipeline's commands), `zone.js` and `@angular/core`                                                                     |
| `.gitlab-ci.yml` / GitHub workflow         | Commands containing `ng build` or a build script, with the job they live in                                                                      |

The page's "Export analysis" button and the command's `--export` write the same file. That matters
more than it sounds: a `stats.json` is the only baseline a build can produce on its own, and Vite,
Rollup, SvelteKit, Nuxt, Astro and Solid do not write one — so before `--export` the only way to get a
baseline for any of them was to open a browser and press a button, which a pipeline cannot do.

The pipeline file is read without a YAML parser, line by line, which is why every command found is
shown in the Project tab with what it resolves to: if the heuristic gets it wrong, it shows.

### How `loadline.json` is allowed to grow

The file is `version: 1`, and the rule is that **every addition is an optional block and the version
stays at 1**. Bumping it buys nothing when everything entering is optional — a file written last month
is still valid word for word, and a bump would make the command carry two readers to express that
nothing broke. The line is where an old file would stop being valid: that is a new version.

One thing deliberately never goes in it: **anything measured from a browser**. Those facts have a date
and a machine attached and they go stale, and a stale figure committed to a repository is a false fact
with the shape of a measurement. The five answers are the opposite case and do go in — properties of a
team, the same for everybody who runs the command, and the kind of thing that should be argued about
in a review rather than retyped by each person who opens the report. They expire after a year, and the
report says so when they have.

An answer nobody recognises becomes "unanswered" plus a line to print, the same as an acceptance with
no reason: an answer is the only thing in this file that can move a colour, so it is the one mistake
that would otherwise change a verdict silently.

---

## 6. Design decisions

**One HTML file, no dependencies.** Opened by double-clicking. Nothing to install, update or maintain,
and it will still work in ten years.

**Everything in the browser.** A private app's `stats.json` reveals its routes, its dependencies and
its internal structure. It has no business leaving your machine.

**The last measurement is remembered, locally.** Loading anything stores it in the browser's IndexedDB
— the raw `stats.json`, the compressed sizes, the baseline and the context — and the next visit offers
to restore or forget it. Same privacy rule, now with memory.

**The bar's three segments are the message.** Colour is not decoration: slate is the unavoidable
baseline, burnt orange is what everyone pays, teal is this screen's own. On a shared scale, the
alignment of the orange block tells the story without a single number.

**Signals come with their fix**, including warnings about what **not** to do. Data with no "so what"
is useless.

**Three kinds of fact, never mixed in one sentence.** Something is **derived** from the build (exact
about what was built, silent about what is served), **measured** by a browser (one machine, one
connection, one day), or **declared** by somebody (worth more than a guess and less than a
measurement). The fourth state is **unknown**, and it is the one that matters: a report that quietly
turns "nobody looked" into "we assumed the median" cannot be checked, so `unknown` has a word of its
own and never a value.

**Evidence may raise a severity and only evidence may lower one.** The failure mode of the symmetric
version is that an optimistic answer produces silence exactly where the honest answer is noise, and
silence is the one output nobody checks. A test over every combination of the five answers keeps it
that way (§3.22).

**The report never filters.** Context reorders, re-thresholds and rewords; no finding is ever hidden.
A signal the page hides is a signal nobody can look at, and the page is where somebody goes **to**
look. Accepting a signal is a decision for the pipeline, and it is printed under the report either
way.

**The size budget is on one file.** Because the tool is one self-contained HTML, a lazy chunk would
either break the double-click property or be inlined back into the same file, moving the number
without moving a byte. So the budget in `angular.json` is an alarm on the whole thing. Loadline
pointed at its own build says where the weight is: the signal copy in two languages, and two woff2
fonts as data URIs so the page never reaches the network. Both are properties this project chose, and
the lever that would shrink it — shipping one language per build — costs the language toggle.

### How the source is laid out

```
src/app/core/       the analysis itself: no Angular anywhere in it, and where the tests are
src/app/state/      the Angular services holding what is loaded and what derives from it
src/app/shared/     pieces used by more than one screen: the bytes pipe, the trees, the tag
src/app/features/   what you look at: the drop zone, the report and its nine panels
```

**`core/` never imports Angular.** That is what lets the whole analysis be tested by calling a function
with an object, without a browser or an injector. Everything that computes something carries its own
`.spec.ts`; what is left is data, type declarations and the browser storage the last session is kept
in.

**A panel holds its own state, never another panel's.** What two panels have to agree on — which tab
is open, which row to reveal — goes through `ReportNav`, and everything derived from the loaded files
hangs from `ReportStore` as a computed. That is why switching language does not walk the dependency
graph again: the analysis does not depend on the language, and the signals do.

**Text lives apart from the code that decides.** `core/i18n/` holds the interface both languages fill
(`ui-strings.ts`) and one file per language; `core/findings/` separates when a signal fires
(`findings.ts`) from what it says (`finding-text.ts`). Rewording a signal touches no rule.

**Shapes live apart from the code that fills them.** A type another file imports goes in a `.types.ts`
next to its module: `analysis.ts` computes, `analysis.types.ts` says what comes out. The point is the
reading order — a module opens on its first function instead of two hundred lines of declarations.
Types that never leave their file stay in it, and so does the input contract of a component.

**Three path aliases, one per layer**, declared in `tsconfig.json`: `@core/*`, `@shared/*` and
`@state/*`, for imports that would otherwise climb. Siblings and one level up stay relative.
`features/` has no alias on purpose: inside a screen everything is a sibling, and an alias there would
invite one panel to import another.

---

## 7. What the other tools do

Checked on 2026-09-01 against each tool's documentation. Loadline does not replace these: it answers a
question none of them answers, and leaves out things several of them do well.

| Tool                                                                                                                                               | Input                           | What it adds                                                                                               | What it lacks compared to Loadline                                                                                                 |
| -------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- | ---------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| [esbuild Bundle Size Analyzer](https://esbuild.github.io/analyze/) (official)                                                                      | metafile                        | Treemap of what each chunk weighs and which files it contains. Nothing to install.                         | Nothing per screen. Doesn't know how many screens load a chunk. No real gzip, no comparison, no budgets.                           |
| [Hawkeye](https://angularexperts.io/blog/hawkeye-esbuild-analyzer/) (Angular Experts)                                                              | `stats.json`                    | Separates eager from lazy, searches a library and says whether it lands in the eager or lazy part.         | Still "what is in each chunk". No per-screen figure, no screens-per-chunk count, no gzip, comparison or budgets.                   |
| [Sonda](https://sonda.dev/frameworks/angular-cli)                                                                                                  | `stats.json` + source maps      | Treemap and dependency tree, gzip **and brotli**, JSON report for CI. Measures on the final minified file. | Requires source maps and a command. No per-screen weight, no "lazy that is really common". No build comparison.                    |
| [source-map-explorer](https://www.npmjs.com/package/source-map-explorer)                                                                           | source maps                     | Exact bytes of each source file inside the final file.                                                     | Only that: a treemap per output file.                                                                                              |
| [@rnx-kit/esbuild-bundle-analyzer](https://www.npmjs.com/package/@rnx-kit/esbuild-bundle-analyzer)                                                 | metafile                        | Duplicates **with the import chain** each copy enters through. **Compares two metafiles.**                 | Terminal only, uncompressed figures, nothing per screen.                                                                           |
| [exoego/esbuild-bundle-analyzer](https://github.com/exoego/esbuild-bundle-analyzer), [build-size-diff](https://github.com/q1sh101/build-size-diff) | metafile / output folder, in CI | GitHub Action: comments on the PR how much each output file changed against the base branch.               | They compare files, not screens. They don't say "this screen grew because a shared chunk grew".                                    |
| [Statoscope](https://github.com/statoscope/statoscope)                                                                                             | webpack stats                   | The only one with "download size per entry point" and validation rules between two builds.                 | Webpack only. Angular 17+ uses esbuild; [the support request](https://github.com/statoscope/statoscope/issues/148) is still open.  |
| [Bundle Buddy](https://github.com/Timer/bundle-buddy)                                                                                              | source maps                     | Source code repeated across chunks, at line level.                                                         | Only that.                                                                                                                         |
| [bundle-stats](https://github.com/relative-ci/bundle-stats)                                                                                        | webpack, rspack, vite, rollup   | Per-build report with history and comparison.                                                              | Doesn't read esbuild metafiles or Angular CLI.                                                                                     |
| Angular CLI (`ng build`)                                                                                                                           | —                               | Table of initial and lazy chunks; enforces the `budgets` in `angular.json`.                                | No per-screen total. The budget only applies in the configuration being built; nobody checks whether the pipeline builds that one. |

### 7.1 What Loadline does that none of them does

- The per-screen figure (bootstrap + shared + own), by walking the import graph from each lazy route.
- Counting how many screens load each "lazy" chunk. The problem is documented — esbuild produces many
  shared chunks, and the Angular team has an
  [experimental chunk optimizer](https://push-based.io/article/faster-builds-slower-applications-optimizing-angulars-bundle-output)
  — but no tool diagnoses it per screen.
- Cross-checking the `angular.json` budgets against which configuration the pipeline builds.
- Real gzip measured in the browser, without source maps and without installing anything.
- Searching a name and seeing, besides where it lands, **which screens pay for it**.

### 7.2 What they do that Loadline does not

- **Post the comment on the PR.** The command writes it (`--format pr-comment`) and exits non-zero
  when a limit breaks, but some job of yours has to post it. The GitHub Actions and Statoscope do that
  last step themselves.
- **Line-level duplication across chunks** (Bundle Buddy). Loadline works at file and package level.
  Not started on purpose: comparing everything with everything is expensive inside the browser, and
  the typical finding — a copied utility — usually weighs little.
- **Webpack** (Statoscope, webpack-bundle-analyzer, bundle-stats). Loadline reads an esbuild metafile
  or a folder of ES modules, and webpack is neither: it resolves imports at run time through
  `__webpack_require__`, so there is nothing in the shipped file to read. That leaves out Angular 16
  and earlier, Next.js and Create React App.

### 7.3 One finding worth keeping

Reading source maps was added to close the gap against Sonda and source-map-explorer, and the result
changed the reason for doing it. The premise was that the metafile measures **before** minification,
which is true of webpack stats — what those tools were written for — and **not** of the esbuild
metafile: measured on a real build of Loadline, the sum of `bytesInOutput` was 99.9 % of the generated
file, while the source bytes of those same files added up to 6.2 times that size. The split was
already sound, and the "approximate" label was unwarranted.

That measurement has since expired on some builds, and the maps being an independent second
measurement is what caught it (§3.23). One detail came out of it as well: the maps attribute a
component's template to its `.html`, while the metafile counts it inside the `.ts`. Without folding one
into the other, a component with a big template came out at 58 % of its real weight.

### 7.4 Caveats

- What is said about Hawkeye comes from its authors' article; its GitHub README could not be read
  during the check. A recent version adding per-route weight would not show here.
- Comparing two builds and detecting duplicates exist elsewhere (rnx-kit, GitHub Actions). What
  Loadline adds there is doing it per screen and without leaving the browser.
