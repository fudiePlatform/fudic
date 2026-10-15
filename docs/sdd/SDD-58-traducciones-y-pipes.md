# SDD-58 — Traducciones y pipes

> **Estado:** `En curso` — [tareas](./SDD-58-Task.md), 47 / 48.
> **Paquetes:** `@fudic/i18n` (nuevo) · `@fudic/compiler` · `@fudic/config` · `@fudic/vite` ·
> `@fudic/cli` · `@fudic/language-core` · `@fudic/language-server` · `@fudic/diagnostics` ·
> `examples/i18n` (nuevo)
> **Depende de:** 12 (semántica), 15 (emit), 17 (hidratación), 19 (plugin Vite), 20 (render en el
> SW), 22 (CLI), 23 (proyección TS), 35 (compilo o no compilo), 40 (props de layout),
> 41 (configuración), 43 (librerías), 45 (runtime publicado), 50 (diagnósticos), 51 (expresiones
> de la vista)
> **Rango de diagnósticos:** `FUD1020`–`FUD1039` (usa `FUD1020`–`FUD1026`). `FUD0725` gana el
> problema `locales`.
> **Decisiones:** 158–161 (nuevas). La 158 enmienda SDD-51 §3.2: en la vista `|` deja de ser el
> OR de bits. Especifica la §4 de [IDEA-03](./ideas/IDEA-03-backend-poliglota.md) (pipes como datos).
>
> **De dónde sale.** Del estudio de viabilidad del 2026-10-15. Una prueba con el parser real sobre
> los 98 `.fud` de los fixtures y de `examples/basic` sacó 424 mensajes y midió la agrupación por
> frase. Todas las decisiones de diseño las tomó Pedro en esa sesión; esta spec no deja ninguna
> abierta:
>
> - **Producto completo o nada.** No hay fases de producto: lo que aquí se describe sale entero.
> - **Lo que se pinta como texto en el HTML se traduce solo.** `t()` solo donde el compilador no
>   puede saber si un string es texto: el valor de una prop y el código TS.
> - **Formatos y locale, con los pipes de IDEA-03.** El locale nunca lo escribe el autor.
> - **Clave = hash de texto + contexto.** Si el texto cambia, la traducción no se pierde: queda
>   *a revisar*.
> - **JSON con ICU**, un fichero por idioma.
> - **Extraer es un comando aparte, `fudic translate`** (`pnpm translate`), fuera del pipeline.
>   `pnpm dev`, `pnpm build` y `pnpm preview` no extraen, no escriben catálogos y no avisan de
>   nada: solo los leen. Lo que falta sale con el texto original. Si no se ejecuta el comando, es
>   cosa del desarrollador.
> - **Idiomas en la config** y prefijo automático en todas las rutas.

---

## 1. Contexto y objetivo

Una aplicación fudic hoy está en un solo idioma. El `<html lang>` lo pone el layout (SDD-40), y
para formatear una fecha o un precio hay que llamar a `Intl` con un locale escrito a mano, porque
FUD0912 (SDD-51) obliga a hacerlo explícito. El resultado es `new Intl.NumberFormat("es")` en la
vista: correcto hoy y roto el día que la página exista en otro idioma.

Esta spec añade tres cosas que solo funcionan juntas:

1. **Traducir.** `fudic translate` extrae el texto visible de cada `.fud` y los `t("…")` del
   código, y escribe un catálogo JSON por idioma. El build lee esos catálogos y compila cada
   módulo una vez **por idioma**, con el texto ya traducido dentro.
2. **Formatear.** Pipes en la vista, `@(precio | euros)`, sobre un catálogo cerrado de `Intl`. El
   preset es un dato; el locale lo pone el compilador.
3. **Servir.** `"locales": ["es", "en"]` en `fudic.json`. Cada ruta sale bajo `/es/…` y `/en/…`,
   y `/` redirige.

| | Antes | Ahora |
|---|---|---|
| Texto de la vista | Literal, en un idioma | Lo extrae `fudic translate`; el build lo compila ya traducido por idioma |
| Texto en props y en TS | Literal | `t("…")`, extraído y compilado igual |
| Formatear | `Intl` con el locale a mano | `@(x \| pipe)`; el locale lo pone el compilador |
| URL | `/about` | `/es/about`, `/en/about`; `/` redirige |
| `<html lang>` | Lo escribe el layout | El del idioma, si el layout no escribe el suyo |
| Runtime en el navegador | — | Solo si se usa un pipe o un plural: piezas de `@fudic/i18n` |

**Por qué compilar por idioma y no buscar en una tabla al pintar.** El texto traducido es una
constante del módulo, exactamente como lo es hoy el texto sin traducir. De ahí salen gratis cuatro
propiedades que una tabla en runtime tendría que construir:

- **N1 sigue sin JavaScript.**
- **El servidor, el Service Worker y el cliente escriben el mismo texto.** La hidratación no compara
  textos y un desajuste no daría error, así que esta propiedad importa.
- **No hay estado de idioma en ningún módulo** (regla de poda del runtime).
- **El navegador descarga solo su idioma.**

El coste es tiempo de build y bytes en `dist`, proporcionales al número de idiomas. Ningún usuario
los paga.

## 2. Dependencias

- **SDD-12.** `ANALYZERS` (`compiler/src/semantic/analyze.ts:41`) y `FragmentCheck` de
  `view-js.ts`: el sitio de las comprobaciones nuevas de la vista.
- **SDD-15.** `MarkupEmitter` (`emit/markup.ts:270`), el emit de cliente (`emit/markup-client.ts`),
  `textRun` (`emit/runs.ts:213`) y `writeElementAttrs` (`emit/attrs.ts:500`): donde hoy se
  escribe cada literal de texto y de atributo. `EmitOptions` (`emit/module.ts:74`) recibe la opción
  nueva.
