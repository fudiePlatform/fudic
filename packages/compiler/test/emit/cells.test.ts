/**
 * Decision 105 in the emit: WHO decides the form of a crossing, and what each of the two
 * branches writes once it is decided (BUG-24 §4.1–§4.5).
 *
 * The graph is built in memory rather than out of a fixture because the fact under test is
 * about TWO files at once: the child's `props<T>()` is what moves the parent's emit, and a
 * one-file case could not state that.
 */
import { describe, expect, it } from 'vitest';
import {
  resolveComponents,
  emitComponentClientModule,
  emitComponentModule,
  type ComponentGraph,
} from '../../src/emit/index.js';
import { cellSlots, childTargets } from '../../src/emit/state.js';
import { codeOf, shiftedOffset } from '../../src/emit/oxc-code.js';
import { memoryIo } from './_support.js';

const PARENT = `<link rel="component" href="./cell-child.fud">
<link rel="component" href="./cell-form.fud">

@code {
  const { start = 0 } = props<{ start?: number }>();
  @client {
    import { signal } from "@fudic/core";
    const count = signal(start);
    function save(what) { count.set(what); }
    function inc() { count.set(count() + 1); }
  }
}

<cell-parent>
  <template shadowrootmode="open">
    <p>@(count())</p>
    <button @click=@inc>+1</button>
    <cell-child .value=@count></cell-child>
    <cell-form .onSave=@save></cell-form>
  </template>
</cell-parent>
`;

const CHILD = `<link rel="component" href="./cell-kid.fud">

@code {
  const { value } = props<{ value: Signal<number> }>();
  @client {
    import { computed } from "@fudic/core";
    const doble = computed(() => value() * 2);
  }
}

<cell-child>
  <template shadowrootmode="open">
    <p>@value() · @doble()</p>
    <cell-kid .value=@value></cell-kid>
  </template>
</cell-child>
`;

const KID = `@code {
  const { value } = props<{ value: Signal<number> }>();
}

<cell-kid>
  <template shadowrootmode="open">
    <p>@value()</p>
  </template>
</cell-kid>
`;

const FORM = `@code {
  const { onSave } = props<{ onSave: (what: number) => void }>();
  @client {
    function submit() { onSave(1); }
  }
}

<cell-form>
  <template shadowrootmode="open">
    <button @click=@submit>go</button>
  </template>
</cell-form>
`;

/** The same page every case below is compiled from: owner → child → grandchild, plus a form. */
const graph: ComponentGraph = resolveComponents(
  '/page.fud',
  memoryIo({
    '/page.fud':
      '<link rel="component" href="./cell-parent.fud">\n' +
      '<html><head></head><body><cell-parent></cell-parent></body></html>\n',
    '/cell-parent.fud': PARENT,
    '/cell-child.fud': CHILD,
    '/cell-kid.fud': KID,
    '/cell-form.fud': FORM,
  }),
);

const comp = (tag: string) => graph.components.get(tag)!;
const chunk = (tag: string): string => emitComponentClientModule(graph, comp(tag));
const server = (tag: string): string => emitComponentModule(graph, comp(tag));

describe('Prop.channel — what the child asks to be handed (§6.2)', () => {
  it('is `signal` for Signal<T>, `fn` for a function signature, absent for a plain value', () => {
    expect(codeOf(comp('cell-child')).props).toEqual([
      { name: 'value', optional: false, channel: 'signal' },
    ]);
    expect(codeOf(comp('cell-form')).props).toEqual([
      { name: 'onSave', optional: false, channel: 'fn' },
    ]);
    expect(codeOf(comp('cell-parent')).props).toEqual([
      { name: 'start', def: '0', optional: true },
    ]);
  });

  it('marks nothing for a type that is not exactly `Signal<…>` or a signature', () => {
    // A qualified name is not something this file declared; another generic is not `Signal`;
    // a member with no type at all says nothing. None of the three is an error here — the
    // answer is «no channel», and everything keeps crossing by value.
    const g = resolveComponents(
      '/page.fud',
      memoryIo({
        '/page.fud':
          '<link rel="component" href="./cell-types.fud">\n' +
          '<html><head></head><body><cell-types></cell-types></body></html>\n',
        '/cell-types.fud':
          '@code {\n' +
          '  const { qualified, other, plain, bare } =\n' +
          '    props<{ qualified: core.Signal<number>; other: Other<number>; plain: number; bare }>();\n' +
          '}\n' +
          '<cell-types><template shadowrootmode="open"><p>@plain</p></template></cell-types>\n',
      }),
    );
    expect(codeOf(g.components.get('cell-types')!).props).toEqual([
      { name: 'qualified', optional: false },
      { name: 'other', optional: false },
      { name: 'plain', optional: false },
      { name: 'bare', optional: false },
    ]);
  });

  it('marks nothing when `T` is not a literal this file can read (BUG-23 §4.4)', () => {
    const g = resolveComponents(
      '/page.fud',
      memoryIo({
        '/page.fud':
          '<link rel="component" href="./cell-opaque.fud">\n' +
          '<html><head></head><body><cell-opaque></cell-opaque></body></html>\n',
        '/cell-opaque.fud':
          '@code {\n  const { value } = props<Foo>();\n}\n' +
          '<cell-opaque><template shadowrootmode="open"><p>@value</p></template></cell-opaque>\n',
      }),
    );
    expect(codeOf(g.components.get('cell-opaque')!).props).toEqual([
      { name: 'value', optional: true },
    ]);
  });
});

