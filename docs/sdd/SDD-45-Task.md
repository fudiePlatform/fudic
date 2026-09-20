# SDD-45 — Tareas

> **SDD:** [SDD-45 — El runtime se publica en piezas](./SDD-45-runtime-publicado.md)
> **Paquetes:** `@fudic/conventions` · `@fudic/core` · `@fudic/dom` · `@fudic/forms` ·
> `@fudic/di` · `@fudic/compiler` · `@fudic/vite` · `@fudic/transport` · `@fudic/ssr` ·
> `examples/basic` · `examples/workspace`
> **Rama:** `sdd-45-runtime-publicado`
> **Progreso:** 0 / 24
> **Bloqueado por:** [SDD-43](./SDD-43-librerias.md) — su tarea 11 es el `peerDependencies`
> que aquí se endurece, y su criterio 12 es el workspace sobre el que se mide la evidencia.

## Cómo se trabaja este SDD

**Cada fase termina viendo algo en Chrome.** No hay una fase de «evidencia» al final: el
navegador es donde esto se usa, y un hito que solo existe en un test unitario puede estar
verde con la puerta abierta. El hito de cada fase está escrito abajo, dice qué pestaña se
mira y qué tiene que verse. **Una fase no se cierra sin su hito**, aunque los tests estén
verdes.

Para los hitos se usa `examples/workspace` (dos apps y dos librerías en un origen,
`serve.mjs`), salvo donde se diga otra cosa. Donde el hito pide red lenta, se usa el
estrangulador de Chrome en «Slow 3G»: la profundidad del árbol de descubrimiento no se ve a
velocidad de local, y es justo la propiedad que este SDD promete (§1.5, regla 2).

**El orden manda en dos puntos.** La tarea 2 va antes que todas las demás: si los paquetes no
producen bytes idénticos entre dos construcciones, no hay nada que compartir. Y la **fase 2 es
una medición y no código**: decide si el runtime de hidratación se publica como una pieza o
como once, y las fases siguientes construyen lo que esa medición diga.

## Estado de la rama

Commiteado: la revisión completa del SDD y de este Task.
En curso, sin commitear: la tarea 1 en `@fudic/conventions`, que incluye un `RUNTIME_ATTRS`
de un diseño anterior —los tres atributos en el `<script>`— que **ya no se usa**: el
coordinador de §4.4 lleva esos datos dentro. **Hay que quitarlo** y dejar en su sitio
`runtimeMarkerUrl`. La cobertura del paquete estaba al 100 en las cuatro métricas.

---

## Mapa de dependencias

```
    F1 publicar ──→ F2 MEDIR LA PIEZA ──→ F3 enlazar ──→ F4 el coordinador ──→ F5 inline/fichero
                                                │                                      │
                                                ├──→ F6 la caché compartida ───────────┤
                                                └──→ F7 el worker ─────────────────────┤
                                                                                       │
                                        F8 lo suelto (boot · FUD0800 · índice) ────────┤
                                                                                       │
                                                                  F9 evidencia y cierre ┘
```

---

## Fase 1 — publicar (4)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [ ] | 1 | — | **Los nombres que nadie posee.** `RUNTIME_DIR`, `runtimeCacheName(version)` y `runtimeMarkerUrl(app)` en `@fudic/conventions` — nombres que el que publica y el que enlaza deben compartir y ninguno posee. La caché **no lleva `app`** y eso es deliberado (§4.9). **Quitar `RUNTIME_ATTRS`**, que sobra desde que el coordinador lleva la carpeta y el id dentro | `conventions` | `src/index.ts` |
| [ ] | 2 | 1 | **(rojo primero)** **Los bytes no dependen de quién construya.** Construir un paquete de runtime dos veces produce ficheros **idénticos byte a byte**. Es la condición de existencia del SDD: si esto no se sostiene, compartir es imposible por mucho que la URL coincida. Se ve fallar si el build arrastra fechas, rutas absolutas o cualquier cosa del entorno. Criterio 2 | `core` | `test/reproducible.test.ts` |
| [ ] | 3 | 2 | **Un paquete declara que publica piezas, y el plugin no enumera a nadie.** `"fudic": { "runtime": "./runtime" }` en el `package.json`, y un `build` que produce ese directorio: una unidad por módulo, minificada, importándose entre ellas por ruta relativa. Los cuatro de hoy lo declaran. **Ninguna lista de paquetes en el plugin** — es el requisito que hace que `@fudic/http` no obligue a editar nada (§3.3). Criterio 1 | `core` · `dom` · `forms` · `di` | `package.json` · `tsconfig.runtime.json` · `scripts/` |
| [ ] | 4 | 3 | **`FUD0804`:** un paquete declara el directorio y no existe o está vacío. Criterio 3 | `vite` | `src/runtime-pieces.ts` |

