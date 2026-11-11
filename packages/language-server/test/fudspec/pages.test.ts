/**
 * SDD-82 §3.10, criterion 36 — the editor on a `.fudspec` of a page or a flow: completion of the
 * headers, the fixture lines and their names, `path`, the URLs, `called`/`sent` and `as`; hover
 * and definition to the route, the fixture and the `.fudapi`; the light bulbs; the semantic
 * tokens of the lines that are not terms. Over an in-memory workspace with a stub `.fudapi` side.
 */

import { describe, expect, it } from 'vitest';
import type { CodeAction, TextEdit } from '@volar/language-service';
import { flowFixtureModule, pageFixtureModule, parseSpec, validateSpec, type FunctionInfo, type PropField } from '@fudic/spec';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { URI } from 'vscode-uri';
import { specCodeActions } from '../../src/fudspec/actions.js';
import { specCompletions } from '../../src/fudspec/completion.js';
import type { SpecApi } from '../../src/fudspec/host.js';
import { specDefinition, specHover } from '../../src/fudspec/navigation.js';
import { specSemanticTokens } from '../../src/fudspec/semantic-tokens.js';
import { criterionSnippet, fixtureLineSnippet, headerSnippet, urlSnippet } from '../../src/fudspec/snippets.js';
import { FILES, FW_TERMS, ROOT, cursor, specDocument, termSource, world } from './_spec.js';

const R = `${ROOT}/src/routes`;
const FLOWS = `${ROOT}/src/flows`;
const USERS = `${R}/usuarios.fudspec`;
const BLOG = `${R}/blog/[slug].fudspec`;
const FLOW = `${FLOWS}/alta.fudspec`;
const API = `${R}/usuarios.fudapi`;
const API_TEXT = 'get search\n  q  str\n\ndelete remove\n  id  i32\n';

const fn = (name: string, args: readonly string[], start: number): FunctionInfo => ({ name, args, path: API, span: { start, end: start + name.length } });
const SEARCH = fn('search', ['q'], 4);
const REMOVE = fn('remove', ['id'], 30);
const LOGIN = fn('login', ['user'], 0);

const USERS_LOAD: readonly PropField[] = [{ name: 'users', required: true, shape: { kind: 'array', element: { kind: 'string' } } }];

const API_SIDE: SpecApi = {
  specReach: () => ({
    reach: (page) => ({ paths: page.includes('[slug]'), functions: page.endsWith('/usuarios.fud') ? [SEARCH, REMOVE] : [] }),
    functions: () => [SEARCH, REMOVE, LOGIN],
  }),
  pageContract: (page) => {
    if (page.endsWith('/usuarios.fud')) return { id: 'routes/usuarios', load: USERS_LOAD, paths: false };
    if (page.endsWith('/cuenta.fud')) return { id: 'routes/cuenta', load: USERS_LOAD, paths: false };
    if (page.endsWith('/vacia.fud')) return { id: 'routes/vacia', paths: false };
    return undefined;
  },
};

const USERS_FIXTURE = [
  "import type { Fixtures } from 'fudic:routes/usuarios';",
  '',
  'export default {',
  '  data: {',
  "    'dos-personas': { users: [] },",
  '    nadie: { users: [] },',
  '  },',
  "  calls: { 'busca-luis': {} },",
  '  services: { mem: [] },',
  '} satisfies Fixtures;',
  '',
].join('\n');

