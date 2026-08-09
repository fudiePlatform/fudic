# BUG-17 — Tareas

> **BUG:** [BUG-17 — La `key` de un bucle es sintaxis nueva sin mitad de editor](./BUG-17-key-sin-editor.md)
> **Paquetes:** `@fudic/language-core` · `@fudic/language-server` · `@fudic/formatter` ·
> `fudic-vscode`
> **Rama:** `bug-17-editor-key`
> **Depende de:** [SDD-30](../SDD-30-renders-de-bloque.md) **solo para el campo del AST**, y solo
> las fases 1, 2 y 4. La fase 3 —la cabecera no es markup— no lo necesita y arregla un defecto
> que ya está vivo hoy (§1.2.a del BUG)
> **Progreso:** 7 / 11 — la 1b no estaba en el plan; la puso el hueco de §4.1.1

Cada tarea es un paso cerrado. Las rutas son relativas a la raíz del repo.

El orden manda en tres puntos. **La 3 puede ir primero y sola**: es el único defecto observable
hoy sin SDD-30, así que si esa rama se retrasa, esta fase entra igual y se cierra. **La 1 antes
que la 2**: la lista contra el servicio de TypeScript no se puede medir hasta que el tramo
exista, y medirla contra el texto emitido es lo que BUG-16 §4 enseñó a no hacer. Y **la 6 antes
que la 9**: el snippet escribe la sintaxis que el formateador tiene que saber reimprimir.

---

## Fase 0 — Comprobar que el AST trae la key (1)

- [x] **0. La dependencia, verificada antes de escribir nada.**
      `ForeachNode`, `ForNode` y `WhileNode` traen el campo de la key con `span` e `inner`, igual
      que las cabeceras (§3.5). Si no está, el BUG se queda `Bloqueado` y esta tarea es lo único
      que se hace: **no** se inventa el campo aquí ni se toca el parser, que es de SDD-30.
      **Está**: `KeyedNode.key?: RazorExpression`, con `span` de la cláusula entera y `expr` del
      JS, declarado por los cinco constructos. El BUG pasa a `Listo`.

      Y el suelo de cobertura, medido antes de tocar: la tanda de SDD-30 dejó **su propio código
      de key sin un solo test**, así que los dos paquetes que este BUG toca están hoy **por
      debajo** del 100 % que su §6 exige — `@fudic/formatter` en 99,66 % de ramas (la guarda de
      `keyClause`) y `@fudic/language-core` en 99,6 / 99,55 (las dos líneas que copian la key).
      No es deuda heredada que se salde aparte: son exactamente las líneas de las fases 1, 2 y 4,
      y el rojo que esas fases piden ver ya está puesto por el informe de cobertura.

## Fase 1 — Rojo primero: la key no llega a la proyección (3)

- [x] **1. Ver que la key no existe para el editor.**
      En `packages/language-core/test/`, proyectar
      `@foreach (const item of collection) key (item.id) { … }` y afirmar que hay un tramo copiado
      con el span de `item.id`. **Verlo fallar**: hoy `emitLoop` proyecta cabecera y cuerpo y nada
      más (§2.1, §6.1). Mismo test para las cuatro formas de cabecera de §1.1 (§6.2).
      Cinco rojos, todos por el envoltorio que falta.
- [x] **1b. El parser conserva una cláusula vacía** — tarea que este Task no tenía y sin la cual
      el criterio §6.5 es inalcanzable (§4.1.1 del BUG). `key ()` no producía nodo, así que
      `key (|)` —lo que el editor enseña en cuanto el `)` se autocierra— no dejaba **ninguna**
      posición desde la que preguntar. Una cláusula que abrió paréntesis deja siempre nodo, con
      `expr` vacío; una sin cerrar degrada al hueco tras el `(` en vez de tragarse el fichero;
      `key` sin paréntesis sigue sin nodo, que ahí no se abrió nada. `FUD0541` no se mueve.
      Y como el campo pasa a servir a dos audiencias, la distinción tiene un dueño:
      `keyExpression(node)` da el span solo cuando hay JS, y por él pasan las dos piezas del emit
      que escriben la identidad de un bloque — un span vacío sliceado escribe `key: ,`.
- [x] **2. `$key` en las globales.**
      `packages/language-core/src/globals.ts`: `declare function $key(k?: unknown): void;`.
      `unknown` es la decisión, no un hueco: la reconciliación usa un `Map` y la identidad de
      objeto es clave válida — ofrecer no es validar (§3.1). Cero códigos `FUD` nuevos.
      **Opcional**, además: con el parámetro obligatorio, un `key (|)` a medias cobra `TS2554`
      sobre un tramo que el autor no escribió, y de que está sin terminar ya se encarga `FUD0541`.

## Fase 2 — La proyección: la key entra en el cuerpo (2)

