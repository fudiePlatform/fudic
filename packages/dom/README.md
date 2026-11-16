# @fudic/dom

The isomorphic node contract of the fudic runtime (SDD-14).

- **`Dom<N>`** — the construction surface (`element`, `text`, `comment`, `setAttr`,
  `removeAttr`, `append`, `before`, `remove`, `attachShadow`). Both the browser and the SSR
  adapter implement it in full.
- **`DomClient<N>`** — extends `Dom<N>` with the browser-only surface: reactive mutation
  (`setText`, `setProp`) and hydration traversal (`firstChild`, `nextSibling`, `previousSibling`,
  `childAt`, `firstElementChild`, `nextElementSibling`, `lastChild`). The SSR adapter does not
  implement it — the impossibility of hydrating in SSR is a property of the type, not a runtime
  throw (ISP/LSP).

  The element-only pair is what the emitted hydration actually walks with. A tree that goes
  through HTML and back does not preserve text-node boundaries — two adjacent text nodes
  serialize with nothing between them and the parser returns one — so a cursor that counts
  every node drifts. Elements survive the round trip one for one; text is reached from the
  element beside it (`previousSibling`), or from the end of its level (`lastChild`).
- **`browserDom`** — the client adapter over the native DOM.
- **`Cursor` / `cursorOf`** — the hydration walk over an existing subtree.
- **`NS` / `Ns`** — HTML / SVG / MathML namespaces, resolved once at element creation.
- **`escapeText` / `escapeAttr`** — the HTML escape of the server, here so the compiler writes
  templates with the same function (`@fudic/ssr` re-exports them).

## Templates

`template` and `templateIn` (SDD-85) are how a component or a block is created in the browser:
the compiler writes the HTML of the empty view as a tagged literal, and the controller clones it
and adopts the clone with the same walk that adopts what the server painted.

```ts
const $T0 = template`<ul class="list"></ul>`;
shadow.append($T0()); // a fresh copy each call, owned by the page's document
```

- Only a literal with no holes: anything else is a `TypeError`. A `TemplateStringsArray` comes
  from source code, never from data, so `template` is not a way in for foreign HTML.
- Lazy: nothing is parsed until the first call. The HTML goes through the one `fudic` Trusted
  Types policy (`trusted-types fudic` in the CSP), and a page that creates nothing never asks
  for it.
- `templateIn` is for a piece that lives inside `<svg>` or `<math>`: the literal carries the
  wrapper so the nodes are born in the right namespace, and the copy comes without it.

## Classes

`toggleClass(el, token, on)` and `swapClass(el, next, prev)` are on `Dom<N>`, in both adapters.
`class:x=@cond` writes with the first, `class=@expr` and the `class` of a spread with the second.
Both touch only their own tokens, so a class some other code added (a `ref`, a library, an
animation) survives every change. `swapClass` reads its values with `classText`: a string, a
number or a bigint is its text, anything else puts no token. On the server the class list is the
`class` attribute itself: static tokens first, then `class=@expr`, then the active `class:` in
source order, and no attribute at all when there are no tokens.

## The bus

`emit(name, detail)` announces on the page; `bus:name=@handler` receives it, with the host as
`this` and the detail as its argument:

```html
@* product-list.fud *@
function add(price: number) { emit("cart", price); }

@* shopping-cart.fud *@
function onCart(price: number) { total.set(total() + price); }
<p bus:cart=@onCart>
```

The receiver's parameter is the contract. `emit("cart", x)` must send what every receiver of
`"cart"` declares, so `emit("cart", "5")` is underlined in the sender. A name nobody receives
takes anything, and the detail is optional when every receiver admits `undefined`. Only a
handler declared at the top level of the `@code` and bound by reference counts; a lambda gets
the type the others declare, and `bus:(NAME)` is untyped. A name only a library listens to can
be registered by hand:

```ts
declare global {
  interface FudicBusReceivers {
    'my-lib#0': readonly ['cart', number];
  }
}
```

A call keeps the event: `bus:cart=@log($event)`.

The SSR adapter lives in `@fudic/ssr`; the reactive runtime (signal, lifecycle, event
delegation, `<style host>`) lives in `@fudic/core`.
