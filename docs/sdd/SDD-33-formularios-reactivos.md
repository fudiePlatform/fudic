# SDD-33 — Formularios reactivos: el núcleo (`@fudic/forms`)

> **Estado:** `Listo`
> **Paquete:** `@fudic/forms` — **paquete nuevo**, punto de entrada `.` (el núcleo). El punto de
> entrada `./dom` y la clase base de un control-componente son de [SDD-34](./SDD-34-forms-compilador.md).
> **Depende de:** 14 (`signal`), 31 (`computed`, `effect`, `untrack`, `subscribe` y la regla de
> que `()` es la única forma de leer)
> **Rango de diagnósticos:** ninguno. Este SDD no toca el compilador y **el runtime de fudic no
> diagnostica** (SDD-17 §Naturaleza, SDD-31 §5): lo que aquí falla es un `TypeError` o un
> `RangeError` de programación.
> **Naturaleza:** runtime puro, **sin una sola referencia al DOM en ninguna rama**. Corre igual en
> el navegador, en el prerender y en Node.
>
> Formaliza la mitad de `docs/forms/` que ningún documento poseía. El prototipo que Pedro aportó
> (commit `bc5a2a3`) especifica el **transporte** —envío posicional y salida binaria— y los dos
> documentos declaran explícitamente fuera de alcance el núcleo que usan. Este SDD es ese núcleo.

---

## 1. Contexto y objetivo

`docs/forms/forms.js` es un modelo de formulario que funciona: `form()`, `control()`, `group()`,
validadores isomórficos y de servidor, validación por ruta, `$value`/`$errors`/`$summary`. Está
probado por diez casos con veredicto y por un formulario real con inputs. Pero es un prototipo
escrito sin contexto del repositorio, y como modelo tiene tres carencias que aquí se cierran:

- **No es reactivo.** El valor de un control es una propiedad de un objeto plano. Nada se entera
  de que cambió: el prototipo repinta porque su capa DOM llama a `$validate()` y a `paint()` a
  mano en cada pulsación. En fudic ya existe la reactividad (SDD-14, SDD-31) y un formulario es,
  literalmente, el caso de uso que la justifica.
- **No tiene identidad de estado de interacción.** `touched` vive en un `dataset` del elemento
  (`bind.js:47`), o sea en el DOM. Un formulario construido por código —el caso que este SDD
  tiene que soportar— no tiene DOM donde guardarlo.
- **Escribe donde no debe.** `$value = obj` asigna **todos** los campos, así que un objeto parcial
  vacía en silencio lo que no menciona; y `$positional` —serialización de transporte— es un getter
  del propio formulario, lo que mete el serializador en el bundle de todo el que declare un form
  (§4.7).

**El objetivo:** el modelo de formulario de fudic como estado reactivo, con validación asíncrona
ordenada, sin DOM y podable por ruta. Que un formulario **se pueda construir, rellenar, validar y
leer sin que exista un `<form>` en ninguna parte** no es una funcionalidad de este SDD: es la
invariante que lo define, y es lo que permite que el mismo fichero de schema lo importen el
cliente, el prerender y el servidor.

### Lo que este SDD NO es

No es el enlace con el DOM, ni la directiva `control`, ni la clase base de un control-componente,
ni el borrado de los validadores de servidor del bundle de cliente: todo eso es SDD-34 y necesita
al compilador. Y no es el transporte: el envío posicional queda aparcado hasta que exista
`@fudic/http`, con su prototipo ya medido esperando en `docs/forms/`.

---

## 2. Dependencias

| Fuente | Aporta |
|---|---|
| SDD-14 | `signal<T>` con `()` y `set()`. El valor de un control **es** una signal; este SDD no inventa una segunda primitiva reactiva. |
| SDD-31 | `computed` (pull, sin baja), `effect` (push, con baja), `untrack`, `subscribe` y la regla de superficie: `()` es la **única** forma de leer y rastrea si hay consumidor activo. La API de este SDD la respeta al pie de la letra: todo lo que se lee de un formulario se lee llamando. |
| — | Nada más. Ni parser, ni emit, ni `@fudic/dom`. Un `import` de este paquete a cualquier cosa que toque el DOM es un fallo de arquitectura, no un detalle. |

`@fudic/forms` declara `@fudic/core` como dependencia de runtime y `sideEffects: false`. No tiene
ninguna otra.

---

## 3. Interfaz pública

