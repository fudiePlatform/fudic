# BUG-41 · Un error de formulario que no se va al corregirlo, y un hueco que el autor no puede colocar

> **Estado:** `Hecho`
> **Corrige:** [SDD-33](../SDD-33-formularios-reactivos.md) §4.5 ·
> [SDD-34](../SDD-34-forms-compilador.md) §4.2, §4.3, §4.4, §7 (decisión 113)
> **Paquetes:** `@fudic/forms` · `@fudic/compiler` · `@fudic/language-core` · `@fudic/example-basic`
> (y, por lo que destapó el e2e, `@fudic/transport` · `@fudic/di` — §2.6, §2.7)
> **Rango:** `FUD0596`–`FUD0599`, del tramo que SDD-12 da a SDD-34 (`FUD0590`–`FUD0619`)

---

## 1. Contexto y síntoma

En `/formularios` de `examples/basic` ([`app-form.fud`](../../../examples/basic/src/components/app-form.fud)),
con `alias: control('', [required, minLength(3), …])`:

1. Escribe `ab` en *Alias* y pulsa **Guardar**. Aparece `minLength` debajo del campo.
2. Corrige a `abc`. **El mensaje sigue ahí**, y el campo sigue con `aria-invalid="true"`.
3. Pulsa **Guardar** otra vez. El envío se para, el foco vuelve al alias y **el mensaje no se
   mueve**.

Lo hagas como lo hagas, el formulario ya no se deja enviar: se queda atascado con un error
que ya no es verdad. Solo lo desbloquean `$reset()`, `$set()` o una llamada a `$validate()`
escrita por el autor.

Junto a eso, el hueco del mensaje es **intrusivo**:

- **El sitio es fijo.** El compilador escribe `<span data-fud-err>` como **hermano siguiente**
  del input. En un `display: grid` —el propio `app-form`— el span es otra celda más, y por
  eso los tres formularios del ejemplo llevan `[data-fud-err]:empty { display: none }`. El
  resumen del `<form>` (`data-fud-sum`) queda **fuera** del `<form>`.
- **El elemento es fijo.** Un `<span>` con texto y nada más: no hay forma de pedir un `<p>`,
  un `<small>` o un contenedor con icono.
- **El texto es global por regla.** `required` dice lo mismo en *Nombre* que en *Alias*.
- **No hay salida.** Todo `control=` lleva su span. Un autor que pinte su propio mensaje con
  `@if (f.name.touched() && f.name.errors())` tiene dos, y el `aria-describedby` sigue
  apuntando al del compilador.

---

## 2. Causa raíz

### 2.1. Solo se valida en el primer submit

La única llamada a `$validate()` dentro del paquete es la de
[`bind-form.ts:42`](../../../packages/forms/src/dom/bind-form.ts), y solo corre si **no** hay
errores guardados:

```ts
if (form.$errors() === null && form.$summary() === null) {
  void form.$validate();
  return;
}
event.preventDefault();
form.$touch();
el.querySelector(INVALID)?.focus();       // ← y nada revalida
```

La escritura del control no toca `errors`
([`control.ts:75`](../../../packages/forms/src/control.ts)): sube el epoch, el valor y
`dirty`, y nada más. El `blur` de las seis bindings solo llama a `control.touch()`
([`bind-text.ts:29`](../../../packages/forms/src/dom/bind-text.ts) y sus hermanas). Y el
mensaje se muestra mientras `touched() && errors() !== null`
([`wiring.ts:77`](../../../packages/forms/src/dom/wiring.ts)).

Cuando aparece un error, **ninguna** de las dos condiciones puede volver a ser falsa sin
código del autor: `touched` solo baja con `$reset`/`$set`, y `errors` solo cambia con
`$validate`, `$setErrors` o `$reset`/`$set`.

SDD-34 §4.2 dejó escrito que *«`$validate` lo llama el autor o el enlace del `<form>` en el
submit»*, y §4.4 que el submit con errores guardados **para sin validar**. Por separado, las
dos frases tienen sentido. Juntas, dan un formulario que no puede salir de un error.

### 2.2. El primer submit envía un formulario inválido

