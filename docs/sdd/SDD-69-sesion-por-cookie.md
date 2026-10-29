# SDD-69 — Sesión por cookie: fudic es un BFF y la sesión no la escribe el cliente

> **Estado:** `Listo` — [tareas](./SDD-69-Task.md).
> **Paquetes:** `@fudic/http` · `@fudic/transport` · `@fudic/vite` · `@fudic/testing` ·
> `@fudic/diagnostics` · `examples/basic`
> **Depende de:** 56 (`@fudic/http`: `ctx`, cadena, `csrf`, caché de datos del SW), 60 (el
> `.fudapi`: `middleware`, `load`, `use`), 67 (nace después: el cable ya es binario; esta spec no
> toca el formato), 68 (tras entrar o salir, la página se repinta con el `data` nuevo sin recargar)
> **Rango de diagnósticos:** `FUD1300`–`FUD1319` (nuevo). Usa `FUD1300`.
> **Decisiones de gramática:** ninguna.
> **Origen:** conversación del 2026-10-27 (revisión de IDEA-04 §4 y de `@fudic/http`).
> **Rama sugerida:** `sdd-69-sesion-por-cookie`
>
> **Qué añade en una frase.** Una función de servidor pone y quita la cookie de sesión con una
> llamada y con las opciones seguras ya puestas; lo que `load` escribe en la respuesta llega al
> navegador; lo que dependió de la sesión no se guarda en ninguna caché; y el ejemplo `usuarios`
> deja de guardar un token en `localStorage`.

---

## 1. Contexto y objetivo

fudic es un **BFF**: el navegador solo habla con el servidor de la propia app, en el mismo
origen. En un BFF la sesión va en una **cookie `HttpOnly`**, que el navegador manda sola en cada
petición y que ningún script de la página puede leer. Un token en `localStorage` es lo contrario:
cualquier script lo lee, hay que pegarlo a mano en cada llamada y la página que pinta el servidor
no lo ve nunca.

Media pieza ya existe:

- El servidor lee las cookies: `ctx.cookies` (`http/src/server/context.ts:29`).
- Las llamadas van con `credentials: 'same-origin'` (`http/src/contract/fn.ts:142`).
- `load` acepta `use auth` y recibe la petición (`http/src/server/load.ts`), así que la página que
  pinta el servidor sabe quién está dentro.
- El `csrf` (`http/src/csrf-client.ts`, `csrf-server.ts`) existe justo para que una página de otro
  sitio no pueda llamar con las cookies del usuario.

Y la otra media falta. Hoy, con cookies:

**1. Poner la cookie se escribe a mano.**

```ts
login.handle((ctx) => {
  ctx.response.headers.append('set-cookie', `sid=${id}; HttpOnly; Secure; SameSite=Lax; Path=/`);
});
```

Olvidar `HttpOnly` deja la sesión al alcance de cualquier script, y nada lo avisa.

**2. Lo que `load` escribe en la respuesta se pierde.** `pageContext` crea un `ctx.response`
nuevo para cada render (`http/src/server/context.ts:58`), y nadie lo lee después. El render del
servidor drena el HTML a un string y lo manda con sus cabeceras propias (`vite/src/serve.ts:127`,
`vite/src/plugin.ts:2476-2486`); el endpoint de datos manda solo `Content-Type`
(`plugin.ts:988-1010` en dev, `plugin.ts:1152-1175` en preview). Un `load` que renueva la sesión o
pone un status propio no consigue nada. Las funciones de servidor sí lo hacen bien:
`sendResponse` copia el status y todos los `Set-Cookie` (`vite/src/functions.ts:49-62`), en dev y
en preview.

