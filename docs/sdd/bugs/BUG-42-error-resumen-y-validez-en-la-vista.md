# BUG-42 · Los formularios de SDD-34 no se pueden terminar desde la vista: `error` sin editor, un resumen que calla, ninguna validez que leer y controles envueltos sin accesibilidad

> **Estado:** `Listo` — redactado tras la revisión de Pedro sobre `/formularios` y aprobado por él
> el 2026-09-25.
> **Corrige:** [SDD-34](../SDD-34-forms-compilador.md) §3.3, §4.4, §4.5, §4.9 ·
> [SDD-33](../SDD-33-formularios-reactivos.md) §3, §4.5 · [BUG-41](./BUG-41-el-error-que-no-se-va.md)
> §3.1, §3.3, §3.4 (`FUD0597`), §4.3, criterio 19 · [BUG-25](./BUG-25-control-sin-editor.md) (la
> mitad de editor de `control`) · decisiones 111, 113 y 130
> **Paquetes:** `@fudic/forms` · `@fudic/compiler` · `@fudic/language-core` ·
> `@fudic/language-server` · `@fudic/example-basic`
> **Rango:** `FUD0600`–`FUD0605`, del tramo que SDD-12 da a SDD-34 (`FUD0590`–`FUD0619`)
> **Gramática:** decisiones **131** (enmienda la 113 y la 130) y **132** (enmienda la 111)

**Todo lo que recoge este documento se cierra en este BUG.** Es la consecuencia de una
implementación incompleta de SDD-34, y Pedro decidió no abrir ni otro BUG ni otro SDD: el
resumen con varios mensajes, el resumen con los errores de campo y la accesibilidad de los
controles envueltos en componentes son parte del contrato aquí, no mejoras aplazadas.

---

## 0. El ejemplo que fija el contrato

Este BUG se escribió **a partir** de este ejemplo. Es el criterio en el navegador (§6.G) y el que
se copia en `examples/basic`. Enseña **los cuatro patrones** con los que una aplicación escribe
un campo, cada uno en un campo del formulario:

| Campo | Patrón | Qué demuestra |
|---|---|---|
| *Nombre* | `<label>`, `<input>` y `<small>` nativos | la base |
| *Alias* | `<label for>` nativo + `app-input` + `app-error` | el puente hacia el input interno y la descripción trasladada |
| *Email* | `app-label` (que proyecta un `<label>`) + `app-input` + `app-error` | tres envoltorios hermanos |
| *Web* | `app-field`: label, input y error dentro de un mismo componente | todo en el mismo árbol |

### 0.1. El modelo — `examples/basic/src/forms/user.form.ts`

```ts
import {
  control, form, group, minLength, pattern, required, serverValidator,
  ValidateOn, Validity,
} from '@fudic/forms';
import { aliasTaken } from '../data/aliases.js';

export const userForm = form(
  {
    name: control('', [required], {
      messages: { required: () => 'Escribe tu nombre.' },
    }),
    alias: control('', [
      required,
      minLength(3),
      serverValidator(async (v) => ((await aliasTaken(String(v))) ? { taken: true } : null)),
    ], {
      messages: {
        required: () => 'Elige un alias.',
        minLength: (n) => `El alias necesita al menos ${String(n)} caracteres.`,
        taken: () => 'Ese alias ya está cogido.',
      },
    }),
    email: control('', [required, pattern(/^[^@\s]+@[^@\s]+\.[^@\s]+$/)], {
      messages: {
        required: () => 'Escribe tu email.',
        pattern: () => 'Ese email no parece válido.',
      },
    }),
    // Opcional: vacío es válido, y si se escribe tiene que ser una URL.
    web: control('', [pattern(/^https?:\/\/.+/)], {
      messages: { pattern: () => 'La web empieza por http:// o https://.' },
    }),

    // Un grupo: dos controles y una regla que mira a los dos. Su error es SU resumen.
    acceso: group(
      {
        clave: control('', [required, minLength(8)], {
          messages: {
            required: () => 'Elige una contraseña.',
            minLength: (n) => `Mínimo ${String(n)} caracteres.`,
          },
        }),
        repetir: control('', [required], {
          messages: { required: () => 'Repite la contraseña.' },
        }),
      },
      [(v) => (v.clave === v.repetir ? null : { mismatch: true })],
      { messages: { mismatch: () => 'Las contraseñas no coinciden.' } },
    ),
  },
  {
    // El resumen del formulario entero: los errores que no son de ningún campo. Puede haber
    // VARIOS a la vez, y se muestran todos.
    summary: (f) => {
      const found: Record<string, true> = {};
      if (f.alias() !== '' && f.alias() === f.name()) found.sameAsName = true;
      if (f.name() !== '' && f.acceso.clave().includes(f.name())) found.keyHasName = true;
      return Object.keys(found).length > 0 ? found : null;
    },
    messages: {
      sameAsName: () => 'El alias no puede ser tu nombre.',
      keyHasName: () => 'La contraseña no puede contener tu nombre.',
    },

    validateOn: ValidateOn.Blur | ValidateOn.Input,   // el valor por defecto, escrito para verlo
    validity: Validity.Interacted,                    // también el valor por defecto
  },
);
```

### 0.2. Los componentes

**`app-input.fud`: solo el input.** Deja de declarar `id` como prop y de escribir `id=@id`: el id
del host lo pone la página, y el del input interno es **fijo** (los ids de un shadow root son
locales a él, así que `campo` no choca en ninguna instancia). El autor **no** escribe
`shadowrootreferencetarget`: lo añade el compilador (§4.9).

```razor
@code {
  import type { Control } from "@fudic/forms";

  const { ctrl, type } = props<{ ctrl: Control<unknown>; type?: string }>();
}

<head>
  <style>
    .field {
      display: flex;
      gap: 0.5rem;
      align-items: center;
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: var(--pad-field);
      background: var(--surface);
    }
    input { font: inherit; border: 0; outline: none; flex: 1; }
  </style>
</head>

<app-input>
  <template shadowrootmode="open" formassociated>
    <div class="field">
      <slot name="icon"></slot>
      <input id="campo" type=@type control=@ctrl>
    </div>
  </template>
</app-input>
```

**`app-error.fud`: el hueco del mensaje, envuelto.** El marcador `error=` va en su **host**, en la
vista que lo usa. El runtime escribe el texto en el host y el componente lo pinta con un slot.

```razor
<head>
  <style>
    :host { display: block; color: #b3261e; font-size: 0.85rem; }
    :host(:empty) { display: none; }
  </style>
</head>

<app-error>
  <template shadowrootmode="open">
    <small><slot></slot></small>
  </template>
</app-error>
```

**`app-label.fud`: el label, envuelto.** El `<label>` real lo escribe la página y el componente
lo **proyecta**. Así el label está en el árbol de la página, y su `for` llega al host del control
(§4.10).

```razor
<head>
  <style>
    ::slotted(label) { font-weight: 500; }
  </style>
</head>

<app-label>
  <template shadowrootmode="open">
    <slot></slot>
  </template>
</app-label>
```

**`app-field.fud`: label, input y error juntos.** Todo en el mismo árbol, todo nativo.

```razor
@code {
  import type { Control } from "@fudic/forms";

  const { ctrl, label, type } = props<{ ctrl: Control<unknown>; label: string; type?: string }>();
}

<head>
  <style>
    :host { display: grid; gap: 0.3rem; }
    label { font-weight: 500; }
    input { font: inherit; padding: var(--pad-field); border: 1px solid var(--line); border-radius: 8px; }
    .error { color: #b3261e; font-size: 0.85rem; }
    .error:empty { display: none; }
  </style>
</head>

<app-field>
  <template shadowrootmode="open" formassociated>
    <label for="campo">@label</label>
    <input id="campo" type=@type control=@ctrl>
    <small class="error" error=@ctrl></small>
  </template>
</app-field>
```

### 0.3. La vista — `examples/basic/src/components/app-form.fud`

