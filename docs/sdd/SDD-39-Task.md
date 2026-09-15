# SDD-39 — Tareas · Rutas reactivas

> **SDD:** [SDD-39 — Rutas reactivas](./SDD-39-rutas-reactivas.md)
> **Paquetes:** `@fudic/compiler` (el reparto del `@code` y el emisor de cliente) ·
> `@fudic/ssr` (`stateOf`) · `@fudic/core` (los dos bloques y el camino de subida) ·
> `@fudic/vite` (el chunk, su nombre, `FUD0620`) · `@fudic/example-basic` (las evidencias)
> **Rama:** `worktree-sdd-39-rutas-reactivas`
> **Progreso:** 19 / 19

Una ruta pasa a comportarse como un componente. No hay mecanismo nuevo en el runtime: hay una
raíz distinta —el `<body>` en vez de un `shadowRoot`— y un nombre que sale de un bloque JSON en
vez de un `localName`. Todo lo demás ya existe y se reutiliza tal cual.

Cada tarea es un paso cerrado: se implementa, se verifica y se marca. Ninguna depende de tareas
posteriores.

---

## Los cinco hitos

**Hito A — el `@code` de una ruta deja de perderse.** La zona neutra llega a los dos lados y
`@client` recibe su *stub* inerte en el módulo de render. Con esto solo, `/ruta-reactiva`
prerenderiza y pinta su valor inicial: el `count is not defined` desaparece antes de que exista
un solo byte de chunk.

**Hito B — el chunk.** El emisor de cliente camina el layout con la ruta empalmada y adopta desde
el `<body>`. Es donde vive el grueso del trabajo, y donde las secciones dejan de ser un caso
aparte.

**Hito C — la página lo dice.** `data-fud-id` en el `<body>`, `fud-route` con el `safeName`,
`fud-data` recortado. Los tres siguen la regla de siempre: lo vacío no se emite.

**Hito D — el runtime lo levanta.** El respaldo del capturador, la cascada por la luz, la
exclusión del warm y `effect` entrando en `fud-eager` — que vale igual para un componente.

**Hito E — el build y las evidencias.** El chunk se publica y se nombra, un prerender roto rompe
el build, y `examples/basic` lo demuestra en Chrome real con el reloj.

**Fuera de esta tanda:** la mitad de cliente de un layout, la reactividad en el `<head>`, la
navegación en sitio y una `data` que se mueva (§7).

---

## Fase 1 — El `@code` de una ruta llega a los dos lados (3)

- [x] **1. Una ruta pasa por `extractCode`.**
      `emitRouteModuleMapped` y `emitPageModuleMapped` dicen hoy por escrito que una ruta *no*
      pasa por `extractCode` porque su `@code` es el módulo `?server`. Deja de ser cierto: la
      entrada se extrae como la de un componente y sus diagnósticos viajan con los del emit.
      Retirar los dos comentarios que afirman lo contrario, que si no quedan mintiendo.
- [x] **2. La zona neutra y el stub inerte, en el módulo de render.**
      `buildRouteModule` y `buildPageModule` escriben la zona neutra íntegra y los *stubs*
      inertes de los nombres de `@client`, en el mismo orden y con la misma forma que
      `buildComponentModule` (SDD-31 §4.6). Criterios §6.1 y §6.2.
- [x] **3. `emitServerModule` deja de mentir por omisión.**
      El `?server` sigue llevando **solo** `@server` —eso no cambia y es lo correcto—, pero el
      comentario de cabecera dice que ahí va «el `@code` de la página». Corregirlo: lo que va es
      su región de servidor, y el resto tiene ahora su propio destino.

## Fase 2 — El chunk de una ruta (5)

- [x] **4. La composición en tiempo de compilación.**
      Un helper que devuelve el markup del layout —la cadena entera— con el cuerpo de la ruta
      empalmado en `@RenderBody()` y cada sección en su `@RenderSection(nombre)`. Solo lectura
      sobre `graph.layouts`, sin tocar la emisión del servidor: la composición por módulo ES sigue
      siendo la del render (SDD-21). Criterio §6.5.
- [x] **5. `emitRouteClientModule`.**
      El emisor. Reutiliza `MarkupEmitter` en su rama de cliente sobre el árbol de la tarea 4, con
      `$root` donde un componente pone `$shadow`. Devuelve `null` cuando la ruta no tiene mitad de
      cliente. Criterios §6.3 y §6.4.
- [x] **6. La forma del módulo.**
      Exportación por defecto `([$dom, $root, $data, ...$props]) => ({h, u, r})`. **Sin `c`**: una
      ruta no se fabrica nunca en caliente. Las tres diferencias con el chunk de un componente y
      ninguna más (§3.4).
- [x] **7. Los anclajes son todos de la ruta.**
      Atravesar el markup del layout produce llamadas al cursor y **ni un anclaje**. Test que
      exige una sola entrada en `sources` y que ningún mapeo apunte al `.fud` del layout: es lo
      que mantiene en pie el invariante de SDD-13 §4.3. Criterio §6.6.
- [x] **8. `isReactiveRoute` y `routeHydration`.**
      Los dos predicados de §3.1, sobre el markup de la ruta y sus secciones. `routeHydration`
      devuelve `'eager'` con un `control` o un `effect(...)`, y `'gesture'` en todo lo demás.
      Nace al 100 %: son dos funciones puras sobre el grafo.

## Fase 3 — Lo que la página publica (4)

- [x] **9. `stateOf` en `@fudic/ssr`.**
      Rellenar la rebanada de un host que se tiene **directamente**, no a través del shadow que
      posee. `state(shadow, …)` pasa a delegar en ella, para que haya una implementación y no dos.
      Nace al 100 %.
