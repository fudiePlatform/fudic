/**
 * `fudic.json` — what a project declares about ITSELF (SDD-41 §3.1): its identity, the
 * prefix it proposes for new components, and whether it is an app or a library.
 *
 * **A directory is a fudic project if it has one.** That is the whole discovery rule.
 *
 * This reader is the twin of `readSwConfig`: I/O is injected so it is testable without a
 * filesystem, and it **never throws** — an unreadable file is a diagnostic and a project
 * with no configuration, never an exception. A project without the file behaves exactly
 * as it did before this SDD, which is what lets the file arrive without a migration.
 *
 * The two files do not merge, and §4.6 says why: this one talks about the PROJECT, and
 * `sw.json` talks about a DEPLOYMENT. They coincide one to one only while there is a
 * single app on an origin.
 */

import { CONFIG_FILE, ID_PATTERN, PREFIX_PATTERN } from './constants.js';
import { FUD_CONFIG_MALFORMED, type ConfigDiagnostic, type Span } from './diagnostics.js';

/** What the file declares, with every default already filled. */
export interface ProjectConfig {
  /** `''` when the file declares none — legal unless the project has a Service Worker. */
  readonly id: string;
  readonly kind: 'app' | 'lib';
  /**
   * What the CLI and the editor PROPOSE when creating a component. `''` when the file
   * declares none, and then both fall back to what they do today.
   *
   * It constrains nothing: a project with `prefix: "app"` can define `signal-counter`,
   * and that is a choice, not a mistake (§4.4).
   */
  readonly prefix: string;
  /**
   * The stylesheets this project adopts into the shadow roots of ITS OWN components
   * (SDD-42 §3.1). Paths relative to the project root, in adoption order. `[]` when the
   * file declares none, which is every project that existed before SDD-42.
   *
   * The order is contract, not a detail: it is the cascade. The project's sheets go in
   * front of the component's own, so the guide defines and the component adjusts — the
   * other way round, a component could not override the guide without raising
   * specificity, which is how a style guide becomes unmanageable.
   */
  readonly styles: readonly string[];
}

export interface ConfigResult {
  /** `null` when there is no `fudic.json`, or it is unusable. Degrades; never throws. */
  readonly config: ProjectConfig | null;
  readonly diagnostics: readonly ConfigDiagnostic[];
}

/** Minimal I/O seam, identical in shape to SDD-20's `ConfigIo`. */
export interface ConfigIo {
  exists(path: string): boolean;
  read(path: string): string;
}

/** What a field validator needs: the text to point into, and where to leave its verdict. */
interface Ctx {
  readonly text: string;
  readonly diagnostics: ConfigDiagnostic[];
}

/** Read `<root>/fudic.json`. */
export function readProjectConfig(root: string, io: ConfigIo): ConfigResult {
  const path = `${root}/${CONFIG_FILE}`;
  if (!io.exists(path)) {
    // Not having one is legal, and says nothing: zero diagnostics, not an informative one.
    return { config: null, diagnostics: [] };
  }

  let text: string;
  try {
    text = io.read(path);
  } catch (error) {
    return { config: null, diagnostics: [malformed(`could not be read: ${reason(error)}`)] };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    return { config: null, diagnostics: [malformed(`is not valid JSON: ${reason(error)}`)] };
  }

  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { config: null, diagnostics: [malformed('must be a JSON object')] };
  }

  const fields = parsed as Record<string, unknown>;
  const ctx: Ctx = { text, diagnostics: [] };

  const id = readString(fields, 'id', ID_PATTERN, 'lowercase, may contain hyphens', ctx);
  const kind = readKind(fields, ctx);
  const prefix = readString(
    fields,
    'prefix',
    PREFIX_PATTERN,
    'no hyphen — the hyphen is the one thing `tagOf` adds',
    ctx,
  );

  const styles = readStringArray(fields, 'styles', ctx);

  // Fields are NOT rescued one by one (§4.2). Identity is a unit, and half an identity is
  // worse than none: an `id` that got through alone would namespace caches under a name
  // the next build, with the file fixed, would not use.
  if (ctx.diagnostics.length > 0) {
    return { config: null, diagnostics: ctx.diagnostics };
  }
  return { config: { id, kind, prefix, styles }, diagnostics: [] };
}

/**
 * An absent array is `[]`; a present one has to be an array of strings.
 *
 * The strings are not validated as paths here, and that is the split of SDD-42: what a
 * path means needs a filesystem, and this reader has none beyond the one file it was given.
 * Whether the file exists (`FUD0740`) and whether two of them collide (`FUD0741`) is
 * `readProjectStyles`, which is handed an `io`.
 */
function readStringArray(
  fields: Record<string, unknown>,
  field: string,
  ctx: Ctx,
): readonly string[] {
  const value = fields[field];
  if (value === undefined) {
    return [];
  }
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== 'string')) {
    ctx.diagnostics.push(
      malformed(`"${field}" must be an array of strings`, fieldSpan(ctx.text, field)),
    );
    return [];
  }
  return value as readonly string[];
}

/** An absent field is its default; a present one has to be a string of the right shape. */
function readString(
  fields: Record<string, unknown>,
  field: string,
  pattern: RegExp,
  note: string,
  ctx: Ctx,
): string {
  const value = fields[field];
  if (value === undefined) {
    return '';
  }
  if (typeof value !== 'string' || !pattern.test(value)) {
    ctx.diagnostics.push(
      malformed(
        `"${field}" must be a string matching ${pattern.source} (${note})`,
        fieldSpan(ctx.text, field),
      ),
    );
    return '';
  }
  return value;
}

/** `kind` absent is `'app'`: one app is the shape every project had before this SDD. */
function readKind(fields: Record<string, unknown>, ctx: Ctx): 'app' | 'lib' {
  const value = fields['kind'];
  if (value === undefined) {
    return 'app';
  }
  if (value !== 'app' && value !== 'lib') {
    ctx.diagnostics.push(malformed('"kind" must be "app" or "lib"', fieldSpan(ctx.text, 'kind')));
    return 'app';
  }
  return value;
}

/**
 * Where `"<field>"` is used as a KEY, so the editor underlines the field and not the file.
 *
 * The first occurrence of the text is not necessarily the key — `{"prefix":"id","id":42}`
 * spells `"id"` as a value first — so what settles it is the colon behind it. Absent when
 * the key is not in the text as written, which a key spelled with escapes manages.
 */
function fieldSpan(text: string, field: string): Span | undefined {
  const key = `"${field}"`;
  let from = 0;
  for (;;) {
    const at = text.indexOf(key, from);
    if (at < 0) {
      return undefined;
    }
    const end = at + key.length;
    if (/^\s*:/u.test(text.slice(end))) {
      return { start: at, end };
    }
    from = end;
  }
}

function malformed(what: string, span?: Span): ConfigDiagnostic {
  return {
    code: FUD_CONFIG_MALFORMED,
    message: `${CONFIG_FILE} ${what}`,
    file: CONFIG_FILE,
    ...(span === undefined ? {} : { span }),
  };
}

function reason(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
