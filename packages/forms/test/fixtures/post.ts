/**
 * The blog form of the prototype (`docs/forms/blog.form.js`), as a schema template.
 *
 * It is declared at module scope on purpose: `form()` clones its nodes, so the two
 * ends can import this same object and every call gets an independent instance.
 * Validators are written inline here — the ones that ship with the package land in
 * their own phase, and the model does not care where a rule comes from.
 */

import { control } from '../../src/control.js';
import { group } from '../../src/group.js';
import type { Validator } from '../../src/types.js';

export const notEmpty: Validator<string> = (v) => (v === '' ? { required: true } : null);

export const atLeast =
  (n: number): Validator<string> =>
  (v) =>
    v.length < n ? { minLength: n } : null;

export const postSchema = {
  title: control('', [notEmpty, atLeast(3)]),
  body: control(''),
  published: control(false),
  seo: group({
    description: control(''),
    canonical: control(''),
  }),
  tags: control<readonly string[]>([]),
};

export const filled = {
  title: 'Arquitectura de Fudic',
  body: 'Cuerpo del post.',
  published: true,
  seo: { description: 'Descripción SEO', canonical: 'https://fudie.eu/x' },
  tags: ['web', 'compilador'] as readonly string[],
};
