// Time passes: with `clock`, the browser's and the server's clocks move that far and what falls
// due fires; without it, the criterion waits for real.
export const meta = {
  name: 'wait',
  block: 'when',
  params: [{ name: 'ms', type: 'number' }],
  describe: ({ ms }) => `${ms} ms pass`,
};

/** @type {import('@fudic/terms').Term['run']} */
export async function run(ctx, { ms }) {
  await ctx.advance(Number(ms));
  return { pass: true, evidence: `${ms} ms passed` };
}
