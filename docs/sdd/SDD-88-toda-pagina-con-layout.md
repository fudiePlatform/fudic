# SDD-88 — Toda página tiene layout

> **Estado:** `Hecho` (2026-11-18) — [tareas](./SDD-88-Task.md).
> **Paquetes:** `@fudic/compiler` · `@fudic/diagnostics` · `@fudic/language-core` ·
> `@fudic/language-server` · `@fudic/typecheck` · `@fudic/formatter` · `@fudic/api` · `@fudic/vite` ·
> `@fudic/testing` · `@fudic/workbench` · `@fudic/cli` · `@fudic/mcp` · `examples/workspace` ·
> `examples/vista-errores`
> **Depende de:** 21 (layouts), 22 (la CLI y `g page`), 40 (props de layout), 43 (librerías), 48
> (huecos del layout), 56 (`_error.fud`), 58 (idiomas), 60 (el `.fudapi` y `layout`), 78 (ver la
> pieza), 87 (la página de error compartida y `g error-page`).
> **Rango de diagnósticos:** `FUD1580`–`FUD1589` (nuevo). Usados: `FUD1580`, `FUD1581`, `FUD1582`, `FUD1583` (§8.2).
> **Decisiones de gramática:** 183 (nueva); enmienda la 51 y la 82.
> **Origen:** la revisión de las notas que dejó el cierre de SDD-87, hablada con Pedro el
> 2026-11-18. Al mirar el `lang` de una página sin layout salió que esa forma de página existía.
> Pedro: «una página que muestra un error debe tener la misma estructura que una página normal».
> **Rama sugerida:** `sdd-88-toda-pagina-con-layout`, desde `main`.
>
> **Qué cambia en una frase.** Desaparece la página sin layout (el `.fud` con `<!DOCTYPE html>` y sin
> huecos). Toda página, incluida `_error.fud`, enlaza un layout con `<link rel="layout">`. Un
> documento con doctype es siempre un layout. La CLI, el editor, el MCP, `@fudic/testing`, el
> workbench y los ejemplos dejan de escribir páginas sin layout.

---

## 1. Contexto y objetivo

### 1.1. El problema

Hoy un `.fud` de página puede tener dos formas:

- **Una ruta:** `<link rel="layout" href="…">` arriba, sin doctype. El layout pone el documento.
- **Una página sin layout** (decisiones 51 y 82): un documento entero, con
  `<!DOCTYPE html><html><head><body>` y sin `@RenderBody()`. Pone su propio documento.

La segunda forma rompe la estructura de la aplicación. Una app con un layout común puede acabar con
páginas que no lo usan, y nadie se da cuenta:

- **`g error-page` escribe siempre una página sin layout** (SDD-87 §3.6, decisión 12). La página de
  error de toda app nueva sale sin la cabecera, el pie ni los estilos del layout.
- **`g page` la escribe** si el proyecto no tiene ningún layout, sin avisar, o con `--no-layout`.
- **`fudic new` y `g app` con `--no-layout`** crean una app entera sin layout.
- **El emit de una página sin layout** tira los atributos del `<html>` del autor y pone los suyos
  (`htmlLang`, [module.ts:655](../../packages/compiler/src/emit/module.ts)). Un layout, en cambio,
  respeta el `lang` del autor.

### 1.2. Lo que hay hoy

- **El compilador** decide la forma en `structureShell`
  ([structure.ts:756](../../packages/compiler/src/document/structure.ts)). Un documento con doctype y
  algún hueco es `layout-document`; sin ninguno, es `page-document`. `page-document` tiene su propio
  emit (`buildPageModule`, `emitPageModule`, `emitPageModuleMapped`) y aparece en una veintena de
  ramas del compilador.
- **Lo que necesita una página de error para usar un layout ya existe.** `_error.fud` puede empezar
  por `<link rel="layout">` (lo hacen `examples/basic` y los tests de `@fudic/testing`). Su
  `_error.fudapi` puede declarar `layout` (`FUD1010` solo prohíbe `load` y funciones). El servidor
  la pinta por el mismo wrapper que una ruta, con `ctx.data` = el error. Un layout con props
  obligatorias sin `layout` que las resuelva es `FUD0702`, como en cualquier ruta.
- **Una librería puede tener layouts** (`src/layouts`, [layout.ts:25](../../packages/cli/src/plans/layout.ts)).
  Uno de sus `.fud` puede enlazar un layout suyo por un `href` relativo.
- **Quien escribe páginas sin layout hoy:**
  - la CLI: `resolveLayout` devuelve `path: null` con `--no-layout` o si no encuentra ninguno
    ([layout.ts:137, :156](../../packages/cli/src/layout.ts)), y entonces `g page` usa la plantilla
    `page.fud`; `new` / `g app` con `--no-layout`; `g error-page` siempre; `g showcase` en una app sin
    layout;
  - `@fudic/testing`: `hostPage()` ([host.ts:80](../../packages/testing/src/host.ts)), que usan `mount`
    y `renderSnippet`;
  - `@fudic/workbench`: `pageSource()` ([pages.ts:187](../../packages/workbench/src/pages.ts)), `casePage`
    ([paint.ts:37](../../packages/workbench/src/paint.ts)) y `documentOf` con `layout: null`
    ([showcase.ts:200](../../packages/workbench/src/showcase.ts));
  - el editor: el snippet `page` («fudic standalone page»,
    [snippets.ts:319](../../packages/language-server/src/services/snippets.ts));
  - el MCP: `noLayout` en `fudic_generate` y `fudic_new`, y el ejemplo de `src/_error.fud` de
    librería en la guía.
