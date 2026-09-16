/* Mide el Worker de peek101 ya publicado en Cloudflare.
 *
 * El chat no alcanza *.workers.dev: el proxy de salida se lo rechaza. El
 * corredor de GitHub sí. Por eso esto corre allá y lo que mide vuelve por el
 * comentario del commit, que es lo único que el chat puede leer (OPERAR §6).
 *
 * Lo que se mide, y por qué:
 *
 *   la portada y sus piezas  que los archivos de `public/` estén servidos. Si
 *                            una .woff2 se cae, el portal abre igual y sólo
 *                            se nota porque cambió la letra.
 *   la versión servida       que lo que contesta el borde sea lo que se acaba
 *                            de construir, y no la copia anterior. En dash101
 *                            eso dio un rojo falso el 12-sep; un rojo falso
 *                            hoy es un verde falso mañana.
 *   /s101/salud              que el enlace de servicio llegue a la API, y a
 *                            LA QUE TOCA. Un enlace cruzado sería el portal
 *                            de prueba enseñando datos de la empresa real.
 *   la cabecera X-App        el Worker la pone; el navegador nunca la manda.
 *                            Se manda una basura a propósito: si la respuesta
 *                            sigue siendo buena, el Worker la sobrescribió.
 *   el recorrido del cliente sólo en staging: entrar como «Familia Ramírez»
 *                            de la org `demo` y que /peek conteste con sus
 *                            cifras. En producción NO se entra y NO se
 *                            escribe: ahí hay clientes reales.
 */

const PROD = process.env.PROD;
const STAGING = process.env.STAGING;
const VERSION_ESPERADA = process.env.VERSION_ESPERADA || '';
const CORREO_DEMO = process.env.CORREO_DEMO || 'familia.ramirez@ejemplo.mx';
const ORG_DEMO = process.env.ORG_DEMO || 'demo';
const ORG_PROD = process.env.ORG_PROD || '';

const PIEZAS = [
  '/estilo.css', '/app.js', '/textos.js',
  '/fonts/fira-cifras-400.woff2', '/fonts/raleway-400.woff2', '/fonts/sansation-700.woff2',
];

let fallas = 0, revisadas = 0;
const linea = (t) => console.log(t);
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
function rev(ok, texto, extra = '') {
  revisadas++; if (!ok) fallas++;
  linea(`  ${ok ? 'ok   ' : 'FALLA'} ${texto}${extra ? '  →  ' + extra : ''}`);
}

async function traer(base, ruta, { method = 'GET', body, cabeceras = {}, galleta } = {}) {
  const t0 = Date.now();
  const h = { ...cabeceras };
  if (body) h['Content-Type'] = 'application/json';
  if (galleta) h.Cookie = galleta;
  const r = await fetch(`${base}${ruta}`, { method, headers: h, body: body ? JSON.stringify(body) : undefined, redirect: 'manual' });
  const texto = await r.text();
  let crudo = null;
  try { crudo = JSON.parse(texto); } catch { /* HTML o una fuente */ }
  // Toda respuesta de la API viene envuelta: {ok:true,data} o {ok:false,error}
  // (suite101-api/src/http.ts). Sin desenvolverla, la medición acusaría al
  // Worker de algo que no hizo.
  const cuerpo = crudo && typeof crudo === 'object' && 'ok' in crudo
    ? (crudo.ok ? crudo.data : { error: crudo.error, detalle: crudo.detalle })
    : crudo;
  return {
    estado: r.status, ms: Date.now() - t0,
    tipo: r.headers.get('content-type') || '',
    puesta: r.headers.get('set-cookie') || '',
    ubicacion: r.headers.get('location') || '',
    bytes: texto.length, texto, cuerpo,
  };
}

