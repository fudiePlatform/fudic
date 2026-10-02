# SDD-51 — Lo que se puede escribir en la vista

> **Estado:** `Listo` — [tareas](./SDD-51-Task.md), 0 / 16.
> **Paquetes:** `@fudic/compiler` (analizadores semánticos, emit de `setUrl`) ·
> `@fudic/diagnostics` (los códigos) · `@fudic/dom` (`setUrl` en el contrato `Dom<N>` y en `browserDom`) · `@fudic/ssr` (`setUrl` en sus adaptadores) ·
> `@fudic/language-core` (la proyección deja de ofrecer `on*`)
> **Depende de:** 11 (lote Oxc, `mapSpan`), 12 (pase semántico, `walk`), 50 (catálogo de
> diagnósticos)
> **Rango de diagnósticos:** `FUD0900`–`FUD0919` (nuevo), entero.
> **Decisiones de gramática:** 137–141 (nuevas). Enmienda la 104 (fuera `await`).
> **Origen:** T-18 de [SDD-25-Task-Claude](./SDD-25-Task-Claude.md), aplazada a spec propia.
>
> **Qué añade en una frase.** La vista es una función del estado: lo que se escribe en `@( )`,
> en `@{ }`, en un valor de atributo o en una cabecera de control no puede salirse de la pasada
> de render, y lo que no cabe en esa regla va a `@code`.

---

## 1. Contexto y objetivo

### 1.1. Lo que hay hoy

Una expresión del template admite cualquier cosa que Oxc parsee. `@(await x)`, `@(count++)`,
`@(window.location.href)`, `@(this)`, `@{ return; }` o `@($shadow.host.remove())` compilan sin
un aviso. La decisión 104 incluso pone `await` de ejemplo de lo que va en `@( )`.

Lo único que se comprueba es la **forma del valor**: `$text` exige `$Scalar` (decisión 19) y
`FUD0195` caza el literal de array u objeto interpolado. Nada mira **qué hace** la expresión.

Y un `<button onclick="@(x)">` compila: la proyección mete los 68 atributos `on*` de HTML en
`$GlobalAttrs` a propósito ([globals.ts](../../packages/language-core/src/globals.ts)). Con la
CSP por defecto de fudic (`script-src 'self' 'nonce-…'`, sin `'unsafe-inline'`,
[csp.ts](../../packages/transport/src/csp.ts)) ese atributo **nunca se ejecuta**: el autor lo
escribe, compila, y en el navegador no pasa nada.

### 1.2. La regla

Por la decisión 116, el template corre en el servidor y en las tres pasadas del cliente (crear,
hidratar, actualizar). Lo que se escribe en la vista se ejecuta N veces y en los dos lados. Una
construcción **se escapa** cuando su efecto sale de esa pasada o depende del lado en que corre:

| Vía | Ejemplo | Qué rompe |
|---|---|---|
| Mutar estado | `@(n++)`, `@{ row.total = 0; }` | Cada pasada muta; servidor y cliente divergen |
| Asincronía | `await`, `async () =>`, `yield` | El render deja de ser síncrono; carreras entre actualizaciones |
| Módulo | `import()`, `import.meta` | Carga código desde la vista |
| Contexto implícito | `this`, `arguments`, `super`, `new.target` | Depende de cómo emite el compilador |
| Globales de un lado | `window`, `document`, `localStorage`, `process` | Revienta el SSR o la hidratación no casa |
| Internos del emit | `$dom`, `$shadow`, `$ioc` | La vista toca el runtime por debajo |
| Definir código | `function`, `class`, flecha con cuerpo `{ }` | Puerta trasera para meter sentencias en una expresión |
| Salir del bloque | `return`, `var`, `break etiqueta` | Rompe el control de flujo del render emitido |

La restricción es **sintáctica y por lista blanca**: se enumera lo que vale, y lo que Oxc
aprenda mañana queda prohibido por defecto.

**Lo que no cierra, y está bien que no cierre:** una llamada. `@(save())` o `@(count.set(1))`
pasan, porque la pureza de una función no es decidible. La regla no elimina los efectos: los
obliga a vivir en `@code`, donde se ven.

### 1.3. Lo que no es asunto de esta regla

El criterio es «¿se escapa algo?», nunca «¿es demasiada lógica para una vista?». `?.`, `??`,
`&&`, `||`, ternarios, plantillas y operadores (`prop1 + prop2`) son puros y deterministas, y
valen. Lo que signifiquen (`"1" + "2"` concatena) lo decide el tipo, y TypeScript ya lo ve
sobre la proyección de SDD-23.

---

## 2. Dependencias

