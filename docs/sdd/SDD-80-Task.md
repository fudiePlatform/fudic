# SDD-80 — Tareas

> **SDD:** [SDD-80 — Cierre de formularios y eventos](./SDD-80-cierre-de-formularios-y-eventos.md)
> **Paquetes:** `@fudic/api` · `@fudic/forms` · `@fudic/http` · `@fudic/conventions` · `@fudic/vite` ·
> `@fudic/compiler` · `@fudic/language-core` · `@fudic/language-server` · `@fudic/vscode` ·
> `@fudic/diagnostics` · `@fudic/mcp` · `examples/basic`
> **Rama:** `worktree-pendiente` (worktree `.claude/worktrees/pendiente`), nacida de `main` en `1375967c`.
> **Progreso:** 4 / 30 — `En curso`.

**Dos sesiones.** Una implementa y coordina, y entrega cada fase con `pnpm typecheck` y `pnpm build`.
La otra escribe los tests de cada fase (las tareas «Los tests de…») contra los criterios de SDD §6,
en su propio worktree desde esta rama. Si un test destapa un defecto, se corrige el código, no el
test. Cada fase cerrada va a `origin`.

**El orden manda en tres puntos.**

- **El runtime antes que la proyección.** El editor tipa lo que el emit pasa; si va por delante,
  tipa como `boolean` algo que en el navegador todavía no existe.
- **El servidor antes que el validador remoto.** El validador pregunta a una ruta; sin ella, los
  criterios 11–16 no se pueden probar de verdad.
- **El editor antes de la prueba de Pedro.** La tarea 29 se hace con el `.vsix` de esta rama
  instalado, no con el de `main`.

---

## Mapa de dependencias

```
1 decisiones 178–180 + diagnósticos FUD1460–1466
   │
   ├─→ 2 parser y validación del .fudapi ─→ 3 módulo generado ─→ 4 tests
   │                                            │
   │      5 forms: pending y $pending ──────────┤
   │      6 forms: Check con ctx, RuleSpec ─────┤
   │                                            ▼
   │      7 conventions + http: la ruta ─→ 8 withForm con ctx y middlewares ─→ 9 vite ─→ 10 tests
   │                                            │
   │                                            ▼
   │                         11 forms: el validador remoto ─→ 12 tests
   │
   ├─→ 13 compiler: $value ─→ 14 compiler: handlers con nombre ─→ 15 tests
   │
   ├─→ 16 forms: composed ─→ 17 proyección: $value y nombre ─→ 18 proyección: FudicFormResults ─→ 19 tests
   │
   └─→ 20 editor .fudapi ─→ 21 editor .fud ─→ 22 gramáticas TextMate ─→ 23 tests por el plugin
                                                                          │
24 ejemplo ─→ 25 tests del ejemplo (Playwright dev/preview/nosw) ─────────┤
26 guía del MCP y README ─────────────────────────────────────────────────┤
27 .vsix de la rama ─→ 28 docs/PENDIENTE.md e INDEX ─→ 29 prueba de Pedro ─→ 30 cierre
```

---

## Fase 1 — decisiones y diagnósticos (1)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [x] | 1 | — | **Decisiones 178–180 y diagnósticos.** La 178 (`$value`), la 179 (handlers con nombre) y la 180 (`runs remote`, `debounce`, `use` en reglas) en sus secciones y en el índice; la 97 y la 176 con su «enmendada por». `FUD1460`–`FUD1466` con su función, su `.md` y su línea en `index.ts` (SDD §3.8) | docs · `diagnostics` | `docs/gramar/gramatica-v1-decisiones.md` · `src/codes/FUD146*.{ts,md}` · `src/index.ts` |

## Fase 2 — el `.fudapi` (3)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [x] | 2 | 1 | **Parser y validación.** `RUNS` con `remote`; `debounce` y `use`/`skip` en `ruleDecl` (reutiliza `useClause`); `RuleDecl` con `debounce`, `uses`, `skips`; `FUD1460`, `FUD1461`; middlewares comprobados como en una función; `{detail}` en el texto de una regla `remote`; `debounce` en el formateador (SDD §4.1) | `api` | `src/extensions.ts` · `src/ast.ts` · `src/validate.ts` · `src/validate-form.ts` · `src/format.ts` |
| [x] | 3 | 2 | **El módulo generado.** Servidor: `remote`, `chain`, `wire`, `sig`; navegador: `remote`, `debounce`, `wire`, `sig`, `base`, sin `never`; `.d.ts` con el tercer argumento del check en `server` y `remote`; tabla de rutas de las reglas `remote` (SDD §4.2) | `api` · `vite` | `src/emit/module.ts` · `src/emit/declarations.ts` · `vite/src/api-modules.ts` |
| [x] | 4 | 2, 3 | **Los tests de la fase.** Criterios 1–5 | `api` · `vite` | `test/**` |

