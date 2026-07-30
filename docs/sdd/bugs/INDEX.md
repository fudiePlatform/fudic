# Índice de BUG — defectos con spec propia

> **Qué es esto.** Un defecto que sobrevive a la revisión de un SDD no se arregla con un
> parche: se especifica. Cada BUG de esta carpeta es un documento del mismo rango que un
> SDD —causa raíz, contrato, comportamiento corregido, criterios de aceptación— más su
> fichero de **tareas**, que es el que se marca mientras se implementa.
>
> El par es siempre `BUG-NN-<slug>.md` + `BUG-NN-Task.md`, exactamente como
> `SDD-23-emisor-ts-virtual.md` + `SDD-23-Task.md`.

---

## Convenciones

### Estados

Los mismos que un SDD: `Pendiente` · `Listo` · `En curso` · `Hecho` · `Bloqueado`.
Un BUG llega a `Listo` cuando su causa raíz está **confirmada sobre el código**, con
fichero y línea, no cuando se ha descrito el síntoma.

### Formato de cada BUG

Las siete secciones del SDD, reinterpretadas para un defecto:

1. **Contexto y síntoma** — qué se observa, dónde, y cómo reproducirlo.
2. **Causa raíz** — el mecanismo, anclado a fichero y línea. Con el *alcance*: qué otros
   sitios comparten la misma causa.
3. **Interfaz pública** — las firmas que cambian. Es el contrato; si no cambia ninguna, se
   dice explícitamente.
4. **Comportamiento corregido** — las reglas nuevas, no el diff.
5. **Invariantes** — los del proyecto que el bug violaba, y los que la corrección añade.
6. **Criterios de aceptación** — la batería de tests que define "arreglado". Un BUG **no**
   se cierra sin al menos un test que falle antes del cambio.
7. **Fuera de alcance** — qué NO tocar, para que la corrección no se convierta en rediseño.

### Reglas

- **Un test que falla primero.** El criterio de aceptación se escribe contra el código
  roto y se ve fallar. Un fix sin ese test es una conjetura verificada por inspección.
- **La causa raíz es una línea, no un fichero.** Si no se puede señalar, el BUG sigue en
  `Pendiente`.
- **El alcance es obligatorio.** Todo defecto que aparece una vez aparece en los sitios
  que comparten su causa; enumerarlos es parte del diagnóstico, no del arreglo.
- **Un BUG no invade a otro.** Vale el *Fuera de alcance* (§7) igual que entre SDD, y con
  más motivo: tres bugs del mismo subsistema tienden a fundirse en una refactorización
  que ya no se puede revisar.
- **Códigos de diagnóstico.** Un BUG reutiliza el rango `FUD` del SDD que corrige; si
  necesita uno nuevo, lo reserva ahí y lo anota en SDD-12.

---

## Tabla maestra

| BUG | Título | SDD que corrige | Paquetes | Estado |
|---|---|---|---|---|
| [BUG-01](./BUG-01-shell-sin-politica.md) | El shell precacheado nunca se sirve desde caché | SDD-20 §4.6.1, §4.7 | `transport` · `vite` | `Hecho` |
| [BUG-02](./BUG-02-html-por-ruta.md) | El router cachea HTML por ruta en lugar de renderizar | SDD-20 §4.2, §4.4, §4.6 | `transport` · `vite` | `Hecho` |
| [BUG-03](./BUG-03-chunks-compartidos-sw.md) | Chunk servido desde caché y pedido a red a la vez | SDD-20 §4.1, §4.10 | `vite` | `Hecho` |
| [BUG-04](./BUG-04-clave-de-cache.md) | La clave de la caché no es la URL, y nadie lo había dicho | SDD-20 §4.6.3, §4.7, §4.10 | `transport` · `vite` | `Hecho` |
| [BUG-05](./BUG-05-sourcemaps-builds-anidados.md) | El Service Worker y los chunks enlazables se emiten sin source map | SDD-19 §4.6 · SDD-20 §4.1, §4.3 | `vite` | `Hecho` |
| [BUG-06](./BUG-06-minify-no-heredado.md) | Los builds anidados ignoran el `build.minify` del host | SDD-20 §4.1, §4.3 · BUG-03 §7 | `vite` | `Listo` |
| [BUG-07](./BUG-07-html-sin-minificar.md) | Ningún HTML emitido pasa por minificación | SDD-19 §4.4 | `compiler` | `Listo` |
| [BUG-08](./BUG-08-css-verbatim.md) | El CSS de componente nunca se minifica, en ninguna salida | SDD-15 · SDD-09 | `compiler` | `Listo` |
| [BUG-09](./BUG-09-frontera-servidor.md) | El código y el fuente de `@server` se publican al cliente | SDD-19 §4.3, §4.6 · SDD-20 §4.5 | `vite` · `compiler` | `Listo` |

