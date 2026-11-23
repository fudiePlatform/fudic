# Revisión de redacción de la web

Revisión de toda la prosa de `web/apps/site/src` (2026-11-23): párrafos que cuesta leer, por qué
cuesta y cómo se reescribirían. No es una revisión técnica: no comprueba si lo que dice cada página
es cierto, solo si se entiende a la primera.

Lo aplica otra sesión. Este documento solo propone.

## Cómo aplicarlo

- **Cada hallazgo** lleva la línea, el problema en una frase, el **Original** y la **Propuesta**.
  Las líneas son de la revisión del 2026-11-23: si el fichero ha cambiado, busca el texto, no la
  línea.
- **Los originales no son literales del todo.** En casi todos los bloques, `<code>x</code>` se
  muestra como `` `x` `` y se han quitado `<a>` y `<strong>`. Cada bloque tiene una nota al
  principio con lo que hizo. Para localizar el texto, busca un trozo sin etiquetas. Al reemplazar,
  **conserva los `<a>`, `<strong>` y `<code>` del original** y los escapes del `.fud` (`@@`,
  `&#64;` en el `<head>`, `&lt;`, `&#123;`).
- **La propuesta no es dogma.** Si cambia el significado o choca con el código, gana el
  significado: reescribe con el mismo criterio (frases cortas, un verbo por frase, referente
  explícito).
- **Respeta la guía de estilo** de `.claude/skills/capitulo-web/SKILL.md`: cada página abre con su
  idea, frases cortas, poca negrita y pocos paréntesis, «Fudic» con mayúscula, «estándar».
- **Empieza por los patrones transversales** (abajo): se arreglan de una vez en muchas páginas, y
  luego los hallazgos sueltos de cada página ya no se solapan con ellos.
- **Al terminar**, `pnpm build` en `web/apps/site` tiene que acabar en `✓ built`.

## Patrones transversales

Son los problemas que aparecen en varios bloques. Cada bloque tiene además sus propios patrones,
con ejemplos y la lista de páginas afectadas.

1. **Frases sin verbo y elipsis con coma.** Es el problema más repetido, y sale en los siete
   bloques: «La aprobación y la aceptación, las órdenes de arriba», «Con `true`, el atributo
   vacío», «En desarrollo, siempre.». En una tabla puede funcionar. En prosa obliga a reponer el
   verbo de la frase anterior. Se arregla poniendo el verbo.
2. **Pronombres sin antecedente cercano** («lo», «los», «su», «uno», «es lo único…»), sobre todo
   cuando el sustantivo está en el `<h2>` o en el párrafo anterior. También sale en los siete
   bloques. Se arregla repitiendo el sustantivo.
3. **«para» (de *parar*) que se lee como preposición.** «la primera que falla para», «para el
   criterio con `FUD1202`», «también para el build». Se arregla con «se detiene» o «detiene».
   Páginas: `/docs/forms`, `/docs/forms/validation`, `/docs/i18n/urls`, `/docs/testing`,
   `/docs/terms/anatomy`, `/docs/terms/bench`, `/docs/terms/step-by-step`, `/docs/server`,
   `/docs/vite/build`.
4. **Páginas que no abren con su idea.** Debajo del `<h1>` viene directamente un `<h2>`. Se
   arregla subiendo el primer párrafo por encima del `<h2>`, o escribiendo una apertura de una o
   dos frases (el bloque 3 propone las aperturas). Páginas: `/docs/template-syntax/events`,
   `/docs/template-syntax/expressions`, `/docs/styles/delivery`, `/docs/styles/shared`,
   `/docs/forms/events`, `/docs/routing/early-hints`, `/docs/routing/error-page`,
   `/docs/routing/rendering`. En `/docs/styles/guide` y `/docs/reactivity/hydration`, quitar el
   primer `<h2>` es opcional.
5. **Enlaces entre paréntesis** al final o en mitad de la frase, a veces dos o tres en un mismo
   párrafo: «el clic no se pierde ([Hidratación])». Se arregla integrando el enlace en la frase o
   con una frase aparte. Hay casos sobre todo en `/docs/cli`, `/docs/getting-started`,
   `/docs/forms`, `/docs/routing` y `/docs/i18n`.
6. **Dos nombres para lo mismo.** Hay que elegir uno y usarlo siempre:
   - «variables CSS» / «custom properties»: `/docs/styles`, `/docs/styles/shared`,
     `/docs/styles/delivery`;
   - «hooks» / «ganchos del ciclo de vida»: `/docs/performance/caching`,
     `/docs/service-worker/isomorphic`, `/docs/configuration/generated`;
   - «raíz» / «contenedor», usados en las páginas de DI sin presentarlos.
7. **Una línea repetida en 28 páginas de la CLI.** «Sirven además las opciones de todos los
   comandos: …, en [Opciones de todos los comandos].» termina en un complemento sin verbo. Es la
   misma línea literal en todas, así que basta un buscar y reemplazar (bloque 1, P1).

## Bloques

1. CLI, Empezar, inicio y layout
2. Referencia
3. Sintaxis `.fud`, estilos y reactividad
4. Servidor, servicios (DI) y seguridad
5. Formularios, internacionalización y rutas
6. Pruebas, términos y editores
7. Vite, Service Worker, rendimiento y configuración


---

## Bloque 1. CLI, Empezar, inicio y layout

Nota: en los originales, `<code>x</code>` aparece como `` `x` ``, las entidades (`&lt;`, `&gt;`) se muestran resueltas, `@@` se muestra como `@` y los enlaces `<a>` se muestran solo con su texto entre corchetes: [texto]. En el fichero, el texto que hay que buscar conserva las etiquetas.

### Patrones de este bloque

#### P1. «Sirven además las opciones de todos los comandos…, en [enlace]»: la frase acaba en un complemento sin verbo

