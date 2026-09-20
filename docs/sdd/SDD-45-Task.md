# SDD-45 — Tareas

> **SDD:** [SDD-45 — El runtime se publica en piezas](./SDD-45-runtime-publicado.md) ·
> [catálogo de piezas](./SDD-45-piezas.md)
> **Paquetes:** `@fudic/conventions` · `@fudic/core` · `@fudic/dom` · `@fudic/forms` ·
> `@fudic/di` · `@fudic/compiler` · `@fudic/vite` · `@fudic/transport` · `@fudic/ssr` ·
> `examples/basic` · `examples/workspace` · `examples/pieces-bench`
> **Rama:** `sdd-45-runtime-publicado`
> **Progreso:** 5 / 32
> **Bloqueado por:** [SDD-43](./SDD-43-librerias.md) — su tarea 11 es el `peerDependencies`
> que aquí se endurece, y su criterio 12 es el workspace sobre el que se mide la evidencia.

## Cómo se trabaja este SDD

**Cada fase termina viendo algo en Chrome.** No hay una fase de «evidencia» al final: el
navegador es donde esto se usa, y un hito que solo existe en un test unitario puede estar
verde con la puerta abierta. Una fase no se cierra sin su hito, aunque todo lo demás esté
verde.

El hito se mide con **`examples/pieces-bench`** —ocho escenarios que descargan sus piezas de
verdad, con y sin precarga— y con `examples/workspace` donde haga falta un origen con dos
apps. Donde el hito pide red lenta se usa «Slow 3G»: a velocidad de local, una cadena de
descubrimiento y un abanico paralelo se ven igual, y son lo contrario.

**Lo que hay que tener claro antes de escribir una línea**, porque es donde este documento se
equivocó tres veces antes de asentarse:

- **Una pieza es un empaquetado, no un módulo fuente.** Por dentro no hay nada que descubrir.
- **Una frontera existe solo si la pieza es opcional o compartida** — y además **vale más que
  su frontera**, que son unos 150 bytes comprimidos y una petición. Los hermanos pequeños van
  juntos.
- **Un módulo pertenece a una pieza y a una sola**, y **todo valor exportado pertenece a
  alguna**. El reparto se deriva de lo que un paquete **exporta**, nunca de lo que un ejemplo
  gasta: deducirlo de un ejemplo es deducirlo de una casualidad, y así fue como `minLength`
  tuvo pieza y `required` no.
- **La composición ocurre al construir**, dentro del coordinador generado. Nada de un registro
  de piezas en tiempo de ejecución.

---

## Dónde estamos

**Fase 1 cerrada y commiteada.** Los seis paquetes publican sus piezas: 27 ficheros, 22 124
bytes, reconstruir los seis da los mismos bytes, y ningún import apunta a una URL que no
exista. El catálogo de las 27 está en [SDD-45-piezas.md](./SDD-45-piezas.md).

**Lo medido, que es lo que sostiene el resto:**

- **Partir cuesta.** 27 piezas sueltas comprimen a 10 434 bytes; su contenido en un fichero, a
  7 444. Cada frontera son unos **150 bytes comprimidos** más su petición.
- **El arranque son 9 900 bytes y 9 peticiones, con tres niveles de descubrimiento**
  (`hydrate` → `signal` → `tracking`). Sin la precarga de la fase 5 esto es peor que hoy.
- **2 328 de esos 9 900 no hacen falta al cargar**: el adaptador del DOM, el signal, el
  seguimiento y el puente del fabricado (§4.4.1).
- **Ocho piezas las pide toda ruta que hidrata**; `effect` y `subscribe` las evitan 13 de 17
  rutas, y `computed` 15 de 17.
- **El reparto de formularios está incompleto**: solo `minLength` tiene pieza. Faltan
  `required`, `max`, `min`, `maxLength`, `pattern`, los dos validadores genéricos, las trece
  conversiones tipadas y `form`/`group`/`control`. En núcleo falta `batch`; en DOM, `cursorOf`.

**Decidido y pendiente de implementar:** `core/channel` se mete dentro de los dos canales de
calentado (184 bytes que cuestan más como pieza de lo que ahorran, y los dos canales nunca
coexisten). Y el reparto de formularios se rehace agrupando: los validadores en una pieza, las
conversiones tipadas en otra.

