# SDD — Renderizado en el Service Worker

Especificación para portar al framework el prototipo de este repositorio.

Este documento existe para que una sesión nueva no tenga que redescubrir nada.
Todo lo marcado **[VERIFICADO]** está medido en navegador real (Chromium 151 y
WebKit 26.5, Playwright, sin mocks) y no debe volver a discutirse. Lo marcado
**[PROPUESTA]** es diseño a validar. Lo marcado **[ABIERTO]** requiere decisión
de Pedro antes de implementar.

> **Idioma.** La prosa va en castellano; **todo el código, identificadores,
> claves de configuración y nombres de cache van en inglés.** El prototipo de
> referencia está escrito en castellano por accidente de la sesión en que nació;
> el port al framework usa los nombres de este documento, no los suyos. La
> correspondencia está en §13.

---

## 1. Objetivo

Tres orígenes de renderizado para el mismo fuente:

| origen | cuándo | qué aporta |
|---|---|---|
| **Edge (SSR)** | primera visita a una plantilla | SEO, TTFB, LCP |
| **SSG** | rutas marcadas como estáticas | HTML precalculado, cero JS de ruta |
| **Service Worker** | visitas posteriores | render local, primer byte en 3-8 ms |

El fuente de una ruta es **uno solo**. El servidor lo importa como ESM; el SW lo
enlaza compilado. No hay dos implementaciones del mismo componente.

---

## 2. Restricciones de plataforma [VERIFICADO]

Estas no son opiniones. Están medidas y son la razón de que la arquitectura sea
la que es.

### 2.1 Lo que el Service Worker no puede hacer

| | Chromium 151 | WebKit 26.5 |
|---|---|---|
| `new Worker` dentro del SW | `undefined` | `undefined` |
| `new SharedWorker` dentro del SW | `undefined` | `undefined` |
| `import()` dinámico (install y runtime, SW clásico y módulo) | `TypeError: import() is disallowed on ServiceWorkerGlobalScope` | `TypeError: Dynamic-import is not available in Worklets or ServiceWorkers` |
| `importScripts()` **durante install**, incluso tras un `await` | ✔ | ✔ |
| `importScripts()` después de install | ✘ `NetworkError` | ✘ `NetworkError` |
| `new Function` / `eval` | ✔ | ✔ |

Consecuencia: **la carga perezosa por ruta dentro del SW sólo es posible con
`new Function`.** `importScripts()` obligaría a cargar todas las rutas de golpe
en el `install`, lo cual es inaceptable con 100 rutas.

### 2.2 El Web Worker no sirve para renderizar durante una navegación

Un Worker dedicado pertenece a su documento y muere con él. El render se pide
justo cuando la navegación está destruyendo ese documento. Medido con tres
variantes distintas:

- **Stream transferido** (`structuredClone` con `transfer`): llega el primer byte
  (203 de 724) y el stream **nunca cierra**. La navegación se queda colgada
  indefinidamente. No es "HTML truncado": es un spinner eterno.
- **Chunks `ArrayBuffer`** en vez de transferencia: idéntico.
- **Drenando el stream entero en el SW antes de responder** (para que el WW se
  vacíe con su documento aún vivo): funciona en la cadena home→ruta (4/4 en
  ambos motores) pero **falla en la cadena ruta→ruta en WebKit, 0/5**. La causa
  no es el `import()`: en WebKit un `fetch()` desnudo desde el WW durante el
  unload devuelve `TypeError: Load failed`. **A la red del WW se le corta el
  grifo en cuanto su documento empieza a descargarse.** Chromium lo tolera;
  WebKit no.

Descartado también el **SharedWorker** (sobreviviría a la navegación) por
decisión de producto: Baseline 2026, riesgo de soporte inaceptable.

**El SW no pertenece a ningún documento.** Es dueño de la `Response` de principio
a fin y puede seguir emitiendo después de que la navegación haga commit. Por eso
el render vive ahí y no en un worker.

### 2.3 CSP: contextos independientes

