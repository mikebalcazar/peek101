/* El «atrás» del navegador en el portal del cliente.
 *
 * Mike, 22-sep-2026: «en todas las apps, cuando picas el botón de back en el
 * navegador te saca hasta la página anterior (…). Queremos que cuando picas
 * back te regrese a la función anterior».
 *
 * Aquí duele distinto que en las demás: el que lo sufre es el CLIENTE del
 * taller, que abre el portal desde una liga del correo, entra a un proyecto
 * y al picar atrás salía del portal y tenía que volver a entrar. No es una
 * molestia de uso interno: es la cara que ve quien paga.
 *
 * POR QUÉ SE MIDE CON UN HISTORIAL DE MENTIRAS
 *
 * El recorrido en navegador de este repo corre contra staging, que desde
 * aquí no se alcanza. Pero lo delicado no es el navegador: es la CUENTA de
 * entradas. Un `pushState` de más obliga a picar atrás dos veces; uno de
 * menos saca del portal. Las dos se ven igual de bien en la pantalla y sólo
 * se notan al caminar el recorrido, así que se camina contando.
 *
 *   node pruebas/el-atras.mjs
 */

import { readFileSync } from 'node:fs';

let fallas = 0, revisadas = 0;
const rev = (ok, texto, extra = '') => {
  revisadas++; if (!ok) fallas++;
  console.log(`  ${ok ? 'ok   ' : 'FALLA'} ${texto}${extra ? '  →  ' + extra : ''}`);
};

function navegadorFalso() {
  const pila = [{ estado: null }];
  let i = 0;
  const oyentes = [];
  const history = {
    get state() { return pila[i].estado; },
    pushState(estado) { pila.splice(i + 1); pila.push({ estado }); i = pila.length - 1; },
    replaceState(estado) { pila[i] = { estado }; },
    back() { if (i > 0) { i--; oyentes.slice().forEach((f) => f()); } },
  };
  return {
    history,
    addEventListener: (qué, f) => { if (qué === 'popstate') oyentes.push(f); },
    cuantas: () => pila.length,
    // En qué entrada estamos parados. Retroceder NO acorta la pila —la
    // entrada de adelante sigue ahí, como en un navegador de verdad, para
    // poder dar «adelante»—, así que para saber si volvimos al mismo sitio
    // hay que mirar la posición y no el largo.
    posicion: () => i,
  };
}

const g = navegadorFalso();
globalThis.history = g.history;
globalThis.window = { addEventListener: g.addEventListener };
const { irA, sellar, alRetroceder } = await import('../public/navegar.js');

const HONDURA = { general: 1, detalle: 2 };
let pantalla = '';
alRetroceder((h) => { if (h <= HONDURA.general) pantalla = 'general'; });

console.log('· el cliente entra a su portal y abre un proyecto');
pantalla = 'general';
sellar(HONDURA.general);
const alEntrar = g.posicion();
irA(HONDURA.detalle, () => { pantalla = 'detalle'; });
rev(pantalla === 'detalle', 'se abre el detalle del proyecto');
rev(g.posicion() === alEntrar + 1, 'y deja una entrada en el historial', `${g.posicion()} vs ${alEntrar}`);

console.log('· «atrás» regresa a sus proyectos, no lo saca del portal');
g.history.back();
rev(pantalla === 'general', 'atrás lo regresa a la lista de proyectos');
rev(g.posicion() === alEntrar, 'y queda parado donde estaba al entrar', `${g.posicion()} vs ${alEntrar}`);

console.log('· «Volver» hace lo mismo que atrás, no algo parecido');
/* Si «Volver» escribiera una entrada nueva, el siguiente atrás reabriría el
 * proyecto que el cliente acaba de cerrar y parecería que el portal se
 * devolvió solo. */
irA(HONDURA.detalle, () => { pantalla = 'detalle'; });
const conDetalle = g.posicion();
irA(HONDURA.general, () => { pantalla = 'general'; });
rev(pantalla === 'general', 'el botón «Volver» regresa a la lista');
rev(g.posicion() === conDetalle - 1, 'sin apilar una entrada de más: retrocede', `${g.posicion()} vs ${conDetalle}`);

console.log('· abrir dos proyectos seguidos no acumula');
irA(HONDURA.detalle, () => { pantalla = 'detalle'; });
const unProyecto = g.posicion();
irA(HONDURA.detalle, () => { pantalla = 'detalle'; });   // picar otro desde el detalle
rev(g.posicion() === unProyecto, 'cambiar de proyecto reemplaza, no apila', `${g.posicion()} vs ${unProyecto}`);
g.history.back();
rev(pantalla === 'general', 'y un solo atrás regresa a la lista');

console.log('· la pantalla está cableada a esto');
const app = readFileSync('public/app.js', 'utf8');
rev(/import \{ irA, sellar, alRetroceder \} from '\.\/navegar\.js'/.test(app), 'el portal usa el módulo');
rev(/irA\(HONDURA\.detalle/.test(app), 'abrir un proyecto entra más hondo');
rev(/alRetroceder\(/.test(app), 'y el «atrás» del navegador está enganchado');
rev(!/\$\('volver'\)\.onclick = \(\) => \{ pintarGeneral\(\); mostrar\('v-general'\); \};/.test(app),
    '«Volver» ya no cambia de pantalla por su cuenta');

console.log('· las pantallas de entrada NO entran al historial');
/* Correo, contraseña y código son pasos de un trámite. Si «atrás» los
 * recorriera, el cliente podría meterse a media entrada con un código ya
 * gastado y creer que el portal se descompuso. */
rev(!/irA\([^)]*v-codigo|irA\([^)]*v-clave/.test(app), 'ni el código ni la contraseña apilan');

console.log(`\n${revisadas} revisadas · ${fallas} fallas`);
process.exit(fallas ? 1 : 0);
