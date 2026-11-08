# SDD-81 — Ficheros: el tipo `file` del `.fudapi`, de la vista al servidor y de vuelta

> **Estado:** `Listo` (2026-11-08) — [tareas](./SDD-81-Task.md).
> **Paquetes:** `@fudic/api` · `@fudic/http` · `@fudic/core` · `@fudic/forms` · `@fudic/compiler` · `@fudic/config` ·
> `@fudic/vite` · `@fudic/testing` · `@fudic/language-core` · `@fudic/language-server` · `@fudic/vscode` ·
> `@fudic/diagnostics` · `@fudic/mcp` (guía) · `examples/basic`
> **Depende de:** 34 (formularios), 56 (funciones de servidor, `form:=`), 60 (reglas del `.fudapi`),
> 67 (`fud-bin` por defecto, `use json`, el pipeline de subida), 68 (`task`), 74 (`catches`, `fails`),
> 80 (`$value`). Todas en `Hecho` salvo la 80, que tiene que estar en `Hecho` antes de empezar.
> **Rango de diagnósticos:** `FUD1480`–`FUD1499` (nuevo).
> **Decisiones de gramática:** 181 (`file` en el `.fudapi`), 182 (`<input type="file">` y `$value`).
> Enmienda la 178.
> **Origen:** conversación con Pedro del 2026-11-08, al estudiar la nota 5 de `docs/PENDIENTE.md`.
> **Rama sugerida:** `sdd-81-ficheros`, desde `main`.
>
> **Qué añade en una frase.** Un fichero se declara en el `.fudapi` como cualquier otro tipo
> (`avatar file`, `docs file[]`, `-> file`), se elige con un `<input type="file">` ligado a un
> formulario, sube en streaming como `multipart/form-data` con el resto de argumentos en el formato de
> la función, llega al handler como un `File` estándar con sus límites ya comprobados, y vuelve como
> descarga que un `<a href>` puede enlazar.

---

## 1. Contexto y objetivo

### 1.1. Lo que hay hoy

- **El `.fudapi` no tiene tipo para un fichero.** `PRIMITIVES` ([types-check.ts:20](../../packages/api/src/types-check.ts))
  no lo tiene; `avatar file` es `FUD1080` (tipo desconocido).
- **La vista lo rechaza.** `<input type="file" :=@form.avatar>` da `FUD0592` con el motivo `file`
  ([control.ts:158](../../packages/compiler/src/binding/control.ts)): SDD-34 §7 lo dejó fuera por
  multipart.
- **Todo el cuerpo en memoria, en los dos lados.** El cliente codifica los argumentos en un
  `Uint8Array` y lo comprime entero ([compress.ts](../../packages/http/src/client/stages/compress.ts));
  el servidor lee el cuerpo con `request.arrayBuffer()` ([body.ts:17-37](../../packages/http/src/server/body.ts))
  y la respuesta con `response.arrayBuffer()` ([codec.ts:34-45](../../packages/http/src/client/codec.ts)).
  `sendResponse` de Vite también la junta entera ([functions.ts:53-61](../../packages/vite/src/functions.ts)).
- **No hay límite de cuerpo en ningún sitio.** Un POST de 4 GB se lee entero antes de mirar nada.
- **No se comprueba el tipo por sitio.** Un argumento de ruta o de query acepta cualquier primitivo
  (`scalar()`, [validate.ts:240-243](../../packages/api/src/validate.ts)); un campo de `load`, cualquier
  tipo.
- **Una función `get` no da su URL.** El stub la construye para llamar
  ([fn.ts:146](../../packages/http/src/contract/fn.ts)), pero no hay forma de ponerla en un `href`.

### 1.2. Lo que decidió la conversación

1. **`file` es un tipo del `.fudapi`**, con `file?` y `file[]` como los demás.
2. **Una llamada que lleva ficheros viaja como `multipart/form-data`, en binario y en JSON.** El resto
   de argumentos va en una parte, `$args`, en el formato de la función (`fud-bin` o JSON); cada
   fichero, en su parte. Nuestro formato no se abandona: va dentro. Se descartó meter los bytes del
   fichero en `fud-bin` por cuatro motivos (§8.1.1).

