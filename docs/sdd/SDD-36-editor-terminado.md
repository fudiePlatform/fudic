# SDD-36 — El editor terminado: la bombilla, la tarjeta y el formato al guardar

> **Estado:** `Listo`
> **Paquetes:** `@fudic/language-server` (las acciones de código y el hover) ·
> `fudic-vscode` (el formato al guardar y el ajuste del manifiesto) ·
> `@fudic/compiler` (nada nuevo: se consume `propsOf`, `collectSlots` y el registro)
> **Depende de:** 24 (el servidor y su `provideCodeActions`, que ya sirve un caso), 23 (la
> proyección, de donde sale el tipo de una prop), 26 (el formateador), 25 (la extensión),
> BUG-23 (el `requiredProps` del índice y el `propsOf` del registro)
> **Rango de diagnósticos:** `FUD0640`–`FUD0659` — **reservado y previsiblemente vacío**: una
> acción de código no diagnostica, arregla lo que otro diagnosticó
> **Decisiones de gramática:** ninguna nueva
> **Naturaleza:** superficie. Ninguna pieza de conocimiento es nueva; lo que falta es
> ofrecérsela al desarrollador en el momento en que la necesita.

---

## 1. Contexto y objetivo

BUG-23 dejó el editor **contestando bien**. Este SDD lo deja **terminado**, que es otra cosa: un
lenguaje se siente acabado cuando el error se arregla solo, cuando pasar el ratón por un tag dice
lo que ese tag necesita, y cuando guardar deja el fichero como el proyecto lo escribe.

Tres cosas, y las tres son ensamblaje sobre conocimiento que ya existe:

- **La bombilla.** `provideCodeActions` ya está montado y sirve **un** caso — el `href` que no
  resuelve. El andamiaje está; las filas están vacías.
- **La tarjeta.** `propsOf` (BUG-23 tarea 17) y `collectSlots` ya saben qué declara un componente.
  Hoy eso solo alimenta un completado, y el consumidor que quiere saber qué props tiene
  `<app-button>` tiene que abrir el fichero.
- **El formato al guardar.** SDD-26 dejó `fudic fmt` y el `documentFormattingProvider` del
  servidor. Lo que falta es la línea que hace que Ctrl+S los use.

Ninguna de las tres cambia lo que fudic **es**. Las tres cambian cuánto cuesta escribirlo.

### Lo que este SDD NO es

- **No es el renombrado cruzando ficheros** (IDEA-02 §3). Esa pregunta empieza por una medida, no
  por un diseño, y la medida es la tarea 1 de este SDD: la proyección copia la clave 1:1 con
  `USER_CAPS` y `$Props` es un tipo real importado entre virtuales, así que es posible que
  TypeScript ya renombre casi todo. Si la medida dice que falta el último tramo, sale su propio
  SDD; si dice que funciona, sale una nota en SDD-24 y ya está. **Especificar antes de medir es
  exactamente el error que costó un mes en BUG-23.**
- **No es el banco de trabajo** (SDD-32).
- **No inventa diagnósticos.** Una acción de código repara lo que ya está subrayado.

---

## 2. Dependencias

| Fuente | Aporta |
|---|---|
| SDD-24 | El servicio del servidor: `provideCodeActions`, `provideHover` (declarado y hoy sin implementar para el tag), `RequestStats.run`, `regionAt`, y `fudicDocumentOf`. |
| SDD-23 | La proyección. El **tipo** de una prop no lo sabe el índice —sabe su nombre y si es requerida—, lo sabe TypeScript sobre el virtual. La tarjeta lo pide ahí. |
| SDD-26 | `formattedText` y el `documentFormattingProvider`, ya declarados y funcionando. |
| SDD-25 | El manifiesto de la extensión y sus `configurationDefaults`, donde vive el ajuste por lenguaje. |
| BUG-23 | `WorkspaceIndex.IndexEntry.requiredProps`, `componentTags`, `linkInsertionFor` (que ya sabe fabricar un `<link rel="component">`), y `propsOf` en el registro del compilador. |

---

## 3. Interfaz pública

### 3.1. Las acciones de código

No hay tipos nuevos hacia fuera: el servidor ya declara `codeActionProvider`. Lo que cambia es
**qué** devuelve. Cada acción es un `CodeAction` con `kind: 'quickfix'`, un `title` en español —es
lo que lee el usuario— y un `WorkspaceEdit` completo. Ninguna usa `command`: una acción que hay que
resolver es una acción que puede fallar después de aceptada.

| Diagnóstico | Título | Qué escribe |
|---|---|---|
| `FUD0197` prop requerida no pasada | `Pasar las props requeridas de <tag>` | `.name=$1` por cada una que falte, en el orden en que el hijo las declara, dentro del tag de apertura |
| `FUD0191` componente sin declarar | `Añadir <link rel="component"> de <tag>` | El `<link>` en el `<head>`, con el `href` relativo que el índice ya resuelve |
| `FUD0056` valor sin comillas | `Entrecomillar el valor` | Comillas alrededor del valor tal cual está |
| `FUD0540` bucle sin `key` | `Añadir key (…)` | ` key (<binding>)` tras la cabecera, con el primer binding que la cabecera declara |
| `FUD0199` slot que el padre no declara | `Cambiar a "<slot>"` (una por candidato) | El nombre, dentro de las comillas |