```ts
// packages/forms/src/types.ts
/** El mapa de errores de un nodo. `{ required: true }`, `{ minLength: 3 }`. */
export type Errors = Readonly<Record<string, unknown>>;

/** Lo que se puede leer de forma rastreada (el `Readable<T>` de SDD-31). */
export type Readable<T> = () => T;

/**
 * Un validador. Recibe el valor y el formulario **raíz**, para las reglas que miran a otro
 * campo. Devuelve `null` si el valor es bueno. Puede ser asíncrono.
 */
export type Validator<T> = (value: T, root: AnyForm) => Errors | null | Promise<Errors | null>;

// packages/forms/src/control.ts
export interface Control<T> {
  /** Lectura RASTREADA del valor. Es la única forma de leerlo (SDD-31 §4.0). */
  (): T;
  /** Escritura. Normaliza `undefined` a `null` (§4.4) y marca `dirty`. */
  set(v: T): void;
  /** Errores de la última validación, o `null`. Lectura rastreada. */
  readonly errors: Readable<Errors | null>;
  /** El usuario ya pasó por el campo. Lo decide quien enlaza, no el modelo. */
  readonly touched: Readable<boolean>;
  /** El valor cambió respecto al inicial. */
  readonly dirty: Readable<boolean>;
  /** Marca `touched`. Idempotente. */
  touch(): void;
  /** Vuelve al valor inicial (o al que se le dé) y limpia errores, `touched` y `dirty`. */
  reset(v?: T): void;
}

export function control<T>(initial: T, validators?: readonly Validator<T>[]): Control<T>;

// packages/forms/src/group.ts
/** Un nodo intermedio. Tiene hijos y validadores propios, y no tiene valor propio. */
export function group<S extends Schema>(schema: S, validators?: readonly Validator<Value<S>>[]): GroupNode<S>;

// packages/forms/src/form.ts
export type Schema = { readonly [k: string]: Node };
export type Node = Control<unknown> | GroupNode<Schema>;

/** El valor de un schema, en forma de objeto con claves. */
export type Value<S extends Schema> = { [K in keyof S]: ValueOf<S[K]> };

/** Errores del formulario entero, indexados por ruta: `{ title: {...}, 'seo.canonical': {...} }` */
export type ErrorMap = Readonly<Record<string, Errors>>;

export interface FormApi<S extends Schema> {
  /** El valor entero, en forma de objeto. Lectura RASTREADA: leerlo en un efecto lo suscribe. */
  $value: Readable<Value<S>>;
  /** Asignación COMPLETA. Falta un campo ⇒ `TypeError` con el nombre. Nada se vacía en silencio. */
  $set(v: Value<S>): void;
  /** Asignación PARCIAL. Lo que no se menciona no se toca (§4.3). */
  $patch(v: Partial<Value<S>>): void;

  /** Corre los validadores y publica el resultado. Devuelve si el formulario es válido. */
  $validate(opts?: { readonly server?: boolean }): Promise<boolean>;
  /** El mapa de errores por ruta de la última validación, o `null`. Lectura rastreada. */
  $errors: Readable<ErrorMap | null>;
  /** El error de formulario —el que no es de ningún campo—, o `null`. Lectura rastreada. */
  $summary: Readable<Errors | null>;
  /** Publica errores venidos de fuera (un 422), indexados por ruta. Marca `touched` los suyos. */
  $setErrors(errors: ErrorMap | null, summary?: Errors | null): void;

  /** `touch()` en cascada. Lo que un submit necesita para que los errores se vean. */
  $touch(): void;
  /** Vuelve al estado inicial: valores, errores, `touched` y `dirty`. */
  $reset(): void;

  /** Los nombres de campo, en orden de declaración. El namespace `$` no son campos. */
  $fields(): readonly (keyof S & string)[];
  /** El schema tal cual se declaró. Es el contrato que los dos extremos comparten. */
  readonly $schema: S;
}

/** Un formulario es su API más sus campos por nombre. */
export type Form<S extends Schema> = FormApi<S> & { readonly [K in keyof S]: S[K] };
export type GroupNode<S extends Schema> = Form<S>;   // un group ES un formulario anidado
export type AnyForm = Form<Schema>;

export function form<S extends Schema>(schema: S, options?: FormOptions<S>): Form<S>;

export interface FormOptions<S extends Schema> {
  /** Validador de formulario: el error que no pertenece a ningún campo. */
  readonly summary?: (root: Form<S>) => Errors | null | Promise<Errors | null>;
}

// packages/forms/src/validators.ts — cada uno su propio export, cada uno podable
export function validator<T>(fn: Validator<T>): Validator<T>;
/** Marca un validador que SOLO corre con `{ server: true }`. Su cuerpo no llega al cliente. */
export function serverValidator<T>(fn: Validator<T>): Validator<T>;
export const required: Validator<unknown>;
export function minLength(n: number): Validator<string | readonly unknown[]>;
export function maxLength(n: number): Validator<string | readonly unknown[]>;
export function min(n: number): Validator<number>;
export function max(n: number): Validator<number>;
export function pattern(re: RegExp): Validator<string>;
```

