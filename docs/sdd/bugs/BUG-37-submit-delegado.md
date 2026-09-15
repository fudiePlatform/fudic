# BUG-37 · El `submit` del formulario se delega, y un `stopPropagation()` del autor se lleva la validación

> **Estado:** `Hecho`
> **Corrige:** [SDD-37](../SDD-37-delegacion-de-eventos.md) aplicado a
> [SDD-34](../SDD-34-forms-compilador.md) §4.4
> **Paquetes:** `@fudic/forms`
> **Rango:** no reserva códigos: no hay diagnóstico que dar, el defecto es de runtime

---

## 1. Contexto y síntoma

`/delegacion` es la página que cuenta, en vivo, cada `addEventListener` de la página. Pedro
le añadió un `console.log(this)` a la sonda para ver **quién** los recibe, y el formulario
de doce campos contestó esto:

```
1. ServiceWorkerContainer   ┐
2. ServiceWorkerContainer   ├─ los 3 de la carga, antes de tocar nada
3. #document                ┘
4. <form class="fudic">     ← @submit=@stop, de la plantilla
5. #shadow-root             ┐
6. #shadow-root             ├─ input · change · focusout, los doce campos
7. #shadow-root             ┘
8. <form class="fudic">     ← la validación de bindForm  ◄── era #shadow-root
```

Los tres de la carga no son del formulario y conviene nombrarlos para que no distraigan:
uno es el `click` en captura sobre el documento con el que el runtime despierta un
componente frío ([`install.ts:242`](../../../packages/core/src/hydrate/install.ts)), y los
otros dos están en `navigator.serviceWorker` —que también es un `EventTarget`— y son el
`message` y el `controllerchange` del canal que precalienta chunks
([`sw.ts:62`](../../../packages/core/src/hydrate/warm/sw.ts) y `:81`). Con `pnpm dev` la
cifra es mayor porque el cliente HMR de Vite abre un `WebSocket` y le pone los suyos.

Lo que sí es del formulario son cinco, y **antes de la corrección el nº 8 era
`#shadow-root`**. Ese es el defecto entero: la validación del formulario escuchaba en la
raíz, no en el `<form>`.

**El síntoma que produce.** Un `@submit` escrito de la manera ordinaria:

```razor
@client {
  function stop(e: Event) {
    e.preventDefault();
    e.stopPropagation();
  }
}
…
<form control=@wideForm @submit=@stop>
```

deja el formulario **sin validar, y sin decirlo**. El evento muere en el `<form>` y nunca
llega a la raíz donde esperaba `bindForm`: no hay `preventDefault`, no hay `$touch()` en
cascada, no hay foco en el primer campo inválido y no se escribe el resumen. Un formulario
inválido se envía solo.

---

## 2. Causa raíz

[`packages/forms/src/dom/bind-form.ts:28`](../../../packages/forms/src/dom/bind-form.ts) —
qué función se llama:

```ts
on(el, 'submit', (event) => { … })
```

y [`wiring.ts:30`](../../../packages/forms/src/dom/wiring.ts), qué hace `on` desde SDD-37:

```ts
export function on(el: Element, type: string, handler: (event: Event) => void): Cleanup {
  return delegate(el, type, handler);   // ← el listener va a `el.getRootNode()`
}
```

SDD-37 movió **toda** suscripción del paquete a la raíz cambiando una sola función, y esa
economía es justo lo que su commit celebra: *«las seis bindings no tuvieron que cambiar una
palabra»*. Cierto, y correcto para las seis. Pero `bindForm` no es una de las seis y pasaba
por la misma puerta, así que se fue a la raíz con ellas sin que nadie lo decidiera.

**Delegar se paga.** El precio es exactamente uno: un handler solo corre si el evento
**llega** a la raíz, de modo que quien esté por debajo puede cortarlo. En un campo el
precio sale a cuenta —hay doce, y el número crece con el marcado: 36 → 3, que es SDD-37
entero—. En el `<form>` no hay nada que comprar: **hay un formulario por raíz**, así que la
raíz sostendría el mismo listener único que sostiene ahora. Se pagaba el precio sin
llevarse la mercancía.

