# BUG-47 · El navegador recibe código del servidor y un runtime que no se renueva

> **Estado:** `Listo` — causas confirmadas sobre el código el 2026-10-13, al cerrar SDD-56 con
> la prueba de `/usuarios` (ver [BUG-47-Task.md](./BUG-47-Task.md)).
> **Corrige:** [SDD-56](../SDD-56-funciones-de-servidor.md) §3.4 y §4.5 («la mitad `.server`
> nunca sale del servidor») · [SDD-34](../SDD-34-forms-compilador.md) §4.7 (el cuerpo de
> `serverValidator`) · [SDD-45](../SDD-45-runtime-publicado.md) §3.1 y §3.3 (la URL de una pieza
> del runtime)
> **Paquetes:** `@fudic/vite`
> **Rango:** ninguno — no hay diagnóstico nuevo.
> **Rama sugerida:** `bug/47-servidor-y-runtime`, desde `main` una vez fusionada `sdd/http`.

---

## 1. Contexto y síntoma

Dos defectos que se ven en el mismo sitio, lo que el navegador descarga, y se arreglan en el
mismo paquete.

**A. Código del servidor en el bundle de cliente.** En `examples/basic`, tras `pnpm build`:

- `dist/assets/auth-<hash>.js` contiene `services/tokens.ts` entero: la clase `Tokens`, su
  `verify`, la tabla de usuarios y el texto `token desconocido`. Es justo lo que la mitad
  `.server(…)` de `auth` usaba y lo que SDD-56 promete que no sale del servidor.
- Los mapas de fuente publicados llevan en `sourcesContent` el texto original de los módulos a
  los que se les borró algo: `auth.ts` con su mitad `.server` completa, `tokens.ts`,
  `person.form.ts` con el cuerpo de su `serverValidator` y `data/people.ts`. Con
  `build.sourcemap: true`, que el ejemplo tiene, cualquiera los lee en DevTools.

**B. Un runtime viejo después de un build nuevo.** Las piezas del runtime se publican en
`/_fudic/<version>/<paquete>/<pieza>.js`, y la caché del Service Worker se llama
`fudic-runtime-<version>`. Mientras se desarrolla el framework la versión no cambia
(`0.0.1`), así que un cambio en `@fudic/dom` o `@fudic/core` llega con la misma URL. El Service
Worker, y el navegador mientras la tenga, siguen sirviendo la pieza antigua. Así se vio
durante SDD-56: `W.textAt is not a function` con un build que ya traía `textAt`.

## 2. Causa raíz

### 2.1. El borrado deja las imports, y Rollup no quita un módulo con efectos