Seis cosas de la firma que son decisiones, no notación:

- **Un `Control<T>` se lee llamándolo, exactamente como una signal.** No hay `.value`. Un
  formulario es el sitio donde más se lee estado reactivo, y tener dos formas de leer en el mismo
  fichero —`count()` para una signal y `title.value` para un control— es la incoherencia que
  SDD-31 §4.0 acaba de quitar de en medio.
- **`errors`, `touched` y `dirty` son lecturas, no campos.** Se leen igual que el valor y por la
  misma razón: quien pinte un error tiene que poder depender de él.
- **`$set` es total y `$patch` es parcial, y son dos funciones.** El prototipo tenía una sola
  (`set $value`) que se comportaba como total: un objeto al que le faltara `body` dejaba `body` en
  `null` sin decir nada. Con dos nombres, el que vacía lo hace porque se llama así.
- **`$setErrors` existe porque el 422 vuelve por ruta.** Es la única operación del núcleo que
  resuelve una ruta en tiempo de ejecución, y es la única que lo necesita: el enlace con el DOM no
  navega por rutas nunca (§4.6).
- **`serverValidator` es un export propio, no `validator.server`.** Un namespace colgado de una
  función es exactamente lo que la poda no puede tirar (§4.7). El modelo aporta la marca y el
  salto —sin `{ server: true }` no corre—; **borrar su cuerpo del bundle de cliente** es del
  plugin y lo especifica SDD-34 §4.7.
- **`Schema` es un objeto plano, y el orden de `Object.keys` es el contrato.** No hay clase, no
  hay builder, no hay registro. Es lo que permite que el fichero del schema lo importen los dos
  extremos y que el transporte, cuando llegue, no necesite metadatos.

### 3.1. Controles tipados: el tipo es del modelo, el binario es del transporte

```ts
// packages/forms/src/typed/ — un fichero y un export por tipo
export type TypeTag =
  | 'u8' | 'i8' | 'u16' | 'i16' | 'u32' | 'i32' | 'f32' | 'f64'
  | 'bool' | 'str' | 'date' | 'arr';

/** Un control que además declara su tipo. El transporte lo lee; el modelo lo valida. */
export interface TypedControl<T> extends Control<T> {
  readonly type: TypeTag;
  /** Solo en `arr`: el tipo de sus elementos. */
  readonly of?: TypeTag;
}

export function u8 (initial?: number, v?: readonly Validator<number>[]): TypedControl<number>;
export function i8 (initial?: number, v?: readonly Validator<number>[]): TypedControl<number>;
export function u16(initial?: number, v?: readonly Validator<number>[]): TypedControl<number>;
export function i16(initial?: number, v?: readonly Validator<number>[]): TypedControl<number>;
export function u32(initial?: number, v?: readonly Validator<number>[]): TypedControl<number>;
export function i32(initial?: number, v?: readonly Validator<number>[]): TypedControl<number>;
export function f32(initial?: number, v?: readonly Validator<number>[]): TypedControl<number>;
export function f64(initial?: number, v?: readonly Validator<number>[]): TypedControl<number>;
export function bool(initial?: boolean, v?: readonly Validator<boolean>[]): TypedControl<boolean>;
export function str (initial?: string, v?: readonly Validator<string>[]): TypedControl<string>;
export function date(initial?: Date | null, v?: readonly Validator<Date | null>[]): TypedControl<Date | null>;

/** Lista homogénea. El tipo de elemento se declara pasando SU FACTORÍA, no una cadena. */
export function arr<T>(of: () => TypedControl<T>, initial?: readonly T[]): TypedControl<readonly T[]>;
```

```ts
// slices/pos/order-line.form.ts — el schema que los dos extremos importan
export const orderLine = {
  itemId:   u32(0, [required]),
  qty:      u16(1, [min(1)]),
  priceCts: u32(0),
  vatPct:   u8(21),
  takeaway: bool(false),
  at:       date(),
  note:     str(''),
  tags:     arr(str, []),
};
```

