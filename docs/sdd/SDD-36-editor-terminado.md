# SDD-36 — La bombilla y la tarjeta del componente

> **Estado:** `Listo`
> **Paquetes:** `@fudic/language-server` · `fudic-vscode`
> **Depende de:** 24 (el servidor), 23 (la proyección), 26 (el formateador), 25 (la extensión),
> BUG-23 (`requiredProps` del índice, `propsOf`/`slotsOf` del registro)
> **Rango de diagnósticos:** `FUD0640`–`FUD0659` — reservado y vacío: una acción de código no
> diagnostica, repara lo que otro diagnosticó
> **Decisiones de gramática:** 107 (dónde se documenta un componente)

---

## 1. Objetivo

Dos cosas, y nada más:

1. **La bombilla.** Cada diagnóstico que se puede arreglar solo, trae su arreglo.
2. **El hover del componente.** Pasar el ratón por `<app-button>` y ver props, slots y eventos.

Más una tercera de una línea, pedida aparte: **el formateador de fudic corre al guardar**.

Nada de esto es conocimiento nuevo. `provideCodeActions` ya existe y sirve un caso; `propsOf` y
`slotsOf` ya saben qué declara un componente. Falta ofrecerlo.

---

## 2. Dependencias

| Fuente | Aporta |
|---|---|
| SDD-24 | `provideCodeActions`, `provideHover`, `RequestStats.run`, `regionAt`, `fudicDocumentOf`, `tagNameAt`. |
| BUG-23 | `IndexEntry.requiredProps`, `linkInsertionFor` (fabrica el `<link rel="component">`), `DocumentJs.loops` (la cabecera de un bucle, parseada). |
| SDD-23 | La proyección: de ahí sale el **tipo** de una prop, que el índice no sabe. |
| SDD-26 / SDD-25 | El formateador y el manifiesto. |

---

## 3. Interfaz pública

### 3.1. Las acciones de código

El servidor ya declara `codeActionProvider`. Cambia **qué** devuelve: un `CodeAction` con
`kind: 'quickfix'`, título en español y un `WorkspaceEdit` completo. Ninguna usa `command` ni
`resolve`.

| Diagnóstico | Título | Escribe |
|---|---|---|
| `FUD0191` componente sin declarar | `Añadir <link rel="component"> de <tag>` | El `<link>` en el `<head>` |
| `FUD0056` valor sin comillas | `Entrecomillar el valor` | Comillas alrededor del valor |
| `FUD0540` bucle sin `key` | `Añadir key (…)` | ` key (<binding>)` tras la cabecera |

Una fila que no se pueda construir con certeza **no se ofrece**.

**`FUD0197` y `FUD0199` no están, y la medida es la razón.** Las dos reglas de contrato de BUG-23
necesitan `propsOf` y `slotsOf`, que el registro del servidor no expone; dárselos las enciende en
el editor y con ellas llega la duplicación: `.currnt=` sobre un componente pasa a dar `TS2561`
**y** `FUD0198`, el mismo error dos veces, y solo uno de los dos sabe que el nombre era `current`.
En el build no hay TypeScript y los tres `FUD019x` son la única red; en el editor TypeScript **es**
la red. Una voz por hecho, que es la regla que costó un mes aprender.

### 3.2. La tarjeta del componente

```ts
export interface CardProp {
  readonly name: string;
  readonly required: boolean;
  /** From the projection. Absent when TypeScript did not answer. */
  readonly type?: string;
  /** The JSDoc the author wrote on the member of `props<T>()`. */
  readonly doc?: string;
}

export interface TagCard {
  readonly tag: string;
  /** Absolute path of the `.fud` that declares it. */
  readonly file: string;
  readonly props: readonly CardProp[];
  /** `<slot name="…">` of the child; `''` is the default slot. */
  readonly slots: readonly string[];
  /** The events the child dispatches — decision 107. */
  readonly events: readonly string[];
  /** The JSDoc that documents the component itself — decision 107. */
  readonly doc?: string;
}

export function tagCardAt(
  cached: CachedDocument,
  index: WorkspaceIndex,
  offset: number,
): TagCard | undefined;
```

### 3.3. Decisión 107 — dónde se documenta un componente

Sin sintaxis nueva. Tres sitios, todos JSDoc, todos donde el autor ya escribiría un comentario:

| Qué | Dónde |
|---|---|
| El componente | El JSDoc inmediatamente anterior a `props<T>()`. Sin `props<T>()`, el primer JSDoc del `@code`. |
| Una prop | El JSDoc del miembro dentro de `props<{ … }>()`. Es TypeScript normal. |
| Un evento | El JSDoc del `dispatchEvent(new CustomEvent('x'))` que lo lanza. |

Los eventos se leen del `@client`: cada `new CustomEvent('nombre')` declara uno. Es lo que hay
—no existe declaración de eventos en la gramática— y es honesto: lo que el componente lanza.

### 3.4. El formato al guardar

Una línea en `configurationDefaults["[fudic]"]` del manifiesto:

```json
"editor.formatOnSave": true
```

Alcanza solo a los `.fud`, y `editor.defaultFormatter` ya apunta al de fudic en la misma sección.
Un ajuste del usuario gana: esto es un defecto, no una imposición.

