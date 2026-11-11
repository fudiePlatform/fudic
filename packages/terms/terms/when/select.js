// Chooses an option of a list by the text a person reads on it.
export const meta = {
  name: 'select',
  block: 'when',
  params: [
    { name: 'target', type: 'element' },
    { name: 'option', type: 'string' },
  ],
  describe: ({ target, option }) => `the user chooses "${option}" in ${target}`,
};

/** @type {import('@fudic/terms').Term['run']} */
export async function run(ctx, { target, option }) {
  const element = ctx.locate(String(target));
  await ctx.act(element, () => element.selectOption({ label: String(option) }));
  return { pass: true, evidence: `chose "${option}"` };
}