- Original: > Sirven además las opciones de todos los comandos: `--json`, `--cwd` y `--help`, en [Opciones de todos los comandos].
- Propuesta: > Sirven además las opciones de todos los comandos: `--json`, `--cwd` y `--help`. Están explicadas en [Opciones de todos los comandos].
- Páginas (28, misma línea literal): cli/new, cli/add, cli/dev, cli/preview, cli/test, cli/spec, cli/fmt, cli/translate, cli/approve, cli/accept, cli/history y las 17 de cli/generate/* (component, page, layout, app, lib, guide, service, form, pipe, style, snippet, spec, flow, term, api, showcase, error-page). La variante de cli/generate se trata aparte en su página.

#### P2. Enlace entre paréntesis al final de la frase: corta la idea y obliga a saltarlo

- Original: > Aunque lo pulses antes de que llegue el código, el clic no se pierde ([Hidratación]).
- Propuesta: > Aunque lo pulses antes de que llegue el código, el clic no se pierde. Lo explica [Hidratación].
- Páginas: /docs/cli (línea 173, tres paréntesis seguidos), /docs/getting-started (líneas 153, 200, 258, 279, 290, 291). Cada caso tiene su propuesta abajo.

#### P3. Descripción de `--layout` en dos fragmentos sin verbo («Un nombre: … Un href: …», «Este layout en vez de…»)

- Original: > Un nombre: su propio layout, por defecto `_layout`. Un href: el de una librería, que entonces usa.
- Propuesta: > Si es un nombre, crea un layout propio de la app; por defecto, `_layout`. Si es un href, la app usa ese layout de una librería.
- Páginas: cli/new (68), cli/generate/app (68), cli/generate/page (67), cli/generate/error-page (52).

#### P4. «Una vez publicada, no se cambia»: no queda claro qué no se cambia, ni si es una regla o un consejo

- Original: > La identidad de la app para sus cachés. Por defecto, su nombre. Una vez publicada, no se cambia.
- Propuesta: > La identidad de la app para sus cachés. Por defecto, su nombre. No la cambies cuando la app ya esté publicada.
- Páginas: cli/new (66), cli/generate/app (70).

#### P5. «componentes que usan tus apps»: el sujeto es ambiguo (¿los componentes usan las apps o al revés?)

- Original: > componentes que usan tus apps
- Propuesta: > componentes que tus apps usan
- Páginas: /docs/cli (61), cli/generate/lib (39).

---

### `/docs/cli` — `web/apps/site/src/routes/docs/cli.fud`

1. **Línea 53.** Problema: dos elipsis encadenadas («y X, las opciones de uno») más unos dos puntos que añaden una tercera idea.
   - Original: > `fudic --help` enseña todos los comandos, y `fudic <comando> --help`, las opciones de uno: lo mismo que hay en esta página y en la de cada comando.
   - Propuesta: > `fudic --help` enseña todos los comandos, y `fudic <comando> --help` enseña las opciones de uno. Es lo mismo que cuentan esta página y la de cada comando.

2. **Línea 61.** Problema: ver P5; «que usan tus apps» admite dos lecturas.
   - Original: > Librería: componentes que usan tus apps. No se sirve.
   - Propuesta: > Librería: componentes que tus apps usan. No se sirve.

3. **Línea 78.** Problema: la segunda frase no tiene verbo.
   - Original: > `fudic generate`, o `fudic g`, añade una pieza al proyecto en el que estás. Sus tipos, juntos, en [la página de `fudic generate`]:
   - Propuesta: > `fudic generate`, o `fudic g`, añade una pieza al proyecto en el que estás. Estos son sus tipos; [la página de `fudic generate`] los reúne todos:

4. **Línea 114.** Problema: «traducir a `src/locales/`» se lee como «traducir al idioma src/locales»; el destino es de «extrae».
   - Original: > extrae los textos que hay que traducir a `src/locales/`.
   - Propuesta: > extrae a `src/locales/` los textos que hay que traducir.

5. **Línea 148.** Problema: la segunda frase es una elipsis que hay que reconstruir («sin ella, actúa sobre el del…»).
   - Original: > el proyecto sobre el que actúa. Sin ella, el del `fudic.json` más cercano subiendo desde donde estás. Nunca elige uno por su cuenta.
   - Propuesta: > el proyecto sobre el que actúa. Sin ella, actúa sobre el proyecto del `fudic.json` más cercano, buscando hacia arriba desde donde estás. Nunca elige uno por su cuenta.

6. **Línea 158.** Problema: «Nunca la ayuda entera» es una frase sin verbo que obliga a releer la anterior.
   - Original: > Un error dice qué pasó, cómo seguir y dónde está la ayuda del comando. Nunca la ayuda entera:
   - Propuesta: > Un error dice qué pasó, cómo seguir y dónde está la ayuda del comando, pero no enseña la ayuda entera:

7. **Línea 173.** Problema: ver P2; tres enlaces entre paréntesis o al final de frase en un solo párrafo denso.
   - Original: > El build lo hace Vite, con `pnpm build`, y comprueba los tipos de todo el proyecto antes de empaquetar ([El build y la preview]). En desarrollo, los mismos tipos se comprueban en vivo ([En desarrollo]). El aviso de lo que aún no está en Baseline se configura en [Baseline].
   - Propuesta: > El build lo hace Vite con `pnpm build`. Antes de empaquetar, comprueba los tipos de todo el proyecto; lo explica [El build y la preview]. En desarrollo, los mismos tipos se comprueban en vivo, como cuenta [En desarrollo]. El aviso de lo que aún no está en Baseline se configura en [Baseline].

### `/docs/getting-started` — `web/apps/site/src/routes/docs/getting-started.fud`

1. **Línea 78.** Problema: «cuando lleguen» no tiene sujeto claro (¿los lenguajes, las traducciones?).
   - Original: > Pero las vistas y los contratos con el servidor están pensados para traducirse a C#, Java, Go, Rust y Python, y cuando lleguen podrás desplegar sin Node.
   - Propuesta: > Pero las vistas y los contratos con el servidor están pensados para traducirse a C#, Java, Go, Rust y Python. Cuando lleguen esos servidores, podrás desplegar sin Node.

2. **Línea 115.** Problema: el gerundio «su tag envolviendo» es un calco del inglés y deja la frase sin verbo.
   - Original: > Es el esqueleto de cualquier componente: su tag envolviendo un `<template shadowrootmode>`, y sus estilos en un `<style>`.
   - Propuesta: > Es el esqueleto de cualquier componente: su tag, que envuelve un `<template shadowrootmode>`, y sus estilos, en un `<style>`.

3. **Línea 153.** Problema: ver P2; el paréntesis corta la explicación de `shadowrootadoptedstylesheets`.
   - Original: > `shadowrootadoptedstylesheets` le da a su botón el aspecto del resto de la app ([El CSS de un componente]).
   - Propuesta: > `shadowrootadoptedstylesheets` le da a su botón el aspecto del resto de la app. Lo explica [El CSS de un componente].

4. **Línea 200.** Problema: ver P2.
   - Original: > Aunque lo pulses antes de que llegue el código, el clic no se pierde ([Hidratación]).
   - Propuesta: > Aunque lo pulses antes de que llegue el código, el clic no se pierde. Lo explica [Hidratación].

5. **Línea 204.** Problema: «Escribe lo que tiene que pasar» no dice dónde, y tras «sus criterios» el lector duda de si es una descripción o una orden.
   - Original: > Escribe lo que tiene que pasar:
   - Propuesta: > Escribe en él lo que tiene que pasar:

6. **Línea 224.** Problema: «se monta» no tiene sujeto explícito y «su fixture, al lado» encadena dos elipsis.
   - Original: > `props diez` son las props con las que se monta, y van en su fixture, al lado:
   - Propuesta: > `props diez` son las props con las que se monta el componente. Están en su fixture, al lado del `.fudspec`:

7. **Línea 235.** Problema: tres ideas en una frase (tarjeta, captura, recuadros), con un complemento final que cuelga de «captura».
   - Original: > Cada criterio es una tarjeta con sus pasos, su veredicto y una captura de lo que vio un navegador de verdad, con un recuadro en cada elemento que tocó un paso.
   - Propuesta: > Cada criterio es una tarjeta con sus pasos, su veredicto y una captura de lo que vio un navegador de verdad. En la captura, cada elemento que tocó un paso lleva un recuadro.

8. **Línea 236.** Problema: el sujeto de «se vuelven a ejecutar» no está (¿el componente y el criterio?).
   - Original: > Guardas el componente o el criterio, y se vuelven a ejecutar.
   - Propuesta: > Cada vez que guardas el componente o un criterio, los criterios se vuelven a ejecutar.

9. **Línea 240.** Problema: el comando cuelga de unos dos puntos al final, separado de «se ejecutan» por un inciso.
   - Original: > Los mismos criterios se ejecutan desde la terminal, y en la integración continua: `npx fudic spec`.
   - Propuesta: > Los mismos criterios se ejecutan con `npx fudic spec`, en la terminal o en la integración continua.

10. **Línea 258.** Problema: ver P2.
    - Original: > Enlaza un layout, que es el documento completo con su `<html>` y su `<head>` ([Rutas y layouts]).
    - Propuesta: > Enlaza un layout, que es el documento completo con su `<html>` y su `<head>`. Lo explica [Rutas y layouts].

11. **Línea 261.** Problema: frase larga con tres pronombres seguidos («con él», «las del id viejo», «la visitó») cuyos antecedentes hay que buscar.
    - Original: > No cambies el `id` de `fudic.json` cuando la app ya tenga visitas: el Service Worker nombra sus cachés con él, y las del id viejo se quedarían para siempre en el navegador de quien la visitó.
    - Propuesta: > No cambies el `id` de `fudic.json` cuando la app ya tenga visitas. El Service Worker nombra sus cachés con ese `id`. Si cambia, las cachés del `id` viejo se quedan para siempre en el navegador de cada visitante.

12. **Línea 270.** Problema: «es exactamente a lo que compila» tiene un orden forzado.
    - Original: > Está en Chrome, Edge, Safari y Firefox desde 2024, y es exactamente a lo que compila cada `.fud`.
    - Propuesta: > Está en Chrome, Edge, Safari y Firefox desde 2024. Cada `.fud` compila exactamente a eso.

13. **Línea 279.** Problema: ver P2; el paréntesis llega tras una frase que ya tiene un inciso.
    - Original: > Lo que está en camino, como `shadowrootadoptedstylesheets`, lo cubre con un polyfill pequeño que sobrará cuando llegue ([Una copia por página]).
    - Propuesta: > Lo que está en camino, como `shadowrootadoptedstylesheets`, lo cubre con un polyfill pequeño que sobrará cuando llegue. Lo explica [Una copia por página].

14. **Línea 290.** Problema: frase larga con consecuencia, lista de lenguajes y enlace entre paréntesis.
    - Original: > La vista solo admite lo que se puede traducir con el mismo resultado a otros lenguajes, así que el mismo `.fud` se podrá pintar en un servidor de C#, Java, Go, Rust o Python ([Vistas políglotas]).
    - Propuesta: > La vista solo admite lo que se puede traducir a otros lenguajes con el mismo resultado. Así, el mismo `.fud` se podrá pintar en un servidor de C#, Java, Go, Rust o Python. Lo explica [Vistas políglotas].

15. **Línea 291.** Problema: «que lo cumpla» puede referirse al contrato o al formato; además cierra con un paréntesis.
    - Original: > El contrato con el servidor, el `.fudapi`, no es código de ningún lenguaje, y el formato en que viajan las llamadas está documentado. Cualquier backend que lo cumpla sirve a la misma página ([Por qué existe el `.fudapi`]).
    - Propuesta: > El contrato con el servidor, el `.fudapi`, no es código de ningún lenguaje, y el formato en que viajan las llamadas está documentado. Cualquier backend que cumpla el contrato sirve a la misma página. Lo explica [Por qué existe el `.fudapi`].

### `/docs/cli/new` — `web/apps/site/src/routes/docs/cli/new.fud`

1. **Línea 38.** Problema: la segunda frase acumula «en su lugar», unos dos puntos y una enumeración de tres elementos distintos.
   - Original: > Con `--workspace` crea en su lugar un workspace: un solo repo con `apps/` y `libs/`, la guía en `libs/guide` y las apps y librerías que nombres.
   - Propuesta: > Con `--workspace` crea un workspace en lugar de una app. Es un solo repo con `apps/` y `libs/`, con la guía en `libs/guide` y con las apps y librerías que nombres.

2. **Línea 63.** Problema: «su primera app» es una elipsis con un posesivo ambiguo (¿de `--workspace`?).
   - Original: > Con `--workspace`, su primera app, servida en `/`.
   - Propuesta: > Con `--workspace`, la primera app del workspace, que se sirve en `/`.

3. **Línea 65.** Problema: «y la app la usa» no deja claro de qué app se habla ni que es el comando quien lo configura.
   - Original: > Con `--app`, crea también esa librería, y la app la usa. Se repite.
   - Propuesta: > Con `--app`, crea también esa librería y hace que la app la use. Se repite.

4. **Línea 66.** Problema: ver P4.
   - Original: > Una vez publicada, no se cambia.
   - Propuesta: > No la cambies cuando la app ya esté publicada.

5. **Línea 68.** Problema: ver P3.
   - Original: > Un nombre: el layout propio de la app, por defecto `_layout`. Un href: el de una librería, como `@shop/ui/layouts/main.fud`.
   - Propuesta: > Si es un nombre, crea un layout propio de la app; por defecto, `_layout`. Si es un href, la app usa ese layout de una librería, como `@shop/ui/layouts/main.fud`.

### `/docs/cli/add` — `web/apps/site/src/routes/docs/cli/add.fud`

1. **Línea 38.** Problema: el complemento directo llega tarde, tras «a un proyecto que ya tienes», y «lo instala» queda lejos de su antecedente.
   - Original: > Añade a un proyecto que ya tienes un módulo opcional de Fudic, o una librería del workspace, y lo instala.
   - Propuesta: > Añade un módulo opcional de Fudic, o una librería del workspace, a un proyecto que ya tienes. También lo instala.

2. **Línea 51.** Problema: tres paréntesis en una enumeración; uno de ellos lleva otra subordinada dentro.
   - Original: > `di` (servicios), `forms`, `http` (una cadena para las funciones de servidor, en `src/http.fudapi`), `i18n` (traducciones) o el nombre de una librería del workspace.
   - Propuesta: > Un módulo o el nombre de una librería del workspace. Los módulos son `di`, para los servicios; `forms`; `http`, una cadena para las funciones de servidor en `src/http.fudapi`; e `i18n`, para las traducciones.

3. **Línea 62.** Problema: «Por defecto, en la que estás» no concuerda con «donde se crea» (aquí no se crea nada, se añade).
   - Original: > La app o la librería donde se crea. Por defecto, en la que estás.
   - Propuesta: > La app o la librería a la que se añade. Por defecto, la que tiene la carpeta en la que estás.

### `/docs/cli/dev` — `web/apps/site/src/routes/docs/cli/dev.fud`

1. **Línea 37.** Problema: «Dentro de una app, solo esa» es una frase sin verbo.
   - Original: > Dentro de una app, solo esa.
   - Propuesta: > Si lo ejecutas dentro de una app, sirve solo esa app.

2. **Línea 68.** Problema: «la app cuya base encaja más larga» tiene un orden forzado que cuesta descifrar.
   - Original: > Delante, un proxy manda cada petición a la app cuya base encaja más larga:
   - Propuesta: > Delante hay un proxy que manda cada petición a la app con la URL base más larga que encaja:

3. **Línea 69.** Problema: un inciso, una oposición y unos dos puntos en una frase corta; «la primera que lo tiene» obliga a releer.
   - Original: > El runtime de Fudic, en `/_fudic/`, es del origen y no de una app: lo sirve la primera que lo tiene.
   - Propuesta: > El runtime de Fudic se sirve en `/_fudic/` y pertenece al origen, no a una app. Lo sirve la primera app que lo tiene.

### `/docs/cli/preview` — `web/apps/site/src/routes/docs/cli/preview.fud`

1. **Línea 36.** Problema: la página abre con una frase sin verbo seguida de otra elipsis tras los dos puntos.
   - Original: > Lo mismo que `fudic dev`, con el build de cada app: lo que desplegarías.
   - Propuesta: > Hace lo mismo que `fudic dev`, pero sirve el build de cada app, que es lo que desplegarías.

2. **Línea 8 (meta description).** Problema: misma elipsis tras los dos puntos.
   - Original: > fudic preview sirve el build de cada app en un solo puerto: lo que desplegarías.
   - Propuesta: > fudic preview sirve el build de cada app en un solo puerto, que es lo que desplegarías.

### `/docs/cli/spec` — `web/apps/site/src/routes/docs/cli/spec.fud`

1. **Línea 37.** Problema: tres complementos encadenados por comas («del proyecto…, de sus componentes…, o los de todos…»); la alternativa final se pierde.
   - Original: > Ejecuta en un navegador los criterios `.fudspec` del proyecto en el que estás, de sus componentes, sus páginas y sus flujos, o los de todos los proyectos desde la raíz del workspace.
   - Propuesta: > Ejecuta en un navegador los criterios `.fudspec` del proyecto en el que estás: los de sus componentes, sus páginas y sus flujos. Desde la raíz del workspace, ejecuta los de todos los proyectos.

2. **Línea 66.** Problema: frase sin verbo principal.
   - Original: > Desde la raíz, un proyecto detrás de otro, porque cada uno abre un navegador.
   - Propuesta: > Desde la raíz, ejecuta los proyectos uno detrás de otro, porque cada uno abre un navegador.

### `/docs/cli/translate` — `web/apps/site/src/routes/docs/cli/translate.fud`

1. **Línea 37.** Problema: «traducir a `src/locales/…`» se lee como un idioma de destino, y siguen dos complementos más tras comas.
   - Original: > Extrae los textos que hay que traducir a `src/locales/<locale>/`, un fichero por cada fichero de código, para cada idioma de `fudic.json`.
   - Propuesta: > Extrae a `src/locales/<locale>/` los textos que hay que traducir, para cada idioma de `fudic.json`. Escribe un fichero por cada fichero de código.

2. **Línea 50.** Problema: «Por defecto, en la que estás» no concuerda con «La app cuyos textos extrae».
   - Original: > La app cuyos textos extrae. Por defecto, en la que estás.
   - Propuesta: > La app cuyos textos extrae. Por defecto, la app en la que estás.

3. **Línea 67.** Problema: la coordinación «a `locales` en `fudic.json`, o con `fudic add…`» une dos complementos que no son paralelos.
   - Original: > hay que añadir los demás a `locales` en `fudic.json`, o con `fudic add i18n --locales es,en`.
   - Propuesta: > hay que añadir los demás idiomas a `locales` en `fudic.json`, a mano o con `fudic add i18n --locales es,en`.

4. **Línea 68.** Problema: «lo ejecutan» no tiene antecedente cercano (el comando se nombra solo en el título).
   - Original: > Ni `fudic dev` ni el build lo ejecutan: los catálogos solo cambian cuando lo ejecutas tú.
   - Propuesta: > Ni `fudic dev` ni el build ejecutan `fudic translate`: los catálogos solo cambian cuando lo ejecutas tú.

### `/docs/cli/approve` — `web/apps/site/src/routes/docs/cli/approve.fud`

1. **Línea 38.** Problema: cuatro posesivos «su» seguidos con antecedentes distintos y una frase muy cargada tras los dos puntos.
   - Original: > Aprueba los criterios y las props de un componente o de una ruta: lo apunta en su `.fudlog`, con tu nombre de git y el hash de su `.fudspec` y su fixture. Si tocas cualquiera de los dos, la aprobación caduca.
   - Propuesta: > Aprueba los criterios y las props de un componente o de una ruta. La aprobación queda apuntada en el `.fudlog` de la pieza, con tu nombre de git y el hash de su `.fudspec` y de su fixture. Si tocas cualquiera de los dos, la aprobación caduca.

2. **Línea 8 (meta description).** Problema: «y su hash» no dice de qué es el hash.
   - Original: > fudic approve aprueba los criterios y las props de una pieza en su .fudlog, con tu nombre de git y su hash.
   - Propuesta: > fudic approve aprueba los criterios y las props de una pieza en su .fudlog, con tu nombre de git y el hash de sus criterios.

### `/docs/cli/accept` — `web/apps/site/src/routes/docs/cli/accept.fud`

1. **Línea 38.** Problema: el hipérbaton «en el `.fudlog` de una pieza que el cliente la aceptó» se lee como una relativa con un pronombre de más.
   - Original: > Apunta en el `.fudlog` de una pieza que el cliente la aceptó, y etiqueta el commit en el que estás como `accepted/<name>/<date>`.
   - Propuesta: > Apunta que el cliente aceptó una pieza en el `.fudlog` de esa pieza. Además, etiqueta el commit en el que estás como `accepted/<name>/<date>`.

2. **Línea 8 (meta description).** Problema: «el .fudlog que el cliente aceptó» admite la lectura de relativa (el cliente aceptó el `.fudlog`).
   - Original: > fudic accept apunta en el .fudlog que el cliente aceptó una pieza, y etiqueta el commit.
   - Propuesta: > fudic accept deja constancia en el .fudlog de que el cliente aceptó una pieza, y etiqueta el commit.

### `/docs/cli/history` — `web/apps/site/src/routes/docs/cli/history.fud`

1. **Línea 84.** Problema: tres ejemplos con su condición en una frase, mezclados con paréntesis de código; además usa «historia» donde el resto de la página dice «historial».
   - Original: > Cuando hay historia, cada parte dice algo así: `approved by ana (valid)` o `(expired)`, `tests pass 6/6`, y `spec stale (was pass)` si pasó pero los ficheros han cambiado desde entonces.
   - Propuesta: > Cuando hay historial, cada parte dice algo así: `approved by ana (valid)` o `(expired)`, y `tests pass 6/6`. `spec stale (was pass)` significa que los criterios pasaron, pero los ficheros han cambiado desde entonces.

### `/docs/cli/generate` — `web/apps/site/src/routes/docs/cli/generate.fud`

1. **Línea 75.** Problema: las dos frases son elipsis («Las de cada tipo, en su página»; «…, en [enlace]»).
   - Original: > Las de cada tipo, en su página. Sirven además las de todos los comandos, en [Opciones de todos los comandos].
   - Propuesta: > Cada tipo explica sus opciones en su página. Sirven además las opciones de todos los comandos, explicadas en [Opciones de todos los comandos].

### `/docs/cli/generate/page` — `web/apps/site/src/routes/docs/cli/generate/page.fud`

1. **Línea 39.** Problema: dos incisos entre el verbo y el último complemento («y su test unitario» llega cuando ya se ha perdido el hilo).
   - Original: > Crea la página que responde a una ruta, en `src/routes`, enlazada al layout más cercano, y su test unitario.
   - Propuesta: > Crea en `src/routes` la página que responde a una ruta, y su test unitario. La página enlaza el layout más cercano.

2. **Línea 67.** Problema: ver P3; dos frases sin verbo.
   - Original: > Este layout en vez del más cercano. El de una librería, por su href, como `@shop/ui/layouts/main.fud`.
   - Propuesta: > Usa este layout en vez del más cercano. Uno de una librería se pasa por su href, como `@shop/ui/layouts/main.fud`.

3. **Línea 68.** Problema: la descripción empieza con «Con…» sin verbo y el lector tiene que suponer «crea la página».
   - Original: > Con un `load` declarado en su `.fudapi` e implementado en `src/server`.
   - Propuesta: > Crea la página con un `load`, declarado en su `.fudapi` e implementado en `src/server`.

4. **Línea 104.** Problema: el comando va como inciso entre comas en mitad de una coordinación.
   - Original: > Si no hay ninguno que enlazar, no escribe nada y dice cómo crearlo, `fudic g layout _layout`, o cómo elegir uno con `--layout`.
   - Propuesta: > Si no hay ninguno que enlazar, no escribe nada. Dice cómo crear uno, con `fudic g layout _layout`, o cómo elegir uno con `--layout`.

### `/docs/cli/generate/layout` — `web/apps/site/src/routes/docs/cli/generate/layout.fud`

1. **Línea 39.** Problema: la definición de layout, en inciso, separa «Crea un layout» de «y su test unitario»; «las páginas de debajo» es vago.
   - Original: > Crea un layout en `src/layouts`, el marco en el que se escriben las páginas de debajo, y su test unitario.
   - Propuesta: > Crea un layout en `src/layouts`, y su test unitario. Un layout es el marco en el que se escriben las páginas que tiene debajo.

2. **Línea 109.** Problema: dos «lo» seguidos sin antecedente en la frase.
   - Original: > En una librería, las apps que lo usan lo enlazan por el nombre del paquete:
   - Propuesta: > Si el layout está en una librería, las apps que lo usan lo enlazan por el nombre del paquete:

### `/docs/cli/generate/app` — `web/apps/site/src/routes/docs/cli/generate/app.fud`

1. **Línea 39.** Problema: dos incisos de lugar y un participio («servida») entre el verbo y «e instala».
   - Original: > Crea otra app en el workspace, en `apps/`, servida en su propia URL base, e instala sus dependencias.
   - Propuesta: > Crea otra app del workspace en `apps/` e instala sus dependencias. La app se sirve en su propia URL base.

2. **Línea 68.** Problema: ver P3; «que entonces usa» no dice quién usa qué.
   - Original: > Un nombre: su propio layout, por defecto `_layout`. Un href: el de una librería, que entonces usa.
   - Propuesta: > Si es un nombre, crea un layout propio de la app; por defecto, `_layout`. Si es un href, la app usa ese layout de una librería.

3. **Línea 70.** Problema: ver P4.
   - Original: > Una vez publicada, no se cambia.
   - Propuesta: > No la cambies cuando la app ya esté publicada.

### `/docs/cli/generate/lib` — `web/apps/site/src/routes/docs/cli/generate/lib.fud`

1. **Línea 39.** Problema: ver P5.
   - Original: > Crea una librería en el workspace, en `libs/`: componentes que usan tus apps, con lo necesario para probarlos. No se sirve.
   - Propuesta: > Crea una librería en `libs/`, dentro del workspace. Una librería tiene componentes que tus apps usan, con lo necesario para probarlos. No se sirve.

2. **Línea 97.** Problema: «la usa» y «al crearla» tienen antecedentes distintos (librería y app) en la misma frase.
   - Original: > Una app la usa con `fudic add ui --project web`, o al crearla, con `fudic g app admin --uses ui`.
   - Propuesta: > Para que una app use la librería, ejecuta `fudic add ui --project web`. Si la app aún no existe, créala con `fudic g app admin --uses ui`.

### `/docs/cli/generate/guide` — `web/apps/site/src/routes/docs/cli/generate/guide.fud`

1. **Línea 95.** Problema: «Hay una» y «lo dice» obligan a reconstruir el sujeto y el objeto.
   - Original: > Hay una por proyecto, y `fudic new` ya la crea. En un proyecto que ya tiene la suya, no escribe nada y lo dice.
   - Propuesta: > Cada proyecto tiene una sola guía, y `fudic new` ya la crea. Si el proyecto ya tiene la suya, el comando no escribe nada y avisa.

### `/docs/cli/generate/service` — `web/apps/site/src/routes/docs/cli/generate/service.fud`

1. **Línea 63.** Problema: «No es uno para toda la app» tiene un sujeto omitido y un «uno» que hay que interpretar.
   - Original: > No es uno para toda la app: lo provee un componente con `provide()`.
   - Propuesta: > El servicio no es único para toda la app: lo provee un componente con `provide()`.

### `/docs/cli/generate/pipe` — `web/apps/site/src/routes/docs/cli/generate/pipe.fud`

1. **Línea 38.** Problema: la frase enumera tres ficheros y mete dentro una relativa larga («que importan la vista, el servidor y el navegador»).
   - Original: > Crea un pipe en `src/pipes`: su contrato en `<name>.fudapi`, su única implementación en `<name>.ts`, que importan la vista, el servidor y el navegador, y su test unitario.
   - Propuesta: > Crea un pipe en `src/pipes`: su contrato en `<name>.fudapi`, su implementación en `<name>.ts` y su test unitario. La implementación es única: la importan la vista, el servidor y el navegador.

### `/docs/cli/generate/style` — `web/apps/site/src/routes/docs/cli/generate/style.fud`

1. **Línea 38.** Problema: «la añade» y «la adoptan» no tienen sustantivo femenino al que referirse (solo `<name>.css`).
   - Original: > Crea `<name>.css` en el proyecto y la añade a `globalStyles` de `fudic.json`:
   - Propuesta: > Crea la hoja `<name>.css` en el proyecto y la añade a `globalStyles` de `fudic.json`:

### `/docs/cli/generate/snippet` — `web/apps/site/src/routes/docs/cli/generate/snippet.fud`

1. **Línea 39.** Problema: tres «y» encadenados; «con el primero» y «a `<file>.test.ts`» obligan a releer para saber qué se crea y dónde.
   - Original: > Añade un snippet a `src/snippets/<file>.fud`, y crea el fichero con el primero, y su test unitario a `<file>.test.ts`.
   - Propuesta: > Añade un snippet a `src/snippets/<file>.fud` y su test unitario a `<file>.test.ts`. Si el fichero aún no existe, lo crea con ese primer snippet.

### `/docs/cli/generate/spec` — `web/apps/site/src/routes/docs/cli/generate/spec.fud`

1. **Línea 39.** Problema: el complemento de lugar se adelanta y separa el verbo de lo que escribe.
   - Original: > Escribe junto a un componente o a una página sus criterios `.fudspec` y su fixture.
   - Propuesta: > Escribe los criterios `.fudspec` de un componente o de una página, y su fixture, junto a la pieza.

2. **Línea 54.** Problema: el orden de los ejemplos va al revés que el de la descripción (`button` es el nombre, `shop-button` el tag).
   - Original: > Su tag, o su nombre sin el prefijo: `button` o `shop-button`.
   - Propuesta: > Su nombre sin el prefijo, o su tag: `button` o `shop-button`.

3. **Línea 98.** Problema: «lo crea también» puede referirse al componente o al fixture.
   - Original: > Si el componente no existe, lo crea también.
   - Propuesta: > Si el componente no existe, también crea el componente.

4. **Línea 99.** Problema: la frase empieza con una elipsis («El de una página») y acumula tres contenidos y una consecuencia tras los dos puntos.
   - Original: > El de una página lleva una muestra de lo que devuelve su `load`, sus `paths` si los tiene, y ninguna llamada todavía: lo que el fixture no nombra se ejecuta de verdad.
   - Propuesta: > El fixture de una página lleva una muestra de lo que devuelve su `load` y sus `paths`, si los tiene. Todavía no sustituye ninguna llamada: lo que el fixture no nombra se ejecuta de verdad.

### `/docs/cli/generate/flow` — `web/apps/site/src/routes/docs/cli/generate/flow.fud`

1. **Línea 39.** Problema: «entre páginas en `src/flows/…`» parece decir que las páginas están ahí; «todavía sin servicios» queda colgando.
   - Original: > Escribe los criterios `.fudspec` de un flujo entre páginas en `src/flows/<name>.fudspec`, y su fixture, todavía sin servicios.
   - Propuesta: > Escribe en `src/flows/<name>.fudspec` los criterios de un flujo entre páginas, y su fixture. El fixture todavía no sustituye ningún servicio.

2. **Línea 89.** Problema: «pone en su lugar unos en memoria» es opaco: no se sabe qué sustituye a qué.
   - Original: > Un grupo de servicios en el fixture pone en su lugar unos en memoria.
   - Propuesta: > Si el fixture declara un grupo de servicios, esos servicios se sustituyen por otros en memoria.

### `/docs/cli/generate/term` — `web/apps/site/src/routes/docs/cli/generate/term.fud`

1. **Línea 38.** Problema: dos «para» seguidos con sentidos distintos y la ruta en medio.
   - Original: > Escribe un paso propio para los criterios `.fudspec` en `fudic/terms/<kind>/<name>.js`, para lo que no dicen los pasos de serie.
   - Propuesta: > Escribe en `fudic/terms/<kind>/<name>.js` un paso propio para los criterios `.fudspec`. Sirve para decir lo que los pasos de serie no dicen.

2. **Línea 53.** Problema: tres paréntesis seguidos en una sola línea.
   - Original: > `given` (cómo empieza), `when` (lo que hace el usuario) o `then` (lo que se comprueba).
   - Propuesta: > `given` dice cómo empieza; `when`, lo que hace el usuario; y `then`, lo que se comprueba.

3. **Línea 54.** Problema: «Lo que escriben los criterios» no explica que es la palabra con la que se invoca el paso.
   - Original: > Lo que escriben los criterios, en kebab-case: `cart-has`.
   - Propuesta: > El nombre del paso, que es lo que escriben los criterios, en kebab-case: `cart-has`.

### `/docs/cli/generate/api` — `web/apps/site/src/routes/docs/cli/generate/api.fud`

1. **Línea 39.** Problema: cuatro «su» con antecedentes distintos; «en su sitio» no dice dónde.
   - Original: > Da su servidor a una ruta o a un componente que ya existe: el `.fudapi` a su lado, su handler en `src/server` y el `<link rel="server">` en su sitio.
   - Propuesta: > Da su servidor a una ruta o a un componente que ya existe. Escribe el `.fudapi` al lado de la pieza y el handler en `src/server`, y añade el `<link rel="server">` al `.fud`.

2. **Línea 52.** Problema: «relativo al proyecto» llega al final, tras dos alternativas, y no se sabe a qué se aplica.
   - Original: > El `.fud` de una ruta o de un componente, o la carpeta de un componente, relativo al proyecto:
   - Propuesta: > Una ruta relativa al proyecto: el `.fud` de una ruta o de un componente, o la carpeta de un componente. Por ejemplo:

### `/docs/cli/generate/showcase` — `web/apps/site/src/routes/docs/cli/generate/showcase.fud`

1. **Línea 38.** Problema: la segunda frase son dos elipsis separadas por punto y coma; falta el verbo («van»).
   - Original: > En un workspace, en una app que usa la librería; en una app sola, en `src/routes/showcase`.
   - Propuesta: > En un workspace, las páginas van en una app que usa la librería. En una app sola, van en `src/routes/showcase`.

2. **Línea 62.** Problema: «la enseña» y «la crea» tienen antecedentes distintos (librería y app).
   - Original: > La app que la enseña. Por defecto, `showcase`. Si no existe, la crea.
   - Propuesta: > La app que enseña la librería. Por defecto, `showcase`. Si esa app no existe, la crea.

3. **Línea 80.** Problema: el sujeto de «Se vuelve a ejecutar» no está y «sus propias páginas» es ambiguo.
   - Original: > Se vuelve a ejecutar cada vez que cambia un fixture: reescribe sus propias páginas.
   - Propuesta: > El comando se vuelve a ejecutar cada vez que cambia un fixture, y reescribe las páginas que generó.

### `/docs/cli/generate/error-page` — `web/apps/site/src/routes/docs/cli/generate/error-page.fud`

1. **Línea 52.** Problema: ver P3; dos frases sin verbo y «el que elegiría» sin sujeto.
   - Original: > Este layout en lugar del que elegiría. El de una librería, por su href, como `@shop/ui/layouts/main.fud`.
   - Propuesta: > Usa este layout en lugar del que elegiría el comando. Uno de una librería se pasa por su href, como `@shop/ui/layouts/main.fud`.

2. **Línea 79.** Problema: «depende de ella» y «con ella» se refieren a cosas distintas (la librería y la página de error).
   - Original: > Toda app que depende de ella y no tiene su propio `_error.fud` pinta sus errores con ella.
   - Propuesta: > Toda app que depende de la librería y no tiene su propio `_error.fud` pinta sus errores con esta página.

---

Sin cambios: `/` (`web/apps/site/src/routes/index.fud`, sin prosa), `web/apps/site/src/layouts/_layout.fud` (sin prosa), `/docs/cli/test`, `/docs/cli/fmt`, `/docs/cli/generate/component`, `/docs/cli/generate/form` (fuera del patrón P1, que también las afecta).

---

## Bloque 2. Referencia

Nota: los originales conservan el texto tal como está en el fichero, con `@@`, `&lt;`, `&gt;`, `&#123;` y `&#125;` sin decodificar, para que buscar y reemplazar funcione. Las etiquetas `<code>` se muestran como backticks y el resto de etiquetas (`<strong>`, `<a>`) se han quitado. Si buscas el texto en el fichero, ten en cuenta que esas etiquetas siguen ahí.

### Patrones de este bloque

#### P1. Frase sin verbo en un párrafo de prosa

En una celda o un elemento de lista el estilo telegráfico funciona. En un párrafo suelto, en cambio, obliga a reconstruir el verbo.

- Ejemplo (core, línea 61): > Para leer sin registrar la dependencia, `untrack`.
- Propuesta: > Para leer sin registrar la dependencia, usa `untrack`.
- Páginas: `reference/core.fud` (61), `reference/forms.fud` (104, 157), `reference/di.fud` (120), `reference/i18n.fud` (47), `reference/testing.fud` (42), `reference/fudapi.fud` (373), `reference/fudspec.fud` (129).

#### P2. Dos puntos encadenados en un mismo elemento

Un primer «:» presenta el miembro y un segundo «:» abre una enumeración o una explicación. El lector no sabe cuál de los dos manda.

- Ejemplo (fudapi, línea 243): > `summary`: las reglas del formulario o del grupo: reglas declaradas `on form` u `on group`, …
- Propuesta: cerrar la definición con punto y abrir la enumeración con un verbo («Admite …»).
- Páginas: `reference/fudapi.fud` (238, 243), `reference/testing.fud` (103, 154), `reference/forms.fud` (38), `reference/di.fud` (120).

#### P3. Sujeto que cambia a mitad de frase o pronombre sin antecedente

«lo», «la suya», «le», «ese» o «quien» apuntan a algo que no es el sujeto de la frase anterior.

- Ejemplo (http, línea 90): > …salvo que el handler ponga la suya.
- Páginas: `reference/core.fud` (54, 91), `reference/dom.fud` (69, 72, 116), `reference/forms.fud` (84, 163), `reference/http.fud` (90, 161), `reference/server.fud` (46, 48), `reference/fudspec.fud` (226).

---

### `/docs/reference` — `web/apps/site/src/routes/docs/reference.fud`

1. **Línea 35.** Problema: la página abre con una frase sin verbo, y el lector tarda en ver que esa frase describe la propia sección.
   - Original: > Cada export que usa una app, con su firma, qué hace y sus opciones.
   - Propuesta: > Esta parte recoge cada export que usa una app: su firma, qué hace y sus opciones.

### `/docs/reference/core` — `web/apps/site/src/routes/docs/reference/core.fud`

1. **Línea 54.** Problema: «quien lo lee» y «cuando cambia» no dejan claro quién cambia.
   - Original: > El servidor pinta cada signal con su `initial`; en el navegador, quien lo lee se actualiza cuando cambia.
   - Propuesta: > El servidor pinta cada signal con su `initial`. En el navegador, todo lo que lo lee se actualiza cuando el signal cambia.

2. **Línea 61.** Problema: frase sin verbo (P1).
   - Original: > Para leer sin registrar la dependencia, `untrack`.
   - Propuesta: > Para leer sin registrar la dependencia, usa `untrack`.

3. **Línea 69.** Problema: el inciso «solo si…» y el punto y coma meten tres ideas en una frase, y «uno» no tiene sustantivo.
   - Original: > Se calcula al leerlo, solo si alguna de las fuentes que leyó la última vez cambió; uno que nadie lee nunca se ejecuta.
   - Propuesta: > Se calcula al leerlo, y solo si cambió alguna de las fuentes que leyó la última vez. Un `computed` que nadie lee no se ejecuta nunca.

4. **Línea 91.** Problema: aparece «el aviso» sin haberlo presentado, y «Dentro» no dice de qué.
   - Original: > Dentro, las lecturas ya ven los valores nuevos, y el aviso sale aunque `fn` lance.
   - Propuesta: > Dentro del `batch`, las lecturas ya ven los valores nuevos. Aunque `fn` lance, quien depende de esas escrituras recibe el aviso igual.

5. **Línea 124.** Problema: el orden «y lo que lea `fn` no» obliga a releer.
   - Original: > dice de qué depende: solo esas fuentes cuentan, y lo que lea `fn` no.
   - Propuesta: > fija de qué depende: cuentan solo esas fuentes, no lo que lea `fn`.

6. **Línea 135.** Problema: el participio que abre la frase va sin sujeto expreso, un calco del inglés.
   - Original: > Creado en el nivel superior del `@@code`, muere con su componente.
   - Propuesta: > Un efecto creado en el nivel superior del `@@code` muere con su componente.

7. **Línea 157.** Problema: «llamar» en uso intransitivo («la tarea llama sola», «Crear la tarea no llama») suena a calco y no dice qué se llama.
   - Original: > Cada vez que cambia lo que lee, la tarea llama sola. Crear la tarea no llama.
   - Propuesta: > Cada vez que cambia algo de lo que lee, la tarea hace la llamada sola. Crearla no hace ninguna llamada.

8. **Línea 171.** Problema: el mismo «llama» intransitivo de la línea 157.
   - Original: > En el servidor una tarea nunca llama:
   - Propuesta: > En el servidor una tarea nunca hace la llamada:

9. **Línea 241.** Problema: en una sola frase el sujeto cambia tres veces: el servidor, el valor y el navegador.
   - Original: > En el `@@code` de un `.fud` solo puede ser el argumento entero de un `signal`: el servidor lo calcula una vez por render, viaja con la página y el navegador lo lee de ahí sin volver a llamarlo.
   - Propuesta: > En el `@@code` de un `.fud` solo puede ser el argumento entero de un `signal`. El servidor lo calcula una vez por render y el valor viaja con la página; el navegador lo lee de ahí sin volver a llamar a `now`.

10. **Línea 249.** Problema: la finalidad («para que otro backend…») va colgada al final de una frase que ya traía dos ideas.
    - Original: > Los seis de `@@fudic/core` usan el `Intl` estándar, y sus opciones son datos, para que otro backend formatee igual con su ICU.
    - Propuesta: > Los seis de `@@fudic/core` usan el `Intl` estándar. Sus opciones son datos, así que otro backend puede formatear igual con su propia ICU.

11. **Línea 306.** Problema: «con su `name`» queda descolgado al final de la frase.
    - Original: > `kind` es `"pipe"` para un pipe del proyecto, declarado en un `.fudapi`, con su `name`.
    - Propuesta: > Un pipe del proyecto, declarado en un `.fudapi`, tiene `kind` `"pipe"` y su nombre en `name`.

12. **Línea 314.** Problema: tres complementos seguidos separados por comas, y la aclaración de dónde actúa el compilador llega al final.
    - Original: > El compilador cambia cada uso por el texto fijo, `"en"` o `"es"`, en el `.fud` y en los módulos `.ts` de la app.
    - Propuesta: > En el `.fud` y en los módulos `.ts` de la app, el compilador cambia cada uso por el texto fijo del idioma, `"en"` o `"es"`.

### `/docs/reference/dom` — `web/apps/site/src/routes/docs/reference/dom.fud`

1. **Línea 50.** Problema: frase larga con tres ideas unidas por «y», y la «y» final hace de causa.
   - Original: > Sale como un `CustomEvent` estándar con `bubbles` y `composed`, así que cruza los shadow roots, y lo recibe cualquier elemento con `bus:name`. Fudic hidrata antes a los receptores, y el primer evento no se pierde.
   - Propuesta: > Sale como un `CustomEvent` estándar con `bubbles` y `composed`, así que cruza los shadow roots. Lo recibe cualquier elemento con `bus:name`. Fudic hidrata antes a los receptores, así que el primer evento no se pierde.

2. **Línea 68.** Problema: la construcción pasiva «va tipado por» se entiende a la segunda lectura.
   - Original: > va tipado por los receptores de ese nombre: tiene que valer para el parámetro de todos.
   - Propuesta: > tiene el tipo que fijan los receptores de ese nombre: tiene que valer para el parámetro de todos ellos.

3. **Línea 69.** Problema: no queda claro a qué se refiere «le» (P3).
   - Original: > el compilador le da el componente desde el que sale.
   - Propuesta: > el compilador le pasa a `emit` el componente desde el que sale el evento.

4. **Línea 72.** Problema: «lo» no tiene antecedente cercano (P3).
   - Original: > Los tipos que lo calculan:
   - Propuesta: > Los tipos que calculan esos argumentos:

5. **Línea 106.** Problema: tres ideas en una frase; la última va pegada con «y».
   - Original: > Como con el HTML, la marca se pone en el `@@code`, donde la ve quien revisa el código, y ningún dato la lleva.
   - Propuesta: > Como con el HTML, la marca se pone en el `@@code`, donde la ve quien revisa el código. Ningún dato la lleva.

6. **Línea 116.** Problema: en «cuyo origen no fija el texto del atributo» cuesta ver qué es sujeto y qué es objeto, y luego «Si no es segura» no tiene antecedente femenino.
   - Original: > Un `href` o un `src` cuyo origen no fija el texto del atributo pasa por la guarda antes de escribirse, igual en el servidor y en el navegador. Si no es segura, se escribe `INERT_URL`, que vale `"about:blank"`.
   - Propuesta: > Cuando el texto de un `href` o un `src` no fija el origen de la URL, el valor pasa por la guarda antes de escribirse, igual en el servidor que en el navegador. Si la URL no es segura, se escribe `INERT_URL`, que vale `"about:blank"`.

### `/docs/reference/forms` — `web/apps/site/src/routes/docs/reference/forms.fud`

1. **Línea 38.** Problema: el inciso «desde …» va metido entre dos puntos, y luego vienen otros dos puntos (P2). Además, «una API que empieza por `$`» suena raro.
   - Original: > El formulario que declara un `.fudapi` llega ya hecho, desde `fudic:forms/&lt;id&gt;`: es un objeto con sus campos por nombre y una API que empieza por `$`.
   - Propuesta: > El formulario que declara un `.fudapi` llega ya hecho y se importa de `fudic:forms/&lt;id&gt;`. Es un objeto con sus campos por nombre y una API cuyos miembros empiezan por `$`.

2. **Línea 55.** Problema: «un grupo es un array dentro» y «`undefined` sale `null`» son elipsis que obligan a releer.
   - Original: > un grupo es un array dentro. `undefined` sale `null`.
   - Propuesta: > cada grupo es un array anidado. Un `undefined` sale como `null`.

3. **Línea 63.** Problema: «Es una carga» usa jerga sin explicarla, y la frase encadena causa, consecuencia y un añadido.
   - Original: > Es una carga: el valor nuevo pasa a ser el de partida, así que nada queda modificado ni tocado, y se limpian los errores.
   - Propuesta: > Cuenta como una carga: el valor nuevo pasa a ser el de partida, así que ningún campo queda modificado ni tocado. También limpia los errores.

4. **Línea 73.** Problema: «no lo que decide el envío» no tiene un paralelo gramatical con «es para la vista».
   - Original: > No publica nada: es para la vista, no lo que decide el envío.
   - Propuesta: > No publica nada: sirve a la vista, pero no decide el envío.

5. **Línea 83.** Problema: con «, o `""`, y todos» cuesta saber qué devuelve cada función.
   - Original: > el primer texto de ese resumen, o `""`, y todos.
   - Propuesta: > el primer texto de ese resumen, o `""`; el segundo, todos los textos.

6. **Línea 84.** Problema: «sus textos» es ambiguo: ¿los del formulario o los del resumen? (P3)
   - Original: > sus textos y, después de un envío, el error visible de cada campo, en orden.
   - Propuesta: > los textos del resumen y, después de un envío, el error visible de cada campo, en orden.

7. **Línea 104.** Problema: el párrafo abre con un nombre de tipo suelto, sin verbo (P1).
   - Original: > `Control&lt;T&gt;`. El que genera el `.fudapi` es un `TypedControl&lt;T&gt;`, que además dice su tipo.
   - Propuesta: > Un campo es un `Control&lt;T&gt;`. El que genera el `.fudapi` es un `TypedControl&lt;T&gt;`, que además dice su tipo.

8. **Línea 116.** Problema: «el suyo o el de su formulario» no dice de qué.
   - Original: > cuándo valida, el suyo o el de su formulario.
   - Propuesta: > cuándo valida: con su propio `validate-on` o con el de su formulario.

9. **Línea 157.** Problema: frase sin verbo al abrir el párrafo (P1).
   - Original: > De cada regla, su frase.
   - Propuesta: > Una frase por cada regla.

10. **Línea 163.** Problema: con «que recibe una regla del servidor» no se sabe quién recibe a quién (P3).
    - Original: > el `ctx` de la petición, que recibe una regla del servidor.
    - Propuesta: > el `ctx` de la petición, que se pasa a las reglas del servidor.

11. **Línea 181.** Problema: la segunda frase no tiene verbo principal y luego cambia de sujeto («y recibe el foco»).
    - Original: > Con `fields`, también el error de cada campo, enlazado, y recibe el foco tras un envío fallido.
    - Propuesta: > Con `fields`, muestra también el error de cada campo, enlazado, y recibe el foco tras un envío fallido.

### `/docs/reference/di` — `web/apps/site/src/routes/docs/reference/di.fud`

1. **Línea 51.** Problema: «Su constructor» puede leerse como el de `Service`, no el de la clase registrada.
   - Original: > Su constructor no recibe argumentos: lo que necesita, lo pide con `inject` en sus campos.
   - Propuesta: > El constructor de la clase no recibe argumentos: lo que necesita lo pide con `inject` en sus campos.

2. **Línea 72.** Problema: «el primer componente de arriba» es vago, y el «solo para tokens» del final se lee como si afectara a toda la frase.
   - Original: > el primer componente de arriba que lo provee con `provide`; si no, la raíz (`Service` o `provide` en un módulo); si no, lo que publicó el servidor con `publish`, solo para tokens.
   - Propuesta: > primero, el componente más cercano por encima que lo provee con `provide`; si no hay, la raíz (`Service` o `provide` en un módulo); y si es un token, lo que publicó el servidor con `publish`.

3. **Línea 89.** Problema: «no se hidrata por proveer» se lee como «no se hidrata para proveer».
   - Original: > Ese componente no se hidrata por proveer.
   - Propuesta: > Proveer no obliga a hidratar ese componente.

4. **Línea 120.** Problema: la frase abre con un complemento seguido de dos puntos y sin verbo (P1, P2), y el sujeto de «Viaja» queda implícito.
   - Original: > En el servidor, durante una petición: deja un valor para el navegador. Viaja con la página y los dos lados construyen sus servicios a partir de él.
   - Propuesta: > Deja un valor para el navegador. Se llama en el servidor, durante una petición. El valor viaja con la página y los dos lados construyen sus servicios a partir de él.

### `/docs/reference/i18n` — `web/apps/site/src/routes/docs/reference/i18n.fud`

1. **Línea 47.** Problema: el párrafo abre sin verbo y no dice qué hace `t` (P1).
   - Original: > Un texto en el idioma en que se escribe el código.
   - Propuesta: > Recibe un texto en el idioma en que está escrito el código y lo cambia por su traducción.

2. **Línea 51.** Problema: el inciso condicional parte la definición, y «escrito ahí mismo» es vago.
   - Original: > `args`, si el mensaje tiene huecos, es un objeto escrito ahí mismo con una clave por hueco.
   - Propuesta: > Si el mensaje tiene huecos, `args` es un objeto escrito en la propia llamada, con una clave por hueco.

3. **Línea 70.** Problema: la elipsis no deja ver que describe el orden en que se elige el caso.
   - Original: > Primero un caso exacto `=N`, luego la categoría de `Intl.PluralRules` del idioma, y si no, `other`.
   - Propuesta: > Se elige primero un caso exacto `=N`; si no hay, la categoría de `Intl.PluralRules` del idioma; y si tampoco, `other`.

### `/docs/reference/http` — `web/apps/site/src/routes/docs/reference/http.fud`

1. **Línea 60.** Problema: en «si la ruta no tiene» falta el objeto, y las tres alternativas van encadenadas con «o».
   - Original: > Recibe lo que devolvió `load`, o `undefined` si la ruta no tiene, o la `ErrorPage` en `_error.fud`.
   - Propuesta: > Recibe lo que devolvió `load`; `undefined` si la ruta no tiene `load`; o la `ErrorPage` en `_error.fud`.

2. **Línea 77.** Problema: «mitad de servidor de un middleware» se usa antes de explicar que un middleware tiene dos mitades (eso llega en la línea 96).
   - Original: > `ServerContext`, lo que recibe cada handler y cada mitad de servidor de un middleware:
   - Propuesta: > `ServerContext` es lo que recibe cada handler y la mitad de servidor de cada middleware (un middleware tiene una mitad para el servidor y otra para el navegador):

3. **Línea 90.** Problema: frase larga con un inciso, y «la suya» no tiene antecedente claro (P3).
   - Original: > Leer la sesión hace privada la respuesta: cualquier lectura de `ctx.cookies`, o de las cabeceras `cookie` o `authorization`, la manda con `Cache-Control: private, no-store`, salvo que el handler ponga la suya.
   - Propuesta: > Leer la sesión hace privada la respuesta. Cualquier lectura de `ctx.cookies`, o de las cabeceras `cookie` o `authorization`, la envía con `Cache-Control: private, no-store`, salvo que el handler ponga su propia `Cache-Control`.

4. **Línea 92.** Problema: una sola frase reúne cinco ideas, con aposiciones dentro de una enumeración.
   - Original: > `ClientContext` es el de la mitad del navegador de un middleware: lo mismo sin `params`, `cookies` ni `response`, con `headers` que se pueden cambiar antes de enviar, `catches`, los status que la función deja a quien llama, y `base`, la de la app.
   - Propuesta: > `ClientContext` es el `ctx` de la mitad del navegador de un middleware. Tiene lo mismo, salvo `params`, `cookies` y `response`. Sus `headers` se pueden cambiar antes de enviar, y añade `catches`, con los status que la función deja a quien llama, y `base`, la de la app.

5. **Línea 161.** Problema: el sujeto («la redirección») queda implícito en las dos frases, y «sin él» se aleja de su antecedente.
   - Original: > Desde una función, viaja en el problema y la sigue el middleware `error-pages`; sin él, quien llama recibe el `Redirect`. Las cookies que se pusieron antes salen con ella.
   - Propuesta: > Lanzada desde una función, la redirección viaja en el problema y la sigue el middleware `error-pages`. Sin ese middleware, quien llama recibe el `Redirect`. Las cookies puestas antes salen con la redirección.

6. **Línea 218.** Problema: cuatro «con» seguidos con sentidos distintos, y no se ven los casos.
   - Original: > Lanza un `TypeError` con un nombre que no vale, con `sameSite: "none"` o `partitioned` sin `secure`, y con un `__Host-` que lleva `domain` o un `path` que no es `/`.
   - Propuesta: > Lanza un `TypeError` en tres casos: un nombre que no vale; `sameSite: "none"` o `partitioned` sin `secure`; y un nombre `__Host-` con `domain` o con un `path` distinto de `/`.

### `/docs/reference/server` — `web/apps/site/src/routes/docs/reference/server.fud`

1. **Línea 46.** Problema: con «del `server.mjs` que escribe» no queda claro quién escribe (P3).
   - Original: > es `createApp(&#123; prerendered &#125;)`, del `server.mjs` que escribe en `.fudic/edge`.
   - Propuesta: > es `createApp(&#123; prerendered &#125;)`, que exporta el `server.mjs` que el build escribe en `.fudic/edge`.

2. **Línea 48.** Problema: la segunda frase tiene como sujeto «Lo que no es suyo», pero quien devuelve `null` es el servidor (P3). El inciso «ya pintadas o pintadas en ese momento» también corta la enumeración.
   - Original: > Lo que no es suyo, un fichero estático, devuelve `null` para que lo sirva quien lo monta.
   - Propuesta: > Si la petición no es suya, como la de un fichero estático, devuelve `null` para que la atienda quien monta el servidor.

3. **Línea 58.** Problema: «Pasar uno» es ambiguo, porque puede leerse como «pasar un fichero».
   - Original: > Pasar uno es un `413`.
   - Propuesta: > Superar cualquiera de ellos responde con un `413`.

4. **Línea 61.** Problema: la descripción no dice qué valor activa el comportamiento.
   - Original: > un `500` lleva su mensaje.
   - Propuesta: > con `true`, un `500` lleva el mensaje del error.

5. **Línea 70.** Problema: falta la preposición, en «una navegación que nada respondió».
   - Original: > para una navegación que nada respondió.
   - Propuesta: > para una navegación a la que nada respondió.

6. **Línea 94.** Problema: la misma falta de preposición, y «lo que» como sujeto se lee mal.
   - Original: > Con `notFound: true`, lo que nada respondió recibe la página de error;
   - Propuesta: > Con `notFound: true`, una petición a la que nada respondió recibe la página de error;

### `/docs/reference/testing` — `web/apps/site/src/routes/docs/reference/testing.fud`

1. **Línea 42.** Problema: frase sin verbo (P1).
   - Original: > Para probar en un navegador de verdad, los criterios del `.fudspec` con `fudic spec`
   - Propuesta: > Para probar en un navegador de verdad están los criterios del `.fudspec`, que ejecuta `fudic spec`

2. **Línea 72.** Problema: el inciso «por defecto» se mete entre el valor y lo que hace.
   - Original: > `"ssr"`, por defecto, lo pinta el servidor y el navegador lo hidrata; las props tienen que ser JSON o `Date`. `"client"` lo crea el navegador.
   - Propuesta: > con `"ssr"`, el valor por defecto, lo pinta el servidor y el navegador lo hidrata; las props tienen que ser JSON o `Date`. Con `"client"`, lo crea el navegador.

3. **Línea 103.** Problema: dos puntos encadenados (P2) y «o varios» llega tarde.
   - Original: > un nombre de los `data` de la fixture de la ruta, o varios: el primero para la página y los siguientes para cada vez que pide sus datos otra vez. No va con `data`.
   - Propuesta: > uno o varios nombres del grupo `data` de la fixture de la ruta. El primero es para la página, y los siguientes para cada vez que pide sus datos otra vez. No se combina con la opción `data`.

4. **Línea 104.** Problema: no se ve qué opción corresponde a qué grupo.
   - Original: > grupos `calls` y `services` de la fixture.
   - Propuesta: > nombres de los grupos `calls` y `services` de la fixture, respectivamente.

5. **Línea 122.** Problema: «`props`, o cada una con su valor por defecto» no se entiende a la primera.
   - Original: > `props`, o cada una con su valor por defecto;
   - Propuesta: > `props`, y si falta, cada prop toma su valor por defecto;

6. **Línea 148.** Problema: falla la concordancia: en «se mandaron invalidar» el verbo es impersonal.
   - Original: > las rutas que se mandaron invalidar al Service Worker simulado.
   - Propuesta: > las rutas que se pidió invalidar al Service Worker simulado.

7. **Línea 154.** Problema: dos puntos encadenados (P2) seguidos de una lista larga, y el «con `"self"`…» final no se sabe a qué miembro se aplica.
   - Original: > cómo se pidió el shadow root: `mode`, `delegatesFocus`, `clonable`, `serializable`, `referenceTarget` y `adoptedStyleSheets`, con `"self"` para la hoja del propio componente.
   - Propuesta: > las opciones con las que se pidió el shadow root, que son `mode`, `delegatesFocus`, `clonable`, `serializable`, `referenceTarget` y `adoptedStyleSheets`. En `adoptedStyleSheets`, `"self"` es la hoja del propio componente.

8. **Línea 206.** Problema: «va con el reloj» es vago.
   - Original: > va con el reloj del criterio.
   - Propuesta: > cuenta el tiempo con el reloj del criterio.

### `/docs/reference/fudapi` — `web/apps/site/src/routes/docs/reference/fudapi.fud`

1. **Línea 49.** Problema: la enumeración mezcla sustantivos con un infinitivo, «un número impar» no dice de qué, y el verbo va en singular.
   - Original: > un tabulador, un número impar o saltarse un nivel es
   - Propuesta: > un tabulador, un número impar de espacios o un nivel saltado dan

2. **Línea 72.** Problema: «Mezclarlos» parece referirse a `type` y `enum`, pero se refiere a los dos tipos de fichero.
   - Original: > `type` y `enum` caben en los dos. Mezclarlos es
   - Propuesta: > `type` y `enum` caben en los dos tipos de fichero. Mezclar contrato y extensiones en un mismo fichero es

3. **Línea 90.** Problema: el inciso condicional y el ejemplo entre dos puntos parten la frase, y la última idea va pegada con «y».
   - Original: > `&lt;route&gt;`, si se da, añade segmentos a su URL: `/items/:id`, y cada `:param` necesita un argumento con ese nombre.
   - Propuesta: > Si se da `&lt;route&gt;`, añade segmentos a su URL, como `/items/:id`. Cada `:param` necesita un argumento con ese nombre.

4. **Línea 95.** Problema: «o en la query en una `get`» acumula dos «en» con sentidos distintos.
   - Original: > Va en la ruta si se llama como un parámetro; si no, en el cuerpo, o en la query en una `get`.
   - Propuesta: > Va en la ruta si se llama como un parámetro; si no, en el cuerpo, o en la query si la función es `get`.

5. **Línea 98.** Problema: «son del último de la línea» deja implícito el sustantivo.
   - Original: > Sus parámetros van en líneas debajo, y son del último de la línea.
   - Propuesta: > Los parámetros van en líneas debajo y son del último middleware de la línea.

6. **Línea 142.** Problema: «Sin él» y «sin él» remiten a cosas distintas (el modo y `load`), y la frase obliga a releer.
   - Original: > Sin él, una ruta sin parámetros es `sw` con `load` y `ssg` sin él; con parámetros, `ssg` si tiene `paths` y `sw` si no.
   - Propuesta: > Si no se escribe, se deduce: una ruta sin parámetros es `sw` si tiene `load` y `ssg` si no lo tiene; una ruta con parámetros es `ssg` si tiene `paths` y `sw` si no.

7. **Línea 164.** Problema: «la global» va sin sustantivo, y «su fichero» y «su chain» se leen como cosas distintas.
   - Original: > Una función hereda la global, menos lo que quite el `skip` de su fichero, más lo que añada su `chain`.
   - Propuesta: > Una función hereda la cadena global, menos lo que quite el `skip` de su fichero y más lo que añada la `chain` de su fichero.

8. **Línea 189.** Problema: «contenerse a sí mismo por campos obligatorios» se entiende mal: ese «por» es «a través de».
   - Original: > Un `type` no puede contenerse a sí mismo por campos obligatorios
   - Propuesta: > Un `type` no puede contenerse a sí mismo a través de campos obligatorios

9. **Línea 238.** Problema: dos puntos encadenados (P2), y la segunda frase no tiene verbo.
   - Original: > cuándo valida: al enviar, al salir del campo, al escribir. En el formulario, en un grupo o en un campo.
   - Propuesta: > cuándo valida, al enviar, al salir del campo o al escribir. Se pone en el formulario, en un grupo o en un campo.

10. **Línea 239.** Problema: «cuenta» no tiene sujeto, y el inciso «por defecto» corta la segunda opción.
    - Original: > `rules`, cuenta en cuanto se cumplen las reglas; `interacted`, por defecto, solo cuando el usuario pasó por el campo.
    - Propuesta: > con `rules`, la validez cuenta en cuanto se cumplen las reglas; con `interacted`, el valor por defecto, solo cuenta cuando el usuario pasó por el campo.

11. **Línea 243.** Problema: dos puntos encadenados (P2) y una enumeración sin verbo.
    - Original: > las reglas del formulario o del grupo: reglas declaradas `on form` u `on group`, `require` con una expresión y `when`, que agrupa `require` bajo una condición.
    - Propuesta: > las reglas del formulario o del grupo. Admite reglas declaradas `on form` u `on group`, `require` con una expresión, y `when`, que agrupa varios `require` bajo una condición.

12. **Línea 246.** Problema: una sola frase muy densa, con paréntesis y una enumeración de operadores sin pausas.
    - Original: > Una expresión lee campos por su ruta desde el formulario o el grupo de su `summary` (`password` dentro de `access`, `access.password` desde el formulario) y usa `or`, `and`, `not`, las comparaciones `==`, `!=`, `&lt;`, `&lt;=`, `&gt;` y `&gt;=`, `contains`, y `valid x`, `empty x` y `length x`. Las de orden son para números y fechas.
    - Propuesta: > Una expresión lee campos por su ruta, contada desde el formulario o el grupo de su `summary`: `password` dentro de `access`, `access.password` desde el formulario. Puede usar `or`, `and` y `not`; las comparaciones `==`, `!=`, `&lt;`, `&lt;=`, `&gt;` y `&gt;=`; `contains`; y `valid x`, `empty x` y `length x`. Las comparaciones de orden son para números y fechas.

13. **Línea 288.** Problema: dos elipsis seguidas, separadas por punto y coma.
    - Original: > `debounce`, por defecto 300 ms, solo en una `remote`; `use` y `skip`, no en una `both`.
    - Propuesta: > `debounce` solo vale en una regla `remote`, y por defecto es de 300 ms. `use` y `skip` no valen en una regla `both`.

14. **Línea 309.** Problema: «`adds`, lo que añade…» es una elipsis, y en «Sin mitades» falta el sujeto.
    - Original: > `adds`, lo que añade al `ctx` de quien viene detrás. Sin mitades, es una marca que lee el compilador.
    - Propuesta: > `adds` declara lo que añade al `ctx` de quien viene detrás. Un middleware sin mitades es una marca que lee el compilador.

15. **Línea 326.** Problema: una frase reúne dos instrucciones distintas (qué abarca la expresión y cómo se escribe).
    - Original: > Es todo lo que va detrás del nombre, `#` incluido, sin `^` ni `$`: Fudic la ajusta a todo el valor.
    - Propuesta: > La expresión es todo lo que va detrás del nombre, `#` incluido. Se escribe sin `^` ni `$`: Fudic la ajusta a todo el valor.

16. **Línea 345.** Problema: «la del estándar HTML» no concuerda con ningún sustantivo visible.
    - Original: > Fudic trae `email`, la del estándar HTML.
    - Propuesta: > Fudic trae `email`, el patrón del estándar HTML.

17. **Línea 362.** Problema: la construcción absoluta «con `&lt;id&gt;` su ruta» es un calco y se lee mal.
    - Original: > Cada `.fudapi` es un módulo `fudic:&lt;id&gt;`, con `&lt;id&gt;` su ruta dentro de `src` sin extensión:
    - Propuesta: > Cada `.fudapi` es un módulo `fudic:&lt;id&gt;`, donde `&lt;id&gt;` es su ruta dentro de `src`, sin extensión:

18. **Línea 373.** Problema: frase sin verbo (P1).
    - Original: > Qué hace cada pieza al implementarla:
    - Propuesta: > Lo que hace cada pieza al implementarla está en

### `/docs/reference/fudspec` — `web/apps/site/src/routes/docs/reference/fudspec.fud`

1. **Línea 88.** Problema: dos elipsis seguidas, y «el primero» no dice de qué.
   - Original: > cómo empieza. Como mucho uno, y el primero.
   - Propuesta: > cómo empieza el criterio. Hay como mucho uno, y va el primero.

2. **Línea 100.** Problema: «uno» no tiene sustantivo cercano.
   - Original: > uno en camelCase se lee en kebab-case
   - Propuesta: > un nombre en camelCase se lee en kebab-case

3. **Línea 102.** Problema: «pasos» ya significa una línea de término en esta misma sección, y aquí nombra otra cosa. Además, la frase es larga.
   - Original: > La referencia es una cadena de pasos separados por `&gt;`, cada uno buscado dentro del anterior y entrando en los shadow roots:
   - Propuesta: > La referencia es una cadena de selectores separados por `&gt;`. Cada uno se busca dentro del anterior, entrando en los shadow roots:

4. **Línea 129.** Problema: el párrafo abre sin sujeto expreso, y «Cada nombre es uno de la fixture» va seguido de dos puntos (P1).
   - Original: > En `given`, dicen qué datos usa el criterio. Cada nombre es uno de la fixture:
   - Propuesta: > Las líneas de fixture van en `given` y dicen qué datos usa el criterio. Cada nombre que citan está en la fixture:

5. **Línea 226.** Problema: «contiene ese» deja el referente en el aire (P3).
   - Original: > su texto contiene ese.
   - Propuesta: > el texto del elemento contiene `&lt;expected&gt;`.

### `/docs/reference/diagnostics` — `web/apps/site/src/routes/docs/reference/diagnostics.fud`

1. **Línea 42.** Problema: el sujeto es una pregunta indirecta con un inciso dentro, y el verbo llega al final.
   - Original: > Qué nivel tiene cada aviso en tu proyecto, y cómo se silencia uno en una línea, está en
   - Propuesta: > Para saber qué nivel tiene cada aviso en tu proyecto y cómo silenciar uno en una línea, consulta

### `/docs/reference/diagnostics/[code]` — `web/apps/site/src/routes/docs/reference/diagnostics/[code].fud`

1. **Líneas 11 y 15.** Problema: hay incoherencia de idioma. La meta description de un código encontrado y la `og:description` están en inglés, y la de «no encontrado» en español, en una web en español. Si es intencionado porque el artículo es `lang="en"`, se puede dejar.
   - Original: > What this Fudic diagnostic means and how to fix it.
   - Propuesta: > Qué significa este diagnóstico de Fudic y cómo se arregla.

Sin cambios: ninguna (todas las páginas del alcance tienen al menos un hallazgo).

---

## Bloque 3. Sintaxis .fud, estilos y reactividad

### Patrones de este bloque

1. **Página que no abre con su idea.** Después del `<h1>` viene directamente un `<h2>`, sin una o dos frases que digan de qué va la página.
   - Ejemplo: `template-syntax/events.fud`, `<h1>Eventos</h1>` seguido de `<h2 id="listen">Escuchar un evento</h2>`.
   - Páginas afectadas: `template-syntax/events.fud`, `template-syntax/expressions.fud`, `styles/delivery.fud`, `styles/shared.fud`. En `styles/guide.fud` y `reactivity/hydration.fud` el primer `<h2>` («Qué es», «Qué es hidratar») ya funciona como apertura: bastaría con quitar ese `<h2>` y dejar sus párrafos debajo del `<h1>`.
   - Propuestas de apertura (van entre el `<h1>` y el primer `<h2>`):
     - events: > Un evento se escucha con `@@` delante de su nombre, y su handler es TypeScript completo. Esta página explica también cómo escuchar en una lista y cómo avisar a toda la página con el bus.
     - expressions: > Una expresión escribe un valor en la plantilla, y el control de flujo decide qué se pinta y cuántas veces. Las dos usan la `@@`.
     - delivery: > Fudic envía a cada página solo el CSS que usa. El CSS de los componentes puede ir dentro del HTML o en ficheros aparte.
     - shared: > El CSS que comparten varias páginas o varios componentes va en hojas compartidas. Como el CSS de la página no entra en los componentes, hay una hoja para cada lado.

2. **Dos nombres para lo mismo: «variables CSS» y «custom properties».** Las páginas de estilos alternan los dos términos, a veces en la misma página. Conviene elegir uno (el que use MDN en castellano, o «custom properties», que es el que enlaza `styles.fud`) y usarlo siempre.
   - Ejemplo: `styles/shared.fud`, línea 48: «Las variables CSS son la excepción…»; línea 94: «…son custom properties en el `:root`…».
   - Páginas afectadas: `styles.fud` (custom properties, líneas 70 y 123), `styles/shared.fud` (líneas 48 y 94), `styles/delivery.fud` (variables CSS, líneas 41 y 52).

3. **Frases sin verbo o con elipsis encadenadas** («Con X, esto; con Y, lo otro»). Obligan a reconstruir el verbo de la frase anterior.
   - Ejemplo: `template-syntax/attributes-and-properties.fud`, línea 52: «Con un texto o un número, se escribe ese valor. Con `true`, el atributo vacío, y con `false` o `null`, se quita.»
   - Páginas afectadas: `template-syntax.fud`, `template-syntax/attributes-and-properties.fud`, `template-syntax/components.fud`, `template-syntax/events.fud`, `template-syntax/snippets.fud`, `styles.fud`.

---

### `/docs/template-syntax` — `web/apps/site/src/routes/docs/template-syntax.fud`

1. **Línea 52.** Problema: «es la de» deja el sustantivo implícito y el complemento temporal queda colgando al final.
   - Original: > Microsoft la creó en 2010 y es la de ASP.NET Core y Blazor desde entonces.
   - Propuesta: > Microsoft la creó en 2010 y desde entonces es la sintaxis de ASP.NET Core y Blazor.

2. **Línea 80.** Problema: «Todo es un fichero» es vago y «cada uno» no tiene antecedente claro.
   - Original: > Todo es un fichero `.fud`, y el compilador sabe qué es cada uno por cómo empieza:
   - Propuesta: > Las cuatro son ficheros `.fud`. El compilador distingue cada pieza por cómo empieza:

3. **Línea 83.** Problema: es el único elemento de la lista sin verbo, y el gerundio «envolviendo» es un calco del inglés.
   - Original: > **Componente**: su tag envolviendo un `<template shadowrootmode>`, el Declarative Shadow DOM estándar.
   - Propuesta: > **Componente**: empieza con su propio tag, que envuelve un `<template shadowrootmode>`. Es Declarative Shadow DOM estándar.

4. **Línea 107.** Problema: «no llamar a cualquier función» se puede leer como «no llamar a ninguna»; la negación con «cualquier» es ambigua.
   - Original: > En la plantilla se pueden leer valores, compararlos, combinarlos y recorrer listas, pero no llamar a cualquier función de JavaScript:
   - Propuesta: > En la plantilla se pueden leer valores, compararlos, combinarlos y recorrer listas, pero solo se pueden llamar unas pocas funciones de JavaScript:

5. **Línea 118.** Problema: «esa lista» remite a una lista que no se ha mostrado en esta página, y «C#, Java… están diseñados» omite el sustantivo (los servidores).
   - Original: > La razón de esa lista es que una vista de Fudic se pueda pintar en servidores de otros lenguajes. Hoy el servidor es Node. C#, Java, Go, Rust y Python están diseñados.
   - Propuesta: > Esa limitación existe para que una vista de Fudic se pueda pintar en servidores escritos en otros lenguajes. Hoy el servidor es Node; los de C#, Java, Go, Rust y Python ya están diseñados.

6. **Línea 120.** Problema: dos ideas densas en un párrafo, y la segunda frase adelanta el objeto («Lo que no existe igual en todos… lo pone Fudic»), un orden forzado.
   - Original: > Por eso en la vista solo entra lo que se traduce a los seis lenguajes con el mismo resultado: `filter`, `map`, `reduce`, `toSorted` y `.length` sí; `find` no. Lo que no existe igual en todos, como formatear una fecha o una moneda, lo pone Fudic con un catálogo de pipes escrito para cada lenguaje.
   - Propuesta: > En la vista solo entra lo que da el mismo resultado en los seis lenguajes: `filter`, `map`, `reduce`, `toSorted` y `.length` sí; `find` no. Para lo que cada lenguaje hace a su manera, como formatear una fecha o una moneda, Fudic trae un catálogo de pipes escrito para cada lenguaje.

### `/docs/template-syntax/attributes-and-properties` — `web/apps/site/src/routes/docs/template-syntax/attributes-and-properties.fud`

1. **Línea 43.** Problema: el sujeto de «Si mezcla texto» no está claro (¿el atributo, la expresión?).
   - Original: > Un atributo toma su valor de una expresión con `@@`. Si mezcla texto, va entre comillas:
   - Propuesta: > Un atributo toma su valor de una expresión con `@@`. Si el valor mezcla texto y expresión, va entre comillas:

2. **Línea 52.** Problema: tres elipsis seguidas («Con `true`, el atributo vacío») obligan a reconstruir el verbo.
   - Original: > Con un texto o un número, se escribe ese valor. Con `true`, el atributo vacío, y con `false` o `null`, se quita. Es lo que esperan los atributos booleanos como `disabled`.
   - Propuesta: > Si la expresión da un texto o un número, el atributo lleva ese valor. Si da `true`, el atributo se escribe vacío; si da `false` o `null`, se quita. Es lo que esperan los atributos booleanos como `disabled`.

3. **Línea 59.** Problema: frase sin verbo que termina en dos puntos justo después del código.
   - Original: > Para encender o apagar una clase, `class:nombre=@@condición`:
   - Propuesta: > Para encender o apagar una clase se usa `class:nombre=@@condición`:

4. **Línea 76.** Problema: «al hidratarse» usa un concepto que esta página no presenta y deja implícito quién se hidrata.
   - Original: > Una propiedad no está en el HTML, así que se asigna al hidratarse.
   - Propuesta: > Una propiedad no está en el HTML, así que no se asigna hasta que el componente se hidrata en el navegador.

5. **Línea 122.** Problema: frase larga con dos paréntesis y una justificación encadenada tras los dos puntos.
   - Original: > Un resto se puede leer (`@@rest.placeholder`), pasar a un tag o desestructurar otra vez, pero no recorrer (FUD1147): en otros lenguajes de servidor un objeto no se recorre como en JavaScript.
   - Propuesta: > Un resto se puede leer (`@@rest.placeholder`), pasar a un tag o desestructurar otra vez. Lo que no se puede es recorrerlo (FUD1147), porque en otros lenguajes de servidor un objeto no se recorre como en JavaScript.

### `/docs/template-syntax/await` — `web/apps/site/src/routes/docs/template-syntax/await.fud`

1. **Línea 9 (meta description) y línea 40.** Problema: «lo rápido» es una elipsis que obliga a adivinar el sustantivo (los datos rápidos).
   - Original (línea 9): > la página sale en cuanto llega lo rápido
   - Propuesta: > la página sale en cuanto llegan los datos rápidos
   - Original (línea 40): > Con `@@await`, la página sale en cuanto tiene lo rápido, y cada bloque se pinta en su sitio cuando llega su dato, sin JavaScript.
   - Propuesta: > Con `@@await`, la página sale en cuanto tiene los datos rápidos, y cada bloque se pinta en su sitio cuando llega su dato, sin JavaScript.

2. **Línea 44.** Problema: «es uno que llega» es un calco innecesario.
   - Original: > un campo marcado con `later` es uno que llega después
   - Propuesta: > un campo marcado con `later` llega después

3. **Línea 79.** Problema: «que el hueco no salte» es impreciso (lo que salta es la página) y el paréntesis final corta la idea.
   - Original: > Si quieres que el hueco no salte, resérvalo con CSS (una altura mínima).
   - Propuesta: > Para que la página no salte cuando llegue el dato, resérvale el hueco con CSS, por ejemplo con una altura mínima.

4. **Línea 86.** Problema: la enumeración del paréntesis mezcla adjetivos y un infinitivo, y no concuerda con «lo que decide».
   - Original: > (no encontrada, sin permiso, redirigir)
   - Propuesta: > (si no se encuentra, si falta permiso o si hay que redirigir)

5. **Línea 94.** Problema: el sujeto de «llega» queda ambiguo entre el bloque y sus componentes.
   - Original: > Cada bloque trae sus datos de hidratación, así que sus componentes responden en cuanto llega, aunque el resto siga en camino.
   - Propuesta: > Cada bloque trae sus datos de hidratación, así que sus componentes responden en cuanto llega el bloque, aunque el resto siga en camino.

6. **Línea 98.** Problema: frase larga con tres «lo» que remiten a cosas distintas (el bloque, la técnica).
   - Original: > Para pintar cada bloque en cuanto llega, sin esperar al anterior, otros frameworks lo envían al final y lo mueven con un script. Fudic no lo hace, porque el estándar ya trae la pieza:
   - Propuesta: > Otros frameworks pintan cada bloque en cuanto llega, sin esperar al anterior: lo envían al final y lo mueven a su sitio con un script. Fudic no usa ese script, porque el estándar ya trae la pieza:

7. **Línea 111.** Problema: la nota empieza sin sujeto y «pinta en orden» se lee como un imperativo dirigido al lector.
   - Original: > Ya está en el estándar, y Chrome y Edge traen el soporte inicial. Cuando esté en todos los navegadores, Fudic lo emitirá por debajo de `@@await`, y tu vista no cambiará. Hasta entonces, pinta en orden, que funciona en cualquier navegador.
   - Propuesta: > `<template for>` ya está en el estándar, y Chrome y Edge traen el soporte inicial. Cuando esté en todos los navegadores, Fudic lo emitirá por debajo de `@@await`, y tu vista no cambiará. Hasta entonces, Fudic pinta los bloques en orden, que funciona en cualquier navegador.

### `/docs/template-syntax/components` — `web/apps/site/src/routes/docs/template-syntax/components.fud`

1. **Línea 73.** Problema: gerundio calcado del inglés («envolviendo»).
   - Original: > Su tag, envolviendo un `<template shadowrootmode>`. Todo lo que pinta va dentro.
   - Propuesta: > Su tag, que envuelve un `<template shadowrootmode>`. Todo lo que pinta va dentro.

2. **Línea 76.** Problema: «la parte 4» remite a un número que no se ve, porque la lista es `<ul>` y no está numerada.
   - Original: > Un componente puede ser solo la parte 4: HTML y CSS, sin JavaScript.
   - Propuesta: > Un componente puede ser solo su tag con el `<template>`: HTML y CSS, sin JavaScript.

3. **Línea 105.** Problema: cadena de comas con elipsis («y con `?`, opcional, con su valor…»).
   - Original: > **Sin `?` es obligatoria**, y con `?`, opcional, con su valor por defecto en la desestructuración.
   - Propuesta: > **Sin `?` es obligatoria.** Con `?` es opcional, y su valor por defecto se pone en la desestructuración.

4. **Línea 106.** Problema: el objeto adelantado y retomado con «lo» («El comentario… lo enseña el editor») fuerza el orden.
   - Original: > **El comentario `/** … */`** de cada prop lo enseña el editor al escribir el tag.
   - Propuesta: > **El comentario `/** … */`** de cada prop aparece en el editor al escribir el tag.

5. **Línea 107.** Problema: «un signal leído» es jerga opaca, y «cuando cambia» no dice qué cambia.
   - Original: > **Si el padre pasa un signal leído** (`.text=@@status()`), el hijo se actualiza cuando cambia.
   - Propuesta: > **Si el padre pasa el valor de un signal** (`.text=@@status()`), el hijo se actualiza cuando ese signal cambia.

6. **Línea 180.** Problema: «se anuncia bien» da por sabido quién anuncia (los lectores de pantalla).
   - Original: > así que el switch se anuncia bien antes de cargar ningún script.
   - Propuesta: > así que los lectores de pantalla anuncian bien el switch antes de que cargue ningún script.

7. **Línea 184.** Problema: dos dos puntos seguidos en una sola frase.
   - Original: > **El estilo del host** sale de sus atributos, con `:host()`: `:host([aria-checked="true"])`.
   - Propuesta: > **El estilo del host** depende de sus atributos y se escribe con `:host()`, por ejemplo `:host([aria-checked="true"])`.

### `/docs/template-syntax/events` — `web/apps/site/src/routes/docs/template-syntax/events.fud`

1. **Línea 49.** Problema: la segunda mitad omite el verbo («con `@@remove(item.id)`, lo que le pasas») y `$event` queda suelto al final.
   - Original: > Con `@@save`, la función recibe el evento; con `@@remove(item.id)`, lo que le pasas. `$event` es el evento.
   - Propuesta: > Con `@@save`, la función recibe el evento. Con `@@remove(item.id)`, recibe lo que le pasas, y `$event` es el evento.

2. **Línea 92.** Problema: «lo anuncia» y «lo recibe» no tienen antecedente explícito.
   - Original: > Para avisar a cualquiera de la página, está el bus: `emit` lo anuncia y `bus:` lo recibe.
   - Propuesta: > Para avisar a cualquiera de la página, está el bus: `emit` anuncia un evento y `bus:` lo recibe.

### `/docs/template-syntax/expressions` — `web/apps/site/src/routes/docs/template-syntax/expressions.fud`

1. **Línea 79.** Problema: «son porque» es una construcción coloquial y la frase encadena dos explicaciones.
   - Original: > Las dos últimas filas son porque una condición tiene que ser un booleano: `""` o `0` no cuentan como falso, ya que cada lenguaje lo decide de una forma.
   - Propuesta: > Las dos últimas filas se deben a que una condición tiene que ser un booleano. `""` y `0` no cuentan como falso, porque cada lenguaje lo decide de una forma distinta.

### `/docs/template-syntax/ref-and-raw` — `web/apps/site/src/routes/docs/template-syntax/ref-and-raw.fud`

1. **Línea 37.** Problema: la apertura no nombra las dos salidas, y «los pocos casos que no lo son» obliga a releer.
   - Original: > Casi todo en una plantilla es declarativo. Para los pocos casos que no lo son hay dos salidas.
   - Propuesta: > Casi todo en una plantilla es declarativo. Para lo poco que no lo es hay dos salidas: `ref`, que da el elemento en una variable, y `@@raw`, que escribe HTML.

2. **Línea 64.** Problema: «con un valor marcado» usa la idea de marca antes de presentarla.
   - Original: > Para escribir un valor como HTML está `@@raw`, con un valor marcado en el `@@code`:
   - Propuesta: > Para escribir un valor como HTML está `@@raw`. El valor se marca antes en el `@@code`:

3. **Línea 82.** Problema: el inciso «también uno de tipo `html`» corta la frase entre sujeto y verbo.
   - Original: > Un HTML que llega en los datos de la página o de una función, también uno de tipo `html`, se escribe escapado.
   - Propuesta: > Un HTML que llega en los datos de la página o de una función se escribe escapado, aunque sea de tipo `html`.

### `/docs/template-syntax/snippets` — `web/apps/site/src/routes/docs/template-syntax/snippets.fud`

1. **Línea 54.** Problema: no dice que habla de los argumentos de `@@render`, y «al usarlo se le puede dar» mezcla referentes (snippet y parámetro).
   - Original: > Un texto fijo va tal cual, y un valor, con `@@`. Un parámetro puede tener valor por defecto (`tone: string = "info"`), y al usarlo se le puede dar por su nombre (`tone: "warning"`).
   - Propuesta: > Al usar el snippet, un texto fijo se pasa tal cual y un valor, con `@@`. Un parámetro puede tener valor por defecto (`tone: string = "info"`), y se le puede pasar un valor por su nombre (`tone: "warning"`).

2. **Línea 58.** Problema: la relativa «que crea `fudic g snippet…`» invierte sujeto y verbo y alarga la frase hasta el enlace.
   - Original: > Para compartirlo, va en un fichero de snippets en `src/snippets/`, que crea `fudic g snippet ui priceTag`, y se enlaza con `<link rel="snippet">`:
   - Propuesta: > Para compartirlo, va en un fichero de snippets en `src/snippets/`, que se crea con `fudic g snippet ui priceTag`. Después se enlaza con `<link rel="snippet">`:

### `/docs/styles` — `web/apps/site/src/routes/docs/styles.fud`

1. **Línea 62.** Problema: la última frase encadena tres oraciones con «y».
   - Original: > el `<template shadowrootmode>` crea un shadow root, y el CSS de dentro no sale y el de fuera no entra.
   - Propuesta: > el `<template shadowrootmode>` crea un shadow root. El CSS de dentro no sale de él, y el de fuera no entra.

2. **Línea 76.** Problema: frase sin verbo seguida de punto y coma; «le da forma y valor» no dice con qué.
   - Original: > Un ejemplo con dos de ellas. El componente marca su barra con `part="bar"` y lee su ancho de `--progress`; la página le da forma y valor:
   - Propuesta: > Este ejemplo usa dos de ellas. El componente marca su barra con `part="bar"` y lee su ancho de `--progress`. La página le da forma con `::part()` y valor con `--progress`:

3. **Línea 110 (nota).** Problema: frase larga con dos acciones, y el «la» de «la llevó» no tiene antecedente (el sustantivo «propuesta» no aparece).
   - Original: > En 2024, Microsoft propuso declarar el módulo en la página con `specifier` y adoptarlo con `shadowrootadoptedstylesheets`, y la llevó al WHATWG (whatwg/html#10673).
   - Propuesta: > En 2024, Microsoft propuso declarar el módulo en la página con `specifier` y adoptarlo con `shadowrootadoptedstylesheets`. Llevó la propuesta al WHATWG (whatwg/html#10673).

4. **Línea 119.** Problema: gerundio, inciso y paréntesis en una sola frase; `class:` aparece al final, lejos de lo que hace.
   - Original: > Lo que cambia con el estado va en el markup, eligiendo entre reglas que el `<style>` ya tiene, con `class:` (Atributos y propiedades).
   - Propuesta: > Lo que cambia con el estado va en el markup: `class:` elige entre reglas que el `<style>` ya tiene (Atributos y propiedades).

### `/docs/styles/delivery` — `web/apps/site/src/routes/docs/styles/delivery.fud`

1. **Línea 58 (nota).** Problema: objeto adelantado retomado con «lo», y «su regla» es ambiguo.
   - Original: > Lo que un script hace a mano, como `classList.add()`, no lo ve el compilador, y su regla puede no llegar.
   - Propuesta: > El compilador no ve lo que un script hace a mano, como `classList.add()`, así que la regla de esa clase puede no llegar.

2. **Línea 66.** Problema: elemento de lista largo con tres ideas, y «lo adopta el polyfill» confunde quién adopta.
   - Original: > va dentro del HTML, una vez por página, y lo adopta el polyfill (Una copia por página). La página se pinta con su estilo sin esperar a ninguna petición, pero el CSS no se guarda en la caché.
   - Propuesta: > va dentro del HTML, una vez por página, y los componentes lo adoptan con el polyfill (Una copia por página). La página se pinta con su estilo sin esperar a ninguna petición, pero el CSS no se guarda en la caché.

3. **Línea 79.** Problema: el sujeto es largo y el dato importante («en los dos casos») queda al final.
   - Original: > La hoja de la página que enlazas tú con `<link rel="stylesheet">` es un fichero en los dos casos.
   - Propuesta: > En los dos casos, la hoja de la página que enlazas con `<link rel="stylesheet">` es un fichero.

### `/docs/styles/guide` — `web/apps/site/src/routes/docs/styles/guide.fud`

1. **Línea 44.** Problema: «Su `fudic.json`» puede ser el de la app (la última mencionada) o el de la guía.
   - Original: > Su `fudic.json` dice cuál es su hoja de entrada y su favicon:
   - Propuesta: > El `fudic.json` de la guía dice cuál es su hoja de entrada y su favicon:

### `/docs/styles/shared` — `web/apps/site/src/routes/docs/styles/shared.fud`

1. **Línea 60.** Problema: «ruta» en esta web significa página; aquí se refiere a la ruta del fichero, y se lee mal.
   - Original: > La ruta es relativa al `.fud`.
   - Propuesta: > El `href` es relativo al `.fud`.

2. **Línea 110.** Problema: el inciso «componentes incluidos» corta la frase y «todo lo que contiene» no tiene sujeto claro.
   - Original: > Como se heredan, una zona de la página puede cambiarlos y todo lo que contiene, componentes incluidos, usa el valor nuevo:
   - Propuesta: > Como se heredan, una zona de la página puede cambiarlos. Todo lo que hay dentro de esa zona usa el valor nuevo, también los componentes:

### `/docs/reactivity` — `web/apps/site/src/routes/docs/reactivity.fud`

1. **Línea 43.** Problema: «lo» queda lejos de su antecedente (JavaScript).
   - Original: > hay una propuesta en el TC39, el comité que lo mantiene.
   - Propuesta: > hay una propuesta en el TC39, el comité que mantiene JavaScript.

2. **Línea 82.** Problema: párrafo denso; «lo» no tiene sujeto explícito al abrir y «se escribe con lo mismo que» es confuso.
   - Original: > Si la plantilla lo lee, el servidor también lo calcula, y ese servidor puede no ser Node (vistas políglotas). Por eso se escribe con lo mismo que una expresión de la plantilla: una flecha sin llaves y la lista de operaciones de la vista. Un `find`, por ejemplo, da error (FUD1140); se escribe `filter(…)[0]`.
   - Propuesta: > Si la plantilla lee un `computed`, el servidor también lo calcula, y ese servidor puede no ser Node (vistas políglotas). Por eso se escribe como una expresión de la plantilla: una flecha sin llaves y la lista de operaciones de la vista. Un `find`, por ejemplo, da error (FUD1140); en su lugar se escribe `filter(…)[0]`.

3. **Línea 117.** Problema: «sin comprobar dónde está» no dice qué hay que comprobar.
   - Original: > un `effect` no se ejecuta, así que puede usar `document` o `window` sin comprobar dónde está.
   - Propuesta: > un `effect` no se ejecuta, así que puede usar `document` o `window` sin comprobar si está en el navegador.

4. **Línea 154.** Problema: error gramatical, «de el» en lugar de «del».
   - Original: > mira el ejemplo de <a href="/docs/reactivity/lifecycle#route-hooks">el ciclo de una página</a>.
   - Propuesta: > mira el ejemplo del <a href="/docs/reactivity/lifecycle#route-hooks">ciclo de una página</a>.

### `/docs/reactivity/lifecycle` — `web/apps/site/src/routes/docs/reactivity/lifecycle.fud`

1. **Línea 61.** Problema: «función» aparece tres veces con referentes distintos (el hook, la que recibe, la que se ejecuta).
   - Original: > Son funciones de `@@code` que no se importan. Reciben la función que se ejecutará en su momento, y esa función recibe `host`, el tag del componente:
   - Propuesta: > Son funciones de `@@code` que no se importan. Cada hook recibe una función, y Fudic la ejecuta en su momento pasándole `host`, el tag del componente:

2. **Línea 99.** Problema: «sin hacer nada» se puede leer como que los efectos no hacen nada.
   - Original: > Los `effect` escritos en `@@code` se destruyen con el componente, sin hacer nada.
   - Propuesta: > Los `effect` escritos en `@@code` se destruyen con el componente, sin que tengas que hacer nada.

3. **Línea 116.** Problema: frase sin verbo que presenta el ejemplo.
   - Original: > Un carrito guardado en el navegador: se lee al hidratar y se guarda cada vez que cambia.
   - Propuesta: > Este ejemplo guarda un carrito en el navegador: lo lee al hidratar y lo guarda cada vez que cambia.

Sin cambios: `/docs/template-syntax/routes-and-layouts`, `/docs/reactivity/hydration` (solo el patrón 1, opcional).

---

## Bloque 4. Servidor, servicios (DI) y seguridad

Nota: los originales se citan tal como están en el fichero, con `@@` y las entidades (`&#123;`, `&gt;`…) literales, para que se puedan buscar y reemplazar. Las etiquetas `<code>` van como backticks y los enlaces se omiten; al reemplazar, conserva el `<a>` que envolvía el texto.

