/**
 * The stubs of a file's server functions, in its client chunk (SDD-56 §4.5).
 *
 * One `const X = $fn({…})` per function — never one for `load`, which the browser asks for by
 * navigating — written at module scope, so the `@client` code and every event expression of
 * the template reach it by name. Its chain is the one the compiler read: the global level is
 * the `src/http.ts` both sides import, the file's and the function's own are written out as the
 * literal levels `$fn` folds, and each middleware the `@server` IMPORTS is imported here too.
 * One declared in the `@server` is server-only, and simply is not here.
 *
 * Nothing of `handle` is written, nor anything `handle` imports.
 */

import type { ServerFnOptions } from './module.js';
import type { ChainStep, CompressLiteral, MiddlewareRef, ServerFns } from './server-fns.js';

export interface FnStubs {
  /** Module-scope import lines. */
  readonly imports: readonly string[];
  /** Module-scope declarations, one per function. */
  readonly lines: readonly string[];
}

/** The names a `form:=` of this file may send to: its server functions, `load` aside. */
export function sendable(fns: ServerFns): ReadonlySet<string> {
  return new Set(fns.fns.flatMap((fn) => (fn.name === 'load' ? [] : [fn.name])));
}

/** The stubs of `fns`, or `null` when the file exposes none to the browser. */
export function fnStubs(fns: ServerFns, options: ServerFnOptions | undefined): FnStubs | null {
  const callable = fns.fns.filter((fn) => fn.name !== 'load');
  if (callable.length === 0 || options === undefined) return null;

  // Every imported middleware once, under a name of the compiler's own: the author may import
  // the same module in `@client` too, and two bindings of one name do not parse.
  const aliases = new Map<string, string>();
  const imports: string[] = [];
  const alias = (ref: MiddlewareRef): string | undefined => {
    if (ref.from === undefined) return undefined;
    const key = `${ref.from}\0${ref.imported}`;
    let name = aliases.get(key);
    if (name === undefined) {
      name = `$mw${aliases.size}`;
      aliases.set(key, name);
      imports.push(
        ref.imported === 'default'
          ? `import ${name} from ${JSON.stringify(ref.from)};`
          : `import { ${ref.imported} as ${name} } from ${JSON.stringify(ref.from)};`,
      );
    }
    return name;
  };
  const level = (steps: readonly ChainStep[], compress: CompressLiteral | undefined): string => {
    const written = steps.map((step) => {
      if (step.kind === 'skip-all') return `{ kind: 'skip-all' }`;
      const mws = step.refs.flatMap((ref) => alias(ref) ?? []);
      return `{ kind: '${step.kind}', mws: [${mws.join(', ')}] }`;
    });
    const compression = compress === undefined ? '' : `, compression: ${JSON.stringify(compress)}`;
    return `{ steps: [${written.join(', ')}]${compression} }`;
  };

  const forms = callable.some((fn) => fn.form !== undefined);
  const head = [`import { $fn${forms ? ', FORM_STAGES' : ''} } from '@fudic/http/client';`];
  if (options.httpFile !== undefined) head.push(`import $global from ${JSON.stringify(options.httpFile)};`);

  const file = level(fns.file, fns.fileCompress);
  const lines = callable.map((fn) => {
    const chain = [...(options.httpFile !== undefined ? ['$global'] : []), file, level(fn.steps, fn.compress)];
    const fields = [
      `name: ${JSON.stringify(fn.name)}`,
      `method: '${fn.method}'`,
      `url: ${JSON.stringify(`${options.prefix}/${fn.name}`)}`,
      ...(options.page !== undefined ? [`page: ${JSON.stringify(options.page)}`] : []),
      'base: import.meta.env.BASE_URL',
      `chain: [${chain.join(', ')}]`,
      ...(fn.form !== undefined ? ['stages: FORM_STAGES'] : []),
      ...(fn.invalidates.length > 0 ? [`invalidates: ${JSON.stringify(fn.invalidates)}`] : []),
    ];
    return `const ${fn.name} = $fn({ ${fields.join(', ')} });`;
  });
  return { imports: [...head, ...imports], lines };
}
