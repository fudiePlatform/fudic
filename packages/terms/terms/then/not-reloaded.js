// The document is the same one as before the last `when`: what it did happened inside the page,
// without a reload or a navigation.
export const meta = {
  name: 'not-reloaded',
  block: 'then',
  params: [],
  describe: () => 'the page was not reloaded',
  // A reload does not undo itself: read once, on the quiet page.
  negative: true,
};

/** @type {import('@fudic/terms').Term['run']} */
export async function run(ctx) {
  const reloaded = await ctx.reloaded();
  return { pass: !reloaded, evidence: { expected: 'the same document', actual: reloaded ? 'another document' : 'the same document' } };
}
