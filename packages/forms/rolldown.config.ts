import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { defineConfig, type Plugin } from 'rolldown';

/**
 * The published runtime of `@fudic/forms` (SDD-45 §3.3): one bundled, minified ES module per
 * piece, under `runtime/`, beside the `dist/` a bundler consumes. Same shape as
 * `packages/core/rolldown.config.ts`, and deliberately the same shape: a package that
 * publishes pieces its own way is a package the linker would have to know about.
 *
 * Every cross-piece import leaves as an `external` pointing at the published URL, so a piece
 * is a closed box with nothing to discover inside it (§4.3) and no module lands in two of
 * them (§4.3, second rule).
 */

const here = (path: string): string => fileURLToPath(new URL(path, import.meta.url));

const read = (file: string): { version: string } =>
  JSON.parse(readFileSync(file, 'utf8')) as { version: string };

/**
 * The version comes from the `package.json`, which owns it — never from an option and never
 * from `fudic.json` (§2, SDD-41). It is what makes these files change, and therefore what
 * identifies them.
 *
 * A piece of ANOTHER package is named with THAT package's version, read the same way, through
 * the `./package.json` export every publishing package declares. Not this one's: the two agree
 * today and the URL would be right by luck, and a URL that is right by luck is a 404 the day
 * somebody releases one package without the other.
 */
const require = createRequire(import.meta.url);
const { version } = read(here('./package.json'));
const versions: Readonly<Record<string, string>> = {
  core: read(require.resolve('@fudic/core/package.json')).version,
};

/** `/_fudic/<version>/<pkg>/<piece>.js` — the one shape §3.1 publishes. */
const published = (pkg: string, piece: string): string =>
  `/_fudic/${versions[pkg] ?? version}/${pkg}/${piece}.js`;

/**
 * The pieces of this package, piece name → entry module.
 *
 * **Derived from what this package EXPORTS**, and that sentence is the whole content of this
 * table. The first split was read off the chunks `examples/basic` emits, so `minLength` had a
 * piece and `required`, `pattern`, `max` and the twelve typed coercions had none — and six of
 * the nine binders had none either, because that example binds a text field and a form.
 * Deducing a split from an example is deducing it from a coincidence, and the symptom arrives
 * late: an import the linker cannot answer, in somebody else's build.
 * `examples/pieces-bench/check.mjs` walks `dist/` — where the types are already erased — and
 * fails if a single exported value has no URL.
 *
 * **Where the frontiers are is measured, not argued** (§4.3, third rule). The nine binders are
 * alternatives and each one clears the ~150 compressed bytes a frontier costs, so each is a
 * piece: the page with one text field downloads one of them. The eight validators and the
 * twelve typed coercions do NOT clear it — they are 50 to 130 bytes each — so they travel as
 * two gathered pieces, entered from `bundle/`: whoever uses one validator pays one frontier
 * instead of eight, and whoever uses three pays one instead of three.
 *
 * All of them are LIBRARY pieces (§3.4): nobody starts them, the chunk of whichever component
 * carries the form imports them, and they keep the names they export today. The `bundle/`
 * entries are not a uniform `install` ceremony — they exist to publish several exports from
 * one piece.
 *
 * `internals`, `run-rule` and `flags` are pieces nobody designed: the second rule of
 * §4.3 made them, because two pieces reach each of them. See `FRONTIERS`.
 */
const PIECES: Readonly<Record<string, string>> = {
  // The model: a form that can be built, filled and validated with no `<form>` anywhere.
  control: 'src/control.ts',
  form: 'bundle/form.ts',
  internals: 'bundle/internals.ts',
  'run-rule': 'src/run-rule.ts',
  flags: 'bundle/flags.ts',
  validators: 'bundle/validators.ts',
  typed: 'bundle/typed.ts',
  messages: 'src/messages.ts',
  element: 'src/element.ts',
  // The browser half: one binder per shape of field, which is why there is no `switch`.
  wiring: 'bundle/wiring.ts',
  'bind-form': 'src/dom/bind-form.ts',
  'bind-text': 'src/dom/bind-text.ts',
  'bind-number': 'src/dom/bind-number.ts',
  'bind-checkbox': 'src/dom/bind-checkbox.ts',
  'bind-radio': 'src/dom/bind-radio.ts',
  'bind-select': 'src/dom/bind-select.ts',
  'bind-select-multiple': 'src/dom/bind-select-multiple.ts',
  'bind-group': 'src/dom/bind-group.ts',
  'bind-by-type': 'src/dom/bind-by-type.ts',
  summary: 'bundle/summary.ts',
};