### Patrones de este bloque

#### P1. Elipsis con coma en vez de verbo

Una coma ocupa el sitio del verbo y obliga a releer la frase para reconstruirla. En una enumeración corta se entiende; al final de una frase larga o sola, no.

- Ejemplo (`server.fud`, línea 163): > `fudic g form person` crea un formulario y `fudic add http`, la cadena global.
- Propuesta: > `fudic g form person` crea un formulario y `fudic add http` crea la cadena global.
- Páginas: `/docs/server`, `/docs/server/functions`, `/docs/server/rules`, `/docs/server/session`, `/docs/security/csp`, `/docs/security/headers`.

#### P2. «solo» con dos lecturas

«Solo» detrás del verbo se lee como «únicamente» o como «por sí mismo». En los textos de cookies y CSRF el sentido es «por su cuenta», pero la primera lectura es «únicamente».

- Ejemplo (`security.fud`, línea 54): > el navegador añade solo las cookies del usuario
- Propuesta: > el navegador añade por su cuenta las cookies del usuario
- Páginas: `/docs/security`, `/docs/server/session`.

#### P3. «raíz» y «contenedor» sin presentar, y alternando

`/docs/di` habla de «la raíz». `/docs/di/server` y `/docs/di/providers` pasan a «contenedor raíz», «contenedor» y «los contenedores» sin decir qué es un contenedor. La primera vez que aparezca «contenedor» conviene explicarlo en una frase (dónde viven las instancias) y usar después siempre la misma palabra.

