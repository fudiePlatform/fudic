# SDD-49 — El CSS que cada página usa

> **Estado:** `Listo` — segunda redacción (2026-10-01), pendiente de la revisión de Pedro.
> **Paquetes:** `@fudic/compiler` (el árbol de reglas, los selectores, el aplanado de `@import`,
> la superficie de cada ámbito, la poda de reglas y de tokens, y el emit por página) ·
> `@fudic/vite` (el nombre de cada hoja podada, el servidor de dev, el shell y los diagnósticos
> de proyecto) · `@fudic/formatter`, `@fudic/language-core` y `@fudic/language-server` (el
> `<style>` como CSS plano, §4.12) · `@fudic/example-basic` (la evidencia y la medición)
> **Depende de:** 09, 18, 19, 21, 29, 34, 39, 42, 43, 45, 46, 48, BUG-45
> **Rango de diagnósticos:** `FUD0850`–`FUD0869`
> **Decisiones de gramática:** **136** — el cuerpo de un `<style>` es CSS plano. **Revoca la 42**
> («Razor activo dentro de `<style>`») y sus 42.a–c (§4.12).
> **Naturaleza:** compilador + build. Del parser de `.fud` solo toca el cuerpo de `<style>`, que
> deja de leer Razor (§4.12). No toca el runtime ni el polyfill.
>
> **Qué añade en una frase.** Cada página recibe, de cada hoja que le llega —las que enlaza su
> layout o su ruta con todo lo que importan, las `globalStyles` y las `styles`—, solo las reglas
> que pueden aplicarse a algún elemento de esa página y solo los tokens que algo de esa página
> usa.

> **Segunda redacción.** La primera conservaba los `@import` sin seguirlos (`FUD0850`: «llega
> entero») y no tocaba nunca las custom properties («los tokens de `:root` llegan todos»). Las
> dos cosas iban contra el caso que justifica este SDD. Una guía de estilos real se escribe en
> **un fichero por tema** —reset, tokens de color, de espaciado, tipografía, listas, tablas,
> formularios— reunidos con `@import` en uno principal; y en esos ~12 KB la mayor parte son
> **tokens**: cien colores de los que una página usa cincuenta, veinte espaciados de los que usa
> diez. Una poda que respeta los `@import` y los tokens deja fuera justo lo que pesa. Ahora el
> `@import` de una hoja del documento **se aplana** (§4.2) y los tokens **se podan por uso**
> (§4.6). En las hojas que se adoptan, `@import` es **error** (§4.1).

> **Se quita el Razor del CSS — decisión 136, que revoca la 42.** Decisión de Pedro
> (2026-10-01), y se hace **en este SDD**: el cuerpo de un `<style>` deja de ser CSS-con-Razor y
> pasa a ser **CSS plano** (§4.12). No aporta nada que no den `class:`, `style:` y los atributos
> del markup, y un `var(--x-@(y))` nombraría un token que ningún análisis estático puede ver: la
> poda de tokens (§4.6) lo quitaría.

---

## 1. Contexto y objetivo

### 1.1. Lo que hay hoy

Una página recibe CSS por tres caminos:

| Camino | Dónde se declara | Cómo llega | Ámbito donde se aplica |
|---|---|---|---|
| **Hojas del documento** | `<link rel="stylesheet">` en el `<head>` de un layout o de la ruta | Un fichero con hash (SDD-19), o dentro de la página con `?inline` (SDD-45 §3.6) | El light DOM del documento |
| **`globalStyles`** | `fudic.json` (SDD-46) | `<style type="module" specifier>` en el `<head>` | El shadow root de **todo** componente |
| **`styles`** | `fudic.json`, elegidas en `shadowrootadoptedstylesheets` | Igual | El shadow root de quien las elige |

SDD-46 §4.3 ya resuelve la granularidad de **hoja**: una `styles` que ningún componente de la
página elige no se sube a esa página ([transform.ts](../../packages/vite/src/transform.ts),
`styleOptions`). Lo que ninguna spec resuelve es la granularidad de **regla** y de **token**: una
hoja que sí llega, llega entera.

Y hay dos defectos en lo que llega:

- **Un `@import` relativo en una hoja enlazada no funciona.** `LinkedAssets` publica los bytes de
  la hoja que nombra el `<link>` y nada más; el fichero importado no se publica, y el `@import`
  apunta, desde `assets/`, a una ruta que no existe.
- **Un `url()` relativo en una hoja enlazada tampoco.** La copia vive en `assets/<base>-<hash>.css`
  y el `url(../fonts/x.woff2)` que escribió el autor se resuelve contra esa carpeta, no contra la
  del fichero original.

### 1.2. Por qué se puede hacer bien aquí

Podar CSS en una aplicación con estilos globales es heurística. Cualquier script puede poner
cualquier clase en cualquier sitio, y herramientas como PurgeCSS se equivocan en los dos
sentidos. En fudic no, por cuatro razones:

- **El markup es estático.** Todo elemento que una página puede llegar a tener está en un
  `.fud` del grafo que el compilador ya resuelve (`resolveDocument`), con todas las ramas de
  `@if`, `@switch` y `@foreach`, rendericen o no en el servidor.
- **Las clases son estáticas.** `class=` es un string (decisión 22), y `class:foo=@x` escribe
  el nombre `foo` en el código aunque la condición sea falsa.
- **Los ámbitos están cerrados.** Una hoja adoptada solo alcanza el shadow root que la adopta,
  y una hoja del documento solo alcanza el light DOM. Un `h1` que vive dentro de un componente
  **no** justifica conservar el `h1` del reset del documento, porque ese CSS nunca le llega.
- **Los nombres de los tokens son estáticos.** Sin Razor en el CSS (decisión 136, §4.12), todo
  `var(--x)` que existe está escrito con su nombre en un fichero del grafo: una hoja, el
  `<style>` de un componente o un `style="…"` del markup.

Una excepción que hay que tener presente: **las custom properties sí cruzan el shadow
boundary**, porque se heredan. Un token de `:root` en una hoja del documento lo consume el
`<style>` de un componente. Por eso las reglas se podan **por ámbito** y los tokens **por
página**, mirando todos los ámbitos a la vez (§4.6).

`classList`, `innerHTML`, `style.setProperty` y `getPropertyValue` escritos a mano por el autor
no se contemplan: fudic no se construye para eso (§7).

### 1.3. El objetivo

- Una hoja del documento puede `@import`-ar otras, y el compilador las **aplana** en una sola
  con el orden de cascada que tendrían en el navegador.
- Cada hoja se poda **por página**: sus reglas contra la **superficie** del ámbito donde se
  aplica y sus tokens contra el **uso** en toda la página.
- La poda es **conservadora**: puede dejar reglas o tokens de más, nunca quitar algo que pueda
  aplicarse.
- La hoja enlazada con `<link>` sigue siendo un fichero, pero **uno por contenido podado**: dos
  páginas que usan lo mismo comparten fichero y caché.
