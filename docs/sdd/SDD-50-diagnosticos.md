# SDD-50 — Los diagnósticos tienen casa: `@fudic/diagnostics`

> **Estado:** `Listo` — pendiente de la revisión de Pedro.
> **Paquetes:** `@fudic/diagnostics` (**nuevo**) · y todos los que hoy escriben un `FUD` a mano:
> `@fudic/compiler` · `@fudic/vite` · `@fudic/cli` · `@fudic/config` · `@fudic/resolve` ·
> `@fudic/formatter` · `@fudic/language-core` · `@fudic/language-server`
> **Depende de:** 01 (`Span`, `Diagnostic`), 13 (`LineMap`), 12 (el catálogo de §5)
> **Rango de diagnósticos:** ninguno nuevo. Mueve todos los existentes y resuelve una colisión
> (§4.6).
> **Decisiones de gramática:** ninguna.
> **Naturaleza:** refactor transversal. Ningún diagnóstico cambia de texto, de severidad ni de
> posición, salvo los dos renumerados de §4.6.
>
> **Qué añade en una frase.** Cada código `FUD` es una función tipada en su propio fichero, con
> su explicación en inglés al lado, y es la única forma de crear un diagnóstico en todo fudic.

---

## 1. Contexto y objetivo

### 1.1. Lo que hay hoy

Medido sobre `main`: **550 literales `'FUDnnnn'` en 125 ficheros de 12 paquetes**, unos 244
códigos distintos. Cada SDD reserva un rango a mano y cada paquete inventa su forma:

| Paquete | Forma | Lleva |
|---|---|---|
| `compiler` | `Diagnostic` + `errorDiag(code, message, span)` | span obligatorio, `file?`, `related?` |
| `vite` | `FudicDiagnostic` + constantes `FUD_*` | `file`, sin span |
| `cli` | `CliError` + constantes `FUD_*` | `file?`, sin span |
| `config` | `ConfigDiagnostic`, con **su propia copia** de `Span` | `file`, `span?` |
| `formatter`, `resolve`, `language-*` | literales sueltos o constantes propias | — |

Lo que eso produce:

- **Colisiones.** `FUD0720` y `FUD0721` significan dos cosas cada uno (BUG-32 en el compilador,
  SDD-41 en `config`). Nada lo impide, porque un número es un string.
- **El mensaje se escribe en el sitio de la llamada.** El mismo código se redacta en varios
  sitios, con datos distintos, y nada obliga a que cuadren.
- **Nadie que no haya leído el SDD sabe qué significa un código.** Un LLM que escribe un `.fud`
  recibe `FUD0592` y un mensaje de una línea, sin el porqué ni el arreglo. Es el caso que este SDD
  prepara: un MCP que compile contra el compilador real (después de SDD-35) necesita errores que
  se expliquen solos.

### 1.2. La regla

**Un código, un fichero, una función.** `packages/diagnostics/src/codes/FUD0050.ts` exporta
`const FUD0050 = (params) => diagnostic`. Recibe los datos tipados del caso, devuelve el objeto
que se pinta, con el texto en inglés ya compuesto y el enlace a su explicación. A su lado,
`FUD0050.md` explica en inglés qué pasa, por qué y cómo se arregla.

Consecuencias que salen solas:

- **No puede haber colisiones**: dos ficheros no se llaman igual.
- **No puede faltar un dato**: si `FUD0050` necesita el tag de apertura y el de cierre, la
  llamada que no los pasa no compila.
- **Mirar la carpeta `codes/` es mirar el catálogo.** La tabla de SDD-12 §5 deja de ser la fuente.
- **Tree-shaking por código.** `index.ts` reexporta todos y el paquete declara
  `"sideEffects": false`. Quien importa `FUD0050` se lleva ese fichero y nada más.

### 1.3. Por qué ahora

SDD-35 crea `FUD0870`–`FUD0871` y retira `FUD0197`–`FUD0199`, y después vendrá el MCP. Hacer
esto antes significa que esos códigos nacen ya en su sitio y que SDD-35 pinta sus errores con
la función de §3.4 en lugar de inventar la suya (`formatProblem`).

