// The function (or remote rule) was called this many times in the criterion, answered by the
// fixture or for real.
export const meta = {
  name: 'called',
  block: 'then',
  params: [
    { name: 'fn', type: 'token' },
    { name: 'times', type: 'number' },
  ],
  describe: ({ fn, times }) => `${fn} was called ${times} ${Number(times) === 1 ? 'time' : 'times'}`,
  // «Never» holds by what is not there: read once, on the quiet page.
  negative: ({ times }) => Number(times) === 0,
};

/** @type {import('@fudic/terms').Term['run']} */
export async function run(ctx, { fn, times }) {
  const actual = ctx.calls().filter((call) => call.name === String(fn)).length;
  return { pass: actual === Number(times), evidence: { expected: `${times} calls`, actual: `${actual} calls` } };
}