- Se poda también en `vite dev`: lo que se ve en desarrollo es lo que se despliega.

### 1.4. El caso que lo ordena todo

Una guía escrita como se escribe una de verdad:

```css
/* src/styles/main.css — lo enlaza _layout.fud con ?inline */
@import "./reset.css";
@import "./tokens/color.css";     /* 100 custom properties en :root, y su modo oscuro */
@import "./tokens/space.css";     /* 20 */
@import "./typography.css";       /* h1…h6, p, small, code */
@import "./lists.css";
@import "./tables.css";
@import "./inputs.css";
```

Y una página de login que solo usa componentes envoltorio (`<x-input>`, `<x-button>`):

- `main.css` se aplana con sus siete ficheros y se poda contra el light DOM de la página.
- Los `<input>`, `<label>` y `.field` viven dentro del template de `<x-input>`: no están en la
  superficie del documento. **Todas las reglas de `inputs.css` se van**, y con ellas los tokens
  que solo usaban ellas. Lo mismo `tables.css`. `h6` se va si nadie escribe un `h6`.
- De los cien colores llegan los que usan las reglas que quedan, los `<style>` de los
  componentes de la página y los `style=` del markup, más los que esos tokens nombran a su vez.
- Si `<x-input>` adopta `inputs.css` por `styles`, esa copia se poda por separado contra su
  template, que es donde se aplica. Que el mismo fichero llegue por dos caminos no es un
  problema: son dos ámbitos y cada uno se decide solo.
- Un `<input>` nativo que la página proyecta en un slot **sí** está en el light DOM, y su regla
  se queda: el documento lo estiliza.

---

## 2. Dependencias

**SDD-09.** `parseStyle`: el cuerpo de un `<style>` como runs planos —texto CSS, expresiones,
comentarios Razor y `@@`—. Este SDD revoca la decisión 42 y deja el cuerpo en **un solo run de
texto CSS** (§4.12). No construye árbol de reglas (§7 de SDD-09), así que este SDD añade uno
**para CSS plano**. Las hojas que se podan son
siempre `.css` de fichero, nunca un `<style>` de componente; el `<style>` de un componente solo
se **lee**, para saber qué tokens consume.

**SDD-18 y BUG-45.** La hoja adoptada es un `<style type="module" specifier>` del documento, y
un componente creado en el navegador construye la suya **leyendo ese elemento**. Así que el
cliente recibe la versión podada sin cambiar nada del runtime. Y es una hoja **construida**:
`CSSStyleSheet.replace()`/`replaceSync()` no admiten `@import`, que es por qué ahí es error.

**SDD-19.** `AssetLinker`: un `href` relativo se enlaza y su URL la decide el host
(`AssetUrl`). `LinkedAssets` en Vite nombra por hash de los bytes
(`assets/<base>-<hash>.css`) y mete en el shell lo enlazado desde un `<head>`.

**SDD-21 y SDD-48.** La ruta y el layout se componen **por módulo ES**: el layout se compila
una vez y lo comparten todas sus rutas. El layout ya pregunta a la ruta lo que no puede saber
(`route.head()`, `route.runtime(inline)`). El body de un layout es marcado y puede renderizar
componentes y snippets.

**SDD-29.** `@snippet` / `@render`: el marcado de un snippet vive donde se renderiza.

**SDD-34.** El compilador añade atributos a los controles (`aria-describedby`, `aria-live`,
`tabindex`, ids de marcador) y `@fudic/forms` escribe `aria-invalid` y `aria-label` en runtime.

**SDD-42, SDD-43 y SDD-46.** `ProjectStyle`, `EmitOptions.projectStyles` y `styleChains`: qué
hojas de proyecto se suben a un documento y qué adopta cada tag. El plugin lee las hojas de
`fudic.json` y diagnostica sobre ellas una vez por hoja (`FUD0743`).

**SDD-45 §3.6.** `href="…css?inline"` mete la hoja en la página con su nonce (`inlineStyleExpr`,
`AssetLinker.textOf`).

---

## 3. Interfaz pública

### 3.1. El árbol de reglas — `@fudic/compiler`, `src/css/rules.ts`

CSS plano: ni Razor ni `@` de fudic. Todo nodo lleva su `Span` sobre el texto de la hoja. Nunca
lanza.

```ts
export interface CssRuleTree extends Node {
  readonly type: 'css-sheet';
  readonly rules: readonly CssRule[];
}

export type CssRule = StyleRule | BlockAtRule | StatementAtRule;

/** `nombre: valor`, sin el `;`. */
export interface CssDeclaration extends Node {
  readonly type: 'css-declaration';
  /** En minúsculas; el de una custom property (`--x`) tal cual, porque distingue mayúsculas. */
  readonly name: string;
  readonly value: Span;
}

/** `selector { declaraciones; reglas anidadas }` */
export interface StyleRule extends Node {
  readonly type: 'style-rule';
  readonly prelude: Span;
  /** Las declaraciones propias, sin las reglas anidadas. */
  readonly declarations: readonly CssDeclaration[];
  /** CSS nesting: las reglas escritas dentro del bloque. */
  readonly children: readonly CssRule[];
}

/** `@media …{ }`, `@supports`, `@container`, `@layer x { }`, `@scope`, `@keyframes`, `@font-face`… */
export interface BlockAtRule extends Node {
  readonly type: 'at-block';
  readonly name: string;           // sin la @, en minúsculas
  readonly prelude: Span;
  readonly body: Span;
  /** Presente cuando el cuerpo contiene reglas (`@media`); ausente cuando no (`@font-face`, `@keyframes`). */
  readonly children?: readonly CssRule[];
}

/** `@import …;`, `@layer a, b;`, `@charset`, `@namespace` */
export interface StatementAtRule extends Node {
  readonly type: 'at-statement';
  readonly name: string;
  readonly prelude: Span;
}

export function parseCssRules(css: string): ParseResult<CssRuleTree>;
```

### 3.2. Los selectores — `src/css/selectors.ts`

```ts
export type Combinator = ' ' | '>' | '+' | '~';

export interface CompoundSelector {
  readonly type?: string;                  // en minúsculas; ausente = `*` o sin tipo
  readonly classes: readonly string[];
  readonly ids: readonly string[];
  readonly attributes: readonly { readonly name: string; readonly value?: string }[];
  /** `:is()` / `:where()` / `:matches()`: basta con que case uno de sus argumentos. */
  readonly anyOf: readonly ComplexSelector[][];
  readonly pseudo: readonly string[];      // el resto, solo para decidir las reglas de §4.4
  /** `::slotted(x)` → x; `::part(n)` → n. */
  readonly slotted?: ComplexSelector;
  readonly part?: string;
}

export interface ComplexSelector {
  readonly compounds: readonly CompoundSelector[];
  readonly combinators: readonly Combinator[];   // compounds.length - 1
}

/** `null` si el preludio no se entiende: la regla se conserva (§4.4). */
export function parseSelectorList(prelude: string): readonly ComplexSelector[] | null;
```

