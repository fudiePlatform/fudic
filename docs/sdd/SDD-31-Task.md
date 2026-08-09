# SDD-31 — Tareas · `computed`, `effect`, `batch`

> **SDD:** [SDD-31 — Signals derivadas](./SDD-31-signals-derivadas.md)
> **Paquetes:** `@fudic/core` (las primitivas y el recorte de `Signal`) · `@fudic/compiler` (el
> emit de §4.6–§4.8) · `@fudic/example-basic` (los `.fud` que usan `peek()`)
> **Rama:** `sdd-31-computed-effect`
> **Progreso:** 6 / 17
> **No depende de:** SDD-30 ni de la tanda de eventos. Puede ir en paralelo, en su propio
> worktree: no comparte un fichero con ninguna de las dos.

Da a `@fudic/core` las tres primitivas que le faltan y le quita a `signal` los dos métodos que
sobran. Es un **recorte de API con un enganche de emit**, no un rediseño: la tarea 13 lo verifica
exigiendo que los goldens se muevan **solo** en las tres formas de §4.5.

Cada tarea es un paso cerrado: se implementa, se verifica y se marca. Ninguna depende de tareas
posteriores.

---

## Los cuatro hitos

**Hito A — el rastreo existe.** Una variable de módulo (`$active`) y un contador de versión por
signal. Con eso `sig()` deja de ser un alias de `peek()` y pasa a registrar dependencias. Nada del
código emitido lo nota todavía, porque el emit sigue escribiendo `peek()` y `subscribe()`.

**Hito B — las tres primitivas.** `computed` **pull** (versión cacheada, sin suscripciones, sin
disposer), `effect` **push** (se suscribe a las hojas, devuelve baja, recalcula dependencias en
cada vuelta) y `batch` (escribe ya, notifica al salir, una vez por efecto).

**Hito C — la superficie se recorta.** `subscribe` pasa a ser función suelta —el canal del emit,
fuera del IntelliSense de una vista—, `peek` desaparece, y el emit escribe `x()` y `$sub(x, …)`.
Es el único hito que mueve goldens, y por eso va entero en una sola fase: dejar el recorte y el
emit en commits distintos deja el repo en rojo por medio.

**Hito D — el compilador se entera de `computed`.** Un nombre declarado con `computed(...)` entra
en el mismo conjunto que uno declarado con `signal(...)`, porque si no, `.value="@total"` cruzaría
el objeto derivado. Y el stub inerte del servidor pasa a ser invocable, que es el fallo que `()`
como única forma de leer destapa.

**Fuera de esta tanda:** props como signals (§7, con su condición de reapertura), que el emit
envuelva `u` en `batch`, la planificación asíncrona de efectos, el completado del LSP y cualquier
diagnóstico por el `.peek()` retirado.

---

## Fase 1 — El rastreo (3)

- [x] **1. Versión por signal.**
      Modificar `packages/core/src/signal.ts`: un contador entero interno que sube en cada `set`
      que pase el `Object.is`. No sale en la interfaz pública `Signal<T>` —es maquinaria del
      rastreo—, pero sí en el tipo interno que `computed` consume. Cuesta un entero por signal, no
      un `Set` más, y es lo que hace posible que un derivado no se suscriba a nada.
- [x] **2. `$active` y la lectura rastreada.**
      Nuevo `packages/core/src/tracking.ts`: la variable de módulo, el tipo `Consumer` (lo que
      puede registrar fuentes) y las dos funciones que lo mueven. `sig()` consulta `$active` y se
      apunta; `sig.peek()` **no lo consulta nunca**. Es la única diferencia entre las dos, y hasta
      esta tarea eran la misma función.
- [x] **3. `untrack`.**
      Guarda `$active`, lo pone a `null`, ejecuta y lo restaura en `finally` —si `fn` lanza, el
      contexto no puede quedarse desarmado—. Cinco líneas, y es lo que permite leer dentro de un
      efecto sin depender. Con `peek()` en retirada (tarea 12), esta es **la** lectura suelta.

## Fase 2 — `computed` (3)

- [x] **4. Pull con caché por versión.**
      Nuevo `packages/core/src/computed.ts`: sin caché → ejecutar y guardar valor + pares
      (fuente, versión); con caché → recorrer las fuentes y comparar enteros, y ejecutar solo si
      alguna se movió. **Ninguna suscripción, ningún disposer**: es la asimetría con `effect` y la
      razón de que un derivado no pueda tener fuga.
