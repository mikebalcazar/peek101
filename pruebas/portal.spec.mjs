/* El portal, manejado con un navegador de verdad.
 *
 * Entra como el cliente «Familia Ramírez» de la org `demo` de STAGING (D6),
 * usando el `codigo_prueba` que la API devuelve fuera de producción, y
 * comprueba que lo pintado coincide con el JSON —no que «se vea bien»—:
 * cuenta productos, suma pagos y compara contra `totales`.
 *
 * Corre a 390 × 844 (un celular, que es de donde el cliente lo abre) y a
 * 1440. Contra el banco de pruebas por omisión, o contra lo publicado si se
 * le pasa BASE:
 *
 *   node pruebas/portal.spec.mjs
 *   BASE=https://peek101-staging.mike-929.workers.dev node pruebas/portal.spec.mjs
 *
 * Nunca contra `forespot`: ahí hay dinero real de clientes reales. Si la org
 * no es `demo`, se para.
 */

import { chromium } from 'playwright';
import { ETAPAS as ETAPAS_SUPERVISOR } from '../public/textos.js';

const BASE = (process.env.BASE || 'http://127.0.0.1:8789').replace(/\/$/, '');
const CORREO = process.env.CORREO_DEMO || 'familia.ramirez@ejemplo.mx';
const EJECUTABLE = process.env.CHROMIUM || undefined;

let fallas = 0, revisadas = 0;
const rev = (ok, texto, extra = '') => {
  revisadas++; if (!ok) fallas++;
  console.log(`  ${ok ? 'ok   ' : 'FALLA'} ${texto}${extra ? '  →  ' + extra : ''}`);
};

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

/** Pide un código, esperando si la API dice que todavía no toca.
 *
 *  La API sólo deja reenviar cada 45 s (`ESPERA_REENVIO` en auth.ts) y
 *  contesta `429 demasiados_intentos` con `espera_segundos`. Esta prueba pide
 *  código tres veces —una por fuera para leer los datos y una por cada
 *  tamaño de pantalla—, así que esperar es parte del trabajo, no un parche:
 *  el cliente de verdad también espera. */
async function codigoNuevo(intentos = 4) {
  for (let i = 0; i < intentos; i++) {
    const r = await fetch(`${BASE}/s101/auth/codigo`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ correo: CORREO }),
    });
    const c = await r.json();
    if (c?.data?.codigo_prueba) return c.data.codigo_prueba;
    if (c?.error === 'demasiados_intentos') {
      const s = (c.detalle?.espera_segundos ?? 45) + 2;
      console.log(`  (la API pide esperar ${s} s para otro código)`);
      await dormir(s * 1000);
      continue;
    }
    throw new Error(`la API no devolvió codigo_prueba (${r.status} ${c?.error ?? ''}): esto no es staging`);
  }
  throw new Error('no se pudo obtener un código después de esperar');
}

/** Lo que la API le contesta a este cliente, pedido por fuera del navegador:
 *  es contra esto que se compara lo pintado. */
async function desdeLaApi() {
  const codigo = await codigoNuevo();
  const entra = await fetch(`${BASE}/s101/auth/entrar`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ correo: CORREO, codigo }),
  });
  const galleta = (entra.headers.get('set-cookie') || '').split(';')[0];
  if (!galleta) throw new Error(`no vino la galleta de sesión (${entra.status})`);

  const yo = await (await fetch(`${BASE}/s101/yo`, { headers: { Cookie: galleta } })).json();
  const org = yo?.data?.acceso?.org_id;
  if (org !== 'demo') throw new Error(`la org es «${org}», no «demo»: esto no se prueba contra datos reales`);

  const peek = await (await fetch(`${BASE}/s101/orgs/demo/peek`, { headers: { Cookie: galleta } })).json();
  if (!peek?.ok) throw new Error(`/peek contestó ${JSON.stringify(peek).slice(0, 200)}`);
  return peek.data;
}

