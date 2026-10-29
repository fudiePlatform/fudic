# BUG-57 · `@fudic/http` no se publica como pieza, y `conventions` llega suelto al navegador

> **Estado:** `Hecho` — documentado mientras se arreglaba, a petición de Pedro. [tareas](./BUG-57-Task.md).
> **Corrige:** [SDD-45](../SDD-45-runtime-publicado.md) §3.3 (`@fudic/http` «es una fila más»,
> y no lo era).
> **Paquetes:** `@fudic/http` · `@fudic/vite` · `examples/pieces-bench`

---

## 1. Síntoma

En cada página que llama a su servidor, el navegador descargaba un `dist-<hash>.js` de unos
cuatrocientos bytes cuyo único contenido eran constantes de `@fudic/conventions`: el prefijo de
las funciones, el del `data`, el nombre del aviso de `data` viejo y el mensaje de invalidación.
Una petición más, con un nombre que no dice nada.

## 2. Causa

SDD-45 publica el runtime como piezas bajo `/_fudic/<versión>/`, y previó que `@fudic/http`
entraría «como una fila más» el día que existiera. Llegó con SDD-60 y no entró: el cliente de las
funciones se compilaba dentro de cada aplicación. Como lo usaban dos chunks distintos, el
bundler sacaba lo que comparten —las constantes de `conventions`— a un chunk propio.

Al publicarlo apareció un segundo defecto, latente: el fichero de middlewares del navegador vive
dentro de `@fudic/http` y lo carga la aplicación, e importa `@fudic/http/contract` por su nombre.
El plugin trataba ese import como interno del paquete y lo empaquetaba, de modo que habría una
segunda clase `HttpError` junto a la publicada, distinta para `instanceof`.

## 3. Corrección

1. `@fudic/http` declara su runtime y publica dos piezas:
   - `contract`: los stubs, `page`, los middlewares de cliente, los errores, los descriptores de
     tipo y el formato binario, que es el de casi todas las funciones. Reexporta el registro de
     `@fudic/forms/contract` por la URL de su pieza, sin copiarlo.
   - `json`: el formato JSON, solo para las funciones con `use json`. Toma de `contract` lo que
     comparten.
   Las constantes de `conventions` quedan dentro de la pieza.
2. Un paquete que se importa **a sí mismo** por su nombre cruza su propia superficie pública, y
   ese import se enlaza a su pieza aunque el fichero que lo hace viva dentro del paquete.
3. La comprobación de piezas da por buena, con su motivo, la mitad de servidor de `@fudic/http`,
   que nunca llega al navegador.

## 4. Criterios de aceptación

1. Ningún chunk de la aplicación de `examples/basic` (con y sin Service Worker) lleva código de
   `@fudic/http`, `@fudic/forms` ni `@fudic/conventions`, y no hay ningún `dist-*.js`.
2. `/_fudic/<versión>/http/contract.js` y `json.js` se copian al build y se sirven.
3. Un import de un paquete a sí mismo desde un fichero suyo se enlaza; el de un paquete a otro
   desde dentro de un publicador, no.
4. La comprobación de piezas no lista ningún valor de `@fudic/http` sin pieza.
5. Playwright entero en verde.
