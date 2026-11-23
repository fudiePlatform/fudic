import { describe, expect, test } from 'vitest';
import { visit } from '@fudic/testing';
import { normalize, parts } from '../../../server/routes/docs/reference/diagnostics';

describe('/docs/reference/diagnostics', () => {
  test('with no code, only the search box', async () => {
    const page = await visit('/docs/reference/diagnostics');
    expect(page.status).toBe(200);
    expect(page.query('input[name="code"]')).toHaveValue('');
    expect(page.document.querySelector('article')).toBeNull();
  });

  test('a code shows its explanation, in English, read from its .md', async () => {
    const page = await visit('/docs/reference/diagnostics?code=10');
    const article = page.query('article');
    expect(article).toHaveAttribute('lang', 'en');
    expect(page.getByRole('heading', { level: 2, name: /^FUD0010 — / })).toBeInTheDocument();
    expect(article.querySelector('code')).not.toBeNull();
    expect(page.query('input[name="code"]')).toHaveValue('FUD0010');
    expect(page.document.title).toBe('FUD0010 · Fudic');
  });

  test('a code that does not exist says so, with the search box still there', async () => {
    const page = await visit('/docs/reference/diagnostics?code=FUD9999');
    expect(page.getByRole('status')).toHaveTextContent('FUD9999');
    expect(page.query('input[name="code"]')).toHaveValue('FUD9999');
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
