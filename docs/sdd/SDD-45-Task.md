# SDD-45 — Tareas

> **SDD:** [SDD-45 — El runtime se publica, no se empaqueta](./SDD-45-runtime-publicado.md)
> **Paquetes:** `@fudic/core` · `@fudic/dom` · `@fudic/forms` · `@fudic/di` ·
> `@fudic/conventions` · `@fudic/vite` · `@fudic/transport` · `@fudic/ssr` ·
> `@fudic/example-basic` · `examples/workspace`
> **Rama:** `sdd-45-runtime-publicado`
> **Progreso:** 0 / 18
> **Bloqueado por:** [SDD-43](./SDD-43-librerias.md) — la tarea 11 de aquel SDD es el
> `peerDependencies` que aquí se endurece, y su criterio 12 es el workspace sobre el que se
> mide la evidencia de este. **Va después de la 44**, que es donde acaba la tanda.

Dieciocho tareas, y **es una sola iteración**: no se cierra por fases sueltas ni deja nada
anotado para otro documento. El orden manda en dos puntos.

**El primero es la tarea 2**, antes que todas las demás. Si los paquetes de runtime no
producen bytes idénticos entre dos construcciones, no hay nada que compartir y el resto del
SDD no tiene sentido — es la propiedad sobre la que se apoya todo, y se afirma con un test
antes de escribir el enlazador.

**El segundo es la fase 4.** `main` son 8 405 de los 11 233 bytes en juego, y mientras lleve
el `base` y el build id compilados dentro no se puede compartir por mucho que se mueva de
ruta (§1.2 b). Si esa fase se quedara a medias, el SDD ahorraría 2 828 bytes por aplicación
en vez de 11 233 y la evidencia de la tarea 17 no pasaría.

---

## Mapa de dependencias

```
1 el directorio ──→ 2 LOS BYTES SON LOS MISMOS ──→ 3 publicar unidades ──→ 5 enlazar ──→ 6 copiar
                                        │                    │                             │
                                        └→ 4 publicar main/ssr ┘            7 la poda ──────┤
                                                     │                                      │
                    8 MAIN SIN BASE NI BUILD ←───────┘                     11 dos apps ─────┤
                            │                                              12 dos versiones ┤
                            ├→ 9 buildTree dinámico                        13 FUD0800 ──────┤
                            └→ 10 sin sw no hay boot                                        │
                                                                                            │
        14 la caché compartida ──→ 15 el worker enlaza ssr y di ───────────────────────────┤
                                                                                            │
        16 el índice de instancias ─────────────────────────────────────────────────────────┤
                                                                                            │
                                                              17 la evidencia ──→ 18 cierre ┘
```

---

## Fase 1 — la propiedad de la que cuelga todo (2)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [ ] | 1 | — | **Los nombres que dos paquetes tienen que acordar.** `RUNTIME_DIR = '_fudic'`, `runtimeCacheName(version)` y `RUNTIME_ATTRS` en `@fudic/conventions`, que es donde caben por su propia regla: nombres que el que publica y el que enlaza deben compartir y ninguno posee. `_fudic` empieza por `_` para que ninguna ruta de aplicación pueda colisionar; la caché **no lleva `app`** y eso es deliberado (§4.8) | `conventions` | `src/index.ts` |
| [ ] | 2 | 1 | **(rojo primero)** **Los bytes no dependen de quién construya.** Construir un paquete de runtime dos veces produce ficheros **idénticos byte a byte**. Es el criterio 2 y es la condición de existencia del SDD: si esto no se sostiene, compartir es imposible por mucho que la URL coincida. Se escribe antes que el publicador y se ve fallar si el build arrastra fechas, rutas absolutas o cualquier cosa del entorno | `core` | `test/reproducible.test.ts` |

---