- **SDD-11.** El lote Oxc: cada fragmento JS del template ya está parseado, con su AST, y
  `JsBatchResult.mapSpan` devuelve un span de Oxc a coordenadas del `.fud`.
- **SDD-12.** El pase semántico: `ANALYZERS`, `Analyzer`, `SemanticInput.fragmentId`, y el
  `walk` con sus callbacks `interpolation`, `binding`, `control`, `inlineCode` y `hole`.
- **SDD-50.** Un código nuevo es un `.ts` + un `.md` de cinco líneas + una línea de `index.ts`
  en `@fudic/diagnostics`.
- **Decisiones 12, 13, 16, 17, 116.** `@{ }` solo JS, scope léxico del bloque contenedor, corre
  en su sitio en toda pasada, y lo que asigna es del scope de fuera.

---

## 3. Interfaz pública

### 3.1. Dónde aplica

A **todo fragmento JS del template** salvo dos:

| Aplica | No aplica |
|---|---|
| `@( … )` e implícita `@a.b` en contenido, y la de `@raw( … )` | Los valores de `@evento` y `bus:` — invocación diferida (decisión 96); ahí el efecto es el objetivo, y su forma ya la vigila `FUD0291` |
| Toda expresión en valor de atributo, `.prop`, `class:`, `style:`, `ref`, `control` | El `@code` entero |
| Cabeceras: `@if`, `@while`, `@switch`, `case`, `key ( … )`, el iterable de `@foreach`, las tres partes de `@for` | |
| Argumentos de `@render`, `@RenderSection`, `@RenderBody` | |
| `@{ … }` | |

### 3.2. Expresiones: la lista blanca (decisión 137)

Un nodo de expresión vale si es uno de estos, y sus hijos también:

- Identificador (sujeto a §3.4) y literales: cadena, número, booleano, `null`, `bigint`, regex.
- Plantilla `` `…${ }…` `` y plantilla etiquetada (es una llamada).
- Miembro: `a.b`, `a[b]`, `a?.b`, `a?.[b]`.
- Llamada y `new`, también `a?.()`.
- Unario salvo `delete`: `-`, `+`, `!`, `~`, `typeof`, `void`.
- Binario (incluidos `in` e `instanceof`), lógico (`&&`, `||`, `??`) y ternario.
- Array y objeto literales, con spread. En un objeto, solo propiedades `clave: valor` y
  abreviadas; un método, getter o setter es definir código (`FUD0905`).
- Spread en llamada.
- Flecha **con cuerpo de expresión**, no `async`. Sus parámetros pueden desestructurar y llevar
  valor por defecto; el cuerpo y los defectos pasan esta misma lista.
- Lo que TypeScript borra: `as`, `satisfies`, `!`, `<T>x`, `f<T>`.
- Paréntesis.

Todo lo demás es error, con el código de su familia:

| Construcción | Código |
|---|---|
| `=`, `+=`, `??=`, `||=`, `&&=`…, `++`, `--`, `delete` | `FUD0900` |
| `await`, `yield`, flecha o función `async` | `FUD0902` |
| `import( … )`, `import.meta` | `FUD0903` |
| `this`, `super`, `arguments`, `new.target` | `FUD0904` |
| `function`, `class`, flecha con cuerpo `{ }`, método/getter/setter en objeto literal | `FUD0905` |
| Operador coma `a, b` | `FUD0906` |

**Excepción única a `FUD0900` fuera de `@{ }`:** la inicialización y la actualización de una
cabecera `@for` pueden escribir las variables **que esa cabecera declara**
(`@for (let i = 0; i < n; i++)`).

### 3.3. `@{ … }`: la lista blanca de sentencias (decisión 138)

Toda expresión dentro del bloque pasa §3.2, **salvo** que una asignación como sentencia o
dentro de un bucle del propio bloque está permitida con las condiciones de §3.5. Sentencias que
valen:

- `const` y `let`, con desestructuración, spread y rest.
- Expresión como sentencia (típicamente una llamada o una asignación).
- `if` / `else`, `switch`.
- `for`, `for…of`, `for…in`, `while`, `do…while` — las decisiones 12 y 13 mandan aquí los
  bucles manuales.
- `break` y `continue` **sin etiqueta**, dentro de un bucle del propio bloque.
- Bloque `{ }` y sentencia vacía.
- Declaraciones de tipo de TypeScript (`type`, `interface`): no emiten nada.

Todo lo demás es `FUD0908`: `return`, `var`, `throw`, `try`, `with`, `debugger`, sentencias y
saltos con etiqueta, `using`, `enum`, `for await` (este último es `FUD0902`). Una declaración
`function` o `class` es `FUD0905`.