async function correr(navegador, ancho, alto, etiqueta, datos) {
  console.log(`\n== ${etiqueta} (${ancho} × ${alto}) ==  ${BASE}`);
  const ctx = await navegador.newContext({ viewport: { width: ancho, height: alto }, locale: 'es-MX' });
  const pagina = await ctx.newPage();
  const errores = [];
  pagina.on('pageerror', (e) => errores.push(String(e)));
  pagina.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errores.push(m.text()); });

  await pagina.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
  await pagina.waitForSelector('#v-correo:not([hidden])', { timeout: 15000 });
  rev(true, 'la entrada abre pidiendo el correo');

  // Entrar como lo haría el cliente: correo, y el código que le llega. El
  // código se lee de la respuesta que pidió LA PROPIA INTERFAZ, no de una
  // petición aparte: pedir otro invalidaría éste, que es justo lo que pasó la
  // primera vez que corrió esta prueba.
  await pagina.fill('#correo', CORREO);
  let codigo = null;
  for (let i = 0; i < 4 && !codigo; i++) {
    const espera = pagina.waitForResponse((r) => r.url().endsWith('/s101/auth/codigo'), { timeout: 20000 });
    await pagina.click('#b-correo');
    const cuerpo = await (await espera).json().catch(() => null);
    codigo = cuerpo?.data?.codigo_prueba ?? null;
    if (!codigo) {
      const s = (cuerpo?.detalle?.espera_segundos ?? 45) + 2;
      console.log(`  (la API pide esperar ${s} s para otro código)`);
      await dormir(s * 1000);
    }
  }
  if (!codigo) throw new Error('la interfaz no consiguió un código de prueba');
  await pagina.waitForSelector('#v-clave:not([hidden])', { timeout: 15000 });

  // Un código equivocado tiene que decirlo con palabras, y decir cuántos
  // intentos quedan. Es la prueba de control: si el error se tragara, esto
  // pasaría a estar vacío.
  await pagina.fill('#clave', '000000');
  await pagina.click('#b-clave');
  await pagina.waitForFunction(() => document.getElementById('err-clave').textContent.trim().length > 0, null, { timeout: 15000 });
  const aviso = (await pagina.textContent('#err-clave')).trim();
  rev(/no es/i.test(aviso), 'un código equivocado se dice con palabras del cliente', aviso);
  rev(!/\b(4\d\d|5\d\d|codigo_invalido)\b/.test(aviso), 'y sin códigos de programador en pantalla');

  await pagina.fill('#clave', codigo);
  await pagina.click('#b-clave');
  await pagina.waitForSelector('#v-general:not([hidden])', { timeout: 20000 });
  rev(true, 'con el código bueno entra al resumen');

  // Las cifras de la pantalla contra las de la API.
  const mx = (c) => '$' + ((c ?? 0) / 100).toLocaleString('es-MX', { maximumFractionDigits: 0 });
  rev((await pagina.textContent('#g-cliente')).trim() === datos.cliente.nombre, 'el nombre es el del cliente', datos.cliente.nombre);
  rev((await pagina.textContent('#g-total')).trim() === mx(datos.totales.vendido), 'el vendido cuadra con totales', mx(datos.totales.vendido));
  rev((await pagina.textContent('#g-pagado')).trim() === mx(datos.totales.cobrado), 'el pagado cuadra con totales', mx(datos.totales.cobrado));
  rev((await pagina.textContent('#g-saldo')).trim() === mx(datos.totales.saldo), 'el saldo cuadra con totales', mx(datos.totales.saldo));

  const tarjetas = await pagina.locator('#g-proys .proy').count();
  rev(tarjetas === datos.proyectos.length, 'hay una tarjeta por proyecto', `${tarjetas} de ${datos.proyectos.length}`);

  // El detalle del primer proyecto: productos y pagos, contados.
  await pagina.locator('#g-proys .proy').first().click();
  await pagina.waitForSelector('#v-detalle:not([hidden])', { timeout: 15000 });
  const p = datos.proyectos[0];
  const filas = await pagina.locator('#d-items tr').count();
  rev(filas === (p.items?.length ?? 0), 'una fila por producto', `${filas} de ${p.items?.length ?? 0}`);

  const pagosDelProyecto = (datos.pagos ?? []).filter((x) => x.proyecto_id === p.id);
  // Las filas de pagos traen una más: el renglón del total.
  const filasPago = await pagina.locator('#d-pagos tr').count();
  rev(filasPago === Math.max(1, pagosDelProyecto.length) + 1, 'una fila por pago, más el total', `${filasPago}`);
  const sumaPintada = (await pagina.textContent('#d-pagos tr:last-child td:last-child')).trim();
  rev(sumaPintada === mx(pagosDelProyecto.reduce((s, x) => s + x.monto, 0)), 'el total pagado es la suma de los pagos pintados', sumaPintada);

  // La etapa: el nombre que se enseña es el de SUPERVISOR, no uno inventado.
  const etapas = await pagina.locator('#d-items .etapa span:last-child').allTextContents();
  // Las siete de SUPERVISOR, más los dos extremos, que describen un hecho y
  // no una etapa. Cualquier otra cosa en esa columna es un nombre inventado,
  // y esta prueba existe para que no aparezca: la primera vez que corrió,
  // cazó un «Cerrado» que no es el nombre de ninguna etapa (la 7 es «Cierre»).
  const validas = [...ETAPAS_SUPERVISOR, 'Por iniciar', 'Sin dato del taller'];
  const raras = etapas.map((e) => e.trim()).filter((e) => !validas.includes(e));
  rev(raras.length === 0, 'cada etapa se nombra con las siete de SUPERVISOR', raras.length ? 'sobran: ' + raras.join(', ') : etapas.join(' · '));
  rev(etapas.length === (p.items?.length ?? 0), 'y hay una etapa por producto', `${etapas.length}`);

  // Lo que el cliente NUNCA debe ver. Es la prueba de control del filtrado:
  // si la API algún día mandara costos, esto se pone rojo.
  const html = await pagina.content();
  for (const prohibido of ['partida', 'pagado_prov', 'compromiso', 'proveedor', 'costo']) {
    rev(!new RegExp(prohibido, 'i').test(html), `la pantalla no menciona «${prohibido}»`);
  }
  const crudo = JSON.stringify(datos);
  for (const campo of ['partidas', 'pagado_prov', 'compromiso']) {
    rev(!crudo.includes(campo), `/peek no trae «${campo}»`);
  }

  // Sin scroll horizontal: en un celular es lo primero que se nota.
  const sobra = await pagina.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  rev(sobra <= 1, 'no hay scroll horizontal', `sobran ${sobra} px`);

  rev(errores.length === 0, 'cero errores de JavaScript', errores.slice(0, 2).join(' | '));

  await ctx.close();
}

