# SDD-67 — Binario en todas las llamadas, y reglas en los argumentos de las funciones

> **Estado:** `Listo` — [tareas](./SDD-67-Task.md).
> **Paquetes:** `@fudic/http` · `@fudic/forms` · `@fudic/api` · `@fudic/diagnostics` ·
> `@fudic/language-server` · `@fudic/testing` · `@fudic/vite` · `examples/*`
> **Depende de:** 50 (catálogo), 56 (funciones de servidor y el binario de los forms), 57 (tests
> unitarios), 60 (`.fudapi`)
> **Rango de diagnósticos:** `FUD1260`–`FUD1279` (nuevo). Usa `FUD1260`.
> **Decisiones de gramática:** ninguna. Amplía la gramática del `.fudapi` (SDD-60): un argumento
> de una función admite reglas debajo, como un campo de un form.
> **Origen:** conversación con Pedro del 2026-10-27.
> **Rama sugerida:** `sdd-67-binario-y-reglas`
>
> **Qué añade en una frase.** Toda llamada a una función de servidor viaja en binario por defecto
> —argumentos, respuesta y error—, con un formato escrito byte a byte para que otro backend lo
> hable; quien quiera JSON escribe `use json`; y los argumentos de una función llevan las mismas
> reglas que los campos de un form, comprobadas en el navegador y en el servidor.

---

## 1. Contexto y objetivo

Hoy, llamar a `save({ id, notify: true, active: false })` sobre

```
put save /:id
  use auth
  query notify bool
  id      uuid
  active  bool
```

manda `id` en la URL, `notify` en `?notify=true` y `active` en el cuerpo **como JSON**
(`{"active":false}`). La respuesta vuelve en JSON (`server/dispatch.ts:59-66`) y el error en
`application/problem+json` (`server/problem.ts:11-29`). El binario existe, pero **solo para los
forms** (`client/stages/binary.ts`, `@fudic/forms/wire`), y aun así cae a JSON cuando un valor no
cabe en él (`representable`).

Dos problemas:

**1. Se manda texto donde el contrato ya sabe los tipos.** El `.fudapi` dice el tipo de cada
argumento y de cada respuesta. Con eso, `{"active":false,"id":"7f3a…"}` puede ser un bit y 16
bytes. JSON repite los nombres en cada llamada, escribe los números como texto y no sabe lo que
es una fecha: un `-> date` vuelve hoy como un `string`, no como un `Date`.

**2. Una función comprueba tipos, no reglas.** El servidor ya rechaza con 400 un `active: "hola"`,
un `id` que no es un uuid o un `u8` con 300 (`contract/server.ts:63`, `contract/wire.ts`). Lo que
no comprueba es nada más: un `name str` acepta un texto de 50 MB y llega entero al handler. En un
form se escribe `max-length 80`; en una función no se puede.

Esta spec:

- hace que **toda** llamada viaje en binario: argumentos, valor de vuelta y problema;
- escribe el formato **byte a byte** (§3.1) y publica unos vectores de prueba, para que un backend
  en C#, Go o Java (IDEA-05) lo implemente sin leer el código de fudic;
- deja JSON como opción explícita: `use json`, un middleware de `@fudic/http`;
- da a los argumentos de una función las reglas de los forms, con la misma sintaxis.

## 2. Dependencias

| SDD | Qué aporta |
|---|---|
| 56 | `@fudic/http`: el `stub` y el `fn`, el pipeline del cuerpo (`client/pipeline.ts`, `client/stages/*`), `bodyArgs`, `Problem`, `HttpError` y el formato binario de un form (§4.18), del que nace el de esta spec. |
| 60 | El `.fudapi`: `FnDecl` con sus `args` (`place`: `route`, `query`, `body`) y su `returns`; `FnSpec` y su emisión (`api/src/emit/module.ts:176-199`); `Ty` y `conform` (`http/src/contract/wire.ts`); las reglas de `@fudic/forms/fudapi/rules.fudapi` y su validación (`api/src/validate-form.ts`); los middlewares de librería (`http/fudapi/middlewares.fudapi`). |
| 57 | `@fudic/testing`: el servidor en memoria y la opción `fetch`, que contesta con un `Response` escrito por el test. |
| 50 | `@fudic/diagnostics`: un `.ts` y un `.md` por código. |

