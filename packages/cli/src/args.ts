/**
 * argv → a typed command (SDD-22 §4.1). NOTHING here prompts: no menus, no confirmations,
 * no "did you mean". A CLI that asks cannot go into a script, or CI, or a test, so a
 * missing argument is an exit code with a line that says how to go on, never a selector.
 */

import { COMPONENTS_DIR, LAYOUTS_DIR, ROUTES_DIR } from '@fudic/conventions';
import { FUD0448, type FUD0448Params } from '@fudic/diagnostics';
import type { Topic } from './help/commands.js';
import { COMMANDS, GENERATES, type UsageError } from './help/usage.js';
import { prefixOf } from './tag.js';
import type { CheckKind } from './plans/check.js';
import { FRONT_PORT, type ServeKind } from './serve/workspace.js';
import { APPS_DIR, LIBS_DIR } from './workspace/place.js';
import type {
  AppOptions,
  ComponentOptions,
  FmtOptions,
  LayoutOptions,
  NewOptions,
  PackageManager,
  PageOptions,
  ProjectOptions,
  SpecOptions,
  TermOptions,
  ServeOptions,
  TargetedOptions,
  TranslateOptions,
  WorkspaceOptions,
} from './types.js';

export interface GlobalFlags {
  readonly dryRun: boolean;
  readonly json: boolean;
}

export type ParsedCommand =
  | { readonly kind: 'new'; readonly name: string; readonly opts: NewOptions; readonly flags: GlobalFlags }
  | {
      readonly kind: 'workspace';
      readonly name: string;
      readonly opts: WorkspaceOptions;
      readonly flags: GlobalFlags;
    }
  | { readonly kind: 'app'; readonly name: string; readonly opts: AppOptions; readonly flags: GlobalFlags }
  | { readonly kind: 'lib'; readonly name: string; readonly opts: ProjectOptions; readonly flags: GlobalFlags }
  | { readonly kind: 'component'; readonly tag: string; readonly opts: ComponentOptions; readonly flags: GlobalFlags }
  | { readonly kind: 'page'; readonly route: string; readonly opts: PageOptions; readonly flags: GlobalFlags }
  | { readonly kind: 'layout'; readonly name: string; readonly opts: LayoutOptions; readonly flags: GlobalFlags }
  | { readonly kind: 'spec'; readonly name: string; readonly opts: SpecOptions; readonly flags: GlobalFlags }
  | { readonly kind: 'term'; readonly name: string; readonly opts: TermOptions; readonly flags: GlobalFlags }
  | { readonly kind: 'fmt'; readonly paths: readonly string[]; readonly opts: FmtOptions; readonly flags: GlobalFlags }
  | { readonly kind: 'translate'; readonly opts: TranslateOptions; readonly flags: GlobalFlags }
  | { readonly kind: 'serve'; readonly serve: ServeKind; readonly opts: ServeOptions; readonly flags: GlobalFlags }
  | { readonly kind: 'check'; readonly check: CheckKind; readonly opts: TargetedOptions; readonly flags: GlobalFlags }
  /** `topic: null` is the general help. */
  | { readonly kind: 'help'; readonly topic: Topic | null }
  | ({ readonly kind: 'error' } & UsageError);

type GenerateType = 'component' | 'page' | 'layout' | 'app' | 'lib' | 'spec' | 'term';

/** Every spelling of a type `fudic generate` takes, aliases included. */
const GENERATE_TYPES: Readonly<Record<string, GenerateType>> = {
  component: 'component',
  c: 'component',
  page: 'page',
  p: 'page',
  layout: 'layout',
  l: 'layout',
  app: 'app',
  a: 'app',
  lib: 'lib',
  spec: 'spec',
  s: 'spec',
  term: 'term',
  t: 'term',
};

/** What a `fudic generate <type>` without a name could have been. */
const EXAMPLE: Readonly<Record<GenerateType, string>> = {
  component: 'button',
  page: 'about',
  layout: 'docs',
  app: 'admin',
  lib: 'ui',
  spec: 'button',
  term: 'then cart-has',
};

