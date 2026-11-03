# SDD-76 — `effect` con dependencias explícitas, y un efecto que no deja nada atrás

> **Estado:** `Hecho` — [tareas](./SDD-76-Task.md).
> **Paquetes:** `@fudic/core` (y un test en `@fudic/compiler`)
> **Depende de:** 31 (`effect`, `computed`, `untrack`, el rastreo por hojas), 68 (el owner que da
> de baja lo que crea el `@code`) — las dos en `Hecho`.
> **Enmienda:** SDD-31 §3, la viñeta «`effect` devuelve la baja y no toma dependencias».
> **Rango de diagnósticos:** ninguno.
> **Decisiones de gramática:** ninguna (es API de runtime, no sintaxis).
> **Origen:** conversación con Pedro del 2026-11-03, a partir de una revisión de calidad de
> `packages/core/src/effect.ts`.
> **Rama sugerida:** `sdd-76-efectos-con-dependencias`, desde `main`.

---

## 1. Contexto y objetivo

### 1.1. Lo que se pide

Un `effect` se vuelve a ejecutar cuando cambia **cualquier** signal que leyó. Para que solo lo
dispare una parte de lo que lee, hoy hay que envolver el resto en `untrack`:

```ts
effect(() => {
  const id = userId();
  untrack(() => cargar(id, filtros()));
});
```

Funciona, pero la intención («solo `userId`») no se lee en la primera línea: hay que mirar qué
queda dentro y qué fuera del `untrack`. Pedro pide la forma de React, un segundo parámetro con
las dependencias:

```ts
effect(() => {
  cargar(userId(), filtros());
}, [userId]);
```

### 1.2. Por qué se reabre lo que SDD-31 descartó

SDD-31 §3 descartó el array de dependencias porque «es el modelo que el desarrollador olvida
actualizar». Sigue siendo verdad, y por eso esta spec **no lo hace obligatorio**: sin segundo
argumento, `effect` es exactamente el de hoy, con rastreo automático. El array es **opcional** y
sirve para lo que el rastreo automático no dice: *de todo lo que leo, solo esto me dispara*. Quien
lo escribe acepta mantener la lista; quien no, no paga nada.

### 1.3. Dos defectos de `effect.ts` que se cierran aquí

Salieron en la misma revisión, viven en la misma función que esta spec toca y los dos se
reproducen hoy en `main`. Se arreglan **antes** de añadir las dependencias, porque las
dependencias pasan por el mismo camino (`run`):

**Defecto A — un efecto dado de baja durante su propia vuelta se vuelve a suscribir.** Si se llama
a la baja mientras el cuerpo corre (el cuerpo escribe una signal y eso desmonta, en ese mismo
momento, el componente dueño, que llama a la baja), `dispose` vacía `sources` y ejecuta la
limpieza pendiente. Pero `run` sigue después del cuerpo sin mirar `disposed`:

- guarda en `cleanup` la limpieza que el cuerpo acaba de devolver, y nadie la ejecutará nunca
  ([`effect.ts:83`](../../packages/core/src/effect.ts#L83));
- como `sources` está vacío, el bucle de reconciliación vuelve a suscribir `run` a todas las hojas
  ([`effect.ts:93-97`](../../packages/core/src/effect.ts#L93-L97)).

`run` ya no hace nada (la guarda `disposed`), pero sigue en el `Set` de cada signal y retiene el
closure, el cuerpo y todo lo que captura. Reproducido: tras la baja queda **1** suscriptor y se
ejecuta **1** limpieza de **2**.

**Defecto B — una vuelta reentrante pierde limpiezas.** Un efecto que escribe una signal que lee
vuelve a entrar en `run` desde dentro de su propio cuerpo (es lo que permite la guarda de
`MAX_CHAINED_RUNS`). Si converge antes del límite, cada vuelta exterior, al terminar, **pisa** con
su limpieza la que dejó la vuelta interior:

```ts
const a = signal(10);
const stop = effect(() => {
  const v = a();
  if (v < 2) a.set(v + 1);
  return () => deshacer(v);
});
a.set(0);
stop();
// montado: 10, 2, 1, 0 — deshecho: 10, 0. Las limpiezas de 2 y de 1 no corren nunca.
```

Además, la vuelta exterior reconcilia las suscripciones con lo que leyó **ella**, que es más viejo
que lo que leyó la interior.

### 1.4. Objetivo

1. `effect(fn)` se comporta igual que hoy, sin los defectos A y B.
2. `effect(fn, deps)` solo se vuelve a ejecutar cuando cambia el **valor** de alguna dependencia.
3. Toda limpieza que el cuerpo devuelve se ejecuta exactamente una vez, y tras la baja no queda
   ninguna suscripción, en los dos modos.

---

## 2. Dependencias

- **SDD-31 (`Hecho`).** `packages/core/src/effect.ts`, `tracking.ts` (`runTracked`, `untrack`,
  `Consumer`, `LeafSource`, `collectLeaves`), `computed.ts` (`Readable<T> = () => T`),
  `signal.ts` (suscriptores en un `Set` vivo, filtro `Object.is` en `set`), `batch.ts` (`notify`
  agrupa por identidad del suscriptor). Un efecto se suscribe a las **hojas**: un `computed`
  leído dentro entrega las signals que tiene debajo (§4.3 de SDD-31). Sin corte por igualdad en
  la frontera del derivado.
- **SDD-68 (`Hecho`).** `owner.ts`: `own(dispose)` deja la baja en la lista del componente que se
  está creando; fuera de `owned` no hace nada.
- **El compilador** detecta un `effect(...)` en el `@code` por el **nombre del callee**
  (`compiler/src/emit/oxc-code.ts`, `effectCalls`) para meter al fichero en `fud-eager`. No mira
  los argumentos. El módulo de servidor no copia el cuerpo del `@code` (SDD-31 §4.6), así que un
  `effect` no llega al servidor con ningún número de argumentos.
- **El editor** tipa `effect` por el `.d.ts` publicado de `@fudic/core`: la proyección del `.fud`
  no declara nada propio de `effect`.

---

## 3. Interfaz pública

```ts
// packages/core/src/effect.ts
import type { Readable } from './computed.js';

/** Lo que un efecto puede devolver para deshacer lo que acaba de hacer. */
export type Cleanup = () => void;

/**
 * Ejecuta `fn` y lo vuelve a ejecutar cuando algo de lo que depende cambia.
 *
 * Sin `deps`, depende de todo lo que `fn` lee (rastreo automático, SDD-31 §4.3).
 * Con `deps`, depende SOLO de esas fuentes, y solo vuelve a ejecutarse si el valor de
 * alguna cambió (`Object.is`); `fn` corre sin rastrear. `[]`: una vez, y su limpieza al
 * dar de baja.
 *
 * Si `fn` devuelve una función, es su limpieza: corre antes de cada reejecución y al dar
 * de baja el efecto. Devuelve la baja.
 */
export function effect(fn: () => void | Cleanup, deps?: readonly Readable<unknown>[]): () => void;
```

`index.ts` no cambia: ya exporta `effect` y `Cleanup`.

Lo que la firma decide:

- **Un parámetro opcional, no una función nueva.** No hay `on(...)` ni sobrecarga: un solo
  nombre que el autocompletado ofrece, y quien viene de React lo reconoce.
- **`fn` no recibe los valores.** El cuerpo lee las fuentes como siempre (`userId()`). Así `fn`
  tiene un solo tipo en los dos modos, y pasar de uno a otro es añadir o quitar el array.
- **Cada dependencia es una función sin argumentos: `Readable<unknown>`.** Una `Signal`, un
  `Computed` o una flecha: `[() => user().id]` depende del `id`, no del objeto entero. Lo que se
  rastrea al evaluarla es lo que se suscribe; lo que devuelve es lo que se compara.
- **El error de la costumbre de React lo coge el tipo.** `[count()]` pasa un `number`, no una
  función, y no compila. No hace falta comprobación en runtime.

---

## 4. Comportamiento

### 4.1. Sin `deps`: el `effect` de hoy

Nada cambia salvo los defectos A y B (§4.4). Las dependencias se recalculan en cada vuelta, se
suscribe a las hojas, y no hay corte por igualdad en la frontera del derivado (SDD-31 §4.3).

### 4.2. Con `deps`: una vuelta en dos fases

Cada vuelta, **la de creación incluida**, hace esto:

1. **Fase de dependencias, rastreada.** Evalúa cada `deps[i]()` en orden, con el consumidor del
   efecto instalado. Las hojas que se leen ahí son **todas** las suscripciones del efecto.
   Guarda los valores.
2. **Corte.** Si no es la primera vuelta y cada valor es `Object.is`-igual al de la vuelta
   anterior, la vuelta **termina aquí**: no corre la limpieza, no corre `fn`. Las suscripciones
   sí se reconcilian (paso 3), porque una dependencia con un `if` dentro puede haber cambiado lo
   que lee sin cambiar lo que devuelve.
3. **Reconciliación.** Las suscripciones pasan a ser las hojas del paso 1, por diferencia (las
   que siguen no se tocan; ver el comentario de `effect.ts` sobre el `Set` vivo).
4. **Cuerpo, sin rastrear.** Corre la limpieza pendiente y después `fn` dentro de `untrack`. Nada
   de lo que `fn` lea se suscribe. Lo que devuelve es la nueva limpieza.

Consecuencias que se escriben para que nadie las descubra:

- **Se ejecuta al crearse**, como `useEffect`. No hay modo «solo en el cambio».
- **`[]`** — la fase 1 no lee nada: ninguna suscripción, el cuerpo corre una vez y su limpieza
  corre al dar de baja. Es el reloj de `app-clock.fud`.
- **El corte es lo que el array aporta además de la intención.** Una signal ya solo notifica
  cuando cambia; el corte se nota con un `computed` (`total` que vuelve al mismo valor no ejecuta
  el cuerpo, al contrario que en §4.1), con una flecha (`() => user().id` no dispara si cambia
  otro campo de `user`) y con un `batch` que mueve una signal y la devuelve a su valor.
- **El array se lee una vez, al crear el efecto, y se copia.** Mutarlo después no cambia nada.
- **Una dependencia repetida** cuenta una vez como suscripción (las hojas son un `Set`) y su
  valor se compara en cada posición. No es un error.
- **El cuerpo puede escribir una dependencia.** Es un bucle como en §4.1: la vuelta vuelve a
  entrar por la suscripción y la guarda de `MAX_CHAINED_RUNS` lo corta con el mismo `Error`. Si
  converge, §4.4 B se aplica igual. Como la vuelta de creación ya está suscrita cuando corre el
  cuerpo (paso 3 antes del 4), con `deps` el bucle se detecta **al crear** el efecto, no en la
  escritura siguiente: `effect` lanza y no deja ninguna suscripción (§4.3, primera fila).
- **Leer una dependencia dentro del cuerpo** da su valor actual y no suscribe nada (está dentro
  de `untrack`), así que no cambia nada que el autor la repita.

### 4.3. Errores

Ni `effect` ni `run` capturan nada: lo que lanza llega a quien escribió la signal, o a quien creó
el efecto en la primera vuelta, como hoy. Lo que queda en cada caso:

| Lanza | Limpieza pendiente | Suscripciones | Valores guardados (con `deps`) |
|---|---|---|---|
| La primera vuelta (`fn`, o una dependencia) | No hay ninguna | Ninguna | Ninguno |
| Una dependencia, en una vuelta posterior | Sin tocar | Las de la vuelta anterior | Los de la vuelta anterior |
| `fn`, en una vuelta posterior | Ya corrió; queda vacía | Sin `deps`: las de la vuelta anterior. Con `deps`: las de esta vuelta (ya reconciliadas) | Los de esta vuelta |

En la primera fila el efecto no llega a registrarse en el owner ni devuelve la baja, y no tiene
nada que dar de baja: no queda ninguna suscripción ni ninguna limpieza (ya es así hoy y se
fija con un test). En las demás la baja sigue funcionando y deja cero suscripciones.

### 4.4. Los dos defectos, corregidos

Las dos correcciones son la misma regla: **una vuelta que, al terminar su cuerpo, ya no es la
vigente, no publica nada.** Ejecuta en el acto (sin rastrear) la limpieza que acaba de devolver y
no toca ni `cleanup` ni las suscripciones. Deja de ser vigente cuando:

- **A.** el efecto se dio de baja mientras corría el cuerpo (`disposed`);
- **B.** otra vuelta del mismo efecto empezó mientras corría el cuerpo (reentrada). La vuelta
  interior, que terminó antes, ya dejó su limpieza y sus suscripciones, y son las más nuevas.

Con `deps`, B se comprueba también después de la fase 1, por si una dependencia escribe una
signal (es raro, pero es código del autor): una vuelta superada en la fase 1 no reconcilia ni
corre el cuerpo.

Para saber si otra vuelta empezó, basta un contador por efecto que cada vuelta incrementa al
entrar y compara al salir. No hace falta pila ni estructura nueva.

En el ejemplo de §1.3 B el resultado pasa a ser: montado 10, 2, 1, 0; deshecho 10, 1, 0 (las dos
vueltas superadas, en cuanto terminan) y 2 (la vigente, al dar de baja). Cada limpieza, una vez.

### 4.5. Lo que no cambia

- El owner (`own(dispose)`) y la baja idempotente.
- `subscribe`, `subscribeIf` y `task`, que usan `effect` sin `deps`: su comportamiento no cambia.
  `forms` tampoco.
- El compilador: `effect(fn, [a])` en el `@code` sigue metiendo al fichero en `fud-eager`, porque
  la detección mira el nombre. Se fija con un test, sin tocar código.
- El servidor: no copia el `@code`. Nada que hacer.
- El editor: tipa por el `.d.ts` de `@fudic/core`. Nada que hacer.

---

## 5. Invariantes

- **Ninguna suscripción sobrevive a la baja,** en ningún orden de baja (fuera de una vuelta,
  dentro de su propio cuerpo, en un flush de `batch`).
- **Cada limpieza que `fn` devuelve corre exactamente una vez,** incluidas las de vueltas
  superadas y la de una vuelta cuyo efecto se dio de baja mientras corría.
- **Las limpiezas corren sin rastrear,** en los dos modos.
- **Con `deps`, nada que `fn` lea es una dependencia.**
- **Sin `deps`, el comportamiento observable es el de SDD-31** salvo lo que §4.4 corrige: los
  tests de `effect.test.ts` que existen hoy pasan sin cambios.
- **Cobertura de `@fudic/core` al 100 %** en las cuatro métricas, como ya está.
- Los invariantes LSP (spans, no lanzar) no aplican: esto es runtime, y el runtime lanza ante un
  error de programación (SDD-31 §4.3, la guarda de reentrada).

---

## 6. Criterios de aceptación

Todos en `packages/core/test/effect.test.ts` salvo que se diga otra cosa. Un `LeafSource` de
prueba que cuenta sus suscriptores vale para comprobar «cero suscripciones» sin abrir `signal`.

**Defectos**

1. **Baja dentro de la propia vuelta, sin `deps`.** Un efecto cuyo cuerpo se da de baja a sí
   mismo en su segunda vuelta: tras ella, **0** suscriptores y las **2** limpiezas ejecutadas;
   una escritura posterior no ejecuta el cuerpo.
2. **Lo mismo con `deps`.**
3. **Baja provocada desde fuera durante el cuerpo.** El cuerpo escribe una signal a la que está
   suscrito otro efecto que da de baja al primero: mismo resultado que el 1.
4. **Reentrada que converge, sin `deps`.** El ejemplo de §1.3 B: montado `[10, 2, 1, 0]`,
   deshecho `[10, 1, 0]` antes de la baja y `[10, 1, 0, 2]` después; antes de la baja hay una
   sola suscripción, a `a`, y después ninguna.
5. **Reentrada que converge, con `deps` `[a]`.** Mismo resultado.
6. **Primera vuelta que lanza, en los dos modos.** El `Error` llega a quien llama a `effect`;
   **0** suscriptores; y dentro de `owned(() => { try { effect(…) } catch {} })` la lista de
   bajas sale vacía.

**Dependencias**

7. **Solo dispara lo listado.** `effect(fn, [a])` donde `fn` lee `a` y `b`: cambiar `b` no lo
   ejecuta; cambiar `a`, sí, y `fn` ve el valor actual de `b`.
8. **Corre al crearse.** Una ejecución síncrona dentro de la llamada a `effect`.
9. **`[]`.** Una ejecución, ninguna suscripción; la limpieza corre al dar de baja y solo entonces.
10. **Corte con un `computed`.** `total = computed(() => a() + b())`, `effect(fn, [total])`;
    `batch(() => { a.set(2); b.set(1); })` desde `1, 2`: el cuerpo **no** corre y la limpieza
    tampoco. Con el mismo montaje sin `deps`, sí corre (§4.1, se fija la diferencia).
11. **Corte con una flecha.** `effect(fn, [() => user().id])`: cambiar otro campo de `user` (objeto
    nuevo, mismo `id`) no ejecuta el cuerpo; cambiar el `id`, sí.
12. **Corte con un `batch` que devuelve una signal a su valor.** `batch(() => { a.set(2); a.set(1); })`
    desde `1`: el cuerpo no corre.
13. **Dependencia con rama.** `effect(fn, [() => (flag() ? x() : y())])`: tras cambiar `flag`, las
    suscripciones son `flag` y la hoja de la rama nueva, la otra ya no, **aunque el valor
    devuelto no cambie** (el cuerpo no corre, las suscripciones sí se reconcilian).
14. **El array se copia.** Hacer `push` al array tras crear el efecto no añade dependencias.
15. **Dependencia repetida.** `[a, a]`: una suscripción; cambiar `a` ejecuta el cuerpo una vez.
16. **Bucle.** Un cuerpo que escribe siempre un valor nuevo en su dependencia lanza el mismo
    `Error` de `MAX_CHAINED_RUNS` que sin `deps`, ya en la llamada a `effect`, y no deja ninguna
    suscripción.
17. **El cuerpo no rastrea, la limpieza tampoco.** Una signal leída solo en el cuerpo o solo en la
    limpieza no es suscripción.
18. **Errores (§4.3).** Una dependencia que lanza en una vuelta posterior deja limpieza,
    suscripciones y valores de la vuelta anterior; un `fn` que lanza deja la limpieza vacía y
    las suscripciones de esta vuelta. En los dos casos, la baja deja 0 suscriptores.
19. **Owner.** Creado dentro de `owned`, con `deps`: ejecutar la lista de bajas deja 0
    suscriptores y ejecuta la limpieza.
20. **Tipos.** En un test de `core`, con `// @ts-expect-error`: `effect(fn, [count()])` (un
    `number`) no compila; `effect(fn, [count, total, () => user().id])` sí. Lo comprueba
    `pnpm typecheck`, que incluye `test/`.

**Compilador**

21. En `packages/compiler/test/emit/route-blocks.test.ts`, junto a los dos casos de `fud-eager`:
    una ruta cuyo `@code` llama a `effect(() => { … }, [ahora])` se nombra en `fud-eager`.

**Cierre**

22. Los tests de `effect.test.ts`, `subscribe.test.ts`, `task.test.ts` y `owner.test.ts` que
    existen hoy pasan **sin modificar**.
23. `pnpm typecheck`, `pnpm test` y `pnpm build` en verde; `@fudic/core` al 100 % en las cuatro
    métricas.

---

## 7. Fuera de alcance

- **Un aviso de dependencias que faltan** (el `exhaustive-deps` de React): leer en el cuerpo una
  signal que no está en `deps`. Sería un diagnóstico del compilador o del editor, con su rango
  `FUD`; si hace falta, otra spec.
- **Pasar los valores a `fn`** (`(id) => …`). Se descartó en §3.
- **Un modo que no se ejecute al crearse.** Se descartó en §4.2.
- **Cambiar el corte del modo automático** (§4.1): la renuncia de SDD-31 §4.3 sigue en pie.
- **Migrar los ejemplos** (`app-clock.fud`, `ruta-reloj.fud`) a `[]`. Funcionan igual; cambiarlos
  es una decisión de la documentación, no de esta spec.
- **`computed` con dependencias explícitas.** No se pide y un derivado ya es pull.