### 1.3. El objetivo

Que esto funcione, con el editor ayudando en cada línea:

```
# src/routes/usuarios/nuevo.fudapi
put save
  use auth
  form personForm
  -> Person

get avatar
  id  i32
  -> file?

get exportar
  -> file

form personForm
  name    str = ""
    required              "Escribe tu nombre."
  avatar  file?
    accept "image/png, image/jpeg"  "Tiene que ser PNG o JPEG."
    max-size 2mb                     "Como mucho {n}."
```

```html
<form form:=@form @fudic:result=@guardado>
  <input name="name" :=@form.name>
  <input type="file" :=@form.avatar>
  @if (form.$progress()) {
    <progress value=@form.$progress().loaded max=@form.$progress().total></progress>
  }
  <button>Guardar</button>
</form>

<img src=@avatar.url({ id: p.id }) alt="">
<a href=@exportar.url({}) download>Exportar CSV</a>
```

```ts
// src/server/usuarios.ts
save.handle(async (ctx) => {
  const { name, avatar } = ctx.form;          // avatar: File | null, ya comprobado
  const person = inject(Users).add({ name });
  if (avatar !== null) await inject(Avatars).put(person.id, avatar);
  return person;
});

avatar.handle(async (ctx) => inject(Avatars).get(ctx.args.id));   // File | undefined
exportar.handle(() => new File([inject(Users).csv()], 'personas.csv', { type: 'text/csv' }));
```

---

## 2. Dependencias

| SDD | Qué aporta |
|---|---|
| 34 | Los controles tipados de `@fudic/forms`, `TypeTag`, los `bind*` del DOM, `FUD0592` |
| 56 | `form:=`, `fudic:result`/`fudic:error`, el stub de una función y su endpoint `/_fudic/fn/…` |
| 60 | Las reglas del `.fudapi` (`rule`, `on field`, `runs both`) y las seis de `@fudic/forms` |
| 67 | `Wire` (`fud-bin` y JSON), `conform`, el pipeline de subida (`encode`, `compress`), `bodyArgs` |
| 68 | `task`: `run`, `cancel`, `pending`, `value`, `state` |
| 74 | `catches`, los `fails` con código |
| 80 | `$value` en los argumentos de un handler (decisión 178) |

Ninguna dependencia npm nueva. El lector de multipart es propio (§4.4).

---

## 3. Interfaz pública

### 3.1. El tipo en el `.fudapi` (decisión 181)

| Se escribe | TS en un argumento o un campo de `type` | TS en un campo de `form` |
|---|---|---|
| `file` | `File` | `File \| null` |
| `file?` | `File \| undefined` | `File \| null` |
| `file[]` | `readonly File[]` | `readonly File[]` |

`File` es el estándar de la plataforma: existe en el navegador, en Node ≥ 20 y en los runtimes de
borde.

**Dónde vale y dónde no:**

| Sitio | ¿`file`? | Si no |
|---|---|---|
| Argumento de cuerpo de `post`, `put`, `patch`, `delete` | Sí | — |
| Campo de un `form` | Sí | — |
| `->` de cualquier función (también `get`) | Sí | — |
| Campo de un `type`, a cualquier profundidad, si ese `type` solo se usa donde vale | Sí | — |
| Argumento de una `get`, de ruta o de query | No | `FUD1480` |
| Campo de `load`, `layout`, un `type` que alcanzan, o `paths` | No | `FUD1481` |
| Clave de un `map` | No | `FUD1089` (ya existe) |
| Parámetro de una `rule` o de un `fails` | No | `FUD1483` |
| Valor inicial de un campo de `form` (`avatar file = …`) | No | `FUD1482` |

Un `type` que lleva un fichero y se usa en un sitio donde no vale da el código de ese sitio sobre el
uso, con un `related` al campo que lleva el fichero.

### 3.2. Las reglas de un fichero

`@fudic/forms` gana dos reglas en `rules.fudapi`, `runs both`, y dos cambian de tipos:

```
# The file is no bigger than n bytes. An empty field is required's business.
rule max-size
  on field file file[]
  runs both
  n  f64
  fails max-size n

# The file's type is one the list accepts: the syntax of the HTML accept attribute.
rule accept
  on field file file[]
  runs both
  types  str
  fails accept types
```

- `required` ya vale para `*`: un `file` vacío es `null`, un `file[]` vacío es `[]`.
- `min-length` y `max-length` ya valen para `*[]`: en `file[]` cuentan ficheros.
- `max-size` en `file[]` mira cada fichero, no la suma.
- Las dos son reglas de argumento (`ARG_RULES`): valen debajo de un argumento de función, no solo en
  un `form`.

**Tamaños con unidad.** Un argumento numérico de una regla acepta `kb`, `mb` y `gb` pegados al
número (`2mb`, `500kb`, `1.5gb`), en base 1024. Se guarda en bytes. En el texto, `{n}` de `max-size`
se pinta con su unidad (`2 MB`).

**Argumento de texto.** Un argumento `str` de una regla se escribe entre comillas
(`accept "image/png, .pdf"`). Si la regla lleva texto, va detrás, también entre comillas.

**`accept` sigue la sintaxis del atributo HTML**: tipos MIME (`image/png`), comodines (`image/*`) y
extensiones (`.pdf`), separados por comas. Se comprueba contra el `type` del `File` y contra la
extensión de su nombre; vale si casa uno de los dos.

### 3.3. El cable

**Una llamada cuya firma puede llevar un fichero** (algún argumento, campo de `form` o campo de un
`type` alcanzado es `file`) **viaja siempre como `multipart/form-data`**, lleve ficheros esa vez o no.
Las demás no cambian.

```
POST /_fudic/fn/routes/usuarios/nuevo/save
content-type: multipart/form-data; boundary=…

--…
content-disposition: form-data; name="$args"
content-type: application/fud+bin                 (o application/json con use json)

<los argumentos que no son fichero, en el formato de la función>
--…
content-disposition: form-data; name="avatar"; filename="yo.png"
content-type: image/png

<los bytes>
--…--
```

- **Nombre de cada parte:** el camino del fichero dentro de los argumentos, con puntos. Un campo
  (`avatar`), un elemento de lista (`fotos.0`), un campo dentro de un `type` (`doc.adjunto`), una
  entrada de `map` por su posición (`anexos.2`). `$` no vale en un nombre del `.fudapi`, así que
  `$args` no choca con nada.
- **En `$args` un hueco `file` no escribe nada.** Ni en `fud-bin` (tampoco su bit de nulo) ni en JSON
  (la clave no está). Los dos extremos conocen los tipos: un `file?` sin parte es ausente; un `file[]`
  son las partes `x.0`, `x.1`… seguidas, y sin ninguna es `[]`.
- **La firma** (`sig`, SDD-67) cambia para estas funciones: el `file` entra en la firma canónica con su
  propia etiqueta. Un cliente viejo contra un servidor nuevo da el 409 de firma de siempre.
- **Sin `compress`.** Una llamada multipart no pasa por la etapa `compress` (§8.1.4).
- **CSRF**: el mismo de toda llamada.

**La vuelta:**

| `->` | Respuesta |
|---|---|
| `file` | El cuerpo es el fichero. `content-type` el del `File` (`application/octet-stream` si no tiene), `content-disposition: inline; filename*=UTF-8''<nombre>`, `content-length`, `last-modified` |
| `file?` ausente | `204` |
| Un `type` o una lista que llevan ficheros | `multipart/form-data`: la parte `$value` en el formato de la función y una parte por fichero, con los mismos nombres que la ida |

El cliente reconstruye cada fichero como `File` con su nombre, su tipo y su `lastModified`.

**Un problema** (4xx, 5xx) viaja como hoy, en el formato de la función, nunca en multipart.

### 3.4. El cliente

```ts
// Lo que gana el stub de una función:
interface GetStub<A> {
  /** The URL that calls it, for a href or a src: the page's params and base already in. */
  url(args: A): string;
}

// Lo que gana task (SDD-68):
interface Task<A, R> {
  /** Bytes moved by the call in flight: the upload first, then the download; null when none is. */
  progress(): { readonly loaded: number; readonly total: number | null; readonly phase: 'up' | 'down' } | null;
}
```

