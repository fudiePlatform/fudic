# SDD-21 — Layouts (`@RenderBody` · `@RenderHead` · `@section`)

> **Estado:** `Hecho` — los 16 criterios de §6 verdes.
> **Paquete:** `@fudic/compiler` (parser/documento/emit) + `@fudic/vite` (descubrimiento y grafo).
>
> **Se implementó en dos fases.** La **fase A** fue todo el compilador (keywords de SDD-04, los
> dos roles de documento en SDD-10, la regla semántica de SDD-12, la cadena de layouts y el emit
> compuesto), verificable entera con el emit standalone `.mjs`, sin Vite ni navegador: 15 de los
> 16 criterios. La **fase B** fue el criterio restante (§6.15) y se hizo **después** de que SDD-20
> aterrizara en `main`, porque esa spec reescribe `wrapper.ts`, `mode.ts` y `bootstrap.ts` y
> amplía `analyze.ts` — los ficheros de la integración. El troceado evitó escribir código contra
> interfaces que ya se sabía que iban a morir.
> **Depende de:** 05, 08, 10, 12, 15 (slice SSR-servidor), 19.
> **Rango de diagnósticos:** `FUD0420`–`FUD0449`.
> **Decisiones de gramática:** 81–90 (nuevas, `docs/gramar/gramatica-v1-decisiones.md` §12).
>
> **Qué añade en una frase.** Un tercer **rol de documento** —la *ruta*, un fragmento sin
> shell— y un **layout** que posee el shell (`<!DOCTYPE>`, `<html>`, `<head>`, `<body>`) y
> declara dónde se inserta la ruta con `@RenderBody()` / `@RenderHead()` / `@RenderSection(x)`.
>
> **Qué NO toca.** El módulo de ruta sigue exportando `page(data, io)` con la misma forma de
> generador: el wrapper `RenderChunk` de SDD-19 §4.3, el `RouteManifestFile`, `@fudic/transport`
> y el enlazador de SDD-20 **no se enteran de que existen los layouts**. La composición ocurre
> entera dentro del grafo de módulos, antes del `page`.

---

## 1. Contexto y objetivo

Hoy cada ruta es un documento HTML completo. `packages/compiler/fixtures/home.fud` empieza en
`<!DOCTYPE html>` y termina en `</html>`, y con ella se repiten en **cada** fichero de ruta el
`<meta charset>`, el `<meta viewport>`, el favicon, la hoja global, el `<script
src="/fudic-main.js">` que registra el Service Worker (sin el cual la ruta no renderiza en
navegación, SDD-19 §4.11.5) y la cabecera/pie visuales. Es repetición mecánica, y su modo de
fallo típico no es un error de compilación sino una **omisión silenciosa**: la ruta nueva que se
publica sin favicon, sin analítica o —peor— sin el bootstrap del SW.

El compilador ya tiene las dos mitades del mecanismo que falta:

- **La cascada del `<head>`** (decisiones 61/62): el `<head>`-fragment de un componente se eleva
  y deduplica en el `<head>` de la página consumidora. SDD-21 le pone un **punto de inserción
  nombrado** (`@RenderHead()`) y una capa base (el layout).
- **La composición por módulos ES** (SDD-15): un componente importa a otro y el grafo lo resuelve
  `resolveComponents` con `ResolveIo` inyectado. Un layout es **otro nodo de ese grafo**, con
  otra arista (`<link rel="layout">`) y otra dirección de composición: el componente lo importa
  quien lo usa; el layout **importa a quien lo usa**.

El objetivo es que el autor escriba el shell **una vez**, que la ruta escriba solo lo suyo
(su markup, su `<title>`, sus `<meta>` propios) y que el resultado servido sea **byte-idéntico**
al de la página monolítica equivalente.

**Principio rector.**

> **El layout posee el documento; la ruta posee el contenido.** Todo lo que hoy el emit
> hardcodea del shell (`<!DOCTYPE html>`, `<html lang="es">`, la apertura de `<head>` y de
> `<body>`, [`module.ts:244`](../../packages/compiler/src/emit/module.ts)) pasa a ser **texto de
> autor** en el layout. El emit deja de decidir el idioma de tu página.

---

## 2. Dependencias

| SDD | Estado exigido | Qué aporta |
|---|---|---|
| 05 | `Hecho` | `HtmlDocument`, `ElementNode`, `HtmlContent`, `Attribute`, `parseDocument`. El `mode` (decisión 51) se mantiene binario: **el parser no cambia** (§4.1). |
| 08 | `Hecho` | `CodeBlockNode`: el `@code` de una ruta y el de un layout se alojan igual que hoy. |
| 10 | `Hecho` | `structureDocument`, `ComponentDocument`, `PageDocument`, `isComponentLink`, `linkHref`. SDD-21 **amplía** esta pasada con dos variantes nuevas. |
| 12 | `Hecho` | La pasada semántica donde viven las reglas no sintácticas (unicidad de directivas, secciones huérfanas). |
| 15 (slice SSR-servidor) | `Hecho` | `resolveComponents`/`ComponentGraph`/`ResolveIo`, `emitPageModule(Mapped)`, `emitComponentModule(Mapped)`, `MarkupEmitter`, `CodeWriter`, `AssetLinker`, `STYLE_POLYFILL`. |
| 19 | `Hecho` | Routing por FS, `RenderChunk`, `componentSpecifier` inyectado, linker de assets, source maps, dev/preview. SDD-21 **no altera ninguna de sus interfaces**. |

