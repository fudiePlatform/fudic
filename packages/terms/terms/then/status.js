// The last document the browser opened answered with this status: a page, an `_error.fud` with
// its code, or what the Service Worker served.
export const meta = {
  name: 'status',
  block: 'then',
  params: [{ name: 'code', type: 'number' }],
  describe: ({ code }) => `the page answered ${code}`,
};

/** @type {import('@fudic/terms').Term['run']} */
export async function run(ctx, { code }) {
  const response = ctx.response();
  const actual = response === null ? 'no response' : String(response.status);
  return { pass: actual === String(code), evidence: { expected: String(code), actual } };
}
