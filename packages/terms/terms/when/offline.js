// The network goes: what the Service Worker serves from its cache still opens, the rest fails as
// it fails in a browser. A worker still installing is waited for first: cutting it halfway would
// say nothing of the app.
export const meta = {
  name: 'offline',
  block: 'when',
  params: [],
  describe: () => 'the network goes',
};

// Runs in the page, so it travels as source text: once the page's worker, if any, is active and
// controls the page.
const WORKER = new Function(
  `return navigator.serviceWorker.getRegistration().then(async (registration) => {
    if (registration === undefined) return false;
    await navigator.serviceWorker.ready;
    if (navigator.serviceWorker.controller === null) {
      await new Promise((resolve) => navigator.serviceWorker.addEventListener('controllerchange', resolve, { once: true }));
    }
    return true;
  });`,
);

/** @type {import('@fudic/terms').Term['run']} */
export async function run(ctx) {
  const worker = await ctx.page.evaluate(WORKER);
  await ctx.page.context().setOffline(true);
  return { pass: true, evidence: worker ? 'the network went; the Service Worker stays' : 'the network went' };
}
