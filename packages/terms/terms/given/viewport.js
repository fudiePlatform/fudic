// The size of the browser's window, in CSS pixels.
export const meta = {
  name: 'viewport',
  block: 'given',
  params: [
    { name: 'width', type: 'number' },
    { name: 'height', type: 'number' },
  ],
  describe: ({ width, height }) => `the window is ${width}×${height}`,
};

/** @type {import('@fudic/terms').Term['run']} */
export async function run(ctx, { width, height }) {
  await ctx.page.setViewportSize({ width: Number(width), height: Number(height) });
  return { pass: true, evidence: `${width}×${height}` };
}
