# SDD-84 — Las cabeceras de la app

> **Estado:** `Listo` (2026-11-13) — [tareas](./SDD-84-Task.md).
> **Paquetes:** `@fudic/config` · `@fudic/diagnostics` · `@fudic/transport` · `@fudic/server` ·
> `@fudic/vite` · `@fudic/compiler` · `@fudic/dom` · `@fudic/forms` · `@fudic/typecheck` ·
> `@fudic/language-server` · `@fudic/vscode` · `@fudic/cli` · `@fudic/mcp` · `examples/basic`
> **Depende de:** 20 (SW, manifiesto, CSP con nonce), 41 (`fudic.json` y sus lectores), 45 (`FUD0803`,
> piezas y fronteras), 50 (`@fudic/diagnostics`), 73 (Early Hints), 81 (`@fudic/server`), 83 (la
> política de diagnósticos, `fud-disable`, el detector de TS y el esquema de `fudic.json`). La 83 tiene
> que estar mergeada en `main` antes de empezar.
> **Rango de diagnósticos:** `FUD1540`–`FUD1559` (nuevo).
> **Decisiones de gramática:** ninguna. Los `.headers` no son `.fud`.
> **Origen:** notas 3 y 8 de `docs/PENDIENTE.md`, estudiadas con Pedro el 2026-11-13.
> **Rama sugerida:** `sdd-84-cabeceras`, desde `main`.
>
> **Qué añade en una frase.** Cada app tiene tres ficheros de texto en su raíz —`page.headers`,
> `sw.headers` y `assets.headers`— con las cabeceras de sus páginas, de su Service Worker y de sus
> estáticos (CSP, HSTS, COOP, caches y cualquier otra); los genera la CLI con lo que deja limpio
> Lighthouse, los valida un lector propio en el build, el editor y el MCP, y la guía del MCP explica
> por fin todos los ficheros del proyecto.

---

## 1. Contexto y objetivo

### 1.1. Lo que hay hoy

- **Una CSP fija.** `DEFAULT_CSP` ([transport/src/csp.ts](../../packages/transport/src/csp.ts)) tiene la
  del documento y la de `/fudic-sw.js`. Viaja en el manifiesto (`csp.document`, `csp.sw`) y la aplican
  el servidor ([server.ts](../../packages/server/src/server.ts) `pageHeaders`), el `103` (`hint`), el
  SW en las páginas que pinta ([router.ts](../../packages/transport/src/router.ts)) y los `statics` de
  `/fudic-sw.js`. Nadie la puede cambiar.
- **Lighthouse da 100 en Buenas prácticas, pero avisa** en «Confianza y seguridad»:

  | Aviso | Se quita con |
  |---|---|
  | La CSP no protege contra XSS | `script-src` con nonce y `'strict-dynamic'`, `object-src 'none'`, `base-uri 'none'` |
  | Clickjacking | `frame-ancestors 'none'` |
  | DOM XSS: Trusted Types | `require-trusted-types-for 'script'` |
  | HSTS | `Strict-Transport-Security` |
  | Aislamiento de origen | `Cross-Origin-Opener-Policy: same-origin` |

- **Las páginas que pinta el SW salen sin `Referrer-Policy`.** El servidor la pone; el SW, no. El `back`
  de SDD-73 §3.6 depende entonces del valor por defecto del navegador.
- **Un `<script type="importmap">` del autor sale sin nonce**, y la CSP de hoy ya lo bloquea.
- **`<script type="module" src="/fudic-main.js">` y los `<link rel="modulepreload">` del head no llevan
  nonce.** Con `'self'` no hace falta; con `'strict-dynamic'`, sí.
- **Trusted Types rompe dos `innerHTML` del runtime**: [dom/src/browser.ts:36](../../packages/dom/src/browser.ts)
  (`htmlOf`) y [forms/src/dom/summary.ts:39](../../packages/forms/src/dom/summary.ts).
- **La cache de los estáticos no es de fudic.** Solo `/fudic-sw.js` y el manifiesto llevan `no-cache`.
  Lo demás depende del host: los assets con hash no llevan `immutable`.
- **`FUD0803` no puede saltar**: compara con `DEFAULT_CSP`, que siempre declara el nonce.
- **La guía del MCP no explica `fudic.json`**: [overview.md](../../packages/mcp/guide/overview.md) lista
  menos de la mitad de sus claves. SDD-83 añade el esquema para el editor y las secciones de sus dos
  claves, pero no una página con el proyecto entero.

### 1.2. Objetivo

1. Las cabeceras de una app se leen y se cambian en tres ficheros de texto, uno por cosa, sin JSON.
2. Una app nueva no da ningún aviso de seguridad en Lighthouse.
3. Lo que se escribe mal sale con su posición en el build, en el editor y en el MCP.
4. La cache de los estáticos se decide por ruta: todos, un grupo o un fichero.
5. Las páginas llevan las mismas cabeceras las pinte el servidor o el SW.
6. La guía del MCP explica todos los ficheros del proyecto, atada por test a lo que se lee de verdad.

---

## 2. Dependencias

| SDD | Qué aporta |
|---|---|
| 20 | El manifiesto, el router del SW, `newNonce`/`cspFor`/`applyNonce`, `__FUDIC_NONCE__` |
| 41 | `@fudic/config`, `ConfigIo`, los lectores que nunca lanzan |
| 45 | `FUD0803` (runtime inline sin nonce); módulos con estado como frontera de las piezas |
| 50 | Una función por código, su `.md`, `explain` |
| 73 | El `103` con la CSP y la `Referrer-Policy` de la página; el contrato de los seis backends (§3.2) |
| 81 | `@fudic/server`: `createServer`, `ServerApp`, `staticHeaders`, `nodeMiddleware` |
| 83 | `applyPolicy`, `fud-disable` en los comentarios de cada lenguaje, el detector de TS sobre código de navegador, el esquema de `fudic.json`, `fudic_check` con la política |

Ninguna dependencia nueva.

---

## 3. Interfaz pública

### 3.1. Los tres ficheros

En la raíz de cada app, junto a `fudic.json` y `sw.json`:

| Fichero | Va en |
|---|---|
| `page.headers` | Cada página y cada `_error`, las pinte el servidor o el SW. Del `103`, solo la CSP y la `Referrer-Policy` |
| `sw.headers` | `/fudic-sw.js` |
| `assets.headers` | Los estáticos de la app, por ruta |

- **Lo que hay en el fichero es lo que sale.** fudic no suma nada escondido a lo que escribe el
  usuario. Lo único que añade son las cabeceras que son suyas (§3.6).
- **Sin fichero, sale lo de su plantilla (§3.5)**, que es lo mismo que escribe la CLI. Una app que
  existía antes de esta SDD no cambia de forma de trabajar: gana las cabeceras nuevas sin tocar nada.
- **En una librería no hacen nada.** Una lib no se sirve: un `.headers` en una lib es `FUD1554`.
- **`sw.headers` sin `sw.json` no aplica a nada**: `FUD1554`. Borrar `sw.json` sigue siendo quitar el SW.

### 3.2. La sintaxis