**3. El Service Worker reparte datos de un usuario a otro.** Una ruta con `load` y sin parámetros
se renderiza en el SW (`vite/src/mode.ts`, `inferred`), y su `data` se guarda con la política
`cache-first` sin TTL por defecto (`vite/src/manifest.ts:61`). La caché se indexa solo por URL e
ignora `Vary` (`transport/src/store.ts:151`, `ignoreVary: true`); y `fromNetwork` guarda toda
respuesta 200, aunque la política sea `network-only` (`store.ts:183-199`). Resultado: Ana entra,
visita `/cuenta`, sale; Luis entra en el mismo navegador y ve la cuenta de Ana.

**4. El ejemplo enseña lo que no se debe hacer.** `examples/basic/src/browser/auth.ts` guarda el
token en `localStorage` y lo pega en cada llamada con `auth.client`; `usuarios.fud` repite el token
en un `signal` con su `effect`. El README de `@fudic/http` enseña lo mismo (líneas 120-150).

Esta spec cierra las cuatro. **El cliente no escribe nada para tener sesión**: la cookie viaja
sola, la pone y la quita una función de servidor, y fudic se encarga de que no acabe en una caché.

## 2. Dependencias

| SDD | Qué aporta |
|---|---|
| 56 | `ServerContext` con `cookies` y `response` (`http/src/types.ts`), la cadena y sus mitades, `csrf`, `error-pages`, la caché de datos del SW y su invalidación (§4.9). |
| 60 | El `.fudapi`: `middleware` con `client`/`server`/`adds`, `load` con `use`, las funciones y su `handle`. |
| 67 | El formato del cable. Esta spec no lo toca: solo cabeceras. |
| 68 | Tras una llamada que cambia algo, la vista se repinta con el `data` nuevo sin `location.reload()`. El ejemplo lo usa al entrar y al salir. |

## 3. Interfaz pública

### 3.1. Poner y quitar una cookie

```ts
// @fudic/http
export interface CookieOptions {
  /** Seconds. Absent: the cookie lasts until the browser closes. */
  readonly maxAge?: number;
  readonly expires?: Date;
  /** Default: '/'. */
  readonly path?: string;
  /** Absent: this host only. */
  readonly domain?: string;
  /** Default: 'lax'. */
  readonly sameSite?: 'strict' | 'lax' | 'none';
  /** Default: true, except when the request's host is localhost, 127.0.0.1 or [::1]. */
  readonly secure?: boolean;
  /** Default: true. */
  readonly httpOnly?: boolean;
  /** Default: false. */
  readonly partitioned?: boolean;
}

/** Appends a `Set-Cookie` to `ctx.response`. Throws a TypeError on a name or option the browser would reject. */
export function setCookie(ctx: ServerContext, name: string, value: string, options?: CookieOptions): void;

/** Expires `name` in the browser: same name, path and domain, `Max-Age=0`. */
export function deleteCookie(ctx: ServerContext, name: string, options?: Pick<CookieOptions, 'path' | 'domain'>): void;

/** The `Set-Cookie` text of a cookie, without touching any context. */
export function serializeCookie(name: string, value: string, options: CookieOptions & { readonly host: string }): string;
```

- El valor se escribe con `encodeURIComponent`; `parseCookies` ya lo decodifica al leer.
- Lo que el navegador rechazaría en silencio **lanza un `TypeError`** con el motivo: un nombre que
  no es un *token* de HTTP (vacío, con espacios, `;`, `=`…), `sameSite: 'none'` sin `secure`,
  `partitioned` sin `secure`. Es código de servidor del desarrollador: falla en su primera prueba,
  no en la de un usuario.
- Leer sigue siendo `ctx.cookies.get(name)`. Nada nuevo.

Uso:

```ts
// src/server/usuarios.ts
import { deleteCookie, setCookie } from '@fudic/http';
import { login, logout } from 'fudic:routes/usuarios';

login.handle((ctx) => {
  setCookie(ctx, 'fudic-session', ctx.args.user);
});

logout.handle((ctx) => {
  deleteCookie(ctx, 'fudic-session');
});
```

### 3.2. Lo que depende de la sesión se marca solo

El `ctx` de servidor **anota si se leyó la sesión**. Cuenta como leerla:

