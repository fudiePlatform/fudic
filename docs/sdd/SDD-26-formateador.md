# SDD-26 — Formateador (`@fudic/formatter`)

> **Estado:** `Listo`
> **Paquete:** `@fudic/formatter`
> **Consumidores:** el servidor LSP (SDD-24) y la CLI (`fudic fmt`). **El mismo binario en
> los dos caminos**: si el editor y el pipeline formatean distinto, el producto está roto.

---

## 1. Contexto y objetivo

Formatear `.fud` completos: markup, directivas Razor, JS/TS embebido y CSS embebido.

La decisión estructural, y la única que aguanta un lenguaje anidado: **printer propio con
IR de documento** (`group`, `indent`, `line`, `softline`, `fill`, `hardline`), no "delegar
rangos a los formateadores nativos y pegar los trozos". Delegar por rangos falla en cuanto
un `@if` parte un árbol HTML: ningún formateador externo ve nunca un documento válido, y
la reindentación de los trozos devueltos no tiene una respuesta correcta.

Fudic juega con dos ventajas que un formateador de HTML general no tiene: el subset es
**estricto** (todo cerrado, atributos entrecomillados, sin error recovery, sin inserciones
implícitas) y el AST ya lleva **spans universales**. Imprimir un árbol conocido y bien
formado es mucho más barato que imprimir HTML tolerante.

---

## 2. Dependencias

- **Parser (`SDD-01`–`SDD-10`)** — AST con spans. El formateador imprime el AST; no toca
  texto salvo en las hojas delegadas (§4.2) y en las regiones opacas (§4.4).
- **Emisor de runtime** — solo para el criterio de aceptación 3 (§6), que es el test duro.
- **Formateador de JS/TS** — punto de sustitución, no decisión estructural: se evalúa el
  estado de `oxfmt`; si está maduro, coherencia total con el toolchain (Oxc ya está
  dentro); si no, Prettier como *peer dependency* y se migra sin tocar el printer.
- **Formateador de CSS** — el mismo criterio.

**Requisito sobre el AST:** ningún comentario Razor `@* … *@` puede perderse. Aunque no se
emitan al output (decisión 37), un formateador que no los ve los borra.

Estado real del parser, comprobado: `RazorCommentNode` **es** un nodo del AST en contenido
HTML y en `<style>`, con su span. Quedan **dos posiciones de trivia** donde el parser los
consume sin producir nodo, y son justo las que el criterio 7 de §6 exige preservar:

1. entre el `}` de una rama y su `else` (`skipTrivia`, decisión 10);
2. dentro de un `@switch`, entre el `{` y la primera etiqueta y entre etiquetas.

No hace falta cambiar el parser: el formateador **rescata esa trivia por span**. Tiene el
`source` completo (`format(source, …)`) y los spans de las piezas contiguas, así que corta
el hueco entre el final de una y el inicio de la siguiente, y lo reimprime como comentario
si contiene un `@* … *@`. Los dos huecos son los únicos casos, están acotados y se cubren
con test propio. Lo que este SDD **sí** exige es que ese rescate exista: cortar por span no
es un detalle de implementación, es la única razón por la que no se pierde código.

---

## 3. Interfaz pública

```ts
export interface FormatOptions {
  printWidth: number;                 // default 100
  useTabs: boolean;                   // default false
  tabWidth: number;                   // default 2
  quote: 'double' | 'single';         // default 'double' (atributos)
  endOfLine: 'lf' | 'crlf' | 'auto';  // default 'lf'
}

export type FormatResult =
  | { ok: true; text: string }
  | { ok: false; diagnostics: readonly Diagnostic[] };  // no se formatea; ver §4.6

export function format(source: string, options?: Partial<FormatOptions>): FormatResult;

export function formatRange(
  source: string, range: Span, options?: Partial<FormatOptions>,
): FormatResult;
```

Seis opciones y ninguna más. Cada opción multiplica la matriz de tests y no aporta nada:
el zoo de ajustes de los formateadores viejos es deuda pura.

CLI: `fudic fmt [ruta…]` y `fudic fmt --check` (código de salida distinto de cero si algún
fichero cambiaría, para CI).

---

## 4. Comportamiento

### 4.1. El árbol no se delega; las hojas sí