- Ejemplo (`di/server.fud`, línea 57): > Cada petición tiene su propio contenedor raíz, que la sigue a través de cada <code>await</code>.
- Páginas: `/docs/di/server`, `/docs/di/providers`.

#### P4. Referente lejano o ambiguo («lo», «su», «uno», «es»)

Un pronombre apunta a algo que está dos frases atrás o a un sustantivo que no se ha nombrado. Se arregla repitiendo el sustantivo.

- Ejemplo (`security.fud`, línea 70): > Es la URL contra la que <code>csrf</code> decide si una llamada viene de otro sitio.
- Páginas: `/docs/security`, `/docs/server/functions`, `/docs/server/middlewares`, `/docs/di/server`, `/docs/di/providers`, `/docs/security/csp`, `/docs/security/headers`.

---

### `/docs/server` — `web/apps/site/src/routes/docs/server.fud`

1. **Línea 44.** Problema: el paréntesis parte el sujeto en dos, y «fichero hermano» es jerga que no se explica.
   - Original: > Todo lo que una ruta o un componente necesita del servidor (sus datos, las funciones a las que llama, sus formularios) se declara en un fichero hermano con extensión `.fudapi`.
   - Propuesta: > Una ruta o un componente declara todo lo que necesita del servidor en un fichero `.fudapi` que va a su lado: sus datos, las funciones a las que llama y sus formularios.

2. **Línea 103.** Problema: «marca un `p.nombre`» es una elipsis; no dice que lo marca como error ni por qué.
   - Original: > `data` y `search` llegan tipados del contrato: el editor marca un `p.nombre` antes de compilar.
   - Propuesta: > `data` y `search` llegan tipados del contrato: el editor marca como error un `p.nombre`, que `Person` no tiene, antes de compilar.

3. **Línea 128.** Problema: dos pares de dos puntos seguidos, y el nombre del módulo («`fudic:` más su ruta…») queda como un inciso sin verbo.
   - Original: > Cada `.fudapi` se convierte en un módulo, `fudic:` más su ruta dentro de `src/` sin extensión: `src/routes/usuarios.fudapi` es `fudic:routes/usuarios`. Exporta una pieza por declaración, y cada pieza se implementa con su método:
   - Propuesta: > Cada `.fudapi` se convierte en un módulo que se llama `fudic:` seguido de su ruta dentro de `src/`, sin extensión. Así, `src/routes/usuarios.fudapi` es `fudic:routes/usuarios`. El módulo exporta una pieza por declaración, y cada pieza se implementa con su método:

4. **Línea 138.** Problema: «para el build» se lee primero como la preposición «para» y no como el verbo «parar».
   - Original: > Implementar algo dos veces, o en la carpeta equivocada, para el build.
   - Propuesta: > Implementar algo dos veces, o en la carpeta equivocada, detiene el build.

5. **Línea 163.** Problema: elipsis con coma al final de la enumeración (P1).
   - Original: > `fudic g form person` crea un formulario y `fudic add http`, la cadena global.
   - Propuesta: > `fudic g form person` crea un formulario y `fudic add http` crea la cadena global.

### `/docs/server/running` — `web/apps/site/src/routes/docs/server/running.fud`

1. **Línea 41.** Problema: «como un fichero estático» puede leerse como si el servidor se comportara como un fichero estático, y no como el ejemplo de una petición que no le toca.
   - Original: > o `null` si la petición no es suya, como un fichero estático:
   - Propuesta: > o `null` si la petición no es suya, por ejemplo la de un fichero estático:

2. **Línea 75.** Problema: orden forzado, con el sujeto al final, y dos ideas en una frase (de dónde vienen los valores y cuándo hace falta el secreto).
   - Original: > Del entorno vienen el puerto y el secreto de `csrf` con `token true`, normalmente en `FUDIC_SECRET`.
   - Propuesta: > El puerto y el secreto de `csrf` vienen del entorno. El secreto solo hace falta con `token true`, y suele ir en `FUDIC_SECRET`.

### `/docs/server/functions` — `web/apps/site/src/routes/docs/server/functions.fud`

1. **Línea 72.** Problema: el paréntesis corta la frase justo antes del verbo, y «está `task`» queda como una elipsis.
   - Original: > Para pintar su estado (si está en marcha, su valor, su error), está `task`.
   - Propuesta: > Para pintar su estado, si está en marcha, su valor o su error, usa `task`.

2. **Línea 109.** Problema: «puede corregir algo» va suelto tras los dos puntos y no tiene sujeto.
   - Original: > Algunos errores son para el usuario: puede corregir algo.
   - Propuesta: > Algunos errores son para el usuario, que puede corregir algo.

3. **Línea 142.** Problema: no queda claro a qué se refiere «lo» en «lo pone al día».
   - Original: > Sin `invalidates` no se repinta nada: si la página ya sabe qué ha cambiado, lo pone al día ella misma en sus signals, que es más rápido.
   - Propuesta: > Sin `invalidates` no se repinta nada. Si la página ya sabe qué ha cambiado, actualiza ella misma sus signals, que es más rápido.

4. **Línea 146.** Problema: «esos argumentos» no tiene antecedente; no se ha dicho que `url()` reciba argumentos.
   - Original: > Un `get` tiene `url()`: la URL que lo llama con esos argumentos.
   - Propuesta: > Un `get` tiene `url()`, que devuelve la URL que llama a esa función con los argumentos que le pases.

5. **Línea 157.** Problema: «Suena raro, pero» es una justificación defensiva.
   - Original: > Suena raro, pero la idea es sencilla: el navegador y el servidor ya conocen el contrato, así que no hace falta mandar lo que los dos saben.
   - Propuesta: > El navegador y el servidor ya conocen el contrato, así que no hace falta mandar lo que los dos saben.

6. **Línea 164.** Problema: «se marcan igual» es ambiguo (¿igual que qué?).
   - Original: > Los `bool` van juntos como bits, ocho por byte, y los campos opcionales vacíos se marcan igual.
   - Propuesta: > Los `bool` van juntos como bits, ocho por byte, y un campo opcional vacío se marca también con un bit.

