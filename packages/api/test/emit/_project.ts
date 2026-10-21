/**
 * The project the emitter tests run on: the canonicals of SDD §1, §3.5, §3.6 and §3.10, the
 * three forms of `examples/basic` written as `.fudapi`, and a route sibling with a function
 * whose arguments travel in the route, the query and the body (criterion 36).
 */

import { createApiIndex, emitDeclarations, emitModule, type ApiContext, type ApiIndex, type ApiSource, type Side } from '../../src/index.js';
import { HTTP, USUARIOS, USER_FORM } from '../helpers.js';
import { app, BUILT_INS } from '../project.js';

/** The middleware of SDD §3.3: `use auth` adds the user to `ctx`. */
export const AUTH = [
  '# Who is calling: the session cookie, read on arrival.',
  'middleware auth',
  '  client',
  '  server',
  '  realm  str?',
  '  adds',
  '    user  str',
  '  fails no-session 401 "Sign in first."',
  '',
  'middleware log',
  '  client',
  '  server',
  '',
].join('\n');

/** The rules and patterns the forms of `examples/basic` name. */
export const RULES = [
  'rule email-taken',
  '  on field str',
  '  runs server',
  '  async',
  '  fails email-taken',
  '',
  'rule alias-taken',
  '  on field str',
  '  runs server',
  '  async',
  '  fails alias-taken',
  '',
  '# A Spanish NIF.',
  'rule nif',
  '  on field str',
  '  runs both',
  '  fails nif-format',
  '  fails nif-letter',
  '',
  'rule between',
  '  on field u8 i32 date',
  '  runs both',
  '  low   i32',
  '  high  i32',
  '  fails out-of-range low high',
  '',
  'pattern email-loose  [^@\\s]+@[^@\\s]+\\.[^@\\s]+',
  'pattern web-url      https?://.+',
  '',
].join('\n');

/** `person.form.ts` of `examples/basic`, as a `.fudapi`. */
export const PERSON = [
  '# The form of /usuarios.',
  'form person',
  '  catches 400 409 422',
  '  name  str = ""',
  '    required  "Escribe el nombre."',
  '  email  str = ""',
  '    required             "Escribe el email."',
  '    pattern email-loose  "Ese email no parece válido."',
  '    email-taken          "Ese email ya lo usa otra persona."',
  '  age  u8',
  '    required  "Escribe la edad."',
  '    min 18    "Tiene que tener al menos {n} años."',
  '    max 120   "Como mucho {n} años."',
  '  active  bool = true',
  '  notes  str = ""',
  '',
].join('\n');

/** `wide.form.ts` of `examples/basic`, as a `.fudapi`. */
export const WIDE = [
  'form wideForm',
  '  a1  str = ""',
  '    required  "El campo 1 es obligatorio."',
  '  a2  str = ""',
  '    min-length 2  "El campo 2 necesita al menos {n} caracteres."',
  ...Array.from({ length: 10 }, (_, i) => `  a${String(i + 3)}  str = ""`),
  '',
].join('\n');

/** `userForm` (SDD §3.6) with a function that sends it, and `fails`. */
export const USER_FORM_FILE = [
  USER_FORM,
  '# Creates the person.',
  'put save',
  '  use auth',
  '  form userForm',
  '  fails reserved 409 "Ese nombre está reservado."',
  '  fails gone 410',
  '  -> Saved',
  '',
  'type Saved',
  '  id    i32',
  '  name  str',
  '',
].join('\n');

/** A route with a parameter: `save /:id` with route, query and body arguments (criterion 36). */
export const BLOG_SLUG = [
  'load ssg 5m cache-first',
  '  skip log',
  '  post  Post',
  '',
  'paths',
  '',
  'layout',
  '',
  'chain',
  '  use auth',
  '    realm  "blog"',
  '  compress deflate 500',
  '',
  'put save /:id',
  '  query notify  bool',
  '  active  bool',
  '  id      i32',
  '  invalidates /blog /blog/:slug',
  '  -> Post',
  '',
  'patch move /:id/lines/:line',
  '  skip *',
  '  compress off',
  '  id    uuid',
  '  line  u16',
  '  query at  date?',
  '  form  person',
  '',
  'delete drop',
  '  skip auth',
  '',
  'type Post',
  '  slug      str',
  '  title     str',
  '  tags      str[]',
  '  author    Author?',
  '  variant   Variant',
  '  scores    map str f64',
  '  byYear    map u16 str[]',
  '',
  'type Author',
  '  name  str',
  '  boss  Author?',
  '',
  'enum Variant',
  '  default',
  '  highlight',
  '',
].join('\n');

/** The project-wide texts (SDD §3.9). */
export const MESSAGES = ['messages', '  required  "Este campo es obligatorio."', '  min-length  "Al menos {n}."', ''].join('\n');

export interface Project {
  readonly index: ApiIndex;
  readonly sources: Readonly<Record<string, ApiSource>>;
  readonly ctx: Readonly<Record<string, ApiContext>>;
}

/** Every app file by its `<id>`, the built-ins first. */
export function project(extra: Readonly<Record<string, string>> = {}): Project {
  const files: Record<string, string> = {
    http: HTTP,
    'middlewares/auth': AUTH,
    'rules/forms': RULES,
    'routes/usuarios': USUARIOS,
    'routes/blog/[slug]': BLOG_SLUG,
    'components/user-form': USER_FORM_FILE,
    'forms/person': PERSON,
    'forms/wide': WIDE,
    'texts/messages': MESSAGES,
    ...extra,
  };
  const sources = Object.fromEntries(Object.entries(files).map(([id, text]) => [id, app(id, text)]));
  const index = createApiIndex([...BUILT_INS, ...Object.values(sources)]);
  for (const s of BUILT_INS) sources[s.id] = s;
  return {
    index,
    sources,
    ctx: {
      'routes/usuarios': { route: { params: [], pattern: '/usuarios' } },
      'routes/blog/[slug]': { route: { params: ['slug'], pattern: '/blog/:slug', layoutProps: '{ readonly title: string }' } },
    },
  };
}

/** The `.d.ts` of `id`. */
export const declarationsOf = (p: Project, id: string): string => emitDeclarations(p.sources[id]!, p.index, p.ctx[id] ?? {});

/** The module of `id`, one side. */
export const moduleOf = (p: Project, id: string, side: Side): string => emitModule(p.sources[id]!, p.index, p.ctx[id] ?? {}, side);
