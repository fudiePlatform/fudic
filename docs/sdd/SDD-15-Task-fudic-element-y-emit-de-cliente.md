# SDD-15 — Tareas · `FudicElement` y emit de cliente

> **SDD:** [SDD-15 — Emit (AST → runtime)](./SDD-15-emit.md)
> **Paquetes:** `@fudic/core` (base de custom element) · `@fudic/compiler` (emit)
> **Rama:** `worktree-sdd-15-17-hidratacion`
> **Progreso:** 22 / 22

Primera tanda de la rama de cliente de SDD-15. La rama de servidor ya está `Hecho`
(`emitComponentModule` / `emitPageModule`); aquí se abre la de cliente por su base, y solo
por su base. De esta SDD derivarán más ficheros `SDD-15-Task-*`: los mapas de página
(`data-id`, `fud-state`/`fud-tree`/`fud-bus`/`fud-chunks`), los event bindings y el bus.

Cada tarea es un paso cerrado: se implementa, se verifica y se marca. Ninguna depende de
tareas posteriores.

---

## Los dos hitos

**Hito A — `FudicElement` existe.** No está en el repo: se retiró con la clase de SDD-14
(que hacía todo el trabajo en `connectedCallback`) y quedó documentada en
`packages/core/README.md` como algo que vuelve *con* el emit. Vuelve aquí, con la forma de
§3.7: envuelve el `static c($props)` emitido, recibe `h`/`c` **desde fuera**, y su único
callback de navegador es `disconnectedCallback` → `r()`.

**Hito B — el emit de cliente produce un módulo por componente, para TODOS.** Un componente
no tiene nivel propio: un N1 en aislamiento pasa a N3 en cuanto un ancestro le pasa una prop
reactiva, y el `.fud` de un componente no ve la página donde se usa, luego no puede decidirlo.
Por eso el emit de cliente **no filtra por nivel**: emite el chunk de todos los componentes
del grafo. Quién se hidrata es un hecho de **página** (`data-id`, `fud-chunks`), y un chunk
que nadie pide no cuesta nada — la alternativa, filtrar en el emit, obliga a inferir el nivel
efectivo antes de tener la página delante, que es exactamente el orden imposible.

**Alcance del factory en esta tanda: paridad con `render()`.** El `static c($props)` cubre lo
mismo que ya cubre la rama SSR —elementos, texto, interpolación, `@if`/`@foreach`, atributos
estáticos e interpolados, `class:`, hosts de componente hijo y defaults de `props<T>()`— con
`c`/`m`/`h`/`r` completos y **`s()` emitido vacío**.

**Fuera de esta tanda** (van a `SDD-15-Task-*` posteriores): §3.1 `data-id`, §3.3–§3.6 los
cuatro mapas JSON, §3.8 `Dom.event`/`Dom.bus`, §4.4 bus, §4.5 event bindings, §4.7 validación
del prefijo `$` (`FUD0290`), reactividad fina de signals. Y todo SDD-17.

**Dentro, y añadido al cierre** (fase 5): que el **plugin de Vite** emita el chunk de cada
componente en el build. El hito B no está terminado mientras los ficheros solo salgan de un
script suelto: emitirlos es lo que los somete al bundler y convierte cualquier error del emit
en un fallo de build. El enlace sigue fuera.

---

## Fase 0 — Cobertura del paquete que va a crecer (1)

- [x] **1. Cerrar el contrato de cobertura de `@fudic/core`.**
      Modificar `packages/core/vitest.config.ts`: falta `statements: 100` (hoy solo hay
      `lines`/`functions`/`branches`) y falta `coverage.include: ['src/**/*.ts']`. Sin el
      `include`, un fichero que ningún test importe no entra en el denominador — y el
      siguiente fichero que aterriza es justo el que hay que cubrir. `lib` ya trae
      `DOM`/`DOM.Iterable` en `packages/core/tsconfig.json`: no hay nada que tocar ahí.

