# SDD-38 — Tareas · Inyección de dependencias (`@fudic/di`)

> **SDD:** [SDD-38 — Inyección de dependencias](./SDD-38-inyeccion-de-dependencias.md)
> **Paquete:** `@fudic/di` — **nuevo**, puntos de entrada `.` y `./page`
> **Toca además:** `@fudic/compiler`, `@fudic/ssr`, `@fudic/vite`
> **Rama:** `sdd-38-inyeccion-de-dependencias`
> **Rango:** `FUD0680`–`FUD0699` · **Decisiones:** 120–126
> **Progreso:** 18 / 19

Da a fudic el inyector que [`docs/di/index.html`](../di/index.html) prototipó, y lo cablea en los
dos extremos. Las fases 1–3 son un paquete nuevo, sin DOM y sin dependencias, que se puede llevar
entero en su propio worktree sin cruzarse con nadie. De la fase 4 en adelante se tocan ficheros
vivos del compilador y del plugin.

Cada tarea es un paso cerrado: se implementa, se verifica y se marca.

---

## Las dos cosas que no se pueden negociar

**1. El árbol de contenedores no sale del HTML.** Ni `getRootNode`, ni `.host`, ni `closest`, ni
`parentElement`. Un componente puede declarar providers y **seguir siendo N1**: no hidrata, no
tiene chunk y no ejecuta una línea en el navegador, así que un contenedor que dependiera de
ejecutarse no existiría. Y la cascada de hidratación sube por **tag** y en post-orden (SDD-17
§4.4), no por posición en el árbol, así que en el momento en que `h()` corre no hay padre al que
preguntar. La jerarquía es **código emitido** y un mapa publicado, igual que lo es la página. La
tarea 14 lo comprueba por búsqueda de texto y esa comprobación no admite excepciones.

**2. Escribir un provider no cambia el nivel de un componente.** Solo `inject` promueve a N3, y
solo en la zona neutra o en `@client`. Las reglas de hidratación del proyecto **no se tocan**: ni
un orden nuevo, ni un evento nuevo, ni una excepción a la cascada. La tarea 9 se escribe en rojo
primero contra esto exactamente.

---

## Los seis hitos

**Hito A — el paquete existe y nace al 100 %.** `@fudic/di` con umbrales al 100 en las cuatro
métricas desde el primer commit, `sideEffects: false` y **cero** dependencias de runtime.

**Hito B — el inyector.** Registro raíz, contenedores encadenados, resolución por dueño, ciclos,
`transient`, semilla y el invariante de vida. Todo en Node, sin una referencia al DOM.

**Hito C — el árbol se reconstruye en memoria.** `buildTree` sobre el mapa emitido, probado sin
`document`.

**Hito D — el compilador.** Extracción en las tres zonas, la reescritura por offset, el nivel, el
cuarto parámetro del servidor y el `@server` de un componente vivo por primera vez.

**Hito E — los dos extremos.** `fud-ioc`, la semilla publicada, el módulo IoC de la ruta y el
wrapper.

**Hito F — que falle donde debe.** Los cinco diagnósticos y la página que lo demuestra en Chrome.

**Fuera de esta tanda:** `@fudic/http`, interceptores, servicios asíncronos, contenedores del
usuario, `multi:`, `useValue`, el reemplazo en tests y `fudic g service`.

---

## Fase 1 — El paquete (1)

- [x] **1. Andamiaje de `@fudic/di`.**
      `packages/di/` extendiendo `tsconfig.base.json`, con `vitest.config.ts` en entorno **`node`**
      —sin `happy-dom`, y que se note—, `coverage.include: ['src/**/*.ts']` y `thresholds` al
      **100** en las cuatro métricas desde el primer commit. `package.json` con `sideEffects:
      false`, **cero** `dependencies` y dos exports: `.` y `./page`. Que el paquete no dependa ni
      de `@fudic/core` es el contrato: un inyector que necesitara la reactividad para existir sería
      un inyector que no se puede probar solo.

## Fase 2 — El inyector (5)

- [x] **2. `token()` y el contenedor como dato.**
      `src/types.ts` y `src/container.ts`. `Token<T>` es un **objeto** con `name` y un campo
      fantasma de tipo, no un `Symbol`: un símbolo no puede llevar `T`, y sin `T` cada
      `inject(TOK)` volvería `unknown`. `Container` es `{ label, parent, registry, instances,
      alive }` —datos, sin métodos— y `createRoot`, `createChild` y `destroy` son funciones que lo
      toman por argumento, para que quien no destruya no descargue `destroy`. Criterios §6.9
      (identidad del token) y §6.8 (`destroy` idempotente).
- [x] **3. El registro raíz: `Service` y `provide`.**
      `src/registry.ts`. `Service` es un decorador **estándar** (stage-3) con la firma
      `(target, context)` que registra `() => new C()` y devuelve la clase intacta —el `tsconfig`
      del repo va a `ES2024` sin `experimentalDecorators`, así que es el único que hay—. `provide`
      es su forma sin decorador, la que admite factoría y `token()`. Los dos escriben en el mismo
      Map de módulo, que es el **único** estado de módulo del paquete. Criterio §6.1.
      **Verificar aparte** que Rolldown/oxc transforma el decorador en el build de `examples/`; si
      no lo hiciera, `Service(C)` como llamada sigue siendo la misma función y la spec no cambia.
