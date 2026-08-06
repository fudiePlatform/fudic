# BUG-14 — El texto literal del autor no llega intacto al output

> **Estado:** `Hecho`
> **Corrige:** [SDD-05 — Parser HTML](../SDD-05-parser-html.md) ·
> [SDD-15 — Emit](../SDD-15-emit.md) §4.4 ·
> [gramática](../../gramar/gramatica-v1-decisiones.md) decisiones 1 y 49
> **Paquetes:** `@fudic/compiler` · `@fudic/ssr`
> **Rama sugerida:** `fix/bug-14-texto-literal`
> **Independiente de BUG-12 y BUG-13:** ni un fichero en común.

---

## 1. Contexto y síntoma

Dos formas de escribir un carácter en el markup, las dos rotas, y las dos visibles **hoy**
en `main`. Fuente ([`examples/basic/routes/about.fud:22,27`](../../../examples/basic/routes/about.fud#L22)):

```html
<code>@@server load</code>
<code>&lt;html&gt;</code>
```

`dist/about/index.html`, tras `pnpm build`:

```html
<code>server load</code>              <!-- la @ desapareció -->
<code>&amp;lt;html&amp;gt;</code>      <!-- el lector ve  &lt;html&gt;  en pantalla -->
```

| Escrito | Debe verse | Se ve |
|---|---|---|
| `@@server` | `@server` | `server` |
| `&lt;html&gt;` | `<html>` | `&lt;html&gt;` |

Medido también sobre el emit, aislado del ejemplo: `@@count` en contenido produce el nodo
de texto `"count"`, y `&lt;tag&gt;` produce el nodo `"&lt;tag&gt;"` que el serializador
convierte en `&amp;lt;tag&amp;gt;`.

**Un documento no puede documentar la sintaxis del framework en el que está escrito.** Es
el caso de uso que lo destapa, y no es marginal: cualquier página que enseñe código lo pisa.

---

## 2. Causa raíz

Son dos defectos distintos con la misma consecuencia. Van juntos porque los dos son *texto
literal del autor que no sobrevive al emit*, y porque los dos se arreglan en el mismo sitio:
cómo se construye el dato de un nodo de texto.

### 2.1. `@@` en contenido: el nodo se parsea y no lo emite nadie

El lexer produce el token ([`lexer.ts:336`](../../../packages/compiler/src/lexer/lexer.ts#L336))
y el parser lo convierte en `AtEscapeNode`
([`parser.ts:219-221`](../../../packages/compiler/src/html/parser.ts#L219-L221)) — un nodo
**sin payload**: solo tipo y span ([`at.ts:47-49`](../../../packages/compiler/src/at/at.ts#L47-L49)).

En un **valor de atributo** el mismo token se resuelve al carácter que denota, y está bien
resuelto ([`parser.ts:472-476`](../../../packages/compiler/src/html/parser.ts#L472-L476)):

```ts
case 'at-escape':
  // `@@` means one literal `@` (decision 1). AttributeValuePart has no escape
  // node, so it resolves here to the character it denotes.
  parts.push({ type: 'attribute-text', span: token.span, value: '@' });
```

En **contenido** no lo resuelve nadie:

```sh
grep -rn "at-escape" packages/compiler/src/emit/*.ts
#=> (vacío)
```

Ningún emisor lo lee. El nodo no es un run de texto, así que al construir los runs se salta
entero y el `@` no llega a ninguna salida — ni SSR, ni chunk de cliente. El texto de
alrededor sí llega, que es por lo que el síntoma parece un carácter perdido y no un nodo
perdido.

La decisión 1 dice *«`@@` ⇒ una `@` literal en el output»*. Se cumple en atributos y se
incumple en contenido, con el código del caso correcto tres líneas más abajo del roto.

### 2.2. Entidades: `verbatim` en el AST, escapado otra vez en el serializador

La decisión 49 —*«Entities HTML pass-through literal. Sin decodificación/re-escape»*— está
implementada a medias, y la mitad que falta es la que se ve:

- **No se decodifica**, y así está escrito en el tipo:
  [`html/nodes.ts:80`](../../../packages/compiler/src/html/nodes.ts#L80) —
  *«Literal text run. Verbatim: no entity decoding/re-escaping (decision 49)»*. El nodo de
  texto lleva los seis caracteres `&`,`l`,`t`,`;`… tal cual.
- **Pero sí se re-escapa**, un paso después:
  [`serialize.ts:49`](../../../packages/ssr/src/serialize.ts#L49) hace `yield escapeText(n.data)`,
  que convierte ese `&` en `&amp;`.

Verbatim + escapado no es verbatim. La segunda mitad de la decisión 49 la incumple el
serializador.

### 2.3. Y `escapeText` no se puede quitar sin más

Es lo que hace que este BUG no sea de una línea. `escapeText` está ahí por seguridad: el
dato de un nodo de texto puede venir de una **interpolación** (`@(userInput)`), y si el
serializador dejara de escapar, una interpolación podría inyectar markup. En el camino de
página eso ya se escapa en el emit ([`parts.ts:79`](../../../packages/compiler/src/emit/parts.ts#L79),
`escapeText(String((…) ?? ''))`), pero en el camino de componente el escape **solo** ocurre
al serializar.

Hay además una asimetría que decide el diseño, y que decisión 49 no vio: **el cliente no
tiene serializador**. Un nodo creado con `$dom.text(data)` acaba en `textContent`, y
`textContent` **no interpreta entidades**. Con el dato verbatim, la misma plantilla pinta
`<html>` por SSR y `&lt;html&gt;` tras hidratar. El pass-through literal es coherente en un
compilador que solo emite texto; deja de serlo en cuanto la otra mitad construye DOM.

### 2.4. Alcance

- **Todo `.fud` con `@@` en contenido** y **todo `.fud` con entidades en texto**. En el repo:
  `examples/basic/routes/about.fud` y las páginas de demostración de BUG-12.
- **Las dos salidas**: HTML prerenderizado y chunk de cliente.
- **Los atributos NO están afectados** por 2.1 (ahí sí se resuelve) y **sí** por el fondo de
  2.2, que hay que comprobar aparte (§6.6).
- **El CSS no está afectado por 2.1**: `css.ts:225` produce el mismo nodo, pero el emit de
  CSS sí lo saca verbatim (BUG-08 lo dejó explícito).

---

## 3. Interfaz pública

### 3.1. `@@` se resuelve donde ya se resuelve para atributos

Ninguna firma cambia. El `AtEscapeNode` de contenido deja de perderse: al construir los runs
de texto contribuye el carácter `@`, exactamente como
[`parser.ts:472-476`](../../../packages/compiler/src/html/parser.ts#L472-L476) hace en un
valor de atributo. El nodo se queda en el AST con su span, que es lo que el LSP y el
formateador necesitan.

### 3.2. Decisión 49, corregida: se decodifica en compilación

**Se deroga el «pass-through literal»** y se sustituye por la regla que las dos salidas
pueden cumplir a la vez:

> El dato de un nodo de texto es **texto**, no markup: las entidades del fuente se decodifican
> en compilación. Cada salida lo vuelve a codificar como su medio exige — el serializador
> escapa, el DOM no necesita hacerlo.

Con eso, `&lt;` es un `<` en el AST, el serializador lo emite como `&lt;` y el cliente lo
mete en `textContent` como `<`. **Las dos pintan lo mismo**, que es la invariante que ya
verifica `equivalence.test.ts`.

`escapeText` **se queda tal cual** en `serialize.ts`: es la línea que impide que una
interpolación inyecte markup, y este BUG no la toca.

---

## 4. Comportamiento corregido

### 4.1. Lo que el autor escribe es lo que el lector ve

La regla, corta: **el fuente se escribe en HTML y el lector ve lo que ese HTML significa.**
`&lt;` es un menor-que, `@@` es una arroba. No hay una tercera capa de escapado que el autor
tenga que anticipar.

### 4.2. La seguridad no cambia de sitio

Texto literal del autor y valor interpolado son cosas distintas y se tratan distinto: el
primero se decodifica en compilación y se re-codifica al serializar; el segundo se escapa,
como hoy. Un `.fud` es código fuente confiable; el dato que pasa por él, no.

### 4.3. El cliente y el servidor pintan el mismo carácter

Consecuencia directa de §3.2 y la razón de elegirla frente a mantener el verbatim: sin
decodificar, SSR e hidratación divergen en cuanto hay una entidad, y eso es un fallo de
hidratación silencioso.

---

## 5. Invariantes

**Los que el bug violaba**

- ***Decisión 1: `@@` ⇒ una `@` literal en el output.*** Cumplida en atributos, incumplida en
  contenido.
- ***Decisión 49: sin re-escape.*** El serializador re-escapa.
- ***SSR y cliente pintan lo mismo.*** Con una entidad en el texto, no.

**Los que la corrección añade**

- **El dato de un nodo de texto es texto, nunca markup a medio escapar.**
- **Todo token que el lexer produce tiene un consumidor en el emit.** `at-escape` en
  contenido no lo tenía, y nada lo detectaba.

---

## 6. Criterios de aceptación

Tests en `packages/compiler/test/` y `packages/ssr/test/`.

1. **(rojo primero)** `@@server` en contenido produce el texto `@server` en el módulo SSR y
   en el chunk de cliente.
2. **(rojo primero)** `&lt;html&gt;` en contenido produce el HTML `&lt;html&gt;` —una sola
   vez escapado— y, tras hidratar, el mismo `<html>` en pantalla.
3. **(rojo primero, extremo a extremo)** `dist/about/index.html` contiene `@server load` y
   `&lt;html&gt;`, no `server load` ni `&amp;lt;`.
4. Una interpolación con `<script>` **sigue** escapándose: `escapeText` no ha perdido su
   trabajo (§4.2). Es el test que impide que este BUG abra un agujero.
5. La equivalencia SSR↔cliente sigue verde, y se le añade un caso con entidad y con `@@`.
6. Un valor de atributo con `@@` y con entidad se comporta igual que el contenido: mismo
   carácter en el HTML final.
7. El CSS sigue sacando `@@` verbatim (BUG-08 §4): esta corrección no toca esa rama.
8. Los goldens de los fixtures no se mueven salvo donde haya `@@` o entidades; si no hay
   ninguno, **no cambia un byte**.

**Cobertura.** `parser.ts`, `runs.ts` y `serialize.ts` no bajan de ramas; lo nuevo nace al
100 %.

---

## 7. Fuera de alcance

- **Reescribir `escapeText`** o cambiar qué escapa. Se queda.
- **Entidades en CSS, en un `<style>` o dentro de una expresión.** Otra rama, otro BUG si
  aparece.
- **Soportar el catálogo completo de entidades con nombre de HTML5** (~2.200). El subset
  estricto (decisión 38) fija el mínimo: las cinco de XML (`&lt; &gt; &amp; &quot; &apos;`)
  más las numéricas (`&#…;`, `&#x…;`). Una entidad fuera del subset es un diagnóstico, no una
  tabla de 2.200 entradas metida en el compilador.
- **Corregir el texto de `about.fud`.** No hay nada que corregir: está bien escrito, y es el
  test de aceptación §6.3.