`new Function` exige `script-src 'unsafe-eval'`. **El Service Worker no hereda la
CSP del documento.** Verificado en las dos direcciones y con tres variantes:

```
document: default-src 'self'; script-src 'self'   ->  ✘ new Function  ✘ eval
/sw.js with no CSP header of its own              ->  ✔ new Function  ✔ eval
/sw.js with script-src 'self' 'unsafe-eval'       ->  ✔ new Function  ✔ eval
/sw.js with default-src 'self' 'unsafe-eval'      ->  ✔ new Function  ✔ eval
```

La política viaja con cada respuesta y gobierna sólo el realm que crea. **Se
puede dar `unsafe-eval` exclusivamente a `/sw.js` manteniendo los documentos
estrictos.** Aunque la variante sin cabecera funciona, hay que ponerla explícita:
"sin política" es permisivo por accidente, no por decisión.

Dos cosas más, importantes:

- **Las páginas que renderiza el SW también necesitan la cabecera CSP.** Si el SW
  construye la `Response` sin ella, esa página sale sin política ninguna aunque
  el edge sí la ponga. Fue un fallo real del prototipo. La CSP debe viajar en el
  manifest y aplicarla los dos lados.
- **`style-src` necesita `'unsafe-inline'`** porque los `<style>` dentro de un
  shadow root declarativo son estilos inline a efectos de CSP. Es el peaje de
  hacer DSD con CSP estricta. Documentarlo antes de que lo descubra una auditoría.

Válvula de seguridad: el SW comprueba en arranque si puede evaluar
(`try { new Function('return 42')() } catch`). Si no puede, se declara inútil y
no intercepta nada — la app degrada a SSR en vez de romperse.

### 2.4 Declarative Shadow DOM

Como el SW responde a una **navegación real**, el HTML lo procesa el parser del
navegador y `<template shadowrootmode>` se materializa nativamente. **No hace
falta `setHTMLUnsafe` ni `parseHTMLUnsafe`** (Baseline 2025), ni Navigation API.
Ésta es la razón principal para preferir render-en-SW sobre navegación SPA.

### 2.5 La decisión de interceptar es SÍNCRONA

`respondWith()` sólo puede llamarse durante el dispatch del evento. La regla es:

> **Sólo se llama a `respondWith()` cuando el SW va a renderizar de verdad.**
> En cualquier otro caso, `return` y no se toca la petición.

Interceptar para luego reemitir con `fetch(request)` **duplica la petición del
documento**. Fue un fallo real del prototipo, visible en el panel de Network como
dos filas para la misma URL.

Corolario: todo lo necesario para decidir (manifest, qué plantillas están en
cache) tiene que vivir **en memoria** del SW. Tras un reciclado (~30 s de
inactividad) el SW vuelve con la memoria vacía; se rehidrata desde su propia
cache, sin red, y hasta que termina, esa primera navegación va al servidor.

---

## 3. Arquitectura

```
1st visit to a template     browser ──► server (SSR)  or  prerendered SSG HTML
                                        │
                            main.js registers the SW and tells it where it is
                                        │
                            SW: install = shell · warms THAT template
                                        │
rest of the pages of        browser ──► SW ──► link chunk (new Function)
that template                                  fetch data
                                                emit stream
```

Piezas:

- **Compiler (plugin de Vite).** `src/` es fuente único. Emite (a) los módulos en
  formato enlazable por el SW, (b) `manifest.json`, (c) `sw.js` con el build id
  inyectado.
- **Server.** No tiene ninguna ruta cableada: lee el manifest y resuelve el
  pathname con el mismo algoritmo que el SW. Importa el fuente ESM de `src/`.
- **Service Worker.** Enlazador + render + cache.
- **`main.js`.** Registra el SW y le dice en qué URL está el usuario. Nada más:
  no crea workers, no crea canales, no entrega el manifest.

**No existe `index.html`.** La home es una ruta del manifest como cualquier otra.
Cualquier página que reciba trato especial es una chapuza que acabará divergiendo.

---