---

## 2. Dependencias

| Fuente | Aporta |
|---|---|
| SDD-01 | `Span`, `span()`, `emptySpan()`, `Severity`, `Diagnostic`, `RelatedLocation`. **Se mueven** a `@fudic/diagnostics` (§4.1). |
| SDD-13 | `LineMap`, `Position`, `Range`. **Se mueven** a `@fudic/diagnostics` (§4.1). |
| SDD-12 §5 | El catálogo actual: qué significa cada código y su severidad. Fuente para los `.md`. |
| Cada SDD con rango propio | El porqué de cada código, para escribir su `.md`. |

`@fudic/diagnostics` no tiene **ninguna** dependencia de runtime.

---

## 3. Interfaz pública

### 3.1. El objeto que se pinta

```ts
/** The four LSP severities. Unchanged from SDD-01. */
export type Severity = 'error' | 'warning' | 'info' | 'hint';

/** `FUD` + four digits. */
export type FudCode = `FUD${number}`;

interface DiagnosticBase {
  readonly code: FudCode;
  readonly severity: Severity;
  /** English, single line, no trailing period. Composed by the code's function. */
  readonly message: string;
  /** Public explanation: `${DOCS_BASE}#FUD0050` (§3.5). */
  readonly docs: string;
}

/** A place in a source file: the compiler, the editor. Span REQUIRED (LSP invariant). */
export interface SourceDiagnostic extends DiagnosticBase {
  readonly span: Span;
  /** Absent: the file being compiled or opened (unchanged meaning from SDD-29). */
  readonly file?: string;
  readonly related?: readonly RelatedLocation[];
}

/** About a file, maybe at a place in it: the build, `fudic.json`. */
export interface FileDiagnostic extends DiagnosticBase {
  readonly file: string;
  readonly span?: Span;
}

/** About the project or the command line: no file at all. */
export interface ProjectDiagnostic extends DiagnosticBase {}

export type FudDiagnostic = SourceDiagnostic | FileDiagnostic | ProjectDiagnostic;
```

Las tres formas son las que ya existen hoy (§1.1), con nombre común. Cada código elige **una**
en su firma y no la cambia. El compilador sigue teniendo el span obligatorio por tipo, que es lo
que garantiza la regla de oro.

### 3.2. Las entradas

```ts
export interface SourceInput {
  readonly span: Span;
  readonly file?: string;
  readonly related?: readonly RelatedLocation[];
}
export interface FileInput {
  readonly file: string;
  readonly span?: Span;
}
```

Cada código declara sus parámetros extendiendo una de las dos (o ninguna, si es de proyecto)
con los datos que necesita su mensaje:

```ts
// packages/diagnostics/src/codes/FUD0050.ts
import { source, type SourceInput, type SourceDiagnostic } from '../make.js';

export interface FUD0050Params extends SourceInput {
  /** The element left open. */
  readonly open: string;
  /** The closing tag found instead. */
  readonly close: string;
}

/** A closing tag that does not match the element it would close (SDD-05). */
export const FUD0050 = (p: FUD0050Params): SourceDiagnostic =>
  source('FUD0050', 'error', `…message composed from p.open and p.close…`, p);
```

- La **severidad es del código**, no de la llamada. Si al migrar aparece un código que hoy sale
  con dos severidades, se para y se decide con Pedro; no se añade un parámetro de severidad.
- Si un código tiene hoy **dos mensajes** según el caso (por ejemplo `FUD0760`), la diferencia se
  modela en los parámetros (`kind: 'missing' | 'not-a-library'`) y el texto sigue saliendo del
  fichero del código.
- `source`, `file` y `project` (`make.ts`) son los tres constructores internos. **No se
  exportan** desde `index.ts`: fuera del paquete, un diagnóstico solo se crea llamando a su
  código.

### 3.3. `index.ts`

```ts
export * from './types.js';     // Severity, FudCode, the three shapes, the two inputs
export * from './span.js';      // Span, span, emptySpan, RelatedLocation
export * from './linemap.js';   // LineMap, Position, Range
export * from './render.js';    // render, format
export { DOCS_BASE } from './docs.js';

