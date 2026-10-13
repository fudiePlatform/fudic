# BUG-46 · El build espera a cosas que no necesita, y el preview carga TypeScript para nada

> **Estado:** `En curso` — arreglado en cinco fases y verificado por la sesión de tests; falta el
> cierre (ver [BUG-46-Task.md](./BUG-46-Task.md)). Redactado al final, por indicación de Pedro,
> el 2026-10-13.
> **Corrige:** [SDD-35](../SDD-35-compilo-o-no-compilo.md) §4.4 (el typecheck del build bloqueaba
> `buildStart`) · [SDD-19](../SDD-19-plugin-vite.md) (el plugin cargaba el typecheck al
> importarse) · las tres pasadas de compilación de [BUG-09](./BUG-09-frontera-servidor.md) y
> [SDD-27](../SDD-27-artefactos-y-manifiesto.md) (cada `.fud` se compilaba tres veces)
> **Paquetes:** `@fudic/vite` · `@fudic/typecheck`
> **Rango:** ninguno — no hay diagnóstico nuevo.

---

## 1. Síntoma

Pedro nota el pipeline cada vez más lento en `examples/basic`: `pnpm build` y `pnpm build:nosw`,
y sobre todo `pnpm preview` y `pnpm preview:nosw`.

Medido con la máquina en reposo, con `node node_modules/vite/bin/vite.js` directo (sin el coste
de pnpm), tres ejecuciones de cada:

| | Antes | Después |
|---|---|---|
| `build` (con SW), reloj | 7,3 – 8,4 s | 5,7 – 6,6 s |
| `build:nosw`, reloj | 5,5 – 7,5 s | 4,8 – 5,3 s |
| `preview`, hasta que escucha | 1,28 – 1,37 s | 0,82 – 1,19 s |

Una vez arrancado, el preview siempre fue rápido: cada petición tarda entre 2 y 15 ms, y en Chrome
el `load` llega entre 16 y 80 ms. La espera que se nota es el arranque, y lo que cuesta pnpm antes
de arrancar (ver §4).

## 2. Causa raíz

- **§2.1. El preview cargaba TypeScript.** `plugin.ts` importaba `createProjectChecker` de
  `@fudic/typecheck` en su cabecera, y `report.ts`, `typecheck.ts` y `dev-typecheck.ts` importaban
  de la misma entrada. Esa entrada carga `typescript` y Volar: unos 0,9 s de los ~1,3 s de
  arranque. `vite preview` carga el plugin y no comprueba nada.
- **§2.2. El typecheck bloqueaba el build.** `buildStart` ejecutaba el chequeo entero, entre 1,7
  y 2,2 s, antes de compilar nada. De lo que hace el bundle, lo único que depende de su veredicto
  es si el build puede terminar. Volar no era el problema: su parte suma 0,3–0,45 s. El resto es
  TypeScript, que importa su paquete, construye el programa (413 ficheros) y comprueba los tipos.
- **§2.3. Cada `.fud` se compilaba tres veces.** El bundle principal, el link pass y el edge pass
  pasaban el mismo fichero por `transformFud` y por Oxc, con los mismos argumentos.
- **§2.4. El grafo de cada ruta se resolvía una y otra vez.** `discoverComponents`,
  `routeHydrates`, `routeUsesDi` y `discoverReactiveRoutes` llamaban a `resolveDocument` cada vez
  que se les preguntaba. Lo hacían los coordinadores, los emits, `hydrateDeps`, FUD0742 y la
  búsqueda de nombres de cada pasada.
- **§2.5. Las dos pasadas anidadas iban en fila.** El link pass y el edge pass son dos builds
  independientes; ninguno lee la salida del otro.

## 3. Qué cambia

### 3.1. Una entrada ligera de typecheck — `@fudic/typecheck/problems`

Una entrada nueva que exporta lo que **lee** un informe, sin TypeScript ni Volar:
`compareProblems`, `hasErrors`, `formatProblem`, `locateProblem`, `relativePath`, `toPosix` y los
tipos del informe. El reporter y los resúmenes del plugin importan de aquí. `createProjectChecker`
se importa con `await import()`, solo donde se va a usar: `configureServer` en dev.
`startLiveCheck` recibe el checker como parámetro.

### 3.2. La memoria del build — `build-memory.ts`

`buildIo(io)` devuelve un `ResolveIo` con memoria por clave (`remember`). El plugin lo estrena en
cada `buildStart` de un build; dev se queda con la io plana, porque allí los ficheros cambian entre
peticiones. Viaja **dentro** de la io que ya reciben todas las pasadas, así que ninguna firma
crece. Encima de ella:

