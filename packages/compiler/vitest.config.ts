import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: {
    /**
     * Dev-time source resolution of the sibling RUNTIME packages, for the hydration
     * equivalence suite only (`test/emit/hydrate/`). They are devDependencies, not
     * dependencies: `src/` imports no runtime and must not. What that suite needs is the
     * one thing the emit cannot assert about itself — that the tree the server painted is
     * the tree the client adopts — and checking it takes both real adapters.
     */
    alias: {
      '@fudic/dom': fileURLToPath(new URL('../dom/src/index.ts', import.meta.url)),
      '@fudic/core': fileURLToPath(new URL('../core/src/index.ts', import.meta.url)),
      '@fudic/ssr': fileURLToPath(new URL('../ssr/src/index.ts', import.meta.url)),
      // The two entry points a form reaches for (SDD-34 §6.10): the model, which the SERVER
      // renders the values of, and the bindings the client hydrates with. The a11y invariant
      // is the other thing the emit cannot assert about itself — that a form has the same
      // markup whether it hydrated or not — and checking it takes both of them, running.
      '@fudic/forms/dom': fileURLToPath(new URL('../forms/src/dom/index.ts', import.meta.url)),
      '@fudic/forms': fileURLToPath(new URL('../forms/src/index.ts', import.meta.url)),
    },
  },
  test: {
    include: ['test/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      thresholds: {
        // The balancer (SDD-02) and tokenizer (SDD-03) should approach 100%.
        // Conservative global floor; raised per-module in later SDDs.
        lines: 80,
        functions: 80,
        branches: 75,
        // New code is born at 100 (CLAUDE.md), and it stays there. The project style guide
        // on its way into a document, and the reading that says a rule of it will match
        // nothing where it is going (SDD-42).
        'src/emit/project-styles.ts': { lines: 100, functions: 100, branches: 100, statements: 100 },
        // The names a component chooses on its root template (SDD-46).
        'src/binding/adopt.ts': { lines: 100, functions: 100, branches: 100, statements: 100 },
        'src/emit/styles-lint.ts': { lines: 100, functions: 100, branches: 100, statements: 100 },
        // The CSS each page uses (SDD-49): reading a plain sheet, its selectors and its
        // imports; what each scope can match; the prune; and the page's sheets in the emit.
        'src/css/rules.ts': { lines: 100, functions: 100, branches: 100, statements: 100 },
        'src/css/selectors.ts': { lines: 100, functions: 100, branches: 100, statements: 100 },
        'src/css/flatten.ts': { lines: 100, functions: 100, branches: 100, statements: 100 },
        'src/emit/surface.ts': { lines: 100, functions: 100, branches: 100, statements: 100 },
        'src/emit/prune.ts': { lines: 100, functions: 100, branches: 100, statements: 100 },
        'src/emit/page-sheets.ts': { lines: 100, functions: 100, branches: 100, statements: 100 },
        // What the view may write (SDD-51): the walk, its scope, and the six analyzers.
        'src/semantic/view-js.ts': { lines: 100, functions: 100, branches: 100, statements: 100 },
        'src/semantic/view-scope.ts': { lines: 100, functions: 100, branches: 100, statements: 100 },
        'src/semantic/view-globals.ts': { lines: 100, functions: 100, branches: 100, statements: 100 },
        'src/semantic/html-events.ts': { lines: 100, functions: 100, branches: 100, statements: 100 },
        'src/semantic/analyzers/view-expressions.ts': { lines: 100, functions: 100, branches: 100, statements: 100 },
        'src/semantic/analyzers/view-statements.ts': { lines: 100, functions: 100, branches: 100, statements: 100 },
        'src/semantic/analyzers/view-identifiers.ts': { lines: 100, functions: 100, branches: 100, statements: 100 },
        'src/semantic/analyzers/native-event-attributes.ts': { lines: 100, functions: 100, branches: 100, statements: 100 },
        'src/semantic/analyzers/view-attributes.ts': { lines: 100, functions: 100, branches: 100, statements: 100 },
        'src/semantic/analyzers/snippet-recursion.ts': { lines: 100, functions: 100, branches: 100, statements: 100 },
      },
    },
  },
});