export * from './codes/FUD0001.js';
export * from './codes/FUD0002.js';
// … one line per code, in numeric order
```

Se escribe a mano, una línea por código y en orden. Un test comprueba que está completo (§6).

### 3.4. Pintar

```ts
export interface Rendered {
  readonly code: FudCode;
  readonly severity: Severity;
  readonly message: string;
  readonly docs: string;
  readonly file?: string;
  /** 1-based, for humans. Absent when the diagnostic has no span or no source was given. */
  readonly start?: { readonly line: number; readonly column: number };
  readonly end?: { readonly line: number; readonly column: number };
  /** The offending lines with the span underlined. Same condition as `start`. */
  readonly frame?: string;
}

/** Line, column and frame, computed here and nowhere else. */
export function render(diagnostic: FudDiagnostic, source?: string): Rendered;

/** The terminal text: `path:line:col - error FUD0050: message`, the frame, and the docs link. */
export function format(diagnostic: FudDiagnostic, options?: { readonly root?: string; readonly source?: string }): string;
```

**Línea y columna no se guardan, se calculan al pintar.** Quien crea un diagnóstico (lexer,
parser, analizadores) solo tiene un offset, y la regla de oro de los spans se mantiene. `render`
usa el `LineMap` y es el único sitio donde un offset se vuelve línea para un humano. El editor
sigue con sus `Range` 0-based de LSP, que también salen del `LineMap`.

### 3.5. `DOCS_BASE`

```ts
/** Where the public explanation of every code lives, read from the package's `package.json`. */
export const DOCS_BASE: string;
```

**La URL vive en el `package.json` de `@fudic/diagnostics`, no en el código:**

```json
{
  "name": "@fudic/diagnostics",
  "fudic": { "docs": "http://localhost:8080/diagnostic" }
}
```

`docs.ts` la lee con un import de JSON (`import pkg from '../package.json' with { type: 'json' }`),
que funciona igual en `src` y en `dist`, porque el `package.json` está siempre en la raíz del
paquete publicado. Ningún fichero de `src` contiene la URL. Cambiar de web es cambiar ese campo y
volver a construir.

De momento `http://localhost:8080/diagnostic`; cada despliegue lo cambia ahí. Un test falla si el
campo falta, está vacío o no es una URL absoluta.

---

## 4. Comportamiento

### 4.1. Lo que se mueve

- **`Span`, `span()`, `emptySpan()`, `RelatedLocation`, `Severity`** salen de
  `compiler/src/types/` y **`LineMap`, `Position`, `Range`** de `compiler/src/sourcemap/`. El
  compilador los **reexporta** para no romper a nadie que los importe de `@fudic/compiler`.
- **`Diagnostic`** del compilador pasa a ser un alias de `SourceDiagnostic`. Gana el campo
  `docs`; nada más cambia.
- **`errorDiag`, `relatedError`, `warningDiag`, `infoDiag`, `hintDiag`** se borran. Todas sus
  llamadas pasan a la función de su código.
- **`FudicDiagnostic`** (vite), **`ConfigDiagnostic`** (config, y su copia de `Span`) y la parte
  de diagnóstico de **`CliError`** (cli) se sustituyen por `FileDiagnostic` /
  `ProjectDiagnostic`. Si alguno lleva un campo que no es de diagnóstico, se queda en un tipo
  del paquete que **contiene** el diagnóstico, no que lo copia.
- **Las constantes `FUD_*`** de vite, cli, config y formatter se borran. El nombre legible pasa
  al JSDoc de la función del código.

### 4.2. Un fichero por código

Por cada código **vivo**, en `packages/diagnostics/src/codes/`:

- `FUDnnnn.ts`: el tipo `FUDnnnnParams` (si tiene datos) y la constante `FUDnnnn`, con un JSDoc
  de una línea que dice qué es y de qué SDD viene.
- `FUDnnnn.md`: la explicación pública (§4.4).

El **mensaje** se mueve tal cual está hoy. La red de seguridad es que los tests de todos los
paquetes pasan **sin cambiar una expectativa de texto** (§6.4).

