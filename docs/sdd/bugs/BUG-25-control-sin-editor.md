# BUG-25 — `control` no tiene mitad de editor, y un campo tenía dos verdades

**Estado:** `Hecho` · **Depende de** [SDD-34](../SDD-34-forms-compilador.md) en `Hecho` ·
**Rama:** `worktree-sdd-34-forms-compilador` · **Tareas:**
[BUG-25-Task.md](./BUG-25-Task.md)

> **Paquetes:** `compiler` · `forms` · `language-core` · `language-server` · `vscode`
> **Corrige:** SDD-34 §4.1, §4.2, §4.9 · SDD-23 §4.1, §4.4 · SDD-24 §4.2, §4.3 · SDD-25 §4.1 ·
> gramática 108–114, y **añade la 115**
> **Rango de diagnósticos:** `FUD0595` (del hueco `FUD0590`–`FUD0619` de SDD-12)

---

## 1. Contexto y síntoma

SDD-34 cerró con sus 18 criterios verdes y un navegador de verdad delante. Lo que ninguno de
los dos podía ver es que **`control` existía solo para el compilador**: el editor no lo
ofrecía, no lo explicaba y no comprobaba su valor, y el ejemplo canónico enseñaba un
formulario con dos fuentes de verdad para el mismo campo.

Siete síntomas, y no son siete bugs sueltos: seis salen de la misma superficie —el binding que
SDD-34 estrenó— y el séptimo del eco que la proyección ya tenía y que este trabajo hizo
visible.

### Síntoma 1 — el binding es invisible para el editor

```fud
<form control="@userForm">
  <input |>                     <!-- nadie ofrece `control`            -->
  <input control="@|">          <!-- la lista es TODO el scope         -->
  <input control="@userForm.|"> <!-- $validate, $errors, $fields dentro -->
</form>
```

El atributo no es de HTML, así que el servicio de HTML no lo ha oído nunca; no es una prop,
así que ningún `$gap` lo lleva; y, a diferencia de `class:`, ni siquiera se anuncia con un
prefijo que un desarrollador pueda adivinar. Dentro de un formulario es **la razón por la que
se está escribiendo el elemento**, y era el único binding de la gramática que no se podía
preguntar.

Dentro del valor la lista tampoco era la buena: TypeScript contesta el **scope**, que es
correcto y es la respuesta equivocada — `data`, los manejadores y toda prop `string` salen al
lado de los dos nombres que encajan.

### Síntoma 2 — `control=` a medio escribir no proyecta nada

Con `<input control=|>`, Ctrl+Space no ofrecía nada: `classifyControl` degrada un valor vacío
a atributo plano (`FUD0590`), así que la proyección no escribía nada en ese offset — y
`ownedByProjection` ya había callado a la raíz para dejarle sitio a TypeScript, al que nunca se
le preguntaba. Silencio por los dos lados, en la posición donde el desarrollador está pidiendo
la lista con certeza.

### Síntoma 3 — la API del formulario no se podía manejar desde `@code`

```ts
function stop(e: Event) {
  e.preventDefault();
  userForm.        // solo ofrece `alias` y `name`
}
```

Se perdían los once miembros `$*` — `$value`, `$set`, `$patch`, `$errors`, `$validate`,
`$touch`, `$reset`, `$summary`, `$fields`, `$schema`, `$setErrors` —, que es la API entera.
Los controles funcionaban por casualidad: `userForm.name` no tiene ningún miembro con `$`.

### Síntoma 4 — hover duplicado y falso «no se está utilizando»

Sobre `const { ctrl, type, id } = props<{…}>()` el hover salía **dos veces**, y las props
aparecían atenuadas como no usadas aunque la template las use.

### Síntoma 5 — el `@` se ve igual que el resto

El carácter que marca cada transición a fudic —`@if`, `@code`, `@click`, `@userForm`— se pinta
con el color del atributo que lo rodea. En Razor sobre Visual Studio se ve a la primera que
estás haciendo una transición; aquí no.

### Síntoma 6 — un `type` dinámico era un error, y eso obliga a un componente por forma