## Fase 1 — `FudicElement` en `@fudic/core` (7)

- [x] **2. Contrato del controlador.**
      Crear `packages/core/src/controller.ts`: `interface Controller { c(): void; h(): void;
      r(): void }` — exactamente los tres métodos con llamador externo (§3.7). `m` y `s` no
      aparecen: son closures privadas del factory. **No hay `u`.**
- [x] **3. Tipo del constructor portador del factory.**
      En el mismo fichero: `interface FudicElementCtor { c(props: unknown[]): Controller }`.
      TypeScript **no admite `static abstract`**, así que la firma que el SDD escribe como
      `static c($props)` dentro de la clase abstracta no puede declararse ahí: la base la
      resuelve por `this.constructor` tipado como `FudicElementCtor` — y no por `new.target`,
      que solo está ligado cuando se invoca con `new` y sería `undefined` dentro de un método.
      Documentar el porqué en el fichero: es la única desviación de forma respecto a §3.7.
- [x] **4. La clase base.**
      Crear `packages/core/src/element.ts`: `abstract class FudicElement extends HTMLElement`
      con campo privado `#controller: Controller | null`, y:
      - `h(props: unknown[])` — instancia venida de SSR: `new.target`/`this.constructor` →
        `c([browserDom, this.shadowRoot, ...props])`, luego `.h()`.
      - `c(props: unknown[])` — instancia creada en runtime: `attachShadow({ mode: 'open' })`
        en vez de adoptar, luego `.c()`.
      - `disconnectedCallback()` — `r()` y soltar el controlador.
      **Sin `connectedCallback`**: el componente no conoce su `data-id`, luego no puede leer
      su tramo; el reparto lo hace el runtime por tag (§4.3, SDD-17 §4.4).
- [x] **5. Baja idempotente.**
      En `element.ts`: desconectar una instancia **nunca hidratada** (controlador `null`) es
      un no-op, y desconectar dos veces no llama a `r()` dos veces. Es la rama que la
      cobertura al 100 % obliga a escribir, y es real: `define` upgradea instancias que nadie
      va a hidratar.
- [x] **6. API pública.**
      Modificar `packages/core/src/index.ts`: exportar `FudicElement`, `type Controller` y
      `type FudicElementCtor`. Actualizar el comentario de cabecera, que hoy dice que la base
      «aterriza con el emit» — ya aterrizó.
- [x] **7. Tests de la base.**
      Crear `packages/core/test/element.test.ts` (happy-dom ya es el entorno del paquete).
      Cubre los criterios §6.9, §6.10 y §6.11 del SDD:
      - una subclase con su propio `static c` recibe en `h`/`c` el controlador de **su**
        factory, no el de la base ni el de otra subclase (`new.target`);
      - conectar un host al DOM no construye controlador ni engancha nada: hasta `h(props)`
        la instancia está inerte;
      - el objeto devuelto expone exactamente `c`, `h`, `r`; `m`/`s`/`u` no son propiedades;
      - `h` adopta `this.shadowRoot` (DSD ya poblado) y `c` abre uno nuevo;
      - `disconnectedCallback` dispara `r()`; sin hidratar y por duplicado, no-op.
- [x] **8. README de `@fudic/core`.**
      Modificar `packages/core/README.md`: sacar `FudicElement` de la lista «Retired» y
      documentarlo en la superficie del paquete, con la nota de empaquetado de §3.7 (la base
      viaja en el módulo de runtime que la página ya carga, para que el `import` del chunk
      resuelva contra un módulo ya evaluado y no pague red dentro del gesto).

## Fase 2 — Codegen de cliente en `@fudic/compiler` (6)

