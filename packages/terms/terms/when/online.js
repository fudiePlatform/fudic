// The network comes back.
export const meta = {
  name: 'online',
  block: 'when',
  params: [],
  describe: () => 'the network comes back',
};

/** @type {import('@fudic/terms').Term['run']} */
export async function run(ctx) {
  await ctx.page.context().setOffline(false);
  return { pass: true, evidence: 'the network is back' };
}
