import { describe, expect, it } from 'vitest';
import type { VirtualFile } from '../src/types.js';
import { collectTags, unresolvedAlias } from '../src/imports.js';
import { emitClient, parseFud, registryOf } from './_support.js';
import { templateContent } from '../src/imports.js';

/** A component file wrapping `markup` in the mandatory host + template (decision 75). */
const component = (markup: string, code = ''): string =>
  `${code}<app-host>\n  <template shadowrootmode="open">\n${markup}\n  </template>\n</app-host>\n`;

/** A route file: layout link + body fragment. */
const route = (markup: string, code = ''): string =>
  `<link rel="layout" href="./_layout.fud">\n${code}${markup}\n`;

describe('interpolation', () => {
  it('projects @expr and @(expr) through $text, copying the expression verbatim', () => {
    const { text } = emitClient(component('    <p>@data.title @(a ? b : c)</p>'));

    expect(text).toContain('$text(data.title);');
    expect(text).toContain('$text(a ? b : c);');
  });

  it('projects @raw() the same way', () => {
    expect(emitClient(component('    <p>@raw(html)</p>')).text).toContain('$text(html);');
  });

  it('leaves text, comments and Razor comments out of the program', () => {
    const { text } = emitClient(component('    <p>plain <!-- html --> @* razor *@ @@</p>'));

    expect(text).not.toContain('plain');
    expect(text).not.toContain('razor');
  });
});

describe('half-written expressions', () => {
  /**
   * A stretch that stands for an empty span and only answers "what may go here".
   *
   * `completion` is truthy rather than `true`: a user stretch carries the object Volar reads
   * `isAdditional` from (SDD-28 §5.5), and a stand-in carries a plain `true`.
   */
  const standIns = (file: VirtualFile) =>
    file.mappings.filter((m) => Boolean(m.caps.completion) && m.sourceLength === 0);

  it('stands in for an empty content interpolation', () => {
    const file = emitClient(component('    <p>@()</p>'));

    expect(file.text).toContain('$text( );');
    expect(standIns(file).length).toBe(1);
  });

  it('stands in for an empty interpolation in a native attribute', () => {
    const file = emitClient(component('    <div title="@()"></div>'));

    expect(file.text).toContain('$attr( );');
    expect(standIns(file).length).toBe(1);
  });

  it('stands in for an empty binding value', () => {
    const file = emitClient(component('    <div class:on="@()"></div>'));

    expect(file.text).toContain('$cls( );');
    expect(standIns(file).length).toBe(1);
  });
});

