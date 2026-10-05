/* La obra dentro de peek101 (5-oct-2026), medida sin red ni navegador.
 *
 * Mike: «Quiero que el único visor del cliente sea Peek y que ahí mismo pueda
 * ver el plano general y aparte contestar los puntos de dudas. Y el generar
 * sus propias dudas desde Peek».
 *
 * Lo que de verdad aporta: esta app no se empaqueta, así que un id mal
 * cableado no truena hasta que alguien le pica. Se revisa que cada id que
 * obra.js busca exista en el HTML, que las dos vistas nuevas las conozca
 * mostrar(), que las honduras del «atrás» sean cuatro, que todo hable con el
 * motor de obra de la suite (/quell/…) con las rutas de cliente, que los pines
 * vayan en la misma fracción del plano que en quell101, y que ya no quede
 * ninguna liga a quell101: el único visor del cliente es éste.
 *
 *   node pruebas/la-obra-en-peek.mjs
 */
import { readFileSync, existsSync } from 'node:fs';

let fallas = 0, revisadas = 0;
const rev = (ok, texto, extra = '') => {
  revisadas++; if (!ok) fallas++;
  console.log(`  ${ok ? 'ok   ' : 'FALLA'} ${texto}${extra ? '  →  ' + extra : ''}`);
};
/* Sólo los comentarios que ABREN al inicio de un renglón: `accept="image/*"`
 * dentro de una plantilla también dice «/*», y un recorte ingenuo se tragaba
 * media función (pasó en la primera corrida de esta prueba). */
const sinComentarios = (t) => t.replace(/^\s*\/\*[\s\S]*?\*\//gm, '').split('\n').filter((l) => !l.trimStart().startsWith('//')).join('\n');
const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8').replace(/<!--[\s\S]*?-->/g, '');
const app = sinComentarios(readFileSync(new URL('../public/app.js', import.meta.url), 'utf8'));
const obra = sinComentarios(readFileSync(new URL('../public/obra.js', import.meta.url), 'utf8'));
const css = readFileSync(new URL('../public/estilo.css', import.meta.url), 'utf8');

console.log('· el cableado de obra.js');
const ids = [...new Set([...obra.matchAll(/\$\('([a-z0-9-]+)'\)/g)].map((m) => m[1]))].sort();
const faltan = ids.filter((id) => !new RegExp(`id="${id}"`).test(html));
rev(ids.length >= 20 && faltan.length === 0, `los ${ids.length} ids que usa obra.js están en el HTML`, faltan.length ? `faltan: ${faltan.join(', ')}` : '');
const enMostrar = app.match(/for \(const v of \[([^\]]+)\]\) \$\(v\)\.hidden/)?.[1] ?? '';
rev(enMostrar.includes("'v-obra'") && enMostrar.includes("'v-pieza'"), 'mostrar() conoce v-obra y v-pieza');
rev(/const HONDURA = \{ general: 1, detalle: 2, obra: 3, pieza: 4 \};/.test(app), 'cuatro honduras: lista, proyecto, obra, pieza');
rev(/if \(h >= HONDURA\.obra && ACTUAL\.obra\) \{ pintarObra\(ACTUAL\.obra\); return; \}/.test(app), 'al volver con «atrás» a la obra se repinta la obra');
rev(/import \{ montarObra, abrirObra, abrirPieza, pintarObra \} from '\.\/obra\.js'/.test(app), 'app.js monta obra.js');

