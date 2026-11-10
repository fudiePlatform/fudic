# SDD-83 — Diagnósticos a medida y Baseline

> **Estado:** `Listo` (2026-11-10) — [tareas](./SDD-83-Task.md).
> **Paquetes:** `@fudic/diagnostics` · `@fudic/baseline` (nuevo) · `@fudic/config` · `@fudic/compiler` ·
> `@fudic/api` · `@fudic/spec` · `@fudic/typecheck` · `@fudic/vite` · `@fudic/core` · `@fudic/forms` ·
> `@fudic/language-server` · `@fudic/vscode` · `@fudic/cli` · `@fudic/mcp` (guía) · `examples/basic`
> **Depende de:** 34 (formularios, `FudicControlElement`), 35 (cómo informa el build), 41
> (`fudic.json`), 49 (el lector de reglas de una hoja), 50 (`@fudic/diagnostics`), 57 (los atributos
> del `<template>` raíz), 79 (la guía de estilos). Todas en `Hecho`.
> **Rango de diagnósticos:** `FUD1520`–`FUD1539` (nuevo).
> **Decisiones de gramática:** ninguna. Los comentarios `fud-disable` viven dentro de los comentarios
> que cada lenguaje ya tiene.
> **Origen:** notas 1 y 4 de `docs/PENDIENTE.md`, aclaradas con Pedro el 2026-11-05 y el 2026-11-10.
> **Rama sugerida:** `sdd-83-diagnosticos-y-baseline`, desde `main`.
>
> **Qué añade en una frase.** Un proyecto decide en `fudic.json` cómo se informa cada código (apagado,
> como aviso, como error) y silencia una línea o un fichero con un comentario con motivo; y fudic
> avisa cuando el HTML, el CSS o el TS del usuario usa algo del navegador más nuevo que el nivel de
> Baseline del proyecto (`widely` si no dice nada), con bombillas que lo arreglan sin tener que
> acordarse de cómo.

---

## 1. Contexto y objetivo

### 1.1. Lo que hay hoy

- **La severidad es del código y no se toca.** [types.ts:10-12](../../packages/diagnostics/src/types.ts):
  «la severidad pertenece al código, nunca a la llamada». Hay unos 410 códigos: casi todos errores,
  35 warnings y 2 info.
- **Un warning no se puede silenciar.** `app-calendar-plain.fud` pone un `@click` dentro de un bucle
  a propósito, para compararlo con `app-calendar`, y `FUD1380` sale en cada build sin forma de
  decir «ya lo sé».
- **No se puede subir un warning a error**, ni para un código ni para todos, que es lo que pide una CI.
- **fudic no sabe nada de Baseline.** Nadie avisa si el autor escribe `field-sizing: content` o
  `:state(open)`, que hoy no están en todos los navegadores de los últimos 30 meses.
- **Vite sí sabe algo.** Compila por defecto a `baseline-widely-available`, con la fecha fija para
  toda la versión mayor (2026-01-01 en Vite 8: Chrome 111, Firefox 114, Safari 16.4). Solo baja la
  sintaxis de JS; no dice nada de APIs, HTML ni CSS.
- **Lo que emite fudic, medido con `web-features` 3.45.0:**

| Qué | Clave | Newly | Remedio hoy |
|---|---|---|---|
| DSD (`shadowrootmode`) | `html.elements.template.shadowrootmode` | 2024-02-20 | — |
| `Promise.withResolvers` (frames de `@await`) | `javascript.builtins.Promise.withResolvers` | 2024-03-05 | — |
| `shadowrootdelegatesfocus` (todo control de formulario) | `html.elements.template.shadowrootdelegatesfocus` | 2024-09-16 | **ninguno** |
| Controles form-associated | `api.ElementInternals` | 2023-03-27 | — |
| `adoptedStyleSheets`, `replaceSync` | `api.ShadowRoot.adoptedStyleSheets` | 2023-03-27 | — |
| `<style type="module" specifier>` | no está en los datos | — | polyfill en línea |
| `requestIdleCallback` | `api.Window.requestIdleCallback` | no Baseline | `setTimeout` |
| `CompressionStream` | `api.CompressionStream` | 2023-05-09 | se detecta y se omite |

  Con «widely» a día de hoy (navegadores de abril de 2024), un formulario de fudic ya pide algo que
  no está: `shadowrootdelegatesfocus`. En un navegador sin él, un clic en el `<label>` no lleva el
  foco al `<input>` del control.

### 1.2. Lo que decidió la conversación

1. **Una sola SDD.** Los avisos de Baseline son un código más y se suben, se bajan o se silencian
   con la misma política.
2. **Las reglas de la política** de la nota 1: un error no se baja; el motivo es obligatorio; una
   supresión que no silencia nada avisa; un código desconocido avisa; la lib no impone nada a la app.
3. **Baseline comprueba siempre**, contra `widely` si `fudic.json` no dice otro nivel. Si callara por
   defecto, solo lo usaría quien ya sabe que existe.
4. **Lo que pone fudic no avisa al usuario.** fudic se compromete a funcionar desde un suelo, y por
   encima pone su propio remedio. El único aviso por culpa de fudic es pedir un nivel por debajo del
   suelo.