7. **Línea 165.** Problema: tres ideas en un punto, y la última frase no tiene verbo (P1).
   - Original: > Un texto es su longitud y sus bytes en UTF-8. Las longitudes van en varint, el truco de Protocol Buffers: un número pequeño ocupa un byte. Una fecha, los milisegundos desde 1970 en seis bytes.
   - Propuesta: > Un texto es su longitud y sus bytes en UTF-8. Las longitudes van en varint, el truco de Protocol Buffers con el que un número pequeño ocupa un byte. Una fecha son los milisegundos desde 1970, en seis bytes.

8. **Línea 169.** Problema: dos «y» seguidos unen dos ideas que no tienen relación (el tamaño y la validación).
   - Original: > Pesa menos y se lee más rápido, y el servidor no se fía de lo que llega: unos bytes que no encajan con el contrato son un `400`.
   - Propuesta: > Pesa menos y se lee más rápido. Además, el servidor no se fía de lo que llega: unos bytes que no encajan con el contrato son un `400`.

9. **Línea 172.** Problema: la condición inicial parece aplicarse a la firma, que en realidad va siempre; la causa y el efecto quedan mezclados.
   - Original: > **Si la página es de una versión anterior** a la del servidor, cada llamada lleva una firma de la forma de su contrato (la cabecera `fud-sig`), y la llamada falla con un `412` en vez de leer datos con otra forma.
   - Propuesta: > **Cada llamada lleva una firma** de la forma de su contrato, en la cabecera `fud-sig`. Si la página es de una versión anterior a la del servidor, la llamada falla con un `412` en vez de leer datos con otra forma.

10. **Línea 193.** Problema: «uno» y «lo» no tienen antecedente claro (P4).
    - Original: > En los demás, en el cuerpo. `query nombre tipo` manda uno en la URL, y `patch rename /:id` lo pone en la ruta.
    - Propuesta: > En los demás, en el cuerpo. En ellos, `query nombre tipo` manda un argumento en la URL, y `patch rename /:id` pone `id` en la ruta.

### `/docs/server/types` — `web/apps/site/src/routes/docs/server/types.fud`

1. **Línea 60.** Problema: en «y además valida gratis» el sujeto cambia sin avisar (del backend al ancho).
   - Original: > Un backend en otro lenguaje necesita saberlo, y además valida gratis: un `u8` que recibe `300` se rechaza.
   - Propuesta: > Un backend en otro lenguaje necesita saberlo. Además, el ancho ya valida: un `u8` que recibe `300` se rechaza.

2. **Línea 93.** Problema: los incisos encadenados alejan el relativo «que responde» de «el servidor».
   - Original: > Un valor se comprueba cada vez que pasa de un lado al otro: en el navegador, antes de enviar, y en el servidor, al recibir, que responde `400` sin llegar al handler.
   - Propuesta: > Un valor se comprueba cada vez que pasa de un lado al otro: en el navegador antes de enviarlo, y en el servidor al recibirlo. Si no cumple, el servidor responde `400` sin llegar al handler.

3. **Línea 122.** Problema: la causa va metida dentro del «no… ni…», que queda partido.
   - Original: > No caben en un `get`, porque sus argumentos viajan en la URL, ni en los datos de una página.
   - Propuesta: > No caben en los datos de una página ni en un `get`, cuyos argumentos viajan en la URL.

### `/docs/server/rules` — `web/apps/site/src/routes/docs/server/rules.fud`

1. **Línea 80.** Problema: el inciso separa «se declara» de su complemento, y «con qué valida» se lee como «con qué herramienta».
   - Original: > Una regla propia se declara en un `.fudapi`, por convención en `src/rules/`, con qué valida, dónde se ejecuta y con qué código falla:
   - Propuesta: > Una regla propia se declara en un `.fudapi`, por convención en `src/rules/`. La declaración dice qué valida, dónde se ejecuta y con qué código falla:

2. **Línea 99.** Problema: frase sin verbo, y «el valor solo» se lee como «el valor por sí mismo» o como «únicamente el valor» (P1, P2).
   - Original: > Para lo que se comprueba con el valor solo.
   - Propuesta: > Sirve para lo que se comprueba solo con el valor.

3. **Línea 100.** Problema: frase sin verbo, igual que la anterior (P1).
   - Original: > Para lo que necesita datos que no salen del servidor.
   - Propuesta: > Sirve para lo que necesita datos que no salen del servidor.

4. **Línea 108.** Problema: no queda claro de quién es el `summary` («su»).
   - Original: > Las de grupo y formulario van en su `summary`
   - Propuesta: > Los errores de las de grupo y de formulario van en el `summary` del formulario

5. **Línea 109.** Problema: el sujeto es largo y va delante del verbo; cuesta saber qué se declara.
   - Original: > El texto por defecto de un código para todo el proyecto se declara con `messages`
   - Propuesta: > Con `messages` se declara el texto por defecto de un código para todo el proyecto

### `/docs/server/middlewares` — `web/apps/site/src/routes/docs/server/middlewares.fud`

1. **Línea 43.** Problema: «tiene dos mitades» choca con «o ninguna» en la misma frase.
   - Original: > En Fudic tiene dos mitades, y puede tener una, las dos o ninguna:
   - Propuesta: > En Fudic, un middleware puede tener una mitad de cliente, una de servidor, las dos o ninguna:

2. **Línea 50.** Problema: el verbo en plural no tiene sujeto, porque lo anterior habla de «un middleware» o de las mitades.
   - Original: > Envuelven a las funciones de servidor y también al `load` de las páginas.
   - Propuesta: > Los middlewares envuelven a las funciones de servidor y también al `load` de las páginas.

3. **Línea 54.** Problema: tres niveles con punto y coma y dos puntos dentro de una sola frase; costaría menos como lista.
   - Original: > Los middlewares de una llamada forman su **cadena**, en tres niveles: la global, en `src/http.fudapi`; la de un fichero, en el `chain` de ese `.fudapi`; y la de una función, con `use` y `skip`.
   - Propuesta: > Los middlewares de una llamada forman su **cadena**, que tiene tres niveles: > - la global, en `src/http.fudapi`; > - la de un fichero, en el `chain` de ese `.fudapi`; > - la de una función, con `use` y `skip`.

4. **Línea 71.** Problema: «el de más fuera» es coloquial y no se entiende a la primera.
   - Original: > El primero de la lista es el de más fuera.
   - Propuesta: > El primero de la lista es el más externo, el que envuelve a todos los demás.

5. **Línea 97.** Problema: tres ideas en una frase (dónde se escriben, el ejemplo y cómo llegan a la implementación).
   - Original: > Quien lo usa los escribe debajo del `use`, como `routes` en el ejemplo de la cadena, y la implementación los recibe en un tercer argumento.
   - Propuesta: > Quien lo usa los escribe debajo del `use`, como `routes` en el ejemplo de la cadena. La implementación los recibe en un tercer argumento.

6. **Línea 105.** Problema: «y le falta» no dice qué falta, y la doble condición no se entiende a la primera.
   - Original: > en el servidor rechaza con `403` una llamada que no es `get` y le falta, o que viene de otro sitio.
   - Propuesta: > en el servidor rechaza con `403` dos tipos de llamada: la que no es `get` y no lleva esa cabecera, y la que viene de otro sitio.

7. **Línea 119.** Problema: orden calcado, con el objeto directo detrás del complemento («deja pasar a quien llamó los errores…»).
   - Original: > Deja pasar a quien llamó los errores de un formulario y los que la función declara en `catches`.
   - Propuesta: > Los errores de un formulario y los que la función declara en `catches` no los toca: llegan a quien llamó.

8. **Línea 128.** Problema: con el inciso y el «y solo si…» del final no queda claro quién comprime ni qué condición se aplica.
   - Original: > `compress gzip 200`, en la cadena o en una función, comprime lo que sube el navegador cuando pasa de 200 bytes, y solo si sale más pequeño.
   - Propuesta: > `compress gzip 200`, en la cadena o en una función, comprime lo que sube el navegador cuando pasa de 200 bytes. Solo lo manda comprimido si sale más pequeño.

### `/docs/server/task` — `web/apps/site/src/routes/docs/server/task.fud`

1. **Línea 40.** Problema: la enumeración mezcla infinitivos con una subordinada («y que una búsqueda…»), y «está en marcha» no tiene sujeto.
   - Original: > saber si está en marcha, enseñar el error y que una búsqueda vieja no pise a la nueva.
   - Propuesta: > saber si la llamada sigue en marcha, enseñar el error y evitar que una búsqueda vieja pise a la nueva.

2. **Línea 66.** Problema: el inciso explicativo corta la frase, y «lo que lee» no tiene antecedente claro.
   - Original: > Con un segundo argumento, una función que devuelve los argumentos, la tarea llama sola cada vez que cambia lo que lee:
   - Propuesta: > El segundo argumento de `task` es una función que devuelve los argumentos de la llamada. La tarea llama sola cada vez que cambia un signal que lee esa función:

3. **Línea 84.** Problema: tres valores de retorno, un inciso condicional y un paréntesis en la misma frase; «cambio optimista» se usa sin explicar.
   - Original: > `run` nunca lanza: devuelve `&#123; ok: true, value &#125;`, `&#123; ok: false, error &#125;` o, si se canceló, `&#123; ok: false &#125;` sin `error` (`TaskResult`). Así un cambio optimista se escribe sin `try`:
   - Propuesta: > `run` nunca lanza. Devuelve `&#123; ok: true, value &#125;` si sale bien, `&#123; ok: false, error &#125;` si falla y `&#123; ok: false &#125;`, sin `error`, si se canceló (`TaskResult`). Así se escribe sin `try` un cambio optimista, el que se pinta antes de que responda el servidor:

4. **Línea 95.** Problema: la segunda mitad («A un `post`…: esperan en fila») es una elipsis que obliga a recuperar «dos llamadas seguidas».
   - Original: > A un `post`, `put`, `patch` o `delete`: esperan en fila, y ningún cambio se pierde por pulsar dos veces.
   - Propuesta: > Si son a un `post`, `put`, `patch` o `delete`, esperan en fila, y ningún cambio se pierde por pulsar dos veces.

### `/docs/server/session` — `web/apps/site/src/routes/docs/server/session.fud`

1. **Línea 43.** Problema: «la manda solo» se lee primero como «únicamente» (P2).
   - Original: > **El navegador la manda solo**, en cada navegación y en cada llamada.
   - Propuesta: > **El navegador la manda por su cuenta**, en cada navegación y en cada llamada.

2. **Línea 75.** Problema: la frase final no tiene verbo (P1).
   - Original: > Contra las llamadas desde otra web, `csrf`.
   - Propuesta: > Contra las llamadas desde otra web, usa `csrf`.

### `/docs/di` — `web/apps/site/src/routes/docs/di.fud`

1. **Línea 60.** Problema: un paréntesis largo en medio de la frase, y el orden (primero «se podrá», después «hoy no») obliga a releer.
   - Original: > `Service` es un decorador estándar de JavaScript (la propuesta de decoradores del TC39, en fase 3), y se podrá escribir `@@Service` encima de la clase. Hoy las herramientas de build aún no transforman los decoradores estándar, así que se llama como una función, debajo de la clase. Es la misma función.
   - Propuesta: > `Service` es un decorador estándar de JavaScript, de la propuesta de decoradores del TC39, que está en fase 3. Hoy las herramientas de build aún no transforman los decoradores estándar, así que se llama como una función, debajo de la clase. Cuando los transformen, se podrá escribir `@@Service` encima de la clase. Es la misma función.

2. **Línea 108.** Problema: «también vale» no tiene sujeto explícito; el último sustantivo es «página».
   - Original: > En el servidor también vale dentro de un handler
   - Propuesta: > En el servidor, `inject()` también vale dentro de un handler

3. **Líneas 31 y 124 (TOC y `<h2>`).** Problema: «uno por petición» usa «petición» para `transient`, que crea una instancia en cada `inject`. En `/docs/di/server`, «petición» es la petición HTTP, y los dos sentidos chocan.
   - Original: > Opcional y uno por petición
   - Propuesta: > Opcional y uno nuevo cada vez

### `/docs/di/server` — `web/apps/site/src/routes/docs/di/server.fud`

1. **Línea 57.** Problema: «contenedor raíz» aparece aquí por primera vez y no se explica (P3).
   - Original: > Cada petición tiene su propio contenedor raíz, que la sigue a través de cada `await`.
   - Propuesta: > Cada petición tiene su propio contenedor raíz, donde viven sus instancias, y ese contenedor la sigue a través de cada `await`.

2. **Línea 63.** Problema: «pintaría cero» es una elipsis, y «el valor del que se construye» es una construcción enrevesada.
   - Original: > El del navegador nace vacío, y al primer cambio pintaría cero. Para que nazca igual, el servidor publica el valor del que se construye, bajo un token:
   - Propuesta: > El del navegador nace vacío, y al primer cambio pintaría cero líneas. Para que nazca igual, el servidor publica bajo un token el valor con el que se construye:

3. **Línea 96.** Problema: «el fixture» se usa sin presentarlo.
   - Original: > El fixture da nombre a cada grupo de servicios:
   - Propuesta: > El fixture, el fichero `.fixture.ts` que acompaña al flujo, da nombre a cada grupo de servicios:

4. **Línea 123.** Problema: no se sabe a qué apuntan los dos «lo» (¿el servicio o el criterio?), y «gana a `Service`» es una metáfora poco precisa (P4).
   - Original: > El servicio de la prueba se registra en la raíz, en el servidor y en el navegador, y gana a `Service`. `fudic spec` lo ejecuta en un navegador de verdad, y en VS Code el workbench (Ctrl+K V) lo repite en cada guardado.
   - Propuesta: > El servicio de la prueba se registra en la raíz, en el servidor y en el navegador, y sustituye al que registra `Service`. `fudic spec` ejecuta el criterio en un navegador de verdad, y en VS Code el workbench (Ctrl+K V) lo repite en cada guardado.

### `/docs/di/providers` — `web/apps/site/src/routes/docs/di/providers.fud`

1. **Línea 70.** Problema: «los que registran» se lee como si se hablara de componentes, cuando son los servicios registrados.
   - Original: > Si no, llega a la raíz, donde están los que registran `Service` y `provide` en un módulo.
   - Propuesta: > Si no, llega a la raíz, donde están los servicios registrados con `Service` o con un `provide` en un módulo.

2. **Línea 84.** Problema: «aunque lo pida desde dentro de un `app-shop`» no deja claro quién pide qué; un servicio de la raíz no está «dentro» de nada.
   - Original: > Un servicio de la raíz que inyecta `Cart` no lo encuentra, aunque lo pida desde dentro de un `app-shop`: el error llega al momento.
   - Propuesta: > Un servicio de la raíz que inyecta `Cart` no lo encuentra, aunque quien pida ese servicio sea un componente de dentro de un `app-shop`. El error salta en el momento.

3. **Línea 91.** Problema: «contenedor» se usa como algo ya conocido, y no se ha presentado (P3).
   - Original: > no crea contenedor: sus hijos ven el de su dueño más cercano.
   - Propuesta: > no crea su propio contenedor de servicios: sus hijos ven el de su dueño más cercano.

### `/docs/security` — `web/apps/site/src/routes/docs/security.fud`

1. **Línea 49.** Problema: «nonce» se usa sin explicar, y «aunque alguien consiga meter uno» deja ambiguo si «uno» es un script o un nonce.
   - Original: > **La Content Security Policy** solo deja ejecutar los scripts que llevan el nonce de esa respuesta, aunque alguien consiga meter uno
   - Propuesta: > **La Content Security Policy** solo deja ejecutar los scripts que llevan el nonce de esa respuesta, un valor al azar que cambia cada vez. Un script que alguien consiga colar no lo lleva, y no se ejecuta

2. **Línea 54.** Problema: «añade solo» se lee como «únicamente» (P2).
   - Original: > el navegador añade solo las cookies del usuario
   - Propuesta: > el navegador añade por su cuenta las cookies del usuario

3. **Línea 62.** Problema: «la política de la plantilla» no dice de qué política se habla; la CSP no se ha nombrado en esta sección.
   - Original: > La política de la plantilla trae `frame-ancestors 'none'`, y ninguna web puede meter la tuya en un marco.
   - Propuesta: > La CSP de la plantilla trae `frame-ancestors 'none'`, así que ninguna web puede meter la tuya en un marco.

4. **Línea 70.** Problema: la última frase («Es la URL…») apunta a algo de dos frases atrás, y es la que explica por qué importa (P4).
   - Original: > Detrás de un proxy, la URL pública viaja en la cabecera `Forwarded`, que cualquier cliente puede inventarse. Fudic no la lee salvo que lo actives con `serve.trustProxy`, y solo debes activarlo detrás de un proxy en el que confíes (El servidor). Es la URL contra la que `csrf` decide si una llamada viene de otro sitio.
   - Propuesta: > Detrás de un proxy, la URL pública viaja en la cabecera `Forwarded`, que cualquier cliente puede inventarse. Con esa URL decide `csrf` si una llamada viene de otro sitio. Fudic no lee la cabecera salvo que actives `serve.trustProxy`, y solo debes activarlo detrás de un proxy en el que confíes (El servidor).

5. **Línea 74.** Problema: «Si un fichero pasa uno» obliga a releer para saber que «uno» es uno de los límites.
   - Original: > Una subida tiene límites, de serie 10 MB por fichero y 20 ficheros por llamada. Si un fichero pasa uno, el servidor deja de leer y responde `413`, así que nadie le llena la memoria o el disco
   - Propuesta: > Una subida tiene límites: de serie, 10 MB por fichero y 20 ficheros por llamada. Si una subida pasa de uno de ellos, el servidor deja de leer y responde `413`, así que nadie puede llenarle la memoria o el disco

### `/docs/security/csp` — `web/apps/site/src/routes/docs/security/csp.fud`

1. **Línea 42.** Problema: la frase es larga, con una causal en medio, y en «te dice» no se sabe quién habla (Fudic o el build).
   - Original: > Fudic pone un nonce nuevo en cada respuesta y en sus propios scripts, y como el build sabe qué mete en la página, te dice qué le falta a la política y qué le sobra.
   - Propuesta: > Fudic pone un nonce nuevo en cada respuesta y en sus propios scripts. Como el build sabe qué mete en la página, avisa de qué le falta a la política y de qué le sobra.

2. **Línea 66.** Problema: dos elipsis seguidas, separadas por punto y coma y sin verbo (P1).
   - Original: > todo lo demás, del propio origen; las imágenes, también en `data:`.
   - Propuesta: > todo lo demás solo puede venir del propio origen, y las imágenes pueden venir también de `data:`.

3. **Línea 88.** Problema: «sigue a» es un calco, «que aquí es `default-src 'self'`» no se entiende sin saber cómo se hereda, y no se sabe de quién es «su host» (P4).
   - Original: > Lo que ese script pida después con `fetch` sí sigue a `connect-src`, que aquí es `default-src 'self'`: si llama a su servidor, añade su host.
   - Propuesta: > Lo que ese script pida después con `fetch` sí depende de `connect-src`. La plantilla no la escribe, así que vale lo que dice `default-src 'self'`: si el script llama a su propio servidor, añade el host de ese servidor.

4. **Línea 92.** Problema: la frase define en vez de decir qué hacer, y se queda en una elipsis.
   - Original: > Un origen de fuera es un host más al final de su directiva.
   - Propuesta: > Para permitir un origen de fuera, añade su host al final de la directiva que le toca.

5. **Línea 100.** Problema: «El build… avisa… en el build» repite el sujeto dentro de la misma frase.
   - Original: > El build junta lo que de verdad ha puesto, lee la política como la lee el navegador y avisa de tres cosas, en el build y en el editor:
   - Propuesta: > El build junta lo que de verdad se ha puesto, lee la política como la lee el navegador y avisa de tres cosas, que el editor también enseña:

6. **Línea 108.** Problema: «el editor también» deja el verbo implícito, y «no es un aviso» se lee raro (no lo es, no lo da).
   - Original: > Un navegador ignora lo que la propia política hace inútil, y el editor también: `'unsafe-inline'` junto a un nonce no es un aviso.
   - Propuesta: > El navegador ignora lo que la propia política deja sin efecto, y el editor también lo ignora: `'unsafe-inline'` junto a un nonce no da aviso.

### `/docs/security/headers` — `web/apps/site/src/routes/docs/security/headers.fud`

1. **Línea 46.** Problema: el sujeto pospuesto al final («cuando pinta una página él») hace que el orden suene forzado.
   - Original: > Las manda el servidor y las pone también el Service Worker cuando pinta una página él.
   - Propuesta: > Las manda el servidor, y también el Service Worker cuando es él quien pinta la página.

2. **Línea 51.** Problema: «vale su plantilla, no «sin cabeceras»» es una elipsis con una cita que obliga a reconstruir la idea.
   - Original: > Si borras uno, vale su plantilla, no «sin cabeceras». Un fichero con errores no vuelve a la plantilla: el editor y el build dicen dónde está el error.
   - Propuesta: > Si borras uno, Fudic usa su plantilla; la app no se queda sin cabeceras. Un fichero con errores, en cambio, no vuelve a la plantilla: el editor y el build dicen dónde está el error.

3. **Línea 72.** Problema: dos reglas distintas en una frase, y «gana» no dice a qué se impone.
   - Original: > Gana la ruta más concreta, cabecera a cabecera, y un valor vacío no envía esa cabecera.
   - Propuesta: > Si varias rutas casan, gana la más concreta, cabecera a cabecera. Una cabecera con el valor vacío no se envía.

4. **Línea 85.** Problema: «le dice» no tiene sujeto claro (es el navegador), y en «no la página» falta la preposición.
   - Original: > a otra web solo le dice de qué origen viene el usuario, no la página.
   - Propuesta: > con ella, el navegador solo le dice a otra web de qué origen viene el usuario, no de qué página.

5. **Línea 86.** Problema: en «no tiene acceso a ella», «ella» puede ser la ventana o tu web.
   - Original: > una ventana de otra web que abras desde la tuya, o que abra la tuya, no tiene acceso a ella por `window.opener`.
   - Propuesta: > una ventana de otra web que abras desde la tuya, o que abra la tuya, no puede tocar tu página por `window.opener`.

6. **Línea 114.** Problema: dos incisos («que nadie sirve», «y tampoco…») alejan el sujeto del verbo.
   - Original: > **En una librería**, que nadie sirve, un `.headers` no se aplica a nada, y tampoco un `sw.headers` en una app sin `sw.json`:
   - Propuesta: > **Un `.headers` no se aplica a nada** en una librería, porque nadie la sirve, ni un `sw.headers` en una app sin `sw.json`:

### `/docs/security/trusted-types` — `web/apps/site/src/routes/docs/security/trusted-types.fud`

1. **Línea 51.** Problema: «La marca… no viaja: un HTML que llega del servidor se escribe como texto» repite lo que dice la lista de justo debajo («La marca no viaja en JSON»), y la frase acumula tres ideas.
   - Original: > La marca se pone en el `@@code` y no viaja: un HTML que llega del servidor se escribe como texto.
   - Propuesta: > La marca se pone en el `@@code`.

2. **Línea 68.** Problema: el párrafo es denso; la primera frase junta la política, los dos sitios y el escape con incisos encadenados.
   - Original: > Fudic tiene una sola política, `fudic`, y su runtime solo pinta HTML en dos sitios, que pasan por ella: `@@raw` y el resumen de errores de un formulario, que escapa cada mensaje. La usa también para la URL del Service Worker al registrarlo.
   - Propuesta: > Fudic tiene una sola política, `fudic`. Su runtime solo pinta HTML en dos sitios, y los dos pasan por ella: `@@raw` y el resumen de errores de un formulario, que escapa cada mensaje. Fudic también la usa para la URL del Service Worker al registrarlo.

3. **Línea 92.** Problema: el sujeto de «Mira» (el aviso) queda lejos, y la frase junta dónde mira, dónde no y cuándo.
   - Original: > Mira el `@@code` de los `.fud` y los módulos que carga el navegador, nunca `src/server`, y solo si `page.headers` pide Trusted Types.
   - Propuesta: > El editor lo busca en el `@@code` de los `.fud` y en los módulos que carga el navegador, nunca en `src/server`. Solo lo da si `page.headers` pide Trusted Types.

Sin cambios: `/docs/server/pipes`.

---

## Bloque 5. Formularios, internacionalización y rutas

### Patrones de este bloque

**P1. La página no abre con su idea: el `<h1>` va seguido directamente de un `<h2>`.** El primer párrafo, que ya es la idea de la página, queda bajo un subtítulo. Propuesta: subir ese primer párrafo por encima del primer `<h2>` (y, si el `<h2>` se queda sin contenido, quitarlo o dejar que empiece en el bloque siguiente).
- Ejemplo (`routing/rendering.fud`): `<h1>Cuándo se pinta: los modos</h1>` → `<h2 id="modes">Tres modos</h2>` → «Toda página de Fudic llega al navegador ya pintada…». Ese párrafo debería ir justo después del `<h1>`.
- Páginas: `/docs/forms/events` (líneas 38-40), `/docs/routing/early-hints` (líneas 38-40), `/docs/routing/error-page` (líneas 38-40), `/docs/routing/rendering` (líneas 41-43).

**P2. «para» como verbo (parar), leído como preposición.** El lector tropieza: «la primera que falla para:» parece una preposición que se queda sin complemento.
- Ejemplo: «Las reglas se comprueban en orden, y la primera que falla para: …» → «Las reglas se comprueban en orden y la comprobación se detiene en la primera que falla: …».
- Páginas: `/docs/forms` (línea 66), `/docs/forms/validation` (línea 56), `/docs/i18n/urls` (línea 116).

**P3. «Uno» / «Es lo único» sin sustantivo: el referente queda dos frases atrás.** Obliga a releer para saber de qué se habla.
- Ejemplo: «Uno del servidor es un `HttpError`» → «Si el error viene del servidor, es un `HttpError`».
- Páginas: `/docs/forms/events` (línea 72), `/docs/i18n/catalogs` (línea 72), `/docs/routing/data` (línea 170), `/docs/routing/error-page` (línea 77), `/docs/routing/rendering` (línea 97).

**P4. Varios enlaces entre paréntesis en mitad de la frase.** Cuando hay más de uno por frase, cortan la idea. Propuesta general: dejar un solo enlace por frase y, si se puede, al final, o convertir el texto del enlace en parte de la frase.
- Ejemplo más denso: `/docs/forms` línea 41 (tres paréntesis en un párrafo de tres frases). También `/docs/routing` línea 37 y `/docs/i18n` línea 97.

---

### `/docs/forms` — `web/apps/site/src/routes/docs/forms.fud`

