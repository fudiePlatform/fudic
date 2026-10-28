# SDD-67 — Tareas

> **SDD:** [SDD-67 — Binario en todas las llamadas, y reglas en los argumentos de las funciones](./SDD-67-binario-y-reglas-en-las-funciones.md)
> **Paquetes:** `@fudic/http` · `@fudic/forms` · `@fudic/api` · `@fudic/diagnostics` ·
> `@fudic/language-server` · `@fudic/testing` · `@fudic/vite` · `examples/*`
> **Rama:** `sdd-67-binario-y-reglas`. Nace de `main`.
> **Progreso:** 33 / 33 — `Hecho`.

**Dos sesiones.** Una implementa y coordina. La otra escribe los tests de cada fase (las tareas
«Los tests de…») contra los criterios de SDD §6. Si un test destapa un defecto, se corrige el
código, no el test.

**El orden manda en tres puntos.**

- **El códec, completo y con sus vectores, antes de tocar una llamada.** Los vectores son lo que
  dice que el formato está bien; nada se cablea sobre un códec sin ellos.
- **El test de bytes de forms se muda en la misma tarea que el códec**, sin cambiar un byte
  esperado. Si hay que tocar un byte esperado, el defecto está en el códec.
- **El emisor, antes de migrar los tests de `vite` y los e2e.** Hasta que el compilador emite
  `wire`, `sig`, `returns` y `rules`, el `stub` usa `binWire` por defecto y no hay reglas que
  comprobar; los tests de integración se migran una vez, contra lo definitivo.

---

## Mapa de dependencias

```
1 FUD1260
   │
2 mudar Io ─→ 3 el recorrido por tipo ─→ 4 tyOfSchema ─→ 5 el problema ─→ 6 jsonWire ─→ 7 signature ─→ 8 vectores ─→ 9 tests
                                                                                                          │
                                                                                                          ▼
10 FnSpec ─→ 11 el paso final del stub ─→ 12 la vuelta ─→ 13 serve: firma, 415, cuerpo ─→ 14 serve: valor y problema ─→ 15 las reglas ─→ 16 tests
                                                                                                          │
                                                                                                          ▼
17 gramática ─→ 18 validación ─→ 19 middleware json ─→ 20 emisor: wire y returns ─→ 21 emisor: firma ─→ 22 emisor: reglas ─→ 23 formateador ─→ 24 tests
                                                                                                          │
                                                                                                          ▼
25 autocompletado ─→ 26 tokens y hover ─→ 27 tests
                                                                                                          │
                                                                                                          ▼
28 respond ─→ 29 migrar http ─→ 30 migrar vite y la poda ─→ 31 examples y e2e ─→ 32 README ─→ 33 entrega y cierre
```

---

