// Ticks a checkbox (or a switch, or a radio) with a click, as a person would: already ticked, it
// is left alone. What the page does with it afterwards is the `then`'s to read.
export const meta = {
  name: 'check',
  block: 'when',
  params: [{ name: 'target', type: 'element' }],
  describe: ({ target }) => `the user ticks ${target}`,
};

/** @type {import('@fudic/terms').Term['run']} */
export async function run(ctx, { target }) {
  const element = ctx.locate(String(target));
  if (await element.isChecked()) return { pass: true, evidence: `${target} was already ticked` };
  await ctx.act(element, () => element.click());
  return { pass: true, evidence: `ticked ${target}` };
}
