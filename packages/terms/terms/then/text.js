// The text a person sees in the element contains this string.
export const meta = {
  name: 'text',
  block: 'then',
  params: [
    { name: 'target', type: 'element' },
    { name: 'expected', type: 'string' },
  ],
  describe: ({ target, expected }) => `${target} says "${expected}"`,
};

/** @type {import('@fudic/terms').Term['run']} */
export async function run(ctx, { target, expected }) {
  const element = ctx.locate(String(target));
  // An element that is not there says nothing: a fail, not a wait.
  if ((await element.count()) === 0) return { pass: false, evidence: { expected, actual: 'not there' } };
  const actual = await ctx.text(element);
  return { pass: actual.includes(String(expected)), evidence: { expected, actual } };
}
