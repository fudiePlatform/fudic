# SDD-55 — El resto de props y el spread de atributos en elementos nativos

> **Estado:** `Hecho` — [tareas](./SDD-55-Task.md), 14 / 14. Pendiente del OK de Pedro en el navegador.
> **Paquetes:** `@fudic/compiler` · `@fudic/dom` · `@fudic/ssr` · `@fudic/language-core` ·
> `@fudic/diagnostics` · `examples/basic`
> **Depende de:** 07 (bindings), 12 (semántica), 14 (`Dom<N>`), 15 (emit), 23 (proyección TS),
> 51 (la vista y el guardia de URL), 54 (el spread de props)
> **Rango de diagnósticos:** ninguno nuevo. `FUD0992` (de SDD-54) cambia de alcance.
> **Decisiones:** 156 y 157 (nuevas, en [props-spec](./props-spec.md)); precisa la 146.
>
> **Por qué esta spec se escribió al final.** Para Pedro las dos piezas eran una carencia del
> framework, no una funcionalidad nueva: `const { a, ...resto } = props<T>()` es JavaScript que un
> autor escribe sin pensarlo, y `<input ...resto>` es lo que hace con ese resto. Como en SDD-54,
> se implementaron primero, con evidencia en `examples/basic`, y esta spec registra lo que quedó.

---

## 1. Contexto y objetivo

| Pieza | Antes | Ahora |
|---|---|---|
| `const { label, ...resto } = props<T>()` | el resto no recibía nada: ninguna clave de `T` llegaba a él | cada clave de `T` no nombrada es una prop con su hueco en el payload, y el componente las lee juntas en `resto`, en servidor y cliente (156) |
| `<input ...resto>` | `FUD0992`: un spread solo iba en un componente | escribe como atributos los escalares del objeto, igual en servidor y navegador, y quita los que dejan de estar (157) |

## 2. Dependencias

- **SDD-07.** El binding `spread` y `spreadExpr`, que ya existían (SDD-54).
- **SDD-12.** El analizador `spread-target`, que cambia de alcance.
- **SDD-14.** El contrato `Dom<N>`, que gana `setAttrs`.
- **SDD-15.** El factory (`c`, `h`, `u`, `$a`, `$w`), la declaración posicional de props y sus
  guardas de update.
- **SDD-23.** La proyección TS, que comprueba el objeto de un spread nativo.
- **SDD-51.** `guardUrl`/`safeUrl` y la regla de los `on*` (decisiones 139 y 140).
- **SDD-54.** `SpreadBinding`, `FUD0991`, `FUD0992` y la expansión de props (146–149).

## 3. Interfaz pública

```ts
// @fudic/dom
export function attrsOf(tag: string, objects: readonly unknown[], except: readonly string[]): ReadonlyMap<string, string>;
export interface AttrsDiff {
  readonly set: readonly (readonly [name: string, value: string])[];
  readonly remove: readonly string[];
}
export function attrsDiff(
  tag: string,
  next: readonly unknown[],
  prev: readonly unknown[] | undefined,
  except: readonly string[],
): AttrsDiff;

interface Dom<N> {
  /** Aplica attrsDiff(tag de el, next, prev, except). Navegador y SSR. */
  setAttrs(el: N, next: readonly unknown[], prev: readonly unknown[] | undefined, except: readonly string[]): void;
}

// @fudic/compiler (interno al emit)
interface Prop { readonly rest?: string } // la variable de resto que reúne esta clave
interface ValueSink { diff(expr: string, write: (value: string, prev: string) => string): void }
```

Proyección del editor (`language-core`, en los globals):

```ts
declare function $spreadAttrs(o: object | null | undefined): void;
```

`FUD0992`: un spread sobre el **propio host** del componente o sobre su
`<template shadowrootmode>`. Ya no sobre un elemento nativo ni SVG.

## 4. Comportamiento

### 4.1 El resto de props (decisión 156)

- `readRest` (`oxc-code.ts`) añade un `Prop` por cada clave de `T` que el patrón no nombra, en
  el orden de `T` y **detrás** de las nombradas, marcado con `rest: 'resto'`. Hereda de `T` si es
  opcional, su tipo y su canal (`Signal<T>`, función). Solo cuando `T` es legible: un literal, o un
  `type`/`interface` del mismo `@code`. Con `T` ilegible, con un resto que no es un identificador
  o con todas las claves nombradas, no añade nada.
- Para quien pasa las props, una clave reunida es una prop más: tiene su hueco y el padre la
  escribe con `.`. Lo que no tiene es nombre en el código del autor.
- **Servidor.** El patrón conserva `...resto`, también en un layout, y el slice del state escribe
  `resto.clave` en su posición.
- **Cliente.** Cada clave reunida llega a un local oculto `$o_<clave>` (`localOf`); la
  declaración monta `let resto = { … }` con ellos, y el update lo reconstruye **después** de las
  guardas (`restAssignments`). Los nombres que el código lee (`propNames`) son las props
  nombradas más cada resto, nunca las claves reunidas.
