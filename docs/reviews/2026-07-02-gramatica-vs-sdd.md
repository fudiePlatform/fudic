# Review — Gramática v1 vs SDD-00…06 vs fixtures

> **Fecha:** 2026-07-02
> **Alcance:** `docs/gramar/gramatica-v1-decisiones.md`, `docs/sdd/SDD-00…06`, `docs/sdd/INDEX.md`,
> `packages/compiler/fixtures/*.fud`
> **Formato de cada hallazgo:** Explicación → Código de ejemplo → Referencia.
> **Veredicto:** columna para marcar `corregir` / `se queda` tras revisión con Pedro.

---

## A. Gramática desactualizada respecto a lo ya cerrado en SDD

### A1. La decisión 3 sigue permitiendo `?.` en expresión implícita

**Explicación.** SDD-04 cerró (contigo, opción A) que la implícita es **solo un camino de
propiedades** `identifier('.'identifier)*`: `?.`, llamadas, índices, `!` y genéricos van por
`@(...)`. El documento de gramática no se ha actualizado: la decisión 3 sigue diciendo que
`?.` se acepta, el comentario del EBNF inicial usa una llamada como ejemplo de implícita, el
índice repite «`?.` aceptado en implícita» y en *Pendientes para v2+* falta `?.`.

**Code.**

```text
Gramática (hoy):     @user?.name?.toUpperCase()   → implícita válida (decisión 3)
SDD-04 (cerrado):    @user?.name                  → implícita = `user`; `?.name` queda como texto
                     @(user?.name)                → forma correcta

EBNF gramática L28:  | AT implicit_expression     // @foo.bar(x)   ← una llamada ya NO es implícita
```

**Referencia.** `gramatica-v1-decisiones.md` — decisión 3 (L38), EBNF L28, índice L578,
*Pendientes v2+* L561-568. Contra `SDD-04` §1.2, §4.3, §4.5.1 e `INDEX.md` registro 2026-06-25
(«pendiente reflejar en gramatica-v1-decisiones.md»).

---

### A2. La decisión 12 dice «a nivel de sintaxis Razor»; SDD-06 la movió a semántica

**Explicación.** La gramática dice que `for...in` se rechaza a nivel de sintaxis Razor.
SDD-06 cerró que la cabecera es JS opaco (balanceador → Oxc) y que distinguir `for...of` de
`for...in` requiere el AST JS: se valida en SDD-11/12, no en el parser Razor. La letra de la
gramática quedó desfasada.

**Code.**

```text
@foreach (const k in data.items) { … }

Gramática (decisión 12):  error sintáctico Razor
SDD-06 §4.4/§4.8.3:       SDD-06 guarda la cabecera opaca; el error lo emite Oxc/SDD-12
```

**Referencia.** `gramatica-v1-decisiones.md` — decisión 12 (L64). Contra `SDD-06` §4.4 y
§4.8.3 («matiza la letra de la gramática — reflejar en gramatica-v1-decisiones.md»).

---

### A3. Faltan como decisiones numeradas dos reglas cerradas en SDD-06

**Explicación.** SDD-06 §4.8 registra dos decisiones cerradas con Pedro que no existen en el
documento de gramática: (a) el `}` crudo siempre cierra el bloque y la llave literal en
markup se escribe con entidad HTML; (b) el test de `case` se corta en el primer `:` a
profundidad 0 de delimitadores **y** de ternario. Merecen numeración propia (67 y 68) para
que la gramática siga siendo la referencia única.

**Code.**

```text
(a)  @if (a) { <p>&#123;x&#125;</p> }   → texto literal `{x}`; el `}` real cierra el bloque

(b)  @switch (v) { case cond ? 'a' : 'b': <b>H</b> }
     → el primer `:` (ternario) NO cierra la etiqueta; el segundo sí
```

**Referencia.** `SDD-06` §4.6, §4.8.1, §4.8.2 y criterios 8 y 10. Ausente en
`gramatica-v1-decisiones.md` (sección 6 y §*Gramática de referencia* L78-114).

---

### A4. El EBNF de `if_stmt` no refleja las decisiones 9 y 10

**Explicación.** La decisión 9 acepta `@else` y `else`; la decisión 10 permite whitespace
**y comentarios `@* *@`** entre `}` y `else`. El EBNF de referencia solo escribe `"else"` a
secas y solo `WS*` entre medias: la gramática formal contradice sus propias decisiones.

**Code.**

