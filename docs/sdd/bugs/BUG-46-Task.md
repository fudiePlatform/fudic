# BUG-46 — Tareas

> **BUG:** [BUG-46 — El build espera a cosas que no necesita](./BUG-46-el-build-que-espera.md)
> **Paquetes:** `@fudic/vite` · `@fudic/typecheck`
> **Rama:** `perf/pipeline-timings`, en el worktree `.claude/worktrees/perf-pipeline-timings`,
> creada desde `main` (`f4938eb`)
> **Forma de trabajo, por indicación de Pedro:** se midió antes de tocar nada; la implementación
> va en esta sesión y los tests, el typecheck y la cobertura los hace otra sesión («Test Vite»);
> el BUG y sus tareas se escriben al final.
> **Progreso:** 7 / 10

---

## Fase 0 — Medir

- [x] 1. La instrumentación de fases: `vite/src/timing.ts` y las marcas `[fudic:t]` en
  `plugin.ts`. Es temporal y se quita en el cierre (`c768b6d`).

## Fase 1 — El preview no carga TypeScript

- [x] 2. `@fudic/typecheck/problems`, la entrada ligera. El reporter, los resúmenes y la live
  check importan de ella, y `createProjectChecker` se importa bajo demanda (`c768b6d`).

## Fase 2 — El grafo, una vez por build

- [x] 3. Una io con memoria por build. `client.ts` pregunta por `graphOf` (`b040099`).

## Fase 3 — Cada `.fud`, una vez por build

- [x] 4. `build-memory.ts`, con la memoria genérica, y `compile.ts` con `compileFud`. Las tres
  pasadas compilan por ahí (`64153a3`).

## Fase 4 — El typecheck en su hilo

- [x] 5. `worker/check.mjs` y `background-check.ts`. `buildStart` lanza el chequeo, `report`
  espera el veredicto antes de decir nada y `buildEnd` lo espera, o corta el hilo si el build ya
  falló (`d33d383`).

## Fase 5 — Link y edge a la vez

- [x] 6. `Promise.all` en `generateBundle` (`d926fd9`).

## Cierre

- [x] 7. El test que a veces tumba su fork de vitest: `background-check.test.ts` con el chequeo
  real en un hilo dentro del fork. Fuera de vitest no muere nunca (criterio 5).

  **Cómo se cerró.** Con ese test en skip, la suite sale limpia 10 de 10; con él activo moría
  una de cada diez. Un `worker_thread` hereda el `execArgv` del fork de vitest
  (`--conditions development`, `--require …suppress-warnings.cjs`), y ese hilo cargaba
  TypeScript, Volar y Oxc dentro del fork, con carga en la máquina. En `vite build` no se da
  ninguna de esas condiciones. El chequeo real del test pasa a un proceso Node aparte, un driver
  que importa `src/background-check.ts`. La rama `message` se cubre con un worker trivial, y un
  `afterEach` espera a que se cierre cada hilo. Resultado: 10 de 10 pasadas completas sin que
  muera el fork. Hubo un «exit 1 con stderr vacío» del driver en sus tres primeras ejecuciones
  que no se reprodujo después: queda **observado y no reproducido**, y el mensaje del test ya
  trae el código y las salidas.
- [ ] 8. Quitar la instrumentación de la fase 0.
- [ ] 9. `pnpm typecheck`, `pnpm test` y `pnpm build` en verde, con la cobertura de §6 del BUG.
  `INDEX.md` de bugs y el maestro.
- [ ] 10. Actualizar el pnpm global para que deje de delegar del 10.4 al 11.9.
