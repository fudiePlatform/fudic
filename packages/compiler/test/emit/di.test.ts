/**
 * Dependency injection in the emit (SDD-38): what a `@code` says about it, what promotes a
 * component to N3 and what does not, and the rewrite that hands every call its container.
 */
import { describe, expect, it } from 'vitest';
import {
  emitComponentClientModule,
  emitComponentModule,
  emitLayoutModule,
  emitPageModule,
  emitRouteModule,
  hydratableTags,
  isIntrinsicallyHydratable,
  resolveComponents,
  resolveDocument,
} from '../../src/emit/index.js';
import { extractCode } from '../../src/emit/oxc-code.js';
import { memoryIo, parse } from './_support.js';

/** A page that links every component of `files` and instantiates `body`. */
function page(links: readonly string[], body: string): string {
  const head = links.map((t) => `<link rel="component" href="./${t}.fud">`).join('\n    ');
  return `<!DOCTYPE html>
<html>
  <head>
    ${head}
  </head>
  <body>${body}</body>
</html>
`;
}

/** A component file: its `@code` region and the markup of its own tag. */
function component(tag: string, code: string, markup: string): string {
  return `${code}
<${tag}>
  <template shadowrootmode="open">
${markup}
  </template>
</${tag}>
`;
}

const graphOf = (files: Record<string, string>): ReturnType<typeof resolveComponents> =>
  resolveComponents('/app/home.fud', memoryIo(files));

const codeOfSource = (source: string): ReturnType<typeof extractCode> => {
  const doc = parse(source);
  if (doc.type !== 'component-document') throw new Error('expected a component document');
  return extractCode(source, doc);
};

const PROVIDER = `@code {
  import { provide } from '@fudic/di';
  import { Cart } from './services/cart.js';

  provide(Cart, () => new Cart());
}`;

const CONSUMER = `@code {
  import { inject } from '@fudic/di';
  import { Cart } from './services/cart.js';

  const cart = inject(Cart);
}`;

describe('extraction', () => {
  it('reads a call of each kind, with its zone and its provider verbatim', () => {
    const source = component(
      'x-both',
      `@code {
  import { inject, provide } from '@fudic/di';
  import { Cart, LOCALE } from './services/cart.js';

  provide(Cart, () => new Cart());
  const cart = inject(Cart);

  @server {
    import { Db } from './services/db.js';
    const db = inject(Db);
  }
  @client {
    const locale = inject(LOCALE, { optional: true });
  }
}`,
      '<p>@(cart.total)</p>',
    );
    const code = codeOfSource(source);
    expect(code.di.map((d) => [d.kind, d.zone, d.provider])).toEqual([
      ['provide', 'neutral', 'Cart'],
      ['inject', 'neutral', 'Cart'],
      ['inject', 'server', 'Db'],
      ['inject', 'client', 'LOCALE'],
    ]);
  });

  it('reads nothing when the names did not come from @fudic/di', () => {
    const source = component(
      'x-own',
      `@code {
  const inject = (x) => x;
  const cart = inject(1);
}`,
      '<p>ok</p>',
    );
    expect(codeOfSource(source).di).toEqual([]);
  });

  it('follows the binding, not the word: `import { inject as ask }`', () => {
    const source = component(
      'x-alias',
      `@code {
  import { inject as ask } from '@fudic/di';
  import { Cart } from './services/cart.js';

  const cart = ask(Cart);
}`,
      '<p>ok</p>',
    );
    const code = codeOfSource(source);
    expect(code.di.map((d) => d.kind)).toEqual(['inject']);
    expect(code.neutral.server.body[0]?.text).toBe('const cart = injectFrom($ioc, Cart);');
  });

  it('emits the @server region of a component, which used to reach nowhere', () => {
    const source = component(
      'x-server',
      `@code {
  @server {
    import { Db } from './services/db.js';
    const rows = Db.all();
  }
}`,
      '<p>ok</p>',
    );
    const code = codeOfSource(source);
    expect(code.server.imports).toEqual([`import { Db } from './services/db.js';`]);
    expect(code.server.body.map((s) => s.text)).toEqual(['const rows = Db.all();']);
  });

  it('reads nothing from a default or namespace import: neither binds a NAME', () => {
    const source = component(
      'x-star',
      `@code {
  import di from '@fudic/di';
  import * as all from '@fudic/di';

  const cart = di.inject(1);
  const other = all.inject(2);
}`,
      '<p>ok</p>',
    );
    expect(codeOfSource(source).di).toEqual([]);
  });

  it('survives a call with no argument at all: the provider is simply empty', () => {
    const source = component(
      'x-empty',
      `@code {
  import { inject } from '@fudic/di';
  const nothing = inject();
}`,
      '<p>ok</p>',
    );
    expect(codeOfSource(source).di.map((d) => d.provider)).toEqual(['']);
  });

  it('keeps out of the neutral zone everything that is not a DI call', () => {
    const source = component(
      'x-quiet',
      `@code {
  import { Cart } from './services/cart.js';
  const total = Cart.zero;
}`,
      '<p>ok</p>',
    );
    const code = codeOfSource(source);
    expect(code.neutral.server).toEqual({ imports: [], body: [] });
    expect(code.neutral.client).toEqual({ imports: [], body: [] });
  });
});

