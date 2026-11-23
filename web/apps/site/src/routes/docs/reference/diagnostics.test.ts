import { expect, test } from 'vitest';
import { visit } from '@fudic/testing';

test('with no code, the search box and where codes come from', async () => {
  const page = await visit('/docs/reference/diagnostics');
  expect(page.status).toBe(200);
  expect(page.query('input[name="code"]')).toHaveValue('');
  expect(page.queryByRole('status')).toBeNull();
});

test('a code that exists redirects to its own page', async () => {
  await expect(visit('/docs/reference/diagnostics?code=10')).rejects.toThrow(/302 to \/docs\/reference\/diagnostics\/FUD0010/);
});

test('a code that does not exist says so, with the search box still there', async () => {
  const page = await visit('/docs/reference/diagnostics?code=FUD9999');
  expect(page.getByRole('status')).toHaveTextContent('FUD9999');
  expect(page.query('input[name="code"]')).toHaveValue('FUD9999');
});
