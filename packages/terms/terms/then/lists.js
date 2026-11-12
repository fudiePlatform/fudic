// The page's real `paths()` lists this value, written as `path <value>` writes it.
export const meta = {
  name: 'lists',
  block: 'then',
  params: [{ name: 'value', type: 'string' }],
  describe: ({ value }) => `paths() lists ${value}`,
};

/** @type {import('@fudic/terms').Term['run']} */
export async function run(ctx, { value }) {
  const listed = await ctx.paths();
  const expected = `lists ${value}`;
  if (listed === null) return { pass: false, evidence: { expected, actual: 'the page has no paths()' } };
  return { pass: listed.includes(String(value)), evidence: { expected, actual: listed.length === 0 ? 'lists nothing' : `lists ${listed.join(', ')}` } };
}
