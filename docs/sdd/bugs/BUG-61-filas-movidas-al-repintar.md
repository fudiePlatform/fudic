# BUG-61 · El primer repintado tras hidratar mueve filas que no han cambiado de sitio

> **Estado:** `Hecho` — arreglado primero y documentado después, a petición de Pedro. [tareas](./BUG-61-Task.md).
> **Corrige:** [SDD-68](../SDD-68-llamadas-sin-fontaneria.md) §4.8 (una pasada que deja las filas en su orden no mueve nada).
> **Paquetes:** `@fudic/compiler`

---

## 1. Síntoma

Salió implementando SDD-69. En `/usuarios`, tras entrar con la cookie, marcar *Activo* en la fila
de Ana repinta la tabla, y ese repintado saca y vuelve a meter las filas de Luis y de Ana, aunque
el orden sea el mismo: Ana, Luis, Marta. En pantalla no se nota, pero es justo lo que SDD-68 §4.8
prohíbe, porque mover un nodo le quita el foco a lo que lleva dentro. El test de `/usuarios` lo
detecta: observa el `<tbody>` y no admite ningún movimiento.

Pasa solo en la **primera** pasada tras hidratar. En las siguientes no se mueve nada.

Antes no se veía por casualidad: el `effect` que leía el token de `localStorage` escribía una
señal al cargar la página, y esa primera pasada ocurría antes de que nadie mirara.

## 2. Causa

El servidor escribe un espacio en blanco entre cada fila, y una ruta los conserva:
`" " Ana "  " Luis "  " Marta " "`. Al hidratar, una fila no se queda con el espacio que tiene al
lado: lo usa solo como referencia, porque ese espacio también es de la fila de al lado.

Al repintar, las filas se colocan de la última a la primera, y cada una se compara con la
siguiente. El espacio, como no es de la fila, se saltaba como si no estuviera. Pero sí está:
físicamente queda entre Luis y Marta. Así que Luis no parecía pegado a Marta y se movía, y Ana
igual respecto a Luis. Esa pasada amontona los espacios al principio, y por eso las siguientes ya
no mueven nada.

El test de SDD-68 que lo comprobaba usaba un componente, que quita los espacios entre filas: el
caso de la ruta no estaba probado.

## 3. Corrección

Un nodo que no es de la fila y **ya está en su sitio** pasa a ser la referencia de la fila
anterior, en vez de saltarse. Sigue sin moverse nunca. Las filas en su orden ya no se mueven, y
una reordenación mueve lo mismo que antes. Es una línea del código que genera el compilador para
cada bloque.

## 4. Criterios de aceptación

1. Una ruta hidratada con espacios entre las filas de un `@foreach` con `key`: la primera pasada
   que cambia una fila no mueve ninguna (test nuevo en el refresco de rutas, que falla sin el
   arreglo).
2. El test de `/usuarios` de `examples/basic` («Activo» repinta la fila sin mover nada) pasa con
   la sesión por cookie.
3. Los ficheros de referencia del código generado llevan la línea nueva; el resto del compilador,
   igual.
