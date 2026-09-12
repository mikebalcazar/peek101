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
let modo = 'codigo';  // 'codigo' | 'pin'

function mostrar(cual) {
  for (const v of ['v-correo', 'v-clave', 'v-cargando', 'v-general', 'v-detalle']) $(v).hidden = v !== cual;
  window.scrollTo(0, 0);
}

/* ─────────────── entrada ─────────────── */

function pintarClave() {
  const esCodigo = modo === 'codigo';
  $('clave-t').textContent = esCodigo ? 'Tu código' : 'Tu PIN';
  $('clave-p').textContent = esCodigo ? `Te lo mandamos a ${correo}. Vence en 10 minutos.` : `Del portal de ${correo}.`;
  $('clave-l').textContent = esCodigo ? 'Código de 6 dígitos' : 'PIN de 6 dígitos';
  $('clave').type = esCodigo ? 'text' : 'password';
  $('clave').autocomplete = esCodigo ? 'one-time-code' : 'current-password';
  $('cambiar-modo').textContent = esCodigo ? 'Entrar con mi PIN' : 'Mandarme un código';
  $('reenviar').hidden = !esCodigo;
  $('clave').value = '';
  $('err-clave').textContent = '';
  $('err-clave').classList.remove('bien');
  $('clave').focus();
}

$('f-correo').onsubmit = async (ev) => {
  ev.preventDefault();
  const c = $('correo').value.trim().toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(c)) { $('err-correo').textContent = 'Escribe un correo válido.'; return; }
  correo = c;
  $('err-correo').textContent = '';
  const b = $('b-correo'); b.disabled = true; b.textContent = 'Mandando…';
  try {
    await pedirCodigo();
    modo = 'codigo';
    mostrar('v-clave');
    pintarClave();
  } catch (e) {
    // Que el correo no tenga portal se dice aquí, no después de teclear un
    // código que nunca iba a servir.
    $('err-correo').textContent = e.message;
  } finally { b.disabled = false; b.textContent = 'Continuar'; }
};

async function pedirCodigo() {
  const d = await pedir('/auth/codigo', { method: 'POST', body: { correo } });
  // En staging la API devuelve `codigo_prueba`; la prueba de Playwright lo usa
  // desde fuera. Aquí no se enseña ni se guarda.
  return d;
}

$('f-clave').onsubmit = async (ev) => {
  ev.preventDefault();
  const v = $('clave').value.trim();
  if (!/^\d{6}$/.test(v)) { $('err-clave').textContent = modo === 'codigo' ? 'El código son 6 dígitos.' : 'El PIN son 6 dígitos.'; return; }
  const b = $('b-clave'); b.disabled = true; b.textContent = 'Entrando…';
  $('err-clave').textContent = '';
  try {
    await pedir('/auth/entrar', { method: 'POST', body: modo === 'codigo' ? { correo, codigo: v } : { correo, pin: v } });
    await entrar();
  } catch (e) {
    let msg = e.message;
    const quedan = e.detalle?.intentos_restantes;
    if (e.error === 'codigo_invalido' && typeof quedan === 'number') {
      msg = quedan > 0 ? `Ese código no es. Te quedan ${quedan} ${quedan === 1 ? 'intento' : 'intentos'}.` : 'Ese código no es y se acabaron los intentos. Pide uno nuevo.';
    }
    $('err-clave').textContent = msg;
    $('clave').value = '';
    $('clave').focus();
  } finally { b.disabled = false; b.textContent = 'Entrar'; }
};

$('cambiar-modo').onclick = async () => {
  if (modo === 'codigo') { modo = 'pin'; pintarClave(); return; }
  modo = 'codigo';
  try { await pedirCodigo(); pintarClave(); }
  catch (e) { modo = 'pin'; $('err-clave').textContent = e.message; }
};

$('reenviar').onclick = async () => {
  const b = $('reenviar'); b.disabled = true;
  try {
    await pedirCodigo();
    $('err-clave').classList.add('bien');
    $('err-clave').textContent = 'Te mandamos otro código.';
  } catch (e) { $('err-clave').classList.remove('bien'); $('err-clave').textContent = e.message; }
  finally { b.disabled = false; }
};

// Volver al correo limpia el aviso rojo: si se queda pegado parece que la
// pantalla nueva ya falló. Es el mismo arreglo que roster101 el 12-sep.
$('otro-correo').onclick = () => {
  $('err-correo').textContent = '';
  $('err-clave').textContent = '';
  $('clave').value = '';
  mostrar('v-correo');
  $('correo').focus();
};

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
  try {
    await pedir('/yo');
    await entrar();
  } catch {
    mostrar('v-correo');
  }
})();
