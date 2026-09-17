/**
 * The net under SDD-42: a project WITHOUT `styles` emits, byte for byte, what it emitted
 * before this SDD existed (§5, criterion 6).
 *
 * The page is chosen to hold the four things SDD-42 touches at once: the `<head>` and the
 * order of what it carries, `shadowrootadoptedstylesheets`, `data-fud-adopt`, and the
 * polyfill's presence. And it holds a component WITH css next to one WITHOUT, because that
 * is the pair BUG-31 §T4 separated and §4.4 of this SDD redefines.
 *
 * It renders through the REAL `@fudic/ssr`, not the fake of `renderPageHtml`: the fake
 * writes `<template shadowrootmode="open">` and nothing else, so it cannot see the one
 * attribute half of this SDD is about.
 *
 * **This file and its golden must go green at the end without having been edited.** A
 * change here is the SDD escaping its own scope: the whole argument of §4.4 is that with no
 * project sheet the old condition — *this component has CSS* — and the new one — *its
 * adopted list is empty* — say the same thing.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolveComponents } from '../../src/emit/index.js';
import { memoryIo, pageModuleOf, ssrIo } from './_support.js';

const goldenDir = join(dirname(fileURLToPath(import.meta.url)), '__golden__');
const golden = (file: string): string => readFileSync(join(goldenDir, file), 'utf8');

/** `s-card` brings a stylesheet; `s-plain` brings none. Nothing else differs. */
const io = memoryIo({
  '/home.fud':
    '<!DOCTYPE html>\n<html><head>' +
    '<link rel="component" href="./s-card.fud">' +
    '<link rel="component" href="./s-plain.fud">' +
    '<title>sin styles</title></head>' +
    '<body><s-card></s-card><s-plain></s-plain></body></html>',
  '/s-card.fud':
    '<head><style>.card { padding: 8px; }</style></head>\n' +
    '<s-card><template shadowrootmode="open"><div class="card"><slot></slot></div></template></s-card>',
  '/s-plain.fud':
    '<s-plain><template shadowrootmode="open"><span><slot></slot></span></template></s-plain>',
});

async function render(): Promise<string> {
  const page = await pageModuleOf(resolveComponents('/home.fud', io));
  return [...page({}, ssrIo().io)].join('');
}

describe('SDD-42 §5 — a project with no `styles` emits what it emitted before', () => {
  it('renders the page byte for byte as the golden', async () => {
    expect(await render()).toBe(golden('sin-styles.html'));
  });

  it('states what the golden is holding, so a diff reads as a decision', async () => {
    const html = await render();
    // The component with CSS: a hoisted module sheet, and both adoption channels naming it.
    expect(html).toContain('<style type="module" specifier="s-card">');
    expect(html).toContain('shadowrootadoptedstylesheets="s-card"');
    expect(html).toContain('data-fud-adopt="s-card"');
    // The component without CSS: none of the three (BUG-31 §T4).
    expect(html).not.toContain('specifier="s-plain"');
    expect(html).not.toContain('adopt="s-plain"');
    expect(html).not.toContain('adoptedstylesheets="s-plain"');
    // The polyfill, here because SOME component of the graph brings CSS (BUG-31 §T3).
    expect(html).toContain('adoptedStyleSheets');
    // And the order of the head, which is contract: polyfill first, sheets after (§4.1).
    expect(html.indexOf('adoptedStyleSheets')).toBeLessThan(
      html.indexOf('<style type="module"'),
    );
  });
});
