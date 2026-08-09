# BUG-18 — Tareas · El update disperso

> **BUG:** [BUG-18 — El padre recompone la tupla entera del hijo](./BUG-18-update-denso.md)
> **Paquetes:** `@fudic/compiler` (`client.ts`, `markup-client.ts`) · `@fudic/core` (solo el
> comentario del contrato)
> **Rama:** `fix/bug-18-update-disperso`
> **Progreso:** 10 / 10 — cerrado
> **Va DESPUÉS de:** [SDD-30 — Renders de bloque](../SDD-30-renders-de-bloque.md)
> ([tareas](../SDD-30-Task.md)). No es preferencia de orden: ver
> [§2.5](./BUG-18-update-denso.md) — su tarea 17 emite **esta misma forma** dentro de un bloque, y
> las dos tandas regeneran los mismos goldens de cliente.
> **Sí va en paralelo a:** [SDD-31](../SDD-31-signals-derivadas.md), que no comparte un fichero
> con esta.

Separa dos operaciones que compartían forma por comodidad: **dar de alta es entregar el estado
entero; actualizar es decir qué se movió.** El alta no se toca en ninguna tarea.

Cada tarea es un paso cerrado: se implementa, se verifica y se marca. Ninguna depende de tareas
posteriores.

---

## Los dos hitos

**Hito A — el hijo pregunta por presencia.** El patrón de asignación de `u` se sustituye por una
guarda `in` por prop. Es lo que distingue «no me mandan este hueco» de «me mandan `undefined`», que
un patrón de destructuring no puede: `[, , a] = [1,2]` y `[, , a] = [1,2,undefined]` dejan `a` en
`undefined` las dos veces. Ese es el motivo entero de que BUG-12 §3.4 mandara la tupla completa, y
su razonamiento era correcto **para esa forma de canal**.

**Hito B — el padre manda un hueco.** Cada suscripción escribe **su** índice y nada más. Con eso
desaparecen los `peek()` de las demás signals y el crecimiento S × P del texto emitido.

**Fuera de esta tanda:** particionar `$a()` por prop (necesita `scope.ts` de SDD-30, §7), envolver
`u` en `batch` (necesita SDD-31), y el alta, que sigue siendo densa por necesidad.

**Un aviso para cuando esto arranque:** con SDD-30 hecho, el pase inicial y la suscripción existen
en **dos** sitios —el `$s()` del componente y el `s()` de cada bloque (SDD-30 §4.6)—. Las tareas 4
y 9 valen para los dos; si el segundo se queda con la forma densa, el defecto sigue vivo dentro de
todo `@if` y todo `@foreach`, que es donde más instancias hay.

---

## Fase 1 — El hijo (3)

- [x] **1. `destructuring()` gana una tercera forma.**
      *(implementado como **dos funciones**, `declaration()` y `updateGuards()`, y no como una
      tercera rama de un `form`: la vieja `'assign'` desaparece con el patrón, así que una
      tercera forma sería una rama que ningún emit puede provocar — y eso es cobertura
      inalcanzable, no diseño. Las dos operaciones dejan de compartir función, que es
      exactamente lo que dice §4.1.)*
      Modificar `packages/compiler/src/emit/client.ts`: la función que hoy produce dos formas sobre
      la misma lista de props —declaración (alta) y asignación (`u`), BUG-12 §3.3— pasa a producir
      tres. La de `u` deja de ser un patrón y pasa a ser una guarda por prop:
      `if (2 in $p) label = $p[2];`. **La declaración de alta no se toca**: sigue siendo el
      simétrico exacto de `Object.values` (SDD-15 §4.2), que es lo que la justifica.
- [x] **2. El default, en la rama presente.**
      `if (3 in $p) variant = $p[3] === undefined ? 'default' : $p[3];`. Es la regla de BUG-12
      §3.3 —*«los defaults se repiten, porque una actualización puede volver a traer
      `undefined`»*— trasladada a la forma nueva. Lo que deja de ocurrir es que una prop que el
      padre **no menciona** vuelva a su default; una prop sin default emite la guarda a secas.
      Criterios §6.1, §6.2.
- [x] **3. `$a()` sigue llamándose una vez, al final.**
      Después de todas las guardas, no una por prop. Es lo que mantiene la pasada consistente
      cuando se mueven dos props en la misma llamada: sin estado intermedio observable. Criterio
      §6.10.

## Fase 2 — El padre (3)

