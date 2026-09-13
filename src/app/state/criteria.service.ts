import { computed, Service, signal } from '@angular/core';
import { RECOMMENDED } from '../core/criteria/criteria';
import { type Criteria, type CriteriaKey, type Mode } from '../core/criteria/criteria.types';
import { asRecord } from '../core/json/json.utils';
import { readLocal, writeLocal } from '../core/session/local-store';

type Overrides = Record<Mode, Partial<Criteria>>;

const STORAGE_KEY = 'loadline.criteria.v1';

/** Only known keys holding numbers: anything else is ignored, wherever it came from. */
const sanitize = (value: unknown): Partial<Criteria> => {
    const clean: Partial<Criteria> = {};
    const raw = asRecord(value);
    if (!raw) {
        return clean;
    }

    for (const key of Object.keys(RECOMMENDED.raw) as CriteriaKey[]) {
        const candidate = raw[key];
        if (typeof candidate === 'number' && Number.isFinite(candidate) && candidate >= 0) {
            clean[key] = candidate;
        }
    }

    return clean;
};

const load = (): Overrides => {
    const empty: Overrides = { raw: {}, gzip: {}, brotli: {} };
    const stored = readLocal(STORAGE_KEY);
    if (!stored) {
        return empty;
    }

    try {
        const parsed = asRecord(JSON.parse(stored));
        return {
            raw: sanitize(parsed?.['raw']),
            gzip: sanitize(parsed?.['gzip']),
            brotli: sanitize(parsed?.['brotli']),
        };
    } catch {
        // Something else wrote this key, or an older shape of it: start from the recommended ones.
        return empty;
    }
};

const persist = (overrides: Overrides): void => {
    writeLocal(STORAGE_KEY, JSON.stringify(overrides));
};

/**
 * The criteria in force: the recommended ones plus whatever the person has changed. Changes are
 * stored in the browser per mode (raw / compressed), because a 170 kB budget makes sense
 * compressed and none at all raw.
 */
@Service()
export class CriteriaService {
    // * ATTRIBUTES
    private readonly overrides = signal<Overrides>(load());

    private readonly byMode = computed<Record<Mode, Criteria>>(() => {
        const overrides = this.overrides();
        return {
            raw: { ...RECOMMENDED.raw, ...overrides.raw },
            gzip: { ...RECOMMENDED.gzip, ...overrides.gzip },
            brotli: { ...RECOMMENDED.brotli, ...overrides.brotli },
        };
    });

    of(mode: Mode): Criteria {
        return this.byMode()[mode];
    }

    /** How many criteria differ from the recommended one in that mode. 0 = all recommended. */
    customCount(mode: Mode): number {
        return Object.keys(this.overrides()[mode]).length;
    }

    isCustom(mode: Mode, key: CriteriaKey): boolean {
        return key in this.overrides()[mode];
    }

    /** A value equal to the recommended one, or not valid, stops being custom. */
    set(mode: Mode, key: CriteriaKey, value: number): void {
        this.overrides.update(current => {
            const next: Partial<Criteria> = { ...current[mode] };
            if (!Number.isFinite(value) || value < 0 || value === RECOMMENDED[mode][key]) {
                delete next[key];
            } else {
                next[key] = value;
            }

            return { ...current, [mode]: next };
        });
        persist(this.overrides());
    }

    /**
     * Every threshold of a `loadline.json` at once.
     *
     * One call rather than thirty `set()`s so the file lands as a single change: thirty writes to
     * `localStorage` and thirty recomputations of the report, for what is one decision somebody
     * committed. Values equal to the recommended one drop out, the same as they do in `set`.
     */
    applyAll(values: Partial<Criteria>, mode: Mode): void {
        this.overrides.update(current => {
            const next: Partial<Criteria> = { ...current[mode] };
            for (const [key, value] of Object.entries(values) as [CriteriaKey, number][]) {
                if (!Number.isFinite(value) || value < 0 || value === RECOMMENDED[mode][key]) {
                    delete next[key];
                } else {
                    next[key] = value;
                }
            }

            return { ...current, [mode]: next };
        });
        persist(this.overrides());
    }

    reset(mode: Mode): void {
        this.overrides.update(current => ({ ...current, [mode]: {} }));
        persist(this.overrides());
    }
}
