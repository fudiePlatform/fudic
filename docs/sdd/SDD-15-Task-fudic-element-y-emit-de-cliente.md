# SDD-15 — Tareas · `FudicElement` y emit de cliente

> **SDD:** [SDD-15 — Emit (AST → runtime)](./SDD-15-emit.md)
> **Paquetes:** `@fudic/core` (base de custom element) · `@fudic/compiler` (emit)
> **Rama:** `worktree-sdd-15-17-hidratacion`
> **Progreso:** 14 / 19

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
      - **adoptar** (`h`: travesía posicional con `$dom.childAt` / `$dom.firstChild` /
        `$dom.nextSibling`, nunca `querySelector`, nunca `cloneNode`).
      Las variables de nodo se declaran `let` en la cabecera de la closure para que las
      asignen los dos caminos. Reutilizar `spaceModeOf`/`collapseSpace`/`nestedSpaceMode` sin
      variación: si el whitespace del cliente no es byte a byte el del servidor, `h` adopta
      corrido.
- [x] **10. Travesía posicional sobre `childNodes`, no sobre `children`.**
      En `markup-client.ts`: los índices cuentan **todos** los nodos, texto incluido —
      `browserDom.childAt` ya usa `childNodes`. Es lo que hace determinista la adopción, y
      se apoya en §4.9: el emit colapsa el whitespace a un espacio pero **no elimina ningún
      nodo de texto**, así que las posiciones de servidor y cliente coinciden por
      construcción. El ejemplo de §4.6 usa `$shadow.children[i]`, que **no** sirve: saltaría
      los nodos de texto que el propio emit garantiza. Dejarlo escrito en el fichero.
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

- [ ] **15. Arnés de integración.**
      Crear `packages/compiler/test/emit/hydrate/_harness.ts`: renderiza un componente con la
      rama SSR contra `SsrDom`, lo serializa con `@fudic/ssr`, monta ese HTML como DSD en
      happy-dom, evalúa el módulo de cliente emitido y devuelve host + factory. Requiere
      `// @vitest-environment happy-dom` en los ficheros de este directorio y añadir
      `@fudic/core`, `@fudic/ssr` y `happy-dom` como **devDependencies** de
      `@fudic/compiler` — dependencias de test, no de runtime: el compilador sigue sin
      importar runtime en `src/`.
- [ ] **16. Criterio §6.7 — equivalencia `c` ↔ `h`, convergencia en `s`.**
      Crear `test/emit/hydrate/equivalence.test.ts`: `c()` (fabrica → `m` → `s`) y `h()`
      (adopta → `s`) del mismo factory producen el mismo grafo de nodos vivos y los mismos
      valores destructurados, difiriendo solo en cómo obtienen las referencias.
- [ ] **17. Criterio §6.14 — un controlador, dos adapters.**
      En el mismo directorio: el camino `h` adopta el markup de SSR **sin mover un nodo** —
      comparar el HTML del shadow antes y después de `h()`, byte a byte. Es el test que
      detecta cualquier divergencia de whitespace, de orden o de índice entre las dos ramas.

## Fase 4 — Cierre de la tanda (2)

- [ ] **18. Verde en los tres comandos.**
      `pnpm typecheck`, `pnpm test` y `pnpm build` en la raíz. Los ejemplos se construyen
      después de los paquetes: si `examples/basic` se rompe, el build falla.
- [ ] **19. Cobertura.**
      `@fudic/core` al **100 %** en las cuatro métricas (código nuevo, sin excepción).
      `@fudic/compiler` arrastra el suelo heredado 80/80/75, pero los ficheros nuevos
      (`markup-client.ts`, `client.ts`) nacen al 100 %: la deuda heredada no rebaja el listón
      de lo nuevo. Nada de `/* v8 ignore */` para llegar al número.

---

## Nada bloquea

Un apunte de corrección, no una pregunta: `signal` es `peek()`/`set()`, así que
`fixtures/app-card.fud` tiene un error (`expanded.value`) y la rama SSR lo copia emitiendo un
`{ value: … }` inerte. Se arregla el fixture, el emit SSR y sus goldens dentro de la tarea 14.

En el camino `c`, el host del hijo se fabrica y se le cuelgan sus hijos de luz, sin llamar a
su `c(props)`: quién descarga y en qué orden se registra es la tanda siguiente, no ésta.

---

## Enlaces

- Criterios de aceptación cubiertos: §6.7, §6.8, §6.9, §6.10, §6.11, §6.14 de
  [SDD-15](./SDD-15-emit.md#6-criterios-de-aceptación).
- Al cerrar la tanda, anotar el avance en [INDEX.md](./INDEX.md) (registro de progreso).
  SDD-15 **no** pasa a `Hecho` aquí: quedan los mapas de página, los eventos y el bus.