```razor
<link rel="component" href="./app-input.fud">
<link rel="component" href="./app-error.fud">
<link rel="component" href="./app-label.fud">
<link rel="component" href="./app-field.fud">

@code {
  import { userForm } from "../forms/user.form.js";

  @client {
    function stop(e: Event) {
      e.preventDefault();
    }
  }
}

<head>
  <style>
    form, fieldset { display: grid; gap: var(--gap); }
    .campo { display: grid; gap: 0.3rem; }
    .error { color: #b3261e; font-size: 0.85rem; }
    .error:empty { display: none; }
    .resumen { border-left: 3px solid #b3261e; padding-left: 0.6rem; }
    .resumen:empty { display: none; }
    .resumen ul { margin: 0; padding-left: 1rem; }
    [aria-invalid="true"] { border-color: #b3261e; }
    button:disabled { opacity: 0.5; cursor: not-allowed; }
  </style>
</head>

<app-form>
  <template shadowrootmode="open">
    <form control=@userForm class="fudic" @submit=@stop>

      @*
        El resumen del formulario. Con `fields`, además de sus propios errores lista, tras un
        envío fallido, el de cada campo, enlazado al campo. El compilador le pone `id`,
        `aria-live` y `tabindex="-1"`, y el envío fallido le lleva el foco.
      *@
      <div class="error resumen" summary=@userForm fields></div>

      @* 1 · Nativo. *@
      <div class="campo">
        <label for="nom">Nombre <span aria-hidden="true">*</span></label>
        <input id="nom" control=@userForm.name type="text">
        <small class="error" error=@userForm.name></small>
      </div>

      @* 2 · Label nativo + control envuelto + error envuelto. *@
      <div class="campo">
        <label for="ali">Alias <span aria-hidden="true">*</span></label>
        <app-input id="ali" .type="text" control=@userForm.alias></app-input>
        <app-error error=@userForm.alias></app-error>
      </div>

      @* 3 · Tres envoltorios hermanos. *@
      <div class="campo">
        <app-label><label for="email">Email <span aria-hidden="true">*</span></label></app-label>
        <app-input id="email" .type="email" control=@userForm.email></app-input>
        <app-error error=@userForm.email></app-error>
      </div>

      @* 4 · Todo dentro de un componente. *@
      <app-field id="web" .label="Web" .type="url" control=@userForm.web></app-field>

      <fieldset control=@userForm.acceso>
        <legend>Acceso</legend>

        @* Resumen del grupo, sin `fields`: solo «Las contraseñas no coinciden». *@
        <div class="error resumen" summary=@userForm.acceso></div>

        <div class="campo">
          <label for="cla">Contraseña <span aria-hidden="true">*</span></label>
          <input id="cla" control=@userForm.acceso.clave type="password">
          <small class="error" error=@userForm.acceso.clave></small>
        </div>
        <div class="campo">
          <label for="rep">Repite la contraseña <span aria-hidden="true">*</span></label>
          <input id="rep" control=@userForm.acceso.repetir type="password">
          <small class="error" error=@userForm.acceso.repetir></small>
        </div>
      </fieldset>

      <button type="submit" disabled=@(!userForm.$valid())>Guardar</button>
    </form>
  </template>
</app-form>
```

El `*` va en `aria-hidden`. Es la marca visual de «obligatorio», no parte del nombre: sin
`aria-hidden`, un lector anunciaría *«Nombre asterisco»*.

### 0.4. Lo que escribe el compilador en *Alias* (el puente)

El autor no lo escribe. Así sale en el HTML del servidor:

```html
<label for="ali">Alias <span aria-hidden="true">*</span></label>
<app-input id="ali" aria-describedby="fud-e-…">          ← el label apunta al HOST
  <template shadowrootmode="open"
            shadowrootdelegatesfocus
            shadowrootreferencetarget="campo">          ← el puente: lo que apunta al host sigue hasta «campo»
    <div class="field"><input id="campo" type="text"></div>
  </template>
</app-input>
<app-error id="fud-e-…"></app-error>                    ← el marcador, con el id que describe al host
```

- **El nombre:** el `for="ali"` encuentra el host y el puente lo lleva al `<input id="campo">`. El
  input se llama «Alias».
- **La descripción:** el `aria-describedby` está **en** el host, y eso el puente no lo reenvía
  (solo reenvía lo que apunta al host). Lo traslada `FudicControlElement` al input (§4.8).
- **Sin puente nativo** (Safari, Firefox): `FudicControlElement` asocia también el label (§4.8).

### 0.5. Lo que ofrece el editor en cada sitio

| Se escribe | Se ofrece |
|---|---|
| `<div \|>` dentro del `<form control>` | `error` y `summary`, junto a `control` |
| `<div summary=@userForm \|>` | `fields`, además de lo de siempre |
| `control=@userForm.` en un `<input>` | `name`, `alias`, `email`, `web`, `acceso` (el grupo, para seguir bajando) |
| `error=@userForm.` | lo mismo: los controles y los grupos que llevan a ellos; **ningún miembro `$`** |
| `summary=@` en el `<form>` | `userForm`, y nada más |
| `summary=@` dentro del `<fieldset>` | `userForm.acceso` primero (el grupo que lo contiene), y `userForm` |
| `disabled=@(!userForm.` | todo, `$valid` incluido: es una expresión libre |
| `<template \|>` raíz de un componente | `shadowrootmode`, `shadowrootdelegatesfocus`, `shadowrootreferencetarget`, `shadowrootclonable`, `shadowrootserializable` y `formassociated` |
| `shadowrootreferencetarget="\|"` | los ids estáticos de esa plantilla |

### 0.6. Lo que hace en el navegador

1. **Al entrar:** ningún mensaje, ningún campo en rojo, resúmenes vacíos, y con
   `Validity.Interacted` el botón **habilitado**: nadie ha tocado nada.
2. **Sale de *Nombre* vacío:** *«Escribe tu nombre.»* bajo el campo y el botón **se
   deshabilita**. El resumen sigue vacío: los errores de campo solo entran en él tras un envío.
3. ***Nombre* `pedro`, *Alias* `pedro` y *Contraseña* `pedro1234`:** arriba salen **los dos**
   errores del formulario, *«El alias no puede ser tu nombre.»* y *«La contraseña no puede
   contener tu nombre.»*, en una lista. El botón sigue deshabilitado.
4. **Contraseñas distintas:** dentro del fieldset, *«Las contraseñas no coinciden.»*.
5. ***Email* `pedro@` y salir:** *«Ese email no parece válido.»* en su `app-error`.
6. ***Web* `ftp://x` y salir:** *«La web empieza por http:// o https://.»* dentro de `app-field`.
   Vacía no dice nada: es opcional.
7. **Todo bien:** el botón se habilita.
8. **Con `Validity.Rules`:** el botón **nace** deshabilitado y sigue sin salir ningún mensaje
   hasta que el usuario actúa.
9. **Envío sin tocar nada** (con `Interacted`): el submit valida y para el envío. Se tocan todos
   los campos, así que salen los mensajes junto a cada uno. El resumen lista, enlazado, el error
   de cada campo, y **el foco va al resumen**.
10. **Pulsar cada enlace del resumen:** el foco entra en el input de su campo, también en los
    tres control-componentes.
11. **Al corregir un campo, su entrada sale del resumen** en esa misma tecla.
12. **Pulsar cada label enfoca su input**, en los cuatro patrones.
13. **Nombre y descripción de cada input**, medidos en el árbol de accesibilidad: «Nombre»,
    «Alias», «Email» y «Web», sin asterisco. Con error, la descripción de cada uno es su mensaje.
    Lighthouse no da *«Form elements do not have associated labels»*, y axe no da ninguna
    infracción en la página.
14. **Los pasos 10, 12 y 13 dan lo mismo con el puente nativo y con el respaldo** (el e2e los
    repite con `referenceTarget` quitado del prototipo).

---

## 1. Contexto y síntoma

Al revisar `/formularios` escribiendo de verdad en el editor, con BUG-41 ya `Hecho`, y pasando
Lighthouse:

1. **`error` no se ofrece.** En `<small |>` dentro de un `<form control>` el completado trae
   `control` y no `error`. El atributo existe y compila, pero hay que saberlo de memoria.
2. **`error=@userForm.` ofrece la API del formulario**: `$errors`, `$fields`, `$message`,
   `$patch`, `$reset`, `$schema`, `$set`, `$setErrors`, `$summary`, `$touch`, `$validate`,
   `$value`. En `control=@userForm.` la misma posición ofrece solo los campos del schema.
3. **La vista no puede preguntar si el formulario es válido.** Lo normal es `<button
   type="submit" disabled=…>` hasta que los datos cumplan las reglas, y no hay nada que poner ahí.
4. **El resumen no se distingue del mensaje de un campo, un grupo no puede redactarlo y el
   ejemplo no lo pinta.** SDD-34 §4.4 tenía el resumen del formulario desde el principio. Tras
   BUG-41 se marca con el mismo `error=`.
5. **Un resumen con varios errores muestra solo uno.**
6. **No se pueden llevar los errores de campo al resumen.** Pintar los errores bajo cada input
   es una costumbre, no la única forma válida. Un formulario que los recoge arriba, enlazados a
   cada campo (el patrón *error summary*), no tiene cómo hacerse.
