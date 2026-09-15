# BUG-33 — Tareas

> **BUG:** [BUG-33 — Dos apps en el mismo origen se borran las cachés](./BUG-33-caches-por-app.md)
> **Paquetes:** `@fudic/transport` · `@fudic/vite`
> **Rama:** `bug-33-caches-por-app`
> **Progreso:** 3 / 6
> **Bloqueado por:** [SDD-41](../SDD-41-configuracion-de-aplicacion.md) — sin `id` no hay con qué
> namespacear. Concretamente por su **tarea 7**: el plugin tiene que estar leyendo el config antes
> de que este BUG pueda pasarle el `id` al worker.

Seis tareas. Es un BUG pequeño —cuatro cadenas y un predicado— y el orden es estricto de
principio a fin: cada una deja el workspace verde, pero ninguna tiene sentido antes que la
anterior.

**La 1 antes que todo.** El defecto se ve fallar primero, en un test que afirma el
comportamiento roto. Sin él, la 2 es un cambio de firma que nadie puede demostrar que arregla
nada.

---

## Mapa de dependencias

```
1 el defecto en rojo ──→ 2 cacheNames ──→ 3 isStaleCache ──→ 4 el worker ──→ 5 e2e ──→ 6 cierre
```

---

## Fase 1 — la medida (1)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [x] | 1 | — | **(rojo primero)** **El defecto, afirmado.** Un test que declara lo que hoy pasa: `isStaleCache('shell-a1b2c3d4', 'ffffffff')` es `true`, o sea, un build declara basura la caché de otra aplicación. Se ve pasar **ahora** y se ve fallar en cuanto la 3 aterriza; se reescribe entonces como el criterio 3. Es la fotografía del defecto, y la razón de que este documento exista. Criterio 1 | `transport` | `test/store.test.ts` |

---

## Fase 2 — el esquema de nombres (2)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [x] | 2 | 1 | **`cacheNames(app, build)`.** Las cuatro pasan a `<kind>-<app>-<build>`. Cambio de firma incompatible **a propósito**: una que siga aceptando solo el build deja el defecto disponible (§3.1). Se actualizan las llamadas de `@fudic/transport` y el emisor del worker compila con el `app` todavía a mano. Criterio 2 | `transport` | `src/store.ts` · `test/store.test.ts` |
| [x] | 3 | 2 | **`isStaleCache(name, app, build)`**, con las tres reglas de §4.2 y §4.3: (a) es de esta app cuando empieza por `<kind>-<app>-` **y lo que queda mide exactamente `BUILD_ID_LENGTH`** — el corte por anchura, nunca por el último guión; (b) de esta app y otro build, stale; (c) la **forma vieja** —`<kind>-` y ocho caracteres, sin segmento de app— stale siempre, para que un despliegue anterior a este BUG no deje basura inmortal. Cualquier otro nombre, intacto. Criterios 3, 4, 5, 6 | `transport` | `src/store.ts` · `test/store.test.ts` |

---

## Fase 3 — el worker (1)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [ ] | 4 | 3 | **El `id` llega al worker.** `SwBootstrapOptions` gana `app`, el bootstrap emite `const APP = "<id>";` al lado de `const BUILD`, y `NAMES` sale de los dos. El valor viene del `fudic.json` que el plugin ya lee (SDD-41 tarea 7) — **no** de una opción nueva de `FudicOptions`. Sin token: el `id` se conoce en `configResolved` y `BUILD_TOKEN` sigue siendo la única sustitución, así que el mapa del worker sigue siendo válido. Criterios 7, 8 | `vite` | `src/bootstrap.ts` · `src/plugin.ts` · `src/swbuild.ts` · `test/sw-app-id.test.ts` |

---

## Fase 4 — la evidencia y el cierre (2)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [ ] | 5 | 4 | **Dos apps, un origen.** Un segundo build de `examples/basic` bajo `/admin/` con `id: "basic-admin"` —que además ejercita el corte por anchura de §4.2, porque `basic` es prefijo suyo— y un guion de Playwright que visita `/`, visita `/admin/`, corta la red y vuelve a `/`. **La página abre.** Antes de la fase 2, con el mismo guion, no abre. Criterio 9 | `example-basic` | `admin/vite.config.ts` · `tests/sw-two-apps.spec.ts` |
| [ ] | 6 | todas | **Cierre.** `pnpm typecheck`, `pnpm test`, `pnpm build`, y los 9 criterios de §6 verdes — con el 1 visto pasar antes y fallar después. `@fudic/transport` no baja del número que tiene al empezar y el código nuevo nace al 100 %. BUG-33 a `Hecho` en [INDEX.md](./INDEX.md) | — | [INDEX.md](./INDEX.md) |