### 3.3. El aplanado — `src/css/flatten.ts`

```ts
/** El preludio de un `@import`, leído. */
export interface CssImport {
  readonly url: string;            // tal como se escribió, sin comillas ni `url()`
  readonly urlSpan: Span;          // sobre el preludio
  /** `layer` → `''` (capa anónima); `layer(x)` → `'x'`; ausente si no hay. */
  readonly layer?: string;
  readonly supports?: string;      // el interior de `supports(…)`
  readonly media?: string;         // la lista de medios, si la hay
}

/** `null` si el preludio no es un `@import` válido: el navegador lo ignora, y se quita. */
export function parseImport(prelude: string): CssImport | null;

/**
 * El lector del host, el mismo puerto que `?inline` (`AssetText`): el texto de un fichero
 * relativo al `.fud`, o `null` si no existe o no se puede leer.
 */
export type CssRead = (spec: string) => string | null;

/** Un trozo de la hoja aplanada y el fichero del que salió. */
export interface FlatRegion {
  readonly flat: Span;             // sobre el texto aplanado
  readonly file: string;           // el spec del fichero, relativo al `.fud`
  readonly offset: number;         // dónde empieza `flat.start` en ese fichero
}

export interface FileDiagnostic {
  readonly file: string;
  readonly diagnostic: Diagnostic; // su span es sobre el texto de `file`
}

export interface FlatSheet {
  readonly css: string;
  readonly regions: readonly FlatRegion[];
  /** Todo fichero leído, la raíz incluida: lo que el host vigila (§4.9). */
  readonly files: readonly string[];
  readonly diagnostics: readonly FileDiagnostic[];
}

/** Nunca lanza. `spec` es el de la hoja raíz, relativo al `.fud`; `css`, su texto. */
export function flattenImports(spec: string, css: string, read: CssRead): FlatSheet;

/** Un offset del texto aplanado, de vuelta a su fichero. */
export function originOf(sheet: FlatSheet, offset: number): { file: string; offset: number };
```

### 3.4. La superficie y los usos — `src/emit/surface.ts`

```ts
export interface ScopeSurface {
  readonly tags: ReadonlySet<string>;
  readonly classes: ReadonlySet<string>;
  readonly ids: ReadonlySet<string>;
  /** Nombre → valores literales vistos; `null` si algún valor es una expresión. */
  readonly attributes: ReadonlyMap<string, ReadonlySet<string> | null>;
  /** Algún `class` de este ámbito interpola una expresión. */
  readonly openClasses: boolean;
  /** Algún `id` de este ámbito interpola una expresión. */
  readonly openIds: boolean;
  /** Lo que los padres proyectan en los componentes de este ámbito: para `::slotted()`. */
  readonly slotted: ScopeSurface | null;
  /** Los `part` que exponen los componentes de la página: para `::part()`. */
  readonly parts: ReadonlySet<string> | 'any';
}

export type StyleScope = 'document' | 'shadow';

/** El light DOM de la página: la cadena de layouts, la ruta, sus secciones y lo proyectado. */
export function documentSurface(graph: DocumentGraph): ScopeSurface;
/** El shadow root de un componente: su template, lo que renderiza y los hosts que contiene. */
export function shadowSurface(graph: DocumentGraph, tag: string): ScopeSurface;
export function unionSurfaces(surfaces: readonly ScopeSurface[]): ScopeSurface;

/** Los atributos que el emit o el runtime escriben en un elemento, además de los del autor. */
export function frameworkAttributesOf(el: ElementNode): readonly string[];

/**
 * El CSS de la página que **no** se poda pero consume tokens (§4.6): el `<style>` de cada
 * componente de la página y las partes literales de cada `style="…"` del markup.
 */
export function pageTokenConsumers(graph: DocumentGraph): readonly string[];
```

### 3.5. La poda — `src/emit/prune.ts`

```ts
export interface PageSheet {
  readonly key: string;
  readonly sheet: FlatSheet;       // una hoja de proyecto es un FlatSheet de una región
  readonly scope: StyleScope;
  readonly surface: ScopeSurface;
}

export interface PrunedSheet {
  readonly key: string;
  /** Compactado (`compactProjectCss`). `''` si no queda ninguna regla. */
  readonly css: string;
  /** Los ficheros de la hoja aplanada que conservan al menos una regla en esta página (§4.10). */
  readonly contributing: readonly string[];
}

/**
 * Todas las hojas de UNA página a la vez: los tokens, `@keyframes`, `@font-face` y `@property`
 * se deciden mirando lo conservado en todas ellas y en `consumers` (§4.6).
 */
export function prunePage(
  sheets: readonly PageSheet[],
  consumers: readonly string[],
): ParseResult<readonly PrunedSheet[]>;

export const FUD_IMPORT_EXTERNAL = 'FUD0850';
export const FUD_SHEET_UNREADABLE = 'FUD0851';
export const FUD_SHEET_UNUSED = 'FUD0852';
export const FUD_IMPORT_MISSING = 'FUD0853';
export const FUD_IMPORT_IN_PROJECT_SHEET = 'FUD0854';
export const FUD_IMPORT_IN_COMPONENT_STYLE = 'FUD0855';
export const FUD_IMPORT_CYCLE = 'FUD0856';
export const FUD_IMPORT_MISPLACED = 'FUD0857';
export const FUD_IMPORT_REORDERED = 'FUD0858';
```

### 3.6. El emit — `EmitOptions` y `AssetLinker`

```ts
export interface EmitOptions {
  // …
  /** Aplanar y podar las hojas de la página (§4). Ausente = como hoy: cada hoja llega entera. */
  readonly pruneStyles?: boolean;
}

/**
 * La URL de la copia podada de una hoja enlazada. El host la nombra por su contenido y la
 * publica; el compilador no tiene sistema de ficheros.
 */
export type AssetSheet = (spec: string, css: string, origin: AssetOrigin) => string;

// AssetLinker gana un quinto parámetro opcional en el constructor y un método:
//   constructor(enabled, exists?, url?, text?, sheet?: AssetSheet)
//   sheetRef(spec: string, css: string): string | null   // null → sin host, se deja el href

/** La clave con la que la ruta entrega al layout cada hoja de su `<head>` (§4.8). */
export function sheetKey(depth: number, ordinal: number): string;
```

El objeto `route` que recibe un layout gana `sheet(key: string): string`, que devuelve el
elemento completo que va en el `<head>` en su lugar: un `<link>`, un `<style>` o `''`.

### 3.7. `@fudic/vite`

- `LinkedAssets.sheet(absPath, css, origin): string` — el mismo nombre por hash de bytes que
  `url()` (`assets/<base>-<hash>.css`), sobre el CSS **podado**. Entra en el shell igual que
  cualquier cosa enlazada desde un `<head>`.
