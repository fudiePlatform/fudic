# SDD-31 — Tareas · `computed`, `effect`, `batch`

> **SDD:** [SDD-31 — Signals derivadas](./SDD-31-signals-derivadas.md)
> **Paquetes:** `@fudic/core` (las tres primitivas) · `@fudic/compiler` (el enganche de §4.7 y
> el stub inerte de §4.6)
> **Rama:** `sdd-31-computed-effect`
> **Progreso:** 0 / 14
> **No depende de:** SDD-30 ni de la tanda de eventos. Puede ir en paralelo, en su propio
> worktree: no comparte un fichero con ninguna de las dos.

Da a `@fudic/core` las tres primitivas que le faltan y a `sig()` el significado que su propio tipo
anunciaba. Es **ampliación, no rediseño**: la tarea 12 lo verifica exigiendo que ningún golden se
mueva.

Cada tarea es un paso cerrado: se implementa, se verifica y se marca. Ninguna depende de tareas
posteriores.

---

## Los tres hitos

**Hito A — el rastreo existe.** Una variable de módulo (`$active`) y un contador de versión por
signal. Con eso `sig()` deja de ser un alias de `peek()` y pasa a registrar dependencias. Nada del
código emitido lo nota, porque el emit escribe `peek()` y `subscribe()`.

**Hito B — las tres primitivas.** `computed` **pull** (versión cacheada, sin suscripciones, sin
disposer), `effect` **push** (se suscribe a las hojas, devuelve baja, recalcula dependencias en
cada vuelta) y `batch` (escribe ya, notifica al salir, una vez por efecto).

**Hito C — el compilador se entera.** Un nombre declarado con `computed(...)` entra en el mismo
conjunto que uno declarado con `signal(...)`, porque si no, `.value="@total"` cruzaría el objeto
derivado. Y el stub inerte del servidor pasa a ser invocable, que es el fallo que `()` con
significado destapa.

**Fuera de esta tanda:** props como signals (§7, con su condición de reapertura), que el emit
envuelva `u` en `batch`, la planificación asíncrona de efectos y el completado del LSP.

---

## Fase 1 — El rastreo (3)

- [ ] **1. Versión por signal.**
      Modificar `packages/core/src/signal.ts`: un contador entero interno que sube en cada `set`
      que pase el `Object.is`. No sale en la interfaz pública `Signal<T>` —es maquinaria del
      rastreo—, pero sí en el tipo interno que `computed` consume. Cuesta un entero por signal, no
      un `Set` más, y es lo que hace posible que un derivado no se suscriba a nada.
- [ ] **2. `$active` y la lectura rastreada.**
      Nuevo `packages/core/src/tracking.ts`: la variable de módulo, el tipo `Consumer` (lo que
      puede registrar fuentes) y las dos funciones que lo mueven. `sig()` consulta `$active` y se
      apunta; `sig.peek()` **no lo consulta nunca**. Es la única diferencia entre las dos, y hasta
      esta tarea eran la misma función.
- [ ] **3. `untrack`.**
      Guarda `$active`, lo pone a `null`, ejecuta y lo restaura en `finally` —si `fn` lanza, el
      contexto no puede quedarse desarmado—. Cinco líneas, y es lo que permite leer dentro de un
      efecto sin depender.

## Fase 2 — `computed` (3)

- [ ] **4. Pull con caché por versión.**
      Nuevo `packages/core/src/computed.ts`: sin caché → ejecutar y guardar valor + pares
      (fuente, versión); con caché → recorrer las fuentes y comparar enteros, y ejecutar solo si
      alguna se movió. **Ninguna suscripción, ningún disposer**: es la asimetría con `effect` y la
      razón de que un derivado no pueda tener fuga.
- [ ] **5. El derivado lleva su propia versión.**
      Sube cuando el recómputo produce un valor distinto por `Object.is`. Es lo único que la
      cascada necesita: un `computed` sobre otro compara versiones igual que sobre una signal, sin
      un caso especial escrito para el anidamiento (criterio §6.4).
