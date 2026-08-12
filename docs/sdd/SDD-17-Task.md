# SDD-17 — el runtime de hidratación, y el entorno que no siempre está

**Estado:** `Pendiente` · **Rama:** `worktree-sdd-17-hidratacion` · **SDD:**
[SDD-17](./SDD-17-hidratacion.md)

Nada de esto existe todavía: `@fudic/core` tiene `FudicElement` y las señales, y el capturador
global no está escrito. Alrededor de él faltan tres piezas de andamio sin las cuales no llega a
una página — el hilo principal no conoce el `build` (hoy solo lo recibe el bundle del SW por
sustitución de `BUILD_TOKEN`), `fudic-main.js` es literalmente `export {};` cuando no hay
Service Worker, y en dev el chunk de cliente de un tag no se publica en ninguna URL.

**Lo que la SDD no prevé: el Service Worker puede no estar.** No es solo dev. Son cuatro casos,
y en tres de ellos la página está perfectamente viva:

| caso | ¿SW? |
|---|---|
| Sin `sw.json` — decisión explícita del proyecto ([`swconfig.ts`](../../packages/vite/src/swconfig.ts)) | nunca |
| `pnpm dev` con `dev: 'off'` (el valor por defecto) | nunca |
| **Primera carga**, aún sin `clients.claim()`: `navigator.serviceWorker.controller === null` | todavía no |
| Contexto inseguro o navegador sin SW | nunca |

El runtime **es uno solo**: los tres caminos, la cascada, el bus y el replay no dependen de que
haya SW. Lo que se bifurca son **dos puertos que el bootstrap inyecta**, porque el bootstrap es
el único que sabe en qué modo se emitió la página:

- `resolveChunk(tag) → url` — `hydrateUrl(tag)` en build; la URL del dev server en dev.
- `warm(urls, tags)` — `postMessage` al SW cuando hay controlador; `modulepreload` cuando no.

Con eso `@fudic/core` no importa `@fudic/transport` (no se rompe la frontera de paquetes) y el
caso «sin SW» deja de ser una rama dentro del runtime para ser otra implementación del puerto.
El warm sigue siendo optimización, no requisito: un puerto que no hace nada es correcto — y por
eso el orden de abajo lo deja para el final. Queda anotado en la SDD como §4.7.1, invariante en
§5 y criterio 24.

Los ficheros nuevos de `@fudic/core` nacen al 100 % en las cuatro métricas; el paquete ya está
configurado así ([`vitest.config.ts`](../../packages/core/vitest.config.ts)).

## Orden

Cuatro fases, y el orden importa: **el runtime primero**, porque con los dos puertos inyectados
es íntegramente verificable en Vitest sin navegador, sin red y sin Vite; el andamio después,
que es lo que lo pone en una página; el warm el último, porque mide sobre algo que ya funciona.
Ninguna tarea depende de una posterior. El hito real es el **12**: hidratación completa,
verificada en navegador, sin Service Worker en ninguna parte.

### Fase 1 — el runtime (`@fudic/core`, todo nuevo, Vitest + happy-dom)

