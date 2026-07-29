/**
 * argv → a typed command (SDD-22 §4.1). NOTHING here prompts: no menus, no confirmations,
 * no "did you mean". A CLI that asks cannot go into a script, or CI, or a test, so a
 * missing argument is an exit code with the usage text, never a selector.
 */

import { cliError, FUD_USAGE } from './diagnostics.js';
import type {
  CliError,
  ComponentOptions,
  LayoutOptions,
  NewOptions,
  PackageManager,
  PageOptions,
} from './types.js';

export interface GlobalFlags {
  readonly dryRun: boolean;
  readonly json: boolean;
}

export type ParsedCommand =
  | { readonly kind: 'new'; readonly name: string; readonly opts: NewOptions; readonly flags: GlobalFlags }
  | { readonly kind: 'component'; readonly tag: string; readonly opts: ComponentOptions; readonly flags: GlobalFlags }
  | { readonly kind: 'page'; readonly route: string; readonly opts: PageOptions; readonly flags: GlobalFlags }
  | { readonly kind: 'layout'; readonly name: string; readonly opts: LayoutOptions; readonly flags: GlobalFlags }
  | { readonly kind: 'help' }
  | { readonly kind: 'error'; readonly error: CliError };

export const USAGE = `fudic — scaffolding for Declarative Shadow DOM apps

  fudic new <name>              create a project
  fudic generate <type> <name>  add a piece                     (alias: g)
    fudic g page <route>                                        (alias: p)
    fudic g component <tag>                                     (alias: c)
    fudic g layout <name>                                       (alias: l)

Global flags
  --dry-run          print the plan and exit; writes nothing
  --force, -f        overwrite existing targets
  --cwd <path>       project root to operate on          (default: .)
  --json             serialize the plan to stdout; human output goes to stderr

fudic new
  --pm <pnpm|npm|yarn>   package manager                 (default: pnpm)
  --no-install           do not install dependencies
  --no-git               do not run git init and the initial commit
  --no-sw                do not write sw.json (no Service Worker)
  --layout <name>        initial layout name             (default: _layout)
  --target <name>        deployment adapter              (default: static)

fudic g component <tag>
  --dir <path>       target directory                    (default: components)
  --in <file>        wire <link rel="component"> into <file>; repeatable
  --no-style         omit the <head> with the component's <style>
  --slot             emit <slot></slot> in the markup

fudic g page <route>
  --dir <path>       target directory                    (default: routes)
  --layout <path>    force a layout
  --no-layout        standalone page (full document)
  --server           emit @code { @server { load() } }
  --sections <a,b>   subset of the layout's sections     (default: all)

fudic g layout <name>
  --dir <path>       target directory                    (default: layouts)
  --sections <a,b>   one @RenderSection(name) per name
  --no-head          omit @RenderHead()
`;

interface Tokens {
  readonly positionals: readonly string[];
  readonly flags: ReadonlyMap<string, readonly string[]>;
  readonly error?: CliError;
}

