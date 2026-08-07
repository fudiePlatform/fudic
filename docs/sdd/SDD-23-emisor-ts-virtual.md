# SDD-23 — Emisor de TypeScript virtual (`@fudic/language-core`)

> **Estado:** `Hecho` — los 9 mutantes de §6 y los criterios 10–14 verdes; 117 tests,
> cobertura 100 % (líneas, funciones, ramas, sentencias).
> **Paquete:** `@fudic/language-core`
> **Naturaleza:** emisor. **Segundo emisor sobre el mismo AST**, distinto del emisor de
> runtime: optimiza **fidelidad de mapeo**, no eficiencia de ejecución.
> **Validado:** proyección manual de `blog/[slug].fud`, `app-badge.fud`, `site-nav.fud`
> y `_layout.fud` a sus virtuals, typechequeada con `tsc 5.9.3` bajo la config estricta
> de SDD-00 (`strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`,
> `verbatimModuleSyntax`). Batería de 9 casos en §6.

---

## 1. Contexto y objetivo

Producir, a partir del AST de un `.fud`, **ficheros TypeScript sintéticos** (*virtual
files*) más la **tabla de mapeo** entre sus offsets y los del `.fud` original, de modo que
`tsserver` proporcione completado, hover, go-to-definition, rename, narrowing y
diagnósticos **sin que el proyecto escriba lógica de inteligencia propia**.

La tesis del documento, y su decisión de fondo: **no se implementa inteligencia; se
implementa una proyección**. Todo lo que un LSP haría a mano (resolver un tag a un
componente, validar el tipo de un atributo, tipar `data`, prohibir un símbolo `@server` en
la plantilla) se convierte en un error del comprobador de tipos de TypeScript. La
consecuencia práctica es que reglas ya decididas de la gramática dejan de necesitar
validador propio: la decisión 19 (solo primitivas escalares en interpolación) y la
decisión 41 (custom element exige `<link rel="component">`) las emite el tipo, no un
`if`.

**No se reutiliza el emisor de runtime.** Comparten AST y nada más. El emisor de runtime
puede colapsar, reordenar y elidir; este no puede hacer ninguna de las tres cosas, porque
cada token emitido debe ser rastreable a un span del origen.

---

## 2. Dependencias

- **Parser (`SDD-01`–`SDD-10`)** — AST con `Span` universal, tolerante a errores,
  navegable por offset. El emisor **no** reparsea.
- **Integración Oxc (`SDD-11`)** — los fragmentos JS/TS del `.fud` ya vienen parseados en
  el buffer sintético con su tabla de regiones; el emisor consume los nodos, no el texto,
  salvo en los pasajes de copia literal (§4.3).
- **Registro de componentes del fichero** — el mapa `tag → ruta del .fud` resuelto desde
  los `<link rel="component">` del propio fichero, y el `rel="layout"` resuelto a su
  fichero. El emisor consume ese registro; **no resuelve rutas ni lee disco por su
  cuenta**.

  El `ComponentRegistry` de SDD-12 (`{ has(tag): boolean }`) **no basta** —solo responde
  sí/no— y `resolveComponents()` del emisor de runtime **tampoco sirve**: lee disco de
  forma síncrona y transitiva, que es justo lo que un LSP no puede hacer por pulsación.
  Este SDD define su propia interfaz, estrecha y sin I/O:

  ```ts
  export interface FileRegistry {
    /** Ruta del `.fud` al que resuelve un tag, o undefined si no está declarado. */
    component(tag: string): string | undefined;
    /** Ruta del layout del fichero, si declara `<link rel="layout">`. */
    layout(): string | undefined;
  }
  ```

  Quien la implementa —y quien mantiene el índice del workspace que la alimenta— es el
  servidor (SDD-24 §4.5). Aquí es un puerto inyectado (DIP), igual que `ResolveIo` en el
  emisor de runtime.
- **Ambientes globales (§3.3)** — este paquete los exporta como constante de texto. El
  servidor los monta como **lib virtual** en el programa de TS, de modo que el LSP arranca
  en cualquier proyecto sin scaffolding previo; la CLI escribe el **mismo** texto en disco
  (`fudic-globals.d.ts`) para que `tsc` y el CI vean lo mismo. Un solo origen, dos
  consumidores: si divergen, el editor y el build dejan de coincidir.

---

## 3. Interfaz pública

