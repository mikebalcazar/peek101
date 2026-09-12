/* Los textos que la API no manda y que conviene tener en un solo lugar.
 *
 * Las siete etapas son las de SUPERVISOR, sin cambios, tal como las lista
 * `suite101-api/claude/suite101-arquitectura.md` §«Las 7 etapas»
 * (medido el 12-sep-2026). `etapa` llega de la API como un entero de 0 a 7:
 * 0 es «todavía no arranca» y 7 es «el cliente aceptó». La `clave` (M07)
 * nace en la etapa 4. */

export const ETAPAS = [
  'Diseño autorizado',      // 1 · el cliente firma el diseño
  'Anticipo pagado',        // 2 · entra el anticipo
  'Compra de materiales',   // 3 · material recibido en taller
  'Despiece y ensamble',    // 4 · embalado y etiquetado
  'Entrega',                // 5 · descargado en sitio
  'Instalación',            // 6 · colocado en su lugar
  'Cierre',                 // 7 · el cliente acepta
];

/** Qué se dice de un ítem según su etapa.
 *
 *  El nombre de la etapa alcanzada sale de la lista de arriba, tal cual: no
 *  se inventa ninguno. Lo único que no es un nombre de etapa son los dos
 *  extremos, y los dos describen un hecho, no una etapa: `0` es que todavía
 *  no se marca ninguna, y `null` es que la API no trajo el dato porque el
 *  taller no lo ha puesto. */
export function nombreEtapa(etapa) {
  if (etapa == null) return 'Sin dato del taller';
  if (etapa <= 0) return 'Por iniciar';
  return ETAPAS[Math.min(etapa, 7) - 1];
}

/** El estado comercial del proyecto, con palabras del cliente. */
export const ESTADOS = {
  planeando: ['En diseño', 'marca'],
  activo: ['En proceso', 'marca'],
  pausado: ['En pausa', ''],
  finiquito: ['Listo para cierre', 'aviso'],
  cerrado: ['Cerrado', 'ok'],
};

/** Los errores de la API, con palabras del cliente y no del programador. */
export const ERRORES = {
  codigo_invalido: 'Ese código no es. Revisa el correo y vuelve a intentar.',
  demasiados_intentos: 'Demasiados intentos. Espera un momento y vuelve a intentar.',
  sin_permiso: 'Ese correo no tiene portal. Pide a tu taller que te lo active.',
  sin_sesion: 'Tu sesión terminó. Vuelve a entrar.',
  org_inactiva: 'La cuenta de tu taller está pausada. Pregúntales a ellos.',
  app_inactiva: 'Tu taller no tiene el portal activo. Pregúntales a ellos.',
  usuario_desconocido: 'Ese correo no tiene portal. Pide a tu taller que te lo active.',
  correo_no_configurado: 'El envío de códigos no está disponible ahora. Intenta más tarde.',
  datos_invalidos: 'Revisa lo que escribiste.',
  no_encontrado: 'No encontramos tu estado de cuenta. Pide a tu taller que revise tu acceso.',
};
