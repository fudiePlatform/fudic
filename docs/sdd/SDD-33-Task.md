# SDD-33 — Tareas · el núcleo de formularios (`@fudic/forms`)

> **SDD:** [SDD-33 — Formularios reactivos: el núcleo](./SDD-33-formularios-reactivos.md)
> **Paquete:** `@fudic/forms` — **nuevo**, punto de entrada `.` solamente
> **Rama:** `sdd-33-formularios-reactivos`
> **Progreso:** 16 / 16 — **completo**, los 21 criterios de §6 verdes
> **No depende de:** nada que esté en curso. `@fudic/core` está en `Hecho` y este paquete no toca
> ningún fichero existente: se puede llevar en su propio worktree sin cruzarse con nadie.

Da a fudic el modelo de formulario que `docs/forms/` prototipó y que ningún SDD poseía. Es
**runtime puro y sin DOM**: la suite entera corre en Node, y esa es la condición que hace que el
mismo formulario valga en el navegador, en el prerender y en el servidor.

Cada tarea es un paso cerrado: se implementa, se verifica y se marca. Ninguna depende de tareas
posteriores.

---

## Los cinco hitos

**Hito A — el paquete existe y nace al 100 %.** `@fudic/forms` con umbrales al 100 en las cuatro
métricas desde el primer commit, `sideEffects: false` y una sola dependencia: `@fudic/core`.

**Hito B — el modelo.** `control` sobre `signal`, `group` que es un formulario anidado, `form` con
sus campos por nombre. Se lee llamando, como una signal, porque en un formulario es donde más se
lee estado reactivo y dos formas de leer en el mismo fichero es una de más.

**Hito C — escribir sin vaciar.** `$set` total que falla nombrando el campo que falta, `$patch`
parcial que no toca lo que no menciona. Es el defecto del prototipo que un `PATCH` de tres campos
sobre doce convierte en pérdida de datos.

**Hito D — validar con orden.** Cascada, corte en el primer error, `summary`, errores por ruta —y
la **época**, que es lo que impide que una validación asíncrona lenta pinte el error de un valor
que el usuario ya cambió.

**Hito E — tipos y poda.** Las doce factorías tipadas como exports independientes (el tipo declara
rango y valida), y la medición sobre el chunk que demuestra que quien no las usa no las descarga.

**Fuera de esta tanda:** el DOM entero, la directiva `control`, `formassociated`, el transporte
posicional, el códec binario y la normalización profunda. Los tres primeros son
[SDD-34](./SDD-34-forms-compilador.md); los otros esperan a `@fudic/http`.

---

## Fase 1 — El paquete (1)

- [x] **1. Andamiaje de `@fudic/forms`.**
      `packages/forms/` extendiendo `tsconfig.base.json`, con `vitest.config.ts` en entorno
      **`node`** —sin `happy-dom`, y que se note—, `coverage.include: ['src/**/*.ts']` y
      `thresholds` al **100** en las cuatro métricas desde el primer commit. `package.json` con
      versión exacta de `@fudic/core`, `sideEffects: false` y **un solo** export: `.`. Los puntos
      `./dom` y `./element` los añade SDD-34; declararlos ahora sería prometer ficheros que no
      existen.

## Fase 2 — El modelo (3)

- [x] **2. `control()`.**
      `src/control.ts`: cuatro signals —valor, errores, `touched`, `dirty`— y las tres operaciones
      (`set`, `touch`, `reset`). Se lee **llamando**, nunca `.value` (SDD-31 §4.0). `set` normaliza
      `undefined` a `null` y calcula `dirty` con `Object.is` contra el inicial; `dirty` no es un
      `computed` porque su otra fuente no es reactiva. Criterios §6.1–§6.3.
- [x] **3. `form()` y `group()`, que son la misma cosa.**
      `src/form.ts`: la API `$` más los campos por nombre. `group(schema)` devuelve **lo mismo**
      que `form(schema)`, así que `f.seo.$value()` y `f.seo.$touch()` existen sin escribir el caso
      anidado. `Node` es una unión de **dos** casos y la recursión tiene un solo `if`. Criterio
      §6.4, escrito **parametrizado por la raíz** para que corra contra el formulario y contra un
      grupo.
