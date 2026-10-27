# SDD-64 — Resultados que una máquina entiende: criterios, tests y el árbol de roles

> **Estado:** `Listo` — [tareas](./SDD-64-Task.md).
> **Paquetes:** `@fudic/workbench` · `@fudic/terms` · `@fudic/testing` · `@fudic/compiler` ·
> `@fudic/vite` · `@fudic/diagnostics`
> **Depende de:** 32 (banco), 52 (`.fudspec`), 53 (fixtures), 57 (`@fudic/testing`), 59 (términos
> de serie), 50 (catálogo)
> **Rango de diagnósticos:** `FUD1200`–`FUD1219` (nuevo). Usa `FUD1200`–`FUD1207`.
> **Decisiones de gramática:** ninguna.
> **Origen:** [IDEA-07](./ideas/IDEA-07-mcp-de-fudic.md) §5.7, §5.9, §5.12 y §11.2 (trabajo 3).
> **Rama sugerida:** `sdd-64-resultados-legibles`
>
> **Qué añade en una frase.** Ejecutar los criterios de una `.fudspec` o los tests unitarios
> devuelve un informe con qué falló, en qué línea, qué se esperaba, qué salió, si el rojo es bueno
> o el test ni llegó a ejecutarse, y en qué línea del `.fud` está el elemento que falló. Y una pieza
> pintada se puede leer como árbol de roles, igual en happy-dom que en el navegador.

---

## 1. Contexto y objetivo

El MCP (IDEA-07) cierra un bucle: el LLM escribe, ejecuta los criterios y los tests, lee qué falló
y lo arregla. Hoy ese bucle se rompe al leer. Así contesta hoy el banco a un criterio en rojo
(`fudic-workbench run --json`):

```json
{ "v": 2, "type": "result", "tag": "acme-button", "id": "disabled-no-press", "verdict": "fail",
  "steps": [
    { "block": "when", "term": "click", "args": ["acme-button"], "pass": true, "evidence": "clicked acme-button" },
    { "block": "then", "term": "emitted", "args": ["press", "0"], "pass": false, "evidence": "1" }
  ],
  "shots": {}, "marks": [{ "step": 1, "ref": "acme-button", "box": { "x": 0, "y": 0, "width": 80, "height": 32 } }],
  "pageErrors": [] }
```

Para arreglar algo con esto, un LLM tiene que:

1. **Casar el resultado con la `.fudspec` a mano.** El resultado no lleva líneas: están en el
   mensaje `session` anterior, y los pasos se casan por su posición en la lista.
2. **Adivinar qué se esperaba.** `evidence` es lo que el término quiso devolver: un objeto
   `{ expected, actual }` en `text`, una frase en `focused`, un número de píxeles sin el mínimo en
   `min-width`.
3. **Buscar el elemento en el `.fud`.** La marca es una caja en una captura que `run` ni siquiera
   guarda (`run.ts:126` las tira).
4. **Distinguir un rojo de un fallo de la página.** Un `problem` es una frase sin código (`bench.ts:114`).

Con los tests unitarios es peor: `fudic test` lanza vitest en otro proceso y solo mira si salió con
0 (`cli/runner/vitest-projects.mjs`). Un `.fud` que no compila llega como el texto de la excepción
del import, con el primer error en `loc` y el resto pegados en `message` (`vite/src/report.ts`).

Esta spec no añade herramientas al MCP. Hace que lo que ya existe **conteste en una forma que se
pueda leer sin adivinar**, para que el MCP (y cualquier otra herramienta) solo tenga que pasarlo.

### 1.1. Lo que entra

1. **El informe de un criterio**: su posición, el paso que falló con la suya, lo esperado y lo
   obtenido en texto, el elemento en el `.fud`, la captura en disco.
2. **Términos con la misma forma de evidencia**: todo `then` dice `expected` y `actual`.
3. **Los problemas del banco con código**: lo que impide ejecutar un criterio es un diagnóstico.
4. **Del elemento del DOM a su línea en el `.fud`**: la única parte que toca el compilador.
5. **El informe de los tests unitarios**: `pass`, `fail` (una aserción) o `broken` (ni llegó a
   comprobar), con línea, texto citado, esperado y obtenido.
