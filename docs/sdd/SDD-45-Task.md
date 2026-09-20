# SDD-45 — Tareas

> **SDD:** [SDD-45 — El runtime se publica en piezas](./SDD-45-runtime-publicado.md)
> **Paquetes:** `@fudic/conventions` · `@fudic/core` · `@fudic/dom` · `@fudic/forms` ·
> `@fudic/di` · `@fudic/compiler` · `@fudic/vite` · `@fudic/transport` · `@fudic/ssr` ·
> `examples/basic` · `examples/workspace`
> **Rama:** `sdd-45-runtime-publicado`
> **Progreso:** 1 / 27
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

**Lo que hay que tener claro antes de escribir una línea**, porque es donde este documento se
equivocó dos veces antes de asentarse:

- **Una pieza es un empaquetado, no un módulo fuente.** Lo construye nuestro bundler, con las
  demás piezas como `external`. Publicar el árbol de ficheros fuente sería una cascada de
  peticiones que se descubren unas a otras, que es exactamente lo que este SDD existe para
  evitar (§4.3).
- **Una frontera existe solo si la pieza es opcional o compartida.** Cualquier otra es un
  peaje. Casi todas las fronteras ya existen y las puso el build; la única que falta es sacar
  el runtime de hidratación del fichero de la aplicación.
- **Un módulo pertenece a una pieza y a una sola.** Si dos se lo llevan dentro, sus bytes
  están dos veces en el origen y se pierde todo lo ganado.
- **La composición ocurre al construir**, dentro del coordinador generado. Nada de un registro
  de piezas en tiempo de ejecución.

**El orden manda en un punto:** la tarea 2 va antes que todas las demás. Si los paquetes no
producen bytes idénticos entre dos construcciones, no hay nada que compartir.

## Estado de la rama

Commiteado: la reescritura completa del SDD y de este Task, y la **tarea 1** —los nombres
compartidos en `@fudic/conventions`, al 100 en las cuatro métricas—. Lo siguiente es la
tarea 2, que es roja a propósito y va antes que cualquier otra cosa.

---

## Mapa de dependencias

```
F1 las piezas existen ──→ F2 el reparto ──→ F3 enlazar ──→ F4 el coordinador ──→ F5 inline/fichero
                                                │                                       │
                                                ├──→ F6 la caché compartida ────────────┤
                                                └──→ F7 el worker ──────────────────────┤
                                                                                        │
                                         F8 lo suelto (boot · FUD0800 · índice) ────────┤
                                                                                        │
                                                                   F9 evidencia y cierre ┘
```

---

## Fase 1 — las piezas existen (5)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [x] | 1 | — | **Los nombres que nadie posee.** `RUNTIME_DIR`, `runtimeCacheName(version)` y `runtimeMarkerUrl(app)` en `@fudic/conventions` — nombres que el que publica y el que enlaza deben compartir y ninguno posee. La caché **no lleva `app`** y eso es deliberado (§4.9) | `conventions` | `src/index.ts` |
| [ ] | 2 | 1 | **(rojo primero)** **Los bytes no dependen de quién construya.** Construir un paquete de runtime dos veces produce ficheros **idénticos byte a byte**. Es la condición de existencia del SDD: si esto no se sostiene, compartir es imposible por mucho que la URL coincida. Ahora recae sobre **nuestra** configuración de bundler, no sobre la de cada app. Criterio 2 | `core` | `test/reproducible.test.ts` |
| [ ] | 3 | 2 | **El contrato de una pieza.** Una entrada, un nombre, una forma: `install(options)` (§3.4). Uniforme **y no un registro** — si cada pieza inventa su firma, el coordinador acaba conociéndolas una a una y meter `@fudic/http` obliga a tocar el generador, que es justo lo que no puede pasar. Criterio 6 | `core` | `src/runtime-entry.ts` |
| [ ] | 4 | 3 | **Un paquete declara que publica piezas, y el plugin no enumera a nadie.** `"fudic": { "runtime": "./runtime" }` en el `package.json`, y un `build` que produce ese directorio con **un fichero por pieza**, empaquetado y minificado, con las demás piezas como `external` apuntadas por su URL publicada. Los cuatro de hoy lo declaran. **Cómo se construyó una pieza no es asunto del plugin**: lee el directorio. Criterio 1 | `core` · `dom` · `forms` · `di` | `package.json` · `scripts/` |
| [ ] | 5 | 4 | **`FUD0804`:** un paquete declara el directorio y no existe o está vacío. Criterio 3 | `vite` | `src/runtime-pieces.ts` |