### 3.4. Identificadores libres (decisión 137)

Un identificador que se **lee** y no está declarado dentro del propio fragmento tiene que
resolver a uno de:

1. **Un nombre del template en scope:** lo que declara un `@{ }` en un bloque que lo contiene
   (decisión 17), la cabecera de un bucle que lo contiene, o un parámetro de snippet.
2. **Un nombre de nivel superior del `@code`**: de la zona neutra, incluidos los imports, y
   las señales de `@client` (el servidor las deja inertes). Un nombre de `@server` no: lo dice
   TypeScript (TS2304, la proyección no ve esa zona). Un nombre no reactivo de `@client`
   tampoco: el servidor renderiza sin él, y es `FUD0907` (§3.8).
3. **`data`**, en una ruta y en un layout: lo que devuelve `load()`. Es el único nombre que
   fudic pone en el scope de la vista. `ctx` **no**: es el contexto, y solo existe como
   parámetro de las funciones de `@server` (`load(ctx)`, `layout(ctx, data)`). Tampoco ningún
   nombre que empiece por `$`: son del emit (`$dom`, `$shadow`, `$ioc`).
4. **Un global de la lista corta**, que existe igual en el servidor y en el navegador y no tiene
   efectos: `undefined`, `NaN`, `Infinity`, `Math`, `JSON`, `Number`, `String`, `Boolean`,
   `BigInt`, `Symbol`, `Array`, `Object`, `Date`, `Intl`, `Map`, `Set`, `RegExp`, `parseInt`,
   `parseFloat`, `isNaN`, `isFinite`, `encodeURIComponent`, `decodeURIComponent`, `encodeURI`,
   `decodeURI`.

Si no, `FUD0907`. Quedan fuera, entre otros, `window`, `document`, `globalThis`, `self`,
`localStorage`, `fetch`, `setTimeout`, `process`, `require`, `eval`, `Function`, `Promise`,
`Reflect` y `Proxy`. `typeof window` también: ramificar la vista según el lado es justo lo que
hace que la hidratación no case.

### 3.5. Escrituras (decisión 138)

**En una expresión** (§3.1, todo salvo `@{ }`) no se escribe nada: `FUD0900`, con la excepción
de la cabecera `@for` de §3.2.

**En `@{ }`** se puede **reasignar una variable**, nunca **mutar un objeto**:

- El destino tiene que ser un **identificador**, no `a.b` ni `a[i]` (`FUD0900`).
- Ese identificador tiene que ser un nombre del template (§3.4.1) o un `let` de la **zona
  neutra** del `@code` (`FUD0901`). Es lo que hace escribible el `@while` canónico de la 91,
  cuyo cursor vive en la zona neutra y el template lo resiembra con `@{ cur = lista; }`.
- Lo mismo vale para la desestructuración que asigna, `({ a, b } = obj);`: cada destino.

Que la zona neutra sea escribible no es una fuga: el emit la declara **dentro** de la función
de render (`function render$1(…) { let marca = 1; … }`), así que es estado de la instancia y no
del módulo, y en el servidor no se comparte entre peticiones.

### 3.6. Atributos de evento nativos (decisión 139)

Un atributo cuyo nombre (sin distinguir mayúsculas) empieza por `on` y está en el vocabulario de
eventos de HTML es `FUD0909`, **con valor estático o dinámico**: `onclick="alert(1)"` está igual
de muerto bajo la CSP de fudic que `onclick="@(x)"`. El span es el nombre del atributo.

La proyección deja de declarar los `on*` en `$GlobalAttrs`, y con ello el editor deja de
ofrecerlos. Se revoca el criterio del comentario de `globals.ts` que los admitía.

No afecta a `.onX` (prop de componente, decisión 41.c) ni a `@x` (evento de fudic).

### 3.7. URLs (decisión 140)

Defensa en profundidad: la protección principal frente a `javascript:` es la CSP por defecto,
que ya lo bloquea. Esto cubre el caso en que el HTML se sirve sin ella.

**Atributos URL:** `href`, `src`, `action`, `formaction`, `poster`, `cite`, `data` de
`<object>`, `xlink:href`, `href` de SVG, y `srcset` (lista: se aplica a cada candidato).

**En compilación**, el compilador mira el **prefijo fijo** del valor compuesto —texto literal
de las partes del atributo (decisión 20) más el primer tramo de una plantilla, que son la misma
cosa—:

- Si fija el origen, **no se emite nada**: empieza por `/` seguido de algo que no es `/` ni `\`,
  o por `./`, `../`, `#`, `?`, o por un esquema literal de la lista de abajo.
