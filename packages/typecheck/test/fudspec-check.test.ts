/**
 * SDD-77 §3.6, §8.2.8 and criterion 5 on the check's side: every `.fudspec` of the project is
 * parsed and validated in `check()`, against the same context the editor uses, and its problems
 * come in the same report and the same order as the rest.
 */

import { mkdirSync, mkdtempSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { LineMap } from '@fudic/diagnostics';
import { createProjectChecker, nodeFileSystem, toPosix, type CheckFs, type CheckReport } from '../src/index.js';

const TSCONFIG = JSON.stringify({
  compilerOptions: { target: 'ES2024', module: 'ESNext', moduleResolution: 'bundler', strict: true, skipLibCheck: true },
  include: ['src/**/*.fud'],
});

const CARD = (props: string): string =>
  `@code {\n  const { title } = props<{ ${props} }>();\n}\n\n<app-card>\n  <template shadowrootmode="open">\n    <h2>@title</h2>\n  </template>\n</app-card>\n`;

const TERM = "export const meta = { name: 'shown', block: 'then', params: [] };\nexport async function run(ctx) {}\nexport const selfTest = [];\n";

const SPEC = 'component app-card\n\ncriterion shows-the-title\n  then\n    shown\n';

type Files = Readonly<Record<string, string>>;

function write(root: string, files: Files): void {
  for (const [relative, text] of Object.entries(files)) {
    const file = join(root, relative);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, text);
  }
}

function project(files: Files): string {
  const root = toPosix(mkdtempSync(join(tmpdir(), 'fudic-spec-check-')));
  write(root, {
    'tsconfig.json': TSCONFIG,
    'src/components/app-card/app-card.fud': CARD('title: string'),
    'fudic/terms/then/shown.js': TERM,
    ...files,
  });
  return root;
}

const SPEC_FILE = 'src/components/app-card/app-card.fudspec';

const shown = (report: CheckReport, root: string): string[] => report.problems.map((p) => `${p.file.slice(root.length + 1)} ${p.code}`);

