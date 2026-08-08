# BUG-20 — Tareas · El fuente baja a `src/`

> **BUG:** [BUG-20 — El scaffold siembra la raíz del proyecto: no hay `src/`](./BUG-20-fuentes-en-src.md)
> **Paquetes:** `@fudic/cli` (`convention.ts` nuevo, `args.ts`, `layout.ts`, `plans/new.ts`) ·
> `@fudic/vite` (`options.ts`) · `examples/basic`
> **Rama:** `fix/bug-20-fuentes-en-src`
> **Progreso:** 0 / 9
> **No espera a nada.** Ningún SDD ni BUG en curso toca estos cuatro sitios

La convención de directorios está escrita cuatro veces y ninguna sabe de las otras
([§2.1](./BUG-20-fuentes-en-src.md)). La corrección no es cambiar cuatro literales: es que quede
**uno**, y que el acuerdo entre la CLI y el plugin lo sostenga un test y no la memoria.

Cada tarea es un paso cerrado: se implementa, se verifica y se marca. Ninguna depende de tareas
posteriores.

---

## Los dos hitos

**Hito A — la convención existe.** `convention.ts` es el único sitio del repo donde está escrito
dónde vive el fuente. Al terminar, cambiar la convención otra vez es cambiar un fichero.

**Hito B — los dos paquetes están de acuerdo, y se demuestra.** `new-build.test.ts` construye el
árbol generado con `fudic()` **sin opciones**. Es el oráculo: se deja en rojo en la tarea 3 y no
vuelve a verde hasta la 4.

**Fuera de esta tanda:** un `srcDir` configurable, mover `sw.json` / `public/` /
`fudic-globals.d.ts`, el `include` del `tsconfig` generado, y cualquier comando de migración
([§7](./BUG-20-fuentes-en-src.md)).

---

## Fase 1 — La convención en un solo sitio (2)

