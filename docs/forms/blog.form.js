// slices/blog/blog.form.js
//
// ESTE fichero es el contrato. Lo importan los dos extremos. El orden de los
// campos del array posicional es el orden de declaración de este objeto:
// no sale del AST, sale de Object.keys(schema) en tiempo de ejecución.

import { form, control, group, required, minLength, maxLength, validator }
  from './forms.js';

const slugAvailable = validator.server(async (v) => {
  await new Promise((r) => setTimeout(r, 5));
  return v.trim().toLowerCase() === 'ocupado' ? { taken: true } : null;
});

export const schema = {
  title: control('', [required, minLength(3), maxLength(120), slugAvailable]),
  body: control(''),
  published: control(false),
  seo: group({
    description: control('', [maxLength(160)]),
    canonical: control(''),
  }),
  tags: control([]),
};

export const postForm = () => form(schema, {
  validate: {
    body: (v, ctx) =>
      ctx.published.value && v.trim().length === 0 ? { requiredIfPublished: true } : null,
    'seo.canonical': (v) =>
      v !== '' && !v.startsWith('https://') ? { protocolo: true } : null,
  },
  summary: (ctx) =>
    ctx.published.value && ctx.seo.description.value.length === 0
      ? { seoRequerido: 'Un post publicado necesita descripción SEO' }
      : null,
});
