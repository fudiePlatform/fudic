---
name: capitulo-web
description: Escribe o reescribe un capítulo de la web pública de Fudic con su guía de estilo, tanto de la Documentación (web/apps/site, /docs) como de la sección MCP (web/apps/mcp, /mcp). Úsalo cuando Pedro pida hacer, revisar o rehacer un tema, un capítulo o un grupo de páginas de la web.
---

# Escribir un capítulo de la web pública

Argumento: el tema o capítulo (`Internacionalización`, `/docs/security`, `capítulo 9`…), o un
grupo de la sección MCP (`Dirigir un modelo`, `/mcp/tools`…). Si no viene, pregunta cuál. El índice
de la Documentación y su estado está en `docs/web/README.md` §5.2; el de la sección MCP, en
`docs/web/mcp/README.md` §3. Si es del MCP, lee también §5 de esta guía: todo lo demás vale igual.

## Cómo se habla con Pedro

En español, corto y en lenguaje llano. Primera línea, el estado («hecho, build verde» o «está
roto»). Sin muros de tablas ni negritas por todas partes. Si hay dos caminos, propón uno.

## 1. Antes de escribir

1. **Lee el código, no la memoria.** El paquete que cubre el tema (`packages/<x>/src`), el
   compilador si hay sintaxis, la gramática del `.fudapi` (`packages/api`) si hay contrato, y los
   diagnósticos (`packages/diagnostics/src/codes`). Si el código y una página antigua no
   coinciden, **manda el código**.
2. **Lee dos capítulos ya reescritos** para coger el tono: `web/apps/site/src/routes/docs/styles.fud`
   y `web/apps/site/src/routes/docs/server.fud`.
3. **Propón el capítulo en notas breves en el chat**: las páginas, la idea de cada una en una
   frase y qué ejemplo lleva. **Espera a que Pedro responda** antes de escribir HTML. Nunca
   Markdown: se escribe directo el `.fud`.
4. **Nadie lee algo que use lo que aún no ha visto.** Si una página necesita un concepto de un
   capítulo posterior, o se cambia el orden o se enlaza; dilo en las notas.

## 2. Cómo se escribe: que se lea rápido y se entienda rápido

Es lo que Pedro aprobó al reescribir Estilos, Reactividad, `.fud`, Servidor, Rutas y Formularios.

- **Cada página abre con su idea, en una o dos frases.** Quien lee solo eso ya sabe de qué va.
- **Un ejemplo corto por concepto.** Solo las líneas que importan; `…` para el resto.
- **Poca negrita, pocos paréntesis, frases cortas.** La negrita solo para la primera palabra de
  un punto de lista, y no en todas las listas.
- **Sin justificaciones defensivas**: nada de «tiene una razón», «no es una limitación», «no es
  magia». Se dice qué hace y, si importa, por qué, en una frase.
- **Los casos límite y los códigos `FUDnnnn`** van a un `<h2 id="details">Detalles</h2>` al final,
  o fuera. Un código solo si el lector lo va a ver en su editor.
- **La referencia completa NO va en la página de guía.** La API entera (cada miembro, atributo,
  regla, status) vive en páginas de referencia aparte, que Pedro enlaza. Una tabla larga al
  final hace que el lector salga corriendo y no se mantiene.
- **Sin cifras internas ni `examples/basic`** en el texto: nadie lo conoce.
- **Sin marcadores ①②** en los ejemplos: se nombra cada parte por lo que se ve en el código.
- **Sin «capítulo N»**: se enlaza la página por su nombre (`<a href="/docs/forms">El formulario</a>`).
- **Sin introducciones ni cierres** («En este capítulo…», «Siguiente paso»). Es documentación,
  no un tutorial.

### Las frases: lo que costó tres pasadas

La calidad actual del manual salió de tres pasadas de revisión (`docs/web/redaccion.md` tiene la
última, con cada original y su propuesta). Estas reglas existen para que una página nueva salga
ya así, sin repetirlas. Relee cada párrafo con ellas antes de entregar:

- **Cada frase con su verbo.** Nada de elipsis con coma: «`fudic add http`, la cadena global»
  se escribe «`fudic add http` crea la cadena global». «Con `true`, el atributo vacío» se escribe
  «Con `true`, escribe el atributo vacío». En una celda de tabla o un punto de lista corto, el
  estilo telegráfico vale; en un párrafo, no.
- **Cada pronombre con su sustantivo cerca.** Si «lo», «los», «su», «uno», «él» o «es lo único»
  apuntan a algo del `<h2>` o de dos frases atrás, se repite el sustantivo: «el workbench los
  ejecuta» se escribe «el workbench ejecuta los criterios».
- **Un sujeto por frase.** Si cambia a mitad, se parte en dos frases.
- **Nada de dos puntos encadenados.** Un «:» presenta y el siguiente abre una lista: el lector
  no sabe cuál manda. Se cierra la primera idea con punto.
