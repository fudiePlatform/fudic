# BUG-07 — Ningún HTML emitido pasa por minificación

> **Estado:** `Listo`
> **Corrige:** [SDD-19 — Plugin de Vite](../SDD-19-plugin-vite.md) §4.4
> **Paquete:** `@fudic/compiler` — la minificación es propia y vive en el emit (§4.1)
> **Rama sugerida:** worktree compartido `fix-build-output`
> **Depende de:** nada técnicamente. Va **después** de BUG-05 y BUG-06 porque paga mucho
> menos y arriesga mucho más.

---

## 1. Contexto y síntoma

Ninguno de los cinco `.html` del `dist` está minificado: indentación completa, saltos de
línea, y un `<script>` inline de 2,10 kB con comentarios y nombres largos.

```sh
pnpm build && head -12 examples/basic/dist/index.html
```

**Dónde están de verdad los bytes** (`dist/index.html`, 6,84 kB en total):

| región | tamaño | de eso, whitespace |
|---|---|---|
| `<script>` inline (el polyfill de adopción de estilos) | **2,10 kB — 31 % de la página** | 0,41 kB |
| `<style>` | 1,18 kB | 0,33 kB |
| markup | 3,57 kB | 0,58 kB |

**Y cuánto paga cada estrategia**, medido sobre ese mismo fichero:

| | raw | gzip |
|---|---|---|
| original | 6,86 kB | 2,42 kB |
| solo esqueleto (§4.2) | 6,52 kB | 2,38 kB |
| colapsar tiradas (§4.4) | 6,53 kB | **2,38 kB (−1,6 %)** |
| eliminar nodos (§4.5, descartada) | 6,46 kB | 2,37 kB (−2,0 %) |

Esa tabla es el argumento entero de este BUG: **la opción arriesgada paga 0,4 % más que la
segura**, porque gzip ya se come la indentación repetida. Lo que sí paga es el polyfill, que
es un tercio de cada página y hoy va tal cual.

---

## 2. Causa raíz

### 2.1. El HTML no entra en el pipeline de HTML de Vite

Se produce drenando el stream de render y se emite verbatim como asset:

- [`prerender.ts:85-92`](../../../packages/vite/src/prerender.ts#L85-L92) —
  `renderChunkToHtml` devuelve el string tal cual sale de `drain`.
- [`prerender.ts:141-144`](../../../packages/vite/src/prerender.ts#L141-L144) — igual para
  las rutas enumeradas por `paths()`.
- [`plugin.ts:524`](../../../packages/vite/src/plugin.ts#L524) y
  [`plugin.ts:532`](../../../packages/vite/src/plugin.ts#L532) —
  `this.emitFile({ type: 'asset', source: html })`.

Vite nunca ve estos ficheros **como HTML de entrada**: el `input` del build es
`{ 'fudic-main': MAIN_ID }` ([`plugin.ts:109`](../../../packages/vite/src/plugin.ts#L109)),
no hay ningún `.html` en él, y `appType: 'custom'`
([`plugin.ts:106`](../../../packages/vite/src/plugin.ts#L106)) confirma que el plugin se
hace cargo del documento. Así que no hay `transformIndexHtml` que valga: **no falta una
opción, falta la etapa entera**.

### 2.2. El whitespace nace en el emit del compilador

No es que alguien lo añada al final: se emite así desde el principio.

- [`module.ts:193`](../../../packages/compiler/src/emit/module.ts#L193) y
  [`layout.ts:151`](../../../packages/compiler/src/emit/layout.ts#L151) — el esqueleto del
  documento lleva `\n` literales.
- El markup del `<template>` se emite como **slices verbatim** del `.fud`, por diseño: es lo
  que conserva los anchors de origen para los source maps
  ([`module.ts:126`](../../../packages/compiler/src/emit/module.ts#L126)).
- [`module.ts:181`](../../../packages/compiler/src/emit/module.ts#L181) y
  [`layout.ts:245`](../../../packages/compiler/src/emit/layout.ts#L245) — el polyfill se
  incrusta como constante fuente desde
  [`polyfill.ts`](../../../packages/compiler/src/emit/polyfill.ts), 66 líneas legibles.

Ese último es deliberado y está bien argumentado —«es una constante fuente aquí solo para
que se pueda lintar y razonar por separado»—, pero de ahí no se sigue que tenga que
**emitirse** legible.

### 2.3. Alcance

- Los cinco `.html` de `examples/basic`, y cualquier ruta prerenderizada de cualquier
  proyecto.
- El polyfill viaja **una vez por página**, no una vez por sitio: gzip comprime cada fichero
  por separado, así que las cinco copias no se comparten nada.
- **El CSS de dentro no lo arregla este BUG**: se emite igual dentro de los chunks JS, donde
  un minificador de HTML no llega. Es [BUG-08](./BUG-08-css-verbatim.md).

---

## 3. Interfaz pública

Interna a `@fudic/compiler`. Ninguna dependencia nueva, y el contrato de salida del build
—nombres y número de ficheros— no cambia: solo cambian los bytes de dentro.

```ts
/** Un emisor de texto que colapsa whitespace salvo donde el modo lo prohíbe (§4.4). */
export type SpaceMode = 'collapse' | 'preserve';

/** Modo con el que se emite el contenido de un elemento, por su tag y su CSS. */
export function spaceModeOf(tag: string, style: StyleNode | null): SpaceMode;
```

El colapso ocurre **en el emit**, sobre el AST, no como pasada de texto sobre el HTML ya
generado. Lo emitido ya sale minificado; no hay segunda etapa que mantener.

---

## 4. Comportamiento corregido

### 4.1. La minificación es nuestra y va en el emit

Se minifica todo lo que emitimos —markup, el `<script>` inline y el esqueleto— con código
propio, por la misma razón por la que el parser HTML es propio: **en el emit se sabe lo que
un minificador de texto tiene que adivinar.** Un `html-minifier` recibe un string y
reconstruye a golpe de heurística qué es `<pre>`, qué es inline y qué es texto; aquí eso
está en el AST, ya parseado y ya validado.

Y hay una ventaja concreta que ninguna herramienta externa da (§4.5): un minificador de HTML
clásico decide inline/bloque con una **lista fija de tags**, y un custom element no está en
ninguna lista. Nosotros sabemos que un tag desconocido es un custom element y que su
`display` por defecto es `inline`, así que acertamos donde ellos fallan — y una página fudic
es casi toda custom elements.

**Alcance: todo lo emitido.** Markup, esqueleto, `<script>` inline y polyfill. El CSS va en
[BUG-08](./BUG-08-css-verbatim.md) por dónde vive —dentro de un template literal—, no porque
quede fuera del criterio: los dos BUG juntos son «todo lo que sale del compilador sale
minificado».

### 4.2. El esqueleto no necesita whitespace

Los `\n` literales de §2.2 y la indentación del `<head>` no renderizan en ningún contexto.
Se pueden quitar en el emit sin ninguna de las cautelas de §4.4. Es la parte gratis, y es
casi todo el hueco entre «original» y «colapsar» de la tabla de §1.

### 4.3. El polyfill se emite minificado

`STYLE_POLYFILL` sigue siendo una constante fuente legible —esa parte de
[`polyfill.ts`](../../../packages/compiler/src/emit/polyfill.ts) es correcta y se
conserva—, pero lo que se **incrusta** es su versión minificada, calculada en el build de
`@fudic/compiler`. Ningún cambio semántico: es el mismo IIFE.

Es 2,10 kB por página, no depende de §4.1 y no arriesga nada. **Si de este BUG solo se hace
una cosa, es esta.**

### 4.4. La técnica: colapsar a un espacio, con los modos que el AST ya conoce

El modelo de whitespace de CSS dice que, bajo `white-space: normal`, una tirada de espacios
y saltos **se colapsa a un único espacio que sí se renderiza**. Colapsar a un espacio es por
tanto *exactamente* lo que el navegador iba a hacer: render idéntico por construcción, no
por heurística.

Excepciones, que hay que respetar:

- `<pre>` y `<textarea>`, estructurales.
- Cualquier componente cuyo propio `<style>` declare `white-space: pre`, `pre-wrap`,
  `pre-line` o `break-spaces`. El compilador **puede verlo**: el CSS está en el mismo fichero
  y ya está parseado ([`css/nodes.ts`](../../../packages/compiler/src/css/nodes.ts)).
- El caso que no se puede deducir: `white-space` **se hereda y cruza el shadow boundary**, así
  que un ancestro puede cambiar el modelo de un componente compilado por separado. Para eso
  hace falta un atributo explícito y documentado, no una inferencia.

### 4.5. Un nodo de whitespace se colapsa; no se elimina

Es la única regla del BUG que **no** se copia de los minificadores clásicos, y hay que saber
por qué antes de tocarla. Ellos, con `collapseWhitespace` a secas, borran el nodo entero
cuando cae entre dos elementos de bloque, y deciden qué es bloque con una **lista fija de
tags**. Un custom element no está en esa lista y su `display` por defecto es `inline`: en una
página fudic esa heurística no falla en el caso raro, falla en el caso normal.

Borrar un nodo de solo-whitespace cambia tres cosas observables:

- **Slots.** Un nodo de texto solo-whitespace **cuenta como contenido asignado**. Al borrarlo,
  un `<slot>` que estaba ocupado pasa a mostrar su *fallback content*.
- **`:empty`.** Un elemento con un nodo de whitespace no es `:empty`. Al borrarlo lo es, y
  aplican reglas que antes no aplicaban.
- **Espaciado inline** entre dos componentes adyacentes, que desaparece.

Y no compensa: eliminar paga **0,4 % gzip** sobre colapsar (tabla de §1). Se colapsa a un
espacio, que es lo que el navegador iba a hacer de todas formas, y se cobra el 100 % del
beneficio con el 0 % del riesgo.

---

## 5. Invariantes

**Los que el bug violaba**

- *Toda salida del build honra la configuración del usuario.* El mismo de BUG-05 y BUG-06,
  por una vía distinta: aquí no es que se ignore una opción, es que no hay etapa donde
  aplicarla.

**Los que la corrección añade**

- **Una transformación de HTML es render-idéntica o no se hace.** Colapsar a un espacio lo es
  por el modelo de CSS; eliminar nodos no lo es, y por eso no se hace (§4.5).
- **Lo que el compilador emite como constante se emite minificado**, aunque el fuente sea
  legible (§4.3).

---

## 6. Criterios de aceptación

1. **(rojo primero)** El `<script>` inline del `dist/index.html` emitido no contiene
   comentarios ni la cadena `var registerStyle = function`. Su tamaño baja de 2,10 kB a menos
   de la mitad (§4.3).
2. El polyfill minificado **es funcionalmente el mismo**: los tests de SDD-18 sobre adopción
   de estilos pasan contra el emitido, no contra la constante fuente.
3. **(rojo primero)** El HTML emitido no contiene tiradas de más de un espacio consecutivo
   fuera de `<pre>`, `<textarea>`, `<script>` y `<style>` (§4.4).
4. Un componente con `white-space: pre` en su propio `<style>` conserva su whitespace
   íntegro (§4.4).
8. **Lighthouse deja de avisar.** La auditoría que hoy marca el HTML del ejemplo pasa a
   verde. Es el síntoma que originó el BUG y ningún test unitario lo cubre.
5. **Ningún nodo de texto desaparece.** Contar nodos de texto del DOM antes y después: la
   cifra es la misma. Es el criterio que blinda §4.5.
6. **Extremo a extremo:** los 16 tests de `examples/basic/tests/` siguen en verde, y una
   comparación del DOM renderizado (`document.body.innerHTML` normalizado) entre el build
   anterior y el nuevo no muestra diferencias.
7. El tamaño de cada `.html` queda anotado en el registro de progreso, raw y gzip, antes y
   después. Sin medición este BUG no se cierra: es lo único que justifica lo que se hizo y
   lo que no.

---

## 7. Fuera de alcance

- **Eliminar nodos de whitespace** (§4.5). Descartado con datos: paga 0,4 % y rompe slots,
  `:empty` y el espaciado entre custom elements.
- **Minificar el CSS**, ni en el HTML ni en los chunks: [BUG-08](./BUG-08-css-verbatim.md).
- **Cambiar cómo el emit ancla los slices verbatim** (§2.2). Esos anchors son los source maps
  de SDD-13; se colapsa el texto emitido, no se cambia la forma de emitirlo.
- **Minificar el HTML que sirve el Service Worker en runtime.** El SW sirve lo que hay en
  caché; si el fichero está minificado, ya lo está.
- **Comprimir con brotli/gzip en build.** Es del servidor, y otra conversación.
