import { describe, expect, test } from 'vitest';
import { visit } from '@fudic/testing';
import { normalize, parts } from '../../../../server/lib/diagnostics';

describe('/docs/reference/diagnostics/[code]', () => {
  test('a code shows its explanation, in English, in the colour of its severity', async () => {
    const page = await visit('/docs/reference/diagnostics/FUD0010');
    const article = page.query('article')!;
    expect(article).toHaveAttribute('lang', 'en');
    expect(article).toHaveAttribute('data-severity', 'error');
    expect(page.getByRole('heading', { level: 1 })).toHaveTextContent('@ starts no Razor construct');
    expect(article.querySelector('.fix code')).not.toBeNull();
    expect(page.document.title).toBe('FUD0010 · Fudic');
  });

  test('a short form of the code redirects to the canonical one', async () => {
    await expect(visit('/docs/reference/diagnostics/10')).rejects.toThrow(/301 to \/docs\/reference\/diagnostics\/FUD0010/);
  });

  test('a code that does not exist says so', async () => {
    const page = await visit('/docs/reference/diagnostics/FUD9999');
    expect(page.getByRole('status')).toHaveTextContent('FUD9999');
    expect(page.document.querySelector('article')).toBeNull();
  });
});

describe('normalize', () => {
  test('FUD0010, fud10 and 10 name the same code; anything else names none', () => {
    expect(normalize('FUD0010')).toBe('FUD0010');
    expect(normalize(' fud10 ')).toBe('FUD0010');
    expect(normalize('10')).toBe('FUD0010');
    expect(normalize('FUD12345')).toBeUndefined();
    expect(normalize('abc')).toBeUndefined();
  });
});

describe('parts', () => {
  test('the runs between backticks are code, and empty runs are dropped', () => {
    expect(parts('use `@@` here')).toEqual([
      { at: 0, text: 'use ', code: false },
      { at: 1, text: '@@', code: true },
      { at: 2, text: ' here', code: false },
    ]);
    expect(parts('`a`')).toEqual([{ at: 1, text: 'a', code: true }]);
  });
});