- [x] **4. `provideIn` y la cadena.**
      Registro **por contenedor**: un componente que declara `provide` se convierte en el dueño de
      ese token para todo su subárbol. La raíz es el último eslabón de la cadena y es donde viven
      los `@Service`. Criterios §6.2 y §6.3 — y §6.2 es la propiedad que define este SDD: con
      `Cart` registrado a la vez con `@Service` y con `provideIn(cA, …)`, un descendiente de `cA`
      recibe **el de `cA`**.
- [x] **5. `injectFrom`: la resolución.**
      Subir la cadena hasta el primer contenedor **con registro**; construir en el contenedor
      **dueño**, no en el que pidió —de ahí sale gratis que nada pueda depender de algo que vive
      menos—; `transient` que no cachea; `{ optional: true }`; la pila de ciclos que nombra la
      cadena entera; y la semilla, que es el único caso en que un proveedor **sin** registro
      resuelve. Criterios §6.4–§6.7 y §6.9.
- [x] **6. `inject()` ambiente, y solo dentro de una factoría.**
      `injectFrom` entra en el contenedor dueño con `try/finally` alrededor de la llamada a la
      factoría; ahí, y solo ahí, `inject()` a secas funciona. Es lo que hace legal
      `log = inject(Logger)` como campo de clase de un servicio. Fuera de una factoría **lanza**.
      Criterio §6.10. No hay ninguna otra forma de tocar el ambiente desde fuera del paquete, y no
      se exporta ninguna.

## Fase 3 — El árbol reconstruido (1)

- [x] **7. `@fudic/di/page` — `buildTree`.**
      `src/page.ts`: a partir de `nodes[i] = padre de i` (con `-1` para la raíz) construye los
      contenedores en memoria y llama a `register(node, container)` una vez por nodo. **No lee el
      DOM**: el bloque JSON lo pasa quien la llama. Criterios §6.11 y §6.12, los dos escritos sin
      `document` en el fichero de test.

## Fase 4 — El compilador (5)

- [x] **8. Extracción: `DiCall` y `ServerCode`.**
      En `emit/oxc-code.ts`, dentro del recorrido que ya lee `props<T>()`, `signal(…)` y `emit(…)`
      —Oxc se invoca **una sola vez por fichero**—: cada `inject(…)` y `provide(…)` con su zona, su
      expresión de proveedor verbatim y los dos offsets que la reescritura necesita. Y el campo
      `server` de `ExtractedCode`, que hoy no existe: las sentencias de nivel superior del
      `@server` de un componente, que hasta ahora no llegaban a ninguna parte.
- [x] **9. El nivel: `inject` promueve, `provide` no.**
      **(rojo primero)** Un término más en el `||` de `isIntrinsicallyHydratable`, y ni una regla
      nueva de hidratación. El test que va primero es el de §6.13: un componente con `provide` en
      la neutra y **sin** `inject` no está en `hydratableTags`, no aparece en `fud-tree`, no lleva
      `data-fud-id` y su chunk **no cambia un byte** respecto al golden de hoy.
- [x] **10. La reescritura por offset.**
      `inject(` → `injectFrom($ioc, ` y `provide(` → `provideIn($own, `, con los argumentos
      intactos y por el mismo mecanismo que ya convierte `emit(name, d)` en
      `emit.call($host, name, d)`. **Por offset y nunca por texto**: el cuerpo se copia verbatim, y
      un `"inject("` dentro de una cadena o un `// inject(` en un comentario no son llamadas.
      Criterio §6.16. `$ioc` y `$own` van a la lista de identificadores reservados de SDD-15 §4.7.
- [x] **11. El emit de servidor.**
      Cuarto parámetro: `render($dom, $shadow, props, $ioc)`. Quien declara un provider crea
      `const $own = $ioc.child("<tag>")` y pasa `$own` a sus hijos; quien no, **reenvía `$ioc` sin
      crear nada**. Y el `@server` del componente entra en el `render(…)`, sin llegar al chunk de
      cliente ni al `sourcesContent` del mapa —el camino de `redactServerRegions` ya está—.
      Criterios §6.17 y §6.18. Regenerar los goldens: el cuarto parámetro los toca todos.
- [x] **12. El emit de cliente.**
      El nodo del contenedor viaja en el **último** hueco de la porción del payload, detrás de las
      props y de las celdas. Al final y no al principio, porque un `u` parcial indexa por posición
      y un hueco delante desplazaría cada prop (BUG-18 §3.1): el criterio §6.15 comprueba que los
      índices de `updateGuards` no se mueven ni un número.

## Fase 5 — Los dos extremos (3)