- **SDD-11.** `JsBatch` (`oxc/batch.ts:104`): una sola llamada a Oxc por fichero. La extracción de
  literales en posición de resultado y de `t()` recorre ese mismo árbol.
- **SDD-17.** El mapa de hidratación por ruta: pasa a ser por ruta e idioma.
- **SDD-19.** `discoverRoutes` (`vite/src/discover.ts:55`), `buildManifest`, el prerender
  (`vite/src/prerender.ts`), el middleware de dev (`plugin.ts:733`) y el de preview.
- **SDD-20.** El router del SW (`transport/src/router.ts`), que encuentra la ruta por patrón y
  deriva de él la URL de datos (`transport/src/urls.ts:80`).
- **SDD-22.** El CLI: cada comando es un plan (`plan* → apply`) que devuelve los ficheros que
  cambia y sus diagnósticos (`packages/cli/src/index.ts`), y el binario es una capa encima.
  `parseFud` (`cli/src/parse.ts:24`) es su única puerta a un `.fud`.
- **SDD-23.** `copyRazor`/`copyExpression` (`language-core/src/template/expr.ts:21,28`), el
  escritor con `copy`/`scaffold` (`writer.ts`) y `GLOBALS_DTS` (`globals.ts:64`).
- **SDD-35.** El chequeo de tipos en `buildStart` y en dev, que convierte un error de TS en un
  `.fud` en un build fallido. Un pipe mal tipado cae ahí.
- **SDD-40.** El `<html>` del layout se emite por `writeOpenTag` (`emit/parts.ts:314`). La página
  sin layout tiene hoy `lang="es"` fijo (`emit/module.ts:671`).
- **SDD-41.** `readProjectConfig` (`config/src/read.ts:76`) y `FUD0725` con su unión de problemas.
- **SDD-43.** Una librería publica `.fud` fuente que compila el consumidor, así que su texto se
  traduce en el catálogo de la app.
- **SDD-45.** Un paquete con `"fudic": { "runtime": "./runtime" }` publica sus piezas y la app
  enlaza solo las que su grafo nombra (`vite/src/runtime-pieces.ts:81`).
- **SDD-50.** Un código, un fichero `.ts` + `.md`, una línea en `index.ts`. La severidad es del
  código, no de la llamada.
- **SDD-51.** La lista blanca de la vista y `VIEW_GLOBALS` (`semantic/view-globals.ts:13`).

## 3. Interfaz pública

### 3.1 `fudic.json`

```jsonc
{
  "id": "mi-app",
  "kind": "app",
  "prefix": "app",
  "locales": ["es", "en"]   // nuevo. El primero es el idioma en que está escrito el código.
}
```

- **Forma.** Array no vacío de etiquetas BCP 47. Cada una se normaliza con
  `Intl.getCanonicalLocales` y no puede repetirse.
- **Error.** Cualquier fallo es `FUD0725` con `problem: 'locales'`, subrayando la clave.
- **Ausente.** La app no tiene idiomas: ni extracción, ni catálogos, ni prefijos.
  - Usar un pipe, `t()`, `format()` o `locale` en ella es `FUD1021`.
  - El resto del framework se comporta byte a byte como antes de esta spec.

### 3.2 `@fudic/i18n`

Paquete nuevo, sin dependencias de runtime. Cuatro cosas: los presets de los pipes, tres nombres
que el compilador sustituye, las piezas de runtime y el catálogo.

```ts
// ── Presets: datos, legales en las tres zonas de @code y en .ts ─────────────
/** A pipe: a formatter preset over Intl. Pure data; the locale is added by the compiler. */
export interface Pipe<in T> {
  readonly kind: 'date' | 'number' | 'currency' | 'percent' | 'relative-time' | 'list';
  readonly options: Readonly<Record<string, unknown>>;
  /** Phantom: the type of the value this pipe accepts. Never present at runtime. */
  readonly __in?: (value: T) => void;
}

/** `timeZone` is required: a date formatted without one differs between server and browser. */
export function date(options: Intl.DateTimeFormatOptions & { timeZone: string }): Pipe<Date | number>;
export function number(options?: Intl.NumberFormatOptions): Pipe<number | bigint>;
export function currency(code: string, options?: Omit<Intl.NumberFormatOptions, 'style' | 'currency'>): Pipe<number | bigint>;
export function percent(options?: Omit<Intl.NumberFormatOptions, 'style'>): Pipe<number>;
export function relativeTime(unit: Intl.RelativeTimeFormatUnit, options?: Intl.RelativeTimeFormatOptions): Pipe<number>;
export function list(options?: Intl.ListFormatOptions): Pipe<readonly string[]>;

// ── Sustituidos por el compilador en cada módulo de un grafo de idioma ───────
/** The page's locale. Compiled to a string literal: `"en"`. Outside the compiler, `"und"`. */
export declare const locale: string;
/** A translatable message in code or in a prop value. The first argument must be a string literal. */
export function t(message: string, args?: Readonly<Record<string, MessageArg>>): string;
/** A pipe applied in code: the `@(x | p)` of the view, for TS. */
export function format<T>(value: T, pipe: Pipe<T>): string;
export type MessageArg = string | number | bigint;

// ── Piezas de runtime (`@fudic/i18n/runtime`), solo las alcanza el código emitido ──
/** Formats `value` with `pipe` in `locale`. One cached Intl formatter per (locale, preset). */
export function $format<T>(pipe: Pipe<T>, value: T, locale: string): string;
/** Renders a compiled ICU message that needs a runtime choice: plural or select. */
export function $message(parts: CompiledMessage, args: Readonly<Record<string, MessageArg>>, locale: string): string;

// ── Catálogo (Node: lo usan el compilador, el plugin y el language server) ──
export interface CatalogEntry {
  readonly source: string;          // the message in the first locale, ICU-escaped
  readonly translation?: string;    // absent ⇒ missing
  readonly review?: string;         // the previous `source`, when the text changed under a translation
  readonly holes?: Readonly<Record<string, string>>;  // hole name → expression source
  readonly where: string;           // "src/components/app-card.fud:44"
  readonly at: number;              // ordinal of the message inside its context
}
export type Catalog = Readonly<Record<string /* context */, Readonly<Record<string /* key */, CatalogEntry>>>>;

export function messageKey(context: string, source: string): string;           // 8 hex of SHA-1
export function parseCatalog(text: string, file: string): ParseResult<Catalog>;  // FUD1023
export function mergeCatalog(previous: Catalog, extracted: readonly ExtractedMessage[],
                             isSource: boolean): Catalog;
export function printCatalog(catalog: Catalog): string;                          // stable text
export function compileMessage(text: string, locale: string): ParseResult<CompiledMessage>;  // ICU subset, FUD1024
```

