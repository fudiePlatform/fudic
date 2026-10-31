# SDD-73 — Early Hints: el 103 en cualquier backend y el CSS de los componentes como fichero

> **Estado:** `Listo` — [tareas](./SDD-73-Task.md).
> **Paquetes:** `@fudic/compiler` · `@fudic/ssr` · `@fudic/core` · `@fudic/http` · `@fudic/config` · `@fudic/vite` ·
> `@fudic/transport` · `examples/basic`
> **Depende de:** 70 (las pistas por ruta en el manifiesto, `earlyHints` y `componentStyles` (que aquí pasa a `css`) en el
> `fudic.json`, y su [anexo](./SDD-70-anexo-early-hints.md) con el estudio de navegadores y
> backends), 56 (`_error.fud` y las páginas de error), 49 (las copias podadas de las hojas), 45
> (las piezas del runtime en `/_fudic/`), 20 (el manifiesto de rutas y el SW).
> **Rango de diagnósticos:** sin diagnósticos nuevos. Un valor malo en el `fudic.json` ya es
> `FUD0725` (SDD-70).
> **Decisiones de gramática:** ninguna.
> **Origen:** conversación con Pedro del 2026-10-31, al cerrar las tareas 40–41 de SDD-70.
> **Rama sugerida:** `sdd-73-early-hints`
>
> **Qué añade en una frase.** Un middleware con el mismo contrato en los seis backends manda las
> pistas de la página como `103 Early Hints` mientras `load` trabaja, y siempre en la cabecera
> `Link` de la respuesta; la página de error tiene las suyas; y una app puede llevar el CSS de sus
> componentes en ficheros, que entran en las pistas.

---

## 1. Contexto y objetivo

SDD-70 (tareas 40–41) dejó en `fudic-routes.json` las pistas de cada ruta:

```json
{ "pattern": "/hidratacion", "mode": "ssg",
  "hints": [
    "</assets/tokens-BqSaBSRF.css>; rel=preload; as=style",
    "</fudic-boot-b0dcce6d.js>; rel=modulepreload",
    "</fudic-main-b5270baf-b0dcce6d.js>; rel=modulepreload",
    "</_fudic/0.0.1-9bbca9df/core/hydrate.js>; rel=modulepreload",
    "</_fudic/0.0.1-9bbca9df/core/registry.js>; rel=modulepreload",
    "</_fudic/0.0.1-9bbca9df/core/warm-sw.js>; rel=modulepreload",
    "</_fudic/0.0.1-c50c11c7/transport/urls.js>; rel=modulepreload"
  ] }
```

Nadie las manda todavía. Quedan cinco huecos:

1. **Nadie las envía.** El servidor de Node ni manda el 103 ni pone la cabecera `Link`.
2. **La página de error no tiene pistas.** `/test`, que no existe, responde `404` con
   `_error.fud` pintado por el servidor; en una app de verdad esa página lleva su CSS.
3. **Una hoja que no se poda no entra.** Un `<link rel="stylesheet" href="/public.css">` o uno de
   otro origen sale en el head, pero no en las pistas.
4. **`componentStyles: "link"` se lee y no hace nada**, y aunque lo hiciera se quedaría corto: el
   `<style>` del head de una ruta o de su layout también viaja dentro de cada HTML.
5. **La página de error no sabe de dónde venía el usuario.** `_error.fud` de `examples/basic`
   lleva `<a href="/usuarios">Volver a usuarios</a>`: vale hoy para un error en `/usuarios` y
   para ningún otro.