/**
 * Source module → the piece that owns it. Reaching one from ANOTHER piece is an import that
 * must leave the bundle; reaching it from its own piece is not a frontier at all, which is
 * what lets `bundle/validators.ts` gather nine modules into one piece.
 *
 * Keyed by source module and not by piece, because that is how the question arrives —
 * `bind-text.ts` writes `./wiring.js`, not `wiring`.
 *
 * Three of these entries are the second rule of §4.3 writing itself down, and none of them was
 * anybody's idea of a piece:
 *
 * - `wiring` is reached by six binders — listening, undoing, and painting the error into the
 *   slot the emit already wrote.
 * - `internals` and `run-rule` are reached by `control`, by `form` and, through `typed`, by
 *   every coercion.
 * - `flags` is reached by `control`, by `form`, by `run-rule` and by the validators, and it is
 *   the case where the rule is not about bytes at all: its content is two `Symbol`s, and two
 *   copies would be two symbols — a rule marked server-only through one would run on the
 *   client because the other did not recognise the mark.
 * - `summary` is reached by `bind-form` and `bind-group`, which both paint a summary.
 *
 * `internals` also carries the validity and `validateOn` policies and the record of async
 * verdicts (BUG-42): reached by `control` and `form` alike, and too small to be pieces.
 *
 * `delegation` and `length` are listed as owned but are not frontiers today: each is reached
 * by exactly one piece and travels inside it. They are here so that the table answers for
 * every module rather than for the ones that happen to cross today.
 */
const FRONTIERS: Readonly<Record<string, string>> = {
  'src/control.ts': 'control',
  'src/form.ts': 'form',
  'src/group.ts': 'form',
  'src/internals.ts': 'internals',
  'src/validate-on.ts': 'internals',
  'src/validity.ts': 'internals',
  'src/verdicts.ts': 'internals',
  'src/run-rule.ts': 'run-rule',
  'src/server-flag.ts': 'flags',
  'src/async-flag.ts': 'flags',
  'src/messages.ts': 'messages',
  'src/element.ts': 'element',
  'src/validators/validator.ts': 'validators',
  'src/validators/server.ts': 'validators',
  'src/validators/required.ts': 'validators',
  'src/validators/min-length.ts': 'validators',
  'src/validators/max-length.ts': 'validators',
  'src/validators/min.ts': 'validators',
  'src/validators/max.ts': 'validators',
  'src/validators/pattern.ts': 'validators',
  'src/validators/async.ts': 'validators',
  'src/validators/length.ts': 'validators',
  'src/typed/typed.ts': 'typed',
  'src/typed/range.ts': 'typed',
  'src/typed/u8.ts': 'typed',
  'src/typed/i8.ts': 'typed',
  'src/typed/u16.ts': 'typed',
  'src/typed/i16.ts': 'typed',
  'src/typed/u32.ts': 'typed',
  'src/typed/i32.ts': 'typed',
  'src/typed/f32.ts': 'typed',
  'src/typed/f64.ts': 'typed',
  'src/typed/bool.ts': 'typed',
  'src/typed/str.ts': 'typed',
  'src/typed/date.ts': 'typed',
  'src/typed/arr.ts': 'typed',
  'src/dom/wiring.ts': 'wiring',
  'src/dom/delegation.ts': 'wiring',
  'src/dom/bind-form.ts': 'bind-form',
  'src/dom/bind-text.ts': 'bind-text',
  'src/dom/bind-number.ts': 'bind-number',
  'src/dom/bind-checkbox.ts': 'bind-checkbox',
  'src/dom/bind-radio.ts': 'bind-radio',
  'src/dom/bind-select.ts': 'bind-select',
  'src/dom/bind-select-multiple.ts': 'bind-select-multiple',
  'src/dom/bind-group.ts': 'bind-group',
  'src/dom/bind-by-type.ts': 'bind-by-type',
  'src/dom/bind-message.ts': 'wiring',
  'src/summary-markup.ts': 'summary',
  'src/dom/summary.ts': 'summary',
};

/** Absolute path → the piece that owns it, resolved once so the hook below is a lookup. */
const FRONTIER_PIECES = new Map<string, string>(
  Object.entries(FRONTIERS).map(([file, piece]) => [here(`./${file}`), piece]),
);

/**
 * What this package takes from `@fudic/core`, export by export, and which piece publishes it.
 *
 * Export by export and not package by package, because `@fudic/core` is not one piece. The
 * previous version of this file mapped the whole specifier to `core/effect` and left a comment
 * saying it would stop working the day something here imported `signal` as well. That day is
 * this commit: `control` and `form` take `signal` and `untrack`, and `element` takes
 * `FudicElement`, which live in three other pieces.
 *
 * `@fudic/core` must never be inlined here: `effect` is shared by every binder and by whatever
 * else on the page is reactive, and a copy inside each binder would be paid for by every
 * application that has a form.
 */
const CORE_EXPORTS: Readonly<Record<string, readonly string[]>> = {
  effect: ['effect'],
  signal: ['signal'],
  computed: ['computed'],
  tracking: ['untrack'],
  element: ['FudicElement'],
};

/** The id of the module that stands in for `@fudic/core`, and exists only during this build. */
const CORE_SHIM = '\0fudic:core';

