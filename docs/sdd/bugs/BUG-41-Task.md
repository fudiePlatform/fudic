# BUG-41 — Tareas

> **BUG:** [BUG-41 — Un error de formulario que no se va al corregirlo, y un hueco que el autor no puede colocar](./BUG-41-el-error-que-no-se-va.md)
> **Paquetes:** `@fudic/forms` · `@fudic/compiler` · `@fudic/language-core` · `@fudic/example-basic`
> **Rama:** `bug-41-validacion-y-hueco-de-error` (worktree `.claude/worktrees/bug-41-validacion-y-hueco-de-error`, desde `main`)
> **Progreso:** 17 / 17

El orden es el de un defecto que se ve en el navegador: **primero la corrección**, luego
Pedro la prueba en `/formularios`, y después los tests contra el código ya arreglado, vistos
fallar revirtiendo la línea.

La fase 1 arregla el atasco sin tocar el compilador, y se puede probar sola. Las fases 2 y 3
cambian el marcado y regeneran goldens, y van juntas porque el emit y el ejemplo no pueden
quedar a medias.

---

## Mapa de dependencias

```
1 validate/message ──→ 2 wiring ──→ 3 bindForm ──┐
                                                 ├──→ 7 ejemplo ──→ 8 navegador ──→ 9…12 tests ──→ 13 cobertura ──→ 14 cierre
4 marcador (classify) ──→ 5 emit ──→ 6 LSP ──────┘

8 navegador ──→ 15 validateOn · 16 novalidate · 17 foco ──→ 14 cierre
```

La fase 6 no estaba en el plan: salió de la tarea 8 (BUG §2.7). Se implementó antes del
cierre, y la spec y este Task se redactaron después, con el visto bueno de Pedro.

---

## Fase 1 — el modelo y las bindings (1–3)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [x] | 1 | — | **`validate()`, `message()` y `messages`.** `ControlOptions` como tercer argumento de `control()` y de `typed()` (los doce tipados lo pasan). El form, al clonar, deja a cada nodo su raíz (la del form más externo, también a través de grupos). `validate()` usa el `validateSubtree` del control con esa raíz, y fuera de un form da `TypeError`. `message()` tracked: control → `setMessages` → código. `FormOptions.messages` + `$message()`. §3.1, §4.4 | `forms` | `src/control.ts` · `src/form.ts` · `src/internals.ts` · `src/messages.ts` · `src/types.ts` · `src/typed/*.ts` |
| [x] | 2 | 1 | **Tarde para acusar, pronto para perdonar.** Todo en `wiring.ts`, sin que las siete bindings repitan lógica: `blur` → `touch()` + `validate()`; `input`/`change` → `validate()` solo si el error está visible. `bindErrors` escribe `message()` y acepta `ErrorSlot` `null`. §4.1 | `forms` | `src/dom/wiring.ts` · `src/dom/types.ts` · `src/dom/bind-*.ts` |
| [x] | 3 | 1 | **El submit.** `onSelf` en captura. `$validate()` antes de decidir, siempre: la validación publica en el acto lo que se resuelve en síncrono (los hijos arrancan en orden, sin esperarse), y la decisión lee ese estado. §4.2 | `forms` | `src/dom/bind-form.ts` · `src/dom/wiring.ts` · `src/form.ts` · `src/control.ts` |

---