- cualquier lectura de `ctx.cookies` (`get`, `has`, `size`, recorrerla), aunque no haya cookie;
- `ctx.headers.get('cookie')` o `ctx.headers.get('authorization')` (y `has` de las dos).

Si se leyó, y el handler no puso ya su propio `Cache-Control`, la respuesta sale con:

```
Cache-Control: private, no-store
```

Vale para las tres respuestas del servidor: la de una función, la del endpoint de datos y la de
una página. Quien quiera otra cosa pone su `Cache-Control` en `ctx.response.headers` y fudic no lo
toca.

### 3.3. El `ctx` de un render recibe la respuesta de quien lo sirve

```ts
// @fudic/transport — RenderContext
export interface RenderContext {
  // … lo que ya tiene
  /** Where `load` and `layout` write their status and headers. Absent in the Service Worker. */
  readonly response?: { status: number; readonly headers: Headers };
}
```

`pageContext` usa ese objeto si viene y solo crea uno nuevo si no viene. Quien sirve la página o el
endpoint de datos lo crea, llama a `render` o a `data`, y al responder aplica su status (si no es
200) y todas sus cabeceras, con los `Set-Cookie` uno a uno.

### 3.4. El código nuevo

| Código | Severidad | Título (`.md`) | Cuándo | Dónde |
|---|---|---|---|---|
| `FUD1300` | error | A prerendered page reads the session | El prerender de una ruta ha leído la sesión (§3.2) en su `load` o su `layout` | El `.fudapi` de la ruta, en su `load` |

**Fix:** «a page that depends on who is asking is rendered per request: write `load ssr`».

## 4. Comportamiento

### 4.1. La cookie de sesión: opciones por defecto

Sin opciones, `setCookie(ctx, 'sid', v)` escribe:

```
sid=v; Path=/; HttpOnly; Secure; SameSite=Lax
```

- **`HttpOnly`**: ningún script de la página la lee. Es lo que separa una sesión por cookie de un
  token en `localStorage`.
- **`SameSite=Lax`**: el navegador no la manda en un `POST` que viene de otro sitio, y sí al llegar
  desde un enlace externo, así que quien entra por un enlace sigue dentro. `Strict` lo rompería.
- **`Secure`**: solo viaja por HTTPS. **Excepto** cuando el host de la petición es `localhost`,
  `127.0.0.1` o `[::1]`: ahí se omite, porque el dev server y `vite preview` van por `http` y algún
  navegador no guarda una cookie `Secure` que llega por `http`. El host sale de `ctx.url`, que el
  adaptador construye con la cabecera `Host` (`functions.ts`, `toRequest`).
- **`Path=/`**.
- Cualquier opción se cambia pasándola. Nada se prohíbe salvo lo que el navegador rechazaría
  (§3.1).

### 4.2. Lo que escribe `load` llega al navegador

- **Página servida por el servidor** (dev y `vite preview`): el render recibe un `response` (§3.3);
  `load`, `layout` y su cadena escriben en él; al terminar el render, el HTML sale con el status y
  las cabeceras de ese objeto, más las propias de fudic (`Content-Type`, la CSP con su nonce). Si
  `load` y fudic escriben la misma cabecera, gana fudic solo en `Content-Type` y
  `Content-Security-Policy`; en las demás gana `load`.
- **Endpoint de datos** (dev y preview): igual, con el JSON o lo que devuelva `data`.
- **Error**: si `load` lanza, la respuesta es la página de error de siempre (SDD-56 §4.8); las
  cabeceras que `load` hubiera escrito antes de lanzar **sí** se aplican (un `deleteCookie` antes de
  `throw unauthorized()` debe llegar).
- **Prerender**: no hay petición ni navegador al que mandar nada; el `response` se descarta. Ver
  §4.4.
- Funciona porque el primer byte sale después de que `load` termine. SDD-70 (`@await`) mantiene esa
  regla: lo que decide el status y las cabeceras se resuelve antes del primer byte.

