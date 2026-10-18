// The element is at least this wide: a touch target, a column that must not collapse.
export const meta = {
  name: 'min-width',
  block: 'then',
  params: [
    { name: 'target', type: 'element' },
    { name: 'px', type: 'number' },
  ],
  describe: ({ target, px }) => `${target} is at least ${px}px wide`,
};

/** @type {import('@fudic/terms').Term['run']} */
export async function run(ctx, { target, px }) {
  const element = ctx.locate(String(target));
  // An element that is not there has no size: a fail, not a wait.
  if ((await element.count()) === 0) return { pass: false, evidence: 'not there' };
  const box = await element.boundingBox();
  if (box === null) return { pass: false, evidence: 'not rendered' };
  return { pass: box.width >= Number(px), evidence: `${box.width}px` };
}