describe('component tags', () => {
  const registry = registryOf({ 'app-badge': './app-badge.fud' });

  it('imports the contract of a used tag and checks its attributes against it', () => {
    const { text } = emitClient(
      component('    <app-badge .tone="@(x)">hi</app-badge>'),
      'x.fud',
      registry,
    );

    // Both contracts of a component travel on one line, numbered together: `$C0` and `$S0`
    // are always the same component (BUG-11 §3.3).
    expect(text).toContain(
      "import type { $Props as $C0, $Slots as $S0 } from './app-badge.fud';",
    );
    // The blank line after `({` is the completion anchor: the attribute area of the start tag
    // stands for the inside of the object literal, so `<app-badge |>` has somewhere to ask.
    expect(text).toContain('$attrs<$C0>({\n  \n  tone: (x),\n});');
    // Only one literal: with no plain attribute there is nothing to check against
    // `$GlobalAttrs`, and an empty `$attrs<{}>({})` would be scaffolding that says nothing.
    expect(text).not.toContain('$attrs<{}>');
  });

  it('anchors completion inside a self-closing tag, and has nowhere to anchor without a gap', () => {
    const closed = emitClient(component('    <app-badge />'), 'x.fud', registry);
    const anchor = closed.mappings.find((m) => m.caps.completion && !m.caps.navigation);

    // `<app-badge />` — the area between the name and `/>` is one space, and it is where the
    // first prop will be typed.
    expect(anchor).toBeDefined();
    expect(anchor?.length).toBe('\n  '.length);

    // `<app-badge>` has no gap at all: nothing to stand for, so nothing is emitted.
    const tight = emitClient(component('    <app-badge>hi</app-badge>'), 'x.fud', registry);
    expect(tight.mappings.some((m) => m.caps.completion && !m.caps.navigation)).toBe(false);
  });

  it('anchors every gap of a start tag, and never the attributes themselves', () => {
    // Three places another attribute can be typed: before the first, between the two, and
    // after the last. Each gets its own anchor.
    const { text, mappings } = emitClient(
      component('    <app-badge  .tone="@(x)"  id="a"  ></app-badge>'),
      'x.fud',
      registry,
    );
    const anchors = mappings.filter((m) => m.caps.completion && !m.caps.navigation);
    expect(anchors).toHaveLength(3);
    // The two literals of BUG-16 §4.2: the prop against the component's contract, the plain
    // attribute against HTML's own vocabulary and nothing else.
    expect(text).toContain('$attrs<$C0>({\n  \n  \n  \n  tone: (x),\n});');
    expect(text).toContain('$attrs<{}>({\n  id: "a",\n});');

    // And none of them stands over an attribute. One stretch covering the whole area also
    // covered the VALUES, so a position inside `.tone="@(|)"` mapped to the anchor as well as
    // to the interpolation — and the anchor's key completions shadowed the union of `tone`.
    const cursor = component('    <app-badge  .tone="@(x)"  id="a"  ></app-badge>').indexOf('@(x)') + 2;
    expect(anchors.some((m) => cursor > m.sourceOffset && cursor < m.sourceOffset + m.sourceLength)).toBe(false);
  });

  it('keeps a position inside an empty @() so the value can be asked about', () => {
    // `tone="@()"` is the half-written attribute: the user opened the parentheses and is about
    // to type. There is nothing to copy, so a space stands for the empty span — without it the
    // cursor maps nowhere and nobody can say which values the prop accepts.
    const { text, mappings } = emitClient(
      component('    <app-badge tone="@()"></app-badge>'),
      'x.fud',
      registry,
    );

    expect(text).toContain('tone: ( ),');
    const empty = mappings.filter((m) => m.caps.completion && m.sourceLength === 0);
    expect(empty.length).toBe(1);
    expect(empty[0]?.length).toBe(1);
  });

  it('projects an unregistered tag as an undeclared name, so TS2304 lands on the tag', () => {
    const file = emitClient(component('    <app-missing a="1"></app-missing>'));

    expect(file.text).toContain('$attrs<$C_app_missing>');
    expect(file.text).not.toContain('import type');

    const alias = file.mappings.find(
      (m) => file.text.slice(m.generatedOffset, m.generatedOffset + m.length) === '$C_app_missing',
    )!;
    expect(alias.caps).toEqual({
      completion: false,
      verification: true,
      semantic: false,
      navigation: false,
      structure: false,
      format: false,
    });
  });

  it('emits an empty object for a component used with no attributes', () => {
    expect(emitClient(component('    <app-badge></app-badge>'), 'x.fud', registry).text).toContain(
      '$attrs<$C0>({});',
    );
  });

  it('collects tags used inside control bodies, not only at the top level', () => {
    const doc = parseFud(
      component('    @if (c) {\n      <app-badge></app-badge>\n    } else {\n      <app-other></app-other>\n    }'),
    );

    expect(collectTags(templateContent(doc))).toEqual(['app-badge', 'app-other']);
  });

  it('builds an alias that cannot collide with a user identifier', () => {
    expect(unresolvedAlias('my-widget')).toBe('$C_my_widget');
  });
});

describe('attributes', () => {
  const registry = registryOf({ 'app-badge': './app-badge.fud' });
  const props = (markup: string): string => emitClient(markup, 'x.fud', registry).text;

  it('gives a bare attribute the value true (decision 44)', () => {
    expect(props(component('    <app-badge disabled></app-badge>'))).toContain('disabled: true,');
  });

  it('keeps a static value as a string literal', () => {
    expect(props(component('    <app-badge tone="info"></app-badge>'))).toContain('tone: "info",');
  });

  it('checks a concatenation as a string (decision 20)', () => {
    expect(props(component('    <app-badge tone="pre-@x-post"></app-badge>'))).toContain(
      'tone: `pre-${x}-post`,',
    );
  });

  it('keeps the exact type of a .prop binding (decision 24)', () => {
    expect(props(component('    <app-badge .items="@list"></app-badge>'))).toContain(
      'items: (list),',
    );
  });

  it('quotes a name that is not an identifier', () => {
    expect(props(component('    <app-badge data-id="7"></app-badge>'))).toContain(
      "'data-id': \"7\",",
    );
  });

  it('escapes what would otherwise break the projection', () => {
    expect(props(component('    <app-badge tone="a`b-@x-${c}"></app-badge>'))).toContain(
      'tone: `a\\`b-${x}-\\${c}`,',
    );
  });

  it('checks interpolations of a native tag through $attr', () => {
    const { text } = emitClient(component('    <a href="@url" title="static">x</a>'));

    expect(text).toContain('$attr(url);');
    expect(text).not.toContain('static');
  });

  it('checks a .prop binding of a native tag too', () => {
    expect(emitClient(component('    <input .value="@v">')).text).toContain('$attr(v);');
  });
});