6. **Los errores de compilación como datos**: el error de Vite lleva la lista entera de
   diagnósticos, no solo texto.
7. **El árbol de roles** de una pieza pintada, en happy-dom y en el navegador, con el mismo formato.

## 2. Dependencias

| SDD | Qué aporta |
|---|---|
| 32 | El banco: `runSpecs`, el motor (`runCriterion`), los mensajes del protocolo, las capturas y las marcas. |
| 52 | El AST de la `.fudspec` con `Span` en cada criterio y cada paso (`packages/spec/src/ast.ts`). |
| 53 | Las fixtures (`*.fixture.ts`) que el banco monta. |
| 57 | `@fudic/testing`: `mount`, `visit`, las consultas que atraviesan shadow roots, `fudicTest()`. |
| 59 | Los términos de serie (`@fudic/terms`), `TermOutcome` y `TermHost.onLocate`. |
| 50 | Un código nuevo es un `.ts` + un `.md` + una línea de `index.ts`. |

## 3. Interfaz pública

### 3.1. Posiciones

```ts
// @fudic/diagnostics
/** A place in a file, as a person reads it: 1-based line and column, path relative to the project root, with '/'. */
export interface Position {
  readonly file: string;
  readonly line: number;
  readonly column: number;
}
/** "src/components/acme-button/acme-button.fud:22:3" */
export function formatPosition(position: Position): string;
```

Toda posición de esta spec es un `Position`. La columna cuenta unidades UTF-16 desde 1, como el
editor.

### 3.2. El informe de un criterio

```ts
// @fudic/workbench
export interface CriterionReport {
  readonly spec: string;                 // the .fudspec, relative to the project root
  readonly id: string;                   // the criterion's slug
  readonly at: Position;                 // the `criterion` line
  readonly verdict: 'pass' | 'fail' | 'error';
  readonly ms: number;
  /** The first `then` that answered false. Only when verdict is 'fail'. */
  readonly failed?: FailedStep;
  /** Why it could not run, or the step that threw. Only when verdict is 'error'. */
  readonly broken?: BrokenRun;
  /** The element the failed or broken step located, back in its .fud. */
  readonly source?: SourceRef;
  /** Screenshots on disk, relative to the project root. Only when verdict is not 'pass'. */
  readonly shots?: { readonly before?: string; readonly after?: string };
  readonly pageErrors: readonly string[];
}

export interface FailedStep {
  readonly step: string;                 // the step as written: "then  emitted press 0"
  readonly at: Position;                 // its line in the .fudspec
  readonly expected: string;
  readonly actual: string;
}

export interface BrokenRun {
  readonly step?: string;                // the step that threw, as written
  readonly at?: Position;                // its line, or the criterion's when nothing ran
  readonly diagnostics: readonly WireDiagnostic[];   // at least one, each with its code
}

export interface SourceRef {
  readonly at: Position;                 // the element's opening tag in its .fud
  readonly quote: string;                // that source line, trimmed
}
```

- `runSpecs` devuelve los informes: `RunSummary` gana `reports: readonly CriterionReport[]`, en
  el orden de los criterios en cada `.fudspec` y de las `.fudspec` por ruta.
- `fudic-workbench run --json` escribe, después de cada `result`, una línea
  `{ "v": 2, "type": "report", ...CriterionReport }`. Los mensajes que ya existen no cambian: el
  shell y quien lea `result` siguen igual.
- `RunOptions` gana `failing?: boolean`: ejecuta solo los criterios que no pasaron en el último
  informe guardado (§4.6). Sin informe previo, los ejecuta todos.

### 3.3. La evidencia de un término

```ts
// @fudic/terms
export interface TermOutcome {
  readonly pass: boolean;
  /** For a `then`: what it looked for and what it found, as text. For a `when` or a `given`: what it did. */
  readonly evidence: string | Evidence | null;
}
export interface Evidence {
  readonly expected: string;
  readonly actual: string;
}
```

- Antes `Evidence` era `{ expected: unknown; actual: unknown }`. Pasa a texto: es lo que se le
  enseña a una persona y a un LLM, y cada término sabe escribir su valor mejor que un
  `JSON.stringify` genérico.
