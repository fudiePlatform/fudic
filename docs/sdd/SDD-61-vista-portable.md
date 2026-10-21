# SDD-61 — La vista portable: lo que se puede escribir en el markup

> **Estado:** `Listo` — [tareas](./SDD-61-Task.md) · [anexo: cómo se traduce a cada
> lenguaje](./SDD-61-anexo-traduccion.md).
> **Paquetes:** `@fudic/compiler` (analizadores, `@empty`, emit) · `@fudic/diagnostics` ·
> `@fudic/core` (`now`) · `@fudic/dom` (orden del spread) · `@fudic/ssr` (`now` en `fud-state`, `@empty`) · `@fudic/typecheck` (pase
> tipado) · `@fudic/language-core` (proyección de `@empty`, completado de la vista) ·
> `@fudic/language-server` · `@fudic/formatter` · `fudic-vscode` (gramática) · `examples/*` ·
> fixtures de `packages/*` · `packages/testing` (suite de conformidad).
> **Depende de:** 60 (un único `@code` y su corte de servidor), 51 (lista blanca, analizadores
> y `FUD09xx`), 58 (pipes y `t()`), 35 (typecheck en dev y build), 50 (catálogo).
> **Rango de diagnósticos:** `FUD1140`–`FUD1159` (nuevo). Usa `FUD1140`–`FUD1153`; el resto queda
> reservado sin uso.
> **Decisiones de gramática:** 162–165 (nuevas). Enmienda la 137, la 138 y la 141 (SDD-51).
> **Origen:** IDEA-05 §6, IDEA-06 §10.8 y la sesión del 2026-10-21 con Pedro.
>
> **Qué añade en una frase.** La vista solo admite lo que el compilador puede bajar con la misma
> semántica a TS, C#, Java, Go, Rust y Python. Es una lista blanca cerrada: rellenar huecos, no
> programar. Lo que el servidor evalúa del `@code` para pintar sigue la misma lista.

---

## 1. Contexto y objetivo

SDD-51 recortó la vista a lo que **no se escapa** de la pasada de render. Sigue admitiendo
cualquier llamada, `new`, flechas, los métodos de `Array` y `String` y globales como `Math`,
`JSON`, `Date` o `Intl`. Todo eso existe solo en JS. SDD-60 deja el servidor declarado en un
`.fudapi`, y el paso siguiente (IDEA-05, IDEA-06) es pintar en el backend del equipo: C#, Java,
Go, Rust o Python. Para eso la vista tiene que poder **traducirse**, y hoy no puede.

Esta spec cierra el lenguaje de la vista:

- **El criterio es la bajada, no la existencia nativa.** Una construcción vale si el compilador
  la puede bajar a los seis lenguajes con el mismo resultado. La desestructuración no existe en
  Java y el `for` de C no existe en Python: los dos valen, porque se bajan. `Array.prototype.filter`
  no vale: habría que portar la stdlib de JS.
- **Lo que no existe igual en todos es del catálogo de fudic**, escrito una vez por runtime: los
  pipes, `now()`, el número como texto, la guarda de URL. El desarrollador nunca escribe nada dos
  veces.
- **Vale para Node también.** Una vista que compila con un backend compila con todos.

El [anexo](./SDD-61-anexo-traduccion.md) es normativo: fija cómo se baja cada fila de la lista a
cada lenguaje. El de TS es el emit de hoy con los cambios de §4.4. La suite de conformidad (§4.6)
fija el HTML esperado de cada fila, y cada runtime futuro tiene que dar los mismos bytes.

### 1.1. Lo decidido (no se reabre)

1. **Lista blanca, nunca negra.** Lo que no está en §3 es error.
2. **La única llamada de la vista es leer un valor reactivo:** una señal, un `computed` o un
   `Readable` de forms, sin argumentos. Además, `t()` como valor de una prop (decisión 161).
3. **Nada de `new` ni de métodos de ningún prototipo**, tampoco `new Date`. Ningún global salvo
   `undefined`.
4. **Sin `.length`.** Los tres bucles llevan `@empty`.
5. **`@while`, `@for` y `let` siguen vivos.** `@{ }` declara y reasigna, nada más.
6. **Desestructuración y `...resto`**, que se bajan donde el lenguaje no los tiene.
7. **Spread de atributos** para pasar datos a un componente o a un elemento nativo.
8. **`signal` y `computed` se evalúan en el servidor y `effect` no hace nada allí.** El cuerpo de
   un `computed` y el inicializador de una señal que la vista lee siguen la misma lista.
9. **`now()` es del catálogo** (`@fudic/core`) y solo vale como inicializador de una señal.
10. **Los manejadores de evento son TS completo:** imports, código del desarrollador, cualquier
    global de navegador. Nunca corren en el servidor y no se traducen.
11. **Las condiciones son booleanas.** Sin «truthiness»: `@if (nombre)` no vale.

## 2. Dependencias

| SDD | Qué aporta |
|---|---|
| 60 | Un único `@code` de navegador y el **corte de servidor** (SDD-60 §4.8): lo que el markup lee, transitivamente. `data` y los forms enlazados desde el `.fudapi`. |
| 51 | Los analizadores `view-expressions`, `view-statements` y `view-identifiers`, el recorrido con el scope del template, `mapSpan`, la regla de escrituras de §3.5 y `FUD0900`–`FUD0919`. |
| 58 | El pipe `a \| preset` (decisión 158), el catálogo cerrado de presets, `$pipe` en la proyección, `t()` (decisión 161, `FUD1020`) y `"locales"`. |
| 35 | El typecheck de dev (overlay) y de build (el build falla), y el canal único de diagnósticos editor/build. |
| 50 | Un código nuevo es un `.ts` + un `.md` de cinco líneas + una línea de `index.ts`. |

