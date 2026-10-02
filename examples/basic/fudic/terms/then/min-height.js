// The element is at least this tall: a touch target, a card that must not collapse.
export const meta = {
  name: 'min-height',
  block: 'then',
  params: [
    { name: 'target', type: 'element' },
    { name: 'px', type: 'number' },
  ],
  describe: ({ target, px }) => `${target} is at least ${px}px tall`,
};

export async function run(ctx, { target, px }) {
  const { height } = await ctx.locate(target).box();
  return { pass: height >= px, evidence: `${height}px` };
}

export const selfTest = [{ args: { target: 'app-card', px: 1 }, expect: 'pass' }];
