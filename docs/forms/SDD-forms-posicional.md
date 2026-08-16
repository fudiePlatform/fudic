# SDD — Envío posicional de formularios (`@fudic/forms` + `@fudic/http`)

> **Estado:** `Listo`
> **Paquetes:** `@fudic/forms`, `@fudic/forms/middleware`, `@fudic/http`
> **Naturaleza:** runtime puro. **Cero implicación del compilador.** No hay análisis de AST,
> no hay emit, no hay decisión de gramática. Todo ocurre en tiempo de ejecución sobre el
> objeto `schema` que ambos lados importan.
> **Validado:** arnés ejecutable de 10 casos (10/10 en Node 22 y en navegador) más un
> formulario real con inputs servido por HTTP. Carpeta `fudic-posicional/`. Cubre simetría,
> aridad, normalización de `undefined` en profundidad, roundtrip y circuito end-to-end.

---

## 1. Contexto y objetivo

Un `POST` / `PUT` / `PATCH` / `DELETE` de un formulario Fudic envía hoy el `$value` del form
como JSON con claves. Las claves son redundantes: **el receptor ya conoce el schema**, porque
el fichero del form (`blog.form.ts`) lo importan los dos extremos. Cada petición paga el
nombre de cada campo sin que aporte información.

Este SDD elimina esa redundancia. El body pasa a ser un array posicional:

```
{"id":1,"name":"Pedro"}   →   [1,"Pedro"]
```

Es exactamente el mismo mecanismo que **fud-state** en la dirección contraria. La bajada
serializa con `Object.values` de primer nivel y destructura en cliente; la subida serializa
con `Object.values` de primer nivel y destructura en servidor. Una sola idea, dos direcciones.

**Alcance estricto:** solo `browser → server`, solo verbos con body. `GET` y el futuro verbo
`QUERY` quedan fuera: no llevan body. La respuesta del servidor no se ve afectada.

**Objetivo de diseño:** el usuario no escribe nada. No hay `serialize: 'positional'` por
llamada, no hay decorador, no hay opción en el `<form>`. Una lista de URLs en la configuración
de la aplicación y se acabó.

---

> **Convención de idioma.** El código va en inglés (identificadores, tipos, ficheros); el
> texto en español (prosa, comentarios, mensajes de las evidencias).

## 2. Dependencias

- **`@fudic/forms`** — `form()`, `control()`, `group()` con el namespace `$` para la API
  (`$value`, `$errors`, `$validate`, …). Las claves con prefijo `$` no son campos.
- **`@fudic/forms/middleware`** — `validate(postForm)`, que ya instancia el form, asigna
  `ctx.body` a `$value`, corre `$validate()` y devuelve 422 o entrega el form al handler.
- **`@fudic/http`** — las cinco factorías por verbo (§3.3).

**Lo que NO es dependencia: el compilador.** El orden de los campos no sale del AST. Sale de
`Object.keys(schema)` en tiempo de ejecución. Los dos extremos ejecutan el mismo recorrido
sobre el mismo objeto porque importan el mismo módulo.

---

## 3. Interfaz pública

### 3.1. `@fudic/forms` — un getter/setter nuevo, hermano de `$value`

```ts
interface FormApi<S> {
  get $value(): Value<S>;
  set $value(v: Value<S> | Positional<S>);   // acepta ambas formas

  get $positional(): Positional<S>;
  set $positional(v: Positional<S>);
}
```

Nada más. Ni una opción de configuración en `form()`. Un form **siempre** sabe emitirse
posicional; quién decide usarlo es el cliente HTTP.

### 3.2. `@fudic/forms/middleware` — sin cambio de firma

```ts
function validate<F>(factory: () => F): Middleware;
```

`validate` ya hacía `f.$value = ctx.body`. Como el setter de `$value` acepta array (§4.3),
**el middleware no cambia**. Un body con claves y un body posicional entran por la misma línea.

### 3.3. `@fudic/http` — cinco factorías independientes, no una instancia

No hay `createHttp()` que devuelva un objeto con cinco métodos colgando. Fudic promueve
vertical slice: cada slice importa **solo el verbo que usa**, y lo que no se importa no entra
en el bundle.

```ts
import { post } from '@fudic/http';
```

Cada factoría declara una llamada y devuelve la función que la ejecuta:

```ts
type Factory = <B, R>(url: string, opts?: CallOptions) => Call<B, R>;

export const get:   Factory;   // sin body
export const post:  Factory;
export const put:   Factory;
export const patch: Factory;
export const del:   Factory;   // `delete` es palabra reservada: no puede ser binding de import
```

En el slice:

```ts
// slices/blog/blog.api.ts
import { post, put, del } from '@fudic/http';
import type { PostForm } from './blog.form';
import type { Post } from './blog.contract';

export const createPost = post<PostForm, Post>('/blog');
export const updatePost = put<PostForm, Post>('/blog/:slug', { middlewares: [idempotency] });
export const deletePost = del<void, void>('/blog/:slug');
```

Uso — el form entra tal cual como body:

```ts
const saved = await updatePost(f, { params: { slug } });
```

### 3.4. El pipeline de la llamada

Todo lo que este SDD decide —posicionalizar, serializar, comprimir— son
**transformaciones sucesivas del cuerpo**, no middlewares. Un middleware observa y decide
sobre la petición entera (cabeceras, reintentos, auth); una etapa del pipeline transforma
la carga y se la pasa a la siguiente. Mezclarlos obliga a que cada middleware conozca la
codificación, que es justo lo que no debe pasar.

```
   f.$value
      │
      ▼
 ┌──────────────┐   no está en la allowlist          ┌──────────────┐
 │  positional  │ ───────── o no es un form ───────▶ │    keyed     │
 └──────┬───────┘                                    └──────┬───────┘
        │  [ "Pedro", 42, true ]                            │  { name, age, ok }
        └────────────────────────┬───────────────────────────┘
                                 ▼
                          ┌─────────────┐
                          │    JSON     │   aquí se conoce el tamaño exacto
                          └──────┬──────┘
                                 │  158 B
                                 ▼
                          ┌─────────────┐
                          │  compress   │
                          └──────┬──────┘
                                 │
              ┌──────────────────┼──────────────────┐
              │                  │                  │
   sin CompressionStream    < umbral (1 KB)    no reduce el tamaño
   (Safari, Firefox…)                                │
              │                  │                  │
              └──────────────────┴──────────────────┘
                                 │
                          se SALTA la etapa
                                 │
                                 ▼
                          ┌─────────────┐
                          │  transport  │  ── middlewares ──▶  red
                          └─────────────┘
```

**Regla de degradación.** Una etapa que no puede aplicarse **se salta y la carga continúa
intacta a la siguiente**. Nunca aborta la petición ni cambia el resultado observable: solo
cambia cuántos bytes viajan. Por eso la ausencia de `CompressionStream` en un navegador no
es un caso especial que haya que programar en el sitio de llamada — es la misma rama que un
cuerpo por debajo del umbral.

Esto es lo que hace que las limitaciones de plataforma (§4.6) sean un detalle de una etapa
y no una decisión de arquitectura: el pipeline degrada solo.

**Interfaz de una etapa:**

```ts
/** La carga que atraviesa el pipeline. Cada etapa recibe una y devuelve otra. */
interface Payload {
  /** Valor en curso: el form, luego el array, luego el string, luego los bytes. */
  readonly value: unknown;
  /** Cabeceras que la etapa haya añadido (content-type, content-encoding…). */
  readonly headers: Readonly<Record<string, string>>;
  /** Contexto inmutable de la llamada, para que una etapa decida sin adivinar. */
  readonly ctx: {
    readonly method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
    readonly url: string;          // ya resuelta, con los :params sustituidos
    readonly config: Readonly<HttpConfig>;
  };
  /** Traza por etapa, para diagnóstico. No participa en ninguna decisión. */
  readonly trace: ReadonlyArray<{ stage: string; applied: boolean; bytes?: number }>;
}

interface Stage {
  readonly name: string;

  /**
   * Capacidad del runtime. Se evalúa UNA vez por proceso, no por petición:
   * `typeof CompressionStream === 'function'`, y equivalentes.
   * `false` ⇒ la etapa no existe para este runtime.
   */
  supported(): boolean;

  /**
   * Política, con la carga concreta delante: umbral de tamaño, allowlist de URL,
   * verbo con cuerpo, tipo del valor. Sin efectos.
   */
  applies(p: Payload): boolean;

  /**
   * La transformación. Solo se invoca si `supported() && applies(p)`.
   * Puede ser asíncrona (`CompressionStream` lo es).
   * Si el resultado no mejora, devolver `p` sin tocar es legítimo: la etapa se
   * registra como no aplicada.
   */
  apply(p: Payload): Payload | Promise<Payload>;
}

/** Composición. Sin etapas, el cuerpo sale como JSON con claves. */
type Pipeline = ReadonlyArray<Stage>;
```