## Fase 2 — el marcador (4–6)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [x] | 4 | — | **`error=@nodo` es un binding.** Reservado como `control` (decisión 130): `classifyAttribute` lo reconoce y `FUD0596` si no es una sola expresión `@`. Semántica: `FUD0597` (nodo sin `control=` en esta plantilla), `FUD0598` (duplicado o en bucle), `FUD0599` (con contenido). Decisión 130 al índice de la gramática y los cuatro códigos al catálogo de SDD-34 §5 y SDD-12. §3.3, §3.4 | `compiler` | `src/binding/classify.ts` · `src/binding/nodes.ts` · `src/semantic/analyzers/` · `docs/gramar/gramatica-v1-decisiones.md` |
| [x] | 5 | 4 | **El emit deja de fabricar el hueco.** `planControls` empareja cada control con su marcador (o ninguno): quita `writesSlot`, pone `id` si falta, `aria-describedby` en el elemento o en todos los radios y `aria-live` en el marcador de un form. Servidor: texto con `message()`/`$message()`. Cliente: adopción normal, y la llamada `bind*` va en el último de {control, marcador} en orden de documento. Fuera `data-fud-err`/`data-fud-sum` y el cursor del hueco. §4.3 | `compiler` | `src/emit/controls.ts` · `src/emit/markup.ts` · `src/emit/markup-client.ts` · `src/emit/module.ts` |
| [x] | 6 | 4 | **El editor ve el marcador.** El valor de `error` se proyecta como el de `control`: tipos, hover, rename y completado de rutas. Criterio 19 | `language-core` | `src/template/attrs.ts` |

---

## Fase 3 — el ejemplo y el navegador (7–8)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [x] | 7 | 3, 5 | **El ejemplo usa el marcador.** `app-form`: mensaje de *Nombre* bajo su campo, en su propia caja de la rejilla (sin resumen: `userForm` no declara regla de formulario, y un marcador que nunca habla no enseña nada). `app-input`: el suyo dentro del shadow. `app-wide-form`: los dos campos con reglas; los otros diez no tienen nada que decir. Fuera el CSS `[data-fud-err]:empty`. `user.form.ts` con `messages` por control. El texto de `formularios.fud`, que hoy habla del «hueco ya puesto», se actualiza. | `example-basic` | `src/components/app-form.fud` · `app-input.fud` · `app-wide-form.fud` · `src/forms/user.form.ts` · `src/routes/formularios.fud` |
| [x] | 8 | 7 | **Probado donde se ve (Pedro).** Los pasos de §1 en `/formularios`: el error se va al corregir, el segundo submit pasa, el primer submit inválido se para, cada campo dice su texto, en dev y en `vite preview`. Criterio 20 | — | — |

---

## Fase 4 — los tests (9–12)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [x] | 9 | 1 | **Modelo.** Criterios 1–4 | `forms` | `test/control-validate.test.ts` |
| [x] | 10 | 2, 3 | **(visto fallar revirtiendo 2 y 3: caen 20 de 28)** **Bindings y submit.** Criterios 5–12. El 8 es una tabla sobre las siete bindings. | `forms` | `test/dom/revalidate.test.ts` |
| [x] | 11 | 5 | **Compilador.** Criterios 13–18, adelantados a la fase 2 (ficheros nuevos al 100 %). | `compiler` | `test/emit/control.test.ts` · `test/emit/hydrate/control-a11y.test.ts` · `test/semantic/control.test.ts` · `test/binding/classify.test.ts` |
| [x] | 12 | 6, 7 | **Editor y e2e.** Criterio 19 (adelantado a la fase 2). `forms.spec.ts` gana el caso del §1 y los tres del alias que ya caían antes del BUG vuelven a verde, con los hallazgos de §2.6 del BUG: `control=` en vez de `.ctrl=`, `FUD0197` que cuenta `control=`, el `id` en el host, `open()` que espera al dueño y el presupuesto que sigue el runtime publicado. | `language-core` · `example-basic` · `compiler` | `examples/basic/tests/forms.spec.ts` · `examples/basic/src/components/app-form.fud` · `compiler/src/semantic/analyzers/component-props.ts` |

---

## Fase 5 — cobertura y cierre (13–14)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [x] | 13 | 9–12 | **Cobertura.** `@fudic/forms` en 100 / 100 / 100 / 100 sin `ignore`. `compiler` y `language-core` no bajan del suelo medido al abrir la rama (anotarlo aquí antes de la tarea 4). Criterio 21 | — | — |
| [x] | 14 | 13, 15–17 | **Cierre.** `pnpm typecheck`, `pnpm test`, `pnpm build`. BUG-41 a `Hecho` en [INDEX.md](./INDEX.md) (tabla y registro) y en el registro de [docs/sdd/INDEX.md](../INDEX.md). SDD-34 §4.2–§4.4 y §7 anotan que BUG-41 las corrige. README de `@fudic/forms` con el marcador y `messages`. | — | [INDEX.md](./INDEX.md) · [../INDEX.md](../INDEX.md) · `packages/forms/README.md` |