```
# A comment: from # to the end of the line, alone on its line.
Content-Security-Policy:
  default-src 'self'
  script-src 'nonce-{nonce}' 'strict-dynamic'
Referrer-Policy: strict-origin-when-cross-origin
X-Custom: anything
```

- **Una cabecera por línea**: `Nombre: valor`, con el nombre en la columna 0.
- **Una línea sangrada continúa la cabecera de arriba.** Se une con el separador de esa cabecera: `; `
  en la CSP (cada línea es una directiva) y `, ` en las de listas con coma (`Cache-Control`,
  `Permissions-Policy`, `Reporting-Endpoints`). En una cabecera que fudic no conoce no hay
  continuación: `FUD1540`.
- **Comentarios con `#`**, solo en su propia línea. Valen los `fud-disable` de SDD-83:
  `# fud-disable-next-line FUD1547: el CDN de vídeo necesita https:`.
- **Una cabecera no se repite** dentro de un fichero, ni dentro de un bloque en `assets.headers`
  (`FUD1541`).
- **Nombres sin distinguir mayúsculas.** Se envían tal como se escriben.
- **Valores en ASCII imprimible.** Un carácter fuera de ese rango es `FUD1541`.
- **Huecos: `{nombre}`.** Un nombre entre llaves es un hueco que quien responde sustituye en cada
  respuesta. Hoy hay uno: **`{nonce}`**, el nonce de esa respuesta. Solo vale en `page.headers`, y
  dentro de la CSP solo como `'nonce-{nonce}'`. Otro nombre entre llaves, o `{nonce}` en otro sitio,
  es `FUD1546`. Un hueco nuevo en el futuro es una entrada más en la tabla de huecos del lector y una
  línea más en el contrato de los backends (§4.4).
- **Si `page.headers` no tiene `{nonce}`, no hay nonce**: ni el servidor ni el SW lo generan, y el HTML
  no lleva atributos `nonce`.

**`assets.headers`: toda regla lleva ruta.**

```
/**
  Cache-Control: no-cache

/assets/**
  Cache-Control: public, max-age=31536000, immutable

/legacy.js
  Cache-Control:
```

- Una línea que empieza por `/` en la columna 0 abre un bloque. Sus cabeceras van sangradas debajo y
  sus continuaciones, un nivel más. Una cabecera sin ruta es `FUD1540`.
- Las rutas van sin el `base` de la app. `*` es dentro de un segmento y `**`, a través de segmentos:
  el mismo patrón de `sw.json`.
- **Gana la ruta más específica, cabecera por cabecera.** Un fichero toma las cabeceras de todos los
  bloques que lo casan. Para cada nombre, gana el bloque más específico: una ruta sin comodines gana
  a cualquier patrón; entre patrones, el que tiene más caracteres literales; si empatan, el primero
  del fichero.
- **El valor vacío no envía esa cabecera** a los ficheros de ese bloque. Solo en `assets.headers`: en
  los otros dos se borra la línea y basta, así que allí un valor vacío es `FUD1543`.

### 3.3. Qué se valida

| Cabecera | Se comprueba |
|---|---|
| `Content-Security-Policy` | Directivas de CSP3 (una desconocida es `FUD1544`); cada fuente con su forma (palabra clave entre comillas, esquema, host, `'nonce-{nonce}'`, `'sha256/384/512-…'`); `'none'` sola en su directiva |
| `Strict-Transport-Security` | `max-age=N` obligatorio; `includeSubDomains`; `preload` con sus requisitos (`FUD1550`) |
| `Cross-Origin-Opener-Policy` | `same-origin` · `same-origin-allow-popups` · `noopener-allow-popups` · `unsafe-none` |
| `Referrer-Policy` | Los ocho valores del estándar; uno que no manda la ruta dentro del origen es `FUD1549` |
| `Cache-Control` | Directivas de respuesta conocidas; las que llevan número, con número |
| `Permissions-Policy` | Forma de diccionario estructurado (RFC 8941) |
| Cualquier otra | Que el nombre sea un *token* HTTP válido |

Un valor que no cumple su forma es `FUD1543`. Las cabeceras conocidas y su separador viven en una
tabla del lector: una cabecera nueva es una línea de esa tabla.

### 3.4. Lo que fudic exige y lo que avisa

**Lo que fudic necesita no está escrito en el código como una CSP.** El fichero es la única
política. Cada pieza que emite fudic declara lo que necesita, en el código que lo provoca:

| Pieza | Declara | Dónde |
|---|---|---|
| El polyfill de estilos (`<script>` inline) | `script-src`: el nonce | `compiler/src/emit/polyfill.ts` |
| El runtime inline (`?inline`) | `script-src`: el nonce | `compiler/src/emit/parts.ts` |
| Los `<style>` y `<style type="module">` | `style-src`: el nonce o `'unsafe-inline'` | `compiler/src/emit/parts.ts` |
| `<script src>`, `modulepreload`, `importmap` | `script-src`: el nonce, si la CSP lleva `'strict-dynamic'` | `compiler/src/emit/parts.ts` |
| El linker del SW (`new Function`) | `script-src` de `sw.headers`: `'unsafe-eval'` | `transport/src/linker.ts` |
| La policy de Trusted Types | `trusted-types`: `fudic`, si hay `require-trusted-types-for` | `dom/src/trusted.ts` |

El build junta las necesidades de lo que **de verdad emitió** y las compara con el fichero, según
la semántica de CSP3 (directiva efectiva, `default-src` como respaldo, `'unsafe-inline'` ignorado
con nonce). Si mañana el SW admite `import()` y el linker deja de evaluar, su necesidad desaparece
con él, y el `'unsafe-eval'` de `sw.headers` pasa a ser `FUD1556`, con la bombilla que lo quita. Lo
mismo con el nonce el día que no haga falta el polyfill. No hay que tocar ningún otro código.

- **Algo que se emitió y la CSP no lo deja pasar**: `FUD1545` (error) en `page.headers`, o `FUD1548`
  (warning) en `sw.headers`, sobre la directiva efectiva y diciendo qué pieza lo necesita.
  `FUD1548` es un warning porque sin `'unsafe-eval'` `canLink()` da `false` y la app se sirve sin SW:
  es legal, aunque rara vez sea lo que se quiere. `FUD0803` sigue saltando sobre el layout que pide
  `?inline`, y ahora puede hacerlo: compara con `page.headers`.
- **Algo que la CSP permite para fudic y ya nada necesita**: `FUD1556` (hint), con bombilla. Solo se
  mira lo que fudic declara (`{nonce}`, `'unsafe-eval'` en `sw.headers`, `fudic` en `trusted-types`):
  nunca lo que el usuario añada para lo suyo.
- Estas tres comprobaciones necesitan la salida: salen en el build y en dev. El build y dev escriben
  las necesidades que juntaron en `.fudic/csp-needs.json`, y el editor las lee de ahí para enseñar los
  tres códigos en los `.headers` con su bombilla. Sin ese fichero (sin compilar todavía), el editor
  no los enseña.

**`page.headers`, mientras se escribe:**

