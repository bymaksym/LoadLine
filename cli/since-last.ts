/**
 * The line that answers "did that change help?": what moved since the last run of the same build,
 * remembered in `node_modules/.cache/loadline` without anybody passing a `--baseline`.
 */

import { formatBytes, formatDelta } from '../src/app/core/format/format.utils';
import { UI } from '../src/app/core/i18n/ui';
import { type CliReport } from './report.types';
import { CLI_TEXT } from './text';

/**
 * What moved since the last run of this build, in one line: "bootstrap 156 kB → 129 kB (−27 kB)",
 * then the screens that changed. `null` when there is nothing to compare against.
 */
export const sinceLastLine = (report: CliReport): string | null => {
    const since = report.sinceLast;
    if (!since) {
        return null;
    }

    const text = CLI_TEXT[report.lang];
    const strings = UI[report.lang];
    // What each screen adds on top of the bootstrap: a bootstrap that shrank moves every screen's
    // total by the same amount, and listing that once per screen repeats the first figure.
    const moved = [...since.screens.values()].filter(screen => screen.lazy.diff !== 0);
    const parts = [
        ...(since.boot.diff === 0
            ? []
            : [
                  `${strings.tabBoot.toLowerCase()} ${formatBytes(since.boot.before)} → ${formatBytes(since.boot.after)} (${formatDelta(since.boot.diff)})`,
              ]),
        ...moved
            .toSorted((a, b) => Math.abs(b.lazy.diff) - Math.abs(a.lazy.diff))
            .slice(0, 3)
            .map(screen => `${screen.label} ${formatDelta(screen.lazy.diff)}`),
        ...(moved.length > 3 ? [`+${moved.length - 3}`] : []),
    ];
    // Local time: it is the person's own last run, on their own machine.
    const when = new Date(since.baselineDate);
    const two = (value: number): string => String(value).padStart(2, '0');
    const date = Number.isNaN(when.getTime())
        ? since.baselineDate
        : `${when.getFullYear()}-${two(when.getMonth() + 1)}-${two(when.getDate())} ${two(when.getHours())}:${two(when.getMinutes())}`;
    return text.sinceLast(date, parts.length > 0 ? parts.join(' · ') : text.lastRunUnchanged);
};