**Sigue abierto, y lo decide Pedro mirando el banco:** si el arranque con precarga vale, no se
empaqueta nada; si no, se empaqueta por conjunto. La fase 5 implementa el límite de §4.5.2 en
cualquier caso — lo que falta es el número por defecto confirmado, hoy escrito como 10.

## Lo que la sesión de tests tendrá que cubrir

El código nace sin tests, por decisión explícita, y esto es para que no haya que adivinar la
intención. De la **fase 1**: el descubrimiento de piezas de `@fudic/vite`
(`src/runtime-pieces.ts`) tiene la I/O inyectada precisamente para esto — camino feliz, forma
de la URL sin `base`, publicador transitivo, a través de una librería, la regla de parada que
mantiene `node_modules` fuera, deduplicación de symlinks, las tres formas de `FUD0804`, las
no-declaraciones que no son diagnóstico, normalización del valor declarado, no lanzar nunca,
publicador sin `version`, determinismo del orden, solo `.js` de primer nivel, y
`devDependencies`/`peerDependencies`. Y las tres comprobaciones del criterio 5, que la fase 2
deja como herramienta y que ahí deben convertirse en test.

---

## Mapa de dependencias

```
F1 las piezas existen ──→ F2 el reparto ──→ F3 enlazar ──→ F4 el coordinador ──→ F5 la política
                                                │                                       │
                                                ├──→ F6 la caché compartida ────────────┤
                                                └──→ F7 el worker ──────────────────────┤
                                                                                        │
                                         F8 lo suelto (boot · FUD0800 · índice) ────────┤
                                                                                        │
                                                                   F9 evidencia y cierre ┘
```

---

## Fase 1 — las piezas existen (5) · **cerrada**

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [x] | 1 | — | **Los nombres que nadie posee.** `RUNTIME_DIR`, `runtimeCacheName(version)` y `runtimeMarkerUrl(app)` en `@fudic/conventions`. La caché **no lleva `app`** y eso es deliberado (§4.9) | `conventions` | `src/index.ts` |
| [x] | 2 | 1 | **(rojo primero)** **Los bytes no dependen de quién construya.** Construir dos veces produce ficheros idénticos byte a byte. Criterio 2 | `core` | — |
| [x] | 3 | 2 | **El contrato de una pieza.** `install(options)`, uniforme y no un registro (§3.4). Criterio 6 | `core` | `src/runtime-entry.ts` |
| [x] | 4 | 3 | **Un paquete declara que publica piezas, y el plugin no enumera a nadie.** Criterio 1 | `core` · `dom` · `forms` · `di` · `transport` · `ssr` | `rolldown.config.ts` |
| [x] | 5 | 4 | **`FUD0804`** y el descubrimiento por resolución del grafo. Criterio 3 | `vite` | `src/runtime-pieces.ts` |

> **Hito conseguido.** Las 27 piezas servidas en sus URLs reales, `core/hydrate.js` legible y
> sin nada que descubrir dentro, y cero imports rotos.

---

## Fase 2 — el reparto, derivado de los exports (4)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [ ] | 6 | 5 | **Rehacer el reparto a partir de lo que cada paquete exporta.** En `@fudic/forms`: los validadores en **una** pieza y las conversiones tipadas en **otra** —cada uno pesa entre 50 y 130 bytes y una frontera cuesta 150, así que sueltos pierden dinero— más `form`/`group`/`control`. En `@fudic/core`, `batch`; en `@fudic/dom`, `cursorOf`. Criterio 5 | `forms` · `core` · `dom` | `rolldown.config.ts` |
| [ ] | 7 | 6 | **`core/channel` desaparece como pieza** y se mete dentro de `warm-sw` y `warm-preload`. Decidido y medido: son 184 bytes, cuestan más como frontera, y los dos canales son excluyentes, así que nadie los descarga los dos. Es la excepción escrita a la segunda regla: vale para piezas que **pueden convivir** | `core` | `rolldown.config.ts` |
| [ ] | 8 | 7 | **Las tres comprobaciones, como herramienta y en el banco.** Ningún módulo en dos piezas, ningún valor exportado sin pieza, ninguna pieza por debajo de su frontera. Sobre los ficheros publicados. Las excepciones de `@fudic/transport` (§4.10) se escriben, no se echan de menos en silencio. Criterio 5 | `examples` | `examples/pieces-bench/` |
| [ ] | 9 | 8 | **`FUD0805`:** dos paquetes que produjeran la misma URL publicada. Criterio 7 | `vite` | `src/runtime-pieces.ts` |

