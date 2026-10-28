import { describe, expect, it } from 'vitest';
import { isExpoPackage, isHermesBytecode, nativeExportOf } from './native-export';

const HERMES = new Uint8Array([0xc6, 0x1f, 0xbc, 0x03, 0xc1, 0x03, 0x19, 0x1f, 0x60, 0, 0, 0]);

describe('nativeExportOf', () => {
    it('reads the platforms from the metadata expo export writes', () => {
        const metadata = JSON.stringify({ version: 0, bundler: 'metro', fileMetadata: { android: {}, ios: {} } });

        expect(nativeExportOf([], metadata)).toEqual({ platforms: ['android', 'ios'], evidence: 'metadata.json' });
    });

    it('knows a Hermes bundle or a native bundle folder without the metadata', () => {
        expect(nativeExportOf(['_expo/static/js/android/entry-1a2b.hbc'], null)).toEqual({
            platforms: ['android'],
            evidence: '_expo/static/js/android/entry-1a2b.hbc',
        });
        expect(nativeExportOf(['_expo/static/js/ios/entry-1a2b.js'], null)?.platforms).toEqual(['ios']);
    });

    /** A web export is a web build: `_expo/static/js/web/`, no native platform in its metadata. */
    it('leaves a web export alone', () => {
        const metadata = JSON.stringify({ version: 0, bundler: 'metro', fileMetadata: {} });

        expect(nativeExportOf(['_expo/static/js/web/entry-1a2b.js', 'index.html'], metadata)).toBeNull();
    });
});

describe('isHermesBytecode · isExpoPackage', () => {
    it('reads the magic number, and nothing shorter', () => {
        expect(isHermesBytecode(HERMES)).toBe(true);
        expect(isHermesBytecode(HERMES.subarray(0, 4))).toBe(false);
        expect(isHermesBytecode(new TextEncoder().encode('{"version":3}'))).toBe(false);
    });

    it('knows an Expo app by its dependency', () => {
        expect(isExpoPackage(JSON.stringify({ dependencies: { expo: '~54.0.0' } }))).toBe(true);
        expect(isExpoPackage(JSON.stringify({ dependencies: { vite: '^8.0.0' } }))).toBe(false);
        expect(isExpoPackage('not json')).toBe(false);
    });
});