- Si no lo fija (`@post.url`, `` `${base}/x` ``, `` `/${x}` ``), el emit envuelve el valor en el
  guardia.

**En runtime**, el guardia es un método nuevo del contrato `Dom<N>` de `@fudic/dom`,
`setUrl(el, name, value)`, hermano de `setAttr`. El emit llama a `setUrl` en vez de `setAttr`
cuando el prefijo no fija el origen. Cada adaptador —servidor y SW en `@fudic/ssr`, navegador en
`@fudic/dom`— lo implementa con **la misma función pura**, interna de `@fudic/dom`, para que la
salida sea idéntica y la hidratación case. No es un helper suelto ni un import nuevo en el código
emitido: es una forma más de escribir un atributo, y por eso vive en el contrato. La función:

1. Quita tabuladores y saltos de línea de toda la cadena, y los caracteres de control y espacios
   del principio — los navegadores aceptan `java\tscript:` y `  javascript:`.
2. Pasa el esquema a minúsculas.
3. Lista blanca: sin esquema (no hay `:` antes del primer `/`, `?` o `#`), `http:`, `https:`,
   `mailto:`, `tel:`; `data:image/…` solo en `src` de `<img>`. Cualquier otro se sustituye por
   un valor inerte y en desarrollo se avisa por consola.

**La excepción, para un esquema propio, es una marca en el valor, no en el tipo.** El
compilador no tiene información de tipos, así que un tipo `TrustedURL` no lo podría ver nadie
en el emit. `trustedUrl(s)`, exportado de `@fudic/dom`, devuelve un `TrustedURL`: un valor
marcado que el guardia reconoce en runtime y escribe tal cual. El autor lo llama en `@code`,
donde se ve en una revisión. Las entidades HTML no necesitan tratamiento: `escapeAttr` codifica el `&` en el servidor y `setAttribute` no
decodifica en el cliente.

Sin diagnóstico: el guardia no es un error del autor.

### 3.8. Lo que la revisión del 2026-10-02 añadió (decisión 141)

La revisión de [casos no cubiertos](./SDD-51-casos-no-cubiertos.md) y la evidencia R1–R14 de
`examples/vista-errores` encontraron lo que la lista blanca dejaba pasar y lo que el emit del
cliente rompía. Cada regla es sintáctica y por nombre, sin tipos.

| Qué | Código | Subrayado |
|---|---|---|
| `.constructor`, `__proto__`, `prototype` (también `x["constructor"]`), `Object.getPrototypeOf`/`setPrototypeOf`, `Symbol.for`/`keyFor` | `FUD0910` | el miembro |
| Un método que muta — `push`, `pop`, `shift`, `unshift`, `splice`, `sort`, `reverse`, `fill`, `copyWithin`, `set`, `add`, `delete`, `clear`, `set…` — o `Object.assign`/`defineProperty`/`defineProperties`/`freeze`/`seal`/`preventExtensions` sobre algo que la pasada no ha construido | `FUD0911` | el método |
| `Math.random()`, `Date.now()`, `new Date()` y `Date()`, `Symbol()`, `new Intl.X()` sin argumentos, los getters locales de `Date` (`getHours`…), `toLocale*` y `localeCompare` sin locale (y sin zona horaria para fecha y hora); una `key` que es un objeto, array, flecha, función, clase o `new` | `FUD0912` | la llamada / la key |
| Un bucle de `@{ }` sin condición o con una siempre verdadera y sin `break`; un `@while` siempre verdadero, o cuya condición no llama a nada ni lee nada que un `@{ }` de su cuerpo escriba; `Array(n)` / `new Array(n)` con un `n` que no es un literal ≤ 10 000 | `FUD0913` | la palabra clave / la condición / `Array` |
| Un snippet que se invoca a sí mismo sin un constructo de control en medio | `FUD0914` | el nombre en el `@render` |
| `javascript:`, `vbscript:` o un `data:` que no es imagen, literal, en un atributo URL o `codebase`; todo `srcdoc`; `<meta http-equiv="refresh">`; `<base>` con `href` dinámico; `<animate>`/`<set>` con `attributeName` sobre `href`; `style` dinámico (se escribe `style:prop`) | `FUD0915` | el atributo |
| `.innerHTML`, `.outerHTML`, `.srcdoc` | `FUD0916` | la prop |
| `.stack`; una función del `@code` convertida en texto: `String(f)`, `f.toString()`, `f + ""`, `` `${f}` `` | `FUD0917` | `stack` / el nombre |
| Lo que el template declara (`@{ }`, cabecera de bucle) con un nombre del `@code`, `data` o un global de la lista: en el primer nivel es un `SyntaxError` del servidor, y sombrear `String` cambia lo que llama el emit | `FUD0918` | el nombre |
| Un literal regex, `RegExp` (sale de la lista blanca), `match`/`matchAll`/`search`, y `test`/`exec` sobre una regex del `@code` | `FUD0919` | el literal / el método |
| Una plantilla etiquetada: es una llamada con argumentos que no se ven | `FUD0905` | la etiqueta |
| `.then`, `.catch`, `.finally`, `Array.fromAsync` | `FUD0902` | el método |
| `var` en la cabecera de `@for`/`@foreach` | `FUD0908` | `var` |
| Escribir desde `@{ }` lo que el template no deja reasignar: una variable de cabecera de bucle, un `const` de un `@{ }`, un parámetro de snippet | `FUD0901` | el nombre |
| Acumular (`+=`, `++`, `x = x + …`) sobre un `let` neutro que ningún `@{ }` anterior de la pasada ha resembrado con una asignación simple | `FUD0900` | el nombre |
| Declarar en el template un nombre con `$` | `FUD0461` | el nombre |
| Leer un nombre no reactivo de `@client` (salvo como valor entero de un `.prop`, que el servidor deja inerte) | `FUD0907` | el nombre |
| `.onX` en un tag **nativo** | `FUD0909` | la prop |

