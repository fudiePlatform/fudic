import { attach } from 'fudic:routes/index';

attach.handle((ctx) => {
  const { docs } = ctx.form.$value();
  for (const doc of docs) console.log(`[attach] ${doc.name} · ${doc.size} bytes`);
});