### 4.3. Lo que dependió de la sesión no se guarda

- **En el servidor**: la respuesta lleva `Cache-Control: private, no-store` (§3.2). Una CDN o el
  caché HTTP del navegador no la guardan.
- **En el Service Worker**: el `store` **no guarda** una respuesta cuyo `Cache-Control` contiene
  `no-store` o `private`, con cualquier política, y la sirve igual. Con una que ya estuviera
  guardada para esa URL, la borra al recibir la nueva: lo que hoy depende de la sesión no convive
  con una copia de cuando no dependía.
- **Las páginas que el SW persiste** (`page persist`): una página renderizada con un `data` que
  llegó con `no-store` no se persiste.
- Con esto, entrar y salir no necesitan invalidar nada: lo que dependía de quién eras nunca se
  guardó.

### 4.4. Un prerender que lee la sesión es un error

Un prerender no tiene petición: su `ctx.cookies` está vacío y su HTML se escribe una vez para todos.
Si su `load` o su `layout` leen la sesión, la página queda congelada en «nadie ha entrado» para
siempre. El prerender comprueba la anotación de §3.2 después de cada render y, si se leyó, da
`FUD1300` sobre la ruta y el build falla. El arreglo es `load ssr`.

### 4.5. El cliente no escribe nada

- La cookie la manda el navegador: `fetch` con `credentials: 'same-origin'`, ya hoy.
- Un `middleware auth` con solo mitad de servidor no pide implementación en `src/browser`:

```
middleware auth
  server
  adds
    user  User
```

- El `csrf` no cambia y no se vuelve obligatorio: con `SameSite=Lax` por defecto, el navegador ya no
  manda la cookie en un `POST` de otro sitio; `use csrf` añade la segunda comprobación para quien la
  quiera, como hoy.
- El token por cabecera **sigue funcionando**: una mitad de cliente que pone `authorization` es tan
  válida como antes. La cookie es el camino que enseñan el ejemplo y el README, no el único.

### 4.6. `@fudic/testing` guarda la cookie como un navegador

El servidor en memoria de `@fudic/testing` guarda en `document.cookie` lo que llega en
`Set-Cookie` (`testing/src/fetch.ts`, `keepCookies`). El DOM de los tests, como un navegador,
ignora una cookie `HttpOnly` escrita desde un script, así que hoy una cookie de sesión se perdería.
`keepCookies` quita el atributo `HttpOnly` antes de guardarla: en un test no hay script atacante, y
lo que importa es que la siguiente llamada la lleve. `forgetCookies` sigue vaciando el bote entre
tests.

### 4.7. El ejemplo `usuarios`, por cookie

- **Fuera:** `src/browser/auth.ts`, el `TOKEN_KEY`, el `signal` `token`, su `effect` y las funciones
  `entrar`/`salir` que escribían en `localStorage`.
- **`middlewares/auth.fudapi`**: solo `server` y `adds`.
- **`server/auth.ts`**: lee `ctx.cookies.get('fudic-session')`; sin cookie, `unauthorized('sin
  sesión')`; con una que el servicio no conoce, `forbidden` (lleva a `/entrar`, como hoy). El
  servicio `Tokens` pasa a llamarse `Sessions` y sigue siendo una demo: el valor de la cookie es el
  nombre, y solo `ana` y `luis` son válidos.
- **`usuarios.fudapi`**: `load ssr` añade `session str?` (el valor de la cookie tal cual, o nada:
  la demo enseña también la sesión falsa); dos funciones
  nuevas, `post login` con `user str` y `post logout`. `login` acepta cualquier nombre y pone la
  cookie; quien no es `ana` ni `luis` recibe el 403 en su siguiente llamada protegida, igual que hoy
  el «token falso».
