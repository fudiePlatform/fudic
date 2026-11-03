/**
 * The contract of a component (SDD-36, moved here by SDD-63 §3.1).
 *
 * `contractOf` is proved over real parses: what the source says, and nothing a checker would
 * have to add. `propDetails` and `typedContract` are proved twice — over a hand-made service for
 * the paths where the program is missing, and over a real TypeScript language service for the
 * types and docs that only the checker can read.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import ts from 'typescript';
import { JsBatch } from '@fudic/compiler';
import { contractOf, propDetails, typedContract, unstarred, type Contract } from '../src/contract.js';
import { parseFud } from '../src/parse.js';
import { clientFileName, mapToGenerated, type VirtualFile } from '@fudic/language-core';
import { LAYOUT, PAGE, projected, route } from './_support.js';

const doc = (source: string) => parseFud(source).document;
const contract = (source: string): Contract => contractOf(source, doc(source));

/** What everything that is not a component declares. */
const EMPTY: Contract = {
  props: [],
  slots: [],
  defaultSlot: false,
  events: [],
  parts: [],
  partsDynamic: false,
  tokens: [],
};

/** A component `app-x` with `code` as its `@code` and `template` inside its shadow root. */
const componentWith = (code: string, template = '<span>x</span>'): string =>
  `@code {\n${code}\n}\n` +
  `<app-x>\n  <template shadowrootmode="open">${template}</template>\n</app-x>\n`;

describe('contractOf', () => {
  it('is empty for a page and for a route: nobody writes them as an element', () => {
    expect(contract(PAGE)).toEqual(EMPTY);
    expect(contract(route('../layouts/_layout.fud'))).toEqual(EMPTY);
  });

  it('is empty for a layout without `@code`', () => {
    expect(contract(LAYOUT)).toEqual(EMPTY);
  });

  it('gives a layout its props and nothing else', () => {
    // A layout's `@code` is written in its `<head>`: before the `<!DOCTYPE>` it would be a
    // component's.
    const source = LAYOUT.replace(
      '@RenderHead()',
      '@code {\n      const { title } = props<{ title: string }>();\n    }\n    @RenderHead()',
    );
    expect(doc(source).type).toBe('layout-document');

    expect(contract(source)).toEqual({
      ...EMPTY,
      props: [{ name: 'title', required: true, type: 'string' }],
    });
  });

  it('gives a component without `@code` its slots and nothing else', () => {
    const source =
      '<app-x>\n  <template shadowrootmode="open">' +
      '<slot name="icon"></slot><slot></slot></template>\n</app-x>\n';

    expect(contract(source)).toEqual({ ...EMPTY, slots: ['icon'], defaultSlot: true });
  });

  it('names only the slots a consumer can write into `slot=`', () => {
    const template =
      '<slot name="icon"></slot>' +
      '<slot name=""></slot>' +
      '<slot id="a" name="end"></slot>' +
      '<slot name="@(dyn)"></slot>' +
      '<slot></slot>' +
      '<span name="no-slot"></span>';

    expect(contract(componentWith('  const dyn = "x";', template)).slots).toEqual(['icon', 'end']);
  });

  it('reads the props: the name, the `?` and the type as written', () => {
    const { props } = contract(
      componentWith("  const { label, variant } = props<{ label: string; variant?: 'a' | 'b' }>();"),
    );

    expect(props).toEqual([
      { name: 'label', required: true, type: 'string' },
      { name: 'variant', required: false, type: "'a' | 'b'" },
    ]);
  });

  it('leaves `type` out when the file states none', () => {
    const { props } = contract(componentWith('  const { label } = props();'));

    expect(props).toHaveLength(1);
    expect(props[0]).not.toHaveProperty('type');
  });

  it('reads each event once, and only those whose name resolves statically', () => {
    const code =
      '  import { emit } from "@fudic/dom";\n' +
      '  const name = "x";\n' +
      '  function a() { emit("change"); emit(name); }\n' +
      '  function b() { emit("change"); emit("close"); }';

    expect(contract(componentWith(code)).events).toEqual([{ name: 'change' }, { name: 'close' }]);
  });

  it('leaves `doc` out when the component documents nothing', () => {
    expect(contract(componentWith('  const a = 1;'))).not.toHaveProperty('doc');
  });

  it('builds the whole contract with one Oxc invocation (SDD-63 §6.6)', () => {
    const parse = vi.spyOn(JsBatch.prototype, 'parse');
    const source = componentWith(
      '  import { emit } from "@fudic/dom";\n' +
        '  /** A component. */\n' +
        '  const { a = 1 } = props<{ a?: number }>();\n' +
        '  function go() { emit("go"); }',
      '<slot></slot>',
    );
    const document = doc(source);
    parse.mockClear();

    const built = contractOf(source, document);

    // `parse` is memoized per batch, so what counts is how many batches reached Oxc.
    expect(new Set(parse.mock.contexts).size).toBe(1);
    expect(built.props).toHaveLength(1);
    expect(built.events).toEqual([{ name: 'go' }]);
    expect(built.doc).toBe('A component.');
  });
});

