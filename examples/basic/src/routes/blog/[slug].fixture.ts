// What the specs of `[slug].fudspec` put in place of `load` and `paths`. The `layout` of the
// route runs for real with this data: its `<html lang>` comes out of `lang`.
import type { Fixtures } from 'fudic:routes/blog/[slug]';

export default {
  paths: ['declarative-shadow-dom', 'file-system-routing'],
  data: {
    'en-ingles': {
      title: 'DSD in depth',
      tag: 'platform',
      body: 'A shadow root built by the parser, with no script.',
      found: true,
      lang: 'en',
    },
    'no-existe': {
      title: 'Artículo no encontrado',
      tag: '404',
      body: 'No hay ningún artículo con ese slug.',
      found: false,
      lang: 'es',
    },
  },
} satisfies Fixtures;
