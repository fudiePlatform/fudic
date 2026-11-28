---
name: arreglar-hallazgos
description: Arregla los hallazgos de docs/web/hallazgos-fudic.md y hallazgos-cli.md paquete a paquete, en tandas, sin SDD ni BUG, con un ejemplo que Pedro valida, tests solo de lo tocado y marcándolos como resueltos. Úsalo cuando Pedro pida arreglar hallazgos, un paquete o «el siguiente».
---

# Arreglar hallazgos

## Cómo se habla con Pedro

En español, breve y claro, sin folios. Sin preguntas cuando la decisión está clara. El código, sus
comentarios y los commits, en inglés; los commits sin trailers ni `Co-Authored-By`.

## Dónde está todo

- `docs/web/hallazgos-fudic.md`: los hallazgos del framework, con número solo («51»).
- `docs/web/hallazgos-cli.md`: los de la CLI, que aquí se escriben «CLI-n».
- `docs/web/hallazgos-por-paquete.md`: la clasificación por paquete, las decisiones pendientes y,
  al principio, la tabla **Avance**, que es donde Pedro sigue lo que queda.

Antes de empezar, lee la sección del paquete en `hallazgos-por-paquete.md` y cada hallazgo entero
en su fichero. Un hallazgo con decisión pendiente se le pregunta antes, con una recomendación.

## No se hace

- Ni SDD, ni BUG-NN, ni tasks, ni la skill `implementar`. Pedro solo escribe un SDD cuando lo pide
  él para una funcionalidad nueva.
- Ni la suite completa ni la cobertura en cada arreglo. La suite de `@fudic/vite` lanza builds de
  verdad y tarda unos 4 minutos; la del compiler, uno. Se pasan **una vez, al cerrar el paquete**.
- Ni `git stash` mientras corre algo en segundo plano: si se para a medias, los cambios se quedan
  en el stash.
- Ni empaquetar tarballs para probar: el ejemplo usa el `dist` del repo (abajo).

## El flujo, por tandas

1. **Escoge la tanda.** Del paquete en curso, de tres a seis hallazgos fáciles juntos; uno difícil
   (los que la clasificación pone en «Difíciles») va solo. Di a Pedro cuáles en una línea.
2. **Arréglalos**, uno detrás de otro. Un hallazgo puede tocar otro paquete (los «→» de la
   clasificación): arregla también esa parte si es pequeña, o déjala apuntada como ◐.
3. **Reconstruye** lo tocado: `pnpm --filter @fudic/<paquete> build` (vite, cli y el resto de
   consumidores leen el `dist`). `npx tsc --noEmit -p tsconfig.json` en el paquete.
4. **Prepara un ejemplo** que enseñe todos los de la tanda, en el scratchpad:
   ```sh
   bash .claude/skills/arreglar-hallazgos/scripts/ejemplo.sh <repo> <scratchpad>/ej [tutorial]
   ```
   Enlaza cada `@fudic/*` al paquete del repo con `link:`, así que basta con reconstruir el paquete
   para que el ejemplo lo vea; si la carpeta ya existe, la reutiliza. Con un slug parte de
   `tutorials/<slug>/` (el tutorial donde salió el hallazgo suele ser el mejor punto de partida);
   sin él, de `fudic new`. Cuando el hallazgo es de la propia web (`web/`), el ejemplo es la web.
   Compruébalo tú primero (`npx vite build`, el HTML de `dist/`, la salida), y da a Pedro la ruta
   completa y el comando (`npx fudic dev`). No arranques servidores que se queden huérfanos.
5. **Espera el ok de Pedro.** Lo que vale es que él lo vea funcionar, no que pasen los tests.
6. **Con su ok, los tests.** En el fichero de test que ya cubre ese código (búscalo con grep), o
   en uno nuevo junto a él. Ejecuta **solo esos ficheros**:
   `npx vitest run test/<ruta>.test.ts` en el paquete. Comprueba que el test falla sin el arreglo
   (deshaz el cambio de `src/` a mano o con `git stash push <fichero de src>`, en primer plano, y
   recupéralo enseguida).
7. **Márcalos y haz commit** (uno por hallazgo, o uno por tanda si son triviales) y push: en la rama
   `web-publica` se hace commit y push al cerrar cada paso sin preguntar.

## Marcar un hallazgo resuelto

En el mismo commit que el arreglo:

- **En su fichero** (`hallazgos-fudic.md` o `hallazgos-cli.md`), al final del hallazgo, una viñeta:
  `- **Resuelto el <AAAA-MM-DD>.** <qué hace ahora, en una o dos frases>.`
  Si solo se resolvió una parte: `- **Resuelto en <paquete> el <fecha>.** … Queda <la otra parte>.`
  No se renumera ni se borra nada.
- **En `hallazgos-por-paquete.md`:**
  - En la tabla del paquete, delante del número: `✅` resuelto, `◐` resuelto en este paquete y
    pendiente en otro (di cuál en el texto de la fila, con «→»). Si el hallazgo aparece en la tabla
    de otro paquete, márcalo también allí.
  - En la tabla **Avance**, actualiza las columnas ✅, ◐ y Quedan del paquete y la fila Total.
  - Si era una decisión pendiente, quítala de «Decisiones pendientes».
- Un hallazgo descartado: título tachado y «(descartado)», como el 2 o el 32, una viñeta
  `- **Descartado el <fecha>.** <por qué>`, fuera de la tabla y en «No cuentan».

## Hallazgos nuevos

Lo roto que veas mientras arreglas se apunta en el momento, con todas sus apariciones (grep). Lee
entero el fichero antes de apuntarlo: si ya está, se añade «Vuelto a comprobar» en el original, sin
renumerar. Un hallazgo nuevo también va a la clasificación y suma en **Avance**.

## Al cerrar un paquete

Cuando no quedan hallazgos del paquete, o Pedro lo da por cerrado:

1. La suite completa del paquete con cobertura, una vez: `pnpm --filter @fudic/<paquete> coverage`
   (en segundo plano si es vite).
2. Si algún fichero baja del umbral, o un paquete nacido al 100 deja de estarlo, se arregla ahora.
   La deuda heredada (`compiler`, `transport`, `vite`) no puede bajar de lo que tenía.
3. Si el arreglo tocó otros paquetes, sus suites también. Luego `pnpm typecheck`.
4. Un commit con lo que haga falta, y a Pedro, en dos líneas: el paquete cerrado y lo que queda.