console.log('· habla con el motor de obra de la suite, por las rutas de cliente');
rev(/\/quell\$\{ruta\}/.test(obra), 'todo va a /orgs/:o/quell/…');
rev(/motor\(`\/projects\/\$\{encodeURIComponent\(id\)\}`\)/.test(obra) && /motor\(`\/projects\/\$\{encodeURIComponent\(id\)\}\/dudas`\)/.test(obra), 'la obra: el plano con sus piezas y sus puntos');
rev(/motor\(`\/elements\/\$\{encodeURIComponent\(id\)\}`\)/.test(obra) && /motor\(`\/elements\/\$\{encodeURIComponent\(id\)\}\/docs`\)/.test(obra), 'la pieza: su detalle y su documentación');
rev(/motor\(`\/dudas\/\$\{encodeURIComponent\(f\.dataset\.duda\)\}\/respuestas`, \{ method: 'POST', form: fd \}\)/.test(obra), 'contestar un punto: POST /dudas/:id/respuestas');
rev(/motor\(`\/projects\/\$\{encodeURIComponent\(obraId\)\}\/dudas`, \{ method: 'POST', form: fd \}\)/.test(obra), 'preguntar: POST /projects/:id/dudas');
rev(/fd\.append\('photos', f\)/.test(obra) && /fd\.append\('op_id', opId\(\)\)/.test(obra), 'con fotos («photos») y op_id, como lo espera el motor');
rev(/if \(piezaId\) fd\.append\('element_id', piezaId\);/.test(obra), 'una pregunta desde la pieza cuelga de la pieza');
rev(/\/quell\/files\/\$\{String\(llave\)\.split\('\/'\)\.map\(encodeURIComponent\)\.join\('\/'\)\}/.test(obra), 'los archivos salen del bucket de la suite, llave codificada por tramos');

console.log('· el plano se lee igual que en quell101');
rev(/left:\$\{\(Number\(e\.x\) \* 100\)\.toFixed\(2\)\}%;top:\$\{\(Number\(e\.y\) \* 100\)\.toFixed\(2\)\}%/.test(obra), 'los pines van en la misma fracción del ancho y del alto');
rev(/Mueble: '#2C5AA0', Puerta: '#B4622A', Acabado: '#4B7F52', Servicio: '#6B4E9B'/.test(obra), 'con los colores de tipo de quell101');
rev(/class="pin\$\{e\.definir > 0 \? ' definir' : ''\}/.test(obra) && /\.pin\.definir\{/.test(css), 'la pieza con puntos por definir se resalta');

console.log('· los puntos se contestan aquí y las preguntas nacen aquí');
rev(/<form class="responder" data-duda=/.test(obra), 'cada punto abierto trae su cuadro para contestar');
rev(/<form class="preguntar" id="o-preguntar">/.test(html) && /<form class="preguntar" id="p-preguntar">/.test(html), 'y hay «preguntar» en la obra y en la pieza');
rev(/data-estado="\$\{abierta \? 'abierta' : 'definida'\}"/.test(obra), 'cada punto dice si está abierto o definido');
rev(/<button type="button" class="punto" data-obra=/.test(app) && /b\.dataset\.pieza \? abrirPieza\(b\.dataset\.pieza, b\.dataset\.obra\) : abrirObra\(b\.dataset\.obra\)/.test(app), 'los puntos del inicio abren su pieza o su obra AQUÍ');
rev(/\$\('d-obra'\)\.onclick = \(\) => abrirObra\(p\.obra\.id\)/.test(app), 'el proyecto abre su obra aquí');
rev(/\^#\\\/\(obra\|pieza\)\\\/\(\[\^\/\?#\]\+\)/.test(app), 'una liga del correo (#/obra/ID, #/pieza/ID) cae en la obra o en la pieza');

console.log('· lo que llega tarde no se mete encima');
rev(/if \(ctx\.ACTUAL\.obra === id && !ctx\.\$\('v-obra'\)\.hidden\) pintarObraCargada\(n\)/.test(obra), 'el refresco de la obra sólo repinta si la obra sigue a la vista (defecto cazado el 5-oct)');
rev(/if \(!vista\.hidden\) pintarPiezaCargada\(p\)/.test(obra) && /if \(!vista\.hidden\) pintarObraCargada\(o\)/.test(obra), 'y lo mismo al recargar tras contestar o preguntar');

console.log('· el único visor del cliente');
rev(!existsSync(new URL('../public/ligas.js', import.meta.url)), 'ya no existe ligas.js');
rev(!/quell101\./.test(app) && !/quell101\./.test(obra), 'app.js y obra.js no mandan a ninguna dirección de quell101');
rev(!/target="_blank"[^>]*quell/.test(html), 'el HTML tampoco');

console.log(`\n${revisadas} revisadas · ${fallas} fallas`);
process.exit(fallas ? 1 : 0);