5. **`allow` por feature**, para usar una a sabiendas sin apagar todo lo demás.
6. **Las bombillas lo hacen todo**: el usuario no tiene que acordarse de la sintaxis de nada.

### 1.3. El objetivo

```jsonc
// fudic.json
{
  "id": "basic",
  "baseline": { "target": "widely", "allow": ["popover"] },
  "diagnostics": {
    "FUD1380": "off",
    "FUD1022": "error",
    "warnings": "error"
  }
}
```

```html
@* fud-disable FUD1380: demo del coste de un listener por celda *@

<div class="cell" @click=@pick($event, day)>
  @* fud-disable-next-line FUD1380: contraste con app-calendar *@
  <button @click=@pick($event, day)>✎</button>
```

```css
textarea { resize: none; }
@supports (field-sizing: content) {
  textarea { field-sizing: content; }
}
```

Y, si el autor escribe `field-sizing` fuera del `@supports`:

```
app-note.fud:14:3  warning FUD1524  `field-sizing` (css.properties.field-sizing) is newer than this project's
                                    Baseline (widely available): newly available on 2026-06-16, widely available
                                    on 2028-12-16. Chrome 123, Edge 123, Firefox 152, Safari 26.2
```

con tres bombillas: moverlo a un `@supports`, permitir `field-sizing` en el proyecto o silenciar la
línea.

---

## 2. Dependencias

| SDD | Qué aporta |
|---|---|
| 34 | `FudicControlElement`, que abre su shadow root con `delegatesFocus` |
| 35 | `pluginLog`, `reportText`: cómo el build enseña un diagnóstico |
| 41 | `fudic.json`, `readProjectConfig`, `FUD0725` |
| 49 | `rules.ts`: el lector de reglas de una hoja plana |
| 50 | `@fudic/diagnostics`: una función por código, su `.md`, `explain` |
| 57 | `shadowrootdelegatesfocus`, `clonable`, `serializable` en el `<template>` raíz |
| 79 | La guía de estilos y sus hojas |

Dependencia de desarrollo nueva, solo para el generador de la tabla: `web-features`, versión exacta.
Ninguna dependencia de runtime nueva.

---

## 3. Interfaz pública

### 3.1. La política en `fudic.json`

```jsonc
"diagnostics": {
  "FUD1380": "off",        // un código: off | hint | info | warning | error
  "FUD1022": "error",
  "warnings": "error"      // todos los códigos que por defecto son warning
}
```

- **Un código manda sobre `warnings`.** Con `"FUD1380": "off"` y `"warnings": "error"`, `FUD1380`
  está apagado y los demás warnings son errores.
- **Un error no se baja.** `"FUD0050": "warning"` o `"off"` es `FUD1521` sobre esa clave, y la entrada
  no se aplica. Subir un warning o un info a error sí vale.
- **Un código que no existe** o que está retirado es `FUD1520` (warning), con el código que lo
  sustituye si lo hay.
- **Una forma inválida** (no es un objeto, un valor que no es de la lista, una clave que no es un
  código ni `warnings`) es `FUD0725` con su problema nuevo, `diagnostics`.
- **Cuando la política cambia la severidad, el mensaje lo dice**: «… (warning by default; error in
  this project)». Así se ve en la terminal, en el editor y en el MCP sin abrir nada.

### 3.2. Silenciar con un comentario

```
fud-disable FUDnnnn[, FUDnnnn…]: motivo              # todo el fichero
fud-disable-next-line FUDnnnn[, FUDnnnn…]: motivo    # la línea siguiente
```

Va dentro del comentario que ya tiene cada lenguaje:

| Fichero o región | Comentario |
|---|---|
| Marcado de un `.fud` | `@* fud-disable-next-line FUD1380: motivo *@` |
| `<style>` de un `.fud`, `.css` | `/* fud-disable-next-line FUD1524: motivo */` |
| `@code` de un `.fud`, `.ts` | `// fud-disable-next-line FUD1524: motivo` o `/* … */` |
| `.fudapi`, `.fudspec` | `# fud-disable-next-line FUD0972: motivo` |
| `fudic.json`, `sw.json` | No tienen comentarios: solo la política |

- **`fud-disable`** vale para todo el fichero, esté donde esté. La bombilla lo escribe arriba.
- **`fud-disable-next-line`** vale para los diagnósticos cuyo span empieza en la línea siguiente a la
  última del comentario.
- **El motivo es obligatorio.** Sin motivo, o sin código, es `FUD1522` (error) y el comentario no
  silencia nada.
- **Un error no se silencia**: un código de error en el comentario es `FUD1521`.
- **Un código desconocido** es `FUD1520`, como en la política.
- **Un comentario que no silencia nada** (ese código no sale en esa línea, o en ese fichero) es
  `FUD1523`, hint, con la bombilla «Quitar». Así no queda basura cuando se arregla el código.

### 3.3. A quién obedece cada fichero

- **Un fichero obedece la política del proyecto al que pertenece**: el `fudic.json` más cercano
  hacia arriba. Sin proyecto, no hay política: cada código con su severidad.