- **Una fuente debilita solo si el navegador la usa** (`FUD1547`, warning):
  - `'unsafe-eval'` en `script-src`;
  - `*`, un esquema (`https:`, `http:`, `data:`) o un host en `script-src` **sin `'strict-dynamic'`**
    (con `'strict-dynamic'`, el navegador los ignora);
  - `'unsafe-inline'` en `script-src` **sin nonce** (con nonce, se ignora);
  - sin `object-src 'none'` (y sin `default-src 'none'`), sin `base-uri` o sin `frame-ancestors`.

  Así la plantilla, que lleva `'unsafe-inline' https:` como respaldo para navegadores viejos detrás de
  `'strict-dynamic'`, no avisa.

**`assets.headers`** (solo en el build, porque necesita la salida y `sw.json`):

- `no-cache` o `no-store` en un fichero que el SW precarga (`shell`, o un recurso `cache-first` de
  `sw.json`): el SW baja otra vez lo que la página acaba de bajar (SDD-20 §4.10). `FUD1551`.
- `immutable`, o un `max-age` de un día o más, en un fichero del build cuyo nombre no lleva hash: el
  navegador se queda con la versión vieja. `FUD1552`.
- Una regla que no casa con ningún fichero del build: `FUD1553` (hint).

Todos los warnings se suben, se bajan o se silencian con la política de SDD-83.

### 3.5. Las plantillas

La única fuente es `HEADERS_TEMPLATES` en `@fudic/config`. La CLI escribe ese texto, y la falta de un
fichero se lee como ese texto.

**`page.headers`**

```
# The headers of every page: what the server sends and what the Service Worker paints.
# The 103 Early Hints carry only the Content-Security-Policy and the Referrer-Policy.
# {nonce} is the nonce of each response: fudic writes it on its own scripts and styles.

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

**`sw.headers`**

```
# The headers of /fudic-sw.js. A Service Worker does not inherit the page's policy.
# 'unsafe-eval' is what lets it link the route chunks: without it the app is served without it.

Content-Security-Policy:
  default-src 'self'
  script-src 'self' 'unsafe-eval'
```

**`assets.headers`**

```
# The headers of the app's static files, by path without the base.
# The most specific path wins, header by header. An empty value sends nothing.

/**
  Cache-Control: no-cache

/assets/**
  Cache-Control: public, max-age=31536000, immutable
```

`/assets/**` es el `build.assetsDir` de Vite. La CLI escribe el que tenga la app.

### 3.6. Las cabeceras de fudic

No se pueden escribir: `FUD1542` (error). Son las que harían que fudic dejara de funcionar.

| Fichero | Cabeceras | Por qué |
|---|---|---|
| Los tres | `Content-Type`, `Content-Length`, `Transfer-Encoding`, `Location`, `Set-Cookie` | Las decide quien responde |
| `page.headers` | `Link` | Las Early Hints de lo que se pinta (SDD-73) |
| `sw.headers` | `Service-Worker-Allowed`, `Cache-Control` | El alcance y las actualizaciones (SDD-20 §4.10) |
| `assets.headers` | Un bloque con la ruta exacta de `/fudic-sw.js` o del manifiesto | Siempre `no-cache`. Un patrón que los case no se les aplica |

### 3.7. Las API

**`@fudic/config`**

```ts
export type HeadersKind = 'page' | 'sw' | 'assets';

export interface HeaderEntry {
  readonly name: string;
  /** Continuations joined with the header's separator. `''` only in `assets.headers`: not sent. */
  readonly value: string;
  readonly span: Span;
}

export interface AssetRule {
  readonly pattern: string;
  readonly headers: readonly HeaderEntry[];
  readonly span: Span;
}

export interface HeadersConfig {
  readonly page: readonly HeaderEntry[];
  readonly sw: readonly HeaderEntry[];
  readonly assets: readonly AssetRule[];
}

export const HEADERS_FILES: Readonly<Record<HeadersKind, string>>;   // page.headers, sw.headers, assets.headers
export const HEADERS_TEMPLATES: Readonly<Record<HeadersKind, string>>;

/** One file's text → its entries and what is wrong in it (§3.2–§3.4, the checks that need no build). */
export function parseHeaders(kind: HeadersKind, text: string): {
  readonly entries: readonly HeaderEntry[] | readonly AssetRule[];
  readonly diagnostics: readonly FileDiagnostic[];
};

/** The three files of `root`; a missing one is its template. Never throws. */
export function readHeaders(root: string, io: ConfigIo, options: { readonly kind: 'app' | 'lib'; readonly sw: boolean }): {
  readonly config: HeadersConfig;
  readonly diagnostics: readonly FileDiagnostic[];
};
```

**`@fudic/transport`**: el manifiesto cambia `csp` por `headers`. `DEFAULT_CSP` y `CspTemplates`
desaparecen.

```ts
export interface ManifestHeaders {
  /** Name → value, `{nonce}` still in it. */
  readonly page: Readonly<Record<string, string>>;
  readonly sw: Readonly<Record<string, string>>;
  /** Most specific first; `''` = not sent. */
  readonly assets: readonly { readonly pattern: string; readonly headers: Readonly<Record<string, string>> }[];
}

/** The placeholders of a header value, by name; today only `nonce`. */
export const PLACEHOLDERS: readonly string[];
/** Whether the page headers ask for a nonce: some value holds `{nonce}`. */
export function wantsNonce(headers: ManifestHeaders): boolean;
/** The page headers of one response, every `{name}` filled from `values`. */
export function pageHeadersFor(headers: ManifestHeaders, values: { readonly nonce?: string }): Headers;
/** What `assets` says for `path` (without `base`): the winner per name, the empty ones dropped. */
export function assetHeadersFor(headers: ManifestHeaders, path: string): Readonly<Record<string, string>>;
```

**`@fudic/server`**: `ServerApp.csp` y `ServerApp.statics` pasan a ser `ServerApp.headers:
ManifestHeaders`. `staticHeaders(request)` devuelve lo de `assetHeadersFor`, y para `/fudic-sw.js` y
el manifiesto, lo de fudic (más `sw` en el primero). `EarlyHints` no cambia: lo llena
`pageHeadersFor`.

### 3.8. Editor, CLI y MCP

- **Lenguaje `fudheaders`** para los tres nombres de fichero (`filenames` en `@fudic/vscode`), con su
  gramática TextMate: comentarios, nombres, rutas, directivas de CSP, palabras clave entre comillas y
  `{nonce}`.
- **El language server** valida con `parseHeaders` mientras se escribe y aplica la política de SDD-83.
  - **Completado**: nombres de cabecera de la tabla, directivas de CSP, palabras clave y valores
    cerrados (COOP, `Referrer-Policy`, directivas de `Cache-Control`).
  - **Hover**: qué hace la cabecera o la directiva, con enlace a MDN.
  - **Bombillas**: las de SDD-83 para silenciar (el comentario con `#`); «Añadir `<fuente>`» en
    `FUD1545` y `FUD1548`, con lo que pide la pieza; «Quitar `<fuente>`» en `FUD1556`; «Quitar la
    línea» en `FUD1542` y `FUD1546`; y «Cambiar por `<valor>`» en `FUD1543` cuando hay un valor cerrado
    parecido.
  - `FUD1545`, `FUD1548` y `FUD1556` salen de `.fudic/csp-needs.json` (§3.4) y se recalculan cuando
    cambia ese fichero o el `.headers`.
