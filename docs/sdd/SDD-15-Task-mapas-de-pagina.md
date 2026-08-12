# SDD-15 — Tareas · `data-fud-id` y los mapas de página

> **SDD:** [SDD-15 — Emit (AST → runtime)](./SDD-15-emit.md) §3.1–§3.6, §4.1, §4.2
> **Paquetes:** `@fudic/compiler` (emit) · `@fudic/ssr` (`SsrDom`) · `@fudic/vite` (el plugin
> los escribe) · `@fudic/transport` (coordinación con el manifiesto)
> **Rama:** `sdd-15-mapas-de-pagina`
> **Progreso:** 25 / 26
> **Va DESPUÉS de:** [eventos y bus](./SDD-15-Task-eventos-y-bus.md) (22/22) y
> [SDD-31 — Signals derivadas](./SDD-31-signals-derivadas.md) (`Hecho`).

Tercera y **última** tanda de la rama de cliente de SDD-15. Las dos anteriores dejaron el
chunk de componente completo: el factory `static c($props)` con `{c, h, u, r}`, `$s()`
enganchando eventos y bus, `$a()` como único punto de escritura, y el pase inicial +
`$sub(...)` de las props reactivas que cruzan al hijo. Todo eso **funciona en aislamiento** y
no lo pide nadie: la página no dice quién se hidrata, no dice con qué estado, y no dice en
qué orden. Esta tanda es el enlace.

Cada tarea es un paso cerrado: se implementa, se verifica y se marca. Ninguna depende de
tareas posteriores.

---

## Alcance, dicho por su frontera

**Dentro:** el atributo de identidad de instancia y los mapas JSON que la página publica.
Nada más.

**Fuera, y sin ambigüedad: TODO el runtime.** El capturador de SDD-17 —los tres caminos, el
`prepareTag`/`attachAll`, la cascada en post-orden, la pre-hidratación de receptores de bus,
el replay y el warm— **no se escribe en esta tanda**, ni entero ni a medias. El `runtime.ts`
que `main.js` arrastrará no se toca. Esta tanda produce los **datos** que aquel módulo va a
leer, y se cierra cuando esos datos son correctos, deterministas y verificables **sin
navegador**.

La razón de partirlo así no es de comodidad. Los mapas se verifican leyendo texto: un HTML
prerenderizado, tres bloques JSON, y unas cuantas aserciones en Node. El runtime se verifica
en Chromium servido por HTTP con INP medido. Son dos disciplinas de test distintas, y
mezclarlas obliga a montar la segunda para poder confiar en la primera.

---

## Los cuatro hitos

**Hito A — se sabe quién se hidrata, y la regla ya no es «tiene una signal».** Era la regla
antes de [SDD-31](./SDD-31-signals-derivadas.md) y hoy se queda corta por los dos lados: por
arriba, porque `computed(...)` es tan reactivo como `signal(...)` y entra en la misma lista
(`ExtractedCode.signals`, con `Reactive.kind`); por abajo, porque un componente con un
`@click` y ninguna signal **también** tiene que hidratarse —el botón no responde si no— y un
componente sin nada propio que reciba una prop reactiva de su padre, también. El hito A es un
predicado `hydratable(tag)` calculado sobre el grafo, con punto fijo, y escrito en un solo
sitio.

**Hito B — `data-fud-id`, y se asigna RENDERIZANDO.** El atributo cambia de nombre respecto a
§3.1 (`data-id`) por la razón de la §*Por qué `data-fud-id`* de abajo. Y cambia de momento:
SDD-15 §3.2 habla de «una única pasada determinista en pre-orden sobre el árbol de composición
ya resuelto» como si fuera una pasada de **compilación**, y no puede serlo — un `@foreach`
sobre `data.items` produce N instancias que solo existen cuando llegan los datos. La pasada
única es real, pero ocurre **dentro del render**, y por eso el contador vive en el adapter.

**Hito C — tres mapas, no cuatro.** `fud-state`, `fud-tree` y `fud-bus`. **`fud-chunks` no se
emite**: es enteramente derivable de `fudic-routes.json` (`build` + `base`) con el
`hydrateUrl(tag)` que [SDD-27 §4.1](./SDD-27-artefactos-y-manifiesto.md) ya implementa y cuyo
criterio 9 ya dice, con todas las letras, que la URL del chunk de hidratación de cualquier tag
es derivable con el build id y nada más. Emitirlo sería el mismo hecho en dos ficheros que se
publican por caminos distintos y caducan por reglas distintas.

