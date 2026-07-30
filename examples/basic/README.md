# `@fudic/example-basic`

La aplicación mínima que demuestra **todo lo que fudic tiene montado hoy** (todo menos la
hidratación, SDD-15 cliente y SDD-17, que aún no existen): routing por sistema de
ficheros, los tres modos de render, componentes con CSS con scope, assets enlazados por
Vite y el render dentro del **Service Worker** (SDD-20).

## Arrancar

Desde la raíz del repo, con los paquetes construidos:

```sh
pnpm install
pnpm build                                    # construye packages/* (y este ejemplo)
pnpm --filter @fudic/example-basic dev        # http://localhost:5173
```

Y el sitio de producción:

```sh
pnpm --filter @fudic/example-basic build      # escribe dist/
pnpm --filter @fudic/example-basic preview    # sirve dist/ como lo haría un host estático
```

> Los paquetes se consumen desde su `dist`, igual que haría un usuario tras `npm install`.
> Si tocas `packages/*`, vuelve a lanzar `pnpm build` antes de `dev`.

## Qué hay dentro

```
routes/                 # el routing ES el árbol de ficheros
  index.fud             # /                    estática   → dist/index.html
  about.fud             # /about               estática   → dist/about/index.html
  logo.svg              #                      asset enlazado por Vite desde <link rel="icon">
  blog/
    index.fud           # /blog                sw (tiene @server load + strategy())
    [slug].fud          # /blog/:slug          enumerada con paths() + render local del resto
components/             # componentes compartidos, FUERA de routes/
  site-nav.fud
  app-card.fud          # enlaza a su vez app-badge.fud
  app-badge.fud
data/posts.ts           # la "base de datos"; solo la ve el servidor
sw.json                 # shell + políticas de cache. Sin este fichero NO hay Service Worker
playwright.config.ts    # arnés E2E sobre el build real (`pnpm test:e2e`)
tests/                  # tráfico de red y render, medidos en Chrome
scripts/sw-check.mjs    # verificación en Chrome real por CDP (pnpm check:sw)
vite.config.ts          # plugins: [fudic()] — y nada más
```

## Qué demuestra cada ruta

| Ruta | Modo | Por qué | Cómo se sirve |
|---|---|---|---|
| `/` | estática | Sin params y sin `load`: el dato es build-known | Fichero `index.html` |
| `/about` | estática | Igual | Fichero `about/index.html` |
| `/blog` | `sw` | Tiene `@server load` y declara `strategy({mode:'sw', data:{ttl:'5m'}})` | Lo renderiza el Service Worker; el dato sale de `/_fudic/data/blog` |
| `/blog/:slug` | `sw` enumerada | `paths()` enumera los slugs → un `.html` por artículo | El fichero prerenderizado cuando existe; un slug no enumerado lo renderiza el SW (`paramFallback: 'lazy'`) |

Después de `vite build`, `dist/fudic-routes.json` es el manifest —build id, CSP y rutas—
que leen el servidor y el Service Worker. Los chunks enlazables viven en `dist/sw/c/`, en
formato `exports`/`require`: es lo único que el SW puede evaluar, porque su scope prohíbe
`import()`.

## El render en el Service Worker

Cada página incluye en su `<head>`:

```html
<script type="module" src="/fudic-main.js"></script>
```

Ese bootstrap (lo emite el plugin) hace dos cosas: registra el Service Worker y le dice en
qué URL está el usuario. Ese aviso es el **único** disparador de calentado: el SW se trae
el chunk de esa plantilla y sus dependencias por detrás de la navegación que ya se está
sirviendo. A partir de la siguiente, la pinta él.

No hay Web Worker. Medido en Chromium 151 y WebKit 26.5: un WW pertenece a su documento y
muere con él, así que un render pedido durante una navegación no termina nunca — el stream
se queda abierto. El Service Worker no pertenece a ningún documento.

La primera navegación siempre la sirve el servidor (o el fichero prerenderizado): mientras
la plantilla no esté caliente, el SW **no intercepta**, que es justo lo que evita duplicar
la petición del documento.

Para comprobarlo en un navegador de verdad:

```sh
pnpm --filter @fudic/example-basic build
pnpm --filter @fudic/example-basic preview   # http://localhost:4173
pnpm --filter @fudic/example-basic check:sw  # 14 comprobaciones sobre Chrome, por CDP
```

## Qué NO hay aquí

Hidratación. No se emite ningún `customElements.define` ni ningún runtime cliente: lo que
ves está pintado por el navegador desde el HTML con Declarative Shadow DOM, con cero
JavaScript de framework en la página. Los `@client` de un componente todavía no se
compilan (SDD-15 rama cliente en pausa, SDD-17 pendiente), por eso los componentes de este
ejemplo no los usan.