- **Todo `then` de serie devuelve `Evidence`**, pase o no (§4.2).
- Un término del proyecto (`fudic/terms/then/*.js`) puede seguir devolviendo una frase o `null`:
  el informe lo normaliza (§4.2). No se rompe ningún término escrito.

### 3.4. Del DOM al fuente

```ts
// @fudic/compiler — CompileOptions
/** Stamps every element written from a template with `data-fud-src="<file>:<line>:<col>"`. Off by default. */
readonly sourceLocations?: boolean;

// @fudic/vite
fudic({ sourceLocations?: boolean });

// @fudic/testing/config
fudicTest({ sourceLocations?: boolean });
```

- Con la opción, cada elemento que el `.fud` escribe lleva `data-fud-src` con la posición de su
  etiqueta de apertura (`openSpan.start`). Ejemplo:
  `<button data-fud-src="src/components/acme-button/acme-button.fud:22:3">`.
- **El banco la enciende siempre.** Nadie más la enciende por defecto. El build nunca la lleva.
- `Mark` (protocolo del banco) gana `source?: string`, el valor del atributo del elemento marcado.

### 3.5. El informe de los tests unitarios

```ts
// @fudic/testing/run  (entrada nueva, solo Node)
export function runTests(options: RunTestsOptions): Promise<TestReport>;

export interface RunTestsOptions {
  readonly root: string;                         // the project
  readonly paths?: readonly string[];            // test files or folders; none = every test of the project
  readonly names?: readonly string[];            // only tests whose full name contains one of these
  readonly failing?: boolean;                    // only what did not pass in the last report
}

export interface TestReport {
  readonly summary: { readonly pass: number; readonly fail: number; readonly broken: number; readonly skipped: number };
  /** Every test that did not pass, plus every file that could not load. Passing tests are only counted. */
  readonly tests: readonly TestResult[];
  /** The same counts per test file, in path order: every file that ran, green ones included. */
  readonly files: readonly { readonly file: string; readonly pass: number; readonly fail: number; readonly broken: number; readonly skipped: number }[];
  readonly ms: number;
}

export type TestResult = FailedTest | BrokenTest;

export interface FailedTest {
  readonly verdict: 'fail';
  readonly file: string;
  readonly name: string;                 // the full name: "acme-button > disabled: a click does not emit press"
  readonly at: Position;                 // the line of the expect that failed
  readonly quote: string;                // that line, trimmed
  readonly expected?: string;
  readonly actual?: string;
  readonly message: string;              // the assertion's first line
}

export interface BrokenTest {
  readonly verdict: 'broken';
  readonly file: string;
  readonly name: string | null;          // null when the whole file did not load
  readonly at?: Position;
  readonly quote?: string;
  /** FUD diagnostics with their position in the .fud when a .fud did not compile; otherwise one FUD1207. */
  readonly diagnostics: readonly WireDiagnostic[];
}
```

### 3.6. Los errores de compilación como datos

```ts
// @fudic/vite — the error a failed .fud transform throws
interface FudicCompileError extends Error {
  readonly fudic: { readonly diagnostics: readonly WireDiagnostic[] };   // every error, not just the first
}
export function isFudicCompileError(error: unknown): error is FudicCompileError;
```

`message`, `loc`, `frame` e `id` siguen como hoy: el overlay y la terminal no cambian.

### 3.7. El árbol de roles

```ts
// @fudic/testing
export function outline(root: Element | Document | ShadowRoot): string;

// @fudic/workbench
export function outlineOf(page: Page, selector: string): Promise<string>;
```

Las dos devuelven el mismo texto, el formato de *ARIA snapshot* de Playwright:

```yaml
- button "Save" [disabled]
- group "Shipping":
  - textbox "Street"
  - checkbox "Gift wrap" [checked]
```

Una línea por elemento con rol, con su nombre accesible entre comillas y sus estados entre
corchetes; los hijos van debajo, sangrados dos espacios. Atraviesa los shadow roots y sigue los
slots (el árbol aplanado), como un lector de pantalla.

### 3.8. Los códigos

