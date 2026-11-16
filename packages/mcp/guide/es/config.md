# config

Los ficheros con los que un proyecto se declara: `fudic.json`, `sw.json` y los tres `.headers` de
una app — `page.headers`, `sw.headers` y `assets.headers`. Qué hace cada clave, qué admite, qué vale
cuando no se escribe, y qué hacer con cada diagnóstico de las cabeceras.

## fudic.json

En la raíz de cada app y cada librería. Todas las claves son opcionales; una clave que fudic no
conoce es `FUD0725`, y también lo es un valor con otra forma.

| Clave | Admite | Si falta | Para qué sirve |
|---|---|---|---|
| `id` | minúsculas, con guiones | `""` | La identidad de la app: da nombre a las cachés del Service Worker. Obligatoria con `sw.json`. **No la cambies nunca** una vez visitada la app. |
| `kind` | `"app"` o `"lib"` | `"app"` | Una app se sirve; una librería la usan otros proyectos y nunca se sirve. |
| `prefix` | minúsculas, con guiones | `""` | Con qué se nombran los componentes nuevos: `card` es `<app-card>` con `"prefix": "app"`. Propone, no prohíbe. |
| `globalStyles` | `{ "nombre": "ruta.css" }` | `{}` | Las hojas que adopta cada componente del proyecto, en este orden, antes de las suyas. |
| `styles` | `{ "nombre": "ruta.css" }` | `{}` | Las hojas que un componente puede adoptar por nombre en el `shadowrootadoptedstylesheets` de su template raíz. |
| `locales` | etiquetas BCP 47, al menos una | `["en"]` | Los idiomas de la app; el primero es el idioma en que está escrito el código. Ver `pages`. |
| `site` | un origen, `https://example.com` | ninguno | Dónde se publica la app: las URL absolutas de `canonical` y `hreflang`. |
| `server` | una carpeta del proyecto | `"src/server"` | Dónde viven los handlers de los `.fudapi`: código que solo corre en el servidor. |
| `browser` | una carpeta del proyecto | `"src/browser"` | Dónde vive el código que corre en el navegador. |
| `pipes` | una carpeta del proyecto | `"src/pipes"` | Dónde viven los pipes: su `.fudapi` y su implementación. |
| `api` | una carpeta de la librería | `"fudapi"` | La carpeta de `.fudapi` de una librería. Solo en una librería. |
| `earlyHints` | `true` o `false` | `true` | Si se escriben y se envían las `103 Early Hints` de cada ruta. |
| `css` | `"inline"` o `"link"` | `"inline"` | Dónde vive el CSS de una página: dentro de ella, o un fichero por hoja, anunciado antes. |
| `guide` | `{ "sheet": "…", "icon": "…" }` | ninguna | La guía de estilo que lleva el proyecto: `sheet` es su hoja de entrada, `icon` el favicon de sus páginas. Ver `html-css`. |
| `serve` | `{ "trustProxy": …, "uploads": … }` | ninguno | Cómo se sirve la app. `trustProxy`: el servidor se cree los `X-Forwarded-*` del proxy de delante. `uploads`: `maxFileSize` (10 MB), `maxFiles` (20), `maxArgs` (1 MB), en bytes o `"50mb"`. |
| `diagnostics` | `{ "FUDnnnn": nivel, "warnings": nivel }` | `{}` | Cómo informa el proyecto de cada código: `off`, `hint`, `info`, `warning` o `error`; `warnings` fija todos los que son warning por defecto. Un error nunca se baja. Ver `overview`. |
| `baseline` | `"widely"`, `"newly"`, un año, o `{ "target": …, "allow": [ids] }` | `"widely"` | Los navegadores de los usuarios: lo más nuevo que `target` es `FUD1524`. `allow` lista los ids de web-features que se usan a sabiendas. Ver `overview`. |

```json path=fudic.json
{
  "id": "shop",
  "kind": "app",
  "prefix": "shop",
  "server": "src/server",
  "browser": "src/browser",
  "site": "https://shop.example.com",
  "serve": { "trustProxy": true, "uploads": { "maxFileSize": "50mb" } },
  "diagnostics": { "FUD1547": "error" },
  "baseline": "widely"
}
```

