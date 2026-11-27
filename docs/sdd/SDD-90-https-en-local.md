# SDD-90 — HTTPS en local: un certificado de desarrollo y el proxy en HTTP/2

> **Estado:** `Borrador`.
> **Paquetes:** `@fudic/cli` · `@fudic/server` · `@fudic/vite` · `@fudic/diagnostics` ·
> documentación y tutoriales
> **Depende de:** BUG-50 (`fudic dev` y `fudic preview` de un workspace, con su proxy), SDD-73 (el
> `103 Early Hints`), SDD-81 (el servidor, `trustProxy` y las opciones de la preview), SDD-84 (las
> cabeceras de la app, HSTS) — todas en `Hecho`.
> **Rango de diagnósticos:** `FUD1600`–`FUD1609` (nuevo).
> **Decisiones de gramática:** ninguna.
> **Origen:** conversación con Pedro del 2026-11-27.
> **Cierra:** el CLI-27 de `docs/web/hallazgos-cli.md` y la parte de HSTS detrás de un proxy del
> hallazgo 95 de `docs/web/hallazgos-fudic.md`.
>
> **Qué añade en una frase.** `fudic cert` crea un certificado de desarrollo para `localhost`, sin
> dependencias, y lo deja como de confianza en el sistema del usuario con `--trust`; con él,
> `fudic preview --https` y `fudic dev --https` sirven todas las apps en HTTPS y HTTP/2 con el
> candado verde, y las apps de detrás saben que van por HTTPS: mandan HSTS y el `103 Early Hints`.

## 1. Contexto y objetivo

### 1.1. Lo que hay hoy

- **Fudic no sirve HTTPS.** La plantilla de `page.headers` trae `Strict-Transport-Security`, el
  `103 Early Hints` solo se manda a navegaciones por HTTP/2 (`wantsEarlyHints` en
  `@fudic/server`) y HTTP/2 en un navegador exige TLS. Nada de eso se puede ver con `fudic preview`
  ni con `fudic dev`.
- **El proxy de la CLI es HTTP/1.1 en claro.** `fudic dev` y `fudic preview` arrancan una preview
  de Vite por app y ponen delante un proxy de `node:http` (`packages/cli/src/serve/proxy.ts`). Si
  una app activa HTTPS en Vite (`@vitejs/plugin-basic-ssl` o `preview.https`), su preview arranca
  en HTTPS, el proxy le habla en claro y se queda en «starting» sin decir nada (CLI-27).
- **Un certificado autofirmado no sirve.** El navegador marca la página como no segura y hay que
  aceptarla a mano; con un certificado no válido, Chrome no guarda nada en caché, que es justo lo
  que se quiere medir.
- **HSTS no sale detrás de un proxy.** `@fudic/server` solo manda `Strict-Transport-Security` si
  la petición le llega por HTTPS (`server.ts`, `protocol === 'https:'`). Detrás del proxy le llega
  en claro (hallazgo 95).
- **Lo que se ha hecho para rodearlo.** El tutorial `early-hints` usa `pnpm preview` con
  `@vitejs/plugin-basic-ssl`, una sola app y el aviso del navegador. El tutorial `observatory`
  usa un túnel de Cloudflare para tener HTTPS. La medición del hallazgo 95 usó una autoridad
  local hecha a mano.

### 1.2. El modelo: el certificado de desarrollo de .NET

`dotnet dev-certs https` crea un certificado para `localhost` en el perfil del usuario; con
`--trust` lo añade al almacén de confianza del sistema; `--check` dice si existe y si es de
confianza; `--clean` lo borra; y el servidor de ASP.NET Core lo usa sin configurar nada. No es una
autoridad de certificación: es el certificado de `localhost`, que solo vale para `localhost`. Las
plantillas de React y Angular de .NET lo exportan en PEM y se lo dan a Vite.

### 1.3. Lo que decidió la conversación

- El mismo modelo que .NET, sin dependencias: la clave y la firma con `node:crypto`, y la
  codificación del certificado escrita a mano.
- TLS solo en el proxy de la CLI. Las previews de Vite de cada app siguen en HTTP detrás, en
  `127.0.0.1`: no hay que configurar nada en Vite.
- Las apps de detrás saben que el navegador va por HTTPS y por HTTP/2.

### 1.4. El objetivo

Que desde `web/apps`, `fudic preview --https` sirva `site`, `mcp` y `tutorials` en
`https://localhost:4173/` con el candado verde, en HTTP/2, con HSTS y con early hints, y que
Lighthouse y HTTP Observatory se puedan pasar en local sin túneles.

## 2. Dependencias

- **BUG-50.** `serveWorkspace`, el proxy de un solo puerto, `appsToServe` y el arranque de cada
  preview con su `vite` (`packages/cli/src/serve/`).
- **SDD-81.** `createServer`, las opciones que le da la preview (`serveOptions` en el plugin) y
  `trustProxy`: con él, `publicRequest` toma el protocolo y el host de `X-Forwarded-Proto` y
  `X-Forwarded-Host`.
