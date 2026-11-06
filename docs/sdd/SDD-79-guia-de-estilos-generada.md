# SDD-79 — La guía de estilos: generada completa, cortada en trozos y compartida por la lib

> **Estado:** `Listo` — [tareas](./SDD-79-Task.md).
> **Paquetes:** `@fudic/config` · `@fudic/compiler` · `@fudic/vite` · `@fudic/language-server` ·
> `@fudic/cli` · `@fudic/mcp` · `@fudic/diagnostics` · `examples/workspace`
> **Depende de:** 42 (la hoja del proyecto adoptada), 43 (librerías y la cadena de dependencias),
> 46 (`styles` que un componente elige), 49 (la poda por página y el aplanado de `@import`),
> 73 (`css: "link"`), BUG-50 (la CLI de workspace: `g lib --styles-only`, `add`) — todas en `Hecho`.
> **Enmienda:** BUG-50 §4.7 (`g lib --styles-only` desaparece en favor de `g guide`).
> **Rango de diagnósticos:** `FUD1440`–`FUD1459` (nuevo).
> **Decisiones de gramática:** ninguna (es configuración, CSS y tooling; la sintaxis `.fud` no cambia).
> **Origen:** conversación con Pedro del 2026-11-06.
> **Rama sugerida:** `sdd-79-guia-de-estilos-generada`, desde `main`.
>
> **Qué añade en una frase.** La CLI escribe una guía de estilos **completa** —tokens con modo oscuro
> y contraste AA, una fuente autoalojada, un favicon y un trozo de CSS por cada elemento que el
> navegador pinta— que vive en una lib del workspace (o dentro de una app suelta); la página la
> recibe entera sin escribir un `<link>`, cada componente adopta los trozos que nombra en
> `shadowrootadoptedstylesheets`, y el editor mantiene ese atributo al día.

---

## 1. Contexto y objetivo

### 1.1. Lo que hay hoy

- `fudic g lib <n> --styles-only` (BUG-50 §4.7) crea una lib con **un** `tokens.css` de un token
  (`:host { --<n>-ink: #1c1c1e; }`) declarado en `globalStyles`. El usuario parte de cero.
- Los tokens van en `:host` porque una hoja adoptada no tiene `:root`. Eso **impide tematizar**: cada
  componente vuelve a declarar el token y una zona de la página (`.oscuro { --x: … }`) no llega
  dentro. Pedro lo comprobó con una demo: el botón del sitio A sale naranja, el del B, azul.
- Una hoja adoptada no puede tener `@font-face` (no registra la fuente) ni reglas de `html`/`body`
  (`FUD0743`). Lo que necesita el documento no tiene sitio en una lib.
- Un `<link rel="stylesheet" href="@scope/lib/x.css">` **no funciona**: fuera de
  `rel="component"|"layout"|"snippet"` el `@` es una expresión Razor
  ([parser.ts:568-619](../../packages/compiler/src/html/parser.ts)). Una app no puede enlazar una hoja
  de una lib salvo por ruta relativa en disco.
- Los `url(…)` de una hoja `globalStyles`/`styles` se resuelven contra el `.fud` que se compila, no
  contra el `.css` que los contiene ([project-styles.ts:57-69](../../packages/compiler/src/emit/project-styles.ts)):
  una imagen o un icono en una hoja de lib da `FUD0363`.
- El editor solo ofrece y valida los `styles` del `fudic.json` más cercano
  ([project-config.ts:77-80](../../packages/language-server/src/project-config.ts)); el build los toma
  de **toda** la cadena (`choosableFor`, [styles.ts:141](../../packages/vite/src/styles.ts)). Un nombre
  de una lib que el build acepta, el editor lo marca `FUD0744`.
- La CLI solo escribe texto ([types.ts:12-19](../../packages/cli/src/types.ts)): no puede copiar una
  fuente. Ninguna plantilla trae favicon.

### 1.2. Lo que decidió la conversación

1. **Los tokens van en `:root`, siempre en la página.** Las custom properties son lo único que
   atraviesa el shadow boundary; en la página se pueden cambiar por zonas.
2. **La guía es un fichero de imports.** `guide.css` importa `tokens.css`, `document.css` y un trozo
   por elemento (`h1.css`, `button.css`, …). La página recibe la guía entera, aplanada y podada
   (SDD-49). Los ficheros importados que se pueden adoptar son **los trozos**.
3. **`shadowrootadoptedstylesheets` es obligatorio y es la verdad.** El build adopta exactamente lo
   que dice. Es la válvula de escape para lo que las reglas del compilador no prevean.
