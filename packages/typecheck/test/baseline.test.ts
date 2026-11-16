/**
 * SDD-83 §3.6 and §4.5, criteria 22–25 — the TS detector, through the project checker over a real
 * project on disk: the program the build hands over.
 *
 * TypeScript 6 is the one checked with: its `lib.dom` declares `URLPattern`, which 5.9's does not,
 * and only what the `lib` declares is the browser's (§3.6).
 */

import { describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import type ts from 'typescript';
import ts6 from 'typescript-6';
import {
  baselineContextOf,
  browserModules,
  createProjectChecker,
  fudBaselineUses,
  moduleBaselineUses,
  parseSource,
  projectParsed,
  toPosix,
  type CheckReport,
} from '../src/index.js';
import { indexOf } from './_support.js';

const TSCONFIG = JSON.stringify({
  compilerOptions: {
    target: 'ES2024',
    module: 'ESNext',
    moduleResolution: 'bundler',
    strict: true,
    skipLibCheck: true,
    lib: ['ES2024', 'DOM'],
  },
  include: ['**/*.ts', '**/*.fud'],
});

function project(files: Readonly<Record<string, string>>): string {
  const root = toPosix(mkdtempSync(join(tmpdir(), 'fudic-baseline-')));
  for (const [relative, text] of Object.entries({ 'tsconfig.json': TSCONFIG, ...files })) {
    const file = join(root, relative);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, text);
  }
  return root;
}

function component(name: string, code: string): string {
  return `@code {\n${code}\n}\n<app-${name}>\n  <template shadowrootmode="open"><p>x</p></template>\n</app-${name}>\n`;
}

/** Each form of §3.6, one per line, the guards after the bare uses. */
const USES = `import { used } from '../lib/used';
const el = document.createElement('div');
el.showPopover();
el.addEventListener('beforetoggle', () => {});
const ready = Promise.withResolvers<void>();
const pattern = new URLPattern({ pathname: '/x' });
requestIdleCallback(() => {});
used();
class Mine { showPopover(): void {} }
new Mine().showPopover();
if ('showPopover' in el) el.showPopover();
if (typeof URLPattern === 'function') new URLPattern({});
const later = typeof URLPattern !== 'undefined' ? new URLPattern({}) : null;
el.showPopover !== undefined && el.showPopover();
el.showPopover?.();
if (el.hidePopover) el.hidePopover();
if ('other' in el) el.togglePopover();
el.addEventListener('notanevent', () => {});
if (el['hidePopover']) el.hidePopover();
window.requestIdleCallback(() => {});
(el as HTMLElement & { extra: 1 }).togglePopover();
function guarded(): void {
  if (!('togglePopover' in el)) return;
  el.togglePopover();
}
function thrown(): void {
  if (typeof requestIdleCallback === 'undefined') { throw new Error('no'); }
  requestIdleCallback(() => {});
}
export { ready, pattern, later, guarded, thrown };`;

const FILES = {
  'fudic.json': JSON.stringify({ id: 't', baseline: 2022 }),
  'src/components/app-a.fud': component('a', USES),
  'src/lib/used.ts': "export function used(): void { document.createElement('div').showPopover(); }\n",
  'src/lib/unused.ts': "export function unused(): void { document.createElement('div').showPopover(); }\n",
  'src/browser/b.ts': USES,
  'src/components/app-b.fud': '<app-b>\n  <template shadowrootmode="open"><p>b</p></template>\n</app-b>\n',
  'src/components/app-c.fud': component('c', 'const x = ;'),
  // The declaration of `props<…>()` is rewritten whole: what it holds has no node in the program.
  'src/components/app-d.fud': component('d', 'const { box } = props<{ box: HTMLElement }>(), late = box.showPopover();\nprops<{ box: HTMLElement }>().box.showPopover();'),
  'src/server/s.ts': "export function s(): void { requestIdleCallback(() => {}); }\n",
};

const ROOT = project(FILES);
const checker = createProjectChecker({ root: ROOT, typescript: ts6 as unknown as typeof ts });
const report: CheckReport = checker.check();

/** The `FUD1524` the check reports on `relative`, as `text-under-it key`. */
function warned(relative: string, over: CheckReport = report): readonly string[] {
  const source = FILES[relative as keyof typeof FILES];
  return over.problems
    .filter((p) => p.file === `${ROOT}/${relative}` && p.code === 'FUD1524')
    .map((p) => `${source.slice(p.span.start, p.span.end)} ${/\(([^)]+)\)/u.exec(p.message)![1]}`);
}

describe('the keys of the browser’s code (criterion 22)', () => {
  it('each form reads as its key, and a method of the author with the same name does not', () => {
    const program = checker.languageService()!.getProgram()!;
    // Everything of the browser is read; what is old passes the judge and is left out here.
    const old = new Set(['createElement', 'document', 'addEventListener', 'Promise', 'Error', 'window']);
    const uses = moduleBaselineUses(program, `${ROOT}/src/browser/b.ts`)
      .filter((u) => !old.has(u.name))
      .map((u) => `${u.name} ${u.key}`);
    expect(uses).toEqual([
      'showPopover api.HTMLElement.showPopover',
      "'beforetoggle' api.HTMLElement.beforetoggle_event",
      'withResolvers javascript.builtins.Promise.withResolvers',
      'URLPattern api.URLPattern.URLPattern',
      'requestIdleCallback api.Window.requestIdleCallback',
      'togglePopover api.HTMLElement.togglePopover',
      'requestIdleCallback api.Window.requestIdleCallback',
      'togglePopover api.HTMLElement.togglePopover',
    ]);
  });
});