Cuatro decisiones, y las cuatro salen de las medidas que ya están hechas
(`docs/forms/typed-binary.mjs`):

- **El tipo vive en el modelo, no en el transporte.** `u8(21)` **no admite 300 ni −1**: el ancho
  declarado *es* un rango, y su violación es un error de validación normal, publicado en
  `errors` como `{ range: 'u8' }`, en el mismo sitio que los demás (§4.8). Eso vale con o sin
  binario: un campo de porcentaje que rechaza 300 sirve igual mandándose como JSON.
- **Un export por tipo, jamás `control.u8()`.** Es lo que hace cierta la promesa de la propuesta
  original —*«si yo no quiero formularios con tipo, eso no tiene que estar en el explorador»*—.
  Con un namespace colgado de `control`, tocar `control` arrastra los once códecs; con once
  exports, quien no importa `date` no se lleva su rango ni su conversión.
- **`arr` recibe la factoría del elemento, no una cadena.** `arr(str, [])` se lee igual que
  `arr('str', [])` y no obliga a que exista una tabla `{ str: …, u8: … }` viva en el bundle, que
  es la forma que la poda no puede tirar. La factoría se invoca una vez, al construir el schema,
  para leer su `type`.
- **Opt-in por control, no por formulario.** `control(v)` sigue existiendo y no cambia nada; un
  schema puede mezclar tipados y sin tipar. Lo que un schema mixto **no** puede es salir en
  binario, y de eso se ocupa el transporte degradando a JSON, no este SDD.

**Lo que aquí NO entra: el códec.** Escribir y leer el búfer —los anchos de §3.1 del documento de
schema tipado, el bitfield de booleanos, los 48 bits de `date`, el contador de los variables— es
del SDD de transporte, junto con la etapa que sustituye a `json` y el `application/fud+bin`. Este
SDD entrega la **declaración** y su validación; aquel entrega los bytes. La razón de partirlo así
es que la declaración hay que tenerla **antes**: si los tipos llegasen con el transporte, adoptar
el binario obligaría a reescribir todos los schemas ya escritos.

### 3.2. Lo que exporta el punto de entrada

`form`, `group`, `control`, `validator`, `serverValidator`, los seis validadores de serie, las
doce factorías tipadas y los tipos. Nada más, y todo como **exports nombrados de funciones
sueltas**: ningún objeto con métodos colgando, ninguna factoría con namespace, ningún registro que
se rellene al importar (§4.7).

---

## 4. Comportamiento

### 4.1. Un control es una signal con estado de interacción alrededor

```
control(initial, validators)
   ├── value    : signal<T>          ← el valor. `()` lo lee, `set` lo escribe
   ├── errors   : signal<Errors|null>← lo publica $validate, o $setErrors
   ├── touched  : signal<boolean>
   └── dirty    : signal<boolean>    ← `!Object.is(value, initial)`, calculado en `set`
```

Cuatro signals y ninguna maquinaria más. `dirty` no es un `computed` porque su fuente es el valor
inicial, que no es reactivo: comparar en el `set` cuesta lo mismo y no crea un nodo derivado.

**Lo que un control NO tiene:** ni `disabled`, ni `pending`, ni el estado de "validando". Lo
primero es del elemento (SDD-34); lo segundo se anota como fuera de alcance en §7 con su motivo.

### 4.2. Un `group()` es un formulario anidado, y por eso no hay una tercera clase

`group(schema)` devuelve **lo mismo** que `form(schema)`: la misma API `$`, los mismos campos por
nombre. La única diferencia es quién lo crea. Eso hace que `f.seo.$value()`, `f.seo.$touch()` y
`f.seo.$errors()` existan sin escribir una línea para el caso anidado, y que el enlace con un
elemento —agrupar errores en un `<fieldset>`, SDD-34— sea el mismo código para el formulario raíz
que para un grupo.

`Node` es, por tanto, una unión de dos casos y no de tres. La recursión del recorrido tiene un
solo `if`.

### 4.3. Escribir: total, parcial, y ninguna tercera vía

- **`$set(v)`** exige el objeto **completo**. Un campo ausente es `TypeError` nombrándolo, no un
  vaciado. Es la operación de "cargar este formulario con estos datos".
- **`$patch(v)`** toca **solo** lo que aparece. Un `group` anidado se parchea recursivamente: lo
  que no se menciona dentro del grupo tampoco se toca.
- **Un campo desconocido es `TypeError` en las dos.** El schema es el contrato; escribir en un
  nombre que no existe es un fallo del que llama, no un dato que se ignora.

