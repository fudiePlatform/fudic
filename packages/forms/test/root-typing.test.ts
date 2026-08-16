/**
 * SDD-33 §6.21 — a rule that looks at another field declares the `root` it
 * expects, and writes no cast anywhere.
 *
 * THE TEST IS THAT THIS FILE COMPILES. `pnpm typecheck` covers `test/` as well as
 * `src/`, so a rule that stopped being accepted in a validator list — or a
 * `root.field()` that stopped resolving — fails the build, which is precisely what
 * a dynamic test cannot see. The `expect`s below are the other half: they show
 * that the rule the compiler accepted is also the rule that runs.
 *
 * The three forms live in ONE schema on purpose, because that is where they live
 * in real code: a rule with a typed root, a rule that never names one, and a
 * `serverValidator`.
 */

import { describe, expect, it, vi } from 'vitest';
import { control } from '../src/control.js';
import { form } from '../src/form.js';
import { group } from '../src/group.js';
import { required } from '../src/validators/required.js';
import { serverValidator } from '../src/validators/server.js';
import { validator } from '../src/validators/validator.js';
import type { Control, Errors, Form } from '../src/types.js';

/** What the rule needs to see. A structural shape: it names the field, not the form. */
type Post = { published: Control<boolean> };

/**
 * The rule of the SDD, character for character: parameters annotated by the
 * author, no `Validator<…>` annotation on the const, and no `as` in sight.
 */
const requiredIfPublished = (v: string, root: Post) =>
  root.published() && v.trim() === '' ? { requiredIfPublished: true } : null;

/** The other flavour of a named root: the form type, which also brings the `$` API. */
type PostForm = Form<{ published: Control<boolean>; body: Control<string> }>;

const bodyNeedsTitleFirst = (v: string, root: PostForm): Errors | null =>
  root.$fields().includes('body') && root.published() && v === '' ? { needsBody: true } : null;

/** The default case, and the common one: a rule that never looks at a sibling. */
const notBlank = validator<string>((v) => (v.trim() === '' ? { required: true } : null));

const remote = vi.fn(async (v: string) => (v === 'taken' ? { taken: true } : null));
/** The third form: only runs with `{ server: true }`, and sits in the same list. */
const slugFree = serverValidator<string>(remote);

const schema = {
  published: control(false),
  body: control('', [requiredIfPublished, bodyNeedsTitleFirst]),
  slug: control('', [required, notBlank, slugFree]),
  seo: group({
    // A rule inside a group receives the ROOT form, so its root type is the root's.
    description: control('', [requiredIfPublished]),
  }),
};

/**
 * A rename is a BUILD failure now, not a request that blows up in production. The
 * `@ts-expect-error` is what asserts it: remove the typo and this file stops
 * compiling, which is the assertion running backwards.
 */
const afterARename = (root: Post): boolean =>
  // @ts-expect-error — the field is `published`; a rule that misses it cannot compile.
  root.publised();

/**
 * And the hole did not become permissive on the way: only the ROOT is open. A rule
 * about the wrong VALUE is still rejected, which is what says `never` is doing its
 * job and `any` is not doing it for us.
 */
const wrongValue = control('', [
  // @ts-expect-error — a rule about numbers cannot guard a control that holds a string.
  (v: number) => (v > 0 ? null : { min: 0 }),
]);

describe('a validator declares the root it looks at (§6.21)', () => {
  it('runs the typed rule against the sibling it named', async () => {
    const f = form(schema);
    f.$patch({ published: true, slug: 'ok' });

    expect(await f.$validate()).toBe(false);
    expect(f.body.errors()).toEqual({ requiredIfPublished: true });
    expect(f.seo.description.errors()).toEqual({ requiredIfPublished: true });
  });

  it('leaves the field alone when the sibling says so', async () => {
    const f = form(schema);
    f.$patch({ published: false, slug: 'ok' });

    expect(await f.$validate()).toBe(true);
    expect(f.$errors()).toBeNull();
  });

  it('reaches the $ API through a root typed as the form', async () => {
    const f = form(schema);
    f.$patch({ published: true, slug: 'ok', body: 'x', seo: { description: 'd' } });

    // `requiredIfPublished` passes, so the second rule of the field is the one
    // that decides — and it read `$fields()` off the very same root.
    expect(await f.$validate()).toBe(true);

    f.$patch({ body: ' ' });
    expect(await f.$validate()).toBe(false);
    expect(f.body.errors()).toEqual({ requiredIfPublished: true });
  });

  it('lets the three forms of rule share one list', async () => {
    const f = form(schema);
    f.$patch({ slug: 'taken' });

    // The server-only rule does not run here; the other two pass.
    expect(await f.$validate()).toBe(true);
    expect(remote).not.toHaveBeenCalled();

    expect(await f.$validate({ server: true })).toBe(false);
    expect(f.slug.errors()).toEqual({ taken: true });

    // And the shipped rule still cuts first: an empty slug never reaches the server.
    f.$patch({ slug: '' });
    expect(await f.$validate({ server: true })).toBe(false);
    expect(f.slug.errors()).toEqual({ required: true });
    expect(remote).toHaveBeenCalledTimes(1);
  });

  it('opens the root and nothing else', () => {
    // Both exist only so the `@ts-expect-error`s above have something to sit on.
    // Calling `afterARename` would throw — that is the runtime failure the type
    // now prevents — and `wrongValue` is a control like any other.
    expect(typeof afterARename).toBe('function');
    expect(wrongValue()).toBe('');
  });
});