> **Hito en el navegador (criterio 4).** Servir `packages/core/runtime/` con un estático y
> abrir `core/signal.js` en Chrome. Se lee el módulo minificado y sus imports relativos a
> hermanos. Es el hito más pequeño del documento y demuestra que la forma publicada existe.

---

## Fase 2 — medir la pieza, antes de construir nada (1)

> **Esta fase no escribe producto.** Decide la forma del runtime de hidratación, y las fases
> 3 y 4 construyen lo que salga. Hacerla después sería descubrir el tamaño cuando ya no se
> puede cambiar.

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [ ] | 5 | 4 | **Una pieza o once.** Los once módulos del arranque (`cells` 1 746, `install` 1 640, `cascade` 975, `warm/observer` 604, `capture` 478, `maps` 417, `warm/sw` 391, `chunks` 378, `bus` 320, `replay` 175, `warm/channel` 96) se construyen **de las dos formas** y se comparan en tres escenarios: una app un despliegue, dos apps, la misma app dos despliegues. Dos varas: **bytes** —incluyendo el `modulepreload` que cada pieza añade a cada página que la usa— y **profundidad** del árbol de descubrimiento. Si no apuntan al mismo sitio, manda la profundidad (§1.5, regla 2). **Los números se escriben aquí, en esta tarea**, y la decisión queda anotada con ellos. Criterio 5 | — | este fichero |

> **Hito en el navegador (criterio 18, primera mitad).** Con Slow 3G, la cascada de red de
> una ruta que hidrata, capturada con las dos formas. Es la imagen que decide, y queda
> pegada en la tarea.

---

## Fase 3 — enlazar (4)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [ ] | 6 | 5 | **(rojo primero)** **El plugin enlaza en vez de empaquetar.** Los imports de los paquetes de runtime dejan de entrar en el bundle y se reescriben a `/_fudic/<version>/<paquete>/<módulo>.js`, con la versión del `package.json` resuelto y **sin** el `base` de la app. El autor sigue escribiendo `@fudic/core`. Se ve fallar antes: hoy emite `assets/signal-<build>.js`. Criterios 7, 8 | `vite` | `src/runtime-link.ts` · `src/plugin.ts` |
| [ ] | 7 | 6 | **Copiar al `dist` lo que se enlaza, y solo eso.** Un `dist` sigue siendo un árbol completo y desplegable solo — es lo que permite desplegar dos apps por separado y en cualquier orden. Y `FUD0802` si el destino ya tiene esa pieza con bytes distintos | `vite` | `src/runtime-link.ts` |
| [ ] | 8 | 7 | **La poda se conserva, y se mide.** Una app que no usa signals derivadas no emite `computed.js`. Se cuenta sobre el `dist`, no se razona. Criterio 9 | `vite` | `test/runtime-prune.test.ts` |
| [ ] | 9 | 7 | **`FUD0806` y `FUD0805`.** Una pieza que contiene el token de construcción rompe el build (§4.13): es la propiedad de la que cuelga compartir, y es comprobable. Y dos paquetes que produjeran la misma URL, también. Criterios 6, 10 | `vite` | `src/runtime-link.ts` |

> **Hito en el navegador (criterio 11).** Una ruta que hidrata descarga sus piezas desde
> `/_fudic/…` y **ni una** desde `assets/`. La pestaña de red es el criterio, no el `dist`.