/**
 * Where a component's own JSDoc is read from (decision 107).
 *
 * The rule is «the first one at the TOP LEVEL of a neutral chunk», and most of what follows is
 * a way of getting the level wrong: a member's doc lives inside braces, and a `{` inside a
 * string is not a brace.
 */
describe('the doc of a component', () => {
  const docOf = (code: string): string | undefined => contract(componentWith(code)).doc;

  it('takes the one written beside the declarations', () => {
    expect(docOf('  /** Un input. */\n  const { a } = props<{ a?: string }>();')).toBe('Un input.');
  });

  it('never takes one written on a member of the type', () => {
    expect(
      docOf('  const { a } = props<{\n    /** El id. */\n    a?: string;\n  }>();'),
    ).toBeUndefined();
  });

  it('never takes one written inside a call or an array', () => {
    expect(docOf('  const a = [\n    /** dentro */\n    1,\n  ];')).toBeUndefined();
    expect(docOf('  const a = fn(\n    /** dentro */\n    1,\n  );')).toBeUndefined();
  });

  it('does not count a brace that is inside a string', () => {
    expect(docOf('  const a = "{";\n  /** Después. */\n  const b = 1;')).toBe('Después.');
    expect(docOf("  const a = '{';\n  /** Después. */\n  const b = 1;")).toBe('Después.');
    expect(docOf('  const a = `{`;\n  /** Después. */\n  const b = 1;')).toBe('Después.');
  });

  it('does not end a string at an escaped quote', () => {
    expect(docOf('  const a = "\\"{";\n  /** Después. */\n  const b = 1;')).toBe('Después.');
  });

  it('survives a string nobody closed', () => {
    expect(docOf('  const a = "sin cerrar')).toBeUndefined();
  });

  it('skips a line comment', () => {
    expect(docOf('  // nota\n  /** Después. */\n  const b = 1;')).toBe('Después.');
    expect(docOf('  const a = 1;\n  // hasta el final')).toBeUndefined();
  });

  it('skips a line comment that reaches the end of the chunk with no newline', () => {
    const source =
      `<app-x>\n  <template shadowrootmode="open"><span>x</span></template>\n</app-x>\n` +
      `@code {\n  // hasta el final`;

    expect(contract(source).doc).toBeUndefined();
  });

  it('skips a block comment that is not a JSDoc', () => {
    expect(docOf('  /* nota */\n  /** Después. */\n  const b = 1;')).toBe('Después.');
  });

  it('is not confused by a `/` that opens no comment at all', () => {
    expect(docOf('  const a = 1 / 2;\n  /** Después. */\n  const b = 1;')).toBe('Después.');
  });

  it('survives a comment nobody closed', () => {
    expect(docOf('  /** sin cerrar')).toContain('sin cerrar');
    expect(docOf('  /* sin cerrar')).toBeUndefined();
  });

  it('looks in the next chunk when the first one documents nothing', () => {
    const code = '  @server {\n    const a = 1;\n  }\n  /** En el segundo. */\n  const b = 2;';

    expect(docOf(code)).toBe('En el segundo.');
  });
});

describe('unstarred', () => {
  it('drops the leading stars and the indent of every line', () => {
    expect(unstarred('\n   * One.\n   * Two.\n   ')).toBe('One.\nTwo.');
  });

  it('is undefined for a JSDoc that says nothing', () => {
    expect(unstarred('  \n * \n ')).toBeUndefined();
  });
});

/**
 * The paths where the typed half does not arrive. A hand-made service, because a real one
 * cannot be made to lack a program.
 */
