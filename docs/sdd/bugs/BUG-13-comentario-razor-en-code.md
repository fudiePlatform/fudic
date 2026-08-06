# BUG-13 — Un comentario Razor dentro de `@code` borra todo el bloque

> **Estado:** `Listo`
> **Corrige:** [SDD-08 — Bloque `@code`](../SDD-08-code-block.md) · [SDD-11 — Oxc](../SDD-11-oxc.md)
> **Paquetes:** `@fudic/compiler`
> **Rama sugerida:** `fix/bug-13-comentario-en-code`
> **Independiente de BUG-12:** no comparte ni un fichero. Sale de escribir sus páginas de
> demostración en `examples/basic`.

---

## 1. Contexto y síntoma

Un `@* … *@` en cualquier posición de `@code` hace desaparecer el bloque entero: props,
signals y el cuerpo de `@client`. **Sin un solo diagnóstico.**

```fud
@code {
  @* lo que sea *@
  @client {
    const count = signal(0);
  }
}
<app-x><template shadowrootmode="open"><p>@(count.peek())</p></template></app-x>
```

Medido sobre `packages/compiler/dist`, con y sin la línea del comentario:

| Comentario | Módulo SSR | Chunk de cliente |
|---|---|---|
| ninguno | `const count = { peek: () => (0) };` | `const count = signal(0);` |
| `@*…*@` **antes** de `@client` | **perdido** | **perdido** |
| `@*…*@` **dentro** de `@client` | **perdido** | **perdido** |
| `@*…*@` **después** de `@client` | **perdido** | **perdido** |
| `// comentario` de JS | correcto | correcto |

Y lo que se emite no es código incompleto: es código **roto**. El markup sigue
referenciando `count`, que ya no lo declara nadie, así que el módulo SSR revienta con
`ReferenceError: count is not defined` en el prerender — es decir, **el build falla**, y
falla en un sitio que no menciona el comentario.

---

## 2. Causa raíz

### 2.1. El chunk neutral se lleva el comentario y se lo pasa a Oxc como JavaScript

El troceado del cuerpo es correcto; lo comprobé antes de mirar más abajo. Con el
comentario, `doc.code.parts` es exactamente lo que debe ser:

```
neutral-js[7,20)  client-region[29,61)
```

La región de cliente está ahí, con su span. El defecto es **qué texto lleva el chunk
neutral**: `[7,20)` es `\n  @* c *@\n  `, el comentario incluido.