1. **Línea 41.** Problema: tres paréntesis con enlace en un párrafo de tres frases, y la última frase acumula tres ideas (cómo se envía, qué no hace falta, dónde se valida).
   - Original: > Un formulario de Fudic se declara en un `.fudapi`, con `form`, junto a las funciones de servidor que lo reciben (lo que se declara en un `.fudapi`). Sus reglas vienen del mismo sitio (Reglas y patrones). Enviarlo es como llamar a cualquier función de servidor: sin `fetch` ni conversión de datos, y validado en los dos lados desde la misma declaración (Por qué existe el `.fudapi`).
   - Propuesta: > Un formulario de Fudic se declara con `form` en un `.fudapi`, junto a las funciones de servidor que lo reciben. Sus reglas se declaran en el mismo fichero (Reglas y patrones). Enviarlo es como llamar a cualquier función de servidor: no hace falta `fetch` ni convertir datos. Los dos lados lo validan desde la misma declaración (Por qué existe el `.fudapi`).

2. **Línea 47.** Problema: «no se puede fiar» mezcla el impersonal con un verbo pronominal (*fiarse*) y suena incorrecto.
   - Original: > en el servidor, porque no se puede fiar de lo que llega.
   - Propuesta: > en el servidor, porque no puede fiarse de lo que llega.

3. **Línea 66.** Problema: «para» se lee como preposición (P2).
   - Original: > Las reglas se comprueban en orden, y la primera que falla para: un campo tiene un solo error (Validación y validez).
   - Propuesta: > Las reglas se comprueban en orden y la comprobación se detiene en la primera que falla, así que un campo tiene un solo error (Validación y validez).

4. **Línea 104.** Problema: «Lo que es del formulario entero» es vago; no dice que se habla de métodos.
   - Original: > Lo que es del formulario entero empieza por `$`, para no chocar con ningún campo: `$value()`, `$valid()`, `$reset()`.
   - Propuesta: > Los métodos del formulario entero empiezan por `$`, para no chocar con el nombre de ningún campo: `$value()`, `$valid()`, `$reset()`.

5. **Línea 112.** Problema: «Son dos operaciones» no tiene antecedente claro: la lista anterior tiene tres elementos.
   - Original: > Son dos operaciones para que un objeto incompleto no vacíe en silencio los campos que faltan.
   - Propuesta: > `$set` y `$patch` son operaciones distintas para que un objeto incompleto no vacíe en silencio los campos que faltan.

6. **Línea 116.** Problema: «cosas … se leen llamándolas» es una construcción forzada; no se entiende qué se llama.
   - Original: > Cada campo sabe cosas de sí mismo, y se leen llamándolas:
   - Propuesta: > Cada campo tiene su propio estado, y cada dato se lee llamando a su función:

### `/docs/forms/binding` — `web/apps/site/src/routes/docs/forms/binding.fud`

1. **Línea 9 (meta description) y línea 13 (og:description).** Problema: «accesible desde el servidor» parece decir que se accede al formulario desde el servidor.
   - Original: > control, error y summary: los tres atributos que enlazan un formulario de Fudic con su HTML, accesible desde el servidor.
   - Propuesta: > control, error y summary: los tres atributos que enlazan un formulario de Fudic con su HTML, que ya sale accesible del servidor.
   - Original: > Tres atributos enlazan un formulario de Fudic con su HTML, accesible desde el servidor.
   - Propuesta: > Tres atributos enlazan un formulario de Fudic con su HTML, que ya sale accesible del servidor.

2. **Línea 41.** Problema: «ya desde el servidor», colgado al final, es ambiguo.
   - Original: > Tú escribes el markup, y el compilador añade lo que hace falta para que sea accesible, ya desde el servidor.
   - Propuesta: > Tú escribes el markup, y el compilador añade lo necesario para que sea accesible desde el primer HTML que envía el servidor.

3. **Línea 67.** Problema: una sola frase enumera cinco casos tras dos puntos, con elipsis («en uno `number`», «en unos `radio`»).
   - Original: > El valor que guarda depende del elemento: texto en un `<input>` de texto, un número (o `null`) en uno `number`, un `bool` en un `checkbox`, el `value` elegido en unos `radio` o un `<select>`, y el fichero en uno `file` (Ficheros).
   - Propuesta: > El valor que guarda depende del elemento. Un `<input>` de texto guarda texto, y uno `number`, un número o `null`. Un `checkbox` guarda un `bool`. Unos `radio` o un `<select>` guardan el `value` elegido, y un `<input>` `file`, el fichero (Ficheros).

4. **Línea 69.** Problema: «En el tag de un componente, el componente…» repite la palabra y no dice qué se pone en el tag.
   - Original: > En el tag de un componente, el componente recibe el campo y lo enlaza dentro (Controles form-associated).
   - Propuesta: > Puesto en el tag de un componente, `control` le pasa el campo, y el componente lo enlaza por dentro (Controles form-associated).

5. **Línea 86.** Problema: tres ideas encadenadas y «el error de cada campo, como un enlace a ese campo» se repite.
   - Original: > Con `fields`, tras un envío fallido el resumen lista también el error de cada campo, como un enlace a ese campo, y recibe el foco.
   - Propuesta: > Con `fields`, tras un envío fallido, el resumen recibe el foco y lista también los errores de los campos, cada uno como un enlace a su campo.

### `/docs/forms/events` — `web/apps/site/src/routes/docs/forms/events.fud`

1. **Líneas 38-40.** Problema: la página no abre con su idea; el primer párrafo queda bajo el `<h2>` «Dos eventos» (P1).
   - Original: > Un formulario enviado con `form:=` (Enviar al servidor) termina con uno de dos eventos en el `<form>`:
   - Propuesta: > (Mismo texto, movido justo después del `<h1>`, antes del `<h2 id="two-events">`.)

2. **Línea 47.** Problema: «los errores que el formulario se queda» es agramatical (*quedarse con*) y el inciso corta la frase.
   - Original: > Los errores que el formulario se queda, los de su `catches`, no lanzan ninguno de los dos: ya están pintados en el formulario (Los errores que se quedan en el formulario).
   - Propuesta: > Los errores que recoge el `catches` del formulario no lanzan ninguno de los dos eventos: ya están pintados en el formulario (Los errores que se quedan en el formulario).

3. **Línea 72.** Problema: «Uno del servidor» no tiene sustantivo (P3).
   - Original: > Uno del servidor es un `HttpError`, con su `status`.
   - Propuesta: > Si el error viene del servidor, es un `HttpError`, con su `status`.

4. **Línea 90.** Problema: «la tabla» no se ha presentado; el ejemplo habla de una lista de personas.
   - Original: > El componente no sabe nada de la tabla.
   - Propuesta: > El componente no sabe nada de la lista.

5. **Línea 94.** Problema: «usa una llamada» no dice qué se escribe como llamada.
   - Original: > Si necesitas el evento entero, usa una llamada: `@fudic:result=@alta($event.detail)`.
   - Propuesta: > Si necesitas el evento entero, escribe el handler como una llamada: `@fudic:result=@alta($event.detail)`.

### `/docs/forms/files` — `web/apps/site/src/routes/docs/forms/files.fud`

1. **Línea 39.** Problema: el sujeto de «sube» queda implícito y «cancelarlo» no tiene un antecedente claro (¿el viaje?, ¿el fichero?).
   - Original: > Lo que cambia es el viaje: sube sin cargarse entero en memoria, y la vista puede enseñar cuánto lleva y cancelarlo.
   - Propuesta: > Lo que cambia es el envío: el fichero sube sin cargarse entero en memoria, y la vista puede enseñar cuánto lleva subido y cancelar la subida.

2. **Línea 58.** Problema: «al elegir» no dice quién elige.
   - Original: > El navegador las comprueba al elegir, sin subir nada.
   - Propuesta: > El navegador las comprueba cuando el usuario elige el fichero, sin subir nada.

3. **Línea 75.** Problema: «en el formato de la función» es opaco y la última parte es una elipsis («y una parte por fichero»).
   - Original: > una parte con el resto de los campos, en el formato de la función, y una parte por fichero.
   - Propuesta: > una parte con los demás campos, en el mismo formato que recibe la función, y otra parte por cada fichero.

4. **Línea 91.** Problema: «en el formulario» se repite dos veces en la misma frase.
   - Original: > Con `413` en el `catches` del formulario, el error se pinta en el formulario.
   - Propuesta: > Si el `catches` del formulario incluye `413`, el error se pinta en él.

5. **Línea 106.** Problema: tres ideas en una frase y cambio de sujeto sin aviso («Cancelar deja…», «el servidor tira…»).
   - Original: > Cancelar deja de enviar bytes, el servidor tira lo que ya había recibido, y no se lanza ni `fudic:result` ni `fudic:error`.
   - Propuesta: > Al cancelar, el navegador deja de enviar bytes y el servidor tira lo que ya había recibido. No se lanza ni `fudic:result` ni `fudic:error`.

### `/docs/forms/form-associated` — `web/apps/site/src/routes/docs/forms/form-associated.fud`

1. **Línea 46.** Problema: dos «dos puntos» encadenados en una frase larga.
   - Original: > El estándar lo resuelve con los form-associated custom elements: un elemento que llama a `attachInternals()` recibe lo mismo que el navegador da a sus campos: un valor para el formulario, una validez y unas etiquetas.
   - Propuesta: > El estándar lo resuelve con los form-associated custom elements. Un elemento que llama a `attachInternals()` recibe lo mismo que el navegador da a sus campos: un valor para el formulario, una validez y unas etiquetas.

2. **Línea 81.** Problema: «lo que apunta al tag» es demasiado vago para un concepto nuevo.
   - Original: > lo que apunta al tag sigue hasta el elemento de dentro con ese `id`.
   - Propuesta: > toda referencia que apunta al tag del componente sigue hasta el elemento de dentro que tiene ese `id`.

3. **Línea 100.** Problema: «porque … así que …» encadena tres ideas, y la última frase tiene una elipsis («y un `<input>` nativo para lo demás»).
   - Original: > Uno con `formassociated` no puede esperar, porque sin su código no es un campo, así que se hidrata al cargar la página. Úsalo cuando un campo lo necesite de verdad, y un `<input>` nativo para lo demás.
   - Propuesta: > Uno con `formassociated` se hidrata al cargar la página: sin su código no es un campo, así que no puede esperar. Úsalo solo cuando un campo lo necesite de verdad; para lo demás, usa un `<input>` nativo.

### `/docs/forms/validation` — `web/apps/site/src/routes/docs/forms/validation.fud`

1. **Línea 41.** Problema: el sujeto de «Sirve» no está claro (¿la pregunta?, ¿la respuesta?).
   - Original: > Sirve, por ejemplo, para habilitar un botón sin pintar ningún mensaje.
   - Propuesta: > La respuesta sirve, por ejemplo, para habilitar un botón sin pintar ningún mensaje.

2. **Línea 56.** Problema: «para» se lee como preposición (P2).
   - Original: > Van en orden, y la primera que falla para.
   - Propuesta: > Van en orden, y la comprobación se detiene en la primera que falla.

3. **Línea 84.** Problema: «las de un campo» y «se comprueban todas» no tienen antecedente claro; lo anterior habla de la condición.
   - Original: > Al contrario que las de un campo, se comprueban todas, y el resumen muestra todos sus errores a la vez.
   - Propuesta: > Al contrario que las reglas de un campo, los `require` se comprueban todos, y el resumen muestra todos sus errores a la vez.

4. **Línea 113.** Problema: el paréntesis es una elipsis que corta la condición.
   - Original: > Si la pregunta falla (sin red, un `500`), el campo pasa como válido: al enviar decide el servidor.
   - Propuesta: > Si la pregunta falla, por falta de red o por un `500`, el campo pasa como válido: al enviar decide el servidor.

5. **Línea 123.** Problema: «un campo solo cuenta» no dice para qué cuenta.
   - Original: > Por defecto, un campo solo cuenta cuando el usuario ya ha pasado por él, así que el botón nace habilitado.
   - Propuesta: > Por defecto, la validez solo tiene en cuenta los campos por los que el usuario ya ha pasado, así que el botón nace habilitado.

### `/docs/i18n` — `web/apps/site/src/routes/docs/i18n.fud`

1. **Línea 72.** Problema: «Los textos de los `.fud` están en español» se lee como una regla general; es el caso del ejemplo.
   - Original: > Los textos de los `.fud` están en español, y el inglés es una traducción.
   - Propuesta: > En este ejemplo, los textos de los `.fud` están en español, y el inglés es una traducción.

2. **Línea 73.** Problema: falta la coma tras el complemento inicial, y la frase se lee de un tirón.
   - Original: > Con dos idiomas o más el build lo necesita para escribir las URL absolutas de cada versión
   - Propuesta: > Con dos idiomas o más, el build lo necesita para escribir las URL absolutas de cada versión

3. **Línea 97.** Problema: frase larga que mezcla una lista de exclusiones con la explicación de las props, y «ahí» no tiene referente claro.
   - Original: > Tampoco se traducen el CSS, los `<script>`, `@raw`, los comentarios ni el valor de una prop: un string que se pasa a un componente puede ser un texto o un valor, y ahí se marca con `t()` (Textos en el código).
   - Propuesta: > Tampoco se traducen el CSS, los `<script>`, `@raw`, los comentarios ni el valor de una prop. Un string que se pasa a un componente puede ser un texto o un valor, así que, si es un texto, se marca con `t()` (Textos en el código).

4. **Línea 119.** Problema: «La frase corta en…» es ambiguo («corta» como adjetivo o verbo) y el punto y coma junta dos reglas.
   - Original: > La frase corta en un elemento de bloque, en un componente o en un `@if`; los elementos de texto, como `<a>`, `<em>` o `<code>`, van dentro.
   - Propuesta: > Una frase termina donde empieza un elemento de bloque, un componente o un `@if`. Los elementos de texto, como `<a>`, `<em>` o `<code>`, quedan dentro de la frase.

### `/docs/i18n/catalogs` — `web/apps/site/src/routes/docs/i18n/catalogs.fud`

1. **Línea 42.** Problema: usa `translation` antes de presentarlo, y el punto y coma junta tres actores en una frase.
   - Original: > Los escribe `fudic translate`; quien traduce rellena `translation`, y el build solo los lee.
   - Propuesta: > Los escribe `fudic translate`, y quien traduce rellena el campo `translation` de cada mensaje. El build solo los lee.

2. **Línea 54 (`<h2>`).** Problema: «Un fichero por fichero» obliga a releer.
   - Original: > Un fichero por fichero
   - Propuesta: > Un catálogo por fichero fuente

3. **Línea 72.** Problema: «Es lo único que se edita» no tiene sujeto claro (P3).
   - Original: > Es lo único que se edita.
   - Propuesta: > `translation` es lo único que se edita.

4. **Línea 73.** Problema: «el mismo texto dos veces en un componente» es una construcción calcada y dura.
   - Original: > así que el mismo texto dos veces en un componente se traduce una vez.
   - Propuesta: > así que un texto repetido en el mismo componente se traduce una sola vez.

5. **Línea 96.** Problema: «Uno con plural» sin sustantivo y «necesita elegir» sin complemento (¿elegir qué?).
   - Original: > Uno con plural en un componente que se hidrata necesita elegir en el navegador: entonces, y solo entonces, la página descarga la pieza de `@fudic/i18n` que lo hace.
   - Propuesta: > Un texto con plural dentro de un componente que se hidrata tiene que elegir su forma en el navegador. Solo en ese caso la página descarga la pieza de `@fudic/i18n` que hace esa elección.

6. **Línea 120.** Problema: el sujeto de «Lee» es ambiguo (¿el hover?, ¿VS Code?).
   - Original: > Lee los catálogos cada vez que cambian.
   - Propuesta: > El editor vuelve a leer los catálogos cada vez que cambian.

### `/docs/i18n/code` — `web/apps/site/src/routes/docs/i18n/code.fud`

1. **Línea 39.** Problema: el complemento «en una prop y en el código TypeScript» llega al final, tras los dos puntos, y la idea principal queda partida.
   - Original: > Donde el compilador no puede saber si un string es un texto o un valor, se marca con `t()`: en una prop y en el código TypeScript.
   - Propuesta: > En una prop y en el código TypeScript, el compilador no puede saber si un string es un texto o un valor, así que los textos se marcan con `t()`.

2. **Línea 47.** Problema: negación doble («no lo traduce si no se marca»).
   - Original: > El compilador no lo traduce si no se marca:
   - Propuesta: > El compilador solo lo traduce si se marca:

3. **Línea 92.** Problema: la finalidad («Para elegirlo») no encaja con la frase que sigue, que es una definición.
   - Original: > Para elegirlo, `locale` es el idioma de la página que se está pintando:
   - Propuesta: > Para elegirlo está `locale`, el idioma de la página que se está pintando:

### `/docs/i18n/urls` — `web/apps/site/src/routes/docs/i18n/urls.fud`

1. **Línea 116.** Problema: «para el build» se lee como preposición, no como el verbo *parar* (P2).
   - Original: > Construir con dos idiomas o más sin `site` para el build con `FUD1027`.
   - Propuesta: > Si hay dos idiomas o más y falta `site`, el build se detiene con `FUD1027`.

### `/docs/routing` — `web/apps/site/src/routes/docs/routing.fud`

1. **Línea 37.** Problema: la segunda frase es una elipsis («sus datos, en su `.fudapi`») con un paréntesis detrás.
   - Original: > Cómo se escribe una página está en Rutas y layouts; sus datos, en su `.fudapi` (Los datos de la página).
   - Propuesta: > Cómo se escribe una página se explica en Rutas y layouts. Sus datos se declaran en su `.fudapi` (Los datos de la página).

2. **Línea 53.** Problema: «Se crea» no tiene sujeto, y «que también escribe» puede referirse a la página o al comando.
   - Original: > Se crea con la CLI: `fudic g page about`, o `fudic g page blog/:slug --server` para una página con datos, que también escribe su `.fudapi`.
   - Propuesta: > Una página se crea con la CLI: `fudic g page about`. Para una página con datos, `fudic g page blog/:slug --server` escribe también su `.fudapi`.

3. **Línea 71.** Problema: tres ideas en una frase, con tres sujetos distintos.
   - Original: > La página llega pintada del servidor, el runtime de Fudic queda en la caché del navegador, y con Service Worker la siguiente página se pinta en el propio navegador (Los modos).
   - Propuesta: > La página llega pintada del servidor, y el runtime de Fudic queda en la caché del navegador. Con Service Worker, la siguiente página se pinta en el propio navegador (Los modos).

4. **Línea 78.** Problema: elipsis («ni que recojan») que obliga a reconstruir el sustantivo.
   - Original: > Un parámetro ocupa un segmento entero; no hay opcionales ni que recojan varios segmentos.
   - Propuesta: > Un parámetro ocupa un segmento entero. No hay parámetros opcionales ni parámetros que recojan varios segmentos.

### `/docs/routing/data` — `web/apps/site/src/routes/docs/routing/data.fud`

1. **Línea 84.** Problema: el paréntesis corta la frase justo entre «Cuándo» y su verbo.
   - Original: > Cuándo (en el build o en cada petición) lo decide su modo: `load ssr`, `load ssg` o `load sw` (Los modos).
   - Propuesta: > Su modo decide si se ejecuta en el build o en cada petición: `load ssr`, `load ssg` o `load sw` (Los modos).

2. **Línea 86.** Problema: «su código» es ambiguo (¿el del navegador?, ¿el de la página?).
   - Original: > Al navegador solo viaja lo que lee su código.
   - Propuesta: > Al navegador solo viajan los datos que lee el código de la página.

3. **Línea 118.** Problema: cuatro ideas en una frase, con tres sujetos distintos tras los dos puntos.
   - Original: > Un campo marcado con `later` no retiene la página: el handler lo devuelve como una promesa, la página sale con lo demás, y `@await` pinta ese trozo cuando llega.
   - Propuesta: > Un campo marcado con `later` no retiene la página. El handler lo devuelve como una promesa y la página sale con lo demás. Cuando el campo llega, `@await` pinta ese trozo.

4. **Línea 170.** Problema: «uno por cada campo» no tiene sustantivo (P3).
   - Original: > primero los datos de `load`, y después uno por cada campo `later`, según llegan (Cómo viaja).
   - Propuesta: > primero los datos de `load`, y después un bloque por cada campo `later`, según llegan (Cómo viaja).

### `/docs/routing/early-hints` — `web/apps/site/src/routes/docs/routing/early-hints.fud`

1. **Líneas 38-40.** Problema: la página no abre con su idea; el primer párrafo queda bajo el `<h2>` «Qué es un `103`» (P1).
   - Original: > Mientras el servidor prepara una página, el navegador espera: no sabe qué CSS ni qué JavaScript necesitará hasta que llega el HTML.
   - Propuesta: > (Mismo párrafo, movido justo después del `<h1>`, antes del `<h2 id="what">`.)

2. **Línea 69.** Problema: «Están activadas» no tiene sujeto, y el título de la sección va en singular («Apagarlo»).
   - Original: > Están activadas por defecto, porque no cuestan nada a la página.
   - Propuesta: > Las early hints están activadas por defecto, porque no cuestan nada a la página.

### `/docs/routing/error-page` — `web/apps/site/src/routes/docs/routing/error-page.fud`

1. **Líneas 38-40.** Problema: la página no abre con su idea; el primer párrafo queda bajo el `<h2>` «`_error.fud`» (P1).
   - Original: > La página de error de una app es `src/routes/_error.fud`, y la crea `fudic g error-page`.
   - Propuesta: > (Mismo párrafo, movido justo después del `<h1>`, antes del `<h2 id="file">`.)

2. **Línea 71 (y meta description, línea 8, y og:description, línea 12).** Problema: «una llamada que nadie espera» se lee como «inesperada», no como «sin nadie que recoja su error».
   - Original: > Una llamada que falla y nadie espera, con `error-pages` en la cadena: el navegador va a la página de error.
   - Propuesta: > Una llamada que falla sin que nadie recoja el error, con `error-pages` en la cadena: el navegador va a la página de error.
   - Original: > que pinta un 404, un load que falla o una llamada que nadie espera.
   - Propuesta: > que pinta un 404, un load que falla o una llamada que falla sin que nadie recoja el error.
   - Original: > Un _error.fud para el 404, el load que falla y la llamada que nadie espera.
   - Propuesta: > Un _error.fud para el 404, el load que falla y la llamada cuyo error nadie recoge.

3. **Línea 77.** Problema: «Es lo único que puede declarar» no tiene sujeto claro (P3).
   - Original: > Es lo único que puede declarar.
   - Propuesta: > `layout` es lo único que puede declarar un `_error.fudapi`.

### `/docs/routing/rendering` — `web/apps/site/src/routes/docs/routing/rendering.fud`

1. **Líneas 41-43.** Problema: la página no abre con su idea; el primer párrafo queda bajo el `<h2>` «Tres modos» (P1).
   - Original: > Toda página de Fudic llega al navegador ya pintada. Lo que cambia es quién la pinta y cuándo, y eso es su modo.
   - Propuesta: > (Mismo párrafo, movido justo después del `<h1>`, antes del `<h2 id="modes">`.)

2. **Línea 97.** Problema: «Uno que `paths` no dio» no tiene sustantivo (P3).
   - Original: > Uno que `paths` no dio, como un artículo publicado después, se pinta cuando alguien lo pide.
   - Propuesta: > Un valor que `paths` no devolvió, como el de un artículo publicado después, se pinta cuando alguien lo pide.

Sin cambios: ninguna (las 14 páginas tienen al menos un hallazgo).

---

## Bloque 6. Pruebas, términos y editores

### Patrones de este bloque

1. **«para» como verbo (parar) junto a un complemento con «con».** «el criterio para con `FUD1202`» se lee primero como la preposición «para» y obliga a releer. Proponer «se detiene» o «detiene».
   - Ejemplo: > Un gesto sobre un elemento que nunca aparece para el criterio con `FUD1202`.
   - Propuesta: > Un gesto sobre un elemento que nunca aparece detiene el criterio con `FUD1202`.
   - Páginas: `/docs/testing`, `/docs/terms/anatomy` (2 veces), `/docs/terms/bench`, `/docs/terms/step-by-step`.

2. **Elipsis del verbo con una coma** («X, Y»; «Al pasar el ratón por X, qué hace»). Funciona en una lista corta, pero en prosa obliga a reconstruir el verbo.
   - Ejemplo: > La aprobación y la aceptación, las órdenes de arriba.
   - Propuesta: > La aprobación y la aceptación las apuntan las órdenes de arriba.
   - Páginas: `/docs/testing/unit`, `/docs/testing/history`, `/docs/terms/anatomy`, `/docs/terms/sharing`, `/docs/editors/writing`, `/docs/editors/reference`, `/docs/tools/format`.

3. **Pronombres sin antecedente cercano** («los», «lo», «su», «uno») cuando el sustantivo está en el encabezado o en el párrafo anterior.
   - Ejemplo: > Mientras trabajas, el workbench los ejecuta en cada guardado.
   - Propuesta: > Mientras trabajas, el workbench ejecuta los criterios en cada guardado.
   - Páginas: `/docs/testing`, `/docs/testing/unit`, `/docs/terms`, `/docs/terms/bench`, `/docs/terms/step-by-step`, `/docs/testing/pages-and-flows`.

### `/docs/testing` — `web/apps/site/src/routes/docs/testing.fud`

1. **Línea 66.** Problema: «vale» es vago y «hidratado» aparece sin contexto en la primera página del capítulo.
   - Original: > El segundo criterio vale aunque el componente aún no se haya hidratado: el primer clic nunca se pierde
   - Propuesta: > El segundo criterio pasa aunque el componente aún no se haya hidratado: el primer clic nunca se pierde

2. **Línea 83.** Problema: «fixture» se usa sin presentarlo y «al lado» no dice al lado de qué.
   - Original: > Si el componente tiene props, cada caso se escribe en un fixture, al lado, con su nombre:
   - Propuesta: > Si el componente tiene props, cada caso se escribe con su nombre en un fixture, un fichero TypeScript junto al componente:

3. **Línea 110.** Problema: «uno» no tiene antecedente claro.
   - Original: > Para uno que no los tiene:
   - Propuesta: > Para un componente que no los tiene:

4. **Línea 116.** Problema: tras los dos puntos falta el verbo; no queda claro qué hace el editor con esa lista.
   - Original: > El editor comprueba cada línea mientras escribes: un paso que no existe, un argumento que no le toca o un caso que el fixture no tiene.
   - Propuesta: > El editor comprueba cada línea mientras escribes y marca un paso que no existe, un argumento que no le toca o un caso que el fixture no tiene.

5. **Línea 120.** Problema: «los» remite a «criterios», que no aparece en la sección.
   - Original: > Mientras trabajas, el <a href="/docs/testing/workbench">workbench</a> los ejecuta en cada guardado.
   - Propuesta: > Mientras trabajas, el <a href="/docs/testing/workbench">workbench</a> ejecuta los criterios en cada guardado.

6. **Línea 132.** Problema: sujeto implícito y «acaba bien» es vago.
   - Original: > Solo acaba bien si pasan todos, así que sirve tal cual como paso de CI.
   - Propuesta: > `fudic spec` solo termina con éxito si pasan todos, así que sirve tal cual como paso de CI.

7. **Línea 138.** Problema: «para el criterio con» se lee como preposición (patrón 1).
   - Original: > Un gesto sobre un elemento que nunca aparece para el criterio con
   - Propuesta: > Un gesto sobre un elemento que nunca aparece detiene el criterio con

