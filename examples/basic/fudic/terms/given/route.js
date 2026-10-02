// Opens a page of the app before the criterion runs.
export const meta = {
  name: 'route',
  block: 'given',
  params: [{ name: 'path', type: 'token' }],
  describe: ({ path }) => `the page ${path} is open`,
};

export async function run(ctx, { path }) {
  await ctx.goto(path);
  return { pass: true, evidence: `opened ${path}` };
}

export const selfTest = [{ args: { path: '/' }, expect: 'pass' }];
