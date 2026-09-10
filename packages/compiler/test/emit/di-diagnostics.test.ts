/**
 * `FUD0680` — injecting something nobody registers (SDD-38 §6.21).
 *
 * The rule follows ONE import hop, which is the hop the `.fud` itself writes: the module the
 * service comes from either enrols the class — `Service(C)` or `provide(C, …)` — or it does
 * not, and if it does not, and no component of this page provides it either, the injection
 * has nowhere to resolve from and fails at runtime with the token's name.
 *
 * The other half of the rule is what it must NOT do. A module that cannot be resolved or
 * read produces NO diagnostic: an error is never invented where the information is missing.
 * Neither does a token, because a token can arrive from the seed the server published, and
 * whether it did is a fact about a request and not about this file.
 */
import { describe, expect, it } from 'vitest';
import { resolveComponents } from '../../src/emit/index.js';
import { injectionDiagnostics } from '../../src/emit/di-diagnostics.js';
import { memoryIo } from './_support.js';

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

const CONSUMER = component(
  'x-panel',
  `@code {
  import { inject } from '@fudic/di';
  import { Cart } from './services/cart';

  const cart = inject(Cart);
}`,
  '<span>@(cart.id)</span>',
);

/** Everything but the service module, which each case supplies as it needs it. */
function files(extra: Record<string, string>): Record<string, string> {
  return {
    '/app/home.fud': page(['x-panel'], '<x-panel></x-panel>'),
    '/app/x-panel.fud': CONSUMER,
    ...extra,
  };
}

function check(extra: Record<string, string>): ReturnType<typeof injectionDiagnostics> {
  const io = memoryIo(files(extra));
  return injectionDiagnostics(resolveComponents('/app/home.fud', io), io);
}

