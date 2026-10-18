# BUG-51 · Forms y http invasivos, una página de error mágica y una CLI lenta y muda

> **Estado:** `Hecho` (2026-10-19) — [tareas](./BUG-51-Task.md), 30 / 30, con la prueba de Pedro.
> **Corrige:** [SDD-56](../SDD-56-funciones-de-servidor.md) (`errorPages`, `_error.fud`, `form:=`),
> [SDD-34](../SDD-34-forms-compilador.md) y BUG-42 (el resumen y sus enlaces), [SDD-35](../SDD-35-compilo-o-no-compilo.md)
> (el typecheck de `dev`), [BUG-50](./BUG-50-la-cli-que-nadie-entiende.md) (`dev`, `preview`,
> `test`, `spec`) y [SDD-57](../SDD-57-tests-unitarios.md) (`@fudic/testing`).
> **Paquetes:** `@fudic/http` · `@fudic/forms` · `@fudic/compiler` · `@fudic/vite` · `@fudic/language-core` · `@fudic/language-server` · `@fudic/diagnostics` · `@fudic/testing` · `@fudic/cli` · `examples/basic`
> **Rama:** `bug-51-forms-http-cli` (worktree `.claude/worktrees/bug-51`), desde `main` en `d6c0ce0`;
> los tests, en `bug-51-forms-http-cli-tests` (worktree `.claude/worktrees/bug-51-tests`).

---

## 1. Contexto y síntoma

Pedro revisó `examples/basic` (`user-form.fud`, `_error.fud`, `error-pages.ts`) y después usó la
CLI publicada en un workspace propio (`shop`), contra Verdaccio.

**Forms y http:**

1. `form:` no aparecía en el autocompletado y todo lo enseñaba con comillas (`form:="@save"`),
   cuando ninguna otra vinculación las lleva. `@fudic:result` tampoco se autocompletaba.
2. El `summary` escribía su propia lista (`<ul><li><a>`) por `innerHTML`: el autor no podía darle
   la forma ni el estilo que quisiera.
3. `_error.fud` pintaba un `data` con `status`, `title` y `detail` que nadie declaraba: no se
   sabía de dónde salía. Y el `detail` se perdía: tras una llamada fallida, `errorPages` solo
   mandaba el status en la URL, y el «sin token» de `unauthorized('sin token')` no se veía nunca.
4. Cualquier 422 lo consumía el formulario, y solo el 422: un 400 o un 409 iban a la página de
   error, sin poder elegirlo.
5. No se podía decir que un 401 o un 403 llevaran a otra página (el login, por ejemplo).

**Editor:** el `href` de `<link rel="component|layout|snippet">` ofrecía rutas y ficheros
`.test.ts`, solos cuando no había ningún fichero de ese tipo.

**CLI y rendimiento:**

6. `fudic dev` pasaba unos 6 s en silencio antes del banner, y la primera página esperaba al
   typecheck completo. La salida era pobre.
7. `fudic test` tardaba 6,9 s en dos proyectos con dos tests cada uno, con el ruido de pnpm y 19
   avisos «Sourcemap … points to missing source files». A escala, 300 tests tardaban 29 s.
8. Editar una ruta sin `@client` no recargaba el navegador: el terminal decía
   «(ssr) page reload» y la página seguía igual hasta pulsar F5.
9. `--port` parecía no existir.

## 2. Causa

- **(3)** `language-core` declaraba el `data` de `_error.fud` como un literal anónimo, y el
  servidor rehacía el problema solo con el status (`problemOfStatus`).
- **(4, 5)** `bindForm` reconocía el 422 por su forma y `errorPages` era un valor sin opciones
  que dejaba pasar solo `ValidationError`.
- **(2)** El resumen solo podía pintarse con `summary=`, y el mapa ruta → id de los campos solo
  existía para él.
- **Editor:** el decorador `silenceOwnedPositions` no silenciaba al servicio HTML en el `href` de
  los `<link>` de fudic.
- **(6)** El primer check del typecheck era CPU síncrona en el hilo de Vite y bloqueaba su
  `listen`. Después, `blocking()` hacía que la primera página esperara su veredicto. La CLI
  descartaba todo lo que Vite escribía por stdout.