Cinco filas, cada una independiente de las demás. Una fila que no se pueda construir con certeza
no se ofrece: **degradar es no ofrecer, nunca ofrecer algo inventado** — la misma regla que
gobierna la expansión de un tag en BUG-23.

### 3.2. El hover del tag

```ts
/** What a component declares, as the editor shows it. */
export interface TagCard {
  readonly tag: string;
  /** Absolute path of the `.fud` that declares it. */
  readonly file: string;
  readonly props: readonly { name: string; required: boolean; type?: string }[];
  readonly slots: readonly string[];
  /** The doc comment above the `props<T>()`, if the author wrote one. */
  readonly doc?: string;
}

export function tagCardAt(
  cached: CachedDocument,
  index: WorkspaceIndex,
  offset: number,
): TagCard | undefined;
```

`type` es opcional **y eso es el contrato**: el nombre y lo requerido salen del índice, que se
mantiene barato y sin TypeScript; el tipo sale de la proyección, que puede no estar disponible. Una
tarjeta sin tipos es peor que una con ellos y muchísimo mejor que ninguna — la lección de
`templateScope` en BUG-23, aplicada antes de que cueste un mes.

### 3.3. El formato al guardar

No es código: es una línea en `configurationDefaults` del manifiesto, bajo `[fudic]`.

```json
"editor.formatOnSave": true
```

Alcanza solo a los `.fud` —`configurationDefaults` es por lenguaje— y el formateador ya está
elegido en la misma sección (`editor.defaultFormatter: "fudic.fudic-vscode"`), así que Ctrl+S usa
el formateador de fudic y no otro. Un ajuste del usuario gana siempre: `configurationDefaults` es
un **defecto**, no una imposición.

---

## 4. Comportamiento

### 4.1. Una acción se ancla en un diagnóstico, no en una posición

`provideCodeActions` recibe el rango y el contexto, y el contexto trae los diagnósticos que hay
ahí. Cada fila del §3.1 mira **el código del diagnóstico**, no el texto bajo el cursor. Es lo que
impide ofrecer «entrecomillar el valor» sobre un valor que no está roto.

Consecuencia deliberada: si el diagnóstico no está, la acción no aparece. Una bombilla que aparece
donde no hay problema entrena a ignorarla.

### 4.2. `FUD0197` escribe las que faltan, no las que hay

El diagnóstico nombra el tag; el índice sabe qué props requiere; el AST sabe cuáles ya están
escritas. La acción escribe **la diferencia**, con un tabstop por prop, en el orden del hijo, y
usa exactamente la misma forma que la expansión del tag: `.name=$1`, sin comillas, porque lo que
va ahí puede ser un escalar, una expresión o una cadena y elegir por el autor es acertar una vez
de cada tres (BUG-23 tarea 25).

Sin `propsOf` —componente fuera del índice, o un `props<T>()` cuyo tipo no se puede leer— **no hay
acción**. No una acción vacía: ninguna.

### 4.3. `FUD0191` reutiliza el insertador que ya existe

`linkInsertionFor` ya calcula dónde va un `<link rel="component">` y con qué `href`, porque es lo
que hace un completado de tag que añade el link. La acción es ese mismo `TextEdit` sin el resto del
completado. Cero lógica nueva, y —lo que importa— **cero posibilidad de que las dos discrepen**.

### 4.4. `FUD0540` lee el binding de la cabecera

`@foreach (const item of items) { … }` sin `key` ofrece `key (item)`. El binding sale del mismo
sitio del que ahora sale el ámbito: las cabeceras registradas en el `JsBatch` (`for-of-header` /
`for-header`), leídas del AST de Oxc. Si la cabecera declara varios —`const { id, tag } of …`— se
usa el primero. Si no declara ninguno, la acción no se ofrece: eso ya es `FUD0543` y tiene su
propio mensaje.

### 4.5. La tarjeta se construye en dos mitades, y la segunda puede faltar

1. **El índice**, síncrono y siempre disponible: tag, fichero, nombres de props, cuáles son
   requeridas, slots declarados.
2. **La proyección**, si TypeScript contesta: el tipo de cada prop, pedido sobre el virtual del
   hijo.

La tarjeta se renderiza con lo que haya. Un `hover` que espera a TypeScript para no enseñar nada es
un hover que no aparece, y el desarrollador no distingue eso de «no hay hover».

El `doc` es el comentario que el autor escribió sobre el `props<T>()`, copiado tal cual. No se
reescribe, no se resume: es del autor.

### 4.6. El formato al guardar no cambia lo que el formateador hace

