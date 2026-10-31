# SDD-73 — Tareas

> **SDD:** [SDD-73 — Early Hints](./SDD-73-early-hints.md)
> **Paquetes:** `@fudic/compiler` · `@fudic/ssr` · `@fudic/core` · `@fudic/http` · `@fudic/config` · `@fudic/vite` ·
> `@fudic/transport` · `examples/basic`
> **Rama:** `sdd-73-early-hints`. Nace de `main` **con SDD-70 en `Hecho`**: las pistas por ruta,
> `earlyHints` y `componentStyles` son suyas (tareas 40–41).
> **Progreso:** 0 / 17 — `Listo`.

**Dos sesiones.** Una implementa y coordina. La otra escribe los tests de cada fase (las tareas
«Los tests de…») contra los criterios de SDD §6. Si un test destapa un defecto, se corrige el
código, no el test.

**El orden manda en dos puntos.**

- **El manifiesto antes que el middleware.** El middleware solo lee el manifiesto: si las pistas
  están incompletas, el 103 manda lo incompleto.
- **`css: "link"` al final.** Es lo único que cambia el HTML; todo lo anterior deja
  los bytes de la página como están.

---

## Mapa de dependencias

```
1 errorHints ─→ 2 hojas sin podar ─→ 3 tests
   │
   ▼
4 path y back en ErrorPage ─→ 5 los dos caminos ─→ 6 _error.fud del ejemplo ─→ 7 tests
   │
   ▼
8 middleware de Node ─→ 9 dev y preview ─→ 10 tests
   │
   ▼
16 css en fudic.json ─→ 17 el head a fichero ─→ 11 componentSheet ─→ 12 serializador y runtime
   ─→ 13 las hojas en las pistas ─→ 14 tests
   │
   ▼
15 prueba de Pedro, README, entrega y cierre
```

---

## Fase 1 — lo que falta en el manifiesto (3)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [ ] | 1 | — | **`errorHints`.** El build calcula las pistas de `_error.fud` como las de una ruta (sus hojas, `boot`, `main` y su cierre) y las escribe arriba del manifiesto; `ManifestFile.errorHints` en `@fudic/transport` (SDD §3.1, §3.3) | `vite` · `transport` | `src/plugin.ts` · `src/manifest.ts` · `src/manifest.ts` (transport) |
| [ ] | 2 | — | **Las hojas que no se podan.** `EmitOutput.hints` incluye las del head de `public/` (con `base`) y las de otro origen, en su orden; ni `?inline` ni un `href` dinámico (SDD §3.4) | `compiler` | `src/emit/page-sheets.ts` · `src/emit/parts.ts` |
| [ ] | 3 | 1, 2 | **Los tests de la fase.** Criterios 1–2 | `compiler` · `vite` | `test/**` |

## Fase 2 — la página de error sabe de dónde venía el usuario (4)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [ ] | 4 | — | **`path` y `back` en `ErrorPage`.** `back` solo de la cabecera `Referer`, resuelta con `new URL` y con el mismo origen exigido, como ruta sin `base`; ausente en otro caso (SDD §3.6) | `http` | `src/errors.ts` |
| [ ] | 5 | 4 | **Los dos caminos, sin datos en la URL.** `errorUrl` deja de poner `?detail=`: `/_fudic/error/:status` y nada más; el servidor no lee ninguna query de esa URL; `back` y `path` del `Referer` en los dos caminos; `detail` solo si el error nace en la petición que pinta; `Referrer-Policy: strict-origin-when-cross-origin` en las respuestas de página; el SW igual (SDD §3.6, §4.5) | `http` · `vite` · `transport` | `src/error-pages.ts` · `src/page-errors.ts` · `src/plugin.ts` · `src/serve.ts` · `src/router.ts` |
| [ ] | 6 | 4 | **El ejemplo.** `_error.fud` de `examples/basic` quita el enlace fijo a `/usuarios` y usa `@data.back`, con `/` si falta | `examples/basic` | `src/routes/_error.fud` |
| [ ] | 7 | 5, 6 | **Los tests de la fase.** Criterios 12–15, el 14 (seguridad) con enlaces fabricados | `http` · `vite` · `transport` | `test/**` |