### 2.1. Por qué antes no pasaba

Antes de [`84f3a77`](../../../packages/forms/src/dom/wiring.ts) los dos listeners vivían en
el mismo nodo:

```
ANTES:  form.addEventListener('submit', autor)      ┐ el mismo objeto
        form.addEventListener('submit', bindForm)   ┘

AHORA:  form.addEventListener('submit', autor)      ← fase de destino
        root.addEventListener('submit', bindForm)   ← fase de burbuja
```

`stopPropagation()` levanta la bandera que se consulta **al saltar al siguiente objeto** del
camino; no corta entre los listeners del objeto actual —para eso está
`stopImmediatePropagation()`—. Con los dos en el `<form>`, el autor podía parar el evento y
`bindForm` corría igual. Con uno en cada sitio, no.

### 2.2. Lo que NO es la causa: el orden

La primera hipótesis fue que la delegación había cambiado el orden, poniendo la validación
detrás del `@submit` del autor. **Es falsa**, y la consola lo enseña: el `<form>` aparece en
el puesto 4 y la validación en el 8, es decir, el `@submit` de la plantilla se registra
primero — y también se registraba primero antes de SDD-37, cuando ambos estaban en el mismo
nodo y el orden era el de registro. El autor corría antes que la validación en las dos
versiones. Lo que cambió no es **cuándo** corre, sino **si** corre.

### 2.3. El alcance: las seis que sí delegan

| binding | tipos | ¿se queda delegado? |
|---|---|---|
| `bindText` · `bindNumber` · `bindCheckbox` · `bindSelect` · `bindSelectMultiple` | `input` · `change` · `blur`→`focusout` | **sí** |
| `bindRadio` | idem, por cada radio del grupo | **sí** |
| `bindForm` | `submit` | **no** |

El criterio no es el tipo de evento: es **cuántos elementos comparten una raíz**. Un campo
se repite doce veces en esta página y un número indefinido en general; un `<form>` es uno.
Donde el ahorro crece con el marcado, el precio vale; donde el ahorro es cero, el precio es
todo lo que hay.

---

## 3. Interfaz pública

**Ninguna.** `wiring.ts` no se re-exporta desde `src/dom/index.ts`, así que ni `on` ni la
nueva `onSelf` salen del paquete: `@fudic/forms/dom` publica las ocho `bind*`, `setMessages`
y los tipos, y todas mantienen su firma. El emit no cambia una línea.

Internamente, `wiring.ts` gana la hermana de `on`:

```ts
/** Suscribe en el ELEMENTO, fuera de la delegación de su raíz. */
export function onSelf(el: Element, type: string, handler: (event: Event) => void): Cleanup;
```

Dos funciones y no un parámetro en la primera, porque las seis bindings de campo deben
seguir sin saber cómo se cablea un listener — que es la única razón por la que `on` existe.

---

## 4. Comportamiento corregido

1. **El `submit` del `<form>` se suscribe en el `<form>`.** Un listener para un nodo, en el
   nodo. La validación deja de depender de que el evento sobreviva el viaje hasta la raíz.
2. **Las seis bindings de campo no cambian.** Siguen delegadas y siguen pagando el precio,
   que ahí es una ganga: 36 listeners convertidos en 3, y constantes por muchos campos que
   se añadan.
3. **El contador no baja, y eso es la prueba y no una decepción.** `/delegacion` marcaba 5
   al hidratar el formulario y sigue marcando 5: lo que se movió de sitio es uno de ellos.
   Si delegar el `submit` hubiera ahorrado algo, el número habría subido al deshacerlo.

Lo que se mide es el reparto, no el total:

| | `<form>` | `#shadow-root` |
|---|---|---|
| antes | 1 | 4 |
| ahora | **2** | **3** |

