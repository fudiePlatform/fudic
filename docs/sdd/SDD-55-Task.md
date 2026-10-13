# SDD-55 — Tareas

> **SDD:** [SDD-55 — El resto de props y el spread de atributos en elementos nativos](./SDD-55-resto-y-spread-nativo.md)
> **Paquetes:** `@fudic/compiler` · `@fudic/dom` · `@fudic/ssr` · `@fudic/language-core` ·
> `@fudic/diagnostics` · `examples/basic`
> **Rama:** `worktree-pendientes-v1-props`
> **Progreso:** 12 / 14

**El código se escribió en una sesión y los tests en otra**, fase a fase, y la especificación al
final, por decisión de Pedro. A mitad de la fase 2 cambió la sesión de implementación, que se
quedaba sin contexto. Los tests de la fase 1 encontraron un defecto real: una clave reunida
`Signal<T>` no repintaba (tarea 6).

---

## Fase 1 — El resto de props

- [x] 1. `Prop.rest` y `readRest` en `oxc-code.ts`.
- [x] 2. `rest.ts`: `localOf`, `restGroups`, `restAssignments`.
- [x] 3. Servidor (`module.ts`, `layout.ts`) y cliente (`client.ts`: declaración, guardas, `propNames`).
- [x] 4. `level.ts`, `state.ts` y `registry.ts` con las claves reunidas.
- [x] 5. `examples/basic`: ruta `/resto` con `campo-texto.fud` y `resto-demo.fud`.
- [x] 6. Tests (otra sesión), y arreglo: la clave reunida `Signal<T>` se suscribe por su local.

## Fase 2 — El spread de atributos en nativos

- [x] 7. `@fudic/dom`: `attrs.ts` (`attrsOf`, `attrsDiff`) y `setAttrs` en `browserDom`.
- [x] 8. `@fudic/ssr`: `SsrDom.setAttrs`.
- [x] 9. Emit: `writeSpreadAttrs`, `ValueSink.diff`, guarda con `$o` y siembra en `h`.
- [x] 10. `FUD0992` limitado al host propio y su plantilla; editor `$spreadAttrs`.
- [x] 11. `examples/basic`: `campo-texto` pasa a `<input ...resto>`.
- [ ] 12. Tests (otra sesión): dom, ssr, emit, analizador, proyección y E2E de `/resto`.

## Fase 3 — Documentación y cierre

- [x] 13. Esta spec y su Task; decisiones 156 y 157 en props-spec; índice de la gramática;
  `INDEX.md` (tabla y registro); nota en SDD-54 sobre `FUD0992`.
- [ ] 14. OK de Pedro en el navegador; `pnpm typecheck`, `pnpm test` y `pnpm build` en verde.