Es un ajuste, no un comportamiento. Lo único que este SDD comprueba de él es que está en el
manifiesto, bajo `[fudic]`, y que el formateador por defecto sigue siendo el de fudic — porque un
`formatOnSave` con otro formateador elegido reescribiría los `.fud` con reglas de HTML.

Queda anotado, porque es la clase de cosa que sorprende: el formateador **normaliza las comillas
de los strings de TypeScript dentro de `@code`** (`'@fudic/core'` → `"@fudic/core"`). Con el
formato al guardar activo, eso deja de ser algo que pasa cuando uno lo pide y pasa a ser algo que
pasa siempre. Es el comportamiento existente de SDD-26 y no se cambia aquí; se documenta.

---

## 5. Invariantes

1. **Una acción se ancla en un diagnóstico.** Nunca en la posición del cursor a secas.
2. **Degradar es no ofrecer.** Ninguna acción se construye con un dato que el servidor no tiene
   con certeza.
3. **Una sola fuente por hecho.** El `<link>` lo fabrica `linkInsertionFor`; las props requeridas
   salen del índice; el binding de una cabecera sale del `JsBatch`. Ninguna acción re-deriva con
   una expresión regular algo que ya está parseado.
4. **La tarjeta se degrada por mitades**, y la mitad que depende de TypeScript es siempre la
   segunda.
5. **El `WorkspaceEdit` va completo en la acción.** Sin `resolve`, sin `command`.
6. **El manifiesto no rebinda ninguna tecla.** Lo aprendido en BUG-23 task 25: Tab es del editor.

### Catálogo de diagnósticos (`FUD0640`–`FUD0659`)

**Reservado y vacío.** Este SDD no diagnostica: repara lo que ya está diagnosticado. El rango se
aparta para que nadie lo reutilice si algún día una acción necesita explicarse.

---

## 6. Criterios de aceptación

1. Sobre un `<app-circle>` con `FUD0197`, la lista de acciones trae **una**, cuyo `WorkspaceEdit`
   inserta `.name=$1` dentro del tag de apertura y no toca nada más.
2. Con dos props requeridas ausentes, la acción escribe las dos, en el orden en que el hijo las
   declara, y con tabstops `$1` y `$2`.
3. Con una de las dos ya escrita, la acción escribe **solo** la que falta.
4. Sin `propsOf` para ese tag, no hay acción — la lista no la contiene, y no contiene una vacía.
5. Sobre `FUD0191`, la acción inserta el `<link rel="component">` en el `<head>`, con el mismo
   `href` que el completado del tag habría escrito. Se compara contra `linkInsertionFor`.
6. Sobre `FUD0056`, la acción entrecomilla exactamente el valor: el `WorkspaceEdit` no toca el
   nombre del atributo ni el `=`.
7. Sobre `FUD0540` en `@foreach (const item of items)`, la acción escribe ` key (item)` tras el
   `)` de la cabecera.
8. En `@foreach (const { id, tag } of xs)` usa `id`, el primero.
9. En un `@while (x)` no se ofrece: no hay binding, y eso ya es `FUD0543`.
10. Sobre `FUD0199`, hay una acción por cada slot que el padre declara, y ninguna si no declara
    ninguno.
11. Una posición sin diagnósticos no ofrece ninguna de las cinco.
12. El hover sobre `<app-circle>` trae el tag, la ruta, las props con su marca de requerida, y los
    slots. Se mide con TypeScript **caído**: la tarjeta aparece igual, sin la columna de tipos.
13. Con TypeScript vivo, la misma tarjeta trae el tipo de cada prop.
14. El hover sobre un tag que el índice no conoce no devuelve tarjeta.
15. El hover sobre un `<div>` no devuelve tarjeta: un nativo no tiene contrato de fudic.
16. El JSDoc escrito sobre el `props<T>()` del hijo aparece en la tarjeta tal cual.
17. `editor.formatOnSave` está en `configurationDefaults["[fudic]"]` del manifiesto, y
    `editor.defaultFormatter` sigue siendo `fudic.fudic-vscode`.
18. El manifiesto no contribuye ningún keybinding sobre `tab`.
19. **La medida del renombrado** (tarea 1) queda escrita: qué renombra TypeScript hoy sobre la
    proyección —una prop, un `<slot name>`, una `@section`— y qué no. El resultado es una nota en
    este documento, y decide si hace falta un SDD propio.
20. `@fudic/language-server` y `fudic-vscode` siguen al **100 %** en las cuatro métricas.

---

## 7. Fuera de alcance

- **El renombrado**, más allá de medirlo (§1, criterio 19).
- **Acciones que no reparan un diagnóstico** — extraer un componente, envolver en `@if`. Son
  refactors, tienen otro `kind` y otra discusión.
- **El hover de una prop, un evento o una expresión.** Ya lo da TypeScript sobre la proyección y es
  correcto. Lo que falta es el del **tag**, que es lo único que TypeScript no puede saber.
- **`fudic check`** (SDD-35).
- **El banco de trabajo** (SDD-32).
