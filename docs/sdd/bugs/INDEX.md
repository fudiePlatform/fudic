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
| [BUG-06](./BUG-06-minify-no-heredado.md) | Los builds anidados ignoran el `build.minify` del host | SDD-20 §4.1, §4.3 · BUG-03 §7 | `vite` | `Hecho` |
| [BUG-07](./BUG-07-html-sin-minificar.md) | Ningún HTML emitido pasa por minificación | SDD-19 §4.4 | `compiler` | `Hecho` |
| [BUG-08](./BUG-08-css-verbatim.md) | El CSS de componente nunca se minifica, en ninguna salida | SDD-15 · SDD-09 | `compiler` | `Hecho` |
| [BUG-09](./BUG-09-frontera-servidor.md) | El código y el fuente de `@server` se publican al cliente | SDD-19 §4.3, §4.6 · SDD-20 §4.5 | `vite` · `compiler` | `Hecho` |
| [BUG-10](./BUG-10-url-de-dev-sin-resolver.md) | Las URL de dev solo existen para el middleware | SDD-19 §4.10 · SDD-20 §4.11 | `vite` | `Hecho` |
| [BUG-11](./BUG-11-slot-como-prop.md) | `slot=` viaja en el literal de props, y con él todo atributo global | SDD-23 §4.4, §7 | `language-core` | `Hecho` |
| [BUG-15](./BUG-15-clases-sin-completado.md) | El completado se detiene en el `:` de `class:` | SDD-24 §3.2, §4.2 · SDD-28 §4.3, §5.5 | `language-server` | `Listo` |

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

BUG-10  (independiente: es el único que solo existe en DEV — los nueve anteriores
        son de la salida del build, y ninguno toca `resolveId`.)

BUG-11  (independiente de los diez anteriores: es el primero del EDITOR. No toca
        `@fudic/vite` ni el emit del compilador; vive entero en la proyección de
        SDD-23, que ninguno de los otros roza.)

BUG-15  del editor también, y hermano de BUG-11 por la causa —una directiva cuyo
        NOMBRE la proyección tira—, pero no por la corrección: el de la ranura
        pertenece a otro fichero y necesitaba un tipo; el de la clase está en el
        `<style>` de este, y lo contesta el servidor sin tocar `language-core`.
        Paralelizable: no comparte ni un fichero con ningún BUG abierto.
