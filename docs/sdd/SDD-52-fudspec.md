# SDD-52 — El lenguaje `.fudspec`: parser, validador, colorizer y language server

> **Estado:** `En curso` — [tareas](./SDD-52-Task.md), 8 / 27. El parser está escrito y probado.
> **Paquetes:** `@fudic/spec` (nuevo: parser y validador) · `@fudic/diagnostics` (los códigos) ·
> `@fudic/language-server` (servicio `.fudspec`) · `fudic-vscode` (gramática y wiring)
> **Depende de:** 50 (catálogo de diagnósticos), 25 (extensión de VS Code), 23 (`$Props`),
> 35 (`@fudic/typecheck`, para saber qué props son obligatorias)
> **Rango de diagnósticos:** `FUD0920`–`FUD0959` (nuevo). El parser usa `0920`–`0935`; el
> validador, `0940`–`0954`.
> **Origen:** [banco de trabajo](../banco-de-trabajo/index.html) y el borrador del DSL
> [dsl-criterios.md](../banco-de-trabajo/dsl-criterios.md); medición en
> [medicion-fudspec.md](../banco-de-trabajo/medicion-fudspec.md).
>
> **Qué añade en una frase.** Los criterios de aceptación de un componente se escriben en un
> fichero hermano, `fud-button.fudspec`, que el editor colorea, completa y valida contra los
> módulos `.js` que los ejecutarán, sin ejecutar ninguno.

---

## 1. Contexto y objetivo

El banco de trabajo (SDD-32) ejecuta criterios sobre un componente montado. Antes de ejecutar
nada hace falta el **lenguaje**: un fichero que se escribe, se colorea, se completa y dice
«no compila» en el editor igual que un `.fud`. Esta spec es solo eso. Ejecutar los criterios
(webview, iframe, motores, MCP) es de otras specs.

```
fud-button.fud
fud-button.fudspec
fud-button.fixture.ts      (solo si el componente tiene props)
```

```
component fud-button

criterion tamano-tactil-minimo
  given
    route /playground/button
  then
    min-height fud-button 44
```

Cada línea de término se resuelve contra un fichero `.js`, `<raíz>/<bloque>/<término>.js`, que
es el que se ejecutará. El validador comprueba la línea contra ese fichero: que exista, que su
`meta` sea coherente y que los argumentos casen con `meta.params` en número y en tipo.

### 1.1. Por qué es un lenguaje aparte

La `.fudspec` no tiene nada de lo que hizo caro al `.fud`: no mezcla lenguajes, no pasa por
Oxc, no tiene modos ni transiciones de `@` y no necesita ficheros virtuales. Es una estructura
de líneas con indentación fija. Por eso:

- **`@fudic/compiler` no cambia.** `@fudic/spec` no depende de él.
- **El servicio del language server va aislado.** Solo responde a URIs `.fudspec` y no
  comparte nada con los servicios del `.fud` salvo el índice de componentes del workspace.

## 2. Dependencias

| SDD | Qué aporta |
|---|---|
| 50 | `@fudic/diagnostics`: `Span`, `span`, `emptySpan`, `SourceDiagnostic` y un fichero por código. |
| 25 | La extensión `fudic-vscode`: `contributes`, cliente LSP y `documentSelector`. |
| 23 | El `$Props` que la proyección TS de cada `.fud` exporta (`export type $Props = …`). Es el tipo contra el que se escribe una fixture. |
| 35 | `@fudic/typecheck`: el programa TS del language server, que contesta qué props de `$Props` son obligatorias. |

## 3. Interfaz pública

### 3.1. El fichero

- Una declaración `component <tag>` al principio.
- Uno o más bloques `criterion <slug>`. El slug es único en el fichero.
- Dentro de cada criterio, `given`, `when` y `then`, en ese orden y como mucho una vez cada
  uno. `given` y `when` son opcionales; `then` es obligatorio. Ningún bloque puede estar vacío.