/** La cáscara: lo que cualquiera ve sin sesión. Igual en los dos entornos. */
async function laCascara(base, quien) {
  linea('');
  linea(`== ${quien} ==  ${base}`);

  // Un Worker recién publicado tarda en llegar a todos los bordes: se espera
  // hasta ver la versión que se acaba de construir, y se apunta cuánto costó.
  let portada = await traer(base, '/');
  let intentos = 1;
  const sirveLaNueva = (r) => r.estado === 200 && (!VERSION_ESPERADA || r.texto.includes(VERSION_ESPERADA));
  while (!sirveLaNueva(portada) && intentos < 12) {
    await dormir(5000);
    portada = await traer(base, '/');
    intentos++;
  }
  rev(portada.estado === 200, 'la portada contesta', `${portada.estado} en ${portada.ms} ms · ${intentos} intento${intentos === 1 ? '' : 's'}`);
  rev(portada.texto.includes('Estado de cuenta'), 'la portada trae su título');
  if (VERSION_ESPERADA) {
    const m = portada.texto.match(/name="peek101-version" content="([^"]*)"/);
    rev(m?.[1] === VERSION_ESPERADA, 'la portada es la versión que se acaba de construir',
      `sirve ${m?.[1]?.slice(0, 8) ?? '(sin versión)'}, se esperaba ${VERSION_ESPERADA.slice(0, 8)}`);
  }
  let peso = portada.bytes;
  for (const pieza of PIEZAS) {
    const r = await traer(base, pieza);
    peso += r.bytes;
    rev(r.estado === 200, `la pieza ${pieza}`, `${r.estado} ${r.tipo.split(';')[0]}`);
  }
  linea(`       la primera carga pesa ~${Math.round(peso / 1024)} KB (portada + ${PIEZAS.length} piezas)`);

  // Cero peticiones a terceros: las fuentes viajan dentro. Un Google Fonts
  // que se cuele deja al cliente sin letras cuando no hay señal.
  const html = portada.texto + (await traer(base, '/estilo.css')).texto;
  rev(!/fonts\.googleapis|fonts\.gstatic|gstatic\.com\/firebasejs/.test(html), 'cero peticiones a terceros');
}

/** El enlace de servicio a la API, por debajo, sin salir a internet. */
async function elEnlace(base, entornoEsperado, quien) {
  const salud = await traer(base, '/s101/salud');
  const d = salud.cuerpo || {};
  rev(salud.estado === 200, `${quien}: /s101/salud contesta`, `${salud.estado} en ${salud.ms} ms`);
  rev(d.entorno === entornoEsperado, `${quien}: el enlace va a la API de ${entornoEsperado}`, `contestó «${d.entorno}»`);
  linea(`       contrato ${d.contrato}  ·  versión ${d.version}  ·  D1 ${d.d1}`);
  const raiz = await traer(base, '/s101');
  rev(raiz.cuerpo?.servicio === 'suite101-api', `${quien}: /s101 a secas cae en la raíz de la API`, `${raiz.estado}`);
  // Entrar con Google pasa por el mismo proxy. Sin llaves en la API: 501; con
  // ellas: 302 a accounts.google.com, y entonces Google tiene que devolver a
  // la API (URL_PUBLICA), nunca a este dominio, que sólo sirve /s101/*.
  const g = await traer(base, `/s101/auth/google?volver_a=${encodeURIComponent(base + '/')}`);
  const aGoogle = g.estado === 302 && String(g.ubicacion).startsWith('https://accounts.google.com/');
  rev(g.estado === 501 || aGoogle, `${quien}: /s101/auth/google pasa la puerta del origen`, aGoogle ? 'Google prendido: 302 a accounts.google.com' : `${g.estado} ${g.cuerpo?.error ?? ''}`);
  if (aGoogle) {
    const destino = new URL(g.ubicacion).searchParams.get('redirect_uri');
    rev(/^https:\/\/suite101-api(-staging)?\.mike-929\.workers\.dev\/auth\/google\/callback$/.test(String(destino)), `${quien}: Google devuelve a la API, no a peek101`, String(destino));
  }
}

/* ─────────────── producción: mirar, no tocar ─────────────── */

async function produccion() {
  await laCascara(PROD, 'Producción');
  await elEnlace(PROD, 'produccion', 'producción');
  // Sin galleta la API contesta 401 y no filtra nada. Que conteste JSON de la
  // API —y no el index.html— es la prueba de que /s101/* no lo atienden los
  // archivos estáticos.
  const ruta = ORG_PROD ? `/s101/orgs/${ORG_PROD}/peek` : '/s101/yo';
  const sinSesion = await traer(PROD, ruta);
  rev(sinSesion.estado === 401 && sinSesion.cuerpo?.error === 'sin_sesion',
    'producción: sin sesión la API contesta 401, y no los archivos',
    `${sinSesion.estado} ${sinSesion.cuerpo?.error ?? sinSesion.tipo}`);
}

/* ─────────────── staging: el recorrido del cliente ─────────────── */

