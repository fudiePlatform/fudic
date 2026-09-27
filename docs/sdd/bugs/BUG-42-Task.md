# BUG-42 — Tareas

> **BUG:** [BUG-42 — Los formularios de SDD-34 no se pueden terminar desde la vista](./BUG-42-error-resumen-y-validez-en-la-vista.md)
> **Paquetes:** `@fudic/forms` · `@fudic/compiler` · `@fudic/language-core` · `@fudic/language-server` · `@fudic/example-basic`
> **Rama:** `bug-42-formularios-desde-la-vista`, creada desde `bug-41-validacion-y-hueco-de-error` y trabajada en el mismo worktree (`.claude/worktrees/bug-41-validacion-y-hueco-de-error`), por indicación de Pedro: el BUG sale de la revisión de BUG-41, y dos ramas permiten seguir cada uno por separado
> **Progreso:** 25 / 27

**Todo se cierra aquí.** Por decisión de Pedro no hay otro BUG ni otro SDD: el resumen con varios
mensajes, el resumen con los errores de campo y la accesibilidad de los controles envueltos en
componentes entran en estas tareas y ninguno se aplaza.

El orden es el mismo que funcionó en BUG-41. **Primero la corrección**, fase a fase y cada una
probable sola. Después Pedro la prueba en `/formularios`, con la extensión reinstalada y
Lighthouse. Y al final los tests contra el código ya arreglado, vistos fallar revirtiendo las
líneas que los hacen pasar.

- **Fase 1** es solo modelo: `$valid()` y `$messages()` se pueden leer en una vista de hoy sin
  tocar el compilador.
- **Fase 2** es el runtime del DOM: el resumen como lista, `fields`, el foco, `bindMessage` y el
  traslado de nombre y descripción al input de un control-componente.
- **Fase 3** cambia la gramática, el puente y los goldens.
- **Fase 4** es solo editor. Sin ella el ejemplo compila pero se escribe a ciegas, que es justo el
  síntoma de BUG-42 §1.1–§1.2.

---

## Mapa de dependencias

```
1 validez control ──→ 2 validez form/grupo ────────────────┐
3 opciones group() ────────────────────────────────────────┤
4 resumen completo ──→ 5 resumen en el DOM ────────────────┤
6 bindMessage ─────────────────────────────────────────────┤
7 traslado en FudicControlElement ─────────────────────────┤
                                                           ├──→ 18 ejemplo ──→ 19 README ──→ 20 navegador (Pedro)
8 summary= ──→ 9 fields ──→ 10 emit de la lista ───────────┤                                        │
          └──→ 11 puente y campo del control-componente ───┤                                        ▼
          └──→ 12 mensaje fuera del control-componente ────┤                        21…25 tests ──→ 26 cobertura ──→ 27 cierre
          └──→ 13 proyección · 14 oferta · 15 valor · 16 hover · 17 <template> ──┘
```

---

## Antes de empezar

- [x] **Medir el suelo de cobertura** de `forms`, `compiler`, `language-core` y
  `language-server`, y anotarlo en *Notas*. Hay que hacerlo antes de la tarea 1: el criterio 42
  compara contra este número y no contra otro.
- [x] **Buscar todo `error=@<form o grupo>`** en fixtures, tests, goldens y ejemplos. Pasará a ser
  `FUD0600`, y cada uno se migra a `summary=` en la tarea 8, no cuando el build se rompa.
- [x] **Pasar Lighthouse y axe sobre `/formularios` tal como está** y guardar el resultado en
  *Notas*. Es el «antes» de los criterios 34, 35, 39 y 41.
- [x] **Comprobar el soporte real**, en el Chromium de Playwright y en las versiones actuales de
  Chrome, Safari y Firefox, de `shadowrootreferencetarget` / `ShadowRoot.prototype.referenceTarget`
  y de *element reflection* (`ariaLabelledByElements`, `ariaDescribedByElements`). Anotarlo en
  *Notas*: decide qué camino prueba la pasada normal del e2e (criterio 37) y si hace falta el
  último recurso de copiar texto (BUG §4.8).

---