- La indentación es la estructura: 0 espacios para `component` y `criterion`, 2 para un bloque
  y 4 para un término. Un tabulador nunca es indentación válida.
- `#` empieza un comentario hasta el fin de línea **solo si abre un token**. Dentro de un token
  (`#fff` no, `a#b` sí) o entre comillas es un carácter normal.
- Las líneas en blanco no cuentan. Valen `\n`, `\r\n` y `\r`.

### 3.2. La línea de término

```
<término> <arg>*
```

Hay tres formas de argumento, y la forma no es el tipo:

| Forma | Ejemplo | Nota |
|---|---|---|
| `bare` | `44`, `fud-button`, `/playground/button` | Sin comillas. Que sea número, tag o ruta lo decide `meta.params`. |
| `string` | `"search"`, `"dice \"hola\""` | Entre comillas dobles. Escapes `\"` y `\\`; cualquier otra barra es literal. Nunca cruza de línea. |
| `role` | `role:button`, `role:button/"Detalles"` | Elemento por rol y, opcionalmente, nombre accesible entre comillas. |

### 3.3. El árbol

```ts
interface Name { readonly text: string; readonly span: Span }
type BlockKind = 'given' | 'when' | 'then';

interface BareArg   { readonly kind: 'bare';   readonly text: string; readonly span: Span }
interface StringArg { readonly kind: 'string'; readonly text: string; readonly span: Span;
                      readonly contentSpan: Span }
interface RoleArg   { readonly kind: 'role';   readonly role: Name; readonly name?: Name;
                      readonly span: Span }
type Arg = BareArg | StringArg | RoleArg;

interface TermLine      { readonly kind: 'term'; readonly name: Name; readonly args: readonly Arg[];
                          readonly span: Span }
interface Block         { readonly kind: 'block'; readonly block: BlockKind; readonly keyword: Span;
                          readonly terms: readonly TermLine[]; readonly span: Span }
interface Criterion     { readonly kind: 'criterion'; readonly keyword: Span; readonly slug?: Name;
                          readonly blocks: readonly Block[]; readonly span: Span }
interface ComponentDecl { readonly kind: 'component'; readonly keyword: Span; readonly tag?: Name;
                          readonly span: Span }
interface SpecFile      { readonly kind: 'spec'; readonly component?: ComponentDecl;
                          readonly criteria: readonly Criterion[]; readonly comments: readonly Span[];
                          readonly span: Span }

interface ParseResult<T> { readonly value: T; readonly diagnostics: readonly SourceDiagnostic[] }

export function parseSpec(source: string): ParseResult<SpecFile>;
export const SPEC_EXTENSION = '.fudspec';
```

Los spans son los de la regla de oro (UTF-16, `[start, end)`):

- `TermLine`, `ComponentDecl`: del primer token al final del último. El comentario no cuenta.
- `Block`: de la palabra clave al final de su último término.
- `Criterion`: de la palabra clave al final de su último bloque.
- `StringArg.span` y `RoleArg.name.span` incluyen las comillas; `contentSpan` no.

### 3.4. Los módulos de término

```
<raíz>/
  given/route.js
  when/set-attribute.js
  then/min-height.js
```

El nombre del fichero **es** el término y la carpeta **es** el bloque. No hay índice ni
manifiesto: el listado del directorio es el vocabulario. Hay dos raíces, en este orden, y la
primera coincidencia gana entera (no se fusiona):

| Orden | Raíz | Capa |
|---|---|---|
| 1 | `<workspace>/fudic/terms/` | `workspace` |
| 2 | la carpeta `terms/` del framework, que inyecta el host | `framework` |

```js
export const meta = {
  name: 'min-height',
  block: 'then',
  params: [
    { name: 'target', type: 'element' },
    { name: 'px',     type: 'number' },
  ],
  describe: ({ target, px }) => `${target} mide al menos ${px}px de alto`,
};
export async function run(ctx) { /* … */ }
export const selfTest = [ /* … */ ];
```