La misma rama: sin errores guardados se **deja pasar** el envío y la validación se lanza
detrás. En `app-form` no se ve porque `@submit=@stop` siempre hace `preventDefault`. En un
`<form>` nativo sin ese handler, el primer envío con datos malos sale. SDD-34 §4.4 lo aceptó
porque *«el que decide es el servidor»*, pero el usuario ve cómo se envía un formulario que
un instante después se pinta en rojo.

### 2.3. El `@submit` del autor corre antes que la validación

El `@submit` de la plantilla se registra en el `<form>` antes que `bindForm`
([BUG-37](./BUG-37-submit-delegado.md) §2.2), y los dos escuchan en burbuja. El handler del
autor corre **primero** y no tiene forma de saber si el formulario es válido: para cuando
`bindForm` llama a `preventDefault`, el `fetch` del autor ya salió. Comparte fichero y
closure con §2.1 —el listener de [`bind-form.ts:32`](../../../packages/forms/src/dom/bind-form.ts)—,
así que por la regla del índice entra aquí.

### 2.4. El hueco lo coloca el compilador

[`controls.ts:134`](../../../packages/compiler/src/emit/controls.ts) decide que todo control
de valor y todo `<form control>` escriben un elemento **detrás de sí mismos**
(`writesSlot`), y [`markup.ts:493`](../../../packages/compiler/src/emit/markup.ts) (servidor)
y [`markup-client.ts:923`](../../../packages/compiler/src/emit/markup-client.ts) (cliente) lo
fabrican siempre como `<span id="fud-e-…" data-fud-err>`. En la hidratación se adopta por
cursor, como el **siguiente** elemento
([`markup-client.ts:881`](../../../packages/compiler/src/emit/markup-client.ts)). Posición,
etiqueta y presencia no dependen de nada que el autor escriba. SDD-34 §7 lo dejó así a
propósito para v1, *«extensión natural si aparece un caso que el CSS no cubra»*. El caso ya
existe: una rejilla de dos columnas, o un mensaje encima del campo.

### 2.5. El texto no conoce su campo

[`errorText`](../../../packages/forms/src/messages.ts) resuelve la primera clave del error
contra un **único** mapa de módulo (`setMessages`, `messages.ts:33`). El control no participa,
así que dos campos con la misma regla no pueden decir cosas distintas.

### 2.6. Lo que destapó la evidencia en el navegador

El e2e de `/formularios` (`examples/basic/tests/forms.spec.ts`) tenía cuatro tests del alias en
rojo **antes** de este BUG. Salieron al escribir el criterio 20, y entran aquí porque comparten
fichero con la corrección —`app-form.fud` y la spec del formulario—:

- **El alias nunca recibía su control al hidratar.** `app-form` lo cruzaba como
  `.ctrl=@userForm.alias`, una prop normal, que viaja serializada en `fud-state`, y un
  `Control` no se serializa. `app-input` se quedaba con `control === null`: sin validar, sin
  `:invalid` y sin mensaje. La forma de la decisión 112 es `control=@userForm.alias`, que cruza
  la referencia y el padre la entrega también al adoptar.
- **`FUD0197` no contaba `control=` como el prop `ctrl`**
  ([`component-props.ts`](../../../packages/compiler/src/semantic/analyzers/component-props.ts)),
  así que la forma correcta no compilaba. El editor ya lo contaba (`attrs.ts`).
- **La etiqueta del alias no llegaba a nada.** `.id="ali"` ponía el id en el `<input>` de dentro
  del shadow de `app-input`, y un `<label for>` busca en su propio árbol. El id va en el host,
  que es el elemento asociado al formulario, y `delegatesFocus` lleva el foco adentro.
- **El arnés leía el formulario antes de hidratarse.** `open()` esperaba a `fud:ready`, que
  dice que el runtime está instalado, no que el dueño del formulario haya subido; un `fill` o
  un `focus` no es un gesto que lo suba.
- **El presupuesto de §6.15 no medía nada desde SDD-45.** Buscaba `dist/fudic-main.js`, que ya
  lleva hash, y solo seguía imports relativos, cuando el runtime publicado se importa por
  `/_fudic/<versión>/`.

Pedro pidió **todo** el e2e en verde, fuera o no de este BUG, y eso trajo arreglos fuera de
forms:

- **`transport/router.ts`**: el precalentado deposita en su caché el runtime publicado
  (`/_fudic/`) y lee sus imports estáticos de los propios bytes, de forma transitiva (SDD-45
  §4.3). Un comentario de ese código escribía un import literal, y ese comentario viaja dentro
  del bundle del Service Worker, que no puede contener ninguno: dos tests de `@fudic/vite` en
  rojo hasta reescribirlo.
- **`transport/runtime-cache.ts`**: la marca `/_fudic/marker/<app>` va sellada con
  `x-fudic-stored`.
- **Specs que se habían quedado atrás tras SDD-45**: `fudic-main.js` con hash, el canal del
  precalentado en el boot, el `modulepreload` del runtime y el slug `file-system-routing`.
- **El snapshot de `fudic new`** copia las declaraciones del editor, y la del marcador `error=`
  (tarea 6) lo cambió.

### 2.7. Lo que destapó la prueba en el navegador (tarea 8)

Con todo lo anterior en verde, Pedro probó `/formularios` a mano y salieron cuatro cosas más:

- **La burbuja del navegador tapaba la validación.** El `<form>` no llevaba `novalidate`, y la
  validación nativa corre **antes** que el evento `submit`. En cuanto el host de `app-input`
  conocía su error (`setValidity`), el navegador paraba el envío con su propia burbuja —y el
  texto era el código de la regla, `required`—, y `bindForm` no llegaba a correr.
- **Un error corregido y vuelto a romper no volvía hasta el `blur`.** §4.1 revalidaba al
  escribir solo con el error **visible**: `abc` → borrar una letra dejaba el campo mal y
  callado mientras tuviera el foco. La política no era la que se quería. Y, más a fondo, es una
  decisión del autor, no del framework (§4.5).
- **El foco no entraba en un control-componente.** `bindForm` buscaba el primer
  `[aria-invalid="true"]` en el árbol del `<form>`, y el `<input>` del alias vive en el shadow de
  `app-input`. Con *Nombre* bien, el submit fallido no llevaba el foco a ningún sitio.
- **`vite dev` avisaba** de un `import()` que no puede analizar, en el cargador de páginas de
  `@fudic/di`. Se resuelve en ejecución a propósito: `/* @vite-ignore */`.

### 2.8. Alcance

| sitio | causa | se corrige |
|---|---|---|
| `bindText` · `bindNumber` · `bindCheckbox` · `bindSelect` · `bindSelectMultiple` · `bindRadio` · `bindByType` | `blur` solo toca; `input`/`change` no revalidan | sí, en `wiring.ts` para las siete a la vez |
| `bindForm` | submit con errores no revalida; primer submit deja pasar; escucha detrás del autor; el foco no cruza un shadow root | sí |
| `ControlOptions` · `FormOptions` | la política de validación es fija | sí: `validateOn` |
| `bindGroup` | lee `$errors`/`$summary`, que ahora se refrescan | nada propio |
| `FudicControlElement` | `setValidity` sigue a `errors()` con el código de la regla; su `validity` no se ve desde fuera | sí: el texto de `message()` y un getter `validity` |
| emit de servidor y de cliente | hueco fijo detrás del elemento; `<form>` sin `novalidate` | sí |
| `language-core` | proyecta `control=` para TypeScript | sí: el marcador nuevo se proyecta igual |

---

## 3. Interfaz pública

### 3.1. `@fudic/forms` — modelo

```ts
/** Lo que `control()` y los constructores tipados aceptan además de valor y reglas. */
export interface ControlOptions {
  /** Los textos de ESTE control, por regla. Tienen prioridad sobre `setMessages`. */
  readonly messages?: Messages;
}

export function control<T>(initial?: T, validators?: …, options?: ControlOptions): Control<Widen<T>>;
// y lo mismo en los doce tipados: str(initial, validators, options), u8(…), …, arr(…)

export interface Control<T> {
  // … lo de siempre …
  /**
   * Valida SOLO este control, con la raíz del formulario al que pertenece como `root` de sus
   * reglas. Publica si el epoch sigue vigente. Resuelve si el control quedó válido.
   * Un control que no pertenece a ningún formulario no tiene raíz: `TypeError`.
   */
  validate(opts?: { readonly server?: boolean }): Promise<boolean>;
  /**
   * El texto del error actual, o `''`. Tracked. Busca primero en los `messages` del control,
   * luego en `setMessages`, y si no hay nada devuelve el código de la regla.
   */
  readonly message: Readable<string>;
}

export interface FormOptions<S extends Schema> {
  readonly summary?: …;
  /** Los textos del resumen, con la misma prioridad que los de un control. */
  readonly messages?: Messages;
}

export interface FormApi<S extends Schema> {
  // … lo de siempre …
  /** El texto de `$summary()`, o `''`. Tracked. */
  readonly $message: Readable<string>;
}
```

