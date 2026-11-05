/**
 * `renderJob` (SDD-78 criteria 2, 3, 5 and 6, as the project's vitest sees them): a component
 * painted with a case of its fixture and props on top, a route by a concrete URL, what each
 * answers — outline, markup with its shadow roots as declarative ones, a preview with no script,
 * the functions it called — and every outcome that is not a painting.
 */

import { beforeEach, describe, expect, test, vi } from 'vitest';
import { concreteRoutes, deepSelect, fnOf, renderJob, type RenderOutcome } from '../../src/render.js';
import * as XBoom from './src/components/x-boom.fud';
import * as XCard from './src/components/x-card.fud';
import fixture from './src/components/x-card.fixture';
import * as XFinder from './src/components/x-finder.fud';

// The data edge of the blog route, mocked as in `visit.test.ts`: `nope` is a post that is not there.
const findPost = vi.hoisted(() => vi.fn());
vi.mock('./src/data/posts', () => ({ findPost }));

beforeEach(() => {
  findPost.mockReset();
  findPost.mockImplementation(async (slug: string) => (slug === 'nope' ? undefined : { title: `Post ${slug}`, lang: 'en' }));
});

type Rendered = Extract<RenderOutcome, { kind: 'rendered' }>;

function rendered(outcome: RenderOutcome): Rendered {
  expect(outcome.kind).toBe('rendered');
  return outcome as Rendered;
}

describe('criterion 2: a component with a case of its fixture', () => {
  test('the outline of the case', async () => {
    const out = rendered(await renderJob({ target: { component: XCard, fixture, case: 'plain' } }));
    expect(out.outline).toBe('- region:\n  - heading "Plain" [level=2]\n  - button "Open"');
    expect(out).not.toHaveProperty('status');
    expect(out.calls).toEqual([]);
  });

  test('a case that hides the piece reads as nothing', async () => {
    expect(rendered(await renderJob({ target: { component: XCard, fixture, case: 'hidden' } })).outline).toBe('');
  });

  test('props on top change what they change, and only that', async () => {
    const out = rendered(await renderJob({ target: { component: XCard, fixture, case: 'hidden', props: { hidden: false } } }));
    expect(out.outline).toBe('- region:\n  - heading "Hidden" [level=2]\n  - button "Open"');
  });

  test('props alone, with no case: the defaults under them', async () => {
    expect(rendered(await renderJob({ target: { component: XCard, props: { label: 'Mine' } } })).outline).toContain('heading "Mine"');
    expect(rendered(await renderJob({ target: { component: XCard, fixture } })).outline).toContain('heading "none"');
  });

  test('$content is the children of a case, not a prop', async () => {
    const out = rendered(await renderJob({ target: { component: XCard, fixture, case: 'filled' } }));
    expect(out.outline).toContain('heading "Filled"');
    expect(out.html).not.toContain('content');
  });

  test('as html: the markup with its declarative shadow root and the sheets it adopted', async () => {
    const out = rendered(await renderJob({ target: { component: XCard, fixture, case: 'plain' } }));
    expect(out.html).toBe(
      '<x-card data-fud-adopt="panel x-card"><template shadowrootmode="open">' +
        '<style>.panel{display:flex;}</style><style>.card{& h2{margin:0;}}</style>' +
        ' <section class="card panel"><h2>Plain</h2> <button>Open</button> <slot></slot></section> </template></x-card>',
    );
  });

  test('a case the fixture has not: the cases it has', async () => {
    expect(await renderJob({ target: { component: XCard, fixture, case: 'big' } })).toEqual({
      kind: 'no-case',
      cases: ['plain', 'hidden', 'filled'],
    });
    // A component with no fixture has no case at all.
    expect(await renderJob({ target: { component: XCard, case: 'plain' } })).toEqual({ kind: 'no-case', cases: [] });
  });

  test('select narrows the outline and the markup, through the shadow root of the piece', async () => {
    const out = rendered(await renderJob({ target: { component: XCard, fixture, case: 'plain' }, select: 'h2' }));
    expect(out.outline).toBe('- heading "Plain" [level=2]');
    expect(out.html).toBe('<h2>Plain</h2>');
  });

  test('select that matches nothing says so', async () => {
    expect(await renderJob({ target: { component: XCard, fixture, case: 'plain' }, select: 'table' })).toEqual({
      kind: 'no-match',
      select: 'table',
    });
  });
});

describe('criterion 3: a route by a concrete URL', () => {
  test('painted with its layout and its load, with its status', async () => {
    const out = rendered(await renderJob({ target: { route: '/tags/uno' } }));
    expect(out.status).toBe(200);
    expect(out.outline).toBe('- navigation\n- main:\n  - heading "Tag uno" [level=1]');
    expect(out.html).toBe(' <nav></nav> <main><h1>Tag uno</h1></main> ');
  });

  test('select narrows a page too', async () => {
    const out = rendered(await renderJob({ target: { route: '/blog/x' }, select: 'h1' }));
    expect(out.outline).toBe('- heading "Post x" [level=1]');
    expect(out.html).toBe('<h1>Post x</h1>');
  });

  test('a load that answers notFound(): the error page, with its 404', async () => {
    const out = rendered(await renderJob({ target: { route: '/blog/nope' } }));
    expect(out.status).toBe(404);
    expect(out.outline).toContain('heading "404 · Not Found"');
  });

  test('the calls the piece made while painting, by the name of their function', async () => {
    const out = rendered(await renderJob({ target: { component: XFinder } }));
    const byPath = [...out.calls].sort((a, b) => a.path.localeCompare(b.path));
    expect(byPath).toEqual([
      { method: 'GET', path: '/_fudic/fn/components/x-finder/find', status: 200, fn: 'components/x-finder.find' },
      // No handler: its 404.
      { method: 'GET', path: '/_fudic/fn/components/x-finder/lost', status: 404, fn: 'components/x-finder.lost' },
      // No function of the project at that URL: the call, with no name.
      { method: 'GET', path: '/_fudic/fn/nowhere/at-all', status: 404 },
    ]);
  });
});