- **Las páginas sin layout que hay en el repo:** `examples/workspace/apps/tienda/src/routes/_error.fud`,
  `examples/workspace/libs/ui/src/_error.fud`, `examples/vista-errores/vista-errores.fud`, las
  fixtures `packages/compiler/fixtures/home.fud`, `packages/compiler/test/fixtures/blog-monolithic.fud`,
  `packages/formatter/fixtures/canonical/home.fud`, varias de `packages/diagnostics/fixtures/`, la de
  `packages/testing/test/lib-workspace/libs/ui/src/_error.fud`, las esperadas de
  `packages/workbench/test/expected/app-card/`, y unos 150 ficheros de test con fuentes de página sin
  layout.
- **Un `.fud` sin doctype y sin `<link rel="layout">`** es un componente. Si se llama `_error.fud`,
  el descubrimiento lo compila igual como página de error
  ([discover.ts:97](../../packages/vite/src/discover.ts)), sin decir nada.
- **`layoutPropsType`** ([layout-props.ts:22](../../packages/api/src/layout-props.ts)) trata un
  `href` de paquete (`@acme/ui/layouts/_layout.fud`) como relativo, y el `.d.ts` importa `$Props`
  de un camino que no existe. Hoy apenas se nota; con esta SDD, una página de error de app que use
  el layout de una librería lo escribe así.

### 1.3. Objetivo

1. Un documento con `<!DOCTYPE html>` es siempre un layout. Sin ningún hueco es `FUD1580`.
2. Toda página es una ruta que enlaza un layout. `_error.fud` también, en una app y en una
   librería. Un `_error.fud` que no enlaza layout es `FUD1581`.
3. La CLI no escribe nunca una página sin layout: `g page`, `g error-page` y `g showcase` enlazan un
   layout, y sin ninguno que enlazar se niegan (`FUD1582`). Fuera `--no-layout`.
4. El compilador, el editor y el resto de paquetes pierden todo lo que solo existía para la página
   sin layout.
5. `@fudic/testing` y el workbench pintan sus páginas sintéticas con un layout propio.
6. El MCP y su guía dicen lo mismo.
7. Los ejemplos: toda página con layout. En `examples/workspace`, `admin` pinta sus páginas y su
   página de error con el mismo layout, el de `ui`.

---

## 2. Dependencias

| SDD | Qué aporta |
|---|---|
| 21 | Los layouts, `<link rel="layout">` y `@RenderBody()` |
| 22 | `fudic g page`, `resolveLayout`, `--layout` / `--no-layout` |
| 40 | Las props de un layout y `FUD0702` |
| 43 | Las librerías, sus layouts exportados por `package.json` |
| 48 | Un layout es un documento con cualquier hueco; sin `@RenderBody()`, `FUD0423` |
| 56 | `_error.fud`, `_error.fudapi` y `FUD1010` |
| 58 | `lang` y `dir` del `<html>` según el idioma |
| 60 | `layout` en el `.fudapi` de una ruta, y su `.d.ts` |
| 78 | El workbench, `fudic_render` y `fudic_look` |
| 87 | La página de error de una librería, `errorPageOf` y `g error-page` |

Ningún paquete gana dependencias nuevas.

---

## 3. Interfaz pública

### 3.1. Las formas de un `.fud`

| Forma | Cómo se reconoce | Rol |
|---|---|---|
| Componente | sin doctype, sin `<link rel="layout">` | `component-document` (o `snippet-document`) |
| Ruta | sin doctype, con `<link rel="layout">` | `route-document` |
| Layout | con doctype | `layout-document` |

- **`page-document` desaparece** del AST (`PageDocument`, su miembro de la unión y su exportación).
- **Un documento con doctype y sin ningún hueco** es un `layout-document` con `FUD1580` (§3.5). Ya no
  es una página.
- **Un documento con doctype y algún hueco pero sin `@RenderBody()`** sigue siendo `FUD0423`, como
  dice SDD-48.
- **Un enlace `<link rel="layout">` a un documento sin huecos** sigue dando `FUD0423` en quien
  enlaza: apunta a un layout sin `@RenderBody()`.

### 3.2. Decisión de gramática 183

> **183.** **Toda página enlaza un layout** (SDD-88). Un fichero que empieza con `<!DOCTYPE` es un
> layout; sin ningún hueco (`@RenderBody()`, `@RenderHead()`, `@RenderSection()`) es `FUD1580`. Una
> página es siempre una ruta: `<link rel="layout">` primero, sin doctype (decisión 83). No hay
> página autónoma. Enmienda la 51 (el doctype ya no es «modo página», es «modo layout») y la 82
> (desaparece «un documento con doctype sin `@RenderBody()` sigue siendo una página autónoma»).

