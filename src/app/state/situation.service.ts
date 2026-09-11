import { computed, Service, signal } from '@angular/core';
import { readLocal, writeLocal } from '../core/session/local-store';
import {
    answeredCount,
    cascadeExposure,
    EMPTY_SITUATION,
    hasSituation,
    readSituation,
} from '../core/situation/situation';
import { type RawKey, type Situation, type SituationKey } from '../core/situation/situation.types';

const STORAGE_KEY = 'loadline.situation.v1';

/**
 * The five answers, kept where the person who gave them can find them again.
 *
 * **Why the browser and not only the file.** The answers belong in `loadline.json` — that is the
 * point of asking them, and it is the only way the command sees them — but the file is written by
 * hand and committed, which is a slow loop for a form somebody is halfway through. So they are held
 * here while they are being given, and the tab offers the file at the end. The two never disagree
 * for long: reading a `loadline.json` in the intake replaces what is here.
 *
 * The date is stamped on the first answer rather than on every keystroke. What it is for is saying
 * how old the *opinion* is, and re-picking the same option two months later does not make the
 * opinion newer — but changing an answer does, so that one restamps.
 */
@Service()
export class SituationService {
    // * ATTRIBUTES
    private readonly current = signal<Situation>(load());

    /** What the report reads. Never `null`: nobody having answered is a state, not an absence. */
    readonly situation = this.current.asReadonly();

    readonly answered = computed(() => answeredCount(this.current()));

    readonly anything = computed(() => hasSituation(this.current()));

    /** What the two middle answers say about the cascade, for the parts of the UI that show it. */
    readonly exposure = computed(() => cascadeExposure(this.current()));

    /** One of the five. The value is the option's own key, which is why it is typed as a string. */
    answer(key: SituationKey, value: string): void {
        this.write(current => ({ ...current, [key]: value }));
    }

    /** One of the three raw figures. `null` clears it and hands the question back to its band. */
    setRaw(key: RawKey, value: number | null): void {
        const clean = value !== null && Number.isFinite(value) && value >= 0 ? value : null;
        this.write(current => ({ ...current, [key]: clean }));
    }

    setRum(value: boolean): void {
        this.write(current => ({ ...current, rum: value }));
    }

    setWho(value: string): void {
        this.write(current => ({ ...current, answeredBy: value.trim() || null }));
    }

    /**
     * Set by hand, because an answer copied out of an old file keeps the date it was given rather
     * than the date it was typed in here.
     *
     * It does not go through `write`, which is the one place that stamps today's date: a field that
     * refilled itself the moment it was emptied would be a field nobody can correct.
     */
    setWhen(value: string): void {
        const date = /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
        this.current.update(current => ({ ...current, answeredAt: date }));
        persist(this.current());
    }

    /**
     * Everything a `loadline.json` said, at once.
     *
     * The file wins whole rather than field by field: a committed block is one decision a team took
     * together, and merging it into whatever was left in this browser would produce a set of
     * answers nobody ever gave.
     */
    apply(situation: Situation): void {
        this.current.set(situation);
        persist(situation);
    }

    reset(): void {
        this.apply(EMPTY_SITUATION);
    }

    private write(change: (current: Situation) => Situation): void {
        this.current.update(current => {
            const next = change(current);
            // Stamped when the answers change, so the date describes the opinion rather than the
            // last time somebody opened the tab.
            return { ...next, answeredAt: next.answeredAt ?? new Date().toISOString().slice(0, 10) };
        });
        persist(this.current());
    }
}

const load = (): Situation => {
    const stored = readLocal(STORAGE_KEY);
    if (!stored) {
        return EMPTY_SITUATION;
    }

    try {
        // Through the same reader the file goes through: an old shape of this key, or something
        // else that wrote it, becomes unanswered rather than an answer nobody gave.
        return readSituation(JSON.parse(stored)).situation;
    } catch {
        return EMPTY_SITUATION;
    }
};

const persist = (situation: Situation): void => {
    writeLocal(STORAGE_KEY, JSON.stringify(situation));
};
