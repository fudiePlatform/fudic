/**
 * What a temp project with server functions needs to resolve and typecheck: `@fudic/http`,
 * `@fudic/di` and `@fudic/forms` with their subpath entries, aliased to their `dist` like the
 * rest of the runtime. Exact matches, so `@fudic/http` never swallows `@fudic/http/server`.
 */

import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runtimeAlias } from './alias.js';

const at = (path: string): string => fileURLToPath(new URL(`../../../${path}`, import.meta.url));

const ENTRIES: Readonly<Record<string, string>> = {
  ...runtimeAlias,
  '@fudic/http/server': at('http/dist/server/index.js'),
  // What the modules generated from a `.fudapi` import (SDD-60 §3.11).
  '@fudic/http/contract/server': at('http/dist/contract/server.js'),
  '@fudic/http/contract': at('http/dist/contract/index.js'),
  '@fudic/forms/contract': at('forms/dist/contract/index.js'),
  '@fudic/http/client': at('http/dist/client/index.js'),
  '@fudic/http': at('http/dist/index.js'),
  '@fudic/di/page': at('di/dist/page.js'),
  '@fudic/di': at('di/dist/index.js'),
  '@fudic/forms/wire': at('forms/dist/wire/index.js'),
  '@fudic/forms/dom': at('forms/dist/dom/index.js'),
  '@fudic/forms': at('forms/dist/index.js'),
  '@fudic/conventions': at('conventions/dist/index.js'),
};

export const httpAlias = Object.entries(ENTRIES).map(([name, replacement]) => ({
  find: new RegExp(`^${name.replace(/\//gu, '\\/')}$`, 'u'),
  replacement,
}));

/** A `tsconfig.json` that types those entries from the same `dist`, plus any `extra` option. */
export function writeHttpTypecheckConfig(root: string, extra: Readonly<Record<string, unknown>> = {}): void {
  const paths: Record<string, string[]> = {
    '@fudic/http/server': [at('http/dist/server/index.d.ts')],
    '@fudic/http/client': [at('http/dist/client/index.d.ts')],
    '@fudic/forms/wire': [at('forms/dist/wire/index.d.ts')],
    '@fudic/http/contract/server': [at('http/dist/contract/server.d.ts')],
    '@fudic/http/contract': [at('http/dist/contract/index.d.ts')],
    '@fudic/forms/contract': [at('forms/dist/contract/index.d.ts')],
    '@fudic/*': [at('*/dist/index.d.ts')],
  };
  writeFileSync(
    join(root, 'tsconfig.json'),
    JSON.stringify({
      compilerOptions: {
        module: 'commonjs',
        target: 'es2020',
        jsx: 'preserve',
        strictFunctionTypes: true,
        allowJs: true,
        allowSyntheticDefaultImports: true,
        resolveJsonModule: true,
        paths,
        ...extra,
      },
    }),
  );
}