| Región | Quién la formatea |
|---|---|
| markup, directivas Razor, bindings, atributos | **printer propio** |
| `@code`, `@server`, `@client`, `@{ … }` | formateador JS/TS |
| cabeceras de control, `@(expr)`, `@expr` | formateador JS/TS, con centinela (§4.2) |
| `<style>` | formateador CSS, con placeholders (§4.3) |
| `<script>`, `<pre>`, `<textarea>` | nadie (§4.4) |

Nadie más que el printer propio conoce `@if`, `class:foo`, `.prop` o `@section`. Y nadie
más que él puede decidir dónde se rompe una línea de markup, porque esa decisión depende
de la sensibilidad al whitespace (§4.5).

### 4.2. Centinela para fragmentos que no son programas

`@(a ? b : c)` no es un programa; `@if (x > 0)` tampoco. Para formatearlos con un
formateador de JS real hay que **envolverlos** en una construcción parseable, formatear, y
**desenvolver** el resultado reindentándolo dentro del `Doc`:

| Fragmento | Envoltorio |
|---|---|
| expresión (`@(…)`, valor de binding) | `($<expr>);` |
| cabecera de `@if` / `@while` | `if (<expr>) {}` |
| cabecera de `@foreach` | `for (<header>) {}` |
| cabecera de `@for` | `for (<header>) {}` |
| discriminante de `@switch` | `switch (<expr>) {}` |
| cuerpo de `@code` y de `@{ … }` | ninguno (ya son listas de sentencias) |

Si el fragmento no parsea, **se deja tal cual** y se sigue. Un fragmento roto no debe
impedir formatear el resto del fichero.

### 4.3. CSS

Las regiones Razor dentro de `<style>` se sustituyen por placeholders **léxicamente
válidos y únicos**, se formatea, y se reponen buscando el placeholder en la salida.

La unicidad es aquí el requisito, **no** la longitud —al contrario que en el virtual del
LSP (SDD-23 §4.5), donde lo que importa es la longitud porque el texto no se mueve. Aquí
el texto sí se mueve: el placeholder hay que poder encontrarlo después. Confundir los dos
criterios rompe uno de los dos consumidores.

Si tras formatear falta algún placeholder o aparece duplicado, el `<style>` se deja sin
formatear y se emite una nota. Perder código del usuario no es una opción.

### 4.4. Regiones opacas

`<script>` (raw puro, decisión 43), `<pre>` y `<textarea>` se copian **byte a byte**,
incluida su indentación original. No se reindentan ni siquiera si el elemento contenedor
cambia de nivel: cualquier modificación dentro de ellos altera el render o el programa.

### 4.5. Sensibilidad al whitespace

Es donde se hunden los formateadores de HTML, y donde este documento es explícito.

- **Tabla de `display` por defecto**, mantenida en el formateador, que clasifica cada tag
  nativo en `inline`, `block` o `inline-block`. Un salto de línea entre dos elementos
  `inline` **cambia el render**: introduce un espacio. La tabla decide dónde el printer
  puede romper.
- **Los custom elements se tratan como `inline` salvo prueba en contrario.** Es el
  supuesto conservador: romper dentro de un contenedor inline es un cambio visible;
  no romper dentro de uno block es solo una línea larga.
- **Adyacencia de interpolación.** `@data.tag</app-badge>` no admite un salto ahí. Todo
  `at_construct` es un **token inline pegajoso**: si el elemento contenedor es inline, el
  grupo no rompe nunca dentro de él, aunque exceda `printWidth`. Se prefiere una línea
  larga a un render distinto. Es exactamente el caso del `<app-badge>` real.
- **Atributos.** Con más de uno y línea que no cabe, se rompe **uno por línea** con el `>`
  pegado al último atributo (o en su propia línea si el elemento no tiene hijos). Los
  bindings largos (`class:success="@(tone === 'success')"`) no se parten nunca por dentro.
- **Bloques de directiva.** `@if (…) {` abre con el `{` en la misma línea; el `}` de
  cierre y el `else` siguen la forma del ejemplo canónico de la gramática (`} else {`).
  Entre `}` y `else` se preservan los comentarios `@* *@` (decisión 10).
- **Líneas en blanco.** Se colapsan a un máximo de una; se eliminan al principio y al
  final de cada bloque. Es la única normalización de espacio vertical.

### 4.6. Fichero con errores de parseo

Si el parser produce diagnósticos, `format` devuelve `{ ok: false, diagnostics }` y **no
formatea**. Formatear un AST incompleto reorganiza código que el usuario está a mitad de
escribir. El formateador **no lanza** nunca: devuelve el resultado negativo.