- **(7)** vitest daba a cada fichero de test un worker nuevo, que volvía a cargar el compilador,
  el addon de oxc y el plugin: unos 1 s por fichero. Además había un pnpm y un vitest por
  proyecto, y `@fudic/diagnostics` (unos 320 módulos) y `@fudic/compiler` (unos 160) costaban
  135 ms y 300 ms de arranque en cada proceso. La CLI importaba todos sus planes, compilador
  incluido, aunque solo fuera a imprimir la ayuda. Los `.map` de `@fudic/testing` apuntaban a un
  `src/` que no se publica.
- **(8)** Ese módulo solo está en el grafo del entorno SSR. Vite avisaba a ese entorno, nunca al
  navegador, y el plugin no gestionaba el HMR.
- **(9)** `--port` existía desde BUG-50, pero ningún ejemplo de la ayuda lo enseñaba.

## 3. Decisiones de Pedro

- `errorPages` se configura **en el propio middleware**: `errorPages({ 401: '/login' })`.
- Qué statuses se queda un formulario se declara **en las options de `form(...)`**: por defecto
  400, 409 y 422, y el usuario quita o añade.
- El resumen tiene que poder **pintarlo un componente o un snippet del usuario**, con sus datos y
  los enlaces a cada campo.
- **La página nunca espera al typecheck** en `dev`. El error llega con el overlay en cuanto se
  conoce, y desde entonces bloquea las páginas a las que afecta.
- Lo que importa es la **sensación de velocidad** en todo: una herramienta más lenta que Vite que
  no aporta nada no se va a usar.

## 4. Arreglo

### 4.1 Errores y `errorPages` (`@fudic/http`, `@fudic/vite`, `@fudic/language-core`)

- `errorPages(routes?)` es una fábrica. Cada entrada de `routes` lleva un status a una URL o a una
  función del error: `{ 403: '/entrar' }`, `{ 401: (e) => … }`. La plantilla de la CLI escribe
  `errorPages()`.
- Vuelve a lanzar, sin navegar, un abort, un 422 y cualquier status que el form enviado se queda
  (`ctx.args.$catches(status)`). Un redirect navega. Lo demás va a `_error.fud`.
- El `detail` del servidor viaja en `?detail=` hasta `/_fudic/error/:status`, recortado a 300
  caracteres. `problemOfUrl` lo lee en dev y en preview.
- El `data` de `_error.fud` es `ErrorPage` de `@fudic/http`, y el editor lo declara con su
  documentación, que explica de dónde sale.

### 4.2 Lo que se queda un formulario (`@fudic/forms`)

- `form(schema, { catches })` y `$catches(status)`. Si no se dice nada, `DEFAULT_CATCHES` es
  `[400, 409, 422]`, en un módulo propio para que se pueda podar.
- Un status atrapado pinta los `errors` y el `summary` que traiga. Si no trae ninguno, pinta su
  texto como error del form con la regla `server`, cuyo texto de serie es `detail ?? title` y que
  `messages: { server }` puede cambiar.

### 4.3 El resumen del autor (`@fudic/forms`, `@fudic/compiler`)

- `$issues()` lleva el `href` (`#id`) de cada campo que tiene id.
- El compilador pasa a `bindForm`, como sexto argumento, el mapa ruta → id de los ids que el
  markup ya lleva, sin añadir ninguno.
- Un clic dentro del `<form>` en un enlace `#id` de ese mapa mueve el foco al campo, también desde
  el shadow root de un componente hijo (se busca con `composedPath`).
- `examples/basic` pinta su resumen con `form-errores.fud`.

### 4.4 Editor (`@fudic/language-server`, `@fudic/language-core`, `@fudic/diagnostics`)

- El `href` de un `<link rel>` de fudic solo tiene la lista del servidor.
- Se ofrece `form:` en un `<form>` con `control=` que aún no envía a ningún sitio.
- `fudic:result` y `fudic:error` están entre los eventos que se autocompletan y se tipan, y el
  nombre de evento parcial admite `:`.
- `form:=@save` va sin comillas en FUD1005, FUD1006, el README de http y el ejemplo.

### 4.5 `dev` (`@fudic/vite`, `@fudic/cli`)

- El typecheck corre en un proceso hijo que vive lo que el servidor y conserva su language service
  (`live-checker.ts`, `worker/live-check.mjs`). Es un proceso y no un thread porque oxc en un
  `worker_thread` tumbó Node. Si el hijo muere, se cae al checker en proceso.