const PAGES: Readonly<Record<string, string | undefined>> = {
  ...FILES,
  [`${FW_TERMS}/when/go.js`]: termSource('go', 'when', [{ name: 'url', type: 'string' }]),
  [`${FW_TERMS}/when/click.js`]: termSource('click', 'when', [{ name: 'target', type: 'element' }]),
  [`${FW_TERMS}/then/url.js`]: termSource('url', 'then', [{ name: 'expected', type: 'string' }]),
  [`${FW_TERMS}/then/called.js`]: termSource('called', 'then', [
    { name: 'fn', type: 'token' },
    { name: 'times', type: 'number' },
  ]),
  [`${FW_TERMS}/then/sent.js`]: termSource('sent', 'then', [
    { name: 'fn', type: 'token' },
    { name: 'field', type: 'token' },
    { name: 'expected', type: 'string' },
  ]),
  [`${R}/index.fud`]: '',
  [`${R}/_error.fud`]: '',
  [`${R}/usuarios.fud`]: '',
  [`${R}/cuenta.fud`]: '',
  [`${R}/vacia.fud`]: '',
  [`${R}/blog/[slug].fud`]: '',
  [`${R}/usuarios.fixture.ts`]: USERS_FIXTURE,
  [API]: API_TEXT,
  [`${R}/blog/[slug].fixture.ts`]: "export default { data: { 'en-ingles': {} }, paths: ['hola-fudic', 'dsd'] };\n",
  [`${FLOWS}/alta.fixture.ts`]: "export default { services: { 'dos-personas': [] }, calls: { 'sin-red': {} } };\n",
};

const pages = (files: Readonly<Record<string, string | undefined>> = {}, api: SpecApi | null = API_SIDE) =>
  world({ files: { ...PAGES, ...files }, ...(api !== null ? { api } : {}) });

const PAGE_HEAD = 'page /usuarios\ncriterion a\n';
const FLOW_HEAD = 'flow alta\ncriterion a\n';
const BLOG_HEAD = 'page /blog/[slug]\ncriterion a\n';

function labels(marked: string, path: string, w = pages()): readonly string[] | undefined {
  const { text, offset } = cursor(marked);
  return specCompletions(specDocument(text, path), offset, w.host)?.items.map((i) => i.label);
}

describe('completion — headers (SDD-82 §3.10)', () => {
  it('offers the header the file’s place says first: page beside a route, flow in the flows folder', () => {
    const at = (path: string) => specCompletions(specDocument('', path), 0, pages().host)!.items[0]!;
    expect(at(USERS)).toMatchObject({ label: 'page', preselect: true, insertText: 'page ${1|/usuarios,/blog/[slug],/cuenta,/,/vacia|}' });
    expect(at(FLOW)).toMatchObject({ label: 'flow', detail: 'flow <name>', insertText: 'flow ${1:alta}' });
    expect(at(`${ROOT}/sueltos/x.fudspec`)).toMatchObject({ label: 'component', detail: 'component <tag>' });
    expect(labels('|', USERS)).toEqual(['page', 'component', 'page', 'flow', 'criterion', 'criterion']);
  });

  it('completes the routes after page and the tags after component; a flow is named freely', () => {
    expect(labels('page /u|', USERS)).toEqual(['/blog/[slug]', '/cuenta', '/', '/usuarios', '/vacia']);
    expect(labels('component |', USERS)).toEqual(['fud-button', 'fud-card']);
    expect(labels('flow a|', FLOW)).toBeUndefined();
  });
});