async function staging() {
  await laCascara(STAGING, 'Staging');
  await elEnlace(STAGING, 'staging', 'staging');

  let galleta = '';
  for (let i = 0; i < 4 && !galleta; i++) {
    const pide = await traer(STAGING, '/s101/auth/codigo', { method: 'POST', body: { correo: CORREO_DEMO } });
    const codigo = pide.cuerpo?.codigo_prueba;
    if (!codigo) {
      if (pide.cuerpo?.error === 'demasiados_intentos') {
        const s = (pide.cuerpo.detalle?.espera_segundos ?? 45) + 2;
        linea(`       (la API pide esperar ${s} s para otro código)`);
        await dormir(s * 1000);
        continue;
      }
      rev(false, 'staging devuelve codigo_prueba', `${pide.estado} ${pide.cuerpo?.error ?? ''}`);
      return;
    }
    const entra = await traer(STAGING, '/s101/auth/entrar', { method: 'POST', body: { correo: CORREO_DEMO, codigo } });
    if (entra.estado === 200) {
      galleta = entra.puesta.split(';')[0];
      rev(entra.puesta.includes('s101='), 'la galleta de sesión se pone en el origen de peek101', galleta.slice(0, 12) + '…');
    } else if (i === 3) {
      rev(false, 'entrar por /s101/auth/entrar', `${entra.estado} ${entra.cuerpo?.error ?? ''}`);
      return;
    }
  }
  if (!galleta) return;

  const yo = await traer(STAGING, '/s101/yo', { galleta });
  rev(yo.cuerpo?.acceso?.tipo === 'cliente', '/s101/yo dice que es un cliente', yo.cuerpo?.acceso?.tipo ?? `${yo.estado}`);
  rev(yo.cuerpo?.acceso?.org_id === ORG_DEMO, 'y que su empresa es la de demostración', yo.cuerpo?.acceso?.org_id ?? '');

  // El Worker pone X-App: peek101. Se le manda una basura a propósito: si la
  // pusiera el navegador, la API contestaría 400 app_desconocida.
  const conBasura = await traer(STAGING, `/s101/orgs/${ORG_DEMO}/peek`, { galleta, cabeceras: { 'X-App': 'basura-a-proposito' } });
  rev(conBasura.estado === 200, 'el Worker sobrescribe X-App: peek101 (se mandó basura y contestó bien)', `${conBasura.estado} ${conBasura.cuerpo?.error ?? ''}`);

  const peek = await traer(STAGING, `/s101/orgs/${ORG_DEMO}/peek`, { galleta });
  const d = peek.cuerpo;
  rev(peek.estado === 200 && !!d?.cliente, '/peek contesta el estado de cuenta', d?.cliente?.nombre ?? `${peek.estado}`);
  if (!d?.totales) return;
  const items = (d.proyectos ?? []).reduce((s, p) => s + (p.items?.length ?? 0), 0);
  linea(`       ${d.proyectos.length} proyecto(s) · ${items} producto(s) · ${d.pagos.length} pago(s)`);
  const suma = (d.proyectos ?? []).reduce((s, p) => s + (p.precio_venta ?? 0), 0);
  rev(d.totales.vendido === suma, 'el total vendido es la suma de los proyectos', `${d.totales.vendido} vs ${suma}`);
  rev(d.totales.saldo === d.totales.vendido - d.totales.cobrado, 'y el saldo es vendido menos cobrado');
  for (const prohibido of ['partidas', 'pagado_prov', 'compromiso']) {
    rev(!JSON.stringify(d).includes(prohibido), `/peek no trae «${prohibido}»`);
  }

  // Y lo que un cliente NO puede: desde el 12-sep cualquier tabla suelta le
  // contesta 403 (suite101-api PR #40). Se comprueba desde aquí porque es lo
  // que separa «el cliente ve lo suyo» de «el cliente ve la empresa».
  const suelta = await traer(STAGING, `/s101/orgs/${ORG_DEMO}/proyectos`, { galleta });
  rev(suelta.estado === 403, 'un cliente no puede listar tablas sueltas', `${suelta.estado} ${suelta.cuerpo?.error ?? ''}`);
}

/* ─────────────── ─────────────── */

const t0 = Date.now();
linea(`peek101 como Worker — medido el ${new Date().toISOString()}`);
if (!PROD && !STAGING) { linea('No hay nada que medir: faltan PROD y STAGING.'); process.exit(1); }
try {
  if (PROD) await produccion();
  if (STAGING) await staging();
} catch (e) {
  fallas++;
  linea(`\nSe cayó la medición: ${e?.stack || e}`);
}
linea('');
linea(`${revisadas} revisadas · ${fallas} fallas · ${((Date.now() - t0) / 1000).toFixed(1)} s`);
process.exit(fallas === 0 ? 0 : 1);
