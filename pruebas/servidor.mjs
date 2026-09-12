/* El Worker, pero en esta máquina, para poder probar con un navegador.
 *
 * `wrangler dev` no sirve aquí: el *service binding* a `suite101-api` sólo
 * existe dentro de Cloudflare, y en local wrangler lo marca
 * «[not connected]». Así que este guion hace lo MISMO que `worker/index.js`
 * —servir `public/` y reenviar `/s101/*` a la API poniendo `X-App: peek101`—
 * pero por HTTP contra la API de STAGING.
 *
 * No es el Worker y no pretende serlo: es el banco de pruebas de la interfaz.
 * Que el Worker de verdad reparta igual lo mide `scripts/medir.mjs` desde el
 * corredor, contra lo ya publicado. Las dos mediciones hacen falta.
 *
 *   node pruebas/servidor.mjs [puerto]
 */

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const PUBLICO = fileURLToPath(new URL('../public/', import.meta.url));
const API = process.env.API_ORIGEN || 'https://suite101-api-staging.mike-929.workers.dev';
const PUERTO = Number(process.argv[2] || process.env.PUERTO || 8789);

const TIPOS = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.woff2': 'font/woff2', '.json': 'application/json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.txt': 'text/plain; charset=utf-8',
};

const servidor = createServer(async (pet, res) => {
  const u = new URL(pet.url, `http://127.0.0.1:${PUERTO}`);

  if (u.pathname === '/s101' || u.pathname.startsWith('/s101/')) {
    const destino = new URL(API);
    destino.pathname = u.pathname.slice('/s101'.length) || '/';
    destino.search = u.search;
    const cabeceras = { 'X-App': 'peek101' };
    if (pet.headers.cookie) cabeceras.Cookie = pet.headers.cookie;
    if (pet.headers['content-type']) cabeceras['Content-Type'] = pet.headers['content-type'];
    const trozos = [];
    for await (const t of pet) trozos.push(t);
    const r = await fetch(destino, {
      method: pet.method,
      headers: cabeceras,
      body: trozos.length ? Buffer.concat(trozos) : undefined,
      redirect: 'manual',
    });
    const cuerpo = Buffer.from(await r.arrayBuffer());
    const salida = { 'Content-Type': r.headers.get('content-type') ?? 'application/json' };
    // La galleta de la API dice `Secure`, y en http://127.0.0.1 el navegador
    // la tiraría. Se le quita SÓLO aquí, en el banco de pruebas: en el Worker
    // de verdad todo va por https y `Secure` se queda.
    const puesta = r.headers.get('set-cookie');
    if (puesta) salida['Set-Cookie'] = puesta.replace(/;\s*Secure/gi, '').replace(/SameSite=None/gi, 'SameSite=Lax');
    res.writeHead(r.status, salida);
    res.end(cuerpo);
    return;
  }

  const rel = normalize(u.pathname === '/' ? '/index.html' : u.pathname).replace(/^(\.\.[/\\])+/, '');
  try {
    const cuerpo = await readFile(join(PUBLICO, rel));
    res.writeHead(200, { 'Content-Type': TIPOS[extname(rel)] ?? 'application/octet-stream' });
    res.end(cuerpo);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('no existe');
  }
});

servidor.listen(PUERTO, '127.0.0.1', () => {
  console.log(`banco de pruebas en http://127.0.0.1:${PUERTO}  ·  /s101 → ${API}`);
});
