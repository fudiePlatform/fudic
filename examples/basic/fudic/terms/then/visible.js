// The element is on screen.
export const meta = {
  name: 'visible',
  block: 'then',
  params: [{ name: 'target', type: 'element' }],
  describe: ({ target }) => `${target} is visible`,
};

export async function run(ctx, { target }) {
  const visible = await ctx.locate(target).isVisible();
  return { pass: visible, evidence: visible ? 'visible' : 'hidden' };
}

export const selfTest = [{ args: { target: 'app-card' }, expect: 'pass' }];
