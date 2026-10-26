import type { SourceDiagnostic } from '@fudic/diagnostics';
import {
  createApiIndex,
  parseApi,
  validateApi,
  type ApiContext,
  type ApiIndex,
  type ApiSource,
} from '../src/index.js';
import { FORMS_PATTERNS, FORMS_RULES, HTTP_MIDDLEWARES } from './helpers.js';

/** An app `.fudapi` by its `<id>`. */
export function app(id: string, text: string): ApiSource {
  return { id, path: `/app/src/${id}.fudapi`, file: parseApi(text).value, origin: 'app' };
}

/** A library `.fudapi` by its package and its path inside `fudapi/`. */
export function lib(pkg: string, path: string, text: string): ApiSource {
  return {
    id: `${pkg}/${path}`,
    path: `/app/node_modules/${pkg}/fudapi/${path}.fudapi`,
    file: parseApi(text).value,
    origin: { package: pkg },
  };
}

/** The built-ins of SDD §3.10, as their packages publish them. */
export const BUILT_INS: readonly ApiSource[] = [
  lib('@fudic/forms', 'rules', FORMS_RULES),
  lib('@fudic/forms', 'patterns', FORMS_PATTERNS),
  lib('@fudic/http', 'middlewares', HTTP_MIDDLEWARES),
];

export interface Checked {
  readonly source: ApiSource;
  readonly index: ApiIndex;
  readonly diagnostics: readonly SourceDiagnostic[];
}

/**
 * Validates `text` as the app file `id` in a project made of the built-ins, `others` and
 * itself. The parser must accept it: these tests are about the validator.
 */
export function check(
  text: string,
  { id = 'components/x', others = [], ctx = {} }: { id?: string; others?: readonly ApiSource[]; ctx?: ApiContext } = {},
): Checked {
  const parsed = parseApi(text);
  if (parsed.diagnostics.length > 0) {
    throw new Error(`the parser refused it: ${parsed.diagnostics.map((d) => d.message).join('; ')}`);
  }
  const source: ApiSource = { id, path: `/app/src/${id}.fudapi`, file: parsed.value, origin: 'app' };
  const index = createApiIndex([...BUILT_INS, ...others, source]);
  return { source, index, diagnostics: validateApi(source, index, ctx) };
}

export const codesOf = (text: string, options?: Parameters<typeof check>[1]): readonly string[] =>
  check(text, options).diagnostics.map((d) => d.code);

/** A route sibling with these page parameters. */
export const route = (...params: string[]): ApiContext => ({ route: { params } });