> **Hito en el navegador.** En el banco, cero en las tres comprobaciones, y el escenario del
> formulario cambiando de nueve peticiones a las que salgan del reparto agrupado.

---

## Fase 3 — enlazar (4)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [ ] | 10 | 9 | **(rojo primero)** **El plugin enlaza en vez de empaquetar.** Los imports de los paquetes de runtime se reescriben a `/_fudic/<version>/<paquete>/<pieza>.js`, **sin** el `base` de la app. Se ve fallar antes: hoy emite `assets/signal-<build>.js`. Criterios 8, 9 | `vite` | `src/runtime-link.ts` · `src/plugin.ts` |
| [ ] | 11 | 10 | **Copiar al `dist` lo que se enlaza, y solo eso**, más `FUD0802` si el destino ya tiene esa pieza con bytes distintos | `vite` | `src/runtime-link.ts` |
| [ ] | 12 | 11 | **La poda se conserva, y se mide.** Una app que no usa signals derivadas no emite `computed.js`. Se cuenta sobre el `dist`. Criterio 10 | `vite` | `src/runtime-link.ts` |
| [ ] | 13 | 11 | **`FUD0806`:** una pieza con el token de construcción dentro rompe el build (§4.13). Criterio 11 | `vite` | `src/runtime-link.ts` |

> **Hito en el navegador (criterio 12).** Una ruta que hidrata descarga sus piezas desde
> `/_fudic/…` y **ni una** desde `assets/`.

---

## Fase 4 — el coordinador (5)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [ ] | 14 | 13 | **(rojo primero)** **El arranque se parte en coordinador y piezas.** Un módulo por ruta que importa sus piezas y las arranca con los parámetros de esta app. Único sitio donde viven la carpeta y el id. Criterio 13 | `vite` | `src/coordinator.ts` |
| [ ] | 15 | 14 | **La tabla de correspondencias** (§4.4): qué piezas nombra una ruta sale de hechos que el compilador ya tiene. Formularios y reactividad **no** están en ella: los arrastra el trozo de cada componente | `vite` | `src/coordinator.ts` |
| [ ] | 16 | 15 | **El arranque mínimo** (§4.4.1). El adaptador del DOM, el signal, el seguimiento y el puente del fabricado salen de la carga y pasan al calentado, que ya pide el trozo del componente cuando entra en pantalla. Son 2 328 de 9 900 bytes que quien entra y sale no paga. **Aquí se resuelve si `core/live` es opcional de verdad** o si hay que corregir §4.3.1. Criterio 34 | `core` · `vite` | `src/hydrate/install.ts` · `src/coordinator.ts` |
| [ ] | 17 | 16 | **Se nombra por su contenido, y el orden va escrito.** Dos rutas con la misma necesidad, el mismo fichero. Una que no hidrata, sin coordinador. El orden entre piezas lo escribe el generador. Criterios 14, 16 | `vite` | `src/coordinator.ts` |
| [ ] | 18 | 17 | **El coordinador pesa menos de 1 kB**, y es una comprobación y no una aspiración. Criterio 15 | `vite` | `src/coordinator.ts` |

> **Hito en el navegador (criterios 17 y 34).** Dos rutas, una con inyección y otra sin: las
> piezas de inyección solo en la primera. Y una ruta que hidrata en la que **no se toca nada**:
> 7 200 bytes, no 9 900.

---

## Fase 5 — inline o fichero, y la política de carga (5)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [ ] | 19 | 18 | **El interruptor del layout.** `fudic:runtime` como fichero, `fudic:runtime?inline` dentro de la página con `nonce`. Por defecto fichero. Lo mismo para `fudic:styles`. Criterio 18 | `compiler` | `src/emit/parts.ts` |
| [ ] | 20 | 19 | **La precarga que antes no se podía escribir.** Un `modulepreload` por pieza de la ruta. Es lo que quita la cadena (§4.5). Criterio 18 | `vite` · `compiler` | `src/emit/parts.ts` |
| [ ] | 21 | 19 | **`FUD0803`:** `?inline` con una política que no declara `nonce`. Criterio 19 | `vite` | `src/diagnostics.ts` |
| [ ] | 22 | 20 | **Con worker, se precachea lo que la aplicación enlaza** (§4.5.1), ni más ni menos. A partir del `install`, toda petición de runtime es lectura de caché — y la granularidad deja de tener coste. Criterio 35 | `vite` | `src/bootstrap.ts` |
| [ ] | 23 | 22 | **El límite de peticiones, y el paquete por conjunto** (§4.5.2). Más de `N` piezas en una ruta → un paquete con todas; por debajo, sueltas. `N` por defecto 10, y es **la única opción** que gana `FudicOptions`. El paquete es por **conjunto de piezas y jamás por ruta**: dos rutas con el mismo conjunto, el mismo fichero, y dos apps también. Se emiten las dos formas. Criterio 36 | `vite` | `src/coordinator.ts` |

