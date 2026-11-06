# workflow

Cómo trabajar en un proyecto fudic: las fases por las que pasa cada pieza, quién aprueba qué, y el
bucle de escribir, comprobar y corregir.

## Un paso cada vez

- **La primera llamada de cualquier tarea fudic es `fudic_status`.** Lee los ficheros, el historial
  de cada pieza y los diagnósticos del proyecto, y su `next` dice una cosa que hacer. Hazla y luego
  llama otra vez a `fudic_status`.
- **Todavía no hay proyecto** (`phase: "none"`): pregunta al usuario solo lo que falta para
  `fudic_new` (para qué es la app o la librería, sus páginas o componentes, su nombre y su prefijo
  de tag) y luego llama a `fudic_new`.
- **Nunca avances con errores.** Mientras el proyecto tenga un error, el siguiente paso es corregirlo.
- **Antes de escribir un tipo de fichero por primera vez**, llama a `fudic_guide` con su tema. `next`
  te lo recuerda cuando no lo has leído en esta sesión.

## Las fases de una pieza

Una pieza es un componente o una ruta. Cada una pasa por estas fases, en orden. Una fase está hecha
cuando se cumple su condición; `fudic_status` informa de la fase de cada pieza en `units`.

| # | Fase | Hecha cuando | Quién |
|---|---|---|---|
| 1 | `criteria` | El `.fudspec` y su fixture existen, y la aprobación del usuario está registrada y sigue siendo válida | El usuario aprueba props y criterios juntos |
| 2 | `api` | Solo con servidor: el `.fudapi` existe y el `.fud` lo enlaza con `<link rel="server">` | Tú |
| 3 | `red` | Existen tests unitarios, y la última ejecución de los tests y de los criterios está en rojo **por la razón correcta** | Tú |
| 4 | `view` | Los tests y los criterios pasan, sobre los ficheros actuales | Tú |
| 5 | `connect` | Solo con servidor: cada función del `.fudapi` tiene un handler | Tú |
| 6 | `document` | JSDoc en el componente y en cada prop | Tú |
| 7 | `showcase` | Solo en una librería con showcase: su página está al día | Tú |
| 8 | `look` | Solo en un componente: el usuario aprobó cómo se ve cada caso de su fixture, sobre los ficheros tal como están ahora | El usuario, tras ver `fudic_look` |
| — | `done` | `fudic_record { event: "done" }` lo escribió en el historial | Tú, cuando `next` lo diga |

Una librería no tiene fase `api` ni `connect`. Una ejecución cuyos ficheros han cambiado desde
entonces está `stale` y cuenta como no ejecutada.

### 1. Criterios: pregunta, propón, espera

1. Crea la pieza: `fudic_generate { kind: "component", name: "button", purpose: "<what the
   user asked for, in one sentence>" }`. `purpose` es obligatorio para un componente y una página.
2. **Pregunta, no construyas.** Pregunta al usuario por las props (nombre, tipo, valor por defecto,
   significado) y el comportamiento. Propónlas tú cuando el usuario sea vago, como una lista corta.
3. Escribe la propuesta en el `.fudspec` (un criterio por cada frase que diría el usuario) y en
   su fixture (un conjunto de props con nombre por caso). Enséñasela al usuario.
4. **Espera a la aprobación del usuario en la conversación.** Solo entonces llama a
   `fudic_record { piece: "src/components/app-button/app-button.fud", event: "approved" }`.

**Nunca apruebes en nombre del usuario.** Nada de aprobar porque los criterios parezcan obvios,
porque el usuario tenga prisa, o porque haya pedido muchos componentes a la vez. Un usuario que pide
"un Button, una Card y un Input" recibe primero preguntas sobre el Button.

La aprobación guarda el hash del `.fudspec` y de su fixture. Cambia cualquiera de los dos y
**caduca**: `next` te pide que enseñes al usuario qué ha cambiado desde la aprobación y vuelvas a preguntar.

Qué va en el `.fudspec` y qué va en los tests unitarios:

| `.fudspec` (navegador, aprobado por el usuario) | Tests unitarios (escritos por ti, sin aprobación) |
|---|---|
| Lo que una persona comprobaría mirando y tocando | Lo que el usuario no vería ni aprobaría |
| Una frase del usuario es un criterio | Cada variante de prop; valores límite: vacío, largo, 0 |
| Teclado, foco, accesibilidad, visibilidad, layout | El `detail` de cada evento |
| | Las funciones de servidor y sus fallos; cada regla de un formulario |

Lo que ya es un criterio no se repite como test unitario.

### 2. El contrato de servidor

Solo para una pieza con servidor. `fudic_generate { kind: "api", name: "src/components/app-cart" }`
escribe el `.fudapi` junto al `.fud`, su handler en `src/server` y el
`<link rel="server">`. Un componente empieza con una función `hello`, una ruta con su `load`.
Escribe después el contrato real. Lee antes `fudapi`.

### 3. Rojo por la razón correcta

Escribe los tests unitarios (lee antes `testing`) y luego ejecuta `fudic_test` y `fudic_spec_run`.
Ambos deben fallar, y cada fallo debe ser un `fail`: la aserción se ejecutó y el componente todavía
no lo hacía. Un resultado `broken` (el test no puede ejecutarse: un error de tipos, un fichero que
falta, una página que no carga) no es rojo, es un bug en lo que has escrito. Corrígelo hasta que
todos los resultados sean `fail`.

### 4. La vista, hasta verde

Escribe el `.fud` hasta que `fudic_test` y `fudic_spec_run` pasen. **No cambies los tests ni los
criterios** en esta fase: son el juez. `fudic_test` tarda milisegundos, úsalo como bucle corto;
`fudic_spec_run` tarda segundos, ejecútalo para confirmar. `failing: true` repite solo
lo que estaba en rojo.

Si resulta que un test está mal, díselo al usuario en lugar de editarlo. Un criterio que tiene
que cambiar es una nueva aprobación.

### 5. Conecta cada función

Solo con servidor. `fudic_contract { id }` lista cada declaración del `.fudapi` que necesita un
handler, con su firma TypeScript, su fichero en `src/server` y un esqueleto que compila.
`fudic_symbols { kind: "functions" }` marca cada una como `connected` o `missing`. Un handler
traduce al backend; no contiene lógica de negocio.

### 6. Documenta

El JSDoc es la documentación, y es lo que `fudic_describe` sirve a quien usa la pieza:

- el primer `/** … */` del `@code` documenta el componente: para qué sirve, y cuándo usar
  otro en su lugar;
- un `/** … */` encima de cada prop de `props<…>()` documenta esa prop.

```fud path=src/components/app-badge/app-badge.fud
@code {
  /**
   * A short label beside a title: a state, a count, a category. Its text is the default slot.
   * For an action, use a button instead.
   */
  type Tone = 'neutral' | 'success' | 'warning';

  const { tone = 'neutral' } = props<{
    /** What the badge says about its subject. `neutral` unless it marks a success or a risk. */
    tone?: Tone;
  }>();
}

<head>
  <style>
    :host { display: inline-block; }
    .badge {
      font-size: 0.75rem;
      padding: 0.15rem 0.5rem;
      border: 1px solid #ccc;
      border-radius: 999px;
      background: #f3f3f3;
      color: #444;
    }
    .badge.success { background: #e6f4ea; border-color: #34a853; color: #1e7e34; }
    .badge.warning { background: #fef7e0; border-color: #f9ab00; color: #b06000; }
  </style>
</head>

<app-badge>
  <template shadowrootmode="open">
    <span
      class="badge"
      class:success=@(tone === 'success')
      class:warning=@(tone === 'warning')>
      <slot></slot>
    </span>
  </template>
</app-badge>
```

### 7. Showcase

Solo en una librería que tiene showcase: `fudic_generate { kind: "showcase", name: "ui" }` escribe
una página por cada componente que tiene fixture, con un bloque por caso. Vuelve a ejecutarlo tras
cambiar un fixture; la fase está hecha cuando ejecutarlo no cambiaría nada.

### 8. Aspecto

