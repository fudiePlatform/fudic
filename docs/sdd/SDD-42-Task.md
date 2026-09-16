# SDD-42 — Tareas

> **SDD:** [SDD-42 — La guía de estilos de una aplicación: la hoja adoptada](./SDD-42-guia-de-estilos.md)
> **Paquetes:** `@fudic/compiler` · `@fudic/config` · `@fudic/ssr` · `@fudic/example-basic`
> **Rama:** `sdd-42-guia-de-estilos`
> **Progreso:** 7 / 10
> **Bloqueado por:** [SDD-41](./SDD-41-configuracion-de-aplicacion.md) tareas 1–3 — el campo
> `styles` cuelga de su lector. No necesita el resto de aquel SDD.

Diez tareas. Es un SDD corto porque el mecanismo ya existe: `shadowrootadoptedstylesheets` es
una lista separada por espacios desde el explainer, y el polyfill de SDD-18 **ya** parte
`data-fud-adopt` por espacios y acumula hojas. Lo que se escribe aquí es lo que alimenta esa
lista.

**El orden manda en dos puntos.** La **1 antes que todo**: el golden de «un proyecto sin
`styles` emite byte a byte lo de hoy» es la red que impide que este SDD toque la salida de
BUG-31 por accidente, y tiene que existir **antes** del primer cambio en el emit. Y la **8
después de la 7**: forzar el polyfill sobre una salida que todavía no lleva la hoja no mide
nada.

---

## Mapa de dependencias

```
1 la red (golden de hoy) ──→ 2 el campo ──→ 3 las hojas llegan al emit
                                                      │
                                   4 el hoisteo ──────┤
                                   5 la lista ────────┤
                                   6 T4 ampliado ─────┤
                                   7 T3 ampliado ─────┤
                                                      │
                             8 el polyfill en real ───┤
                             9 la evidencia ──────────┤
                                                      └→ 10 cierre
```

---

## Fase 1 — la red y el campo (3)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [x] | 1 | — | **El golden de hoy, congelado.** Un test que fija la salida actual de una página con componentes con y sin CSS: `<head>`, `shadowrootadoptedstylesheets`, `data-fud-adopt`, polyfill. Es la red de §5 —*sin `styles`, byte a byte lo de antes*— y **tiene que pasar en verde al final sin haberse editado**. Criterio 6 | `compiler` | `test/emit/__golden__/` · `test/emit/sin-styles.test.ts` |
| [x] | 2 | 1 | **`styles` en el config.** `ProjectConfig` gana `readonly styles: readonly string[]`, defecto `[]`, validado como array de strings con el resto (`FUD0720` si no lo es). Y los dos diagnósticos propios que el host comprueba al resolver: `FUD0740` (fichero inexistente) y `FUD0741` (dos basenames iguales). Criterio 10 | `config` | `src/read.ts` · `src/styles.ts` · `test/styles.test.ts` |
| [x] | 3 | 2 | **Las hojas llegan leídas.** `EmitOptions.projectStyles?: readonly ProjectStyle[]` y, del lado del plugin, la lectura del `fudic.json`, la resolución de cada ruta y el `specifier` `_<basename>`. **El compilador no abre un fichero**: se mide inyectando una `ResolveIo` que lanza si se le pide un `.css`. Criterio 11 | `compiler` · `vite` | `src/emit/index.ts` · `vite/src/styles.ts` |

---

## Fase 2 — el emit (4)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [x] | 4 | 3 | **El hoisteo, una vez y en su sitio.** Un `<style type="module" specifier="_x">` por hoja distinta, **después** del polyfill y **antes** de todo `<style>` de componente — que es la regla 2 de SDD-18 §3.2 y no una preferencia de orden. El CSS pasa por la misma minificación y el mismo `AssetLinker` que el de un componente (§4.7). Criterios 1, 3, 8 | `compiler` | `src/emit/parts.ts` · `src/emit/module.ts` |
| [x] | 5 | 4 | **La lista adoptada.** Los specifiers del proyecto se **anteponen** a los del componente, en el orden del array, y la misma lista va a las dos salidas: `shadowrootadoptedstylesheets` en el `<template>` (vía `@fudic/ssr`) y `data-fud-adopt` en el host, en el camino de servidor **y** en el de cliente. Que las dos discrepen es un componente que hidrata con otros estilos. Criterios 1, 2, 4 | `compiler` · `ssr` | `src/emit/markup.ts` · `src/emit/markup-client.ts` · `ssr/src/serialize.ts` |
| [x] | 6 | 5 | **BUG-31 §T4, con la premisa ampliada.** La condición deja de ser *«este componente tiene CSS»* y pasa a ser *«su lista de adopción está vacía»*. Un componente sin CSS en un proyecto con `styles` emite `data-fud-adopt="_theme"` y **ningún** `<style specifier="<tag>">` propio. Sin `styles`, las dos condiciones dicen lo mismo — y por eso el golden de la tarea 1 sigue verde. Criterio 5 | `compiler` | `src/emit/module.ts` · `src/emit/client.ts` |
| [x] | 7 | 6 | **BUG-31 §T3, con la premisa ampliada.** El polyfill sale si hay algo que adoptar, **de componente o de proyecto**. Un proyecto con `styles` y cero componentes con CSS lo emite; hoy no. Y `FUD0742`: `styles` declarado y ningún componente propio, warning. Criterios 7, 12 | `compiler` · ~~`compiler`~~ **`vite`** para `FUD0742` | `src/emit/parts.ts` · `vite/src/plugin.ts` |

> **Corrección de la tarea 7.** `FUD0742` habla del **proyecto** —«no define ningún
> componente»—, y el emit ve un fichero cada vez: puesto en `parts.ts` daría un aviso por
> cada ruta del build para un solo error. Va en el plugin, que es lo único que conoce el
> proyecto entero. La spec ya lo situaba ahí: su criterio 12 está bajo *El build* y sus
> tests en `packages/vite/test/`.

---

## Fase 3 — el aviso, la evidencia y el cierre (3)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [ ] | 8 | 4 | **`FUD0743`: `:root` dentro de un shadow no casa nada.** Warning sobre la regla, leído del AST de SDD-09 —los `parts` tapizan el span sin huecos (BUG-08 §2.2), así que no hace falta parser nuevo—, para `:root`, `html` y `body`. El mensaje dice a dónde mover la regla: al `<link rel="stylesheet">` del layout. **La hoja se emite igual**: es un aviso, no una poda. Criterio 9 | `compiler` | `src/emit/styles-lint.ts` · `src/emit/diagnostics.ts` |
| [ ] | 9 | 7, 8 | **La evidencia.** `examples/basic` gana `src/styles/theme.css` con el espaciado y el color que hoy están repetidos en los `<style>` de sus componentes, y esos `<style>` adelgazan. Verificado en Chrome real en `pnpm dev`, build sin SW y build con SW — **y con el polyfill forzado**, que es el camino que la mayoría de navegadores toma hoy (SDD-18 §2.2). Criterio 13 | `example-basic` | `fudic.json` · `src/styles/theme.css` · `src/components/*.fud` |
| [ ] | 10 | todas | **Cierre.** `pnpm typecheck`, `pnpm test`, `pnpm build`, y los 14 criterios de §6 verdes — con el 1 visto fallar antes y el **golden de la tarea 1 verde sin haberse editado**. El código nuevo de `@fudic/compiler` al 100 % en las cuatro métricas; `@fudic/config` sigue al 100. SDD-42 a `Hecho` en [INDEX.md](./INDEX.md) | — | [INDEX.md](./INDEX.md) |