describe('completion — the lines of given', () => {
  it('offers the fixture lines of the spec’s kind, and as in every block', () => {
    expect(labels(`${PAGE_HEAD}  given\n    |`, USERS)).toEqual(['route', 'data', 'answers', 'services', 'path', 'url', 'as']);
    expect(labels(`${FLOW_HEAD}  given\n    |`, FLOW)).toEqual(['route', 'answers', 'services', 'url', 'as']);
    // Without a header yet, every line.
    expect(labels('criterion a\n  given\n    |', USERS)).toEqual(['route', 'props', 'data', 'answers', 'services', 'path', 'url', 'as']);
    expect(labels(`${FLOW_HEAD}  when\n    |`, FLOW)).toEqual(['click', 'go', 'as']);
  });

  it('completes the names of the group a fixture line names into', () => {
    expect(labels(`${PAGE_HEAD}  given\n    data |`, USERS)).toEqual(['dos-personas', 'nadie']);
    // `data` takes several names; `services` only one.
    expect(labels(`${PAGE_HEAD}  given\n    data nadie |`, USERS)).toEqual(['dos-personas', 'nadie']);
    expect(labels(`${PAGE_HEAD}  given\n    services mem |`, USERS)).toBeUndefined();
    expect(labels(`${PAGE_HEAD}  given\n    answers |`, USERS)).toEqual(['busca-luis']);
    expect(labels(`${FLOW_HEAD}  given\n    services |`, FLOW)).toEqual(['dos-personas']);
    expect(labels(`${BLOG_HEAD}  given\n    path |`, BLOG)).toEqual(['hola-fudic', 'dsd']);
  });

  it('offers nothing without a fixture, or without the group', () => {
    expect(labels(`page /cuenta\ncriterion a\n  given\n    data |`, `${R}/cuenta.fudspec`)).toBeUndefined();
    expect(labels(`page /nada\ncriterion a\n  given\n    data |`, USERS)).toBeUndefined();
    expect(labels(`${BLOG_HEAD}  given\n    answers |`, BLOG)).toBeUndefined();
  });

  it('completes the URLs: the page’s own after url, every route in a flow, after go and then url', () => {
    const { text, offset } = cursor(`${BLOG_HEAD}  given\n    url |`);
    expect(specCompletions(specDocument(text, BLOG), offset, pages().host)?.items).toEqual([
      { label: '/blog/:slug', kind: 17, detail: `${R}/blog/[slug].fud`, insertText: '/blog/${1:slug}', insertTextFormat: 2 },
    ]);
    expect(labels(`${PAGE_HEAD}  given\n    url |`, USERS)).toEqual(['/usuarios']);
    const all = ['/blog/:slug', '/cuenta', '/', '/usuarios', '/vacia'];
    expect(labels(`${FLOW_HEAD}  given\n    url |`, FLOW)).toEqual(all);
    expect(labels(`${PAGE_HEAD}  when\n    go |`, USERS)).toEqual(all);
    expect(labels(`${PAGE_HEAD}  then\n    url |`, USERS)).toEqual(all);
    expect(labels(`${PAGE_HEAD}  when\n    go /x |`, USERS)).toBeUndefined();
  });

  it('completes what the page or the flow can call, and the arguments of the function sent', () => {
    expect(labels(`${PAGE_HEAD}  then\n    called |`, USERS)).toEqual(['search', 'remove']);
    expect(labels(`${FLOW_HEAD}  then\n    called |`, FLOW)).toEqual(['search', 'remove', 'login']);
    expect(labels(`${PAGE_HEAD}  then\n    sent search |`, USERS)).toEqual(['q']);
    expect(labels(`${PAGE_HEAD}  then\n    sent nope |`, USERS)).toBeUndefined();
    expect(labels(`${PAGE_HEAD}  then\n    called search |`, USERS)).toBeUndefined();
    expect(labels(`${PAGE_HEAD}  then\n    sent search q |`, USERS)).toBeUndefined();
    // A component, or a page without the `.fudapi` side: unknown, nothing to offer.
    expect(labels('component fud-card\ncriterion a\n  then\n    called |', USERS)).toBeUndefined();
    expect(labels(`${PAGE_HEAD}  then\n    called |`, USERS, pages({}, null))).toBeUndefined();
    expect(labels('page /nada\ncriterion a\n  then\n    called |', USERS)).toBeUndefined();
  });

  it('completes the people the file names after as, main first', () => {
    const text = `${FLOW_HEAD}  when\n    as luis\n    as main\n  then\n    as |`;
    expect(labels(text, FLOW)).toEqual(['main', 'luis']);
    expect(labels(`${FLOW_HEAD}  when\n    as luis |`, FLOW)).toBeUndefined();
  });

  it('still completes an element: the tags and role:', () => {
    expect(labels(`${PAGE_HEAD}  when\n    click |`, USERS)).toEqual(['fud-button', 'fud-card', 'role:']);
  });
});