- **Enlaces dentro de la frase, no entre paréntesis.** Como mucho uno por frase. «el clic no se
  pierde (Hidratación)» se escribe «el clic no se pierde. Lo explica Hidratación».
- **Palabras con dos lecturas.** «para» (de *parar*) se lee como preposición: se escribe «se
  detiene». «solo» detrás del verbo se lee como «únicamente»: si es «por sí mismo», se escribe
  «por su cuenta».
- **Un nombre para cada cosa.** Elegido el término («custom properties», «hooks»), se usa siempre.
  Un concepto nuevo («contenedor», «fixture») se presenta en una frase la primera vez que sale.
- **La jerga, explicada o fuera.** Nada de «fichero hermano» o «vale» por «pasa»: se dice qué es.

### El mensaje de fondo

- **El estándar primero.** HTML, CSS y TypeScript son «estándar», siempre con esa palabra. Lo
  que hace la plataforma se le atribuye a la plataforma y se enlaza a MDN; a Fudic, solo lo que
  añade. Lo que aún no es estándar se dice, con su propuesta (issue o explainer) y su polyfill.
- **Políglota, sin atarse a Node.** Hoy el servidor es Node, pero la vista y el `.fudapi` están
  diseñados para traducirse a C#, Java, Go, Rust y Python: cuando lleguen, se desplegará sin
  Node (sin coletillas tipo «el backend que tu empresa ya tiene»: a Pedro le sobran). Muchas
  empresas no quieren Node en producción;
  donde el tema lo toque (servidor, vista, despliegue), se dice. En el navegador, siempre
  TypeScript. Nunca se vende como hecho: hoy está implementado TypeScript, el resto diseñado.
- **Fudic** con mayúscula en la prosa; en minúscula solo el código (`fudic dev`, `@fudic/core`).
- Al citar frameworks, **Angular va con React y Vue**.
- **Los conceptos clave se explican**, no se dan por sabidos.
- Comandos con la CLI de Fudic: `fudic dev`, `fudic test`, `fudic spec`, nunca `pnpm dev`.
- **Al hablar de probar, el protagonista es `fudic spec`**: los criterios del `.fudspec` y el
  workbench (Ctrl+K V en VS Code), que enseña el componente, ejecuta los criterios en un navegador
  de verdad en cada guardado y deja tocarlo con *Live*. El test unitario va detrás.
- **Encabezados `h1`–`h6` nunca dentro de un componente**, ni en los ejemplos: van en la página
  y el componente los recibe por `<slot>`.

## 3. La forma de una página

La página se crea con la CLI (`fudic g page docs/<tema>/<pagina>` desde `web/apps/site`): la web
es también prueba de la CLI, y lo que no se pueda crear con ella se anota en
`docs/web/hallazgos-cli.md`. Después se rellena con este esqueleto:

```
<link rel="layout" href="@web/ui/layouts/docs.fud">
<link rel="snippet" href="@web/ui/snippets/site.fud">
<link rel="component" href="@web/ui/ui-code.fud">
<link rel="component" href="@web/ui/ui-note.fud">   (solo si usa <ui-note>)
<link rel="component" href="@web/ui/ui-toc.fud">

<head>
  <title>Nombre de la página · Fudic</title>
  <meta name="description" content="…">
  <link rel="canonical" href="https://fudic.dev/docs/…">
  <meta property="og:type" content="article">
  <meta property="og:title" content="…">
  <meta property="og:description" content="…">
  <meta property="og:url" content="https://fudic.dev/docs/…">
  <meta property="og:site_name" content="Fudic">
</head>

@section nav { @render docsNav("<id-de-la-pagina>") }
@section toc { <ui-toc><details><summary>En esta página</summary><ul>…</ul></details></ui-toc> }

<h1>…</h1>          ← el mismo texto que su enlace en el menú
<h2 id="…">…</h2>   ← ids en inglés, en kebab-case
…
<h2 id="mdn">El estándar, en MDN</h2>   ← tres o cuatro enlaces, cada uno con una frase
```

- **Ejemplos**: `<ui-code .path="src/…">` con `<pre><code>…</code></pre>`. `<ui-note>` para una nota;
  `.kind="tip"` o `.kind="important"` si hace falta. `<ol class="flow">` para pasos numerados.
- **Escapes en un `.fud`**: `@` del texto o de un ejemplo se escribe `@@`. Dentro de un atributo
  del `<head>` (`content="…"`), `&#64;`: una `@` suelta ahí rompe el build (`FUD0010`). Las
  llaves de un ejemplo dentro de `<pre>`, `&#123;` y `&#125;`; `<` y `>`, `&lt;` y `&gt;`.
- **Enlaces externos**: siempre `target="_blank" rel="noopener"`. MDN en inglés (`en-US`).
- **Textos de enlace descriptivos**: nunca «aquí», «más», «empezar»… (Lighthouse `link-text`).
- **URLs en inglés** aunque el texto esté en español.
- **El código de los ejemplos, en inglés** (identificadores y comentarios); la prosa, en español.
- **Un `<link rel="component">` que la página no usa** da un aviso (`FUD0721`): quítalo.

