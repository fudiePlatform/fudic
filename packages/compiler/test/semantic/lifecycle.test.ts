/**
 * SDD-86 §3.2, §3.3, criteria 18–20 — where a lifecycle hook may be written.
 *
 *   `FUD1560`  a hook anywhere but as a statement of its own at the top level of `@code`.
 *   `FUD1561`  `beforeCreate` / `afterCreate` in a route, a page or a layout.
 *   `FUD1562`  a declaration or an import named like a hook.
 */

import { describe, expect, it } from 'vitest';
import { atConstructs } from '../../src/constructs.js';
import { parseDocument } from '../../src/html/index.js';
import { viewDiagnostics } from './_view.js';

const HOOKS = ['beforeHydrate', 'afterHydrate', 'beforeCreate', 'afterCreate', 'onConnect', 'onDisconnect', 'onDispose'];
const NOT_CREATE = HOOKS.filter((h) => !h.endsWith('Create'));
const OURS = new Set(['FUD1560', 'FUD1561', 'FUD1562', 'FUD1563']);

const component = (code: string, view = '<p>x</p>'): string =>
  `@code {\n${code}\n}\n<app-test>\n  <template shadowrootmode="open">${view}</template>\n</app-test>\n`;

const route = (code: string, view = '<p>x</p>'): string =>
  `<link rel="layout" href="./_layout.fud">\n@code {\n${code}\n}\n${view}\n`;

const page = (code: string): string =>
  `<!DOCTYPE html>\n<html>\n<head>\n@code {\n${code}\n}\n<title>t</title>\n</head>\n<body><p>x</p></body>\n</html>\n`;

const layout = (code: string): string =>
  `<!DOCTYPE html>\n<html>\n<head>\n@code {\n${code}\n}\n@RenderHead()\n</head>\n<body>\n<main>@RenderBody()</main>\n</body>\n</html>\n`;

/** Every diagnostic of the three codes, parse and semantic, as `CODE text-under-it`. */
function said(source: string): readonly string[] {
  const parsed = parseDocument(source, { atConstructs }).diagnostics;
  return [...parsed, ...viewDiagnostics(source)]
    .filter((d) => OURS.has(d.code))
    .map((d) => `${d.code} ${source.slice(d.span.start, d.span.end)}`);
}

/** Every diagnostic at all, so a valid file is checked to say NOTHING (not only none of ours). */
function everything(source: string): readonly string[] {
  return viewDiagnostics(source).map((d) => d.code);
}

describe('valid — a statement at the top level of @code (§3.2)', () => {
  it('the seven, in a component, say nothing', () => {
    const code = HOOKS.map((h) => `${h}((host) => { host.dataset.x = '1'; });`).join('\n');
    expect(said(component(code))).toEqual([]);
  });

  it('the same hook several times', () => {
    expect(said(component('afterHydrate(() => {});\nafterHydrate(() => {});\nafterHydrate(() => {});'))).toEqual([]);
  });

  it('beside the rest of the @code: props, a signal, a function', () => {
    const code = [
      "const { variant = 'default' } = props<{ variant?: string }>();",
      "import { signal } from '@fudic/core';",
      'const n = signal(0);',
      'function more() { n.set(n() + 1); }',
      'onConnect((host) => {',
      '  const ro = new ResizeObserver(() => {});',
      '  ro.observe(host);',
      '  return () => ro.disconnect();',
      '});',
    ].join('\n');
    expect(said(component(code))).toEqual([]);
  });

  it('the five that are not create hooks, in a route, a page and a layout', () => {
    const code = NOT_CREATE.map((h) => `${h}(() => {});`).join('\n');
    for (const source of [route(code), page(code), layout(code)]) expect(said(source)).toEqual([]);
  });

  it('a hook whose argument is a named function, not an inline one', () => {
    expect(said(component('function ready(host) {}\nafterHydrate(ready);'))).toEqual([]);
  });

  it('an async function — the IndexedDB example of §4.9', () => {
    expect(said(route('afterHydrate(async () => { await Promise.resolve(); });'))).toEqual([]);
  });

  it('a method or a property with a hook’s name is not a hook', () => {
    const code = [
      'const obj = { afterHydrate() {}, onConnect: 1 };',
      'obj.afterHydrate();',
      "obj['onDispose'];",
      'class Card { onConnect() {} }',
    ].join('\n');
    expect(said(component(code))).toEqual([]);
  });
});