**Hito D — los mapas salen del build de verdad.** Igual que la fase 5 de la primera tanda: un
artefacto que solo aparece cuando lo llama un script suelto es deuda. Al cerrar, `pnpm build`
en `examples/basic` escribe los cinco HTML prerenderizados **con sus tres bloques dentro**, y
el render del Service Worker produce los mismos.

---

## Lo que hay que decidir antes de escribir código

Seis puntos. Cinco se cierran aquí con su razonamiento; el sexto se anota y se coordina.

### 1. Por qué `data-fud-id` y no `data-id`

Decisión de Pedro, y es la correcta. `data-id` es uno de los `data-*` más escritos que existe:
cualquier autor que ponga `data-id` en un elemento suyo —en su propio template, en su light
DOM, en el markup de una librería que integre— crea un nodo que el runtime va a tratar como
instancia hidratable. El fallo no es un error: es un `[data-fud-id]` de más en el
`querySelectorAll`, un `data.slice(offsets[id], offsets[id+1])` con un `id` que no es un
número, y una hidratación que arranca contra un tramo que no existe. Silencioso, y en
producción.

El proyecto ya tiene namespace para esto (`data-fud-space="preserve"`, BUG-07 §4.4). El
atributo pasa a ser **`data-fud-id`**, y con él se corrige SDD-15 §3.1, todo SDD-17 y los
prototipos de `docs/runtime/hidratacion/` (tarea 23).

**Y de paso queda a la vista una incoherencia que no es de esta tanda pero sí de este
argumento:** `markup.ts` emite hoy `data-adopt` (SDD-18 D-6), sin prefijar. Es exactamente el
mismo riesgo con otro nombre. Se anota como tarea 24, marcada como separable.

### 2. La regla de nivel efectivo, escrita entera

`hydratable(tag)` es el menor conjunto que satisface:

- **Intrínseco.** El componente declara algún `Reactive` (`signal` **o** `computed`; SDD-31
  §4.7 los metió a propósito en la misma lista, porque la pregunta que esa lista responde
  —«¿esto se puede mover?»— tiene la misma respuesta para los dos), **o** su template lleva
  algún `EventBinding` o `BusBinding`, **o** su `@code { @client }` tiene cuerpo.
- **Inducido.** Un componente hidratable le cruza un valor reactivo por un `.prop`. «Valor
  reactivo» es lo que `markup-client.ts#slots` ya calcula: un `.prop` cuyo valor es el nombre
  desnudo de un `Reactive` del padre. Y **transitivo**: si el hijo reenvía esa misma prop a un
  nieto por otro `.prop` desnudo, el nieto también. Es el *property drilling*, y es la única
  parte de la regla que necesita punto fijo.

**Por qué el cuerpo de `@client` no vacío basta como intrínseco, aun sabiendo que sobra.** Un
`@client` con `const x = 5` y nada más produciría un `data-fud-id` que nadie usa. Se acepta:
la regla es una **sobreaproximación deliberada**, y la dirección del error importa. Hidratar
de más cuesta un slot en el payload y un chunk que se descarga en una interacción que ya iba
a ocurrir; hidratar de menos es un componente que no responde y **no hay diagnóstico posible**
—el compilador no puede saber que un `setInterval` dentro de `@client` mueve algo—. La carga
de la prueba está en **no** hidratar.

**Lo que la regla NO intenta.** No mira si la signal se llega a leer, no mira si el handler
hace algo, y no mira el tipo. Todo eso es análisis de flujo, y el sitio de ese análisis es el
LSP (SDD-24), no el emit.

### 3. El payload lleva valores YA RESUELTOS, y sale del hijo

SDD-15 §4.1 dice que el estado de una instancia se serializa con `Object.values(estado)`. Como
está escrito, no funciona, y por dos razones que se ven al ponerlo contra el código de la tanda
anterior:

- **El orden.** `Object.values` del literal que el **padre** construye
  (`componentPropsExpr`) da el orden en que el padre escribió los atributos. El cliente
  destructura en el orden en que el **hijo** declaró sus props
  (`let [$dom, $shadow, title, variant = 'default'] = $props`), que es el mismo orden que
  `markup-client.ts` ya usa para componer el array de `u` vía `childProps(tag)`. Dos órdenes
  distintos para el mismo array posicional.
- **Los huecos.** Una prop que el padre no escribe tiene que llegar como `undefined` para que
  el default del hijo se aplique. JSON no tiene huecos: `[null]` deserializa a `null`, y
  `null` **no** dispara un default de destructuring. Un `.variant` omitido acabaría en `null`
  en vez de en `'default'`.