Solo en un componente. `fudic_look { piece }` pinta cada caso de su fixture en un navegador y
responde cada uno junto a la captura del aspecto que el usuario aprobó por última vez: `new`, `same`,
`changed` o `gone`. Enseña al usuario el antes y el después y pregúntale si aprueba cómo se ve. Solo
si dice que sí, `fudic_record { piece, event: "look" }`; sin un `fudic_look` sobre los ficheros tal
como están ahora responde `FUD1427` y no escribe nada.

**Ver no es aprobar.** `fudic_render`, `fudic_preview` y `fudic_look` muestran; solo
`fudic_record` escribe. El aspecto guarda el hash de los ficheros que pueden cambiar cómo se dibuja
el componente —su vista, lo que enlaza e importa, las hojas globales—, no sus tests ni sus criterios.
Cambia cualquiera de ellos y el aspecto **caduca**: una pieza que estaba `done` se reabre, y `next` te
lleva otra vez por sus tests, sus criterios y `fudic_look`. Aprobada de nuevo, está completa; su `done` se mantiene.

### Hecho

Cuando `next` lo diga, `fudic_record { piece, event: "done" }`. Si todavía falta una fase,
responde `FUD1407` y dice cuál.

Otros eventos de `fudic_record`, cada uno solo cuando el usuario lo diga en la conversación:

| `event` | Cuándo |
|---|---|
| `accepted` | El usuario dice que el cliente aceptó la pieza; `text` es lo que dijo |
| `reopened` | El usuario pide cambiar el contrato de una pieza que está `done`; `text` dice por qué |
| `look` | El usuario aprobó cómo se ve el componente, después de que `fudic_look` se lo enseñara |

## Escribir, comprobar, corregir

A cada escritura le sigue una comprobación, y nada avanza hasta que haya cero diagnósticos:

1. **Escribe.** Mediante `fudic_write` en un chat, o con tus propias herramientas de edición.
   `fudic_write` ya devuelve los diagnósticos de lo que ha tocado.
2. **`fudic_check`.** Lo que diría el build, sobre todo el proyecto: un cambio en un
   componente puede romper a quien lo usa. `paths` solo acota la lista.
3. **`fudic_fix`.** Aplica cada reparación que tiene exactamente una opción, vuelve a comprobar y
   repite. Lo que tiene varias opciones vuelve en `remaining` con sus títulos: elige una.
4. **A mano.** Para cada diagnóstico que quede, `codes` en la respuesta trae el porqué y el arreglo
   de cada código; `fudic_guide { topic: "FUD0540" }` explica cualquier código por sí solo.
   Corrígelo y vuelve a comprobar.

`fudic_format` formatea ficheros `.fud` y `.fudspec`. Un `TS2322` o cualquier otro código `TS` es
el propio mensaje de TypeScript, en su posición dentro del `.fud`.

## Reglas

- **Crea los ficheros con `fudic_generate`, nunca desde cero.** Escribe exactamente lo que escribe
  la CLI: la carpeta, el tag a partir del prefijo, el test, el `.fudspec`, el fixture, los links.
  Después edita lo que ha creado.
- **Antes de usar un componente, llama a `fudic_describe` con su tag. Nunca abras su fichero.** La
  respuesta trae su link, las props con tipos y valores por defecto, slots, eventos con su `detail`,
  CSS parts, los tokens que lee y un ejemplo de uso. `fudic_symbols { kind: "components" }`
  lista lo que existe.
- **Antes de escribir estilos, llama a `fudic_symbols { kind: "tokens" }`** y usa solo esos nombres.
  Ver `html-css`.
- **Antes de llamar a una función de servidor o a una ruta, descríbela**: `fudic_describe` acepta
  una ruta (`/blog/:slug`), un tipo, una función o un token, además de un tag.
- **Acuerda los design tokens con el usuario antes del primer componente**: todos los componentes
  los leen.
- **Nunca escribas un `.fudlog` a mano.** Lo escriben las herramientas: `fudic_record` las decisiones,
  `fudic_test` y `fudic_spec_run` sus ejecuciones.