Una página nueva se añade al menú en `web/libs/ui/src/snippets/site.fud`, en su capítulo.

## 4. Antes de entregar

1. `pnpm build` en `web/apps/site`. Tiene que acabar en `✓ built`, sin errores ni avisos
   nuevos (`FUD1552` de `assets.headers` es antiguo).
2. Enlaces internos con ancla:
   `node .claude/skills/capitulo-web/scripts/anchors.cjs web` desde la raíz del repo. Revisa las
   dos apps (`/docs` y `/mcp`, y los enlaces de una a otra), las rutas con parámetro y que cada
   código de `/docs/reference/diagnostics/FUDnnnn` exista en el catálogo. Tiene que decir
   `broken: 0`, y la primera parte de la línea, qué apps ha leído. Si renombras o quitas un `id`,
   busca antes quién lo enlaza.
3. Cada URL externa nueva, con `curl` (200).
4. Cada fragmento de `.fudapi` que no salga del código, con el validador real.
5. Una línea en el registro de `docs/web/README.md` §8, y el estado del capítulo en §5.2.
6. Commit y push en la rama `web-publica`, con el mensaje en inglés, solo asunto y cuerpo, sin
   trailers de atribución. Ejemplo: `docs(web): chapter 9, internationalization, for review`.

Al entregar, di a Pedro en pocas líneas qué páginas hay, qué idea abre cada una y qué has dejado
fuera.

## 5. Si es la sección MCP

El plan está en `docs/web/mcp/README.md`: léelo entero antes de proponer, sobre todo §1 (qué se
cuenta) y §2 (cómo dirigir un modelo). Todo lo anterior vale igual, con estas diferencias:

1. **Dónde vive.** La app es `web/apps/mcp`, subapp del mismo dominio en `fudic.dev/mcp`. Las
   páginas se crean con `fudic g page` desde `web/apps/mcp`. El índice, el estado y el registro
   son los de `docs/web/mcp/README.md` (§3 y su registro), no los del README general.
2. **URLs y menú.** La canónica y `og:url` son `https://fudic.dev/mcp/…`. El menú no es
   `docsNav`: es el snippet del MCP en `web/libs/ui/src/snippets/site.fud`. Sin componentes
   propios: se usan los de `ui` (`ui-code`, `ui-note`, `ui-toc`…); si falta uno, se añade a `ui`.
3. **El código que se lee** es `packages/mcp`: `src/server.ts`, `src/project-tools.ts` y
   `src/file-tools.ts` (las herramientas), `src/instructions.ts` (lo que el servidor manda al
   modelo), `src/phases.ts` (las fases), `guide/` (lo que lee el modelo) y su README. Lo que
   genera la CLI, en `packages/cli/templates/agent/`.
4. **El estándar, al final.** En vez de «El estándar, en MDN», `<h2 id="standard">El estándar</h2>`
   con la especificación de MCP (modelcontextprotocol.io) y, donde toque, `AGENTS.md` (agents.md)
   o MCP Apps. Las mismas reglas: tres o cuatro enlaces, cada uno con su frase.
5. **Nada inventado.** Cada llamada y cada respuesta de una herramienta, copiadas de una ejecución
   real contra un proyecto de prueba (como la salida de `--dry-run` en las páginas de la CLI). Cada
   configuración de un entorno (Claude Code, VS Code, Cursor, Antigravity, Windsurf, Codex,
   Gemini CLI), comprobada contra su documentación oficial al escribirla y, donde se pueda,
   conectándolo de verdad. Lo que no funcione tal como lo deja `fudic new`, a los hallazgos.
6. **El chat se cuenta, su conexión no.** Se cuenta lo que ve quien usa un chat: las herramientas
   de ficheros, la pieza dibujada en la conversación, la app en una URL. Cómo llega el chat al
   proyecto (el túnel, el secreto de la URL, los puertos, la puerta con cookie) no se detalla, ni
   con comandos: cambiará cuando la infraestructura esté montada. Basta con decir que existe y que
   se explicará entonces.
7. **Enlaza, no repitas.** Donde se hable de un `.fudspec`, un `.fudapi`, un diagnóstico o un
   comando de la CLI, se enlaza su página de `/docs`. La sección MCP explica cómo construir con un
   modelo, no Fudic otra vez.
8. **Una excepción a «sin tutoriales».** «Una conversación de principio a fin» cuenta una historia
   a propósito: una conversación real, con sus capturas, de la petición a la primera pieza `done`.
   Las demás páginas siguen las reglas de §2.
9. **Las herramientas, como los comandos de la CLI.** Una página de grupo en el menú y, fuera de
   él, una por herramienta, que marca la del grupo en el menú: qué hace, sus argumentos, una
   llamada y su respuesta reales, cuándo la usa el modelo y sus códigos (en Detalles).