### 4.3. Códigos retirados y reservados

Un código **retirado** o **quemado** (`FUD0112`, `0113`, `0293`, `0437`, `0603`, `0604`,
`0703`, `0706`, y los que liste el catálogo) tiene **solo** su `.md`, que dice que está retirado,
desde cuándo y qué lo sustituye. No tiene `.ts`, así que no se puede emitir, y su número no se
puede reutilizar, porque el fichero existe.

Un código **reservado** que nunca se usó (`FUD0722`, `FUD0786`…) no tiene fichero. Los rangos
por SDD **se mantienen** como convención para elegir el siguiente número; un número está libre si
no hay ni `.ts` ni `.md` con ese nombre.

### 4.4. El `.md`

En inglés, con una forma fija que un test comprueba:

~~~md
# FUD0050 — Closing tag does not match

**Severity:** error · **Spec:** SDD-05

## What happened
One or two sentences, in the author's terms.

## Why it is an error
The rule behind it, and what would go wrong if fudic let it through.

## Example
```fud
<!-- wrong -->
```
```fud
<!-- right -->
```

## How to fix
The concrete change.
~~~

Un retirado lleva el título, `**Retired:** <spec>` y una sección `## Replaced by`.

Este SDD solo garantiza que los `.md` existen y tienen esa forma. Convertirlos a HTML y
publicarlos en `DOCS_BASE` es de la web de documentación, que se hará con fudic y los pintará
con `@Raw` (§7).

### 4.5. Los consumidores

- **Compilador y analizadores:** cada `errorDiag('FUD0050', \`…\`, span)` pasa a
  `FUD0050({ span, open, close })`.
- **`@fudic/language-server`:** publica `docs` como `codeDescription.href` de LSP, así que en el
  editor el código sale como un enlace a su explicación.
- **La bombilla.** Todo diagnóstico `FUD` ofrece en el editor una acción **«Explain FUDnnnn»**
  que abre su `.md` en la vista previa de markdown de VS Code. Es la ayuda de quien escribe un
  `.fud` sin un LLM al lado: funciona ya, sin conexión y sin la web. Los `.md` se publican con
  `@fudic/diagnostics` (`files`) y viajan dentro del `.vsix`; el servidor recibe del cliente la
  carpeta donde están y, si no la recibe, usa la del paquete. Es una acción más, junto a las
  que ya ofrezca la bombilla para ese código (SDD-36).
- **`@fudic/vite`, `@fudic/cli`:** usan `format` para el texto de terminal, que ahora incluye la
  línea del enlace. Pasar `loc` y `frame` a Vite, y no pararse en el primer error, es de SDD-35;
  aquí solo cambia de dónde sale el texto.

### 4.6. La colisión `FUD0720`/`FUD0721`

El catálogo de SDD-12 los asigna a BUG-32, que llegó primero. SDD-41 los reutilizó en
`@fudic/config`. Se renumeran los de `config`:

| Antes | Después | Qué es |
|---|---|---|
| `FUD0720` (config) | `FUD0725` | `fudic.json` ilegible o con forma inválida |
| `FUD0721` (config) | `FUD0726` | falta el `id` obligatorio |

`FUD0720` y `FUD0721` quedan para BUG-32. SDD-41 y SDD-12 se anotan. Son los únicos tests de
texto o código que cambian (§6.4).

### 4.7. Lo que no se toca

- Los literales `FUDnnnn` **en comentarios** se quedan: son referencias, no diagnósticos.
- Los tests siguen comparando contra el string `'FUD0050'`. Es la forma más directa de afirmar
  qué código salió.

---

## 5. Invariantes

1. **Una casa.** Fuera de `packages/diagnostics/src`, ningún fichero de `src` contiene un
   literal de string `'FUDnnnn'`. Los comentarios no cuentan.
2. **Un código, un fichero.** Todo código vivo tiene `.ts` y `.md`; todo retirado, solo `.md`.
   Ningún `.ts` sin `.md`.
3. **Tipado.** Ningún código acepta parámetros sueltos: entrada y salida están tipadas por
   código, y la severidad no es un parámetro.