describe('criterion 5: what is not a painting', () => {
  test('a pattern instead of a URL: the URLs of its paths()', async () => {
    expect(await renderJob({ target: { route: '/tags/:tag' } })).toEqual({ kind: 'no-route', paths: ['/tags/uno', '/tags/dos'] });
  });

  test('a pattern with no paths(), or one no route has: no URL to offer', async () => {
    expect(await renderJob({ target: { route: '/blog/:slug' } })).toEqual({ kind: 'no-route', paths: [] });
    expect(await renderJob({ target: { route: '/nada/:x' } })).toEqual({ kind: 'no-route', paths: [] });
  });

  test('a URL no route matches: no route, and no URL to offer', async () => {
    expect(await renderJob({ target: { route: '/nowhere' } })).toEqual({ kind: 'no-route', paths: [] });
  });

  test('a load that throws what is no HttpError: what it threw, with the stack into the source', async () => {
    const out = await renderJob({ target: { route: '/roto' } });
    expect(out).toEqual({ kind: 'threw', error: { message: 'the load broke', stack: expect.stringContaining('routes.ts') } });
  });

  test('a redirect is no page: what visit said', async () => {
    const out = await renderJob({ target: { route: '/moved' } });
    expect(out).toMatchObject({ kind: 'threw', error: { message: "visit('/moved'): redirected with 302 to /blog/x — visit that URL instead" } });
  });

  test('a component that throws while painting: an Error, and what is no Error', async () => {
    expect(await renderJob({ target: { component: XBoom } })).toMatchObject({ kind: 'threw', error: { message: expect.stringContaining('name') } });
    const item = {
      get name(): string {
        // eslint-disable-next-line @typescript-eslint/only-throw-error -- what is no Error, on purpose
        throw 'kaput';
      },
    };
    expect(await renderJob({ target: { component: XBoom, props: { item } } })).toMatchObject({
      kind: 'threw',
      error: { message: expect.stringContaining('kaput') },
    });
  });
});

describe('criterion 6: the preview', () => {
  test('the markup inside a whole document, the sheets of the head inline, no script', async () => {
    const out = rendered(await renderJob({ target: { component: XCard, fixture, case: 'plain' } }));
    expect(out.preview.startsWith('<!doctype html><html><head><meta charset="utf-8">')).toBe(true);
    // The project's sheet and the component's, as the page's head has them.
    expect(out.preview).toContain('<head><meta charset="utf-8"><style>.panel{display:flex;}</style><style>.card{& h2{margin:0;}}</style></head>');
    expect(out.preview).toContain(`<body>${out.html}</body>`);
    expect(out.preview).toContain('<template shadowrootmode="open">');
    expect(out.preview).not.toMatch(/<script/iu);
  });

  test('a page has no script either, though its layout loads the runtime', async () => {
    const out = rendered(await renderJob({ target: { route: '/tags/uno' } }));
    expect(out.preview).not.toMatch(/<script/iu);
    expect(out.html).not.toMatch(/<script/iu);
  });
});

describe('the concrete URLs of the project', () => {
  test('the routes with no params, and the paths() of those with them', async () => {
    const urls = await concreteRoutes();
    expect([...urls].sort()).toEqual(['/contador', '/espera', '/moved', '/roto', '/tags/dos', '/tags/uno']);
  });
});

describe('the function at a URL', () => {
  test('by its id and its name, a param segment of the id and a param of its own route fitting any value', () => {
    expect(fnOf('/_fudic/fn/components/x-finder/find')).toBe('components/x-finder.find');
    expect(fnOf('/_fudic/fn/routes/tags/uno/like')).toBe('routes/tags/[tag].like');
    expect(fnOf('/_fudic/fn/components/x-finder/item/7')).toBe('components/x-finder.item');
  });

  test('none when the URL fits no function', () => {
    expect(fnOf('/_fudic/fn/components/x-finder/item/7/8')).toBeUndefined();
    expect(fnOf('/_fudic/fn/components/x-finder/nope')).toBeUndefined();
    expect(fnOf('/_fudic/fn/nowhere/at-all')).toBeUndefined();
  });
});

describe('a selector through shadow roots', () => {
  test('in the light first, then into each shadow root, the first match', () => {
    document.body.innerHTML = '<div><p id="light">light</p></div><span></span>';
    const outer = document.createElement('x-outer');
    const shadow = outer.attachShadow({ mode: 'open' });
    shadow.innerHTML = '<em id="deep">deep</em>';
    document.body.append(outer);
    expect(deepSelect(document.body, 'p')!.id).toBe('light');
    expect(deepSelect(document.body, 'em')!.id).toBe('deep');
    expect(deepSelect(document.body, 'table')).toBeNull();
  });
});
