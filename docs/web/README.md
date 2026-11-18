# La web pública de fudic

Plan de la web pública de fudic: qué secciones tiene, cómo se escribe su documentación, en qué
orden y dónde vive el código. Rama de trabajo: `web-publica`.

## 1. Qué es

La web pública de fudic, **hecha con fudic**. Es a la vez la presentación del framework y su
primer cliente real: si algo no se puede hacer bien con fudic, la web lo descubre antes que un
usuario.

El aspecto lo marca el boceto [hero.html](hero.html): fondo marfil, texto pizarra y un único
acento arcilla. Los titulares van en Newsreader, el texto en Inter Tight y el código en JetBrains
Mono, sobre fondo pizarra.

## 2. Secciones

| Sección | Qué contiene | Cuándo |
|---|---|---|
| **Hero** | La portada: [hero.html](hero.html). | Boceto hecho; se porta a `.fud` con el esqueleto. |
| **Documentación** | La guía completa del framework (§5). La escribimos entre los dos. | **Ahora.** |
| **Tutorial** | `examples/basic` preparado para abrirse en StackBlitz, con todos los ejemplos revisados. | Segundo proceso, no ahora. |
| **MCP** | Toda la documentación del MCP. | Después de la Documentación. |

### Diseño de la Documentación

- **Izquierda:** el nav de capítulos y páginas. Marca la página en la que estás.
- **Centro:** la página.
- **Derecha:** el scroll spy, con un enlace a cada encabezado de la página que marca el que se
  está leyendo.

En móvil, el nav se pliega en un menú y el scroll spy se convierte en un «En esta página»
desplegable al principio.

## 3. Requisitos que no se negocian

- **SEO impecable.** Cada página con su `<title>`, `description`, URL canónica y Open Graph.
  Además, `sitemap.xml`, `robots.txt` y datos estructurados (`TechArticle`, `BreadcrumbList`). El
  HTML sale ya pintado del servidor, que es justo lo que fudic hace por defecto.
- **Accesibilidad impecable.** WCAG 2.2 AA como suelo:
  - landmarks (`header`, `nav`, `main`, `aside`) y un enlace «Saltar al contenido»;
  - orden de encabezados sin saltos, foco visible y todo navegable con teclado;
  - `aria-current` en el nav y en el scroll spy, y contraste comprobado en los dos temas;
  - respeto a `prefers-reduced-motion`.
- **Modo claro y modo oscuro.** Por defecto se sigue `prefers-color-scheme`, y hay un
  conmutador que recuerda la elección. Los colores son tokens: el modo oscuro solo los redefine.
  El código va sobre pizarra en los dos temas.

## 4. Idioma

1. Las páginas se escriben **en español**, para que Pedro las valide.
2. Cuando todo está validado, se aplica `@fudic/i18n` y se traduce al inglés.
3. El **inglés pasa a ser el idioma principal** de la web (el primero de `locales`) y el español
   queda como segundo idioma, con su `hreflang`.

Hasta el paso 2 no se mete inglés ni i18n en ninguna página.

## 5. La Documentación

### 5.1 Cómo se trabaja

Cada tema pasa por tres pasos, en orden:

1. **Se escribe en Markdown**, en `docs/web/docs/NN-tema.md`, uno por capítulo.
2. **Pedro lo revisa** y se corrige hasta que lo da por bueno.
3. **Se pasa a HTML**: la página `.fud` de la web, con el texto validado.

Un tema no pasa a HTML sin estar validado. El orden de trabajo es el del índice, salvo que Pedro
diga otro.

### 5.2 Índice

| # | Capítulo | Contenido |
|---|---|---|
| 1 | **Empezar** | Qué es fudic. Crear un proyecto (`npx @fudic/cli new`). Estructura de carpetas. Tu primer componente. |
| 2 | **El lenguaje `.fud`** | Anatomía de un componente: el tag, `<template shadowrootmode>` y el `<style>` del `<head>`. Expresiones `@(…)`. Control de flujo (`@if`, `@foreach`…). Bloques `@code` con `@server`/`@client`. Eventos, props y slots. |
| 3 | **Reactividad y ciclo de vida** | Signals, derivados y efectos. Ciclo de vida del componente. Hidratación en la primera interacción, sin perder ningún clic. |
| 4 | **Páginas y rutas** | Rutas por carpetas y parámetros. Layouts (toda página tiene uno). Página de error. Prerender e incremental. Early hints. |
| 5 | **Servidor y datos** | El contrato `.fudapi`. Funciones de servidor y middlewares (`@fudic/http`). RPC binario. Sesión con cookie o token. `@fudic/server` en dev y en producción. |
| 6 | **Formularios** | Modelo, grupos y validación. Controles form-associated. |
| 7 | **Internacionalización** | Textos de la vista, `t()`, pipes, compilar por idioma. |
| 8 | **Inyección de dependencias** | Contenedores encadenados y resolución por dueño. |
| 9 | **Estilos y rendimiento** | CSS con scope, hojas globales y adoptadas, guía de estilo. Solo el CSS que se pinta. Baseline. Caché del runtime. |
| 10 | **Seguridad** | Los ficheros `.headers` (ver §5.3). `serve.trustProxy`. Sesión segura. |
| 11 | **Pruebas** | Tests unitarios (`@fudic/testing`). Criterios `.fudspec`. Workbench. Historial `.fudlog`. |
| 12 | **Configuración** | `fudic.json` campo a campo y `sw.json` (ver §5.4). |
| 13 | **Plugin de Vite** | `@fudic/vite`: qué hace, cómo se configura, dev server y build. |
| 14 | **Editores** | La extensión de VS Code. Open VSX para Antigravity, Cursor, Windsurf y VSCodium. StackBlitz, por verificar. El language server en otros editores (Neovim, Zed…). |
| 15 | **Herramientas** | CLI, formateador y typecheck en build y en dev. |
| 16 | **Referencia** | API de cada paquete. Catálogo de diagnósticos `FUDnnnn`, generado desde `@fudic/diagnostics`. |