/** The command a help or an error is about, from what was typed before it. */
function topicOf(positionals: readonly string[]): Topic | null {
  const [command, type] = positionals;
  if (command === 'new' || command === 'fmt' || command === 'translate') return command;
  if (command === 'dev' || command === 'preview' || command === 'test' || command === 'spec') return command;
  if (command !== 'generate' && command !== 'g') return null;
  const canonical = type === undefined ? undefined : GENERATE_TYPES[type];
  return canonical === undefined ? 'generate' : `generate ${canonical}`;
}

interface Tokens {
  readonly positionals: readonly string[];
  readonly flags: ReadonlyMap<string, readonly string[]>;
  /** A flag that takes a value and was given none. */
  readonly missing?: string;
}

/** `--flag value`, `--flag=value` and `--boolean`. Repeated flags accumulate. */
function tokenize(argv: readonly string[]): Tokens {
  const positionals: string[] = [];
  const flags = new Map<string, string[]>();
  const valued = new Set(['base', 'cwd', 'pm', 'layout', 'target', 'dir', 'in', 'sections', 'print-width', 'tab-width', 'quote', 'end-of-line', 'id', 'prefix', 'app', 'uses', 'project', 'param', 'port']);

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i] ?? '';
    if (!arg.startsWith('-')) {
      positionals.push(arg);
      continue;
    }
    const bare = arg === '-f' ? 'force' : arg.replace(/^--?/u, '');
    const [name = '', inlineValue] = bare.includes('=') ? splitOnce(bare, '=') : [bare, undefined];
    const previous = flags.get(name) ?? [];

    if (!valued.has(name)) {
      flags.set(name, [...previous, 'true']);
      continue;
    }
    const value = inlineValue ?? argv[i + 1];
    if (value === undefined || value.startsWith('-')) return { positionals, flags, missing: name };
    if (inlineValue === undefined) i += 1;
    flags.set(name, [...previous, value]);
  }
  return { positionals, flags };
}

function splitOnce(text: string, separator: string): [string, string] {
  const at = text.indexOf(separator);
  return [text.slice(0, at), text.slice(at + separator.length)];
}

function single(tokens: Tokens, name: string, fallback: string): string {
  return tokens.flags.get(name)?.at(-1) ?? fallback;
}

function bool(tokens: Tokens, name: string): boolean {
  return tokens.flags.has(name);
}

/** `--sections a,b --sections c` → `['a','b','c']`. */
function list(tokens: Tokens, name: string): readonly string[] | null {
  const raw = tokens.flags.get(name);
  if (raw === undefined) return null;
  return raw
    .flatMap((value) => value.split(','))
    .map((value) => value.trim())
    .filter((value) => value !== '');
}

/**
 * `--project`, omitted when it was not given.
 *
 * Omitted and not set to `undefined`: with `exactOptionalPropertyTypes` an absent field and a
 * field holding `undefined` are different types, and "absent" is the one that means *resolve
 * it from `cwd`*.
 */
function target(tokens: Tokens): { readonly project?: string } {
  const project = tokens.flags.get('project')?.at(-1);
  return project === undefined ? {} : { project };
}

/** A usage error about `topic`, with the lines that say how to go on. */
function fail(params: FUD0448Params, topic: Topic | null, ...hints: string[]): ParsedCommand {
  return { kind: 'error', error: FUD0448(params), topic, hints };
}

/** Any flag outside the accepted set is an error, never a silent no-op. */
function unknownFlag(tokens: Tokens, accepted: readonly string[], topic: Topic): ParsedCommand | null {
  for (const name of tokens.flags.keys()) {
    if (accepted.includes(name)) continue;
    const takes = accepted.filter((flag) => !GLOBAL.includes(flag)).map((flag) => `--${flag}`);
    return fail({ problem: 'unknown-flag', name }, topic, `it takes: ${[...takes, '--dry-run', '--force'].join(', ')}`);
  }
  return null;
}

const GLOBAL = ['dry-run', 'force', 'cwd', 'json', 'help'];

