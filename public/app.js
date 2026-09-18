/* peek101 — el portal del cliente.
 *
 * Sólo lectura. El cliente entra con su correo y un código de 6 dígitos (o su
 * PIN si ya lo fijó), y ve lo que compró, cómo va y cuánto ha pagado.
 *
 * Todo pasa por `/s101/*`, que el Worker reenvía a `suite101-api` desde este
 * mismo origen (decisión D1): así la cookie de sesión es propia y Safari no la
 * bloquea. El Worker pone `X-App: peek101`; aquí no se manda.
 *
 * Los datos salen de UNA sola llamada, `GET /s101/orgs/:o/peek`, que ya trae
 * los totales calculados junto con la lista. No se recalculan aquí a
 * propósito: que el número grande y la tabla salgan de la misma consulta es lo
 * que hace imposible que se contradigan, y contradecirse fue un defecto real
 * del 7-sep.
 *
 * Lo que esta app NUNCA ve, porque la API no lo manda: costos, partidas,
 * proveedores, egresos. */

import { ERRORES, ESTADOS, ETAPAS, nombreEtapa } from './textos.js';

const API = '/s101';
const $ = (id) => document.getElementById(id);
const HOY = new Date(); HOY.setHours(0, 0, 0, 0);

/* ─────────────── formato ───────────────
 * El dinero llega en centavos, como entero. Se divide aquí, en el único lugar
 * donde se dibuja: así no hay un `parseFloat` suelto que redondee de más. */

const pesos = (centavos) =>
  '$' + ((centavos ?? 0) / 100).toLocaleString('es-MX', { minimumFractionDigits: 0, maximumFractionDigits: 0 });

/** `avance` viene de 0 a 1 (se midió en staging el 12-sep: 0.4642857… para
 *  13 de 28 etapas). Se dibuja como porcentaje entero. */
const pct = (fraccion) => Math.round((fraccion ?? 0) * 100);

const fecha = (iso) => {
  if (!iso) return '—';
  // Las fechas de día vienen como `2026-10-15`. Partidas a mano, porque
  // `new Date('2026-10-15')` las lee en UTC y en México se ven un día antes.
  const [a, m, d] = String(iso).slice(0, 10).split('-').map(Number);
  if (!a || !m || !d) return '—';
  return new Date(a, m - 1, d).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' });
};
const fechaLarga = (d) => d.toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' });
const dia = (iso) => { if (!iso) return null; const [a, m, d] = String(iso).slice(0, 10).split('-').map(Number); return a ? new Date(a, m - 1, d) : null; };
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/* ─────────────── la API ─────────────── */

class ErrorApi extends Error {
  constructor(error, estado, detalle) {
    super(ERRORES[error] ?? 'Algo no salió bien. Vuelve a intentar.');
    this.error = error; this.estado = estado; this.detalle = detalle;
  }
}

async function pedir(ruta, opciones = {}) {
  const r = await fetch(`${API}${ruta}`, {
    method: opciones.method ?? 'GET',
    headers: opciones.body ? { 'Content-Type': 'application/json' } : undefined,
    body: opciones.body ? JSON.stringify(opciones.body) : undefined,
    credentials: 'include',
  });
  let cuerpo = null;
  try { cuerpo = await r.json(); } catch { /* no vino JSON */ }
  if (!r.ok || !cuerpo?.ok) throw new ErrorApi(cuerpo?.error ?? 'sin_respuesta', r.status, cuerpo?.detalle);
  return cuerpo.data;
}

/* ─────────────── estado ─────────────── */

let DATOS = null;     // lo que devolvió /peek
let ORG = null;       // la empresa del cliente, de /yo
let correo = '';

function mostrar(cual) {
  for (const v of ['v-correo', 'v-clave', 'v-codigo', 'v-nueva', 'v-cargando', 'v-general', 'v-detalle']) $(v).hidden = v !== cual;
  window.scrollTo(0, 0);
}

/* ─────────────── entrada ─────────────── */

function pintarClave() {
  $('clave-p').textContent = `La de tu cuenta, ${correo}.`;
  $('clave').value = '';
  $('err-clave').textContent = '';
  $('err-clave').classList.remove('bien');
  $('clave').focus();
}

function pintarCodigo() {
  $('codigo-p').textContent = `Te lo mandamos a ${correo}. Vence en 10 minutos.`;
  $('codigo').value = '';
  $('err-codigo').textContent = '';
  $('err-codigo').classList.remove('bien');
  $('codigo').focus();
}

