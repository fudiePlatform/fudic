/**
 * `FUD0200`–`FUD0203` — a prop that asked for a channel has to be fed something that can be
 * one (BUG-24 §4.9, criteria §6.18, §6.19).
 *
 * Every case is compiled from a real two-file graph, because that is what the rule is about:
 * what one file may write depends on what ANOTHER declares, and only a caller that resolved
 * the graph can put the two side by side.
 */
import { describe, expect, it } from 'vitest';
import { resolveComponents, type ComponentGraph } from '../../src/emit/index.js';
import { contractDiagnostics } from '../../src/emit/registry.js';
import { checkPropChannel } from '../../src/semantic/analyzers/prop-channel.js';
import { memoryIo } from './_support.js';

/** The child every case crosses towards: a signal prop, a callback prop, and a plain one. */
const SINK = `@code {
  const { value, onSave, plain = 0 } =
    props<{ value: Signal<number>; onSave: (n: number) => void; plain?: number }>();
  @client {
    import { computed } from "@fudic/core";
    const doble = computed(() => value() * 2);
    function go() { onSave(1); }
  }
}

<cell-sink>
  <template shadowrootmode="open">
    <button @click=@go>@doble()</button>
  </template>
</cell-sink>
`;

/** The same child, but one that WRITES the signal it was handed. */
const WRITER = `@code {
  const { value } = props<{ value: Signal<number> }>();
  @client {
    function bump() { value.set(1); }
  }
}

<cell-writer>
  <template shadowrootmode="open">
    <button @click=@bump>bump</button>
  </template>
</cell-writer>
`;

/**
 * A component with nothing of its own: no signal, no handler, no `@client` — and a CALLBACK
 * prop, which is the one channel the level rule cannot rescue.
 *
 * A signal that crosses makes the child hydratable on its own (`level.ts`: a reactive value
 * handed over is what property drilling is), so `FUD0202` could never fire for one. A function
 * moves nothing and reads nothing, so a child that takes one and does nothing else stays level
 * 1 — and that is exactly the crossing that would go silently nowhere.
 */
const INERT = `@code {
  const { onSave } = props<{ onSave: (n: number) => void }>();
}

<cell-inert>
  <template shadowrootmode="open">
    <p>nothing to do</p>
  </template>
</cell-inert>
`;

/** Compile a parent whose `@client` and template are given, and report what the build says. */
function codesOf(client: string, template: string, children = ['cell-sink']): readonly string[] {
  const links = children.map((tag) => `<link rel="component" href="./${tag}.fud">`).join('\n');
  const files: Record<string, string> = {
    '/page.fud':
      '<link rel="component" href="./cell-top.fud">\n' +
      '<html><head></head><body><cell-top></cell-top></body></html>\n',
    '/cell-top.fud':
      `${links}\n\n@code {\n  @client {\n    import { signal, computed } from "@fudic/core";\n${client}\n  }\n}\n\n` +
      `<cell-top>\n  <template shadowrootmode="open">\n${template}\n  </template>\n</cell-top>\n`,
    '/cell-sink.fud': SINK,
    '/cell-writer.fud': WRITER,
    '/cell-inert.fud': INERT,
  };
  const io = memoryIo(files);
  // The rule is about the file being compiled, so the graph is entered at the PARENT.
  const graph: ComponentGraph = resolveComponents('/cell-top.fud', io);
  return contractDiagnostics(graph).map((d) => d.code);
}

const OWN = '    const count = signal(0);\n    function save(n) { count.set(n); }';

describe('a well-formed crossing says nothing', () => {
  it('a signal into Signal<T>, a function into a callback, a value into a plain prop', () => {
    expect(
      codesOf(
        OWN,
        '    <cell-sink .value=@count .onSave=@save .plain="@(count() + 1)"></cell-sink>',
      ),
    ).toEqual([]);
  });
});

describe('FUD0200 — a Signal<T> prop fed something that is not a reactive', () => {
  it('a literal', () => {
    const codes = codesOf(OWN, '    <cell-sink .value=@42 .onSave=@save></cell-sink>');
    expect(codes).toContain('FUD0200');
  });

  it('a compound expression, which is a value and not a channel', () => {
    const codes = codesOf(OWN, '    <cell-sink .value="@(count() + 1)" .onSave=@save></cell-sink>');
    expect(codes).toContain('FUD0200');
  });

  it('a name that is a function rather than a signal', () => {
    const codes = codesOf(OWN, '    <cell-sink .value=@save .onSave=@save></cell-sink>');
    expect(codes).toContain('FUD0200');
  });
});