## 3. Interfaz pública: la lista blanca

### 3.1. Dónde aplica

| Aplica: «la vista» | No aplica |
|---|---|
| `@( … )` e implícita `@a.b` en contenido, y `@raw( … )` | El valor de un `@evento` y de un `bus:` |
| Todo valor de atributo, `.prop`, `class:`, `style:`, `ref`, `control`, `error=`, `summary=` | Un **callback**: un `.prop` cuyo valor entero es una flecha o el nombre de una función del `@code` (props-spec) |
| Cabeceras de `@if`, `@switch`, `case`, `@foreach`, `@for`, `@while`, `key ( … )` | El resto del `@code`, que no está en el corte |
| Argumentos de `@render`, `@RenderSection`, `@RenderBody` | El cuerpo de `<script>` (decisión 43) |
| `@{ … }` | |
| **El corte de servidor del `@code`** (§3.9) | |

### 3.2. Valores y nombres

| Vale | Ejemplo |
|---|---|
| Literal de texto, sin sustitutos sueltos (`"\uD800"` no) | `'activo'`, `"x"` |
| Literal numérico, en cualquier notación de JS salvo `bigint` | `0`, `3.5`, `1e3`, `0x10`, `1_000` |
| `true`, `false`, `null` | |
| `undefined` (el único global) | `x === undefined` |
| Un nombre de la vista (SDD-51 §3.4 puntos 1–3): template, `@code`, `data` | `post`, `data.posts`, `userForm` |

- **Presencia.** `null` y `undefined` significan lo mismo: **ausente**. Comparar con cualquiera
  de los dos es preguntar por presencia (§4.4).
- **Números.** Toda aritmética es `f64` en todos los lenguajes, como en JS. Los anchos del
  `.fudapi` (`i32`, `u8`…) son tipos de transporte, no de cálculo.
- **Globales.** La lista de SDD-51 §3.4.4 queda en `undefined`. `NaN`, `Infinity`, `Math`, `JSON`,
  `Date`, `Intl`, `Number`, `String`, `Boolean`, `Object`, `Array`, `Map`, `Set`, `Symbol`,
  `BigInt`, `RegExp`, `parseInt`, `parseFloat`, `isNaN`, `isFinite` y las cuatro de URI salen
  (`FUD0907`).

### 3.3. Llamadas (decisión 162)

| Vale | Condición |
|---|---|
| `x()`, `a.b.c()` | **Sin argumentos**, sobre un nombre o un camino de miembros, y el tipo del llamado es un valor reactivo: `Signal<T>` o `Computed<T>` de `@fudic/core`, `Readable<T>` de `@fudic/core` o de `@fudic/forms`, o un control de un form (`$ControlNode`). Incluye `form.$valid()`, `form.$issues()`, `campo.errors()`, `campo()` |
| `t("literal", { … })` | Solo como valor de una prop (decisión 161, `FUD1020`). El objeto de argumentos sigue §3.2–§3.5 en cada valor |

Todo lo demás es `FUD1140`:

- llamadas con argumentos, `?.()` y las de un llamado que no es un camino (`(a || b)()`);
- funciones del `@code`, importadas o de props;
- métodos de cualquier prototipo: `filter`, `map`, `join`, `includes`, `toFixed`,
  `toUpperCase`, `slice`, `toLocaleString`…

Los argumentos se comprueban sin tipos en el compilador. El tipo reactivo lo comprueba el pase
tipado (§4.2).

### 3.4. Operadores

| Vale | Operandos (pase tipado, §4.2) | Al bajar |
|---|---|---|
| `a + b` | dos `number` (suma), o `string` con `string`/`number` (concatena) | El número pasa a texto con la semántica de JS (anexo A.4) |
| `a - b`, `a * b`, `a / b`, `a % b`, `-a` | `number` | `f64`; `/` es división real; `%` lleva el signo del dividendo |
| `a === b`, `a !== b` | dos primitivos del mismo tipo (`string`, `number`, `boolean`, unión de literales), o uno es `null`/`undefined` | Igualdad de valor, o presencia |
| `a < b`, `<=`, `>`, `>=` | `number` | |
| `a && b`, `a \|\| b`, `!a` | `boolean` | Resultado `boolean` |
| `a ?? b` | `a` puede faltar | |
| `c ? a : b` | `c` es `boolean` | |
| `a \| preset` | el pipe de SDD-58, sin cambios | `format` del runtime |
| `( … )` | | |

**Sin «truthiness».** `@if (nombre)`, `@if (xs)` y `a || 'x'` no valen (`FUD1151`). Se escriben
`nombre !== null`, `@empty` y `a ?? 'x'`.

**Fuera** (`FUD1142`): `==`, `!=`, `typeof`, `instanceof`, `in`, `void`, `+a`, `~a`, `&`, `^`,
`<<`, `>>`, `>>>` y `**`. Siguen fuera los de SDD-51: asignaciones, `++`, `--`, `delete`
(`FUD0900`), coma (`FUD0906`) y `await`/`yield` (`FUD0902`).

### 3.5. Acceso y texto

| Vale | Condición |
|---|---|
| `a.b`, `a?.b` | Campo de un objeto: DTO del `.fudapi`, props, `data`, form. Sin miembros `constructor`, `__proto__` ni `prototype` (`FUD0910`) |
| `xs[i]`, `xs?.[i]` | `xs` es una lista e `i` un `number`; fuera de rango da «ausente» |
| `m[k]`, `m?.[k]` | `m` es un `map` (`Record`) y `k` su clave; una clave que no está da «ausente» |
| Plantilla `` `a ${x} b` `` | Sin etiqueta (`FUD0905`). Cada hueco, `string` o `number` |
| Interpolar `@(x)` | `x` es `string`, `number`, `boolean` o ausente (`$Scalar` sin `bigint`). Una fecha solo se pinta con pipe |