`<input type="@t" control="@f.x">` era `FUD0592`. La consecuencia no es el diagnóstico, es lo
que impide: un control-componente que envuelva `text`, `number`, `checkbox`… tiene que
declarar su `type` como prop, y con la regla vieja hacía falta **un componente por forma de
`<input>`**.

### Síntoma 7 — un campo con dos fuentes de verdad

El ejemplo canónico de SDD-34 tenía esto, y era lo que la spec permitía:

```fud
<form id="ajeno">                                   <!-- un <form> que fudic no enlaza -->
  <app-input name="alias" control="@userForm.alias"></app-input>
</form>
```

El valor que el usuario teclea vive en `userForm`; el formulario que el navegador envía lee el
DOM; y los dos solo coinciden porque `setFormValue` copia uno en el otro bajo un `name` que no
usa nadie más del lenguaje. Eso no es interoperar: es un campo con dos verdades.

---

## 2. Causa raíz

### 2.1 · Ningún contexto reconocía la posición, y la proyección no comprobaba el nodo

`control` es **el único binding del lenguaje escrito como un nombre HTML corriente**. Todos los
contextos de [`position.ts`](../../../packages/language-server/src/services/position.ts) leen
un prefijo —el `.` de una prop, la `@` de un evento, el `:` de `class:`— así que ninguno lo
reclamaba, y la posición caía en la regla general, cuyo scope es el del **parse**: lo que el
fichero declara y no lo que importa. Un formulario se importa.

Y en la proyección, [`globals.ts`](../../../packages/language-core/src/globals.ts) declaraba
`$control(node: unknown)`: la decisión 109 —qué acepta cada elemento— no la comprobaba nadie.

### 2.2 · Un valor vacío no es un `ControlBinding`

[`attrs.ts`](../../../packages/language-core/src/template/attrs.ts): el `case 'control'` se
dispara sobre la clasificación, y `classifyControl`
([`classify.ts:299`](../../../packages/compiler/src/binding/classify.ts)) degrada un valor sin
expresión a atributo plano. Sin binding no hay rama, y sin rama no hay hueco donde preguntar.

### 2.3 · Un filtro corriendo antes que el contexto

[`ts-completion.ts`](../../../packages/language-server/src/services/ts-completion.ts): el
filtro que quita el andamiaje de la proyección (`$tpl`, `$gap`, `$control`) era la **primera**
operación sobre la respuesta de TypeScript, antes de saber siquiera dónde estaba el cursor. Un
problema de orden, no de regla: `memberContextAt` no se consultaba hasta treinta líneas
después.

Y el `$` de la API **no** es una alucinación: SDD-33 define
`Form<S> = FormApi<S> & { [K in keyof S]: S[K] }`, así que un formulario *es* su API más sus
campos por nombre y `$value` existe para no chocar con un campo llamado `value`. La prueba de
que está bien puesto es que `Control<T>` no lo lleva —no tiene campos por nombre, no hay con
qué chocar—.

### 2.4 · El eco de la zona neutra contestaba a todo

[`caps.ts:42`](../../../packages/language-core/src/caps.ts): `USER_ECHO_CAPS` apagaba
`completion` y dejaba encendido todo lo demás. Pero `provideHover` de Volar **no elige
ganador**: concatena lo que dice cada proyección con un `---` en medio, y la zona neutra vive
en los dos virtuales.

Y `verification` encendido es el falso «no se usa»: ningún virtual ve todos los usos de una
declaración de la zona neutra —la template vive solo en el de cliente, `@server` solo en el de
servidor—, así que una prop usada en el markup está sin leer *en ese fichero* y TypeScript lo
dice con `6133`.

### 2.5 · Cuatro tipos semánticos que ningún tema podía pintar

`packages/vscode/package.json` no declaraba `semanticTokenTypes` ni `semanticTokenScopes`, así
que los cuatro tipos `fud*` eran pintura muerta. Y el `@` no era un token: viajaba **dentro**
del constructo que abre —`fudDirective` cubría `@if` entero, `fudInterpolation` se comía la
expresión con su marcador—, de modo que no había nada a lo que dar un color.

