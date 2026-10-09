/**
 * What is said about a `situation` block that got something wrong, in both languages of the report.
 *
 * Here and not in `config/config-text.ts` with the rest of the file's problems, although they are
 * printed alongside them: the reader of the answers lives in this folder, and borrowing its words
 * from `config` closed a loop — `config` reads the answers through this folder, the signals read
 * them too, and `config` names the signals. Its own words are the only thing it needed from there.
 */

import { type Lang } from '../i18n/ui-strings';

export interface SituationText {
    unknownAnswer: (key: string, given: string) => string;
    badSituationNumber: (key: string, limit: number) => string;
    badAnsweredAt: (given: string) => string;
}

export const SITUATION_TEXT: Record<Lang, SituationText> = {
    en: {
        unknownAnswer: (key, given) => `Unknown answer in "situation.${key}": ${given}. It counts as unanswered.`,
        badSituationNumber: (key, limit) => `"situation.${key}" is not a number between 0 and ${limit}. It is ignored.`,
        badAnsweredAt: given => `"situation.answeredAt" is not a YYYY-MM-DD date: ${given}. It is ignored.`,
    },
    es: {
        unknownAnswer: (key, given) =>
            `Respuesta desconocida en "situation.${key}": ${given}. Cuenta como sin responder.`,
        badSituationNumber: (key, limit) => `"situation.${key}" no es un número entre 0 y ${limit}. Se ignora.`,
        badAnsweredAt: given => `"situation.answeredAt" no es una fecha AAAA-MM-DD: ${given}. Se ignora.`,
    },
};
