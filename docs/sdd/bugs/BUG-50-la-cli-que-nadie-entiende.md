# BUG-50 · La CLI que nadie entiende: ayuda que confunde, librerías que no se pueden probar y apps sin dirección

> **Estado:** `Listo` (2026-10-16)
> **Corrige:** [SDD-22](../SDD-22-fudic-cli.md) (la CLI), [SDD-44](../SDD-44-cli-de-workspace.md)
> (workspace, `g app`, `g lib`), [SDD-53](../SDD-53-fudspec-autoria.md) (`g spec`, fixture) y el
> `GLOBALS_DTS` de `@fudic/language-core`.
> **Paquetes:** `@fudic/cli` · `@fudic/language-core` · `@fudic/typecheck` · `examples/workspace` · `@fudic/workbench` · `@fudic/testing` (§4.2, decisión de Pedro)
> **Depende de:** [SDD-57](../SDD-57-tests-unitarios.md) (`@fudic/testing`, `Hecho`) y
> [SDD-59](../SDD-59-terminos-de-serie.md) (`@fudic/terms`): sin él, el `.fudspec` generado no
> puede pasar en verde.
> **Rango:** el de SDD-22, `FUD0440`–`FUD0459` (libres desde `FUD0452`).
> **Rama:** `bug-50-cli-usable` (worktree `fudic-bug-50`), desde `main` en `e4f7a8a`.

---

## 1. Contexto y síntoma

Se instaló `@fudic/cli@0.0.1` desde Verdaccio y se usó como lo haría un desarrollador nuevo,
leyendo solo lo que imprime. Ninguna de las tareas llegó a un resultado útil:

1. **La ayuda no orienta.** Un solo bloque de ~90 líneas sin ejemplos ni punto de partida; el
   primer comando es `fmt`. *Project*, *app*, *workspace*, *lib*, *piece*, *plan*, *term* y
   *section* no se definen. `--project` dice a la vez que tiene valor por defecto y que no lo
   tiene. *target* significa dos cosas (`--force` y `new --target`). Las opciones describen el
   código que emiten (`--server` → `emit @code { @server { load() } }`), no para qué sirven.
2. **Cualquier error vuelca la ayuda entera** detrás de una línea, y la línea se pierde.
3. **Workspace con una app y una lib:** la primera app no puede usar la lib (`new` no tiene
   `--uses`) y no hay forma de añadírsela después. La segunda app sí, con `g app admin --uses ui`.
4. **Las dos apps se sirven en `/`.** Nada dice en qué URL vive cada una.
5. **No hay `dev` ni `preview` del workspace.** La raíz solo tiene `build`.
6. **`fudic g component button --project ui` falla** (FUD0440): la lib no tiene prefijo, aunque
   su README dice que el `prefix` de `fudic.json` es el que convierte `card` en tag. El error
   sugiere `app-button` en una librería.
7. **El componente es un fichero suelto,** sin test, sin spec y sin fixture.
8. **El spec es una plantilla comentada**: ningún criterio real, ningún término conocido y
   ninguna forma de ejecutarlo.
9. **La fixture solo aparece si el componente tiene props obligatorias**, y para obtenerla con
   el spec ya creado hay que pasar `--force`, que borraría los criterios escritos.
10. **No hay tests unitarios** (`fudic g test` → *unknown type*), aunque `@fudic/testing` existe.
11. **Ejecutar el spec falla:** *`@fudic/workbench` is not installed in this workspace*.
12. **Una librería no puede probar sus componentes**: no tiene `vite`, ni `@fudic/vite`, ni
    `@fudic/workbench`, ni `@fudic/testing`. Un equipo que solo hace componentes para que otros
    los usen no puede trabajar.
13. **Comentarios de diseño en ficheros del usuario:** `fudic-globals.d.ts` habla de "BUG-11" y
    del "emitter"; `fudic-env.d.ts` y `_layout.fud` explican el compilador por dentro.
14. **READMEs que no cuadran:** el de las apps promete `prefix` y `src/components/` que no
    existen y manda a `pnpm install` dentro de la app; el workspace no tiene README.