4. **Spans hasta pintar.** Ningún diagnóstico guarda línea ni columna. Solo `render` las calcula.
5. **Podable.** `"sideEffects": false`; ningún fichero de `codes/` ejecuta nada al importarse.
6. **Sin dependencias de runtime** en `@fudic/diagnostics`.
7. **Nada cambia para el autor** salvo `docs` y la renumeración de §4.6.

---

## 6. Criterios de aceptación

**El paquete.**

1. `@fudic/diagnostics` existe, sin dependencias de runtime y con `"sideEffects": false`.
2. Cada código vivo tiene `codes/FUDnnnn.ts` y `codes/FUDnnnn.md`, y su línea en `index.ts`. Un
   test barre `codes/` y falla si falta alguna de las tres cosas, si hay una línea en `index.ts`
   sin fichero, o si `index.ts` no está en orden numérico.
3. Cada `.md` tiene la forma de §4.4: título `# FUDnnnn — …` con el mismo número que el fichero,
   severidad igual a la del `.ts`, y las cuatro secciones (o la forma de retirado).

**La migración.**

4. Los tests de **todos** los paquetes pasan **sin cambiar una expectativa** de código, mensaje,
   severidad ni span, salvo los de `FUD0725`/`FUD0726` (§4.6).
5. Un test barre `packages/*/src` (salvo `diagnostics`) y no encuentra ningún literal de string
   `FUD` + cuatro dígitos (invariante 1).
6. `errorDiag`, `warningDiag`, `infoDiag`, `hintDiag`, `relatedError`, `FudicDiagnostic`,
   `ConfigDiagnostic` y las constantes `FUD_*` ya no existen.
7. Llamar a un código con un parámetro que falta, o con uno que no declara, no compila (test de
   tipos con `@ts-expect-error`).

**Pintar.**

8. `render` sobre un diagnóstico con span y fuente da línea y columna 1-based correctas con
   `\n`, `\r\n` y `\r`, y un `frame` con el span subrayado; sin fuente o sin span, ninguno de los
   tres campos.
9. `format` produce `ruta:línea:col - error FUD0050: mensaje`, el frame y la línea del enlace;
   con `root`, la ruta sale relativa y en POSIX.
10. En el editor, un diagnóstico `FUD` lleva `codeDescription.href` igual a su `docs`.
11. Sobre cualquier diagnóstico `FUD`, la bombilla ofrece «Explain FUDnnnn», y la acción abre
    su `.md` en la vista previa de markdown, también desde el `.vsix` instalado.
12. `docs` de cualquier código es `fudic.docs` del `package.json` + `#FUDnnnn`. Ningún fichero de
    `src` contiene la URL, y un test falla si el campo falta, está vacío o no es una URL absoluta.

**Podado.**

13. Un bundle de prueba con rolldown que importa solo `FUD0050` no contiene el texto de ningún
    otro código.

**El cierre.**

14. `@fudic/diagnostics` nace al **100 %** en las cuatro métricas. Ningún otro paquete baja de su
    suelo medido en `main` antes de empezar.
15. `pnpm typecheck`, `pnpm test` y `pnpm build` verdes, y `examples/basic` arranca en `dev` y
    construye igual que antes.
16. SDD-12 §5 apunta a `packages/diagnostics/src/codes/` como catálogo, y `CLAUDE.md` cambia su
    convención: un código nuevo es un fichero nuevo en ese paquete.

---

## 7. Fuera de alcance

- **La web de documentación.** Convertir los `.md` a HTML y publicarlos es de la web, que se
  hará con fudic y necesita `@Raw` (pendiente). Aquí solo se garantiza que los `.md` existen.
- **El MCP.** Consumirá este paquete y SDD-35; no se diseña aquí.
- **Lo de SDD-35:** `loc` y `frame` en Vite, no pararse en el primer error, `FUD0870`/`FUD0871`,
  la retirada de `FUD0197`–`FUD0199`.
- **Cambiar mensajes.** Se mueven tal cual; mejorarlos es trabajo por código, después.
- **Traducciones.** Todo en inglés: mensajes, `.md` y web.
