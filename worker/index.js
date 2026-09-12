/* La puerta del Worker de peek101.
 *
 * Decisión D1: cada app vive en su propio Worker y le habla a `suite101-api`
 * desde su mismo origen, por `/s101/*`, con un *service binding*. La sesión
 * es una cookie `SameSite=None`; servida desde otro origen es cookie de
 * terceros y Safari la bloquea — o sea, todo iPhone, que es justo desde donde
 * un cliente abre su estado de cuenta. Desde el mismo origen la cookie es
 * propia y no hay CORS que configurar.
 *
 * El Worker pone `X-App: peek101`; la interfaz no lo manda, y si lo manda se
 * sobrescribe: la app no decide quién dice ser.
 *
 * Lo demás son archivos de `public/`, servidos tal cual por `env.ASSETS`. */

const PREFIJO = '/s101';

export default {
  async fetch(req, env) {
    const u = new URL(req.url);
    if (u.pathname === PREFIJO || u.pathname.startsWith(PREFIJO + '/')) {
      // `/s101/auth/codigo` → `/auth/codigo`. Un `/s101` pelón va a la raíz.
      u.pathname = u.pathname.slice(PREFIJO.length) || '/';
      const r = new Request(u, req);
      r.headers.set('X-App', 'peek101');
      return env.API.fetch(r);
    }
    return env.ASSETS.fetch(req);
  },
};