**El validador no ejecuta el módulo: lo lee.** Con un `import()` correría código del usuario
dentro del language server, y la caché de módulos de Node no se entera de que el fichero ha
cambiado. Así que `meta` se extrae de forma estática con Oxc, y eso fija el contrato:

- `meta` es un `export const meta = { … }` con un objeto literal.
- `name` y `block` son cadenas literales. `params` es un array literal de objetos literales con
  `name` y `type` como cadenas literales. Los nombres de `params` no se repiten.
- `type` es uno de la lista cerrada: `element`, `number`, `string`, `token`.
- `describe` es opcional y nunca se ejecuta: el hover enseña su texto fuente.
- `run` es una función exportada (`export function`, `export async function` o
  `export const run =`). `selfTest` es un export obligatorio en la capa `workspace` y opcional
  en la `framework`.

El parámetro que `run` recibe se llama como lo declara `meta.params`. El borrador decía
`locator` para un parámetro llamado `target`, y eso no funciona con dos parámetros `element`.

### 3.5. Tipos de parámetro

| `type` | Acepta | Rechaza |
|---|---|---|
| `number` | `bare` cuyo `Number(text)` es finito | `string`, `role`, `bare` no numérico |
| `string` | `string` o `bare` | `role` |
| `token` | `bare` | `string`, `role` |
| `element` | `bare` con forma de nombre de tag (`[a-z][a-z0-9-]*`) o `role` | `string` |

### 3.6. `props` y las fixtures

`props <fixture>` es la única línea que **no es un término**: la resuelve el validador, porque
lo que hay que comprobar depende del componente y no de un `meta.params` fijo. Solo vale en
`given` y como mucho una vez por criterio.

```ts
// fud-card.fixture.ts
import type { $Props } from './fud-card.fud';

export default {
  'titulo-largo': { title: 'Un título que no cabe en una línea', items: [] },
  'vacio':        { title: '', items: [] },
} satisfies Record<string, $Props>;
```

- **TS comprueba los valores** de cada fixture gracias al `satisfies`. La `.fudspec` solo
  comprueba **nombres**: las claves del `export default`, leídas también de forma estática.
- Un componente con props obligatorias y un criterio sin `props` es un error de la spec, no
  una prueba en rojo.
- Qué props son obligatorias lo contesta el host con el programa TS sobre `$Props`. El
  validador lo recibe hecho.

### 3.7. El validador

```ts
type Layer = 'workspace' | 'framework';
type ParamType = 'element' | 'number' | 'string' | 'token';

interface TermParam  { readonly name: string; readonly type: ParamType }
interface TermModule {
  readonly layer: Layer;
  readonly path: string;            // absolute
  readonly block: BlockKind;
  readonly name: string;
  readonly params: readonly TermParam[];
  readonly describe?: string;       // source text, never run
  readonly diagnostics: readonly SourceDiagnostic[];  // problems of the module itself
}

interface TermCatalog {
  /** The first module that resolves `<block>/<name>.js`, in layer order. */
  resolve(block: BlockKind, name: string): TermModule | undefined;
  /** Every term of a block, for an error and for completion. */
  list(block: BlockKind): readonly TermModule[];
}

interface ComponentInfo {
  readonly tag: string;
  readonly path: string;
  /** Props without `?` in `$Props`, or 'unknown' when the type cannot be read. */
  readonly requiredProps: readonly string[] | 'unknown';
}

interface Fixtures {
  readonly path: string;
  readonly names: readonly Name[];   // spans in the fixture file
}

interface SpecContext {
  readonly terms: TermCatalog;
  component(tag: string): ComponentInfo | undefined;
  fixtures(tag: string): Fixtures | undefined;
}

export function readTermModule(source: string, path: string, layer: Layer, block: BlockKind): TermModule;
export function createTermCatalog(roots: readonly TermRoot[], fs: SpecFs): TermCatalog;
export function readFixtures(source: string, path: string): Fixtures;
export function validateSpec(file: SpecFile, ctx: SpecContext): readonly SourceDiagnostic[];
```

