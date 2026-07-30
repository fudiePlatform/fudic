# BUG-08 — El CSS de componente nunca se minifica, en ninguna salida

> **Estado:** `Listo`
> **Corrige:** [SDD-15 — Emit](../SDD-15-emit.md) y
> [SDD-09 — CSS con Razor](../SDD-09-css-razor.md), en el punto donde el emit toma el CSS
> **Paquete:** `@fudic/compiler`
> **Rama sugerida:** worktree compartido `fix-build-output`
> **Depende de:** nada. Es el único de los cuatro que no toca `@fudic/vite`, así que puede
> ir en paralelo en su propio worktree si conviene.

---

## 1. Contexto y síntoma

El CSS de un componente viaja con su indentación y sus saltos de línea intactos **en las
tres salidas**, incluidas las que sí están minificadas:

```sh
pnpm build && head -c 300 examples/basic/dist/assets/app-badge-D2G0YOWS.js
#=> var e=`app-badge`,t=`
#=>     :host { display: inline-block; }
#=>     .badge {
#=>       font-size: 0.72rem;
```

El JavaScript está minificado —`var e=`, `t=`— y el CSS de al lado no. No es un descuido del
minificador: **un minificador de JS no entra en el contenido de un template literal**, por
definición del lenguaje. Es la razón de que este defecto no lo arregle ningún otro BUG de
esta tanda.

Alcanza a:

- los chunks de cliente (`dist/assets/*.js`), minificados;
- los chunks enlazables (`dist/sw/c/*.js`), que [BUG-06](./BUG-06-minify-no-heredado.md) va a
  minificar y que seguirán llevando el CSS igual;
- el HTML prerenderizado, donde el `<style>` es **1,18 kB de los 6,84 kB** de
  `dist/index.html` (0,33 kB de ellos, whitespace puro).

---

## 2. Causa raíz

### 2.1. El emit toma el CSS como una tira de texto, no como lo que ya parseó

- [`module.ts:87-93`](../../../packages/compiler/src/emit/module.ts#L87-L93) —
  `componentCss` hace `source.slice(style.openSpan.end, …)`: **texto crudo del fichero
  fuente**.
- [`module.ts:107`](../../../packages/compiler/src/emit/module.ts#L107) — ese string pasa por
  `linker.cssTemplate(...)`, que reescribe los `url(…)` y lo envuelve en backticks.
- [`module.ts:115`](../../../packages/compiler/src/emit/module.ts#L115) —
  `export const css = \`…\`;`, y ahí muere: a partir de este punto es contenido de un
  literal y ninguna herramienta posterior lo va a tocar.

### 2.2. Lo llamativo: el AST está hecho y no se usa

El compilador **ya parsea** ese CSS, y lo parsea con la forma exacta que hace falta:

- [`css/nodes.ts`](../../../packages/compiler/src/css/nodes.ts) —
  `StyleNode.parts: readonly CssPart[]`, con
  `CssPart = CssText | RazorExpression | AtEscapeNode | RazorCommentNode`.
- Y la propiedad que lo vuelve trivial, documentada en el propio tipo: los `parts`
  **«tapizan el span sin huecos y sin solapes»**.

Un tapizado completo sin huecos es justo lo que necesita un minificador conservador:
recorrer las partes, compactar solo las de tipo `css-text`, y dejar intactas las demás. No
hay que escribir un parser de CSS — hay que dejar de ignorar el que ya existe.

`componentCss` fue escrito antes o al margen de ese AST, y se quedó en el `slice`.

### 2.3. Alcance

- **Todos los componentes**, no solo los del ejemplo: es el camino único del emit.
- **El CSS de layout y de página**, que pasa por el mismo sitio.
- **No lo arregla BUG-06** (minificador de JS, no entra en el literal) **ni BUG-07** (un
  minificador de HTML alcanzaría el `<style>` del documento, pero no la copia que viaja
  dentro de los chunks JS, que es la que se descarga en cada navegación).

---

## 3. Interfaz pública

### 3.1. `componentCss` deja de devolver un slice

Pasa a construirse desde el `StyleNode` ya parseado:

```ts
/** El cuerpo del `<style>` del componente, compactado, con las interpolaciones intactas. */
function componentCss(source: string, doc: ComponentDocument): string;
```

La firma no cambia; cambia de dónde saca el texto. El cambio real es interno y verificable
por sus tests.

### 3.2. Sin cambios

- `linker.cssTemplate` y todo el enlazado de assets (`url(…)` → import) siguen igual: reciben
  un string, y lo que cambia es que llega compactado.
- `export const css` mantiene su forma: sigue siendo un template literal.
- El polyfill de adopción y `data-adopt` (SDD-18) no participan: consumen el texto, no lo
  producen.

---

## 4. Comportamiento corregido

### 4.1. Se compacta lo que es texto CSS, y nada más

Recorrido de `StyleNode.parts`:

- `CssText` → se compacta: tiradas de whitespace a un espacio, y sin espacio alrededor de
  `{`, `}`, `;` y `:`.
- `RazorExpression`, `AtEscapeNode`, `RazorCommentNode` → **verbatim, siempre**. Son código
  del usuario, ya validado por Oxc, y sus spans alimentan los source maps.

### 4.2. No se compacta a través de una interpolación

La regla que hace correcto lo anterior. Una `RazorExpression` puede caer en mitad de una
declaración:

```css
.badge { padding: @(size)rem @(size * 2)rem; }
```

El texto que la rodea **no se puede tratar como si fuera continuo**: quitar el espacio
anterior a un `@(…)` o el posterior puede pegar dos tokens que el usuario separó a
propósito, y el valor de la interpolación no se conoce en compilación. Se compacta **dentro**
de cada `CssText`, nunca entre dos.

### 4.3. Los comentarios CSS se conservan

`CssText` incluye los comentarios CSS por decisión 49 (paso verbatim). Quitarlos es una
segunda decisión —cambia lo que el usuario escribió y puede llevarse por delante un
`/*! license */`— y no se toma aquí. Compactar whitespace es una transformación que el
navegador ya hace; borrar comentarios no lo es.

### 4.4. Lo que se gana, y dónde

El `<style>` de `dist/index.html` son 1,18 kB con 0,33 kB de whitespace. Multiplicado por
las cinco páginas y por cada chunk que lleva su copia. Es más de lo que paga todo BUG-07 en
el markup, y a diferencia de aquel **no tiene ninguna decisión semántica detrás**: el CSS no
tiene contexto inline, ni slots, ni `:empty`.

---

## 5. Invariantes

**Los que el bug violaba**

- *El compilador no re-parsea lo que ya parseó.* `componentCss` vuelve al texto fuente
  teniendo el AST delante.
- *Toda salida del build honra la configuración del usuario.* El mismo de BUG-05, BUG-06 y
  BUG-07: con `minify` activado, hay una parte de la salida que nunca se minifica y nadie lo
  dice.

**Los que la corrección añade**

- **Todo lo que sale del emit pasa por el AST.** Un `slice` del fuente en el emit es una
  señal de que falta usar un nodo.
- **Una interpolación se emite verbatim y con su span intacto.** Vale para markup y para
  CSS, y es lo que mantiene vivos los source maps.

---

## 6. Criterios de aceptación

Tests en `packages/compiler/test/`, sobre el módulo emitido.

1. **(rojo primero)** El `export const css` de un componente con CSS indentado no contiene
   tiradas de más de un espacio ni saltos de línea.
2. **(rojo primero)** Un componente con una `@(expr)` en mitad de una declaración emite la
   expresión **byte a byte idéntica**, y el texto a cada lado conserva el espacio que la
   separaba (§4.2).
3. Los comentarios CSS sobreviven (§4.3).
4. El enlazado de assets sigue funcionando: un `url(./logo.png)` dentro del CSS compactado
   se sigue convirtiendo en import y el `linker` lo resuelve igual.
5. **El CSS compactado es equivalente.** Sobre los fixtures canónicos: parsear el CSS emitido
   y el original con `CSSStyleSheet` en el entorno de test y comparar la lista de reglas y
   declaraciones. Es el criterio que impide que «compactar» se convierta en «romper un
   selector».
6. Los source maps no se degradan: las posiciones de las interpolaciones del `<style>` siguen
   resolviendo a su offset del `.fud` (regresión de SDD-13 sobre CSS).
7. **Extremo a extremo:** los 16 tests de `examples/basic/tests/` en verde, y una captura
   comparada de las cinco páginas sin diferencias visuales.

**Cobertura.** Lo nuevo nace al **100 %** en las cuatro métricas. `packages/compiler` no baja
de su cifra actual de ramas.

---

## 7. Fuera de alcance

- **Quitar comentarios CSS** (§4.3). Es otra decisión, con otro riesgo.
- **Optimizar el CSS de verdad**: fusionar reglas, reordenar declaraciones, eliminar
  duplicados, autoprefijar. Nada de eso es «minificar whitespace» y todo eso necesita
  entender cascada. Además CLAUDE.md prohíbe `postcss`.
- **Deduplicar el CSS compartido entre chunks.** SDD-18 ya tiene su mecanismo de hojas
  compartidas; si sobra CSS repetido, es allí.
- **El whitespace del markup:** [BUG-07](./BUG-07-html-sin-minificar.md).
- **La minificación del JS que rodea al literal:** [BUG-06](./BUG-06-minify-no-heredado.md).