`ExtractedMessage` y `CompiledMessage` son tipos del paquete. El primero lleva lo que §3.3 extrae;
el segundo es la forma precompilada de un mensaje ICU: texto, huecos, `plural` y `select`.
`compileMessage` recibe el idioma porque las categorías de un `plural` (`one`, `few`…) dependen de
él: una categoría que el idioma no tiene es `FUD1024`. `t` y `format` lanzan
`Error('compiled away')` si un módulo escapa al compilador; `locale` no puede lanzar al leerse, y
vale `"und"`.

### 3.3 `@fudic/compiler`

```ts
/** One translatable message found in a `.fud` or a `.ts` source. */
export interface Message {
  readonly key: string;                 // messageKey(context, source)
  readonly context: string;             // §4.9
  readonly source: string;              // ICU-escaped, holes as {name}, tags as <n>…</n>
  readonly holes: readonly { readonly name: string; readonly expr: Span }[];
  readonly tags: number;                // inline elements inside the message
  readonly origin: 'text' | 'attribute' | 'result' | 't';
  readonly span: Span;
  readonly at: number;
}

/** Messages of a `.fud`. Never throws: diagnostics come back with the partial result. */
export function extractMessages(source: string, file: string): ParseResult<readonly Message[]>;
/** Messages (`t()` calls) of a `.ts`/`.js` app module. */
export function extractScriptMessages(source: string, file: string): ParseResult<readonly Message[]>;

/** How a module is compiled for one locale. */
export interface LocaleCompile {
  readonly locale: string;
  /** All configured locales, first one the source language: drives href prefixes and alternates. */
  readonly locales: readonly string[];
  /** The text for a message in `locale`, or undefined when it is missing (§4.10). */
  readonly translate: (message: Message) => CompiledMessage | undefined;
}

// EmitOptions (emit/module.ts:74) gana:
//   readonly i18n?: LocaleCompile;
// Ausente ⇒ salida byte a byte la de antes de esta spec.

/** Compile a `.ts`/`.js` app module for one locale: `t`, `format` and `locale` replaced. */
export function translateScript(source: string, file: string, i18n: LocaleCompile):
  ParseResult<{ readonly code: string; readonly map: SourceMap }>;
```

### 3.4 `@fudic/vite`

Sin opciones nuevas: lo decide `fudic.json`. Lo que cambia por fuera:

- **Módulos por idioma.** Un id `x.fud?locale=en` o `x.ts?locale=en` es ese módulo compilado para
  `en`. El plugin propaga el sufijo a lo que importa (§4.6).
- **Catálogos.** Lee `src/locales/<locale>.json` y nunca los escribe (§4.10).
- **Rutas.** Cada ruta existe una vez por idioma con el patrón prefijado (`/en/about`). El
  manifiesto, el prerender, el endpoint de datos y el SW ven esos patrones y no otros.

### 3.5 `@fudic/cli`: `fudic translate`

```ts
export interface TranslateOptions extends BaseOptions {}

/** Extract every message of the app and merge it into src/locales/<locale>.json (§4.10). */
export function planTranslate(opts: TranslateOptions): Promise<Plan>;
```

- **Plan.** Es un plan más (`plan* → apply`). Sus `FileChange` son los catálogos que cambian, y sus
  diagnósticos son `FUD1022`–`FUD1025`.
- **Binario.** `fudic translate` aplica el plan e imprime un resumen por idioma: mensajes, nuevos,
  *a revisar* y sin traducir. Sale con código distinto de 0 solo si hay un error (`FUD1023`,
  `FUD1024`, `FUD1025`). Una traducción que falta es un aviso.
- **En la app.** La app lo expone como script: `"translate": "fudic translate"`. Así es
  `pnpm translate`.

### 3.6 Proyección TS (`@fudic/language-core`)

```ts
// GLOBALS_DTS gana:
interface $Pipe<in T> { readonly kind: string; readonly __in?: (value: T) => void }
declare function $pipe<T>(value: NoInfer<T>, pipe: $Pipe<T>): string;
```

- **Estructural**, como `$TrustedURL`: una app sin `@fudic/i18n` sigue tipando y `Pipe<T>`
  encaja en `$Pipe<T>`.
- **`NoInfer`**: `T` sale del preset, así que un valor que el preset no formatea es el error, y
  cae sobre el valor (criterio 21).

### 3.7 Diagnósticos

