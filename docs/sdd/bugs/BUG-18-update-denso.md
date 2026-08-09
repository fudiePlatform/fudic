# BUG-18 — El padre recompone la tupla entera del hijo en cada notificación

> **Estado:** `Hecho` — los 13 criterios de §6 en verde. Se desbloqueó cuando
> [SDD-30](../SDD-30-renders-de-bloque.md) pasó a `Hecho`, que era la condición escrita aquí
> **Corrige:** [BUG-12 §3.4](./BUG-12-sin-canal-de-update.md) · [SDD-15 §4.6](../SDD-15-emit.md)
> (el lado del padre) · [props-spec §3](../props-spec.md) (el ejemplo del canal)
> **Paquetes:** `@fudic/compiler` (`markup-client.ts`, `client.ts`) · `@fudic/core`
> (la firma de `u`, solo el tipo)
> **Rama sugerida:** `fix/bug-18-update-disperso`
> **Depende de:** [SDD-30](../SDD-30-renders-de-bloque.md), y **no por el mecanismo sino por las
> líneas** (§2.5). Va en paralelo a [SDD-31](../SDD-31-signals-derivadas.md) sin problema: no
> comparten un fichero
> **Reserva:** ningún código `FUD` nuevo (§3.4)

---

## 1. Contexto y síntoma

Un hijo de dos props, una constante y una reactiva —el ejemplo canónico de
[props-spec §4.2](../props-spec.md)—:

```fud
<app-display label="Total" .value="@count"></app-display>
```

Lo que el padre emite hoy, en su `$s()`:

```js
$n1.u([, , "Total", count.peek()]);                                 // alta
$d.push(count.subscribe(($v) => { $n1.u([, , "Total", $v]); }));    // cada cambio
```

Y lo que el hijo hace con ello:

```js
u: ($p) => { [, , label, value] = $p; $a(); },
```

**Se movió `value`, y el trabajo es el de las dos props.** El padre vuelve a escribir `"Total"`
—que no se ha movido, que nunca se moverá, y que es constante por decisión 75—; el hijo reasigna
las dos; y `$a()` recalcula **todas** las escrituras del componente, la de `label` incluida, para
descubrir con `$w` que sale igual y no tocar el DOM.

Con dos props es un desperdicio que no se nota. Escala mal por tres sitios a la vez:

- **El padre lee `peek()` de todas las demás signals en cada notificación.** Con tres signals
  alimentando tres props, cada movimiento de una hace dos `peek()` de las otras dos, y hay tres
  suscripciones haciendo lo mismo: 6 lecturas por vuelta para cambiar 1 valor.
- **El emitido crece con el cuadrado.** Cada suscripción escribe la tupla **entera**, así que un
  componente de P props con S signals emite S arrays de P huecos. Es texto en un chunk cuyo
  presupuesto son 1 kB tras minify+brotli (SDD-17 §6.22).
- **El hijo recalcula P escrituras para aplicar 1.** `$a()` no tiene forma de saber qué se movió,
  porque el array no se lo dice.

Y hay una cuarta, de acoplamiento y no de coste: **el padre tiene que conocer el orden completo de
props del hijo** para rellenar los huecos que no le tocan. Eso obliga a `client.ts` a leer el
`@code` del hijo y a memoizar `extractCode` en un `WeakMap` para que Oxc siga siendo uno por
fichero (BUG-12 §3.4). Con el canal disperso sigue necesitando el **índice**, pero no el
**contenido** de los demás huecos.

---

## 2. Causa raíz

### 2.1. Un hueco de destructuring y un `undefined` son indistinguibles

Es la causa, y es de JavaScript, no del emit:

```js
let a, b, c;
[, , a] = [1, 2];              // a === undefined
[, , b] = [1, 2, undefined];   // b === undefined
```

`c` no existe en el primer array y existe valiendo `undefined` en el segundo, y el patrón no
puede distinguirlos. Por eso BUG-12 §3.4 razonó —**correctamente**— que un array parcial
devolvería las props no nombradas a su default y `$a()` las repintaría, y concluyó que el padre
tiene que mandar el payload entero.

**La densidad no es un descuido: es la única forma segura *con esa forma de canal*.** El defecto
no está en la decisión, está en la forma: el patrón de destructuring es un mecanismo que asigna
**todo** lo que nombra, y se eligió porque es el simétrico exacto de `Object.values` en la rama de
alta (SDD-15 §4.2). Para la rama de **actualización** esa simetría no compra nada y cuesta esto.

### 2.2. Dónde está escrito

