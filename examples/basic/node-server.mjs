// The built example on plain node:http (SDD-81 criterion 41): `vite build`, then `node node-server.mjs`.
import { createServer as listen } from 'node:http';
import { createServer } from '@fudic/server';
import { nodeMiddleware, staticPages } from '@fudic/server/node';
import { config, createApp } from './.fudic/edge/server.mjs';

const app = createApp({ prerendered: staticPages(new URL('./dist', import.meta.url).pathname.replace(/^\/(\w:)/u, '$1')) });
const secureCookies = process.env.FUDIC_SECURE_COOKIES !== 'false';
const serve = nodeMiddleware(createServer(app, { ...config, secureCookies, secret: process.env.FUDIC_SECRET }), { notFound: true });
const server = listen((req, res) => serve(req, res, (error) => res.writeHead(error ? 500 : 404).end()));
server.listen(Number(process.env.PORT ?? 3000), () => console.log(`listening on ${server.address().port}`));
