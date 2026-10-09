import { describe, expect, it } from 'vitest';
import { SAMPLE_STATS } from '../../sample/sample-build';
import { PROFILES } from '../../timing/timing';
import { tripsOf } from '../../timing/trips';
import { analyze } from '../analysis';
import { screenGridOf } from './screen-grid';

const analysis = analyze(SAMPLE_STATS, null);

describe('screenGridOf', () => {
    const grid = screenGridOf(analysis);
    const column = (name: string, boot: boolean): number =>
        grid.columns.findIndex(entry => entry.name === name && entry.boot === boot);

    it('fills a bootstrap column for every screen: everybody downloads it', () => {
        const core = column('@angular/core', true);
        expect(core).toBeGreaterThanOrEqual(0);
        expect(new Set(grid.rows.map(row => row.cells[core])).size).toBe(1);
        expect(grid.rows[0]?.cells[core]).toBeGreaterThan(0);
    });

    it('shows a lazy package only on the screens that load it', () => {
        const xlsx = column('xlsx', false);
        const paying = grid.rows.filter(row => (row.cells[xlsx] ?? 0) > 0).map(row => row.label);
        expect(paying).toEqual(['reports']);

        const agGrid = column('ag-grid-community', false);
        expect(grid.rows.filter(row => (row.cells[agGrid] ?? 0) > 0)).toHaveLength(5);
    });

    it('keeps every row as long as the columns', () => {
        for (const row of grid.rows) {
            expect(row.cells).toHaveLength(grid.columns.length);
        }
        expect(grid.max).toBe(Math.max(...grid.rows.flatMap(row => row.cells)));
    });
});

describe('tripsOf', () => {
    const screen = (label: string) => {
        const found = analysis.screens.find(entry => entry.label === label);
        if (!found) {
            throw new Error(`no screen ${label}`);
        }
        return found;
    };

    it('puts the screen after the first load, one trip after another', () => {
        const plan = tripsOf(analysis, screen('dashboard'), PROFILES.slow4g);
        expect(plan.trips[0]?.boot).toBe(true);
        expect(plan.trips.filter(trip => !trip.boot)).toHaveLength(screen('dashboard').waves);
        for (const [index, trip] of plan.trips.entries()) {
            expect(trip.startMs).toBe(index === 0 ? 0 : plan.trips[index - 1]?.endMs);
        }
    });

    it('says the first load was assumed to be one trip when no index.html was read', () => {
        expect(tripsOf(analysis, screen('settings')).bootAssumed).toBe(true);
    });

    it('costs a trip a wait however little it weighs, and more on a slower connection', () => {
        const slow = tripsOf(analysis, screen('orders'), PROFILES.slow4g);
        const cable = tripsOf(analysis, screen('orders'), PROFILES.cable);
        expect(slow.trips.every(trip => trip.waitMs === PROFILES.slow4g.latencyMs)).toBe(true);
        expect(cable.totalMs).toBeLessThan(slow.totalMs);
    });
});