describe('what the check reports (criteria 22 and 23)', () => {
  const expected = [
    'showPopover api.HTMLElement.showPopover',
    "'beforetoggle' api.HTMLElement.beforetoggle_event",
    'URLPattern api.URLPattern.URLPattern',
    'requestIdleCallback api.Window.requestIdleCallback',
    'togglePopover api.HTMLElement.togglePopover',
    // `window.requestIdleCallback`, through `Window & typeof globalThis`, and a member read through an
    // intersection with a type of no name.
    'requestIdleCallback api.Window.requestIdleCallback',
    'togglePopover api.HTMLElement.togglePopover',
  ];

  it('in the @code of a .fud, on the .fud; every guard of §3.6 silences, a test of another name does not', () => {
    expect(warned('src/components/app-a.fud')).toEqual(expected);
  });

  it('in the browser folder and in what the browser imports; not in what nothing imports', () => {
    expect(warned('src/browser/b.ts')).toEqual(expected);
    expect(warned('src/lib/used.ts')).toEqual(['showPopover api.HTMLElement.showPopover']);
    expect(warned('src/lib/unused.ts')).toEqual([]);
  });

  it('src/server runs in Node and is not looked at (criterion 24)', () => {
    expect(warned('src/server/s.ts')).toEqual([]);
  });

  it('a .fud with no @code, one whose @code does not parse, and a receiver the projection rewrites', () => {
    expect(warned('src/components/app-b.fud')).toEqual([]);
    expect(warned('src/components/app-c.fud')).toEqual([]);
    // `props<…>()` is rewritten: the receiver has no node, and the interface that declares the member answers.
    expect(warned('src/components/app-d.fud')).toEqual(['showPopover api.HTMLElement.showPopover']);
  });

  it('a file the program does not have reads as nothing', () => {
    const program = checker.languageService()!.getProgram()!;
    expect(moduleBaselineUses(program, '/nowhere/x.ts')).toEqual([]);
    const elsewhere = projectParsed('/nowhere/app-z.fud', parseSource(FILES['src/components/app-b.fud']), indexOf({}));
    expect(fudBaselineUses(program, elsewhere)).toEqual([]);
    expect(browserModules(ts6 as unknown as typeof ts, program, ['/nowhere/x.ts'], ROOT, `${ROOT}/src/server`)).toEqual([]);
  });
});

describe('the level of the project', () => {
  it('without baseline, widely: popover passes and only what is newer warns', () => {
    const root = project({ ...FILES, 'fudic.json': JSON.stringify({ id: 't' }) });
    const widely = createProjectChecker({ root, typescript: ts6 as unknown as typeof ts }).check();
    const at = (relative: string): readonly string[] =>
      widely.problems.filter((p) => p.file === `${root}/${relative}` && p.code === 'FUD1524').map((p) => p.message.split(' ')[0]!);
    expect(at('src/browser/b.ts')).toEqual(['`URLPattern`', '`requestIdleCallback`', '`requestIdleCallback`']);
  });

  it('what a fudic.json says becomes the judge’s context', () => {
    expect(baselineContextOf(null)).toEqual({ target: 'widely', allow: new Set() });
  });

  it('a fud-disable in a module silences its line', () => {
    const silenced = USES.replace('requestIdleCallback(() => {});\nused();', '// fud-disable-next-line FUD1524: polyfilled\nrequestIdleCallback(() => {});\nused();');
    const root = project({ ...FILES, 'src/browser/b.ts': silenced });
    const over = createProjectChecker({ root, typescript: ts6 as unknown as typeof ts }).check();
    const keys = over.problems.filter((p) => p.file === `${root}/src/browser/b.ts` && p.code === 'FUD1524').map((p) => p.message.split(' ')[0]);
    expect(keys).toEqual(['`showPopover`', "`'beforetoggle'`", '`URLPattern`', '`togglePopover`', '`requestIdleCallback`', '`togglePopover`']);
  });
});

describe('what fudic puts (criterion 25)', () => {
  it('an app with a form control and no baseline gives no warning of Baseline', () => {
    const control = `@code {
  import type { Control } from '@fudic/forms';
  const { ctrl } = props<{ ctrl: Control<string> }>();
}
<app-field>
  <template shadowrootmode="open" formassociated shadowrootreferencetarget="campo"><input id="campo"></template>
</app-field>
`;
    const root = project({ 'fudic.json': JSON.stringify({ id: 'f' }), 'src/components/app-field.fud': control });
    const over = createProjectChecker({ root, typescript: ts6 as unknown as typeof ts }).check();
    expect(over.problems.filter((p) => p.code === 'FUD1524')).toEqual([]);
  });
});