> **Relación con SDD-20 (renderizado en el SW).** Ninguna. SDD-20 cambia *dónde* corre el chunk
> y *cómo* se enlaza (`new Function`, manifest v2, CSP con nonce); SDD-21 cambia *cómo se compone
> el módulo* antes de que exista el chunk. El punto de contacto es uno solo y es favorable: con
> layout, el `<script nonce>` del bootstrap y las entradas de `shell` viven en **un** fichero, no
> en N rutas.

---

## 3. Interfaz pública

Todo en inglés. Ubicación: `packages/compiler/src/document/` (nodos y estructura),
`packages/compiler/src/at/` (directivas), `packages/compiler/src/emit/` (resolución y emit).

### 3.1. Los dos roles de documento nuevos

```ts
/** A route: a body fragment that delegates its shell to a layout (decisions 81, 83). */
export interface RouteDocument extends Node {
  readonly type: 'route-document';
  /** The single `<link rel="layout" href>` that makes this file a route (decision 81). */
  readonly layoutLink: ElementNode;
  /** Its static `href`. Empty string when the href is absent or interpolated (degradation). */
  readonly layoutHref: string;
  /** `<link rel="component">`, any number (decision 55). */
  readonly links: readonly ElementNode[];
  /** The single `@code`, if present (decision 54). */
  readonly code?: CodeBlockNode;
  /** The `<head>` fragment: this route's head contributions (decisions 62, 88). */
  readonly head?: ElementNode;
  /** The body fragment. MULTIPLE roots allowed; no host wrapper (decision 83). */
  readonly markup: readonly HtmlContent[];
  /** `@section name { … }` blocks, in source order (decision 84). */
  readonly sections: readonly SectionNode[];
}

/** A layout: a page-shaped document that owns the shell and renders a route into it (decision 82). */
export interface LayoutDocument extends Node {
  readonly type: 'layout-document';
  readonly doctype: DoctypeNode;
  readonly html: ElementNode;
  readonly head: ElementNode;
  readonly body: ElementNode;
  readonly links: readonly ElementNode[];
  readonly code?: CodeBlockNode;
  /** Nested layout (decision 87): a layout may itself declare `<link rel="layout">`. */
  readonly layoutLink?: ElementNode;
  readonly layoutHref?: string;
  /** The single `@RenderBody()` (decision 86). Absent only on FUD0423 degradation. */
  readonly renderBody?: RenderDirectiveNode;
  /** The `@RenderHead()`, at most one (decision 86). */
  readonly renderHead?: RenderDirectiveNode;
  /** Every `@RenderSection(name)`, in source order. */
  readonly renderSections: readonly RenderSectionNode[];
}

export type StructuredDocument =
  | PageDocument
  | ComponentDocument
  | RouteDocument     // new
  | LayoutDocument;   // new
```

`structureDocument(source, doc)` conserva su firma; lo que cambia es el despacho (§4.1).

### 3.2. Los nodos de directiva

```ts
/** `@RenderBody()` / `@RenderHead()` — no arguments, parentheses mandatory (decision 85). */
export interface RenderDirectiveNode extends Node {
  readonly type: 'render-body' | 'render-head';
  /** Covers the identifier only, never the leading `@` (SDD-04 convention). */
  readonly keywordSpan: Span;
}

/** `@RenderSection(name)` — a bare identifier, never a string (decision 85). */
export interface RenderSectionNode extends Node {
  readonly type: 'render-section';
  readonly name: string;
  readonly nameSpan: Span;
  readonly keywordSpan: Span;
}

/** `@section name { … }` — declared in a route, rendered by its layout (decision 84). */
export interface SectionNode extends Node {
  readonly type: 'section';
  readonly name: string;
  readonly nameSpan: Span;
  readonly children: readonly HtmlContent[];
}
```

El parser de directivas se inyecta como los otros dos (SDD-05 §3), y su método es **opcional**
por la misma razón que lo es `atConstructs` entero: un consumidor que solo ejercita la gramática
HTML/control no tiene por qué saber que SDD-21 existe. Omitido ⇒ una directiva degrada a
`UnhandledConstructNode` + `FUD0055`, igual que un `parseControl` ausente.

```ts
export interface AtConstructParser {
  parseControl(ctx, keyword, keywordSpan): ParseResult<RazorConstruct>;
  parseCodeBlock(ctx, keywordSpan): ParseResult<RazorConstruct>;
  parseDirective?(ctx, directive: LayoutDirective, keywordSpan: Span): ParseResult<RazorConstruct>;
}
```