describe('propDetails, degraded', () => {
  const FILE = '/p/components/app-button.fud';

  const serviceOf = (program: unknown): ts.LanguageService =>
    ({ getProgram: () => program }) as unknown as ts.LanguageService;

  const programOf = (source: unknown, checker: unknown): unknown => ({
    getSourceFile: (name: string) => (name === FILE ? source : undefined),
    getTypeChecker: () => checker,
  });

  it('answers nothing when no TypeScript is mounted at all', () => {
    expect(propDetails(undefined, FILE).size).toBe(0);
  });

  it('answers nothing while the program is not built', () => {
    expect(propDetails(serviceOf(undefined), FILE).size).toBe(0);
  });

  it('answers nothing for a file the program does not have', () => {
    expect(propDetails(serviceOf(programOf({}, {})), '/p/components/ghost.fud').size).toBe(0);
  });

  it('answers nothing for a projection that is not a module', () => {
    const checker = { getSymbolAtLocation: () => undefined };

    expect(propDetails(serviceOf(programOf({}, checker)), FILE).size).toBe(0);
  });

  it('answers nothing for a projection that exports no contract', () => {
    const checker = {
      getSymbolAtLocation: () => ({}),
      getExportsOfModule: () => [{ name: '$Slots' }],
    };

    expect(propDetails(serviceOf(programOf({}, checker)), FILE).size).toBe(0);
  });

  it('reads a prop whose symbol has no declaration to look at', () => {
    const prop = { name: 'label', getDocumentationComment: () => [], declarations: undefined };
    const checker = {
      getSymbolAtLocation: () => ({}),
      getExportsOfModule: () => [{ name: '$Props' }],
      getDeclaredTypeOfSymbol: () => ({ getProperties: () => [prop] }),
      getTypeOfSymbolAtLocation: () => ({ isUnion: () => false, isStringLiteral: () => true }),
      typeToString: () => 'string',
    };

    expect(propDetails(serviceOf(programOf({}, checker)), FILE).get('label')).toEqual({
      type: 'string',
      holds: 'string',
    });
  });
});

/** A real language service over one in-memory `.ts` file at `FILE`. */
function serviceOver(text: string): ts.LanguageService {
  return serviceAt(FILE, text);
}

/** A real language service over one in-memory `.ts` file at `name`. */
function serviceAt(name: string, text: string): ts.LanguageService {
  const files = new Map([[name, text]]);
  const host: ts.LanguageServiceHost = {
    getScriptFileNames: () => [name],
    getScriptVersion: () => '1',
    getScriptSnapshot: (name) => {
      const content = files.get(name);
      return content === undefined ? undefined : ts.ScriptSnapshot.fromString(content);
    },
    getCurrentDirectory: () => '/p',
    getCompilationSettings: () => ({ noLib: true, strict: true }),
    getDefaultLibFileName: () => 'lib.d.ts',
    fileExists: (name) => files.has(name),
    readFile: (name) => files.get(name),
  };
  return ts.createLanguageService(host);
}

const FILE = '/p/app-x.ts';

/**
 * A `$Props` written straight as a type: what `propDetails` reads is the exported name and its
 * members, whichever chain the projection takes to reach them.
 */
const PROPS = `
export type $Props = {
  /** The text. */
  label: string;
  count: number;
  open: boolean;
  variant: 'a' | 'b';
  one: 1;
  small: 1 | 2;
  mixed: 'a' | 1;
  either: number | boolean;
  shape: { x: number };
  done: true;
  trailing: number /** After it. */;
  plain: number /* not a doc */;
  empty: number /** */;
  nested: { /** Inside. */ x: number };
};
`;

describe('propDetails, over a real checker', () => {
  const details = propDetails(serviceOver(PROPS), FILE);

  it.each([
    ['label', 'string', 'string'],
    ['count', 'number', 'number'],
    ['open', 'boolean', 'boolean'],
    ['variant', '"a" | "b"', 'string'],
    ['one', '1', 'number'],
    ['small', '1 | 2', 'number'],
    ['mixed', '"a" | 1', 'string'],
    ['either', 'number | boolean', 'other'],
    ['shape', '{ x: number; }', 'other'],
    ['done', 'true', 'boolean'],
  ])('reads %s as %s, holding %s', (name, type, holds) => {
    expect(details.get(name)).toMatchObject({ type, holds });
  });

  it('reads the JSDoc written before a member', () => {
    expect(details.get('label')?.doc).toBe('The text.');
  });

  it('reads the JSDoc written after a member', () => {
    expect(details.get('trailing')?.doc).toBe('After it.');
  });

  it.each(['count', 'plain', 'empty', 'nested'])('reads no doc on %s', (name) => {
    expect(details.get(name)).not.toHaveProperty('doc');
  });
});

