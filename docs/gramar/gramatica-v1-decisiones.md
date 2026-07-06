# Gramática v1 — Decisiones de diseño

Compendio de las decisiones tomadas durante la definición de la sintaxis Razor adaptada a JS/TS para el compilador. Sirve como referencia de implementación del parser. Numeración 1-62 (v1) + 63-66 (estrategia de hidratación en `@client`).

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
  | AT implicit_expression            // @foo.bar(x)
  ;
```

### Decisiones

**1.** `@@` → `@` literal (escape doble-arroba).

**2.** Punto final de frase no pertenece a expresión implícita si no le sigue identificador. `@foo.` emite `@foo` + `.`.

**3.** Optional chaining `?.` aceptado en expresión implícita (`@user?.name?.toUpperCase()`).

**4.** Non-null assertion TS `!` **no** soportado en expresión implícita. Si se necesita, usar explícita: `@(user!.name)`.

**5.** (Consecuencia, no decisión.) Genéricos TS en llamadas (`foo<T>(x)`) obligan a expresión explícita por el conflicto con `<` de HTML.

**6.** Delegación a Oxc en explícita: estrategia (a) — balanceador propio cuenta delimitadores (strings, templates, regex literals, comentarios) hasta el `)` de cierre, luego pasa el substring a Oxc para validar. Migración futura a (b) si Oxc expone modo de parsing de expresión con delimitador.

**7.** Heurística de email mantenida: si el `@` está precedido inmediatamente por carácter identificador (forma palabra con lo anterior), se trata como literal. Permite `user@dominio.com` en texto sin escape.

**8.** Atributos con `@` exigen comillas. `href=@url` es error; `href="@url"` correcto.

---

## Sección 6. Construcciones de control de flujo

Patrón general: keyword tras `@`, cabecera JS entre paréntesis cuando aplica, cuerpo entre llaves en modo HTML. El parser mantiene una pila de modos que alterna HTML ↔ JS en cada transición.

### Decisiones

**9.** `@else` y `else` ambas válidas. El parser acepta la forma sin `@` porque el contexto lo permite.

**10.** Entre `}` del `if` y `else` se permiten whitespace y comentarios `@* *@`.

**11.** `@foreach` separado de `@for`. Iteración declarativa (`for...of`) usa `@foreach`; iteración con índice usa `@for`.

**12.** `for...in` rechazado a nivel de sintaxis Razor. Si se necesita, dentro de `@{ ... }` con iteración manual.

**13.** Sin `@break` / `@continue` en sintaxis Razor. Si se necesita, dentro de `@{ ... }`.

**14.** `@switch` sin fall-through. Cada `case` es implícitamente independiente (semántica tipo Rust/C# moderno).

**15.** Expresiones arbitrarias permitidas en `case` (cualquier `js_expression`).

**16.** `@{ ... }` solo JS, sin HTML anidado en v1. Para emitir markup condicional, usar `@if`.

**17.** Variables declaradas en `@{ ... }` tienen scope léxico del bloque contenedor.

### Gramática de referencia

```
if_stmt
  : AT "if" WS* LPAREN js_expression RPAREN WS* html_block
    (WS* "else" WS+ "if" WS* LPAREN js_expression RPAREN WS* html_block)*
    (WS* "else" WS* html_block)?
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

switch_case
  : "case" WS+ js_expression WS* COLON html_content*
  | "default" WS* COLON html_content*
  ;

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

**28.** Cualquier nombre de evento aceptado, incluidos custom events (`@my-event`).

**29.** (Consecuencia, no decisión.) `@` en posición de nombre de atributo activa event binding; en posición de contenido/valor activa interpolación. El parser distingue por posición.

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

**63.** `@client` admite un parámetro opcional de estrategia de hidratación entre paréntesis: `@client(viewport) { ... }`. La estrategia es propiedad del código cliente (lo único hidratable), por lo que vive en su región, no en el binding de atributos ni a nivel documento.

**64.** `strategy_keyword` es un conjunto cerrado de cuatro keywords whitelisteadas: `eager`, `viewport`, `interaction`, `idle`. No es expresión JS, no se delega a Oxc: es un terminal resuelto por el parser (mismo patrón que la lista blanca de at-rules CSS, decisión 42.a). Keyword fuera de la lista → error de sintaxis.

**65.** `@client` sin paréntesis equivale a `@client(interaction)`. `interaction` es el default.

