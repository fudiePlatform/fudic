// Moves the mouse over an element, and leaves it there.
export const meta = {
  name: 'hover',
  block: 'when',
  params: [{ name: 'target', type: 'element' }],
  describe: ({ target }) => `the user hovers over ${target}`,
};

/** @type {import('@fudic/terms').Term['run']} */
export async function run(ctx, { target }) {
  const element = ctx.locate(String(target));
  await ctx.act(element, () => element.hover());
  return { pass: true, evidence: `over ${target}` };
}
