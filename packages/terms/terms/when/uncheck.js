// Unticks a checkbox (or a switch) with a click, as a person would: already unticked, it is left
// alone. A page that ticks it again — a refusal of the server — is the `then`'s to read.
export const meta = {
  name: 'uncheck',
  block: 'when',
  params: [{ name: 'target', type: 'element' }],
  describe: ({ target }) => `the user unticks ${target}`,
};

/** @type {import('@fudic/terms').Term['run']} */
export async function run(ctx, { target }) {
  const element = ctx.locate(String(target));
  if (!(await element.isChecked())) return { pass: true, evidence: `${target} was already unticked` };
  await ctx.act(element, () => element.click());
  return { pass: true, evidence: `unticked ${target}` };
}