El sistema de ficheros se inyecta (`SpecFs`), así que todo es comprobable sin disco.

## 4. Comportamiento

### 4.1. El parser

- **Nunca lanza.** Devuelve siempre un `SpecFile`, parcial si la entrada está rota, más sus
  diagnósticos ordenados por posición.
- **Una indentación mala cuesta un diagnóstico, no el resto del fichero.** Se avisa
  (`FUD0921`) y la línea se lee al nivel de su primera palabra: `component`/`criterion` a 0, un
  bloque a 2 y cualquier otra cosa a 4.
- **Un error por sitio, sin cascada.** Una línea que no se puede colocar (bloque desconocido,
  bloque fuera de criterio, término sin bloque) se avisa una vez, y las líneas de término que
  cuelgan de ella se saltan sin un diagnóstico cada una.
- Una línea a nivel 0 desconocida (`FUD0928`) no cambia el estado: lo que venga debajo sigue en
  el bloque abierto. Mientras se escribe `crit…`, el resto del criterio no se pone en rojo.
- Un `component` después de un criterio cuenta si es el primero (`FUD0924`); uno repetido
  (`FUD0923`, con la primera declaración como `related`) se ignora. Los dos cierran el criterio
  abierto.
- Un bloque fuera de orden (`FUD0930`) sigue entrando en el árbol con sus términos.
- Un criterio sin slug ya tiene su `FUD0925`, así que no recibe además `FUD0933`.
- Sin `component` en todo el fichero: `FUD0922` sobre el span vacío del offset 0.
- Un nombre (tag, slug, término) entre comillas es `FUD0935` y se guarda tal como está escrito.
  Una comilla sin cerrar es solo `FUD0920`, nunca además `FUD0935`.

### 4.2. El validador

En el orden en que se comprueba cada línea:

1. **El término.** Se normaliza a kebab-case (`minHeight` → `min-height`) y se resuelve en
   `<bloque>/<término>.js`, capa a capa. Si no existe: `FUD0940`, con la lista de términos de
   ese bloque.
2. **El módulo.** Sus propios problemas (`FUD0941`–`FUD0946`, `FUD0954`) se reportan sobre el
   nombre del término en la `.fudspec`, con un `related` al sitio del `.js`. Un módulo roto no
   se usa para comprobar argumentos.
3. **La aridad** (`FUD0947`) y **los tipos** (`FUD0948`), contra `meta.params` y la tabla de
   §3.5.

Y una vez por fichero o por criterio:

- `component` que no está en el workspace: `FUD0949`.
- `props <x>`: fuera de `given` o repetida, `FUD0952`; sin fichero de fixtures, `FUD0953`; una
  clave que no existe, `FUD0950`, con la lista de las que hay.
- Un componente con `requiredProps` no vacío y un criterio sin `props`: `FUD0951`. Con
  `'unknown'`, no se dice nada.

### 4.3. El colorizer

Gramática TextMate `source.fudspec`, sin lenguajes embebidos:

| Qué | Scope |
|---|---|
| `component`, `criterion` a columna 0 | `keyword.control.fudspec` |
| `given`, `when`, `then` a 2 espacios | `keyword.other.block.fudspec` |
| el tag de `component` y el slug | `entity.name.type.fudspec` / `entity.name.section.fudspec` |
| el término, primer token a 4 espacios | `entity.name.function.fudspec` |
| `props` | `support.function.fudspec` |
| cadenas, con sus escapes | `string.quoted.double.fudspec`, `constant.character.escape.fudspec` |
| números | `constant.numeric.fudspec` |
| `role:` y su rol | `keyword.operator.role.fudspec`, `entity.name.tag.fudspec` |
| `#` comentario | `comment.line.number-sign.fudspec` |