| Código | Severidad | Quién | Cuándo | Span |
|---|---|---|---|---|
| `FUD1020` | error | compilador | `t()` cuyo primer argumento no es un string literal; o cuyo mensaje tiene huecos y el segundo argumento no es un objeto literal con esas claves | el argumento |
| `FUD1021` | error | compilador | Pipe, `t()`, `format()` o `locale` en una app sin `locales` | el uso |
| `FUD1022` | warning | `fudic translate` | Falta la traducción de un mensaje a un idioma | el mensaje en el `.fud`/`.ts` |
| `FUD1023` | error | `fudic translate` | Catálogo ilegible: JSON roto o forma distinta de `Catalog` | el fichero de catálogo |
| `FUD1024` | error | `fudic translate` | Traducción con ICU inválido, o con huecos o etiquetas que no son los del original | el mensaje en el `.fud`/`.ts` |
| `FUD1025` | error | `fudic translate` | Dos `t()` válidos en el mismo contexto con el mismo texto y distinto número de claves en su objeto de huecos | el segundo |
| `FUD1026` | error | `fudic translate` | El comando en una app sin `locales` | el proyecto |

`FUD1020` y `FUD1021` son errores de código, como un error de tipos: sin literal no hay nada que
compilar, y sin idiomas no hay locale que poner. Todo lo que trata de catálogos es del comando. El
pipeline (`dev`, `build`, `preview`) no publica ninguno de esos cuatro.

## 4. Comportamiento

### 4.1 Lo que se traduce solo (decisión 159)

Se traduce sin marcar nada todo lo que la vista **pinta como texto**:

1. **Nodos de texto** con al menos una letra (`\p{L}`). El texto que es solo espacios, números o
   signos no es un mensaje.
2. **Atributos traducibles** de la lista del estándar HTML: `title`, `alt`, `placeholder`, `abbr`
   (en `<th>`), `label` (en `<option>`, `<optgroup>`, `<track>`), `download` (en `<a>`, `<area>`),
   `value` (en `<input>` de tipo `button`, `submit` o `reset`), `content` (en
   `<meta name="description">`). Y los de ARIA: `aria-label`, `aria-description`,
   `aria-placeholder`, `aria-roledescription`, `aria-valuetext`.
3. **Literales en posición de resultado** de una expresión que se pinta (contenido o atributo
   traducible). Es posición de resultado:
   - la expresión entera;
   - las dos ramas de `? :`;
   - el lado derecho de `??`, `||` y `&&`;
   - las partes fijas de un template literal.

   La regla es recursiva: `a ? "x" : b ?? "y"` da `"x"` y `"y"`. Cualquier otro literal es un
   valor y no se toca. Por ejemplo, el `"activo"` de `items.filter(x => x.tipo === "activo")`.

Lo que **no** se traduce:

- Lo que está bajo `translate="no"`: el elemento y todo su contenido. Es el atributo estándar.
- El cuerpo de `<style>` y `<script>`.
- `@raw`.
- Los comentarios.
- Los atributos que no están en la lista.
- El valor de una prop de componente: ahí hace falta `t()` (§4.3).

### 4.2 La unidad es la frase (decisión 160)

Un mensaje es una **tira de contenido en línea**: el texto, los `@expr` y los elementos de contenido
de frase (*phrasing*) que van seguidos. Son de frase: `a`, `abbr`, `b`, `bdi`, `bdo`, `br`, `cite`,
`code`, `data`, `dfn`, `em`, `i`, `kbd`, `mark`, `output`, `q`, `s`, `samp`, `slot`, `small`,
`span`, `strong`, `sub`, `sup`, `time`, `u`, `var` y `wbr`.

**Qué corta la tira:** cualquier otro elemento, un tag de componente, un constructo (`@if`,
`@foreach`, `@switch`…), `@{ }`, `@render` y los marcadores de layout. Cada rama de un constructo es
su propia lista y da sus propios mensajes.

```html
<p>Hola <b>@user.name</b>, tienes @count mensajes</p>
```
da un mensaje:
```
"Hola <0>{name}</0>, tienes {count} mensajes"
```

- **Etiquetas.** Cada elemento de frase es `<n>…</n>`, numerado por orden de apertura; uno vacío
  (`br`, `wbr`) es `<n/>`. Los atributos del elemento no viajan en el mensaje: el traductor mueve
  la etiqueta, no la reescribe. Un atributo traducible de ese elemento es su propio mensaje.
- **Huecos.** Cada `@expr` es `{nombre}`. El nombre sale de la expresión:
  - el último segmento de una ruta (`user.name` → `name`);
  - una lectura de signal sin argumentos pierde los `()` (`count()` → `count`);
  - un pipe toma el nombre del valor (`precio | euros` → `precio`);
  - cualquier otra expresión es `arg1`, `arg2`… por orden.

  Si un nombre se repite con otra expresión, lleva sufijo (`id2`). El catálogo guarda la expresión
  de **cada** hueco (`holes`), así que el traductor nunca ve un `{arg1}` sin saber qué es.
- **Lista de elementos.** Una tira que solo tiene elementos separados por espacios (un nav, una
  barra de botones) no es una frase: da **un mensaje por elemento**.
- **Escapado.** Un `{`, `}` o `'` literal del texto se escribe en el mensaje con el escapado ICU
  (`'{'`, `''`), y el compilador lo deshace al emitir.

**Al compilar**, el emit construye la tira **en el orden de la traducción**: los textos de la
traducción, cada hueco con su expresión y cada etiqueta con su elemento y sus atributos originales.
`"Hello <0>{name}</0>, you have {count} messages"` y `"{count} mensajes para <0>{name}</0>"` son
igual de válidos.

### 4.3 `t()` en props y en código (decisión 161)

Donde el compilador no puede distinguir texto de valor, se marca con `t()`:

```html
@code { import { t } from '@fudic/i18n'; }
<app-card .title=@t("Acerca de") .variant="highlight">
```
```ts
import { t } from '@fudic/i18n';
throw new ValidationError(t("El nombre es obligatorio"));
const saludo = t("Hola {name}", { name: user.name });
```

- **Dónde vale.** En cualquier expresión: vista, las tres zonas de `@code` y los `.ts`/`.js` de la
  app. En la vista es legal aunque redundante.