- `url(args)` existe en toda función `get`. Codifica los argumentos como la llamada (`?a=` en el
  formato de la función). Es lo que un `<a href>`, un `<img src>` o un `<video src>` necesitan, y el
  navegador hace la petición sin JS.
- **La subida con progreso.** Una llamada multipart sale por `XMLHttpRequest`, la única API del
  navegador que da el progreso de subida en todos los motores. El resto sigue con `fetch`. La
  cancelación (`AbortSignal`, `task.cancel()`) llama a `xhr.abort()`. Para el código que llama no hay
  diferencia.
- **El progreso de bajada** se mide leyendo el cuerpo por partes contra su `content-length`, con
  `fetch`, en cualquier llamada.
- El navegador lee cada `File` del disco mientras sube: no se carga en memoria.

### 3.5. El servidor

```ts
// @fudic/http/contract
export interface UploadLimits {
  /** Per file, unless its field says max-size. Bytes. Default 10 MB. */
  readonly maxFileSize: number;
  /** Files per call. Default 20. */
  readonly maxFiles: number;
  /** The $args part. Bytes. Default 1 MB. */
  readonly maxArgs: number;
}

/** Where an incoming file's bytes go while the handler runs. */
export interface FileStore {
  /** Takes the part's bytes as they arrive and gives back the File the handler sees. */
  put(bytes: ReadableStream<Uint8Array>, meta: { readonly name: string; readonly type: string }): Promise<File>;
  /** Called once the response is sent: what put kept can go. */
  release(): Promise<void>;
}

export interface HandlerOptions {
  // …lo que ya tiene…
  readonly uploads?: Partial<UploadLimits>;
  readonly files?: () => FileStore;
}
```

```jsonc
// fudic.json
{
  "uploads": { "maxFileSize": "50mb", "maxFiles": 10, "maxArgs": "1mb" }
}
```

- **Lector propio de multipart, en streaming** (§4.4). Lee `$args` primero, si no es la primera parte
  es `400`.
- **Los límites se aplican mientras se lee.** Un fichero que pasa su `max-size` (o `maxFileSize`),
  una parte de más (`maxFiles`) o un `$args` grande (`maxArgs`) cortan la lectura y responden `413`
  con un problema que dice qué límite y de qué campo. No se lee el resto del cuerpo.
- **`accept` se comprueba en el servidor** contra el `content-type` de la parte y la extensión del
  nombre, como en el navegador. Es lo que dice el cliente; mirar los bytes (la firma de un PNG) es una
  regla propia del proyecto (`rule es-png`, `runs server`, sobre `file`).
- **Dónde quedan los bytes.** `FileStore` por defecto en Node: cada fichero va a un temporal de
  `os.tmpdir()` y el `File` es `fs.openAsBlob` (Node ≥ 22), que no lo carga en memoria. Fuera de
  Node (el borde), en memoria. `release()` borra los temporales al terminar la respuesta, haya ido
  bien o mal. Un proyecto pone el suyo (S3, por ejemplo) con `files`.
- **`fudic.json`** gana `uploads`, con tamaños como número de bytes o como texto con unidad. El plugin
  de Vite lo pasa a `handler` en dev, en preview y en el módulo de funciones del build.
- **La respuesta en streaming.** `-> file` responde con `file.stream()`. `sendResponse` de Vite deja de
  juntar la respuesta entera: la vuelca por partes.

### 3.6. Los formularios

- `TypeTag` gana `'file'` y `'file[]'`. Factorías `FileField` y `FileListField` en
  `@fudic/forms/contract`, como `Str` o `Bool`.
- Valor: `File | null` y `readonly File[]`. Inicial: `null` y `[]`. `$reset()` vuelve a eso y vacía el
  `<input>`.
