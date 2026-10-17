// Types a text into an element, key by key, as a person would.
export const meta = {
  name: 'type',
  block: 'when',
  params: [
    { name: 'target', type: 'element' },
    { name: 'text', type: 'string' },
  ],
  describe: ({ target, text }) => `the user types "${text}" in ${target}`,
};

/** @type {import('@fudic/terms').Term['run']} */
export async function run(ctx, { target, text }) {
  const element = ctx.locate(String(target));
  await ctx.act(element, () => element.pressSequentially(String(text)));
  return { pass: true, evidence: `typed "${text}"` };
}
