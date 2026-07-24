/**
 * emitComponentSsr (SDD-15, slice 1) — one pure `render($dom, $shadow, props)` per
 * component. Covers what app-badge exercises (elements, text, static attrs, `class:`,
 * `<slot>`, `props<T>()` defaults) and the honest diagnostics for everything outside
 * the slice — constructs are reported, never faked.
 */
import { describe, expect, it } from 'vitest';
import { emitComponentSsr } from '../../src/emit/index.js';
import { fixture, parseComponent } from './_support.js';
import type { ComponentDocument } from '../../src/document/index.js';

const emit = (source: string) => emitComponentSsr(source, parseComponent(source));

describe('emitComponentSsr — the render function', () => {
  const badge = fixture('app-badge.fud');
  const result = emitComponentSsr(badge, parseComponent(badge));

  it('emits a pure render(dom, shadow, props) function', () => {
    expect(result.render.startsWith('function render($dom, $shadow, props) {')).toBe(true);
  });

  it('destructures props<T>() with their defaults', () => {
    expect(result.render).toContain("const { tone = 'neutral' } = props ?? {};");
  });

  it('fabricates elements and text via the injected Dom adapter', () => {
    expect(result.render).toContain("$dom.element('span')");
    expect(result.render).toContain("$dom.element('slot')");
    expect(result.render).toContain('$dom.append(');
  });

  it('combines the base class with conditional class: bindings', () => {
    expect(result.render).toContain('.filter(Boolean).join(\' \')');
    expect(result.render).toContain('"badge"');
    expect(result.render).toContain('(tone === \'success\') && "success"');
    expect(result.render).toContain('(tone === \'warning\') && "warning"');
  });

  it('has no diagnostics for a slice-1 component', () => {
    expect(result.diagnostics).toEqual([]);
  });

  it('emits a static non-class attribute as a setAttr', () => {
    const { render } = emit('<my-el>\n  <template shadowrootmode="open"><div id="x"></div></template>\n</my-el>\n');
    expect(render).toContain("$dom.setAttr($n0, 'id', \"x\");");
  });

  it('ignores a non-props declaration in @code (emits no prop destructure)', () => {
    const { render, diagnostics } = emit(
      '@code {\n  const helper = 1;\n}\n<my-el>\n  <template shadowrootmode="open"><span></span></template>\n</my-el>\n',
    );
    expect(render).not.toContain('= props ?? {}'); // no props<T>() → no destructure
    expect(diagnostics).toEqual([]);
  });
});

describe('emitComponentSsr — the style module', () => {
  it('emits the head <style> as a page-head module named by the tag', () => {
    const { specifier, styleModule } = emit(fixture('app-badge.fud'));
    expect(specifier).toBe('app-badge');
    expect(styleModule.startsWith('<style type="module" specifier="app-badge">')).toBe(true);
    expect(styleModule).toContain('.badge');
  });

  it('emits no style module when the component has no <head> style', () => {
    const { styleModule } = emit(
      '<my-el>\n  <template shadowrootmode="open"><span></span></template>\n</my-el>\n',
    );
    expect(styleModule).toBe('');
  });
});

describe('emitComponentSsr — honest diagnostics (out of slice)', () => {
  const diagOf = (source: string) => emit(source).diagnostics;

  it('reports an interpolated attribute', () => {
    const d = diagOf('<my-el>\n  <template shadowrootmode="open"><div id="@x"></div></template>\n</my-el>\n');
    expect(d).toContain("attribute 'id' has interpolation — out of the SSR slice.");
  });

  it('reports a non-attr binding (event)', () => {
    const d = diagOf('<my-el>\n  <template shadowrootmode="open"><button @click="@fn"></button></template>\n</my-el>\n');
    expect(d).toContain("binding 'event' — out of the SSR slice.");
  });

  it('reports content interpolation as out of slice', () => {
    const d = diagOf('<my-el>\n  <template shadowrootmode="open"><div>@value</div></template>\n</my-el>\n');
    expect(d.some((m) => m.includes('interpolation / control flow / raw'))).toBe(true);
  });

  it('reports rest/spread in props<T>()', () => {
    const d = diagOf(
      '@code {\n  const { a, ...rest } = props<{ a: string }>();\n}\n' +
        '<my-el>\n  <template shadowrootmode="open"><span></span></template>\n</my-el>\n',
    );
    expect(d).toContain('props<T>() with rest/spread — out of the SSR slice.');
  });

  it('reports a component with no <template shadowrootmode>', () => {
    const source = '<my-el>\n  <template shadowrootmode="open"><span></span></template>\n</my-el>\n';
    const doc = parseComponent(source);
    const noTemplate = { ...doc } as { template?: unknown };
    delete noTemplate.template;
    const result = emitComponentSsr(source, noTemplate as unknown as ComponentDocument);
    expect(result.diagnostics).toContain('component has no <template shadowrootmode> — nothing to render.');
  });
});