- **`.length` no existe en la vista** (`FUD1145`), ni sobre listas ni sobre texto, ni con
  `['length']`. Para «no hay ninguno» está `@empty`. Un recuento se pinta desde el `load` o desde
  una señal que lo lleve. Un campo de un DTO llamado `length` no se puede leer desde la vista.
- Un índice con texto sobre un objeto que no es un `map` (`post['title']`) es `FUD1153`.

### 3.6. Desestructuración y resto

```
@foreach (const { slug, title, author: { name: autor }, featured = false } of data.posts) key (slug) { … }
@{ const { titulo, ...resto } = articulo; }
```

- **Patrones de objeto**, anidados, con renombre y con valor por defecto. El defecto sigue §3.2–§3.5
  y se aplica cuando el campo **falta** (`null` o `undefined`), en todos los lenguajes (§4.4).
- **Sin patrones de array ni claves calculadas** (`{ [k]: v }`) (`FUD1146`): el contrato no tiene
  tuplas y la clave tiene que conocerse al compilar.
- **Solo sobre un objeto con tipo con nombre** (DTO del `.fudapi`, props). Desestructurar o
  esparcir un `map` es `FUD1153`: sus claves son de runtime y su orden no es portable.
- **`...resto`** vale en un patrón de objeto y solo se usa de tres formas:
  - `resto.campo`, que se baja a `articulo.campo`;
  - `<app-x ...resto>` o `<input ...resto>`, que se baja a una asignación por cada campo del tipo de
    `articulo` que el patrón no ha nombrado;
  - desestructurarlo otra vez (`const { b, ...r2 } = resto`).

  Cualquier otro uso (`.datos=@resto`, `@(resto)`, `resto === x`) es `FUD1147`. El anexo (A.3)
  compara esta propuesta con las otras dos y la baja caso a caso a los seis lenguajes.
- Valen en la cabecera de `@foreach` y en `const`/`let` de `@{ }`. También en `props<T>()` del
  `@code`, como hoy (props-spec, 156).

### 3.7. Control

| Constructo | Regla |
|---|---|
| `@if (c) { } else if (c) { } else { }` | `c` booleano |
| `@switch (x) { case L: … }` | `x` es `string`, `number` o unión de literales; cada `case` es un **literal** (`FUD1148`) |
| `@foreach (const x of xs) key (k) { } @empty { }` | `xs` es una lista (`FUD1153` si no); `k` es `string` o `number` |
| `@for (let i = 0; c; paso) { } @empty { }` | Inicialización: `let` con valores de la lista. `c` booleano. `paso`: `i++`, `i--`, `i += e`, `i -= e`, `i = e`, solo sobre las variables que declara la cabecera (SDD-51 §3.2) |
| `@while (c) { } @empty { }` | `c` booleano. Sigue `FUD0913`: el cuerpo escribe lo que la condición lee |
| `@{ … }` | Solo `const` y `let`, con desestructuración, y reasignar una **variable** (`x = e`, `x += e`, `x++`) según SDD-51 §3.5. Sin `if`, `switch`, bucles, bloques ni sentencias de expresión que no sean asignación (`FUD0908`) |

**`@empty` (decisión 163).** Va justo después del cuerpo de cualquiera de los tres bucles:

```
@foreach (const post of data.posts) key (post.slug) {
  <app-card .title=@post.title .href=@(`/blog/${post.slug}`)></app-card>
} @empty {
  <p class="empty">Todavía no hay artículos.</p>
}
```

- Se pinta **cuando el bucle no da ninguna vuelta**, y entonces solo él.
- En el cliente, el paso de cero vueltas a alguna, o al revés, quita uno y monta el otro en el
  mismo sitio, como las ramas de un `@if`.
- Su cuerpo es markup normal, con el scope del bloque que contiene al bucle: no ve la variable
  del bucle.
- Un `@empty` que no sigue a un bucle, o un segundo `@empty`, es `FUD1149`.

### 3.8. Spread de atributos

`<app-card ...post>` (SDD-54) y `<input ...resto>` (SDD-55) siguen valiendo, con las reglas de
props-spec 146–149 y 157. El operando es un nombre o un camino de miembros cuyo tipo es un objeto
portable con nombre (§3.10). Fuera de un atributo no hay spread: los literales de array y de objeto
no existen en la vista (`FUD1143`) y las llamadas con argumentos tampoco.

**Orden de los atributos de un spread sobre un nativo (decisión 162):**

- alfabético por nombre (orden de unidades UTF-16);
- en el sitio del primer spread del elemento;
- los atributos explícitos, en su sitio.

Así el HTML sale igual en un lenguaje que conoce los campos por su tipo y en TS, que los conoce
en runtime.

### 3.9. Lo que el servidor evalúa del `@code` (decisión 164)

El corte de servidor de SDD-60 §4.8 son las declaraciones que la vista lee, transitivamente. Cada
una tiene que tener una de estas formas:

| Forma | Condición |
|---|---|
| `const { a, b = d, ...r } = props<T>()` | Como hoy. `T` es portable (§3.10); los defectos siguen §3.2–§3.5 |
| `const x = signal(v)` · `signal<T>(v)` | `v` sigue §3.2–§3.5, o es un literal de datos (abajo), o es `now()` |
| `const x = computed(() => e)` | Flecha con **cuerpo de expresión**. `e` sigue §3.2–§3.5 y puede leer otras señales |
| `const x = e` · `let x = e` | `e` sigue §3.2–§3.5, o es un literal de datos, o una llamada del catálogo |
| `import … from '…'` | Del proyecto (store o módulo de datos, abajo), un `fudic:<id>`, o un nombre del catálogo de un paquete `@fudic/*` |

