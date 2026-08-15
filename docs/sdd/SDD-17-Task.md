# SDD-17 — el runtime de hidratación: el cierre de fudic

**Estado:** `En curso` · **Progreso: 20 / 21** · **Rama:** `worktree-sdd-17-hidratacion` ·
**SDD:** [SDD-17](./SDD-17-hidratacion.md)

Estas 21 tareas **terminan el framework**. Al marcarlas no queda nada de v1 salvo los cuatro
puntos de [PENDIENTES-v1.md](./pendings/PENDIENTES-v1.md) —`ref`, `@raw`, spread, `bind:`—, que
no bloquean nada: son azúcar de gramática sobre un compilador que ya emite. Ninguna tarea de
aquí abre trabajo nuevo ni deja un «se verá más adelante».

Lo que falta es el capturador global (`@fudic/core` tiene `FudicElement` y las señales, nada
más) y, alrededor de él, **cuatro agujeros de fontanería que nadie había mirado porque nadie
había pedido un chunk de hidratación todavía**:

| hallazgo | evidencia |
|---|---|
| `hydrateUrl` no lo llama nadie en runtime | solo aparece en tests y comentarios de [`urls.ts`](../../packages/transport/src/urls.ts) |
| En dev el módulo de cliente de un tag **no se publica en ninguna URL**: existe como `<path>.fud?client` y ni `resolveId` ni el middleware lo traducen. Sin esto `pnpm dev` no hidrata aunque el capturador estuviera escrito | [`plugin.ts:97 DEV_SCRIPT_IDS`](../../packages/vite/src/plugin.ts#L97) solo publica los dos bootstraps |
| `fudic-main.js` es literalmente `export {};` cuando no hay Service Worker — que es el caso de dev y el de una app sin `sw.json` | [`plugin.ts:428-436`](../../packages/vite/src/plugin.ts#L428-L436) |
| **El shell se queda corto en cuanto `fudic-main` importe `@fudic/core`.** Hoy es autocontenido; a partir de la tarea 10 comparte `@fudic/core` con los 1..N chunks de hidratación, y Rollup extrae ese código a un chunk compartido con hash. `sw.json` lista URLs **literales** (`"shell": ["/fudic-main.js"]`) y un nombre con hash no se puede escribir a mano: el chunk que toda página necesita quedaría fuera del precache | [`swconfig.ts`](../../packages/vite/src/swconfig.ts) · [`bootstrap.ts` `SHELL`](../../packages/vite/src/bootstrap.ts#L36) |

**El Service Worker puede no estar, y la SDD no lo preveía.** No es solo dev — son cuatro
casos, y en tres de ellos la página está perfectamente viva:

| caso | ¿SW? |
|---|---|
| Sin `sw.json` — decisión explícita del proyecto | nunca |
| `pnpm dev` con `dev: 'off'` (el valor por defecto) | nunca |
| **Primera carga**, aún sin `clients.claim()`: `navigator.serviceWorker.controller === null` | todavía no |
| Contexto inseguro o navegador sin SW | nunca |

El runtime **es uno solo**: los tres caminos, la cascada, el bus y el replay no dependen de que
haya SW. Lo que se bifurca son **dos puertos que el bootstrap inyecta**, porque el bootstrap es
el único que sabe en qué modo se emitió la página:

- `resolveChunk(tag) → url` — `hydrateUrl(tag)` en build; la URL del dev server en dev.
- `warm(urls, tags)` — `postMessage` al SW cuando hay controlador; `modulepreload` cuando no.

Así `@fudic/core` no importa `@fudic/transport` (no se rompe la frontera de paquetes), el caso
«sin SW» deja de ser una rama dentro del runtime, y **dev es un modo de primera clase**: el hito
de la tarea 13 es la hidratación entera verificada en `pnpm dev`, sin Service Worker en ninguna
parte. Anotado en la SDD como §4.7.1, invariante en §5 y criterio 24.

Los ficheros nuevos de `@fudic/core` nacen al 100 % en las cuatro métricas; el paquete ya está
configurado así ([`vitest.config.ts`](../../packages/core/vitest.config.ts)).

---

## Mapa de dependencias

**Cuatro carriles arrancan a la vez.** El runtime no espera a la fontanería, la fontanería no
espera al runtime, y el escenario del ejemplo se puede escribir el primer día.

```
A · runtime (@fudic/core, Vitest, sin navegador)
   1 maps ─┐
   2 registry ─┼─→ 4 cascade ─→ 5 bus ─┐
   3 chunks ─┘                          ├─→ 7 install ─┐
                6 capture+replay ───────┘              │
                                                       │
B · fontanería (@fudic/vite)                           │
   8 build id + base ─┐                                │
   9 URL de dev ──────┴──────────────→ 10 load(MAIN) ←─┘
                                            └─→ 11 shell = grafo de fudic-main
C · escenario
   12 fixture §6 ──────────────────────────────────────┐
                                                       ├─→ 13 HITO (criterios 1–14, 23)
D · red (@fudic/transport + SW)                        │
   16 el SW aprende `warm` ─→ 17 canal SW ─┐           │
                             15 canal preload ─┬─ 18 bootstrap elige ─→ 19 spec warm
                             14 observer ──────┘
                                                       └─→ 20 docs ─→ 21 cierre
```

| carril | tareas | arranca | puede ir en paralelo con |
|---|---|---|---|
| **A** runtime | 1–7 | ya | B, C, D |
| **B** fontanería | 8, 9 ya; 10 tras 7+8+9; 11 tras 10 | ya | A, C, D |
| **C** escenario | 12 | ya | todo |
| **D** red | 16 ya; 14, 15 tras 7; 17 tras 16 | ya (la 16) | A, B, C |

Dentro del carril A, **1, 2, 3 y 6 son simultáneas**: `capture` decide el camino y delega el
camino 2 en un callback, así que no depende de la cascada — solo el orquestador (7) las junta.

Puntos de junta, y solo hay tres: **7** (el runtime completo), **13** (el hito: hidrata en
navegador, sin SW) y **21** (verde y cerrado).

---

## Fase 1 — el runtime (`@fudic/core`, todo nuevo, Vitest + happy-dom)

| ✓ | # | dep | tarea | fichero |
|---|---|---|---|---|
| [x] | 1 | — | Lectura de los tres bloques JSON de la página y tramo por instancia (`data.slice(offsets[id], offsets[id+1])`). Sin global: el tramo se **pasa**, no se publica | `src/hydrate/maps.ts` |
| [x] | 2 | — | Localizar instancias **por tag** descendiendo por `shadowRoot` (`querySelectorAll` no cruza la frontera), y los dos conjuntos que gobiernan todo: `hydrated` (los tres caminos) y `attached` (el reparto). Aquí vive también el puerto `ElementRegistry` (`get`/`whenDefined`/`upgrade`), inyectado: la regla «`define` upgradea todas las instancias en su sitio, conservando su shadow» es la que sostiene toda la cascada y happy-dom no la modela —sustituye el nodo y pierde el shadow—, así que el runtime se verifica contra el puerto y el navegador real lo confirma en la 13 | `src/hydrate/registry.ts` |
| [x] | 3 | — | `ensureDefined(tag)` memoizado por tag (`inflight`) sobre el puerto `resolveChunk`: descarga por tag, hidratación por instancia | `src/hydrate/chunks.ts` |
| [x] | 4 | 2, 3 | Cascada post-orden y su corrección por tag: `prepareTag` prepara el subárbol de **todas** las instancias antes del `define`, y `attachAll` reparte el tramo a todas. Es el criterio 9, el que falla con `hydrateSubtreePostorder` a secas | `src/hydrate/cascade.ts` |
| [x] | 5 | 1, 4 | `preHydrateBus(tag)`: receptores de `fud-bus` levantados **en secuencia** (no `Promise.all`) antes de la cascada, cada uno con su propio `prepareTag` + `attachAll` | `src/hydrate/bus.ts` |
| [x] | 6 | 2 | El capturador: un listener en captura, los tres caminos, y el replay reconstruyendo el evento con su constructor sobre `composedPath()[0]`. El replay reentra y cae en el camino 1 — ahí se cierra el doble disparo. Delega el camino 2 en un callback, y por eso no espera a 4 ni a 5 | `src/hydrate/capture.ts` · `src/hydrate/replay.ts` |
| [x] | 7 | 1–6 | `installHydration({ root, resolveChunk, warm })`: el orden 3→4→5→6 y los eventos `fud:ready` / `fud:hydrated` (`from`: `downloaded` \| `shared-chunk` \| `bus` \| `subtree`). Aquí se declara el puerto `WarmChannel` y su implementación nula, la que usan las fases 1 y 2 | `src/hydrate/install.ts` · `src/hydrate/warm/channel.ts` · [index.ts](../../packages/core/src/index.ts) *(se añade el export y se corrige la cabecera)* |

## Fase 2 — que llegue a una página, y que se pueda probar en dev

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [x] | 8 | — | El hilo principal no puede construir el resolver de §4.6: `base` lo tiene Vite y el `build` solo se sustituye sobre el bundle del **SW**. Extender la sustitución de `BUILD_TOKEN` al chunk `fudic-main` y hornear `base` en él. Mismo largo, sin mover offsets, y sin circularidad: el id se computa de los nombres | `vite` | [plugin.ts:588](../../packages/vite/src/plugin.ts#L588) *(hoy solo toca `sw.code`)* · [bootstrap.ts](../../packages/vite/src/bootstrap.ts) |
| [x] | 9 | — | **Sin esto no hay dev.** El módulo de cliente de un tag es `<path>.fud?client` y no se publica: URL estable por tag (`<base>@fudic/h/<tag>.js` → `transformRequest(clientId(path))`), igual que `DEV_SCRIPT_IDS` publica los dos bootstraps. Es lo que hace que `resolveChunk` tenga una respuesta en dev | `vite` | [plugin.ts:97 `DEV_SCRIPT_IDS`](../../packages/vite/src/plugin.ts#L97) · [client.ts `clientId`](../../packages/vite/src/client.ts) · [dev.ts `devUrl`](../../packages/vite/src/dev.ts) |
| [x] | 10 | 7, 8, 9 | `load(MAIN_ID)` deja de devolver `export {};`: instala **siempre** la hidratación con los dos puertos inyectados (en dev, el resolver de la 9). Lo condicional pasa a ser el `registerRenderServiceWorker` | `vite` | [plugin.ts:428-436 `load`](../../packages/vite/src/plugin.ts#L428-L436) · [bootstrap.ts `emitMainBootstrap`](../../packages/vite/src/bootstrap.ts#L138) |
| [x] | 11 | 10 | El `shell` precacheado deja de ser la lista literal de `sw.json`: se le añade el **grafo estático de `fudic-main`**, que a partir de la 10 incluye el chunk compartido de `@fudic/core`. En `generateBundle` el bundle ya está en mano cuando se construye el SW, así que sale de ahí. Sin esto, el chunk que toda página necesita queda fuera del precache y se paga red en cada navegación en frío | `vite` | [plugin.ts:551-565](../../packages/vite/src/plugin.ts#L551-L565) · [bootstrap.ts `emitSwBootstrap`](../../packages/vite/src/bootstrap.ts#L27) · [swbuild.ts](../../packages/vite/src/swbuild.ts) |
| [x] | 12 | — | El escenario de §6: dos `app-counter` + `app-toggle`, la cadena de composición de 4 niveles, emisor/suscriptor de bus, un tag fuera del viewport inicial y otro excluido del warm | `examples/basic` | `src/routes/hidratacion.fud` + componentes *(nuevos)* |
| [x] | 13 | 10, 12 | **HITO.** Playwright: criterios 1–14 y 23, en **`pnpm dev`** y en un build **sin `sw.json`**. La hidratación entera, sin Service Worker en ninguna parte y sin una línea de warm. Comprueba de paso que la CSP (`script-src 'self' 'nonce-…'`, sin `strict-dynamic`) admite el `import()` del chunk por ser del mismo origen | `examples/basic` | `tests/hydration.spec.ts` *(nuevo)* · [sw-network.spec.ts](../../examples/basic/tests/sw-network.spec.ts) *(patrón)* |

## Fase 3 — warm (§4.7 y §4.7.1)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [x] | 14 | 7 | El disparador, idéntico en los dos canales: `IntersectionObserver` (`threshold: 0`, `unobserve` tras la primera vez), cierre transitivo por `fud-bus` + `fud-tree`, `requestIdleCallback` con `timeout: 800` y `warmedTags` idempotente | `core` | `src/hydrate/warm/observer.ts` |
| [x] | 15 | 7 | Canal **sin** SW: `<link rel="modulepreload">` por chunk. Descarga y parsea sin **evaluar**, así que el invariante de cero JS de componente se mantiene; `fud:warmed` en su `load`. Va antes que el canal SW porque no depende de nada y es el que hace medible el warm en dev | `core` | `src/hydrate/warm/preload.ts` |
| [x] | 16 | — | El SW no entiende `warm`: solo conoce `LOCATION_MESSAGE` y warmea **por ruta**. Añadir el mensaje, su handler, la descarga con `priority:'low'`, la idempotencia por `cache.match` y la respuesta `warmed`. El warm es **por tag**, y arrastra lo que el chunk importa: el manifiesto gana `hydrate` (tag → ficheros con hash, lo único no derivable) y el router `warmHydration`. Sin eso el primer clic paga red por el código compartido de `@fudic/core`, medido en Chromium. No toca el core: se puede hacer desde el primer día | `transport` · `vite` | [messages.ts](../../packages/transport/src/messages.ts) · [router.ts `warm`](../../packages/transport/src/router.ts#L277) · [bootstrap.ts `emitSwBootstrap`](../../packages/vite/src/bootstrap.ts#L27) |
| [x] | 17 | 16 | Canal **con** SW: `controller.postMessage({type:'warm', …})`. Si `controller === null` **no se envía nada** —no hay a quién— y se reintenta al `controllerchange`, porque la primera carga nunca está controlada aunque el SW esté registrado | `core` | `src/hydrate/warm/sw.ts` |
| [x] | 18 | 10, 14, 15, 17 | El bootstrap elige: canal SW cuando la página se emitió con `sw.json` (y en dev con `dev:'preview'`), canal `modulepreload` en el resto. Un único módulo emitido, la elección hecha en build | `vite` | [bootstrap.ts `emitMainBootstrap`](../../packages/vite/src/bootstrap.ts#L138) |

## Fase 4 — cierre

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [x] | 19 | 13, 18 | Criterios 15–21 **dos veces**, contra los dos canales, más el 24. Un criterio de warm que solo pase con SW no está verificado | `examples/basic` | `tests/hydration.spec.ts` |
| [x] | 20 | 19 | Documentación de cierre, corta y en inglés: sección de hidratación en el README de `@fudic/core` (los dos puertos, los tres caminos, qué cambia sin SW) y la nota de que `<script type="module" src="/fudic-main.js">` en el layout es obligatorio — las plantillas del CLI ya lo traen, el README no lo dice | `core` · `cli` | [core/README.md](../../packages/core/README.md) · [cli/templates/layout.fud](../../packages/cli/templates/layout.fud) *(verificar, no cambiar)* |
| [ ] | 21 | todas | **Cierre.** `pnpm typecheck`, `pnpm test`, `pnpm build` verdes en el workspace entero; `@fudic/core` al 100 % en las cuatro métricas; SDD-17 a `Hecho` con el registro de progreso, e INDEX y `PENDIENTES-v1.md` reflejando que lo único abierto de v1 son sus cuatro puntos | — | [INDEX.md](./INDEX.md) · [SDD-17](./SDD-17-hidratacion.md) · [PENDIENTES-v1.md](./pendings/PENDIENTES-v1.md) |

---

## Ficheros existentes que se tocan, y por qué

| fichero | qué cambia | por qué |
|---|---|---|
| [compiler/src/emit/client.ts](../../packages/compiler/src/emit/client.ts) · [markup-client.ts](../../packages/compiler/src/emit/markup-client.ts) | `$u`, la pasada de render, suscrita a las signals propias; y el reenvío al hijo cuando el valor puede moverse sin ser una signal | los descubrió la tarea 13, y sin ellos la hidratación es correcta y **no se ve**: el runtime levantaba el componente y la vista no cambiaba. Ninguno es de este SDD —son del emit de cliente— pero los dos bloquean su HITO, así que se cierran aquí. Ver el cuerpo del commit |
| [core/src/index.ts](../../packages/core/src/index.ts) | exporta `installHydration`; se corrige la cabecera | hoy dice que la hidratación la conduce «el capturador global de SDD-17, no este módulo» — desde la tarea 7 el capturador **es** de este módulo |
| [vite/src/plugin.ts](../../packages/vite/src/plugin.ts) | `load(MAIN_ID)` deja de devolver `export {};`; `BUILD_TOKEN` alcanza al chunk `fudic-main`; `resolveId` publica la URL de dev de los chunks de cliente; el shell se completa con el grafo de `fudic-main` | son los cuatro agujeros de la tabla de arriba; sin ellos no hay página que cargue el runtime, ni URL en dev, ni precache correcto |
| [vite/src/bootstrap.ts](../../packages/vite/src/bootstrap.ts) | `emitMainBootstrap` instala el runtime y elige los dos puertos; `emitSwBootstrap` gana el handler de `warm` y un `SHELL` calculado | es el único punto donde se sabe si hay SW y cuáles son `base` y `build` |
| [vite/src/swbuild.ts](../../packages/vite/src/swbuild.ts) | pasa el shell ampliado al bootstrap del SW | la lista deja de venir solo de `sw.json` |
| [transport/src/messages.ts](../../packages/transport/src/messages.ts) | nuevo `WARM_MESSAGE` junto a `LOCATION_MESSAGE` | el contrato main→SW vive ahí; el warm de §4.7 es el segundo mensaje |
| [transport/src/router.ts](../../packages/transport/src/router.ts) | el `warm` por ruta gana un hermano: `warmHydration(tags)` — el chunk del tag y lo que ese chunk importa | reutiliza el `Store` y su sellado en vez de escribir la cache a mano; el grafo entero o el tag no cuenta como warmeado |
| [transport/src/manifest.ts](../../packages/transport/src/manifest.ts) · [urls.ts](../../packages/transport/src/urls.ts) | `hydrate`: tag → ficheros que su chunk importa, y `hydrateDeps` para leerlo | es lo único de un chunk de hidratación que no es derivable: el código compartido lleva hash de contenido. Va en el manifiesto y no en la página porque se purgan con el mismo build |
| [vite/src/plugin.ts](../../packages/vite/src/plugin.ts) · [manifest.ts](../../packages/vite/src/manifest.ts) | en `generateBundle`, el grafo estático de cada chunk de cliente pasa al manifiesto | el único sitio del build donde se sabe cómo quedó el reparto de chunks |
| [core/README.md](../../packages/core/README.md) | sección de hidratación | el paquete pasa a tener dos caras: la clase base y el runtime de página |
| [docs/sdd/SDD-17-hidratacion.md](./SDD-17-hidratacion.md) | §2 (dependencia opcional), §4.7.1, un invariante en §5 y el criterio 24 | el caso «sin SW» no estaba previsto y cambia el contrato, no solo el plan |
| [docs/sdd/INDEX.md](./INDEX.md) · [PENDIENTES-v1.md](./pendings/PENDIENTES-v1.md) | estado de SDD-17 y lo que queda de v1 | es el cierre: el índice tiene que poder leerse y decir «terminado» |
