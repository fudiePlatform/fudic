# SDD-23 — Tareas

> **SDD:** [SDD-23 — Emisor de TypeScript virtual](./SDD-23-emisor-ts-virtual.md)
> **Paquete:** `@fudic/language-core` · **Rama:** `feat/lsp-vscode`
> **Progreso:** 29 / 29 — todas las tareas hechas; falta el cierre.

Cada tarea es un paso cerrado: se implementa, se verifica y se marca. Ninguna depende de
tareas posteriores. Los ficheros son relativos a `packages/language-core/`.

---

## Fase 0 — Andamiaje del paquete (3)

- [x] **1. Manifiesto del paquete.**
      Crear `package.json`: `@fudic/language-core`, dep `@fudic/compiler`, devDep `typescript`.
- [x] **2. Configuración de TS y tests.**
      Crear `tsconfig.json`, `tsconfig.build.json`, `README.md` y `vitest.config.ts` al **100 %**.
- [x] **3. Instalar y comprobar que el paquete vacío pasa.**
      `pnpm install` en la raíz; `pnpm --filter @fudic/language-core typecheck` en verde.

## Fase 1 — Contratos públicos (4)

- [x] **4. Tipos del emisor.**
      Crear `src/types.ts`: `VirtualFile`, `Mapping`, `MappingCaps` (6 flags de Volar), `FileRegistry`.
- [x] **5. Perfiles de capacidades.**
      Crear `src/caps.ts`: `USER_CAPS` (todo a `true` salvo `format`) y `SCAFFOLD_CAPS` (todo a `false`).
- [x] **6. Ambientes globales.**
      Crear `src/globals.ts`: `GLOBALS_DTS` con las declaraciones de §3.3 del SDD.
- [x] **7. API pública del paquete.**
      Crear `src/index.ts` reexportando tipos, `GLOBALS_DTS` y `emitVirtualFiles`.

## Fase 2 — Motor de emisión (2)

- [x] **8. Buffer de escritura con mapeo.**
      Crear `src/writer.ts`: `scaffold(text)` y `copy(span)`, acumulando texto + `Mapping`.
- [x] **9. Tests del buffer.**
      Crear `test/writer.test.ts`: offsets, longitudes 1:1 y `caps` por tramo.

## Fase 3 — Zona neutra y regiones `@code` (4)

- [x] **10. Partición del `@code`.**
      Crear `src/code.ts`: separa zona neutra, región `@server` y región `@client` del `CodeBlockNode`.
- [x] **11. Virtual de servidor.**
      Crear `src/emit-server.ts` y `src/paths.ts` (nombres virtuales); se emite **siempre**, con `export {}`.
- [x] **12. Proyección de `props<T>()`.**
      Crear `src/props.ts`: `const $p0 = props<T>()`, `export type $Props`, destructuring copiado literal.
- [x] **13. Tests de `@code`.**
      Crear `test/_support.ts`, `test/code.test.ts` y `test/props.test.ts`: partición, `$Props`, servidor vacío.

## Fase 4 — Proyección de la plantilla (7)

- [x] **14. Imports sintéticos de los `<link>`.**
      Crear `src/imports.ts`: `$C<n>` por componente, `$L0` por layout, vía `FileRegistry`.
- [x] **15. Derivación de `data`.**
      Crear `src/data.ts`: `$Data` desde `typeof import('./x.fud.server')`, degradando a `unknown`.
- [x] **16. Interpolaciones de texto.**
      Crear `src/template/text.ts` y `src/template/context.ts`: `@expr` y `@(expr)` → `$text(expr);`.
- [x] **17. Atributos y bindings.**
      Crear `src/template/attrs.ts`: `$attrs`, `$on`, `$cls`, `$sty` y `ref` como **asignación**.
- [x] **18. Control de flujo.**
      Crear `src/template/control.ts`: `@if`/`@foreach`/`@for`/`@while`/`@switch`/`@{ }` como sentencias reales.
- [x] **19. Secciones y slot.**
      Crear `src/template/sections.ts`: `@section n { }` → `$section<$L0>('n')`; `<slot>` → `$slot()`.
- [x] **20. Ensamblado del virtual cliente + tests.**
      Crear `src/emit-client.ts` y `test/template.test.ts`: imports + neutra + `@client` + `$tpl()`.

## Fase 5 — CSS y entrada (3)

- [x] **21. Virtual de CSS.**
      Crear `src/css.ts`: un virtual por `<style>`, regiones Razor a placeholders de igual longitud.
- [x] **22. Función de entrada.**
      Crear `src/emit.ts`: `emitVirtualFiles(input)` con la única invocación de Oxc del fichero.
- [x] **23. Tests de CSS y entrada.**
      Crear `test/css.test.ts` y `test/emit.test.ts`: nombres de virtual, identidad del mapeo, tolerancia.

## Fase 6 — Criterios de aceptación del SDD (5)

- [x] **24. Contrato `$Sections` del layout.**
      Modificar `src/template/sections.ts` y `src/emit-client.ts`: `export type $Sections` desde
      los `@RenderSection`. Hueco detectado al montar el corpus: sin él, el caso C no puede pasar.
- [x] **25. Corpus y arnés de typecheck.**
      Crear `fixtures/**` (los 4 `.fud` reales + `data/posts.ts`) y `test/typecheck.ts`, que compila
      los virtuals con la API de TypeScript y mapea cada diagnóstico de vuelta al `.fud`.
- [x] **26. Utilidades de mapeo.**
      Crear `src/mapping.ts`: `mapToSource`, `mapToGenerated` y `dedupeDiagnostics`.
- [x] **27. Caso base y batería de mutantes A–I.**
      Crear `test/acceptance.test.ts`: cero errores en el corpus; cada mutante con su código y su span.
- [x] **28. Criterios de mapeo 10–14.**
      Crear `test/mapping.test.ts`: rename acotado, andamiaje mudo, sin duplicados, parcial, determinista.

## Fase 7 — Integración con la CLI (1)

- [x] **29. El scaffolding escribe los mismos ambientes.**
      Modificar `packages/cli/{package.json, src/plans/new.ts, src/project.ts}` y crear
      `templates/tsconfig.json.tmpl`: `fudic new` emite `fudic-globals.d.ts` desde `GLOBALS_DTS`,
      un `tsconfig` con `**/*.fud` en el `include`, y fija la versión de TypeScript del proyecto.

---

## Cierre de la SDD

- [ ] `pnpm typecheck`, `pnpm test` y `pnpm build` en verde.
- [ ] Cobertura **100 %** en líneas, funciones, ramas y sentencias, con `coverage.include` sobre `src/**`.
- [ ] Marcar SDD-23 como `Hecho` y anotarlo en [INDEX.md](./INDEX.md) (tabla + registro de progreso).
