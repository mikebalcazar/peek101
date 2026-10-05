/* La obra dentro de peek101 (5-oct-2026).
 *
 * Mike: «Quiero que el único visor del cliente sea Peek y que ahí mismo pueda
 * ver el plano general y aparte contestar los puntos de dudas. Y el generar
 * sus propias dudas desde Peek».
 *
 * Hasta el 4-oct el portal mandaba a quell101 con ligas. Desde hoy la obra se
 * ve aquí: el plano con sus piezas, los puntos que el taller pidió definir
 * —y se contestan aquí—, las preguntas del cliente, y cada pieza con su
 * precio, su etapa y sus archivos. Los datos salen del MISMO motor de obra
 * que usa quell101 (`/orgs/:o/quell/*`, la cara de cliente, contrato 0.16.0 y
 * 0.66.0): aquí no hay otra base ni otra regla; el recorte de lo que el
 * cliente ve lo hace el servidor, y esta pantalla pinta lo que llega.
 *
 * Dos pantallas, dos honduras más del «atrás» (ver app.js):
 *
 *   v-obra   el plano, las piezas, los puntos por definir y «preguntar»
 *   v-pieza  una pieza: precio, etapa, entrega, archivos, sus puntos y preguntar
 *
 * Se llega desde el detalle del proyecto («Ver la obra», una pieza de la
 * lista), desde los puntos por definir del inicio, o por una liga del correo
 * (`#/obra/OBRA`, `#/pieza/PIEZA`). */

let ctx = null;            // lo que presta app.js: $, esc, fecha, pesos, ORG…
const CACHE = { obras: {}, piezas: {} };

/* ─────────────── el motor de obra ─────────────── */

/** Una llamada al motor de quell, que contesta «pelón» (sin {ok, data}):
 *  `{ error }` cuando falla. Con `form` manda un FormData (fotos). */
async function motor(ruta, { method = 'GET', form = null } = {}) {
  const r = await fetch(`${ctx.API}/orgs/${encodeURIComponent(ctx.org())}/quell${ruta}`, {
    method, body: form, credentials: 'include',
  });
  let cuerpo = null;
  try { cuerpo = await r.json(); } catch { /* no vino JSON */ }
  if (!r.ok) throw new Error(cuerpo?.error || cuerpo?.mensaje || 'Algo no salió bien. Vuelve a intentar.');
  return cuerpo ?? {};
}

/** La dirección de un archivo del bucket de la obra (plano, foto, documento).
 *  La llave lleva diagonales: se codifica tramo por tramo, no entera. */
export const archivo = (llave) => `${ctx.API}/orgs/${encodeURIComponent(ctx.org())}/quell/files/${String(llave).split('/').map(encodeURIComponent).join('/')}`;

/* Los colores de los tipos de pieza son los de quell101 (web/src/api.js,
 * TIPOS): el mismo plano tiene que leerse igual en las dos pantallas. */
const TINTES = { Mueble: '#2C5AA0', Puerta: '#B4622A', Acabado: '#4B7F52', Servicio: '#6B4E9B', Requerimiento: '#C9A227' };
const tinte = (t) => TINTES[t] || '#1C3557';

const esc = (s) => ctx.esc(s);
const hora = (iso) => (iso ? new Date(iso).toLocaleString('es-MX', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '');
const opId = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random());

/* ─────────────── los puntos (dudas) ─────────────── */

/** Una duda, pintada igual en la obra y en la pieza. El punto del taller trae
 *  «Por definir» y el cuadro para contestar; la pregunta del cliente dice
 *  «Esperando al taller». Lo definido se pliega abajo. */