## Fase 1 — el modelo (1–4)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [x] | 1 | — | **Validez del control.** `Validity` (`Rules` · `Interacted`) en su propio módulo, exportado. `validity` en `ControlOptions` y `FormOptions`, resuelto control → form más cercano → `Interacted` y transmitido con `adopt`, como `validateOn`. `control.valid()` es un `computed`: no cuenta si `Interacted` y `!(touched() \|\| dirty())`; si cuenta, es inválido cuando falla una regla **síncrona de cliente** evaluada en vivo sobre el valor actual (sin `untrack`, para que una regla cruzada suscriba el campo que lee), cuando hay errores publicados **de la época actual**, o cuando una regla **asíncrona de cliente** no tiene veredicto para esta época. `errors` tiene que guardar la época en que se publicó: un 422 cuenta hasta que el valor cambia. Nada de esto publica, toca ni cambia `message()`. BUG §3.1, §4.3 | `forms` | `src/validity.ts` (nuevo) · `src/control.ts` · `src/internals.ts` · `src/run-rule.ts` · `src/types.ts` · `src/index.ts` |
| [x] | 2 | 1 | **Validez del form y del grupo.** `$valid()`, también `computed`: todos los hijos válidos **y** todas sus propias reglas (`summary` en un form, las del grupo en un grupo) cumplidas. Las propias cuentan con `Rules`, o con `Interacted` en cuanto algún descendiente cuenta. Asíncronas con la misma regla de *pendiente*. BUG §4.3 | `forms` | `src/form.ts` · `src/internals.ts` · `src/types.ts` |
| [x] | 3 | — | **`group()` con opciones.** `GroupOptions` (`messages` · `validateOn` · `validity`) como tercer argumento. `messages` redacta el resumen del grupo por delante de `setMessages`; las dos políticas se heredan como en un form anidado. BUG §3.1, §4.4 | `forms` | `src/group.ts` · `src/form.ts` · `src/types.ts` · `src/index.ts` |
| [x] | 4 | 3 | **El resumen dice todo.** Las reglas del resumen corren **todas** (una función `allFailures` junto a `firstFailure`, que se queda para los controles). `$summary()` es la unión en orden de regla (gana la primera clave repetida). `$messages()` redacta cada clave con la cadena `messages` → `setMessages` → código, y `$message()` es su primero. `$submitted()`, un signal que solo cambia `bindForm` (por un hook interno, no por API pública de escritura) y que limpian `$reset` y `$set`. `$issues()`: los propios con ruta `''` y, con `$submitted()`, los errores visibles (`touched && errors`) de cada nodo de debajo, en orden de declaración, con los propios de un grupo delante de sus campos. `Issue` exportado. BUG §3.1, §4.6, §4.7 | `forms` | `src/run-rule.ts` · `src/messages.ts` · `src/form.ts` · `src/internals.ts` · `src/types.ts` · `src/index.ts` |

---

