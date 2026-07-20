# Prototipo de referencia de SDD-17 — runtime de hidratación

Evidencia ejecutable de [`docs/sdd/SDD-17-hidratacion.md`](../../sdd/SDD-17-hidratacion.md):
los **cuatro prototipos divergentes fusionados en un solo capturador**, con el escenario de
aceptación de §6 en una única página.

Antes, cada pieza vivía en su propia copia del mismo runtime y **nunca se habían ejecutado
juntas**: `hidratacion/` (base: tres caminos + replay + SW), `cascade/` (post-orden),
`bus/` (hidratación dirigida) y `hidratación-last/` (warm por viewport). Esas cuatro ramas
están eliminadas; su contenido vive aquí.

## Servir

Necesita HTTP: ni el Service Worker ni `import()` arrancan en `file://`.

```sh
node ../serve.js          # servidor del repo
# o
npx serve .
# o
python3 -m http.server 8000
```

## Ficheros

| Fichero | Papel |
|---|---|
| `index.html` | Página SSR con DSD `open` real, los **cuatro mapas de emit**, panel de traza y utilidades de verificación. |
| `runtime.js` | El único JS de app en la carga inicial: capturador global, tres caminos, bus, cascada, warm, SW. |
| `fudic-dom.js` | `browserDom` (`el`/`append`/`event`/`bus`), `signal`, `emit`. Es `@fudic/dom` reducido a lo que el escenario ejercita. |
| `components/*.js` | Los diez chunks, en la forma del controlador de SDD-15 §4.6: `static c($props)` → `{c,h,r}`, con `m` y `s` como closures privadas y `$d` para los disposers. |
| `sw.js` | Service Worker: ejecuta el warm (prioridad baja, idempotente) y sirve los chunks cache-first / network-first. |
| `serve.json` | Cabeceras de cacheo para `serve`. |

## Lo que este prototipo implementa y ninguno de los cuatro tenía

1. **Orden bus → subárbol → host** dentro del camino 2 (§4.4). `preHydrateBus(tag)` primero,
   luego la cascada, luego el host, luego el replay. Bus y cascada se habían validado en
   prototipos separados; el orden entre ellos lo fija SDD-17.
2. **`prepareTag(tag)` en vez de `hydrateSubtreePostorder(host)` a secas.** `define` upgradea
   **todas** las instancias del tag, así que el subárbol de **todas** se prepara antes de
   definir. Búsqueda de instancias que **atraviesa shadow roots** descendiendo por
   `.shadowRoot` (`querySelectorAll` no cruza).
3. **`fud-chunks`** — el mapa `tag → URL` se lee del documento; sustituye a la convención
   hardcodeada `./components/${tag}.js` que arrastraban los cuatro. Un tag ausente no es
   hidratable y el runtime no lo pide.
4. **`fud-state` posicional `[[offsets],[data]]`** (SDD-15 §3.3), con `data-id` entero base-0
   correlativo. **No hay `window.__fudState`**: el runtime parsea el payload y **pasa** el
   tramo a la instancia con `host.h(data.slice(offsets[id], offsets[id+1]))`.
5. **`warmClosure(tag)`** — el warm precachea el **cierre transitivo** (`fud-bus[tag]` y,
   recursivamente, `fud-tree[tag]`), no el tag suelto.
6. **Componentes en la forma del emit real** (SDD-15 §4.6), con adopción por **traversal
   posicional** (`$shadow.children[i]`, `firstElementChild`/`nextElementSibling`), nunca
   `querySelector` ni `cloneNode`, y `bus:` desugarizado a `$dom.bus(...)` con baja en `r()`.

### Una pieza que el SDD no nombra: el conjunto `attached`

`customElements.define` upgradea todas las instancias del tag de golpe, pero **ninguna puede
conocer su propio `data-id`** (SDD-17 §3), así que su `connectedCallback` no puede enrutar su
`h()`. Es el runtime quien reparte los tramos, y debe hacerlo para **todas** las instancias del
tag en el instante en que el tag se define — si no, el camino 3 encontraría una instancia
upgradeada pero sin enganchar y el criterio 3 fallaría.