function tarjetaDuda(d, { enPieza = false } = {}) {
  const abierta = d.estado === 'abierta';
  const delTaller = d.quien_rol !== 'cli';
  const fotos = (ps) => (ps?.length ? `<div class="fotos">${ps.map((p) => `<a href="${esc(archivo(p.r2_key))}" target="_blank" rel="noopener"><img src="${esc(archivo(p.r2_key))}" alt="${esc(p.file_name || 'foto')}" loading="lazy"></a>`).join('')}</div>` : '');
  const estado = !abierta ? '<span class="chip ok">Definido</span>' : delTaller ? '<span class="chip aviso">Por definir</span>' : '<span class="chip marca">Esperando al taller</span>';
  const sobre = !enPieza && d.element_id
    ? `<button type="button" class="liga" data-pieza="${esc(d.element_id)}" data-obra="${esc(d.project_id)}">Sobre ${d.element_code ? esc(d.element_code) + ' · ' : ''}${esc(d.element_name || 'la pieza')}</button>`
    : '';
  const respuestas = (d.respuestas || []).map((r) => `
    <div class="respuesta"><div class="q"><b>${esc(r.quien)}</b>${r.quien_rol === 'cli' ? ' <span class="chip">tú</span>' : ''} <span class="cuando">${hora(r.created_at)}</span></div>
      ${r.texto ? `<p>${esc(r.texto)}</p>` : ''}${fotos(r.photos)}</div>`).join('');
  const responder = abierta ? `
    <form class="responder" data-duda="${esc(d.id)}">
      <textarea rows="2" placeholder="${delTaller ? 'Tu respuesta…' : 'Agregar algo…'}"></textarea>
      <div class="acciones">
        <label class="adjuntar"><input type="file" accept="image/*" multiple hidden>📷 Foto<span class="nfotos"></span></label>
        <button type="submit" class="btn chico">${delTaller ? 'Responder' : 'Agregar'}</button>
      </div>
      <div class="err"></div>
    </form>` : '';
  return `<article class="duda ${abierta ? 'abierta' : 'cerrada'}" data-duda="${esc(d.id)}" data-estado="${abierta ? 'abierta' : 'definida'}">
    <div class="q"><b>${esc(d.quien || 'Taller')}</b>${!delTaller ? ' <span class="chip">tú</span>' : ''} <span class="cuando">${hora(d.created_at)}</span> ${estado}</div>
    ${d.texto ? `<p class="t">${esc(d.texto)}</p>` : ''}
    ${fotos(d.photos)}
    ${sobre}
    ${respuestas}
    ${responder}
  </article>`;
}

/** La lista: abiertas arriba, las definidas plegadas con un botón. */
function pintarDudas(caja, dudas, opciones) {
  const abiertas = dudas.filter((d) => d.estado === 'abierta');
  const cerradas = dudas.filter((d) => d.estado !== 'abierta');
  caja.innerHTML = (abiertas.length ? abiertas.map((d) => tarjetaDuda(d, opciones)).join('') : '<p class="nota vacio">Nada por definir aquí.</p>')
    + (cerradas.length ? `<button type="button" class="volver ver-definidos" data-n="${cerradas.length}">Ver ${cerradas.length} ${cerradas.length === 1 ? 'definido' : 'definidos'}</button><div class="definidos" hidden>${cerradas.map((d) => tarjetaDuda(d, opciones)).join('')}</div>` : '');
  const ver = caja.querySelector('.ver-definidos');
  if (ver) ver.onclick = () => { const c = caja.querySelector('.definidos'); c.hidden = !c.hidden; ver.textContent = c.hidden ? `Ver ${ver.dataset.n} definidos` : 'Ocultar definidos'; };
}

/** Un formulario con textarea, fotos y botón: lo que manda y a dónde. */
function engancharFormulario(form, enviar) {
  const archivos = form.querySelector('input[type=file]');
  const nfotos = form.querySelector('.nfotos');
  if (archivos) archivos.onchange = () => { nfotos.textContent = archivos.files.length ? ` (${archivos.files.length})` : ''; };
  form.onsubmit = async (ev) => {
    ev.preventDefault();
    const texto = form.querySelector('textarea').value.trim();
    const fotos = archivos ? [...archivos.files] : [];
    const err = form.querySelector('.err');
    if (!texto && !fotos.length) { err.textContent = 'Escribe algo o manda una foto.'; return; }
    const b = form.querySelector('button[type=submit]'); const antes = b.textContent;
    b.disabled = true; b.textContent = 'Mandando…'; err.textContent = '';
    try {
      const fd = new FormData();
      fd.append('op_id', opId());
      fd.append('texto', texto);
      for (const f of fotos) fd.append('photos', f);
      await enviar(fd);
    } catch (e) {
      err.textContent = e.message;
      b.disabled = false; b.textContent = antes;
    }
  };
}

