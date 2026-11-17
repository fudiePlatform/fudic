# SDD-86 — Tareas

> **SDD:** [SDD-86 — El ciclo de vida de un componente, y las props reflejadas en el host](./SDD-86-ciclo-de-vida-y-props-reflejadas.md)
> **Paquetes:** `@fudic/diagnostics` · `@fudic/compiler` · `@fudic/core` · `@fudic/forms` ·
> `@fudic/language-core` · `@fudic/language-server` · `@fudic/vscode` · `@fudic/mcp` · `examples/basic`
> **Rama:** `sdd-86-ciclo-de-vida`, desde `main`, con SDD-85 ya en `main`.
> **Progreso:** 18 / 28 — `Listo`. (Implementación 22 / 28 · Tests 18 / 28)

**Dos casillas por tarea.** `impl` la marca la sesión que implementa; `tests` la marca la sesión de
tests cuando los tests de la tarea están escritos y en verde. Cada sesión solo toca su casilla. Una
tarea cuenta en el progreso cuando tiene las dos.

**El orden manda en tres puntos.**

- **El runtime antes que el emit.** El emit llama a `hooks()` y a `on` / `off` del controlador.
- **Los diagnósticos antes que el emit.** El emit da por hecho que cada llamada a un hook es una
  sentencia de nivel superior de un `@code`, y que `beforeCreate` / `afterCreate` solo están en un
  componente. Eso solo lo garantiza el análisis.
- **El golden sin hooks se fija antes de tocar el emit** (tarea 10). Es lo que prueba que un
  componente o una ruta que no usan hooks salen igual, byte a byte.

---

## Fase 1 — Los diagnósticos y el análisis

- impl [x] · tests [x] — **1. `FUD1560`, `FUD1561` y `FUD1562`.**
  - Un fichero por código, con su `.md` en inglés y su línea en `index.ts` (SDD §3.3).
  - *Depende de:* —.
  - *Paquete:* `diagnostics`.
  - *Ficheros:* `src/codes/FUD1560.ts` · `.md`, `src/codes/FUD1561.ts` · `.md`,
    `src/codes/FUD1562.ts` · `.md`, `src/index.ts`.
- impl [x] · tests [x] — **2. Los hooks en `ExtractedCode`.**
  - Una lista de los hooks que usa el `@code` (`hooks: readonly HookUse[]`, con el tipo de hook, el
    span de la llamada y si es sentencia de nivel superior), leída del AST de Oxc como `props`. Para
    componentes, rutas, páginas y layouts.
  - *Depende de:* —.
  - *Paquete:* `compiler`.
  - *Ficheros:* `src/emit/oxc-code.ts`, `test/emit/oxc-code-hooks.test.ts`.
- impl [x] · tests [x] — **3. El analizador `lifecycle`.**
  - `FUD1560` fuera del nivel superior; `FUD1561` con `beforeCreate` / `afterCreate` en una ruta, una
    página o un layout; `FUD1562` en una declaración o un import con el nombre de un hook (SDD §3.2).
    El span, en la llamada o en la declaración.
  - Registrado en `analyze.ts`. Al 100 % (criterios 18, 19, 20).
  - *Depende de:* 1, 2.
  - *Paquete:* `compiler`.
  - *Ficheros:* `src/semantic/analyzers/lifecycle.ts`, `src/semantic/analyze.ts`,
    `test/semantic/lifecycle.test.ts`.

## Fase 2 — El runtime

- impl [x] · tests [x] — **4. `hooks()`.**
  - `add`, `run`, `on`, `off` y `dispose` (SDD §3.5). Orden de registro; `on` / `off` idempotentes;
    la limpieza de `onConnect` antes de `onDisconnect`; en `dispose`, primero `onDispose` y después
    las limpiezas de `afterHydrate` / `afterCreate`; cada función en su `try` con `reportError`
    (SDD §4.1, §4.2, §4.4).
  - Exportado desde `index.ts`. Al 100 %.
  - *Depende de:* —.
  - *Paquete:* `core`.
  - *Ficheros:* `src/lifecycle.ts`, `src/index.ts`, `test/lifecycle.test.ts`.
