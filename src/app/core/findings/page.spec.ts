import { describe, expect, it } from 'vitest';
import { buildPageFindings } from './page';

describe('buildPageFindings · assets on another host', () => {
    it('says nothing when no page was read: unknown is not "same origin"', () => {
        expect(buildPageFindings(null, 'en')).toEqual([]);
    });

    it('says nothing about a page that fetches only from itself', () => {
        expect(buildPageFindings({ origins: [], hinted: [], base: null }, 'en')).toEqual([]);
    });

    it('raises it above context when the host carrying the scripts is not warmed', () => {
        const [finding] = buildPageFindings(
            {
                origins: [{ origin: 'https://cdn.example.com', files: 3, scripts: 2 }],
                hinted: [],
                base: null,
            },
            'en',
        );

        expect(finding?.kind).toBe('assetOrigin');
        expect(finding?.severity).toBe('mid');
        expect(finding?.fix).toContain('preconnect');
    });

    it('drops to context when the page already warms the connection', () => {
        const [finding] = buildPageFindings(
            {
                origins: [{ origin: 'https://cdn.example.com', files: 3, scripts: 2 }],
                hinted: ['https://cdn.example.com'],
                base: null,
            },
            'en',
        );

        expect(finding?.severity).toBe('info');
    });

    it('leaves a host that carries no JavaScript alone: the split is what this report is about', () => {
        expect(
            buildPageFindings(
                { origins: [{ origin: 'https://fonts.example.com', files: 2, scripts: 0 }], hinted: [], base: null },
                'en',
            ),
        ).toEqual([]);
    });

    it('names both sides of the trade: a handshake added and queueing taken away', () => {
        const [finding] = buildPageFindings(
            { origins: [{ origin: 'https://cdn.example.com', files: 1, scripts: 1 }], hinted: [], base: null },
            'en',
        );

        expect(finding?.body).toContain('HTTP/1.1');
    });
});