Los dos se arreglan con el mismo movimiento: **el tramo lo aporta el `render` del hijo, no el
host del padre, y con los valores ya destructurados**. El `render` emitido hace hoy
`const { title, variant = 'default' } = props ?? {};`; justo después de esa línea, los locales
`title` y `variant` son exactamente el array que el cliente va a destructurar, en su orden y
con sus defaults ya aplicados. No hay `Object.values`, no hay huecos, y el simétrico de §4.2 es
exacto por construcción en vez de por convención.

### 4. Cómo se juntan el id (del padre) y el tramo (del hijo)

El id es una posición en el recorrido, y quien la conoce es el padre, que fabrica el host. El
tramo lo conoce el hijo. Hay que unirlos sin tocar la firma `render($dom, $shadow, props)` —
moverla arrastraría los goldens de servidor, `layout.ts`, el arnés de hidratación y el emit de
rutas, para no ganar nada.

El enlace ya existe: `attachShadow` deja `shadow.parent = host` en el árbol de SSR, y
`Dom.host(shadow)` lo devuelve —lo añadió la tanda de eventos y bus por otro motivo—. Así que
el adapter puede resolver «el host de este shadow» y, con él, «el id de este host». Dos
métodos en `SsrDom`:

```
claim(host)          → asigna el siguiente id en pre-orden, escribe data-fud-id,
                       y RESERVA un tramo vacío para ese id
state(shadow, values) → rellena el tramo del host de ese shadow
```

**`claim` reserva el tramo, y esa es la parte que hace que esto no se descuadre.** Si el id y
el tramo se asignasen en dos contadores distintos, un hijo hidratable cuyo `render` no llegase
a llamar a `state` —un componente sin props, el arnés de tests llamando a `render` con un
shadow hecho a mano— desplazaría todos los offsets siguientes en uno. Con la reserva, ese caso
es un tramo vacío (`offsets[id] === offsets[id+1]`), que es exactamente lo que significa.

Los `offsets` no se mantienen incrementalmente: se calculan al serializar, como sumas
prefijas de las longitudes en orden de id. Un hijo termina su `render` antes de que un hermano
posterior haga su `claim`, así que el orden de **llegada** de los tramos no es el orden de id;
el de las reservas sí.

### 5. Dónde van los tres bloques en el HTML

`page(data, io)` es un generador que **cede el `<head>` primero** y construye el body después,
así que `fud-state` no puede ir en el head: no existe todavía. Los tres van **al final del
`<body>`**, y van como elementos reales colgados de `$body` antes de `serialize($body)`, no
como `yield` de texto suelto: así hay una sola serialización y el escape es el del serializador.

`script` ya está en `RAWTEXT_ELEMENTS` de `@fudic/ssr` (`serialize.ts:31`), de modo que el
contenido sale **sin escapar** — que es lo que un `application/json` necesita y también lo que
obliga a escaparlo a mano: un `</script` dentro de un string del payload cierra el bloque. Se
escapa en el emisor del JSON (tarea 19), no en el serializador.

`fud-tree` y `fud-bus` son estáticos —tag→tags, resueltos en compilación— y podrían ir en el
head. Van con el otro por una razón: los tres son el mismo hecho para el runtime, y separarlos
por un accidente de streaming invita a que alguien los lea en dos momentos distintos.

### 6. `fud-chunks` fuera, y lo único que hay que coordinar (ABIERTO)

El manifiesto ya publica `build` y `base`, y `createUrlResolver(base, build).hydrateUrl(tag)`
da `<base>assets/h/<tag>-<build>.js`. El runtime lee el tag del DOM
(`host.localName` de cada `[data-fud-id]`), así que **no necesita ni el mapa ni la lista `deps`
de la ruta**: le basta el tag que ya tiene delante y los dos campos de cabecera del manifiesto.

Lo que queda abierto, y **no es de esta tanda porque es runtime**: cómo llega `build` al hilo
principal. Hoy `@fudic/transport`'s `main.ts` solo registra el SW, y el build id se inyecta en
el script del Service Worker por sustitución de `BUILD_TOKEN` (misma longitud,
`constants.ts:34-42`). La vía obvia es la misma sustitución en el chunk de `fudic-main`, y con
eso el runtime de SDD-17 resuelve URLs sin pedir nada. Se anota en la tarea 17 como
verificación y como nota para SDD-17; no se implementa aquí.

---

## Fase 1 — Quién se hidrata (3)

