# SDD-36 — La bombilla y la tarjeta del componente

> **Estado:** `Hecho`
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

**Y tres más que no se anclan en un diagnóstico nuestro, sino en el contrato** (`services/contract.ts`):

| Hecho | Título | Escribe |
|---|---|---|
| Prop requerida sin pasar, o pasada vacía | `Completar las props requeridas de <tag>` | Un valor **del tipo de cada prop** antes del `>`, en una sola inserción |
| `.prop` que el componente no declara | `Cambiar a .<prop>` | El nombre |
| `slot="x"` que el host no declara | `Cambiar a slot="<slot>"` (una por ranura) o `Quitar slot="x"` | El nombre, o el atributo entero |

**Estas tres las dice TypeScript y las repara el servidor, y la medida es la razón.** La
decisión de la fase 2 —no emitir `FUD0197`/`FUD0199` en el editor porque TypeScript ya los
reporta con más precisión— sigue en pie y no se toca: una voz por hecho. Lo que la fase 2 dio por
supuesto es que quien reporta también repara, y eso es falso aquí. Medido contra el servicio real:
sobre la proyección TypeScript devuelve **cero** quick fixes —los errores caen sobre un literal
sintético y sobre una llamada que nadie escribió, así que «cambiar la ortografía» no tiene dónde
agarrarse— y la única acción que ofrecía era `refactor.move.newFile`, que aquí no significa nada y
era lo que encendía una bombilla vacía sobre markup sano.

Así que la voz sigue siendo suya y las manos son nuestras. El hecho se recalcula del parse y del
índice en cada petición —los mismos dos lectores que alimentan la tarjeta—, y no lo reporta nadie.

**Y lo que se escribe es del tipo de la prop.** Un valor entrecomillado en un `.fud` es TEXTO, así
que `.id=""` pasa la cadena `""` — y una `.id` declarada `number` se convierte en un error de tipos
que creó la propia reparación. Una bombilla que deja el fichero peor de como lo encontró es peor
que no tener bombilla.

Un escalar va **desnudo**, que es para lo que está la decisión 105: `.id=0`, `.visible=false`. Sin
comillas y sin `@`. Envolverlo en una interpolación sería inventar una segunda forma de escribir
algo que la gramática ya escribe de una: `@( … )` es para EXPRESIONES (decisiones 103, 104), y un
`0` no lo es. La tabla entera es `""`, `0`, `false`, y `@()` vacío para lo que no tiene valor obvio
que inventar —un objeto, una unión cuyas mitades no coinciden—, donde además sí es una expresión,
porque un objeto solo se pasa así. El tipo sale de la proyección, que es el único sitio que lo
sabe: el índice conoce los NOMBRES de las props y nada de sus tipos.

### 3.2. La tarjeta del componente

Las dos mitades son **dos tipos**, no uno con campos que a veces faltan. La que sale del índice
es el `Contract` que el propio índice ya guarda —props con su marca de requerida, slots, eventos
y el doc del componente—; la que sale de la proyección es un mapa aparte, y por eso puede estar
vacío sin que la tarjeta lo esté.

```ts
export interface TagCard {
  readonly tag: string;
  /** Absolute path of the `.fud` that declares it. */
  readonly file: string;
  /** What the index already knows: props, slots, events and the component's own JSDoc. */
  readonly contract: Contract;
  /** The tag NAME in the source, which is what the hover underlines. */
  readonly span: Span;
}

/** What only TypeScript knows about a prop. Keyed by the prop's name. */
export interface PropDetail {
  readonly type: string;
  /** The JSDoc the author wrote on the member of `props<T>()` — decision 107. */
  readonly doc?: string;
}

export function tagCardAt(
  cached: CachedDocument,
  index: WorkspaceIndex,
  offset: number,
): TagCard | undefined;

export function propDetails(
  languageService: ts.LanguageService | undefined,
  file: string,
): ReadonlyMap<string, PropDetail>;

export function cardMarkdown(card: TagCard, props: ReadonlyMap<string, PropDetail>): string;
```

### 3.3. Decisión 107 — dónde se documenta un componente

Sin sintaxis nueva. Tres sitios, todos JSDoc, todos donde el autor ya escribiría un comentario:

