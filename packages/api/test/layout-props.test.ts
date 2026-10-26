/** SDD-60 §3.4 — the props of a route's layout, as its `.d.ts` names them. */

import { describe, expect, it } from 'vitest';
import { layoutPropsType } from '../src/index.js';

const PAGE = '/p/src/routes/blog/[slug].fud';
const TYPES = '/p/.fudic/api/routes/blog/[slug].d.ts';

describe('layoutPropsType', () => {
  it('imports $Props from the linked layout, relative to the .d.ts', () => {
    const page = '<link rel="component" href="./x.fud">\n<link href="../../layouts/_layout.fud" rel="layout">\n';
    expect(layoutPropsType(PAGE, page, TYPES)).toBe("import('../../../../src/layouts/_layout.fud').$Props");
  });

  it('a bare href and a ./ are next to the page; single quotes read the same', () => {
    expect(layoutPropsType(PAGE, "<link rel='layout' href='_l.fud'>", TYPES)).toBe(
      "import('../../../../src/routes/blog/_l.fud').$Props",
    );
    expect(layoutPropsType('/p/a/r.fud', '<link rel="layout" href="./_l.fud">', '/p/a/t.d.ts')).toBe("import('./_l.fud').$Props");
  });

  it('nothing without a layout link, with an empty or absolute href, or with none', () => {
    expect(layoutPropsType(PAGE, '<link rel="server" href="./x.fudapi">', TYPES)).toBeUndefined();
    expect(layoutPropsType(PAGE, '<link rel="layout" href="">', TYPES)).toBeUndefined();
    expect(layoutPropsType(PAGE, '<link rel="layout" href="/src/l.fud">', TYPES)).toBeUndefined();
    expect(layoutPropsType(PAGE, '<link rel="layout">', TYPES)).toBeUndefined();
  });
});
