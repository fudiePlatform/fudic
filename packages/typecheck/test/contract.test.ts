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
import { component, LAYOUT, PAGE, route } from './_support.js';

const doc = (source: string) => parseFud(source).document;
const contract = (source: string): Contract => contractOf(source, doc(source));

/** A component `app-x` with `code` as its `@code` and `template` inside its shadow root. */
const componentWith = (code: string, template = '<span>x</span>'): string =>
  `@code {\n${code}\n}\n` +
  `<app-x>\n  <template shadowrootmode="open">${template}</template>\n</app-x>\n`;

describe('contractOf', () => {
  it('is empty for a page and for a route: nobody writes them as an element', () => {
    expect(contract(PAGE)).toEqual({ props: [], slots: [], events: [] });
    expect(contract(route('../layouts/_layout.fud'))).toEqual({ props: [], slots: [], events: [] });
  });

  it('is empty for a layout without `@code`', () => {
    expect(contract(LAYOUT)).toEqual({ props: [], slots: [], events: [] });
  });

  it('gives a layout its props and never slots or events', () => {
    // A layout's `@code` is written in its `<head>`: before the `<!DOCTYPE>` it would be a
    // component's.
    const source = LAYOUT.replace(
      '@RenderHead()',
      '@code {\n      const { title } = props<{ title: string }>();\n    }\n    @RenderHead()',
    );
    expect(doc(source).type).toBe('layout-document');

    expect(contract(source)).toEqual({
      props: [{ name: 'title', required: true, type: 'string' }],
      slots: [],
      events: [],
    });
  });

  it('gives a component without `@code` its slots and nothing else', () => {
    const source =
      '<app-x>\n  <template shadowrootmode="open">' +
      '<slot name="icon"></slot><slot></slot></template>\n</app-x>\n';

    expect(contract(source)).toEqual({ props: [], slots: ['icon'], events: [] });
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

    expect(contract(componentWith(code)).events).toEqual(['change', 'close']);
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
    expect(built.events).toEqual(['go']);
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
  const files = new Map([[FILE, text]]);
  const host: ts.LanguageServiceHost = {
    getScriptFileNames: () => [FILE],
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
    events: ['press'],
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
      events: ['press'],
      doc: 'A component.',
    });
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});
