# `@fudic/example-basic`

La aplicación mínima que demuestra **todo lo que fudic tiene montado hoy** (todo menos la
hidratación, SDD-15 cliente y SDD-17, que aún no existen): routing por sistema de
ficheros, los dos modos de SSG, componentes con CSS con scope, assets enlazados por Vite
y el shell de tres hilos (main → Service Worker → Web Worker).

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
    index.fud           # /blog                incremental (tiene @server load)
    [slug].fud          # /blog/:slug          enumerada con paths() + fallback incremental
components/             # componentes compartidos, FUERA de routes/
  site-nav.fud
  app-card.fud          # enlaza a su vez app-badge.fud
  app-badge.fud
data/posts.ts           # la "base de datos"; solo la ve el servidor
vite.config.ts          # plugins: [fudic()] — y nada más
```

## Qué demuestra cada ruta

| Ruta | Modo | Por qué | Cómo se sirve |
|---|---|---|---|
| `/` | estática | Sin params y sin `load`: el dato es build-known | Fichero `index.html` |
| `/about` | estática | Igual | Fichero `about/index.html` |
| `/blog` | incremental | Tiene `@server load`: el build no puede probar que sea estático | Web Worker, cacheado por el SW |
| `/blog/:slug` | estática enumerada | `paths()` enumera los slugs → un `.html` por artículo | Fichero; un slug no enumerado cae al Web Worker (`paramFallback: 'lazy'`) |

Después de `vite build`, `dist/fudic-routes.json` es el manifest que cargan el Service
Worker y el Web Worker desde la misma URL absoluta.

## Los tres hilos

Cada página incluye en su `<head>`:

```html
<script type="module" src="/fudic-main.js"></script>
```

Ese bootstrap (lo emite el plugin) registra el Service Worker **y crea el Web Worker**,
pasándoles los dos extremos de un `MessageChannel`. A partir de ahí el SW responde a cada
navegación: cache hit, o render delegado al WW y cacheado.

El hilo principal es quien crea el Web Worker porque el scope de un Service Worker no
expone `Worker` ni permite `import()` — verificado en Chrome. Consecuencia visible: una
ruta incremental necesita una pestaña de la app viva (se llega a ella navegando desde una
página del sitio). Si escribes `/blog` en una pestaña recién abierta sin Service Worker
todavía activo, responde el servidor — y para una ruta incremental eso es un 404. El
recorrido natural (entrar por una página estática y navegar) funciona en dev y en el
build.

## Qué NO hay aquí

Hidratación. No se emite ningún `customElements.define` ni ningún runtime cliente: lo que
ves está pintado por el navegador desde el HTML con Declarative Shadow DOM, con cero
JavaScript de framework en la página. Los `@client` de un componente todavía no se
compilan (SDD-15 rama cliente en pausa, SDD-17 pendiente), por eso los componentes de este
ejemplo no los usan.