- [x] **9. El emisor de markup de cliente.**
      Crear `packages/compiler/src/emit/markup-client.ts`. Una **sola** pasada sobre el AST
      que escribe tres cuerpos en paralelo, porque calcularlos por separado los desalinea:
      - **fabricar** (`$n1 = $dom.element(...)`, sin ensamblar),
      - **montar** (`m`: los `append` en orden de árbol),
      - **adoptar** (`h`: travesía con cursor, nunca `querySelector`, nunca `cloneNode`).
      Las variables de nodo se declaran `let` en la cabecera de la closure para que las
      asignen los dos caminos. Reutilizar `spaceModeOf`/`collapseSpace`/`nestedSpaceMode` sin
      variación: si el whitespace del cliente no es byte a byte el del servidor, `h` adopta
      corrido.
- [x] **10. El cursor cuenta ELEMENTOS, y el texto se ancla al elemento de al lado.**
      *(Reescrita en la fase 3: la travesía posicional sobre `childNodes` que decía esta
      tarea no sobrevive al viaje por HTML, y la fase 3 lo demostró en ejecución.)*
      El ida y vuelta por HTML **no conserva las fronteras entre nodos de texto**: dos textos
      adyacentes se serializan sin nada en medio y el parser devuelve **uno**. Un cursor que
      cuenta nodos se descuadra la primera vez que un `@if` cerrado deja dos espacios juntos,
      que es casi cualquier plantilla. Los elementos no tienen esa ambigüedad: sobreviven uno
      a uno, y la misma condición toma la misma rama en los dos caminos, así que el cursor
      avanza en paralelo. En `markup-client.ts`:
      - `$dom.firstElementChild` para entrar en un nivel, `$dom.nextElementSibling` para
        avanzar (dos métodos nuevos en `DomClient`, más `lastChild`);
      - el texto **no se localiza contando**: un run con interpolación se ancla al elemento
        vecino (`previousSibling` del cursor) o al final de su nivel (`lastChild`); un run
        estático no se adopta siquiera — nadie reescribe un espacio, así que no necesita ni
        variable;
      - los runs se funden en UN nodo (`runs.ts`, compartido con la rama SSR): un run emitido,
        un nodo del DOM, que es lo que hace que el ancla caiga donde debe.
      Queda **una** forma sin resolver, documentada en el fichero: dos runs interpolados
      separados solo por un constructo que puede no pintar nada (`@a @if (x) { } @b`). Si no
      pinta, los dos runs **son** un único nodo y ninguna travesía puede distinguirlos: eso
      necesita ancla de bloque de verdad, y es el SDD de bloques con su `u`.
- [x] **11. Control de flujo en los dos caminos.**
      En `markup-client.ts`: `@if`/`@foreach` se emiten como el mismo JS en `c` y en `h`. Con
      los mismos props y el mismo estado inicial se toma la misma rama, luego las posiciones
      casan. Es la razón de que el payload sea **completo y no proyección** (§3.3): el DOM
      refleja la rama pintada; el estado la contiene entera.
- [x] **12. El módulo emitido.**
      Crear `packages/compiler/src/emit/client.ts` con `emitComponentClientModule(graph,
      comp, options)` y su variante `…Mapped` (misma pareja que `module.ts`, mismo
      `EmitOutput`). Produce **exactamente** lo que §6.8 exige y nada más:
      ```js
      import { FudicElement } from '@fudic/core';

      customElements.define('app-card', class extends FudicElement {
        static c($props) { /* … */ }
      });
      ```
      Sin `h(props)`, sin `c(props)`, sin `disconnectedCallback`, sin campo de controlador:
      todo eso vive en la base. El cuerpo del factory: `let` de nodos, `const $d = []`,
      `let [$dom, $shadow, …] = $props` (destructuring horneado desde el AST de props, §4.2),
      el cuerpo de `@code { @client }` copiado literal, `m` y `s` como closures locales, y el
      `return { c, h, r }`. `s` se emite **vacío** en esta tanda; `r` anula referencias y
      recorre `$d`.