| ✓ | # | tarea | fichero (función) |
|---|---|---|---|
| [ ] | 1 | Lectura de los tres bloques JSON de la página y tramo por instancia (`data.slice(offsets[id], offsets[id+1])`). Sin global: el tramo se **pasa**, no se publica | `src/hydrate/maps.ts` |
| [ ] | 2 | Localizar instancias **por tag** descendiendo por `shadowRoot` (`querySelectorAll` no cruza la frontera), y los dos conjuntos que gobiernan todo: `hydrated` (los tres caminos) y `attached` (el reparto) | `src/hydrate/registry.ts` |
| [ ] | 3 | `ensureDefined(tag)` memoizado por tag (`inflight`) sobre el puerto `resolveChunk`: descarga por tag, hidratación por instancia | `src/hydrate/chunks.ts` |
| [ ] | 4 | Cascada post-orden y su corrección por tag: `prepareTag` prepara el subárbol de **todas** las instancias antes del `define`, y `attachAll` reparte el tramo a todas. Es el criterio 9, el que falla con `hydrateSubtreePostorder` a secas | `src/hydrate/cascade.ts` |
| [ ] | 5 | `preHydrateBus(tag)`: receptores de `fud-bus` levantados **en secuencia** (no `Promise.all`) antes de la cascada, cada uno con su propio `prepareTag` + `attachAll` | `src/hydrate/bus.ts` |
| [ ] | 6 | El capturador: un listener en captura, los tres caminos, y el replay reconstruyendo el evento con su constructor sobre `composedPath()[0]`. El replay reentra y cae en el camino 1 — ahí se cierra el doble disparo | `src/hydrate/capture.ts` · `src/hydrate/replay.ts` |
| [ ] | 7 | `installHydration({ root, resolveChunk, warm })`: el orden 3→4→5→6 y los eventos `fud:ready` / `fud:hydrated` (`from`: `downloaded` \| `shared-chunk` \| `bus` \| `subtree`). Aquí se declara el puerto `WarmChannel` y su implementación nula, que es la que usan las fases 1 y 2 | `src/hydrate/install.ts` · `src/hydrate/warm/channel.ts` · [index.ts](../../packages/core/src/index.ts) *(se añade el export)* |

### Fase 2 — que una página lo cargue (`@fudic/vite`, `examples/basic`)