### 2.6 · Una regla que confundía «no decidible» con «no soportado»

[`control.ts`](../../../packages/compiler/src/binding/control.ts), `inputBind`: un `type` que
el compilador no puede leer devolvía `unsupported`. El argumento escrito era que el despacho de
runtime devolvería al bundle la tabla de coerciones que la forma estática quita — y no es
cierto, porque esa tabla la importa **el chunk del componente que la escribe**.

### 2.7 · La 108 no decía dónde

La decisión 108 dice que `control` es un atributo reservado con valor de expresión, y la 109
qué acepta cada elemento. Ninguna decía **dónde** puede escribirse, así que un `control` dentro
de un `<form>` ajeno era legal.

### 2.8 · Dos listas para una posición

Hallazgo colateral, al medir: en `control=|` contestan dos voces —la lista de nodos del plugin
raíz y la del decorador de TypeScript— y filtraban con reglas distintas, `accepts` una y
`reaches` la otra. La misma posición ofrecía dos conjuntos según quién llegara primero.

---

## 3. Interfaz pública

**`@fudic/compiler`**

- `BindFunction` gana `'bindByType'`; `UnsupportedControl` pierde `'dynamic-type'`.
- `ControlTarget` de tipo `value` gana `dynamicType?: true`.
- Nuevo analizador `controlInsideForm` en `ANALYZERS`.

**`@fudic/forms`** — `./dom` exporta `bindByType(el, control, errorEl, type)`.

**`@fudic/language-core`** — `USER_ECHO_CAPS` pasa a `{ navigation: true }` y nada más;
`globals.ts` estrena `$controlGroup`, `$ControlNode` y `$FormNode`.

**`@fudic/language-server`** — módulo nuevo `services/forms.ts` (`controlWants`, `accepts`,
`reaches`, `controlSites`, `controlBindingSites`, `controlOfferAt`, `nodesInScope`,
`nodeMembersAt`, `nodeMembersBefore`, `projectedOffset`) y `services/ts-service.ts`
(`typeScriptService`). `position.ts` estrena `controlValueAt`, `controlValueOpeningAt` y
`controlNameAt`; `attributeGapContextAt` y `nativeGapContextAt` pasan a devolver
`AttributeGap` —el hueco **y** su elemento— y `gapElementAt` desaparece. `FUDIC_TOKEN_TYPES`
estrena `fudAt`.

**`fudic-vscode`** — `contributes.semanticTokenTypes`, `contributes.semanticTokenScopes` y el
color por familia de tema en `configurationDefaults`.

---

## 4. Comportamiento corregido

**4.1 · El editor contesta las dos mitades de un `control`.** *Dónde* puede escribirse lo dice
la gramática y se pregunta al parse (`controlSites`, la misma regla que `FUD0595` reporta al
revés). *Qué* puede escribirse lo dice el TIPO y se pregunta al checker, **estructuralmente**:
un control es CALLABLE y lleva `set`/`touch`, un formulario lleva `$touch`/`$validate`. Nada de
tablas de nombres: la proyección y el completado coinciden por construcción.

En una lista se ofrece lo que encaja **y lo que lleva a lo que encaja** (`reaches`): `@userForm`
no es lo que enlaza un `<input>` y es la única forma de escribir lo que sí. En un enlace
terminado y en la bombilla manda `accepts`, que es el conjunto estricto.

**4.2 · El hueco a medio escribir se proyecta.** `control=`, `control=""` y `control="@"` dejan
un anclaje de longitud cero con `COMPLETION_ONLY_CAPS`: sobre un elemento nativo dentro de
`$control(⟨anclaje⟩)`, sobre un tag de componente dentro del literal de props, contra el
contrato que el hijo declaró.

**4.3 · El filtro del `$` corre después del contexto**, y solo cuando no vienes de un punto.

**4.4 · El eco es el eco.** El virtual de cliente es canónico para la zona neutra: `completion`,
`verification`, `semantic` y `structure` apagados en el de servidor; `navigation` encendido,
porque la región `@server` resuelve sus identificadores ahí.

