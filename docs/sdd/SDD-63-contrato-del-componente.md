# SDD-63 — Un componente cuenta todo sobre sí mismo: su contrato y los tokens de estilo

> **Estado:** `Listo` — [tareas](./SDD-63-Task.md).
> **Paquetes:** `@fudic/typecheck` · `@fudic/compiler` · `@fudic/language-server` ·
> `examples/workspace` · `examples/basic`
> **Depende de:** 24 (language server), 36 (la tarjeta del tag), 42 y 46 (guía de estilos y
> estilos a elección), 43 (librerías), 35 (`@fudic/typecheck`)
> **Rango de diagnósticos:** ninguno. Esta spec solo lee y enseña lo que ya está escrito.
> **Decisiones de gramática:** ninguna.
> **Origen:** [IDEA-07](./ideas/IDEA-07-mcp-de-fudic.md) §10.3, §10.4 y §11.2 (trabajo 2).
> **Rama sugerida:** `sdd-63-contrato-del-componente`
>
> **Qué añade en una frase.** El contrato de un componente dice también el valor por defecto de
> cada prop, si tiene slot sin nombre, qué recibe cada evento, sus CSS parts, qué tokens lee y
> dónde se usa; los tokens de la guía de estilos se documentan con `/** … */` y salen en el
> autocompletado y el hover de `var(--`. Todo vive en `@fudic/typecheck`, para que el editor y el
> MCP lean lo mismo.

---

## 1. Contexto y objetivo

Un componente documentado tiene que decir **cómo se usa sin abrir su fichero**. El hover del tag
ya enseña casi todo (SDD-36): la doc del componente, las props con tipo y JSDoc, los slots con
nombre y los eventos. Así sale hoy la tarjeta de `acme-button`:

```
<acme-button> · fudic component
A button for an action on the current page.

Props
- .variant? — 'primary' | 'secondary' | 'ghost'
  Visual weight.

Eventos
- @press
```

Le falta lo que hace falta para usarlo bien:

1. **El valor por defecto de `variant`.** El compilador ya lo lee (`Prop.def`, `oxc-code.ts:1824`),
   pero `propContract` lo tira (`language-server/src/mode.ts:170`).
2. **El slot sin nombre.** Se excluye a propósito (`mode.ts:180`): quien lo usa no sabe si el
   texto que mete dentro se pinta.
3. **Qué recibe el manejador de `@press`.** Solo se guarda el nombre del `emit('press')`; el
   segundo argumento no se mira.
4. **Las CSS parts.** Solo las conoce la poda de estilos del build (`emit/surface.ts:230`), para
   todo el grafo y sin decir de qué componente es cada una.
5. **Qué tokens lee el componente** y **dónde se usa**: no hay referencias de un tag.

Y los tokens de estilo no existen como símbolos. `--guia-accent` está en `libs/guia/tokens.css`,
pero el language server solo conoce los nombres de las hojas (`project-config.ts:78`); el
autocompletado de `var(--` (de `volar-service-css`) solo ve las variables del mismo `<style>`. Para
saber qué tokens hay, hay que abrir hojas. Un LLM que no las abre inventa colores.

Además, el contrato vive en `@fudic/language-server`: el MCP, que no es un editor, no podría
leerlo sin arrancar un language server. Esta spec lo mueve a `@fudic/typecheck`, que ya tiene el
índice de ficheros (`FudIndex`) y el programa TypeScript, y que usan el editor y el build.

## 2. Dependencias

| SDD | Qué aporta |
|---|---|
| 24, 36 | El language server, `WorkspaceIndex`, `contractOf` y la tarjeta del tag (`tag-card.ts`). |
| 35 | `@fudic/typecheck`: `FudIndex`, la proyección y el project checker. |
| 42, 46 | `globalStyles` y `styles` en `fudic.json`, leídos por `readProjectStyles` (`@fudic/config`). |
| 43 | Las librerías y su cadena de dependencias (`dependencyChain` de `@fudic/resolve`). |

## 3. Interfaz pública

### 3.1. El contrato

