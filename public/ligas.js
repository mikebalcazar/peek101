/* Las ligas de peek101 a quell101.
 *
 * Mike, 4-oct-2026: «para el cliente es muy tedioso irse metiendo a diferentes
 * plataformas (…) Juntemos dentro de Peek la info de su estado de cuenta y la
 * info que le aparece en quell». El estado de cuenta se queda aquí; el plano,
 * el avance de cada pieza y los puntos por definir viven en quell101, y desde
 * aquí se abren con una liga: la misma cuenta entra en las dos.
 *
 * LA DIRECCIÓN DE quell101 SE DEDUCE DE LA DE ESTE PORTAL, no se configura:
 * en producción las apps viven en `<app>.taller101.com`, y con el dominio
 * propio de una empresa (2-oct) en `<app>.<su dominio>`. `peek101.X` →
 * `quell101.X`, sea X lo que sea. Lo que no es un dominio propio —staging en
 * workers.dev, el banco de pruebas en 127.0.0.1— manda a la quell101 de
 * staging, nunca a la de producción: una prueba no debe abrir datos reales.
 *
 * Las rutas de quell101 son las de su `navegar.js`: `#/p/OBRA` el plano,
 * `#/p/OBRA/dudas` los puntos por definir, `#/p/OBRA/e/PIEZA` una pieza.
 * Si quell101 las cambia, cambia aquí y en la prueba (`pruebas/ligas.mjs`). */

const QUELL_STAGING = 'https://bitacora-obra-staging.mike-929.workers.dev';

export function sitioQuell(origen) {
  let h = '';
  try { h = new URL(origen).hostname.toLowerCase(); } catch { return QUELL_STAGING; }
  if (h.startsWith('peek101.')) return `https://quell101.${h.slice('peek101.'.length)}`;
  return QUELL_STAGING;
}

const seg = (x) => encodeURIComponent(String(x ?? ''));
export const ligaObra = (sitio, obra_id) => `${sitio}/#/p/${seg(obra_id)}`;
export const ligaPuntos = (sitio, obra_id) => `${sitio}/#/p/${seg(obra_id)}/dudas`;
export const ligaPieza = (sitio, obra_id, pieza_id) => `${sitio}/#/p/${seg(obra_id)}/e/${seg(pieza_id)}`;

/** A dónde manda un punto por definir: a su pieza si la tiene, si no a los
 *  puntos de la obra. */
export const ligaPunto = (sitio, d) => (d.element_id ? ligaPieza(sitio, d.obra_id, d.element_id) : ligaPuntos(sitio, d.obra_id));