4. **El editor ayuda, con una asimetría.** Añade un trozo solo al escribir el elemento; avisa en los
   dos sentidos; **nunca quita** un trozo por su cuenta.
5. **Qué trozo pinta qué elemento se sabe por sus selectores**, no por el nombre del fichero.
6. **Cada trozo lleva su reset.** Solo `box-sizing` es de todos, y va en `globalStyles`.
7. **Cubrir todos los elementos** con estilo del navegador. Lo que sobre lo quita el usuario o la poda.
8. **Fuente autoalojada y open source** y **modo oscuro con contraste 4.5:1** desde el primer día.
9. **La guía vive en la lib**, con su fuente y su logo. En un workspace se crea siempre; una app
   suelta nace con la suya dentro.
10. **La copia doble se acepta.** Un elemento que está en la página y dentro de un componente lleva
    sus reglas dos veces (hoja de la página y trozo adoptado). Es un límite del navegador: no hay
    forma declarativa de que el documento adopte una hoja. Se descartaron `::part`, `@scope`,
    `@layer`, `<link>` dentro del shadow y una sintaxis propia `button::external` (§8.1.9).

### 1.3. El objetivo

Que `fudic new` (app suelta o workspace) deje una app que **ya se ve bien** en claro y en oscuro,
con su fuente y su favicon, y que un componente nuevo se vea igual que la página escribiendo solo
`<button>`: el editor añade `button` a su lista de adopción.

---

## 2. Dependencias

| SDD | Qué aporta |
|---|---|
| 42 | `globalStyles`/`styles` en `fudic.json`; `<style type="module" specifier>` en el `<head>` antes que las de componente; `FUD0740` (falta la hoja), `FUD0741` (dos hojas, un nombre), `FUD0743` (`:root`/`html`/`body` en una hoja adoptada), `FUD0744` (nombre que no es del proyecto), `FUD0745` (valor no literal) |
| 43 | `dependencyChain(root)` y `owningPackage(file)` de `@fudic/resolve`; la cadena se compone de la raíz a la hoja; una lib nunca ve las hojas de quien la consume |
| 46 | `choosableFor(file)`: los `styles` de toda la cadena que un componente puede nombrar |
| 49 | `flattenImports` (los `@import` relativos se aplanan; los `url()` se reescriben contra el fichero que los contiene), `prunePage` (reglas por ámbito, tokens y `@font-face` por página), `FUD0850`–`FUD0858`, `FUD0854` (`@import` en una hoja adoptada) |
| 73 | `css: "link"`: cada hoja de la página como fichero |
| BUG-50 | `g lib --styles-only`, `g style`, `add <lib> --project <x>` (solo `package.json`), `placeProject`, `scaffoldChanges` |

Dependencia nueva, solo como **fichero** dentro de `@fudic/cli/templates`: la fuente **Inter 4.1**
(`InterVariable.woff2` e `InterVariable-Italic.woff2`) con su `OFL.txt`, tal como se publican en
la release oficial de `rsms/inter`. No es un paquete npm.

---

## 3. Interfaz pública

### 3.1. `fudic.json` gana `guide`

```jsonc
{
  "kind": "lib",
  "globalStyles": { "base": "base.css" },
  "guide": { "sheet": "guide.css", "icon": "logo.svg" }
}
```

```ts
// @fudic/config
export interface GuideConfig {
  /** The guide's entry sheet, relative to the project root. */
  readonly sheet: string;
  /** The favicon every page of a project whose chain holds this guide gets. */
  readonly icon?: string;
}

export interface ProjectConfig {
  // …lo que ya tiene…
  readonly guide?: GuideConfig;
}
```

- `guide` vale en `kind: "app"` y en `kind: "lib"`. Una forma inválida (no objeto, `sheet` ausente o
  no string, `icon` no string) es `FUD0725`, como cualquier campo de `fudic.json`.
- Las rutas no salen del proyecto (`readFolder`, la misma regla que `server`/`browser`).

### 3.2. `@fudic/compiler`: leer una guía

El compilador sigue sin abrir ficheros: recibe un `textOf` del host, como `flattenImports`.

```ts
export interface GuidePiece {
  /** The file's basename without `.css`: what `shadowrootadoptedstylesheets` names. */
  readonly name: string;
  /** The piece's file, as the host spells paths. */
  readonly path: string;
  readonly css: string;
}

export interface Guide {
  /** The whole guide, imports flattened: what every page links (§4.2). */
  readonly sheet: FlatSheet;
  /** The adoptable imports, in import order (§4.3). */
  readonly pieces: readonly GuidePiece[];
}

export function readGuide(
  sheetPath: string,
  textOf: (path: string) => string | undefined,
  /** Files the same project declares in `globalStyles`: never pieces. */
  globals: ReadonlySet<string>,
): ParseResult<Guide>;

/** The tags a piece styles: the type selectors of the subjects of its rules (§4.5). */
export function piecesForTag(pieces: readonly GuidePiece[], tag: string): readonly string[];
```