- **Primer argumento:** un string literal (`FUD1020`). Sin literal no hay nada que extraer.
- **Huecos.** Si el mensaje tiene huecos, el segundo argumento es un objeto literal con una clave
  por hueco (`FUD1020`).
- **Formato del mensaje.** Subconjunto de ICU: `{name}`, `{n, plural, …}` (categorías de CLDR,
  `=N` y `#`) y `{x, select, …}`. Un mensaje de `t()` no lleva etiquetas: devuelve un string.
- **Qué emite:**
  - con huecos simples o sin huecos, un string literal o un template literal;
  - con `plural` o `select`, una llamada a `$message(parts, args, "en")`.

### 4.4 Pipes (decisión 158)

En una expresión de la vista, `|` es el **pipe**:

```html
@code {
  import { currency, date } from '@fudic/i18n';
  const euros = currency('EUR');
  const larga = date({ dateStyle: 'long', timeZone: 'Europe/Madrid' });
}
<p>Total: @(precio | euros)</p>
<time>@(data.publicado | larga)</time>
```

- **Operandos.** El izquierdo es el valor y el derecho una expresión de tipo `Pipe<T>`. Si no lo
  es, la proyección (`$pipe(valor, preset)`, §3.6) da el error de tipos, y SDD-35 lo convierte en
  build fallido.
- **Precedencia: la de `|` en JS**, que es más débil que `+` y más fuerte que `&&` y `? :`. Así,
  `ok ? precio | euros : "—"` funciona sin paréntesis.
- **El OR de bits no existe en la vista.** Enmienda SDD-51 §3.2: quien lo necesite lo calcula en
  `@code`. Allí `|` sigue siendo el operador de JS.
- **Qué emite:** `$format(preset, valor, "en")`, con el locale como literal del grafo de idioma.
- **En código** el pipe es `format(valor, preset)`, que se emite igual.

**El catálogo de presets es cerrado:** `date`, `number`, `currency`, `percent`, `relativeTime` y
`list`, cada uno sobre su `Intl.*Format`. Un pipe propio es un preset con opciones:
`const larga = date({ … })`.

- **`date` exige `timeZone`.** Lo exige el tipo. Es FUD0912 llevado al preset: sin zona, el
  servidor y el navegador escriben horas distintas.
- **El plural no es un pipe**: va en el mensaje (§4.3, §4.10).
- **`$format`.** Guarda un formatter por (locale, preset). La caché vive en un `WeakMap` con el
  preset como clave, no en estado de módulo de la app.

**Un preset es un dato.** Lleva `kind` y `options` y no tiene funciones dentro. Un backend en otro
lenguaje (IDEA-03) lo formatea con su ICU sin ejecutar JS.

### 4.5 Idiomas y rutas

**Un idioma** (`"locales": ["es"]`):
- No hay prefijo ni catálogos.
- Los pipes y `t()` funcionan, con ese locale.
- Las rutas, el manifiesto y el `dist` quedan como sin `locales`; cambian solo los módulos que usan
  pipes o `t()`.

**Dos o más:**

- **Patrones.** Cada ruta se descubre una vez y se expande en `discoverRoutes`, justo después de
  `routesFromFiles`, a **un patrón literal por idioma**: `/about` → `/es/about` y `/en/about`;
  `/blog/:slug` → `/es/blog/:slug` y `/en/blog/:slug`. Son literales y no un parámetro `:locale`,
  para que no choquen con los parámetros del autor. A partir de ahí todo lee el patrón como hoy:
  - el matcher de dev y de preview;
  - `buildManifest`;
  - las entradas del build de edge;
  - el prerender;
  - el endpoint de datos (`/_fudic/data/en/about`);
  - el router del SW.
- **`/`.**
  - En dev, preview y edge responde `302` al idioma del `Accept-Language` que mejor encaja.
    Encajar es igualdad de etiqueta y, si no hay, igualdad de idioma base; si nada encaja, el
    primero de la lista.
  - En SSG se emite un `index.html` con `<meta http-equiv="refresh" content="0; url=/es/">` y los
    `<link rel="alternate" hreflang>`.
- **`paths()`.** Se llama una vez por idioma, dentro del grafo de ese idioma, así que puede leer
  `locale` para enumerar slugs distintos. Las entradas no llevan el prefijo; lo pone el prerender.
- **`_error.fud`.** También se compila una vez por idioma, bajo `/<idioma>/_fudic/error/:status`.
  - Una página que falla pinta la de su idioma.
  - `/_fudic/error/N`, adonde `errorPages` manda una llamada que falló, no lleva prefijo: pinta la
    del idioma de la página de la que viene (`Referer`) y, si no se sabe, la del primero.

### 4.6 Un grafo de módulos por idioma

El plugin compila la app una vez por idioma **dentro de un solo build**:

- **La raíz del grafo de `en`** es el chunk de cada ruta `/en/…`, que importa su `.fud` como
  `x.fud?locale=en`.
- **Propagación del sufijo.** `resolveId` lo propaga desde un importador con `?locale=` a:
  - todo `.fud`, sea de la app o de una librería (SDD-43);
  - todo `.ts`/`.js` bajo la raíz del proyecto que no esté en `node_modules`.
- **Lo que no recibe sufijo:** las dependencias npm compiladas. Se comparten entre idiomas.
- **Compilación.**
  - Un `.fud` con sufijo se compila con `EmitOptions.i18n`.
  - Un `.ts` con sufijo pasa por `translateScript`.
  - Uno que no nombra `@fudic/i18n` ni tiene texto sale idéntico, y Rolldown lo deduplica por
    contenido.
- **El cliente** sigue el mismo camino. El chunk de hidratación de `app-card` existe una vez por
  idioma, y el mapa de hidratación de `/en/about` nombra los de `en`.
