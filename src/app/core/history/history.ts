/**
 * The last N measurements, kept in this browser.
 *
 * `950 → 1.017` is information. `820, 790, 910, 1.200, 970` is a story, and it shows which week the
 * problem walked in without anybody having to remember. One measurement against one baseline
 * cannot do that: it compares two points and says nothing about the shape between them.
 *
 * **It lives in this browser and nowhere else.** No account, no server, no sync — the same rule as
 * the rest of the tool, and it has to be said out loud wherever the line is drawn, because a chart
 * that looks like a dashboard invites somebody to trust it as team history when it is one person's
 * machine. It is exportable for exactly that reason: the way to share it is to hand over the file.
 */

import { type Mode } from '../criteria/criteria.types';

/** One measurement, reduced to what a line needs. */
export interface HistoryPoint {
    /** ISO date of the measurement. */
    date: string;
    /** What the build was called, so a point can be told from the one before it. */
    name: string;
    mode: Mode;
    boot: number;
    /** Screen source → what it downloads in total. Sources, not labels: a label is renamed. */
    screens: [string, number][];
    /** How many signals were raised, by severity, so the line can be read next to the count. */
    signals: { high: number; mid: number };
}

export interface History {
    tool: 'loadline';
    version: 1;
    points: HistoryPoint[];
}

/**
 * How many measurements are kept.
 *
 * Twenty is about a quarter of releases for a team that ships weekly, which is the span where "when
 * did this start" is still a question somebody can act on. Beyond that the answer is archaeology,
 * and the storage cost stops being free.
 */
export const MAX_POINTS = 20;

export const isHistory = (value: unknown): value is History => {
    if (!value || typeof value !== 'object') {
        return false;
    }
    const candidate = value as Partial<History>;
    return candidate.tool === 'loadline' && candidate.version === 1 && Array.isArray(candidate.points);
};

/**
 * Adds a measurement, oldest dropped first.
 *
 * A point taken in a different unit is kept rather than converted: gzip and raw are not the same
 * measurement, and drawing them on one line would show a saving that never happened. What reads the
 * history filters by mode; what writes it does not throw anything away.
 */
export const remember = (history: History, point: HistoryPoint): History => {
    // The same build measured twice is one point. It happens constantly — somebody drops the folder,
    // then drops `angular.json`, then reloads — and each of those would otherwise be a step.
    const last = history.points.at(-1);
    const same = last && last.name === point.name && last.boot === point.boot && last.mode === point.mode;

    const points = same ? [...history.points.slice(0, -1), point] : [...history.points, point];
    return { ...history, points: points.slice(-MAX_POINTS) };
};

/**
 * The bootstrap over time, in one unit. The x axis is the order of measurement, not the calendar.
 *
 * Storing the per-screen totals from the first day is what makes `screenLine` possible at all: a
 * history is only worth what it recorded at the time, and adding the field later would have meant
 * the second line starting the day somebody thought of it.
 */
export const bootLine = (history: History, mode: Mode): HistoryPoint[] =>
    history.points.filter(point => point.mode === mode);

/**
 * Every screen the history has ever seen, by source path, alphabetically.
 *
 * The union across all the points and not the screens of the last one, deliberately: a screen that
 * went away is exactly the one somebody wants to look up, and a list built from the newest
 * measurement is a list that forgets it the moment it matters.
 */
export const screensInHistory = (points: readonly HistoryPoint[]): string[] => {
    const sources = new Set<string>();
    for (const point of points) {
        for (const [source] of point.screens) {
            sources.add(source);
        }
    }

    return [...sources].toSorted((a, b) => a.localeCompare(b));
};

/** One point of the per-screen line. `null` is a measurement where that screen did not exist. */
export interface ScreenPoint {
    point: HistoryPoint;
    bytes: number | null;
}

/**
 * What one screen weighed at each measurement.
 *
 * A gap is kept as a gap rather than as a zero. A screen that was not in a build did not weigh
 * nothing that week: it was not there, and drawing it at the floor of the chart would read as the
 * one week somebody made it free.
 */
export const screenLine = (points: readonly HistoryPoint[], source: string): ScreenPoint[] =>
    points.map(point => ({ point, bytes: point.screens.find(([name]) => name === source)?.[1] ?? null }));

export const EMPTY_HISTORY: History = { tool: 'loadline', version: 1, points: [] };