- `graphOf(path, io)`: el grafo de un documento, resuelto una vez por build.
- `compileFud(path, io, routeName, styles, assets)` (`compile.ts`): `transformFud` más el strip de
  Oxc, recordado bajo el fichero y el nombre de ruta. Las tres pasadas lo llaman, y cada una sigue
  reportando sus diagnósticos, que el reporter dice una sola vez.

### 3.3. El typecheck en su hilo — `background-check.ts`

`buildStart` lanza el chequeo en un `worker_thread` (`worker/check.mjs`) y sigue con el build. El
script es JavaScript plano, fuera de `src` a propósito: se carga por URL igual desde `src/` en los
tests que desde `dist/` publicado. Está en `files`.

Lo que no cambia para el autor:

- **El typecheck sigue hablando primero.** Todo lote de diagnósticos de `buildStart` y de
  `transform` pasa por `report`, que espera al veredicto si tiene algo que decir. Así la
  deduplicación de `rememberCheck` sigue valiendo, y un diagnóstico que ya dijo el typecheck no se
  repite. Un build sano no tiene nada que decir y no espera.
- **Falla antes de escribir nada.** `buildEnd` espera el veredicto antes del link pass, el edge
  pass y el prerender, y falla con `the typecheck failed: …` y la lista completa.
- Si el build ya falló por otra causa, `buildEnd` corta el hilo (`cancel`).

### 3.4. Link pass y edge pass a la vez

`generateBundle` los espera juntos (`Promise.all`).

## 4. Fuera de alcance

- **pnpm.** `pnpm --version` cuesta entre 1,1 y 1,6 s: un pnpm 10.4 global delega en el 11.9 del
  `packageManager`, y son dos arranques de Node antes de nada. Es del entorno de Pedro y se
  actualiza en el cierre, no en el código.
- `types: []` en el `tsconfig` del ejemplo. Saca `@types/node` del programa del typecheck
  (413 → 307 ficheros), pero el ahorro se queda en el ruido.
- Un error que Rollup lanza por su cuenta, como un import que no existe, no pasa por `report`.
  Entonces el build falla sin esperar al typecheck y no imprime sus problemas: es el caso en que
  `buildEnd` corta el hilo.

## 5. Efectos que conviene saber

- El bundle principal tarda más con el hilo al lado: entre 2,8 y 3,3 s, frente a 1,1 s antes. En
  una máquina de 4 núcleos el hilo del typecheck le quita CPU. Aun así el build termina antes,
  porque el veredicto llega antes de `buildEnd` en todas las mediciones y la espera es 0 ms.
- El chequeo en el hilo tarda entre 2,4 y 3,6 s, frente a 1,7–2,2 s en el principal: vuelve a
  cargar TypeScript y compite por CPU.

## 6. Criterios de aceptación

1. Importar `@fudic/vite` no carga `typescript` ni Volar. La entrada `/problems` no los alcanza
   en su grafo y la principal sí (`typecheck/test/problems.test.ts`,
   `vite/test/lazy-typecheck.test.ts`).
2. En un build, cada documento se resuelve una sola vez aunque se pregunte muchas. En dev se
   resuelve en cada pregunta, y un fichero guardado entre dos se ve
   (`vite/test/build-memory.test.ts`).
3. En un build con `sw.json`, `transformFud` se llama exactamente una vez por fichero y nombre de
   ruta, aunque lo pidan las tres pasadas (`vite/test/compile-once.test.ts`).
4. El typecheck no bloquea `buildStart`. Con errores de tipos, el build falla en `buildEnd` con
   `the typecheck failed: …`, imprime cada problema una vez y antes que ningún diagnóstico propio
   del build. Si el build falla por otra causa, el hilo se corta (`vite/test/plugin.test.ts`,
   `build-typecheck.test.ts`, `background-check.test.ts`).
5. El hilo y su `cancel()` no tumban un proceso Node normal: ni cortándolo al arrancar, ni con el
   addon nativo de Oxc cargado, ni con carga en la máquina. Medido fuera de vitest: 0 muertes en
   350 ejecuciones.
6. Los mapas de fuente de link, edge y prerender siguen bien, ahora que los tres builds reciben el
   mismo objeto (`build-sourcemaps*`, `build-page-maps`, `inputmaps`).
7. `pnpm typecheck`, `pnpm test` y `pnpm build` en verde. Los ficheros nuevos al 100 % en las
   cuatro métricas, y `@fudic/vite` sin bajar de su suelo (97,70 / 93,40 / 97,94 / 97,70).
