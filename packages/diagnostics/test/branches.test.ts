/**
 * The codes whose text depends on their data: every variant of every one, called with the data
 * its emitter passes, and the words that tell that variant apart. A code that picks its message
 * by a discriminant is one function with several sentences, and each sentence is a branch the
 * catalogue has to answer for.
 */

import { describe, expect, it } from 'vitest';
import * as c from '../src/index.js';
import { span, type FudDiagnostic } from '../src/index.js';

const S = span(0, 1);
const F = 'src/a.fud';

/** `[diagnostic, words only that variant says]`. */
const CASES: readonly (readonly [FudDiagnostic, string])[] = [
  [c.FUD0071({ span: S, body: 'switch' }), "expected '{' to open the @switch body"],
  [c.FUD0071({ span: S, body: 'block' }), "expected '{' to open the block body"],
  [c.FUD0072({ span: S, body: 'switch' }), "unclosed @switch body: expected '}'"],
  [c.FUD0072({ span: S, body: 'block' }), "unclosed block: expected '}'"],
  [c.FUD0099({ span: S, binding: 'event' }), 'event binding has no event name after `@`'],
  [c.FUD0099({ span: S, binding: 'property' }), 'property binding has no property name after `.`'],
  [c.FUD0099({ span: S, binding: 'delegate' }), 'delegation marker has no name after `delegate:`'],
  [c.FUD0131({ span: S, kind: 'unclosed', blocks: 2 }), '2 block(s) left unclosed'],
  [c.FUD0131({ span: S, kind: 'unmatched' }), 'unmatched }'],
  [c.FUD0151({ span: S, missing: 'html' }), 'A page must have an <html> root'],
  [c.FUD0151({ span: S, missing: 'head-body' }), 'A page must have <head> then <body> inside <html>'],
  [c.FUD0155({ span: S, kind: 'order' }), 'Top-level order must be link → @code → head → host'],
  [c.FUD0155({ span: S, kind: 'head' }), 'A component has at most one <head> fragment'],
  [c.FUD0156({ span: S, problem: 'missing' }), 'exactly one custom-element host wrapper'],
  [c.FUD0156({ span: S, problem: 'several' }), 'exactly one root host wrapper'],
  [c.FUD0156({ span: S, problem: 'no-hyphen' }), 'must be a custom element (contain a hyphen)'],
  [c.FUD0158({ span: S, problem: 'missing' }), 'requires shadowrootmode="open"'],
  [c.FUD0158({ span: S, problem: 'not-open' }), 'closed is out of v1'],
  [c.FUD0170({ span: S, detail: 'Unexpected token' }), 'Unexpected token'],
  [c.FUD0291({ span: S, by: 'emit' }), 'this expression cannot be subscribed'],
  [c.FUD0291({ span: S, by: 'analysis' }), 'an event handler must be a reference, a call, a lambda or a function'],
  [c.FUD0360({ file: F, problem: 'malformed', name: 'id' }), `Malformed route param segment "[id]" in ${F}`],
  [c.FUD0360({ file: F, problem: 'duplicate', name: 'id' }), `Duplicate route param ":id" in ${F}`],
  [c.FUD0390({ file: F, problem: 'not-json', reason: 'eof' }), `${F} is not valid JSON: eof`],
  [c.FUD0390({ file: F, problem: 'no-shell' }), 'must be an object with a "shell" array'],
  [c.FUD0390({ file: F, problem: 'resource', name: 'img' }), 'resource "img" needs a pattern and a valid policy'],
  [c.FUD0392({ file: F, where: 'strategy', ttl: 'x' }), 'strategy().data.ttl "x" is invalid'],
  [c.FUD0392({ file: F, where: 'resource', name: 'img', ttl: 3 }), 'resource "img" has an invalid ttl "3"'],
  [c.FUD0420({ span: S, role: 'route' }), 'A route declares exactly one layout'],
  [c.FUD0420({ span: S, role: 'document' }), 'A document declares at most one layout'],
  [c.FUD0421({ span: S, kind: 'order' }), 'layout link → component links → @code → head → markup'],
  [c.FUD0421({ span: S, kind: 'head' }), 'A route has at most one <head> fragment'],
  [c.FUD0421({ span: S, kind: 'nested-section' }), '@section must be a top-level node of the route'],
  [c.FUD0423({ span: S, path: '/l.fud' }), 'a layout must contain @RenderBody(): /l.fud'],
  [c.FUD0423({ span: S }), 'where does the route go?'],
  [c.FUD0433({ span: S, problem: 'section-name' }), '@RenderSection(name) expects a bare identifier'],
  [c.FUD0433({ span: S, problem: 'missing-name' }), '@section expects a name'],
  [c.FUD0433({ span: S, problem: 'arguments', directive: '@RenderBody', allowed: [] }), '@RenderBody() takes no arguments'],
  [c.FUD0433({ span: S, problem: 'arguments', directive: '@RenderSection', allowed: ['slot', 'required'] }), 'the named arguments `slot:` and `required:`'],
  [c.FUD0433({ span: S, problem: 'colon', directive: '@RenderSection', key: 'slot' }), "expected ':' after `slot`"],
  [c.FUD0433({ span: S, problem: 'slot', directive: '@RenderSection' }), '`slot` takes a string literal'],
  [c.FUD0433({ span: S, problem: 'required', directive: '@RenderSection' }), '`required` takes `true` or `false`'],
  [c.FUD0440({ tag: 'card' }), '(e.g. "app-card")'],
  [c.FUD0440({ tag: '' }), 'invalid custom element name "": it must be kebab-case and contain a hyphen (e.g. "app-card")'],
  [c.FUD0443({ file: F, target: 'directory' }), 'already exists and is not empty'],
  [c.FUD0443({ file: F, target: 'file' }), `${F} already exists; pass --force`],
  [c.FUD0446({ name: 'pie', available: ['cabecera'] }), '@RenderSection(pie); it declares: cabecera'],
  [c.FUD0446({ name: 'pie', available: [] }), 'the layout declares no @RenderSection(pie)'],
  [c.FUD0448({ problem: 'flag-needs-value', name: 'in' }), 'flag --in needs a value'],
  [c.FUD0448({ problem: 'unknown-flag', name: 'zz' }), 'unknown flag --zz'],
  [c.FUD0448({ problem: 'unknown-command', command: 'zz' }), 'unknown command "zz"'],
  [c.FUD0448({ problem: 'quote-style', value: 'zz' }), 'unknown quote style "zz"'],
  [c.FUD0448({ problem: 'line-terminator', value: 'zz' }), 'unknown line terminator "zz"'],
  [c.FUD0448({ problem: 'print-width' }), '--print-width needs a number'],
  [c.FUD0448({ problem: 'tab-width' }), '--tab-width needs a number'],
  [c.FUD0448({ problem: 'new-needs-name' }), 'fudic new needs a project name'],
  [c.FUD0448({ problem: 'package-manager', value: 'zz' }), 'unknown package manager "zz"'],
  [c.FUD0448({ problem: 'generate-needs-type' }), 'fudic g needs a type'],
  [c.FUD0448({ problem: 'generate-needs-name', type: 'page' }), 'fudic g page needs a name'],
  [c.FUD0448({ problem: 'unknown-type', type: 'zz' }), 'unknown type "zz"'],
  [c.FUD0448({ problem: 'route-segment', part: '[', route: '/a/[' }), 'invalid route segment "[" in "/a/["'],
  [c.FUD0451({ line: 'pnpm i', status: null }), 'could not run `pnpm i`: is it installed and on your PATH?'],
  [c.FUD0451({ line: 'pnpm i', status: 1 }), '`pnpm i` exited with code 1'],
  [c.FUD0482({ span: S, error: new Error('boom') }), 'The formatter could not finish: boom'],
  [c.FUD0482({ span: S, error: 'bang' }), 'The formatter could not finish: bang'],
  [c.FUD0592({ span: S, reason: 'file' }), '<input type="file">'],
  [c.FUD0592({ span: S, reason: 'no-value' }), '`submit`, `reset`, `button` and `image`'],
  [c.FUD0596({ span: S, name: 'error' }), 'e.g. `error="@f.title"`'],
  [c.FUD0596({ span: S, name: 'summary' }), 'e.g. `summary="@f"`'],
  [c.FUD0598({ span: S, node: 'f', reason: 'loop', attr: 'error' }), 'a `error` marker cannot sit inside a loop'],
  [c.FUD0598({ span: S, node: 'f', reason: 'second' }), '`f` already has a marker in this component'],
  [c.FUD0662({ span: S, name: 'x', available: ['item'] }), 'this loop declares `item`'],
  [c.FUD0662({ span: S, name: 'x', available: [] }), 'this loop declares no binding to delegate'],
  [c.FUD0665({ span: S, event: 'focus', substitute: 'focusin' }), 'never be delegated, use `@focusin`'],
  [c.FUD0665({ span: S, event: 'scroll' }), '`scroll` does not bubble, so it can never be delegated'],
  [c.FUD0667({ span: S, name: 'id' }), 'reads it as `$id`'],
  [c.FUD0667({ span: S, name: '' }), 'reads it as `$name`'],
  [c.FUD0682({ span: S, provider: 'Api', zone: 'client' }), 'injected in @client but this @code only provides it in @server'],
  [c.FUD0682({ span: S, provider: 'Api', zone: 'server' }), 'injected in @server but this @code only provides it in @client'],
  [c.FUD0700({ span: S, kind: 'server-region' }), 'a layout has no `@server` region'],
  [c.FUD0700({ span: S, kind: 'client-region' }), 'a layout has no `@client` region'],
  [c.FUD0700({ span: S, kind: 'statement' }), 'declares its props and nothing else'],
  [c.FUD0700({ span: S, kind: 'reactive', name: 'n' }), '`n` has no half of client'],
  [c.FUD0702({ span: S, name: 'title', type: 'string' }), 'requires the prop `title`: string and'],
  [c.FUD0702({ span: S, name: 'title' }), 'requires the prop `title` and'],
  [c.FUD0725({ file: F, problem: 'unreadable', reason: 'EACCES' }), 'fudic.json could not be read: EACCES'],
  [c.FUD0725({ file: F, problem: 'not-json', reason: 'eof' }), 'fudic.json is not valid JSON: eof'],
  [c.FUD0725({ file: F, problem: 'not-object' }), 'fudic.json must be a JSON object'],
  [c.FUD0725({ file: F, problem: 'string-field', field: 'id', pattern: '/x/', note: 'n' }), 'fudic.json "id" must be a string matching /x/ (n)'],
  [c.FUD0725({ file: F, problem: 'kind' }), 'fudic.json "kind" must be "app" or "lib"'],
  [c.FUD0725({ file: F, problem: 'style-array', field: 'styles' }), 'a sheet for every component goes in'],
  [c.FUD0725({ file: F, problem: 'style-not-object', field: 'styles' }), 'fudic.json "styles" must be an object of "name": "path"'],
  [c.FUD0725({ file: F, problem: 'style-entry', field: 'styles', name: 'a-b', pattern: '/x/' }), '"styles.a-b" must be a path'],
  [c.FUD0725({ file: F, problem: 'flag', field: 'prefix', value: 'A', pattern: '/x/' }), '--prefix "A" is not usable in fudic.json'],
  [c.FUD0740({ file: F, name: 'theme', entry: 'x.css', problem: 'missing' }), '"x.css" does not exist.'],
  [c.FUD0740({ file: F, name: 'theme', entry: 'x.css', problem: 'unreadable', reason: 'EISDIR' }), 'could not be read: EISDIR'],
  [c.FUD0741({ file: F, where: 'project', name: 'theme' }), 'is both in "globalStyles" and in "styles"'],
  [c.FUD0741({ file: F, where: 'chain', name: 'theme', first: 'a/package.json' }), '"a/package.json" and'],
  [c.FUD0744({ span: S, name: 'x', choosable: [] }), ', and it declares none'],
  [c.FUD0744({ span: S, name: 'x', choosable: ['a', 'b'] }), 'its fudic.json (a, b)'],
  [c.FUD0760({ file: F, reason: 'not-installed', href: '@acme/ui/x.fud' }), 'names a package that is not installed'],
  [c.FUD0760({ file: F, reason: 'not-exported', href: '@acme/ui/x.fud', pkg: '@acme/ui' }), 'the package "@acme/ui" is installed but does not publish'],
  [c.FUD0761({ span: S, kind: 'link', tag: 'x-a', defined: '/a.fud', path: '/b.fud' }), 'two files define the tag "x-a": /a.fud and /b.fud'],
  [c.FUD0761({ kind: 'library', tag: 'x-a', library: '@acme/ui', file: 'a.fud' }), 'the library "@acme/ui" already defines "x-a" (a.fud)'],
  [c.FUD0782({ project: 'web', names: [] }), '--project web: no such project — there are none here'],
  [c.FUD0782({ project: 'web', names: ['a', 'b'] }), '; there is: a, b'],
  [c.FUD0784({ file: F, taken: 'name', name: 'web', at: 'apps/web' }), 'a project named "web" is already at apps/web'],
  [c.FUD0784({ file: F, taken: 'directory', at: 'apps/web' }), 'apps/web is already a fudic project'],
  [c.FUD0785({ name: 'ui', problem: 'missing', libraries: [] }), 'no such project in the workspace; this workspace has no libraries'],
  [c.FUD0785({ name: 'ui', problem: 'app', libraries: ['kit'] }), 'that is an app, and an app exports nothing; libraries: kit'],
  [c.FUD0802({ file: F, what: 'piece', url: '/r.js', pkg: '@fudic/core' }), 'the output already holds "/r.js" with different bytes'],
  [c.FUD0802({ file: F, what: 'map', url: '/r.js', pkg: '@fudic/core' }), 'the source map of "/r.js"'],
  [c.FUD0820({ span: S, keyword: '@snippet', text: '' }), '@snippet expects a name'],
  [c.FUD0820({ span: S, keyword: '@snippet', text: 'a-b' }), '"a-b" is not a valid snippet name'],
  [c.FUD0823({ span: S, where: 'file' }), 'a file of snippets has no @code'],
  [c.FUD0823({ span: S, where: 'snippet' }), 'a @snippet has no @code'],
  [c.FUD0826({ span: S, name: 'card' }), 'no snippet called "card" is in scope'],
  [c.FUD0826({ span: S, name: 'card', namespace: 'ui' }), '"ui" declares no snippet called "card"'],
  [c.FUD0828({ span: S, name: 'card', param: '', index: 0 }), 'is missing "argument 1"'],
  [c.FUD0828({ span: S, name: 'card', param: 'title', index: 0 }), 'is missing "title"'],
  [c.FUD0829({ span: S, name: 'card', count: 1 }), '@render card takes 1 argument'],
  [c.FUD0829({ span: S, name: 'card', count: 2 }), '@render card takes 2 arguments'],
  [c.FUD0834({ span: S, name: 'card', where: 'file' }), 'this file declares two snippets called "card"'],
  [c.FUD0834({ span: S, name: 'card', where: 'scope', first: 'a.fud', second: 'b.fud' }), "in this file's scope: a.fud and b.fud"],
  [c.FUD0836({ span: S, problem: 'no-href' }), '<link rel="snippet"> requires a static href'],
  [c.FUD0836({ span: S, problem: 'unresolved', href: './x.fud' }), 'no file for "./x.fud"'],
  [c.FUD0836({ span: S, problem: 'empty', path: '/x.fud' }), '/x.fud declares no @snippet'],
  [c.FUD0890({ span: S, names: ['pie'] }), 'the section `pie`: declare it with'],
  [c.FUD0890({ span: S, names: ['cabecera', 'pie'] }), 'the sections `cabecera`, `pie`: declare them with'],
  [c.FUD0895({ span: S, form: 'group' }), 'an argument written `@( … )` is that group'],
  [c.FUD0895({ span: S, form: 'path' }), 'an argument after a bare `@` is a name or a path'],
];

describe('every variant says its own sentence', () => {
  for (const [d, words] of CASES) {
    it(`${d.code}: ${words}`, () => {
      expect(d.message).toContain(words);
    });
  }

  it('and no two variants of one code say the same thing', () => {
    const byCode = new Map<string, string[]>();
    for (const [d] of CASES) byCode.set(d.code, [...(byCode.get(d.code) ?? []), d.message]);
    for (const [, messages] of byCode) expect(new Set(messages).size).toBe(messages.length);
  });
});

describe('the three constructors keep the place and drop the data', () => {
  it('a source diagnostic with no file and with related locations', () => {
    const related = [{ span: span(5, 6), message: 'declared here' }];
    expect(c.FUD0051({ span: S, name: 'p', related })).toEqual({
      severity: 'error',
      code: 'FUD0051',
      message: c.FUD0051({ span: S, name: 'p' }).message,
      span: S,
      related,
    });
  });

  it('a file diagnostic with no span', () => {
    expect(c.FUD0443({ file: F, target: 'file' })).not.toHaveProperty('span');
  });

  it('a project diagnostic has neither file nor span', () => {
    expect(Object.keys(c.FUD0451({ line: 'x', status: 1 })).sort()).toEqual(['code', 'message', 'severity']);
  });
});