- [x] **5. El derivado lleva su propia versión.**
      Sube cuando el recómputo produce un valor distinto por `Object.is`. Es lo único que la
      cascada necesita: un `computed` sobre otro compara versiones igual que sobre una signal, sin
      un caso especial escrito para el anidamiento (criterio §6.4).
- [x] **6. Tests de `computed`.**
      Criterios §6.1–§6.5: no recomputa sin movimiento; recomputa una vez por movimiento observado
      y no una por lectura; `untrack(() => c())` comparte caché y **no** registra dependencia; la
      cascada propaga y **corta** cuando el valor intermedio no cambia; y un derivado que nadie lee
      **no ejecuta su `fn` nunca**, que es la propiedad que define «pull». Nace al 100 %.

## Fase 3 — `effect` y `batch` (4)

- [ ] **7. `effect`: correr, rastrear, resuscribirse.**
      Nuevo `packages/core/src/effect.ts`: ejecuta una vez al crearse; las fuentes de esa
      ejecución son las signals **hoja** —un `computed` leído dentro recomputa en el contexto del
      efecto, así que lo que queda apuntado es el fondo—; se suscribe a ellas; y en cada
      reejecución **limpia y vuelve a rastrear**, porque un `if` dentro del cuerpo cambia de qué
      depende. Devuelve un disposer **idempotente**.
- [ ] **8. La guarda de realimentación.**
      Un contador de ejecuciones encadenadas; pasado el límite, **lanza un `Error`** cuyo mensaje
      nombra el problema. No es un `Diagnostic`: el runtime de fudic no diagnostica y el
      compilador no puede ver esto. El límite es una constante del módulo, documentada.
- [ ] **9. `batch`.**
      Dentro: `set` escribe valor y versión **inmediatamente** —una lectura dentro del batch ve lo
      nuevo— pero acumula los suscriptores afectados en vez de notificar. Al salir del batch **más
      externo**, cada uno corre una vez. Anidar no anida flushes. Devuelve lo que devuelva `fn`, y
      vacía también si `fn` lanza.
- [ ] **10. Tests de `effect` y `batch`.**
      Criterios §6.6–§6.13. Dos que no se pueden saltar: §6.7 (dependencias **dinámicas** — el
      efecto deja de reejecutarse por `x` cuando el `if` deja de leerlo) y §6.11, que se escribe
      **de las dos formas** —con `batch` y sin él— porque el contraste es lo que demuestra para
      qué sirve la primitiva. Y §6.10 tiene que terminar: una realimentación que colgara el runner
      no es un test. Los dos ficheros al 100 %.

## Fase 4 — El recorte de la API y el emit que lo sigue (3)

Las tres tareas van **en el mismo commit**: separar el recorte del emit deja el repo en rojo por
medio, porque los tests de hidratación del compilador ejecutan el código emitido contra el core de
verdad.

- [ ] **11. `subscribe` como función suelta.**
      Nuevo `packages/core/src/subscribe.ts`: `subscribe(source, fn)` devuelve la baja y **no**
      entrega nada al suscribirse. Dos caminos, y el segundo es lo que cierra §4.7: sobre una
      **signal** se engancha a la hoja directamente —mismo coste que el método de hoy—; sobre un
      **derivado** monta un `effect` que se salta su primera pasada y llama al callback dentro de
      `untrack`, para que lo que el callback lea no se convierta en dependencia suya. El emit no
      tiene que saber cuál de las dos le han dado. Criterios §6.18–§6.19, al 100 %.
- [ ] **12. `Signal<T>` se queda en `()` y `set()`.**
      Fuera `peek()` y fuera el método `subscribe`. `Computed<T>` es solo la llamada. `index.ts`
      exporta `computed`, `effect`, `batch`, `untrack`, `subscribe` y los tipos `Computed` y
      `Readable`. Reescribir `signal.test.ts` a la superficie nueva: lo que probaba `peek` pasa a
      probar la lectura fuera de todo consumidor, y lo que probaba `s.subscribe` vive ya en la
      tarea 11.
- [ ] **13. El emit escribe `x()` y `$sub(x, …)`.**
      Las tres líneas de §4.8: `attrs.ts` y el pase inicial de `markup-client.ts` sueltan el
      `.peek()`; la suscripción pasa a `$sub(source, ($v) => …)`; y el chunk de cliente emite
      `import { FudicElement, subscribe as $sub } from '@fudic/core';` **solo si hay al menos una
      suscripción** (criterio §6.20), con el alias `$` que la reserva de SDD-15 §4.7 protege.
      Actualizar los goldens, los tests del compilador que citan `peek()`/`subscribe(` y los
      `.fud` de `examples/basic`. **Criterio §6.14 es el que manda:** el diff de los goldens se lee
      a mano y solo puede contener las tres formas de §4.5; una cuarta es un fallo.