- **Consecuencia que conviene saber: el estado de módulo de la app existe una vez por idioma** en
  el servidor de edge, que tiene los dos grafos cargados. En el navegador hay un solo idioma por
  página y no cambia nada.
- **Piezas de runtime.** `$format` y `$message` son piezas de `@fudic/i18n/runtime`, con
  `"fudic": { "runtime": "./runtime" }`. Solo llegan al navegador si el chunk de un componente
  hidratado las nombra (SDD-45). Un componente N1 con pipes no descarga nada: el texto ya sale
  formateado del servidor.

### 4.7 `<html>`, alternativas y dirección

- **`lang`.** Si el `<html>` de un layout no escribe `lang`, el emit lo añade con el locale del
  grafo. Si lo escribe, manda el autor. La página sin layout deja el `lang="es"` fijo
  (`emit/module.ts:671`) y escribe el locale, o `es` si no hay `locales`, como hoy.
- **`dir`.** Igual que `lang`: si el locale es de derecha a izquierda
  (`new Intl.Locale(l).getTextInfo().direction === 'rtl'`, calculado en el build), el emit añade
  `dir="rtl"`, salvo que el autor lo escriba.
- **Alternativas.** Con dos o más idiomas, la cabecera de cada ruta lleva un
  `<link rel="alternate" hreflang="xx" href="/xx/…">` por idioma, más `hreflang="x-default"`
  apuntando a `/`.
  - El `href` es la URL de la petición con el prefijo cambiado, así que una ruta con parámetros
    apunta a la misma página.
  - Lo escribe el wrapper en la parte de cabecera que ya inyecta el runtime de la ruta, la misma
    que el layout coloca con `@RenderHead()`.

### 4.8 Enlaces

Con dos o más idiomas, un `href` de `<a>` o `<area>` y un `action` de `<form>` que empiezan por `/`
reciben el prefijo del idioma de la página. Así `<a href="/about">` en `/en/…` va a `/en/about`.
Quedan como están:

- los que ya empiezan por un prefijo de idioma configurado: así se escribe un selector de idioma,
  `<a href="/en/about">`;
- los que empiezan por `/_fudic/`;
- los que empiezan por `//`;
- los que tienen extensión de fichero en el último segmento (`/doc.pdf`).

Un `href` estático se prefija al compilar. Uno dinámico pasa por la misma regla en runtime: el emit
envuelve el valor en `$href(valor, "en", ["es","en"])`, otra pieza de `@fudic/i18n/runtime`, antes
del guardia de URL de SDD-51.

### 4.9 Clave y contexto

- **Contexto** de un mensaje:
  - en un componente, su tag (`app-card`);
  - en una ruta, un layout, una página o un snippet, la ruta del fichero relativa a `src`
    (`routes/about.fud`);
  - en un `.ts`, la ruta del módulo (`lib/validation.ts`).
- **Clave:** los 8 primeros hex de SHA-1 sobre `contexto + "\0" + source`. El mismo texto dos veces
  en el mismo contexto es un solo mensaje con una sola traducción.
- **`at`:** el ordinal del mensaje dentro de su contexto, en orden de fuente. Es lo que permite
  seguir a un texto que cambia (§4.10).

### 4.10 Catálogos

`src/locales/<locale>.json`, uno por idioma, con la forma `Catalog` (§3.2):

```json
{
  "app-card": {
    "a1f3c09e": { "source": "Cerrar", "translation": "Close", "where": "src/components/app-card.fud:44", "at": 0 },
    "9c02b7d1": { "source": "Abrir", "translation": "Open", "where": "src/components/app-card.fud:44", "at": 1 }
  }
}
```

**Quién los escribe: solo `fudic translate`.** El comando recorre:
- todos los `.fud` y los `.ts`/`.js` de `src`;
- los `.fud` de las librerías fudic de las que depende la app, que son las mismas que compila el
  plugin (SDD-43).

Extrae los mensajes, los fusiona con los catálogos que hay y escribe los que cambian. El
pipeline nunca escribe un catálogo ni extrae nada: `pnpm dev`, `pnpm build` y `pnpm preview` no
pagan esta pasada.

**Cómo se fusionan** (`mergeCatalog`):

- **Mensaje nuevo:** entra.
  - En el catálogo del **primer idioma**, con `translation` igual a `source`. Ese catálogo se puede
    editar: es donde el autor convierte `"{count} mensajes"` en
    `"{count, plural, one {# mensaje} other {# mensajes}}"` para su propio idioma.
  - En los demás, sin `translation`.
- **Mensaje que sigue:** conserva su `translation`; se actualizan `where` y `holes`.
- **Texto cambiado.** Un mensaje que desaparece y otro que aparece en el mismo contexto con el
  mismo `at`: el nuevo hereda la `translation` del viejo, con `review` igual al `source` anterior.
  Un mensaje con `review` **cuenta como traducido** y se usa tal cual; el traductor lo confirma
  borrando `review`.
- **Mensaje que ya no existe:** se borra. Su traducción queda en el historial de git.
- **Formato estable.** Contextos y claves ordenados (contexto alfabético, luego `at`), dos espacios
  de sangría y salto de línea final. Dos extracciones del mismo código dan el mismo fichero byte a
  byte.

**Lo que informa `fudic translate`:**

- Cada mensaje sin traducir en cada idioma es `FUD1022` (aviso). Una `translation` vacía cuenta
  como sin traducir, aquí y en el pipeline.
- Un catálogo que no es JSON o no tiene la forma es `FUD1023`.
- Una `translation` con ICU inválido, o con huecos o etiquetas que no son exactamente los del
  `source`, es `FUD1024`. El orden puede cambiar; el conjunto no.

