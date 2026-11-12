// The browser's forward button.
export const meta = {
  name: 'forward',
  block: 'when',
  params: [],
  describe: () => 'the user goes forward',
};

/** @type {import('@fudic/terms').Term['run']} */
export async function run(ctx) {
  const response = await ctx.page.goForward({ waitUntil: 'commit' });
  return { pass: true, evidence: response === null ? 'nothing to go forward to, or the same document' : `forward to ${new URL(response.url()).pathname}` };
}