> **Hito en el navegador (criterios 20 y 36).** Slow 3G, la misma ruta con las dos formas:
> las piezas empiezan todas a la vez y ninguna espera a otra. Y el límite decidiendo: bajarlo
> a uno empaqueta todo, subirlo a cien no empaqueta nada.

---

## Fase 6 — la caché compartida (2)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [ ] | 24 | 13 | **La caché de origen, y la comprobación que la protege.** `fudic-runtime-<version>`, sin `app` en el nombre. Que el purgado de BUG-33 no la toque ya es cierto — `isStaleCache` solo reconoce `shell-`/`routes-`/`pages-`/`data-` —, así que lo que falta es fijarlo. Criterio 21 | `transport` | `src/store.ts` |
| [ ] | 25 | 24 | **Quién la borra.** Cada worker escribe su marca fechada al activarse y borra las versiones cuyas marcas hayan caducado todas. Sin coordinación entre apps, sin registro aparte. Reloj inyectado. Criterio 22 | `vite` · `transport` | `src/bootstrap.ts` |

> **Hito en el navegador (criterio 23).** `Application → Cache Storage` con la caché, sus
> piezas y una marca por app. Se abre la segunda app y no trae ni un byte de framework.

---

## Fase 7 — el worker (2)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [ ] | 26 | 25 | **El worker enlaza `ssr` y `di` en vez de empaquetarlos**, por el camino que ya usa para los trozos de ruta — el que BUG-03 **no** prohíbe. `@fudic/transport` no se mueve: es quien abre la caché y quien enlaza. Criterio 24 | `vite` · `transport` | `src/bootstrap.ts` |
| [ ] | 27 | 26 | **La batería de navegación de SDD-20 pasa sin tocarla**, offline incluido. Criterio 25 | `transport` | — |

> **Hito en el navegador (criterio 26).** Red cortada y la página se renderiza.

---

## Fase 8 — lo que quedaba suelto (3)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [ ] | 28 | 18 | **Sin `sw.json` no hay `boot`.** Ni fichero ni etiqueta. Hoy toda página pide un módulo cuyo contenido es `export {};`. Criterio 27 | `vite` | `src/plugin.ts` |
| [ ] | 29 | 13 | **`FUD0800`: la librería manda.** Sube de warning a error respecto a SDD-43 §4.7. `FUD0762` queda superado. Criterio 28 | `vite` | `src/peer-check.ts` |
| [ ] | 30 | 18 | **Un recorrido por gesto, no uno por tag.** Índice `id → Element` y `tag → Element[]`, **por turno y no global**. El orden de SDD-17 no se toca. Criterio 29 | `core` | `src/hydrate/registry.ts` |

> **Hito en el navegador (criterio 30).** El INP de la ruta más pesada de `examples/basic`,
> antes y después, anotado aquí. No tiene que bajar; tiene que no subir.

---

## Fase 9 — la evidencia y el cierre (2)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [ ] | 31 | todas | **La evidencia, entera.** `examples/workspace` en un origen: la segunda app no descarga ni un byte de framework que la primera ya trajo. Y el despliegue: se reconstruye `app-1` con un id nuevo y de `/_fudic/` no se vuelve a pedir nada. Criterios 31, 32 | `examples` | `examples/workspace/*` |
| [ ] | 32 | 31 | **Cierre.** `pnpm typecheck`, `pnpm test`, `pnpm build`, y los 36 criterios de §6 verdes — con los tres de «rojo primero» (2, 10, 14) vistos fallar antes. SDD-45 a `Hecho` en [INDEX.md](./INDEX.md), tabla y registro | — | [INDEX.md](./INDEX.md) |
