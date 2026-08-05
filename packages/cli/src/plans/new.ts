/**
 * `fudic new <nombre>` (SDD-22 §6.1): a tree that builds. Layout + root route wired
 * against it with `<link rel="layout">`, the Vite config, and `sw.json` unless `--no-sw` —
 * the Service Worker itself is NOT a user file: the plugin emits `fudic-sw.js`, and the
 * project only declares the policy (SDD-20 §4.7).
 */

import { GLOBALS_DTS, GLOBALS_FILE_NAME } from '@fudic/language-core';
import { cliError, FUD_ADAPTER_UNAVAILABLE, FUD_TARGET_EXISTS } from '../diagnostics.js';
import { absolute, hrefBetween, joinPosix } from '../paths.js';
import { LAYOUTS_DIR } from '../layout.js';
import { FUDIC_VERSION, TYPESCRIPT_VERSION, VITE_VERSION } from '../project.js';
import { renderSectionBlocks, renderTemplate } from '../templates.js';
import { nodeReadIo, type ReadIo } from '../io.js';
import type { CliError, FileChange, NewOptions, Plan, PlanCommand } from '../types.js';

const ROUTES_DIR = 'routes';
const COMPONENTS_DIR = 'components';

/** The only adapter that exists: none. Anything else is rejected, never ignored (§4.6). */
const AVAILABLE_TARGETS = ['static'];

export function planNew(name: string, opts: NewOptions, io: ReadIo = nodeReadIo()): Promise<Plan> {
  if (!AVAILABLE_TARGETS.includes(opts.target)) {
    return Promise.resolve({
      changes: [],
      commands: [],
      diagnostics: [],
      errors: [
        cliError(
          FUD_ADAPTER_UNAVAILABLE,
          `adapter '${opts.target}' is not available; installed adapters: ${AVAILABLE_TARGETS.join(', ')}`,
        ),
      ],
    });
  }

  const root = absolute(opts.cwd, name);
  if (io.exists(root) && io.list(root).length > 0 && !opts.force) {
    return Promise.resolve({
      changes: [],
      commands: [],
      diagnostics: [],
      errors: [cliError(FUD_TARGET_EXISTS, `${name} already exists and is not empty; pass --force to overwrite`, name)],
    });
  }

  const layoutFile = joinPosix(name, LAYOUTS_DIR, `${opts.layout}.fud`);
  const indexFile = joinPosix(name, ROUTES_DIR, 'index.fud');

  const files: readonly (readonly [string, string])[] = [
    [
      joinPosix(name, 'package.json'),
      renderTemplate('package.json.tmpl', {
        name,
        version: FUDIC_VERSION,
        viteVersion: VITE_VERSION,
        tsVersion: TYPESCRIPT_VERSION,
      }),
    ],
    [joinPosix(name, 'vite.config.ts'), renderTemplate('vite.config.ts.tmpl', { routesDir: ROUTES_DIR })],
    [
      joinPosix(name, 'README.md'),
      renderTemplate('README.md.tmpl', {
        name,
        pm: opts.pm,
        layout: opts.layout,
        layoutsDir: LAYOUTS_DIR,
        routesDir: ROUTES_DIR,
        componentsDir: COMPONENTS_DIR,
      }),
    ],
    [joinPosix(name, '.gitignore'), renderTemplate('gitignore.tmpl', {})],
    [joinPosix(name, 'tsconfig.json'), renderTemplate('tsconfig.json.tmpl', {})],
    // The ambient declarations the templates are typed against. Written from the same
    // constant the language server mounts in memory (SDD-23 §3.3), so the editor and `tsc`
    // can never disagree about what `props<T>()` or `$text` mean. Generated, hence the
    // "do not edit" banner the constant carries.
    [joinPosix(name, GLOBALS_FILE_NAME), GLOBALS_DTS],
    ...(opts.sw ? ([[joinPosix(name, 'sw.json'), renderTemplate('sw.json.tmpl', {})]] as const) : []),
    [layoutFile, renderTemplate('layout.fud', { lang: 'en', renderHead: '    @RenderHead()', sections: renderSectionBlocks([]) })],
    [
      indexFile,
      renderTemplate('route.fud', {
        layoutHref: hrefBetween(indexFile, layoutFile),
        code: '',
        title: 'Home',
        sections: '',
      }),
    ],
  ];

  const changes: FileChange[] = [];
  const errors: CliError[] = [];
  for (const [file, contents] of files) {
    const path = absolute(opts.cwd, file);
    if (io.exists(path)) {
      if (!opts.force) {
        errors.push(cliError(FUD_TARGET_EXISTS, `${file} already exists; pass --force to overwrite`, file));
        continue;
      }
      changes.push({ kind: 'modify', path: file, contents, before: io.read(path) });
      continue;
    }
    changes.push({ kind: 'create', path: file, contents });
  }

  const commands: PlanCommand[] = [];
  if (opts.install) commands.push({ command: opts.pm, args: ['install'], dir: name });
  if (opts.git) {
    // `-b main`, not a bare `git init`: without it the branch is whatever `init.defaultBranch`
    // happens to be, which is `master` when nobody configured one. The scaffold has an opinion.
    commands.push({ command: 'git', args: ['init', '-b', 'main'], dir: name });
    commands.push({ command: 'git', args: ['add', '-A'], dir: name });
    commands.push({ command: 'git', args: ['commit', '-m', 'chore: scaffold fudic app'], dir: name });
  }

  return Promise.resolve({ changes, commands, diagnostics: [], errors });
}