- **CLI**: `fudic new` y `fudic g app` escriben `page.headers` y `assets.headers`, y `sw.headers` salvo
  con `--no-sw`. La CLI no tiene `fudic check` (SDD-35 lo retiró): la comprobación del proyecto es
  `fudic_check` (§8.2.24).
- **MCP**: `fudic_check` devuelve sus diagnósticos. La guía gana el tema `config` (§3.9).

### 3.9. La guía del MCP: los ficheros del proyecto

- **Tema nuevo `config`** (`guide/config.md` y `guide/es/config.md`; `TOPICS` lo incluye). Explica:
  - **`fudic.json`**: cada clave con su tipo, su valor por defecto, para qué sirve y un ejemplo, en el
    orden del esquema de SDD-83;
  - **`sw.json`**: `shell`, `resources` con sus cuatro políticas, `ttl`, `maxEntries` y `dev`;
  - **los tres `.headers`**: la sintaxis, las plantillas, las cabeceras de fudic y qué hacer con cada
    código `FUD1540`–`FUD1555`.
- La tabla de `overview.md` (y su copia) remite a `config` en lugar de listar claves.
- **Un test ata la guía a lo que se lee**: cada propiedad del esquema de `fudic.json`, cada campo de
  `SwConfigFile` y cada nombre de `HEADERS_FILES` aparece en `config.md` y en `es/config.md`. Si se
  añade una clave sin documentarla, el test falla.

### 3.10. Los códigos

| Código | Sev. | Título (`.md`) | Cuándo |
|---|---|---|---|
| `FUD1540` | error | A line that is not a header | Ni cabecera, ni continuación, ni comentario; continuación de una cabecera sin separador; cabecera sin ruta en `assets.headers`; ruta fuera de `assets.headers` |
| `FUD1541` | error | A header written twice or with a bad name | Nombre que no es *token*, cabecera repetida, carácter fuera de ASCII imprimible |
| `FUD1542` | error | A header fudic sends itself | §3.6 |
| `FUD1543` | error | A value the header does not accept | §3.3; valor vacío fuera de `assets.headers` |
| `FUD1544` | warning | A CSP directive that does not exist | Directiva desconocida: el navegador la ignora |
| `FUD1545` | error | The page policy blocks what fudic emits | §3.4: una necesidad de lo emitido que `page.headers` no deja pasar |
| `FUD1546` | error | A placeholder that is not one | Un nonce literal, un `{nombre}` que no es un hueco, `{nonce}` fuera de `'nonce-{nonce}'` o fuera de `page.headers` |
| `FUD1547` | warning | The page policy lets more in than it needs | §3.4 |
| `FUD1548` | warning | The Service Worker policy blocks its linker | §3.4: la necesidad del linker que `sw.headers` no deja pasar |
| `FUD1549` | warning | This referrer policy leaves `back` empty | `no-referrer`, `origin`, `strict-origin` |
| `FUD1550` | warning | HSTS preload without what it requires | `preload` con `max-age` < 31536000 o sin `includeSubDomains` |
| `FUD1551` | warning | The Service Worker downloads this file twice | §3.4 |
| `FUD1552` | warning | A long cache on a file without a hash | §3.4 |
| `FUD1553` | hint | A rule that matches no file | §3.4 |
| `FUD1554` | warning | A headers file that applies to nothing | En una lib, o `sw.headers` sin `sw.json` |
| `FUD1555` | warning | Trusted Types will block this assignment | §4.6 |
| `FUD1556` | hint | The policy allows what fudic no longer needs | §3.4: `{nonce}`, `'unsafe-eval'` en `sw.headers` o `fudic` en `trusted-types` sin pieza que lo pida |

`FUD1557`–`FUD1559` quedan libres.

---

## 4. Comportamiento

### 4.1. Dónde va cada cabecera

| | Página (servidor) | Página (SW) | `103` | `/fudic-sw.js` | Estáticos | Datos y funciones |
|---|---|---|---|---|---|---|
| `page.headers` | todas | todas menos HSTS | CSP y `Referrer-Policy` | — | — | — |
| `sw.headers` | — | — | — | todas | — | — |
| `assets.headers` | — | — | — | — | la regla que gana | — |

- **HSTS solo sobre HTTPS**: el servidor no la manda en una petición `http:` (con `trustProxy`, según
  lo que diga el proxy). El SW no la manda nunca, porque el navegador ignora la HSTS de una respuesta
  que construye un SW.
- **Lo que `load` escribe en sus cabeceras** sigue perdiendo frente a las de fudic en la CSP y la
  `Referrer-Policy` (SDD-69 §4.2), y desde ahora también frente a cualquier cabecera de
  `page.headers`.
- **Los datos y las funciones** siguen con lo suyo: `private, no-store` si leen la sesión.

### 4.2. Del fichero al servidor

- El plugin lee los tres ficheros con `readHeaders` en `configResolved`, informa de sus diagnósticos
  con la política aplicada y escribe `headers` en el manifiesto. El servidor generado (`emitServerModule`)
  los lleva en `ServerApp.headers`.
- `FUD1545`, `FUD1548`, `FUD1556` y `FUD1551`–`FUD1553` salen en `generateBundle`, cuando se conocen
  la salida y `sw.json`. Las necesidades del SW vienen del bundle de `fudic-sw.js` (lo que declara el
  linker); las de las páginas, de cada compilación (§4.7). En dev, al compilar cada página.
- El build y dev escriben `.fudic/csp-needs.json`: por fichero `.headers`, cada necesidad con su
  directiva, su fuente y la pieza que la pide.
- **Un error en un `.headers` corta el build**, como cualquier error. El fichero erróneo no se sustituye
  por su plantilla: si el usuario cree que ha cambiado algo, no puede salir otra cosa sin avisar.

### 4.3. El Service Worker

- `servePage` y `render` del router ponen `pageHeadersFor(table.headers, nonce)` menos HSTS. Con eso
  las páginas que pinta el SW ganan la `Referrer-Policy` y el COOP que no tenían.
- `/fudic-sw.js` lleva `sw.headers` en dev, en preview y detrás de cualquier adaptador.

### 4.4. Los estáticos

- `nodeMiddleware` pone `staticHeaders(request)` y pasa al servidor de estáticos del host. **Lo de
  fudic tiene que ganar**: si el servidor de estáticos (el `sirv` de `vite preview`, `express.static`)
  escribe su propio `Cache-Control`, el adaptador lo reemplaza antes de enviar. Para eso envuelve
  `res.setHeader`/`res.writeHead` mientras dure la petición, en lugar de fiarse del orden.