/** `--flag value`, `--flag=value` and `--boolean`. Repeated flags accumulate. */
function tokenize(argv: readonly string[]): Tokens {
  const positionals: string[] = [];
  const flags = new Map<string, string[]>();
  const valued = new Set(['cwd', 'pm', 'layout', 'target', 'dir', 'in', 'sections']);

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
    if (value === undefined || value.startsWith('-')) {
      return { positionals, flags, error: cliError(FUD_USAGE, `flag --${name} needs a value`) };
    }
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

/** Any flag outside the accepted set is an error, never a silent no-op. */
function unknownFlag(tokens: Tokens, accepted: readonly string[]): CliError | null {
  for (const name of tokens.flags.keys()) {
    if (!accepted.includes(name)) return cliError(FUD_USAGE, `unknown flag --${name}`);
  }
  return null;
}

const GLOBAL = ['dry-run', 'force', 'cwd', 'json', 'help'];

export function parseArgs(argv: readonly string[]): ParsedCommand {
  const tokens = tokenize(argv);
  if (tokens.error !== undefined) return { kind: 'error', error: tokens.error };
  if (bool(tokens, 'help') || tokens.positionals.length === 0) return { kind: 'help' };

  const flags: GlobalFlags = { dryRun: bool(tokens, 'dry-run'), json: bool(tokens, 'json') };
  const cwd = single(tokens, 'cwd', '.');
  const force = bool(tokens, 'force');
  const [command, ...rest] = tokens.positionals;

  if (command === 'new') return parseNew(tokens, rest, { cwd, force }, flags);
  if (command === 'generate' || command === 'g') return parseGenerate(tokens, rest, { cwd, force }, flags);
  return { kind: 'error', error: cliError(FUD_USAGE, `unknown command "${command ?? ''}"`) };
}

interface Base {
  readonly cwd: string;
  readonly force: boolean;
}

function parseNew(tokens: Tokens, rest: readonly string[], base: Base, flags: GlobalFlags): ParsedCommand {
  const unknown = unknownFlag(tokens, [...GLOBAL, 'pm', 'no-install', 'no-git', 'no-sw', 'layout', 'target']);
  if (unknown !== null) return { kind: 'error', error: unknown };

  const name = rest[0];
  if (name === undefined) return { kind: 'error', error: cliError(FUD_USAGE, 'fudic new needs a project name') };

  const pm = single(tokens, 'pm', 'pnpm');
  if (pm !== 'pnpm' && pm !== 'npm' && pm !== 'yarn') {
    return { kind: 'error', error: cliError(FUD_USAGE, `unknown package manager "${pm}"`) };
  }

  const opts: NewOptions = {
    ...base,
    pm: pm as PackageManager,
    install: !bool(tokens, 'no-install'),
    git: !bool(tokens, 'no-git'),
    sw: !bool(tokens, 'no-sw'),
    layout: single(tokens, 'layout', '_layout'),
    target: single(tokens, 'target', 'static'),
  };
  return { kind: 'new', name, opts, flags };
}

function parseGenerate(tokens: Tokens, rest: readonly string[], base: Base, flags: GlobalFlags): ParsedCommand {
  const [type, name] = rest;
  if (type === undefined) {
    return { kind: 'error', error: cliError(FUD_USAGE, 'fudic g needs a type: page (p), component (c) or layout (l)') };
  }
  if (name === undefined) return { kind: 'error', error: cliError(FUD_USAGE, `fudic g ${type} needs a name`) };

  if (type === 'component' || type === 'c') {
    const unknown = unknownFlag(tokens, [...GLOBAL, 'dir', 'in', 'no-style', 'slot']);
    if (unknown !== null) return { kind: 'error', error: unknown };
    const opts: ComponentOptions = {
      ...base,
      dir: single(tokens, 'dir', 'components'),
      wireInto: list(tokens, 'in') ?? [],
      style: !bool(tokens, 'no-style'),
      slot: bool(tokens, 'slot'),
    };
    return { kind: 'component', tag: name, opts, flags };
  }

  if (type === 'page' || type === 'p') {
    const unknown = unknownFlag(tokens, [...GLOBAL, 'dir', 'layout', 'no-layout', 'server', 'sections']);
    if (unknown !== null) return { kind: 'error', error: unknown };
    const forced = tokens.flags.get('layout')?.at(-1);
    const opts: PageOptions = {
      ...base,
      dir: single(tokens, 'dir', 'routes'),
      ...(bool(tokens, 'no-layout') ? { layout: null } : forced !== undefined ? { layout: forced } : {}),
      server: bool(tokens, 'server'),
      sections: list(tokens, 'sections'),
    };
    return { kind: 'page', route: name, opts, flags };
  }

  if (type === 'layout' || type === 'l') {
    const unknown = unknownFlag(tokens, [...GLOBAL, 'dir', 'sections', 'no-head']);
    if (unknown !== null) return { kind: 'error', error: unknown };
    const opts: LayoutOptions = {
      ...base,
      dir: single(tokens, 'dir', 'layouts'),
      sections: list(tokens, 'sections') ?? [],
      head: !bool(tokens, 'no-head'),
    };
    return { kind: 'layout', name, opts, flags };
  }

  return { kind: 'error', error: cliError(FUD_USAGE, `unknown type "${type}": expected page, component or layout`) };
}
