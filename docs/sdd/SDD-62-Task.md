# SDD-62 — Tareas

> **SDD:** [SDD-62 — Diagnósticos que dicen la verdad](./SDD-62-diagnosticos-que-dicen-la-verdad.md)
> **Paquetes:** `@fudic/diagnostics` · `@fudic/compiler` · `@fudic/language-server` · `fudic-vscode`
> **Rama:** `sdd-62-diagnosticos-que-dicen-la-verdad`. Nace de `main` **con SDD-61 en `Hecho`**:
> sus catorce códigos y sus reescritos entran en la migración.
> **Progreso:** 22 / 27 — `En curso`.

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
| [x] | 1 | — | **Los códigos nuevos.** `FUD1160`–`FUD1162`: `.ts`, `.md` (forma nueva, §3.1) y su línea en `index.ts`. El rango en la fila de SDD-62 del `INDEX.md` | `diagnostics` | `src/codes/FUD1160`–`1162.{ts,md}` · `src/index.ts` |
| [x] | 2 | — | **El origen al `.ts`.** Cada `.ts` cuyo JSDoc no nombra SDD ni BUG gana el origen que tenía su `.md` | `diagnostics` | `src/codes/*.ts` |
| [x] | 3 | 2 | **`.md` sin origen.** La segunda línea queda en `**<severidad>**`, en los 379 | `diagnostics` | `src/codes/*.md` |
| [x] | 4 | 3 | **Cuerpos sin SDD.** Las 28 menciones del texto se reescriben diciendo lo que pasa | `diagnostics` | `src/codes/*.md` |
| [x] | 5 | 3 | **`FUD0725`.** Sus ejemplos entran en la línea del `**Fix:**`; nada detrás | `diagnostics` | `src/codes/FUD0725.md` |
| [x] | 6 | 3–5 | **El test de forma, cerrado.** Severidad sola, última línea `**Fix:**`/`**Replaced by:**`, sin `SDD-`/`BUG-`; cada `.ts` nombra su origen en el JSDoc | `diagnostics` | `test/catalog.test.ts` |
| [x] | 7 | 3 | **`explain`.** Lee y parte un `.md` en `Explanation`; nunca lanza | `diagnostics` | `src/explain.ts` |
| [x] | 8 | 6, 7 | **Los tests de la fase.** Criterios 1–3 | `diagnostics` | `test/**` |

## Fase 2 — los pares roto/arreglado (5)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [x] | 9 | 3 | **El arnés.** Saca de los `.md` la lista de códigos con ejemplo de código; para cada uno busca `fixtures/FUDnnnn.<ext>` y `.fixed.<ext>` (o su carpeta), los pasa por el mismo pase que el build y comprueba roto = ese código y ningún otro error, arreglado = nada | `cli` | `test/fixes.test.ts` (SDD §8.2.1: en `diagnostics` cerraba un ciclo de build) |
| [ ] | 10 | 9 | **Los pares de `.fud`.** Uno por código del compilador y del pase tipado de la lista | `diagnostics` | `fixtures/*.fud` · `fixtures/FUDnnnn/` |
| [x] | 11 | 9 | **Los pares de `.fudspec` y `.fudapi`.** Igual, con sus extensiones | `diagnostics` | `fixtures/*.fudspec` · `fixtures/*.fudapi` |
| [x] | 12 | 10, 11 | **Corregir lo que el par demuestre.** `FUD0191` por papel del fichero (SDD §4.1) y cada `.md` cuyo par falle; los de fuera del lenguaje (`fudic.json`, CLI, banco) se revisan a mano | `diagnostics` | `src/codes/*.md` |
| [ ] | 13 | 12 | **Los tests de la fase.** Criterios 4–6 | `cli` | `test/fixes.test.ts` |

## Fase 2b — los defectos que destapan los pares (6)