- **Los comentarios del fichero valen siempre**, lo compile quien lo compile.
- **Al compilar una app, los warnings, info y hints de un fichero de una lib no se enseñan.** Los ve
  quien desarrolla la lib, que es quien puede arreglarlos. Los errores sí se enseñan, porque rompen
  la app. Lo que una lib aporta de Baseline a la app sale resumido en `FUD1526` (§3.8).

### 3.4. El nivel de Baseline en `fudic.json`

```jsonc
"baseline": "widely"                                    // o "newly", o un año: 2024
"baseline": { "target": "widely", "allow": ["popover", "state"] }
```

- **Sin la clave, es `"widely"`.** `fudic new` la escribe igualmente, para que se vea dónde está.
- **`target`**: `"widely"`, `"newly"` o un año entero entre 2015 y el año de los datos.
- **`allow`**: ids de feature de `web-features` (`popover`, `state`, `field-sizing`). Todo lo de esa
  feature deja de avisar en el proyecto.
  - Un id que no existe es `FUD1527`, warning.
  - Un id que se ha movido (`kind: "moved"`) o partido (`"split"`) es `FUD1527` con su destino, y se
    aplica al destino (o a todos los destinos). Bombilla: «Cambiar por `<destino>`».
  - Un id que nada del proyecto usa es `FUD1528`, hint, con la bombilla «Quitar».
- **Una forma inválida** es `FUD0725` con su problema nuevo, `baseline`.
- **Para apagar Baseline entero** no hay valor especial: `"diagnostics": { "FUD1524": "off" }`.

### 3.5. Qué es un nivel: una fecha

Cada nivel es una fecha de corte. Una clave pasa si llegó a todos los navegadores principales
(Chrome, Edge, Firefox y Safari, en escritorio y móvil) **en esa fecha o antes**.

| Nivel | Fecha de corte |
|---|---|
| `2024` | 2024-12-31 |
| `"newly"` | La fecha de los datos |
| `"widely"` | La fecha de los datos menos 30 meses |

- **La fecha de los datos** es la de la versión de navegador más reciente que conocen los datos
  (`browsers` de `web-features`). Viaja con fudic: **el mismo fudic da el mismo resultado hoy y dentro
  de un año**. Los datos se ponen al día al sacar una versión de fudic.
- Una clave que no ha llegado a todos (`baseline: false`) no pasa en ningún nivel. El mensaje dice qué
  navegadores faltan.
- Se mira **el estado de cada clave** (`status.by_compat_key`), no el de la feature entera. Popover en
  conjunto es de 2025-01-27, pero el atributo `popover` es de 2024-04-16, y eso es lo que usa quien lo
  escribe.

### 3.6. Qué se mira del código del usuario

Cada detector traduce código a claves, con el sitio exacto y si va protegido. No sabe nada de niveles.

**HTML** (el marcado de un `.fud`):

| Escribe | Clave, la primera que esté en la tabla |
|---|---|
| `<search>` | `html.elements.search` (`svg.elements.x`, `mathml.elements.x` dentro de `<svg>` o `<math>`) |
| `<dialog closedby="any">` | `html.elements.dialog.closedby`, si no `html.global_attributes.closedby` |
| `<input type="color">` | `html.elements.input.type_color`, si no `html.elements.input.type.color` |
| `<div popover>` | `html.global_attributes.popover` |
| `<div @toggle=…>` | `api.HTMLDivElement.toggle_event`, `api.HTMLElement.toggle_event`, `api.Element.toggle_event` |

- Solo atributos con valor literal. Los ligados (`attr=@x`) dan la clave del atributo, no la del valor.
- Las etiquetas de componente y la sintaxis de fudic (`:=`, `class:`, `delegate:`…) no son HTML y no
  se miran.

**CSS** (el `<style>` de un `.fud`, la guía y sus trozos, las hojas de `globalStyles` y `styles`):

| Escribe | Clave |
|---|---|
| `field-sizing: content` | `css.properties.field-sizing`, y `css.properties.field-sizing.content` si existe |
| `color: light-dark(…)` | la función, por el índice de funciones del generador (`css.types.color.light-dark`) |
| `:state(open)`, `::part(x)` | `css.selectors.state`, `css.selectors.part` |
| `&` | `css.selectors.nesting` |
| `@scope`, `@container` | `css.at-rules.scope`, `css.at-rules.container` |
| `100dvh` | la unidad, por la tabla de unidades del generador |

- Las propiedades personalizadas (`--x`) y los prefijos de proveedor no se miran.
- **Dentro de `@supports` no se avisa de lo que nombra su condición**: `(field-sizing: content)`
  protege la propiedad y su valor; `selector(:state(open))`, el selector. Lo demás del bloque se mira.
- Con varias claves posibles para una función, cuenta la de fecha más antigua: mejor callar que
  avisar en falso.

**TS** (lo que corre en el navegador: el `@code` de un `.fud` salvo `@server`, las carpetas `browser`
y `pipes`, y los módulos del proyecto que importan):