function pintarNueva(primera) {
  $('nueva-t').textContent = primera ? 'Ponle una contraseña' : 'Tu contraseña nueva';
  $('nueva-p').textContent = primera
    ? 'Con ella entras de ahora en adelante, aquí y en las demás apps de la suite.'
    : 'Tecléala dos veces; la segunda, de memoria.';
  $('nueva').value = ''; $('nueva2').value = '';
  $('err-nueva').textContent = '';
  $('nueva').focus();
}

$('f-correo').onsubmit = async (ev) => {
  ev.preventDefault();
  const c = $('correo').value.trim().toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(c)) { $('err-correo').textContent = 'Escribe un correo válido.'; return; }
  correo = c;
  $('err-correo').textContent = '';
  /* Ya no se pide un código aquí. Se pasa a la contraseña, y NO se le pregunta
   * a la API si esta persona tiene una: eso volvería esta pantalla un
   * directorio de quién tiene portal. Antes se avisaba en este paso que un
   * correo no tenía portal; ahora eso se sabe al intentar entrar, que es donde
   * la API decide, y con el mismo mensaje para un correo que no existe y para
   * una contraseña equivocada. */
  mostrar('v-clave');
  pintarClave();
};

async function pedirCodigo() {
  const d = await pedir('/auth/codigo', { method: 'POST', body: { correo } });
  // En staging la API devuelve `codigo_prueba`; la prueba de Playwright lo usa
  // desde fuera. Aquí no se enseña ni se guarda.
  return d;
}

$('f-clave').onsubmit = async (ev) => {
  ev.preventDefault();
  // La contraseña NO se recorta: un espacio al principio o al final es parte
  // de ella, y la suite rechaza esas al ponerlas. Recortarla aquí haría que
  // una contraseña buena no entrara y nadie sabría por qué.
  const v = $('clave').value;
  if (!v) { $('err-clave').textContent = 'Escribe tu contraseña.'; return; }
  const b = $('b-clave'); b.disabled = true; b.textContent = 'Entrando…';
  $('err-clave').textContent = '';
  try {
    await pedir('/auth/entrar', { method: 'POST', body: { correo, clave: v } });
    await entrar();
  } catch (e) {
    /* `sin_permiso` es el correo que no tiene portal y `clave_invalida` la
     * contraseña equivocada. Se dicen IGUAL a propósito: distinguirlos le
     * diría a cualquiera qué correos tienen portal aquí. */
    $('err-clave').textContent = e.error === 'sin_permiso' || e.error === 'clave_invalida'
      ? 'Ese correo y esa contraseña no coinciden.'
      : e.message;
    $('clave').value = '';
    $('clave').focus();
  } finally { b.disabled = false; b.textContent = 'Entrar'; }
};

/* «Olvidé mi contraseña», que es la misma puerta para quien nunca tuvo una. */
$('olvide').onclick = async () => {
  const b = $('olvide'); b.disabled = true; b.textContent = 'Mandando…';
  $('err-clave').textContent = '';
  try {
    await pedirCodigo();
    mostrar('v-codigo');
    pintarCodigo();
  } catch (e) { $('err-clave').textContent = e.message; }
  finally { b.disabled = false; b.textContent = 'Olvidé mi contraseña'; }
};

$('f-codigo').onsubmit = async (ev) => {
  ev.preventDefault();
  const v = $('codigo').value.trim();
  if (!/^\d{6}$/.test(v)) { $('err-codigo').textContent = 'El código son 6 dígitos.'; return; }
  const b = $('b-codigo'); b.disabled = true; b.textContent = 'Entrando…';
  $('err-codigo').textContent = '';
  try {
    await pedir('/auth/entrar', { method: 'POST', body: { correo, codigo: v } });
    await entrar();
  } catch (e) {
    let msg = e.message;
    const quedan = e.detalle?.intentos_restantes;
    if (e.error === 'codigo_invalido' && typeof quedan === 'number') {
      msg = quedan > 0 ? `Ese código no es. Te quedan ${quedan} ${quedan === 1 ? 'intento' : 'intentos'}.` : 'Ese código no es y se acabaron los intentos. Pide uno nuevo.';
    }
    $('err-codigo').textContent = msg;
    $('codigo').value = '';
    $('codigo').focus();
  } finally { b.disabled = false; b.textContent = 'Continuar'; }
};

