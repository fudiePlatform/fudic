# BUG-55 — Tareas

> **BUG:** [BUG-55 — Una ruta no puede escuchar el bus, y una señal sembrada desde `data` no se refresca](./BUG-55-ruta-bus-y-senal-desde-data.md)
> **Paquetes:** `@fudic/compiler` · `examples/basic`
> **Rama:** `sdd-68-llamadas-sin-fontaneria` (a petición de Pedro: se cierra el producto aquí)
> **Progreso:** 3 / 4

---

## Fase 1 — El host de una ruta

| ✓ | # | tarea | package | fichero |
|---|---|---|---|---|
| [x] | 1 | **`$host` en la mitad cliente de una ruta**, igual a `$root`, solo cuando un `bus:` o un `emit` lo lee. Tests: oye el bus y repinta, lo suelta en `r()`, su `emit` llega al documento. Criterios 1–3 | `compiler` | `src/emit/route-client.ts` · `test/emit/hydrate/route.test.ts` |

## Fase 2 — La señal sembrada desde `data`

| ✓ | # | tarea | package | fichero |
|---|---|---|---|---|
| [x] | 2 | **La señal sembrada se vuelve a sembrar** en cada refresco de `data`, antes del repintado. Tests: toma el valor nuevo y repinta; una señal que no lee `data` no cambia. Criterios 4–5 | `compiler` | `src/emit/oxc-code.ts` · `src/emit/route-client.ts` · `test/emit/hydrate/refresh.test.ts` |

## Fase 3 — `/usuarios` sin recargar

| ✓ | # | tarea | package | fichero |
|---|---|---|---|---|
| [x] | 3 | **El alta por el bus.** `user-form` emite la persona; la ruta la suma a `personas`, sembrada desde `data`; la tabla pinta `personas`. Los e2e de `/usuarios` sin esperar recargas. Criterio 6 | `examples/basic` | `src/components/user-form.fud` · `src/routes/usuarios.fud` · `tests/usuarios.spec.ts` |

## Cierre

| ✓ | # | tarea |
|---|---|---|
| [ ] | 4 | `pnpm typecheck`, `pnpm test` y `pnpm build` en verde; `compiler` sin bajar de su suelo; BUG-55 a `Hecho` con su fila y su entrada en `bugs/INDEX.md` |

## Notas de la implementación

- **Suelo de `compiler` al empezar:** 99,64 / 99,19 / 99,75 / 99,87 (statements / branches /
  functions / lines). Al cerrar la fase 2: 99,64 / 99,20 / 99,75 / 99,87.
- **Tarea 3.** El `save` del formulario ya hace que la página pida su `data` (SDD-68 §4.8), y
  cuando llega el aviso del bus la persona puede venir ya en la señal re-sembrada: la ruta solo
  la suma si no está. Con Service Worker, «Borrar» no quitaba la fila: era BUG-56.
- **Tarea 3.** Los e2e de `/usuarios` se habían quedado atrás con SDD-68: esperaban recargas en
  «Activo» y «Borrar» y leían el primer `status` de la página, que dejó de ser el de la búsqueda
  lenta. Corregidos. Playwright entero: 283 en verde, 4 saltados.