- `control.set(file)` acepta un `File` (o una lista), que es lo que hace una zona de soltar:

  ```html
  <div @drop=@soltar($event)>Suelta aquí la foto</div>
  ```
  ```ts
  function soltar(e: DragEvent) {
    e.preventDefault();
    form.avatar.set(e.dataTransfer?.files[0] ?? null);
  }
  ```

- Las reglas `runs both` (`required`, `accept`, `max-size`, `min-length`, `max-length`) corren en el
  navegador al elegir el fichero, antes de enviar, y otra vez en el servidor.
- `$value()` lleva los `File`; el stub los pone en sus partes.
- `$progress()` en el formulario: lo mismo que `task.progress()` (§3.4) para el envío que hace
  `form:=`.

### 3.7. La vista (decisión 182)

- **`<input type="file" :=@form.avatar>`** se liga con `bindFile` de `@fudic/forms/dom`. Elegir un
  fichero hace `set`; `$set` desde código pone el fichero en el `<input>` por `DataTransfer` (lo
  admiten los tres motores), o lo vacía con `null`.
- **`multiple` tiene que casar con el tipo:** `multiple` con un campo `file` es `FUD1484`; sin
  `multiple` con un `file[]`, `FUD1485`. Los dos con arreglo rápido (poner o quitar `multiple`).
- **Un control de fichero ligado a un campo que no es `file`** (o al revés) es `FUD1486`.
- **`accept` en el `<input>`.** Si el campo tiene la regla `accept` y el `<input>` no tiene el
  atributo, el compilador lo escribe con el valor de la regla: el diálogo del sistema filtra igual que
  la regla. Si el autor lo escribe, manda el suyo.
- **`control=`** vale en un `<input type="file">` (desaparece el motivo `file` de `FUD0592`; el de
  `no-value` sigue).
- **`$value`** (decisión 178) en un `<input type="file">` es `File | null`, y con `multiple`,
  `readonly File[]`. Enmienda la 178, que no lo admitía.

### 3.8. El editor

- `.fudapi`: `file` en el completado de tipos, en el hover y en los colores; `max-size` y `accept`
  completan en un campo `file`, con la sintaxis de tamaño y una lista de tipos MIME comunes dentro de
  las comillas de `accept`; snippets `argumento de fichero` y `campo de fichero`. `FUD1480`–`FUD1483`
  con arreglo rápido donde lo hay (quitar el `= …` de `FUD1482`; pasar la `get` a `post` en
  `FUD1480`).
- La gramática TextMate del `.fudapi` gana `file` (y `html`, que faltaba).
- `.fud`: `$value` tipado en un `<input type="file">`; el hover de `:=` dice el tipo del campo;
  `FUD1484`–`FUD1486` con su arreglo.

### 3.9. Los códigos

| Código | Sev. | Título (`.md`) | Cuándo |
|---|---|---|---|
| `FUD1480` | error | A file cannot travel in a URL | `file` en un argumento de `get`, de ruta o de query |
| `FUD1481` | error | A file cannot be page data | `file` en `load`, `layout`, `paths` o un `type` que alcanzan |
| `FUD1482` | error | A file field has no initial value | `= …` en un campo `file` de un `form` |
| `FUD1483` | error | A rule or a failure cannot take a file | `file` como parámetro de `rule` o de `fails` |
| `FUD1484` | error | One file, many chosen | `multiple` en un `<input type="file">` ligado a `file` |
| `FUD1485` | error | Many files, one chosen | `<input type="file">` sin `multiple` ligado a `file[]` |
| `FUD1486` | error | A file input bound to something that is not a file | El control y el campo no son los dos de fichero |
| `FUD1487` | error | A size with an unknown unit | `2mo`, `3tb`: la unidad no es `kb`, `mb` ni `gb` |
| `FUD1488` | error | Upload limits in fudic.json | `uploads` con una forma o un tamaño inválidos |

`FUD1089` (clave de `map`) y `FUD0592` (control sin valor) ya existen.

---

## 4. Comportamiento

### 4.1. El cliente arma la llamada

1. `conform` comprueba los argumentos como hoy; un hueco `file` acepta un `File` (o un `Blob` con
   nombre) y nada más.