## Fase 2 — el runtime del DOM (5–7)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [x] | 5 | 4 | **El resumen en el DOM.** Un efecto único para `bindForm` y `bindGroup` que pinta el marcador: vacío sin hijos, o un `<ul>` con un `<li>` por entrada; con `fields`, cada entrada de campo es un `<a href="#id">` con el id del mapa que le pasa el emit (texto sin enlace si su ruta no está en el mapa). Cada `<li>` lleva el id derivado de su ruta, que es al que apuntan los `aria-describedby` de §4.2. La lista la escribe **una sola función**, que también usa el servidor (tarea 10). En la hidratación el runtime **toma** los hijos que escribió el servidor en vez de duplicarlos. `bindForm` marca `$submitted` en cada intento; un envío fallido con resumen `fields` enfoca el resumen (y sin él, el primer campo inválido, como hoy). Un clic en un enlace del resumen, delegado, hace `preventDefault`, enfoca el campo (el host de un control-componente lo delega) y lo desplaza al centro de la vista. BUG §4.6, §4.7 | `forms` | `src/dom/bind-form.ts` · `src/dom/bind-group.ts` · `src/summary-markup.ts` (nuevo, sin DOM, para que lo use el servidor) · `src/dom/summary.ts` (nuevo) · `src/dom/wiring.ts` · `src/dom/delegation.ts` |
| [x] | 6 | — | **`bindMessage(slot, control)`.** Escribe `touched() ? message() : ''` en un marcador `error=` cuyo control cruza a un control-componente. Es la mitad «mensaje» de las `bind*`, sacada a `wiring.ts` para que las siete y esta usen la misma. BUG §3.2, §4.9 | `forms` | `src/dom/bind-message.ts` (nuevo) · `src/dom/wiring.ts` · `src/dom/index.ts` |
| [x] | 7 | — | **El traslado en `FudicControlElement`.** Recibe su campo del emit (tarea 11). **Siempre**: funde en el campo, con *element reflection*, lo escrito en el host (`aria-describedby` → `ariaDescribedByElements`, `aria-labelledby` → `ariaLabelledByElements`, `aria-label`). **Solo sin puente nativo** (`!('referenceTarget' in ShadowRoot.prototype) \|\| !shadowRoot.referenceTarget`): asocia `internals.labels` con `ariaLabelledByElements`. Funde con la descripción propia del campo y no añade nombre si ya tiene uno. Se recalcula al conectar, al hidratar y cuando cambian `id`, `aria-label`, `aria-labelledby` o `aria-describedby` del host. En radios, sobre el contenedor. Último recurso de copia de texto solo si *Antes de empezar* lo pidió. Se corrige el comentario de `element.ts:14-16`. BUG §4.8 | `forms` | `src/element.ts` · `src/relay.ts` (nuevo) |

---

## Fase 3 — el compilador (8–12)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [x] | 8 | — | **`summary=@nodo` es un binding.** Reservado como `error` (decisión 131): `SUMMARY_NAME`, `classifyAttribute` lo reconoce, y `FUD0596`–`FUD0599` valen para los dos con el nombre del atributo en el mensaje. `pairMarkers` recoge los dos, y con el `kind` que ya calcula: `error` con `kind` `form`/`group` es `FUD0600`, `summary` con `kind` `value` es `FUD0601`. Migrar lo que salió en *Antes de empezar*. Decisiones 131 y 132 en el índice de la gramática (con la 111, la 113 y la 130 anotadas como enmendadas, y la 111 con la nota de que `formassociated` es una propuesta de fudic), y los códigos `FUD0600`–`FUD0605` en el catálogo de SDD-34 §5 y de SDD-12. BUG §3.3, §3.4, §3.6, §4.2 | `compiler` | `src/binding/nodes.ts` · `src/binding/classify.ts` · `src/binding/markers.ts` · `src/semantic/analyzers/error-marker.ts` · `docs/gramar/gramatica-v1-decisiones.md` · `docs/sdd/SDD-34-forms-compilador.md` · `docs/sdd/SDD-12-semantica.md` |
| [x] | 9 | 8 | **`fields`.** Booleano reservado solo junto a `summary=`, que se quita del HTML. `FUD0602` si el elemento del resumen no admite una lista. Con `fields`: `tabindex="-1"` en el marcador, el mapa ruta → id de los campos enlazados en la plantilla (con `fud-c-…` a los que no traen id, y el host para un control-componente), y el `aria-describedby` de cada campo sin marcador propio hacia el id de su entrada, en el host si es un control-componente. BUG §3.3, §4.2, §4.7 | `compiler` | `src/binding/markers.ts` · `src/semantic/analyzers/error-marker.ts` · `src/emit/controls.ts` |
| [x] | 10 | 5, 9 | **El emit del resumen.** Servidor: el marcador con la lista que corresponde al estado, con la función de `summary-markup.ts` (tarea 5), no con una propia. Cliente: adopción del marcador **sin recorrer sus hijos**, y la llamada `bindForm`/`bindGroup` con el marcador, `fields` y el mapa. `aria-live="polite"` también en el resumen de un grupo, sin pisar uno del autor. Servidor = cliente, byte a byte. BUG §4.2, §4.6 | `compiler` | `src/emit/controls.ts` · `src/emit/markup.ts` · `src/emit/markup-client.ts` |
| [x] | 11 | 8 | **El puente y el campo del control-componente** (decisión 132). En un template `formassociated`: el campo es el elemento con `control=` (o el contenedor de sus radios, `FUD0603` si no es `<fieldset>` ni `role="radiogroup"`); su id es el estático del autor o uno derivado (`FUD0604` si es dinámico). El servidor escribe `shadowrootreferencetarget="<id>"` en el `<template>`, el cliente pasa `referenceTarget` a `attachShadow` (vía `shadowInit`, con el tipo ampliado mientras el `lib` de TypeScript no lo traiga), y el emit entrega el campo a `FudicControlElement`. Un `shadowrootreferencetarget` escrito a mano se respeta y se valida (`FUD0605`). BUG §3.4, §4.8 | `compiler` · `forms` | `src/emit/markup.ts` · `src/emit/markup-client.ts` · `src/emit/controls.ts` · `src/semantic/analyzers/form-associated-placement.ts` · `forms/src/element.ts` |
| [x] | 12 | 8 | **Un mensaje fuera del control-componente.** `pairMarkers` empareja un `error=` con el host de un componente `formassociated` al que cruza el nodo en el mismo bloque, y `FUD0597` se estrecha a los componentes que no lo son. El emit escribe `aria-describedby="<id del marcador>"` en el host y la llamada `bindMessage(marcador, nodo)`. BUG §3.6, §4.9 | `compiler` | `src/binding/markers.ts` · `src/semantic/analyzers/error-marker.ts` · `src/emit/controls.ts` · `src/emit/markup.ts` · `src/emit/markup-client.ts` |