---

## Fase 6 — lo que destapó la prueba en el navegador (15–17)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [x] | 15 | 8 | **`validateOn`.** Flags `Blur` · `Input` · `Submit` (el cero) en `ControlOptions` y `FormOptions`; se resuelven control → form más cercano → `Blur \| Input`, y viajan con `adopt`. `follow` lee la política: `Input` valida cada escritura con el campo tocado (antes, solo con el error visible). README de forms. Criterios 22, 23 y 26. BUG §4.1, §4.5 | `forms` · `example-basic` | `src/validate-on.ts` · `src/control.ts` · `src/form.ts` · `src/internals.ts` · `src/types.ts` · `src/dom/wiring.ts` · `test/control-validate.test.ts` · `test/dom/revalidate.test.ts` · `tests/forms.spec.ts` |
| [x] | 16 | 8 | **El navegador fuera del submit.** `novalidate` en todo `<form control>`, en las dos ramas, sin duplicar el del autor; `setValidity` con el texto de `message()`. Criterios 24 y 25. BUG §4.6 | `compiler` · `forms` | `src/emit/controls.ts` · `markup.ts` · `markup-client.ts` · `forms/src/element.ts` |
| [x] | 17 | 8 | **El foco entra en un control-componente.** `bindForm` recorre `form.elements` y toma el primero con `aria-invalid` o `validity` inválida; `FudicControlElement` expone `validity`. De paso, `/* @vite-ignore */` en el `import()` del cargador de `@fudic/di`. Criterio 25. BUG §4.7 | `forms` · `di` | `src/dom/bind-form.ts` · `src/element.ts` · `di/src/page.ts` |

---

## Relevo (2026-09-23) — para la sesión que cierra

**Estado:** cerrado. El relevo se recogió, la tarea 8 destapó la fase 6 y todo se cerró en
esta misma rama. Lo de abajo se deja tal como se escribió para el relevo.

**Estado en el relevo:** fases 1–4 commiteadas; quedaban la tarea 8 (Pedro prueba
`/formularios` en el navegador), la 13 (cobertura) y la 14 (cierre).

**Lo último verificado, antes del commit de la fase 4:**
- `@fudic/forms`, 100 en las cuatro métricas. `@fudic/compiler` sobre su suelo; `language-core`,
  100.
- `pnpm test` de transport en verde.
- El e2e de `examples/basic` completo, los tres proyectos, en verde salvo lo que se arregló
  después y se verificó por spec. Ya no se ha repetido entero.

**Pedro pidió que TODO el e2e quede verde, sea o no de este BUG**, y eso metió en la fase 4
arreglos fuera de forms. Van en §2.6 del BUG y hay que anotarlos al cerrar:
- `transport/router.ts`: el precalentado deposita el runtime publicado (`/_fudic/`) en su caché
  y lee sus imports estáticos de los propios bytes, de forma transitiva (SDD-45 §4.3). Test
  nuevo en `router.test.ts`.
- `transport/runtime-cache.ts`: la marca `/_fudic/marker/<app>` va sellada con `x-fudic-stored`.
- Specs que se habían quedado atrás tras SDD-45: `fudic-main.js` pasó a llevar hash
  (`runtimeEntry()` en `traffic.ts`), el canal del precalentado vive en el boot, hay
  `modulepreload` del runtime en el camino crítico, y el slug `routing-por-fichero` pasó a ser
  `file-system-routing`.
- `delegacion.spec.ts`: espera a que el formulario esté hidratado antes de poner el contador a
  cero.

**Para cerrar:**
1. `pnpm build` y después `pnpm --filter @fudic/example-basic exec vite build --config
   nosw/vite.config.ts`.
