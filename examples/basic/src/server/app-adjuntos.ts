/** What `components/app-adjuntos.fudapi` declares, implemented: it counts what arrived. */

import { adjuntar } from 'fudic:components/app-adjuntos';

adjuntar.handle((ctx) => {
  const { docs } = ctx.form.$value();
  return {
    count: docs.length,
    bytes: docs.reduce((sum, doc) => sum + doc.size, 0),
    names: docs.map((doc) => doc.name),
  };
});