| Código | Título (`.md`) | Cuándo |
|---|---|---|
| `FUD1200` | The page of a criterion did not load | La página respondió con un status nulo o ≥ 400 |
| `FUD1201` | A term that does not exist | El paso nombra un término que no está en `@fudic/terms` ni en `fudic/terms/` |
| `FUD1202` | A step that ran out of time | El término no terminó en su tiempo |
| `FUD1203` | A reference that matches more than one element | `ctx.locate(ref)` encontró N > 1 |
| `FUD1204` | A term that threw | El término lanzó por otra razón |
| `FUD1205` | An error in the page | La página lanzó un error mientras se ejecutaba el criterio |
| `FUD1206` | The project extension failed | `fudic/bench.js` lanzó al cargar o en su `setup` |
| `FUD1207` | Could not run | Cualquier otra cosa que impide ejecutar: el mensaje original va en el texto |

Siguen los que ya existen: `FUD0973` (la fixture lanzó), `FUD0975` (no hay navegador) y los del
compilador cuando un `.fud` no compila.

## 4. Comportamiento

### 4.1. El informe se construye con lo que el banco ya sabe

`reportOf(session, result)` es una función pura en `@fudic/workbench`:

- `at` del criterio y de cada paso salen de los `Span` del AST de la `.fudspec`, convertidos a
  línea y columna con el texto que el banco ya leyó. Ya no se casan por posición en dos mensajes.
- `failed` es el **primer** `then` que respondió `pass: false`. Los pasos que siguen se ejecutan
  como hoy (el motor no para en un `fail`), pero el informe nombra uno: es el que hay que arreglar.
- `broken` sale cuando el veredicto es `error`. Lleva el paso que lanzó (si hubo) y siempre al
  menos un diagnóstico con código (§4.3).
- `source` sale de la marca del paso de `failed` o de `broken`: su `source` (§4.4), con `quote`
  leído del fichero. Sin marca o sin atributo (un elemento que no escribió ningún `.fud`, como el
  `body`), no hay `source`.
- `shots`: el banco escribe las capturas de los criterios que no pasan en
  `.fudic/runs/<tag>/<id>.before.png` y `.after.png`, y borra las de los que pasan. `.fudic/` ya
  está en el `.gitignore` de todo proyecto generado.

### 4.2. La evidencia de los términos

**Los `then` de serie** pasan a devolver `Evidence` de texto:

| Término | `expected` | `actual` (ejemplos) |
|---|---|---|
| `text` | `contains "Save"` | `"Cancel"` · `not there` |
| `attribute` | `aria-pressed="true"` | `aria-pressed="false"` · `no aria-pressed` · `not there` |
| `slotted` | `slot "title" holds "Hi"` | `slot "title" holds ""` · `not there` |
| `min-width` / `min-height` | `at least 44px` | `32px` · `not rendered` · `not there` |
| `focused` | `focus on acme-input` | `focus on body` · `not there` |
| `visible` / `hidden` | `visible` / `hidden` | `hidden` / `visible` · `not there` |
| `present` | `in the page` | `not there` |

**Un término del proyecto** que no devuelve `Evidence` se normaliza en el informe:

- `expected` = su `describe(args)` si lo tiene; si no, el paso tal como está escrito.
- `actual` = la frase que devolvió; con `null`, `—`; con otro objeto, su `JSON.stringify`.

Los `when` y los `given` no cambian: devuelven la frase de lo que hicieron.

### 4.3. Los problemas tienen código

Cada fallo que hoy es una frase se convierte en un diagnóstico con su código (§3.8):

- **Un paso que lanza** (`StepFailed`): el motor clasifica la excepción. Término que no carga →
  `FUD1201`; `TimeoutError` de Playwright → `FUD1202`; la guarda de `locate` («matches N
  elements», `terms/src/locate.ts:65`) → `FUD1203`; otra cosa → `FUD1204`. `StepFailed.error`
  sigue llevando el texto, y gana `code`.
- **La página no carga** → `FUD1200` con el status.
- **`pageErrors`** → un `FUD1205` por error, con su primera línea.
- **`fudic/bench.js`** → `FUD1206`.
- **El `problem` del banco** (`bench.ts:114`, `:125`): si la causa es un `FudicCompileError`
  (§3.6), sus diagnósticos tal cual, con fichero y línea; si no, `FUD1207`. `ProblemMessage` gana
  `diagnostics: readonly WireDiagnostic[]`; `message` se queda para el shell.