describe('the rewrite is by offset, never by text', () => {
  it('leaves an `inject(` inside a string and inside a comment alone', () => {
    const source = component(
      'x-text',
      `@code {
  import { inject } from '@fudic/di';
  import { Cart } from './services/cart.js';

  @client {
    const label = "inject(Cart)";
    // inject(Cart) is written here on purpose
    const cart = inject(Cart);
  }
}`,
      '<p>@(label)</p>',
    );
    const body = codeOfSource(source).client.body.map((s) => s.text);
    expect(body).toEqual([
      'const label = "inject(Cart)";',
      'const cart = injectFrom($ioc, Cart);',
    ]);
  });

  it('keeps the arguments intact, options and all', () => {
    const source = component(
      'x-opts',
      `@code {
  import { inject, provide } from '@fudic/di';
  import { Cart } from './services/cart.js';

  provide(Cart, () => new Cart(), { transient: true });
  const cart = inject(Cart, { optional: true });
}`,
      '<p>ok</p>',
    );
    expect(codeOfSource(source).neutral.server.body.map((s) => s.text)).toEqual([
      'provideIn($own, Cart, () => new Cart(), { transient: true });',
      'const cart = injectFrom($ioc, Cart, { optional: true });',
    ]);
  });
});

describe('the level: inject promotes, provide does not', () => {
  const files = {
    '/app/home.fud': page(['x-owner', 'x-user'], '<x-owner></x-owner><x-user></x-user>'),
    '/app/x-owner.fud': component('x-owner', PROVIDER, '<p>owner</p>'),
    '/app/x-user.fud': component('x-user', CONSUMER, '<p>@(cart.total)</p>'),
  };

  it('a component that only declares providers stays N1', () => {
    const graph = graphOf(files);
    const owner = graph.components.get('x-owner')!;
    expect(isIntrinsicallyHydratable(owner)).toBe(false);
    expect(hydratableTags(graph).has('x-owner')).toBe(false);
  });

  it('a component that injects in the neutral zone is N3', () => {
    const graph = graphOf(files);
    expect(isIntrinsicallyHydratable(graph.components.get('x-user')!)).toBe(true);
    expect(hydratableTags(graph).has('x-user')).toBe(true);
  });

  it('an inject written in @server does not promote: it never runs in the browser', () => {
    const graph = graphOf({
      '/app/home.fud': page(['x-db'], '<x-db></x-db>'),
      '/app/x-db.fud': component(
        'x-db',
        `@code {
  import { inject } from '@fudic/di';
  import { Db } from './services/db.js';

  @server {
    const db = inject(Db);
  }
}`,
        '<p>db</p>',
      ),
    });
    expect(isIntrinsicallyHydratable(graph.components.get('x-db')!)).toBe(false);
  });

  it('the provider-only component gets no data-fud-id and no DI in its chunk', () => {
    const graph = graphOf(files);
    const owner = graph.components.get('x-owner')!;
    expect(emitComponentClientModule(graph, owner)).not.toContain('provideIn');
    expect(emitComponentClientModule(graph, owner)).not.toContain('@fudic/di');
    expect(emitComponentModule(graph, graph.components.get('x-user')!)).toContain('injectFrom');
  });
});