- Un backend en otro lenguaje lee `headers.assets` del manifiesto y aplica la misma regla. El README de
  `@fudic/vite` (el contrato de SDD-73 §3.2) gana estas líneas:

  ```
  on a page:
    if some value of manifest.headers.page holds "{nonce}":
      nonce = 16 random bytes, base64url, new for THIS response
      every "{nonce}" in those values    -> nonce
      every "__FUDIC_NONCE__" in the HTML -> nonce   (prerendered pages, and streams chunk by chunk)
    send the headers of manifest.headers.page
  on its 103:       of those, Content-Security-Policy and Referrer-Policy, same nonce
  on /fudic-sw.js:  manifest.headers.sw
  on a static file: for each name, the most specific rule of manifest.headers.assets; '' = none
  ```

  Sustituir es reemplazar un texto fijo por otro: cabe en una línea en cualquier lenguaje, sin
  plantillas ni expresiones regulares. El README da la función en Go, Java, Python, C# y Rust junto a
  la de Node.

### 4.5. Desarrollo

- En dev, `page.headers` se aplica **sin la CSP ni HSTS**: el cliente de Vite inyecta scripts sin nonce,
  y dev va por `http:`. Es lo que se hacía hasta ahora: dev sin CSP de página, preview con ella.
- `sw.headers` sí se aplica en dev, como hoy la CSP del SW.
- Los tres ficheros se vigilan: un cambio vale para la respuesta siguiente, sin reiniciar, y sus
  diagnósticos salen al momento.

### 4.6. Trusted Types

- **Una sola policy, `fudic`**, creada una vez en un módulo de `@fudic/dom` (`trusted.ts`). Ese módulo
  tiene estado (la policy), así que es frontera de las piezas, como `core/owner` y `di/ambient`
  (SDD-45). `@fudic/forms` la importa de ahí: dos `createPolicy('fudic')` tirarían una excepción con
  la directiva activa.
- `createHTML` devuelve el texto tal cual. Los dos sinks son el HTML que el autor pide en crudo
  (`htmlOf`) y el resumen de errores, que fudic compone escapando cada mensaje. La policy no sanea:
  hace explícito por dónde entra el HTML.
- Sin `trustedTypes` en el navegador, el módulo devuelve el texto y el runtime asigna un string, como
  hoy.
- **El detector de SDD-83 sobre código de navegador** (`@code` de cliente, `src/browser`, pipes) gana
  `FUD1555`, cuando `page.headers` lleva `require-trusted-types-for 'script'`. Avisa cuando se asigna un
  valor de tipo `string` (no `TrustedHTML`/`TrustedScript`/`TrustedScriptURL`) a `innerHTML`,
  `outerHTML`, `srcdoc` o `src`/`text` de un `<script>`; y cuando se pasa a `insertAdjacentHTML`,
  `document.write(ln)`, `setHTMLUnsafe`, `createContextualFragment`, `DOMParser.parseFromString`,
  `eval`, `new Function` o un `setTimeout`/`setInterval` con texto. Lo decide el tipo, que ya da
  `@fudic/typecheck`. `src/server` no se mira.

### 4.7. El emit

- **El nonce solo si se pide.** Sin `{nonce}` en `page.headers`, `io.nonce` no existe y `$nonce` es
  `''`: el HTML no lleva atributos `nonce` ni el token `__FUDIC_NONCE__`. El emit ya escribe
  `$nonce` condicional; lo nuevo es que el servidor y el SW solo lo generan con `wantsNonce`.
- `writeRuntimeTags` pone `$nonce` en `<script type="module" src>` y en cada
  `<link rel="modulepreload">` que escribe en el head. Con `'strict-dynamic'`, lo que no lleva nonce
  no carga. Sin `'strict-dynamic'`, el nonce sobra y no molesta.
- Cada sitio del emit que escribe algo inline registra su necesidad (§3.4) en el resultado de la
  compilación, junto al código que lo escribe. El build las junta por página.
- Un `<script type="importmap">` del autor sale con `$nonce`. Un `application/ld+json`, no: no se
  ejecuta y la CSP no lo mira.
- Las precargas de la cabecera `Link` y del `103` no llevan nonce ni lo necesitan: según CSP3,
  `'strict-dynamic'` deja pasar las peticiones que no inserta el parser. El criterio 22 lo comprueba
  en Chrome.

### 4.8. El ejemplo

`examples/basic` gana sus tres ficheros. `page.headers` lleva una fuente de imágenes de fuera, para que
el ejemplo enseñe cómo se añade, y `assets.headers` un bloque para `/fonts/*`. Lighthouse sobre
`vite preview` del ejemplo no da avisos en «Confianza y seguridad» (criterio 32).

---

## 5. Invariantes

- **Lo que hay en el fichero es lo que sale**, más las cabeceras de fudic (§3.6) y nada más.
- **Ninguna CSP en el código.** Lo que fudic necesita lo declara la pieza que lo provoca, y se compara
  con lo que se emitió. Cambiar o quitar esa pieza cambia lo que se exige sin tocar nada más.
- **Sin `{nonce}` no hay nonce**: ni se genera ni se escribe.
- **Una fuente: `HEADERS_TEMPLATES`.** La CLI y la falta de fichero dan el mismo texto.
- **Las mismas cabeceras de página** desde el servidor y desde el SW, salvo HSTS en el SW.
- **El lector nunca lanza.** Un fichero ilegible o roto es un diagnóstico con span.
- **Un nonce siempre es por respuesta.** Ningún fichero puede fijar uno.
- **Ningún error se esconde**: un `.headers` erróneo corta el build, no cae a la plantilla.
- **Diagnósticos con span**: sobre la línea, el nombre, la directiva o la fuente. `FUD1551`–`FUD1553`,
  sobre la ruta del bloque. `FUD1555`, sobre la asignación o la llamada.
- **Cobertura.** Todo fichero nuevo al 100 % en las cuatro métricas, con umbral por fichero en
  `compiler`, `transport` y `vite`. `config`, `diagnostics`, `server`, `typecheck` y
  `language-server` siguen al 100 %.

---

## 6. Criterios de aceptación

**La prueba de Pedro**

1. En VS Code, con el `.vsix` de la rama, sobre `examples/basic`: los tres ficheros tienen colores,
   completado, hover y bombillas; un error en `page.headers` sale al escribir y corta `vite build`;
   `vite preview` sirve la app y Lighthouse no da avisos en «Confianza y seguridad».

**Los ficheros**

2. `fudic new app` escribe los tres ficheros con el texto de `HEADERS_TEMPLATES`; con `--no-sw`, no
   escribe `sw.headers`. `fudic g app` hace lo mismo.
3. Una app sin ningún `.headers` sirve exactamente las cabeceras de las plantillas.
4. Una línea sangrada en la CSP se une con `; `, y en `Cache-Control` con `, `. Una continuación de
   `X-Custom` es `FUD1540`.
5. `Cache-Control` sin ruta en `assets.headers` es `FUD1540`. Una ruta en `page.headers`, también.
6. Una cabecera repetida es `FUD1541` sobre la segunda. `X-Ñ: 1` y `X-A: ñ` también lo son.
7. `Content-Type` en cualquiera de los tres, `Link` en `page.headers` y `Cache-Control` en
   `sw.headers` son `FUD1542`. Un bloque `/fudic-sw.js` en `assets.headers`, también.