/**
 * A published piece, leaving as a URL and declared free of side effects.
 *
 * `'absolute'` keeps the URL exactly as written: with a plain `true` an id starting with `/`
 * is read as a filesystem path and renormalized against the output directory, which would turn
 * an origin-absolute URL into `../../…`.
 *
 * `moduleSideEffects: false` is not an optimisation, it is the difference between a split that
 * works and one that costs three round trips per binder. A bundler assumes an external module
 * may do something on import, so it keeps a bare `import "…"` for every one the shim names,
 * used or not: `bind-text` came out asking for `core/signal`, `core/tracking` and
 * `core/element` — three requests and 114 bytes, for three names it never mentions. A piece of
 * this framework declares things and starts nothing, so saying so is true, and saying it here
 * is what lets the shim drop what this build does not use.
 */
const external = (url: string) =>
  ({ id: url, external: 'absolute', moduleSideEffects: false }) as const;

/**
 * Rewrite every frontier import to its published URL.
 *
 * A plugin and not the `external` option because `external` only DECIDES; what is needed here
 * is a substitution — `'./wiring.js'`, which means nothing to a browser, has to come out as
 * `/_fudic/<version>/forms/wiring.js`. `'absolute'` keeps the URL exactly as written: with a
 * plain `true` an id starting with `/` is read as a filesystem path and renormalized against
 * the output directory, which would turn an origin-absolute URL into `../../…`.
 *
 * And a SHIM for `@fudic/core`, because the source says `import { signal, untrack }` while the
 * answer is two different URLs: `resolveId` is handed the specifier and never the names, so it
 * cannot split one import two ways. The shim can — it re-exports each name from its own piece,
 * rolldown inlines it, drops what this build does not use, and what survives is one external
 * import per piece actually reached. It is the same device `@fudic/ssr` uses for `@fudic/di`,
 * and it costs no request and no byte: nothing of it remains but the imports themselves.
 */
const publishedUrls = (self: string): Plugin => ({
  name: 'fudic-published-urls',
  resolveId(source, importer) {
    if (source === '@fudic/core') return CORE_SHIM;
    // The pieces the shim names: already URLs, and they leave as they are.
    if (source.startsWith('/_fudic/')) return external(source);
    if (importer === undefined || !source.startsWith('.')) return null;
    // Source is TypeScript and its specifiers are the emitted `.js` (`verbatimModuleSyntax`),
    // so the frontier map — which is keyed by the files that exist — is asked in those terms.
    const file = fileURLToPath(new URL(source.replace(/\.js$/, '.ts'), pathToFileURL(importer)));
    const owner = FRONTIER_PIECES.get(file);
    // A module of the piece being built is not a frontier: `bundle/validators.ts` reaches nine
    // modules that all belong to `validators`. A piece cannot import itself, and the check
    // that says so is about the PIECE and not about the entry file — an entry that gathers
    // nine modules has nine ways to arrive at itself.
    return owner === undefined || owner === self ? null : external(published('forms', owner));
  },
  load(id) {
    if (id !== CORE_SHIM) return null;
    return Object.entries(CORE_EXPORTS)
      .map(([piece, names]) => `export { ${names.join(', ')} } from '${published('core', piece)}';`)
      .join('\n');
  },
});

export default defineConfig(
  Object.entries(PIECES).map(([piece, entry]) => {
    return {
      input: { [piece]: here(`./${entry}`) },
      platform: 'browser' as const,
      plugins: [publishedUrls(piece)],
      /**
       * Erase a type-only import instead of leaving it as a side effect.
       *
       * `verbatimModuleSyntax` — which this repo requires and does not relax — turns
       * `import { type Control } from '../types.js'` into `import {} from '…'`, a bare import
       * that survives into the bundle and, once rewritten, becomes a REQUEST for a name that
       * only ever existed in the type system — and the worst kind of request, discovered
       * inside another piece, one round trip deep, which is the chain §1.5 rule 2 forbids.
       * `dist` keeps `verbatimModuleSyntax`, because there the statement is somebody else's
       * bundler's business; here the emit is the product.
       */
      transform: { typescript: { onlyRemoveTypeImports: false } },
      onLog(level, log, defaultHandler) {
        // Rolldown reports the override above as a conflict on every build. It is the one
        // conflict here that is deliberate, and a warning printed five times per build is how
        // everybody learns to stop reading the ones that are not.
        if (log.code === 'CONFIGURATION_FIELD_CONFLICT') return;
        defaultHandler(level, log);
      },
      output: {
        dir: 'runtime',
        format: 'esm' as const,
        // No hash: the version in the URL is the identity (§3.1), and a hash here would make
        // the name unpredictable to the plugin that has to write it into a coordinator.
        entryFileNames: '[name].js',
        minify: true,
        /**
         * **A map per piece, and it does not cost determinism.** These files are minified
         * framework code served from `/_fudic/`, so without one they are undebuggable in the
         * browser — which is where this framework runs. This said « no source map, it would
         * carry absolute paths »; it does not. Rolldown writes `sources` relative to the
         * output directory, in POSIX form (`../src/signal.ts`), and `sourcesContent` is the
         * file's own text. Nothing of the machine or the moment gets in, so §6.2 still holds:
         * building twice produces the same bytes, map included.
         *
         * A browser fetches a `.js.map` only when devtools is open, and the piece grows by the
         * `sourceMappingURL` line and nothing else.
         */
        sourcemap: true,
        comments: false,
      },
    };
  }),
);
