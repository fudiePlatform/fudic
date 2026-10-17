// The element is in the page, whether or not it takes up any room on screen.
export const meta = {
  name: 'present',
  block: 'then',
  params: [{ name: 'target', type: 'element' }],
  describe: ({ target }) => `${target} is in the page`,
};

/** @type {import('@fudic/terms').Term['run']} */
export async function run(ctx, { target }) {
  const present = (await ctx.locate(String(target)).count()) > 0;
  return { pass: present, evidence: present ? 'in the page' : 'not there' };
}
