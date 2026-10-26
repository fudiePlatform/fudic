# SDD-62 — Diagnósticos que dicen la verdad: el catálogo y las bombillas, listos para un LLM

> **Estado:** `Listo` — [tareas](./SDD-62-Task.md).
> **Paquetes:** `@fudic/diagnostics` · `@fudic/compiler` · `@fudic/language-server` ·
> `fudic-vscode`
> **Depende de:** 50 (catálogo), 36 (la bombilla), 24 (language server), 61 (la vista portable,
> que reescribe y añade códigos: esta spec parte de su catálogo)
> **Rango de diagnósticos:** `FUD1160`–`FUD1179` (nuevo). Usa `FUD1160`–`FUD1162`.
> **Decisiones de gramática:** ninguna.
> **Origen:** [IDEA-07](./ideas/IDEA-07-mcp-de-fudic.md) §5.5, §5.6, §5.11 y §11.2 (trabajo 1).
> **Rama sugerida:** `sdd-62-diagnosticos-que-dicen-la-verdad`
>
> **Qué añade en una frase.** Cada explicación de un código se lee como datos (título, severidad,
> porqué, arreglo), no cita documentos internos y su arreglo está probado con un par de ficheros
> roto/arreglado; las bombillas solo proponen arreglos correctos, en inglés, y se pueden pedir sin
> editor; y los reflejos de React que un LLM trae tienen su propio código.

---

## 1. Contexto y objetivo

El MCP (IDEA-07) se apoya en una promesa: **el diagnóstico le dice al LLM qué está mal y cómo se
arregla**. El LLM lo leerá al pie de la letra, sin el criterio de una persona para darse cuenta de
que un texto está desfasado. Hoy esa promesa falla en cuatro sitios.

**1. Explicaciones que contradicen el código.**

```
# FUD0191 — Undeclared component
**error** · SDD-12

A hyphenated tag is a custom element, and every custom element a file uses has to be declared…
**Fix:** declare it in the `<head>`: `<link rel="component" href="./app-card.fud">`.
```

En un componente y en una ruta, el `<link rel="component">` va **arriba del todo**, no en el
`<head>` (`document/anchor.ts:85-108`; así están todas las fixtures de `examples/basic`). Solo una
página y un layout lo leen del `<head>`. Un LLM que siga este `.md` en un componente escribe un
fichero que el compilador rechaza. Y no es el único: nadie comprueba que un arreglo funcione.

**2. Explicaciones que citan documentos internos.** 351 de 379 `.md` llevan `· SDD-12` en la
segunda línea, y 28 citan una SDD en el texto («This is the SDD-48 rule that was numbered
`FUD0440` before»). A un usuario y a un LLM no les dice nada.

**3. Bombillas que arreglan mal o hablan español.**

- La de `FUD0540` añade `key (item)`: la variable entera del bucle
  (`language-server/src/services/actions.ts:157-176`), mientras su `.md` enseña `key (item.id)`.
  Con la vista portable (SDD-61) una clave es `string` o `number`: la bombilla cambia un error por
  otro.
- La de `FUD0056` sobre `onClick={f}` escribe `onClick="{f}"`.
- Once títulos están en español («Añadir key (item)», «Entrecomillar el valor», «Completar las
  props requeridas de <x>»…).
- Y solo se pueden pedir desde un editor: las funciones viven dentro del plugin de Volar.

**4. Los reflejos de React no tienen código.** Un LLM que no conoce fudic escribe React:

| Escribe | Hoy |
|---|---|
| `<div className="card">` | Nada. Un atributo desconocido; la clase no se aplica |
| `<button onClick={save}>` | `FUD0909` (atributo de evento nativo) y `FUD0056` (valor sin comillas), con una bombilla que lo empeora |
| `{items.map(i => <li>{i}</li>)}` | Nada. Se pinta el código como texto |
| `{open && <p>Hi</p>}` | Nada. Igual |

Esta spec deja el catálogo y las bombillas en estado de **poder fiarse de ellos sin mirar**.

## 2. Dependencias