export function parseArgs(argv: readonly string[]): ParsedCommand {
  const tokens = tokenize(argv);
  const topic = topicOf(tokens.positionals);
  if (tokens.missing !== undefined) {
    return fail({ problem: 'flag-needs-value', name: tokens.missing }, topic, `write it as --${tokens.missing} <value>`);
  }
  if (bool(tokens, 'help') || tokens.positionals.length === 0) return { kind: 'help', topic };

  const flags: GlobalFlags = { dryRun: bool(tokens, 'dry-run'), json: bool(tokens, 'json') };
  const cwd = single(tokens, 'cwd', '.');
  const force = bool(tokens, 'force');
  const [command = '', ...rest] = tokens.positionals;

  if (command === 'fmt') return parseFmt(tokens, rest, { cwd, force }, flags);
  if (command === 'translate') return parseTranslate(tokens, rest, { cwd, force }, flags);
  if (command === 'dev' || command === 'preview') return parseServe(command, tokens, rest, { cwd, force }, flags);
  if (command === 'test' || command === 'spec') return parseCheck(command, tokens, rest, { cwd, force }, flags);
  if (command === 'new') return parseNew(tokens, rest, { cwd, force }, flags);
  if (command === 'generate' || command === 'g') return parseGenerate(tokens, rest, { cwd, force }, flags);
  return fail({ problem: 'unknown-command', command }, null, `the commands are: ${COMMANDS}`);
}

interface Base {
  readonly cwd: string;
  readonly force: boolean;
}

const FMT_FLAGS = ['check', 'print-width', 'tab-width', 'use-tabs', 'quote', 'end-of-line'];

function parseFmt(tokens: Tokens, rest: readonly string[], base: Base, flags: GlobalFlags): ParsedCommand {
  const unknown = unknownFlag(tokens, [...GLOBAL, ...FMT_FLAGS], 'fmt');
  if (unknown !== null) return unknown;

  const quote = single(tokens, 'quote', 'double');
  if (quote !== 'double' && quote !== 'single') {
    return fail({ problem: 'quote-style', value: quote }, 'fmt', 'use --quote double or --quote single');
  }
  const endOfLine = single(tokens, 'end-of-line', 'lf');
  if (endOfLine !== 'lf' && endOfLine !== 'crlf' && endOfLine !== 'auto') {
    return fail({ problem: 'line-terminator', value: endOfLine }, 'fmt', 'use --end-of-line lf, crlf or auto');
  }
  const printWidth = number(tokens, 'print-width', 100);
  if (printWidth === undefined) return fail({ problem: 'print-width' }, 'fmt', 'e.g. --print-width 100');
  const tabWidth = number(tokens, 'tab-width', 2);
  if (tabWidth === undefined) return fail({ problem: 'tab-width' }, 'fmt', 'e.g. --tab-width 2');

  const opts: FmtOptions = {
    ...base,
    check: bool(tokens, 'check'),
    printWidth,
    tabWidth,
    useTabs: bool(tokens, 'use-tabs'),
    quote,
    endOfLine,
  };
  // No path is every `.fud` under the working directory: a formatter with no argument
  // formats the project, which is what every other one does and what CI will type.
  return { kind: 'fmt', paths: rest.length === 0 ? ['.'] : rest, opts, flags };
}

/**
 * `fudic translate` (SDD-58 §3.5): no argument and no option of its own — the languages are the
 * project's `locales`, and the files are the project's.
 */
function parseTranslate(tokens: Tokens, rest: readonly string[], base: Base, flags: GlobalFlags): ParsedCommand {
  const unknown = unknownFlag(tokens, [...GLOBAL, 'project'], 'translate');
  if (unknown !== null) return unknown;
  const extra = rest[0];
  if (extra !== undefined) {
    return fail(
      { problem: 'unexpected-argument', command: 'translate', value: extra },
      'translate',
      'it translates the app you are in, or the one --project names',
    );
  }
  return { kind: 'translate', opts: { ...base, ...target(tokens) }, flags };
}

/** `fudic dev` and `fudic preview` (BUG-50 §4.5): no argument; `--project` and `--port`. */
function parseServe(serve: ServeKind, tokens: Tokens, rest: readonly string[], base: Base, flags: GlobalFlags): ParsedCommand {
  const unknown = unknownFlag(tokens, [...GLOBAL, 'project', 'port'], serve);
  if (unknown !== null) return unknown;
  const extra = rest[0];
  if (extra !== undefined) {
    return fail({ problem: 'unexpected-argument', command: serve, value: extra }, serve, 'it serves the apps of the workspace, or the one --project names');
  }
  const port = number(tokens, 'port', FRONT_PORT[serve]);
  if (port === undefined) return fail({ problem: 'port' }, serve, `e.g. --port ${FRONT_PORT[serve]}`);
  return { kind: 'serve', serve, opts: { ...base, ...target(tokens), port }, flags };
}