## 3. Interfaz pública

### 3.1. El formato binario (`fud-bin`)

Es el de SDD-56 §4.18 generalizado a todos los tipos del `.fudapi`. **Un form sale con los mismos
bytes que hoy.** Todo es *little-endian*.

**El nivel.** Una lista ordenada de huecos, cada uno con su tipo, se escribe así:

1. **El mapa de nulos.** Un bit por cada hueco de tipo opcional (`T?`), en orden, en `⌈k/8⌉`
   bytes; el primer hueco en el bit más bajo del primer byte. No existe si no hay ninguno. Un bit
   a 1 es «ausente», y ese hueco no escribe nada más.
2. **Los bits de los `bool`.** Un bit por cada hueco `bool` o `bool?` presente, en orden, en
   `⌈b/8⌉` bytes, empaquetados igual.
3. **Los valores.** Cada hueco presente que no es `bool`, en orden, con la tabla de abajo.

Son niveles: los argumentos de una función, los campos de un `type`, los elementos de una lista y
las claves y los valores de un mapa.

| Tipo | Bytes |
|---|---|
| `u8` `i8` · `u16` `i16` · `u32` `i32` | 1 · 2 · 4; los `i` en complemento a dos |
| `f32` `f64` | 4 · 8, IEEE 754 |
| `str` | La longitud en bytes UTF-8 como varint LEB128 sin signo, y los bytes |
| `date` | 6: los milisegundos desde 1970-01-01T00:00Z como entero con signo de 48 bits (±4 459 años) |
| `uuid` | 16: los 32 dígitos hexadecimales en el orden en que se escriben (RFC 9562), dos por byte |
| `enum` | El índice del miembro, en orden de declaración, como varint |
| `type` | Sus campos, como un nivel |
| `T[]` | El número de elementos como varint, y los elementos como un nivel de ese tamaño |
| `map K V` | El número de entradas como varint; las claves como un nivel; los valores como otro |

**El cuerpo de una llamada** son sus argumentos de cuerpo, como un nivel, en orden de declaración.
Sin argumentos de cuerpo, no hay cuerpo.

**La respuesta** es un nivel de un solo hueco, del tipo de `->`. Sin `->`, un 204 sin cuerpo, como
hoy.

**El problema** es un nivel con estos huecos:

```
status    u16
title     str
detail    str?
location  str?
errors    (map str (map str any))?
summary   (map str any)?
```

`any` solo existe aquí: es el valor que un validador deja en `Errors` (`{ min: 18 }`,
`{ pattern: "…" }`, `{ required: true }`). Se escribe con un byte de etiqueta:

| Etiqueta | Valor | Después |
|---|---|---|
| 0 | `null` | nada |
| 1 · 2 | `false` · `true` | nada |
| 3 | número | 8 bytes, `f64` |
| 4 | texto | como `str` |
| 5 | lista | varint con el número, y cada elemento como `any` |
| 6 | objeto | varint con el número de claves, y cada par como `str` y `any` |

**Un form** es un nivel de sus controles: un `group` es un `type`; `u8`…`f64`, `date` y `arr` son
opcionales (un campo vacío es `null`); `bool` y `str`, no; un `arr` de `T` es `T[]`. Con eso, los
bytes coinciden con SDD-56 §4.18, y el test de forms de hoy pasa sin tocarlo.

**Lo que no cabe se rechaza, no se cambia de formato.** Una fecha fuera de los 48 bits, un `null`
dentro de una lista que no es de opcionales: el `conform` del lado que escribe lo rechaza como hoy
rechaza un `u8` con 300. No hay vuelta a JSON.

**Los vectores.** `packages/http/wire/vectors.json` (publicado) lleva, para cada fila de las dos
tablas, al menos un caso `{ type, value, hex }`, más un form, una respuesta y un problema enteros.
Un backend que los pase todos en los dos sentidos habla `fud-bin`.

### 3.2. Cómo viaja una llamada