**Lo que hace el pipeline con los catálogos: leerlos, nada más.**

- `dev`, `build` y `preview` leen `src/locales/<locale>.json` para compilar cada idioma.
- Un mensaje se compila con su `translation` cuando existe y es válida. Si falta, si está vacía,
  si es inválida o si el catálogo entero no se puede leer, se compila con el texto original.
- En ningún caso hay diagnóstico ni penalización. Ejecutar `pnpm translate` es responsabilidad del
  desarrollador.
- En dev, un cambio en un catálogo recompila los módulos de ese idioma: es una entrada más del
  grafo, como un `.ts`.

### 4.11 Editor

- **Pipes.** La proyección escribe `a | b` como `$pipe(a, b)`. Es un cambio en
  `copyRazor`/`copyExpression`, así que vale igual en contenido, atributos y props.
  - Los dos operandos se copian 1:1 (hover, rename y definición siguen funcionando).
  - Solo `$pipe(`, la coma (anclada al span del `|`) y el `)` son andamiaje.
- **Sin avisos de traducción.** El editor no publica `FUD1022`–`FUD1025`: son del comando.
- **Hover.** El language server lee los catálogos y los relee cuando cambian en disco. Sobre un mensaje muestra sus traducciones, una línea por idioma, y `—` donde falta.
- **Formateador.** No cambia. `a | b` es JS válido y se formatea como el OR de bits que parece.

## 5. Invariantes LSP

- **Spans.** Todo `Message` lleva el span de su texto, de su atributo, de su literal o de su llamada
  a `t()`, y cada hueco el span de su expresión. Los diagnósticos de `fudic translate` sobre un
  mensaje (`FUD1022`, `FUD1024`, `FUD1025`) caen sobre ese span en el `.fud` o el `.ts`, no en el
  JSON. Solo `FUD1023` cae en el catálogo.
- **No lanzar nunca.** `extractMessages`, `extractScriptMessages`, `parseCatalog` y
  `compileMessage` devuelven `ParseResult`. Un `.fud` roto da los mensajes de lo que se pudo parsear.
- **Oxc una vez por fichero.** La extracción de literales en posición de resultado y de `t()` en un
  `.fud` recorre el `JsBatch` que ya se construye. Un `.ts` se parsea una vez para extraer y otra
  para compilar, porque son dos pasadas en momentos distintos.
- **Mapeo.** El código de un módulo compilado para un idioma mapea a su `.fud` igual que el de hoy.
  El texto traducido mapea al span del mensaje original.

## 6. Criterios de aceptación

**Config**

1. `"locales": ["es", "en"]` se lee normalizado.
   - `"locales": []`, `["es", "es"]` y `["xx-?"]` dan `FUD0725` con `problem: 'locales'`.
   - Sin `locales`, el `dist` de `examples/basic` es byte a byte el de `main`.

**Extracción**

2. El `app-card.fud` de los fixtures da dos mensajes, `"Cerrar"` y `"Abrir"`, en el contexto
   `app-card`, con `at` 0 y 1.
3. `<p>Hola <b>@user.name</b>, tienes @count() mensajes</p>` da un mensaje,
   `"Hola <0>{name}</0>, tienes {count} mensajes"`, con
   `holes = { name: "user.name", count: "count()" }`.
4. Los literales en posición de resultado:
   - `<p>@(ok ? "sí" : "no")</p>` da `"sí"` y `"no"`;
   - `@(items.filter(x => x.tipo === "activo").length)` no da ninguno;
   - `<div class=@(ok ? "a" : "b")>` no da ninguno.
5. Atributos:
   - `<input placeholder="Escribe">` da un mensaje y `<input class="campo">` ninguno;
   - `<input type="submit" value="Enviar">` da uno y `<input type="text" value="x">` ninguno.
6. `<code translate="no">pnpm dev</code>` no da mensajes, ni tampoco nada dentro.
7. Un `<nav>` con veintidós `<a>` separados por espacios da veintidós mensajes.
8. `t()`:
   - `t("Hola {name}", { name })` en un `.ts` da un mensaje de origen `t`;
   - `t(variable)` es `FUD1020` sobre el argumento;
   - `t("Hola {name}")` sin objeto también es `FUD1020`.
9. Un `.fud` con un error de parseo devuelve los mensajes del resto y el diagnóstico, sin lanzar.

**Catálogos (`fudic translate`)**

10. Ejecutar `fudic translate` dos veces sobre el mismo código da el mismo `en.json` byte a byte.
    La segunda vez el plan no tiene cambios.
11. Cambiar `Cerrar` por `Cerrar panel` y ejecutar el comando deja en `en.json` la entrada nueva
    con `translation: "Close"` y `review: "Cerrar"`. La vieja desaparece y la página en inglés dice
    `Close`.
12. En `es.json` cada entrada nueva lleva `translation` igual a `source`. Si se reescribe con
    `{count, plural, one {# mensaje} other {# mensajes}}`, con `count = 1` sale `1 mensaje`.
13. Lo que informa el comando:
    - un mensaje sin traducir en `en` es `FUD1022` (aviso) sobre el mensaje en su `.fud`, y el
      comando sale con 0;
    - una `translation` sin el `{name}` del original es `FUD1024` sobre el mensaje, y el comando
      sale con distinto de 0;
    - una con `{name}` y `{count}` en otro orden es válida;
    - un `en.json` con una coma de más es `FUD1023`.

**Compilación por idioma**

14. Con `translate` devolviendo `"Hello <0>{name}</0>"` para el criterio 3:
    - el módulo de servidor de `en` escribe `Hello <b>Ana</b>` y conserva los atributos del `<b>`;
    - el de cliente crea los mismos nodos en ese orden.
15. `"{count} mensajes para <0>{name}</0>"`, que cambia el orden de huecos y etiquetas, se emite en
    ese orden y la hidratación encuentra sus nodos.
