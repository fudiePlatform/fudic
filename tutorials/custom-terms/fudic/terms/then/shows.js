export const meta = {
  name: 'shows',
  block: 'then',
  params: [
    { name: 'count', type: 'number' },
  ],
  describe: ({ count }) => `the counter shows ${count}`,
};

/** @type {import('@fudic/terms').Term<string>['run']} */
export async function run(ctx, { count }) {
  const actual = await ctx.text(ctx.locate('output'));
  return { pass: actual === String(count), evidence: { expected: String(count), actual } };
}

export const selfTest = [];