> **Hito en el navegador (criterio 4).** Servir `packages/core/runtime/` con un estático y
> abrir `core/hydrate.js` en Chrome. Se lee empaquetado, y **sus únicos imports son piezas
> publicadas**: ni un módulo suelto. Es el hito más pequeño del documento y demuestra las dos
> cosas a la vez — que la forma publicada existe y que por dentro no hay nada que descubrir.

---

## Fase 2 — el reparto (2)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [ ] | 6 | 5 | **Ningún módulo en dos piezas.** Se comprueba **sobre los ficheros publicados** y no sobre la intención: si `signal` acaba dentro de `hydrate` y además es pieza, sus bytes están dos veces en el origen y el SDD entero deja de comprar nada. Es la regla que hay que dejar en un test, porque se rompe sola en cuanto alguien añade un import. Criterio 5 | `vite` | `test/runtime-pieces.test.ts` |
| [ ] | 7 | 6 | **`FUD0805`:** dos paquetes que produjeran la misma URL publicada. No debería poder pasar con el paquete en la ruta, y por eso se comprueba. Criterio 7 | `vite` | `src/runtime-pieces.ts` |

> **Hito en el navegador.** Pedir `core/hydrate.js` en la pestaña de red y ver que dispara
> **exactamente** sus externas y ninguna más, todas a la vez. Profundidad uno. Si aparece un
> segundo escalón, el reparto está mal hecho y no se sigue.

---

## Fase 3 — enlazar (4)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [ ] | 8 | 7 | **(rojo primero)** **El plugin enlaza en vez de empaquetar.** Los imports de los paquetes de runtime dejan de entrar en el bundle y se reescriben a `/_fudic/<version>/<paquete>/<pieza>.js`, con la versión del `package.json` resuelto y **sin** el `base` de la app. El autor sigue escribiendo `@fudic/core`. Se ve fallar antes: hoy emite `assets/signal-<build>.js`. Criterios 8, 9 | `vite` | `src/runtime-link.ts` · `src/plugin.ts` |
| [ ] | 9 | 8 | **Copiar al `dist` lo que se enlaza, y solo eso.** Un `dist` sigue siendo un árbol completo y desplegable solo — es lo que permite desplegar dos apps por separado y en cualquier orden. Y `FUD0802` si el destino ya tiene esa pieza con bytes distintos | `vite` | `src/runtime-link.ts` |
| [ ] | 10 | 9 | **La poda se conserva, y se mide.** Una app que no usa signals derivadas no emite `computed.js`. Se cuenta sobre el `dist`, no se razona. Criterio 10 | `vite` | `test/runtime-prune.test.ts` |
| [ ] | 11 | 9 | **`FUD0806`:** una pieza que contiene el token de construcción rompe el build (§4.13). Es la propiedad de la que cuelga compartir, y es comprobable mecánicamente. Criterio 11 | `vite` | `src/runtime-link.ts` |

> **Hito en el navegador (criterio 12).** Una ruta que hidrata descarga sus piezas desde
> `/_fudic/…` y **ni una** desde `assets/`. La pestaña de red es el criterio, no el `dist`.

---

