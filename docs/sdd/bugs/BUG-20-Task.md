# BUG-20 — Tareas · El fuente baja a `src/`, y la convención a su propio paquete

> **BUG:** [BUG-20 — El scaffold siembra la raíz del proyecto: no hay `src/`](./BUG-20-fuentes-en-src.md)
> **Paquetes:** `@fudic/conventions` (**nuevo**) · `@fudic/cli` (`args.ts`, `layout.ts`,
> `plans/new.ts`, plantillas) · `@fudic/vite` (`options.ts`) · `examples/basic`
> **Rama:** `fix/bug-20-fuentes-en-src`
> **Progreso:** 7 / 10
> **No espera a nada.** Ningún SDD ni BUG en curso toca estos cuatro sitios

La convención de directorios está escrita cuatro veces, en dos paquetes, y **no hay ningún sitio en
el grafo de dependencias donde pueda vivir** ([§2.1](./BUG-20-fuentes-en-src.md),
[§2.3](./BUG-20-fuentes-en-src.md)). La corrección no es cambiar cuatro literales: es crear ese
sitio y dejar los cuatro apuntando a él.

Cada tarea es un paso cerrado: se implementa, se verifica y se marca. Ninguna depende de tareas
posteriores.

---

## Los dos hitos

**Hito A — la convención existe y tiene dueño.** `@fudic/conventions` es un paquete hoja que
declaran como dependencia de runtime la CLI y el plugin. Al terminar, cambiar la convención es
cambiar una línea, y llega a los dos por `pnpm install`.

**Hito B — la CLI y el plugin están de acuerdo por construcción.** `new-build.test.ts` construye el
árbol generado con `fudic()` **sin opciones**; deja de ser lo único que sostiene el contrato para
pasar a ser su comprobación de extremo a extremo.

**Fuera de esta tanda:** un `srcDir` configurable, mover `sw.json` / `public/` /
`fudic-globals.d.ts`, el `include` del `tsconfig` generado, cualquier comando de migración, y
cualquier otra constante dentro del paquete nuevo ([§3.4, §7](./BUG-20-fuentes-en-src.md)).

---

## Fase 1 — El paquete (2)

- [x] **1. `@fudic/conventions`.**
      Crear `packages/conventions` con la forma de cualquier paquete del repo —`package.json`
      (versión exacta, `exports`, `files`, `publishConfig`), `tsconfig.json` extendiendo
      `@fudic/tsconfig`, `tsconfig.build.json`, `vitest.config.ts` con `thresholds` al **100 %** en
      las cuatro métricas y `coverage.include: ['src/**/*.ts']`—. `src/index.ts` exporta
      `SRC_DIR`, `ROUTES_DIR`, `COMPONENTS_DIR` y `LAYOUTS_DIR`, **todavía con los valores viejos**:
      esta tarea no cambia comportamiento, solo crea el sitio. **Cero dependencias del workspace**:
      es una hoja, y si acaba dependiendo de algo, ya no lo es. Un README corto en inglés
      (convención de docs del repo).