- [x] **1. El predicado intrínseco.**
      Crear `packages/compiler/src/emit/level.ts` con `isIntrinsicallyHydratable(comp)`: cierto
      si `extractCode(...).signals` no está vacío (cubre `signal` **y** `computed`, SDD-31
      §4.7), o si el template lleva algún binding clasificado como `event` o `bus`
      (`classifyAttribute`, ya usado por `markup-client.ts`), o si `client.body` no está vacío.
      Se decide **sobre el AST**, nunca sobre texto. Documentar en la cabecera del fichero la
      dirección del error: sobreaproximar es la postura, y por qué (punto 2 de arriba).
      **No abrir un `JsBatch` nuevo**: la regla de oro sigue siendo una invocación de Oxc por
      fichero, así que el predicado consume el `ExtractedCode` que `module.ts` ya tiene.

- [x] **2. El punto fijo del nivel inducido.**
      En el mismo fichero, `hydratableTags(graph): ReadonlySet<string>`. Semilla: los
      intrínsecos. Iterar hasta estabilizar: para cada componente hidratable, cada host de hijo
      de su template al que le cruce un valor reactivo hace hidratable a ese hijo. «Valor
      reactivo» es la regla que ya vive en `attrs.ts#crossingExpr` / `markup-client.ts#slots`
      —un `.prop` cuyo único valor es el nombre desnudo de un `Reactive` declarado— **más** su
      versión transitiva: un `.prop` desnudo cuyo nombre es una **prop** que este componente
      recibió a su vez como reactiva. Es el *property drilling*, y sin la parte transitiva un
      nieto se queda congelado sin que nada lo diga.
      El punto fijo termina: el conjunto solo crece y está acotado por el catálogo. Determinista
      por el orden de `graph.components`, que ya lo es.
      **Extraer la regla de «valor reactivo» a `attrs.ts` y llamarla desde los tres sitios**: si
      hay dos copias, un día el padre emite `$sub` y la página no marca al hijo, o al revés.

- [x] **3. Tests del nivel.**
      `packages/compiler/test/emit/level.test.ts`. Los casos que definen la regla, uno por
      aserción: un componente con solo `signal` → sí; con solo `computed` → sí (**es el caso que
      la regla vieja se dejaba**); con solo `@click` y ninguna signal → sí; `app-badge.fud` tal
      cual —props y `class:`, sin `@client`— → **no**; `app-badge` recibiendo `.tone="@t"` con
      `t` una signal del padre → sí; y la cadena de tres niveles donde el del medio solo
      reenvía la prop, que es la que falla sin punto fijo.

## Fase 2 — `data-fud-id` y el recolector de instancias (4)

- [x] **4. El recolector en `SsrDom`.**
      Modificar `packages/ssr/src/ssr-dom.ts`: `claim(host): void` y
      `state(shadow, values): void` con la semántica del punto 4 —`claim` asigna el siguiente
      entero base-0, escribe `data-fud-id` y **reserva** el tramo; `state` rellena el tramo del
      host de ese shadow—. Más un accesor de solo lectura del payload acumulado
      (`hydrationState(): { offsets, data }`) que calcula los offsets como sumas prefijas **al
      leerlo**, no incrementalmente.
      Dos ramas que la cobertura al 100 % obliga a escribir y que son reales, no defensivas:
      un `state` sobre un shadow cuyo host **no** fue reclamado (el arnés de
      `test/emit/hydrate/_harness.ts` llama a `render` con un shadow hecho a mano) es un no-op;
      y un `claim` sobre un host que ya tiene id no reasigna.
      **No va en `Dom<N>`.** Solo el servidor asigna identidad: el camino `h` del cliente **lee**
      el `data-fud-id` del DOM y no lo escribe nunca. Un método en el contrato compartido sería
      una firma que `browserDom` tendría que implementar para no llamarla jamás.

- [x] **5. El padre reclama el host.**
      Modificar `packages/compiler/src/emit/markup.ts`, rama de host de componente de
      `#element`: cuando `hydratable(el.name)`, emitir `$dom.claim(${v});` **entre** el
      `$dom.element(...)` y el `attachShadow`. El pre-orden que §3.1 pide sale solo: el emisor
      ya fabrica el host antes de descender a su shadow y antes de su light DOM.
      `MarkupEmitter` recibe el conjunto por constructor, junto al `isComponent` que ya toma —
      no lo calcula, que es de `module.ts`.