- Una clave reunida `Signal<T>` se suscribe por su local `$o_`, que guarda el mismo objeto que la
  plantilla lee como `resto.v()`.
- `level.ts` (`movingNames`) mueve el nombre del resto; `scopeOf` (`state.ts`) y
  `crossingNames` (`registry.ts`) no cuentan las claves reunidas: nadie las reenvía por nombre.

### 4.2 El spread de atributos en un elemento nativo (decisión 157)

- **Qué se escribe** (`attrsOf`, una función pura para todos los adaptadores): por cada clave
  propia de cada objeto, en orden. `string`, `number` y `bigint` → su texto; `true` → `''`;
  `false`, `null` y `undefined` → no se escribe; un objeto, una función o un `symbol` → no se
  escribe, salvo un `trustedUrl(…)` en un atributo URL.
- **Qué nunca se escribe:** un nombre que no case `^[A-Za-z_][\w.:-]*$` y un `on*` (sin
  distinguir mayúsculas). Los atributos URL —la misma lista que `isUrlAttr` del compilador— pasan
  por `guardUrl`.
- **Precedencia:** lo que el elemento escribe a mano gana su nombre esté donde esté el spread
  (`except`: los atributos planos y `class` si hay `class:`), sin distinguir mayúsculas. Con dos
  spreads gana el posterior en las claves que **escribe**.
- **Servidor:** `$dom.setAttrs(v, [(obj)…], undefined, except)` al final de los atributos del
  elemento (`writeSpreadAttrs`).
- **Cliente:** un value write en `$a` con la guarda `$w`, que además guarda en `$o` lo que el slot
  tenía: `$dom.setAttrs(v, $v, $o, except)`. `attrsDiff` pone solo los atributos cuyo texto cambió
  y quita los que los objetos anteriores escribían y los nuevos no. `h` no escribe nada, pero
  siembra `$w[slot]` con los objetos, para que la primera actualización sepa qué atributos son del
  spread.
- En un componente, `...` sigue siendo el spread de props de SDD-54 y no escribe atributos.
- **Editor:** `$spreadAttrs(objeto)` con el objeto copiado del fuente; un `...` vacío deja un
  anchor de completado, como en un componente.

## 5. Invariantes LSP

- Servidor y navegador escriben los atributos con la misma función (`attrsDiff`): no pueden
  pintar atributos distintos.
- `spread-target` es una función total: mira el host y su plantilla, y nada más.
- Un `Prop` con `rest` lleva el span del `...resto` del patrón.

## 6. Criterios de aceptación

1. `readRest`: orden de `T` detrás de las nombradas; opcional, tipo y canal heredados; literal,
   alias e interface; `T` ilegible, resto no identificador o todas nombradas → nada.
2. `localOf`, `restGroups` y `restAssignments` (con y sin `let`), al 100 %.
3. El servidor conserva `...resto` (también en un layout) y el SSR pinta sus valores.
4. Cliente: `c` pinta lo mismo que el servidor; tras `h`, cambiar una clave reunida actualiza la
   vista y una nombrada no se toca; `r` sin errores.
5. Una clave reunida `Signal<T>` repinta cuando el padre la cambia.
6. Nivel: un hijo alimentado por `resto.x` hidrata; las claves reunidas no son nombres de cruce.
7. Editor con `...resto`: sin diagnósticos, sin `FUD0907` en `@resto.x`, y una requerida reunida
   que falta es `TS2345` en el padre.
8. `attrsOf`/`attrsDiff` al 100 %: cada tipo de valor, nombres inválidos y `on*`, URL guardada y
   `trustedUrl`, `except` sin mayúsculas, dos objetos, diff con y sin `prev`.
9. `setAttrs` en navegador y SSR aplica el diff.
10. Emit nativo: servidor y `c` pintan lo mismo; tras `h`, poner una clave a `false` **quita** el
    atributo que pintó el servidor; un atributo explícito gana aunque el spread vaya antes;
    dentro de `@if`/`@foreach`.
11. `FUD0992` solo en el host propio y en su `<template shadowrootmode>`; nativos y SVG, no.
12. Editor: `<input ...resto>` sin diagnósticos; un número como objeto es error de TS; anchor de `...`.
13. E2E en `examples/basic`, `/resto`: el input lleva `placeholder`, `required` y `maxlength="20"`;
    «Cambiar las props» cambia la pista y quita `required`; otra vez, lo repone.
14. `pnpm typecheck`, `pnpm test` y `pnpm build` en verde; lo nuevo al 100 % en las cuatro
    métricas, y los paquetes que estaban al 100 % siguen así.

## 7. Fuera de alcance

- Un resto con `T` que este fichero no puede leer (importado de otro módulo).
- Un spread de atributos con llaves o con una expresión (`...{a: 1}`, `...f()`): lo que sigue a
  `...` sigue siendo un nombre o un camino de nombres (146).
- Spread de eventos: un `on*` nunca se escribe, y un `@evento` no sale de un objeto.
- Spread sobre el propio host del componente (`FUD0992`).
