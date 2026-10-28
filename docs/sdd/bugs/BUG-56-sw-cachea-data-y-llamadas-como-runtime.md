# BUG-56 · El Service Worker guarda para siempre el `data` y las llamadas GET

> **Estado:** `Borrador` — se documenta mientras se arregla, a petición de Pedro. [tareas](./BUG-56-Task.md).
> **Corrige:** [SDD-45](../SDD-45-runtime-publicado.md) §4.5.1 (la caché del runtime publicado).
> **Paquetes:** `@fudic/transport`

---

## 1. Síntoma

Con Service Worker, en `/usuarios`: se da de alta una persona, se borra con «Borrar», y la fila
sigue ahí. Sin Service Worker la fila desaparece.

La red lo explica. Tras el `DELETE`, la página vuelve a pedir su `data` (SDD-68 §4.8) y el
Service Worker lo contesta **desde su caché, sin ir al servidor**, con el `data` de antes del
borrado.

## 2. Causa

El Service Worker reconoce una pieza del runtime publicado por el prefijo `/_fudic/`, y la
guarda en la caché del runtime: primero caché, sin caducidad, porque la versión va en la URL y
los bytes no cambian nunca.

Pero bajo `/_fudic/` no vive solo el runtime. También el `data` de cada página
(`/_fudic/data/…`), las llamadas a funciones (`/_fudic/fn/…`) y la marca de uso
(`/_fudic/marker/…`). El primer `data` que pasa por el Service Worker se queda en esa caché para
siempre, igual que la respuesta de una llamada GET como la búsqueda: lo que contesta algo
distinto cada vez se sirve congelado.

## 3. Corrección

Una pieza del runtime es lo que está bajo el prefijo **y además** en el directorio de una
versión: `/_fudic/0.0.1-<huella>/core/…`. Una versión empieza por un dígito y ninguno de los
otros empieza así. La misma pregunta decide en los tres sitios que la hacían: al servir, al
depositar en el warm y al guardar lo que la página dice haber usado.

## 4. Criterios de aceptación

1. Una petición a `/_fudic/data/…`, a `/_fudic/fn/…` o a `/_fudic/marker/…` no la contesta la
   caché del runtime, y `keepRuntime` no la guarda.
2. Una pieza `/_fudic/<versión>/…` se sigue sirviendo y guardando como antes.
3. `/usuarios` con Service Worker: «Borrar» quita la fila.
