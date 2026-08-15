# SDD-34 — Tareas · `control`, control-componentes y accesibilidad

> **SDD:** [SDD-34 — Formularios en el compilador](./SDD-34-forms-compilador.md)
> **Paquetes:** `@fudic/compiler` (parser, semántica, emit) · `@fudic/forms` (`./dom`,
> `./element`) · `@fudic/core` (la lista `eager` del mapa de página) · `@fudic/vite` (el borrado
> del validador de servidor)
> **Rama:** `sdd-34-forms-compilador`
> **Progreso:** 0 / 16
> **Depende de:** [SDD-33](./SDD-33-formularios-reactivos.md) en `Hecho`. No es un
> encadenamiento burocrático: la fase 2 llama a `errors()`, `touch()` y `$setErrors` desde la
> primera línea.

Enchufa el modelo a la página desde el único sitio desde el que fudic puede hacerlo bien: el
compilador, que **ya sabe qué elemento es cada uno**. De ahí salen las tres cosas que el
prototipo hacía en runtime y aquí desaparecen —escanear el DOM, discriminar por `el.type` y
fabricar el hueco del error— y la regla que gobierna la tanda entera:

> El cableado estático de accesibilidad se paga en el emit; el JavaScript solo compra lo dinámico.

---

## Los seis hitos

**Hito A — la gramática.** `control` como atributo reservado de la familia de `ref`, con sus cinco
diagnósticos y las decisiones 100–106 escritas en el documento de gramática.

**Hito B — el runtime de enlace.** `@fudic/forms/dom`: seis funciones, una por forma de elemento,
cada una en su módulo. Ninguna sabe de las otras y ninguna busca nada en el DOM.

**Hito C — el emit.** Elegir la función en compilación, escribir el hueco del error con id
estable y el `aria-describedby` en el HTML **de SSR**, y no dejar el atributo `control` en la
salida.

**Hito D — el control-componente.** `<template shadowrootmode="open" formassociated>`,
`FudicControlElement` con `ElementInternals`, `delegatesFocus`, y la única excepción a SDD-17: su
tag se define y se hidrata **al cargar**, porque un componente form-associated a medio levantar no
es etiquetable y eso es un fallo de accesibilidad, no una optimización pendiente.

**Hito E — el bundle.** El cuerpo de un `serverValidator` no llega al navegador, y el presupuesto
por ruta se mide sobre el chunk.

**Hito F — Chrome de verdad.** Etiqueta externa que enfoca el input de dentro, `FormData` de un
`<form>` ajeno, `:invalid`, y el eager medido contra un componente normal de la misma página.

**Fuera de esta tanda:** el envío (`@fudic/http`, `form:="@Put"`), `FormArray`, subida de
ficheros, `bind:` y el códec binario.

---

## Fase 1 — Gramática y semántica (4)

- [ ] **1. Las decisiones, escritas donde viven.**
      Añadir 100–106 a [`gramatica-v1-decisiones.md`](../gramar/gramatica-v1-decisiones.md) —
      sección 7, junto a `ref` (30) y a los prefijos reservados (22, 28.a)— y sus filas al índice
      de decisiones del final. Va **la primera** porque las cinco tareas siguientes las citan.
- [ ] **2. `control` en el parser.**
      Atributo reservado con valor de expresión, de la familia de `ref` (decisión 100) y **no** de
      `class:`/`bus:`: esos llevan un nombre detrás del `:` y aquí no hay nada que nombrar. Nodo
      con su span y su expresión. `control="title"`, sin `@`, es `FUD0590` — que es además la
      forma del prototipo, así que el diagnóstico enseña la migración. Criterio §6.1.
- [ ] **3. La clasificación por elemento.**
      Decisión 101, los cuatro casos: `<form>`, elemento que porta valor, tag de componente,
      cualquier otro elemento (grupo). Y la forma concreta del elemento que porta valor, que es la
      tabla de §4.2. Un `type` **dinámico** no se puede decidir en compilación y es `FUD0592`: no
      se emite un despacho de runtime para rescatarlo, porque eso devolvería al bundle la tabla
      que esta tanda quita. Criterios §6.2, §6.5.