## Grafo de dependencias

```
BUG-03  (independiente: es de bundling)
BUG-01  ──┐
          ├──▶ ambos tocan el `fetch` handler del router; BUG-01 primero,
BUG-02  ──┘    porque BUG-02 reescribe la rama de navegación que BUG-01 no toca.
   │
   └──▶ BUG-04  destapado por BUG-01: hasta que el shell tuvo un lector, su caché
                era de solo escritura y el defecto de clave no era observable.

BUG-05  ──▶ BUG-06   la misma causa (`configFile: false` sin nada reenviado) y las
                     mismas dos funciones. BUG-05 crea `NestedOutputOptions`; BUG-06
                     le añade un campo. Al revés, BUG-06 minifica un código cuyo mapa
                     todavía no existe y nadie puede comprobar que sigue siendo válido.

BUG-07 ──┬─ los dos son minificación propia en el emit del compilador y no tocan
BUG-08 ──┘  `@fudic/vite`: pueden ir en paralelo a BUG-05/06, o entre ellos.

BUG-09  destapado por BUG-05: los mapas del ejemplo hicieron visible que el `.fud`
        viaja entero en `sourcesContent` — y al mirar, que el wrapper del edge ya
        publicaba el CÓDIGO de `@server` desde mucho antes. Va primero: es el
        único de la tanda que es un problema de seguridad y no de tamaño.
```

`BUG-03` puede ir en paralelo en su propio worktree: no comparte ni un fichero con los
otros dos. `BUG-04` toca `store.ts`, que los otros tres no tocan, pero **cambia una interfaz
pública que el router consume**: no vale paralelizarlo con BUG-01/BUG-02.

La tanda BUG-05…BUG-08 sale del diagnóstico de la salida del build del 2026-07-30 y comparte
un invariante: **todo lo que sale del build sale minificado y con su mapa.** Los cuatro son
la misma frase incumplida por cuatro vías. `BUG-05` y `BUG-06` van en el mismo worktree y en
ese orden, porque tocan las mismas líneas de `swbuild.ts` y `link.ts`. `BUG-07` y `BUG-08`
viven en el emit del compilador y pueden ir en paralelo.

La minificación de HTML y CSS es **propia, en el emit**, no una dependencia ni una pasada
post-emit: en el emit está el AST, y un minificador de texto tiene que adivinar por
heurística lo que aquí ya está parseado — empezando por que un tag desconocido es un custom
element y es `display: inline`, que es donde falla toda herramienta externa.

## Registro de progreso