| | `fud-bin` (por defecto) | `use json` |
|---|---|---|
| Argumentos de ruta y `query` | En la URL, como texto, como hoy | Igual |
| Argumentos de un `get` | `?a=` + el nivel en base64url (RFC 4648 §5, sin `=`) | `?a=` + JSON, como hoy |
| Cuerpo | `content-type: application/fud+bin` | `application/json`, con sus claves |
| Valor | `200`, `application/fud+bin` | `200`, `application/json` |
| Problema | `application/problem+fud`, el nivel de §3.1 | `application/problem+json`, como hoy |
| Firma | Cabecera `fud-sig` (§3.3) | Ninguna |

- **El formato lo dice la cadena, no se negocia.** El compilador ya sabe, para cada función, si
  `json` está en su cadena (§3.4). Los dos lados lo leen del mismo contrato; el servidor no mira
  `accept`.
- **El servidor solo entiende el formato de su función.** Un cuerpo de otro `content-type` es un
  415. Un JSON a una función sin `use json` no se lee: no hay segunda puerta.
- **Una URL que no nombra ninguna función** no tiene cadena: su 404 sale en `application/problem+json`
  si la petición lleva `accept: application/json`, y en `application/problem+fud` si no.
- **La compresión** (`compress`) se aplica igual que hoy, a los bytes que salen de cualquiera de
  los dos formatos.
- `application/fud` (un form posicional en JSON) desaparece: sin `use json`, un form viaja en
  binario; con él, con sus claves.

### 3.3. La firma

Un binario no aguanta un cambio de contrato: si `save` gana un argumento, una página vieja, que el
Service Worker todavía tiene en caché, mandaría bytes que el servidor nuevo lee mal sin darse
cuenta.

- Cada función tiene una **firma**: FNV-1a de 32 bits, en 8 dígitos hexadecimales en minúscula,
  del texto canónico de sus tipos de ruta, `query`, cuerpo (o form) y `->`. El texto canónico es
  el de `typeText` (`api/src/index-api.ts`) con cada `type` y cada `enum` desplegados, y se fija en
  §4.3.
- El compilador la emite en `FnSpec.sig`. El navegador la manda en `fud-sig`.
- El servidor compara antes de leer el cuerpo. Distinta o ausente: **412** con
  `detail: "the page is older than the server"`. Es un `HttpError` más: `error-pages` lo lleva a
  la página de error como cualquier otro.
- Las reglas no cambian bytes y no entran en la firma.

### 3.4. `use json`

En `packages/http/fudapi/middlewares.fudapi`:

```
# Calls in JSON instead of binary: for clients that are not a fudic page.
middleware json
```

- No tiene mitades: no hace nada en tiempo de ejecución. Es una marca que el compilador lee.
- Se usa y se quita como cualquier middleware: `use json` en `chain`, en el fichero o en la
  función; `skip json` en una función la devuelve a binario.
- El emisor pliega las tres capas (global, fichero, función) con las reglas de `compose` (`use`
  añade, `skip` quita, `skip *` vacía) y, si `json` queda en la lista, la función usa el códec
  JSON (§3.6).

### 3.5. Reglas en los argumentos

```
put save /:id
  use auth
  id      uuid
  name    str
    required
    max-length 80
  age     u8
    min 18                "Too young."
  tags    str[]
    max-length 20
  query search str
    min-length 2
```

- Debajo de un argumento (de ruta, `query` o cuerpo) van reglas, una por línea, con la forma de
  `RuleUse`: nombre, argumentos y texto opcional.
- **Solo las seis de `@fudic/forms`**: `required`, `min`, `max`, `min-length`, `max-length` y
  `pattern`. Una regla del proyecto, o una que no es `on field`, da `FUD1260` (§3.8).
- Se comprueban como en un campo: mismo nombre, mismos argumentos, mismo tipo admitido. Una regla
  que no admite el tipo del argumento da `FUD1083`; argumentos que no encajan, `FUD1084`; una regla
  desconocida, `FUD1080`; un `{x}` que nada rellena en su texto, `FUD1085`. El mensaje de `FUD1083`
  gana un parámetro para decir `argument` donde hoy dice `field`; su `.md` pasa a hablar de «a field
  or an argument».
- **El texto es opcional.** Si está, es el `detail` del 400. Si no, el `detail` es
  `argument <nombre>: <regla> <argumentos>`: `argument age: min 18`.
- **Mismo significado que en un form**, porque es el mismo código: el emisor usa los validadores
  de `@fudic/forms/contract` (`required`, `min`…). `pattern` nombra un patrón del proyecto, como en
  un form.
