// La dirección de workers.dev y la de antes (DOMINIO_ANTERIOR, taller101.com)
// mandan al dominio propio; el dominio y staging sirven.
import assert from 'node:assert/strict';
import worker from '../worker/index.js';

const ASSETS = { fetch: async () => new Response('sitio') };
const API = { fetch: async () => new Response('api') };
const prod = { DOMINIO_PROPIO: 'peek.suite101.app', DOMINIO_ANTERIOR: 'peek101.taller101.com', ASSETS, API };
const staging = { ASSETS, API };
const pide = (url, env, init) => worker.fetch(new Request(url, init), env);

let n = 0; const ok = (c, m) => { n++; assert.ok(c, m); console.log('  ok   ', m); };

let r = await pide('https://peek101.mike-929.workers.dev/?x=1#y', prod);
ok(r.status === 301, 'una lectura en workers.dev manda al dominio con 301');
ok(r.headers.get('location') === 'https://peek.suite101.app/?x=1', 'y conserva ruta y consulta');
r = await pide('https://peek101.mike-929.workers.dev/estilo.css', prod);
ok(r.status === 301, 'los archivos también');
r = await pide('https://peek.suite101.app/', prod);
ok(r.status === 200 && await r.text() === 'sitio', 'en el dominio se sirve el sitio');
r = await pide('https://peek101.mike-929.workers.dev/s101/yo', prod);
ok(r.status === 200 && await r.text() === 'api', 'la puerta a la suite no se redirige');
r = await pide('https://peek101.mike-929.workers.dev/s101/auth/salir', prod, { method: 'POST' });
ok(r.status === 200, 'ni lo que no es lectura');
r = await pide('https://peek101-staging.mike-929.workers.dev/', staging);
ok(r.status === 200 && await r.text() === 'sitio', 'staging, sin DOMINIO_PROPIO, sirve tal cual');
// Sin la «s» (Mike, 30-sep-2026): http en el dominio propio manda a https.
r = await pide('http://peek.suite101.app/?x=1', prod);
ok(r.status === 301 && r.headers.get('location') === 'https://peek.suite101.app/?x=1', 'http en el dominio propio manda a https con 301, con ruta y consulta');
r = await pide('http://peek.suite101.app/', prod, { method: 'POST' });
ok(r.status !== 301, 'pero un POST por http no se convierte en GET');
r = await pide('http://peek101-staging.mike-929.workers.dev/', staging);
ok(r.status !== 301, 'y sin DOMINIO_PROPIO no se toca');
// 11-oct-2026 · la suite se mudó a suite101.app: la dirección de taller101.com
// sigue viva y manda al dominio nuevo, con las mismas reglas que workers.dev.
const VIEJA = 'https://peek101.taller101.com';
r = await pide(`${VIEJA}/obra.html?id=abc&x=1`, prod);
ok(r.status === 301 && r.headers.get('location') === 'https://peek.suite101.app/obra.html?id=abc&x=1', 'la dirección vieja manda a la nueva con 301, con ruta y consulta');
r = await pide(`${VIEJA}/`, prod, { method: 'HEAD' });
ok(r.status === 301, 'un HEAD también');
r = await pide(`${VIEJA}/s101/yo`, prod);
ok(r.status === 200 && await r.text() === 'api', 'la puerta a la suite desde la dirección vieja no se redirige');
r = await pide(`${VIEJA}/s101`, prod);
ok(r.status !== 301, 'ni /s101 pelón');
r = await pide(`${VIEJA}/s101/auth/salir`, prod, { method: 'POST' });
ok(r.status === 200, 'ni lo que no es lectura');
r = await pide('http://peek101.taller101.com/?x=1', prod);
ok(r.status === 301 && r.headers.get('location') === 'https://peek.suite101.app/?x=1', 'la vieja por http va directo a la nueva por https');
r = await pide('https://peek.acme.com/?x=1', prod);
ok(r.status === 200 && await r.text() === 'sitio', 'un dominio de empresa (peek.acme.com) no se redirige');
r = await pide('https://peek101.acme.com/', prod);
ok(r.status === 200, 'ni peek101.acme.com');
r = await pide('https://peek101.taller101.com.acme.com/', prod);
ok(r.status === 200, 'ni un host que sólo empieza como la dirección vieja');
const dos = { ...prod, DOMINIO_ANTERIOR: ' peek101.taller101.com , cuenta.taller101.com ' };
r = await pide('https://cuenta.taller101.com/x?y=2', dos);
ok(r.status === 301 && r.headers.get('location') === 'https://peek.suite101.app/x?y=2', 'DOMINIO_ANTERIOR acepta varias, separadas por comas');
r = await pide('https://peek101.taller101.com/', staging);
ok(r.status === 200, 'sin DOMINIO_PROPIO, la dirección vieja tampoco se toca');
console.log(`${n} revisadas · 0 fallas`);