- impl [x] · tests [x] — **5. `on` y `off` en el controlador.**
  - Dos métodos opcionales en `Controller` (SDD §3.4).
  - *Depende de:* —.
  - *Paquete:* `core`.
  - *Ficheros:* `src/controller.ts`.
- impl [x] · tests [x] — **6. `FudicElement` conecta.**
  - `connectedCallback` reenvía a `on`; `h()` y `c()` llaman a `on` al final si el host está
    conectado; `disconnectedCallback` llama a `off` antes de la microtarea (SDD §4.6). El comentario de
    cabecera se reescribe.
  - Tests: los dos órdenes (conectado antes y después del controlador) sin doble `on`; un movimiento
    da `off` + `on` y ningún `r`.
  - *Depende de:* 5.
  - *Paquete:* `core`.
  - *Ficheros:* `src/element.ts`, `test/element.test.ts`.
- impl [x] · tests [x] — **7. `FudicControlElement` llama a `super`.**
  - `override connectedCallback()`: primero `super.connectedCallback()`, después el relay (SDD §4.6).
  - Test: un control con `on` / `off` los recibe, y el relay sigue copiando los atributos (criterio
    12).
  - *Depende de:* 6.
  - *Paquete:* `forms`.
  - *Ficheros:* `src/element.ts`, `test/dom/element.test.ts`.
- impl [x] · tests [x] — **8. La ruta escucha `pagehide` y `pageshow`.**
  - Tras `h()` del controlador de la ruta, `on()`. Si el controlador tiene `on` / `off` o usa
    `onDispose`: `pagehide` → `off()`, y `r()` con `persisted === false`; `pageshow` con
    `persisted === true` → `on()`. Nunca `unload` ni `beforeunload` (SDD §4.1, criterio 29).
  - Tests: la ruta sin hooks de salida no registra nada; `pagehide` persistido y no persistido;
    `pageshow` persistido.
  - *Depende de:* 4, 5.
  - *Paquete:* `core`.
  - *Ficheros:* `src/hydrate/install.ts`, `test/hydrate/route-lifecycle.test.ts`.

## Fase 3 — El emit

- impl [x] · tests [x] — **9. Fixtures `app-lifecycle.fud` y `ruta-ciclo.fud`.**
  - Un componente con los siete hooks, un `ref`, `role="group"` y `variant="@variant"` en su tag de
    identidad, y un `@foreach` con clave de hijos que también usan hooks.
  - Una ruta con layout, los dos con hooks (los cinco permitidos).
  - *Depende de:* —.
  - *Paquete:* `compiler`.
  - *Ficheros:* `fixtures/app-lifecycle.fud`, `fixtures/ruta-ciclo.fud`, `fixtures/_ciclo-layout.fud`.
- impl [x] · tests [x] — **10. Golden sin hooks, fijado.**
  - Antes de tocar el emit, un test que compara la salida de cliente y de servidor de todos los fixtures
    sin hooks, componentes y rutas, con sus goldens. Tiene que seguir en verde al acabar la fase
    (criterio 15).
  - *Depende de:* —.
  - *Paquete:* `compiler`.
  - *Ficheros:* `test/emit/lifecycle-untouched.test.ts`.
- impl [x] · tests [x] — **11. El componente registra y ejecuta.**
  - `const $hk = $hooks();` dentro del `$owned`, antes del código del autor; cada llamada reescrita a
    `$hk.add("…", fn)` con el mapa de fuentes en la llamada; `run` de `before*` / `after*` en `h` y en
    `c`, el `after*` después de `$s()`; `$hk.dispose(host)` como primera línea de `r`; el host guardado
    al principio de la factoría (SDD §4.5).
  - Golden de `app-lifecycle`.
  - *Depende de:* 2, 4, 9.
  - *Paquete:* `compiler`.
  - *Ficheros:* `src/emit/client.ts`, `src/emit/markup-client.ts`,
    `test/emit/__golden__/app-lifecycle.client.mjs`, `test/emit/lifecycle.test.ts`.