- Ni la forma del tipo en TypeScript ni el `.d.ts` cambian: una regla no cambia el tipo del
  argumento.

### 3.6. La API de `@fudic/http`

```ts
// @fudic/http/wire  (entrada nueva; sale el `./wire` de @fudic/forms)
export type Ty = /* el de hoy, de contract/wire.ts */ | 'any';

export interface Wire {
  readonly name: 'fud-bin' | 'json';
  /** Content types of a value and of a problem. */
  readonly type: string;
  readonly problemType: string;
  /** The body of a call; undefined when it has no body arguments. */
  encodeArgs(types: Readonly<Record<string, Ty>>, args: Readonly<Record<string, unknown>>): Uint8Array | string | undefined;
  decodeArgs(types: Readonly<Record<string, Ty>>, body: Uint8Array): Record<string, unknown>;
  encodeValue(ty: Ty, value: unknown): Uint8Array | string;
  decodeValue(ty: Ty, body: Uint8Array): unknown;
  encodeProblem(problem: Problem): Uint8Array | string;
  decodeProblem(body: Uint8Array): Problem;
}

// @fudic/http/wire/bin and @fudic/http/wire/json: one module each, so a page bundles only its own.
export const binWire: Wire;
export const jsonWire: Wire;

/** A form's schema as the type it travels as (§3.1). */
export function tyOfSchema(schema: Schema): Ty;

/** The signature of §3.3, from the canonical text. */
export function signature(canonical: string): string;
```

```ts
// FnSpec (contract/fn.ts) gains:
readonly wire: Wire;
readonly sig?: string;                                    // present with binWire
readonly returns?: Ty;                                    // absent = no value (204)
readonly rules?: Readonly<Record<string, readonly ArgRule[]>>;

export interface ArgRule {
  readonly check: Validator<never>;                       // from @fudic/forms/contract
  readonly name: string;                                  // `min`
  readonly args: readonly unknown[];                      // `[18]`
  readonly text?: string;
}
```

- `Reader`, `Writer` e `Io` se mudan de `@fudic/forms/src/wire/io.ts` a `@fudic/http/src/wire/`,
  sin cambiar un byte. `@fudic/forms` pierde la entrada `./wire`: solo la usaba `@fudic/http`.
- Las etapas `positional`, `binary` y `json` del pipeline (`client/stages/`) se sustituyen por una,
  `encode`, que llama a `spec.wire`. `compress` sigue igual.

### 3.7. `@fudic/testing`

```ts
/** A Response as the server of `fn` would send it: its value in the function's own format. */
export function respond<R>(fn: ServerFunction<never, R>, value: R, init?: ResponseInit): Response;
/** The same for a failure. */
export function respondProblem(fn: ServerFunction<never, unknown>, problem: Problem): Response;
```

Para la opción `fetch` de un test, que contesta con un `Response` a mano: con binario por defecto,
un `Response.json(…)` ya no lo entiende la llamada. Las dos leen el `FnSpec` de la función: el
`stub` lo guarda en `spec`, como ya lo hace `fn`.

### 3.8. El código nuevo

| Código | Severidad | Título (`.md`) | Cuándo | Span |
|---|---|---|---|---|
| `FUD1260` | error | Rule not for an argument | Debajo de un argumento, una regla que no es una de las seis de `@fudic/forms` | el nombre de la regla |

Mensaje: `` rule `email-taken` cannot check an argument: only required, min, max, min-length,
max-length and pattern can ``.

**Fix** del `.md`: «check it in the handler, or use one of the built-in rules: `max-length 80`».

## 4. Comportamiento

### 4.1. Una llamada, paso a paso

**En el navegador** (`stub`, `contract/fn.ts`):

1. Se reparte el argumento en ruta, `query` y cuerpo, y cada valor pasa su `conform`, como hoy.
2. **Las reglas.** Para cada argumento con reglas, en orden de declaración, cada regla en el orden
   escrito: la primera que falla rechaza la llamada con un `HttpError` 400 con el `detail` de
   §3.5. No sale ninguna petición. Es el mismo camino que un tipo que no encaja hoy.
3. La cadena de cliente, como hoy.
4. El paso final codifica con `spec.wire` (en un `get`, en `?a=`), pone `content-type` y, con
   `binWire`, `fud-sig`; comprime si toca; `fetch`.
