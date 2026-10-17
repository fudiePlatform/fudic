// The element is on screen.
export const meta = {
  name: 'visible',
  block: 'then',
  params: [{ name: 'target', type: 'element' }],
  describe: ({ target }) => `${target} is visible`,
};

/** @type {import('@fudic/terms').Term['run']} */
export async function run(ctx, { target }) {
  const visible = await ctx.locate(String(target)).isVisible();
  return { pass: visible, evidence: visible ? 'visible' : 'hidden' };
}
