import { describe, expect, it } from 'vitest';
import { announcedIn, assetsIn, indexHtmlOf, originsIn, scriptsIn } from './index-html';

describe('indexHtmlOf', () => {
    it('finds the page among the files of the folder', () => {
        const files = [{ name: 'main-ABC.js' }, { name: 'index.html' }, { name: 'styles.css' }];

        expect(indexHtmlOf(files)?.name).toBe('index.html');
    });

    it('takes the browser page of an SSR build', () => {
        expect(indexHtmlOf([{ name: 'index.csr.html' }])?.name).toBe('index.csr.html');
    });

    it('is null when the folder carries no page', () => {
        expect(indexHtmlOf([{ name: 'main-ABC.js' }])).toBeNull();
    });

    it('takes the only HTML file when it is not called index, since there is nothing to confuse it with', () => {
        // A build whose page has another name used to lose the round trips of the first load with
        // no explanation.
        expect(indexHtmlOf([{ name: 'main-ABC.js' }, { name: 'app.html' }])?.name).toBe('app.html');
    });

    it('but not when there are several, because then it would be a guess', () => {
        expect(indexHtmlOf([{ name: 'app.html' }, { name: 'other.html' }])).toBeNull();
    });
});

describe('announcedIn', () => {
    it('reads the entry script and the modulepreload links', () => {
        const names = announcedIn(`
            <html><head>
                <link rel="modulepreload" href="chunk-AAA.js">
                <link rel="modulepreload" href="chunk-BBB.js">
            </head><body>
                <script src="main-CCC.js" type="module"></script>
            </body></html>
        `);

        expect(names).toEqual(['chunk-AAA.js', 'chunk-BBB.js', 'main-CCC.js']);
    });

    it('leaves out what is not JavaScript, whatever the tag says', () => {
        const names = announcedIn(`
            <link rel="stylesheet" href="styles-AAA.css">
            <link rel="preload" href="font.woff2" as="font">
            <link rel="preload" href="hero.png" as="image">
        `);

        expect(names).toEqual([]);
    });

    it('takes a plain preload only when it is a script', () => {
        expect(announcedIn('<link rel="preload" href="late-AAA.js" as="script">')).toEqual(['late-AAA.js']);
        expect(announcedIn('<link rel="preload" href="late-AAA.js" as="fetch">')).toEqual([]);
    });

    it('strips the path, the query and the hash: the metafile knows files by their bare name', () => {
        expect(announcedIn('<script src="/assets/js/main-ABC.js?v=3#x"></script>')).toEqual(['main-ABC.js']);
    });

    it('reads single quotes and unquoted attributes', () => {
        expect(announcedIn("<script src='a-AAA.js'></script><script src=b-BBB.js></script>")).toEqual([
            'a-AAA.js',
            'b-BBB.js',
        ]);
    });

    it('an inline script announces nothing when it imports nothing', () => {
        expect(announcedIn('<script>window.x = 1;</script>')).toEqual([]);
    });

    /**
     * SvelteKit starts its application from an `import()` inside the page rather than from a
     * `<script src>`. Nothing else in the build names those chunks, so until this was read a
     * SvelteKit build had no entry at all and could not be analysed.
     */
    it('an inline script that imports chunks names them, and they are entries', () => {
        const html = `<script>
            Promise.all([import("./_app/entry/start.AAA.js"), import("./_app/entry/app.BBB.js")]).then(start);
        </script>`;

        expect(scriptsIn(html)).toEqual({
            names: ['start.AAA.js', 'app.BBB.js'],
            entries: ['start.AAA.js', 'app.BBB.js'],
        });
    });

    it('does not read the body of a script that has a src: its file is the entry already', () => {
        expect(announcedIn('<script src="main-AAA.js">import("not-really-BBB.js")</script>')).toEqual(['main-AAA.js']);
    });

    it('the same file named twice is announced once', () => {
        expect(announcedIn('<link rel="modulepreload" href="a.js"><script src="a.js"></script>')).toEqual(['a.js']);
    });
});

describe('assetsIn · what the page fetches for later', () => {
    it('keeps a prefetch apart from a preload instead of dropping it', () => {
        const html = `<html><head>
<link rel="modulepreload" href="/_nuxt/entry.js">
<link rel="prefetch" as="script" href="/_nuxt/orders.js">
<link rel="prefetch" as="script" href="/_nuxt/settings.js">
</head><body></body></html>`;

        const named = assetsIn(html);

        // A prefetch is not part of the first load — that decision stands — but the browser does
        // fetch it on this visit, so throwing the names away meant nothing could ever say so.
        expect(named.preloaded).toEqual(['entry.js']);
        expect(named.prefetched).toEqual(['orders.js', 'settings.js']);
    });
});

describe('originsIn · where the first load comes from', () => {
    it('names the host of an absolute script and counts what comes from it', () => {
        const html = `<html><head>
<link rel="stylesheet" href="https://cdn.example.com/styles-AAA.css">
<link rel="modulepreload" href="https://cdn.example.com/chunk-BBB.js">
<script type="module" src="https://cdn.example.com/main-CCC.js"></script>
</head><body></body></html>`;

        const { origins, hinted, base } = originsIn(html);

        expect(origins).toEqual([{ origin: 'https://cdn.example.com', files: 3, scripts: 2 }]);
        expect(hinted).toEqual([]);
        expect(base).toBeNull();
    });

    it('says nothing about a page that only writes relative URLs', () => {
        expect(originsIn('<script type="module" src="/main-AAA.js"></script>').origins).toEqual([]);
    });

    it('keeps a preconnect apart: it names an origin and fetches nothing', () => {
        const html = `<link rel="preconnect" href="https://cdn.example.com">
<script src="https://cdn.example.com/main-AAA.js"></script>`;

        const { origins, hinted } = originsIn(html);

        expect(origins).toEqual([{ origin: 'https://cdn.example.com', files: 1, scripts: 1 }]);
        expect(hinted).toEqual(['https://cdn.example.com']);
    });

    it('reads a base href, which moves every relative URL of the page at once', () => {
        expect(originsIn('<base href="https://cdn.example.com/app/">').base).toBe('https://cdn.example.com');
    });

    it('counts a protocol-relative URL: it is another host whatever scheme it inherits', () => {
        expect(originsIn('<script src="//cdn.example.com/main-AAA.js"></script>').origins[0]?.origin).toBe(
            '//cdn.example.com',
        );
    });
});
