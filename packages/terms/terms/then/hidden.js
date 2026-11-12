// The element is not on screen: hidden, or not there at all.
export const meta = {
  name: 'hidden',
  block: 'then',
  params: [{ name: 'target', type: 'element' }],
  describe: ({ target }) => `${target} is hidden`,
  // Holds by what is not there: read once, on the quiet page.
  negative: true,
};

/** @type {import('@fudic/terms').Term['run']} */
export async function run(ctx, { target }) {
  const element = ctx.locate(String(target));
  if ((await element.count()) === 0) return { pass: true, evidence: { expected: 'hidden', actual: 'not there' } };
  const visible = await element.isVisible();
  return { pass: !visible, evidence: { expected: 'hidden', actual: visible ? 'visible' : 'hidden' } };
}
