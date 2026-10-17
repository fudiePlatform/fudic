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

// Runs in the page, so it travels as source text.
const SET = new Function(
  'element',
  '[name, value]',
  'const before = element.getAttribute(name); element.setAttribute(name, value); return before;',
);

/** @type {import('@fudic/terms').Term['run']} */
export async function run(ctx, { target, attribute, value }) {
  const element = ctx.locate(String(target));
  const before = await ctx.act(element, () => element.evaluate(SET, [String(attribute), String(value)]));
  return { pass: true, evidence: before === null ? 'before: none' : `before: "${before}"` };
}
