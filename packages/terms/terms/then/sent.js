// In the last call of the function, an argument had this value. The field is a path with dots
// (`user`, `docs.0`); a file is its name; anything that is not text is written as JSON.
export const meta = {
  name: 'sent',
  block: 'then',
  params: [
    { name: 'fn', type: 'token' },
    { name: 'field', type: 'token' },
    { name: 'expected', type: 'string' },
  ],
  describe: ({ fn, field, expected }) => `${fn} was sent ${field} = "${expected}"`,
};

/** What a field of an argument reads as: text as it is, anything else as JSON. */
const asText = (value) => (typeof value === 'string' ? value : JSON.stringify(value));

/** @type {import('@fudic/terms').Term['run']} */
export async function run(ctx, { fn, field, expected }) {
  const wanted = `"${expected}"`;
  const call = ctx.calls().findLast((one) => one.name === String(fn));
  if (call === undefined) return { pass: false, evidence: { expected: wanted, actual: `${fn} was never called` } };
  let value = call.args;
  for (const key of String(field).split('.')) value = value === null || typeof value !== 'object' ? undefined : value[key];
  if (value === undefined) return { pass: false, evidence: { expected: wanted, actual: `no ${field}` } };
  const actual = asText(value);
  return { pass: actual === String(expected), evidence: { expected: wanted, actual: `"${actual}"` } };
}