- [x] **4. La suscripción escribe un hueco.**
      Modificar `packages/compiler/src/emit/markup-client.ts`: por cada `Slot` con `signal`,
      emitir `const $p = []; $p[<i>] = $v; $nN.u($p);` en vez del array literal completo. **Dos
      sentencias y no una expresión**, y es obligatorio: no existe literal disperso —`[, , , $v]`
      es denso en los tres primeros huecos, valiendo `undefined`—. El dato ya está calculado:
      `Slot.signal` dice qué hueco lleva qué signal
      ([`markup-client.ts:134-139`](../../../packages/compiler/src/emit/markup-client.ts#L134-L139)).
      `$p` entra en la reserva del prefijo `$` (SDD-15 §4.7). Criterio §6.3.
- [x] **5. El alta no se toca, y hay que comprobarlo.**
      El pase inicial sigue siendo el array **denso** con `peek()`, con las props constantes
      dentro. Es la mitad del BUG que consiste en **no** cambiar algo, y por eso lleva criterio
      propio: §6.4 y §6.5 —una prop constante está en el alta y en ninguna suscripción—.
- [x] **6. El contrato, escrito donde se lee.**
      *(y en `FudicElement.u` se escribe además lo que NO se puede hacer: reenviar el array
      verbatim es hoy correcto por accidente y mañana obligatorio — copiarlo convertiría cada
      hueco en un `undefined` presente, que es justo la orden de «aplica el default».)*
      Modificar el comentario de `Controller.u` en `packages/core/src/controller.ts` y el de
      `FudicElement.u` en `element.ts`: *el array puede ser disperso; un hueco significa «sin
      cambio», un `undefined` presente significa «aplica el default»; el alta es siempre densa*.
      El tipo (`readonly unknown[]`) no cambia — un array disperso ya lo satisface. Lo que faltaba
      era la regla, que no estaba escrita en ningún sitio. Criterio §3.3.

## Fase 3 — Verificación (3)

- [x] **7. Los criterios de forma, sobre el texto emitido (§6.1–§6.6).**
      Guardas `in` en vez de patrón; el default en la rama presente; la suscripción con dos
      sentencias y un solo índice; el alta densa e intacta; una prop constante ausente de toda
      suscripción; y `$p` dentro de la reserva. Con **dos signals sobre cuatro props**, para que
      el caso que crece se vea: dos suscripciones, un hueco cada una.
- [x] **8. Los criterios de comportamiento, sobre DOM real (§6.7–§6.12).**
      *(§6.11 y §6.12 ya estaban verdes y siguen sin tocarse: `hydrate/update.test.ts` y el
      arnés de equivalencia. Y una acotación sobre **qué puede medir** §6.7: con `$w` en medio,
      el canal denso de hoy tampoco reescribe el nodo de la constante, así que el observador no
      distingue el antes del después — lo que sí distingue es §6.8, y ese es el test que el
      canal denso convertido a parcial suspende.)*
      En el arnés de `test/emit/hydrate/`. Tres que no se pueden saltar:
      **§6.7** —mover una signal no toca el nodo de la otra prop— comprobado con un
      `MutationObserver` o marcando el nodo antes de disparar, **no** con `$w` como oráculo: `$w`
      es precisamente quien hoy tapa el síntoma, así que usarlo como testigo probaría lo
      contrario de lo que dice el criterio.
      **§6.8** —un hueco ausente deja la prop como estaba, no la devuelve a su default—: es el
      fallo exacto que BUG-12 §3.4 razonó para no hacer el canal parcial, y el test que lo
      demuestra imposible ahora.
      **§6.11** —el criterio §6.7 de BUG-12 sigue verde de punta a punta—.
- [x] **9. Goldens (§6.13).**
      *(son **cinco** y no tres: SDD-30 añadió `app-list` y la tanda de eventos `app-actions`
      —esta última al test pero no a `scripts/goldens.ts`, que se corrige aquí—. Cada uno se
      mueve en **una** línea, el cuerpo de `u`, y ningún `.mjs` de servidor cambia un byte.
      **Las suscripciones del padre no aparecen en ningún golden**: ninguna fixture entrega una
      prop reactiva a un hijo, así que esa mitad de §6.13 no tiene dónde verse y queda anclada,
      línea a línea y con `toBe`, en `client.test.ts`.)*
      Regenerar los tres `.client.mjs` y **leerlos a mano**: las únicas diferencias esperadas son
      el cuerpo de `u` y las suscripciones del padre. Los `.mjs` de **servidor** no cambian ni un
      byte, y si cambian es que algo se emitió en la rama equivocada — el SSR no tiene canal de
      update.

## Fase 4 — Cierre (1)

- [x] **10. Verde, cobertura e índice.**
      `pnpm typecheck`, `pnpm test` y `pnpm build` en la raíz —los ejemplos se construyen después
      de los paquetes: si `examples/basic` se rompe, el build falla—. `client.ts` y
      `markup-client.ts` nacieron al **100 %** en las cuatro métricas y no bajan; `@fudic/core`
      sigue al 100 %. Nada de `/* v8 ignore */`. Anotar el avance en
      [bugs/INDEX.md](./INDEX.md) y en [../INDEX.md](../INDEX.md), y pasar BUG-18 a `Hecho` si los
      13 criterios de §6 están verdes.

---

## Lo que esta tanda deja listo para la siguiente

**El hijo sabe por primera vez qué se ha movido.** Hoy `$a()` recalcula todas las escrituras
porque el array no se lo dice; con el canal disperso la información está ahí y solo falta saber
**qué escritura depende de qué binding** para partir `$a` por prop. Ese análisis es el de
referencias libres que [SDD-30](../SDD-30-renders-de-bloque.md) construye en `emit/scope.ts`, y por
eso el arreglo queda fuera de este BUG con su condición escrita (§7) en vez de arrastrarlo detrás
de aquella spec.

## Enlaces

- Criterios de aceptación: los 13 de
  [BUG-18 §6](./BUG-18-update-denso.md#6-criterios-de-aceptación).
- Corrige el lado del padre de [BUG-12 §3.4](./BUG-12-sin-canal-de-update.md) y de
  [SDD-15 §4.6](../SDD-15-emit.md); cumple por fin la decisión 75 de
  [props-spec](../props-spec.md) en el canal de update.
- Hermano de [SDD-31](../SDD-31-signals-derivadas.md): los dos salen de la misma sesión y no
  comparten un fichero.
