// The element's attribute has exactly this value.
export const meta = {
  name: 'attribute',
  block: 'then',
  params: [
    { name: 'target', type: 'element' },
    { name: 'attribute', type: 'token' },
    { name: 'expected', type: 'string' },
  ],
  describe: ({ target, attribute, expected }) => `${target} has ${attribute}="${expected}"`,
};

/** @type {import('@fudic/terms').Term['run']} */
export async function run(ctx, { target, attribute, expected }) {
  const element = ctx.locate(String(target));
  // An element that is not there has no attribute: a fail, not a wait.
  if ((await element.count()) === 0) return { pass: false, evidence: { expected, actual: 'not there' } };
  const actual = await element.getAttribute(String(attribute));
  return { pass: actual === String(expected), evidence: { expected, actual } };
}
