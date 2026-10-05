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
import { irA, sellar, alRetroceder } from './navegar.js';
import { montarObra, abrirObra, abrirPieza, pintarObra } from './obra.js';

const API = '/s101';
const $ = (id) => document.getElementById(id);
const HOY = new Date(); HOY.setHours(0, 0, 0, 0);

/* ─────────────── formato ───────────────
 * El dinero llega en centavos, como entero. Se divide aquí, en el único lugar
 * donde se dibuja: así no hay un `parseFloat` suelto que redondee de más. */

const pesos = (centavos) =>
  '$' + ((centavos ?? 0) / 100).toLocaleString('es-MX', { minimumFractionDigits: 0, maximumFractionDigits: 0 });

/** Con centavos, sólo para el desglose fiscal del estado de cuenta.
 *
 *  El portal enseña el dinero en pesos redondos a propósito: el cliente
 *  quiere saber cuánto lleva, no auditar. Pero el desglose es otra cosa: con
 *  «IVA incluido» el subtotal casi nunca es redondo —de $111,250 salen
 *  $95,905.17 y $15,344.83—, y redondeado se leería «95,905 + 15,345 =
 *  111,250», que no cuadra. En un papel que alguien va a pagar, tres
 *  renglones que no suman no son un detalle de formato. */
const pesos2 = (centavos) =>
  '$' + ((centavos ?? 0) / 100).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

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
  for (const v of ['v-correo', 'v-clave', 'v-codigo', 'v-nueva', 'v-cargando', 'v-general', 'v-detalle', 'v-obra', 'v-pieza']) $(v).hidden = v !== cual;
  window.scrollTo(0, 0);
}

/* LA OBRA, AQUÍ (Mike, 5-oct-2026: «Quiero que el único visor del cliente sea
 * Peek y que ahí mismo pueda ver el plano general y aparte contestar los
 * puntos de dudas. Y el generar sus propias dudas desde Peek»). Las pantallas
 * de la obra y de la pieza viven en obra.js; aquí se les presta lo que
 * necesitan y se les da su lugar en el «atrás». */
const ACTUAL = { i: null, obra: null, pieza: null };

/* EL «ATRÁS» DEL NAVEGADOR (Mike, 22-sep-2026).
 *
 * Antes, abrir un proyecto sólo cambiaba qué div estaba escondido: para el
 * navegador no pasaba nada, así que «atrás» sacaba del portal y el cliente
 * perdía la sesión de vista.
 *
 * Dos honduras bastan aquí: la lista de proyectos y el detalle de uno. Las
 * pantallas de entrada —correo, contraseña, código— no cuentan: son pasos
 * de un trámite, y dejar que «atrás» los recorra invita a meterse a medio
 * camino con el código ya gastado. */
const HONDURA = { general: 1, detalle: 2, obra: 3, pieza: 4 };
/* Quién pinta cada hondura cuando el navegador retrocede. La lista se
 * repinta a propósito: los números pudieron cambiar mientras el cliente
 * miraba el detalle. Desde el 5-oct hay cuatro honduras: la lista, el
 * proyecto, la obra (el plano) y una pieza; cada «atrás» sube una. */
alRetroceder((h) => {
  if (h >= HONDURA.obra && ACTUAL.obra) { pintarObra(ACTUAL.obra); return; }
  if (h === HONDURA.detalle && ACTUAL.i != null && DATOS?.proyectos?.[ACTUAL.i]) { pintarDetalle(ACTUAL.i); mostrar('v-detalle'); return; }
  pintarGeneral(); mostrar('v-general');
});

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
  finally { b.disabled = false; b.textContent = 'No tengo contraseña o la olvidé'; }
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
  // 0.17.2: con Google ligado no se le pide contraseña, ni al entrar con él ni
  // después con un código: Google ya es una forma de volver. Una API vieja no
  // manda `tiene_google` y entonces esto se comporta como antes.
    if (!yo.tiene_clave && !yo.tiene_google && yo.entro_con === 'codigo') {
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
    sellar(HONDURA.general);
    abrirDesdeLaLiga();
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

  pintarPendientes(DATOS.pendientes ?? []);
  $('g-excel').href = `${API}/orgs/${encodeURIComponent(ORG)}/clientes/${encodeURIComponent(cliente.id)}/estado.xlsx`;

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
  for (const b of $('g-proys').querySelectorAll('.proy')) b.onclick = () => abrirDetalle(+b.dataset.i);
}

/* Los puntos por definir, hasta arriba del inicio (Mike, 4-oct-2026). Vienen
 * en la misma respuesta de /peek —las dudas abiertas que el taller le hizo al
 * cliente en todas sus obras, la más vieja primero— y cada uno abre su pieza
 * en quell101, que es donde se contesta. Sin puntos, el bloque no se enseña:
 * un «no tienes nada pendiente» encima del dinero es ruido. */