```

> Los números **12-14** están reservados por trabajo en curso en otros worktrees; la serie de
> esta rama continúa en 15.

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
| 2026-07-31 | BUG-09 | Frontera de servidor. **Qué se publicaba y desde cuándo:** el wrapper del edge se emitía como chunk del build de cliente desde que existe el plugin, así que `load` y todo lo que `@server` importara salían bajo `/assets/` —en `examples/basic`, `data/posts.ts` entero y en claro—, anunciados por el campo `esm` del manifest y servidos por cualquier host estático; y desde que hay mapas, el `.fud` completo viajaba dentro de `sourcesContent`. Ahora: `runEdgePass` es un tercer build anidado que escribe en `.fudic/edge/`, fuera de `outDir`; el manifest no publica `esm` y la preview resuelve por convención; `redactServerRegions` deja en blanco las regiones `@server` carácter a carácter para no mover los `mappings`. El wrapper de cliente se queda con `withLoad: false` —quitarlo del todo dejaba los `<img>` apuntando a ficheros que el build ya no producía—. `edge.ts` y `redact.ts` nacen al 100 % en las cuatro métricas; ramas de `plugin.ts` 75,5 → 77,1. |
| 2026-07-31 | BUG-06 | Los builds anidados heredan `build.minify` por `NestedOutputOptions`: fuera los dos `minify: false` de andamiaje (`swbuild.ts`, `link.ts`) y `configResolved` captura la opción junto a `sourcemap`. **Medición** (`examples/basic`, `minify` por defecto): `dist/fudic-sw.js` **31,77 → 11,31 kB** (−64 %); los siete `sw/c/*.js` **38,62 → 27,50 kB** (−29 %) — bajan menos porque el CSS y el polyfill inline viajan dentro de template literals, donde ningún minificador de JS entra (BUG-07, BUG-08); los ocho juntos, 70,39 → 38,82 kB. El criterio que justifica el BUG no es el tamaño sino §6.2: un chunk **minificado** se pasa por `createLinker` de `@fudic/transport`, se ejecuta y rinde **byte a byte el mismo HTML** que sin minificar. Dos hallazgos: oxc re-comilla los literales, así que el build id aterriza como `` `d4452e96` `` y no `"d4452e96"` —la aserción de BUG-03 §6.4 asumía comillas dobles—, y la señal de «esto está minificado» tiene que ser el **tamaño**, no un patrón, por esos mismos template literals. El edge pass (BUG-09) es el único anidado que **no** hereda, y ahora lo dice por escrito: no se publica, lo lee Node, y minificarlo solo destruiría la traza de un `@server load` que falle en el prerender. Cobertura de `src` sin cambio (`swbuild.ts` 100 %; ramas `link.ts` 72,2 y `plugin.ts` 77,1, idénticas a `main`). |
| 2026-07-31 | BUG-07 | Todo el HTML sale minificado **desde el emit**, no por una pasada posterior: el esqueleto sin `\n` ni indentación (§4.2, y estaba en tres sitios de `parts.ts` además del esqueleto), el polyfill incrustado en su forma minificada (§4.3, `polyfill.min.ts` generado por `scripts/minify-polyfill.ts` y commiteado, porque `oxc-minify` es devDependency y no puede entrar en el grafo de runtime del compilador; lo que impide que quede rancio es `minify.test.ts`, que re-minifica y compara), y el markup colapsado sobre el AST con `space.ts` —`spaceModeOf` / `nestedSpaceMode` / `collapseSpace`, el modo como **pila** en `MarkupEmitter` porque `white-space` se hereda, y `data-fud-space="preserve"` para el caso que cruza el shadow boundary—. **Medición** (`examples/basic`, los cinco `.html`, raw → raw · gzip → gzip): `index.html` 7.026 → 5.792 B · 2.483 → 2.293 B (−17,6 % · −7,7 %); `about/` 4.830 → 3.848 · 2.140 → 1.964; `blog/declarative-shadow-dom/` 4.793 → 3.794 · 2.045 → 1.875; `blog/routing-por-fichero/` 4.728 → 3.729 · 2.042 → 1.871; `blog/ssg-estatico-e-incremental/` 4.754 → 3.755 · 2.040 → 1.869. Los cinco juntos: **26.131 → 20.918 B (−20,0 %) raw, 10.750 → 9.872 B (−8,2 %) gzip.** Que el gzip pague la mitad que el raw es el argumento entero del BUG: la indentación repetida ya se la comía el compresor, y lo que de verdad pesaba era el polyfill. **Nada se rompió:** nodos de texto del `<body>` 88 / 51 / 33 / 33 / 33, idénticos en los dos builds, y el árbol serializado con cada tirada normalizada coincide carácter a carácter; 16/16 E2E en verde. §6.8 **retirado**: Lighthouse 12.8.2 puntúa 1 en `unminified-javascript` y compañía **antes y después**, con score global 100 en ambas — la auditoría nunca marcó esto, y las dos ejecuciones sí vieron builds distintos, así que no es que no distinga. `space.ts` y `polyfill.min.ts` nacen al 100 % en las cuatro métricas y `module.ts` queda también al 100/100/100/100; ramas del paquete 95,6 → 95,7. |
| 2026-07-31 | BUG-08 | El CSS del componente sale del **AST**, compactado. `componentCss` dejó de hacer `source.slice(...)` y recorre el `StyleNode` que el parser ya había construido: era el único sitio del emit que volvía al texto fuente teniendo el nodo delante, y costaba el whitespace entero del CSS en las tres salidas, porque un minificador de JS no entra en un template literal. El recorrido es completo por construcción —las partes tapizan el span sin huecos ni solapes— y compacta **solo** `CssText`; `RazorExpression`, `AtEscapeNode` y `RazorCommentNode` salen verbatim, y **nunca** se compacta entre dos partes: `padding: @(size)rem @(size * 2)rem` conserva byte a byte las dos expresiones y el espacio que las separa. `css-compact.ts` se salta tres cosas donde «colapsa el whitespace» deja de ser obvio —comentarios (§4.3, y con ellos un `/*! license */`), strings, cuyo espacio lo renderiza la página, y un `/` que no abre ninguno de los dos— y sus dos reglas de puntuación **no son simétricas**: el espacio de después del `:` se va y el de antes se queda, porque `a :hover` y `a:hover` son reglas distintas y el byte no lo vale (§4.1 pedía ambos; anotado como desviación deliberada). **Medición** (`examples/basic`): los tres `<style>` de `dist/index.html` **1.205 → 887 B** (−26,4 %; 302/456/447 → 213/340/334) y el documento **5.772 → 5.454 B**; chunks enlazables `sw/c/`: `app-badge` 1,09 → 0,98 kB, `app-card` 1,68 → 1,57 kB, `site-nav` 2,80 → 2,71 kB. **Nada cambió a la vista:** las seis páginas prerenderizadas capturadas con Playwright antes y después son **idénticas byte a byte**, y 16/16 E2E en verde. El criterio §6.5 es un oráculo independiente: happy-dom como **librería** (no como entorno de test — el compilador corre en Node y su `lib` no lleva DOM a propósito) parsea las dos hojas y compara lo que construyó; su punto ciego es el CSS anidado, así que la regla anidada de `app-card` se afirma aparte. Los source maps no se degradan y el test dice por qué no pueden: **no hay ancla de emit** para una interpolación de CSS —`export const css` es una línea—, lo que resuelve una posición de vuelta al `.fud` es el span del `RazorExpression`, y por eso esas partes salen verbatim. `css-compact.ts` nace al **100 %** en las cuatro métricas y `module.ts` sigue al 100/100/100/100; ramas del paquete 95,7 → 95,77. **Hallazgo preexistente, fuera de alcance:** `AssetLinker.cssTemplate` captura el specifier con `[^'")]+`, que es codicioso, así que `url( ./bg.png )` con espacios produce `import … from "./bg.png "`. No lo causa este BUG (el slice verbatim daba lo mismo) y no lo arregla: candidato a BUG propio. |
| 2026-08-01 | BUG-10 | Las dos URL estables de dev las conoce también el `resolveId`, y no solo el middleware. El síntoma era una línea de `Pre-transform error: Failed to load url /fudic-main.js` en cada arranque de `examples/basic` **con la aplicación funcionando**: el navegador pide esa URL por el middleware, pero `transformIndexHtml` —que hace falta, es quien inyecta el cliente de HMR— precalienta cada `<script type="module" src>` que ve, y un warmup entra directo al pipeline de módulos sin pasar por connect. Ahí `/fudic-main.js` no lo resolvía nadie. Ahora un `DEV_SCRIPT_IDS` único traduce las dos URL —`/fudic-sw.js` compartía la causa y no se manifestaba solo porque un Service Worker se registra pasando un string, no importándolo— y `resolveId` lo consulta bajo `isDev`, normalizando el `base` con `pathnameOf` porque el middleware ve la URL **con** base y el warmup **sin** él. **Cero bytes de diferencia en la salida**, y esa es la razón de escribirlo: el coste de dejarlo era enseñar a ignorar el único canal por donde saldría un fallo real del bootstrap. Verificado en los dos sentidos sobre `examples/basic` —la línea aparece con el código de `main` y desaparece con el arreglo— y con `transformRequest('/fudic-main.js')`, que fallaba con ese mismo mensaje literal. Cobertura de `@fudic/vite` sin cambio; el primer BUG de la carpeta que es de **dev** y no de la salida del build. |
| 2026-08-03 | BUG-11 | Escrito y en `Listo` desde el backlog de uso. **Primer BUG del editor**, y el único de la carpeta cuya causa raíz tiene dos mitades: `emitProps` mete en el literal de props todo binding `attr`/`property` —así que `slot`, y con él `id`, `part`, `exportparts`, `role`, `lang`, `dir`, `title`, `tabindex`, `data-*`, `aria-*` y un `class`/`style` estáticos, dan `TS2353` sobre cualquier componente— y, aunque saliera del literal, `<slot name>` proyecta `$slot()` sin su nombre, así que no habría nada contra lo que comprobarlo. Reproducible en el ejemplo del propio repositorio (`examples/basic/routes/blog/index.fud:48`). El contrato se **midió con `tsc` antes de escribir emisor**: `$attrs<T>(a: T & $GlobalAttrs)` acepta los globales sin una sola rama nueva y conserva `TS2561` *con la sugerencia* del nombre mal escrito, que era el riesgo real de la intersección; `$intoSlot<$S0>('meta')` contra un `export type $Slots` copiado desde el span da `TS2345` con los nombres válidos, F12 al `<slot>` y completado, por la misma mecánica con la que `$Sections` ya funciona. «Sin slots, sin hijos» queda fuera: pide un `$children<T>()` sin precedente. |
| 2026-08-04 | BUG-11 | Implementado. Los atributos globales se aceptan **por tipos**: `$GlobalAttrs` en `GLOBALS_DTS` y `$attrs<T>(a: T & $GlobalAttrs)`, sin una sola rama nueva en el emisor. `slot` sale del literal y se comprueba con `$intoSlot<$S0>('meta')` contra un `export type $Slots` que copia cada `name` desde su span (F12 al `<slot>` gratis); `$Props` y `$Slots` viajan en un solo `import type` con el mismo contador, y un tag sin `<link>` **no** recibe `$intoSlot` —ya falla con `TS2304` y un segundo error sobre el mismo tag no dice nada nuevo—. Dos correcciones sobre lo escrito en el documento: (a) el `TS2345` nombra el **alias**, no expande la unión, exactamente como `$Sections` lleva haciendo desde SDD-23 —los nombres válidos los da el completado, no el texto del error—; (b) `$Slots` se exporta **siempre**, `never` incluido, porque un consumidor importa el símbolo de lo que enlaza y un export ausente sería `TS2305` sobre andamiaje. **Hallazgo colateral, arreglado aquí porque este cambio lo destapó:** el ancla de completado se emitía como UN tramo sobre toda el área de atributos, así que también cubría los **valores** — una posición dentro de `tone="@(|)"` mapeaba al ancla y a la interpolación, y Volar contesta con la primera posición mapeada que devuelve algo. Mientras el literal no ofrecía claves ahí el ancla volvía vacía y ganaba la interpolación; en cuanto `$GlobalAttrs` le dio once nombres que ofrecer, la unión de `tone` dejó de ser alcanzable y cayó el criterio §6.3 de SDD-24. Ahora se emite **un ancla por hueco** del tag —antes del primer atributo, entre dos, y tras el último—, que es lo que el ancla decía ser. 138 tests en `language-core`, 100/100/100/100. |
| 2026-08-05 | BUG-15 | Escrito y en `Listo` desde el backlog de uso. Segundo BUG del editor, y **la misma causa que BUG-11 §2.3 en otra directiva**: `class:success` proyecta `$cls(cond)` y el nombre no viaja (`language-core/src/template/attrs.ts:221-225`), así que en `class:|` no hay contra qué contestar — y tampoco quién pregunte, porque `completions()` no tiene contexto de posición de atributo y `wordContextAt` se aparta a propósito ahí (`position.ts:123`). La corrección **no** es la de BUG-11: el nombre de una ranura pertenece a otro fichero y por eso tenía que ser un tipo; el de una clase está en el `<style>` de este, ya parseado como `StyleNode` desde SDD-09, y lo contesta el servidor sin tocar `language-core` ni añadir un solo `FUD`. El escáner se apoya en una regla única —un `.nombre` cuenta **solo en preludio de selector**— con la que caen solos `0.18rem`, `content: ".foo"` y `url(a.png)` sin una guarda por caso, y sobreviven `.badge.success`, las reglas anidadas de la decisión 42.e y `@scope (.card)`. La lista queda **abierta**: una clase global se escribe igual y no da diagnóstico, porque ofrecer no es validar. `style:` y `bus:` comparten la causa y quedan fuera: sus nombres no salen de este fichero. |