## Fase 2 — publicar (2)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [ ] | 3 | 2 | **Los cuatro paquetes publican su runtime.** Además del `dist` que consume un bundler, un directorio `runtime/` con **una unidad por módulo público**, minificada, importándose entre ellas por ruta relativa. `@fudic/core`, `@fudic/dom`, `@fudic/forms` y `@fudic/di`. La frontera no se inventa: es la que el build ya produce hoy (§1.3). Criterio 1 | `core` · `dom` · `forms` · `di` | `tsconfig.runtime.json` · `scripts/` |
| [ ] | 4 | 3 | **`@fudic/vite` publica `main.js` y `ssr.js`.** Dos unidades más por el mismo camino y con la misma regla de bytes reproducibles, porque son framework y no aplicación: el arranque de hidratación (§4.9) y el reexport de `@fudic/ssr` que el worker enlazará (§4.7). Que el publicador sea `vite` y no `core` es lo que son: `main` lo escribe hoy `emitMainBootstrap` | `vite` | `runtime/` · `scripts/` |

---

## Fase 3 — enlazar (3)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [ ] | 5 | 4 | **(rojo primero)** **El plugin enlaza en vez de empaquetar.** Los imports de `@fudic/core` y hermanos dejan de entrar en el bundle y se reescriben a `/_fudic/<version>/<unidad>.js`, con la versión del `package.json` resuelto y **sin** el `base` de la app. El autor sigue escribiendo `@fudic/core` y esa es la única superficie que ve (§4.1). Se ve fallar antes: hoy emite `assets/signal-<build>.js`. Criterios 3, 4 | `vite` | `src/runtime-link.ts` · `src/plugin.ts` |
| [ ] | 6 | 5 | **Copiar al `dist` lo que se enlaza, y solo eso.** Un `dist` sigue siendo un árbol completo y desplegable solo — es lo que permite desplegar dos apps por separado y en cualquier orden. Y `FUD0802`: si el destino ya tiene esa unidad con bytes distintos, se avisa, porque significa que alguien publicó dos veces la misma versión con contenido distinto | `vite` | `src/runtime-link.ts` |
| [ ] | 7 | 6 | **La poda se conserva, y se mide.** Una app que no usa signals derivadas no emite `computed.js`. Se cuenta sobre el `dist`, no se razona. Compartir no puede costarle a la app pequeña llevarse lo de la grande. Criterio 5 | `vite` | `test/runtime-prune.test.ts` |

---

## Fase 4 — `main` deja de ser de la aplicación (3)

> Los 8 405 bytes que §1.2(b) explica por qué no se comparten hoy. Es la fase que corrige la
> afirmación falsa del documento original, y sin ella el SDD entrega la cuarta parte de lo
> que promete.

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [ ] | 8 | 5 | **(rojo primero)** **`base` y build id salen de `main`.** Pasan a `data-fud-base`, `data-fud-build` y `data-fud-sw` en el propio `<script>`, y con ellos el canal de warm deja de ser una rama de emit. `main` se sirve de `/_fudic/<version>/main.js` y deja de nombrarse por build. Se ve fallar antes: hoy dos `base` distintos producen dos ficheros distintos. Criterios 10, 11 | `vite` | `src/bootstrap.ts` · `src/wrapper.ts` · `core/src/hydrate/install.ts` |
| [ ] | 9 | 8 | **`buildTree` por `import()` dinámico.** El único import que se vuelve dinámico, y solo porque su sitio ya es asíncrono y ya comprueba el hecho: el IIFE de DI sale antes si la página no publica `fud-ioc`. Una página sin DI deja de pedir `di/page`; una con DI levanta el árbol igual y los tests de SDD-38 siguen verdes sin tocarlos. Criterio 12 | `vite` | `src/bootstrap.ts` |
| [ ] | 10 | 8 | **Sin `sw.json` no hay `boot`.** Ni el fichero ni la etiqueta. Hoy se emite un módulo cuyo contenido entero es `export {};` y toda página escribe el `<script>` que lo pide: una petición HTTP por página para nada. La condición ya se evalúa para decidir el contenido; sube un escalón, a la etiqueta. Criterio 13 | `vite` | `src/plugin.ts` · `src/wrapper.ts` |

---

