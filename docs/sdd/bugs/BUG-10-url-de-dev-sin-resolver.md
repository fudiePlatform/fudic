# BUG-10 — Las URL de dev solo existen para el middleware, y el pre-transform de Vite no lo sabe

> **Estado:** `Hecho`
> **Corrige:** [SDD-19 — Plugin de Vite](../SDD-19-plugin-vite.md) §4.10 y
> [SDD-20 — Render en el Service Worker](../SDD-20-render-sw.md) §4.11
> **Paquete:** `@fudic/vite`
> **Rama sugerida:** ninguna — cambio de una función, aterriza en `main`
> **Depende de:** nada. No comparte fichero con ningún BUG abierto.

---

## 1. Contexto y síntoma

Arrancar el ejemplo en dev y pedir cualquier página deja un error en la consola:

```sh
cd examples/basic && pnpm dev
curl -s -o /dev/null -H 'accept: text/html' http://localhost:5173/
#=> 8:27:56 [vite] (client) Pre-transform error: Failed to load url /fudic-main.js
#=>          (resolved id: /fudic-main.js). Does the file exist?
```

Y sin embargo **la aplicación funciona**: la página se sirve, el script se descarga con su
contenido correcto —`export {};`, que es lo que el bootstrap del hilo principal debe ser en
dev sin Service Worker ([`plugin.ts:410`](../../../packages/vite/src/plugin.ts#L410))— y
toda la navegación va. Ese contraste es el síntoma entero: **un error que no rompe nada es
peor que uno que sí**, porque el que lo lee aprende a ignorar el canal donde aparece. El día
que el bootstrap falle de verdad —un `dist` de `@fudic/transport` sin construir, un alias
mal puesto— el fallo saldrá por esta misma línea y será indistinguible del ruido.

Reproducción mínima, sin ejemplo y sin navegador: `server.transformRequest('/fudic-main.js')`
sobre un servidor de dev del plugin lanza con ese mensaje exacto.

---

## 2. Causa raíz

### 2.1. Hay dos caminos hacia `/fudic-main.js` y solo uno estaba cubierto

La página emitida referencia el bootstrap **literalmente**, como exige que su nombre sea
estable ([`plugin.ts:122`](../../../packages/vite/src/plugin.ts#L122)):

```html
<script type="module" src="/fudic-main.js"></script>
```

En dev esa URL **no es un fichero**. La sirve el middleware de
[`plugin.ts:178-205`](../../../packages/vite/src/plugin.ts#L178-L205), que la busca en un
mapa URL → id virtual y llama a `transformRequest(MAIN_ID)`. Ese es el camino del
**navegador**, y por eso la app funciona.

El otro camino es el de Vite. En
[`plugin.ts:263`](../../../packages/vite/src/plugin.ts#L263) pasamos el HTML por
`server.transformIndexHtml(...)` —hace falta: es lo que inyecta el cliente de HMR—. El
`devHtmlHook` de Vite recorre ahí cada `<script type="module" src>` y **precalienta** su URL
(`processNodeUrl` → `preTransformRequest` → `warmupRequest`, en
`vite/dist/node/chunks/node.js` de Vite 8.0.16). Un warmup entra **directo al pipeline de
módulos**: no pasa por los middlewares de connect, que es exactamente donde vivía la única
traducción de esa URL.

### 2.2. La línea

El `resolveId` del plugin ([`plugin.ts:395-403`](../../../packages/vite/src/plugin.ts#L395-L403),
las líneas que este BUG corrige) reconocía los **ids virtuales** (`\0fudic-main`,
`\0fudic-sw`, los wrappers) y nada
más. Con `/fudic-main.js` devolvía `null`, `vite:resolve` intentaba `root/fudic-main.js`, no
existía, y `warmupRequest` capturaba el fallo y lo loggeaba tal cual:

```js
async warmupRequest(url) {
  try { await transformRequest(this, url, { skipFsCheck: true }) }
  catch (e) { … this.logger.error(buildErrorMessage(e, [`Pre-transform error: ${e.message}`], false), …) }
}
```

El middleware sabía traducir la URL; el resolutor no. La misma información, en un solo sitio.

### 2.3. Alcance

- **`/fudic-main.js`** es la única URL que lo dispara hoy, porque es la única que aparece en
  el HTML como `<script type="module" src>`.
- **`/fudic-sw.js`** comparte la causa —también es solo del middleware— y no se manifiesta
  por un accidente: un Service Worker se registra pasando la URL como **string** a
  `navigator.serviceWorker.register(...)`, y un string no es un import que Vite pueda
  precalentar. Se arregla igual, porque lo que estaba mal es que hubiera un solo consumidor
  del mapa, no que la segunda URL doliera.
- **`/fudic-routes.json`** no participa: no es un módulo JS, nadie lo precalienta.
- **No lo toca ningún otro BUG.** BUG-01…BUG-09 son de build; este solo existe en dev.

---

## 3. Interfaz pública

**Ninguna firma cambia.** No hay API nueva, ni opción nueva, ni código de diagnóstico nuevo:
el arreglo es que el `resolveId` del plugin conozca las mismas dos URL que ya conocía el
middleware. Lo que cambia es una **constante compartida**, interna al paquete:

```ts
/** URL estables de dev (con el base ya quitado) → el id virtual que se sirve en cada una. */
const DEV_SCRIPT_IDS: ReadonlyMap<string, string>;
```

`DEV_MAIN_URL` y `DEV_SW_URL` siguen siendo la fuente de esos nombres
([`constants.ts:18-19`](../../../packages/vite/src/constants.ts#L18-L19)); nada se escribe
dos veces.

---

## 4. Comportamiento corregido

### 4.1. La URL resuelve al mismo id que sirve el middleware

`resolveId('/fudic-main.js')` → `\0fudic-main`, y `resolveId('/fudic-sw.js')` → `\0fudic-sw`.
El `load` que ya existía hace el resto sin cambios. Un módulo, una identidad, los dos caminos
de acuerdo: el navegador y el warmup obtienen **el mismo código**, porque es literalmente la
misma llamada.

### 4.2. Solo en dev

En build esos dos nombres **sí son ficheros emitidos** —`fudic-main.js` es la entrada fijada
en [`plugin.ts:133-134`](../../../packages/vite/src/plugin.ts#L133-L134) y `fudic-sw.js` sale
de su propio build anidado (BUG-03)—, así que la traducción se aplica bajo `isDev` y el grafo
de Rollup queda exactamente como estaba. Esta guarda no es defensiva: es la afirmación de que
el defecto era **del servidor de dev**, no del plugin.

### 4.3. El `base` se normaliza en el punto de entrada

Las dos mitades ven la URL de forma distinta, y hay que aceptarlo en vez de elegir una:

- el **middleware** la recibe con el `base` puesto (`/app/fudic-main.js`), porque es lo que
  pide el navegador;
- el **warmup** la entrega con el `base` ya quitado, porque `preTransformRequest` hace
  `stripBase` antes de llamar.

`resolveId` normaliza con `pathnameOf(id, base)`, que es la misma función con la que el
middleware de rutas casa un pathname. Las dos formas caen en la misma clave.

### 4.4. Lo que se gana

El log del dev server vuelve a significar algo. No hay medición de tamaño en este BUG —no
cambia ni un byte de la salida— y esa es justamente la razón de escribirlo: el precio de
dejarlo era ir enseñando a no mirar los errores de dev.

---

## 5. Invariantes

**El que el bug violaba**

- *Una URL que el plugin publica la resuelve el plugin.* Publicar una URL por un middleware y
  no enseñársela al resolutor deja al servidor de dev con dos verdades sobre el mismo módulo,
  y la que falla es la que nadie ve venir.
- *El dev server no miente sobre sí mismo.* Un error permanente que no corresponde a ningún
  fallo es ruido que degrada todos los errores futuros.

**El que la corrección añade**

- **Todo nombre estable de dev vive en un mapa único, consumido por el middleware y por
  `resolveId`.** Añadir un tercer bootstrap significa añadir una entrada, no dos.

---

## 6. Criterios de aceptación

Tests en `packages/vite/test/dev.test.ts`, sobre un servidor de dev real.

1. **(rojo primero)** `server.transformRequest('/fudic-main.js')` lanza
   `Failed to load url` contra el código anterior al arreglo, y después devuelve el código
   del bootstrap (`export {};` sin Service Worker).
2. `server.transformRequest('/fudic-sw.js')` devuelve el bootstrap del worker (§2.3).
3. Una URL que no es un bootstrap —`/nope.js`— sigue cayendo al resolutor de Vite y sigue
   fallando: el mapa no se convierte en un comodín.
4. Los tests de dev que ya existían siguen verdes: el middleware sirve `/fudic-main.js` y
   `/fudic-sw.js` con sus cabeceras (`Service-Worker-Allowed`) y el manifest en su URL.
5. **Extremo a extremo:** `pnpm dev` en `examples/basic`, pedir las páginas, y el log **sin
   una sola línea de `Pre-transform error`**. Sin el arreglo, esa línea aparece siempre.

**Cobertura.** No baja la de `@fudic/vite` respecto a `main`.

---

## 7. Fuera de alcance

- **Dejar de llamar a `transformIndexHtml`.** Silenciaría el aviso quitando el cliente de
  HMR: cambiar el diagnóstico por la funcionalidad que lo produjo.
- **`server.preTransformRequests: false`.** Apagar el precalentado de *todo el proyecto* para
  callar un módulo es tratar el síntoma, y encima ralentiza el dev.
- **Servir los bootstraps como ficheros reales en dev.** Son módulos virtuales por diseño
  (SDD-19 §4.10); el arreglo es que el resolutor los conozca, no que dejen de serlo.
- **Registrar el Service Worker en dev.** Sigue siendo la opción A de SDD-20 §4.11.
- **El resto del comportamiento del middleware de dev** —endpoints de datos, render on
  demand, CSP— no se toca.