- En `vite dev`, las hojas podadas se sirven desde memoria bajo `/@fudic/sheet/<base>-<hash>.css`.
- El plugin pasa `pruneStyles: true` en los tres pases (host, SW y edge) y en dev.
- El plugin diagnostica `FUD0854` sobre cada hoja de `fudic.json`, una vez por hoja, donde hoy
  diagnostica `FUD0743`.

---

## 4. Comportamiento

### 4.1. Qué hoja se poda contra qué, y dónde cabe un `@import`

| Hoja | `@import` | Ámbito | Superficie de sus reglas |
|---|---|---|---|
| `<link rel="stylesheet">` en el `<head>` de un layout de la cadena o de la ruta, con o sin `?inline` | Se aplana (§4.2) | `document` | `documentSurface(page)` |
| Una `globalStyles` | **Error** `FUD0854` | `shadow` | La unión de `shadowSurface` de cada componente de la página cuya cadena la incluye (SDD-43 §4.6) |
| Una `styles` | **Error** `FUD0854` | `shadow` | La unión de `shadowSurface` de cada componente de la página que la elige |
| El `<style>` de un componente | **Error** `FUD0855` | `shadow` | No se poda (§7); solo se lee para los tokens (§4.6) |

Los tokens de **todas** se deciden juntos, por página (§4.6).

La **página** es el grafo de la ruta: su markup, sus secciones, la cadena de layouts y todo
componente y snippet alcanzable desde ellos.

Solo se poda lo que el compilador puede leer: un `href` relativo que `AssetLinker.textOf`
resuelve. Una URL absoluta, de otro origen o de `public/` se deja como está escrita.

**Por qué el `@import` es error en las hojas adoptadas.** Una hoja adoptada acaba siendo una
hoja construida, y `replace()`/`replaceSync()` no admiten `@import`: en el navegador se ignora
sin aviso. Y en el `<style>` de un componente no aporta nada que no dé `styles`, que además
comparte la hoja entre instancias. El error va sobre el `@import`; la hoja se emite sin él.

### 4.2. El aplanado de una hoja del documento

Antes de podar, cada hoja del documento se aplana: cada `@import` se sustituye por el contenido
del fichero que importa, que a su vez se aplana. El resultado es **una** hoja con el orden de
cascada que el navegador daría a la original.

- **Resolución.** La URL de un `@import` es relativa al fichero donde se escribe. Se resuelve
  con aritmética de rutas a un spec relativo al `.fud` y se lee con el `AssetText` del host
  (`CssRead`). El compilador no toca el sistema de ficheros.
- **Condiciones.** Se traducen a bloques, de fuera adentro: `layer`, `supports`, `media`.
  - `@import "a.css" layer(base)` → `@layer base { … }`; `layer` sin nombre → `@layer { … }`.
  - `supports(display: grid)` → `@supports (display: grid) { … }`.
  - `screen and (min-width: 40em)` → `@media screen and (min-width: 40em) { … }`.
- **Posición.** El navegador solo atiende un `@import` que va antes de cualquier regla que no sea
  `@charset`, `@layer a, b;` u otro `@import`. Uno escrito después lo ignora: se quita y es
  `FUD0857`.
- **`url()` relativos.** Un `url(…)` relativo de un fichero importado se reescribe para que siga
  apuntando al mismo recurso desde la hoja raíz. Después de aplanar, todo `url()` relativo es
  relativo a la raíz (§4.7 decide qué URL lleva al final).
- **`@charset`** de un fichero importado se quita: solo cuenta el de la raíz.
- **Un fichero repetido** con las mismas condiciones se incluye **una vez, en su última
  aparición**, que es la que gana la cascada. Si declara o abre capas (`@layer`), se conservan
  todas sus apariciones: el orden de las capas lo fija la primera.
- **Un ciclo** (`a` importa `b`, `b` importa `a`) es `FUD0856` sobre el `@import` que lo cierra,
  que se quita.
- **Un fichero relativo que no existe** o no se puede leer es `FUD0853` (error) sobre su
  `@import`, que se quita.
- **Un `@import` que no se puede aplanar** —URL absoluta, de otro origen o de `public/`— se
  conserva como `@import` y su contenido llega entero, sin podar: `FUD0850`. Se mueve al
  principio de la hoja aplanada, en el orden en que aparecen, porque es el único sitio donde el
  navegador lo atiende. Si eso lo adelanta a contenido que iba antes —está en un fichero
  importado, o detrás de un `@import` que sí se aplana—, el orden de la cascada cambia, y es
  `FUD0858`.
- **Diagnósticos.** Todo diagnóstico de la hoja aplanada, también los de `parseCssRules` sobre
  el texto aplanado, se devuelve sobre el fichero y el offset originales (`originOf`).

### 4.3. La superficie de un ámbito

**Qué elementos cuentan.**

- **`document`:**
  - `html` y `body`, siempre;
  - el body de cada layout de la cadena, el markup de la ruta y sus secciones;
  - el marcado de todo snippet que se renderice ahí;
  - de cada componente usado ahí, su **host** (el tag y los atributos escritos en el sitio de
    uso) y su **contenido proyectado**, que vive en el light DOM.
- **`shadow` de un componente:**
  - todo lo que hay dentro de su `<template shadowrootmode>`;
  - el marcado de los snippets que se renderizan ahí;
  - el host y el contenido proyectado de los componentes que usa dentro.
- **Todas las ramas cuentan:** `@if`, `@else`, `@switch` y el cuerpo de los bucles, se
  rendericen o no en el servidor. Un componente que solo nace en el navegador está en el grafo
  estático, así que su marcado también cuenta.

**Qué se registra de cada elemento.**

- **Tag.** En minúsculas.
- **Clases:**
  - las palabras literales de `class="…"`;
  - el nombre de cada `class:nombre=@x`, siempre, sea cual sea la condición;
  - un `class` con una parte `@` activa `openClasses`.
- **`id`.** Literal. Uno con `@` activa `openIds`.
- **Atributos.** El nombre, siempre (`attr=@x` también lo escribe). El valor, solo si es
  literal; si no, `null`. Un `.prop=@x` es una propiedad, no un atributo, y no cuenta.
- **Lo que añade el framework.** `frameworkAttributesOf(el)` es la única lista, y cuenta como
  escrito por el autor:
  - `slot=` sellado por un hueco (SDD-48);
  - `aria-describedby`, `aria-live`, `tabindex` e ids de marcador (SDD-34);
  - `aria-invalid` y `aria-label` que escribe `@fudic/forms`;
  - `data-fud-*`.

**Qué más se registra por ámbito.**

- `slotted`: la superficie del contenido que los padres proyectan en los componentes de ese
  ámbito.
- `parts`: la unión de los `part="…"` literales de los componentes de la página, o `'any'` si
  alguno es una expresión.

### 4.4. Cuándo se conserva una regla

Una regla de estilo se conserva si **algún** selector de su lista se conserva. Si se conservan
unos y otros no, los que no se quitan de la lista.