### 3.1. API del módulo

```ts
export interface VirtualFile {
  /** Ruta virtual, derivada de la del .fud. Ver §4.1. */
  readonly fileName: string;
  readonly languageId: 'typescript' | 'css';
  readonly text: string;
  readonly mappings: readonly Mapping[];
}

export interface Mapping {
  readonly sourceOffset: number;    // offset en el .fud
  readonly generatedOffset: number; // offset en el virtual
  readonly length: number;          // longitud en el virtual
  /**
   * Longitud en el `.fud`. Igual a `length` en toda copia literal —que es la inmensa
   * mayoría— y **distinta** cuando un tramo *representa* origen que no reproduce: el tag
   * proyectado `$C_app_missing` son 14 caracteres que valen por los 11 de `app-missing`.
   * Con una sola longitud, ese diagnóstico subraya tres caracteres de lo que venga detrás
   * del tag. Volar separa los dos lados por la misma razón.
   */
  readonly sourceLength: number;
  readonly caps: MappingCaps;
}

/**
 * Qué capacidades del LSP viajan por este tramo de mapeo. Son **exactamente** los seis
 * flags de `CodeInformation` de Volar 2.x, con sus nombres: el servidor los pasa tal cual,
 * sin traducir. Inventar aquí un vocabulario propio (`hover`, `rename`, `definition`)
 * obliga a un mapeo 6→6 con pérdida en la frontera, y la pérdida siempre cae del lado de
 * "el andamiaje se volvió visible".
 */
export interface MappingCaps {
  /** Completado dentro del tramo. */
  readonly completion: boolean;
  /** Diagnósticos: se reportan al origen o se descartan. */
  readonly verification: boolean;
  /** Hover, inlay hints, signature help, semantic tokens. */
  readonly semantic: boolean;
  /** Definición, referencias, rename, highlight. */
  readonly navigation: boolean;
  /** Document symbols, folding, linked editing. */
  readonly structure: boolean;
  /** El tramo participa en el formateo. Siempre `false`: formatear es SDD-26 sobre el
   *  origen, nunca sobre el virtual. */
  readonly format: boolean;
}

export interface EmitInput {
  readonly source: string;             // el texto del .fud: toda copia literal es un slice suyo
  readonly fileName: string;           // ruta del .fud; de ella salen los tres nombres virtuales
  readonly document: StructuredDocument;
  readonly registry: FileRegistry;
}

export function emitVirtualFiles(input: EmitInput): readonly VirtualFile[];
```

La entrada es un objeto y no `(ast, registry)` porque el AST **no lleva ni el texto ni la
ruta**, y el emisor necesita los dos: copia por spans sobre el texto, y de la ruta derivan
`<name>.fud.ts`, `<name>.fud.server.ts` y los `.css`.

Tres perfiles de `caps`, no dos: `USER_CAPS` (código del usuario), `SCAFFOLD_CAPS`
(andamiaje, todo a `false`) y **`DIAGNOSTIC_ONLY_CAPS`**, que existe para un único tramo —
el tag proyectado como nombre de tipo. Ese identificador es andamiaje cuyo propósito es
*estar sin declarar*: el `TS2304` tiene que llegar al origen, y a la vez el completado y el
rename no, porque nadie quiere sugerencias de tipos de TypeScript dentro de un nombre de
tag. Marcarlo como código de usuario haría que la proyección mienta sobre lo que el usuario
escribió; marcarlo como andamiaje descartaría en silencio el error que la proyección existe
para producir.

`MappingCaps` no es un adorno. Un tramo emitido a partir de código del usuario lleva todas
las capacidades a `true`; un tramo de **andamiaje** (el `function $tpl(){`, los `import
type` sintéticos, el `declare const data`) lleva **todas a `false`** y por tanto es
invisible: no acepta rename, no reporta diagnóstico, no responde a hover. Esta es la
pieza que separa un LSP correcto de uno que le ofrece al usuario renombrar `$tpl`.

### 3.2. Contrato hacia otros virtuals

Cada `.fud` de componente o layout expone, en su virtual, un contrato consumible por los
demás:

```ts
export type $Props = /* derivado de la llamada a props<T>() */;
export type $Sections = /* solo layouts: unión de nombres de sección declarados */;
```

`$Props` es `never` si el componente no llama a `props<T>()`; `$Sections` es `never` en un
fichero que no es layout.