/* ─────────────── la obra ─────────────── */

async function cargarObra(id) {
  const [obra, dudas] = await Promise.all([motor(`/projects/${encodeURIComponent(id)}`), motor(`/projects/${encodeURIComponent(id)}/dudas`)]);
  CACHE.obras[id] = { ...obra, dudas: dudas.dudas || [], plano: CACHE.obras[id]?.plano ?? null };
  return CACHE.obras[id];
}

function pintarPlano(o) {
  const $ = ctx.$;
  const planos = o.plans || [];
  const actual = planos.find((p) => p.id === o.plano) || planos[0] || null;
  $('o-planos').innerHTML = planos.length > 1
    ? planos.map((p) => `<button type="button" class="chip ${p.id === actual.id ? 'marca' : ''}" data-plano="${esc(p.id)}">${esc(p.name)}</button>`).join('')
    : '';
  for (const b of $('o-planos').querySelectorAll('[data-plano]')) b.onclick = () => { o.plano = b.dataset.plano; pintarPlano(o); };
  if (!actual) {
    $('o-plano').innerHTML = '<p class="nota vacio">El taller todavía no ha subido el plano de esta obra.</p>';
    $('o-piezas').innerHTML = '';
    return;
  }
  const piezas = (o.elements || []).filter((e) => e.plan_id === actual.id);
  /* El plano es la imagen que subió el taller (ya girada como se ve en quell101)
   * y cada pieza va encima como un pin, en la misma fracción del ancho y del
   * alto que en quell101: el plano se lee igual en las dos pantallas. */
  $('o-plano').innerHTML = `<div class="hoja"><img src="${esc(archivo(actual.image_key))}" alt="Plano ${esc(actual.name)}" width="${Number(actual.width) || ''}" height="${Number(actual.height) || ''}">
    <div class="pines">${piezas.map((e) => `<button type="button" class="pin${e.definir > 0 ? ' definir' : ''}${e.alcance && e.alcance !== 'dentro' ? ' fuera' : ''}" style="left:${(Number(e.x) * 100).toFixed(2)}%;top:${(Number(e.y) * 100).toFixed(2)}%;--tinte:${tinte(e.type)}" data-pieza="${esc(e.id)}" data-obra="${esc(o.project.id)}" title="${esc(e.code || '')} · ${esc(e.name || '')}"><span>${esc(e.code || '•')}</span></button>`).join('')}</div></div>
    <p class="nota leyenda-plano"><i class="muestra"></i> una pieza · <i class="muestra definir"></i> con puntos por definir · toca un pin para abrir la pieza${planos.length > 1 ? ` · plano «${esc(actual.name)}»` : ''}</p>
    <a class="volver" href="${esc(archivo(actual.image_key))}" target="_blank" rel="noopener">Abrir el plano en grande</a>`;
  $('o-piezas').innerHTML = piezas.length ? piezas.map((e) => `<button type="button" class="pieza-fila" data-pieza="${esc(e.id)}" data-obra="${esc(o.project.id)}">
      <i class="muestra" style="background:${tinte(e.type)}"></i>
      <span class="cod num">${esc(e.code || '')}</span><span class="n">${esc(e.name || '')}</span>
      ${e.definir > 0 ? `<span class="chip aviso">${e.definir} por definir</span>` : ''}<span class="flecha">→</span>
    </button>`).join('') : '<p class="nota vacio">Este plano todavía no tiene piezas.</p>';
}

function pintarObraCargada(o) {
  const $ = ctx.$;
  const proyecto = ctx.proyectoDeObra(o.project.id);
  $('o-nombre').textContent = o.project.name;
  $('o-sub').textContent = proyecto ? `Proyecto ${proyecto.nombre}` : (o.project.client || '');
  $('o-volver').textContent = proyecto ? '← Volver al proyecto' : '← Volver al estado de cuenta';
  pintarPlano(o);
  const abiertas = o.dudas.filter((d) => d.estado === 'abierta' && d.quien_rol !== 'cli').length;
  $('o-puntos-t').textContent = abiertas ? `${abiertas} ${abiertas === 1 ? 'punto' : 'puntos'} que el taller necesita que definas` : 'Puntos por definir';
  pintarDudas($('o-puntos'), o.dudas, { enPieza: false });
  engancharTodo($('v-obra'), o.project.id, null);
  ctx.mostrar('v-obra');
}

