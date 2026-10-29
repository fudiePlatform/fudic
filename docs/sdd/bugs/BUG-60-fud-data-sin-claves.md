# BUG-60 · `fud-data` repite los nombres de los campos en cada fila

> **Estado:** `Borrador` — documentado mientras se arregla, a petición de Pedro. [tareas](./BUG-60-Task.md).
> **Corrige:** [SDD-39](../SDD-39-rutas-reactivas.md) §4.8 (el bloque `fud-data`).
> **Paquetes:** `@fudic/ssr` · `@fudic/core` · `@fudic/api` · `@fudic/vite` · `@fudic/compiler`

---

## 1. Síntoma

En `/usuarios` de `examples/basic`, el bloque `fud-data` de la página lleva la lista de personas
como JSON con claves: `{"users":[{"id":1,"name":"Ana","email":"…","age":34,"active":true,"notes":"…"},…]}`.
Cada fila repite `id`, `name`, `email`, `age`, `active` y `notes`. Con cien personas, los nombres
de las columnas pesan tanto como los datos.

El framework se pensó desde el principio para mandar el estado sin nombres de atributos, y las
llamadas ya viajan así: posicionales, tipadas por el `.fudapi`. `fud-data` era la excepción.

Y un `date` de `data` llegaba al navegador como texto ISO, no como `Date`: el servidor pintaba con
una fecha y el cliente hidrataba con una cadena.

## 2. Causa

`fud-data` se escribía con `JSON.stringify` del valor de `load`, recortado solo a las raíces que lee
la mitad de cliente. El compilador no sabía qué forma tiene `data`: del `.fudapi` solo recibía que
hay un `load`, no sus campos. Sin la forma no se puede quitar una clave, porque el otro lado no
sabría qué valor es cuál.

## 3. Corrección

1. **La forma de `data` llega al compilador.** El host lee el `load` del `.fudapi` y entrega sus
   campos y los `type`/`enum` que nombran, a cualquier profundidad (`LinkedApi.data`). Un tipo que
   se nombra a sí mismo se resuelve por nombre, sin desplegarlo.
2. **El compilador la escribe en el código emitido**, en los dos lados: el módulo de servidor la
   usa para empaquetar el bloque y el chunk de la ruta para desempaquetarlo. No hace falta nada en
   tiempo de ejecución para conocerla, y el Service Worker, que pinta la página sin `load`,
   empaqueta igual que el servidor.
3. **El formato, posicional en todos los niveles** (sigue siendo JSON, decisión 12 de SDD-70):
   - un objeto de campos (la raíz de `data`, un `type`) es un array en el orden en que se declaran
     los campos; un campo ausente es `null`, y los `null` del final se quitan;
   - una lista es un array de sus elementos, cada uno con estas mismas reglas;
   - un `map` sigue siendo un objeto: sus claves son datos, y sus valores siguen las reglas;
   - `bool` es `1`/`0`, un `enum` es el índice de su miembro y `date` sus milisegundos;
   - todo lo demás (`str`, `html`, `uuid`, números) va como está.

   `/usuarios` pasa de `{"users":[{"id":1,"name":"Ana",…}]}` a `[[[1,"Ana",…]]]`.
4. **Lo que no cambia.** Un `.fudapi` que el host no pudo leer no da forma: el bloque sale con
   claves, como antes, y el chunk lo lee igual. El endpoint `/_fudic/data/<ruta>` sigue en JSON con
   claves: pasarlo a binario es de SDD-70 §3.7.

## 4. Criterios de aceptación

1. En `/usuarios`, `fud-data` no lleva ningún nombre de campo, y la tabla se pinta e hidrata igual.
2. Un `type` dentro de otro, una lista de listas, un `map` de `type`, un campo opcional ausente y un
   tipo que se nombra a sí mismo van y vuelven iguales.
3. Un `date` de `data` llega al chunk como `Date`; un `enum`, como su texto; un `bool`, como `bool`.
4. Las raíces que la mitad de cliente no lee no viajan, como antes (salen como `null` o no salen).
5. Sin forma (enlace no leído), el bloque y el chunk se comportan como antes.
6. Refrescar `data` tras un `save` sigue funcionando.