- **SDD-73.** `wantsEarlyHints` y `hooksFor` en `@fudic/server/node`: el `103` solo va a
  navegaciones por HTTP/2.
- **SDD-84.** HSTS solo en las respuestas por HTTPS.

## 3. Interfaz pública

### 3.1. `fudic cert`

| Comando | Qué hace |
|---|---|
| `fudic cert` | Crea el certificado si no existe o ha caducado, y dice dónde está y si es de confianza |
| `fudic cert --trust` | Además, lo añade al almacén de confianza del usuario |
| `fudic cert --check` | Solo dice si existe, cuándo caduca y si es de confianza. Sale con 1 si falta algo |
| `fudic cert --clean` | Lo quita del almacén de confianza y borra sus ficheros |
| `fudic cert --export <carpeta>` | Copia `localhost.crt` y `localhost.key` a esa carpeta, para otra herramienta |

### 3.2. Dónde vive

`~/.fudic/https/localhost.crt` y `~/.fudic/https/localhost.key`, en PEM. Uno por usuario y para
todos los proyectos. La clave se escribe solo legible por el usuario. Nunca dentro de un
proyecto.

### 3.3. Qué certificado es

- Clave EC P-256; firma ECDSA con SHA-256.
- Sujeto y emisor: `CN=localhost, O=Fudic development`.
- Nombres alternativos: `DNS:localhost`, `IP:127.0.0.1`, `IP:::1`.
- `basicConstraints` con `CA:false`, `keyUsage` con `digitalSignature` y `extendedKeyUsage` con
  `serverAuth`.
- Un año de validez y un número de serie aleatorio de 16 bytes.

### 3.4. `--https` en `fudic preview` y `fudic dev`

```sh
fudic preview --https
fudic dev --https
```

- El proxy escucha en HTTPS y HTTP/2, con HTTP/1.1 para quien no hable HTTP/2.
- Sin certificado, lo crea, como `fudic cert`. Si no es de confianza, arranca igual y lo avisa
  (`FUD1601`).
- El aviso de arranque escribe `https://localhost:<puerto><base>` por cada app.

### 3.5. Lo que el proxy dice a las apps

En cada petición, con `--https`:

- `X-Forwarded-Proto: https`, `X-Forwarded-Host` con el host que pidió el navegador y
  `X-Forwarded-For`.
- `X-Fudic-Http2: 1` cuando el navegador habla HTTP/2.

Y la CLI arranca cada preview con `FUDIC_FRONT=https` en su entorno.

### 3.6. Lo que las apps hacen con ello

- **`@fudic/vite`.** Con `FUDIC_FRONT=https`, la preview y el dev server crean el servidor con
  `trustProxy: true` y `secureCookies: true`, como si sirvieran HTTPS ellos mismos.
- **`@fudic/server`.** Con `trustProxy`, `wantsEarlyHints` también acepta una navegación que trae
  `X-Fudic-Http2: 1`. Sin `trustProxy`, la cabecera no cuenta.
- El proxy reenvía al navegador el `103` que le llegue de la app, antes de la respuesta.

### 3.7. Los códigos

| Código | Severidad | Cuándo |
|---|---|---|
| `FUD1600` | error | El certificado no se puede crear o leer (permisos, disco) |
| `FUD1601` | aviso | El certificado no es de confianza: el navegador avisará. Dice cómo: `fudic cert --trust` |
| `FUD1602` | error | `--trust` no pudo añadirlo al almacén, con el motivo |
| `FUD1603` | info | En Linux, `--trust` no se hace solo: dice los pasos para Chrome y Firefox |

## 4. Comportamiento

### 4.1. Crear el certificado

1. `generateKeyPairSync('ec', { namedCurve: 'P-256' })`.
2. El `TBSCertificate` se codifica en DER a mano, con la clave pública que da
   `publicKey.export({ type: 'spki', format: 'der' })`.
3. `crypto.sign('sha256', tbs, privateKey)` da la firma, ya en DER.
4. El certificado se escribe en PEM, y se comprueba leyéndolo con `crypto.X509Certificate`: el
   sujeto, los nombres alternativos, las fechas y que `verify(publicKey)` es cierto. Si algo no
   cuadra, es `FUD1600` y no se escribe nada.
5. Caducado o a menos de 30 días de caducar, se crea uno nuevo al siguiente `fudic cert` o
   `--https`, y hay que volver a darle confianza (`FUD1601` lo dice).

### 4.2. Darle confianza

| Sistema | `--trust` | `--check` | `--clean` |
|---|---|---|---|
| Windows | `certutil -user -addstore Root <crt>`: almacén del usuario, sin administrador; Windows pide confirmarlo | `certutil -user -verifystore Root <serie>` | `certutil -user -delstore Root <serie>` |
| macOS | `security add-trusted-cert -r trustRoot -k <llavero de inicio de sesión> <crt>`; pide la contraseña | `security verify-cert -c <crt>` | `security delete-certificate -Z <huella>` |
| Linux | No se hace solo: `FUD1603` con los pasos (`certutil -d sql:$HOME/.pki/nssdb` para Chrome, el perfil de Firefox) | Se comprueba el fichero, no la confianza | Borra los ficheros |

