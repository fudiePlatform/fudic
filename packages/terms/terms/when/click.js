// Clicks an element, and waits until the page has served the click.
export const meta = {
  name: 'click',
  block: 'when',
  params: [{ name: 'target', type: 'element' }],
  describe: ({ target }) => `the user clicks ${target}`,
};

/** @type {import('@fudic/terms').Term['run']} */
export async function run(ctx, { target }) {
  const element = ctx.locate(String(target));
  await ctx.act(element, () => element.click());
  return { pass: true, evidence: `clicked ${target}` };
}