### 4.4. `data-fud-src`

- **Qué elementos.** Cada `ElementNode` del template que el emit convierte en un elemento del DOM:
  los del markup del componente, los de su `<template shadowrootmode>`, los de las ramas de
  control y los bucles, los de un snippet. El host de un componente hijo es un elemento del
  template del padre: lleva la posición de su etiqueta en el `.fud` del padre. Los nodos de texto
  no llevan nada.
- **Valor.** `<fichero>:<línea>:<columna>`. El fichero es relativo a la raíz del proyecto, con
  `/`; un componente de una librería del workspace sale con su ruta relativa
  (`../../libs/ui/src/components/ui-card/ui-card.fud`), uno publicado con la suya en
  `node_modules`.
- **Los dos emisores escriben lo mismo.** El SSR lo pone en el HTML; el camino de cliente que
  fabrica el elemento lo pone igual. El camino que adopta un DOM ya pintado no escribe atributos:
  el atributo ya vino del servidor. El árbol sale idéntico por los dos caminos, como exige el emit.
- **Sin coste fuera.** Con la opción apagada el emit no cambia ni un byte: el golden test del
  compilador lo comprueba.
- **No es un nombre del autor.** `data-fud-*` ya está reservado (`reserved-attributes.ts`): un
  autor no puede escribir `data-fud-src` a mano.
- **La marca lo recoge.** Cuando `ctx.locate(ref)` registra la caja de un elemento
  (`TermHost.onLocate`), lee también su `data-fud-src`. Si el elemento no lo tiene, se sube por
  sus ancestros (cruzando el host de un shadow root) hasta el primero que lo tenga: un clic sobre
  un texto acaba en el elemento que lo escribe.

### 4.5. Los tests unitarios

- **Vitest en proceso.** `runTests` usa `createVitest` de `vitest/node` con el `vitest.config` del
  proyecto, un reporter propio en memoria y `run: true, watch: false`. Nunca el binario. Vitest es
  ya `peerDependency` de `@fudic/testing`.
- **`fail` frente a `broken`.** Un test es `fail` si su error lo lanzó una aserción: el error de
  vitest se llama `AssertionError` o `JestAssertionError` (los matchers de jest-dom). Todo lo demás
  es `broken`: una excepción del código, `mount` que lanza, un import que no existe, un timeout.
- **Un fichero que no carga** (su import de un `.fud` falla, o el propio `.test.ts` no compila) da
  un `BrokenTest` con `name: null`. Si la causa es un `FudicCompileError`, sus diagnósticos van
  tal cual: el código `FUD` y la posición en el `.fud`, no la del import.
- **`at` y `quote`.** La primera línea de la pila del error que cae dentro de un fichero de test
  del proyecto (vitest ya da la pila parseada). `quote` es esa línea del fuente, recortada.
- **`expected` y `actual`.** Los que trae el error de la aserción, que vitest ya serializa a
  texto. Si no los trae, no van.
- **Solo lo que no pasa.** Los verdes y los saltados solo se cuentan en `summary`.

### 4.6. El último informe y `failing`

- `runSpecs` y `runTests` guardan su último informe en `.fudic/runs/last-spec.json` y
  `.fudic/runs/last-test.json` del proyecto.
- `failing: true` ejecuta solo lo que no pasó en él: criterios por `spec` + `id`, tests por
  fichero + nombre. Un fichero que no cargaba se vuelve a ejecutar entero.
- Guardar las ejecuciones **en git**, con el hash de lo que entró, es de SDD-65. Esto es solo la
  vuelta corta del bucle.

### 4.7. El árbol de roles

- **En el navegador** (`outlineOf`): `page.locator(selector).ariaSnapshot()` de Playwright, tal
  cual. Es la referencia.
- **En happy-dom** (`outline`): un recorrido propio del árbol aplanado (shadow roots y elementos
  asignados a cada slot, en orden) que escribe el mismo formato:
  - rol: explícito (`role=`) o implícito, con `aria-query` y `dom-accessibility-api`, que ya llegan
    con Testing Library;
  - nombre: `computeAccessibleName` de `dom-accessibility-api`;
  - estados: `disabled`, `checked` (y `mixed`), `expanded`, `pressed`, `selected` y `level`, los
    mismos que escribe Playwright;
  - un elemento sin rol no tiene línea: sus hijos suben a su nivel; un texto suelto sale como
    `- text: …`, como en Playwright.
