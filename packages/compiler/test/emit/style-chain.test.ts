/**
 * SDD-43 §4.6, criterion 11 — the adopted list is per COMPONENT, not per document.
 *
 * With libraries a page composes components from several packages, and a component adopts the
 * style guides of the chain of the package that DEFINES it: `guia → ui → tienda` gives a
 * component of `ui` the list `_tokens _ui ui-card`, and the app's own sheet does NOT enter —
 * the app does not define `ui-card`, and an app that could restyle a library's components by
 * dropping a file in its own project would be a library nobody can upgrade.
 *
 * The chain itself is worked out by the host (it is a fact of `package.json` files on a disk);
 * what is measured here is that the emit honours it, on both sides — the server's
 * `shadowrootadoptedstylesheets` and the client chunk's `data-fud-adopt`, which have to agree
 * or a component changes appearance on hydration.
 */

import { describe, expect, it } from 'vitest';
import {
  resolveComponents,
  emitComponentClientModule,
  type ProjectStyle,
} from '../../src/emit/index.js';
import { memoryIo, pageModuleOf, ssrIo } from './_support.js';

const TOKENS: ProjectStyle = { specifier: '_tokens', css: ':host { --accent: red; }' };
const UI: ProjectStyle = { specifier: '_ui', css: ':host { display: block; }' };
const TIENDA: ProjectStyle = { specifier: '_tienda', css: ':host { margin: 0; }' };

/** The library's component, with a sheet of its own. */
const CARD =
  '<head><style>.card { padding: 8px; }</style></head>\n' +
  '<ui-card><template shadowrootmode="open"><div class="card"><slot></slot></div></template></ui-card>';
/** The app's own component, which composes the library's inside its shadow. */
const PANEL =
  '<link rel="component" href="../../../../libs/ui/ui-card.fud">\n' +
  '<head><style>.panel { display: grid; }</style></head>\n' +
  '<app-panel><template shadowrootmode="open"><div class="panel"><ui-card>inner</ui-card></div></template></app-panel>';

const files = memoryIo({
  '/ws/apps/tienda/src/routes/index.fud':
    '<!DOCTYPE html>\n<html><head>' +
    '<link rel="component" href="../../../../libs/ui/ui-card.fud">' +
    '<link rel="component" href="../components/app-panel.fud">' +
    '<title>t</title></head>' +
    '<body><ui-card>x</ui-card><app-panel>y</app-panel></body></html>',
  '/ws/libs/ui/ui-card.fud': CARD,
  '/ws/apps/tienda/src/components/app-panel.fud': PANEL,
});

/** What the host worked out: the library's chain, and the app's, which ends in its own sheet. */
const CHAINS = new Map<string, readonly string[]>([
  ['ui-card', ['_tokens', '_ui']],
  ['app-panel', ['_tokens', '_ui', '_tienda']],
]);

async function html(): Promise<string> {
  const page = await pageModuleOf(resolveComponents('/ws/apps/tienda/src/routes/index.fud', files), {
    projectStyles: [TOKENS, UI, TIENDA],
    styleChains: CHAINS,
  });
  return [...page({}, ssrIo().io)].join('');
}

describe('the chain of the package that defines the component', () => {
  it('gives a library component the guides of ITS chain, and not the consumer’s', async () => {
    expect(await html()).toContain('shadowrootadoptedstylesheets="_tokens _ui ui-card"');
  });

  it('gives the app’s own component the whole chain, its own sheet last', async () => {
    expect(await html()).toContain('shadowrootadoptedstylesheets="_tokens _ui _tienda app-panel"');
  });

  it('hoists every sheet the document adopts, guide first', async () => {
    const out = await html();
    const order = ['_tokens', '_ui', '_tienda'].map((s) =>
      out.indexOf(`<style type="module" specifier="${s}">`),
    );
    expect(order.every((at) => at > -1)).toBe(true);
    expect(order[0]!).toBeLessThan(order[1]!);
    expect(order[1]!).toBeLessThan(order[2]!);
  });

  it('writes the SAME list into the client chunk, so hydration does not restyle', () => {
    // The page's client half fabricates the child hosts, and it has to wear what the server
    // serialized: two answers to one question is a component that changes on hydration.
    // The panel's chunk fabricates its child `ui-card`, so it is the one that writes the
    // child's `data-fud-adopt` — and it has to be the library's list, not the panel's own.
    const graph = resolveComponents('/ws/apps/tienda/src/routes/index.fud', files);
    const chunk = emitComponentClientModule(graph, graph.components.get('app-panel')!, {
      projectStyles: [TOKENS, UI, TIENDA],
      styleChains: CHAINS,
    });
    expect(chunk).toContain('_tokens _ui ui-card');
    expect(chunk).not.toContain('_tienda');
  });

  it('adopts nothing for a tag the host did not place in the chain map', async () => {
    // The map is built from the same graph the emit walks, so a tag missing from it is a tag
    // that is not in the document — and the honest answer is the component's own sheet alone.
    const page = await pageModuleOf(resolveComponents('/ws/apps/tienda/src/routes/index.fud', files), {
      projectStyles: [TOKENS],
      styleChains: new Map(),
    });
    const out = [...page({}, ssrIo().io)].join('');
    expect(out).toContain('shadowrootadoptedstylesheets="ui-card"');
    expect(out).toContain('shadowrootadoptedstylesheets="app-panel"');
  });

  it('without a chain map every component adopts every sheet, as SDD-42 left it', async () => {
    const page = await pageModuleOf(resolveComponents('/ws/apps/tienda/src/routes/index.fud', files), {
      projectStyles: [TOKENS, UI],
    });
    const out = [...page({}, ssrIo().io)].join('');
    expect(out).toContain('shadowrootadoptedstylesheets="_tokens _ui ui-card"');
    expect(out).toContain('shadowrootadoptedstylesheets="_tokens _ui app-panel"');
  });
});
