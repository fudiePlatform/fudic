# SDD-49 — El CSS que cada página usa

> **Estado:** `Listo` — pendiente de la revisión de Pedro.
> **Paquetes:** `@fudic/compiler` (el árbol de reglas, los selectores, la superficie de cada
> ámbito, la poda y el emit por página) · `@fudic/vite` (el nombre de cada hoja podada, el
> servidor de dev, el shell y `FUD0852`) · `@fudic/example-basic` (la evidencia y la medición)
> **Depende de:** 09, 18, 19, 21, 29, 34, 39, 42, 43, 45, 46, 48, BUG-45
> **Rango de diagnósticos:** `FUD0850`–`FUD0869`
> **Decisiones de gramática:** ninguna. No hay sintaxis nueva: el autor escribe su CSS y sus
> `<link>` como hoy.
> **Naturaleza:** compilador + build. No toca el parser de `.fud`, ni el runtime, ni el polyfill.
>
> **Qué añade en una frase.** Cada página recibe, de cada hoja que le llega —las que enlaza su
> layout o su ruta, las `globalStyles` y las `styles`—, solo las reglas que pueden aplicarse a
> algún elemento de esa página.

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
`styleOptions`). Lo que ninguna spec resuelve es la granularidad de **regla**: una hoja que sí
llega, llega entera.

Es el caso normal en una aplicación. Una guía de estilos real —tokens, reset, tipografía de
`h1`–`h6`, `p`, listas, tablas, formularios— pesa en torno a 12 KB, y se pone inline para evitar
el FOUC. Una página de login no tiene tablas, y una página de listado no tiene formularios, pero
las dos reciben las reglas de las dos cosas.

### 1.2. Por qué se puede hacer bien aquí

Podar CSS en una aplicación con estilos globales es heurística. Cualquier script puede poner
cualquier clase en cualquier sitio, y herramientas como PurgeCSS se equivocan en los dos
sentidos. En fudic no, por tres razones:

- **El markup es estático.** Todo elemento que una página puede llegar a tener está en un
  `.fud` del grafo que el compilador ya resuelve (`resolveDocument`), con todas las ramas de
  `@if`, `@switch` y `@foreach`, rendericen o no en el servidor.
- **Las clases son estáticas.** `class=` es un string (decisión 22), y `class:foo=@x` escribe
  el nombre `foo` en el código aunque la condición sea falsa.
- **Los ámbitos están cerrados.** Una hoja adoptada solo alcanza el shadow root que la adopta,
  y una hoja del documento solo alcanza el light DOM. Un `h1` que vive dentro de un componente
  **no** justifica conservar el `h1` del reset del documento, porque ese CSS nunca le llega.

`classList` e `innerHTML` escritos a mano por el autor no se contemplan: fudic no se construye
para eso.

### 1.3. El objetivo

- Cada hoja se poda **por página**, contra la **superficie** del ámbito donde se aplica.
- La poda es **conservadora**: puede dejar reglas de más, nunca quitar una que pueda aplicarse.
- La hoja enlazada con `<link>` sigue siendo un fichero, pero **uno por contenido podado**: dos
  páginas que usan lo mismo comparten fichero y caché.
- Se poda también en `vite dev`: lo que se ve en desarrollo es lo que se despliega.

---

## 2. Dependencias

**SDD-09.** `parseStyle`: el cuerpo de un `<style>` como runs planos. No construye árbol de
reglas (§7 de SDD-09), así que este SDD añade uno **para CSS plano**, sin Razor. Las hojas que
se podan son siempre `.css` de fichero, nunca un `<style>` de componente.

**SDD-18 y BUG-45.** La hoja adoptada es un `<style type="module" specifier>` del documento, y
un componente creado en el navegador construye la suya **leyendo ese elemento**. Así que el
cliente recibe la versión podada sin cambiar nada del runtime.

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
hojas de proyecto se suben a un documento y qué adopta cada tag.

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

/** `selector { declaraciones; reglas anidadas }` */
export interface StyleRule extends Node {
  readonly type: 'style-rule';
  readonly prelude: Span;
  /** Las declaraciones propias, sin las reglas anidadas. */
  readonly declarations: readonly Span[];
  /** CSS nesting: las reglas escritas dentro del bloque. */
  readonly children: readonly CssRule[];
}