`EmitOptions` gana dos campos, y `ProjectStyle` uno:

```ts
export interface GuideSheet {
  /** Spec of the guide's entry sheet, relative to the entry being compiled. */
  readonly spec: string;
  readonly sheet: FlatSheet;
}

export interface EmitOptions {
  // …
  /** The guides of the entry's chain, root first: linked before the layout's sheets (§4.2). */
  readonly guides?: readonly GuideSheet[];
  /** Spec of the favicon to write when the head has no `<link rel="icon">` (§4.7). */
  readonly icon?: string;
}

export interface ProjectStyle {
  readonly specifier: string;
  readonly css: string;
  /** The sheet's file, relative to the entry being compiled: its `url()` resolve from it (§4.6). */
  readonly spec?: string;
}
```

### 3.3. `@fudic/vite`

- `ProjectStyleChains` gana `guidesFor(file): readonly GuideSheet[]` y `iconFor(file): string | undefined`.
- `choosableFor(file)` incluye los **trozos** de cada guía de la cadena junto a sus `styles`.

### 3.4. `@fudic/language-server`

- `choosableStylesFor` pasa a la cadena entera más los trozos: lo mismo que `choosableFor` del build.
- Completado de etiqueta con `additionalTextEdits` (§4.8), diagnósticos `FUD1440`/`FUD1441` con su
  arreglo rápido (§4.9).

### 3.5. `@fudic/cli`

| Comando | Qué hace |
|---|---|
| `fudic g guide [name]` | En un workspace: una lib de guía en `libs/<name>` (por defecto `guide`). En una app suelta: la guía dentro de la app, en `src/guide/` |
| `fudic new <app>` | La app nace con su guía en `src/guide/` |
| `fudic new --workspace` | Crea siempre `libs/guide`; las apps y libs que crea dependen de ella |
| `fudic g app`, `fudic g lib` (en un workspace) | Dependen de cada lib de guía del workspace |
| `fudic add <guía> --project <x>` | Igual que hoy: solo la dependencia. Basta, porque la guía llega por la cadena (§4.2) |
| `fudic g lib --styles-only` | **Desaparece.** El flag es desconocido y el mensaje sugiere `fudic g guide` |

`FileChange` gana una variante binaria (`bytes: Uint8Array`) y `io` un `writeBytes`; `--dry-run`
la lista con su tamaño.

### 3.6. Los códigos

| Código | Sev. | Título (`.md`) | Cuándo |
|---|---|---|---|
| `FUD1440` | warning | A piece of the guide is not adopted | El template de un componente tiene un elemento que un trozo de su cadena pinta (§4.5) y el trozo no está en `shadowrootadoptedstylesheets`. Arreglo: añadirlo |
| `FUD1441` | warning | An adopted piece styles nothing here | Un trozo adoptado que, podado contra el shadow del componente, no conserva ninguna regla, **sin duda** (§4.9). Arreglo: quitarlo |
| `FUD1442` | error | A piece name that cannot be adopted | Un import adoptable de la guía cuyo nombre de fichero no cumple `STYLE_NAME_PATTERN` (`my-button.css`) |
| `FUD1443` | error | The guide's icon is missing | `guide.icon` nombra un fichero que no existe |

Que falte `guide.sheet` es `FUD0740` (falta una hoja del proyecto: el mismo hecho). Un trozo con el
mismo nombre que otra hoja de la cadena es `FUD0741`. Un trozo con `@import` es `FUD0854`.

---

## 4. Comportamiento

### 4.1. La guía generada

```
libs/guide/                     (en una app suelta: src/guide/)
  fudic.json                    { kind: "lib", globalStyles: { base }, guide: { sheet, icon } }
  package.json                  files + exports de todo lo de abajo
  README.md
  guide.css                     solo @import, en este orden:
  tokens.css                      1. :root con los tokens, @font-face
  document.css                    2. html/body: reset del documento, color-scheme, fuente base
  base.css                        3. *, *::before, *::after { box-sizing: border-box }
  h1.css … h6.css, p.css, …       4. un trozo por elemento (§4.4)
  fonts/InterVariable.woff2
  fonts/InterVariable-Italic.woff2
  fonts/OFL.txt
  logo.svg                      provisional: Pedro dará el definitivo
```