| Qué | Dónde |
|---|---|
| El componente | El primer JSDoc escrito al **nivel superior** de un tramo neutro del `@code`. |
| Una prop | El JSDoc del miembro: **delante**, como en TypeScript, o **detrás** del tipo. |
| Un evento | El JSDoc del `dispatchEvent(new CustomEvent('x'))` que lo lanza. |

Los eventos se leen del `@client`: cada `new CustomEvent('nombre')` declara uno. Es lo que hay
—no existe declaración de eventos en la gramática— y es honesto: lo que el componente lanza.

**«Nivel superior» y no «el primero», y lo destapó la medida.** El JSDoc de una prop se escribe
dentro de las llaves del tipo, que es donde TypeScript dice que va; con la regla «el primero del
`@code`» ese comentario pasaba a ser la descripción **del componente** — la tarjeta presentaba
`<app-input>` como «Id del componente». La diferencia entre uno y otro está escrita en el texto y
cuesta un contador de llaves leerla.

**Y una prop se documenta por delante o por detrás.** `id: number /** … */;` no lo ve TypeScript
—un JSDoc documenta lo que le SIGUE, así que para el checker ese comentario no es de nadie— pero
es donde el autor lo escribe y, sobre todo, **es donde el formateador lo deja**: escríbelo pasado
el `;` y `oxfmt` lo mueve entre el tipo y el `;` en cada guardado. Una tarjeta que no sabe leer la
posición que elige su propio formateador es una tarjeta que le dice al autor que lo ha escrito
mal. Así que valen las dos, y sigue habiendo un solo lector: la misma declaración del miembro,
mirada por el otro extremo.

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

### 4.2. `FUD0191` reutiliza `linkInsertionFor`

Es el mismo `TextEdit` que ya fabrica el completado de tag. Cero lógica nueva y cero posibilidad
de que las dos discrepen.

### 4.3. `FUD0540` lee el binding de la cabecera

De `DocumentJs.loops`, el mismo sitio del que sale el ámbito. Varios bindings → el primero.
Ninguno → sin acción, que ya es `FUD0543`.

### 4.4. La tarjeta se construye en dos mitades y la segunda puede faltar

1. **El índice**, síncrono y siempre: tag, fichero, props con su marca de requerida, slots,
   eventos, doc del componente.
2. **La proyección**, si TypeScript contesta: de cada prop, su tipo y su JSDoc. Los dos juntos,
   porque los dos salen del mismo símbolo y decisión 107 documenta una prop «como TypeScript
   normal» — leerlo del fuente sería un segundo lector del argumento de tipo.

Se renderiza con lo que haya. Un hover que espera a TypeScript para no enseñar nada es un hover que
no aparece, y eso el desarrollador no lo distingue de «no hay hover». Es la lección de BUG-23 §2.9,
aplicada antes de que cueste.

### 4.5. La tarjeta es del **tag**, y solo del tag

Sobre un `<div>` no hay tarjeta: un nativo no tiene contrato de fudic y HTML ya lo describe. Sobre
un tag que el índice no conoce, tampoco. El hover de una prop, de un evento o de una expresión ya
lo da TypeScript sobre la proyección y es correcto.

---

## 5. Invariantes

1. Una acción se ancla en un **hecho recalculado**, nunca en la posición a secas: un
   diagnóstico del servidor, o el contrato leído del parse y del índice. Nunca en el contexto
   que manda el cliente, que es lo último que renderizó.
2. Degradar es no ofrecer: nada se construye con un dato incierto.
3. Una sola fuente por hecho: el `<link>` de `linkInsertionFor`, las props del índice, el binding
   del `JsBatch`. Ninguna acción re-deriva con una expresión regular lo que ya está parseado.
4. La tarjeta se degrada por mitades, y la que depende de TypeScript es siempre la segunda.
5. El `WorkspaceEdit` viaja completo en la acción: sin `resolve` y **sin `command`**. Hubo una
   versión que mandaba un `command` para que la extensión aplicase tabstops, y no funcionó ni
   una vez: el `document` que recibe un plugin es el de Volar, y su uri es
   `volar-embedded-content://root/…`, no el fichero. Volar reescribe la uri de un `edit` al
   salir —que es justo por lo que aterrizan las demás reparaciones— y no puede reescribir los
   `arguments` de un comando, porque nada en ellos se anuncia como uri. Los tabstops no valen
   una segunda vía de entrega.
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