- **Los dos dicen lo mismo, y se comprueba** (§6): un juego de piezas pintadas en los dos motores
  da el mismo texto. Lo que happy-dom no puede saber (lo oculto por CSS, lo que depende del
  layout) no entra en el juego, y se documenta en el README de `@fudic/testing`: para eso está el
  navegador.

## 5. Invariantes

- **Nada lanza hacia quien llama.** `runSpecs`, `runTests`, `reportOf`, `outline` y `outlineOf`
  devuelven siempre un resultado; lo que falla dentro es un diagnóstico con código.
- **Un hecho, una voz.** El código `FUD` de un `.fud` roto es el mismo en el editor, en el build,
  en el banco y en `runTests`.
- **Orden fijo.** Informes por ruta de fichero y por orden en el fichero; sin marcas de tiempo
  dentro de los informes salvo `ms`.
- **Sin coste en producción.** `sourceLocations` no cambia el emit cuando está apagado.
- **Cobertura.** Lo nuevo al 100 % en las cuatro métricas; ningún umbral baja.

### Catálogo

Todos son `error`. Cada `.md` sigue la forma de SDD-50 §4.4.

**Fix** de cada `.md`, en una línea:

- `1200`: «open the route in `vite dev` and fix what it answers; a 404 is a route that does not exist».
- `1201`: «check the term's name, or write it with `fudic g term`».
- `1202`: «make the page settle: a step waits for what it acts on».
- `1203`: «name the element more precisely: `role:button/"Save"`».
- `1204`: «read the message: the term itself failed».
- `1205`: «fix the error in the component; the page must not throw».
- `1206`: «fix `fudic/bench.js`».
- `1207`: «read the message: it says what stopped the run».

## 6. Criterios de aceptación

**El informe de un criterio**

1. **Rojo con todo.** Un `acme-button` de prueba con un criterio `disabled-no-press` que falla:
   `runSpecs` devuelve un `CriterionReport` con `verdict: 'fail'`, `at` en la línea del
   `criterion`, `failed.at` en la del `then`, `failed.expected` y `failed.actual` en texto,
   `source.at` en la línea del `<button>` del `.fud` y `source.quote` igual a esa línea recortada.
2. **Las capturas en disco.** El mismo caso deja `.fudic/runs/acme-button/disabled-no-press.after.png`
   y el informe la nombra. Al arreglarlo y volver a ejecutar, la captura desaparece.
3. **Verde.** Un criterio que pasa da un informe sin `failed`, `broken`, `source` ni `shots`.
4. **`run --json`.** Cada `result` va seguido de su `report`; los mensajes de antes salen igual que
   hoy (test de forma sobre la salida).
5. **`failing`.** Con tres criterios, uno en rojo: `failing: true` ejecuta solo ese. Sin informe
   previo, los tres.

**La evidencia**

6. Cada `then` de serie devuelve `Evidence` de texto en los casos de la tabla de §4.2, pase o no
   (un test por término).
7. Un término del proyecto que devuelve `'1'` y tiene `describe` da `expected` = su `describe` y
   `actual` = `'1'`; uno que devuelve `null`, `actual` = `'—'`.

**Los problemas**

8. Un paso con un término que no existe da `verdict: 'error'` y `broken.diagnostics[0].code` =
   `FUD1201`, con `broken.at` en la línea del paso. Igual con un timeout (`FUD1202`), una
   referencia ambigua (`FUD1203`) y un término que lanza (`FUD1204`).
9. Una ruta inexistente da `FUD1200`; un componente que lanza al pintarse da `FUD1205`; un
   `fudic/bench.js` roto, `FUD1206`.
10. Un `.fud` que no compila abierto en el banco: el `problem` lleva sus diagnósticos con código,
    fichero, línea y columna en el `.fud`, todos y no solo el primero.

**Del DOM al fuente**

11. Con `sourceLocations`, el SSR de un componente con un `@if`, un `@foreach` y un snippet pone
    `data-fud-src` correcto en cada elemento, incluidos los de las ramas y las vueltas.
