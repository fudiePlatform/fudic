# BUG-23 — TODO del editor real (2026-08-17)

> Fuente: [bug.txt](./bug.txt), redactado por Pedro probando la extensión en VS Code tras
> cerrar la fase 4 de [BUG-23-Task.md](../BUG-23-Task.md). El `.txt` no se toca.
> **Progreso:** 0 / 10 verificados · 3 escritos y pendientes de publicar en verdaccio
>
> Estado a 2026-08-20. `[~]` = arreglado y compilando, **sin verificar en VS Code todavía**;
> sólo pasa a `[x]` cuando Pedro lo ve funcionar en el editor.

## Dónde estamos (leer esto primero)

Las capturas de la carpeta llevan el nombre cambiado: **`01-jpb.jpg` es el TODO 1**,
**`01.jpg` es el 5** y **`01.jpb.jpg` es el 10**. No falta ninguna: `04.jpg` y `10.jpg` no
existen porque son esas dos.

Tres causas explican seis de los diez, y ninguna es la que decía el enunciado:

1. **`$Props = never` destruye la lista.** Un componente sin `props<T>()` proyecta
   `$props<never>({…})`. Medido contra `tsserver`: con contrato real devuelve **3 items**
   (`property`); con `never` devuelve **979** (`var`, `function`, `keyword`) — el ámbito
   global entero, con `navigator`, `NaN` y auto-imports de `vite`. Es el TODO 1 exacto.
   No se arregla cambiando el tipo: `{}` y `Record<string, never>` caen en el mismo hueco.
2. **El namespace `$` no lo filtraba nadie.** `FUD0461` prohíbe *declarar* un `$nombre`, pero
   nada quitaba `$tpl`, `$on`, `$props`, `$attrs`… de lo que ofrece TypeScript.
3. **Un `@` sin identificador detrás no es una `RazorExpression`.** El tokenizador sólo la
   escanea donde empieza un identificador, así que `@click=@` degrada a atributo plano y la
   proyección escribía `$on('click');` — sin hueco donde preguntar. Es el TODO 3.

Lo que NO era un fallo, y queda decidido así: el Ctrl+Espacio dentro de un componente ofrece
`class?`, `id?`, `dir?`… porque son las once claves de `$GlobalAttrs` (BUG-23 §4.0). En un
`div` contesta el servicio HTML con el vocabulario real. Que un componente ofrezca once
nombres escritos a mano donde un `div` ofrece el vocabulario entero es una pérdida real —
pendiente de hablar junto al TODO 4, no es una avería.

## Cómo se diagnostica esto (protocolo, y no es negociable)

Estos síntomas son del **editor real**, no de la suite: 2363 tests verdes y VS Code fallando
significa que la suite mide piezas y nadie mide lo que ve el usuario. Reconstruir el editor con
scripts cuesta horas y no hace falta — el virtual está a un comando de distancia.

1. **Pedro abre el caso**: los dos `.fud` tal cual, el volcado de **Fudic: Show Virtual Files** y
   la lista que ve. Eso es el 90 % del diagnóstico.
2. **Claude lee eso** y contesta con la línea del virtual que está mal y por qué. Si no basta,
   **una** pregunta concreta («pon el cursor aquí y dime qué sale»), nunca una batería.
3. **La hipótesis va por delante**, en una frase, con qué la confirma o la tumba. Equivocarse
   cuesta un minuto así; a ciegas cuesta dos horas.
4. **Nada de harnesses ni scripts** salvo que Pedro lo pida. Si algo no se ve en el virtual, se
   dice y decide él.
5. **Un TODO cada vez**: diagnóstico → arreglo **sin correr tests** → Pedro publica en verdaccio y
   verifica en VS Code → solo entonces se tocan los tests que cubrían eso y se mira cobertura.

Varios de los diez huelen al mismo virtual roto: con un volcado se cierran varios de golpe.

## 2026-08-20 — la causa real del TODO 1, verificada en VS Code