describe('snippets of pages and flows', () => {
  it('writes each fixture line with its names, or a placeholder', () => {
    const doc = (text: string, path: string) => specDocument(text, path);
    const { host } = pages();
    expect(fixtureLineSnippet('data', doc(PAGE_HEAD, USERS), host)).toBe('data ${1|dos-personas,nadie|}');
    expect(fixtureLineSnippet('path', doc(BLOG_HEAD, BLOG), host)).toBe('path ${1|hola-fudic,dsd|}');
    expect(fixtureLineSnippet('path', doc(PAGE_HEAD, USERS), host)).toBe('path ${1:value}');
    expect(fixtureLineSnippet('services', doc(BLOG_HEAD, BLOG), host)).toBe('services ${1:base}');
    expect(fixtureLineSnippet('url', doc(BLOG_HEAD, BLOG), host, 3)).toBe('url /blog/${3:slug}');
    expect(fixtureLineSnippet('url', doc(PAGE_HEAD, USERS), host)).toBe('url /usuarios');
    expect(fixtureLineSnippet('url', doc(FLOW_HEAD, FLOW), host)).toBe('url ${1:/}');
    expect(fixtureLineSnippet('props', doc('component fud-card\n', USERS), host)).toBe('props ${1|titulo-largo,vacio|}');
  });

  it('starts a criterion with the given lines its kind needs', () => {
    const { host } = pages();
    const snippet = (text: string, path: string) => criterionSnippet(specDocument(text, path), host);
    expect(snippet('page /usuarios\n', USERS)).toBe('criterion ${1:slug}\n  given\n    data ${2|dos-personas,nadie|}\n  then\n    $0');
    expect(snippet('page /blog/[slug]\n', BLOG)).toBe('criterion ${1:slug}\n  given\n    data ${2:en-ingles}\n    path ${3|hola-fudic,dsd|}\n  then\n    $0');
    expect(snippet('flow alta\n', FLOW)).toBe('criterion ${1:slug}\n  given\n    url ${2:/}\n  then\n    $0');
    expect(snippet('page /nada\n', USERS)).toBe('criterion ${1:slug}\n  given\n    $2\n  then\n    $0');
    // A route with params and no `paths` in its fixture is opened at a URL.
    const bare = pages({ [`${R}/blog/[slug].fixture.ts`]: 'export default {};\n' }).host;
    expect(criterionSnippet(specDocument('page /blog/[slug]\n', BLOG), bare)).toBe('criterion ${1:slug}\n  given\n    url /blog/${2:slug}\n  then\n    $0');
  });

  it('writes the header of each kind', () => {
    const { host } = pages();
    expect(headerSnippet('page', specDocument('', `${ROOT}/sueltos/x.fudspec`), host)).toBe('page ${1|/blog/[slug],/cuenta,/,/usuarios,/vacia|}');
    expect(headerSnippet('page', specDocument('', `${ROOT}/x.fudspec`), world().host)).toBe('page ${1:/route}');
    expect(headerSnippet('flow', specDocument('', USERS), host)).toBe('flow ${1:name}');
    expect(headerSnippet('component', specDocument('', USERS), host)).toBe('component ${1|fud-button,fud-card|}');
  });

  it('writes a URL with a stop per param', () => {
    expect(urlSnippet({ route: '/a/[b]/[c]', path: '/x', pattern: '/a/:b/:c', params: ['b', 'c'] })).toBe('/a/${1:b}/${2:c}');
  });
});

function hover(text: string, path: string, at: string, nth = 1, w = pages()): string | undefined {
  const value = specHover(specDocument(text, path), offsetOf(text, at, nth), w.host)?.contents;
  return (value as { value: string } | undefined)?.value;
}

function definition(text: string, path: string, at: string, nth = 1, w = pages()) {
  return specDefinition(specDocument(text, path), offsetOf(text, at, nth), w.host)?.[0];
}

/** The offset of the `nth` occurrence of `at`, one past its start. */
function offsetOf(text: string, at: string, nth: number): number {
  let from = -1;
  for (let i = 0; i < nth; i++) from = text.indexOf(at, from + 1);
  return from + 1;
}