**Los dos se emiten siempre, y `never` no es lo mismo que ausente.** Un padre que pasa
atributos a un componente que no acepta ninguno debe fallar **en los atributos**; si el
export no existiera, fallaría en el import — un error sobre andamiaje, en el fichero
equivocado. `$Sections` de un layout se deriva de sus `@RenderSection(name)`, copiando cada
nombre desde su directiva, de modo que ir a definición sobre el nombre de una sección en la
ruta aterriza en el `@RenderSection` que la consume.

### 3.3. Ambientes globales (`fudic-globals.d.ts`)

Exportados por este paquete como constante (`export const GLOBALS_DTS: string`). El
servidor los monta como lib virtual; la CLI escribe ese mismo texto en el proyecto del
usuario para `tsc` y el CI. Son el vocabulario contra el que se proyecta la plantilla:

```ts
declare function props<T>(): T;

type $Scalar = string | number | boolean | bigint | null | undefined;

declare function $text(v: $Scalar): void;
declare function $attr(v: $Scalar): void;
declare function $attrs<T>(a: T): void;
declare function $on<K extends keyof HTMLElementEventMap>(
  type: K, h: (ev: HTMLElementEventMap[K]) => unknown): void;
declare function $section<T extends string>(name: T): void;
declare function $cls(v: boolean): void;
declare function $sty(v: string): void;
declare function $slot(): void;
declare function $ref<E extends Element>(): E;

type $El<T extends string> = T extends keyof HTMLElementTagNameMap
  ? HTMLElementTagNameMap[T]
  : HTMLElement;
```

`$El<T>` es lo que da a `ref` el tipo del elemento concreto sin mantener una tabla propia:
`ref="@box"` en un `<div>` proyecta `box = $ref<$El<'div'>>()`. La tabla la tiene ya
TypeScript en `HTMLElementTagNameMap`, y una copia nuestra envejecería sola.

Todos los identificadores del ambiente empiezan por `$`, coherente con el **namespace `$`
reservado al compilador**. Un identificador de usuario con prefijo `$` ya es error
semántico; aquí eso deja de ser una convención y pasa a ser la condición que garantiza que
el andamiaje nunca colisiona con el código copiado literalmente.

---

## 4. Comportamiento

### 4.1. Dos virtuals de TypeScript por fichero, más uno de CSS por `<style>`

| Virtual | Contenido | Por qué |
|---|---|---|
| `<name>.fud.ts` | zona neutra de `@code` + región `@client` + **proyección de la plantilla** | Es el fichero que ve el usuario cuando edita markup. |
| `<name>.fud.server.ts` | zona neutra de `@code` + región `@server` | Aísla el entorno de servidor. **Se emite siempre**, aunque el fichero no tenga `@server`: ver §4.2. |
| `<name>.fud.<n>.css` | cada `<style>`, con las regiones Razor sustituidas | El service de CSS necesita CSS válido. |

**La separación `@server` / `@client` la verifica el comprobador de tipos, no una regla ad
hoc.** Son dos programas distintos; la plantilla no importa el virtual de servidor como
valor. Si el usuario referencia `findPost` en la plantilla, `tsserver` emite `TS2304
Cannot find name` sin que exista validador alguno. Verificado (caso B, §6).

**La zona neutra se duplica** en ambos virtuals: sus declaraciones deben estar visibles a
los dos lados. Consecuencia obligatoria: los diagnósticos que caen dentro del span de la
zona neutra se **deduplican** eligiendo `<name>.fud.ts` como virtual canónico. Sin esta
regla el usuario ve cada error de la zona neutra dos veces.

### 4.2. Derivación de `data` en modo página

La plantilla de una página no declara el tipo de `data`; lo deriva del `load()` del
virtual de servidor:

```ts
type $Data = Awaited<ReturnType<typeof import('./[slug].fud.server')['load']>>;
declare const data: $Data;
```

Es un `import type` de un `typeof import(...)`: no arrastra valor al programa cliente.

**Por eso el virtual de servidor se emite siempre**, incluso sin `@server` (cuerpo vacío
con `export {}`). Si no existiera el fichero, el `import` de arriba daría `TS2307 cannot
find module` —un error sobre andamiaje, sin span útil en el origen— en vez del error que
se busca. Con el virtual vacío, `typeof import(...)['load']` no resuelve la propiedad,
`$Data` degrada a `unknown` y **todo acceso a `data` falla localizado en la plantilla**,
que es el diagnóstico correcto. La diferencia entre las dos formas de fallar es la
diferencia entre un LSP usable y uno que señala un fichero que el usuario no ha escrito.