| SDD | Qué aporta |
|---|---|
| 50 | `@fudic/diagnostics`: un `.ts` y un `.md` por código, `explanationFile`, el test de forma (`catalog.test.ts`). |
| 36 | La bombilla del editor: `REPAIRS` y las acciones de contrato y de control (`actions.ts`). |
| 24 | El language server y el TypeScript de la proyección, que da el tipo de un iterable. |
| 61 | La vista portable: reescribe `FUD0905`–`FUD0919`, añade `FUD1140`–`FUD1153` y fija que una clave es `string` o `number`. **Esta spec nace de `main` con SDD-61 en `Hecho`**: así migra también sus catorce `.md`. |

## 3. Interfaz pública

### 3.1. La forma del `.md`, cerrada

```md
# FUD0540 — Loop without `key (…)`
**error**

Every `@foreach`, `@for` and `@while` declares the identity of its rows, so an update can keep, move or drop each one instead of rebuilding the list.
**Fix:** add a key after the header: `@foreach (const item of items) key (item.id) { … }`.
```

1. `# FUDnnnn — <título>`.
2. `**<severidad>**`, **sin origen**. La severidad es `error`, `warning`, `info`, `hint` o `retired`.
3. Una línea en blanco.
4. El porqué: una o más líneas de texto, sin encabezados.
5. La última línea: `**Fix:** …` en un código vivo, `**Replaced by:** …` en uno retirado.
   **Nada después.**

En ninguna parte del `.md` aparece `SDD-` ni `BUG-`. El origen de cada código se queda donde lo
lee quien mantiene fudic: en el JSDoc de su `.ts` (`/** … (SDD-30). */`), que ya lo lleva en casi
todos.

### 3.2. La explicación como datos

```ts
// @fudic/diagnostics/explain
export interface Explanation {
  readonly code: FudCode;
  readonly title: string;
  readonly severity: Severity | 'retired';
  readonly why: string;            // the body lines joined with a space
  readonly fix?: string;           // the text after **Fix:** (live codes)
  readonly replacedBy?: string;    // the text after **Replaced by:** (retired codes)
}

/** Reads and splits a code's .md. Undefined for a code with no .md. Never throws. */
export function explain(code: string, dir?: string): Explanation | undefined;
```

`explanationFile` y `explanationsDir` siguen como están.

### 3.3. Las reparaciones, sin editor

```ts
// @fudic/language-server/repairs  (entrada nueva)
export interface Repair {
  readonly title: string;                      // English
  readonly code: FudCode;                      // the diagnostic it repairs
  readonly edits: readonly RepairEdit[];
}
export interface RepairEdit {
  readonly path: string;                       // the file to change (create when it does not exist)
  readonly span: Span;                         // empty span = insert
  readonly newText: string;
}

/** The repairs for one diagnostic of one file. Several = the author chooses; empty = none is safe. */
export function repairsFor(input: RepairInput, diagnostic: SourceDiagnostic): readonly Repair[];
```

- `RepairInput` es lo que hoy reciben las funciones de `REPAIRS`: el fichero parseado, el índice
  del workspace y, cuando hace falta, el servicio de TypeScript.
- El plugin de Volar pasa a ser un adaptador: llama a `repairsFor` y convierte cada `Repair` en un
  code action. Lo que ve el desarrollador no cambia, salvo los títulos (§4.4) y las bombillas que
  dejan de salir porque arreglaban mal (§4.3).
- La «Explain FUDnnnn» y las acciones que no cuelgan de un código `FUD` (las de contrato, que
  cuelgan de errores de TypeScript, y `controlFixes`, que cuelga del cursor) se quedan en el plugin.

### 3.4. Los códigos nuevos

| Código | Severidad | Título (`.md`) | Cuándo | Span |
|---|---|---|---|---|
| `FUD1160` | error | A React prop name as an HTML attribute | `className` o `htmlFor` como atributo de un elemento (en cualquier forma de mayúsculas) | el nombre |
| `FUD1161` | error | A JSX expression as an attribute value | Un valor sin comillas que empieza por `{` y acaba en `}` | el valor |
| `FUD1162` | warning | JSX in the markup | Un texto que contiene `{`, después una expresión con `.map(` y `=>`, o con `&&` seguido de `<`, y `}` | desde `{` hasta su `}` |

