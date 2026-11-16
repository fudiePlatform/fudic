# SDD-84 — La prueba de Pedro

> **SDD:** [SDD-84](./SDD-84-cabeceras-de-la-app.md) §6 criterio 1 · **Tareas:** [SDD-84-Task](./SDD-84-Task.md)
> **Rama / worktree:** `sdd-84-cabeceras`.

Cada paso dice dónde tocar, qué escribir y qué tiene que pasar. Las rutas son relativas a
`examples/basic` del worktree. Al terminar, `git checkout examples/basic` lo deja como estaba.

## Antes de empezar

1. **La extensión**, ya instalada desde esta rama. Recarga la ventana de VS Code (Ctrl+R). Si hubiera
   que repetirlo: `pnpm --filter fudic-vscode install:vsix`.
2. **Los paquetes ya están construidos** y el ejemplo también (`pnpm build` y `pnpm build:nosw`
   pasaron con los tres ficheros nuevos).
3. El ejemplo tiene `"diagnostics": { "warnings": "error" }`: **todo warning se ve como error**.

## 1. Colores, completado y hover

- **Dónde:** `page.headers`, `sw.headers` y `assets.headers`, en la raíz del ejemplo.
- **Qué pasa:** comentarios, nombres, rutas, directivas de CSP, palabras entre comillas y
  `{nonce}` salen con colores distintos.
- **Completado:** en una línea nueva de `page.headers` escribe `Cro` y Ctrl+Espacio: ofrece
  `Cross-Origin-Opener-Policy: `. Dentro de la CSP, en una línea sangrada, `script-` + Ctrl+Espacio
  ofrece las directivas `script-src…`. Detrás de `Cross-Origin-Opener-Policy: `, los cuatro valores.
- **Hover:** ratón sobre `frame-ancestors` o sobre `Strict-Transport-Security`: qué hace, con enlace
  a MDN.

## 2. Errores mientras se escribe, con su bombilla

En `page.headers`, de uno en uno, deshaciendo cada uno:

- `Cross-Origin-Opener-Policy: same-site` → `FUD1543`, bombilla «Cambiar por `same-origin`».
- Añade `Link: </x>; rel=preload` → `FUD1542`, bombilla «Quitar la línea».
- En la CSP, cambia `img-src` por `img-srcc` → `FUD1544`.
- Cambia `'nonce-{nonce}'` por `'nonce-abc123'` → `FUD1546`.
- Borra la línea `frame-ancestors 'none'` → `FUD1547`. Ponle encima a la directiva que queda un
  `# fud-disable-next-line FUD1547: prueba` y deja de avisar.
- `Referrer-Policy: no-referrer` → `FUD1549`.

## 3. Lo que se emitió frente a la política

- **Dónde:** `page.headers`, línea `script-src`.
- **Qué hacer:** déjala en `script-src 'self'` y ejecuta `pnpm build`.
- **Qué pasa:** el build falla con `FUD1545`, nombrando el polyfill. Tras el build, el editor
  enseña el mismo `FUD1545` sobre `script-src` con la bombilla «Añadir `'nonce-{nonce}'`»
  (lo lee de `.fudic/csp-needs.json`). Aplícala y el aviso desaparece.
- **De paso:** en `sw.headers` quita `'unsafe-eval'` → tras el build, `FUD1548` nombrando el linker.

## 4. `vite preview` y Lighthouse

- Deja los tres ficheros como estaban (`git checkout examples/basic`) y `pnpm build`.
- **Con HTTPS** (HSTS solo sale sobre HTTPS): `pnpm preview:h2` (necesita `pnpm cert:h2` una vez) y
  abre `https://localhost:4173/`. Sin HTTPS vale `pnpm preview`, pero HSTS no sale.
- **Qué pasa:** en DevTools → Network, la página lleva la CSP con un nonce distinto en cada recarga,
  `Referrer-Policy`, COOP y (con HTTPS) HSTS. La consola no tiene violaciones de CSP ni de Trusted
  Types; `/hidratacion`, `/raw` y `/formularios` (envía vacío para ver el resumen) funcionan. En
  Application → Service Workers, `/fudic-sw.js` está activo (con Trusted Types su URL pasa por la
  policy `fudic`; sin eso no se registraba).
- **Lighthouse** sobre la página, «Buenas prácticas»: sin avisos en «Confianza y seguridad».

## Al terminar

- `git checkout examples/basic` deja el ejemplo como en la rama.
- Si todo está bien, se mergea `sdd-84-cabeceras` sobre `sdd-83-diagnosticos-y-baseline` con
  `--no-ff`, haces la prueba de la 83, y entonces la tarea 22 (typecheck, test, build y e2e
  completos, una vez) antes de `main`.
- Si algo falla, se cuenta qué paso y qué se vio, y se arregla antes del merge.