describe('typedContract', () => {
  const parsed: Contract = {
    props: [
      { name: 'label', required: true, type: 'string' },
      { name: 'count', required: false },
      { name: 'ghost', required: false, type: 'Ghost' },
    ],
    slots: ['icon'],
    defaultSlot: false,
    events: [{ name: 'press' }],
    parts: [],
    partsDynamic: false,
    tokens: [],
    doc: 'A component.',
  };

  it('is the same contract when the checker knows nothing', () => {
    expect(typedContract(parsed, undefined, FILE)).toBe(parsed);
  });

  it("adds the checker's type and doc, and keeps a prop the checker does not know", () => {
    expect(typedContract(parsed, serviceOver(PROPS), FILE)).toEqual({
      props: [
        { name: 'label', required: true, type: 'string', doc: 'The text.' },
        { name: 'count', required: false, type: 'number' },
        { name: 'ghost', required: false, type: 'Ghost' },
      ],
      slots: ['icon'],
      defaultSlot: false,
      events: [{ name: 'press' }],
      parts: [],
      partsDynamic: false,
      tokens: [],
      doc: 'A component.',
    });
  });
});

/** SDD-63 §4.1 and §6.1–6.5: what the contract learned to say, read from the parse alone. */
describe('the contract, piece by piece (SDD-63)', () => {
  it('§6.1 — reads the default value as written', () => {
    const { props } = contract(
      componentWith("  const { variant = 'primary', label } = props<{ variant?: 'primary' | 'ghost'; label: string }>();"),
    );

    expect(props[0]).toEqual({
      name: 'variant',
      required: false,
      type: "'primary' | 'ghost'",
      default: "'primary'",
    });
    expect(props[1]).not.toHaveProperty('default');
  });

  it('§6.2 — tells whether the template has a default slot', () => {
    expect(contract(componentWith('  const a = 1;', '<slot></slot><slot name="icon"></slot>'))).toMatchObject({
      defaultSlot: true,
      slots: ['icon'],
    });
    // `name=""` is the default slot too (decision 44).
    expect(contract(componentWith('  const a = 1;', '<slot name=""></slot>')).defaultSlot).toBe(true);
    // An interpolated name is neither a named slot nor the default one.
    expect(contract(componentWith('  const n = "a";', '<slot name="@(n)"></slot>'))).toMatchObject({
      defaultSlot: false,
      slots: [],
    });
    expect(contract(componentWith('  const a = 1;')).defaultSlot).toBe(false);
  });

  describe('§6.3 — the doc of an event', () => {
    const eventsOf = (body: string) =>
      contract(componentWith(`  import { emit } from "@fudic/dom";\n${body}`)).events;

    it('is the JSDoc right before the statement that emits it', () => {
      expect(eventsOf('  /** Fired on click. */\n  emit("press", 1);')).toEqual([
        { name: 'press', doc: 'Fired on click.' },
      ]);
    });

    it('is the one before the FIRST statement that emits it', () => {
      const events = eventsOf(
        '  function a() {\n    emit("press");\n  }\n  function b() {\n    /** Later. */\n    emit("press");\n  }',
      );

      expect(events).toEqual([{ name: 'press' }]);
    });

    it('is the one before the innermost statement, not the function around it', () => {
      const events = eventsOf('  /** The function. */\n  function a() {\n    /** The event. */\n    emit("press");\n  }');

      expect(events).toEqual([{ name: 'press', doc: 'The event.' }]);
    });

    it('is not a plain block comment', () => {
      expect(eventsOf('  /* not a doc */\n  emit("press");')).toEqual([{ name: 'press' }]);
    });

    it('is nothing when a `*/` closes no comment', () => {
      // A regex literal that ends in `*/`, with no `/*` anywhere before it.
      expect(eventsOf('  const r = /x*/\n  emit("press");')).toEqual([{ name: 'press' }]);
    });

    it('is nothing when the JSDoc says nothing', () => {
      expect(eventsOf('  /** */\n  emit("press");')).toEqual([{ name: 'press' }]);
    });
  });

  it('§6.4 — reads the parts, and marks an interpolated one', () => {
    const template = '<span part="label icon"></span><b part="label"></b><i part="  end  "></i><u title="x"></u>';

    expect(contract(componentWith('  const a = 1;', template))).toMatchObject({
      parts: ['label', 'icon', 'end'],
      partsDynamic: false,
    });
    expect(
      contract(componentWith('  const cls = "a";', '<span part="label"></span><b part=@(cls)></b>')),
    ).toMatchObject({ parts: ['label'], partsDynamic: true });
  });

  describe('§6.5 — the tokens its `<style>` reads', () => {
    const withStyle = (css: string): string =>
      `@code {\n  const a = 1;\n}\n<head>\n  <style>${css}</style>\n</head>\n` +
      `<app-x>\n  <template shadowrootmode="open"><span>x</span></template>\n</app-x>\n`;

    it('reads every `var(--…)` of the declarations, in order and without repeats', () => {
      const css =
        '.a { color: var(--acme-color-primary); padding: var(--acme-space); }\n' +
        '.b { margin: calc(var( --acme-space) * 2) var(--acme-gap, 1px); }';

      expect(contract(withStyle(css)).tokens).toEqual([
        '--acme-color-primary',
        '--acme-space',
        '--acme-gap',
      ]);
    });

    it('reads nested rules and the rules of a grouping at-rule', () => {
      const css = '.a { .b { color: var(--x); } }\n@media (width > 1px) { .c { color: var(--y); } }';

      expect(contract(withStyle(css)).tokens).toEqual(['--x', '--y']);
    });

    it('reads nothing from a comment, an at-rule of declarations or an at-statement', () => {
      const css =
        '@import "x.css";\n' +
        '/* color: var(--in-comment); */\n' +
        '@font-face { font-family: var(--in-font-face); }\n' +
        '.a { color: red; }';

      expect(contract(withStyle(css)).tokens).toEqual([]);
    });

    it('reads nothing from an empty `<style>`', () => {
      expect(contract(withStyle('')).tokens).toEqual([]);
    });
  });
});