Cambiar el contrato de `load()` rompe la plantilla sin tocar la plantilla. Verificado
(caso H, §6).

### 4.3. Copia literal frente a construcción

- Todo fragmento JS/TS del usuario (`@code`, cuerpo de `@client`/`@server`, cabeceras de
  control, expresiones `@(...)` y `@expr`) se **copia literalmente**, con mapeo 1:1 de
  longitud idéntica. No se reformatea, no se normaliza, no se reindenta. Cualquier
  reescritura destruye el mapeo de columnas y arruina hover y rename.
- Todo lo demás es **andamiaje** con `caps` a `false`.

### 4.4. Tabla de proyección

| Construcción `.fud` | Forma TS emitida |
|---|---|
| `<link rel="component" href="./x.fud">` | `import type { $Props as $C<n> } from './x.fud';` |
| `<link rel="layout" href="./l.fud">` | `import type { $Sections as $L0 } from './l.fud';` |
| `props<T>()` en `@code` | `const $p0 = props<T>();` + `export type $Props = typeof $p0;` + el destructuring del usuario copiado literalmente sobre `$p0` |
| `<app-badge …>` (tag registrado) | `$attrs<$C<n>>({ …props… });` + `$attrs<{}>({ …atributos planos… });` |
| `<app-foo …>` (tag **no** registrado) | `$attrs<$C_app_foo>({ … });` con `$C_app_foo` **no declarado** ⇒ `TS2304` sobre el tag (decisión 41) |
| `attr="@expr"` (único `at_construct`) | propiedad del objeto con el valor **tal cual**: tipo exacto contra la prop |
| `attr="pre-@expr-post"` (concatenación) | propiedad con *template literal*: se comprueba como `string` (decisión 20) |
| `.prop="@expr"` / `.prop="v"` / `.prop` | propiedad con el valor tal cual, tipo exacto (decisiones 23, 24, 44) |
| atributo estático `attr="v"` | propiedad con literal de string |
| atributo booleano `disabled` | propiedad `true` (decisión 44) |
| `@click="@h"` | `$on('click', h);` — `'click'` **copiado** del fuente, 1:1 y sin las comillas |
| `@click="@(e => …)"` | `$on('click', e => …);` — `e` tipado como `MouseEvent` |
| `@my-event="@h"` | `$on('my-event' as never, h);` — evento custom, sin tipo de evento (decisión 28) |
| `class:foo="@x"` | `$cls(x);` ⇒ exige `boolean` |
| `style:foo="@x"` | `$sty(x);` ⇒ exige `string` |
| `ref="@v"` | `v = $ref<HTMLDivElement>();` — **asignación, no declaración**, con el elemento concreto del tag |
| `@name` / `@(expr)` en texto | `$text(expr);` ⇒ exige `$Scalar` (decisión 19) |
| `@if (c) { A } else { B }` | `if (c) { …A… } else { …B… }` |
| `@foreach (const x of xs) { … }` | `for (const x of xs) { … }` |
| `@for (…) { … }` / `@while (…) { … }` | la sentencia homóloga |
| `@switch (e) { case k: … }` | `switch (e) { case k: { … } break; }` — `break` sintético por decisión 14 |
| `@{ … }` | bloque `{ … }` copiado literalmente |
| `@section nav { … }` | `$section<$L0>('nav');` + los hijos en el mismo ámbito |
| `<slot>` | `$slot();` |
| `@* … *@` | nada (decisión 37); el span queda sin mapeo |

**Un tag de componente proyecta DOS literales (BUG-16 §4.2).** Un `.prop` y un atributo plano
no son dos maneras de decir lo mismo: el punto es la única vía de prop (decisión 41.c), así que
solo los `property` entran en el literal de contrato `$attrs<$C<n>>`. Los planos van a un
`$attrs<{}>({ … })` propio —que es `{} & $GlobalAttrs`, o sea el vocabulario de HTML y nada
más—, y así `id`, `role`, `data-*` y `aria-*` pasan mientras `tone="info"` reporta `TS2353`
sobre el nombre, con la sugerencia de TypeScript cuando se parece a un global. El segundo
literal se emite **solo si hay algún atributo plano**, y las anclas del hueco del tag apuntan al
de **contrato**, que es lo que se quiere completar ahí. `slot` sigue fuera de los dos, con
`$intoSlot` (BUG-11).

