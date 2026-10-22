/**
 * SDD-60 §4.7 — the layout facts of a route with no `@server`, read straight off
 * `contractIssues`: whether the server can see the route's `.fudapi` decides the bulb.
 */

import { describe, expect, it } from 'vitest';
import { DocumentCache } from '../../src/document-cache.js';
import { contractIssues } from '../../src/services/contract.js';
import { WorkspaceIndex } from '../../src/workspace-index.js';
import { LAYOUT, memoryFs } from '../_support.js';

const ROUTE = '/p/src/routes/r.fud';
const SOURCE = '<link rel="layout" href="../layouts/_layout.fud">\n<h1>hola</h1>\n';
const REQUIRING = LAYOUT.replace('<head>', '<head>\n    @code {\n      const { title } = props<{ title: string }>();\n    }');

function issuesWith(apis?: Parameters<typeof contractIssues>[2]) {
  const index = new WorkspaceIndex(memoryFs({ [ROUTE]: SOURCE, '/p/src/layouts/_layout.fud': REQUIRING }));
  index.scan('/p');
  return contractIssues(new DocumentCache(index).get(ROUTE, 1, SOURCE), index, apis);
}

describe('a route with no @server', () => {
  it('has nothing to repair on a host that cannot read its .fudapi', () => {
    expect(issuesWith()).toEqual([]);
  });

  it('writes the sibling .fudapi, created, and the link to it', () => {
    const [issue] = issuesWith({ appFiles: () => [], read: () => undefined });
    expect(issue).toMatchObject({
      kind: 'missing-layout-props',
      write: 'fudapi',
      insertAt: SOURCE.indexOf('\n'),
      contract: { path: '/p/src/routes/r.fudapi', href: './r.fudapi', declared: false, linked: false },
    });
    expect(issue).not.toHaveProperty('contract.text');
  });
});
