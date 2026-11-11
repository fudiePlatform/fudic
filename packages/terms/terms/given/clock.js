// The time stands at this instant, ISO 8601, in the browser and in the criterion's server: it
// only moves with `wait`, and the fixture's `later` count on it.
export const meta = {
  name: 'clock',
  block: 'given',
  params: [{ name: 'at', type: 'string' }],
  describe: ({ at }) => `the clock stands at ${at}`,
};

/** @type {import('@fudic/terms').Term['run']} */
export async function run(ctx, { at }) {
  const label = String(at);
  const instant = Date.parse(label);
  if (Number.isNaN(instant)) throw new Error(`"${label}" is not an ISO 8601 instant`);
  await ctx.clock(instant, label);
  return { pass: true, evidence: `the clock stands at ${new Date(instant).toISOString()}` };
}
