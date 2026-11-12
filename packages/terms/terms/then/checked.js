// The checkbox (or switch, or radio) is ticked.
export const meta = {
  name: 'checked',
  block: 'then',
  params: [{ name: 'target', type: 'element' }],
  describe: ({ target }) => `${target} is ticked`,
};

/** What Playwright says of an element that cannot be ticked at all. */
const NOT_CHECKABLE = /Not a checkbox or radio button/u;

/** @type {import('@fudic/terms').Term['run']} */
export async function run(ctx, { target }) {
  const element = ctx.locate(String(target));
  if ((await element.count()) === 0) return { pass: false, evidence: { expected: 'ticked', actual: 'not there' } };
  let checked;
  try {
    checked = await element.isChecked();
  } catch (error) {
    if (!NOT_CHECKABLE.test(String(error))) throw error;
    return { pass: false, evidence: { expected: 'ticked', actual: 'not a checkbox' } };
  }
  return { pass: checked, evidence: { expected: 'ticked', actual: checked ? 'ticked' : 'unticked' } };
}