**Un selector se conserva** cuando **cada** uno de sus compuestos puede casar con **algún**
elemento de la superficie. La estructura de los combinadores no se comprueba: un `ul > li` se
conserva si hay algún `ul` y algún `li` en el ámbito. Puede dejar reglas de más, nunca de
menos.

**Un compuesto casa con un elemento** cuando se cumple todo esto:

- El tipo es igual, o no hay tipo, o es `*`.
- Cada clase está en `classes`, o `openClasses` es verdadero.
- Cada id está en `ids`, o `openIds` es verdadero.
- Cada atributo está por nombre. Si el selector pide valor (`[type="x"]`, `~=`, `^=`…), el
  valor casa con alguno de los literales, o los valores de ese atributo son `null`.
- `:is()`, `:where()` y `:matches()` casan si casa alguno de sus argumentos.

**Lo que no restringe nunca:**

- las pseudoclases de estado o de estructura (`:hover`, `:focus-visible`, `:nth-child()`,
  `:user-invalid`…);
- `:not()` y `:has()`;
- los pseudoelementos, salvo los dos casos siguientes.

**Casos especiales:**

| Selector | Ámbito `document` | Ámbito `shadow` |
|---|---|---|
| `:root`, `html`, `body` | Siempre casan | Nunca casan (ya es `FUD0743`) |
| `:host`, `:host(…)`, `:host-context(…)` | Nunca casan | Siempre casan |
| `::slotted(x)` | — | `x` casa contra `slotted` |
| `::part(n)` | Casa si `n` está en `parts`, o `parts` es `'any'` | — |

**Anidamiento (CSS nesting).**

- Una regla anidada se resuelve como el navegador: `&` es el selector del padre, y sin `&` es
  un descendiente del padre.
- Si el padre se poda, se van con él sus reglas anidadas.

**Un preludio que `parseSelectorList` no entiende** conserva la regla entera, sin diagnóstico.

### 4.5. Las at-rules

- **`@media`, `@supports`, `@container`, `@layer x { }`, `@scope`, `@starting-style`:** se
  poda su interior. Si queda vacío, se van. Esto incluye los bloques que produce el aplanado
  (§4.2).
- **`@layer a, b;`** (la declaración de orden), **`@charset`** y **`@namespace`:** se
  conservan siempre. Quitar una declaración de capas cambia la cascada de lo que queda.
- **`@keyframes`, `@font-face` y `@property`:** se deciden con los tokens (§4.6).
- **`@page`, `@counter-style`, `@font-feature-values` y cualquier at-rule desconocida:** se
  conservan.
- **`@import`:** en una hoja del documento ya no queda ninguno aplanable (§4.2); los que no se
  pueden aplanar se conservan (`FUD0850`). En una hoja de proyecto es `FUD0854` y se quita.

### 4.6. Los tokens

Las custom properties se heredan a través del shadow boundary, así que su uso no se mide por
ámbito: se mide en **toda la página**. Después de podar las reglas (§4.4–§4.5) de todas las
hojas de la página, se calcula un punto fijo.

**El texto vivo** empieza con:

- el **valor** de cada declaración conservada que no es una custom property, en cualquier hoja
  de la página;
- los preludios de las at-rules conservadas (`@container style(--x: …)`);
- `consumers` (`pageTokenConsumers`): el `<style>` de cada componente de la página, y las
  partes literales de cada `style="…"` del markup;
- entera, toda hoja que llega sin podar: una ilegible (`FUD0851`).

**Se repite hasta que no cambie nada:**

- Un **token** está vivo si su nombre aparece como identificador (`--nombre`) en el texto vivo,
  fuera de strings y comentarios. Basta con aparecer: `var(--x)`, `style(--x: …)`,
  `transition-property: --x`… Al entrar, el valor de **cada** declaración `--nombre: …`
  conservada, en cualquier hoja, se suma al texto vivo. Así `--btn-bg: var(--blue-500)` mantiene
  vivo `--blue-500` si `--btn-bg` lo está.
- Un **`@keyframes x`** está vivo si `x` aparece como identificador en el texto vivo. Al entrar,
  su cuerpo se suma.
- Un **`@font-face`** está vivo si su `font-family` aparece como identificador o como string en
  el texto vivo. Al entrar, su cuerpo se suma.

**Después:**

- Se quita toda declaración `--nombre: …` de un token que no está vivo, en cualquier regla y en
  cualquier ámbito: `:root`, su variante de `@media (prefers-color-scheme: dark)`,
  `[data-theme="dark"]` o `:host`. Se decide **por nombre**, así que las variantes de un mismo
  token se van o se quedan juntas.
- Se quitan los `@keyframes` y `@font-face` que no están vivos, y los `@property --x` cuyo
  `--x` no está vivo.
- Una regla que se queda sin declaraciones ni hijos se quita; un bloque que se queda vacío,
  también.

Las declaraciones que **no** son custom properties no se tocan nunca. Y los nombres distinguen
mayúsculas: `--Brand` y `--brand` son dos tokens.

Un token que **define** el markup (`style="--gap: 1rem"`, `style:--gap=@g`) no se poda: el
markup no se toca. Si su valor nombra otros tokens, cuentan como uso.

### 4.7. Lo que sale

- La hoja podada es la **misma** hoja aplanada con reglas y declaraciones de menos. Se conserva
  el orden, y el texto de lo que queda es el que escribió el autor, compactado por
  `compactProjectCss`. Sin `@import` y con una superficie y unos usos que lo contienen todo, la
  salida es idéntica byte a byte a la de hoy.
- **`url()` en una hoja del documento.** Cada `url()` relativo **que queda** tras podar se enlaza
  como cualquier asset (`AssetLinker`, origen `'markup'`): en la copia con `<link>`, se escribe
  la URL que devuelve el host; con `?inline`, por `cssTemplate`, como hoy. Así un fichero de
  fuente o una imagen que solo usaba una regla podada no se publica para esa página.
- Una hoja que queda vacía en una página **no se emite** en esa página: ni `<link>`, ni
  `<style>`, ni `specifier`.
- **Corrección (implementación).** Una `globalStyles` o una `styles` que queda vacía pero que
  **algún componente de la página adopta** se registra **vacía**
  (`<style type="module" specifier>` sin contenido), y las listas de adopción no cambian. La
  lista de un host anidado —y la de un componente creado en el navegador— se escribe en el
  módulo de su componente padre, que es único para todas las páginas, así que no puede
  quitarla por página; y una lista no puede nombrar una hoja que el documento no registró.
  Una hoja de proyecto que **ningún** componente de la página adopta no se emite.
- Una hoja que `parseCssRules` no puede leer (llaves sin cerrar, un string o un comentario sin
  terminar) llega **entera**, y es `FUD0851`.

### 4.8. La ruta entrega, el layout escribe