7. **Lighthouse: *«Form elements do not have associated labels»*** sobre el `<input>` de
   `app-input`. El `<label for="ali">` está fuera del componente, y el input, dentro de su shadow
   root.
8. **Envolver controles, labels y mensajes en componentes no tiene forma accesible.** Es lo que
   hace cualquier aplicación (`app-label`, `app-input`, `app-error`), y hoy ni el nombre ni la
   descripción llegan al input, y un `error=` fuera del control-componente es `FUD0597`.
9. **El `<template>` raíz de un componente no tiene editor**: ni completado de sus atributos ni
   validación.

Los dos primeros avisos de la revisión (*«la API con `$` no se deja usar en la vista»* y
*«`error=@userForm.name` no es asignable a `$Scalar`»*) **no** eran defectos del código. La
extensión instalada era del 2026-09-19 y la proyección de `error=` entró el 2026-09-23. Con la
extensión reinstalada desde la rama desaparecen.

---

## 2. Causa raíz

### 2.1. La mitad de editor de `error` no existe

BUG-41 añadió `error` al compilador (`classify.ts:110`, `markers.ts`) y a la proyección
([`attrs.ts:657`](../../../packages/language-core/src/template/attrs.ts)). Su criterio 19 solo pedía
renombrado y error de tipos, así que nadie escribió la parte de los servicios. Todo lo que
[BUG-25](./BUG-25-control-sin-editor.md) construyó para `control` va atado al **nombre literal**
`control` / `.ctrl`:

| Servicio | Dónde | `control` | `error` |
|---|---|---|---|
| Se ofrece como atributo | [`plugin.ts:280`](../../../packages/language-server/src/services/plugin.ts) (tag nativo) · [`ts-completion.ts:581`](../../../packages/language-server/src/services/ts-completion.ts) (componente) · `controlOfferAt` en [`forms.ts:319`](../../../packages/language-server/src/services/forms.ts) | sí | no |
| Completado del valor filtrado | `controlValueAt` · `namesControl` · `CONTROL_OPENED` en [`position.ts:276-367`](../../../packages/language-server/src/services/position.ts) · [`plugin.ts:331`](../../../packages/language-server/src/services/plugin.ts) · [`ts-completion.ts:398`](../../../packages/language-server/src/services/ts-completion.ts) | sí | no: cae en el completado genérico |
| Hover del nombre | `controlNameAt` · [`plugin.ts:541`](../../../packages/language-server/src/services/plugin.ts) | sí | no |
| Tipos del valor | `$control…` / `$errorOf` en [`globals.ts:185`](../../../packages/language-core/src/globals.ts) | sí | sí |

El completado genérico ofrece los miembros `$` después de un punto a propósito
([`ts-completion.ts:386`](../../../packages/language-server/src/services/ts-completion.ts)): en una
expresión libre la API del formulario es lo que se busca. En el valor de un marcador no, y nada
lo filtra porque la posición no se reconoce.

### 2.2. Un atributo, dos significados

`error=` acepta **cualquier** nodo (`$errorOf(node: $ControlNode | $FormNode)`,
`globals.ts:185`). El compilador decide qué pinta **por el emparejamiento**
([`markers.ts:26`](../../../packages/compiler/src/binding/markers.ts): `'value' | 'form' | 'group'`).
Un mismo atributo dice «el error de este campo» y «el resumen de este bloque», y el editor no
puede ofrecer lo que encaja porque el atributo no dice cuál de los dos es.

### 2.3. La validez no es pública, y la interna no sirve para la vista

- `Control<T>` ([`types.ts:112-145`](../../../packages/forms/src/types.ts)) y `FormApi<S>`
  ([`types.ts:265-293`](../../../packages/forms/src/types.ts)) no tienen ninguna lectura de validez.
- La que existe, `valid()` ([`form.ts:172`](../../../packages/forms/src/form.ts),
  [`control.ts:514`](../../../packages/forms/src/control.ts)), es interna, **no reactiva**
  (`untrack`) y lee `errors`, que solo cambia con `validate`, `$setErrors` y `reset`: **la
  última validación publicada**. Un formulario recién abierto con un `required` vacío no ha
  validado nada y diría «válido».
- El apaño en plantilla, `$errors() === null && $summary() === null`, **falla con grupos**:
  `$errors()` recoge solo errores de campo ([`form.ts:166-170`](../../../packages/forms/src/form.ts)),
  y el resumen de un grupo anidado no aparece ni ahí ni en el `$summary()` de la raíz.

Falta un concepto, no solo un nombre. Los **errores** son lo que se le **enseña** al usuario,
gobernados por `touched` y `validateOn`. La **validez** es si los valores actuales cumplen las
reglas, y es silenciosa. Hoy el modelo solo tiene lo primero.

### 2.4. Un grupo no puede tener textos propios

`group(schema, validators)` ([`group.ts:24`](../../../packages/forms/src/group.ts)) llama a
`build(schema, {}, …)` con opciones vacías. Su resumen se redacta solo con `setMessages` y, si
no, con el código de la regla: el fieldset del ejemplo diría `mismatch`.

### 2.5. El resumen se queda con el primer error, dos veces

- **Solo corre la primera regla que falla.** Las reglas de un grupo pasan por `firstFailure`
  ([`run-rule.ts:34-50`](../../../packages/forms/src/run-rule.ts)), que para en la primera. Es
  correcto para un campo (SDD-33 §4.5, un campo un error) y se aplicó también al resumen.
- **Solo se redacta la primera clave.** `messageOf` recorre el mapa y devuelve en la primera
  vuelta ([`messages.ts:36-41`](../../../packages/forms/src/messages.ts)): la regla del resumen
  del §0.1 devuelve `{ sameAsName, keyHasName }` y el segundo se pierde.
- **El marcador solo escribe texto** (decisiones 113 y 130). Una lista de mensajes necesita
  estructura para que un lector la anuncie como lista.

### 2.6. Los errores de campo no tienen camino al resumen

`bindForm` escribe en el resumen `$message()`, que es solo el error del formulario
([`bind-form.ts`](../../../packages/forms/src/dom/bind-form.ts)). Nada del modelo reúne los errores
visibles de los campos con su ruta, el emit no sabe qué `id` tiene el elemento de cada ruta para
enlazarlo, y un envío fallido siempre lleva el foco al primer campo, nunca a un resumen.

### 2.7. `FudicControlElement` no da nombre ni descripción al input de dentro, aunque su comentario dice que sí

**Lo que hace hoy** [`element.ts`](../../../packages/forms/src/element.ts), línea a línea. Son
cinco cosas y **ninguna tiene que ver con el nombre ni con la descripción**:

| Línea | Qué hace | ¿Llega al input interno? |
|---|---|---|
| 49 | `static formAssociated = true`: el host pertenece al `<form>` y un `<label for>` puede apuntarle | no: el label se asocia al **host** |
| 61 | `attachInternals()` | no |
| 65-67 | `delegatesFocus`: al pulsar el label, el foco entra en el input | no: lleva el **foco**, no el **nombre** |
| 104 | getter `validity` | no |
| 123-143 | `setFormValue` y `setValidity` siguen al control | no |

**Lo que ve el navegador:**

```
<label for="ali">Alias</label>      → nombra al HOST <app-input>
<app-input id="ali">                → host sin rol: el nombre se queda aquí, sin uso
  #shadow-root
    <input>                         → recibe el foco… y no tiene nombre   ← Lighthouse
```

- Un elemento personalizado asociado a formulario es etiquetable, así que `<label for="ali">`
  **sí** etiqueta el host. Pero el host no tiene rol, y ese nombre no llega a nadie.
- El foco lo recibe el `<input>` de **dentro**, y ese input no tiene nombre accesible. Un lector
  anuncia *«campo de edición»* sin decir cuál, y es lo que Lighthouse (axe) detecta.
- **El comentario de [`element.ts:14-16`](../../../packages/forms/src/element.ts) promete lo
  contrario**: que con `delegatesFocus` un `<label for>` de fuera «llega» al input. Llega el
  **clic y el foco**, no el **nombre**. Por eso la pieza parecía resuelta: su propio código lo
  afirma. Es el mismo muro que `aria-describedby`: nada que apunte por id cruza un shadow root.
- **El navegador ya sabe qué labels apuntan al host**, en `internals.labels`. Nadie usa ese dato.

### 2.8. Nada lleva al input lo que apunta al host, ni lo que está escrito en él

Hay dos direcciones, y cada una tiene su pieza:

- **Lo que apunta al host** (un `<label for>`, el `aria-labelledby` de otro elemento que nombra
  el host): lo resuelve el estándar con `shadowrootreferencetarget` / `shadowRoot.referenceTarget`,
  que reenvía esas referencias a un elemento del shadow root. **El compilador no lo escribe**:
  la plantilla de un control-componente no lleva el atributo, ni su `attachShadow` la opción.
  Y el estándar es experimental: solo está en Chrome, no en Safari ni en Firefox.
- **Lo que está escrito en el propio host** (`aria-describedby`, `aria-labelledby`): el puente
  **no** lo reenvía, ni siquiera donde existe. Hace falta pasarlo al input con *element
  reflection* (`ariaLabelledByElements`, `ariaDescribedByElements`), la API estándar con la que un
  elemento de un shadow root referencia elementos de los árboles que lo contienen.

### 2.9. Un mensaje fuera del control-componente está prohibido

BUG-41 §3.4 definió `FUD0597` incluyendo *«el caso de que el nodo solo cruce como prop a un
componente»*, porque *«`aria-describedby` no atraviesa un shadow root»*. Era verdad sin el
traslado de §2.8. Con él, un `app-error` hermano de un `app-input` sí puede describir su input,
pero la regla lo rechaza, y el emit no tiene llamada que escriba el mensaje: al control lo
enlaza el hijo, no el padre.

### 2.10. Un `<label>` dentro de un envoltorio no puede apuntar fuera

Si `app-label` pinta su **propio** `<label>` dentro de su shadow root, el `for` de ese label solo
busca en ese shadow root y nunca encuentra el host de la página. `shadowrootreferencetarget` es un
puente **de entrada** (lleva a un shadow root lo que apunta a su host), y no hay ningún estándar,
ni propuesto, que haga de puente de salida. Por eso el `app-label` del ejemplo **proyecta** el
`<label>` de la página con un slot, y no pinta uno suyo (§4.10).

### 2.11. El `<template>` raíz no tiene editor

Los atributos de `<template shadowrootmode>` no se ofrecen ni se validan. Con §2.8 hay uno más
que importa, `shadowrootreferencetarget`, cuyo valor tiene que ser un id estático de la plantilla.

### 2.12. El ejemplo y el e2e no cubren nada de esto

`user.form.ts` no tiene `summary`, `app-form.fud` no tiene marcador de resumen, ni botón que
dependa de la validez, ni ningún patrón de envoltorio salvo `app-input`, y
`examples/basic/tests/forms.spec.ts` no mira ni el resumen ni los nombres accesibles.

### 2.13. Alcance

| Sitio | Causa | Se corrige |
|---|---|---|
| `forms`: modelo | sin validez pública; grupo sin opciones; resumen de un solo mensaje; sin lista de errores visibles | sí: `valid()`, `$valid()`, `Validity`, `GroupOptions`, `$messages()`, `$issues()`, `$submitted()` |
| `forms`: `bindForm` / `bindGroup` | resumen solo con `$message()`; foco siempre al primer campo | sí: pinta la lista, sus enlaces y el foco al resumen |
| `forms`: mensaje de un control-componente | ninguna llamada lo escribe desde el padre | sí: `bindMessage` |
| `forms`: `FudicControlElement` | nada llega al input interno | sí: traslado siempre, respaldo sin puente nativo |
| `compiler` | `error` para campo y resumen; resumen solo texto; sin puente; `FUD0597` demasiado ancho | sí: `summary`, `fields`, `shadowrootreferencetarget` (decisiones 131 y 132), `FUD0600`–`FUD0605` |
| `language-core`: proyección | `$errorOf` es la única entrada | sí: `summary` se proyecta igual |
| `language-server` | todo atado a `control`; `<template>` sin editor | sí: paridad con `control`, `fields`, atributos del `<template>` |
| `examples/basic` + e2e | sin resumen, validez ni patrones de envoltorio | sí: el ejemplo de §0, con axe y los dos caminos del puente |
| `packages/forms/README.md` | describe `error=@f` como resumen | sí |

---

## 3. Interfaz pública

### 3.1. `@fudic/forms` — modelo

```ts
/**
 * Qué cuenta para la validez (§4.3). No son flags: es una de dos.
 * `Rules`: toda regla que falla cuenta, se haya tocado el campo o no.
 * `Interacted`: un control cuenta cuando el usuario ha pasado por él o lo ha cambiado.
 */
export const Validity = { Rules: 0, Interacted: 1 } as const;
export type Validity = (typeof Validity)[keyof typeof Validity];

export interface ControlOptions {
  readonly messages?: Messages;
  readonly validateOn?: ValidateOn;
  /** Gana a la del formulario. */
  readonly validity?: Validity;
}

export interface FormOptions<S extends Schema> {
  readonly summary?: (root: Form<S>) => Errors | null | Promise<Errors | null>;
  readonly messages?: Messages;
  readonly validateOn?: ValidateOn;
  /** La de todos sus controles, salvo el que elija la suya. */
  readonly validity?: Validity;
}

/** Lo que `group()` acepta además del schema y sus reglas. Lo mismo que un form, sin `summary`. */
export interface GroupOptions {
  readonly messages?: Messages;
  readonly validateOn?: ValidateOn;
  readonly validity?: Validity;
}

export function group<S extends Schema>(
  schema: S,
  validators?: readonly AnyValidator<NoInfer<Value<S>>>[],
  options?: GroupOptions,
): GroupNode<S>;

/** Una entrada del resumen: de qué nodo es (`''` el propio form o grupo) y qué dice. */
export interface Issue {
  readonly path: string;
  readonly message: string;
}

export interface Control<T> {
  // … lo de siempre …
  /** Si el valor actual cumple las reglas, según su `validity` (§4.3). Tracked. Silencioso. */
  readonly valid: Readable<boolean>;
}

export interface FormApi<S extends Schema> {
  // … lo de siempre …
  /** Si todo el árbol y sus propias reglas se cumplen (§4.3). Tracked. Silencioso. */
  readonly $valid: Readable<boolean>;
  /** Todos los textos de su propio resumen, en orden, o `[]`. Tracked. (§4.6) */
  readonly $messages: Readable<readonly string[]>;
  /**
   * Sus propios textos y, tras un envío, el error visible de cada nodo de debajo, en orden de
   * declaración. Lo que pinta un resumen con `fields`. Tracked. (§4.7)
   */
  readonly $issues: Readable<readonly Issue[]>;
  /** Hubo un intento de envío. Lo marca `bindForm`; lo limpian `$reset` y `$set`. Tracked. */
  readonly $submitted: Readable<boolean>;
}
```

- `$message()` sigue existiendo y pasa a ser el **primero** de `$messages()`, o `''`.
- `$summary()` pasa a ser la **unión** de los errores de todas las reglas del resumen que fallan.
  Con una clave repetida gana la regla declarada antes.
- `$valid` lleva `$` y `valid` no, por la misma razón que el resto de la API: los campos y la API
  de un form cuelgan del mismo objeto, y el `$` impide que `valid` choque con un campo llamado así
  ([`form.ts:62-66`](../../../packages/forms/src/form.ts)). Un control no tiene campos, igual que ya
  pasa con `errors()` o `message()`.

### 3.2. `@fudic/forms/dom` y `@fudic/forms/element`

- **`bindForm` y `bindGroup`** reciben, además del marcador del resumen, **si lleva `fields`** y el
  **mapa ruta → id** de los elementos enlazados en su plantilla, que escribe el compilador.
- **`bindMessage(slot, control)`**, nueva: escribe el texto de un control en un marcador `error=`
  cuyo control **no** enlaza esta plantilla, porque cruza a un control-componente (§4.9). Hace lo
  mismo que la mitad «mensaje» de las `bind*`: `touched() ? message() : ''`.
- **`FudicControlElement`** recibe del emit **su campo**: el elemento de su shadow root que lleva
  `control=` (o el contenedor de sus radios). Es la pieza a la que traslada nombre y descripción.

Las firmas exactas son internas del emit: el autor nunca las llama.

### 3.3. Gramática — decisión 131 (enmienda la 113 y la 130)

`summary` es atributo **reservado** con valor de expresión `@`, de la familia de `control` (108)
y `error` (130). La 130 se parte en dos:

| Atributo | Nombra | Pinta | Empareja con |
|---|---|---|---|
| `error=@nodo` | un **control** | `node.message()` cuando está tocado, **como texto** | el elemento que lo enlaza con `control=` (o sus radios), **o** el host de un control-componente al que cruza |
| `summary=@nodo` | un **formulario o un grupo** | una **lista**: `$messages()`, o `$issues()` con `fields` | el `<form control>` o el elemento de grupo (`<fieldset>`, `<div>`…) que lo enlaza |

