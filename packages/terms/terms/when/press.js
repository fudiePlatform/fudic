// Focuses an element and presses a key on it: "x", "Enter", "Shift+Tab"…
export const meta = {
  name: 'press',
  block: 'when',
  params: [
    { name: 'target', type: 'element' },
    { name: 'key', type: 'string' },
  ],
  describe: ({ target, key }) => `the user presses ${key} on ${target}`,
};

/** @type {import('@fudic/terms').Term['run']} */
export async function run(ctx, { target, key }) {
  const element = ctx.locate(String(target));
  await ctx.act(element, () => element.press(String(key)));
  return { pass: true, evidence: `pressed ${key}` };
}