---

## Fase 4 — la mitad de editor (13–17)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [x] | 13 | 8 | **La proyección.** El valor de `summary` se proyecta como el de `error` (tipos, rename, rutas). El tipo sigue siendo «un nodo» para los dos: qué clase de nodo lo dice el compilador, una sola vez. `fields` no se proyecta como atributo HTML desconocido. BUG §3.5 | `language-core` | `src/template/attrs.ts` · `src/globals.ts` |
| [x] | 14 | 8, 9 | **Oferta del atributo.** `controlOfferAt` se generaliza a los tres atributos: `error` y `summary` en los mismos `controlSites` que `control`, en tag nativo y de componente, salvo donde el elemento ya lleve ese atributo, y nunca en un layout. `fields` solo junto a `summary=`. Las dos voces que contestan una gap (la del plugin y la de dentro de TypeScript) preguntan a la **misma** función. BUG §4.1 | `language-server` | `src/services/forms.ts` · `src/services/plugin.ts` · `src/services/ts-completion.ts` |
| [x] | 15 | 8 | **Completado del valor.** `controlValueAt` / `controlValueOpeningAt` / `namesControl` / `CONTROL_OPENED` pasan de «el nombre `control`» a «uno de los tres, y cuál», en las tres formas de la posición. `error=`: la regla de `control=` en un campo (`reaches` / `accepts`), sin miembros `$`. `summary=`: los nodos que enlazan con `control=` los **ancestros** `<form>` y de grupo, del más cercano al más lejano, sin miembros. Una expresión libre sigue viendo la API `$`. BUG §4.1 | `language-server` | `src/services/position.ts` · `src/services/forms.ts` · `src/services/plugin.ts` · `src/services/ts-completion.ts` |
| [x] | 16 | 8, 9 | **Hover.** `controlNameAt` se generaliza. Textos de `error`, `summary` y `fields`. BUG §4.1 | `language-server` | `src/services/position.ts` · `src/services/plugin.ts` |
| [x] | 17 | 11 | **El `<template>` raíz.** Oferta de `shadowrootmode`, `shadowrootdelegatesfocus`, `shadowrootreferencetarget`, `shadowrootclonable`, `shadowrootserializable` y `formassociated`, con hover (el de `formassociated` dice que es un marcador de fudic, qué decide y que el compilador escribe el puente). En `shadowrootreferencetarget="\|"`, los ids estáticos de la plantilla. `FUD0604`/`FUD0605` salen en el editor por el reenvío de siempre. BUG §4.11 | `language-server` | `src/services/plugin.ts` · `src/services/position.ts` · `src/services/template-attrs.ts` (nuevo) |

---

