import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { readFileSync, existsSync } from 'node:fs';
import net from 'node:net';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(resolve(root, 'backend/package.json'));
const envPath=resolve(root,'backend/.env');
const config=existsSync(envPath)?require('dotenv').parse(readFileSync(envPath)):{};
const port=Number(process.env.PORT??config.PORT??3000);
async function check(port){await new Promise((resolve,reject)=>{const server=net.createServer();server.once('error',()=>reject(new Error(`Port ${port} is already in use. Stop the older FpiUpdates terminal with Ctrl+C, then start again.`)));server.listen(port,'127.0.0.1',()=>server.close(resolve));});}
try{await check(port);await check(5173);}catch(error){console.error(error.message);process.exit(1);}
const api = spawn(process.execPath, ['dist/main.js'], { cwd: resolve(root, 'backend'), stdio: 'inherit' });
const web = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1'], { cwd: resolve(root, 'frontend'), stdio: 'inherit',env:{...process.env,API_PROXY_TARGET:`http://127.0.0.1:${port}`} });
let stopping = false;
function stop(code = 0) { if (stopping) return; stopping = true; api.kill(); web.kill(); process.exitCode = code; }
for (const child of [api, web]) { child.on('error', error => { console.error(error.message); stop(1); }); child.on('exit', code => { if (!stopping) stop(code ?? 1); }); }
process.on('SIGINT', () => stop()); process.on('SIGTERM', () => stop());
console.log('FpiUpdates frontend: http://localhost:5173');
console.log(`API health: http://localhost:${port}/api/v1/health`);
console.log('Press Ctrl+C to stop both applications. PostgreSQL data stays in Docker.');
