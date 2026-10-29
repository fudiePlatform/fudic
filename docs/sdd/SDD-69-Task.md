# SDD-69 — Tareas

> **SDD:** [SDD-69 — Sesión por cookie](./SDD-69-sesion-por-cookie.md)
> **Paquetes:** `@fudic/http` · `@fudic/transport` · `@fudic/vite` · `@fudic/testing` ·
> `@fudic/diagnostics` · `examples/basic`
> **Rama:** `sdd-69-sesion-por-cookie`. Nace de `main` **con SDD-67 y SDD-68 en `Hecho`**: el
> ejemplo se repinta tras entrar y salir con lo de la 68.
> **Progreso:** 16 / 18 — `En curso`: falta la prueba de Pedro en el navegador (17) y el cierre (18).

**Dos sesiones.** Una implementa y coordina. La otra escribe los tests de cada fase (las tareas
«Los tests de…») contra los criterios de SDD §6. Si un test destapa un defecto, se corrige el
código, no el test.

**El orden manda en dos puntos.**

- **El servidor antes que el SW.** La marca `private, no-store` (fase 1) es lo que el SW lee en la
  fase 3; sin ella no hay nada que comprobar.
- **El ejemplo al final.** La prueba en el navegador (criterio 21) es la que dice que todo lo
  anterior encaja; se hace con las tres fases en verde, no antes.

---

## Mapa de dependencias

```
1 FUD1300
   │
2 setCookie/deleteCookie ─→ 3 la anotación de lectura ─→ 4 pageContext con response ─→ 5 tests
   │
   ▼
6 render y data en dev ─→ 7 en preview ─→ 8 FUD1300 en el prerender ─→ 9 tests
   │
   ▼
10 store respeta no-store ─→ 11 página no persistida ─→ 12 tests
   │
   ▼
13 testing guarda la cookie ─→ 14 auth por cookie ─→ 15 usuarios y /entrar ─→ 16 /cuenta
   ─→ 17 tests del ejemplo y prueba en navegador ─→ 18 README, entrega y cierre
```

---

## Fase 1 — el servidor (5)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [x] | 1 | — | **El código nuevo.** `FUD1300` (SDD §3.4): `.ts`, `.md` y su línea en `index.ts`. El rango en la fila de SDD-69 del `INDEX.md` | `diagnostics` | `src/codes/FUD1300.{ts,md}` · `src/index.ts` |
| [x] | 2 | — | **Poner y quitar la cookie.** `serializeCookie`, `setCookie`, `deleteCookie` y `CookieOptions` (SDD §3.1, §4.1); los `TypeError` de lo que el navegador rechazaría; exportados desde la entrada principal | `http` | `src/cookies.ts` · `src/index.ts` |
| [x] | 3 | — | **La anotación de lectura.** `serverContext` envuelve `cookies` y `headers` para anotar si se leyó la sesión (SDD §3.2); `valueResponse` y `problemResponse` ponen `Cache-Control: private, no-store` si se leyó y el handler no puso el suyo | `http` | `src/server/context.ts` · `src/server/dispatch.ts` · `src/server/problem.ts` |
| [x] | 4 | 3 | **`pageContext` con la respuesta de quien sirve.** `RenderContext.response` opcional; `pageContext` lo usa si viene. Una función que aplica la anotación a ese objeto, para que quien sirve la llame al final del render | `transport` · `http` | `src/router.ts` · `src/server/load.ts` |
| [x] | 5 | 2–4 | **Los tests de la fase.** Criterios 1–9 | `http` | `test/**` |

## Fase 2 — lo que escribe `load` llega (4)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [x] | 6 | 4 | **Dev.** El render de página y el endpoint de datos crean el `response`, se lo pasan al wrapper y lo aplican al responder (status, cabeceras, `Set-Cookie` uno a uno), también en la página de error (SDD §4.2); `Content-Type` y CSP los pone fudic | `vite` | `src/serve.ts` · `src/plugin.ts` |
| [x] | 7 | 6 | **Preview.** Lo mismo en `previewRender`, `previewData` y su página de error | `vite` | `src/plugin.ts` |
| [x] | 8 | 1, 4 | **`FUD1300` en el prerender.** Tras cada render, si se leyó la sesión, el diagnóstico sobre el `load` de la ruta y el build falla (SDD §4.4) | `vite` | `src/prerender.ts` |
| [x] | 9 | 6–8 | **Los tests de la fase.** Criterios 10–13 y 17 | `vite` | `test/**` |

## Fase 3 — el Service Worker no guarda la sesión (3)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [x] | 10 | 3 | **El `store` respeta `no-store` y `private`.** No guarda esa respuesta, con cualquier política; borra la copia que hubiera de esa URL (SDD §4.3) | `transport` | `src/store.ts` |
| [x] | 11 | 10 | **Una página con datos privados no se persiste.** `fetchData` dice si el `data` llegó `no-store`; el render no guarda esa página en `pages` | `transport` | `src/router.ts` |
| [x] | 12 | 10, 11 | **Los tests de la fase.** Criterios 14–16 | `transport` | `test/**` |

## Fase 4 — el ejemplo y cierre (6)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [x] | 13 | 2 | **`@fudic/testing` guarda la cookie.** `keepCookies` quita `HttpOnly` antes de escribirla en `document.cookie` (SDD §4.6). Criterio 18 | `testing` | `src/fetch.ts` · `test/**` |
| [x] | 14 | 2 | **`auth` por cookie.** `auth.fudapi` sin `client`; `server/auth.ts` lee `fudic-session`; `Tokens` → `Sessions`; fuera `src/browser/auth.ts` | `examples/basic` | `src/middlewares/auth.fudapi` · `src/server/auth.ts` · `src/services/` · `src/browser/auth.ts` |
| [x] | 15 | 14 | **`usuarios` y `/entrar`.** `load ssr` con `session str?`; `post login` y `post logout`; la vista sin `token`, `effect` ni `localStorage`, con los tres botones y el texto de la cookie; `/entrar` habla de sesión (SDD §4.7) | `examples/basic` | `src/routes/usuarios.{fud,fudapi}` · `src/server/usuarios.ts` · `src/routes/entrar.fud` |
| [x] | 16 | 14 | **`/cuenta`.** Ruta con `load` sin modo declarado que lee la sesión y saluda (SDD §4.7); enlace en `site-nav` | `examples/basic` | `src/routes/cuenta.{fud,fudapi}` · `src/server/cuenta.ts` · `src/components/site-nav.fud` |
| [ ] | 17 | 13, 15, 16 | **Los tests del ejemplo y la prueba en el navegador.** `user-form.test.ts` entra por `login`; `tests/usuarios.spec.ts` sin `localStorage`, con `context.cookies()` y `/cuenta` con dos usuarios; la prueba del criterio 21 a mano, en dev y en preview. Criterios 19–22 | `examples/basic` | `src/components/user-form.test.ts` · `tests/usuarios.spec.ts` |
| [ ] | 18 | 17 | **README, entrega y cierre.** El README de `@fudic/http` enseña la sesión por cookie en lugar del token; criterio 23; `pnpm typecheck`, `pnpm test` y `pnpm build` en verde y al 100 %; SDD-69 y este fichero en `Hecho`, fila y registro del `INDEX.md` | varios | `packages/http/README.md` · `docs/sdd/*` |