describe('hover and definition', () => {
  const TEXT = [
    'page /usuarios',
    'criterion a',
    '  given',
    '    data nadie dos-personas',
    '    answers busca-luis',
    '    services otro',
    '    as luis',
    '  when',
    '    go /blog/x',
    '    click role:button',
    '  then',
    '    url /nope',
    '    called search 1',
    '    sent search q "lu"',
    '    called nope 1',
    '',
  ].join('\n');

  it('goes from the page header to its route', () => {
    expect(hover(TEXT, USERS, '/usuarios')).toBe(`page \`/usuarios\` · \`/usuarios\`\n\n\`${R}/usuarios.fud\``);
    expect(definition(TEXT, USERS, '/usuarios')).toMatchObject({ targetUri: URI.file(`${R}/usuarios.fud`).toString() });
    expect(hover('page /nada\n', USERS, '/nada')).toBeUndefined();
    expect(hover('flow alta\n', FLOW, 'alta')).toBeUndefined();
  });

  it('goes from each name of a fixture line to its key', () => {
    expect(hover(TEXT, USERS, 'dos-personas')).toBe(`data \`dos-personas\`\n\n\`${R}/usuarios.fixture.ts\``);
    // On the line's own word: its first name, over the whole line.
    expect(hover(TEXT, USERS, 'data')).toContain('data `nadie`');
    expect(definition(TEXT, USERS, 'busca-luis')).toMatchObject({
      targetUri: URI.file(`${R}/usuarios.fixture.ts`).toString(),
      targetRange: { start: { line: 7, character: 11 }, end: { line: 7, character: 23 } },
    });
    expect(hover(TEXT, USERS, 'otro')).toBeUndefined();
    expect(hover(TEXT, USERS, ' luis')).toBeUndefined();
    expect(hover(`${BLOG_HEAD}  given\n    path dsd\n`, BLOG, 'dsd')).toContain('path `dsd`');
    expect(hover(`page /cuenta\ncriterion a\n  given\n    data x\n`, `${R}/cuenta.fudspec`, 'x')).toBeUndefined();
    expect(hover(`${PAGE_HEAD}  given\n    data role:x\n`, USERS, 'role')).toBeUndefined();
  });

  it('goes from a URL to the route that answers it', () => {
    expect(hover(TEXT, USERS, '/blog/x')).toContain('page `/blog/[slug]`');
    expect(definition(TEXT, USERS, '/blog/x')).toMatchObject({ targetUri: URI.file(`${R}/blog/[slug].fud`).toString() });
    expect(hover(TEXT, USERS, '/nope')).toBeUndefined();
    expect(hover(`${FLOW_HEAD}  given\n    url /usuarios\n`, FLOW, '/usuarios')).toContain('page `/usuarios`');
    expect(hover(`${FLOW_HEAD}  given\n    url /nope\n`, FLOW, '/nope')).toBeUndefined();
    // The term itself still opens its module.
    expect(hover(TEXT, USERS, 'go')).toContain('go url:string');
  });

  it('goes from called and sent to the function in the .fudapi', () => {
    expect(hover(TEXT, USERS, 'search')).toBe(`\`search(q)\`\n\n\`${API}\``);
    expect(definition(TEXT, USERS, 'search')).toMatchObject({
      targetUri: URI.file(API).toString(),
      targetRange: { start: { line: 0, character: 4 }, end: { line: 0, character: 10 } },
    });
    expect(hover(TEXT, USERS, ' q ')).toBe(`argument \`q\` of \`search(q)\`\n\n\`${API}\``);
    expect(hover(TEXT, USERS, '"lu"')).toBeUndefined();
    expect(hover(TEXT, USERS, ' 1', 1)).toBeUndefined();
    expect(hover(TEXT, USERS, 'nope 1')).toBeUndefined();
    expect(hover(TEXT, USERS, 'role:button')).toBeUndefined();
    expect(hover(TEXT, USERS, 'search', 1, pages({}, null))).toBeUndefined();
  });
});