**No estaba en el servidor.** El `fudic-globals.d.ts` del proyecto de pruebas era del 9 de
agosto y no declaraba `$props` ni `$required`, las dos que esta misma tanda introdujo. La
proyección las emite igualmente, y una llamada a un nombre no declarado dentro de scaffolding
**no reporta en ninguna parte**: el span no mapea al `.fud`. De ahí los dos síntomas a la vez —
el literal de `$props` se queda sin tipo contextual y el `.` cae al ámbito global (`viteConfig`,
un auto-import), y `$required` deja de reportar la prop requerida que nadie pasó. El fichero
compila limpio mientras el editor está apagado.

Regenerado el `.d.ts`, Pedro lo ha visto funcionar. Y para que no vuelva a ocurrir,
[`globals.ts`](../../../../packages/language-server/src/globals.ts) ya no consulta el fichero
del proyecto: lo OCUPA. Sea cual sea su contenido en disco, el programa lee el texto compilado
en este servidor, que es contra el que la proyección está escrita. Un `.d.ts` desfasado no puede
volver a apagar el editor en silencio.

Lo que sigue son los otros tres defectos que salieron por el camino, todos reales y todos
arreglados — pero ninguno era el que tenía a Pedro parado.

## Tres causas más, medidas

1. **El termómetro estaba roto.** `completeAt` de
   [`bug23-symptoms.test.ts`](../../../../packages/language-server/test/acceptance/bug23-symptoms.test.ts)
   calculaba el offset del cursor con `page('').length`, y `page` añade un `\n` final: **cada
   petición de completado de ese fichero se pedía un carácter a la derecha**. En
   `<app-circle .|>` eso pone el cursor sobre el `>`, donde la posición no mapea a ningún
   tramo de la proyección — así que TypeScript **ni se llegaba a invocar**. Todas las lecturas
   del síntoma 1 hechas con este harness medían eso.
2. **El root tapaba el silencio.** Volar descarta un plugin cuya lista vuelve VACÍA
   (`if (!completionList.items.length) continue`) y recorre el root el ÚLTIMO. Así que cada vez
   que la proyección no tenía nada que ofrecer, contestaba el servicio HTML con `class`, `id`,
   `role`… — la lista de la captura. Arreglado con `silenceOwnedPositions`, que hace que ningún
   servicio del root conteste en una posición que es de la proyección.
3. **`@data.` no se reconocía fuera de un tag.** `propertyContextAt` exige región `tag`, y en un
   nodo de texto la región es `markup`; la posición caía hasta `return emmet` al final de
   `completions()`, y una respuesta no vacía del root RECLAMA la posición. Arreglado con
   `memberContextAt`.

Con las tres, el **TODO 1** pasa en el harness: el `.` contesta `name, tone?`, medido en el
propio servicio de TypeScript. Pasa también §2.2 del BUG — `@data.` contesta los miembros de
`PageData` —, que no tiene número en esta tabla. **El TODO 2 (el `@` de eventos antes del `=`)
no se ha medido.**

## Lo que puede ir a la derecha de un `=` (§2.3)

Pedido por Pedro el 2026-08-20, con la captura donde `.name=@a` ofrecía `arguments`,
`addEventListener`, `alert`, `as`, `async`, `atob`, `await` y auto-imports de `@fudic/vite` y
`@fudic/transport`. La regla que queda escrita: **el valor de un binding es una expresión sobre
lo que el TEMPLATE ve**, y nada más — el `data` de la ruta, las props que el fichero
desestructuró, los nombres que declara su `@client`. Más `@()` como válvula de escape a
cualquier expresión, con el cursor entre los paréntesis.

Tres piezas, y la tercera no estaba donde parecía:

- `expressionValueContextAt` reconoce la posición, y `ownedByProjection` la cierra al root: ni
  Emmet, ni HTML, ni tags.
- `templateScope` es la lista: los nombres declarados en los trozos neutros de `@code` — de ahí
  salen las props — más los de `@client`, más `data` cuando el fichero no es un componente.
- El snippet `@()` **no puede vivir en el servicio adicional**. Volar salta un
  `isAdditionalCompletion` en todo mapeo que no sea el primero, y los códigos embebidos se
  recorren antes que el root: en una posición que mapea a la proyección — o sea todas estas —
  ese servicio no se alcanza nunca. Viaja con la respuesta de TypeScript, y su rango cubre el
  nombre parcial y no el `@`, que es source que la proyección no copió.

