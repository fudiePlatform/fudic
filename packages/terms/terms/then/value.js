// The value of a control — an input, a textarea, a select — is exactly this.
export const meta = {
  name: 'value',
  block: 'then',
  params: [
    { name: 'target', type: 'element' },
    { name: 'expected', type: 'string' },
  ],
  describe: ({ target, expected }) => `${target} holds "${expected}"`,
};

/** What Playwright says of an element that holds no value at all. */
const NOT_A_CONTROL = /Node is not an <input>, <textarea> or <select> element/u;

/** @type {import('@fudic/terms').Term['run']} */
export async function run(ctx, { target, expected }) {
  const wanted = `"${expected}"`;
  const element = ctx.locate(String(target));
  // An element that is not there holds nothing: a fail, not a wait.
  if ((await element.count()) === 0) return { pass: false, evidence: { expected: wanted, actual: 'not there' } };
  let actual;
  try {
    actual = await element.inputValue();
  } catch (error) {
    if (!NOT_A_CONTROL.test(String(error))) throw error;
    return { pass: false, evidence: { expected: wanted, actual: 'not a control' } };
  }
  return { pass: actual === String(expected), evidence: { expected: wanted, actual: `"${actual}"` } };
}