- [x] **13. Exportar y emitir para todos.**
      Modificar `packages/compiler/src/emit/index.ts` (reexport) y
      `packages/compiler/scripts/build.ts`: además del `.mjs` de servidor, escribir
      `<tag>.client.mjs` **por cada componente del grafo**, sin filtro de nivel — el hito B.
      La URL real y el hashing son de `fud-chunks` (§3.6) y del plugin de Vite (SDD-19): aquí
      basta la convención de fichero hermano.
- [x] **14. Goldens de cliente.**
      Crear `packages/compiler/test/emit/__golden__/{app-badge,app-button,app-card}.client.mjs`
      y ampliar `test/emit/golden.test.ts`. Byte a byte, como los de servidor: cualquier
      refactor que mueva un carácter del codegen falla en voz alta en vez de derivar en
      silencio.

## Fase 3 — Equivalencia servidor ↔ cliente (3)

- [x] **15. Arnés de integración.**
      Crear `packages/compiler/test/emit/hydrate/_harness.ts`: renderiza un componente con la
      rama SSR contra `SsrDom`, lo serializa con `@fudic/ssr`, monta ese HTML como DSD en
      happy-dom, evalúa el módulo de cliente emitido y devuelve host + factory. Requiere
      `// @vitest-environment happy-dom` en los ficheros de este directorio y añadir
      `@fudic/core`, `@fudic/ssr` y `happy-dom` como **devDependencies** de
      `@fudic/compiler` — dependencias de test, no de runtime: el compilador sigue sin
      importar runtime en `src/`.
- [x] **16. Criterio §6.7 — equivalencia `c` ↔ `h`, convergencia en `s`.**
      Crear `test/emit/hydrate/equivalence.test.ts`: `c()` (fabrica → `m` → `s`) y `h()`
      (adopta → `s`) del mismo factory producen el mismo grafo de nodos vivos y los mismos
      valores destructurados, difiriendo solo en cómo obtienen las referencias.
- [x] **17. Criterio §6.14 — un controlador, dos adapters.**
      En el mismo directorio (`adopt.test.ts`): el camino `h` adopta el markup de SSR **sin
      mover un nodo** — `adoptOnly` prohíbe `element`/`text`/`append`, y las identidades de
      nodo se comparan por referencia antes y después de `h()`. El contador de pasos añade lo
      que la tarea 10 volvió comprobable: la travesía **no llama** a `firstChild`,
      `nextSibling` ni `childAt` — no cuenta nodos —, y el único texto que localiza es el
      interpolado.

## Fase 4 — Cierre de la tanda (2)

- [x] **18. Verde en los tres comandos.**
      `pnpm typecheck`, `pnpm test` y `pnpm build` en la raíz. Los ejemplos se construyen
      después de los paquetes: si `examples/basic` se rompe, el build falla.
- [x] **19. Cobertura.**
      `@fudic/core` al **100 %** en las cuatro métricas (código nuevo, sin excepción), y
      `@fudic/dom` igual. `@fudic/compiler` arrastra el suelo heredado 80/80/75, pero los
      ficheros nuevos (`markup-client.ts`, `client.ts`, `runs.ts`) nacen al 100 %: la deuda
      heredada no rebaja el listón de lo nuevo. Nada de `/* v8 ignore */` para llegar al
      número.

## Fase 5 — el plugin los emite (3)

Añadida al cerrar la tanda, por decisión de Pedro: un emisor que solo escribe ficheros
cuando lo llama un script suelto es deuda, y deja pendiente algo difícil de tener presente.
La emisión se cierra aquí; el **enlace** (`data-id` y los cuatro mapas) es la etapa
siguiente. No hace falta saber quién se hidrata para emitir: la hidratación ocurrirá en dos
sitios y en los dos **con datos delante** —el servidor en tiempo de ejecución y el SW en la
navegación—, así que el fichero tiene que existir antes de que nadie pueda preguntarlo.