describe('semantic tokens of the lines that are not terms', () => {
  it('leaves the fixture lines and as to the grammar, and paints the tag steps of a reference', () => {
    const text = `${PAGE_HEAD}  given\n    data nadie\n    as luis\n  when\n    click fud-card>role:button\n  then\n    url /usuarios\n`;
    const tokens = specSemanticTokens(specDocument(text, USERS), pages().host);
    expect(tokens.map((t) => text.slice(t.span.start, t.span.end))).toEqual(['click', 'fud-card', 'url']);
  });
});

/** The bulb over the whole of `text`. */
function bulb(text: string, path: string, w = pages()): CodeAction[] {
  const spec = specDocument(text, path);
  const document = TextDocument.create(URI.file(path).toString(), 'fudspec', 1, text);
  return specCodeActions({ spec, host: w.host, document, start: 0, end: text.length, propsOf: () => undefined });
}

/** The text a `create` action writes. */
function created(action: CodeAction | undefined): { readonly uri: string; readonly text: string } {
  const [make, write] = (action?.edit?.documentChanges ?? []) as unknown as [{ uri: string }, { edits: TextEdit[] }];
  return { uri: make.uri, text: write.edits[0]!.newText };
}

describe('light bulbs (SDD-82 §3.10)', () => {
  it('adds the header the file’s place says', () => {
    expect(bulb('criterion a\n  then\n    url /\n', USERS).map((a) => a.title)).toContain("Add 'page /usuarios'");
    expect(bulb('criterion a\n  then\n    url /\n', FLOW).map((a) => a.title)).toContain("Add 'flow alta'");
    expect(bulb('criterion a\n  then\n    url /\n', `${ROOT}/sueltos/x.fudspec`).filter((a) => a.title.startsWith('Add'))).toEqual([]);
  });

  it('creates a page’s fixture typed by its .fudapi, and a flow’s', () => {
    const cuenta = bulb('page /cuenta\ncriterion a\n  given\n    data base\n  then\n    url /\n', `${R}/cuenta.fudspec`);
    const action = cuenta.find((a) => a.title === 'Create cuenta.fixture.ts');
    expect(created(action)).toEqual({
      uri: URI.file(`${R}/cuenta.fixture.ts`).toString(),
      text: pageFixtureModule('routes/cuenta', { data: { name: 'base', fields: USERS_LOAD }, paths: false }),
    });
    const vacia = bulb('page /vacia\ncriterion a\n  given\n    answers x\n  then\n    url /\n', `${R}/vacia.fudspec`);
    expect(created(vacia.find((a) => a.title === 'Create vacia.fixture.ts')).text).toBe(pageFixtureModule('routes/vacia', { paths: false }));
    // A page without a `.fudapi` has nothing to fake: no fixture.
    expect(bulb('page /\ncriterion a\n  given\n    data x\n  then\n    url /\n', `${R}/index.fudspec`).filter((a) => a.title.startsWith('Create'))).toEqual([]);
    const flow = bulb('flow otro\ncriterion a\n  given\n    services x\n  then\n    url /\n', `${FLOWS}/otro.fudspec`);
    expect(created(flow.find((a) => a.title === 'Create otro.fixture.ts')).text).toBe(flowFixtureModule());
  });

  it('adds the name a fixture line misses to its group, or changes it to the closest', () => {
    const text = `${PAGE_HEAD}  given\n    data nadi\n    answers nueva\n    services otro\n  then\n    url /\n`;
    const actions = bulb(text, USERS);
    expect(actions.map((a) => a.title)).toEqual([
      "Change to 'nadie'",
      "Add 'nadi' to usuarios.fixture.ts",
      "Add 'nueva' to usuarios.fixture.ts",
      "Add 'otro' to usuarios.fixture.ts",
    ]);
    const written = (title: string) => (actions.find((a) => a.title === title)?.edit?.documentChanges?.[0] as { edits: TextEdit[] }).edits[0]!.newText;
    expect(written("Add 'nadi' to usuarios.fixture.ts")).toContain("    nadi: { users: [] },\n  },");
    expect(written("Add 'nueva' to usuarios.fixture.ts")).toContain("calls: { 'busca-luis': {},\n    nueva: {},");
    expect(written("Add 'otro' to usuarios.fixture.ts")).toContain('services: { mem: [],\n    otro: [],');
  });

  it('adds a group the fixture lacks, and nothing to a fixture it cannot write', () => {
    const blog = bulb(`${BLOG_HEAD}  given\n    path dsd\n    answers x\n  then\n    url /\n`, BLOG);
    const edit = (blog.find((a) => a.title === "Add 'x' to [slug].fixture.ts")?.edit?.documentChanges?.[0] as { edits: TextEdit[] }).edits[0]!;
    expect(edit.newText).toContain("paths: ['hola-fudic', 'dsd'],\n  calls: {\n    x: {},\n  },");
    const opaque = pages({ [`${R}/usuarios.fixture.ts`]: 'const all = {};\nexport default all;\n' });
    expect(bulb(`${PAGE_HEAD}  given\n    data x\n  then\n    url /\n`, USERS, opaque).filter((a) => a.title.startsWith('Add'))).toEqual([]);
  });

  it('writes the data of a page without load as an empty object', () => {
    const vacia = pages({ [`${R}/vacia.fixture.ts`]: 'export default { data: {} };\n' });
    const actions = bulb('page /vacia\ncriterion a\n  given\n    data x\n  then\n    url /\n', `${R}/vacia.fudspec`, vacia);
    const edit = (actions.find((a) => a.title === "Add 'x' to vacia.fixture.ts")?.edit?.documentChanges?.[0] as { edits: TextEdit[] }).edits[0]!;
    expect(edit.newText).toContain('x: {},');
  });

  it('adds path with the first value of paths to a criterion of a route with params (FUD1504)', () => {
    const text = `${BLOG_HEAD}  then\n    url /\n`;
    const action = bulb(text, BLOG).find((a) => a.title === "Add 'path hola-fudic'");
    const edits = action?.edit?.changes?.[URI.file(BLOG).toString()] as TextEdit[];
    const after = TextDocument.applyEdits(TextDocument.create('x', 'fudspec', 1, text), edits);
    expect(after).toBe(`${BLOG_HEAD.trimEnd()}\n  given\n    path hola-fudic\n  then\n    url /\n`);
    const parsed = parseSpec(after);
    expect(validateSpec(parsed.value, pages().host.context(BLOG)).map((d) => d.code)).toEqual([]);
    const bare = pages({ [`${R}/blog/[slug].fixture.ts`]: 'export default {};\n' });
    expect(bulb(text, BLOG, bare).filter((a) => a.title.startsWith("Add 'path"))).toEqual([]);
  });
});

describe('the fixture a bulb creates is named by the data lines', () => {
  it('takes the first name a data line gives, past a malformed one, and base without any', () => {
    const named = bulb('page /cuenta\ncriterion b\n  given\n    data role:x\n  then\n    url /\ncriterion a\n  given\n    data primera\n  then\n    url /\n', `${R}/cuenta.fudspec`);
    expect(created(named.find((a) => a.title === 'Create cuenta.fixture.ts')).text).toContain('primera: { users: [] }');
    const bare = bulb('page /cuenta\ncriterion a\n  given\n    answers x\n  then\n    url /\n', `${R}/cuenta.fudspec`);
    expect(created(bare.find((a) => a.title === 'Create cuenta.fixture.ts')).text).toContain('base: { users: [] }');
  });
});

describe('semantic tokens of an element argument written as a string', () => {
  it('paints no tag in it', () => {
    const text = `${PAGE_HEAD}  when\n    click "fud-card"\n`;
    const tokens = specSemanticTokens(specDocument(text, USERS), pages().host);
    expect(tokens.map((t) => text.slice(t.span.start, t.span.end))).toEqual(['click']);
  });
});
