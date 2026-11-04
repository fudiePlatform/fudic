/**
 * `fudic_symbols`, `fudic_describe` and `fudic_contract`: what exists in the project, as the
 * editor knows it — never read off the files by the chat, which would get it wrong.
 */

import { existsSync, readFileSync } from 'node:fs';
import { relative } from 'node:path';
import { FUD1404, FUD1405 } from '@fudic/diagnostics';
import type { Description, Handler, Place, ProjectSymbol, SymbolKind } from '@fudic/language-server/project';
import { closest } from '@fudic/spec';
import { readApiProject } from '@fudic/typecheck/api';
import { API_TYPES_DIR, BROWSER_DIR, SERVER_DIR } from '@fudic/conventions';
import type { Checks } from './checks.js';
import { placeOf } from './diagnostics.js';
import { packageDir } from './fudic.js';
import { within } from './locate.js';
import { isFudicProject, type Project } from './project.js';
import { read, type Answer } from './respond.js';

function posix(path: string): string {
  return path.replace(/\\/gu, '/');
}

/**
 * A place as an answer carries it: `at`, never a span. A file of a library is named by its
 * package — `@acme/ui/src/card.fud:3:1` —, which is how the project reaches it, not by a path
 * that climbs out of the project.
 */
function at(place: Place, root: string, from?: string | null): string | undefined {
  const where = placeOf(place, root, read).at;
  if (where === undefined || within(root, place.file) || from === undefined || from === null) return where;
  const dir = packageDir(from, root);
  if (dir === undefined) return where;
  const inside = posix(relative(dir, place.file));
  return `${from}/${where.replace(/^[^:]*/u, inside)}`;
}

/** A symbol without its span and its absolute file. */
function shown(symbol: ProjectSymbol, root: string): Readonly<Record<string, unknown>> {
  const { file: _file, span: _span, ...rest } = symbol;
  return { ...rest, at: at(symbol, root, symbol.from) };
}

function notAProject(project: Project): Answer {
  return { body: {}, diagnostics: [FUD1404({ folder: project.root })], failed: true };
}

export async function listSymbols(project: Project, checks: Checks, kind?: SymbolKind): Promise<Answer> {
  if (!isFudicProject(project.root)) return notAProject(project);
  await checks.run();
  const symbols = (await checks.service()).symbols(kind);
  const missing = symbols.find((s) => s.state === 'missing');
  const id = missing === undefined ? undefined : idOf(missing, project.root);
  return {
    body: { symbols: symbols.map((s) => shown(s, project.root)) },
    next: id === undefined ? null : `${missing!.name} has no handler yet: fudic_contract { id: "${id}" } says what to write.`,
  };
}

/** The `<id>` of the `.fudapi` a symbol is declared in. */
function idOf(symbol: ProjectSymbol, root: string): string | undefined {
  const source = readApiProject(root).byPath.get(posix(symbol.file));
  return source?.id;
}

/** A description with its places as `at`. */
function describedBody(description: Description, root: string): Readonly<Record<string, unknown>> {
  const { file: _file, span: _span, ...rest } = description;
  const base = { ...rest, at: at(description, root, 'from' in description ? description.from : null) };
  if (description.kind === 'component') return { ...base, usedIn: description.usedIn.map((use) => at(use, root)) };
  if (description.kind === 'route') {
    return { ...base, ...(description.api !== undefined ? { api: posix(relative(root, description.api)) } : {}) };
  }
  if ('implementedIn' in description && description.implementedIn !== undefined) {
    return { ...base, implementedIn: description.implementedIn.map((place) => at(place, root)) };
  }
  return base;
}

export async function describeName(project: Project, checks: Checks, name: string): Promise<Answer> {
  if (!isFudicProject(project.root)) return notAProject(project);
  await checks.run();
  const service = await checks.service();
  const description = service.describe(name);
  if (description === undefined) {
    const near = closest(name, service.names());
    return { body: { name }, diagnostics: [FUD1405({ name, ...(near !== undefined ? { closest: near } : {}) })], failed: true };
  }
  const fill = description.kind === 'component' ? description.example.fill : [];
  return {
    body: describedBody(description, project.root),
    next: fill.length === 0 ? null : `The example leaves ${fill.join(', ')} for you: no value of its type compiles on its own.`,
  };
}