**66.** `@server` **no** admite parámetro. El servidor no se hidrata. `@server(...)` es error de sintaxis. Asimetría deliberada entre ambas regiones.

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
  : AT "client" hydration_strategy? WS* LBRACE js_statements RBRACE   {mode: js, env: client}
  ;

hydration_strategy
  : LPAREN WS* strategy_keyword WS* RPAREN
  ;

strategy_keyword
  : "eager" | "viewport" | "interaction" | "idle"
  ;
```

Nota: `server_region` no incluye `hydration_strategy` (decisión 66). El default de ausencia de `hydration_strategy` es `interaction` (decisión 65), resuelto en fase semántica, no sintáctica.

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

**49.** Entities HTML pass-through literal (lo que escribe el usuario es lo que va al output). Sin decodificación/re-escape.

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
> La numeración continúa aquí en 75.

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
invariante 68 (todos los shadows fudic son inspeccionables y adoptables desde el documento —
la adopción de `<style host>` y la hidratación dependen de `host.shadowRoot`); se revisará vía
`ElementInternals` si un caso lo justifica. Los demás atributos estándar de la template DSD
(`shadowrootdelegatesfocus`, etc.) pasan tal cual.

**76.** El `<head>`-fragment de un componente (decisión 62) admite **a lo sumo un** `<style>`,
y va **sin atributo**: esa hoja es, por definición, la hoja del host y su scope es el tag del
envoltorio (decisión 75). El atributo `host` **no existe en la sintaxis fuente** — escribirlo
es error. Es un marcador **del output**: al serializar, el emit eleva la hoja al head de la
página consumidora como `<style host="app-button">`, una sola vez por componente. Más de un
`<style>` en el `<head>` del componente → error.

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
        @if (expanded.value) { "Cerrar" } else { "Abrir" }
      </app-button>
    </article>
  </template>
</app-card>
```

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
- Default de estrategia: `@client` sin `hydration_strategy` se resuelve a `interaction` en fase semántica (decisión 65).

### Delegación a Oxc

El balanceador propio del parser entra en acción en las cabeceras de expresiones explícitas (`@(...)`), las cabeceras de estructuras de control (`@if (...)`, `@foreach (...)`, etc.), y los límites de bloques `@{ ... }`. Cuenta:

- Paréntesis `()`, brackets `[]`, llaves `{}`.
- Strings `'...'`, `"..."`.
- Template literals `` `...` `` con `${}` anidados.
- Comentarios `// ...` y `/* ... */`.
- Regex literals `/.../flags` (con detección contextual para distinguir de división).

Una vez localizado el límite, se pasa el substring a Oxc para parsing y validación del AST JS/TS.

### Pendientes para v2+

- `!` non-null assertion TS en expresión implícita (decisión 4).
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
| 3 | Transición `@` | `?.` aceptado en implícita |
| 4 | Transición `@` | `!` TS no soportado en implícita |
| 5 | Transición `@` | Genéricos `<T>` obligan a explícita |
| 6 | Transición `@` | Balanceador propio + Oxc para validar |
| 7 | Transición `@` | Heurística de email mantenida |
| 8 | Transición `@` | Comillas obligatorias con `@` en atributos |
| 9 | Control flujo | `@else` y `else` ambas válidas |
| 10 | Control flujo | Whitespace y comentarios entre `}` y `else` |
| 11 | Control flujo | `@foreach` separado de `@for` |
| 12 | Control flujo | `for...in` rechazado |
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
| 28 | Interpolación | Cualquier nombre de evento |
| 29 | Interpolación | (Consecuencia) `@` distingue por posición |
| 30 | Interpolación | `ref` solo identificador simple |
| 31 | Interpolación | `ref` en bucle → error |
| 32 | `@code` | `@server`/`@client` sintaxis Razor genuina |
| 33.a | `@code` | No anidación entre regiones |
| 33.b | `@code` | Máximo uno de cada región |
| 33.c | `@code` | Imports dentro de regiones, elevados en emit |
| 33.d | `@code` | Cero o un `@code` por componente |
| 34 | `@code` | Orden libre entre regiones |
| 63 | `@code` | `@client(estrategia)` parámetro de hidratación |
| 64 | `@code` | `strategy_keyword` whitelist cerrada (eager/viewport/interaction/idle) |
| 65 | `@code` | `@client` sin paréntesis ≡ `@client(interaction)` |
| 66 | `@code` | `@server` no admite parámetro (asimetría) |
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
| 49 | HTML | Entities pass-through |
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