- **`fields`** es un atributo booleano, reservado **solo** en un elemento con `summary=`. El
  compilador lo quita del HTML. Con él, el resumen lista también los errores de campo (§4.7).
- **Enmienda de la 113.** El runtime ya no escribe *solo texto* en todos los marcadores. Un
  `error=` sigue siendo texto. Un `summary=` escribe una lista (`<ul>` de `<li>`, con un `<a>` por
  error de campo), y el servidor escribe **la misma**, byte a byte. Lo que se conserva de la 113:
  el marcado lo decide el compilador, y SSR e hidratación dan el mismo HTML.
- **Enmienda de la 130.** Un `error=` **puede** describir el control de un control-componente
  desde fuera (§4.9). La 130 lo prohibía porque `aria-describedby` no cruza un shadow root; con el
  traslado de §4.8, sí llega.
- Todo lo demás de la 130 vale para los dos. El elemento, su etiqueta y su sitio son del autor. El
  compilador solo añade atributos: `id` si no lo trae, `aria-describedby` en el elemento
  emparejado y, en un `summary`, `aria-live="polite"` si el autor no puso uno (**en un form y en
  un grupo**), y además `tabindex="-1"` si lleva `fields`. Mismo bloque, fuera de bucles, vacío,
  sin `id` dinámico (`FUD0596`–`FUD0599`, ahora con el nombre del atributo en el mensaje).
- **A un campo enlazado sin `id`**, cuando un resumen con `fields` lo lista, el compilador le
  pone el derivado `fud-c-…` para poder enlazarlo. Solo añade un atributo a un elemento que
  escribió el autor (BUG-41 §5).

### 3.4. Gramática — decisión 132 (enmienda la 111)

**Un control-componente lleva el puente hacia su campo.** En un componente con `<template
shadowrootmode="open" formassociated>`:

- **`formassociated` se mantiene.** Es un marcador de fudic, no del estándar, y fudic lo quiere
  proponer. Sigue decidiendo lo que decide la 111: la clase base (`FudicControlElement`),
  `delegatesFocus` y la hidratación al cargar la página.
- **El compilador escribe `shadowrootreferencetarget="<id del campo>"`** en el `<template>` del
  HTML de servidor, y `referenceTarget` en el `attachShadow` del cliente. El campo es el elemento
  que lleva `control=`, o el contenedor de sus radios.
- **El id del campo** es el id estático que escribió el autor, o uno derivado si no escribió
  ninguno. Un id **dinámico** es `FUD0604`: el puente tiene que apuntar a un id que el compilador
  conoce. Los ids de un shadow root son locales a él, así que un id fijo sirve en todas las
  instancias.
- **Si el autor escribe `shadowrootreferencetarget` a mano**, el compilador respeta el suyo. Tiene
  que ser estático y nombrar un id de esa plantilla (`FUD0605`).

### 3.5. Proyección (`language-core`)

`summary` se proyecta como `error`: el valor es código, un camino mal escrito es un error de
TypeScript y renombrar un campo en el `.ts` lo renombra en el marcador. El **tipo** comprobado
sigue siendo «un nodo» (`$ControlNode | $FormNode`) para los dos.

Qué **clase** de nodo va en cada uno no lo decide TypeScript, y es a propósito. Un form raíz y un
grupo tienen la misma forma (`GroupNode<S> = Form<S>`), así que el tipo no puede decir «solo el
form de este `<form>`». Lo decide el emparejamiento, en el compilador, con `FUD0600`/`FUD0601`.
Una sola voz por hecho: si también lo comprobara la proyección, el editor diría el mismo error dos
veces (la lección de BUG-23).

### 3.6. Diagnósticos

| Código | Cuándo | Severidad |
|---|---|---|
| `FUD0600` | `error=` empareja con un form o un grupo. Mensaje: usa `summary=` | error |
| `FUD0601` | `summary=` empareja con un control. Mensaje: usa `error=` | error |
| `FUD0602` | el elemento de un `summary=` no puede contener una lista (`<p>`, `<span>`, `<small>`, `<label>`, `<a>`, `<button>`, `<strong>`, `<em>`, `<b>`, `<i>`, `<h1>`–`<h6>`, `<legend>`): el `<ul>` que escribe el runtime sería HTML inválido | error |
| `FUD0603` | en un control-componente, un grupo de radios enlazado que no está dentro de un `<fieldset>` o de un elemento con `role="radiogroup"`: no hay campo al que llevar el puente ni el nombre | error |
| `FUD0604` | en un control-componente, el campo lleva un `id` dinámico: el puente no puede apuntarle | error |
| `FUD0605` | un `shadowrootreferencetarget` escrito a mano es dinámico o nombra un id que no está en la plantilla | error |

`FUD0597` se estrecha: deja de incluir el caso de un nodo que cruza a un control-componente
(`formassociated`). Sigue incluyéndolo si el componente **no** es `formassociated`, porque ahí no
hay campo al que trasladar nada.

Todos se reportan con span y salen igual en el build y en el editor (el language server reenvía
los diagnósticos del compilador).

### 3.7. Editor (`language-server`)

`error` y `summary` tienen **la misma** mitad de editor que `control` (§4.1), `fields` se ofrece y
se explica en un elemento con `summary=`, y el `<template>` raíz ofrece y explica sus atributos
(§4.11). No hay API nueva: las funciones de `position.ts` y `forms.ts` se generalizan del nombre
`control` a los tres atributos, cada uno con su filtro.

---

## 4. Comportamiento corregido

### 4.1. Paridad en el editor

- **Oferta del atributo.** `error` y `summary` se ofrecen en los mismos sitios que `control`
  (`controlSites`, decisión 115), en tags nativos y de componente, salvo en un elemento que ya
  lleve ese atributo. Un layout no ofrece ninguno (`FUD0437`), igual que hoy `control`. `fields`
  solo se ofrece en un elemento que ya lleva `summary=`.
- **Valor de `error=`.** Se ofrecen los nodos que **llevan** a un control, con la misma regla que
  `control=` en un campo (`reaches` en la lista, `accepts` en un enlace terminado): controles y
  grupos. **Ningún miembro `$`**: la API no es un nodo y no pasa la prueba de forma
  (`forms.ts:437`).
- **Valor de `summary=`.** Se ofrecen los nodos que enlazan con `control=` los **ancestros**
  `<form>` y de grupo del marcador, **del más cercano al más lejano**. No se ofrecen miembros: el
  resumen es de un nodo que ya está enlazado.
- **Hover.** `error`: marca el elemento que dice el error de un control. `summary`: dice el
  resumen de un form o de un grupo, con `aria-live`. `fields`: añade al resumen el error de cada
  campo tras un envío, enlazado, y le lleva el foco.
- **Bombilla: no.** La de `control` rellena un enlace que **falta**. Un marcador es opcional por
  diseño (decisión 130), y proponer uno sería el framework maquetando por el autor.

### 4.2. `summary` en el compilador

- Se clasifica como `error` (mismo `classify`, otro nombre) y entra en el **mismo**
  emparejamiento (`markers.ts`). El `kind` que ya calcula decide: un `error` con `kind` `form` o
  `group` es `FUD0600`, y un `summary` con `kind` `value` es `FUD0601`.
- **`aria-live="polite"` también en el resumen de un grupo** (`controls.ts:155`). *«Las
  contraseñas no coinciden»* aparece al escribir, sin mover el foco, y un texto que cambia fuera
  de una live region no se anuncia.
- Con `fields`: `tabindex="-1"` en el marcador, el mapa ruta → id de los campos enlazados en la
  plantilla (con el `id` derivado donde falte, §3.3), y a cada campo sin `error=` propio que el
  resumen lista, un `aria-describedby` hacia su entrada (`<li id>`). En un control-componente ese
  `aria-describedby` va en el host, y `FudicControlElement` lo traslada (§4.8).
- El marcado de la lista está en §4.6. El servidor la escribe y el cliente la adopta **sin
  recorrer sus hijos**, porque son del runtime y no de la plantilla.
- Servidor y cliente dan el mismo árbol, byte a byte (SDD-34 §6.10).

### 4.3. Validez: silenciosa, reactiva y del autor

**Qué cuenta.** Un control **cuenta** para la validez si su política es `Validity.Rules`, o si es
`Validity.Interacted` y el usuario ha interactuado con él: `touched() || dirty()`. Las dos
condiciones hacen falta. `dirty` sola falla con quien escribe `abc` y lo borra: el valor vuelve al
inicial, deja de estar sucio y dejaría de contar justo cuando está mal.