5. **La vuelta.** Un 2xx se decodifica con `decodeValue(spec.returns, …)`; un 204 es `undefined`.
   Otro estado se decodifica como problema según su `content-type`
   (`application/problem+fud` o `application/problem+json`) y se lanza la clase que corresponde
   (`fromProblem`, `client/codec.ts`). Un cuerpo que no es ninguno de los dos (un 502 de un proxy)
   sigue siendo `{ status, title: statusText }`.
6. Con `jsonWire`, el valor que vuelve pasa por `conform(spec.returns, …)`: un `-> date` vuelve
   como `Date` también en JSON.

**En el servidor** (`serve`, `contract/server.ts`):

1. Método, implementación, ruta y `query`, como hoy.
2. Con `binWire`, `fud-sig` contra `spec.sig` (§3.3).
3. El cuerpo: se descomprime (`server/body.ts`) y se exige el `content-type` del formato de la
   función (415 si no). Se decodifica con `decodeArgs`; un form, con `tyOfSchema(form.$schema)`.
4. `conform` de cada argumento, y **las reglas**, igual que en el navegador: la primera que falla
   es un 400 con el mismo `detail`.
5. La cadena de servidor y el handler, como hoy.
6. **El valor de vuelta** pasa `conform(spec.returns, …)` antes de escribirse. Si no encaja, es un
   fallo del handler: 500, con el motivo en `detail` solo en dev, como cualquier excepción.
7. Un error se escribe con `encodeProblem` del formato de la función.

### 4.2. El códec binario

- **Un solo recorrido por tipo** sirve a los dos sentidos, como el de forms hoy: una función recibe
  un `Io` y, al escribir, el valor; leer y escribir son la misma línea. Tocar un sentido sin el
  otro es un bug.
- **Leer nunca se fía.** Un cuerpo más corto o más largo que su tipo, una longitud de `str` mayor
  que lo que queda, un índice de `enum` fuera de rango, una etiqueta de `any` desconocida o un
  UTF-8 inválido: 400 con `binary body: …` en `detail`. El lector no reserva memoria por una
  longitud antes de comprobar que esos bytes existen.
- **Escribir exige que el valor encaje**: se escribe lo que ya pasó `conform`.
- **Las claves de un mapa** se escriben con su tipo (`map u16 str`: cada clave, 2 bytes) y se leen
  de vuelta como texto, que es lo que es una clave de un objeto de JS; `conform` ya las comprueba
  así (`fromText`).

### 4.3. La firma, exacta

El texto canónico de una función es, en una línea, separado por `|`:
`route(<nombre>:<tipo>,…)|query(…)|body(…)|-><tipo>`, donde cada `<tipo>` es su `typeText`, un
`type` se escribe `{campo:tipo,…}` con sus campos en orden de declaración, un `enum`
`<a|b|c>`, y un form `form{…}` con sus controles como en §3.1. Un tipo que se nombra a sí mismo se
escribe `@<nombre>` la segunda vez. Una parte vacía se escribe igual, con sus paréntesis vacíos;
sin `->`, `->`. El emisor calcula la firma; `signature` está en `@fudic/http/wire` para que un
test, o un backend, la recalcule.

### 4.4. Lo que se puede podar

- La página solo empaqueta el códec que usan sus funciones: el emisor importa `binWire` desde
  `@fudic/http/wire/bin` o `jsonWire` desde `@fudic/http/wire/json`, y nunca los dos si no hacen
  falta los dos. `fn.ts` y el pipeline no importan ninguno.
- Los validadores de las reglas entran solo si una función de la página los usa: el emisor importa
  cada uno por su nombre de `@fudic/forms/contract`.
- `tyOfSchema` vive en su propio módulo y solo lo importa quien tiene una función con form.

### 4.5. Lo que se migra

- **Los tests de `@fudic/http`** que leen JSON del cable (`test/body/*`, `test/client/codec.test.ts`,
  `test/contract/fn.test.ts`, `test/contract/handler.test.ts`, `test/server/problem.test.ts`,
  `test/server/serve.test.ts`) pasan a comprobar el binario; los que prueban JSON se quedan, con
  `use json`.