`attached` (por `data-id`) registra ese reparto y es **independiente** de `hydrated`, que sigue
gobernando los tres caminos. Es lo que mantiene a la vez «descarga por tag» y «el camino 3
emite `shared-chunk`».

## Cómo verificar los 23 criterios de SDD-17 §6

Abre DevTools con **Network (filtro JS)**, **Application → Cache Storage** y el panel de traza
de la propia página. Recarga con el SW ya activo cuando el criterio hable de cache.

### Base

1. **Carga inicial.** Network (JS): solo `runtime.js` (y `fudic-dom.js` no aparece — lo importan
   los chunks, no el runtime). Ningún `components/*.js`. Botón
   **«comprobar `:not(:defined)`»** → lista todos los tags.
2. **Camino 2.** Click en `app-counter` **#0**. Traza: `camino 2 … tag NO definido` →
   `hidrata <app-counter> #0 (host, prof 0)` → `replay del click`. Network baja
   `app-counter.js`. El contador pasa **3 → 4 en ese mismo primer click**.
3. **Camino 3.** Click en **#1**. Traza: `camino 3 … marcar y salir (shared-chunk)` y
   `fud:hydrated #1 from=shared-chunk 0.0ms`. Network **no** vuelve a bajar el chunk. El
   contador pasa **10 → 11** en su primer click.
4. **Camino 1.** Clicks sucesivos en #0 y #1: la traza ya no muestra ningún `camino …`, solo
   `handler app-counter: count = …`. **Un click = un incremento**, nunca dos.
5. **Estado independiente por instancia.** #0 arranca en 3 y #1 en 10, cada uno de su tramo
   (`data.slice(0,1)` y `data.slice(1,2)`). Mover uno no toca al otro.
6. **INP.** Performance → *Interactions*, o el `[Nms]` de la traza. Con el chunk en cache el
   coste de resolución cae a ~0 ms.

### Cascada

7. **Post-orden verificable.** Click en el botón de **padre A**. La traza muestra, en este
   orden: `cascada: hidrata <app-greatgrandchild> #6 (prof 3)` → `#5 (prof 2)` →
   `#4 (prof 1)` → `hidrata <app-parent> #3 (host, prof 0) … ← el último`. Los `● vivo` de las
   taglines se encienden de dentro afuera.
8. **Padre antes del replay; handler tras el replay.** `hidrata <app-parent> #3` precede a
   `replay del click`, y `handler app-parent (padre A): count = 1` va después. El contador del
   padre pasa a **1 en el primer click**.
9. **Preparación por tag (`prepareTag`).** En esa misma traza aparece
   `prepareTag: <app-parent> tiene 2 instancias; se prepara el subárbol de TODAS`, y las líneas
   de cascada de **#6/#5/#4** (padre A) **y #10/#9/#8** (padre B) salen **antes** de
   `hidrata <app-parent>`. Después, click en el botón de **padre B** → camino 3, y su
   `count` pasa a 1 con su subárbol vivo.
   **Es el test que falla con `hydrateSubtreePostorder` a secas.**

### Bus

10. **Orden bus → subárbol → host.** Click en «Añadir» del Café. Traza:
    `bus: pre-hidratar receptor <shopping-cart> ANTES del emisor <product-list>` →
    `bus: <shopping-cart> vivo` → `cascada: preparar subárbol de <product-list>` →
    `hidrata <product-list> #12 (host, prof 0)`.
11. **El evento de bus no se pierde en el primer click.** Tras el `replay`, la traza muestra
    `emisor product-list: emit('carrito', Café)` y luego `carrito recibido: Café (+3.50 €) →
    items=1 total=3.50 €`. Badge **1**, importe **3.50 €** en ese primer click.