- [ ] **4. Las reglas semánticas y el rango.**
      `FUD0591` (dos elementos al mismo nodo, **salvo** que todos sean radios: ahí el emit agrupa
      y emite una sola llamada), `FUD0593` (`formassociated` fuera del template raíz del
      componente) y `FUD0594` (`control` dentro de un bucle, la decisión 31 aplicada por el mismo
      motivo que a `ref`). Reservar `FUD0590`–`FUD0619` en el catálogo consolidado de
      [SDD-12](./SDD-12-semantica.md). **Ninguno lanza**: se anota, se omite ese enlace y el
      fichero se sigue emitiendo. Criterios §6.3, §6.4, §6.6.

## Fase 2 — El runtime de enlace (3)

- [ ] **5. Las seis funciones de enlace, un módulo cada una.**
      `packages/forms/src/dom/`: `bindText`, `bindNumber`, `bindCheckbox`, `bindRadio`,
      `bindSelect`, `bindSelectMultiple`. Cada una: elemento → control en `input` y `change`,
      `touch()` en `blur`, un `effect` de vuelta que **no escribe si el valor ya coincide** —por
      lo mismo que `$w` en BUG-12: escribir en un input enfocado mueve el cursor— y su `Cleanup`.
      Ninguna importa a las otras. Criterio §6.11.
- [ ] **6. El efecto de errores y el hueco.**
      Segundo `effect` por enlace: `aria-invalid` en el elemento y **texto** en el hueco que el
      emit ya dejó escrito — el runtime **no crea nodos**. Y solo si el control está `touched`: un
      campo obligatorio no está mal por estar todavía vacío. `setMessages` para el texto; sin él,
      el código de la regla. Criterio §6.12.
- [ ] **7. `bindForm` y `bindGroup`.**
      El formulario: `preventDefault` + `$touch()` + **foco al primer control inválido en orden de
      documento** —que es la salida portable al hecho de que `aria-describedby` no cruza la
      frontera de un shadow root— y el `$summary()` en una live region. La decisión de submit es
      **síncrona y con el último estado conocido**: `$validate` es asíncrono y `preventDefault` no
      lo es; quien decide de verdad es el servidor. `bindGroup` agrupa errores sobre el elemento
      que el autor haya elegido. Criterio §6.13.

## Fase 3 — El emit (3)

- [ ] **8. Elegir la función en compilación.**
      El `switch` se muda aquí: por cada enlace, el emit escribe la llamada concreta. El golden de
      un componente con un solo `<input type="text">` **no puede contener** el nombre de las otras
      cinco. Criterio §6.7.
- [ ] **9. El hueco del error, en el markup.**
      Id estable derivado de la identidad del nodo —la misma que ya usa la hidratación—,
      `aria-describedby` **siempre presente** aunque el hueco esté vacío, y `aria-invalid` y texto
      **ya puestos** cuando el formulario se renderiza con errores. El atributo `control` **no**
      sobrevive al HTML. Criterio §6.8.
- [ ] **10. La invariante de accesibilidad, medida.**
      Criterio §6.10: el mismo formulario con los mismos errores por los dos caminos —SSR con
      `$setErrors` aplicado antes de renderizar, y cliente hidratado— produce **el mismo HTML** en
      id, `aria-describedby`, `aria-invalid` y texto. Es el test que el prototipo no podía pasar
      fabricando el `<span>` al vuelo, y el que impide que la accesibilidad dependa de si hubo JS.

## Fase 4 — El control-componente (3)

- [ ] **11. `FudicControlElement`.**
      `packages/forms/src/element.ts`, extendiendo `FudicElement` de `@fudic/core`:
      `static formAssociated = true`, `attachInternals()` en el constructor —el único momento en
      que se puede—, `setFormValue` siguiendo al valor y `setValidity` siguiendo a `errors`. Vive
      en `forms` y no en `core` porque necesita el tipo `Control<T>`: `forms` depende de `core` y
      **nunca al revés**.
