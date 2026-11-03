// The element is on screen.
export const meta = {
  name: 'visible',
  block: 'then',
  params: [{ name: 'target', type: 'element' }],
  describe: ({ target }) => `${target} is visible`,
};

/** @type {import('@fudic/terms').Term['run']} */
export async function run(ctx, { target }) {
  const element = ctx.locate(String(target));
  if ((await element.count()) === 0) return { pass: false, evidence: { expected: 'visible', actual: 'not there' } };
  const visible = await element.isVisible();
  return { pass: visible, evidence: { expected: 'visible', actual: visible ? 'visible' : 'hidden' } };
}