## Fase 5 — el ejemplo, la documentación y el navegador (18–20)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [x] | 18 | 2, 4–7, 10–12 | **El ejemplo de §0, tal cual.** `user.form.ts` con `email`, `web`, el grupo `acceso`, la regla `summary` de dos mensajes y `validity`. `app-input.fud` **recortado** a solo el input (sin `id` como prop, sin `id=@id`, con `id="campo"` fijo y sin marcador interno). Nuevos: `app-error.fud`, `app-label.fud` y `app-field.fud`. `app-form.fud` con el resumen `fields`, el del grupo, los cuatro patrones (*Nombre*, *Alias*, *Email*, *Web*), el `*` en `aria-hidden` y el botón `disabled=@(!userForm.$valid())`. El texto de `formularios.fud` explica el resumen, `fields`, la validez y los cuatro patrones. Revisar que ningún otro uso de `app-input` (p. ej. `app-wide-form`) dependa del marcador interno que desaparece. Criterio 32 | `example-basic` | `src/forms/user.form.ts` · `src/components/app-form.fud` · `src/components/app-input.fud` · `src/components/app-error.fud` (nuevo) · `src/components/app-label.fud` (nuevo) · `src/components/app-field.fud` (nuevo) · `src/routes/formularios.fud` |
| [x] | 19 | 18 | **README de `@fudic/forms`.** Todo lo de §3: `summary=` y `fields`, `valid()` / `$valid()`, `Validity`, `GroupOptions`, `$messages()` / `$issues()` / `$submitted()`. Los cuatro patrones de un campo, por qué `app-label` proyecta el `<label>` (y la variante con `aria-labelledby`, que pierde el clic), el puente y su respaldo, y el `*` en `aria-hidden`. El ejemplo de §0 recortado y los avisos de §4.5 y §7. Deja de presentar `error=@f` como resumen. Anotar que `formassociated` es una propuesta de fudic. Criterio 33 | `forms` | `packages/forms/README.md` |
| [ ] | 20 | 13–19 | **Probado donde se ve (Pedro).** Antes, **reconstruir y reinstalar la extensión** desde esta rama: la revisión que originó este BUG se hizo con una del 2026-09-19 y dos de sus avisos eran eso. Los catorce pasos de §0.6 en `/formularios`, en dev y en `vite preview`, en Chrome **y** en Safari o Firefox (sin puente nativo); la tabla de §0.5 escribiendo en el editor; y **Lighthouse** sin avisos de formulario. Criterio 41 | — | — |

---

## Fase 6 — los tests (21–25)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [x] | 21 | 1–4 | **Modelo.** Criterios 1–11. Los *rojo primero* (1, 5, 10) se ven fallar revirtiendo las tareas 1, 2 y 4. | `forms` | `test/validity.test.ts` (nuevo) · `test/summary.test.ts` (nuevo) · `test/form.test.ts` |
| [x] | 22 | 5–7 | **Enlaces del DOM.** Criterios 12–16, en happy-dom, con dobles para el puente, `internals.labels` y *element reflection*: la prueba real es §6.G. El 13 se ve fallar revirtiendo el foco al resumen. | `forms` | `test/dom/summary.test.ts` (nuevo) · `test/dom/bind-message.test.ts` (nuevo) · `test/dom/relay.test.ts` (nuevo) |
| [x] | 23 | 8–12 | **Compilador.** Criterios 17–23. Los *rojo primero* (19, 21, 22) se ven fallar revirtiendo las comprobaciones de las tareas 8, 9, 11 y 12. Los goldens que cambien se regeneran revisándolos, no a ciegas. | `compiler` | `test/binding/classify.test.ts` · `test/semantic/control.test.ts` · `test/emit/control.test.ts` · `test/emit/hydrate/control-a11y.test.ts` · `test/emit/reference-target.test.ts` (nuevo) |
| [x] | 24 | 13–17 | **Editor.** Criterios 24–31. El 26 es la captura de la revisión: `error=@userForm.` sin ningún `$`, en las tres formas. El 31 es **una tabla de paridad**: `control`, `error` y `summary` × oferta, valor, hover y tipos. | `language-core` · `language-server` | `language-core/test/sdd34-control-projection.test.ts` · `language-server/test/services/marker-parity.test.ts` (nuevo) · `language-server/test/services/template-attrs.test.ts` (nuevo) |
| [x] | 25 | 18, 20 | **E2E.** `@axe-core/playwright` como dependencia de desarrollo de `@fudic/example-basic`, versión exacta. Criterios 34–36 con `getByRole` y `toHaveAccessibleDescription` (árbol de accesibilidad, no atributos). Criterio 37: la misma batería con una `addInitScript` que borra `referenceTarget` de `ShadowRoot.prototype`. Criterio 38 con una fixture de test para la variante de `app-label` con `aria-labelledby`. Criterio 39 con axe en los tres estados y en las dos pasadas. Criterio 40 con un test por paso de §0.6. Los *rojo primero* (34, 35, 39) se ven fallar sobre el `/formularios` de antes de las tareas 7 y 11. **Adaptar los tests de `forms.spec.ts` que dependen de lo que cambia:** `aliasError` busca `app-input .error` (el mensaje pasa a `app-error`), `alias` localiza «el» `app-input` (ahora hay dos, más `app-field`: se localizan por el id del host), y los de foco, hidratación y `bindByType` que nombran `app-input` se revisan uno a uno, no se borran. | `example-basic` | `tests/forms.spec.ts` · `tests/forms-a11y.spec.ts` (nuevo) · `package.json` |

