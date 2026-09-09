# BUG-27 — Una signal que vive en un módulo se lee bien y no avisa nunca

**Estado:** `Hecho` · **Depende de** [SDD-31](../SDD-31-signals-derivadas.md) y
[SDD-15](../SDD-15-emit.md) en `Hecho` ·
**Rama:** `worktree-reactividad-evidencias` · **Tareas:**
[BUG-27-Task.md](./BUG-27-Task.md)

> **Paquetes:** `core` · `compiler`
> **Corrige:** SDD-31 §3.1, §4.7, §4.8, §6.20 · SDD-15 §4.3 · SDD-11 (`@code` → Oxc)
> **Rango de diagnósticos:** ninguno. No hay nada que prohibir: el patrón era legal, y lo
> que faltaba era el canal.

---

## 1. Contexto y síntoma

El **store** —una signal declarada en un módulo y no dentro de un componente— es el patrón
que tiene cualquier framework de señales, y es la única arista que ni un bus dirige ni una
prop alcanza: dos componentes hermanos que comparten un valor.

```ts
// src/store/contador.ts
export const count = signal(0);
export function inc(): void { count.set(count() + 1); }
```

```razor
@code {
  import { count, inc } from "../store/contador.js";
}
…
<button @click=@inc>+1 al store</button>
<output>@count()</output>
```

Pulsa el botón: **el número no se mueve**. Pulsa cualquier otra cosa que repinte el
componente y el número salta directamente al valor correcto, con todos los incrementos que
te habías comido. El valor era correcto todo el rato; lo que no había era nadie escuchando.

Ese es el síntoma que lo hacía caro: **no falla, se retrasa**, y el retraso depende de lo que
pase a repintarse al lado. En un componente con una signal local propia parece funcionar; en
uno sin ella, no funciona nunca. Dos componentes iguales, comportamientos distintos, y la
diferencia en un fichero que no estás mirando.

---

## 2. Causa raíz

### 2.1 · La lista de reactivos se construye con lo que el fichero puede LEER

[`emit/client.ts`](../../../packages/compiler/src/emit/client.ts): `reactive` sale de dos
sitios, y los dos son declaraciones de **este** fichero — un `const x = signal(…)` de
`@code`, y una prop cuyo canal es `signal` ([SDD-31 §4.7](../SDD-31-signals-derivadas.md)).

Un `import` no declara ninguna de las dos cosas. Declara **un nombre**. El módulo está en
otro fichero, el emit es por fichero, y `const count = signal(0)` en `store.ts` es una
declaración que este componente no ve jamás. Así que el nombre cruzaba por referencia, se
leía perfectamente —la lectura no necesita saber nada— y no entraba en ninguna línea `$sub`.

### 2.2 · Probarlo aquí no se puede, y la alternativa era llamar a un ayudante

La reacción natural es hacer que el emit lo averigüe. No puede: `count` puede ser una signal,
un derivado o un ayudante corriente, y averiguarlo exige seguir el import, abrir el otro
fichero y tener un checker — que es exactamente lo que un emit por fichero no tiene.

Y equivocarse tiene un precio asimétrico. `subscribe` sobre algo que no es una fuente cae en
su rama de efecto y **LLAMA** a lo que le den
([SDD-31 §4.8](../SDD-31-signals-derivadas.md)). Un store exporta sus escritores al lado de
su estado —`export function inc()`—, y el emit no distingue uno de otro, así que entrega los
dos: suscribir a ciegas **ejecutaría `inc` cada vez que un componente despierta**.

### 2.3 · Un derivado era indistinguible de una función normal

[`core/src/computed.ts`](../../../packages/core/src/computed.ts) devolvía una flecha desnuda.
`leafOf` contesta «qué hoja hay detrás de esto», que solo tiene una signal; para un derivado
devuelve `null`, y con razón. La pregunta que un nombre importado plantea es más débil —«¿se
puede suscribir esto **en absoluto**?»— y no la contestaba nadie. `typeof x === 'function'`
es cierto de todos los ayudantes del fichero.

### 2.4 · Y el sitio donde el import tiene que vivir es el que no se miraba

Un store que el **template** lee no puede importarse dentro de `@client`: el template se
pinta en los dos lados, así que el servidor se queda sin ese nombre y la ruta no
prerenderiza. Su sitio es la **zona neutra**. Y la zona neutra era precisamente donde
[`emit/oxc-code.ts`](../../../packages/compiler/src/emit/oxc-code.ts) no acumulaba
sentencias para esto: `clientStatements` solo recogía las de la región de cliente.

---

## 3. Interfaz pública

**`@fudic/core`**

```ts
// packages/core/src/subscribe.ts
/** `subscribe`, para un nombre que el compilador no pudo probar reactivo — un IMPORT. */
export function subscribeIf(source: unknown, fn: (v: unknown) => void): () => void;
```

`index.ts` lo exporta junto a `subscribe`. Devuelve **siempre** una baja: para un nombre que
no era reactivo, una función inerte, porque el chunk emitido mete todas las bajas en `$d` y
las llama en `r()` — una que devolviera `undefined` sería un `TypeError` al desconectar.

`tracking.ts` estrena la marca `SOURCE`, con `tagSource(value)` e `isSource(value)`.
`tagLeaf` marca las dos cosas: una signal es una fuente, y un derivado también lo es ahora,
aunque no tenga hoja propia.

**`@fudic/compiler`**

- `ExtractedCode` gana `clientImports: readonly string[]` — los nombres que `@code` importa
  de un módulo que no es del framework, de **cualquier** región.
- `CoreUsage` gana `guarded: boolean`, canal propio y no una bandera de `subscribes`, porque
  los dos importan nombres distintos.

