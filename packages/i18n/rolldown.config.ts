import { fileURLToPath } from 'node:url';
import { defineConfig } from 'rolldown';

/**
 * The published runtime of `@fudic/i18n` (SDD-45 §3.3, SDD-58 §4.6): one bundled, minified ES
 * module per piece under `runtime/`, the same shape as `@fudic/forms`.
 *
 * Three pieces and no frontier between them: `format`, `message` and `href` share no module,
 * so each one is a closed box. They reach the browser only when the chunk of a hydrated
 * component names them — a component painted once on the server downloads none.
 */

const here = (path: string): string => fileURLToPath(new URL(path, import.meta.url));

const PIECES: Readonly<Record<string, string>> = {
  format: 'src/runtime/format.ts',
  message: 'src/runtime/message.ts',
  href: 'src/runtime/href.ts',
};

export default defineConfig(
  Object.entries(PIECES).map(([piece, entry]) => ({
    input: { [piece]: here(`./${entry}`) },
    platform: 'browser' as const,
    // A type-only import would otherwise survive as a bare `import {} from '…'` (see forms).
    transform: { typescript: { onlyRemoveTypeImports: false } },
    onLog(level, log, defaultHandler) {
      if (log.code === 'CONFIGURATION_FIELD_CONFLICT') return;
      defaultHandler(level, log);
    },
    output: {
      dir: 'runtime',
      format: 'esm' as const,
      // No hash: the version in the URL is the identity.
      entryFileNames: '[name].js',
      minify: true,
      sourcemap: true,
      // `@fudic/conventions` is a few constants inlined here, not code anyone debugs: marked
      // ignored, so devtools does not list the whole file as if the page had loaded it.
      sourcemapIgnoreList: /conventions[\\/]dist[\\/]/u,
      comments: false,
    },
  })),
);