- **`usuarios.fud`**: «Sesión: Ana» o «Sesión: ninguna», leído de `data.session`; los botones
  *Entrar como Ana*, *Entrar con una sesión falsa* y *Salir* llaman a `login` y `logout`, y la página
  se repinta con el `data` nuevo (SDD-68). El texto explica que la cookie es `HttpOnly` y que se ve
  en *Application → Cookies*, no en `document.cookie`.
- **`/entrar`**: dice «sesión» donde decía «token».
- **Ruta nueva `/cuenta`** (`cuenta.fud` + `.fudapi` + su handler): un `load` sin modo declarado
  (se renderiza en el SW) que lee la sesión y pinta «Hola, Ana» o «No has entrado». Es la prueba de
  §4.3.

## 5. Invariantes

- **El cliente no toca la sesión.** Ningún fichero de `src/browser` ni de `@code` del ejemplo lee o
  escribe la cookie ni un token.
- **Lo que dependió de la sesión no se guarda** en el SW ni con `Cache-Control` público, salvo que
  el handler ponga su propio `Cache-Control`.
- **Lo que escribe `load` llega**: status y cabeceras, también los `Set-Cookie` repetidos.
- **Nada se prohíbe** salvo lo que el navegador rechazaría en silencio.
- **El runtime de navegador no crece**: `setCookie`, `deleteCookie` y la anotación son de servidor;
  el cambio del SW es una comprobación en `store.ts`.
- **Cobertura:** lo nuevo al 100 % en las cuatro métricas; ningún umbral baja.

## 6. Criterios de aceptación

**La cookie**

1. `setCookie(ctx, 'sid', 'a b')` sobre una petición a `https://app.dev/` añade exactamente
   `sid=a%20b; Path=/; HttpOnly; Secure; SameSite=Lax`; sobre `http://localhost:5173/`, lo mismo
   sin `Secure`.
2. Cada opción de `CookieOptions` aparece en el texto con su nombre de atributo (`Max-Age`,
   `Expires` en formato HTTP, `Domain`, `SameSite=Strict|Lax|None`, `Partitioned`); `secure: false`
   y `httpOnly: false` los quitan.
3. Dos `setCookie` en la misma respuesta dan dos `Set-Cookie`.
4. `deleteCookie(ctx, 'sid')` añade `sid=; Path=/; Max-Age=0`; con `path` y `domain`, los repite.
5. Lanzan `TypeError`: un nombre vacío, con espacio, con `;` o con `=`; `sameSite: 'none'` con
   `secure: false`; `partitioned: true` con `secure: false`.
6. `serializeCookie` da el mismo texto que `setCookie` para el mismo host.

**La anotación**

7. Una función cuyo handler lee `ctx.cookies.get('x')` (exista o no) responde con
   `Cache-Control: private, no-store`; una que lee `ctx.headers.get('authorization')`, igual; una
   que no lee ninguna, sin `Cache-Control`.
8. Un handler que lee la sesión y pone `Cache-Control: max-age=60` sale con `max-age=60`.
9. Leer otra cabecera (`ctx.headers.get('accept')`) no marca nada.

**Lo que escribe `load`**

10. En dev y en `vite preview`, una página cuyo `load` llama a `setCookie` dos veces responde con
    los dos `Set-Cookie`; con `ctx.response.status = 203`, con 203; su `Content-Type` y su CSP son
    los de fudic.
11. El endpoint de datos de esa misma ruta responde con los mismos `Set-Cookie` y status.
12. Un `load` que llama a `deleteCookie` y después lanza `unauthorized()` da la página de error con
    el `Set-Cookie` de borrado.
13. Un `load` que lee la sesión sale con `Cache-Control: private, no-store`, en la página y en el
    endpoint de datos.

**El Service Worker**

14. `store.get` con cualquier política devuelve una respuesta con `Cache-Control: no-store` (o
    `private`) y no la guarda; si había una copia guardada de esa URL, ya no está.
15. Una respuesta sin `Cache-Control`, o con uno público, se guarda como hoy.
16. Una página `page persist` renderizada con un `data` que llegó `no-store` no se persiste.