| Fecha | BUG | Qué aterrizó |
|---|---|---|
| 2026-07-29 | — | Carpeta creada; los tres BUG del diagnóstico del Service Worker escritos y en `Listo`. |
| 2026-07-30 | BUG-01 | Shell con política: `RouterStores.shell`, identidad antes que clase en `handleResource`, el bootstrap cablea lo que precachea, y `FUD0391` deja de ser decorativo (validado contra el bundle y `publicDir`). |
| 2026-07-30 | BUG-02 | `html` fuera de `RouteRecord`; el link pass y el manifest alcanzan a las `ssg` vía `isLinkable`; `warm` solo calienta chunks; la clave de `pages` es la URL de navegación; el nonce se aplica al servir con `applyNonceStream`. |
| 2026-07-30 | BUG-03 | El Service Worker es un bundle autocontenido (`swbuild.ts`), emitido como asset; el build id hashea su **código** y `BUILD_TOKEN` se sustituye antes de emitir; URL literal en el bootstrap main. `dist/fudic-sw.js`: 8,01 → 30,80 kB, cero imports. |
| 2026-07-30 | — | Arnés Playwright en `examples/basic` (`playwright.config.ts`, `tests/traffic.ts`, `tests/sw-network.spec.ts`): traza de quién sirve qué por carga, y volcado de Cache Storage **con las claves**. Es lo que hizo visible BUG-04. |
| 2026-07-30 | BUG-04 | Clave de caché = URL, impuesto por el tipo (`put`/`match`/`delete` toman `string`); `ignoreVary` en toda lectura, `loadManifest` incluido; `put` best-effort (un `206` o una cuota agotada ya no tumban la respuesta); el `install` escribe por el `Store` con `cache: 'reload'`. |
| 2026-07-30 | — | `scripts/sw-check.mjs` retirado: sus escenarios viven ahora en `tests/sw-render.spec.ts`, menos «a warm prerendered page is served from the SW cache», que afirmaba el comportamiento que BUG-02 corrige. 16 tests E2E en verde, arranque sin red incluido. |
| 2026-07-30 | — | Cobertura: `store.ts` y `csp.ts` al 100 % en las cuatro métricas con umbral por fichero; `swbuild.ts` nace al 100 %. Ramas: `router.ts` 80,3 → 93,0; `plugin.ts` 69,8 → 75,2; `link.ts` 62,5 → 68,8. De paso, los umbrales al 100 de `manifest.ts` y `linker.ts` —que ya fallaban en `main`— vuelven a cumplirse. |
| 2026-07-30 | BUG-05…08 | Diagnóstico de la **salida del build**, tras verificar que los cuatro BUG anteriores estaban en `main`. Cuatro defectos con la misma raíz —lo que el usuario configura no llega a lo que el plugin emite—: sin source maps en los dos builds anidados (BUG-05), `minify: false` a mano en esos mismos dos sitios (BUG-06), ningún HTML minificado (BUG-07) y el CSS verbatim dentro de un template literal, invisible para cualquier minificador de JS (BUG-08). Medido, no supuesto: `vite build --sourcemap` produce mapas para todo el grafo de cliente y cero para `fudic-sw.js` y `sw/c/*.js`; el polyfill inline es el **31 %** de cada página; y colapsar el whitespace del markup solo paga **1,6 % gzip**, que es lo que degrada BUG-07 a la última prioridad. |
| 2026-07-30 | BUG-05 | Los dos builds anidados heredan `build.sourcemap` por `NestedOutputOptions` y emiten su `.map` como asset hermano, con `emitPlan` componiendo los cuatro modos del host. El link pass deja de descartar el mapa del `.fud` (`link.ts:95` devolvía solo `code`): un `sw/c/*.js.map` resuelve ahora a `routes/about.fud`, y `fudic-sw.js.map` al `dist` de transport. `BUILD_TOKEN` pasa de 15 a 8 caracteres —la longitud del build id— para que su sustitución preserve offsets; el criterio §6.4 de BUG-03 sigue intacto, 8 hexadecimales. `materializeBundle` escribe los mapas en el temp del prerender. `swbuild.ts` y `nested.ts` al 100 % en las cuatro métricas; ramas: `link.ts` 68,8 → 72,2; `plugin.ts` 75,2 → 75,5. Llegar al `.ts` de transport exigiría cargar el `.js.map` de cada entrada del build anidado: medido y dejado fuera de alcance. |
