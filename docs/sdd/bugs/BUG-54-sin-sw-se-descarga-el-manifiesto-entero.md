# BUG-54 · Sin Service Worker, cada página descarga el manifiesto entero

> **Estado:** `Hecho` — Pedro pidió no redactarlo hasta probarlo en el navegador. [tareas](./BUG-54-Task.md).
> **Corrige:** [BUG-53](./BUG-53-precarga-sin-sw-a-medias.md) §4.3 (el canal sin Service Worker
> leía el grafo del manifiesto).
> **Paquetes:** `@fudic/vite` · `@fudic/transport` · `examples/basic`

---

## 1. Síntoma

Sin Service Worker, cada página que hidrata descargaba `fudic-routes.json`: unos 24 kB en
`examples/basic`, de los que 22 kB son el campo `hydrate`, el grafo de **todos** los tags de la
aplicación. La página solo necesita el de los tags que puede calentar.

## 2. Causa

BUG-53 §4.3 hizo que el coordinador sin Service Worker pidiera el manifiesto una vez por página
para saber qué precargar con cada tag. Con Service Worker es el worker quien lo lee, y el
manifiesto ya lo tiene; sin él, la página lo bajaba entero para usar una parte pequeña.

## 3. Corrección

1. El coordinador de una página sin Service Worker **lleva escrito** el grafo de los tags que su
   ruta puede calentar: sus componentes hidratables y, si la ruta es reactiva, su propio chunk.
   Ya no pide el manifiesto ni importa su lector.
2. El build escribe ese grafo cuando ya existe, sustituyendo un marcador en el coordinador; también
   en una página que lleva el coordinador incrustado en su `<head>`, donde el marcador aparece
   dentro de una cadena.
3. Con Service Worker no cambia nada: el worker sigue leyendo el manifiesto.
4. La pieza `transport/urls` deja de llevar el lector del manifiesto, que ya no usa ninguna
   página.

## 4. Criterios de aceptación

1. Sin Service Worker, ningún coordinador ni ninguna página del build contiene el marcador ni
   nombra `fudic-routes.json`.
2. El grafo escrito en el coordinador es, tag a tag, el mismo que el manifiesto da para ese tag,
   también con el coordinador incrustado en el `<head>`.
3. `/usuarios` sin Service Worker: cargar y calentar no piden el manifiesto, y el primer clic tras
   el calentado no pide ningún `.js` (criterio 1 de BUG-53, en verde).
4. Con Service Worker, el coordinador no lleva grafo y la página no lo pide.
