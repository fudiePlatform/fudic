/**
 * SDD-66 §4.2 (criterion 16), amending SDD-61 §3.9: a module reached through a package
 * specifier is data the server cut reads when the host says it is a fudic library's; any other
 * package is `FUD1150`, as before.
 */

import { describe, expect, it } from 'vitest';
import { analyze, type ProjectModule, type SemanticInput } from '../../src/semantic/index.js';
import { viewInput } from './_view.js';

const FUD = '/app/src/routes/page.fud';
const FIXTURE = '/libs/ui/src/components/acme-button/acme-button.fixture.ts';

const CODE = `import cases from '@acme/ui/acme-button.fixture';\nconst primary = cases["primary"];`;
const VIEW = '<p>@primary.variant</p>';

function source(template: string, code: string): string {
  return `@code {\n${code}\n}\n<x-a><template shadowrootmode="open">${template}</template></x-a>`;
}

/** A host that answers one package specifier with `module`, and nothing else. */
function host(module: ProjectModule | undefined): Pick<SemanticInput, 'readModule' | 'path'> {
  return { path: FUD, readModule: (specifier) => (specifier === '@acme/ui/acme-button.fixture' ? module : undefined) };
}

function codes(code: string, extra: Partial<SemanticInput>): readonly string[] {
  return analyze({ ...viewInput(source(VIEW, code)), ...extra })
    .diagnostics.filter((d) => /^FUD09[01]\d$|^FUD115\d$/u.test(d.code))
    .map((d) => `${d.code}${d.file === undefined ? '' : ` ${d.file}`}`);
}

const DATA = `export default { primary: { variant: 'primary' }, disabled: { variant: 'primary', disabled: true } };`;

describe("a fudic library's module is data (SDD-66, amending SDD-61 §3.9)", () => {
  it('the default export of a library module, read by the view, is not FUD1150', () => {
    expect(codes(CODE, host({ path: FIXTURE, source: DATA, library: true }))).toEqual([]);
  });

  it('with the same rules as a module of the project: what is not data is reported in it', () => {
    const module = { path: FIXTURE, source: `export default { primary: { variant: new Date() } };`, library: true };
    expect(codes(CODE, host(module))).toEqual([`FUD1150 ${FIXTURE}`]);
  });

  it('a package the host does not call a library, or does not read, is FUD1150', () => {
    expect(codes(CODE, host({ path: '/node_modules/plain/data.ts', source: DATA }))).toEqual(['FUD1150']);
    expect(codes(CODE, host(undefined))).toEqual(['FUD1150']);
  });

  it('without a reader of modules, or without the path of the .fud, a package is FUD1150', () => {
    expect(codes(CODE, {})).toEqual(['FUD1150']);
    const { readModule } = host({ path: FIXTURE, source: DATA, library: true });
    expect(codes(CODE, { readModule: readModule! })).toEqual(['FUD1150']);
  });
});
