# SDD-86 — Tareas

> **SDD:** [SDD-86 — El ciclo de vida de un componente, y las props reflejadas en el host](./SDD-86-ciclo-de-vida-y-props-reflejadas.md)
> **Paquetes:** `@fudic/diagnostics` · `@fudic/compiler` · `@fudic/core` · `@fudic/forms` ·
> `@fudic/language-core` · `@fudic/language-server` · `@fudic/vscode` · `@fudic/mcp` · `examples/basic`
> **Rama:** `sdd-86-ciclo-de-vida`, desde `main`, con SDD-85 ya en `main`.
> **Progreso:** 0 / 24 — `Listo`.

**El orden manda en tres puntos.**

- **El runtime antes que el emit.** El emit llama a `hooks()` y a `on` / `off` del controlador.
- **Los diagnósticos antes que el emit.** El emit da por hecho que cada llamada a un hook es una
  sentencia de nivel superior del `@code` de un componente, y eso solo lo garantiza el análisis.
- **El golden sin hooks se fija antes de tocar el emit** (tarea 9). Es lo que prueba que un componente
  que no usa hooks sale igual, byte a byte.

---

## Fase 1 — Los diagnósticos y el análisis

- [ ] **1. `FUD1560`, `FUD1561` y `FUD1562`.**
  - Un fichero por código, con su `.md` en inglés y su línea en `index.ts` (SDD §3.3).
  - *Depende de:* —.
  - *Paquete:* `diagnostics`.
  - *Ficheros:* `src/codes/FUD1560.ts` · `.md`, `src/codes/FUD1561.ts` · `.md`,
    `src/codes/FUD1562.ts` · `.md`, `src/index.ts`.
- [ ] **2. Los hooks en `ExtractedCode`.**
  - Una lista de los hooks que usa el `@code` (`hooks: readonly HookUse[]`, con el tipo de hook, el
    span de la llamada y si es sentencia de nivel superior), leída del AST de Oxc como `props`.
  - *Depende de:* —.
  - *Paquete:* `compiler`.
  - *Ficheros:* `src/emit/oxc-code.ts`, `test/emit/oxc-code-hooks.test.ts`.
- [ ] **3. El analizador `lifecycle`.**
  - `FUD1560` fuera del nivel superior, `FUD1561` en un fichero que no es componente, `FUD1562` en una
    declaración o un import con el nombre de un hook (SDD §3.2). El span, en la llamada o en la
    declaración.
  - Registrado en `analyze.ts`. Al 100 % (criterios 18, 19, 20).
  - *Depende de:* 1, 2.
  - *Paquete:* `compiler`.
  - *Ficheros:* `src/semantic/analyzers/lifecycle.ts`, `src/semantic/analyze.ts`,
    `test/semantic/lifecycle.test.ts`.

## Fase 2 — El runtime

- [ ] **4. `hooks()`.**
  - `add`, `run`, `on`, `off` y `dispose` (SDD §3.5). Orden de registro; `on` / `off` idempotentes;
    la limpieza de `onConnect` antes de `onDisconnect`; en `dispose`, primero `onDispose` y después
    las limpiezas de `afterHydrate` / `afterCreate`; cada función en su `try` con `reportError`
    (SDD §4.1, §4.2, §4.4).
  - Exportado desde `index.ts`. Al 100 %.
  - *Depende de:* —.
  - *Paquete:* `core`.
  - *Ficheros:* `src/lifecycle.ts`, `src/index.ts`, `test/lifecycle.test.ts`.
- [ ] **5. `on` y `off` en el controlador.**
  - Dos métodos opcionales en `Controller` (SDD §3.4).
  - *Depende de:* —.
  - *Paquete:* `core`.
  - *Ficheros:* `src/controller.ts`.
