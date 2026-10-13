# BUG-46 — Tareas

> **BUG:** [BUG-46 — El build espera a cosas que no necesita](./BUG-46-el-build-que-espera.md)
> **Paquetes:** `@fudic/vite` · `@fudic/typecheck`
> **Rama:** `perf/pipeline-timings`, en el worktree `.claude/worktrees/perf-pipeline-timings`,
> creada desde `main` (`f4938eb`)
> **Forma de trabajo, por indicación de Pedro:** se midió antes de tocar nada; la implementación
> va en esta sesión y los tests, el typecheck y la cobertura los hace otra sesión («Test Vite»);
> el BUG y sus tareas se escriben al final.
> **Progreso:** 9 / 10

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

## Fase 4 — El typecheck en paralelo

- [x] 5. `worker/check.mjs` y `background-check.ts`. `buildStart` lanza el chequeo, `report`
  espera el veredicto antes de decir nada y `buildEnd` lo espera, o lo corta si el build ya
  falló (`d33d383`). Nació como `worker_thread`. En el cierre pasó a proceso hijo, por un crash
  nativo de `terminate()` (ver BUG §3.3 y la tarea 7).

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
  muera el fork.

  **Y no era solo del test.** Ya en el cierre, con la máquina en reposo, el driver de ese test
  murió con `0xC0000005` (*access violation*) en un Node normal. Sondas sobre la versión con
  hilo: 2 de 60 muertes al llamar a `terminate()` después de recibir el informe, y 0 de 60
  cuando el hilo salía solo. Los «exit 1 con stderr vacío» de antes eran casi seguro lo mismo.
  Decisión: el chequeo pasa a un **proceso hijo** (`child_process.fork`, `execArgv: []`).
  `report` rechaza con el código o la señal si el hijo termina sin informar, y escucha `close`
  y no `exit`, para que un informe enviado justo antes de salir llegue siempre primero. Con un
  proceso, el chequeo real vuelve a correr dentro de vitest.
- [x] 8. Quitar la instrumentación de la fase 0: fuera `timing.ts` y todas las marcas
  `[fudic:t]`.
- [x] 9. `pnpm typecheck`, `pnpm test` y `pnpm build` en verde, con la cobertura de §6 del BUG.
  Los tiempos medidos otra vez con la versión del proceso hijo. `INDEX.md` de bugs y el
  maestro.

  **Cómo se cerró.**
  - `pnpm typecheck`: 20 de 20 paquetes.
  - `pnpm test`: todos los paquetes en verde, `@fudic/vite` con 880 y 1 *expected fail*.
  - `pnpm build`: verde, con `examples/basic` y `examples/workspace`.
  - Cobertura: `@fudic/vite` en 97,80 / 93,59 / 98,03 / 97,79, sobre su suelo de
    97,70 / 93,40 / 97,94 / 97,70. `background-check.ts`, `build-memory.ts` y `compile.ts`
    al 100, con umbral por fichero. `@fudic/typecheck` al 100.
  - Tres incidencias:
    - Dos tests de `cli` fallaron con un `dist` desfasado, porque los tests corrieron antes que
      el build. Con el build hecho, 268 de 268.
    - Un test de navegador de `workbench` y un `EBUSY` de Windows en `vscode` fallaron una vez
      cada uno y luego pasaron dos de dos. Son intermitentes y ajenos a este cambio.
  - Tiempos, versión con proceso hijo:
    - build con SW: 5,1–5,4 s de reloj.
    - `nosw`: 4,4–4,5 s.
    - preview hasta escuchar: 0,82–0,90 s.
- [ ] 10. Actualizar el pnpm global para que deje de delegar del 10.4 al 11.9.