```ts
// @fudic/typecheck/contract  (entrada nueva; sin TypeScript en la parte sintáctica)
export interface Contract {
  /** The first top-level JSDoc of the `@code` block (decision 107). */
  readonly doc?: string;
  readonly props: readonly ContractProp[];
  /** The names of `<slot name="…">`, in source order. */
  readonly slots: readonly string[];
  /** True when the template has a `<slot>` without a name. */
  readonly defaultSlot: boolean;
  readonly events: readonly ContractEvent[];
  /** The literal names of every `part="…"` in its template, in source order, without repeats. */
  readonly parts: readonly string[];
  /** True when some `part` takes an expression: then `parts` may not be all. */
  readonly partsDynamic: boolean;
  /** The custom properties its `<style>` reads with `var(--…)`, in source order, without repeats. */
  readonly tokens: readonly string[];
}

export interface ContractProp {
  readonly name: string;
  readonly required: boolean;
  /** The declared type as written; with a checker, as TypeScript prints it. */
  readonly type?: string;
  /** The default value as written in the destructuring: `'primary'`, `0`, `[]`. */
  readonly default?: string;
  /** Its JSDoc (needs a checker). */
  readonly doc?: string;
}

export interface ContractEvent {
  readonly name: string;
  /** The type of the detail as TypeScript prints it (needs a checker). Absent when no `emit` passes one. */
  readonly detail?: string;
  /** The JSDoc right before the first statement that emits it. */
  readonly doc?: string;
}

/** What the source says. Pure, no TypeScript. */
export function contractOf(source: string, document: StructuredDocument): Contract;

/** The same contract with prop types, prop docs and event details from the checker. */
export function typedContract(contract: Contract, service: ts.LanguageService, file: string): Contract;
```

- `contractOf` y `typedContract` salen de `@fudic/language-server` (`mode.ts` y la parte de
  `tag-card.ts` que lee el checker, `propDetails`) y pasan a `@fudic/typecheck`. El language
  server los importa de ahí.
- Con un checker, `type` es lo que imprime TypeScript (`'primary' | 'secondary' | 'ghost'`); sin
  él, el texto tal como está escrito. Así ya funciona la tarjeta.

### 3.2. Dónde se usa

```ts
// @fudic/typecheck — FudIndex
interface IndexedFud {
  // … lo de hoy
  /** Every element in its template whose tag is a component this file links. */
  readonly uses: readonly { readonly tag: string; readonly span: Span }[];
}
class FudIndex<E> {
  // … lo de hoy
  /** Where a component tag is used, across the project and its libraries: file and span. */
  usesOf(tag: string): readonly { readonly path: string; readonly span: Span }[];
}
```

### 3.3. Los tokens

```ts
// @fudic/typecheck/tokens  (entrada nueva)
export interface Token {
  readonly name: string;          // '--acme-color-primary'
  readonly value: string;         // 'oklch(55% 0.2 260)', as written
  /** The second segment of the name when it has three or more: '--acme-color-primary' → 'color'. */
  readonly group?: string;
  /** The `/** … *\/` right before its declaration. */
  readonly doc?: string;
  /** The package that declares it, or null for the project itself. */
  readonly from: string | null;
  /** The style that holds it, by its name in fudic.json, and whether every component adopts it. */
  readonly style: { readonly name: string; readonly global: boolean };
  readonly path: string;          // the sheet
  readonly span: Span;            // the declaration
}

/** The tokens a project sees: its libraries' first (dependency order), then its own; global styles before optional ones. */
export function projectTokens(root: string, io?: TokenIo): { readonly tokens: readonly Token[]; readonly diagnostics: readonly Diagnostic[] };
```

Un **token** es una propiedad personalizada (`--x: …`) declarada en una regla `:host` o `:root` de
una hoja de `globalStyles` o de `styles`, del proyecto o de una librería de su cadena. Si el mismo
nombre se declara dos veces, valen las dos entradas, en orden: la última gana en CSS y la lista lo
enseña igual.

Se documentan como las props:

```css
:host {
  /** Main action background. Contrast with --acme-color-on-primary ≥ 4.5:1. */
  --acme-color-primary: oklch(55% 0.2 260);
  /** Base spacing step. Multiply, never invent: calc(var(--acme-space) * 2). */
  --acme-space: 0.25rem;
}
```

### 3.4. El parser de CSS guarda la doc

```ts
// @fudic/compiler — css/rules.ts
export interface CssDeclaration {
  readonly name: string;
  readonly value: Span;
  /** The `/** … *\/` comment that only whitespace separates from the declaration. */
  readonly doc?: { readonly text: string; readonly span: Span };
  // … lo de hoy
}
```

`text` es el cuerpo sin `/**`, `*/` ni los asteriscos de cada línea, como `unstarred` hace hoy
con un JSDoc. Un comentario `/* … */` (un solo asterisco) no es doc.

### 3.5. Lo que ve el desarrollador en el editor

**La tarjeta del tag** (hover), en este orden:

```
<acme-button> · fudic component · @acme/ui
A button for an action on the current page. To navigate, use acme-link-button.

