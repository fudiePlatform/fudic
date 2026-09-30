/**
 * Build/config-level diagnostics (SDD-19 §5, range FUD0360–FUD0389). Distinct from
 * the compiler's span-carrying `Diagnostic`: these concern files, routes and the
 * manifest — not source offsets. The plugin elevates them to Vite errors/warnings.
 */

export interface FudicDiagnostic {
  readonly code: string;
  readonly message: string;
  /** The route file, asset or pattern this concerns. */
  readonly file: string;
}

export const FUD_MALFORMED_PARAM = 'FUD0360';
export const FUD_ROUTE_COLLISION = 'FUD0361';
export const FUD_PATHS_INCOMPLETE = 'FUD0362';
export const FUD_ASSET_NOT_FOUND = 'FUD0363';
/**
 * A relative specifier that walks into the project's public directory.
 *
 * The two ways of naming a file of your own differ in WHO chooses the URL: a relative path
 * hands it to the build, which hashes and publishes it; a root-absolute one keeps the name
 * the author gave the file under `public/`. Reaching into `public/` with `../../public/x`
 * asks for both at once, and gets the worse half of each — a second, hashed copy of a file
 * that is already being served under its own name.
 *
 * Error, because there is no version of it the author meant: either `/x`, or the file does
 * not belong in `public/`.
 */
export const FUD_PUBLIC_BY_PATH = 'FUD0366';
export const FUD_UNKNOWN_ROUTE_OVERRIDE = 'FUD0364';
export const FUD_MANIFEST_URL_NOT_ABSOLUTE = 'FUD0365';

// SDD-20 (FUD0390–FUD0419): Service Worker render — config, strategy and linking.
export const FUD_SW_CONFIG_MALFORMED = 'FUD0390';
export const FUD_SW_SHELL_MISSING = 'FUD0391';
export const FUD_TTL_INVALID = 'FUD0392';
export const FUD_STRATEGY_NOT_LITERAL = 'FUD0393';
export const FUD_STRATEGY_DUPLICATE = 'FUD0394';
export const FUD_UNLINKABLE_CONSTRUCT = 'FUD0395';
export const FUD_TWO_TTLS = 'FUD0396';
export const FUD_STRATEGY_AND_DEFAULT = 'FUD0397';
export const FUD_SSG_WITHOUT_PATHS = 'FUD0398';
export const FUD_CHUNK_NOT_EMITTED = 'FUD0399';

// SDD-27 (FUD0500–FUD0519): build artifacts and manifest. Neither breaks the build:
// the first disables the rename entirely, the second only for the colliding pair.
export const FUD_HASH_LENGTH = 'FUD0500';
export const FUD_NAME_COLLISION = 'FUD0501';

// SDD-21 (FUD0420–FUD0449): layouts. Only the build-level one lives here; the rest are
// span-carrying diagnostics the compiler emits (structure + resolveDocument).
export const FUD_ORPHAN_LAYOUT = 'FUD0434';

// SDD-39 (FUD0620–FUD0639): reactive routes. Both are the BUILD's and carry no span — one
// is about a page that failed to render, the other about two files that would be written to
// the same name.
/** A route's prerender threw. The page is not generated AND the build fails (§4.11). */
export const FUD_PRERENDER_FAILED = 'FUD0620';
/** A route's chunk name collides with a component tag: two files, one name (§3.5). */
export const FUD_ROUTE_NAME_COLLISION = 'FUD0622';

// SDD-42 (FUD0740–FUD0759): the project style guide. The other three of that range belong
// to `@fudic/config`, which owns the field; this one is the BUILD's, because it is the only
// place that knows the whole project.
/**
 * The project declares `styles` and defines no component of its own: nothing adopts the
 * sheet (SDD-42 §5).
 *
 * A warning and a build that finishes, because a project with no components yet is what
 * every project looks like on its first day — and it carries no span, because what it is
 * about is the absence of files.
 */
export const FUD_STYLES_NOT_ADOPTED = 'FUD0742';

// SDD-43 (FUD0760–FUD0779): libraries. Both are the BUILD's and carry no span, because what
// they are about is a package — whether it is installed, what it publishes, and whether it
// ever meant to be consumed. None of that is anywhere in the `.fud` that named it.
/**
 * A `<link rel="component" href>` whose package specifier does not resolve (SDD-43 §4.3).
 *
 * The message distinguishes the two cases the author confuses, because they are two
 * different fixes: the package is NOT INSTALLED, which is an install, and the package is
 * installed but does NOT EXPORT the file, which is its `package.json`. One message for both
 * sends them to read the wrong file.
 */
export const FUD_LINK_UNRESOLVED = 'FUD0760';

/**
 * A library whose declared `@fudic/compiler` range excludes the compiler this build resolved
 * (SDD-43 §4.7).
 *
 * A library publishes `.fud` SOURCE, so the consumer's compiler is what parses it: the two
 * have to speak the same version of the language, or what the author sees is a parse error in
 * a file they never wrote. The library says which versions it was written for, and this is
 * what happens when the answer is no.
 *
 * **SUPERSEDED by `FUD0800`, and no longer emitted** (SDD-45 §4.8). It was a WARNING, once per
 * library: the range is written by the library's author with the information they had the day
 * they published, and a range conservative by one minor must not stop a build that works. That
 * held while every application of a repository shared a framework version by force. Since
 * SDD-45 makes mixed versions a promise of the product, a warning is not enough — what this
 * describes breaks, and breaks late. The code is kept here so that a build log from before
 * still means something.
 */
