# La web pública de fudic

Plan de la web pública de fudic: qué secciones tiene, cómo se escribe su documentación, en qué
orden y dónde vive el código. Rama de trabajo: `web-publica`.

## 1. Qué es

La web pública de fudic, **hecha con fudic**. Es a la vez la presentación del framework y su
primer cliente real: si algo no se puede hacer bien con fudic, la web lo descubre antes que un
usuario.

El aspecto lo marca el boceto [hero.html](hero.html): fondo marfil, texto pizarra y un único
acento arcilla. Una sola fuente web, Inter Tight, para titulares y texto; el código va en la mono
del sistema, sobre fondo pizarra. (El boceto aún usa Newsreader y JetBrains Mono: se quitaron por
rendimiento, ver [notas-lanzamiento.md](notas-lanzamiento.md) §4.)

Cómo se cuenta Fudic, dónde está el riesgo y qué falta antes de lanzar:
[notas-lanzamiento.md](notas-lanzamiento.md). Lo que la web descubre del framework y de la CLI:
[hallazgos-fudic.md](hallazgos-fudic.md) y [hallazgos-cli.md](hallazgos-cli.md).

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

**Desde el capítulo 3** (Pedro, 2026-11-19): Claude propone el contenido en notas breves en el
chat, Pedro añade lo que falta, y Claude escribe directamente el HTML (la página `.fud`), que Pedro
revisa. Ya no se escribe Markdown. Los capítulos 1 y 2 siguieron el flujo anterior:

Cada tema pasa por tres pasos, en orden:

1. **Se escribe en Markdown**, en `docs/web/docs/NN-tema.md`, uno por capítulo; un capítulo con
   varias páginas es una carpeta, `docs/web/docs/NN-tema/`, con un fichero por página.
2. **Pedro lo revisa** y se corrige hasta que lo da por bueno.
3. **Se pasa a HTML**: la página `.fud` de la web, con el texto validado.

Un tema no pasa a HTML sin estar validado. El orden de trabajo es el del índice, salvo que Pedro
diga otro.

### 5.2 Índice

| # | Capítulo | Contenido | Estado |
|---|---|---|---|
| 1 | **Empezar** | Qué es fudic. Crear un proyecto (`npx @fudic/cli new`). Estructura de carpetas. Tu primer componente. | **Hecho** |
| 2 | **El lenguaje `.fud`** | Nueve páginas bajo `/docs/template-syntax`: Sintaxis de plantillas (por qué Razor adaptado a TypeScript, las cuatro piezas, vistas políglotas), Componentes, Rutas y layouts, Snippets, Expresiones y control de flujo, `@await`, Atributos y propiedades, Eventos (delegación y bus), `ref` y `@raw`. | **Hecho** |
| 3 | **Reactividad y ciclo de vida** | Signals, derivados y efectos. Ciclo de vida del componente. Hidratación en la primera interacción, sin perder ningún clic. | En revisión |
| 4 | **Estilos** | Cuatro páginas bajo `/docs/styles`: El CSS de un componente (shadow DOM, lo que cruza su frontera, una copia por documento, `style` en el markup), Hojas compartidas (documento, `globalStyles`, `styles`, tokens en `:root`), La guía de estilos (un trozo por elemento, `:where()`, `@sheet`) y Cómo llega el CSS (poda, `css: inline \| link`; Baseline, citado). | En revisión |
| 5 | **Servidor y datos** | Nueve páginas bajo `/docs/server`: El contrato `.fudapi`, Tipos, Funciones de servidor, `task`, Middlewares y cadena, Reglas y patrones, Pipes (cada uno con el catálogo de lo que Fudic trae de serie), Sesión y cookies y El servidor (`@fudic/server`). | En revisión |
| 6 | **Páginas y rutas** | Cinco páginas bajo `/docs/routing`: Rutas por carpetas, Los datos de la página (`load`, `paths`, `layout`), Cuándo se pinta (`ssg`, `ssr`, `sw`, y sin Service Worker), La página de error y Early hints. | En revisión |
| 7 | **Formularios** | Siete páginas bajo `/docs/forms`: El formulario (una declaración, los dos extremos; `$set` y `$patch`), Enlazar la vista (`control`, `error`, `summary`, `fields`, `validate-on`), Validación y validez (`require`, `when`, `messages`, `runs remote`, `$valid()`), Enviar al servidor (`form:=`, cómo lo recibe y valida el servidor, `catches`), Resultado y error (`fudic:result` y `fudic:error`, que cruzan el shadow DOM), Ficheros y Controles form-associated (`ElementInternals`, `shadowrootreferencetarget`). | En revisión |
| 8 | **Service Worker** | Cuatro páginas bajo `/docs/service-worker`: Qué hace, Datos y páginas en caché (`ttl`, políticas, invalidación, `page persist`), Configuración (`sw.json`, `sw.headers`) y Render isomórfico. | En revisión |
| 9 | **Internacionalización** | Textos de la vista, `t()`, pipes, compilar por idioma. | — |
| 10 | **Inyección de dependencias** | Contenedores encadenados y resolución por dueño. | — |
| 11 | **Rendimiento** | Caché del runtime. Lighthouse 100/100/100/100: cómo se mide y qué lo sostiene. | — |
| 12 | **Seguridad** | Los ficheros `.headers` (ver §5.3). `serve.trustProxy`. Sesión segura. | — |
| 13 | **Pruebas** | Tests unitarios (`@fudic/testing`). Criterios `.fudspec`. Workbench. Historial `.fudlog`. | — |
| 14 | **Configuración** | `fudic.json` campo a campo y `sw.json` (ver §5.4). | — |
| 15 | **Plugin de Vite** | `@fudic/vite`: qué hace, cómo se configura, dev server y build. | — |
| 16 | **Editores** | La extensión de VS Code. Open VSX para Antigravity, Cursor, Windsurf y VSCodium. StackBlitz, por verificar. El language server en otros editores (Neovim, Zed…). | — |
| 17 | **Herramientas** | CLI, formateador y typecheck en build y en dev. Baseline (`FUD1524`, «Mover a `@supports`»). | — |
| 18 | **Referencia** | API de cada paquete. Catálogo de diagnósticos `FUDnnnn`, generado desde `@fudic/diagnostics`. | — |

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

