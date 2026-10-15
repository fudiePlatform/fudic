/**
 * Oxc types an error's `labels` as a list that may be empty, and no real input found makes it
 * so. The fallback span of `extractScriptMessages` is checked here against a parser that does.
 */

import { describe, expect, it, vi } from 'vitest';

vi.mock('oxc-parser', async (original) => ({
  ...(await original<typeof import('oxc-parser')>()),
  parseSync: () => ({ program: { body: [] }, errors: [{ message: 'boom', labels: [] }] }),
}));

const { extractScriptMessages } = await import('../../src/i18n/extract.js');
const { translateScript } = await import('../../src/i18n/script.js');

describe('an Oxc error without labels', () => {
  it('is FUD0170 at the start of the module', () => {
    const { value, diagnostics } = extractScriptMessages('whatever', 'src/a.ts');

    expect(value).toEqual([]);
    expect(diagnostics.map((d) => [d.code, d.span, d.message])).toEqual([
      ['FUD0170', { start: 0, end: 0 }, expect.stringContaining('boom')],
    ]);
  });

  it('is FUD0170 at the start of the module for translateScript too', () => {
    const { value, diagnostics } = translateScript('whatever', 'src/a.ts', {
      locale: 'en',
      locales: ['es', 'en'],
      translate: () => undefined,
    });

    expect(value.code).toBe('whatever');
    expect(diagnostics.map((d) => [d.code, d.span])).toEqual([['FUD0170', { start: 0, end: 0 }]]);
  });
});
