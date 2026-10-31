/** What `routes/lento.fudapi` declares, implemented: the whole answer arrives after 2 s. */

import { load } from 'fudic:routes/lento';

/** Resolves after `ms` milliseconds, or stops waiting when the browser leaves. */
function wait(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener('abort', () => {
      clearTimeout(timer);
      reject(signal.reason);
    });
  });
}

load.handle(async (ctx) => {
  await wait(2000, ctx.signal);
  return { title: 'Dos segundos de espera', start: 5 };
});