- impl [x] · tests [x] — **12. La ruta registra y ejecuta.**
  - Lo mismo en el chunk de la ruta, sin `c` y con `$root` como host; los hooks del layout y después
    los de la ruta, en el mismo `$hk` (SDD §4.5).
  - Golden de `ruta-ciclo`.
  - *Depende de:* 11.
  - *Paquete:* `compiler`.
  - *Ficheros:* `src/emit/route-client.ts`, `test/emit/__golden__/ruta-ciclo.client.mjs`,
    `test/emit/route-lifecycle.test.ts`.
- impl [x] · tests [x] — **13. `on` y `off`, solo si hacen falta.**
  - Emitidos solo con `onConnect` u `onDisconnect`, en componentes y en rutas (criterio 17).
  - *Depende de:* 11, 12.
  - *Paquete:* `compiler`.
  - *Ficheros:* `src/emit/client.ts`, `test/emit/lifecycle.test.ts`.
- impl [x] · tests [x] — **14. El servidor y el SW no ven los hooks.**
  - Las sentencias de hook se quitan, enteras, de la salida de servidor y de SW (criterio 16).
  - Goldens de servidor de `app-lifecycle` y `ruta-ciclo`, iguales que los de los mismos ficheros sin
    hooks.
  - *Depende de:* 2, 9.
  - *Paquete:* `compiler`.
  - *Ficheros:* `src/emit/module.ts`, `src/emit/markup.ts`, `src/emit/layout.ts`,
    `test/emit/__golden__/app-lifecycle.server.mjs`, `test/emit/__golden__/ruta-ciclo.server.mjs`,
    `test/emit/lifecycle.test.ts`.
- impl [x] · tests [ ] — **15. Un hook hidrata.**
  - Test de nivel: un `@code` con solo `afterHydrate(() => {})` hace hidratable el componente y da
    chunk de cliente a la ruta (criterios 14 y 30). Sin cambios en `level.ts`.
  - *Depende de:* 2.
  - *Paquete:* `compiler`.
  - *Ficheros:* `test/emit/level.test.ts`.
- impl [x] · tests [ ] — **16. Los hooks de punta a punta.**
  - Con el harness de hidratación del compilador: el orden al hidratar y al crear, los `ref` en
    `beforeHydrate` / `afterHydrate` / `onDispose`, el movimiento sin `onDispose`, tres
    `afterHydrate` en orden, el que lanza, el host en `fn`, el hijo antes que el padre (criterios
    2–10); el orden de una ruta con layout y su `host` (criterio 26).
  - *Depende de:* 6, 8, 11, 12, 13.
  - *Paquete:* `compiler`.
  - *Ficheros:* `test/emit/hydrate/lifecycle.test.ts`.

## Fase 4 — El editor

- impl [x] · tests [x] — **17. Las firmas.**
  - Los siete hooks declarados en `globals.ts`, junto a `props` (SDD §3.1, §4.7). Tests de tipos del
    criterio 21.
  - *Depende de:* —.
  - *Paquete:* `language-core`.
  - *Ficheros:* `src/globals.ts`, `test/lifecycle-types.test.ts`.
- impl [x] · tests [x] — **18. Los snippets.**
  - Siete entradas con ámbito `code-block`: los de crear con rol `component`; los otros cinco con
    `component`, `route`, `page` y `layout` (SDD §4.7). Tests del criterio 22.
  - *Depende de:* —.
  - *Paquete:* `language-server`.
  - *Ficheros:* `src/services/snippets.ts`, `test/services/snippets.test.ts`.
- impl [x] · tests [x] — **19. El README de la extensión.**
  - La tabla de los snippets del ciclo de vida, junto a la de los `<link>`.
  - *Depende de:* 18.
  - *Paquete:* `vscode`.
  - *Ficheros:* `README.md`.

## Fase 5 — Las props reflejadas

- impl [x] · tests [ ] — **20. El host en el servidor, al hidratar y al actualizar.**
  - Criterio 23: el servidor escribe; `h` no reescribe; `u` cambia, vacía con `true` y quita con
    `false`, `null` y `undefined`; `0` es `"0"`.
  - *Depende de:* 9.
  - *Paquete:* `compiler`.
  - *Ficheros:* `test/emit/hydrate/host-reflect.test.ts`.
