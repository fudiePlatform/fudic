// The element went to this slot of its host: `default` is the slot without a name.
export const meta = {
  name: 'slotted',
  block: 'then',
  params: [
    { name: 'target', type: 'element' },
    { name: 'slot', type: 'token' },
  ],
  describe: ({ target, slot }) => `${target} is in the ${slot} slot`,
};

// Runs in the page, so it travels as source text: the slot the element is assigned to.
const SLOT = new Function(
  'element',
  `const slot = element.assignedSlot;
  return slot === null ? 'none' : slot.name === '' ? 'default' : slot.name;`,
);

/** @type {import('@fudic/terms').Term['run']} */
export async function run(ctx, { target, slot }) {
  const element = ctx.locate(String(target));
  // Content no slot takes is not rendered, and a role does not find it: it went nowhere.
  const actual = (await element.count()) === 0 ? 'none' : await element.evaluate(SLOT);
  return { pass: actual === String(slot), evidence: { expected: slot, actual } };
}
