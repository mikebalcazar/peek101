/* Las ligas a quell101 y lo que el portal junta del cliente (4-oct-2026).
 *
 * Mike: «Juntemos dentro de Peek la info de su estado de cuenta y la info que
 * le aparece en quell». Lo que se mide sin red ni navegador:
 *
 *   · a dónde manda cada liga según dónde viva el portal: de
 *     `peek101.<dominio>` a `quell101.<dominio>`, y de cualquier otro lado
 *     —staging, el banco de pruebas— a la quell101 de STAGING, nunca a la
 *     de producción;
 *   · que las rutas sean las de quell101 (`#/p/OBRA`, `/dudas`, `/e/PIEZA`);
 *   · que la pantalla traiga los bloques nuevos cableados: los puntos por
 *     definir hasta arriba, la liga a la obra, la columna de planos y el
 *     Excel general.
 *
 *   node pruebas/ligas.mjs
 */
import { readFileSync } from 'node:fs';
import { sitioQuell, ligaObra, ligaPuntos, ligaPieza, ligaPunto } from '../public/ligas.js';

let fallas = 0, revisadas = 0;
const rev = (ok, texto, extra = '') => {
  revisadas++; if (!ok) fallas++;
  console.log(`  ${ok ? 'ok   ' : 'FALLA'} ${texto}${extra ? '  →  ' + extra : ''}`);
};

console.log('· a dónde manda, según dónde vive el portal');
rev(sitioQuell('https://peek101.taller101.com') === 'https://quell101.taller101.com', 'producción: peek101.taller101.com → quell101.taller101.com');
rev(sitioQuell('https://peek101.acme.com.mx/') === 'https://quell101.acme.com.mx', 'dominio propio de una empresa: peek101.X → quell101.X');
rev(sitioQuell('https://peek101-staging.mike-929.workers.dev') === 'https://bitacora-obra-staging.mike-929.workers.dev', 'staging → la quell101 de staging');
rev(sitioQuell('http://127.0.0.1:8789') === 'https://bitacora-obra-staging.mike-929.workers.dev', 'el banco de pruebas → staging, nunca producción');
rev(sitioQuell('no es una dirección') === 'https://bitacora-obra-staging.mike-929.workers.dev', 'y algo raro no truena: staging');

console.log('· las rutas son las de quell101');
const Q = 'https://quell101.taller101.com';
rev(ligaObra(Q, 'obra-1') === `${Q}/#/p/obra-1`, 'la obra: #/p/OBRA');
rev(ligaPuntos(Q, 'obra-1') === `${Q}/#/p/obra-1/dudas`, 'los puntos por definir: #/p/OBRA/dudas');
rev(ligaPieza(Q, 'obra-1', 'pieza 9') === `${Q}/#/p/obra-1/e/pieza%209`, 'la pieza: #/p/OBRA/e/PIEZA, con lo raro codificado');
rev(ligaPunto(Q, { obra_id: 'o', element_id: 'e' }) === `${Q}/#/p/o/e/e`, 'un punto con pieza abre la pieza');
rev(ligaPunto(Q, { obra_id: 'o', element_id: null }) === `${Q}/#/p/o/dudas`, 'y uno sin pieza abre los puntos de la obra');

console.log('· la pantalla trae lo nuevo, cableado');
const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8').replace(/<!--[\s\S]*?-->/g, '');
const js = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('../public/estilo.css', import.meta.url), 'utf8');
rev(/import \{ sitioQuell, ligaObra, ligaPieza, ligaPunto \} from '\.\/ligas\.js'/.test(js), 'app.js usa ligas.js');
const antesDeKpis = html.indexOf('id="g-pendientes"') < html.indexOf('<div class="kpis">');
rev(html.includes('id="g-pendientes"') && antesDeKpis, 'los puntos por definir van ANTES del dinero en el inicio');
rev(/pintarPendientes\(DATOS\.pendientes \?\? \[\]\)/.test(js), 'y se pintan de lo que trae /peek (pendientes)');
rev(/\$\('g-pendientes'\)\.hidden = !pend\.length/.test(js), 'sin puntos, el bloque no se enseña');
rev(/class="punto" href="\$\{esc\(ligaPunto\(QUELL, d\)\)\}" target="_blank"/.test(js), 'cada punto es una liga a quell101 que abre aparte');
rev(html.includes('id="d-obra"') && /\$\('d-obra'\)\.href = ligaObra\(QUELL, p\.obra\.id\)/.test(js), 'el detalle liga a la obra en quell101 cuando el proyecto la tiene');
rev(/<th>Planos<\/th>/.test(html) && /it\.piezas/.test(js) && /ligaPieza\(QUELL, pz\.obra_id, pz\.id\)/.test(js), 'la tabla trae la columna Planos y el producto abre su pieza en quell101');
rev(/colspan="5"/.test(js), 'y el renglón vacío cubre las cinco columnas');
rev(html.includes('id="g-excel"') && /\$\('g-excel'\)\.href = `\$\{API\}\/orgs\/\$\{encodeURIComponent\(ORG\)\}\/clientes\/\$\{encodeURIComponent\(cliente\.id\)\}\/estado\.xlsx`/.test(js), 'el Excel general apunta a /clientes/:id/estado.xlsx');
rev(/\.punto\{/.test(css) && /\.pendientes,\.obra-liga\{display:none !important\}/.test(css.replace(/\s+/g, ' ').replace(/, /g, ',')) || /\.pendientes,\.obra-liga/.test(css), 'los bloques nuevos tienen estilo y no salen en papel');

console.log(`\n${revisadas} revisadas · ${fallas} fallas`);
process.exit(fallas ? 1 : 0);
