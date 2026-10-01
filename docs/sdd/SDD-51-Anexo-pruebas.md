# SDD-51 — Anexo: cómo probarlo

> Anexo de [SDD-51](./SDD-51-expresiones-de-la-vista.md). Rama `worktree-sdd-51-expresiones-de-la-vista`.

## Estado

Implementado. `pnpm build` y `pnpm typecheck` están en verde. Falla un test de Vite (ver abajo).
Quedan para otra sesión los tests, la cobertura, la gramática (tarea 14) y el cierre. No se ha
marcado ninguna tarea en el Task.

## En el navegador

1. `pnpm dev` en `examples/basic` y abre `/vista` (en la navegación sale como «Vista»).
2. Ahí está todo lo permitido y el guardia de URL. Pasa el ratón por cada enlace para ver su
   destino real. La tercera columna enseña lo que escribe el guardia.
3. Al final, el componente `vista-url.fud` cambia la URL con botones: es el guardia del
   navegador. En desarrollo, cada sustitución avisa por consola.

## En VS Code

1. Abre `examples/vista-errores/vista-errores.fud`. Cada caso lleva encima un comentario Razor
   con el código que debe salir y qué subraya.
2. Está fuera de `examples/basic` porque, con errores dentro, el build de `basic` fallaría.
3. Para ver los FUD09xx hace falta la extensión construida desde este worktree: la instalada es
   la antigua.

## Un bug que había antes, ya arreglado

Lo que declaraba un `@{ }` daba «nombre no encontrado» en el editor y en el build, aunque en
ejecución funcionaba. La proyección lo metía entre llaves; ahora lo copia en su sitio, como el
emit.

## El test roto, y qué hay que decidir

`packages/vite/test/build-di.test.ts` → «pays for no file of it either: DI only ever ADDS to an
output».

**Qué comprueba.** Que una app sin DI no tenga ningún fichero que la misma app con DI no tenga.

**Por qué falla.** Ahora el servidor (`SsrDom.setUrl`) y el navegador (`browserDom.setUrl`)
importan la misma función del guardia, como pide la spec en §3.7. En la build, los chunks de
render del servidor viven en el mismo grafo que los del cliente y se retiran al final. Un módulo
que comparten acaba en un fichero propio: en la app sin DI aparece `assets/url.js`, y en la app
con DI va dentro de otro chunk. Por eso las dos listas de ficheros ya no coinciden.

**Cuándo pasa.** Solo cuando el runtime va empaquetado en la app, que es lo que hace ese test.
En `examples/basic`, que enlaza el runtime publicado, no aparece ningún fichero extra.

**Coste.** Una petición más, de un fichero pequeño, en las apps que empaquetan el runtime.

**Propuesta.** Aceptar ese fichero y ajustar el test. La alternativa sería copiar la función en
`@fudic/ssr`, que rompe la regla de «la misma función» de §3.7.