describe('FUD1560 — outside the top level (criterion 18)', () => {
  it('inside a function, on the call', () => {
    expect(said(component('function setup() {\n  afterHydrate(() => {});\n}'))).toEqual([
      'FUD1560 afterHydrate(() => {})',
    ]);
  });

  it('inside an arrow function', () => {
    expect(said(component('const setup = () => onConnect(() => {});'))).toEqual(['FUD1560 onConnect(() => {})']);
  });

  it('inside a handler of the @code', () => {
    expect(said(component('function onClick() { onDispose(() => {}); }', '<button @click=@onClick>x</button>'))).toEqual([
      'FUD1560 onDispose(() => {})',
    ]);
  });

  it('inside an if, a loop and a block', () => {
    expect(said(component('if (true) { afterHydrate(() => {}); }'))).toEqual(['FUD1560 afterHydrate(() => {})']);
    expect(said(component('for (const x of [1]) { onConnect(() => {}); }'))).toEqual(['FUD1560 onConnect(() => {})']);
    expect(said(component('{ beforeHydrate(() => {}); }'))).toEqual(['FUD1560 beforeHydrate(() => {})']);
  });

  it('inside the callback of another hook', () => {
    expect(said(component('afterHydrate(() => {\n  onConnect(() => {});\n});'))).toEqual(['FUD1560 onConnect(() => {})']);
  });

  it('inside a callback handed to anything else', () => {
    expect(said(component('setTimeout(() => afterCreate(() => {}), 0);'))).toEqual(['FUD1560 afterCreate(() => {})']);
  });

  it('a top-level call that is not a statement of its own', () => {
    expect(said(component('const off = onConnect(() => {});'))).toEqual(['FUD1560 onConnect(() => {})']);
    expect(said(component('void afterHydrate(() => {});'))).toEqual(['FUD1560 afterHydrate(() => {})']);
    expect(said(component('true && onDispose(() => {});'))).toEqual(['FUD1560 onDispose(() => {})']);
  });

  it('one diagnostic per call, each on its own call', () => {
    expect(
      said(component('function a() { afterHydrate(() => {}); }\nfunction b() { onDisconnect(() => {}); }')),
    ).toEqual(['FUD1560 afterHydrate(() => {})', 'FUD1560 onDisconnect(() => {})']);
  });

  it('inside a function of a route, wins over FUD1561 for a create hook', () => {
    expect(said(route('function f() { afterCreate(() => {}); }'))).toEqual(['FUD1560 afterCreate(() => {})']);
  });

  it('a handler written in the view, not in @code (§3.2: «un handler»)', () => {
    expect(said(component('', '<button @click=@(() => afterHydrate(() => {}))>x</button>'))).toEqual([
      'FUD1560 afterHydrate(() => {})',
    ]);
  });

  it('an inline @{ } block of the view', () => {
    expect(said(component('', '@{ onConnect(() => {}); }<p>x</p>'))).toEqual(['FUD1560 onConnect(() => {})']);
  });

  it('an interpolation and a control header of the view', () => {
    expect(said(component('', '<p>@(onDispose(() => {}))</p>'))).toEqual(['FUD1560 onDispose(() => {})']);
    expect(said(component('', '@if (afterHydrate(() => {})) { <p>x</p> }'))).toEqual(['FUD1560 afterHydrate(() => {})']);
  });

  it('a hook in the view of a route is FUD1560 too', () => {
    expect(said(route('', '<button @click=@(() => onConnect(() => {}))>x</button>'))).toEqual([
      'FUD1560 onConnect(() => {})',
    ]);
  });

  it('a parameter of a view handler named like a hook is not FUD1562 — that code is about @code', () => {
    expect(said(component('', '<button @click=@((onConnect) => onConnect)>x</button>'))).toEqual([]);
  });
});

describe('FUD1561 — a create hook where nothing is created (criterion 19)', () => {
  for (const hook of ['beforeCreate', 'afterCreate']) {
    it(`${hook} in a route, a page and a layout, on the call`, () => {
      const code = `${hook}(() => {});`;
      for (const source of [route(code), page(code), layout(code)]) {
        expect(said(source)).toEqual([`FUD1561 ${hook}(() => {})`]);
      }
    });

    it(`${hook} in a component is fine`, () => {
      expect(said(component(`${hook}(() => {});`))).toEqual([]);
    });
  }

  it('the message names the file it is in', () => {
    const routeMsg = viewDiagnostics(route('afterCreate(() => {});')).find((d) => d.code === 'FUD1561')!;
    const pageMsg = viewDiagnostics(page('afterCreate(() => {});')).find((d) => d.code === 'FUD1561')!;
    const layoutMsg = viewDiagnostics(layout('beforeCreate(() => {});')).find((d) => d.code === 'FUD1561')!;
    expect(routeMsg.message).toContain('in a route');
    expect(pageMsg.message).toContain('in a page');
    expect(layoutMsg.message).toContain('in a layout');
  });
});