`errorText(errors)` sigue exportado y con el mismo comportamiento (solo mapa global). Pasa a
ser la última capa de `message()`, no la única.

**Cuándo valida un campo** (§4.5, añadido tras la tarea 8):

```ts
/** Flags que se combinan con `|`. El submit valida SIEMPRE; esto añade los momentos de antes. */
export const ValidateOn = { Submit: 0, Blur: 1, Input: 2 } as const;
export type ValidateOn = number;

export interface ControlOptions {
  readonly messages?: Messages;
  /** Gana a la del formulario. */
  readonly validateOn?: ValidateOn;
}

export interface FormOptions<S extends Schema> {
  // … summary, messages …
  /** La de todos sus controles, salvo el que elija la suya. */
  readonly validateOn?: ValidateOn;
}

export interface Control<T> {
  // …
  /** La política vigente: la propia, si no la del form más cercano que eligió, si no
   *  `Blur | Input`. No tracked: queda fijada al entrar el control en su formulario. */
  readonly validateOn: () => ValidateOn;
}
```

### 3.2. `@fudic/forms/dom`

```ts
/** El marcador que escribió el autor, o `null` si no puso ninguno. */
export type ErrorSlot = HTMLElement | null;
```

Las ocho `bind*` mantienen su firma, salvo `bindGroup`, que gana un tercer argumento opcional
para el marcador de su resumen: `bindGroup(el, group, slot?: ErrorSlot)`. `ErrorSlot` se
ensancha a `null`, y `bindForm` ya aceptaba `null` como resumen. Los dos escriben `$message()`.

`FudicControlElement` (`@fudic/forms/element`) gana `get validity(): ValidityState`, la de sus
`ElementInternals`, igual que la expone un control nativo (§4.7).

### 3.3. Gramática — decisión 130 (enmienda la 113)

`error` es atributo **reservado** con valor de expresión `@`, de la familia de `control`
(108):

```razor
<label for="nom">Nombre</label>
<input id="nom" control=@userForm.name>
<p class="hint" error=@userForm.name></p>        @* donde el autor quiera *@

<form control=@userForm>
  <div role="status" error=@userForm></div>      @* el resumen, DENTRO del form *@
```

- **El autor elige elemento y posición.** El compilador quita `error` del HTML, pone un `id`
  si el autor no escribió uno (el derivado de siempre, `fud-e-…` / `fud-s-…`) y escribe
  `aria-describedby` en el elemento enlazado, o en **todos** los radios del grupo.
- **Un marcador de un `<form>` o un grupo** muestra su `$message()`. Si es de un `<form>`
  recibe además `aria-live="polite"`, salvo que el autor ya haya puesto un `aria-live`.
- **Sin marcador no se emite nada**: ni span, ni `aria-describedby`. `aria-invalid` se sigue
  escribiendo, porque va en el propio control.
- `data-fud-err` y `data-fud-sum` **desaparecen** del marcado.
- Un `<form control>` recibe **`novalidate`**, salvo que el autor ya lo haya escrito (§4.6).

### 3.4. Diagnósticos

| código | cuándo | severidad |
|---|---|---|
| `FUD0596` | el valor de `error` no es una única expresión `@` | error |
| `FUD0597` | el marcador nombra un nodo que **ningún** elemento de **su bloque** enlaza con `control=`, incluido el caso de que el nodo solo cruce como prop a un componente. Un bloque es una rama de `@if`, un caso de `@switch`, una `@section` o un `@snippet`: en el cliente cada bloque es un recorrido con sus propias variables, y la llamada de enlace nombra al control y a su marcador. `aria-describedby` no atraviesa un shadow root: el mensaje de un control-componente se coloca **dentro** de él | error |
| `FUD0598` | más de un marcador para el mismo nodo en una plantilla, o un marcador dentro de un bucle (N elementos con el mismo id) | error |
| `FUD0599` | el marcador tiene contenido que no es solo espacio (el runtime escribe su `textContent` y lo borraría), o un `id` con `@` (el compilador no puede apuntar `aria-describedby` a un id que no conoce) | error |