- [ ] **12. El marcador y el emit que lo sigue.**
      `<template shadowrootmode="open" formassociated>` (decisión 103) → clase base
      `FudicControlElement`, `attachShadow({ delegatesFocus: true })` en cliente y
      `shadowrootdelegatesfocus` en el `<template>` serializado. Sin `delegatesFocus`, un `<label>`
      de fuera enfoca el host y no el `<input>` de dentro. El marcador es de compilación y **no
      llega al DOM**. Criterio §6.9.
- [ ] **13. `eager` en el mapa de página.**
      El mapa gana la lista de tags que se definen y se hidratan al instalar el runtime, y el
      runtime de SDD-17 la consume antes del primer gesto. **Acotada a los tags `formassociated`**
      y a ningún otro: es la única forma de hidratación de fudic que no la conduce el usuario, y
      se mide (§6.16) en la misma página que un componente normal que sigue sin JavaScript.

## Fase 5 — El cruce y el bundle (2)

- [ ] **14. `control` sobre un tag de componente.**
      Decisión 104: cruza la **referencia** del nodo como prop. Convive con la 84 —ninguna signal
      cruza el shadow boundary— y no la deroga: lo que cruza no es estado de render del padre sino
      el **modelo**, nombrado por el autor, y el hijo se suscribe por su cuenta; **no se emite `u`
      para ese prop**. La alternativa (`bind:`, prop de valor + callback) exigiría cruzar además
      errores, `touched`, `dirty` y la orden de validar. Criterio §6.2 (la parte del componente).
- [ ] **15. El borrado del validador de servidor.**
      Transformación del plugin (SDD-19) sobre el `.ts` del schema en el build de **cliente**:
      reconocer `serverValidator(...)` por su binding importado de `@fudic/forms` y sustituir **su
      argumento** por `() => null`. El argumento y no la llamada, para que el array de validadores
      conserve longitud y orden; con la función original sin referencias, Rollup se lleva lo que
      colgaba de ella —el import de la capa de datos incluido—. Criterio §6.14.

## Fase 6 — Cierre (1)

- [ ] **16. Chrome real, presupuesto, cobertura e índice.**
      Los tres criterios de navegador (§6.16–§6.18): eager contra no-eager en la misma página,
      `<label for>` externo que enfoca el input de dentro —con el contraste **sin**
      `formassociated` escrito, que es lo que justifica el JS de arranque—, y un `<form>` ajeno
      que recoge el valor por `setFormValue` con `:invalid` por `setValidity`. Más el presupuesto
      por ruta medido sobre el chunk (§6.15). `pnpm typecheck`, `pnpm test`, `pnpm build`.
      `./dom` y `./element` al **100 %**; el código nuevo del compilador y del plugin, también.
      Anotar en [INDEX.md](./INDEX.md) y pasar SDD-34 a `Hecho` con sus 18 criterios verdes.

---

## Lo que esta tanda deja listo para la siguiente

**El transporte se puede escribir sin tocar nada de esto.** Un formulario ya se rellena desde
inputs reales, valida, pinta errores accesibles y recibe un 422 por `$setErrors`. Lo que falta es
quién lo manda, y ese es el SDD de `@fudic/http` con el prototipo medido de `docs/forms/` —envío
posicional, umbral de compresión, pipeline de etapas— esperando.

**Y queda dicho lo que no se ha resuelto:** que un componente que recibe un `Control<T>` y puede
llevar su etiqueta fuera **debería** declararse `formassociated`. Es una regla que el compilador no
puede comprobar —no sabe dónde pondrá la etiqueta quien lo use— y que el LSP sí podría (SDD-24).

## Enlaces

- Criterios de aceptación: los 18 de
  [SDD-34 §6](./SDD-34-forms-compilador.md#6-criterios-de-aceptación).
- Decisiones de gramática nuevas: 100–106, en
  [`gramatica-v1-decisiones.md`](../gramar/gramatica-v1-decisiones.md) (tarea 1).
- Extiende [SDD-17](./SDD-17-hidratacion.md) con **una** excepción acotada: la lista `eager`.
- No toca [`bind:`](./pendings/PENDIENTES-v1.md) (decisiones 83–85), que sigue pendiente con su
  hueco abierto —el nombre de la prop callback— donde estaba.
