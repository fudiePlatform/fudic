/**
 * The blog form of the prototype (`docs/forms/blog.form.js`), ported to the real
 * package API: the shipped validators, a server-only rule, and a form-level rule.
 *
 * This is the file both ends would import. It is declared at module scope because
 * `form()` clones it, so the server can instantiate one per request from the very
 * same object the browser bundles.
 */

import { control } from '../../src/control.js';
import { form } from '../../src/form.js';
import { group } from '../../src/group.js';
import { maxLength } from '../../src/validators/max-length.js';
import { minLength } from '../../src/validators/min-length.js';
import { pattern } from '../../src/validators/pattern.js';
import { required } from '../../src/validators/required.js';
import { serverValidator } from '../../src/validators/server.js';
import type { Control, Errors, Form, Validator } from '../../src/types.js';

/** Only the server knows which slugs are taken; the client never runs this. */
export const slugAvailable = serverValidator<string>(async (v) => {
  await new Promise((resolve) => setTimeout(resolve, 1));
  return v.trim().toLowerCase() === 'ocupado' ? { taken: true } : null;
});

/**
 * A cross-field rule that has to publish ON a field. It reaches the sibling
 * through the root, and the cast is the API's rough edge today: `root` is the
 * untyped `$` surface, so a rule cannot see the sibling's type from here.
 */
export const requiredIfPublished: Validator<string> = (v, root) => {
  const published = (root as unknown as { published: Control<boolean> }).published;
  return published() && v.trim() === '' ? { requiredIfPublished: true } : null;
};

export const blogSchema = {
  title: control('', [required, minLength(3), maxLength(120), slugAvailable]),
  body: control('', [requiredIfPublished]),
  published: control(false),
  seo: group({
    description: control('', [maxLength(160)]),
    canonical: control('', [pattern(/^https:\/\//)]),
  }),
  tags: control<readonly string[]>([]),
};

/** A published post needs a description: nobody's field, so it is the summary. */
const seoSummary = (root: Form<typeof blogSchema>): Errors | null =>
  root.published() && root.seo.description() === ''
    ? { seoRequired: 'A published post needs an SEO description' }
    : null;

export const blogForm = (): Form<typeof blogSchema> => form(blogSchema, { summary: seoSummary });

/** What the server would hand back for an existing post. */
export const stored = {
  title: 'Arquitectura de Fudic',
  body: 'El compilador emite HTML con shadow DOM declarativo.',
  published: true,
  seo: {
    description: 'Cómo está construido el compilador de fudic',
    canonical: 'https://fudie.eu/blog/arquitectura-de-fudic',
  },
  tags: ['web', 'compilador'] as readonly string[],
};