/** `@media …{ }`, `@supports`, `@container`, `@layer x { }`, `@scope`, `@keyframes`, `@font-face`… */
export interface BlockAtRule extends Node {
  readonly type: 'at-block';
  readonly name: string;           // sin la @, en minúsculas
  readonly prelude: Span;
  readonly body: Span;
  /** Presente cuando el cuerpo contiene reglas (`@media`); ausente cuando son declaraciones (`@font-face`). */
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
  readonly pseudo: readonly string[];      // el resto, solo para decidir las reglas de §4.3
  /** `::slotted(x)` → x; `::part(n)` → n. */
  readonly slotted?: ComplexSelector;
  readonly part?: string;
}

export interface ComplexSelector {
  readonly compounds: readonly CompoundSelector[];
  readonly combinators: readonly Combinator[];   // compounds.length - 1
}

/** `null` si el preludio no se entiende: la regla se conserva (§4.3). */
export function parseSelectorList(prelude: string): readonly ComplexSelector[] | null;
```

### 3.3. La superficie — `src/emit/surface.ts`

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
```

### 3.4. La poda — `src/emit/prune.ts`

```ts
export interface PageSheet {
  readonly key: string;
  readonly css: string;
  readonly scope: StyleScope;
  readonly surface: ScopeSurface;
}

export interface PrunedSheet {
  readonly key: string;
  /** Compactado (`compactProjectCss`). `''` si no queda ninguna regla. */
  readonly css: string;
}

/**
 * Todas las hojas de UNA página a la vez: `@keyframes`, `@font-face` y `@property` se deciden
 * mirando lo conservado en todas ellas (§4.4).
 */
export function prunePage(sheets: readonly PageSheet[]): ParseResult<readonly PrunedSheet[]>;

export const FUD_SHEET_IMPORT = 'FUD0850';
export const FUD_SHEET_UNREADABLE = 'FUD0851';
export const FUD_SHEET_UNUSED = 'FUD0852';
```

### 3.5. El emit — `EmitOptions` y `AssetLinker`

```ts
export interface EmitOptions {
  // …
  /** Podar las hojas de la página (§4). Ausente = como hoy: cada hoja llega entera. */
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

/** La clave con la que la ruta entrega al layout cada hoja de su `<head>` (§4.6). */
export function sheetKey(depth: number, ordinal: number): string;
```

El objeto `route` que recibe un layout gana `sheet(key: string): string`, que devuelve el
elemento completo que va en el `<head>` en su lugar: un `<link>`, un `<style>` o `''`.

### 3.6. `@fudic/vite`

- `LinkedAssets.sheet(absPath, css, origin): string` — el mismo nombre por hash de bytes que
  `url()` (`assets/<base>-<hash>.css`), sobre el CSS **podado**. Entra en el shell igual que
  cualquier cosa enlazada desde un `<head>`.
- En `vite dev`, las hojas podadas se sirven desde memoria bajo `/@fudic/sheet/<base>-<hash>.css`.
- El plugin pasa `pruneStyles: true` en los tres pases (host, SW y edge) y en dev.

---

## 4. Comportamiento

### 4.1. Qué hoja se poda contra qué

| Hoja | Ámbito | Superficie |
|---|---|---|
| `<link rel="stylesheet">` en el `<head>` de un layout de la cadena o de la ruta, con o sin `?inline` | `document` | `documentSurface(page)` |
| Una `globalStyles` | `shadow` | La unión de `shadowSurface` de cada componente de la página cuya cadena la incluye (SDD-43 §4.6) |
| Una `styles` | `shadow` | La unión de `shadowSurface` de cada componente de la página que la elige |

La **página** es el grafo de la ruta: su markup, sus secciones, la cadena de layouts y todo
componente y snippet alcanzable desde ellos.

Solo se poda lo que el compilador puede leer: un `href` relativo que `AssetLinker.textOf`
resuelve. Una URL absoluta, de otro origen o de `public/` se deja como está escrita.

El `<style>` propio de un componente **no** se poda (§7).

### 4.2. La superficie de un ámbito

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