`base.css` está en `globalStyles` **y** lo importa `guide.css`: llega a todos los componentes sin
nombrarlo, y a la página por la guía.

### 4.2. La página recibe la guía sin escribir un `<link>`

Para cada entrada (ruta, layout, página), el host toma las guías de la **cadena del paquete de la
entrada** (`dependencyChain`, raíz primero) y las pasa en `EmitOptions.guides`. El emit las trata
como hojas de documento enlazadas (SDD-49): aplanadas, podadas con ámbito `document`, entregadas
como `<link>` a su copia (o `<style>` según `css`), y **antes** de las hojas del layout y de la ruta.
La guía define y el layout ajusta.

- Por eso `fudic add guide --project tienda` basta: añade la dependencia y la cadena hace el resto.
- No se resuelve ningún `href` de paquete: el host lee la guía de disco por su ruta, y el `href`
  lo pone el emit a la copia publicada. El `@` de Razor no entra en juego.
- Una app cuya cadena no tiene guía emite lo que emitía, byte a byte.

### 4.3. Qué es un trozo

Un trozo es un **import directo y relativo** de `guide.sheet` que cumple las tres condiciones:

1. su fichero tiene al menos una regla que se puede adoptar: un selector que no es solo
   `:root`/`html`/`body` (los de `FUD0743`), o una at-rule que no es `@font-face`/`@property`;
2. no está en `globalStyles` del mismo proyecto;
3. su nombre (basename sin `.css`) cumple `STYLE_NAME_PATTERN`; si no, `FUD1442` y no es trozo.

`tokens.css` y `document.css` no cumplen la 1: son solo del documento. `base.css` no cumple la 2.
Los imports anidados (un trozo que importa) no cuentan: el trozo da `FUD0854`.

Los trozos entran en `choosableFor` como si fueran `styles` del paquete de la guía, con el mismo
orden de la cadena y la misma comprobación de choques (`FUD0741`).

### 4.4. Los trozos que se generan

Un trozo por elemento al que el navegador da estilo propio. La lista exacta se cierra al implementar
contra las hojas de user agent de Chromium, Firefox y WebKit; esta es la de partida:

| Familia | Trozos (fichero → elementos que pinta) |
|---|---|
| Títulos | `h1` … `h6` |
| Texto | `p`, `blockquote`, `pre`, `code` (`code`, `kbd`, `samp`), `mark`, `small`, `abbr`, `hr`, `address`, `sub` (`sub`, `sup`) |
| Enlaces | `a` |
| Listas | `ul` (`ul`, `li`), `ol` (`ol`, `li`), `dl` (`dl`, `dt`, `dd`) |
| Medios | `img`, `video`, `audio`, `iframe`, `svg`, `figure` (`figure`, `figcaption`) |
| Tablas | `table` (`table`, `caption`, `thead`, `tbody`, `tfoot`, `tr`, `th`, `td`) |
| Formularios | `fieldset` (`fieldset`, `legend`), `label`, `input`, `select` (`select`, `option`, `optgroup`), `textarea`, `button`, `progress`, `meter`, `output` |
| Interactivos | `details` (`details`, `summary`), `dialog` (`dialog`, `::backdrop`), `popover` (`[popover]`) |

Cada trozo empieza con el reset de sus elementos y sigue con su estilo, escrito **solo** con tokens
de `tokens.css`. Las reglas del reset van envueltas en `:where(…)` para que un componente las
sobrescriba sin subir especificidad.

### 4.5. Qué trozo pinta qué elemento

`piecesForTag(pieces, tag)` devuelve los trozos con una regla cuyo **sujeto** (el último compuesto
del selector) tiene un selector de tipo igual a `tag`. `:where(button)` cuenta; `.btn` no; `*` no.

Es la regla del completado (§4.8) y de `FUD1440`: deliberadamente estrecha, para que el editor solo
añada lo que es seguro. Lo que una regla de clase o de atributo pinta se adopta a mano (§1.2.3).

### 4.6. Los `url()` de una hoja adoptada se resuelven desde su fichero

`ProjectStyle.spec` lleva la ruta del `.css`; `renderProjectStyles`, la poda y `cssLinked` reescriben
sus `url()` relativos contra ella antes de enlazarlos, igual que ya se hace con el CSS de un
componente ([module.ts:299-301](../../packages/compiler/src/emit/module.ts)). Sin `spec`, como hoy.
Vale para todas las `globalStyles` y `styles`, no solo para los trozos: es un defecto de SDD-42 que
este SDD necesita cerrar porque un trozo de lib (`select.css` con su flecha en SVG) lo pisa.