function pintarPendientes(pend) {
  $('g-pendientes').hidden = !pend.length;
  if (!pend.length) { $('g-puntos').innerHTML = ''; return; }
  $('g-pend-t').textContent = pend.length === 1
    ? 'Un punto que el taller necesita que definas'
    : `${pend.length} puntos que el taller necesita que definas`;
  $('g-puntos').innerHTML = pend.map((d) => {
    const donde = [d.obra, d.codigo, d.pieza].filter(Boolean).map(esc).join(' · ');
    return `<button type="button" class="punto" data-obra="${esc(d.obra_id)}"${d.element_id ? ` data-pieza="${esc(d.element_id)}"` : ''}>
      <div class="t">${esc(d.texto)}</div>
      <div class="m">${donde}${donde ? ' · ' : ''}${fecha(d.created_at)}${d.quien ? ' · ' + esc(d.quien) : ''}</div>
      <div class="flecha">Responder →</div>
    </button>`;
  }).join('');
  // Cada punto abre su pieza aquí mismo (o la obra, si no cuelga de una).
  for (const b of $('g-puntos').querySelectorAll('.punto')) {
    b.onclick = () => (b.dataset.pieza ? abrirPieza(b.dataset.pieza, b.dataset.obra) : abrirObra(b.dataset.obra));
  }
}

/** Abrir el proyecto: pintarlo y bajar una hondura. `pintarDetalle` sólo
 *  pinta: también lo llama el «atrás» al volver desde la obra. */
function abrirDetalle(i) {
  pintarDetalle(i);
  irA(HONDURA.detalle, () => mostrar('v-detalle'));
}

function pintarDetalle(i) {
  ACTUAL.i = i;
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

  /* La obra (Mike, 5-oct: el plano y los puntos se ven AQUÍ): un botón, si el
   * proyecto tiene obra ligada. */
  if (p.obra) {
    $('d-obra').onclick = () => abrirObra(p.obra.id);
    $('d-obra-n').textContent = `Obra «${p.obra.nombre}»: el plano, cada pieza y los puntos por definir.`;
    $('d-obra-caja').hidden = false;
  } else {
    $('d-obra-caja').hidden = true;
  }

  const items = p.items ?? [];
  const sinEtapa = items.some((it) => it.etapa == null);
  $('d-etapas-nota').textContent = sinEtapa ? 'El avance de fabricación lo marca el taller.' : '';
  const conPieza = items.filter((it) => (it.piezas ?? []).length).length;
  $('d-items-nota').textContent = conPieza ? 'Toca un producto para ver su pieza en el plano, sus planos y sus puntos.' : '';
  $('d-items').innerHTML = items.length ? items.map((it) => {
    const et = it.etapa;
    const pasos = ETAPAS.map((nombre, k) =>
      `<i class="${et >= 7 ? 'fin' : (et != null && k < et ? 'on' : '')}" title="${esc(nombre)}"></i>`).join('');
    const fe = dia(it.fecha_entrega);
    const vencida = fe && fe < HOY && !(et >= 7);
    /* La pieza del plano que cuelga del ítem (0.66.0): el nombre abre la
     * pieza aquí —precio, planos, puntos por definir— y la columna de planos
     * dice cuántos tiene. Un ítem sin pieza en el plano se queda como texto:
     * no hay a dónde ir. */
    const pz = (it.piezas ?? [])[0];
    const docs = (it.piezas ?? []).reduce((s, x) => s + (Number(x.docs) || 0), 0);
    const datos = pz ? `data-pieza="${esc(pz.id)}" data-obra="${esc(pz.obra_id)}"` : '';
    const nombre = pz ? `<button type="button" class="pieza" ${datos}>${esc(it.nombre)}</button>` : esc(it.nombre);
    const planos = pz
      ? `<button type="button" class="planos" ${datos}>${docs ? `${docs} ${docs === 1 ? 'plano' : 'planos'}` : 'Ver la pieza'}</button>`
      : '<span class="item-m">—</span>';
    return `<tr>
      <td><div class="item-n">${nombre}</div>${it.clave ? `<div class="item-m num">${esc(it.clave)}</div>` : ''}</td>
      <td><div class="etapa"><span class="pasos">${pasos}</span><span${et == null ? ' style="color:var(--tinta-3)"' : ''}>${esc(nombreEtapa(et))}</span></div></td>
      <td class="fecha ${vencida ? 'tarde' : ''}">${fe ? fecha(it.fecha_entrega) : '—'}</td>
      <td>${planos}</td>
      <td class="r num">${pesos(it.monto)}</td>
    </tr>`;
  }).join('') : '<tr><td colspan="5" class="nota">Este proyecto todavía no tiene productos desglosados.</td></tr>';
  for (const b of $('d-items').querySelectorAll('[data-pieza]')) b.onclick = () => abrirPieza(b.dataset.pieza, b.dataset.obra);

  $('d-pagos').innerHTML = (pagos.length
    ? pagos.map((x) => `<tr><td class="fecha">${fecha(x.fecha)}</td><td>${esc(x.descripcion || 'Pago')}</td><td class="r num">${pesos(x.monto)}</td></tr>`).join('')
    : '<tr><td colspan="3" class="nota">Sin pagos registrados.</td></tr>')
    + `<tr><td colspan="2"><b>Total pagado</b></td><td class="r num"><b>${pesos(pagos.reduce((s, x) => s + (x.monto ?? 0), 0))}</b></td></tr>`;

  // La liga del Excel se puede poner enseguida: es la misma dirección
  // siempre. El desglose necesita una vuelta más y llega solo.
  $('d-excel').href = `${API}/orgs/${encodeURIComponent(ORG)}/proyectos/${encodeURIComponent(p.id)}/estado.xlsx`;
  ponerDesglose(p.id);

}