**El prerender**

17. Una ruta `load ssg` cuyo `load` lee `ctx.cookies` da `FUD1300` sobre su `load` y el build
    falla; la misma con `load ssr`, nada; una `ssg` que no lee la sesión se prerenderiza como hoy.

**`@fudic/testing`**

18. Un test monta un componente, llama a una función que hace `setCookie` con las opciones por
    defecto, y la siguiente llamada lleva la cookie en `cookie`; `forgetCookies` la quita.

**El ejemplo, como lo usaría alguien**

19. `src/browser/auth.ts` no existe; `grep` de `localStorage` y `authorization` en
    `examples/basic/src` no encuentra nada.
20. `user-form.test.ts` entra por `login` en lugar de `localStorage` y sus tres tests pasan.
21. **En el navegador** (`pnpm --filter @fudic/example-basic dev`, y otra vez en `preview`), sin
    abrir ningún fichero:
    - `/usuarios` dice «Sesión: ninguna». *Activo* lleva a la página de error con «sin sesión».
    - *Entrar como Ana*: dice «Sesión: Ana» sin recargar. En DevTools, *Application → Cookies*
      muestra `fudic-session` con `HttpOnly`, `SameSite Lax` y, en `localhost`, sin `Secure`. En la
      consola, `document.cookie` no la muestra.
    - *Activo* cambia y sobrevive a una recarga; en *Network*, la petición lleva la cookie y ninguna
      cabecera `authorization`.
    - *Entrar con una sesión falsa* y *Activo*: lleva a `/entrar`, que habla de sesión.
    - *Salir*: «Sesión: ninguna»; la cookie ya no está en *Application*.
    - `/cuenta` como Ana dice «Hola, Ana». *Salir*, entrar como Luis, volver a `/cuenta`: «Hola,
      Luis», nunca «Ana». En *Application → Cache Storage* no hay ninguna entrada de datos de
      `/cuenta`.
22. `tests/usuarios.spec.ts` (Playwright) cubre el criterio 21 sin `localStorage`: entra, comprueba
    la cookie con `context.cookies()` (`httpOnly: true`), cambia, sale y repite lo de `/cuenta` con
    dos usuarios.

**Entrega**

23. `FUD1300` tiene `.ts`, `.md` y línea en `index.ts`. El README de `@fudic/http` enseña la sesión
    por cookie (§3.1, §4.5) en lugar del token en `localStorage`. `pnpm typecheck`, `pnpm test` y
    `pnpm build` en verde; lo nuevo al 100 %; ningún umbral baja.

## 7. Fuera de alcance

- **El formato del cable** (binario por defecto): SDD-67.
- **Repintar sin recargar** tras una llamada: SDD-68. Aquí solo se usa.
- **`@await` y la página por trozos**: SDD-70. Solo se fija que lo que escribe `load` sale antes
  del primer byte (§4.2).
- **Un almacén de sesiones** (qué id se guarda, dónde, cuánto dura): es del backend de la app. El
  ejemplo usa un servicio de memoria.
- **Firmar o cifrar la cookie**: el valor es un id opaco que el servidor busca; quien quiera firmarlo
  lo hace antes de `setCookie`.
- **OAuth, OpenID y proveedores externos.**
- **Un adaptador de producción** distinto de `vite preview`: no existe hoy. El contrato que usará
  (`render` y `data` con su `response`, §3.3) queda fijado aquí.

## 8. Decisiones

### 8.1. Tomadas al redactar

1. **Tres funciones planas en `@fudic/http`, no un objeto «sesión».** `setCookie`, `deleteCookie` y
   `serializeCookie`. fudic no sabe qué es una sesión de la app (un id, un usuario, varios datos);
   sabe poner bien una cookie. Leer ya es `ctx.cookies`.