## 4. `sw.json` — configuración de la aplicación

Lo escribe el desarrollador de la aplicación. Define **el shell y las políticas
de cache por clase de recurso**. No define rutas: eso es de cada página (§5).

**Si `sw.json` no existe, no se genera Service Worker y todo es SSR/SSG.** Es una
decisión explícita, no un defecto silencioso.

### 4.1 Forma [PROPUESTA]

```json
{
  "shell": [
    "/style.css",
    "/main.js",
    "/fonts/inter.woff2"
  ],
  "resources": {
    "assets": {
      "pattern": "/assets/**",
      "policy": "cache-first",
      "ttl": null,
      "maxEntries": 200
    },
    "images": {
      "pattern": "/img/**",
      "policy": "stale-while-revalidate",
      "ttl": "7d",
      "maxEntries": 60
    },
    "api": {
      "pattern": "/api/**",
      "policy": "network-first",
      "ttl": "5m"
    }
  },
  "dev": "off"
}
```

- `shell` — lo que el `install` precachea. **Nada más.** Ni un chunk de ruta.
  El manifest se añade solo: el SW lo necesita para funcionar.
- `resources` — clases de recurso con su política. El primer patrón que casa
  gana; el orden del objeto es el orden de evaluación.
- `policy` — `cache-first` · `network-first` · `stale-while-revalidate` ·
  `network-only`.
- `ttl` — `null` = sin caducidad. Formato `30s` · `5m` · `2h` · `7d`.
- `maxEntries` — poda LRU. Sin él, una cache de imágenes crece sin límite.
- `dev` — `off` · `preview`. Ver §8.

### 4.2 Lo que `sw.json` NO controla

Las cuatro caches del framework tienen política fija porque la arquitectura
depende de ellas:

| Cache | Contenido | Política | Por qué es fija |
|---|---|---|---|
| `shell-<build>` | lo de `sw.json.shell` + `manifest.json` | permanente | mientras viva el SW, el shell tiene que estar |
| `routes-<build>` | chunks de ruta y componentes | permanente, sin caducidad | son inmutables dentro de un build; caducarlos no tiene sentido |
| `pages-<build>` | HTML de rutas SSG | permanente | mismo argumento |
| `data-<build>` | respuestas de `load()` | **la define la ruta** (§5) | es lo único que cambia con el tiempo |

Sólo los **datos** tienen TTL, y el TTL lo pone quien conoce el dato: la ruta.

---

## 5. Estrategia por ruta — la función en `@code`

Configurar 100 rutas en un único `sw.json` obliga a todos los desarrolladores a
converger en un fichero. La estrategia se declara **en la propia página**, en su
sección `@code`. El compilador la extrae y la vuelca al manifest; el servidor la
lee de ahí.

### 5.1 Forma [PROPUESTA]

```js
@code
  import { strategy } from '@framework';

  strategy({
    mode: 'sw',                                  // 'ssr' | 'ssg' | 'sw'
    data: { ttl: '5m', policy: 'cache-first' }
  });

  export async function* render(data, ctx) { … }
@end
```

**Si no se llama a `strategy()`, la ruta es `ssr`.** El defecto es el
comportamiento actual de cualquier framework SSR: nadie tiene que hacer nada para
seguir como está.

### 5.2 Los tres modos

**`ssr`** (defecto) — siempre el servidor. El SW no la intercepta nunca. No se
descarga su chunk. Para páginas con datos por petición, sesión o permisos.

**`ssg`** — el HTML se precalcula en build. El SW cachea **el HTML**, no el
chunk: una ruta SSG cuesta **cero JavaScript de ruta**. Sirve de `pages-<build>`
y no toca `routes-<build>` jamás. Es la estrategia más barata y debe ser la
recomendada por defecto para contenido que no cambia por usuario.

**`sw`** — render local. El SW enlaza el chunk, pide los datos y emite el stream.
Es lo que aporta el primer byte en 3-8 ms. Requiere que el chunk y sus `deps`
estén en `routes-<build>`; mientras no lo estén, esa navegación la sirve el
servidor y la plantilla se calienta por detrás.

