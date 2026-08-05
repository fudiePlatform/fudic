# SDD-28 — Snippets y andamiaje en el editor

> **Paquetes:** `@fudic/language-server`, `@fudic/compiler` (una mudanza), `@fudic/cli` (la
> pierde), `@fudic/language-core` (§5.6) · **Rango de diagnósticos:** `FUD0520`–`FUD0539`
> (reservado, hoy vacío)
> **Estado:** `Hecho` · **Tareas:** [SDD-28-Task.md](./SDD-28-Task.md)

---

## 1. Contexto y objetivo

Escribir un `.fud` a mano cuesta más de lo que debería, y el motivo no es que falte
información en el editor: es que **la información que el proyecto ya tiene no llega al
sitio donde se teclea**. Tres hechos, los tres medidos:

1. Un `.fud` **vacío** es un `component-document` con `FUD0156` — un fichero recién creado
   nace en rojo, y la única forma de curarlo es saberse de memoria la forma del documento.
   El andamiaje existe (`fudic new`, `fudic g component`) pero vive en una terminal, no en
   el editor.
2. **Ninguna directiva `@` se ofrece jamás.** `@` está declarado como *trigger character*
   ([capabilities.ts:66-68](../../packages/language-server/src/capabilities.ts#L66-L68)): el
   editor pregunta al teclearlo y el servidor contesta vacío. La fontanería está puesta y no
   hay nadie al otro lado.
3. **Emmet ya cierra el tag, y por eso el problema no es el que parecía.** Medido contra
   `@vscode/emmet-helper` con la configuración de este servidor:

   ```
   "app-button" -> insertTextFormat=2  "<app-button>${0}</app-button>"
   "div"        -> insertTextFormat=2  "<div>${0}</div>"
   "@if"        -> nada
   ```

   O sea que `app-button` + Tab **ya** produce el tag cerrado; lo hace Emmet, y un ítem de
   Emmet no puede llevar pegado el `<link rel="component">`. Lo que falta no es cerrar el
   tag: es que el ítem sea **nuestro**, para que al aceptarlo entre también el enlace.

Este SDD convierte al servidor en la fuente de todo el andamiaje que se escribe dentro de un
`.fud`: **esqueletos de documento** (component · route · page · layout), **control de flujo**
(`@if`, `@foreach`, `@for`, `@while`, `@switch`), **zonas de `@code`** (`props<T>()`,
`@server load`, `@client`), **directivas de layout y de ruta** (`@RenderBody`, `@RenderHead`,
`@RenderSection`, `@section`) y **tags de componente con auto-enlace**.

**Qué absorbe.** [SDD-25-Task-Claude](./SDD-25-Task-Claude.md) **T-13** (snippet + auto-link)
y **T-14** (completado de directivas `@`) pasan a estar cubiertas por esta spec y dejan de
implementarse desde aquel documento. **T-15** —la query inversa del índice para
`@RenderSection(`— **no** entra: es un problema del índice del workspace, no del catálogo de
snippets (§8). Después quedó **anulada** allí, sin consecuencias para este SDD.

**No** cambia el lenguaje, ni el compilador, ni lo que la CLI genera.

---

## 2. Dependencias

| SDD | Qué aporta |
|---|---|
| [22](./SDD-22-fudic-cli.md) | Las plantillas `.fud` reales (`templates/`), `renderTemplate`, los *block builders* (`codeBlock`, `serverCodeBlock`, `styleBlock`, `sectionBlocks`, `renderSectionBlocks`, `indent`) y el anclaje de `<link rel="component">` por rol (`anchorFor`, §4.4). |
| [23](./SDD-23-emisor-ts-virtual.md) | La proyección virtual: lo que hay **dentro** de un tag ya lo contesta TypeScript, así que este SDD no toca atributos ni props. |
| [24](./SDD-24-language-server.md) | `completions()` y su cadena, `tagContextAt`/`sectionContextAt`/`hrefContextAt`, `declaredTags`, `WorkspaceIndex.byRole`, `relativeHref`, `roleOf`, `isMarkupOffset`, `RequestStats.run`. |
| [25](./SDD-25-extension-vscode.md) | El cliente: sin lógica de lenguaje (§5). Es quien declara `.fud` y quien empaqueta el servidor **como un bundle único**, hecho que decide §4.2. |
| [06](./SDD-06-control-flujo.md) · [08](./SDD-08-code-block.md) · [21](./SDD-21-layout.md) | La sintaxis exacta de lo que se emite: `@if/else`, `@foreach`, `@for`, `@while`, `@switch (x) { case a: … default: … }`, `@code { @server / @client }`, `@RenderBody`/`@RenderHead`/`@RenderSection`/`@section`. |

Todas en `Hecho` salvo SDD-15/17, que no intervienen.

---

## 3. Las tres decisiones que ordenan el resto

### 3.1 Los snippets los sirve el **servidor**, no `contributes.snippets`

Un fichero de snippets de VS Code es una tabla de prefijo → cuerpo sin contexto: se ofrece
igual dentro de `@code`, dentro de un `<style>` y en medio de un atributo. Aquí **la mitad
del valor es la puerta**, no el cuerpo:

- `@if` en markup sí; dentro de `@code` no (allí `if` es TypeScript y lo ofrece TypeScript).
- `@RenderBody()` en un layout sí; en una ruta es `FUD0432`.
- El esqueleto de un documento solo tiene sentido en un fichero vacío.
- El auto-enlace **necesita el índice del workspace**, que solo el servidor tiene.

Además, SDD-25 §5 dice que el cliente no lleva lógica de lenguaje, y SDD-24 §4.2 ya fijó que
lo que sabe qué existe en un `.fud` es este paquete. Un catálogo estático rompería las dos
reglas y solo funcionaría en VS Code.

> **Regla.** Todo snippet de fudic es un `CompletionItem` con `insertTextFormat: Snippet`
> emitido por `@fudic/language-server`. El manifiesto de la extensión **no** gana una sección
> `snippets`.

### 3.2 El cuerpo de un esqueleto **no se reescribe**: se materializa desde la plantilla de la CLI

`fudic g component` y el snippet `component` deben producir **el mismo fichero**, o el
proyecto tiene dos ideas de lo que es un componente. Las plantillas ya son ficheros `.fud`
reales con huecos `{{…}}` (SDD-22 §4.2), y un tabstop es exactamente un valor de hueco:

```ts
renderTemplate('component.fud', {
  code: codeBlock(),
  head: styleBlock(),
  tag: '${1:app-button}',
  body: '    $0\n',
});
```

Eso **es** el cuerpo del snippet, carácter a carácter.

**Pero no se llama en runtime.** `renderTemplate` hace `readFileSync` relativo a su módulo, y
el servidor viaja en el `.vsix` como **un solo bundle** (`server.mjs`): una dependencia de
ejecución obligaría a vendorizar `templates/` junto a los binarios nativos de `oxc-parser` y
`oxfmt`, con un modo de fallo silencioso (plantilla ausente ⇒ snippet vacío) en el único
sitio donde nadie mira. Así que:

> **Regla.** El catálogo son **constantes** en el servidor, y la igualdad con las plantillas
> de la CLI es un **test**, no una llamada. Es el patrón que este repo ya usa para el
> formateador —
> [`test/acceptance/formatting.test.ts`](../../packages/language-server/test/acceptance/formatting.test.ts)
> compara byte a byte lo que da el editor con lo que da `planFmt`— y `@fudic/cli` ya es
> `devDependency` de `@fudic/language-server` y ya está aliaseada a `src` en
> [`vitest.config.ts:25`](../../packages/language-server/vitest.config.ts#L25).

### 3.3 El ancla del `<link rel="component">` es **la de la CLI**, y se comparte de verdad

La regla de dónde entra un `<link rel="component">` ya está escrita, completa y por rol, en
[`packages/cli/src/wire.ts:59-76`](../../packages/cli/src/wire.ts#L59-L76): tras el último
link existente; si no hay, offset 0 en un componente, tras el `rel="layout"` en una ruta, y
dentro de `<head>` en una página o un layout (decisiones 53, 59, 83). Es exactamente lo que
`additionalTextEdits` necesita.

Duplicarla en el servidor produciría dos reglas que divergen en silencio el día que alguien
toque una. Se **muda**, con el mismo argumento con el que SDD-27 §4.1 mudó `safeName` a
`@fudic/transport`:

> **Regla.** `anchorFor` y `componentLinkTag` se mudan a **`@fudic/compiler`**
> (`src/document/anchor.ts`), que es quien posee `StructuredDocument` y quien ya hace cumplir
> las decisiones 53/59/83. `@fudic/cli` las importa desde allí y conserva
> `wireComponentLink`, que es la aplicación sobre texto; el servidor produce un `TextEdit`
> con el mismo offset. **`@fudic/language-core` se descartó como destino**: su cometido es la
> proyección a TypeScript, y esto es una regla de estructura del documento.

---

## 4. Interfaz pública

### 4.1 `@fudic/compiler` (mudanza)

```ts
/** Dónde entra un `<link rel="component">` nuevo, y con qué indentación (decisiones 53/59/83). */
export interface LinkAnchor {
  readonly offset: number;
  readonly indent: string;
}
export function componentLinkAnchor(source: string, doc: StructuredDocument): LinkAnchor;

/** El texto del link. Una sola definición para la CLI y para el editor. */
export function componentLinkTag(href: string): string;
```

Puras, sin I/O. `@fudic/cli` pasa a reexportar `anchorFor` como alias de
`componentLinkAnchor` o a importar el nombre nuevo; `wireComponentLink` y `alreadyLinked`
**se quedan** en la CLI (aplican texto y consultan hrefs ya escritos).

### 4.2 `@fudic/language-server` — el catálogo

```ts
// src/services/snippets.ts

/** Dónde puede ofrecerse un snippet. Las tres son excluyentes y se deciden por offset. */
export type SnippetScope =
  | 'empty-document'  // el fichero no tiene contenido significativo
  | 'markup'          // isMarkupOffset === true
  | 'code-block';     // dentro del `@code`

/** Dónde es legal un constructo que no puede ir en cualquier sitio (§5.1.b). */
export type SnippetPlacement = 'top-level' | 'in-head';

export interface FudSnippet {
  /** Lo que se teclea y lo que se ve en la lista. */
  readonly label: string;
  readonly detail: string;
  /** Cuerpo en sintaxis de snippet LSP: `$0`, `${1:x}`. */
  readonly body: string;
  readonly scope: SnippetScope;
  /** Roles en los que aplica. Ausente = todos. */
  readonly roles?: readonly FudRole[];
  /** Solo si el documento aún no tiene `@code` (SDD-10: como máximo uno). */
  readonly requiresNoCodeBlock?: true;
  /** Dónde es legal. Ausente = donde el scope lo permita. */
  readonly placement?: SnippetPlacement;
}

/** El catálogo entero, en orden de presentación. */
export const SNIPPETS: readonly FudSnippet[];

/** Los snippets aplicables en este offset. Puro: la puerta y nada más. */
export function snippetsAt(document: CachedDocument, offset: number): readonly FudSnippet[];
```

### 4.3 `@fudic/language-server` — contextos y tags

```ts
// src/services/position.ts

/** Una palabra a medio escribir en markup, SIN `<` delante: candidata a tag. */
export function wordContextAt(source: string, offset: number): PartialName | undefined;

/** Una directiva a medio escribir. El span INCLUYE el `@`, que es lo que se reemplaza. */
export function directiveContextAt(source: string, offset: number): PartialName | undefined;

/** El documento no tiene contenido significativo: solo espacios o nada. */
export function isEmptyDocument(source: string): boolean;
```

```ts
// src/services/tags.ts

export interface TagCompletion {
  readonly tag: string;
  /** El href con el que se declaró, o el que habría que escribir si no está enlazado. */
  readonly href: string;
  readonly path: string;
  /** `false` = el componente existe en el workspace pero este fichero no lo enlaza. */
  readonly linked: boolean;
}

/** Los componentes que este fichero PUEDE escribir: los enlazados y los del workspace. */
export function componentTags(
  document: CachedDocument,
  index: WorkspaceIndex,
): readonly TagCompletion[];

/** La edición que enlaza un componente, o nada si ya está enlazado. */
export function linkInsertionFor(
  document: CachedDocument,
  href: string,
): { readonly span: Span; readonly newText: string } | undefined;
```

`declaredTags` **se conserva**: `tagDefinitionAt` (F12) debe seguir resolviendo **solo** lo
enlazado — un tag que el fichero no enlaza es `FUD0191`, y navegar desde él fingiría que
compila.

---

## 5. Comportamiento

### 5.1 El catálogo

Cuatro familias. El **cuerpo** de las dos primeras se materializa desde las plantillas de la
CLI (§3.2); el de las otras dos es sintaxis del lenguaje y vive aquí.

**a) Esqueletos de documento** — `scope: 'empty-document'`, cualquier rol.

| Label | Plantilla | Huecos |
|---|---|---|
| `component` | `component.fud` + `codeBlock()` + `styleBlock()` | `tag: '${1:app-button}'`, `body: '    $0\n'` |
| `route` | `route.fud` + `serverCodeBlock()` + `sectionBlocks([])` | `layoutHref: '${1:../layouts/_layout.fud}'`, `title: '${2:@data.title}'` |
| `page` | `page.fud` + `indent(serverCodeBlock(), '    ')` | `lang: '${1:en}'`, `title: '${2:Home}'` |
| `layout` | `layout.fud` + `renderSectionBlocks(['${2:nav}'])` | `lang: '${1:en}'`, `renderHead: '    @RenderHead()'` |

Un hueco que aparece dos veces en la plantilla (el `{{title}}` de `route.fud` y de
`page.fud`) recibe **un solo tabstop**, así que el editor los espeja: escribir el título una
vez lo escribe en los dos sitios. Eso no es un efecto colateral, es la razón de que el
snippet valga más que el fichero.

**b) Bloque `@code`** — `scope: 'markup'`, `requiresNoCodeBlock`, por rol **y por posición**:

| Rol | Dónde | Cuerpo |
|---|---|---|
| `component` | top-level | `type Props`, `props<Props>()` y `@client {}` |
| `route` | top-level | `@server { export async function load() … }` |
| `page` | dentro de `<head>` | el mismo `@server load` |
| `layout` | dentro de `<head>` | `@code {\n  $0\n}` a secas: **un layout no declara `load`** (SDD-21 §4.3, `FUD0430`) |

La columna **dónde** la añadió la implementación, y no es cosmética: un `@code` es un nodo
top-level en un componente y en una ruta (decisiones 53, 83) y vive dentro de `<head>` en una
página y en un layout (59). Ofrecerlo en medio del cuerpo andamiaba un fichero en rojo
(`FUD0153`/`FUD0155`). Lo mismo vale para `@section`, que es top-level de su ruta. De ahí el
campo `placement` de §4.2.

**c) Control de flujo** — `scope: 'markup'`, cualquier rol:

```
@if        →  @if (${1:condition}) {\n  $0\n}
@if else   →  @if (${1:condition}) {\n  $2\n} else {\n  $0\n}
@foreach   →  @foreach (const ${1:item} of ${2:items}) {\n  $0\n}
@for       →  @for (let ${1:i} = 0; ${1:i} < ${2:items}.length; ${1:i}++) {\n  $0\n}
@while     →  @while (${1:condition}) {\n  $0\n}
@switch    →  @switch (${1:value}) {\n  case ${2:'a'}:\n    $0\n  default:\n}
```

La forma del `@switch` es la de la decisión 14 verificada en
[`control.test.ts:244`](../../packages/compiler/test/control/control.test.ts#L244): etiquetas
`case <expr>:` sin `fall-through` y sin llaves por caso.

**d) Directivas y zonas** — por rol y por scope:

| Label | Scope | Roles | Cuerpo |
|---|---|---|---|
| `@RenderBody` | markup | layout | `@RenderBody()` |
| `@RenderHead` | markup | layout | `@RenderHead()` |
| `@RenderSection` | markup | layout | `@RenderSection(${1:nav})` |
| `@section` | markup | route | `@section ${1:nav} {\n  $0\n}` |
| `@server` | code-block | route, page, component | `@server {\n  $0\n}` |
| `@client` | code-block | component | `@client {\n  $0\n}` |
| `props` | code-block | component | `type ${1:Props} = {\n  $2\n};\n\nconst {} = props<${1:Props}>();` |
| `load` | code-block | route, page | `export async function load(): Promise<${1:PageData}> {\n  $0\n}` |

### 5.2 Las puertas, y por qué el **rol no sirve** para el esqueleto

Medido sobre el parser real:

```
''        -> component-document · name "" · FUD0156
'\n  \n'  -> component-document · name "" · FUD0156
'<app-b'  -> component-document · name "app-b" · FUD0052, FUD0157
```

Un fichero vacío **siempre** es un componente: sin doctype y sin `<link rel="layout">`,
`structureDocument` no tiene con qué decidir otra cosa
([structure.ts:246-248](../../packages/compiler/src/document/structure.ts#L246-L248)). Si la
puerta del esqueleto fuese el rol, `route` y `layout` no se ofrecerían nunca. La puerta es
por tanto **el contenido**: `isEmptyDocument(source)` — nada, o **nada más que la palabra que
se está escribiendo**.

Esa segunda mitad la corrigió un test en rojo y no es una concesión: nadie completa sin
teclear antes, y al teclear `rou` el fichero deja de estar vacío. Una puerta que se cierra con
una sola pulsación es una puerta por la que no pasa nadie.

Y es la puerta correcta por una segunda razón: insertar un `<!DOCTYPE html>` en un fichero
que ya tiene markup no es lo que nadie quiso pedir jamás.

El resto de puertas son las que ya existen: `isMarkupOffset` para markup (que excluye por
construcción el cuerpo de `<style>`/`<script>` y las interpolaciones) y su negación acotada
al span del `@code` para `code-block`.

### 5.3 Los tags de componente, y la fusión con Emmet

`tagContextAt` deja de exigir `<`. Se añade `wordContextAt`, que reconoce una palabra en
markup sin delimitador — y ahí está el peligro: **si la rama de tags sigue devolviendo su
lista y retornando, Emmet deja de contestar para toda palabra tecleada en markup**, o sea
para `div`, `ul>li*3` y todo lo demás. Hoy no pasa porque `<` los separa.

> **Invariante.** El contexto de tag **sin `<`** produce ítems que se **fusionan** con los de
> Emmet, nunca una lista que los sustituya. La lista resultante conserva `isIncomplete: true`
> si Emmet lo puso: una abreviatura crece con caracteres que ningún filtro local conserva.

El contexto **con `<`** sigue devolviendo la lista sola, como hoy: ahí la pregunta es exacta.

Cada componente produce un ítem `insertTextFormat: Snippet` con cuerpo
`<app-button>$0</app-button>`, y dos grupos:

| Grupo | `sortText` | `labelDetails.description` | `additionalTextEdits` |
|---|---|---|---|
| Enlazado | `0_<tag>` | `fudic component` | — |
| **No enlazado** | `1_<tag>` | `fudic component · adds <link>` | el `<link rel="component" href="…">` en el ancla de §3.3 |

El `href` del enlace lo calcula `relativeHref(document.path, entry.path)`, que ya existe y ya
es lo que usa el completado de `href`. Aceptar un componente no enlazado deja el fichero
**compilando**: el tag escrito y su `<link>` puesto, sin `FUD0191` intermedio.

### 5.4 Las directivas

`directiveContextAt` reconoce `@` seguido de un identificador parcial y devuelve el span
**incluyendo el `@`**, para que el `textEdit` lo reemplace y no queden dos. La rama va
**antes** de Emmet y solo en markup; dentro de `@code` la lista es la de scope `code-block`,
que no lleva ninguna directiva de markup.

Medido: Emmet devuelve **nada** para `@if`, así que en esta rama no hay competencia que
ordenar.

### 5.5 Lo que este SDD **no** cambia de la cadena

`hrefContextAt` y `sectionContextAt` siguen siendo ramas exactas que retornan antes que todo
lo demás: son contextos donde una palabra no puede significar otra cosa. El orden final de
`completions()` queda:

```
href  →  @section <nombre>  →  directiva @  →  [tags + snippets + Emmet]  (fusionados)
```

La rama de `@` tiene una condición que la implementación añadió: **solo gana si tiene algo que
decir**. Dentro de un `<style>` un `@` es una at-rule de CSS, y contestar ahí con una lista
vacía tapa al servicio de CSS, que es de quien es ese `@media`.

### 5.6 Volar reparte el completado a **un solo** documento, y la raíz es el último

Esto no se descubrió escribiendo la spec sino ejecutándola contra un servidor y un cliente
reales, y **decide si media spec llega o no al editor**.
[`provideCompletionItems.js:134`](../../node_modules/.pnpm/@volar+language-service@2.4.28/node_modules/@volar/language-service/lib/features/provideCompletionItems.js)
hace un reparto **winner-takes-all**: el primer código embebido que responde a una posición la
reclama (`mainCompletionUri`) y **todos los demás se saltan**. Y `forEachEmbeddedDocument`
recorre en post-orden, así que el **root** —de donde salen los snippets, los tags y los
`href`— se visita **el último**. Medido en el workspace de fixtures:

| Posición | Antes | Nuestros ítems |
|---|---|---|
| `@code { pro| }` | 1082 ítems de TypeScript | **0** |
| `@code { @| }` | 3086 | **0** |
| `@co|` en markup (proyecta como interpolación) | 1195 | **0** |
| `@|` a secas | 8 | 8 |
| `rou|` en fichero vacío | 4 | 4 |

O sea: las cuatro entradas de scope `code-block` y toda la rama `@` con una letra escrita se
calculaban y se tiraban. **Los tests unitarios no podían verlo** porque llaman al servicio
directamente; solo el criterio sobre la conexión viva lo enseña.

El propio Volar tiene la salida: una zona puede declarar su completado como **`isAdditional`**,
y entonces responde **sin reclamar la posición**. `USER_CAPS` pasa de `completion: true` a
`completion: { isAdditional: true }` en `@fudic/language-core`. TypeScript sigue contestando
exactamente igual; lo que cambia es que deja de ser el **único** que contesta.

**Y eso destapa lo que el reparto estaba tapando:** la zona neutra de `@code` se emite en los
**dos** virtuales (SDD-23 §4.1), así que sin nadie reclamando, TypeScript contestaba **dos
veces** (2164 ítems donde había 1082). Se cierra con `USER_ECHO_CAPS`: el virtual de **cliente
es el canónico** para la zona neutra —la misma regla que el servidor ya aplica a los
diagnósticos duplicados de esa zona— y el de servidor conserva todas las demás capacidades
pero no ofrece completado ahí.

> **Invariante.** Una posición que dos virtuales proyectan tiene **un** dueño de completado, y
> es el de cliente. Lo que la hace compatible con la raíz es que ninguno de los dos la
> *reclame*.

---

## 6. Diagnósticos (`FUD0520`–`FUD0539`)

**Ninguno.** El rango se reserva y queda vacío, como hizo SDD-13: un completado que no aplica
no se ofrece, y no hay estado intermedio que reportar. Se anota en el catálogo de
[SDD-12](./SDD-12-semantica.md) para que nadie lo reutilice.

Si un snippet insertara algo inválido, el diagnóstico que corresponde es el que ya existe
para esa construcción (`FUD0156`, `FUD0432`, `FUD0430`…). Inventar códigos nuevos para el
andamiaje sería diagnosticar el editor en vez del fichero.

---

## 7. Criterios de aceptación

1. **Esqueletos**: en un `.fud` **vacío**, la lista contiene `component`, `route`, `page` y
   `layout`, los cuatro con `insertTextFormat: Snippet`.
2. **Equivalencia con la CLI**: para cada uno de los cuatro, el cuerpo del snippet es
   **byte a byte** el resultado de `renderTemplate` con los mismos *block builders* y los
   tabstops como valores. El test importa `@fudic/cli` y falla si cualquiera de los dos lado
   cambia sin el otro.
3. **El esqueleto materializado parsea con su rol**: sustituidos los tabstops por su valor por
   defecto, cada cuerpo pasa por `parseFud` y da `component-document`, `route-document`,
   `page-document` y `layout-document` respectivamente, **sin un solo diagnóstico**.
4. **La puerta del esqueleto es el contenido**: en un fichero con markup, ninguno de los
   cuatro se ofrece; en uno con solo espacios y saltos de línea, los cuatro.
5. **Control de flujo**: en markup se ofrecen los seis (`@if`, `@if else`, `@foreach`, `@for`,
   `@while`, `@switch`); **dentro de `@code` no se ofrece ninguno**, y dentro del cuerpo de un
   `<style>` tampoco.
6. **Todo cuerpo de control de flujo parsea**: sustituidos los tabstops, cada uno se inserta en
   un componente mínimo y compila sin diagnósticos — incluido el `@switch` con su `case` y su
   `default`.
7. **Rol en las directivas**: `@RenderBody` y `@RenderHead` se ofrecen en un layout y **no** en
   una ruta; `@section` en una ruta y **no** en un layout.
8. **Zonas de `@code`**: dentro del `@code` de un componente se ofrecen `props` y `@client`;
   dentro del de una ruta, `load` y `@server`; y `@client` **no** se ofrece en una ruta.
9. **`@code` una sola vez**: el snippet de bloque `@code` se ofrece en un documento que no lo
   tiene y desaparece en cuanto lo tiene.
10. **Tag sin `<`**: teclear `app-b` en markup ofrece `app-button` como snippet con su tag de
    cierre, con `sortText` por delante de los nativos.
11. **Emmet sobrevive**: en la misma posición y en la misma respuesta siguen estando los ítems
    de Emmet — `div` sigue expandiendo a `<div>$0</div>` —, y la lista conserva
    `isIncomplete`. **Este criterio es el que impide la regresión de §5.3.**
12. **Auto-enlace**: aceptar un componente del workspace **no** enlazado devuelve, además del
    tag, un `additionalTextEdits` con `<link rel="component" href="…">`; aplicado sobre el
    documento, el resultado **compila sin `FUD0191`** y el `href` resuelve por el índice.
13. **El ancla es la misma que la de la CLI**: sobre un corpus con los cuatro roles —y con y
    sin links previos— el texto que produce el servidor es **idéntico** al que produce
    `wireComponentLink`. Un test cruzado, como el de formateo.
14. **Idempotencia**: un componente que el fichero **ya** enlaza se ofrece sin
    `additionalTextEdits`; nunca se escribe un `<link>` duplicado.
15. **F12 no se ensancha**: `tagDefinitionAt` sigue resolviendo solo tags enlazados. Ofrecer un
    componente no enlazado no lo convierte en navegable hasta que el `<link>` está escrito.
16. `pnpm typecheck` y `pnpm test` verdes en todo el workspace, y **`@fudic/language-server`
    sigue al 100 %** en las cuatro métricas — igual que `@fudic/compiler` en el módulo mudado.
17. **Todo lo del catálogo llega al editor, no solo al servicio** (§5.6). Sobre la conexión
    viva: `props` dentro de un `@code`, `@client`/`@server` tras un `@` dentro de él, y las
    directivas sobre un `@` con letras ya escritas. Añadido tras medir que **ninguno de los
    tres llegaba**.
18. **TypeScript no se duplica.** La lista de una posición de la zona neutra tiene el mismo
    número de ítems de TypeScript que antes del cambio de §5.6, no el doble.
19. **El arnés declara lo que declara VS Code**: `snippetSupport: true`. Con `false`, el
    protocolo degrada todo snippet a texto plano y el criterio 1 estaría midiendo un cliente
    que no existe.

---

## 8. Fuera de alcance

- **T-15 — la query inversa del índice.** `@RenderSection(${1:nav})` se ofrece como snippet con
  un tabstop; **qué secciones existen de verdad** exigiría que el índice sepa qué páginas apuntan
  a un layout. Este SDD no la prepara ni la bloquea, y ya no la espera nadie: **T-15 quedó
  anulada** —el layout es quien declara las secciones, así que ofrecerle los nombres que sus
  páginas ya usan no es un contrato sino arqueología (ver
  [SDD-25-Task-Claude](./SDD-25-Task-Claude.md) T-15)—. El tabstop es lo que hay y basta.
- **Un catálogo configurable por el usuario.** El de aquí es cerrado y es del lenguaje. Los
  snippets propios del usuario ya los sirve el editor por su cuenta y no se tocan.
- **`contributes.snippets` en el manifiesto** (§3.1), y con él cualquier andamiaje que solo
  funcione en VS Code.
- **Cambiar lo que genera la CLI.** Las plantillas son la fuente; si una forma está mal, se
  arregla en SDD-22 y este catálogo la hereda.
- **Reconfigurar Emmet.** Se fusiona con él, no se le quita nada ni se le añade.
- **Completado dentro del tag** (props, valores, uniones): es la proyección de SDD-23 y ya
  funciona.
- **Snippets sobre selección** (envolver un bloque en un `@if`), que es un *code action*, no un
  completado.
- **Traducir labels y detalles.** Van en inglés, como todo el código.

---

## 9. Riesgos

| Riesgo | Mitigación |
|---|---|
| Relajar el contexto de tag mata a Emmet | Invariante de §5.3 (fusión, no sustitución) + criterio 11, que falla contra la implementación ingenua. |
| El catálogo y las plantillas de la CLI divergen | Criterio 2: igualdad byte a byte contra `renderTemplate`, con `@fudic/cli` ya aliaseada en Vitest. |
| El ancla del `<link>` diverge de la de la CLI | Se comparte el código (§3.3), y el criterio 13 comprueba los dos caminos sobre el mismo corpus. |
| Un cuerpo de snippet no compila | Criterios 3 y 6: cada cuerpo se materializa y se pasa por el parser. Un snippet que produce un fichero en rojo es peor que no tenerlo. |
| Demasiado ruido en la lista | Las puertas de §5.2 y `sortText`: en markup solo entran control de flujo, directivas del rol y tags; en `@code`, solo zonas. |
| El `$` de un cuerpo se interpreta como tabstop | Regla de escape en el catálogo y un test que afirma que todo `$` del cuerpo pertenece a un tabstop declarado. |
| Mudar `anchorFor` rompe la CLI | La mudanza es mecánica y `packages/cli/test/` ya cubre `--in` en los cuatro roles; SDD-22 §4.4 se anota con el destino nuevo. |
| El catálogo no llega al editor aunque el servicio lo devuelva | **Ocurrió** (§5.6). Lo caza el criterio 17, que solo existe sobre la conexión viva; el unitario es ciego a esto por construcción. |
| Marcar la proyección como `isAdditional` duplica a TypeScript | **Ocurrió también**, y es lo que el reparto tapaba: `USER_ECHO_CAPS` da un solo dueño a la zona neutra. Criterio 18. |
| Un snippet ofrecido donde no es legal | `placement`, y los criterios 3 y 6 pasan cada cuerpo por el parser en la posición que el catálogo dice. |