`TriggerResolution` (SDD-04) gana una variante; el conjunto cerrado de keywords gana cuatro
entradas:

```ts
export type LayoutDirective = 'RenderBody' | 'RenderHead' | 'RenderSection' | 'section';

export type TriggerResolution =
  | { readonly kind: 'control'; readonly keyword: ControlKeyword; readonly keywordSpan: Span }
  | { readonly kind: 'code-block'; readonly keywordSpan: Span }
  | { readonly kind: 'raw'; readonly expression: RazorExpression; readonly keywordSpan: Span }
  | { readonly kind: 'directive'; readonly directive: LayoutDirective; readonly keywordSpan: Span }  // new
  | { readonly kind: 'implicit'; readonly expression: RazorExpression };
```

### 3.3. Resolución del grafo

`resolveComponents` deja de ser suficiente: la entrada puede tener una **cadena de layouts** por
encima. Se generaliza sin romperla (sigue exportada e intacta para quien solo quiera componentes):

```ts
/** A layout reached through the `rel="layout"` chain, innermost first. */
export interface ResolvedLayout {
  readonly path: string;
  readonly source: string;
  readonly doc: LayoutDocument;
  /** This layout's own `<link rel="component">` hrefs. */
  readonly deps: readonly string[];
}

export interface DocumentGraph extends ComponentGraph {
  /** The layout chain of the entry, INNERMOST FIRST. Empty for a page/component entry. */
  readonly layouts: readonly ResolvedLayout[];
}

/**
 * Resolve the transitive graph from an entry `.fud`: its layout chain (decision 87) plus every
 * component reachable from the entry AND from every layout in the chain, keyed by tag.
 * Cycles in the layout chain are reported, never followed.
 */
export function resolveDocument(entryPath: string, io: ResolveIo): ParseResult<DocumentGraph>;
```

### 3.4. Emit

```ts
/** The layout module of `layout`, given the already-resolved graph. */
export function emitLayoutModule(graph: DocumentGraph, layout: ResolvedLayout, options?: EmitOptions): string;
export function emitLayoutModuleMapped(graph: DocumentGraph, layout: ResolvedLayout, options?: EmitOptions): EmitOutput;

/** The route module: `page(data, io)` that composes with its layout chain (§4.5). */
export function emitRouteModule(graph: DocumentGraph, options?: EmitOptions): string;
export function emitRouteModuleMapped(graph: DocumentGraph, options?: EmitOptions): EmitOutput;
```

`EmitOptions` gana un campo, hermano del `componentSpecifier` que SDD-19 §4.11.4 ya inyecta —
por la misma razón: el compilador no toca `node:path`.

```ts
export interface EmitOptions {
  // … existing fields …
  /** Module specifier under which a route imports its layout. Default: `./<basename><importExt>`. */
  readonly layoutSpecifier?: (layout: ResolvedLayout) => string;
}
```

### 3.5. Contrato del código emitido

**Es contrato**, no detalle: SDD-19/20 lo consumen.

```js
// _layout.fud → módulo de layout
export function* layout(data, io, route) { /* route = { head, body, section } */ }

// index.fud → módulo de ruta (MISMA forma pública que hoy)
export function* page(data, io) { … }
```

`route` es el objeto de slots que el layout recibe:

```ts
interface RouteSlots {
  /** The route's head contributions as an HTML string (decision 88). */
  head(): string;
  /** Append the route's body nodes under `$parent`, using the layout's own `$dom`. */
  body($dom: Dom<unknown>, $parent: unknown): void;
  /** Append section `name`, or nothing when the route does not declare it (decision 85). */
  section(name: string, $dom: Dom<unknown>, $parent: unknown): void;
}
```

---

## 4. Comportamiento

### 4.1. Los tres roles y su detección (decisión 81)

La decisión 51 (doctype ⇒ página, si no ⇒ componente) **se mantiene en el parser**: `doc.mode`
no cambia y `parser.ts` no se toca. El rol se afina en la pasada de estructura (SDD-10), que es
donde ya vive la clasificación:

| `doc.mode` | Hay `<link rel="layout">` en el top-level | Rol |
|---|---|---|
| `page` | no | `PageDocument` (hoy) |
| `page` | sí | `LayoutDocument` anidado (decisión 87) o `PageDocument` con layout — ver abajo |
| `component` | no | `ComponentDocument` (hoy) |
| `component` | sí | **`RouteDocument`** |

Un documento con doctype es un **shell**. Se clasifica como `LayoutDocument` si contiene
`@RenderBody()`; si no lo contiene, es una `PageDocument` normal (una ruta autónoma sin layout,
exactamente como hoy). Un `<link rel="layout">` en un documento con doctype declara el layout
**padre** de ese layout (anidamiento, decisión 87); en un documento sin doctype declara el layout
**de la ruta**.