2. **`HttpOnly`, `SameSite=Lax` y `Path=/` por defecto; `Secure` salvo en `localhost`.** Es lo
   seguro sin que nadie lo pida. `Lax` y no `Strict`: `Strict` saca de la sesión a quien llega por
   un enlace. La excepción de `localhost` es para que el dev server funcione en todos los
   navegadores; se decide por el host porque la URL que construye el adaptador es siempre `http`.
3. **Solo se lanza lo que el navegador rechazaría en silencio.** Un nombre inválido o `None` sin
   `Secure` no dan error en ningún sitio: la cookie desaparece y nadie sabe por qué. Lo demás es
   decisión del usuario y no se prohíbe.
4. **Marcar «privado» por lectura, no por configuración.** El servidor ve si la respuesta leyó la
   sesión; pedírselo al usuario sería pedirle que no se olvide. Leer `authorization` cuenta también,
   para que el camino por token (que sigue permitido) tenga la misma protección.
5. **El SW respeta `no-store` y `private`, con cualquier política.** Es el estándar HTTP y cierra la
   fuga sin que entrar o salir tengan que invalidar nada. Por eso no hace falta un mensaje de
   «cambió la sesión».
6. **`FUD1300` es error.** Un prerender que lee la sesión pinta una página para nadie y la sirve a
   todos: eso rompe. Se detecta al prerenderizar, que es cuando se sabe; antes, el compilador no ve
   qué lee un handler.
7. **`csrf` no se vuelve obligatorio.** Con `SameSite=Lax` por defecto el navegador ya protege los
   `POST` de otro sitio; `use csrf` queda como la segunda comprobación que el usuario elige.
8. **El token por cabecera no se retira.** La cookie es el camino que se enseña; quitar el otro
   sería decidir por el usuario.
9. **`@fudic/testing` quita `HttpOnly` al guardar.** Su bote es `document.cookie`, que no acepta
   `HttpOnly` desde un script; en un test no hay script del que protegerse.
10. **`/cuenta` como ruta nueva del ejemplo.** `/usuarios` es `load ssr` y nunca pasa por la caché
    del SW; la fuga de §1.3 solo se ve en una ruta que se renderiza en el SW.
11. **En la respuesta de una página, fudic gana solo en `Content-Type` y en la CSP.** Son las dos que
    rompen el render si `load` las cambia; el resto es del usuario. En dev, donde fudic no manda CSP
    para que viva el cliente de HMR, la que hubiera puesto `load` se quita.

### 8.2. Tomadas al implementar

12. **El `Cache-Control` de una página lo pone el wrapper de la ruta, no quien sirve.** El chunk de
    una ruta lleva su propia copia de `@fudic/http` y el plugin no depende de él: el wrapper llama a
    `markPrivate` al terminar `load` y `layout` (también si lanzan), y el servidor solo copia las
    cabeceras.
13. **La anotación vive en `ctx.response`, bajo `Symbol.for('fudic.sessionRead')`.** Es el único objeto
    que llega intacto por una cadena que copia el `ctx`, y el símbolo registrado deja que el prerender
    la lea por forma, desde otra copia del paquete.
14. **El error de una función también lleva lo que el handler escribió antes de lanzar**, como el de
    `load` (§4.2): un `deleteCookie` antes de `throw` llega en los dos.
15. **`/usuarios` lleva también *Entrar como Luis*.** El criterio 21 entra como Luis y §4.7 solo
    tenía botón para Ana.
16. **`/usuarios` se hidrata al primer gesto, no al cargar.** Sin el `effect` del token no lee nada
    al cargar; el gesto se repite al levantarse, así que no se pierde ningún clic. Los e2e esperan
    a `fud:ready` en vez de a la hidratación de la ruta.
17. **Salió [BUG-61](./bugs/BUG-61-filas-movidas-al-repintar.md)**: el primer repintado tras hidratar
    movía filas en su sitio. Lo tapaba el repintado que forzaba el `effect`. Arreglado en su rama y
    mergeado aquí.