### 4.3. Cuándo se conserva una regla

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
| `:host`, `:host(…)`, `:host-context(…)` | — | Siempre casan |
| `::slotted(x)` | — | `x` casa contra `slotted` |
| `::part(n)` | Casa si `n` está en `parts`, o `parts` es `'any'` | — |

**Anidamiento (CSS nesting).**

- Una regla anidada se resuelve como el navegador: `&` es el selector del padre, y sin `&` es
  un descendiente del padre.
- Si el padre se poda, se van con él sus reglas anidadas.

**Un preludio que `parseSelectorList` no entiende** conserva la regla entera, sin diagnóstico.

### 4.4. Las at-rules

- **`@media`, `@supports`, `@container`, `@layer x { }`, `@scope`, `@starting-style`:** se
  poda su interior. Si queda vacío, se van.
- **`@layer a, b;`** (la declaración de orden), **`@charset`** y **`@namespace`:** se
  conservan siempre. Quitar una declaración de capas cambia la cascada de lo que queda.
- **`@keyframes x`:** se conserva si `x` aparece como identificador en alguna declaración
  conservada de **cualquier** hoja de la página, custom properties incluidas.
- **`@font-face`:** se conserva si su `font-family` aparece como identificador o como string
  en alguna declaración conservada de cualquier hoja de la página. Se mira en todas porque un
  `@font-face` del documento sirve también a los shadow roots.
- **`@property --x`:** se conserva siempre.
- **`@page`, `@counter-style`, `@font-feature-values` y cualquier at-rule desconocida:** se
  conservan.
- **`@import`:** se conserva tal cual y el fichero que importa llega entero. Es `FUD0850`.

Las **declaraciones** no se tocan nunca, custom properties incluidas. Los tokens de `:root`
llegan todos.

### 4.5. Lo que sale

- La hoja podada es la **misma** hoja con reglas de menos. Se conserva el orden, y el texto de
  lo que queda es el que escribió el autor, compactado por `compactProjectCss`. Con una
  superficie que lo contiene todo, la salida es idéntica byte a byte a la de hoy.
- Una hoja que queda vacía en una página **no se emite** en esa página: ni `<link>`, ni
  `<style>`, ni `specifier`. Si una `globalStyles` o una `styles` desaparece así, desaparece
  también de `data-fud-adopt` y de `shadowrootadoptedstylesheets`, porque una lista no puede
  nombrar una hoja que el documento no registró.
- Una hoja que `parseCssRules` no puede leer (llaves sin cerrar, un string o un comentario sin
  terminar) llega **entera**, y es `FUD0851`.

### 4.6. La ruta entrega, el layout escribe

El layout se compila una vez y lo comparten todas sus rutas, así que no puede saber qué
página pinta. La que lo sabe es la ruta, que tiene el grafo entero. Se sigue el patrón que ya
usa `route.runtime(inline)`:

- **En el layout:** por cada `<link rel="stylesheet">` podable de su `<head>` escribe
  `head += route.sheet(K)` en lugar del elemento. `K = sheetKey(profundidad, ordinal)`:
  - `profundidad` es el número de ancestros del layout, que no depende de la ruta;
  - `ordinal` es la posición del `<link>` entre los podables de ese `<head>`.
- **En la ruta:**
  - calcula `prunePage` con todas las hojas de la página;
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

### 4.7. El nombre del fichero podado

- **Por hash de contenido.** `LinkedAssets.sheet` nombra por hash de los bytes podados, igual
  que hoy nombra por hash del fichero: `assets/tokens-3fA9c1Qb.css`. Dos páginas con la misma
  hoja podada comparten URL, así que comparten caché y el build publica un solo fichero.
  Cambiar un componente solo renombra las hojas de las páginas donde cambió lo que se usa.
- **Mismo nombre en todos los pases.** Los tres pases de build compilan el mismo `.fud`, y
  todos obtienen el mismo nombre porque la hash sale del contenido y no del bundler.
- **Entran en el shell.** Las copias podadas se enlazan desde un `<head>`, así que entran en el
  shell (SDD-19 `'head'`) y el Service Worker las precachea al instalar. Una página que nunca
  se visitó abre offline con su hoja.
- **El `<link>` sigue en el `<head>`.** Bloquea el render como hoy, así que no hay FOUC. Solo
  cambia a qué fichero apunta.