- impl [x] · tests [ ] — **21. El host al crear.**
  - Criterio 24: creado desde un `@foreach`, el host lleva `role="group"` y `variant` como en el
    servidor. Si falta alguno, se arregla en el emit de `emitHost`.
  - *Depende de:* 9.
  - *Paquete:* `compiler`.
  - *Ficheros:* `test/emit/hydrate/host-reflect.test.ts`, y `src/emit/markup-client.ts` si hace falta.
- impl [x] · tests [x] — **22. El tipo en el editor.**
  - Criterio 25: un objeto en un atributo con expresión del tag de identidad es error de tipos.
  - *Depende de:* —.
  - *Paquete:* `language-core`.
  - *Ficheros:* `test/host-reflect-types.test.ts`.

## Fase 6 — Guía, ejemplo y cierre

- impl [ ] · tests [ ] — **23. La guía del MCP: `overview`, `components` y `testing`.**
  - `overview`: los hooks también hacen hidratar a un componente, y una ruta con hooks lleva JavaScript.
  - `components`: la línea en «State and what `@code` may do», las secciones «Lifecycle» y «Reflecting
    a prop on the host» (con la nota de los atributos nativos), y las seis filas nuevas de «Instead
    of…» (SDD §4.10).
  - `testing`: lo que ejecutan `mount` y `unmount`.
  - Los bloques `broken` de `FUD1560` y `FUD1562`. En inglés y en español. `guide-examples.test.ts` en
    verde (criterio 31).
  - *Depende de:* 3, 11, 20.
  - *Paquete:* `mcp`.
  - *Ficheros:* `guide/overview.md`, `guide/components.md`, `guide/testing.md`, y los tres en
    `guide/es/`.
- impl [ ] · tests [ ] — **24. La guía del MCP: `pages`.**
  - La sección «Lifecycle of a route»: la tabla de §4.1, la bfcache, el límite de lo asíncrono en
    `pagehide` y el ejemplo del store en IndexedDB (SDD §4.9, §4.10). El bloque `broken` de `FUD1561`.
    En inglés y en español. `guide-examples.test.ts` en verde (criterio 31).
  - *Depende de:* 3, 8, 12.
  - *Paquete:* `mcp`.
  - *Ficheros:* `guide/pages.md`, `guide/es/pages.md`.
- impl [ ] · tests [ ] — **25. El ejemplo `/ciclo`.**
  - `ciclo-demo` y la ruta `/ciclo` con su contador en IndexedDB (SDD §4.9), con su e2e del criterio 1,
    y el test de `mount` del criterio 13.
  - *Depende de:* 11, 12, 13, 21.
  - *Paquete:* `examples/basic`.
  - *Ficheros:* `src/components/ciclo-demo.fud`, `src/components/ciclo-demo.test.ts`,
    `src/stores/contador.ts`, `src/routes/ciclo.fud`, `tests/ciclo.spec.ts`.
- impl [ ] · tests [ ] — **26. La bfcache, de verdad.**
  - En el e2e: ir de `/ciclo` a otra página y volver atrás restaura desde la bfcache, con
    `onDisconnect` / `onConnect`, sin `onDispose` y con el estado intacto; navegar sin volver ejecuta
    `onDispose` (criterios 27, 28).
  - *Depende de:* 25.
  - *Paquete:* `examples/basic`.
  - *Ficheros:* `tests/ciclo.spec.ts`.
- impl [ ] · tests [ ] — **27. Un componente que se hidrata por interacción.**
  - Criterio 11, en el e2e: ningún hook antes de la interacción.
  - *Depende de:* 25.
  - *Paquete:* `examples/basic`.
  - *Ficheros:* `src/routes/ciclo.fud`, `tests/ciclo.spec.ts`.
- impl [ ] · tests [ ] — **28. Cierre.**
  - IDEA-08 §4 apunta a esta SDD; `INDEX.md` con el estado y el registro.
  - `pnpm typecheck`, `pnpm build`, cobertura al 100 % en lo nuevo, e2e de `examples/basic` en verde
    (criterio 32).
  - *Depende de:* todas.
  - *Ficheros:* `docs/sdd/ideas/IDEA-08-adelgazar-el-cliente.md`, `docs/sdd/INDEX.md`.
