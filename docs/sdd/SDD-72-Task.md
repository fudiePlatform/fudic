# SDD-72 — Tareas

> **SDD:** [SDD-72 — Los handlers reciben el dato](./SDD-72-handlers-que-reciben-el-dato.md)
> **Paquetes:** `@fudic/compiler` · `@fudic/language-core` · `@fudic/dom` · `@fudic/forms` ·
> `@fudic/typecheck` · `examples/basic`
> **Rama:** `sdd-72-handlers-que-reciben-el-dato`. Nace de `main` **con SDD-68 en `Hecho`**: el
> ejemplo `usuarios` que se migra es el de la 68.
> **Progreso:** 10 / 22 — `En curso`. Ampliada el 2026-11-01 con la fase 5 (la delegación).

**Dos sesiones.** Una implementa y coordina. La otra escribe los tests de cada fase (las tareas
«Los tests de…») contra los criterios de SDD §6. Si un test destapa un defecto, se corrige el
código, no el test.

**El orden manda en dos puntos.**

- **El runtime antes que la proyección.** La proyección tipa lo que el emit pasa; si va por delante,
  el editor tipa como `Person` algo que en el navegador todavía es un `CustomEvent`.
- **La migración al final.** Hasta que no estén las fases 2 y 3, un `hecho(persona: Person)` con
  forma de referencia sale en rojo en el editor.

---

## Mapa de dependencias

```
1 decisión 173
   │
2 eventHandler: fudic:* ─→ 3 busHandler ─→ 4 fudic:error, siempre Error ─→ 5 tests
   │
   ▼
6 globals: $onResult/$onError ─→ 7 attrs: fudic:* ─→ 8 tests
   │
   ▼
9 dom: emit tipado y BusDetail ─→ 10 globals: $busOn… ─→ 11 attrs: bus y registro
   ─→ 12 el lote ve el registro ─→ 13 tests
   │
   ▼
14 migración ─→ 15 tests del ejemplo y prueba en navegador ─┐
                                                            │
17 decisiones 176–177 + diagnósticos ─→ 18 FUD1380 ─→ 19 marcador con eventos ─→ 22 fila sin $ ─→ 20 tests
   ─→ 21 usuarios.fud delegado y su prueba ─────────────────┴─→ 16 README, entrega y cierre
```

---

## Fase 1 — el runtime (5)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [x] | 1 | — | **La decisión 173.** Su texto en la sección 7 y su fila en el índice de decisiones; la 98, con la nota «enmendada por la 173» | docs | `docs/gramar/gramatica-v1-decisiones.md` |
| [x] | 2 | — | **`eventHandler` conoce el evento.** Recibe el nombre; en `fudic:result` y `fudic:error`, referencia, celda y lambda pasan `$event.detail` (SDD §4.1); la llamada, igual | `compiler` | `src/emit/events.ts` · `src/emit/markup-client.ts` |
| [x] | 3 | — | **`busHandler` pasa el dato.** Referencia y lambda llaman con `$event.detail`; la llamada, igual | `compiler` | `src/emit/events.ts` |
| [x] | 4 | — | **`fudic:error` siempre lleva un `Error`.** Lo que no es `Error` se envuelve con `cause`; un `AbortError` no se anuncia (SDD §4.3) | `forms` | `src/dom/bind-form.ts` |
| [x] | 5 | 2–4 | **Los tests de la fase.** Criterios 1–9; se actualizan las expectativas de la forma vieja en `events.test.ts`, `hydrate/events.test.ts`, `bus-map.test.ts` y los demás que la escriban | `compiler` · `forms` | `test/**` |

## Fase 2 — el editor: los eventos del formulario (3)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [x] | 6 | — | **Los tipos.** `$Result`, `$onResult`, `$onResultEvent`, `$onError`, `$onErrorEvent` en `GLOBALS_DTS`; `$FudicEvents` pierde sus dos entradas (SDD §4.2) | `language-core` | `src/globals.ts` |
| [x] | 7 | 6 | **La proyección.** `@fudic:result` busca el `form:=` del mismo elemento y lo copia como andamiaje sin mapear; `$onResult` para referencia y lambda, `$onResultEvent` para llamada; `fudic:error`, igual con `$onError`/`$onErrorEvent`. El error de TS cae sobre el valor del atributo | `language-core` | `src/template/attrs.ts` |
| [ ] | 8 | 6, 7 | **Los tests de la fase.** Criterios 10–16, en `language-core` (proyección) y en `language-server` (diagnóstico, hover y definición) | `language-core` · `language-server` | `test/**` |