describe('cellSlots — the casillas a component publishes (§6.3)', () => {
  it('puts them BEHIND the props, in declaration order', () => {
    // `start` is prop 0; `count` and `save` follow in the order `@client` declares them.
    // `inc` is declared between them and does not cross, so it takes no slot.
    expect(cellSlots(comp('cell-parent'), graph)).toEqual([
      { name: 'count', slot: 1, kind: 'signal' },
      { name: 'save', slot: 2, kind: 'fn' },
    ]);
  });

  it('a FORWARDED prop is nobody’s new cell: the child publishes none', () => {
    // `cell-child` hands `value` on to `cell-kid`, and the marker the grandchild carries
    // points at the ORIGINAL owner. A slot here would be a second address for one object.
    expect(cellSlots(comp('cell-child'), graph)).toEqual([]);
  });

  it('a component nobody asks anything of publishes none', () => {
    expect(cellSlots(comp('cell-kid'), graph)).toEqual([]);
  });

  it('a tag the graph does not know declares nothing, and everything crosses by value', () => {
    expect(childTargets(graph)('cell-missing')).toBeUndefined();
  });
});

describe('two cells in one component — the splices are applied back to front', () => {
  const g = resolveComponents(
    '/page.fud',
    memoryIo({
      '/page.fud':
        '<link rel="component" href="./two-owner.fud">\n' +
        '<html><head></head><body><two-owner></two-owner></body></html>\n',
      '/two-owner.fud':
        '<link rel="component" href="./two-sink.fud">\n\n' +
        '@code {\n  @client {\n' +
        '    import { signal } from "@fudic/core";\n' +
        '    const a = signal(1), b = signal(2);\n' +
        '  }\n}\n\n' +
        '<two-owner><template shadowrootmode="open">\n' +
        '  <two-sink .a=@a .b=@b></two-sink>\n' +
        '</template></two-owner>\n',
      '/two-sink.fud':
        '@code {\n  const { a, b } = props<{ a: Signal<number>; b: Signal<number> }>();\n}\n' +
        '<two-sink><template shadowrootmode="open"><p>@a() @b()</p></template></two-sink>\n',
    }),
  );

  it('splices both, and neither offset moves the other', () => {
    // Two edits in the SAME statement: applied by descending offset, so the first insertion
    // cannot push the second one's position along.
    const src = emitComponentClientModule(g, g.components.get('two-owner')!);
    expect(src).toContain('const a = $p2 ?? signal(1), b = $p3 ?? signal(2);');
    // And the owner forwards neither: both children hold the very cells it does.
    expect(src).toContain('$n0.u([, , a, b]);');
    expect(src).not.toMatch(/\$sub\(a, \(\$v\)/u);
  });
});

describe('shiftedOffset — an offset carried across the `emit(…)` splices (§4.4)', () => {
  const call = { calleeEnd: 10, hostAt: 11, hasArgs: true };

  it('moves an offset behind a splice, and leaves one in front of it alone', () => {
    expect(shiftedOffset(5, [call])).toBe(5);
    // `.call` before it and `$host, ` before it: five characters plus seven.
    expect(shiftedOffset(40, [call])).toBe(52);
    expect(shiftedOffset(40, [{ ...call, hasArgs: false }])).toBe(50);
  });
});

describe('the owner’s chunk — one expression, not two branches (§6.4)', () => {
  const src = chunk('cell-parent');

  it('takes its cells positionally, behind the props', () => {
    expect(src).toContain('let [$dom, $shadow, start = 0, $p3, $p4] = $props;');
  });

  it('receives the cell where the author wrote the initialiser', () => {
    expect(src).toContain('const count = $p3 ?? signal(start);');
  });

  it('fills the callback cell as it hooks up, and tolerates not having one', () => {
    expect(src).toContain('$p4?.set(save);');
  });

  it('does NOT forward the reference: no subscription writes the child’s slot', () => {
    expect(src).not.toMatch(/\$sub\(count, \(\$v\)/u);
    // What it still does is hand the object over once, for an instance `c` fabricated.
    expect(src).toMatch(/\.u\(\[, , count\]\)/u);
  });
});

describe('the child — a prop by reference is a reactive name more (§6.4)', () => {
  const src = chunk('cell-child');

  it('subscribes it as it would one of its own', () => {
    expect(src).toContain('$d.push($sub(value, $u));');
  });

  it('crosses it on to the grandchild as the OBJECT, not as the read', () => {
    expect(src).toMatch(/\.u\(\[, , value\]\)/u);
  });
});

describe('the server — the object in the render, the value in the markup (§4.7)', () => {
  const src = server('cell-parent');

  it('passes the child the live object: in this process there is no cable', () => {
    expect(src).toContain('{ "value": count }');
  });

  it('still paints the VALUE in the level-1 attribute', () => {
    expect(src).toContain('const $v = count();');
    expect(src).toContain('$dom.setAttr($n7, "value", String($v))');
  });

  it('paints no attribute for a callback: a function has no HTML form', () => {
    expect(src).not.toContain('"onSave",');
    expect(src).toContain('{ "onSave": save }');
  });

  it('stubs the callback: `@client` never runs here, and what SSR needs is its identity', () => {
    expect(src).toContain('const save = () => {}; // inert callback (SSR)');
  });
});