- [x] **3. `emitControl` emite `$key(…)`.**
      `packages/language-core/src/template/control.ts`: primera sentencia del cuerpo del bucle,
      con la expresión **copiada** del fuente. Dentro y no fuera, que es donde lo que declara la
      cabecera ya existe — y por eso ninguna forma de cabecera necesita una rama propia (§4.1,
      §6.1–§6.3). Un bucle sin key sigue proyectando byte a byte lo de hoy (§6.4). Verde en 1.
      Envuelta en una llamada y no suelta: un argumento es una posición con tipo esperado, y una
      sentencia vacía no es nada — que es la diferencia entera en `key (|)`.
- [x] **4. Medido contra el servicio de TypeScript de verdad**, no contra el texto emitido.
      En `key (item.|)` la lista son las propiedades del elemento; en `key (|)` viene `item`; en
      `key (item.i|)` el rango de reemplazo cubre `i` y **nada más**; `item.nope` reporta `TS2339`
      en coordenadas del `.fud`; F12 y renombrado van a la cabecera; y un `@foreach` anidado ve
      las variables de los dos (§6.5–§6.9).
      El corpus gana `fixtures/components/app-list.fud`: un `@foreach` con key dentro de otro, de
      modo que el anidamiento es un hecho del corpus —typechequea con cero errores— y no la
      cadena de un solo test.

## Fase 3 — La cabecera de control no es markup (2)

> Esta fase **no depende de SDD-30**. Es el defecto que ya está vivo: en `@if (us|)` se ofrecen
> `<ul>`, la abreviatura de Emmet y los componentes del workspace.

- [x] **5. Rojo primero, y luego la guarda.**
      `packages/language-server/src/services/emmet.ts`: `isMarkupOffset` excluye también el
      interior de los paréntesis de los cinco constructos y el de `key ( … )`, del mismo modo que
      ya excluye `@code`, un cuerpo `raw` y una interpolación. Una sola función, tres voces
      calladas: `scopeAt` se apoya en ella (§2.2, §4.3, §6.10, §6.11).
      Ocho rojos vistos antes del arreglo. La zona la da el **nodo**, no el texto, así que el
      walk del compilador gana una llamada `control(node)` —descendía por dentro de los
      constructos sin entregar ninguno— y el servidor pregunta por los spans de las cabeceras de
      **cada arma** más el de la cláusula. Los paréntesis son el límite y quedan fuera: sobre el
      `(` el autor aún está escribiendo `@if `, y pasado el `)` empieza el cuerpo.
- [x] **6. Lo de fuera no se mueve.**
      `@fore|` en markup sigue ofreciendo `@foreach` y una palabra suelta sigue fusionando con
      Emmet. Los tres contextos se piden **con `context`**, como los pide un editor (§6.12,
      §6.13).
      Medido dentro del cuerpo de una rama, que es el sitio donde un fallo de límite se vería:
      ahí siguen llegando los tags del workspace **y** la expansión de Emmet, y el `@` sigue
      siendo la transición de siempre.

## Fase 4 — Formatear no borra la key (2)

- [ ] **7. Rojo primero: el formateador la pierde.**
      Formatear un bucle con key y afirmar que vuelve con ella. **Verlo fallar**: `printLoop`
      concatena por campos conocidos y el campo nuevo no está (§2.3, §6.14).
- [ ] **8. Idempotencia como criterio, no «imprime la key».**
      `packages/formatter/src/print/control.ts`: la key tras el paréntesis de la cabecera y antes
      del cuerpo, en los tres bucles. El test que se queda es que **formatear dos veces da el
      mismo texto** — la afirmación que sobrevive a que mañana el AST crezca otra vez. Un bucle
      sin key se formatea como hoy (§6.15, §6.16).

## Fase 5 — El snippet de la extensión (1)

- [ ] **9. `@foreach`, `@for` y `@while` con su `key (…)`.**
      `packages/vscode`: el snippet escribe la forma completa con su tabstop, de modo que
      aceptarlo deja un fichero que compila y no uno que nace en `FUD0540` (§4.5, §6.17).

---

## Cierre del BUG

- [ ] `pnpm typecheck`, `pnpm test` y `pnpm build` en verde en todo el workspace.
- [ ] `language-core`, `language-server` y `formatter` siguen al **100 %** en las cuatro métricas.
- [ ] Los criterios de SDD-24, BUG-15 y BUG-16 siguen verdes (§6.18).
- [ ] Marcar BUG-17 como `Hecho` en [INDEX.md](./INDEX.md) (tabla + registro de progreso).
- [ ] Anotar en [SDD-23 §4.4](../SDD-23-emisor-ts-virtual.md) la fila de la key, y en
      [SDD-24 §4.2](../SDD-24-language-server.md) que una cabecera de control no es markup.
- [ ] Anotar en [SDD-30 §7](../SDD-30-renders-de-bloque.md) que su mitad de editor la cierra este
      BUG — que es lo que evita que la próxima sintaxis nueva vuelva a salir sin dueño.