**`control.valid()`**

- Un control que no cuenta es válido.
- Uno que cuenta es **inválido** si se cumple cualquiera de estas condiciones:
  1. una regla **síncrona de cliente** falla con el valor **actual**. Se evalúa en vivo, no se lee
     de `errors`;
  2. hay errores publicados **para el valor actual** (misma época): el veredicto de una regla
     asíncrona, un 422 recibido con `$setErrors` o una validación del autor;
  3. una regla **asíncrona de cliente** todavía no tiene veredicto para el valor actual
     (*pendiente*).
- Las reglas `serverValidator` no corren en el cliente, como hoy. Su veredicto llega en el 422 y
  cuenta por la condición 2 hasta que el valor cambie.

**`form.$valid()` / `group.$valid()`**

- Válido si **todos** sus hijos son válidos y **todas** sus propias reglas (`summary` en un form,
  las del grupo en un grupo) se cumplen.
- Las propias reglas cuentan con `Rules`, o con `Interacted` en cuanto **algún** descendiente
  cuenta.
- Síncronas en vivo, asíncronas con la misma regla de *pendiente*.

**Resolución de la política.** Como `validateOn` (BUG-41 §4.5): la del control → la del form o
grupo más cercano que eligió una → `Validity.Interacted`. Viaja con la adopción de la raíz.

**Silenciosa.** Leer `valid()` o `$valid()` **nunca** publica errores, nunca marca `touched` y
nunca cambia `aria-invalid` ni un marcador. Lo que el usuario ve sigue gobernado por `touched`,
`validateOn` y el submit, exactamente como tras BUG-41. Al entrar en la página no sale ningún
mensaje, con ninguna de las dos políticas.

**Reactiva.** Es una lectura tracked (`computed` de `@fudic/core`). Se reevalúa cuando cambia algo
que lee: valores (también los de otros campos que lea una regla cruzada), `touched`, `dirty` o
errores publicados. `disabled=@(!userForm.$valid())` se actualiza solo.

**El submit no cambia.** Valida siempre, antes que el `@submit` del autor (BUG-41 §4.2).
`$valid()` no es la puerta del envío: es una lectura para la vista.

### 4.4. `group()` con opciones

El tercer argumento es `GroupOptions`. `messages` redacta el resumen del grupo (y gana a
`setMessages`); `validateOn` y `validity` son la política de sus controles, que se hereda como en
un form anidado. Un grupo no tiene `summary`: sus reglas ya son su resumen (segundo argumento).

### 4.5. Accesibilidad de un botón deshabilitado

Deshabilitar el submit es decisión del autor, y el framework la permite. Tiene una consecuencia
que el ejemplo resuelve y la documentación tiene que decir: con el botón deshabilitado el submit
no ocurre, así que `bindForm` nunca toca los campos ni mueve el foco. Un usuario que no haya
salido de un campo vería el botón gris sin ningún mensaje. Con la política por defecto
(`ValidateOn.Blur`, `Validity.Interacted`) no pasa: un campo solo cuenta una vez tocado, y tocarlo
(salir de él) ya pinta su mensaje.

### 4.6. El resumen dice todos sus errores

- **Todas las reglas del resumen corren**, sin parar en la primera: `summary` en un form y todas
  las del grupo. Un **campo** sigue diciendo uno solo (SDD-33 §4.5): `firstFailure` se queda para
  los controles.
- **`$messages()`** redacta **cada clave** de cada regla que falla, en orden de regla y de clave,
  con la misma cadena de textos: `messages` del nodo → `setMessages` → código.
- **Marcado.** Un resumen sin nada que decir está **vacío**, sin hijos, así que `:empty` sigue
  sirviendo para ocultarlo. Con algo que decir:

  ```html
  <div class="error resumen" id="fud-s-…" aria-live="polite">
    <ul>
      <li>El alias no puede ser tu nombre.</li>
      <li>La contraseña no puede contener tu nombre.</li>
    </ul>
  </div>
  ```

  Siempre una lista, también con un único mensaje: un lector la anuncia como lista (*«lista, 2
  elementos»*), y la forma del marcado no depende de cuántos haya. `FUD0602` impide ponerla donde
  sería HTML inválido.
- Quien quiera otra maquetación lee `$messages()` o `$issues()` y la escribe él con `@foreach`.
  El marcador es la forma accesible por defecto, no la única.

### 4.7. Los errores de campo en el resumen: `fields`

El patrón *error summary*. Cumple WCAG 3.3.1 porque identifica el campo y describe el error en
texto, y lo hace **con** las cuatro condiciones que lo hacen accesible, no solo con la lista:

1. **Cada error de campo es un enlace a su campo**: `<li><a href="#nom">Escribe tu
   nombre.</a></li>`. El texto es el `message()` del control, que ya es propio de su campo.
   Pulsarlo **mueve el foco** al campo (en un control-componente, al host, que lo delega a su
   input) y lo desplaza a la vista. El `href` se queda para quien no tenga JavaScript.
2. **Un envío fallido lleva el foco al resumen**, no al primer campo, cuando el `<form>` tiene un
   resumen con `fields`. Sin él, el foco va al primer campo inválido, como hoy.
3. **Cada campo sigue llevando `aria-invalid`.**
4. **Un campo sin marcador propio** apunta con `aria-describedby` a su entrada del resumen, para
   que quien llegue a él tabulando oiga el error (§4.2). También en un control-componente.

Cuándo entra cada cosa:

- Los errores **propios** del form o del grupo se muestran siempre que existan, como en SDD-34.
- Los **de campo** solo tras un envío (`$submitted()`), y cada uno mientras su campo tenga error
  visible: al corregirlo, su entrada sale en esa misma tecla. Es lo que hace GOV.UK: el resumen
  resume un envío, no persigue al usuario campo a campo.
- **Orden:** primero los propios, después los de campo en orden de declaración del schema.
  Dentro de un grupo, los propios del grupo van delante de sus campos.
- Si un campo tiene también su marcador `error=`, el error sale **en los dos sitios**. Es lo que
  recomienda GOV.UK y lo que hace el ejemplo. Quien lo quiera solo en el resumen quita el marcador
  del campo.

### 4.8. Nombre y descripción del input de un control-componente

**El autor no escribe nada.** Ni el de la página, que escribe su `<label for>` y su `<app-input
id>` como con cualquier control, ni el del control-componente. El arreglo vive en el framework:

| Quién | Qué hace |
|---|---|
| El autor de la página | lo mismo que con un control nativo: `<label for>`, un `<label>` que envuelve, `aria-label`, `aria-labelledby`, y un marcador `error=` donde quiera |
| El autor del control-componente | nada; si pone su propio `<label>` dentro, se respeta |
| El compilador | el puente (`shadowrootreferencetarget` / `referenceTarget`, §3.4), el `aria-describedby` en el host y la entrega del campo a la clase (§3.2) |
| `FudicControlElement` | traslada al campo lo que el host no le hace llegar solo |

**Lo que hace `FudicControlElement`**, en esbozo (no es el código final):

```ts
export abstract class FudicControlElement extends FudicElement {
  // … lo de hoy: formAssociated, internals, delegatesFocus, validity, #wire …

  /** El elemento de mi shadow root que lleva `control=`. Me lo entrega el emit. */
  #field: HTMLElement | null = null;

  override h(props) { super.h(props); this.#wire(props); this.#relay(); }   // al hidratar
  override c(props) { super.c(props); this.#wire(props); this.#relay(); }   // al crear

  #relay(): void {
    const field = this.#field;
    if (field === null) return;

    // 1. SIEMPRE: lo escrito EN el host. El puente no lo reenvía, ni siquiera donde existe.
    //    Element reflection: el campo referencia elementos del árbol de fuera, sin copiar texto.
    merge(field, 'ariaDescribedByElements', resolve(this, 'aria-describedby'));
    merge(field, 'ariaLabelledByElements', resolve(this, 'aria-labelledby'));
    if (this.hasAttribute('aria-label') && !ownName(field)) field.ariaLabel = this.ariaLabel;

    // 2. SOLO SIN PUENTE NATIVO: los <label for> que apuntan al host.
    const bridged = 'referenceTarget' in ShadowRoot.prototype && this.shadowRoot?.referenceTarget;
    if (!bridged && !ownName(field)) {
      merge(field, 'ariaLabelledByElements', [...this.internals.labels]);
    }
  }
}
```

**Las reglas:**