**Los manejadores.** El valor de un `@evento` o de un `bus:` sigue fuera de §3.2: corre después
y escribir es su objetivo. Pero los nombres que lee son de la vista, y lo que no resuelve —ni
template, ni `@code`, ni `data`, ni la lista de globales— es `FUD0907`; también lo que declara
un `@{ }`, que vive en la pasada y no donde corre el manejador. Los `$` son de `FUD0666`.

**El cliente evalúa en orden.** En un closure con un `@{ }` (suyo o de un bloque anidado), cada
valor se evalúa en su sitio de `c` y de `u`, intercalado con los `@{ }` y la reconciliación, y
`$a` solo aplica. Antes `$a` los evaluaba todos juntos, al final de `c` y al principio de `u`, en
otro closure: un nombre de un `@{ }` daba `ReferenceError`, y dos `@{ }` que reasignaban lo leído
daban otro valor que el servidor. Sin `@{ }` el emit no cambia.

**El guardia.** `//`, `/\`, `\/` y `\\` al principio son otro origen y se escriben inertes.
`srcset` e `imagesrcset` se leen candidato a candidato —un `data:` con comas sale entero— y
admiten `data:image/`; `ping` se lee URL a URL. Los tres se guardan siempre.

**Límites conocidos**, sin diagnóstico: una clave computada no literal (`o["const" + "ructor"]`);
un `id`/`name` dinámico en una página (DOM clobbering: prohibirlo prohibiría las anclas); una
recursión entre snippets distintos o entre ficheros.

---

## 4. Comportamiento

### 4.1. Un analizador por regla

Cuatro analizadores nuevos en `packages/compiler/src/semantic/analyzers/`, cada uno una entrada
de `ANALYZERS`:

| Analizador | Códigos |
|---|---|
| `view-expressions` — la lista blanca de §3.2 sobre cada fragmento de §3.1 | `0900`, `0902`–`0906` |
| `view-statements` — §3.3 y las escrituras de §3.5 en `@{ }` | `0900`, `0901`, `0905`, `0908` |
| `view-identifiers` — §3.4 | `0907` |
| `native-event-attributes` — §3.6 | `0909` |

Comparten un recorrido del AST de Oxc con el scope del template (lo que declaran bucles,
`@{ }` y snippets en los bloques que contienen el fragmento). Si el `walk` no entrega algún
fragmento de §3.1, se añade el callback, como hizo SDD-48 con `hole`.

### 4.2. Spans

Cada diagnóstico lleva el span **del nodo culpable**, mapeado con `mapSpan`, no el del fragmento
entero: en `@(a ? b++ : c)` se subraya `b++`. `FUD0901` y `FUD0907` subrayan el identificador;
`FUD0908` la palabra clave de la sentencia; `FUD0909` el nombre del atributo.

Un fragmento sin AST (Oxc no lo parseó) se salta: `FUD0170` ya lo cubrió.

### 4.3. Uno por nodo, todos los nodos

Un nodo prohibido da su diagnóstico y **no se desciende en él**: `@(async () => await x)` es un
`FUD0902` (la flecha `async`), no dos. Los nodos hermanos sí se siguen recorriendo, para que un
fichero con tres faltas muestre las tres.

### 4.4. Enmienda de la decisión 104

Se retira `await` de la lista de ejemplos de `@( … )`. Lo asíncrono se resuelve en `load()` o en
`@code`, y la vista recibe valores.

---

## 5. Invariantes

- **Lista blanca, nunca negra.** Un tipo de nodo de Oxc que no esté enumerado es error.
- **El pase nunca lanza** (regla de oro): un AST inesperado es un nodo no listado, no una
  excepción.
- **Ningún código escrito a mano:** cada analizador llama a la función de su código.
- **Lo que hoy compila en el corpus sigue compilando,** salvo lo que esta spec prohíbe a
  propósito. Los 136 `.fud` del repo se barrieron: el único `console.` está en el cuerpo de un
  `<script>` (crudo, decisión 43, fuera de alcance), y los dos `@{ }` que escriben
  (`signal-while`, `signal-code`) escriben `let` de la zona neutra, que §3.5 permite.

### Catálogo de diagnósticos

Los veinte son `error` y su `.md` (SDD-50 §4.4) es este:

~~~md
# FUD0900 — The view writes
**error** · SDD-51

A template expression ran an assignment, `++`, `--` or `delete`; it would run again on every render pass, on both sides. In `@{ }` only a variable may be reassigned, never an object's member.
**Fix:** compute the value in `@code`, or reassign a variable in `@{ }`: `@{ total = a + b; }`.
~~~

~~~md
# FUD0901 — The view writes a name it does not own
**error** · SDD-51

An `@{ }` block may reassign only what the template declares or a `let` of the neutral `@code`; this name is an import, a prop, `data`, a `@server`/`@client` name or a global.
**Fix:** declare it with `let` in the neutral `@code`, or in an `@{ }` that encloses this one.
~~~

~~~md
# FUD0902 — Asynchrony in the view
**error** · SDD-51

`await`, `yield` and `async` functions make a render pass asynchronous, and two updates could then finish out of order.
**Fix:** resolve the value in `load()` or in `@code`, and read the result in the view.
~~~

~~~md
# FUD0903 — Module access in the view
**error** · SDD-51

`import( … )` and `import.meta` load or describe modules; a view renders values.
**Fix:** import in `@code` and use the imported name in the view.
~~~

~~~md
# FUD0904 — Implicit context in the view
**error** · SDD-51

`this`, `super`, `arguments` and `new.target` mean whatever the emitted render function makes them mean.
**Fix:** name the value in `@code` and read it by that name.
~~~

~~~md
# FUD0905 — Code defined in the view
**error** · SDD-51

A function, class, method or block-bodied arrow defines code where only values belong. An arrow with an expression body is fine: `items.filter(x => x.ok)`.
**Fix:** declare the function in `@code` and call it from the view.
~~~

~~~md
# FUD0906 — Comma operator in the view
**error** · SDD-51

`a, b` evaluates `a` and throws it away: the only reason to write it is a side effect.
**Fix:** move the first part to `@{ }` or `@code`, and keep the value you render.
~~~

~~~md
# FUD0907 — Name not available to the view
**error** · SDD-51

The view reads only what the file or the template declares, what the file's role provides, and a short list of globals that behave the same on server and browser (`Math`, `JSON`, `Intl`…).
**Fix:** import or declare it in `@code`; anything about `window` or `document` belongs in `@code { @client }`.
~~~

~~~md
# FUD0908 — Statement not allowed in `@{ }`
**error** · SDD-51

An `@{ }` block holds declarations, assignments, calls, conditionals and loops; `return`, `var`, `throw`, `try`, labels and the like would leak out of the block into the render.
**Fix:** move the logic to a function in `@code` and call it from the block.
~~~

~~~md
# FUD0909 — Native event attribute
**error** · SDD-51

`onclick` and the other `on*` attributes are inline scripts: fudic's Content-Security-Policy blocks them, so the handler would never run.
**Fix:** use the fudic event binding: `@click="@save"`.
~~~

~~~md
# FUD0910 — Reflective access in the view
**error** · SDD-51

A member named `constructor`, `__proto__` or `prototype`, `Object.getPrototypeOf`/`setPrototypeOf` or `Symbol.for` reaches what the white list keeps out: `Function` is `eval`, and `Symbol.for` forges a `trustedUrl`.
**Fix:** read the value you need in `@code` and use its name in the view.
~~~

~~~md
# FUD0911 — The view mutates an object
**error** · SDD-51

`sort`, `push`, `splice`, `set`, `add`, `delete`, `Object.assign` and their kin write as surely as `=`. Mutating what the pass itself built is fine; mutating `data`, a prop or the `@code` state is not.
**Fix:** work on a copy (`toSorted()`, `[...xs].sort()`, `Object.assign({}, o)`) or do it in `@code`.
~~~

~~~md
# FUD0912 — A value that differs between server and browser
**error** · SDD-51

`Math.random()`, `Date.now()`, `new Date()`, `Symbol()`, a locale or time zone left implicit, and a `key` that is a new object on every pass give each side, or each pass, its own answer.
**Fix:** compute it in `load()` or `@code`, pass a locale and a time zone, and key by a primitive: `key (item.id)`.
~~~

~~~md
# FUD0913 — A loop or allocation without a bound
**error** · SDD-51

A loop whose condition is absent or always true, a `@while` whose body never writes what its condition reads, and `Array(n)` with a size that is not a small literal run on the server for every request.
**Fix:** give the loop an exit the view can see, or build the list in `@code`.
~~~

~~~md
# FUD0914 — A snippet renders itself unconditionally
**error** · SDD-51

A recursive `@render` is fine under an `@if`, `@switch` or loop that ends it; with nothing in between, every call makes another.
**Fix:** wrap the recursive `@render` in the condition that ends it: `@if (f.next) { @render fila(@f.next) }`.
~~~

~~~md
# FUD0915 — An attribute that runs, loads or redirects
**error** · SDD-51

A `javascript:` URL, an `srcdoc`, a `meta` refresh, a dynamic `<base>`, an `<animate>` over `href` and a dynamic `style` are scripts, documents or redirects the view writes outside the guard.
**Fix:** link with a plain URL, build the document as a component, and style with `style:prop`.
~~~

~~~md
# FUD0916 — A property that writes HTML
**error** · SDD-51

`.innerHTML`, `.outerHTML` and `.srcdoc` turn a string into markup: whatever the data says becomes elements and scripts.
**Fix:** render the content with the template, where every value is escaped.
~~~

~~~md
# FUD0917 — Server internals in the HTML
**error** · SDD-51

An error's `.stack` carries the server's absolute paths, and a function turned into a string carries its source, which differs between the server and the browser bundles.
**Fix:** render a message you choose, and call the function instead of printing it.
~~~

~~~md
# FUD0918 — The view redeclares a name
**error** · SDD-51

The template shares the render function with `@code`: redeclaring one of its names is a `SyntaxError` on the server, and shadowing `data` or a global like `String` changes what the emitted code calls.
**Fix:** pick another name.
~~~

~~~md
# FUD0919 — Regular expression in the view
**error** · SDD-51

A regex literal, `RegExp`, and `match`, `matchAll` and `search`, which build one from a string, carry `lastIndex` from one pass to the next and backtrack without limit on what the data says.
**Fix:** test the text in `@code` and render the result.
~~~

---

## 6. Criterios de aceptación

1. **Expresiones permitidas.** Compilan sin diagnóstico: `@(prop1 + prop2)`,
   `@(data?.x ?? '—')`, `@(a && b)`, `@(ok ? 'sí' : 'no')`,
   `` <a href=@(`/posts/${post.id}`)> ``, `@(items.filter(x => x.ok).length)`,
   `@(new Intl.NumberFormat('es').format(n))`, `@(user!.name as string)`.
2. **Escrituras en expresión.** `@(n++)`, `@(a = 1)`, `@(a ??= 1)`, `@(delete o.k)` y
   `class:on=@(x = true)` dan `FUD0900` sobre el operador y su operando, no sobre el `@( )`.
3. **Cabecera `@for`.** `@for (let i = 0; i < n; i++) key (i) { … }` compila; `@for (let i = 0;
   i < n; total++)` da `FUD0900` sobre `total++`.
4. **`@{ }` que vale.** `@{ const { a, ...rest } = data; let xs = [...a, 1]; for (const x of xs)
   { if (x > 2) break; } }` compila.
5. **Escrituras en `@{ }`.** El `signal-while.fud` y el `signal-code.fud` del ejemplo compilan
   sin cambios. `@{ data.title = 'x'; }` y `@{ row[i] = 0; }` dan `FUD0900`; `@{ importado = 1; }`
   sobre un import, y `@{ x = 1; }` sobre un `let` de `@client`, dan `FUD0901` sobre el nombre.
6. **Asincronía.** `@(await x)`, `@(async () => 1)` y `@{ for await (const x of s) {} }` dan
   `FUD0902`; `@(async () => await x)` da **uno**.
7. **Módulo y contexto.** `@(import('./x'))`, `@(import.meta.url)` → `FUD0903`; `@(this.x)`,
   `@(arguments[0])` → `FUD0904`.
8. **Definir código.** `@(function () {})`, `@(class {})`, `@(() => { return 1; })`,
   `@({ f() {} })` y `@{ function f() {} }` dan `FUD0905`; `@(xs.map(x => x * 2))` no.
9. **Coma.** `@((a(), b))` da `FUD0906`.
10. **Identificadores.** `@(window.innerWidth)`, `@(typeof document)`, `@(globalThis)`,
    `@($shadow)` y `@(eval('1'))` dan `FUD0907` sobre el nombre. `@(Math.max(a, b))`,
    `@(JSON.stringify(v))` y un nombre importado en `@code` no dan nada. Un nombre declarado en
    un `@{ }` de un bloque que contiene al fragmento resuelve; uno declarado en un `@{ }`
    hermano posterior, no.
11. **Sentencias.** `@{ return; }`, `@{ var x = 1; }`, `@{ throw e; }`, `@{ try {} catch {} }`,
    `@{ l: for (;;) { break l; } }` y `@{ debugger; }` dan `FUD0908` sobre la palabra clave.
12. **Eventos.** `<button @click="@(() => n++)">` **no** da ningún código de esta spec.
13. **`on*`.** `<button onclick="@(x)">`, `<button onclick="go()">` y `<div ONMOUSEOVER="x">`
    dan `FUD0909` sobre el nombre; `<app-x .onSave=@save>` no. La proyección ya no ofrece
    `onclick` al completar en un tag nativo ni en uno de componente.
14. **Varias faltas.** Un fichero con `@(a++)`, `@(window)` y `@{ return; }` da los tres
    diagnósticos.
15. **URL, sin guardia.** `href="/posts/@id"`, `` href=@(`/p/${id}`) ``, `href="#@id"` y
    `href="https://x.com/@id"` se emiten sin envolver.
16. **URL, con guardia.** `href="@url"`, `` href=@(`/${x}`) `` y `src=@(base + '/a.png')` se
    emiten envueltos. Con `url` igual a `javascript:alert(1)`, `JaVaScRiPt:x`,
    `  javascript:x`, `java\tscript:x` y `vbscript:x`, el HTML del servidor y el atributo del
    cliente quedan inertes, y **coinciden**. `https://a.b`, `mailto:a@b`, `/x` y `x/y` pasan
    intactos. `data:image/png;base64,…` pasa en `<img src>` y no en `<a href>`.
