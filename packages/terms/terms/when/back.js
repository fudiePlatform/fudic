// The browser's back button.
export const meta = {
  name: 'back',
  block: 'when',
  params: [],
  describe: () => 'the user goes back',
};

/** @type {import('@fudic/terms').Term['run']} */
export async function run(ctx) {
  const response = await ctx.page.goBack({ waitUntil: 'commit' });
  return { pass: true, evidence: response === null ? 'nothing to go back to, or the same document' : `back to ${new URL(response.url()).pathname}` };
}
