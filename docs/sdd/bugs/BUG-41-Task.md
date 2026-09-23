# BUG-41 — Tareas

> **BUG:** [BUG-41 — Un error de formulario que no se va al corregirlo, y un hueco que el autor no puede colocar](./BUG-41-el-error-que-no-se-va.md)
> **Paquetes:** `@fudic/forms` · `@fudic/compiler` · `@fudic/language-core` · `@fudic/example-basic`
> **Rama:** `bug-41-validacion-y-hueco-de-error` (worktree `.claude/worktrees/bug-41-validacion-y-hueco-de-error`, desde `main`)
> **Progreso:** 7 / 14

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
```

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
| [ ] | 8 | 7 | **Probado donde se ve (Pedro).** Los pasos de §1 en `/formularios`: el error se va al corregir, el segundo submit pasa, el primer submit inválido se para, cada campo dice su texto, en dev y en `vite preview`. Criterio 20 | — | — |

---

## Fase 4 — los tests (9–12)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [ ] | 9 | 1 | **Modelo.** Criterios 1–4 | `forms` | `test/control.test.ts` · `test/validate.test.ts` · `test/messages.test.ts` |
| [ ] | 10 | 2, 3 | **(visto fallar revirtiendo 2 y 3)** **Bindings y submit.** Criterios 5–12. El 8 es una tabla sobre las siete bindings. | `forms` | `test/dom/errors.test.ts` · `test/dom/bind-form.test.ts` · `test/dom/bind.test.ts` |
| [ ] | 11 | 5 | **Compilador.** Criterios 13–18. Goldens regenerados y **revisados**: se van el span y el `aria-describedby` sin marcador, y nada más. | `compiler` | `test/emit/control.test.ts` · `test/emit/hydrate/control-a11y.test.ts` · `test/semantic/control.test.ts` · `test/binding/classify.test.ts` |
| [ ] | 12 | 6, 7 | **Editor y e2e.** Criterio 19. `forms.spec.ts` se reescribe contra el marcador y gana el caso del §1 (corregir → mensaje fuera → submit pasa). | `language-core` · `example-basic` | `language-core/test/sdd34-control-projection.test.ts` · `examples/basic/tests/forms.spec.ts` |

---

## Fase 5 — cobertura y cierre (13–14)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [ ] | 13 | 9–12 | **Cobertura.** `@fudic/forms` en 100 / 100 / 100 / 100 sin `ignore`. `compiler` y `language-core` no bajan del suelo medido al abrir la rama (anotarlo aquí antes de la tarea 4). Criterio 21 | — | — |
| [ ] | 14 | 13 | **Cierre.** `pnpm typecheck`, `pnpm test`, `pnpm build`. BUG-41 a `Hecho` en [INDEX.md](./INDEX.md) (tabla y registro) y en el registro de [docs/sdd/INDEX.md](../INDEX.md). SDD-34 §4.2–§4.4 y §7 anotan que BUG-41 las corrige. README de `@fudic/forms` con el marcador y `messages`. | — | [INDEX.md](./INDEX.md) · [../INDEX.md](../INDEX.md) · `packages/forms/README.md` |

---

## Notas

- **Suelo de cobertura al abrir la rama** (líneas / ramas / funciones / sentencias):
  `@fudic/forms` 100 / 100 / 100 / 100 · `@fudic/compiler` 99,77 / 98,49 / 99,54 / 99,35 ·
  `@fudic/language-core` 100 / 100 / 100 / 100.
- **Tras la fase 2:** `compiler` 99,77 / 98,51 / 99,54 / 99,36 y `language-core` 100 en las
  cuatro. Los dos ficheros nuevos del compilador (`binding/markers.ts`,
  `semantic/analyzers/error-marker.ts`) nacen al 100 %, y por eso sus tests —criterio 18— y los
  del editor —criterio 19— se adelantaron a esta fase. Los once tests del compilador que fijaban
  el span fabricado se reescribieron contra el marcador (criterios 13–17).
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
