# SDD-35 — Tareas

> **SDD:** [SDD-35 — `fudic check`](./SDD-35-fudic-check.md)
> **Paquetes:** `@fudic/cli` · (consume `@fudic/language-core` y `@fudic/compiler`, que no cambian)
> **Rama:** `worktree-bug-23`
> **Progreso:** 0 / 11

Once tareas. Cada una es un paso cerrado: se puede parar después de cualquiera con el workspace
verde.

**El orden manda en dos puntos.** La **1 antes que todo**: el hueco se mide antes de taparlo, o el
test solo demuestra que el código nuevo hace lo que hace. Y la **4 antes que la 5**: sin el host
que sirve los virtuales no hay `Program` del que sacar un diagnóstico que mapear.

---

## Mapa de dependencias

```
1 la medida ──→ 2 argv ──→ 3 recolección ──→ 4 host y Program ──→ 5 mapeo ──→ 6 orden
                                                     │                          │
                                                     └──→ 7 compilador ────────→ 8 reporte
                                                                                  │
                                                     9 no-semantic ──────────────┤
                                                    10 errores del comando ──────┤
                                                                                 └→ 11 cierre
```

---

## Fase 1 — la medida (1)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [ ] | 1 | — | **El hueco, en rojo.** Un `.fud` con `.tone="@(42)"` contra `tone?: 'neutral' \| 'success' \| 'info'`: un test que afirma que `pnpm build` lo deja pasar y que el editor lo marca. Es el criterio 3 del SDD y la razón de que exista | `cli` | `test/check/gap.test.ts` |

---

## Fase 2 — el comando (3)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [ ] | 2 | 1 | **`argv` → comando.** `check` en `parseArgs` con `paths`, `--project`, `--json`, `--no-semantic`, y los globales de SDD-22. Uso en `USAGE`. Un flag desconocido sale con `1` | `cli` | `src/args.ts` · `src/run.ts` |
| [ ] | 3 | 2 | **La recolección.** `fudFiles(root)` en profundidad saltando `node_modules` y `dist`; un fichero suelto se acepta tal cual; una ruta que no existe es error de uso | `cli` | `src/check/discover.ts` |
| [ ] | 4 | 3 | **El host y el `Program`.** `ts.createProgram` con un `CompilerHost` que sirve los virtuales de memoria, `GLOBALS_DTS` bajo `GLOBALS_FILE_NAME`, y delega el resto. `noEmit` forzado; lo demás sale del `tsconfig` resuelto. Los `.css` virtuales no entran (§4.2, criterios 15 y 16) | `cli` | `src/check/program.ts` |

---

## Fase 3 — la traducción (3)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [ ] | 5 | 4 | **El mapeo de vuelta**, con `mapToSource` y el filtro `verification`: dentro se reporta, en andamiaje se descarta, a caballo se recorta al tramo de usuario (§4.3, criterios 7 y 8). Los que no mapean se cuentan para `FUD0621` | `cli` | `src/check/map.ts` |
| [ ] | 6 | 5 | **El orden estable**: ruta POSIX relativa, después offset, después código. Dos ejecuciones, el mismo texto byte a byte (criterio 10) | `cli` | `src/check/sort.ts` |
| [ ] | 7 | 3 | **El compilador en la misma lista.** Parser primero: un `error` de sintaxis reporta y **no** proyecta. Pase semántico después: un `error` de contrato **sí** proyecta (§4.4, criterios 4 y 5) | `cli` | `src/check/run.ts` |

---

## Fase 4 — lo que ve el humano (2)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [ ] | 8 | 6, 7 | **El reporte.** Texto con ruta relativa, línea y columna 1-based (por `LineMap`, nunca guardadas), código y mensaje; `--json` a `stdout` y nada en `stderr`. Códigos de salida 0 / 1 / 2, y un `warning` no los mueve (criterios 9, 17) | `cli` | `src/check/report.ts` · `src/report.ts` |
| [ ] | 9 | 8 | **`--no-semantic`**: ni se monta `Program`. Se mide inyectando un `ts` que lanza si se le llama (criterio 11) | `cli` | `src/check/run.ts` |

---

## Fase 5 — los bordes y el cierre (2)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [ ] | 10 | 8 | **Los tres códigos del comando.** `FUD0620` sin `tsconfig` (warning, salida 0), `FUD0621` con los descartados (info), `FUD0622` con un `.fud` ilegible (error, salida 2). Y la invariante 3: con un `readIo` que lanza siempre, `run` devuelve un código y no un stack trace (criterios 12, 13, 14, 18) | `cli` | `src/check/diagnostics.ts` |
| [ ] | 11 | todas | **Cierre.** `pnpm typecheck`, `pnpm test`, `pnpm build`. Los 20 criterios de §6 verdes, el de la tarea 1 —el que se vio fallar— en verde. `typescript` como dependencia de runtime de `@fudic/cli` y ninguna a `@fudic/language-server` (criterio 19). Cobertura del código nuevo al 100 % en las cuatro (criterio 20). SDD-35 a `Hecho` en [INDEX.md](./INDEX.md) | — | [INDEX.md](./INDEX.md) |