El layout se compila una vez y lo comparten todas sus rutas, así que no puede saber qué
página pinta. La que lo sabe es la ruta, que tiene el grafo entero. Se sigue el patrón que ya
usa `route.runtime(inline)`:

- **En el layout:** por cada `<link rel="stylesheet">` podable de su `<head>` escribe
  `head += route.sheet(K)` en lugar del elemento. `K = sheetKey(profundidad, ordinal)`:
  - `profundidad` es el número de ancestros del layout, que no depende de la ruta;
  - `ordinal` es la posición del `<link>` entre los podables de ese `<head>`.
- **En la ruta:**
  - aplana cada hoja del documento y calcula `prunePage` con todas las hojas de la página;
  - por cada clave de su cadena, genera el elemento completo: los atributos que el autor
    escribió en el `<link>`, con el `href` cambiado por la URL de la copia podada; o
    `<style nonce>…</style>` si era `?inline`; o `''` si quedó vacía;
  - lo entrega en `sheet(K)`;
  - sus propios `<link>` del `<head>` los escribe directamente.
- **Una página sin layout** (módulo de página, `module.ts`) hace todo en su propio módulo.
- **Las hojas de proyecto:** `PROJECT_STYLES` se escribe ya podado en el módulo de la ruta,
  que es donde vive hoy.

Todo se calcula **al compilar**. El módulo de la ruta lleva constantes, y ni el servidor, ni el
Service Worker, ni el edge hacen nada al pintar.

### 4.9. El nombre del fichero podado

- **Por hash de contenido.** `LinkedAssets.sheet` nombra por hash de los bytes podados, igual
  que hoy nombra por hash del fichero: `assets/main-3fA9c1Qb.css`. Dos páginas con la misma
  hoja podada comparten URL, así que comparten caché y el build publica un solo fichero.
  Cambiar un componente solo renombra las hojas de las páginas donde cambió lo que se usa.
- **Una variante por página es lo esperado.** Con los tokens podados, casi cada página tendrá
  su propia copia. No es un coste: para que la página funcione offline, esos bytes viajan sí o
  sí, dentro del HTML o en un fichero precacheado, y son los mismos bytes.
- **Mismo nombre en todos los pases.** Los tres pases de build compilan el mismo `.fud`, y
  todos obtienen el mismo nombre porque la hash sale del contenido y no del bundler.
- **Entran en el shell.** Las copias podadas se enlazan desde un `<head>`, así que entran en el
  shell (SDD-19 `'head'`) y el Service Worker las precachea al instalar. Una página que nunca
  se visitó abre offline con su hoja.
- **El `<link>` sigue en el `<head>`.** Bloquea el render como hoy, así que no hay FOUC. Solo
  cambia a qué fichero apunta.

### 4.10. En desarrollo

- `vite dev` aplana y poda igual. La URL de una copia podada es
  `/@fudic/sheet/<base>-<hash>.css` y el middleware la sirve desde memoria.
- El host vigila cada fichero de `FlatSheet.files`. Un cambio en cualquier `.fud` del grafo de
  una página, en una hoja o en un fichero que importa, recalcula la poda de esa página en la
  siguiente navegación.

### 4.11. Lo que no usa nadie

Al terminar el build, el plugin sabe qué deja cada página de cada hoja, y de cada fichero que
una hoja importa (`PrunedSheet.contributing`). Es `FUD0852`:

- una hoja que queda vacía **en todas** las páginas, sobre su entrada de `fudic.json` o sobre
  su `<link>`;
- un fichero importado que no conserva ninguna regla **en ninguna** página, sobre su
  `@import`. Es el caso de `inputs.css` en una aplicación donde todo input va dentro de un
  componente: el `@import` sobra.

Es CSS muerto, y el autor debería saberlo. Un token suelto sin uso no se diagnostica (§7).

### 4.12. El `<style>` es CSS plano (decisión 136)

Se revoca la decisión 42 y sus 42.a–c. El cuerpo de un `<style>` —el de un componente, el del
`<head>` de un layout, una ruta o una página— es CSS y nada más. **Escribir Razor ahí es un
error**, `FUD0132`: si se revoca, el autor tiene que saber que no está permitido, no descubrir
en el navegador que su `@(x)` no hace nada.

- **Qué es CSS.** Un `@` seguido de una at-rule de la lista cerrada (`src/css/atrules.ts`, que
  se queda) o de `-` (una at-rule con prefijo de fabricante, `@-webkit-keyframes`). Y todo `@`
  dentro de un string o de un comentario CSS.
- **Qué es `FUD0132` (error).** Cualquier otro `@`:
  - `@( … )`, una expresión explícita;
  - `@nombre`, `@nombre.prop`, `@if`, `@foreach`…: lo que antes era Razor implícito o un
    constructo, porque no es una at-rule de la lista;
  - `@* … *@`, un comentario Razor;
  - `@@`, el escape, que en CSS plano no escapa nada;
  - `@` suelto.

  El span cubre la construcción entera cuando se puede delimitar (`@( … )` hasta su `)`,
  `@* … *@` hasta su `*@`, o hasta el final del `<style>` si no se cierra) y, si no, el `@` y el
  identificador que lo sigue. El mensaje dice que el CSS no admite Razor y que lo dinámico va en
  el markup (`style=`, `style:`, `class:`). Se diagnostica siempre, con y sin `pruneStyles`.
- **El parser no lanza.** `parseStyle` devuelve un único run `css-text` con todo el cuerpo,
  también el texto marcado con `FUD0132`; deja de producir `razor-expression`,
  `razor-comment` y `at-escape`. Lo que se emite es ese texto, compactado; como `FUD0132` es
  error, el build no llega a publicarlo.
- **La lista cerrada sigue siendo estricta** (como decía la 42.b): una at-rule nueva que no está
  en la lista es `FUD0132` hasta que se añade al compilador.
- **Lo que deja de tener objeto se retira:** el caso de `FUD0011` dentro de `<style>` (un
  comentario Razor sin cerrar es ahora solo `FUD0132`); en el lexer, en el formatter y en el
  language server, los huecos de Razor dentro del CSS, de modo que el código virtual CSS es el
  texto del `<style>` tal cual, y los `FUD0132` los publica el diagnóstico de fudic.
- **Sin migración.** Ningún `.fud` de `packages/compiler/fixtures` ni de `examples/basic` usa
  Razor dentro de un `<style>`. Cambian solo los tests que lo probaban.

---

## 5. Invariantes

- **Conservadora.** Toda regla que pueda aplicarse a un elemento de la página llega, y todo
  token que algo de la página nombra llega. Ante la duda (un selector que no se entiende, una
  clase interpolada, un valor dinámico, una hoja ilegible) se conserva.
- **El orden es el del navegador.** El aplanado produce la cascada que el navegador daría a
  los `@import`; la poda solo quita, nunca reordena. La única excepción es un `@import` que no
  se puede aplanar, y la avisa `FUD0858`.