---

## Fase 7 — cobertura y cierre (26–27)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [x] | 26 | 21–25 | **Cobertura.** `forms`, `language-core` y `language-server` en 100 / 100 / 100 / 100 sin `ignore`; los ficheros nuevos (`validity.ts`, `summary-markup.ts`, `relay.ts`, `dom/summary.ts`, `dom/bind-message.ts`, `template-attrs.ts`) nacen al 100 %. `compiler` no baja del suelo anotado en *Antes de empezar*. Criterio 42 | — | — |
| [ ] | 27 | 26 | **Cierre.** `pnpm typecheck`, `pnpm test`, `pnpm build` y el e2e completo de `examples/basic` (los tres proyectos, sin un `vite preview` vivo en el 4173). BUG-42 a `Hecho` en [INDEX.md](./INDEX.md) (tabla y registro) y en el registro de [docs/sdd/INDEX.md](../INDEX.md). Anotar que BUG-42 corrige SDD-34 §3.3, §4.4, §4.5 y §4.9, SDD-33 §3 y §4.5, y BUG-41 §3.1, §3.3, §3.4, §4.3 y su criterio 19. | — | [INDEX.md](./INDEX.md) · [../INDEX.md](../INDEX.md) · `BUG-41-el-error-que-no-se-va.md` · `SDD-33-formularios-reactivos.md` · `SDD-34-forms-compilador.md` |

---

## Notas

- **Suelo de cobertura al abrir** (sentencias / ramas / funciones / líneas), medido el 2026-09-25:
  `forms`, `language-core` y `language-server` en 100 / 100 / 100 / 100; `compiler` en
  99,36 / 98,51 / 99,54 / 99,77.
- **`error=@<form o grupo>` a migrar** (tarea 8): `compiler/test/emit/control.test.ts` (3),
  `compiler/test/semantic/control.test.ts` (2), `compiler/test/emit/hydrate/control-a11y.test.ts`
  (1) y `packages/forms/README.md` (1). Ningún ejemplo lo usa.
- **Lighthouse y axe antes del cambio:** Lighthouse no se puede pasar desde la sesión de Claude
  Code; lo pasa Pedro en la tarea 20. axe no está instalado todavía: su «antes» es el *rojo
  primero* de los criterios 34, 35 y 39 (tarea 25), sobre el `/formularios` de antes de las
  tareas 7 y 11.
- **Soporte del puente y de *element reflection*** (2026-09-25). El e2e usa el Chrome del sistema
  (`channel: 'chrome'`, no hay navegadores de Playwright instalados): Chrome 153 trae
  `ShadowRoot.prototype.referenceTarget`, `shadowrootreferencetarget` en DSD,
  `ariaLabelledByElements`, `ariaDescribedByElements` y `ElementInternals.labels`. La pasada
  normal del e2e prueba el camino nativo y la de `addInitScript` el respaldo. Safari (17.4+) y
  Firefox (136+) traen *element reflection* y no el puente: el último recurso de copiar texto
  **no** hace falta.