Consecuencia en el editor: "formatear al guardar" no hace nada mientras el fichero esté
roto, en silencio. Es el comportamiento correcto.

### 4.7. Formateo de rango y al teclear

`formatRange` acota al **nodo completo más pequeño que contenga el rango**; nunca formatea
media construcción. El formateo al teclear se limita a reindentar la línea actual tras `}`
o `>`; no reorganiza nada.

---

## 5. Invariantes LSP

- **No lanza jamás**, ni con entrada rota ni con fragmento inválido.
- **No pierde código.** Toda región del origen aparece en la salida: la delegada, la
  reindentada, o la copiada literalmente. Los placeholders repuestos son la única
  operación que puede fallar, y su fallo se degrada a "no formatear ese bloque".
- **Idempotente.**
- **Determinista.** Mismas opciones ⇒ misma salida, byte a byte, en cualquier plataforma
  (con `endOfLine` fijado).
- **Un solo formateador para editor y CLI.** No hay dos caminos de código.
- **El formateador no consulta tipos.** Solo AST. No depende del LSP ni de `tsserver`.

---

## 6. Criterios de aceptación

Corpus: los tres fixtures canónicos, `blog/[slug].fud`, `app-badge.fud`, `site-nav.fud`,
`_layout.fud`, las páginas reales de Fudie, y un conjunto de ficheros deliberadamente
rotos.

1. **Idempotencia.** `fmt(fmt(x)) === fmt(x)` en todo el corpus, byte a byte.
2. **Round-trip de AST.** `parse(fmt(x))` ≡ `parse(x)`, comparando módulo posiciones. Es
   decir: el formateador no cambia el programa.
3. **Equivalencia de emit — el test duro.** El HTML que el emisor de runtime produce para
   `x` y para `fmt(x)` es **idéntico byte a byte**, en todo el corpus. Cualquier bug de
   whitespace sensible cae aquí y **en ningún otro sitio**: ni el round-trip de AST ni la
   idempotencia lo detectan, porque el AST puede ser el mismo y el render distinto. Este
   criterio solo es posible porque el emisor está en el mismo repositorio; es la ventaja
   estructural del proyecto sobre cualquier formateador de terceros y hay que explotarla.
4. **Estabilidad sobre ya-formateado.** Formatear un fichero ya formateado no produce
   cambios (`--check` sale con cero).
5. **Ficheros rotos.** Sobre cada fichero con error de parseo, `ok: false`, cero
   excepciones, y el fichero en disco intacto.
6. **Regiones opacas.** `<script>`, `<pre>` y `<textarea>` salen byte a byte iguales,
   incluida su indentación, incluso cambiando el nivel del contenedor.
7. **Comentarios Razor.** Ningún `@* … *@` desaparece; los que están entre `}` y `else`
   siguen ahí.
8. **CSS con Razor.** Un `<style>` con `@media (min-width: @bp.tablet)` se formatea y las
   regiones Razor se reponen exactas.
9. **Adyacencia inline.** El `<app-badge tone="…">@data.tag</app-badge>` real no adquiere
   saltos internos aunque la línea exceda `printWidth`.
10. **Atributos largos.** El `<span>` de `app-badge.fud` con tres atributos, ya escrito uno
    por línea, se mantiene estable y no se colapsa a una línea de 120 columnas.
11. **Paridad editor/CLI.** Para cada fichero del corpus, la salida del comando de VS Code
    y la de `fudic fmt` son idénticas.
12. **Formateo de rango.** Seleccionar media cabecera de `@if` formatea el `@if` entero, no
    la mitad.

---

## 7. Fuera de alcance

- **Linting y reglas de estilo** (orden de atributos, convenciones de nombres). El
  formateador no opina sobre el código, solo sobre su disposición.
- **Organización de imports** dentro de `@code`. Lo hace el formateador de JS si lo hace;
  no se fuerza.
- **Formateo del `<script>` raw.** Es opaco por decisión 43.
- **Migración a `oxfmt`** si hoy no está maduro: es un cambio de dependencia, no de
  arquitectura, y va en su propia entrada del registro de progreso.
- **Configuración por fichero** (`.fudicrc`, `.editorconfig`). Las opciones vienen del
  ajuste del editor o de la CLI.
- **Formateo de los virtuals de SDD-23.** Nunca se formatean: su disposición es el mapeo.
