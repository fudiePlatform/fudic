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

### 2.3. Alcance

- **Cualquier posición** dentro de `@code`: zona neutra, dentro de `@server`, dentro de
  `@client`. El batch es uno, así que la posición no cambia nada.
- **Todo lo que `extractCode` extrae**: `props<T>()`, los `signal()` y el cuerpo de
  `@client`. No es «se pierde el comentario», es «se pierde el bloque».
- **El comentario de JS (`//`, `/* */`) no está afectado**: es JavaScript legal y Oxc lo
  parsea. El defecto es exclusivo de la sintaxis Razor.
- **Cualquier otro texto no-JS que acabe en un chunk neutral** comparte la causa exacta.
  El comentario es el caso que existe hoy en la gramática.
- **`examples/basic` no lo sufre** porque ningún `.fud` del ejemplo tiene un `@*` dentro de
  `@code` — apareció al escribir los componentes de la demo de BUG-12, que sí lo tenían.

---

## 3. Interfaz pública

**No cambia ninguna firma.** `CodePart`, `parseCodeBlock`, `extractCode` y `ExtractedCode`
se quedan como están. Cambia **qué spans** lleva un `neutral-js` y **qué se hace** con los
diagnósticos que ya devuelve el batch.

Un chunk neutral que contenga regiones de comentario se emite **troceado**: un `neutral-js`
por cada tramo entre comentarios, cada uno con su span real. Nada de reescribir texto ni de
blanquear caracteres — los spans siguen siendo offsets del fuente original, que es la regla
universal del proyecto.

---

## 4. Comportamiento corregido

### 4.1. A Oxc solo le llega JavaScript

Un comentario Razor es sintaxis de Fudic, no de JS. No forma parte de ninguna parte de
código: se queda en el AST del documento, donde el LSP puede verlo, y **no se le ofrece al
parser de JavaScript**. La regla, corta: *lo que entra en el batch es lo que el usuario
escribió como JavaScript, y nada más.*

### 4.2. Un parse que falla no es un parse vacío

`extractCode` propaga los diagnósticos del batch en vez de tragárselos. Un `@code` que no
parsea produce un diagnóstico con su span —el que Oxc ya da, mapeado al fuente original por
`mapOffset`— y no un componente fantasma. Que un error de sintaxis se manifieste como un
`ReferenceError` en otro fichero es exactamente lo que la regla *el parser nunca lanza, emite
un `Diagnostic` y continúa* existe para evitar: continuar no es enmudecer.

---

## 5. Invariantes

**Los que el bug violaba**

- ***El parser nunca lanza: emite un `Diagnostic` y continúa.*** Aquí ni lanzaba ni emitía:
  continuaba en silencio con el resultado equivocado.
- ***Un comentario no cambia el significado del programa.*** El invariante que todo
  programador da por hecho sin escribirlo.
- ***El emit no produce código roto.*** Producía un módulo válido que referencia
  identificadores inexistentes.

**Los que la corrección añade**

- **Al batch de Oxc solo le llega JavaScript.** Verificable por construcción sobre los spans
  de las partes.
- **`ExtractedCode` vacío significa «no había código», nunca «no se pudo parsear».**

---

## 6. Criterios de aceptación

Tests en `packages/compiler/test/`.

1. **(rojo primero)** Un componente con `@* c *@` en la zona neutra de `@code` y
   `const count = signal(0)` en `@client` emite el módulo SSR con su signal inerte y el
   chunk de cliente con su `signal(0)`. Idéntico al mismo componente sin el comentario,
   salvo spans.
2. **(rojo primero)** Lo mismo con el comentario **dentro** de `@client` y **después** del
   bloque `@client`.
3. **(rojo primero)** Un `@code` cuyo JS **sí** está roto de verdad (`const = ;`) produce
   **al menos un diagnóstico** con su span dentro del bloque, en vez de un `ExtractedCode`
   vacío.
4. Un comentario Razor con `{`, `}` o `@client` **dentro** no descuadra el troceado: el
   texto de un comentario no es código, ni siquiera cuando lo parece.
5. `props<T>()` y los `signal()` sobreviven a un comentario en cualquier posición
   (es el mismo batch: si cae, caen los tres).
6. Los goldens de los cuatro fixtures no cambian: ninguno tiene comentarios en `@code`, así
   que esta corrección **no debe** mover un byte.
7. Un comentario Razor en el **markup** —fuera de `@code`— sigue funcionando como hoy.

**Cobertura.** `code.ts` y `oxc-code.ts` no bajan de ramas; lo nuevo nace al 100 %.

---

## 7. Fuera de alcance

- **El `@@` como escape en texto y las entidades HTML.** Salieron de la misma sesión y **no**
  son esto: `@@count` en markup emite el texto `count` (se come la `@` en vez de dejar una), y
  `&lt;` llega al nodo de texto sin decodificar y el serializador lo vuelve a escapar
  (`&amp;lt;`). Se ve hoy en `dist/about/index.html`, que viene de `main`. Son del tokenizer y
  del emit de texto, no del troceado de `@code`: **su propio BUG**, si Pedro lo quiere.
- **Que `@code` acepte comentarios en más sitios** de los que la gramática ya permite.
- **Reordenar o fusionar partes** por ningún otro motivo. El troceado solo se parte donde hay
  un comentario.
- **El catálogo de diagnósticos.** Si §4.2 necesita un código nuevo, se reserva en el rango de
  SDD-11 y se anota en SDD-12; no se inventa un rango.
