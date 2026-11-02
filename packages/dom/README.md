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