export const FUD_LIB_PEER_MISMATCH = 'FUD0762';

/** The href resolves into a package whose `fudic.json` does not say `kind: "lib"`. */
export const FUD_LINK_NOT_A_LIBRARY = 'FUD0763';

// SDD-45 (FUD0800–FUD0819): the published runtime. The BUILD's, and with no span: what they
// are about is a package's `package.json` and the directory it produced, neither of which any
// `.fud` mentions.
/**
 * A package declares `fudic.runtime` and that directory does not exist or holds no piece
 * (SDD-45 §3.3).
 *
 * An ERROR, because the declaration is a promise the consumer's build already believed: the
 * application stopped bundling those modules and is linking URLs instead, so what an empty
 * directory produces is a page that fetches files nobody wrote. The usual cause is a
 * publisher whose runtime build has not run — which is a fixable thing to be told, and
 * unfixable to discover in a browser.
 */
export const FUD_RUNTIME_DIR_MISSING = 'FUD0804';

/**
 * A library of this graph declares a `peerDependencies` on the framework that excludes the
 * version this build resolves (SDD-45 §4.8). **Supersedes `FUD0762`**, which said the same
 * thing as a warning.
 *
 * An ERROR, and the promotion is the point. A library publishes `.fud` SOURCE, so the
 * compiler that parses it is the CONSUMER's: a mismatch produces a syntax error, or a missing
 * export, inside a file the author never wrote. While every application of a repository was on
 * one version by force, a range conservative by one minor stopping a working build was the
 * bigger harm. This SDD makes an application's version its own — `app-1` on 1.0 beside
 * `app-2` on 2.0, sharing an origin and sharing libraries — and the moment a library is
 * shared, **the library decides**. A warning about that is a build that fails in a browser.
 */
export const FUD_RUNTIME_PEER_MISMATCH = 'FUD0800';

/**
 * Two packages would publish the same URL (SDD-45 §3.1, §7).
 *
 * An ERROR, and one that should not be reachable: the URL carries the package segment
 * precisely so that `element` in `core` and `element` in `forms` are two different files.
 * What remains is two packages with the same short name and the same version — a scoped one
 * and a fork of it, say, or `@fudic/core` beside somebody's `@acme/core` — and then one of
 * the two files silently wins the copy into `_fudic/` and every page that names it gets the
 * wrong bytes. Cheap to check and impossible to debug from a browser, so it is checked.
 */
export const FUD_RUNTIME_URL_CLASH = 'FUD0805';

/**
 * An import reaches a piece the published runtime does not have (SDD-45 §5).
 *
 * An ERROR. It is the symptom of a `dist` copied halfway or of a package published without
 * running its own runtime build, and the coordinator cannot be written without it: what would
 * be emitted is a page importing a URL nobody wrote, which fails in a browser, inside a module
 * the author did not write.
 */
export const FUD_RUNTIME_PIECE_MISSING = 'FUD0801';

/**
 * The output already holds a published piece with different bytes (SDD-45 §4.2).
 *
 * A WARNING, because the build that is running is not the one that did something wrong and
 * stopping it fixes nothing. It should not be possible: the same version of a package was
 * built by the same build of the framework, so two applications deploying over one origin
 * overwrite each other with identical bytes. Different bytes mean one version was published
 * twice with two contents, and then whichever application deploys last silently decides what
 * every page of that origin runs.
 */
export const FUD_RUNTIME_PIECE_DIFFERS = 'FUD0802';

/**
 * A piece about to be copied into `_fudic/` carries the build token (SDD-45 §4.13).
 *
 * An ERROR, and the one the whole architecture rests on: a piece is the same bytes for every
 * application and every deploy, so it cannot contain a fact of one of them. If it does,
 * something of the application was compiled into code of the framework — and the two
 * applications sharing that URL would be sharing one's build id. Checked rather than trusted,
 * because it is one comparison in the build and an afternoon in a browser.
 */
export const FUD_RUNTIME_PIECE_HAS_BUILD = 'FUD0806';

/**
 * A layout asks to carry the runtime inside the document and the policy has no nonce
 * (SDD-45 §4.5.2, §3.6).
 *
 * An ERROR, and it is the one code of this range with a SPAN: what it is about is a line
 * somebody wrote — `fudic:runtime?inline` — and not a package or a directory.
 *
 * It breaks in production and is decidable here, which is the whole argument for checking
 * it: an inline module is exactly what a strict `script-src` refuses, so the page renders,
 * the browser drops the script, and nothing hydrates — with no error the author can connect
 * to the line that caused it. A build that can see both halves says so before that happens.
 */
export const FUD_INLINE_WITHOUT_NONCE = 'FUD0803';

// SDD-49 (FUD0850–FUD0869): the CSS each page uses. The code is the compiler's, which owns
// the range; the BUILD is the one that reports it, because only the build has seen every page.
/** A sheet that adds no rule to any page of the application: dead CSS. */
export { FUD_SHEET_UNUSED } from '@fudic/compiler';

/**
 * Whether a document policy leaves room for the inline form: does it declare the nonce?
 *
 * The token and not a parsed policy, because the token is what the response substitutes
 * (`cspFor`): a policy that never writes `{nonce}` cannot produce a nonce for the page, and
 * no amount of reading `script-src` changes that.
 */
export function policyDeclaresNonce(documentPolicy: string): boolean {
  return documentPolicy.includes('{nonce}');
}
