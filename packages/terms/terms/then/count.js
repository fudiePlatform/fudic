// How many elements the reference finds: here a reference may find several, or none.
export const meta = {
  name: 'count',
  block: 'then',
  params: [
    { name: 'target', type: 'element' },
    { name: 'n', type: 'number' },
  ],
  describe: ({ target, n }) => `there are ${n} of ${target}`,
  // «None» holds by what is not there: read once, on the quiet page.
  negative: ({ n }) => Number(n) === 0,
};

/** @type {import('@fudic/terms').Term['run']} */
export async function run(ctx, { target, n }) {
  const actual = await ctx.locate(String(target)).count();
  return { pass: actual === Number(n), evidence: { expected: String(n), actual: String(actual) } };
}