```text
EBNF hoy:      (WS* "else" WS+ "if" …)* (WS* "else" WS* html_block)?

Debería ser:   (ws_or_razor_comment* AT? "else" …)
               para admitir:  @if (a) { … } @* nota *@ @else { … }
```

**Referencia.** `gramatica-v1-decisiones.md` — EBNF `if_stmt` L79-83 vs decisiones 9 (L58)
y 10 (L60). Coherente con `SDD-06` §4.2.

---

## B. Contradicciones reales entre documentos

### B1. `<title>` opaco (notas de modos) vs `home.fud` con interpolación — sigue abierta

**Explicación.** Las notas «Modos del parser» ponen `<title>`/`<textarea>` en modo `raw`
opaco, pero el fixture canónico interpola dentro de `<title>`. SDD-03 §4.6 lo marcó como
⚠️ *a confirmar con Pedro* y adoptó una resolución provisional (raw con Razor **on**, estilo
RCDATA). SDD-05 §4.3 ya **da por buena** esa resolución provisional sin que se haya
confirmado. Además, si se confirma, el doc-comment de `RawTextToken` en SDD-03 §3.1 queda
mal: menciona `'title'` como portador de `raw-text`.

**Code.**

```html
<!-- home.fud:21 -->
<title>@data.title</title>

Notas de gramática:  raw — dentro de <script>, <textarea>, <title>. Opaco hasta el cierre.
                     → `@data.title` saldría literal, el fixture sería inválido
SDD-03 §4.6 (prov.): title/textarea = texto + átomos `@`, sin tags anidados
SDD-05 §4.3:         «<title>/<textarea> NO son raw opacos aquí … se parsean como normal»
```

**Referencia.** `gramatica-v1-decisiones.md` — notas «Modos del parser» L531. `SDD-03` §4.2,
§4.6 (⚠️), §3.1 (`RawTextToken`, L134). `SDD-05` §4.3. Fixture `home.fud:21`.

---

### B2. SDD-03 está `Listo` sin la consecuencia que SDD-06 le impone (cortar texto en `}`)

**Explicación.** SDD-06 depende de que un `}` crudo (y `case`/`default` en un switch) corte
el run de `text` para aflorar como límite en `parseContentUntil`. Esa consecuencia quedó
anotada en el registro del INDEX pero **no** en el propio SDD-03, que sigue `Listo` con su
§4.3 diciendo que el texto corre «hasta el siguiente `<` o `@`». Quien implemente SDD-03 tal
cual no lo hará. Además, nadie especifica el mecanismo: ¿el lexer corta `}` siempre en modo
html (y fuera de bloque es texto igual), o hace falta un flag «dentro de cuerpo de control»?
Hueco de diseño sin dueño.

**Code.**

```text
@if (a) { hola } mundo

SDD-03 §4.3 hoy:  text = "hola } mundo"   → el `}` queda enterrado; SDD-06 no puede parar
SDD-06 necesita:  text "hola ", token/límite `}`, y el bucle de SDD-05 lo deja peek-able
```

**Referencia.** `SDD-06` §2 (contrato con el seam), §4.6, §4.8.1 y §7 («la aporta el seam de
SDD-05/03»). `SDD-03` §4.3 (sin la regla). `INDEX.md` registro 2026-07-02 (SDD-06), donde la
consecuencia está anotada pero no propagada.

---

### B3. Decisión 8 sin enforcement: nadie define el error de valor de atributo sin comillas

**Explicación.** La decisión 8 dice que `href=@url` es error. SDD-04 §4.6 delega
explícitamente: «la enforcement concreta y su diagnóstico se reservan a SDD-05». Pero SDD-05
no define ni comportamiento ni código FUD para valores sin comillas, y SDD-03 tampoco (su
`FUD0015` es comilla de cierre ausente, otra cosa; `FUD0013` es tag mal formado). La regla
existe en la gramática y no tiene dueño ejecutable.

**Code.**