describe('behaviour bindings', () => {
  it('types a standard event and gives up on a custom one (decision 28)', () => {
    const { text } = emitClient(
      component('    <button @click="@(e => go(e))" @my-event="@h"></button>'),
    );

    expect(text).toContain("$on('click', e => go(e));");
    expect(text).toContain("$on('my-event' as never, h);");
  });

  it('projects a bus subscription with a literal and with an expression name', () => {
    const { text } = emitClient(
      component('    <div bus:cart="@onCart" bus:(name)="@onDyn"></div>'),
    );

    expect(text).toContain("$on('cart' as never, onCart);");
    expect(text).toContain('$on(name as never, onDyn);');
  });

  it('demands boolean for class: and string for style:', () => {
    const { text } = emitClient(
      component('    <div class:on="@(x === 1)" style:color="@c"></div>'),
    );

    expect(text).toContain('$cls(x === 1);');
    expect(text).toContain('$sty(c);');
  });

  it("assigns ref instead of declaring it, with the tag's own element type", () => {
    const { text } = emitClient(component('    <div ref="@box"></div>'));

    expect(text).toContain("box = $ref<$El<'div'>>();");
    expect(text).not.toContain('const box');
  });

  it('projects <slot> as a marker', () => {
    expect(emitClient(component('    <slot></slot>')).text).toContain('$slot();');
  });
});

describe('control flow', () => {
  it('projects @if / else if / else as real branches', () => {
    const { text } = emitClient(
      component('    @if (a) {\n      <i>@x</i>\n    } else if (b) {\n      <i>@y</i>\n    } else {\n      <i>@z</i>\n    }'),
    );

    expect(text).toContain('if (a) {');
    expect(text).toContain('} else if (b) {');
    expect(text).toContain('} else {');
  });

  it('projects @foreach, @for and @while as loops', () => {
    const { text } = emitClient(
      component(
        '    @foreach (const p of ps) {\n      <i>@p.t</i>\n    }\n' +
          '    @for (let i = 0; i < n; i++) {\n      <i>@i</i>\n    }\n' +
          '    @while (go) {\n      <i>x</i>\n    }',
      ),
    );

    expect(text).toContain('for (const p of ps) {');
    expect(text).toContain('for (let i = 0; i < n; i++) {');
    expect(text).toContain('while (go) {');
  });

  it('breaks every @switch case, since the grammar has no fall-through', () => {
    const { text } = emitClient(
      component('    @switch (k) {\n      case 1:\n        <i>@a</i>\n      default:\n        <i>@b</i>\n    }'),
    );

    expect(text).toContain('switch (k) {');
    expect(text).toContain('case 1: {');
    expect(text).toContain('default: {');
    expect(text.match(/break;/g)).toHaveLength(2);
  });

  it('projects @{ … } as a scoped block, copied verbatim', () => {
    expect(emitClient(component('    @{ const t = 1; }')).text).toContain('const t = 1;');
  });

  it('keeps the virtual parseable when a loop header is missing', () => {
    const { text } = emitClient(
      component('    @foreach {\n      <i>x</i>\n    }\n    @for {\n      <i>y</i>\n    }\n    @while {\n      <i>z</i>\n    }'),
    );

    expect(text).toContain('for (const $item of []) {');
    expect(text).toContain('for (;;) {');
    expect(text).toContain('while (undefined) {');
  });

  it('keeps the virtual parseable when a switch header is missing', () => {
    expect(emitClient(component('    @switch {\n      case 1:\n        <i>x</i>\n    }')).text).toContain(
      'switch (undefined) {',
    );
  });

  it('closes an @if that has no else', () => {
    const { text } = emitClient(component('    @if (a) {\n      <i>@x</i>\n    }'));

    expect(text).toContain('if (a) {');
    expect(text).not.toContain('} else {');
  });

  it('projects nothing for an @if with no arm', () => {
    expect(emitClient(component('    @else {\n      <i>x</i>\n    }')).text).not.toContain('if (');
  });
});