## Fase 3 — el middleware (3)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [ ] | 8 | 1 | **El middleware de Node.** El contrato de SDD §3.2: ruta o `errorHints`; 103 con `writeEarlyHints` solo en HTTP/2+ y `Sec-Fetch-Mode: navigate`; `Link` en la respuesta final con las pistas de lo que se pintó; nada en datos, funciones ni estáticos; nada con `earlyHints: false` | `vite` | `src/early-hints.ts` |
| [ ] | 9 | 8 | **Dev y preview.** Los dos servidores lo ponen delante del render de páginas y de la página de error; en dev, las pistas con las URLs del servidor de desarrollo (SDD §4.1) | `vite` | `src/plugin.ts` · `src/serve.ts` |
| [ ] | 10 | 8, 9 | **Los tests de la fase.** Criterios 3–6, contra el servidor en proceso en HTTP/2 (`server.https`) con promesas controladas | `vite` | `test/**` |

## Fase 4 — el CSS como fichero (6)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [ ] | 16 | — | **`componentStyles` pasa a `css`.** `ProjectConfig.css` (`"inline"` · `"link"`); `componentStyles` deja de leerse; `FUD0725` con el nombre nuevo (SDD §3.5, decisión 8) | `config` · `diagnostics` · `vite` · `cli` | `src/read.ts` · `src/codes/FUD0725.ts` |
| [ ] | 17 | 16 | **El head de la ruta y del layout.** Con `componentSheet`, cada `<style>` del head (ruta, página, layout) y cada hoja `?inline` sale como `<link rel="stylesheet">` a un fichero podado y con hash, en su sitio; un `<style>` con `@` se queda; entra en `EmitOutput.hints` en su orden (SDD §3.5, §4.4) | `compiler` · `vite` | `src/emit/page-sheets.ts` · `src/emit/parts.ts` · `src/emit/layout.ts` |
| [ ] | 11 | 16 | **`componentSheet` en el emit.** Opción inyectada: con ella, las hojas de componentes y del proyecto son ficheros (`LinkedAssets.sheet`); head sin polyfill ni `<style type="module">`; `data-fud-sheets` en el anfitrión, en servidor y en cliente. Sin ella, el emit de hoy (SDD §3.5, §4.4) | `compiler` · `vite` | `src/emit/parts.ts` · `src/emit/markup.ts` · `src/emit/markup-client.ts` · `src/transform.ts` |
| [ ] | 12 | 11 | **El serializador y el runtime.** `openElement` escribe los `<link>` al final de la plantilla y no `shadowrootadoptedstylesheets`; `adoptSheets` los añade al final del shadow root de un anfitrión fabricado | `ssr` · `core` | `src/serialize.ts` · `src/adopt-sheets.ts` |
| [ ] | 13 | 11 | **Las hojas en las pistas.** `EmitOutput.hints` lleva las de los componentes de la página, detrás de las del head | `compiler` | `src/emit/page-sheets.ts` |
| [ ] | 14 | 11–13, 16, 17 | **Los tests de la fase.** Criterios 7–11 y 16 | `compiler` · `ssr` · `core` · `vite` | `test/**` |

## Fase 5 — prueba y cierre (1)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [ ] | 15 | 1–14, 16, 17 | **Prueba, docs, entrega y cierre.** Pedro prueba el criterio 17 (preview en HTTP/2, `css: "link"`); el contrato de §3.2 en el README de `@fudic/vite` con pseudocódigo para los demás backends; el anexo de SDD-70 al día; `pnpm typecheck`, `pnpm test` y `pnpm build` en verde y lo nuevo al 100 %; SDD-73 y este fichero en `Hecho`, fila y registro del `INDEX.md` | varios | `packages/vite/README.md` · `docs/sdd/*` |
