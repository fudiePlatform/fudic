# BUG-55 · Una ruta no puede escuchar el bus, y una señal sembrada desde `data` no se refresca

> **Estado:** `Borrador` — se documenta mientras se arregla, a petición de Pedro. [tareas](./BUG-55-Task.md).
> **Corrige:** [SDD-39](../SDD-39-rutas-reactivas.md) (la mitad cliente de una ruta) y
> [SDD-68](../SDD-68-llamadas-sin-fontaneria.md) §4.8 (el refresco de `data`).
> **Paquetes:** `@fudic/compiler` · `@fudic/http` · `examples/basic`

---

## 1. Síntoma

En `/usuarios`, el alta de `user-form` recargaba la página entera para que la tabla viera a la
persona nueva. Lo correcto es lo que hace el carrito de `/hidratacion`: el componente emite la
persona por el bus, la ruta la recoge y actualiza una señal, y la tabla se repinta. Al hacerlo
aparecieron dos fallos.

**Uno.** Un `bus:` escrito en una ruta compila a `$dom.bus($host, …)`, y en una ruta `$host` no
existe: solo lo declara la factoría de un componente. El `ReferenceError` corta la conexión
entera de la página, no solo la suscripción. Un `emit(...)` en el `@code` de una ruta tiene el
mismo problema, porque se reescribe a `emit.call($host, …)`.

**Dos.** El patrón natural para pintar una lista que el usuario puede ampliar es una señal
sembrada desde `data`:

```
const personas = signal(data.users);
```

Pero cuando una llamada hace que la ruta pida su `data` otra vez (SDD-68 §4.8), la ruta cambia
`data` y repinta, y la señal sigue con el valor del primer `data`. La tabla deja de reflejar al
servidor: un «Borrar» no quita la fila y un «Activo» cambiado en otro sitio no se ve.

**Tres** (la prueba de Pedro). El alta hacía dos peticiones: el `save` del formulario y, detrás,
el `data` entero de la página. Toda llamada que no es GET hacía que la página pidiera su `data`
otra vez, también la función de un componente, que no sabe nada de la página que lo aloja. Con el
bus esa segunda petición sobra.

## 2. Corrección

**Uno.** La mitad cliente de una ruta declara `$host` cuando un `bus:` o un `emit` lo lee, como
hace un componente, y su valor es el `<body>` que la ruta ya tiene. Lo que `bus` y `emit` piden
a un host es su documento y un nodo desde el que el evento suba hasta él, y el `<body>` cumple
las dos cosas.

**Dos.** Una señal cuyo valor inicial lee `data` está **sembrada desde `data`**. Cuando llega un
`data` nuevo, la ruta vuelve a evaluar ese valor inicial con el `data` nuevo y lo escribe en la
señal, antes de repintar. El servidor manda: lo que el usuario añadió a la señal desde el último
`data` se pierde si el `data` nuevo no lo trae, y debe traerlo, porque el refresco existe para
decir lo que hay en el servidor.

Una señal que no lee `data` no se toca. Un `computed` tampoco: se deriva solo.

**Tres.** Solo una función de la **propia ruta** —la que tiene `page` en su contrato, porque su
`.fudapi` es hermano de la ruta— avisa a la página de que su `data` está viejo. La función de un
componente sigue haciendo que el Service Worker olvide la página, pero no la hace pedir su
`data`: lo que cambió lo cuenta por el bus. Lo que una función nombra en `invalidates` se avisa
siempre, sea de quien sea.

El Service Worker solo guarda el `data` de las rutas que él renderiza; una ruta SSR llega siempre
al servidor y para ella olvidar no hace nada (y desde BUG-56 no hay nada que olvidar).

## 3. Criterios de aceptación

1. Una ruta con `bus:x` oye un `x` emitido desde cualquier punto de la página y repinta; tras
   `r()` deja de oírlo.
2. Un `emit("x", d)` en el `@code` de una ruta llega a `document` con `d`, despachado desde el
   `<body>`.
3. Una ruta sin `bus:` ni `emit` no declara `$host`.
4. Una señal sembrada desde `data` toma el valor del `data` nuevo en cada refresco, y la vista
   se repinta con él.
5. Una señal que no lee `data` conserva su valor tras un refresco.
6. `/usuarios`: el alta añade la fila sin recargar; «Borrar» y «Activo» siguen repintando con lo
   que dice el servidor (los criterios de SDD-68 sobre `/usuarios`, en verde).
7. El `PUT` de la función de un componente no despacha el aviso de `data` viejo; sí lo despacha
   para lo que nombra en `invalidates`, y el Service Worker recibe la invalidación igual.
8. `/usuarios`: un alta es una sola petición, el `save`, y el formulario queda vacío.