**El nombre de un evento se copia, no se inventa (BUG-16 §4.4).** Es lo que hace que el `@`
ofrezca la lista: el primer parámetro de `$on` es `keyof HTMLElementEventMap`, el diccionario
del DOM tecleado sin `on`, y preguntarle a esa posición **es** pedir la lista. El tramo mide
**1:1** con el fuente y las comillas quedan de andamiaje a los lados: TypeScript devuelve el
rango de reemplazo sin ellas, así que sus dos extremos ya caen dentro del tramo, mientras que un
tramo dos caracteres más largo desplaza cada offset de su interior — con `@cli` el rango volvía
sobre `li` y aceptar `click` escribía `@cclick`.

**`ref` proyecta una asignación porque la variable es del usuario.** Por la decisión 30,
`ref="@v"` es un identificador simple que el usuario **ya declaró** en `@code` (`let v`);
el runtime solo lo asigna. Emitir `const v = …` lo redeclararía (`TS2451`) y, peor, le
robaría al usuario la declaración a la que apunta go-to-definition. La asignación además
comprueba el tipo en la dirección correcta: `HTMLDivElement` contra lo que el usuario haya
declarado.

**El control de flujo se emite como control de flujo real.** Es innegociable: es lo que
regala narrowing y scoping léxico dentro de los bloques. Una lista plana de expresiones
pierde ambos. Verificado: narrowing dentro de `@if` (caso G) y tipo del item de
`@foreach` (caso I).

### 4.5. Virtual de CSS

Un virtual por cada `<style>`. Las regiones Razor se sustituyen por placeholders de la
**misma longitud** que el texto original, de modo que el mapeo es la identidad y no hace
falta tabla: `@bp.tablet` (10 caracteres) → 10 caracteres de relleno léxicamente válidos
en esa posición gramatical.

**La identidad solo se sostiene si el virtual empieza en el offset 0 del `.fud`**, así que
todo lo anterior al cuerpo del `<style>` se emite como blancos, conservando los saltos de
línea. Arrancar el fichero en el cuerpo desplazaría cada diagnóstico de CSS por la longitud
del markup que tiene encima — offset, línea y columna. El relleno es un identificador,
porque una región Razor en CSS casi siempre ocupa una posición de **valor**
(`color: @theme.fg`); donde no lo sea, suprimir la queja es del servidor (SDD-24 §4.4), no
del emisor adivinar. Se suprimen por regla los diagnósticos de pseudo-elemento
desconocido para `:host`, `:host()`, `:host-context()` y `::slotted()`.

### 4.6. Tolerancia a errores

Ante un `.fud` con diagnósticos de parseo, el emisor **emite igualmente** el mejor virtual
posible a partir del AST parcial. Un fichero a medio escribir es el estado normal de un
editor; negarse a emitir apaga el completado justo cuando hace falta.

---

## 5. Invariantes LSP

- **Todo tramo emitido lleva `Mapping` con `caps` explícitas.** No hay texto emitido sin
  clasificar como código de usuario o andamiaje.
- **Los fragmentos del usuario se copian con longitud idéntica.** Mapeo 1:1; ninguna
  transformación de texto.
- **El emisor nunca lanza.** AST parcial ⇒ virtual parcial.
- **Determinismo.** Mismo AST ⇒ mismo virtual byte a byte. Es lo que permite cachear por
  versión de documento.
- **El andamiaje es invisible.** Ningún identificador sintético acepta rename ni aparece
  en completado. El namespace `$` reservado lo garantiza por construcción.
- **Un diagnóstico, un sitio.** Los de la zona neutra se deduplican contra el virtual
  canónico.

---

## 6. Criterios de aceptación

Corpus: `blog/[slug].fud` y `app-badge.fud` (los dos ficheros reales), más
`site-nav.fud` y `_layout.fud`. Config de SDD-00 con `lib: ["ES2024","DOM"]`.

**Caso base.** Los cuatro ficheros proyectados typechequean con **cero errores**.
Verificado.

**Batería de mutantes.** Cada mutación produce exactamente el error indicado, y en el
span del origen tras aplicar el mapeo inverso:

