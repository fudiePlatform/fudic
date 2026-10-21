import type { SourceDiagnostic, Span } from '@fudic/diagnostics';
import { parseApi } from '../src/index.js';

/** The route contract of SDD §1. */
export const USUARIOS = [
  '# Per request: the list changes with every new person.',
  'load ssr',
  '  users  Person[]',
  '',
  'get search',
  '  q  str',
  '  -> Person[]',
  '',
  'put save',
  '  use auth',
  '  id      i32',
  '  active  bool',
  '',
  'type Person',
  '  id      i32',
  '  name    str',
  '',
].join('\n');

/** The global chain of SDD §3.5. */
export const HTTP = [
  'chain',
  '  use log csrf',
  '  use error-pages',
  '    routes  403 /entrar',
  '  compress gzip 200',
  '',
].join('\n');

/** `userForm` of SDD §3.6, whole. */
export const USER_FORM = [
  'form userForm',
  '  validate-on blur input',
  '  validity interacted',
  '',
  '  name  str = ""',
  '    required              "Escribe tu nombre."',
  '  alias  str = ""',
  '    required              "Elige un alias."',
  '    min-length 3          "El alias necesita al menos {n} caracteres."',
  '    alias-taken           "Ese alias ya está cogido."',
  '  email  str = ""',
  '    required              "Escribe tu email."',
  '    pattern email-loose   "Ese email no parece válido."',
  '  web  str = ""',
  '    pattern web-url       "La web empieza por http:// o https://."',
  '  acceso  group',
  '    clave  str = ""',
  '      required            "Elige una contraseña."',
  '      min-length 8        "Mínimo {n} caracteres."',
  '    repetir  str = ""',
  '      required            "Repite la contraseña."',
  '    summary',
  '      require mismatch  clave == repetir                  "Las contraseñas no coinciden."',
  '',
  '  summary',
  '    require same-as-name  empty alias or alias != name    "El alias no puede ser tu nombre."',
  '    require key-has-name  empty name or not acceso.clave contains name',
  '                          "La contraseña no puede contener tu nombre."',
  '',
].join('\n');

/** `@fudic/forms` `fudapi/rules.fudapi` (SDD §3.10). */
export const FORMS_RULES = [
  '# The value is not empty.',
  'rule required',
  '  on field str bool u8 i8 u16 i16 u32 i32 f32 f64 date uuid str[]',
  '  runs both',
  '  fails required',
  '',
  '# A number no smaller than `min`.',
  'rule min',
  '  on field u8 i8 u16 i16 u32 i32 f32 f64',
  '  runs both',
  '  min  f64',
  '  fails min min',
  '',
  '# A number no bigger than `max`.',
  'rule max',
  '  on field u8 i8 u16 i16 u32 i32 f32 f64',
  '  runs both',
  '  max  f64',
  '  fails max max',
  '',
  '# A text or a list with `min` items at least.',
  'rule min-length',
  '  on field str str[]',
  '  runs both',
  '  min  u32',
  '  fails min-length min',
  '',
  '# A text or a list with `max` items at most.',
  'rule max-length',
  '  on field str str[]',
  '  runs both',
  '  max  u32',
  '  fails max-length max',
  '',
  '# The whole text matches a pattern.',
  'rule pattern',
  '  on field str',
  '  runs both',
  '  regex  str',
  '  fails pattern',
  '',
].join('\n');

/** `@fudic/forms` `fudapi/patterns.fudapi`: the email of WHATWG, `#` included (SDD §3.10). */
export const FORMS_PATTERNS = [
  '# The address `input type=email` accepts (WHATWG).',
  "pattern email  [a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*",
  '',
].join('\n');

/** `@fudic/http` `fudapi/middlewares.fudapi` (SDD §3.10). */
export const HTTP_MIDDLEWARES = [
  '# A token on every unsafe call, checked on arrival.',
  'middleware csrf',
  '  client',
  '  server',
  '  fails csrf 403 "Missing or invalid CSRF token."',
  '',
  '# Sends the browser to a page by the status of a failed call.',
  'middleware error-pages',
  '  client',
  '  routes  map u16 str',
  '',
].join('\n');