Y el `@` a secas, antes de teclear la primera letra: `=@` sin identificador detrás no llega a
ser una `RazorExpression` — el tokenizador la escanea sólo donde empieza un identificador — así
que degradaba a atributo plano con texto `"@"` y no dejaba hueco donde preguntar. `emitTextValue`
lo proyecta como la expresión vacía que es, con el ancla de longitud cero al final del valor. Un
`@` suelto nunca es un literal: decisión 1 escribe uno `@@`.

| ✓ | # | qué pasa hoy | qué se espera | captura |
|---|---|---|---|---|
| [~] | 1 | Tras `.` la lista es la de la captura | — | [01-jpb.jpg](./01-jpb.jpg) |
| [ ] | 2 | El `@` antes del `=` no ofrece nada hasta que se pulsa; después sí se ven los eventos. `@c` ofrece la captura | Que ofrezca sin tener que pulsar otra tecla | [02.jpb.jpg](./02.jpb.jpg) |

| [~] | 3 | `<app-circle @click=@></app-circle>` no ofrece nada | — | — |
| [~] | 4 | Al pulsar una letra sí ofrece las funciones de `@client`, pero **también** ofrece lo de la captura | Solo lo del ámbito | [03.jpg](./03.jpg) |
| [ ] | 5 | `<app-circle @click=@.></app-circle>` ofrece la captura | Debe dar **error** | [01.jpg](./01.jpg) |
| [ ] | 6 | `@` en un nodo de texto ofrece la captura, y ofrece todo el subset de TypeScript | Snippets de control **y** `data` si existe `PageData`, **y** todas las variables, props y funciones de `@client` | [05.jpgo.jpg](./05.jpgo.jpg) · [06.jpg](./06.jpg) |
| [ ] | 7 | `@()` con el cursor entre los paréntesis ofrece la captura — **es lo correcto** | Se deja como está. En el futuro, restringir qué se puede ejecutar dentro de `@()` | [07.jpg](./07.jpg) |
| [ ] | 8 | `<app-circle .name=""><div slot="p"></div></app-circle>`: `PEPITO` solo aparece **después** de teclear la `p`, así que el usuario no sabe qué ranuras tiene el componente. Y al pulsar <kbd>Tab</kbd> queda `slot="@PEPITO"` | La lista de ranuras sin teclear nada, y la inserción sin `@` | [08.jpg](./08.jpg) · [09.jpg](./09.jpg) |
| [ ] | 9 | Un componente sin esa ranura acepta el `slot=` sin quejarse | **Error** | — |
| [ ] | 10 | `<div class:red=@(1===1) class:yellow=@(2===2) class="re"></div>`: entre las comillas de `class` ofrece la captura | Las clases de la sección `style`, y poder escribir cualquier otra (puede estar en ámbito global) | [01.jpb.jpg](./01.jpb.jpg) |

### Qué se ha tocado, y para qué TODO

| TODO | fichero | qué |
|---|---|---|
| 3 | [`language-core/src/template/attrs.ts`](../../../../packages/language-core/src/template/attrs.ts) | `emitOpenHandler`: si el autor escribió el `=`, el evento degradado proyecta igualmente su segundo argumento con un ancla de longitud cero. `@click=@` pasa de `$on('click');` a `$on('click',  );` |
| 1, 4 | [`language-server/src/services/ts-completion.ts`](../../../../packages/language-server/src/services/ts-completion.ts) | Decorador sobre los servicios de TypeScript. Quita los items `$…` siempre, y en una posición de nombre de prop deja sólo los de tipo `Field`/`Property` — así un componente sin props contesta la lista vacía en vez de 979 globales |

El ancla del 3 es de **longitud cero al final del valor**, y eso no es un detalle: Volar mapea
con `Math.min(relativePos, generatedLength)`, así que un tramo que cubra el `@` empuja el
cursor más allá del ancla, hasta el paréntesis de cierre. La misma aritmética hay que
revisarla en `emitEventName` y `emitIntoSlot`, que anclan sobre `attr.span` — es lo que
queda por mirar de los TODOs 2 y 8.

**Transcripción íntegra de origen** (numeración de Pedro: el 9 va sin número dentro del bloque 8
del `.txt`; aquí se numera para poder marcarlo). Faltan en la carpeta `04.jpg` y `10.jpg`.