### 4.8. En desarrollo

- `vite dev` poda igual. La URL de una copia podada es `/@fudic/sheet/<base>-<hash>.css` y el
  middleware la sirve desde memoria.
- Un cambio en cualquier `.fud` del grafo de una página, o en una hoja, recalcula la poda de
  esa página en la siguiente navegación.

### 4.9. Una hoja que no usa nadie

Al terminar el build, el plugin sabe qué deja cada página de cada hoja. Una hoja que queda
vacía **en todas** las páginas de la aplicación es `FUD0852`, sobre su entrada de `fudic.json`
o sobre su `<link>`. Es CSS muerto, y el autor debería saberlo.

---

## 5. Invariantes

- **Conservadora.** Toda regla que pueda aplicarse a un elemento de la página llega. Ante la
  duda (un selector que no se entiende, una clase interpolada, un valor dinámico) se conserva.
- **Nunca reordena.** Solo quita. La cascada de lo que queda es la que el autor escribió.
- **Por página, en build.** Nada se decide en runtime. El módulo de la ruta lleva las hojas ya
  podadas.
- **Un nombre por contenido.** Dos pases o dos páginas con los mismos bytes podados nombran el
  mismo fichero.
- **El cliente no cambia.** Un componente creado en el navegador adopta la hoja que el
  documento registró (BUG-45), que ya es la podada, y su marcado ya estaba en la superficie.
- **Una sola lista de atributos del framework.** `frameworkAttributesOf` es la única fuente.
  Un atributo que el runtime escribe y la lista no nombra es un defecto de esa lista.
- **Spans en todo y el parser nunca lanza.** `parseCssRules` y `parseSelectorList` devuelven
  lo que entienden. Lo que no entienden se conserva.
- **Ausente = como hoy.** Sin `pruneStyles`, el emit es idéntico byte a byte al de antes de
  este SDD.
- **Cobertura.** Los ficheros nuevos al 100 % en las cuatro métricas. Ningún fichero existente
  por debajo de su suelo en `main`.

### Diagnósticos

| Código | Severidad | Qué dice |
|---|---|---|
| `FUD0850` | warning | La hoja contiene `@import`: el fichero importado llega entero, sin podar. Sobre el `@import`. |
| `FUD0851` | warning | La hoja no se puede leer como CSS (llaves sin cerrar, string o comentario sin terminar) y llega entera. Sobre el punto donde se pierde. |
| `FUD0852` | warning | Una hoja no aporta ninguna regla a ninguna página de la aplicación. Sobre su entrada de `fudic.json` o su `<link>`. |
| `0853`–`0869` | | Reservados. |

---

## 6. Criterios de aceptación

**El árbol de reglas** (`packages/compiler/test/css/rules.test.ts`)

1. `parseCssRules` devuelve reglas de estilo, at-rules de bloque con y sin hijos, sentencias y
   reglas anidadas, con spans que recortan el texto exacto de cada una.
2. Llaves sin cerrar, un string o un comentario sin terminar: no lanza, devuelve lo leído hasta
   ahí y un diagnóstico con span.

**Los selectores** (`test/css/selectors.test.ts`)

3. `parseSelectorList` parte listas, compuestos y combinadores. Extrae tipo, clases, ids,
   atributos con y sin valor, `:is()`/`:where()`, `::slotted()` y `::part()`. Un preludio
   ininteligible es `null`.

**La superficie** (`test/emit/surface.test.ts`)

4. `documentSurface` de una ruta con layout contiene el body del layout, la ruta, sus
   secciones, los hosts y su contenido proyectado. **No** contiene un `h1` que solo está dentro
   del template de un componente.
5. `shadowSurface` contiene el template, los snippets renderizados dentro, las ramas de un
   `@if` falso en SSR y el host de un componente anidado.
6. `class:activo=@x` aporta `activo`; `class="a @b"` aporta `a` y activa `openClasses`;
   `type=@t` deja los valores de `type` en `null`.
7. `frameworkAttributesOf` de un control con `control` y marcador de error incluye
   `aria-describedby` y `aria-invalid`, y un hueco con slot incluye `slot`. Un test recorre
   `@fudic/forms` y comprueba que todo atributo que escribe está en la lista.