export async function abrirObra(id) {
  ctx.ACTUAL.obra = id;
  ctx.mostrar('v-cargando');
  try {
    const o = await cargarObra(id);
    ctx.irA(ctx.HONDURA.obra, () => pintarObraCargada(o));
  } catch (e) { ctx.falla(e); }
}

/** Repintar al volver con «atrás»: de lo guardado, y se refresca atrás.
 *
 *  El refresco llega tarde y SÓLO repinta si la obra sigue a la vista: si
 *  el cliente ya se devolvió al proyecto, repintar aquí volvería a poner la
 *  obra encima. Pasó en la prueba de navegador el 5-oct: el «atrás» al
 *  proyecto se veía bien un instante y luego reaparecía el plano. */
export async function pintarObra(id) {
  const o = CACHE.obras[id];
  if (o) {
    pintarObraCargada(o);
    cargarObra(id).then((n) => { if (ctx.ACTUAL.obra === id && !ctx.$('v-obra').hidden) pintarObraCargada(n); }).catch(() => {});
    return;
  }
  try { pintarObraCargada(await cargarObra(id)); } catch (e) { ctx.falla(e); }
}

/* ─────────────── la pieza ─────────────── */

async function cargarPieza(id) {
  const pieza = await motor(`/elements/${encodeURIComponent(id)}`);
  let docs = null;
  try { docs = await motor(`/elements/${encodeURIComponent(id)}/docs`); } catch { /* sin documentación, o sin permiso: se dice abajo */ }
  CACHE.piezas[id] = { ...pieza, docs };
  return CACHE.piezas[id];
}

function pintarPiezaCargada(p) {
  const $ = ctx.$;
  const e = p.element;
  $('p-eyebrow').textContent = [e.type, e.code].filter(Boolean).join(' · ');
  $('p-nombre').textContent = e.name || 'Pieza';
  $('p-sub').textContent = [e.plan_name, e.alcance && e.alcance !== 'dentro' ? 'fuera del alcance' : ''].filter(Boolean).join(' · ');

  /* Lo del ítem que es suyo (0.66.0): precio, etapa, entrega y descripción.
   * Una pieza sin ítem ligado no trae nada de esto, y el bloque no sale. */
  const hay = e.item_monto != null || e.item_etapa != null || e.item_fecha_entrega || e.item_descripcion;
  $('p-del-item').hidden = !hay;
  $('p-precio').textContent = e.item_monto != null ? ctx.pesos(e.item_monto) : '—';
  $('p-precio').parentElement.hidden = e.item_monto == null;
  $('p-etapa').textContent = e.item_etapa != null ? ctx.nombreEtapa(e.item_etapa) : '—';
  $('p-etapa').parentElement.hidden = e.item_etapa == null;
  const falta = e.item_entrega_falta;
  $('p-entrega').textContent = e.item_fecha_entrega ? ctx.fecha(e.item_fecha_entrega) : '—';
  $('p-entrega-d').textContent = typeof falta === 'number' ? (falta > 0 ? `en ${falta} ${falta === 1 ? 'día' : 'días'}` : falta === 0 ? 'hoy' : `hace ${-falta} ${falta === -1 ? 'día' : 'días'}`) : '';
  $('p-entrega').parentElement.hidden = !e.item_fecha_entrega;
  $('p-desc').textContent = e.item_descripcion || '';
  $('p-desc').hidden = !e.item_descripcion;

  /* Los archivos del ítem: el plano principal (con las notas que el taller le
   * clavó) y los de soporte. Se abren en otra pestaña: el navegador ya sabe
   * enseñar un PDF o una foto, y aquí no se anota nada. */
  const d = p.docs;
  const notas = (d?.marcas || []).filter((m) => m.tipo === 'nota' && m.texto);
  const docLiga = (x, rotulo) => `<a class="doc" href="${esc(archivo(x.r2_key))}" target="_blank" rel="noopener"><span class="rot">${rotulo}</span><b>${esc(x.nombre || 'Documento')}</b>${x.version > 1 ? `<span class="nota">versión ${x.version}</span>` : ''}</a>`;
  $('p-docs').innerHTML = !d
    ? '<p class="nota vacio">La documentación de esta pieza no está disponible.</p>'
    : (d.principal || d.soporte?.length)
      ? `${d.principal ? docLiga(d.principal, 'Plano principal') : ''}
         ${d.principal && /^image\//.test(d.principal.mime || '') ? `<a href="${esc(archivo(d.principal.r2_key))}" target="_blank" rel="noopener"><img class="plano-item" src="${esc(archivo(d.principal.r2_key))}" alt="${esc(d.principal.nombre || 'Plano')}" loading="lazy"></a>` : ''}
         ${notas.length ? `<div class="notas"><p class="eyebrow">Notas del taller en el plano</p><ul>${notas.map((n) => `<li>${esc(n.texto)}</li>`).join('')}</ul></div>` : ''}
         ${(d.soporte || []).map((x) => docLiga(x, 'Soporte')).join('')}`
      : '<p class="nota vacio">Cuando el taller suba el plano de esta pieza, aparece aquí.</p>';

  const abiertas = (p.dudas || []).filter((x) => x.estado === 'abierta' && x.quien_rol !== 'cli').length;
  $('p-puntos-t').textContent = abiertas ? `${abiertas} ${abiertas === 1 ? 'punto' : 'puntos'} por definir en esta pieza` : 'Puntos de esta pieza';
  pintarDudas($('p-puntos'), p.dudas || [], { enPieza: true });
  engancharTodo($('v-pieza'), e.project_id || ctx.ACTUAL.obra, e.id);
  ctx.mostrar('v-pieza');
}

