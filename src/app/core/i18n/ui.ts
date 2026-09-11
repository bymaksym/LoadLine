import { EN } from './en';
import { ES } from './es';
import { type Lang, type UiStrings } from './ui-strings';

/** The strings of both languages, picked by `I18nService`. */
export const UI: Record<Lang, UiStrings> = { es: ES, en: EN };