const datos = await desdeLaApi();
console.log(`datos de la API: ${datos.proyectos.length} proyecto(s), ${datos.proyectos.reduce((s, p) => s + (p.items?.length ?? 0), 0)} producto(s), ${datos.pagos.length} pago(s)`);

/* ─────────────── entrar con Google ───────────────
 * Por Google de verdad no se puede pasar en una prueba. Se mide lo que sí es
 * de esta pantalla: el botón está; si la API contesta 501 (interceptado
 * aquí, porque contra staging el 501 se vuelve 302 el día que Mike ponga las
 * llaves) se dice con palabras y sin códigos; y un boleto inventado en la
 * dirección no entra, se dice, y se quita de la barra. */
async function google(navegador) {
  console.log(`\n== entrar con Google (390 × 844) ==  ${BASE}`);
  const ctx = await navegador.newContext({ viewport: { width: 390, height: 844 }, locale: 'es-MX' });
  const pagina = await ctx.newPage();
  const errores = [];
  pagina.on('pageerror', (e) => errores.push(String(e)));
  pagina.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errores.push(m.text()); });
  await pagina.route('**/s101/auth/google**', (r) => r.fulfill({ status: 501, contentType: 'application/json', body: JSON.stringify({ ok: false, error: 'google_no_configurado' }) }));

  await pagina.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
  await pagina.waitForSelector('#v-correo:not([hidden])', { timeout: 15000 });
  rev(await pagina.isVisible('#b-google'), 'el botón «Entrar con Google» está en la pantalla del correo');
  await pagina.click('#b-google');
  await pagina.waitForFunction(() => document.getElementById('err-correo').textContent.trim() !== '', null, { timeout: 10000 });
  const aviso = (await pagina.locator('#err-correo').innerText()).trim();
  rev(/todavía no está prendido/.test(aviso), 'sin llaves de Google la pantalla lo dice con palabras', aviso);
  rev(!/501|google_no_configurado/.test(aviso), 'y sin códigos de programador');
  rev(await pagina.isVisible('#v-correo'), 'y se queda en la pantalla del correo');

  await pagina.goto(`${BASE}/?entrada=boleto-inventado`, { waitUntil: 'domcontentloaded' });
  await pagina.waitForSelector('#v-correo:not([hidden])', { timeout: 15000 });
  await pagina.waitForFunction(() => document.getElementById('err-correo').textContent.trim() !== '', null, { timeout: 10000 });
  const malo = (await pagina.locator('#err-correo').innerText()).trim();
  rev(/ya no sirve/.test(malo), 'un boleto inventado no entra y se dice con palabras', malo);
  rev(!new URL(pagina.url()).searchParams.has('entrada'), 'y se quita de la barra de direcciones');
  const sobra = await pagina.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  rev(sobra <= 1, 'no hay scroll horizontal con el botón de Google', `sobran ${sobra} px`);
  rev(errores.length === 0, 'cero errores de JavaScript', errores.slice(0, 2).join(' | '));
  await ctx.close();
}

const navegador = await chromium.launch(EJECUTABLE ? { executablePath: EJECUTABLE } : {});
try {
  await correr(navegador, 390, 844, 'celular', datos);
  await correr(navegador, 1440, 900, 'computadora', datos);
  await google(navegador);
} finally {
  await navegador.close();
}

console.log(`\n${revisadas} revisadas · ${fallas} fallas`);
process.exit(fallas === 0 ? 0 : 1);
