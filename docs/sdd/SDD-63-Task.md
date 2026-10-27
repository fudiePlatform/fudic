# SDD-63 — Tareas

> **SDD:** [SDD-63 — Un componente cuenta todo sobre sí mismo](./SDD-63-contrato-del-componente.md)
> **Paquetes:** `@fudic/typecheck` · `@fudic/compiler` · `@fudic/language-server` ·
> `examples/workspace` · `examples/basic`
> **Rama:** `sdd-63-contrato-del-componente`, desde `main`.
> **Progreso:** 0 / 20 — `Listo`.

**Dos sesiones.** Una implementa y coordina. La otra escribe los tests de cada fase (las tareas
«Los tests de…») contra los criterios de SDD §6. Si un test destapa un defecto, se corrige el
código, no el test.

**El orden manda en un punto.** El contrato se **mueve** a `@fudic/typecheck` antes de crecer: la
tarea 1 no cambia ningún comportamiento, y los tests del language server siguen en verde sin
tocarlos.

---

## Mapa de dependencias

```
1 mover contractOf y propDetails ─→ 2 una pasada de Oxc
   │
   ▼
3 default ─→ 4 defaultSlot ─→ 5 span del detail en EmitCall ─→ 6 eventos con doc y detail
─→ 7 parts ─→ 8 tokens leídos ─→ 9 tests
   │
   ▼
10 doc en CssDeclaration ─→ 11 projectTokens ─→ 12 tests
   │
   ▼
13 uses y usesOf ─→ 14 la tarjeta ─→ 15 var(-- en el editor ─→ 16 referencias ─→ 17 tests
   │
   ▼
18 evidencia en examples ─→ 19 docs y entrega ─→ 20 cierre
```

---

## Fase 1 — el contrato se muda (2)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [ ] | 1 | — | **Mover.** `contractOf`, sus tipos y `propDetails` (que pasa a ser `typedContract`) salen de `language-server` a la entrada nueva `@fudic/typecheck/contract`; el language server los importa. Sin cambios de comportamiento | `typecheck` · `language-server` | `typecheck/src/contract.ts` · `package.json` (`exports`) · `language-server/src/mode.ts` · `src/services/tag-card.ts` |
| [ ] | 2 | 1 | **Una pasada de Oxc.** El contrato usa `codeOfDocument` (memoizado) en lugar de dos `extractCode` | `typecheck` | `src/contract.ts` |

## Fase 2 — lo que le faltaba al contrato (7)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [ ] | 3 | 1 | **`default`.** `ContractProp.default` desde `Prop.def` | `typecheck` | `src/contract.ts` |
| [ ] | 4 | 1 | **`defaultSlot`.** Un `<slot>` sin `name` o con `name=""` | `typecheck` | `src/contract.ts` |
| [ ] | 5 | — | **El segundo argumento de `emit`.** `EmitCall` gana el `Span` de su segundo argumento | `compiler` | `src/emit/oxc-code.ts` |
| [ ] | 6 | 1, 5 | **Eventos.** `ContractEvent` con `doc` (JSDoc de la sentencia) y, en `typedContract`, `detail` (tipos unidos en orden) | `typecheck` | `src/contract.ts` |
| [ ] | 7 | 1 | **Parts.** Los literales de `part="…"` del template, partidos y sin repetir; `partsDynamic` con una expresión | `typecheck` | `src/contract.ts` |
| [ ] | 8 | 1 | **Tokens leídos.** Los `var(--…)` del `<style>` del componente | `typecheck` | `src/contract.ts` |
| [ ] | 9 | 3–8 | **Los tests de la fase.** Criterios 1–6 | `typecheck` · `compiler` | `test/contract*.test.ts` |

## Fase 3 — los tokens (3)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [ ] | 10 | — | **La doc en el parser de CSS.** `CssDeclaration.doc` con el `/** … */` pegado, sin asteriscos | `compiler` | `src/css/rules.ts` |
| [ ] | 11 | 10 | **`projectTokens`.** Entrada `@fudic/typecheck/tokens`: cadena de dependencias, globales antes que opcionales, `:host` y `:root` (también en `@layer`), `group`, `from`, `style`; las hojas rotas dan su diagnóstico | `typecheck` | `src/tokens.ts` · `package.json` (`exports`) |
| [ ] | 12 | 10, 11 | **Los tests de la fase.** Criterios 7–10 | `compiler` · `typecheck` | `test/**` |

## Fase 4 — el editor (5)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [ ] | 13 | 1 | **`uses` y `usesOf`.** Cada uso de un tag enlazado, con su `Span`, al indexar; `usesOf` ordenado por ruta y posición | `typecheck` | `src/fud-index.ts` |
| [ ] | 14 | 6–8 | **La tarjeta.** Las seis secciones de SDD §3.5 en orden, la librería en la cabecera, el defecto tras el tipo, «Events» en inglés | `language-server` | `src/services/tag-card.ts` |
| [ ] | 15 | 11 | **`var(--` en el editor.** Autocompletado, hover e ir a la definición de los tokens en el `<style>` de un `.fud` y en un `.css` del proyecto; caché por proyecto que se invalida con las hojas y los `fudic.json` | `language-server` | `src/services/tokens.ts` · `src/services/plugin.ts` |
| [ ] | 16 | 13 | **Referencias de un tag.** `provideReferences` sobre una etiqueta de componente, en su fichero o en un uso | `language-server` | `src/services/plugin.ts` |
| [ ] | 17 | 13–16 | **Los tests de la fase.** Criterios 11–14 | `language-server` | `test/**` |

## Fase 5 — evidencia y cierre (3)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [ ] | 18 | 17 | **La evidencia.** `libs/guia/tokens.css` documenta cada token; `ui-card` documenta componente, props y slot. Criterio 15, comprobado en el editor por Pedro | `examples` | `examples/workspace/libs/**` |
| [ ] | 19 | 18 | **Docs y entrega.** README de `@fudic/typecheck` (las dos entradas nuevas) y de la extensión (tokens y referencias), en inglés y sin citar SDD. `pnpm typecheck`, `pnpm test` y `pnpm build` en verde; lo nuevo al 100 % en las cuatro métricas (criterio 16) | varios | `packages/*/README.md` |
| [ ] | 20 | 19 | **Cierre.** SDD-63 y este fichero en `Hecho`; fila y registro de progreso del `INDEX.md` | — | `docs/sdd/*` |
