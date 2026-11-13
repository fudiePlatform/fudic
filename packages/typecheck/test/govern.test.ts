/**
 * SDD-83 §3.2, §3.10, §4.1: the comments of each kind of file, and the check reporting under
 * the project's policy and the file's comments. Criteria 1–3 and 7–12 in the check, which is
 * what the build, dev, the CLI and `fudic_check` report.
 */

import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FUD1380 } from '@fudic/diagnostics';
import { commentsOf, createProjectChecker, governFile, parseSource, projectPolicies, toPosix } from '../src/index.js';

describe('commentsOf: each file in its own language', () => {
  const fud = '@* razor *@\n@code {\n  // js\n}\n<x-a>\n  <template shadowrootmode="open">\n    <style>/* css */</style>\n    <p>@(/* expr */ 1)</p>\n  </template>\n</x-a>\n';

  it('a .fud: its three regions, parsed here or with the parse it is handed', () => {
    const expected = ['@* razor *@', '// js', '/* css */', '/* expr */'];
    expect(commentsOf('/p/x-a.fud', fud).map((c) => c.text)).toEqual(expected);
    expect(commentsOf('/p/x-a.fud', fud, parseSource(fud)).map((c) => c.text)).toEqual(expected);
  });

  it('a .fudapi and a .fudspec: their # lines', () => {
    expect(commentsOf('/p/a.fudapi', '# one\nfn a\n').map((c) => c.text)).toEqual(['# one']);
    expect(commentsOf('/p/a.fudspec', 'component x-a\n# two\n').map((c) => c.text)).toEqual(['# two']);
  });

  it('a stylesheet and a module: CSS and JS comments', () => {
    expect(commentsOf('/p/guide.css', 'a {} /* g */').map((c) => c.text)).toEqual(['/* g */']);
    for (const path of ['/p/a.ts', '/p/a.mts', '/p/a.js', '/p/a.cjs']) {
      expect(commentsOf(path, 'const a = "// no"; // yes\n/* and */').map((c) => c.text), path).toEqual(['// yes', '/* and */']);
    }
  });

  it('a .headers file: its # lines (SDD-84 §3.2), so a fud-disable silences in the build too', () => {
    const text = 'Content-Security-Policy:\n  # fud-disable-next-line FUD1547: video CDN\n  script-src https:\n';
    expect(commentsOf('/p/page.headers', text).map((c) => c.text)).toEqual(['# fud-disable-next-line FUD1547: video CDN']);
  });

  it('anything else has none', () => {
    expect(commentsOf('/p/fudic.json', '{"a": "/* no */"}')).toEqual([]);
  });
});

describe('governFile', () => {
  it('silences by the comments of the file, and names it to recognise its own diagnostics', () => {
    const source = '// fud-disable FUD1380: r\nx';
    const own = { ...FUD1380({ span: { start: 26, end: 27 }, event: 'click' }), file: '/p/a.ts' };
    expect(governFile('/p/a.ts', source, [own], null)).toEqual([]);
    expect(governFile('/p/a.ts', '// fud-disable FUD1380: r', [], null, { complete: true }).map((d) => d.code)).toEqual(['FUD1523']);
  });
});

describe('projectPolicies', () => {
  it('reads each fudic.json once, and answers null where there is none', () => {
    const reads: string[] = [];
    const policies = projectPolicies((path) => {
      reads.push(path);
      return path === '/w/app/fudic.json' ? '{"diagnostics":{"FUD1380":"off"}}' : undefined;
    });
    expect(policies.policyOf('/w/app/src/a.fud')?.codes.get('FUD1380')).toBe('off');
    expect(reads.filter((p) => p === '/w/app/fudic.json')).toHaveLength(1);
    expect(policies.policyOf('/elsewhere/a.fud')).toBeNull();
  });
});

/** A project on disk: `files` relative to its root. */
function project(files: Readonly<Record<string, string>>): string {
  const root = toPosix(mkdtempSync(join(tmpdir(), 'fudic-govern-')));
  const all = { 'tsconfig.json': JSON.stringify({ include: ['**/*.fud'] }), ...files };
  for (const [path, text] of Object.entries(all)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  }
  return root;
}

/** A component with two `@click` inside a loop: two FUD1380, on its lines 8 and 9 (1-based). */
const LOOP = (comment = '', code = '') => `@code {
${code}  const items = [1, 2];
  function pick(n: number): void { console.log(n); }
}
<app-x>
  <template shadowrootmode="open">
    @foreach (const n of items) key (n) {
${comment}      <button @click=@pick(n)>a</button>
      <i @click=@pick(n)>b</i>
    }
  </template>
</app-x>
`;

function problems(root: string): string[] {
  return createProjectChecker({ root })
    .check()
    .problems.map((p) => `${p.code} ${p.severity} ${p.message.endsWith('in this project)') ? 'policy' : ''}`.trim());
}

describe('the check reports under the policy and the comments', () => {
  it('as it is, with no fudic.json', () => {
    expect(problems(project({ 'src/app-x.fud': LOOP() }))).toEqual(['FUD1380 warning', 'FUD1380 warning']);
  });

  it('"FUD1380": "off" (criterion 1), "warnings": "error" (criterion 3)', () => {
    expect(problems(project({ 'fudic.json': '{"diagnostics":{"FUD1380":"off"}}', 'src/app-x.fud': LOOP() }))).toEqual([]);
    expect(problems(project({ 'fudic.json': '{"diagnostics":{"warnings":"error"}}', 'src/app-x.fud': LOOP() }))).toEqual([
      'FUD1380 error policy',
      'FUD1380 error policy',
    ]);
  });

  it('fud-disable-next-line silences the next line and no other (criterion 7)', () => {
    const comment = '      @* fud-disable-next-line FUD1380: on purpose *@\n';
    expect(problems(project({ 'src/app-x.fud': LOOP(comment) }))).toEqual(['FUD1380 warning']);
  });

  it('fud-disable silences the file, wherever it is (criterion 8)', () => {
    expect(problems(project({ 'src/app-x.fud': `${LOOP()}@* fud-disable FUD1380: a demo *@\n` }))).toEqual([]);
  });

  it('in the @code, with //, as well (criterion 9)', () => {
    expect(problems(project({ 'src/app-x.fud': LOOP('', '  // fud-disable FUD1380: a demo\n') }))).toEqual([]);
  });

  it('without a reason it silences nothing and is an error (criterion 10)', () => {
    const comment = '      @* fud-disable-next-line FUD1380 *@\n';
    expect(problems(project({ 'src/app-x.fud': LOOP(comment) }))).toEqual(['FUD1522 error', 'FUD1380 warning', 'FUD1380 warning']);
  });

  it('a comment that silences nothing is a FUD1523, which the project may raise (criterion 12)', () => {
    const files = {
      'fudic.json': '{"diagnostics":{"FUD1523":"warning"}}',
      'src/app-x.fud': `@* fud-disable FUD1022: no message here *@\n${LOOP()}`,
    };
    expect(problems(project(files))).toEqual(['FUD1523 warning policy', 'FUD1380 warning', 'FUD1380 warning']);
  });

  it('a .fudapi with nothing else to say still reports its comment that silences nothing', () => {
    const files = {
      'fudic.json': '{"diagnostics":{"FUD1523":"warning"}}',
      'src/app-x.fud': '<app-x>\n  <template shadowrootmode="open"></template>\n</app-x>\n',
      'src/notes.fudapi': '# fud-disable FUD1380: nothing here\n',
    };
    expect(problems(project(files))).toEqual(['FUD1523 warning policy']);
  });
});