- [x] **6. El hijo aporta su tramo.**
      Modificar `packages/compiler/src/emit/module.ts`, `buildComponentModule`: cuando el
      componente es hidratable, emitir `$dom.state($shadow, [<props en orden de declaración>]);`
      **justo después** de la línea de destructuring de `props` y **antes** de las declaraciones
      reactivas inertes. Los nombres son los de `ExtractedCode.props`, en su orden, que es el
      mismo que `markup-client.ts` usa para componer el array de `u` (`childProps(tag)`) y el
      mismo en que el factory de cliente destructura `$props`. Un componente sin props emite
      `$dom.state($shadow, []);` — el tramo vacío es información, no ausencia.
      Documentar ahí, en dos líneas, por qué no es `Object.values(props)`: el orden es del hijo
      y los defaults ya están aplicados (punto 3).

- [x] **7. Goldens de servidor y equivalencia.**
      Regenerar `test/emit/__golden__/*.mjs`. Se mueven **exactamente** en dos formas: el
      `$dom.claim(...)` de cada host hidratable y el `$dom.state($shadow, [...])` de cada
      componente hidratable. Una tercera clase de cambio es la señal de que algo se coló.
      Los `*.client.mjs` **no se mueven**: el cliente no asigna identidad.
      `test/emit/hydrate/adopt.test.ts` (§6.14) sigue verde: `claim` y `state` no fabrican
      nodos, y el único byte que cambia en el HTML es un atributo del host, que el camino `h`
      no adopta ni mira.

## Fase 3 — `fud-state` (3)

- [x] **8. El bloque, con su forma exacta.**
      `[[offsets],[data]]`, `offsets` de longitud `n+1` con `offsets[0] === 0` y
      `offsets[n] === data.length` (§3.3, criterios §6.1 y §6.2). El id **es** el índice: sin
      tabla intermedia, sin claves, sin índice por tag.
      Un valor anidado viaja con su forma tal cual (vía B, §4.1): `JSON.stringify` ya lo hace y
      no hace falta serializador recursivo.

- [x] **9. Estado completo, no proyección.**
      Test dedicado, porque es el invariante que un `@if` rompe sin avisar: un componente cuyo
      template pinta `name` o `phone` según una condición emite **las dos** props en su tramo.
      Sale gratis con la tarea 6 —el tramo se lee de los locales destructurados, no de lo que se
      pintó— y por eso hay que escribir el test: es una propiedad que se conserva por
      construcción y que un refactor puede perder en silencio.

- [x] **10. Determinismo (§6.6).**
      Renderizar la misma página dos veces con los mismos datos produce el mismo `data-fud-id`,
      los mismos offsets y el mismo `data`, byte a byte. Y alterar el árbol de composición y
      regenerar produce ids y mapas **mutuamente consistentes**, sin paso de reconciliación —
      que es lo que §3.2 quiere decir con «una sola pasada».

## Fase 4 — `fud-tree` (2)

- [x] **11. El mapa, y qué cuenta como hijo.**
      En `module.ts`: `const FUD_TREE = {...}` como constante del módulo de página, calculada en
      **compilación** sobre el grafo alcanzable — es tag→[tags] y no depende de los datos, así
      que no tiene nada que hacer en el render. Clave: tag padre hidratable. Valor: los tags
      hidratables que aparecen como host de componente **en su template**.
      **Los hijos son los del shadow, NUNCA los del light DOM**, y hay que escribirlo en el
      código porque es justo lo que un lector supone al revés. El `<app-badge>` que
      `home.fud` mete dentro de `<app-card>` es un hijo del host en el árbol del **documento**:
      lo encuentra `document.querySelectorAll('[data-fud-id]')`, no un descenso por
      `host.shadowRoot`. Y el motivo de fondo: la cascada de SDD-17 §4.4 existe porque el
      controlador del padre pasa props a los hijos **que él monta**, y a un hijo de luz no le
      pasa ninguna.
      Un tag sin hijos hidratables **no tiene entrada** (§3.4).

- [x] **12. Tests (§6.25, §6.26).**
      Una cadena `app-parent → app-child → app-grandchild` emite
      `{"app-parent":["app-child"],"app-child":["app-grandchild"]}`, y duplicar a 200 instancias
      del hijo **no cambia el mapa** — es la propiedad que hace que su peso sea irrelevante.
      Un hijo no hidratable no lleva `data-fud-id`, no aparece en `fud-tree` y no tiene tramo en
      `fud-state`: las tres cosas en el mismo test, porque las tres salen de la misma pasada y
      un fallo que solo rompa una es un fallo de acoplamiento.

## Fase 5 — `fud-bus` (3)