---

## Fase 4 — el coordinador (3)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [ ] | 10 | 9 | **(rojo primero)** **El arranque se parte en coordinador y piezas.** El plugin genera **por ruta** un módulo que importa las piezas de esa ruta y llama a `installHydration` con la carpeta, el id de construcción y el canal de calentado. Es el único sitio donde viven esos dos datos. Se ve fallar antes: hoy hay un `main` por aplicación con todo dentro. Criterio 12 | `vite` | `src/bootstrap.ts` · `src/coordinator.ts` |
| [ ] | 11 | 10 | **Se nombra por su contenido.** Dos rutas que necesitan lo mismo producen el mismo fichero, sin que nadie lo coordine: no hay un artefacto por ruta, hay uno por combinación. Y una ruta que no hidrata **no tiene coordinador**: ni fichero ni etiqueta. Criterio 13 | `vite` | `src/coordinator.ts` |
| [ ] | 12 | 11 | **El coordinador pesa menos de 1 kB**, y es un test y no una aspiración: si sube de ahí, algo del framework se ha colado dentro de la aplicación. Criterio 14 | `vite` | `test/coordinator.test.ts` |

> **Hito en el navegador (criterio 15).** Dos rutas de la misma app, una con inyección y otra
> sin. La pestaña de red enseña las piezas de inyección **solo** en la primera. Es la regla 1
> de §1.5 vista con los ojos.

---

## Fase 5 — inline o fichero (3)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [ ] | 13 | 12 | **El interruptor del layout.** `fudic:runtime` emite el coordinador como fichero; `fudic:runtime?inline`, dentro de la página con `nonce`. Por defecto **fichero**: es la forma que funciona con la política más estricta y la que se cachea entre navegaciones. Mismo interruptor para `fudic:styles`. Criterio 16 | `compiler` | `src/emit/parts.ts` · `src/emit/layout.ts` |
| [ ] | 14 | 13 | **La precarga que antes no se podía escribir.** Con la forma de fichero, un `<link rel="modulepreload">` por pieza de esa ruta. El comentario de `writeRuntimeTags` decía que esos nombres «no llegan a este lado»; ahora llegan, porque las decide el mismo plugin que escribe el `<head>`. Es lo que quita la cadena (§4.5). Criterio 16 | `vite` · `compiler` | `src/emit/parts.ts` |
| [ ] | 15 | 13 | **`FUD0803`:** `?inline` con una política de seguridad que no declara `nonce`. Decidible en el build, roto en producción. Criterio 17 | `vite` | `src/diagnostics.ts` |

> **Hito en el navegador (criterio 18).** Slow 3G, la misma ruta con las dos formas: **las
> piezas empiezan todas a la vez** y ninguna espera a que otra termine. Las dos formas tienen
> que pasarlo. Si el fichero encadena, la precarga de la tarea 14 no está haciendo su trabajo.

---

## Fase 6 — la caché compartida (2)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [ ] | 16 | 9 | **La caché de origen, y el test que la protege.** Todo `/_fudic/<version>/*` va a `fudic-runtime-<version>`, sin `app` en el nombre. Que el purgado de BUG-33 no la toque **ya es cierto** —`isStaleCache` solo reconoce `shell-`/`routes-`/`pages-`/`data-`—, así que lo que se escribe es el test que lo fija: el día que alguien cambie ese predicado, dos apps vuelven a borrarse el runtime. Criterio 19 | `transport` | `src/store.ts` · `test/store.test.ts` |
| [ ] | 17 | 16 | **Quién la borra.** Al activarse, un worker escribe su marca con fecha en la caché de la versión que usa, y borra las versiones cuyas marcas estén **todas** caducadas. Sin coordinación entre apps y sin registro aparte: una app que sube de versión deja de refrescar la vieja, y una que se retira deja de refrescarlas todas. Reloj inyectado, para que el test no espere. Criterio 20 | `vite` · `transport` | `src/bootstrap.ts` (`emitSwBootstrap`) |