### 4.7. El favicon

`EmitOptions.icon` es el `guide.icon` de la guía **más cercana** de la cadena (la del propio paquete
si tiene, si no la de su dependencia más próxima). El emit escribe
`<link rel="icon" href="…">` con el asset publicado **solo si el `<head>` no tiene ya uno**: el que
escribe el autor manda. Se publica como cualquier asset de cabecera (hash, shell del SW).

### 4.8. El editor añade el trozo al escribir el elemento

Al aceptar el completado de una etiqueta dentro del `<template shadowrootmode>` raíz de un
componente, si `piecesForTag` devuelve trozos que el atributo no nombra, el `CompletionItem` lleva
un `additionalTextEdit` que los añade al final de `shadowrootadoptedstylesheets` (o crea el atributo
si no existe). Es el mismo mecanismo que ya inserta el `<link rel="component">`
([plugin.ts:1287-1323](../../packages/language-server/src/services/plugin.ts)).

Fuera del template raíz (layouts, rutas, el light DOM) no se añade nada: allí pinta la guía de la
página.

### 4.9. Los dos avisos, y la asimetría

- **`FUD1440`** (falta): un elemento del template, de un snippet que se pinta dentro o de una rama
  de control, para el que `piecesForTag` da un trozo no adoptado. Arreglo rápido: añadirlo.
- **`FUD1441`** (sobra): un trozo adoptado que, podado contra `shadowSurface` del componente
  (SDD-49), queda sin reglas. La poda conserva ante cualquier duda (una clase escrita con una
  expresión, un selector que no entiende), así que `FUD1441` **solo sale cuando es seguro**. Lo que
  crea un script en tiempo de ejecución no lo ve nadie: por eso es un aviso, no un error.
  Arreglo rápido: quitarlo.

**Nunca se quita solo.** El arreglo de `FUD1441` no entra en `fudic_fix` del MCP ni en ningún
«arreglar todo»: se registra en `repairsFor` con una marca de *manual* que `fudic_fix` respeta. El
de `FUD1440` sí entra (añadir es seguro).

Los dos salen en el editor y en el build (dev, `check`, MCP), como `FUD0744`: solo para el
componente de la entrada, una vez por error.

### 4.10. Tokens: modo oscuro y contraste

```css
:root {
  color-scheme: light dark;
  --guide-ink:     light-dark(#…, #…);
  --guide-surface: light-dark(#…, #…);
  /* … */
}
```

Cada color es un `light-dark()`. Una zona fuerza un modo con `color-scheme: dark` y, como
`color-scheme` se hereda a través del shadow boundary y `light-dark()` se resuelve donde se usa el
token, los componentes de esa zona cambian también. `document.css` documenta el patrón en un
comentario.

Los tokens, prefijados con el nombre del proyecto (`--<name>-…`):

| Grupo | Tokens |
|---|---|
| Color | `ink`, `muted`, `surface`, `raised`, `line`, `accent`, `on-accent`, `danger`, `on-danger`, `success`, `warning`, `focus` |
| Espacio | `space-1` … `space-8` |
| Tipografía | `font-sans` (Inter y la pila del sistema detrás), `font-mono` (pila monoespaciada del sistema), `text-xs` … `text-3xl`, `leading-tight`, `leading-normal`, `weight-normal`, `weight-medium`, `weight-bold` |
| Forma | `radius-sm`, `radius-md`, `radius-lg`, `radius-full`, `shadow-sm`, `shadow-md`, `focus-width` |
| Movimiento | `duration-fast`, `duration`, `easing` |

**Contraste (WCAG 2.2 AA), en claro y en oscuro.** Lo comprueba un test de la CLI que lee
`tokens.css` de la plantilla, resuelve cada `light-dark()` en sus dos valores y calcula la razón:

| Texto / primer plano | Fondo | Mínimo |
|---|---|---|
| `ink`, `muted`, `accent`, `danger` | `surface`, `raised` | 4.5:1 |
| `on-accent` | `accent` | 4.5:1 |
| `on-danger` | `danger` | 4.5:1 |
| `line`, `focus` | `surface`, `raised` | 3:1 |

### 4.11. La fuente

`tokens.css` declara dos `@font-face` (normal e itálica, `font-weight: 100 900`,
`font-display: swap`) con `src: url(./fonts/InterVariable.woff2) format("woff2")`. El aplanado
reescribe el `url()` contra `tokens.css` y el enlazado lo publica con hash (§2: ya funciona para un
fichero importado). La poda la quita de una página si nadie nombra la familia.