- [x] **4. `$value()` rastreado.**
      Lectura del objeto entero, en orden de declaración, con los grupos anidados. Leerlo dentro
      de un `effect` tiene que reejecutar el efecto cuando cambia **cualquier** campo, incluido uno
      dentro de un grupo: es lo que lo distingue de recorrer el schema a mano. Criterio §6.7.

## Fase 3 — Escritura (2)

- [x] **5. `$set` total.**
      Un campo ausente es `TypeError` **nombrándolo**, un nombre fuera del schema también, y en los
      dos casos el formulario queda **intacto**: la comprobación va antes de la primera escritura,
      no a mitad. Criterio §6.5.
- [x] **6. `$patch` parcial.**
      Solo toca lo que aparece, y baja recursivamente en los grupos sin tocar lo que no se
      menciona dentro. Criterio §6.6. Las dos operaciones se llaman distinto **a propósito**: el
      prototipo tenía una sola con semántica total y por eso vaciaba en silencio.

## Fase 4 — Validación (3)

- [x] **7. `$validate` en cascada.**
      Recorrido en orden de declaración; los validadores de un nodo corren en orden y **cortan en
      el primero que falla**; publica en `node.errors`, en `$errors()` por ruta y en `$summary()`.
      `$validate` de un grupo valida su subárbol con el mismo código. Criterios §6.8–§6.10.
- [x] **8. La época.**
      Un entero por control que `set` incrementa; un resultado de validación **solo se publica si
      su época sigue vigente**. Y lo mismo a nivel de formulario para dos `$validate()` solapados.
      Criterio §6.11, que se escribe con la latencia controlada desde el test y **resolviendo
      primero la validación vieja**: sin la época ese test falla, y es exactamente el defecto que
      la red produce con un validador remoto.
- [x] **9. `$setErrors`, `$touch` y `$reset`.**
      Los errores que vienen de fuera —un 422— entran por ruta, marcan `touched` **solo** los
      suyos, y una ruta que el schema no tiene **se ignora sin lanzar**: un servidor no puede
      tumbar la página nombrando un campo que no existe. Es la única resolución de rutas del
      núcleo (§4.6). Criterios §6.13–§6.14.

## Fase 5 — Validadores (2)

- [x] **10. Los seis de serie, un módulo cada uno.**
      `required`, `minLength`, `maxLength`, `min`, `max`, `pattern`, más `validator()` como
      identidad tipada. Un fichero por export: es lo que hace que quien no usa `pattern` no se
      lleve su `RegExp`.
- [x] **11. `serverValidator`.**
      La marca y el salto: sin `{ server: true }` no se ejecuta. **No** es `validator.server` —un
      namespace colgado de una función no se poda—. Borrar su cuerpo del bundle de cliente es de
      SDD-34 §4.7 y aquí solo se deja el gancho. Criterio §6.12.

## Fase 6 — Controles tipados (2)

- [x] **12. Las doce factorías.**
      `src/typed/`, un fichero y un export por tipo: `u8` `i8` `u16` `i16` `u32` `i32` `f32` `f64`
      `bool` `str` `date` `arr`. Cada una construye un `control()` normal y le añade `type` y **un
      validador de rango el primero de la lista**, para que un valor que no cabe en el ancho no
      llegue a las reglas de negocio. `arr` recibe la **factoría** del elemento (`arr(str, [])`),
      no una cadena, para no obligar a una tabla de tipos viva en el bundle. Criterios §6.17–§6.18.
- [x] **13. El fixture numérico.**
      El schema de línea de pedido de `docs/forms/typed-binary.mjs` §2, escrito con las factorías,
      como fixture de test. No se mide nada binario aquí —eso es del transporte—: lo que demuestra
      es que un schema **entero** tipado se escribe sin ceremonia y que sus rangos validan.

## Fase 7 — Poda y cierre (2)