**Fix** de cada `.md`:

- `1160`: «write the HTML name: `class="card"`, `for="email"`; a class that changes is `class:active=@on`».
- `1161`: «bind with `@`: `.value=@x` for a property, `title="@x"` for an attribute, `@click=@save` for an event».
- `1162`: «write the loop or the condition with `@foreach (const item of items) key (item.id) { … }` or `@if (open) { … }`».

## 4. Comportamiento

### 4.1. El catálogo se migra

- **El origen sale del `.md`.** La segunda línea queda en `**<severidad>**`. Si el JSDoc del `.ts`
  no nombra ya su SDD o su BUG, se le añade el que tenía el `.md`; un retirado no tiene `.ts` y su
  origen se pierde del catálogo (sigue en el `INDEX.md` y en git).
- **Las 28 menciones del cuerpo** se reescriben diciendo lo que pasa, sin el documento: «This rule
  was numbered `FUD0440` before» en lugar de «This is the SDD-48 rule…».
- **`FUD0725`**, el único con texto después de `**Fix:**`, mete sus tres ejemplos dentro de la
  línea del arreglo, separados por `;`.
- **Las explicaciones desfasadas se corrigen**, empezando por las que destapó IDEA-07:
  - `FUD0191`: el arreglo depende del papel del fichero. «In a component or a route, put it at the
    top of the file (a route: after its `<link rel="layout">`); in a page or a layout, inside
    `<head>`: `<link rel="component" href="./app-card.fud">`».
  - `FUD0907`: lo deja corregido SDD-61; aquí solo se comprueba con su par (§4.2).
  - Cualquier otro que su par (§4.2) demuestre equivocado.

### 4.2. Cada arreglo, probado con un par de ficheros

Para cada código vivo cuyo `**Fix:**` lleva un ejemplo de código, y que sale de un `.fud`, una
`.fudspec` o un `.fudapi`, hay un par en `packages/diagnostics/fixtures/`:

```
fixtures/FUD0540.fud          # broken: gives FUD0540, and nothing else
fixtures/FUD0540.fixed.fud    # the Fix applied: gives nothing at all
```

- **«Lleva un ejemplo de código»**: el `Fix` tiene algún fragmento entre comillas invertidas con
  `<`, `@` o `{`. Hoy son unos 165. La lista no se escribe a mano: el test la saca de los `.md`, y
  un `.md` de esa clase sin par es un test en rojo.
- **Roto**: pasa por el mismo pase que el build (parser, semántica y pase tipado, el de
  `@fudic/typecheck`) y da **ese código al menos una vez y ningún otro error**.
- **Arreglado**: el mismo fichero con el arreglo del `.md` aplicado; da **cero diagnósticos**.
- Un par puede necesitar ficheros de apoyo (un componente enlazado, un layout, un `.fudapi`): van
  en `fixtures/FUDnnnn/` con el par dentro.
- Un código que sale de otra cosa (`fudic.json`, la CLI, el banco) no lleva par: su arreglo no es
  un fichero del lenguaje. Esos se revisan a mano en la tarea de migración.

### 4.3. Las bombillas solo arreglan bien

- **`FUD0540`** (`key` de un bucle). La bombilla propone:
  - `key (id)` si la cabecera desestructura un campo `id` (`const { id, name } of xs`);
  - `key (x.id)` si el tipo del elemento tiene un campo `id` de tipo `string` o `number`;
  - `key (x)` si el elemento es un `string` o un `number`;
  - **nada** en otro caso. Es un arreglo que cambia el diseño y lo decide quien escribe.
  El tipo sale del servicio de TypeScript de la proyección. Sin servicio, solo el primer caso.
- **`FUD0056`** (valor sin comillas). No se ofrece cuando el valor empieza por `{`: ese caso es ya
  `FUD1161` (§4.5), que lleva su propio arreglo.
