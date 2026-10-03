import { Component, inject, signal } from '@angular/core';
import { copyText } from '@shared/clipboard.utils';
import { I18nService } from '@state/i18n.service';
import { ReportStore } from '@state/report.store';

/**
 * What the console has to be given to report what it downloaded. Not translated: it is code.
 *
 * Every field earns its place by answering something the build folder cannot.
 * `encodedBodySize`/`decodedBodySize` say what compression was **served**, not what was built.
 * `transferSize` of zero is a cache hit and a small non-zero one is a revalidation, so the caching
 * half of this report stops being an assumption. `connectStart`/`connectEnd` show the HTTP/1.1
 * pool running out instead of inferring it from the protocol. `responseStart - requestStart` is a
 * measured round trip, which beats asking anybody what their latency is. The navigation entry's
 * `responseStart` is wave zero — the document — which the round-trip count starts after and which
 * on plenty of applications is the dominant term. And `serviceWorker.controller` says a worker is
 * **controlling this load**, which finding `ngsw-worker.js` in a folder never did.
 *
 * The `await` is why the instructions say console: top-level await works there and not in a
 * bookmarklet. `caches.keys()` is the one thing worth that constraint — it says the worker has a
 * precache rather than merely being installed.
 */
const SNIPPET = `const nav = performance.getEntriesByType('navigation')[0];
const m = JSON.stringify({
  url: location.href, origin: location.origin, takenAt: new Date().toISOString(),
  ttfb: nav && Math.round(nav.responseStart), documentProtocol: nav && nav.nextHopProtocol,
  serviceWorker: !!(navigator.serviceWorker && navigator.serviceWorker.controller),
  caches: window.caches ? await caches.keys().catch(() => null) : null,
  modulepreloads: document.querySelectorAll('link[rel=modulepreload]').length,
  entries: performance.getEntriesByType('resource').map(r => ({
    name: r.name, protocol: r.nextHopProtocol,
    transferSize: r.transferSize, encodedBodySize: r.encodedBodySize, decodedBodySize: r.decodedBodySize,
    startTime: Math.round(r.startTime), requestStart: Math.round(r.requestStart),
    responseStart: Math.round(r.responseStart), responseEnd: Math.round(r.responseEnd),
    connectStart: Math.round(r.connectStart), connectEnd: Math.round(r.connectEnd),
  })),
});
typeof copy === 'function' ? copy(m) : m;`;

/**
 * The measured tab before anything was pasted: the steps, the snippet behind a button, the paste
 * box, and beside them what a measurement adds. Its own component because the filled tab is long
 * on its own, and the two never show at once.
 */
@Component({
    selector: 'app-measured-intake',
    templateUrl: './measured-intake.html',
    styleUrl: './measured-intake.scss',
})
export class MeasuredIntakeComponent {
    // * SERVICES
    protected readonly i18n = inject(I18nService);
    protected readonly store = inject(ReportStore);

    // * CONSTANTS
    protected readonly snippet = SNIPPET;

    // * ATTRIBUTES
    protected readonly text = signal('');
    protected readonly copied = signal(false);
    /** The snippet is folded away until asked for: it is copied far more often than it is read. */
    protected readonly showCode = signal(false);

    protected run(): void {
        if (this.store.loadMeasurement(this.text()) === 'ok') {
            this.text.set('');
        }
    }

    protected async copySnippet(): Promise<void> {
        // A refused clipboard changes nothing: "Show the code" still has the snippet.
        if (!(await copyText(SNIPPET))) {
            return;
        }
        this.copied.set(true);
        setTimeout(() => this.copied.set(false), 1800);
    }
}
