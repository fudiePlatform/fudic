// The element went to this slot of its host: `default` is the slot without a name.
export const meta = {
  name: 'slotted',
  block: 'then',
  params: [
    { name: 'target', type: 'element' },
    { name: 'slot', type: 'token' },
  ],
  describe: ({ target, slot }) => `${target} is in the ${slot} slot`,
  // «In no slot» holds by what is not there: read once, on the quiet page.
  negative: ({ slot }) => String(slot) === 'none',
};

// Runs in the page, so it travels as source text: the slot the element is assigned to.
const SLOT = new Function(
  'element',
  `const slot = element.assignedSlot;
  return slot === null ? 'none' : slot.name === '' ? 'default' : slot.name;`,
);

/** The slot as a person reads it. */
const named = (slot) => (slot === 'none' ? 'no slot' : slot === 'default' ? 'the default slot' : `slot "${slot}"`);

/** @type {import('@fudic/terms').Term['run']} */
export async function run(ctx, { target, slot }) {
  const wanted = String(slot);
  const element = ctx.locate(String(target));
  // Content no slot takes is not rendered, and a role does not find it: it went nowhere.
  if ((await element.count()) === 0) {
    return { pass: wanted === 'none', evidence: { expected: named(wanted), actual: 'not there' } };
  }
  const actual = await element.evaluate(SLOT);
  return { pass: actual === wanted, evidence: { expected: named(wanted), actual: named(actual) } };
}