### 4.12. La CLI

- **Plantillas.** `templates/guide/**`: los CSS se renderizan (`{{project}}` para el prefijo de los
  tokens); las fuentes y `OFL.txt` se copian como bytes (§3.5).
- **`fudic new <app>`**: la guía en `src/guide/` y `guide` en el `fudic.json` de la app.
- **`fudic new --workspace`**: `libs/guide` siempre (con o sin `--app`/`--lib`); cada app y lib que
  crea lleva `"@<scope>/guide": "workspace:*"`.
- **`fudic g app` / `g lib` en un workspace**: dependen de cada proyecto del workspace cuyo
  `fudic.json` tiene `guide`.
- **`fudic g guide [name]`**: en un workspace, una lib nueva (falla si `libs/<name>` existe, como
  `g lib`); en una app suelta, `src/guide/` (falla si la app ya tiene `guide`).
- **Ayuda, README de la CLI y README generado** hablan de la guía; `g lib --styles-only` sale de los
  tres.

### 4.13. El ejemplo y la documentación

- `examples/workspace/libs/guia` pasa al formato de §4.1 (sin la fuente si se quiere aligerar: el
  ejemplo puede quedarse con la pila del sistema). `apps/tienda` deja de sobrescribir
  `--guia-accent` en una `globalStyles` y lo hace en su hoja de documento. Sus tests e2e siguen en
  verde.
- La guía del MCP (`packages/mcp/guide/html-css.md` y su copia en español) explica la guía, los
  trozos, la adopción y la asimetría en el mismo tono que el resto.

---

## 5. Invariantes

- **El build adopta lo que dice el atributo**, ni más ni menos. Ningún análisis añade o quita una
  hoja en tiempo de compilación.
- **Nada se quita solo.** Ni el editor, ni `fudic_fix`, ni la CLI tocan el atributo para quitar.
- **El compilador no abre ficheros**: `readGuide` lee por `textOf`.
- **Sin guía, nada cambia**: una app cuya cadena no tiene `guide` emite lo mismo que antes, byte a
  byte (lo fija un test).
- **Diagnósticos con span**: `FUD1440` sobre la etiqueta, `FUD1441` sobre el nombre en el atributo,
  `FUD1442` sobre el `@import`, `FUD1443` sobre el valor de `icon` en `fudic.json`.
- **Cobertura.** Todo fichero nuevo nace al 100 % en las cuatro métricas, con su umbral por fichero
  en los paquetes con deuda heredada (`compiler`, `vite`, `cli`). `language-server` sigue al 100 %.

---

## 6. Criterios de aceptación

**Configuración**

1. `guide: { sheet, icon }` se lee; `guide: "x"`, `{}` y `{ sheet: 1 }` dan `FUD0725`; una ruta que
   sale del proyecto, también.

**Leer la guía**

2. `readGuide` sobre la plantilla de §4.1 da como trozos exactamente los ficheros de §4.4, en orden
   de import, y ni `tokens`, ni `document`, ni `base`.
3. Un import `my-button.css` adoptable da `FUD1442` sobre su `@import` y no es trozo.
4. Un import solo con `:root { … }` y `@font-face` no es trozo y no da diagnóstico.
5. `piecesForTag(…, "button")` da `["button"]`; `"li"` da `["ul", "ol"]`; un trozo con solo
   `.btn { … }` no sale para ninguna etiqueta; `:where(summary)` cuenta para `summary`.

**La página**

6. Una ruta de una app que depende de la guía lleva el `<link>` a la copia podada de la guía antes
   que las hojas del layout, sin un `<link>` en el fuente; con `css: "link"` y con `inline`.
7. La copia de la página conserva `h1` si la página tiene un `<h1>` en el light DOM y lo quita si
   solo hay `<h1>` dentro de componentes.
8. Una app sin guía en su cadena emite el mismo HTML que antes (snapshot existente sin cambios).
9. Dos guías en la cadena (lib y app) se enlazan las dos, la de la lib primero.
10. La fuente se publica con hash desde `fonts/` de la lib, y la regla `@font-face` de la copia
    apunta a ese asset; una página que no nombra `--<name>-font-sans` no la lleva.

**Los trozos adoptados**

11. Un componente de `libs/ui` con `shadowrootadoptedstylesheets="button"` adopta el trozo de
    `libs/guide`; el `<head>` lleva su `<style type="module" specifier="button">` una vez aunque lo
    adopten diez componentes.