SDD §8.2.2. Cada tarea se da por hecha cuando los pares de sus códigos pasan.

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [x] | 22 | 10 | **Lo que se calcula y se tira.** Los diagnósticos de la clasificación de atributos y spreads llegan al usuario, una vez | `compiler` | `src/semantic/**` · `src/binding/**` |
| [x] | 23 | 10 | **El emit no lanza.** Fichero solo de markup, host sin `<template>`, enlace a un `.fud` que no existe: diagnóstico, nunca excepción | `compiler` | `src/emit/**` |
| [ ] | 24 | 10 | **Una voz por hecho.** Donde hablan un código nuestro y TypeScript (u otro código) sobre el mismo fallo, calla el segundo | `compiler` · `typecheck` | varios |
| [x] | 25 | 10 | **Lo que no sale y lo que se contradice.** `FUD0543`, `FUD0621`; `FUD0914` frente a `FUD0835`/`FUD1151` | `compiler` · `diagnostics` | varios |
| [x] | 26 | 9 | **El arnés pasa lo que pasa el build.** Layout de ruta, estilos, assets, runtime, ficheros creados; códigos que solo emite el plugin, fuera | `cli` | `test/fixes*.test.ts` |
| [ ] | 27 | 22–26 | **Los tests de la fase.** Cada defecto con su test en rojo antes del arreglo | varios | `test/**` |

## Fase 3 — las bombillas (5)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [x] | 14 | — | **`repairsFor`.** Entrada `@fudic/language-server/repairs`; las funciones de `REPAIRS` devuelven `Repair`; el plugin de Volar las adapta a code actions | `language-server` | `src/repairs.ts` · `src/services/actions.ts` · `package.json` (`exports`) |
| [x] | 15 | 14 | **`FUD0540`.** Los tres casos de SDD §4.3 con el tipo del elemento; ninguno en otro caso | `language-server` | `src/repairs.ts` |
| [x] | 16 | 14, 19 | **`FUD0056`.** Sin bombilla cuando el valor empieza por `{` | `language-server` | `src/repairs.ts` |
| [x] | 17 | 14 | **Títulos en inglés.** La tabla de SDD §4.4, también los de contrato y control del plugin | `language-server` | `src/repairs.ts` · `src/services/actions.ts` |
| [x] | 18 | 15–17 | **Los tests de la fase.** Criterios 7–10, con el test que recorre todos los títulos; aplicar cada reparación deja el fichero sin un error nuevo | `language-server` | `test/**` |

## Fase 4 — los reflejos de React y cierre (3)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [x] | 19 | 1 | **`FUD1160` y `FUD1161`.** `className`/`htmlFor` en el analizador de atributos nativos, con su bombilla; el parser emite `FUD1161` en lugar de `FUD0056` para un valor `{…}` | `compiler` · `language-server` | `src/semantic/analyzers/native-event-attributes.ts` · `src/html/parser.ts` · `src/repairs.ts` |
| [x] | 20 | 1 | **`FUD1162` y las variantes de `FUD0907`.** Analizador de texto (fuera de `<code>` y `<pre>`); `props` y `children` con su frase | `compiler` | `src/semantic/analyzers/jsx-text.ts` · `ANALYZERS` · `src/semantic/view-portable.ts` |
| [ ] | 21 | 19, 20 | **Tests, docs, entrega y cierre.** Criterios 11–15; los pares de los tres códigos nuevos; README de `@fudic/diagnostics` (la forma del `.md` y `explain`), que hoy falta aunque `files` lo pide; `pnpm typecheck`, `pnpm test` y `pnpm build` en verde y al 100 %; SDD-62 y este fichero en `Hecho`, fila y registro del `INDEX.md` | varios | `test/**` · `packages/diagnostics/README.md` · `docs/sdd/*` |

---

## Relevo — dónde se quedó la sesión implementadora (2026-11-03)

**Estado.** Las fases 1, 3 y 4 están implementadas. La fase 2b (los defectos que destaparon los
pares, SDD §8.2.2) está casi cerrada. Pares: **154 / 156 en verde**
(`pnpm --filter @fudic/cli exec vitest run test/fixes`, ~2,7 min; un código:
`… run test/fixes -t FUDnnnn`). Todo el código está commiteado en la rama, sin push. La sesión de
tests (la otra) va por detrás escribiendo los tests de cada arreglo y midiendo la cobertura.