### 5.3 Contrato de `render()` [PROPUESTA — cambio respecto al prototipo]

```js
export async function* render(data, ctx)
```

`ctx` en vez del `origin: string` del prototipo:

```js
ctx = {
  origin: 'edge' | 'sw' | 'ssg',
  url,          // URL completa
  params,       // { slug: 'hello-world' }
  strategy,     // la declarada, ya resuelta
}
```

El mismo generador tiene que servir para los tres orígenes. Si una página
necesita saber dónde se está ejecutando, es por `ctx.origin`, nunca por detección
de entorno.

---

## 6. Manifest — el contrato entre compilador, servidor y SW

Lo emite el compilador. Lo leen el servidor y el SW. **Nadie más escribe rutas.**

```json
{
  "build": "a3f9c1",
  "csp": {
    "document": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; object-src 'none'; base-uri 'self'",
    "sw": "default-src 'self'; script-src 'self' 'unsafe-eval'"
  },
  "routes": [
    {
      "pattern": "/blog/:slug",
      "mode": "sw",
      "chunk": "/routes/blog.js",
      "deps": ["/components/badge.js", "/components/layout.js"],
      "data": "/api/load?slug=:slug",
      "dataPolicy": { "ttl": "5m", "policy": "cache-first" }
    },
    {
      "pattern": "/legal",
      "mode": "ssg",
      "html": "/_ssg/legal.html"
    },
    {
      "pattern": "/account",
      "mode": "ssr"
    }
  ]
}
```

Notas de diseño ya validadas en el prototipo:

- **`deps` va en orden topológico.** El `require()` del enlazador es síncrono, así
  que el SW necesita saber qué cargar antes que qué sin analizar el fuente.
- **`csp` vive aquí** para que servidor y SW no puedan divergir.
- **La unidad es la plantilla de ruta, no la página.** `/blog/:slug` con 5000
  slugs es **un** chunk. Visitar un solo post deja servidos por el SW todos los
  demás.

---

## 7. El enlazador del SW

Lo que el navegador hace con ESM, hecho a mano, porque `import()` está prohibido.

### 7.1 Formato que emite el compilador

```js
// source (src/routes/blog.js)
import { header } from '../components/layout.js';
export async function* render(data, ctx) { … }

// emitted (dist/routes/blog.js)
const {header} = require("/components/layout.js");
async function* render(data, ctx) { … }

exports.render = render;
```

Cualquier forma de `import`/`export` no soportada debe ser **error duro de
compilación**, nunca un silencio que se manifieste en runtime dentro de un
`new Function`.

### 7.2 Enlazado

```js
const modules = new Map();   // GLOBAL to the SW

async function load(url) {
  if (modules.has(url)) return modules.get(url);
  const source = await (await fromCache(ROUTES, url)).text();
  const exports = {};
  modules.set(url, exports);             // before running: supports cycles
  new Function('exports', 'require', `${source}\n//# sourceURL=${url}`)
    (exports, (dep) => {
      const mod = modules.get(dep);
      if (!mod) throw new Error(`unlinked dependency: ${dep}`);
      return mod;
    });
  return exports;
}
```

- `modules` es **global al SW**: un componente usado por 50 rutas se compila una
  vez. Esto es lo que evita la duplicación de componentes entre chunks.
- `//# sourceURL` es obligatorio: sin él, DevTools muestra el código como anónimo
  y depurar es inviable.
- El registro se pierde al reciclarse el SW y se reconstruye desde cache, sin red.

---

## 8. Modo desarrollo [ABIERTO — decisión de Pedro]

El problema es real: con Vite, cada cambio produce un build nuevo, y un SW que
cachea agresivamente sirve código viejo.

Hay una dificultad de fondo que conviene ver antes de elegir: **el servidor de
desarrollo de Vite sirve ESM sin transformar**, y el enlazador del SW necesita el
formato `exports`/`require`. En dev, o el plugin emite también esa versión por un
middleware, o el camino del SW sencillamente no existe.