- **El lado del padre:** `markup-client.ts` compone un `Slot[]` con la expresión de cada hueco y
  su signal si la hay ([`markup-client.ts:134-139`](../../../packages/compiler/src/emit/markup-client.ts#L134-L139)),
  y emite un array literal completo por cada suscripción. La estructura ya sabe **qué hueco lleva
  qué signal** —`Slot.signal`— así que el dato que hace falta para emitir disperso ya está
  calculado; lo que falta es la forma que lo consuma.
- **El lado del hijo:** `client.ts` genera el patrón de asignación de `u` con la misma función que
  genera el destructuring de alta, en sus dos formas (BUG-12 §3.3, *«`destructuring()` pasa a
  tener dos formas —declaración y asignación— sobre la misma lista de props»*).

### 2.3. Alcance

- **Todo componente con más de una prop**, en cualquier página. Con una sola prop el canal denso
  y el disperso coinciden, así que el defecto empieza en la segunda.
- **Los dos caminos de alta son ajenos.** El alta —`h` desde el payload, `c` desde el padre— es
  **densa por necesidad**: todas las props tienen que aterrizar. Este BUG no la toca (§4.1).
- **`@fudic/core` solo por el tipo.** `Controller.u` y `FudicElement.u` toman
  `readonly unknown[]`, que un array disperso satisface sin cambios. Lo que cambia es la
  documentación del contrato: *el alta es densa, la actualización es dispersa*.

### 2.4. Un segundo defecto que comparte la causa, y que aquí NO se arregla

*(la numeración sigue en §2.5 con el orden respecto a SDD-30)*

`$a()` recalcula todas las escrituras porque no sabe cuáles dependen de lo que se movió. Con el
canal disperso el hijo **sí lo sabe** por primera vez, así que el arreglo pasa a ser posible — pero
particionar `$a` por prop exige saber qué escritura lee qué binding, y eso es el análisis de
referencias libres que [SDD-30 §3.3](../SDD-30-renders-de-bloque.md) construye en
`emit/scope.ts`. Queda **fuera de alcance** (§7) con nombre y condición.

### 2.5. Por qué va detrás de SDD-30

No es una dependencia de mecanismo —el canal disperso se puede escribir hoy— sino de **las mismas
líneas y los mismos goldens**. Dos motivos, y el primero basta:

- **[SDD-30 §4.6](../SDD-30-renders-de-bloque.md) emite esta misma forma dentro de un bloque.** Su
  tarea 17 dice, literal, que *«el `s()` del bloque emite el pase inicial y la suscripción con la
  misma forma que BUG-12 §3.4»* — es decir, el array denso. Si este BUG va delante, aquella tanda
  escribe la forma vieja en un sitio nuevo y hay que volver; si va detrás, la corrección se aplica
  a los dos sitios de una vez, con el mismo test.
- **Las dos regeneran los goldens de cliente.** SDD-30 además añade un fixture con `@foreach`, `@if`
  y anidamiento. Regenerarlos desde dos ramas produce un conflicto que se resuelve *sin leerlos*,
  y el valor entero de un golden byte a byte es que alguien lo lee.

**Y detrás sale más barato:** con SDD-30 en `Hecho` existe `emit/scope.ts`, que es justo lo que le
falta a §2.4 para dejar de estar fuera de alcance. Si se decide plegarlo aquí, la decisión es de
Pedro y se anota entonces; este documento no la da por tomada.

---

## 3. Interfaz pública

### 3.1. `u` recibe un array disperso, y el emitido pregunta por presencia

```js
// hijo — hoy
u: ($p) => { [, , label, value] = $p; $a(); },

// hijo — corregido
u: ($p) => {
  if (2 in $p) label = $p[2];
  if (3 in $p) value = $p[3] === undefined ? 0 : $p[3];
  $a();
},
```

- **`in` distingue lo que el patrón no podía.** Un hueco ausente deja la prop **como estaba**; un
  hueco presente valiendo `undefined` aplica el default. Las dos semánticas existen y ahora son
  expresables.
- **El default se conserva, y con la regla exacta de BUG-12 §3.3:** *«los defaults se repiten,
  porque una actualización puede volver a traer `undefined`»*. Sigue siendo cierto — lo que deja
  de ser cierto es que una prop que el padre no menciona vuelva a su default.
- **`$a()` se sigue llamando una vez**, al final, después de todas las reasignaciones. Es lo que
  mantiene la pasada consistente: con dos props movidas en la misma llamada no hay estado
  intermedio observable.

### 3.2. El padre manda solo el hueco que se movió

```js
// alta: DENSA, no cambia
$n1.u([, , "Total", count.peek()]);

// actualización: DISPERSA
$d.push(count.subscribe(($v) => { const $p = []; $p[3] = $v; $n1.u($p); }));
```

`const $p = []` seguido de `$p[3] = $v` produce un array con `length === 4` y **un solo índice
presente**. No hay literal disperso que emitir —`[, , , $v]` sería denso en los tres primeros
huecos con valor `undefined`— y por eso el emitido son dos sentencias y no una expresión.

Con varias signals sale **una suscripción por signal**, como hoy, pero cada una escribe **un**
hueco en vez de recomponer la tupla: es donde muere el crecimiento cuadrático de §1.

`$p` entra en la reserva del prefijo `$` (SDD-15 §4.7), igual que `$v`.

### 3.3. `Controller.u` — el tipo no cambia, el contrato sí

```ts
/**
 * update — take a positional payload and re-apply the values it carries.
 * The array may be SPARSE: a hole means "unchanged", a present `undefined` means
 * "apply the default". The initial handover (`h`/`c`) is always dense.
 */
u(props: readonly unknown[]): void;
```

`readonly unknown[]` ya admite un array disperso. Lo que había que escribir era la regla, y no
estaba escrita en ningún sitio.

### 3.4. Sin códigos `FUD` nuevos

No hay nada que diagnosticar: el cambio es de forma del emitido, y las dos formas son válidas. Es
el mismo caso de BUG-16 y BUG-17.

---

## 4. Comportamiento corregido

### 4.1. El alta es densa; la actualización es dispersa

La regla, y es la que hay que poder repetir sin mirar el código:

> **Dar de alta es entregar el estado entero; actualizar es decir qué se movió.**

Son dos operaciones distintas que compartían forma por comodidad. El alta tiene que ser densa
—`h` recibe su tramo de `fud-state`, `c` recibe lo que el padre inyecta, y en los dos casos
**todas** las props aterrizan—, y ahí la simetría con `Object.values` sigue valiendo entera
(SDD-15 §4.2). La actualización no: llega porque **una** fuente se movió, y esa es la información
que el canal tiraba.

### 4.2. Una prop constante deja de viajar

`label="Total"` participa en el alta y **desaparece de todas las suscripciones**. Es la decisión
75 de props-spec cumplida por fin en el canal de update: *«una prop no reactiva es `const` en el
sentido que importa: nadie la reescribe nunca»*. Hoy el padre la reescribe en cada vuelta, y lo
único que impide que se vea es `$w`.

### 4.3. El padre deja de leer lo que no se ha movido

Sin recomponer la tupla no hay `peek()` de las demás signals. Con S signals sobre P props, el
trabajo por notificación pasa de **O(P)** lecturas a **O(1)**, y el texto emitido de **S × P**
huecos a **S**.

### 4.4. Lo que NO cambia

- **`$a()` sigue recalculando todas las escrituras.** Es §2.4, y está fuera de alcance con su
  condición. El ahorro de este BUG es el del **padre** y el del **tamaño del chunk**; el del hijo
  llega después.
- **`h` sigue sin llamar a `$a()`** (BUG-12 §4.3). Y con él, el corolario de §3.3.b: tras hidratar
  `$w` está vacío, así que el **primer** `u` repinta todo una vez. Con el canal disperso ese
  primer repaso sigue siendo una sola vez por instancia y sigue haciendo de red de seguridad.
- **El orden posicional, la ausencia de esquema y el `WeakMap` de `extractCode`.** El padre sigue
  necesitando el **índice** de la prop en el hijo; lo que deja de necesitar es el **valor** de las
  demás.
- **La rama de servidor.** El SSR no tiene canal de update.

---

## 5. Invariantes

**Los que el bug violaba**

- ***Una prop no reactiva no la reescribe nadie*** (props-spec 75). El padre la reescribía en cada
  notificación de cualquier otra prop; solo `$w` impedía que se viera en el DOM.
- ***El coste de un `u` es proporcional a lo que se movió*** (BUG-12 §4.2, que lo enuncia para el
  DOM y lo incumple para el canal). Era proporcional al número de props, en las dos puntas.
- ***Lo que el emit sabe en compilación no se recalcula en runtime.*** El emit sabe qué hueco lleva
  qué signal —`Slot.signal` lo tiene calculado— y aun así emitía código que vuelve a componer la
  tupla entera en cada disparo.

**Los que la corrección añade**

- **El alta es densa y la actualización es dispersa.** Dos operaciones, dos formas, y la regla
  escrita en el tipo.
- **En un array de update, un hueco significa «sin cambio» y un `undefined` presente significa
  «aplica el default».** Las dos semánticas son distinguibles, y `in` es lo que las distingue.
- **`$a()` se llama una vez por `u`, después de todas las reasignaciones.** Ni una por prop: no hay
  estado intermedio observable cuando se mueven dos.

---

## 6. Criterios de aceptación

Tests en `packages/compiler/test/emit/` y en el arnés de `test/emit/hydrate/`.

**Forma del emitido**

1. **(rojo primero)** El `u` de un componente de dos props emite `if (2 in $p)` / `if (3 in $p)` y
   **no** un patrón de asignación por destructuring. Verificable sobre el texto del chunk.
2. **(rojo primero)** El default se conserva en la rama presente:
   `if (3 in $p) variant = $p[3] === undefined ? 'default' : $p[3];`. Es la regla de BUG-12 §3.3
   —una actualización puede volver a traer `undefined`— escrita en la forma nueva.
3. **(rojo primero)** La suscripción del padre emite `const $p = []; $p[3] = $v; $n1.u($p);` y
   **ningún** literal con los demás huecos. Con dos signals sobre cuatro props, las dos
   suscripciones escriben **un** hueco cada una.
4. **El alta no se toca.** El pase inicial sigue siendo el array **denso** con `peek()`, y una
   prop constante sigue apareciendo en él. Es lo que separa las dos operaciones.
5. **Una prop constante no aparece en ninguna suscripción.** `label="Total"` está en el alta y en
   ningún `$p[...]`.
6. **La reserva `$`.** `$p` empieza por `$`, como `$v`.

**Comportamiento, sobre DOM real**

7. **(rojo primero)** Con un hijo de dos props y una sola reactiva, mover la signal actualiza el
   nodo de esa prop y **el de la otra no se toca** — comprobado con un `MutationObserver` o
   marcando el nodo a mano antes de disparar, no con `$w` como oráculo (que es quien hoy lo tapa).
8. **Un hueco ausente deja la prop como estaba.** Tras un `u` que solo lleva el índice 3, la
   variable del índice 2 conserva su valor, **no** vuelve a su default. Es el test que falla con
   el canal denso convertido a parcial sin `in`, y es exactamente el fallo que BUG-12 §3.4 razonó
   para no hacerlo.
9. **Un `undefined` presente sí aplica el default.** `$p[3] = undefined` deja la prop en su valor
   por defecto, no en `undefined`.
10. **Dos props movidas en la misma llamada.** Un `u` con dos huecos presentes llama a `$a()`
    **una** vez y el DOM no pasa por ningún estado intermedio.
11. **El criterio §6.7 de BUG-12 sigue verde.** Click en el padre → signal → suscripción emitida →
    `u` del hijo → `$a()` → nodo de texto, de punta a punta sin andamiaje. Es el test que define
    aquel BUG y no puede degradarse aquí.
12. **La equivalencia SSR↔cliente sigue verde sin tocarla.** Este BUG no toca la rama de servidor
    ni el alta.

**Goldens**

13. Los tres `__golden__/*.client.mjs` regenerados y **leídos a mano**: las únicas diferencias
    esperadas son el cuerpo de `u` (patrón → guardas `in`) y las suscripciones del padre (literal
    entero → dos sentencias). Los `*.mjs` de **servidor** no cambian ni un byte; si cambian, algo
    se emitió en la rama equivocada.

**Cobertura.** `client.ts` y `markup-client.ts` nacieron al 100 % en las cuatro métricas y no
bajan. Nada de `/* v8 ignore */`.

---

## 7. Fuera de alcance

- **Particionar `$a()` por prop.** Es §2.4: con el canal disperso el hijo sabe por primera vez qué
  se movió, pero saber **qué escritura depende de qué binding** es el análisis de referencias
  libres que [SDD-30 §3.3](../SDD-30-renders-de-bloque.md) construye en `emit/scope.ts`.
  **Condición para abrirlo:** con SDD-30 en `Hecho`, es reutilizar `scope.ts` sobre los fragmentos
  de cada escritura y emitir `$a0`…`$aN` más un `$a` que los llame a todos —la rama densa del alta
  sigue necesitando llamarlos todos—. Se abre como BUG propio porque para entonces la corrección
  no toca una sola línea de esta.
- **Que el emit envuelva `u` en `batch`.** Necesita `batch`, que es
  [SDD-31](../SDD-31-signals-derivadas.md), y es una decisión de emit que vive en SDD-15.
- **Props como signals.** La conversación que originó esta tanda. Queda anotada en
  [SDD-31 §7](../SDD-31-signals-derivadas.md#7-fuera-de-alcance) con su condición de reapertura;
  este BUG es una de las dos mitades que había que tener antes para poder medirla.
- **El canal ascendente (`bind:`, props callback).** Decisiones 83–85, y sigue siendo otro
  documento.
- **`u` con recomposición estructural.** Sigue siendo [SDD-30](../SDD-30-renders-de-bloque.md).
- **Cambiar la forma del payload de `fud-state`.** El alta no se toca (§4.1), así que
  `[[offsets],[data]]` y la simetría con `Object.values` quedan intactas.