8. `Cross-Origin-Opener-Policy: same-site` es `FUD1543`, con la bombilla «Cambiar por `same-origin`».
   `Cache-Control: max-age=mucho` también es `FUD1543`. Un valor vacío en `page.headers`, también.
9. `script-srcc 'self'` es `FUD1544`.
10. Con una página que hidrata (lleva el polyfill inline), `script-src 'self'` sin nonce da `FUD1545`
    en el build, nombrando el polyfill, y en el editor con la bombilla «Añadir `'nonce-{nonce}'`». Con
    un layout que pide `?inline`, también sale `FUD0803`. Con `require-trusted-types-for` y
    `trusted-types otra`, también es `FUD1545`, nombrando la policy.
11. `'nonce-abc123'`, `{nonce}` en `img-src https://{nonce}.x`, `{otro}` o un `'nonce-{nonce}'` en
    `sw.headers` son `FUD1546`.
12. `script-src 'nonce-{nonce}' https:` es `FUD1547`; con `'strict-dynamic'` delante, no. La plantilla
    no da ningún diagnóstico. Quitar `frame-ancestors` es `FUD1547`.
13. `sw.headers` sin `'unsafe-eval'` es `FUD1548`, nombrando el linker, y el SW de esa app no se
    registra como renderizador (`canLink()` falso).
14. **Mañana sin tocar código.** En un test, con el linker declarando que no necesita nada,
    `'unsafe-eval'` en `sw.headers` da `FUD1556` con la bombilla «Quitar `'unsafe-eval'`», y ningún
    otro fichero cambia. Lo mismo con una app sin páginas que hidraten y `{nonce}` en `page.headers`.
15. Con `page.headers` sin `{nonce}` y `script-src 'self' 'unsafe-inline'`, el HTML no lleva ningún
    atributo `nonce` ni el token `__FUDIC_NONCE__`, la respuesta no genera nonce y no sale `FUD1545`.
16. `Referrer-Policy: no-referrer` es `FUD1549`.
17. `max-age=86400; preload` es `FUD1550`.
18. Con `sw.json` precargando `/assets/**` y `/assets/**` con `no-cache`, el build da `FUD1551`.
19. `immutable` en `/**` da `FUD1552` sobre la regla, nombrando un fichero sin hash del build (el
    favicon). `/nada/**` da `FUD1553`.
20. Un `page.headers` en una lib es `FUD1554`. Un `sw.headers` en una app sin `sw.json`, también.
21. `# fud-disable-next-line FUD1547: …` encima de la directiva la silencia; `"FUD1547": "error"` en
    `diagnostics` corta el build (SDD-83).

**Las respuestas**

22. Una página servida por preview lleva la CSP de `page.headers` con un nonce nuevo por respuesta, la
    `Referrer-Policy`, el COOP y, sobre HTTPS, HSTS. En Chrome no hay violaciones de CSP en consola, la
    página hidrata, y las `modulepreload` del `103` y de la cabecera `Link` se usan (DevTools: sin
    segunda petición del módulo).
23. La misma página pintada por el SW lleva las mismas cabeceras menos HSTS, con su
    `Referrer-Policy`.
24. El `103` lleva la CSP (con el mismo nonce que la respuesta final) y la `Referrer-Policy`, y nada
    más de `page.headers`.
25. `/fudic-sw.js` lleva `sw.headers`, `no-cache` y `Service-Worker-Allowed`, en dev, en preview y con
    `nodeMiddleware` detrás de Express.
26. En preview, `/assets/x-<hash>.js` lleva `immutable`, `/favicon.ico` lleva `no-cache` y un bloque
    `/legacy.js` con `Cache-Control:` vacío lo deja sin `Cache-Control`, aunque `sirv` quisiera poner
    el suyo.
27. Un `X-Custom: 1` en `page.headers` sale en las páginas y no en los datos, las funciones ni los
    estáticos.
28. En dev no hay CSP de página ni HSTS; el resto de `page.headers`, sí. Cambiar `page.headers` cambia
    la respuesta siguiente sin reiniciar.

**El runtime y el emit**

29. Con Trusted Types activo, una vista con HTML en crudo y un formulario con su resumen de errores
    pintan sin violaciones. `trustedTypes.createPolicy` se llama una vez por página aunque haya dos
    piezas que la usen.
30. El `<script type="module" src>`, cada `<link rel="modulepreload">` del head y un
    `<script type="importmap">` del autor llevan el nonce de la respuesta. Un `application/ld+json`,
    no.
31. `el.innerHTML = texto` en un `@code` de cliente da `FUD1555`. Con un `TrustedHTML`, no. Con
    `require-trusted-types-for` fuera de `page.headers`, tampoco. En `src/server`, tampoco.

**Lighthouse, editor y MCP**

32. Lighthouse sobre `vite preview` de `examples/basic` (HTTPS): sin avisos en «Confianza y seguridad».
33. El language server da los diagnósticos de 4–13 y 16–17 en el editor con su span, y completa `script-`
    con las directivas de `script-src`. Tras un build, `FUD1545`, `FUD1548` y `FUD1556` salen también
    en el editor, desde `.fudic/csp-needs.json`.
34. `fudic_check` del MCP devuelve los mismos diagnósticos que el build para los tres ficheros, salvo los
    que necesitan la salida (`FUD1545`, `FUD1548`, `FUD1551`–`FUD1553`, `FUD1556`).
35. El README de `@fudic/vite` trae el contrato de §4.4 y la función de sustitución en Node, Go, Java,
    Python, C# y Rust; la de Node es la que usa `@fudic/server`, y un test la compara con el pseudocódigo.
36. `fudic_guide { topic: "config" }` devuelve el tema, y el test de §3.9 falla si se quita de
    `config.md` una clave del esquema, un campo de `sw.json` o el nombre de un `.headers`.

**Cierre**

37. `pnpm typecheck`, `pnpm test`, `pnpm build` y los e2e (`dev`, `preview`, `nosw`) en verde, con la
    cobertura de §5.

---

## 7. Fuera de alcance

Nada.

---

## 8. Decisiones

### 8.1. Tomadas al redactar

1. **Tres ficheros de texto, uno por cosa** (Pedro). La CSP en JSON es un calvario de comillas y
   arrays. Un fichero por destino se borra o no se genera solo (`--no-sw`), y se lee sin saber qué es
   cada clave.
2. **`.headers`, no `.csp`** (Pedro): caben todas las cabeceras, también las de caché.
3. **Lo que hay en el fichero es lo que sale**, sin una base escondida que se fusione. La CLI escribe
   la plantilla entera, así que no hay nada que adivinar. Si fudic necesita algo nuevo en una versión
   futura, sale como diagnóstico con su bombilla.
4. **Sin fichero, la plantilla.** Ninguna app existente se queda sin CSP, y borrar `page.headers` no
   quita la seguridad: solo vuelve a lo de fábrica.
5. **Toda regla de `assets.headers` lleva ruta** (Pedro). Que una regla valga para todo se lee en la
   regla (`/**`), no en un comentario.