- **Llamadas del catálogo** (lista cerrada, con argumentos que siguen §3.2–§3.5 o son literales
  de datos): `props`, `signal`, `computed`, `inject(Token)`, `trustedUrl`, `trustedHtml`, los
  presets de pipe de `@fudic/i18n` (`date`, `number`, `currency`, `percent`, `relativeTime`,
  `list`, con su objeto de opciones literal) y `t()` (decisión 161). `now()` solo como argumento
  entero de `signal(…)`.
- **Literal de datos:** objeto o array literal cuyas hojas son literales de §3.2 y cuyo tipo es
  portable con nombre. Una lista de primitivos (`["a", "b"]`, `[1, 2]`) no necesita nombre. Un
  objeto sí: su tipo contextual (`const lista: Nodo = { … }`, `signal<readonly Paso[]>([…])`,
  `satisfies Record<string, $Props>`) es un `type` del `.fudapi` o las props de un componente
  (`$Props`). Sin nombre, `FUD1153`.
- **Store.** Un nombre importado de un módulo del proyecto (ruta relativa, o absoluta dentro del
  proyecto) que la vista lee tiene que ser, en ese módulo, `export const x = signal(…)`,
  `computed(…)` o `const` con las mismas formas. Se sigue la cadena de `export … from` dentro del
  proyecto. En un store, `now()` no vale (`FUD0912`): el módulo se evalúa una vez por proceso en el
  servidor.
- **Módulo de datos.** Un `export default` que es un literal de datos (como `*.fixture.ts`,
  SDD-53) es portable: el servidor lo carga como datos.
- Lo que la vista lee y no tiene ninguna de estas formas es `FUD1150`: una función usada como
  valor (fuera de un callback), una clase, `let x;` sin inicializador, una declaración con
  `filter` o `toLocaleTimeString`, un nombre importado de un paquete que no es del catálogo. El
  diagnóstico va sobre la declaración, con `related` al primer uso en la vista.
- Dentro de un inicializador del corte, cada nodo fuera de la lista da su propio código (`FUD1140`,
  `FUD1141`…), igual que en el markup.
- **`effect`, las funciones y todo lo que la vista no lee** quedan fuera del corte, sin
  restricción: es código de navegador. `provide(…)` de nivel superior sigue en el corte como dice
  SDD-60; su factoría no se evalúa al pintar en un backend que no es Node (anexo A.2).

### 3.10. Tipos portables

Lo que la vista y el corte leen tiene tipos que existen en todos los lenguajes:

- `string`, `number`, `boolean`, `Date`;
- uniones de literales de texto (son un `enum`);
- `T | null`, `T | undefined` y el campo opcional `x?: T` (presencia);
- `readonly T[]` y `T[]` de un tipo portable;
- `Readonly<Record<string | number, V>>` (un `map`);
- un `type` o `enum` del `.fudapi` (`fudic:<id>`), las props de un componente (`$Props`);
- lo del catálogo: `Signal<T>`, `Computed<T>` y `Readable<T>` de un `T` portable, `TrustedURL`,
  `string | TrustedURL` (un valor de URL), `TrustedHTML`, `Pipe<T>`, los forms, sus controles e
  `Issue`, `LoadData`;
- una función, **solo** como tipo de una prop callback.

Lo comprueba el pase tipado (`FUD1153`) sobre:

- las props de cada componente y los parámetros de cada snippet;
- el tipo de cada señal, `computed` y `const` del corte;
- el iterable de `@foreach`, el destino de un índice, una `key` y el sujeto de `@switch`.

Sobre una prop o un parámetro sale una vez por miembro, sobre el miembro.

Quedan fuera: objetos literales anónimos anidados (`props<{ user: { name: string } }>`), tuplas,
genéricos propios, intersecciones, `Map`, `Set`, `bigint`, `symbol`, clases, `any` y `unknown`.

### 3.11. Manejadores y callbacks

- El valor de un `@evento`, de un `bus:` y de un callback (§3.1) es **TS completo**: llamadas,
  flechas, `new`, la stdlib, imports y cualquier global de navegador.
- No pasa por la lista blanca ni por `FUD0907`. Solo conserva la regla de SDD-51 §3.8: no lee lo
  que declara un `@{ }`, que vive en la pasada y no donde corre el manejador.
- Lo que no resuelve lo dice TypeScript (TS2304).

### 3.12. `now()` (decisión 165)

```ts
// @fudic/core
/** The current instant. Part of fudic's portable catalog: each runtime implements it once. */
export function now(): Date;
```

- **Solo como argumento entero de `signal(…)` en el `@code`** (`signal(now())`). Fuera de ahí, en
  la vista, en un `computed`, en un `const` del corte o en un store, es `FUD0912`. En un manejador
  es una función más.
- El servidor lo evalúa una vez por render. **El valor viaja en el slot de la señal en `fud-state`**
  y el cliente que hidrata lo toma de ahí, sin llamar a `now()`. Un cliente que crea la instancia
  desde cero lo llama.

### 3.13. Lo que no vale, por código