Nunca se toca el almacén de confianza sin `--trust` o `--clean`.

### 4.3. El proxy en HTTP/2

- `http2.createSecureServer({ key, cert, allowHTTP1: true })` con la API de compatibilidad, para
  que la lógica del proxy siga siendo la misma.
- HTTP/2 no admite las cabeceras de conexión: antes de responder, el proxy quita de la respuesta
  de la app `connection`, `keep-alive`, `proxy-connection`, `transfer-encoding` y `upgrade`.
- Hacia la app, `:authority` pasa a `host`, y las pseudocabeceras no viajan.
- Un `103` de la app (el evento `information` de `node:http`) se reenvía con `writeEarlyHints`.
- Si el navegador cancela la petición, el proxy cancela la suya hacia la app (resuelve también el
  CLI-28).

### 4.4. `fudic dev --https`

- El WebSocket de la recarga de Vite va por HTTP/1.1 (`allowHTTP1`), con su `upgrade`, como hoy.
- El resto, igual que `preview`.

### 4.5. La documentación y los tutoriales

- Una página para `fudic cert`, y `--https` en las de `fudic dev` y `fudic preview`.
- El tutorial `early-hints` usa `fudic preview --https` en vez de `@vitejs/plugin-basic-ssl`, y
  el `103` se ve con varias apps detrás del proxy.
- `security-headers` y `observatory` pueden medir HSTS en local.
- «Las cabeceras» (`/docs/security/headers#hsts`) dice cómo verlo en local.

## 5. Invariantes

- La clave privada no sale del perfil del usuario, salvo con `--export`.
- Sin `--https`, `fudic dev` y `fudic preview` se comportan exactamente como hoy.
- Las previews de detrás siguen en HTTP y solo escuchan en `127.0.0.1`.
- `X-Fudic-Http2` y `X-Forwarded-*` solo cuentan con `trustProxy`; una app desplegada sin él no
  les hace caso.
- Ningún paso usa la red ni una dependencia nueva.

## 6. Criterios de aceptación

1. `fudic cert` crea `~/.fudic/https/localhost.crt` y `.key`; `crypto.X509Certificate` lo lee con
   sujeto `CN=localhost`, los tres nombres alternativos, un año de validez y la firma válida.
2. Un segundo `fudic cert` no crea otro; uno caducado, sí.
3. `fudic cert --check` sale con 1 sin certificado o sin confianza, y con 0 con los dos.
4. En Windows, `fudic cert --trust` lo deja en el almacén raíz del usuario, y `--check` lo ve.
5. `fudic cert --clean` lo quita del almacén y borra los ficheros.
6. `fudic cert --export ./certs` deja allí los dos ficheros.
7. Desde `web/apps`, `fudic preview --https` sirve las tres apps en `https://localhost:4173/`,
   `/mcp/` y `/tutorials/`, y `curl --http2` las recibe por HTTP/2.
8. Con el certificado de confianza, Chrome abre las tres sin aviso.
9. Las páginas llevan `Strict-Transport-Security` (la cabecera de `page.headers`).
10. Una navegación por HTTP/2 a una ruta con early hints recibe un `103` antes del `200`.
11. Sin `--https`, todo sale como antes (los tests de `serve` actuales, intactos).
12. Una app que no confía en el proxy (sin `trustProxy`) no manda `103` por `X-Fudic-Http2`.
13. `fudic dev --https` sirve y recarga al guardar un `.fud`.
14. Sin certificado de confianza, `--https` arranca y escribe `FUD1601`.
15. `pnpm typecheck`, `pnpm test` y la cobertura de cada paquete tocado en sus umbrales; el
    código nuevo de la CLI, al 100 %.

## 7. Fuera de alcance

- Una autoridad de certificación que firme otros nombres, como `mkcert`.
- Nombres que no sean `localhost` (la IP de la red local, un dominio propio).
- La confianza automática en Linux.
- HTTPS en producción: es del hosting.
- HTTP/3.

## 8. Decisiones

### 8.1. Abiertas, para Pedro

1. **La señal de HTTP/2.** `X-Fudic-Http2: 1` es una cabecera propia. No hay una estándar para
   decir a un servidor de detrás que el navegador habla HTTP/2. Propuesta: la propia, que solo
   cuenta con `trustProxy`.
2. **Dónde se guarda.** `~/.fudic/https/` en PEM, o en el almacén del sistema como .NET.
   Propuesta: en ficheros, porque funciona igual en los tres sistemas y Vite los puede usar.
3. **`--https` por defecto.** Que `fudic preview` sirva HTTPS sin pedirlo cuando hay un certificado
   de confianza. Propuesta: no; siempre con `--https`, para que nada cambie sin pedirlo.
4. **`fudic dev --https` en este SDD o después.** Propuesta: en este, porque comparte el proxy.
