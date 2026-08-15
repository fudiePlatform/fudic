# SDD-33 — Tareas · el núcleo de formularios (`@fudic/forms`)

> **SDD:** [SDD-33 — Formularios reactivos: el núcleo](./SDD-33-formularios-reactivos.md)
> **Paquete:** `@fudic/forms` — **nuevo**, punto de entrada `.` solamente
> **Rama:** `sdd-33-formularios-reactivos`
> **Progreso:** 4 / 15
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

- [ ] **5. `$set` total.**
      Un campo ausente es `TypeError` **nombrándolo**, un nombre fuera del schema también, y en los
      dos casos el formulario queda **intacto**: la comprobación va antes de la primera escritura,
      no a mitad. Criterio §6.5.
- [ ] **6. `$patch` parcial.**
      Solo toca lo que aparece, y baja recursivamente en los grupos sin tocar lo que no se
      menciona dentro. Criterio §6.6. Las dos operaciones se llaman distinto **a propósito**: el
      prototipo tenía una sola con semántica total y por eso vaciaba en silencio.

## Fase 4 — Validación (3)

- [ ] **7. `$validate` en cascada.**
      Recorrido en orden de declaración; los validadores de un nodo corren en orden y **cortan en
      el primero que falla**; publica en `node.errors`, en `$errors()` por ruta y en `$summary()`.
      `$validate` de un grupo valida su subárbol con el mismo código. Criterios §6.8–§6.10.
- [ ] **8. La época.**
      Un entero por control que `set` incrementa; un resultado de validación **solo se publica si
      su época sigue vigente**. Y lo mismo a nivel de formulario para dos `$validate()` solapados.
      Criterio §6.11, que se escribe con la latencia controlada desde el test y **resolviendo
      primero la validación vieja**: sin la época ese test falla, y es exactamente el defecto que
      la red produce con un validador remoto.
- [ ] **9. `$setErrors`, `$touch` y `$reset`.**
      Los errores que vienen de fuera —un 422— entran por ruta, marcan `touched` **solo** los
      suyos, y una ruta que el schema no tiene **se ignora sin lanzar**: un servidor no puede
      tumbar la página nombrando un campo que no existe. Es la única resolución de rutas del
      núcleo (§4.6). Criterios §6.13–§6.14.

## Fase 5 — Validadores (2)

- [ ] **10. Los seis de serie, un módulo cada uno.**
      `required`, `minLength`, `maxLength`, `min`, `max`, `pattern`, más `validator()` como
      identidad tipada. Un fichero por export: es lo que hace que quien no usa `pattern` no se
      lleve su `RegExp`.
- [ ] **11. `serverValidator`.**
      La marca y el salto: sin `{ server: true }` no se ejecuta. **No** es `validator.server` —un
      namespace colgado de una función no se poda—. Borrar su cuerpo del bundle de cliente es de
      SDD-34 §4.7 y aquí solo se deja el gancho. Criterio §6.12.

## Fase 6 — Controles tipados (2)

- [ ] **12. Las doce factorías.**
      `src/typed/`, un fichero y un export por tipo: `u8` `i8` `u16` `i16` `u32` `i32` `f32` `f64`
      `bool` `str` `date` `arr`. Cada una construye un `control()` normal y le añade `type` y **un
      validador de rango el primero de la lista**, para que un valor que no cabe en el ancho no
      llegue a las reglas de negocio. `arr` recibe la **factoría** del elemento (`arr(str, [])`),
      no una cadena, para no obligar a una tabla de tipos viva en el bundle. Criterios §6.17–§6.18.
- [ ] **13. El fixture numérico.**
      El schema de línea de pedido de `docs/forms/typed-binary.mjs` §2, escrito con las factorías,
      como fixture de test. No se mide nada binario aquí —eso es del transporte—: lo que demuestra
      es que un schema **entero** tipado se escribe sin ceremonia y que sus rangos validan.

## Fase 7 — Poda y cierre (2)

- [ ] **14. Los dos tests de arquitectura.**
      (a) **Cero DOM**: un test recorre `src/**/*.ts` y falla si aparece `document`, `window`,
      `HTMLElement`, `Element` o `navigator`. (b) **Poda medida**: tres entradas empaquetadas con
      Rollup, y la comprobación por identificadores en el chunk —una entrada con `form`, `control`
      y `required` no puede contener ninguna de las doce factorías tipadas ni los validadores que
      no importa; una entrada sin `@fudic/forms` pesa cero—. Criterios §6.15–§6.16. **Este es el
      test que hace que la regla de escritura sea una regla y no una intención.**
- [ ] **15. Verde, cobertura e índice.**
      `pnpm typecheck`, `pnpm test` y `pnpm build` en la raíz. `@fudic/forms` al **100 %** en las
      cuatro métricas, sin un solo `/* v8 ignore */`. Anotar el avance en [INDEX.md](./INDEX.md) y
      pasar SDD-33 a `Hecho` si los 18 criterios de §6 están verdes.

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

- Criterios de aceptación: los 18 de
  [SDD-33 §6](./SDD-33-formularios-reactivos.md#6-criterios-de-aceptación).
- El prototipo que origina todo esto: `docs/forms/` (commit `bc5a2a3`), con sus diez casos y su
  formulario real. Es **evidencia de comportamiento**, no diseño: lo que aquí se aparta de él está
  argumentado en §4 del SDD.
- Hermano: [SDD-34](./SDD-34-forms-compilador.md), que es la otra mitad y no puede empezar antes.