- [x] **10. El `<body>` reclama su id.**
      Desde el hueco `blocks($dom, $parent)`, que es donde `$parent` es ese nodo, y **solo** si la
      ruta es reactiva. Rellena su rebanada con `stateOf`. Criterio §6.7.
- [x] **11. El bloque `fud-route`.**
      Con `safeName(patrón)`. El compilador no conoce el patrón —lo conoce el plugin—, así que
      entra por `EmitOptions` como entran ya el especificador de componente y el de layout. Sin
      mitad de cliente, no hay bloque.
- [x] **12. El bloque `fud-data`, recortado.**
      Recoger del AST de `@client` las **raíces** que se leen de `data` y serializar solo esas.
      Un acceso dinámico manda `data` entero **y no emite diagnóstico** (§4.8). Si la mitad de
      cliente no lee `data`, no hay bloque. `FUD0621` cuando lee `data` y no hay `load`.
      Criterios §6.15 y §6.16.

## Fase 4 — El runtime la levanta (4)

- [x] **13. `readPageMaps` lee dos bloques más.**
      `route: string | null` y `data`. Ausencia = caso base, como los otros cuatro. Nace al 100 %.
- [x] **14. El respaldo del capturador.**
      Si el recorrido de `composedPath()` no encuentra ningún `[data-fud-id]` por debajo y la
      página declara ruta, la ruta toma el camino 2 completo: marcar antes del `await`,
      `preventDefault`, `stopImmediatePropagation`, descarga y replay. Un clic dentro de un
      componente sigue ganándolo el componente, que es lo que el orden del array ya garantiza.
      Criterios §6.10, §6.11 y §6.12.
- [x] **15. La cascada baja por la luz.**
      `visit` desciende por `host.shadowRoot ?? host`. Y la entrada de la ruta en `fud-tree` lista
      **solo** los componentes a los que les pasa una prop — más estricto que la regla de un
      componente, y a propósito (§4.10). Criterios §6.8 y §6.9.
- [x] **16. `effect` entra en `fud-eager`, y el `<body>` sale del warm.**
      Las dos son de la misma tarea porque las dos son sobre quién sube sin gesto. `effect` vale
      igual para un componente que para una ruta, y se detecta con la búsqueda que
      `checkNeutralEffect` ya hace. El observador de warm deja de mirar el `<body>`. Criterio
      §6.13.

## Fase 5 — El build (3)

- [x] **17. `transformFudClient` acepta rutas.**
      Deja de devolver `null` para `route-document` y `page-document`. Retirar el comentario que
      dice que una ruta se renderiza y no se hidrata: era verdad y deja de serlo.
- [x] **18. El chunk, nombrado y descubierto.**
      `assets/h/<safeName>`, junto a los de componente y con la misma aritmética. Descubrimiento
      de rutas reactivas para la pasada `client`, y `FUD0622` si un nombre de ruta colisiona con
      un tag. En `dev`, la misma URL con el prefijo estable (§4.12). Criterio §6.14.
- [x] **19. `FUD0620`: un prerender roto rompe el build.**
      Hoy avisa y termina en verde, y se publica un sitio con una página menos. Sin span: es un
      error del build, como los `CliError` de SDD-22. Criterio §6.17.

## Fase 6 — Las evidencias (dentro de la fase 5, verificadas en Chrome real)

Las dos rutas ya están escritas (`ac9ef66`); lo que falta es que funcionen y el reloj.

- [x] **`/ruta-evento`** — el `@code` se reescribe dentro de `@client`, que es su sitio. La
  página se genera con `fud-route` y el `<body>` marcado; queda pulsar el botón en Chrome
  (§6.18).
- [x] **`/ruta-reactiva`** — el `@code` se reescribe dentro de `@client`: ya no hace falta la
  zona neutra, porque el servidor declara los nombres reactivos inertes. La página **se
  genera** y pinta `1` en el contador de la ruta y en el del componente de control; queda
  comprobar el `+1` en Chrome (§6.19).
- [x] **`app-clock`** — nuevo, como componente **y** escrito directo en `/ruta-reloj`. Las dos
  formas entran en `fud-eager` (`["app-clock","ruta-reloj"]`) y el servidor pinta la hora en
  las dos; queda ver que avanzan solas y que el `clearInterval` corre al navegar fuera
  (§6.20, §6.21).

---

## Verificación final

- [x] `pnpm typecheck` y `pnpm test` en verde en todo el workspace.
- [x] `pnpm build` de `examples/basic` **sin** avisos de prerender, y con `dist/ruta-reactiva/`,
      `dist/ruta-evento/` y `dist/ruta-reloj/` presentes.
- [x] Los criterios de §6, salvo los tres que piden un navegador (§6.18–§6.20).
- [x] `@fudic/core` y `@fudic/ssr` al 100 % en las cuatro métricas. `@fudic/compiler` sale en
      99,22 / 98,03 / 99,38 / 99,66 contra 99,19 / 98,01 / 99,35 / 99,64 al empezar, y
      `@fudic/vite` en 96,18 / 90,12 / 96,37 / 96,07 contra 95,99 / 89,91 / 96,23 / 95,89:
      las ocho por encima.
- [ ] Las tres rutas comprobadas en **Chrome real**, el reloj incluido y navegando fuera para
      ver el `clearInterval`. Lo que se puede comprobar sin navegador está comprobado —la
      adopción y la reacción de una ruta compuesta con su layout se ejecutan de verdad en
      `packages/compiler/test/emit/hydrate/route.test.ts`, con la construcción prohibida
      durante `h`— y el resto es la pasada de Pedro.
