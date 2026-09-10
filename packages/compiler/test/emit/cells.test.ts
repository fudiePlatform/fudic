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
import { codeOf, splicedOffset } from '../../src/emit/oxc-code.js';
import { memoryIo, pageModuleOf, ssrIo } from './_support.js';

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

const FORM = `<link rel="component" href="./cell-relay.fud">

@code {
  const { onSave } = props<{ onSave: (what: number) => void }>();
  @client {
    const label = "go";
    function submit() { onSave(1); }
  }
}

<cell-form>
  <template shadowrootmode="open">
    <button @click=@submit>go</button>
    <button @click=@onSave(2)>two</button>
    <button @click=@onSave>bare</button>
    <cell-relay .onSave=@onSave></cell-relay>
  </template>
</cell-form>
`;

const RELAY = `@code {
  const { onSave } = props<{ onSave: (what: number) => void }>();
}

<cell-relay>
  <template shadowrootmode="open">
    <button @click=@onSave(3)>three</button>
  </template>
</cell-relay>
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
    '/cell-relay.fud': RELAY,
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

describe('the payload of the acceptance page (§6.5, §6.6)', () => {
  const g = resolveComponents(
    '/page.fud',
    memoryIo({
      '/page.fud':
        '<!DOCTYPE html>\n<html>\n' +
        '  <head><link rel="component" href="./cc-owner.fud"></head>\n' +
        '  <body><cc-owner></cc-owner></body>\n</html>\n',
      '/cc-owner.fud':
        '<link rel="component" href="./cc-view.fud">\n\n' +
        '@code {\n  const { start = 0 } = props<{ start?: number }>();\n  @client {\n' +
        '    import { signal } from "@fudic/core";\n' +
        '    const count = signal(start);\n' +
        '    function inc() { count.set(count() + 1); }\n' +
        '  }\n}\n\n' +
        '<cc-owner><template shadowrootmode="open">' +
        '<button @click=@inc>+1</button>' +
        '<cc-view .value=@count></cc-view>' +
        '</template></cc-owner>\n',
      '/cc-view.fud':
        '@code {\n  const { value } = props<{ value: Signal<number> }>();\n}\n' +
        '<cc-view><template shadowrootmode="open"><p>@value()</p></template></cc-view>\n',
    }),
  );

  it('the cell in the owner’s slice, the marker in the child’s', async () => {
    const page = await pageModuleOf(g);
    const { io, dom } = ssrIo();
    const html = [...page({}, io)].join('');
    const { offsets, data } = dom().hydrationState();

    // Instance 0 is `[ start=0, count=0 ]`; instance 1 is «my slot is that cell».
    expect([offsets, data]).toEqual([
      [0, 2, 3],
      [0, 0, { $: [0, 1] }],
    ]);

    // §6.6 — the marker points BACKWARDS, always: `claim()` numbers in pre-order, so the
    // owner reserved its id before descending into the shadow the consumer lives in.
    const marks = data.filter((v): v is { $: [number, number] } => typeof v === 'object' && v !== null);
    for (const mark of marks) expect(mark.$[0]).toBeLessThan(data.indexOf(mark));

    // §6.7 — the HTML the browser sees still carries the VALUE.
    expect(html).toContain('value="0"');
  });
});

describe('a callback with no cell — the emit still writes something coherent', () => {
  const g = resolveComponents(
    '/page.fud',
    memoryIo({
      '/page.fud':
        '<link rel="component" href="./neutral-owner.fud">\n' +
        '<html><head></head><body><neutral-owner></neutral-owner></body></html>\n',
      '/neutral-owner.fud':
        '<link rel="component" href="./neutral-sink.fud">\n\n' +
        '@code {\n  function save(n: number) { void n; }\n}\n\n' +
        '<neutral-owner><template shadowrootmode="open">\n' +
        '  <neutral-sink .onSave=@save></neutral-sink>\n' +
        '</template></neutral-owner>\n',
      '/neutral-sink.fud':
        '@code {\n  const { onSave } = props<{ onSave: (n: number) => void }>();\n}\n' +
        '<neutral-sink><template shadowrootmode="open">' +
        '<button @click=@onSave(1)>go</button></template></neutral-sink>\n',
    }),
  );

  it('a function of the NEUTRAL zone gets no cell, and crosses as a reader', () => {
    // `cellSlots` mints cells for `@client` names alone, so a callback declared in the neutral
    // zone has none — which is also why `FUD0201` tells the author to move it. The emit does
    // not stop for a diagnostic (the golden rule), so it still has to hand the child something
    // its `onSave()` can read: the reader alone, with no `??` in front of a cell that does not
    // exist.
    const src = emitComponentClientModule(g, g.components.get('neutral-owner')!);
    expect(src).toContain('.u([, , (() => save)]);');
    expect(src).not.toContain('?.set(save);');
    expect(src).toContain('let [$dom, $shadow] = $props;');
  });
});

describe('splicedOffset — a source offset carried across what was already inserted', () => {
  const statement = {
    text: 'ignored',
    at: 100,
    splices: [
      { at: 4, length: 5 },
      { at: 20, length: 7 },
    ],
  };

  it('counts only what was inserted BEFORE it', () => {
    expect(splicedOffset(statement, 102)).toBe(2); // nothing in front of it
    expect(splicedOffset(statement, 110)).toBe(15); // the first splice moved it five along
    expect(splicedOffset(statement, 130)).toBe(42); // both did
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

  it('hands a callback over as its CELL, never as the bare function', () => {
    // A signal and a function are not symmetric, and this is where it shows. `count` IS its
    // own cell — the splice above made the declaration and the cell one object — so it crosses
    // under its own name. `save` is a plain function and its cell is the separate `$p4`, so
    // handing the name over made the child, which reads `onSave()` at dispatch, CALL the
    // author's function to unwrap it: `save()` ran with no argument and its return was then
    // invoked. `$p4` on the `h` path is the same cell the runtime already put in the child's
    // slice; the reader is the `c` path, where there is no payload and no cell to find.
    expect(src).toContain('.u([, , ($p4 ?? (() => save))]);');
    expect(src).not.toMatch(/\.u\(\[, , save\]\)/u);
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

describe('the child of a callback — a cell is READ at the moment it is called (§6.13)', () => {
  const src = chunk('cell-form');

  it('a call inside `@client` reads the cell first', () => {
    expect(src).toContain('function submit() { onSave()(1); }');
  });

  it('a call written straight into an `@event` too', () => {
    expect(src).toContain('"click", ($event) => onSave()(2)');
  });

  it('and a bare reference is deferred to dispatch, because the cell may still be empty', () => {
    expect(src).toContain('"click", ($event) => onSave()($event)');
  });

  it('but handing the callback ON to a grandchild passes the CELL, not a call', () => {
    expect(src).toMatch(/\.u\(\[, , onSave\]\)/u);
    expect(chunk('cell-relay')).toContain('"click", ($event) => onSave()(3)');
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
