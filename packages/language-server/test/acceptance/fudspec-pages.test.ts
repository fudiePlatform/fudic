/**
 * SDD-82 criterion 36 — the editor on a `.fudspec` of a page and of a flow, through a live
 * server over a real workspace on disk: completion of the headers, the fixture lines and their
 * names, `path`, the URLs, `called`/`sent`; hover and definition to the fixture, the `.fudapi`
 * and the route; the light bulbs. What Volar hands the editor once every service is merged.
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  CodeActionRequest,
  CompletionRequest,
  DefinitionRequest,
  DocumentDiagnosticRequest,
  HoverRequest,
  type CodeAction,
  type CompletionItem,
  type CompletionList,
  type FullDocumentDiagnosticReport,
  type Hover,
  type Location,
} from 'vscode-languageserver-protocol/node';
import { URI } from 'vscode-uri';
import { pageFixtureModule, termModule } from '@fudic/spec';
import { toPosix } from '@fudic/typecheck';
import { copyWorkspace, startHarness, type Harness } from './_harness.js';

const PAGE_SPEC = 'src/routes/usuarios.fudspec';
const BLOG_SPEC = 'src/routes/blog/[slug].fudspec';
const FLOW_SPEC = 'src/flows/alta.fudspec';

const USERS_API = 'load ssr\n  users  str[]\n\nget search\n  q  str\n  -> str[]\n';
const USERS_FIXTURE = "export default {\n  data: { 'dos-personas': { users: [] }, nadie: { users: [] } },\n  calls: { 'busca-luis': { search: [] } },\n};\n";

let harness: Harness;
let root: string;
let framework: string;
const versions = new Map<string, number>();

beforeAll(async () => {
  root = copyWorkspace();
  writeFileSync(`${root}/fudic.json`, JSON.stringify({ id: 'probe', kind: 'app', prefix: 'app' }));
  mkdirSync(`${root}/src/routes/blog`, { recursive: true });
  mkdirSync(`${root}/src/flows`, { recursive: true });
  writeFileSync(`${root}/src/routes/usuarios.fud`, '<article>usuarios</article>\n');
  writeFileSync(`${root}/src/routes/usuarios.fudapi`, USERS_API);
  writeFileSync(`${root}/src/routes/usuarios.fixture.ts`, USERS_FIXTURE);
  writeFileSync(`${root}/src/routes/cuenta.fud`, '<article>cuenta</article>\n');
  writeFileSync(`${root}/src/routes/cuenta.fudapi`, 'load ssr\n  name  str\n');
  writeFileSync(`${root}/src/routes/blog/[slug].fud`, '<article>post</article>\n');
  writeFileSync(`${root}/src/routes/blog/[slug].fudapi`, 'paths\n');
  writeFileSync(`${root}/src/routes/blog/[slug].fixture.ts`, "export default { paths: ['hola-fudic', 'dsd'] };\n");
  writeFileSync(`${root}/src/flows/alta.fixture.ts`, "export default { services: { 'dos-personas': [] } };\n");

  framework = toPosix(mkdtempSync(join(tmpdir(), 'fudic-terms-')));
  for (const block of ['when', 'then']) mkdirSync(`${framework}/${block}`);
  writeFileSync(`${framework}/when/go.js`, termModule('when', 'go', [{ name: 'url', type: 'string' }]));
  writeFileSync(`${framework}/then/visible.js`, termModule('then', 'visible', [{ name: 'target', type: 'element' }]));
  writeFileSync(
    `${framework}/then/sent.js`,
    termModule('then', 'sent', [
      { name: 'fn', type: 'token' },
      { name: 'field', type: 'token' },
      { name: 'expected', type: 'string' },
    ]),
  );

  harness = await startHarness({ root, overrides: { frameworkTerms: () => framework } });
}, 60_000);

afterAll(async () => {
  await harness.stop();
  rmSync(framework, { recursive: true, force: true });
});

/** Open or change `relative` to `text`, and return its diagnostics as published. */
async function show(relative: string, text: string): Promise<FullDocumentDiagnosticReport['items']> {
  const uri = harness.uriOf(relative);
  const version = versions.get(relative) ?? 1;
  if (version === 1) await harness.open(relative, text, 'fudspec');
  else await harness.change(uri, text, version);
  versions.set(relative, version + 1);
  const report = (await harness.client.sendRequest(DocumentDiagnosticRequest.type, { textDocument: { uri } })) as FullDocumentDiagnosticReport;
  return report.items;
}

async function complete(relative: string, marked: string): Promise<readonly string[]> {
  const { text, position } = harness.cursor(marked);
  await show(relative, text);
  const result = await harness.client.sendRequest(CompletionRequest.type, { textDocument: { uri: harness.uriOf(relative) }, position });
  const items: CompletionItem[] = result === null ? [] : Array.isArray(result) ? result : (result as CompletionList).items;
  return items.map((i) => i.label);
}

async function at<T>(relative: string, marked: string, ask: (position: { line: number; character: number }) => Promise<T>): Promise<T> {
  const { text, position } = harness.cursor(marked);
  await show(relative, text);
  return ask(position);
}

const hover = (relative: string, marked: string) =>
  at(relative, marked, async (position) => {
    const got = (await harness.client.sendRequest(HoverRequest.type, { textDocument: { uri: harness.uriOf(relative) }, position })) as Hover | null;
    return (got?.contents as { value: string } | undefined)?.value;
  });