Los cuatro rompen algo: un id duplicado, una relación ARIA que no existe o contenido que se
pierde. Ninguno es una norma de estilo.

---

## 4. Comportamiento corregido

### 4.1. Tarde para acusar, pronto para perdonar

En `wiring.ts`, para las siete bindings a la vez, con la política por defecto
(`Blur | Input`, §4.5):

1. **`blur`** → `touch()` y después `validate()`. El error aparece al **salir** del campo,
   nunca mientras se escribe por primera vez.
2. **`input` / `change`** → `set(…)` y, **si el campo ya está tocado**, `validate()`. El
   mensaje se va con la tecla que corrige el valor y **vuelve** con la que lo rompe otra vez,
   sin esperar al `blur`.

> **Enmendado tras la tarea 8.** La primera redacción decía *«si el error está visible»*: un
> campo corregido y vuelto a romper se quedaba callado hasta perder el foco (§2.7). Lo que
> separa «sin rellenar» de «mal» es haber salido del campo una vez, no que haya un error en
> pantalla.
3. Un control que todavía no se ha tocado **no se valida al escribir**. Se mantiene la regla
   de §4.2 de SDD-34: un campo vacío no está mal, está sin rellenar.
4. `validate()` usa el epoch que ya existe. Una validación asíncrona adelantada por una
   tecla nueva **no publica**.

### 4.2. El submit

`bindForm` escucha en **captura** sobre el propio `<form>` (`{ capture: true }` en
`onSelf`). En la fase de destino, los listeners de captura corren antes que los de burbuja,
así que la validación va **antes** que el `@submit` del autor sin cambiar el orden del emit.

- **Siempre, antes de decidir, `void form.$validate()`.** La validación publica en el acto
  todo lo que se resuelve en síncrono: los hijos arrancan en orden y cada control que no tiene
  reglas asíncronas deja su resultado antes de que `$validate` devuelva la promesa. La
  decisión se toma **después**, con ese estado:
  - **Hay errores** → `preventDefault()`, `$touch()` y foco en el primer
    `[aria-invalid="true"]`. Un `required` vacío para ya el primer submit.
  - **No hay** → se deja pasar. Un error ya corregido, incluido uno que dependía de otro campo
    (`confirmar === contraseña`), se ha limpiado en esta misma pasada, así que el submit que
    sigue a la corrección pasa **a la primera**.
- **Una regla asíncrona** responde tarde para contar en este submit. Su veredicto queda
  guardado para el siguiente, y no puede des-enviar el que ya salió.
- La regla del resumen (`options.summary`) corre cuando han contestado los hijos: en el acto
  si todos lo hicieron en síncrono, y detrás si no.
- El `@submit` del autor ve `event.defaultPrevented === true` cuando el formulario es
  inválido, y esa es la forma documentada de saberlo.

### 4.3. El marcador

- **Servidor:** el marcador se pinta en su sitio. Su texto es `node.touched() ?
  node.message() : ''` en un control y `node.$message()` en un form o grupo. El elemento
  enlazado lleva `aria-describedby` apuntando a su id.
- **Cliente:** el marcador se adopta como cualquier otro elemento, sin cursor especial. La
  llamada `bind*` se emite en el **último** elemento, en orden de documento, entre el
  control (o el último radio) y su marcador. El motivo es el mismo que en el grupo de radios
  (`controls.ts`): la llamada nombra la variable de los dos, y solo existe cuando el
  recorrido ha pasado por ambos.
- **Servidor y cliente dan el mismo árbol, byte a byte** (§6.10 de SDD-34 sigue en pie).

### 4.4. El texto

`message()` resuelve, en este orden: los `messages` del control → el mapa de `setMessages`
→ el código de la regla. Una sola función para las dos ramas, porque el servidor también
escribe el texto.

### 4.5. Cuándo valida un campo: `validateOn`

Cuándo se acusa un error es una decisión de producto, y es del autor. Se escribe en el
**modelo**, junto a los controles, y no en la plantilla: el servidor y el editor ya lo
conocen, y la vista no carga con ello.

