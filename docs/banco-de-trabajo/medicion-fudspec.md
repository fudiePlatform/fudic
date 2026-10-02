# Medición de `.fudspec`: parser, validador, colorizer y LS

La v1 lo lleva todo: `role:`, `props`, fixtures, capas y comentarios.

| Pieza | Qué incluye | Tamaño estimado | Riesgo |
|---|---|---|---|
| **Parser** | Tokenizer de línea (posicionales, comillas, `#`) e indentación 0/2/4. Árbol `component → criterion → given/when/then → term(args)` con spans en todo y sin lanzar nunca. Referencias `tag` y `role:x/"nombre"`. | ~400 líneas + tests | bajo |
| **Validador** | Resuelve `<raíz>/<bloque>/<término>.js` en las dos capas. Lee `meta` y comprueba `name` y `block` contra el fichero y la carpeta, la aridad, los tipos (`number`, `string`, `element`…) y que `component` exista. Para `props`, comprueba que la fixture exista y que el componente con props obligatorias la tenga. Cada error es un `FUDnnnn`. | ~600 líneas + tests | **medio** |
| **Colorizer** | Gramática TextMate sin lenguajes embebidos: keywords por indentación, término, cadenas, números, comentarios y `role:`. Opcionalmente, semantic tokens para pintar distinto un término que no existe. | ~60 líneas de gramática (la de `.fud` tiene 470) | bajo |
| **Language server** | Diagnósticos (parser + validador), completado de términos (listando las carpetas), de argumentos (según `meta.params`), de tags y de fixtures, hover con `describe` e ir a la definición del `.js`. Se invalida cuando cambia un término o una fixture. | ~700 líneas + tests | **medio** |
| **Wiring VS Code** | Language id `fudspec`, extensión, `documentSelector` e icono. | ~30 líneas | bajo |

**Total:** unas 1.800 líneas de código, más o menos lo que ocupa hoy entero [packages/vscode](packages/vscode). Es un orden de magnitud menos que el `.fud`, porque no hay Oxc, ni modos, ni lenguajes mezclados, ni ficheros virtuales. Las cifras son estimaciones (la maqueta ya parsea en ~100 líneas), no algo medido.

## Las dos decisiones que mueven la cifra

1. **Cómo lee el validador el `.js`.** Si lo hace con `import()`, ejecuta código del usuario dentro del language server, y además la caché de módulos de Node no se entera de cuándo cambia el fichero. Si lo extrae de forma estática con Oxc (`meta` como objeto literal), no ejecuta nada y se recalcula al guardar. Recomiendo la extracción estática y exigir que `meta.name`, `meta.block` y `meta.params` sean literales. `describe` es una función y solo se usaría en el hover, sacando su texto, no ejecutándola.
2. **El servicio LSP, aislado.** Debe ser un servicio aparte que solo responda a URIs `.fudspec`. Meterlo dentro de [services/plugin.ts](packages/language-server/src/services/plugin.ts) (1538 líneas) lo convertiría de medio a alto. Del `.fud` solo comparte el `workspace-index`, para validar `component` y saber si el componente tiene props obligatorias.

**`@fudic/compiler` no cambia.** Todo esto vive en un paquete nuevo, `@fudic/spec`, al que se suman la gramática y el servicio del LS.
