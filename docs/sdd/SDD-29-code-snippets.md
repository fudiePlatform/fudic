# SDD-29 — Snippets de markup reutilizables (`@snippet` / `@render`)

> **Estado:** `Listo`
> **Depende de:** SDD-05 (parser HTML), SDD-06 (control de flujo), SDD-10 (estructura del documento), SDD-11 (Oxc), SDD-12 (semántica)
> **Decisiones de gramática ancladas:** 6, 41, 45, 53, 55, 62

---

## 1. Contexto y objetivo

Especificar una construcción de **reutilización de markup sin composición**: una
declaración con nombre y firma tipada cuyo cuerpo es markup, y una invocación que
**expande ese markup en el punto de llamada durante la construcción del AST**.

Un snippet no es un componente. No tiene host, no tiene shadow root, no tiene identidad
de instancia, no aparece en el árbol de composición, no recibe `data-fud-id` y no existe en
runtime. Su única razón de ser es **no repetir markup**: lo que hoy se resuelve con
copy-paste entre ficheros.

La propiedad que define todo el resto: **el snippet desaparece al construirse el AST**.
Tras la expansión, el árbol del llamante es indistinguible del que se habría obtenido
escribiendo el markup a mano en ese sitio. Todas las fases posteriores del pipeline
—análisis semántico (SDD-12), inferencia de nivel, emit— no ven snippets. Ven markup.

Este SDD cubre la declaración, la importación, la resolución, la expansión y los
diagnósticos asociados.

---

## 2. Dependencias

| SDD | Interfaz que aporta |
|---|---|
| **05** — Parser HTML | Modo `html`, nodos de elemento/texto/atributo, `<link>` como elemento normal. |
| **06** — Control de flujo | Patrón `AT keyword ... LBRACE html_block RBRACE` con pila de modos. `@snippet` reutiliza esa forma sin ampliarla. |
| **10** — Estructura del documento | Recolección de nodos top-level y resolución de `<link rel="component">` en compile time con orden topológico. Este SDD añade un `rel` más al mismo resolutor. |
| **11** — Oxc | Parseo de la firma de parámetros y de las expresiones de argumento, en el buffer sintético único por fichero con tabla de regiones. |
| **12** — Semántica | Fase donde viven los diagnósticos que no son detectables en parse puro (recursión, colisión de nombres, aridad). |

No depende de ningún runtime. El snippet no llega a runtime.

---

## 3. Interfaz pública

### 3.1. Nodos de AST

```ts
/** Declaración top-level. Sobrevive solo hasta la fase de expansión. */
interface SnippetDecl {
  kind: 'SnippetDecl';
  span: Span;
  /** Identificador del snippet. Reglas de nombre en §4.1. */
  name: Identifier;
  /** Lista de parámetros, parseada por Oxc como firma TS. */
  params: SnippetParam[];
  /** Span de la firma completa, paréntesis incluidos. */
  signatureSpan: Span;
  /** Cuerpo en modo html. Mismo tipo de contenido que un html_block. */
  body: HtmlContent[];
}

interface SnippetParam {
  span: Span;
  name: Identifier;
  /** Anotación de tipo TS, tal cual la escribió el usuario. Puede faltar. */
  typeAnnotation?: OxcTypeNode;
  /** Valor por defecto. Expresión JS. Puede faltar. */
  defaultValue?: OxcExpression;
  /** `true` si el parámetro se declaró con `?`. */
  optional: boolean;
}

/** Invocación. Sustituida por markup en la fase de expansión. */
interface RenderCall {
  kind: 'RenderCall';
  span: Span;
  /** Namespace opcional (`@render form.card(...)`). */
  namespace?: Identifier;
  name: Identifier;
  args: RenderArg[];
}

type RenderArg = PositionalArg | NamedArg;

interface PositionalArg {
  kind: 'PositionalArg';
  span: Span;
  value: OxcExpression;
}

interface NamedArg {
  kind: 'NamedArg';
  span: Span;
  name: Identifier;
  value: OxcExpression;
}
```

### 3.2. Tabla de snippets y expansor

