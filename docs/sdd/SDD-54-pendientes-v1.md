# SDD-54 — Lo que quedaba de v1: `ref`, `@raw` y el spread de props

> **Estado:** `Hecho` — [tareas](./SDD-54-Task.md), 22 / 22.
> **Paquetes:** `@fudic/compiler` · `@fudic/dom` · `@fudic/ssr` · `@fudic/language-core` ·
> `@fudic/language-server` · `fudic-vscode` · `@fudic/diagnostics` · `examples/basic`
> **Depende de:** 07 (bindings), 12 (semántica), 14 (`Dom<N>`), 15 (emit), 23 (proyección TS),
> 30 (bloques), 50 (diagnósticos), 51 (la vista)
> **Rango de diagnósticos:** `FUD0990`–`FUD0999` (nuevo). Usados `FUD0990`–`FUD0992`.
> **Decisiones:** 154 y 155 (nuevas), 146–149 (el spread, renumeradas desde 79–82), 152 derogada.
>
> **Por qué esta spec se escribió al final.** Los cuatro puntos de
> [PENDIENTES-v1](./pendings/PENDIENTES-v1.md) ya estaban especificados en la gramática y en
> [props-spec](./props-spec.md). Por decisión de Pedro se implementaron primero, con evidencia en
> `examples/basic` y su OK en el navegador, y esta spec registra lo que quedó, incluidas las
> decisiones que se tomaron durante la implementación.

---

## 1. Contexto y objetivo

Al cerrar SDD-17 quedaban cuatro piezas de gramática que el parser reconocía y el emit no:

| Pieza | Antes | Ahora |
|---|---|---|
| `ref="@var"` (decisiones 30, 31) | se parseaba y validaba; la variable quedaba `undefined` | el nodo llega a la variable al crear e hidratar y vuelve a `null` al desmontar (155) |
| `@raw(expr)` (decisión 18) | todo se escapaba; el emit no tenía consumidor | pinta HTML marcado con `trustedHtml()`, siendo el único contenido de su elemento (154) |
| Spread de props (props-spec §5) | cero código | `<app-card ...item>`, sin llaves, en servidor, cliente y editor (146–149) |
| `bind:` (props-spec §6) | cero código | **anulado**: la decisión 153 ya pasa callbacks y signals por referencia |

## 2. Dependencias

- **SDD-07.** `classifyAttribute` despacha el binding nuevo `spread`; `RefBinding` ya existía.
- **SDD-12.** El runner de analizadores, donde entran `raw-only-child` y `spread-target`.
- **SDD-14.** El contrato `Dom<N>`, que gana `setHtml`.
- **SDD-15 y SDD-30.** El factory (`c`, `h`, `u`, `r`, `$s`, `$a`, `$w`) y los bloques con sus
  parámetros.
- **SDD-23.** La proyección TS, que comprueba `@raw` y el spread.
- **SDD-50.** El catálogo de códigos.
- **SDD-51.** El análisis de la vista (`FUD0907`), que deja de leer el valor de un `ref`.

## 3. Interfaz pública

```ts
// @fudic/dom
export interface TrustedHTML { readonly fudicTrustedHtml: string; toString(): string }
export function trustedHtml(html: string): TrustedHTML;
export function isTrustedHtml(value: unknown): value is TrustedHTML;
export function htmlOf(value: unknown): string; // marcado → HTML; lo demás → texto escapado; null/undefined → ''

interface Dom<N> {
  /** Sustituye el contenido de `el` por `htmlOf(value)`. Navegador: innerHTML. SSR: un nodo verbatim. */
  setHtml(el: N, value: unknown): void;
}

// @fudic/compiler
export const SPREAD_PREFIX = '...';
export interface SpreadBinding extends Node { readonly type: 'spread'; readonly expr: Span | null }
export function spreadExpr(attr: Attribute): Span | null;
export type PropTarget = ((name: string) => ComponentDeclaredProps | undefined) & {
  readonly all: readonly ComponentDeclaredProps[];
};
```

Proyección del editor (`language-core`, en los globals):

```ts
declare function $raw(v: $TrustedHTML | null | undefined): void;
declare function $spread<T>(o: T): void; // T = Omit<props del hijo, las escritas a mano>
```

Códigos: `FUD0990` (`@raw` no es el único contenido), `FUD0991` (spread mal formado),
`FUD0992` (spread sobre algo que no es un componente).

## 4. Comportamiento

### 4.1 `ref` (decisión 155)

- El emit cliente escribe `nombre = $nX;` en `$s` y `$d.push(() => { nombre = null; })`. `$s`
  corre en `c` y en `h`; `$d` lo vacía `r`.
- Dentro de un `@if`/`@switch` lo hace el bloque con su `$s` y su `$d`. `refTargets` saca los
  nombres de `ref` de las dependencias del bloque, que se pasan por valor.
- Un `ref` mal formado (`FUD0094`) no emite nada. El servidor no emite nada para `ref`.
- `view-scope` no registra el valor de un `ref` como lectura de la vista.

### 4.2 `@raw` (decisión 154)

- `rawChild(el)` es la regla única: el `@raw` que es el único contenido de `el`, ignorando
  texto en blanco y comentarios Razor; nunca un `<template>`. La usan el servidor, el cliente y
  el analizador.