## sw.json

En la raíz de una app: lo que cachea su Service Worker. **Sin `sw.json` no hay Service Worker**:
bórralo y la app se sirve sin él. Sus campos:

- `shell`: las URL exactas que se precargan al instalar, servidas por identidad. `[]` vale.
- `resources`: clases de recursos por nombre, cada una con:
  - `pattern`: las URL de la clase, sin el base; `*` dentro de un segmento, `**` a través de ellos.
  - `policy`: una de las cuatro — `cache-first` (la caché, la red si falta), `network-first` (la
    red, la caché sin conexión), `stale-while-revalidate` (la caché ya, refrescada por detrás),
    `network-only` (nunca se cachea).
  - `ttl`: cuánto vive una entrada: `30s`, `5m`, `2h`, `7d`, o `null` sin límite.
  - `maxEntries`: cuántas entradas guarda la clase como mucho.
- `dev`: `"off"` (por defecto: sin Service Worker en `vite dev`) o `"preview"`.

La clave de la caché es solo la URL: una respuesta que cambia con una cabecera de la petición la
lleva en la URL.

```json path=sw.json
{
  "shell": [],
  "resources": {
    "assets": { "pattern": "/assets/**", "policy": "cache-first", "ttl": null, "maxEntries": 200 },
    "images": { "pattern": "/img/**", "policy": "stale-while-revalidate", "ttl": "7d" }
  },
  "dev": "off"
}
```

## Las cabeceras: page.headers, sw.headers, assets.headers

Tres ficheros de texto en la raíz de una app, uno por cosa. **Lo que hay en el fichero es lo que
sale**: fudic no añade nada escondido, solo las cabeceras que son suyas. Un fichero que falta se lee
como su plantilla, que es lo que escribe `fudic new`.

| Fichero | Va en |
|---|---|
| `page.headers` | Cada página y cada `_error`, las pinte el servidor o el Service Worker. Su `103` lleva solo la CSP y la `Referrer-Policy`. |
| `sw.headers` | `/fudic-sw.js`. Solo con `sw.json`. |
| `assets.headers` | Los estáticos de la app, por ruta. |

La sintaxis:

```text
# A comment: from # to the end of the line, alone on its line.
Content-Security-Policy:
  default-src 'self'
  script-src 'nonce-{nonce}' 'strict-dynamic'
Referrer-Policy: strict-origin-when-cross-origin
X-Custom: anything
```

- Una cabecera por línea, `Nombre: valor`, con el nombre en la columna 0. Los nombres no distinguen
  mayúsculas.
- Una línea sangrada continúa la cabecera de arriba: se une con `; ` en la CSP (una directiva por
  línea) y con `, ` en `Cache-Control`, `Permissions-Policy` y `Reporting-Endpoints`.
- `{nonce}` es el nonce de cada respuesta, y solo va en `page.headers` como `'nonce-{nonce}'`. Sin
  él no hay nonce: el servidor no lo genera y el HTML no lo lleva.
- `# fud-disable-next-line FUD1547: por qué` silencia un warning en la línea siguiente, como en
  cualquier fichero.

`assets.headers` abre un bloque por ruta, con sus cabeceras sangradas debajo:

```text path=assets.headers
/**
  Cache-Control: no-cache

/assets/**
  Cache-Control: public, max-age=31536000, immutable

/legacy.js
  Cache-Control:
```

- Rutas sin el base; `*` dentro de un segmento, `**` a través de segmentos.
- **Gana la ruta más específica, cabecera por cabecera**: una ruta sin comodines gana a cualquier
  patrón; entre patrones, el que tiene más caracteres literales; si empatan, el primero.
- Un valor vacío no envía esa cabecera a los ficheros del bloque.

La plantilla de `page.headers` es la CSP estricta que pide Lighthouse:

```text path=page.headers
Content-Security-Policy:
  default-src 'self'
  script-src 'nonce-{nonce}' 'strict-dynamic' 'unsafe-inline' https:
  style-src 'self' 'unsafe-inline'
  img-src 'self' data:
  object-src 'none'
  base-uri 'none'
  frame-ancestors 'none'
  require-trusted-types-for 'script'
  trusted-types fudic
Referrer-Policy: strict-origin-when-cross-origin
Cross-Origin-Opener-Policy: same-origin
Strict-Transport-Security: max-age=63072000; includeSubDomains; preload
```

- Para cargar imágenes de otro sitio, añádelo a `img-src`: `img-src 'self' data: https://cdn.example.com`.
- Un login en un popup necesita `Cross-Origin-Opener-Policy: same-origin-allow-popups`.
- Borra la línea de HSTS si ya la envía un proxy, o si un subdominio se sirve por HTTP.
- En `vite dev` la página sale sin su CSP y sin HSTS; `vite preview` las envía todas.

`sw.headers` lleva la política propia del worker, `script-src 'self' 'unsafe-eval'`: sin
`'unsafe-eval'` el worker no puede enlazar los chunks de las rutas y la app se sirve sin él.

Estas las envía fudic, y escribirlas es `FUD1542`: `Content-Type`, `Content-Length`,
`Transfer-Encoding`, `Location` y `Set-Cookie` en los tres; `Link` en `page.headers`;
`Cache-Control` y `Service-Worker-Allowed` en `sw.headers`; un bloque para `/fudic-sw.js` o
`/fudic-routes.json` en `assets.headers`.

### Qué hacer con cada código

| Código | Qué hacer |
|---|---|
| `FUD1540` | Una línea que no es cabecera: escribe `Nombre: valor`, sangra la continuación, dale su ruta en `assets.headers`. |
| `FUD1541` | Una cabecera repetida, o un nombre o valor fuera de ASCII imprimible: deja una, renómbrala. |
| `FUD1542` | Esa cabecera la envía fudic: quita la línea. |
| `FUD1543` | La cabecera no admite ese valor: escribe uno de los que da el mensaje. En `page.headers` y `sw.headers`, quita la cabecera en vez de dejarla vacía. |
| `FUD1544` | Esa directiva de CSP no existe: corrige cómo se escribe; el navegador la ignora. |
| `FUD1545` | La política de la página bloquea algo que fudic emitió: añade a esa directiva la fuente que nombra el mensaje. |
| `FUD1546` | `{nonce}` fuera de sitio, un hueco que no lo es, o un nonce literal: escribe `'nonce-{nonce}'` en una lista de fuentes de `page.headers`. |
| `FUD1547` | La política de la página deja pasar más de lo que necesita: quita esa fuente, o añade `object-src 'none'`, `base-uri` y `frame-ancestors`. |
| `FUD1548` | La política del worker bloquea su linker: añade `'unsafe-eval'` al `script-src` de `sw.headers`. |
| `FUD1549` | Esa referrer policy deja `back` vacío: usa `strict-origin-when-cross-origin`. |
| `FUD1550` | El `preload` de HSTS necesita un `max-age` de un año o más e `includeSubDomains`. |
| `FUD1551` | `no-cache` en un fichero con hash que cachea el Service Worker: dale a esa ruta una caché larga. |
| `FUD1552` | Una caché larga en un fichero sin hash: el navegador se queda con el viejo. Dale `no-cache`. |
| `FUD1553` | Una regla que no casa con ningún fichero del build: corrige su ruta o quítala. |
| `FUD1554` | Un fichero de cabeceras que no se aplica a nada: una librería no se sirve, y `sw.headers` necesita `sw.json`. Bórralo. |
| `FUD1555` | Trusted Types rechazará el string que se pasa a ese sumidero: construye el HTML con el DOM, o pasa un `TrustedHTML`. |
| `FUD1556` | La política guarda una fuente que fudic ya no necesita: quítala. |

`FUD1545`, `FUD1548`, `FUD1551`–`FUD1553` y `FUD1556` necesitan la salida: los dice el build, y el
editor después de un build. `fudic_check` dice todos los demás.