- **Los de `@fudic/vite`** que miran el cuerpo o el `content-type` de una función
  (`http-dev`, `http-build`, `http-functions`, `dev`, `dev-unit`).
- **El test de bytes de forms** se muda con el códec y pasa sin cambiar un byte esperado.
- **`examples/*`**: nada cambia en su código fuente; los e2e de `usuarios`, el alta y `sesion`
  pasan en binario. `examples/fudapi-editor` gana un argumento con reglas, y `examples/basic`, una
  función con `use json`, para que los dos caminos tengan e2e.
- **El editor del `.fudapi`**: el formateador alinea las reglas de un argumento como las de un
  campo; el autocompletado ofrece las seis reglas debajo de un argumento; los tokens semánticos
  las pintan igual que en un form; el hover de una regla funciona igual.
- **README de `@fudic/http`** (en inglés, sin citar SDD): el formato por defecto, `use json`, las
  reglas en los argumentos y dónde están los vectores.

## 5. Invariantes

- **Un contrato, un formato.** Cada función habla exactamente uno, que el compilador decide; los
  dos lados lo leen del mismo `FnSpec`.
- **Los dos lados comprueban lo mismo.** Tipos y reglas, con el mismo código y el mismo `detail`,
  en el navegador y en el servidor. Saltarse el navegador no salta nada.
- **Los forms no cambian de bytes.** El binario de un form es un caso del general.
- **Leer no lanza nada que no sea un 400.** Ningún cuerpo, por roto que esté, llega al handler ni
  tumba el proceso.
- **Nada de JSON por accidente.** Sin `use json` no hay ni una llamada en JSON, ni de ida ni de
  vuelta.
- **Cobertura:** lo nuevo, al 100 % en las cuatro métricas; los umbrales de `@fudic/http`,
  `@fudic/api` y `@fudic/forms` no bajan.

## 6. Criterios de aceptación

**El formato**

1. **Vectores.** Cada caso de `wire/vectors.json` se escribe exactamente como su `hex` y se lee de
   vuelta igual a su `value`. Hay al menos uno por fila de las tablas de §3.1, uno por etiqueta de
   `any`, un form con `group`, una respuesta y un problema 422 con `errors` y `summary`.
2. **Forms sin cambios.** Los tests de bytes de forms de hoy pasan contra el códec nuevo con los
   mismos bytes esperados.
3. **Lectura hostil.** Un cuerpo truncado, uno con bytes de más, una `str` que dice medir 2³² bytes,
   un `enum` con índice 9 de 3 y una etiqueta `any` 7 dan cada uno un 400 con `binary body:` en
   `detail`, sin llamar al handler.
4. **Fechas.** Un `-> date` vuelve como `Date` en binario y en JSON; un argumento `date` del año
   6000 no sale del navegador (400 sin petición), en ninguno de los dos formatos.

**Una llamada**

5. `save({ id, notify: true, active: false })` sobre la función de §1 manda `PUT
   /_fudic/fn/…/save/<id>?notify=true` con `content-type: application/fud+bin`, `fud-sig` y un
   cuerpo de **1 byte** (`0x00`).
6. Un `get search` con `q: "ana"` lleva `?a=` en base64url y su respuesta `Person[]` llega como
   `application/fud+bin` y se lee igual que el valor que devolvió el handler.
7. Un 404 lanzado por el handler llega como `application/problem+fud` y en el navegador es un
   `HttpError` 404 con su `detail`; un 422 de un form es un `ValidationError` con sus `errors` y su
   `summary`; un `Redirect` conserva su `location`.
8. **La firma.** Con un `fud-sig` distinto, el servidor contesta 412 con
   `the page is older than the server` y no llama al handler; sin `fud-sig`, igual. Añadir un
   argumento, cambiar un tipo o reordenar un `enum` cambia la firma; añadir una regla o un
   comentario, no.
9. **415.** Un `application/json` a una función sin `use json`, o un `application/fud+bin` a una
   con él, es un 415.
10. Un handler que devuelve `{ id: 1 }` donde `->` dice `Person` (con `id uuid`) da un 500; en dev
    su `detail` nombra el campo, en build no lleva `detail`.

**`use json`**

11. Con `use json` en la función, la misma llamada del criterio 5 lleva `application/json` con sus
    claves, sin `fud-sig`, y el problema vuelve en `application/problem+json`. Con `use json` en
    `chain` y `skip json` en una función, esa función va en binario y las demás en JSON.