- [ ] **6. `FudicElement` conecta.**
  - `connectedCallback` reenvía a `on`; `h()` y `c()` llaman a `on` al final si el host está
    conectado; `disconnectedCallback` llama a `off` antes de la microtarea (SDD §4.6). El comentario de
    cabecera se reescribe.
  - Tests: los dos órdenes (conectado antes y después del controlador) sin doble `on`; un movimiento
    da `off` + `on` y ningún `r`.
  - *Depende de:* 5.
  - *Paquete:* `core`.
  - *Ficheros:* `src/element.ts`, `test/element.test.ts`.
- [ ] **7. `FudicControlElement` llama a `super`.**
  - `override connectedCallback()`: primero `super.connectedCallback()`, después el relay (SDD §4.6).
  - Test: un control con `on` / `off` los recibe, y el relay sigue copiando los atributos (criterio
    12).
  - *Depende de:* 6.
  - *Paquete:* `forms`.
  - *Ficheros:* `src/element.ts`, `test/dom/element.test.ts`.

## Fase 3 — El emit

- [ ] **8. Fixture `app-lifecycle.fud`.**
  - Un componente con los siete hooks, un `ref`, `role="group"` y `variant="@variant"` en su tag de
    identidad, y un `@foreach` con clave de hijos que también usan hooks. Es el que usan las tareas
    siguientes.
  - *Depende de:* —.
  - *Paquete:* `compiler`.
  - *Ficheros:* `fixtures/app-lifecycle.fud`.
- [ ] **9. Golden sin hooks, fijado.**
  - Antes de tocar el emit, un test que compara la salida de cliente y de servidor de todos los fixtures
    sin hooks con sus goldens. Tiene que seguir en verde al acabar la fase (criterio 15).
  - *Depende de:* —.
  - *Paquete:* `compiler`.
  - *Ficheros:* `test/emit/lifecycle-untouched.test.ts`.
- [ ] **10. El cliente registra y ejecuta.**
  - `const $hk = $hooks();` dentro del `$owned`, antes del código del autor; cada llamada reescrita a
    `$hk.add("…", fn)` con el mapa de fuentes en la llamada; `run` de `before*` / `after*` en `h` y en
    `c`, el `after*` después de `$s()`; `$hk.dispose(host)` como primera línea de `r`; el host guardado
    al principio de la factoría (SDD §4.5).
  - Golden de `app-lifecycle`.
  - *Depende de:* 2, 4, 8.
  - *Paquete:* `compiler`.
  - *Ficheros:* `src/emit/client.ts`, `src/emit/markup-client.ts`,
    `test/emit/__golden__/app-lifecycle.client.mjs`, `test/emit/lifecycle.test.ts`.
- [ ] **11. `on` y `off`, solo si hacen falta.**
  - Emitidos solo con `onConnect` u `onDisconnect` (criterio 17).
  - *Depende de:* 10.
  - *Paquete:* `compiler`.
  - *Ficheros:* `src/emit/client.ts`, `test/emit/lifecycle.test.ts`.
- [ ] **12. El servidor y el SW no ven los hooks.**
  - Las sentencias de hook se quitan, enteras, de la salida de servidor y de SW (criterio 16).
  - Golden de servidor de `app-lifecycle`, igual que el del mismo componente sin hooks.
  - *Depende de:* 2, 8.
  - *Paquete:* `compiler`.
  - *Ficheros:* `src/emit/module.ts`, `src/emit/markup.ts`,
    `test/emit/__golden__/app-lifecycle.server.mjs`, `test/emit/lifecycle.test.ts`.
- [ ] **13. Un hook hidrata.**
  - Test de nivel: un `@code` con solo `afterHydrate(() => {})` hace el componente hidratable
    (criterio 14). Sin cambios en `level.ts`.
  - *Depende de:* 2.
  - *Paquete:* `compiler`.
  - *Ficheros:* `test/emit/level.test.ts`.
- [ ] **14. Los hooks de punta a punta.**
  - Con el harness de hidratación del compilador: el orden al hidratar y al crear, los `ref` en
    `beforeHydrate` / `afterHydrate` / `onDispose`, el movimiento sin `onDispose`, tres
    `afterHydrate` en orden, el que lanza, el host en `fn`, el hijo antes que el padre (criterios
    2–10).
  - *Depende de:* 6, 10, 11.
  - *Paquete:* `compiler`.
  - *Ficheros:* `test/emit/hydrate/lifecycle.test.ts`.

