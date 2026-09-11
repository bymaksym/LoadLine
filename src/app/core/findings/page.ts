/**
 * What `index.html` says about **where** the first load comes from, as opposed to what is in it.
 *
 * Every other figure of the report is about bytes and edges. This one is about hosts, and it is
 * the only fact of the first load that moves the arithmetic at the root: a chunk on another origin
 * is not one request later than the page, it is a DNS lookup, a TCP connection and a TLS handshake
 * before the first byte of the first chunk. Under HTTP/1.1 it cuts the other way as well — a
 * second origin is a second pool of six connections — which is why this is context and not a fault.
 */

import { type Lang } from '../i18n/ui-strings';
import { type PageOrigin } from '../intake/index-html';
import { type Finding } from './finding.types';
import { TEXT } from './finding-text';

/** What the page said about its own origins, as `originsIn` gives it. */
export interface PageOrigins {
    origins: PageOrigin[];
    /** Origins the page already warms with `preconnect` or `dns-prefetch`. */
    hinted: string[];
    /** A `<base href>` pointing at another host, which moves every relative URL of the page. */
    base: string | null;
}

/**
 * A page fetching from somewhere else, when it does.
 *
 * Only origins carrying JavaScript raise it above context. An analytics tag on a third host is a
 * fact about the page and not about the split, and this report is about the split — the third
 * parties are counted where they are actually observed, in the browser measurement, because a page
 * that injects them at run time names none of them in its markup.
 */
export const buildPageFindings = (page: PageOrigins | null, lang: Lang): Finding[] => {
    if (!page) {
        return [];
    }

    const carrying = page.origins.filter(row => row.scripts > 0);
    if (carrying.length === 0 && !page.base) {
        return [];
    }

    const hinted = new Set(page.hinted);
    const cold = carrying.filter(row => !hinted.has(row.origin));

    return [
        {
            // Never a fault: serving assets from a CDN is a decision with two sides, and the tool's
            // job here is to put the handshake on the bill, not to ask for it back.
            severity: cold.length > 0 ? 'mid' : 'info',
            kind: 'assetOrigin',
            ...TEXT[lang].assetOrigin({
                origins: carrying.map(row => row.origin),
                scripts: carrying.reduce((sum, row) => sum + row.scripts, 0),
                files: page.origins.reduce((sum, row) => sum + row.files, 0),
                cold: cold.map(row => row.origin),
                warmed: carrying.filter(row => hinted.has(row.origin)).map(row => row.origin),
                base: page.base,
            }),
        },
    ];
};