- [ ] **1. `convention.ts`.**
      Crear `packages/cli/src/convention.ts` con `SRC_DIR`, `ROUTES_DIR`, `COMPONENTS_DIR` y
      `LAYOUTS_DIR` ([§3.1](./BUG-20-fuentes-en-src.md)), **todavía con los valores viejos**:
      esta tarea no cambia comportamiento, solo lo reúne. Mudar `LAYOUTS_DIR` desde
      [`layout.ts:23`](../../../packages/cli/src/layout.ts#L23) y hacer que `layout.ts` lo importe.
      Borrar los literales de [`plans/new.ts:17-18`](../../../packages/cli/src/plans/new.ts#L17-L18)
      y los tres defectos de `--dir` de
      [`args.ts:252,266,279`](../../../packages/cli/src/args.ts#L252). La suite entera pasa sin
      tocar un test: si algo cambia aquí, es que un literal no era el que se creía.
- [ ] **2. La convención pasa a `src/`.**
      Cambiar los cuatro valores de `convention.ts` a `src`, `src/routes`, `src/components`,
      `src/layouts`. Actualizar el `USAGE` de [`args.ts:64,70,76`](../../../packages/cli/src/args.ts#L64)
      —el texto de ayuda es interfaz— y la alineación del árbol de
      [`templates/README.md.tmpl`](../../../packages/cli/templates/README.md.tmpl), que recibe los
      directorios por variable y por eso solo necesita cuadrar las columnas. Criterios §6.1–§6.5.

## Fase 2 — El acuerdo con el plugin (2)

- [ ] **3. Ver el contrato en rojo.**
      Antes de tocar `@fudic/vite`, ejecutar
      [`cli/test/new-build.test.ts`](../../../packages/cli/test/new-build.test.ts) y **verlo
      fallar**: la CLI ya escribe en `src/routes` y el plugin sigue descubriendo en `routes`, así
      que el prerender de `/` no encuentra ruta. Es el test que define este BUG
      ([§2.3](./BUG-20-fuentes-en-src.md)) y la única tarea cuyo entregable es una observación.
      Actualizar de paso el `dir` del componente y el `wireInto` que el propio test escribe a mano.
- [ ] **4. El defecto del plugin acompaña.**
      `DEFAULT_ROUTES_DIR = 'src/routes'` en
      [`vite/src/options.ts:48`](../../../packages/vite/src/options.ts#L48), con el comentario de
      `FudicOptions.routesDir` puesto al día. La tarea 3 vuelve a verde con esto y con nada más.
      Criterios §6.8, §6.9.

## Fase 3 — Los tests (2)

- [ ] **5. Los tests de la CLI.**
      `cli.test.ts`, `component.test.ts`, `page.test.ts`, `wire.test.ts`, `new.test.ts` y
      `fmt.test.ts`. No es un `sed`: los que fijan un `dir` explícito en su *helper* de opciones
      **siguen fijándolo** —son los que prueban que `--dir` manda ([§3.3](./BUG-20-fuentes-en-src.md))—
      y los que prueban el defecto pasan a esperar `src/…`. Añadir el criterio §6.1 tal como está
      escrito: la lista de lo que puede vivir fuera de `src/` es explícita, no deducida.
- [ ] **6. Los fixtures del plugin.**
      Los tests de build de `packages/vite/test` montan `root/routes` y llaman a `fudic()` sin
      opciones: migrar el fixture a `src/routes` para que la suite ejercite el defecto nuevo.
      **`plugin.test.ts` (`routesDir: 'fixtures'`) y `client.test.ts` (`routesDir: 'routes'`) no se
      migran**: son los que mantienen probada la perilla. `options.test.ts` afirma el defecto nuevo
      y la precedencia de la opción. Criterios §6.9, §6.10.

## Fase 4 — El ejemplo (1)

- [ ] **7. `examples/basic` baja a `src/`.**
      `git mv routes components layouts data src/` — las cuatro **juntas**, que es lo que hace que
      ni un `href` ni un `import` de `@server` cambie ([§4.4](./BUG-20-fuentes-en-src.md)). Comprobar
      exactamente eso: `git diff -M --stat` no debe mostrar más que renombrados. Actualizar el
      comentario de [`vite.config.ts`](../../../examples/basic/vite.config.ts) y el
      [`README.md`](../../../examples/basic/README.md) del ejemplo, y correr su build y sus specs de
      Playwright. Criterio §6.11.

## Fase 5 — Las specs y la documentación (2)

- [ ] **8. Los SDD que fijan la convención vieja.**
      SDD-22 §3.1, §4.2, §4.5 y §6.1 —tabla de `--dir`, mapeo `<ruta>` → fichero, árbol de `fudic
      new`, ejemplos de salida— y SDD-19 §3.2 (el defecto de `routesDir`). Son documentos `Hecho`:
      la nota va donde estaba el valor, sin reescribir la sección. Un SDD que sigue diciendo
      `routes/` es lo que hace volver el defecto ([§2.4](./BUG-20-fuentes-en-src.md)).
- [ ] **9. READMEs, índice y estado.**
      [`cli/README.md:96`](../../../packages/cli/README.md#L96) y
      [`vite/README.md:19,25,36,77`](../../../packages/vite/README.md#L19). Marcar BUG-20 como
      `Hecho` en [`bugs/INDEX.md`](./INDEX.md) y anotar la tanda en el registro de progreso de
      [`docs/sdd/INDEX.md`](../INDEX.md).

---

## Verificación final

- `pnpm typecheck` · `pnpm test` · `pnpm build` desde la raíz — el `build` incluye `examples/basic`,
  así que un ejemplo roto rompe la tanda.
- `new-build.test.ts` en verde con `fudic()` **sin opciones**: es la frase que resume este BUG.
- Cobertura: `convention.ts` al 100 % en las cuatro métricas; `@fudic/cli` y `@fudic/vite` no bajan.
