# SDD-84 — Tareas

> **SDD:** [SDD-84 — Las cabeceras de la app](./SDD-84-cabeceras-de-la-app.md)
> **Paquetes:** `@fudic/config` · `@fudic/diagnostics` · `@fudic/transport` · `@fudic/server` ·
> `@fudic/vite` · `@fudic/compiler` · `@fudic/dom` · `@fudic/forms` · `@fudic/typecheck` ·
> `@fudic/language-server` · `@fudic/vscode` · `@fudic/cli` · `@fudic/mcp` · `examples/basic`
> **Rama:** `sdd-84-cabeceras`, desde `sdd-83-diagnosticos-y-baseline` (Pedro mergea las dos a `main`).
> **Progreso:** 9 / 22 — `En curso`.

**El orden manda en tres puntos.**

- **El lector antes que nadie.** Todo lo demás consume `HeadersConfig` o `ManifestHeaders`.
- **El manifiesto antes que el servidor y el SW.** Los dos aplican lo que lleva el manifiesto.
- **La policy `fudic` y el nonce del emit antes que la plantilla en el ejemplo.** Con Trusted Types y
  `'strict-dynamic'` activos sin ellos, el ejemplo deja de hidratar.

---

## Fase 1 — diagnósticos

- [x] **1. Diagnósticos.**
  - `FUD1540`–`FUD1556`, cada uno con su función, su `.md` y su línea en `index.ts` (SDD §3.10).
  - *Depende de:* —.
  - *Paquete:* `diagnostics`.
  - *Ficheros:* `src/codes/FUD154*.{ts,md}`, `src/codes/FUD155*.{ts,md}`, `src/index.ts`.

## Fase 2 — el lector

- [x] **2. La tabla de cabeceras y la sintaxis.**
  - `parseHeaders`: líneas, continuaciones con el separador de cada cabecera, comentarios, bloques de
    `assets.headers`, nombres, repetidas, ASCII (§3.2). `FUD1540`, `FUD1541`.
  - La tabla de cabeceras conocidas, con su separador y su validador (§3.3). `FUD1543`.
  - *Depende de:* 1.
  - *Paquete:* `config`.
  - *Ficheros:* `src/headers/parse.ts`, `src/headers/known.ts`.
- [x] **3. La CSP.**
  - Directivas de CSP3, fuentes, `'none'`, la tabla de huecos con `{nonce}` (`FUD1544`, `FUD1546`).
  - Lo que debilita solo si cuenta (§3.4): `FUD1547`.
  - `CspNeed` (directiva, fuente, pieza) y `checkNeeds(csp, needs)`: la directiva efectiva según CSP3;
    `FUD1545`/`FUD1548` para lo que no pasa y `FUD1556` para lo que fudic ya no pide.
  - *Depende de:* 2.
  - *Paquete:* `config`.
  - *Ficheros:* `src/headers/csp.ts`, `src/headers/needs.ts`.
- [x] **4. Las demás comprobaciones y `readHeaders`.**
  - HSTS, COOP, `Referrer-Policy`, `Cache-Control`, `Permissions-Policy` (`FUD1549`, `FUD1550`).
  - Las cabeceras de fudic (§3.6, `FUD1542`).
  - `HEADERS_FILES`, `HEADERS_TEMPLATES` (§3.5), `readHeaders` con la plantilla para lo que falta y
    `FUD1554`.
  - *Depende de:* 3.
  - *Paquete:* `config`.
  - *Ficheros:* `src/headers/checks.ts`, `src/headers/templates.ts`, `src/headers/read.ts`, `src/index.ts`.
- [x] **5. Los tests del lector.** Criterios 3–13, 16, 17 y 20, más `checkNeeds` con necesidades
  inventadas (la parte de config de 10, 13 y 14).
  - *Depende de:* 4.
  - *Paquete:* `config`.

## Fase 3 — el manifiesto, el servidor y el SW