> **Por qué la detección es sintáctica y no por convención de fichero.** El compilador es
> LSP-first y fs-free: abrir un `.fud` suelto en el editor debe bastar para saber qué es. Un
> `routes/_layout.fud` implícito por carpeta (estilo Next/Remix) haría que el rol dependiera de
> la ruta en disco, que el compilador no conoce. Queda **fuera de v1** (§7); si se añade, entra
> como *hint* inyectado por el plugin, que sí conoce `routesDir`.

**Orden top-level de una ruta (decisión 83)**, máquina de estados hermana de la de componente:

1. `<link rel="layout">` — **exactamente uno, el primero**. Un segundo → `FUD0420`.
2. `<link rel="component">` — cualquier número (55).
3. `@code` — a lo sumo uno (54); un segundo → `FUD0154` (código de SDD-10, sin duplicar).
4. `<head>`-fragment — a lo sumo uno (62).
5. markup + `@section` — **múltiples raíces permitidas**; **no** hay envoltorio host.

El punto 5 es la diferencia que justifica el rol nuevo: sin él, un fragmento de ruta caería en
modo componente y dispararía `FUD0156` ("falta el envoltorio host"). Un nodo fuera de fase →
`FUD0421`, con recuperación (se coloca igual en su campo).

### 4.2. Las directivas (decisiones 84–86)

Cuatro keywords nuevas en el conjunto cerrado de SDD-04. Se resuelven **siempre** (el resolvedor
del `@` no sabe en qué rol de documento está); su **validez posicional es semántica**, coherente
con la separación sintáctico/semántico del repo:

| Directiva | Dónde es válida | Cuántas |
|---|---|---|
| `@RenderBody()` | layout | exactamente 1 (falta → `FUD0423`; sobra → `FUD0424`) |
| `@RenderHead()` | layout, dentro de `<head>` | ≤ 1 (sobra → `FUD0424`; fuera de `<head>` → `FUD0431`) |
| `@RenderSection(name)` | layout | n, con nombre único (repetido → `FUD0428`) |
| `@section name { … }` | ruta, top-level | n, con nombre único (repetido → `FUD0428`) |

- **Paréntesis obligatorios y sin argumentos** en `@RenderBody()`/`@RenderHead()` (decisión 85):
  sin ellos, `@RenderBody` sería una expresión implícita válida (decisión 3, camino de
  propiedades) y el usuario obtendría el texto literal `RenderBody` en su página. La forma sin
  paréntesis → `FUD0432`.
- **`@RenderSection(name)` toma un identificador desnudo**, no un string: `@RenderSection(scripts)`.
  Es estáticamente resoluble por construcción, sin constant folding (contraste deliberado con la
  regla permisiva del bus, 28.c: aquí el nombre es estructura del documento, no dato). Un
  argumento que no sea identificador → `FUD0433`.
- **Ortografía fiel a Razor** (decisión 84): `@section` en minúscula porque es una keyword de
  bloque, como `@if`; `@RenderBody`/`@RenderHead`/`@RenderSection` en PascalCase porque en Razor
  son invocaciones. El PascalCase además hace imposible confundirlas con una keyword de control.
- **`@RenderHead()` ausente**: no es error. El emit inyecta las contribuciones de la ruta **al
  final del `<head>`** y emite `FUD0425` (warning). Postura permisiva; la posición explícita
  importa cuando el orden del head es significativo (CSP, `<base>`, preloads).
- **Sección declarada sin `@RenderSection` que la consuma** → `FUD0429` (warning): el contenido
  no aparece en la salida, y eso siempre es un bug del autor. **Sección renderizada que la ruta
  no declara** → silencio: no emite nada. Es el `required: false` de Razor por defecto.
- **El bloque `{ … }` de `@section` reutiliza los diagnósticos de SDD-06** (`FUD0071` sin `{`,
  `FUD0072` sin cerrar): es la misma regla y el autor merece leer un solo mensaje, no dos.
  `FUD0433` cubre las dos formas de argumento inválido — `@RenderSection` sin identificador
  desnudo y `@RenderBody`/`@RenderHead` con argumentos que no toman.
- **Un `@section` anidado** (dentro de markup, en vez de nodo top-level de la ruta) → `FUD0421`,
  y **no** entra en `sections`: emitirlo en su sitio y en el punto del layout lo duplicaría.

### 4.3. Datos: el layout no declara `load` (decisión 89)

En v1 el layout **no** exporta `load()`. Recibe el `data` de la ruta, en solo lectura, como
primer parámetro de `layout(data, io, route)`. Consecuencias, todas buscadas:

- La **inferencia de modo SSG** de SDD-19 §4.2 no cambia: un layout no puede volver dinámica una
  ruta estática, y no hay que decidir si el `data` del layout entra en la clave de caché.
- No hay doble `load` por petición ni orden de resolución que especificar.
- El caso que Razor cubre con `ViewBag.Title` **no necesita nada**: la ruta escribe
  `<title>@data.title</title>` en su `<head>`-fragment y sube por `@RenderHead()`, tipado y en su
  sitio. Es estrictamente mejor que el diccionario sin tipo de Razor.