## Fase 5 — Que el compilador se entere de `computed` (3)


- [ ] **14. `computed` entra en el conjunto de nombres reactivos.**
      Modificar `extractCode` (`packages/compiler/src/emit/oxc-code.ts`) para reconocer también
      `const x = computed(...)`, y `ClientScope.signals` para incluirlos. Es una entrada más en
      una extracción que ya existe, no un análisis nuevo. **Sin esto el SDD no entrega nada
      usable:** `.value="@total"` cruzaría el objeto derivado —`[object Object]` en el HTML, el
      síntoma de BUG-16 (b)— y el padre no emitiría suscripción, así que el hijo quedaría
      congelado. Criterio §6.15.
- [ ] **15. El stub inerte del servidor pasa a ser invocable.**
      Modificar [`module.ts:172`](../../packages/compiler/src/emit/module.ts#L172): el
      `{ peek: () => (init) }` de hoy **no es una función**, y con `()` como única forma de leer un
      `@client` que lea `expanded()` revienta en el prerender. Pasa a ser `() => (init)`, más
      simple que lo que sustituye. Y las dos formas nuevas por la misma puerta: `computed` → stub
      inerte que **evalúa su `fn` al leerlo**; `effect` → **no se emite**; `batch(fn)` → `fn()`.
      Criterio §6.16.
- [ ] **16. `FUD0570` y el rango.**
      `effect(...)` fuera de `@code { @client }` → diagnóstico con su span, por el canal
      `diagnostics` de `EmitOutput` que BUG-13 dejó abierto. **El emit no lanza**: se omite el
      efecto y el resto del fichero se emite. El catálogo consolidado de SDD-12 gana el rango
      `FUD0570`–`FUD0589`. `computed` y `batch` **no** reciben diagnóstico: los dos tienen
      semántica de servidor bien definida. Criterio §6.17.

## Fase 6 — Cierre (1)

- [ ] **17. Verde, goldens revisados, cobertura e índice.**
      `pnpm typecheck`, `pnpm test` y `pnpm build` en la raíz —el build incluye `examples/basic`,
      así que es donde se ve si algún `.fud` se quedó con un `peek()`—. Releer el diff completo de
      `__golden__/` contra `main` y comprobar que solo contiene las tres formas de §4.5.
      `tracking.ts`, `computed.ts`, `effect.ts`, `batch.ts` y `subscribe.ts` al **100 %** en las
      cuatro métricas; `@fudic/core` estaba al 100 % y no baja. Nada de `/* v8 ignore */`. Anotar
      el avance en [INDEX.md](./INDEX.md) y pasar SDD-31 a `Hecho` si los 20 criterios de §6 están
      verdes.

---

## Lo que esta tanda deja listo para la siguiente

Dos cosas, y ninguna es esta spec.

**El código del usuario puede reaccionar.** Hasta ahora el único consumidor de una signal era
`$a()`, emitido. Con `effect` el `@client` del autor tiene un canal, y con baja, que es lo que
`subscribe` en crudo no le daba.

**La pregunta de las props reactivas pasa a ser medible.** Con `computed`/`effect` en core y
[BUG-18](./bugs/BUG-18-update-denso.md) cerrado, se puede comparar en el arnés de
`test/emit/hydrate/` con N instancias en vez de discutirla. Y la vía a evaluar primero está
anotada en [§7](./SDD-31-signals-derivadas.md#7-fuera-de-alcance): no el upgrade perezoso en
`requestIdleCallback` —dos caminos vivos en cada chunk y una ventana en la que el primer `u` llega
en modo denso— sino el **corte estático**, un solo modo por componente decidido en compilación.

## Enlaces

- Criterios de aceptación: los 20 de
  [SDD-31 §6](./SDD-31-signals-derivadas.md#6-criterios-de-aceptación).
- Cierra el pendiente que [BUG-12 §7](./bugs/BUG-12-sin-canal-de-update.md) y
  [SDD-15 §7](./SDD-15-emit.md#7-fuera-de-alcance) llaman *«las suscripciones finas de las signals
  propias del componente»* y que ningún SDD poseía.
- Hermano de [BUG-18](./bugs/BUG-18-update-denso.md): los dos salen de la misma sesión y no
  comparten un fichero — este vive en `@fudic/core`, aquél en el emit del factory.