/** `fudic test` and `fudic spec` (BUG-50 §3.1): no argument; `--project`. */
function parseCheck(check: CheckKind, tokens: Tokens, rest: readonly string[], base: Base, flags: GlobalFlags): ParsedCommand {
  const unknown = unknownFlag(tokens, [...GLOBAL, 'project'], check);
  if (unknown !== null) return unknown;
  const extra = rest[0];
  if (extra !== undefined) {
    return fail({ problem: 'unexpected-argument', command: check, value: extra }, check, 'it runs the project you are in, every project from the workspace root, or the one --project names');
  }
  return { kind: 'check', check, opts: { ...base, ...target(tokens) }, flags };
}

/** A numeric flag, or `undefined` when what was given is not one. */
function number(tokens: Tokens, name: string, fallback: number): number | undefined {
  const raw = single(tokens, name, String(fallback));
  const value = Number(raw);
  return Number.isFinite(value) ? value : undefined;
}

function parseNew(tokens: Tokens, rest: readonly string[], base: Base, flags: GlobalFlags): ParsedCommand {
  const unknown = unknownFlag(tokens, [...GLOBAL, 'pm', 'no-install', 'no-git', 'no-sw', 'layout', 'target', 'id', 'prefix', 'workspace', 'app'], 'new');
  if (unknown !== null) return unknown;

  const name = rest[0];
  if (name === undefined) return fail({ problem: 'new-needs-name' }, 'new', 'e.g. fudic new shop');

  const pm = single(tokens, 'pm', 'pnpm');
  if (pm !== 'pnpm' && pm !== 'npm' && pm !== 'yarn') {
    return fail({ problem: 'package-manager', value: pm }, 'new', 'use --pm pnpm, npm or yarn');
  }

  // A workspace's first app is named after the workspace unless `--app` says otherwise, and
  // the app's identity follows the APP — not the directory the monorepo happens to sit in.
  const workspace = bool(tokens, 'workspace');
  const app = single(tokens, 'app', name);

  const opts: NewOptions = {
    ...base,
    // The name the command was given, not the directory it lands in nor the npm name: the
    // two of those move, and an id that moves leaves caches nobody purges (§4.3).
    id: single(tokens, 'id', workspace ? app : name),
    prefix: single(tokens, 'prefix', prefixOf(workspace ? app : name)),
    pm: pm as PackageManager,
    install: !bool(tokens, 'no-install'),
    git: !bool(tokens, 'no-git'),
    sw: !bool(tokens, 'no-sw'),
    layout: single(tokens, 'layout', '_layout'),
    target: single(tokens, 'target', 'static'),
  };
  if (!workspace) return { kind: 'new', name, opts, flags };
  return { kind: 'workspace', name, opts: { ...opts, app }, flags };
}