> **Hito en el navegador (criterio 21).** `Application → Cache Storage`: está
> `fudic-runtime-<version>` con las piezas y **una marca por app**. Se abre la segunda app y
> su pestaña de red **no trae ni un byte de framework**.

---

## Fase 7 — el worker (2)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [ ] | 18 | 17 | **El worker enlaza `ssr` y `di` en vez de empaquetarlos.** Se piden a `/_fudic/<version>/` por el `Store` de la caché compartida, se enlazan con el `createLinker` que el worker ya tiene y entran en `builtins` igual que ahora — el camino por el que ya trae los trozos de ruta, que es el que BUG-03 **no** prohíbe. Dentro de `build()`, donde ya se espera al manifiesto. `canLink()` sigue siendo el valor de seguridad. **`@fudic/transport` no se mueve**: es quien abre la caché y quien enlaza. Criterio 22 | `vite` · `transport` | `src/bootstrap.ts` |
| [ ] | 19 | 18 | **La batería de navegación de SDD-20 pasa sin tocarla**, offline incluido, que es donde una dependencia traída por red se nota. Criterio 23 | `transport` | `test/` |

> **Hito en el navegador (criterio 24).** Se corta la red en Chrome y se navega: la página se
> renderiza. Es el criterio 23 hecho a mano, y es el que de verdad da la tranquilidad.

---

## Fase 8 — lo que quedaba suelto (3)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [ ] | 20 | 12 | **Sin `sw.json` no hay `boot`.** Ni el fichero ni la etiqueta. Hoy se emite un módulo cuyo contenido entero es `export {};` y toda página escribe el `<script>` que lo pide: una petición HTTP por página para nada. La condición ya se evalúa para decidir el contenido; sube un escalón, a la etiqueta. Criterio 25 | `vite` | `src/plugin.ts` · `src/wrapper.ts` |
| [ ] | 21 | 9 | **`FUD0800`: la librería manda.** El rango de `peerDependencies` de una librería del grafo que no incluye la versión resuelta **rompe el build**, con la librería, su rango y la versión en el mensaje. Sube de warning a error respecto a SDD-43 §4.7 (§4.8). `FUD0762` queda anotado como superado. Criterio 26 | `vite` | `src/peer-check.ts` |
| [ ] | 22 | 12 | **Un recorrido por gesto, no uno por tag.** El turno de hidratación construye su índice —`id → Element` y `tag → Element[]`— y los buscadores lo consultan, en vez de recorrer el documento entero cada uno. **Por turno y no global**: uno que sobreviva al gesto hay que mantenerlo vivo frente al fabricador de `live`, y uno desactualizado es un fallo silencioso donde hoy hay una pasada lenta. El orden de SDD-17 no se toca. Criterio 27 | `core` | `src/hydrate/registry.ts` · `cascade.ts` · `bus.ts` · `install.ts` |

> **Hito en el navegador (criterio 28).** El INP de la ruta más pesada de `examples/basic`,
> medido antes y después, y **anotado en esta tarea**. No tiene que bajar; tiene que no subir.

---

## Fase 9 — la evidencia y el cierre (2)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [ ] | 23 | todas | **La evidencia, entera.** `examples/workspace` en un origen: la segunda app **no descarga ni un byte de framework** que la primera ya trajo. Y el despliegue: se reconstruye `app-1` con un id nuevo, se recarga, y de `/_fudic/` no se vuelve a pedir nada. En Chrome real, con `Application → Cache Storage` confirmándolo. Y `pnpm dev` sin `_fudic/`, igual que hoy. Criterios 29, 30 | `examples` | `examples/workspace/*` |
| [ ] | 24 | 23 | **Cierre.** `pnpm typecheck`, `pnpm test`, `pnpm build`, y los 31 criterios de §6 verdes — con los tres de «rojo primero» (2, 6, 10) vistos fallar antes. El código nuevo al 100 % en las cuatro métricas y ningún paquete por debajo de donde empezó. SDD-45 a `Hecho` en [INDEX.md](./INDEX.md), tabla y registro de progreso | — | [INDEX.md](./INDEX.md) |