## Fase 4 — El editor

- [ ] **15. Las firmas.**
  - Los siete hooks declarados en `globals.ts`, junto a `props` (SDD §3.1, §4.7). Tests de tipos del
    criterio 21.
  - *Depende de:* —.
  - *Paquete:* `language-core`.
  - *Ficheros:* `src/globals.ts`, `test/lifecycle-types.test.ts`.
- [ ] **16. Los snippets.**
  - Siete entradas con ámbito `code-block` y rol `component` (SDD §4.7). Tests del criterio 22.
  - *Depende de:* —.
  - *Paquete:* `language-server`.
  - *Ficheros:* `src/services/snippets.ts`, `test/services/snippets.test.ts`.
- [ ] **17. El README de la extensión.**
  - La tabla de los snippets del ciclo de vida, junto a la de los `<link>`.
  - *Depende de:* 16.
  - *Paquete:* `vscode`.
  - *Ficheros:* `README.md`.

## Fase 5 — Las props reflejadas

- [ ] **18. El host en el servidor, al hidratar y al actualizar.**
  - Criterio 23: el servidor escribe; `h` no reescribe; `u` cambia, vacía con `true` y quita con
    `false`, `null` y `undefined`; `0` es `"0"`.
  - *Depende de:* 8.
  - *Paquete:* `compiler`.
  - *Ficheros:* `test/emit/hydrate/host-reflect.test.ts`.
- [ ] **19. El host al crear.**
  - Criterio 24: creado desde un `@foreach`, el host lleva `role="group"` y `variant` como en el
    servidor. Si falta alguno, se arregla en el emit de `emitHost`.
  - *Depende de:* 8.
  - *Paquete:* `compiler`.
  - *Ficheros:* `test/emit/hydrate/host-reflect.test.ts`, y `src/emit/markup-client.ts` si hace falta.
- [ ] **20. El tipo en el editor.**
  - Criterio 25: un objeto en un atributo con expresión del tag de identidad es error de tipos.
  - *Depende de:* —.
  - *Paquete:* `language-core`.
  - *Ficheros:* `test/host-reflect-types.test.ts`.

## Fase 6 — Guía, ejemplo y cierre

- [ ] **21. La guía.**
  - Secciones «ciclo de vida» y «props reflejadas», con la nota de los atributos nativos (SDD §4.8,
    §4.9), en inglés y en español.
  - *Depende de:* 10, 18.
  - *Paquete:* `mcp`.
  - *Ficheros:* `guide/components.md`, `guide/es/components.md`.
- [ ] **22. El ejemplo `/ciclo`.**
  - `ciclo-demo` y la ruta `/ciclo` (SDD §4.9), con su e2e del criterio 1, y el test de `mount` del
    criterio 13.
  - *Depende de:* 10, 11, 19.
  - *Paquete:* `examples/basic`.
  - *Ficheros:* `src/components/ciclo-demo.fud`, `src/components/ciclo-demo.test.ts`,
    `src/routes/ciclo.fud`, `tests/ciclo.spec.ts`.
- [ ] **23. Un componente que se hidrata por interacción.**
  - Criterio 11, en el e2e: ningún hook antes de la interacción.
  - *Depende de:* 22.
  - *Paquete:* `examples/basic`.
  - *Ficheros:* `src/routes/ciclo.fud`, `tests/ciclo.spec.ts`.
- [ ] **24. Cierre.**
  - IDEA-08 §4 apunta a esta SDD; `INDEX.md` con el estado y el registro.
  - `pnpm typecheck`, `pnpm build`, cobertura al 100 % en lo nuevo, e2e de `examples/basic` en verde
    (criterio 26).
  - *Depende de:* todas.
  - *Ficheros:* `docs/sdd/ideas/IDEA-08-adelgazar-el-cliente.md`, `docs/sdd/INDEX.md`.