**4.5 · El `@` es un token propio.** `fudAt` cubre **el carácter** y nada más — no es un token
añadido a los cuatro, es uno quitado del frente de cada uno. Se emite en directivas, regiones,
controles, `@{ … }`, interpolaciones, el nombre de un binding de evento y —lo que no se miraba
nunca— los **valores de atributo**. Amarillo por el precedente de Razor: `#D7BA7D` en
`[*Dark*]`, `#8A5A00` en `[*Light*]`, High Contrast sin regla.

**4.6 · Un `type` dinámico enlaza** con `bindByType`, y su enlace se rehace cuando el `type`
cambia, igual que cuando cambia el nodo.

**4.7 · Un nodo se enlaza dentro de su formulario** (decisión 115, `FUD0595`), con el
control-componente exento y su sitio de cruce comprobado en el fichero del padre. Con eso
`name` deja de ser vocabulario del lenguaje.

---

## 5. Invariantes

- **Una regla, una función.** `controlTarget` responde qué acepta un elemento para el emit, para
  la semántica y para el editor. Una regla que solo conoce uno de los tres es BUG-23 §2.4 otra
  vez.
- **Degradar a «sin respuesta», nunca a una equivocada.** Sin TypeScript montado, con el programa
  a medio construir o con un offset que la proyección no copió, cada lector devuelve vacío y la
  posición se queda como estaba.
- **Nada se muestra dos veces.** Donde dos proyecciones contestan el mismo offset, una es la
  canónica y la otra calla.
- **El `@` es un carácter, no un rango.** Dos tokens semánticos no pueden solaparse.

---

## 6. Criterios de aceptación

1. `<input |>` dentro de un formulario ofrece `control`, con el detalle de lo que ese elemento
   toma; fuera de uno, no lo ofrece.
2. Lo mismo sobre un tag de componente, desde dentro de la respuesta de TypeScript.
3. `control="@|"` ofrece solo los nombres que son nodos; `control="@userForm.|"` ofrece los
   campos y ningún miembro `$`.
4. `control=|` ofrece los nodos escribiendo el `@`, y en un `<form>` no ofrece un control.
5. Sin TypeScript montado, las cuatro posiciones anteriores devuelven la lista que había antes.
6. `<input control=>` proyecta un hueco que ofrece el formulario; sobre un tag de componente,
   contra el contrato del hijo y sin `TS2353`.
7. `userForm.` dentro de `@code` ofrece los once miembros `$*` junto a los campos.
8. Hover sobre el nombre `control` dice **form**, **control**, **group** o el contrato del hijo
   según el tag, y subraya solo el nombre.
9. La bombilla ofrece los campos del formulario de arriba por su ruta escrita, nunca uno ya
   enlazado, y escribe la ruta justo detrás del nombre del tag.
10. El hover de una prop de la zona neutra sale **una** vez y sin atenuar.
11. `@section` produce dos tokens: el `@` y la palabra.
12. `<input type="@t" control="@f.x">` emite `bindByType`, y la página que nunca escribe uno no
    lo nombra.
13. El enlace se rehace cuando se mueve el nodo **o** el `type`, con un solo guard para los dos.
14. Un `control` sin `<form control>` por encima es `FUD0595`; dentro de un
    `formassociated`, no.
15. Cobertura al 100 % en las cuatro métricas de `language-core`, `language-server`, `forms` y
    `vscode`; el código nuevo del compilador, también.

---

## 7. Fuera de alcance

- **El envío.** `@fudic/http`, `form:="@Put"` y el códec siguen esperando su propio SDD.
- **`FormArray`, subida de ficheros y `bind:`.** Lo que SDD-34 §7 dejó fuera sigue fuera.
- **La deuda de cobertura heredada** de `compiler`, `transport` y `vite`: se salda en su propia
  tanda y no se toca aquí.
- **Los otros cuatro tipos semánticos.** `fudAt` se declara y se pinta; `fudDirective`,
  `fudInterpolation`, `fudBinding` y `fudComponentTag` siguen sin declarar, para que nada más
  cambie de color en esta tanda.