12. Un trozo de la app con el mismo nombre que uno de la guía da `FUD0741`.
13. Un trozo con `@import` da `FUD0854`.
14. Un `url(./icons/arrow.svg)` en `select.css` de la lib se publica y se enlaza (hoy: `FUD0363`).
    Lo mismo para una `globalStyles` de lib (§4.6).

**El favicon**

15. Sin `<link rel="icon">` en el layout, cada página lleva el de la guía con su asset publicado.
16. Con uno escrito por el autor, se respeta y no se añade otro.
17. `icon` que no existe: `FUD1443` sobre el valor en `fudic.json`.

**El editor**

18. En `libs/ui`, el completado de `shadowrootadoptedstylesheets` ofrece los trozos de la guía, y
    nombrar `button` no da `FUD0744` (hoy sí).
19. Completar `<button` dentro del template raíz añade `button` al atributo; sin atributo, lo crea;
    si ya está, no toca nada; en el light DOM de un layout no añade nada.
20. Un `<h1>` sin `h1` adoptado da `FUD1440`; su arreglo lo añade.
21. `h1` adoptado sin ningún `<h1>` da `FUD1441`; su arreglo lo quita.
22. Con `<h1 class="@cls">` no hay `FUD1441` para un trozo de clases; con un `<h1>` dentro de un
    snippet que se pinta en el componente, tampoco.
23. `fudic_fix` aplica el arreglo de `FUD1440` y **no** el de `FUD1441`.
24. El build reporta `FUD1440` y `FUD1441` una vez por componente de la entrada.

**La CLI**

25. `fudic new tienda` deja `src/guide/` con los ficheros de §4.1 y `guide` en su `fudic.json`; la
    fuente es byte a byte la de la plantilla; `pnpm build` de la app generada pasa.
26. `fudic new --workspace` deja `libs/guide`; con `--app tienda --lib ui`, las dos dependen de la
    guía; el build del workspace generado pasa.
27. `g app admin` en ese workspace depende de la guía; `g lib` también.
28. `g guide` en un workspace crea la lib; en una app suelta, `src/guide/`; repetido, falla.
29. `g lib x --styles-only` da flag desconocido con la sugerencia de `fudic g guide`.
30. `add guide --project admin` sigue tocando solo `package.json`, y la ruta de `admin` lleva la guía.
31. `--dry-run` lista las fuentes con su tamaño y no escribe.
32. El test de contraste de §4.10 pasa en claro y en oscuro; cambiar `ink` a `#999` lo rompe.

**El ejemplo y el cierre**

33. `examples/workspace` en el formato nuevo; sus e2e en verde.
34. `pnpm typecheck`, `pnpm test`, `pnpm build` en verde; ficheros nuevos al 100 %;
    `language-server` al 100 %.

### 6.1. La prueba de Pedro

Crear con la CLI publicada en local una app suelta y un workspace con `--app tienda --lib ui`;
abrir las dos en el navegador, en claro y en oscuro (preferencia del sistema y una zona con
`color-scheme: dark`); escribir un componente nuevo con un `<button>` y un `<details>` y ver que el
editor añade los dos trozos, y que quitar el `<details>` avisa sin quitar nada.

---

## 7. Fuera de alcance

- **El logo definitivo.** Va un `logo.svg` provisional; Pedro lo cambiará.
- **La página de inicio bonita** que enlaza a la documentación del framework: cuando exista la web
  de docs.
- **`href` de paquete en `<link rel="stylesheet">`/`"icon"`** escrito a mano. No hace falta para la
  guía (§4.2) y abre una ambigüedad con Razor que merece su propio SDD.
- **Evitar la copia doble** (§1.2.10). Se revisará si el estándar trae adopción declarativa para el
  documento.
- **Sintaxis propia** tipo `button::external { … }` (§8.1.9).
- **Detectar en el completado** los trozos que pintan por clase o atributo (§4.5).
- **Migrar** guías escritas a mano con tokens en `:host`: siguen funcionando como antes.

---

## 8. Decisiones

### 8.1. Tomadas al redactar

1. **La guía se inyecta por la cadena, no por un `<link>`.** Un `href` de paquete choca con el `@`
   de Razor (§1.1); la cadena ya existe, ya la usan `globalStyles`, y hace que `add` baste.
2. **Un campo `guide` en `fudic.json`**, no una convención de nombre de fichero: dice cuál es la
   entrada y dónde está el icono, y en una app suelta apunta a `src/guide/`.
3. **Los trozos se deducen de los imports**, no se declaran uno a uno en `styles` (propuesta de
   Pedro): la lista de imports **es** el catálogo.