- [x] **13. Los dos lados de la relación.**
      **Escucha** (`bus:nombre` → tag): del template, ya clasificado, sin Oxc.
      **Emisión** (tag → nombre): `ExtractedCode.emitCalls` registra hoy solo **offsets** —
      dónde inyectar `$host`— y no el nombre. Ampliarlo con el nombre resuelto del primer
      argumento.
      **Alcance de la resolución en v1: string literal, y nada más.** La decisión 28.c admite
      además `const` local y `as const` importado; lo segundo necesita el grafo de módulos, que
      el `SemanticModel` de un fichero no tiene y que
      [la tanda de eventos y bus](./SDD-15-Task-eventos-y-bus.md) dejó anotado como
      irreconciliado entre SDD-12 §8.4 y SDD-15 §3.5. Se hace literal ahora y se deja el `const`
      resoluble por AST como ampliación acotada si sale barata; el `as const` importado necesita
      su propia decisión.
      **Postura permisiva, escrita como test:** un nombre no resoluble **no es error**, **no
      produce diagnóstico** y **sigue emitiendo el listener** (§6.22). No protegemos lo que no
      podemos ver.

- [x] **14. La composición, y la arista consigo mismo.**
      En `module.ts`, `const FUD_BUS = {...}` en el módulo de página: para cada nombre, todo tag
      que lo emite depende de todo tag que lo escucha. Es tag→tags; el nombre del evento **no
      aparece** en la salida (§3.5).
      **Un tag no se lista a sí mismo.** `fixtures/app-actions.fud` es exactamente ese caso —
      emite `cleared` y lleva `bus:cleared` en su propio template— y una entrada
      `{"app-actions":["app-actions"]}` le diría al runtime que para levantar A hay que levantar
      antes A. La arista se descarta al componer, aquí, y no en el runtime: es un hecho de
      compilación y el runtime no debe tener que defenderse de él.

- [x] **15. Test (§6.21).**
      `product-list` con `emit('carrito', p)` y `shopping-cart` con `bus:carrito` producen
      `{"product-list":["shopping-cart"]}`. Con `app-actions` en la página, ninguna arista
      reflexiva. Con el nombre por expresión, ninguna entrada y ningún diagnóstico.

## Fase 6 — `fud-chunks` se retira, y la coordinación con el manifiesto (2)

- [x] **16. Retirar `fud-chunks` de la especificación, no implementarlo.**
      Modificar [SDD-15](./SDD-15-emit.md): §3.2 pasa de cinco artefactos a cuatro, §3.6 se
      reescribe como *retirado* con el motivo —derivable de `fudic-routes.json` vía
      `createUrlResolver(base, build).hydrateUrl(tag)`, SDD-27 §4.1 y su criterio 9—, §6.27 se
      sustituye por el criterio de la tarea 17, y **`FUD0293` se marca retirado** en el catálogo
      (§5): el diagnóstico existía para un hueco en un mapa que ya no hay, y el pase de cliente
      emite un chunk por **cada** componente del grafo, sin filtro de nivel, así que el hueco
      tampoco puede producirse.
      Modificar [SDD-17](./SDD-17-hidratacion.md) en consecuencia: §2 y §4.6 dejan de hablar de
      `fud-chunks` y pasan a hablar del resolver; el `chunkURL(tag)` de §4.6 es
      `urls.hydrateUrl(tag)`.
      **Es la tarea que impide duplicar un hecho en dos ficheros que caducan por reglas
      distintas:** el manifiesto se purga por build (`shell-${build}`, `activate`), y un JSON
      dentro de un HTML prerenderizado se sirve mientras ese HTML esté en cache. Con las dos
      copias, un deploy deja una página apuntando a chunks del build anterior.

- [x] **17. Verificar que la derivación cierra, y anotar lo que falta.**
      Test en `@fudic/vite`: para todo tag con instancias `[data-fud-id]` en los HTML
      prerenderizados de `examples/basic`, `hydrateUrl(tag)` apunta a un fichero que existe en
      `dist/`. Es el criterio 27 de SDD-15 reescrito sin mapa: la garantía que importaba no era
      que el mapa estuviera completo, era que el fichero existiera.
      Y **anotar, sin implementar**, el punto 6 de arriba: el hilo principal necesita `build`
      para derivar esas URLs, y hoy solo el script del Service Worker lo recibe por sustitución
      de `BUILD_TOKEN`. La nota va en SDD-17 §4.6 como dependencia de aquel SDD, no como tarea
      de éste. **Runtime es runtime.**

## Fase 7 — Los tres bloques en el HTML (3)