| Construcción | Código |
|---|---|
| Llamada que no es leer un valor reactivo (§3.3) | `FUD1140` |
| `new` | `FUD1141` |
| Operador fuera de §3.4 | `FUD1142` |
| Literal de objeto o de array en la vista (salvo el objeto de huecos de `t()`), `bigint`, texto con un sustituto suelto | `FUD1143` |
| `as`, `satisfies`, `!` no nulo, `<T>x`, argumentos de tipo | `FUD1144` |
| `.length` | `FUD1145` |
| Patrón de array o con clave calculada | `FUD1146` |
| `...resto` usado entero | `FUD1147` |
| `case` que no es un literal | `FUD1148` |
| `@empty` mal colocado o repetido | `FUD1149` |
| Declaración del corte que el servidor no puede evaluar | `FUD1150` |
| Condición u operando lógico que no es `boolean` | `FUD1151` |
| Operador sobre un tipo que no le corresponde (§3.4) | `FUD1152` |
| Tipo no portable (§3.10), índice con texto sobre un objeto, objeto literal sin tipo con nombre, desestructurar o esparcir un `map` | `FUD1153` |
| Flecha o función en la vista (también con cuerpo de expresión), plantilla etiquetada | `FUD0905` (ampliado) |
| Global fuera de `undefined` | `FUD0907` (ampliado) |
| `if`, `switch`, bucle, bloque o llamada como sentencia en `@{ }` | `FUD0908` (ampliado) |
| `now()` fuera del inicializador de una señal del `@code` | `FUD0912` (reescrito) |
| Literal regex | `FUD0919` (reducido) |

## 4. Comportamiento

### 4.1. El compilador: análisis sin tipos

Los analizadores de SDD-51 se amplían. Siguen siendo una entrada de `ANALYZERS` cada uno, con la
misma regla de spans (§4.2 de SDD-51: el nodo culpable) y la de «uno por nodo, todos los nodos»
(§4.3 de SDD-51).

| Analizador | Cambia |
|---|---|
| `view-expressions` | Lista blanca de §3.2–§3.5: `FUD1140` (sintáctico), `FUD1141`–`FUD1146`, `FUD0905` para toda flecha, `FUD0919` solo el literal. Deja de emitir `FUD0911`, y la parte de `FUD0910`/`FUD0912`/`FUD0913`/`FUD0917` que ya cubren las llamadas y los globales |
| `view-statements` | `@{ }` de §3.7 (`FUD0908`); `@for` y `@while` siguen con `FUD0900`/`FUD0901`/`FUD0913` |
| `view-identifiers` | Globales: solo `undefined`. Los manejadores dejan de comprobar globales (§3.11) |
| `view-rest` (nuevo) | Usos de `...resto` (`FUD1147`) |
| `view-control` (nuevo) | `case` literal (`FUD1148`) |
| `server-cut` (nuevo) | §3.9 sobre el corte de SDD-60: forma de cada declaración (`FUD1150`), la lista blanca sobre cada inicializador (mismos códigos que el markup), `now()` (`FUD0912`), stores y módulos de datos |

- **Stores y módulos de datos.** El analizador `server-cut` pide al host el fuente de un módulo
  del proyecto con `readModule(specifier, importer)`, un campo nuevo y opcional de `SemanticInput`.
  Lo parsea con Oxc una vez por módulo y versión (la caché es del host) y aplica §3.9 a la
  declaración exportada. Sin `readModule` (un host que no lo da), los imports del proyecto no se
  comprueban. El plugin de Vite, `@fudic/typecheck` y el language server lo dan.
- **`@empty`** lo reconoce la estructura del documento: un nodo `EmptyBlock` hijo del nodo del
  bucle, con su `Span`. `FUD1149` sale ahí.

### 4.2. El pase tipado (`@fudic/typecheck`)

Lo que depende de tipos lo comprueba un pase nuevo, `portableTypeDiagnostics(program, document)`.
Usa el checker sobre la proyección, como `propShapes` (SDD-53), y devuelve `SourceDiagnostic`
sobre el `.fud` con las mappings de la proyección.

| Comprueba | Código |
|---|---|
| Llamada sin argumentos cuyo tipo no es reactivo (§3.3), por el nombre del símbolo o del alias que imprime el checker (`Signal`, `Computed`, `Readable`, `$ControlNode`) | `FUD1140` |
| Condición de `@if`, `@while`, `@for`, del ternario, y operandos de `&&`, `\|\|`, `!` no `boolean` | `FUD1151` |
| Operandos de §3.4: aritmética no `number`; `+` con `boolean`, ausente u objeto; relacionales no `number`; `===` entre no primitivos; hueco de plantilla no `string`/`number` | `FUD1152` |
| Tipos de §3.10; iterable de `@foreach`; destino de índice; `key`; sujeto de `@switch`; objeto literal sin tipo con nombre | `FUD1153` |

- **Un solo pase, dos llamadores.** Lo llaman el project checker de dev y de build (SDD-35: en
  dev, terminal y overlay; en build, el build falla) y el language server. El editor lo publica
  por el mismo canal que los demás `FUD`.
- **Una voz por hecho.** El pase no repite lo que dice el compilador ni lo que ya dice TS (un
  `$text` de un objeto sigue siendo error de TS).
- Los nombres de los símbolos se leen como los imprime el checker, como hace `propShapes`, porque
  el programa puede venir de otra copia de TypeScript.

### 4.3. Proyección y editor

- **`@empty`** se proyecta como un bloque después del bucle: `if ($empty()) { … }`, con
  `declare function $empty(): boolean` en `GLOBALS_DTS`. Su cuerpo tipa con el scope de fuera.
- **Completado en la vista.** En una posición de §3.1, el completado de TS se filtra:
  - fuera los métodos y funciones, salvo los valores reactivos (§3.3);
  - fuera los globales salvo `undefined`, y `length`;
  - en un manejador o un callback, sin filtro.
- **Snippets y palabra clave.** Tras la `}` de un bucle, el completado ofrece `@empty`.
- **Gramática.** La TextMate de `.fud` reconoce `@empty` como palabra clave de control.
- **Formateador.** `} @empty {` en la misma línea que la `}` del bucle, como `} else {`.

### 4.4. El emit de TS

Cinco cambios, para que Node y los demás lenguajes pinten lo mismo:

1. **Presencia.** En la vista y en el corte, `x === null`, `x === undefined`, `x !== null` y
   `x !== undefined` se emiten como `x == null` / `x != null`.