Props
- .variant? — 'primary' | 'secondary' | 'ghost' = 'primary'
  Visual weight. One primary per view, for its main action.

Slots
- (default)

Events
- @press — detail: number
  Fired on click or Enter, unless disabled. The detail is the click count.

Parts
- label

Tokens
- --acme-color-primary, --acme-space
```

- La cabecera dice de qué librería viene; un componente del propio proyecto no lleva nada.
- `= 'primary'` es el valor por defecto, tal como está escrito.
- **«Events», en inglés**: hoy pone «Eventos» (`tag-card.ts:98`), y el código va en inglés.
- Una sección vacía no sale.

**Los tokens en el `<style>` de un `.fud` y en un `.css` del proyecto:**

- **Autocompletado** tras `var(--`: los tokens de `projectTokens`, con su valor y su doc; los de
  una hoja de `styles` (no global) dicen el nombre de la hoja, porque solo los ve el componente que
  la adopta.
- **Hover** sobre `--acme-color-primary` dentro de `var(…)`: valor, doc y de dónde viene.
- **Ir a la definición**: a su declaración en la hoja.

**Referencias de un tag:** «Buscar todas las referencias» sobre `<acme-button>`, en su propio
fichero o en cualquier uso, lista cada uso del proyecto y de sus librerías (`usesOf`).

## 4. Comportamiento

### 4.1. El contrato, pieza a pieza

- **`default`.** El texto del valor por defecto de la desestructuración de `props<T>()`
  (`Prop.def`). Sin defecto, no va.
- **`defaultSlot`.** Hay un `<slot>` sin `name`, o con `name=""`, en el template.
- **`events`.**
  - El nombre, como hoy: el primer argumento literal de cada `emit('…')` de `@fudic/dom`.
  - `doc`: el JSDoc que precede a la **sentencia** que contiene el primer `emit` de ese nombre,
    con solo espacio entre medias.

    ```ts
    /** Fired on click or Enter, unless disabled. The detail is the click count. */
    emit('press', count);
    ```
  - `detail` (con checker): el tipo del segundo argumento en cada `emit` de ese nombre. Varios
    tipos distintos salen unidos con ` | ` en el orden en que aparecen. Para eso `EmitCall` (del
    compilador) gana el `Span` de su segundo argumento.
- **`parts`.** Cada `part="…"` del template de ese componente: los valores literales, partidos por
  espacios. Un valor con expresión pone `partsDynamic`. Es la misma lectura que ya hace la poda
  (`partsOf`), pero por componente.
- **`tokens`.** Los nombres de cada `var(--…)` del `<style>` del componente, en orden.

### 4.2. Un componente, una pasada de Oxc

Hoy `contractOf` llama dos veces a `extractCode` (`mode.ts:142` y `:170`), aunque un comentario
diga que está memoizado. El contrato usa `codeOfDocument`, la versión memoizada por documento.

### 4.3. Los tokens

- `projectTokens` recorre la cadena (`dependencyChain`, dependencias primero) y, en cada paquete,
  `readProjectStyles`: primero las globales, después las de `styles`. Cada hoja se parsea con
  `parseCssRules`.
- **Qué reglas.** `:host` y `:root`, también dentro de `@layer`. Una propiedad personalizada en
  cualquier otra regla no es un token: es una variable local.
- **El valor** es el texto del valor, recortado.
- **Una hoja que no se puede leer** da su diagnóstico de `@fudic/config` (los que ya existen) y la
  lista sigue con las demás.
- **El language server** guarda el resultado por proyecto y lo invalida cuando cambia una hoja de
  la cadena o un `fudic.json`.

### 4.4. `usesOf`

- `uses` se calcula al indexar cada fichero, de los elementos de su template cuyo tag es el de un
  componente que el fichero enlaza (`<link rel="component">`), con el `Span` de la etiqueta.
- `usesOf(tag)` junta los de todos los ficheros del índice, ordenados por ruta y posición.

## 5. Invariantes

- **Nada lanza.** Un `.fud` o una hoja rotos dan un contrato o una lista parcial.
- **Una fuente.** El hover, el autocompletado y lo que leerá el MCP salen de las mismas funciones.
- **Orden fijo**, por ruta y posición, en todo lo que devuelve una lista.
- **Cobertura:** lo nuevo de `@fudic/typecheck` y del compilador al 100 % en las cuatro métricas;
  `@fudic/language-server` no baja de su 100 %.

## 6. Criterios de aceptación

**El contrato**

1. **Defecto.** `const { variant = 'primary' } = props<{ variant?: 'primary' | 'ghost' }>()` da
   una prop con `default: "'primary'"` y `required: false`.
2. **Slot sin nombre.** Un template con `<slot></slot>` y `<slot name="icon">` da
   `defaultSlot: true` y `slots: ['icon']`; uno sin `<slot>`, `defaultSlot: false`.
3. **Eventos.** `emit('press', count)` con `count: number` y un JSDoc encima da
   `{ name: 'press', detail: 'number', doc: '…' }` con checker y `{ name: 'press', doc: '…' }`
   sin él. `emit('close')` sin segundo argumento no lleva `detail`. Dos `emit('change', …)` con
   `string` y `number` dan `detail: 'string | number'`.
4. **Parts.** `part="label icon"` y `part="label"` dan `parts: ['label', 'icon']`;
   `part=@(cls)` pone `partsDynamic: true`.
5. **Tokens leídos.** Un `<style>` con `color: var(--acme-color-primary); padding: var(--acme-space)`
   da `tokens: ['--acme-color-primary', '--acme-space']`.
6. **Una pasada.** Construir el contrato de un componente llama a Oxc una sola vez (test con un
   espía sobre el parser).

**Los tokens**

7. **El parser guarda la doc.** `/** Main. */ --a: 1;` da `doc.text === 'Main.'`; `/* no */ --a: 1;`
   no da doc.
8. **`projectTokens` en el workspace de ejemplo.** En `examples/workspace/apps/tienda` devuelve los
   tokens de `libs/guia/tokens.css` (con `from: '@fudic/example-guia'`, su doc y `group`) antes
   que los de la propia app, cada uno con su `path` y su `span`.
9. **Solo `:host` y `:root`.** `.card { --local: 1 }` en una hoja global no es un token.
10. **Una hoja rota** da su diagnóstico y los tokens de las demás.

**El editor**

11. **La tarjeta** de un componente de `libs/ui` usado desde `apps/tienda` sale con las seis
    secciones de §3.5 cuando las tiene, en ese orden, con «Events» en inglés y la librería en la
    cabecera.
12. **`var(--`** en el `<style>` de un `.fud` de `apps/tienda` ofrece `--guia-accent` con su valor
    y su doc. El hover sobre él dice valor, doc y librería; ir a la definición abre `tokens.css`
    en su línea.
13. **Referencias.** Sobre `<ui-card>` en `apps/tienda`, «Buscar todas las referencias» lista sus
    usos en las dos apps.
14. **Nada se rompe.** El completado de props, la comprobación de props requeridas y los
    argumentos de huecos (`hole-args.ts`), que leen el contrato, siguen con sus tests en verde.

**La evidencia**

15. `examples/workspace/libs/guia/tokens.css` documenta cada token con `/** … */`, y `ui-card`
    documenta su componente, sus props y su slot por defecto: la tarjeta y `projectTokens` lo
    enseñan sin más cambios.

**Entrega**

16. `pnpm typecheck`, `pnpm test` y `pnpm build` en verde; lo nuevo al 100 % en las cuatro
    métricas, sin `v8 ignore`; ningún umbral baja.

## 7. Fuera de alcance

- **Las herramientas del MCP** `fudic_describe` y `fudic_symbols`, y el `example` y el `link` que
  generan desde el contrato: la spec del MCP.
- **La regla «solo tokens»** (un literal con token equivalente): IDEA-07 §11.3.
- **Doc de un slot y de una part.** No hay sintaxis para documentarlos en el template; se añadirá
  si hace falta.
- **Renombrar un tag** desde el editor.

## 8. Decisiones

### 8.1. Tomadas al redactar

1. **El contrato vive en `@fudic/typecheck`.** Es el paquete que ya comparten el editor y el build
   (SDD-35), y tiene el índice y el programa TypeScript. En el language server, el MCP tendría que
   arrancar un servidor LSP para leer un tipo.
2. **`slots` sigue siendo una lista de nombres y `defaultSlot` va aparte.** Cambiarla a objetos
   obligaría a tocar a todos los que la leen (`hole-args.ts`) para nada.
3. **`detail` como texto del checker, no como tipo propio.** Es lo que enseña el hover y lo que
   leerá un LLM; un tipo estructurado no añade nada que se use.
4. **El grupo de un token sale de su nombre**, sin configurar: el segundo segmento cuando hay tres
   o más. Con dos (`--guia-ink`) no hay grupo. Pedir un campo en `fudic.json` sería una norma de
   nombres, y esas las pone el usuario.
5. **Tokens: `:host` y `:root`.** `:host` es como se escribe una hoja adoptada en un shadow root
   (SDD-42); `:root`, la de una página. Lo demás son variables locales de una regla.