### Opción A — SW apagado en dev (recomendada)

`main.js` no registra el SW cuando `import.meta.env.DEV`. Todo es SSR/SSG.

- **A favor:** cero problemas de invalidación. HMR intacto. Es lo que hacen
  SvelteKit, Next y Nuxt.
- **En contra:** el camino del SW no se ejerce hasta `vite preview` o producción.
- **Mitigación:** `"dev": "preview"` en `sw.json` para activarlo bajo demanda.

### Opción B — SW activo con invalidación por build id

Todas las caches llevan el build id en el nombre: `routes-a3f9c1`. En `activate`
se borra toda cache cuyo build id no sea el actual.

- El plugin inyecta el build id en `sw.js`, así que **el contenido de `sw.js`
  cambia en cada compilación** → el navegador detecta actualización → install →
  activate → purga. Es el mecanismo estándar y funciona.
- Requiere `/sw.js` servido con `no-cache` y
  `register(url, { updateViaCache: 'none' })`.
- **En contra:** cada cambio purga y recalienta todo; en dev eso es ruido
  constante y un reload extra por el `skipWaiting`/`claim`.

### Opción C — SW activo, sólo el shell cacheado

En dev, `routes-*` y `pages-*` pasan a `network-only`; el enlazador sigue
ejercitándose pero sin persistencia.

- **A favor:** se prueba el camino del SW sin cache obsoleta.
- **En contra:** no se prueba lo que más falla, que es precisamente la cache.

**Recomendación: A por defecto, con B disponible vía `sw.json.dev`.** El build id
en el nombre de las caches hay que implementarlo igualmente, porque en producción
resuelve el mismo problema.

---

## 9. Requisitos del servidor

1. **Ninguna ruta cableada.** Lee el manifest, resuelve con el mismo algoritmo
   que el SW, importa el fuente ESM de `src/`.
2. **La CSP sale del manifest**, no de una constante propia. Los documentos con
   `csp.document`; `/sw.js` —y sólo `/sw.js`— con `csp.sw`.
3. **Cabeceras de cache.** `sw.js` y `manifest.json` con `no-cache`: gobiernan las
   actualizaciones. El resto de estáticos con cache real. Sin esto, el precache
   del `install` vuelve a bajar de red lo que el documento acaba de pedir. En el
   prototipo, `no-cache` en todo era la causa de descargas duplicadas.
4. **No sirve ni un HTML de disco.** Todas las páginas se emiten.

---

## 10. Reglas de carga — no negociables

Estas nacen de fallos reales del prototipo. Cada una tiene una regresión detrás.

1. **El `install` precachea el shell y nada más.** Ni un chunk de ruta. Con 100
   rutas, precargarlas todas es inaceptable.
2. **Un solo disparador de calentado.** El prototipo tenía dos —`activate` y el
   mensaje del documento— y ninguno esperaba al otro: los dos fallaban la cache y
   **cada chunk se descargaba dos veces**.
3. **Deduplicación de peticiones en vuelo.** Un `Map<url, Promise>` en la función
   de acceso a cache. Dos llamadas concurrentes a la misma URL comparten una
   petición de red; cada llamante recibe su propio `clone()` del cuerpo.
4. **`respondWith()` sólo cuando se va a renderizar** (§2.5).
5. **No se cachea HTML de rutas `ssr` ni `sw`.** Se emite. Sólo el HTML de SSG
   vive en cache.

Primera visita a `/blog/streams`, en frío, con estas reglas:

```
document           server
style.css          the document   } install repeats them,
main.js            the document   } but they come from the HTTP cache
sw.js              registration
manifest.json      install
badge.js           warming the template   once
layout.js          warming the template   once
blog.js            warming the template   once
```

Las siguientes páginas de `/blog/:slug` no piden nada más que su JSON de datos —
y si el TTL no ha vencido, ni eso.

---

## 11. Alternativas descartadas, con la evidencia