En `docs/gramar/gramatica-v1-decisiones.md`:

- **La 51 y la 82** llevan la nota «Enmendada por la decisión 183».
- **Las 43.c, 58, 59, 60, 61 y 78** hablan de «modo página». Llevan la misma nota: ahora aplican al
  layout.
- **La producción `document`** (`page_document | component_document`) pasa a
  `layout_document | route_document | component_document`.
- **El «Ejemplo canónico (modo página)»** se sustituye por una ruta con su layout.
- **La decisión 183** se añade al final y al índice de decisiones.

### 3.3. La CLI

**`resolveLayout`** ([layout.ts](../../packages/cli/src/layout.ts)) deja de devolver `path: null`:

- busca como hoy: `--layout`, el `_layout.fud` más cercano subiendo hasta `routesDir`,
  `<routesDir>/_layout.fud`, `src/layouts/_layout.fud`, y el layout de `routes/index.fud`;
- si no encuentra ninguno, es `FUD1582` (§3.5);
- `explicit === null` (`--no-layout`) deja de existir.

**`fudic g page`:** siempre `route.fud`. La plantilla `page.fud` se borra.

**`fudic g error-page`:**

```
fudic g error-page [--project <name>] [--layout <href>] [--force]
```

| Dónde | Escribe | Layout que enlaza, si no hay `--layout` |
|---|---|---|
| App | `src/routes/_error.fud` | el que elige `resolveLayout` para ese fichero, como `g page` |
| Librería | `src/_error.fud` | `src/layouts/_layout.fud` de la librería |

- **La plantilla `_error.fud`** pasa a ser una ruta: `<link rel="layout" href="{{layoutHref}}">`,
  `<head><title>@data.status · @data.title</title></head>`, el comentario `@* … *@` que dice qué
  trae `data` y, si el layout tiene props obligatorias, cómo resolverlas con `layout` en
  `_error.fudapi`. Después, el `<h1>`, el `detail` y el enlace a `back` o a `home` de hoy. Sin
  `{{lang}}`: el `lang` es del layout.
- **El `href`** se escribe como en `g page`: relativo si el layout es del mismo proyecto, el
  especificador del paquete (`@acme/ui/layouts/_layout.fud`) si es de una librería.
- **Sin layout que enlazar**, `FUD1582` y no escribe nada.
- **No escribe `_error.fudapi`.** Si el layout tiene props obligatorias, el build lo dice con
  `FUD0702`, como en cualquier ruta.
- **El informe** de SDD-87 §3.6 no cambia, y gana una línea con el layout enlazado:
  `layout     ../layouts/_layout.fud`.

**`fudic new`, `fudic new --workspace --app`, `fudic g app`:** fuera `--no-layout`. `--layout`
sigue (`{own}` o `{href}`). Pasar `--no-layout` es el error de opción desconocida que la CLI ya da a
cualquier opción que no existe. `frameOf` siempre devuelve `href`. Fuera la línea del README «No
layout: each page is a whole document» y la línea del informe «layout none».

**`fudic g showcase`:** en una app sin layout, `FUD1582`. `ShowcaseInput.layout` deja de admitir
`null`.

**`fudic g component --in`** (`wire.ts`): fuera la rama de página sin layout.

**`TemplateRole`** pierde `'page-document'`. `_error.fud` pasa a `'route-document'`. `api.ts`
deja de mapear `page-document`.

**La ayuda** (`help/commands.ts`) y `packages/cli/README.md`: fuera `--no-layout`; `g page` dice
que enlaza el layout más cercano y que sin layout se niega; `g error-page` dice que enlaza un layout
y cuál, y documenta `--layout`.

### 3.4. `@fudic/testing` y `@fudic/workbench`

**`hostPage()`** ([host.ts:80](../../packages/testing/src/host.ts)) escribe una **ruta** que enlaza un
layout de host:

- el layout es `node_modules/.fudic-test/_host-layout.fud`, escrito una vez con `cached` (contenido
  fijo): doctype, `<html>`, `<head>` con `<meta charset="utf-8">`, el script `fudic:runtime` y
  `@RenderHead()`, y `<body>` con `@RenderBody()`;
- la ruta es lo que hoy va dentro del documento: `<link rel="layout" href="./_host-layout.fud">`,
  los `<link rel="component">`, el `@code` y el markup (decisión 83);
- `mount` y `renderSnippet` no cambian de firma. Lo que pintan dentro del `<body>` es lo mismo que
  hoy.

**El workbench** hace lo mismo con su propio layout de banco, escrito en la carpeta del banco
(`<proyecto>/<BENCH_FOLDER>/_bench-layout.fud`):

- `pageSource()` ([pages.ts:187](../../packages/workbench/src/pages.ts)) y `casePage`
  ([paint.ts:37](../../packages/workbench/src/paint.ts)) escriben rutas que lo enlazan;