- [x] **18. El emisor de los bloques.**
      En `module.ts`, al final de `page(data, io)` y **antes** de `serialize($body)`: colgar de
      `$body` un `<script type="application/json" id="fud-state">` con el payload que
      `$dom.hydrationState()` devuelve, y los de `fud-tree` / `fud-bus` con las constantes de
      compilación.
      **Un mapa vacío no se emite.** Una página sin componentes hidratables no lleva ninguno de
      los tres, y una sin bus no lleva `fud-bus`: un `{}` es un fetch parseado para nada, y el
      runtime ya tiene que tratar la ausencia (una página cero-JS es el caso base del
      framework, no una excepción).

- [x] **19. El escape del JSON dentro de `<script>`.**
      `script` está en `RAWTEXT_ELEMENTS` (`packages/ssr/src/serialize.ts:31`): su texto sale
      **sin escapar**, que es lo que un `application/json` necesita y lo que obliga a hacerlo
      aquí. Un helper compartido escapa cada `<` a su forma `\u003c` —lo cual neutraliza
      `</script`, `<!--` y `<script` de una vez sin tocar la validez del JSON, porque
      `JSON.parse` lo devuelve como el `<` original— más U+2028 y U+2029, que son salto de línea
      en JS y no en JSON.
      Test con una prop cuyo valor sea literalmente `</script><img onerror=…>`: el HTML
      resultante parsea a **un** `<script>` y el payload deserializa al string original. Es el
      test que hay que escribir antes que el helper.

- [x] **20. El HTML, leído entero.**
      Test de integración sobre el HTML que `page()` produce para `home.fud` con datos: los
      hosts hidratables llevan `data-fud-id` correlativo en pre-orden, los no hidratables no lo
      llevan, y para cada id `data.slice(offsets[id], offsets[id+1])` es exactamente el array
      que el factory de cliente de ese tag destructura. Esa última aserción es la que junta las
      dos ramas: se comprueba **contra el `.client.mjs` emitido**, no contra una lista escrita a
      mano en el test.

## Fase 8 — Que salga del build (2)

- [x] **21. El plugin, el prerender y el pase de link.**
      Verificar y, donde haga falta, ajustar `packages/vite/src/`: los cinco HTML
      prerenderizados de `examples/basic` llevan sus bloques; el pase *link* (CJS, el que el SW
      ejecuta con `new Function`) produce los mismos ids y los mismos mapas para la misma ruta y
      los mismos datos, porque es el mismo `render`; y el pase *edge* también.
      **Criterio duro:** para una ruta dada y unos datos dados, el HTML del prerender y el que
      el SW renderiza son idénticos en `data-fud-id` y en los tres bloques. Si divergen, hay dos
      pasadas donde §3.2 dice que hay una.

- [x] **22. El e2e de `examples/basic`.**
      Los tests existentes (`sw-render`, `sw-network`) siguen verdes. Uno nuevo, y **solo
      lectura del DOM**: la página cargada tiene los tres bloques, los ids son correlativos, y
      `:not(:defined)` lista los tags hidratables — o sea, **cero JS de componente ejecutado**,
      que es el invariante de SDD-17 §5 que esta tanda no debe romper por accidente. Ninguna
      interacción, ninguna hidratación: eso es SDD-17.

## Fase 9 — Documentación y cierre (4)

- [x] **23. El renombrado `data-id` → `data-fud-id`, en todas partes.**
      [SDD-15](./SDD-15-emit.md) §3.1 y §4.3; [SDD-17](./SDD-17-hidratacion.md) entero (§2, §3,
      §4.1–§4.7, §5, §6); los prototipos de `docs/runtime/hidratacion/` (`runtime.js`,
      `index.html`, `components/*.js`) — son la evidencia ejecutable de SDD-17 y un prototipo
      que no compila con el contrato nuevo deja de ser evidencia; y las menciones de
      `packages/core/README.md` y `packages/vite/README.md`.
      Añadir en SDD-15 §3.1 el **motivo**, en dos líneas: `data-*` es vocabulario del autor y
      `data-id` es de los más usados que hay; el namespace `fud` es lo que separa los dos
      mundos, igual que `bus:` (decisión 22) y que la reserva `$` (§4.7).

- [x] **24. `data-adopt` → `data-fud-adopt` *(separable)*.**
      Mismo argumento que la tarea 23, aplicado al único marcador que quedaba sin prefijar
      (`markup.ts`, SDD-18 D-6). Toca el polyfill de estilos y sus goldens, así que **se puede
      dejar fuera sin bloquear nada** — pero entonces se anota en SDD-18 como deuda con su
      motivo, y no se deja simplemente ahí. Marcar una de las dos casillas, no ninguna.