- [x] **20. El módulo de cliente del plugin.**
      Crear `packages/vite/src/client.ts`: la query `?client` que convierte un componente en
      su chunk, el nombre de salida (`h/<tag>` → `assets/h/<tag>-<hash>.js`) y
      `discoverComponents`, que recorre las rutas construidas y saca **todos** los
      componentes alcanzables por el grafo (`<link rel="component">` transitivo y la cadena
      de layouts), deduplicados por tag y ordenados. Una ruta `excluded` no aporta ninguno.
- [x] **21. `?client` en el transform, y un chunk por componente en `buildStart`.**
      `transformFudClient` en `transform.ts` (devuelve `null` para todo lo que no sea un
      componente: una página, una ruta y un layout se **renderizan**), la rama `?client` en
      el `transform` del plugin —con el strip de TypeScript por Oxc, igual que `?server`, y
      el FUD0363 de los assets que faltan— y el `emitFile` por componente en `buildStart`.
      `FudicElement` sale como chunk compartido solo: es un `import` real, y Rollup lo separa.
- [x] **22. Verde, cobertura y el ejemplo.**
      `test/client.test.ts` + `test/build-client-chunks.test.ts` (13 + 5 casos), `client.ts`
      al 100 % en las cuatro métricas. Los proyectos temporales de los tests de build pasan a
      un alias compartido (`test/helpers/alias.ts`): un proyecto que use el plugin necesita
      `@fudic/core` y `@fudic/dom` resueltos, que es un requisito real del framework y no un
      artefacto de test. En `examples/basic`, `pnpm build` escribe hoy
      `dist/assets/h/{app-badge,app-card,site-nav}-<hash>.js` y `dist/assets/element-<hash>.js`.

---

## Lo que la fase 3 cambió

La equivalencia servidor ↔ cliente no confirmó el diseño: lo corrigió. Ejecutar las dos
ramas sobre un DOM real destapó que el ida y vuelta por HTML funde los nodos de texto
adyacentes, y con eso se cayó la travesía posicional de la tarea 10. La respuesta —cursor de
elementos, runs fundidos, texto anclado al elemento vecino y solo cuando es interpolado— está
escrita en la tarea 10 reescrita, y toca tres sitios además del emisor de cliente:

- **`runs.ts`** (nuevo) y `MarkupEmitter.emitChildren`: la rama **SSR** emite por runs
  también. Un run emitido tiene que ser un nodo del DOM en las dos ramas, o el ancla del
  cliente no cae donde el servidor pintó.
- **`DomClient`**: `firstElementChild`, `nextElementSibling` y `lastChild`.
- **`packages/formatter/test/acceptance/_emit.ts`**: el oráculo de whitespace del formateador
  leía solo los `$dom.text("…")` literales, y ahora el whitespace pegado a una interpolación
  viaja dentro del template literal del run. Se le enseña a leerlo — si no, el criterio 3 deja
  de ver justo lo que existe para ver.

## Nada bloquea

Un apunte de corrección, no una pregunta: `signal` es `peek()`/`set()`, así que
`fixtures/app-card.fud` tenía un error (`expanded.value`) y la rama SSR lo copiaba emitiendo
un `{ value: … }` inerte. Arreglado con el fixture, el emit SSR y sus goldens en la tarea 14.

En el camino `c`, el host del hijo se fabrica y se le cuelgan sus hijos de luz, sin llamar a
su `c(props)`: quién descarga y en qué orden se registra es la tanda siguiente, no ésta.

---

## Enlaces

- Criterios de aceptación cubiertos: §6.7, §6.8, §6.9, §6.10, §6.11, §6.14 de
  [SDD-15](./SDD-15-emit.md#6-criterios-de-aceptación).
- Al cerrar la tanda, anotar el avance en [INDEX.md](./INDEX.md) (registro de progreso).
  SDD-15 **no** pasa a `Hecho` aquí: quedan los mapas de página, los eventos y el bus.