- `documentOf` ([showcase.ts:200](../../packages/workbench/src/showcase.ts)) pierde la rama
  `layout === null`, e `isShowcaseFile` deja de quitar un doctype inicial;
- las esperadas de `test/expected/app-card/` se reescriben con la forma nueva.

### 3.5. Los diagnósticos

| Código | Severidad | Título | Cuándo | Lo emite |
|---|---|---|---|---|
| `FUD1580` | error | A whole document is a layout | Un `.fud` empieza con `<!DOCTYPE` y no tiene ningún hueco. El mensaje dice que una página enlaza un layout con `<link rel="layout">` y no escribe doctype, y que un layout necesita `@RenderBody()`. Span: el doctype | el compilador (`structureShell`), así que el editor, `fudic check`, el build y dev |
| `FUD1581` | error | The error page links no layout | Un `_error.fud` que es la página de error de su proyecto (`<routesDir>/_error.fud` de una app, `src/_error.fud` de una librería) no tiene doctype ni `<link rel="layout">`. Arreglo: enlazar el layout de la app (`fudic g error-page --force`). Span: el inicio del fichero | el typecheck (editor y `fudic check`) y el descubrimiento (build y dev) |
| `FUD1582` | error | No layout to link | `g page`, `g error-page` o `g showcase` no encuentran layout. El mensaje dice dónde buscó y cómo crear uno (`fudic g layout _layout`) o elegirlo (`--layout`) | la CLI |

- **Un `_error.fud` con doctype** da `FUD1580`, no `FUD1581`: un hecho, una voz.
- **Con `FUD1581`**, el descubrimiento no compila ese fichero como página de error. La app pinta con
  la página mínima de `@fudic/server` (`minimalErrorPage`), que no es un `.fud`.
- **En el build**, el reporter ya dice cada diagnóstico una vez por fichero, span y código. Que
  `FUD1581` lo emitan el typecheck y el descubrimiento no lo repite.

Los textos de los `.md` que hablan de «page» como documento con doctype se actualizan:

- **`FUD0150`, `FUD0151`, `FUD0152`, `FUD0153`, `FUD0191`:** «a page or layout» / «a page» pasa a
  «a layout»;
- **`FUD0426` y `FUD0427`:** fuera «page» de la lista;
- **`FUD0423`:** dice también que un documento sin ningún hueco es `FUD1580` en su propio fichero.

### 3.6. `layout` en `_error.fudapi`

Ya funciona y se fija con tests:

- **`_error.fudapi` puede declarar `layout`.** Su handler recibe `(ctx, data)` con `data` tipado
  como `ErrorPage`, en el `.d.ts` generado y en el editor.
- **El servidor** lo ejecuta al pintar la página de error, con el `data` del error, como en una
  ruta.
- **Lo mismo vale para el `src/_error.fudapi` de una librería** (SDD-87 §4.3).

### 3.7. `layoutPropsType` con un `href` de paquete

En [layout-props.ts](../../packages/api/src/layout-props.ts), un `href` que no empieza por `.` ni por
`/` es un especificador de paquete. El tipo es `import('<href>').$Props`, sin componer caminos.
Relativo y absoluto, como hoy.

### 3.8. El MCP

- **`GENERATE_OPTIONS`** y **`fudic_new`** pierden `noLayout`. `layout` sigue, y gana descripción:
  «the layout the page links; by default the nearest `_layout.fud`».
- **La descripción de `fudic_generate`** dice que `page` y `error-page` enlazan un layout, y que sin
  ninguno se niegan con `FUD1582`.
- **La guía, en inglés y en español:**
  - **`pages.md`:** fuera el párrafo del «page document» (líneas 18-19 y 22-23). Lo sustituye uno:
    toda página enlaza un layout; un documento con doctype es un layout; sin huecos es `FUD1580`.
  - **`pages.md`, «Páginas de error»:** el ejemplo de `src/_error.fud` de librería pasa a ser una
    ruta que enlaza `./layouts/_layout.fud`. Un párrafo nuevo dice que la página de error enlaza el
    mismo layout que las demás páginas de la app, que un `_error.fud` sin layout es `FUD1581`, y que
    las props obligatorias del layout se resuelven con `layout` en `_error.fudapi`, con un ejemplo
    `fudapi`.
  - **`html-css.md`** (líneas 94-95): «a file that starts with `<!DOCTYPE html>` is a layout».
- **`guide-examples.test.ts`** pasa con los ejemplos nuevos.

### 3.9. Lo que pierde cada paquete