```ts
/** Snippets visibles desde un documento, tras resolver sus <link rel="snippet">. */
interface SnippetScope {
  /** Snippets sin namespace: los declarados en el propio fichero + los importados sin `as`. */
  global: Map<string, ResolvedSnippet>;
  /** Snippets bajo namespace: clave = valor de `as`. */
  namespaced: Map<string, Map<string, ResolvedSnippet>>;
}

interface ResolvedSnippet {
  decl: SnippetDecl;
  /** Fichero de origen. Necesario para que los diagnósticos apunten al sitio correcto. */
  sourceFile: string;
  /** `<link rel="component">` que este snippet arrastra al llamante (§4.5). */
  componentDeps: ComponentLink[];
}

/**
 * Sustituye cada RenderCall del árbol por el markup del snippet correspondiente.
 * Nunca lanza: ante error emite Diagnostic y deja el RenderCall sin expandir
 * (nodo inerte que el emit ignora).
 */
function expandSnippets(
  tree: HtmlContent[],
  scope: SnippetScope,
  diagnostics: Diagnostic[],
): HtmlContent[];
```

---

## 4. Comportamiento

### 4.1. Declaración

```
snippet_decl
  : AT "snippet" WS+ IDENT WS* LPAREN snippet_signature RPAREN WS* html_block
  ;
```

- **Posición libre.** `@snippet` es un nodo top-level y puede aparecer en cualquier punto
  de la zona top-level, antes o después de `@code`, entre `<link>`, o tras el markup. La
  decisión 53 (orden estricto `<link>` → `@code` → markup) **no se extiende** a
  `@snippet`: la recolección de declaraciones es una pasada sobre los nodos top-level y
  el orden no aporta información al parser ni al LSP.
- **Nombre:** `[a-zA-Z_][a-zA-Z0-9_]*`. No admite guiones (a diferencia de los tag names,
  decisión 41): un nombre con guión sería ambiguo frente a una resta en la cabecera de
  `@render`.
- **Firma:** delegada a Oxc como lista de parámetros TypeScript. Se admite todo lo que
  TypeScript admite en una lista de parámetros: anotaciones de tipo, uniones,
  opcionales (`?`), valores por defecto, destructuring. **Sin `function`, sin `return`,
  sin tipo de retorno.** Un snippet no devuelve un valor; produce markup.
- **Cuerpo:** `html_block` en modo `html`, idéntico al cuerpo de un `@if` (SDD-06).
- **Los parámetros son el único scope declarativo del cuerpo.** No hay `@code` dentro de
  un snippet, luego no hay más identificadores que los parámetros y lo que resuelva el
  scope del punto de expansión (§4.7).

Ejemplo canónico:

```fud
@snippet card(title: string, variant: 'a' | 'b' = 'a') {
  <article class="card @variant">
    <h2>@title</h2>
  </article>
}
```

### 4.2. Qué puede contener el cuerpo

Permitido:

- Markup (subset estricto HTML, decisión 38).
- Interpolación y bindings completos (decisiones 18–31): `@param`, `attr="@expr"`,
  `.prop="@expr"`, `@click="@handler"`, `class:foo`, `style:foo`.
- Control de flujo: `@if`, `@foreach`, `@for`, `@while`, `@switch` (decisiones 9–17).
- Bloques `@{ ... }` y comentarios `@* *@`.
- Instanciación de componentes (§4.5).
- `@render` de otros snippets (§4.6).

Prohibido, con error de compilación y span en el nodo infractor:

- **`<style>`.** Un snippet no aporta CSS y no participa en el cascade del `<head>`
  (decisión 62). El caso "snippet de CSS" es un problema distinto y queda fuera (§7).
- **`@code`.** Un snippet no tiene estado propio ni entorno de ejecución. No hay zona
  neutra, ni `@server`, ni `@client`.
- **`<head>`** como nodo del cuerpo.
- **`@snippet` anidado.** Las declaraciones son top-level; un snippet no declara otro.