function parseGenerate(tokens: Tokens, rest: readonly string[], base: Base, flags: GlobalFlags): ParsedCommand {
  const [written, name] = rest;
  if (written === undefined) {
    return fail({ problem: 'generate-needs-type' }, 'generate', `it generates: ${GENERATES}`);
  }
  // A unit test is not a piece of its own: it comes with the piece it tests (BUG-50 §6.8).
  if (written === 'test') {
    return fail(
      { problem: 'generate-test' },
      'generate',
      `a component comes with its unit test:   fudic g component ${name ?? 'button'}`,
      `it generates: ${GENERATES}`,
    );
  }
  const type = GENERATE_TYPES[written];
  if (type === undefined) {
    return fail({ problem: 'unknown-type', type: written }, 'generate', `it generates: ${GENERATES}`);
  }
  const topic: Topic = `generate ${type}`;
  if (name === undefined) {
    return fail({ problem: 'generate-needs-name', type }, topic, `e.g. fudic g ${type} ${EXAMPLE[type]}`);
  }

  switch (type) {
    case 'app': {
      const unknown = unknownFlag(tokens, [...GLOBAL, 'dir', 'id', 'prefix', 'no-sw', 'uses', 'base'], topic);
      if (unknown !== null) return unknown;
      const opts: AppOptions = {
        ...base,
        dir: single(tokens, 'dir', APPS_DIR),
        // Written because it was given, not calculated from the directory nor from the npm
        // name: both of those move, and a moved id leaves caches nobody purges (§4.4).
        id: single(tokens, 'id', name),
        prefix: single(tokens, 'prefix', prefixOf(name)),
        sw: !bool(tokens, 'no-sw'),
        uses: list(tokens, 'uses') ?? [],
        ...(tokens.flags.has('base') ? { base: single(tokens, 'base', '/') } : {}),
      };
      return { kind: 'app', name, opts, flags };
    }

    case 'lib': {
      const unknown = unknownFlag(tokens, [...GLOBAL, 'dir', 'prefix', 'uses'], topic);
      if (unknown !== null) return unknown;
      const opts: ProjectOptions = {
        ...base,
        dir: single(tokens, 'dir', LIBS_DIR),
        prefix: single(tokens, 'prefix', prefixOf(name)),
        uses: list(tokens, 'uses') ?? [],
      };
      return { kind: 'lib', name, opts, flags };
    }

    case 'component': {
      const unknown = unknownFlag(tokens, [...GLOBAL, 'project', 'dir', 'in', 'no-style', 'slot', 'skip-test', 'skip-spec'], topic);
      if (unknown !== null) return unknown;
      const opts: ComponentOptions = {
        ...base,
        ...target(tokens),
        dir: single(tokens, 'dir', COMPONENTS_DIR),
        wireInto: list(tokens, 'in') ?? [],
        style: !bool(tokens, 'no-style'),
        slot: bool(tokens, 'slot'),
        test: !bool(tokens, 'skip-test'),
        spec: !bool(tokens, 'skip-spec'),
      };
      return { kind: 'component', tag: name, opts, flags };
    }

    case 'page': {
      const unknown = unknownFlag(tokens, [...GLOBAL, 'project', 'dir', 'layout', 'no-layout', 'server', 'sections', 'skip-test'], topic);
      if (unknown !== null) return unknown;
      const forced = tokens.flags.get('layout')?.at(-1);
      const opts: PageOptions = {
        ...base,
        ...target(tokens),
        dir: single(tokens, 'dir', ROUTES_DIR),
        ...(bool(tokens, 'no-layout') ? { layout: null } : forced !== undefined ? { layout: forced } : {}),
        server: bool(tokens, 'server'),
        sections: list(tokens, 'sections'),
        test: !bool(tokens, 'skip-test'),
      };
      return { kind: 'page', route: name, opts, flags };
    }

    case 'layout': {
      const unknown = unknownFlag(tokens, [...GLOBAL, 'project', 'dir', 'sections', 'no-head', 'skip-test'], topic);
      if (unknown !== null) return unknown;
      const opts: LayoutOptions = {
        ...base,
        ...target(tokens),
        dir: single(tokens, 'dir', LAYOUTS_DIR),
        sections: list(tokens, 'sections') ?? [],
        head: !bool(tokens, 'no-head'),
        test: !bool(tokens, 'skip-test'),
      };
      return { kind: 'layout', name, opts, flags };
    }

    case 'spec': {
      const unknown = unknownFlag(tokens, [...GLOBAL, 'project'], topic);
      if (unknown !== null) return unknown;
      return { kind: 'spec', name, opts: { ...base, ...target(tokens) }, flags };
    }

    case 'term': {
      const unknown = unknownFlag(tokens, [...GLOBAL, 'project', 'param'], topic);
      if (unknown !== null) return unknown;
      // `g term <kind> <name>`: what the other generators call the name is the kind here.
      const term = rest[2];
      if (term === undefined) return fail({ problem: 'generate-needs-name', type }, topic, `e.g. fudic g term ${name} cart-has`);
      const opts: TermOptions = { ...base, ...target(tokens), block: name, params: tokens.flags.get('param') ?? [] };
      return { kind: 'term', name: term, opts, flags };
    }
  }
}
