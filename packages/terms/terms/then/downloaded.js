// The last `when` downloaded a file with this name.
export const meta = {
  name: 'downloaded',
  block: 'then',
  params: [{ name: 'name', type: 'string' }],
  describe: ({ name }) => `${name} was downloaded`,
};

/** @type {import('@fudic/terms').Term['run']} */
export async function run(ctx, { name }) {
  const { downloads } = ctx.lastWhen();
  return {
    pass: downloads.includes(String(name)),
    evidence: { expected: `downloaded ${name}`, actual: downloads.length === 0 ? 'nothing downloaded' : `downloaded ${downloads.join(', ')}` },
  };
}