Un layout **sí** puede tener `@code` con zona neutra y `@client` (una cabecera interactiva es un
caso normal), y puede declarar `<link rel="component">` propios. Lo que no puede es cargar datos
de servidor por su cuenta. Un `export function load` dentro de un `@server` de layout →
`FUD0430`. La vía v1 para una cabecera con datos es un componente con los suyos, o el `load` de
la ruta.

### 4.4. La cascada del `<head>` (decisión 88)

`@RenderHead()` marca el punto donde se inserta, **en este orden**:

1. Los elementos del `<head>`-fragment de la **ruta**, verbatim, en orden de fuente
   (`<title>` interpolado, como hoy en [`module.ts`](../../packages/compiler/src/emit/module.ts)).
2. El polyfill de adopción de estilos (SDD-18 §5), **una sola vez**.
3. Los `<style type="module" specifier="<tag>">` de la **unión** de componentes del layout y de
   la ruta, deduplicados por tag.

Los elementos propios del `<head>` del layout salen donde el autor los escribió, alrededor de ese
punto. **Deduplicación v1, mínima y explícita:** `<title>` y `<meta name=X>` deduplican y **gana
la ruta** (la capa más interna); todo lo demás concatena en orden. Nada más: sin dedupe por
`href`, sin normalización de URLs. Es lo que la decisión 61 promete ("el compilador eleva y
deduplica") acotado a lo que se puede hacer sin adivinar.

El polyfill sigue emitiéndose **antes de que el cuerpo empiece a fluir**, invariante de SDD-18 §5
que la composición no puede romper: como vive en el `<head>` del layout y el layout cede su
`<head>` en el primer trozo, se cumple por construcción.

### 4.5. Composición del emit (el corazón)

**Regla dura: se compone a nivel de módulo ES, nunca de texto.** `SourceMapBuilder` es de una
sola fuente (`sources = [options.source]`, SDD-13 §4.3); fusionar layout y ruta en un módulo de
salida exigiría source maps multi-fuente. Componiendo por módulos, **cada módulo conserva una
fuente y un map**, y Vite enlaza el grafo gratis, igual que con los componentes.

Módulo de layout:

```js
import { render as $app_nav } from './app-nav.fud';
import { STYLE_POLYFILL } from …;

export function* layout(data, io, route) {
  const { createDom, serialize, escapeText } = io;
  let head = '';
  head += '  <meta charset="utf-8">\n';          // head propio del layout, verbatim
  head += route.head();                           // ← @RenderHead()
  head += '  <link rel="icon" href="…">\n';
  yield '<!DOCTYPE html>\n<html lang="es">\n<head>\n' + head + '</head>\n';
  const $dom = createDom();
  const $body = $dom.element('body');
  /* … markup del layout … */
  route.body($dom, $body);                        // ← @RenderBody()
  /* … markup del layout … */
  route.section('scripts', $dom, $body);          // ← @RenderSection(scripts)
  yield* serialize($body);
  yield '\n</html>\n';
}
```

Módulo de ruta:

```js
import { layout } from './_layout.fud';
import { render as $app_card } from '../components/app-card.fud';

export function* page(data, io) {
  yield* layout(data, io, {
    head: () => …,                                 // §4.4, incluye polyfill + style modules
    body: ($dom, $parent) => { … },                // el MarkupEmitter de hoy, con $parent inyectado
    section: (name, $dom, $parent) => { … },
  });
}
```

Cuatro consecuencias que hay que subrayar:

- **`page(data, io)` conserva su forma exacta.** El wrapper `RenderChunk` de SDD-19 §4.3
  (`import { page } from './<page>.fud'`), el `.html` de modo 1 (§4.4) y el enlazador de SDD-20
  siguen funcionando sin un solo cambio.
- **Un solo `$dom` y un solo árbol.** La ruta **no** construye su propio `$body`: aporta sus
  nodos bajo el `$parent` que el layout le pasa. Es exactamente lo que
  `MarkupEmitter.emit(child, '$body')` ya hace, con el destino parametrizado. Se serializa una
  vez, así que `serializeChunks` y el backpressure de SDD-19 §4.3 se conservan intactos.
- **El streaming mejora.** El `<head>` que se cede en el primer trozo es el del layout, que es
  precisamente la parte estable de la página.
- **Anidamiento sin caso especial** (decisión 87): un layout con `<link rel="layout">` se compila
  con la misma pieza — el layout externo recibe como `route` los slots del interno. La cadena se
  compone de dentro afuera. Un ciclo → `FUD0422`, detectado como ya lo hace `resolveComponents`
  con su `Map` de visitados.

### 4.6. Qué cambia en el emit de página existente

Nada para una `PageDocument` sin layout: `emitPageModule` se queda como está, y todas las rutas
actuales siguen compilando igual (criterio §6.3). `emitRouteModule` es una función nueva; el
plugin despacha por el `type` del documento estructurado.

Lo único que se refactoriza de lo existente es el **destino del markup**: `MarkupEmitter` recibe
hoy el nombre de la variable padre (`'$body'`, `'$shadow'`), así que ya está parametrizado.

### 4.7. Lo que ve el plugin (SDD-19)

- **Descubrimiento:** un `.fud` bajo `routesDir` es una ruta si su documento estructurado es
  `PageDocument` **o `RouteDocument`**. Un `LayoutDocument` **nunca es una ruta**, viva donde
  viva (ni siquiera bajo `routesDir`): entra por la arista `rel="layout"`, igual que un
  componente entra por `rel="component"`. Un `LayoutDocument` bajo `routesDir` al que nadie
  apunta → `FUD0434` (warning: layout huérfano).
- **Specifier:** `layoutSpecifier` se inyecta desde el importador, exactamente como
  `componentSpecifier` (SDD-19 §4.11.4). Un `layouts/` compartido fuera de `routesDir` resuelve
  desde cualquier profundidad.
- **Invalidación en dev:** editar un layout invalida **todas** las rutas de su cadena. El plugin
  ya mantiene el grafo inverso para los componentes; el layout es otra arista del mismo grafo.
- **Assets:** el `AssetLinker` corre por módulo, así que el favicon del layout se hashea una vez
  y no una por ruta. Efecto colateral favorable, sin código nuevo.

---

## 5. Invariantes LSP

- **Spans en todo.** `RouteDocument`, `LayoutDocument` y los tres nodos de directiva llevan
  `Span`; los nodos reubicados conservan el suyo de SDD-05.
- **Nunca lanza.** `<link rel="layout">` duplicado, `@RenderBody()` ausente o repetido, cadena de
  layouts cíclica, layout que no es layout → documento degradado + diagnóstico. `resolveDocument`
  devuelve `ParseResult<DocumentGraph>`, nunca excepción, aunque un `href` no exista.
- **El parser no cambia.** El rol se decide en la pasada de estructura; `parseDocument` y su
  detección de modo (decisión 51) quedan intactos. Un fichero de ruta abierto suelto en el editor
  se estructura sin leer el disco: el `rel="layout"` es una declaración local.
- **Una fuente por módulo.** Cada módulo emitido mapea a **su** `.fud` y a ninguno más (§4.5).
  Un error en el layout navega al `_layout.fud`; uno en la ruta, a la ruta.
- **Determinismo.** Misma cadena de layouts ⇒ mismo orden de head, mismo orden de style modules
  (unión ordenada por primer descubrimiento), mismo output byte a byte.
- **Composición transparente aguas abajo.** `page(data, io)`, `RenderChunk`, `RouteManifestFile`,
  `@fudic/transport` y el enlazador de SDD-20 no cambian. Verificable por construcción: el test
  del criterio §6.12 usa el wrapper de SDD-19 sin tocarlo.

### Catálogo de diagnósticos (`FUD0420`–`FUD0449`)

| Código | Nivel | Regla |
|---|---|---|
| `FUD0420` | error | Más de un `<link rel="layout">` en el documento (decisión 81). |
| `FUD0421` | error | Orden top-level inválido en una ruta: layout/links/code/head/markup desordenados (decisión 83). |
| `FUD0422` | error | Cadena de layouts cíclica (decisión 87). |
| `FUD0423` | error | Layout sin `@RenderBody()` — un layout que no renderiza su ruta no es un layout (decisión 86). |
| `FUD0424` | error | Directiva repetida: más de un `@RenderBody()` o más de un `@RenderHead()` (decisión 86). |
| `FUD0425` | warning | Layout sin `@RenderHead()`: las contribuciones de la ruta se inyectan al final del `<head>` (decisión 86). |
| `FUD0426` | error | `@RenderBody`/`@RenderHead`/`@RenderSection` fuera de un layout (decisión 84). |
| `FUD0427` | error | `@section` fuera de una ruta (decisión 90). |
| `FUD0428` | error | Nombre de sección repetido: dos `@section x` o dos `@RenderSection(x)` (decisión 86). |
| `FUD0429` | warning | `@section x` que ningún `@RenderSection(x)` de la cadena consume: el contenido no sale (decisión 86). |
| `FUD0430` | error | El `@server` de un layout exporta `load` — no soportado en v1 (decisión 89). |
| `FUD0431` | error | `@RenderHead()` fuera del `<head>` del layout (decisión 86). |
| `FUD0432` | error | `@RenderBody`/`@RenderHead` sin paréntesis (decisión 85). |
| `FUD0433` | error | `@RenderSection` con argumento que no es un identificador desnudo (decisión 85). |
| `FUD0434` | warning | Layout al que ninguna ruta apunta (huérfano). |
| `FUD0435` | error | `<link rel="layout">` que apunta a un fichero que no es un layout (decisión 82). |
| `FUD0436` | error | `href` de `<link rel="layout">` ausente o interpolado: debe ser estático (decisión 81). |
| `FUD0437`–`FUD0449` | — | Reservados. |

**Quién emite qué.** Los códigos decidibles con un solo fichero (`FUD0420`, `0421`, `0424`–`0428`,
`0431`, `0436`) los emite la pasada de estructura (SDD-10); los que exigen ver **dos** ficheros
(`FUD0422` ciclo, `FUD0423` el destino no tiene `@RenderBody()`, `FUD0429` sección huérfana,
`FUD0435` el destino no es un layout) los emite `resolveDocument`, que es quien conoce la cadena.
`FUD0430` es del analizador semántico (SDD-12), porque mira el `@server`. Un diagnóstico de
`resolveDocument` se ancla en el `<link>` que lo provoca —que puede vivir en un layout y no en la
entrada—, así que el mensaje **nombra el fichero**; el host (SDD-19) lo mapea al abrirlo.

---

## 6. Criterios de aceptación

Fixtures nuevos en **`packages/compiler/test/fixtures/`**: `_layout.fud` (layout), `blog.fud`
(ruta con layout), `_layout-admin.fud` (layout anidado) y `blog-monolithic.fud` (la página
equivalente, para §6.10). **No** van en `packages/compiler/fixtures/`: ese directorio hace además
de `routesDir` en los tests de SDD-19, que lo escanean **recursivamente** y tratan como ruta todo
fichero con doctype — un layout no es una ruta (§4.7) y una página de comparación tampoco. El SDD
está `Hecho` cuando:

1. **Typecheck.** `pnpm typecheck` pasa con §3 definido y reexportado desde `src/index.ts`.

2. **Estructura de ruta (81, 83).** `blog.fud` (`<link rel="layout" href="./_layout.fud">` +
   `<link rel="component">` + `@code` + `<head><title>@data.title</title></head>` + markup con
   **dos** raíces + `@section scripts { … }`) ⇒ `RouteDocument` con `layoutHref ===
   './_layout.fud'`, `links.length === 1`, `code` presente, `head` presente, `markup.length === 2`,
   `sections` = `[{ name: 'scripts' }]`. **Sin** `FUD0156` (no se exige envoltorio host).

3. **No hay regresión (51).** `home.fud` sigue dando `PageDocument` y `app-card.fud` sigue dando
   `ComponentDocument`, con los mismos campos y sin diagnósticos nuevos. El fichero sin doctype y
   sin `rel="layout"` sigue exigiendo envoltorio host (`FUD0156`).

4. **Estructura de layout (82).** `_layout.fud` ⇒ `LayoutDocument` con `doctype`/`html`/`head`/
   `body`, `renderBody` presente con su span, `renderHead` presente, `renderSections` =
   `[{ name: 'scripts' }]`. Un documento con doctype **sin** `@RenderBody()` sigue siendo
   `PageDocument`.

5. **Unicidad de directivas (86).** Layout sin `@RenderBody()` ⇒ `FUD0423`. Con dos ⇒ `FUD0424`
   (el primero se conserva). Sin `@RenderHead()` ⇒ `FUD0425` (warning) y el head de la ruta
   aparece al final del `<head>` del output.

6. **Posición de las directivas (84, 90).** `@RenderBody()` en `home.fud` (página) o en
   `app-card.fud` (componente) ⇒ `FUD0426`. `@section x { … }` en un layout o en un componente ⇒
   `FUD0427`.

7. **Forma de las directivas (85).** `@RenderBody` sin paréntesis ⇒ `FUD0432` (y el texto no
   aparece literal en la salida). `@RenderSection("scripts")` (string) ⇒ `FUD0433`.
   `@RenderSection(scripts)` ⇒ válido.

8. **Secciones (86).** `@section scripts` sin `@RenderSection(scripts)` en la cadena ⇒ `FUD0429`
   (warning) y el contenido **no** sale. `@RenderSection(footer)` sin `@section footer` ⇒ sin
   diagnóstico y sin salida. Dos `@section scripts` ⇒ `FUD0428`.

9. **Resolución del grafo (87).** `resolveDocument('blog.fud', io)` ⇒ `layouts.length === 1` y
   `components` = unión de los del layout y los de la ruta, sin duplicados por tag. Con
   `_layout-admin.fud` ⇒ `layouts.length === 2`, **innermost first**. Un `rel="layout"` cíclico ⇒
   `FUD0422` sin recursión infinita. Un `rel="layout"` a un `.fud` que es componente ⇒ `FUD0435`.
   Un `href` interpolado ⇒ `FUD0436`.

10. **Equivalencia de output (el criterio central).** El HTML servido de `blog.fud` + `_layout.fud`
    y el de la página monolítica equivalente (`blog-monolithic.fud`, mismo contenido en un solo
    fichero, mismo `data`, mismos componentes) son **el mismo documento**. Ambos módulos se
    **ejecutan** y se comparan: el `<head>` **byte a byte**, y el documento entero tras normalizar
    el whitespace entre etiquetas. Esa normalización no es una rebaja del criterio sino su forma
    correcta: el whitespace de indentación es texto del fichero fuente, y **dos ficheros distintos
    no pueden compartirlo por construcción** — la ruta indenta desde su margen y la página desde
    dentro de su `<main>`. Todo lo que sí es comparable byte a byte (el head entero, que se
    construye por concatenación de strings) se compara byte a byte.

11. **Cascada del `<head>` (88).** Con `<title>Sitio</title>` en el layout y
    `<title>@data.title</title>` en la ruta, el output lleva **un solo** `<title>`, el de la ruta.
    Un `<meta name="description">` en ambos ⇒ el de la ruta. Un `<link rel="stylesheet">` en ambos
    ⇒ los dos, en orden layout→ruta. El polyfill de SDD-18 aparece **una vez** y **antes** del
    primer byte del cuerpo. Los `<style type="module">` son la unión de ambos grafos, sin
    duplicados.

12. **Contrato aguas abajo intacto.** El módulo de `blog.fud` exporta `page(data, io)` generador;
    pasado al wrapper `RenderChunk` de SDD-19 §4.3 **sin modificarlo**, produce un
    `ReadableStream<Uint8Array>` cuyo **primer trozo contiene el `<head>` completo** y el
    `</head>`, antes de que el cuerpo se haya serializado (§6.8b de SDD-19, re-verificado con
    layout).

13. **Datos (89).** `layout(data, io, route)` recibe el `data` de la ruta: un `@data.title` usado
    en el markup del layout interpola el valor de la ruta. Un `export function load` en el
    `@server` de un layout ⇒ `FUD0430`.

14. **Source maps.** El módulo de layout mapea a `_layout.fud` y el de ruta a `blog.fud`; un error
    lanzado desde el markup del layout apunta, vía `.map`, a la posición correcta del
    `_layout.fud`. Ningún módulo emitido tiene más de una entrada en `sources`.

15. **Integración con el plugin (SDD-19).** En un proyecto con `routes/index.fud` (ruta con
    layout) y `layouts/_layout.fud`: la ruta se descubre y se publica en el manifest; el layout
    **no** produce ruta ni entrada de manifest, viva donde viva; `vite build` escribe el `.html`
    de modo 1 con el shell del layout; en dev, editar el layout invalida la ruta. Un layout bajo
    `routesDir` al que nadie apunta ⇒ `FUD0434`.

    **La invalidación en dev no se implementa: se hereda.** El módulo de ruta *importa* el módulo
    de layout, así que la arista está en el grafo de Vite y es el mismo mecanismo que ya
    invalida una página cuando cambia uno de sus componentes. El criterio se verifica leyendo
    `ssrImportedModules` de la ruta tras servirla — comprobar la arista, no reimplementarla.

16. **Cobertura.** Cumple el suelo del SDD-00 (80/80/75); los módulos nuevos de estructura y de
    directivas, cerca del 100 % (las máquinas de estados y sus degradaciones están cubiertas por
    los criterios de arriba).

---

## 7. Fuera de alcance

- **Layout con `load()` propio** (decisión 89). Abre la puerta a repensar la inferencia de modo
  SSG de SDD-19 §4.2 y la clave de caché; se aísla en un SDD posterior si un caso real lo pide.
- **Convención `_layout.fud` implícita por carpeta** (estilo Next/Remix). Rompe la decidibilidad
  sintáctica del rol (§4.1). Si entra, será como *hint* inyectado por el plugin, no como regla de
  gramática.
- **Hidratación del layout.** El markup del layout se emite SSR, como el de la página. La rama
  cliente de SDD-15 sigue en pausa (SDD-19 §7); cuando aterrice, un layout es un módulo más y su
  `@client` se trata igual que el de una página. Ninguna decisión de este SDD la prejuzga.
- **`@section` en componentes.** Los componentes ya tienen `<slot>` (DSD estándar): dos mecanismos
  de proyección compitiendo sería un error de diseño. `@section` es exclusivo del par ruta↔layout.
- **`@RenderPage` / partials de Razor.** No aplican: los componentes cubren el caso, con scope de
  estilos y hidratación propios.
- **Dedupe de head más allá de `<title>` y `<meta name>`** (§4.4): sin normalización de URLs, sin
  dedupe por `href`, sin ordenación por prioridad (preloads).
- **Atributos del `<body>`.** El layout emite su `<html>` verbatim, pero el `<body>` se fabrica
  con `$dom.element('body')` sin atributos — exactamente lo que el emit de página hace hoy. Un
  `<body class="…">` no llega a la salida en **ninguno** de los dos caminos; arreglarlo es un
  cambio de SDD-15 que debe hacerse en ambos a la vez, o la equivalencia de §6.10 se rompe.
- **Layouts por aplicación / multi-app.** El mecanismo lo soporta (un layout es un fichero al que
  cualquier ruta puede apuntar, esté donde esté, incluso en otro paquete del workspace), pero la
  **organización** multi-app —varios `routesDir`, varios manifests, varios SW— es asunto del
  plugin y de un SDD propio.