| Escribe | Clave, la primera que esté en la tabla |
|---|---|
| `el.showPopover()` | `api.<tipo del receptor>.showPopover`, sus tipos base, la interfaz que lo declara |
| `Promise.withResolvers()` | `javascript.builtins.Promise.withResolvers` (`PromiseConstructor` → `Promise`) |
| `new URLPattern(…)` | `api.URLPattern.URLPattern`, `javascript.builtins.URLPattern.URLPattern` |
| `requestIdleCallback(…)` | `api.requestIdleCallback`, `api.Window.requestIdleCallback`, `javascript.builtins.requestIdleCallback` |
| `el.addEventListener('beforetoggle', …)` | `api.<tipo>.beforetoggle_event` |

- El tipo sale del comprobador de tipos de `@fudic/typecheck`. Solo cuenta lo que se declara en las
  `lib` de TypeScript; lo del usuario o de un paquete no es del navegador.
- **Protegido** si va en la rama verdadera de un `if`, un `?:` o un `&&` cuya condición prueba ese
  nombre (`'showPopover' in el`, `typeof URLPattern === 'function'`, `typeof X !== 'undefined'`,
  `el.showPopover !== undefined`), después de un `if (!prueba) return` o `throw` en el mismo bloque,
  o con llamada opcional (`el.showPopover?.()`).
- **La sintaxis no se mira**: la baja Vite según su `build.target` (§3.9).
- `src/server` y lo que solo corre en el servidor no se miran: corre en Node.

### 3.7. Lo que pone fudic

`@fudic/baseline` lleva el **manifiesto** de lo que el runtime y el compilador emiten por su cuenta:

```ts
export interface EmittedFeature {
  /** The BCD key, or null when the data has none (`<style type="module" specifier>`). */
  readonly key: string | null;
  /** What makes fudic emit it. */
  readonly when: string;
  /** What fudic does where it is missing, or null when it needs it. */
  readonly remedy: string | null;
}

export const EMITTED: readonly EmittedFeature[];

/** The newest `newly` date among the entries with no remedy: the oldest browsers fudic runs in. */
export const FLOOR: string;   // '2024-03-05'
```

- **Lo del manifiesto no avisa en el código del usuario.** Si el autor escribe `shadowrootmode` en su
  `<template>` raíz, eso es fudic, no él.
- **Una entrada sin remedio sube el suelo.** `FLOOR` es la fecha más nueva de esas entradas. Un nivel
  cuya fecha de corte es anterior al suelo es `FUD1525` sobre `baseline` en `fudic.json`: «fudic
  needs browsers from 2024-03-05 on (declarative-shadow-dom, promise-withresolvers); Baseline 2023
  asks for 2023-12-31». Bombilla: «Subir a 2024». Es el único aviso por culpa de fudic.
- **`shadowrootdelegatesfocus` gana remedio** (§4.6) y deja de pedir nada: un formulario funciona en
  «widely».
- **Un test ata el manifiesto al código** (§4.7): si alguien usa en el runtime algo por encima del
  suelo sin declararlo con remedio, falla.

Lo que el autor elige en su `<template>` raíz y fudic solo copia (`shadowrootclonable`,
`shadowrootserializable`, `shadowrootreferencetarget`) no está en el manifiesto: avisa como cualquier
atributo suyo.

### 3.8. Librerías

- **Una lib declara su propio nivel**, que es lo que promete a quien la usa. Sus ficheros se juzgan
  con él y con su política, y esos avisos los ve quien desarrolla la lib (§3.3).
- **Al compilar una app**, sus detectores pasan también por los ficheros de cada lib que usa, con el
  nivel y el `allow` de la app. Si algo no pasa, sale **un `FUD1526` por lib** sobre `baseline` del
  `fudic.json` de la app, con la lista de features: «`@acme/ui` uses features this app's Baseline
  does not accept: popover, field-sizing». Bombilla: «Permitirlas en la app».
- Lo que la lib tiene protegido (en `@supports`, con detección) no cuenta.

### 3.9. Vite

- Si el usuario **no ha puesto `build.target`**, el plugin lo pone según el nivel: para cada navegador
  principal, su última versión publicada en la fecha de corte o antes (con los datos de 3.45.0 y `widely`, `['chrome124', 'edge124',
  'firefox125', 'safari17.4', 'ios17.4']`). Lo heredan los builds anidados (el SW y el borde).
- Si lo ha puesto, manda el suyo, y el plugin no dice nada.
- Vite usa el mismo valor para `cssTarget`. El CSS propio de fudic (el de los `.fud`, la guía, las
  hojas de `styles`) no pasa por Vite: lo que escribe el autor es lo que llega, y por eso el detector
  lo mira tal cual.

### 3.10. Las API

```ts
// @fudic/diagnostics
export type PolicyLevel = 'off' | 'hint' | 'info' | 'warning' | 'error';

export interface Policy {
  readonly codes: ReadonlyMap<FudCode, PolicyLevel>;
  /** What every code whose default is warning becomes, unless it has its own entry. */
  readonly warnings?: PolicyLevel;
}

export interface Suppression {
  readonly codes: readonly FudCode[];
  readonly scope: 'file' | 'next-line';
  /** The comment, for FUD1523 and the editor. */
  readonly span: Span;
  /** The 0-based line it covers; absent for scope 'file'. */
  readonly line?: number;
}

/** Reads the fud-disable directives out of a file's comments. Never throws. */
export function readSuppressions(
  comments: readonly { readonly span: Span; readonly text: string }[],
  lines: LineMap,
): { readonly suppressions: readonly Suppression[]; readonly diagnostics: readonly SourceDiagnostic[] };

/** What a file's diagnostics become under its project's policy and its own comments. */
export function applyPolicy(
  diagnostics: readonly FudDiagnostic[],
  policy: Policy | null,
  suppressions: readonly Suppression[],
  lines: LineMap,
): { readonly diagnostics: readonly FudDiagnostic[]; readonly unused: readonly Suppression[] };
```