- [x] **2. Los cuatro literales se van.**
      `@fudic/cli` y `@fudic/vite` declaran `@fudic/conventions` en **`dependencies`**, no en
      `devDependencies` (el plugin lo necesita en el build del usuario). Borrar los literales de
      [`plans/new.ts:17-18`](../../../packages/cli/src/plans/new.ts#L17-L18),
      [`layout.ts:23`](../../../packages/cli/src/layout.ts#L23) —`LAYOUTS_DIR` **se muda** al
      paquete—, los tres defectos de `--dir` de
      [`args.ts:252,266,279`](../../../packages/cli/src/args.ts#L252) y
      [`options.ts:48`](../../../packages/vite/src/options.ts#L48). La suite entera pasa sin tocar
      un test: si algo cambia aquí, es que un literal no era el que se creía. Criterio §6.0.

## Fase 2 — La convención pasa a `src/` (2)

- [x] **3. Una línea, y ver el árbol moverse.**
      Cambiar los cuatro valores de `packages/conventions/src/index.ts` a `src`, `src/routes`,
      `src/components`, `src/layouts`. Es **la tarea que demuestra el hito A**: un solo fichero
      cambia el scaffold y el descubrimiento de rutas a la vez. Ejecutar
      [`cli/test/new-build.test.ts`](../../../packages/cli/test/new-build.test.ts) y comprobar que
      **sigue en verde** — los dos lados se movieron juntos, que es justo lo que hoy no puede pasar.
      Actualizar el `dir` y el `wireInto` que ese test escribe a mano.
- [x] **4. El texto que acompaña al código.**
      El `USAGE` de [`args.ts:64,70,76`](../../../packages/cli/src/args.ts#L64) —la ayuda es
      interfaz— y la alineación del árbol de
      [`templates/README.md.tmpl`](../../../packages/cli/templates/README.md.tmpl), que recibe los
      directorios por variable y solo necesita cuadrar columnas. Repasar el comentario de
      `FudicOptions.routesDir` en [`options.ts:22`](../../../packages/vite/src/options.ts#L22), que
      cita el defecto en prosa. Criterios §6.1–§6.5.

## Fase 3 — Los tests (2)

- [x] **5. Los tests de la CLI.**
      `cli.test.ts`, `component.test.ts`, `page.test.ts`, `wire.test.ts`, `new.test.ts` y
      `fmt.test.ts`. No es un `sed`: los que fijan un `dir` explícito en su *helper* de opciones
      **siguen fijándolo** —son los que prueban que `--dir` manda
      ([§3.3](./BUG-20-fuentes-en-src.md))— y los que prueban el defecto pasan a esperar `src/…`.
      Añadir el criterio §6.1 tal como está escrito: la lista de lo que puede vivir fuera de `src/`
      es explícita, no deducida.
- [x] **6. Los fixtures del plugin.**
      Los tests de build de `packages/vite/test` montan `root/routes` y llaman a `fudic()` sin
      opciones: migrar el fixture a `src/routes` para que la suite ejercite el defecto nuevo.
      **`plugin.test.ts` (`routesDir: 'fixtures'`) y `client.test.ts` (`routesDir: 'routes'`) no se
      migran**: son los que mantienen probada la perilla. `options.test.ts` afirma el defecto nuevo
      y la precedencia de la opción. Criterios §6.9, §6.10.

## Fase 4 — El ejemplo (1)

- [x] **7. `examples/basic` baja a `src/`.**
      `git mv routes components layouts data src/` — las cuatro **juntas**, que es lo que hace que
      ni un `href` ni un `import` de `@server` cambie ([§4.4](./BUG-20-fuentes-en-src.md)).
      Comprobar exactamente eso: `git diff -M --stat` no debe mostrar más que renombrados.
      Actualizar el comentario de [`vite.config.ts`](../../../examples/basic/vite.config.ts) y el
      [`README.md`](../../../examples/basic/README.md) del ejemplo, y correr su build y sus specs de
      Playwright. Criterio §6.11.

## Fase 5 — Las specs y la documentación (3)

- [ ] **8. El paquete nuevo, en el mapa del repo.**
      `@fudic/conventions` en la tabla de paquetes de [`CLAUDE.md`](../../../.claude/CLAUDE.md) —la
      línea de `packages/` los enumera— y en [`docs/sdd/INDEX.md`](../INDEX.md) donde corresponda.
      Un paquete que no aparece en el mapa es un paquete que el siguiente duplicará.
- [ ] **9. Los SDD que fijan la convención vieja.**
      SDD-22 §3.1, §4.2, §4.5 y §6.1 —tabla de `--dir`, mapeo `<ruta>` → fichero, árbol de `fudic
      new`, ejemplos de salida— y SDD-19 §3.2 (el defecto de `routesDir`). Son documentos `Hecho`:
      la nota va donde estaba el valor, sin reescribir la sección. Un SDD que sigue diciendo
      `routes/` es lo que hace volver el defecto ([§2.4](./BUG-20-fuentes-en-src.md)).
- [ ] **10. READMEs, índice y estado.**
      [`cli/README.md:96`](../../../packages/cli/README.md#L96) y
      [`vite/README.md:19,25,36,77`](../../../packages/vite/README.md#L19). Marcar BUG-20 como
      `Hecho` en [`bugs/INDEX.md`](./INDEX.md) y anotar la tanda en el registro de progreso.

---

## Verificación final

- `pnpm install` (el paquete nuevo entra en el workspace) · `pnpm typecheck` · `pnpm test` ·
  `pnpm build` desde la raíz — el `build` incluye `examples/basic`, así que un ejemplo roto rompe la
  tanda.
- `grep -rn "'routes'\|'components'\|'layouts'" packages/cli/src packages/vite/src` no devuelve
  nada: es el criterio §6.0, y es la forma más corta de decir que la causa raíz está cerrada.
- `new-build.test.ts` en verde con `fudic()` **sin opciones**.
- Cobertura: `@fudic/conventions` al 100 % en las cuatro métricas; `@fudic/cli` y `@fudic/vite` no
  bajan.