## Fase 1 — el formato (9)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [x] | 1 | — | **El código nuevo.** `FUD1260`: `.ts`, `.md` y su línea en `index.ts`; el rango en la fila de SDD-67 del `INDEX.md`. `FUD1083` gana el parámetro `argument`/`field` y su `.md` habla de «a field or an argument» | `diagnostics` | `src/codes/FUD1260.{ts,md}` · `src/codes/FUD1083.{ts,md}` · `src/index.ts` |
| [x] | 2 | — | **Mudar el `Io`.** `Reader`, `Writer` e `Io` pasan de `forms/src/wire/io.ts` a `http/src/wire/io.ts` sin cambiar un byte; `Ty` se muda de `contract/wire.ts` a `wire/ty.ts` y gana `'any'`; `@fudic/forms` pierde `./wire` (`package.json`, `src/wire/`) y su test de bytes se muda con el códec | `http` · `forms` | `src/wire/io.ts` · `src/wire/ty.ts` · `forms/package.json` · `forms/src/wire/*` (fuera) |
| [x] | 3 | 2 | **El recorrido por tipo.** El nivel de SDD §3.1 (nulos, bits, valores) para todos los tipos, `enum`, `type`, listas y mapas; un solo recorrido para los dos sentidos; lectura hostil (§4.2) | `http` | `src/wire/bin.ts` |
| [x] | 4 | 3 | **`tyOfSchema`.** El schema de un form como su tipo (SDD §3.1), en su propio módulo | `http` | `src/wire/schema.ts` |
| [x] | 5 | 3 | **El problema y `any`.** El nivel del problema y las siete etiquetas de `any`; `binWire` completo (`encodeArgs`…`decodeProblem`), con `application/fud+bin` y `application/problem+fud` | `http` | `src/wire/bin.ts` · `src/wire/problem.ts` |
| [x] | 6 | 2 | **`jsonWire`.** El JSON de hoy detrás de la interfaz `Wire`: claves, `conform` del valor de vuelta, `application/problem+json` | `http` | `src/wire/json.ts` |
| [x] | 7 | — | **`signature`.** FNV-1a de 32 bits en 8 dígitos hexadecimales | `http` | `src/wire/signature.ts` |
| [x] | 8 | 5, 6 | **Los vectores y las entradas.** `wire/vectors.json` (SDD §3.1: una fila por tipo y por etiqueta, un form con `group`, una respuesta, un 422), publicado en `files`; entradas `./wire`, `./wire/bin` y `./wire/json` | `http` | `wire/vectors.json` · `package.json` (`exports`, `files`) · `src/wire/index.ts` |
| [x] | 9 | 3–8 | **Los tests de la fase.** Criterios 1–3: los vectores en los dos sentidos, los bytes de forms sin tocar, la lectura hostil | `http` | `test/wire/**` |

## Fase 2 — la llamada (7)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [x] | 10 | 8 | **`FnSpec`.** Gana `wire`, `sig`, `returns` y `rules` (`ArgRule`); el `stub` guarda su `spec`. Mientras el emisor no los da (fase 3), `wire` vale `binWire` | `http` | `src/contract/fn.ts` · `src/types.ts` |
| [x] | 11 | 10 | **El paso final del `stub`.** La etapa `encode` sustituye a `positional`, `binary` y `json`; un `get` lleva `?a=` en base64url (o JSON con `jsonWire`); `content-type` y `fud-sig` con `binWire`; `compress` igual | `http` | `src/contract/fn.ts` · `src/client/stages/*` · `src/client/pipeline.ts` |
| [x] | 12 | 11 | **La vuelta.** `decode` lee valor o problema según `content-type` con `spec.wire`; un cuerpo desconocido sigue siendo `{ status, title }`; con `jsonWire`, `conform(returns)` | `http` | `src/client/codec.ts` |
| [x] | 13 | 10 | **`serve`: firma, 415 y cuerpo.** `fud-sig` contra `spec.sig` (412); el `content-type` de su formato (415); `decodeArgs`, un form por `tyOfSchema`; `?a=` en base64url; fuera `application/fud` | `http` | `src/contract/server.ts` · `src/server/body.ts` · `src/server/dispatch.ts` |
| [x] | 14 | 13 | **`serve`: valor y problema.** `conform(returns)` antes de escribir (500 si no encaja); el problema con `encodeProblem` de su formato; el 404 sin función según `accept` | `http` | `src/contract/server.ts` · `src/server/problem.ts` · `src/server/dispatch.ts` |
| [x] | 15 | 10 | **Las reglas.** Un comprobador común: argumento a argumento, regla a regla, la primera que falla es un 400 con el `detail` de SDD §3.5; lo llaman el `stub` (sin petición) y `serve` (antes de la cadena) | `http` | `src/contract/rules.ts` · `src/contract/fn.ts` · `src/contract/server.ts` |
| [x] | 16 | 11–15 | **Los tests de la fase.** Criterios 4–10 y la parte de tiempo de ejecución de 15–17, con `FnSpec` escritos a mano | `http` | `test/contract/**` · `test/client/**` · `test/server/**` |