describe('FUD0680 — inject of something nobody registers', () => {
  it('reports a class the imported module neither decorates nor registers', () => {
    const diagnostics = check({
      '/app/services/cart.ts': 'export class Cart {\n  readonly id = 1;\n}\n',
    });

    expect(diagnostics).toHaveLength(1);
    const [first] = diagnostics;
    expect(first?.code).toBe('FUD0680');
    expect(first?.message).toContain('Cart');
    // The span covers the PROVIDER, which is the word the author has to do something about.
    const source = files({})['/app/x-panel.fud']!;
    expect(source.slice(first!.span.start, first!.span.end)).toBe('Cart');
  });

  it('says nothing when asked of a component on its own: it has no tree to look up', () => {
    // How the plugin compiles every `.fud`. From here the ancestor that owns the provider is
    // simply not in the graph, so asking would report every component-owned service there is.
    const io = memoryIo(files({ '/app/services/cart.ts': 'export class Cart {}\n' }));
    expect(injectionDiagnostics(resolveComponents('/app/x-panel.fud', io), io)).toEqual([]);
  });

  it('says nothing when the module registers it with Service', () => {
    expect(
      check({
        '/app/services/cart.ts':
          "import { Service } from '@fudic/di';\nexport class Cart {}\nService(Cart);\n",
      }),
    ).toEqual([]);
  });

  it('says nothing when the module registers it with provide', () => {
    expect(
      check({
        '/app/services/cart.ts':
          "import { provide } from '@fudic/di';\nexport class Cart {}\nprovide(Cart, () => new Cart());\n",
      }),
    ).toEqual([]);
  });

  it('says nothing when a component of the page provides it', () => {
    // The owner is an ANCESTOR, and its registration is exactly what makes this legal: the
    // module registers nothing because `Cart` belongs to that subtree and to no root.
    const io = memoryIo({
      '/app/home.fud': page(['x-owner'], '<x-owner></x-owner>'),
      '/app/x-owner.fud':
        '<link rel="component" href="./x-panel.fud">\n' +
        component(
          'x-owner',
          `@code {
  import { provide } from '@fudic/di';
  import { Cart } from './services/cart';

  provide(Cart, () => new Cart());
}`,
          '<x-panel></x-panel>',
        ),
      '/app/x-panel.fud': CONSUMER,
      '/app/services/cart.ts': 'export class Cart {}\n',
    });
    expect(injectionDiagnostics(resolveComponents('/app/home.fud', io), io)).toEqual([]);
  });

  it('says nothing about a module it cannot read', () => {
    // The information is simply not there, and an error invented over its absence would fire
    // on every service that lives outside what this build can see.
    expect(check({})).toEqual([]);
  });

  it('says nothing about a token: the seed can serve one with no registration at all', () => {
    const io = memoryIo({
      '/app/home.fud': page(['x-panel'], '<x-panel></x-panel>'),
      '/app/x-panel.fud': component(
        'x-panel',
        `@code {
  import { inject } from '@fudic/di';
  import { LINES } from './services/cart';

  const lines = inject(LINES);
}`,
        '<span>@(lines.length)</span>',
      ),
      '/app/services/cart.ts':
        "import { token } from '@fudic/di';\nexport const LINES = token('lines');\n",
    });
    expect(injectionDiagnostics(resolveComponents('/app/home.fud', io), io)).toEqual([]);
  });

  it('says nothing about a provider that is not imported from anywhere', () => {
    const io = memoryIo({
      '/app/home.fud': page(['x-panel'], '<x-panel></x-panel>'),
      '/app/x-panel.fud': component(
        'x-panel',
        `@code {
  import { inject } from '@fudic/di';

  class Local {}
  const it = inject(Local);
}`,
        '<span>@(it)</span>',
      ),
    });
    expect(injectionDiagnostics(resolveComponents('/app/home.fud', io), io)).toEqual([]);
  });

  it('says nothing about a provider reached through a namespace', () => {
    // `services.Cart` is read back to the binding `services`, which is the module this build
    // can open — but what the module declares is `Cart`, and matching the two would be a
    // guess about how the namespace is spelled at every call site.
    const io = memoryIo({
      '/app/home.fud': page(['x-panel'], '<x-panel></x-panel>'),
      '/app/x-panel.fud': component(
        'x-panel',
        `@code {
  import { inject } from '@fudic/di';
  import * as services from './services/cart';

  const cart = inject(services.Cart);
}`,
        '<span>@(cart.id)</span>',
      ),
      '/app/services/cart.ts': 'export class Cart {}\n',
    });
    expect(injectionDiagnostics(resolveComponents('/app/home.fud', io), io)).toEqual([]);
  });

  it('says nothing about a provider that is computed', () => {
    // There is no binding at the head of a call, so there is no import to follow and no
    // question to ask. Only the runtime knows what `pick()` returned.
    const io = memoryIo({
      '/app/home.fud': page(['x-panel'], '<x-panel></x-panel>'),
      '/app/x-panel.fud': component(
        'x-panel',
        `@code {
  import { inject } from '@fudic/di';
  import { pick } from './services/cart';

  const cart = inject(pick());
}`,
        '<span>@(cart.id)</span>',
      ),
      '/app/services/cart.ts': 'export class Cart {}\nexport const pick = () => Cart;\n',
    });
    expect(injectionDiagnostics(resolveComponents('/app/home.fud', io), io)).toEqual([]);
  });

  it('says nothing about a module that is not a file of this project', () => {
    // A bare specifier is a package. What it registers is not something a build answers by
    // joining paths, and guessing would report every service that lives in a library.
    const io = memoryIo({
      '/app/home.fud': page(['x-panel'], '<x-panel></x-panel>'),
      '/app/x-panel.fud': component(
        'x-panel',
        `@code {
  import { inject } from '@fudic/di';
  import { Http } from '@acme/http';

  const http = inject(Http);
}`,
        '<span>ok</span>',
      ),
    });
    expect(injectionDiagnostics(resolveComponents('/app/home.fud', io), io)).toEqual([]);
  });

  it('reads a service module the way service modules are actually written', () => {
    const io = memoryIo({
      '/app/home.fud': page(['x-panel'], '<x-panel></x-panel>'),
      '/app/x-panel.fud': component(
        'x-panel',
        `@code {
  import { inject } from '@fudic/di';
  import { Clock, Cart, Logger, Db } from './services/all';

  const clock = inject(Clock);
  const cart = inject(Cart);
  const logger = inject(Logger);
  const db = inject(Db);
}`,
        '<span>@(cart.id)</span>',
      ),
      // Everything a real module has around the two facts this rule reads: a prologue, a
      // call that registers nothing, a registration written through a namespace — which
      // names no binding this side can match — a decorated class, a class registered by the
      // call form, and one class nothing enrols at all.
      '/app/services/all.ts':
        "'use strict';\n" +
        "import { Service, provide } from '@fudic/di';\n" +
        'import * as ns from "./other";\n' +
        'configure();\n' +
        'provide(ns.Thing, () => new ns.Thing());\n' +
        '@logged\n' +
        '@Service\n' +
        'export class Clock {}\n' +
        'class Cart {}\n' +
        'export { Cart };\n' +
        'Service(Cart);\n' +
        'export class Logger {}\n' +
        'provide(Logger, () => new Logger());\n' +
        'export class Db {}\n',
    });

    // Only `Db`: the decorator enrols `Clock`, the call enrols `Cart`, `provide` enrols
    // `Logger`, and the second lookup into this module reuses the first one's reading.
    const diagnostics = injectionDiagnostics(resolveComponents('/app/home.fud', io), io);
    expect(diagnostics.map((d) => d.code)).toEqual(['FUD0680']);
    expect(diagnostics[0]?.message).toContain('Db');
  });

  it('reads every zone: a `@server` injection resolves through the same registry', () => {
    const io = memoryIo({
      '/app/home.fud': page(['x-panel'], '<x-panel></x-panel>'),
      '/app/x-panel.fud': component(
        'x-panel',
        `@code {
  @server {
    import { inject } from '@fudic/di';
    import { Db } from './services/db';

    const db = inject(Db);
  }
}`,
        '<span>ok</span>',
      ),
      '/app/services/db.ts': 'export class Db {}\n',
    });
    // A class is BUILT, never seeded, so where the line runs changes nothing: a class the
    // registry has never heard of throws on the server exactly as it does in the browser.
    const [first] = injectionDiagnostics(resolveComponents('/app/home.fud', io), io);
    expect(first?.code).toBe('FUD0680');
    expect(first?.message).toContain('Db');
  });
});