/** Where the handler of a piece goes: a pipe beside its `.fudapi`; the browser for what runs there. */
function fileFor(handler: Handler, id: string, apiPath: string, root: string, folders: { server: string; browser: string }): string {
  if (handler.kind === 'pipe') return posix(relative(root, `${apiPath.slice(0, -'.fudapi'.length)}.ts`));
  const browser = handler.methods.includes('client') || (handler.kind === 'rule' && handler.runs !== 'server');
  return `${browser ? folders.browser : folders.server}/${id}.ts`;
}

/** The lines of the generated `.d.ts` that type what `fudic:<id>` exports as `name`: its doc, its types, its const. */
export function signatureOf(types: string, name: string): string | undefined {
  const lines = types.split('\n');
  const end = lines.findIndex((line) => new RegExp(`^\\s*export const ${name}\\b`, 'u').test(line));
  if (end === -1) return undefined;
  let start = end;
  while (start > 0 && lines[start - 1]!.trim() !== '' && !lines[start - 1]!.includes('declare module')) start--;
  return lines
    .slice(start, end + 1)
    .map((line) => line.replace(/^ {2}/u, ''))
    .join('\n');
}

/** What a missing handler is written as: a call that compiles, and says it is not done. */
function callOf(handler: Handler, method: string): string {
  const body = `() => {\n  throw new Error('${handler.name}: not written yet');\n}`;
  return handler.kind === 'pipe' ? `export default ${handler.exported}.implement(${body});` : `${handler.exported}.${method}(${body});`;
}

/** The folders of handlers, from `fudic.json` or the defaults. */
function foldersOf(root: string): { server: string; browser: string } {
  try {
    const config = JSON.parse(readFileSync(`${root}/fudic.json`, 'utf8')) as { server?: unknown; browser?: unknown };
    return {
      server: typeof config.server === 'string' ? config.server : SERVER_DIR,
      browser: typeof config.browser === 'string' ? config.browser : BROWSER_DIR,
    };
  } catch {
    return { server: SERVER_DIR, browser: BROWSER_DIR }; // without a readable fudic.json, the defaults
  }
}

export async function contractOf(project: Project, checks: Checks, id: string): Promise<Answer> {
  if (!isFudicProject(project.root)) return notAProject(project);
  // The check writes `.fudic/api` first: the signatures below are read from there.
  await checks.run();
  const handlers = (await checks.service()).handlers(id);
  const api = readApiProject(project.root);
  const source = api.byId.get(id);
  if (handlers === undefined || source === undefined) {
    const near = closest(id, api.sources.filter((s) => s.origin === 'app').map((s) => s.id));
    return { body: { id }, diagnostics: [FUD1405({ name: id, ...(near !== undefined ? { closest: near } : {}) })], failed: true };
  }
  const typesFile = `${project.root}/${API_TYPES_DIR}/${id}.d.ts`;
  const types = existsSync(typesFile) ? readFileSync(typesFile, 'utf8') : '';
  const folders = foldersOf(project.root);
  const pieces = handlers.map((handler) => ({
    name: handler.name,
    exported: handler.exported,
    state: handler.state,
    file: fileFor(handler, id, source.path, project.root, folders),
    signature: signatureOf(types, handler.exported) ?? null,
    implementedIn: handler.implementedIn.map((file) => posix(relative(project.root, file))),
  }));
  // One skeleton per file, with what is still missing in it: written as is, it compiles.
  const skeletons = new Map<string, string[]>();
  for (const [i, handler] of handlers.entries()) {
    if (handler.state === 'connected') continue;
    const file = pieces[i]!.file;
    const calls = skeletons.get(file) ?? [];
    for (const method of handler.methods) calls.push(callOf(handler, method));
    skeletons.set(file, calls);
  }
  const skeleton = [...skeletons].map(([file, calls]) => {
    const names = [...new Set(handlers.filter((h, i) => pieces[i]!.file === file && h.state === 'missing').map((h) => h.exported))];
    // A file that is already there gets the calls added, not replaced: it may hold other handlers.
    const exists = existsSync(`${project.root}/${file}`);
    return { file, exists, text: `import { ${names.join(', ')} } from 'fudic:${id}';\n\n${calls.join('\n\n')}\n` };
  });
  return {
    body: { id, handlers: pieces, skeleton },
    next:
      skeleton.length === 0
        ? null
        : `Write the skeleton in ${skeleton.map((s) => s.file).join(' and ')} (add to a file that exists), then replace each throw with the real code and run fudic_check.`,
  };
}