## Fase 3 — el editor: el bus (5)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [x] | 9 | — | **`emit` tipado.** `FudicBusReceivers` global, `BusDetail`, `BusParam` y `BusArgs` exportados; la firma nueva de `emit` (SDD §3.3); la implementación, igual | `dom` | `src/emit.ts` · `src/index.ts` |
| [x] | 10 | 9 | **Los tipos de la proyección.** `$BusDetail` (reexporta el de `@fudic/dom`), `$BusParam`, `$busOn`, `$busEvent`, `$busOnAny` en `GLOBALS_DTS` | `language-core` | `src/globals.ts` |
| [x] | 11 | 10 | **La proyección y el registro.** `bus:` literal con `$busOn`/`$busEvent`, `bus:(expr)` con `$busOnAny`; se reúnen los `bus:<literal>=@f` con `f` en el nivel superior del `@code` y se escribe un solo `declare global { interface FudicBusReceivers { … } }` y `export {}` al final del módulo, con clave `'<ruta>#<n>'` (SDD §4.4) | `language-core` | `src/template/attrs.ts` · `src/emit-client.ts` |
| [ ] | 12 | 11 | **El lote ve el registro.** Todos los `.fud` del `tsconfig` en el mismo programa aunque se compruebe uno; si ya es así, un test que lo fije (SDD §4.5) | `typecheck` | `src/project.ts` · `src/checker.ts` |
| [ ] | 13 | 9–12 | **Los tests de la fase.** Criterios 17–26, con un proyecto de varios `.fud` (emisor y receptores) en el editor y en el lote | `dom` · `language-core` · `language-server` · `typecheck` | `test/**` |

## Fase 4 — migración y cierre (3)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [ ] | 14 | 5, 8, 13 | **La migración.** `user-form`, `usuarios`, `shopping-cart`, `bus-log` en `examples/basic` y `x-alias.fud` de `@fudic/testing` a la forma nueva (SDD §4.6); `app-actions.fud` se queda con la llamada | `examples/*` · fixtures | `examples/basic/src/**` · `packages/testing/test/app/**` |
| [ ] | 15 | 14 | **Los tests del ejemplo y la prueba en navegador.** Criterios 27–29; el 28 en `dev` y en `preview` | `examples/basic` | `src/**/*.test.ts` · `tests/**` |
| [ ] | 16 | 15, 21 | **README, entrega y cierre.** Los README de `@fudic/dom` y de `@fudic/forms` con la forma nueva, y el del compilador con `delegate:p="click"` y `FUD1380`; criterio 30; `pnpm typecheck`, `pnpm test` y `pnpm build` en verde; SDD-72 y este fichero en `Hecho`, fila y registro del `INDEX.md` | varios | `docs/sdd/*` · `packages/*/README.md` |

## Fase 5 — la delegación (6)

Ampliación del 2026-11-01. Va antes del cierre (tarea 16).

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [ ] | 17 | — | **Decisiones 176 y 177, y diagnósticos.** La 176 y la 177 escritas, la 117 y la 118 con su «enmendada por»; `FUD1380` (warning), `FUD1381`, `FUD1382` y `FUD1383` nuevos, con su `.md`; `FUD0667` con el texto nuevo (SDD §3.5) | docs · `diagnostics` | `docs/gramar/gramatica-v1-decisiones.md` · `src/codes/FUD1380.*` · `FUD1381.*` · `FUD0667.*` |
| [ ] | 18 | 17 | **El aviso.** Analizador `event-in-loop`, como `ref-in-loop`; el binding de la cabecera en el mensaje; sin aviso para los eventos sin sustituto de `NON_BUBBLING`, con sustituto en el texto para los que lo tienen (SDD §3.5, §4.7) | `compiler` | `src/semantic/analyzers/event-in-loop.ts` · `src/semantic/analyze.ts` |
| [ ] | 19 | 17 | **El marcador con eventos.** `planDelegation` lee el valor literal, empareja por nombre y evento, da `FUD1381`; el emit hace las tablas por nombre y evento; la proyección sigue tipando `$p` (SDD §3.4, §4.7) | `compiler` · `language-core` | `src/semantic/delegation.ts` · `src/emit/**` · `src/template/attrs.ts` |
| [ ] | 22 | 19 | **La fila sin `$`.** `planDelegation` reconoce el nombre suelto, da `FUD1382` y `FUD1383`; la proyección deja de declarar `$p`; se migran `app-calendar.fud` (ejemplo y fixture), el texto de `delegacion.fud` y los tests de SDD-37 (SDD §3.4.b) | `compiler` · `language-core` · `examples/basic` | `src/semantic/delegation.ts` · `src/template/attrs.ts` · `fixtures/app-calendar.fud` |
| [ ] | 20 | 18, 22 | **Los tests de la fase.** Criterios 31–39, 41–43 | `compiler` · `language-core` · `language-server` | `test/**` |
| [ ] | 21 | 14, 20 | **`usuarios.fud` delegado.** La tabla como en SDD §3.4; `activar(p: Person, e)` y `borrar(p: Person)`; el resto de `examples/basic` sin `FUD1380` salvo `app-calendar-plain.fud`; criterio 40 con el contador de listeners, en `dev` y en `preview` (SDD §4.8) | `examples/basic` | `src/routes/usuarios.fud` · `src/**` |