El pipeline por defecto de `@fudic/http` es `[positional, json, compress]`. Es sustituible
en `configure({ pipeline })`, lo que además da el punto de extensión natural para formatos
binarios o cifrado de cuerpo sin tocar las factorías ni los middlewares.

> **Fuera de alcance de este SDD.** Aquí se fija la *forma* del pipeline y su regla de
> degradación, no su implementación ni el catálogo de etapas. La implementación vive en el
> SDD de `@fudic/http`.

### 3.5. Configuración de aplicación

Lo que antes vivía en la instancia (`baseURL`, middlewares globales, transport) vive ahora en
una configuración de módulo, invocada **una vez** en el arranque:

```ts
// http.config.ts
import { configure } from '@fudic/http';
import { requestId, perf, csrf } from './mw';

configure({
  baseURL: '/',
  timeout: 10_000,
  middlewares: [requestId, perf],
  form: ['/blog/**', '/orders/**'],          // ← allowlist del envío posicional
  compress: { formato: 'deflate-raw', minimo: 1000 },   // ausente ⇒ apagado (§4.6)
  // pipeline: [positional, json, compress]              // el de serie; sustituible (§3.4)
});

use({ method: ['POST', 'PUT', 'PATCH', 'DELETE'] }, csrf);
```

`form` es una lista de patrones de URL (mismo matcher que `use({ path })`). Vacía o ausente
⇒ el posicional está apagado y todo sale como objeto con claves.

---

## 4. Comportamiento

### 4.1. Serialización (cliente)

`$positional` recorre `Object.keys(schema)` **en orden de declaración**, filtrando las claves
con prefijo `$`, y por cada nodo:

- `control()` → su valor tal cual.
- `group()` → **array anidado en su propia posición**, recursivamente.

El anidamiento es literal, igual que en fud-state: un `control()` cuyo valor sea un objeto o
un array de objetos viaja con su forma intacta; no se desnuda en profundidad.

```ts
const schema = {
  title:     control(''),
  body:      control(''),
  published: control(false),
  seo: group({
    description: control(''),
    canonical:   control(''),
  }),
  tags: control<string[]>([]),
};
```

```json
["Arquitectura de Fudic","Cuerpo…",true,["Descripción SEO","https://fudie.eu/x"],["web","compilador"]]
```

### 4.2. Decisión de envío (`@fudic/http`)

En cada llamada, tres condiciones **y**:

1. El verbo lleva body (`POST`, `PUT`, `PATCH`, `DELETE`).
2. La URL resuelta casa con algún patrón de `form`.
3. El body es una instancia de `form()`.

Si las tres se cumplen: body = `f.$positional`, cabecera `Content-Type: application/fud`.
En cualquier otro caso: `f.$value` y `application/json`, como hasta ahora.

```
PUT /blog/arquitectura-de-fudic
Content-Type: application/fud

["Arquitectura de Fudic","Cuerpo…",true,["Descripción SEO","https://fudie.eu/x"],["web","compilador"]]
```

**Por qué existe la allowlist.** Un array desnudo solo tiene sentido para un receptor que
comparte el schema. Enviarlo a un host de terceros produce basura silenciosa. La lista es la
frontera explícita de "aquí al otro lado corre mi mismo `blog.form.ts`".

### 4.3. Deserialización (servidor)

El setter de `$value` discrimina por forma del dato:

- **Array** ⇒ delega en `$positional`: recorre el mismo `Object.keys(schema)` filtrado y asigna
  por índice. Un `group()` consume el subarray de su posición, recursivamente.
- **Objeto** ⇒ asigna por clave, comportamiento actual.

Simetría exacta: el mismo recorrido que produjo el array lo consume. El `Content-Type` es
informativo para el adaptador; la discriminación real es estructural.

### 4.4. `undefined` no existe en la frontera

`JSON.stringify` no trata `undefined` de forma homogénea: **en un array lo convierte
en `null`** (conserva la posición) y **en un objeto borra la clave entera**. Lo mismo con
funciones y símbolos. Apoyarse en ese comportamiento sería apoyarse en un efecto colateral:
la forma posicional sobreviviría por accidente y el roundtrip dejaría de ser identidad —
sale `undefined`, vuelve `null`.