---

## 4. Comportamiento

### 4.1. Una acción se ancla en un diagnóstico

`provideCodeActions` recibe el contexto con los diagnósticos que hay bajo el rango. Cada fila mira
**el código**, no el texto bajo el cursor. Sin diagnóstico, sin bombilla.

### 4.2. `FUD0197` escribe la diferencia

El diagnóstico nombra el tag, el índice sabe qué requiere, el AST sabe qué está escrito. Se escribe
lo que falta, un tabstop por prop, con la forma de la expansión de tag: `.name=$1`, sin comillas
(lo que va ahí puede ser escalar, expresión o cadena). Sin `requiredProps`, sin acción.

### 4.3. `FUD0191` reutiliza `linkInsertionFor`

Es el mismo `TextEdit` que ya fabrica el completado de tag. Cero lógica nueva y cero posibilidad
de que las dos discrepen.

### 4.4. `FUD0540` lee el binding de la cabecera

De `DocumentJs.loops`, el mismo sitio del que sale el ámbito. Varios bindings → el primero.
Ninguno → sin acción, que ya es `FUD0543`.

### 4.5. La tarjeta se construye en dos mitades y la segunda puede faltar

1. **El índice**, síncrono y siempre: tag, fichero, props con su marca de requerida, slots,
   eventos, doc.
2. **La proyección**, si TypeScript contesta: el tipo de cada prop.

Se renderiza con lo que haya. Un hover que espera a TypeScript para no enseñar nada es un hover que
no aparece, y eso el desarrollador no lo distingue de «no hay hover». Es la lección de BUG-23 §2.9,
aplicada antes de que cueste.

### 4.6. La tarjeta es del **tag**, y solo del tag

Sobre un `<div>` no hay tarjeta: un nativo no tiene contrato de fudic y HTML ya lo describe. Sobre
un tag que el índice no conoce, tampoco. El hover de una prop, de un evento o de una expresión ya
lo da TypeScript sobre la proyección y es correcto.

---

## 5. Invariantes

1. Una acción se ancla en un diagnóstico, nunca en la posición a secas.
2. Degradar es no ofrecer: nada se construye con un dato incierto.
3. Una sola fuente por hecho: el `<link>` de `linkInsertionFor`, las props del índice, el binding
   del `JsBatch`. Ninguna acción re-deriva con una expresión regular lo que ya está parseado.
4. La tarjeta se degrada por mitades, y la que depende de TypeScript es siempre la segunda.
5. El `WorkspaceEdit` viaja completo en la acción: sin `resolve`, sin `command`.
6. El manifiesto no rebinda ninguna tecla.

### Catálogo de diagnósticos (`FUD0640`–`FUD0659`)

Reservado y vacío. Este SDD repara y describe; no diagnostica.

---

## 6. Criterios de aceptación

**La bombilla**

1. Con `FUD0191`, inserta el `<link rel="component">` con el mismo `href` que `linkInsertionFor`.
2. Un tag que el workspace no tiene no ofrece acción: el `href` no se inventa.
3. `<app-badge-large>` no se confunde con `app-badge`: el límite del nombre es parte de la regla.
4. Con `FUD0056`, entrecomilla exactamente el valor: no toca el nombre del atributo ni el `=`.
5. Un valor que ya lleva una comilla dentro no se entrecomilla: no hay reparación cierta.
6. Con `FUD0540` en `@foreach (const item of items)`, escribe ` key (item)` tras el `)`.
7. En `@foreach (const { id, tag } of xs)` usa `id`.
8. En `@foreach (x of xs)` y en una cabecera que Oxc no pudo leer, no se ofrece.
9. Un diagnóstico reparable fuera del rango preguntado no ofrece nada.
10. Una posición sin diagnósticos no ofrece ninguna.
11. El caso del `href` que ya existía sigue funcionando igual.
12. Un fichero sano no ofrece nada en absoluto.

**La tarjeta**

13. El hover sobre `<app-circle>` trae tag, ruta, props con su marca de requerida, slots y eventos.
14. Se mide con TypeScript **caído**: la tarjeta aparece igual, sin la columna de tipos.
15. Con TypeScript vivo, cada prop trae su tipo.
16. El JSDoc del componente y el de cada prop aparecen tal cual (decisión 107).
17. Los eventos son los `new CustomEvent('x')` del `@client` del hijo, sin repetidos y en orden.
18. Un tag que el índice no conoce no devuelve tarjeta. Un `<div>` tampoco.

**El guardado**

19. `editor.formatOnSave` está en `configurationDefaults["[fudic]"]`, y `editor.defaultFormatter`
    sigue siendo `fudic.fudic-vscode`. El manifiesto no contribuye keybinding sobre `tab`.

**El listón**

20. `@fudic/language-server` y `fudic-vscode` al 100 % en las cuatro métricas.

---

## 7. Fuera de alcance

- El renombrado cruzando ficheros (IDEA-02 §3): no se toca, ni para medirlo.
- Acciones que no reparan un diagnóstico (extraer componente, envolver en `@if`).
- El hover de una prop, un evento o una expresión: ya lo da TypeScript.
- `fudic check` (SDD-35) y el banco de trabajo (SDD-32).