**Lo que falta, en orden.**

1. **`FUD0901` (tarea 24).** Si un snippet reasigna su parámetro (`@{ title = title + "!"; }`), la
   expansión sustituye el argumento y el emit da `FUD0170` «Cannot assign to this expression»,
   pero señalado sobre el ARGUMENTO de la llamada (`"Ada"` en `@render row("Ada")`), no sobre el
   cuerpo. Por eso no se encuentra con el `FUD0901` del check y la regla de una voz
   (`echoes`, en `vite/src/report.ts` y en el arnés) no lo calla. Propuesta, pendiente de que
   Pedro la confirme: que la expansión deje INERTE la llamada (como hace con la recursión,
   `expand/check.ts` `checkRenderCall`) cuando el cuerpo del snippet asigna a un parámetro, y
   que solo hable `FUD0901`. El par actual (`fixtures/FUD0901.*`) es honesto y no se toca.
2. **`FUD1010` (tarea 10).** Su par es una página de error de ruta (`_error.fud`) que lee
   `data.status` y `data.title`. Desde ca2f7243 una ruta sin `load` no tiene `data`
   (`typecheck/src/fudic-diagnostics.ts` `apisOf`: cero enlaces = sin `data`), y el par da tres
   `FUD0907`. Propuesta, pendiente de confirmar: un `_error.fud` siempre tiene `data`, porque se
   la da el framework. `apisOf` (o `view-scope`) lo trata como con `data`, igual que un layout
   por su papel.
3. **La sesión de tests** termina las tareas 13, 18 (hecha), 27 y la parte de tests de la 21:
   los tests de `snippetDiagnostics` y `channelDiagnostics`, el mutante de language-core → `FUD0429`,
   los cambios de span (`FUD0003`/`FUD0004`, `FUD0052`, `FUD0098`, `FUD0200`/`FUD0201`,
   `FUD0827`, `FUD0831`), y el commit de los tests de una voz del LS. **Cobertura:**
   `diagnostics`, `language-server` y `typecheck` al 100 en las cuatro; el compilador no puede
   bajar de su suelo de `main` (99,64 / 99,20 / 99,76 / 99,88) y estaba por debajo antes de sus
   tests de no-lanzar: hay que medirlo y cerrar el hueco con tests, no con `ignore`.
4. **Tarea 21, cierre.** Ya están el README de `@fudic/diagnostics` y la sección *Repairs
   without an editor* del de `language-server`, los dos commiteados. Faltan: `pnpm typecheck`,
   `pnpm test` y `pnpm build` en verde (`examples/`
   sin diagnósticos con las reglas nuevas, sobre todo `FUD0621`/`FUD0907` por `data` sin
   `.fudapi`), anotar en SDD §8.2 lo decidido al implementar que aún no está (ver abajo), SDD-62 y
   este fichero en `Hecho`, y la fila y el registro del `INDEX.md`.

**Decisiones tomadas al implementar que hay que anotar en SDD §8.2** (solo está la 8.2.1 y la
8.2.2):

- `FUD0914` y `FUD0195` **retirados**: un snippet que se renderiza a sí mismo es siempre `FUD0835`,
  y un literal de array u objeto en la vista es siempre `FUD1143`. Nunca podían hablar solos.
- **Una voz por hecho, como regla general:** TypeScript calla donde habla un error fudic del mismo
  fichero (`typecheck/src/one-voice.ts` `echoes`, en el checker y en el editor
  `language-server/src/services/one-voice.ts`); el `FUD0170` de Oxc calla donde ya habló el
  parse (`typecheck/src/project.ts`, `vite/src/transform.ts`); el reporter del build calla un
  error del emit que se encuentra con uno del check.
- Lo que solo decía el build lo dicen también el editor y el check: los `@render`
  (`FUD0826`–`FUD0831`), la forma de una prop (`FUD0200`, `FUD0201`, con `opaque` para lo
  importado), `FUD0429` (aviso, ya no error de TypeScript), `FUD0543`, `FUD0621`.
- `FUD0202` solo puede ser un callback (quien pasa una señal hace hidratar al hijo): `.md` y par
  reescritos.
