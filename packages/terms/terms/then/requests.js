// How many requests went out during the last `when`: documents, data, functions, rules and
// resources, from the page and from its Service Worker.
export const meta = {
  name: 'requests',
  block: 'then',
  params: [{ name: 'n', type: 'number' }],
  describe: ({ n }) => `${n} ${Number(n) === 1 ? 'request' : 'requests'} went out`,
  // What went out is counted once the page is quiet: waiting does not change it.
  negative: true,
};

/** @type {import('@fudic/terms').Term['run']} */
export async function run(ctx, { n }) {
  const actual = ctx.lastWhen().requests;
  return { pass: actual === Number(n), evidence: { expected: `${n} requests`, actual: `${actual} requests` } };
}
