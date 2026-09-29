# BUG-45 · Un componente que nace en el navegador no adopta sus hojas, y un `@if` en el hueco de una ruta no arranca

> **Estado:** `Hecho` — arreglado, probado a mano por Pedro en el navegador y con sus tests (ver
> [BUG-45-Task.md](./BUG-45-Task.md)). Redactado y cerrado el 2026-09-29.
> **Corrige:** [SDD-18](../SDD-18-estilos-compartidos.md) (D-6: `data-fud-adopt` solo lo leía el
> polyfill) · [SDD-15](../SDD-15-emit.md) §3.7 (`FudicElement.c`) ·
> [SDD-39](../SDD-39-rutas-reactivas.md) §4.3 (el recorrido del layout en el chunk de la ruta)
> **Paquetes:** `@fudic/core` · `@fudic/compiler` · `examples/basic`
> **Rango:** ninguno — no hay diagnóstico nuevo.

---

## 1. Síntoma

En `examples/basic`, ruta `/vivo`:

1. `<vivo-lista>` pinta cada elemento de un `@foreach` con `<vivo-item>`. El que pinta el
   servidor sale con su estilo. Los que nacen al pulsar **Añadir** salen **sin estilo**, aunque
   llevan `data-fud-adopt="_theme vivo-item"` y la hoja `vivo-item` está en el `<head>` como
   `<style type="module" specifier="vivo-item">`.
2. Pasa en cualquier construcción de control (`@if`, `@foreach`, `@for`, `@while`, `@switch`):
   todo componente que se crea después de la carga inicial.

Y al montar la evidencia de un `@if` con un componente en cada rama, directamente en la ruta:

3. **Cambiar de rama** no hacía nada, y la consola daba
   `ReferenceError: $lp0 is not defined` en el `h` de la ruta. El arranque de la ruta se cortaba
   ahí.

## 2. Causa raíz

- **§2.1. Nadie adopta las hojas de un host fabricado.** Un host que pinta el servidor recibe las
  hojas por el `shadowrootadoptedstylesheets` de su `<template>`: las adopta el parser, o el
  polyfill inline antes de `DOMContentLoaded`. Un host que fabrica el runtime pasa por
  `FudicElement.c()` (`core/src/element.ts`), que abre la sombra con `attachShadow`. Eso no adopta
  nada, y ningún código del runtime asignaba `adoptedStyleSheets`.
- **§2.2. El polyfill no lo cubre, y no debe cubrirlo.** Si el navegador tiene la adopción nativa,
  el polyfill no llega a ejecutarse, y la nativa solo actúa sobre la `<template>` declarativa. Si
  no la tiene, el polyfill desconecta su observador en `DOMContentLoaded`. Además, el polyfill es
  código que desaparecerá el día que los navegadores lo implementen: el runtime no puede
  apoyarse en él.
- **§2.3. El nodo del layout vivía en el ámbito equivocado.** En el chunk de una ruta,
  `ComposeWalker` (`compiler/src/emit/route-client.ts`) escribía `const $lpN = $lcK;` **dentro
  de `h`**. El selector de ramas de un constructo, en cambio, vive a nivel de closure, junto a los
  bloques. Un `@if` escrito directamente en un hueco tiene ese nodo del layout como padre, así
  que su selector nombraba algo que no existía en su ámbito. En `ruta-reactiva.fud` no se veía
  porque allí el `@if` va dentro de un `<div>` de la propia ruta, que ya se declaraba a nivel de
  closure.

## 3. Qué cambia

### 3.1. El puente de adopción — `core`

Un módulo nuevo y aislado, `core/src/adopt-sheets.ts`, con una sola función:
`adoptSheets(host, shadow)`.

- Lee los especificadores de `data-fud-adopt`. Es la misma lista que el servidor escribe en la
  plantilla, con la guía del proyecto (`_theme`) delante.
- Por cada uno busca en el documento el `<style type="module" specifier>` que le corresponde. El
  especificador se **compara**, no se interpola en un selector. Construye la hoja con
  `new CSSStyleSheet()` + `replaceSync(textContent)`.
- Cada hoja se construye **una vez por especificador** y se comparte entre instancias. Un
  especificador sin `<style>` en el documento se salta y no se memoriza, por si llega después.
- Añade las hojas a `shadow.adoptedStyleSheets`, en el orden de la lista.

`FudicElement.c()` abre la sombra y llama a `adoptSheets(this, shadow)` antes de fabricar. Es la
única llamada. `FudicControlElement` hereda el arreglo porque pasa por `super.c()`.

**No lee el mapa del polyfill.** Por decisión de Pedro, el arreglo se escribe pensando en lo que
viene y no en lo que hay. El día que la plataforma pueda abrir una sombra que adopte por
especificador, se borran el fichero y su única llamada, y nada más cambia. No se usa
`setHTMLUnsafe`: se tuvo en cuenta como la forma futura, no como la de ahora.

### 3.2. Los nodos del layout, a nivel de closure — `compiler`

`ComposeWalker` recoge los nodos `$lpN` que marca con `enter` en `nodes`, y en `h` solo los
asigna. `buildRouteClientModule` los declara en el mismo `let` que los nodos de la ruta y los
libera en `r`, igual que a ellos.

### 3.3. La evidencia — `examples/basic`

- `routes/vivo.fud` gana un botón **Cambiar de rama** y un `@if` directamente en el hueco. La
  rama verdadera pinta `<vivo-item>` y la falsa `<vivo-otro>`.
- `components/vivo-otro.fud` es nuevo, con un estilo que no se puede confundir con el otro: borde
  rojo discontinuo y fondo rosa.

## 4. Fuera de alcance

- Quitar el polyfill o cambiar la forma en que el servidor escribe la adopción.
- Abrir la sombra con `setHTMLUnsafe` y una `<template>` declarativa.
- Una hoja que llegue al documento después de crearse un host. El puente no la memoriza como
  ausente, pero tampoco vuelve sobre los hosts ya creados.

## 5. Criterios de aceptación

1. Un `FudicElement` creado con `c()` cuyo host lleva `data-fud-adopt="_theme x-a"` adopta, en ese
   orden, las hojas construidas a partir de los `<style type="module" specifier>` del documento
   (`core/test/adopt-sheets.test.ts`, `element.test.ts`).
2. Dos instancias del mismo tag comparten el mismo objeto `CSSStyleSheet`.
3. Un host sin `data-fud-adopt`, o con un especificador que no está en el documento, no falla.
   Adopta solo lo que encuentra y no modifica nada más.
4. Un especificador que no estaba y aparece después se encuentra en la siguiente creación.
5. El chunk de una ruta con un `@if` directamente en un hueco del layout declara el nodo del
   layout a nivel de closure. El selector de ramas lo usa, y `r` lo libera
   (`compiler/test/emit/route-client.test.ts`).
6. Los dos tests de `route-client.test.ts` que comprobaban `const $lp0 = $lc0;` cambian de
   expectativa, no de código.
7. `pnpm typecheck`, `pnpm test` y `pnpm build` en verde. `@fudic/core` al 100 % en las cuatro
   métricas y `@fudic/compiler` sin bajar de su suelo.
8. En el navegador, en `/vivo`: los elementos que añade **Añadir** y los componentes que entran
   al **cambiar de rama** llegan con su estilo. Lo probó Pedro, y lo comprueba el e2e
   `examples/basic/tests/vivo.spec.ts`.