```ts
const userForm = form(
  {
    name:  control('', [required]),
    alias: control('', [required, minLength(3)], { validateOn: ValidateOn.Blur }),
  },
  { validateOn: ValidateOn.Blur | ValidateOn.Input },
);
```

- **Flags, no una lista de nombres**: una política es **un** valor que `|` construye y `&` lee,
  igual en las opciones de un form que en las de un control.
- **`Blur`** valida al salir del campo. **`Input`** valida cada escritura **una vez tocado el
  campo** (§4.1). **`Submit`** es el cero: nada antes del envío.
- **El submit valida siempre.** Es la puerta que impide que salga un formulario inválido, y
  ninguna política la apaga.
- **Resolución:** la opción del control → la del form **más cercano** que eligió una (un form
  anidado le pasa a sus campos la suya, o la heredada si no tiene) → `Blur | Input`. Viaja con
  la adopción de la raíz, que ya recorría el árbol (tarea 1).
- `blur` **siempre** marca `touched`, valide o no: tocado es un hecho de la interacción, no de la
  política.

### 4.6. El navegador no se adelanta al submit

La validación nativa de restricciones corre **antes** del evento `submit`. Con un
control-componente cuyo `setValidity` ya conoce su error, el navegador paraba el envío con su
propia burbuja y `bindForm` no llegaba a correr (§2.7).

- El compilador escribe **`novalidate`** en todo `<form control>`, en servidor y en cliente,
  igual byte a byte. Si el autor ya lo escribió, no se duplica. Un formulario, un validador: el
  que el autor configuró.
- El mensaje de `setValidity` pasa a ser `control.message()`, no el código de la regla. Un
  `<form>` ajeno a fudic que sí valide de forma nativa muestra en su burbuja lo mismo que la
  página.

### 4.7. El foco entra en un control-componente

En un submit inválido, `bindForm` recorre los **elementos listados** del `<form>`
(`form.elements`, en orden de árbol) y enfoca el primero que tenga `aria-invalid="true"` o una
`validity` inválida.

- Un campo del árbol del form lleva el `aria-invalid` que escribió su efecto.
- El `<input>` de un control-componente vive en su shadow root, donde nada de fuera llega. Su
  **host** es un elemento listado del form, y su `validity` es la que mantiene `setValidity`:
  `FudicControlElement` la expone con un getter, como un control nativo. Enfocar el host lleva
  el foco al `<input>` por `delegatesFocus`.
- Un `fieldset` está excluido de la validación de restricciones: su propia `validity` nunca es
  inválida, contenga lo que contenga.

---

## 5. Invariantes

**Los que violaba.**

- *Un estado que ve el usuario tiene una salida que puede tomar el usuario.* Un error visible
  que ni escribir ni enviar puede quitar incumple eso.
- *El framework no se adelanta al autor en lo que es del autor.* La posición y la etiqueta
  de un mensaje son maquetación, y la maquetación es del autor.

**Los que añade.**

- Con la política por defecto, un campo ya tocado **se recalcula con cada cambio del valor**, y
  uno sin tocar no se adelanta.
- La validación del `<form>` corre **antes** que cualquier `@submit` del autor, y **ninguna**
  política de `validateOn` la apaga.
- En un `<form control>` valida **uno**: el de fudic. El navegador no se adelanta con el suyo.
- El compilador **no inventa elementos** en el marcado del autor. Solo añade atributos
  (`id`, `aria-describedby`, `aria-live`, `aria-invalid`) a elementos que el autor escribió.

La 113 se conserva en lo que importa: **el runtime solo escribe texto**, y el HTML de
servidor y el hidratado coinciden.

---

## 6. Criterios de aceptación

**Modelo** (`packages/forms/test/`):

1. `control.validate()` valida solo ese control, pasa la raíz del formulario a una regla
   cruzada y devuelve si es válido. Fuera de un formulario, `TypeError`.
2. `validate()` con epoch viejo no publica: dos validaciones asíncronas solapadas solo dejan
   la última.
3. `message()`: el mapa del control gana a `setMessages`, que gana al código. Tracked:
   dentro de un `effect` se reejecuta al cambiar `errors`.
4. `FormOptions.messages` y `$message()` hacen lo mismo con el resumen.

**Bindings** (`packages/forms/test/dom/`), vistos fallar sobre el código de hoy:

5. **(rojo primero)** El síntoma de §1: error visible → se escribe un valor válido → el texto
   del marcador queda vacío y `aria-invalid` desaparece, **sin** submit.