4. **Un fichero es solo del documento por su contenido** (§4.3.1): no hay que marcarlo.
5. **`piecesForTag` solo mira selectores de tipo** (§4.5). El completado y `FUD1440` tienen que
   acertar siempre; lo demás lo decide el autor.
6. **`FUD1441` usa la poda**, que ya conserva ante la duda: «sobra» solo cuando es seguro.
7. **Nombre `guide`** para la lib y la carpeta: lo que genera la CLI va en inglés, como el código.
   El ejemplo puede seguir llamándose `guia`.
8. **`--styles-only` desaparece** en lugar de quedar como alias: dos formas de crear lo mismo, una
   peor, es lo que BUG-50 vino a quitar.
9. **`::external` se descarta para fudic.** La idea de Pedro (traer las reglas de la página para un
   elemento y ajustarlas dentro) es selectiva, que es lo que les falta a las propuestas de
   [WICG/webcomponents#909](https://github.com/WICG/webcomponents/issues/909), pero en fudic
   generaría lo mismo que el atributo con mucho más trabajo. Queda como posible comentario a esa
   issue.
10. **Solo Inter**, normal e itálica; `code`/`pre` con la monoespaciada del sistema. Una fuente
    menos que descargar.
11. **`g app`/`g lib` dependen solas de la guía** del workspace: es lo que hace que una app nueva se
    vea como las demás. Quitar la dependencia es la forma de no usarla.

### 8.2. Tomadas al implementar

1. **Las rutas de `guide` usan la regla de `readFolder`** extraída a un `insidePath` común: una
   ruta vacía, absoluta o que sale del proyecto es `FUD0725` con el problema `guide` y su motivo.
2. **Que existan `guide.sheet` y `guide.icon` no lo mira `readProjectConfig`**: varios lectores le
   pasan un `exists` que siempre dice sí (el editor, el typecheck). Lo mira quien lee la guía con
   disco de verdad (§4.2, tarea 7).
3. **La ruta absoluta de cada hoja viaja en el host** (`HostStyle.file`, en `@fudic/vite`) y cada
   entrada la convierte en su `spec` relativo al compilarse: la cadena se cachea por paquete y el
   `spec` cambia con cada entrada.
4. **`@fudic/compiler` depende de `@fudic/config`** para `STYLE_NAME_PATTERN`: una sola definición
   del nombre de hoja (`FUD1442` la usa).
5. **Un trozo con `@import`, o solo con `@media` que envuelve `:root`,** se decide por lo que hay
   dentro: un `@media` solo con reglas del documento no hace trozo; un `@import` sí (y da `FUD0854`).
6. **Dónde va la guía en el `<head>`:** justo antes de la primera hoja (`<link rel="stylesheet">` o
   `<style>`) del head del layout, o antes de lo que aporta la ruta, o al final. El layout pide a la
   ruta `guide()` (como ya pide `sheet(key)`): la copia está podada para cada página y solo la ruta
   la conoce. El layout escribe esa llamada solo si su propia cadena tiene guía o icono; sin guía,
   ni una línea cambia.
7. **El favicon** se busca en los `<head>` de los layouts y de la entrada (`rel` con el token
   `icon`); si alguno lo trae, no se añade.
8. **La guía no entra en el aviso de CSS muerto (`FUD0852`)**: es normal que una página no use la
   mayoría de los trozos, y avisar de cada uno sería ruido.
9. **`FUD1440` sale una vez por etiqueta**, sobre su primera aparición: diez `<button>` sin adoptar
   son un solo arreglo. Los dos avisos los calcula una sola función del compilador
   (`guideAdoptionDiagnostics`) que usan el build y el editor; el build le da la superficie del
   shadow con los snippets ya expandidos (`shadowSurface`), el editor la del template solo
   (`templateSurface`).
10. **En el editor, un template que pinta un `@render` no recibe `FUD1441`**: el editor tiene el
    fichero y no los snippets expandidos, así que no ve lo que el snippet escribe. `FUD1440` sobre
    los elementos de un snippet lo da el build, que sí los expande.
11. **El editor lee la cadena con `dependencyChain` del paquete que posee el fichero**; sin
    `package.json` alrededor, el `fudic.json` más cercano solo. Se vuelve a leer al cambiar
    cualquier `fudic.json` o cualquier `.css`.
12. **El completado que añade el trozo es el de las etiquetas del servicio HTML** (tras `<`), en el
    template raíz; la expansión de Emmet no lo añade (lo hará `FUD1440` y su arreglo).
13. **El arreglo de `FUD1441` quita el nombre y, si era el único, el atributo entero.** Un arreglo
    *manual* sale en la bombilla, y en el MCP como opción (`options`), nunca como `fixable`.