6. **Gana la ruta más específica, cabecera por cabecera**, y el valor vacío excluye. Así se cambia la
   caché de un grupo o se excluye un fichero sin repetir el resto.
7. **`assets.headers` cuenta también con SW**: la primera visita y las descargas del propio SW pasan
   por la caché HTTP. Lo que gobierna el SW está en `sw.json`, y `FUD1551` avisa cuando chocan.
8. **`'strict-dynamic'` en la plantilla, con `'unsafe-inline' https:` de respaldo.** Es la CSP estricta
   que recomiendan Google y Lighthouse. El respaldo solo cuenta en navegadores sin nonces, que están
   por debajo del suelo de fudic. Exige el nonce en `<script src>` y en `modulepreload` (§4.7).
9. **HSTS con `includeSubDomains; preload` en la plantilla.** Es lo único que quita el aviso, y está a
   la vista: quien sirva subdominios por HTTP, o tenga HSTS en el proxy, borra la línea.
10. **COOP `same-origin`.** Quien haga login por popup lo cambia a `same-origin-allow-popups`; el hover
    lo dice.
11. **Dev sin CSP de página ni HSTS**, como hasta ahora. Poner nonce al cliente de Vite sería pelear
    con Vite por algo que preview ya enseña.
12. **Los avisos solo cuando la fuente cuenta** (`FUD1547`). Una regla que avisara de `https:` detrás de
    `'strict-dynamic'` avisaría de la propia plantilla.
13. **Una cabecera desconocida no avisa**: `X-*` y las de cada empresa son legítimas. Solo se mira su
    nombre.
14. **El manifiesto lleva las cabeceras**, como llevaba la CSP: el servidor y el SW no pueden divergir,
    y un backend en otro lenguaje no necesita leer los ficheros.
15. **Una policy `fudic` que no sanea.** Sanear HTML es del autor; lo que hace la policy es que solo
    haya dos puertas, con nombre. El autor que quiera la suya añade su nombre en `trusted-types`.
16. **`FUD1555` por tipo, no por nombre.** Un `TrustedHTML` que llega de la policy del autor no avisa.
17. **`FUD1551`–`FUD1553` solo en el build.** Necesitan la salida y `sw.json`, que el editor no tiene
    sin compilar.
18. **Sin formateador para `.headers`**: el formato ya es una cosa por línea.
19. **La nota 8 entra aquí** (Pedro: una sola SDD). SDD-83 hace el esquema de `fudic.json` para el
    editor; esta escribe la página de la guía y el test que la ata al esquema, a `sw.json` y a los
    `.headers`.
20. **Los docs que citan los avisos de Lighthouse** (SDD-32, BUG-07, BUG-42, IDEA-07, INDEX) se
    corrigen donde ya no aplican.
21. **La CSP que fudic necesita vive en el fichero, no en el código** (Pedro). Si mañana un SW admite
    `import()`, o se llega a un consenso sobre las hojas adoptadas sin el polyfill, el cambio está en
    la plantilla y en la pieza que deja de necesitarlo, nunca en una lista de exigencias aparte. Por eso
    cada pieza declara lo suyo y el build compara con lo que de verdad emitió.
22. **Huecos `{nombre}` con un único hueco hoy: `{nonce}`** (Pedro). Sustituir un texto fijo cabe en una
    línea en cualquier backend. La sintaxis deja sitio a otros huecos sin cambiar el formato.
23. **El token del HTML sigue siendo `__FUDIC_NONCE__`**, distinto del de las cabeceras: `{nonce}` en el
    texto de una página podría ser contenido del autor. Son dos reemplazos, y el contrato los nombra
    juntos.
24. **Las necesidades llegan al editor por `.fudic/csp-needs.json`.** El editor no compila la app, y sin
    ese fichero no puede saber qué se emite. Calla antes que adivinar.

### 8.2. Tomadas al implementar

1. **La rama sale de `sdd-83-diagnosticos-y-baseline`**, no de `main` (Pedro): las dos se mergean juntas
   después.
2. **Un `.headers` que no se puede leer es `FUD1540`** (`problem: 'unreadable'`), con su motivo. No cae a
   la plantilla, igual que uno roto.
3. **`parseHeaders` también devuelve los comentarios** y `readHeaders` el texto y los comentarios de cada
   fichero que existe (`sources`): son lo que necesita `govern` de SDD-83 para aplicar los `fud-disable`.
4. **Una necesidad dice qué pone la pieza, no qué fuente pide**: `inline-script`, `inline-style`, `script`,
   `eval` o `policy` (con su nombre). `checkNeeds` decide con la semántica de CSP3 si pasa y, si no, qué
   fuente añadir: el nonce para un script inline, `'unsafe-inline'` para un estilo (el nonce si hay un hash),
   `'self'` o el nonce para un `<script src>` según haya `'strict-dynamic'`. Así «el nonce, si la CSP lleva
   `'strict-dynamic'`» (§3.4) no tiene que estar escrito en cada pieza. Devuelve cada hallazgo con su acción
   (`add`/`remove`), directiva, fuente y span, para las bombillas.
5. **`FUD1556` sobre el nonce, directiva por directiva**: un `'nonce-{nonce}'` sobra en una directiva por la
   que no pasa ninguna necesidad gracias a él (si `'self'` ya deja pasar el `<script src>`, el nonce de esa
   directiva sobra).
6. **Las rutas de fudic en `assets.headers`** (`FUD1542`) son `/fudic-sw.js` y `/fudic-routes.json`, los
   nombres por defecto: el lector no conoce un manifiesto con otro nombre.
7. **Las líneas en blanco y los comentarios no cortan una cabecera**: un comentario entre las líneas de la
   CSP (el `fud-disable-next-line` del ejemplo de §3.2) deja la cabecera seguir. En `assets.headers`, la
   sangría de la primera cabecera de un bloque marca el nivel; más sangrado es continuación.
8. **Sin CSP en `page.headers` no hay `FUD1547` ni necesidades que comprobar**: quien la borra lo ha
   decidido, y el navegador deja pasar todo.
9. **`FUD1551` solo en un fichero con hash que declara `sw.json`** (su `shell` o un recurso `cache-first`).
   Uno sin hash tiene que revalidarse: `no-cache` es lo correcto para él, y si avisara, la plantilla
   (`/**` con `no-cache`) avisaría en cualquier app con SW. Los chunks que fudic mete en el shell por su
   cuenta tampoco cuentan: son cosa suya.
10. **Un fichero «con hash»** es uno del bundle cuyo nombre acaba en `-` y ocho caracteres base64url (el
    `[hash]` de Vite, el id de build de fudic y las copias enlazadas). Lo de `public/` nunca lo lleva.
11. **`.fudic/csp-needs.json` guarda las necesidades tal como las declara cada pieza** (`loads`, `piece`),
    por fichero `.headers`, no la fuente que piden: el editor llama a `checkNeeds` con el texto que tiene
    delante, que es lo que decide la fuente (decisión 4).