15. **El commit inicial de un workspace se llama `chore: scaffold fudic app`.**
16. **`g app` no instala y no lo dice.**
17. **Lo opcional no se puede añadir:** ni `di`, `forms`, `http` o `i18n`, ni servicios,
    formularios, hojas globales o una librería solo de estilos (como `examples/workspace/libs/guia`).

## 2. Causa raíz

### 2.1. La ayuda es una sola cadena

[args.ts:51-140](../../../packages/cli/src/args.ts#L51-L140) es `USAGE`, un único texto para todo.
`--help` en cualquier posición devuelve ese texto
([args.ts:226](../../../packages/cli/src/args.ts#L226)): no hay ayuda por comando. Cada error lo
imprime entero detrás ([run.ts:80](../../../packages/cli/src/run.ts#L80)).

### 2.2. El prefijo por defecto es la cadena vacía

`--prefix` cae a `''` en `new`, `g app` y `g lib`
([args.ts:323](../../../packages/cli/src/args.ts#L323),
[args.ts:351](../../../packages/cli/src/args.ts#L351),
[args.ts:364](../../../packages/cli/src/args.ts#L364)); `tagOf('', 'button')` deja `button` y
`validateTag` da FUD0440 ([component.ts:46-51](../../../packages/cli/src/plans/component.ts#L46-L51)).
Los READMEs prometen el prefijo igual
([README.md.tmpl:19](../../../packages/cli/templates/README.md.tmpl#L19),
[lib/README.md.tmpl:25](../../../packages/cli/templates/lib/README.md.tmpl#L25)).

### 2.3. Ningún proyecto se genera para probarse

- La app: [package.json.tmpl](../../../packages/cli/templates/package.json.tmpl) no tiene
  `vitest`, `@fudic/testing`, `@fudic/workbench` ni scripts `test` o `spec`.
- La lib: [lib.ts:4-7](../../../packages/cli/src/plans/lib.ts#L4-L7) la define por lo que no
  sirve, y [lib.ts:61-81](../../../packages/cli/src/plans/lib.ts#L61-L81) no le da nada para
  probarse. No le falta un `vite.config.ts`: el banco nunca lee el del proyecto
  ([workbench/vite.ts:6-7](../../../packages/workbench/src/vite.ts#L6-L7)). Le faltan las
  dependencias.

### 2.4. Un componente es un fichero

[component.ts:60](../../../packages/cli/src/plans/component.ts#L60) escribe
`<dir>/<tag>.fud`. El spec solo con `--spec` y sin fixture
([component.ts:74-80](../../../packages/cli/src/plans/component.ts#L74-L80)); el test, nunca. La
plantilla deja `type Props = {}`, `const {} = props<Props>()` y `@client {}` vacíos
([component.ts:4-12](../../../packages/cli/src/plans/component.ts#L4-L12)). El esqueleto del spec
es todo comentario porque no hay términos de serie (SDD-59).

### 2.5. La primera app del workspace nace sin `uses`

[workspace.ts:137](../../../packages/cli/src/plans/workspace.ts#L137) pasa `uses: ''` y `parseNew`
no acepta `--uses` ([args.ts:302](../../../packages/cli/src/args.ts#L302)). Ningún comando añade
una dependencia a un proyecto que ya existe.

### 2.6. Ninguna app tiene base, y la raíz no sirve nada

[vite.config.ts.tmpl](../../../packages/cli/templates/vite.config.ts.tmpl) no escribe `base`, así
que todas las apps son `/`. La base es la de Vite: `fudic.json` rechaza llevar ruta
([config/read.ts:207](../../../packages/config/src/read.ts#L207)). La raíz solo tiene `build`
([workspace/package.json.tmpl](../../../packages/cli/templates/workspace/package.json.tmpl)) y
ningún README ([workspace.ts:109-119](../../../packages/cli/src/plans/workspace.ts#L109-L119)).
Servir varias apps en un origen solo existe a mano, en `examples/workspace/serve.mjs`.

### 2.7. Comentarios de diseño en lo generado

- [language-core/globals.ts:64-72](../../../packages/language-core/src/globals.ts#L64-L72):
  `GLOBALS_DTS` lleva la historia de BUG-11 dentro del fichero del usuario.
- [spec.ts:43-47](../../../packages/cli/src/plans/spec.ts#L43-L47): `fudic-env.d.ts`.
- [layout.fud](../../../packages/cli/templates/layout.fud): doce líneas sobre el marcador
  `fudic:runtime` y el compilador.

### 2.8. Lo demás

- Mensaje del commit: [new.ts:264](../../../packages/cli/src/plans/new.ts#L264), el mismo para app
  y workspace.
- `g app` no instala, por diseño ([app.ts:166-183](../../../packages/cli/src/plans/app.ts#L166-L183)),
  y no lo avisa.
- `globalStyles` solo aparece vacío en [app.ts:209](../../../packages/cli/src/plans/app.ts#L209):
  ningún generador escribe hojas globales.
- No hay comando `add`, ni generadores de servicio o formulario.

**Alcance:** todo `@fudic/cli` salvo `fmt` y `translate`, y el texto de `GLOBALS_DTS`, que
también usa `@fudic/typecheck`.

## 3. Interfaz pública

### 3.1. Comandos

| Comando | Qué hace |
|---|---|
| `new <name>` | app suelta |
| `new <name> --workspace [--app <a>] [--uses <lib>]` | workspace y su primera app |
| `generate component <name>` (`g c`) | carpeta con `.fud`, `.test.ts`, `.fudspec`, `.fixture.ts` |
| `generate page <route>` (`g p`) | página y su `.test.ts` |
| `generate layout <name>` (`g l`) | layout y su `.test.ts` |
| `generate app <name>` (`g a`) | app del workspace, con base |
| `generate lib <name>` | librería de componentes; `--styles-only`, librería de solo estilos |
| `generate service <name>` | servicio de `@fudic/di` y su test |
| `generate form <name>` | formulario de `@fudic/forms` y su test; `--binary`, controles tipados |
| `generate style <name>` | hoja global del proyecto (`globalStyles`) |
| `generate spec <component>` (`g s`) | se mantiene (SDD-53) |
| `generate term <block> <name>` (`g t`) | se mantiene (SDD-53) |
| `add <module>` | `di`, `forms`, `http`, `i18n`, o una librería del workspace |
| `dev` · `preview` | todas las apps del workspace en un puerto, cada una en su base |
| `test` · `spec` | los tests unitarios / los `.fudspec` del proyecto o de todo el workspace |
| `fmt` · `translate` | sin cambios |

`fudic <command> --help` imprime la ayuda **de ese comando**.

### 3.2. Opciones nuevas o cambiadas

| Opción | Dónde | Qué |
|---|---|---|
| `--prefix` | `new`, `g app`, `g lib` | por defecto, el nombre del proyecto (`ui` → `ui-`) |
| `--base <path>` | `g app` | por defecto `/<name>/`; la primera app del workspace es `/` |
| `--uses <lib>` | `new --workspace` | como en `g app` |
| `--skip-test` · `--skip-spec` | `g component` | no generan el test / el spec y la fixture |
| `--skip-test` | `g page`, `g layout`, `g service`, `g form` | no genera el test |
| `--provided` | `g service` | no registra en la raíz: lo provee un componente con `provide()` |
| `--binary` | `g form` | controles tipados (`str`, `u8`, `bool`…): la subida viaja en binario |
| `--styles-only` | `g lib` | librería sin componentes: una hoja global y nada más |
| `--locales <a,b>` | `add i18n` | escribe `"locales"` en `fudic.json` |
| `--spec` | `g component` | se retira: el spec ya viene por defecto |

`--dir` es siempre relativo a la raíz del proyecto destino.

### 3.3. Códigos

FUD0440 deja de sugerir `app-button`: sugiere `<prefijo del proyecto>-<nombre>`. Los códigos nuevos
que haga falta, desde `FUD0452`.

## 4. Comportamiento corregido

### 4.1. La ayuda

- `fudic` y `fudic --help` imprimen §6.1: grupos *Start*, *Add to a project*, *Run*, *Maintain*;
  un bloque *Words* que define app, library, workspace y project; ejemplos; la línea que lleva a
  `fudic <command> --help`.
- Cada comando tiene su ayuda (§6.6 es la de `g component`): qué hace en una frase, sus
  argumentos, sus opciones con lo que hacen para el usuario y dos ejemplos.
- Un error imprime **su** mensaje, una línea que dice cómo seguir y `"fudic <command> --help" for
  more.` Nunca la ayuda entera (§6.8).

### 4.2. Proyectos que se prueban desde el primer minuto

Toda app y toda lib nacen con:

- `devDependencies`: `@fudic/cli`, `@fudic/testing`, `@fudic/workbench`, `@fudic/terms`,
  `@fudic/vite`, `vite`, `vitest`, en versión exacta.
- `vitest.config.ts` con `fudicTest()`.
- `src/fudic-env.d.ts` con la declaración de `*.fud` de `examples/basic/src/env.d.ts` (`$Props`,
  `tag`, `css`, `render`, `$file`) y una sola línea de comentario.
- Scripts `"test": "vitest run"` y `"spec": "fudic-workbench run --pass-with-no-specs"`.

> **Decisión de Pedro (2026-10-17), fuera de los paquetes de arriba.** `fudic-workbench run` sin
> ningún `.fudspec` es FUD0976, a propósito (BUG-48): un CI que pierde sus specs no pasa. Pero un
> proyecto recién creado no tiene ninguno, y §4.2 exige `pnpm spec` en verde. El banco gana
> `--pass-with-no-specs` (sin specs, sale 0) y el script generado lo usa; sin la opción, nada
> cambia. Y `@fudic/testing` da a TypeScript los tipos de los comprobadores de jest-dom
> (`toBeInTheDocument`): el test de §6.5 pasaba en vitest y salía en rojo en el editor.
> Paquetes tocados: `@fudic/workbench` · `@fudic/testing`.

La raíz del workspace lleva `dev`, `preview`, `build`, `test` y `spec`, y un README que explica
`apps/`, `libs/` y esos comandos. **Lo recién generado pasa en verde sin tocar nada:** justo
después de `new`, `g lib`, `g app` o `g component`, `pnpm test` y `pnpm spec` salen en verde.

### 4.3. El componente

`g component button --project ui` crea `src/components/ui-button/` con los cuatro ficheros de
§6.5. El `.fud` no lleva `@code` vacío. La fixture existe siempre (`base: {}` si no hay props
obligatorias). El spec trae un criterio real, `renders`, con los términos de `@fudic/terms`.
El test usa `mount` de `@fudic/testing`.

Con `--dir` va a cualquier carpeta del proyecto, también dentro de `src/routes/` para los
componentes de una ruta: el router no toma un componente por página
([discover.ts:107-108](../../../packages/vite/src/discover.ts#L107-L108)). La salida lo dice.

En una lib, `exports` pasa a `"./*.fud": "./src/components/*/*.fud"`: el componente se importa
como `@scope/ui/ui-button.fud`, sin repetir carpeta.

### 4.4. Páginas y layouts

`g page` y `g layout` escriben su `.test.ts` al lado (`visit` y `renderLayout` de
`@fudic/testing`). `new` crea también `index.test.ts` y `_layout.test.ts`.

### 4.5. Workspace, bases y servidor único

- La primera app del workspace es `/`. `g app admin` escribe `base: '/admin/'` en su
  `vite.config.ts`; `--base` lo cambia. La base es la de Vite, que ya llega al Service Worker y
  a todas las URLs. Dos apps con la misma base son un error de `g app`.
- `fudic dev` y `fudic preview` en la raíz levantan **todas** las apps en **un solo puerto**:
  cada petición va a la app de base más larga que encaje, como en `examples/workspace/serve.mjs`.
  Simula un monolito o una gateway. Si es un proxy delante de un servidor por app o Vite en
  middleware lo decide la implementación; lo exigido es §6.9.
- `pnpm --filter admin dev` sigue arrancando solo esa app, también bajo su base.
- `build` es por app. fudic no hace un `dist` combinado.

### 4.6. Añadir a un proyecto que existe

- `fudic add ui --project web`: dependencia `workspace:*` en `web` e instala.
- `fudic add di|forms|http|i18n --project web`: el paquete en versión exacta e instala.
  `add http` escribe además `src/http.ts` con `chain().use(csrf, errorPages)`. `add i18n --locales es,en`
  escribe `"locales"` en `fudic.json`.
- `g service` y `g form` añaden `@fudic/di` o `@fudic/forms` si faltan, y lo dicen.
- `g app` instala al acabar, como `g lib` y `add`.

### 4.7. Servicios, formularios y estilos

- `g service cart` → `src/services/cart.service.ts`: `export class Cart {}` y `Service(Cart)`
  (llamada, no decorador, como `examples/basic/src/services/cart.ts`). Con `--provided`, sin
  `Service(...)`.
- `g form person` → `src/forms/person.form.ts` con un campo `name` requerido, `control('')`; con
  `--binary`, `str('')`.
- `g style ui --project ui` → `ui.css` y `"globalStyles": { "ui": "ui.css" }`.
- `g lib guia --styles-only` → `tokens.css`, `"globalStyles": { "tokens": "tokens.css" }`,
  `exports` solo del CSS, sin componentes, sin tests ni spec.

### 4.8. Lo generado es del usuario

Ningún fichero generado cita un SDD, un BUG, ni explica el compilador por dentro. Un comentario
dice al usuario qué puede hacer con el fichero, en una línea. Aplica a `GLOBALS_DTS`,
`fudic-env.d.ts`, `layout.fud`, `vite.config.ts` y los READMEs.

### 4.9. Detalles

- Commit inicial: `chore: create app <name>` o `chore: create workspace <name>`.
- El `.gitkeep` de `src/components/` se borra al crear el primer componente.
- Los READMEs de app y lib describen lo que de verdad generan.

## 5. Invariantes

- La CLI no pregunta nunca (SDD-22 §4.1): todo por argumentos y opciones.
- `--dry-run` y `--json` siguen describiendo el plan completo, órdenes de instalación incluidas.
- Lo nuevo de `@fudic/cli` nace al **100 %** en las cuatro métricas; el paquete no baja de su suelo.

## 6. Criterios de aceptación

**La regla de cierre:** el BUG está arreglado cuando un desarrollador ve exactamente esto. Cada
bloque es un test de salida (texto exacto salvo versiones, tiempos y puertos) y, donde hay
ficheros, un test de contenido.

### 6.1. `fudic` · `fudic --help`

```
fudic 0.0.1 — web apps from .fud components on Declarative Shadow DOM

Usage: fudic <command> [options]

Start
  new <name>                    create an app
  new <name> --workspace        create a workspace: several apps and libraries in one repo

Add to a project
  generate component <name>     a component in its own folder, with its unit test, spec and fixture
  generate page <route>         a page and its unit test
  generate layout <name>        a layout and its unit test
  generate app <name>           another app in the workspace
  generate lib <name>           a component library in the workspace
  generate service <name>       a service you can inject
  generate form <name>          a form and its unit test
  generate style <name>         a global stylesheet of the project
  generate term <kind> <name>   a step you can use in .fudspec criteria
  add <module>                  an optional module (di, forms, http, i18n) or a library of the workspace

Run
  dev                           serve every app on one port, each under its base URL
  preview                       the same, with each app's build
  test                          run the unit tests
  spec                          run the .fudspec criteria in a browser

Maintain
  fmt [path…]                   format .fud and .fudspec files
  translate                     extract the texts to translate into src/locales/

Words
  app         what you serve: it has pages and a base URL ("/", "/admin/")
  library     components your apps use; it is not served
  workspace   one repo with apps/ and libs/
  project     an app or a library; --project <name> picks one inside a workspace

Examples
  fudic new shop
  fudic new shop --workspace --app web
  fudic g lib ui
  fudic g component button --project ui

"fudic <command> --help" shows its options. g = generate.
```

### 6.2. Crear el workspace

```
$ fudic new shop --workspace --app web

Created workspace shop

  shop/
    README.md          what apps/ and libs/ are, and the commands below
    apps/web/          app web, served at /
    libs/              empty — fudic g lib <name>

  Installed dependencies (pnpm)
  Committed: "chore: create workspace shop"

Next
  cd shop
  pnpm dev           http://localhost:5173/
  pnpm test          unit tests of every project
  pnpm spec          .fudspec criteria of every project
```

Y a continuación `pnpm test` y `pnpm spec` en `shop/` salen en verde.

### 6.3. Crear la lib

```
$ fudic g lib ui

Created library ui in libs/ui

  tag prefix   ui-      fudic g component button --project ui  →  <ui-button>
  test         pnpm --filter ui test
  spec         pnpm --filter ui spec

  Installed dependencies (pnpm)

Use it from an app
  fudic add ui --project web          an app you already have
  fudic g app admin --uses ui         a new app
```

### 6.4. Crear la segunda app

```
$ fudic g app admin --uses ui

Created app admin in apps/admin

  base URL   /admin/     web is at /. Change it with --base
  uses       ui

  Installed dependencies (pnpm)

Next
  pnpm dev                    every app:  http://localhost:5173/  ·  /admin/
  pnpm --filter admin dev     only admin: http://localhost:5174/admin/
```

### 6.5. Un componente en la lib

```
$ fudic g component button --project ui

Created <ui-button> in libs/ui/src/components/ui-button/

  ui-button.fud           the component
  ui-button.test.ts       unit test               pnpm --filter ui test
  ui-button.fudspec       acceptance criteria     pnpm --filter ui spec
  ui-button.fixture.ts    the props the criteria mount it with

Use it in an app
  <link rel="component" href="@shop/ui/ui-button.fud">
```

```html
<!-- ui-button.fud -->
<head>
  <style></style>
</head>

<ui-button>
  <template shadowrootmode="open">
  </template>
</ui-button>
```
```
# ui-button.fudspec
component ui-button

criterion renders
  given
    props base
  then
    present ui-button
```
```ts
// ui-button.fixture.ts
import type { Fixtures } from '@fudic/terms';
import type { $Props } from './ui-button.fud';

export default {
  base: {},
} satisfies Fixtures<$Props>;
```
```ts
// ui-button.test.ts
import { expect, test } from 'vitest';
import { mount } from '@fudic/testing';
import * as UiButton from './ui-button.fud';

test('renders', async () => {
  const t = await mount(UiButton);
  expect(t.host).toBeInTheDocument();
});
```

Y a continuación `pnpm --filter ui test` y `pnpm --filter ui spec` salen en verde.

> **Decisión de Pedro (2026-10-17): `present`, no `visible`.** El criterio generado decía
> `visible ui-button`, y un componente vacío mide 0×0: para el navegador no se ve, y `pnpm spec`
> fallaba siempre. Darle contenido (un `<slot>`) haría creer al desarrollador que fudic lo necesita.
> `@fudic/terms` gana el término de serie `then present <target>` —está en la página, ocupe o no
> sitio— y el criterio generado es `present ui-button`. La lib lleva además `@fudic/ssr` en
> `devDependencies`: sin él, `mount` no encuentra el renderizador.

### 6.6. `fudic g component --help`

```
fudic generate component <name>                         alias: fudic g c

Creates a folder under src/components with the component, its unit test, its
.fudspec criteria and their fixture.

<name>   "button" becomes <ui-button> with the project's prefix (ui-).
         A name with a hyphen, like "shop-button", is used as it is.

Options
  --project <name>   the app or library to add it to   (default: the one you are in)
  --dir <path>       another folder of the project, e.g. src/routes/blog/components
  --skip-test        no unit test
  --skip-spec        no .fudspec and no fixture
  --slot             put a <slot> in the markup
  --no-style         no <style>
  --in <file>        also link it from that page or layout; repeatable
  --dry-run          show what it would create; writes nothing
  --force            overwrite files that already exist

Examples
  fudic g component button --project ui
  fudic g c card --in src/routes/index.fud
```

### 6.7. Un componente de una ruta

```
$ fudic g component post-meta --project web --dir src/routes/blog/components

Created <web-post-meta> in apps/web/src/routes/blog/components/web-post-meta/
  web-post-meta.fud · .test.ts · .fudspec · .fixture.ts
  A component under src/routes is not a route: only pages are.
```

### 6.8. Un error

```
$ fudic g test button

error  fudic does not generate "test" on its own
       a component comes with its unit test:   fudic g component button
       it generates: component, page, layout, app, lib, service, form, style, term

"fudic generate --help" for more.
```

### 6.9. Ejecutar

```
$ pnpm dev
fudic dev — 2 apps on one port

  web     http://localhost:5173/
  admin   http://localhost:5173/admin/
```

`http://localhost:5173/admin/` sirve `admin` y `http://localhost:5173/` sirve `web`. Lo mismo con
`pnpm preview` sobre los `dist`.

```
$ pnpm --filter ui spec
ui-button
  ✓ renders      212 ms
1 criterion · 1 pass · 0 fail · 1.1 s · chrome
```
```
$ pnpm --filter ui test
 ✓ src/components/ui-button/ui-button.test.ts (1 test)
 Test Files  1 passed (1)
```

### 6.10. Añadir

```
$ fudic add forms --project admin

Added @fudic/forms 0.0.1 to admin
  Installed dependencies (pnpm)
```
```
$ fudic add ui --project web

web now uses ui
  Installed dependencies (pnpm)
  <link rel="component" href="@shop/ui/ui-button.fud">
```
`fudic add http --project web` crea además `apps/web/src/http.ts`.

### 6.11. Servicio

```
$ fudic g service cart --project web

Created service Cart in apps/web/src/services/
  cart.service.ts         class Cart, registered in the root: inject(Cart) anywhere
  cart.service.test.ts    unit test

  Added @fudic/di 0.0.1 to web (it was not there)
```

### 6.12. Formulario

```
$ fudic g form person --project web --binary

Created form personForm in apps/web/src/forms/
  person.form.ts         typed controls (str, u8, bool…): the upload travels in binary
  person.form.test.ts    unit test

  Added @fudic/forms 0.0.1 to web (it was not there)
```
```ts
// person.form.ts
import { form, required, str } from '@fudic/forms';

export const personForm = form({
  name: str('', [required], { messages: { required: () => 'Name is required.' } }),
});
```

### 6.13. Estilos

```
$ fudic g lib guia --styles-only

Created style library guia in libs/guia

  tokens.css     global stylesheet, adopted by every component of whoever uses guia
  no components, no tests, no spec

Use it
  fudic add guia --project ui      a library: its components read the tokens
  fudic add guia --project web     an app
```
```
$ fudic g style ui --project ui

Created ui.css in libs/ui
  adopted by every component of ui, after the sheets of the libraries it uses
```

### 6.14. Ficheros sin comentarios de diseño

Un test recorre todo lo que generan §6.2–§6.13 y falla si algún fichero contiene `SDD-`, `BUG-`,
`emitter` o un comentario de más de una línea. `fudic-globals.d.ts` incluido.

## 7. Fuera de alcance

- `@fudic/terms` y su vocabulario: [SDD-59](../SDD-59-terminos-de-serie.md).
- El enlace de documentación de los diagnósticos: sale de `fudic.docs` en
  [diagnostics/package.json:23](../../../packages/diagnostics/package.json#L23) y es decisión de Pedro.
- Un `dist` combinado del workspace o cualquier forma de desplegar.
- Lo que genera `.fudic/edge/` en el build.
- `fmt` y `translate`.
- `minimumReleaseAgeExclude` en `pnpm-workspace.yaml`: lo escribe pnpm al instalar paquetes recién
  publicados, no la CLI.
