// The built example on plain node:http (SDD-81 criterion 41): `vite build`, then `node node-server.mjs`.
import { createServer as listen } from 'node:http';
import { fileURLToPath } from 'node:url';
import { createServer } from '@fudic/server';
import { diskSpool, nodeMiddleware, staticFiles, staticPages } from '@fudic/server/node';
import { config, createApp } from './.fudic/edge/server.mjs';

const dist = fileURLToPath(new URL('./dist', import.meta.url));
const options = { ...config, spool: diskSpool, secureCookies: process.env.FUDIC_SECURE_COOKIES !== 'false', secret: process.env.FUDIC_SECRET };
const serve = nodeMiddleware(createServer(createApp({ prerendered: staticPages(dist) }), options), { notFound: true });
const files = staticFiles(dist);
const server = listen((req, res) => serve(req, res, (error) => (error ? res.writeHead(500).end() : files(req, res, () => res.writeHead(404).end()))));
server.listen(Number(process.env.PORT ?? 3000), () => console.log(`listening on ${server.address().port}`));