$('f-nueva').onsubmit = async (ev) => {
  ev.preventDefault();
  const a = $('nueva').value, c = $('nueva2').value;
  if (a.length < 10) { $('err-nueva').textContent = 'La contraseña necesita al menos 10 caracteres.'; return; }
  if (a !== c) {
    // No se dice cuál falló ni se deja la primera puesta: si no coincidieron,
    // una de las dos está mal y no hay forma de saber cuál.
    $('err-nueva').textContent = 'No coincidieron. Vamos otra vez, desde el principio.';
    $('nueva').value = ''; $('nueva2').value = ''; $('nueva').focus();
    return;
  }
  const b = $('b-nueva'); b.disabled = true; b.textContent = 'Guardando…';
  $('err-nueva').textContent = '';
  try {
    await pedir('/auth/clave', { method: 'POST', body: { clave: a } });
    await entrar();
  } catch (e) {
    // La suite dice con palabras por qué una contraseña no pasa. Se enseña tal
    // cual: es más útil que «contraseña inválida».
    $('err-nueva').textContent = e.detalle?.porque || e.message;
    $('nueva').value = ''; $('nueva2').value = ''; $('nueva').focus();
  } finally { b.disabled = false; b.textContent = 'Guardar y entrar'; }
};

/* ─────────────── entrar con Google ───────────────
 * La API manda al navegador a Google y Google devuelve a la API; ella abre la
 * sesión y regresa aquí con `?entrada=<boleto de un solo uso>`, que el
 * arranque canjea por la cookie en este origen (ver abajo). Antes de saltar
 * se pregunta sin seguir el salto: si Google no está prendido en la API
 * contesta 501 y se dice aquí, no en una pestaña con un JSON. */
const urlGoogle = () => `${API}/auth/google?volver_a=${encodeURIComponent(location.origin + '/')}`;

$('b-google').onclick = async () => {
  const b = $('b-google'); b.disabled = true; b.textContent = 'Abriendo Google…';
  $('err-correo').textContent = '';
  try {
    const r = await fetch(urlGoogle(), { redirect: 'manual', credentials: 'include' });
    if (r.type === 'opaqueredirect' || (r.status >= 300 && r.status < 400)) { location.href = urlGoogle(); return; }
    let cuerpo = null;
    try { cuerpo = await r.json(); } catch { /* no vino JSON */ }
    throw new ErrorApi(cuerpo?.error ?? 'sin_respuesta', r.status, cuerpo?.detalle);
  } catch (e) {
    $('err-correo').textContent = e.message;
    b.disabled = false; b.textContent = 'Entrar con Google';
  }
};

$('reenviar').onclick = async () => {
  const b = $('reenviar'); b.disabled = true;
  try {
    await pedirCodigo();
    $('err-codigo').classList.add('bien');
    $('err-codigo').textContent = 'Te mandamos otro código.';
  } catch (e) { $('err-codigo').classList.remove('bien'); $('err-codigo').textContent = e.message; }
  finally { b.disabled = false; }
};

// Volver al correo limpia el aviso rojo: si se queda pegado parece que la
// pantalla nueva ya falló. Es el mismo arreglo que roster101 el 12-sep.
function alCorreo() {
  for (const e of ['err-correo', 'err-clave', 'err-codigo', 'err-nueva']) {
    $(e).textContent = ''; $(e).classList.remove('bien');
  }
  $('clave').value = ''; $('codigo').value = '';
  $('nueva').value = ''; $('nueva2').value = '';
  mostrar('v-correo');
  $('correo').focus();
}
$('otro-correo').onclick = alCorreo;
$('otro-correo-2').onclick = alCorreo;

$('salir').onclick = async () => {
  try { await pedir('/auth/salir', { method: 'POST' }); } catch { /* la sesión ya no estaba */ }
  DATOS = null; ORG = null;
  $('quien').hidden = true;
  mostrar('v-correo');
};

/* ─────────────── cargar y pintar ─────────────── */

async function entrar() {
  mostrar('v-cargando');
  try {
    const yo = await pedir('/yo');
    if (!yo.acceso || yo.acceso.tipo !== 'cliente') throw new ErrorApi('sin_permiso', 403);
    if (!yo.acceso.activo) throw new ErrorApi('sin_permiso', 403);

    /* Entró con un código y no tiene contraseña: no tiene por dónde volver
     * mañana, porque el código es de un solo uso y de diez minutos. Se le pide
     * antes de enseñarle nada. Con Google NO se le pide: Google ya es una
     * forma de entrar, y pedirle una contraseña a quien no la necesita es un
     * estorbo. */
    if (!yo.tiene_clave && yo.entro_con === 'codigo') {
      mostrar('v-nueva');
      pintarNueva(true);
      return;
    }

    ORG = yo.acceso.org_id;
    DATOS = await pedir(`/orgs/${encodeURIComponent(ORG)}/peek`);
    $('quien-n').textContent = yo.usuario.correo;
    $('quien').hidden = false;
    pintarGeneral();
    mostrar('v-general');
  } catch (e) {
    $('err-clave').textContent = e.message;
    mostrar(correo ? 'v-clave' : 'v-correo');
  }
}

