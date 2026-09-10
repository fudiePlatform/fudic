# @fudic/di

The injector of fudic: chained containers, resolution by owner, and **zero runtime
dependencies**. No DOM in any branch — the same code runs in the browser, in the
prerender and on the server.

```ts
import { Service, inject, provide } from '@fudic/di';

@Service
class Logger {
  log(m: string): void {
    console.log(m);
  }
}

@Service
class Cart {
  log = inject(Logger);
  lines: string[] = [];
}
```

In a `.fud` component you write `inject(Cart)` and `provide(Cart, () => new Cart())`; the
compiler rewrites both to their container-taking form. A component that declares a
provider owns that token for its whole subtree — a descendant that injects it gets the
ancestor's instance, not the global one.

## Reading it by hand

Outside a component, containers are explicit:

```ts
import { createRoot, createChild, injectFrom, destroy } from '@fudic/di';

const root = createRoot();
const panel = createChild(root, 'panel');

injectFrom(panel, Logger); // walks up to the root, where `@Service` lives
destroy(panel);
```

`inject()` with no container is legal in exactly one place: a field initializer or the
constructor of a service, which run inside the factory the injector is executing.
Anywhere else it throws.

## Tokens

A value that is not a class needs a token, and the token carries its type:

```ts
import { token } from '@fudic/di';

export const LOCALE = token<string>('locale');
```

Identity is the object, never the name: `token('x') !== token('x')`.

## What crosses the wire

Values, never instances. The server publishes a value under a token, the browser rebuilds
the service from it, and a value that is not published stays on the server.
