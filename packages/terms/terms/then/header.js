// A header of the last document the browser opened has exactly this value.
export const meta = {
  name: 'header',
  block: 'then',
  params: [
    { name: 'name', type: 'token' },
    { name: 'expected', type: 'string' },
  ],
  describe: ({ name, expected }) => `the page answered ${name}: ${expected}`,
};

/** @type {import('@fudic/terms').Term['run']} */
export async function run(ctx, { name, expected }) {
  const header = String(name).toLowerCase();
  const wanted = `${header}: ${expected}`;
  const response = ctx.response();
  if (response === null) return { pass: false, evidence: { expected: wanted, actual: 'no response' } };
  const actual = response.headers[header];
  return { pass: actual === String(expected), evidence: { expected: wanted, actual: actual === undefined ? `no ${header}` : `${header}: ${actual}` } };
}