12. Un form a una función con `use json` viaja con sus claves (`application/json`); sin él, en
    binario. Ninguna petición sale con `application/fud`.
13. **Poda.** El bundle de cliente de una página cuyas funciones son todas binarias no contiene
    `jsonWire`; el de una página con todas en JSON no contiene el lector binario; una página sin
    reglas no contiene `minLength`.
14. Una URL bajo `/_fudic/fn/` que no nombra ninguna función da un 404 en
    `application/problem+json` con `accept: application/json`, y en `application/problem+fud` sin él.

**Las reglas**

15. Con `name str` y `max-length 80`, llamar con 81 caracteres rechaza la llamada en el navegador
    con un `HttpError` 400 y `detail: "argument name: max-length 80"` **sin ninguna petición**; la
    misma petición mandada a mano al servidor da el mismo 400 y el handler no se ejecuta.
16. Con `min 18 "Too young."`, el `detail` es `Too young.`.
17. Las seis reglas, sobre un argumento de ruta, uno de `query` y uno de cuerpo, aceptan y rechazan
    los mismos valores que en un campo de form (tabla de casos compartida con los tests de forms).
18. **Diagnósticos.** `email-taken` debajo de un argumento da `FUD1260` sobre su nombre;
    `min-length 3` sobre un `i32`, `FUD1083`; `min "a"`, `FUD1084`; `max-lenght 3`, `FUD1080` con
    `max-length` como candidato; `"{x}"` en el texto, `FUD1085`.
19. **Editor.** El formateador deja las reglas de un argumento alineadas como las de un campo
    (idempotente); el autocompletado debajo de un argumento ofrece las seis reglas y ninguna del
    proyecto; el hover de `max-length` debajo de un argumento muestra su doc.

**`@fudic/testing`**

20. Un test con `fetch` que contesta `respond(search, [ana])` hace que `search({ q: 'a' })` resuelva
    `[ana]`; con `respondProblem(save, { status: 409, title: 'Conflict' })`, rechaza con un
    `HttpError` 409.

**Entrega**

21. `FUD1260` tiene `.ts`, `.md` y línea en `index.ts`. `pnpm typecheck`, `pnpm test` y
    `pnpm build` en verde; lo nuevo al 100 % en las cuatro métricas; ningún umbral baja.
    `examples/` sin diagnósticos y sus e2e en verde, con los dos nuevos de §4.5.

## 7. Fuera de alcance

- **El endpoint de datos de `load`** (lo que pide el Service Worker al navegar) y el streaming de
  `load`: SDD-70, que lo trocea y lo pasa a binario con este mismo formato.
- **La sesión por cookie**: SDD-69.
- **Las llamadas reactivas** (cancelar la anterior, `pending`, repintar tras una mutación):
  SDD-68.
- **Comprimir las respuestas.** Hoy solo se comprime la subida; seguirá así.
- **Reglas en los campos de un `type`, en el `load` o en el valor de vuelta.** Solo los argumentos.
- **Reglas del proyecto en los argumentos** (`rule email-taken`): se comprueban en el handler
  (§8.1, 4).
- **Implementar `fud-bin` en otro lenguaje.** Aquí se escribe y se prueba con vectores; el backend
  de otro lenguaje es IDEA-05.

## 8. Decisiones

### 8.1. Tomadas al redactar

1. **Binario por defecto en todo, JSON solo con `use json`.** Lo decidió Pedro: ahorra en cada
   llamada, y que la pestaña Network no se lea no es un precio. Sin `use json`, el servidor no
   acepta JSON: una segunda puerta que nadie usa es una puerta que nadie prueba.
2. **`json` es un middleware sin mitades, que lee el compilador.** Así se escribe, se hereda y se
   quita (`use`, `skip`) como los demás, y el compilador sabe el formato de cada función. Si se
   decidiera en tiempo de ejecución, la página tendría que llevar los dos códecs siempre.
3. **Un solo formato binario, el de los forms generalizado.** No hay un segundo formato: un form es
   un nivel más, sus bytes no cambian, y desaparecen la vuelta a JSON de `representable` y el
   `application/fud` posicional. Lo que no cabe se rechaza, como un `u8` con 300.