2. `pnpm --filter @fudic/example-basic exec playwright test`, todo verde. Antes, comprobar que
   nadie tiene un `vite preview` levantado en el 4173: Playwright reutiliza el servidor.
3. `pnpm test`, `pnpm typecheck` y `coverage` de forms, compiler, language-core y transport.
   Transport y vite tienen deuda: comparar con el suelo, no con el 100.
4. Tarea 14. Queda un aviso `FUD0721` en `app-card.fud` (`app-badge` sin usar) que ya estaba
   antes; no rompe nada.

## Notas

- **Suelo de cobertura al abrir la rama** (líneas / ramas / funciones / sentencias):
  `@fudic/forms` 100 / 100 / 100 / 100 · `@fudic/compiler` 99,77 / 98,49 / 99,54 / 99,35 ·
  `@fudic/language-core` 100 / 100 / 100 / 100.
- **Tras la fase 2:** `compiler` 99,77 / 98,51 / 99,54 / 99,36 y `language-core` 100 en las
  cuatro. Los dos ficheros nuevos del compilador (`binding/markers.ts`,
  `semantic/analyzers/error-marker.ts`) nacen al 100 %, y por eso sus tests —criterio 18— y los
  del editor —criterio 19— se adelantaron a esta fase. Los once tests del compilador que fijaban
  el span fabricado se reescribieron contra el marcador (criterios 13–17).
- **Tarea 13, medida al cerrar** (líneas / ramas / funciones / sentencias): `@fudic/forms` 100 en
  las cuatro · `@fudic/compiler` 99,77 / 98,51 / 99,54 / 99,36 · `@fudic/language-core` 100 en
  las cuatro · `@fudic/transport` 96,53 / 91,05 / 94,73 / 96,34, sobre su suelo en `main`
  (96,38 / 90,59 / 94,65 / 96,17). El e2e de `examples/basic` completo, los tres proyectos:
  185 / 185. `pnpm test` destapó dos tests de `@fudic/vite` en rojo: un comentario de
  `router.ts` escribía un import literal a `/_fudic/…`, y ese comentario viaja dentro del
  bundle del Service Worker, que no puede contener ninguno. Se reescribió el comentario.
- **Al cerrar, tras la fase 6:** `@fudic/forms` 100 en las cuatro (228 tests), `@fudic/di` 100,
  `@fudic/compiler` 99,77 / 98,51 / 99,54 / 99,36, `language-core` 100, `transport` sobre su
  suelo. E2E de `examples/basic` completo: 187 / 187. Los dos e2e nuevos (criterios 25 y 26) se
  vieron fallar contra el build anterior a la fase 6.
- **Un marcador se empareja dentro de su bloque**, no de la plantilla entera. La spec lo decía de
  la plantilla; lo impone el cliente, donde cada bloque es un recorrido con sus variables. `FUD0597`
  lo cuenta así, y un `id` con `@` es `FUD0599`. Los dos anotados en §3.4 del BUG.
- **Tras la fase 1, `@fudic/forms` está en 99,35 / 97,54 / 99,43 / 99,21** (líneas, ramas,
  funciones, sentencias). Faltan cuatro huecos, todos de código nuevo y todos criterios de
  la fase 4: el `TypeError` de un control sin formulario (1), `$message` (4), una validación
  asíncrona adelantada por otra (2) y la revalidación al escribir con el error visible (5).
  La suite existente sigue verde. Solo se tocaron los tests que fijaban el comportamiento
  viejo: el primer submit con un `required` vacío pasaba (ahora es el caso asíncrono), y
  seis bindings se hacían sobre controles sin formulario, que la emisión nunca produce
  (`inForm` en `_dom.ts`).
- **`106` está libre** en el índice de decisiones, pero se usa la `130` para que la enmienda
  a la 113 quede después de ella y no en un hueco anterior.
- **El golden del emit cambia a propósito**: sin marcador ya no hay span. Un golden que
  siga verde sin tocarlo después de la tarea 5 es señal de que el emit no cambió.