```ts
// @fudic/baseline
export type Target = 'widely' | 'newly' | number;

export interface KeyStatus {
  readonly key: string;
  readonly feature: string;           // web-features id
  readonly newly: string | null;      // 'YYYY-MM-DD'; null when not in Baseline
  readonly support: Readonly<Partial<Record<CoreBrowser, string>>>;
}

export const AS_OF: string;                                   // the data's date
export function cutoff(target: Target, asOf?: string): string;
export function status(key: string): KeyStatus | undefined;
export function passes(key: string, target: Target, allow?: ReadonlySet<string>): boolean;
export function feature(id: string): FeatureInfo | Moved | undefined;   // for allow, hover, explain
export function browsersFor(target: Target): readonly string[];         // for Vite's build.target
export function firstKnown(candidates: readonly string[]): string | undefined;
export function cssFunctionKeys(name: string): readonly string[];
export function cssUnitKey(unit: string): string | undefined;
```

- Cada lector de comentarios (el lexer del `.fud`, el de líneas del `.fudapi` y del `.fudspec`, el de
  reglas CSS, Oxc para TS) da sus comentarios a `readSuppressions`. La directiva se lee en un solo
  sitio.
- `applyPolicy` se llama donde sale un diagnóstico hacia una persona: el informe de `@fudic/typecheck`
  (que usan el build, dev, la CLI y el MCP), el compilador dentro del plugin de Vite y la publicación
  del language server. Con los mismos datos, los tres dan lo mismo.

### 3.11. Editor, CLI y MCP

**Bombillas**:

| Sobre | Bombilla | Qué escribe |
|---|---|---|
| Cualquier warning, info o hint | «Silenciar FUDnnnn en esta línea» | El comentario encima, con la sangría de la línea y el cursor en el motivo |
| | «Silenciar FUDnnnn en este fichero» | El comentario arriba del todo |
| | «Apagar FUDnnnn en el proyecto» | `"FUDnnnn": "off"` en `diagnostics` de `fudic.json` |
| `FUD1524` | «Permitir `<id>` en el proyecto» | El id en `allow`; pasa `"baseline": "widely"` a la forma de objeto si hace falta |
| `FUD1524` en una declaración CSS | «Mover a `@supports`» | Saca la declaración de su regla y escribe detrás `@supports (p: v) { <selector> { p: v; } }` |
| `FUD1524` en un selector | «Envolver en `@supports selector(…)`» | Rodea la regla |
| `FUD1524` | «Ver en webstatus.dev» | Abre `https://webstatus.dev/features/<id>` |
| `FUD1525` | «Subir a `<año del suelo>`» | El año en `target` |
| `FUD1526` | «Permitirlas en la app» | Los ids en `allow` de la app |
| `FUD1527` movido o partido | «Cambiar por `<destino>`» | El id nuevo |
| `FUD1521`, `FUD1523`, `FUD1528` | «Quitar» | Borra la entrada o el comentario |

- La bombilla «Mover a `@supports`» no anida el `@supports` dentro de la regla: escribe una regla
  aparte, que vale en cualquier nivel sin depender del anidamiento de CSS.
- **Completado**: después de `fud-disable-next-line `, primero los códigos que salen en la línea
  siguiente, luego el resto, con su título; en `fudic.json`, por su esquema.
- **Hover** sobre un código dentro de un comentario `fud-disable`: título y severidad, la de por
  defecto y la del proyecto.
- **Esquema de `fudic.json`.** `@fudic/vscode` lo registra con `jsonValidation`. Describe todas sus
  claves, las de hoy y las nuevas; las de `diagnostics` son los códigos del catálogo con su título, y
  las de `allow`, los ids de feature con su nombre. Se genera al construir la extensión.
- **CLI**: `fudic new` escribe `"baseline": "widely"`.
- **MCP**: `fudic_check` devuelve los diagnósticos con la política aplicada (los toma de
  `@fudic/typecheck`). La guía (`overview.md` y su copia en español) gana «Diagnostics» y «Baseline»:
  las dos claves de `fudic.json`, los comentarios y qué hacer con un `FUD1524`.

### 3.12. Los códigos

| Código | Sev. | Título (`.md`) | Cuándo |
|---|---|---|---|
| `FUD1520` | warning | A code that does not exist | En `diagnostics` o en un `fud-disable`: desconocido o retirado |
| `FUD1521` | error | An error cannot be lowered | Un error con `off`/`hint`/`info`/`warning`, o en un `fud-disable` |
| `FUD1522` | error | A silenced line needs a code and a reason | `fud-disable` sin código o sin motivo |
| `FUD1523` | hint | Nothing to silence here | Un `fud-disable` que no silencia nada |
| `FUD1524` | warning | A feature newer than the project's Baseline | El detector encuentra una clave que no pasa |
| `FUD1525` | warning | fudic needs newer browsers | El nivel corta antes de `FLOOR` |
| `FUD1526` | warning | A library uses features the app does not accept | §3.8 |
| `FUD1527` | warning | Not a feature, or a feature that moved | Id de `allow` desconocido, movido o partido |
| `FUD1528` | hint | A feature allowed that nothing uses | Id de `allow` sin uso en el proyecto |