describe('FUD0200 — and the shapes that are not an expression at all', () => {
  it('a literal', () => {
    const codes = codesOf(OWN, '    <cell-sink .value="hola" .onSave=@save></cell-sink>');
    expect(codes).toContain('FUD0200');
  });

  it('a `.prop` with nothing after the dot’s name', () => {
    const codes = codesOf(OWN, '    <cell-sink .value .onSave=@save></cell-sink>');
    expect(codes).toContain('FUD0200');
  });
});

describe('FUD0201 — a callback prop fed something that is not a function', () => {
  it('a signal', () => {
    const codes = codesOf(OWN, '    <cell-sink .value=@count .onSave=@count></cell-sink>');
    expect(codes).toContain('FUD0201');
  });

  it('a name nothing declares', () => {
    const codes = codesOf(OWN, '    <cell-sink .value=@count .onSave=@nope></cell-sink>');
    expect(codes).toContain('FUD0201');
  });
});

describe('FUD0202 — a cell towards a component that never hydrates', () => {
  it('is reported, and it is the one that pays for the rest', () => {
    const codes = codesOf(OWN, '    <cell-inert .onSave=@save></cell-inert>', ['cell-inert']);
    expect(codes).toEqual(['FUD0202']);
  });

  it('and it is asked LAST: a bad value is reported as the value it is', () => {
    const codes = codesOf(OWN, '    <cell-inert .onSave=@count></cell-inert>', ['cell-inert']);
    expect(codes).toEqual(['FUD0201']);
  });
});

describe('FUD0203 — a computed towards a prop the child writes', () => {
  const DERIVED = `${OWN}\n    const doble = computed(() => count() * 2);`;

  it('is reported when the child really writes it', () => {
    const codes = codesOf(DERIVED, '    <cell-writer .value=@doble></cell-writer>', ['cell-writer']);
    expect(codes).toContain('FUD0203');
  });

  it('and NOT when the child only reads it: a derived value crosses perfectly well', () => {
    const codes = codesOf(DERIVED, '    <cell-sink .value=@doble .onSave=@save></cell-sink>');
    expect(codes).toEqual([]);
  });
});

describe('a component that FORWARDS what it received is feeding a channel legitimately', () => {
  it('says nothing: a prop that arrived as a cell is a channel of its own', () => {
    const io = memoryIo({
      '/cell-mid.fud':
        '<link rel="component" href="./cell-sink.fud">\n\n' +
        '@code {\n' +
        '  const { value, onSave, plain = 0 } =\n' +
        '    props<{ value: Signal<number>; onSave: (n: number) => void; plain?: number }>();\n' +
        '}\n\n' +
        '<cell-mid><template shadowrootmode="open">\n' +
        '  <button @click=@onSave(1)>go</button>\n' +
        '  <cell-sink .value=@value .onSave=@onSave .plain=@plain></cell-sink>\n' +
        '</template></cell-mid>\n',
      '/cell-sink.fud': SINK,
    });
    const graph = resolveComponents('/cell-mid.fud', io);
    expect(contractDiagnostics(graph).map((d) => d.code)).toEqual([]);
  });
});

describe('with no `propsOf` the rule is silent entirely', () => {
  it('which is the editor, where TypeScript already says it better (BUG-23 §4.4)', () => {
    const io = memoryIo({
      '/cell-top.fud':
        '<link rel="component" href="./cell-sink.fud">\n\n' +
        '<cell-top><template shadowrootmode="open">' +
        '<cell-sink .value=@42></cell-sink>' +
        '</template></cell-top>\n',
      '/cell-sink.fud': SINK,
    });
    const graph = resolveComponents('/cell-top.fud', io);
    const out: string[] = [];
    checkPropChannel(
      {
        source: graph.entrySource,
        document: graph.entry,
        components: { has: () => true },
        names: new Map(),
      },
      (d) => out.push(d.code),
    );
    expect(out).toEqual([]);
  });
});

describe('§6.19 — with no `T` to read there is no diagnostic', () => {
  it('`props<Foo>()` produces none of the four', () => {
    const io = memoryIo({
      '/cell-top.fud':
        '<link rel="component" href="./cell-opaque.fud">\n\n' +
        '@code {\n  @client {\n    import { signal } from "@fudic/core";\n' +
        '    const count = signal(0);\n  }\n}\n\n' +
        '<cell-top><template shadowrootmode="open">' +
        '<cell-opaque .value=@42></cell-opaque>' +
        '</template></cell-top>\n',
      '/cell-opaque.fud':
        '@code {\n  const { value } = props<Foo>();\n}\n' +
        '<cell-opaque><template shadowrootmode="open"><p>@value</p></template></cell-opaque>\n',
    });
    const graph = resolveComponents('/cell-top.fud', io);
    expect(contractDiagnostics(graph).map((d) => d.code)).toEqual([]);
  });
});