- **Tests del modelo adelantados** (tarea 21): `forms` tiene umbral 100 y cada fase se cierra con
  cobertura, así que `validity.test.ts` y `summary.test.ts` entran con la fase 1.
- **Tests del DOM adelantados** (tarea 22), por la misma razón. El campo de un control-componente
  llega como `static field = '<id>'` en la subclase (lo escribe el emit en la tarea 11): de él
  salen el `referenceTarget` del `attachShadow` y el elemento al que traslada `relay.ts`. El id
  de la entrada de un campo en el resumen es `<id del resumen>-<ruta con guiones>` (`issueId`),
  y el compilador deriva el mismo.
- **Fase 3, cómo quedó.** `summary` es un `ErrorBinding` con `name: 'summary'` (un solo tipo de
  binding, un solo emparejamiento). El puente lo calcula `bridgeOf` (binding), que usan el emit,
  la pasada semántica y `bridgeIds(graph)`: el PADRE abre la raíz de sombra del hijo en el
  servidor, así que `Dom.attachShadow` gana un tercer argumento (`referenceTarget`) en `dom` y
  `ssr`. El servidor construye la lista con `summaryEntriesOf` de `@fudic/forms` (import que el
  módulo añade solo si pinta un resumen); el cliente la repinta con `summaryOf`, y las dos salen
  de `summaryEntries`. El build no corre la pasada semántica (solo `contractDiagnostics`), así
  que `FUD0597`–`FUD0605` salen en el editor, como los `FUD0596`–`FUD0599` de BUG-41. Tests del
  compilador adelantados (tarea 23) para no bajar del suelo: queda en 99,37 / 98,53 / 99,55 / 99,77.
- **Fase 4, cómo quedó.** `controlValueAt` devuelve `{ element, attr }` con `attr` uno de
  `control`/`error`/`summary`, y `controlNameAt` también reconoce `fields` junto a un `summary=`.
  Las dos voces de una gap preguntan a `formAttributeOffers` (forms.ts). El valor de `error=` usa
  la regla de un campo (`wants = 'control'`); el de `summary=` sale de `summaryNodesOf`, del
  markup y no del checker. La proyección escribe un hueco `$errorOf( )` para un `error=`/`summary=`
  aún vacío, también en un tag de componente (un marcador nunca es prop). Tests del editor
  adelantados (tarea 24). El snapshot de `fudic new` cambia solo por el comentario de `globals`.
- **Fase 5, lo que destapó el ejemplo.** Dos cosas que los tests de las fases 1–4 no veían:
  (1) un marcador que es **host de componente** (`<app-error error=@…>`) salía sin `id`, porque
  el emit solo añadía los atributos de marcador a un tag nativo; el `aria-describedby` del
  `app-input` apuntaba a nada. Corregido en los dos emits, con su test. (2) El runtime publicado
  de `forms` no se construía (`computed` faltaba en el shim de `@fudic/core`) y
  `examples/pieces-bench/check.mjs` fallaba con los módulos nuevos: `validity`, `validate-on`
  y `verdicts` viajan en la pieza `internals`; las dos marcas (`server-flag`, `async-flag`) en
  la pieza `flags`, que sustituye a `server-flag`; el resumen en la pieza `summary`;
  `asyncValidator` en `validators`, y `bindMessage` dentro de `wiring` (siempre va con un
  `bindForm`, y sola no pagaba su frontera).