/** Every canonical file of criterion 1, by name. */
export const CANONICALS: Readonly<Record<string, string>> = {
  usuarios: USUARIOS,
  http: HTTP,
  userForm: USER_FORM,
  formsRules: FORMS_RULES,
  formsPatterns: FORMS_PATTERNS,
  httpMiddlewares: HTTP_MIDDLEWARES,
};

export const slice = (source: string, s: Span): string => source.slice(s.start, s.end);

export const codes = (source: string): readonly string[] => parseApi(source).diagnostics.map((d) => d.code);

/** The only diagnostic of a source, which must have exactly one. */
export function only(source: string): SourceDiagnostic {
  const { diagnostics } = parseApi(source);
  if (diagnostics.length !== 1) {
    throw new Error(`expected one diagnostic, got ${diagnostics.map((d) => `${d.code} ${d.message}`).join('; ') || 'none'}`);
  }
  return diagnostics[0]!;
}

const isSpan = (v: unknown): v is Span =>
  v !== null &&
  typeof v === 'object' &&
  Object.keys(v).length === 2 &&
  typeof (v as Span).start === 'number' &&
  typeof (v as Span).end === 'number';

/** Every span in a value, with the path that leads to it. */
export function spansOf(value: unknown, path = '$'): readonly (readonly [string, Span])[] {
  if (isSpan(value)) return [[path, value]];
  if (Array.isArray(value)) return value.flatMap((v, i) => spansOf(v, `${path}[${i}]`));
  if (value !== null && typeof value === 'object') {
    return Object.entries(value).flatMap(([k, v]) => spansOf(v, `${path}.${k}`));
  }
  return [];
}

/** Every object of a tree that has a `span`, with its path. */
export function nodesOf(value: unknown, path = '$'): readonly (readonly [string, Record<string, unknown> & { span: Span }])[] {
  if (Array.isArray(value)) return value.flatMap((v, i) => nodesOf(v, `${path}[${i}]`));
  if (value === null || typeof value !== 'object' || isSpan(value)) return [];
  const record = value as Record<string, unknown>;
  const own = isSpan(record['span']) ? [[path, record as Record<string, unknown> & { span: Span }] as const] : [];
  return [...own, ...Object.entries(record).flatMap(([k, v]) => nodesOf(v, `${path}.${k}`))];
}

/** The tree with every span replaced by the text it covers: a readable snapshot that checks them too. */
export function view(value: unknown, source: string): unknown {
  if (isSpan(value)) return slice(source, value);
  if (Array.isArray(value)) return value.map((v) => view(v, source));
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, view(v, source)]));
  }
  return value;
}

/** The tree with every span dropped, to compare two parses whose offsets differ. */
export function shape(value: unknown): unknown {
  if (isSpan(value)) return null;
  if (Array.isArray(value)) return value.map(shape);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, shape(v)]));
  }
  return value;
}

/** Every canonical cut short at each offset, re-indented 0–8 line by line and with noise at each end. */
export function* inputs(): Generator<string> {
  const noise = ['"', '\t', '\r', '\\', '#', '"x', ' ', '=', '->', '(', ':', '/'];
  for (const fixture of Object.values(CANONICALS)) {
    for (let i = 0; i <= fixture.length; i++) yield fixture.slice(0, i);
    const lines = fixture.split('\n');
    for (const [n, line] of lines.entries()) {
      const bare = line.trimStart();
      const around = (l: string): string => [...lines.slice(0, n), l, ...lines.slice(n + 1)].join('\n');
      for (let spaces = 0; spaces <= 8; spaces++) yield around(' '.repeat(spaces) + bare);
      for (const extra of noise) {
        yield around(line + extra);
        yield around(extra + line);
      }
    }
  }
}