| # | Mutación en el `.fud` | Diagnóstico esperado |
|---|---|---|
| A | `tone="@('bogus')"` | `TS2322` — `'bogus'` no asignable a `Tone` |
| B | la plantilla referencia `findPost` (símbolo de `@server`) | `TS2304` — nombre no encontrado |
| C | `@section footer` con layout que solo declara `nav` | `TS2345` — `'footer'` no asignable a `'nav'` |
| D | `<app-missing>` sin su `<link rel="component">` | `TS2304` sobre el tag |
| E | `@data` con `data` de tipo objeto | `TS2345` — no asignable a `$Scalar` |
| F | `<site-nav currnt="blog">` | `TS2561` con sugerencia `current` |
| G | `@if (data.note !== undefined) { @data.note.toUpperCase() }` | **cero errores** (narrowing efectivo) |
| H | se elimina `body` del tipo devuelto por `load()` | `TS2339` en `@data.body`, sin tocar la plantilla |
| I | `@foreach (const it of xs) { @it.nope }` | `TS2339` sobre `nope`, con el tipo del item |

Los nueve verificados en Node antes de redactar este documento, y **de nuevo al
implementarlo**, con `tsc` real sobre el corpus proyectado (`test/typecheck.ts` monta un
programa en memoria con esta misma configuración y mapea cada diagnóstico de vuelta al
`.fud`).

Dos precisiones que salieron de esa verificación:

- **Caso A: el span cae en el nombre del atributo, no en el valor.** TypeScript ancla el
  desajuste de un literal de objeto en la **propiedad**, igual que hace con un atributo
  JSX. El mensaje habla de `'bogus'`; el subrayado va sobre `tone`. Es el comportamiento
  correcto y el que el usuario espera de su editor.
- **Un diagnóstico se mapea por rango, no por punto.** El caso C reporta sobre `'footer'`
  *con las comillas*, que son andamiaje: el tramo mapeado está **dentro** del rango
  reportado. Anclando solo en el offset inicial, el diagnóstico se pierde entero.

**Criterios adicionales de mapeo** (se comprueban sobre el resultado de `emitVirtualFiles`,
no con `tsc`):

10. **Rename acotado.** Renombrar `tone` desde la plantilla alcanza su declaración en
    `@code` y todas sus referencias, y **no** alcanza ningún identificador sintético.
11. **Andamiaje mudo.** Ninguna posición del `.fud` mapea a un tramo con `caps.rename` o
    `caps.diagnostic` en `true` que corresponda a andamiaje.
12. **Sin duplicados.** Un error introducido en la zona neutra de `@code` se reporta una
    sola vez pese a estar en los dos virtuals.
13. **Emisión parcial.** Un `.fud` con un `<div>` sin cerrar produce virtual y completado
    dentro de las partes sanas.
14. **Determinismo.** Dos emisiones del mismo AST son idénticas byte a byte.

---

## 7. Fuera de alcance

- **Servidor LSP, transporte y ciclo de vida** — SDD-24.
- **Extensión de VS Code, TextMate, comandos** — SDD-25.
- **Formateo** — SDD-26. Este emisor no formatea nada, ni el virtual ni el origen.
- **Tipado del `@server` contra el runtime de SSR** (firma de `load`, contrato de
  `params` por ruta): aquí `load` se consume tal como el usuario lo declare. La derivación
  de `params` desde el patrón de la ruta es un SDD aparte.
- **Emisión de runtime.** Este documento no toca el emisor de producción; comparten AST y
  nada más.
- ~~**Tipado de `<slot>` nombrado.**~~ **Ya no.** Lo trae
  [BUG-11](./bugs/BUG-11-slot-como-prop.md): un componente exporta `$Slots` con los nombres de
  sus `<slot name>`, copiados desde su span, y un `slot=` en el consumidor se comprueba contra
  esa unión con `$intoSlot<$S0>(…)` en vez de entrar en el literal de props. `$slot()` sigue
  siendo la marca sin tipo **dentro** del componente; lo que ganó tipo es el nombre.
- **Tipado del contenido proyectado.** Prohibir hijos en un componente que no declara ninguna
  ranura (`$Slots = never` ⇒ nada puede ir dentro) pide un `$children<T>()` que no existe.
  Apuntado al final de BUG-11 como lo que viene después.
- **Two-way binding** — no existe en la gramática v1.