/* ─────────────── el desglose fiscal, del servidor ───────────────
 *
 * Mike, 21-sep: «necesito poder exportar un estado de cuenta en pdf y un
 * excel (…). Creo que esto es lo mismo que el cliente podría descargar desde
 * peek101». Tenía razón, y por eso esto NO SE CALCULA AQUÍ: sale de la misma
 * ruta que arma el documento del taller, así el papel que él manda y el que
 * baja el cliente no se pueden contradecir.
 *
 * Llega después de pintar y no antes para que el detalle se vea enseguida:
 * el desglose es un renglón más, no la pantalla. Y si la llamada falla, el
 * bloque simplemente no se enseña —la lista y los pagos, que es lo que el
 * cliente viene a ver, ya están—. Un portal que se queda en blanco porque no
 * pudo pintar el IVA es peor que uno sin IVA.
 */
async function ponerDesglose(proyecto_id) {
  const caja = $('d-desglose');
  caja.hidden = true;
  $('d-generado').textContent = '';
  try {
    const e = await pedir(`/orgs/${encodeURIComponent(ORG)}/proyectos/${encodeURIComponent(proyecto_id)}/estado`);
    const t = e.totales ?? {};
    // Sin IVA que enseñar —una obra al 0 %— el desglose sobra: tres renglones
    // que dicen el mismo número no aclaran nada.
    if (!t.iva) return;
    $('d-subtotal').textContent = pesos2(t.subtotal);
    $('d-iva-et').textContent = `IVA ${(t.tasa_iva ?? 1600) / 100} %`;
    $('d-iva').textContent = pesos2(t.iva);
    $('d-gran-total').textContent = pesos2(t.total);
    // El total y el saldo son los del documento: con IVA, que es lo que se
    // paga. Los de arriba venían sin él y decían otra cosa.
    $('d-total').textContent = pesos2(t.total);
    $('d-saldo').textContent = pesos2(t.saldo);
    $('d-generado').textContent = `Generado el ${fechaLarga(new Date(e.generado_at))}`;
    caja.hidden = false;
  } catch {
    /* Sin desglose. Lo demás ya está pintado. */
  }
}

/* Una liga del correo (los puntos por definir, la invitación) cae en la obra
 * o en una pieza: `#/obra/OBRA`, `#/pieza/PIEZA`. Se lee al entrar, una vez,
 * y se quita de la barra para que recargar no vuelva a abrirla. */
function abrirDesdeLaLiga() {
  const m = /^#\/(obra|pieza)\/([^/?#]+)/.exec(location.hash || '');
  if (!m) return;
  history.replaceState(history.state, '', location.pathname + location.search);
  const id = decodeURIComponent(m[2]);
  if (m[1] === 'obra') abrirObra(id); else abrirPieza(id);
}

montarObra({
  API, $, esc, fecha, pesos, nombreEtapa, mostrar, irA, HONDURA, ACTUAL,
  org: () => ORG,
  proyectoDeObra: (id) => (DATOS?.proyectos ?? []).find((p) => p.obra && p.obra.id === id) ?? null,
  recargarPeek: async () => { DATOS = await pedir(`/orgs/${encodeURIComponent(ORG)}/peek`); },
  falla: (e) => { alert(e.message || 'Algo no salió bien. Vuelve a intentar.'); mostrar(ACTUAL.i != null ? 'v-detalle' : 'v-general'); },
  /* Volver de la obra: al proyecto si se entró por él, si no al inicio. Y de
   * la pieza, a la obra. Las tres son `irA` hacia afuera, que es
   * `history.back()`: el historial queda igual que si se hubiera picado
   * «atrás», y el popstate pinta lo que toca. */
  volverDeObra: () => irA(ACTUAL.i != null ? HONDURA.detalle : HONDURA.general, () => {}),
  volverDePieza: () => irA(HONDURA.obra, () => {}),
});

/* «Volver» retrocede de verdad en vez de sólo cambiar de pantalla: si
 * escribiera una entrada nueva, el siguiente «atrás» reabriría el proyecto
 * que el cliente acaba de cerrar. */
$('volver').onclick = () => irA(HONDURA.general, () => { pintarGeneral(); mostrar('v-general'); });
/* El PDF lo hace el navegador, como en dash101: los estilos de `@media
 * print` quitan la barra y los botones, y dejan el documento. */
$('d-pdf').onclick = () => window.print();

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
