/* El portal, manejado con un navegador de verdad.
 *
 * Entra como el cliente «Familia Ramírez» de la org `demo` de STAGING (D6) y
 * comprueba que lo pintado coincide con el JSON —no que «se vea bien»—:
 * cuenta productos, suma pagos y compara contra `totales`.
 *
 * DESDE EL 16-SEP-2026 entra por donde entra un cliente de verdad la primera
 * vez, que es el camino que la homologación dejó: «Olvidé mi contraseña» →
 * código al correo → poner la contraseña → adentro. Y después SALE y vuelve a
 * entrar con esa contraseña, que es lo que hará todos los días. Antes entraba
 * con el código y ya; ese camino ya no existe en la pantalla.
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
/* La contraseña que esta prueba le pone al cliente de `demo`. Lleva el número
 * de la corrida para que dos corridas a la vez no se peleen, y para que la de
 * hoy no dependa de lo que dejó la de ayer: el bloque que la pone entra por
 * «Olvidé mi contraseña», así que no necesita saber la anterior. */
const CLAVE = `peek-${process.env.GITHUB_RUN_ID || Date.now()}-mirlo`;
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
 *  es contra esto que se compara lo pintado.
 *
 *  Aquí sí se usa el código, y no es una inconsistencia: esto no pasa por la
 *  pantalla. La API sigue aceptando el código —es la recuperación— y pedirlo
 *  por fuera es la manera más corta de tener una sesión con la que leer el
 *  JSON de referencia. */
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

  // El correo ya no dispara un código: lleva a la contraseña.
  await pagina.fill('#correo', CORREO);
  await pagina.click('#b-correo');
  await pagina.waitForSelector('#v-clave:not([hidden])', { timeout: 15000 });
  rev(true, 'el correo lleva a la contraseña, no a un código');

  // Una contraseña equivocada tiene que decirlo con palabras del cliente, y
  // decirlo IGUAL que un correo sin portal: distinguirlos le diría a cualquiera
  // qué correos tienen portal aquí. Es la prueba de control: si el error se
  // tragara, esto pasaría a estar vacío.
  await pagina.fill('#clave', 'la-que-no-es-99');
  await pagina.click('#b-clave');
  await pagina.waitForFunction(() => document.getElementById('err-clave').textContent.trim().length > 0, null, { timeout: 15000 });
  const aviso = (await pagina.textContent('#err-clave')).trim();
  rev(/no coinciden/i.test(aviso), 'una contraseña equivocada se dice con palabras del cliente', aviso);
  rev(!/\b(4\d\d|5\d\d|clave_invalida|sin_permiso)\b/.test(aviso), 'y sin códigos de programador en pantalla');

  /* «Olvidé mi contraseña», que es por donde entra un cliente la primera vez.
   * El código se lee de la respuesta que pidió LA PROPIA INTERFAZ, no de una
   * petición aparte: pedir otro invalidaría éste, que es justo lo que pasó la
   * primera vez que corrió esta prueba. */
  let codigo = null;
  for (let i = 0; i < 4 && !codigo; i++) {
    const espera = pagina.waitForResponse((r) => r.url().endsWith('/s101/auth/codigo'), { timeout: 20000 });
    await pagina.click('#olvide');
    const cuerpo = await (await espera).json().catch(() => null);
    codigo = cuerpo?.data?.codigo_prueba ?? null;
    if (!codigo) {
      const s = (cuerpo?.detalle?.espera_segundos ?? 45) + 2;
      console.log(`  (la API pide esperar ${s} s para otro código)`);
      await dormir(s * 1000);
    }
  }
  if (!codigo) throw new Error('la interfaz no consiguió un código de prueba');
  await pagina.waitForSelector('#v-codigo:not([hidden])', { timeout: 15000 });
  rev(true, '«Olvidé mi contraseña» manda un código y pide teclearlo');

  await pagina.fill('#codigo', '000000');
  await pagina.click('#b-codigo');
  await pagina.waitForFunction(() => document.getElementById('err-codigo').textContent.trim().length > 0, null, { timeout: 15000 });
  const avisoCod = (await pagina.textContent('#err-codigo')).trim();
  rev(/no es/i.test(avisoCod), 'un código equivocado se dice con palabras y dice cuántos intentos quedan', avisoCod);

  await pagina.fill('#codigo', codigo);
  await pagina.click('#b-codigo');

  /* Con el código bueno hay dos destinos, y los dos son correctos:
   *  - Si el cliente NO tiene contraseña (la primera vez en su vida), la
   *    pantalla lo manda a ponerse una y no lo deja pasar: ese código es de
   *    un solo uso y de diez minutos, y dejarlo pasar sin contraseña sería
   *    dejarlo sin manera de volver mañana.
   *  - Si ya tiene, entra al resumen. La pantalla no lo obliga a cambiarla.
   * En esta prueba el segundo caso es el normal: la pantalla de celular le
   * pone contraseña al cliente de `demo` y la de computadora ya lo encuentra
   * con ella; y desde la segunda corrida, las dos. Medido el 18-sep-2026: la
   * primera versión esperaba #v-nueva siempre y se quedó colgada en la
   * segunda pantalla (run 35292567882). */
  await pagina.waitForSelector('#v-nueva:not([hidden]), #v-general:not([hidden])', { timeout: 20000 });
  if (await pagina.isVisible('#v-nueva')) {
    rev(true, 'sin contraseña todavía: con el código bueno se le pide poner una, no se le deja pasar');

    // Una débil se rechaza, y la suite dice por qué con palabras.
    await pagina.fill('#nueva', '1234567890');
    await pagina.fill('#nueva2', '1234567890');
    await pagina.click('#b-nueva');
    await pagina.waitForFunction(() => document.getElementById('err-nueva').textContent.trim().length > 0, null, { timeout: 15000 });
    const avisoDebil = (await pagina.textContent('#err-nueva')).trim();
    rev(avisoDebil.length > 0 && !/\b(4\d\d|clave_debil)\b/.test(avisoDebil),
      'una contraseña floja se rechaza con palabras, no con un código', avisoDebil);

    // Dos que no coinciden tampoco pasan, y no se dice cuál falló.
    await pagina.fill('#nueva', CLAVE);
    await pagina.fill('#nueva2', `${CLAVE}-no`);
    await pagina.click('#b-nueva');
    await pagina.waitForFunction(() => /coincidieron/i.test(document.getElementById('err-nueva').textContent), null, { timeout: 15000 });
    rev(true, 'dos que no coinciden se rechazan sin decir cuál de las dos falló');

    await pagina.fill('#nueva', CLAVE);
    await pagina.fill('#nueva2', CLAVE);
    await pagina.click('#b-nueva');
    await pagina.waitForSelector('#v-general:not([hidden])', { timeout: 20000 });
    rev(true, 'con la contraseña puesta entra al resumen');
  } else {
    rev(true, 'ya tenía contraseña: con el código bueno entra al resumen sin que le pidan otra');

    /* Para medir abajo el camino de todos los días con la contraseña de ESTA
     * corrida, se le pone por la API desde la misma pestaña (misma galleta).
     * La sesión se abrió con código, así que la API no pide la anterior
     * (`/auth/clave`: `actual` sólo cuando se entró con contraseña). */
    const puesta = await pagina.evaluate(async (clave) => {
      const r = await fetch('/s101/auth/clave', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clave }),
      });
      return { status: r.status, cuerpo: await r.json().catch(() => null) };
    }, CLAVE);
    rev(puesta.status === 200 && puesta.cuerpo?.ok === true,
      'y la contraseña de esta corrida se le pone por la API sin pedir la anterior', `${puesta.status} ${puesta.cuerpo?.error ?? ''}`);
  }

  /* Y AHORA LO QUE HARÁ TODOS LOS DÍAS: salir y volver a entrar con ella. Sin
   * esto, la prueba mediría el camino de una vez en la vida y no el de siempre.
   * Es la mitad que faltaba. */
  await pagina.click('#salir');
  await pagina.waitForSelector('#v-correo:not([hidden])', { timeout: 15000 });
  await pagina.fill('#correo', CORREO);
  await pagina.click('#b-correo');
  await pagina.waitForSelector('#v-clave:not([hidden])', { timeout: 15000 });
  await pagina.fill('#clave', CLAVE);
  await pagina.click('#b-clave');
  await pagina.waitForSelector('#v-general:not([hidden])', { timeout: 20000 });
  rev(true, 'sale, vuelve a entrar con su contraseña y no le piden nada más');

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

  /* El desglose fiscal y las dos maneras de llevárselo (encargo de Mike del
   * 21-sep). Lo que se mide no es que el bloque aparezca: es que los números
   * pintados sean EXACTAMENTE los del servidor. Este papel lo manda también
   * el taller desde dash101, y si las dos caras no dijeran lo mismo, el que
   * lo notaría es el cliente. */
  const estado = await pagina.evaluate(async (pid) => {
    const r = await fetch(`/s101/orgs/demo/proyectos/${pid}/estado`, { credentials: 'include' });
    const j = await r.json();
    return j?.ok ? j.data : null;
  }, p.id);
  rev(!!estado, 'el cliente puede abrir el estado de cuenta de SU proyecto');

  if (estado) {
    const t = estado.totales;
    rev(t.subtotal + t.iva === t.total, 'subtotal + IVA = total, al centavo',
        `${t.subtotal} + ${t.iva} = ${t.total}`);
    const sumaItems = estado.items.reduce((a, i) => a + i.importe, 0);
    rev(sumaItems === t.subtotal, 'la suma de la lista ES el subtotal', `${sumaItems} vs ${t.subtotal}`);
    rev(!JSON.stringify(estado).match(/pagado_prov|compromiso|proveedor/i),
        'y el estado de cuenta no trae nada de proveedores');

    if (t.iva > 0) {
      /* CON CENTAVOS: el resto del portal enseña pesos redondos, pero el
       * desglose no puede. Con «IVA incluido» el subtotal casi nunca es
       * redondo y, redondeado, los tres renglones no suman. */
      const mx2 = (c) => '$' + ((c ?? 0) / 100).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      await pagina.waitForSelector('#d-desglose:not([hidden])', { timeout: 15000 });
      rev((await pagina.textContent('#d-subtotal')).trim() === mx2(t.subtotal), 'el subtotal pintado es el del servidor, al centavo');
      rev((await pagina.textContent('#d-iva')).trim() === mx2(t.iva), 'el IVA pintado es el del servidor, al centavo');
      rev((await pagina.textContent('#d-gran-total')).trim() === mx2(t.total), 'el total pintado es el del servidor, al centavo');
      rev((await pagina.textContent('#d-total')).trim() === mx2(t.total), 'y el KPI de arriba también trae el total con IVA');
      rev(/Generado el/.test(await pagina.textContent('#d-generado')), 'dice el día en que se generó');
    }

    // El Excel: que la liga apunte a donde debe y que del otro lado salga un
    // archivo de verdad. El armador vive en la API y sus pruebas están allá.
    const liga = await pagina.getAttribute('#d-excel', 'href');
    rev(liga.endsWith(`/proyectos/${p.id}/estado.xlsx`), 'la liga del Excel apunta a la ruta de la API', liga);
    const excel = await pagina.evaluate(async (u) => {
      const r = await fetch(u, { credentials: 'include' });
      const b = new Uint8Array(await r.arrayBuffer());
      return { estado: r.status, tipo: r.headers.get('content-type'), pk: b[0] === 0x50 && b[1] === 0x4b, bytes: b.byteLength };
    }, liga);
    rev(excel.estado === 200 && excel.pk && excel.bytes > 500,
        'y baja un .xlsx de verdad', `${excel.estado}, ${excel.bytes} bytes, ${excel.tipo}`);
  }

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

