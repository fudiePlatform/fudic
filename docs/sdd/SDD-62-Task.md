# SDD-62 — Tareas

> **SDD:** [SDD-62 — Diagnósticos que dicen la verdad](./SDD-62-diagnosticos-que-dicen-la-verdad.md)
> **Paquetes:** `@fudic/diagnostics` · `@fudic/compiler` · `@fudic/language-server` · `fudic-vscode`
> **Rama:** `sdd-62-diagnosticos-que-dicen-la-verdad`. Nace de `main` **con SDD-61 en `Hecho`**:
> sus catorce códigos y sus reescritos entran en la migración.
> **Progreso:** 0 / 21 — `Listo`.

**Dos sesiones.** Una implementa y coordina. La otra escribe los tests de cada fase (las tareas
«Los tests de…») contra los criterios de SDD §6. Si un test destapa un defecto, se corrige el
código, no el test.

**El orden manda en dos puntos.**

- **El test de forma se endurece después de migrar**, en la misma fase: si va antes, el
  repositorio no compila entre commits.
- **Los pares van antes que las correcciones de texto**: un par en rojo es lo que dice qué
  explicación está mal. Nada se corrige «de memoria».

---

## Mapa de dependencias

```
1 códigos nuevos
   │
   ▼
2 origen al .ts ─→ 3 .md sin origen ─→ 4 cuerpos sin SDD ─→ 5 FUD0725 ─→ 6 test de forma ─→ 7 explain ─→ 8 tests
   │
   ▼
9 el arnés de pares ─→ 10 pares del .fud ─→ 11 pares de .fudspec y .fudapi ─→ 12 corregir lo que falla ─→ 13 tests
   │
   ▼
14 repairsFor ─→ 15 FUD0540 ─→ 16 FUD0056 ─→ 17 títulos en inglés ─→ 18 tests
   │
   ▼
19 FUD1160 y FUD1161 ─→ 20 FUD1162 y variantes de FUD0907 ─→ 21 tests, docs, entrega y cierre
```

---

## Fase 1 — el catálogo como datos (8)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [ ] | 1 | — | **Los códigos nuevos.** `FUD1160`–`FUD1162`: `.ts`, `.md` (forma nueva, §3.1) y su línea en `index.ts`. El rango en la fila de SDD-62 del `INDEX.md` | `diagnostics` | `src/codes/FUD1160`–`1162.{ts,md}` · `src/index.ts` |
| [ ] | 2 | — | **El origen al `.ts`.** Cada `.ts` cuyo JSDoc no nombra SDD ni BUG gana el origen que tenía su `.md` | `diagnostics` | `src/codes/*.ts` |
| [ ] | 3 | 2 | **`.md` sin origen.** La segunda línea queda en `**<severidad>**`, en los 379 | `diagnostics` | `src/codes/*.md` |
| [ ] | 4 | 3 | **Cuerpos sin SDD.** Las 28 menciones del texto se reescriben diciendo lo que pasa | `diagnostics` | `src/codes/*.md` |
| [ ] | 5 | 3 | **`FUD0725`.** Sus ejemplos entran en la línea del `**Fix:**`; nada detrás | `diagnostics` | `src/codes/FUD0725.md` |
| [ ] | 6 | 3–5 | **El test de forma, cerrado.** Severidad sola, última línea `**Fix:**`/`**Replaced by:**`, sin `SDD-`/`BUG-`; cada `.ts` nombra su origen en el JSDoc | `diagnostics` | `test/catalog.test.ts` |
| [ ] | 7 | 3 | **`explain`.** Lee y parte un `.md` en `Explanation`; nunca lanza | `diagnostics` | `src/explain.ts` |
| [ ] | 8 | 6, 7 | **Los tests de la fase.** Criterios 1–3 | `diagnostics` | `test/**` |

## Fase 2 — los pares roto/arreglado (5)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [ ] | 9 | 3 | **El arnés.** Saca de los `.md` la lista de códigos con ejemplo de código; para cada uno busca `fixtures/FUDnnnn.<ext>` y `.fixed.<ext>` (o su carpeta), los pasa por el mismo pase que el build y comprueba roto = ese código y ningún otro error, arreglado = nada | `diagnostics` | `test/fixes.test.ts` (dev-deps: `compiler`, `typecheck`, `spec`, `api`) |
| [ ] | 10 | 9 | **Los pares de `.fud`.** Uno por código del compilador y del pase tipado de la lista | `diagnostics` | `fixtures/*.fud` · `fixtures/FUDnnnn/` |
| [ ] | 11 | 9 | **Los pares de `.fudspec` y `.fudapi`.** Igual, con sus extensiones | `diagnostics` | `fixtures/*.fudspec` · `fixtures/*.fudapi` |
| [ ] | 12 | 10, 11 | **Corregir lo que el par demuestre.** `FUD0191` por papel del fichero (SDD §4.1) y cada `.md` cuyo par falle; los de fuera del lenguaje (`fudic.json`, CLI, banco) se revisan a mano | `diagnostics` | `src/codes/*.md` |
| [ ] | 13 | 12 | **Los tests de la fase.** Criterios 4–6 | `diagnostics` | `test/fixes.test.ts` |

## Fase 3 — las bombillas (5)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [ ] | 14 | — | **`repairsFor`.** Entrada `@fudic/language-server/repairs`; las funciones de `REPAIRS` devuelven `Repair`; el plugin de Volar las adapta a code actions | `language-server` | `src/repairs.ts` · `src/services/actions.ts` · `package.json` (`exports`) |
| [ ] | 15 | 14 | **`FUD0540`.** Los tres casos de SDD §4.3 con el tipo del elemento; ninguno en otro caso | `language-server` | `src/repairs.ts` |
| [ ] | 16 | 14, 19 | **`FUD0056`.** Sin bombilla cuando el valor empieza por `{` | `language-server` | `src/repairs.ts` |
| [ ] | 17 | 14 | **Títulos en inglés.** La tabla de SDD §4.4, también los de contrato y control del plugin | `language-server` | `src/repairs.ts` · `src/services/actions.ts` |
| [ ] | 18 | 15–17 | **Los tests de la fase.** Criterios 7–10, con el test que recorre todos los títulos; aplicar cada reparación deja el fichero sin un error nuevo | `language-server` | `test/**` |

## Fase 4 — los reflejos de React y cierre (3)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [ ] | 19 | 1 | **`FUD1160` y `FUD1161`.** `className`/`htmlFor` en el analizador de atributos nativos, con su bombilla; el parser emite `FUD1161` en lugar de `FUD0056` para un valor `{…}` | `compiler` · `language-server` | `src/semantic/analyzers/native-event-attributes.ts` · `src/html/parser.ts` · `src/repairs.ts` |
| [ ] | 20 | 1 | **`FUD1162` y las variantes de `FUD0907`.** Analizador de texto (fuera de `<code>` y `<pre>`); `props` y `children` con su frase | `compiler` | `src/semantic/analyzers/jsx-text.ts` · `ANALYZERS` · `src/semantic/view-js.ts` |
| [ ] | 21 | 19, 20 | **Tests, docs, entrega y cierre.** Criterios 11–15; los pares de los tres códigos nuevos; README de `@fudic/diagnostics` (la forma del `.md` y `explain`), que hoy falta aunque `files` lo pide; `pnpm typecheck`, `pnpm test` y `pnpm build` en verde y al 100 %; SDD-62 y este fichero en `Hecho`, fila y registro del `INDEX.md` | varios | `test/**` · `packages/diagnostics/README.md` · `docs/sdd/*` |