### `/docs/testing/unit` — `web/apps/site/src/routes/docs/testing/unit.fud`

1. **Línea 40.** Problema: la elipsis con coma hace leer «el servidor y la hidratación» juntos.
   - Original: > El HTML es el que manda el servidor y la hidratación, la que hace el navegador.
   - Propuesta: > El HTML es el mismo que manda el servidor, y la hidratación, la misma que hace el navegador.

2. **Línea 59.** Problema: el sujeto de «empezó» queda ambiguo.
   - Original: > espera a que acabe todo lo que empezó: peticiones, código y microtareas.
   - Propuesta: > espera a que acabe todo lo que puso en marcha: peticiones, código y microtareas.

3. **Línea 67.** Problema: doble negación.
   - Original: > No se simula nada que no simules tú.
   - Propuesta: > Solo se simula lo que simulas tú.

4. **Línea 74.** Problema: el «para» final queda suelto, sin verbo.
   - Original: > ocupa el lugar del servidor en ese test: para un `500` o un fallo de red.
   - Propuesta: > ocupa el lugar del servidor en ese test. Sirve para probar un `500` o un fallo de red.

5. **Línea 87.** Problema: incisos encadenados («o, con fixture,») y «su» ambiguo.
   - Original: > `visit` ejecuta el `load` de verdad, o, con `fixture`, usa los datos del mismo fixture que su `.fudspec`
   - Propuesta: > `visit` ejecuta el `load` de verdad. Con `fixture`, usa en su lugar los datos del fixture de la ruta, el mismo que usa su `.fudspec`

6. **Línea 100.** Problema: elipsis «los de todos» sin sustantivo.
   - Original: > desde la raíz de un workspace, los de todos.
   - Propuesta: > desde la raíz de un workspace, los de todos sus proyectos.

7. **Línea 104.** Problema: el sujeto es una lista heterogénea de cuatro cosas antes del verbo.
   - Original: > Un ancho mínimo, un elemento visible, a dónde va el foco o lo que lee un lector de pantalla se prueban en un `.fudspec`, en un navegador de verdad.
   - Propuesta: > Por eso se prueban en un `.fudspec`, en un navegador de verdad: un ancho mínimo, un elemento visible, a dónde va el foco o lo que lee un lector de pantalla.

8. **Línea 109.** Problema: tres ideas encadenadas con comas.
   - Original: > crea el elemento como lo crea un padre en el navegador, sin pasar por el servidor, con cualquier valor como prop.
   - Propuesta: > crea el elemento como lo crea un padre en el navegador, sin pasar por el servidor. Así acepta cualquier valor como prop.

### `/docs/testing/pages-and-flows` — `web/apps/site/src/routes/docs/testing/pages-and-flows.fud`

1. **Línea 8 (meta description).** Problema: dos «y» seguidos y un punto y coma en una sola frase.
   - Original: > Criterios de páginas y flujos en Fudic: page abre una ruta por su URL con su layout, y lo que el fixture nombra es falso y el resto real; flow recorre varias páginas contra el servidor de verdad.
   - Propuesta: > Criterios de páginas y flujos en Fudic. page abre una ruta por su URL con su layout: lo que nombra el fixture es falso y el resto es real. flow recorre varias páginas contra el servidor de verdad.

2. **Línea 40.** Problema: «fixture» aparece antes de presentarlo, en la frase de apertura.
   - Original: > Un `.fudspec` de página abre una ruta por su URL, con su layout: lo que el fixture nombra es falso y lo demás es real.
   - Propuesta: > Un `.fudspec` de página abre una ruta por su URL, con su layout. Lo que nombra su fixture, un fichero de datos de prueba, es falso; lo demás es real.

3. **Línea 99.** Problema: «responde funciones» es un régimen forzado.
   - Original: > `calls` responde funciones de servidor sin ejecutarlas:
   - Propuesta: > `calls` da la respuesta de funciones de servidor sin ejecutarlas:

4. **Línea 100.** Problema: el sujeto de «responde» no está claro.
   - Original: > dicen cómo responde: con un error, con una redirección, o tarde.
   - Propuesta: > dicen cómo responden los datos o la función: con un error, con una redirección o tarde.

5. **Línea 103.** Problema: frase larga con un sujeto partido por un inciso.
   - Original: > El fixture lleva el tipo que genera el `.fudapi` de la ruta: unos datos que no son los de su `load`, o una función que la página no puede llamar, se marcan en el editor
   - Propuesta: > El fixture lleva el tipo que genera el `.fudapi` de la ruta. El editor marca unos datos que no son los de su `load` o una función que la página no puede llamar

6. **Línea 109.** Problema: «respondida» concuerda con una «llamada» que no está en la frase.
   - Original: > `save` se llamó una vez, respondida por el fixture o de verdad.
   - Propuesta: > `save` se llamó una vez, tanto si respondió el fixture como si se ejecutó de verdad.

7. **Línea 116.** Problema: dos aposiciones seguidas hacen difícil separar opciones de explicaciones.
   - Original: > se abre con `path`, uno de los valores de su `paths`, o con `url`, una URL cualquiera:
   - Propuesta: > se abre de dos formas: con `path` y uno de los valores de su `paths`, o con `url` y una URL cualquiera:

8. **Línea 131.** Problema: tres ideas distintas en una sola frase.
   - Original: > Vive en `src/flows`, lo crea `fudic g flow sign-up`, y aquí el servidor es el de verdad:
   - Propuesta: > Vive en `src/flows` y lo crea `fudic g flow sign-up`. Aquí el servidor es el de verdad:

9. **Línea 159.** Problema: «pasa lo que sigue a otra persona» es oscuro, y «uno no ve lo de otro» deja los referentes en el aire.
   - Original: > `as` pasa lo que sigue a otra persona, con su navegador y sus cookies. Así se prueba que uno no ve lo de otro:
   - Propuesta: > Con `as`, los pasos que siguen los hace otra persona, con su navegador y sus cookies. Así se prueba que una persona no ve lo de otra:

10. **Línea 185.** Problema: «se responde» no tiene sujeto ni destinatario claros.
    - Original: > se sube con `upload` y se responde con `file("./fixtures/people.csv")`
    - Propuesta: > se sube con `upload`, y un fixture lo devuelve como respuesta con `file("./fixtures/people.csv")`

### `/docs/testing/history` — `web/apps/site/src/routes/docs/testing/history.fud`

1. **Línea 8 (meta description).** Problema: el paralelismo se rompe («quién aprobó ... sus ejecuciones») y la frase acumula demasiadas ideas.
   - Original: > un .fudlog en git que solo crece, con quién aprobó sus criterios, sus ejecuciones y la aceptación del cliente, y un hash que dice si siguen valiendo.
   - Propuesta: > un .fudlog en git que solo crece. Guarda quién aprobó sus criterios, cómo salieron sus ejecuciones y qué aceptó el cliente, con un hash que dice si siguen valiendo.

2. **Línea 38.** Problema: «lo que había» es vago.
   - Original: > Cada línea lleva un hash de lo que había
   - Propuesta: > Cada línea lleva un hash de los ficheros en ese momento

3. **Línea 49.** Problema: «Cada línea es» seguido de cuatro cosas distintas fuerza el verbo.
   - Original: > Cada línea es el minuto en UTC, el commit en que se escribió, lo que pasó y sus datos.
   - Propuesta: > Cada línea lleva el minuto en UTC, el commit en que se escribió, lo que pasó y sus datos.

4. **Línea 59.** Problema: «cualquiera de los dos» puede referirse al nombre y al hash.
   - Original: > Si cualquiera de los dos cambia después, la aprobación caduca:
   - Propuesta: > Si el `.fudspec` o su fixture cambian después, la aprobación caduca:

5. **Línea 84.** Problema: elipsis del verbo con coma (patrón 2).
   - Original: > La aprobación y la aceptación, las órdenes de arriba.
   - Propuesta: > La aprobación y la aceptación las apuntan las órdenes de arriba.

### `/docs/testing/workbench` — `web/apps/site/src/routes/docs/testing/workbench.fud`

1. **Línea 43.** Problema: «está» en singular con dos sujetos, y no dice para qué sirven.
   - Original: > También está el icono de vista previa de la barra del editor y la orden <em>Fudic: Open Workbench</em>.
   - Propuesta: > También lo abren el icono de vista previa de la barra del editor y la orden <em>Fudic: Open Workbench</em>.

2. **Línea 83.** Problema: «viva» queda descolgado y el sujeto de «la dejó» no está claro.
   - Original: > abre la página del criterio viva, en el estado en que la dejó:
   - Propuesta: > abre viva la página del criterio, en el estado en que la dejó el último paso:

3. **Línea 87.** Problema: un sujeto de cinco elementos antes del verbo.
   - Original: > Guardar el `.fud`, un componente que enlaza, el `.fudspec`, el fixture o un paso propio vuelve a ejecutar los criterios.
   - Propuesta: > Los criterios se vuelven a ejecutar al guardar el `.fud`, un componente que enlaza, el `.fudspec`, el fixture o un paso propio.

4. **Línea 106.** Problema: la pasiva y la elipsis «ni una ruta» obligan a releer.
   - Original: > Un layout no se abre</strong>, ni una ruta sin su `.fudspec`:
   - Propuesta: > El workbench no abre un layout</strong> ni una ruta sin su `.fudspec`:

### `/docs/terms` — `web/apps/site/src/routes/docs/terms.fud`

1. **Línea 66.** Problema: «lo cuenta» es ambiguo, y «se rompe en `cart-has.js`» no dice que solo hay que arreglarlo allí.
   - Original: > Si mañana el carrito deja de ser una lista, el primero se rompe en cada criterio que lo cuenta; el segundo, en `cart-has.js`.
   - Propuesta: > Si mañana el carrito deja de ser una lista, el primero hay que arreglarlo en cada criterio que cuenta sus elementos; el segundo, solo en `cart-has.js`.

2. **Línea 76.** Problema: «cambia de nombre a uno de serie» se entiende al revés.
   - Original: > si un término solo cambia de nombre a uno de serie
   - Propuesta: > si un término solo le pone otro nombre a uno de serie

3. **Línea 80.** Problema: la sección arranca con una frase sin verbo.
   - Original: > Un módulo de JavaScript en `fudic/terms/&lt;bloque&gt;/&lt;nombre&gt;.js`, con dos partes:
   - Propuesta: > Un término es un módulo de JavaScript en `fudic/terms/&lt;bloque&gt;/&lt;nombre&gt;.js`, con dos partes:

### `/docs/terms/sharing` — `web/apps/site/src/routes/docs/terms/sharing.fud`

1. **Línea 36.** Problema: el sujeto de «gana» parece ser «cada proyecto».
   - Original: > Cada proyecto tiene sus términos en su carpeta `fudic/terms`, y gana a los de serie:
   - Propuesta: > Cada proyecto tiene sus términos en su carpeta `fudic/terms`, y esos términos ganan a los de serie:

2. **Línea 45.** Problema: «el primero», «entero» y «no se mezclan» son elipsis que se apoyan unas en otras; «sirven a» se lee como permiso, no como límite.
   - Original: > Gana el primero que tiene `&lt;bloque&gt;/&lt;nombre&gt;.js`, entero: no se mezclan. Cada app y cada librería de un workspace es un proyecto, con su carpeta: los términos de una librería sirven a los `.fudspec` de esa librería.
   - Propuesta: > Gana el primer sitio que tiene `&lt;bloque&gt;/&lt;nombre&gt;.js`, y gana entero: un término no mezcla partes de los dos. Cada app y cada librería de un workspace es un proyecto con su carpeta. Los términos de una librería solo sirven a los `.fudspec` de esa librería.

3. **Línea 72.** Problema: el inciso «para copiarlos de modelo» corta la frase.
   - Original: > Los de serie, para copiarlos de modelo, están en `node_modules/@fudic/terms/terms`.
   - Propuesta: > Si quieres partir de uno de serie, están en `node_modules/@fudic/terms/terms`.

4. **Línea 91.** Problema: «literal» suelto entre comas y «su editor» con un posesivo ambiguo.
   - Original: > `meta` se queda en cada proyecto, literal, porque es lo que lee su editor.
   - Propuesta: > `meta` se escribe literal en cada proyecto, porque es lo que lee el editor.

### `/docs/terms/anatomy` — `web/apps/site/src/routes/docs/terms/anatomy.fud`

1. **Línea 40.** Problema: frase larga con punto y coma y dos ideas por cada parte.
   - Original: > Un término tiene dos partes: `meta` dice cómo se escribe el paso y el editor la lee sin ejecutar nada; `run` hace el trabajo en el navegador y devuelve si se cumple y por qué.
   - Propuesta: > Un término tiene dos partes. `meta` dice cómo se escribe el paso, y el editor la lee sin ejecutar nada. `run` hace el trabajo en el navegador y devuelve si se cumple y por qué.

2. **Línea 63.** Problema: dos dos puntos seguidos («`pass: false`: un término»).
   - Original: > Recién creado devuelve `pass: false`: un término nunca pasa por accidente.
   - Propuesta: > Recién creado devuelve `pass: false`, para que un término nunca pase por accidente.

3. **Línea 71.** Problema: el valor (`true`) queda enterrado entre la condición y la alternativa.
   - Original: > en un `then` que comprueba que algo no está, `true`, o una función de los argumentos.
   - Propuesta: > `true` en un `then` que comprueba que algo no está, o una función que lo decide según los argumentos.

4. **Línea 85.** Problema: densidad excesiva: recomendación, forma, glosa y motivo en una frase.
   - Original: > En un `then`, mejor `{ expected, actual }`, lo que buscó contra lo que encontró, en texto: el workbench los enseña uno frente al otro.
   - Propuesta: > En un `then`, mejor `{ expected, actual }` en texto: lo que buscó y lo que encontró. El workbench los enseña uno frente al otro.

5. **Línea 96.** Problema: frase sin verbo como entrada de la sección.
   - Original: > Lo que recibe `run`, uno por persona del criterio:
   - Propuesta: > `run` recibe un `ctx` por cada persona del criterio. Trae esto:

6. **Línea 99.** Problema: «al usarlo» descolocado y «para el criterio» (patrón 1).
   - Original: > Si encuentra más de uno al usarlo, para el criterio
   - Propuesta: > Si al usarlo encuentra más de uno, detiene el criterio

7. **Línea 101.** Problema: «servido» no es el verbo esperado para una página que reacciona a un gesto.
   - Original: > hace un gesto y espera a que la página lo haya servido:
   - Propuesta: > hace un gesto y espera a que la página termine de responder a él:

8. **Línea 103.** Problema: «una ruta relativa al `.fudspec`, absoluta» no se entiende sin releer.
   - Original: > una ruta relativa al `.fudspec`, absoluta.
   - Propuesta: > convierte en absoluta una ruta relativa al `.fudspec`.

9. **Línea 107.** Problema: cuatro nombres emparejados con cuatro explicaciones en una sola frase.
   - Original: > la última respuesta del documento, las peticiones y descargas del último `when`, si la página se recargó, y los valores de `paths`.
   - Propuesta: > devuelven, por este orden, la última respuesta del documento, las peticiones y descargas del último `when`, si la página se recargó y los valores de `paths`.

10. **Línea 116.** Problema: «Uno» ambiguo y «no va a aparecer esperando» es una construcción forzada.
    - Original: > Uno con `negative` se lee una sola vez, porque algo que no está no va a aparecer esperando.
    - Propuesta: > Un `then` con `negative` se lee una sola vez: esperar no cambia que algo no esté.

11. **Línea 121.** Problema: «para con `FUD1204` y el mensaje» (patrón 1).
    - Original: > el criterio para con
    - Propuesta: > el criterio se detiene con

### `/docs/terms/bench` — `web/apps/site/src/routes/docs/terms/bench.fud`

1. **Línea 37.** Problema: el paréntesis corta la frase de apertura y «eso va» es coloquial y vago.
   - Original: > Cuando varios términos necesitan lo mismo (entrar como un usuario, encontrar el carrito), eso va una vez en `fudic/bench.js`, y aparece en el `ctx` de todos los términos del proyecto.
   - Propuesta: > Cuando varios términos necesitan lo mismo, como entrar como un usuario o encontrar el carrito, se escribe una vez en `fudic/bench.js`. Desde ahí aparece en el `ctx` de todos los términos del proyecto.

2. **Línea 66.** Problema: «lo» no tiene antecedente claro.
   - Original: > `fudic g term` escribe el tipo que lo incluye
   - Propuesta: > `fudic g term` escribe el tipo del `ctx` con lo que añade `bench.js`

3. **Línea 80.** Problema: la sección arranca sin verbo.
   - Original: > Lo que hay que hacer en cada navegador antes de abrir la página, en todos los criterios:
   - Propuesta: > `setup` prepara cada navegador antes de abrir la página, en todos los criterios:

4. **Línea 96.** Problema: «cada criterio para con» (patrón 1).
   - Original: > cada criterio para con
   - Propuesta: > cada criterio se detiene con

### `/docs/terms/step-by-step` — `web/apps/site/src/routes/docs/terms/step-by-step.fud`

1. **Línea 39.** Problema: la página abre con una frase sin verbo.
   - Original: > Una tienda con carrito, y un criterio que dice lo que tiene que pasar en el idioma de la tienda.
   - Propuesta: > En una tienda con carrito, un criterio dice lo que tiene que pasar en el idioma de la tienda.

2. **Línea 55.** Problema: «su bombilla» es ambiguo (¿del editor?, ¿de la línea?).
   - Original: > y su bombilla ofrece crear el fichero.
   - Propuesta: > y la bombilla de cada línea ofrece crear el fichero.

3. **Línea 117.** Problema: «el criterio para con» (patrón 1).
   - Original: > el criterio para con
   - Propuesta: > el criterio se detiene con

4. **Línea 143.** Problema: «lo vuelve a leer hasta 5 segundos» no es gramatical.
   - Original: > Fudic lo vuelve a leer hasta 5 segundos.
   - Propuesta: > Fudic lo vuelve a leer durante 5 segundos como máximo.

5. **Línea 144.** Problema: «compararlos» no tiene antecedente.
   - Original: > `evidence` en texto</strong>, para que el workbench pueda compararlos.
   - Propuesta: > `evidence` en texto</strong>: `expected` y `actual` como cadenas, para que el workbench pueda compararlos.

### `/docs/editors` — `web/apps/site/src/routes/docs/editors.fud`

1. **Línea 43.** Problema: una enumeración de seis elementos, con un complemento final que cambia de tema.
   - Original: > los componentes, sus props y sus eventos, los datos de la página, los tokens de CSS y los enlaces, con los tipos del `.fudapi` y del `@code` comprobados en el markup.
   - Propuesta: > los componentes, sus props y sus eventos, los datos de la página, los tokens de CSS y los enlaces. El markup se comprueba con los tipos del `.fudapi` y del `@code`.

2. **Línea 44.** Problema: «cada una» y la elipsis del verbo obligan a releer.
   - Original: > cada declaración y cada cláusula, y encima de cada una quién la implementa.
   - Propuesta: > cada declaración y cada cláusula, y encima de cada declaración, quién la implementa.

3. **Línea 59.** Problema: el «igual» final queda colgando.
   - Original: > y la extensión de Fudic está también allí, igual.
   - Propuesta: > y la extensión de Fudic también está allí, la misma.

4. **Línea 61.** Problema: «sistema» es ambiguo.
   - Original: > Cada sistema tiene su propia versión
   - Propuesta: > Cada sistema operativo tiene su propia versión

### `/docs/editors/other` — `web/apps/site/src/routes/docs/editors/other.fud`

1. **Línea 83.** Problema: «las órdenes de los enlaces» y la frase siguiente se contradicen a primera vista.
   - Original: > Las órdenes de los enlaces del `.fudapi`</strong>, como ver los tipos generados. Los enlaces salen, pero las órdenes son de la extensión.
   - Propuesta: > Las órdenes de los enlaces del `.fudapi`</strong>, como ver los tipos generados. En otros editores los enlaces también salen, pero las órdenes que lanzan son de la extensión.

2. **Línea 84.** Problema: «el color de la primera vista» es oscuro.
   - Original: > El color de la primera vista</strong>, antes de que responda el servidor, y la barra de estado.
   - Propuesta: > El coloreado del fichero recién abierto</strong>, antes de que responda el servidor, y la barra de estado.

3. **Línea 90.** Problema: la relativa «que lee el servidor» puede referirse al componente o al elemento.
   - Original: > con `shadowrootmode`, el elemento con el que empieza cada componente que lee el servidor.
   - Propuesta: > con `shadowrootmode`, el elemento con el que empieza cada componente, y el que lee el servidor.

### `/docs/editors/reference` — `web/apps/site/src/routes/docs/editors/reference.fud`

1. **Línea 50.** Problema: el sujeto de «pinta» cambia sin avisar.
   - Original: > y lo que pinta si falla.
   - Propuesta: > y lo que se pinta si falla.

2. **Línea 76.** Problema: tres elipsis telegráficas separadas por punto y coma.
   - Original: > Un middleware; los de todas las funciones de debajo; ejecutarlos.
   - Propuesta: > Un middleware; una cadena con los middlewares de todas las funciones de debajo; la línea que los ejecuta.

3. **Línea 111.** Problema: fragmento sin verbo pegado a la descripción.
   - Original: > Tras instalar una dependencia o cambiar de rama.
   - Propuesta: > Úsala tras instalar una dependencia o cambiar de rama.

4. **Línea 112.** Problema: los dos puntos dejan sin decir que es un uso.
   - Original: > Cada tag, su `href` y a qué fichero llega: por qué un componente no se completa.
   - Propuesta: > Cada tag, su `href` y a qué fichero llega. Sirve para ver por qué un componente no se completa.

5. **Línea 137.** Problema: el inciso separa el verbo de su complemento.
   - Original: > La extensión también deja puestos, para los ficheros de Fudic, dos espacios de sangría y formatear al guardar.
   - Propuesta: > Para los ficheros de Fudic, la extensión también deja puestos dos espacios de sangría y el formato al guardar.

### `/docs/editors/writing` — `web/apps/site/src/routes/docs/editors/writing.fud`

1. **Línea 62.** Problema: «dentro» no dice dentro de qué.
   - Original: > Una expresión dentro se completa con el tipo de la prop.
   - Propuesta: > Una expresión en el valor de una prop se completa con el tipo de esa prop.

2. **Línea 63.** Problema: una enumeración de siete elementos en una sola frase.
   - Original: > una tarjeta con lo que hay que saber para usarlo: su descripción, cada prop con su tipo, su valor por defecto y su documentación, sus slots, los eventos que emite y lo que llevan, sus parts y los tokens que lee.
   - Propuesta: > sale una tarjeta con lo que hay que saber para usarlo. Trae su descripción y cada prop con su tipo, su valor por defecto y su documentación. También sus slots, los eventos que emite y lo que llevan, sus parts y los tokens que lee.

3. **Línea 68.** Problema: «también» mal colocado; parece decir que el color es otra forma de distinguirlo.
   - Original: > Cada componente se distingue de un tag nativo también en el color:
   - Propuesta: > Los componentes también se distinguen de los tags nativos por el color:

4. **Línea 86.** Problema: elipsis del verbo (patrón 2).
   - Original: > Al pasar el ratón por un token, de dónde viene;
   - Propuesta: > Al pasar el ratón por un token, dice de dónde viene;

5. **Línea 99.** Problema: elipsis del verbo (patrón 2).
   - Original: > por una regla, un `catches` o un fichero, qué hace;
   - Propuesta: > por una regla, un `catches` o un fichero, explica qué hace;

6. **Línea 109.** Problema: tras los dos puntos se apilan tres cosas, con un paréntesis al final.
   - Original: > abre el workbench al lado del editor: el componente o la página, sus criterios ejecutados en un navegador de verdad en cada guardado y <em>Live</em> para tocarlo a mano
   - Propuesta: > abre el workbench al lado del editor. Enseña el componente o la página, ejecuta sus criterios en un navegador de verdad en cada guardado y ofrece <em>Live</em> para tocarlo a mano

7. **Línea 111.** Problema: frase sin verbo hasta el final y correspondencia «todos, los que fallan o ese» difícil de seguir.
   - Original: > Encima de la primera línea, <strong>Run all</strong> y <strong>Run failing</strong>, y encima de cada criterio, <strong>Run</strong>: ejecutan todos, los que fallan o ese, en el workbench.
   - Propuesta: > Encima de la primera línea salen <strong>Run all</strong> y <strong>Run failing</strong>, que ejecutan todos los criterios o los que fallan. Encima de cada criterio sale <strong>Run</strong>, que ejecuta solo ese. Todo se ejecuta en el workbench.

8. **Línea 129.** Problema: «o `Ctrl+.`» queda suelto sin verbo.
   - Original: > aparece la bombilla, o <kbd>Ctrl+.</kbd>.
   - Propuesta: > aparece la bombilla; también la abre <kbd>Ctrl+.</kbd>.

### `/docs/tools/format` — `web/apps/site/src/routes/docs/tools/format.fud`

1. **Línea 105.** Problema: elipsis del verbo (patrón 2).
   - Original: > Las opciones, una a una, en
   - Propuesta: > Cada opción se explica en

Sin cambios: ninguna (todas las páginas del alcance tienen al menos un hallazgo).

---

## Bloque 7. Vite, Service Worker, rendimiento y configuración

Nota: en los originales, `backticks` sustituye a `<code>…</code>`, y `<`/`>` dentro de código aparecen en el fichero como `&lt;`/`&gt;`. Donde el fichero escribe `@@` (escape de `@`), se cita tal cual.

### Patrones de este bloque

1. **Párrafos sin verbo que abren página o sección.** Una frase nominal hace de párrafo y obliga a reponer el verbo. Ejemplo (fields.fud, línea 38): > Los campos de `fudic.json` que deciden qué CSS reciben los componentes, en qué idiomas sale la app y cómo se sirve. → > Estos campos de `fudic.json` deciden qué CSS reciben los componentes, en qué idiomas sale la app y cómo se sirve.
   Páginas: `/docs/configuration/fields` (l. 38), `/docs/configuration` (l. 59), `/docs/configuration/generated` (l. 77, 112), `/docs/configuration/baseline` (l. 108), `/docs/configuration/sw-json` (l. 88), `/docs/vite/build` (l. 84).

2. **Referentes ambiguos («su», «lo», «él», «solo»).** El pronombre admite dos antecedentes, o «solo» se lee como «únicamente» y como «por sí mismo». Ejemplo (service-worker/caching.fud, línea 73): > Fudic marca así, solo, toda respuesta… → > Fudic marca así, por su cuenta, toda respuesta…
   Páginas: `/docs/service-worker` (l. 40), `/docs/service-worker/caching` (l. 73), `/docs/service-worker/headers` (l. 37), `/docs/service-worker/isomorphic` (l. 55, 91), `/docs/vite` (l. 94, 104), `/docs/configuration/fields` (l. 54), `/docs/configuration/baseline` (l. 97, 101), `/docs/configuration/sw-json` (l. 121).

