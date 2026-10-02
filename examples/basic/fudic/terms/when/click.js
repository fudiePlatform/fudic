// Clicks an element, by tag or by role and accessible name.
export const meta = {
  name: 'click',
  block: 'when',
  params: [{ name: 'target', type: 'element' }],
  describe: ({ target }) => `the user clicks ${target}`,
};

export async function run(ctx, { target }) {
  await ctx.locate(target).click();
  return { pass: true, evidence: `clicked ${target}` };
}

export const selfTest = [{ args: { target: 'role:link' }, expect: 'pass' }];