describe('the server module', () => {
  it('opens a container for whoever declares a provider, and hands it to its children', () => {
    const graph = graphOf({
      '/app/home.fud': page(['x-owner', 'x-user'], '<x-owner></x-owner>'),
      '/app/x-owner.fud': component('x-owner', PROVIDER, '<x-user></x-user>'),
      '/app/x-user.fud': component('x-user', CONSUMER, '<p>@(cart.total)</p>'),
    });
    const mjs = emitComponentModule(graph, graph.components.get('x-owner')!);

    expect(mjs).toContain(`import { provideIn } from '@fudic/di';`);
    expect(mjs).toContain('const $own = $ioc.child("x-owner");');
    // From here down this component resolves from the container it owns, so a `provide` and
    // an `inject` of the same token in one `@code` meet.
    expect(mjs).toContain('$ioc = $own;');
    expect(mjs).toContain('provideIn($own, Cart, () => new Cart());');
    expect(mjs).toMatch(/renderXUser\(\$dom, \$n\d+, \{ {2}\}, \$own\);/u);
  });

  it('forwards the container untouched when the component declares nothing', () => {
    const graph = graphOf({
      '/app/home.fud': page(['x-mid', 'x-user'], '<x-mid></x-mid>'),
      '/app/x-mid.fud': component('x-mid', '', '<x-user></x-user>'),
      '/app/x-user.fud': component('x-user', CONSUMER, '<p>@(cart.total)</p>'),
    });
    const mjs = emitComponentModule(graph, graph.components.get('x-mid')!);

    expect(mjs).not.toContain('$own');
    expect(mjs).toMatch(/renderXUser\(\$dom, \$n\d+, \{ {2}\}, \$ioc\);/u);
  });

  it('writes the container node into the slice, and only for an instance that injects', () => {
    const graph = graphOf({
      '/app/home.fud': page(['x-user'], '<x-user></x-user>'),
      '/app/x-user.fud': component('x-user', CONSUMER, '<p>@(cart.total)</p>'),
    });
    expect(emitComponentModule(graph, graph.components.get('x-user')!)).toContain(
      '$dom.state($shadow, [], [], $ioc.index);',
    );
  });

  it('emits the @server region here and nowhere else', () => {
    const source = component(
      'x-db',
      `@code {
  import { inject } from '@fudic/di';

  @server {
    import { Db } from './services/db.js';
    const rows = inject(Db).all();
  }
}`,
      '<p>db</p>',
    );
    const graph = graphOf({
      '/app/home.fud': page(['x-db'], '<x-db></x-db>'),
      '/app/x-db.fud': source,
    });
    const comp = graph.components.get('x-db')!;

    const mjs = emitComponentModule(graph, comp);
    expect(mjs).toContain(`import { Db } from './services/db.js';`);
    expect(mjs).toContain('const rows = injectFrom($ioc, Db).all();');

    const chunk = emitComponentClientModule(graph, comp);
    expect(chunk).not.toContain('Db');
    expect(chunk).not.toContain('injectFrom');
  });

  it('imports no helper for a call the browser is the only one to make', () => {
    const graph = graphOf({
      '/app/home.fud': page(['x-c'], '<x-c></x-c>'),
      '/app/x-c.fud': component(
        'x-c',
        `@code {
  import { inject } from '@fudic/di';
  import { Cart } from './services/cart.js';

  @client {
    const cart = inject(Cart);
  }
}`,
        '<p>c</p>',
      ),
    });
    const mjs = emitComponentModule(graph, graph.components.get('x-c')!);
    expect(mjs).not.toContain('@fudic/di');
    expect(mjs).not.toContain('injectFrom');
  });

  it('opens the route container in the page module, and only when the page has DI', () => {
    const withDi = graphOf({
      '/app/home.fud': page(['x-user'], '<x-user></x-user>'),
      '/app/x-user.fud': component('x-user', CONSUMER, '<p>@(cart.total)</p>'),
    });
    const page1 = emitPageModule(withDi);
    expect(page1).toContain('export function* page(data, io, $ioc) {');
    expect(page1).toContain('const $root = $ioc ?? iocRoot();');
    expect(page1).toMatch(/renderXUser\(\$dom, \$n\d+, \{ {2}\}, \$root\);/u);

    const without = graphOf({
      '/app/home.fud': page(['x-plain'], '<x-plain></x-plain>'),
      '/app/x-plain.fud': component('x-plain', '', '<p>plain</p>'),
    });
    const page2 = emitPageModule(without);
    expect(page2).not.toContain('iocRoot');
    expect(page2).not.toContain('$root');
  });
});