- Servidor: `$dom.setHtml(v, (expr))` en lugar de los hijos, también en el light DOM de un host.
- Cliente: un value write con guarda `$w`. `c` lo pinta en `$a`; `h` no entra en el elemento y
  siembra `$w[slot]` con el valor, para que la primera actualización no reconstruya el HTML; un
  update reescribe solo el contenido.
- Fuera de esa forma, `FUD0990`.
- Editor: `$raw(expr)`, y un `string` sin marcar es `TS2345`.

### 4.3 Spread (decisiones 146–149)

- `...objeto`: un nombre o camino de nombres, sin valor. Si no, `FUD0991` con `expr: null`.
  Sobre un elemento nativo o el propio host, `FUD0992`. *SDD-55 lo precisa: sobre un nativo el
  spread escribe atributos (157), y `FUD0992` queda para el host propio y su plantilla.*
- `spreadProps` expande contra `PropTarget.all` y excluye lo que escriben `.prop`/`control`. Con
  varios spreads gana el último cuyo valor no sea `undefined`. Sin contrato legible, nada.
- Servidor: las entradas del spread van delante en el literal de props. Cliente: un slot por
  clave en el payload denso del hijo.
- `spreadReadsMoving`: si el objeto lee algo que se mueve, el hijo hidrata (`level.ts`) y se le
  renueva en la pasada de update.
- Editor: `$spread<Omit<$C, 'explícitas'>>(objeto)`, sin `$required` cuando hay spread; `...`
  vacío deja un anchor de completado. Semantic tokens: solo los `...`. TextMate:
  `keyword.operator.spread.fudic` y `variable.other.readwrite.binding.spread.fudic`.

### 4.4 Arreglo encontrado por el camino: la fila que cambia de datos

En un `@foreach` con `key`, una fila que conservaba su clave y cambiaba de datos no volvía a dar
props a su hijo; pasaba igual con `.prop="@item.x"`. Un slot que solo lee parámetros del bloque
se marca `row`, y el `u` del bloque calcula
`const $moved = [params].some(($x, $i) => $x !== $p[$i]);` antes de reasignarlos y emite
`if ($moved) $nX.u([, , …])`. Una fila que no cambió no da un segundo payload encima del de sus
signals.

### 4.5 `bind:` anulado

`bind:` no se implementa. La decisión 152 queda derogada y la 150 sigue en pie sin azúcar: una
prop callback se escribe a mano y cruza por referencia (153). Ver props-spec §6.

## 5. Invariantes LSP

- `SpreadBinding.expr` es un span del nombre del atributo; `null` cuando está mal formado, y el
  binding se conserva para el editor.
- Ningún analizador lanza: `raw-only-child` y `spread-target` son funciones totales sobre el
  árbol.
- Servidor y cliente deciden con la misma función (`rawChild`, `spreadProps`, `htmlOf`): no
  pueden pintar árboles distintos.

## 6. Criterios de aceptación

1. `ref`: con `c` y con `h` la variable apunta al nodo; `r()` la anula; dentro de `@if` se anula
   al quitar el bloque y apunta al nodo nuevo al volver.
2. `ref` mal formado no emite nada, y un `let` de `@client` en un `ref` no da `FUD0907`.
3. `htmlOf`: marcado → HTML, sin marca → escapado, `null` → `''`; `setHtml` igual en navegador
   y en SSR, sustituyendo los hijos.
4. `@raw` como único contenido: servidor y `c` pintan lo mismo; `h` no entra; una signal
   reescribe solo ese contenido; una actualización que no lo toca deja sus nodos.
5. Cada forma inválida de `@raw` es `FUD0990`.
6. El editor da `TS2345` a un `@raw` con `string` y acepta lo marcado y `null`.
7. Spread: clasificación válida y cada forma de `FUD0991`; `FUD0992` en nativo, SVG y host propio.
8. `spreadProps`: claves y orden del hijo, explícitas ganan, el último spread gana, nada sin
   contrato.
9. Servidor sin claves de más; `$live` denso; nivel de hidratación según el objeto.
10. Fila con la misma key y datos nuevos: `u` al hijo; mismo objeto: nada.
11. Proyección del spread: completo con extras, 0 errores; falta opcional, 0; falta requerida o
    tipo erróneo, `TS2345` sobre el objeto; la explícita no se pide al objeto; anchor de `...`.
12. Semantic tokens y gramática TextMate del spread.
13. E2E en `examples/basic`: `/ref`, `/raw` y `/spread`, hidratadas desde el servidor y llegando
    por enlace.
14. `pnpm typecheck`, `pnpm test` y `pnpm build` en verde; lo nuevo al 100 % en las cuatro
    métricas, y `@fudic/language-core`, `@fudic/dom` y `@fudic/ssr` al 100 %.

## 7. Fuera de alcance

- `@raw` mezclado con otro contenido mediante dos comentarios marcadores (154, nota).
- `ref` dentro de un bucle (decisión 31 sigue siendo error).
- La formalización EBNF de `props<T>()` y del spread (props-spec §7).
- Un `bind:` en cualquier forma.