| Paquete | Qué se va |
|---|---|
| `compiler` | `PageDocument`, `buildPageModule`, `emitPageModule`, `emitPageModuleMapped`, `htmlLang`, `pageBoxes`, y las ramas `page-document` de `anchor.ts`, `walk.ts`, `view-scope.ts`, `data-without-load.ts`, `await.ts`, `localize.ts`, `oxc-code.ts`, `surface.ts`, `resolve.ts`, `api-links.ts`, `level.ts`, `markup.ts`, `route-client.ts` y `compose.ts`. El `<link rel="layout">` dentro del `<head>` de un documento con doctype, que hoy se recoge y se descarta en silencio ([structure.ts:737](../../packages/compiler/src/document/structure.ts)), pasa a ser `FUD0439` (un layout no enlaza otro layout) |
| `language-core` | la rama de página de `emit-client.ts` y de `data.ts` |
| `language-server` | el rol `page` (`mode.ts`), el snippet `page` y `PAGE_SKELETON`, y `page` en `MARKUP_ROLES`, `inHead`, `@await` / `@catch`, `@code` en el head y `link-server` en el head (`snippets.ts`); la rama de `href.ts` |
| `vite` | el rol `page` de `analyze.ts` y la rama `page-document` de `transform.ts`. El README deja de decir que las rutas son documentos con doctype |
| `cli` | §3.3 |
| `testing`, `workbench` | §3.4 |
| `mcp` | §3.8 |

`EmitOptions.i18n` se queda: lo siguen usando las alternativas y la traducción. Su comentario deja
de hablar del `lang` de una página sin layout.

---

## 4. Comportamiento

### 4.1. El `lang` del documento

El `<html>` es siempre el de un layout:

- **Si el autor escribe `lang` o `dir`**, mandan los suyos.
- **Si no los escribe**, con dos o más idiomas los añade `localize.ts` con el locale de la
  compilación, como hoy en un layout. Con uno, el `<html>` sale como lo escribió el autor.
- **Las plantillas de layout** escriben `lang` con el primer idioma del proyecto, como hoy
  (SDD-71).

Con esto desaparece el caso de las notas del cierre de SDD-87: un fichero que dice `es` en una app
sin idiomas declarados ya no sale con `lang="en"`.

### 4.2. La página de error de una librería

- Enlaza un layout **de la librería**, por un `href` relativo (`./layouts/_layout.fud`). Se resuelve
  desde su carpeta al compilarla en cada app, como sus componentes (SDD-87 §4.2).
- Una app que comparte la página de error de una librería y quiere que sus errores tengan la misma
  estructura que sus páginas usa el mismo layout de la librería en sus rutas. Si quiere otro,
  escribe su propio `_error.fud`, que gana (SDD-87 §3.2).
- `g error-page` en una librería sin `src/layouts/_layout.fud` es `FUD1582`, y el mensaje dice
  `fudic g layout _layout --project <lib>`.

### 4.3. Los ejemplos

**`examples/workspace`:**

- **`libs/ui`** gana `src/layouts/_layout.fud`, que es el layout de hoy de `admin` movido a la
  librería, con el comentario del Service Worker adaptado. Se exporta en su `package.json`
  (`"./layouts/*": "./src/layouts/*"`).
- **`libs/ui/src/_error.fud`** pasa a ser una ruta que enlaza `./layouts/_layout.fud`. Su
  `<style>` va al `<head>` de la ruta y conserva `data-error-page="ui"`.
- **`admin`** borra su `src/layouts/_layout.fud`. Sus rutas (`index`, `pedidos`, `fallos`, `entrar`)
  enlazan `@fudic/example-ui/layouts/_layout.fud`. Sus páginas y su página de error tienen el mismo
  documento.
- **`tienda/src/routes/_error.fud`** pasa a ser una ruta que enlaza `../layouts/_layout.fud`, con
  `data-error-page="tienda"`.
- **`tests/errores.spec.ts`**, además de lo de hoy: la página de error de `admin` y una página normal
  de `admin` tienen el mismo `<head>` del layout (el script `fudic:runtime` y el `<html lang="es">`).
  Lo mismo en `tienda`.

**`examples/vista-errores`** gana `src/layouts/_layout.fud`, y `vista-errores.fud` pasa a ser una
ruta que lo enlaza. Los tests que leen el corpus (`typecheck` y `compiler`) se actualizan a las
posiciones nuevas. Los errores que el corpus quiere mostrar son los mismos.

**`examples/basic`** ya enlaza layout en todas sus páginas, también en `_error.fud`. No cambia.

### 4.4. Las fixtures y los tests

- **`packages/compiler/fixtures/home.fud`** pasa a ser una ruta que enlaza
  `packages/compiler/fixtures/_layout.fud` (nuevo). `scripts/build.ts` la emite por el camino de
  las rutas. El golden `home.mjs` se regenera.
- **`blog-monolithic.fud`** y **`packages/formatter/fixtures/canonical/home.fud`**, igual: ruta más
  layout.
- **Las fixtures de `packages/diagnostics/fixtures/`** de `FUD0150`, `FUD0151`, `FUD0161`,
  `FUD0152`, `FUD0153` y `FUD0427` pasan a ser layouts (con `@RenderBody()`). Las de `FUD0850`,
  `FUD0853`, `FUD0857` y `FUD0919` pasan a ser rutas con un layout al lado. Cada una sigue
  provocando su código, y su `.fixed.fud` sigue sin él.
