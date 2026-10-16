/* El desglose (subtotal, IVA, total, saldo) es el de la obra que está en
 * pantalla, aunque las respuestas lleguen en otro orden.
 *
 * Lo encontró la medición de velocidad del 16-oct-2026: el cliente abre la
 * obra A, se regresa y abre la B; si el desglose de A llega DESPUÉS de que B
 * se pintó, A pintaba su total y su saldo encima de B. Es dinero que ve quien
 * paga.
 *
 * Corre la función de verdad (se toma de public/app.js) con una pantalla y
 * una API de mentiras en las que se decide el orden de llegada.
 *
 *   node pruebas/el-desglose-de-su-obra.mjs
 */
import { readFileSync } from 'node:fs';

let fallas = 0, revisadas = 0;
const rev = (ok, texto, extra = '') => {
  revisadas++; if (!ok) fallas++;
  console.log(`  ${ok ? 'ok   ' : 'FALLA'} ${texto}${extra ? '  →  ' + extra : ''}`);
};

const fuente = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
const ini = fuente.indexOf('async function ponerDesglose');
// Con el turno (desde el 16-oct) la función empieza en su variable.
const desde = fuente.includes('let desgloseVigente') ? fuente.indexOf('let desgloseVigente') : ini;
const fin = fuente.indexOf('\n}\n', ini) + 2;
const codigo = fuente.slice(desde, fin);

const pantalla = {};
const $ = (id) => (pantalla[id] ||= { textContent: '', hidden: false });
const esperando = new Map();
const pedir = (ruta) => new Promise((ok) => esperando.set(/proyectos\/([^/]+)\/estado/.exec(ruta)[1], ok));
const pesos2 = (c) => `$${(c / 100).toFixed(2)}`;
const fechaLarga = () => 'hoy';
const ponerDesglose = new Function('$', 'pedir', 'pesos2', 'fechaLarga', 'ORG', `${codigo}\nreturn ponerDesglose;`)($, pedir, pesos2, fechaLarga, 'demo');

const estado = (total, saldo) => ({ totales: { subtotal: total - 100, iva: 100, tasa_iva: 1600, total, saldo }, generado_at: '2026-10-16T00:00:00Z' });

// A se abre, luego B. B contesta primero; A llega tarde.
const a = ponerDesglose('A');
const b = ponerDesglose('B');
esperando.get('B')(estado(200000, 50000));
await b;
esperando.get('A')(estado(999900, 999900));
await a;
rev($('d-total').textContent === '$2000.00', 'el total es el de la obra abierta (B), no el de la que llegó tarde', $('d-total').textContent);
rev($('d-saldo').textContent === '$500.00', 'el saldo también', $('d-saldo').textContent);
rev($('d-desglose').hidden === false, 'el desglose de B se ve');

// Y en el orden normal, la abierta se pinta.
const c = ponerDesglose('C');
esperando.get('C')(estado(300000, 0));
await c;
rev($('d-total').textContent === '$3000.00', 'una sola obra se pinta como siempre', $('d-total').textContent);

console.log(`\n${revisadas - fallas} de ${revisadas} bien`);
process.exit(fallas ? 1 : 0);