- [x] **6. `ManifestHeaders` en el transporte.**
  - `headers` en lugar de `csp`; fuera `DEFAULT_CSP` y `CspTemplates`; `PLACEHOLDERS`, `wantsNonce`,
    `pageHeadersFor` y `assetHeadersFor` con la regla más específica cabecera por cabecera (§3.7).
  - El router pone `pageHeadersFor` menos HSTS en `servePage` y en `render`, y solo genera nonce con
    `wantsNonce` (§4.3).
  - El linker declara su necesidad (`'unsafe-eval'`) junto a `new Function` (§3.4).
  - *Depende de:* 4.
  - *Paquete:* `transport`.
  - *Ficheros:* `src/manifest.ts`, `src/csp.ts`, `src/headers.ts`, `src/router.ts`, `src/index.ts`.
- [x] **7. `ServerApp.headers`.**
  - Fuera `csp` y `statics`; `pageHeaders`, `hint` y `staticHeaders` desde `headers` (§3.7, §4.1).
  - Nonce solo con `wantsNonce`; la sustitución es la función de Node del contrato (§4.4).
  - HSTS solo sobre HTTPS, con `trustProxy`.
  - Las cabeceras de `page.headers` ganan a lo que escribe `load`.
  - `nodeMiddleware`: lo de fudic gana al servidor de estáticos del host (§4.4).
  - *Depende de:* 6.
  - *Paquete:* `server`.
  - *Ficheros:* `src/types.ts`, `src/server.ts`, `src/node/index.ts`.
- [x] **8. El plugin.**
  - `readHeaders` en `configResolved`, con la política de SDD-83; `headers` en el manifiesto y en
    `emitServerModule`; `FUD0803` contra `page.headers` (§4.2).
  - `FUD1545`, `FUD1548`, `FUD1556` y `FUD1551`–`FUD1553` en `generateBundle` (en dev, al compilar),
    con las necesidades de las páginas y del bundle del SW; `.fudic/csp-needs.json` (§4.2).
  - Dev: sin CSP de página ni HSTS; `sw.headers` en `/fudic-sw.js`; vigilancia de los tres ficheros
    (§4.5).
  - El contrato de los backends en el README, con la función de sustitución en seis lenguajes (§4.4).
  - `EmitOutput.needs` y `TransformResult.needs` (vacías hasta la tarea 11), y los `fud-disable` de los
    `.headers` en el informe del build (SDD §8.2.16–17).
  - *Depende de:* 7.
  - *Paquete:* `vite`.
  - *Ficheros:* `src/plugin.ts`, `src/manifest.ts`, `src/dev.ts`, `src/server-module.ts`,
    `src/diagnostics.ts`, `README.md`.
- [x] **9. Los tests de las respuestas.** Criterios 10, 13–15, 18, 19, 22–28 y 35 (los de navegador, en
  los e2e). Del 10, la parte del build sin el polyfill (`checkEmitted` y `FUD0803`); el resto, en la 13.
  - *Depende de:* 8.
  - *Paquetes:* `transport`, `server`, `vite`.

## Fase 4 — runtime y emit

- [ ] **10. La policy `fudic`.**
  - `trusted.ts` en `dom`, frontera de las piezas; `htmlOf` y el resumen de errores de `forms` pasan
    por ella (§4.6).
  - *Depende de:* —.
  - *Paquetes:* `dom`, `forms`, `vite` (lista de fronteras).
  - *Ficheros:* `dom/src/trusted.ts`, `dom/src/browser.ts`, `forms/src/dom/summary.ts`.
- [ ] **11. El nonce en el emit.**
  - `$nonce` en `<script type="module" src>`, en cada `<link rel="modulepreload">` del head y en el
    `<script type="importmap">` del autor (§4.7).
  - Cada sitio que escribe algo inline registra su necesidad en el resultado de la compilación
    (§3.4, §4.7).
  - *Depende de:* —.
  - *Paquete:* `compiler`.
  - *Ficheros:* `src/emit/parts.ts`, `src/emit/page-sheets.ts`, el emit de los `<script>` de datos.