*Adelantado a esta fase, porque la tarea 3 no se podía cerrar sin ello:* `RULE_PREFIX` en
`@fudic/conventions` (de la 7), que la tabla de rutas necesita; y de la 6, solo los tipos —
`Check<V, P, C, X>`, `Rule<…, X>` y los campos nuevos de `RuleSpec`— más lo justo del runtime para
el criterio 5: la variante de navegador de una regla `remote` no admite `.check()` y, hasta la
tarea 11, el navegador la salta como una `server`. `ServerContext` se exporta de
`@fudic/http/contract` para el `<Nombre>Ctx` del `.d.ts`. Ver SDD §8.2.

## Fase 3 — el servidor (6)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [ ] | 5 | — | **`pending` y `$pending`.** `Control.pending` y `FormApi.$pending` públicos, sacados de la época de `verdicts`; en campos y en grupos (SDD §3.4) | `forms` | `src/types.ts` · `src/control.ts` · `src/form.ts` · `src/verdicts.ts` |
| [ ] | 6 | 3 | **El contrato de la regla.** `RuleSpec` con `remote`, `debounce`, `chain`, `wire`, `sig`; `Check<V, P, C, X>` con el contexto; en el servidor, `use()` corre la cadena de la regla alrededor del check (SDD §3.2, §4.2) | `forms` | `src/contract/rule.ts` · `src/contract/registry.ts` |
| [ ] | 7 | 6 | **La ruta.** `RULE_PREFIX`; `contractsHandler` sirve las reglas `remote`: 404 para las demás, firma, `conform`, cadena `$global` + la de la regla, veredicto en el `Wire` de la regla, problem en su formato (SDD §3.3, §4.4) | `conventions` · `http` | `conventions/src/index.ts` · `http/src/contract/server.ts` · `http/src/contract/rule-route.ts` |
| [ ] | 8 | 6 | **El envío con contexto.** `withForm` pasa el contexto a `$validate({ server: true, ctx })` y cada regla `server`/`remote` corre sus middlewares con él (SDD §4.4, decisión 8.1.5) | `http` · `forms` | `http/src/server/dispatch.ts` · `forms/src/form.ts` · `forms/src/control.ts` |
| [ ] | 9 | 7 | **Vite.** `RULE_PREFIX` en dev, en preview y en la tabla del build; el check sigue fuera del bundle (SDD §4.4) | `vite` | `src/functions.ts` · `src/plugin.ts` |
| [ ] | 10 | 5–9 | **Los tests de la fase.** Criterios 6–10 y 15 | `forms` · `http` · `vite` | `test/**` |

## Fase 4 — el validador remoto (2)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [ ] | 11 | 5, 7 | **El validador remoto.** Uno por uso: caché, `debounce`, `AbortController`, veredicto a errores, todo fallo pasa como válido sin guardarse; al enviar no pregunta y aborta la que esté en vuelo; en su propio módulo, importado solo por reglas `remote` (SDD §4.3) | `forms` | `src/contract/remote.ts` · `src/contract/rule.ts` |
| [ ] | 12 | 11 | **Los tests de la fase.** Criterios 11–16, con un servidor en memoria y reloj falso | `forms` · `http` | `test/**` |

## Fase 5 — el compilador (3)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [ ] | 13 | 1 | **`$value`.** Fuera de `strayDollars`; el analizador que decide el control y da `FUD1462`–`FUD1464`; `control.ts` exporta el tipo del valor; el emit con el lector en línea, sin delegación (`currentTarget`) y con delegación (el elemento marcado que encontró el listener) (SDD §3.5, §4.5) | `compiler` | `src/semantic/delegation.ts` · `src/semantic/analyzers/value-argument.ts` · `src/binding/control.ts` · `src/emit/events.ts` · `src/emit/markup-client.ts` |
| [ ] | 14 | 1 | **Handlers con nombre.** `classifyEvent` separa evento y nombre (`FUD1465`); `planDelegation` empareja por fila, evento y nombre, con `FUD1466`; tablas con el nombre en la clave; un listener del evento base por handler; `NON_BUBBLING`, `FUD0665`, `FUD1380` por el evento base (SDD §3.6, §4.6) | `compiler` | `src/binding/classify.ts` · `src/semantic/delegation.ts` · `src/semantic/analyzers/event-in-loop.ts` · `src/emit/**` |
| [ ] | 15 | 13, 14 | **Los tests de la fase.** Criterios 17–28 (el DOM en happy-dom) | `compiler` | `test/**` |

## Fase 6 — formularios en el host y la proyección (4)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [ ] | 16 | — | **`composed`.** `fudic:result` y `fudic:error` con `bubbles: true, composed: true` (SDD §3.7) | `forms` | `src/dom/bind-form.ts` |
| [ ] | 17 | 13, 14 | **`$value` y el nombre en la proyección.** `const $value: <tipo>` antes de la llamada; `emitEventName` proyecta solo el evento base (SDD §4.7) | `language-core` | `src/template/attrs.ts` · `src/globals.ts` |
| [ ] | 18 | 16 | **`FudicFormResults`.** Cada componente escribe la unión de sus `form:=` y de los componentes que usa; `$onResultOf<'tag'>` en el host; el lote de `typecheck` ve el registro (SDD §3.7, §4.7) | `language-core` · `typecheck` | `src/template/attrs.ts` · `src/emit-client.ts` · `src/globals.ts` · `typecheck/src/**` |
| [ ] | 19 | 16–18 | **Los tests de la fase.** Criterios 29–31 y la parte de editor de 17–18 | `forms` · `language-core` · `language-server` · `typecheck` | `test/**` |

