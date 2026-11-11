// The document's `<title>` is exactly this.
export const meta = {
  name: 'title',
  block: 'then',
  params: [{ name: 'expected', type: 'string' }],
  describe: ({ expected }) => `the title is "${expected}"`,
};

/** @type {import('@fudic/terms').Term['run']} */
export async function run(ctx, { expected }) {
  const actual = await ctx.page.title();
  return { pass: actual === String(expected), evidence: { expected: `"${expected}"`, actual: `"${actual}"` } };
}