## Fase 4 — el coordinador (4)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [ ] | 12 | 11 | **(rojo primero)** **El arranque se parte en coordinador y piezas.** El plugin genera **por ruta** un módulo que importa las piezas de esa ruta y las arranca con los parámetros de esta aplicación. Es el único sitio donde viven la carpeta y el id de construcción. Se ve fallar antes: hoy hay un `main` por aplicación con todo dentro. Criterio 13 | `vite` | `src/coordinator.ts` · `src/bootstrap.ts` |
| [ ] | 13 | 12 | **La tabla de correspondencias.** Qué piezas nombra una ruta sale de hechos que el compilador ya tiene —hidrata, fabrica, publica mapa de inyección, es reactiva— y es una tabla, no una heurística (§4.4). **Formularios y reactividad no están en ella a propósito**: los arrastra el trozo de cada componente desde SDD-17 | `vite` | `src/coordinator.ts` |
| [ ] | 14 | 13 | **Se nombra por su contenido, y el orden va escrito.** Dos rutas que necesitan lo mismo producen el mismo fichero: no hay un artefacto por ruta, hay uno por combinación. Una ruta que no hidrata **no tiene coordinador**: ni fichero ni etiqueta. Y el orden entre piezas —la inyección lista antes del primer componente— lo escribe el generador, no se resuelve en el navegador. Criterios 14, 16 | `vite` | `src/coordinator.ts` |
| [ ] | 15 | 14 | **El coordinador pesa menos de 1 kB**, y es un test y no una aspiración: si sube de ahí, algo del framework se ha colado dentro de la aplicación. Criterio 15 | `vite` | `test/coordinator.test.ts` |

> **Hito en el navegador (criterio 17).** Dos rutas de la misma app, una con inyección y otra
> sin. La pestaña de red enseña las piezas de inyección **solo** en la primera. Es la regla 1
> de §1.5 vista con los ojos: nada fijo que sirva a todo el mundo.

---

## Fase 5 — inline o fichero (3)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [ ] | 16 | 15 | **El interruptor del layout.** `fudic:runtime` emite el coordinador como fichero; `fudic:runtime?inline`, dentro de la página con `nonce`. Por defecto **fichero**: es la forma que funciona con la política más estricta y la que se cachea entre navegaciones. Mismo interruptor para `fudic:styles`. Criterio 18 | `compiler` | `src/emit/parts.ts` · `src/emit/layout.ts` |
| [ ] | 17 | 16 | **La precarga que antes no se podía escribir.** Con la forma de fichero, un `<link rel="modulepreload">` por pieza de esa ruta. El comentario de `writeRuntimeTags` decía que esos nombres «no llegan a este lado»; ahora llegan, porque las decide el mismo plugin que escribe el `<head>`. Es lo que quita la cadena (§4.5). Criterio 18 | `vite` · `compiler` | `src/emit/parts.ts` |
| [ ] | 18 | 16 | **`FUD0803`:** `?inline` con una política de seguridad que no declara `nonce`. Decidible en el build, roto en producción. Criterio 19 | `vite` | `src/diagnostics.ts` |

> **Hito en el navegador (criterio 20).** Slow 3G, la misma ruta con las dos formas: **las
> piezas empiezan todas a la vez** y ninguna espera a que otra termine. Las dos formas tienen
> que pasarlo. Si el fichero encadena, la precarga de la tarea 17 no está haciendo su trabajo.

---

## Fase 6 — la caché compartida (2)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [ ] | 19 | 11 | **La caché de origen, y el test que la protege.** Todo `/_fudic/<version>/*` va a `fudic-runtime-<version>`, sin `app` en el nombre. Que el purgado de BUG-33 no la toque **ya es cierto** —`isStaleCache` solo reconoce `shell-`/`routes-`/`pages-`/`data-`—, así que lo que se escribe es el test que lo fija: el día que alguien cambie ese predicado, dos apps vuelven a borrarse el runtime. Criterio 21 | `transport` | `src/store.ts` · `test/store.test.ts` |
| [ ] | 20 | 19 | **Quién la borra.** Al activarse, un worker escribe su marca con fecha en la caché de la versión que usa, y borra las versiones cuyas marcas estén **todas** caducadas. Sin coordinación entre apps y sin registro aparte: una app que sube de versión deja de refrescar la vieja, y una que se retira deja de refrescarlas todas. Reloj inyectado, para que el test no espere. Criterio 22 | `vite` · `transport` | `src/bootstrap.ts` (`emitSwBootstrap`) |