- **Lo que destapó el navegador en la tarea 25.** (1) `disabled=@(!userForm.$valid())` no se
  movía: un form importado es un objeto, no una fuente, y `$subIf(userForm, $u)` no suscribía
  nada. Una escritura que lee un **miembro** de un nombre importado se suscribe ahora como
  expresión entera (`$sub(() => (…), $u)`), cuya primera pasada solo lee. (2) Las reglas propias de
  un form o grupo solo se publicaban al enviar, y §0.6 pasos 3–4 las quieren al escribir: la
  adopción pasa a cada nodo un `above` que vuelve a correr las reglas propias de los forms de
  encima, y un control que valida solo lo llama. (3) axe y Lighthouse no ven el puente: enmienda de
  los criterios 39 y 41 en el BUG. (4) El respaldo del criterio 37 quita también el atributo del
  HTML. (5) `getByRole` y `toHaveAccessibleDescription` calculan el nombre por su cuenta y no
  siguen la *element reflection*: nombres y descripciones se miden en el árbol de Chrome por CDP.
- **Revisión de Pedro con la extensión instalada (2026-09-27).** (1) El puente lo escribe el
  autor: el compilador ya no deriva el campo, solo transporta el `shadowrootreferencetarget` que
  encuentra, y `FUD0603`/`FUD0604` quedan retirados (enmienda de §3.4 y de la decisión 132).
  `app-input` y `app-field` lo escriben a mano. (2) El marco de un componente —su etiqueta y su
  `<template>` raíz— deja de ofrecer `control`, `error`, `summary` y `class:`, y en el `<template>`
  raíz calla la lista de HTML. Queda fuera, y se anota: un componente **sin** `formassociated`
  que escriba `shadowrootreferencetarget` no lo ve respetado (el puente solo viaja en un
  control-componente).
- **Paso 8 de §0.6 en el e2e.** El ejemplo usa `Interacted`; el test construye en el navegador un
  form con `Validity.Rules` desde las mismas piezas publicadas que usa la página.
- **Rojo primero de 34, 35 y 37**, visto con el traslado desactivado: cae el 35 con puente y el 34
  y el 35 sin él. El de axe (39) no puede caer por el traslado, porque axe no lo ve.
- **«Lo ha cambiado» es una marca que no vuelve atrás** (`edited`), no `dirty`: sin ella el
  criterio 2 no se cumple (BUG §4.3).
- **Reglas asíncronas y validez** (decisión de Pedro, 2026-09-25): una regla solo se sabe
  asíncrona al llamarla, y `valid()` no puede lanzar red. Se marca al declararla con
  `asyncValidator` (BUG §3.1, §4.3).
- **Por qué la validez no se deriva de `errors`.** `errors` es lo que se **enseña** y solo cambia
  en los momentos de `validateOn` y en el submit. Derivar `$valid()` de ahí daría «válido» al
  abrir un formulario con `required` vacíos, que es exactamente lo que el botón deshabilitado
  tiene que evitar (BUG §2.3). Por eso la tarea 1 evalúa las reglas síncronas en vivo.
- **Por qué la lista del resumen la escribe una sola función.** El servidor la pinta y el cliente
  la actualiza. Si fueran dos funciones, el primer mensaje con un carácter escapado distinto
  rompería la igualdad byte a byte (tareas 5 y 10).
- **Por qué el traslado corre aunque haya puente nativo.** El puente reenvía lo que **apunta al**
  host; lo que está escrito **en** el host (`aria-describedby` del marcador de fuera,
  `aria-labelledby`) no lo reenvía nadie (BUG §2.8). Solo la asociación de los labels se salta
  cuando el puente existe.
- **Por qué `app-label` proyecta el `<label>`.** Un `<label>` dentro de un shadow root no puede
  apuntar fuera, y no hay puente de salida en ningún estándar (BUG §2.10, §4.10).
- **Por qué no hay bombilla para marcadores.** Un marcador es opcional por diseño (decisión 130).
  Una bombilla lo propondría como si faltara algo (BUG §4.1).
- **Cobertura al cerrar** (2026-09-27): `forms`, `language-core` y `language-server` en
  100 / 100 / 100 / 100; `compiler` en 99,38 / 98,53 / 99,55 / 99,78, por encima de su suelo.
- **Cierre, lo hecho y lo pendiente.** `pnpm typecheck`, `pnpm test`, `pnpm build` y el e2e completo
  (212 / 212, los tres proyectos) en verde; SDD-33, SDD-34 y BUG-41 anotados. Queda para después de
  la tarea 20 (Pedro): pasar BUG-42 a `Hecho` en los dos `INDEX.md`, tabla y registro.