**La poda** (`test/emit/prune.test.ts`)

8. Contra una superficie con `h1` y `p`: `h1, h2, h3 { … }` sale como `h1 { … }`, `table { … }`
   desaparece y `:root { --x: 1 }` se queda.
9. `ul > li` se conserva con un `ul` y un `li` en el ámbito, aunque no estén anidados.
10. `.btn:hover`, `a:not(.x)` y `li:nth-child(2n)` se conservan si hay `.btn`, `a` y `li`.
11. En `shadow`: `:host` y `:host(.x)` se conservan siempre; `:root` se va; `::slotted(p)`
    depende de `slotted`. En `document`: `::part(label)` depende de `parts`.
12. Un `@media` que solo contiene reglas podadas desaparece; `@layer a, b;` se queda.
13. Un `@keyframes` o un `@font-face` se conserva si otra hoja **de la misma página** lo
    nombra, y se va si no lo nombra ninguna.
14. Una regla anidada se va con su padre.
15. `@import` es `FUD0850`; una hoja ilegible llega entera con `FUD0851`.
16. Con una superficie que lo contiene todo, la salida es idéntica a `compactProjectCss` de la
    entrada.

**El emit** (`test/emit/page-sheets.test.ts`)

17. Una ruta con layout cuyo `<head>` tiene `<link rel="stylesheet" href="./base.css">` y otro
    con `?inline`: el layout escribe `route.sheet(K)` dos veces; la ruta entrega un `<link>`
    con la URL de `AssetSheet` y un `<style nonce>` con el CSS podado, conservando los demás
    atributos del `<link>` (`media`).
18. Dos rutas con el mismo layout y markup distinto entregan CSS distinto para la misma clave.
19. Una `styles` que queda vacía en una página sale de `PROJECT_STYLES`, de `data-fud-adopt` y
    del `shadowrootadoptedstylesheets` de esa página.
20. Sin `pruneStyles` el emit es idéntico al de `main` (los fixtures actuales, sin cambios).

**Build** (`packages/vite/test/`)

21. Dos páginas con la misma hoja podada apuntan al mismo fichero; una tercera distinta, a
    otro. El host, el pase del SW y el edge escriben la misma URL, y el fichero se publica una
    sola vez.
22. Las copias podadas están en el shell del manifiesto.
23. En `vite dev` el `<link>` de la página apunta a `/@fudic/sheet/…` y el middleware sirve
    ese CSS.
24. Una hoja que no aporta nada a ninguna página es `FUD0852`.

**Evidencia** (`examples/basic`)

25. `examples/basic` gana una guía de tamaño real, `src/styles/base.css`: reset, tipografía,
    listas, tablas, formularios y `@keyframes`, en torno a 10 KB. `_layout.fud` la enlaza con
    `?inline`, junto al `tokens.css` que ya enlaza como fichero.
    [SDD-49-medicion.md](./SDD-49-medicion.md) recoge, por página, los bytes de cada hoja antes
    y después, y cuántas copias distintas de cada hoja publica el build.
26. **Todas las páginas se ven igual que antes de podar**, en Chrome y con el Service Worker
    activo, también offline en una página que no se ha visitado. **Verificado por Pedro en
    navegador.**
27. **Cobertura.** Los ficheros nuevos al 100 % en las cuatro métricas; ninguno existente por
    debajo de su suelo en `main`.

---

## 7. Fuera de alcance

- **El `<style>` propio de un componente.** Lo escribe el autor para su template. No es una
  guía compartida y no se poda.
- **Comprobar la estructura de los combinadores.** `ul > li` con `li` fuera de todo `ul` se
  conserva. Afinarlo es una mejora de la misma poda, sin cambiar su interfaz.
- **Podar declaraciones o custom properties sin uso.** Un `var()` puede venir de un `style=` o
  del JS, y los tokens son el contrato de la guía.
- **Seguir un `@import`.** Se conserva y se avisa (`FUD0850`).
- **`classList`, `innerHTML` y el DOM escrito a mano en `@client`.** No se contemplan (§1.2).
- **El CSS muerto en el editor.** Tachar en el language server las reglas que ninguna página
  usa sale casi gratis de la superficie, pero es otra spec.
