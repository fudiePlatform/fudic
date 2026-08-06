# Gramática v1 — Decisiones de diseño

Compendio de las decisiones tomadas durante la definición de la sintaxis Razor adaptada a JS/TS para el compilador. Sirve como referencia de implementación del parser. Numeración 1-62 (v1) + 63-66 (`@code`; 63-65 **retiradas**, ver sección 8) + 75-80 + 81-90 (layouts, sección 12).

Convenciones de notación EBNF extendida usadas a lo largo del documento:

- `MAYÚSCULAS` → tokens terminales o clases de caracteres.
- `minúsculas` → no-terminales.
- `?` `*` `+` como de costumbre.
- `[...]` → clase de caracteres.
- `&(...)` → lookahead positivo (no consume).
- `!(...)` → lookahead negativo (no consume).
- `{mode: ...}` → modo del parser (html, js, svg, etc.).

---

## Sección 1-5. Reglas de transición del `@`

En modo HTML, el parser distingue cinco casos mirando el siguiente carácter tras `@`:

```
at_construct
  : AT AT                             // escape literal: emite "@"
  | AT STAR comment_body STAR AT      // comentario @* ... *@
  | AT LBRACE js_block RBRACE         // bloque de código inline @{ ... }
  | AT keyword_control ...            // @if, @foreach, @for, @switch, @code...
  | AT explicit_expression            // @(expr)
  | AT implicit_expression            // @foo.bar  (solo camino de propiedades)
  ;

implicit_expression
  : identifier ("." identifier)*      // sin ?., sin llamadas, sin índices, sin ! ni genéricos
  ;
```

### Decisiones

**1.** `@@` → `@` literal (escape doble-arroba).

**2.** Punto final de frase no pertenece a expresión implícita si no le sigue identificador. `@foo.` emite `@foo` + `.`.

**3.** La expresión implícita es **solo un camino de propiedades**: `identifier ('.' identifier)*`.
Todo lo demás —optional chaining `?.`, llamadas, índices `[...]`, non-null `!` y genéricos— exige
expresión explícita `@(...)`. `@user?.name` se lee como implícita `user` seguida del texto
literal `?.name`; la forma correcta es `@(user?.name)`. (Cerrado en SDD-04, opción A.)

**4.** Non-null assertion TS `!` **no** soportado en expresión implícita. Si se necesita, usar explícita: `@(user!.name)`.

**5.** (Consecuencia, no decisión.) Genéricos TS en llamadas (`foo<T>(x)`) obligan a expresión explícita por el conflicto con `<` de HTML.

**6.** Delegación a Oxc en explícita: estrategia (a) — balanceador propio cuenta delimitadores (strings, templates, regex literals, comentarios) hasta el `)` de cierre, luego pasa el substring a Oxc para validar. Migración futura a (b) si Oxc expone modo de parsing de expresión con delimitador.

**7.** Heurística de email mantenida: si el `@` está precedido inmediatamente por carácter identificador (forma palabra con lo anterior), se trata como literal. Permite `user@dominio.com` en texto sin escape.

**Regla de precedencia entre 1 y 7.** El escape `@@` (decisión 1) se evalúa **antes** que el
lookbehind de email (decisión 7). Es decir: al encontrar un `@`, el parser mira primero si el
carácter siguiente es otro `@`; si lo es, consume la pareja y emite el literal `@`, sin consultar
el carácter anterior. Sólo si no hay `@@` se aplica el lookbehind de email. Consecuencia
normativa: `a@@b` produce el literal `a@b` (nunca `a@` + interpolación de `b`).

**8.** Atributos con `@` exigen comillas. `href=@url` es error; `href="@url"` correcto.

---

## Sección 6. Construcciones de control de flujo

Patrón general: keyword tras `@`, cabecera JS entre paréntesis cuando aplica, cuerpo entre llaves en modo HTML. El parser mantiene una pila de modos que alterna HTML ↔ JS en cada transición.

### Decisiones

**9.** `@else` y `else` ambas válidas. El parser acepta la forma sin `@` porque el contexto lo
permite. Esta doble forma es **exclusiva de `else`**: `case` y `default` van **siempre sin `@`**.
`@case` / `@default` no existen — un `@case` resolvería como expresión implícita `case` seguida de
texto (`case` no está en el conjunto cerrado de keywords de SDD-04) y produciría un error críptico.

**10.** Entre `}` del `if` y `else` se permiten whitespace y comentarios `@* *@`.

**11.** `@foreach` separado de `@for`. Iteración declarativa (`for...of`) usa `@foreach`; iteración con índice usa `@for`.

**12.** `for...in` rechazado, pero **como regla semántica, no sintáctica** (matizado en SDD-06).
La cabecera de `@foreach` es JS **opaco** para el parser Razor: el balanceador localiza el `)` de
cierre y delega el substring a Oxc. Distinguir `for...of` de `for...in` exige el AST JS, así que
el rechazo lo emite la fase semántica (SDD-11/12), no el parser. Si se necesita `for...in`, usarlo
dentro de `@{ ... }` con iteración manual.

**13.** Sin `@break` / `@continue` en sintaxis Razor. Si se necesita, dentro de `@{ ... }`.

