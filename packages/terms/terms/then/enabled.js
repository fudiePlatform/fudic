// The control can be used: not disabled.
export const meta = {
  name: 'enabled',
  block: 'then',
  params: [{ name: 'target', type: 'element' }],
  describe: ({ target }) => `${target} can be used`,
};

/** @type {import('@fudic/terms').Term['run']} */
export async function run(ctx, { target }) {
  const element = ctx.locate(String(target));
  if ((await element.count()) === 0) return { pass: false, evidence: { expected: 'enabled', actual: 'not there' } };
  const enabled = await element.isEnabled();
  return { pass: enabled, evidence: { expected: 'enabled', actual: enabled ? 'enabled' : 'disabled' } };
}