12. El cliente que fabrica el mismo componente escribe los mismos atributos: el HTML del SSR y el
    `outerHTML` del cliente coinciden.
13. Sin la opción, el emit sale byte a byte como hoy (golden test del compilador sin cambios).
14. Un clic sobre un texto dentro de un `<span>` sin atributo, en un componente de una librería
    del workspace, deja una marca cuyo `source` es la posición del elemento más cercano que lo
    tiene, con la ruta relativa de la librería.

**Los tests unitarios**

15. **El rojo bueno.** Un test con `expect(pressed).toBe(0)` que recibe `1` da un `FailedTest` con
    `at` en la línea del `expect`, `quote` igual a esa línea, `expected: '0'` y `actual: '1'`.
16. **jest-dom también es `fail`.** `expect(el).toBeDisabled()` sobre un botón habilitado da `fail`.
17. **`broken`.** Un test cuyo `mount` lanza por una prop que no es JSON da `broken` con un
    diagnóstico. Un `.test.ts` que importa un `.fud` con un `FUD0540` da un `BrokenTest` con
    `name: null` y el `FUD0540` con su posición en el `.fud`.
18. **Solo lo que no pasa.** Un fichero con cuatro verdes y dos rojos da `summary` 4/2/0 y dos
    entradas en `tests`.
19. **`names` y `failing`** filtran como dice §3.5 y §4.6.
20. **El error de Vite.** Un `.fud` con tres errores: el error que lanza el plugin lleva los tres en
    `fudic.diagnostics`, y `message`, `loc` y `frame` salen como hoy.

**El árbol de roles**

21. Un `acme-button` deshabilitado da `- button "Save" [disabled]` en `outline` y en `outlineOf`.
22. **Los dos motores coinciden** en un juego de al menos ocho piezas de `examples/` y de
    `packages/testing/test/fixtures`: un formulario con `label` y `fieldset`, contenido
    proyectado en slots con nombre y sin nombre, componentes anidados con shadow root, un
    `aria-expanded`, un `checkbox` marcado, encabezados con nivel, un enlace y una lista.

**Entrega**

23. Los ocho códigos tienen `.ts`, `.md` y línea en `index.ts`. `pnpm typecheck`, `pnpm test` y
    `pnpm build` en verde; lo nuevo al 100 % en las cuatro métricas.

## 7. Fuera de alcance

- **Guardar las ejecuciones en git** y su hash: SDD-65.
- **Las herramientas del MCP** (`fudic_spec_run`, `fudic_test`, `fudic_render`): la spec del MCP.
  Aquí solo las funciones que llamarán.
- **Auditar la accesibilidad** (axe-core): IDEA-07 §11.3.
- **`source` para un test unitario que falla**: una aserción no dice sobre qué elemento era.
  Basta la línea del `expect`.

## 8. Decisiones

### 8.1. Tomadas al redactar

1. **`data-fud-src` como atributo, no una tabla aparte.** Se estudiaron tres formas: un atributo
   escrito por el emit, una tabla por componente indexada por el orden de sus elementos, y los
   source maps de las líneas que crean elementos. La tabla se rompe con `@if` y `@foreach` (el
   orden del DOM no es el del template) y los source maps no existen para el HTML del SSR. El
   atributo es lo único que sobrevive a las dos rutas de pintado, y solo se enciende en el banco.
2. **Formato del árbol de roles: el de Playwright.** Ya existe, está documentado, y el motor del
   navegador lo da hecho. Con un formato propio habría que mantener dos traductores.
3. **`Evidence` en texto, no `unknown`.** Lo lee una persona y un LLM; el término sabe escribir su
   valor («at least 44px») y un `JSON.stringify` genérico no.
4. **`fail` = el error es de una aserción.** Es la frontera que vitest ya marca con el nombre del
   error. Cualquier otra regla (mirar el mensaje, la pila) sería frágil.
5. **El último informe, en `.fudic/runs/`.** Es la carpeta ignorada de todo proyecto; lo que va a
   git es de SDD-65.
6. **El informe nombra solo el primer `then` en rojo.** El motor sigue ejecutando los demás, y
   siguen en `result.steps`, pero el bucle arregla uno cada vez.