**14.** `@switch` sin fall-through. Cada `case` es implícitamente independiente (semántica tipo Rust/C# moderno).

**15.** Expresiones arbitrarias permitidas en `case` (cualquier `js_expression`).

**16.** `@{ ... }` solo JS, sin HTML anidado en v1. Para emitir markup condicional, usar `@if`.

**17.** Variables declaradas en `@{ ... }` tienen scope léxico del bloque contenedor.

> Las decisiones **79** y **80** cierran también reglas de control de flujo (cerradas en SDD-06),
> pero llevan numeración al final de la serie para no romper la existente. Se enuncian aquí:

**79.** **El `}` crudo siempre cierra el bloque.** Dentro del cuerpo en modo HTML de una estructura
de control, un `}` literal en el texto termina el bloque sin excepción: no hay escape con barra
invertida ni heurística de "llave desbalanceada". Para emitir una llave literal en markup se usa
la **entidad HTML** `&#123;` / `&#125;` (decisión 49, que desde BUG-14 la **decodifica** en
compilación en vez de dejarla pasar: el nodo lleva la llave, no la entidad, y por eso el
cliente pinta lo mismo que el servidor).
Ejemplo: `@if (a) { <p>&#123;x&#125;</p> }` emite el texto `{x}` y el `}` final cierra el bloque.

**80.** **Corte del test de un `case`.** El test de un `case` se extiende hasta el **primer `:` a
profundidad 0** — profundidad 0 tanto de delimitadores (`()`, `[]`, `{}`, strings, templates,
regex, comentarios) **como de ternario** (`?` … `:`). Un `:` que cierra un ternario abierto no
termina la etiqueta. Ejemplo: en `case cond ? 'a' : 'b':` el primer `:` pertenece al ternario y el
segundo es el que corta el test.

### Gramática de referencia

```
if_stmt
  : AT "if" WS* LPAREN js_expression RPAREN WS* html_block
    (else_gap AT? "else" WS+ "if" WS* LPAREN js_expression RPAREN WS* html_block)*
    (else_gap AT? "else" WS* html_block)?
  ;

else_gap                                  // decisión 10
  : ( WS | razor_comment )*
  ;

foreach_stmt
  : AT "foreach" WS* LPAREN js_for_of_header RPAREN WS* html_block
  ;

for_stmt
  : AT "for" WS* LPAREN js_for_header RPAREN WS* html_block
  ;

while_stmt
  : AT "while" WS* LPAREN js_expression RPAREN WS* html_block
  ;

switch_stmt
  : AT "switch" WS* LPAREN js_expression RPAREN WS*
    LBRACE WS* switch_case* WS* RBRACE
  ;

switch_case                               // `case`/`default` SIEMPRE sin AT (decisión 9)
  : "case" WS+ case_test COLON html_content*
  | "default" WS* COLON html_content*
  ;

case_test                                 // decisión 80
  : js_expression                         // corta en el 1.er ':' a profundidad 0
  ;                                       // de delimitadores Y de ternario

code_inline_block
  : AT LBRACE js_statements RBRACE      {mode: js}
  ;

html_block
  : LBRACE html_content* RBRACE         {mode: html}
  ;
```

---

## Sección 7. Interpolación y bindings en contexto HTML

### Decisiones

**18.** Escape HTML automático por defecto en toda interpolación. Primitiva explícita `@raw(expr)` para optar out, combinada con tipo marcador `TrustedHTML` (detección por compilador).

**19.** Interpolación solo de primitivas escalares (`string`, `number`, `boolean`, `bigint`). `null` y `undefined` → string vacío. Array y objeto → error (compilación si detectable, runtime si no).

**20.** Atributos: concatenación uniforme de partes. Caso totalmente dinámico y caso parcialmente dinámico tratados igual; el emit optimiza.

**21.** Atributos booleanos HTML estándar (`disabled`, `checked`, `readonly`, etc.): si `expr` es falsy, omitir atributo; si truthy, emitir sin valor.

**22.** `class:foo="@x"` y `style:foo="@x"` como sintaxis condicional dedicada (estilo Svelte). `class=` y `style=` sin magia (string puro). No se soporta sintaxis tipo Vue con array/objeto mágico.

**23.** Property binding exige valor `@...`. `.value="hola"` es error; `.value="@('hola')"` correcto.

**24.** Property binding sin concatenación. Un único `at_construct` o error.

**25.** Property binding case-sensitive, tal cual. `.innerHTML`, `.textContent`.

**26.** Handler de evento puede ser referencia (`@click="@handler"`) o lambda (`@click="@(e => ...)"`). Si evalúa a función, se llama con `(event)`; si evalúa a otra cosa, error.

**27.** Sin modificadores de evento. El handler es función JS normal; `preventDefault`/`stopPropagation` se llaman en código.

**28.** Cualquier nombre de evento aceptado, incluidos custom events (`@my-event`). `@evento` es **siempre listener de host** (nombre literal). Para suscripción a eventos de bus entre componentes desacoplados, ver 28.a–28.d (`bus:`).

**28.a.** *Prefijo `bus:` — suscriptor declarativo.* `bus:carrito="@onCarrito(ev)"` registra un listener en el **ancestro común de página (`document`)**, no en el host, con el host como contexto del handler (emisor y suscriptor son hermanos: un evento que burbujea desde el emisor nunca entra en el host del suscriptor). `bus:` es **prefijo de binding reservado**, hermano de `class:`/`style:` (decisión 22); no es atributo con `:` literal (decisión 46).

**28.b.** *Dos formas del nombre bajo `bus:`.* `bus:carrito` (literal, `attr-name`) y `bus:(EVENTOS.carrito)` (expresión explícita para constante importada; el `(` tras `bus:` abre el balanceador, `scanParens`, y el tokenizer emite `explicit-expr`). El parser **solo distingue las dos formas y guarda el span**; la resolubilidad es semántica (28.c → SDD-12).

**28.c.** *(Regla semántica, no sintáctica — SDD-12.)* El nombre de evento —en `bus:X`/`bus:(X)` y en `emit(X, …)`— participa en **hidratación dirigida** solo si `X` resuelve estáticamente a **string literal** (constant folding de una rama: `const`/`as const` local o importado). Si requiere cómputo (`EVENTOS[k]`, template interpolado, retorno de llamada) **no es error**: funciona como listener DOM normal pero **no participa** en hidratación dirigida (permisivo). *Matching* emisor↔suscriptor **por valor de string resuelto** (mecanismo único): `bus:carrito` y `bus:(EVENTOS.carrito)`→`'carrito'` producen la misma entrada; sin identidad de símbolo.

**28.d.** *`@evento` vs `bus:evento` — opuestos, intención declarada no inferida.* `@carrito` = listener de host; `bus:carrito` = listener de `document`. Un mismo componente puede llevar ambos. El compilador **no infiere** cuál se quería por el nombre: la sintaxis lo declara, simétrico al `emit` del emisor.

**29.** (Consecuencia, no decisión.) `@` en posición de nombre de atributo activa event binding de host; en contenido/valor activa interpolación. El parser distingue por posición. El prefijo `bus:` activa el binding de bus.

### Gramática del binding de bus (sección 7)

```
bus_binding
  : bus_name WS* EQ WS* attr_quote AT handler attr_quote
  ;

bus_name
  : "bus:" identifier_with_dashes    // bus:carrito              (28.b) → attr-name
  | "bus:" explicit_expression_naked // bus:(EVENTOS.carrito)    (28.b) → explicit-expr
  ;
```

`explicit_expression_naked` es `(expr)` **sin `@`** (el prefijo `bus:` ya abre el binding, como `class:`); balanceador vía `scanParens`, delegado a Oxc (decisión 6). El tokenizer (SDD-03) emite `attr-name` para la forma literal y `explicit-expr` para la forma expresión; SDD-07 lo clasifica como `BusBinding`. Resolución a literal y matching por valor (28.c) → SDD-12.

**30.** `ref="@var"` acepta solo identificador simple. Expresiones complejas no soportadas en v1.

**31.** `ref` dentro de bucle (`@foreach`, `@for`, `@while`) → error de compilación. Ampliación futura posible con sintaxis dedicada si se necesita.

---

## Sección 8. Bloques de código `@code`

Un solo contenedor `@code` a nivel documento, con tres regiones posibles: zona neutra, `@server`, `@client`.

### Decisiones

**32.** `@server` y `@client` como sintaxis Razor genuina dentro de `@code`, no como marcadores léxicos. El parser del framework reconoce la estructura externa; el contenido de cada sub-bloque se delega a Oxc como fragmento JS independiente.

**33.a.** Regiones `@server` y `@client` **no anidables**. Error de compilación si se anidan.

**33.b.** Máximo un `@server` y un `@client` por `@code`. Cero de cualquiera también válido. Repetir la región es error.

**33.c.** Imports permitidos dentro de regiones. El compilador los eleva al top del bundle correspondiente (SSR o cliente) durante emit. En zona neutra solo imports compartidos (módulos puros sin side effects).

**33.d.** Cero o un `@code` por componente.

**34.** Orden libre entre regiones; convención recomendada `@server` antes que `@client` se aplica en guía de estilo / lint, no en la gramática.

**63-65.** ~~`@client(estrategia)` — parámetro de estrategia de hidratación, whitelist cerrada
`eager|viewport|interaction|idle`, default `interaction`.~~ **Retiradas de v1.**

> **Motivo de la retirada.** Un componente se puede colocar donde el consumidor quiera, y su
> código **no debe declarar cuándo se hidrata**: la hidratación es un hecho **de página**, no de
> componente. Quien conoce la posición, la visibilidad y la prioridad de una instancia es la
> página, no la definición del componente. En consecuencia, la hidratación la gobierna el
> **capturador global** (`docs/sdd/SDD-17-hidratacion.md`), y `@client` no admite paréntesis ni
> parámetro alguno. De las cuatro keywords, `viewport` sobrevive únicamente como estrategia de
> **precarga de red (warm)** —traer el chunk antes de necesitarlo—, nunca como estrategia de
> hidratación. Los números 63-65 quedan **retirados y no reutilizables**, para no romper la
> numeración del resto.

**66.** `@server` **no** admite parámetro. El servidor no se hidrata. `@server(...)` es error de
sintaxis. Con 63-65 retiradas, `@client` tampoco admite parámetro: ambas regiones son ahora
simétricas (`@server { … }` / `@client { … }`) y cualquier paréntesis tras la keyword es error.

### Gramática de referencia

```
code_block
  : AT "code" WS* LBRACE code_content RBRACE
  ;

code_content
  : ( neutral_js | server_region | client_region )*   // orden libre (decisión 34)
  ;                                                    // "máx. un server/client" (33.b) es regla semántica, no sintáctica

neutral_js
  : js_statements              {mode: js, restricted: no_side_effects}
  ;

server_region
  : AT "server" WS* LBRACE js_statements RBRACE      {mode: js, env: server}
  ;

client_region
  : AT "client" WS* LBRACE js_statements RBRACE      {mode: js, env: client}
  ;
```

Nota: ni `client_region` ni `server_region` admiten paréntesis (decisiones 63-65 retiradas, 66).
Un `(` tras `@client` o `@server` es error de sintaxis. La estrategia de hidratación no se declara
en el componente: la decide el capturador global (SDD-17).

### Distinción conceptual

Los tres bloques no son tres entornos de ejecución paralelos:

- **Zona neutra** → compile-time / ambient. Tipos, constantes puras, funciones puras. Se resuelve o duplica sin efectos.
- **`@server`** → runtime SSR. Side effects permitidos contra recursos del servidor (DB, fs, env, secrets).
- **`@client`** → runtime cliente. Side effects permitidos contra el DOM (signals, listeners, lifecycle).

### Ejemplo canónico

```
@code {
  type User = { id: string; name: string; email: string };
  const MAX_USERS = 100;

  function formatName(u: User): string {
    return u.name.toUpperCase();
  }

  @server {
    import { db } from './db';

    async function loadUsers(): Promise<User[]> {
      return db.query('SELECT * FROM users LIMIT $1', [MAX_USERS]);
    }
  }

  @client {
    import { signal } from '@framework/signals';

    const selected = signal<User | null>(null);

    function onSelect(u: User) {
      selected.set(u);
    }
  }
}
```

---

## Sección 9. Comentarios `@* ... *@`

### Decisiones

**35.** Comentarios Razor **no** permitidos dentro de attr list (`<div @* *@ class="x">` es error). Posible extensión futura.

**36.** Comentarios Razor **no anidables**. El primer `*@` cierra siempre (consistente con JS `/* */` y HTML `<!-- -->`).

**37.** Comentarios Razor **no se emiten** en output (ni HTML final ni JS cliente). Distinción frente a `<!-- -->` que sí se emite como comentario DOM.

### Gramática de referencia

```
razor_comment
  : AT STAR comment_body STAR AT
  ;

comment_body
  : (any_char - (STAR AT))*
  ;
```

---

## Sección 10. Gramática HTML de soporte

Subset estricto de HTML5. No se implementa error recovery ni inserciones implícitas. El HTML5 completo lo hace el navegador al renderizar el output.

### Decisiones

**38.** Subset estricto, no HTML5 tolerante. Tags siempre cerrados explícitamente (excepto void elements). Atributos siempre entrecomillados. Sin inserciones implícitas.

**39.** Void elements según lista estándar HTML5: `area`, `base`, `br`, `col`, `embed`, `hr`, `img`, `input`, `link`, `meta`, `source`, `track`, `wbr`. Para estos, no se exige `/` antes de `>`.

**40.** Self-closing permitido en cualquier elemento (regla JSX). `<div/>` equivale a `<div></div>`. El compilador reescribe en emit.

**41.** Tag names: `[a-zA-Z][a-zA-Z0-9-]*`. Cubre HTML estándar, custom elements (con guión obligatorio por spec), y elementos SVG/MathML. Sin distinción sintáctica entre tipos; la validación (custom element debe tener `<link rel="component">` declarado) es semántica.

**41.b.** Detección de `<svg>` y `<math>` como raíz activa modo SVG/MathML en el parser (case-sensitive, self-close permitido estilo XML).

**42.** Razor activo dentro de `<style>`. Desambiguación por lista blanca de at-rules CSS.

**42.a.** Lista blanca de at-rules mantenida en el compilador. Lista inicial: `@charset`, `@import`, `@namespace`, `@media`, `@supports`, `@container`, `@layer`, `@scope`, `@starting-style`, `@keyframes`, `@font-face`, `@font-feature-values`, `@font-palette-values`, `@counter-style`, `@page`, `@property`, `@document` (obsoleto).

**42.b.** Lista cerrada estricta, sin heurística de rescate. Si sale at-rule nueva no listada, se actualiza el compilador. El usuario puede escapar con `@@` si necesita un literal.

**42.c.** Escape `@@` consistente con texto HTML.

**42.d.** Razor permitido tanto en prelude como en cuerpo de at-rules (`@media (min-width: @bp.tablet) { ... }`).

**42.e.** Soporte de nesting CSS nativo. El parser cuenta llaves correctamente en bloques anidados.

**43.** `<script>` raw puro. Sin procesamiento de Razor. Válvula de escape explícita para integraciones de terceros, JSON-LD, feature detection temprano, etc.

**43.a.** Atributos de `<script>` (src, type, async, defer, nomodule, crossorigin, integrity, nonce) pasan tal cual.

**43.b.** Múltiples `<script>` permitidos; se emiten en orden de aparición.

**43.c.** `<script>` permitido en modo componente y en modo página sin restricción. Responsabilidad del developer asumir consecuencias de duplicación si se usa en componentes reutilizables.

**44.** `disabled` y `disabled=""` equivalentes (AST idéntico).

**45.** Atributos duplicados en el mismo elemento → error de compilación.

**46.** `:` permitido en nombre de atributo (`xlink:href`, `xmlns:dc`).

**47.** Orden de atributos preservado desde origen en AST y emit.

**48.** Comentarios HTML `<!-- -->` se emiten tal cual al output.

**49.** ~~Entities HTML pass-through literal (lo que escribe el usuario es lo que va al output). Sin decodificación/re-escape.~~ **Derogada por BUG-14 §3.2.** El pass-through era coherente mientras el compilador solo emitía texto; deja de serlo en cuanto la otra mitad construye DOM: **el cliente no tiene serializador**, y `textContent` no interpreta entidades, así que la misma plantilla pintaba `<html>` por SSR y `&lt;html&gt;` tras hidratar. La regla que sí cumplen las dos salidas:

> El **dato de un nodo** —el texto de un nodo de texto, el valor que recibe `setAttr`— es **texto, no markup**: las entidades del fuente se **decodifican en compilación**, y cada salida lo vuelve a codificar como su medio exige (el serializador escapa; el DOM no lo necesita).

Tres precisiones que la regla no cambia:

- **El AST sigue verbatim.** `TextNode.value` y `AttributeText.value` guardan los bytes del autor —el formateador y el LSP leen ahí—; quien decodifica es el emit.
- **El paso de markup crudo sigue siendo crudo.** Lo que no llega a ser un nodo sino bytes de HTML —los elementos del `<head>`, el interior de un `<title>`, el cuerpo de un `<style>`— pasa tal cual: ya es markup.
- **Subset estricto (decisión 38).** Las cinco de XML (`&lt; &gt; &amp; &quot; &apos;`) más las numéricas (`&#…;`, `&#x…;`). Una referencia bien formada fuera del subset es `FUD0057`, no una tabla de ~2.200 entradas. Una `&` suelta no es una referencia y no se toca.

**50.** CDATA `<![CDATA[...]]>` permitido solo dentro de `<svg>` / `<math>`. Fuera, error.

**51.** Detección automática de modo: fichero que empieza con `<!DOCTYPE` → modo página. Si no → modo componente.

**52.** ~~Fragments permitidos en modo componente. Múltiples elementos raíz sin wrapper.~~
**Sustituida por la decisión 75:** el markup de un componente tiene exactamente un elemento
raíz (el envoltorio host). Los fragments (múltiples raíces) siguen permitidos **dentro** del
`<template>` del componente. A nivel de parser (SDD-05) el top-level sigue admitiendo
múltiples nodos sintácticamente (links, `@code`, `<head>`, envoltorio); la validación
estructural es de SDD-10.

### Gramática de referencia

```
element
  : void_element
  | self_closing_element
  | normal_element
  | raw_text_element
  ;

normal_element
  : LT tag_name attribute* GT content* LT SLASH tag_name GT
  ;

self_closing_element
  : LT tag_name attribute* SLASH GT
  ;

void_element
  : LT void_tag_name attribute* GT
  ;

raw_text_element
  : LT raw_tag_name attribute* GT raw_content LT SLASH raw_tag_name GT
  ;

attribute
  : dynamic_attribute           // attr="@expr" o attr="pre-@expr-post"
  | property_binding            // .prop="@expr"
  | event_binding               // @evt="@handler"
  | ref_binding                 // ref="@var"
  | class_conditional           // class:foo="@expr"
  | style_conditional           // style:foo="@expr"
  | static_attribute            // attr="valor literal"
  | boolean_attribute           // attr sin '='
  ;

attr_name
  : [a-zA-Z_] [a-zA-Z0-9_\-:]*
  ;

tag_name
  : [a-zA-Z] [a-zA-Z0-9-]*
  ;
```

---

## Sección 11. Estructura del documento completo

### Decisiones

**53.** Orden top-level estricto en modo componente: `<link rel="component">` → `@code` → markup. Error si se viola.

**54.** Cero o un `@code` por componente (reiteración de 33.d).

**55.** Múltiples `<link rel="component">` permitidos sin restricción numérica.

**56.** Whitespace libre entre top-level nodes; ignorado en emit.

**57.** Solo `<!DOCTYPE html>` aceptado. Otros doctypes (HTML 4.01, XHTML, etc.) → error.

**58.** En modo página: `<head>` y `<body>` ambos obligatorios, `<head>` primero. Error si falta o está desordenado.

**59.** `<link rel="component">` solo en `<head>` en modo página.

**60.** `@code` en modo página dentro de `<head>`. El compilador lo extrae en emit.

**61.** Orden dentro de `<head>` en modo página: recomendado pero no estricto. El compilador eleva y deduplica en emit (cascade del head).

**62.** `<head>` permitido como fragment top-level en modo componente. Se eleva al `<head>` raíz de la página consumidora con deduplicación. `<link rel="component">` se consume, no sube.

> Las decisiones **63–66** están en la sección de `@code`; las **67–74** viven en los docs de
> runtime (`docs/runtime/style-host-runtime.md`, `docs/runtime/nivel-3-hidratacion-runtime.md`).
> La numeración continúa aquí en 75. Las **79-80** cierran la sección 6 (control de flujo) pero
> llevan número al final de la serie.

**75.** **Identidad del componente por el estándar DSD.** En modo componente, el markup es
**exactamente un** elemento raíz cuyo tag es el **nombre del componente** — un custom element
`prefix-name` (guión obligatorio por la spec) — y cuyo único hijo elemento es un
`<template shadowrootmode="…">` que declara el modo del shadow, tal y como marca el estándar de
Declarative Shadow DOM. El nombre del componente se lee **siempre y solo** de ese tag
envolvente: **no** del nombre del fichero, **no** del `<style>` del head, **no** del consumidor.
Esta sintaxis es **obligatoria**: un componente sin envoltorio host o sin su `<template>` es un
error. Sustituye a la decisión 52. Es la fuente única de la que SDD-12/el resolver "leen el
tag" de un `.fud` enlazado, y del nombre con el que el emit registra el custom element en N3
(`customElements.define`).

**75.a.** Dentro del envoltorio host hay **exactamente un** `<template shadowrootmode>` (además
de whitespace y comentarios, que son transparentes). Cualquier otro hijo → error. `shadowrootmode`
es obligatorio y su valor en v1 es **`open`**. `closed` queda **fuera de v1**: rompe la
invariante 68 (todos los shadows fudic son inspeccionables desde el documento — la cascada de
hidratación desciende por `host.shadowRoot`, SDD-17 §4.4); se revisará vía
`ElementInternals` si un caso lo justifica. Los demás atributos estándar de la template DSD
(`shadowrootdelegatesfocus`, etc.) pasan tal cual.

**76.** El `<head>`-fragment de un componente (decisión 62) admite **a lo sumo un** `<style>`,
y va **sin atributo**: esa hoja es, por definición, la hoja del host y su scope es el tag del
envoltorio (decisión 75). El atributo `host` **no existe en la sintaxis fuente** — escribirlo
es error. **La forma de emisión la decide el compilador**, y es asunto de emit, no de
gramática: v1 emite esa hoja como CSS module script compartido —`<style type="module"
specifier="<tag>">` en el `<head>` de página + `shadowrootadoptedstylesheets="<tag>"` en cada
template, con polyfill— según SDD-18 (SDD-15 §4.8); el specifier es el tag, sin inventos. El
marcador `<style host="tag">` que el emit usaba antes está **retirado**. Más de un `<style>` en
el `<head>` del componente → error.

**77.** Vías de estilo alternativas dentro del `<template>`: un `<style>` normal permanece
**inline** en el shadow root — no se extrae ni se deduplica al head —, y un
`<link rel="stylesheet">` nativo pasa tal cual. El `<style>` del `<head>`-fragment es la
única vía con hoja única compartida/adoptada (decisiones 67–70).

**78.** En modo página no cambia nada: las **instancias** de componentes (`<app-card …>`) se
escriben como hasta ahora; el envoltorio + template DSD del punto 75 es la forma de la
**definición** (el fichero componente), y es el emit quien materializa el DSD en el output.

### Gramática de referencia

```
document
  : page_document
  | component_document
  ;

page_document
  : doctype whitespace* html_root
  ;

component_document
  : link_component*              // exactamente en este orden (decisión 53)
    code_block?
    head_fragment?               // <head> … (decisión 62; aquí vive el único <style>)
    component_host               // decisión 75: envoltorio obligatorio
  ;

component_host
  : LT component_tag attribute* GT
    whitespace* shadow_template
    whitespace* LT SLASH component_tag GT
  ;

shadow_template
  : LT "template" WS+ "shadowrootmode" EQ DQUOTE "open" DQUOTE   // closed fuera de v1 (75.a)
    (WS+ attribute)* GT
    content*
    LT SLASH "template" GT
  ;

component_tag
  : [a-z] [a-z0-9]* ("-" [a-z0-9]+)+   // custom element: guión obligatorio (spec)
  ;

link_component
  : LT "link" WS+ "rel" EQ DQUOTE "component" DQUOTE
    (WS+ attribute)* GT
  ;

top_level_markup_node
  : element
  | razor_comment
  | html_comment
  | whitespace
  ;

doctype
  : "<!DOCTYPE" WS+ "html" WS* ">"   // case-insensitive
  ;

html_root
  : LT "html" attribute* GT
    whitespace* head_element
    whitespace* body_element
    whitespace* LT SLASH "html" GT
  ;
```

### Ejemplo canónico (modo componente)

```fud
<link rel="component" href="./app-button.fud">
<link rel="component" href="./app-icon.fud">

@code {
  type CardProps = {
    title: string;
    variant: 'default' | 'highlight';
  };

  @client {
    import { signal } from '@framework/signals';
    const expanded = signal(false);
    function toggle() { expanded.set(!expanded.peek()); }
  }
}

<head>
  <style>
    :host { display: block; }
    .card { border: 1px solid #ddd; border-radius: 8px; padding: 1rem; }
    .card.highlight { border-color: gold; }
  </style>
</head>

<app-card>
  <template shadowrootmode="open">
    <article class="card" class:highlight="@(variant === 'highlight')">
      <h2>@title</h2>
      <div class="body">
        <slot></slot>
      </div>
      <app-button @click="@toggle">
        @if (expanded.value) { Cerrar } else { Abrir }
      </app-button>
    </article>
  </template>
</app-card>
```

Nótese que el `<style>` del `<head>` se escribe **sin atributos**: la sintaxis de autor no expone
`host` ni ningún specifier. `<style host="app-card">` es **forma de emisión**, la decide el
compilador al serializar (decisión 76); escribirla en un `.fud` es error.

El envoltorio `<app-card>` + `<template shadowrootmode>` es la **identidad** del componente
(decisión 75): de ahí sale el nombre del tag, el scope del `<style>` del head (decisión 76) y
el nombre de registro en N3.

### Ejemplo canónico (modo página)

```fud
<!DOCTYPE html>
<html>
  <head>
    <link rel="component" href="./app-card.fud">
    <link rel="component" href="./app-button.fud">

    @code {
      type PageData = { title: string; items: Item[] };

      @server {
        import { db } from './db';
        async function load(): Promise<PageData> {
          const items = await db.query('SELECT ...');
          return { title: 'Inicio', items };
        }
      }
    }

    <title>Mi página</title>
    <meta charset="utf-8">
  </head>
  <body>
    <h1>@data.title</h1>
    @foreach (const item of data.items) {
      <app-card title="@item.title">@item.description</app-card>
    }
  </body>
</html>
```

---

## Sección 12. Layouts y composición del documento

Un **layout** es el documento que posee el shell (`<!DOCTYPE>`, `<html>`, `<head>`, `<body>`) y
declara dónde se inserta una **ruta**, que pasa a ser un fragmento sin shell. Trae de Razor las
directivas `@RenderBody` / `@RenderSection` y el bloque `@section`, y añade `@RenderHead`, que en
Razor no existe porque una vista de .NET no puede escribir en el `<head>`; aquí sí, y hace
innecesario el `ViewBag.Title`. Especificado en `docs/sdd/SDD-21-layout.md`.

### Decisiones

**81.** **La ruta es el tercer rol de documento, y se declara con `<link rel="layout" href>`.**
Un `.fud` sin doctype que declara ese link es una **ruta**: un fragmento de cuerpo, sin envoltorio
host, cuyo shell lo pone el layout. La detección es **sintáctica y local** —basta el fichero,
nunca su ruta en disco— para no romper el LSP-first. `href` estático obligatorio; **a lo sumo uno**
por documento. La decisión 51 no cambia: el parser sigue clasificando por doctype, y el rol se
afina en la pasada de estructura (SDD-10).

**82.** **Un layout se identifica por su forma, no por su nombre de fichero.** Es un documento con
doctype (page-shaped) que contiene **exactamente un** `@RenderBody()`. Un documento con doctype sin
`@RenderBody()` sigue siendo una página autónoma. `_layout.fud` es convención de estilo, no regla.

**83.** **Orden top-level de una ruta:** `<link rel="layout">` (uno, el primero) →
`<link rel="component">`* → `@code`? → `<head>`-fragment? → markup. El markup de una ruta admite
**múltiples raíces** y **no** lleva envoltorio host (contraste deliberado con la decisión 75, que
gobierna los componentes: un componente es una definición con identidad; una ruta es contenido).

**84.** **Cuatro directivas nuevas, con la ortografía exacta de Razor:** `@RenderBody()`,
`@RenderHead()`, `@RenderSection(name)` en PascalCase (en Razor son invocaciones) y `@section
name { … }` en minúscula (es una keyword de bloque, como `@if`). Entran en el conjunto cerrado de
keywords de la decisión 3/SDD-04: se **resuelven siempre**, en cualquier fichero; su validez
posicional —`Render*` solo en layout, `@section` solo en ruta— es **regla semántica**, no
sintáctica.

**85.** **Forma de las directivas.** `@RenderBody()` y `@RenderHead()` llevan **paréntesis
obligatorios y ningún argumento**: sin paréntesis, `@RenderBody` sería una expresión implícita
válida (decisión 3) y emitiría el texto literal. `@RenderSection` toma un **identificador desnudo**
—`@RenderSection(scripts)`, nunca un string—, resoluble estáticamente por construcción, sin
constant folding (contraste deliberado con la regla permisiva del bus, 28.c: aquí el nombre es
estructura del documento, no dato). Una sección que el layout renderiza y la ruta no declara **no
es error**: no emite nada (el `required: false` de Razor por defecto).

**86.** **Cardinalidad.** Por layout: **exactamente un** `@RenderBody()`, **a lo sumo un**
`@RenderHead()` (y dentro de su `<head>`), y `@RenderSection` con **nombre único**. Por ruta:
`@section` con nombre único. Un layout sin `@RenderHead()` **no es error**: las contribuciones de
la ruta se inyectan al final del `<head>` con un aviso. Una `@section` que nadie consume sí avisa:
su contenido no aparecería en la salida, y eso siempre es un bug del autor.

**87.** **Layouts anidados.** Un layout puede declarar su propio `<link rel="layout">`: la cadena
se compone **de dentro afuera** y es el equivalente jerárquico del `_ViewStart` de Razor. Un ciclo
en la cadena es error de compilación, detectado como ya se detecta en el grafo de componentes.

**88.** **Cascada del `<head>`, con orden determinista.** En el punto del `@RenderHead()` entran,
en este orden: los elementos del `<head>`-fragment de la ruta (verbatim, `<title>` interpolado), el
polyfill de adopción de estilos (SDD-18 §5) una sola vez, y los `<style type="module"
specifier>` de la **unión** de los componentes del layout y de la ruta, deduplicados por tag.
Deduplicación v1 acotada: `<title>` y `<meta name=X>` deduplican y **gana la ruta** (la capa más
interna); el resto concatena en orden. Es la promesa de la decisión 61 limitada a lo que se puede
hacer sin adivinar.

**89.** **En v1 el layout no carga datos.** No exporta `load()`: recibe el `data` de la ruta en
solo lectura. Así la inferencia de modo SSG (SDD-19 §4.2) y la clave de caché no cambian, y no hay
orden de resolución que especificar. El layout **sí** puede tener `@code` con zona neutra y
`@client`, y sus propios `<link rel="component">`.

**90.** **`@section` es exclusivo del par ruta↔layout.** No existe en componentes: ahí la
proyección de contenido es `<slot>`, el mecanismo estándar de DSD, y dos mecanismos compitiendo
sería un error de diseño. Su cuerpo es un `html_block` y no es anidable.

### Gramática de referencia

```
route_document                            // decisiones 81, 83
  : layout_link                           // exactamente uno, el primero
    link_component*
    code_block?
    head_fragment?
    ( top_level_markup_node | section_block )*
  ;

layout_link
  : LT "link" WS+ "rel" EQ DQUOTE "layout" DQUOTE
    (WS+ attribute)* GT                   // href estático obligatorio
  ;

layout_document                           // decisión 82: page_document + @RenderBody()
  : doctype whitespace* html_root
  ;

render_directive                          // decisión 85: paréntesis obligatorios
  : AT "RenderBody" WS* LPAREN WS* RPAREN
  | AT "RenderHead" WS* LPAREN WS* RPAREN
  | AT "RenderSection" WS* LPAREN WS* identifier WS* RPAREN
  ;

section_block                             // decisión 84
  : AT "section" WS+ identifier WS* html_block
  ;
```

### Ejemplo canónico

```fud
@* layouts/_layout.fud — el shell, escrito una vez *@
<!DOCTYPE html>
<html lang="es">
  <head>
    <link rel="component" href="../components/app-nav.fud">
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <link rel="icon" href="./favicon.svg">
    <link rel="stylesheet" href="./global.css">
    <script type="module" src="/fudic-main.js"></script>
    @RenderHead()
  </head>
  <body>
    <app-nav></app-nav>
    <main>@RenderBody()</main>
    <footer>© 2026</footer>
    @RenderSection(scripts)
  </body>
</html>
```

```fud
@* routes/index.fud — la ruta: solo lo suyo *@
<link rel="layout" href="../layouts/_layout.fud">
<link rel="component" href="../components/app-card.fud">

@code {
  @server {
    import { db } from './db';
    export async function load() {
      return { title: 'Inicio', items: await db.query('SELECT …') };
    }
  }
}

<head>
  <title>@data.title</title>
</head>

<h1>@data.title</h1>
@foreach (const item of data.items) {
  <app-card title="@item.title">@item.description</app-card>
}

@section scripts {
  <script src="./analytics.js"></script>
}
```

---

## Notas para implementación

### Modos del parser

El parser mantiene una pila explícita de modos. Los modos son:

- `html` — modo por defecto, reconoce tags, texto, `@` como trigger de átomo Razor.
- `js` — dentro de `@(...)`, `@{ ... }`, `@code`, cabeceras de control. Delegación a Oxc.
- `css` — dentro de `<style>`, reconoce at-rules CSS y `@` como trigger de Razor con desambiguación.
- `raw` — dentro de `<script>`, `<textarea>`, `<title>`. Opaco hasta la tag de cierre.
- `svg` / `math` — case-sensitive, self-close XML-style permitido.

Las transiciones entre modos se producen en construcciones documentadas. Cada push al entrar, cada pop al salir. La anidación arbitraria está permitida donde la gramática lo describe (p.ej. `@if` dentro de `@foreach` dentro de `<p>` dentro de `<body>`).

### Validación semántica vs sintáctica

Algunas reglas se expresan como "error de compilación" pero no son detectables en el parse puro. Pasan a una fase posterior de análisis semántico sobre el AST:

- Lista blanca de `type` en `<script>` (descartada en decisión 43, pero aplica patrón para futuras).
- Atributos duplicados (decisión 45).
- `ref` en bucle (decisión 31).
- Anidación de `@server`/`@client` (decisión 33.a).
- Más de un `@server` o `@client` (decisión 33.b).
- Interpolación de no-primitivas detectable estáticamente (decisión 19).
- Custom element usado sin `<link rel="component">` correspondiente (decisión 41).
- `for...in` en la cabecera de `@foreach`: sólo detectable sobre el AST de Oxc (decisión 12).

### Delegación a Oxc

El balanceador propio del parser entra en acción en las cabeceras de expresiones explícitas (`@(...)`), las cabeceras de estructuras de control (`@if (...)`, `@foreach (...)`, etc.), y los límites de bloques `@{ ... }`. Cuenta:

- Paréntesis `()`, brackets `[]`, llaves `{}`.
- Strings `'...'`, `"..."`.
- Template literals `` `...` `` con `${}` anidados.
- Comentarios `// ...` y `/* ... */`.
- Regex literals `/.../flags` (con detección contextual para distinguir de división).

Una vez localizado el límite, se pasa el substring a Oxc para parsing y validación del AST JS/TS.

### Pendientes para v2+

- `?.` optional chaining en expresión implícita (decisión 3).
- `!` non-null assertion TS en expresión implícita (decisión 4).
- Llamadas, índices `[...]` y genéricos en expresión implícita (decisiones 3, 5).
- `ref` con expresiones complejas o colecciones (decisión 30, 31).
- Modificadores de evento (decisión 27).
- Comentarios Razor dentro de attr list (decisión 35).
- Anidación de HTML dentro de `@{ ... }` (decisión 16).
- Múltiples `@server` / `@client` si el caso de uso lo justifica (decisión 33.b).

---

## Índice de decisiones

| # | Sección | Resumen |
|---|---------|---------|
| 1 | Transición `@` | `@@` → `@` literal |
| 2 | Transición `@` | Punto final no pertenece sin identificador |
| 3 | Transición `@` | Implícita = solo camino de propiedades (`?.`, llamadas, índices → explícita) |
| 4 | Transición `@` | `!` TS no soportado en implícita |
| 5 | Transición `@` | Genéricos `<T>` obligan a explícita |
| 6 | Transición `@` | Balanceador propio + Oxc para validar |
| 7 | Transición `@` | Heurística de email mantenida (`@@` precede al lookbehind: `a@@b` → `a@b`) |
| 8 | Transición `@` | Comillas obligatorias con `@` en atributos |
| 9 | Control flujo | `@else` y `else` ambas válidas; `case`/`default` siempre sin `@` |
| 10 | Control flujo | Whitespace y comentarios entre `}` y `else` |
| 11 | Control flujo | `@foreach` separado de `@for` |
| 12 | Control flujo | `for...in` rechazado en fase semántica (cabecera JS opaca) |
| 13 | Control flujo | Sin `@break` / `@continue` |
| 14 | Control flujo | `@switch` sin fall-through |
| 15 | Control flujo | Expresiones arbitrarias en `case` |
| 16 | Control flujo | `@{ ... }` solo JS, sin HTML anidado |
| 17 | Control flujo | Scope léxico para variables en `@{ ... }` |
| 18 | Interpolación | Escape HTML automático + `@raw` + `TrustedHTML` |
| 19 | Interpolación | Solo primitivas escalares |
| 20 | Interpolación | Atributos como concatenación uniforme |
| 21 | Interpolación | Atributos booleanos: falsy omite, truthy sin valor |
| 22 | Interpolación | `class:foo` / `style:foo` condicionales |
| 23 | Interpolación | Property binding exige `@...` |
| 24 | Interpolación | Property binding sin concatenación |
| 25 | Interpolación | Property binding case-sensitive |
| 26 | Interpolación | Handler como referencia o lambda |
| 27 | Interpolación | Sin modificadores de evento |
| 28 | Interpolación | Cualquier nombre de evento; `@evento` = host literal |
| 28.a | Interpolación | Prefijo `bus:` — suscriptor, listener en `document` |
| 28.b | Interpolación | `bus:literal` y `bus:(expr)` — dos formas del nombre |
| 28.c | Interpolación | (Semántica, SDD-12) Resolución a literal + matching por valor (`bus:`+`emit`) |
| 28.d | Interpolación | `@evento` (host) vs `bus:evento` (document), no inferido |
| 29 | Interpolación | (Consecuencia) `@` distingue por posición; `bus:` activa bus |
| 30 | Interpolación | `ref` solo identificador simple |
| 31 | Interpolación | `ref` en bucle → error |
| 32 | `@code` | `@server`/`@client` sintaxis Razor genuina |
| 33.a | `@code` | No anidación entre regiones |
| 33.b | `@code` | Máximo uno de cada región |
| 33.c | `@code` | Imports dentro de regiones, elevados en emit |
| 33.d | `@code` | Cero o un `@code` por componente |
| 34 | `@code` | Orden libre entre regiones |
| 63 | `@code` | ~~Estrategia de hidratación en `@client`~~ — **retirada de v1** (SDD-17) |
| 64 | `@code` | ~~Whitelist `eager/viewport/interaction/idle`~~ — **retirada de v1** |
| 65 | `@code` | ~~Default `interaction`~~ — **retirada de v1** |
| 66 | `@code` | Ni `@server` ni `@client` admiten parámetro |
| 35 | Comentarios | No en attr list |
| 36 | Comentarios | No anidables |
| 37 | Comentarios | No se emiten |
| 38 | HTML | Subset estricto |
| 39 | HTML | Void elements estándar HTML5 |
| 40 | HTML | Self-closing JSX-style permitido |
| 41 | HTML | Tag names alfanuméricos con guión |
| 41.b | HTML | Modo SVG/MathML |
| 42 | HTML | Razor en `<style>` activo |
| 42.a | HTML | Lista blanca de at-rules CSS |
| 42.b | HTML | Lista cerrada estricta |
| 42.c | HTML | Escape `@@` en CSS |
| 42.d | HTML | Razor en prelude y cuerpo de at-rules |
| 42.e | HTML | Nesting CSS nativo soportado |
| 43 | HTML | `<script>` raw puro, válvula de escape |
| 43.a | HTML | Atributos `<script>` sin restricción |
| 43.b | HTML | Múltiples `<script>` permitidos |
| 43.c | HTML | `<script>` sin restricción de modo |
| 44 | HTML | `disabled` y `disabled=""` equivalentes |
| 45 | HTML | Atributos duplicados → error |
| 46 | HTML | `:` en nombre de atributo |
| 47 | HTML | Orden de atributos preservado |
| 48 | HTML | Comentarios HTML se emiten |
| 49 | HTML | ~~Entities pass-through~~ — derogada por BUG-14: se decodifican en compilación |
| 50 | HTML | CDATA solo en SVG/MathML |
| 51 | HTML | Detección automática componente vs página |
| 52 | HTML | ~~Fragments en componente~~ — sustituida por 75 |
| 53 | Documento | Orden top-level estricto en componente |
| 54 | Documento | Cero o un `@code` |
| 55 | Documento | Múltiples `<link rel="component">` |
| 56 | Documento | Whitespace libre |
| 57 | Documento | Solo `<!DOCTYPE html>` |
| 58 | Documento | `<head>` y `<body>` obligatorios y en orden |
| 59 | Documento | `<link rel="component">` solo en `<head>` en página |
| 60 | Documento | `@code` en `<head>` en modo página |
| 61 | Documento | Orden en `<head>` recomendado no estricto |
| 62 | Documento | `<head>` en componente se eleva |
| 75 | Documento | Identidad: envoltorio host + `<template shadowrootmode>` (DSD) |
| 75.a | Documento | Un único `<template shadowrootmode="open">` (`closed` fuera de v1) |
| 76 | Documento | Un único `<style>` en head, sin `host` (atributo solo de output) |
| 77 | Documento | `<style>`/`<link>` dentro del template quedan inline |
| 78 | Documento | Las instancias en página no cambian; el DSD lo materializa el emit |
| 79 | Control flujo | El `}` crudo siempre cierra el bloque; llave literal vía `&#123;`/`&#125;` |
| 80 | Control flujo | Test de `case` corta en el 1.er `:` a profundidad 0 (delimitadores y ternario) |
| 81 | Layouts | La ruta es el 3.er rol de documento, declarado con `<link rel="layout" href>` |
| 82 | Layouts | Un layout se identifica por su forma (doctype + `@RenderBody()`), no por su nombre |
| 83 | Layouts | Orden top-level de la ruta; markup multi-raíz, sin envoltorio host |
| 84 | Layouts | `@RenderBody` / `@RenderHead` / `@RenderSection` / `@section`, ortografía de Razor |
| 85 | Layouts | Paréntesis obligatorios; `@RenderSection` toma identificador desnudo; sección ausente = silencio |
| 86 | Layouts | Cardinalidad: 1 `@RenderBody`, ≤1 `@RenderHead`, nombres de sección únicos |
| 87 | Layouts | Layouts anidados: cadena de dentro afuera; ciclo → error |
| 88 | Layouts | Cascada del `<head>` con orden determinista; gana la capa más interna |
| 89 | Layouts | En v1 el layout no declara `load`: recibe el `data` de la ruta |
| 90 | Layouts | `@section` exclusivo del par ruta↔layout; en componentes es `<slot>` |