```html
<a href=@url>x</a>

Decisión 8:    error
SDD-03:        ¿qué token emite tras `attr-eq` si no viene `"`? — sin especificar
SDD-05 §4.8:   FUD0050–0055 definidos; ninguno cubre este caso
```

**Referencia.** `gramatica-v1-decisiones.md` — decisión 8 (L48). `SDD-04` §4.6. `SDD-05`
§4.6, §4.8 (catálogo). `SDD-03` §4.10 (`FUD0013`/`FUD0015` no lo cubren).

---

### B4. SDD-06 criterio 11: un `else` sin `@` suelto nunca llega a `parseControl`

**Explicación.** El criterio de aceptación 11 exige `FUD0073` para `else { … }` sin `@if`
previo. Pero un `else` **sin `@`** en contenido es texto plano para SDD-05: no hay
`at-trigger`, no hay `resolveTrigger`, no se llama a `parseControl`. Solo `@else` dispara la
ruta que produce `FUD0073`. El test, tal cual está escrito, no puede pasar; hay que cambiar
el ejemplo a `@else` (o decidir que SDD-05 también haga significativo el `else` suelto, lo
que hoy no dice ningún documento).

**Code.**

```text
<p>x</p> else { <p>y</p> }     → "else { … }" es TextNode; nadie emite FUD0073
<p>x</p> @else { <p>y</p> }    → at-trigger → keyword 'else' → parseControl → FUD0073 ✓
```

**Referencia.** `SDD-06` §4.2 (último párrafo) y criterio 11 (L369). Contra `SDD-05` §4.2
(dispatch: `else` bare no es token especial) y `SDD-04` §4.2.

---

### B5. Dependencias mal declaradas en cabeceras e INDEX (SDD-05 y SDD-06 usan SDD-02)

**Explicación.** SDD-06 llama directamente a `scanParens` (SDD-02), y su propia tabla §2 lo
lista, pero la cabecera del documento y la fila del INDEX dicen «Depende de: 00, 04, 05».
SDD-05 importa `BalancedGroup` de `../balancer/` (`InlineCodeNode.group`) y su cabecera dice
«00, 03, 04». Si un SDD debe ser autocontenido por sus §2/§3, las cabeceras y el INDEX deben
declarar 02.

**Code.**

```ts
// SDD-06 §2 (imports declarados)          // SDD-06 cabecera
import { scanParens } from '../balancer/index.js';   // «Depende de: 00, 04, 05» ← falta 02

// SDD-05 §2                               // SDD-05 cabecera
import { type BalancedGroup } from '../balancer/index.js';  // «Depende de: 00, 03, 04» ← falta 02
```

**Referencia.** `SDD-06` cabecera L4 vs §2 (tabla, fila 02). `SDD-05` cabecera L4 vs §2
(import L64) y §3.3 (`InlineCodeNode`). `INDEX.md` tabla maestra filas 05 y 06.

---

### B6. Nota obsoleta en SDD-04 §4.7 sobre el destino del rango `FUD0030–0049`

**Explicación.** SDD-04 dice que su rango queda «reservado para los errores de despacho de
SDD-06/08 (estructura de control mal formada, `@code` duplicado, etc.)». SDD-06 ya reservó y
usa su propio rango `FUD0070–0089`. La nota contradice el reparto vigente y, si SDD-08 la
sigue, colisionará el criterio de «cada SDD reserva su propio rango».

**Code.**

```text
SDD-04 §4.7:  FUD0030–0049 → «reservado para errores de despacho de SDD-06/08»
SDD-06 §4.7:  FUD0070–0089 → rango propio (FUD0070–0075 definidos)
```

**Referencia.** `SDD-04` §4.7 (L249) vs `SDD-06` §4.7 (L271-284). Convención de rangos en
`CLAUDE.md` y `SDD-01` §3.2 (nota de registro).

---

### B7. Comillas dentro de cuerpos de bloque: gramática y SDD-06 vs fixture

**Explicación.** El ejemplo canónico de la gramática y el criterio 3 de SDD-06 escriben los
cuerpos como `{ "Cerrar" }`. En modo HTML esas comillas son texto: el output llevaría las
comillas literales. El fixture (correcto) las omite. Unificar hacia la forma sin comillas
para no enseñar un patrón que emite `"Cerrar"` con comillas.

**Code.**

```text
Gramática L482 / SDD-06 crit. 3:   @if (expanded.value) { "Cerrar" } else { "Abrir" }
                                   → output: "Cerrar" (comillas incluidas)
app-card.fud:40:                   @if (expanded.value) { Cerrar } else { Abrir }
                                   → output: Cerrar ✓