De la prohibición de `@code` se sigue la propiedad relevante para la inferencia de nivel:
**un snippet no crea reactividad**. No puede instanciar una signal porque no puede
declarar nada. Toda la reactividad que aparezca en el markup expandido procede de los
argumentos, es decir, del llamante, que ya la tenía. El snippet no sube el nivel efectivo
de nadie; lo hereda del sitio donde aterriza.

### 4.3. Importación

```
<link rel="snippet" href="./ui-helpers.fud">
<link rel="snippet" href="./form-helpers.fud" as="form">
```

- **Grano: fichero entero.** No hay importación selectiva. Todos los `@snippet`
  declarados en el fichero referenciado quedan disponibles en el llamante.
- **Sin `as`:** los nombres entran en `SnippetScope.global`.
- **Con `as`:** entran en `SnippetScope.namespaced[as]` y se invocan como
  `@render form.card(...)`.
- **`as` no se infiere.** A diferencia de `<link rel="component">`, donde `as` renombra el
  tag y se deriva del filename si falta, aquí `as` significa exclusivamente *namespace*.
  Sin `as` no hay namespace. Mismo atributo, semántica distinta según el `rel`; es
  deliberado y debe documentarse en la guía del lenguaje.
- **Resolución en compile time**, orden topológico, el `<link>` se consume y no aparece en
  el output (mismo tratamiento que `rel="component"`, decisión 62).
- Múltiples `<link rel="snippet">` permitidos sin restricción numérica (análogo a la
  decisión 55).

### 4.4. Colisión de nombres

- Dos snippets con el mismo nombre en `SnippetScope.global` (procedan de dos ficheros
  importados, o de un fichero importado y del propio documento) → **error de
  compilación**, con span en el segundo `<link rel="snippet">` (o en la segunda
  declaración) y span secundario apuntando al primero.
- Un nombre bajo namespace nunca colisiona con el mismo nombre global ni con el mismo
  nombre bajo otro namespace.
- La colisión se resuelve poniendo `as` en uno de los `<link>`.

### 4.5. Dependencias de componente arrastradas

Un snippet puede instanciar componentes. Declara sus propios `<link rel="component">` en
su fichero, y **el compilador los arrastra al llamante al expandir**, con deduplicación.
El llamante no declara nada.

```fud
<!-- ui-helpers.fud -->
<link rel="component" href="./app-button.fud">

@snippet accion(texto: string) {
  <app-button>@texto</app-button>
}
```

```fud
<!-- page.fud — no declara app-button y aun así funciona -->
<link rel="snippet" href="./ui-helpers.fud">
@render accion("Guardar")
```

- La deduplicación usa la misma clave que el cascade del `<head>` (decisión 62): dos
  `<link rel="component">` al mismo `href` resuelto son uno.
- **Solo se arrastran las dependencias de los snippets efectivamente invocados.** Un
  fichero de snippets con veinte declaraciones del que se usa una no mete diecinueve
  componentes en el bundle del llamante.
- La validación "custom element usado sin `<link rel="component">`" (decisión 41) se
  evalúa **después** de la expansión y del arrastre, sobre el árbol final.

### 4.6. Snippets que invocan snippets

Un snippet puede declarar `<link rel="snippet">` e invocar otros snippets. Se arrastran
igual que las dependencias de componente, transitivamente.

**Recursión prohibida, directa e indirecta.** El expansor mantiene una pila de expansión;
si el snippet a expandir ya está en la pila, emite error de compilación con el ciclo
completo (`card → row → card`) y deja el `RenderCall` sin expandir. La detección es
obligatoria: sin ella, la recursión es un bucle infinito en tiempo de compilación, no un
error en runtime.

### 4.7. Invocación

```
render_call
  : AT "render" WS+ (IDENT DOT)? IDENT WS* LPAREN render_args? RPAREN
  ;

render_args
  : positional_arg (COMMA positional_arg)*
    (COMMA named_arg)*
  | named_arg (COMMA named_arg)*
  ;

positional_arg
  : js_expression
  ;

named_arg
  : IDENT WS* COLON WS* js_expression
  ;
```