Más los semantic tokens del language server: un término que no existe se pinta distinto del
que sí, y un argumento `element` como tag.

`language-configuration.json` propio: comentario de línea `#`, cierre de comillas e
indentación de dos espacios.

### 4.4. El language server

Un `LanguagePlugin` que solo reconoce `.fudspec` (`languageId: 'fudspec'`, sin códigos
embebidos) y un `LanguageServicePlugin` que solo responde a ese `languageId`. Del `.fud` solo
toma el índice de componentes del workspace. Ningún servicio del `.fud` responde en una
`.fudspec`.

| Función | Comportamiento |
|---|---|
| Diagnósticos | Los del parser más los del validador, en cada cambio. |
| Completado | Las palabras clave según la indentación. Los términos del bloque, del catálogo, con su capa. Los argumentos según `meta.params`: tags de componentes para `element`, más `role:`. Las claves de fixture tras `props`. |
| Hover | Término: firma (`min-height target:element px:number`), texto de `describe`, capa y ruta. `component`: ruta del `.fud`. `props x`: la fixture. |
| Ir a la definición | Término → su `.js`. `component` → su `.fud`. `props x` → la clave en el `.fixture.ts`. |
| Semantic tokens | §4.3. |
| Invalidación | Un cambio en `fudic/terms/**/*.js`, en un `*.fixture.ts` o en un `.fud` vuelve a validar las `.fudspec` abiertas. |

### 4.5. El wiring de VS Code

- `contributes.languages`: `fudspec`, extensión `.fudspec`, su `language-configuration` y su
  icono claro/oscuro.
- `contributes.grammars`: `source.fudspec` → `syntaxes/fudspec.tmLanguage.json`.
- `activationEvents`: `workspaceContains:**/*.fudspec`, además del de `.fud`.
- `documentSelector` del cliente: `fudic` y `fudspec`.
- Vigilancia de ficheros para la invalidación de §4.4.

## 5. Invariantes

- **Spans en todo**, en el árbol y en cada diagnóstico. Nunca líneas ni columnas.
- **Ni el parser ni el validador lanzan nunca.** Un `.js` roto o ilegible es un diagnóstico.
- **Ningún módulo de término se ejecuta** en el validador ni en el language server.
- **Ningún código escrito a mano:** cada error llama a la función de su código.
- **`@fudic/spec` no depende de `@fudic/compiler`.**
- **Cobertura al 100 %** en las cuatro métricas en `@fudic/spec`, desde su primer commit.

### Catálogo de diagnósticos

Todos son `error`.

| Código | Cuándo |
|---|---|
| `FUD0920` | Comilla sin cerrar en su línea. |
| `FUD0921` | Indentación distinta de 0, 2 o 4 espacios, o con tabulador. |
| `FUD0922` | El fichero no tiene `component`. |
| `FUD0923` | Segundo `component`. |
| `FUD0924` | `component` después del primer criterio. |
| `FUD0925` | `component` o `criterion` sin nombre. |
| `FUD0926` | Texto de más tras `component <tag>`, `criterion <slug>` o un bloque. |
| `FUD0927` | Slug repetido. |
| `FUD0928` | Línea a nivel 0 que no es `component` ni `criterion`. |
| `FUD0929` | Línea a nivel 2 que no es `given`, `when` ni `then`. |
| `FUD0930` | Bloque repetido o fuera de orden. |
| `FUD0931` | Bloque antes de cualquier criterio. |
| `FUD0932` | Término sin bloque encima. |
| `FUD0933` | Criterio sin `then`. |
| `FUD0934` | Bloque vacío. |
| `FUD0935` | Comilla dentro de un argumento `bare`, `role:` mal formado o nombre entre comillas. |
| `FUD0940` | El término no existe en ese bloque (con la lista de los que hay). |
| `FUD0941` | El módulo no tiene `export const meta` con un objeto literal, o algún campo no es literal. |
| `FUD0942` | `meta.name` no coincide con el nombre del fichero. |
| `FUD0943` | `meta.block` no coincide con la carpeta. |
| `FUD0944` | `type` fuera de la lista cerrada. |
| `FUD0945` | El módulo no exporta `run`. |
| `FUD0946` | Término de la capa `workspace` sin `selfTest`. |
| `FUD0947` | Número de argumentos distinto de `meta.params`. |
| `FUD0948` | Argumento de forma incompatible con el tipo de su parámetro. |
| `FUD0949` | El `component` no existe en el workspace. |
| `FUD0950` | La fixture no existe (con la lista de las que hay). |
| `FUD0951` | El componente tiene props obligatorias y el criterio no tiene `props`. |
| `FUD0952` | `props` fuera de `given`, o repetida en el criterio. |
| `FUD0953` | `props` sin fichero `<tag>.fixture.ts`. |
| `FUD0954` | Dos parámetros de `meta.params` con el mismo nombre. |