[server-halves.ts:62](../../../packages/vite/src/server-halves.ts#L62) y
[server-validators.ts:90](../../../packages/vite/src/server-validators.ts#L90) sustituyen el
argumento de cada `.server(x)` y de cada `serverValidator(x)` por `undefined`. No tocan las
imports, y confían en que Rollup quite las que se quedan sin uso.

Eso solo pasa cuando el módulo importado no tiene efectos al cargarse. `tokens.ts` termina con
`Service(Tokens)`, que registra la clase en el contenedor: es un efecto de nivel superior, y
Rollup conserva el módulo entero aunque nadie use `Tokens`. Lo mismo le pasa a cualquier módulo
de servidor real: un cliente de base de datos que conecta al importarse, un
`dotenv.config()`, un servicio con `@Service`.

### 2.2. El transform de borrado no da mapa, y el original entra entero

[plugin.ts:1393](../../../packages/vite/src/plugin.ts#L1393) devuelve
`{ code: erased, map: null }`. Para Rollup, un `map: null` es una transformación sin mapa, y
el mapa final apunta al fichero original con su texto completo en `sourcesContent`. Borrar el
argumento en el código no lo borra del mapa.

### 2.3. La URL de una pieza se identifica por versión, no por contenido

[runtime-pieces.ts:192](../../../packages/vite/src/runtime-pieces.ts#L192) escribe
`/${RUNTIME_DIR}/${version}/${short}/${piece}.js` con la `version` del `package.json`, y
[runtime-link.ts:331](../../../packages/vite/src/runtime-link.ts#L331) saca de ese segmento el
nombre de la caché. Dos builds con bytes distintos y la misma versión comparten URL y caché.

**Alcance.** Toda pieza publicada, de todo paquete que declare `fudic.runtime`, y toda
aplicación del mismo origen, porque la caché del runtime es compartida (SDD-45 §3.1).

## 3. Interfaz pública

No cambia ninguna firma pública. Cambia la forma de una URL:

- La pieza pasa a `/_fudic/<version>-<huella>/<paquete>/<pieza>.js`. `<huella>` son los 8
  primeros hex del SHA-256 del runtime del paquete: los nombres de sus ficheros `.js`
  ordenados, y los bytes de cada uno. Es por paquete y no por pieza, para que las piezas de un
  paquete, que se importan entre sí, cambien juntas.
- La caché del Service Worker se llama, por tanto, `fudic-runtime-<version>-<huella>` (de la
  pieza de `@fudic/core`, como hoy).

## 4. Comportamiento corregido

### 4.1. Lo que deja de usar el código borrado se va con él

Tras sustituir los argumentos, el mismo paso quita del módulo cada especificador de import cuyo
nombre local ya no aparece fuera de lo borrado. Si una declaración se queda sin especificadores,
se quita entera. Las que no tienen especificadores (`import './x'`) se quedan: son un efecto que
el autor pidió.

Así `tokens.ts` ni siquiera entra en el grafo del cliente desde `auth.ts`. Si otro módulo de
cliente lo importa, entra por ese camino, y eso es asunto de ese módulo.

Solo se quita lo que el código borrado usaba: un especificador que ya estaba sin usar antes del
borrado es del autor y se queda. Si lo que sobrevive son solo tipos en línea
(`{ Tokens, type User }` sin `Tokens`), la declaración pasa a `import type`: con
`verbatimModuleSyntax`, `import { type User } from 'x'` se conserva como `import 'x'` y el
módulo se cargaría igual por sus efectos.

### 4.2. Un módulo con algo borrado lleva en el mapa su texto borrado

*(Corregido tras la prueba de Pedro del 2026-10-14: con `null`, DevTools pide el fichero al
servidor, que no lo sirve, y muestra «Could not load content».)* El borrado **no recorta, deja
en blanco**: lo sustituido se rellena con espacios y conserva sus saltos de línea, así que nada
de lo que viene detrás cambia de línea ni de columna. En cada mapa de cliente, la entrada de
`sourcesContent` de toda fuente JS/TS pasa por el mismo borrado. El mapa sigue apuntando a sus
líneas, y el depurador muestra el fichero con la parte de servidor como líneas en blanco, igual
que el compilador muestra el `@server` de un `.fud`.

Se borra por **fuente** y no por el módulo que vio el transform: un paquete del workspace llega
como su `dist/*.js` con un mapa hacia su `.ts`, y el `.ts` es lo que nombra el mapa publicado.

Los módulos que solo alcanzaba lo borrado ya no están en el bundle (§4.1), así que tampoco
están en el mapa.

### 4.3. La URL de una pieza cambia cuando cambian sus bytes

Con la huella en el segmento de versión, un build con otro runtime publica en otra URL y en otra
caché. El barrido de cachés de SDD-45 (`sweepRuntimeCaches`) retira la antigua cuando caducan
sus marcas, sin cambios. Dos aplicaciones con el mismo runtime siguen pidiendo los mismos bytes
a la misma URL, que es lo que SDD-45 §3.1 protege.

### 4.4. Los chunks del Service Worker borran igual

*(Añadido al implementar, decisión de Pedro del 2026-10-14.)* El pase de enlace, que construye
los chunks que el Service Worker enlaza a mano, es un build aparte con su propio plugin y no
borraba nada: en `examples/basic` el chunk de `/formularios` llevaba `aliasTaken`, la consulta
que solo corre con `{ server: true }`. Ese pase aplica ahora el mismo borrado (§4.1) a todo
módulo JS/TS, y sus mapas se vacían como los del build principal (§4.2), con un único registro
de módulos borrados compartido por los dos.

### 4.5. Las piezas se importan por la URL con huella

*(Añadido al implementar, decisión de Pedro del 2026-10-14.)* El build de runtime de cada paquete
hornea en sus `.js` las URLs de sus hermanas con la versión sola
(`/_fudic/0.0.1/dom/browser.js`). Copiadas al segmento con huella, la segunda pieza daría 404.
Al copiar, cada pieza reescribe `/_fudic/<version>/<paquete>/` por el segmento con huella de ese
paquete.

La huella de un paquete se calcula sobre sus bytes originales **y** sobre las huellas de los
paquetes a cuyas piezas apuntan, en cierre transitivo. Si cambia `@fudic/dom`, cambian los bytes
reescritos de `@fudic/core`, y su URL tiene que cambiar con ellos: si no, la misma URL serviría
bytes distintos.

### 4.6. Los middlewares de `@fudic/http` también se borran

*(Añadido tras la prueba de Pedro del 2026-10-14.)* La marca del borrado de `.server(…)` es
importar de `@fudic/http`. Los middlewares del propio paquete (`csrf`) importan `middleware` por
ruta relativa, así que no la llevaban, y su mitad de servidor viajaba en el bundle de toda app
que los pusiera en su cadena. Un módulo que pertenece a `@fudic/http` (por el `name` del
`package.json` más cercano) se borra sin necesitar la marca.

## 5. Invariantes

- Lo que solo usa la mitad de servidor de un módulo no aparece en el JS publicado ni en su mapa.
  Esto vale para `.server(…)` y para `serverValidator(…)`.
- El borrado sigue pasando solo fuera del SSR. El grafo SSR del dev server y el pase edge
  conservan las dos mitades.
- La URL de una pieza identifica sus bytes: misma URL, mismos bytes, en cualquier build.

## 6. Criterios de aceptación

Cada uno con un test que falle antes del cambio.

1. **Import huérfana.** Un módulo de middleware que importa `{ Tokens }` de un fichero con
   efecto al cargarse (`Service(Tokens)`) y solo lo usa en `.server(…)`: tras el borrado, el
   código no contiene esa import. Lo mismo con `serverValidator(…)` y un import usado solo
   dentro.
2. **Import compartida.** Si el nombre también se usa fuera de lo borrado, la import se queda.
   Un especificador huérfano se quita y el resto de la declaración se conserva. `import './x'`
   se queda.
3. **Build real.** En un proyecto con `auth.ts` (de dos mitades) y `tokens.ts` (con
   `Service(Tokens)`), el JS de cliente no contiene ningún texto de `tokens.ts`.
4. **Mapas.** En ese build, con `sourcemap: true`, ningún mapa de cliente lleva en
   `sourcesContent` la mitad de servidor de `auth.ts` ni el cuerpo del `serverValidator` de un
   formulario: su entrada es el texto borrado, con el mismo número de líneas que el original, y
   su `sources` sigue apuntando al fichero. Un módulo sin nada borrado conserva su texto.
5. **URL por contenido.** Dos runtimes del mismo paquete y la misma versión con un byte de
   diferencia dan URLs distintas. Con los mismos bytes dan la misma URL, también en dos
   proyectos.
6. **Caché.** El nombre de la caché del Service Worker sale del segmento nuevo, y una caché de
   otra huella con las marcas caducadas se barre.
7. **De punta a punta.** En `examples/basic`: `pnpm build`, cambiar un byte del runtime de
   `@fudic/dom`, volver a construir. La URL de `dom/browser.js` cambia y la página nueva la pide
   sin limpiar nada en el navegador. Lo comprueba Pedro en el navegador, con el Service Worker
   activo.
8. `pnpm typecheck`, `pnpm test` y `pnpm build` en verde. Lo nuevo al 100 % en las cuatro
   métricas, y `@fudic/vite` sin bajar de su suelo de `main`.

Añadidos al implementar (§4.1, §4.2, §4.4, §4.5, §4.6):

9. **Solo tipos.** `import { Tokens, type User }` con `Tokens` solo en lo borrado queda como
   `import type { User }`, y el JS de cliente no carga el módulo.
10. **Chunks del Service Worker.** En un build con Service Worker, el chunk enlazado de una
    página que importa un formulario con `serverValidator` no contiene lo que solo usaba el
    validador, y su mapa lleva el texto borrado en la entrada del formulario.
11. **Segundo salto.** Toda URL `/_fudic/…` que nombra una pieza copiada existe en el `dist`
    con huella, y cambiar un byte de `@fudic/dom` cambia también la URL de las piezas de
    `@fudic/core`.
12. **Middlewares del framework.** Con `csrf` en la cadena global, el JS de cliente no contiene
    su mitad de servidor (`sec-fetch-site`, `cross-site request`), ni la contiene la entrada de
    `csrf.ts` en el mapa.
13. **Depurable.** Lo borrado se deja en blanco: el código borrado tiene las mismas líneas que
    el original, y lo que va detrás de un borrado conserva su línea y su columna.
14. **En dev.** El servidor de dev sirve `@fudic/http/dist/csrf.js` con su mitad de servidor
    borrada, y su mapa lleva en `sourcesContent` el `csrf.ts` borrado. En el grafo SSR del
    mismo servidor, `csrf` conserva las dos mitades.

## 7. Fuera de alcance

- **Las piezas publicadas en dev.** El servidor de dev no copia piezas a `/_fudic/`. *(El
  borrado sí corre en dev desde la prueba de Pedro del 2026-10-14: el transform de cliente ya
  borraba, y el `dist/*.js` de un paquete del workspace se borra al cargarse, código y texto
  de su mapa a la vez, porque en dev nadie vacía el mapa después. Criterio 14.)*
- **Los mapas del pase edge y del prerender.** No se publican (BUG-09), y deben conservar el
  texto: son los que se leen cuando falla un `load`.
- **Avisar de un módulo de servidor importado desde código de cliente.** Si el autor importa
  `tokens.ts` en un `@client`, eso no es un borrado fallido. Sería un diagnóstico nuevo, y no es
  este bug.
- **Cambiar la versión de los paquetes en cada build.** La huella resuelve lo mismo sin tocar
  `package.json`.