- **`packages/testing/test/lib-workspace/libs/ui/src/_error.fud`** enlaza un layout de esa librería.
- **Todo test con una fuente de página sin layout** se reescribe como ruta más layout, y sigue
  comprobando lo mismo. Los tests que comprobaban la página sin layout como forma válida (CLI:
  `page.test.ts`, `cli.test.ts`, `help.test.ts`, `locale.test.ts`, `showcase.test.ts`,
  `workspace/shapes.test.ts`, `wire.test.ts`; language-server: los de snippets y `mode.test.ts`;
  workbench: `showcase.test.ts`) pasan a comprobar el rechazo (`FUD1580`, `FUD1582`, opción
  desconocida) o desaparecen junto con la rama que probaban.

### 4.5. Lo que no cambia

- **`minimalErrorPage`** de `@fudic/server` (un HTML fijo, no un `.fud`) sigue siendo la página de
  emergencia: sin `_error.fud`, con `FUD1570` o con `FUD1581`.
- **`redirectHtml`** de `@fudic/vite` (la redirección de idioma) es un HTML fijo, no una página.
- **El servidor y el runtime** no cambian: ya pintan rutas con layout.

---

## 5. Invariantes

- **No hay página sin layout.** Ningún paquete, plantilla, snippet, generador ni ejemplo escribe un
  `.fud` con doctype sin huecos, y el compilador lo rechaza (`FUD1580`).
- **La página de error es una página.** Enlaza un layout como cualquier ruta; sin él, `FUD1581`.
- **La CLI nunca elige «sin layout».** Si no hay layout que enlazar, se niega (`FUD1582`); no
  escribe otra cosa en silencio.
- **El `lang` es del layout.** El autor manda; el emit solo lo añade cuando falta y hay dos o más
  idiomas.
- **`mount` y `renderSnippet` pintan lo mismo** dentro del `<body>` que antes de esta SDD.
- **Una ruta con layout emite lo mismo** que antes de esta SDD, byte a byte. Los goldens de rutas no
  cambian; solo cambian los de páginas sin layout, que pasan a ser rutas.
- **Cobertura.** Lo nuevo, al 100 % en las cuatro métricas. Los paquetes que hoy están al 100
  (`@fudic/diagnostics`, `@fudic/language-core`, `@fudic/language-server`, `@fudic/typecheck`,
  `@fudic/testing`, `@fudic/workbench`, `@fudic/mcp`) siguen al 100. `@fudic/compiler`, `@fudic/vite`,
  `@fudic/cli`, `@fudic/api` y `@fudic/formatter` no bajan.

---

## 6. Criterios de aceptación

**El compilador**

1. Un `.fud` con `<!DOCTYPE html>`, `<html>`, `<head>`, `<body>` y sin ningún hueco da `FUD1580` con
   el span del doctype, y su rol es `layout-document`.
2. Un documento con `@RenderHead()` y sin `@RenderBody()` sigue dando `FUD0423`, no `FUD1580`.
3. Una ruta que enlaza un documento sin huecos da `FUD0423` en la ruta.
4. Un documento con doctype y un `<link rel="layout">` en su `<head>` da `FUD0439`.
5. `page-document`, `PageDocument`, `emitPageModule` y `emitPageModuleMapped` no existen
   (`pnpm typecheck` lo prueba, y el índice de `@fudic/compiler` no los exporta).
6. Con `locales: ['es', 'en']`, un layout sin `lang` sale con `lang="en"` en `/en/…`; un layout con
   `lang="es"` sale con `lang="es"` en todas. Con un solo idioma, el `<html>` sale como lo escribió el
   autor.
7. Los goldens de rutas con layout no cambian.

**La página de error**

8. Un `src/routes/_error.fud` sin doctype ni `<link rel="layout">` da `FUD1581`, en el editor, en
   `fudic check` y en el build. La app pinta un 404 con la página mínima.
9. Lo mismo con el `src/_error.fud` de una librería: `fudic check` en la librería y el build de una
   app que la usa dan `FUD1581`.
10. Un `_error.fud` con doctype da `FUD1580` y no `FUD1581`.
11. Un `_error.fud` que enlaza un layout con una prop obligatoria y sin `_error.fudapi` da `FUD0702`.
    Con un `_error.fudapi` que declara `layout`, su handler recibe `data: ErrorPage` (un
    `data.status` es `number` y un `data.foo` es error de tipos) y la página pinta lo que devuelve.
12. El `src/_error.fud` de una librería que enlaza `./layouts/_layout.fud` se pinta en una app con
    el layout de la librería.

**`layoutPropsType`**

13. Con `href="@acme/ui/layouts/_layout.fud"`, el tipo es `import('@acme/ui/layouts/_layout.fud').$Props`.
    Con un `href` relativo, el de hoy.

**La CLI**

14. `fudic g page /x` en un proyecto sin ningún layout da `FUD1582` y no escribe nada. Con un layout,
    escribe una ruta que lo enlaza, como hoy.
15. `fudic g page /x --no-layout`, `fudic new app --no-layout` y `fudic g app x --no-layout` dan el
    error de opción desconocida.