17. **`trustedUrl`.** `href="@abrir"` con `const abrir = trustedUrl('miapp:abrir')` en `@code`
    se escribe como `miapp:abrir`, igual en servidor y cliente; la misma cadena sin marcar
    queda inerte.
18. **Catálogo.** Los diez códigos tienen `.ts`, `.md` de la forma de SDD-50 y línea en
    `index.ts`; los tests de `@fudic/diagnostics` pasan.
19. **Editor.** Los diez se ven en el editor con el mismo span que en el build (el canal de
    SDD-35: lo que el editor marca, el build lo falla).
20. **Corpus.** Los `.fud` del repo compilan sin ningún diagnóstico nuevo y `pnpm build`
    construye `examples/basic`.
21. **Cobertura.** Los analizadores nuevos y el guardia al 100 % en las cuatro métricas, y el
    umbral de `@fudic/dom`, `@fudic/ssr` y `@fudic/language-core` no baja.
22. **La vista de errores.** `examples/vista-errores` lleva cada caso de §3.2–§3.8 con un
    comentario «FUDnnnn sobre `texto`» o «sin diagnóstico», y da exactamente eso y nada más,
    por el pase semántico y por el canal del editor. Los casos del cliente (§3.8, «El cliente
    evalúa en orden») y del guardia tienen su test de emit y de `@fudic/dom`.

---

## 7. Fuera de alcance

- **La pureza de las llamadas.** `@(save())` pasa (§1.2).
- **El no determinismo más allá de §3.8.** La lista de §3.8 es por nombre; lo que una función de `@code` haga dentro no se ve. `Math.random()` o `new Date()` en la vista hacen que la hidratación
  no case, pero no se escapan: un aviso para ellos es otra spec, si hace falta.
- **El cuerpo de `<script>`** (decisión 43) y **el `@code`**: sin restricción.
- **Los valores de `@evento` y `bus:`**: su forma es de `FUD0291`.
- **Redirecciones abiertas a nivel de camino** (`/posts/${id}` con `id = "../admin"`): es asunto
  de `encodeURIComponent`, no de un diagnóstico.
- **Cabeceras CSP** y su despliegue en hosting estático: SDD-20.

