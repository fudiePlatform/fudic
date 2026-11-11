// The page under a media feature: `prefers-color-scheme dark`, `prefers-reduced-motion reduce`,
// `forced-colors active`, `prefers-contrast more`.
export const meta = {
  name: 'media',
  block: 'given',
  params: [
    { name: 'feature', type: 'token' },
    { name: 'value', type: 'token' },
  ],
  describe: ({ feature, value }) => `the page has ${feature}: ${value}`,
};

/** Each feature, by the option Playwright emulates it with, and the values it takes. */
const FEATURES = {
  'prefers-color-scheme': ['colorScheme', ['light', 'dark', 'no-preference']],
  'prefers-reduced-motion': ['reducedMotion', ['reduce', 'no-preference']],
  'forced-colors': ['forcedColors', ['active', 'none']],
  'prefers-contrast': ['contrast', ['more', 'no-preference']],
};

/** @type {import('@fudic/terms').Term['run']} */
export async function run(ctx, { feature, value }) {
  const known = FEATURES[String(feature)];
  if (known === undefined) {
    throw new Error(`media knows ${Object.keys(FEATURES).join(', ')}; not ${feature}`);
  }
  const [option, values] = known;
  if (!values.includes(String(value))) throw new Error(`${feature} takes ${values.join(', ')}; not ${value}`);
  await ctx.page.emulateMedia({ [option]: String(value) });
  return { pass: true, evidence: `${feature}: ${value}` };
}
