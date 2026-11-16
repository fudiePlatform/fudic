/**
 * SDD-84 criterion 34: the project check says of the three `.headers` what the build says, under
 * the project's policy and each file's own comments, when it is asked to (`fudic_check`); and
 * nothing that needs the output.
 */

import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createProjectChecker, headersDiagnostics, projectPolicies, toPosix } from '../src/index.js';

const TSCONFIG = JSON.stringify({ compilerOptions: { strict: true, target: 'ES2022', module: 'ESNext', moduleResolution: 'Bundler' }, include: ['**/*.ts', '**/*.fud'] });

function project(files: Readonly<Record<string, string>>): string {
  const root = toPosix(mkdtempSync(join(tmpdir(), 'fudic-headers-')));
  for (const [relative, text] of Object.entries({ 'tsconfig.json': TSCONFIG, ...files })) {
    const file = join(root, relative);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, text);
  }
  return root;
}

/** `headersDiagnostics` over a map of relative path → text, under `/p`. */
function diagnose(files: Readonly<Record<string, string>>): string[] {
  const read = (path: string): string | undefined => files[path.slice('/p/'.length)];
  return headersDiagnostics('/p', read, projectPolicies(read)).map((d) => `${d.code} ${d.severity} ${d.file!.slice('/p/'.length)}`);
}

describe('the .headers in the project check', () => {
  it('what the reader says, on the full path of each file', () => {
    expect(
      diagnose({ 'fudic.json': '{"id":"p"}', 'sw.json': '{"shell":[]}', 'page.headers': 'X-A:\n', 'sw.headers': 'Cache-Control: no-cache\n', 'assets.headers': 'X: 1\n' }),
    ).toEqual(['FUD1543 error page.headers', 'FUD1542 error sw.headers', 'FUD1540 error assets.headers']);
  });

  it('the templates of the missing ones say nothing', () => {
    expect(diagnose({ 'fudic.json': '{"id":"p"}' })).toEqual([]);
    expect(diagnose({})).toEqual([]);
  });

  it('under the policy of the project, and the comments of the file', () => {
    const files = { 'fudic.json': '{"id":"p","diagnostics":{"FUD1549":"error"}}', 'page.headers': 'Referrer-Policy: origin\n' };
    expect(diagnose(files)).toEqual(['FUD1549 error page.headers']);
    expect(diagnose({ ...files, 'page.headers': '# fud-disable-next-line FUD1550: checked\nX-A: 1\nStrict-Transport-Security: max-age=1; includeSubDomains; preload\n' })).toEqual([
      'FUD1550 warning page.headers',
    ]);
    expect(diagnose({ 'page.headers': '# fud-disable-next-line FUD1550: checked\nStrict-Transport-Security: max-age=1; includeSubDomains; preload\n' })).toEqual([]);
  });

  it('a file that applies to nothing is FUD1554: in a library, or sw.headers with no sw.json', () => {
    expect(diagnose({ 'fudic.json': '{"kind":"lib","prefix":"ui"}', 'page.headers': 'X-A: 1\n' })).toEqual(['FUD1554 warning page.headers']);
    expect(diagnose({ 'sw.headers': 'X-A: 1\n' })).toEqual(['FUD1554 warning sw.headers']);
  });

  it('createProjectChecker reports them only when asked', () => {
    const root = project({
      'fudic.json': '{"id":"p"}',
      'page.headers': 'Cross-Origin-Opener-Policy: same-site\n',
      'src/routes/index.fud': '<!DOCTYPE html>\n<html>\n  <head><title>t</title></head>\n  <body><p>x</p></body>\n</html>\n',
    });
    const asked = createProjectChecker({ root, headers: true }).check().problems.filter((p) => p.file.endsWith('.headers'));
    expect(asked.map((p) => [p.code, p.file, p.span])).toEqual([['FUD1543', `${root}/page.headers`, { start: 28, end: 37 }]]);
    expect(createProjectChecker({ root }).check().problems.filter((p) => p.file.endsWith('.headers'))).toEqual([]);
  }, 60_000);
});