3. **Mismo concepto, dos términos: «hooks» y «ganchos del ciclo de vida».** `/docs/performance/caching` (l. 104) dice «Los hooks de una ruta»; `/docs/service-worker/isomorphic` (l. 81) y `/docs/configuration/generated` (l. 83) dicen «los ganchos del ciclo de vida». Conviene unificar en una sola forma.

4. **Elipsis tras coma o dos puntos que obligan a reponer el verbo** («En desarrollo, siempre.», «`null` o sin escribir, para siempre.», «Es donde…»). Páginas: `/docs/vite/build` (l. 76, 84), `/docs/configuration/sw-json` (l. 88), `/docs/service-worker` (l. 69), `/docs/service-worker/headers` (l. 58).

### `/docs/vite` — `web/apps/site/src/routes/docs/vite.fud`

1. **Línea 57.** Problema: «Lo que ya es de Vite» es vago y la idea se parte en dos frases con el mismo «lo».
   - Original: > Lo que ya es de Vite no se repite en las opciones de Fudic. El plugin lo lee de la configuración de Vite:
   - Propuesta: > Lo que ya se configura en Vite no se repite en las opciones de Fudic: el plugin lo lee de la configuración de Vite.

2. **Línea 75.** Problema: el orden «`/` una y `/admin/` otra» está forzado.
   - Original: > `fudic dev` lee ese `base` para servir cada app del workspace en su sitio: `/` una y `/admin/` otra, en el mismo puerto.
   - Propuesta: > `fudic dev` lee ese `base` para servir cada app del workspace en su sitio, una en `/` y otra en `/admin/`, en el mismo puerto.

3. **Línea 94.** Problema: «un valor» no dice de qué es valor, y luego «lo» apunta a ese valor como si fuera la página.
   - Original: > qué pasa con un valor que `paths` no dio. Con `"lazy"`, por defecto, se pinta cuando alguien lo pide. Con `"notFound"`, responde la página de error con un `404`
   - Propuesta: > qué pasa cuando la URL trae un valor de parámetro que `paths` no dio. Con `"lazy"`, por defecto, la página se pinta cuando alguien la pide. Con `"notFound"`, responde la página de error con un `404`

4. **Línea 95.** Problema: «por su patrón» queda colgando al final y no se sabe a qué se aplica.
   - Original: > el modo de una ruta que no declara ninguno, por su patrón.
   - Propuesta: > el modo que reciben, según su patrón, las rutas que no declaran ninguno.

5. **Línea 104.** Problema: «ese segundo build» y «el del primero» no tienen antecedente; tres ideas en un solo punto.
   - Original: > construye la app sin Service Worker, como si no tuviera `sw.json`. Con <strong>`edgeDir`</strong>, que por defecto es `.fudic/edge`, ese segundo build escribe su servidor en otra carpeta y no pisa el del primero. Sirve para comparar las dos formas de la misma app.
   - Propuesta: > construye la app sin Service Worker, como si no tuviera `sw.json`. Sirve para comparar las dos formas de la misma app: haces un build con Service Worker y otro sin él. Para que el segundo no pise el servidor del primero, dale otra carpeta con <strong>`edgeDir`</strong>, que por defecto es `.fudic/edge`.

### `/docs/vite/dev` — `web/apps/site/src/routes/docs/vite/dev.fud`

1. **Línea 50.** Problema: «responde a … la página de error» no encaja, y «igual que después» no dice después de qué.
   - Original: > responde a las funciones del `.fudapi`, a los datos de las páginas y a la página de error, y la página sale en streaming igual que después.
   - Propuesta: > atiende las funciones del `.fudapi`, los datos de las páginas y la página de error. La página sale en streaming, igual que en producción.

2. **Línea 60.** Problema: tres ideas encadenadas en una frase (dónde sale el error, qué coincide con el editor, qué sale en la terminal).
   - Original: > En su lugar, el navegador enseña el error con su fichero y su línea, los mismos que marca el editor, y en la terminal sale entero.
   - Propuesta: > En su lugar, el navegador enseña el error con su fichero y su línea, los mismos que marca el editor. En la terminal sale entero.

3. **Línea 67.** Problema: «También si…» es una elipsis que obliga a reponer «recarga».
   - Original: > También si el cambio es solo del servidor, como un layout o el `.ts` que usa un handler.
   - Propuesta: > También recarga si el cambio solo afecta al servidor, como un layout o el `.ts` que usa un handler.

### `/docs/vite/build` — `web/apps/site/src/routes/docs/vite/build.fud`

1. **Línea 43.** Problema: «un componente que aún no usa ninguna página» se lee al revés (el componente usa la página), y «lo mismo que marca el editor» queda suelto tras los dos puntos.
   - Original: > El build comprueba los tipos de todo el proyecto, también los de un componente que aún no usa ninguna página: lo mismo que marca el editor.
   - Propuesta: > El build comprueba los tipos de todo el proyecto, también los de un componente que todavía no usa ninguna página. Marca lo mismo que el editor.

2. **Línea 45.** Problema: «con la cuenta» no se entiende hasta ver el ejemplo.
   - Original: > y falla una sola vez, con la cuenta:
   - Propuesta: > y falla una sola vez, con el número total de errores:

3. **Línea 56.** Problema: «cada `.fud` que alcanza una ruta» tiene el sujeto invertido: es la ruta la que alcanza el `.fud`.
   - Original: > cada `.fud` que alcanza una ruta, con sus componentes y sus layouts, y cada idioma de la app.
   - Propuesta: > cada `.fud` al que llega alguna ruta, con sus componentes y sus layouts, y cada idioma de la app.

4. **Línea 65.** Problema: «también para el build» se lee primero como preposición («para») y no como verbo.
   - Original: > Un error que solo se ve al pintar, como un `load` que lanza, también para el build, con la ruta que falló.
   - Propuesta: > Un error que solo se ve al pintar, como un `load` que lanza, también detiene el build, y dice la ruta que falló.

5. **Línea 74.** Problema: la enumeración mezcla dos objetos de «manda» con un verbo nuevo («registra») sin separarlos.
   - Original: > Manda las cabeceras, la CSP con su nonce y registra el Service Worker.
   - Propuesta: > Manda las cabeceras y la CSP con su nonce, y registra el Service Worker.

6. **Línea 76.** Problema: «Es donde…» abre sin sujeto y «lo que en desarrollo no está» tiene el orden forzado.
   - Original: > Es donde se prueba lo que en desarrollo no está, y donde se mide el rendimiento
   - Propuesta: > En la preview se prueba lo que no hay en desarrollo, y se mide el rendimiento

7. **Línea 84.** Problema: ni la primera frase ni la segunda dicen qué depende de qué; «En desarrollo, siempre» no tiene verbo.
   - Original: > En el build, depende de `build.sourcemap` de Vite, como el resto del JavaScript (…). En desarrollo, siempre.
   - Propuesta: > En el build, el source map depende de `build.sourcemap` de Vite, como el del resto del JavaScript (…). En desarrollo se genera siempre.

### `/docs/service-worker` — `web/apps/site/src/routes/docs/service-worker.fud`

1. **Línea 40 (y meta description, línea 8).** Problema: «los datos que guardó» deja el sujeto en el aire; puede leerse que los guardó el servidor.
   - Original: > con el mismo código que el servidor y los datos que guardó.
   - Propuesta: > con el mismo código que el servidor y con los datos que tiene guardados.

2. **Línea 69.** Problema: la segunda mitad es una elipsis («y el JavaScript…, antes de…») que obliga a reponer «lo guarda».
   - Original: > El código de cada ruta lo guarda cuando se visita, y el JavaScript de los componentes que la página tiene a la vista, antes de que el usuario los toque.
   - Propuesta: > El código de cada ruta lo guarda cuando se visita. El JavaScript de los componentes que la página tiene a la vista lo guarda antes de que el usuario los toque.

3. **Línea 94.** Problema: tres sujetos acumulados antes del verbo, con un «los… él» que obliga a releer.
   - Original: > El runtime de Fudic, lo que lista `shell` y lo que casa con `resources` también los sirve él, desde su caché.
   - Propuesta: > También sirve desde su caché el runtime de Fudic, las URLs que lista `shell` y lo que casa con un patrón de `resources`.

### `/docs/service-worker/isomorphic` — `web/apps/site/src/routes/docs/service-worker/isomorphic.fud`

1. **Línea 55.** Problema: «lo que usan» no deja claro quién usa qué; la enumeración tiene cuatro miembros de distinta naturaleza.
   - Original: > las props, los signals y los `computed` que aparecen en el markup, lo que usan, y los servicios de `inject` y `provide`.
   - Propuesta: > las props, los signals y los `computed` que aparecen en el markup, junto con todo lo que estos usan, y los servicios de `inject` y `provide`.

2. **Línea 81.** Problema: el punto acumula cuatro elementos, una relativa sobre `task` con un enlace y una frase final; demasiado denso.
   - Original: > los `effect`, los ganchos del ciclo de vida (…), los handlers de eventos y las llamadas de un `task`, que al pintar muestra su valor `initial` (…). Ahí va todo lo que necesita `window`, `document` o el tamaño de la pantalla.
   - Propuesta: > los `effect`, los ganchos del ciclo de vida (…), los handlers de eventos y las llamadas de un `task`. Al pintar, un `task` muestra su valor `initial` (…). Aquí va todo lo que necesita `window`, `document` o el tamaño de la pantalla.

3. **Línea 82.** Problema: dos oraciones unidas por coma tras los dos puntos; falta el «sino que».
   - Original: > el Service Worker no ejecuta `load`, pide su resultado al servidor.
   - Propuesta: > el Service Worker no ejecuta `load`, sino que pide su resultado al servidor.

4. **Línea 88.** Problema: «no toca el navegador» es una metáfora vaga; se refiere a no usar sus APIs.
   - Original: > Lo que el HTML muestra no toca el navegador.
   - Propuesta: > Lo que el HTML muestra no usa APIs del navegador.

5. **Línea 90.** Problema: «la lista cerrada» se usa como si el lector ya la conociera.
   - Original: > En el markup, solo las expresiones de la lista cerrada
   - Propuesta: > En el markup, solo las expresiones que Fudic admite

6. **Línea 91.** Problema: «sus datos» puede referirse al usuario o a la página.
   - Original: > Al construir no hay usuario, y sus datos no se guardan en el Service Worker
   - Propuesta: > Al construir no hay usuario, y los datos de una página así no se guardan en el Service Worker

### `/docs/service-worker/caching` — `web/apps/site/src/routes/docs/service-worker/caching.fud`

1. **Línea 52.** Problema: «y así» enlaza una consecuencia cuya causa (que el HTML se pinta siempre desde los datos) no se ha dicho en esa frase.
   - Original: > Pintar con ella cuesta unos milisegundos, y así nunca sale una página vieja con datos nuevos, ni al revés.
   - Propuesta: > Pintar con ella cuesta unos milisegundos. Como el HTML sale siempre de los datos guardados, nunca sale una página vieja con datos nuevos, ni al revés.

2. **Línea 73.** Problema: «solo», entre comas, se lee como «únicamente» y como «por sí mismo».
   - Original: > Fudic marca así, solo, toda respuesta de un `load` que lee la sesión
   - Propuesta: > Fudic marca así, por su cuenta, toda respuesta de un `load` que lee la sesión

### `/docs/service-worker/headers` — `web/apps/site/src/routes/docs/service-worker/headers.fud`

1. **Línea 37.** Problema: «sin él» puede referirse al Service Worker o a `'unsafe-eval'`.
   - Original: > porque sin él no podría cargar el código de las rutas.
   - Propuesta: > porque sin ese permiso no podría cargar el código de las rutas.

2. **Línea 41.** Problema: falla la concordancia: el sujeto es el fichero («Va») y luego «son las cabeceras».
   - Original: > Va en la raíz de la app, junto a `sw.json`, y son las cabeceras con las que se sirve `/fudic-sw.js`.
   - Propuesta: > Va en la raíz de la app, junto a `sw.json`, y contiene las cabeceras con las que se sirve `/fudic-sw.js`.

3. **Línea 58.** Problema: «en `page.headers` es un aviso» es una elipsis: falta qué pasa si se pone ahí.
   - Original: > La página sigue sin `'unsafe-eval'`, y en `page.headers` es un aviso.
   - Propuesta: > La página sigue sin `'unsafe-eval'`, y ponerlo en `page.headers` da un aviso.

### `/docs/performance` — `web/apps/site/src/routes/docs/performance.fud`

1. **Línea 79.** Problema: el inciso del principio corta el sujeto, y la frase final encadena la idea del LCP con «y eso es lo que».
   - Original: > El servidor, o el build si la página es estática, envía el HTML entero, con cada componente ya pintado dentro de su shadow DOM gracias a Declarative Shadow DOM. El navegador pinta según llega, sin esperar a ningún script, y eso es lo que mide el LCP: cuándo se ve lo más grande de la página.
   - Propuesta: > El HTML llega entero, con cada componente ya pintado dentro de su shadow DOM gracias a Declarative Shadow DOM. Lo envía el servidor, o el build si la página es estática. El navegador lo pinta según llega, sin esperar a ningún script. Es lo que mide el LCP: cuándo se ve lo más grande de la página.

### `/docs/performance/lighthouse` — `web/apps/site/src/routes/docs/performance/lighthouse.fud`

1. **Línea 43.** Problema: «Es lo que pone el servidor» es vago.
   - Original: > Es lo que pone el servidor, sin la red de por medio
   - Propuesta: > Es el tiempo del propio servidor, sin la red de por medio

2. **Línea 68.** Problema: la frase da un rodeo con dos «lo que» y la segunda no tiene verbo.
   - Original: > Lo que Fudic no decide es lo que pone cada app. En esta documentación, tres cosas:
   - Propuesta: > Lo que Fudic no decide depende de cada app. En esta documentación, la nota dependió de tres cosas:

3. **Línea 71.** Problema: la segunda frase acumula paréntesis, un participio, un complemento y una finalidad.
   - Original: > Ahora es una sola fuente variable, recortada a los caracteres del sitio (23 KB) y precargada con `<link rel="preload">` desde el layout, para que llegue con el HTML y no después del CSS.
   - Propuesta: > Ahora es una sola fuente variable de 23 KB, recortada a los caracteres del sitio. El layout la precarga con `<link rel="preload">`, para que llegue con el HTML y no después del CSS.

4. **Línea 72.** Problema: no queda claro qué se quiere decir con bloquear el JavaScript ni por qué importa aquí.
   - Original: > Bloquear todo el JavaScript de la página no cambia la nota.
   - Propuesta: > Con todo el JavaScript de la página bloqueado, la nota es la misma.

### `/docs/performance/caching` — `web/apps/site/src/routes/docs/performance/caching.fud`

1. **Línea 40.** Problema: «la use» no concuerda con «varias cachés».
   - Original: > Fudic deja cada fichero listo para que la use:
   - Propuesta: > Fudic deja cada fichero listo para que las aproveche:

2. **Línea 78.** Problema: «cabecera a cabecera» condensa una regla que no se entiende, y «El mismo fichero sirve» se lee como «sirve un fichero», no como «vale».
   - Original: > Gana la ruta más concreta, cabecera a cabecera. El mismo fichero sirve en `fudic dev`, en la preview y en el servidor de Fudic.
   - Propuesta: > Si varias rutas casan con un fichero, cada cabecera sale de la ruta más concreta que la define. El mismo `assets.headers` vale en `fudic dev`, en la preview y en el servidor de Fudic.

3. **Línea 91.** Problema: el inciso «sin Service Worker», entre comas tras «y», corta la frase.
   - Original: > <strong>Cada página pide solo sus piezas</strong>, y, sin Service Worker, las anuncia con `modulepreload` para que se descarguen en paralelo.
   - Propuesta: > <strong>Cada página pide solo sus piezas</strong>. Si no hay Service Worker, las anuncia con `modulepreload` para que se descarguen en paralelo.

4. **Línea 98.** Problema: la relativa encadena «que guarda… la primera vez que… nunca antes».
   - Original: > El runtime tiene una caché aparte para todo el origen, que guarda cada pieza la primera vez que una página la pide, nunca antes.
   - Propuesta: > El runtime tiene una caché aparte, compartida por todo el origen. Guarda cada pieza la primera vez que una página la pide, nunca antes.

5. **Línea 104.** Problema: «siguen a» es ambiguo (van detrás de / obedecen a); además usa «hooks» donde otras páginas dicen «ganchos» (ver Patrones).
   - Original: > Los hooks de una ruta siguen a `pagehide` y `pageshow`:
   - Propuesta: > Los ganchos del ciclo de vida de una ruta responden a `pagehide` y `pageshow`:

6. **Línea 106.** Problema: el orden está calcado del inglés y el complemento de lugar se interpone entre «tiene» y «una prueba».
   - Original: > Para comprobarlo, Chrome tiene en la pestaña Application de sus herramientas una prueba, <em>Back/forward cache</em>, que dice si la página entra y, si no, por qué.
   - Propuesta: > Para comprobarlo, en la pestaña Application de sus herramientas Chrome tiene una prueba, <em>Back/forward cache</em>, que dice si la página entra y, si no, por qué.

### `/docs/configuration` — `web/apps/site/src/routes/docs/configuration.fud`

1. **Línea 59.** Problema: el párrafo no tiene verbo.
   - Original: > Los de esta web, el de la app y el de su librería de componentes:
   - Propuesta: > Estos son los de esta web, el de la app y el de su librería de componentes:

2. **Línea 143.** Problema: «Media identidad sería peor que ninguna» es una justificación que suena a lema y no se entiende sin pensarla.
   - Original: > Media identidad sería peor que ninguna.
   - Propuesta: > Un fichero aplicado a medias sería peor que ninguno.

### `/docs/configuration/fields` — `web/apps/site/src/routes/docs/configuration/fields.fud`

1. **Línea 38.** Problema: la página abre con dos frases sin verbo.
   - Original: > Los campos de `fudic.json` que deciden qué CSS reciben los componentes, en qué idiomas sale la app y cómo se sirve. Cada uno con su valor por defecto y un enlace a la página que lo explica a fondo.
   - Propuesta: > Estos campos de `fudic.json` deciden qué CSS reciben los componentes, en qué idiomas sale la app y cómo se sirve. Cada uno trae su valor por defecto y un enlace a la página que lo explica a fondo.

2. **Línea 54.** Problema: «la app que la usa» puede referirse a la hoja o a la librería, y la segunda mitad es una elipsis con un inciso («, opcional,»).
   - Original: > `sheet` es la hoja de entrada, que reciben todas las páginas de la app que la usa, y `icon`, opcional, el favicon de esas páginas
   - Propuesta: > `sheet` es la hoja de entrada, que reciben todas las páginas de la app que usa esa librería. `icon` es el favicon de esas páginas, y es opcional

3. **Línea 65.** Problema: «es como la nombra el HTML» es una construcción forzada.
   - Original: > El nombre de una hoja es como la nombra el HTML: letras, números y `_`, sin guion.
   - Propuesta: > El nombre de una hoja es el que usa el HTML para referirse a ella: letras, números y `_`, sin guion.

4. **Línea 97.** Problema: no dice qué hace el campo; describe la situación y deja implícito que `true` activa la lectura.
   - Original: > detrás de un proxy, la URL pública de cada petición sale de las cabeceras `Forwarded` y `X-Forwarded-*`. Por defecto no se leen.
   - Propuesta: > con `true`, la URL pública de cada petición sale de las cabeceras `Forwarded` y `X-Forwarded-*` que añade el proxy. Por defecto no se leen.

5. **Línea 113.** Problema: la justificación es una frase larga con un condicional encadenado; «tipeo» es regional.
   - Original: > un error de tipeo que dejara el valor por defecto sin avisar se descubriría en producción.
   - Propuesta: > así una errata no deja el valor por defecto en silencio, algo que solo se descubriría en producción.

### `/docs/configuration/baseline` — `web/apps/site/src/routes/docs/configuration/baseline.fud`

1. **Línea 97.** Problema: «su nivel» es ambiguo (¿de la app o de la librería?) y las tres salidas se encadenan con «o… o».
   - Original: > Se resuelve en la app, permitiendo esas funciones o subiendo su nivel, o pidiendo a la librería que las proteja.
   - Propuesta: > Hay tres salidas: permitir esas funciones en la app, subir el nivel de la app o pedir a la librería que las proteja.

2. **Línea 101.** Problema: «prometerlo» no tiene antecedente claro, y la frase acumula causa, consecuencia, aviso y justificación.
   - Original: > Por eso una app de Fudic necesita navegadores de 2024 en adelante, y un nivel anterior avisa (…): ninguna página de Fudic puede prometerlo.
   - Propuesta: > Por eso una app de Fudic necesita navegadores de 2024 en adelante. Un nivel anterior avisa (…), porque ninguna página de Fudic funciona en esos navegadores.

3. **Línea 106.** Problema: «permite lo que es ahora» es oscuro.
   - Original: > Si la función se renombró o se dividió, avisa igual, pero permite lo que es ahora.
   - Propuesta: > Si la función se renombró o se dividió, también avisa, pero permite la función o funciones que la sustituyen.

4. **Línea 108.** Problema: «al de los datos» es una elipsis difícil de reponer.
   - Original: > Un año va de 2015 al de los datos.
   - Propuesta: > Un año puede ir de 2015 al año de los datos que trae Fudic.

### `/docs/configuration/diagnostics` — `web/apps/site/src/routes/docs/configuration/diagnostics.fud`

1. **Línea 71.** Problema: la finalidad final («para que nadie busque…») da un rodeo y obliga a releer.
   - Original: > Un aviso con otro nivel lo dice en su mensaje («warning by default; error in this project»), para que nadie busque en la explicación del código un nivel que su proyecto no usa.
   - Propuesta: > Un aviso con otro nivel lo dice en su mensaje («warning by default; error in this project»). Así se sabe que el nivel de la explicación del código no es el que usa el proyecto.

2. **Línea 104.** Problema: dos reglas distintas en una frase, con el segundo «también avisa» separado de su sujeto por un inciso.
   - Original: > Un comentario sin código o sin motivo no silencia nada (…), y uno que ya no silencia nada, porque el aviso desapareció, también avisa (…).
   - Propuesta: > Un comentario sin código o sin motivo no silencia nada (…). Un comentario que ya no silencia nada porque el aviso desapareció también avisa (…).

3. **Línea 38 y 95.** Problema: «aviso» nombra a la vez cualquier diagnóstico y el nivel `warning` («cómo se le avisa de cada código» frente a «ni `fudic.json` lo convierte en aviso»).
   - Original: > ni `fudic.json` lo convierte en aviso ni un comentario lo silencia.
   - Propuesta: > ni `fudic.json` lo rebaja a `warning` ni un comentario lo silencia.

### `/docs/configuration/sw-json` — `web/apps/site/src/routes/docs/configuration/sw-json.fud`

1. **Línea 41.** Problema: el inciso del lugar corta la frase de apertura, y «Tenerlo es lo que lo activa» junta dos «lo».
   - Original: > `sw.json`, en la raíz de la app junto a `fudic.json`, configura su Service Worker. Tenerlo es lo que lo activa: sin `sw.json`, la app no tiene Service Worker y todo lo sirve el servidor.
   - Propuesta: > `sw.json` configura el Service Worker de la app y va en su raíz, junto a `fudic.json`. Basta con tenerlo para activar el Service Worker: sin `sw.json`, la app no lo tiene y todo lo sirve el servidor.

2. **Línea 72.** Problema: «lo tuyo que tiene que estar» es coloquial y vago.
   - Original: > Aquí va lo tuyo que tiene que estar disponible desde el primer momento, como una imagen que se ve sin conexión.
   - Propuesta: > Aquí van tus propios ficheros que tienen que estar disponibles desde el primer momento, como una imagen que se ve sin conexión.

3. **Línea 88.** Problema: la elipsis final no tiene verbo.
   - Original: > `null` o sin escribir, para siempre.
   - Propuesta: > Con `null`, o si no se escribe, vale para siempre.

4. **Línea 121.** Problema: «y solo él» puede referirse al Service Worker o a la CSP.
   - Original: > Su CSP necesita `'unsafe-eval'`, y solo él
   - Propuesta: > Su CSP necesita `'unsafe-eval'`, y es la única que lo permite

5. **Línea 127.** Problema: la primera frase acumula cuatro condiciones antes del verbo y la segunda añade dos consecuencias.
   - Original: > Un `sw.json` que no es JSON, sin `shell`, o con un recurso sin `pattern` o con una `policy` que no existe es un error (…). Si el fichero no se lee, la app sale sin Service Worker; si falla un recurso, se descarta ese.
   - Propuesta: > Es un error (…) que `sw.json` no sea JSON, que le falte `shell` o que tenga un recurso sin `pattern` o con una `policy` que no existe. Si el fichero no se lee, la app sale sin Service Worker. Si falla un recurso, solo se descarta ese.

### `/docs/configuration/generated` — `web/apps/site/src/routes/docs/configuration/generated.fud`

1. **Línea 63.** Problema: «y la comprobación del build» queda colgando al final, sin verbo propio.
   - Original: > Son los que lee el editor para completar y comprobar los tipos, y la comprobación del build.
   - Propuesta: > Los lee el editor para completar y comprobar los tipos, y también la comprobación de tipos del build.

2. **Línea 64.** Problema: la segunda frase encadena una aposición, un enlace y una coordinada con «y al lado están».
   - Original: > `server.mjs` es la app entera, la que se monta con `createServer` (…), y al lado están las rutas con su `load` y las funciones de servidor.
   - Propuesta: > `server.mjs` es la app entera, la que se monta con `createServer` (…). Al lado están las rutas con su `load` y las funciones de servidor.

3. **Línea 65.** Problema: la relativa «lo que… vio que… necesitan de la CSP» se enreda.
   - Original: > lo que el último build o `fudic dev` vio que las páginas necesitan de la CSP.
   - Propuesta: > lo que las páginas necesitan de la CSP, según el último build o `fudic dev`.

4. **Línea 77.** Problema: la segunda frase no tiene verbo hasta después del punto y coma.
   - Original: > Cada ruta con su modo, sus cabeceras y sus early hints; lo leen el servidor y el Service Worker.
   - Propuesta: > Lista cada ruta con su modo, sus cabeceras y sus early hints. Lo leen el servidor y el Service Worker.

5. **Línea 100.** Problema: «responde» como sinónimo de «analiza el código» es jerga sin explicar.
   - Original: > Hace falta porque en un `.ts` responde el TypeScript de VS Code, que no sabe qué es un `.fud`. Cuando responde Fudic, en el build o en `fudic test`,
   - Propuesta: > Hace falta porque un `.ts` lo analiza el TypeScript de VS Code, que no sabe qué es un `.fud`. Cuando lo analiza Fudic, en el build o en `fudic test`,

6. **Línea 112.** Problema: «son a medias» es una elipsis: falta «generados».
   - Original: > Los `src/locales/<idioma>.json` son a medias:
   - Propuesta: > Los `src/locales/<idioma>.json` son generados a medias:

Sin cambios: ninguna (las 16 páginas del alcance tienen al menos un hallazgo).