16. `fudic g error-page` en una app escribe `src/routes/_error.fud` enlazando el layout que elige
    `resolveLayout`. En una librería con `src/layouts/_layout.fud`, `src/_error.fud` enlazando
    `./layouts/_layout.fud`. En una librería sin layout, `FUD1582` con
    `fudic g layout _layout --project <lib>` en el mensaje.
17. `fudic g error-page --layout <href>` enlaza ese layout. Un `href` que no es un layout da
    `FUD0449`, como en `g page`.
18. El `_error.fud` generado compila sin diagnósticos con el layout de `fudic new`, y renderizado
    con `{ status: 404, title: 'Not Found', path: '/x', home: '/admin/' }` tiene el documento del
    layout y un enlace a `/admin/`.
19. `fudic g showcase` en una app sin layout da `FUD1582`.
20. La ayuda de `new`, `g app`, `g page` y `g error-page`, y el README de la CLI, no nombran
    `--no-layout`. La de `g error-page` documenta `--layout`.
21. Ninguna plantilla de `packages/cli/templates` tiene rol `page-document`, y `page.fud` no existe.

**El editor**

22. Los snippets de documento vacío son `component`, `route` y `layout`. No hay `page`.
23. En un `.fud` con doctype y sin huecos, el editor marca `FUD1580`.

**`@fudic/testing` y el workbench**

24. `mount` de un componente escribe una ruta que enlaza `_host-layout.fud`, y el HTML del `<body>`
    es el de antes de esta SDD (los tests de `mount` y `renderSnippet` de hoy pasan sin cambiar sus
    expectativas del cuerpo).
25. Las páginas del banco, `fudic_render engine:"browser"` y `fudic_look` pintan con
    `_bench-layout.fud`. Las esperadas de `app-card` son rutas.

**El MCP**

26. `fudic_generate` y `fudic_new` no aceptan `noLayout`. `fudic_generate { kind: "error-page" }` en
    una librería sin layout devuelve `FUD1582`.
27. La guía (`pages.md` y `html-css.md`, en inglés y en español) dice lo de §3.8, y
    `guide-examples.test.ts` pasa con el ejemplo de librería que enlaza su layout y con el de
    `_error.fudapi` con `layout`.

**Los ejemplos**

28. Ningún `.fud` de `examples/` (fuera de `node_modules` y `dist`) empieza con `<!DOCTYPE` sin tener
    un hueco.
29. `examples/workspace`: la página de error de `admin` (la de `ui`) y `/admin/` tienen el mismo
    layout, el de `ui`; la de `tienda` y `/` tienen el de `tienda`. Los e2e de errores pasan con lo de
    §4.3.
30. Los tests del corpus de `examples/vista-errores` pasan con los mismos errores.

**Cierre**

31. `pnpm typecheck`, `pnpm build`, `verify:generated`, la cobertura de §5, y los e2e de
    `examples/workspace` y `examples/basic`, en verde.

---

## 7. Fuera de alcance

Nada.

---

## 8. Decisiones

### 8.1. Tomadas al redactar

1. **Toda página enlaza un layout, sin excepción** (Pedro). Una app tiene una estructura, y una
   página que no la usa, aunque sea la de error, la rompe. Se quita la forma, no solo el generador:
   si el compilador la aceptara, volvería por otra puerta.
2. **Un documento con doctype es siempre un layout.** Es la regla más simple que deja una sola forma
   para cada cosa. Sin huecos, no se convierte en otra cosa: es un layout mal escrito (`FUD1580`).
3. **`FUD1580` y no `FUD0423` para el documento sin huecos.** Quien lo escribe casi siempre quería
   una página, no un layout. El mensaje tiene que decirle que enlace uno, no que añada
   `@RenderBody()`.
4. **`FUD1581` solo para `_error.fud`.** Un `.fud` sin layout en `src/routes` es un componente, y
   los componentes pueden vivir ahí. `_error.fud` es el único fichero que, por su nombre, tiene que
   ser una página.
5. **La CLI se niega antes que elegir.** `g page` sin layout escribía una página sin avisar. Ahora
   dice qué hacer (`FUD1582`), igual que `g error-page` y `g showcase`.
6. **Se revierte la decisión 12 de SDD-87.** El miedo era un layout con props que no se pudieran
   resolver sin `load`. Ya se resuelven: `layout` en `_error.fudapi` recibe el error como `data`, y si
   falta, `FUD0702` lo dice al compilar. Si la página de error falla al pintarse, queda
   `minimalErrorPage`.
7. **La página de error de una librería enlaza un layout de la librería.** Es lo único que puede
   resolver desde su carpeta en todas las apps. La app que quiere la misma estructura en errores y
   páginas usa ese layout en sus rutas, y el ejemplo `admin` lo hace así. Si quiere otro, escribe su
   propio `_error.fud`. No hay diagnóstico para una app cuyo layout no coincide con el de la página
   compartida: es la misma regla de SDD-87, la propia gana.
8. **`g error-page` no escribe `_error.fudapi`.** `g page` no lo hace por el layout, y `FUD0702` ya
   dice qué falta y cómo.