Se hace junto con el capítulo 16, porque comparten contenido.

## 6. Dónde vive el código

La web es un **workspace de fudic** en `web/`, creado con la propia CLI. Todo lo que se le añade
(páginas, componentes, layouts, librerías, módulos) se crea también con la CLI, nunca escribiendo
los ficheros a mano: así la web prueba la CLI a la vez que el framework. Si algo no se puede crear
con ella, es un hallazgo de la CLI (§6.1).

```sh
fudic new web --workspace --app site --uses ui --no-git --no-install
```

```
web/
├── package.json   dev y preview de todo el workspace
├── apps/site/     la app: Hero, Documentación, Tutorial y MCP (prefijo site)
└── libs/
    ├── ui/        lo compartido: layouts, página de error, componentes, tokens (prefijo ui)
    └── guide/     la guía de estilos, que la CLI crea siempre
```

- **Por qué en `web/` y no en `examples/`:** no es un ejemplo, es un producto que se publica.
- **Por qué dentro del workspace del monorepo:** como `examples/basic`, la web consume los
  paquetes del repo (`workspace:*`), así que crece al mismo ritmo que el framework y
  `pnpm build` / `pnpm test` la vigilan.
- **Por qué una librería aparte:** el layout, la página de error, los estilos y los componentes
  compartidos quedan en un sitio. Si mañana la documentación del MCP, o un playground, es otra
  app, la reutiliza sin copiar nada.
- **Dominio:** `fudic.dev`.

### 6.1 Lo que hubo que ajustar a mano al meterlo en el monorepo

La CLI genera un workspace pensado para vivir solo. Para integrarlo en el del repo:

- `web`, `web/apps/*` y `web/libs/*` se añaden al `pnpm-workspace.yaml` de la raíz, y se borra el
  de `web/`, que pnpm no lee dentro de otro workspace.
- Las dependencias `@fudic/*` pasan de `0.0.1` a `workspace:*`.
- La raíz de `web/` se queda solo con `dev` y `preview`. Su `build` (`pnpm -r build`) relanzaría
  el build de todo el monorepo, y `build`, `test` y `spec` duplicarían lo que ya hace el fan-out
  de la raíz.
- La web **no usa Service Worker**: se borraron `sw.json` y `sw.headers`.

Todo lo que la CLI no resuelve sola se anota en [hallazgos-cli.md](hallazgos-cli.md).

## 7. Orden de trabajo

