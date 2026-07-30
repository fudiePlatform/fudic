# BUG-07 — Tareas

> **BUG:** [BUG-07 — Ningún HTML emitido pasa por minificación](./BUG-07-html-sin-minificar.md)
> **Paquete:** `@fudic/compiler` · **Rama:** worktree `fix-build-output`
> **Depende de:** nada; va después de BUG-05 y BUG-06 por prioridad
> **Progreso:** 0 / 7

Cada tarea es un paso cerrado. Las rutas son relativas a la raíz del repo.

**Implementación propia, en el emit** (§4.1): sin dependencias nuevas y sin pasada de texto
sobre el HTML ya generado. El orden de las fases es por rentabilidad — la fase 1, el
polyfill, es el 31 % de cada página y no arriesga nada.

---

## Fase 1 — El polyfill (3)

- [ ] **2. Rojo primero: el polyfill sale legible.**
      En `packages/compiler/test/`: el HTML emitido para una página contiene
      `var registerStyle = function` y comentarios. **Verlo pasar en verde hoy** — es la
      afirmación que la corrección invierte (§6.1).
- [ ] **3. Se incrusta minificado.**
      `packages/compiler/src/emit/polyfill.ts` conserva su constante legible; lo que
      consumen `module.ts:181` y `layout.ts:245` es su versión minificada, calculada en el
      build de `@fudic/compiler`. Verde en 2, invertido.
- [ ] **4. Sigue siendo el mismo polyfill.**
      Los tests de SDD-18 sobre adopción de estilos corren contra el texto **emitido**, no
      contra la constante fuente (§6.2). Es lo único que impide que «minificar» se convierta
      en «romper el FOUC sin enterarse».

## Fase 2 — El esqueleto (1)

- [ ] **5. Fuera los `\n` literales del esqueleto.**
      `packages/compiler/src/emit/module.ts:193` y
      `packages/compiler/src/emit/layout.ts:151`, más la indentación del `<head>`. No
      renderizan en ningún contexto, así que no aplica ninguna cautela de §4.4 (§4.2).

## Fase 3 — El markup (1)

- [ ] **6. `spaceModeOf` y el colapso en el emisor de texto.**
      `packages/compiler/src/emit/markup.ts:79-83` emite hoy `$dom.text(JSON.stringify(v))`
      con el valor verbatim: ahí va el colapso, con el modo heredado del elemento que
      contiene el texto (§3, §4.4). `preserve` para `<pre>` y `<textarea>`, y para un
      componente cuyo `<style>` declare `white-space: pre*` —el CSS ya está parseado en
      `packages/compiler/src/css/nodes.ts`—; `collapse` para el resto. Tag desconocido =
      custom element = inline: se colapsa a **un espacio**, nunca se elimina el nodo (§4.5).
      Documentar el atributo de escape para el caso heredado, que no se puede deducir.

## Fase 4 — Que no se haya roto nada (1)

- [ ] **7. El DOM no cambia.**
      Contar nodos de texto antes y después: misma cifra (§6.5). Y comparar
      `document.body.innerHTML` normalizado entre el build anterior y el nuevo en las cinco
      páginas: sin diferencias (§6.6). Los 16 tests de `examples/basic/tests/` en verde, y
      Lighthouse sin el aviso del HTML (§6.8).

---

## Cierre del BUG

- [ ] `pnpm typecheck`, `pnpm test` y `pnpm build` en verde.
- [ ] Cobertura al **100 %** de lo nuevo — un colapsador de whitespace es exactamente el tipo
      de código donde las ramas no probadas son los casos raros que rompen páginas.
- [ ] **Tamaños anotados en el registro de progreso**, raw y gzip, de los cinco `.html`,
      antes y después (§6.7). Sin la medición este BUG no se cierra.
- [ ] Marcar BUG-07 como `Hecho` en [INDEX.md](./INDEX.md) (tabla + registro de progreso).
- [ ] Anotar en [SDD-19](../SDD-19-plugin-vite.md) §4.4 que el HTML se emite ya minificado
      desde el compilador, y en SDD-15 la regla de §4.4/§4.5: se colapsa a un espacio, no se
      elimina ningún nodo, y un tag desconocido cuenta como inline.