- [x] **14. Los dos tests de arquitectura.**
      (a) **Cero DOM**: un test recorre `src/**/*.ts` y falla si aparece `document`, `window`,
      `HTMLElement`, `Element` o `navigator`. (b) **Poda medida**: tres entradas empaquetadas con
      Rollup, y la comprobación por identificadores en el chunk —una entrada con `form`, `control`
      y `required` no puede contener ninguna de las doce factorías tipadas ni los validadores que
      no importa; una entrada sin `@fudic/forms` pesa cero—. Criterios §6.15–§6.16. **Este es el
      test que hace que la regla de escritura sea una regla y no una intención.**
      > **Cómo quedó (b), y por qué.** La medida se hace sobre el **grafo de módulos** leído de
      > las fuentes, no empaquetando con Rollup: es la misma pregunta —qué módulos arrastra una
      > entrada que importa `form`, `control` y `required`— y aquí la granularidad de la poda **es**
      > el módulo, porque cada export vive en el suyo. A cambio no depende de la versión del
      > bundler ni de una API que este paquete no usa para nada más. La medida en **bytes** sobre
      > el chunk de una ruta real tiene su sitio en SDD-34 §6.15, que es donde ya hay rutas que
      > medir. Se añade además una comprobación que el bundler no daría: ningún módulo del paquete
      > tiene import de efecto, que es lo único sobre lo que `sideEffects: false` podría mentir.
- [x] **15. Verde, cobertura e índice.**
      `pnpm typecheck`, `pnpm test` y `pnpm build` en la raíz. `@fudic/forms` al **100 %** en las
      cuatro métricas, sin un solo `/* v8 ignore */`. Anotar el avance en [INDEX.md](./INDEX.md) y
      pasar SDD-33 a `Hecho` si los 21 criterios de §6 están verdes.
      > **Verde: 92 tests del paquete, 3 405 en el monorepo, y build completo con `examples/basic`.**
      > Cobertura **100 / 100 / 100 / 100**. La ejecución encontró **tres defectos de tipos que
      > ningún test dinámico habría visto**, los tres de la API pública y no de los tests:
      > `control('')` infería `Control<''>` —un control que solo puede valer la cadena vacía, así
      > que el primer `set('hola')` era error—, `$patch` pedía el grupo **completo** porque
      > `Partial<Value<S>>` solo es parcial en el primer nivel, y `AnyForm` como `Form<Schema>`
      > hacía que un `group` no fuera asignable a un nodo —TypeScript no da índice implícito a una
      > intersección con interfaz—, con lo que **todo schema que tuviera un grupo perdía los tipos
      > de sus campos**. Corregidos con `Widen<T>`, `Patch<S>` y `AnyForm = FormApi<Schema>`.
      > Queda anotada una limitación de inferencia que no es un defecto: un schema escrito **en
      > línea** junto a una regla declarada aparte y anotada a mano no infiere; con el schema en su
      > `const` —que es como se escribe— funciona.

## Fase 8 — El `root` tipado de un validador (1)

**Cerrada.** No se trasladó a SDD-34: allí el problema sería el mismo, escrito un nivel más
arriba.