- **Por página, en build.** Nada se decide en runtime. El módulo de la ruta lleva las hojas ya
  podadas.
- **Un nombre por contenido.** Dos pases o dos páginas con los mismos bytes podados nombran el
  mismo fichero.
- **El cliente no cambia.** Un componente creado en el navegador adopta la hoja que el
  documento registró (BUG-45), que ya es la podada, y su marcado ya estaba en la superficie.
- **Una sola lista de atributos del framework.** `frameworkAttributesOf` es la única fuente.
  Un atributo que el runtime escribe y la lista no nombra es un defecto de esa lista.
- **Spans en todo y el parser nunca lanza.** `parseCssRules`, `parseSelectorList`,
  `parseImport` y `flattenImports` devuelven lo que entienden. Lo que no entienden se conserva,
  y sus diagnósticos van sobre el fichero original.
- **El compilador no tiene sistema de ficheros.** El aplanado lee por el puerto del host.
- **Ausente = como hoy.** Sin `pruneStyles`, el emit es idéntico byte a byte al de antes de
  este SDD. `FUD0854` y `FUD0855` se diagnostican siempre: son errores del CSS, no de la poda.
  Y la decisión 136 (§4.12) también aplica siempre; como ningún fixture lleva Razor en un
  `<style>`, ni su emit ni sus diagnósticos cambian.
- **Cobertura.** Los ficheros nuevos al 100 % en las cuatro métricas, con su umbral escrito en
  el `vitest.config.ts` de cada paquete. Ningún fichero existente por debajo de su suelo en
  `main`.

### Diagnósticos

| Código | Severidad | Qué dice |
|---|---|---|
| `FUD0850` | warning | Un `@import` que no se puede aplanar (URL absoluta, de otro origen o de `public/`): se conserva y lo que importa llega entero, sin podar. Sobre el `@import`. |
| `FUD0851` | warning | La hoja no se puede leer como CSS (llaves sin cerrar, string o comentario sin terminar) y llega entera. Sobre el punto donde se pierde, en su fichero. |
| `FUD0852` | warning | Una hoja no aporta ninguna regla a ninguna página, o un fichero importado no aporta ninguna. Sobre su entrada de `fudic.json`, su `<link>` o su `@import`. |
| `FUD0853` | error | El fichero de un `@import` relativo no existe o no se puede leer. Sobre el `@import`, que se quita. |
| `FUD0854` | error | `@import` en una hoja de `globalStyles` o `styles`: una hoja adoptada no lo admite. Sobre el `@import`, que se quita. |
| `FUD0855` | error | `@import` en el `<style>` de un componente. Sobre el `@import`, que se quita. |
| `FUD0856` | error | `@import` circular. Sobre el `@import` que cierra el ciclo, que se quita. |
| `FUD0857` | warning | `@import` detrás de una regla: el navegador lo ignora, y se quita. Sobre el `@import`. |
| `FUD0858` | warning | Un `@import` que no se puede aplanar se adelanta a contenido que iba antes, y el orden de la cascada cambia. Sobre el `@import`. |
| `0859`–`0869` | | Reservados. |

`FUD0132` (rango de SDD-09) **se amplía** con la decisión 136: pasa de «comentario Razor dentro de
`<style>`» a **cualquier Razor dentro de `<style>`** (§4.12), error. Nació en esta rama y no ha
llegado a `main`, así que se amplía en lugar de retirarse y reservar otro.

---

## 6. Criterios de aceptación

**El árbol de reglas** (`packages/compiler/test/css/rules.test.ts`)

1. `parseCssRules` devuelve reglas de estilo, at-rules de bloque con y sin hijos, sentencias y
   reglas anidadas, con spans que recortan el texto exacto de cada una. Cada declaración trae
   su nombre (en minúsculas, salvo una custom property, que se queda como está) y el span de su
   valor.
2. Llaves sin cerrar, un string o un comentario sin terminar: no lanza, devuelve lo leído hasta
   ahí y un diagnóstico con span.

**Los selectores** (`test/css/selectors.test.ts`)

3. `parseSelectorList` parte listas, compuestos y combinadores. Extrae tipo, clases, ids,
   atributos con y sin valor, `:is()`/`:where()`, `::slotted()` y `::part()`. Un preludio
   ininteligible es `null`.

**El aplanado** (`test/css/flatten.test.ts`)

4. `parseImport` lee `"a.css"`, `url(a.css)`, `url("a.css")`, `layer`, `layer(x)`,
   `supports(…)` y la lista de medios, en cualquier combinación válida; lo que no es un
   `@import` válido es `null`.
5. `main.css` con tres `@import` relativos sale como una hoja con su contenido en orden, y las
   condiciones se traducen a `@layer`, `@supports` y `@media` anidados en ese orden.
6. Un `url(../fonts/x.woff2)` de un fichero importado de otra carpeta se reescribe relativo a
   la raíz. Un `@charset` importado se quita.
7. Un fichero importado dos veces sale una vez, en su última aparición; si abre una capa, salen
   las dos.
8. Ciclo → `FUD0856`; fichero que no existe → `FUD0853`; `@import` detrás de una regla →
   `FUD0857`; URL absoluta → se conserva al principio con `FUD0850`, y con `FUD0858` si estaba
   en un fichero importado o detrás de un `@import` aplanado. Ninguno lanza.
9. `originOf` y los diagnósticos de `FlatSheet` devuelven el fichero y el offset originales;
   `files` lista todo fichero leído.

**La superficie** (`test/emit/surface.test.ts`)

10. `documentSurface` de una ruta con layout contiene el body del layout, la ruta, sus
    secciones, los hosts y su contenido proyectado. **No** contiene un `h1` que solo está dentro
    del template de un componente.
11. `shadowSurface` contiene el template, los snippets renderizados dentro, las ramas de un
    `@if` falso en SSR y el host de un componente anidado.
12. `class:activo=@x` aporta `activo`; `class="a @b"` aporta `a` y activa `openClasses`;
    `type=@t` deja los valores de `type` en `null`.
13. `frameworkAttributesOf` de un control con `control` y marcador de error incluye
    `aria-describedby` y `aria-invalid`, y un hueco con slot incluye `slot`. Un test recorre
    `@fudic/forms` y comprueba que todo atributo que escribe está en la lista.
14. `pageTokenConsumers` devuelve el `<style>` de cada componente de la página —también uno que
    solo nace en el navegador— y las partes literales de los `style="…"` del markup.

**La poda de reglas** (`test/emit/prune.test.ts`)

15. Contra una superficie con `h1` y `p`: `h1, h2, h3 { … }` sale como `h1 { … }` y
    `table { … }` desaparece.
16. `ul > li` se conserva con un `ul` y un `li` en el ámbito, aunque no estén anidados.
17. `.btn:hover`, `a:not(.x)` y `li:nth-child(2n)` se conservan si hay `.btn`, `a` y `li`.
18. En `shadow`: `:host` y `:host(.x)` se conservan siempre; `:root` se va; `::slotted(p)`
    depende de `slotted`. En `document`: `::part(label)` depende de `parts`, y `:host` se va.