/** Lo que se le dice al cliente del proyecto, con su color. */
function estadoDe(p) {
  return ESTADOS[p.estado] ?? ['En proceso', 'marca'];
}

/** La última fecha de entrega acordada del proyecto. */
function entregaDe(p) {
  const fechas = (p.items ?? []).map((i) => dia(i.fecha_entrega)).filter(Boolean).sort((a, b) => b - a);
  return fechas[0] ?? dia(p.fecha_fin_estimada);
}

function pintarGeneral() {
  const { cliente, proyectos: P, totales } = DATOS;
  const abiertos = P.filter((p) => p.estado !== 'cerrado');
  const items = P.reduce((s, p) => s + (p.items?.length ?? 0), 0);

  $('g-cliente').textContent = cliente.nombre;
  $('g-sub').textContent = `${P.length} proyecto${P.length === 1 ? '' : 's'} · ${items} producto${items === 1 ? '' : 's'}`;
  $('g-fecha').textContent = fechaLarga(new Date());

  $('g-total').textContent = pesos(totales.vendido);
  $('g-total-d').textContent = `${abiertos.length} en proceso · ${P.length - abiertos.length} cerrado${P.length - abiertos.length === 1 ? '' : 's'}`;
  $('g-pagado').textContent = pesos(totales.cobrado);
  $('g-pagado-d').textContent = totales.vendido ? `${Math.round(totales.cobrado / totales.vendido * 100)} % del total` : '';
  $('g-saldo').textContent = pesos(totales.saldo);
  $('g-saldo-d').textContent = totales.vendido ? `${Math.round(totales.saldo / totales.vendido * 100)} % por pagar` : '';

  $('g-pct').textContent = pct(totales.avance) + ' %';
  requestAnimationFrame(() => { $('g-barra').style.width = pct(totales.avance) + '%'; });

  if (!P.length) {
    $('g-proys').innerHTML = '<div class="avance"><p class="nota" style="margin:0">Todavía no hay proyectos ligados a tu cuenta.</p></div>';
    return;
  }
  $('g-proys').innerHTML = P.map((p, i) => {
    const [e, c] = estadoDe(p);
    const saldo = (p.precio_venta ?? 0) - (p.cobrado ?? 0);
    const ent = entregaDe(p);
    const n = p.items?.length ?? 0;
    return `<button class="proy" data-i="${i}">
      <div><div class="n">${esc(p.nombre)}</div><div class="m">${p.descripcion ? esc(p.descripcion) + ' · ' : ''}${n} producto${n === 1 ? '' : 's'}</div><div style="margin-top:8px"><span class="chip ${c}">${e}</span></div></div>
      <div><div class="c">Monto</div><div class="val num">${pesos(p.precio_venta)}</div></div>
      <div><div class="c">Pagado</div><div class="val num">${pesos(p.cobrado)}</div><div class="pista fina" style="margin-top:6px"><i style="width:${p.precio_venta ? Math.min(100, Math.round(p.cobrado / p.precio_venta * 100)) : 0}%"></i></div><div class="pct num">${p.precio_venta ? Math.round(p.cobrado / p.precio_venta * 100) : 0} % pagado</div></div>
      <div><div class="c">Saldo</div><div class="val num" style="color:var(--marca)">${pesos(saldo)}</div><div class="pct">${ent ? 'entrega ' + fecha(ent.toISOString()) : ''}</div></div>
      <div class="flecha">Ver →</div>
    </button>`;
  }).join('');
  for (const b of $('g-proys').querySelectorAll('.proy')) b.onclick = () => pintarDetalle(+b.dataset.i);
}