Los `.md` de `FUD0920`–`FUD0935` ya existen en `packages/diagnostics/src/codes/`.

## 6. Criterios de aceptación

**Parser**

1. **El fichero canónico.** El ejemplo de §1, más un criterio con `when` y `then`, da cero
   diagnósticos y un `SpecFile` con su `component`, dos criterios, sus bloques en orden y los
   términos con sus argumentos.
2. **Argumentos.** `set-attribute fud-button icon "search \"x\""` da un `bare`, un `bare` y un
   `string` con texto `search "x"`, con `span` y `contentSpan` exactos. `click
   role:button/"Detalles con espacio"` da un `role` con `role.text === 'button'` y `name.text`
   con espacios. `click role:button` da un `role` sin `name`.
3. **Comentarios.** `criterion a   # nota` guarda el comentario en `comments` y el slug no lo
   incluye. `min-height x #fff` es un comentario; `min-height x a#b` es un argumento.
4. **Spans.** Para cada nodo del caso 1, `source.slice(span.start, span.end)` es exactamente el
   texto del nodo. Los spans de criterio y bloque acaban en su último término, no en el
   comentario ni en la línea en blanco.
5. **Saltos de línea.** El mismo fichero con `\r\n` y con `\r` da el mismo árbol (salvo
   offsets) y cero diagnósticos.
6. **Fichero vacío.** `''` da un `SpecFile` sin criterios y un único `FUD0922` en `[0, 0)`.
7. **Cada código del parser.** Una entrada mínima por código da ese código, sobre el span que
   dice §4.1: `FUD0920` sobre la comilla hasta fin de línea, `FUD0921` sobre los blancos
   iniciales, `FUD0925` sobre la palabra clave, `FUD0926` del primer token de más al último,
   `FUD0927` y `FUD0923` con su `related`, etc.
8. **Recuperación.** Un término a 3 espacios da `FUD0921` y entra en su bloque. Un `\tthen` da
   `FUD0921` y abre el bloque. Las líneas bajo un bloque desconocido (`thn`) no dan diagnóstico
   propio. Tras un término sin bloque, los siguientes términos no repiten `FUD0932`.
9. **Sin cascada en criterio sin nombre.** `criterion` solo, sin `then`, da `FUD0925` y no
   `FUD0933`.
10. **Nunca lanza.** Un barrido de entradas generadas (prefijos de cada fixture, cada línea
    con 0–6 espacios, comillas sueltas, tabuladores, `\r` sueltos) nunca lanza y todo span
    cumple `0 <= start <= end <= source.length`.

**Validador**

11. **Resolución por capas.** Con `then/min-height.js` en las dos raíces, gana la de
    `workspace` y `TermModule.layer === 'workspace'`. Sin ninguno: `FUD0940` con los nombres
    del bloque.