19. Un `@media` —también uno nacido de un `@import … screen`— que solo contiene reglas podadas
    desaparece; `@layer a, b;` se queda.
20. Una regla anidada se va con su padre.
21. **El caso de §1.4.** `main.css` importa `inputs.css`; la página usa `<x-input>`, cuyo
    template tiene los `<input>`: en el documento, `inputs.css` no deja ninguna regla y no
    figura en `contributing`. La misma hoja adoptada por `<x-input>` conserva sus reglas.

**La poda de tokens** (`test/emit/prune.test.ts`)

22. De `:root { --a: 1; --b: 2; --c: 3 }`, con `p { color: var(--a) }` conservada, solo queda
    `--a`; si `p` se poda, `:root` desaparece.
23. Cadena: `--btn: var(--blue)` y `--blue: #00f`; si algo usa `--btn`, quedan los dos; si no,
    ninguno.
24. Un token de una hoja del documento que solo usa el `<style>` de un componente de la página
    se queda; el de un componente que no está en la página, no.
25. `style="color: var(--x)"` en el markup mantiene `--x`; `style(--x: y)` en un `@container`
    conservado también.
26. `--x` en `:root` y en `@media (prefers-color-scheme: dark) { :root { … } }` se van o se
    quedan juntos. `--X` y `--x` son dos tokens.
27. `@keyframes` y `@font-face` se quedan si los nombra el texto vivo de cualquier hoja de la
    página, también a través de un token (`--anim: fade`, vivo); se van si no. `@property --x`
    se va si `--x` no está vivo.
28. Una hoja ilegible llega entera y sus `var()` cuentan.
29. Con una superficie y unos usos que lo contienen todo y sin `@import`, la salida es idéntica
    a `compactProjectCss` de la entrada.

**Los errores de `@import` en hojas adoptadas**

30. `@import` en una hoja de `globalStyles` o `styles` es `FUD0854` sobre el `@import`, una vez
    por hoja, y la hoja se registra sin él. En el `<style>` de un componente es `FUD0855`. Los
    dos también sin `pruneStyles`.

**El emit** (`test/emit/page-sheets.test.ts`)

31. Una ruta con layout cuyo `<head>` tiene `<link rel="stylesheet" href="./base.css">` y otro
    con `?inline`: el layout escribe `route.sheet(K)` dos veces; la ruta entrega un `<link>`
    con la URL de `AssetSheet` y un `<style nonce>` con el CSS podado, conservando los demás
    atributos del `<link>` (`media`).
32. Dos rutas con el mismo layout y markup distinto entregan CSS distinto para la misma clave.
33. Una `styles` que ningún componente de la página adopta sale de `PROJECT_STYLES`; una que
    algún componente adopta y queda vacía se queda con `css` vacío, y `data-fud-adopt` y
    `shadowrootadoptedstylesheets` no cambian (§4.7, corrección).
34. En la copia enlazada, un `url()` relativo que queda se escribe con la URL del host; el de
    una regla podada no se enlaza.
35. Sin `pruneStyles` el emit es idéntico al de `main` (los fixtures actuales, sin cambios).

**Build** (`packages/vite/test/`)

36. Dos páginas con la misma hoja podada apuntan al mismo fichero; una tercera distinta, a
    otro. El host, el pase del SW y el edge escriben la misma URL, y el fichero se publica una
    sola vez.
37. Las copias podadas están en el shell del manifiesto.
38. En `vite dev` el `<link>` de la página apunta a `/@fudic/sheet/…` y el middleware sirve
    ese CSS. Tras editar un fichero **importado**, la siguiente navegación trae la poda nueva.
39. `FUD0852` para una hoja que no aporta nada a ninguna página y para un fichero importado que
    no aporta nada a ninguna, sobre su `@import`. Los diagnósticos de una hoja salen una vez
    aunque la enlacen varias páginas.

**Evidencia** (`examples/basic`)

40. La guía de `examples/basic` pasa a ser un `src/styles/main.css` que importa un fichero por
    tema —reset, tokens de color (con modo oscuro) y de espaciado, tipografía, listas, tablas,
    formularios y animaciones—, en torno a 12 KB entre todos. `_layout.fud` la enlaza con
    `?inline`. [SDD-49-medicion.md](./SDD-49-medicion.md) recoge, por página, los bytes antes y
    después, **cuántos tokens llegan de cuántos**, y cuántas copias distintas de cada hoja
    publica el build.
41. **Todas las páginas se ven igual que antes de podar**, en Chrome, en modo claro y oscuro, y
    con el Service Worker activo, también offline en una página que no se ha visitado.
    **Verificado por Pedro en navegador.**
42. **Cobertura.** Los ficheros nuevos al 100 % en las cuatro métricas, con su umbral en el
    `vitest.config.ts`; ninguno existente por debajo de su suelo en `main`.

**El `<style>` es CSS plano** (`test/css/css.test.ts`, decisión 136)

43. En un `<style>`, `@(x)`, `@foo`, `@if (…) { }`, `@* c *@`, `@* sin cerrar`, `@@` y un `@`
    suelto dan cada uno `FUD0132` (error) con su span, sin `FUD0011` y sin lanzar; `parseStyle`
    devuelve un solo run `css-text`. `@media`, `@MEDIA`, `@-webkit-keyframes` y un `@` dentro de
    un string o de un comentario CSS no dan nada. El formatter y el language server tratan el
    cuerpo entero como CSS.

---

## 7. Fuera de alcance

- **El Razor del markup.** `style="…"`, `style:x=@v` y `class:` siguen siendo Razor: la
  decisión 136 solo alcanza al cuerpo de `<style>`.
- **El `<style>` propio de un componente.** Lo escribe el autor para su template. No es una
  guía compartida y no se poda; solo se lee, para los tokens.
- **Comprobar la estructura de los combinadores.** `ul > li` con `li` fuera de todo `ul` se
  conserva. Afinarlo es una mejora de la misma poda, sin cambiar su interfaz.
- **Podar declaraciones que no son custom properties.** Una propiedad sobrescrita más abajo
  sigue llegando.
- **El JS que lee o escribe tokens o clases.** `getComputedStyle(…).getPropertyValue('--x')`,
  `style.setProperty`, `classList`, `innerHTML` y el DOM escrito a mano en `@client` no se
  contemplan (§1.2), y no hay lista de excepciones en `fudic.json`. Un valor de `style:` que se
  calcula en JS y devuelve `var(--x)` es JS.
- **Seguir un `@import` de otro origen.** Se conserva y se avisa (`FUD0850`).
- **El CSS muerto en el editor.** Tachar en el language server las reglas y los tokens que
  ninguna página usa sale casi gratis de la superficie, pero es otra spec. Por la misma razón,
  un token suelto sin uso no es diagnóstico de build.