- **Keyword explícito obligatorio.** `@render nombre(...)`, nunca `@nombre(...)`. La forma
  sin keyword es indistinguible de una expresión implícita (llamada a función JS,
  decisión 7 y siguientes) y obligaría a aplazar a fase semántica una decisión que cambia
  el tipo de nodo: una expresión implícita interpola un escalar, un `@render` inyecta un
  árbol de markup. Además hace parseables los argumentos nominales, que en una expresión
  JS serían asignaciones sintácticamente válidas y producirían errores mal ubicados.
- **Argumentos posicionales primero, nominales después.** Un posicional tras un nominal es
  error de compilación.
- **Separador nominal `:`**, no `=`. No puede confundirse con una asignación y se lee
  igual que la firma al otro lado.
- **Sin `@` en los argumentos.** El `@` de `@render` ya realizó la transición a modo JS,
  exactamente como en `@if (cond)` y `@foreach (const x of xs)`. Un `@` dentro de la
  cabecera es error. (Los atributos exigen `@` porque su valor por defecto es texto
  literal; aquí no hay texto literal por defecto.)
- **Los argumentos son expresiones JS evaluadas en el scope del punto de expansión.**
  Cualquier valor: literal, variable local, variable de un `@foreach`, propiedad de
  objeto, signal. No hay frontera que cruzar porque el markup aterriza en ese mismo
  scope.

Errores de invocación (fase semántica, SDD-12):

| Caso | Diagnóstico |
|---|---|
| Snippet no encontrado en `SnippetScope` | error, span en el nombre |
| Namespace no declarado | error, span en el namespace |
| Aridad insuficiente (falta un parámetro sin default y sin `?`) | error, span en la llamada |
| Argumentos de más | error, span en el primer sobrante |
| Nominal que no corresponde a ningún parámetro | error, span en el nombre del argumento |
| Parámetro recibido dos veces (posición + nombre) | error, span en el nominal, secundario en el posicional |
| Posicional tras nominal | error, span en el posicional |
| `@` dentro de la cabecera | error, span en el `@` |

El chequeo de **tipos** de los argumentos contra la firma no lo hace el compilador: lo
hace TypeScript sobre los ficheros virtuales proyectados (SDD-23). El compilador valida
forma y aridad; el tipo es responsabilidad de `tsc` y del language server.

### 4.8. Expansión

La expansión ocurre **al construir el AST**, antes del análisis semántico.

1. Recolectar las `SnippetDecl` del documento y resolver los `<link rel="snippet">`
   (transitivamente) para construir el `SnippetScope`.
2. Recorrer el árbol. Por cada `RenderCall`:
   a. Resolver el snippet. Si falla → diagnóstico, nodo inerte, continuar.
   b. Comprobar la pila de expansión (recursión).
   c. Ligar argumentos a parámetros: posicionales por orden, nominales por nombre,
      defaults para los ausentes.
   d. Clonar el cuerpo del snippet sustituyendo cada referencia a un parámetro por la
      expresión del argumento correspondiente.
   e. Expandir recursivamente los `@render` que contenga el cuerpo.
   f. Sustituir el `RenderCall` por los nodos resultantes.
   g. Registrar las `componentDeps` para el arrastre.
3. Aplicar el arrastre de `<link rel="component">` con deduplicación.
4. Eliminar las `SnippetDecl` del árbol. **No aparecen en el output ni participan en
   ninguna fase posterior.**

Tras el paso 4, el árbol no contiene ningún nodo `SnippetDecl` ni `RenderCall`.

### 4.9. Tipo de fichero

Un fichero de snippets es un `.fud`. No hay extensión propia: una extensión nueva
obligaría a un `languageId` en VS Code, una entrada en el `documentSelector` de Volar
(SDD-24), una proyección adicional en el emisor de ficheros virtuales (SDD-23) y una rama
en el formatter (SDD-26), todo para una gramática que es un subconjunto estricto de la que
ya se parsea.

**Snippet es un tipo de fichero del framework**, junto a layout, route y component. La
clasificación es explícita por el tipo, no una heurística sobre el contenido.

---

## 5. Invariantes LSP

- **Spans en todo.** `SnippetDecl`, `SnippetParam`, `RenderCall`, `PositionalArg`,
  `NamedArg` llevan `Span`. La firma lleva `signatureSpan` propio.
