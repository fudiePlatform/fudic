// The page opens without network: a first visit with network installs the app's Service Worker
// and lets it keep the page, and then the network goes.
export const meta = {
  name: 'offline',
  block: 'given',
  params: [],
  describe: () => 'the browser has no network',
};

// Runs in the page, so it travels as source text: once the page's worker is active and controls
// the page, whether there is one.
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
  await ctx.page.goto(ctx.url, { waitUntil: 'commit' });
  await ctx.quiet();
  const worker = await ctx.page.evaluate(WORKER);
  // A navigation the worker sees is what it keeps: once more, now that it controls the page.
  if (worker) {
    await ctx.page.reload({ waitUntil: 'commit' });
    await ctx.quiet();
  }
  await ctx.page.context().setOffline(true);
  return { pass: true, evidence: worker ? 'without network, with the Service Worker installed' : 'without network; the page has no Service Worker' };
}