## Fase 5 — lo que el enlace compra (3)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [ ] | 11 | 7 | **Dos apps, una descarga.** El caso de §4.4, que es el que motiva el SDD entero: un build con `signal` y otro con `signal` y `computed` producen el **mismo** `signal.js` byte a byte, y solo el segundo produce `computed.js`. Criterio 6 | `vite` | `test/runtime-share.test.ts` |
| [ ] | 12 | 7 | **Dos versiones conviven.** Dos directorios, ninguno pisa al otro, y la versión se **lee** en la URL sin traducir nada. Criterio 7 | `vite` | `test/runtime-versions.test.ts` |
| [ ] | 13 | 7 | **`FUD0800`: la librería manda.** El rango de `peerDependencies` de una librería del grafo que no incluye la versión resuelta **rompe el build**, con la librería, su rango y la versión en el mensaje. Sube de warning a error respecto a SDD-43 §4.7, y el motivo está en §4.6: desde que las versiones mezcladas son una promesa, un aviso describe algo que rompe tarde. `FUD0762` queda anotado como superado. Criterio 8 | `vite` | `src/peer-check.ts` |

---

## Fase 6 — el worker y la caché compartida (2)

> `@fudic/transport` **se queda dentro del worker** y no se discute: es quien abre la caché,
> quien tiene el `Store` y quien tiene el linker (§4.7). Lo que sale es lo que el worker ya
> sabe traerse solo.

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [ ] | 14 | 6 | **La caché de origen, y el test que la protege.** Todo `/_fudic/<version>/*` va a `fudic-runtime-<version>`, sin `app` en el nombre. Que el purgado no la toque **ya es cierto** —`isStaleCache` solo reconoce `shell-`/`routes-`/`pages-`/`data-`—, así que lo que se escribe es el test que lo fija, no la lógica: si alguien cambia ese predicado, dos apps vuelven a borrarse el runtime. Criterio 16 | `transport` | `src/store.ts` · `test/store.test.ts` |
| [ ] | 15 | 14, 4 | **El worker enlaza `ssr` y `di` en vez de empaquetarlos.** Se piden a `/_fudic/<version>/` por el `Store` de la caché compartida, se enlazan con el `createLinker` que el worker ya tiene y entran en `builtins` igual que ahora — el camino por el que ya trae los chunks de ruta, que es el que BUG-03 **no** prohíbe. Dentro de `build()`, donde ya se espera al manifiesto. `canLink()` sigue siendo el valor de seguridad. Criterios 14, 15 | `vite` · `transport` | `src/bootstrap.ts` (`emitSwBootstrap`) |

---

## Fase 7 — el runtime de hidratación (1)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [ ] | 16 | — | **Un recorrido por gesto, no uno por tag.** El turno de hidratación construye su índice —`id → Element` y `tag → Element[]`— y `instancesOf` / la búsqueda por id lo consultan, en vez de recorrer el documento entero cada una. **Por turno y no global**: un índice que sobrevive al gesto hay que mantenerlo vivo frente al fabricador de `live` y al render del worker, y uno desactualizado es un fallo silencioso donde hoy hay una pasada lenta. El orden bus → cascada → host → replay de SDD-17 no se toca. Criterio 17 | `core` | `src/hydrate/registry.ts` · `cascade.ts` · `bus.ts` · `install.ts` |

---

## Fase 8 — la evidencia y el cierre (2)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [ ] | 17 | 11, 12, 13, 15, 16 | **La evidencia, en un navegador.** El workspace de [SDD-43](./SDD-43-librerias.md) criterio 12 —dos apps, dos librerías— desplegado en un origen: la pestaña de red de la segunda app **no descarga ni un byte de framework** que la primera ya trajo, `main` incluido, y `Application → Cache Storage` enseña `fudic-runtime-<version>` compartida. Más el caso del despliegue: rebuild de `app-1` con build id nuevo, recarga, y de `/_fudic/` no se vuelve a pedir nada. En Chrome real. Y `pnpm dev` sin `_fudic/`, igual que hoy (§4.13). Criterios 9, 18 | `examples` | `examples/workspace/*` |
| [ ] | 18 | todas | **Cierre.** `pnpm typecheck`, `pnpm test`, `pnpm build`, y los 19 criterios de §6 verdes — con los tres de «rojo primero» (2, 5 y 8) vistos fallar antes. El código nuevo al 100 % en las cuatro métricas y ningún paquete por debajo de donde empezó. SDD-45 a `Hecho` en [INDEX.md](./INDEX.md), con su fila y su línea de progreso | — | [INDEX.md](./INDEX.md) |