describe('sections and data', () => {
  it('binds a section name to the layout union', () => {
    const { text } = emitClient(
      route('@section nav {\n  <b>x</b>\n}'),
      'blog/index.fud',
      registryOf({}, './_layout.fud'),
    );

    expect(text).toContain("import type { $Sections as $L0 } from './_layout.fud';");
    expect(text).toContain("$section<$L0>('nav');");
  });

  it('declares the union a layout renders, one member per @RenderSection', () => {
    const layout =
      '<!DOCTYPE html>\n<html>\n  <head>@RenderHead()</head>\n  <body>\n    @RenderSection(nav)\n    @RenderSection(aside)\n    @RenderBody()\n  </body>\n</html>\n';

    expect(emitClient(layout, '_layout.fud').text).toContain(
      "export type $Sections = 'nav' | 'aside';",
    );
  });

  it('declares $Sections as never for a file that renders no section', () => {
    expect(emitClient(component('    <i>x</i>')).text).toContain('export type $Sections = never;');
  });

  it('falls back to string when the file declares no layout', () => {
    expect(emitClient(route('@section nav {\n  <b>x</b>\n}')).text).toContain(
      "$section<string>('nav');",
    );
  });

  it('derives data from the server virtual, degrading to unknown with no load()', () => {
    const { text } = emitClient(route('<p>@data.title</p>'), 'blog/[slug].fud');

    expect(text).toContain("typeof import('./[slug].fud.server') extends");
    expect(text).toContain('declare const data: $Data;');
    expect(text).toContain('$text(data.title);');
  });

  it('never declares data for a component', () => {
    expect(emitClient(component('    <i>x</i>')).text).not.toContain('declare const data');
  });
});

describe('client virtual assembly', () => {
  it('projects props, keeps the neutral zone verbatim and scopes the template', () => {
    const source = component(
      '    <span class:on="@(tone === 1)"><slot></slot></span>',
      "@code {\n  type Tone = 1 | 2;\n  const { tone = 1 } = props<{ tone?: Tone }>();\n  @client {\n    let hovered = false;\n  }\n  @server {\n    const secret = 1;\n  }\n}\n\n",
    );
    const { text, fileName } = emitClient(source, 'app-host.fud');

    expect(fileName).toBe('app-host.fud.ts');
    expect(text).toContain('type Tone = 1 | 2;');
    expect(text).toContain('const $p0 = props<{ tone?: Tone }>();');
    expect(text).toContain('const { tone = 1 } = $p0;');
    expect(text).toContain('let hovered = false;');
    expect(text).not.toContain('secret');
    expect(text).toContain('function $tpl(): void {');
    expect(text.trimEnd().endsWith('$tpl;')).toBe(true);
  });

  it('keeps neutral chunks that do not hold the props declaration verbatim', () => {
    const source = component(
      '    <i>@label</i>',
      '@code {\n  const { label } = props<{ label: string }>();\n  @client {\n    let seen = false;\n  }\n  const extra = 1;\n}\n\n',
    );
    const { text } = emitClient(source, 'app-host.fud');

    expect(text).toContain('const $p0 = props<{ label: string }>();');
    expect(text).toContain('const extra = 1;');
  });

  it('still emits a virtual for a component with no shadow template', () => {
    const { text } = emitClient('<app-host>\n  <i>@x</i>\n</app-host>\n', 'app-host.fud');

    expect(text).toContain('function $tpl(): void {');
    expect(text).not.toContain('$text(x);');
  });

  it('declares $Props as never when the component takes none', () => {
    expect(emitClient(component('    <i>x</i>')).text).toContain('export type $Props = never;');
  });

  it('leaves <style> and <script> out of the TypeScript projection', () => {
    const { text } = emitClient(
      component('    <style>p { color: red; }</style>\n    <script>let raw = 1;</script>\n    <p>@x</p>'),
    );

    expect(text).toContain('$text(x);');
    expect(text).not.toContain('color');
    expect(text).not.toContain('raw');
  });

  it('projects the body of a page document', () => {
    const page = '<!DOCTYPE html>\n<html>\n  <head></head>\n  <body>\n    <p>@data.x</p>\n  </body>\n</html>\n';

    expect(emitClient(page, 'index.fud').text).toContain('$text(data.x);');
  });

  it('projects the body of a layout document', () => {
    const layout =
      '<!DOCTYPE html>\n<html>\n  <head>@RenderHead()</head>\n  <body>\n    <p>@data.x</p>\n    @RenderBody()\n  </body>\n</html>\n';

    expect(emitClient(layout, '_layout.fud').text).toContain('$text(data.x);');
  });
});