2. **Defectos.** El defecto de un patrón de la vista se emite como `?? defecto`: se aplica también
   con `null`.
3. **`@empty`.**
   - En el servidor: el bucle cuenta vueltas y, si no da ninguna, pinta el bloque.
   - En el cliente: el bloque es una rama más del constructo, con su propia marca de hidratación,
     como una rama de `@if`. Al actualizar, la reconciliación del bucle con cero elementos monta
     `@empty`, y con alguno lo desmonta. Lo mismo en `@for` y `@while`, que se reevalúan enteros.
4. **`now()` en `fud-state`.** Una señal inicializada con `now()` lleva siempre su valor en el slot
   de la instancia, aunque nada más la obligue. Al hidratar, el `@code` del cliente toma el valor
   del slot (`$pN ?? signal(now())`).
5. **Orden del spread.** `attrsOf` y `attrsDiff` de `@fudic/dom` devuelven los atributos ordenados
   por nombre (§3.8), y el emit llama a `setAttrs` una vez por elemento, en el sitio del primer
   spread, con todos sus objetos.

El nivel de hidratación no cambia por esta spec: `@empty` se comporta como un `@if`.

### 4.5. El anexo

[SDD-61-anexo-traduccion.md](./SDD-61-anexo-traduccion.md) fija, para cada fila de §3, su bajada a
TS, C#, Java, Go, Rust y Python, y las funciones del runtime de fudic que cada lenguaje
implementa una vez. Es la referencia de cualquier emisor futuro y de la suite de conformidad.

### 4.6. La suite de conformidad

`packages/testing/test/conformance/` lleva un `.fud` por fila de la lista blanca, de §3.2 a §3.12,
y su HTML de servidor esperado (`.html`), con datos fijos en sus props.

- Un test los monta con `mount` (SDD-57) y compara el HTML byte a byte. Las filas de pipes
  comparan todo salvo el texto que formatea el pipe (anexo A.4).
- Incluye los seis casos de desestructuración y resto del anexo (A.3.4, D1–D6) y sus dos
  ejemplos guía (A.6 y A.7), con los datos que allí se dan.
- Incluye los casos frontera del anexo A.4:
  - número como texto: `0.1 + 0.2`, `1e21`, `-0`, `1/0`, `0/0`, `123456789012345680000`;
  - `%` con negativos;
  - índice fuera de rango;
  - defecto con `null`;
  - `@empty` en los tres bucles;
  - sombreado de nombres en bloques anidados.
- Es la semilla que cada runtime de otro lenguaje tendrá que pasar.

### 4.7. Migración

Todo el repositorio compila sin diagnósticos nuevos. Lo que hoy usa algo de lo que sale:

| Fichero | Cambio |
|---|---|
| `examples/basic/src/routes/vista.fud` | Reescrito como **catálogo positivo** de la lista nueva: un caso por fila de §3, cada uno con su comentario «sin diagnóstico». Fuera `safeUrl(…)` (la guarda ya es automática), `filter`, `some`, `Math`, `JSON`, `Object`, `Number`, `Intl`, `as`, `!` y los `@{ }` con bucles o `switch` |
| `examples/vista-errores/vista-errores.fud` | Gana un caso por código nuevo y por ampliación, con su comentario «FUDnnnn sobre `texto`», y da exactamente eso |
| `examples/basic/src/components/app-clock.fud`, `routes/ruta-reloj.fud` | Pipes `date` con `timeZone: "Europe/Madrid"` en lugar de `toLocale*`; `signal(now())`; el `effect` no cambia |
| `examples/basic/fudic.json` | `"locales": ["es"]`: un idioma, sin prefijo ni catálogos (SDD-58 §4.5), para los pipes |
| `examples/basic/src/components/shopping-cart.fud` | `total().toFixed(2)` → `total() \| euros` (`currency('EUR')`) |
| `examples/basic/src/components/signal-control.fud`, `routes/ruta-reactiva.fud` | El `computed` con `Array.from` sale: las filas se pintan con `@for` |
| `examples/basic/src/components/signal-while.fud` | La lista enlazada se tipa con un `type Nodo` en un `signal-while.fudapi` enlazado |
| `examples/basic/src/routes/snippets.fud` | `pasos` se tipa con un `type Paso` en el `.fudapi` de la ruta |
| `examples/basic/src/components/vista-url.fud` | `String(url())` → una señal de texto que los manejadores escriben a la vez que `url` |
| `examples/basic/src/components/campo-texto.fud` | `@(String(resto.x))` → `@resto.x` |
| `examples/basic/src/components/di-badge.fud`, `di-panel.fud` | `cart.lines.length` → un `Readable<number>` `count` del servicio |
| `examples/basic/src/routes/blog/index.fud`, `components/app-calendar.fud` y los demás `.length` | `@empty` |
| `examples/i18n/src/components/app-greeting.fud` | `alta = Date.UTC(…)` → una prop `alta: Date` que la ruta recibe de su `load` |
| `packages/formatter/fixtures/own/snippets.fud` | `tag.toUpperCase()` → `tag`, con su salida esperada |
| `packages/compiler/fixtures/app-list.fud` | `rows === undefined \|\| rows.length === 0` → `@empty` |
| Fixtures de `packages/testing`, `packages/language-core`, `packages/language-server`, `packages/workbench` | Lo mismo donde aparezca. Lo que genera el banco (`expected/*.fud`) ya cumple: importa un módulo de datos |

## 5. Invariantes

- **Lista blanca, nunca negra**, en el compilador y en el pase tipado.
- **Ni el compilador ni el pase tipado lanzan.** Un nodo inesperado es un nodo no listado.
- **Una voz por hecho:** cada regla la dice un único productor.
- **Lo que el editor marca, el build lo falla** (SDD-35), con el mismo span.
- **Ningún código escrito a mano:** cada error llama a la función de su código.
- **Spans en todo:** el nodo culpable, mapeado al `.fud` (o al módulo del store, con `related` a
  la vista).