9. **`@fudic/testing` y el workbench usan un layout propio, fijo.** Sus páginas son sintéticas:
   aíslan un componente, no prueban la estructura de la app. Un layout mínimo deja el `<body>` igual
   que hoy.
10. **Sin herramienta de migración.** El framework se cerró ayer, y las únicas páginas sin layout
    están en este repo. Se reescriben a mano, y `FUD1580` dice qué hacer a quien tenga una.
11. **El arreglo de `layoutPropsType` va aquí.** Con esta SDD, la página de error de una app que usa
    el layout de una librería lo enlaza por su especificador. Sin el arreglo, su `$Props` sería
    `any` o un camino que no existe.
12. **Los SDD cerrados no se reescriben.** SDD-22 (§4.5, regla 3 de `resolveLayout`) y SDD-87
    (§3.6 y decisión 12) llevan una nota «Enmendada por SDD-88». La gramática sí se actualiza
    (§3.2): es el documento vivo.

### 8.2. Tomadas al implementar

1. **`FUD1581` también para un `_error.fud` que es un layout con huecos.** El §3.5 lo decía solo de
   un fichero sin doctype ni `<link rel="layout">`. Un layout con `@RenderBody()` como página de
   error se quedaba sin compilar como tal y sin ningún aviso: la app pintaba la página mínima y
   nadie decía por qué, que es lo que el §5 prohíbe. Ahora el descubrimiento y el typecheck dicen
   `FUD1581` de toda página de error que no es una ruta, salvo el documento sin huecos, que ya dice
   `FUD1580`. Lo encontró la sesión de test.
2. **`FUD1583`: el runtime es del layout.** Un `<script type="module" src="fudic:runtime">` en el
   `<head>` de una ruta se escribía tal cual y la página se quedaba sin runtime, sin preloads y sin
   decirlo. Una página sin layout lo llevaba en su `<head>`; una ruta no tiene dónde ponerlo, porque
   el documento es del layout. Es un error del pase de estructura (editor, `fudic check`, build),
   sobre el `<script>`, y vale para todo marcador que no sea hijo directo del `<head>` de un layout:
   el `<head>` o el markup de una ruta, un componente, el `<body>` de un layout. Lo encontró la
   sesión de test al convertir los tests de páginas a rutas.
3. **El layout de host de `@fudic/testing` lleva el `lang` del proyecto.** La página sin layout lo
   ponía con `htmlLang`; un layout sin `lang` y con un solo idioma sale sin él (§4.1), y `mount`
   perdía `document.documentElement.lang` (SDD-71 §3.1). El layout de host escribe el primer idioma
   del proyecto (`DEFAULT_LOCALE` sin idiomas) y se guarda con `cached` por su contenido,
   `_host-layout-<hash>.fud`, en vez del nombre fijo del §3.4: un proyecto que cambia de idioma no
   lee un fichero viejo. El layout del banco sigue sin `lang`: sus páginas nunca lo tuvieron.
4. **El layout del banco vive en la carpeta de cada proceso**, `<proyecto>/<BENCH_FOLDER>/<pid>/`
   `_bench-layout.fud`, junto a `routes/`, y no en `<BENCH_FOLDER>/` directamente: la limpieza de
   carpetas huérfanas borra todo lo que no es un pid. Lo escribe `emptyBenchDir`, y las páginas lo
   enlazan por un `href` relativo (`../` desde la página desnuda, `../../` desde la de un criterio),
   para que las esperadas de `app-card` no dependan del disco.
5. **Los espacios junto a un componente.** La página sin layout quitaba los blancos entre etiquetas
   de componente leyendo los estilos de su `<head>` (`pageBoxes`); una ruta nunca lo ha hecho. Se
   acepta: no se porta `pageBoxes` a las rutas, y el HTML de una página que antes no tenía layout
   lleva algún espacio más.
6. **`ErrorPage` sale también por `@fudic/http/contract`**, que es de donde importa el `.d.ts`
   generado: el `layout` de `_error.fudapi` recibe `data: ErrorPage`. El `src/_error.fudapi` de una
   librería gana además las props de su layout (`layoutProps`), como el de una app.
7. **`resolveLayout` recibe el `--project`** para que el mensaje de `FUD1582` diga
   `fudic g layout _layout --project <nombre>` cuando se dio, y `libraryLayout` elige el layout de la
   página de error de una librería.
8. **El descubrimiento lee la página de error de una librería donde está.** Al cerrar, `verify:generated`
   destapó un fallo de SDD-87 que esta SDD hizo visible: en la propia librería, el descubrimiento
   buscaba su `_error.fud` en `src/routes/` en vez de en `src/`, y `fudic test` de un workspace con
   `g error-page --project <lib>` no arrancaba. Ahora una página de error que no es la de las rutas
   de una app se lee en el fichero que da `errorPageOf`. De paso, `dataShapeOf`, `laterFieldsOf` y
   `routeBlocksOf` reciben solo un `DocumentGraph`: la rama sin `serverApis` era de la página sin
   layout.
