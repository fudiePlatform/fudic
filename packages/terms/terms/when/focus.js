// Gives an element the focus.
export const meta = {
  name: 'focus',
  block: 'when',
  params: [{ name: 'target', type: 'element' }],
  describe: ({ target }) => `${target} gets the focus`,
};

/** @type {import('@fudic/terms').Term['run']} */
export async function run(ctx, { target }) {
  await ctx.locate(String(target)).focus();
  return { pass: true, evidence: `focused ${target}` };
}