- **Lo escrito en el host se traslada siempre**, haya puente nativo o no: `aria-describedby`
  (el marcador `error=` de fuera y la entrada del resumen), `aria-labelledby` y `aria-label`.
- **Los labels (`internals.labels`) se asocian solo sin puente nativo.** Con puente, el navegador
  ya asocia el `<label for>` al campo, y hacerlo dos veces duplicaría el nombre.
- **Se referencia, no se copia**, con *element reflection* (`ariaLabelledByElements`,
  `ariaDescribedByElements`). El nombre sigue vivo si el texto cambia, incluye el contenido del
  shadow root de un envoltorio, y no se lleva el `*` en `aria-hidden`.
- **Se funde con lo del campo, no lo pisa.** Si el campo ya tiene descripción propia dentro de su
  shadow root (el marcador interno de `app-field`), la de fuera se añade detrás. Si ya tiene
  nombre propio (un `<label>` interno), no se añade otro.
- **Cuándo:** al conectarse y al hidratarse, y cuando cambian `id`, `aria-label`,
  `aria-labelledby` o `aria-describedby` del host. Los control-componentes se definen al cargar la
  página (SDD-34 §4.5), así que el input tiene nombre en cuanto el runtime está.
- **Último recurso:** si un navegador no tuviera *element reflection*, el nombre se copia como
  texto a `aria-label` y la descripción a `aria-description`. La tarea que lo implementa verifica
  el soporte real en los tres motores y lo deja anotado.
- **Un grupo de radios** dentro de un control-componente recibe todo en su contenedor, que tiene
  que ser un `<fieldset>` o llevar `role="radiogroup"` (`FUD0603`).
- **El día que el puente esté en los tres motores**, el paso 2 se borra. El HTML no cambia: ya
  lleva el atributo.

**El comentario de `element.ts:14-16` se corrige**: `delegatesFocus` lleva el clic y el foco; el
nombre y la descripción los llevan el puente y el traslado.

### 4.9. Un mensaje fuera del control-componente

- `<app-error error=@userForm.email>` junto a `<app-input control=@userForm.email>` **empareja**:
  el nodo cruza a un control-componente en el mismo bloque. `FUD0597` ya no aplica ahí (§3.6).
- El compilador escribe `aria-describedby="<id del marcador>"` en el **host** del control-componente
  (que el traslado de §4.8 lleva al input), y emite `bindMessage(marcador, nodo)`, porque el padre
  no enlaza ese control: lo enlaza el hijo.
- El runtime escribe el texto en el host de `app-error`, en su light DOM, y `app-error` lo pinta
  con `<slot>`. Sin mensaje, el host está vacío y `:host(:empty)` lo oculta.
- Si el control-componente lleva **además** su propio marcador interno, el mensaje sale dos
  veces. Es decisión del autor, como en §4.7.

### 4.10. Los cuatro patrones de un campo

| Patrón | Nombre | Descripción | Clic en el label |
|---|---|---|---|
| **Nativo** (*Nombre*) | `<label for>` | `aria-describedby` del compilador | nativo |
| **Label nativo + `app-input` + `app-error`** (*Alias*) | puente, o respaldo (§4.8 paso 2) | traslado (paso 1) | nativo: el label apunta al host y `delegatesFocus` lleva el foco |
| **`app-label` + `app-input` + `app-error`** (*Email*) | igual que *Alias*: el `<label>` proyectado vive en el árbol de la página | traslado | nativo |
| **`app-field`** (*Web*) | `<label for>` interno, mismo árbol | `aria-describedby` interno, mismo árbol | nativo |

**Por qué `app-label` proyecta el `<label>` y no pinta uno suyo.** Un `<label>` dentro del shadow
root de `app-label` no puede apuntar fuera (§2.10). La alternativa que funciona para el nombre es
que `app-label` tenga su texto dentro, lleve un `id`, y el host del control lo referencie con
`aria-labelledby` (§4.8 paso 1). Pero el clic en ese texto **no** enfoca el input, porque no hay
`<label>` asociado. Por eso el ejemplo enseña el patrón con slot, y el README explica los dos y
por qué uno pierde el clic. La variante con `aria-labelledby` se prueba en los tests, no en el
ejemplo.

### 4.11. El `<template>` raíz en el editor

- **Oferta:** en `<template |>` raíz de un componente, los atributos estándar
  (`shadowrootmode`, `shadowrootdelegatesfocus`, `shadowrootreferencetarget`,
  `shadowrootclonable`, `shadowrootserializable`) y `formassociated`, cada uno con su hover. El
  hover de `formassociated` dice que es un marcador de fudic, qué decide, y que el compilador
  escribe el puente.
- **Valor de `shadowrootreferencetarget`:** los ids estáticos de la plantilla.
- **Validación:** `FUD0604` y `FUD0605` salen en el editor como en el build.

---

## 5. Invariantes

**Los que violaba.**

- *Una construcción del lenguaje tiene su mitad de editor* (BUG-17, BUG-25). `error` no la tenía,
  ni el `<template>` raíz.
- *En una lista se ofrece lo que encaja y lo que lleva a lo que encaja* (BUG-25). En `error=@x.` se
  ofrecía la API entera.
- *Un control del formulario tiene un nombre accesible* (WCAG 4.1.2), y su error lo describe. El
  input de un control-componente no tenía ninguna de las dos cosas.
- *El resumen dice lo que está mal*, no la primera cosa que está mal.

**Los que añade.**

- **Validez y errores son dos lecturas distintas.** La validez es silenciosa y viva; los errores,
  visibles y gobernados por la interacción. Ninguna lectura de la primera cambia la segunda.
- **Un atributo, un significado.** `error` es de un control; `summary`, de un form o de un grupo.
- **Qué clase de nodo va en cada marcador lo decide el emparejamiento**, no el tipo, porque el
  modelo no distingue un form de un grupo por su forma.
- **Un control-componente se etiqueta y se describe como un control nativo**: con un `<label
  for>`, con un `<label>` que lo envuelve o que se proyecta, con `aria-label`, con
  `aria-labelledby` o con un marcador `error=` fuera, y su input lo recibe todo. Con el puente
  nativo donde exista, y el mismo resultado donde no.
- **Estándar primero.** Lo que el estándar resuelve (el puente) se usa donde existe, y el
  respaldo solo cubre lo que falta. Quitarlo el día que sobre no cambia el HTML.
- La **política** de validez es del autor y se escribe en el modelo, como `validateOn`.
- **SSR e hidratación dan el mismo HTML**, también en un resumen con lista y en el puente.

---

## 6. Criterios de aceptación

**A. Modelo** (`packages/forms/test/`)

1. **(rojo primero)** Un form con un `required` vacío y `Validity.Rules`: `$valid()` es `false`
   sin haber validado nunca, y `$errors()` sigue en `null`.
2. Con `Validity.Interacted`: `true` al crear; `false` tras `touch()` del campo vacío; `false`
   tras escribir y borrar (`touched || dirty`).
3. Leer `valid()` / `$valid()` no publica errores, no marca `touched` y no cambia `message()`.
4. Tracked: dentro de un `effect`, `$valid()` se reevalúa al escribir un valor, al tocar, y al
   cambiar el campo que lee una regla cruzada.
5. **(rojo primero)** Un grupo con su regla fallando hace que la raíz no sea válida (el caso que
   el apaño de §2.3 no ve). La regla del resumen cuenta según §4.3.
6. Una regla asíncrona sin veredicto para el valor actual deja el control inválido; con veredicto
   `null`, válido; un veredicto de una época vieja no cuenta.
7. `$setErrors` (un 422) deja inválido el control hasta que su valor cambia.
8. Resolución de `validity`: el control gana al form, el form anidado al de fuera, y sin nada es
   `Interacted`.
9. `group(schema, rules, { messages })`: el `$message()` del grupo es el texto propio, por delante
   de `setMessages`.
10. **(rojo primero)** La regla del resumen del §0.1 con los dos casos a la vez: `$messages()`
    trae **los dos** textos, `$message()` el primero y `$summary()` las dos claves. Un grupo con
    dos reglas que fallan trae las dos.
11. `$issues()`: antes de `$submitted()`, solo los propios; después, los propios y los errores
    visibles de los campos, en orden de declaración, con su ruta; un campo corregido sale de la
    lista. `$reset` y `$set` limpian `$submitted()`.

**B. Enlaces del DOM** (`packages/forms/test/dom/`)

12. El resumen pinta `<ul>` con un `<li>` por mensaje, vacío sin hijos cuando no hay nada, y con
    `fields`, un `<a href="#id">` por error de campo con el id del mapa.