Decisión: **`null` es el vacío canónico y `undefined` se normaliza en la frontera**, en los
cuatro puntos (`$value` y `$positional`, lectura y escritura). Un `control()` sin valor por
defecto arranca en `null`, no en `undefined`.

**La normalización es en profundidad.** El valor de un control puede ser un objeto o un
array (anidamiento literal, §4.1); sus propiedades internas en `undefined` se perderían
igual. El normalizador recorre objetos planos y arrays recursivamente y:

- `undefined`, función o símbolo → `null`, a cualquier profundidad.
- **No muta lo que recibe.** Devuelve estructura nueva; el objeto del usuario queda intacto.
- Referencia circular → `TypeError` con mensaje propio, no el críptico de `JSON.stringify`.
  Una referencia compartida entre hermanos no es un ciclo y no se diagnostica como tal.
- Lo que no es objeto plano ni array **pasa tal cual**. Un `Date` tiene su propio `toJSON`
  y su serialización es asunto del usuario, no de esta frontera.

**No soportados inicialmente:** `Map` y `Set` como valor de un control. `JSON.stringify` los
deja en `{}` en silencio. No se diagnostican; simplemente no entran en el alcance.

### 4.5. Aridad fija

Un `false`, un `''` o un `null` **ocupan su hueco**. Nunca se omite una posición: la longitud
del array es siempre el número de campos del nivel. Una longitud distinta a la esperada es
`RangeError`, no una asignación desplazada. Esto es lo que impide que un cambio de schema en
un solo lado corrompa datos en silencio (§5).

### 4.6. Compresión del body: cuándo, y por qué casi nunca

El pipeline es `objeto → array posicional → JSON`. En ese último punto se conoce el
tamaño exacto en bytes, así que la decisión de comprimir se puede tomar con un número
en vez de a ojo. La API es `CompressionStream` / `DecompressionStream`.

**El umbral no es porcentual, es absoluto.** Medido con prosa real (las cadenas
aleatorias no comprimen y falsearían a la baja):

| JSON | gzip | ahorro | deflate-raw | ahorro |
|---|---|---|---|---|
| 40 B | 60 B | **+50 %** | 42 B | +5 % |
| 60 B | 79 B | **+32 %** | 61 B | +2 % |
| 100 B | 100 B | 0 % | 82 B | −18 % |
| 160 B | 128 B | −20 % | 110 B | −31 % |
| 347 B | 221 B | −36 % | 203 B | −41 % |
| 685 B | 328 B | −52 % | 310 B | −55 % |
| 1 033 B | 430 B | −58 % | 412 B | −60 % |
| 2 502 B | 789 B | −68 % | 771 B | −69 % |
| 8 104 B | 2 000 B | −75 % | 1 982 B | −76 % |
| 40 179 B | 8 164 B | −80 % | 8 146 B | −80 % |

gzip tiene un **suelo fijo de 20 B** (cabecera 10 + cola 8): por debajo de ~100 B
*engorda* el cuerpo. `deflate-raw` tiene suelo de 2 B y no engorda de forma apreciable.

**Pero el porcentaje engaña.** Sobre el formulario de referencia:

| paso | tamaño | ahorra | coste |
|---|---|---|---|
| JSON con claves | 224 B | — | — |
| → posicional | 158 B | **66 B** | ninguno |
| → + deflate-raw | 131 B | **27 B** | paso asíncrono, `Content-Encoding` no estándar, sin streaming en Safari/Firefox |

Veintisiete bytes. La petición ya arrastra cientos de bytes de cabeceras —cookies,
`user-agent`, `sec-ch-*`— que viajan sin comprimir; comprimir el cuerpo no toca esa parte.
*(Esto último es razonamiento sobre el tamaño típico de cabeceras, no una medida tomada
en este trabajo.)*

**Decisión: umbral en 1 KB, no en 100 B.** Por debajo, el ahorro absoluto no compensa el
coste. El posicional ahorra más que la compresión y no cuesta nada; la compresión solo
empieza a valer con cuerpos grandes de verdad: lotes, colas offline del Service Worker, o
textos largos. Verificado: un formulario típico (158 B) sale en claro; el mismo con el
cuerpo repetido 30 veces (1 550 B) sale comprimido a 145 B.

