// The browser's reload button.
export const meta = {
  name: 'reload',
  block: 'when',
  params: [],
  describe: () => 'the user reloads the page',
};

/** @type {import('@fudic/terms').Term['run']} */
export async function run(ctx) {
  await ctx.page.reload({ waitUntil: 'commit' });
  return { pass: true, evidence: `reloaded ${new URL(ctx.page.url()).pathname}` };
}