- **Cobertura:** los analizadores nuevos, `portableTypeDiagnostics` y `now` al 100 % en las cuatro
  métricas. Ningún umbral baja.

### Catálogo de diagnósticos

Todos son `error`. Cada `.md` sigue SDD-50 §4.4 y cita `SDD-61`.

| Código | Título (`.md`) | Quién | Span |
|---|---|---|---|
| `FUD1140` | A call in the view | compilador (con argumentos, `?.()`, llamado que no es camino) · typecheck (sin argumentos, tipo no reactivo) | el llamado |
| `FUD1141` | `new` in the view | compilador | `new` y su llamado |
| `FUD1142` | An operator that does not port | compilador | el operador |
| `FUD1143` | A literal the view cannot hold | compilador | el literal |
| `FUD1144` | TypeScript syntax in the view | compilador | el `as`/`satisfies`/`!`/argumento de tipo |
| `FUD1145` | `.length` in the view | compilador | `length` |
| `FUD1146` | An array or computed-key pattern in the view | compilador | el patrón |
| `FUD1147` | A rest binding used as a value | compilador | el uso |
| `FUD1148` | A `case` that is not a literal | compilador | la expresión del `case` |
| `FUD1149` | A misplaced `@empty` | compilador | `@empty` |
| `FUD1150` | A declaration the server cannot evaluate | compilador | la declaración, `related` al uso |
| `FUD1151` | A condition that is not a boolean | typecheck | la expresión |
| `FUD1152` | An operator on a type it does not port for | typecheck | el operando |
| `FUD1153` | A type that does not port | typecheck | el tipo, el miembro o la expresión |

**Fix** de cada `.md`, en una línea:

- `1140`: «compute it in `load()`, a `computed` or a pipe; the view only reads values».
- `1141`: «build the value in `load()`; dates come from `now()` or the data».
- `1142`: «use `===`, `!==`, `<`…; test presence with `=== null`».
- `1143`: «declare the data in `@code` with a `.fudapi` type, or receive it from `load()`».
- `1144`: «type the value where it is declared».
- `1145`: «use `@empty`, or carry the count in the data».
- `1146`: «destructure an object by its field names».
- `1147`: «read `rest.field` or spread it on a tag».
- `1148`: «write the value as a literal».
- `1149`: «put `@empty { }` right after the body of a loop».
- `1150`: «use `signal`, `computed` or a `const` the view can read».
- `1151`: «compare explicitly: `x !== null`, `n > 0`».
- `1152`: «convert the value in `load()`».
- `1153`: «declare the type in the `.fudapi`».

**Reescritos** (mismo código, texto nuevo):

- `FUD0905`: toda flecha y toda función, también con cuerpo de expresión.
- `FUD0907`: la lista de globales es `undefined`; el «Fix» deja de citar `@client`.
- `FUD0908`: `@{ }` solo declara y reasigna.
- `FUD0910`: solo los miembros `constructor`, `__proto__` y `prototype`.
- `FUD0912`: `now()` fuera del inicializador de una señal del `@code`.
- `FUD0913`: solo `@while` y `@for`.
- `FUD0917`: solo `.stack`.
- `FUD0919`: solo el literal regex.

**Retirado:** `FUD0911`. Su `.ts` se borra y su `.md` queda como `retired`, con `FUD1140` como
sustituto.

## 6. Criterios de aceptación

**La lista blanca**

1. **El catálogo positivo.** `examples/basic/src/routes/vista.fud` tiene un caso por fila de §3.2–§3.12
   y compila sin un solo diagnóstico, en el pase semántico, en el pase tipado y en el editor.
2. **Llamadas.** `@(xs.filter(x => x))`, `@(total().toFixed(2))`, `@(formatea(1))`,
   `@(String(n))`, `@(f?.())` y `@(t("x"))` en texto dan `FUD1140` sobre el llamado. `@count()`,
   `@(form.$valid())`, `@campo.errors()` y `.label=@(t("Hola"))` no dan nada. Un `@hora()` con
   `function hora()` del `@code` da `FUD1140` del pase tipado.
3. **`new` y globales.** `@(new Date())` da `FUD1141`. `@(Math.max(a, b))`, `@(JSON.stringify(v))`
   y `@(NaN)` dan `FUD0907` sobre el nombre.
4. **Operadores.** `@(a == b)`, `@(typeof a)`, `@(a in b)`, `@(a ** 2)`, `@(a & b)` y `@(+a)` dan
   `FUD1142` sobre el operador. `@(a % b)`, `@(-a)` y `@(a ?? "—")` no.
5. **Literales y TS.** `@([1, 2])`, `.x=@({ a: 1 })` y `@(10n)` dan `FUD1143`; `@(x as string)` y
   `@(x!)` dan `FUD1144`.
6. **Sin «truthiness».** `@if (nombre)`, `@(ok && "sí")`, `@(!n)` y `@while (cur)` dan `FUD1151`;
   `@if (nombre !== null)` no.
7. **Tipos de operando.** `@(n < "a")`, `` @(`${flag}`) `` con `flag: boolean`, `@(post === otro)`
   con dos objetos y `@(n + null)` dan `FUD1152` sobre el operando.
8. **`.length`.** `@(xs.length)`, `@(s.length)` y `@(xs["length"])` dan `FUD1145`.
9. **Índices.** `@(xs[0])` sobre una lista y `@(m[k])` sobre un `map` compilan; `@(post["title"])`
   sobre un DTO da `FUD1153`. En el servidor, `xs[9]` fuera de rango pinta vacío.

**Desestructuración, resto y spread**