La razón de que esto sea una regla y no un detalle: el caso real que lo obliga es un `PATCH` cuyo
cuerpo trae tres campos de doce. Con una sola operación de escritura de semántica total, ese
cuerpo vacía nueve campos y el formulario se manda de vuelta al servidor vaciado.

### 4.4. `null` es el vacío canónico, y la normalización es superficial

Un control **nunca** guarda `undefined`: `control()` sin valor arranca en `null` y `set(undefined)`
guarda `null`. Se normaliza al escribir, en un solo sitio.

**Y solo ahí.** El prototipo normaliza **en profundidad** —recorriendo objetos y arrays dentro del
valor de un control, convirtiendo funciones y símbolos, detectando ciclos— y tiene razón en el
problema que resuelve: `JSON.stringify` borra las claves `undefined` de un objeto y conserva la
posición en un array, así que el roundtrip deja de ser identidad. Pero ese problema **es de la
serialización**, no del modelo: mientras el valor no cruce un cable, un objeto con una propiedad
en `undefined` es un objeto perfectamente válido y copiarlo entero en cada escritura es trabajo
—y bytes— que paga todo el mundo para el caso de nadie.

Decisión: **la normalización profunda se muda al SDD de transporte**, con su arnés (caso 10 de
`docs/forms/cases.js`) ya escrito, y aquí queda la superficial, que cuesta una comparación. Es la
misma frontera que la que separa `$value` de `$positional` en §4.7.

### 4.5. Validar: por nodo, en cascada, y con orden garantizado

`$validate()` recorre el schema en orden de declaración y, por cada nodo:

1. sus validadores, **en orden**, y **corta en el primero que falle** — un campo tiene un error,
   no una lista;
2. publica el resultado en `node.errors`;
3. si el nodo es un grupo, baja antes de seguir.

Al final ejecuta `options.summary` si lo hay, publica `$errors` (el mapa por ruta, o `null`) y
`$summary`, y devuelve si el formulario es válido. `$validate` de un grupo valida **su** subárbol:
es el mismo código, con otra raíz.

**El orden asíncrono es parte del contrato, y es donde el prototipo tiene un agujero.** Un
validador puede ser asíncrono —el `slugAvailable` de `blog.form.js` lo es—, y un formulario se
valida en cada pulsación. Dos validaciones solapadas terminan en el orden que quiera la red, y la
que empezó antes puede publicar **después**: el usuario ve el error de lo que escribió hace tres
letras. La regla:

> Cada control lleva una **época**. `set` la incrementa. Un resultado de validación solo se
> publica si la época que llevaba sigue siendo la vigente; si no, se descarta en silencio.

Es un entero por control y quita de en medio una clase entera de defectos que solo aparecen con
latencia real. El mismo mecanismo cubre el formulario: dos `$validate()` solapados publican solo
el del último.

**`{ server: true }`** solo cambia una cosa: qué validadores se ejecutan (§4.7 de SDD-34). Es un
parámetro porque el mismo formulario corre en los dos lados; no hay dos APIs.

### 4.6. El núcleo no resuelve rutas, salvo para los errores que vienen de fuera

`f.seo.description` es una cadena de propiedades: el que la escribe es el autor, o el compilador
al emitir un enlace. **No hay `node(form, 'seo.description')` en la API**, y no es un olvido: una
resolución por string en tiempo de ejecución es lo que un compilador existe para no necesitar, y
además obliga a que el nombre viaje en el bundle.

La excepción es `$setErrors`, y está justificada por dónde vienen los datos: un 422 trae
`{ 'seo.canonical': { protocolo: true } }`, indexado por ruta, generado por el otro extremo. Eso
sí hay que resolverlo, y el schema —que está en memoria— basta para hacerlo. Una ruta que no
existe en el schema se **ignora** y no lanza: un servidor que manda un error de un campo que este
formulario no tiene no puede tumbar la página del usuario.

### 4.7. Cómo se escribe este paquete, que es la mitad de la spec

`@fudic/forms` llega al navegador. Le aplica entera la regla de escritura del runtime: **una ruta
solo puede arrastrar lo que de verdad usa**, y una ruta sin formularios no puede arrastrar nada.

Lo que eso obliga aquí, en concreto:

- **Exports nombrados de funciones sueltas.** `required`, `minLength` y los demás son módulos
  propios; quien no importa `pattern` no se lleva el `RegExp` ni su rama.