2. `encode` separa los ficheros: recorre los tipos, saca cada `File` con su camino y deja el resto.
   Codifica el resto en el `Wire` de la función.
3. Si la firma puede llevar ficheros, arma un `FormData`: `$args` primero (un `Blob` con el
   `content-type` del wire), luego cada fichero con su camino como nombre.
4. `compress` no se aplica.
5. Sale por `XMLHttpRequest` con `upload.onprogress` → `task.progress()`.
6. La respuesta se lee como hoy (`decode`), con dos casos nuevos: `-> file` construye el `File` del
   cuerpo y sus cabeceras; un multipart se lee con `Response.formData()` y se recompone el valor con
   las partes en sus caminos.

### 4.2. El servidor la desarma

1. `serve()` ve que la función puede llevar ficheros: el `content-type` tiene que ser
   `multipart/form-data` (si no, `415`).
2. El lector va parte a parte (§4.4). `$args` se lee entero (hasta `maxArgs`) y se decodifica con el
   `Wire`. Cada parte de fichero se busca por su camino en los tipos: un camino que no corresponde a
   ningún hueco `file` es `400`.
3. Cada fichero pasa por `FileStore.put` mientras llega, contando bytes contra su límite.
4. Se recompone el valor y pasa por `conform` y por las reglas como siempre. `max-size` y `accept`
   del servidor ya tienen el `File` con su tamaño real.
5. El handler recibe `File`. Al terminar la respuesta, `release()`.

### 4.3. `-> file`

El handler devuelve un `File` (o un `Blob`, que sale como `fichero` sin nombre). `valueResponse`
escribe el cuerpo con `stream()` y las cabeceras de §3.3. Un `-> file?` que devuelve `undefined`
responde `204`.

### 4.4. El lector de multipart

Propio, en `@fudic/http/server`, sobre `ReadableStream<Uint8Array>`. Busca el `boundary` con
Boyer-Moore-Horspool sobre una ventana que cruza trozos, lee las cabeceras de cada parte
(`content-disposition` con `name` y `filename`, `filename*` en UTF-8, `content-type`) y entrega cada
cuerpo como un `ReadableStream` que se acaba en el siguiente `boundary`. Una parte no se empieza a
leer hasta que la anterior se ha consumido. Cualquier cosa mal formada es `400` con `detail` que
empieza por `multipart body:`.

No hay dependencia: `request.formData()` del runtime junta el cuerpo entero en memoria en Node, que
es justo lo que hay que evitar.

### 4.5. El ejemplo

En `examples/basic`:

- `user-form` gana `avatar file?` con `accept "image/png, image/jpeg"` y `max-size 2mb`, y un
  `<progress>` mientras sube.
- `Avatars` (servicio): guarda cada avatar en memoria por id.
- `/usuarios` pinta el avatar de cada persona con `<img src=@avatar.url({ id: p.id })>` y gana
  «Exportar CSV» con `<a href=@exportar.url({}) download>`.
- Un `put adjuntar` con `docs file[]`, `max-length 3`, en `/formularios`, que dice cuántos llegaron y
  su tamaño.

### 4.6. Las pruebas de extremo a extremo

En el ejemplo, con Playwright, en dev y en preview:

- Subir una imagen de 1 MB y verla en la tabla.
- Subir una de 3 MB: el formulario la rechaza sin enviar; forzando el envío (sin la regla del
  navegador), el servidor responde `413` antes de leer el cuerpo entero.
- Subir un fichero de 200 MB con `max-size 300mb`: el proceso de Node no pasa de 100 MB de memoria
  residual durante la subida (el fichero va a un temporal).
- Cancelar a mitad: el temporal desaparece.
- Descargar el CSV con el enlace.

---

## 5. Invariantes

- **Un fichero nunca se carga entero en memoria** en el navegador al subir, ni en el servidor con el
  `FileStore` de Node.
- **Ningún límite se comprueba después de leer**: se corta en el byte que lo pasa.
- **Una función sin `file` en su firma viaja byte a byte como antes** (lo fijan los vectores de
  `http/wire/vectors.json`, que no cambian).