```

**Referencia.** `gramatica-v1-decisiones.md` — ejemplo canónico modo componente L482.
`SDD-06` criterio 3 (L336-338, «elseBody = ["Abrir"]» ambiguo respecto a las comillas).
Fixture `app-card.fud:40`.

---

## C. Bordes menores / mejoras

### C1. Precedencia email vs `@@`: `a@@b` interpola en el orden actual

**Explicación.** SDD-03 §4.4 evalúa el lookbehind de email (decisión 7) **antes** que el
escape `@@` (decisión 1). Con ese orden, en `a@@b` el primer `@` es literal (precedido de
identificador) y el segundo `@` — precedido de `@`, que no es carácter identificador — se
convierte en disparador: `@b` se interpola. Con el orden inverso sería el literal `a@b`.
La gramática no fija precedencia entre 1 y 7. Decidir y clavar con test.

**Code.**

```text
Entrada: a@@b

Orden SDD-03 (email primero):  text "a@" + at-trigger → implícita `b`   → emite a@<valor de b>
Orden inverso (@@ primero):    text "a" + at-escape + text "b"          → emite a@b
```

**Referencia.** `SDD-03` §4.4 (casos 1 y 2, en ese orden). `gramatica-v1-decisiones.md` —
decisiones 1 (L34) y 7 (L46), sin regla de precedencia.

---

### C2. ¿Existe `@case` / `@default`? No está dicho

**Explicación.** La decisión 9 da doble forma (`@else`/`else`) solo al `else`. Para
`case`/`default` ni la gramática ni SDD-06 dicen explícitamente que la forma con `@` no
existe. SDD-06 los reconoce a nivel de offset sin `@`; un `@case` dentro de un switch
resolvería como… expresión implícita `case` (no es keyword de SDD-04). Conviene una línea
explícita: «`case`/`default` van siempre sin `@`».

**Code.**

```text
@switch (v) {
  case 'a':  <b>A</b>     ← única forma válida
  @case 'b': <b>B</b>     ← hoy: `@case` = implícita `case` + texto → FUD0074, error críptico
}
```

**Referencia.** `gramatica-v1-decisiones.md` — decisión 9 (L58), EBNF `switch_case`
L102-105. `SDD-06` §4.3. `SDD-04` §4.2 (conjunto cerrado de keywords, sin `case`).

---

### C3. Estilo: `ConditionalBranch` no extiende `Node`; `SwitchCase` sí

**Explicación.** En SDD-06, `SwitchCase` extiende `Node` (`type: 'switch-case'` + `span`)
pero `ConditionalBranch` es una interfaz suelta con `span` y sin `type`. Ambas son piezas
internas de un nodo compuesto; convendría unificar el criterio (las dos `Node`, o ninguna)
o justificar la asimetría, pensando en visitors y en la query por offset.

**Code.**

```ts
export interface ConditionalBranch {            // ← no es Node (sin `type`)
  readonly header: ControlHeader;
  readonly body: readonly HtmlContent[];
  readonly span: Span;
}
export interface SwitchCase extends Node {      // ← sí es Node
  readonly type: 'switch-case';
  …
}
```

**Referencia.** `SDD-06` §3.1 (L111-116 vs L146-152).

---

## Resumen

| # | Hallazgo | Tipo | Veredicto |
|---|---|---|---|
| A1 | Decisión 3 (`?.`) sin actualizar tras SDD-04 | Gramática desfasada | |
| A2 | Decisión 12 (`for...in`) sin actualizar tras SDD-06 | Gramática desfasada | |
| A3 | Falta numerar `}`+entidad y corte de `case` (67/68) | Gramática desfasada | |
| A4 | EBNF `if_stmt` sin `@else` ni comentarios | Gramática desfasada | |
| B1 | `<title>` opaco vs `home.fud` — abierta, SDD-05 ya asume resolución | Contradicción | |
| B2 | SDD-03 sin la regla de cortar texto en `}`/`case`/`default` | Contradicción | |
| B3 | Decisión 8 sin dueño ejecutable (valor sin comillas) | Hueco | |
| B4 | Criterio 11 de SDD-06 imposible con `else` sin `@` | Contradicción | |
| B5 | Dependencia 02 ausente en cabeceras/INDEX (SDD-05/06) | Inconsistencia | |
| B6 | Nota obsoleta de rangos FUD en SDD-04 §4.7 | Inconsistencia | |
| B7 | Comillas literales en `{ "Cerrar" }` | Inconsistencia | |
| C1 | Precedencia email vs `@@` (`a@@b`) | Borde a fijar | |
| C2 | `@case`/`@default` sin pronunciamiento | Mejora | |
| C3 | `ConditionalBranch` vs `SwitchCase` (Node) | Estilo | |