```ts
configure({ compress: { formato: 'deflate-raw', minimo: 1000 } });   // ausente ⇒ apagado
```

Dos guardas, no una: el umbral, y una comprobación de que el resultado **es realmente
menor** que el original. Si no gana, se manda en claro y sin cabecera.

**`Content-Encoding: deflate` significa zlib (RFC 1950), no deflate crudo.** `deflate-raw`
solo es legítimo mientras el adaptador del otro extremo sea propio. Con un receptor ajeno,
`gzip`. Y el otro extremo debe descomprimir el body de **entrada**: muchos servidores solo
descomprimen respuestas. No verificado aquí para Cloudflare Workers.

**Sin `CompressionStream`, no hay caso especial.** Safari y Firefox son, para el pipeline,
la misma rama que un cuerpo pequeño: `supported()` devuelve `false`, la etapa se salta y el
JSON sale en claro (§3.4). El sitio de llamada no cambia y el receptor tampoco: la ausencia
de `content-encoding` ya lo dice todo.

**Enviar el flujo comprimido no es portable.** Pasar un `ReadableStream` como body de
`fetch` exige `duplex: 'half'` y solo funciona en Chromium. Lo portable es comprimir entero
a `ArrayBuffer` y mandar eso: no es streaming, pero funciona en todas partes.

### 4.7. Interacción con `validate()`

El middleware no distingue. Recibe el body del adaptador, lo asigna a `$value`, y a partir de
ahí el flujo es el de siempre: `$validate()` con todos los validators (los isomórficos y los
de `validator.server`), 422 `problem+json` desde `$errors`/`$summary` si falla, o el form
tipado como primer argumento del handler si pasa.

El posicional es una codificación de transporte. **No toca la validación.**

---

## 5. Invariantes

- **El schema es el contrato, y es un objeto de runtime.** El orden lo da
  `Object.keys(schema)`. Ambos extremos importan el mismo módulo; por eso coinciden. No hay
  metadatos, ni versión de schema, ni negociación.
- **Cero implicación del compilador.** Si este SDD requiriese emit, estaría mal planteado.
- **Simetría estricta.** El serializador y el deserializador son el mismo recorrido en dos
  sentidos. Tocar uno sin el otro es un bug, no una variante.
- **Aridad fija.** Nada se omite; la longitud es el número de campos. Discrepancia ⇒ error.
- **`undefined` no cruza la frontera, a ninguna profundidad.** `null` es el vacío canónico.
  La normalización no muta el valor del usuario y diagnostica los ciclos.
- **Una etapa que no puede aplicarse se salta; la petición nunca falla por ello.** Falta de
  capacidad del navegador, umbral no alcanzado y transformación que no mejora son la misma
  rama: la carga sigue intacta a la siguiente etapa (§3.4).
- **Las etapas transforman la carga; los middlewares no la conocen.** Ningún middleware
  necesita saber si el cuerpo va posicional o comprimido.
- **El posicional gana más que la compresión y no cuesta nada.** Comprimir es una decisión
  aparte, apagada por defecto y con umbral en 1 KB (§4.6). Nunca sustituye al posicional.
- **Solo subida, solo verbos con body.** `GET` y `QUERY` fuera. La respuesta, fuera.
- **Opt-in por URL.** Sin `form` en la configuración, el comportamiento es idéntico al actual.
- **El namespace `$` no es un campo.** Filtrado en el recorrido, igual que en `$value`.
- **Un solo camino de red.** El submit de `<form form:="@Put">` usa las mismas factorías y la
  misma cadena de middlewares que una llamada escrita a mano.

**Consecuencia operativa que hay que asumir:** cliente y servidor deben desplegarse con la
misma versión del fichero del form. Reordenar campos en el schema es un cambio de protocolo.
No es una regresión respecto a hoy —el mismo fichero ya se comparte— pero con claves un
despliegue desincronizado fallaba ruidosamente y con posiciones falla por aridad solo si el
número de campos cambió. Renombrar es gratis; reordenar y reindexar, no.

---

## 6. Criterios de aceptación

### 6.1. Batería

Los diez casos del arnés ejecutable (`fudic-posicional/`), cada uno con veredicto propio:

| # | Caso | Qué demuestra |
|---|---|---|
| 1 | PUT dentro de la allowlist | `application/fud`, array puro, cero etiquetas en el cable |
| 2 | misma llamada fuera de la allowlist | JSON con claves: el posicional es opt-in por URL |
| 3 | ahorro medido | 224 B → 158 B (−29,5 %); lote de 50: 11 251 B → 7 951 B |
| 4 | roundtrip cliente → cable → servidor | `$value` idéntico sin recibir un solo nombre |
| 5 | validación | 422 desde `$errors`/`$summary`, igual que con claves |
| 6 | aridad fija | `RangeError` y form intacto: sin asignación desplazada |
| 7 | GET y DELETE | sin body y sin `content-type`; la allowlist no les afecta |
| 8 | body que no es un form | claves aunque la URL case: las tres condiciones son Y |
| 9 | controles en `undefined` | aridad intacta, sin `undefined`, reenvío idempotente |
| 10 | normalización en profundidad | sin pérdida a ninguna profundidad, sin mutar, ciclo diagnosticado |

Medidores auxiliares en la misma carpeta: `threshold.mjs` (barrido de compresión por
tamaño), `gzip.mjs` (formatos y roundtrip), `types.mjs` (coste por tipo en binario frente
a JSON).

### 6.2. Ejecución

El arnés corre **igual en navegador y en Node** (los módulos son ES puros, sin API de
plataforma más allá de `TextEncoder`). En navegador se sirve la carpeta por HTTP y la salida
va a la consola: un bloque por caso, no una lluvia de líneas. En Node:

```
node -e "import('./cases.js').then(m => m.all())"
```

Verificado: **10/10** en Node 22.22.2 antes de la entrega.

### 6.3. Evidencia end-to-end con inputs reales

Los diez casos anteriores construyen el form en memoria. Eso deja sin demostrar el tramo que
va desde una pulsación de teclado hasta el cable. `form.html`, en la misma carpeta, lo cierra:
un formulario servido por HTTP con inputs, textarea, checkbox y `<select multiple>`, enlazados
por la directiva `control:` —la misma que emite el compilador desde un `.fud`—, con el
`$positional` y el peso de las dos codificaciones recalculados en cada pulsación.

Lo que ese circuito añade a la batería:

- Un control puede recibir su valor de un input real, incluido un **array** capturado de un
  `<select multiple>`, y viajar posicional sin tratamiento especial.
- Un `group()` se rellena desde inputs separados (`control:="seo.description"`,
  `control:="seo.canonical"`) y sale como su array anidado en su posición.
- El **422 vuelve a los controles**: `validator.server` no corre en cliente, así que un valor
  que el cliente da por bueno se envía posicional y el error aterriza en su campo por ruta.
  Es la prueba de que la codificación no interfiere con el mapeo de errores.
- Con el form inválido en cliente no se envía nada: el posicional no cambia esa decisión.

**La capa DOM (`@fudic/forms/dom`: enlace, coerción por tipo de elemento, tocado/dirty,
pintado de errores) no se especifica aquí.** Es un SDD propio. Este documento solo la usa como
evidencia de que la serialización aguanta el circuito completo.

## 7. Fuera de alcance

- **Respuesta del servidor.** Solo se especifica la subida.
- **`GET` y `QUERY`.** Sin body, sin posicional.
- **Subida de ficheros.** Un `control()` con `File` no es JSON-serializable; requiere
  `multipart/form-data` y es otro SDD.
- **Versionado de schema / negociación.** No hay. El contrato es el despliegue conjunto.
- **`application/fud` como registro IANA.** Es un tipo de aplicación interno.
- **Implementación del pipeline y su catálogo de etapas.** Aquí se fija la interfaz y la
  regla de degradación (§3.4); la implementación es del SDD de `@fudic/http`.
- **La capa DOM de forms** (`@fudic/forms/dom`): directiva `control:`, coerción por tipo de
  elemento, tocado/dirty, pintado de errores. SDD propio. Aquí solo se usa como evidencia.
- **Implementación de las cinco factorías de `@fudic/http`** (matcher de rutas, cadena de
  middlewares, `Call`/`abort`, `mockTransport`). Aquí solo se fija la forma de la API y el
  punto donde se decide el posicional.
- **`Map` y `Set` como valor de un control.** No soportados. `JSON.stringify` los deja en
  `{}` sin avisar; no se diagnostica.
- **`Date` y cualquier tipo con `toJSON` propio.** Pasan tal cual: su serialización es
  responsabilidad del usuario.
- **Compresión de la respuesta.** Aquí solo se decide sobre el body de subida (§4.6).