12. **Kebab-case.** `minHeight fud-button 44` resuelve a `then/min-height.js`.
13. **Mismo nombre, bloques distintos.** `given/visible.js` y `then/visible.js` no chocan.
14. **Lectura estática.** Un módulo cuyo `meta` no es literal da `FUD0941`, y el módulo nunca se
    ejecuta (un `throw` a nivel de módulo no cambia el resultado).
15. **Coherencia del módulo.** `FUD0942`, `FUD0943`, `FUD0944`, `FUD0945`, `FUD0946` y
    `FUD0954`, cada uno con una entrada mínima, sobre el término y con `related` al `.js`.
16. **Aridad y tipos.** Cada fila de la tabla de §3.5, aceptada y rechazada.
17. **Componente.** Un tag que no está en el workspace da `FUD0949` sobre el tag.
18. **Props.** `FUD0950`, `FUD0951`, `FUD0952` y `FUD0953`, cada uno con una entrada mínima. Con
    `requiredProps: 'unknown'` no hay `FUD0951`.
19. **Fixtures estáticas.** `readFixtures` lee las claves del `export default` con y sin
    `satisfies`, con claves entre comillas y sin ellas, y da cada una con su span.

**Colorizer**

20. **Gramática.** Un test de snapshot de tokens TextMate sobre el fichero canónico y sobre uno
    con todos los casos de §4.3.

**Language server**

21. **Diagnósticos en vivo.** Abrir una `.fudspec` publica los diagnósticos del parser y del
    validador; corregir la línea los retira.
22. **Completado.** A 4 espacios bajo `then`, los términos de `then` de las dos capas, sin
    duplicados y con la capa a la vista. Tras un término con `element`, los tags del
    workspace y `role:`. Tras `props`, las claves de la fixture.
23. **Hover y definición.** Sobre un término: firma, `describe`, capa y ruta; ir a la
    definición abre el `.js` que ganó.
24. **Aislamiento.** Ningún servicio del `.fud` (HTML, CSS, TS, el de fudic) responde en una
    `.fudspec`, y ninguna funcionalidad del `.fud` cambia: la suite del language server sigue
    verde.
25. **Invalidación.** Borrar `then/min-height.js` con la `.fudspec` abierta pone la línea en
    `FUD0940` sin reabrir el fichero.

**Entrega**

26. **Wiring.** La extensión empaquetada colorea una `.fudspec` y arranca el servidor en un
    workspace que solo tiene `.fudspec`.
27. **Cobertura.** `@fudic/spec` al 100 % en las cuatro métricas; `@fudic/diagnostics` sigue al
    100 %; el umbral de `@fudic/language-server` y de `fudic-vscode` no baja.

## 7. Fuera de alcance

- **Ejecutar criterios:** el runner, los locators, el webview, el iframe y los motores (webview
  y Playwright) son de SDD-32 y de las specs que salgan de él.
- **La salida de `run` y el registro de trabajo** (`{ pass, evidence }`, la procedencia por capa
  y el hash del término).
- **Qué hace un tag que coincide con varios elementos:** es de ejecución.

## 8. Preguntas abiertas

Hay que contestarlas antes de la fase del validador.

1. **El `.fixture.ts` en el editor.** `import type { $Props } from './fud-card.fud'` lo resuelve
   `@fudic/typecheck`, pero un `.ts` en VS Code lo comprueba el TS server del propio editor, que
   no sabe qué es un `.fud`, y la extensión no registra ningún `typescriptServerPlugins`. Lo
   esperable es que el import salga en rojo en el `.fixture.ts`. Hay tres salidas: un plugin de
   TS server, una declaración `*.fud` ambiental que dé `$Props` como `any`, o fixtures en un
   formato que valide el servidor propio.
2. **`props` con callbacks y slots.** En SSR de nivel 1 una función no llega al HTML, y un slot
   es markup, no una prop.
3. **Fixture por defecto.** Una clave reservada que usarían los criterios sin `props`.