12. **`ServerApp.files`** (`{ manifest, worker? }`) dice al servidor cuáles son los ficheros propios de
    fudic: les da sus cabeceras pase lo que pase en `assets.headers`, y `fetch` nunca los toma por una
    ruta. `staticHeaders` devuelve también los valores `''`: son cabeceras que no deben salir, y
    `nodeMiddleware` necesita saberlo para quitar la del servidor de estáticos.
13. **`nodeMiddleware` pregunta primero a `fetch`** y pone las cabeceras de estático solo a lo que no
    contesta. Antes iba al revés, porque solo había dos rutas; con `/**` casaría cualquier página.
14. **Sin `Referrer-Policy` en `page.headers` no sale ninguna**, también en el `103`: lo que hay en el
    fichero es lo que sale. Desaparece `PAGE_REFERRER_POLICY`.
15. **Sin CSP en `page.headers`, la que escriba `load` se queda**: no hay nada que gane sobre ella. En
    dev no sale ninguna, tampoco la de `load`: el cliente de Vite no lleva nonce.
16. **Las necesidades de las páginas viajan en `EmitOutput.needs`** desde la fase 3, vacías hasta que el
    emit las registre (tarea 11). La parte de extremo a extremo del criterio 10 con el polyfill (que el
    build nombre el polyfill) se prueba en la fase 4; en la 3, `checkEmitted` con las necesidades de la
    pieza y `FUD0803` en un build real.
17. **Un `fud-disable` en un `.headers` silencia también en el build.** El informe comparaba la ruta
    relativa del diagnóstico (`page.headers`) con la absoluta del fichero y nunca casaban: ahora cada
    diagnóstico se sitúa en la ruta entera de su fichero antes de aplicar sus comentarios.
18. **También los `<script>` de código del head del autor llevan el nonce**, no solo su `importmap`: con
    `'strict-dynamic'` un `<script src="./analytics.js">` del layout no cargaría sin él. JSON-LD y cualquier
    `type` que no sea JavaScript, no. Un `type` interpolado se trata como código. Con un atributo
    interpolado el nonce entra por la misma maquinaria de atributos.
19. **El `importmap` declara `inline-script`, no `script`**: es un script inline, y `'self'` no lo deja
    pasar. Con nonce pasa; sin nonce, solo con `'unsafe-inline'`.
20. **Las necesidades del head viven en `HEAD_NEEDS` (`compiler/src/emit/parts.ts`)** y las del polyfill
    en `POLYFILL_NEEDS` (`polyfill.ts`). Cada escritor devuelve lo que escribió (`writeHeadElements`,
    `writeSharedHead`, `guideOf`/`planPageSheets`) y el módulo lo junta en `EmitOutput.needs`. El layout
    apunta lo de su propio head; la ruta, lo de sus hojas, su guía, su head y su runtime según la forma
    del marcador de su layout (`runtimeFormOf`). El `<script>` que registra el SW lo apunta el plugin
    (`HEAD_NEEDS.boot`) cuando hay `sw.json`: el compilador no sabe si lo hay.
21. **La necesidad de Trusted Types la apunta el emit del cliente** (`EmitOutput.needs` del `?client` de un
    componente o de una ruta) cuando pinta HTML: un `@raw` o el resumen de un formulario. Solo lo que
    hidrata pasa por la policy, así que una página N1 con `@raw` no la pide. La declaración vive en
    `dom/src/trusted.ts` (`TRUSTED_TYPES_NEEDS`), y por eso `@fudic/compiler` depende de `@fudic/dom`
    (sin dependencias propias). El plugin junta las necesidades de los `?client` con las de las páginas.
22. **`dom/trusted` es una pieza del runtime** y `dom/browser` la importa por URL; `@fudic/forms` la
    alcanza por un shim de `@fudic/dom`, como ya hacía con `@fudic/core`. Es la «lista de fronteras» de la
    tarea 10: una sola copia de la policy en el origen. `examples/pieces-bench` la anota como pieza con
    estado.
23. **`FUD1555` por tipo, mirando debajo de los casts**: un valor de un tipo `TrustedHTML`,
    `TrustedScript` o `TrustedScriptURL` no avisa aunque se escriba `as unknown as string` (lo que exige el
    `lib.dom` de TypeScript, que tipa `innerHTML` como `string`). `any` no avisa: no se sabe. Se suman a
    los sumideros de §4.6 `textContent`/`innerText` de un `<script>` y `parseHTMLUnsafe`. La exigencia se
    lee del `page.headers` del proyecto del fichero (su plantilla si no hay), nunca en una lib. En el
    editor `.fud` sale con el resto del detector en la fase 5 (tarea 15).
24. **No hay `fudic check` en la CLI**: SDD-35 lo retiró, porque lo que el editor marca rompe el build.
    La comprobación del proyecto es la de `@fudic/typecheck`, y los `.headers` entran en ella con
    `createProjectChecker({ root, headers: true })`, que pide `fudic_check`. Dev y el build no la piden:
    ya los dicen al leer los ficheros, y saldrían dos veces. Se informan como el build, sin el `FUD1523` de
    un comentario que no silencia nada; el editor sí lo enseña, como en un `.fudapi`.
25. **`CSP_NEEDS_FILE`, `readCspNeeds` y `cspOf` viven en `@fudic/config`**: el build escribe el fichero y el
    editor lo lee con la misma definición. `readCspNeeds` nunca lanza; una necesidad con una forma que
    ninguna pieza declara se descarta.
26. **El completado** ofrece los nombres de la tabla (`Nombre: `), las directivas de CSP3, las fuentes de
    cada directiva (`'nonce-{nonce}'` solo en `page.headers`; `'script'` en `require-trusted-types-for`,
    `fudic` en `trusted-types`), los valores cerrados y las directivas de `Cache-Control`. Lee el texto
    alrededor del cursor y no el parse: la línea que se escribe es la que todavía no parsea.
27. **«Quitar la línea»** quita la cabecera que empieza en esa línea con sus continuaciones, o el bloque de
    `assets.headers` cuya ruta está en ella con sus cabeceras; si no, esa línea sola. **«Cambiar por»**
    propone el valor cerrado más parecido (distancia de edición hasta el 60 % del más largo) y cambia solo
    el valor, no sus parámetros.
28. **El lenguaje `fudheaders` reclama los tres nombres con `filenames`**, y el cliente vigila `**/*.headers`
    y `**/.fudic/csp-needs.json`: un cambio refresca los `.headers` abiertos y los `.fud`, cuyo `FUD1555`
    depende de `page.headers`. La activación no cambia: toda app tiene algún `.fud`.
29. **Los campos de `sw.json` que ata el test de la guía** son `SW_CONFIG_FIELDS` y `RESOURCE_RULE_FIELDS` de
    `@fudic/vite`, comprobados contra `SwConfigFile` en tiempo de compilación: un campo nuevo sin su nombre
    no compila, y con su nombre y sin documentar falla el test.
30. **La CLI escribe `/assets/**` tal cual**: el `vite.config.ts` que genera deja `build.assetsDir` en su
    valor por defecto. El README de la app nueva nombra los tres ficheros.
