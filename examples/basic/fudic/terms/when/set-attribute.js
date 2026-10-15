// Sets an attribute on an element; the evidence says what it was before.
export const meta = {
  name: 'set-attribute',
  block: 'when',
  params: [
    { name: 'target', type: 'element' },
    { name: 'attribute', type: 'token' },
    { name: 'value', type: 'string' },
  ],
  describe: ({ target, attribute, value }) => `${target} gets ${attribute}="${value}"`,
};

export async function run(ctx, { target, attribute, value }) {
  const before = await ctx.locate(target).setAttribute(attribute, value);
  return { pass: true, evidence: before === null ? 'before: none' : `before: "${before}"` };
}

export const selfTest = [{ args: { target: 'app-card', attribute: 'variant', value: 'highlight' }, expect: 'pass' }];