### 5.3 Seguridad: lo que cubre

Parte de los tres ficheros de `examples/basic`:

- **`page.headers`**, las cabeceras de toda página. Es lo que envía el servidor y lo que pinta el
  Service Worker. Cubre:
  - la CSP con `{nonce}` y `'strict-dynamic'`, y Trusted Types (`trusted-types fudic`);
  - Referrer-Policy, Cross-Origin-Opener-Policy y HSTS;
  - qué cabeceras viajan en el 103 Early Hints;
  - cómo se añade un origen externo a una directiva.
- **`assets.headers`**, las cabeceras de los ficheros estáticos, por ruta. Gana la ruta más
  específica, cabecera a cabecera, y un valor vacío no envía nada. Se usa sobre todo para la caché
  (inmutables con hash, fuentes sin hash).
- **`sw.headers`**, las cabeceras de `/fudic-sw.js`. El Service Worker no hereda la política de la
  página y necesita su `'unsafe-eval'`.

### 5.4 Configuración: lo que cubre

El schema vive en `packages/config/src/schema.ts`. La tabla de referencia se **genera desde el
schema**, para que la documentación no se desfase del código. Las páginas explicativas lo agrupan
así:

- **Identidad:** `id`, `kind` (`app` | `lib`), `prefix`.
- **Estilos:** `globalStyles`, `styles`, `css` (`inline` | `link`), `guide` (`sheet`, `icon`).
- **Idiomas y publicación:** `locales`, `site`.
- **Carpetas:** `server`, `browser`, `pipes`, `api`.
- **Servir:** `serve` (`trustProxy`…) y `earlyHints`.
- **Compatibilidad:** `baseline` (`target`, `allow`).
- **Diagnósticos:** `diagnostics` (`warnings`, nivel por código `FUDnnnn`).
- **`sw.json`:** `shell`, `resources` (`pattern`, `policy`, `ttl`, `maxEntries`) y `dev`.

### 5.5 Entregable aparte: el README de la extensión

El README de `packages/vscode` se rehace para que luzca en el **VS Code Marketplace** y en
**Open VSX** (de donde instalan Antigravity, Cursor, Windsurf y VSCodium). Se verifica qué admite
StackBlitz.

Lo que hay que hacer:

- añadir al `package.json` lo que hoy falta: icono de la extensión, `galleryBanner`, keywords,
  repositorio y homepage;
- capturas o GIF de la extensión funcionando;
- un README que venda: titular, escenas visuales y lo que hace, sin muros de texto.

Se hace junto con el capítulo 14, porque comparten contenido.

## 6. Dónde vive el código

La web es **una app y una librería**, con el mismo patrón de `examples/workspace`: dos proyectos
reales, cada uno con su `package.json`, que comparten código dependiendo uno del otro.

### Propuesta

```
web/
├── site/          # la app: páginas de Hero, Documentación, Tutorial y MCP
│   ├── fudic.json   { "id": "fudic-site", "kind": "app", "prefix": "site", "site": "https://…", "locales": ["es"] }
│   ├── package.json @fudic/web-site (privado)
│   └── src/routes/… las páginas; nada compartido
└── ui/            # la librería: todo lo compartido
    ├── fudic.json   { "kind": "lib", "prefix": "fd", "globalStyles": {…}, "guide": { "sheet": "…", "icon": "…" } }
    ├── package.json @fudic/web-ui (privado), exporta el .fud fuente, sin dist
    └── src/
        ├── components/  nav de docs, scroll spy, conmutador de tema, bloque de código…
        ├── layouts/     _layout.fud de la web y el de la documentación
        ├── _error.fud   la página de error
        └── styles/      tokens (claro/oscuro), reset, tipografía
```

- **Por qué en `web/` y no en `examples/`:** no es un ejemplo, es un producto que se publica.
  Igual que los ejemplos, consume los paquetes por su `dist`, así que si se rompe, el build lo
  dice.
- **Por qué una librería aparte:** el layout, la página de error, los estilos y los componentes
  compartidos quedan en un sitio. Si mañana la documentación del MCP, o un playground, es otra
  app, la reutiliza sin copiar nada.
- **Workspace:** se añaden `web/*` a `pnpm-workspace.yaml`.

**Pendiente de que Pedro decida:** la carpeta (`web/`), los prefijos (`site`, `fd`) y el dominio
de `site`.

## 7. Orden de trabajo

1. Este documento, validado por Pedro.
2. Decidir la ubicación de la app y la librería (§6).
3. Escribir los capítulos de la Documentación en Markdown, uno a uno, y validarlos (§5.1).
4. Montar el esqueleto: app, librería, layouts, nav, scroll spy, temas y la Hero portada a `.fud`.
5. Pasar a HTML los capítulos validados.
6. Aplicar i18n y traducir al inglés como idioma principal (§4).
7. MCP y Tutorial, en sus propios procesos.

Los pasos 3 y 4 pueden ir en paralelo si Pedro lo prefiere: el esqueleto no depende del texto.

## 8. Registro

| Fecha | Qué |
|---|---|
| 2026-11-18 | Worktree `web-publica` creado. Boceto movido a `docs/web/hero.html`. Este documento. |