/** Con red lenta, /yo contesta después de que el cliente ya tecleó su correo.
 *  La pantalla NO debe regresarlo a la primera vista cuando por fin llega el
 *  401. Pasó de verdad el 18-sep-2026 (desde el sandbox, donde /yo tarda ~700
 *  ms): el botón «Olvidé mi contraseña» desaparecía debajo del dedo. Aquí la
 *  demora se fabrica, para que se mida igual en cualquier red. */
async function yoLento(navegador) {
  console.log(`\n== /yo tarda en contestar ==  ${BASE}`);
  const ctx = await navegador.newContext({ viewport: { width: 390, height: 844 }, locale: 'es-MX' });
  const pagina = await ctx.newPage();
  await pagina.route('**/s101/yo', async (ruta) => { await dormir(2500); await ruta.continue(); });
  await pagina.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
  await pagina.waitForSelector('#v-correo:not([hidden])', { timeout: 15000 });
  await pagina.fill('#correo', CORREO);
  await pagina.click('#b-correo');
  await pagina.waitForSelector('#v-clave:not([hidden])', { timeout: 15000 });
  await dormir(3500); // para cuando ya llegó el 401 tardío
  rev(await pagina.isVisible('#v-clave') && await pagina.isVisible('#olvide'),
    'el 401 tardío de /yo no regresa al cliente a la pantalla del correo');
  await ctx.close();
}

const navegador = await chromium.launch(EJECUTABLE ? { executablePath: EJECUTABLE } : {});
try {
  await correr(navegador, 390, 844, 'celular', datos);
  await correr(navegador, 1440, 900, 'computadora', datos);
  await google(navegador);
  await yoLento(navegador);
} finally {
  await navegador.close();
}

console.log(`\n${revisadas} revisadas · ${fallas} fallas`);
process.exit(fallas === 0 ? 0 : 1);
