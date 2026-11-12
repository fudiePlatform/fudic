// Writes a URL in the browser's address bar: relative to the page it is on. It returns once the
// document answers: the workbench waits for the quiet page after every `when`, and a document
// that waits on the criterion's clock never loads on its own (SDD-82 §4.6). A page the browser
// cannot open (no network) is what the person sees too: the step says so, and the `then` reads it.
export const meta = {
  name: 'go',
  block: 'when',
  params: [{ name: 'url', type: 'string' }],
  describe: ({ url }) => `the user goes to ${url}`,
};

/** What a navigation that got no response throws: the browser's own `net::` error. */
const NO_RESPONSE = /net::ERR_[A-Z_]+/u;

/** @type {import('@fudic/terms').Term['run']} */
export async function run(ctx, { url }) {
  const here = ctx.page.url();
  const to = new URL(String(url), here.startsWith('http') ? here : ctx.url).href;
  try {
    // Null for a move inside the same document (`#part`): no document answered.
    const response = await ctx.page.goto(to, { waitUntil: 'commit' });
    return { pass: true, evidence: `went to ${url}: ${response?.status() ?? 'the same document'}` };
  } catch (error) {
    const failed = NO_RESPONSE.exec(String(error));
    if (failed === null) throw error;
    return { pass: true, evidence: `the browser could not open ${url}: ${failed[0]}` };
  }
}
