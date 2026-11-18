# Hallazgos del framework

Lo que la web encuentra en Fudic y no es de la CLI (esos van en
[hallazgos-cli.md](hallazgos-cli.md)): el compilador, el runtime, el servidor o la guía de
estilos. Mismo formato: qué pasó, cómo se resolvió en la web y qué debería hacer Fudic.

## 1. El servidor no comprime

- **Qué pasó.** Lighthouse sobre `fudic preview` marca `uses-text-compression`: el HTML de
  `/docs/getting-started` (39 KB) sale sin comprimir, y se podrían ahorrar 28 KiB. En
  `packages/server/src` no hay rastro de `gzip`, `brotli` ni `content-encoding`. Es lo que más
  pesa en el rendimiento móvil que queda (92).
- **Cómo se resolvió.** No se ha resuelto. En producción lo puede hacer un CDN o un proxy inverso,
  pero entonces el 100 de Lighthouse depende de algo que no es Fudic.
- **Qué debería hacer.** Comprimir con brotli o gzip según `Accept-Encoding`, y los estáticos
  precomprimidos en el build (`.br`, `.gz`) para no comprimir en cada petición.

## 2. Un componente que se hidrata al cargar entra en la cadena crítica (por confirmar)

- **Qué pasó.** `ui-toc` usa `onConnect`, así que se hidrata al cargar. La página lleva un
  `modulepreload` de prioridad alta por cada módulo del runtime que necesita (`hydrate.js`,
  `registry.js`, `element.js`, `signal.js`… quince en total), y Lighthouse los cuenta en la
  cadena de dependencias de red del primer pintado en móvil (2,6 s).
- **Cómo se resolvió.** No se ha resuelto. Falta medir la misma página sin `ui-toc` para saber
  cuánto pesa de verdad.
- **Qué debería hacer, si se confirma.** Que lo que se hidrata al cargar no compita con el primer
  pintado: precargas con `fetchpriority="low"`, o pedirlas después del primer pintado.