> **Hito en el navegador (criterio 23).** `Application → Cache Storage`: está
> `fudic-runtime-<version>` con las piezas y **una marca por app**. Se abre la segunda app y
> su pestaña de red **no trae ni un byte de framework**.

---

## Fase 7 — el worker (2)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [ ] | 21 | 20 | **El worker enlaza `ssr` y `di` en vez de empaquetarlos.** Se piden a `/_fudic/<version>/` por el `Store` de la caché compartida, se enlazan con el `createLinker` que el worker ya tiene y entran en `builtins` igual que ahora — el camino por el que ya trae los trozos de ruta, que es el que BUG-03 **no** prohíbe. Dentro de `build()`, donde ya se espera al manifiesto. `canLink()` sigue siendo el valor de seguridad. **`@fudic/transport` no se mueve**: es quien abre la caché y quien enlaza. Criterio 24 | `vite` · `transport` | `src/bootstrap.ts` |
| [ ] | 22 | 21 | **La batería de navegación de SDD-20 pasa sin tocarla**, offline incluido, que es donde una dependencia traída por red se nota. Criterio 25 | `transport` | `test/` |

> **Hito en el navegador (criterio 26).** Se corta la red en Chrome y se navega: la página se
> renderiza. Es el criterio 25 hecho a mano, y es el que de verdad da la tranquilidad.

---

## Fase 8 — lo que quedaba suelto (3)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [ ] | 23 | 15 | **Sin `sw.json` no hay `boot`.** Ni el fichero ni la etiqueta. Hoy se emite un módulo cuyo contenido entero es `export {};` y toda página escribe el `<script>` que lo pide: una petición HTTP por página para nada. La condición ya se evalúa para decidir el contenido; sube un escalón, a la etiqueta. Criterio 27 | `vite` | `src/plugin.ts` · `src/wrapper.ts` |
| [ ] | 24 | 11 | **`FUD0800`: la librería manda.** El rango de `peerDependencies` de una librería del grafo que no incluye la versión resuelta **rompe el build**, con la librería, su rango y la versión en el mensaje. Sube de warning a error respecto a SDD-43 §4.7 (§4.8). `FUD0762` queda anotado como superado. Criterio 28 | `vite` | `src/peer-check.ts` |
| [ ] | 25 | 15 | **Un recorrido por gesto, no uno por tag.** El turno de hidratación construye su índice —`id → Element` y `tag → Element[]`— y los buscadores lo consultan, en vez de recorrer el documento entero cada uno. **Por turno y no global**: uno que sobreviva al gesto hay que mantenerlo vivo frente al fabricador de `live`, y uno desactualizado es un fallo silencioso donde hoy hay una pasada lenta. El orden de SDD-17 no se toca. Criterio 29 | `core` | `src/hydrate/registry.ts` · `cascade.ts` · `bus.ts` · `install.ts` |

> **Hito en el navegador (criterio 30).** El INP de la ruta más pesada de `examples/basic`,
> medido antes y después, y **anotado en esta tarea**. No tiene que bajar; tiene que no subir.

---

## Fase 9 — la evidencia y el cierre (2)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [ ] | 26 | todas | **La evidencia, entera.** `examples/workspace` en un origen: la segunda app **no descarga ni un byte de framework** que la primera ya trajo. Y el despliegue: se reconstruye `app-1` con un id nuevo, se recarga, y de `/_fudic/` no se vuelve a pedir nada. En Chrome real, con `Application → Cache Storage` confirmándolo. Y `pnpm dev` sin `_fudic/`, igual que hoy. Criterios 31, 32 | `examples` | `examples/workspace/*` |
| [ ] | 27 | 26 | **Cierre.** `pnpm typecheck`, `pnpm test`, `pnpm build`, y los 33 criterios de §6 verdes — con los tres de «rojo primero» (2, 8, 12) vistos fallar antes. El código nuevo al 100 % en las cuatro métricas y ningún paquete por debajo de donde empezó. SDD-45 a `Hecho` en [INDEX.md](./INDEX.md), tabla y registro de progreso | — | [INDEX.md](./INDEX.md) |
