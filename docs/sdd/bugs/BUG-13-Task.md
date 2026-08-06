# BUG-13 — Tareas

> **BUG:** [BUG-13 — Un comentario Razor dentro de `@code` borra todo el bloque](./BUG-13-comentario-razor-en-code.md)
> **Paquetes:** `@fudic/compiler` · **Rama:** `fix/bug-13-comentario-en-code`
> **Progreso:** 3 / 9

Cada tarea es un paso cerrado: se implementa, se verifica y se marca. Ninguna depende de
tareas posteriores. Las rutas son relativas a la raíz del repo.

> **Replanteado a mitad (decisión de Pedro).** El plan original hacía funcionar el comentario
> troceando el chunk. La decisión de §3 del BUG lo invierte: dentro de `@code` se comenta en
> JavaScript, y `@* … *@` allí es un error. Las tareas 4–6 se reescribieron con eso; las 1–3
> (rojo primero) ya estaban hechas y sus tests se reorientan en la tarea 4.

---

## Fase 0 — Rojo primero (3)

- [x] **1. Test del comentario en las tres posiciones.**
      En `packages/compiler/test/emit/` (o `test/code/`): un componente con
      `const count = signal(0)` en `@client` y un `@* c *@` antes, dentro y después del
      bloque. **Verlos fallar** los tres (§7.1, §7.2).
- [x] **2. Test de que las props también caen.**
      Mismo componente con `props<{ x: number }>()`: con comentario, el destructuring
      desaparece del emit. **Verlo fallar** — es lo que prueba que la causa es el batch, no
      la región de cliente.
- [x] **3. Test del fallo mudo.**
      Un `@code` con JS realmente roto (`const = ;`) produce al menos un diagnóstico con su
      span dentro del bloque. **Verlo fallar**: hoy devuelve un `ExtractedCode` vacío y
      cero diagnósticos (§7.3).

## Fase 1 — El comentario deja de descuadrar el bloque (2)

- [ ] **4. El balanceador aprende `razor-comment`, opt-in.**
      `packages/compiler/src/balancer/balancer.ts`: `LexRegionKind` gana `'razor-comment'` y
      `scanBalanced`/`scanBraces` un parámetro opcional `{ razorComments?: boolean }`. Con él
      activo, `@*` abre región opaca hasta el primer `*@` (decisión 36) y sus llaves dejan de
      contar. Sin él, byte a byte lo de hoy: los demás llamantes de SDD-02 no se enteran
      (§4, §7.8). `parseCodeBlock` lo activa en los dos `scanBraces` que hace — el del bloque
      y el de cada región.
- [ ] **5. `FUD0114` por cada comentario del bloque.**
      `packages/compiler/src/code/code.ts`: recorrer las regiones `razor-comment` que el
      balanceador ya devuelve y emitir un `FUD0114` por cada una, con el span completo del
      comentario. Sale gratis para las tres posiciones: el escaneo del cuerpo cubre también
      el interior de `@server`/`@client` (§5.1). El texto **no** se recorta: `CodePart` no
      cambia (§4). Verde en §7.1, §7.2, §7.4 y §7.5.

## Fase 2 — El fallo deja de ser mudo (2)

- [ ] **6. `extractCode` propaga los diagnósticos del batch.**
      `packages/compiler/src/emit/oxc-code.ts`: hoy hace `batch.parse()` y descarta
      `result.diagnostics`. `ExtractedCode` gana `diagnostics`, ya mapeados al fuente por
      `mapOffset` (el batch los devuelve así). Verde en §7.3.
- [ ] **7. El emit los saca por `EmitOutput`.**
      `EmitOutput` gana `diagnostics`; los emisores de componente y de chunk de cliente los
      pasan; `packages/vite/src/transform.ts` los une a los que ya lleva `TransformResult`,
      que el plugin convierte en error de build. Es lo que hace que un `@code` roto pare el
      build en su sitio y no como `ReferenceError` en el prerender (§5.3).

## Fase 3 — Cierre (2)

- [ ] **8. Los goldens no se mueven y los comentarios JS siguen bien.**
      Ningún fixture tiene comentarios en `@code`, y el troceado no se ha tocado, así que los
      cuatro goldens deben salir **byte a byte idénticos** (§7.7). Y el test de §7.6: `//` y
      `/* */` en las tres posiciones, sin diagnóstico y sin perder nada.
- [ ] **9. Verde y cobertura.**
      `pnpm typecheck`, `pnpm test` y `pnpm build`. `code.ts`, `balancer.ts` y `oxc-code.ts`
      no bajan de ramas; lo nuevo al 100 %. Comprobar además §7.8: un `@*` en el markup sigue
      funcionando.

---

## Cierre del BUG

- [ ] Anotar la decisión **35.a** en [gramatica-v1-decisiones.md](../../gramar/gramatica-v1-decisiones.md)
      (sección 9) y `FUD0114` en [SDD-08](../SDD-08-code-block.md) §5 y en
      [SDD-12](../SDD-12-semantica.md) §catálogo.
- [ ] Devolver a los componentes de la demo de BUG-12 sus comentarios —**ahora como
      comentarios JS**— y ver el ejemplo construir.
- [ ] Marcar BUG-13 como `Hecho` en [INDEX.md](./INDEX.md) (tabla + registro de progreso).
