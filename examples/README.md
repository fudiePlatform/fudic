# examples

Aplicaciones ejecutables que demuestran fudic de punta a punta. Cada ejemplo es un
paquete privado del workspace que consume los `@fudic/*` publicados (su `dist`), igual
que haría un proyecto de usuario tras `npm install` — no importa código fuente de los
paquetes ni usa alias.

| Ejemplo | Qué demuestra |
|---|---|
| [`basic`](./basic) | Routing por FS, SSG estático + incremental, componentes con CSS con scope, assets, shell de tres hilos. Cero JS de framework en la página. |

Son también el banco de pruebas del **scaffolding**: el que sirva de plantilla
(`create-fudic`) saldrá de aquí, así que se mantienen mínimos, idiomáticos y sin trucos
que un proyecto real no pudiera reproducir.

`pnpm build` en la raíz los construye después de los paquetes (orden topológico de pnpm),
de modo que un ejemplo roto rompe el build: son verificación, no decoración.