export async function abrirPieza(id, obraId = null) {
  ctx.ACTUAL.pieza = id;
  if (obraId) ctx.ACTUAL.obra = obraId;
  ctx.mostrar('v-cargando');
  try {
    const p = await cargarPieza(id);
    if (p.element?.project_id) ctx.ACTUAL.obra = p.element.project_id;
    ctx.irA(ctx.HONDURA.pieza, () => pintarPiezaCargada(p));
  } catch (e) { ctx.falla(e); }
}

/* ─────────────── los botones y formularios de las dos pantallas ─────────────── */

function engancharTodo(vista, obraId, piezaId) {
  for (const b of vista.querySelectorAll('[data-pieza]')) b.onclick = () => abrirPieza(b.dataset.pieza, b.dataset.obra || obraId);
  // Tras contestar o preguntar: lo nuevo del motor, y los pendientes del
  // inicio. Sólo se repinta si esa pantalla sigue a la vista.
  const recargar = async () => {
    await ctx.recargarPeek().catch(() => {});
    if (piezaId) { const p = await cargarPieza(piezaId); if (!vista.hidden) pintarPiezaCargada(p); }
    else { const o = await cargarObra(obraId); if (!vista.hidden) pintarObraCargada(o); }
  };
  for (const f of vista.querySelectorAll('form.responder')) {
    engancharFormulario(f, async (fd) => { await motor(`/dudas/${encodeURIComponent(f.dataset.duda)}/respuestas`, { method: 'POST', form: fd }); await recargar(); });
  }
  const preguntar = vista.querySelector('form.preguntar');
  if (preguntar) {
    engancharFormulario(preguntar, async (fd) => {
      if (piezaId) fd.append('element_id', piezaId);
      await motor(`/projects/${encodeURIComponent(obraId)}/dudas`, { method: 'POST', form: fd });
      preguntar.querySelector('textarea').value = '';
      const inp = preguntar.querySelector('input[type=file]'); if (inp) { inp.value = ''; preguntar.querySelector('.nfotos').textContent = ''; }
      await recargar();
    });
  }
}

/* ─────────────── arranque ─────────────── */

export function montarObra(contexto) {
  ctx = contexto;
  ctx.$('o-volver').onclick = () => ctx.volverDeObra();
  ctx.$('p-volver').onclick = () => ctx.volverDePieza();
}