13. **(rojo primero)** Un envío fallido con resumen `fields` lleva el foco al resumen; sin
    `fields`, al primer campo inválido (el comportamiento de BUG-41 no cambia).
14. Pulsar un enlace del resumen enfoca su campo, también cuando el campo es el host de un
    control-componente.
15. `bindMessage` escribe `message()` en el marcador cuando el control está tocado, y lo vacía
    cuando no.
16. `FudicControlElement`: traslada `aria-describedby`, `aria-labelledby` y `aria-label` del host
    **con y sin** puente; asocia `internals.labels` **solo sin** puente; funde con la descripción
    propia del campo y no añade nombre si ya tiene uno; se actualiza al cambiar los atributos del
    host; en radios, al contenedor. (happy-dom no implementa el puente, ni `internals.labels`, ni
    todo *element reflection*: aquí se prueba con dobles, y de verdad en §6.G.)

**C. Compilador** (`packages/compiler/test/`)

17. `summary=@f` en un `<form control=@f>` y `summary=@f.g` en un `<fieldset control=@f.g>`:
    `id`, `aria-describedby` en el elemento emparejado y `aria-live="polite"` en los **dos**, sin
    pisar un `aria-live` del autor.
18. `fields`: se quita del HTML, pone `tabindex="-1"`, emite el mapa ruta → id (con `fud-c-…`
    donde falte el id) y el `aria-describedby` de los campos sin marcador hacia su entrada, en el
    host si es un control-componente. En un elemento sin `summary=`, `fields` es un atributo más.
19. **(rojo primero)** `error=@f` emparejado con el `<form>` da `FUD0600`; `summary=@f.name`
    emparejado con un `<input>` da `FUD0601`; `<p summary=@f>` da `FUD0602`; radios en un
    control-componente sin contenedor dan `FUD0603`; un campo con `id=@x` en un control-componente
    da `FUD0604`; un `shadowrootreferencetarget` dinámico o con un id ajeno da `FUD0605`. Span
    sobre el atributo o el elemento.
20. `FUD0596`–`FUD0599` se reportan igual para `summary`, con su nombre en el mensaje.
21. **(rojo primero)** El puente: un control-componente emite `shadowrootreferencetarget` con el id
    de su campo (el del autor, o uno derivado) en el servidor, y `referenceTarget` en el
    `attachShadow` del cliente. Uno escrito a mano se respeta.
22. **(rojo primero)** `<app-error error=@f.email>` junto a `<app-input control=@f.email>` (componente
    `formassociated`) ya no da `FUD0597`: emite `aria-describedby` en el host y `bindMessage`. Con
    un componente que no es `formassociated`, sigue dando `FUD0597`.
23. Servidor = cliente hidratado, byte a byte, con el ejemplo de §0, un 422 aplicado, un resumen
    `fields` con entradas (el cliente no recorre los hijos del marcador) y los cuatro patrones.

**D. Editor** (`packages/language-core/test/` y `packages/language-server/test/`)

24. `summary` se proyecta como `error`: renombrar `userForm.acceso` en el `.ts` lo renombra en el
    marcador, y un camino que no existe da error de tipos. Una clase de nodo equivocada **no** da
    error de tipos (lo da `FUD0600`/`FUD0601`, una sola vez).
25. **(rojo primero)** `<div |>` dentro de un `<form control>` ofrece `error` y `summary`, en tag
    nativo y de componente. Fuera de un form (sin exención de control-componente) no los ofrece.
    `fields` solo se ofrece junto a `summary=`.
26. **(rojo primero)** `error=@userForm.` ofrece `name`, `alias`, `email`, `web`, `acceso` y ningún
    miembro `$` (el caso de la captura de la revisión), en las tres formas de la posición: con
    comillas, sin ellas y con el valor aún vacío.
27. `summary=@` dentro del `<fieldset>` de §0 ofrece `userForm.acceso` y después `userForm`, y nada
    más; en el `<form>`, solo `userForm`.
28. Hover sobre `error`, `summary` y `fields`.
29. `disabled=@(!userForm.` ofrece `$valid` (una expresión libre sigue viendo la API).
30. **(rojo primero)** `<template |>` raíz ofrece los cinco atributos estándar y `formassociated`,
    con hover; `shadowrootreferencetarget="|"` ofrece los ids estáticos de la plantilla.
31. **Una tabla de paridad**, no un test por servicio: para cada uno de `control`, `error` y
    `summary`, las cuatro voces de §2.1 contestan. Es el criterio que habría atrapado el hueco que
    el 19 de BUG-41 dejó pasar.

**E. Ejemplo**

32. `examples/basic` lleva **exactamente** el ejemplo de §0: el modelo, los cuatro componentes
    (`app-input` recortado, `app-error`, `app-label` y `app-field`, nuevos) y la vista. El texto de
    `/formularios` explica el resumen, `fields`, la validez y los cuatro patrones.

**F. Documentación**

33. `packages/forms/README.md` describe todo lo de §3 con el ejemplo recortado: los cuatro
    patrones de un campo, por qué `app-label` proyecta el `<label>` (y la variante con
    `aria-labelledby`, que pierde el clic), el puente y su respaldo, y los avisos de §4.5 y §7. Deja
    de presentar `error=@f` como resumen. El README del compilador o de SDD-34 anota que
    `formassociated` es una propuesta de fudic.

**G. En el navegador** (`examples/basic`, e2e con Chromium y Pedro)

34. **(rojo primero)** Nombres, medidos en el árbol de accesibilidad y no con atributos:
    `getByRole('textbox', { name })` encuentra el input de *Nombre*, *Alias*, *Email* y *Web* (el
    de dentro de cada componente), sin asterisco.
35. **(rojo primero)** Descripciones: con error, `toHaveAccessibleDescription` de cada uno de los
    cuatro es su mensaje (el de `app-error` en *Alias* y *Email*, el interno en *Web*).
36. Pulsar cada label enfoca su input, en los cuatro patrones.
37. **Los criterios 34–36 y el paso 10 de §0.6 se repiten con el respaldo forzado**: una
    `addInitScript` borra `referenceTarget` de `ShadowRoot.prototype` antes de cargar la página. Si
    el Chromium de Playwright trae el puente nativo, la pasada normal prueba el camino nativo; si no
    lo trae, se anota, y las dos pasadas prueban el respaldo.
38. La variante de `app-label` con texto propio y `aria-labelledby` (fixture de test, no del
    ejemplo) da nombre al input.
39. **(rojo primero)** axe (`@axe-core/playwright`, versión exacta, dependencia de desarrollo de
    `@fudic/example-basic`) sobre `/formularios` sin **ninguna** infracción: al entrar, tras un
    envío fallido (con el resumen lleno) y con todo válido. En las dos pasadas.
40. Los catorce pasos de §0.6, uno por test en `forms.spec.ts`.
41. Pedro pasa Lighthouse sobre `/formularios` (dev y `vite preview`): accesibilidad sin *«Form
    elements do not have associated labels»* ni ningún otro aviso de formulario.
42. `pnpm typecheck`, `pnpm test` y `pnpm build` en verde. `@fudic/forms`, `@fudic/language-core` y
    `@fudic/language-server` siguen en 100 / 100 / 100 / 100; `@fudic/compiler` no baja del suelo
    medido al abrir la rama.

---

## 7. Fuera de alcance

- **`aria-required` automático.** El `*` lo pone el autor en el label, en `aria-hidden`. Que el
  enlace escriba `aria-required="true"` cuando el control tiene `required` es una mejora aparte,
  no parte de la corrección.
- **Un puente de salida** para que un `<label>` dentro del shadow root de un envoltorio apunte
  fuera. No existe ni está propuesto en ningún estándar. El patrón correcto es proyectar el
  `<label>` (§4.10).
- **Deducir `formassociated`** del contenido de la plantilla. Se mantiene explícito porque fudic lo
  quiere proponer como estándar (§3.4).
- **La bombilla para marcadores** (§4.1).
- **Lanzar reglas asíncronas para calcular la validez.** `valid()` no dispara red: una regla
  asíncrona se lanza en los momentos de `validateOn` y en el submit, como hoy. La documentación
  tiene que decir la consecuencia: con `ValidateOn.Submit`, una regla asíncrona de cliente y el
  botón deshabilitado por `$valid()`, el control queda *pendiente* para siempre y el botón no se
  habilita. El ejemplo no tiene reglas asíncronas de cliente (`serverValidator` no corre en él).
- **Cambiar el prefijo `$`** de la API del formulario.
- **El envío.** `bindForm` sigue sin enviar nada.