---

## 4. Comportamiento corregido

**4.1 · La decisión se traslada a runtime, que es donde está el valor.** El emit escribe
`$d.push($subIf(count, $u));`, y `subscribeIf` pregunta **al valor**: si es una fuente, se
suscribe; si no, no hace nada y devuelve una baja inerte. No es «`subscribe` con una guarda
en el sitio de la llamada»: la prueba tiene que ir **antes**, porque `subscribe` sobre una no
fuente llama a lo que le den.

**4.2 · La prueba es una MARCA, no una forma.** `isSource` mira el símbolo que `tagSource`
puso. Una comprobación por forma no sirve: un derivado y un ayudante son los dos una función
de cero argumentos.

**4.3 · Se leen los imports de la zona neutra además de los de `@client`.** Los de la
neutra porque es donde un store tiene que estar; los de `@client` porque un store que solo
lee el navegador puede vivir ahí.

**4.4 · Lo que NO entra.** Los `type` —`import type { … }` y el `{ type X }` por
especificador—, porque se borran antes de que el chunk corra y suscribir un binding borrado
es un `ReferenceError` en el primer enganche. Y todo `@fudic/*`: `signal`, `computed` y
`emit` no son estado de un componente, y una línea por import es una línea que descarga cada
instancia del tag.

**4.5 · Un default y un namespace cuentan.** `import store from './s.js'` e
`import * as store from './s.js'` enlazan un nombre que el template puede leer, y de ninguno
de los dos se puede probar aquí que no sea reactivo.

**4.6 · Cada canal trae solo su nombre.** Un componente con signal propia trae `subscribe`;
uno que solo lee un store trae `subscribeIf`; uno que hace las dos cosas trae las dos. Es
[SDD-31 §6.20](../SDD-31-signals-derivadas.md) extendido al canal nuevo — nada paga por el
canal que no usa.

**4.7 · La misma condición de renovación.** Un import solo abre canal si la vista tiene algo
que un `set` pueda mover: escritura de valor o constructo. Sin eso, un componente con un
store importado emite exactamente lo que emitía.

**4.8 · Y el pase que renueva es el mismo.** Un valor que se mueve por store y uno que se
mueve por declaración entran por el mismo `$u`: no puede haber dos formas de aplicar lo
mismo.

---

## 5. Invariantes

- **Lo que no se puede probar en compilación se pregunta en ejecución, y se pregunta ANTES de
  actuar.** No después, y no con una guarda que ya haya ejecutado el efecto secundario que se
  quería evitar.
- **Una marca, no una forma.** Lo que distingue una fuente reactiva de una función es un
  símbolo que el runtime pone, no una firma que se parezca.
- **Una baja siempre.** Todo canal del emit devuelve algo llamable, incluida la rama que no
  hizo nada.
- **Un componente descarga lo que usa.** Un canal nuevo no puede llegar al bundle de quien no
  lo escribe (regla del runtime podable por ruta).
- **El emit es por fichero, y eso es una limitación que se declara, no que se disimule.** La
  respuesta correcta a «no lo puedo saber aquí» es mover la pregunta, no adivinarla.

---

## 6. Criterios de aceptación

`packages/core/test/subscribe.test.ts` (1–5) y
`packages/compiler/test/emit/module-signals.test.ts` (6–13).

**El canal**

1. **(rojo primero)** `subscribeIf(sig, fn)` observa una signal exactamente como `subscribe`:
   entrega en el movimiento y no al suscribirse.
2. Sobre un derivado, entrega a través de la hoja de debajo.
3. **NUNCA llama a una función corriente**, que es la razón entera de que exista: el ayudante
   no se ejecuta y `fn` tampoco.
4. Es inerte para lo que ni siquiera es función —`undefined`, `null`, `0`, un string, un
   objeto, un array— y devuelve una baja llamable dos veces sin lanzar.
5. La baja de una fuente real corta la entrega.

**El emit**

6. **(rojo primero)** Un import se suscribe por el canal guardado: el chunk trae
   `subscribeIf as $subIf` y la línea `$d.push($subIf(count, $u));`, y renueva el **mismo**
   `$u` que renueva una signal declarada.
7. **(rojo primero)** Se lee de la **zona neutra**, que es donde un store tiene que vivir para
   que la ruta prerenderice.
8. Y de `@client` también.
9. Un `import type` no se suscribe nunca.
10. Un import mixto se recorta a sus especificadores de valor.
11. `@fudic/*` queda fuera: un componente que importa `signal` y `emit` no menciona `$subIf`.
12. Un default y un namespace sí entran.
13. Los dos canales conviven cuando el componente tiene signal propia **y** lee un store; y un
    componente cuya vista no tiene nada que mover no emite ninguno de los dos.

**Cobertura y navegador**

14. `@fudic/core` al **100 %** en las cuatro métricas, sin un solo `/* v8 ignore */`.
15. **En Chrome de verdad** (`examples/basic/tests/reactividad.spec.ts`): en `/reactividad`,
    `+1 al store` sube el número en **las dos** instancias de `<signal-store>` a la vez, y el
    botón de repintado forzado —que antes era la única forma de ver el valor— da lo mismo que
    el store.

---

## 7. Fuera de alcance

- **Que el editor sepa que un import es una signal.** Es una pregunta al checker, no al emit,
  y no la abre esta tanda.
- **Un diagnóstico para un store leído desde `@server`.** Un módulo se carga una vez por
  proceso de Node, así que un store leído en el servidor arrastraría estado de una petición a
  la siguiente. Está escrito en el comentario del ejemplo y **no** hay regla que lo compruebe;
  merece la suya.
- **La deuda de cobertura de `@fudic/compiler`.** Su propia tanda.
