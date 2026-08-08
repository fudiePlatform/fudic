---
name: implementar
description: Implementa un BUG o un SDD de docs/sdd/ por fases, en un worktree aislado, commiteando cada fase y marcando sus tareas. Úsalo cuando se pida implementar un BUG-NN o un SDD-NN.
---

# Implementar un BUG o un SDD

## Cómo se habla con Pedro — antes que cualquier otra cosa

**Máximo 10 líneas por respuesta.** Claro y concreto, en lenguaje llano.

- Nada de secciones, tablas ni negritas por todas partes. Frases seguidas.
- Sin nombres de fichero, sin `§`, sin códigos, sin citas de librerías. Eso va al commit,
  a la spec y al Task — no a la respuesta.
- Al reportar, la **primera línea dice el estado**: «arreglado, verde» o «está roto».
- Al cerrar, di qué hace distinto **el producto**, no qué ficheros tocaste.
- Si encuentras dos caminos, propón **uno** en una frase. El otro solo si pregunta.

Si te pasas de 10 líneas, no se entera — y entonces el trabajo no vale de nada.

Argumento: `BUG-13`, `SDD-26`, o la ruta del documento. Si no viene, pregunta cuál.

## 0. El documento y su Task

Son **dos** ficheros y se leen **enteros** antes de tocar nada:

- BUG → `docs/sdd/bugs/BUG-NN-*.md` + `docs/sdd/bugs/BUG-NN-Task.md`
- SDD → `docs/sdd/SDD-NN-*.md` + `docs/sdd/SDD-NN-Task*.md`

La spec dice **qué** y **cómo verificarlo**; el Task es el plan de fases y el único
control de progreso. Si el **Estado** del encabezado no es `Listo`, para y dilo.

No leas SDD hermanos: las *Dependencias* (§2) y la *Interfaz pública* (§3) bastan para
implementar de forma autocontenida. Si no bastan, eso es un hueco de la spec — repórtalo
(§2 de este skill).

## 1. Worktree, siempre

`EnterWorktree` con `name` = la **Rama sugerida** del encabezado. Si el documento dice
«la del backlog de uso» o no propone ninguna, pregunta antes de crear nada.

Luego, dentro del worktree: `pnpm install`. Un worktree nace **sin** `node_modules` y sin
él no corre ni un test.

**Nunca** se implementa en el working tree principal: puede haber otra sesión viva en él.

## 2. El bucle de fases

Por cada fase del Task, en su orden:

1. Al inicio de cada fase muestra las fases como **TODOS**.
2. Implementa **todas** sus tareas. Ninguna depende de fases posteriores; si parece que
   sí, es un fallo del Task y hay que decirlo.
3. Verifica: `typecheck` + `test` + `coverage` de los paquetes tocados (§4).
4. Marca `[x]` cada tarea de la fase y actualiza la línea `Progreso: N / M` del Task.
   Sin esto no hay forma de saber por dónde vamos.
5. **Commit** con todo lo de la fase, spec y Task actualizados incluidos (§5).
6. Escribe exactamente `Fase N — completada.` y pasa a la siguiente.

**Sin resúmenes al terminar una fase.** Ni recapitulación, ni lista de ficheros, ni
explicación de lo hecho: el commit ya lo cuenta.

Lo único que corta el bucle: encontrar una **contradicción, un hueco de diseño o un
criterio no verificable** en el documento. Entonces sí — dilo en dos líneas, con la
referencia al § afectado, y espera decisión. No lo arregles por tu cuenta.

## 3. Cobertura

- **Fichero nuevo:** 100/100/100/100 —`lines`, `functions`, `branches`, `statements`—
  desde su primer commit. No es una meta final: es la condición bajo la que se escribe.
- **Fichero existente:** nunca por debajo de lo que tiene **ahora**. No hay que llevarlo
  al 100 %: la deuda de `@fudic/compiler`, `@fudic/transport` y `@fudic/vite` es conocida
  y se salda en su propia tanda.
- **Código nuevo dentro de un fichero con deuda:** ese código sí nace al 100 %.
- Nada de `/* v8 ignore */` para llegar al número. Si una rama no se puede provocar, o
  sobra código o falta un test.

Antes de tocar un paquete con deuda, **mide el suelo**: `pnpm --filter <pkg> coverage` y
anota las cuatro cifras. Al cerrar la fase se compara contra ese suelo, no contra el
`thresholds` del `vitest.config`.

## 4. Comandos

Desde la raíz del worktree:

```sh
pnpm install      # obligatorio al crear el worktree
pnpm typecheck    # tsc --noEmit estricto, todos los paquetes
pnpm test         # vitest run
pnpm build        # incluye examples/basic: si el ejemplo se rompe, el build falla
pnpm coverage
```

Acotado a un paquete: `pnpm --filter @fudic/<pkg> <script>` — `test`, `test:watch`,
`typecheck`, `build`, `coverage`.

Paquetes: `cli` `compiler` `core` `dom` `formatter` `language-core` `language-server`
`ssr` `transport` `vite` (+ `fudic-vscode`, `@fudic/example-basic`).

### Cómo se escriben, para no pedir permiso a cada paso

`.claude/settings.json` ya trae permitidos `pnpm`, `git` y las utilidades de lectura
(`ls`, `cat`, `head`, `tail`, `grep`, `rg`, `wc`, `sort`, `uniq`, `diff`, `find`, `echo`).
Pero la regla casa contra el comando **entero**, y un comando compuesto se comprueba
trozo a trozo: basta con que uno no esté permitido para que se pregunte por el conjunto.
De ahí dos reglas:

- **Sin `cd`.** La sesión ya está dentro del worktree. Un `cd … && pnpm test` empieza por
  `cd`, así que la regla de `pnpm` ni se mira.
- **Tuberías, las que quieras, con programas de la lista.** `pnpm test | tail -40` pasa;
  `pnpm test | sed -n '1,20p'` pregunta, porque `sed` escribe y está fuera a propósito.

Fuera de la lista, y **es deliberado**: `sed`, `python`, `node`, `npx`. Modifican
ficheros o ejecutan código arbitrario, y abrirlos en blanco vacía la lista de sentido.
Si hace falta uno, se pide — que es justo lo que debe pasar.

## 5. Commits

- **En inglés**, asunto + cuerpo. **Sin** `Co-Authored-By`, firmas ni trailer alguno.
- Uno **por fase**, y dentro va también la spec/Task que esa fase modificó.
- Estilo del repo (`git log`): `fix(bug-12): …`, `feat(sdd-26): …`, `docs(sdd-29): …`.
- **No hagas push.** Se pide explícitamente cuando toca.

## 6. Cierre

La sección *Cierre* del Task, tarea a tarea: `pnpm typecheck`, `pnpm test` y `pnpm build`
en verde; los criterios extremo a extremo; marcar el BUG/SDD como `Hecho` en su `INDEX.md`
—**tabla y registro de progreso**—; y las anotaciones cruzadas en otros documentos que la
spec pida.

Commit final aparte. Después dilo listo para revisión y **quédate en el worktree**: no
salgas ni lo borres salvo que se pida.