16. Con `sí` → `yes` y `no` → `no`, `<p>@(ok ? "sí" : "no")</p>` en `en` emite
    `ok ? "yes" : "no"`, con el resto de la expresión idéntico.
17. `t("Hola {name}", { name })` en `en` emite un template literal `` `Hello ${name}` ``. Con
    `plural` emite `$message(…, "en")` e importa la pieza.
18. `locale` emite `"en"`. `format(x, euros)` emite `$format(euros, x, "en")`.
19. Sin `i18n` en `EmitOptions`, toda la suite de goldens del compilador sale igual.

**Pipes**

20. `@(precio | euros)` con `precio = 3.5` escribe `3,50 €` en `/es` y `€3.50` en `/en`. Lo hace
    igual en SSR, en el render del SW y al crear en el cliente.
21. `@(nombre | euros)` con `nombre: string` es un error de tipos sobre `nombre` y el build falla.
22. `@(precio | euros)` en una app sin `locales` es `FUD1021`.
23. `date({ dateStyle: 'long' })` sin `timeZone` es error de tipos.
24. `$format` crea un solo `Intl.NumberFormat` para cien llamadas con el mismo preset y locale.

**Rutas y build**

25. Con `"locales": ["es", "en"]`, `routes/about.fud` y `routes/blog/[slug].fud` dan cuatro
    patrones, y el manifiesto lleva los cuatro.
    - `/en/blog/x` pide `/_fudic/data/en/blog/x`.
    - Un `paths()` que devuelve `['a']` prerenderiza `es/blog/a/index.html` y
      `en/blog/a/index.html`.
26. `/`:
    - en dev, con `Accept-Language: en-GB,en;q=0.9` responde `302` a `/en/`, y sin cabecera a
      `/es/`;
    - en SSG, `dist/index.html` tiene el `meta refresh` a `/es/`.
27. El `<html>` de `/en/about` lleva `lang="en"` cuando el layout no escribe `lang`. Con
    `<html lang="@culture">` manda el layout. Con `"locales": ["es", "ar"]`, `/ar/…` lleva
    `dir="rtl"`.
28. La cabecera de `/en/blog/x` tiene tres `<link rel="alternate">`: `es`, `en` y `x-default`.
29. Enlaces:
    - `<a href="/about">` sale `/en/about` en `en`;
    - `<a href="/es/about">`, `<a href="/doc.pdf">` y `<a href="/_fudic/x">` salen como están;
    - un `href=@url()` dinámico con `/about` sale `/en/about` en SSR y en el cliente.
30. Al cliente de `/en/about` solo le llegan chunks compilados para `en`. Un componente N1 con
    `@(precio | euros)` no descarga `@fudic/i18n/runtime`.
31. El pipeline no extrae ni penaliza. Con un texto nuevo que no está en ningún catálogo, una
    traducción vacía, una traducción inválida y un `en.json` ilegible:
    - `pnpm dev`, `pnpm build` y `pnpm preview` no escriben nada en `src/locales/`;
    - no publican ningún `FUD1022`–`FUD1025`;
    - el build pasa;
    - esos mensajes salen en `/en/…` con el texto original.

**Editor**

32. En `@(precio | euros)`:
    - el hover sobre `precio` da su tipo;
    - el rename de `euros` renombra la declaración y el uso;
    - el error de tipos de un preset equivocado cae sobre el operando, no sobre el `|`.
33. El hover sobre `Cerrar` muestra `es: Cerrar` y `en: Close`. Al cambiar `en.json` en disco,
    el hover cambia sin reiniciar. El editor no publica `FUD1022`–`FUD1025`.
34. En dev, guardar `en.json` recarga `/en/…` con la traducción nueva sin reiniciar el servidor.

**Evidencia**

35. `examples/i18n` es una app nueva con `"locales": ["es", "en"]` y cubre:
    - un layout sin `lang`;
    - una ruta con parámetros y `paths()`;
    - un componente N1 y otro hidratado con texto, huecos, etiquetas y un `@if` con texto;
    - una prop con `t()`;
    - un servicio `.ts` con `t()`;
    - un pipe de moneda y otro de fecha;
    - un plural en los dos idiomas;
    - un selector de idioma.

    Tiene el script `"translate": "fudic translate"`. Tras `pnpm translate` y con los catálogos
    rellenos, `pnpm build` pasa y la app se navega en los dos idiomas: sin
    texto en español dentro de `/en/…` y sin texto en inglés dentro de `/es/…`. Pedro lo
    comprueba en el navegador.
36. `@fudic/i18n` nace con cobertura al 100 % en las cuatro métricas. `pnpm typecheck`,
    `pnpm test` y `pnpm build` en verde.

## 7. Fuera de alcance

- **Contenido por idioma.** El título de un artículo o una fila de base de datos son datos y llegan
  por `load`, que puede leer `locale`. El catálogo es solo para la interfaz.
- **Texto de paquetes npm compilados.** Solo se traduce lo que se compila desde fuente: la app y
  las librerías `.fud` (SDD-43).
- **Traducción automática** y cualquier servicio externo de traducción.
- **XLIFF y `.po`.** Las herramientas profesionales importan JSON con ICU.
- **Negociar el idioma fuera de `/`.** Una URL con prefijo manda siempre; no se lee
  `Accept-Language` ni una cookie en otras rutas.
- **Un selector de idioma del framework.** Es un `<a href="/en/…">` del autor; §4.8 lo deja intacto.
- **Portar `$format` y `$message` a otros lenguajes de servidor.** Es IDEA-03. Aquí se garantiza la
  condición que esa idea necesita: preset y catálogo son datos.
- **Estilos de derecha a izquierda.** El framework pone `dir`; el CSS lógico es del autor.
