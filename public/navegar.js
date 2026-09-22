/* El botón «atrás» del navegador, que hasta hoy sacaba de la app.
 *
 * Mike, 22-sep-2026: «en todas las apps, cuando picas el botón de back en el
 * navegador te saca hasta la página anterior (…). Queremos que cuando picas
 * back te regrese a la función anterior».
 *
 * Es el mismo módulo que quell101 (`web/src/navegar.js`), recortado a lo que
 * esta app necesita: aquí no hay React ni rutas, sólo pantallas que se
 * enseñan y se esconden.
 *
 * LA IDEA, QUE ES LA MISMA EN TODAS
 *
 * Cada pantalla tiene una HONDURA, y:
 *
 *   · ir más hondo empuja una entrada  → «atrás» regresa a donde estabas;
 *   · moverse al mismo nivel la reemplaza → alternar no acumula;
 *   · salir hacia afuera es `history.back()` → se consume la que había, en
 *     vez de apilar una tercera.
 *
 * La tercera es la que no es obvia: cerrar con el botón propio de la app
 * tiene que dejar el historial igual que si se hubiera picado «atrás». Si
 * no, el siguiente «atrás» reabre lo que la persona acaba de cerrar, y
 * parece que la app se devolvió sola.
 */

export const honduraActual = () => {
  const h = history.state && history.state.hondura;
  return typeof h === 'number' ? h : 0;
};

/** Apuntar dónde estamos sin movernos. Hace falta al caer en una pantalla
 *  sin haber navegado —al recargar, o al entrar con sesión ya puesta—:
 *  ahí el estado viene nulo y sin esto el módulo creería estar en el
 *  primer nivel. */
export function sellar(hondura) {
  if (honduraActual() === hondura && history.state) return;
  history.replaceState({ ...(history.state || {}), hondura }, '', null);
}

/** Moverse a una pantalla. `pinta` es lo que la app hace para enseñarla. */
export function irA(hondura, pinta) {
  const ahora = honduraActual();
  if (hondura > ahora) history.pushState({ hondura }, '', null);
  else if (hondura === ahora) history.replaceState({ hondura }, '', null);
  else { history.back(); return; }   // el popstate se encarga de pintar
  pinta();
}

/**
 * Enganchar el «atrás» del navegador.
 *
 * `alVolver(h)` recibe la hondura a la que se llegó y tiene que pintar esa
 * pantalla. Se llama una sola vez, al arrancar la app.
 */
export function alRetroceder(alVolver) {
  window.addEventListener('popstate', () => alVolver(honduraActual()));
}
