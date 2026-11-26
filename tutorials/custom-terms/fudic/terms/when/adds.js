export const meta = {
  name: 'adds',
  block: 'when',
  params: [
    { name: 'times', type: 'number' },
  ],
  describe: ({ times }) => `the user adds ${times}`,
};

/** @type {import('@fudic/terms').Term<string>['run']} */
export async function run(ctx, { times }) {
  const button = ctx.locate('role:button/"+1"');
  for (let i = 0; i < times; i++) {
    await ctx.act(button, () => button.click());
  }
  return { pass: true, evidence: `clicked +1 ${times} times` };
}

export const selfTest = [];
