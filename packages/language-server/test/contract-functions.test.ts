/**
 * BUG-59 — which functions a `task(` or a `form:=` offers, read off the links of the file. The
 * round trip through the server is the acceptance suite's; this is every way a link can fail to
 * give a function, and what each position replaces.
 */

import { describe, expect, it } from 'vitest';
import { DocumentCache } from '../src/document-cache.js';
import { contractFunctionsAt, type ContractFunctions } from '../src/services/contract-functions.js';
import { WorkspaceIndex } from '../src/workspace-index.js';
import { memoryFs } from './_support.js';

const PATH = '/p/src/components/app-card.fud';
const CONTRACTS: Readonly<Record<string, string>> = {
  '/p/src/components/a.fudapi': 'put save\n  id  i32\n\nform person\n  name  str\n',
  '/p/src/components/b.fudapi': 'get search\n  q  str\n',
  '/p/src/components/data.fudapi': 'load\n  n  i32\n',
};
const apis = { appFiles: () => [], read: (path: string) => CONTRACTS[path] };

/** What is offered at the `|` of `code`, in a file with these `links`. */
function offered(links: string, code: string, view = ''): (Omit<ContractFunctions, 'names'> & { names: string[] }) | undefined {
  const marked = `${links}\n@code {\n  const t = ${code}\n}\n<app-card><template shadowrootmode="open">${view}</template></app-card>\n`;
  const offset = marked.indexOf('|');
  const source = marked.replace('|', '');
  const cache = new DocumentCache(new WorkspaceIndex(memoryFs({ [PATH]: source })));
  const found = contractFunctionsAt(cache.get(PATH, 1, source), offset, apis);
  if (found === undefined) return undefined;
  const written = source.slice(found.span.start, found.span.end);
  return { ...found, names: [...found.names], span: { start: written.length, end: 0 } };
}

const BOTH = '<link rel="server" href="./a.fudapi">\n<link rel="server" href="./b.fudapi">';

describe('contractFunctionsAt', () => {
  it('in a task(: the functions of every linked contract, never its forms, replacing the name begun', () => {
    expect(offered(BOTH, 'task(|')).toEqual({ names: ['save', 'search'], prefix: '', span: { start: 0, end: 0 } });
    expect(offered(BOTH, 'task( sa|')).toEqual({ names: ['save', 'search'], prefix: '', span: { start: 2, end: 0 } });
  });

  it('in a form:=, behind their @, quoted or not', () => {
    expect(offered(BOTH, '0;', '<form form:=|></form>')?.prefix).toBe('@');
    expect(offered(BOTH, '0;', '<form form:=@sa|></form>')?.span.start).toBe(3);
    expect(offered(BOTH, '0;', '<form form:="@|"></form>')?.names).toEqual(['save', 'search']);
  });

  it('nothing outside those two positions', () => {
    expect(offered(BOTH, 'save|')).toBeUndefined();
    expect(offered(BOTH, 'task(save, |')).toBeUndefined();
    expect(offered(BOTH, '0;', '<form control=|></form>')).toBeUndefined();
  });

  it('nothing when no link gives a function: whoever answered before keeps the position', () => {
    // No href, an empty one, a contract that is not there, and one with only a `load`.
    const links = '<link rel="server">\n<link rel="server" href>\n<link rel="server" href="./none.fudapi">\n<link rel="server" href="./data.fudapi">';
    expect(offered(links, 'task(|')).toBeUndefined();
  });
});