- **Lo que comprueba el navegador lo vuelve a comprobar el servidor.**
- **Diagnósticos con span**: `FUD1480`–`FUD1483` sobre el tipo o el `= …`; `FUD1484`–`FUD1486` sobre
  el atributo o el `:=`; `FUD1487` sobre el número; `FUD1488` sobre el valor en `fudic.json`.
- **Cobertura.** Todo fichero nuevo nace al 100 % en las cuatro métricas, con umbral por fichero en
  los paquetes con deuda (`compiler`, `vite`). `language-server` sigue al 100 %.

---

## 6. Criterios de aceptación

**El `.fudapi`**

1. `avatar file`, `avatar file?` y `docs file[]` se leen en un argumento de `put`, en un `form` y en
   un `type`; el `.d.ts` los tipa como en §3.1.
2. `file` en una `get` da `FUD1480`; en `load`, `FUD1481`; en un `type` usado por `load`, `FUD1481`
   sobre el uso con `related` al campo.
3. `avatar file = "x"` da `FUD1482`; `rule r` con un parámetro `file`, `FUD1483`.
4. `max-size 2mb` guarda `2097152`; `max-size 2mo` da `FUD1487`; `accept "image/*"` se lee como texto.
5. `max-size` en un campo `str` da `FUD1083`, como cualquier regla fuera de su tipo.

**El cable**

6. Una llamada con un fichero sale como multipart con `$args` primero en `fud-bin`, y con `use json`
   en JSON; las partes se llaman por su camino (`avatar`, `fotos.1`, `doc.adjunto`, `anexos.0`).
7. Un `file?` sin fichero manda multipart sin esa parte, y el handler recibe `undefined`.
8. Una función sin `file` manda lo mismo que antes, byte a byte (vectores sin cambios).
9. `curl -F '$args=@args.json;type=application/json' -F avatar=@yo.png` contra una función `use json`
   funciona.
10. La firma de una función con `file` cambia; con la vieja, `409`.

**El servidor**

11. El handler recibe un `File` con nombre, tipo, tamaño y bytes correctos.
12. Un fichero de más de `max-size` responde `413` y el servidor deja de leer: el cliente recibe el
    `413` antes de terminar de subir.
13. Sin `max-size`, el límite es `maxFileSize` de `fudic.json`; sin `fudic.json`, 10 MB.
14. 21 ficheros con `maxFiles` 20: `413`. Un `$args` de 2 MB: `413`.
15. `accept` rechaza en el servidor un `.exe` que el cliente manda saltándose la regla: `422` con el
    código `accept`.
16. Una parte con un nombre que no es un hueco `file`: `400` `multipart body:`.
17. En Node, un fichero de 200 MB no sube la memoria residual más de 100 MB; el temporal existe
    durante el handler y no después, tanto si va bien como si lanza.
18. Un `FileStore` propio pasado en `files` recibe los bytes y su `File` llega al handler.

**La vuelta**

19. `-> file` responde con el cuerpo, `content-type`, `content-disposition` con el nombre en UTF-8,
    `content-length`; el cliente recibe un `File` con ese nombre.
20. `-> file?` con `undefined`: `204` y `undefined`.
21. Un `-> Doc` con un `file` dentro vuelve en multipart y el cliente lo recompone.
22. `avatar.url({ id: 3 })` da la URL con `base` y `?a=`; un `<img src>` con ella pinta la imagen.
23. Un fichero de 200 MB se descarga sin que el servidor lo junte en memoria.

**El cliente**

24. `task.progress()` avanza durante la subida (`phase: 'up'`) y la bajada (`phase: 'down'`), y vuelve
    a `null` al terminar; `form.$progress()`, igual en el envío de `form:=`.
25. `task.cancel()` a mitad de una subida aborta la petición; el servidor libera el temporal.

**Formularios y vista**

26. `<input type="file" :=@form.avatar>` compila sin `FUD0592`; elegir un fichero hace
    `form.avatar()` igual a ese `File`; `$reset()` vacía el `<input>`.
