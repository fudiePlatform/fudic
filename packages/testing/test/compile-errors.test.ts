import { expect, test } from 'vitest';

// Criterion 2: a `.fud` that does not compile does not import. The import rejects with its
// diagnostics told as the build tells them, `path:line:col - error FUDnnnn: message`.
async function failureOf(load: () => Promise<unknown>): Promise<string> {
  return load().then(
    () => 'imported',
    (error: unknown) => (error as Error).message,
  );
}

test('a semantic error', async () => {
  const message = await failureOf(() => import('./fixtures/broken-mode.fud'));
  expect(message).toMatch(/test\/fixtures\/broken-mode\.fud:2:13 - error FUD0158: /u);
});

test('a broken expression is told as the .fud error, not as a parse error of generated code', async () => {
  const message = await failureOf(() => import('./fixtures/broken-expr.fud'));
  expect(message).toMatch(/test\/fixtures\/broken-expr\.fud:3:\d+ - error FUD\d{4}: /u);
  expect(message).not.toMatch(/PARSE_ERROR|\.fud\.ts/u);
});
