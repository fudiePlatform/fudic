// The page is at this path, query included: `/usuarios`, `/buscar?q=ana`.
export const meta = {
  name: 'url',
  block: 'then',
  params: [{ name: 'expected', type: 'string' }],
  describe: ({ expected }) => `the page is at ${expected}`,
};

/** @type {import('@fudic/terms').Term['run']} */
export async function run(ctx, { expected }) {
  const at = new URL(ctx.page.url());
  const actual = at.pathname + at.search;
  return { pass: actual === String(expected), evidence: { expected: String(expected), actual } };
}
