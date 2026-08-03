# BUG-12 — Tareas

> **BUG:** [BUG-12 — Un comentario Razor dentro de `@code` borra todo el bloque](./BUG-12-comentario-razor-en-code.md)
> **Paquetes:** `@fudic/compiler` · **Rama:** `fix/bug-12-comentario-en-code`
> **Progreso:** 0 / 8

Cada tarea es un paso cerrado: se implementa, se verifica y se marca. Ninguna depende de
tareas posteriores. Las rutas son relativas a la raíz del repo.

---

## Fase 0 — Rojo primero (3)

- [ ] **1. Test del comentario en las tres posiciones.**
      En `packages/compiler/test/emit/` (o `test/code/`): un componente con
      `const count = signal(0)` en `@client` y un `@* c *@` antes, dentro y después del
      bloque. Los tres casos emiten el módulo SSR con la signal inerte y el chunk con
      `signal(0)`. **Verlos fallar** los tres (§6.1, §6.2).
- [ ] **2. Test de que las props también caen.**
      Mismo componente con `props<{ x: number }>()`: con comentario, el destructuring
      desaparece del emit. **Verlo fallar** (§6.5) — es lo que prueba que la causa es el
      batch, no la región de cliente.
- [ ] **3. Test del fallo mudo.**
      Un `@code` con JS realmente roto (`const = ;`) produce al menos un diagnóstico con su
      span dentro del bloque. **Verlo fallar**: hoy devuelve un `ExtractedCode` vacío y
      cero diagnósticos (§6.3).

## Fase 1 — El troceado (2)

- [ ] **4. `#closeChunk` parte por regiones de comentario.**
      Modificar `packages/compiler/src/code/code.ts:229-236`: en vez de un span continuo
      `[#chunkStart, upTo)`, emitir un `neutral-js` por cada tramo **entre** las regiones de
      comentario que el `RegionCursor` ya conoce (`code.ts:141-147`). Sin reescribir texto y
      sin blanquear: los spans siguen siendo offsets del fuente (§3). Tramo en blanco, ningún
      part — la condición `NON_WHITESPACE` que ya existe. Verde en 1 y 2.
- [ ] **5. Un comentario que parece código no descuadra nada.**
      Cubrir §6.4: un `@* … { … @client { … } … *@` no abre región ni mueve `#depth`. Si el
      `RegionCursor` ya lo garantiza, el test lo deja escrito; si no, se arregla aquí.

## Fase 2 — El fallo deja de ser mudo (1)

- [ ] **6. `extractCode` propaga los diagnósticos del batch.**
      Modificar `packages/compiler/src/emit/oxc-code.ts`: hoy hace `batch.parse()` y descarta
      `result.diagnostics`. Devolverlos con `ExtractedCode`, mapeados al fuente original por
      `mapOffset`, y que el emit los propague como cualquier otro diagnóstico. Verde en 3.
      Si hace falta un código nuevo, se reserva en el rango de SDD-11 y se anota en SDD-12.

## Fase 3 — Cierre (2)

- [ ] **7. Los goldens no se mueven.**
      Ningún fixture tiene comentarios en `@code`, así que los cuatro goldens deben salir
      **byte a byte idénticos** (§6.6). Un golden que cambia es un fallo de la Fase 1.
- [ ] **8. Verde y cobertura.**
      `pnpm typecheck`, `pnpm test` y `pnpm build`. `code.ts` y `oxc-code.ts` no bajan de
      ramas. Comprobar además §6.7: un `@*` en el markup sigue funcionando.

---

## Cierre del BUG

- [ ] Devolver a los componentes de la demo de BUG-11 sus comentarios `@* … *@` en `@code`
      —se escribieron con ellos y hubo que quitarlos para esquivar esto— y ver el ejemplo
      construir.
- [ ] Marcar BUG-12 como `Hecho` en [INDEX.md](./INDEX.md) (tabla + registro de progreso).