- **Ningún namespace colgado de una factoría.** Ni `control.u8()`, ni `validator.server()`. Tocar
  `control` arrastraría todos los códecs colgados de él, que es justo lo que la propuesta de
  schema tipado de `docs/forms/SDD-forms-typed-binary.md` §3 no puede hacer tal cual está escrita:
  si el tipado entra algún día, entra **como exports independientes**.
- **Ningún efecto en el ámbito de módulo.** No hay registro global, no hay `configure()` que haga
  `Object.assign` sobre un objeto de módulo. Un `configure` de módulo, además de no poder podarse,
  es estado compartido entre peticiones concurrentes en el servidor, donde este mismo paquete
  corre. `sideEffects: false` en el `package.json`, y de verdad.
- **La serialización no vive en el formulario.** `$positional` **no** es un getter de la API: un
  getter obliga a que el serializador exista en todo bundle que declare un formulario. Cuando
  llegue el transporte, será una función libre —`toPositional(form)`, `fromPositional(form, arr)`—
  que solo carga quien la importa. El recorrido que necesita es público: `$fields()` y `$schema`.
- **Ningún despacho por tabla.** No hay `{ checkbox: …, number: … }` en este paquete, porque no
  hay DOM; y en el de SDD-34 tampoco, porque ahí el elemento lo conoce el compilador.

Esto se mide, no se declara: §6.16.

### 4.8. Qué hace un tipo declarado, exactamente

Una factoría tipada construye un `control()` normal y le añade dos cosas:

- **`type`**, la etiqueta, que es dato inerte para el modelo y contrato para el transporte;
- **un validador de rango, el primero de la lista**, que rechaza lo que no cabe en el ancho
  declarado: fuera de rango, y no entero cuando el tipo lo es. Publica `{ range: '<tag>' }`.

Va **el primero** porque los validadores cortan en el primero que falla (§4.5): un valor que no
cabe en el tipo no tiene sentido pasárselo a `min(1)` ni a una regla de negocio. Y es un validador
normal, no un camino aparte: el error se pinta donde se pintan todos y `$errors()` lo indexa por
su ruta como cualquier otro.

| Factoría | Rango que impone | Vacío |
|---|---|---|
| `u8` `u16` `u32` | entero, `0 … 2ⁿ−1` | `null` |
| `i8` `i16` `i32` | entero, `−2ⁿ⁻¹ … 2ⁿ⁻¹−1` | `null` |
| `f32` | finito y representable en 32 bits | `null` |
| `f64` | finito | `null` |
| `bool` | `true`/`false` | `false` |
| `str` | cadena | `''` |
| `date` | `Date` válida | `null` |
| `arr` | array; cada elemento contra el rango de `of` | `[]` |

Un tipo **no** cambia cómo se lee, cómo se escribe ni cómo se enlaza a un elemento: un
`TypedControl<number>` es un `Control<number>` y `bindNumber` (SDD-34) no distingue.

---

## 5. Invariantes

- **Cero DOM.** Ninguna rama de este paquete nombra `document`, `HTMLElement` ni `window`. La
  suite entera corre en Node sin un solo shim, y ese es el criterio que lo demuestra (§6.15).
- **Un formulario se construye, se rellena, se valida y se lee sin que exista un `<form>`.** El
  enlace con el DOM es una capa **encima**, opcional, y de otro SDD.
- **Se lee llamando.** `title()`, `title.errors()`, `f.$value()`. No hay `.value`, no hay `peek`.
  Una sola forma de leer, la de SDD-31.
- **El schema es el contrato, y su orden es `Object.keys`.** Sin versión, sin metadatos, sin
  negociación. Los dos extremos coinciden porque importan el mismo módulo.
- **Un `group()` es un formulario.** Dos clases de nodo, no tres; la recursión tiene un solo `if`.
- **`undefined` no se guarda.** `null` es el vacío canónico, normalizado al escribir y solo ahí.
- **Escribir de menos no vacía.** `$set` es total y falla si le falta un campo; `$patch` es
  parcial y no toca lo que no menciona. Un nombre fuera del schema es `TypeError` en las dos.
- **Un resultado de validación caducado no se publica nunca.** La época del control manda; el
  orden de llegada de la red no puede pintar un error viejo sobre un valor nuevo.
- **Un control tiene un error, no una lista.** Sus validadores corren en orden y cortan en el
  primero que falla.
- **Los errores de fuera entran por `$setErrors` y una ruta desconocida se ignora.** El servidor
  no puede tumbar la página mandando el nombre de un campo que no existe.
