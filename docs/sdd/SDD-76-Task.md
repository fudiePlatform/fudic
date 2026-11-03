# SDD-76 — Tareas

> **SDD:** [SDD-76 — `effect` con dependencias explícitas](./SDD-76-efectos-con-dependencias.md)
> **Paquetes:** `@fudic/core` · `@fudic/compiler` (solo un test)
> **Rama:** `sdd-76-efectos-con-dependencias`, desde `main`.
> **Progreso:** 7 / 7 — `Hecho` (2026-11-03).

**El orden manda en un punto: los defectos antes que las dependencias.** El modo con `deps` pasa
por el mismo `run`; si la regla de la vuelta superada (SDD §4.4) llega después, habría que
escribirla dos veces.

---

## Mapa de dependencias

```
1 la vuelta superada no publica ─→ 2 tests de los defectos
   │
   ▼
3 deps: fase rastreada, corte, cuerpo sin rastrear ─→ 4 tests de las dependencias ─→ 5 test del compilador
                                                                                     │
                                                    6 README y enmienda de SDD-31 ─→ 7 cierre
```

---

## Fase 1 — los defectos (2)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [x] | 1 | — | **Una vuelta superada no publica nada.** Contador de vueltas por efecto; al terminar el cuerpo, si el efecto se dio de baja o empezó otra vuelta, se ejecuta sin rastrear la limpieza recién devuelta y no se tocan `cleanup` ni las suscripciones (SDD §4.4). Actualizar el comentario de cabecera y el de la reconciliación | `core` | `src/effect.ts` |
| [x] | 2 | 1 | **Los tests de la fase.** Criterios 1, 3, 4 y 6 (sin `deps`). Los que existen pasan sin modificar (criterio 22) | `core` | `test/effect.test.ts` |

## Fase 2 — las dependencias (3)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [x] | 3 | 1 | **`effect(fn, deps?)`.** Firma y JSDoc de SDD §3; el array se copia al crear; cada vuelta: fase de dependencias rastreada, corte por `Object.is` (salvo la primera vuelta), reconciliación, limpieza y `fn` dentro de `untrack` (SDD §4.2). La regla de la vuelta superada también tras la fase de dependencias. Errores según la tabla de §4.3 | `core` | `src/effect.ts` |
| [x] | 4 | 3 | **Los tests de la fase.** Criterios 2, 5 y 7–20. El 20 (tipos) con `// @ts-expect-error` en un test de `core` | `core` | `test/effect.test.ts` |
| [x] | 5 | 3 | **El compilador no cambia, y se fija.** Criterio 21 junto a los dos casos de `fud-eager` | `compiler` | `test/emit/route-blocks.test.ts` |

## Fase 3 — documentación y cierre (2)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [x] | 6 | 3 | **README y SDD-31.** En el README de `core`, una sección `effect` con los dos modos, el corte, `[]` y cuándo usar cada uno; quitar «no automatic tracking in v1» de la viñeta de `signal`, que es falso desde SDD-31. En SDD-31 §3, la viñeta «no toma dependencias» con la nota «enmendada por SDD-76: opcionales» | `core` · docs | `README.md` · `docs/sdd/SDD-31-signals-derivadas.md` |
| [x] | 7 | 2, 4–6 | **Cierre.** Criterio 23: `pnpm typecheck`, `pnpm test`, `pnpm build`, `core` al 100 % en las cuatro métricas. Estado `Hecho` en la SDD, en este fichero y en la tabla de `INDEX.md`; entrada en el registro de progreso | docs | `docs/sdd/*` |
