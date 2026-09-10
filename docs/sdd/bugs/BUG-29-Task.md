# BUG-29 — Tareas

> **BUG:** [BUG-29 — el cuerpo de un `<script>` se tiraba en silencio](./BUG-29-script-en-linea-sin-diagnostico.md)
> **Paquetes:** `@fudic/compiler`
> **Rama:** `sdd-37-delegacion-de-eventos` · **Depende de:** SDD-12 y SDD-15 en `Hecho`
> **Progreso:** 5 / 5 — `Hecho`

Cinco tareas. Rutas relativas a la raíz del repo.

**El orden manda:** primero la pregunta que las tres partes comparten —qué `<script>` es de
datos—, porque calculada por separado en el emit de servidor, el de cliente y el analizador es
una pregunta que diverge; y la divergencia sería un JSON-LD que el servidor pinta, el cliente
no fabrica y la hidratación no reconoce. Este BUG se arregló primero y se redactó después.

---

## Fase 1 — La pregunta, una sola vez (1)

- [x] **1. `dataScriptType` en [`html/nodes.ts`](../../../packages/compiler/src/html/nodes.ts).**
      `DATA_SCRIPT_TYPES` cerrado —`application/ld+json`, `importmap`— y la función que lee el
      `type` de un elemento: recortado, sin distinguir mayúsculas como un MIME, y `undefined`
      para un `type` interpolado, que no se puede leer al compilar. Vive en `html/` porque es
      un hecho sobre HTML y porque lo consultan los tres.

## Fase 2 — Que los datos salgan (2)

- [x] **2. El emit de servidor.**
      `#rawBody` en [`emit/markup.ts`](../../../packages/compiler/src/emit/markup.ts): el
      cuerpo verbatim, sin escapar. Decide el ELEMENTO y no la tabla `SERVER_ROLE`, porque un
      `raw-text` conoce el elemento al que pertenece y no su `type`, y el `type` es toda la
      pregunta. Eso mismo es lo que deja fuera al `<style>`, cuyo cuerpo viaja por otra puerta.
- [x] **3. El emit de cliente.**
      `#children` en [`emit/markup-client.ts`](../../../packages/compiler/src/emit/markup-client.ts):
      `c` fabrica el mismo texto, `h` no fabrica nada —el nodo vuelve dentro de su elemento y
      el cursor del nivel recorre elementos—. Las dos ramas acaban con el mismo árbol.

## Fase 3 — Que el código lo diga (1)

- [x] **4. El analizador, por las dos puertas.**
      [`semantic/analyzers/script-body.ts`](../../../packages/compiler/src/semantic/analyzers/script-body.ts):
      `checkScriptBody` sobre markup solo y `scriptBody` que la envuelve —el patrón de
      `checkSlotName`—, registrado en `ANALYZERS` **y** llamado desde `contractDiagnostics` en
      [`emit/registry.ts`](../../../packages/compiler/src/emit/registry.ts), que es la única
      puerta del build a los analizadores. Sobre el cuerpo y con el span del cuerpo; los tipos
      de datos salen antes de mirarlo.

## Fase 4 — Que se vea (1)

- [x] **5. Tests y comprobación en el ejemplo.**
      Diez casos en [`test/semantic/analyze.test.ts`](../../../packages/compiler/test/semantic/analyze.test.ts),
      dos en [`test/emit/registry.test.ts`](../../../packages/compiler/test/emit/registry.test.ts)
      para la puerta del build, y seis en
      [`test/emit/data-script.test.ts`](../../../packages/compiler/test/emit/data-script.test.ts),
      que **renderiza el módulo y lee el HTML** — porque el defecto era invisible en cualquier
      otra forma: el módulo estaba bien, el tag salía, y el cuerpo no—. `script-body.ts` al
      **100 %** en las cuatro métricas. Comprobado además en `examples/basic` con una ruta y un
      layout de prueba: el `<script>` de código hace fallar `vite build` con `[FUD0161]`, el
      JSON-LD y el import map salen verbatim, y el import map desde el **layout** precede al
      módulo del arranque (offset 73 contra 175) mientras que desde la ruta no. Retirados los
      dos ficheros, el build vuelve a estar limpio.