- [x] **13. `fud-ioc` en los mapas de página.**
      En `emit/maps.ts`, junto a `fud-tree` y `fud-bus`. **Solo entran los contenedores que POSEEN
      providers**: quien únicamente inyecta no tiene nodo y apunta al ancestro dueño más cercano.
      Si nadie declara providers y todo es `@Service`, el mapa sale **vacío** y cada instancia
      apunta al 0. Criterio §6.19.
- [x] **14. La semilla, y la comprobación de que nada mira el DOM.**
      `publish(token, value)` y `seedBlock()` en `@fudic/ssr` —reutilizando `jsonBlock`—, y
      `createRoot(<ese objeto>)` en el bootstrap. **Solo `publish` cruza**: un valor sembrado en el
      servidor y no publicado se queda ahí, que es lo que hace seguro inyectar desde `@server`.
      En la misma tarea, el criterio **§6.14**: búsqueda de texto sobre `packages/di/src` y sobre
      el emit para que no aparezca `getRootNode`, `closest`, `parentElement` ni `.host` resolviendo
      un contenedor, con la lista de excepciones **vacía**.
- [x] **15. El módulo IoC de la ruta y el wrapper.**
      El plugin emite `<ruta>.ioc.js` con `NODES` y `register(node, c)`, importando **solo** los
      tokens que alguien inyecta en el lado cliente de esa ruta —ahí es donde el provider se
      extrae fuera del componente, porque el ancestro dueño puede ser N1 y no tener chunk—. Una
      ruta sin `inject` **no produce módulo IoC** y su bootstrap no importa `@fudic/di`. Y en
      `wrapper.ts`: `createRoot()` por petición y `ctx.inject(…)` para `load`, que es la única
      función `async` del sistema. Criterio §6.20.

## Fase 6 — Que falle donde debe (4)

- [x] **16. `FUD0680` — inyectar algo que nadie registra.**
      **(rojo primero)** Un salto de import, el que el `.fud` ya escribe: el plugin resuelve el
      especificador con el `ResolveIo` que ya usa, parsea el módulo con Oxc y busca `@Service` o un
      `provide` de nivel superior. Si el módulo no se resuelve o no se puede leer, **no hay
      diagnóstico**: nunca se inventa un error donde falta información. Criterio §6.21.
- [x] **17. `FUD0681`–`FUD0684`.**
      Un nombre de `@server` leído por el template de un componente que hidrata (§6.22); `inject`
      en `@client` cuando el único `provide` está en `@server` y el simétrico (§6.23); `inject(…)`
      dentro del `@server` de una **ruta**, donde va `ctx.inject(…)` (§6.24); y dos `provide` del
      mismo token en un `@code` (§6.25). Los cinco con span exacto, y el emit **no se detiene** por
      ninguno: el módulo se escribe degradado (§6.26).
- [x] **18. La página que lo demuestra.**
      En `examples/`: un ancestro **N1** que declara `provide(Cart)`, un descendiente N3 que lo
      inyecta y un `@Service Logger` global. El SSR pinta con la instancia del ancestro, el cliente
      hidrata y recibe **la misma**, reconstruida desde la semilla, y el `Logger` es único en la
      página. Verificado en Chrome real. Y el contraste que cierra el SDD: la misma página **sin**
      DI no contiene `@fudic/di`, ni `fud-ioc`, ni `fud-di`, y su `dist` no cambia de número de
      ficheros (§6.27, §6.28).
- [ ] **19. Decisiones y registro.**
      Escribir en [`gramatica-v1-decisiones.md`](../gramar/gramatica-v1-decisiones.md) las
      decisiones **120–126** y la **precisión a 33.c**, y actualizar la tabla maestra y el registro
      de progreso de [`INDEX.md`](./INDEX.md).

      | Nº | Texto |
      |---|---|
      | 120 | `inject` y `provide` son legales en las **tres zonas** de `@code`. La zona decide dónde corre la línea: neutra en los dos lados, `@server` solo en el servidor, `@client` solo en el navegador. |
      | 121 | **Escribir un provider no cambia el nivel de un componente.** Solo `inject`, y solo en la zona neutra o en `@client`, promueve a N3, por las reglas de hidratación ya existentes. |
      | 122 | La jerarquía de contenedores es **código emitido**, nunca derivada del árbol de elementos. Ninguna resolución consulta el DOM. |
      | 123 | El dueño de un token es el **primer contenedor de la cadena con registro**; la raíz, donde viven los `@Service`, es el último eslabón. La factoría corre en el contenedor dueño. |
      | 124 | **El contenedor raíz es la ruta** —una petición en el servidor, una página en el navegador— y muere con ella. No hay un nivel «aplicación» por encima. |
      | 125 | Lo que cruza el cable son **valores publicados** bajo `token()`, nunca instancias de servicio. Es la decisión 84 aplicada al contenedor. |
      | 126 | `load(ctx)` resuelve por `ctx.inject(…)`. Es la única función `async` del sistema y no participa del contenedor ambiente. |
      | 33.c | *(precisión)* La inscripción de un módulo de servicio en el registro raíz no es un «side effect» de los que 33.c prohíbe: es determinista, idempotente y acotada a su propia clase. Un módulo de servicio es un import legal en zona neutra. |