- **El runtime no diagnostica.** Lo que falla aquí es `TypeError`/`RangeError`, nunca un
  `Diagnostic` con código `FUD`.
- **Un tipo declarado es un rango, y su violación es un error de validación.** No trunca, no
  convierte y no lanza: publica `{ range: '<tag>' }` como cualquier otra regla, y va la primera.
- **El tipo es opt-in por control.** Un schema sin tipos se comporta exactamente como hoy, y uno
  mixto es legítimo: lo que un schema mixto no puede es salir en binario, y eso lo decide el
  transporte degradando, no este SDD.
- **Podable por ruta.** Exports nombrados sueltos, `sideEffects: false`, sin namespaces colgados,
  sin estado de módulo, sin tablas de despacho. Quien no usa una pieza no la descarga (§6.16).

---

## 6. Criterios de aceptación

Tests en `packages/forms/test/`. Todos corren en Node, sin entorno de navegador.

**El modelo**

1. **(rojo primero)** `control('')` se lee llamándolo, `set` cambia lo que devuelve, y una lectura
   dentro de un `effect` hace que el efecto se reejecute al escribir. Es la prueba de que el valor
   **es** una signal y no una propiedad.
2. `control()` sin argumento arranca en `null`; `set(undefined)` guarda `null`. `dirty` es `false`
   al nacer, `true` tras escribir un valor distinto, y **sigue en `false`** si se escribe el mismo
   valor inicial (`Object.is`).
3. `touch()` es idempotente y no toca el valor; `reset()` devuelve valor, errores, `touched` y
   `dirty` al estado inicial, y `reset(v)` hace lo mismo con otro valor de partida.
4. `f.seo` —un `group`— expone `$value()`, `$touch()`, `$errors()` y sus campos por nombre igual
   que el formulario raíz: **el mismo test corre contra los dos** parametrizado por la raíz.

**Escritura**

5. **(rojo primero)** `$set` con un campo ausente lanza `TypeError` **nombrando el campo** y deja
   el formulario intacto — ni una escritura parcial. Con un nombre que no está en el schema,
   igual.
6. `$patch({ title })` cambia `title` y **no toca** `body`, `published`, `seo` ni `tags`.
   `$patch({ seo: { canonical } })` no toca `seo.description`.
7. `$value()` devuelve el objeto con claves en orden de declaración, con los grupos anidados como
   objetos, y **rastrea**: leerlo dentro de un efecto reejecuta el efecto cuando cambia cualquier
   campo, incluido uno dentro de un grupo.

**Validación**

8. **(rojo primero)** `$validate()` publica `errors` por nodo y `$errors()` por ruta
   (`'seo.canonical'`), devuelve `false`, y con todo bueno devuelve `true` y deja los dos en
   `null`.
9. Los validadores de un control corren **en orden** y **cortan en el primero que falla**: un
   control con `[required, minLength(3)]` y valor `''` publica `{ required: true }` y `minLength`
   no llega a ejecutarse (contador dentro del validador).
10. `options.summary` produce `$summary()` y hace que `$validate()` devuelva `false` aunque ningún
    campo tenga error. Es el caso `seoRequerido` de `blog.form.js`.
11. **Orden asíncrono.** Con un validador cuya latencia se controla desde el test: escribir `A`,
    lanzar la validación, escribir `B`, lanzar la segunda, y **resolver primero la de `A`**. El
    error publicado es el de `B`, y el de `A` **no se publica nunca**. Sin la época, este test
    falla y es exactamente el defecto que la latencia real produce.
12. **Los validadores de servidor no corren en el cliente.** Un control con
    `serverValidator(fn)` no ejecuta `fn` en `$validate()` y sí en `$validate({ server: true })`,
    donde publica su error. Es la mitad de modelo; borrar el cuerpo de `fn` del bundle es SDD-34.
13. `$setErrors({ 'seo.canonical': {…} })` publica el error **en el control**, lo deja legible en
    `$errors()` y marca `touched` ese control y **solo** ese. Una ruta que no existe en el schema
    se ignora **sin lanzar**. `$setErrors(null)` limpia.
14. `$touch()` marca en cascada, incluidos los controles dentro de grupos; `$reset()` deja todo —
    valores, errores, `touched`, `dirty`, `$summary`— como recién construido.

**Las dos invariantes que son de arquitectura**

15. **Cero DOM, comprobado y no prometido.** Un test recorre `packages/forms/src/**/*.ts` y falla
    si aparece `document`, `window`, `HTMLElement`, `Element` o `navigator`. Y la suite entera
    corre en el entorno `node` de Vitest, sin `happy-dom` ni `jsdom` en el paquete.