10. `@foreach (const { slug, author: { name: autor }, featured = false } of data.posts)` compila y
    pinta el defecto también cuando `featured` es `null`.
11. `@foreach (const [a, b] of pares)` y `@{ const { [k]: v } = x; }` dan `FUD1146`;
    `@{ const { a, ...r } = mapa; }` y `<input ...mapa>` sobre un `map` dan `FUD1153`.
12. `@{ const { titulo, ...resto } = articulo; }` con `@resto.autor`, `<app-ficha ...resto>` y
    `@{ const { autor, ...r2 } = resto; }` compila. `.datos=@resto` y `@(resto)` dan `FUD1147`.
13. **Spread.** `<app-card ...post>` y `<input ...resto>` siguen compilando y pintando como hoy,
    salvo el orden de los atributos. `<a ...enlace ...extra class="boton">` (anexo A.3.4, D6)
    escribe sus atributos ordenados por nombre en el sitio del primer spread, y `title` sale de
    `extra` si lo tiene y de `enlace` si no. Igual en el servidor, al hidratar y al actualizar.

**Control y `@empty`**

14. **`@empty`.** En `@foreach`, `@for` y `@while`, con cero vueltas el servidor pinta el cuerpo de
    `@empty`, y con alguna no lo pinta.
15. **`@empty` en vivo.** En el cliente, vaciar la lista de un `@foreach` hidratado monta `@empty`, y
    volver a llenarla lo quita; sin parpadeo de marcas ni nodos huérfanos (test de `packages/testing`).
16. **`@empty` mal puesto.** Tras un `@if`, suelto o repetido, da `FUD1149`.
17. **`@{ }`.** `@{ const { a } = x; let n = 0; n += 1; }` compila. `@{ if (a) { } }`,
    `@{ for (const x of xs) { } }` y `@{ f(); }` dan `FUD0908`.
18. **`@for` y `@while`.** `signal-while.fud` y `@for (let i = 0; i < count(); i++)` compilan;
    `@switch (x) { case y: }` con `y` no literal da `FUD1148`.

**El corte de servidor**

19. **`computed`.** `computed(() => n() * 2)` con `n = signal(10)` pinta `20` en el servidor;
    `computed(() => xs().filter(…))` leído por la vista da `FUD1140` en el `@code`.
20. **Declaraciones.** Una `function` leída como valor en la vista (no callback) y un `const` que
    usa `toLocaleTimeString` dan `FUD1150` sobre la declaración con `related` al uso.
21. **Store.** Un `count` importado de `../store/contador.ts` con `export const count = signal(0)`
    compila y el servidor pinta `0`. Con `signal(Math.random())` da `FUD0907` en el store; con
    `signal(now())`, `FUD0912`; un `export function` leído como valor, `FUD1150`.
22. **Datos.** `const lista: Nodo = { … }` con `Nodo` del `.fudapi` compila; el mismo literal sin
    anotar da `FUD1153`. Las páginas `expected/*.fud` del banco compilan sin diagnóstico.
23. **Tipos portables.** `props<{ user: { name: string } }>()` da `FUD1153` sobre `user`;
    `props<{ user: User }>()` con `User` del `.fudapi` no. Una prop callback `onSave: () => void`
    no da nada.

**`now()` y el reloj**

24. **`now()`.** `signal(now())` compila. `@(now() | hora)` en la vista y `computed(() => now())`
    dan `FUD0912`. En un manejador, `ahora.set(now())` no da nada.
25. **Hidratación.** En una página con `signal(now())` pintada a las `T`, el cliente que hidrata
    lee `T` de `fud-state`. Con `now` espiado, el cliente no lo llama al hidratar y sí al crear la
    instancia desde cero.
26. **El reloj.** `app-clock` y `ruta-reloj` pintan hora y fecha en el servidor con pipes y
    avanzan un segundo por segundo en el navegador, como hoy.

**Manejadores**

27. **Libres.** `@click=@(() => n.set(Math.max(0, n() - 1)))`, `@click=@(() => ahora.set(new Date()))`
    y `bus:x=@(e => lista.set([...lista(), e.detail]))` no dan ningún código de esta spec.

**Emit, conformidad y editor**

28. **Presencia.** `@if (x === null)` con `x` `undefined` entra en la rama, igual en el servidor y en
    el cliente.
29. **Conformidad.** La suite de §4.6 pasa: cada fixture da su `.html` byte a byte, incluidos los
    casos frontera.
30. **Editor.** Cada código nuevo sale en el editor con el mismo span que en el build. Tras `xs.`
    en `@( )` el completado no ofrece `filter` ni `length`; en un `@click`, sí. Tras la `}` de un
    `@foreach`, ofrece `@empty`.
31. **Catálogo.** Los catorce códigos nuevos tienen `.ts`, `.md` y línea en `index.ts`; los
    reescritos tienen su texto nuevo; `FUD0911` está como `retired`.
32. **La vista de errores.** `examples/vista-errores` da exactamente los diagnósticos que dicen sus
    comentarios, por el pase semántico, por el pase tipado y por el canal del editor.

**Producto**

33. **Corpus.** Ningún `.fud` del repositorio fuera de `experiments/` da un diagnóstico de esta
    spec. `examples/basic` se comporta igual en el navegador, salvo el formato del carrito
    (`3,50 €`).
34. **Hidratación igual.** El nivel de hidratación de cada componente y ruta del repositorio no
    cambia (la tabla de SDD-60, criterio 33).
35. **Entrega.** `pnpm typecheck`, `pnpm test` y `pnpm build` en verde. Lo nuevo al 100 % en las
    cuatro métricas, sin `v8 ignore`, y ningún umbral baja.

## 7. Fuera de alcance

Nada. Todo lo que esta spec nombra lo cierra.