12. **Sin doble disparo.** Añade Té y Leche (camino 1): badge **3**, importe **7.50 €**.
13. **Solo el suscriptor escucha en `document`.** `shopping-cart` registra a propósito, además
    del `bus:`, un `@carrito` de **host**. Nunca se dispara: si lo hiciera, la traza mostraría
    `!! un @carrito de host SÍ recibió`. El emisor es hermano, no ancestro.
14. **Baja limpia.** Botón **«desconectar `<shopping-cart>`»** → traza
    `r() shopping-cart: baja del listener de bus en document`. Después, botón **«emitir
    `carrito` suelto»**: no aparece ninguna línea `carrito recibido`. Sin fuga.

### Warm

15. **Solo se precachea lo visible.** Recarga, espera ~1 s, botón **«listar Cache Storage»**:
    aparecen los chunks de los tags con instancias en el viewport inicial. **`app-note.js` no
    está.** (Con una ventana muy baja puede que `product-list`/`app-cold` tampoco entren
    todavía: es el comportamiento correcto — la red se gasta en proporción a lo visible.)
16. **Warm por scroll.** Baja hasta pasar el hueco de 130vh. En ese momento la traza muestra
    `warm: <app-note> depositado en cache`, y no antes. Re-lista Cache Storage.
17. **Warm por tag, no por instancia.** Hay dos `app-counter` y dos `app-parent` en viewport:
    Cache Storage tiene **una** entrada por tag y Network **una** petición por tag.
18. **Warm del cierre transitivo.** Con `app-parent` en viewport se precachean también
    `app-child.js`, `app-grandchild.js` y `app-greatgrandchild.js`; con `product-list` en
    viewport se precachea `shopping-cart.js` — aunque nadie haya interactuado.
19. **Prioridad baja.** Network → columna *Priority*: las peticiones de warm figuran como
    `Low` (el SW hace `fetch(url, { priority: 'low' })`).
20. **Idempotencia.** Recarga con el SW activo: Network no vuelve a descargar los chunks ya
    cacheados. Doble capa: `warmedTags` en cliente, `cache.match(url)` en el SW.
21. **Cache-hit tras warm.** Primer click en un tag ya precacheado: la traza lo marca
    `· cache-hit` y el `[Nms]` de resolución del chunk es ~0.
22. **Cache-miss sin warm.** `app-cold` está en `NO_WARM` (solo demo). Su primer click marca
    `· cache-miss (red)` y Network muestra la petición **dentro** del gesto.
23. **Todo definido al final.** Tras interactuar con todo, botón **«comprobar
    `:not(:defined)`»** → `vacío, también dentro de los shadow roots` (el recorrido desciende
    por `.shadowRoot`).

## Límites conocidos de este prototipo

- **`cache-hit`/`cache-miss` en la traza es una aproximación.** Se decide con `warmedTags`, que
  se marca cuando el warm se **ordena**, no cuando el SW termina de depositar. Si interactúas
  antes de que el warm complete, la traza dirá `cache-hit` y la red se pagará igual. La
  autoridad real es la columna *Size* / `x-fud-source` de Network.
- **Las URLs de `fud-chunks` no van hasheadas.** Son rutas reales a ficheros del repo; el emit
  real emite nombres hasheados para cacheado inmutable. `sw.js` reconoce los chunks por el
  prefijo `/components/`; con el emit real ese predicado se ajusta.
- **Los `<style>` van inline en cada `<template shadowrootmode>`** (SDD-15 §4.8), duplicados
  entre las dos instancias de la cadena de composición. Es lo que el emit hace; el navegador
  deduplica las hojas idénticas en memoria.
- **El paso de props padre→hijo no está ejercitado.** El runtime solo garantiza el **orden**;
  el paso de estado lo resuelve el sistema de props del código emitido, que no está aquí.
- **Solo `click`.** Los eventos que no burbujean y el replay de eventos con carga no
  reproducible por el constructor quedan fuera (SDD-17 §8).
