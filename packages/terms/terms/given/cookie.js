// Puts a cookie in the browser before the page opens, for the whole site of the criterion: its
// path is `/`, so it goes with every request of the app, not only those under the criterion's URL.
export const meta = {
  name: 'cookie',
  block: 'given',
  params: [
    { name: 'name', type: 'token' },
    { name: 'value', type: 'string' },
  ],
  describe: ({ name, value }) => `the browser has the cookie ${name}=${value}`,
};

/** @type {import('@fudic/terms').Term['run']} */
export async function run(ctx, { name, value }) {
  await ctx.page.context().addCookies([{ name: String(name), value: String(value), url: new URL('/', ctx.url).href }]);
  return { pass: true, evidence: `cookie ${name}=${value}` };
}