- `blocking()` usa el último veredicto: la página nunca espera a un check en curso.
- El hook `hotUpdate` recarga el navegador cuando el entorno SSR tiene el módulo que ha cambiado.
- `fudic dev` y `fudic preview` dicen qué arrancan y cuánto tarda cada app, dan las URLs, el
  tiempo total y cómo cambiar el puerto. Las líneas útiles de cada Vite salen con el nombre de la
  app delante, sin su banner. Se respeta `NO_COLOR`.

### 4.6 `test`, `spec` y rendimiento (`@fudic/testing`, `@fudic/cli`, `@fudic/diagnostics`, `@fudic/compiler`)

- `fudicTest()` usa por defecto `pool: 'forks'` e `isolate: false`, y el setup descarta los
  módulos de la app al terminar cada fichero (`vi.resetModules()` en `afterAll`). Así no pasa
  estado de un fichero al siguiente, y lo pesado se carga una vez por worker. Si el proyecto elige
  su propio `pool` o `isolate`, se respeta.
- `fudic test` lanza un único vitest con todos los proyectos que conservan el `vitest run` de la
  CLI (`runner/vitest-projects.mjs`). Si alguno tiene un script propio, cada proyecto corre el
  suyo con `pnpm --silent`, bajo una cabecera, sin parar al primer fallo y con un resumen final.
  `--dry-run` y `--json` se comportan como en cualquier otro plan.
- `@fudic/diagnostics` y `@fudic/compiler` se publican empaquetados en un solo módulo con
  rolldown; `tsc` sigue generando los tipos.
- La CLI importa el plan de cada comando solo cuando se ejecuta, y `args.ts` lee sus constantes
  de `dirs.ts`.
- Los `.map` de `@fudic/testing` llevan sus fuentes dentro (`inlineSources`).

### 4.7 Medido en el `shop` de Pedro, con la máquina libre

| | antes | después |
|---|---|---|
| `fudic dev`, hasta la primera página | ~6 s | ~2 s |
| `fudic test`, 2 proyectos y 4 tests | 6,9 s | ~3,8 s |
| 300 tests en un proyecto | 29 s | 5 s |
| `fudic --help` | 650 ms | 175 ms |
| importar `@fudic/diagnostics` / `@fudic/compiler` | 135 / 300 ms | 10 / 45 ms |

## 5. Bugs que destapó la sesión de tests

- `DEFAULT_CATCHES` compartía módulo con `form` y rompía la regla de un nombre por módulo.
- Un 422 con `summary` pero sin `errors` perdía su summary.
- Un enlace sin `#` (`/nom`) también movía el foco.
- En preview, `problemOfUrl` leía `req.url` con una rama que nunca se podía dar.
- `fudic test --dry-run` ejecutaba los tests, y `--json` dejó de escribir sus errores en JSON.
- `dev` forzaba el color aunque el usuario tuviera `NO_COLOR`.

## 6. Criterios de aceptación

1. En el `href` de un `<link rel="component|layout|snippet">` solo salen `.fud` de ese tipo.
2. `form:` se autocompleta en `<form control=@f>`, y `@fudic:result` y `@fudic:error` se
   autocompletan y tipan.
3. Al pasar el ratón por el `data` de `_error.fud` sale `ErrorPage`, con su explicación.
4. Una llamada sin token pinta «401 · Unauthorized» y «sin token». Un token falso lleva a `/entrar`.
5. Un 409 del servidor se pinta en el resumen del form. Si se quita de `catches`, va a la página de
   error.
6. El resumen de `user-form` lo pinta `form-errores.fud`, y sus enlaces llevan el foco al campo.
7. Editar una ruta sin `@client` recarga el navegador.
8. La primera página de `dev` no espera al typecheck. Un error de tipos se ve con el overlay y,
   al quitarlo, la página vuelve sola.
9. `fudic dev`, `preview`, `test` y `spec` dicen qué hacen y cuánto tardan, sin el ruido de pnpm
   ni los avisos de sourcemap.
10. 300 tests en unos 5 s, sin que pase estado de un fichero de test a otro.
11. `pnpm typecheck`, `pnpm test` y `pnpm build` en verde. Lo nuevo al 100 % y los paquetes con
    suelo (`compiler`, `vite`, `cli`) no por debajo de él.
