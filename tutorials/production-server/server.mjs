import { createServer as listen } from 'node:http';
import { fileURLToPath } from 'node:url';
import { createServer } from '@fudic/server';
import { nodeMiddleware, staticFiles, staticPages } from '@fudic/server/node';
import { config, createApp } from './.fudic/edge/server.mjs';

const dist = fileURLToPath(new URL('./dist', import.meta.url));
const app = createServer(createApp({ prerendered: staticPages(dist) }), config);

const pages = nodeMiddleware(app);
const files = staticFiles(dist);
const notFound = nodeMiddleware(app, { notFound: true });

const server = listen((req, res) => {
  pages(req, res, () => files(req, res, () => notFound(req, res, () => res.writeHead(404).end())));
});

server.listen(Number(process.env.PORT ?? 3000), () => console.log(`listening on ${server.address().port}`));
