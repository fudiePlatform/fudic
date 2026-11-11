// The checkbox (or switch) is not ticked.
export const meta = {
  name: 'unchecked',
  block: 'then',
  params: [{ name: 'target', type: 'element' }],
  describe: ({ target }) => `${target} is unticked`,
  // Holds by what is not there: read once, on the quiet page.
  negative: true,
};

/** What Playwright says of an element that cannot be ticked at all. */
const NOT_CHECKABLE = /Not a checkbox or radio button/u;

/** @type {import('@fudic/terms').Term['run']} */
export async function run(ctx, { target }) {
  const element = ctx.locate(String(target));
  if ((await element.count()) === 0) return { pass: false, evidence: { expected: 'unticked', actual: 'not there' } };
  let checked;
  try {
    checked = await element.isChecked();
  } catch (error) {
    if (!NOT_CHECKABLE.test(String(error))) throw error;
    return { pass: false, evidence: { expected: 'unticked', actual: 'not a checkbox' } };
  }
  return { pass: !checked, evidence: { expected: 'unticked', actual: checked ? 'ticked' : 'unticked' } };
}