- **El expansor nunca lanza.** Ante snippet no encontrado, recursión, aridad incorrecta o
  ciclo de importación: diagnóstico con span y `RenderCall` inerte. El árbol sigue siendo
  navegable.
- **Provenance de la expansión.** Cada nodo producido por una expansión conserva
  referencia a (a) su span en el fichero de origen del snippet y (b) el span del
  `RenderCall` que lo generó. Sin esto, un error dentro del cuerpo de un snippet importado
  se reporta en el fichero equivocado y el go-to-definition no funciona.
- **Navegabilidad por offset.** Un offset dentro de una cabecera de `@render` resuelve al
  argumento correspondiente; un offset dentro del nombre resuelve a la `SnippetDecl`, que
  puede estar en otro fichero. Go-to-definition cruza ficheros.
- **El `<link rel="snippet">` es un edge del grafo de dependencias del documento.**
  Modificar un fichero de snippets invalida a todos sus consumidores; el servidor debe
  reparsearlos.

---

## 6. Criterios de aceptación

### 6.1. Declaración y expansión básica

1. `@snippet card(title: string) { <article><h2>@title</h2></article> }` parsea a un
   `SnippetDecl` con un parámetro tipado y cuerpo de un elemento.
2. `@render card("Hola")` en el mismo fichero expande al markup del cuerpo con
   `@title` sustituido por `"Hola"`.
3. Tras la expansión, el árbol **no contiene** ningún `SnippetDecl` ni `RenderCall`.
4. El resultado es **idéntico nodo a nodo** al que produce el mismo markup escrito
   literalmente en esa posición.

### 6.2. Firma

5. Parámetro con default (`variant: 'a' | 'b' = 'a'`): invocación sin ese argumento usa
   el default.
6. Parámetro opcional (`subtitle?: string`): invocación sin ese argumento no es error.
7. Parámetro sin default y no opcional ausente en la llamada → error de aridad con span
   en la llamada.
8. `@snippet card(function title: string)` → error de parseo de firma, span dentro de la
   firma, mapeado desde la región de Oxc.

### 6.3. Argumentos

9. `@render card("A", variant: 'b')` — mezcla posicional + nominal, válida.
10. `@render card(variant: 'b', "A")` — posicional tras nominal → error.
11. `@render card("A", title: "B")` — parámetro asignado dos veces → error con span
    primario en el nominal y secundario en el posicional.
12. `@render card(tone: 'x')` sobre una firma sin `tone` → error, span en el nombre del
    argumento.
13. `@render card(@title)` → error por `@` en la cabecera, span en el `@`.
14. `@render card(p.title)` dentro de `@foreach (const p of items)` expande con `p`
    resuelto en el scope del bucle.
15. `@render card(sig)` donde `sig` es una signal del `@client` del llamante: expande sin
    error; el markup resultante interpola la signal y la inferencia de nivel posterior
    trata el resultado exactamente igual que si estuviera escrito a mano.

### 6.4. Importación

16. `<link rel="snippet" href="./ui.fud">` hace disponibles todos los `@snippet` del
    fichero por su nombre.
17. Con `as="form"`, se invocan como `@render form.card(...)` y **no** como
    `@render card(...)` (segundo caso → error de snippet no encontrado).
18. Dos ficheros sin `as` que declaran `card` → error de colisión, span en el segundo
    `<link>`, secundario en el primero.
19. Con `as` en uno de ellos, no hay colisión y ambos son invocables.
20. Los `<link rel="snippet">` se consumen: no aparecen en el HTML de salida.

### 6.5. Arrastre de dependencias

21. Snippet que instancia `<app-button>` y declara su `<link rel="component">`: el
    llamante compila sin declararlo, y `app-button` aparece resuelto en el árbol final.
22. Llamante y snippet declaran el mismo componente: un solo `<link>` tras la
    deduplicación.
23. Fichero de snippets con dos snippets que usan componentes distintos; el llamante
    invoca solo uno: **solo** se arrastra la dependencia de ese.