- **Una regla general:** una bombilla que, aplicada, deja el fichero con un error nuevo en el mismo
  sitio es un defecto. Los tests de cada reparación lo comprueban (§6).

### 4.4. Las bombillas, en inglés

| Hoy | Pasa a |
|---|---|
| `Escribir @x` / `Envolver en @( … )` | `Write @x` / `Wrap in @( … )` |
| `Entrecomillar el valor` | `Quote the value` |
| `Añadir <link rel="component"> de <x>` | `Add <link rel="component"> for <x>` |
| `Añadir las secciones requeridas del layout (a, b)` | `Add the layout's required sections (a, b)` |
| `Añadir key (x)` | `Add key (x)` |
| `Completar las props requeridas de <x>` | `Add the required props of <x>` |
| `Cambiar a .x` | `Change to .x` |
| `Quitar slot="x"` | `Remove slot="x"` |
| `Cambiar a slot="x"` | `Change to slot="x"` |
| `Completar las props requeridas del layout` | `Add the layout's required props` |
| `Enlazar control=x` | `Bind control=x` |

Un test recorre los títulos de todas las reparaciones y acciones del language server y falla si
alguno no es ASCII inglés (sin `ñ`, tildes ni palabras de una lista corta en español).

### 4.5. Los reflejos de React

- **`FUD1160`.** Lo emite el analizador de atributos nativos, junto a `FUD0909`, sobre elementos
  nativos y sobre componentes (un componente tampoco tiene un atributo `className`: su prop sería
  `.className`). Su bombilla cambia el nombre (`className` → `class`, `htmlFor` → `for`).
- **`FUD1161`.** Lo emite el parser HTML en el mismo sitio donde hoy emite `FUD0056` para un valor
  sin comillas, **en su lugar**: un hecho, una voz. Con `onClick={f}` salen `FUD0909` sobre el
  nombre y `FUD1161` sobre el valor; ninguna bombilla los arregla a ciegas, porque el nombre del
  evento y la forma del binding los elige quien escribe.
- **`FUD1162`.** Lo emite un analizador nuevo sobre los nodos de texto del markup. Es `warning`
  porque un texto puede querer enseñar código de verdad (un tutorial): en ese caso se escribe
  dentro de `<code>`, y dentro de `<code>` y `<pre>` no se emite.
- `useState`, `useEffect` y compañía no necesitan código: el import de `react` no resuelve, y lo
  dice TypeScript. `props.x` y `children` leídos en la vista ya dan `FUD0907`; su mensaje gana dos
  variantes que lo dicen: «`props` is a function in `@code`: read the destructured name» y «use a
  `<slot>` for the content between the tags».

## 5. Invariantes

- **Lo que dice el `.md` funciona**, comprobado por su par.
- **Un hecho, una voz.** `FUD1161` sustituye a `FUD0056` en su caso; nunca salen los dos.
- **Nada lanza.** `explain` y `repairsFor` devuelven `undefined` o una lista vacía.
- **Sin texto en español** en el catálogo, en los mensajes ni en los títulos de las bombillas.
- **Cobertura:** `@fudic/diagnostics` y `@fudic/language-server` siguen al 100 % en las cuatro
  métricas; el compilador no baja.

## 6. Criterios de aceptación

**El catálogo**

1. **La forma.** Los `.md` cumplen §3.1 exactamente: el test de forma comprueba además que la
   segunda línea es solo la severidad, que la última es `**Fix:**` o `**Replaced by:**` y que no
   hay `SDD-` ni `BUG-` en ningún sitio del fichero.
2. **El origen sigue escrito.** Cada `.ts` nombra en su JSDoc una SDD o un BUG.
3. **`explain`.** `explain('FUD0540')` devuelve título, severidad, porqué y arreglo con los textos
   del `.md`; `explain('FUD1000')` (retirado) devuelve `replacedBy`; `explain('FUD9999')`,
   `undefined`.
4. **`FUD0191`** dice dónde va el enlace según el papel del fichero, y sus pares lo prueban en un
   componente, en una ruta y en una página.

