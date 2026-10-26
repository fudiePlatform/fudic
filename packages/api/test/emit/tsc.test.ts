/**
 * SDD-60 §3.11, §3.12 and criterion 11 (its second half) — the `.d.ts` of every file of the
 * project compile under strict `tsc` (`skipLibCheck: false`), and the handlers a developer
 * writes against them type: `ctx` from the declaration, the `adds` of each `use`, the validated
 * form without `null`. What must not type is checked with `@ts-expect-error`, so a type that
 * stopped biting fails the run too.
 */

import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { declarationsOf, project } from './_project.js';

const TSC = fileURLToPath(new URL('../../../../node_modules/typescript/bin/tsc', import.meta.url));
/** Inside the package's `node_modules`, so `@fudic/http/contract` resolves as it does for an app. */
const DIR = fileURLToPath(new URL(`../../node_modules/.fudic-emit/tsc-${String(process.pid)}/`, import.meta.url));

const TSCONFIG = {
  compilerOptions: {
    target: 'ES2024',
    module: 'ESNext',
    moduleResolution: 'bundler',
    lib: ['ES2024', 'DOM', 'DOM.Iterable'],
    strict: true,
    noUncheckedIndexedAccess: true,
    exactOptionalPropertyTypes: true,
    isolatedModules: true,
    verbatimModuleSyntax: true,
    skipLibCheck: false,
    noEmit: true,
  },
  include: ['src/**/*.ts', '.fudic/api/**/*.d.ts'],
};

/** What a developer writes in `src/server` and `src/browser`, and calls from a view. */
const HANDLERS = `
import { load, search, save, type SearchHandler, type Person, type LoadData } from 'fudic:routes/usuarios';
import { save as register, SaveFails, userForm, type SaveHandler, type UserFormValue } from 'fudic:components/user-form';
import { save as savePost, move, drop, load as loadPost, layout, paths, type Post, type Variant } from 'fudic:routes/blog/[slug]';
import { auth, AuthFails, log, type AuthServer } from 'fudic:middlewares/auth';
import { nif, between, emailLoose, type NifCheck } from 'fudic:rules/forms';
import { person, type PersonValue } from 'fudic:forms/person';
import { required, pattern } from 'fudic:@fudic/forms/rules';
import { csrf, errorPages } from 'fudic:@fudic/http/middlewares';

export const buscar = ((ctx) => [{ id: 1, name: ctx.args.q }]) satisfies SearchHandler;
search.handle(buscar);
load.handle(() => ({ users: [] as Person[] }) satisfies LoadData);
save.handle((ctx) => {
  const user: string = ctx.user;
  const id: number = ctx.args.id;
  const active: boolean = ctx.args.active;
  void [user, id, active];
});

export const alta = ((ctx) => {
  const value: UserFormValue = ctx.form.$value();
  if (value.name === 'admin') throw SaveFails.reserved();
  return { id: 1, name: value.acceso.clave.length > 0 ? value.name : '' };
}) satisfies SaveHandler;
register.handle(alta);

const post: Post = { slug: 's', title: 't', tags: [], variant: 'highlight' satisfies Variant, scores: { a: 1 }, byYear: { 2026: ['x'] } };
savePost.handle((ctx) => {
  const slug: string = ctx.params.slug;
  const id: number = ctx.params.id;
  const notify: boolean = ctx.query.notify;
  const user: string = ctx.user;
  void [slug, id, notify, user, ctx.args.active];
  return post;
});
move.handle((ctx) => {
  const value: PersonValue = ctx.form.$value();
  const age: number = value.age;
  const id: string = ctx.params.id;
  const line: number = ctx.params.line;
  const at: Date | undefined = ctx.query.at;
  void [age, id, line, at];
});
drop.handle(() => undefined);
loadPost.handle((ctx) => ({ post: { ...post, slug: ctx.params.slug } }));
layout.handle((_ctx, data) => ({ title: data.post.title }));
paths.handle(() => ['mi-post']);

export const server: AuthServer = (ctx, next) => {
  if (!ctx.headers.has('cookie')) throw AuthFails.noSession();
  return next(Object.assign(ctx, { user: 'ana' }));
};
auth.server(server);
auth.client((ctx, next, params) => {
  const realm: string | undefined = params.realm;
  void realm;
  return next(ctx);
});
log.client((ctx, next) => next(ctx));
csrf.client((ctx, next) => next(ctx));
errorPages.client((ctx, next, params) => {
  const to: string | undefined = params.routes[403];
  void to;
  return next(ctx);
});

export const letra = ((value) => (value.length === 9 ? true : 'nif-letter')) satisfies NifCheck;
nif.check(letra);
between.check((value, { low, high }) => typeof value === 'number' && value >= low && value <= high);
required.check((value) => value !== '' && value !== null);
pattern.check((value, { regex }) => regex.test(value));
export const re: RegExp = emailLoose;

export async function calls(): Promise<void> {
  const found: readonly Person[] = await search({ q: 'ana' });
  await save({ id: 1, active: true });
  const saved: Post = await savePost({ id: 42, notify: true, active: false });
  await move({ id: 'a', line: 1, at: new Date(), form: person });
  await move({ id: 'a', line: 1, form: person });
  await drop();
  const created = await register(userForm);
  void [found, saved, created.id];
}

// @ts-expect-error search returns people, not text
search.handle(() => 'nope');
// @ts-expect-error a handler reads only what its uses add
drop.handle((ctx) => ctx.user);
// @ts-expect-error nif fails with the codes it declares, no other
nif.check(() => 'other-code');
// @ts-expect-error the route argument of save is a number
void savePost({ id: '42', notify: true, active: false });
// @ts-expect-error a function with a form and route arguments takes the form beside them
void move(person);
// @ts-expect-error a middleware without a server half has no .server
csrf.server ?? errorPages.server((ctx, next) => next(ctx));
// @ts-expect-error a required number of a validated form is never null
move.handle((ctx) => { const age: null = ctx.form.$value().age; void age; });
`;

describe('criterion 11: the .d.ts compile with strict tsc', () => {
  it('every file of the project, and the handlers written against them', () => {
    const p = project();
    mkdirSync(join(DIR, 'src', 'server'), { recursive: true });
    writeFileSync(join(DIR, 'tsconfig.json'), JSON.stringify(TSCONFIG));
    for (const id of Object.keys(p.sources)) {
      const file = join(DIR, '.fudic', 'api', `${id}.d.ts`);
      mkdirSync(join(file, '..'), { recursive: true });
      writeFileSync(file, declarationsOf(p, id));
    }
    writeFileSync(join(DIR, 'src', 'server', 'handlers.ts'), HANDLERS);

    let output = '';
    try {
      execFileSync(process.execPath, [TSC, '-p', DIR], { encoding: 'utf8' });
    } catch (e) {
      output = String((e as { stdout?: string }).stdout ?? e);
    }
    expect(output).toBe('');
  }, 120_000);
});