## Fase 7 — el editor (4)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [ ] | 20 | 2 | **El editor del `.fudapi`.** `runs` con `remote` y sus explicaciones; `debounce`, `use`, `skip` solo en una regla `remote` (con los middlewares detrás de `use`); `remote` en el snippet `rule` y snippet nuevo `rule remote`; hover sobre `remote` y `debounce` (SDD §4.8) | `language-server` | `src/fudapi/completion.ts` · `src/fudapi/snippets.ts` · `src/fudapi/navigation.ts` |
| [ ] | 21 | 17, 18 | **El editor del `.fud`.** `$event` y `$value` (solo donde vale, con su tipo) en los argumentos de un handler; hover sobre `$value` y sobre `@click.borrar`; eventos con nombre en el valor del marcador, con `.` en la palabra; el contexto del handler acepta `.` y `:` en el nombre del evento (SDD §4.8) | `language-server` | `src/services/ts-completion.ts` · `src/services/position.ts` · `src/services/delegate.ts` · `src/services/plugin.ts` |
| [ ] | 22 | — | **Las gramáticas TextMate.** `@click.borrar` y `@fudic:result` enteros como evento; `remote` y `debounce` en el `.fudapi` (SDD §4.8) | `vscode` | `syntaxes/fudic.tmLanguage.json` · `syntaxes/fudapi.tmLanguage.json` |
| [ ] | 23 | 20–22 | **Los tests de la fase, por el plugin del language server.** Criterios 32–37; aceptación LSP para el completado de `$value` y de `click.borrar`; `grammar.test.ts` para el 37 | `language-server` · `vscode` | `test/services/**` · `test/acceptance/**` · `test/grammar.test.ts` |

## Fase 8 — el ejemplo y la documentación (3)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [ ] | 24 | 11, 15, 19 | **El ejemplo.** `alias-taken` en `runs remote`; «Comprobando…» con `pending()`; `usuarios.fud` con `$value` en `activar` y `buscar`, *Ver* con `@click.ver` y su ficha, `<user-form @fudic:result=@alta>` (y `user-form.fud` sin `emit("alta")` si nadie más lo escucha); párrafo en `delegacion.fud` (SDD §4.9) | `examples/basic` | `src/rules/people.fudapi` · `src/components/app-form.fud` · `src/routes/usuarios.fud` · `src/components/user-form.fud` · `src/routes/delegacion.fud` |
| [ ] | 25 | 24 | **Los tests del ejemplo.** Criterios 38–39 en `dev`, `preview` y `nosw`; los de `usuarios.spec.ts` y `usuarios.test.ts` que miraban el bus o el cast, al día | `examples/basic` | `tests/**` · `src/**/*.test.ts` |
| [ ] | 26 | 24 | **Guía y README.** `guide/fudapi.md`, `view.md`, `components.md` y `es/`, con el aviso de enumeración; README de `forms`, `compiler` y `http` (SDD §4.10) | `mcp` · varios | `packages/mcp/guide/**` · `packages/*/README.md` |

## Fase 9 — prueba y cierre (4)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [ ] | 27 | 23 | **El `.vsix` de la rama.** Construirlo y dejar la ruta y el comando de instalación a Pedro | `vscode` | — |
| [ ] | 28 | 26 | **`docs/PENDIENTE.md`.** Las notas 2 y 6 salen de la tabla (ya apuntan a SDD-80 desde la redacción) y su análisis de «Análisis con sesión» §2 se borra: vive en la SDD | docs | `docs/PENDIENTE.md` |
| [ ] | 29 | 25, 27 | **Prueba de Pedro.** En el navegador (`dev`, `preview`, `nosw`) y en VS Code con el `.vsix` de la tarea 27 instalado, escribiendo a mano: una regla `remote` en el `.fudapi` (completado de `runs`, `debounce`, `use`; snippet `rule remote`; hover); su uso con `pending()` en la vista; un `$value` en una casilla y en un buscador (se ofrece, hover con su tipo, error si la función espera otro); dos botones con `@click.<nombre>` en una fila (completado del marcador, colores, hover); `@fudic:result` en el host de `user-form` (tipo `Person` en el hover). Lo que falle vuelve a su fase (criterio 40) | Pedro | — |
| [ ] | 30 | 29 | **Cierre.** `pnpm typecheck`, `pnpm test` y `pnpm build` en verde; lo nuevo al 100 %; SDD-80 y este fichero en `Hecho`, registro del índice; merge a `main` cuando Pedro lo diga | varios | `docs/sdd/*` |