**Los pares**

5. Cada código vivo con ejemplo de código en su arreglo, que sale de un `.fud`, una `.fudspec` o un
   `.fudapi`, tiene su par; el roto da ese código y ningún otro error; el arreglado, nada.
6. Un `.md` de esa clase sin par, o un par que no cumple, deja el test en rojo diciendo el código.

**Las bombillas**

7. **`FUD0540`.** Sobre `@foreach (const item of items)` con `items: Item[]` e `Item` con `id: string`,
   la bombilla escribe `key (item.id)`; con `items: string[]`, `key (item)`; con
   `const { id, name } of items`, `key (id)`; con un `Item` sin `id`, no hay bombilla. Aplicar
   cualquiera de las tres deja el fichero sin diagnósticos.
8. **`FUD0056`** no ofrece bombilla sobre `onClick={f}`.
9. **`repairsFor`** devuelve las mismas reparaciones que el editor ofrece, para cada código de la
   tabla, sin arrancar un language server (test en proceso).
10. **Inglés.** Todos los títulos de §4.4 salen en inglés; el test de títulos recorre todas las
    acciones.

**Los reflejos de React**

11. `<div className="card">` y `<label htmlFor="email">` dan `FUD1160` sobre el nombre, y su
    bombilla los deja en `class` y `for` sin más diagnósticos.
12. `<button onClick={save}>` da `FUD0909` y `FUD1161`, y ya no `FUD0056`.
13. `<ul>{items.map(i => <li>{i}</li>)}</ul>` y `<div>{open && <p>Hi</p>}</div>` dan `FUD1162`;
    lo mismo dentro de `<code>` o `<pre>`, nada; un texto `{ name }` suelto, nada.
14. `@props.title` en la vista da `FUD0907` con la variante de `props`; `@children`, con la de
    `<slot>`.

**Entrega**

15. Los tres códigos nuevos tienen `.ts`, `.md` y línea en `index.ts`, y su par. `pnpm typecheck`,
    `pnpm test` y `pnpm build` en verde; lo nuevo al 100 % en las cuatro métricas; ningún umbral
    baja. `examples/` sigue sin diagnósticos.

## 7. Fuera de alcance

- **Las herramientas del MCP** `fudic_check`, `fudic_fix` y `fudic_guide`: la spec del MCP. Aquí
  solo lo que leerán (`explain`, `repairsFor`).
- **Reparaciones nuevas** para códigos que hoy no tienen bombilla. Cada una es una vuelta menos del
  bucle, pero se añaden cuando el uso diga cuáles faltan.
- **La web de documentación** que pinta los `.md` (SDD-50 §7).
- **La guía de fudic para el LLM** (`fudic_guide`) y sus ejemplos: la spec del MCP, que los probará
  con la misma técnica de pares.

## 8. Decisiones

### 8.1. Tomadas al redactar

1. **El origen sale del `.md` y se queda en el `.ts`.** El `.md` es la ayuda de quien escribe un
   `.fud` (y de un LLM); la SDD solo le sirve a quien mantiene fudic, que lee el `.ts`. Es la misma
   regla que ya siguen los README.
2. **Pares roto/arreglado, no ejemplos sueltos compilados.** Los ejemplos del `Fix` son fragmentos
   con `…` dentro; no compilan solos. Un par prueba lo que importa: que el código salta donde dice
   y que el arreglo lo quita.
3. **Una bombilla con varias salidas razonables no se ofrece.** `FUD0540` sobre un objeto sin `id`
   es un caso: elegir la clave es diseño. El MCP la tratará como no `fixable`.
4. **`FUD1162` es `warning`.** Un texto puede querer enseñar código. Lo que se rompe —el usuario ve
   código en la página— lo justifica; que pueda ser intencionado lo deja en aviso.
5. **`repairsFor` en `@fudic/language-server`, en una entrada propia.** Las reparaciones necesitan
   el índice del workspace y el TypeScript de la proyección, que ya viven ahí; moverlas a otro
   paquete arrastraría a los dos.
