# SDD-54 — Tareas

> **SDD:** [SDD-54 — Lo que quedaba de v1: `ref`, `@raw` y el spread de props](./SDD-54-pendientes-v1.md)
> **Paquetes:** `@fudic/compiler` · `@fudic/dom` · `@fudic/ssr` · `@fudic/language-core` ·
> `@fudic/language-server` · `fudic-vscode` · `@fudic/diagnostics` · `examples/basic`
> **Rama:** `worktree-pendientes-v1-props`
> **Progreso:** 22 / 22 — `Hecho`.

**El código se escribió en una sesión y los tests en otra**, fase a fase. La especificación se
escribió al final, por decisión de Pedro, después de su OK en el navegador. Los tests encontraron
un defecto real, el `$w` vacío tras `h` en `@raw` (tarea 12), y una guarda inalcanzable en la
proyección del spread, que se quitó.

---

## Fase 1 — `ref="@var"`

- [x] 1. Emit cliente: asignación en `$s` y anulación en `$d`, en el factory y en los bloques;
  `refTarget`/`refTargets`, y el bloque deja de recibir el `ref` como parámetro.
- [x] 2. `view-scope`: el valor de un `ref` no es lectura de la vista (sin `FUD0907`).
- [x] 3. `examples/basic`: ruta `/ref` con `ref-demo.fud`.
- [x] 4. Tests (otra sesión): unitarios, happy-dom con `c`/`h`/`r` y E2E de `/ref`.

## Fase 2 — `@raw(expr)`

- [x] 5. `@fudic/dom`: `html.ts` (`trustedHtml`, `isTrustedHtml`, `htmlOf`) y `setHtml` en
  `browserDom`.
- [x] 6. `@fudic/ssr`: nodo `html` verbatim y `SsrDom.setHtml`.
- [x] 7. `rawChild` y emit en servidor (`#content`) y cliente (value write en `#children`).
- [x] 8. `FUD0990` y el analizador `raw-only-child`.
- [x] 9. Editor: `$raw(v: $TrustedHTML | null | undefined)`.
- [x] 10. `examples/basic`: ruta `/raw` con `raw-demo.fud`; `vista-errores` envuelve su `@raw`.
- [x] 11. Tests (otra sesión): dom, ssr, analizador, emit, proyección y E2E de `/raw`.
- [x] 12. Arreglo: `h` siembra `$w` del `@raw`; el `it.fails` que lo fijaba pasa a `it`.

## Fase 3 — Spread `...item`

- [x] 13. `SpreadBinding`, `SPREAD_PREFIX`, `spreadExpr` y `FUD0991`; Oxc recibe el objeto.
- [x] 14. `PropTarget.all`, `spreadProps` y `spreadReadsMoving`.
- [x] 15. Servidor (`componentPropsExpr`), cliente (`#slots`), nivel (`level.ts`) y mapa (`maps.ts`).
- [x] 16. `FUD0992` y el analizador `spread-target`.
- [x] 17. Editor (`$spread`, anchor de `...`), semantic tokens y gramática TextMate.
- [x] 18. Arreglo: la fila de un `@foreach` con key que cambia de datos vuelve a dar props a su
  hijo (`row`, `$moved`).
- [x] 19. `examples/basic`: ruta `/spread` con `spread-list.fud` y `spread-card.fud`.
- [x] 20. Tests (otra sesión): clasificación, expansión, emit, nivel, `$moved`, proyección,
  tokens, gramática y E2E de `/spread`; `language-core` de vuelta al 100 %.

## Fase 4 — Documentación y cierre

- [x] 21. props-spec renumerada (75–86 → 142–153), spread sin llaves, `bind:` anulado (152
  derogada); gramática con 154 y 155 y la tabla de 142–153; referencias cruzadas renumeradas en
  docs y código; esta spec; `INDEX.md` (tabla, `props-spec`, rango, registro); PENDIENTES-v1.
- [x] 22. OK de Pedro en el navegador; `pnpm typecheck`, `pnpm test` y `pnpm build` en verde.