16. **Podable, medido sobre el bundle.** Se empaquetan con Rollup tres entradas artificiales y se
    comparan los bytes del chunk resultante: (a) una que importa `form`, `control` y `required`;
    (b) la misma más `pattern` y `min`; (c) una que no importa nada de `@fudic/forms`. La (c) pesa
    **cero**; en la (a) los identificadores `pattern`, `min`, `max` y `maxLength` **no aparecen**
    en el chunk. Es un test, no una inspección manual.
    **Y el caso que decide la forma de §3.1:** una entrada que importa `form`, `control` y
    `required` —sin una sola factoría tipada— produce un chunk donde **no aparece ninguna de las
    doce**: ni `u8`, ni `date`, ni sus rangos. Con `control.u8()` este test es imposible de pasar;
    es la razón entera de que sean exports independientes.

**Controles tipados**

17. **(rojo primero)** `u8(21)` se comporta como cualquier control —se lee llamándolo, `set`
    escribe, `dirty` funciona— y expone `type === 'u8'`. `u8().set(300)` y `u8().set(-1)` publican
    `{ range: 'u8' }` al validar, y `u8().set(1.5)` también (entero). `i8` acepta `-128`, rechaza
    `-129`. `f32` rechaza `Infinity`. `date` rechaza una `Date` inválida.
18. **El rango va el primero y corta.** Un `u8(0, [min(1)])` con valor `300` publica
    `{ range: 'u8' }` y `min` **no llega a ejecutarse** (contador dentro del validador).
    `arr(str, [])` valida cada elemento contra el rango de `str` y expone `type === 'arr'` con
    `of === 'str'`.

**Cobertura.** `@fudic/forms` nace con `thresholds` al **100 %** en las cuatro métricas y
`coverage.include: ['src/**/*.ts']`. Nada de `/* v8 ignore */` para llegar al número.

---

## 7. Fuera de alcance

- **Todo lo que toque el DOM**: la directiva `control`, el punto de entrada `./dom`, la clase base
  de un control-componente, `formAssociated`, el pintado de errores y su accesibilidad. Es
  [SDD-34](./SDD-34-forms-compilador.md) y necesita al compilador.
- **El transporte.** Envío posicional, `$positional`, compresión, las factorías por verbo y el
  middleware `validate`. Queda aparcado hasta que exista `@fudic/http`, con el prototipo medido
  de `docs/forms/` como punto de partida. Cuando llegue, la serialización entra como **funciones
  libres**, no como getters del formulario (§4.7).
- **Normalización profunda de `undefined`.** Se muda al SDD de transporte con su arnés escrito
  (§4.4), porque el problema que resuelve es de `JSON.stringify`, no del modelo.
- **El códec binario.** Las factorías tipadas **sí** están aquí (§3.1); escribir y leer el búfer
  —anchos, bitfield de booleanos, los 48 bits de `date`, contadores de los variables—, la etapa
  que sustituye a `json` y `application/fud+bin` son del SDD de transporte, con los números de
  `docs/forms/SDD-forms-typed-binary.md` §2 ya medidos.
- **Cambiar el tipo de un control como cambio de protocolo.** El documento de schema tipado lo
  deja sin resolver y aquí sigue sin resolverse: es problema del transporte, no del modelo.
- **Estado "validando" por control** (`pending`). Se puede derivar de fuera con un `signal` del
  autor, y meterlo en el modelo obliga a decidir qué pasa con dos validaciones solapadas *antes*
  de tener un caso real que lo pida. Reabrible en cuanto la capa DOM (SDD-34) quiera pintar un
  spinner por campo.
- **`disabled` / `readonly` en el modelo.** Son del elemento. Un control deshabilitado que no se
  valida es una regla de formulario, no de estado, y sin caso de uso no se especifica.
- **Arrays dinámicos de controles** (`FormArray`: añadir y quitar filas). Es la extensión natural
  y no está aquí: exige decidir identidad de fila —lo mismo que `key (…)` resolvió para los
  bucles, decisiones 91–95— y merece su propio documento.
- **`Map`, `Set`, `File` y `Date` como valor de un control.** Un control guarda lo que le den; lo
  que este SDD no promete es que sobrevivan a una serialización, que es asunto del transporte.
- **Que el LSP complete `control`, `group` o los validadores.** SDD-24/28, cuando el paquete
  exista.