## Fase 3 — el `.fudapi` (8)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [x] | 17 | — | **La gramática.** Un argumento admite reglas debajo (`ArgDecl.rules: readonly RuleUse[]`); hoy es una hoja | `api` | `src/contract.ts` · `src/ast.ts` |
| [x] | 18 | 1, 17 | **La validación.** Las reglas de un argumento con las mismas comprobaciones que las de un campo (`FUD1080`, `FUD1083` con `argument`, `FUD1084`, `FUD1085`) y `FUD1260` para lo que no es una de las seis | `api` | `src/validate.ts` · `src/validate-form.ts` |
| [x] | 19 | — | **`middleware json`.** Su declaración, sin mitades, con su comentario | `http` | `fudapi/middlewares.fudapi` · `impl/fudic.d.ts` |
| [x] | 20 | 10, 19 | **Emisor: formato y vuelta.** Pliega las tres capas de la cadena como `compose`; si `json` queda, importa `jsonWire` de `@fudic/http/wire/json`, si no `binWire` de `/wire/bin`; emite `returns` | `api` | `src/emit/module.ts` |
| [x] | 21 | 7, 20 | **Emisor: la firma.** El texto canónico de SDD §4.3 y `sig`, solo con `binWire` | `api` | `src/emit/signature.ts` · `src/emit/module.ts` |
| [x] | 22 | 18, 20 | **Emisor: las reglas.** `rules` con cada validador importado por su nombre de `@fudic/forms/contract`, sus argumentos y su texto; `pattern` resuelto como en un form | `api` | `src/emit/module.ts` · `src/emit/form.ts` (lo compartido) |
| [x] | 23 | 17 | **El formateador.** Las reglas de un argumento, alineadas e idempotentes como las de un campo | `api` | `src/format.ts` |
| [x] | 24 | 18–23 | **Los tests de la fase.** Criterio 18; la firma del criterio 8 (qué la cambia y qué no); el plegado de `use json`/`skip json` del 11; el formateador del 19 | `api` | `test/**` |

## Fase 4 — el editor (3)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [x] | 25 | 17 | **Autocompletado.** Debajo de un argumento, las seis reglas y ninguna del proyecto | `language-server` | `src/fudapi/completion.ts` |
| [x] | 26 | 17 | **Tokens y hover.** Las reglas de un argumento se pintan y se explican como las de un campo | `language-server` | `src/fudapi/semantic-tokens.ts` · `src/fudapi/navigation.ts` |
| [x] | 27 | 25, 26 | **Los tests de la fase.** Criterio 19 (autocompletado y hover) | `language-server` | `test/fudapi/**` |

## Fase 5 — pruebas, migración y cierre (6)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [x] | 28 | 10 | **`respond` y `respondProblem`.** Leen `spec.wire` y `spec.returns`; con su test (criterio 20) | `testing` | `src/respond.ts` · `src/index.ts` · `test/**` |
| [x] | 29 | 16 | **Migrar los tests de `@fudic/http`.** Los que leen JSON del cable comprueban binario; los de JSON se quedan, con `jsonWire` | `http` | `test/body/*` · `test/client/codec.test.ts` · `test/contract/*` · `test/server/*` |
| [x] | 30 | 22 | **Migrar `@fudic/vite` y la poda.** `http-dev`, `http-build`, `http-functions`, `dev`, `dev-unit` en binario; un test de build que comprueba el criterio 13 sobre el bundle | `vite` | `test/**` |
| [x] | 31 | 22 | **`examples` y e2e.** `fudapi-editor` gana un argumento con reglas; `basic`, una función con `use json`; los e2e de `usuarios`, el alta y `sesion` pasan en binario, y uno nuevo por camino (criterios 11, 15) | `examples` | `examples/fudapi-editor/src/**` · `examples/basic/src/**` · `examples/basic/tests/*.spec.ts` |
| [x] | 32 | 31 | **README de `@fudic/http`.** En inglés y sin citar SDD: binario por defecto, `use json`, las reglas en los argumentos, la firma y el 412, dónde están los vectores | `http` | `README.md` |
| [x] | 33 | 24, 27–32 | **Entrega y cierre.** Criterio 21; `pnpm typecheck`, `pnpm test` y `pnpm build` en verde y al 100 % en lo nuevo; ningún umbral baja; SDD-67 y este fichero en `Hecho`, fila y registro del `INDEX.md` | varios | `docs/sdd/*` |