1. ~~Este documento, validado por Pedro.~~
2. ~~Decidir la ubicación de la app y la librería (§6).~~
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
| 2026-11-18 | Plan validado. Workspace `web/` creado con la CLI e integrado en el monorepo (§6). |
| 2026-11-18 | Fuera el Service Worker. Notas de la CLI en `hallazgos-cli.md`. |
| 2026-11-18 | Capítulo 1, **Empezar**, validado en Markdown (`docs/01-empezar.md`). |
| 2026-11-18 | Guía con los colores del boceto. Layout `docs`, snippets `site`, `ui-code`, `ui-note`, `ui-toc` y la página `/docs/getting-started`. Lighthouse: escritorio 100/100/100/100, móvil 92/100/100/100. Hallazgos del framework en `hallazgos-fudic.md`. |
| 2026-11-19 | Lighthouse en móvil, de 92 a 99 (100 con compresión): una sola fuente recortada y precargada. Notas de lanzamiento en `notas-lanzamiento.md`. |
| 2026-11-19 | Capítulo 2, **El lenguaje `.fud`**, escrito en Markdown (ocho páginas en `docs/02-lenguaje-fud/`), pendiente de revisión. Sus ejemplos, compilados en la web: tres hallazgos del framework (6–8). |
| 2026-11-19 | Capítulo 2 ampliado (desestructuración, spread y resto, con React al lado; el host con sus atributos y eventos, con Angular al lado) y pasado a HTML a petición de Pedro, antes de su revisión: ocho páginas bajo `/docs/template-syntax`, creadas con `fudic g page` y rellenadas desde el Markdown. El nav de capítulos las lista. Hallazgo 9 del framework (booleanos en `aria-*`). |
| 2026-11-19 | Capítulo 2 en HTML: `@while` con `@empty` en Expresiones, y `@await` como página propia (`/docs/template-syntax/await`), con `<template for>` del HTML Living Standard como lo que emitirá en el futuro. Pedro pidió estos cambios directamente en el HTML: el Markdown ya no se mantiene al día. |
| 2026-11-19 | Capítulos 1 y 2, **hechos**. Desde el capítulo 3, notas en el chat y HTML directo, sin Markdown. |
| 2026-11-19 | Capítulo 3, **Reactividad y ciclo de vida**, en HTML para revisión: Signals (`/docs/reactivity`, con el patrón store y lo que admite un `computed`), Ciclo de vida (hooks de componente y de página) e Hidratación. `task` va al capítulo 5; el Service Worker y el render isomórfico, a un capítulo propio. |
| 2026-11-19 | Capítulo 4, **Estilos**, adelantado y en HTML para revisión: cuatro páginas bajo `/docs/styles`, creadas con `fudic g page`. El índice se renumera: Estilos es el 4 y el antiguo 9 queda en Rendimiento; Baseline se desarrolla en Herramientas. Hallazgos: el 6 del framework, vuelto a comprobar; el 11 nuevo (una `@` en un atributo del `<head>`); y el 10 de la CLI (sin generador para `styles`). Lighthouse en las cuatro páginas: móvil 99/100/100/100, escritorio 100/100/100/91 (el 91, por el enlace «Empezar» del nav, que ya pasaba en el capítulo 3). |
| 2026-11-20 | Se adelanta Servidor y datos al 5 y nace el capítulo 7, Service Worker, donde va el incremental: así nadie lee una página que use el `.fudapi` antes de verlo. El índice se renumera y los números de capítulo desfasados de las páginas escritas apuntan al bueno, con enlace donde la página existe. |
| 2026-11-20 | Capítulos 5, **Servidor y datos**, 6, **Páginas y rutas**, y 7, **Service Worker**, en HTML para revisión: dieciocho páginas creadas con `fudic g page`. Los fragmentos de `.fudapi` que no salen de `examples/basic` se comprobaron con el validador real. Hallazgos 12 a 24 del framework (entre ellos, el arranque en Node del ejemplo sirve la página de error en vez de un fichero estático) y 11 a 13 de la CLI. Lighthouse, una página de cada capítulo: móvil 99/100/100/100, escritorio 100/100/100/91 (el mismo 91 del enlace «Empezar»). |
| 2026-11-20 | El 91 de SEO en escritorio era la auditoría `link-text`: «empezar» está en la lista de textos no descriptivos de Lighthouse, y el enlace solo cuenta donde se ve (en escritorio, la lista de capítulos siempre abierta) y cuando no apunta a la página medida. El nav dice ahora «Empezar con Fudic»; ningún otro enlace del sitio está en la lista, de ningún idioma. Escritorio: 100/100/100/100. Hallazgos 25 a 27 del framework, de la revisión de `@fudic/forms` para el capítulo 8. |
| 2026-11-20 | Capítulo 8, **Formularios**, en HTML para revisión: siete páginas creadas con `fudic g page`. Los fragmentos de `.fudapi` que no salen de `examples/basic` se comprobaron con el validador real, y las URLs externas, una a una. «El servidor» (capítulo 5) decía que `maxArgs` es «cuántos argumentos», con un `100` de ejemplo: son los bytes de la parte `$args`, 1 MB por defecto. Hallazgos 25 a 27 del framework y el 6 de la CLI, otra vez. Lighthouse en las siete: móvil 99/100/100/100 (el 99, la preview sin compresión), escritorio 100/100/100/100. |
| 2026-11-20 | Todos los enlaces externos de la documentación abren en otra pestaña (`target="_blank" rel="noopener"`, 255 enlaces en 41 ficheros), para no perder la página que se está leyendo. `docs.css` lo avisa con una flecha ↗ y, para un lector de pantalla, con el texto «(se abre en otra pestaña)» como texto alternativo del contenido generado. Lighthouse sin cambios: móvil 99/100/100/100, escritorio 100/100/100/100. |
| 2026-11-20 | Reescritura para leer mejor de Estilos, Reactividad, El lenguaje `.fud`, Servidor y datos, Páginas y rutas y Formularios: cada página abre con su idea, un ejemplo corto por concepto y los detalles al final. Formularios pasa al 7, justo detrás de Páginas y rutas, y el Service Worker, al 8: el `.fudapi` es el mapa de todo lo que declara, y las rutas y los formularios lo desarrollan seguidos. |