27. `form.avatar.set(file)` desde código pone el fichero en el `<input>`.
28. `required`, `accept` y `max-size` dan su texto al elegir, sin enviar.
29. `multiple` con `file`: `FUD1484`; sin `multiple` con `file[]`: `FUD1485`; `<input type="file">`
    ligado a un `str`: `FUD1486`. Cada uno con su arreglo.
30. Con la regla `accept` y sin atributo, el `<input>` sale con `accept="image/png, image/jpeg"`; con
    el atributo del autor, el suyo.
31. `@change=@elegir($value)` en un `<input type="file">` tipa `$value` como `File | null`; con
    `multiple`, `readonly File[]`.
32. `file[]` con `max-length 3` y cuatro ficheros da su texto.

**Editor, ejemplo y cierre**

33. El completado ofrece `file`; dentro de `accept "` ofrece tipos MIME; `max-size` solo en un campo
    `file`; los colores y el hover funcionan; la gramática TextMate colorea `file` y `html`.
34. `fudic.json` con `uploads: { maxFileSize: "x" }` da `FUD1488`.
35. El ejemplo de §4.5 y las pruebas de §4.6 en verde, en dev y en preview.
36. La guía del MCP (`fudapi.md`, `components.md` y sus copias en español) explica `file`, las reglas,
    el progreso, `url()` y los límites.
37. `pnpm typecheck`, `pnpm test`, `pnpm build` en verde; ficheros nuevos al 100 %; `language-server`
    al 100 %.

### 6.1. La prueba de Pedro

En `examples/basic`, en dev y en preview: dar de alta a alguien con foto y verla en la tabla; probar
una foto demasiado grande y un PDF; subir algo grande y ver la barra; cancelar; exportar el CSV.
Con `curl -F`, llamar a una función `use json` con un fichero.

---

## 7. Fuera de alcance

Nada.

---

## 8. Decisiones

### 8.1. Tomadas al redactar

1. **Multipart como sobre, nuestro formato dentro.** Meter los bytes del fichero en `fud-bin` se
   descartó por cuatro motivos. El navegador sube cada `File` de una parte leyéndolo del disco, y
   nuestro formato se codifica en memoria. `compress` comprimiría imágenes y ZIPs ya comprimidos. Un
   servidor necesita leer en streaming para cortar en el límite y volcar a disco. Y `curl -F`, una app
   móvil o el backend de IDEA-05 leen multipart sin hacer nada.
2. **Siempre multipart si la firma puede llevar ficheros**, aunque esa vez no lleve. El servidor y un
   cliente externo saben qué esperar sin mirar el cuerpo.
3. **El camino como nombre de la parte**, y nada en `$args` por el hueco. Los dos extremos tienen los
   tipos; no hace falta un índice ni una referencia.
4. **Sin `compress` en multipart.** RFC 7578 no define codificación por parte, y comprimir el cuerpo
   entero recomprime los ficheros. `$args` es pequeño.
5. **`XMLHttpRequest` solo para subir ficheros.** Es la única forma de tener progreso de subida en los
   tres motores (`fetch` con cuerpo en streaming solo lo da Chromium y con HTTP/2).
6. **`FileStore` con temporales en Node**, en memoria en el borde. `fs.openAsBlob` da un `File` que
   no carga el fichero.
7. **Límites por defecto** (10 MB por fichero, 20 ficheros, 1 MB de `$args`), cambiables sin tope en
   `fudic.json`. Son el mismo tipo de límite que tiene cualquier servidor HTTP; no quitan ninguna
   opción.
8. **`accept` con la sintaxis del atributo HTML**, para que la regla y el diálogo del sistema digan lo
   mismo y el compilador pueda escribir el atributo.
9. **`kb`/`mb`/`gb` en base 1024**, que es como los muestran los sistemas de ficheros que ve el
   usuario al elegir.
10. **`inline` en `content-disposition`**, con el nombre: un `<img>` lo pinta y un `<a download>` lo
    descarga con ese nombre.
11. **`url()` en toda `get`**, no solo en las que devuelven `file`: un enlace a un CSV o a un JSON vale
    igual.
12. **Lector de multipart propio.** `request.formData()` junta el cuerpo en memoria en Node.