### 6.6. Anidamiento y recursión

24. Snippet A que hace `@render b(...)` de un snippet importado: expande en dos niveles
    correctamente.
25. Snippet que se invoca a sí mismo → error de recursión directa, con el ciclo en el
    mensaje.
26. Ciclo `a → b → a` → error de recursión indirecta, con el ciclo completo.
27. Ninguno de los dos casos anteriores cuelga el compilador ni desborda la pila.

### 6.7. Restricciones de cuerpo

28. `<style>` dentro de un `@snippet` → error, span en el `<style>`.
29. `@code` dentro de un `@snippet` → error, span en el `@code`.
30. `@snippet` anidado dentro de otro → error.
31. `@if` / `@foreach` dentro del cuerpo: permitidos, expanden correctamente.

### 6.8. Posición y LSP

32. `@snippet` declarado antes de `<link>`, entre `<link>` y `@code`, y después del
    markup: los tres casos parsean sin error y resuelven igual.
33. Go-to-definition desde un `@render` sobre un snippet importado abre el fichero de
    origen en el span de la declaración.
34. Un error dentro del cuerpo de un snippet importado se reporta **en el fichero del
    snippet**, no en el punto de expansión, con referencia al `RenderCall` que lo
    provocó.
35. Hover sobre el nombre en `@render` muestra la firma completa del snippet.

---

## 7. Fuera de alcance

- **Snippets de CSS.** Reutilizar bloques de CSS repetidos (p. ej. un `:host { display:
  block }` común) es un problema reconocido pero distinto: afecta al cascade del `<head>`
  y a la arquitectura de hojas compartidas (SDD-18). Aparcado.
- **Markup como argumento.** Un snippet no recibe hijos ni fragmentos de markup. No hay
  slots, no hay `RenderFragment`. Los argumentos son valores.
- **Snippet como valor de runtime.** No se puede almacenar, pasar a una función JS ni
  invocar dinámicamente. El nombre en `@render` es un identificador estático resuelto en
  compile time.
- **Importación selectiva** (`<link rel="snippet" only="card,badge">`). Grano de fichero.
- **Chequeo de tipos de los argumentos.** Lo hace TypeScript sobre los ficheros virtuales
  (SDD-23), no el compilador.
- **Formateo del cuerpo de snippets.** El formatter (SDD-26) trata el cuerpo como
  `html_block`; no hay reglas específicas aquí.

---

## 8. Registro de decisiones

| # | Decisión |
|---|---|
| 1 | Un snippet es markup y solo markup. Se expande al construir el AST y desaparece. |
| 2 | Sin `<style>` y sin `@code`. Un snippet no crea reactividad propia; no induce nivel en el llamante. |
| 3 | Control de flujo permitido en el cuerpo. |
| 4 | Un snippet puede instanciar componentes y arrastra sus `<link rel="component">` al llamante, con deduplicación y solo para los snippets invocados. |
| 5 | Un snippet puede importar otros snippets; los arrastra transitivamente. |
| 6 | Recursión prohibida, directa e indirecta. Detección obligatoria por pila de expansión. |
| 7 | Importación por `<link rel="snippet" href="…">`, grano de fichero entero. |
| 8 | `as` en `rel="snippet"` significa exclusivamente namespace. No se infiere. Colisión sin namespace es error. |
| 9 | Declaración `@snippet nombre(firma) { markup }`, top-level, posición libre. |
| 10 | Firma TypeScript solo en los parámetros. Sin `function`, sin `return`, sin tipo de retorno. Opcionales y defaults por herencia del lenguaje. |
| 11 | Invocación `@render nombre(args)` con keyword explícito obligatorio. |
| 12 | Posicionales primero, nominales después con separador `:`. Doble asignación a un parámetro es error. |
| 13 | Sin `@` en los argumentos de `@render`: la transición a modo JS ya la hizo el `@render`. |
| 14 | Argumentos: expresiones JS evaluadas en el scope del punto de expansión. Cualquier valor, signal incluida. |
| 15 | Extensión `.fud`. Snippet es un tipo de fichero del framework, junto a layout, route y component. |