describe('the .fudspec of a project in check()', () => {
  it('a criterion with no props for a component that requires some: FUD0951, naming them', () => {
    const root = project({ [SPEC_FILE]: SPEC });
    try {
      const report = createProjectChecker({ root }).check();
      expect(shown(report, root)).toEqual([`${SPEC_FILE} FUD0951`]);
      const problem = report.problems[0]!;
      expect(problem.severity).toBe('error');
      expect(problem.message).toContain('<app-card> has required props [title]');
      // On the criterion's name, as the editor marks it.
      expect(new LineMap(SPEC).positionAt(problem.span.start)).toEqual({ line: 2, character: 10 });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('a term that does not exist: its code at its place, once', () => {
    const root = project({ 'src/components/app-card/app-card.fud': CARD('title?: string'), [SPEC_FILE]: SPEC.replace('    shown', '    nowhere') });
    try {
      const report = createProjectChecker({ root }).check();
      expect(shown(report, root)).toEqual([`${SPEC_FILE} FUD0940`]);
      expect(SPEC.replace('    shown', '    nowhere').slice(report.problems[0]!.span.start, report.problems[0]!.span.end)).toBe('nowhere');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('a sound .fudspec says nothing; its file, its term and the fixture it read are inputs', () => {
    const fixture = 'src/components/app-card/app-card.fixture.ts';
    const spec = 'component app-card\n\ncriterion shows-the-title\n  given\n    props long\n  then\n    shown\n';
    const root = project({ [SPEC_FILE]: spec, [fixture]: 'export default {\n  long: { title: "A long title" },\n};\n' });
    try {
      const report = createProjectChecker({ root }).check();
      expect(report.problems).toEqual([]);
      expect(report.inputs).toEqual(expect.arrayContaining([`${root}/${SPEC_FILE}`, `${root}/fudic/terms/then/shown.js`, `${root}/${fixture}`]));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('a tag no file defines: no component, and no props asked for', () => {
    const root = project({ [SPEC_FILE]: SPEC.replace('component app-card', 'component app-none') });
    try {
      const codes = createProjectChecker({ root }).check().problems.map((p) => p.code);
      expect(codes).not.toContain('FUD0951');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('a .fudspec that does not parse: its parse problems', () => {
    const root = project({ [SPEC_FILE]: 'criterion\n' });
    try {
      const report = createProjectChecker({ root }).check();
      expect(report.problems.length).toBeGreaterThan(0);
      expect(report.problems.every((p) => p.file === `${root}/${SPEC_FILE}`)).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('in path order, with the problems of the .fud', () => {
    const root = project({
      [SPEC_FILE]: SPEC,
      'src/components/app-tag/app-tag.fud': CARD('title: string').replaceAll('app-card', 'app-tag').replace('@title', '@(title.nope)'),
      'src/components/app-tag/app-tag.fudspec': SPEC.replace('app-card', 'app-tag'),
    });
    try {
      expect(shown(createProjectChecker({ root }).check(), root)).toEqual([
        `${SPEC_FILE} FUD0951`,
        'src/components/app-tag/app-tag.fud TS2339',
        'src/components/app-tag/app-tag.fudspec FUD0951',
      ]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('read again on every check: a contract that changes changes the answer', () => {
    const root = project({ [SPEC_FILE]: SPEC });
    try {
      const checker = createProjectChecker({ root });
      expect(shown(checker.check(), root)).toEqual([`${SPEC_FILE} FUD0951`]);
      // The same text: the same answer, from what was kept.
      expect(shown(checker.check(), root)).toEqual([`${SPEC_FILE} FUD0951`]);
      write(root, { 'src/components/app-card/app-card.fud': CARD('title?: string') });
      checker.invalidate(`${root}/src/components/app-card/app-card.fud`);
      expect(checker.check().problems).toEqual([]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('what the disk says now: a component that became a page, or went, is no component to name', () => {
    const root = project({ [SPEC_FILE]: SPEC });
    try {
      const checker = createProjectChecker({ root });
      expect(shown(checker.check(), root)).toEqual([`${SPEC_FILE} FUD0951`]);
      // Nobody said so to the index: the criteria read the file as it is.
      write(root, { 'src/components/app-card/app-card.fud': '<!DOCTYPE html>\n<html>\n<head><title>t</title></head>\n<body></body>\n</html>\n' });
      const asPage = checker.check().problems.filter((p) => p.file.endsWith('.fudspec'));
      expect(asPage.map((p) => p.code)).not.toContain('FUD0951');
      unlinkSync(join(root, 'src/components/app-card/app-card.fud'));
      const gone = checker.check().problems.filter((p) => p.file.endsWith('.fudspec'));
      expect(gone.map((p) => p.code)).not.toContain('FUD0951');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('a file system without specFiles or readDirectory reads no criteria', () => {
    const root = project({ [SPEC_FILE]: SPEC });
    try {
      const { specFiles: _specFiles, ...noSpecs } = nodeFileSystem();
      const { readDirectory: _readDirectory, ...noDirectories } = nodeFileSystem();
      for (const fs of [noSpecs, noDirectories] as CheckFs[]) {
        const report = createProjectChecker({ root }, fs).check();
        expect(report.problems).toEqual([]);
        expect(report.inputs.some((i) => i.endsWith('.fudspec'))).toBe(false);
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('a spec file that cannot be read is skipped', () => {
    const root = project({ [SPEC_FILE]: SPEC });
    try {
      const real = nodeFileSystem();
      const fs: CheckFs = { ...real, specFiles: (r) => [...real.specFiles!(r), `${r}/src/gone.fudspec`] };
      expect(shown(createProjectChecker({ root }, fs).check(), root)).toEqual([`${SPEC_FILE} FUD0951`]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe('ProjectChecker.languageService', () => {
  it('nothing before the first check; the program the check used after it', () => {
    const root = project({});
    try {
      const checker = createProjectChecker({ root });
      expect(checker.languageService()).toBeUndefined();
      checker.check();
      const service = checker.languageService();
      expect(service?.getProgram()?.getSourceFiles().some((f) => f.fileName.endsWith('app-card.fud'))).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