const definition = (relative: string, marked: string) =>
  at(relative, marked, async (position) => {
    const got = (await harness.client.sendRequest(DefinitionRequest.type, { textDocument: { uri: harness.uriOf(relative) }, position })) as Location[] | null;
    return got?.[0];
  });

async function bulb(relative: string, text: string): Promise<CodeAction[]> {
  const diagnostics = await show(relative, text);
  const got = await harness.client.sendRequest(CodeActionRequest.type, {
    textDocument: { uri: harness.uriOf(relative) },
    range: { start: { line: 0, character: 0 }, end: harness.positionAt(text, text.length) },
    context: { diagnostics },
  });
  return (got ?? []) as CodeAction[];
}

const HEAD = 'page /usuarios\n\ncriterion a\n';

describe('criterion 36 — completion', () => {
  it('offers the page header first beside a route, with its route, and the routes after page', async () => {
    expect((await complete(PAGE_SPEC, '|'))[0]).toBe('page');
    expect(await complete(PAGE_SPEC, 'page /|')).toEqual(expect.arrayContaining(['/usuarios', '/blog/[slug]', '/cuenta']));
  });

  it('offers the fixture lines in given, and the names of the fixture after them', async () => {
    expect(await complete(PAGE_SPEC, `${HEAD}  given\n    |`)).toEqual(expect.arrayContaining(['data', 'answers', 'path', 'url', 'as']));
    expect(await complete(PAGE_SPEC, `${HEAD}  given\n    data |`)).toEqual(['dos-personas', 'nadie']);
    expect(await complete(PAGE_SPEC, `${HEAD}  given\n    answers |`)).toEqual(['busca-luis']);
    expect(await complete(BLOG_SPEC, 'page /blog/[slug]\n\ncriterion a\n  given\n    path |')).toEqual(['hola-fudic', 'dsd']);
  });

  it('offers the routes after url and go, and what the page can call after sent', async () => {
    expect(await complete(PAGE_SPEC, `${HEAD}  given\n    url |`)).toEqual(['/usuarios']);
    expect(await complete(FLOW_SPEC, 'flow alta\n\ncriterion a\n  when\n    go |')).toEqual(expect.arrayContaining(['/usuarios', '/blog/:slug']));
    expect(await complete(PAGE_SPEC, `${HEAD}  then\n    sent |`)).toEqual(['search']);
    expect(await complete(PAGE_SPEC, `${HEAD}  then\n    sent search |`)).toEqual(['q']);
  });
});

describe('criterion 36 — hover and definition', () => {
  it('goes from a data name to its key in the fixture', async () => {
    expect(await hover(PAGE_SPEC, `${HEAD}  given\n    data na|die\n  then\n    visible x\n`)).toContain('data `nadie`');
    expect((await definition(PAGE_SPEC, `${HEAD}  given\n    data na|die\n  then\n    visible x\n`))?.uri).toBe(
      URI.file(`${root}/src/routes/usuarios.fixture.ts`).toString(),
    );
  });

  it('goes from sent to the function in the .fudapi, and from the header to the route', async () => {
    const sent = `${HEAD}  then\n    sent sea|rch q "x"\n`;
    expect(await hover(PAGE_SPEC, sent)).toContain('`search(q)`');
    expect(await definition(PAGE_SPEC, sent)).toMatchObject({
      uri: URI.file(`${root}/src/routes/usuarios.fudapi`).toString(),
      range: { start: { line: 3, character: 4 }, end: { line: 3, character: 10 } },
    });
    expect((await definition(PAGE_SPEC, 'page /usu|arios\n'))?.uri).toBe(URI.file(`${root}/src/routes/usuarios.fud`).toString());
  });
});

describe('criterion 36 — light bulbs', () => {
  it('creates the page’s fixture from its .fudapi', async () => {
    const text = 'page /cuenta\n\ncriterion a\n  given\n    data base\n  then\n    visible x\n';
    const actions = await bulb('src/routes/cuenta.fudspec', text);
    const create = actions.find((a) => a.title === 'Create cuenta.fixture.ts');
    const write = create?.edit?.documentChanges?.[1] as { edits: { newText: string }[] } | undefined;
    expect(write?.edits[0]?.newText).toBe(
      pageFixtureModule('routes/cuenta', { data: { name: 'base', fields: [{ name: 'name', required: true, shape: { kind: 'string' } }] }, paths: false }),
    );
  });

  it('adds a missing name to the fixture, and path with the first of paths', async () => {
    const names = await bulb(PAGE_SPEC, `${HEAD}  given\n    data nueva\n  then\n    visible x\n`);
    expect(names.map((a) => a.title)).toContain("Add 'nueva' to usuarios.fixture.ts");
    const params = await bulb(BLOG_SPEC, 'page /blog/[slug]\n\ncriterion a\n  then\n    visible x\n');
    expect(params.map((a) => a.title)).toContain("Add 'path hola-fudic'");
  });

  it('reports a function the page cannot call (FUD1506) and an argument it does not take (FUD1507)', async () => {
    const codes = (await show(PAGE_SPEC, `${HEAD}  then\n    sent nope q "x"\n    sent search name "x"\n`)).map((d) => d.code);
    expect([...codes].sort()).toEqual(['FUD1506', 'FUD1507']);
  });
});