6. `blur` valida: un `required` vacío muestra el error al salir del campo.
7. Un control sin tocar no se valida al escribir.
8. Las siete bindings pasan 5–7. Una tabla, no siete tests copiados.
9. **(rojo primero)** Segundo submit: tras corregir el campo que falló, el segundo submit
   **no** se para.
10. **(rojo primero)** Primer submit con un `required` vacío y reglas solo síncronas: se
    previene.
11. **(rojo primero)** Un `@submit` del autor registrado **antes** que `bindForm` ve
    `defaultPrevented === true` si el formulario es inválido.
12. `ErrorSlot` `null`: la binding funciona, marca `aria-invalid` y no escribe texto en
    ningún sitio.

**Compilador** (`packages/compiler/test/`):

13. `error=@f.name` en cualquier posición —antes, después o en otra rama del árbol— produce
    `aria-describedby` correcto e id derivado, o respeta el `id` del autor.
14. Sin marcador: ni span ni `aria-describedby`. El golden de hoy **cambia** y se regenera
    revisándolo, no a ciegas.
15. Grupo de radios: todos los radios apuntan al mismo marcador.
16. Marcador de `<form>` dentro del `<form>`: `aria-live="polite"`, y no se pisa uno del
    autor.
17. Servidor = cliente hidratado, byte a byte, con errores de un 422 ya puestos y el
    marcador **antes** del control en el documento.
18. `FUD0596`–`FUD0599`, uno por caso, con span en el valor o en el elemento.

**Editor** (`packages/language-core/test/`):

19. El valor de `error` se proyecta como el de `control`: renombrar `userForm.name` en el
    `.ts` lo renombra en el marcador, y una ruta que no existe da error de tipos.

**En el navegador** (`examples/basic`, Pedro):

20. `/formularios`: los pasos de §1 dejan el formulario enviable. El mensaje de *Nombre* va
    donde lo pone la vista, el de *Alias* va dentro de `app-input`, y cada uno dice su propio
    texto.
21. `pnpm typecheck`, `pnpm test` y `pnpm build` en verde. `@fudic/forms` sigue en 100 / 100
    / 100 / 100. `@fudic/compiler` y `@fudic/language-core` no bajan del suelo medido al
    abrir la rama.

**Tras la prueba en el navegador** (§2.7, §4.5–§4.7):

22. **(rojo primero)** Las siete bindings: un campo tocado y válido que una escritura vuelve a
    romper muestra el error en esa escritura, sin `blur`.
23. `validateOn`: `Blur` solo valida al salir; `Input` solo al escribir con el campo tocado;
    `Submit` en ninguno de los dos; el control gana al form, el form anidado al de fuera, y sin
    nada es `Blur | Input`.
24. `novalidate` en un `<form control>`, en servidor y en cliente, y no se duplica si el autor lo
    escribió.
25. **(rojo primero, e2e)** `/formularios` con *Nombre* bien y *Alias* vacío: el segundo submit
    llega a `bindForm` (no lo para el navegador), el mensaje es el del control y el foco queda
    **dentro** del alias.
26. **(rojo primero, e2e)** *Alias* `abc`, salir, volver y borrar una letra: el mensaje aparece
    sin perder el foco, y se va con la tecla que lo corrige.

---

## 7. Fuera de alcance

- **Validar en cada tecla desde la primera**, con el campo sin tocar. `validateOn` hace
  configurable **cuándo** se valida (§4.5), pero `Input` espera siempre a que el campo se haya
  tocado: antes está sin rellenar, no mal.
- **Revalidar los campos que dependen de otro al cambiar ese otro.** El submit lo limpia
  (§4.2). Seguir dependencias entre reglas es un grafo que el modelo no tiene.
- **`Reference Target`** para que `aria-describedby` cruce un shadow root. Sigue en SDD-34
  §7. Mientras no llegue, el mensaje de un control-componente vive dentro de él (`FUD0597`).
- **Internacionalización.** `messages` acepta textos; de dónde salgan sigue siendo de la
  aplicación.
- **Varios mensajes a la vez** (todas las reglas que fallan). Un campo, un error: SDD-33
  §4.5.
- **El envío.** `bindForm` sigue sin enviar nada: es estado, no acción.
