import { Pipe, type PipeTransform } from '@angular/core';
import { formatBytes } from '@core/format/format.utils';

/**
 * A byte count as people read it: `184 kB`, `1.20 MB`. Pure, so a table of a thousand rows only
 * formats the numbers that changed.
 */
@Pipe({ name: 'bytes' })
export class BytesPipe implements PipeTransform {
    transform(bytes: number): string {
        return formatBytes(bytes);
    }
}