- [ ] **25. Verde, cobertura y registro.**
      `pnpm typecheck`, `pnpm test` y `pnpm build` en la raíz —los ejemplos se construyen
      después de los paquetes—. `level.ts` y el emisor de los bloques nacen al **100 %** en las
      cuatro métricas; `@fudic/ssr` está al 100 % y no baja, así que las dos ramas del punto 4
      (un `state` sin `claim` previo, un `claim` repetido) llevan su test. Nada de
      `/* v8 ignore */` para llegar al número.
      Anotar el avance en [INDEX.md](./INDEX.md). **Con esta tanda SDD-15 pasa a `Hecho`**:
      `FUD0290` (validación del prefijo `$`, §4.7) **entra aquí como tarea 26** — decidido al
      abrir la rama (2026-08-10, Pedro). La tarea 24 también entra, misma decisión.

- [x] **26. `FUD0290` — el prefijo `$` reservado, con su diagnóstico.**
      SDD-15 §4.7: ningún identificador **de usuario** de `@code { @client }` puede empezar por
      `$`. Aplica a **declaraciones** (`const`/`let`/`var`, parámetros, targets de
      destructuring, nombres de función y de clase) **y a referencias libres** —usar `$shadow`
      sin declararlo es tocar una variable interna del framework—. El **acceso a propiedad**
      ajeno (`obj.$bar`) queda fuera: no introduce ni resuelve un binding en el scope
      compartido. Prohibido como **prefijo**, no en cualquier posición: `foo$` y `obs$` son
      válidos.
      **Sobre el AST de Oxc, nunca sobre texto**, y en el batch que `extractCode` ya abre — un
      lexer sobre string daría falsos positivos en strings, comentarios y nombres de propiedad.
      El diagnóstico viaja en `ExtractedCode.diagnostics`, así que sale igual en el compilador
      batch y en el language server, con su span.
      Es lo único que le quedaba a SDD-15 fuera de los mapas.

---

## Lo que esta tanda deja abierto, y por qué

- **Todo SDD-17.** Dicho arriba y repetido aquí porque es la frontera que más presiona: con
  los mapas delante, escribir el capturador «ya que estamos» es la tentación entera de esta
  tanda. No. Los mapas se verifican en Node; el runtime se verifica en Chromium con INP.
- **`FUD0292`** (prop no serializable a JSON). Sigue reservado y sin implementar: el emit no
  conoce el tipo de una expresión, y el sitio de esa comprobación es el chequeo de tipos del
  LSP (SDD-24). Una función que cruce por un `.prop` se pierde en `JSON.stringify` y eso es un
  hecho de runtime, no un diagnóstico que este emit pueda dar honestamente.
- **Instancias creadas en runtime** (punto de entrada 2, `c(props)`). No vienen de SSR, no
  tienen `data-fud-id` y no tienen tramo: sus props se las inyecta el controlador padre. No es
  un hueco, es la otra vía de paso de props (§4.3).
- **Resolución del nombre de bus por `as const` importado** (decisión 28.c). Necesita el grafo
  de módulos y una reconciliación entre SDD-12 §8.4 y SDD-15 §3.5. Tarea 13 hace literales; lo
  demás necesita su decisión.
- **Props como signals** (SDD-31 §7). La regla de nivel inducido de la tarea 2 hace visible el
  *property drilling* y lo resuelve **por orden de hidratación** (`fud-tree` + la cascada en
  post-orden), no convirtiendo props en signals. Esa conversación sigue abierta con la
  condición que SDD-31 §7 fija, y esta tanda no la mueve ni la prejuzga.

---

## Enlaces

- Criterios de aceptación que cierra: §6.1–§6.6, §6.12, §6.21, la otra mitad de §6.22, §6.25,
  §6.26 y —reescrito sin mapa— §6.27, de
  [SDD-15](./SDD-15-emit.md#6-criterios-de-aceptación). Se revalidan §6.7 y §6.14.
- Criterios que **no** cierra: §6.28 (el hito de cierre necesita SDD-17 instalado).
- Tandas anteriores:
  [`FudicElement` y emit de cliente](./SDD-15-Task-fudic-element-y-emit-de-cliente.md) ·
  [eventos y bus](./SDD-15-Task-eventos-y-bus.md).
- Consumidor de todo esto: [SDD-17 — Runtime de hidratación](./SDD-17-hidratacion.md).
- Coordinación de artefactos y URLs:
  [SDD-27 — Artefactos y manifiesto](./SDD-27-artefactos-y-manifiesto.md).
