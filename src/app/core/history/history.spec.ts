import { describe, expect, it } from 'vitest';
import {
    bootLine,
    EMPTY_HISTORY,
    type HistoryPoint,
    MAX_POINTS,
    remember,
    screenLine,
    screensInHistory,
} from './history';

const point = (over: Partial<HistoryPoint>): HistoryPoint => ({
    date: '2026-09-01T10:00:00.000Z',
    name: 'stats.json',
    mode: 'raw',
    boot: 1000,
    screens: [],
    signals: { high: 0, mid: 0 },
    ...over,
});

const of = (...points: HistoryPoint[]) => points.reduce((history, next) => remember(history, next), EMPTY_HISTORY);

describe('history', () => {
    it('drops the oldest once it is full', () => {
        const many = Array.from({ length: MAX_POINTS + 5 }, (_, i) =>
            point({ date: `2026-09-${String(i + 1).padStart(2, '0')}`, boot: 1000 + i }),
        );

        const history = of(...many);
        expect(history.points).toHaveLength(MAX_POINTS);
        expect(history.points[0]?.boot).toBe(1005);
    });

    /**
     * The same build measured twice is one point. It happens constantly — drop the folder, drop
     * `angular.json`, reload — and each of those would otherwise be a step in the line.
     */
    it('replaces the last point when it is the same build measured again', () => {
        const history = of(point({ boot: 900 }), point({ boot: 900 }), point({ boot: 950 }));
        expect(history.points.map(entry => entry.boot)).toEqual([900, 950]);
    });

    /** gzip and raw are not the same measurement: one line of both would show a saving. */
    it('keeps a point taken in another unit but does not draw it on the same line', () => {
        const history = of(point({ boot: 900 }), point({ boot: 300, mode: 'gzip' }));

        expect(history.points).toHaveLength(2);
        expect(bootLine(history, 'raw').map(entry => entry.boot)).toEqual([900]);
        expect(bootLine(history, 'gzip').map(entry => entry.boot)).toEqual([300]);
    });

    /**
     * Every screen the history ever held, not the ones the newest build has: the screen worth
     * looking up is often exactly the one that stopped appearing.
     */
    it('offers a screen that has stopped appearing', () => {
        const points = [
            point({ screens: [['src/a.page.ts', 100]] }),
            point({ boot: 1100, screens: [['src/b.page.ts', 200]] }),
        ];

        expect(screensInHistory(points)).toEqual(['src/a.page.ts', 'src/b.page.ts']);
    });

    /** A gap is a gap. That week the screen did not weigh nothing — it was not there. */
    it('leaves a hole where a screen was absent rather than drawing it at zero', () => {
        const points = [
            point({ screens: [['src/a.page.ts', 100]] }),
            point({ screens: [['src/b.page.ts', 200]] }),
            point({ screens: [['src/a.page.ts', 140]] }),
        ];

        expect(screenLine(points, 'src/a.page.ts').map(entry => entry.bytes)).toEqual([100, null, 140]);
    });
});
