// The element is not on screen: hidden, or not there at all.
export const meta = {
  name: 'hidden',
  block: 'then',
  params: [{ name: 'target', type: 'element' }],
  describe: ({ target }) => `${target} is hidden`,
};

/** @type {import('@fudic/terms').Term['run']} */
export async function run(ctx, { target }) {
  const visible = await ctx.locate(String(target)).isVisible();
  return { pass: !visible, evidence: visible ? 'visible' : 'hidden' };
}