[`code.ts:229-236`](../../../packages/compiler/src/code/code.ts#L229-L236) — `#closeChunk`
emite el chunk como un span continuo desde `#chunkStart` hasta el corte. El cursor de
regiones ([`code.ts:141-147`](../../../packages/compiler/src/code/code.ts#L141-L147)) solo
**adelanta el offset** para que un `@` dentro de un comentario o de un string no se confunda
con un marcador; no recorta el texto del chunk.

Después, `extractCode` mete ese span en el batch como sentencias de módulo
([`oxc-code.ts`](../../../packages/compiler/src/emit/oxc-code.ts), `batch.add('module-statements', p.js)`).
`@* c *@` no es JavaScript. Oxc falla, y con él **el batch entero** — que por diseño es uno
por fichero (regla de oro: *Oxc se invoca exactamente una vez por fichero*). Cae el AST de
**todas** las partes a la vez: por eso da igual dónde esté el comentario, y por eso se
pierden también las props y los signals, que no tienen nada que ver con `@client`.

### 2.2. Y el fallo es mudo

`extractCode` hace `const result = batch.parse();` y **nunca lee `result.diagnostics`**.
Un parse fallido devuelve `props: []`, `signals: []`, `client: { imports: [], body: [] }` —
la misma forma que un componente sin `@code`. El emit no puede distinguir «no había código»
de «el código no se pudo parsear», así que emite un módulo sintácticamente válido que
referencia identificadores que no existen.

Esto es lo que convierte un error de sintaxis en un `ReferenceError` a 200 líneas de
distancia.

### 2.3. Y el balanceador tampoco sabe qué es un comentario Razor

Debajo de todo hay un tercer defecto, que solo se ve cuando el comentario lleva una llave.
`scanBraces` (SDD-02) delimita el cuerpo de `@code` contando `{` y `}` y saltando las
regiones opacas de **JavaScript** — strings, templates, `//`, `/* */`, regex. `@* … *@` no es
ninguna de ellas, así que las llaves de dentro del comentario **se cuentan**:

```fud
@code {
  @* deja una { abierta *@
  ...
}
```

El bloque no cierra en su `}`, se traga el resto del fichero, el elemento host nunca aparece
y el componente ni siquiera se resuelve. No hay mensaje que hable del comentario.

### 2.4. Alcance

- **Cualquier posición** dentro de `@code`: zona neutra, dentro de `@server`, dentro de
  `@client`. El batch es uno, así que la posición no cambia nada.
- **Todo lo que `extractCode` extrae**: `props<T>()`, los `signal()` y el cuerpo de
  `@client`. No es «se pierde el comentario», es «se pierde el bloque».
- **El comentario de JS (`//`, `/* */`) no está afectado**: es JavaScript legal y Oxc lo
  parsea. El defecto es exclusivo de la sintaxis Razor.
- **`examples/basic` no lo sufre** porque ningún `.fud` del ejemplo tiene un `@*` dentro de
  `@code` — apareció al escribir los componentes de la demo de BUG-12, que sí lo tenían.

---

## 3. La decisión: dentro de `@code` se comenta en JavaScript

La corrección **no** es enseñar al compilador a trocear alrededor del comentario. Es
retirarle a `@code` una sintaxis que allí no aporta nada:

> **Un comentario Razor no se permite dentro de `@code`.** El JavaScript se comenta con
> `//` y `/* */`.

La razón es que un comentario Razor tiene **un** propósito: comentar sin publicar. En HTML,
`<!-- -->` viaja al navegador y `@* *@` no; en CSS, igual (decisión 37). En JavaScript eso ya
lo hace `//`: el bundler lo tira. Dentro de `@code`, `@* *@` no añade ninguna capacidad —
solo una sintaxis que hay que escapar de las manos del parser de JS. Es la misma línea que
la decisión 35 (`@* *@` prohibido dentro de una attr list), extendida al único otro sitio
donde el texto no es contenido, sino código.

Consecuencia directa: los tres casos del síntoma dejan de ser «hay que hacerlos funcionar» y
pasan a ser «hay que **decirlo**, con su span». Que es lo que el bug de verdad rompía.

Esta decisión se anota como **35.a** en el documento de gramática y se refleja en SDD-08.

---

## 4. Interfaz pública

- **`CodePart`, `CodeBlockNode` y `parseCodeBlock` no cambian.** Ni un campo, ni una firma:
  el comentario **se queda dentro del chunk neutral** donde ya estaba, exactamente como
  SDD-08 recupera de un `FUD0110` (el marcador sin `{` también se queda en el chunk). Lo que
  aparece es un diagnóstico.
- **`LexRegionKind` gana `'razor-comment'`** y `scanBalanced` / `scanBraces` ganan un
  parámetro **opcional** de opciones (`{ razorComments?: boolean }`). Solo `parseCodeBlock`
  lo activa: los demás llamantes de SDD-02 —cabeceras de control, `@(expr)`, CSS— conservan
  byte a byte el comportamiento de hoy.
- **`ExtractedCode` gana `diagnostics: readonly Diagnostic[]`** y `EmitOutput` también. La
  firma de `extractCode` no cambia; lo que cambia es que ya no se traga lo que el batch le
  devuelve.

Ningún span se reescribe y ningún carácter se blanquea: los offsets siguen siendo los del
fuente original, que es la regla universal del proyecto.

---

## 5. Comportamiento corregido

### 5.1. `@* … *@` dentro de `@code` es un error localizado

`FUD0114` — *«Razor comments are not allowed inside `@code`; use `//` or `/* */`»* — con el
span del comentario **entero**, `@*` y `*@` incluidos. Uno por comentario, en cualquiera de
las tres posiciones: el balanceador recorre el cuerpo del bloque completo, regiones incluidas,
así que un `@*` escrito dentro de `@client` produce el mismo diagnóstico en el mismo sitio que
uno escrito en la zona neutra.

### 5.2. Y el bloque sigue delimitado donde debe

El balanceador salta el comentario como región opaca, igual que hace con `/* */`. Sus llaves
dejan de contar, su `@client` deja de parecer un marcador y el `@code` cierra en su `}` real:
un comentario mal escrito produce **un diagnóstico**, no un fichero evaporado (§2.3).

El texto del comentario sigue llegando a Oxc dentro de su chunk —no lo recortamos—, así que
el bloque se degrada: es sintaxis inválida y se comporta como tal. La diferencia con el bug
es que ahora **se dice**, dos veces y con span, en vez de emitir un módulo fantasma.

### 5.3. Un parse que falla no es un parse vacío

`extractCode` propaga los diagnósticos del batch en vez de tragárselos, mapeados al fuente
original por `mapOffset`, y el emit los saca por `EmitOutput.diagnostics`. Un `@code` que no
parsea produce un diagnóstico con su span y no un componente fantasma. Que un error de
sintaxis se manifieste como un `ReferenceError` en otro fichero es exactamente lo que la
regla *el parser nunca lanza, emite un `Diagnostic` y continúa* existe para evitar: continuar
no es enmudecer.

---

## 6. Invariantes

**Los que el bug violaba**

- ***El parser nunca lanza: emite un `Diagnostic` y continúa.*** Aquí ni lanzaba ni emitía:
  continuaba en silencio con el resultado equivocado.
- ***El emit no produce código roto.*** Producía un módulo válido que referencia
  identificadores inexistentes.

**Los que la corrección añade**

- **Dentro de `@code` se comenta en JavaScript.** Un `@* … *@` allí es `FUD0114`.
- **Un comentario nunca cambia dónde acaba un bloque.** Ni sus llaves, ni sus palabras.
- **`ExtractedCode` vacío significa «no había código», nunca «no se pudo parsear».**

---

## 7. Criterios de aceptación

Tests en `packages/compiler/test/`.

1. **(rojo primero)** Un `@* c *@` en la zona neutra de `@code` produce **exactamente un**
   `FUD0114`, y su span cubre el comentario entero, del `@` al `@`.
2. **(rojo primero)** Lo mismo con el comentario **dentro** de `@client` y **después** del
   bloque `@client`: mismo código, mismo span relativo, un solo diagnóstico. La posición no
   cambia el mensaje.
3. **(rojo primero)** Un `@code` cuyo JS **sí** está roto de verdad (`const = ;`) produce
   **al menos un diagnóstico** en `extractCode`, con su span dentro del bloque, en vez de un
   `ExtractedCode` vacío y mudo.
4. Un comentario Razor con `{`, `}` o `@client` **dentro** no descuadra la delimitación: el
   `@code` cierra en su `}` real, el markup que le sigue se parsea, y del comentario sale
   `FUD0114` y nada más.
5. Un comentario Razor **sin cerrar** dentro de `@code` no cuelga ni lanza: diagnósticos
   localizados y cursor que avanza.
6. **Comentarios JS en las tres posiciones** (`//` y `/* */`, en la zona neutra, dentro de
   `@server` y dentro de `@client`) siguen siendo válidos, no producen diagnóstico y no
   pierden props, signals ni cuerpo de cliente. Es la otra mitad de la decisión: lo que se
   prohíbe tiene sustituto, y funciona.
7. Los goldens de los cuatro fixtures no cambian: ninguno tiene comentarios en `@code`, así
   que esta corrección **no debe** mover un byte.
8. Un comentario Razor en el **markup** —fuera de `@code`— sigue funcionando como hoy: se
   tokeniza, no se emite y no produce diagnóstico. Y los demás llamantes de `scanBalanced`
   (cabecera de control, `@(expr)`, CSS) no cambian de comportamiento.

**Cobertura.** `code.ts`, `balancer.ts` y `oxc-code.ts` no bajan de ramas; lo nuevo nace al
100 %.

---

## 8. Fuera de alcance

- **Retirar `@* … *@` del markup y del CSS.** Ahí sí aporta lo que ninguna otra sintaxis da
  —un comentario que no se publica— y tocaría tokenizer, parser HTML, CSS, formateador y
  language server. Su propio SDD, si alguna vez.
- **`@{ … }` (código inline) y las cabeceras de control.** Comparten la causa: el texto entre
  llaves acaba en el batch. La decisión de §3 les aplica en espíritu, pero cada uno es otro
  constructo y otro parser; este BUG posee `@code`.
- ~~**La mudez de `resolveComponents`.**~~ **Entra en el alcance** (decisión de Pedro): un
  diagnóstico que solo ve el editor no existe. `emit/resolve.ts:parse` tomaba `.value` dos
  veces y descartaba las dos listas —la del parser y la del pase estructural—, así que
  `FUD0110`, `FUD0111`, `FUD0114` y los `FUD0150`–`FUD0160` no llegaban al build. Ahora
  `parse` devuelve `ParseResult` y `resolveDocument` propaga los del **fichero de entrada**;
  los de una dependencia salen cuando esa dependencia se compila, que es donde sus spans
  significan algo.
- **El `@@` como escape en texto y las entidades HTML.** Salieron de la misma sesión y **no**
  son esto: `@@count` en markup emite el texto `count` (se come la `@` en vez de dejar una), y
  `&lt;` llega al nodo de texto sin decodificar y el serializador lo vuelve a escapar
  (`&amp;lt;`). Son del tokenizer y del emit de texto: **su propio BUG**, si Pedro lo quiere.
- **El catálogo de diagnósticos.** `FUD0114` se reserva en el rango de SDD-08
  (`FUD0110`–`FUD0129`, con `0112`/`0113` quemados) y se anota en SDD-08 y SDD-12.