4. **En los argumentos, solo las seis reglas de `@fudic/forms`.** Una regla del proyecto se escribe
   para un form: recibe el form y puede correr en el servidor con `.check`. Un argumento no tiene
   form. Lo que esas reglas comprueban (un email repetido) es lógica del handler.
5. **Mismo código para la regla en un form y en un argumento.** El emisor usa los validadores de
   `@fudic/forms/contract`. Así `required`, `min-length` o `pattern` no pueden significar dos cosas.
6. **El texto de una regla en un argumento es opcional y es el `detail`.** No hay un campo donde
   pintarlo; sin texto, el `detail` lo genera fudic en inglés.
7. **Sin `max-length` implícito.** Un `str` sin reglas acepta cualquier tamaño, como hoy. Las reglas
   las pone quien escribe el contrato; fudic no se inventa un límite.
8. **Firma y 412.** Sin ella, una página en la caché del Service Worker tras un despliegue mandaría
   bytes que el servidor lee mal sin saberlo. Con ella, el error es claro y `error-pages` lo
   enseña. No se recarga la página sola: eso es decisión de la app.
9. **El formato lo decide el contrato, no `accept`.** Solo el 404 de una URL sin función mira
   `accept`, porque no tiene contrato del que leerlo.
10. **`uuid` en 16 bytes y `enum` por índice.** Es lo que el contrato permite; la firma cubre el
    riesgo de reordenar un `enum`.
11. **El valor de vuelta se comprueba en el servidor.** Un binario no puede escribir algo que no es
    de su tipo; comprobarlo antes da un error que dice qué campo está mal, en lugar de bytes rotos.
12. **Los vectores, publicados con `@fudic/http`.** Son la especificación ejecutable que un backend
    de otro lenguaje puede pasar sin leer el código TS.
13. **`respond` y `respondProblem` en `@fudic/testing`.** La opción `fetch` contesta con un
    `Response`; sin una ayuda, cada test tendría que codificar binario a mano.
14. **Un middleware sin mitades es válido** (decidido con Pedro al implementar). SDD-60 lo
    rechazaba con `FUD1073`; `json` es justo eso, una marca que lee el compilador. `FUD1073` deja
    de aplicarse a `middleware`, para cualquier middleware, no solo `json`.

### 8.2. Tomadas al implementar

1. **El límite de 48 bits lo comprueba `conform`**, en los dos formatos: una fecha fuera de
   ±2⁴⁷ ms es un 400 antes de salir. Ojo, el criterio 4 dice «año 6000», pero 48 bits llegan
   hasta el año 6429: el test usa un año posterior.
2. **Con un form, `FnSpec.args` son sus controles** (`formTypes(form.$schema)`, de
   `@fudic/http/wire`), que escribe el emisor. Así ni `fn.ts` ni el pipeline importan
   `schema.ts` (§4.4), y los dos lados leen el cuerpo con los mismos tipos.
3. **`decodeValue` pasa `conform`** también en binario: un opcional ausente vuelve como clave
   ausente, no como `null`. `decodeArgs` deja `null`, porque `$set` de un form pide todas las
   claves.
4. **Lectura hostil sin reservar memoria:** una lista exige al menos un bit por elemento y un
   mapa dos antes de crear nada; un varint de más de 8 bytes y un UTF-8 inválido son 400.
5. **`html` viaja como `str`.** No está en la tabla de §3.1; su texto es lo que cruza
   (SDD-61 §4.7).
6. **Sin `->`, siempre 204**, aunque el handler devuelva algo; con `->`, un valor `undefined`
   tras `conform` también es 204.
7. **La firma la calcula el emisor con su propio FNV-1a** (`@fudic/api` no depende en tiempo de
   ejecución de `@fudic/http`); un test comprueba que coincide con `signature`.
8. **Los validadores de las reglas se importan con alias** (`min as $min`) para no chocar con
   las reglas de `fudic:@fudic/forms/rules` que importa un form del mismo fichero.
9. **El autocompletado debajo de un argumento ofrece las seis**, sin filtrar por tipo (criterio
   19); al elegir una que no aplica, `FUD1083` lo dice.
10. **El formateador no cambia:** trabaja por tokens y ya alinea las reglas de un argumento como
    las de un campo.