Están aquí para que no vuelvan a proponerse.

| Alternativa | Por qué no |
|---|---|
| Renderizar en un Web Worker | Muere con su documento. La navegación se cuelga para siempre; en WebKit ni siquiera puede hacer red durante el unload. §2.2 |
| SharedWorker como host de render | Sobreviviría, pero es Baseline 2026. Riesgo de soporte rechazado por producto. |
| Navegación SPA aplicando HTML con `setHTMLUnsafe` | Baseline 2025, y `innerHTML` no materializa DSD. El render en SW no necesita ninguna API nueva. §2.4 |
| `importScripts()` para cargar rutas | Sólo funciona durante `install`: obliga a cargar las 100 rutas de golpe. §2.1 |
| Precargar todos los chunks en el `install` | Mismo problema. §10.1 |
| Cachear el manifest con un `fetch` en cada arranque del SW | Innecesario: va en el precache del shell y se relee de cache sin red. |
| `index.html` como fichero estático | Convierte la home en un caso especial que diverge del resto. La home es una ruta más. §3 |

---

## 12. Decisiones pendientes [ABIERTO]

1. **Modo dev** (§8). A / B / C.
2. ~~Idioma de la API pública~~ — **resuelto: inglés**, en todo el código.
3. **`ctx` en `render()`** (§5.3): confirma el cambio de firma respecto al
   prototipo, que pasa `origin: string`.
4. **Poda de caches.** `maxEntries` con LRU necesita llevar cuenta de accesos; la
   Cache API no la da. ¿Se acepta una entrada de índice en IndexedDB, o basta con
   un FIFO por orden de inserción?
5. **Revalidación de datos con `stale-while-revalidate`.** ¿El SW emite el HTML
   con el dato caducado y refresca por detrás, o espera? Afecta a si una página
   puede renderizarse con datos viejos.
6. **Qué pasa si un chunk falla al enlazar en producción.** El prototipo cae al
   servidor con el motivo en una cabecera. ¿Se mantiene, se registra en algún
   sitio, se desactiva esa ruta para el resto de la sesión?

---

## 13. Estado del prototipo, y correspondencia de nombres

`c:\Users\Home\Downloads\stream`. Funciona y es la referencia de
**comportamiento**, no de nomenclatura.

```
compilar.mjs        compiler: src/ -> public/ + manifest (routes declared here)
server.mjs          edge, no hardcoded routes; CSP and cache-control
src/comp/*.js       shared components (ESM source)
src/routes/*.js     route templates, home included (panel.js)
public/sw.js        linker + render + cache
public/main.js      SW registration and location notice
```

Correspondencia con los nombres de este documento:

| prototipo | framework |
|---|---|
| `manifest.rutas` | `manifest.routes` |
| `patron` | `pattern` |
| `datos` | `data` |
| `pedir()` | `require()` |
| `modulos` | `modules` |
| `cargar()` | `load()` |
| `desdeCache()` | `fromCache()` |
| `calentar()` | `warm()` |
| `listaParaServir()` | `readyToServe()` |
| `resolver()` | `resolve()` |
| `PUEDE_ENLAZAR` | `CAN_LINK` |
| `DISPONIBLES` | `AVAILABLE` |
| `enVuelo` | `inFlight` |
| cache `shell-v1` | `shell-<build>` |
| cache `rutas-v1` | `routes-<build>` |
| cache `datos-v1` | `data-<build>` |
| `src/comp/` | `src/components/` |
| `estilo.css` | `style.css` |
| `origen` en `render()` | `ctx.origin` |

Lo que ya está resuelto en el prototipo y debe portarse tal cual: el enlazador, la
regla de `respondWith` síncrono, la deduplicación en vuelo, el disparador único de
calentado, la CSP en el manifest aplicada por los dos lados, y el trato uniforme
de la home.

Lo que **no** está en el prototipo y hay que construir: `sw.json`, la función
`strategy()` por ruta, el modo `ssg`, los TTL de datos, la poda de caches, el
build id y el modo desarrollo.
