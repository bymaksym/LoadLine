import { Component, computed, inject, input, signal } from '@angular/core';
import { type ScreenCost } from '@core/analysis/analysis.types';
import { formatBytes } from '@core/format/format.utils';
import { formatMs, PROFILE_IDS, PROFILES } from '@core/timing/timing';
import { type ProfileId } from '@core/timing/timing.types';
import { type Trip, tripsOf } from '@core/timing/trips';
import { I18nService } from '@state/i18n.service';
import { ReportStore } from '@state/report.store';

/** One piece of a trip's transfer, in the colour of whom its bytes belong to. */
interface TripPart {
    zone: 'boot' | 'shared' | 'own';
    /** Percent of the transfer segment, not of the axis. */
    share: number;
}

/** One trip as it is drawn: where on the shared axis its two segments sit, and what it says. */
interface TripRow {
    trip: Trip;
    waitLeft: number;
    waitWidth: number;
    transferLeft: number;
    transferWidth: number;
    parts: TripPart[];
    size: string;
    /** The whole row in words, for whoever does not see the bar. */
    text: string;
}

/**
 * A screen's load as a waterfall, for somebody landing on it directly: the first load's round
 * trips, then the screen's, each a wait and a transfer on one time axis, and the parse at the end.
 *
 * The detail already says how many round trips a screen takes; what a number cannot show is that
 * three trips of a few kilobytes cost three waits however little they weigh. Drawn, the gaps are
 * the picture. The model is `trips.ts`, which is `timing.ts` laid out in sequence: an estimate, and
 * labelled as one under the title (see `timing.ts` for why every time figure must be).
 */
@Component({
    selector: 'app-screen-trips',
    templateUrl: './screen-trips.html',
    styleUrl: './screen-trips.scss',
})
export class ScreenTripsComponent {
    // * SERVICES
    protected readonly i18n = inject(I18nService);
    private readonly store = inject(ReportStore);

    // * INPUTS
    readonly screen = input.required<ScreenCost>();

    // * ATTRIBUTES
    protected readonly profiles = PROFILE_IDS;
    /** Slow 4G first: it is where the waits are the size the drawing is about. */
    protected readonly profile = signal<ProfileId>('slow4g');

    /**
     * The trips on the profile chosen here, with the latency the criteria set: the same wait the
     * rest of the report's time figures are built on.
     */
    protected readonly plan = computed(() => {
        const analysis = this.store.analysis();
        return analysis
            ? tripsOf(analysis, this.screen(), PROFILES[this.profile()], this.store.criteria().latencyMs)
            : null;
    });

    protected readonly rows = computed((): TripRow[] => {
        const plan = this.plan();
        if (!plan) {
            return [];
        }

        const t = this.i18n.ui();
        const lang = this.i18n.lang();
        const shared = new Set(this.screen().sharedChunks);
        const percent = this.percentOf(plan.totalMs);

        return plan.trips.map(trip => {
            const sharedBytes = trip.boot
                ? 0
                : trip.chunks.filter(chunk => shared.has(chunk.file)).reduce((sum, chunk) => sum + chunk.bytes, 0);
            const parts: TripPart[] = trip.boot
                ? [{ zone: 'boot', share: 100 }]
                : [
                      {
                          zone: 'own' as const,
                          share: trip.bytes > 0 ? ((trip.bytes - sharedBytes) / trip.bytes) * 100 : 100,
                      },
                      { zone: 'shared' as const, share: trip.bytes > 0 ? (sharedBytes / trip.bytes) * 100 : 0 },
                  ].filter(part => part.share > 0);
            const size = formatBytes(trip.bytes);

            return {
                trip,
                waitLeft: percent(trip.startMs),
                waitWidth: percent(trip.waitMs),
                transferLeft: percent(trip.startMs + trip.waitMs),
                transferWidth: percent(trip.transferMs),
                parts,
                size,
                text: t.tripBar(
                    trip.index,
                    formatMs(trip.waitMs, lang),
                    formatMs(trip.transferMs, lang),
                    size,
                    trip.chunks.length,
                ),
            };
        });
    });

    /** Where the parse starts and how long it is, on the same axis as the trips. */
    protected readonly parseBar = computed(() => {
        const plan = this.plan();
        if (!plan) {
            return null;
        }

        const percent = this.percentOf(plan.totalMs);
        const start = plan.totalMs - plan.parseMs;
        return { left: percent(start), width: percent(plan.parseMs) };
    });

    protected ms(value: number): string {
        return formatMs(value, this.i18n.lang());
    }

    protected choose(profile: ProfileId): void {
        this.profile.set(profile);
    }

    /** A time as a percentage of the whole load, so every row is drawn on the one axis. */
    private percentOf(totalMs: number): (ms: number) => number {
        return ms => (totalMs > 0 ? (ms / totalMs) * 100 : 0);
    }
}