El backend es políglota (C#, Java, Go, Rust, Python y Node). Nada de esto puede depender del
render de Node: el contrato es el manifiesto, y lo que hace cada servidor con él es un middleware
que cabe en unas líneas en cualquier lenguaje.

## 2. Dependencias

| SDD | Qué aporta |
|---|---|
| 70 | `RouteRecord.hints` y cómo se calculan (`packages/vite/src/hints.ts`, `hintsOf` en `plugin.ts`, `EmitOutput.hints` en el compilador); `earlyHints` y `componentStyles` en `ProjectConfig` (`@fudic/config`). Su anexo, con la compatibilidad de navegadores (§E.5) y backends (§E.6) |
| 56 | `_error.fud`: el servidor lo pinta con el status del error (`packages/vite/src/page-errors.ts`) cuando no hay ruta o cuando `load` lanza; su `data` es `ErrorPage` (`packages/http/src/errors.ts`); `error-pages` trae al navegador a `/_fudic/error/:status` cuando falla una llamada |
| 49 | `LinkedAssets.sheet()`: publica una hoja con el hash de su contenido y la sirve en desarrollo (`packages/vite/src/linked-assets.ts`) |
| 45 | `loadedPieces`: el cierre estático de un módulo en las piezas de `/_fudic/` |
| 20 | El manifiesto (`@fudic/transport`, `ManifestFile`), que leen el servidor y el SW |

## 3. Interfaz pública

### 3.1. El manifiesto

```ts
export interface ManifestFile {
  // … lo de siempre
  /** Las pistas de `_error.fud` (§3.3). Ausente si no hay ninguna o con `earlyHints: false`. */
  readonly errorHints?: readonly string[];
}
```

`RouteRecord.hints` no cambia de forma. Gana lo que faltaba (§3.4).

### 3.2. El middleware: el contrato de los seis backends

```
earlyHints(petición, manifiesto):
  ruta   = manifiesto.match(petición.path)
  pistas = ruta ? ruta.hints : manifiesto.errorHints
  si no hay pistas: seguir
  si petición es HTTP/2 o más
     y petición.headers["sec-fetch-mode"] == "navigate"
     y el servidor sabe mandar 1xx:
        mandar 103 con  Link: <pistas unidas por ", ">
  seguir con la respuesta de siempre, y en ella:
     Link: <pistas de la respuesta final>
```

- **Las pistas de la respuesta final son las de lo que se pinta.** Si `load` lanza y sale
  `_error.fud`, la cabecera `Link` lleva `errorHints`, aunque el 103 llevara las de la ruta.
- **Un solo 103 por respuesta.** Chrome ignora los siguientes.
- **No se detecta el navegador.** Ninguna petición dice si entiende el 103. El filtro es el de
  arriba (protocolo y `Sec-Fetch-Mode`), que es el que recomienda Chrome, y un cliente que no lo
  entiende lo ignora.
- **Lo que depende del lenguaje es solo «sabe mandar 1xx»** (anexo §E.6). Hoy sí: Node, Go,
  Java (Tomcat, Jetty) y Python (Hypercorn). Hoy no: C# (Kestrel) y Rust (hyper); esos ponen solo
  la cabecera `Link`, que un CDN convierte en 103 y que el navegador usa igual como precarga, más
  tarde.
- **Respuestas que no son páginas** (el endpoint de datos, `/_fudic/fn/…`, un fichero estático):
  ni 103 ni `Link`.

### 3.3. Las pistas de la página de error

El build calcula las de `_error.fud` igual que las de una ruta (las hojas de su head, `boot`,
`main` y su cierre estático) y las escribe en `errorHints`. Una app sin `_error.fud` usa la
página de error por defecto, que no enlaza nada: sin `errorHints`.

### 3.4. Las hojas que no se podan

Entran en `hints` en su sitio del head, como `rel=preload; as=style`:

| `href` en el head | Pista |
|---|---|
| `./site.css` (podada, SDD-49) | la URL de la copia, como hoy |
| `/public.css` (de `public/`) | `</base/public.css>; rel=preload; as=style` |
| `https://cdn.example/x.css` | `<https://cdn.example/x.css>; rel=preload; as=style` |
| `./x.css?inline` | ninguna: va dentro de la página |
| `./@(data.theme).css` | ninguna: no se sabe al compilar |

### 3.5. `css: "link"`: el CSS como fichero

El campo `componentStyles` de SDD-70 pasa a llamarse **`css`** (`"inline"` por defecto, o
`"link"`), porque ya no es solo de componentes; `componentStyles` deja de leerse (`FUD0725` con el
nombre nuevo en el mensaje). Con `"link"`:

**El head de la ruta y del layout.** Cada `<style>` del `<head>` de una ruta, de una página o de
su layout, y cada hoja `?inline`, sale como `<link rel="stylesheet" href="<url>">` en el mismo
sitio, con lo que queda tras la poda de esa página (SDD-49) y publicado con el hash de su
contenido: dos páginas que se quedan con lo mismo comparten fichero. Entra en las pistas de la
ruta, en su orden del head. Un `<style>` con `@` (se calcula al pintar) se queda dentro.

```html
<!-- inline (hoy) -->
<style nonce="…">.fold{height:140vh;…}</style>
<!-- link -->
<link rel="stylesheet" href="/assets/hidratacion-Ef56.css">
```

**Los componentes.** Lo que SDD-70 §3.10 ya describía:

- cada hoja (la de un componente o una del proyecto que se adopta) se publica como fichero con el
  hash de su contenido (`LinkedAssets.sheet`), y se sirve en desarrollo con los mismos bytes;
- el `<head>` ya no lleva el polyfill ni los `<style type="module" specifier>`;
- el anfitrión lleva `data-fud-sheets="<url> <url>"` en lugar de `data-fud-adopt`, y su
  plantilla DSD acaba con un `<link rel="stylesheet" href="<url>">` por hoja, sin
  `shadowrootadoptedstylesheets`;
- un anfitrión que fabrica el runtime añade los mismos enlaces al final de su shadow root
  (`core/src/adopt-sheets.ts`);
- las hojas que adopta algún componente de la página entran en sus pistas, detrás de las del head
  y antes de los módulos.

```html
<app-counter data-fud-id="1" data-fud-sheets="/assets/theme-Ab12.css /assets/app-counter-Cd34.css">
  <template shadowrootmode="open">
    <div class="panel">…</div>
    <link rel="stylesheet" href="/assets/theme-Ab12.css">
    <link rel="stylesheet" href="/assets/app-counter-Cd34.css">
  </template>
</app-counter>
```

Los enlaces van **al final** del shadow root: la hidratación recorre los hijos por posición
desde el primero, y así no se encuentra nada que no esperaba.

### 3.6. La página de error sabe de dónde venía el usuario

Hoy `_error.fud` de `examples/basic` lleva `<a href="/usuarios">Volver a usuarios</a>`: vale
para el error de una llamada en `/usuarios` y para ningún otro. El `data` de la página de error
(`ErrorPage` de `@fudic/http`) gana dos campos:

```ts
export interface ErrorPage {
  readonly status: number;
  readonly title: string;
  readonly detail?: string;
  /** La ruta que se pidió y falló: `/usuarios/99`, `/test`. */
  readonly path: string;
  /** De dónde venía el usuario, si es del mismo origen: `/usuarios`. Ausente si no se sabe. */
  readonly back?: string;
}
```

- **`path`** es la ruta de la petición que acabó en error (sin el origen ni la `base`). En el
  error de una llamada que trae al navegador a `/_fudic/error/:status`, es la página desde la que
  se hizo la llamada (§4.5).
- **`back` sale siempre de la cabecera `Referer`, nunca de la URL.** El navegador la pone y otro
  sitio no puede fabricar una del nuestro. Se valida resolviéndola y exigiendo el mismo origen,
  no mirando el texto (`/\evil.com` empieza por `/` y el navegador lo lee como `//evil.com`):

  ```ts
  const u = new URL(referer);
  back = u.origin === requestOrigin ? withoutBase(u.pathname) + u.search : undefined;
  ```

  Otro origen, ninguna cabecera o una que no se puede leer: ausente. Nunca un enlace fuera de la
  app.
- **La URL de la página de error lleva solo el status:** `/_fudic/error/401`. `detail` deja de
  viajar en la query (hoy `?detail=…`): un enlace fabricado con un texto cualquiera mostraba ese
  texto con el diseño de la app, que es phishing servido desde el propio dominio. `detail` solo
  se pinta cuando el error nace en la misma petición que pinta la página (un `load` que lanza).
- **`Referrer-Policy: strict-origin-when-cross-origin`** en las respuestas de página, explícita:
  es la que manda el `Referer` completo dentro del origen y solo el origen fuera. Sin ella, una
  política más estricta del servidor dejaría a `back` siempre vacío.
- Sin JS, como todo el resto de la página. Cualquier backend lo rellena con la petición que tiene
  en la mano.

```html
<h1>@data.status · @data.title</h1>
@if (data.back !== undefined) {
  <p><a href=@data.back>Volver</a></p>
} @else {
  <p><a href="/">Ir al inicio</a></p>
}
```

## 4. Comportamiento

### 4.1. El middleware de Node

- Vive en `@fudic/vite` (`src/early-hints.ts`) y lo usan el servidor de desarrollo y el de
  preview, delante del render de páginas y de la página de error.
- Manda el 103 con `res.writeEarlyHints({ link: [...] })`.
- En desarrollo no hay build: las pistas se calculan igual que en el build, con las URLs del
  servidor de desarrollo (`boot` y `main` estables). Vite va en HTTP/1.1, así que en desarrollo
  sale solo la cabecera `Link`. Con `server.https`, Vite sirve HTTP/2 y sale también el 103.
- Con `earlyHints: false` no hace nada.

### 4.2. El Service Worker

- **No manda 103 ni puede**: la Fetch API no deja que un SW responda con un 1xx, solo con la
  respuesta final. Tampoco hace falta: el SW pinta en local, sin espera al servidor, y el CSS y el
  JS ya están en su caché.
- Una navegación que el SW pasa a la red recibe el 103 del servidor, como sin SW.

### 4.3. La página de error, caso por caso

```
/usuarios     → 103 (pistas de /usuarios) → 200 + Link (pistas de /usuarios)
/test         → 103 (errorHints)          → 404 + Link (errorHints)
/usuarios/99  → 103 (pistas de /usuarios) → 404 + Link (errorHints)    ← load lanza notFound()
```

En el tercer caso, lo que se precargó de `/usuarios` y no usa la página de error es trabajo
perdido, no un fallo.

### 4.4. El compilador con `css: "link"`

- Una opción inyectada nueva, `componentSheet(name, css) → url`: con ella, el emit escribe el
  `<style>` del head (de la ruta y del layout), las hojas `?inline` y las hojas adoptadas como
  ficheros en lugar de módulos de estilo. Sin ella, el emit de hoy, byte a byte.
- `markup.ts` y `markup-client.ts` escriben `data-fud-sheets` con las URLs en el orden de
  adopción de hoy (las del proyecto primero, luego la del componente).
- El serializador de `@fudic/ssr` (`openElement`) escribe los `<link>` al final de la plantilla
  cuando el anfitrión tiene `data-fud-sheets`, y no escribe `shadowrootadoptedstylesheets`.
- `EmitOutput.hints` incluye las hojas de los componentes de la página.

### 4.5. `path` y `back` en los dos caminos a la página de error

- **`load` lanza o no hay ruta** (el servidor pinta `_error.fud`, `page-errors.ts`): `path` es
  la ruta pedida y `back`, el `Referer` de la petición.
- **Una llamada falla y `error-pages` trae al navegador a `/_fudic/error/:status`** (SDD-56). El
  cliente (`errorUrl` en `packages/http/src/error-pages.ts`) navega con `location.assign`, y el
  navegador manda como `Referer` la página que hizo la llamada: esa es `back`, y también `path`.
  La URL ya no lleva nada más que el status:

  ```
  antes: /_fudic/error/401?detail=sin+sesi%C3%B3n
  ahora: /_fudic/error/401                     Referer: https://app.com/usuarios?p=2
                                               → back: '/usuarios?p=2'
  ```

  `back` no se omite aunque coincida con `path`: volver a esa página es justo lo que quiere el
  usuario. El título es el genérico del status; el mensaje de un error de una llamada es de quien
  la hizo (un formulario con `catches`, SDD-56), no de una URL.
- **Cuándo se navega y cuándo no.** Un error de **navegación** (`load` lanza, no hay ruta) no
  redirige: el servidor responde en la URL pedida con el status del error y `_error.fud`, y
  recargar vuelve a pedir lo mismo. Un error de una **llamada** (la página ya está pintada) sí
  navega a `/_fudic/error/:status`: es otra petición, y no lleva datos que alguien pueda falsear.
- El SW que pinta la página de error rellena los dos igual, con la petición que intercepta.
- El tipo de `data` en el editor (`ErrorPage`) los conoce: `@data.back` se completa y se tipa.

## 5. Invariantes

- **Por defecto, los mismos bytes.** Con `css` sin tocar, el HTML de toda página y
  los goldens del compilador no cambian; las pistas van en cabeceras y en el manifiesto.
- **El contrato es el manifiesto.** El middleware de cualquier lenguaje solo lee
  `fudic-routes.json`; no ejecuta nada de fudic.
- **Un 103 nunca decide nada.** El status, la redirección y la página de error siguen saliendo de
  `load` como hoy.
- **Cobertura:** lo nuevo al 100 % en las cuatro métricas; ningún paquete baja de donde está.

## 6. Criterios de aceptación

**El manifiesto**

1. Un `_error.fud` con un `<link rel="stylesheet">` en su head deja en `errorHints` su hoja y los
   módulos que carga; sin `_error.fud`, no hay `errorHints`; con `earlyHints: false`, tampoco.
2. Un head con `/public.css` y `https://cdn.example/x.css` los lleva en `hints`, en su orden y con
   `base`; uno con `?inline` o con un `href` dinámico no deja pista.

**El middleware de Node** (contra el servidor en proceso, en HTTP/2 con `server.https`)

3. Una navegación (`Sec-Fetch-Mode: navigate`) a una ruta con `load` recibe el 103 con sus
   pistas **antes** de que `load` se cumpla (promesa controlada) y la respuesta final lleva la
   misma cabecera `Link`.
4. En HTTP/1.1, o sin `Sec-Fetch-Mode: navigate`, no hay 103; la cabecera `Link` sí.
5. `/test` recibe el 103 con `errorHints` y un `404` con `Link: errorHints`. Una ruta cuyo `load`
   lanza `notFound()` recibe el 103 de la ruta y un `404` con `Link: errorHints`.
6. El endpoint de datos, una función del servidor y un fichero estático no llevan ni 103 ni
   `Link`. Con `earlyHints: false`, ninguna respuesta lleva ninguno.

**`css: "link"`: los componentes**

7. El head no lleva ni el polyfill ni ningún `<style type="module">`; cada anfitrión con hojas
   lleva `data-fud-sheets` y su plantilla acaba con sus `<link rel="stylesheet">`.
8. Los ficheros se publican en el build y el servidor de desarrollo los sirve con los mismos
   bytes; dos páginas con la misma hoja comparten fichero.
9. Las pistas de la ruta incluyen las hojas de sus componentes, detrás de las del head.
10. Un anfitrión fabricado en el navegador recibe los mismos `<link>` al final de su shadow root
    (test de `core`), y un componente servido por el servidor se hidrata igual que en `inline`.
11. Con `css` sin tocar, los goldens y el HTML de `examples/basic` no cambian.

**La página de error** (§3.6, §4.5)

12. `/usuarios/99` abierto desde `/usuarios` (con `Referer: <origen>/usuarios`) pinta
    `_error.fud` con `path: '/usuarios/99'` y `back: '/usuarios'`; sin `Referer`, o con uno de
    otro origen, sin `back`. Con una `base` distinta de `/`, los dos van sin ella.
13. Una llamada de `/usuarios?p=2` que falla navega a `/_fudic/error/401`, sin query, y pinta
    `back: '/usuarios?p=2'` del `Referer`. Un `Referer` de otro origen, uno con `\`
    (`https://app.com/\evil.com`) o uno que no es una URL no dan `back`.
14. **Seguridad.** `/_fudic/error/401?detail=Llama+al+900` pinta el título genérico y no el
    texto: ningún dato de la query llega a la página. Las respuestas de página llevan
    `Referrer-Policy: strict-origin-when-cross-origin`.
15. `_error.fud` de `examples/basic` quita el enlace fijo a `/usuarios` y usa `@data.back` (con
    `/` si falta); el typecheck del ejemplo pasa.

**El CSS como fichero** (§3.5)

16. Con `css: "link"`, el `<style>` del head de una ruta (`hidratacion.fud`) y el de su layout
    salen como `<link rel="stylesheet">` a ficheros con el hash de su contenido, en su sitio del
    head y con lo que queda tras la poda de esa página; están en las pistas de la ruta. Un
    `<style>` con `@` (que se calcula al pintar) se queda dentro de la página.

**Prueba en el navegador (la hace Pedro)**

17. `examples/basic` con `css: "link"` y preview en HTTP/2: en la pestaña Network de
    Chrome, las hojas y los módulos de `/hidratacion` salen con iniciador `early-hints`; los
    componentes se ven con su estilo; `/test` enseña la página de error con su CSS.

**Entrega**

18. `pnpm typecheck`, `pnpm test` y `pnpm build` en verde; lo nuevo al 100 %. El contrato de §3.2
    en el README de `@fudic/vite`, con un ejemplo en pseudocódigo para los demás backends, y el
    anexo de SDD-70 actualizado con lo que queda decidido.

## 7. Fuera de alcance

- **El middleware en C#, Java, Go, Rust y Python.** Esta spec fija el contrato (§3.2); cada
  backend lo implementa cuando exista su emisor (SDD-61 y su anexo).
- **Precargar los chunks de los componentes.** Se piden al hidratarse; precargarlos rompería la
  hidratación perezosa.
- **`preconnect` a otros orígenes.** Se puede añadir más tarde con la misma forma de pista.
- **Un límite al tamaño de la cabecera `Link`.** Se mide antes de inventarlo.

## 8. Decisiones

### 8.1. Tomadas al redactar

1. **Un middleware, no detección del navegador** (Pedro, 2026-10-31). Lo mismo en los seis
   lenguajes: leer el manifiesto, mandar el 103 si el protocolo y la petición lo permiten y el
   servidor sabe, y poner siempre la cabecera `Link`.
2. **La página de error tiene sus pistas** (Pedro, 2026-10-31): en una app de verdad lleva CSS.
   Van aparte de las rutas porque `_error.fud` no está en la tabla de rutas.
3. **La respuesta final anuncia lo que pinta.** El 103 sale antes de saber si `load` falla, así
   que lleva las de la ruta; la cabecera `Link` de la respuesta final, las de lo que se pintó.
4. **El SW no manda 103.** No puede, y no le hace falta.
5. **Los `<link>` de las hojas, al final del shadow root.** La hidratación recorre por posición
   desde el primer hijo.
6. **`back` en lugar de un enlace fijo** (Pedro, 2026-10-31). La página de error no puede
   saber a qué página volver si nadie se lo dice; el `Referer` del mismo origen es lo que el
   servidor tiene en la mano en cualquier lenguaje, sin JS en el navegador.
7. **Nada en la URL de la página de error salvo el status; `back` por cabecera** (Pedro,
   2026-10-31: «lo quiero seguro; no voy a hacer un mecanismo de redirección no seguro»). Lo que
   viaja en una URL lo puede escribir cualquiera en un enlace: un `?detail=` pinta el texto de
   otro con el diseño de la app, y un `?from=` es una puerta a validar para siempre. El
   `Referer` lo pone el navegador y otro sitio no puede fabricar uno del nuestro; se valida por
   origen, resolviéndolo, no por el texto. `detail` deja de viajar en la query.
8. **El CSS del head de rutas y layouts, también a fichero** (Pedro, 2026-10-31). Las rutas de
   `examples/basic` llevan `<style>` en su head, y su layout también: eso viaja en cada HTML
   igual que el de los componentes. La opción deja de ser solo de componentes y pasa a llamarse
   `css` (`"inline"` · `"link"`), en lugar del `componentStyles` de SDD-70.
