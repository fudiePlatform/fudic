# BUG-41 · Un error de formulario que no se va al corregirlo, y un hueco que el autor no puede colocar

> **Estado:** `Listo`
> **Corrige:** [SDD-33](../SDD-33-formularios-reactivos.md) §4.5 ·
> [SDD-34](../SDD-34-forms-compilador.md) §4.2, §4.3, §4.4, §7 (decisión 113)
> **Paquetes:** `@fudic/forms` · `@fudic/compiler` · `@fudic/language-core` · `@fudic/example-basic`
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

### 2.6. Alcance

| sitio | causa | se corrige |
|---|---|---|
| `bindText` · `bindNumber` · `bindCheckbox` · `bindSelect` · `bindSelectMultiple` · `bindRadio` · `bindByType` | `blur` solo toca; `input`/`change` no revalidan | sí, en `wiring.ts` para las siete a la vez |
| `bindForm` | submit con errores no revalida; primer submit deja pasar; escucha detrás del autor | sí |
| `bindGroup` | lee `$errors`/`$summary`, que ahora se refrescan | nada propio |
| `FudicControlElement` | `setValidity` sigue a `errors()` | nada propio: se arregla solo con §2.1 |
| emit de servidor y de cliente | hueco fijo detrás del elemento | sí |
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

### 3.2. `@fudic/forms/dom`

```ts
/** El marcador que escribió el autor, o `null` si no puso ninguno. */
export type ErrorSlot = HTMLElement | null;
```

Las ocho `bind*` mantienen su firma. Solo se ensancha `ErrorSlot`, y `bindForm` ya aceptaba
`null` como resumen.

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

### 3.4. Diagnósticos

| código | cuándo | severidad |
|---|---|---|
| `FUD0596` | el valor de `error` no es una única expresión `@` | error |
| `FUD0597` | el marcador nombra un nodo que **ningún** elemento de esta plantilla enlaza con `control=`, incluido el caso de que el nodo solo cruce como prop a un componente. `aria-describedby` no atraviesa un shadow root: el mensaje de un control-componente se coloca **dentro** de él | error |
| `FUD0598` | más de un marcador para el mismo nodo en una plantilla, o un marcador dentro de un bucle (N elementos con el mismo id) | error |
| `FUD0599` | el marcador tiene contenido. El runtime escribe su `textContent` y lo borraría | error |

Los cuatro rompen algo: un id duplicado, una relación ARIA que no existe o contenido que se
pierde. Ninguno es una norma de estilo.

---

## 4. Comportamiento corregido

### 4.1. Tarde para acusar, pronto para perdonar

En `wiring.ts`, para las siete bindings a la vez:

1. **`blur`** → `touch()` y después `validate()`. El error aparece al **salir** del campo,
   nunca mientras se escribe por primera vez.
2. **`input` / `change`** → `set(…)` y, **si el error está visible** (`touched() &&
   errors() !== null`), `validate()`. El mensaje cambia o se va en cuanto el valor lo
   permite.
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

---

## 5. Invariantes

**Los que violaba.**

- *Un estado que ve el usuario tiene una salida que puede tomar el usuario.* Un error visible
  que ni escribir ni enviar puede quitar incumple eso.
- *El framework no se adelanta al autor en lo que es del autor.* La posición y la etiqueta
  de un mensaje son maquetación, y la maquetación es del autor.

**Los que añade.**

- Un error visible **se recalcula con cada cambio del valor**, y uno no visible no se
  adelanta.
- La validación del `<form>` corre **antes** que cualquier `@submit` del autor.
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

---

## 7. Fuera de alcance

- **Validar en cada tecla desde la primera.** Es otra política. Este BUG fija una, y
  hacerla configurable (`updateOn`) sería un SDD.
- **Revalidar los campos que dependen de otro al cambiar ese otro.** El submit lo limpia
  (§4.2). Seguir dependencias entre reglas es un grafo que el modelo no tiene.
- **`Reference Target`** para que `aria-describedby` cruce un shadow root. Sigue en SDD-34
  §7. Mientras no llegue, el mensaje de un control-componente vive dentro de él (`FUD0597`).
- **Internacionalización.** `messages` acepta textos; de dónde salgan sigue siendo de la
  aplicación.
- **Varios mensajes a la vez** (todas las reglas que fallan). Un campo, un error: SDD-33
  §4.5.
- **El envío.** `bindForm` sigue sin enviar nada: es estado, no acción.