/**
 * The detail of an event (§6.3), which only the checker knows: a real language service over the
 * client projection of a real `.fud`, and the projection's own mapping as `toGenerated`.
 */
describe('typedContract, the detail of an event', () => {
  const PATH = '/p/app-x.fud';

  /** The parsed contract, the service over its projection, and the projection's file. */
  function typed(code: string) {
    const source = componentWith(`  import { emit } from "@fudic/dom";\n${code}`);
    const { document } = projected(PATH, source);
    const client = document.virtuals.find((it) => it.fileName === clientFileName(PATH)) as VirtualFile;
    return {
      parsed: contractOf(source, document.document),
      service: serviceAt(client.fileName, client.text),
      file: client.fileName,
      toGenerated: (offset: number) => mapToGenerated(client, offset, 'completion'),
    };
  }

  const EVENTS =
    '  const count: number = 1;\n' +
    '  const text: string = "a";\n' +
    '  /** Pressed. */\n' +
    '  emit("press", count);\n' +
    '  emit("change", text);\n' +
    '  emit("change", count);\n' +
    '  emit("change", text);\n' +
    '  emit("close");';

  it('types each detail and joins the distinct ones in order', () => {
    const { parsed, service, file, toGenerated } = typed(EVENTS);

    expect(typedContract(parsed, service, file, toGenerated).events).toEqual([
      { name: 'press', doc: 'Pressed.', detail: 'number' },
      { name: 'change', detail: 'string | number' },
      { name: 'close' },
    ]);
  });

  it('is the parsed contract without the mapping, or when the program lacks the file', () => {
    const { parsed, service, file, toGenerated } = typed(EVENTS);

    expect(typedContract(parsed, service, file)).toBe(parsed);
    expect(typedContract(parsed, service, '/p/ghost.ts', toGenerated)).toBe(parsed);
  });

  it('skips a detail the projection did not copy, or where no expression of its size starts', () => {
    const { parsed, service, file } = typed(EVENTS);

    expect(typedContract(parsed, service, file, () => undefined)).toBe(parsed);
    expect(typedContract(parsed, service, file, (offset) => offset + 100_000)).toBe(parsed);
  });

  it('has no detail for a contract that `contractOf` did not build', () => {
    const { service, file, toGenerated } = typed(EVENTS);
    const handMade: Contract = { ...EMPTY, events: [{ name: 'press' }] };

    expect(typedContract(handMade, service, file, toGenerated)).toBe(handMade);
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});