function pintarDetalle(i) {
  const p = DATOS.proyectos[i];
  const saldo = (p.precio_venta ?? 0) - (p.cobrado ?? 0);
  const [e, c] = estadoDe(p);
  const pagos = (DATOS.pagos ?? []).filter((x) => x.proyecto_id === p.id);
  const ent = entregaDe(p);
  const tarde = ent && ent < HOY && p.estado !== 'cerrado';

  $('d-clave').textContent = 'Proyecto';
  $('d-nombre').textContent = p.nombre;
  $('d-sub').textContent = p.descripcion || '';
  $('d-estado').textContent = e;
  $('d-estado').className = 'chip ' + c;

  $('d-total').textContent = pesos(p.precio_venta);
  $('d-pagado').textContent = pesos(p.cobrado);
  $('d-pagado-d').textContent = `${pagos.length} pago${pagos.length === 1 ? '' : 's'} recibido${pagos.length === 1 ? '' : 's'}`;
  $('d-saldo').textContent = pesos(saldo);
  $('d-entrega').textContent = ent ? fecha(ent.toISOString()) : '—';
  $('d-entrega-d').textContent = ent ? (tarde ? 'Fecha acordada vencida' : 'Última entrega acordada') : 'Por definir';

  $('d-pct').textContent = pct(p.avance) + ' %';
  $('d-barra').style.width = '0';
  requestAnimationFrame(() => { $('d-barra').style.width = pct(p.avance) + '%'; });

  const items = p.items ?? [];
  const sinEtapa = items.some((it) => it.etapa == null);
  $('d-etapas-nota').textContent = sinEtapa ? 'El avance de fabricación lo marca el taller.' : '';
  $('d-items').innerHTML = items.length ? items.map((it) => {
    const et = it.etapa;
    const pasos = ETAPAS.map((nombre, k) =>
      `<i class="${et >= 7 ? 'fin' : (et != null && k < et ? 'on' : '')}" title="${esc(nombre)}"></i>`).join('');
    const fe = dia(it.fecha_entrega);
    const vencida = fe && fe < HOY && !(et >= 7);
    return `<tr>
      <td><div class="item-n">${esc(it.nombre)}</div>${it.clave ? `<div class="item-m num">${esc(it.clave)}</div>` : ''}</td>
      <td><div class="etapa"><span class="pasos">${pasos}</span><span${et == null ? ' style="color:var(--tinta-3)"' : ''}>${esc(nombreEtapa(et))}</span></div></td>
      <td class="fecha ${vencida ? 'tarde' : ''}">${fe ? fecha(it.fecha_entrega) : '—'}</td>
      <td class="r num">${pesos(it.monto)}</td>
    </tr>`;
  }).join('') : '<tr><td colspan="4" class="nota">Este proyecto todavía no tiene productos desglosados.</td></tr>';

  $('d-pagos').innerHTML = (pagos.length
    ? pagos.map((x) => `<tr><td class="fecha">${fecha(x.fecha)}</td><td>${esc(x.descripcion || 'Pago')}</td><td class="r num">${pesos(x.monto)}</td></tr>`).join('')
    : '<tr><td colspan="3" class="nota">Sin pagos registrados.</td></tr>')
    + `<tr><td colspan="2"><b>Total pagado</b></td><td class="r num"><b>${pesos(pagos.reduce((s, x) => s + (x.monto ?? 0), 0))}</b></td></tr>`;

  mostrar('v-detalle');
}

$('volver').onclick = () => { pintarGeneral(); mostrar('v-general'); };

/* ─────────────── arranque ───────────────
 * Si la cookie todavía vive, se entra directo: el cliente no vuelve a teclear
 * su código cada vez que abre el portal. Si venció, se pide el correo sin
 * enseñar ningún error: no falló nada, sólo pasó el tiempo. */

(async () => {
  // Google regresa con `?entrada=<boleto>`: se canjea por la cookie de este
  // origen y se quita de la barra, para que un recargar no lo repita.
  const u = new URL(location.href);
  const entrada = u.searchParams.get('entrada');
  if (entrada) {
    u.searchParams.delete('entrada');
    history.replaceState(null, '', u.pathname + (u.search || '') + u.hash);
    try {
      await pedir('/auth/canje', { method: 'POST', body: { entrada } });
    } catch (e) {
      mostrar('v-correo');
      $('err-correo').textContent = e.message;
      return;
    }
  }
  try {
    await pedir('/yo');
    await entrar();
  } catch {
    /* La cookie no vive: se pide el correo, pero SÓLO si el cliente no se
     * adelantó. Con red lenta, /yo contesta después de que ya tecleó su correo
     * y está en la contraseña, y regresarlo a la primera pantalla es un rebote
     * que nadie entiende: el botón «Olvidé mi contraseña» desaparecía debajo
     * del dedo. Medido el 18-sep-2026 desde el sandbox, donde /yo tarda ~700
     * ms; en el runner contesta antes de que nadie teclee y por eso no se veía. */
    if (!correo) mostrar('v-correo');
  }
})();