`FUD0725` gana dos problemas: `diagnostics` y `baseline`. `FUD1529`–`FUD1539` quedan libres.

---

## 4. Comportamiento

### 4.1. El orden

Para cada fichero:

1. Los detectores sacan sus usos; el juez de Baseline los cruza con el nivel, el `allow` y el
   manifiesto, y crea los `FUD1524`.
2. `readSuppressions` lee los comentarios del fichero.
3. `applyPolicy` quita lo silenciado por comentario (salvo errores), aplica la entrada del código o,
   si no tiene, la de `warnings`, y quita lo que queda en `off`.
4. Lo que no silenció nada sale como `FUD1523`.

`FUD1528` (un `allow` sin uso) y `FUD1526` son del proyecto: los da el informe de `@fudic/typecheck`,
que ve todos los ficheros, y el language server al abrir el `fudic.json`.

### 4.2. La tabla

- `packages/baseline/scripts/generate.ts` lee `web-features/data.json` y escribe
  `packages/baseline/src/data.generated.ts`, que se commitea. Se ejecuta a mano
  (`pnpm --filter @fudic/baseline generate`) al subir de versión `web-features`.
- Guarda, por clave de `css.*`, `html.*`, `svg.*`, `mathml.*`, `api.*` y `javascript.*`: su feature,
  su fecha `newly` (o `null`) y su soporte por navegador principal. Deduplica lo que se repite.
- Por feature: nombre y redirecciones (`moved`, `split`).
- Los índices: funciones CSS (último tramo de `css.types.*`) y unidades (una tabla escrita a mano en
  el generador; un test comprueba que cada clave existe en los datos).
- `AS_OF`: la fecha más nueva de `browsers`.
- Las claves `http.*` no se guardan: una cabecera que el navegador no entiende la ignora.

### 4.3. El detector HTML

En `@fudic/compiler`, como un analizador más sobre el documento estructurado. Recorre elementos y
atributos con su span y pide a `firstKnown` la clave por las candidatas de §3.6. El tipo DOM de una
etiqueta sale de una tabla etiqueta → interfaz que genera el generador desde `api.HTML*Element`.

### 4.4. El detector CSS

En `@fudic/compiler`, sobre `rules.ts` (SDD-49), que gana las declaraciones de cada bloque con su
span. Lo usan el `<style>` de un `.fud` y el plugin de Vite para la guía y las hojas de `styles`.
Lleva la pila de `@supports` abiertos y lo que nombran sus condiciones.

### 4.5. El detector TS

En `@fudic/typecheck`, sobre su programa. Para cada acceso a propiedad, llamada, `new` e identificador
global cuya declaración está en un fichero `lib.*.d.ts` de TypeScript, construye las candidatas de
§3.6 y pregunta a `firstKnown`. La protección se calcula subiendo por el árbol desde el uso.

### 4.6. El remedio de `shadowrootdelegatesfocus`

En `@fudic/core`, al hidratar: si la clase pide `delegatesFocus` (un control de formulario, o el autor
con `shadowrootdelegatesfocus`) y el shadow root que dejó el parser no lo tiene
(`shadowRoot.delegatesFocus === false`), el host:

- se vuelve enfocable (`tabIndex = -1` si no tiene `tabindex`);
- al recibir el foco, lo pasa al primer elemento enfocable de su shadow root;
- `focus()` hace lo mismo.

Un clic en su `<label>` y `host.focus()` acaban en el `<input>` interno, como con el atributo. Un
componente creado en el cliente no lo necesita: `attachShadow({ delegatesFocus: true })` está en todos
los navegadores desde hace años.

### 4.7. El test que ata el manifiesto

En `@fudic/typecheck` (que tiene el detector TS y llega al de HTML por el compilador):

1. Pasa el detector TS por el código de navegador de `@fudic/core`, `dom`, `forms`, `http` (cliente),
   `transport` e `i18n`.
2. Compila `examples/basic` y pasa el detector HTML por el HTML que sale.
3. Toda clave cuya fecha `newly` es posterior a la fecha de corte de «widely» tiene que estar en
   `EMITTED`; si no tiene remedio, su fecha no puede ser posterior a `FLOOR`.
4. `FLOOR` es exactamente la fecha más nueva de las entradas sin remedio.

### 4.8. El ejemplo

En `examples/basic`:

- `app-calendar-plain.fud` lleva `@* fud-disable FUD1380: … *@` con su motivo, y `FUD1380` deja de
  salir en el build.
- Un componente de nota con `<textarea>` y `field-sizing: content` dentro de `@supports`.
- Un menú con `popover` y `:state()`, con `"allow": ["state"]` en `fudic.json`.
- `fudic.json` con `"baseline"` y `"diagnostics": { "warnings": "error" }`: el build del ejemplo no
  tiene warnings.