- [x] **16. Una regla que mira otro campo se escribe con su `root` tipado, y sin castear.**

      **Lo que tiene que compilar**, tal cual, sin un `as` en ninguna parte:

      ```ts
      type Post = { published: Control<boolean> };   // o Form<typeof postSchema>

      const requiredIfPublished = (v: string, root: Post) =>
        root.published() && v.trim() === '' ? { requiredIfPublished: true } : null;

      const postSchema = {
        published: control(false),
        body: control('', [requiredIfPublished]),
      };
      ```

      **Lo que hay hoy**, y que es el punto de partida a borrar: `Validator<T>` recibe el
      formulario **sin tipar**, así que toda regla que cruza campos escribe
      `(root as unknown as { published: Control<boolean> }).published`. Se ve en
      `test/fixtures/blog.ts`. El editor no completa, y renombrar `published` no rompe la
      compilación: revienta en ejecución.

      **Por qué no sale gratis.** El tipo público ya es `Validator<T, R = AnyForm>` (§3), pero eso
      solo no basta: el hueco donde vive la regla —la lista de validadores de `control()`— está
      declarado con el `root` ancho, y una función que pide un `root` **más estrecho** no es
      asignable a una que promete aceptar cualquiera (contravarianza, y `strictFunctionTypes` está
      activo). Hay que hacer que el hueco acepte cualquier `root`; la vía más corta es que el
      parámetro del hueco sea el tipo de fondo (`never`), que por contravarianza acepta todos, y
      que la **librería** pague un único cast en el punto donde invoca la regla. Un cast dentro,
      cero castes fuera: es el reparto correcto.

      **Cuidado con lo que no se puede pedir.** El `root` no se puede *inferir* del schema: la
      regla se escribe **antes** que el schema del que forma parte, y el schema se define en
      términos de ella. Por eso el tipo lo nombra el autor, que es justo lo que pide el ejemplo.

      **Verificación.** Criterio §6.21, y **el test es de tipos**: un fichero que debe compilar,
      con las tres formas conviviendo en un mismo schema —regla con `root` tipado, regla sin
      `root`, y `serverValidator`—. Un test dinámico no puede ver esto. Al terminar: `typecheck`,
      `test` y `coverage` verdes, `@fudic/forms` sigue al **100 %**, y quitar el cast de
      `test/fixtures/blog.ts`, que es la prueba de que el problema se ha ido de donde molestaba.

      > **Cómo quedó.** El hueco es `AnyValidator<T> = Validator<T, never>` (§3), y lo usan la
      > lista de `control()`, la de `group()` y las doce factorías tipadas. La librería paga el
      > único cast en **`src/run-rule.ts`**, que es ahora el único sitio del paquete donde se
      > invoca una regla: `control.ts` y `form.ts` llaman por él. `validator()` y
      > `serverValidator()` llevan la `R` para no aplanar el `root` que el autor pidió.
      > El test es **`test/root-typing.test.ts`**, y lo que prueba es que compila —`typecheck`
      > cubre `test/` además de `src/`—: las tres formas en un schema, los dos sabores de `root`
      > (una forma estructural y un `Form<…>`, que además llega al `$` API) y **dos
      > `@ts-expect-error`, que son la aserción corriendo hacia atrás**: renombrar el campo que la
      > regla mira falla la compilación, y una regla sobre el **valor** equivocado se sigue
      > rechazando — o sea que lo que se abrió es el `root` y nada más, que es lo que separa
      > `never` de haber puesto `any`. Fuera los dos castes que quedaban en los tests
      > (`fixtures/blog.ts` y `validate.test.ts`). Verde: **107 tests** del paquete, **3 420** en
      > el monorepo, cobertura **100 / 100 / 100 / 100** y `pnpm build` completo.

---

## Lo que esta tanda deja listo para la siguiente

**SDD-34 puede empezar sin tocar nada de esto.** Tiene un modelo con `errors`, `touched` y
`dirty` legibles de forma rastreada —que es todo lo que un enlace con el DOM necesita para
pintar—, `$touch()` y el foco al primer inválido resolubles desde `$errors()`, y `$setErrors`
para el 422.

**Y el transporte, cuando llegue, no tiene que negociar nada.** El orden es `$fields()`, el
contrato es `$schema`, y los tipos ya están declarados: `toPositional`/`fromPositional` y el códec
binario se escriben **fuera**, como funciones libres, sin añadir un getter al formulario.

## Enlaces

- Criterios de aceptación: los 21 de
  [SDD-33 §6](./SDD-33-formularios-reactivos.md#6-criterios-de-aceptación).
- El prototipo que origina todo esto: `docs/forms/` (commit `bc5a2a3`), con sus diez casos y su
  formulario real. Es **evidencia de comportamiento**, no diseño: lo que aquí se aparta de él está
  argumentado en §4 del SDD.
- Hermano: [SDD-34](./SDD-34-forms-compilador.md), que es la otra mitad y no puede empezar antes.