- `FUD1382` solo habla del choque con un bucle que rodea al handler; el choque con el `@code` es
  el `FUD0918` del bucle.
- SDD-71 criterio 8: la mitad de TypeScript (el `TS2345` junto a `FUD1150`) queda superada por la
  regla de una voz; el test ya espera `FUD1150` solo.
- El ejemplo `examples/vista-errores` enlaza `src/vista-errores.fudapi` con `load`, para que sus
  lecturas de `data` sigan siendo los casos que anotan.

### Relevo de la sesión de tests (tareas 13, 26, 27 y los tests de la 21)

**Hecho y commiteado** (último: 08af2da6): el arnés completo (tarea 26: shards, estilos y
assets, regla de la lista, ficheros que crea el arreglo, regla de eco del reporter); tests del
compilador (no-lanzar, `FUD0543`/`FUD0621`, delegación, 33 analizadores, `FUD1143` en await,
`FUD0429` en contract, block/route-blocks/server-link); tests de typecheck (una voz, pipes,
file-registry, fudic-diagnostics); `examples/vista-errores` enlazado a su `.fudapi`.

**Pendiente, en orden:**

1. **Sin commitear en el árbol** (de la sesión de tests): `language-server/test/acceptance/one-voice.test.ts`
   (nuevo) y `diagnostics`/`parity`/`robustness.test.ts` (de `TS2304` + código fudic al código
   fudic solo). Pasar la suite del LS, commitear y dejar `services/one-voice.ts` al 100 (ramas: doc
   que no es `.fud`, otro código embebido, rango que no mapea, plugin sin `provideDiagnostics`).
2. **Cuatro tests del compilador en rojo:**
   - `await.test` líneas 134–137 y 152–153: `<p>@catch</p>` (un `@catch` suelto **sin cabecera**)
     da ahora `FUD1323` + `FUD0070` + otro. **Es un defecto del arreglo del `@catch` huérfano**
     (`control.ts` `#orphanCatch`, que ahora parsea cabecera y bloque siempre): sin `(` debe
     consumir solo la palabra y dar solo `FUD1323`. Arreglar el código; el test acierta.
   - `code.test:318`: el comentario Razor ya no está en el chunk; actualizar la expectativa.
   - `parser.test:204` `<script>a`: esperar `['FUD0014']`, sin `FUD0052`.
3. **language-core** `test/acceptance.test.ts:91` (mutante C): ya no hay `TS2345`; esperar
   `FUD0429` sobre `footer`.
4. **Tests sin escribir** del código de G1, G2 y 1035d043:
   - typecheck `snippetDiagnostics` (solo los diagnósticos sin `file`; el `FUD0835` entre ficheros)
     y `channelDiagnostics` (funciones que cruzan, importados opacos);
   - las exportaciones del compilador `propChannelDiagnostics` / `declaredPropsOf`;
   - los spans ensanchados: `FUD0827` (`ns.card`), `FUD0831` (el argumento con nombre entero),
     `FUD0098`/`FUD0200`/`FUD0201` (el atributo entero), `FUD0003`/`FUD0004` (desde la comilla);
   - `FUD0170` que calla al encontrarse con un error del parse (typecheck `parseSource`, vite
     `withoutSyntaxEchoes`);
   - vite `report.ts`: `BuildReporter` calla un error del emit que se encuentra con uno del check;
   - `view-scope` `isDeferred`: `form:=` da `FUD1005` sin `FUD1150`.
5. **Cobertura contra el suelo de `main`**, volver a medir: compiler 99,64 / 99,20 / 99,76 /
   99,88; vite 98,82 / 96,01 / 99,60 / 99,05; typecheck 100. En Windows, la cobertura se lanza
   desde una ruta corta: una ruta temporal profunda rompe los `#imports` de Node.
6. **Los dos pares en rojo** (`FUD0901`, `FUD1010`): ver los puntos 1 y 2 del relevo de arriba.

El worktree temporal `.claude/worktrees/floor-main` (detached en 2a820ec0) sigue ahí para medir
el suelo; quitarlo con `git worktree remove --force` al terminar.
