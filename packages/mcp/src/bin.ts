#!/usr/bin/env node
import { main, nodeDeps } from './main.js';

const code = await main(process.argv.slice(2), nodeDeps());
if (code !== 0) process.exitCode = code;
