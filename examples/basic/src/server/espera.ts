/** What `routes/espera.fudapi` declares, implemented: three fields that take their time. */

import { notFound } from '@fudic/http';
import { load } from 'fudic:routes/espera';

/** A value that arrives after `ms` milliseconds, or stops waiting when the browser leaves. */
function after<T>(ms: number, value: T, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => resolve(value), ms);
    signal.addEventListener('abort', () => {
      clearTimeout(timer);
      reject(signal.reason);
    });
  });
}

// The three promises start together, here: the page paints them in order, not one after another.
load.handle((ctx) => ({
  title: 'Lo que tarda, llega después',
  inicio: after(2000, 10, ctx.signal),
  resumen: after(5000, { personas: 12, activas: 9 }, ctx.signal),
  roto: after(3000, null, ctx.signal).then(() => {
    throw notFound('el servicio de avisos no responde');
  }),
}));