- [ ] **12. `FUD1555`.**
  - En el detector de código de navegador de SDD-83, por tipo, solo con `require-trusted-types-for`
    en `page.headers` (§4.6).
  - *Depende de:* 4.
  - *Paquete:* `typecheck`.
  - *Ficheros:* `src/trusted-types.ts`.
- [ ] **13. Los tests del runtime y el emit.** Criterios 29–31. Y el 10 de extremo a extremo: el build nombra el polyfill.
  - *Depende de:* 10, 11, 12.
  - *Paquetes:* `dom`, `forms`, `compiler`, `typecheck`.

## Fase 5 — editor, CLI y MCP

- [ ] **14. El lenguaje `fudheaders`.**
  - `filenames` de los tres ficheros, gramática TextMate, configuración de comentarios.
  - *Depende de:* —.
  - *Paquete:* `vscode`.
  - *Ficheros:* `package.json`, `syntaxes/fudheaders.tmLanguage.json`,
    `language-configuration.fudheaders.json`.
- [ ] **15. El language server.**
  - Diagnósticos con `parseHeaders` y la política; `FUD1545`, `FUD1548` y `FUD1556` desde
    `.fudic/csp-needs.json`; completado, hover con MDN y bombillas (§3.8).
  - *Depende de:* 4, 14.
  - *Paquete:* `language-server`.
  - *Ficheros:* `src/headers/service.ts`, `src/headers/actions.ts`, `src/headers/docs.ts`.
- [ ] **16. CLI.**
  - `fudic new` y `fudic g app` escriben los tres ficheros desde `HEADERS_TEMPLATES`, sin `sw.headers`
    con `--no-sw`, con el `assetsDir` de la app; `fudic check` los valida.
  - *Depende de:* 4.
  - *Paquete:* `cli`.
  - *Ficheros:* `src/plans/scaffold.ts`, `src/plans/check.ts`.
- [ ] **17. MCP.**
  - `fudic_check` con los tres ficheros.
  - El tema `config` en `guide/config.md` y `guide/es/config.md`; `TOPICS`; `overview.md` remite a él
    (§3.9).
  - El test que ata la guía al esquema de `fudic.json`, a `SwConfigFile` y a `HEADERS_FILES`.
  - *Depende de:* 4.
  - *Paquete:* `mcp`.
  - *Ficheros:* `src/guide.ts`, `src/check.ts`, `guide/config.md`, `guide/es/config.md`,
    `guide/overview.md`, `guide/es/overview.md`.
- [ ] **18. Los tests del editor, la CLI y el MCP.** Criterios 2, 21, 33, 34 y 36.
  - *Depende de:* 15, 16, 17.
  - *Paquetes:* `language-server`, `vscode`, `cli`, `mcp`.

## Fase 6 — ejemplo y cierre

- [ ] **19. El ejemplo.**
  - Los tres ficheros de `examples/basic` con una fuente de imágenes de fuera y un bloque `/fonts/*`
    (§4.8).
  - Los e2e de cabeceras en `preview` y `nosw`.
  - *Depende de:* 9, 13, 16.
  - *Paquete:* `examples/basic`.
  - *Ficheros:* `page.headers`, `sw.headers`, `assets.headers`, sus e2e.
- [ ] **20. Lighthouse.**
  - Criterio 32 sobre `vite preview` del ejemplo con HTTPS. Lo que salga se arregla aquí.
  - *Depende de:* 19.
- [ ] **21. Docs, `.vsix` y prueba de Pedro.**
  - README de `config`, `server` y `transport`. SDD-32, BUG-07, BUG-42, IDEA-07 e INDEX, donde citen
    avisos de Lighthouse que ya no aplican. `docs/PENDIENTE.md` (notas 3 y 8 cerradas) e INDEX
    (estado y registro).
  - El `.vsix` de la rama.
  - SDD §6.1 con ese `.vsix`.
  - *Depende de:* 18, 20.
- [ ] **22. Cierre.**
  - `pnpm typecheck`, `pnpm test`, `pnpm build` y los e2e en verde (criterio 37).
  - Cobertura de §5.
  - Estado `Hecho` y merge `--no-ff` a `main`.
  - *Depende de:* 21.