describe('a route with a layout', () => {
  it('opens the container in the route and forwards it down the chain', () => {
    const files = {
      '/app/r.fud': `<link rel="layout" href="./l.fud"><link rel="component" href="./x-user.fud"><x-user></x-user>`,
      '/app/l.fud':
        '<!DOCTYPE html><html><head>@RenderHead()</head><body>@RenderBody()</body></html>',
      '/app/x-user.fud': component('x-user', CONSUMER, '<p>@(cart.total)</p>'),
    };
    const graph = resolveDocument('/app/r.fud', memoryIo(files)).value;

    const route = emitRouteModule(graph);
    expect(route).toContain('const $root = $ioc ?? iocRoot();');
    expect(route).toMatch(/renderXUser\(\$dom, \$n\d+, \{ {2}\}, \$root\);/u);
    // A layout owns no container: it hands on the one the route opened.
    expect(route).toContain('}, $root);');
    expect(emitLayoutModule(graph, graph.layouts[0]!)).toContain(
      'export function* layout(data, io, route, $ioc) {',
    );
  });
});

describe('the client chunk', () => {
  const CONSUMER_WITH_PROPS = `@code {
  import { inject } from '@fudic/di';
  import { Cart } from './services/cart.js';

  const { label, variant = 'default' } = props<{ label: string; variant?: string }>();
  const cart = inject(Cart);
}`;

  const graph = (): ReturnType<typeof resolveComponents> =>
    graphOf({
      '/app/home.fud': page(['x-user'], '<x-user label="a"></x-user>'),
      '/app/x-user.fud': component('x-user', CONSUMER_WITH_PROPS, '<p>@(cart.total)@(label)</p>'),
    });

  it('destructures the node in the LAST hole, behind every prop', () => {
    const chunk = emitComponentClientModule(graph(), graph().components.get('x-user')!);
    expect(chunk).toContain('let [$dom, $shadow, label, variant = \'default\', $p4] = $props;');
    expect(chunk).toContain('const $ioc = $container($p4);');
    expect(chunk).toContain('const cart = injectFrom($ioc, Cart);');
  });

  it('does not move an index of updateGuards: the node is behind them', () => {
    const chunk = emitComponentClientModule(graph(), graph().components.get('x-user')!);
    expect(chunk).toContain('if (2 in $p) label = $p[2];');
    expect(chunk).toContain('if (3 in $p) variant = $p[3] === undefined');
    expect(chunk).not.toContain('4 in $p');
  });

  it('imports the injector and the page tree, and nothing when nobody injects', () => {
    const chunk = emitComponentClientModule(graph(), graph().components.get('x-user')!);
    expect(chunk).toContain(`import { injectFrom } from '@fudic/di';`);
    expect(chunk).toContain(`import { containerOf as $container } from '@fudic/di/page';`);

    const plain = graphOf({
      '/app/home.fud': page(['x-plain'], '<x-plain></x-plain>'),
      '/app/x-plain.fud': component('x-plain', '', '<p>plain</p>'),
    });
    expect(emitComponentClientModule(plain, plain.components.get('x-plain')!)).not.toContain(
      '@fudic/di',
    );
  });
});