- [ ] **6. Tests de `computed`.**
      Criterios §6.1–§6.5: no recomputa sin movimiento; recomputa una vez por movimiento observado
      y no una por lectura; `peek()` comparte caché y **no** registra dependencia; la cascada
      propaga y **corta** cuando el valor intermedio no cambia; y un derivado que nadie lee **no
      ejecuta su `fn` nunca**, que es la propiedad que define «pull». Nace al 100 %.

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

## Fase 4 — Que el compilador se entere (3)

- [ ] **11. `computed` entra en el conjunto de nombres reactivos.**
      Modificar `extractCode` (`packages/compiler/src/emit/oxc-code.ts`) para reconocer también
      `const x = computed(...)`, y `ClientScope.signals` para incluirlos. Es una entrada más en
      una extracción que ya existe, no un análisis nuevo. **Sin esto el SDD no entrega nada
      usable:** `.value="@total"` cruzaría el objeto derivado —`[object Object]` en el HTML, el
      síntoma de BUG-16 (b)— y el padre no emitiría suscripción, así que el hijo quedaría
      congelado. Criterio §6.15.
- [ ] **12. El stub inerte del servidor pasa a ser invocable.**
      Modificar [`module.ts:172`](../../packages/compiler/src/emit/module.ts#L172): el
      `{ peek: () => (init) }` de hoy **no es una función**, y mientras `sig()` fuera un alias de
      `peek()` daba igual porque nadie escribía la forma de llamada. Con la tarea 2 hecha, un
      `@client` que lea `expanded()` compila en cliente y revienta en el prerender. Emitir
      `Object.assign(() => (init), { peek: () => (init) })`, y las dos formas nuevas por la misma
      puerta: `computed` → stub inerte que evalúa su `fn`; `effect` → **no se emite**; `batch(fn)`
      → `fn()`. Criterio §6.16.
- [ ] **13. `FUD0570` y el rango.**
      `effect(...)` fuera de `@code { @client }` → diagnóstico con su span, por el canal
      `diagnostics` de `EmitOutput` que BUG-13 dejó abierto. **El emit no lanza**: se omite el
      efecto y el resto del fichero se emite. El catálogo consolidado de SDD-12 gana el rango
      `FUD0570`–`FUD0589`. `computed` y `batch` **no** reciben diagnóstico: los dos tienen
      semántica de servidor bien definida. Criterio §6.17.

## Fase 5 — Cierre (1)

- [ ] **14. Verde, goldens intactos, cobertura e índice.**
      `pnpm typecheck`, `pnpm test` y `pnpm build` en la raíz. **Criterio §6.14 es el que manda
      aquí:** los tres `__golden__/*.client.mjs` y los `*.mjs` de servidor salen **byte a byte
      idénticos** a los de `main` — excepto el stub inerte de la tarea 12, que sí mueve una línea
      por signal declarada en los goldens de servidor, y hay que leerla a mano. Un golden de
      **cliente** que se mueva es la señal de que algo se ha colado en el emit que no debía.
      `tracking.ts`, `computed.ts` y `effect.ts` al **100 %** en las cuatro métricas; `@fudic/core`
      estaba al 100 % y no baja. Nada de `/* v8 ignore */`. Anotar el avance en
      [INDEX.md](./INDEX.md) y pasar SDD-31 a `Hecho` si los 17 criterios de §6 están verdes.

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

- Criterios de aceptación: los 17 de
  [SDD-31 §6](./SDD-31-signals-derivadas.md#6-criterios-de-aceptación).
- Cierra el pendiente que [BUG-12 §7](./bugs/BUG-12-sin-canal-de-update.md) y
  [SDD-15 §7](./SDD-15-emit.md#7-fuera-de-alcance) llaman *«las suscripciones finas de las signals
  propias del componente»* y que ningún SDD poseía.
- Hermano de [BUG-18](./bugs/BUG-18-update-denso.md): los dos salen de la misma sesión y no
  comparten un fichero — este vive en `@fudic/core`, aquél en el emit del factory.
