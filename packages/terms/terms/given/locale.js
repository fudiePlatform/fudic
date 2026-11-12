// The page in this language: the browser asks for it (`Accept-Language`) and says it speaks it
// (`navigator.language`).
export const meta = {
  name: 'locale',
  block: 'given',
  params: [{ name: 'tag', type: 'token' }],
  describe: ({ tag }) => `the browser speaks ${tag}`,
};

// Runs in the page, before its own scripts, so it travels as source text.
const SPEAKS = (tag) => `(() => {
  const tag = ${JSON.stringify(tag)};
  Object.defineProperty(Navigator.prototype, 'language', { get: () => tag, configurable: true });
  Object.defineProperty(Navigator.prototype, 'languages', { get: () => [tag], configurable: true });
})();`;

/** @type {import('@fudic/terms').Term['run']} */
export async function run(ctx, { tag }) {
  const language = String(tag);
  await ctx.page.setExtraHTTPHeaders({ 'accept-language': language });
  await ctx.page.addInitScript(SPEAKS(language));
  return { pass: true, evidence: `speaks ${language}` };
}