| ✓ | # | tarea | package | fichero (función) |
|---|---|---|---|---|
| [ ] | 8 | El hilo principal no puede construir el resolver de §4.6: `base` lo tiene Vite y el `build` solo se sustituye sobre el bundle del **SW**. Extender la sustitución de `BUILD_TOKEN` al chunk `fudic-main` y hornear `base` en él | `vite` | [plugin.ts:588](../../packages/vite/src/plugin.ts#L588) *(hoy solo toca `sw.code`)* · [bootstrap.ts](../../packages/vite/src/bootstrap.ts) |
| [ ] | 9 | Sin `sw.json` —o en dev— `load(MAIN_ID)` devuelve `export {};`: la única página que existe no carga runtime alguno. Pasa a instalar **siempre** la hidratación con los puertos inyectados; lo condicional es el `registerRenderServiceWorker` | `vite` | [plugin.ts:428-436 `load`](../../packages/vite/src/plugin.ts#L428-L436) · [bootstrap.ts `emitMainBootstrap`](../../packages/vite/src/bootstrap.ts#L138) |
| [ ] | 10 | En dev no hay `assets/h/<tag>-<build>.js`: el módulo de cliente es `<path>.fud?client` y nadie lo publica. URL de dev estable por tag (`<base>@fudic/h/<tag>.js` → `transformRequest(clientId(path))`), igual que `DEV_SCRIPT_IDS` publica los dos bootstraps | `vite` | [plugin.ts:97 `DEV_SCRIPT_IDS`](../../packages/vite/src/plugin.ts#L97) · [client.ts `clientId`](../../packages/vite/src/client.ts) · [dev.ts `devUrl`](../../packages/vite/src/dev.ts) |
| [ ] | 11 | El escenario de §6: dos `app-counter` + `app-toggle`, la cadena de composición de 4 niveles, emisor/suscriptor de bus, un tag fuera del viewport inicial y otro excluido del warm | `examples/basic` | `src/routes/hidratacion.fud` + componentes *(nuevos)* |
| [ ] | 12 | **Hito.** Playwright: criterios 1–14 y 23, ejecutados en `pnpm dev` y en un build **sin `sw.json`**. La hidratación entera, sin Service Worker en ninguna parte y sin una línea de warm | `examples/basic` | `tests/hydration.spec.ts` *(nuevo)* · [sw-network.spec.ts](../../examples/basic/tests/sw-network.spec.ts) *(patrón a seguir)* |

### Fase 3 — warm (§4.7 y §4.7.1)

| ✓ | # | tarea | package | fichero (función) |
|---|---|---|---|---|
| [ ] | 13 | El disparador, idéntico en los dos canales: `IntersectionObserver` (`threshold: 0`, `unobserve` tras la primera vez), cierre transitivo por `fud-bus` + `fud-tree`, `requestIdleCallback` con `timeout: 800` y `warmedTags` idempotente | `core` | `src/hydrate/warm/observer.ts` *(nuevo)* |
| [ ] | 14 | Canal **sin** SW, primero por no depender de nada: `<link rel="modulepreload">` por chunk. Descarga y parsea sin **evaluar**, así que el invariante de cero JS de componente se mantiene; `fud:warmed` se emite en su `load` | `core` | `src/hydrate/warm/preload.ts` *(nuevo)* |
| [ ] | 15 | El SW no entiende `warm`: solo conoce `LOCATION_MESSAGE` y warmea **por ruta**. Añadir el mensaje, su handler, la descarga con `priority:'low'`, la idempotencia por `cache.match` y la respuesta `warmed` | `transport` · `vite` | [messages.ts](../../packages/transport/src/messages.ts) · [router.ts `warm`](../../packages/transport/src/router.ts#L277) · [bootstrap.ts `emitSwBootstrap`](../../packages/vite/src/bootstrap.ts#L27) |
| [ ] | 16 | Canal **con** SW: `controller.postMessage({type:'warm', …})`. Si `controller === null` **no se envía nada** —no hay a quién— y se reintenta al `controllerchange`, porque la primera carga nunca está controlada aunque el SW esté registrado | `core` | `src/hydrate/warm/sw.ts` *(nuevo)* |
| [ ] | 17 | El bootstrap elige: canal SW cuando la página se emitió con `sw.json` (y en dev con `dev:'preview'`), canal `modulepreload` en el resto. Un único módulo emitido, la elección hecha en build | `vite` | [bootstrap.ts `emitMainBootstrap`](../../packages/vite/src/bootstrap.ts#L138) |

### Fase 4 — cierre

| ✓ | # | tarea | package | fichero |
|---|---|---|---|---|
| [ ] | 18 | Criterios 15–21 **dos veces**, contra los dos canales, más el 24. Un criterio de warm que solo pase con SW no está verificado | `examples/basic` | `tests/hydration.spec.ts` |

## Ficheros existentes que se tocan, y por qué

| fichero | qué cambia | por qué |
|---|---|---|
| [core/src/index.ts](../../packages/core/src/index.ts) | exporta `installHydration`; se corrige la cabecera | hoy dice que la hidratación la conduce «el capturador global de SDD-17, no este módulo» — a partir de la tarea 7 el capturador **es** de este módulo |
| [vite/src/plugin.ts](../../packages/vite/src/plugin.ts) | `load(MAIN_ID)` deja de devolver `export {};`; la sustitución de `BUILD_TOKEN` alcanza al chunk `fudic-main`; `resolveId` publica la URL de dev de los chunks de cliente | sin estas tres, no hay página que cargue el runtime ni URL que pedir |
| [vite/src/bootstrap.ts](../../packages/vite/src/bootstrap.ts) | `emitMainBootstrap` deja de emitir solo el registro del SW: instala el runtime y elige los dos puertos. `emitSwBootstrap` gana el handler de `warm` | es el único punto donde se sabe si hay SW y cuáles son `base` y `build` |
| [transport/src/messages.ts](../../packages/transport/src/messages.ts) | nuevo `WARM_MESSAGE` junto a `LOCATION_MESSAGE` | el contrato main→SW vive ahí; el warm de §4.7 es el segundo mensaje |
| [transport/src/router.ts](../../packages/transport/src/router.ts) | el `warm` por ruta gana un hermano: warm por lista de URLs | reutiliza el `Store` y su sellado en vez de escribir la cache a mano |
| [docs/sdd/SDD-17-hidratacion.md](./SDD-17-hidratacion.md) | §2 (dependencia opcional), §4.7.1, un invariante en §5 y el criterio 24 | el caso «sin SW» no estaba previsto y cambia el contrato, no solo el plan |
| [docs/sdd/INDEX.md](./INDEX.md) | fila 17: enlace a estas tareas | igual que la fila de SDD-27 |