describe('FUD1562 — a declaration hides a hook (criterion 20)', () => {
  it('const afterHydrate = …, on the name', () => {
    expect(said(component('const afterHydrate = () => {};'))).toEqual(['FUD1562 afterHydrate']);
  });

  it("import { onConnect } from '…', on the local name", () => {
    expect(said(component("import { onConnect } from './x';"))).toEqual(['FUD1562 onConnect']);
  });

  it('an import renamed to a hook, and one renamed away from it', () => {
    expect(said(component("import { x as onDispose } from './x';"))).toEqual(['FUD1562 onDispose']);
    expect(said(component("import { onDispose as x } from './x';"))).toEqual([]);
  });

  it('default and namespace imports', () => {
    expect(said(component("import afterCreate from './x';"))).toEqual(['FUD1562 afterCreate']);
    expect(said(component("import * as beforeHydrate from './x';"))).toEqual(['FUD1562 beforeHydrate']);
  });

  it('let, var, destructuring and defaults', () => {
    expect(said(component('let onConnect;'))).toEqual(['FUD1562 onConnect']);
    expect(said(component('var onDisconnect = 1;'))).toEqual(['FUD1562 onDisconnect']);
    expect(said(component('const { a: afterHydrate } = { a: 1 };'))).toEqual(['FUD1562 afterHydrate']);
    expect(said(component('const [onDispose = 1] = [];'))).toEqual(['FUD1562 onDispose']);
    expect(said(component('const { ...beforeCreate } = {};'))).toEqual(['FUD1562 beforeCreate']);
  });

  it('a function, a class, a parameter and a catch binding', () => {
    expect(said(component('function onConnect() {}'))).toEqual(['FUD1562 onConnect']);
    expect(said(component('class afterHydrate {}'))).toEqual(['FUD1562 afterHydrate']);
    expect(said(component('const C = class onDispose {};'))).toEqual(['FUD1562 onDispose']);
    expect(said(component('function f(onDisconnect) {}'))).toEqual(['FUD1562 onDisconnect']);
    expect(said(component('const f = ({ afterCreate } = {}) => afterCreate;'))).toEqual(['FUD1562 afterCreate']);
    expect(said(component('try {} catch (beforeHydrate) {}'))).toEqual(['FUD1562 beforeHydrate']);
  });

  it('anonymous functions and classes declare nothing', () => {
    expect(said(component('const f = function () {};\nconst K = class {};'))).toEqual([]);
  });

  it('an anonymous `export default` in @code does not break the semantic pass', () => {
    expect(() => said(component('export default function () {}'))).not.toThrow();
    expect(() => said(component('export default class {}'))).not.toThrow();
  });

  it('in a nested scope too', () => {
    expect(said(component('function f() { const onConnect = 1; return onConnect; }'))).toEqual(['FUD1562 onConnect']);
  });

  it('in a route', () => {
    expect(said(route('const afterHydrate = 1;'))).toEqual(['FUD1562 afterHydrate']);
  });

  it('a shadowed name and a call to it: the call is the local function, each said once', () => {
    const out = said(component('const onConnect = (f) => f;\nonConnect(() => {});'));
    expect(out).toContain('FUD1562 onConnect');
  });
});

describe('valid files say nothing else either', () => {
  it('a component with the seven hooks has no diagnostic at all', () => {
    const code = HOOKS.map((h) => `${h}((host) => {});`).join('\n');
    expect(everything(component(code))).toEqual([]);
  });
});

describe('FUD1563 — a layout hook reads a prop of the layout (decision 21)', () => {
  const PROPS = "const { site = 'fudic', lang } = props<{ site?: string; lang?: string }>();";

  it('on the read, once per read', () => {
    expect(said(layout(`${PROPS}\nafterHydrate((host) => { host.title = site; });`))).toEqual(['FUD1563 site']);
    expect(said(layout(`${PROPS}\nonDisconnect(() => { console.log(site, lang); });`))).toEqual([
      'FUD1563 site',
      'FUD1563 lang',
    ]);
  });

  it('an imported name read in a layout hook is fine', () => {
    expect(said(layout(`import { items } from './store';\n${PROPS}\nafterHydrate(() => { items(); });`))).toEqual([]);
  });

  it('a hook that reads no prop, and a prop read outside any hook, say nothing', () => {
    expect(said(layout(`${PROPS}\nafterHydrate((host) => { host.dataset.up = '1'; });`))).toEqual([]);
  });

  it('a local binding of the hook with a prop’s name is not the prop', () => {
    expect(said(layout(`${PROPS}\nafterHydrate(() => { const site = 'x'; console.log(site); });`))).toEqual([]);
  });

  it('only a layout: a component or a route hook may read its own props', () => {
    expect(said(component(`${PROPS}\nafterHydrate(() => { console.log(site); });`))).toEqual([]);
  });
});