---

## 5. Invariantes

- **Ningún error se baja ni se silencia**, por ninguna vía.
- **La severidad por defecto de un código no cambia**: la política cambia cómo se informa, y el
  mensaje lo dice.
- **Mismo fudic, mismo resultado**: Baseline no mira el reloj.
- **Lo que pone fudic nunca avisa en el código del usuario.**
- **Un detector no conoce niveles; el juez no conoce lenguajes.**
- **Mejor callar que avisar en falso**: una clave que no está en la tabla no avisa; entre dos
  candidatas, la más antigua.
- **Diagnósticos con span**: `FUD1520`–`FUD1523` sobre el código o el comentario; `FUD1524` sobre la
  propiedad, el selector, el atributo o el nombre; `FUD1525`–`FUD1528` sobre la clave o el id en
  `fudic.json`.
- **Cobertura.** `@fudic/baseline` nace al 100 % en las cuatro métricas. Todo fichero nuevo, al 100 %,
  con umbral por fichero en `compiler` y `vite`. `diagnostics` y `language-server` siguen al 100 %.

---

## 6. Criterios de aceptación

**La política**

1. `"FUD1380": "off"` quita `FUD1380` del build, de dev, del editor y de `fudic_check`.
2. `"FUD1022": "error"` hace que una traducción que falta rompa el build, y el mensaje dice «warning by
   default; error in this project».
3. `"warnings": "error"` sube todos los warnings; `"FUD1380": "off"` junto a él gana para `FUD1380`.
4. `"FUD0050": "off"` da `FUD1521` sobre la clave y `FUD0050` sigue saliendo como error.
5. `"FUD9999": "off"` da `FUD1520`; un código retirado, `FUD1520` con su sustituto.
6. `"diagnostics": []` da `FUD0725` con el problema `diagnostics`.

**Los comentarios**

7. `@* fud-disable-next-line FUD1380: x *@` en un `.fud` silencia la línea siguiente y no otra.
8. `@* fud-disable FUD1380: x *@` silencia todo el fichero, esté donde esté.
9. Lo mismo en `<style>` con `/* */`, en `@code` y en un `.ts` con `//`, y en `.fudapi` y `.fudspec`
   con `#`.
10. Sin motivo o sin código, `FUD1522`, y la línea no queda silenciada.
11. Con un código de error, `FUD1521`, y el error sigue.
12. Un comentario que no silencia nada da `FUD1523`; al quitar la causa del aviso, aparece.
13. Un fichero de una lib con un warning: al compilar la app no sale; un error sí.

**Baseline: niveles y tabla**

14. Con los datos de 3.45.0 (`AS_OF` 2026-10-27, corte de `widely` 2024-04-27): `popover` pasa en
    `widely`; `:state()` no pasa en `widely` y sí en `newly` y en `2024`; `field-sizing` pasa en
    `newly` y no en `2025`; `<dialog closedby>` no pasa en ninguno y el mensaje dice que falta Safari.
15. Sin `baseline`, se comprueba contra `widely`; `"baseline": 2014` y `"baseline": "pronto"` dan
    `FUD0725`.
16. `allow: ["popover"]` quita el aviso de `popover`; `allow: ["nada"]` da `FUD1527`; un id movido,
    `FUD1527` con su destino, y se aplica al destino; un id sin uso, `FUD1528`.
17. Los tests del juez fijan `AS_OF` por parámetro: no dependen de la fecha en que se ejecutan.

**Baseline: detectores**

18. HTML: `<search>`, `popover`, `<input type="color">`, `<dialog closedby="any">` y `@toggle` en un
    `<div>` dan su clave con el span del elemento o del atributo.
19. CSS: una propiedad, un valor, una función, un selector, `&`, una at-rule y una unidad dan su
    clave; `--x` y `-webkit-x` no dan nada.
20. CSS: dentro de `@supports (field-sizing: content)` no avisa `field-sizing`, y sí otra propiedad
    del mismo bloque; `@supports selector(:state(x))` protege `:state`.
21. CSS: la guía de la SDD-79 y una hoja de `styles` se miran como el `<style>` de un `.fud`.
22. TS: `el.showPopover()`, `Promise.withResolvers()`, `new URLPattern()`, `requestIdleCallback()` y
    `addEventListener('beforetoggle')` dan su clave; un método del usuario con el mismo nombre no.
23. TS: cada forma de protección de §3.6 quita el aviso; una condición sobre otro nombre no.
24. TS: un fichero de `src/server` no se mira.

**Lo que pone fudic**

25. Una app con formularios y sin `baseline` no da ningún aviso de Baseline.
26. `shadowrootmode` en el `<template>` raíz no avisa ni con `"baseline": 2023`; `shadowrootclonable`
    escrito por el autor sí avisa en `widely`.
27. `"baseline": 2023` da un solo `FUD1525`, con las features que lo impiden; la bombilla lo sube a
    2024.
28. El test de §4.7 pasa, y falla si se añade al runtime una llamada a `URLPattern` sin entrada en el
    manifiesto.
29. Un control de formulario hidratado sobre un shadow root sin `delegatesFocus`: un clic en su
    `<label>` y `host.focus()` dejan el foco en el `<input>` interno.