---

## 5. Invariantes

**El que violaba.** *Un mecanismo se paga cuando compra algo.* La delegación cambia un
listener por elemento por un listener por raíz más una fila en una tabla, y a cambio hace
que el handler dependa del camino del evento. Aplicarla donde los elementos son uno es
aceptar la dependencia a cambio de nada.

**El que añade.** **Lo que el autor escribe en su handler no puede desarmar el framework.**
`stopPropagation()` en un `@submit` es código correcto y corriente; que apague en silencio
la validación del formulario es un contrato roto por debajo del autor, no un error suyo. La
regla general: una suscripción del framework que el autor pueda cortar sin saberlo solo se
justifica si el ahorro crece con el marcado.

---

## 6. Criterios de aceptación

En `packages/forms/test/dom/bind-form.test.ts`, un `describe` con dos casos:

1. **El receptor.** Con `addEventListener` parcheado durante la llamada, `bindForm` produce
   exactamente una suscripción y su `this` es el `<form>`; no aparece `el.getRootNode()`.
   Contar no serviría: **el número es uno en las dos versiones**, y el receptor es el
   hallazgo entero.
2. **Lo que cuesta el receptor.** Un `@submit` del autor que llama a `stopPropagation()`,
   registrado **antes** de la binding —el orden en que el emit los escribe—, y un formulario
   con errores en registro: el submit tiene que seguir prevenido y `touched()` en cascada.

**Visto fallar.** Devolviendo `on` a [`bind-form.ts:28`](../../../packages/forms/src/dom/bind-form.ts),
**caen los 2 de 9** del fichero. El segundo dice `expected false to be true`, que es
`defaultPrevented`: el formulario inválido enviándose solo.

**El testigo sube por la cadena.** Busca el prototipo que **posee** `addEventListener`
partiendo de un nodo real en vez de nombrar `EventTarget`: el `EventTarget` del ámbito de un
módulo de test es el que define Node, ajeno al del emulador de DOM, y parchear el global
vigilaría un prototipo del que ningún elemento hereda. Escrito así, el test vale igual en un
navegador.

**Medido en el navegador** (Chrome, `vite preview`, sonda de `/delegacion` con
`console.log(this)`): el quinto listener del formulario pasa de `#shadow-root` a
`<form class="fudic">`.

**Cobertura.** `@fudic/forms` se queda en **100 / 100 / 100 / 100** en las cuatro métricas,
sin un solo `ignore`. `onSelf` nace cubierta por sus dos caras: la suscripción por los
casos de submit, y su `Cleanup` por «the cleanup stops the listener and the live region
alike».

---

## 7. Fuera de alcance

- **La delegación de los campos**, que es SDD-37 y está bien. Este BUG no la revisa: saca
  un elemento de ella, el único donde el ahorro era cero.
- **Un `@input` del autor que llame a `stopPropagation()`** y apague la binding de su
  campo. Es el mismo precio, pero ahí sí se compra algo, así que es una decisión de diseño
  —¿debe el framework avisar? ¿con un diagnóstico?— y no un defecto. Pedro decide.
- **Que `delegate()` guarde un handler por `(raíz, tipo, elemento)`**
  ([`delegation.ts:67`](../../../packages/forms/src/dom/delegation.ts)): un segundo
  `on(el, 'input', …)` sobre el mismo elemento pisa al primero en silencio, y el `Cleanup`
  del primero borra la fila del superviviente. Hoy ninguna `bind*` registra dos veces el
  mismo tipo sobre el mismo nodo, así que no se dispara. No entra aquí porque la corrección
  no toca ni una línea de `delegation.ts`: es candidato a BUG propio y **está anotado en el
  registro de progreso de este índice** para que no se pierda.
- **La sonda de `/delegacion`**, que no es del framework: es el instrumento con el que se le
  mide. Su `console.log(this)` se commitea a propósito.
