// The element's text contains this string.
export const meta = {
  name: 'text',
  block: 'then',
  params: [
    { name: 'target', type: 'element' },
    { name: 'expected', type: 'string' },
  ],
  describe: ({ target, expected }) => `${target} says "${expected}"`,
};

export async function run(ctx, { target, expected }) {
  const text = await ctx.text(ctx.locate(target));
  // `{ expected, actual }`: the workbench and `run` show them one against the other.
  return { pass: text.includes(expected), evidence: { expected, actual: text } };
}

export const selfTest = [{ args: { target: 'app-card', expected: '' }, expect: 'pass' }];