**Librerías y Vite**

30. Una lib con `"baseline": "newly"` que usa `field-sizing` sin proteger, dentro de una app en
    `widely`: un `FUD1526` en el `fudic.json` de la app con `field-sizing`; la bombilla lo añade a
    `allow` y desaparece.
31. Sin `build.target` del usuario, el build sale con el target que da `browsersFor` del nivel, y el
    SW también; con `build.target` del usuario, el suyo.

**Editor, CLI, MCP, ejemplo y cierre**

32. Cada bombilla de §3.11 escribe lo que dice la tabla, y después el aviso desaparece.
33. «Mover a `@supports`» deja una regla que no da ningún aviso nuevo.
34. El completado ofrece los códigos de la línea siguiente primero; el hover de un código en un
    comentario dice sus dos severidades; el esquema de `fudic.json` completa códigos, ids de feature
    y todas las claves de hoy.
35. `fudic new` escribe `"baseline": "widely"`.
36. `fudic_check` devuelve los diagnósticos con la política aplicada; la guía del MCP (inglés y
    español) explica las dos claves, los comentarios y `FUD1524`.
37. El ejemplo de §4.8 compila sin warnings con `"warnings": "error"`.
38. `pnpm typecheck`, `pnpm test`, `pnpm build` en verde; cobertura de §5.

### 6.1. La prueba de Pedro

En `examples/basic`, con el `.vsix` de la rama: escribir `field-sizing: content` en un componente y
ver el aviso en el editor y en `vite dev`; arreglarlo con «Mover a `@supports`»; escribir `popover` y
`:state()` y permitir `state` con la bombilla; silenciar un `FUD1380` con la bombilla y escribir el
motivo; poner `"warnings": "error"` y ver que el build falla con un warning; poner `"baseline": 2023`
y ver el aviso del suelo; bajar un error a `off` y ver `FUD1521`.

---

## 7. Fuera de alcance

Nada.

---

## 8. Decisiones

### 8.1. Tomadas al redactar

1. **Una política para todo.** Baseline no tiene su propio interruptor: `FUD1524` es un código más.
   Lo único propio es `allow`, porque apagar el código apaga todas las features a la vez.
2. **La severidad sigue siendo del código.** La política cambia cómo se informa; el mensaje lo dice,
   para que nadie busque en el `.md` una severidad que su proyecto no usa.
3. **Bajar un error es un error** (`FUD1521`), no se ignora en silencio: quien lo escribió cree que ha
   funcionado.
4. **Solo `warnings` como grupo.** Es lo que pide una CI; los info son dos y se nombran por código.
5. **`fud-disable` vale para todo el fichero esté donde esté.** Un rango que empieza a mitad de fichero
   sería otra cosa que recordar; la bombilla lo escribe arriba.
6. **Un nivel es una fecha de corte**, y «widely» es esa fecha menos 30 meses. Así los tres niveles se
   comparan entre sí (app y lib) y se traducen a versiones para Vite con la misma regla.
7. **La fecha de los datos, no el reloj.** El mismo fudic da el mismo resultado siempre: un build no
   cambia de un día a otro sin cambiar nada. Los datos se ponen al día con cada versión de fudic.
8. **El estado de cada clave, no de la feature.** La feature entera va al ritmo de su parte más nueva y
   avisaría de partes que nadie ha escrito.
9. **Tabla generada y commiteada**, sin `web-features` en runtime: el `.vsix` lleva solo lo que se usa.
10. **Cada detector donde está su lector**: HTML y CSS en el compilador, TS en `typecheck`. El juez y
    los datos, en `@fudic/baseline`, sin saber de lenguajes.
11. **Protección: `@supports` y unas pocas formas de JS.** Cualquier otra cosa que el autor sepa que es
    segura se silencia con la bombilla.
12. **La sintaxis de JS no se mira**: Vite la baja según su target, que ahora sale del nivel.
13. **`http.*` no se mira**: un navegador ignora la cabecera que no conoce. Las cabeceras son de la
    nota 3.
14. **Los avisos de una lib no se enseñan en la app**; lo que afecta a la app sale resumido en un
    `FUD1526` por lib, con su arreglo.
15. **`build.target` solo si el usuario no lo ha puesto.** Si lo pone, sabe lo que hace.
16. **`fudic new` escribe el nivel**, aunque sea el de por defecto, para que se vea dónde se cambia.
17. **`allow` por id de `web-features`**, que es el nombre que da webstatus.dev, y sigue las
    redirecciones avisando.
18. **«Mover a `@supports`» no anida**: una regla aparte vale en cualquier nivel; el anidamiento es
    de diciembre de 2023 y un proyecto puede pedir menos.
19. **El remedio de `delegatesFocus` en la hidratación**, no en el servidor: el atributo lo escribe el
    servidor y el navegador viejo lo ignora; solo el JS puede suplirlo, y un control ya lo lleva.
20. **El esquema de `fudic.json` entero**, no solo las claves nuevas: un esquema parcial marcaría las
    demás como desconocidas.
21. **Un comentario mal escrito es el mismo código que uno sin motivo** (`FUD1522`): en los dos casos
    el comentario no silencia nada y el arreglo es escribirlo entero.
